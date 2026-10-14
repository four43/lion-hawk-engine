// M-4, M-9, D4: every engine collider carries √f with Multiply (so two engine colliders meet at the geometric mean
// of their materials) and restitution with Max; shapes map one to one onto Rapier's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeDesc, materialFor, applyMaterial } from '../src/sim/physics/colliders.js';
import MATERIALS from './fixtures/phys/materials.js';
import { R } from './fixtures/phys/rapier.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const withWorld = fn => { const w = new R.World({ x: 0, y: -9.81, z: 0 }); w.timestep = 1 / 60; try { return fn(w); } finally { w.free(); } };

test('each sidecar shape becomes the matching Rapier shape', () => withWorld(w => {
  const T = R.ShapeType, make = e => w.createCollider(shapeDesc(R, e));
  const box = make({ shape: 'box', half: [1, 2, 3] });
  assert.equal(box.shapeType(), T.Cuboid); assert.deepEqual({ ...box.halfExtents() }, { x: 1, y: 2, z: 3 });
  assert.equal(make({ shape: 'sphere', r: 0.5 }).radius(), 0.5);
  const rb = make({ shape: 'box', half: [1, 0.5, 2], round: 0.1 });
  assert.equal(rb.shapeType(), T.RoundCuboid); assert.equal(rb.roundRadius(), Math.fround(0.1));
  const cap = make({ shape: 'capsule', halfHeight: 1, r: 0.5 });
  assert.equal(cap.shapeType(), T.Capsule); assert.equal(cap.halfHeight(), 1);
  assert.equal(make({ shape: 'cylinder', halfHeight: 0.5, r: 0.5 }).shapeType(), T.Cylinder);
  assert.equal(make({ shape: 'hull', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }).shapeType(), T.ConvexPolyhedron);
  assert.equal(make({ shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] }).shapeType(), T.TriMesh);
}));
test('bad shapes throw before Rapier sees them', () => {
  assert.throws(() => shapeDesc(R, { shape: 'cone' }), /unknown collider shape 'cone'/);
  assert.throws(() => shapeDesc(R, { shape: 'ball', r: 1 }), /unknown collider shape 'ball' \(use 'sphere'\)/); // 3b ruling: a hint
  assert.throws(() => shapeDesc(R, { shape: 'box', half: [1, 1, 1], round: -0.1 }), /box round must be > 0/);
  assert.throws(() => shapeDesc(R, { shape: 'box', half: [1, 0, 1] }), /box half must be three sizes > 0/);
  assert.throws(() => shapeDesc(R, { shape: 'sphere', r: -1 }), /sphere r must be > 0 \(got -1\)/);
  assert.throws(() => shapeDesc(R, { shape: 'hull', points: [0, 0, 0, 1, 0, 0] }), /hull needs at least 4 points/);
  assert.throws(() => shapeDesc(R, { shape: 'mesh', vertices: [0, 0, 0], indices: [0] }), /mesh needs vertices and triangle indices/);
});
test('material precedence: the part override, then *, then the entry (spec §2.2)', () => {
  const wheel = { part: 'wheel', material: 'steel' }, body = { material: 'shell' };
  assert.equal(materialFor(wheel, undefined), 'steel');
  assert.equal(materialFor(wheel, { '*': 'wood' }), 'wood');
  assert.equal(materialFor(wheel, { '*': 'wood', wheel: 'rubber' }), 'rubber');
  assert.equal(materialFor(body, { wheel: 'rubber' }), 'shell');
  assert.equal(materialFor(body, { body: 'ice' }), 'ice', "an entry without part is the 'body' part");
});
test('applyMaterial sets √f with Multiply, restitution with Max, and the density', () => withWorld(w => {
  const c = w.createCollider(applyMaterial(R, shapeDesc(R, { shape: 'sphere', r: 1 }), MATERIALS.collider('grip'), 1234));
  near(c.friction(), 0.9, 1e-6);
  assert.equal(c.frictionCombineRule(), R.CoefficientCombineRule.Multiply);
  assert.equal(c.restitutionCombineRule(), R.CoefficientCombineRule.Max);
  assert.equal(c.density(), 1234);
}));
test('a slick block on grip decelerates at the geometric mean of the two frictions (M-8 via M-9)', () => withWorld(w => {
  const mk = (id, desc) => applyMaterial(R, desc, MATERIALS.collider(id), MATERIALS.density(id));
  w.createCollider(mk('grip', shapeDesc(R, { shape: 'box', half: [50, 0.5, 50] }).setTranslation(0, -0.5, 0)));
  const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.5, 0).lockRotations());
  w.createCollider(mk('slick', shapeDesc(R, { shape: 'box', half: [0.5, 0.5, 0.5] })), b);
  for (let i = 0; i < 10; i++) w.step();
  b.setLinvel({ x: 5, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) w.step();
  const mu = Math.sqrt(0.81 * 0.25), want = 5 - mu * 9.81 * 0.5; // 0.45: Average 0.7, Min 0.5 and Max 0.9 all miss
  near(b.linvel().x, want, 0.05);
}));
test('restitution takes the larger: a bouncy ball rebounds off a dead floor', () => withWorld(w => {
  const mk = (id, desc) => applyMaterial(R, desc, MATERIALS.collider(id), MATERIALS.density(id));
  w.createCollider(mk('grip', shapeDesc(R, { shape: 'box', half: [5, 0.5, 5] }).setTranslation(0, -0.5, 0)));
  const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  w.createCollider(mk('bouncy', shapeDesc(R, { shape: 'sphere', r: 0.25 })), b);
  let landed = false, peak = 0;
  for (let i = 0; i < 180; i++) { w.step(); const v = b.linvel().y, y = b.translation().y; if (v > 0) landed = true; if (landed) peak = Math.max(peak, y); }
  assert.ok(peak > 0.25 + 0.5 * 1.75, `rebound peak ${peak}: Multiply (0) or Average (0.4) would stay lower`);
}));
