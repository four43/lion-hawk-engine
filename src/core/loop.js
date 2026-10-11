// R-1…R-3, R-7: fixed steps from an accumulator, a catch-up cap that drops (and counts) excess time, and an alpha for
// render interpolation. No rAF here: the view's driver calls frame(seconds); tests call stepN/advance.
const EPS = 1e-9;
export function createLoop({ hz = 60, maxCatchUp = 3, maxFrame = 0.25, step, render = () => {} }) {
  const dt = 1 / hz, stats = { frames: 0, steps: 0, clamped: 0, lastSteps: 0 };
  let acc = 0;
  const run = cap => { let n = 0; while (acc >= dt - EPS && n < cap) { step(dt); acc -= dt; n++; } if (acc < 0) acc = 0; stats.steps += n; return n; };
  return {
    dt, stats,
    get alpha() { return acc / dt; },
    frame(seconds) {
      acc += Math.min(Math.max(seconds, 0), maxFrame);
      const n = run(maxCatchUp);
      if (acc >= dt - EPS) { stats.clamped++; acc %= dt; } // R-2: drop what the cap could not run
      stats.frames++; stats.lastSteps = n; render(acc / dt);
      return n;
    },
    stepN(n) { for (let i = 0; i < n; i++) step(dt); stats.steps += n; },
    advance(seconds) { acc += Math.max(seconds, 0); return run(Infinity); },
    reset() { acc = 0; },
  };
}
