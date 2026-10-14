// S-3 (overview §4.4): the engine's World seat. Each main scene owns a World made before its enter and disposed after
// its exit; overlays share it. The four lh.* systems are installed once and run whichever World is current, so the
// schedule never changes when scenes change. Sim-pure: Rapier comes from game.physics.rapier (D9).
import { createWorld } from './world.js';
import { checkRapier, mergeParams } from '../physics/rapier.js';
import { createGroups } from '../physics/groups.js';

// defineGame-time checks of the physics block (§4.1); `fail` prefixes 'defineGame: '
export function checkPhysics(p, fail) {
  if (p === null || typeof p !== 'object') fail('physics must be an object');
  if (p.gravity !== undefined && !(Array.isArray(p.gravity) && p.gravity.length === 3 && p.gravity.every(Number.isFinite))) fail('physics.gravity must be [x, y, z]');
  if (p.params !== undefined && (p.params === null || typeof p.params !== 'object')) fail('physics.params must be an object');
  try { mergeParams(p.params); } catch (err) { fail(err.message.replace(/^physics: params\./, 'physics.params.')); }
  try { createGroups(p.groups ?? []); } catch (err) { fail(err.message.replace(/^physics: /, 'physics.groups: ')); }
}

export function installWorld(engine, { timer = null } = {}) { // engine.loading (S-6) is read per step, so the engine object must exist
  checkRapier(engine.game.physics?.rapier ?? null); // §4.1: an uninitialised Rapier fails createEngine, not the first spawn
  const seat = {
    current: undefined,
    open() {
      const w = createWorld(engine, { seed: engine.seed, timer });
      seat.current = w;
      try { engine.netPart?.attach(w); } // 3i: present only when the game replicates its World
      catch (err) { seat.current = undefined; w.dispose(); throw err; } // no orphaned live World in the seat
      return w;
    },
    close() { const w = seat.current; seat.current = undefined; w?.dispose(); },
    digest() { const w = seat.current; return w !== undefined && w.stats.entities > 0 ? w.digest() : undefined; },
  };
  engine.system('lh.world.swap', () => { const w = seat.current; if (w !== undefined) w.sys.swap(); }, { stage: 'input.apply', before: ['lh.ui'] });
  // CI-16 (S-3): no Rapier step while a scene loads; read and events follow this step's decision (an unstepped read
  // would run the #2 re-sleep early). swap still runs, so prev catches up with curr and the view holds still.
  let stepped = false;
  engine.system('lh.physics.step', () => { const w = seat.current; stepped = w !== undefined && !engine.loading.active; if (stepped) w.sys.step(); }, { stage: 'physics.world' });
  engine.system('lh.physics.read', () => { if (stepped) seat.current.sys.read(); }, { stage: 'physics.world', after: ['lh.physics.step'] });
  engine.system('lh.physics.events', () => { if (stepped) seat.current.sys.events(); }, { stage: 'physics.world', after: ['lh.physics.read'] });
  return seat;
}
