// kit-fx (view half): pooled particles and ground marks, one InstancedMesh each (Tractor's fx.js and gibs.js, Pig Pens'
// feathers). State lives in typed arrays; nothing is allocated per emit or per frame, and uploads cover only the rows
// written. No randomness here (U-6): callers pass velocities drawn from engine.rng('fx'); start spins come from the slot.
import * as THREE from 'three';

const fail = m => { throw new Error(`fx: ${m}`); };
const GOLDEN = 2.399963229728653;
const UP = new THREE.Vector3(0, 1, 0), TUMBLE = new THREE.Vector3(0.3, 1, 0.2).normalize();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const F = 13; // per slot: x y z vx vy vz life max size spin g drag floorY

export function createParticles({ max = 1200, shape = 'cube', geometry = null, material = null, gravity = 9.8, drag = 0.5,
  floor = null, bounce = 0, friction = 1 } = {}) {
  if (!Number.isInteger(max) || max < 1) fail(`max must be a positive integer (got ${max})`);
  if (shape !== 'cube' && shape !== 'quad') fail(`shape must be 'cube' or 'quad' (got ${shape})`);
  const geo = geometry ?? (shape === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.PlaneGeometry(1, 1));
  const flat = shape === 'quad';
  const mesh = new THREE.InstancedMesh(geo, material ?? new THREE.MeshLambertMaterial(), max);
  mesh.name = 'fx-particles'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const color = new THREE.Color(1, 1, 1);
  mesh.setColorAt(0, color); // makes instanceColor
  mesh.count = 0;
  const S = new Float64Array(max * F), live = new Uint8Array(max), landed = new Uint8Array(max);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let next = 0, high = 0, nLive = 0, cLo = max, cHi = -1;

  function emit(x, y, z, vx, vy, vz, life, size, c, g = gravity, d = drag) {
    const i = next, o = i * F;
    next = (next + 1) % max;
    if (i >= high) high = i + 1;
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = vx; S[o + 4] = vy; S[o + 5] = vz;
    S[o + 6] = life; S[o + 7] = life; S[o + 8] = size; S[o + 9] = (i * GOLDEN) % (2 * Math.PI); S[o + 10] = g; S[o + 11] = d;
    S[o + 12] = floor ? floor(x, z) : -Infinity;
    if (!live[i]) nLive++;
    live[i] = 1; landed[i] = 0;
    if (c !== null && c !== undefined) color.set(c);
    mesh.setColorAt(i, color);
    if (i < cLo) cLo = i;
    if (i > cHi) cHi = i;
    mesh.count = high;
    return i;
  }

  function update(dt) {
    if (high === 0) return;
    let lo = max, hi = -1;
    for (let i = 0; i < high; i++) {
      if (!live[i]) continue;
      const o = i * F;
      if (i < lo) lo = i;
      hi = i;
      S[o + 6] -= dt;
      if (S[o + 6] <= 0) { live[i] = 0; nLive--; mesh.setMatrixAt(i, ZERO); continue; }
      if (!landed[i]) S[o + 4] -= S[o + 10] * dt;
      const k = Math.max(0, 1 - S[o + 11] * dt);
      S[o + 3] *= k; S[o + 5] *= k;
      S[o] += S[o + 3] * dt; S[o + 2] += S[o + 5] * dt;
      if (!landed[i]) {
        S[o + 1] += S[o + 4] * dt;
        const rest = S[o + 12] + (flat ? 0.02 : S[o + 8] * 0.5);
        if (S[o + 1] <= rest) {
          S[o + 1] = rest;
          if (S[o + 4] < 0) { S[o + 4] = -S[o + 4] * bounce; S[o + 3] *= friction; S[o + 5] *= friction; }
          if (S[o + 4] < 1) { S[o + 4] = 0; landed[i] = 1; }
        }
      }
      if (!(flat && landed[i])) S[o + 9] += dt * 4;
      const sc = S[o + 8] * Math.min(1, (S[o + 6] / S[o + 7]) * 2);
      if (flat && landed[i]) q.multiplyQuaternions(qa.setFromAxisAngle(UP, S[o + 9]), FLAT);
      else q.setFromAxisAngle(TUMBLE, S[o + 9]);
      mesh.setMatrixAt(i, m4.compose(v.set(S[o], S[o + 1], S[o + 2]), q, s.set(sc, sc, sc)));
    }
    if (hi >= 0) { const a = mesh.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(lo * 16, (hi - lo + 1) * 16); a.needsUpdate = true; }
    if (cHi >= 0) { const c = mesh.instanceColor; c.clearUpdateRanges(); c.addUpdateRange(cLo * 3, (cHi - cLo + 1) * 3); c.needsUpdate = true; cLo = max; cHi = -1; }
    if (nLive === 0) { high = 0; next = 0; mesh.count = 0; }
  }

  // the mesh, and the geometry and material made here (a passed-in one is the caller's)
  function dispose() { mesh.removeFromParent(); mesh.dispose(); if (!geometry) geo.dispose(); if (!material) mesh.material.dispose(); }
  return { emit, update, mesh, color, dispose, get live() { return nLive; } };
}

// Ground marks (tyre tracks): a ring of flat quads on one InstancedMesh. add() writes the instance matrix directly
// (no trig, no allocation): across = (nz, 0, -nx) × width, up, along = (nx, 0, nz) × length.
export function createMarks({ max = 400, width = 0.45, length = 0.9, material = null, heightAt = null, lift = 0.06 } = {}) {
  if (!Number.isInteger(max) || max < 1) fail(`max must be a positive integer (got ${max})`);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = material ?? new THREE.MeshBasicMaterial({ color: '#5a4630', transparent: true, opacity: 0.4, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'fx-marks'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
  const a = mesh.instanceMatrix.array;
  let next = 0, lo = max, hi = -1;

  function add(x, z, nx, nz, alpha = 1) {
    const l = Math.sqrt(nx * nx + nz * nz);
    if (!(l > 0)) return -1;
    const fx = nx / l, fz = nz / l, al = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha, w = width * (0.5 + 0.5 * al);
    const y = (heightAt ? heightAt(x, z) : 0) + lift, i = next, o = i * 16;
    next = (next + 1) % max;
    a[o] = fz * w; a[o + 1] = 0; a[o + 2] = -fx * w; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = fx * length; a[o + 9] = 0; a[o + 10] = fz * length; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    if (mesh.count < max) mesh.count++;
    if (i < lo) lo = i;
    if (i > hi) hi = i;
    return i;
  }

  function update() {
    if (hi < 0) return;
    const m = mesh.instanceMatrix;
    m.clearUpdateRanges(); m.addUpdateRange(lo * 16, (hi - lo + 1) * 16); m.needsUpdate = true;
    lo = max; hi = -1;
  }

  function dispose() { mesh.removeFromParent(); mesh.dispose(); geo.dispose(); if (!material) mat.dispose(); } // a passed-in material is the caller's
  return { add, update, mesh, dispose };
}
