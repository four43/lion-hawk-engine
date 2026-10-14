import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePhys, validateSidecar } from '../src/defs/sidecar.js';
import REGISTRY from './fixtures/models/game/materials.js';

test('3d: the baked fixture phys.json passes 3b validation and records the real registry hash', () => {
  const phys = JSON.parse(readFileSync(new URL('./fixtures/models/game/baked/phys.json', import.meta.url), 'utf8'));
  validatePhys(phys, { materials: REGISTRY });
  for (const [id, s] of Object.entries(phys.models)) validateSidecar(s, { model: id, materials: REGISTRY });
  assert.equal(phys.materials, REGISTRY.hash);
  assert.match(REGISTRY.hash, /^[0-9a-f]{8}$/);
  assert.ok(Object.isFrozen(REGISTRY) && typeof REGISTRY.collider === 'function');   // a real defineMaterials registry
});
