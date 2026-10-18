// One template mesh as an instanced part (view sync's draw: 'instanced', and assets.preload's { instanced } warm list):
// its instanced material (compiled with coverage), its paint slot (instance colour) or null, and whether it reads
// instanceCoverage. The holder mesh carries the material and, for FUR or WIND, its depth twin.
import * as THREE from 'three';

export function instancedPart(o, compiler) {
  // the authored name: a template the compiler already applied has the paint base's material, its paint-<slot> in lhMat
  const name = o.userData.lhMat?.[0] ?? (typeof o.material?.name === 'string' ? o.material.name : '');
  const holder = new THREE.Mesh(o.geometry, o.material); holder.name = o.name;
  if (o.userData.lhMat) holder.userData.lhMat = o.userData.lhMat;
  compiler.apply(holder, { instanced: true, coverage: true });
  return { holder, paint: name.startsWith('paint-') ? name.slice(6) : null, coverage: holder.material.defines?.COVERAGE_INSTANCED !== undefined };
}
