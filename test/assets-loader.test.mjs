// A-9: one shared GLTFLoader with the meshopt decoder; optional injected KTX2/Draco loaders; fetch errors name the URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sharedLoader, loadGlb, loadJson } from '../src/view/assets/loader.js';
import { makeGlb, fakeFetch } from './helpers/glb.mjs';

const tri = { name: 'body', material: 'steel', pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2] };

test('one GLTFLoader per page, with the meshopt decoder set (A-9)', () => {
  const a = sharedLoader(), b = sharedLoader();
  assert.equal(a, b);
  assert.ok(a.meshoptDecoder, 'meshopt decoder set');
});

test('a meshopt-compressed GLB decodes to the authored vertices; a loader without the decoder refuses it', async () => {
  const glb = await makeGlb({ parts: [tri], meshopt: true }), fetch = fakeFetch({ '/m.glb': glb });
  const { gltf, bytes } = await loadGlb('/m.glb', { fetch });
  const mesh = gltf.scene.getObjectByName('body');
  assert.deepEqual([...mesh.geometry.attributes.position.array], tri.pos);
  assert.deepEqual([...mesh.geometry.index.array], tri.idx);
  assert.equal(mesh.material.name, 'steel');
  assert.equal(bytes, glb.byteLength);
  await assert.rejects(loadGlb('/m.glb', { fetch, loader: new GLTFLoader() }), /setMeshoptDecoder/); // proves the fixture really is compressed
});

test('fetch failures name the status and the URL; JSON loads', async () => {
  await assert.rejects(loadGlb('/missing.glb', { fetch: fakeFetch({}) }), /HTTP 404 for \/missing\.glb/);
  assert.deepEqual(await loadJson('/a.json', { fetch: fakeFetch({ '/a.json': { x: 1 } }) }), { x: 1 });
});

test('KTX2 and Draco loaders are optional and injected; KTX2 detects support on the renderer', () => { // last: it changes the shared loader
  const renderer = {}, ktx2 = { detectSupport(r) { this.seen = r; return this; } }, draco = {};
  const l = sharedLoader({ ktx2, draco, renderer });
  assert.equal(l, sharedLoader());
  assert.equal(l.ktx2Loader, ktx2);
  assert.equal(l.dracoLoader, draco);
  assert.equal(ktx2.seen, renderer);
});
