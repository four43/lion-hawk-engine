// E-8: place moves an entity and its body together, writing prev and curr so the view never smears across a
// teleport; socket and xfPrev read the pool into caller-owned objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool, INTERNAL, DYNAMIC, KINEMATIC, FIXED, BODILESS, STRIDE, PREV, CURR } from '../src/sim/world/pool.js';
import { createPlacer } from '../src/sim/world/place.js';
import { R } from './fixtures/phys/rapier.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const TOKEN = {};
function rig() {
  const pool = createPool(4), rw = new R.World({ x: 0, y: -9.81, z: 0 });
  const placer = createPlacer(pool, () => rw, TOKEN);
  const ent = (id, kind = BODILESS, body) => {
    const e = { id, tags: new Set() };
    if (body) e.body = body;
    Object.defineProperty(e, INTERNAL, { value: { world: TOKEN, slot: pool.alloc(), kind, dead: false, awake: 0 } });
    return e;
  };
  return { pool, rw, placer, ent, half: (e, at) => [...pool.buf.subarray(e[INTERNAL].slot * STRIDE + at, e[INTERNAL].slot * STRIDE + at + 7)] };
}

test('place { at } writes prev and curr and keeps the rotation unless yaw or q is given', () => {
  const { placer, ent, half, rw } = rig(), e = ent(1);
  try {
    placer.place(e, { at: [1, 2, 3] }, { yaw: Math.PI / 2 });
    const s = Math.SQRT1_2;
    assert.deepEqual(half(e, PREV), half(e, CURR));
    const [x, y, z, qx, qy, qz, qw] = half(e, CURR);
    assert.deepEqual([x, y, z, qx, qz], [1, 2, 3, 0, 0]); near(qy, s); near(qw, s);
    placer.place(e, { at: [4, 5, 6] });
    near(half(e, CURR)[4], s, 1e-12);
    placer.place(e, { at: [0, 0, 0] }, { q: [0, 0, 2, 0] });
    assert.deepEqual(half(e, CURR).slice(3), [0, 0, 1, 0], 'q is normalised');
  } finally { rw.free(); }
});
test('place { rel, local } offsets in the other entity\'s frame and composes the rotation', () => {
  const { placer, ent, half, rw } = rig(), a = ent(1), b = ent(2);
  try {
    placer.place(a, { at: [10, 0, 0] }, { yaw: Math.PI / 2 });
    placer.place(b, { rel: a, local: [0, 0, 2] });
    const [x, y, z] = half(b, CURR);
    near(x, 12); near(y, 0); near(z, 0, 1e-12); // local +z turns to +x under a 90° yaw
    assert.deepEqual(half(b, CURR).slice(3).map(v => +v.toFixed(12)), half(a, CURR).slice(3).map(v => +v.toFixed(12)));
    placer.place(b, { rel: a, local: [0, 0, 0] }, { yaw: Math.PI / 2 });
    near(half(b, CURR)[4], 1, 1e-12); // two quarter turns about y
  } finally { rw.free(); }
});
test('a dynamic body is moved, woken and stopped; keep keeps its velocity', () => {
  const { placer, ent, rw } = rig();
  try {
    const body = rw.createRigidBody(R.RigidBodyDesc.dynamic());
    rw.createCollider(R.ColliderDesc.ball(0.5), body);
    const e = ent(1, DYNAMIC, body);
    body.sleep(); body.setLinvel({ x: 3, y: 0, z: 0 }, false);
    placer.place(e, { at: [0, 5, 0] }, { keep: true });
    assert.equal(body.isSleeping(), false);
    assert.deepEqual({ ...body.translation() }, { x: 0, y: 5, z: 0 });
    assert.equal(body.linvel().x, 3);
    assert.equal(e[INTERNAL].awake, 1);
    placer.place(e, { at: [0, 6, 0] });
    assert.deepEqual({ ...body.linvel() }, { x: 0, y: 0, z: 0 });
  } finally { rw.free(); }
});
test('a kinematic body gets its next pose; a fixed body moves its colliders at once', () => {
  const { placer, ent, rw } = rig();
  try {
    const k = rw.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    placer.place(ent(1, KINEMATIC, k), { at: [2, 0, 0] });
    assert.deepEqual({ ...k.nextTranslation() }, { x: 2, y: 0, z: 0 });
    const f = rw.createRigidBody(R.RigidBodyDesc.fixed()), c = rw.createCollider(R.ColliderDesc.ball(1), f);
    placer.place(ent(2, FIXED, f), { at: [5, 0, 0] });
    assert.deepEqual({ ...c.translation() }, { x: 5, y: 0, z: 0 }, 'no step needed for queries to see it');
  } finally { rw.free(); }
});
test('socket and xfPrev fill caller-owned out objects', () => {
  const { placer, ent, pool, rw } = rig(), e = ent(1);
  try {
    e.sockets = Object.freeze({ hat: Object.freeze({ p: [0, 0, 1], q: [0, 0, 0, 1], part: 'body' }) });
    placer.place(e, { at: [1, 0, 0] }, { yaw: Math.PI / 2 });
    const out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
    assert.equal(placer.socket(e, 'hat', out), out);
    near(out.p.x, 2); near(out.p.y, 0); near(out.p.z, 0, 1e-12);
    near(out.q.y, Math.SQRT1_2);
    assert.throws(() => placer.socket(e, 'cap', out), /world\.socket: entity 1 has no socket 'cap'/);
    pool.write(e[INTERNAL].slot, PREV, { x: 7, y: 7, z: 7 }, { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(placer.xfPrev(e).p, { x: 7, y: 7, z: 7 });
  } finally { rw.free(); }
});
test('bad targets and foreign or dead entities throw', () => {
  const { placer, ent, rw } = rig(), e = ent(1);
  try {
    assert.throws(() => placer.place(e, { at: [1, 2] }), /world\.place: at must be \[x, y, z\]/);
    assert.throws(() => placer.place(e, {}), /world\.place: target must be \{ at: \[x, y, z\] \} or \{ rel: entity, local: \[x, y, z\] \}/);
    assert.throws(() => placer.place(e, { at: [0, 0, 0] }, { q: [0, 0, 0, 0] }), /world\.place: q must be a non-zero \[x, y, z, w\]/);
    assert.throws(() => placer.place(e, { at: [0, 0, 0] }, { yaw: NaN }), /world\.place: yaw must be a finite number/);
    assert.throws(() => placer.place({ id: 9 }, { at: [0, 0, 0] }), /world\.place: not a live entity of this World/);
    const other = { id: 3 }; Object.defineProperty(other, INTERNAL, { value: { world: {}, slot: 0, kind: BODILESS, dead: false } });
    assert.throws(() => placer.place(other, { at: [0, 0, 0] }), /not a live entity of this World/);
    const noXf = { id: 4 }; Object.defineProperty(noXf, INTERNAL, { value: { world: TOKEN, slot: -1, kind: BODILESS, dead: false } });
    assert.throws(() => placer.place(noXf, { at: [0, 0, 0] }), /world\.place: entity 4 has no xf/);
  } finally { rw.free(); }
});
