import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterp, DELAY, lerpAngle, lerpPose, rng } from '../src/index.sim.js';
const makeRng = rng;

test('plays back 100 ms behind the sender, between the two frames around that time (M-25)', () => {
  const it = createInterp(), lat = 40; // one-way delay; the receiver's clock is 5000 ms ahead of the sender's
  for (let t = 0; t <= 1000; t += 50) it.push(t, t + 5000 + lat, { x: t / 100 });
  const s = it.sample(1000 + 5000 + lat); // sender time 1000 has just arrived
  assert.equal(it.delay, DELAY.min);
  assert.ok(Math.abs(s.at - 900) < 1e-6, `at ${s.at}`);
  assert.equal(s.a.x, 9); assert.equal(s.b.x, 9.5); assert.ok(Math.abs(s.k) < 1e-6);
});
test('old and repeated messages are ignored (M-26)', () => {
  const it = createInterp();
  assert.equal(it.push(100, 100, {}), true); assert.equal(it.push(100, 120, {}), false); assert.equal(it.push(50, 130, {}), false);
});
test('holds the newest frame when messages stop', () => {
  const it = createInterp(); it.push(0, 0, { x: 0 }); it.push(50, 50, { x: 1 });
  const s = it.sample(10000); assert.equal(s.a.x, 1); assert.equal(s.b.x, 1);
});
test('the delay grows with jitter, up to 300 ms (M-25)', () => {
  const r = makeRng(3), calm = createInterp(), rough = createInterp(), wild = createInterp();
  for (let t = 0; t < 5000; t += 50) { calm.push(t, t + 30, {}); rough.push(t, t + 30 + r.next() * 60, {}); wild.push(t, t + 30 + r.next() * 600, {}); }
  assert.equal(calm.delay, 100); assert.ok(rough.delay > 100 && rough.delay < 300, `rough ${rough.delay}`); assert.equal(wild.delay, 300);
});
test('angles and poses lerp the short way', () => {
  assert.ok(Math.abs(lerpAngle(6.2, 0.1, 0.5) - 6.2 - (0.1 + 2 * Math.PI - 6.2) / 2) < 1e-9);
  const qa = { x: 0, y: 0, z: 0, w: 1 }, qb = { x: 0, y: 0, z: 0, w: -1 }; // the same rotation
  const out = { p: {}, q: {} }; lerpPose({ p: { x: 0, y: 0, z: 0 }, q: qa }, { p: { x: 2, y: 0, z: 0 }, q: qb }, 0.5, out);
  assert.equal(out.p.x, 1); assert.ok(Math.abs(Math.abs(out.q.w) - 1) < 1e-9);
});
