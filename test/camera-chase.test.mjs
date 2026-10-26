import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChaseRig } from '../src/view/camera/chase.js';
import { createMountRig } from '../src/view/camera/mount.js';

// a reference heading chase camera, with CAM and LAG inlined and no shake
function headingRef(camera) {
  const CAM = { D: 12, H: 10.2, AHEAD: 11, portrait: 1.25 }, LAG = 3, tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  let yaw = null;
  return {
    update(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw;
      if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * LAG);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      tgt.set(s.x + fx * CAM.AHEAD, s.y + 0.8, s.z + fz * CAM.AHEAD);
      const k = camera.aspect < 0.9 ? CAM.portrait : 1;
      pos.set(s.x - fx * CAM.D * k, s.y + CAM.H * k, s.z - fz * CAM.D * k);
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
    },
  };
}

test('3g: createChaseRig matches the reference heading chase frame by frame, landscape and portrait (port of V-1..V-3)', () => {
  for (const aspect of [1.6, 0.6]) {
    const a = new THREE.PerspectiveCamera(60, aspect), b = new THREE.PerspectiveCamera(60, aspect);
    const rig = createChaseRig(a, { distance: 12, height: 10.2, lag: 3, lookAhead: 11 }), ref = headingRef(b);
    const s = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, velYaw: 0 };
    for (let i = 0; i < 240; i++) {
      s.x += Math.sin(s.yaw) * 0.2; s.z += Math.cos(s.yaw) * 0.2; s.yaw += 0.02; s.fwd = i < 120 ? 1 : 6; s.velYaw = s.yaw + 0.4; s.y = Math.sin(i / 30);
      const dt = i % 3 ? 1 / 60 : 1 / 30;
      rig.follow(s, dt); ref.update(dt, s);
      assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
      assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    }
    assert.ok(Math.abs(rig.yaw - (s.yaw + 0.4)) < 0.3); // in a slide it follows velYaw
  }
});
test('3g: snap puts the camera straight behind, looking ahead; portrait backs it off (V-2, X-12)', () => {
  const c = new THREE.PerspectiveCamera(60, 1.5), rig = createChaseRig(c);
  assert.equal(rig.yaw, null);
  rig.snap({ x: 1, y: 2, z: 3, yaw: Math.PI / 2 }); // forward is +x
  assert.ok(c.position.distanceTo(new THREE.Vector3(1 - 12, 2 + 10.2, 3)) < 1e-9);
  const dir = c.getWorldDirection(new THREE.Vector3()), want = new THREE.Vector3(1 + 11, 2 + 0.8, 3).sub(c.position).normalize();
  assert.ok(dir.distanceTo(want) < 1e-9); assert.equal(rig.yaw, Math.PI / 2);
  const p = new THREE.PerspectiveCamera(60, 0.6); createChaseRig(p).snap({ x: 0, y: 0, z: 0, yaw: 0 });
  assert.ok(p.position.distanceTo(new THREE.Vector3(0, 10.2 * 1.25, -12 * 1.25)) < 1e-9);
});
test('3g: opts are the live object (?tune); shake jitters for 0.25 s, deterministically, then settles (V-3)', () => {
  const c = new THREE.PerspectiveCamera(60, 1.5), o = { distance: 12 }, rig = createChaseRig(c, o);
  assert.equal(rig.opts, o); assert.equal(o.height, 10.2);
  o.distance = 20; rig.snap({ x: 0, y: 0, z: 0, yaw: 0 }); assert.ok(Math.abs(c.position.z + 20) < 1e-9);
  const run = () => {
    const cc = new THREE.PerspectiveCamera(60, 1.5), r = createChaseRig(cc), pose = { x: 0, y: 0, z: 0, yaw: 0 }, xs = [];
    r.snap(pose); r.shake(0.5);
    for (let i = 0; i < 60; i++) { r.follow(pose, 1 / 60); xs.push(cc.position.x); }
    return xs;
  };
  const xs = run(), peak = Math.max(...xs.slice(0, 15).map(Math.abs));
  assert.ok(peak > 0.001 && peak < 0.25, `peak ${peak}`); assert.deepEqual(run(), xs); // no Math.random
  assert.ok(Math.abs(xs.at(-1)) < 0.01);
  assert.throws(() => createChaseRig({}), /camera required/);
});
test('3g: one opts object serves every rig (a new farm keeps ?tune values); portraitAspect and shakeTime are live (CI-10)', () => {
  const CAM = {}, pose = { x: 0, y: 0, z: 0, yaw: 0 };
  createChaseRig(new THREE.PerspectiveCamera(60, 1), CAM);
  assert.equal(CAM.portraitAspect, 0.9); assert.equal(CAM.shakeTime, 0.25); assert.equal(CAM.style, 'heading');
  CAM.distance = 15; const c = new THREE.PerspectiveCamera(60, 1), rig = createChaseRig(c, CAM); // the next farm's rig
  assert.equal(rig.opts.distance, 15); rig.snap(pose); assert.ok(Math.abs(c.position.z + 15) < 1e-9); // aspect 1: landscape
  CAM.portraitAspect = 1.2; rig.snap(pose); // aspect 1 is portrait now
  assert.ok(c.position.distanceTo(new THREE.Vector3(0, 10.2 * 1.25, -15 * 1.25)) < 1e-9);
  // ease 1e6 puts the camera on its target each frame, so the shaken-minus-plain distance is the jitter itself
  const o = { ease: 1e6, shakeTime: 0.5 }, ca = new THREE.PerspectiveCamera(60, 1.5), cb = new THREE.PerspectiveCamera(60, 1.5);
  const ra = createChaseRig(ca, o), rb = createChaseRig(cb, { ...o });
  ra.snap(pose); rb.snap(pose); ra.shake(0.4);
  for (let i = 0; i < 40; i++) {
    ra.follow(pose, 0.02); rb.follow(pose, 0.02); const off = ca.position.distanceTo(cb.position);
    if (i < 20) assert.ok(off > 1e-6, `still shaking at ${(i + 1) * 0.02} s`); else if (i >= 27) assert.ok(off < 1e-9, `settled at ${(i + 1) * 0.02} s`);
  }
  ra.shake(0.4); ra.snap(pose); rb.snap(pose); ra.follow(pose, 0.02); rb.follow(pose, 0.02);
  assert.ok(ca.position.distanceTo(cb.position) < 1e-9); // snap cancels a shake
});
test('3g: blendFrom turns from the show camera back to the chase over time s, smoothstep; snap cancels it (F-10)', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6), rig = createChaseRig(a), ref = headingRef(b);
  const showQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 2, 0)), chaseQ = new THREE.Quaternion();
  const s = { x: 0, y: 0, z: 0, yaw: 0.5, fwd: 0, velYaw: 0.5 };
  let blend = 1; // the reference blend: follow() after the chase cam's update
  for (let i = 0; i < 90; i++) {
    if (i === 10) { rig.blendFrom(showQ); blend = 0; }
    s.x += 0.1; rig.follow(s, 1 / 60); ref.update(1 / 60, s);
    if (blend < 1) { blend = Math.min(1, blend + 1 / 60); const k = blend * blend * (3 - 2 * blend); chaseQ.copy(b.quaternion); b.quaternion.slerpQuaternions(showQ, chaseQ, k); }
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    if (i === 10) assert.ok(1 - Math.abs(a.quaternion.dot(showQ)) < 1e-4, 'starts at the show camera');
  }
  rig.blendFrom(showQ, 0.5); rig.snap(s);
  const c = new THREE.PerspectiveCamera(60, 1.6); createChaseRig(c).snap(s);
  assert.ok(1 - Math.abs(a.quaternion.dot(c.quaternion)) < 1e-12); // no blend after a snap
});

