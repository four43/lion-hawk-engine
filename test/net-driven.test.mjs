// test/net-driven.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import carts, { CART } from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });
const cartContacts = p => p.h.events.of('contact').filter(ev => p.h.world.get(ev.a)?.net === 'cart' && p.h.world.get(ev.b)?.net === 'cart');

test('3i: a guest\'s inputs drive its cart on the host, batched and played in owner-step order (N-13)', () => {
  const w = mp(carts, { peers: 2, argsOf, link: { delay: 80, loss: 0.02 } }); w.seconds(1.5);
  const H = w.host.h.world.net, remote = H.find('cart', 2), r = H.remoteOf(remote), x0 = remote.xf.p.x, used = [];
  for (let i = 0; i < 60; i++) { w.step(1, (p, k) => k === 1 ? { thr: -1 } : null); used.push(r.queue.used); }
  assert.ok(remote.xf.p.x < x0 - 1.5, `the host ran the guest's throttle (${x0} -> ${remote.xf.p.x})`);
  assert.ok(remote.input.thr < -0.99, 'the queue wrote the input onto the replica');
  for (let i = 1; i < used.length; i++) assert.ok(used[i] >= used[i - 1], 'owner-step order');
  assert.ok(r.queue.size <= 4, `queue ${r.queue.size}`);
  w.seconds(2, (p, k) => k === 1 ? { thr: 0 } : null);
  assert.deepEqual(w.diverged({ agree: { cart: 0.05 } }), []);
  assert.equal(H.stats.kinds.cart.snaps, 0, 'driving alone never snaps');
});
for (const [name, link] of [['80 ms, 2% loss', { delay: 80, loss: 0.02 }], ['80 ms, 20 ms jitter, 2% loss', { delay: 80, jitter: 20, loss: 0.02 }]]) {
  test(`3i: the bump test: a local and a driven cart collide on both peers, stay solid and converge (N-14..N-16; ${name})`, () => {
    const w = mp(carts, { peers: 2, argsOf, link }); w.seconds(1.5);
    const drive = (p, i) => ({ thr: i === 0 ? 1 : -1 }), snapAt = CART.tune.snapAt, gaps = [], speeds = [], off = [];
    let contact = -1;
    for (let k = 0; k < 300 && (contact < 0 || k < contact + 60); k++) {
      w.step(1, drive);
      for (const p of w.peers) {
        const net = p.h.world.net, a = net.find('cart', 1), b = net.find('cart', 2);
        gaps.push(b.xf.p.x - a.xf.p.x); speeds.push(Math.max(Math.abs(a.body.linvel().x), Math.abs(b.body.linvel().x)));
      }
      off.push(...w.diverged({ agree: { cart: snapAt } }));
      if (contact < 0 && w.peers.every(p => cartContacts(p).length)) contact = k;
    }
    assert.ok(contact >= 0, 'both peers felt the bump (N-16: each simulates the collision with its local and driven bodies)');
    assert.ok(Math.min(...gaps) > 0.9, `solid: never through each other (min centre gap ${Math.min(...gaps)})`);
    assert.ok(Math.max(...speeds) < 6, `no explosion (max speed ${Math.max(...speeds)})`);
    assert.deepEqual(off, [], 'no replica is ever farther than snapAt from its owner');
    for (const p of w.peers) assert.equal(p.h.world.net.stats.kinds.cart.snaps, 0, `${p.name}: no correction over snapAt during the bump`);
    assert.deepEqual(w.diverged({ agree: { cart: 0.5 } }), [], 'within 0.5 m of the owner 1 s after contact (R5 a)');
  });
}
test('3i: tunables are live per kind and per engine (N-17): a tiny snapAt turns nudges into snaps, with netFix', () => {
  const w = mp(carts, { peers: 2, argsOf, link: { delay: 80 } }); w.seconds(1.5);
  const H = w.host.h.world.net, cart = H.find('cart', 2);
  assert.notEqual(H.tunables.cart, CART.tune, 'a per-engine copy'); assert.deepEqual(H.tunables.cart, { snapAt: 1.5, nudge: 6, smoothMs: 150 });
  H.tunables.cart.smoothMs = 300; assert.equal(w.host.h.world.net.tunables.cart.smoothMs, 300, '3g reads world.net.tunables[e.net].smoothMs, live (3g #2)');
  H.tunables.cart.snapAt = 0.0001;
  w.seconds(0.5, (p, i) => i === 1 ? { thr: -1 } : null);
  assert.ok(H.stats.kinds.cart.snaps > 0); assert.ok(cart.netFix?.seq > 0);
  assert.equal(w.guests[0].h.world.net.tunables.cart.snapAt, 1.5, 'other engines keep theirs');
});
test('3i: a displaced replica is nudged back under snapAt and snapped over it; netFix holds old − new (N-14, N-15, §4.9)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  const H = w.host.h.world.net, c = H.find('cart', 2), st = H.stats.kinds.cart, x = c.xf.p.x;
  w.host.h.place(c, { at: [x + 0.5, 0.4, 0] }); const s0 = st.snaps;
  w.seconds(0.5); assert.ok(Math.abs(c.xf.p.x - x) < 0.05, `nudged back (${c.xf.p.x} vs ${x})`); assert.equal(st.snaps, s0, 'no snap under snapAt');
  w.host.h.place(c, { at: [x + 5, 0.4, 0] }); w.seconds(0.2);
  assert.equal(st.snaps, s0 + 1); assert.ok(Math.abs(c.xf.p.x - x) < 0.05, 'snapped');
  assert.ok(Math.abs(c.netFix.dp[0] - 5) < 0.1 && Math.abs(c.netFix.dp[2]) < 0.1, `dp ${c.netFix.dp}`);
});
