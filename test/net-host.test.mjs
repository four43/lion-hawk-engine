// test/net-host.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp, headless } from '../testing/index.js';
import { defineGame, F, kind, encodeFrame } from '../src/index.sim.js';
import { installNet } from '../src/sim/net/install.js';
import carts, { CART } from './net/fixtures/carts.js';
await RAPIER.init();

const argsOf = i => ({ n: i + 1 });
const dist = (a, b) => Math.hypot(a.xf.p.x - b.xf.p.x, a.xf.p.y - b.xf.p.y, a.xf.p.z - b.xf.p.z);

test('3i: world.net is the engine\'s controller; the host is player 1 and binds guests in join order (#77)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.step(2);
  const [h, g1, g2] = w.peers.map(p => p.h.world.net);
  assert.equal(w.host.engine.netPart, h); assert.equal(installNet(w.host.engine), h, 'idempotent');
  assert.equal(h.role, 'host'); assert.equal(h.self, 1); assert.deepEqual([...h.players.values()], [2, 3]);
  assert.equal(g1.role, 'guest'); assert.equal(g1.self, 2); assert.equal(g2.self, 3);
  assert.throws(() => { g1.self = 9; }, /net: self must be a player number 0\.\.4 \(got 9\)/);
  assert.throws(() => { h.self = 2; }, /net: the host is player 1/);
  assert.throws(() => g1.player('g9', 3), /net: only the host binds players/);
  assert.throws(() => h.player(w.peers[2].net.id, 2), /net: player 2 is already bound to /);
});
test('3i: host kinds appear on a guest: crates as kinematic proxies, the flag bodiless (N-9, N-12)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  const G = w.guests[0].h.world.net, H = w.host.h.world.net;
  for (const id of [1, 2]) {
    const a = H.find('crate', id), b = G.find('crate', id);
    assert.ok(b, `crate ${id} replicated`); assert.equal(b.body.isKinematic(), true, 'proxy: kinematic'); assert.equal(b.hue, id, 'game fields applied');
    assert.ok(dist(a, b) < 0.02, `crate ${id} at rest agrees: ${dist(a, b)}`);
    assert.equal(G.remoteOf(b).kind.remote, 'proxy'); assert.equal(H.remoteOf(a), undefined, 'the host is the authority');
  }
  const f = G.find('flag', 1); assert.ok(f); assert.equal(f.body, undefined, 'view: no body'); assert.ok(dist(H.find('flag', 1), f) < 0.01);
  assert.ok(G.stats.frames > 0 && G.stats.spawned >= 4, 'two crates, the flag and the host\'s cart');
});
test('3i: a proxy follows about 100 ms behind its host, smoothly (N-12, M-25)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  const H = w.host.h.world.net, G = w.guests[0].h.world.net, b = G.find('crate', 1);
  w.host.h.place(H.find('crate', 1), { at: [6, 0.3, 4] });
  const xs = []; for (let i = 0; i < 60; i++) { w.step(1); xs.push(b.xf.p.x); }
  assert.ok(xs[3] < -0.9, `within 100 ms the guest still shows the old place (${xs[3]})`);
  assert.ok(Math.abs(xs.at(-1) - 6) < 0.02, `then it arrives (${xs.at(-1)})`);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 1e-9, 'it never steps back');
  assert.ok(Math.max(...xs.slice(1).map((x, i) => x - xs[i])) < 7, 'interpolated, not one jump');
});
test('3i: a game field replicates; a host despawn removes the replica and its body (E-7)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1);
  const G = w.guests[0].h.world.net, H = w.host.h.world.net, gw = w.guests[0].h.world;
  H.find('flag', 1).up = true; w.seconds(0.3); assert.equal(G.find('flag', 1).up, true);
  const bodies = gw.stats.bodies, d0 = G.stats.despawned;
  w.host.h.despawn(H.find('crate', 2)); w.seconds(0.3);
  assert.equal(G.find('crate', 2), undefined); assert.equal(gw.stats.bodies, bodies - 1); assert.equal(G.stats.despawned, d0 + 1);
});
test('3i: a frame that names another sender is dropped by the host (#77, M-50)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1);
  const H = w.host.h.world.net, g = w.guests[0], d0 = H.stats.dropped;
  const rec = { body: { p: { x: 0, y: 1, z: 9 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } }, input: { s: 1, list: [{ thr: 0, honk: false }] } };
  g.engine.net.send(g.net.hostId, encodeFrame({ key: false, sender: 3, time: 1e6, groups: [{ kind: CART, records: [[3, rec]], removed: [] }] }), false);
  w.seconds(0.2);
  assert.equal(H.find('cart', 3), undefined); assert.ok(H.stats.dropped > d0);
});
test('3i: installNet refuses kind fields that are entity parts', () => {
  const game = fields => defineGame({ id: 'bad', start: 's', scenes: { s: {} }, setup: e => installNet(e),
    net: { kinds: [kind({ name: 'x', code: 1, authority: 'host', max: 1, idMax: 1, fields })], world: true, maxSender: 4, codec: 'json',
      rates: { host: { reliable: 9, fast: 9 }, guest: { reliable: 9, fast: 9 } }, wire: { toHost: {}, toGuest: {} } } });
  assert.throws(() => headless(game({ netId: F.uint(1) })), /net: kind 'x' field 'netId' is an entity part; rename it/);
  assert.throws(() => headless(game({ body: F.oneOf(['red']) })), /net: kind 'x' field 'body' must be F\.body\(\)/);
});
test('3i: a record that cannot encode (an out-of-range field) costs only its own kind\'s frame: counted, everything else still sent', () => {
  const w = mp(carts, { peers: 2, argsOf: i => ({ n: i + 1 }) }); w.seconds(1.5);
  const H = w.host.h.world.net;
  H.find('crate', 1).hue = 300; // F.uint(1): encode throws
  const sent = H.stats.sent, unsent = H.stats.unsent;
  w.seconds(1, (p, k) => k === 0 ? { thr: 1 } : null); // the host drives its cart
  assert.ok(H.stats.unsent > unsent, 'the bad frame is counted');
  assert.ok(H.stats.sent > sent, 'other frames still go out');
  assert.deepEqual(w.diverged({ agree: { cart: 0.5 } }), [], 'the guest still follows the host\'s cart');
});
