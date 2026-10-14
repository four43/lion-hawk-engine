// One game made only of the sim kits: striped terrain (field/track), a driven car with grip, coverage on the car.
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, defineMaterials, actions, axis } from '../../../src/index.sim.js';
import { createTerrain } from '../../../src/kits/terrain/sim.js';
import { createVehicle } from '../../../src/kits/vehicle/sim.js';
import { coverageKit } from '../../../src/kits/coverage/sim.js';
import { carWheels } from './car.js';

await RAPIER.init();
const MATERIALS = defineMaterials({ field: { extends: 'grass', dirtRate: 0.004 }, track: { extends: 'gravel', dirtRate: 0.006 } });
const N = 65, CELL = 2, X0 = -64, Z0 = -64;
function field(reg) {
  const heights = new Float32Array(N * N), mats = new Uint8Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    heights[iz * N + ix] = 0.4 * Math.sin(ix * 0.5) * Math.cos(iz * 0.4);
    mats[iz * N + ix] = reg.index((ix >> 2) & 1 ? 'track' : 'field'); // 8 m stripes across x
  }
  return { heights, mats };
}
const CTL = { steer: 0, engine: 0, brake: 0, slip: 2.5, side: 1 };

export default defineGame({
  id: 'kit-car', sim: { hz: 60, maxCatchUp: 3 },
  actions: actions({ throttle: axis(), steer: axis() }),
  defs: { materials: MATERIALS },
  physics: { rapier: RAPIER, gravity: [0, -9.81, 0], groups: ['ground', 'static', 'vehicle', 'prop'] },
  start: 'drive',
  scenes: {
    drive: {
      enter(e, ctx) {
        const w = ctx.world, f = field(w.materials);
        const terrain = createTerrain(w, { nx: N, nz: N, cell: CELL, x0: X0, z0: Z0, heights: f.heights, materials: f.mats });
        const car = w.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 },
          colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }],
          groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop'] },
          at: [-40, terrain.heightAt(-40, 0) + 1, 0], coverage: { dirt: 0 } });
        const v = createVehicle(w, car, { wheels: carWheels('x'), terrain, grip: true, rayGroups: { member: [], filter: ['ground', 'static'] } });
        coverageKit(ctx, { materialAt: (x, z) => terrain.materialAt(x, z) });
        Object.assign(ctx.state, { car, v });
      },
      step(e, dt, ctx) {
        const { v } = ctx.state, s = e.input.snapshot;
        for (let i = 0; i < 4; i++) {
          CTL.steer = i < 2 ? 0.4 * s.steer : 0; CTL.engine = i < 2 ? 0 : 1200 * s.throttle;
          v.set(i, CTL);
        }
      },
    },
  },
  policies: { drive: (h, k) => ({ throttle: 1, steer: Math.sin(k / 60) }) },
  state: e => {
    const st = e.scene.state;
    if (!st.car) return {};
    const p = st.car.xf.p;
    return { x: p.x, y: p.y, z: p.z, dirt: st.car.coverage.dirt, wheels: st.v.wheels.map(w => w.material).join(',') };
  },
});
