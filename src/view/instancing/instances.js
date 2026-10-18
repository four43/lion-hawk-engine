// One InstancedMesh with a live count (overview §4.9). set(i, p, q, s) composes instance i (s a number or { x, y, z }),
// setMatrix(i, m) copies a Matrix4, color(i, c) sets its instance colour (a CSS string, a hex number or a THREE.Color), copy(from,
// to) moves an instance (swap-remove), commit() flags for upload only what changed. Frustum culling is off: instances spread over
// the whole map and the mesh's bounds would be its first instance's. With `colors` the colour buffer exists from the start, white.
// With `coverage` (3f's COVERAGE_INSTANCED materials) the mesh gets a per-instance vec4 `instanceCoverage` (dirt, rust, snow,
// mud; zero) written by cover(i, d, r, s, m). It lives on a geometry of the mesh's own that shares the source's attributes, so
// the template and plain clones never see it. dispose() frees the wrapper holding only instanceCoverage (three frees every
// attribute a disposed geometry lists, so the shared ones are detached first).
// Nothing is allocated after create (setting a colour from a CSS string parses it: do that at spawn, not per frame).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function createInstances({ geometry, material, max, castShadow = true, receiveShadow = true, colors = false, coverage = false } = {}) {
  if (!geometry?.isBufferGeometry) throw new Error('createInstances: geometry required');
  if (!material) throw new Error('createInstances: material required');
  if (!(Number.isInteger(max) && max >= 1)) throw new Error(`createInstances: max must be a whole number of at least 1 (got ${max})`);
  let geo = geometry, cov = null;
  if (coverage) {
    geo = new THREE.BufferGeometry(); geo.name = geometry.name;
    for (const k of Object.keys(geometry.attributes)) geo.setAttribute(k, geometry.attributes[k]);
    geo.setIndex(geometry.index); for (const g of geometry.groups) geo.addGroup(g.start, g.count, g.materialIndex);
    cov = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); cov.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceCoverage', cov);
  }
  const mesh = new THREE.InstancedMesh(geo, material, max);
  mesh.count = 0; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  let dirtyM = false, dirtyC = false, dirtyV = false;
  return {
    mesh, max, coverage: cov,
    get count() { return mesh.count; },
    set count(n) { if (!(Number.isInteger(n) && n >= 0 && n <= max)) throw new RangeError(`instances: count ${n} outside 0..${max}`); mesh.count = n; },
    set(i, p, q, s = 1) {
      _p.set(p.x, p.y, p.z); _q.set(q.x, q.y, q.z, q.w);
      if (typeof s === 'number') _s.setScalar(s); else _s.set(s.x, s.y, s.z);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s)); dirtyM = true;
    },
    setMatrix(i, m) { mesh.setMatrixAt(i, m); dirtyM = true; },
    getMatrix(i, out) { mesh.getMatrixAt(i, out); return out; },
    color(i, c) { mesh.setColorAt(i, c?.isColor ? c : _c.set(c)); dirtyC = true; },
    cover(i, d, r, s, m) {
      if (!cov) throw new Error('instances: cover() needs coverage: true');
      const a = cov.array, o = i * 4; a[o] = d; a[o + 1] = r; a[o + 2] = s; a[o + 3] = m; dirtyV = true;
    },
    copy(from, to) {
      const a = mesh.instanceMatrix.array; a.copyWithin(to * 16, from * 16, from * 16 + 16); dirtyM = true;
      if (mesh.instanceColor) { mesh.instanceColor.array.copyWithin(to * 3, from * 3, from * 3 + 3); dirtyC = true; }
      if (cov) { cov.array.copyWithin(to * 4, from * 4, from * 4 + 4); dirtyV = true; }
    },
    commit() {
      if (dirtyM) { mesh.instanceMatrix.needsUpdate = true; dirtyM = false; }
      if (dirtyC && mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; dirtyC = false; }
      if (dirtyV) { cov.needsUpdate = true; dirtyV = false; }
    },
    dispose() { // geometry and material are shared: not disposed here (the coverage wrapper is ours)
      mesh.removeFromParent(); mesh.dispose();
      if (cov) { for (const k of Object.keys(geo.attributes)) if (k !== 'instanceCoverage') geo.deleteAttribute(k); geo.setIndex(null); geo.dispose(); }
    },
  };
}
