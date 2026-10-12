// The engine core (spec §5): scenes with sim halves (S-1…S-5), the step pipeline over named stages (R-6), input
// applied once per step (I-4), the UI registry (U-1), events, seeded rng streams and the fixed-step loop (R-1…R-7).
// Sim-pure: the browser driver, devices and DOM rendering live in the view half (phase 2b).
import { rng } from './rng.js';
import { createEvents } from './events.js';
import { createSchedule, STEP_STAGES } from './schedule.js';
import { createLoop } from './loop.js';
import { actions as defineActions, createInput } from './actions.js';
import { createUi } from './ui.js';

const HOOKS = ['enter', 'exit', 'step', 'ui'];
export function defineGame(spec) {
  const fail = m => { throw new Error(`defineGame: ${m}`); };
  if (typeof spec.id !== 'string' || !spec.id) fail('id must be a non-empty string');
  if (!spec.scenes || !Object.keys(spec.scenes).length) fail('scenes must not be empty');
  if (spec.setup !== undefined && typeof spec.setup !== 'function') fail('setup must be a function');
  if (!(spec.start in spec.scenes)) fail(`start '${spec.start}' is not a scene`);
  for (const [k, f] of Object.entries(spec.commands ?? {})) if (typeof f !== 'function') fail(`commands.${k} must be a function`);
  for (const [name, s] of Object.entries(spec.scenes)) for (const h of HOOKS) if (h in s && typeof s[h] !== 'function') fail(`scene '${name}'.${h} must be a function`);
  const sim = { hz: 60, maxCatchUp: 3, maxFrame: 0.25, ...spec.sim };
  for (const k of ['hz', 'maxCatchUp']) if (typeof sim[k] !== 'number' || !(sim[k] > 0) || !Number.isFinite(sim[k])) fail(`sim.${k} must be a positive number`);
  return Object.freeze({ ...spec, sim, actions: spec.actions ?? defineActions({}), policies: spec.policies ?? {}, commands: spec.commands ?? {} });
}

