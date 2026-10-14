import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInstances } from '../src/view/instancing/instances.js';

const geo = new THREE.BoxGeometry(), mat = new THREE.MeshLambertMaterial(), Q = new THREE.Quaternion();
const at = (inst, i) => new THREE.Vector3().setFromMatrixPosition(inst.getMatrix(i, new THREE.Matrix4()));

test('3g: createInstances: an InstancedMesh with count 0, shadows on, culling off; set composes p, q, s (instancing)', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 4 });
  assert.equal(inst.mesh.isInstancedMesh, true); assert.equal(inst.count, 0); assert.equal(inst.mesh.count, 0);
  assert.deepEqual([inst.mesh.castShadow, inst.mesh.receiveShadow, inst.mesh.frustumCulled, inst.mesh.instanceColor], [true, true, false, null]);
  inst.count = 2; assert.equal(inst.mesh.count, 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
  inst.set(1, { x: 1, y: 2, z: 3 }, q, 2); inst.getMatrix(1, new THREE.Matrix4()).decompose(p, r, s);
  assert.ok(p.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-6); assert.ok(1 - Math.abs(r.dot(q)) < 1e-6); assert.ok(s.distanceTo(new THREE.Vector3(2, 2, 2)) < 1e-6);
  inst.set(0, { x: 0, y: 0, z: 0 }, q, { x: 1, y: 2, z: 3 }); inst.getMatrix(0, new THREE.Matrix4()).decompose(p, r, s);
  assert.ok(s.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-6);
  inst.setMatrix(1, new THREE.Matrix4().makeTranslation(7, 0, 0)); assert.ok(at(inst, 1).distanceTo(new THREE.Vector3(7, 0, 0)) < 1e-6);
});
test('3g: commit uploads only what changed; colours start white and take CSS strings (instancing)', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 4, colors: true }), m = inst.mesh;
  const v0 = m.instanceMatrix.version, c0 = m.instanceColor.version;
  inst.commit(); assert.equal(m.instanceMatrix.version, v0);
  inst.set(0, { x: 1, y: 0, z: 0 }, Q); inst.commit(); assert.equal(m.instanceMatrix.version, v0 + 1); assert.equal(m.instanceColor.version, c0);
  inst.commit(); assert.equal(m.instanceMatrix.version, v0 + 1);
  inst.color(2, '#ff0000'); inst.commit(); assert.equal(m.instanceColor.version, c0 + 1);
  assert.deepEqual([...m.instanceColor.array.slice(6, 9)], [1, 0, 0]); assert.deepEqual([...m.instanceColor.array.slice(0, 3)], [1, 1, 1]);
  inst.color(1, new THREE.Color(0, 1, 0)); assert.deepEqual([...m.instanceColor.array.slice(3, 6)], [0, 1, 0]);
});
test('3g: copy moves an instance\'s matrix and colour (swap-remove); count is range-checked; dispose keeps shared buffers', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 3, colors: true });
  inst.count = 3; inst.set(2, { x: 9, y: 0, z: 0 }, Q); inst.color(2, '#0000ff');
  inst.copy(2, 0); assert.ok(at(inst, 0).distanceTo(new THREE.Vector3(9, 0, 0)) < 1e-6); assert.deepEqual([...inst.mesh.instanceColor.array.slice(0, 3)], [0, 0, 1]);
  assert.throws(() => { inst.count = 4; }, /count 4 outside 0\.\.3/); assert.throws(() => { inst.count = -1; }, RangeError);
  let geoGone = false; geo.addEventListener('dispose', () => { geoGone = true; });
  const parent = new THREE.Group(); parent.add(inst.mesh); inst.dispose();
  assert.equal(inst.mesh.parent, null); assert.equal(geoGone, false);
  assert.throws(() => createInstances({ geometry: geo, material: mat, max: 0 }), /max must be/);
  assert.throws(() => createInstances({ material: mat, max: 2 }), /geometry required/);
});
test('3g: coverage adds a per-instance vec4 instanceCoverage on a geometry of its own that shares the source buffers (3f COVERAGE_INSTANCED)', () => {
  const src = new THREE.BoxGeometry(), inst = createInstances({ geometry: src, material: mat, max: 3, coverage: true }), g = inst.mesh.geometry;
  assert.notEqual(g, src); assert.equal(src.attributes.instanceCoverage, undefined); // the template never sees it
  assert.equal(g.attributes.position, src.attributes.position); assert.equal(g.index, src.index);
  assert.equal(inst.coverage, g.attributes.instanceCoverage); assert.equal(inst.coverage.itemSize, 4); assert.equal(inst.coverage.isInstancedBufferAttribute, true);
  const v = inst.coverage.version; inst.cover(1, 0.5, 0, 0.25, 1); inst.commit();
  assert.deepEqual([...inst.coverage.array.slice(4, 8)], [0.5, 0, 0.25, 1]); assert.equal(inst.coverage.version, v + 1);
  inst.copy(1, 0); assert.deepEqual([...inst.coverage.array.slice(0, 4)], [0.5, 0, 0.25, 1]);
  assert.throws(() => createInstances({ geometry: geo, material: mat, max: 1 }).cover(0, 1, 0, 0, 0), /cover\(\) needs coverage: true/);
});
