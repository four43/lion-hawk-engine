// A stand-in engine for World unit tests (Tasks 2–10): exactly what createWorld reads (game.sim.hz, game.physics,
// game.defs, seed, emit). From Task 11 the tests use the real engine through test/fixtures/phys/game.js.
import { R } from './rapier.js';
import MATERIALS from './materials.js';
import PHYS from './phys.json' with { type: 'json' };

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];
export function stubEngine({ hz = 60, physics = true, groups = GROUPS, params, gravity, materials = MATERIALS, models = PHYS, seed = 1 } = {}) {
  const events = [];
  return {
    seed, events,
    emit: (type, data) => { events.push({ type, ...data }); },
    game: { sim: { hz }, physics: physics ? { rapier: R, groups, params, gravity } : undefined, defs: { materials, models } },
  };
}
