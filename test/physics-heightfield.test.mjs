// §4.5 heightfield (R4): Rapier 0.21 takes SUBDIVISION counts (rows along z, columns along x), heights in
// column-major order and the full extent as scale, centred on the translation. heightfieldDesc hides all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heightfieldDesc } from '../src/sim/physics/heightfield.js';
import { R } from './fixtures/phys/rapier.js';

test('heights are reordered column-major with subdivision counts, full-extent scale and centre translation', () => {
  const calls = [];
  const RR = { HeightFieldFlags: R.HeightFieldFlags, ColliderDesc: { heightfield: (...a) => { calls.push(a); return R.ColliderDesc.heightfield(...a); } } };
  const d = heightfieldDesc(RR, { nx: 3, nz: 2, cell: 2, x0: 10, z0: 20, heights: [0, 1, 2, 3, 4, 5], fixInternalEdges: true });
  const [rows, cols, H, scale, flags] = calls[0];
  assert.equal(rows, 1); assert.equal(cols, 2);
  assert.deepEqual([...H], [0, 3, 1, 4, 2, 5]); // H[iz + ix·nz] = heights[iz·nx + ix]
  assert.deepEqual(scale, { x: 4, y: 1, z: 2 });
  assert.equal(flags, R.HeightFieldFlags.FIX_INTERNAL_EDGES);
  const w = new R.World({ x: 0, y: 0, z: 0 });
  try { assert.deepEqual({ ...w.createCollider(d).translation() }, { x: 12, y: 0, z: 21 }); } finally { w.free(); }
  heightfieldDesc(RR, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 0] });
  assert.equal(calls[1][4], undefined, 'no flags unless fixInternalEdges');
});
test('a ball dropped on a sloped field rests at the analytic height, not the transposed one', () => {
  const nx = 9, nz = 7, cell = 1.5, x0 = -4, z0 = -3, h = (x, z) => 0.1 * x + 0.3 * z;
  const heights = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) heights[iz * nx + ix] = h(x0 + ix * cell, z0 + iz * cell);
  const w = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    w.timestep = 1 / 60;
    w.createCollider(heightfieldDesc(R, { nx, nz, cell, x0, z0, heights }));
    const ball = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(6, 5, 2).lockRotations().enabledTranslations(false, true, false));
    w.createCollider(R.ColliderDesc.ball(0.25), ball);
    for (let i = 0; i < 240; i++) w.step();
    const r = 0.25, lift = r * Math.sqrt(1 + 0.1 ** 2 + 0.3 ** 2); // a sphere on a plane: r / cos(slope)
    const y = ball.translation().y;
    assert.ok(Math.abs(y - (h(6, 2) + lift)) < 0.01, `rests at ${y}, expected ${h(6, 2) + lift}`);
    assert.ok(Math.abs(y - (h(2, 6) + lift)) > 0.5, 'a transposed field would put it 0.8 m higher');
  } finally { w.free(); }
});
test('bad fields throw before Rapier sees them', () => {
  assert.throws(() => heightfieldDesc(R, { nx: 1, nz: 3, cell: 1, heights: [0, 0, 0] }), /heightfield: nx and nz must be integers >= 2 \(got 1, 3\)/);
  assert.throws(() => heightfieldDesc(R, { nx: 2, nz: 2, cell: 0, heights: [0, 0, 0, 0] }), /heightfield: cell must be > 0 \(got 0\)/);
  assert.throws(() => heightfieldDesc(R, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0] }), /heightfield: heights must hold nx\*nz = 4 values \(got 3\)/);
});
