import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createViewSync } from '../src/view/sync/index.js';
import { syncSetup } from './helpers/syncSetup.mjs';
import { fakeWorld } from './helpers/fakeWorld.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';

const clones = s => s.log.filter(l => l[0] === 'clone');
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

test('3g: a drawn entity gets assets.clone(model, { paint }) under the sync root on the next frame, and goes after despawn (E-6)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', paint: { body: '#c33' } });
  assert.equal(s.sync.root.parent, s.gfx.scene); assert.equal(s.sync.root.name, 'lh.sync'); assert.equal(s.sync.root.children.length, 0);
  s.sync.frame(1);
  const obj = s.sync.objectOf(e); assert.equal(obj.parent, s.sync.root); assert.equal(obj.name, 'crate');
  assert.deepEqual(clones(s), [['clone', 'crate', { paint: { body: '#c33' } }]]);
  s.sync.frame(1); assert.equal(clones(s).length, 1); // made once
  s.world.despawn(e); s.sync.frame(1);
  assert.equal(s.sync.objectOf(e), undefined); assert.equal(obj.parent, null); assert.equal(s.sync.root.children.length, 0);
});
test('3g: the pose is lerp(prev, curr, alpha) with a normalised nlerp rotation, scaled by e.scale (E-11)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', scale: 0.62 }), q1 = yaw(Math.PI / 2);
  s.world.move(e, [2, 4, -6], [q1.x, q1.y, q1.z, q1.w]); // curr moved; prev is still the spawn pose
  s.sync.frame(0.25); const o = s.sync.objectOf(e);
  assert.ok(o.position.distanceTo(new THREE.Vector3(0.5, 1, -1.5)) < 1e-12);
  const want = new THREE.Quaternion(0.25 * q1.x, 0.25 * q1.y, 0.25 * q1.z, 0.75 + 0.25 * q1.w).normalize();
  assert.ok(1 - Math.abs(o.quaternion.dot(want)) < 1e-12); assert.ok(Math.abs(o.quaternion.length() - 1) < 1e-12);
  assert.ok(o.scale.equals(new THREE.Vector3(0.62, 0.62, 0.62)));
  s.sync.frame(1); assert.ok(o.position.distanceTo(new THREE.Vector3(2, 4, -6)) < 1e-12);
  s.world.step(); s.sync.frame(0); assert.ok(o.position.distanceTo(new THREE.Vector3(2, 4, -6)) < 1e-12); // prev caught up
});
test('3g: q and -q are one rotation: interpolation takes the short arc (E-11)', () => {
  const s = syncSetup(), a = yaw(0.2), b = yaw(0.4), e = s.world.spawn({ model: 'crate', q: [a.x, a.y, a.z, a.w] });
  s.world.move(e, [0, 0, 0], [-b.x, -b.y, -b.z, -b.w]); // the same rotation as b, stored negated
  s.sync.frame(0.5); assert.ok(1 - Math.abs(s.sync.objectOf(e).quaternion.dot(yaw(0.3))) < 1e-12); // nlerp = slerp at the midpoint
});
test('3g: a new World or a world.serial change drops every object; no World draws nothing (S-3)', () => {
  const s = syncSetup(); s.world.spawn({ model: 'crate' }); s.world.spawn({ model: 'crate' });
  s.sync.frame(1); assert.equal(s.sync.root.children.length, 2);
  const first = s.sync.root.children[0];
  s.world.clear(); s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); assert.equal(first.parent, null);
  const e = s.world.spawn({ model: 'crate' }); s.sync.frame(1); assert.equal(s.sync.root.children.length, 1); assert.equal(e.id, 1);
  assert.notEqual(s.sync.objectOf(e), first);
  s.engine.world = undefined; s.sync.frame(1); assert.equal(s.sync.root.children.length, 0);
  const w2 = fakeWorld(); w2.spawn({ model: 'crate' }); s.engine.world = w2; s.sync.frame(1); assert.equal(s.sync.root.children.length, 1);
});
test('3g: an entity object replaced under the same id gets a fresh Object3D (E-6)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate' }); s.sync.frame(1); const o = s.sync.objectOf(e);
  const twin = { ...e }; s.world.with('xf')[0] = twin; // same id, new object: a rebuilt entity
  s.sync.frame(1);
  assert.notEqual(s.sync.objectOf(twin), o); assert.equal(o.parent, null); assert.equal(s.sync.objectOf(e), undefined);
});
test('3g: draw: false and model-less entities are not drawn; a bad draw value or missing assets throw (E-6)', () => {
  const s = syncSetup(), a = s.world.spawn({ model: 'crate', draw: false }), b = s.world.spawn({ tags: ['marker'] });
  s.sync.frame(1); assert.equal(s.sync.objectOf(a), undefined); assert.equal(s.sync.objectOf(b), undefined); assert.equal(s.sync.root.children.length, 0);
  s.world.spawn({ model: 'crate', draw: 'sprite' });
  assert.throws(() => s.sync.frame(1), /^Error: sync: entity 3 has draw "sprite" \(use 'object', 'instanced' or false\)$/);
  const w = fakeWorld(), bare = createViewSync({ world: w }, { gfx: { scene: new THREE.Scene() } }); w.spawn({ model: 'crate' });
  assert.throws(() => bare.frame(1), /sync: entity 1 \(model 'crate'\) is drawn but the view has no assets/);
  assert.throws(() => createViewSync({}, {}), /gfx\.scene required/);
});
test('3g: frames make no three objects and retain nothing: 10000 frames of 50 moving entities (R-8)', () => {
  const s = syncSetup(), es = [];
  for (let i = 0; i < 50; i++) es.push(s.world.spawn({ model: 'crate', at: [i, 0, 0] }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (let i = 0; i < es.length; i++) es[i].xf.p.y = Math.sin(t + i); s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
test('3g: dispose drops everything and takes the root out of the scene; frames after it do nothing', () => {
  const s = syncSetup(); s.world.spawn({ model: 'crate' }); s.sync.frame(1);
  s.sync.dispose(); assert.equal(s.sync.root.parent, null); assert.equal(s.sync.root.children.length, 0);
  s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); s.sync.dispose();
});
test('3g: each frame advances the compiler\'s shared clock by view.dt, World or not (3f WIND)', () => {
  const s = syncSetup(); s.view.dt = 0.25; s.sync.frame(1); s.sync.frame(1); assert.equal(s.compiler.time.value, 0.5);
  s.engine.world = undefined; s.view.dt = 0; s.sync.frame(1); s.view.dt = 0.5; s.sync.frame(1); assert.equal(s.compiler.time.value, 1);
});
