// test/net-locals.test.mjs
// [N-20], [N-24]: bindings, locals and frames that carry several numbers (plan 2026-10-21-local-players-3, Task 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp, headless } from '../testing/index.js';
import { encodeFrame, decodeFrame, isFrame, createRegistry } from '../src/index.sim.js';
import carts, { CART } from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });
const rec = z => ({ body: { p: { x: 0, y: 0.45, z }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } }, input: { s: 1, list: [{ thr: 0, honk: false }] } });

test('the host binds a peer\'s seats to numbers by hand; bindings feed the roster (N-20)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  const H = w.host.h.world.net, peer = w.guests[0].net.id;
  H.player(peer, 1, 4);
  assert.deepEqual([...H.bindings], [[2, { peer, key: null, seat: 0 }], [4, { peer, key: null, seat: 1 }]]);
  assert.deepEqual(w.host.engine.players.map(p => [p.number, p.seat, p.local]), [[1, 0, true], [2, 0, false], [4, 1, false]]);
  assert.throws(() => H.player(peer, 16, 3), /net: player\(peer, seat, n\): seat must be an integer in 0\.\.15 \(got 16\)/);
  H.player(peer, 1, 0); assert.deepEqual([...H.bindings.keys()], [2], 'one seat unbound');
  H.player(peer, 1, 4); H.player(peer, 0); assert.equal(H.bindings.size, 0, 'player(peer, 0) unbinds every seat of the peer');
  assert.deepEqual(w.host.engine.players.map(p => p.number), [1]);
});

test('a frame may carry every seat of its peer; any number not bound to it drops the frame (N-24, M-50, review focus)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(1);
  const H = w.host.h.world.net, g = w.guests[0], G2 = w.peers[2].h.world.net, send = f => g.engine.net.send(g.net.hostId, encodeFrame(f), false);
  H.player(g.net.id, 1, 4); const d0 = H.stats.dropped;
  send({ key: false, sender: 2, time: 1e6, groups: [{ kind: CART, records: [[2, rec(5)], [4, rec(7)]], removed: [] }] });
  w.seconds(0.3);
  assert.equal(H.stats.dropped, d0, 'both numbers are this peer\'s'); assert.ok(H.find('cart', 4), 'the host has seat 1\'s cart');
  assert.ok(G2.find('cart', 4), 'and relays it to the others, by its own number');
  send({ key: false, sender: 2, time: 2e6, groups: [{ kind: CART, records: [[3, rec(9)]], removed: [] }] });
  send({ key: false, sender: 2, time: 2e6, groups: [{ kind: CART, records: [], removed: [3] }] });
  send({ key: false, sender: 3, time: 2e6, groups: [{ kind: CART, records: [[3, rec(9)]], removed: [] }] });
  w.seconds(0.2);
  assert.equal(H.stats.dropped, d0 + 3, 'cart 3 is guest2\'s: a record of it, a removal of it, or its sender byte drops the frame');
  assert.ok(Math.abs(H.find('cart', 3).xf.p.z - 4) < 1, 'guest2\'s cart is untouched');
});

test('a removal of a number no longer bound (a seat that left, still in its REPEAT diffs) is ignored, not hostile (N-24, S2)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(1);
  const H = w.host.h.world.net, g = w.guests[0], send = f => g.engine.net.send(g.net.hostId, encodeFrame(f), false);
  H.player(g.net.id, 1, 4); H.player(g.net.id, 1, 0); w.seconds(0.2); // seat 1 had number 4 and left: 4 is free
  const d0 = H.stats.dropped;
  send({ key: false, sender: 2, time: 1e6, groups: [{ kind: CART, records: [[2, rec(5)]], removed: [4] }] });
  w.seconds(0.2);
  assert.equal(H.stats.dropped, d0, 'the frame is kept: seat 0\'s record is not lost with it');
  assert.equal(H.find('cart', 4), undefined);
  send({ key: false, sender: 2, time: 2e6, groups: [{ kind: CART, records: [[2, rec(5)]], removed: [3] }] });
  w.seconds(0.2);
  assert.equal(H.stats.dropped, d0 + 1, 'a removal of a number bound to another peer still drops the frame');
});

