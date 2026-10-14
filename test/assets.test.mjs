// engine.assets (A-9, A-10, A-11): manifest keys, one fetch per URL, progress, warm ordering, templates, clones, dispose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Matrix4 } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { createAssets } from '../src/view/assets/index.js';
import { sampleAnimTable } from '../src/view/assets/animTable.js';
import { makeGlb, makeAnimJson, fakeFetch } from './helpers/glb.mjs';

const REG = defineMaterials({ testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1 } } });
const body = { name: 'body', material: 'testMud', pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
const trim = { name: 'trim', material: 'paint-trim', pos: [0, 0, 1, 1, 0, 1, 0, 1, 1], idx: [0, 1, 2] };
const anim = makeAnimJson(['body', 'trim'], { walk: { dur: 1, frames: [[new Matrix4(), new Matrix4().makeTranslation(0, 0, 4)]] } });

async function setup({ gfx = null, skin = false, extra = {} } = {}) {
  const pig = await makeGlb({ parts: [body, trim], empties: [{ name: 'sock-hat', t: [0, 1.5, 0.25] }], anims: [{ name: 'bob', node: 'body', times: [0, 1], values: [0, 0, 0, 0, 1, 0] }], meshopt: true, skin });
  const cone = await makeGlb({ parts: [{ ...body, name: 'cone' }] });
  const manifest = { v: 1, models: {
    pig: { glb: 'models/pig.glb', anim: 'models/pig.anim.json', bytes: pig.byteLength, sha256: 'x' },
    cone: { glb: 'models/cone.glb', anim: null, bytes: cone.byteLength, sha256: 'y' },
    lost: { glb: 'models/lost.glb', anim: null, bytes: 9, sha256: 'z' },
  } };
  const fetch = fakeFetch({ './assets/models/pig.glb': pig, './assets/models/pig.anim.json': anim, './assets/models/cone.glb': cone, ...extra });
  const mc = createMaterialCompiler(REG);
  return { mc, fetch, manifest, assets: createAssets({ manifest, compiler: mc, fetch, gfx }) };
}

test('the manifest must be baked/manifest.json v1', () => {
  assert.throws(() => createAssets({ manifest: { v: 2, models: {} } }), /manifest must be baked\/manifest\.json with v: 1 \(got v2\)/);
  assert.throws(() => createAssets({}), /manifest must be/);
});

test('preload fetches each URL once, even under overlapping preloads; progress counts keys and bytes', async () => {
  const { assets, fetch, manifest } = await setup();
  assert.deepEqual(assets.progress, { loaded: 0, total: 0, bytes: 0 });
  await Promise.all([assets.preload(['pig', 'cone']), assets.preload(['pig']), assets.preload(['cone', 'cone'])]);
  assert.deepEqual(fetch.calls.toSorted(), ['./assets/models/cone.glb', './assets/models/pig.anim.json', './assets/models/pig.glb']);
  assert.deepEqual(assets.progress, { loaded: 2, total: 2, bytes: manifest.models.pig.bytes + manifest.models.cone.bytes });
  await assets.preload(['pig']);
  assert.equal(fetch.calls.length, 3, 'a later preload is served from the cache');
  assert.equal(assets.has('pig'), true); assert.equal(assets.has('lost'), false);
});

test('preload resolves only after gfx.warm() resolves (A-10, M-12)', async () => {
  let release, warmed = 0;
  const { assets } = await setup({ gfx: { warm: () => { warmed++; return new Promise(r => { release = r; }); } } });
  let done = false;
  const p = assets.preload(['cone']).then(() => { done = true; });
  for (let i = 0; i < 20 && !release; i++) await new Promise(r => setImmediate(r));
  assert.equal(warmed, 1); assert.equal(assets.has('cone'), true); assert.equal(done, false);
  release(); await p;
  assert.equal(done, true);
});

test('unknown keys, failed loads and get() before preload say what to do; a failed key can be retried', async () => {
  const { assets, manifest } = await setup();
  await assert.rejects(assets.preload(['nope']), /unknown asset 'nope' \(the manifest has pig, cone, lost\)/);
  await assert.rejects(assets.preload(['lost']), /assets: failed to load 'lost' \(\.\/assets\/models\/lost\.glb\): HTTP 404/);
  assert.deepEqual(assets.progress, { loaded: 0, total: 0, bytes: 0 }, 'a failure leaves progress as it was');
  assert.throws(() => assets.get('cone'), /'cone' is not loaded; await assets\.preload\(\['cone'\]\) first/);
  assert.throws(() => assets.get('nope'), /unknown asset 'nope'/);
  const cone = await makeGlb({ parts: [{ ...body, name: 'lost' }] });
  const retry = createAssets({ manifest, fetch: fakeFetch({}), compiler: null });
  await assert.rejects(retry.preload(['lost']));
  const files = { './assets/models/lost.glb': cone }, fetch = fakeFetch(files);
  const again = createAssets({ manifest, fetch });
  delete files['./assets/models/lost.glb'];
  await assert.rejects(again.preload(['lost']));
  files['./assets/models/lost.glb'] = cone;
  await again.preload(['lost']);
  assert.equal(fetch.calls.length, 2, 'the failed URL was not cached');
  assert.deepEqual(again.progress, { loaded: 1, total: 1, bytes: 9 });
});

test('a template: compiled materials, sockets from sock-* empties, glTF clips, the decoded anim table', async () => {
  const { assets, mc } = await setup();
  await assets.preload(['pig', 'cone']);
  const t = assets.get('pig');
  assert.ok(Object.isFrozen(t));
  const b = t.scene.getObjectByName('body'), tr = t.scene.getObjectByName('trim');
  assert.equal(b.material, mc.get('testMud', { vertexColors: true }));
  assert.equal(tr.material, mc.get('steel'));
  assert.equal(b.castShadow, true); assert.equal(b.receiveShadow, true);
  assert.equal(b.geometry.userData.lhShared, true, 'clones share it: disposeTree must skip it');
  assert.deepEqual(t.sockets, { hat: { name: 'sock-hat', p: [0, 1.5, 0.25], q: [0, 0, 0, 1] } });
  assert.deepEqual(t.clips.map(c => c.name), ['bob']);
  assert.deepEqual([...t.anim.parts], ['body', 'trim']);
  assert.equal(sampleAnimTable(t.anim, 'walk', 0, 1, new Matrix4()).elements[14], 4);
  assert.equal(assets.get('cone').anim, null);
});

test('clone shares geometry and materials; paint and instanced recompile only the clone', async () => {
  const { assets, mc } = await setup();
  await assets.preload(['pig']);
  const t = assets.get('pig').scene, c = assets.clone('pig');
  assert.notEqual(c, t);
  assert.equal(c.getObjectByName('body').geometry, t.getObjectByName('body').geometry);
  assert.equal(c.getObjectByName('body').material, t.getObjectByName('body').material);
  const red = assets.clone('pig', { paint: { trim: '#ff0000' } });
  assert.equal(red.getObjectByName('trim').material, mc.paint('steel', '#ff0000', { receiveShadow: true }));
  assert.equal(t.getObjectByName('trim').material, mc.get('steel'), 'the template keeps the base');
  const inst = assets.clone('pig', { instanced: true });
  assert.equal(inst.getObjectByName('body').material.userData.lh.instanced, true);
});

test('skinned models clone with SkeletonUtils: each clone has its own skeleton and animates alone (A-11)', async () => {
  const { assets } = await setup({ skin: true });
  await assets.preload(['pig']);
  const t = assets.get('pig'), a = assets.clone('pig'), b = assets.clone('pig');
  const sa = a.getObjectByName('body'), sb = b.getObjectByName('body');
  assert.ok(sa.isSkinnedMesh);
  assert.notEqual(sa.skeleton, sb.skeleton); assert.notEqual(sa.skeleton, t.scene.getObjectByName('body').skeleton);
  assert.equal(sa.skeleton.bones[0], a.getObjectByName('bone'), 'bones are the clone\'s own nodes');
  const mixer = new AnimationMixer(a);
  mixer.clipAction(t.clips[0]).play(); mixer.update(0.5);
  assert.ok(Math.abs(sa.position.y - 0.5) < 1e-6);
  assert.equal(sb.position.y, 0); assert.equal(t.scene.getObjectByName('body').position.y, 0);
});

test('dispose frees template geometry; afterwards nothing is loaded and preload refuses', async () => {
  const { assets } = await setup();
  await assets.preload(['cone']);
  let freed = 0;
  assets.get('cone').scene.getObjectByName('cone').geometry.addEventListener('dispose', () => freed++);
  assets.dispose(); assets.dispose();
  assert.equal(freed, 1);
  assert.equal(assets.has('cone'), false);
  await assert.rejects(assets.preload(['cone']), /assets: preload after dispose/);
});
