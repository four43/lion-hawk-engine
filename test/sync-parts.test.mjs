import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';

const CAR = { car: [{ name: 'body', material: 'steel' }, { name: 'hub', material: 'rubber', p: [0.8, 0.3, 1.2] }] };
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const set = (part, p, q = yaw(0), sign = 1) => { Object.assign(part.p, { x: p[0], y: p[1], z: p[2] }); Object.assign(part.q, { x: sign * q.x, y: sign * q.y, z: sign * q.z, w: sign * q.w }); };
const centre = node => { node.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()); };
const near = (a, b, msg) => assert.ok(a.distanceTo(b) < 1e-9, `${msg}: ${a.toArray()} vs ${b.toArray()}`);

test('3g: a part centre is drawn at body · p, turned body · q · rest, interpolated with the body\'s alpha on the short arc; e.scale keeps metres', () => {
  const s = syncSetup(CAR), body = yaw(Math.PI / 2);
  const e = s.world.spawn({ model: 'car', at: [10, 0, 0], q: [body.x, body.y, body.z, body.w], scale: 2, partXf: ['hub'] });
  set(e.partXf.hub, [1, 0, 2]); s.sync.frame(1);
  const hub = s.sync.objectOf(e).getObjectByName('hub');
  near(centre(hub), new THREE.Vector3(12, 0, -1), 'centre at body · p'); // yaw 90°: (1, 0, 2) → (2, 0, -1)
  assert.ok(Math.abs(hub.getWorldScale(new THREE.Vector3()).x - 2) < 1e-9, 'rest scale × e.scale');
  s.world.step(); set(e.partXf.hub, [3, 0, 2], yaw(Math.PI / 2), -1); // curr stored as -q
  s.sync.frame(0.5);
  near(centre(hub), new THREE.Vector3(12, 0, -2), 'p halfway');
  const want = body.clone().multiply(yaw(Math.PI / 4)), got = hub.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(1 - Math.abs(got.dot(want)) < 1e-12, 'q halfway on the short arc');
});
test('3g: the centre is the node\'s bounding-box centre after create hooks: an off-centre wheel turns about its hub', () => {
  const s = syncSetup(CAR);
  s.sync.on('model:car', { create: (e, obj) => { obj.getObjectByName('hub').geometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0); } });
  const e = s.world.spawn({ model: 'car', partXf: ['hub'] }), q = yaw(Math.PI / 2);
  set(e.partXf.hub, [0, 0.3, 1.2]); s.sync.frame(1);
  const hub = s.sync.objectOf(e).getObjectByName('hub');
  near(centre(hub), new THREE.Vector3(0, 0.3, 1.2), 'centre at p'); near(hub.position, new THREE.Vector3(-0.5, 0.3, 1.2), 'node origin');
  set(e.partXf.hub, [0, 0.3, 1.2], q); s.world.step(); s.sync.frame(1);
  near(centre(hub), new THREE.Vector3(0, 0.3, 1.2), 'turned about its centre'); near(hub.position, new THREE.Vector3(0, 0.3, 1.7), 'node swung round it');
});
test('3g: a missing part names the model\'s parts; instanced entities refuse partXf; an undrawn entity\'s parts are ignored', () => {
  const s = syncSetup(CAR); s.world.spawn({ model: 'car', partXf: ['wheel-x'] });
  assert.throws(() => s.sync.frame(1), /^Error: sync: entity 1 \(model 'car'\) has no part 'wheel-x' for partXf \(parts: body, hub\)$/);
  const t = syncSetup(CAR); t.world.spawn({ model: 'car', draw: 'instanced', partXf: ['hub'] });
  assert.throws(() => t.sync.frame(1), /sync: entity 1: partXf needs draw 'object'/);
  const u = syncSetup(CAR); u.world.spawn({ model: 'car', draw: false, partXf: ['hub'] }); u.sync.frame(1); assert.equal(u.sync.root.children.length, 0);
});
test('3g: part poses make no three objects and retain nothing: 10000 frames of 20 cars with 4 parts (R-8)', () => {
  const wheels = ['fl', 'fr', 'rl', 'rr'], s = syncSetup({ car: [{ name: 'body', material: 'steel' }, ...wheels.map((name, i) => ({ name, material: 'rubber', p: [i, 0, 0] }))] }), es = [];
  for (let i = 0; i < 20; i++) es.push(s.world.spawn({ model: 'car', at: [i * 3, 0, 0], partXf: wheels }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (const e of es) for (const w of wheels) { const q = e.partXf[w].q, a = t * 0.3; q.x = Math.sin(a); q.w = Math.cos(a); e.partXf[w].p.y = Math.sin(t) * 0.1; } s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
