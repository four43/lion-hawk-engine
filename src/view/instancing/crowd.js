// Crowds (overview §4.9, A-11): one InstancedMesh per animated part, posed from a baked animation table (herds,
// flocks). asset is assets.get(key) with its decoded anim table (3f's decodeAnimTable). set(i, pose, clip, t, blend?) writes
// instance i: pose is a Matrix4 or { p, q, s? }; each part's matrix is pose x 3f's sampleAnimTable(clip, t). With blend =
// { clip, t, k } it is 3f's blendAnimTable(blend.clip, blend.t, clip, t, k): k is this clip's weight (1 = no blend), as an
// element-wise lerp. Parts whose instanced material has COVERAGE_INSTANCED (3f) get instanceCoverage: cover(i, dirt, rust, snow, mud)
// (per-animal mud). count sets how many draw; commit() uploads. parts[k].inst is the part's createInstances, for games
// that add attributes. Nothing is allocated after create.
import * as THREE from 'three';
import { sampleAnimTable, blendAnimTable } from '../assets/animTable.js';
import { createInstances } from './instances.js';
import { instancedShadows } from '../render/hygiene.js';
import { instancedPart } from './parts.js';

const _w = new THREE.Matrix4(), _a = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export function createCrowd(asset, { max, compiler, castShadow = true, receiveShadow = true } = {}) {
  if (!asset?.scene) throw new Error('createCrowd: asset required (assets.get(key))');
  const table = asset.anim, name = asset.scene.name || 'model';
  if (!table) throw new Error(`createCrowd: '${name}' has no anim table (bake it with animTable)`);
  if (!compiler) throw new Error('createCrowd: compiler required');
  if (!(Number.isInteger(max) && max >= 1)) throw new Error(`createCrowd: max must be a whole number of at least 1 (got ${max})`);
  const group = new THREE.Group(); group.name = `crowd:${name}`;
  const parts = table.parts.map(pn => {
    const src = asset.scene.getObjectByName(pn);
    if (!src?.isMesh) throw new Error(`createCrowd: part '${pn}' of the anim table is not a mesh in '${name}'`);
    const { holder, coverage } = instancedPart(src, compiler);
    const inst = createInstances({ geometry: src.geometry, material: holder.material, max, castShadow, receiveShadow, coverage });
    inst.mesh.name = `${name}:${pn}`; if (holder.customDepthMaterial) inst.mesh.customDepthMaterial = holder.customDepthMaterial;
    instancedShadows(inst.mesh); group.add(inst.mesh);
    return { name: pn, inst, coverage };
  });
  let count = 0;
  return {
    group, parts,
    get count() { return count; },
    set count(n) {
      if (!(Number.isInteger(n) && n >= 0 && n <= max)) throw new RangeError(`crowd: count ${n} outside 0..${max}`);
      count = n; for (let k = 0; k < parts.length; k++) parts[k].inst.count = n;
    },
    set(i, pose, clip, t, blend) {
      if (pose.isMatrix4) _w.copy(pose);
      else {
        const s = pose.s ?? 1;
        _w.compose(_p.set(pose.p.x, pose.p.y, pose.p.z), _q.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w), typeof s === 'number' ? _s.setScalar(s) : _s.set(s.x, s.y, s.z));
      }
      for (let k = 0; k < parts.length; k++) {
        if (blend && blend.k < 1) blendAnimTable(table, blend.clip, blend.t, clip, t, blend.k, k, _a);
        else sampleAnimTable(table, clip, t, k, _a);
        parts[k].inst.setMatrix(i, _t.multiplyMatrices(_w, _a));
      }
    },
    cover(i, d, r, s, m) { for (let k = 0; k < parts.length; k++) if (parts[k].coverage) parts[k].inst.cover(i, d, r, s, m); },
    commit() { for (let k = 0; k < parts.length; k++) parts[k].inst.commit(); },
    dispose() { group.removeFromParent(); for (let k = 0; k < parts.length; k++) parts[k].inst.dispose(); },
  };
}
