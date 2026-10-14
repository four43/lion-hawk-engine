// T-14: every material a game's sidecars and inline colliders name exists, and phys.json was baked against this
// registry (its hash).
import test from 'node:test';
import assert from 'node:assert/strict';
import { materials } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };

test('fixture sidecars and inline entries all resolve and the hash matches (T-14)', () => {
  const r = materials(physGame(), { inline: [{ material: 'gravel' }, { shape: 'sphere', r: 1, material: 'grass' }] });
  assert.deepEqual(r, { ok: true, missing: [], hash: { phys: '5ca1ab1e', registry: '5ca1ab1e', ok: true } });
});
test('every missing material is named, and a stale registry hash fails', () => {
  const phys = structuredClone(PHYS);
  phys.materials = 'deadbeef';
  phys.models.crate.colliders[0].material = 'balsa';
  const r = materials(physGame({ defs: { models: phys } }), { inline: [{ material: 'mud' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ where: 'models.crate.colliders[0]', material: 'balsa' }, { where: 'inline[0]', material: 'mud' }]);
  assert.deepEqual(r.hash, { phys: 'deadbeef', registry: '5ca1ab1e', ok: false });
});
test('a hash mismatch alone fails; a game without models has nothing to compare', () => {
  const phys = { ...structuredClone(PHYS), materials: '00000000' };
  assert.equal(materials(physGame({ defs: { models: phys } })).ok, false);
  const none = materials(physGame({ defs: { models: undefined } }));
  assert.deepEqual(none, { ok: true, missing: [], hash: { phys: null, registry: '5ca1ab1e', ok: true } });
});
test('a game without defs.materials is refused until the base library is the default (Task 17)', () => {
  assert.throws(() => materials(physGame({ defs: { materials: undefined } })), /checks\.materials: the game has no defs\.materials/);
});