test('net.locals is this page\'s numbers: every seat solo, seat 0 first as net.self (N-24)', () => {
  const h = headless(carts); h.step(1);
  assert.deepEqual([...h.world.net.locals], [1]); assert.equal(h.world.net.self, 1);
  h.command('lh.seat', { op: 'join', seat: 1 }); h.step(1);
  assert.deepEqual([...h.world.net.locals], [1, 2]);
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  const G = w.guests[0];
  assert.deepEqual([...G.h.world.net.locals], [2], 'a guest: the number its game set (manual join)');
  assert.equal(G.engine.controllerOf(0).player, 2, 'seat 0 took it');
  assert.deepEqual(G.engine.players, [], 'a manual guest\'s roster restarted empty at net.open (B1)');
});

const nums = h => [0, 1].map(s => h.engine.controllerOf(s)?.player);
const renumbered = h => h.events.of('player.renumbered').map(e => [e.seat, e.from, e.to]);
test('a manual guest that played solo with two seats takes its number: the seat holding it moves aside (I1)', () => {
  const h = headless(carts, { args: { n: 2 } }); h.step(1);
  h.command('lh.seat', { op: 'join', seat: 1 }); h.step(1);
  assert.deepEqual(nums(h), [1, 2], 'solo: seats 1 and 2');
  h.command('net.open', { role: 'guest', id: 'g1', hostId: 'h0', at: 0, key: [2, 0, 0, 0] });
  assert.doesNotThrow(() => h.step(1), 'the game\'s self = 2 does not hit "player 2 is taken"');
  assert.deepEqual(nums(h), [2, 3], 'seat 0 is 2; seat 1 moved aside to a free number');
  assert.deepEqual([...h.world.net.locals], [2]); assert.equal(h.world.net.self, 2);
  assert.deepEqual(renumbered(h), [[1, 2, 3], [0, 1, 2]]);
});
test('a guest seat that joined online before the setter moves aside the same way (I1)', () => {
  const h = headless(carts, { args: { n: 1 } }); h.step(1);
  h.command('net.open', { role: 'guest', id: 'g1', hostId: 'h0', at: 0, key: [2, 0, 0, 0] }); h.step(1);
  h.command('lh.seat', { op: 'join', seat: 1 }); h.step(1);
  assert.deepEqual(nums(h), [1, 2], 'freeLocal gave seat 1 the number 2');
  assert.doesNotThrow(() => { h.world.net.self = 2; }); h.step(1);
  assert.deepEqual(nums(h), [2, 3]); assert.deepEqual([...h.world.net.locals], [2]);
  assert.deepEqual(renumbered(h), [[1, 2, 3], [0, 1, 2]]);
});
test('a guest keyframe that leaves out one of its numbers ends it in the relay too (M1)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(1);
  const H = w.host.h.world.net, g = w.guests[0], G2 = w.peers[2], send = f => g.engine.net.send(g.net.hostId, encodeFrame(f), false);
  const reg = createRegistry(carts.net.kinds, { maxSender: carts.net.maxSender });
  H.player(g.net.id, 1, 4);
  send({ key: false, sender: 2, time: 1e6, groups: [{ kind: CART, records: [[2, rec(5)], [4, rec(7)]], removed: [] }] });
  w.seconds(0.3); assert.ok(G2.h.world.net.find('cart', 4), 'guest2 has seat 1\'s cart');
  const keys = [], prev = w.hub.drop;
  w.hub.drop = (from, to, data, reliable) => {
    if (to === G2.net.id && isFrame(data)) { const f = decodeFrame(data, reg); if (f?.key && f.groups.has('cart')) keys.push(f); }
    return prev ? prev(from, to, data, reliable) : false;
  };
  send({ key: true, sender: 2, time: 2e6, groups: [{ kind: CART, records: [[2, rec(5)]], removed: [] }] }); // 4's removal diffs were lost
  w.seconds(3);
  const relayed = keys.filter(f => f.sender === 4);
  assert.ok(relayed.length, 'the host relays keyframes for number 4');
  assert.ok(relayed.every(f => !f.groups.get('cart').records.has(4)), 'no relay keyframe to guest2 carries 4 again');
  assert.equal(G2.h.world.net.find('cart', 4), undefined, 'and guest2 ends the ghost');
});
test('the host cannot bind one of its own seats\' numbers to a guest (M3)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  w.seat(0, 'join', 1); w.step(1);
  const H = w.host.h.world.net, n = w.host.engine.controllerOf(1).player;
  assert.ok(H.locals.has(n));
  assert.throws(() => H.player(w.guests[0].net.id, 1, n), new RegExp(`net: player ${n} is this page's`));
});
