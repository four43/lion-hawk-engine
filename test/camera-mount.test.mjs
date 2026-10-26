import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMountRig } from '../src/view/camera/mount.js';

// a reference mount camera (bumper: camMode 1, bonnet: camMode 2)
function mountRef(cam, cp, bq, camMode, frontZ) {
  const off = camMode === 1 ? new THREE.Vector3(0, 0.05, frontZ + 0.9) : new THREE.Vector3(0, 0.62, 0.35);
  cam.position.copy(cp).add(off.applyQuaternion(bq));
  const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(bq));
  cam.up.set(0, 1, 0).applyQuaternion(bq); cam.lookAt(look); cam.up.set(0, 1, 0);
  cam.fov = 72; cam.updateProjectionMatrix();
}

test('3g: createMountRig matches the reference bumper and bonnet cameras, rolling with the body', () => {
  const p = new THREE.Vector3(3, 1, -4), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.7, 0.3));
  const sockets = { 1: { p: [0, 0.05, 1.3 + 0.9] }, 2: { p: { x: 0, y: 0.62, z: 0.35 } } };
  for (const mode of [1, 2]) {
    const a = new THREE.PerspectiveCamera(60, 1.5), b = new THREE.PerspectiveCamera(60, 1.5);
    createMountRig(a, { socket: sockets[mode], fovAdd: 12 }).follow({ p, q }); mountRef(b, p, q, mode, 1.3); // 72 = 3e's base 60 + 12
    assert.ok(a.position.distanceTo(b.position) < 1e-12, `position, mode ${mode}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation, mode ${mode}`);
    assert.equal(a.fov, 72); assert.ok(a.up.equals(new THREE.Vector3(0, 1, 0)));
  }
});
test('3g: follow takes the synced Object3D; set swaps the mount; a socket is required', () => {
  const a = new THREE.PerspectiveCamera(60, 1.5), b = new THREE.PerspectiveCamera(60, 1.5), obj = new THREE.Object3D();
  obj.position.set(1, 2, 3); obj.quaternion.setFromEuler(new THREE.Euler(0, 1, 0.2));
  const rig = createMountRig(a, { socket: { p: [0, 0.05, 2.2] } }); rig.set({ p: [0, 0.62, 0.35] }); rig.follow(obj);
  mountRef(b, obj.position, obj.quaternion, 2, 0);
  assert.ok(a.position.distanceTo(b.position) < 1e-12); assert.equal(a.fov, 60); // no fovAdd: left alone
  const c = new THREE.PerspectiveCamera(60, 0.6), r = createMountRig(c, { socket: { p: [0, 0, 0] }, fovAdd: 12 });
  c.userData.lhFov = 64; r.follow(obj); assert.equal(c.fov, 76); // 3e's portrait base 64, plus the rig's 12
  r.follow(obj); assert.equal(c.fov, 76); // added to the base, never to itself
  delete c.userData.lhFov; r.follow(obj); assert.equal(c.fov, 72); // no base from 3e: the fov at create
  assert.throws(() => createMountRig(a, {}), /socket required/); assert.throws(() => createMountRig(null, { socket: { p: [0, 0, 0] } }), /camera required/);
});
