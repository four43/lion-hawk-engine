// The World's step pieces (overview §4.4): swap → (game) → Rapier step → read → events; #2 re-sleep; the digest;
// world.heightfield; clear() with physics; the timer; audit().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { R } from './fixtures/phys/rapier.js';

const step = (w, n = 1) => { for (let i = 0; i < n; i++) { w.sys.swap(); w.sys.step(); w.sys.read(); w.sys.events(); } };
const ground = (w, material = 'gravel') => w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [20, 0.5, 20], p: [0, -0.5, 0], material }], groups: { member: ['ground'] } });
const prevY = (w, e) => w.xfPrev(e).p.y;

test('swap copies curr to prev; the read writes curr after the Rapier step; bodiless entities keep prev == curr', () => {
  const w = createWorld(stubEngine());
  try {
    const c = w.spawn({ model: 'crate', body: 'dynamic', at: [0, 5, 0] }), m = w.spawn({ tags: ['m'], xf: true });
    m.xf.p.x = 1;
    assert.equal(w.xfPrev(m).p.x, 0, 'a write lands in curr only');
    w.sys.swap();
    assert.equal(w.xfPrev(m).p.x, 1);
    w.sys.step(); w.sys.read();
    assert.equal(prevY(w, c), 5); assert.ok(c.xf.p.y < 5);
    assert.equal(c.xf.p.y, c.body.translation().y);
    const y1 = c.xf.p.y; step(w);
    assert.equal(prevY(w, c), y1); assert.equal(w.xfPrev(m).p.x, 1);
  } finally { w.dispose(); }
});
test('Rapier 0.21 wakes a body inserted asleep on its first step (#2 is real)', () => {
  const rw = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    rw.createCollider(R.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0));
    const b = rw.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.6, 0).setCanSleep(true).setSleeping(true));
    rw.createCollider(R.ColliderDesc.cuboid(0.06, 0.6, 0.045), b);
    rw.step();
    assert.equal(b.isSleeping(), false, 'if this fails, Rapier fixed #2: keep the re-sleep (harmless) and note it');
  } finally { rw.free(); }
});
test('a post spawned asleep on the ground stays asleep and standing; a knocked one stays awake (#2)', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const post = at => w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }], at, groups: { member: ['prop'] } });
    const still = post([0, 0.6, 0]), hit = post([3, 0.6, 0]);
    hit.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
    step(w);
    assert.equal(still.body.isSleeping(), true);
    assert.equal(hit.body.isSleeping(), false);
    step(w, 120);
    assert.equal(still.body.isSleeping(), true);
    assert.ok(Math.abs(still.xf.p.y - 0.6) < 0.01 && Math.abs(still.xf.q.w) > 0.999, 'still upright');
  } finally { w.dispose(); }
});
test('the step a body falls asleep is read: the pool matches Rapier exactly once it sleeps', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const b = w.spawn({ tags: ['ball'], body: { type: 'dynamic', canSleep: true }, colliders: [{ shape: 'sphere', r: 0.5, material: 'grip' }], at: [0, 0.6, 0] });
    let k = 0;
    while (!b.body.isSleeping() && k++ < 900) step(w);
    assert.ok(b.body.isSleeping(), 'the ball fell asleep');
    const t = b.body.translation();
    assert.deepEqual([b.xf.p.x, b.xf.p.y, b.xf.p.z], [t.x, t.y, t.z]);
  } finally { w.dispose(); }
});
test('contact and sensor events come out through engine.emit with entity ids and materials', () => {
  const e = stubEngine(), w = createWorld(e);
  try {
    const g = ground(w, 'grip');
    const c = w.spawn({ model: 'crate', body: 'dynamic', at: [0, 1.5, 0], contacts: { min: 0.5 } });
    const z = w.spawn({ tags: ['zone'], sensor: true, colliders: [{ shape: 'box', half: [1, 0.25, 1], material: 'air' }], at: [0, 2.5, 0] });
    const b = w.spawn({ tags: ['ball'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.2, material: 'rubber' }], at: [3, 4, 0] });
    w.place(z, { at: [3, 2.5, 0] });
    step(w, 120);
    const hit = e.events.find(x => x.type === 'contact');
    assert.ok(hit, 'the crate landed above 0.5 N·s');
    assert.deepEqual([hit.a, hit.b].sort(), [g.id, c.id].sort());
    assert.equal(hit.materials[[hit.a, hit.b].indexOf(c.id)], 'wood');
    const sens = e.events.filter(x => x.type === 'sensor');
    assert.deepEqual(sens.map(x => [x.sensor, x.other, x.on]), [[z.id, b.id, true], [z.id, b.id, false]]);
  } finally { w.dispose(); }
});
test('digest: same build, same digest; it moves with poses and velocities and counts entities', () => {
  const build = () => { const w = createWorld(stubEngine()); ground(w); w.spawn({ model: 'crate', body: 'dynamic', at: [0, 3, 0] }); w.spawn({ tags: ['m'], xf: true }); return w; };
  const a = build(), b = build();
  try {
    assert.deepEqual(a.digest(), b.digest());
    assert.equal(a.digest().n, 3); assert.match(a.digest().sum, /^[0-9a-f]{8}$/);
    step(a, 10); step(b, 10);
    assert.deepEqual(a.digest(), b.digest(), 'Rapier is deterministic in one process');
    const before = a.digest().sum;
    a.get(2).body.setLinvel({ x: 0, y: 0, z: 1e-9 }, true);
    assert.notEqual(a.digest().sum, before, 'a velocity change shows');
    b.get(3).xf.p.z = 1e-12;
    assert.notEqual(b.digest().sum, before, 'a bodiless pose change shows');
  } finally { a.dispose(); b.dispose(); }
});
test('world.heightfield: a ground entity a ball rests on at the analytic height', () => {
  const w = createWorld(stubEngine());
  try {
    const nx = 9, nz = 7, cell = 1.5, x0 = -4, z0 = -3, h = (x, z) => 0.1 * x + 0.3 * z, heights = [];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) heights.push(h(x0 + ix * cell, z0 + iz * cell));
    const f = w.heightfield({ nx, nz, cell, x0, z0, heights, material: 'grass' });
    assert.ok(f.tags.has('heightfield')); assert.deepEqual(f.heightfield, { nx, nz, cell, x0, z0 });
    assert.equal(f.body, undefined); assert.equal(f.xf, undefined);
    const c = f.colliders[0].collider;
    assert.equal(w.materialOf(c.handle), 'grass'); assert.equal(c.collisionGroups(), w.groups.mask(['ground']));
    const ball = w.spawn({ tags: ['ball'], body: { type: 'dynamic', lock: { rot: true } }, colliders: [{ shape: 'sphere', r: 0.25, material: 'grip' }], at: [6, h(6, 2) + 0.4, 2] });
    step(w, 240);
    const { x, y, z } = ball.xf.p, lift = 0.25 * Math.sqrt(1 + 0.1 ** 2 + 0.3 ** 2);
    assert.ok(Math.abs(y - (h(x, z) + lift)) < 0.02, `rests at ${y}, expected ${h(x, z) + lift}`);
    assert.throws(() => w.place(f, { at: [0, 0, 0] }), /world\.place: entity 1 has no xf/);
    assert.throws(() => w.heightfield({ nx, nz, cell, heights, material: 'lava' }), /world: 'heightfield' unknown material 'lava'/);
    assert.throws(() => w.heightfield({ nx, nz, cell, heights, material: 'grass', tags: 'ground' }), /world: 'heightfield' tags must be an array/);
    w.despawn(f);
    assert.equal(w.rapier.getCollider(c.handle), null);
  } finally { w.dispose(); }
});
test('clear() with physics: a fresh Rapier world, owned frees before the old one goes, ids and stats reset', () => {
  const w = createWorld(stubEngine());
  try {
    const a = w.spawn({ model: 'cart', body: 'dynamic' }), b = w.spawn({ model: 'crate', body: 'dynamic', at: [-2, 0, 0] });
    const j = w.joint(a, b, R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })), old = w.rapier;
    let validAtFree;
    w.own(b, () => { validAtFree = j.isValid(); }); // b is released first and frees the shared joint; a's side would see it freed
    w.clear();
    assert.equal(validAtFree, true, 'owned frees run while the old Rapier world is alive');
    assert.notEqual(w.rapier, old);
    assert.deepEqual({ ...w.stats, stepMs: 0, stepMsTotal: 0 }, { entities: 0, bodies: 0, colliders: 0, stepMs: 0, stepMsTotal: 0 });
    assert.equal(w.spawn({ model: 'crate', body: 'dynamic' }).id, 1);
    step(w, 2);
  } finally { w.dispose(); }
});
test('world.heightfield forwards fixInternalEdges to Rapier (3h C2)', () => {
  const flags = [];
  const RR = { ...R, ColliderDesc: { __proto__: R.ColliderDesc, heightfield: (...a) => { flags.push(a[4]); return R.ColliderDesc.heightfield(...a); } } };
  const w = createWorld(stubEngine(), { rapier: RR });
  try {
    const f = { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 0], material: 'grass' };
    w.heightfield({ ...f, fixInternalEdges: true }); w.heightfield(f);
    assert.deepEqual(flags, [R.HeightFieldFlags.FIX_INTERNAL_EDGES, undefined]);
  } finally { w.dispose(); }
});
test('despawn and dispose with physics: owned frees run before Rapier objects and the Rapier world go (3h C3)', () => {
  const w = createWorld(stubEngine()), seen = [];
  const a = w.spawn({ model: 'crate', body: 'dynamic' }), b = w.spawn({ model: 'crate', body: 'dynamic', at: [3, 0, 0] });
  const ha = a.body.handle, hb = b.body.handle;
  w.own(a, () => seen.push(['a', w.rapier.getRigidBody(ha) != null]));
  w.own(b, () => seen.push(['b', w.rapier !== null && w.rapier.getRigidBody(hb) != null]));
  w.own(() => seen.push(['world', w.rapier !== null]));
  w.despawn(a);
  w.dispose();
  assert.deepEqual(seen, [['a', true], ['b', true], ['world', true]]);
  assert.equal(w.rapier, null);
});
test('with a timer, stats.stepMs is the last Rapier step (#106); disposed Worlds ignore sys calls', () => {
  let t = 0;
  const w = createWorld(stubEngine(), { timer: () => (t += 2) });
  w.spawn({ model: 'crate', body: 'dynamic' });
  step(w, 3);
  assert.equal(w.stats.stepMs, 2); assert.equal(w.stats.stepMsTotal, 6);
  w.dispose();
  step(w); // no throw
  assert.equal(w.stats.stepMs, 0);
});
test('audit lists raw colliders whose combine rules override the engine\'s', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const raw = w.rapier.createCollider(R.ColliderDesc.ball(1).setFrictionCombineRule(R.CoefficientCombineRule.Max));
    assert.deepEqual(w.audit(), [{ handle: raw.handle, entity: null, friction: 'Max', restitution: 'Average' }]);
  } finally { w.dispose(); }
});
