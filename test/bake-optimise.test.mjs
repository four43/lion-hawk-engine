import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { getIO, MeshoptEncoder } from '../tools/bake/read.js';
import { optimise } from '../tools/bake/optimise.js';
import { MODELS } from './fixtures/models/make.mjs';

const ALL = { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true };
const load = async bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
async function before(name) { return load(await MODELS[name]().bytes()); }
async function after(name, o = ALL) {
  const io = await getIO(), doc = await io.readBinary(await MODELS[name]().bytes());
  await optimise(doc, o, { encoder: MeshoptEncoder });
  return { bytes: await io.writeBinary(doc), gltf: await load(await io.writeBinary(doc)) };
}
const nodes = root => { const out = []; root.traverse(o => { if (o.name && !/_\d+$/.test(o.name)) out.push(o); }); return out; };

test('3d: optimisation keeps every named node, its parent and its world matrix (no quantize transforms, sockets kept)', async () => {
  for (const name of ['cart', 'pet']) {
    const a = await before(name), { gltf: b, bytes } = await after(name);
    assert.ok(JSON.parse(Buffer.from(bytes.slice(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))).toString()).extensionsRequired.includes('EXT_meshopt_compression'));
    a.scene.updateMatrixWorld(true); b.scene.updateMatrixWorld(true);
    const want = nodes(a.scene);
    assert.ok(want.some(o => o.name.startsWith('sock-') || o.name === 'hat'), `${name} has an empty socket node`);
    for (const o of want) {
      const p = b.scene.getObjectByName(o.name);
      assert.ok(p, `${name}: node ${o.name} survives`);
      assert.equal(p.parent?.name, o.parent?.name, `${name}: ${o.name} keeps its parent`);
      p.matrixWorld.elements.forEach((v, i) => assert.ok(Math.abs(v - o.matrixWorld.elements[i]) < 1e-6, `${name}: ${o.name} matrix[${i}]`));
    }
  }
});
test('3d: materials that look identical keep their registry names (dedup keeps unique names)', async () => {
  const { gltf } = await after('cart');
  const names = new Set(); gltf.scene.traverse(o => { if (o.isMesh) names.add(o.material.name); });
  for (const n of ['paint-body', 'plastic', 'rubber', 'steel']) assert.ok(names.has(n), `material ${n} kept (${[...names]})`);
});
test('3d: positions stay float and vertex counts unchanged on welded fixtures; animations survive', async () => {
  const a = await before('pet'), { gltf: b } = await after('pet');
  const count = g => { let n = 0; g.scene.traverse(o => { if (o.isMesh) { n += o.geometry.attributes.position.count; assert.ok(o.geometry.attributes.position.array instanceof Float32Array); } }); return n; };
  assert.equal(count(b), count(a));
  assert.deepEqual(b.animations.map(c => c.name), ['walk', 'idle']);
});
test('3d: every step can be turned off', async () => {
  const off = { meshopt: false, quantize: false, weld: false, prune: false, dedupe: false };
  const { bytes } = await after('crate', off), json = JSON.parse(Buffer.from(bytes.slice(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))).toString());
  assert.equal(json.extensionsUsed, undefined);
});
