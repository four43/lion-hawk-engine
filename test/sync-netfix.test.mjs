import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';

const CRATE = { crate: [{ name: 'body', material: 'wood' }] };
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

test('3g: a correction never makes the mesh jump; the jump fades over smoothMs on view.dt (N-15)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', at: [5, 0, 0], net: 'train' }); s.view.dt = 0.016; s.sync.frame(1);
  const o = s.sync.objectOf(e); assert.equal(o.position.x, 5);
  s.world.place(e, [4, 0, 0]); e.netFix = { seq: 1, dp: [1, 0, 0], dq: [0, 0, 0, 1] }; // the sim set it back 1 m
  s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 5) < 1e-12);
  s.view.dt = 0.075; s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 4.5) < 1e-12);
  s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 4) < 1e-12);
  s.sync.frame(0.4); assert.equal(o.position.x, 4); // the same seq is not applied again
});
test('3g: a rotation correction is smoothed too: drawn = offset (x) pose (N-15)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate' }); s.sync.frame(1);
  const q = yaw(0.5), dq = yaw(-0.5); // old pose: identity; new pose: yaw 0.5; dq = old (x) new^-1
  s.world.place(e, [0, 0, 0], [q.x, q.y, q.z, q.w]); e.netFix = { seq: 1, dp: [0, 0, 0], dq: [dq.x, dq.y, dq.z, dq.w] };
  s.sync.frame(1); assert.ok(1 - Math.abs(s.sync.objectOf(e).quaternion.w) < 1e-12);
});
test('3g: smoothMs comes from world.net.tunables[kind], live; 150 ms without one (N-15, N-17)', () => {
  const s = syncSetup(), a = s.world.spawn({ model: 'crate', net: 'train' }), b = s.world.spawn({ model: 'crate' });
  s.world.net.tunables.train = { smoothMs: 300 }; s.sync.frame(1); s.view.dt = 0.15;
  for (const e of [a, b]) { s.world.place(e, [0, 0, 0]); e.netFix = { seq: 7, dp: [2, 0, 0], dq: [0, 0, 0, 1] }; }
  s.sync.frame(1); assert.equal(s.sync.objectOf(a).position.x, 2); assert.equal(s.sync.objectOf(b).position.x, 2);
  s.sync.frame(1); assert.ok(Math.abs(s.sync.objectOf(a).position.x - 1) < 1e-12); assert.equal(s.sync.objectOf(b).position.x, 0);
});
test('3g: a netFix already on a new entity is not replayed; instanced entities are smoothed (N-15)', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' });
  e.netFix = { seq: 3, dp: [9, 0, 0], dq: [0, 0, 0, 1] }; s.sync.frame(1);
  const body = s.sync.root.children[0], m = new THREE.Matrix4(), p = new THREE.Vector3();
  body.getMatrixAt(0, m); assert.equal(p.setFromMatrixPosition(m).x, 0);
  e.netFix = { seq: 4, dp: [1, 0, 0], dq: [0, 0, 0, 1] }; s.sync.frame(1);
  body.getMatrixAt(0, m); assert.ok(Math.abs(p.setFromMatrixPosition(m).x - 1) < 1e-6); // a still entity with an offset is rewritten
});