// a reference travel camera (title orbit and chase), with its absolute FOVs 55 and 62 written as 3e's base 60
// plus -5 and +2
function travelRef(cam) {
  const r = { cam, camPos: new THREE.Vector3(0, 4, -8), camLook: new THREE.Vector3(), chaseDir: null, orbitA: undefined, orbit: false };
  r.update = (body, dt) => {
    const p = body.p, q = body.q, v = body.v;
    const cp = new THREE.Vector3(p.x, p.y, p.z), bq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq); fwd.y = 0; fwd.normalize();
    const vel = new THREE.Vector3(v.x, 0, v.z);
    if (r.orbit) {
      r.orbitA = (r.orbitA ?? Math.atan2(-fwd.x, -fwd.z) + 0.6) + dt * 0.12;
      r.camPos.set(p.x + 9 * Math.sin(r.orbitA), p.y + 3.2, p.z + 9 * Math.cos(r.orbitA));
      r.camLook.set(p.x, p.y + 0.4, p.z);
      cam.position.copy(r.camPos); cam.lookAt(r.camLook);
      cam.fov = 60 - 5; cam.updateProjectionMatrix();
      r.chaseDir = null;
    } else {
      const sp = vel.length(), dir = fwd.clone();
      if (sp > 3) dir.lerp(vel.normalize(), Math.min(0.55, (sp - 3) / 20)).normalize();
      if (!r.chaseDir) r.chaseDir = dir.clone();
      r.chaseDir.lerp(dir, 1 - Math.exp(-dt * 3.5)).normalize();
      const want = cp.clone().addScaledVector(r.chaseDir, -6.8).add(new THREE.Vector3(0, 2.4, 0));
      r.camPos.lerp(want, 1 - Math.exp(-dt * 8));
      const look = cp.clone().addScaledVector(r.chaseDir, 3).add(new THREE.Vector3(0, 0.6, 0));
      r.camLook.lerp(look, 1 - Math.exp(-dt * 12));
      cam.position.copy(r.camPos); cam.lookAt(r.camLook);
      cam.fov = 60 + 2 + Math.min(10, sp * 0.25); cam.updateProjectionMatrix();
    }
  };
  return r;
}

