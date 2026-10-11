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
  for (const [name, s] of Object.entries(spec.scenes)) for (const h of HOOKS) if (h in s && typeof s[h] !== 'function') fail(`scene '${name}'.${h} must be a function`);
  return Object.freeze({ ...spec, sim: { hz: 60, maxCatchUp: 3, ...spec.sim }, actions: spec.actions ?? defineActions({}), policies: spec.policies ?? {} });
}

export function createEngine(game, { seed = 1, scene = game.start, args } = {}) {
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  let step = 0, render = () => {};
  const streams = new Map(), time = { step: 0, sim: 0 }, sceneView = { name: undefined, args: undefined, state: {}, overlays: [] };
  // R-8: `time` is updated in place every step; the scene view (name/args/state/overlays) only when a transition happens,
  // so `engine.scene.overlays` stays the same array across steps.
  const syncTime = () => { time.step = step; time.sim = step / game.sim.hz; } // divide, don't multiply by dt: 180 * (1/60) is not exactly 3
  const sync = () => {
    const m = stack[0]?.ctx; sceneView.name = m?.name; sceneView.args = m?.args; sceneView.state = m?.state ?? {};
    sceneView.overlays.length = 0; for (let i = 1; i < stack.length; i++) sceneView.overlays.push(stack[i].ctx.name);
  };
  const events = createEvents({ now: () => step });
  const stack = []; // stack[0] is the main scene; the rest are overlays, bottom to top
  const def = name => game.scenes[name] ?? (() => { throw new Error(`engine: no scene '${name}'`); })();
  const ui = createUi({ onAction: a => input.set({ [a]: true }) });
  const enter = (name, a) => {
    const s = def(name), scoped = [], ctx = { name, args: a, state: {}, system: (n, fn, o = {}) => { const rm = schedule.add(n, fn, { stage: 'pre', ...o }); scoped.push(rm); return rm; } };
    const entry = { s, ctx, scoped };
    stack.push(entry); sync();
    try { s.enter?.(engine, ctx); s.ui?.(ui.builder(name), engine, ctx); }
    catch (err) { const k = stack.indexOf(entry); if (k !== -1) stack.splice(k, 1); for (const rm of scoped) rm(); ui.clear(name); sync(); throw err; }
    return ctx;
  };
  const isOpen = name => stack.some(o => o.ctx.name === name);
  const exit = i => { const [{ s, ctx, scoped }] = stack.splice(i, 1); try { s.exit?.(engine, ctx); } finally { for (const rm of scoped) rm(); ui.clear(ctx.name); sync(); } };
  const paused = () => { for (let i = 1; i < stack.length; i++) if (stack[i].s.pauses) return true; return false; };
  const stepScenes = (dt, from) => { for (let i = from; i < stack.length; i++) stack[i].s.step?.(engine, dt, stack[i].ctx); };
  // Transitions (go/overlay/close/jump) never run re-entrantly: requested while a step or another transition is busy,
  // they queue; the outermost transition (or the end of the step) drains the queue until it is empty. Only the last
  // queued go (and the requests after it) apply: requests before it are dropped, they would be torn down at once.
  let inStep = false, draining = false; const queue = [];
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
  const request = item => { queue.push(item); if (!inStep && !draining) drain(); };
  const loop = createLoop({ hz: game.sim.hz, maxCatchUp: game.sim.maxCatchUp, render: a => render(a), step(dt) {
    inStep = true; let failure = null;
    try {
      schedule.run('input.apply', engine, dt);
      if (paused()) stepScenes(dt, 1);
      else { schedule.run('pre', engine, dt); schedule.run('physics.world', engine, dt); schedule.run('post', engine, dt); }
    } catch (err) { failure = err; }
    finally { inStep = false; } // never leave the engine thinking it is mid-step
    // the step always finishes (queued transitions apply, events flush, step++) even when a system threw, then rethrows
    try { drain(); } catch (err) { failure ??= err; }
    try { schedule.run('events.flush', engine, dt); } catch (err) { failure ??= err; }
    step++; syncTime();
    if (failure) throw failure;
  } });
  const alreadyOpen = name => { throw new Error(`engine: scene '${name}' is already open`); };
  const doGo = (name, a) => {
    def(name); const i = stack.findIndex(o => o.ctx.name === name); if (i > 0) alreadyOpen(name);
    const from = stack[0]?.ctx.name; while (stack.length) exit(stack.length - 1); enter(name, a); events.emit('scene', { name, from });
  };
  const doOverlay = (name, a) => { def(name); if (isOpen(name)) alreadyOpen(name); enter(name, a); events.emit('overlay', { name, open: true }); };
  const doClose = name => { const i = stack.findIndex((o, k) => k > 0 && o.ctx.name === name); if (i > 0) { exit(i); events.emit('overlay', { name, open: false }); } };
  const engine = {
    game, seed: base.seed, events, input, loop,
    time, scene: sceneView, // live views: persistent objects, updated in place
    rng: name => streams.get(name) ?? (streams.set(name, base.fork(name)), streams.get(name)), // one stream per name
    emit: (type, data) => events.emit(type, data),
    system: (name, fn, opts = {}) => schedule.add(name, fn, { stage: 'pre', ...opts }),
    schedule: () => schedule.describe(),
    go(name, a) { def(name); request({ go: true, run: () => doGo(name, a) }); return engine; },
    overlay(name, a) {
      def(name); if (isOpen(name) || queue.some(q => q.overlay === name)) alreadyOpen(name); // at request time, so the caller's stack shows it
      request({ overlay: name, run: () => doOverlay(name, a) }); return engine;
    },
    close(name) { request({ run: () => doClose(name) }); return engine; },
    jump(name, preset, opts, a) {
      const p = def(name).presets?.[preset];
      if (!p) throw new Error(`engine: no preset '${preset}' in '${name}'`);
      request({ go: true, run: () => { doGo(name, a); p(engine, opts, stack[0].ctx); } }); return engine;
    },
    stepN: n => loop.stepN(n), advance: s => loop.advance(s), frame: s => loop.frame(s),
    onRender(fn) { render = fn; },
    ui: { tree: () => ui.tree(engine), tap: id => ui.tap(id, engine) },
    state: () => ({ scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step, ...(game.state?.(engine) ?? {}) }),
  };
  schedule.add('input', () => input.apply(), { stage: 'input.apply' });
  schedule.add('scene', (e, dt) => stepScenes(dt, 0), { stage: 'pre' });
  schedule.add('events', () => events.flush(), { stage: 'events.flush' });
  sync(); syncTime();
  game.setup?.(engine); // once, before the start scene: global systems and rng streams a game wants for its whole life
  enter(scene, args);
  return engine;
}
