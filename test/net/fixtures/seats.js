// test/net/fixtures/seats.js
// A bodiless room for plan 3 (N-18..N-25): the engine owns the join. Each of this page's numbered seats has a `dot` (an owner kind,
// drawn only) whose x follows that seat's input. A dot exists only while its number is the room's (net.locals): a renumbered or
// leaving seat's dot goes and the new number's comes (the game rekeys its pawns, N-25). Player state: score; game state: round.
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, F, kind, actions, axis } from '../../../src/index.sim.js';
import { installNet } from '../../../src/sim/net/install.js';

export const ACTIONS = actions({ x: axis() });
export const DOT = kind({ name: 'dot', code: 1, authority: 'owner', remote: 'view', max: 8, idMin: 1, idMax: 8, fields: { x: F.fixed(-10, 10, 1 / 64) } });
const RATES = { host: { reliable: 60, fast: 120, reliableFrames: 8 }, guest: { reliable: 60, fast: 240 } };
export const seatsGame = (net = {}, extra = {}) => defineGame({
  id: 'seats', start: 'room', actions: ACTIONS,
  player: { score: F.uint(2) }, gameState: { round: F.uint(1) },
  net: { kinds: [DOT], world: true, maxSender: 8, codec: 'json', rates: RATES, wire: { toHost: {}, toGuest: {} }, ...net },
  setup(engine) {
    installNet(engine);
    engine.system('seats.dots', e => {
      const w = e.world, net = w.net, dots = e.scene.state.dots;
      for (const [n, d] of dots) if (!net.locals.has(n)) { w.despawn(d); dots.delete(n); }
      for (const c of e.controllers) {
        if (c.seat === null || !net.locals.has(c.player)) continue;
        let d = dots.get(c.player); if (!d) dots.set(c.player, d = w.spawn({ net: 'dot', netId: c.player, owner: c.player, x: 0 }));
        d.x = c.input.snapshot.x * 10;
      }
    }, { stage: 'pre' });
  },
  scenes: { room: { enter(e, ctx) { ctx.state.dots = new Map(); } } },
  ...extra,
});
export default seatsGame();

// Task 5's note: the same room with bodies. Each numbered seat drives a `pawn` (an owner kind, remote 'driven'): the owner writes its
// seat's input into the pawn and every pawn, local or a driven replica, is pushed by its own input, so a replica moves as its owner's
export const PAWN = kind({ name: 'pawn', code: 2, authority: 'owner', max: 8, idMin: 1, idMax: 8, fields: { body: F.body(), input: F.actions(ACTIONS) },
  spawn: () => pawnDesc() });
const pawnDesc = () => ({ body: { type: 'dynamic', lock: { rot: true }, mass: 10 }, colliders: [{ shape: 'sphere', r: 0.3, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'ice' }] });
const IMP = { x: 0, y: 0, z: 0 };
export const pawnsGame = () => defineGame({
  id: 'pawns', start: 'room', actions: ACTIONS, physics: { rapier: RAPIER, gravity: [0, 0, 0] },
  net: { kinds: [PAWN], world: true, maxSender: 8, codec: 'json', rates: RATES, wire: { toHost: {}, toGuest: {} } },
  setup(engine) {
    installNet(engine);
    engine.system('pawns.own', e => {
      const w = e.world, net = w.net, pawns = e.scene.state.pawns;
      for (const [n, p] of pawns) if (!net.locals.has(n)) { w.despawn(p); pawns.delete(n); }
      for (const c of e.controllers) {
        if (c.seat === null || !net.locals.has(c.player)) continue;
        let p = pawns.get(c.player);
        if (!p) pawns.set(c.player, p = w.spawn({ ...pawnDesc(), net: 'pawn', netId: c.player, owner: c.player, at: [0, 0, c.player * 2], input: { x: 0 } }));
        p.input.x = c.input.snapshot.x;
      }
    }, { stage: 'input.apply', after: ['lh.commands'] });
    engine.system('pawns.drive', e => {
      const list = e.world?.with('net'); if (!list) return; const dt = 1 / e.game.sim.hz;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]; if (p.net !== 'pawn' || !p.body) continue; const v = p.body.linvel();
        IMP.x = (p.input.x * 40 - 10 * v.x) * dt; IMP.y = 0; IMP.z = -10 * v.z * dt; p.body.applyImpulse(IMP, true);
      }
    }, { stage: 'physics.world', before: ['lh.physics.step'] });
  },
  scenes: { room: { enter(e, ctx) { ctx.state.pawns = new Map(); } } },
});
