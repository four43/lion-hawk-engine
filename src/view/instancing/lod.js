// Distance level of detail (A-12–A-18). A model's levels are its lod0 … lodN nodes (A-12; a model without them is one
// level); each level's meshes are merged per material into one geometry in the model's frame and drawn by one
// createInstances mesh with a LOD_FADE material (M-11). Every level geometry carries its window as lhLod = (in, out,
// band): the GPU fades between levels per instance per frame (A-13), the CPU only decides which meshes hold an instance:
// those whose window, widened by the band, holds its scaled distance.
// - createLodInstances: per frame begin(camera) → add(p, q, s) … → commit(), for moving props (A-14).
// - createScatter: static instances bucketed into cells, refilled when the eye moves a step, zooms or turns (A-15, A-18).
// Distances are scaled by the eye's LOD scale (compiler.eye.value.w, A-16). Nothing is allocated after create (R-8).
import * as THREE from 'three';
import { createInstances } from './instances.js';

const LEVELS = ['lod0', 'lod1', 'lod2', 'lod3'];
const LAG = 1;     // m (scaled) more on each side of a window: the GPU's eye may be a frame ahead of the CPU's
const ZOOM = 1.1;  // the scatter refills once the LOD scale changes by more than this factor (A-15)

// The levels of a loaded model (assets.get(key), or its scene): per level, [{ name, geometry }], one per material.
export function lodLevels(asset) {
  const scene = asset?.scene ?? asset;
  if (!scene?.isObject3D) throw new Error('lod: asset must be a loaded model (assets.get(key)) or its scene');
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert(), roots = [];
  for (const n of LEVELS) { const o = scene.getObjectByName(n); if (!o) break; roots.push(o); }
  if (!roots.length) roots.push(scene);
  return roots.map((root, l) => {
    const byMat = new Map();
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      if (Array.isArray(o.material)) throw new Error(`lod: mesh '${o.name}' has several materials; split it per material`);
      const name = o.userData.lhMat?.[0] ?? o.material?.name ?? '';
      if (name.startsWith('paint-')) throw new Error(`lod: mesh '${o.name}' uses ${name}; paint slots are not drawn with levels yet`);
      (byMat.get(name) ?? byMat.set(name, []).get(name)).push(o);
    });
    if (!byMat.size) throw new Error(`lod: level ${l} (${root.name || 'the model'}) has no meshes`);
    return [...byMat].map(([name, meshes]) => ({ name, geometry: merge(meshes, inv) }));
  });
}

// Meshes → one indexed geometry in the model's frame: position, normal and (when any mesh has them) colour.
function merge(meshes, inv) {
  let nv = 0, ni = 0;
  for (const m of meshes) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const colors = meshes.some(m => m.geometry.attributes.color);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = colors ? new Float32Array(nv * 3).fill(1) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), mm = new THREE.Matrix4(), nm = new THREE.Matrix3();
  let ov = 0, oi = 0, normals = true;
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
    mm.multiplyMatrices(inv, m.matrixWorld); nm.getNormalMatrix(mm);
    if (!N) normals = false;
    for (let i = 0, o = ov * 3; i < P.count; i++, o += 3) {
      v.fromBufferAttribute(P, i).applyMatrix4(mm); pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o] = v.x; nor[o + 1] = v.y; nor[o + 2] = v.z; }
      if (C) { col[o] = C.getX(i); col[o + 1] = C.getY(i); col[o + 2] = C.getZ(i); }
    }
    if (I) for (let k = 0; k < I.count; k++) idx[oi + k] = I.getX(k) + ov;
    else for (let k = 0; k < P.count; k++) idx[oi + k] = ov + k;
    ov += P.count; oi += I ? I.count : P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!normals) out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

// Level k shows from distances[k − 1] (lod0: from 0) to distances[k], each edge a ±band fade (A-13).
export function lodWindows(distances, band) {
  if (!Array.isArray(distances) || !distances.length || distances.some((d, i) => !(Number.isFinite(d) && d > 0) || (i && d <= distances[i - 1])))
    throw new Error(`lod: distances must be rising numbers above 0, one per level (got ${JSON.stringify(distances)})`);
  if (!(Number.isFinite(band) && band >= 0)) throw new Error(`lod: band must be a number of metres, 0 or more (got ${JSON.stringify(band)})`);
  return distances.map((out, l) => {
    const inn = l ? distances[l - 1] : 0;
    return { in: inn, out, band, lo: l ? inn - band - LAG : -Infinity, hi: out + band + LAG };
  });
}

