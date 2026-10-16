// §4.5 world.joint(a, b, desc): the descriptor form { type, a, b, axis?, limits? } builds JointData from the injected
// Rapier (world.R); raw JointData still works; a bad descriptor throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { R } from './fixtures/phys/rapier.js';

const step = (w, n = 1) => { for (let i = 0; i < n; i++) { w.sys.swap(); w.sys.step(); w.sys.read(); w.sys.events(); } };
const box = half => [{ shape: 'box', half: [half, half, half], material: 'wood' }];
// a fixed post at the origin and a dynamic bob 2 m out on +x; every joint below meets at the post's centre
function rig(w) {
  const post = w.spawn({ tags: ['post'], body: 'fixed', colliders: box(0.1), at: [0, 0, 0] });
  const bob = w.spawn({ tags: ['bob'], body: { type: 'dynamic', mass: 10 }, colliders: box(0.2), at: [2, 0, 0] });
  return { post, bob };
}
const pos = e => ({ ...e.body.translation() });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('unjointed, the bob falls (control)', () => {
  const w = createWorld(stubEngine());
  try { const { bob } = rig(w); step(w, 60); assert.ok(pos(bob).y < -3, `fell to ${pos(bob).y}`); } finally { w.dispose(); }
});

test("descriptor 'spherical' keeps the bob 2 m from the pivot while it swings", () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    const j = w.joint(post, bob, { type: 'spherical', a: [0, 0, 0], b: [-2, 0, 0] });
    assert.equal(j.isValid(), true);
    step(w, 60);
    const p = pos(bob);
    near(Math.hypot(p.x, p.y, p.z), 2, 0.05, 'radius');
    assert.ok(p.y < -0.5, `swung down to ${p.y}`);
  } finally { w.dispose(); }
});

test("descriptor 'revolute' swings the bob in the plane normal to its axis", () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    bob.body.applyImpulse({ x: 0, y: 0, z: 30 }, true); // a push out of the plane: the hinge must refuse it
    w.joint(post, bob, { type: 'revolute', a: [0, 0, 0], b: [-2, 0, 0], axis: [0, 0, 2] }); // axis is normalised
    step(w, 60);
    const p = pos(bob);
    near(p.z, 0, 0.02, 'z'); near(Math.hypot(p.x, p.y), 2, 0.05, 'radius');
    assert.ok(p.y < -0.5, `swung down to ${p.y}`);
  } finally { w.dispose(); }
});

test("descriptor 'fixed' holds the bob where it is", () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    w.joint(post, bob, { type: 'fixed', a: [0, 0, 0], b: [-2, 0, 0] });
    step(w, 60);
    const p = pos(bob);
    near(p.x, 2, 0.05, 'x'); near(p.y, 0, 0.05, 'y'); near(p.z, 0, 0.02, 'z');
  } finally { w.dispose(); }
});

test("descriptor 'prismatic' with limits slides the bob along its axis and stops it at the limit", () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    w.joint(post, bob, { type: 'prismatic', a: [0, 0, 0], b: [-2, 0, 0], axis: [0, 1, 0], limits: [-0.5, 0.5] });
    step(w, 120);
    const p = pos(bob);
    near(p.x, 2, 0.02, 'x'); near(p.z, 0, 0.02, 'z');
    near(p.y, -0.5, 0.05, 'stopped at the lower limit');
  } finally { w.dispose(); }
});

test('raw Rapier JointData still works, and both forms free with the entity', () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    const j = w.joint(post, bob, w.R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: -2, y: 0, z: 0 }));
    const k = w.joint(post, bob, { type: 'spherical', a: [0, 0, 0], b: [-2, 0, 0] });
    step(w, 60);
    near(Math.hypot(...Object.values(pos(bob))), 2, 0.05, 'radius');
    w.despawn(bob);
    assert.equal(j.isValid(), false); assert.equal(k.isValid(), false);
    assert.equal(w.R, R);
  } finally { w.dispose(); }
});

test('a bad descriptor throws a clear error and makes no joint', () => {
  const w = createWorld(stubEngine());
  try {
    const { post, bob } = rig(w);
    const joints = () => { let n = 0; w.rapier.impulseJoints.forEach(() => n++); return n; };
    const bad = [
      [{ type: 'ball', a: [0, 0, 0], b: [0, 0, 0] }, /world\.joint: unknown type "ball" \(one of spherical, revolute, fixed, prismatic\)/],
      [{ a: [0, 0, 0], b: [0, 0, 0] }, /world\.joint: unknown type undefined/],
      [{ type: 'spherical', a: [0, NaN, 0], b: [0, 0, 0] }, /world\.joint: anchor a must be \[x, y, z\] of finite numbers/],
      [{ type: 'spherical', a: [0, 0, 0], b: [0, Infinity, 0] }, /world\.joint: anchor b must be \[x, y, z\] of finite numbers/],
      [{ type: 'spherical', a: [0, 0], b: [0, 0, 0] }, /world\.joint: anchor a must be/],
      [{ type: 'fixed', a: [0, 0, 0] }, /world\.joint: anchor b must be/],
      [{ type: 'revolute', a: [0, 0, 0], b: [0, 0, 0] }, /world\.joint: a revolute joint needs an axis/],
      [{ type: 'prismatic', a: [0, 0, 0], b: [0, 0, 0], axis: [0, 0, 0] }, /world\.joint: axis must be non-zero/],
      [{ type: 'revolute', a: [0, 0, 0], b: [0, 0, 0], axis: [0, 1, 0], limits: [1, -1] }, /world\.joint: limits must be \[lo, hi\]/],
      [{ type: 'spherical', a: [0, 0, 0], b: [0, 0, 0], limits: [-1, 1] }, /world\.joint: a spherical joint takes no limits/],
      [null, /world\.joint: needs a descriptor/],
    ];
    for (const [d, re] of bad) assert.throws(() => w.joint(post, bob, d), re, JSON.stringify(d));
    assert.equal(joints(), 0);
  } finally { w.dispose(); }
});
