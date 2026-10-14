// Temp game dirs for the 3d bake, build and CLI tests. copyFixture() copies test/fixtures/models/game (optionally without its
// committed baked/) and stubs `three` in its node_modules, so a build proves dedupe resolves from the game root.
// gameWith({ id: bytes }, bake) writes a one-off game with the fixture registry and the given bake config.
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FIXTURE = fileURLToPath(new URL('../fixtures/models/game', import.meta.url));

// The committed materials.js imports the engine's registry relatively; in a temp dir that path breaks, so point it at the engine by file URL.
const ENGINE_MATERIALS = pathToFileURL(fileURLToPath(new URL('../../src/defs/materials.js', import.meta.url))).href;
export function copyMaterials(dir) {
  writeFileSync(join(dir, 'materials.js'), readFileSync(join(FIXTURE, 'materials.js'), 'utf8').replace('../../../../src/defs/materials.js', ENGINE_MATERIALS));
}

export function stubThree(dir) {
  mkdirSync(join(dir, 'node_modules/three'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/three/package.json'), '{"name":"three","type":"module","main":"index.js"}');
  writeFileSync(join(dir, 'node_modules/three/index.js'), 'export const REVISION = "game-copy";\n');
  // engine-probe: a symlinked engine-side package whose own `three` import must be redirected by dedupe (like a file: install of lion-hawk)
  symlinkSync(join(FIXTURE, '../engine-probe'), join(dir, 'node_modules/engine-probe'), 'dir');
}

export function copyFixture({ baked = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: src => baked || relative(FIXTURE, src).split(sep)[0] !== 'baked' });
  copyMaterials(dir);
  stubThree(dir);
  return dir;
}

export function gameWith(models, bake = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  mkdirSync(join(dir, 'assets/models'), { recursive: true });
  copyMaterials(dir);
  for (const [id, bytes] of Object.entries(models)) writeFileSync(join(dir, 'assets/models', `${id}.glb`), bytes);
  writeFileSync(join(dir, 'game.config.js'), `export default ${JSON.stringify({ id: 't', bake: { materials: './materials.js', ...bake } })};\n`);
  return dir;
}

// Rewrites a temp game's registry with one extra entry so its hash changes; returns the new hash.
export function changeRegistry(dir) {
  writeFileSync(join(dir, 'materials.js'), `import { defineMaterials } from ${JSON.stringify(ENGINE_MATERIALS)};\nexport default defineMaterials({ 'test-extra': { extends: 'wood' } });\n`);
  return execFileSync(process.execPath, ['--input-type=module', '-e', `import r from ${JSON.stringify(pathToFileURL(join(dir, 'materials.js')).href)}; process.stdout.write(r.hash)`], { encoding: 'utf8' });
}
