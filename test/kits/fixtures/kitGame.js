// Kit suite fixtures: a one-scene physics game around the World, a shared material registry and flat terrains.
// The scene keeps a `movers` list: each step moves those (bodiless) entities +x by their own `v` metres.
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, defineMaterials } from '../../../src/index.sim.js';
import { createTerrain } from '../../../src/kits/terrain/sim.js';

await RAPIER.init();
export { RAPIER };

export const MATERIALS = defineMaterials({
  route: { extends: 'gravel', dirtRate: 0.01 },
  bog: { extends: 'mud', dirtRate: 0.2 },
  coat: { extends: 'steel', coverage: { dirt: 0.5 } },
}, { pairs: { 'rubber|ice': { friction: 0.1 } } });

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];

export function kitGame({ enter, step, setup, models, state, groups = GROUPS, hz = 60 } = {}) {
  const play = {
    enter(e, ctx) { ctx.state.movers = []; enter?.(e, ctx); },
    step(e, dt, ctx) { for (const m of ctx.state.movers) m.xf.p.x += m.v; step?.(e, dt, ctx); },
  };
  return defineGame({
    id: 'kit-test', sim: { hz, maxCatchUp: 3 },
    ...(setup ? { setup } : {}),
    defs: models ? { materials: MATERIALS, models } : { materials: MATERIALS },
    physics: { rapier: RAPIER, gravity: [0, -9.81, 0], groups },
    start: 'play', scenes: { play, other: {} },
    ...(state ? { state } : {}),
  });
}

// A flat n×n terrain from x0 = z0 = -n: with cell 2 every sample sits on an odd coordinate, so x = 0 and z = 0 fall
// midway between samples. at(x, z) names each sample's material.
export function flatTerrain(world, { n = 41, cell = 2, h = 0, at = () => 'gravel' } = {}) {
  const x0 = -n, z0 = -n, heights = new Float32Array(n * n).fill(h), mats = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) mats[iz * n + ix] = world.materials.index(at(x0 + ix * cell, z0 + iz * cell));
  return createTerrain(world, { nx: n, nz: n, cell, x0, z0, heights, materials: mats });
}
