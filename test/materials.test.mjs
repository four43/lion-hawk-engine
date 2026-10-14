import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMaterials, PHYS_DEFAULTS, MAX_MATERIALS } from '../src/defs/materials.js';
import { BASE_MATERIALS } from '../src/defs/materials.base.js';

const BASE_IDS = Object.keys(BASE_MATERIALS);
const GAME = { // overview §4.2's example
  pet: { extends: 'flesh', look: { roughness: 0.85 }, sound: 'squish' },
  stone: { extends: 'gravel', phys: { friction: 0.7 } },
  route: { extends: 'gravel', game: { grip: 1, vmul: 1 }, dirtRate: 0.006 },
};

test('3b: defineMaterials() is the base library alone; every base entry validates (M-1, M-2)', () => {
  const m = defineMaterials();
  assert.deepEqual([...m.ids], BASE_IDS);
  for (const id of BASE_IDS) assert.equal(m.has(id), true, id);
  assert.equal(m.has('pet'), false);
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.ids));
});
test('3b: ids are the base library first, then game entries in key order; index/byIndex round-trip', () => {
  const m = defineMaterials({ zebra: { extends: 'fur' }, apple: { extends: 'plastic' } });
  assert.deepEqual([...m.ids], [...BASE_IDS, 'zebra', 'apple']);
  m.ids.forEach((id, i) => { assert.equal(m.index(id), i); assert.equal(m.byIndex(i), id); });
  assert.throws(() => m.byIndex(m.ids.length), /^Error: materials: no material at index 20$/);
  assert.throws(() => m.byIndex(-1), /no material at index -1/);
  assert.throws(() => m.index('nope'), /^Error: materials: unknown material 'nope'$/);
});
test('3b: extends deep-merges per block, child wins, game blocks copy through (M-2, D6)', () => {
  const m = defineMaterials({
    ...GAME,
    lane: { extends: 'route', game: { vmul: 0.5 }, look: { color: '#123456' } },
    fluff: { extends: 'fur', look: { fur: { shells: 4 } } },
    wing: { extends: 'aluminium', aero: { airfoil: { cl: [[0, 0], [10, 1]], cd: [[0, 0.01], [10, 0.05]], stall: 15 } } },
    stub: { extends: 'wing', aero: { airfoil: { cl: [[0, 0.1], [5, 0.5]] } } },
  });
  assert.deepEqual(m.get('pet').look, { color: '#e8b4a0', roughness: 0.85, subsurface: { color: '#ff6040', strength: 0.5 } });
  assert.equal(m.get('pet').sound, 'squish');
  assert.deepEqual(m.get('pet').phys, BASE_MATERIALS.flesh.phys);
  assert.deepEqual(m.get('stone').phys, { friction: 0.7, restitution: 0.1, sg: 1.6 });
  assert.deepEqual(m.get('stone').tire, BASE_MATERIALS.gravel.tire);
  assert.deepEqual(m.get('lane').game, { grip: 1, vmul: 0.5 }, 'game merges like any block');
  assert.equal(m.get('lane').dirtRate, 0.006, 'two levels of extends');
  assert.deepEqual(m.get('fluff').look.fur, { length: 0.03, shells: 4, density: 1, tint: '#ffffff' }, 'nested look objects merge');
  assert.deepEqual(m.get('stub').aero.airfoil.cl, [[0, 0.1], [5, 0.5]], 'arrays replace');
  assert.deepEqual(m.get('stub').aero.airfoil.cd, [[0, 0.01], [10, 0.05]]);
  assert.equal(m.get('pet').id, 'pet');
  assert.equal(m.get('pet').extends, undefined, 'extends is resolved away');
});
test('3b: resolved materials are frozen copies; the caller\'s objects are not touched', () => {
  const entries = { pet: { extends: 'flesh', look: { roughness: 0.85 }, game: { hop: [1, 2] } } };
  const before = JSON.stringify(entries);
  const m = defineMaterials(entries);
  assert.equal(JSON.stringify(entries), before);
  assert.equal(Object.isFrozen(entries.pet.look), false);
  assert.ok(Object.isFrozen(m.get('pet').look) && Object.isFrozen(m.get('pet').game.hop));
  assert.notEqual(m.get('pet').game.hop, entries.pet.game.hop);
  assert.throws(() => { m.get('pet').phys.sg = 2; }, TypeError);
});
test('3b: a game entry with a base id merges over the base entry in place', () => {
  const m = defineMaterials({ grass: { look: { color: '#448833' } }, leaf: { extends: 'grass', look: { roughness: 0.6 } } });
  assert.equal(m.index('grass'), BASE_IDS.indexOf('grass'));
  assert.equal(m.ids.length, 19);
  assert.deepEqual(m.get('grass').look, { color: '#448833', roughness: 1 });
  assert.deepEqual(m.get('grass').tire, BASE_MATERIALS.grass.tire);
  assert.deepEqual(m.get('leaf').look, { color: '#448833', roughness: 0.6 }, 'extends sees the override');
  assert.throws(() => defineMaterials({ grass: { extends: 'dirt' } }), /^Error: materials: 'grass' overrides the base entry and cannot extend 'dirt'$/);
});
test('3b: density is sg × 1000 × fill; fluids without sg are 0; collider() gives √f (overview §4.2, D4)', () => {
  const m = defineMaterials({ shell: { extends: 'steel', phys: { fill: 0.02 } }, blob: {}, slick: { phys: { friction: 0.25 } } });
  assert.equal(m.density('steel'), 7850);
  assert.equal(m.density('shell'), 7850 * 0.02);
  assert.equal(m.density('blob'), 1000, 'sg and fill default to 1');
  assert.equal(m.density('water'), 0);
  assert.equal(m.density('air'), 0);
  assert.deepEqual({ ...m.collider('slick') }, { friction: 0.5, restitution: 0, density: 1000 });
  assert.deepEqual({ ...m.collider('blob') }, { friction: Math.sqrt(PHYS_DEFAULTS.friction), restitution: 0, density: 1000 });
  assert.equal(m.collider('steel'), m.collider('steel'), 'cached');
  assert.ok(Object.isFrozen(m.collider('steel')));
  assert.throws(() => m.collider('nope'), /unknown material 'nope'/);
  assert.throws(() => m.density('nope'), /unknown material 'nope'/);
});
test(`3b: more than ${MAX_MATERIALS} materials throws`, () => {
  const fill = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, {}]));
  assert.equal(defineMaterials(fill(MAX_MATERIALS - 18)).ids.length, MAX_MATERIALS);
  assert.throws(() => defineMaterials(fill(MAX_MATERIALS - 17)), /^Error: materials: 256 materials, at most 255$/);
});
test('3b: validation names the material, block and field (M-3)', () => {
  const cases = [
    [{ a: { looks: {} } }, "materials: 'a'.looks unknown block (got {})"],
    [{ a: { look: { rough: 1 } } }, "materials: 'a'.look.rough unknown field (got 1)"],
    [{ a: { look: { fur: { shell: 2 } } } }, "materials: 'a'.look.fur.shell unknown field (got 2)"],
    [{ a: { phys: { friction: 2.0001 } } }, "materials: 'a'.phys.friction out of range 0–2 (got 2.0001)"],
    [{ a: { phys: { friction: -0.1 } } }, "materials: 'a'.phys.friction out of range 0–2 (got -0.1)"],
    [{ a: { phys: { friction: '1' } } }, "materials: 'a'.phys.friction must be a number (got '1')"],
    [{ a: { phys: { restitution: 1.5 } } }, "materials: 'a'.phys.restitution out of range 0–1 (got 1.5)"],
    [{ a: { phys: { sg: 0 } } }, "materials: 'a'.phys.sg must be > 0 (got 0)"],
    [{ a: { phys: { fill: 0 } } }, "materials: 'a'.phys.fill out of range (0, 1] (got 0)"],
    [{ a: { phys: { fill: 1.01 } } }, "materials: 'a'.phys.fill out of range (0, 1] (got 1.01)"],
    [{ a: { look: { metalness: 1.2 } } }, "materials: 'a'.look.metalness out of range 0–1 (got 1.2)"],
    [{ a: { look: { roughness: NaN } } }, "materials: 'a'.look.roughness must be a number (got NaN)"],
    [{ a: { look: { color: 'red' } } }, "materials: 'a'.look.color must be a colour ('#rgb', '#rrggbb' or 0xrrggbb) (got 'red')"],
    [{ a: { look: { side: 'back' } } }, "materials: 'a'.look.side must be one of 'front', 'double' (got 'back')"],
    [{ a: { coverage: { snow: 2 } } }, "materials: 'a'.coverage.snow out of range 0–1 (got 2)"],
    [{ a: { coverage: { rain: 1 } } }, "materials: 'a'.coverage.rain unknown field (got 1)"],
    [{ a: { phys: 3 } }, "materials: 'a'.phys must be an object (got 3)"],
    [{ a: { sound: '' } }, "materials: 'a'.sound must be a non-empty string (got '')"],
    [{ a: { game: { f: () => 1 } } }, "materials: 'a'.game must be plain JSON data (got {})"],
    [{ a: { extends: 'zz' } }, "materials: 'a' extends unknown 'zz'"],
    [{ a: { extends: 'b' }, b: { extends: 'a' } }, 'materials: extends cycle a -> b -> a'],
    [{ a: { extends: 'a' } }, 'materials: extends cycle a -> a'],
    [{ a: 5 }, "materials: 'a' must be an object (got 5)"],
    [{ 'a|b': {} }, "materials: 'a|b' id must not contain '|' (pair keys use it)"],
    [{ 'paint-body': {} }, "materials: 'paint-body' ids starting with 'paint-' are reserved for paint slots (A-4)"],
  ];
  for (const [entries, message] of cases) assert.throws(() => defineMaterials(entries), e => e.message === message || assert.fail(`${JSON.stringify(Object.keys(entries))}: got "${e.message}", want "${message}"`));
  assert.throws(() => defineMaterials({}, { pair: {} }), /^Error: materials: unknown option 'pair'$/);
});
test('3b: range edges are inclusive where the spec says so', () => {
  const m = defineMaterials({ a: { phys: { friction: 2, restitution: 1, fill: 1, sg: 0.001 } }, b: { phys: { friction: 0, restitution: 0 } }, c: { look: { color: 0xffffff, fur: { shells: 32 } } }, d: { look: { wear: { rust: [0, 1] } } } });
  assert.equal(m.collider('a').friction, Math.SQRT2);
  assert.equal(m.collider('b').friction, 0);
});
