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
  const io = await getIO(), doc = await io.readBinary(await build('crate')), buf = doc.getRoot().listBuffers()[0];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) // authored vertex colours (the crate has none)
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p.getAttribute('POSITION').getCount() * 3).fill(0.5)).setBuffer(buf));
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
test('palette: vertex: an untextured (factor-only) material becomes COLOR_0 from its factor, quantised like a texel; the factor goes white', async () => {
  const { Document } = await import('@gltf-transform/core');
  const doc = new Document(), buf = doc.createBuffer();
  const mat = doc.createMaterial('leaf').setBaseColorFactor([0.2, 0.6, 1, 0.5]);
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setMaterial(mat);
  doc.createMesh('m').addPrimitive(prim);
  paletteToVertex(doc, 'leafy');
  const C = prim.getAttribute('COLOR_0'), s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  assert.ok(C, 'COLOR_0 written'); assert.equal(C.getCount(), 3);
  const want = [0.2, 0.6, 1].map(v => Math.fround(s2l(Math.round(v * 255))));
  for (let i = 0; i < 3; i++) assert.deepEqual(Array.from(C.getElement(i, [])), want);
  assert.deepEqual(mat.getBaseColorFactor(), [1, 1, 1, 0.5], 'white, alpha kept');
});
