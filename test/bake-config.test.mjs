import { tmp } from './helpers/tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../tools/bake/config.js';

const game = (config, pkg) => {
  const dir = tmp('lh-cfg-');
  writeFileSync(join(dir, 'game.config.js'), `export default ${JSON.stringify(config)};\n`);
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
};

test('3d: loadConfig fills the engine defaults and reads the game version', async () => {
  const dir = game({ id: 'g', bake: { materials: './m.js', models: { pig: { animTable: true, sockets: ['hat'] } } } }, { version: '2.3.4' });
  const c = await loadConfig(dir);
  assert.equal(c.dir, dir); assert.equal(c.version, '2.3.4'); assert.equal(c.site, 'g'); assert.equal(c.outEnv, null);
  assert.deepEqual(c.bake.optimise, { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true });
  assert.deepEqual(c.bake.paint, { base: 'steel' });
  assert.equal(c.bake.src, 'assets/models'); assert.equal(c.bake.out, 'baked'); assert.equal(c.bake.palette, null);
  assert.deepEqual(c.bake.models.pig, { static: false, keepTextures: false, sockets: ['hat'], file: null, colliders: true,
    animTable: { fps: 30, clips: null }, rename: { materials: {}, nodes: {} } });
  assert.deepEqual(c.build, { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: null });
});
test('3d: a misspelt key fails loudly with its path', async () => {
  await assert.rejects(loadConfig(game({ id: 'g', bake: { optimize: { meshopt: false } } })), /config: unknown key 'bake\.optimize'/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { models: { pig: { socket: ['hat'] } } } })), /config: unknown key 'bake\.models\.pig\.socket'/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { models: { pig: { animTable: { fps: 30, clip: [] } } } } })), /unknown key 'bake\.models\.pig\.animTable\.clip'/);
  await assert.rejects(loadConfig(game({ id: 'g', buld: {} })), /unknown key 'buld'/);
});
test('3d: bad values and a missing config are reported', async () => {
  await assert.rejects(loadConfig(game({ bake: {} })), /config: 'id' must be a non-empty string/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { palette: 'texture' } })), /'bake\.palette' must be 'vertex' or absent/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { rename: 'x' } })), /'bake\.rename' must be an object/);
  await assert.rejects(loadConfig(tmp('lh-cfg-')), /config: no game\.config\.js in /);
});
test('3d: animTable false and a partial optimise block are accepted', async () => {
  const c = await loadConfig(game({ id: 'g', bake: { optimise: { meshopt: false }, models: { a: { animTable: false, colliders: false } } } }));
  assert.equal(c.bake.models.a.animTable, null); assert.equal(c.bake.models.a.colliders, false);
  assert.equal(c.bake.optimise.meshopt, false); assert.equal(c.bake.optimise.weld, true);
});
