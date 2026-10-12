import test from 'node:test';
import assert from 'node:assert/strict';
import { createForecast, extrapolate, newPose, FORECAST } from '../src/index.sim.js';

const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);
const yawQ = a => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const body = (x, z, o = {}) => ({ p: { x, y: 0.5, z }, q: yawQ(0), v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, dirt: 0, ...o });
test('a body moves on at its velocity and turns at its spin (M-65)', () => {
  const out = newPose(), b = body(1, 2, { v: { x: 3, y: 0, z: -1 }, w: { x: 0, y: Math.PI, z: 0 } });
  extrapolate(b, 0.5, out);
  near(out.p.x, 2.5, 1e-9, 'x'); near(out.p.z, 1.5, 1e-9, 'z'); near(out.p.y, 0.5, 1e-9, 'y');
  near(out.q.y, Math.sin(Math.PI / 4), 1e-9, 'a quarter turn about y'); near(out.q.w, Math.cos(Math.PI / 4), 1e-9, 'w');
  extrapolate({ p: { x: 1, y: 0, z: 0 }, q: yawQ(0) }, 1, out); near(out.p.x, 1, 0, 'a record with no velocity holds still');
});
test('a record that disagrees with the forecast fades in; a far one jumps (M-65)', () => {
  const fc = createForecast(1), b = body(0, 0); fc.push(0, [b]); fc.sample(0, 0); near(fc.poses[0].p.x, 0, 1e-9, 'first record: where it is');
  fc.push(50, [body(0.5, 0)]); fc.sample(50, 50); near(fc.poses[0].p.x, 0, 1e-9, 'no jump');
  fc.sample(150, 150); const x1 = fc.poses[0].p.x; assert.ok(x1 > 0.25 && x1 < 0.5, `fading: ${x1}`);
  fc.sample(650, 650); near(fc.poses[0].p.x, 0.5, 0.01, 'there within half a second');
  fc.push(700, [body(0.5 + FORECAST.snap + 1, 0)]); fc.sample(700, 700); near(fc.poses[0].p.x, 0.5 + FORECAST.snap + 1, 1e-9, 'a respawn jumps');
  fc.push(750, [body(0, 0, { q: yawQ(1) })]); fc.sample(750, 750); fc.sample(1500, 1500); near(fc.poses[0].q.y, Math.sin(0.5), 1e-3, 'a turn fades in too');
});
test('the forecast holds 250 ms past the newest record when records stop (M-65)', () => {
  const fc = createForecast(1); fc.push(0, [body(0, 0, { v: { x: 6, y: 0, z: 0 } })]);
  fc.sample(100, 100); near(fc.poses[0].p.x, 0.6, 1e-9, 'moving on'); fc.sample(5000, 5000); near(fc.poses[0].p.x, 6 * FORECAST.horizon / 1000, 1e-9, 'then holds');
});
