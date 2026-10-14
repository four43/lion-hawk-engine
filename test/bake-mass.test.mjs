import test from 'node:test';
import assert from 'node:assert/strict';
import { massOf } from '../tools/bake/mass.js';
import { hull } from '../tools/bake/hull.js';
import { rapierMass, assertMassClose } from './helpers/rapierMass.mjs';

const DENSITY = { wood: 600, steel: 7850, rubber: 1100, air: 0 };
const S = Math.SQRT1_2;

const cloud = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 200; i++) cloud.push([rnd() * 1.5 - 0.75, rnd() - 0.5, rnd() * 0.6 - 0.3]);
const SHAPES = {
  box: { shape: 'box', half: [1, 0.25, 2], p: [0, 0.5, 0.2], q: [0, S, 0, S], material: 'wood' },
  sphere: { shape: 'sphere', r: 0.25, p: [0, 1, -1], q: [0, 0, 0, 1], material: 'steel' },
  capsule: { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: [1, 0, 0], q: [0, 0, S, S], material: 'steel' },
  cylinder: { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: [-1, 0.2, 0.5], q: [S, 0, 0, S], material: 'rubber' },
  hull: { shape: 'hull', points: hull(cloud).points.flat(), p: [0, 0, 0], q: [0, 0, 0, 1], material: 'wood' },
  // the unit tetrahedron's repeated principal inertia makes Rapier's f32 principal frame drift ~1.6%, beyond the 1% tolerance
  mesh: { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'wood' },
};

for (const [name, c] of Object.entries(SHAPES)) {
  test(`3d: ${name} mass properties match Rapier 0.21 to 1%`, () => {
    assertMassClose(massOf([c], id => DENSITY[id]), rapierMass([c], id => DENSITY[id]), name);
  });
}
test('3d: a body of every shape, offset and rotated, matches Rapier to 1% (parallel axis and principal frame)', () => {
  const all = Object.values(SHAPES);
  assertMassClose(massOf(all, id => DENSITY[id]), rapierMass(all, id => DENSITY[id]), 'all');
});
test('3d: zero-density colliders add nothing; an all-air body has zero mass', () => {
  const air = { ...SHAPES.box, material: 'air' };
  assert.deepEqual(massOf([air], id => DENSITY[id]), { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] });
  assert.deepEqual(massOf([air, SHAPES.sphere], id => DENSITY[id]), massOf([SHAPES.sphere], id => DENSITY[id]));
});
