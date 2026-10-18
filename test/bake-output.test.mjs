import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { getIO } from '../tools/bake/read.js';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { bake, ENGINE_VERSION } from '../tools/bake/index.js';
import { sha256 } from '../tools/bake/write.js';
import { copyFixture, gameWith, changeRegistry } from './helpers/bakeGame.mjs';
import { rapierMass, assertMassClose } from './helpers/rapierMass.mjs';
import { build, MODELS } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const quiet = () => {};
const read = (dir, f) => readFileSync(join(dir, 'baked', f));
const json = (dir, f) => JSON.parse(read(dir, f));
const load = bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

test('3d: bake writes phys.json, manifest.json, one GLB per model and anim tables only where asked', async () => {
  const dir = copyFixture({ baked: false }), r = await bake({ game: dir, log: quiet });
  assert.deepEqual(r, { ok: true, baked: ['cart', 'crate', 'palette', 'pet', 'ramp'], stale: [] });
  const phys = json(dir, 'phys.json'), man = json(dir, 'manifest.json');
  assert.deepEqual([phys.v, phys.engine, phys.materials], [1, ENGINE_VERSION, REGISTRY.hash]);
  assert.deepEqual(Object.keys(phys.models), ['cart', 'crate', 'palette', 'pet', 'ramp']);
  assert.deepEqual(readdirSync(join(dir, 'baked/models')).sort(), ['cart.glb', 'crate.glb', 'palette.glb', 'pet.anim.json', 'pet.glb', 'ramp.glb']);
  for (const [id, m] of Object.entries(man.models)) {
    const glb = read(dir, m.glb);
    assert.deepEqual(m, { glb: `models/${id}.glb`, anim: id === 'pet' ? 'models/pet.anim.json' : null, bytes: glb.length, sha256: sha256(glb), options: m.options });
    assert.match(m.options, /^[0-9a-f]{16}$/);
  }
  const crate = phys.models.crate;
  assert.deepEqual(crate.source, { file: 'assets/models/crate.glb', sha256: sha256(readFileSync(join(dir, 'assets/models/crate.glb'))) });
  assert.deepEqual(crate.mass, { mass: 600, com: [0, 0.5, 0], inertia: [100, 100, 100], frame: [0, 0, 0, 1] });
  assert.deepEqual(crate.bounds, { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] });
  assert.deepEqual(phys.models.pet.sockets, { hat: { p: [0, 0.9, 0.4], q: [0, 0, 0, 1], part: 'body' } });
  assert.deepEqual(phys.models.palette.colliders.map(c => c.material), ['plastic']);           // per-model rename beats the global one
});
test('3d: every sidecar mass matches Rapier built from its own colliders (1%)', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  for (const [id, s] of Object.entries(json(dir, 'phys.json').models)) assertMassClose(s.mass, rapierMass(s.colliders, m => REGISTRY.density(m)), id);
});
test('3d: the baked GLB loads in three 0.186 with MeshoptDecoder: col-* gone, sock-* and parts present, registry names', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const phys = json(dir, 'phys.json');
  for (const id of Object.keys(phys.models)) {
    const g = await load(read(dir, `models/${id}.glb`)), names = [], mats = new Set();
    g.scene.traverse(o => { names.push(o.name); if (o.isMesh) mats.add(o.material.name); });
    assert.ok(!names.some(n => n.startsWith('col-')), `${id}: collider nodes removed`);
    for (const p of phys.models[id].parts) assert.ok(g.scene.getObjectByName(p), `${id}: part ${p}`);
    for (const s of Object.keys(phys.models[id].sockets)) assert.ok(g.scene.getObjectByName(`sock-${s}`), `${id}: sock-${s}`);
    for (const m of mats) assert.ok(REGISTRY.has(m) || m.startsWith('paint-'), `${id}: material ${m}`);
  }
});
test('3d: a re-bake of unchanged sources is byte-identical', async () => {
  const a = copyFixture({ baked: false }), b = copyFixture({ baked: false });
  await bake({ game: a, log: quiet }); await bake({ game: b, log: quiet });
  for (const f of ['phys.json', 'manifest.json', ...readdirSync(join(a, 'baked/models')).map(f => `models/${f}`)])
    assert.ok(read(a, f).equals(read(b, f)), `${f} differs`);
});
test('3d: bake ids… re-bakes only those and keeps the rest; a registry change re-bakes everything; removed sources go', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const before = json(dir, 'phys.json');
  writeFileSync(join(dir, 'assets/models/crate.glb'), await build('ramp'));
  assert.deepEqual((await bake({ game: dir, ids: ['crate'], log: quiet })).baked, ['crate']);
  const after = json(dir, 'phys.json');
  assert.notDeepEqual(after.models.crate, before.models.crate);
  for (const id of ['cart', 'palette', 'pet', 'ramp']) assert.deepEqual(after.models[id], before.models[id]);
  assert.equal(Object.keys(json(dir, 'manifest.json').models).length, 5);
  const newHash = changeRegistry(dir); assert.notEqual(newHash, REGISTRY.hash);
  const logs = [], r = await bake({ game: dir, ids: ['crate'], log: m => logs.push(m) });
  assert.equal(r.baked.length, 5); assert.ok(logs.some(l => /every model is baked/.test(l)));
  assert.equal(json(dir, 'phys.json').materials, newHash);
  rmSync(join(dir, 'assets/models/pet.glb')); writeFileSync(join(dir, 'game.config.js'), readFileSync(join(dir, 'game.config.js'), 'utf8').replace(/\n\s*pet: \{[^\n]*\n/, '\n'));
  await bake({ game: dir, log: quiet });
  assert.ok(!existsSync(join(dir, 'baked/models/pet.glb')) && !existsSync(join(dir, 'baked/models/pet.anim.json')));
  assert.equal(json(dir, 'phys.json').models.pet, undefined);
});
test('3d: models.<id>.file maps an id onto a differently named source; colliders: false gives none', async () => {
  const dir = gameWith({ 'nature-kit_fence-simple': await build('crate') }, { models: { fence: { file: 'nature-kit_fence-simple.glb', colliders: false } } });
  assert.deepEqual((await bake({ game: dir, log: quiet })).baked, ['fence']);
  const s = json(dir, 'phys.json').models.fence;
  assert.deepEqual(s.colliders, []); assert.equal(s.mass.mass, 0); assert.equal(s.source.file, 'assets/models/nature-kit_fence-simple.glb');
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }, { models: { b: {} } }), log: quiet }), /bake: b: configured in bake\.models but no source/);
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }), ids: ['zz'], log: quiet }), /bake: zz: no such model/);
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }, { paint: { base: 'adamantium' } }), log: quiet }), /config: bake\.paint\.base 'adamantium' is not in the registry/);
});
test('3d: kits with the same Textures/colormap.png resolve per source file and never collide (3k: models.<id>.file)', async () => {
  const dir = gameWith({}, { palette: 'vertex', rename: { materials: { colormap: 'plastic' } },
    models: { a: { file: 'kit-a/palette.gltf' }, b: { file: 'kit-b/palette.gltf' }, c: { file: 'kit-b/copy.gltf', keepTextures: true } } });
  for (const [kit, rgb, files] of [['kit-a', [255, 0, 0], ['palette']], ['kit-b', [0, 255, 0], ['palette', 'copy']]]) {
    mkdirSync(join(dir, 'assets/models', kit), { recursive: true });
    for (const f of files) {
      const m = MODELS.palette(), png = new PNG({ width: 2, height: 1 }); png.data.set([...rgb, 255, ...rgb, 255]);
      m.doc.getRoot().listTextures()[0].setImage(PNG.sync.write(png)).setURI('Textures/colormap.png');
      await new NodeIO().write(join(dir, 'assets/models', kit, `${f}.gltf`), m.doc);
    }
  }
  assert.deepEqual((await bake({ game: dir, log: quiet })).baked, ['a', 'b', 'c']);
  const io = await getIO(), colour = async id => (await io.read(join(dir, 'baked/models', `${id}.glb`))).getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0').getElement(0, []);
  assert.deepEqual(await colour('a'), [1, 0, 0]); assert.deepEqual(await colour('b'), [0, 1, 0]);
  const c = await io.read(join(dir, 'baked/models/c.glb')), tex = c.getRoot().listTextures();   // keepTextures: embedded in its own GLB
  assert.equal(tex.length, 1); assert.equal(PNG.sync.read(Buffer.from(tex[0].getImage())).data[1], 255);
  assert.deepEqual(readdirSync(join(dir, 'baked/models')).sort(), ['a.glb', 'b.glb', 'c.glb']);
});

test('3d: a partial bake after a source change, and a full bake of a fresh copy with the same sources, are byte-identical', async () => {
  const a = copyFixture(), b = copyFixture({ baked: false });
  writeFileSync(join(a, 'assets/models/crate.glb'), await build('cart'));
  writeFileSync(join(b, 'assets/models/crate.glb'), await build('cart'));
  await bake({ game: a, ids: ['crate'], log: quiet });
  await bake({ game: b, log: quiet });
  for (const f of ['phys.json', 'manifest.json']) assert.ok(read(a, f).equals(read(b, f)), `${f} differs between partial and full bake`);   // sorted() keys on partial bakes
});
