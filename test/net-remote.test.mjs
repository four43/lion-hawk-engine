// test/net-remote.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, actions, axis, button, extrapolate, newPose } from '../src/index.sim.js';
import { createInputQueue, latencyMs, newTarget, project, poseError, decide, nudgeVelocity, writeKinematic, writePool, setNetFix, QUEUE, MAX_ANGLE } from '../src/sim/net/remote.js';
import { qmul } from '../src/core/math.js';

const ACTF = F.actions(actions({ thr: axis(), honk: button() }));
const yawQ = a => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const TUNE = { snapAt: 1.5, nudge: 6, smoothMs: 150 };

test('3i: the input queue dedupes batches by owner step, plays oldest first, holds when empty, and drops to the newest 2 past 4 (N-13)', () => {
  const q = createInputQueue(ACTF), out = { thr: 0, honk: false };
  q.offer({ s: 3, list: [{ thr: 0.1 }, { thr: 0.2 }, { thr: 0.3, honk: true }] });
  q.offer({ s: 4, list: [{ thr: 0.2 }, { thr: 0.3 }, { thr: 0.4 }] });
  assert.equal(q.size, 4, 'steps 1..4, each once'); assert.equal(q.last, 4);
  assert.equal(q.take(out), true); assert.equal(out.thr, 0.1); assert.equal(q.used, 1); assert.equal(q.size, 3);
  q.offer({ s: 9, list: [{ thr: 0.5 }, { thr: 0.6 }, { thr: 0.7 }, { thr: 0.8 }, { thr: 0.9 }] });
  assert.equal(q.size, 8);
  assert.equal(q.take(out), true); assert.equal(out.thr, 0.8, 'past 4: only the newest 2 were kept, then one taken'); assert.equal(q.used, 8); assert.equal(q.size, 1);
  assert.equal(q.take(out), true); assert.equal(out.thr, 0.9);
  assert.equal(q.take(out), false, 'empty'); assert.equal(out.thr, 0.9, 'the last input is held'); assert.equal(q.used, 9);
  q.offer({ s: 9, list: [{ thr: 0.1 }] }); assert.equal(q.size, 0, 'an old step is ignored');
  for (let s = 10; s < 40; s += 8) q.offer({ s: s + 7, list: Array.from({ length: 8 }, (_, i) => ({ thr: (s + i) / 100 })) });
  assert.ok(q.size <= QUEUE.cap, 'never past its cap');
});
test('3i: latency is the interp offset when it can be one, else 0 (Contract issue 4)', () => {
  assert.equal(latencyMs(80), 80); assert.equal(latencyMs(300), 250, 'capped'); assert.equal(latencyMs(-5), 0, 'clocks not shared');
  assert.equal(latencyMs(5000), 0, 'clocks not shared'); assert.equal(latencyMs(0), 0);
});
test('3i: project moves a snapshot on by its velocity and spin and keeps them (N-14)', () => {
  const t = newTarget(), rec = { p: { x: 0, y: 1, z: 0 }, q: yawQ(0), v: { x: 2, y: 0, z: -1 }, w: { x: 0, y: Math.PI, z: 0 } };
  project(rec, 100, t);
  assert.ok(Math.abs(t.p.x - 0.2) < 1e-12); assert.ok(Math.abs(t.p.z + 0.1) < 1e-12); assert.ok(Math.abs(t.q.y - Math.sin(Math.PI * 0.1 / 2)) < 1e-12);
  assert.deepEqual(t.v, { x: 2, y: 0, z: -1 }); assert.deepEqual(t.w, { x: 0, y: Math.PI, z: 0 }); assert.equal(t.left, 0);
});
test('3i: decide: nudge under snapAt and under 30 degrees, else snap (N-14)', () => {
  const t = newTarget(); t.q = yawQ(0);
  const at = (d, deg) => decide(poseError({ x: d, y: 0, z: 0 }, yawQ(deg * Math.PI / 180), t), TUNE);
  assert.equal(at(1.49, 0), 'nudge'); assert.equal(at(1.5, 0), 'snap'); assert.equal(at(0, 29), 'nudge'); assert.equal(at(0, 31), 'snap');
  assert.ok(Math.abs(poseError({ x: 0, y: 0, z: 0 }, yawQ(0.4), t).angle - 0.4) < 1e-9); assert.equal(MAX_ANGLE, Math.PI / 6);
});
test('3i: nudgeVelocity reaches a moving target in exactly `nudge` steps, position and yaw (N-14)', () => {
  const dt = 1 / 60, c = newTarget(), V = { x: 0, y: 0, z: 0 }, W = { x: 0, y: 0, z: 0 };
  project({ p: { x: 1, y: 0, z: 0.5 }, q: yawQ(20 * Math.PI / 180), v: { x: 2, y: 0, z: 0 }, w: { x: 0, y: 1, z: 0 } }, 0, c); c.left = TUNE.nudge;
  const body = { p: { x: 0, y: 0, z: 0 }, q: yawQ(0), v: V, w: W }, next = newPose();
  let steps = 0;
  while (c.left > 0) { nudgeVelocity(c, body.p, body.q, dt, V, W); extrapolate(body, dt, next); body.p.x = next.p.x; body.p.y = next.p.y; body.p.z = next.p.z; Object.assign(body.q, next.q); steps++; }
  assert.equal(steps, 6);
  assert.ok(poseError(body.p, body.q, c).d < 1e-9, `position error ${poseError(body.p, body.q, c).d}`);
  assert.ok(poseError(body.p, body.q, c).angle < 1e-6, `yaw error ${poseError(body.p, body.q, c).angle}`);
  assert.ok(Math.abs(V.x - (2 + (1 / 6) / dt)) < 1e-9, `on the last step the velocity is the target's plus the last error (1/6 m over dt): ${V.x}`);
});
test('3i: pose writers: kinematic next pose for a proxy body, the pool for a view entity', () => {
  const calls = [], body = { setNextKinematicTranslation: p => calls.push(['t', { ...p }]), setNextKinematicRotation: q => calls.push(['r', { ...q }]) };
  const pose = { p: { x: 1, y: 2, z: 3 }, q: yawQ(1) };
  writeKinematic({ body }, pose); assert.deepEqual(calls, [['t', pose.p], ['r', pose.q]]);
  const ent = { xf: { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } } }; writePool(ent, pose);
  assert.deepEqual(ent.xf.p, pose.p); assert.deepEqual(ent.xf.q, pose.q);
});
test('3i: setNetFix records old − new in 3g\'s convention (new + dp = old, dq ⊗ new = old), counts up, and keeps one object (N-15, §4.9, 3g #2)', () => {
  const ent = {};
  const f = setNetFix(ent, { x: 5, y: 1, z: 0 }, yawQ(0.5), { x: 0, y: 1, z: 0 }, yawQ(0.2));
  assert.equal(f.seq, 1); assert.deepEqual(f.dp, [5, 0, 0]);
  assert.ok(Math.abs(f.dq[1] - Math.sin(0.15)) < 1e-12 && Math.abs(f.dq[3] - Math.cos(0.15)) < 1e-12, 'a 0.3 rad yaw jump');
  assert.equal(setNetFix(ent, { x: 0, y: 0, z: 0 }, yawQ(0), { x: 0, y: 0, z: 0 }, yawQ(0)), f); assert.equal(f.seq, 2);
  const unit = q => { const l = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; };
  const qOld = unit({ x: 0.3, y: 0.5, z: -0.2, w: 0.8 }), qNew = unit({ x: -0.4, y: 0.1, z: 0.6, w: 0.7 }); // not about one axis: the order matters
  setNetFix(ent, { x: 1, y: 2, z: 3 }, qOld, { x: -1, y: 0.5, z: 4 }, qNew);
  assert.deepEqual([-1 + f.dp[0], 0.5 + f.dp[1], 4 + f.dp[2]], [1, 2, 3], 'drawn p = new + dp = old');
  const drawn = qmul({ x: f.dq[0], y: f.dq[1], z: f.dq[2], w: f.dq[3] }, qNew, { x: 0, y: 0, z: 0, w: 1 }); // 3g: drawn = offset ⊗ pose
  for (const c of ['x', 'y', 'z', 'w']) assert.ok(Math.abs(drawn[c] - qOld[c]) < 1e-12, `drawn q.${c} is the old pose's`);
});
