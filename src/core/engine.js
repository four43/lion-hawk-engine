// The engine core (spec §5): scenes with sim halves (S-1…S-5), the step pipeline over named stages (R-6), input
// applied once per step (I-4), the UI registry (U-1), events, seeded rng streams and the fixed-step loop (R-1…R-7).
// Sim-pure: the browser driver, devices and DOM rendering live in the view half (phase 2b).
import { rng } from './rng.js';
import { createEvents } from './events.js';
import { createSchedule, STEP_STAGES } from './schedule.js';
import { createLoop } from './loop.js';
import { actions as defineActions, createInput } from './actions.js';
import { createUi } from './ui.js';
import { checkFields, checkSchema, wireCodec } from '../sim/schema.js';
import { createRegistry } from '../sim/replica.js';
import { installWorld, checkPhysics } from '../sim/world/install.js';
import { installNet } from '../sim/net/install.js';

// [I-7] reserved keys a port sets on any command's data (#77); a schema may not declare them
const RESERVED = { from: v => typeof v === 'string', at: Number.isFinite, reliable: v => typeof v === 'boolean' };
const RESERVED_TYPE = { from: 'a string', at: 'a finite number', reliable: 'a boolean' };

const HOOKS = ['enter', 'exit', 'step', 'ui'];
export function defineGame(spec) {
  const fail = m => { throw new Error(`defineGame: ${m}`); };
  if (typeof spec.id !== 'string' || !spec.id) fail('id must be a non-empty string');
  if (!spec.scenes || !Object.keys(spec.scenes).length) fail('scenes must not be empty');
  if (spec.setup !== undefined && typeof spec.setup !== 'function') fail('setup must be a function');
  if (spec.reset !== undefined && typeof spec.reset !== 'function') fail('reset must be a function');
  if (!(spec.start in spec.scenes)) fail(`start '${spec.start}' is not a scene`);
  // [I-7] a command is a handler, or { schema, handler } (N-3: checked at issue); game.commands keeps the handlers, game.schemas the schemas
  const commands = {}, schemas = {};
  for (const [k, c] of Object.entries(spec.commands ?? {})) {
    if (typeof c === 'function') { commands[k] = c; continue; }
    if (c === null || typeof c !== 'object' || typeof c.handler !== 'function') fail(`commands.${k} must be a function or { schema, handler }`);
    try { checkFields(c.schema, `commands.${k}.schema`); } catch (err) { fail(err.message); }
    for (const r in RESERVED) if (Object.hasOwn(c.schema, r)) fail(`commands.${k}.schema may not declare reserved key '${r}'`);
    commands[k] = c.handler; schemas[k] = c.schema;
  }
  for (const [name, s] of Object.entries(spec.scenes)) for (const h of HOOKS) if (h in s && typeof s[h] !== 'function') fail(`scene '${name}'.${h} must be a function`);
  if (spec.physics !== undefined) checkPhysics(spec.physics, fail); // §4.1: gravity, params and groups checked at definition
  const sim = { hz: 60, maxCatchUp: 3, maxFrame: 0.25, ...spec.sim };
  for (const k of ['hz', 'maxCatchUp']) if (typeof sim[k] !== 'number' || !(sim[k] > 0) || !Number.isFinite(sim[k])) fail(`sim.${k} must be a positive number`);
  const net = spec.net === undefined ? undefined : netConfig(spec.net, schemas, fail);
  return Object.freeze({ ...spec, sim, actions: spec.actions ?? defineActions({}), policies: spec.policies ?? {}, commands, schemas, net });
}
// the game net config (N-3): every limit a port applies, and every wire tag naming a schema'd command (built once to check it)
function netConfig(n, schemas, fail) {
  if (n === null || typeof n !== 'object') fail('net must be an object');
  const c = { maxJson: 2048, maxFrame: 16384, codec: 'json', ...n };
  const pos = (v, p, int) => { if (typeof v !== 'number' || !(v > 0) || !Number.isFinite(v) || (int && !Number.isInteger(v))) fail(`${p} must be a positive ${int ? 'integer' : 'number'}`); };
  if (!Array.isArray(c.kinds)) fail('net.kinds must be an array of kinds');
  if (!Number.isInteger(c.maxSender) || c.maxSender < 1 || c.maxSender > 255) fail('net.maxSender must be an integer in 1..255');
  try { createRegistry(c.kinds, { maxSender: c.maxSender }); } catch (err) { fail(`net.kinds: ${err.message}`); }
  pos(c.maxJson, 'net.maxJson', true); pos(c.maxFrame, 'net.maxFrame', true);
  if (c.codec !== 'json' && c.codec !== 'binary') fail("net.codec must be 'json' or 'binary'");
  for (const [role, keys] of [['host', ['reliable', 'fast', 'reliableFrames']], ['guest', ['reliable', 'fast']]]) {
    const r = c.rates?.[role]; if (r === null || typeof r !== 'object') fail(`net.rates.${role} must be an object`);
    for (const k of keys) if (k !== 'reliableFrames' || r[k] !== undefined) pos(r[k], `net.rates.${role}.${k}`);
  }
  for (const dir of ['toHost', 'toGuest']) {
    const w = c.wire?.[dir]; if (w === null || typeof w !== 'object') fail(`net.wire.${dir} must be an object`);
    const table = {};
    for (const [tag, type] of Object.entries(w)) { if (!Object.hasOwn(schemas, type)) fail(`net.wire.${dir}.${tag}: '${type}' is not a command with a schema`); table[tag] = schemas[type]; }
    try { wireCodec(table, { codec: c.codec }); } catch (err) { fail(`net.wire.${dir}: ${err.message}`); }
  }
  return Object.freeze(c);
}

