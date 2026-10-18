import { tmp } from './helpers/tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { build } from 'esbuild';
import { dedupe } from 'lion-hawk/build';

test('2d: dedupe resolves three from the game root, so engine and game share one copy (#11)', async () => {
  const dir = tmp('lh-dedupe-');
  const w = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  for (const who of ['game', 'engine']) {
    w(`${who}/node_modules/three/package.json`, '{"name":"three","main":"index.js"}');
    w(`${who}/node_modules/three/index.js`, `export const who = "${who}-copy";`);
  }
  w('engine/src/view.js', 'export { who as engineSees } from "three";');
  w('game/src/main.js', 'import { who } from "three"; import { engineSees } from "../../engine/src/view.js"; console.log(who, engineSees);');
  const opts = { entryPoints: [join(dir, 'game/src/main.js')], bundle: true, write: false, format: 'esm', logLevel: 'silent' };
  assert.match((await build(opts)).outputFiles[0].text, /engine-copy/);
  const out = (await build({ ...opts, plugins: [dedupe({ root: join(dir, 'game') })] })).outputFiles[0].text;
  assert.doesNotMatch(out, /engine-copy/); assert.match(out, /game-copy/);
  assert.throws(() => dedupe({}), /dedupe: root required/);
});
