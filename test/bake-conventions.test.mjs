import test from 'node:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assert from 'node:assert/strict';
import { getIO } from '../tools/bake/read.js';
import { classify, sanitize } from '../tools/bake/conventions.js';
import { model, boxGeom } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const box = (m, name, mat, extra = {}) => m.node(name, { ...extra, mesh: m.mesh(name, [[boxGeom([1, 1, 1]), mat]]) });
const run = async (m, opts = {}) => classify(await (await getIO()).readBinary(await m.bytes()), 'm', { registry: REGISTRY, ...opts });

test('3d: A-2 failures name the model and the node or material', async () => {
  const cases = [
    [m => box(m, 'body', 'planks'), /^Error: bake: m: material 'planks' is not in the registry or paint-\* \(on body\)$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-cone', 'x', { parent: 'body' }); }, /^Error: bake: m: col-cone unsupported collider shape 'cone'$/],
    [m => box(m, 'body', null), /^Error: bake: m: body has no material$/],
    [m => { box(m, 'body', 'wood'); box(m, 'sock-x', 'wood', { parent: 'body' }); }, /^Error: bake: m: sock-x is a socket with a mesh/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x'); }, /^Error: bake: m: col-box has no parent part/],
    [m => { box(m, 'body', 'wood'); m.node('col-box', { parent: 'body' }); }, /^Error: bake: m: col-box has no mesh$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { parent: 'body', extras: { material: 'unobtainium' } }); }, /^Error: bake: m: col-box extras\.material 'unobtainium' is not in the registry/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { extras: { part: 'nope' } }); }, /^Error: bake: m: col-box extras\.part 'nope' is not a part$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { parent: 'body' }); box(m, 'inner', 'wood', { parent: 'col-box' }); }, /^Error: bake: m: col-box has children/],
    [m => { box(m, 'body', 'wood'); m.node('sock-a', { parent: 'body' }); m.node('sock-a'); }, /^Error: bake: m: sock-a duplicate socket$/],
  ];
  for (const [make, re] of cases) { const m = model(); make(m); await assert.rejects(run(m), re); }
  const m = model(); box(m, 'body', 'wood');
  await assert.rejects(run(m, { sockets: ['hat'] }), /^Error: bake: m: sock-hat missing \(required socket\)$/);
});
test('3d: registry ids and paint-* pass; col-* proxy materials are not checked', async () => {
  const m = model(); box(m, 'body', 'paint-body'); box(m, 'trim', 'steel', { parent: 'body' }); box(m, 'col-box', 'proxy', { parent: 'body' });
  const c = await run(m);
  assert.deepEqual(c.parts.map(p => p.name), ['body', 'trim']);
  assert.deepEqual(c.cols.map(x => [x.name, x.shape, x.part.name, x.material]), [['col-box', 'box', 'body', null]]);
});
test('3d: parts nest, sockets record their part (or null), names are sanitised as GLTFLoader does and repeats get -2, -3', async () => {
  const c = await run((await import('./fixtures/models/make.mjs')).MODELS.cart());
  assert.deepEqual(c.parts.map(p => p.name), ['body', 'wheel', 'mast', 'lamp001', 'lamp001-2']);
  assert.deepEqual(c.socks.map(s => [s.name, s.part]), [['hitch', 'body'], ['seat', null]]);
  assert.deepEqual(c.cols.map(x => [x.name, x.shape, x.part.name, x.material]), [
    ['col-box', 'box', 'body', null], ['col-box.001', 'box', 'body', 'rubber'], ['col-hull', 'hull', 'body', null],
    ['col-cylinder', 'cylinder', 'wheel', null], ['col-capsule', 'capsule', 'mast', null], ['col-sphere', 'sphere', 'body', null]]);
  assert.equal(c.parts[3].node.getName(), 'lamp001');    // the GLB node is renamed too, so runtime names match the sidecar
  assert.equal(sanitize('a b.c[1]:d/e'), 'a_bc1de');
});
test('3d: part names are unique across every scene node, as GLTFLoader names them', async () => {
  const m = model(); m.node('Group'); box(m, 'Group', 'wood');
  const io = await getIO(), doc = await io.readBinary(await m.bytes());
  const c = classify(doc, 'm', { registry: REGISTRY });
  assert.deepEqual(c.parts.map(p => p.name), ['Group-2']);
  const bytes = await io.writeBinary(doc);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(gltf.scene.getObjectByName('Group-2').isMesh, true);
  assert.equal(gltf.scene.getObjectByName('Group').isMesh, undefined);
});
test('3d: a mesh name that is empty after sanitising is an error', async () => {
  const m = model(); box(m, '..', 'wood');
  await assert.rejects(run(m), /^Error: bake: m: '\.\.' has an empty name after sanitising$/);
});
