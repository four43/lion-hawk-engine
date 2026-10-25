// [A-3] bake.textures: the textures a bake keeps are compressed to WebP (sharp) or KTX2 (toktx from KTX-Software). The
// setting is part of the bake options hash only when set, so existing bakes stay current.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake } from '../tools/bake/index.js';
import { getIO } from '../tools/bake/read.js';
import { loadConfig } from '../tools/bake/config.js';
import { build } from './fixtures/models/make.mjs';
import { gameWith, copyFixture } from './helpers/bakeGame.mjs';

const quiet = () => {};
const textured = async textures => gameWith({ palette: await build('palette') }, { rename: { materials: { colormap: 'plastic' } }, models: { palette: { keepTextures: true } }, ...(textures ? { textures } : {}) });
const texturesOf = async dir => (await (await getIO()).read(join(dir, 'baked/models/palette.glb'))).getRoot();

test('A-3: textures: { format: "webp" } compresses kept textures to WebP with EXT_texture_webp', async () => {
  const dir = await textured({ format: 'webp', quality: 80 });
  assert.equal((await bake({ game: dir, log: quiet })).ok, true);
  const root = await texturesOf(dir);
  assert.deepEqual(root.listTextures().map(t => t.getMimeType()), ['image/webp']);
  assert.ok(root.listExtensionsUsed().some(e => e.extensionName === 'EXT_texture_webp'));
  const plain = await textured(); await bake({ game: plain, log: quiet });
  assert.deepEqual((await texturesOf(plain)).listTextures().map(t => t.getMimeType()), ['image/png'], 'without textures: unchanged');
});
test('A-3: the textures setting is in the options hash only when set; changing it makes bake --check stale', async () => {
  const dir = await textured({ format: 'webp', quality: 80 }); await bake({ game: dir, log: quiet });
  assert.equal((await bake({ game: dir, check: true, log: quiet })).ok, true);
  const cfg = join(dir, 'game.config.js'); writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('"quality":80', '"quality":60'));
  assert.deepEqual((await bake({ game: dir, check: true, log: quiet })).stale, [{ id: 'palette', why: 'bake options changed' }]);
  const fixture = copyFixture(); // its committed bake has no textures key: no model reads as 'bake options changed'
  assert.deepEqual((await bake({ game: fixture, check: true, log: quiet })).stale.filter(x => x.why === 'bake options changed'), []);
});
test('A-3: textures config is checked; ktx2 without toktx on PATH says what to install', async () => {
  await assert.rejects(loadConfig(await textured({ format: 'avif' })), /config: 'bake\.textures\.format' must be 'webp' or 'ktx2'/);
  await assert.rejects(loadConfig(await textured({ format: 'webp', quality: 0 })), /config: 'bake\.textures\.quality' must be an integer in 1\.\.100/);
  await assert.rejects(loadConfig(await textured({ format: 'webp', mode: 'uastc' })), /config: 'bake\.textures\.mode' is for ktx2 only/);
  const dir = await textured({ format: 'ktx2' }), path = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try { await assert.rejects(bake({ game: dir, log: quiet }), /bake: textures\.format 'ktx2' needs toktx \(KTX-Software\) on PATH/); }
  finally { process.env.PATH = path; }
});
test('A-3: ktx2 with toktx writes KHR_texture_basisu textures', { skip: spawnSync('toktx', ['--version']).error ? 'toktx (KTX-Software) is not installed' : false }, async () => {
  const dir = await textured({ format: 'ktx2', mode: 'etc1s' });
  await bake({ game: dir, log: quiet });
  const root = await texturesOf(dir);
  assert.deepEqual(root.listTextures().map(t => t.getMimeType()), ['image/ktx2']);
  assert.ok(root.listExtensionsUsed().some(e => e.extensionName === 'KHR_texture_basisu'));
});
