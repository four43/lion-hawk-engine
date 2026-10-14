import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitRig } from '../src/view/camera/orbit.js';

// games/pig-pens/src/view/rig.js at e03ed71: applyCam, panBy and chase (rig.gesture null), on a local cam object
function pigPensRig(camera) {
  const cam = { tx: 0, tz: 1, yaw: 0, pitch: 0.92, dist: 46 }, o = { chaseOff: 0 };
  const applyCam = () => {
    cam.pitch = Math.max(0.28, Math.min(1.48, cam.pitch)); cam.dist = Math.max(2.5, Math.min(80, cam.dist));
    cam.tx = Math.max(-34, Math.min(34, cam.tx)); cam.tz = Math.max(-30, Math.min(30, cam.tz));
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 0.5, cam.tz); camera.updateMatrixWorld();
  };
  const panBy = (dx, dy) => {
    const k = cam.dist * 0.0016, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.tx -= (dx * rx - dy * fx / Math.max(0.5, Math.sin(cam.pitch))) * k; cam.tz -= (dx * rz - dy * fz / Math.max(0.5, Math.sin(cam.pitch))) * k;
  };
  const chase = (t, dt) => {
    const want = t.yaw + Math.PI + o.chaseOff; let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * Math.min(1, dt * 2.5); o.chaseOff *= Math.max(0, 1 - dt * 0.8);
    const lead = Math.max(-1, Math.min(3, t.fwd * 0.5));
    cam.tx += (t.x + Math.sin(t.yaw) * lead - cam.tx) * Math.min(1, dt * 5); cam.tz += (t.z + Math.cos(t.yaw) * lead - cam.tz) * Math.min(1, dt * 5);
    cam.pitch += (0.42 - cam.pitch) * Math.min(1, dt * 2); cam.dist += (Math.min(Math.max(cam.dist, 9), 22) - cam.dist) * Math.min(1, dt * 2);
  };
  const afterDrive = () => { cam.pitch = Math.max(cam.pitch, 0.7); cam.dist = Math.max(cam.dist, 18); o.chaseOff = 0; };
  return { cam, o, applyCam, panBy, chase, afterDrive };
}
const PIG_PENS = { target: { x: 0, y: 0.5, z: 1 }, distance: 46, pitch: 0.92, bounds: { x: [-34, 34], z: [-30, 30] } };
const same = (a, b, what) => {
  assert.ok(a.position.distanceTo(b.position) < 1e-9, `${what}: position`);
  assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `${what}: rotation`);
};

test('3g: createOrbitRig matches Pig Pens\' orbit, pan, drive chase, release and clamps (port of view/rig.js)', () => {
  const a = new THREE.PerspectiveCamera(50, 1.5), b = new THREE.PerspectiveCamera(50, 1.5), rig = createOrbitRig(a, PIG_PENS), ref = pigPensRig(b);
  rig.update(); ref.applyCam(); same(a, b, 'start');
  rig.state.yaw = ref.cam.yaw = 0.4; rig.panBy(30, -12); ref.panBy(30, -12); rig.update(); ref.applyCam(); same(a, b, 'pan');
  rig.state.chaseOff = ref.o.chaseOff = 0.3;
  const t = { x: 3, z: -2, yaw: 1, fwd: 4 };
  for (let i = 0; i < 90; i++) { t.x += 0.1; t.yaw += 0.01; rig.chase(t, 1 / 60); ref.chase(t, 1 / 60); rig.update(1 / 60); ref.applyCam(); same(a, b, `chase ${i}`); }
  rig.release(); ref.afterDrive(); rig.update(); ref.applyCam(); same(a, b, 'release'); assert.equal(rig.state.chaseOff, 0);
  rig.state.pitch = ref.cam.pitch = 3; rig.state.dist = ref.cam.dist = 500; rig.state.tx = ref.cam.tx = 100; rig.state.tz = ref.cam.tz = -100;
  rig.update(); ref.applyCam(); same(a, b, 'clamps'); assert.deepEqual([rig.state.pitch, rig.state.dist, rig.state.tx, rig.state.tz], [1.48, 80, 34, -30]);
});
test('3g: a held chase drag keeps the chase offset; let go, it recentres (Pig Pens drive)', () => {
  const rig = createOrbitRig(new THREE.PerspectiveCamera()), t = { x: 0, z: 0, yaw: 0, fwd: 0 };
  rig.state.chaseOff = 0.5; rig.gesture = 'chase'; rig.chase(t, 0.5); assert.equal(rig.state.chaseOff, 0.5);
  rig.gesture = null; rig.chase(t, 0.5); assert.ok(Math.abs(rig.state.chaseOff - 0.3) < 1e-12);
});
test('3g: ray through the canvas centre runs from the camera along its view; a fresh array unless out is given (#72)', () => {
  const c = new THREE.PerspectiveCamera(60, 2), canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
  const rig = createOrbitRig(c, { canvas }); rig.update();
  const r = rig.ray(110, 70), dir = c.getWorldDirection(new THREE.Vector3());
  assert.equal(r.length, 6);
  assert.ok(Math.hypot(r[0] - c.position.x, r[1] - c.position.y, r[2] - c.position.z) < 1e-9);
  assert.ok(Math.hypot(r[3] - dir.x, r[4] - dir.y, r[5] - dir.z) < 1e-9);
  assert.notEqual(rig.ray(110, 70), r); const out = [0, 0, 0, 0, 0, 0]; assert.equal(rig.ray(110, 70, out), out);
  assert.throws(() => createOrbitRig(c).ray(0, 0), /orbit\.ray: no element/);
  assert.throws(() => createOrbitRig({}), /camera required/);
});
test('3g: fit frames by aspect (Pig Pens\' fitCam); limits are live (Pig Pens framing)', () => {
  const fit = { portrait: { yaw: Math.PI / 2, dist: 60, tx: -3, tz: -9 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } };
  const c = new THREE.PerspectiveCamera(50, 0.5), rig = createOrbitRig(c, { ...PIG_PENS, fit });
  rig.fit(); assert.deepEqual([rig.state.yaw, rig.state.dist, rig.state.tx, rig.state.tz], [Math.PI / 2, 60, -3, -9]);
  rig.fit(1.5); assert.deepEqual([rig.state.yaw, rig.state.dist, rig.state.tx, rig.state.tz], [0, 46, -1, -4]);
  rig.limits.max = 30; rig.update(); assert.equal(rig.state.dist, 30);
  rig.limits.bounds = null; rig.state.tx = 500; rig.update(); assert.equal(rig.state.tx, 500);
  assert.throws(() => createOrbitRig(c).fit(), /no fit framing/);
});
