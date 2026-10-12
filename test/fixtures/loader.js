// A tiny Lion Hawk game for the browser load tests: a 'reload' command starts a settling load on the stage (its view
// half holds the settle with view.wait); the stick drives x; 'boost' is a ui.hold that never fires.
import { defineGame, actions, axis } from '../../src/index.sim.js';

export default defineGame({
  id: 'loader',
  sim: { hz: 60, maxCatchUp: 3 },
  actions: actions({ throttle: axis() }),
  start: 'stage',
  scenes: {
    stage: {
      enter(e, ctx) {
        Object.assign(ctx.state, { x: 0, builds: 0, done: 0 });
        ctx.command('reload', (en, d, c) => { c.load({ hold: 0.05, settle: true, label: 'Loading', build: () => { c.state.builds++; }, then: () => { c.state.done++; } }); });
      },
      step(e, dt, ctx) { ctx.state.x += e.input.snapshot.throttle * 10 * dt; },
      ui(u) { u.hold({ id: 'boost', label: 'Boost', seconds: 100, action: () => {} }); },
    },
  },
  state: e => ({ x: e.scene.state.x ?? null, builds: e.scene.state.builds ?? 0, done: e.scene.state.done ?? 0, phase: e.loading.phase }),
});
