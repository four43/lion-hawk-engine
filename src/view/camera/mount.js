// Mounted camera (Rally's bumper and bonnet views, render.js:173-180): fixed to a body at socket.p (body space), looking at
// socket.look (body space; default 20 m ahead and 0.3 m up) and rolling with the body. follow(pose) takes { p, q } or an
// Object3D (the synced object, so the camera rides the interpolated pose). set(socket) swaps the mount (bumper <-> bonnet).
// With `fovAdd` the field of view is the base plus that many degrees: the base is camera.userData.lhFov (3e's portrait FOV
// rule, kept up to date by the renderer's resize), else the camera's fov when the rig was made. Never an absolute overwrite.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0), LOOK = new THREE.Vector3(0, 0.3, 20), ZERO = new THREE.Vector3();

export function createMountRig(camera, { socket, fovAdd = null } = {}) {
  if (!camera?.isCamera) throw new Error('createMountRig: camera required');
  const fov0 = camera.fov;
  const off = new THREE.Vector3(), look = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion(), at = new THREE.Vector3();
  const read = (v, out, def) => (v == null ? out.copy(def) : Array.isArray(v) ? out.fromArray(v) : out.set(v.x, v.y, v.z));
  const rig = {
    fovAdd,
    set(s) {
      if (!s || s.p == null) throw new Error('createMountRig: socket required ({ p: [x, y, z], look?: [x, y, z] })');
      read(s.p, off, ZERO); read(s.look, look, LOOK);
    },
    follow(pose) {
      const pp = pose.isObject3D ? pose.position : pose.p, pq = pose.isObject3D ? pose.quaternion : pose.q;
      p.set(pp.x, pp.y, pp.z); q.set(pq.x, pq.y, pq.z, pq.w);
      camera.position.copy(off).applyQuaternion(q).add(p);
      at.copy(look).applyQuaternion(q).add(p);
      camera.up.copy(UP).applyQuaternion(q); camera.lookAt(at); camera.up.copy(UP);
      if (rig.fovAdd != null) { const f = (camera.userData.lhFov ?? fov0) + rig.fovAdd; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
      camera.updateMatrixWorld();
    },
  };
  rig.set(socket);
  return rig;
}
