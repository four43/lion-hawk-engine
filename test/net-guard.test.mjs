// test/net-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import carts, { crateDesc, cartDesc } from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });

test('3i: E-7 on a guest: only replication spawns or despawns host kinds; a player spawns only its own owner kind', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1);
  const g = w.guests[0].h, net = g.world.net;
  assert.throws(() => g.spawn({ ...crateDesc(), net: 'crate', netId: 9, at: [0, 1, 0] }), /net: a guest may not spawn 'crate' 9: only replication spawns host kinds \(E-7\)/);
  assert.throws(() => g.despawn(net.find('crate', 1)), /net: 'crate' 1 is replicated: only replication may despawn it \(E-7\)/);
  assert.throws(() => g.despawn(net.find('cart', 1)), /net: 'cart' 1 is replicated: only replication may despawn it/);
  assert.throws(() => g.spawn({ ...cartDesc(), net: 'cart', netId: 3, owner: 3, at: [0, 1, 0] }), /net: player 2 may not spawn 'cart' 3: only its owner does \(E-7\)/);
  assert.throws(() => g.world.remove(net.find('crate', 1), 'net'), /net: 'crate' 1 is replicated: only replication may change its 'net' part/);
  w.host.h.spawn({ ...crateDesc(), net: 'crate', netId: 9, at: [0, 1, 6], hue: 9 }); w.seconds(0.3);
  assert.ok(net.find('crate', 9), 'the host may, and replication brings it');
  w.host.h.despawn(w.host.h.world.net.find('crate', 9)); w.seconds(0.3);
  assert.equal(net.find('crate', 9), undefined, 'and replication takes it away');
});
test('3i: kind id ranges, owner = netId and known kinds hold in every role', () => {
  const w = mp(carts, { peers: 1, argsOf }); w.step(1);
  const h = w.host.h;
  assert.throws(() => h.spawn({ ...crateDesc(), net: 'crate', netId: 17 }), /net: 'crate' netId must be an integer in 1\.\.16 \(got 17\)/);
  assert.throws(() => h.spawn({ ...cartDesc(), net: 'cart', netId: 1, owner: 2 }), /net: 'cart' is an owner kind: owner must equal netId \(got owner 2, netId 1\)/);
  assert.throws(() => h.spawn({ net: 'boat', netId: 1 }), /net: unknown kind 'boat'/);
});
