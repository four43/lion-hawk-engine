// A minimal Lion Hawk game used by the engine tests and as the first usage example:
// title → race (3-2-1 countdown, then throttle moves x to 50) → results overlay; a pause overlay freezes the race.
import { defineGame, actions, axis, button } from '../../src/index.sim.js';

export default defineGame({
  id: 'countdown',
  sim: { hz: 60, maxCatchUp: 3 },
  actions: actions({ throttle: axis(), pause: button() }),
  start: 'title',
  scenes: {
    title: { ui(u) { u.button({ id: 'play', label: 'Play', action: e => e.go('race') }); } },
    race: {
      enter(e, ctx) { Object.assign(ctx.state, { count: 3, t: 0, x: 0, running: false }); ctx.command('nudge', (en, d, c) => { c.state.x += d.dx; }); },
      step(e, dt, ctx) {
        const s = ctx.state;
        if (!s.running) { s.t += dt; if (s.t >= 1 - 1e-9) { s.t = 0; s.count--; e.emit('count', { n: s.count }); if (s.count === 0) { s.running = true; e.emit('go'); } } return; }
        if (e.input.snapshot.pause.pressed) { e.overlay('pause'); return; }
        s.x += e.input.snapshot.throttle * 10 * dt;
        if (s.x >= 50) { e.emit('finish', { x: s.x }); e.overlay('results', { x: s.x }); }
      },
      ui(u) { u.button({ id: 'pause', label: 'Pause', action: 'pause', when: e => e.scene.state.running }); },
      presets: { running(e, opts = {}, ctx) { Object.assign(ctx.state, { count: 0, running: true, x: opts.x ?? 0 }); } },
    },
    pause: { pauses: true, ui(u) { u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') }); } },
    results: { pauses: true, ui(u) { u.button({ id: 'retry', label: 'Retry', action: e => e.go('race') }); } },
  },
  policies: { floor: () => ({ throttle: 1 }) },
  state: e => ({ x: e.scene.state.x ?? null }),
});
