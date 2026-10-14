// furGeometry: Pig Pens' shell geometry, made generic (any attributes, indexed or not, a 0..1 mask).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three';
import { furGeometry } from '../src/view/materials/fur.js';

test('shells repeat every attribute and the index; furShell steps 0, 1/shells … 1; two groups', () => {
  const box = new BoxGeometry(1, 1, 1), n = box.attributes.position.count, ni = box.index.count;
  box.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  const g = furGeometry(box, () => 1, { shells: 4 });
  for (const k of ['position', 'normal', 'uv', 'color']) assert.equal(g.attributes[k].count, n * 5, k);
  assert.equal(g.index.count, ni * 5);
  assert.deepEqual(g.groups, [{ start: 0, count: ni, materialIndex: 0 }, { start: ni, count: ni * 4, materialIndex: 1 }]);
  assert.deepEqual([0, 1, 2, 3, 4].map(c => g.attributes.furShell.getX(c * n)), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(g.index.getX(ni * 2), box.index.getX(0) + 2 * n, 'shell c indexes its own copy');
  assert.deepEqual([...g.attributes.position.array.slice(n * 3 * 3, n * 3 * 3 + 3)], [...box.attributes.position.array.slice(0, 3)]);
  assert.deepEqual(g.userData.fur, { shells: 4 });
  assert.equal(furGeometry(box, () => 1).attributes.furShell.count, n * 11, 'default 10 shells');
});

test('furNormal averages the normals of vertices that share a position; furMask is the clamped mask', () => {
  const box = new BoxGeometry(1, 1, 1), g = furGeometry(box, i => (box.attributes.position.getY(i) > 0 ? 3 : -1), { shells: 1 });
  const s = 1 / Math.sqrt(3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.abs(g.attributes.furNormal.array[i]) - s) < 1e-6, 'a cube corner points out diagonally');
  for (let i = 0; i < box.attributes.position.count; i++) assert.equal(g.attributes.furMask.getX(i), box.attributes.position.getY(i) > 0 ? 1 : 0);
});

test('non-indexed geometry works; bad input throws', () => {
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  tri.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  assert.deepEqual([...furGeometry(tri, () => 1, { shells: 2 }).index.array], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => furGeometry(tri, () => 1, { shells: 0 }), /shells must be an integer 1\.\.32 \(got 0\)/);
  assert.throws(() => furGeometry(tri, 1), /mask\(i\) must be a function/);
  const bare = new BufferGeometry(); bare.setAttribute('position', tri.attributes.position);
  assert.throws(() => furGeometry(bare, () => 1), /needs position and normal attributes/);
});