// The shared part: per level, one instanced mesh per material, in one group.
function buildLevels({ asset, distances, band, compiler, max, shadowLevels, receiveShadow, what }) {
  if (!compiler?.eye || typeof compiler.get !== 'function') throw new Error(`${what}: compiler (view.materials) is required`);
  if (!(Number.isInteger(max) && max >= 1)) throw new Error(`${what}: max must be a whole number of at least 1 (got ${max})`);
  const parts = lodLevels(asset);
  if (distances?.length !== parts.length) throw new Error(`${what}: the model has ${parts.length} level(s), so distances needs ${parts.length} (got ${JSON.stringify(distances)})`);
  const windows = lodWindows(distances, band), object = new THREE.Group();
  object.name = 'lod';
  let radius = 0;
  const levels = parts.map((list, l) => list.map(({ name, geometry }) => {
    const n = geometry.attributes.position.count, w = windows[l], a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = l ? w.in : 0; a[i * 3 + 1] = w.out; a[i * 3 + 2] = band; }
    geometry.setAttribute('lhLod', new THREE.BufferAttribute(a, 3));
    if (l === 0) radius = Math.max(radius, geometry.boundingSphere.center.length() + geometry.boundingSphere.radius);
    const material = compiler.get(name, { instanced: true, vertexColors: !!geometry.attributes.color, receiveShadow, lodFade: true });
    const inst = createInstances({ geometry, material, max, castShadow: l < shadowLevels, receiveShadow });
    inst.mesh.customDepthMaterial = compiler.depth(material); // the shadow fades with its level
    inst.mesh.name = `lod${l}:${name}`;
    object.add(inst.mesh);
    return inst;
  }));
  const dispose = () => { object.removeFromParent(); for (const list of levels) for (const inst of list) { inst.dispose(); inst.mesh.geometry.dispose(); } };
  return { object, levels, windows, radius, dispose };
}

// The eye as (x, y, z, scale): a camera sets the compiler's eye now (A-16); a Vector3/4 is used as is (scale w, else 1).
function eyeOf(compiler, eye, out) {
  const e = eye?.isCamera ? compiler.setEye(eye) : eye ?? compiler.eye.value;
  out[0] = e.x; out[1] = e.y; out[2] = e.z; out[3] = e.w ?? 1;
  return out;
}

// A-14: moving props. begin(camera?) → add(p, q, s) per instance → commit(). s: a number or { x, y, z }.
export function createLodInstances({ asset, distances, band = 10, compiler, max, shadowLevels = 1, receiveShadow = true } = {}) {
  const L = buildLevels({ asset, distances, band, compiler, max, shadowLevels, receiveShadow, what: 'createLodInstances' });
  const n = new Int32Array(L.levels.length), eye = new Float64Array(4);
  return {
    object: L.object, levels: L.levels, windows: L.windows,
    begin(camera) { eyeOf(compiler, camera, eye); n.fill(0); },
    add(p, q, s = 1) {
      const d = Math.hypot(p.x - eye[0], p.y - eye[1], p.z - eye[2]) * eye[3];
      for (let l = 0; l < n.length; l++) {
        const w = L.windows[l];
        if (d < w.lo || d > w.hi || n[l] >= max) continue;
        for (const inst of L.levels[l]) inst.set(n[l], p, q, s);
        n[l]++;
      }
    },
    commit() { for (let l = 0; l < n.length; l++) for (const inst of L.levels[l]) { inst.count = n[l]; inst.commit(); } },
    counts: () => Array.from(n),
    dispose: L.dispose,
  };
}

// items: a Float32Array of 4×4 matrices (column-major), or [{ p: { x, y, z } | [x, y, z], yaw = 0, s = 1 }].
function matricesOf(items) {
  if (items instanceof Float32Array) {
    if (!items.length || items.length % 16) throw new Error(`createScatter: items as a Float32Array must hold 4×4 matrices (got ${items.length} numbers)`);
    return items;
  }
  if (!Array.isArray(items) || !items.length) throw new Error('createScatter: items must be a Float32Array of matrices or a non-empty array of { p, yaw, s }');
  const out = new Float32Array(items.length * 16), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    const a = it.p; if (Array.isArray(a)) p.fromArray(a); else p.set(a.x, a.y, a.z);
    m.compose(p, q.setFromAxisAngle(up, it.yaw ?? 0), s.setScalar(it.s ?? 1)).toArray(out, i * 16);
  });
  return out;
}

