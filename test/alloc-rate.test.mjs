// R-8, short-lived garbage: what the engine's own code allocates per sim step (sampled; see helpers/alloc.mjs allocRate).
// Rapier's internals (its performance.now calls, the gravity it boxes each step) are outside the engine and not counted.
// Measured at 0.11.2: about 700 bytes, nearly all wasm-bindgen glue of Rapier's getters inlined into world.read (it stays
// with the getters given targets, and with no buffer writes). The budget catches engine code that starts allocating.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { actions, axis } from '../src/core/actions.js';
import { createEngine } from '../src/core/engine.js';
import { physGame } from './fixtures/phys/game.js';
import { allocRate } from './helpers/alloc.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const crates = (e, ctx) => {
  const w = ctx.world, r = e.rng('alloc');
  const pawn = w.spawn({ tags: ['pawn'] }); // seat 0's controller possesses it and holds an axis: the per-step copy is measured too
  e.controllerOf(0).possess(pawn); e.controllerOf(0).input.hold({ steer: 0.5 });
  w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [30, 0.5, 30], p: [0, -0.5, 0], material: 'gravel' }] });
  for (let i = 0; i < 30; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-8, 8), 1 + i * 0.6, r.range(-8, 8)], tags: ['crate'] });
};
test('a step of 30 falling and settling crates allocates under 1 KB in engine code', async () => {
  const engine = createEngine(physGame({ build: crates, actions: actions({ steer: axis() }) }), { seed: 1 });
  try {
    const r = await allocRate(() => engine.stepN(1), 600, { top: 8, within: SRC });
    assert.ok(r.inside < 1024, `${Math.round(r.inside)} bytes per step in engine code (${Math.round(r.perCall)} in all):\n${r.top.join('\n')}`);
  } finally { engine.world?.dispose(); }
});
