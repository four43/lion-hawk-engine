// Temp game dirs for the 3d bake, build and CLI tests. copyFixture() copies test/fixtures/models/game (optionally without its
// committed baked/) and stubs `three` in its node_modules, so a build proves dedupe resolves from the game root.
// gameWith({ id: bytes }, bake) writes a one-off game with the fixture registry and the given bake config.
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const FIXTURE = fileURLToPath(new URL('../fixtures/models/game', import.meta.url));

export function stubThree(dir) {
  mkdirSync(join(dir, 'node_modules/three'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/three/package.json'), '{"name":"three","type":"module","main":"index.js"}');
  writeFileSync(join(dir, 'node_modules/three/index.js'), 'export const REVISION = "game-copy";\n');
}

export function copyFixture({ baked = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: src => baked || relative(FIXTURE, src).split(sep)[0] !== 'baked' });
  stubThree(dir);
  return dir;
}

export function gameWith(models, bake = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  mkdirSync(join(dir, 'assets/models'), { recursive: true });
  copyFileSync(join(FIXTURE, 'materials.js'), join(dir, 'materials.js'));
  for (const [id, bytes] of Object.entries(models)) writeFileSync(join(dir, 'assets/models', `${id}.glb`), bytes);
  writeFileSync(join(dir, 'game.config.js'), `export default ${JSON.stringify({ id: 't', bake: { materials: './materials.js', ...bake } })};\n`);
  return dir;
}
