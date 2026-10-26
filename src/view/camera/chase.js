// Chase camera, two styles.
// - 'heading' (default, V-1..V-3): `distance` behind and `height` above the target, turning
//   with `lag`, looking at a point `lookAhead` in front and `lookHeight` up; the position eases in at `ease` per second. In a
//   slide (pose.fwd > `slide` m/s) it looks along the travel (pose.velYaw), otherwise along the nose (pose.yaw). Portrait
//   (aspect < `portraitAspect`) moves it `portrait` times back and up (X-12). pose = { x, y, z, yaw, fwd?, velYaw? }.
// - 'travel': the look direction is the body's heading blended toward its velocity above `blendFrom`
//   m/s (up to `blendMax`), smoothed exponentially (`lag` per second); the position eases at `ease`, the look point at `lookEase`.
//   The field of view widens with speed: base + fovAdd + min(fovMax, speed x fovSpeed), the base being camera.userData.lhFov
//   (3e's portrait FOV rule) or the camera's fov at create. orbit(pose, dt) is a title shot (a slow turntable round the target,
//   base + orbitFovAdd), after which the chase starts afresh behind. pose = { p, q, v } (positions, quaternion, velocity).
// opts is the object passed in, filled with the style's defaults and kept live (?tune may write rig.opts.distance). rig.yaw is
// the view heading a stick reads against (C-2, #81; heading style), null before the first follow or snap. shake(a) jitters the
// position for `shakeTime` s, fading, from a hash (no Math.random). blendFrom(q, time = 1) turns the camera from rotation q back to
// the chase over `time` s, smoothstep (F-10: a hand-back from another camera); snap cancels a blend and a shake.
// Nothing is allocated per frame.
import * as THREE from 'three';

const HEADING = Object.freeze({ distance: 12, height: 10.2, lag: 3, lookAhead: 11, lookHeight: 0.8, ease: 6, slide: 2, portrait: 1.25, portraitAspect: 0.9, shakeTime: 0.25 });
const TRAVEL = Object.freeze({ distance: 6.8, height: 2.4, lag: 3.5, lookAhead: 3, lookHeight: 0.6, ease: 8, lookEase: 12, blendFrom: 3, blendSpan: 20, blendMax: 0.55, shakeTime: 0.25,
  fovAdd: 2, fovSpeed: 0.25, fovMax: 10, orbitRadius: 9, orbitHeight: 3.2, orbitLook: 0.4, orbitSpeed: 0.12, orbitStart: 0.6, orbitFovAdd: -5 });
const Z = new THREE.Vector3(0, 0, 1);

