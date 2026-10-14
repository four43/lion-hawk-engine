import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDECAR_VERSION, SHAPES, MAX_HULL_POINTS, validateCollider } from '../src/defs/sidecar.js';
import { defineMaterials } from '../src/defs/materials.js';

const I = [0, 0, 0, 1], O = [0, 0, 0];
const CUBE = [-1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
const EVERY = [
  { shape: 'box', half: [1, 0.5, 2], p: [0, 0.5, 0], q: I, part: 'body', material: 'steel' },
  { shape: 'sphere', r: 0.3, p: [1, 0, 1], q: I, part: 'wheel', material: 'rubber' },
  { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: O, q: [0, 0.7071068, 0, 0.7071068], part: 'body', material: 'steel' },
  { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: O, q: I, part: 'wheel', material: 'rubber' },
  { shape: 'hull', points: CUBE, p: O, q: I, part: 'body', material: 'wood' },
  { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2], p: O, q: I, part: 'body', material: 'wood' },
];
const opts = { where: 'sidecar: cart', path: 'c', parts: ['body', 'wheel'] };
const throwsExactly = (fn, message) => assert.throws(fn, e => (message instanceof RegExp ? message.test(e.message) : e.message === message) || assert.fail(`got "${e.message}", want "${message}"`));
const bad = (i, edit, message) => { const c = structuredClone(EVERY[i]); edit(c); throwsExactly(() => validateCollider(c, { ...opts, materials: defineMaterials() }), message); };

test('3b: every collider shape validates and is returned unchanged (overview §4.3)', () => {
  assert.equal(SIDECAR_VERSION, 1);
  assert.deepEqual([...SHAPES], ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh']);
  const m = defineMaterials();
  for (const c of EVERY) assert.equal(validateCollider(c, { ...opts, materials: m }), c, c.shape);
  const rounded = { ...EVERY[0], half: [1, 0.04, 2], round: 0.2 }; // Rally's thin core: round may exceed half
  assert.equal(validateCollider(rounded, { ...opts, materials: m }), rounded, 'a box may carry round (roundCuboid, 3j #1)');
});
test('3b: collider errors name the prefix, the path and the field', () => {
  bad(0, c => { c.half = [1, 0, 1]; }, 'sidecar: cart: c.half must be 3 numbers > 0 (got [1,0,1])');
  bad(1, c => { c.r = 0; }, 'sidecar: cart: c.r must be a number > 0 (got 0)');
  bad(1, c => { c.radius = 1; }, 'sidecar: cart: c.radius unknown field for a sphere (got 1)');
  bad(2, c => { c.q = [0, 0, 0, 2]; }, 'sidecar: cart: c.q must be a unit quaternion [x, y, z, w] (got [0,0,0,2])');
  bad(3, c => { delete c.p; }, 'sidecar: cart: c.p must be 3 numbers (got undefined)');
  bad(3, c => { c.part = 'tyre'; }, "sidecar: cart: c.part names an unknown part (got 'tyre')");
  bad(4, c => { c.points = CUBE.slice(0, 9); }, `sidecar: cart: c.points must be 4–${MAX_HULL_POINTS} points as a flat [x, y, z, ...] list (got [-1,-1,-1,1,-1,-1,-1,1,-1])`);
  bad(4, c => { c.points = Array.from({ length: (MAX_HULL_POINTS + 1) * 3 }, (_, i) => i); }, /^sidecar: cart: c\.points must be 4–64 points as a flat \[x, y, z, \.\.\.\] list \(got \[0,1,2,/);
  bad(4, c => { c.points = [...CUBE, 1, 2]; }, /^sidecar: cart: c\.points must be 4–64 points/);
  bad(5, c => { c.indices = [0, 1, 3]; }, 'sidecar: cart: c.indices[2] must be a vertex index 0–2 (got 3)');
  bad(5, c => { c.indices = [0, 1]; }, 'sidecar: cart: c.indices must be whole triangles (a multiple of 3, at least 3) (got [0,1])');
  bad(0, c => { c.material = 'unobtainium'; }, "sidecar: cart: c.material names an unknown material (got 'unobtainium')");
  bad(0, c => { c.material = 'paint-body'; }, "sidecar: cart: c.material is a paint slot; colliders take its base material (A-4) (got 'paint-body')");
  bad(0, c => { c.shape = 'ball'; }, "sidecar: cart: c.shape unknown shape (use 'sphere') (got 'ball')");
  bad(0, c => { c.round = 0; }, 'sidecar: cart: c.round must be a number > 0 (got 0)');
  bad(0, c => { c.round = Infinity; }, 'sidecar: cart: c.round must be a number > 0 (got Infinity)');
  bad(1, c => { c.round = 0.1; }, 'sidecar: cart: c.round unknown field for a sphere (got 0.1)');
  bad(0, c => { c.shape = 'cone'; }, "sidecar: cart: c.shape unknown shape (one of box, sphere, capsule, cylinder, hull, mesh) (got 'cone')");
});
test('3b: a full hull of exactly 64 points passes; 4 is the minimum', () => {
  const pts = Array.from({ length: MAX_HULL_POINTS * 3 }, (_, i) => Math.sin(i));
  assert.equal(validateCollider({ shape: 'hull', points: pts, material: 'wood' }, { inline: true }).points.length, 192);
  assert.equal(validateCollider({ shape: 'hull', points: CUBE, material: 'wood' }, { inline: true }).points.length, 12);
});
test('3b: inline colliders may leave out p, q and part; material is always required', () => {
  const m = defineMaterials();
  const c = { shape: 'sphere', r: 0.4, material: 'flesh' };
  assert.equal(validateCollider(c, { inline: true, materials: m }), c);
  assert.equal(validateCollider({ shape: 'hull', points: new Float32Array(CUBE), material: 'wood' }, { inline: true }).shape, 'hull', 'typed arrays are accepted');
  throwsExactly(() => validateCollider({ shape: 'sphere', r: 0.4 }, { inline: true, where: "spawn 'pig'", path: 'colliders[0]' }), "spawn 'pig': colliders[0].material must be a non-empty string (got undefined)");
  throwsExactly(() => validateCollider({ shape: 'sphere', r: 0.4, material: 'flesh', p: [0, 1] }, { inline: true }), 'collider: collider.p must be 3 numbers (got [0,1])');
  throwsExactly(() => validateCollider(c, {}), 'collider: collider.p must be 3 numbers (got undefined)');
});
