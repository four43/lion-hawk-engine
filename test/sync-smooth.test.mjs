import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newOffset, addFix, fade, applyOffset, active } from '../src/view/sync/smooth.js';

const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const fixOf = (seq, oldP, oldQ, newP, newQ) => {
  const dq = oldQ.clone().multiply(newQ.clone().invert());
  return { seq, dp: [oldP.x - newP.x, oldP.y - newP.y, oldP.z - newP.z], dq: [dq.x, dq.y, dq.z, dq.w] };
};
const drawn = (o, p, q) => { const pp = p.clone(), qq = q.clone(); applyOffset(o, pp, qq); return [pp, qq]; };

test('3g: after a correction the drawn pose is the pose before it: never a jump (N-15)', () => {
  const o = newOffset(), oldP = new THREE.Vector3(5, 1, 2), newP = new THREE.Vector3(4, 1, 2.5), oldQ = E(0.2, 0.9, 0), newQ = E(0, 0.4, 0.1);
  addFix(o, fixOf(1, oldP, oldQ, newP, newQ), 150);
  const [p, q] = drawn(o, newP, newQ);
  assert.ok(p.distanceTo(oldP) < 1e-12); assert.ok(1 - Math.abs(q.dot(oldQ)) < 1e-12);
  assert.equal(o.seq, 1); assert.equal(active(o), true);
});
test('3g: corrections stack: a second jump while the first still shows keeps the drawn pose continuous (N-15)', () => {
  const o = newOffset(), A = new THREE.Vector3(0, 0, 0), B = new THREE.Vector3(1, 0, 0), C = new THREE.Vector3(1, 2, 0), qA = E(0.3, 0, 0), qB = E(0, 0.5, 0), qC = E(0, 0, 0.7);
  addFix(o, fixOf(1, A, qA, B, qB), 150); fade(o, 0.05);
  const [dp, dq] = drawn(o, B, qB); // what is on screen now
  addFix(o, fixOf(2, B, qB, C, qC), 150);
  const [p, q] = drawn(o, C, qC);
  assert.ok(p.distanceTo(dp) < 1e-12); assert.ok(1 - Math.abs(q.dot(dq)) < 1e-12); // rotations about different axes: the product order matters
});
test('3g: the offset fades linearly to nothing over smoothMs of view time from the latest correction (N-15)', () => {
  const o = newOffset(), yaw = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
  addFix(o, { seq: 1, dp: [1, 0, 0], dq: yaw(0.6) }, 150);
  fade(o, 0.05); assert.ok(Math.abs(o.px - 2 / 3) < 1e-12);
  fade(o, 0.05); assert.ok(Math.abs(o.px - 1 / 3) < 1e-12);
  assert.ok(Math.abs(2 * Math.acos(o.qw) - 0.2) < 0.01); // nlerp: about a third of 0.6 rad left
  fade(o, 0); assert.ok(Math.abs(o.px - 1 / 3) < 1e-12); // a render the driver did not start (dt 0) fades nothing
  fade(o, 0.06); assert.deepEqual([o.px, o.qx, o.qy, o.qz, o.qw, active(o)], [0, 0, 0, 0, 1, false]);
  const p = new THREE.Vector3(3, 0, 0), q = new THREE.Quaternion(); applyOffset(o, p, q); assert.equal(p.x, 3);
});
test('3g: smoothMs 0 clears the offset (no smoothing) but still records the seq (N-17)', () => {
  const o = newOffset(); addFix(o, { seq: 1, dp: [1, 0, 0], dq: [0, 0, 0, 1] }, 150);
  addFix(o, { seq: 2, dp: [1, 0, 0], dq: [0, 0, 0, 1] }, 0);
  assert.deepEqual([o.px, o.seq, active(o)], [0, 2, false]);
});
