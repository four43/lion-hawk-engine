import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame } from './fixtures/kitGame.js';
import { createTerrain } from '../../src/kits/terrain/sim.js';

const world = () => headless(kitGame()).world;
const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const ids = (w, list) => Uint8Array.from(list.map(id => w.materials.index(id)));
// 3 × 2 samples, cell 2, from (10, -4): a plane rising 0.5 per m along x and 1.5 per m along z
const plane = (w, extra = {}) => createTerrain(w, { nx: 3, nz: 2, cell: 2, x0: 10, z0: -4, heights: [0, 1, 2, 3, 4, 5],
  materials: ids(w, ['grass', 'gravel', 'grass', 'snow', 'grass', 'asphalt']), ...extra });

test('heightAt interpolates the samples and clamps outside the grid', () => {
  const t = plane(world());
  assert.equal(t.heightAt(10, -4), 0); near(t.heightAt(12, -4), 1, 1e-12); near(t.heightAt(10, -2), 3, 1e-12); near(t.heightAt(14, -2), 5, 1e-12);
  near(t.heightAt(11, -3), 2, 1e-12); near(t.heightAt(13.5, -2.5), 4, 1e-12);
  assert.equal(t.heightAt(-100, -100), 0); near(t.heightAt(100, 100), 5, 1e-12);
});

test("heightAt splits each cell along Rapier's (ix+1, iz)–(ix, iz+1) diagonal", () => {
  const w = world(), t = createTerrain(w, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 1], materials: ids(w, Array(4).fill('grass')) });
  assert.equal(t.heightAt(0.25, 0.25), 0); near(t.heightAt(0.75, 0.75), 0.5, 1e-12); near(t.heightAt(0.5, 0.5), 0, 1e-12);
  // the (ix, iz)–(ix+1, iz+1) diagonal would give 0.25, 0.75 and 0.5
});

test('normalAt is the triangle normal and fills the out object', () => {
  const t = plane(world()), out = { x: 9, y: 9, z: 9 }, l = Math.sqrt(0.25 + 1 + 2.25);
  assert.equal(t.normalAt(11, -3.5, out), out);
  near(out.x, -0.5 / l, 1e-12); near(out.y, 1 / l, 1e-12); near(out.z, -1.5 / l, 1e-12);
  t.normalAt(13.5, -2.5, out);
  near(out.x, -0.5 / l, 1e-12); near(out.y, 1 / l, 1e-12); near(out.z, -1.5 / l, 1e-12);
  const w = world(), d = createTerrain(w, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 1], materials: ids(w, Array(4).fill('grass')) });
  d.normalAt(0.25, 0.25, out); near(out.y, 1, 1e-12);
  d.normalAt(0.75, 0.75, out); near(out.x, -1 / Math.sqrt(3), 1e-12); near(out.z, -1 / Math.sqrt(3), 1e-12);
});

test('materialAt picks the nearest sample and clamps outside the grid (M-10)', () => {
  const t = plane(world());
  assert.equal(t.materialAt(10.9, -4), 'grass'); assert.equal(t.materialAt(11.1, -4), 'gravel');
  assert.equal(t.materialAt(12, -3.1), 'gravel'); assert.equal(t.materialAt(12, -2.9), 'grass');
  assert.equal(t.materialAt(10, -2), 'snow'); assert.equal(t.materialAt(14, -2), 'asphalt');
  assert.equal(t.materialAt(100, 100), 'asphalt'); assert.equal(t.materialAt(-100, -100), 'grass');
});

test('materials may be a function; the collider material defaults to the most common sample', () => {
  const w = world(), t = plane(w);
  assert.equal(t.entity.colliders[0].material, 'grass');
  assert.equal(w.materialOf(t.entity.colliders[0].collider.handle), 'grass');
  const f = createTerrain(world(), { nx: 3, nz: 2, cell: 2, heights: [0, 0, 0, 0, 0, 0], materials: x => (x < 2 ? 'mud' : 'snow') });
  assert.equal(f.materialAt(1, 0), 'mud'); assert.equal(f.materialAt(3, 0), 'snow');
  assert.equal(f.entity.colliders[0].material, 'snow'); // the function sampled at the centre (2, 1)
  assert.equal(plane(world(), { material: 'ice' }).entity.colliders[0].material, 'ice');
});

