import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_MATERIALS } from '../src/defs/materials.base.js';

const SPEC_ORDER = ['steel', 'aluminium', 'wood', 'rubber', 'glass', 'plastic', 'fabric', 'flesh', 'fur', 'gravel', 'grass', 'dirt', 'mud', 'asphalt', 'snow', 'ice', 'water', 'air'];

test('3b: the base library is the spec\'s 18 materials in spec order (M-2)', () => {
  assert.deepEqual(Object.keys(BASE_MATERIALS), SPEC_ORDER);
});
test('3b: the base library is frozen all the way down', () => {
  const frozen = o => Object.isFrozen(o) && Object.values(o).every(v => !v || typeof v !== 'object' || frozen(v));
  assert.ok(frozen(BASE_MATERIALS));
  assert.throws(() => { BASE_MATERIALS.steel.phys.friction = 9; }, TypeError);
});
test('3b: ground materials carry tyre surfaces and a dirt rate (M-10 inputs)', () => {
  // tarmac, hardpack, gravel, grass, mud, packed snow, ice
  const surfaces = {
    asphalt: { mu: 1.15, C: 1.5, kp: 0.1, ap: 0.12, crr: 0.015, drag: 0 },
    dirt: { mu: 0.9, C: 1.4, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
    gravel: { mu: 0.8, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
    grass: { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.05, drag: 0.2 },
    mud: { mu: 0.4, C: 1.5, kp: 0.15, ap: 0.16, crr: 0.1, drag: 0.18 },
    snow: { mu: 0.75, C: 1.25, kp: 0.2, ap: 0.2, crr: 0.03, drag: 0 },
    ice: { mu: 0.55, C: 1.4, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
  };
  for (const [id, tire] of Object.entries(surfaces)) {
    assert.deepEqual({ ...BASE_MATERIALS[id].tire }, tire, id);
    assert.equal(typeof BASE_MATERIALS[id].dirtRate, 'number', id);
  }
  const grounds = Object.keys(BASE_MATERIALS).filter(id => BASE_MATERIALS[id].tire);
  assert.deepEqual(grounds.sort(), Object.keys(surfaces).sort(), 'only ground materials have tyre data');
});
test('3b: fluids have a fluid block and no phys; solids all have friction, restitution and sg', () => {
  for (const id of ['water', 'air']) { assert.ok(BASE_MATERIALS[id].fluid, id); assert.equal(BASE_MATERIALS[id].phys, undefined, id); }
  for (const id of SPEC_ORDER.slice(0, 16)) {
    const p = BASE_MATERIALS[id].phys;
    assert.ok(p && typeof p.friction === 'number' && typeof p.restitution === 'number' && p.sg > 0, id);
  }
  assert.equal(BASE_MATERIALS.steel.phys.sg, 7.85, 'design §6.1');
  assert.equal(BASE_MATERIALS.rubber.phys.sg, 1.1, 'design §6.1');
});
