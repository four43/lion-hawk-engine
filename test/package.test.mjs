import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENGINE_VERSION } from '../src/version.js';

test('ENGINE_VERSION matches package.json (G-3)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(ENGINE_VERSION, pkg.version);
});
test('package entry points load', async () => {
  await import('lion-hawk/sim'); await import('lion-hawk/view'); await import('lion-hawk/net'); await import('lion-hawk/test'); await import('lion-hawk/build');
});
