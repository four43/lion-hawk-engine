// test/mp-net.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import carts, { crateDesc } from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });

test('3i: w.drop(guest) leaves the room for good: it is not stepped and the host loses that player (T-11)', () => {
  const w = mp(carts, { peers: 3, argsOf }); w.seconds(1);
  const g1 = w.guests[0]; w.drop(g1); const step = g1.engine.time.step; w.seconds(0.5);
  assert.equal(g1.dropped, true); assert.equal(g1.engine.time.step, step, 'a dropped peer is not stepped');
  assert.deepEqual(w.live.map(p => p.name), ['host', 'guest2']);
  assert.deepEqual([...w.host.h.world.net.players.values()], [3]);
  assert.throws(() => w.drop(g1), /mp: guest1 is already dropped/);
  assert.throws(() => w.drop(9), /mp: no such peer/);
});
test('3i: w.blackout(s, { kinds }) drops only frames carrying those kinds, then lifts', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  const H = w.host.h.world.net, b = w.guests[0].h.world.net.find('crate', 1), cart = w.guests[0].h.world.net.find('cart', 2);
  const frames = () => w.host.h.world.net.stats.frames;
  w.blackout(1, { kinds: ['crate'] }); w.host.h.place(H.find('crate', 1), { at: [6, 0.3, 4] });
  const f0 = frames(); w.seconds(0.9);
  assert.ok(b.xf.p.x < -0.9, 'no crate frame got through'); assert.ok(frames() > f0, 'the guest\'s cart frames still reach the host');
  w.seconds(2.5); assert.ok(Math.abs(b.xf.p.x - 6) < 0.02, 'after the blackout a keyframe heals it'); assert.ok(cart);
  assert.throws(() => w.blackout(1, { kinds: ['nope'] }), /mp: blackout: unknown kind 'nope'/);
});
test('3i: w.diverged({ agree }) lists replicas off their authority or missing; settle() can wait on it', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.seconds(1.5);
  assert.deepEqual(w.diverged({ agree: { cart: 0.05, crate: 0.05, flag: 0.01 } }), []);
  w.blackout(1); w.host.h.place(w.host.h.world.net.find('crate', 1), { at: [6, 0.3, 4] });
  w.host.h.spawn({ ...crateDesc(), net: 'crate', netId: 3, at: [0, 0.3, 7], hue: 3 }); w.seconds(0.5);
  assert.deepEqual(w.diverged({ agree: { crate: 0.05 } }).map(x => [x.kind, x.netId, x.peer, x.missing ?? x.d > 6]),
    [['crate', 1, 'guest1', true], ['crate', 3, 'guest1', true]]);
  assert.deepEqual(w.settle(x => x.diverged({ agree: { crate: 0.05 } }), { maxSeconds: 4 }), []);
  assert.throws(() => w.diverged({}), /mp: diverged needs \{ agree: \{ kind: metres \} \}/);
  assert.throws(() => w.diverged({ agree: { nope: 1 } }), /mp: diverged: unknown kind 'nope'/);
});