export function createEngine(game, { seed = 1, scene = game.start, args, acks = 'steps', record = false, wall0 = 0, timer = null } = {}) {
  game.reset?.(); // #108: module tunables back to their shipped values first, so every engine (a replay, each mp() peer) starts from them
  if (typeof wall0 !== 'number' || !Number.isFinite(wall0)) throw new Error('engine: wall0 must be a finite number');
  if (acks !== 'steps' && acks !== 'frames') throw new Error("engine: acks must be 'steps' or 'frames'");
  if (record && acks !== 'steps') throw new Error("engine: record needs acks 'steps'"); // [T-9] browser recording is out of scope
  if (timer !== null && typeof timer !== 'function') throw new Error('engine: timer must be a function'); // #106
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  const schemas = game.schemas ?? {}; // N-3: declared command schemas (defineGame)
  let wallBase = wall0, wallBaseStep = 0, step = 0, renderFns = [], stepFns = []; // [R-7] additive render slots, copy-on-write (#10); N-4: onStep listeners, the same
  const streams = new Map(), time = { step: 0, sim: 0, frames: 0, wall: wall0 }, sceneView = { name: undefined, id: undefined, args: undefined, state: {}, overlays: [], overlayIds: [] };
  let nextId = 1; // every entered scene instance gets a monotonic id (view halves key on it)
  // R-8: `time` is updated in place every step; the scene view (name/args/state/overlays) only when a transition happens,
  // so `engine.scene.overlays` stays the same array across steps.
  const syncTime = () => { time.step = step; time.sim = step / game.sim.hz; } // divide, don't multiply by dt: 180 * (1/60) is not exactly 3
  const sync = () => {
    const m = stack[0]?.ctx; sceneView.name = m?.name; sceneView.id = m?.id; sceneView.args = m?.args; sceneView.state = m?.state ?? {};
    sceneView.overlays.length = 0; sceneView.overlayIds.length = 0;
    for (let i = 1; i < stack.length; i++) { sceneView.overlays.push(stack[i].ctx.name); sceneView.overlayIds.push(stack[i].ctx.id); }
  };
  const events = createEvents({ now: () => step });
  const stack = []; // stack[0] is the main scene; the rest are overlays, bottom to top
  // #105: the args an open overlay entered with (its ctx.args), for its view half; undefined when it is not an open overlay
  sceneView.overlayArgs = name => { for (let i = 1; i < stack.length; i++) if (stack[i].ctx.name === name) return stack[i].ctx.args; return undefined; };
  const def = name => game.scenes[name] ?? (() => { throw new Error(`engine: no scene '${name}'`); })();
  const ui = createUi({ onAction: a => input.set({ [a]: true }), coveredBy: s => coveredBy(s), isAction: a => typeof a === 'string' && a in input.kinds, ctxOf: name => { for (let i = 0; i < stack.length; i++) if (stack[i].ctx.name === name) return stack[i].ctx; return undefined; } });
  // [S-6] frame acks (#38): 'steps' counts every step as a presented frame (headless, ?lh-test); 'frames' counts only
  // engine.presented() (the browser driver acks a rendered frame at the start of the next tick). Listeners are
  // copy-on-write, so presenting allocates nothing. Listener timing: with 'steps' they run at the start of a step, so
  // a transition they request applies at the end of that step; with 'frames' presented() runs between ticks (outside
  // any step), so a transition applies at once.
  // `unacked`: a render happened that no presented() has acked yet. A load requested meanwhile (e.g. from a click
  // between ticks) must not count that frame: it was drawn before the request (its toast is not on it).
  let presentFns = [], builtFns = [], unacked = false;
  const blocks = new Set(); // one token per unreleased engine.block(label)
  const present = () => { unacked = false; time.frames++; const l = presentFns; for (let i = 0; i < l.length; i++) l[i](engine); };
  const drawn = () => time.frames + (acks === 'frames' && unacked ? 1 : 0); // presented frames once the pending ack lands
  const rendered = a => { unacked = true; const l = renderFns; for (let i = 0; i < l.length; i++) l[i](a); };
  // [S-6] loading is a scene state (#21, #38): a scene with a load has its step hook suspended; in that slot the load
  // ticks, builds after `hold` seconds of engine time and `frames` presented frames, then (with `settle`) waits for a
  // presented frame after the build and no engine.block() before `then`. One load in the engine at a time.
  // engine.onBuilt listeners run right after the build, before settle is evaluated, so a view can react to the build
  // (and view.wait) in the same slot. If the build queued a go, `then` still runs; the go applies at the end of the step.
  const loading = { active: false, scene: undefined, label: '', phase: '' };
  Object.defineProperty(loading, 'blocks', { get: () => { const o = []; for (const b of blocks) o.push(b.label); return o; } }); // labels of unreleased blocks (read-only)
  let loader = null; // the stack entry that is loading
  const setLoading = entry => {
    const l = entry?.load; loader = l ? entry : null;
    loading.active = !!l; loading.scene = l ? entry.ctx.name : undefined; loading.label = l ? l.pub.label : ''; loading.phase = l ? l.phase : '';
  };
  const dropLoad = entry => { if (entry.load) { entry.load = null; if (loader === entry) setLoading(null); } };
  const load = (entry, { build, then, hold = 0, frames = 1, settle = false, label = '' } = {}) => {
    if (typeof build !== 'function') throw new Error('engine: load needs a build function');
    for (const [k, v] of [['hold', hold], ['frames', frames]]) if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`engine: load ${k} must be a finite number >= 0`);
    if (!stack.includes(entry)) throw new Error(`engine: scene '${entry.ctx.name}' is not open`);
    if (loader && loader !== entry) throw new Error(`engine: scene '${loader.ctx.name}' is already loading`);
    if (entry.load) throw new Error(`engine: '${entry.ctx.name}' is already loading`); // no silent restart of hold/frames
    const pub = { label: String(label), then }; // `then` may be reassigned until it runs
    entry.load = { pub, build, hold, frames, settle, ticks: 0, f0: drawn(), fb: 0, phase: 'hold' };
    setLoading(entry); return pub;
  };
  const finishLoad = (entry, l) => { dropLoad(entry); l.pub.then?.(engine, entry.ctx); };
  const loadTick = (entry, dt) => {
    const l = entry.load;
    try {
      if (l.phase === 'hold') {
        l.ticks++;
        if (l.ticks * dt < l.hold - 1e-9 || time.frames - l.f0 < l.frames) return;
        l.build(engine, entry.ctx);
        const fns = builtFns; for (let i = 0; i < fns.length; i++) fns[i](engine, entry.ctx);
        if (entry.load !== l) return; // the build (or a listener) dropped its load (left the scene)
        if (!l.settle) return finishLoad(entry, l);
        l.fb = drawn(); l.phase = loading.phase = 'settle';
      }
      if (blocks.size === 0 && (acks === 'steps' || time.frames > l.fb)) finishLoad(entry, l);
    } catch (err) { if (entry.load === l) dropLoad(entry); throw err; }
  };
  let worlds; // S-3: the World seat (installWorld, below); worlds.current is the main scene's World
  const enter = (name, a) => {
    const s = def(name), scoped = [], cmds = new Map(), ctx = { name, id: nextId++, args: a, state: {}, system: (n, fn, o = {}) => { const rm = schedule.add(n, fn, { stage: 'pre', ...o }); scoped.push(rm); return rm; } };
    // #5: scene-scoped command handlers live on the stack entry, so they leave with the scene (exit or a rolled-back enter)
    ctx.command = (type, fn) => {
      if (typeof fn !== 'function') throw new Error(`engine: command '${type}' handler must be a function`);
      if (Object.hasOwn(schemas, type)) throw new Error(`engine: '${type}' has a schema: handle it in defineGame({ commands }) (#49)`);
      let list = cmds.get(type); if (!list) cmds.set(type, list = []); list.push(fn);
      return () => { // while delivering, the slot is blanked (compacted after the batch) so the next handler is not skipped
        const i = list.indexOf(fn); if (i === -1) return;
        if (delivering) { list[i] = null; holes.push(list); } else list.splice(i, 1);
      };
    };
    const entry = { s, ctx, scoped, cmds, load: null };
    ctx.load = o => load(entry, o);
    Object.defineProperty(ctx, 'world', { get: () => worlds.current }); // main scene and overlays: the main scene's World
    const main = stack.length === 0; // S-3: a main scene's World exists before its enter
    if (main) worlds.open();
    stack.push(entry); sync();
    try { s.enter?.(engine, ctx); s.ui?.(ui.builder(name), engine, ctx); }
    catch (err) { dropLoad(entry); const k = stack.indexOf(entry); if (k !== -1) stack.splice(k, 1); for (const rm of scoped) rm(); ui.clear(name); sync(); if (main) worlds.close(); throw err; }
    return ctx;
  };
  const isOpen = name => stack.some(o => o.ctx.name === name);
  const exit = i => { const [entry] = stack.splice(i, 1), { s, ctx, scoped } = entry; dropLoad(entry); try { s.exit?.(engine, ctx); } finally { for (const rm of scoped) rm(); ui.clear(ctx.name); if (i === 0) worlds.close(); sync(); } };
  // Pausing: while any open overlay has `pauses`, every stage stays frozen and only the overlays at or above the TOPMOST
  // pausing overlay run their step hooks (the main scene and anything beneath that overlay wait).
  const pausedFrom = () => { for (let i = stack.length - 1; i >= 1; i--) if (stack[i].s.pauses) return i; return -1; };
  const coveredBy = scene => { const p = pausedFrom(); if (p < 0) return undefined; const i = stack.findIndex(o => o.ctx.name === scene); return i >= 0 && i < p ? stack[p].ctx.name : undefined; };
  const stepScenes = (dt, from) => { for (let i = from; i < stack.length; i++) { const x = stack[i]; if (x.load) loadTick(x, dt); else x.s.step?.(engine, dt, x.ctx); } };
  // Transitions (go/overlay/close/jump) never run re-entrantly: requested while a step or another transition is busy,
  // they queue; the outermost transition (or the end of the step) drains the queue until it is empty. Only the last
  // queued go (and the requests after it) apply: requests before it are dropped, they would be torn down at once.
  let inStep = false, stepping = false, draining = false, booting = false, outFlush = false; const queue = [];
  const drain = () => {
    draining = true;
    try {
      while (queue.length) {
        let last = -1; for (let i = 0; i < queue.length; i++) if (queue[i].go) last = i;
        if (last > 0) queue.splice(0, last);
        queue.shift().run();
      }
    } catch (err) { queue.length = 0; throw err; } finally { draining = false; }
  };
  // #5: commands, the third input layer. Queued in FIFO order, delivered by lh.commands at the next step's input.apply:
  // the game's handler first (never paused), then each open scene bottom-up that handles the type and is not covered by a
  // pausing overlay. Only the commands queued before delivery starts are delivered (a handler's command waits a step).
  // #72: data is checked as plain JSON at issue and delivered as that copy (one allocation per command, never per step).
  const cmds = [], holes = []; let dropped = 0, delivering = false;
  const builtins = new Map(); // §4.4 seam for 3i: engine-level command handlers, run before the game's handler
  const handles = type => builtins.has(type) || Object.hasOwn(game.commands, type) || stack.some(o => o.cmds.get(type)?.some(f => f) === true);
  const deliver = c => {
    let ran = false; const bf = builtins.get(c.type), gf = Object.hasOwn(game.commands, c.type) ? game.commands[c.type] : undefined;
    if (bf) { ran = true; bf(engine, c.data, stack[0]?.ctx); }
    if (gf) { ran = true; gf(engine, c.data, stack[0]?.ctx); }
    const p = pausedFrom();
    for (let i = 0; i < stack.length; i++) {
      if (p > 0 && i < p) continue;
      const list = stack[i].cmds.get(c.type); if (!list) continue;
      for (let j = 0, n = list.length; j < n; j++) { const f = list[j]; if (f) { ran = true; f(engine, c.data, stack[i].ctx); } } // fixed length: added handlers wait
    }
    if (!ran) dropped++;
  };
  const deliverAll = () => {
    const n = cmds.length; if (!n) return;
    let k = 0;
    delivering = true;
    try { while (k < n) deliver(cmds[k++]); } // a throwing handler's command counts as delivered; the rest stay queued
    finally {
      delivering = false; cmds.copyWithin(0, k); cmds.length -= k;
      while (holes.length) { const l = holes.pop(); let w = 0; for (let r = 0; r < l.length; r++) if (l[r]) l[w++] = l[r]; l.length = w; }
    }
  };
  // [T-9] recording: only what comes from outside the sim. An op is external when no step, transition drain or boot is
  // running and no other recorded op is (a tap whose action calls go() records the tap only). `rec` exists only when
  // recording, so a plain engine allocates nothing here.
  const rec = record ? { depth: 0, log: [], last: null } : null;
  const copy = x => JSON.parse(JSON.stringify(x ?? null));
  // recorded payloads must be plain JSON (plain objects/arrays, finite numbers, strings, booleans, null), so the tape and
  // the replay see exactly what the handlers saw; returns a fresh copy, checked at issue
  const json = (x, what) => {
    const bad = () => { throw new Error(`engine: ${what} must be plain JSON`); }, seen = [];
    const walk = v => {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
      if (typeof v === 'number') return Number.isFinite(v) ? v : bad();
      if (typeof v !== 'object' || seen.includes(v)) return bad();
      const arr = Array.isArray(v), proto = Object.getPrototypeOf(v);
      if (!arr && proto !== Object.prototype && proto !== null) return bad();
      seen.push(v);
      let o; if (arr) { o = []; for (let i = 0; i < v.length; i++) o.push(v[i] === undefined ? bad() : walk(v[i])); }
      else { o = {}; for (const k of Object.keys(v)) { if (v[k] === undefined) bad(); o[k] = walk(v[k]); } }
      seen.pop(); return o;
    };
    return walk(x);
  };
  const live = x => x === null ? undefined : copy(x); // what the scene receives: a copy of the logged value
  const arg = (x, what) => x === undefined ? null : json(x, what); // a missing args/opts is stored as null
  const entryAt = k => { const l = rec.log, x = l[l.length - 1]; if (x?.step === k) return x; const y = { step: k }; l.push(y); return y; };
  const recorded = (op, fn) => {
    const top = rec.depth === 0 && !stepping && !draining && !booting;
    let o = null; if (top) op(o = []); // built (and its payload checked and copied) before it runs; logged once it applied
    rec.depth++; let r; try { r = fn(o); } finally { rec.depth--; }
    if (top) (entryAt(step).ops ??= []).push(o); // under the step it precedes
    return r;
  };
  const recordInput = () => { // after input.apply: the snapshot's changed values (axes as numbers, buttons as down)
    const last = rec.last ??= Object.fromEntries(Object.keys(input.kinds).map(n => [n, input.kinds[n] === 'axis' ? 0 : false]));
    for (const n in last) {
      const v = input.kinds[n] === 'axis' ? input.snapshot[n] : input.snapshot[n].down;
      if (v !== last[n]) { last[n] = v; (entryAt(step).input ??= {})[n] = v; }
    }
  };
  const commands = { get pending() { return cmds.length; }, get dropped() { return dropped; }, handles };
  // #72 then N-3: plain JSON first (today's message), then the schema (its checked copy: unknown keys dropped), then the
  // reserved keys (#77), type-checked and copied through. One copy per command, never per step.
  const checked = (type, data) => {
    const d = json(data, 'command data'), schema = Object.hasOwn(schemas, type) ? schemas[type] : undefined;
    const out = schema ? checkSchema(schema, d) : d;
    if (schema && !out) throw new Error(`engine: command '${type}' does not match its schema`);
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return d;
    for (const k in RESERVED) if (Object.hasOwn(d, k)) {
      if (!RESERVED[k](d[k])) throw new Error(`engine: command '${type}' reserved key '${k}' must be ${RESERVED_TYPE[k]}`);
      out[k] = d[k];
    }
    return out;
  };
  // engine.net (N-3): the sim-side outbox. A port drains it in an onStep listener; whatever is left after the listeners is
  // discarded, so with no port (headless, replays) it never grows. A send between steps goes out after the next step.
  const outbox = []; let netDraining = false;
  const net = {
    // `data` is queued by reference, not copied: do not mutate it before the next step's drain
    send(to, data, reliable = false) {
      if (!(data instanceof ArrayBuffer) && (data === null || typeof data !== 'object' || typeof data.t !== 'string')) throw new Error('engine: net.send data must be { t, ... } or an ArrayBuffer');
      outbox.push({ to, data, reliable: reliable === true }); // one item per message
    },
    leave() { outbox.push({ leave: true }); },
    // in order; a throwing fn keeps the rest. Not re-entrant: a nested drain from fn would re-deliver and empty the
    // queue under the outer loop, so it throws instead
    drain(fn) {
      if (netDraining) throw new Error('engine: net.drain is not re-entrant');
      netDraining = true; let k = 0;
      try { while (k < outbox.length) fn(outbox[k++]); } finally { netDraining = false; if (k === outbox.length) outbox.length = 0; else outbox.splice(0, k); }
    },
    get pending() { return outbox.length; },
  };
  const request = item => { queue.push(item); if (!inStep && !draining && !booting) drain(); };
  const loop = createLoop({ hz: game.sim.hz, maxCatchUp: game.sim.maxCatchUp, maxFrame: game.sim.maxFrame, render: rendered, step(dt, stamp) {
    inStep = stepping = true; let failure = null;
    // N-4, M-69: the injected clock. A real stamp re-anchors it; a step without one is virtual, exactly base + n * 1000 / hz (no float drift).
    // A tape recorded with real stamps replays with a virtual wall from wall0, so wall-dependent state must not feed into results a tape checks.
    if (stamp === undefined) time.wall = wallBase + (step + 1 - wallBaseStep) * 1000 / game.sim.hz; else { time.wall = stamp; wallBase = stamp; wallBaseStep = step + 1; }
    try {
      if (acks === 'steps') present(); // [S-6] every step is a presented frame
      schedule.run('input.apply', engine, dt);
      const p = pausedFrom();
      if (p > 0) stepScenes(dt, p);
      else { schedule.run('pre', engine, dt); schedule.run('physics.world', engine, dt); schedule.run('post', engine, dt); }
    } catch (err) { failure = err; }
    finally { inStep = false; } // never leave the engine thinking it is mid-step
    // the step always finishes (queued transitions apply, events flush, step++) even when a system threw, then rethrows
    try { drain(); } catch (err) { failure ??= err; }
    try { schedule.run('events.flush', engine, dt); } catch (err) { failure ??= err; }
    stepping = false; step++; syncTime();
    { const l = stepFns; for (let i = 0; i < l.length; i++) try { l[i](engine); } catch (err) { failure ??= err; } } // N-4: after the flush and the counter; each its own try, so a later one (the port's drain) still runs
    outbox.length = 0; // N-3: undrained sends are discarded (no port, no growth)
    if (failure) throw failure;
  } });
  // would `name` still be open once everything queued so far has applied? (replays the pending requests over the stack)
  const projectedOpen = name => {
    let open = isOpen(name);
    for (const q of queue) { if (q.go) open = q.name === name; else if (q.overlay === name) open = true; else if (q.close === name) open = false; }
    return open;
  };
  const alreadyOpen = name => { throw new Error(`engine: scene '${name}' is already open`); };
  // #95: { once: true } turns a request for an overlay that is open, or will be once the queue applies, into a no-op
  const onceOpen = (name, opts) => {
    if (opts === undefined) return false;
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) throw new Error('engine: overlay options must be an object');
    if (opts.once !== undefined && typeof opts.once !== 'boolean') throw new Error('engine: overlay once must be a boolean');
    if (!opts.once) return false;
    def(name); return projectedOpen(name);
  };
  const doGo = (name, a) => {
    def(name); const i = stack.findIndex(o => o.ctx.name === name); if (i > 0) alreadyOpen(name);
    const from = stack[0]?.ctx.name; while (stack.length) exit(stack.length - 1); enter(name, a); events.emit('scene', { name, from });
  };
  const doOverlay = (name, a) => { def(name); if (isOpen(name)) alreadyOpen(name); enter(name, a); events.emit('overlay', { name, open: true }); };
  const doClose = name => { const i = stack.findIndex((o, k) => k > 0 && o.ctx.name === name); if (i > 0) { exit(i); events.emit('overlay', { name, open: false }); } };
  const reqGo = (name, a) => { def(name); request({ go: true, name, run: () => doGo(name, a) }); return engine; };
  const reqOverlay = (name, a) => {
    def(name); if (projectedOpen(name)) alreadyOpen(name); // at request time, so the caller's stack shows it
    request({ overlay: name, run: () => doOverlay(name, a) }); return engine;
  };
  const reqClose = name => { request({ close: name, run: () => doClose(name) }); return engine; };
  const reqJump = (name, preset, opts, a) => {
    const p = def(name).presets?.[preset];
    if (!p) throw new Error(`engine: no preset '${preset}' in '${name}'`);
    request({ go: true, name, run: () => { doGo(name, a); p(engine, opts, stack[0].ctx); } }); return engine;
  };
  const issue = (type, data) => {
    if (typeof type !== 'string' || !type) throw new Error('engine: command type must be a non-empty string');
    cmds.push({ type, data }); return engine;
  };
  const engine = {
    game, seed: base.seed, events, input, loop, commands, loading, net,
    get acks() { return acks; }, get blocked() { return blocks.size; },
    presented() { if (acks !== 'frames') throw new Error("engine: presented() needs acks: 'frames'"); present(); },
    onPresent(fn) {
      if (typeof fn !== 'function') throw new Error('engine: onPresent needs a function');
      presentFns = [...presentFns, fn]; return () => { presentFns = presentFns.filter(f => f !== fn); };
    },
    onBuilt(fn) { // [S-6] fn(engine, ctx) after a load's build, before settle
      if (typeof fn !== 'function') throw new Error('engine: onBuilt needs a function');
      builtFns = [...builtFns, fn]; return () => { builtFns = builtFns.filter(f => f !== fn); };
    },
    block(label = '') { // [S-6] e.g. view.wait: a settling load waits until every block is released
      const b = { label: String(label) }; blocks.add(b); return () => { blocks.delete(b); };
    },
    get world() { return worlds.current; }, // S-3: the main scene's World (undefined before the first scene)
    builtin(type, fn) { // §4.4: fn(engine, data, mainCtx) before the game's handler, which still runs
      if (typeof type !== 'string' || !type) throw new Error('engine: builtin type must be a non-empty string');
      if (typeof fn !== 'function') throw new Error(`engine: builtin '${type}' needs a function`);
      if (builtins.has(type)) throw new Error(`engine: builtin '${type}' is already registered`);
      builtins.set(type, fn);
      return () => { if (builtins.get(type) === fn) builtins.delete(type); };
    },
    time, scene: sceneView, // live views: persistent objects, updated in place
    rng: name => streams.get(name) ?? (streams.set(name, base.fork(name)), streams.get(name)), // one stream per name
    emit: (type, data) => events.emit(type, data),
    // #71: deliver events emitted outside a step (a tap, a command) now; during a step or transition the step's own flush does it
    // re-entrancy safe: a listener that flushes again (or reads h.events) is a no-op, not a re-delivery of queue[0]
    flushEvents() {
      if (stepping || draining || booting || outFlush) return;
      outFlush = true; try { events.flush(); } finally { outFlush = false; }
    },
    system: (name, fn, opts = {}) => schedule.add(name, fn, { stage: 'pre', ...opts }),
    schedule: () => schedule.describe(),
    // recording, an external op's payload is validated and the scene/handler receives a copy of what was logged
    go: (name, a) => rec ? recorded(o => o.push('go', name, arg(a, 'scene args')), o => reqGo(name, o ? live(o[2]) : a)) : reqGo(name, a),
    overlay: (name, a, opts) => {
      if (onceOpen(name, opts)) return engine; // #95: a no-op, never recorded (a replay meets the same open overlay)
      return rec ? recorded(o => o.push('overlay', name, arg(a, 'scene args')), o => reqOverlay(name, o ? live(o[2]) : a)) : reqOverlay(name, a);
    },
    close: name => rec ? recorded(o => o.push('close', name), () => reqClose(name)) : reqClose(name),
    jump: (name, preset, opts, a) => rec
      ? recorded(o => o.push('jump', name, preset, arg(opts, 'jump opts'), arg(a, 'scene args')), o => reqJump(name, preset, o ? live(o[3]) : opts, o ? live(o[4]) : a))
      : reqJump(name, preset, opts, a),
    command: (type, data = {}) => rec ? recorded(o => o.push('command', type, checked(type, data)), o => issue(type, o ? copy(o[2]) : checked(type, data))) : issue(type, checked(type, data)),
    // #36: `pending` projects over queued requests (what the duplicate check sees); an unknown scene throws
    isOpen: (name, { pending = false } = {}) => { def(name); return pending ? projectedOpen(name) : isOpen(name); },
    stepN: n => loop.stepN(n), advance: s => loop.advance(s), frame: (s, now) => loop.frame(s, now),
    onStep(fn) { stepFns = [...stepFns, fn]; return () => { stepFns = stepFns.filter(f => f !== fn); }; }, // N-4
    onRender(fn) { renderFns = [...renderFns, fn]; return () => { renderFns = renderFns.filter(f => f !== fn); }; },
    render(alpha) { rendered(alpha); },
    ui: {
      tree: () => ui.tree(engine),
      view: () => ui.view(engine), // tree() into reused objects, valid until the next view() (R-8: the DOM UI's per-frame read)
      enabled: id => ui.enabled(id, engine), // #45
      tryTap(id) { if (!ui.enabled(id, engine)) return false; engine.ui.tap(id); return true; },
      press: id => rec ? recorded(o => o.push('press', id), () => ui.press(id, engine)) : ui.press(id, engine), // #9
      release: id => rec ? recorded(o => o.push('release', id), () => ui.release(id)) : ui.release(id),
      tap: id => rec ? recorded(o => o.push('tap', id), () => ui.tap(id, engine)) : ui.tap(id, engine),
      fill: (id, t) => rec ? recorded(o => o.push('fill', id, String(t)), () => ui.fill(id, t, engine)) : ui.fill(id, t, engine),
    },
    // [T-9] the recorded tape: start options plus, per step, the external ops and input changes (a deep copy)
    tape() {
      if (!rec) throw new Error('engine: not recording');
      return copy({ v: 1, game: game.id, seed: base.seed, scene, args, hz: game.sim.hz, wall0, log: rec.log });
    },
    state: () => { // engine keys win; `world` only while the World has entities, so un-migrated goldens are unchanged
      const s = { ...(game.state?.(engine) ?? {}), scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step };
      const w = worlds.digest(); if (w !== undefined) s.world = w;
      return s;
    },
  };
  schedule.add('lh.ui', (e, dt) => ui.advance(dt, engine), { stage: 'input.apply', before: ['lh.input'] }); // #9: hold progress on engine time
  schedule.add('lh.input', () => { input.apply(); if (rec) recordInput(); }, { stage: 'input.apply' });
  schedule.add('lh.commands', deliverAll, { stage: 'input.apply', after: ['lh.input'] });
  schedule.add('lh.scene', (e, dt) => stepScenes(dt, 0), { stage: 'pre' });
  schedule.add('lh.events', () => events.flush(), { stage: 'events.flush' });
  worlds = installWorld(engine, { timer }); // §4.1, §4.4: checks physics.rapier, adds lh.world.swap and lh.physics.*
  if (game.net?.world) installNet(engine); // 3i: the World net part, before setup and any port; each World open attaches it
  sync(); syncTime();
  // setup and the start enter run busy like any transition: what they request queues, then applies in order
  booting = true;
  try {
    game.setup?.(engine); // once, before the start scene: global systems and rng streams a game wants for its whole life
    enter(scene, args);
  } catch (err) { queue.length = 0; throw err; } finally { booting = false; }
  drain();
  return engine;
}
