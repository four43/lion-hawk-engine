// T-10, T-12, T-13, T-14 (overview §4.4): whole-game checks a game's npm test calls. Node only.
import v8 from 'node:v8';
import vm from 'node:vm';
import { createEngine } from '../src/core/engine.js';
import { headless } from './headless.js';
import { scanPurity } from './purity.js';

// input (controller ruling): a function (step) → snapshot, a named policy of the game, or a constant snapshot
const policyOf = (game, input) => {
  if (input == null) return null;
  if (typeof input === 'function') return (h, i, s) => input(h.engine.time.step);
  if (typeof input === 'string') {
    if (!Object.hasOwn(game.policies ?? {}, input)) throw new Error(`checks: no policy '${input}'`);
    return game.policies[input];
  }
  return () => input;
};

// [T-10] two runs, one after the other, compared before the first step and after every step
export function determinism(game, { seed = 1, steps = 600, input, scene, args } = {}) {
  const pol = policyOf(game, input);
  const run = () => {
    const h = headless(game, { seed, scene, args }), sums = [h.checksum()];
    // ONE wrapper per run: headless keys a policy's scratch on function identity (#37), so a per-step wrapper
    // would give a stateful policy a fresh scratch each step and grow headless's scratch Map
    let i = 0;
    const f = pol ? (x, k, s) => pol(x, i, s) : undefined;
    try { for (; i < steps; i++) { h.step(1, f); sums.push(h.checksum()); } }
    finally { h.engine.world?.dispose(); }
    return sums;
  };
  const a = run(), b = run();
  for (let i = 0; i <= steps; i++) if (a[i] !== b[i]) return { ok: false, step: i, a: a[i], b: b[i] };
  return { ok: true, step: -1, a: a[steps], b: b[steps] };
}

// [T-12] the static purity scan over the roots the game names (its sim tree)
export function simPurity(game, { roots } = {}) {
  if (!Array.isArray(roots) || !roots.length) throw new Error('checks.simPurity: pass { roots: [dirs or files] }');
  const found = scanPurity(roots);
  return { ok: found.length === 0, found };
}

// [T-13] full GCs without --expose-gc: enable the flag in this process (the game object cannot cross into a child)
let vmGc = null;
function collector() {
  if (typeof globalThis.gc === 'function') return globalThis.gc;
  if (vmGc === null) { v8.setFlagsFromString('--expose-gc'); vmGc = vm.runInNewContext('gc'); }
  return vmGc;
}
// Retained heap growth over `steps` engine steps after `warm` (JIT and rings settle). Rapier's per-call vectors are
// garbage and do not count; anything kept does. Input resolves once per run through determinism's policyOf; a named
// policy gets a stand-in h = { engine, seed } (no h.find/world/time).
export function zeroAlloc(game, { steps = 10000, warm = 600, seed = 1, scene, args, input, limit = 64 * 1024 } = {}) {
  const gc = collector(), engine = createEngine(game, { seed, scene, args }), pol = policyOf(game, input);
  const scratch = {}, h = { engine, seed: engine.seed };
  const run = (from, n) => { for (let i = 0; i < n; i++) { if (pol) engine.input.set(pol(h, from + i, scratch)); engine.stepN(1); } };
  try {
    run(0, warm);
    gc(); gc();
    const before = v8.getHeapStatistics().used_heap_size;
    run(warm, steps);
    gc(); gc();
    const growth = v8.getHeapStatistics().used_heap_size - before;
    return { ok: growth < limit, growth, steps };
  } finally { engine.world?.dispose(); }
}

export const checks = { determinism, simPurity, zeroAlloc };
