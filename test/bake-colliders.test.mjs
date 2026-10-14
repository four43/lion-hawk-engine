import test from 'node:test';
import assert from 'node:assert/strict';
import { getIO, applyRenames } from '../tools/bake/read.js';
import { classify } from '../tools/bake/conventions.js';
import { collidersOf, boundsOf, axisOf } from '../tools/bake/colliders.js';
import { socketsOf } from '../tools/bake/sockets.js';
import { MODELS, model, boxGeom, planeGeom } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const S = 0.707107;
async function bakeParts(m, { rename, ...opts } = {}) {
  const doc = await (await getIO()).readBinary(await m.bytes());
  if (rename) applyRenames(doc, rename);
  const cls = classify(doc, 'm', { registry: REGISTRY });
  const warnings = [];
  return { cls, warnings, colliders: collidersOf(cls, { model: 'm', paintBase: 'steel', warn: w => warnings.push(w), ...opts }) };
}
const strip = c => { const { points, vertices, indices, ...rest } = c; return rest; };

test('3d: col-* primitives fit the node mesh bounds, oriented by the node; materials inherit or override', async () => {
  const { colliders, cls } = await bakeParts(MODELS.cart());
  assert.deepEqual(colliders.map(strip), [
    { shape: 'box', half: [1, 0.25, 1.5], p: [0, 0.5, 0], q: [0, 0.258819, 0, 0.965926], part: 'body', material: 'steel' }, // paint-body → paint base
    { shape: 'box', half: [0.2, 0.1, 0.2], p: [0, 1, 1], q: [0, 0, 0, 1], part: 'body', material: 'rubber' },               // extras.material
    { shape: 'hull', p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' },
    { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: [1.1, 0.3, 1], q: [0, 0, -S, S], part: 'wheel', material: 'rubber' }, // wheel: axis x
    { shape: 'capsule', halfHeight: 0.4, r: 0.1, p: [0, 1.25, -1], q: [0, 0, 0, 1], part: 'mast', material: 'steel' },
    { shape: 'sphere', r: 0.25, p: [0, 1, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' },                          // extras.part
  ]);
  assert.equal(colliders[2].points.length, 18);                                                                         // octahedron: 6 points, body space
  assert.deepEqual(colliders[2].points.slice(0, 3), [0.5, 1, -1]);   // octahedron centre (0, 0.5, -1) in body + body at y 0.5
  assert.deepEqual(socketsOf(cls.socks), { hitch: { p: [0, 0.5, -1.6], q: [0, 0, 0, 1], part: 'body' }, seat: { p: [0, 1, 0], q: [S, 0, 0, S], part: null } });
});
test('3d: no col-*: one hull per (part, material) in body space; static: one welded col-mesh per part', async () => {
  const pet = await bakeParts(MODELS.pet(), { rename: { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } } });
  assert.deepEqual(pet.colliders.map(c => [c.shape, c.part, c.material, c.points.length]),
    [['hull', 'body', 'flesh', 24], ['hull', 'Group', 'flesh', 24], ['hull', 'leg-left', 'flesh', 24], ['hull', 'leg-right', 'flesh', 24]]);
  assert.equal(Math.max(...pet.colliders[1].points.filter((_, i) => i % 3 === 1)), 0.8);   // head: body y 0.2 + Group 0.4 + half 0.2
  const ramp = await bakeParts(MODELS.ramp(), { static: true });
  assert.equal(ramp.colliders.length, 1);
  assert.deepEqual(strip(ramp.colliders[0]), { shape: 'mesh', p: [0, 0, 0], q: [0, 0, 0, 1], part: 'ramp', material: 'wood' });
  assert.equal(ramp.colliders[0].vertices.length, 18); assert.equal(ramp.colliders[0].indices.length, 24);   // 24 corners welded to 6
  assert.deepEqual(boundsOf(ramp.cls.parts), { min: [-1, 0, 0], max: [1, 1, 3] });
});
test('3d: a flat (part, material) group gets no default hull (warned); all flat throws; explicit col-hull flat throws', async () => {
  const m = model();
  m.node('rock', { mesh: m.mesh('rock', [[boxGeom([1, 1, 1]), 'wood'], [planeGeom(), 'plastic']]) });
  const r = await bakeParts(m);
  assert.deepEqual(r.colliders.map(c => c.material), ['wood']);
  assert.deepEqual(r.warnings, ['bake: m: rock (plastic) is flat, so it has no default hull']);
  const flat = model(); flat.node('leaf', { mesh: flat.mesh('leaf', [[planeGeom(), 'wood']]) });
  await assert.rejects(bakeParts(flat), /^Error: bake: m: leaf \(wood\) hull has fewer than 4 points \(add col-\* nodes or set colliders: false\)$/);
  const col = model(); col.node('body', { mesh: col.mesh('b', [[boxGeom([1, 1, 1]), 'wood']]) }); col.node('col-hull', { parent: 'body', mesh: col.mesh('c', [[planeGeom(), 'x']]) });
  await assert.rejects(bakeParts(col), /bake: m: col-hull hull has fewer than 4 points/);
});
test('3d: the capsule/cylinder axis is the round cross-section (contract issue: not simply the longest extent)', () => {
  assert.equal(axisOf([0.1, 0.3, 0.3]), 0);   // wheel: short along x
  assert.equal(axisOf([0.2, 1, 0.2]), 1);     // post
  assert.equal(axisOf([0.3, 0.3, 0.9]), 2);
  assert.equal(axisOf([0.5, 0.5, 0.5]), 0);   // a tie keeps the first longest
  assert.equal(axisOf([0.2, 0.5, 0.5]), 0);
});

test('3d: axisOf pins C1: the extent whose other two are closest to equal, a tie going to the longest', () => {
  assert.equal(axisOf([1, 2, 4]), 2);      // axes 0 and 2 tie at 0.5 (axis 1 is 0.75): the longest, 4, wins
  assert.equal(axisOf([4, 2, 1]), 0);
  assert.equal(axisOf([2, 4, 1]), 1);      // axes 1 and 2 tie at 0.5: 4 beats 1
  assert.equal(axisOf([3, 3, 1]), 2);      // a short disc: the round cross-section is x/y
  assert.equal(axisOf([1, 1, 3]), 2);
  assert.equal(axisOf([0.2, 0.5, 0.5]), 0); // a wheel lying on its side
  assert.equal(axisOf([4, 4, 4]), 0);      // all equal: first
});
