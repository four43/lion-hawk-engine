import test from 'node:test';
import assert from 'node:assert/strict';
import { getIO, applyRenames, paletteToVertex } from '../tools/bake/read.js';
import { build } from './fixtures/models/make.mjs';

test('3d: palette textures become linear vertex colours; UVs, tangents and the texture go', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('palette'));
  paletteToVertex(doc, 'palette');
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0], P = prim.getAttribute('POSITION'), C = prim.getAttribute('COLOR_0');
  assert.ok(C); assert.equal(prim.getAttribute('TEXCOORD_0'), null); assert.equal(prim.getAttribute('TANGENT'), null);
  assert.equal(doc.getRoot().listTextures().length, 0);
  assert.equal(prim.getMaterial().getBaseColorTexture(), null);
  const p = [], c = [];
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); C.getElement(i, c);
    assert.deepEqual(Array.from(c), p[0] < 0 ? [1, 0, 0] : [0, 0, 1], `vertex ${i} at x=${p[0]}`);   // left texel red, right blue
  }
});
test('3d: primitives that already have COLOR_0 are left alone', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('crate'));
  const before = await io.writeBinary(doc);
  paletteToVertex(doc, 'crate');
  assert.ok(Buffer.from(await io.writeBinary(doc)).equals(Buffer.from(before)));
});
test('3d: renames apply to materials and nodes by exact name', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('pet'));
  applyRenames(doc, { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat', body: 'torso' } });
  assert.deepEqual(doc.getRoot().listMaterials().map(m => m.getName()), ['flesh']);
  const names = doc.getRoot().listNodes().map(n => n.getName());
  assert.ok(names.includes('sock-hat') && names.includes('torso') && !names.includes('hat') && names.includes('leg-left'));
});
