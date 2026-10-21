// test/net-owner.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import carts, { spawnCart } from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });

test('3i: an owner kind reaches every peer: the host relays a guest\'s cart to the other guests (N-10, C-3)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(2);
  for (const p of w.peers) for (const n of [1, 2, 3]) assert.ok(p.h.world.net.find('cart', n), `${p.name} has cart ${n}`);
  assert.deepEqual(w.diverged({ agree: { cart: 0.05 } }), []);
  const g2 = w.peers[2].h.world.net, c = g2.find('cart', 2);
  assert.equal(g2.remoteOf(c).kind.remote, 'driven'); assert.equal(c.owner, 2); assert.equal(c.body.isDynamic(), true, 'driven: a solid dynamic body');
  assert.equal(g2.remoteOf(g2.find('cart', 3)), undefined, 'its own cart is local');
});
test('3i: a player who leaves is despawned on the host and, by the relay, on the other guests (M-39)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(2);
  const host = w.host.h.world, g2 = w.peers[2].h.world, b0 = host.stats.bodies, b2 = g2.stats.bodies;
  w.drop(w.guests[0]); w.seconds(0.3);
  assert.equal(host.net.find('cart', 2), undefined); assert.equal(host.stats.bodies, b0 - 1);
  assert.equal(g2.net.find('cart', 2), undefined, 'the relay removed it'); assert.equal(g2.stats.bodies, b2 - 1);
  assert.deepEqual([...host.net.bindings.keys()], [3]);
});
test('3i: when the host leaves, a guest goes solo: other carts go, host kinds stay as plain local entities (M-41)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(2);
  w.drop(w.host); w.seconds(0.2);
  const g = w.guests[0].h.world.net;
  assert.equal(g.role, 'solo'); assert.equal(g.find('cart', 1), undefined); assert.equal(g.find('cart', 3), undefined);
  assert.ok(g.find('cart', 2), 'its own cart stays');
  const c = g.find('crate', 1); assert.ok(c, 'crates stay'); assert.equal(g.remoteOf(c), undefined, 'no longer replicated');
});
test('3i: a guest\'s world.clear() keeps its replicas: each is spawned again from its newest record, before any new frame (CI-15, S-3)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  const g = w.guests[0], G = g.h.world.net, old = G.find('crate', 1), x = old.xf.p.x, s0 = g.h.world.serial, sp = G.stats.spawned;
  w.blackout(1); // no frame gets through: whatever is back comes from the kept state
  g.h.world.clear(); // the game's rebuild: its ground and its own cart (replicas are not the game's to rebuild)
  g.h.world.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [40, 0.5, 40], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'asphalt' }], at: [0, -0.5, 0] });
  g.engine.scene.state.cart = spawnCart(g.h.world, 2);
  w.step(1);
  assert.notEqual(g.h.world.serial, s0);
  const c = G.find('crate', 1); assert.ok(c && c !== old, 'crate 1 is back, as a new entity'); assert.equal(c.netId, 1); assert.equal(c.hue, 1, 'with its game fields');
  assert.equal(c.body.isKinematic(), true, 'still a proxy'); assert.ok(Math.abs(c.xf.p.x - x) < 0.02, 'where it was');
  assert.equal(G.find('cart', 1)?.body.isDynamic(), true, 'the host\'s cart: driven again'); assert.ok(G.find('flag', 1)); assert.ok(G.find('crate', 2));
  assert.equal(G.stats.spawned, sp, 'not new replicas'); assert.equal(G.stats.respawned, 4, 'two crates, the flag and the host\'s cart');
  w.seconds(2.5); assert.deepEqual(w.diverged({ agree: { cart: 0.05, crate: 0.05, flag: 0.01 } }), [], 'and the session carries on');
});
