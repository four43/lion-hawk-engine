import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODELS, build } from './fixtures/models/make.mjs';

test('3d: the committed fixture models are exactly what make.mjs writes (no drift)', async () => {
  for (const name of Object.keys(MODELS)) {
    const committed = readFileSync(new URL(`./fixtures/models/game/assets/models/${name}.glb`, import.meta.url));
    assert.ok(Buffer.from(await build(name)).equals(committed), `${name}.glb differs: run node test/fixtures/models/make.mjs`);
  }
});
