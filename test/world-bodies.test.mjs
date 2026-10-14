// E-5, M-4, M-6, D3: spawn makes the body and its colliders in the same call, with registry materials, group masks,
// event flags and mass from density (or scaled to body.mass, or massProps); despawn frees every Rapier object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { INTERNAL } from '../src/sim/world/pool.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { R } from './fixtures/phys/rapier.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };

const near = (a, b, rel) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);
const count = w => { let b = 0, c = 0; w.rapier.forEachRigidBody(() => b++); w.rapier.forEachCollider(() => c++); return { b, c }; };
const make = o => createWorld(stubEngine(o));

test('a model spawns its sidecar colliders on one body; mass from density matches the sidecar to 1 %', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'crate', body: 'dynamic', at: [1, 2, 3], yaw: 0.5, tags: ['crate'] });
    assert.equal(e.model, 'crate');
    assert.deepEqual({ ...e.body.translation() }, { x: 1, y: 2, z: 3 });
    assert.equal(e.colliders.length, 1);
    const [c] = e.colliders;
    assert.equal(c.part, 'body'); assert.equal(c.material, 'wood');
    near(e.body.mass(), PHYS.models.crate.mass.mass, 0.01);
    assert.equal(w.materialOf(c.collider.handle), 'wood');
    assert.equal(w.entityOf(c.collider.handle), e);
    assert.deepEqual({ ...w.stats }, { entities: 1, bodies: 1, colliders: 1, stepMs: 0, stepMsTotal: 0 });
    assert.deepEqual(Object.keys(e.sockets), []);
    assert.equal(w.spawn({ model: 'cart', body: 'dynamic' }).sockets.hat.part, 'body');
    assert.ok(Object.isFrozen(w.get(2).sockets.hat.p));
  } finally { w.dispose(); }
});
test('body.mass scales densities so the body weighs exactly that; the centre of mass stays geometric (D3)', () => {
  const w = make();
  try {
    const nat = w.spawn({ model: 'cart', body: 'dynamic' }), e = w.spawn({ model: 'cart', body: { type: 'dynamic', mass: 1400 } });
    near(e.body.mass(), 1400, 0.001);
    const a = nat.body.localCom(), b = e.body.localCom();
    assert.ok(Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4, 'com unchanged');
    near(nat.body.mass(), PHYS.models.cart.mass.mass, 0.01);
  } finally { w.dispose(); }
});
test('massProps sets mass, com and inertia exactly and zeroes collider density (D3, lh-allow)', () => {
  const w = make();
  try {
    const e = w.spawn({ tags: ['pig'], body: { type: 'dynamic', massProps: { mass: 60, com: [0, 0.1, 0], inertia: [2, 3, 4] } }, colliders: [{ shape: 'sphere', r: 0.3, material: 'pet' }] });
    near(e.body.mass(), 60, 1e-6);
    near(e.body.localCom().y, 0.1, 1e-6);
    near(e.body.principalInertia().z, 4, 1e-6);
    assert.equal(e.colliders[0].collider.density(), 0);
  } finally { w.dispose(); }
});
test('material overrides: the part, then *, then the sidecar; inline colliders replace the sidecar', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic', material: { '*': 'steel', wheel: 'rubber' } });
    assert.deepEqual(e.colliders.map(c => [c.part, c.material]), [['body', 'steel'], ['wheel', 'rubber']]);
    assert.deepEqual(e.material, { '*': 'steel', wheel: 'rubber' }, 'the material part stays on the entity');
    const i = w.spawn({ model: 'cart', body: 'dynamic', colliders: [{ shape: 'sphere', r: 1, material: 'ice' }] });
    assert.deepEqual(i.colliders.map(c => c.material), ['ice']);
    assert.equal(i.sockets.hat.part, 'body', 'sockets still come from the model');
  } finally { w.dispose(); }
});
test('colliders without a body sit on a fixed body; kinematic bodies work; lock and sleep reach Rapier', () => {
  const w = make();
  try {
    const wall = w.spawn({ tags: ['wall'], colliders: [{ shape: 'box', half: [1, 1, 1], material: 'steel' }], at: [3, 0, 0] });
    assert.equal(wall.body.isFixed(), true); assert.equal(typeof wall.xf.slot, 'number');
    assert.equal(w.spawn({ tags: ['lift'], body: 'kinematic', colliders: [{ shape: 'box', half: [1, 0.1, 1], material: 'steel' }] }).body.isKinematic(), true);
    const s = w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true, lock: { rot: true } }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }] });
    assert.equal(s.body.isSleeping(), true);
    s.body.applyTorqueImpulse({ x: 5, y: 5, z: 5 }, true);
    assert.deepEqual({ ...s.body.angvel() }, { x: 0, y: 0, z: 0 }, 'rotations locked');
  } finally { w.dispose(); }
});
test('groups, sensor and contact flags reach every collider', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic', groups: { member: ['vehicle'], filter: ['ground', 'static'] }, contacts: { min: 40 } });
    for (const { collider: c } of e.colliders) {
      assert.equal(c.collisionGroups(), w.groups.mask(['vehicle'], ['ground', 'static']));
      assert.equal(c.activeEvents(), R.ActiveEvents.CONTACT_FORCE_EVENTS);
      assert.equal(c.contactForceEventThreshold(), 40 * 60); // min × hz
    }
    const z = w.spawn({ tags: ['zone'], sensor: true, colliders: [{ shape: 'box', half: [2, 2, 2], material: 'air' }] });
    assert.equal(z.colliders[0].collider.isSensor(), true);
    assert.equal(z.colliders[0].collider.activeEvents(), R.ActiveEvents.COLLISION_EVENTS);
    assert.equal(w.spawn({ model: 'crate', body: 'dynamic' }).colliders[0].collider.collisionGroups(), 0xffffffff);
  } finally { w.dispose(); }
});
test('spawn errors name the desc and leave nothing behind', () => {
  const w = make();
  try {
    const before = count(w), ball = (m, extra = {}) => ({ tags: ['pig'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.3, material: 'pet' }, { shape: 'sphere', r: 0.3, part: 'snout', material: m }], ...extra });
    assert.throws(() => w.spawn(ball('fluff')), /world: 'pig' unknown material 'fluff' on collider 1 \(snout\)/);
    assert.throws(() => w.spawn({ model: 'tractr' }), /world: 'tractr' unknown model 'tractr'/);
    assert.throws(() => w.spawn(ball('air')), /world: 'pig' collider 1 \(snout\) has zero density \('air'\) on a dynamic body without massProps/);
    assert.throws(() => w.spawn(ball('pet', { groups: { member: ['pigs'] } })), /world: 'pig' group 'pigs' is not declared/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'dynamic', mass: 1, massProps: { mass: 1, com: [0, 0, 0], inertia: [1, 1, 1] } } })), /body takes mass or massProps, not both/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'dynamic', masss: 1 } })), /world: 'pig' body\.masss is not a body option/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'kinematic', mass: 5 } })), /body\.mass needs a dynamic body/);
    assert.throws(() => w.spawn({ tags: ['ghost'], body: 'dynamic' }), /world: 'ghost' a dynamic body needs colliders or massProps/);
    assert.throws(() => w.spawn(ball('pet', { material: 'steel' })), /material must be \{ part: id \}/);
    assert.throws(() => w.spawn({ tags: ['rock'], colliders: [{ shape: 'cone', material: 'steel' }] }), /world: 'rock' collider 0 \(body\): unknown collider shape 'cone'/);
    assert.deepEqual(count(w), before);
    assert.equal(w.stats.entities, 0);
    assert.equal(w.spawn(ball('pet')).id, 1);
  } finally { w.dispose(); }
});
test('a collider needs a registry: without one the spawn says so', () => {
  const w = createWorld(stubEngine({ materials: null }));
  try { assert.throws(() => w.spawn({ model: 'crate', body: 'dynamic' }), /world: 'crate' collider 0 \(body\) needs a material registry: set defs\.materials/); } finally { w.dispose(); }
});
test('despawn frees the body, its colliders and owned joints; maps and counters follow (E-7)', () => {
  const w = make();
  try {
    const a = w.spawn({ model: 'cart', body: 'dynamic', tags: ['cart'] }), b = w.spawn({ model: 'crate', body: 'dynamic', at: [-2, 0, 0], tags: ['tow'] });
    const h = a.colliders[0].collider.handle;
    const j = w.joint(a, b, R.JointData.spherical({ x: -1.2, y: 0.3, z: 0 }, { x: 0.8, y: 0.5, z: 0 }));
    assert.equal(j.isValid(), true);
    const freed = []; w.own(a, () => freed.push('first')); w.own(a, () => freed.push('second'));
    w.despawn(a);
    assert.equal(j.isValid(), false);
    assert.deepEqual(freed.slice(0, 2), ['second', 'first'], 'owned frees run newest first');
    assert.equal(w.rapier.getCollider(h), null);
    assert.equal(w.materialOf(h), undefined); assert.equal(w.entityOf(h), undefined);
    assert.equal(a.body, undefined); assert.equal(a.colliders, undefined);
    assert.deepEqual(count(w), { b: 1, c: 1 });
    assert.deepEqual({ ...w.stats, stepMs: 0, stepMsTotal: 0 }, { entities: 1, bodies: 1, colliders: 1, stepMs: 0, stepMsTotal: 0 });
    assert.equal(b[INTERNAL].own?.length ?? 0, 0, 'the freed joint left no closure on b');
    w.despawn(b); // its side of the joint is already gone: no double free
    assert.deepEqual(count(w), { b: 0, c: 0 });
    assert.throws(() => w.joint(a, b, R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })), /world\.joint: both entities need a body/);
  } finally { w.dispose(); }
});
test('setMaterial swaps friction and restitution; density changes recompute mass', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'crate', body: 'dynamic' });
    w.setMaterial(e, '*', 'ice');
    const c = e.colliders[0].collider;
    near(c.friction(), Math.sqrt(0.04), 1e-6);
    assert.equal(e.colliders[0].material, 'ice'); assert.equal(w.materialOf(c.handle), 'ice');
    near(e.body.mass(), 920, 1e-4);
    w.setMaterial(e, 'body', 'steel');
    near(e.body.mass(), 7850, 1e-4);
    assert.throws(() => w.setMaterial(e, 'wheel', 'ice'), /world\.setMaterial: entity 1 has no collider on part 'wheel'/);
    assert.throws(() => w.setMaterial(e, '*', 'mud'), /world\.setMaterial: unknown material 'mud'/);
    assert.throws(() => w.setMaterial(e, '*', 'air'), /world\.setMaterial: 'air' has zero density and entity 1 is dynamic without massProps/);
  } finally { w.dispose(); }
});
test('place and socket go through the World (E-8)', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic' });
    w.place(e, { at: [0, 3, 0] }, { yaw: Math.PI });
    assert.equal(e.body.translation().y, 3);
    const s = w.socket(e, 'hat', { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    assert.ok(Math.abs(s.p.y - 3.75) < 1e-9);
    assert.throws(() => { e.xf.p.x = 1; }, /world: entity 1 has a body: move it with world\.place/);
  } finally { w.dispose(); }
});
