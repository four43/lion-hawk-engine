import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, replay, checks } from '../../testing/index.js';
import game from './fixtures/carGame.js';

test('the sim kits drive a car over striped terrain; its wheels read both materials', () => {
  const h = headless(game, { seed: 3 }), seen = new Set();
  for (let k = 0; k < 600; k++) { h.step(1, { throttle: 1, steer: Math.sin(k / 60) }); for (const w of h.scene.state.v.wheels) if (w.material) seen.add(w.material); }
  const p = h.scene.state.car.xf.p;
  assert.ok(p.x > -33, `x ${p.x}`);
  assert.deepEqual([...seen].sort(), ['field', 'track']);
  assert.ok(Number.isFinite(h.scene.state.car.coverage.dirt));
});

test('terrain, vehicle and coverage are deterministic (checks.determinism, T-10)', async () => {
  const r = await checks.determinism(game, { seed: 5, steps: 600, input: 'drive' });
  assert.ok(r.ok, `diverged at step ${r.step}`);
});

test('a recorded drive replays to the same checksums (T-9)', () => {
  const h = headless(game, { seed: 7, record: true });
  h.step(600, 'drive');
  const sum = h.checksum(), r = replay(game, JSON.parse(JSON.stringify(h.tape())));
  assert.equal(r.checksum(), sum);
});

test('the sim kits retain no memory per step (checks.zeroAlloc, T-13)', async () => {
  const r = await checks.zeroAlloc(game, { steps: 3000, warm: 600, input: 'drive' }); // driving, so wheels, grip and coverage all run
  assert.ok(r.ok, JSON.stringify(r));
});
