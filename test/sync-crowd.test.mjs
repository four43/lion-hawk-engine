import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowd } from '../src/view/instancing/crowd.js';
import { decodeAnimTable } from '../src/view/assets/animTable.js';
import { makeAnimJson } from './helpers/glb.mjs';
import { fakeAssets } from './helpers/fakeAssets.mjs';

// a table where part k of 'walk' sits at (k, 3, 0) and of 'idle' at (k, 0, 0), the same in both frames (t does not matter)
const T = (x, y) => new THREE.Matrix4().makeTranslation(x, y, 0);
const table = decodeAnimTable(makeAnimJson(['body', 'head'], {
  walk: { dur: 1, frames: [[T(0, 3), T(1, 3)], [T(0, 3), T(1, 3)]] },
  idle: { dur: 1, frames: [[T(0, 0), T(1, 0)], [T(0, 0), T(1, 0)]] },
}));
const setup = () => {
  const fa = fakeAssets({ pig: [{ name: 'body', material: 'mud' }, { name: 'head', material: 'pet' }] });
  const asset = { ...fa.assets.get('pig'), anim: table };
  return { ...fa, asset, crowd: createCrowd(asset, { max: 8, compiler: fa.compiler }) };
};
const pos = (inst, i) => { const m = new THREE.Matrix4(); inst.getMatrix(i, m); return new THREE.Vector3().setFromMatrixPosition(m); };

test('3g: createCrowd makes one instanced mesh per anim-table part; set poses each part as pose x sample (A-11)', () => {
  const c = setup().crowd;
  assert.deepEqual(c.group.children.map(m => [m.name, m.isInstancedMesh, m.material.userData.instanced]), [['pig:body', true, true], ['pig:head', true, true]]);
  c.count = 1; assert.deepEqual(c.parts.map(p => p.inst.count), [1, 1]);
  c.set(0, { p: { x: 1, y: 0, z: 0 }, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), s: 2 }, 'walk', 0.3);
  // head: (1, 3, 0) in the model, scaled to (2, 6, 0), turned 90 degrees about y to (0, 6, -2), moved by (1, 0, 0)
  assert.ok(pos(c.parts[1].inst, 0).distanceTo(new THREE.Vector3(1, 6, -2)) < 1e-5);
  assert.ok(pos(c.parts[0].inst, 0).distanceTo(new THREE.Vector3(1, 6, 0)) < 1e-5);
});
test('3g: blend = { clip, t, k } weighs this clip by k (3f blendAnimTable, Pig Pens lerpM); a Matrix4 pose is taken as is', () => {
  const c = setup().crowd; c.count = 2;
  c.set(0, new THREE.Matrix4(), 'walk', 0, { clip: 'idle', t: 0, k: 0.25 });
  assert.ok(pos(c.parts[1].inst, 0).distanceTo(new THREE.Vector3(1, 0.75, 0)) < 1e-6);
  c.set(1, new THREE.Matrix4().makeTranslation(0, 10, 0), 'idle', 0, { clip: 'walk', t: 0, k: 1 });
  assert.ok(pos(c.parts[0].inst, 1).distanceTo(new THREE.Vector3(0, 10, 0)) < 1e-6);
  const v = c.parts[0].inst.mesh.instanceMatrix.version; c.commit(); assert.equal(c.parts[0].inst.mesh.instanceMatrix.version, v + 1);
});
test('3g: cover writes instanceCoverage on the coverage parts only (Pig Pens per-pig mud, 3f COVERAGE_INSTANCED)', () => {
  const c = setup().crowd; c.cover(3, 0, 0, 0, 0.8);
  const [body, head] = c.parts;
  assert.equal(body.coverage, true); assert.equal(head.coverage, false); assert.equal(head.inst.mesh.geometry.attributes.instanceCoverage, undefined);
  assert.deepEqual([...body.inst.coverage.array.slice(12, 16)], [0, 0, 0, 0.8].map(Math.fround));
});
test('3g: crowd count is range-checked; dispose takes the group out; bad assets throw', () => {
  const s = setup(), c = s.crowd, parent = new THREE.Group(); parent.add(c.group);
  assert.throws(() => { c.count = 9; }, /crowd: count 9 outside 0\.\.8/);
  c.dispose(); assert.equal(c.group.parent, null);
  assert.throws(() => createCrowd({ scene: new THREE.Group() }, { max: 1, compiler: s.compiler }), /has no anim table/);
  assert.throws(() => createCrowd({ ...s.asset, anim: { ...table, parts: ['tail'] } }, { max: 1, compiler: s.compiler }), /part 'tail' of the anim table is not a mesh in 'pig'/);
  assert.throws(() => createCrowd(s.asset, { max: 0, compiler: s.compiler }), /max must be/);
});
test('3g: crowd parts that cast shadows get the instanced depth material (X-4), as view sync gives its instanced meshes', () => {
  const c = setup().crowd;
  for (const m of c.group.children) assert.equal(m.customDepthMaterial?.name, 'lh.instancedDepth', m.name);
});
test('3g: crowd dispose frees each coverage part\'s own wrapper geometry', () => {
  const c = setup().crowd, cov = c.parts.filter(p => p.coverage); let n = 0;
  assert.ok(cov.length > 0); for (const p of cov) p.inst.mesh.geometry.addEventListener('dispose', () => n++);
  c.dispose(); assert.equal(n, cov.length);
});