export function createEngine(game, { seed = 1, scene = game.start, args, acks = 'steps', record = false } = {}) {
  if (acks !== 'steps' && acks !== 'frames') throw new Error("engine: acks must be 'steps' or 'frames'");
  if (record && acks !== 'steps') throw new Error("engine: record needs acks 'steps'"); // [T-9] browser recording is out of scope
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  let step = 0, render = () => {};
  const streams = new Map(), time = { step: 0, sim: 0, frames: 0 }, sceneView = { name: undefined, id: undefined, args: undefined, state: {}, overlays: [], overlayIds: [] };
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
  const def = name => game.scenes[name] ?? (() => { throw new Error(`engine: no scene '${name}'`); })();
  const ui = createUi({ onAction: a => input.set({ [a]: true }), coveredBy: s => coveredBy(s), isAction: a => typeof a === 'string' && a in input.kinds });
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
  const rendered = a => { unacked = true; render(a); };
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
        if (entry.load !== l) return; // the build (or a listener) replaced or dropped its load
        if (!l.settle) return finishLoad(entry, l);
        l.fb = drawn(); l.phase = loading.phase = 'settle';
      }
      if (blocks.size === 0 && (acks === 'steps' || time.frames > l.fb)) finishLoad(entry, l);
    } catch (err) { if (entry.load === l) dropLoad(entry); throw err; }
  };
  const enter = (name, a) => {
    const s = def(name), scoped = [], cmds = new Map(), ctx = { name, id: nextId++, args: a, state: {}, system: (n, fn, o = {}) => { const rm = schedule.add(n, fn, { stage: 'pre', ...o }); scoped.push(rm); return rm; } };
    // #5: scene-scoped command handlers live on the stack entry, so they leave with the scene (exit or a rolled-back enter)
    ctx.command = (type, fn) => {
      if (typeof fn !== 'function') throw new Error(`engine: command '${type}' handler must be a function`);
      let list = cmds.get(type); if (!list) cmds.set(type, list = []); list.push(fn);
      return () => { // while delivering, the slot is blanked (compacted after the batch) so the next handler is not skipped
        const i = list.indexOf(fn); if (i === -1) return;
        if (delivering) { list[i] = null; holes.push(list); } else list.splice(i, 1);
      };
    };
    const entry = { s, ctx, scoped, cmds, load: null };
    ctx.load = o => load(entry, o);
    stack.push(entry); sync();
    try { s.enter?.(engine, ctx); s.ui?.(ui.builder(name), engine, ctx); }
    catch (err) { dropLoad(entry); const k = stack.indexOf(entry); if (k !== -1) stack.splice(k, 1); for (const rm of scoped) rm(); ui.clear(name); sync(); throw err; }
    return ctx;
  };
  const isOpen = name => stack.some(o => o.ctx.name === name);
  const exit = i => { const [entry] = stack.splice(i, 1), { s, ctx, scoped } = entry; dropLoad(entry); try { s.exit?.(engine, ctx); } finally { for (const rm of scoped) rm(); ui.clear(ctx.name); sync(); } };
  // Pausing: while any open overlay has `pauses`, every stage stays frozen and only the overlays at or above the TOPMOST
  // pausing overlay run their step hooks (the main scene and anything beneath that overlay wait).
  const pausedFrom = () => { for (let i = stack.length - 1; i >= 1; i--) if (stack[i].s.pauses) return i; return -1; };
  const coveredBy = scene => { const p = pausedFrom(); if (p < 0) return undefined; const i = stack.findIndex(o => o.ctx.name === scene); return i >= 0 && i < p ? stack[p].ctx.name : undefined; };
  const stepScenes = (dt, from) => { for (let i = from; i < stack.length; i++) { const x = stack[i]; if (x.load) loadTick(x, dt); else x.s.step?.(engine, dt, x.ctx); } };
  // Transitions (go/overlay/close/jump) never run re-entrantly: requested while a step or another transition is busy,
  // they queue; the outermost transition (or the end of the step) drains the queue until it is empty. Only the last
  // queued go (and the requests after it) apply: requests before it are dropped, they would be torn down at once.
  let inStep = false, stepping = false, draining = false, booting = false; const queue = [];
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
  // Not recording, handlers get the caller's object as-is: don't mutate data after issuing it.
  const cmds = [], holes = []; let dropped = 0, delivering = false;
  const handles = type => Object.hasOwn(game.commands, type) || stack.some(o => o.cmds.get(type)?.some(f => f) === true);
  const deliver = c => {
    let ran = false; const gf = Object.hasOwn(game.commands, c.type) ? game.commands[c.type] : undefined;
    if (gf) { ran = true; gf(engine, c.data); }
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
  const request = item => { queue.push(item); if (!inStep && !draining && !booting) drain(); };
  const loop = createLoop({ hz: game.sim.hz, maxCatchUp: game.sim.maxCatchUp, maxFrame: game.sim.maxFrame, render: rendered, step(dt) {
    inStep = stepping = true; let failure = null;
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
    if (failure) throw failure;
  } });
  // would `name` still be open once everything queued so far has applied? (replays the pending requests over the stack)
  const projectedOpen = name => {
    let open = isOpen(name);
    for (const q of queue) { if (q.go) open = q.name === name; else if (q.overlay === name) open = true; else if (q.close === name) open = false; }
    return open;
  };
  const alreadyOpen = name => { throw new Error(`engine: scene '${name}' is already open`); };
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
    game, seed: base.seed, events, input, loop, commands, loading,
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
    time, scene: sceneView, // live views: persistent objects, updated in place
    rng: name => streams.get(name) ?? (streams.set(name, base.fork(name)), streams.get(name)), // one stream per name
    emit: (type, data) => events.emit(type, data),
    system: (name, fn, opts = {}) => schedule.add(name, fn, { stage: 'pre', ...opts }),
    schedule: () => schedule.describe(),
    // recording, an external op's payload is validated and the scene/handler receives a copy of what was logged
    go: (name, a) => rec ? recorded(o => o.push('go', name, arg(a, 'scene args')), o => reqGo(name, o ? live(o[2]) : a)) : reqGo(name, a),
    overlay: (name, a) => rec ? recorded(o => o.push('overlay', name, arg(a, 'scene args')), o => reqOverlay(name, o ? live(o[2]) : a)) : reqOverlay(name, a),
    close: name => rec ? recorded(o => o.push('close', name), () => reqClose(name)) : reqClose(name),
    jump: (name, preset, opts, a) => rec
      ? recorded(o => o.push('jump', name, preset, arg(opts, 'jump opts'), arg(a, 'scene args')), o => reqJump(name, preset, o ? live(o[3]) : opts, o ? live(o[4]) : a))
      : reqJump(name, preset, opts, a),
    command: (type, data = {}) => rec ? recorded(o => o.push('command', type, json(data, 'command data')), o => issue(type, o ? copy(o[2]) : data)) : issue(type, data),
    // #36: `pending` projects over queued requests (what the duplicate check sees); an unknown scene throws
    isOpen: (name, { pending = false } = {}) => { def(name); return pending ? projectedOpen(name) : isOpen(name); },
    stepN: n => loop.stepN(n), advance: s => loop.advance(s), frame: s => loop.frame(s),
    onRender(fn) { render = fn; },
    render(alpha) { rendered(alpha); },
    ui: {
      tree: () => ui.tree(engine),
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
      return copy({ v: 1, game: game.id, seed: base.seed, scene, args, hz: game.sim.hz, log: rec.log });
    },
    state: () => ({ ...(game.state?.(engine) ?? {}), scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step }), // engine keys win
  };
  schedule.add('lh.ui', (e, dt) => ui.advance(dt, engine), { stage: 'input.apply', before: ['lh.input'] }); // #9: hold progress on engine time
  schedule.add('lh.input', () => { input.apply(); if (rec) recordInput(); }, { stage: 'input.apply' });
  schedule.add('lh.commands', deliverAll, { stage: 'input.apply', after: ['lh.input'] });
  schedule.add('lh.scene', (e, dt) => stepScenes(dt, 0), { stage: 'pre' });
  schedule.add('lh.events', () => events.flush(), { stage: 'events.flush' });
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
