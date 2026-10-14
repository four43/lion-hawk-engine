import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hull, decimate } from '../tools/bake/hull.js';

const cube = [];
for (const x of [-1, 1]) for (const y of [0, 2]) for (const z of [-0.5, 0.5]) cube.push([x, y, z]);
const sorted = pts => pts.map(p => p.join(',')).sort();

test('3d: the hull of a cube plus interior and duplicate points is its 8 corners, 12 outward triangles', () => {
  const h = hull([[0, 1, 0], ...cube, [0.5, 1.5, 0.1], cube[3]]);
  assert.deepEqual(sorted(h.points), sorted(cube));
  assert.equal(h.tris.length, 12);
  const c = [0, 1, 0];
  for (const [i, j, k] of h.tris) {           // every face normal points away from the centre
    const a = h.points[i], b = h.points[j], d = h.points[k];
    const u = [0, 1, 2].map(n => b[n] - a[n]), v = [0, 1, 2].map(n => d[n] - a[n]);
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(nrm[0] * (a[0] - c[0]) + nrm[1] * (a[1] - c[1]) + nrm[2] * (a[2] - c[2]) > 0, `face ${i},${j},${k} faces inwards`);
  }
});
test('3d: flat, collinear and too-few point sets have no hull', () => {
  assert.equal(hull([[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0.5, 0, 0.5]]), null);
  assert.equal(hull([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]]), null);
  assert.equal(hull([[0, 0, 0], [1, 0, 0], [0, 1, 0]]), null);
});
test('3d: decimate keeps at most max support points, all from the input, and the hull is order-independent', () => {
  const pts = []; let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) { const a = rnd() * 6.283, b = Math.acos(2 * rnd() - 1); pts.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]); }
  const h = hull(pts);
  assert.ok(h.points.length > 64);
  const d = decimate(h.points, 64), keys = new Set(h.points.map(p => p.join(',')));
  assert.ok(d.length >= 32 && d.length <= 64, `kept ${d.length}`);
  for (const p of d) assert.ok(keys.has(p.join(',')));
  assert.equal(hull(d).points.length, d.length);   // every kept point is a hull vertex
  assert.deepEqual(decimate(cube, 64), cube);       // under the cap: unchanged
  assert.deepEqual(sorted(hull([...pts].reverse()).points), sorted(h.points));
});
test('the hull of Kenney car-kit tractor wheel-back-right (672 points, a near-coplanar rim) finishes closed and convex, then caps at 64', { timeout: 20000 }, () => {
  const pts = JSON.parse(readFileSync(new URL('./fixtures/hull-wheel-back-right.json', import.meta.url), 'utf8'));
  const h = hull(pts);
  assert.ok(h, 'a volume');
  assert.equal(h.tris.length, 2 * h.points.length - 4, 'a closed triangulated sphere (Euler)');
  const edges = new Set();
  for (const [a, b, c] of h.tris) for (const [i, j] of [[a, b], [b, c], [c, a]]) { assert.ok(!edges.has(`${i},${j}`), 'each directed edge once'); edges.add(`${i},${j}`); }
  for (const [i, j] of [...edges].map(e => e.split(','))) assert.ok(edges.has(`${j},${i}`), 'every edge has its twin');
  const P = h.points, scale = 1e-6;
  for (const [a, b, c] of h.tris) {
    const u = P[b].map((v, k) => v - P[a][k]), w = P[c].map((v, k) => v - P[a][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n);
    for (const p of pts) assert.ok(n.reduce((s, v, k) => s + v * (p[k] - P[a][k]), 0) / l <= scale, 'every input point is inside');
  }
  const capped = hull(decimate(h.points, 64));
  assert.ok(capped && capped.points.length <= 64);
});
