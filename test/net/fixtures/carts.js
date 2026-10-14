// test/net/fixtures/carts.js
// A small arena for the net part's mp() tests (3i): carts are an owner kind driven by their input (N-12 driven), crates a host
// kind with bodies (proxy), the flag a bodiless host kind (view). Each peer's number comes from its args (#77): the host is 1 and
// binds guests in join order, so run it as mp(carts, { argsOf: i => ({ n: i + 1 }) }).
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, F, kind, actions, axis, button } from '../../../src/index.sim.js';
import { installNet } from '../../../src/sim/net/install.js';

export const ACTIONS = actions({ thr: axis(), honk: button() });
export const DRIVE = { force: 800, damp: 200 }; // N and N·s/m: 4 m/s flat out on a 100 kg cart
const box = (half, material) => ({ shape: 'box', half, p: [0, 0, 0], q: [0, 0, 0, 1], material });
export const cartDesc = () => ({ body: { type: 'dynamic', lock: { rot: true }, mass: 100 }, colliders: [box([0.5, 0.4, 0.5], 'ice')], contacts: { min: 1 } });
export const crateDesc = () => ({ body: { type: 'dynamic', mass: 20 }, colliders: [box([0.3, 0.3, 0.3], 'plastic')] });
export const CART = kind({ name: 'cart', code: 1, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { body: F.body(), input: F.actions(ACTIONS) }, spawn: () => cartDesc() });
export const CRATE = kind({ name: 'crate', code: 2, authority: 'host', max: 16, idMin: 1, idMax: 16, fields: { body: F.body(), hue: F.uint(1) }, spawn: () => crateDesc() });
export const FLAG = kind({ name: 'flag', code: 3, authority: 'host', remote: 'view', max: 4, idMin: 1, idMax: 4, fields: { body: F.body(), up: F.bool() } });
export const startX = n => n === 1 ? -3 : n === 2 ? 3 : 0;
export const spawnCart = (world, n) => world.spawn({ ...cartDesc(), net: 'cart', netId: n, owner: n, at: [startX(n), 0.45, n > 2 ? 4 : 0], input: { thr: 0, honk: false } });
const N = { n: F.uint(2) }, IMP = { x: 0, y: 0, z: 0 };
export default defineGame({
  id: 'carts', start: 'arena', actions: ACTIONS,
  physics: { rapier: RAPIER, gravity: [0, -9.81, 0] },
  net: { kinds: [CART, CRATE, FLAG], world: true, maxSender: 4, codec: 'json',
    rates: { host: { reliable: 60, fast: 60, reliableFrames: 8 }, guest: { reliable: 60, fast: 240 } },
    wire: { toHost: { hi: 'host.hi' }, toGuest: { hi: 'guest.hi' } } },
  setup(engine) {
    installNet(engine); // idempotent: the World install may already have done it (integrator request 1)
    engine.system('carts.input', e => { const c = e.scene.state.cart; if (!c) return; c.input.thr = e.input.snapshot.thr; c.input.honk = e.input.snapshot.honk.down; }, { stage: 'input.apply', after: ['lh.commands'] });
    engine.system('carts.drive', e => { // every cart, local or driven replica, is moved by its own input (N-12)
      const list = e.world?.with('net'); if (!list) return; const dt = 1 / e.game.sim.hz;
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; if (c.net !== 'cart' || !c.body) continue; const v = c.body.linvel();
        IMP.x = (c.input.thr * DRIVE.force - DRIVE.damp * v.x) * dt; IMP.y = 0; IMP.z = -DRIVE.damp * v.z * dt; c.body.applyImpulse(IMP, true);
      }
    }, { stage: 'physics.world', before: ['lh.physics.step'] });
  },
  commands: {
    'net.open': (e, d, ctx) => { // the built-in handler ran first: world.net knows the role, and the host is player 1
      const s = ctx.state, w = ctx.world; s.role = d.role;
      if (d.role === 'guest') w.net.self = ctx.args.n;
      s.cart = spawnCart(w, w.net.self);
      if (d.role === 'host') {
        s.crates = [1, 2].map(i => w.spawn({ ...crateDesc(), net: 'crate', netId: i, at: [i * 2 - 3, 0.3, 4], hue: i }));
        s.flag = w.spawn({ xf: true, net: 'flag', netId: 1, at: [0, 2, -4], up: false });
      }
    },
    'net.peer': (e, d, ctx) => { if (ctx.state.role === 'host' && d.event === 'peer') ctx.world.net.player(d.id, ++ctx.state.next); },
    'host.hi': { schema: N, handler: () => {} }, 'guest.hi': { schema: N, handler: () => {} },
  },
  scenes: { arena: {
    enter(e, ctx) {
      Object.assign(ctx.state, { role: null, next: 1, cart: null, crates: [], flag: null });
      ctx.world.spawn({ body: 'fixed', colliders: [box([40, 0.5, 40], 'ice')], at: [0, -0.5, 0] }); // carts glide: DRIVE alone sets their speed (rubber on asphalt grips harder than DRIVE.force pushes)
    },
  } },
});
