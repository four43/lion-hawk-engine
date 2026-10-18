import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMarks } from '../../src/kits/fx/view.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const M = new THREE.Matrix4();
const at = (mk, i, x, y, z) => { mk.mesh.getMatrixAt(i, M); return new THREE.Vector3(x, y, z).applyMatrix4(M); };

test('add() lays a mark along (nx, nz): length along it, width across, flat on the ground', () => {
  const mk = createMarks({ max: 4, width: 0.5, length: 1 });
  assert.equal(mk.add(2, 3, 3, 4, 1), 0);                         // heading (0.6, 0.8)
  const tip = at(mk, 0, 0, 0, 0.5), side = at(mk, 0, 0.5, 0, 0);
  near(tip.x, 2.3, 1e-6); near(tip.y, 0.06, 1e-6); near(tip.z, 3.4, 1e-6);
  near(side.x, 2.2, 1e-6); near(side.z, 2.85, 1e-6);              // across = (0.8, -0.6) × width 0.5 × 0.5
  near(new THREE.Vector3(0, 1, 0).transformDirection(M).y, 1, 1e-6);
  const box = mk.mesh.geometry.boundingBox ?? (mk.mesh.geometry.computeBoundingBox(), mk.mesh.geometry.boundingBox);
  near(box.max.y - box.min.y, 0, 1e-9);                        // a quad lying in xz
  assert.equal(mk.mesh.count, 1);
});

test('alpha narrows the mark; heightAt and lift set its height', () => {
  const mk = createMarks({ max: 2, width: 0.5, heightAt: (x, z) => x + z, lift: 0.1 });
  mk.add(1, 2, 0, 1, 0);                                          // alpha 0: half width, heading +z
  const side = at(mk, 0, 1, 0, 0);
  near(side.x, 1.25, 1e-6); near(side.y, 3.1, 1e-6); near(side.z, 2, 1e-6);
});

test('marks form a ring; update uploads only the rows written; a zero direction is ignored', () => {
  const mk = createMarks({ max: 3 });
  for (let k = 0; k < 4; k++) mk.add(k, 0, 1, 0);
  assert.equal(mk.mesh.count, 3);
  mk.update(0);
  assert.deepEqual(mk.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  mk.add(9, 9, 0, 1);                                             // slot 1
  mk.update(0);
  assert.deepEqual(mk.mesh.instanceMatrix.updateRanges, [{ start: 16, count: 16 }]);
  assert.equal(mk.add(0, 0, 0, 0), -1); assert.equal(mk.mesh.count, 3);
});
test('dispose takes the marks mesh out of its parent and frees what it made', () => {
  const m = createMarks({ max: 4 }), scene = new THREE.Scene(); scene.add(m.mesh); let n = 0;
  for (const r of [m.mesh.geometry, m.mesh.material, m.mesh]) r.addEventListener('dispose', () => n++);
  m.dispose(); assert.equal(m.mesh.parent, null); assert.equal(n, 3);
});
