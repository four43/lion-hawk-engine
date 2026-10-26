// test/net/fixtures/farmlet.js
// A small farm game's four kinds (3i): can the net part host them? animal: a bodiless host kind whose game fields are
// interpolated by the kind's own apply (s = the interp sample); tree and player: data-only host kinds; train: an owner kind,
// driven, with a second jointed body (trailer: F.body() on a linked entity) and a rider list. Run as mp(farmlet, { argsOf: i => ({ n: i + 1 }) }).
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, F, kind, actions, axis, button } from '../../../src/index.sim.js';
import { installNet } from '../../../src/sim/net/install.js';

const XZ = F.fixed(-400, 400, 1 / 64), Y = F.fixed(-50, 50, 1 / 256);
export const ACT = actions({ thr: axis(), steer: axis(), horn: button() });
const box = (half, material) => ({ shape: 'box', half, p: [0, 0, 0], q: [0, 0, 0, 1], material });
export const truckDesc = () => ({ body: { type: 'dynamic', mass: 1400 }, colliders: [box([0.8, 0.6, 1.2], 'steel')] });
export const trailerDesc = () => ({ body: { type: 'dynamic', mass: 300 }, colliders: [box([0.8, 0.4, 1.0], 'wood')] });
const hitch = (world, e) => world.joint(e, e.trailer, RAPIER.JointData.spherical({ x: 0, y: 0, z: -1.6 }, { x: 0, y: 0, z: 1.6 }));
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', max: 1, idMin: 1, idMax: 4,
  fields: { body: F.body(), trailer: F.body(), mode: F.oneOf(['drive', 'show']), riders: F.list(F.obj({ id: F.uint(2), x: XZ, y: Y, z: XZ, yaw: F.angle() }), 16), input: F.actions(ACT) },
  spawn: () => ({ ...truckDesc(), trailer: trailerDesc() }), spawned: (e, world) => { hitch(world, e); } });
export const ANIMAL = kind({ name: 'animal', code: 1, authority: 'host', remote: 'view', max: 64, idMax: 0xfffe,
  fields: { x: XZ, z: XZ, yaw: F.angle(), anim: F.oneOf(['idle', 'walk']), owner: F.uint(1, 4) },
  spawn: () => ({ tags: ['animal'] }),
  apply(e, rec, world, s) { const a = s ? s.a : rec, b = s ? s.b : rec, k = s ? s.k : 1; e.x = a.x + (b.x - a.x) * k; e.z = a.z + (b.z - a.z) * k; e.yaw = b.yaw; e.anim = b.anim; e.owner = b.owner; } });
export const TREE = kind({ name: 'tree', code: 2, authority: 'host', max: 1024, idMax: 1023, fields: { state: F.oneOf(['standing', 'broken']) } });
export const PLAYER = kind({ name: 'player', code: 3, authority: 'host', max: 4, idMin: 1, idMax: 4, fields: { paint: F.oneOf(['red', 'blue']), away: F.bool() } });
export function spawnTrain(world, n) {
  const x = n === 1 ? -6 : 6;
  const e = world.spawn({ ...truckDesc(), net: 'train', netId: n, owner: n, at: [x, 0.6, 0], input: { thr: 0, steer: 0, horn: false }, mode: 'drive', riders: [] });
  world.add(e, 'trailer', world.spawn({ ...trailerDesc(), at: [x, 0.4, -3.2] })); hitch(world, e); return e;
}
const N = { n: F.uint(2) }, IMP = { x: 0, y: 0, z: 0 };
export default defineGame({
  id: 'farmlet', start: 'farm', actions: ACT,
  physics: { rapier: RAPIER, gravity: [0, -9.81, 0] },
  // the game binds numbers itself (#77): the 3i suites keep their hand-made join, and their frames carry no engine kinds (B3)
  net: { join: 'manual', kinds: [ANIMAL, TREE, PLAYER, TRAIN], world: true, maxSender: 4, codec: 'json',
    rates: { host: { reliable: 60, fast: 60, reliableFrames: 8 }, guest: { reliable: 60, fast: 240 } },
    wire: { toHost: { hi: 'host.hi' }, toGuest: { hi: 'guest.hi' } } },
  setup(engine) {
    installNet(engine);
    engine.system('farmlet.input', e => { const t = e.scene.state.train; if (!t) return; const s = e.input.snapshot; t.input.thr = s.thr; t.input.steer = s.steer; t.input.horn = s.horn.down; }, { stage: 'input.apply', after: ['lh.commands'] });
    engine.system('farmlet.drive', e => {
      const list = e.world?.with('net'); if (!list) return; const dt = 1 / e.game.sim.hz;
      for (let i = 0; i < list.length; i++) { const t = list[i]; if (t.net !== 'train' || !t.body) continue; const v = t.body.linvel();
        IMP.x = 0; IMP.y = 0; IMP.z = (t.input.thr * 12000 - 3000 * v.z) * dt; t.body.applyImpulse(IMP, true); }
    }, { stage: 'physics.world', before: ['lh.physics.step'] });
    engine.system('farmlet.herd', e => { const s = e.scene.state; if (s.role !== 'host') return; for (const a of s.animals) a.x += 1 / e.game.sim.hz; }, { stage: 'pre' });
  },
  commands: {
    'net.open': (e, d, ctx) => {
      const s = ctx.state, w = ctx.world; s.role = d.role;
      if (d.role === 'guest') w.net.self = ctx.args.n;
      s.train = spawnTrain(w, w.net.self);
      if (d.role === 'host') {
        s.animals = [0, 1, 2].map(id => w.spawn({ net: 'animal', netId: id, tags: ['animal'], x: id * 3, z: 8, yaw: 0, anim: 'walk', owner: 0 }));
        s.tree = w.spawn({ net: 'tree', netId: 7, state: 'standing' }); s.player = w.spawn({ net: 'player', netId: 1, paint: 'red', away: false });
      }
    },
    'net.peer': (e, d, ctx) => { if (ctx.state.role === 'host' && d.event === 'peer') ctx.world.net.player(d.id, ++ctx.state.next); },
    'host.hi': { schema: N, handler: () => {} }, 'guest.hi': { schema: N, handler: () => {} },
  },
  scenes: { farm: { enter(e, ctx) {
    Object.assign(ctx.state, { role: null, next: 1, train: null, animals: [], tree: null, player: null });
    ctx.world.spawn({ body: 'fixed', colliders: [box([60, 0.5, 60], 'ice')], at: [0, -0.5, 0] }); // a glide floor: the drive alone sets the speed
  } } },
});
