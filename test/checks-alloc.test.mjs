// T-13: retained heap growth over many steps of a physics scene stays under 64 KB; a system that keeps what it
// allocates is caught. This file runs without --expose-gc on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroAlloc } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';
import { actions, axis } from '../src/core/actions.js';

const scene = (e, ctx) => {
  const w = ctx.world, r = e.rng('alloc');
  w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [30, 0.5, 30], p: [0, -0.5, 0], material: 'gravel' }] });
  for (let i = 0; i < 30; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-8, 8), 1 + i * 0.6, r.range(-8, 8)], tags: ['crate'] });
  w.spawn({ tags: ['marker'], xf: true });
};
const tick = (e, dt, ctx) => {
  const m = ctx.world.with('xf');
  m[m.length - 1].xf.p.x += dt;               // a bodiless entity moved by game code
  ctx.world.with('body', 'model');            // a cached query, every step
};

test('zeroAlloc: 30 crates, a moving marker and per-step queries retain under 64 KB (T-13)', { timeout: 300000 }, () => {
  assert.equal(typeof globalThis.gc, 'undefined', 'run without --expose-gc: zeroAlloc enables it itself');
  const r = zeroAlloc(physGame({ build: scene, tick }), { steps: 3000 });
  assert.equal(r.ok, true, `retained ${r.growth} bytes`);
  assert.equal(r.steps, 3000);
});
test('zeroAlloc catches a system that keeps what it allocates', { timeout: 300000 }, () => {
  const kept = [];
  const r = zeroAlloc(physGame({ build: scene, tick: (e, dt, ctx) => { tick(e, dt, ctx); kept.push(new Float64Array(16)); } }), { steps: 3000 });
  assert.equal(r.ok, false);
  assert.ok(r.growth > 64 * 1024, `${r.growth}`);
});
test('zeroAlloc takes start args and an input(step) policy over warm and measured steps (3j #5 ruling)', () => {
  const got = [], asked = [];
  const game = physGame({ actions: actions({ push: axis() }), build: (e, ctx) => { scene(e, ctx); got.push(ctx.args?.crates); }, tick });
  const r = zeroAlloc(game, { warm: 10, steps: 50, args: { crates: 4 }, input: step => { asked.push(step); return { push: 0 }; } });
  assert.equal(r.steps, 50); assert.deepEqual(got, [4]);
  assert.deepEqual(asked, Array.from({ length: 60 }, (_, i) => i), 'called with the step about to run');
});