test('blendAt: without blend one material at w 0; a blend function fills the out object', () => {
  const t = plane(world()), out = {};
  assert.equal(t.blendAt(11.1, -4, out), out); assert.deepEqual(out, { a: 'gravel', b: 'gravel', w: 0 });
  const b = plane(world(), { blend: (x, z, o) => { o.a = 'grass'; o.b = 'mud'; o.w = 0.25; return o; } });
  assert.equal(b.blendAt(0, 0, out), out); assert.deepEqual(out, { a: 'grass', b: 'mud', w: 0.25 });
});

test('grid holds float32 copies of the heights for the view half', () => {
  const src = [0.1, 1, 2, 3, 4, 5], w = world(), t = plane(w, { heights: src });
  assert.ok(Object.isFrozen(t) && Object.isFrozen(t.grid));
  assert.equal(t.grid.heights.constructor.name, 'Float32Array');
  assert.deepEqual([t.grid.nx, t.grid.nz, t.grid.cell, t.grid.x0, t.grid.z0], [3, 2, 2, 10, -4]);
  src[0] = 99; assert.equal(t.heightAt(10, -4), Math.fround(0.1)); // copied, and float32 like Rapier's
  assert.equal(t.grid.materials[1], w.materials.index('gravel'));
});

test('material, groups and fixInternalEdges reach world.heightfield unchanged (3j #4, CI-11)', () => {
  const w = world(), descs = [], spy = { materials: w.materials, groups: w.groups, heightfield: d => (descs.push(d), { colliders: [] }) };
  plane(spy, { material: 'ice', fixInternalEdges: true, groups: { member: ['static'] } }); // a game's own ground material goes here
  plane(spy);
  assert.equal(descs[0].material, 'ice'); assert.equal(descs[0].fixInternalEdges, true); assert.deepEqual(descs[0].groups, { member: ['static'] });
  assert.equal(descs[1].fixInternalEdges, false);
  assert.deepEqual(descs[1].groups, { member: ['ground'] }); // filter omitted: every group (3c)
});

test('createTerrain names what is wrong and spawns nothing when it refuses', () => {
  const w = world(), g = ids(w, Array(6).fill('grass')), base = { nx: 3, nz: 2, cell: 2, heights: [0, 0, 0, 0, 0, 0], materials: g };
  assert.throws(() => createTerrain(w, { ...base, nx: 1 }), /terrain: nx and nz must be integers >= 2 \(got 1, 2\)/);
  assert.throws(() => createTerrain(w, { ...base, cell: 0 }), /terrain: cell must be a positive number \(got 0\)/);
  assert.throws(() => createTerrain(w, { ...base, heights: [0, 0, 0, 0, 0] }), /terrain: heights must have nx\*nz = 6 entries \(got 5\)/);
  assert.throws(() => createTerrain(w, { ...base, heights: [0, 0, NaN, 0, 0, 0] }), /terrain: heights\[2\] is NaN/);
  assert.throws(() => createTerrain(w, { ...base, materials: Uint8Array.of(...g.slice(0, 5), 250) }), /terrain: materials\[5\] = 250 is not a registry index/);
  assert.throws(() => createTerrain(w, { ...base, materials: g.slice(0, 4) }), /terrain: materials must have nx\*nz = 6 entries, one per height sample \(got 4\)/);
  assert.throws(() => createTerrain(w, { ...base, materials: ['grass'] }), /terrain: materials must be a Uint8Array of registry indices or a function/);
  assert.throws(() => createTerrain(w, { ...base, material: 'cheese' }), /terrain: unknown collider material 'cheese'/);
  assert.throws(() => createTerrain(w, { ...base, blend: 3 }), /terrain: blend must be a function/);
  assert.equal(w.stats.entities, 0);
});
