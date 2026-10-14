import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { rng } from '../../src/core/rng.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { createTerrain } from '../../src/kits/terrain/sim.js';

const nx = 17, nz = 13, cell = 1.5, x0 = -7, z0 = 3;
function bumpy() {
  const h = headless(kitGame()), w = h.world, r = rng(7);
  const heights = Array.from({ length: nx * nz }, () => 3 * r.next());
  const t = createTerrain(w, { nx, nz, cell, x0, z0, heights, materials: new Uint8Array(nx * nz).fill(w.materials.index('grass')) });
  h.step(1); // the broad phase sees new colliders after a step
  return { h, w, t, r };
}
const down = (w, x, z) => new w.R.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });

test('heightAt agrees with a Rapier ray cast on a bumpy field (row-major in, column-major inside Rapier)', () => {
  const { w, t, r } = bumpy();
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const x = x0 + 0.01 + r.next() * ((nx - 1) * cell - 0.02), z = z0 + 0.01 + r.next() * ((nz - 1) * cell - 0.02);
    const hit = w.rapier.castRay(down(w, x, z), 100, true);
    assert.ok(hit, `no hit at ${x}, ${z}`);
    worst = Math.max(worst, Math.abs(50 - hit.timeOfImpact - t.heightAt(x, z)));
  }
  assert.ok(worst < 1e-4, `worst height error ${worst}`);
});

test("normalAt agrees with Rapier's hit normal away from edges and the diagonal", () => {
  const { w, t, r } = bumpy(), n = { x: 0, y: 0, z: 0 };
  let worst = 0, used = 0;
  for (let k = 0; k < 400; k++) {
    const x = x0 + r.next() * (nx - 1) * cell, z = z0 + r.next() * (nz - 1) * cell;
    const u = ((x - x0) / cell) % 1, v = ((z - z0) / cell) % 1;
    if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98 || Math.abs(u + v - 1) < 0.02) continue;
    const hit = w.rapier.castRayAndGetNormal(down(w, x, z), 100, true);
    t.normalAt(x, z, n); used++;
    worst = Math.max(worst, Math.abs(hit.normal.x - n.x), Math.abs(hit.normal.y - n.y), Math.abs(hit.normal.z - n.z));
  }
  assert.ok(used > 300, `only ${used} samples`);
  assert.ok(worst < 1e-4, `worst normal error ${worst}`);
});

test("the terrain entity is in the 'ground' group: a ball filtered to ground lands on it, one filtered to static falls through", () => {
  const h = headless(kitGame()), w = h.world;
  const t = flatTerrain(w, { n: 21, cell: 2, h: 2 });
  const ball = (x, filter) => w.spawn({ body: { type: 'dynamic', linearDamping: 1 }, colliders: [{ shape: 'sphere', r: 0.5, material: 'steel' }],
    at: [x, 6, 0], groups: { member: ['prop'], filter } });
  const a = ball(-3, ['ground']), b = ball(3, ['static']);
  h.step(360);
  assert.ok(Math.abs(a.xf.p.y - (t.heightAt(-3, 0) + 0.5)) < 0.03, `a at ${a.xf.p.y}`);
  assert.ok(b.xf.p.y < 0, `b at ${b.xf.p.y}`);
});