const _dir = new THREE.Vector3();
// A-15, A-18: static instances in cells. update(camera) once a frame; it refills only when needed.
export function createScatter({ asset, items, distances, band = 10, compiler, cell = 16, refill = 8, cone = true, coneMargin = 20, nearAll = 30, shadowLevels = 1, receiveShadow = true } = {}) {
  for (const [k, v] of Object.entries({ cell, refill, coneMargin, nearAll })) if (!(Number.isFinite(v) && v >= 0) || ((k === 'cell' || k === 'refill') && !v)) throw new Error(`createScatter: ${k} must be a number above 0 (got ${JSON.stringify(v)})`);
  const mats = matricesOf(items), count = mats.length / 16;
  const L = buildLevels({ asset, distances, band, compiler, max: count, shadowLevels, receiveShadow, what: 'createScatter' });
  // Bucket: per cell, its matrices, centre and reach (half its diagonal plus the model's radius at the largest scale).
  const lists = new Map();
  for (let i = 0; i < count; i++) {
    const x = mats[i * 16 + 12], z = mats[i * 16 + 14], key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    (lists.get(key) ?? lists.set(key, []).get(key)).push(i);
  }
  const cells = [...lists.values()].map(ix => {
    const m = new Float32Array(ix.length * 16);
    let sx = 0, sy = 0, sz = 0, s = 0;
    ix.forEach((i, k) => {
      m.set(mats.subarray(i * 16, i * 16 + 16), k * 16);
      sx += mats[i * 16 + 12]; sy += mats[i * 16 + 13]; sz += mats[i * 16 + 14];
      s = Math.max(s, Math.hypot(mats[i * 16], mats[i * 16 + 1], mats[i * 16 + 2]));
    });
    return { m, n: ix.length, x: sx / ix.length, y: sy / ix.length, z: sz / ix.length, r: cell * Math.SQRT1_2 + L.radius * s };
  });
  const n = new Int32Array(L.levels.length), eye = new Float64Array(4), last = { ix: NaN, iy: NaN, iz: NaN, scale: 0, dir: new THREE.Vector3() };
  const slack = cell * Math.SQRT1_2 + refill * Math.sqrt(3), margin = coneMargin * Math.PI / 180;
  const stats = { ms: 0, refills: 0, counts: Array.from(n) };

  function fill(camera) {
    const t0 = performance.now();
    let limit = Math.PI; // the cone's half-angle; π: no cone
    if (cone && camera?.isPerspectiveCamera) {
      const t = Math.tan(camera.fov * Math.PI / 360) / (camera.zoom || 1);
      limit = Math.atan(t * Math.sqrt(1 + camera.aspect * camera.aspect)) + margin;
    }
    const dx0 = last.dir.x, dy0 = last.dir.y, dz0 = last.dir.z, k = eye[3];
    n.fill(0);
    for (const c of cells) {
      const vx = c.x - eye[0], vy = c.y - eye[1], vz = c.z - eye[2], d = Math.hypot(vx, vy, vz);
      if (limit < Math.PI && d > nearAll + c.r) {
        const ang = Math.acos(Math.max(-1, Math.min(1, (vx * dx0 + vy * dy0 + vz * dz0) / d))) - Math.asin(Math.min(1, c.r / d));
        if (ang > limit) continue;
      }
      const lo = Math.max(0, d - slack) * k / ZOOM, hi = (d + slack) * k * ZOOM;
      for (let l = 0; l < n.length; l++) {
        const w = L.windows[l];
        if (hi < w.lo || lo > w.hi) continue;
        for (const inst of L.levels[l]) inst.mesh.instanceMatrix.array.set(c.m, n[l] * 16);
        n[l] += c.n;
      }
    }
    for (let l = 0; l < n.length; l++) for (const inst of L.levels[l]) { inst.mesh.count = n[l]; inst.mesh.instanceMatrix.needsUpdate = true; stats.counts[l] = n[l]; }
    stats.ms = performance.now() - t0; stats.refills++;
  }

  return {
    object: L.object, levels: L.levels, windows: L.windows, stats,
    // camera: the render camera (sets the compiler's eye, A-16); refills when the eye has crossed a `refill` m step, the
    // LOD scale has changed by more than 10%, or (with the cone) the view has turned more than half the margin.
    update(camera) {
      if (!camera?.isCamera) throw new Error('createScatter: update(camera) needs the render camera');
      eyeOf(compiler, camera, eye);
      camera.getWorldDirection(_dir);
      const ix = Math.floor(eye[0] / refill), iy = Math.floor(eye[1] / refill), iz = Math.floor(eye[2] / refill);
      const zoomed = eye[3] > last.scale * ZOOM || eye[3] < last.scale / ZOOM;
      const turned = cone && _dir.dot(last.dir) < Math.cos(margin / 2);
      if (ix === last.ix && iy === last.iy && iz === last.iz && !zoomed && !turned) return false;
      last.ix = ix; last.iy = iy; last.iz = iz; last.scale = eye[3]; last.dir.copy(_dir);
      fill(camera);
      return true;
    },
    dispose: L.dispose,
  };
}
