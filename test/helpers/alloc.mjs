// Allocation probes for view code (R-8): three.js id counters (any new Object3D, Material or BufferGeometry moves them; each
// threeIds() call itself makes one of each) and retained heap after forced GCs, measured after `warm` runs so the JIT's own
// code and feedback do not count. Short-lived garbage is not caught here.
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
export const threeIds = () => ({ object: new THREE.Object3D().id, material: new THREE.Material().id, geometry: new THREE.BufferGeometry().id });
export function retained(fn, n, warm = 2000) {
  for (let i = 0; i < warm; i++) fn();
  gc(); gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) fn();
  gc(); gc();
  return process.memoryUsage().heapUsed - before;
}