test('3g: style "travel" matches the reference title orbit and chase frame by frame, FOV added to 3e\'s base', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6);
  a.position.set(0, 4, -8); a.userData.lhFov = 60;
  const rig = createChaseRig(a, { style: 'travel' }), ref = travelRef(b);
  const body = { p: { x: 0, y: 0.5, z: 0 }, q: new THREE.Quaternion(), v: { x: 0, y: 0, z: 0 } };
  let yawB = 0.3;
  for (let i = 0; i < 300; i++) {
    const dt = i % 4 ? 1 / 60 : 1 / 45, title = i < 60;
    if (!title) { const sp = Math.min(40, (i - 60) * 0.3); yawB += 0.01; body.v.x = Math.sin(yawB + 0.4) * sp; body.v.z = Math.cos(yawB + 0.4) * sp; body.p.x += body.v.x * dt; body.p.z += body.v.z * dt; }
    body.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawB);
    ref.orbit = title; ref.update(body, dt);
    if (title) rig.orbit(body, dt); else rig.follow(body, dt);
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    assert.ok(Math.abs(a.fov - b.fov) < 1e-12, `fov at frame ${i}`);
  }
  assert.ok(a.fov > 70); // fast: base 60 + 2 + up to 10
  a.userData.lhFov = 64; rig.follow(body, 1 / 60); assert.ok(Math.abs(a.fov - 76) < 1e-9); // a portrait base moves the whole range
  rig.snap(body); const look = new THREE.Vector3(); a.getWorldDirection(look);
  assert.ok(Math.abs(a.position.y - (0.5 + 2.4)) < 1e-9);
  assert.throws(() => createChaseRig(new THREE.PerspectiveCamera()).orbit(body, 0.1), /needs style 'travel'/);
  assert.throws(() => createChaseRig(new THREE.PerspectiveCamera(), { style: 'drone' }), /style 'drone'/);
});
// the reference over all four modes: travelRef for the title orbit and chase, mount views as below
test('3g: four camera modes on one camera, title -> chase -> bumper -> bonnet -> chase, frame by frame (3j #9)', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6), zFront = 1.2;
  a.position.set(0, 4, -8); a.userData.lhFov = 60;
  const SOCK = { 1: { p: [0, 0.05, zFront + 0.9] }, 2: { p: [0, 0.62, 0.35] } };
  const chase = createChaseRig(a, { style: 'travel' }), mount = createMountRig(a, { socket: SOCK[1], fovAdd: 12 }), ref = travelRef(b);
  const body = { p: { x: 0, y: 0.5, z: 0 }, q: new THREE.Quaternion(), v: { x: 0, y: 0, z: 0 } }, Y = new THREE.Vector3(0, 1, 0);
  let yawB = 0.3;
  for (let i = 0; i < 300; i++) {
    const dt = i % 4 ? 1 / 60 : 1 / 45, mode = i < 40 ? 'title' : i < 120 ? 0 : i < 160 ? 1 : i < 200 ? 2 : 0;
    if (mode !== 'title') { const sp = Math.min(30, (i - 40) * 0.3); yawB += 0.01; body.v.x = Math.sin(yawB + 0.3) * sp; body.v.z = Math.cos(yawB + 0.3) * sp; body.p.x += body.v.x * dt; body.p.z += body.v.z * dt; }
    body.q.setFromAxisAngle(Y, yawB);
    if (mode === 'title' || mode === 0) { ref.orbit = mode === 'title'; ref.update(body, dt); }
    else { // mount views (the reference camPos is left alone in these modes)
      const cp = new THREE.Vector3(body.p.x, body.p.y, body.p.z), off = mode === 1 ? new THREE.Vector3(0, 0.05, zFront + 0.9) : new THREE.Vector3(0, 0.62, 0.35);
      b.position.copy(cp).add(off.applyQuaternion(body.q));
      const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(body.q));
      b.up.set(0, 1, 0).applyQuaternion(body.q); b.lookAt(look); b.up.set(0, 1, 0); b.fov = 72; b.updateProjectionMatrix();
    }
    if (mode === 'title') chase.orbit(body, dt); else if (mode === 0) chase.follow(body, dt); else { mount.set(SOCK[mode]); mount.follow(body); }
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i} (mode ${mode})`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i} (mode ${mode})`);
    assert.ok(Math.abs(a.fov - b.fov) < 1e-12, `fov at frame ${i} (mode ${mode})`);
  }
});
