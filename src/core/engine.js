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
  if (!(spec.start in spec.scenes)) fail(`start '${spec.start}' is not a scene`);
  for (const [name, s] of Object.entries(spec.scenes)) for (const h of HOOKS) if (h in s && typeof s[h] !== 'function') fail(`scene '${name}'.${h} must be a function`);
  return Object.freeze({ ...spec, sim: { hz: 60, maxCatchUp: 3, ...spec.sim }, actions: spec.actions ?? defineActions({}), policies: spec.policies ?? {} });
}

export function createEngine(game, { seed = 1, scene = game.start, args } = {}) {
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  let step = 0, render = () => {};
  const time = { step: 0, sim: 0 }, sceneView = { name: undefined, args: undefined, state: {}, overlays: [] };
  const sync = () => { // divide, don't multiply by dt: 180 * (1/60) is not exactly 3
    time.step = step; time.sim = step / game.sim.hz;
    const m = stack[0]?.ctx; sceneView.name = m?.name; sceneView.args = m?.args; sceneView.state = m?.state ?? {};
    sceneView.overlays.length = 0; for (let i = 1; i < stack.length; i++) sceneView.overlays.push(stack[i].ctx.name);
  };
  const events = createEvents({ now: () => step });
  const stack = []; // stack[0] is the main scene; the rest are overlays, bottom to top
  const def = name => game.scenes[name] ?? (() => { throw new Error(`engine: no scene '${name}'`); })();
  const ui = createUi({ onAction: a => input.set({ [a]: true }) });
  const enter = (name, a) => { const s = def(name), ctx = { name, args: a, state: {} }; stack.push({ s, ctx }); sync(); s.enter?.(engine, ctx); s.ui?.(ui.builder(name), engine, ctx); return ctx; };
  const exit = i => { const [{ s, ctx }] = stack.splice(i, 1); s.exit?.(engine, ctx); ui.clear(ctx.name); sync(); };
  const paused = () => { for (let i = 1; i < stack.length; i++) if (stack[i].s.pauses) return true; return false; };
  const stepScenes = (dt, from) => { for (let i = from; i < stack.length; i++) stack[i].s.step?.(engine, dt, stack[i].ctx); };
  const loop = createLoop({ hz: game.sim.hz, maxCatchUp: game.sim.maxCatchUp, render: a => render(a), step(dt) {
    schedule.run('input.apply', engine, dt);
    if (paused()) stepScenes(dt, 1);
    else { schedule.run('pre', engine, dt); schedule.run('physics.world', engine, dt); schedule.run('post', engine, dt); }
    schedule.run('events.flush', engine, dt);
    step++; sync();
  } });
  const engine = {
    game, seed: base.seed, events, input, loop,
    time, scene: sceneView, // live views: persistent objects, updated in place
    rng: name => base.fork(name),
    emit: (type, data) => events.emit(type, data),
    system: (name, fn, opts = {}) => schedule.add(name, fn, { stage: 'pre', ...opts }),
    schedule: () => schedule.describe(),
    go(name, a) { def(name); const from = stack[0]?.ctx.name; while (stack.length) exit(stack.length - 1); enter(name, a); events.emit('scene', { name, from }); return engine; },
    overlay(name, a) { enter(name, a); events.emit('overlay', { name, open: true }); return engine; },
    close(name) { const i = stack.findIndex((o, k) => k > 0 && o.ctx.name === name); if (i > 0) { exit(i); events.emit('overlay', { name, open: false }); } return engine; },
    jump(name, preset, opts) {
      const p = def(name).presets?.[preset];
      if (!p) throw new Error(`engine: no preset '${preset}' in '${name}'`);
      engine.go(name); p(engine, opts, stack[0].ctx); return engine;
    },
    stepN: n => loop.stepN(n), advance: s => loop.advance(s), frame: s => loop.frame(s),
    onRender(fn) { render = fn; },
    ui: { tree: () => ui.tree(engine), tap: id => ui.tap(id, engine) },
    state: () => ({ scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step, ...(game.state?.(engine) ?? {}) }),
  };
  schedule.add('input', () => input.apply(), { stage: 'input.apply' });
  schedule.add('scene', (e, dt) => stepScenes(dt, 0), { stage: 'pre' });
  schedule.add('events', () => events.flush(), { stage: 'events.flush' });
  sync(); enter(scene, args);
  return engine;
}
