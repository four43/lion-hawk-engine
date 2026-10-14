// view.project for a camera on a canvas (S-1, #73; Tractor's rig.project and toNdc): world -> client px with the canvas
// offset added, z the NDC depth, onScreen false behind the camera or outside the viewport. The camera's matrices are refreshed
// first, so a camera moved since the last render projects where it is now. project([x, y, z], out?) fills out (a fresh object
// without one: game.point may keep it); project.ndc(x, y, z, out?) gives the raw NDC { nx, ny, nz, behind } (Tractor's M-77 HUD).
import * as THREE from 'three';

export function makeProject(camera, canvas) {
  if (!camera?.isCamera) throw new Error('makeProject: camera required');
  if (typeof canvas?.getBoundingClientRect !== 'function') throw new Error('makeProject: canvas required');
  const v = new THREE.Vector3(), nd = { nx: 0, ny: 0, nz: 0, behind: false };
  function ndc(x, y, z, out = nd) {
    camera.updateMatrixWorld();
    out.behind = v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z > 0;
    v.set(x, y, z).project(camera); out.nx = v.x; out.ny = v.y; out.nz = v.z;
    return out;
  }
  function project([x, y, z], out = {}) {
    const r = canvas.getBoundingClientRect(), s = ndc(x, y, z);
    out.x = r.left + (s.nx + 1) / 2 * r.width; out.y = r.top + (1 - s.ny) / 2 * r.height; out.z = s.nz;
    out.onScreen = !s.behind && Math.abs(s.nx) <= 1 && Math.abs(s.ny) <= 1;
    return out;
  }
  project.ndc = ndc;
  return project;
}
