import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrainMesh } from '../../src/kits/terrain/view.js';

// view tests need no World: the mesh reads only terrain.grid
const grid = (nx, nz, cell, x0, z0, f) => {
  const H = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) H[iz * nx + ix] = f(ix, iz);
  return { grid: { nx, nz, cell, x0, z0, heights: H, materials: null } };
};
const T = grid(17, 9, 2, -16, -8, (ix, iz) => Math.sin(ix * 0.7) + iz * 0.25);
const compiler = () => { const calls = []; return { calls, get(id, o) { calls.push([id, o]); return new THREE.MeshLambertMaterial(); } }; };
const cam = (x, z) => ({ position: { x, y: 10, z } });
const verts = (n, m) => n * m + 2 * (n + m);

test('LOD 0 vertices sit on the height samples; counts include the four skirts', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  t.update(cam(-8, 0));
  assert.equal(t.group.children.length, 2);
  const [m0, m1] = t.group.children, p = m0.geometry.attributes.position;
  assert.equal(p.count, verts(9, 9));
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const v = j * 9 + i;
    assert.equal(p.getX(v), -16 + i * 2); assert.equal(p.getZ(v), -8 + j * 2); assert.equal(p.getY(v), T.grid.heights[j * 17 + i]);
  }
  assert.equal(m1.geometry.attributes.position.getX(0), 0);
  assert.equal(t.stats.chunks, 2); assert.equal(t.stats.builds, 2);
  assert.equal(m0.receiveShadow, true); assert.equal(m0.matrixAutoUpdate, false);
});

test('surface triangles face up and every skirt triangle faces out of its chunk', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1] });
  t.update(cam(0, 0));
  const g = t.group.children[0].geometry, p = g.attributes.position, idx = g.index.array, surface = 16 * 8 * 6;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  let skirts = 0;
  for (let k = 0; k < idx.length; k += 3) {
    A.fromBufferAttribute(p, idx[k]); B.fromBufferAttribute(p, idx[k + 1]); Cv.fromBufferAttribute(p, idx[k + 2]);
    N.subVectors(B, A).cross(E.subVectors(Cv, A));
    if (k < surface) assert.ok(N.y > 0, `surface triangle ${k / 3} faces down`);
    else { skirts++; const ox = (A.x + B.x + Cv.x) / 3, oz = (A.z + B.z + Cv.z) / 3; assert.ok(N.x * ox + N.z * oz > 0, `skirt triangle ${k / 3} faces in`); }
  }
  assert.equal(skirts, 2 * (16 + 8) * 2);
});

test('neighbouring chunks share their edge vertices exactly at one LOD (no cracks)', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  t.update(cam(-8, 0));
  const [a, b] = t.group.children.map(m => m.geometry.attributes);
  for (let j = 0; j < 9; j++) for (const k of ['position', 'normal']) for (let c = 0; c < 3; c++) {
    assert.equal(a[k].array[(j * 9 + 8) * 3 + c], b[k].array[(j * 9) * 3 + c], `${k} row ${j}`);
  }
});

test('LOD follows the distance to the chunk, with hysteresis toward the finer level', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  const count = () => t.group.children[0].geometry.attributes.position.count, L = [verts(17, 9), verts(9, 5), verts(5, 3)];
  t.update(cam(25, 0)); assert.equal(count(), L[0]);   // d 9
  t.update(cam(27, 0)); assert.equal(count(), L[0]);   // d 11: past 10, inside 10 + 12
  t.update(cam(40, 0)); assert.equal(count(), L[1]);   // d 24
  t.update(cam(50, 0)); assert.equal(count(), L[1]);   // d 34: inside 30 + 12
  t.update(cam(60, 0)); assert.equal(count(), L[2]);   // d 44
  t.update(cam(0, 0)); assert.equal(count(), L[0]);    // finer at once, from the cached geometry
  assert.equal(t.stats.builds, 3);
});

test('after the first update building is budgeted: a chunk shows what it has, or its coarsest LOD, never a hole', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 0 });
  t.update(cam(-8, 0));                                 // the first update is unbudgeted: both chunks at LOD 0
  t.update(cam(-60, 0));                                // chunk 0 now wants LOD 2: no budget, keeps LOD 0
  assert.equal(t.group.children[0].geometry.attributes.position.count, verts(9, 9));
  assert.equal(t.stats.pending, true); assert.equal(t.stats.builds, 2);
  const u = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 0, visFar: 20 });
  u.update(cam(-60, 0));                                // both beyond visFar: nothing built
  assert.equal(u.group.children.length, 0);
  u.update(cam(-8, 0));                                 // no budget: the coarsest LOD, so no hole
  assert.deepEqual(u.group.children.map(m => m.geometry.attributes.position.count), [verts(3, 3), verts(3, 3)]);
  assert.equal(u.stats.pending, true);
});

test('pending builds drain on later updates while the camera stands still (Rally streaming), then updates idle', () => {
  let t = 0;
  const now = () => (t += 2);                           // every clock read costs 2 ms: one build fits a 3 ms budget
  const m = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 3, now });
  const counts = () => m.group.children.map(c => c.geometry.attributes.position.count);
  m.update(cam(-8, 0)); assert.equal(m.stats.builds, 2);
  m.update(cam(-60, 0));                                // chunk 0 builds LOD 2; chunk 1 is over budget and keeps LOD 0
  assert.deepEqual(counts(), [verts(3, 3), verts(9, 9)]); assert.equal(m.stats.pending, true); assert.equal(m.stats.builds, 3);
  m.update(cam(-60, 0));                                // same place: pending work continues
  assert.deepEqual(counts(), [verts(3, 3), verts(3, 3)]); assert.equal(m.stats.pending, false); assert.equal(m.stats.builds, 4);
  m.update(cam(-60, 0)); assert.equal(m.stats.builds, 4);
});