export function createChaseRig(camera, opts = {}) {
  if (!camera?.isCamera) throw new Error('createChaseRig: camera required');
  const style = opts.style ?? 'heading';
  if (style !== 'heading' && style !== 'travel') throw new Error(`createChaseRig: style '${style}' (use 'heading' or 'travel')`);
  const defs = style === 'travel' ? TRAVEL : HEADING;
  for (const k of Object.keys(defs)) if (opts[k] === undefined) opts[k] = defs[k];
  opts.style = style;
  const tgt = new THREE.Vector3(), pos = new THREE.Vector3(), cp = new THREE.Vector3(), bq = new THREE.Quaternion(), dir = new THREE.Vector3(), vel = new THREE.Vector3();
  const camPos = camera.position.clone(), camLook = new THREE.Vector3(), chaseDir = new THREE.Vector3(), fov0 = camera.fov;
  const fromQ = new THREE.Quaternion(), toQ = new THREE.Quaternion();
  let yaw = null, shakeT = 0, shakeA = 0, n = 0, fresh = true, orbitA = null, blendK = 1, blendT = 1;
  const jitter = () => { // -0.5..0.5, a counter hash
    n = (n + 1) | 0; let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296 - 0.5;
  };
  const shaken = dt => { if (shakeT > 0) { shakeT -= dt; const a = shakeA * (shakeT / opts.shakeTime); pos.x += jitter() * a; pos.y += jitter() * a; } else shakeA = 0; };
  const blended = dt => { // F-10: slerp from the given rotation to this frame's chase rotation, smoothstep over blendT s
    if (blendK >= 1) return;
    blendK = Math.min(1, blendK + dt / blendT); const k = blendK * blendK * (3 - 2 * blendK);
    toQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(fromQ, toQ, k); camera.updateMatrixWorld();
  };
  const setFov = add => { const f = (camera.userData.lhFov ?? fov0) + add; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } };
  function heading(pose, kYaw, kPos, dt) {
    const want = (pose.fwd ?? 0) > opts.slide ? (pose.velYaw ?? pose.yaw) : pose.yaw;
    if (yaw === null) yaw = want;
    let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * kYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), k = camera.aspect < opts.portraitAspect ? opts.portrait : 1;
    tgt.set(pose.x + fx * opts.lookAhead, pose.y + opts.lookHeight, pose.z + fz * opts.lookAhead);
    pos.set(pose.x - fx * opts.distance * k, pose.y + opts.height * k, pose.z - fz * opts.distance * k);
    shaken(dt);
    camera.position.lerp(pos, kPos); camera.lookAt(tgt); camera.updateMatrixWorld();
  }
  function body(pose) { // cp, bq, the flat heading (dir) and velocity (vel) of a { p, q, v } pose; returns the planar speed
    cp.set(pose.p.x, pose.p.y, pose.p.z); bq.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    dir.copy(Z).applyQuaternion(bq); dir.y = 0; dir.normalize();
    vel.set(pose.v?.x ?? 0, 0, pose.v?.z ?? 0);
    return vel.length();
  }
  function travel(pose, dt, snap) {
    const sp = body(pose);
    if (sp > opts.blendFrom) dir.lerp(vel.normalize(), Math.min(opts.blendMax, (sp - opts.blendFrom) / opts.blendSpan)).normalize();
    if (fresh || snap) { chaseDir.copy(dir); fresh = false; } else chaseDir.lerp(dir, 1 - Math.exp(-dt * opts.lag)).normalize();
    pos.copy(cp).addScaledVector(chaseDir, -opts.distance); pos.y += opts.height;
    shaken(dt);
    tgt.copy(cp).addScaledVector(chaseDir, opts.lookAhead); tgt.y += opts.lookHeight;
    if (snap) { camPos.copy(pos); camLook.copy(tgt); }
    else { camPos.lerp(pos, 1 - Math.exp(-dt * opts.ease)); camLook.lerp(tgt, 1 - Math.exp(-dt * opts.lookEase)); }
    camera.position.copy(camPos); camera.lookAt(camLook);
    setFov(opts.fovAdd + Math.min(opts.fovMax, sp * opts.fovSpeed));
    camera.updateMatrixWorld();
  }
  return {
    opts,
    get yaw() { return yaw; },
    follow(pose, dt) { if (style === 'travel') travel(pose, dt, false); else heading(pose, Math.min(1, dt * opts.lag), Math.min(1, dt * opts.ease), dt); blended(dt); },
    snap(pose) { // straight behind at once, no blend or shake (a new farm)
      shakeT = 0; shakeA = 0; blendK = 1;
      if (style === 'travel') travel(pose, 0, true); else { yaw = null; heading(pose, 1, 1, 0); }
    },
    orbit(pose, dt) { // travel style: a title turntable
      if (style !== 'travel') throw new Error("chase.orbit: needs style 'travel'");
      body(pose);
      orbitA = (orbitA ?? Math.atan2(-dir.x, -dir.z) + opts.orbitStart) + dt * opts.orbitSpeed;
      camPos.set(cp.x + opts.orbitRadius * Math.sin(orbitA), cp.y + opts.orbitHeight, cp.z + opts.orbitRadius * Math.cos(orbitA));
      camLook.set(cp.x, cp.y + opts.orbitLook, cp.z);
      camera.position.copy(camPos); camera.lookAt(camLook); setFov(opts.orbitFovAdd); camera.updateMatrixWorld();
      fresh = true; // the chase starts afresh behind the car
    },
    shake(a) { shakeA = Math.max(shakeA, a); shakeT = opts.shakeTime; },
    blendFrom(q, time = 1) { fromQ.copy(q); blendK = 0; blendT = time; },
  };
}
