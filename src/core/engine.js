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
  if (record && acks !== 'steps') throw new Error("engine: record needs acks 'steps'"); // [T-9] browser recording is out of scope
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  let step = 0, render = () => {};
  const streams = new Map(), time = { step: 0, sim: 0 }, sceneView = { name: undefined, id: undefined, args: undefined, state: {}, overlays: [], overlayIds: [] };
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
  const ui = createUi({ onAction: a => input.set({ [a]: true }), coveredBy: s => coveredBy(s) });
  const enter = (name, a) => {
    const s = def(name), scoped = [], cmds = new Map(), ctx = { name, id: nextId++, args: a, state: {}, system: (n, fn, o = {}) => { const rm = schedule.add(n, fn, { stage: 'pre', ...o }); scoped.push(rm); return rm; } };
    // #5: scene-scoped command handlers live on the stack entry, so they leave with the scene (exit or a rolled-back enter)
    ctx.command = (type, fn) => {
      if (typeof fn !== 'function') throw new Error(`engine: command '${type}' handler must be a function`);
      let list = cmds.get(type); if (!list) cmds.set(type, list = []); list.push(fn);
      return () => { const i = list.indexOf(fn); if (i !== -1) list.splice(i, 1); };
    };
    const entry = { s, ctx, scoped, cmds };
    stack.push(entry); sync();
    try { s.enter?.(engine, ctx); s.ui?.(ui.builder(name), engine, ctx); }
    catch (err) { const k = stack.indexOf(entry); if (k !== -1) stack.splice(k, 1); for (const rm of scoped) rm(); ui.clear(name); sync(); throw err; }
    return ctx;
  };
  const isOpen = name => stack.some(o => o.ctx.name === name);
  const exit = i => { const [{ s, ctx, scoped }] = stack.splice(i, 1); try { s.exit?.(engine, ctx); } finally { for (const rm of scoped) rm(); ui.clear(ctx.name); sync(); } };
  // Pausing: while any open overlay has `pauses`, every stage stays frozen and only the overlays at or above the TOPMOST
  // pausing overlay run their step hooks (the main scene and anything beneath that overlay wait).
  const pausedFrom = () => { for (let i = stack.length - 1; i >= 1; i--) if (stack[i].s.pauses) return i; return -1; };
  const coveredBy = scene => { const p = pausedFrom(); if (p < 0) return undefined; const i = stack.findIndex(o => o.ctx.name === scene); return i >= 0 && i < p ? stack[p].ctx.name : undefined; };
  const stepScenes = (dt, from) => { for (let i = from; i < stack.length; i++) stack[i].s.step?.(engine, dt, stack[i].ctx); };
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
  const cmds = []; let dropped = 0;
  const handles = type => Object.hasOwn(game.commands, type) || stack.some(o => o.cmds.get(type)?.length > 0);
  const deliver = c => {
    let ran = false; const gf = Object.hasOwn(game.commands, c.type) ? game.commands[c.type] : undefined;
    if (gf) { ran = true; gf(engine, c.data); }
    const p = pausedFrom();
    for (let i = 0; i < stack.length; i++) {
      if (p > 0 && i < p) continue;
      const list = stack[i].cmds.get(c.type); if (!list) continue;
      for (let j = 0; j < list.length; j++) { ran = true; list[j](engine, c.data, stack[i].ctx); }
    }
    if (!ran) dropped++;
  };
  const deliverAll = () => {
    const n = cmds.length; if (!n) return;
    let k = 0;
    try { while (k < n) deliver(cmds[k++]); } // a throwing handler's command counts as delivered; the rest stay queued
    finally { cmds.copyWithin(0, k); cmds.length -= k; }
  };
  // [T-9] recording: only what comes from outside the sim. An op is external when no step, transition drain or boot is
  // running and no other recorded op is (a tap whose action calls go() records the tap only). `rec` exists only when
  // recording, so a plain engine allocates nothing here.
  const rec = record ? { depth: 0, log: [], last: null } : null;
  const copy = x => JSON.parse(JSON.stringify(x ?? null));
  const entryAt = k => { const l = rec.log, x = l[l.length - 1]; if (x?.step === k) return x; const y = { step: k }; l.push(y); return y; };
  const recorded = (op, fn) => {
    const top = rec.depth === 0 && !stepping && !draining && !booting;
    const o = top ? op() : null; // copied before it runs (a handler may keep the data); logged once it applied
    rec.depth++; let r; try { r = fn(); } finally { rec.depth--; }
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
  const loop = createLoop({ hz: game.sim.hz, maxCatchUp: game.sim.maxCatchUp, maxFrame: game.sim.maxFrame, render: a => render(a), step(dt) {
    inStep = stepping = true; let failure = null;
    try {
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
    game, seed: base.seed, events, input, loop, commands,
    time, scene: sceneView, // live views: persistent objects, updated in place
    rng: name => streams.get(name) ?? (streams.set(name, base.fork(name)), streams.get(name)), // one stream per name
    emit: (type, data) => events.emit(type, data),
    system: (name, fn, opts = {}) => schedule.add(name, fn, { stage: 'pre', ...opts }),
    schedule: () => schedule.describe(),
    go: (name, a) => rec ? recorded(() => ['go', name, copy(a)], () => reqGo(name, a)) : reqGo(name, a),
    overlay: (name, a) => rec ? recorded(() => ['overlay', name, copy(a)], () => reqOverlay(name, a)) : reqOverlay(name, a),
    close: name => rec ? recorded(() => ['close', name], () => reqClose(name)) : reqClose(name),
    jump: (name, preset, opts, a) => rec ? recorded(() => ['jump', name, preset, copy(opts), copy(a)], () => reqJump(name, preset, opts, a)) : reqJump(name, preset, opts, a),
    command: (type, data = {}) => rec ? recorded(() => ['command', type, copy(data)], () => issue(type, data)) : issue(type, data),
    stepN: n => loop.stepN(n), advance: s => loop.advance(s), frame: s => loop.frame(s),
    onRender(fn) { render = fn; },
    render(alpha) { render(alpha); },
    ui: {
      tree: () => ui.tree(engine),
      tap: id => rec ? recorded(() => ['tap', id], () => ui.tap(id, engine)) : ui.tap(id, engine),
      fill: (id, t) => rec ? recorded(() => ['fill', id, String(t)], () => ui.fill(id, t, engine)) : ui.fill(id, t, engine),
    },
    // [T-9] the recorded tape: start options plus, per step, the external ops and input changes (a deep copy)
    tape() {
      if (!rec) throw new Error('engine: not recording');
      return copy({ v: 1, game: game.id, seed: base.seed, scene, args, hz: game.sim.hz, log: rec.log });
    },
    state: () => ({ ...(game.state?.(engine) ?? {}), scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step }), // engine keys win
  };
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
