import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, q4, qmul, rotate, qnorm, qslerp, vlerp, qFromYaw, mIdent, mMul, mTRS, xfP, xfN } from '../src/core/math.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearV = (a, b, eps) => ['x', 'y', 'z'].forEach(k => near(a[k], b[k], eps));
const nearQ = (a, b, eps) => ['x', 'y', 'z', 'w'].forEach(k => near(a[k], b[k], eps));

test('qFromYaw + rotate turns +X toward -Z for a positive yaw (right-handed, Y up)', () => {
  const q = qFromYaw(Math.PI / 2, q4()), v = rotate(q, v3(1, 0, 0), v3());
  nearV(v, { x: 0, y: 0, z: -1 });
  nearV(rotate(q, v, v3(), true), { x: 1, y: 0, z: 0 });
});
test('qmul composes yaws and may write into an input', () => {
  const a = qFromYaw(0.3, q4()), b = qFromYaw(0.5, q4());
  nearQ(qmul(a, b, a), qFromYaw(0.8, q4()));
});
test('qslerp takes the short way and hits both ends', () => {
  const a = qFromYaw(0.1, q4()), b = qFromYaw(0.9, q4());
  nearQ(qslerp(a, b, 0, q4()), a); nearQ(qslerp(a, b, 1, q4()), b);
  nearQ(qslerp(a, b, 0.5, q4()), qFromYaw(0.5, q4()));
  const negB = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; // same rotation, other hemisphere
  nearQ(qslerp(a, negB, 0.5, q4()), qFromYaw(0.5, q4()));
});
test('vlerp and qnorm', () => {
  nearV(vlerp(v3(0, 0, 0), v3(2, 4, 6), 0.25, v3()), { x: 0.5, y: 1, z: 1.5 });
  const q = qnorm({ x: 0, y: 2, z: 0, w: 0 }); nearQ(q, { x: 0, y: 1, z: 0, w: 0 });
});
test('mat4: TRS then transform matches rotate + scale + translate', () => {
  const q = qFromYaw(0.7, q4()), m = mTRS([1, 2, 3], [q.x, q.y, q.z, q.w], [2, 2, 2]);
  const p = xfP(m, [1, 0, 0]), r = rotate(q, v3(2, 0, 0), v3());
  near(p[0], r.x + 1); near(p[1], r.y + 2); near(p[2], r.z + 3);
  const n = xfN(m, [1, 0, 0]); near(Math.hypot(...n), 1);
  assert.deepEqual(mMul(mIdent(), m), m);
});
