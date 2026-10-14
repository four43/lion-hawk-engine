// A one-scene physics game for the engine, headless and checks tests (Tasks 11–16). The game injects Rapier (D9):
// nothing under src/ imports it. `yard` calls build(engine, ctx) in enter and tick(engine, dt, ctx) every step;
// `menu` is an empty main scene to leave to. physics: null makes a game without physics.
import { defineGame } from '../../../src/core/engine.js';
import { R } from './rapier.js';
import MATERIALS from './materials.js';
import PHYS from './phys.json' with { type: 'json' };

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];
export function physGame({ id = 'phys', hz = 60, build, tick, physics, defs, scenes, commands, state, setup, policies, actions } = {}) {
  return defineGame({
    id, sim: { hz, maxCatchUp: 3 }, start: 'yard',
    defs: { materials: MATERIALS, models: PHYS, ...defs },
    physics: physics === null ? undefined : { rapier: R, gravity: [0, -9.81, 0], groups: GROUPS, ...physics },
    scenes: { yard: { enter(e, ctx) { build?.(e, ctx); }, step(e, dt, ctx) { tick?.(e, dt, ctx); } }, menu: {}, ...scenes },
    commands, state, setup, policies, actions,
  });
}
