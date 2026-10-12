// [T-2] input policies for headless runs; in lion-hawk/sim because games register them in game.sim.js (bundled for the
// browser), and lion-hawk/test re-exports the same object. A policy is called as fn(h, i, scratch): `scratch` is one
// persistent object per (handle, policy function).
export const policy = {
  still: () => ({}),
  const: p => () => p,
  seq: list => (h, i) => { let k = i; for (const [n, p] of list) { if (k < n) return p; k -= n; } return {}; },
  fn: f => f,
  // every(n, fn, { phase }): recompute every n engine steps and hold the output in between (#26, #37). Cadence follows
  // engine steps, not the call index, so one-step h.step(1, p) loops keep it; a gap of n steps or more re-anchors at
  // the next call. When a test compares two runs, perturb one on purpose (`phase`) (#40). `key(h)`: when it returns a
  // different value (===) from the last call, e.g. a rebuilt sim, recompute at once and anchor the cadence there (#51).
  every(n, fn, { phase = 0, key } = {}) {
    if (!Number.isInteger(n) || n < 1) throw new Error('policy.every: n must be a positive integer');
    if (!Number.isInteger(phase) || phase < 0 || phase >= n) throw new Error(`policy.every: phase must be an integer in [0, ${n})`);
    if (key !== undefined && typeof key !== 'function') throw new Error('policy.every: key must be a function');
    return (h, i, sc) => {
      const t = h.engine.time.step, k = key ? key(h) : undefined, moved = !!key && sc.at !== undefined && k !== sc.key;
      sc.key = k;
      if (sc.at === undefined) { sc.out = fn(h, i, sc.inner ??= {}); sc.at = t - phase; }
      else if (moved || t - sc.at >= n) { sc.out = fn(h, i, sc.inner ??= {}); sc.at = t; }
      return sc.out;
    };
  },
};