test('colorAt, extra attributes and drop shape the vertices; the compiler is asked for vertex colours', () => {
  const c = compiler();
  const t = createTerrainMesh(T, { compiler: c, chunks: [1, 1], lods: [1, 2], lodFar: [10], material: 'grass',
    colorAt: (x, z, out) => { out[0] = (x + 16) / 32; out[1] = 0.5; out[2] = (z + 8) / 16; return out; },
    attributes: { rock: { size: 1, at: (x, z, out) => { out[0] = x > 0 ? 1 : 0; return out; } } },
    drop: (x, z, lod) => (lod ? 0.5 : 0) });
  assert.deepEqual(c.calls, [['grass', { vertexColors: true }]]);
  t.update(cam(0, 0));
  const g = t.group.children[0].geometry, v = 4 * 17 + 10; // ix 10, iz 4: x 4, z 0
  assert.equal(g.attributes.color.getX(v), 0.625); assert.equal(g.attributes.color.getY(v), 0.5); assert.equal(g.attributes.color.getZ(v), 0.5);
  assert.equal(g.attributes.rock.getX(v), 1); assert.equal(g.attributes.rock.getX(4 * 17 + 2), 0);
  t.update(cam(40, 0));                                 // d 24: past 10 + 12 hysteresis, LOD 1, sunk 0.5 m
  assert.equal(t.group.children[0].geometry.attributes.position.getY(0), Math.fround(T.grid.heights[0] - 0.5));
});

test('a three.js material passes straight through; bad options throw', () => {
  const mat = new THREE.MeshBasicMaterial(), t = createTerrainMesh(T, { material: mat, chunks: [1, 1] });
  t.update(cam(0, 0));
  assert.equal(t.group.children[0].material, mat);
  assert.throws(() => createTerrainMesh({}, {}), /terrain view: terrain.grid is missing/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), lods: [2, 1], lodFar: [10] }), /terrain view: lods must be rising positive integers/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), lods: [1, 2], lodFar: [] }), /terrain view: lodFar needs 1 distance\(s\) for 2 LODs/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), chunks: [0, 1] }), /terrain view: chunks must be \[x, z\] counts/);
  assert.throws(() => createTerrainMesh(T, { chunks: [1, 1] }), /terrain view: pass compiler/);
});

test('evict drops far fine geometry (Rally EVICT) and it is rebuilt on return', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1, 2, 4], lodFar: [10, 30], evict: [20, 50] });
  const real = THREE.BufferGeometry.prototype.dispose; let freed = 0;
  THREE.BufferGeometry.prototype.dispose = function () { freed++; return real.call(this); };
  try {
    t.update(cam(0, 0)); assert.equal(t.stats.builds, 1);
    t.update(cam(40, 0));                               // d 24 > evict[0]: LOD 0 freed, LOD 1 built
    assert.equal(freed, 1); assert.equal(t.stats.builds, 2);
    assert.equal(t.group.children[0].geometry.attributes.position.count, verts(9, 5));
    t.update(cam(0, 0));                                // back: LOD 0 rebuilt
    assert.equal(t.stats.builds, 3); assert.equal(t.group.children[0].geometry.attributes.position.count, verts(17, 9));
  } finally { THREE.BufferGeometry.prototype.dispose = real; }
});

test("Rally's settings: chunkCells fixes the chunk grid; colorAt gets the normal's y; uv rides on attributes (3j #9)", () => {
  const R = grid(901, 65, 1, 0, 0, (ix, iz) => 0.05 * ix + 0.02 * iz);
  const t = createTerrainMesh(R, { compiler: compiler(), chunkCells: 64, lods: [1, 2, 4], lodFar: [150, 400], hysteresis: 12, visFar: 760,
    evict: [300, 720], skirt: 2, budgetMs: 3, drop: (x, z, lod) => [0, 0.35, 0.9][lod],
    colorAt: (x, z, out, ny) => { out[0] = ny; out[1] = 0; out[2] = 0; return out; },
    attributes: { uv: { size: 2, at: (x, z, out) => { out[0] = x / 8; out[1] = z / 8; return out; } } } });
  assert.equal(t.stats.chunks, 15);                     // ceil(900 / 64); chunks: [15, 1] would make 60-cell chunks
  t.update(cam(32, 32));
  const [a, b] = t.group.children.map(m => m.geometry.attributes), v = 10 * 65 + 10;
  assert.equal(a.position.count, verts(65, 65)); assert.equal(b.position.getX(0), 64);
  assert.equal(a.color.getX(v), a.normal.getY(v)); assert.ok(a.color.getX(v) < 1);
  assert.equal(a.uv.getX(v), 1.25); assert.equal(a.uv.getY(v), 1.25);
  assert.ok(Number.isFinite(t.stats.lastUpdateMs) && t.stats.lastUpdateMs >= 0);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), chunkCells: 6, lods: [1, 2, 4], lodFar: [10, 30] }),
    /terrain view: chunkCells must be a multiple of the coarsest LOD step 4 \(got 6\)/);
});

test('dispose frees every built geometry and empties the group', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2], lodFar: [10] });
  t.update(cam(-8, 0)); t.update(cam(-40, 0));
  assert.equal(t.stats.builds, 4);
  const real = THREE.BufferGeometry.prototype.dispose; let freed = 0;
  THREE.BufferGeometry.prototype.dispose = function () { freed++; return real.call(this); };
  try { t.dispose(); } finally { THREE.BufferGeometry.prototype.dispose = real; }
  assert.equal(freed, 4); assert.equal(t.group.children.length, 0);
});
