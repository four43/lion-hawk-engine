// test/net-rejoin.test.mjs
// [N-18], [N-23], [T-22]: away, leave, rejoin and expiry (plan 2026-10-21-local-players-3, Task 8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp } from '../testing/index.js';
import seats, { seatsGame } from './net/fixtures/seats.js';

const at = (e, n) => e.players.find(p => p.number === n);

test('peerAway and peerBack mark a guest\'s players away and back, everything kept (N-23)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const g1 = w.guests[0], g2 = w.peers[2];
  w.hub.away(g1.net.id); w.seconds(0.5);
  assert.equal(at(w.host.engine, 2).away, true); assert.equal(at(g2.engine, 2).away, true, 'replicated');
  assert.ok(w.host.h.world.net.bindings.has(2));
  w.hub.back(g1.net.id); w.seconds(0.5);
  assert.equal(at(g2.engine, 2).away, false);
  assert.deepEqual([g2.h.events.of('player.away').map(e => e.number), g2.h.events.of('player.back').map(e => e.number)], [[2], [2]]);
});

test('a guest that leaves is inactive; back within rejoinSeconds with its key and a lower clock it gets its number and state back (N-23, T-22, review focus)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const H = w.host.engine, g1 = w.guests[0], g2 = w.peers[2];
  at(H, 2).score = 9; w.drop(g1); w.seconds(0.5);
  assert.equal(at(H, 2).active, false); assert.equal(w.host.h.world.net.bindings.has(2), false);
  assert.equal(w.host.h.world.net.find('dot', 2), undefined, 'its pawn went, as before');
  assert.equal(at(g2.engine, 2).active, false); assert.deepEqual(g2.h.events.of('player.inactive').map(e => e.number), [2]);
  w.rejoin(g1, { wall0: 0 }); w.seconds(1); // a real reload: its clock starts far below the old page's (S3)
  assert.ok(g1.engine.time.wall < w.host.engine.time.wall, 'the reload\'s clock is lower');
  assert.equal(g1.h.world.net.self, 2); assert.equal(at(g1.engine, 2).score, 9, 'the same record');
  assert.equal(at(H, 2).active, true);
  assert.deepEqual(w.host.h.events.of('player.joined').filter(e => e.number === 2).map(e => e.rejoined), [false, true]);
  assert.ok(g2.h.world.net.find('dot', 2), 'the new page\'s frames are not held back by the old clock');
});

test('a rejoin clears away with player.joined { rejoined: true } and no player.back (N-23, Task 1 pin)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const H = w.host.engine, g1 = w.guests[0], g2 = w.peers[2];
  w.hub.away(g1.net.id); w.seconds(0.2); w.drop(g1); w.seconds(0.5);
  assert.equal(at(H, 2).away, true, 'still away while inactive'); assert.equal(at(H, 2).active, false);
  w.rejoin(g1, { wall0: 0 }); w.seconds(1);
  for (const p of [w.host, g2]) {
    assert.equal(at(p.engine, 2).away, false, `${p.name}: away cleared`); assert.equal(at(p.engine, 2).active, true);
    assert.deepEqual(p.h.events.of('player.back').map(e => e.number), [], `${p.name}: the rejoin is the event, not back`);
    assert.deepEqual(p.h.events.of('player.joined').filter(e => e.number === 2).map(e => e.rejoined), [false, true], p.name);
  }
});

test('past rejoinSeconds the player expires; the number is free and starts fresh (N-23)', () => {
  const w = mp(seatsGame({ rejoinSeconds: 1 }), { peers: 3 }); w.seconds(1);
  const H = w.host.engine; at(H, 2).score = 9; const join = at(H, 2).join;
  w.drop(w.guests[0]); w.seconds(1.5);
  assert.equal(at(H, 2), undefined);
  assert.deepEqual(w.host.h.events.of('player.expired').map(e => e.number), [2]);
  assert.deepEqual(w.peers[2].h.events.of('player.expired').map(e => e.number), [2]);
  w.rejoin(w.guests[0]); w.seconds(1);
  assert.equal(at(H, 2).score, 0, 'a fresh record'); assert.notEqual(at(H, 2).join, join, 'a new joining of number 2');
});

test('while a player is inactive its number is held: a new page gets another (N-23)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1); w.drop(w.guests[0]); w.seconds(0.2);
  const late = w.addPeer(); w.seconds(1);
  assert.equal(late.h.world.net.self, 4);
});

test('the same key on another live peer is refused \'taken\'; once the old page is away the new one takes its player over, lower clock and all (N-18, N-23, S3, security, review focus)', () => {
  const w = mp(seats, { peers: 3 }); let k = 0, twin = null;
  const H = w.host.engine, old = w.guests[0], g2 = w.peers[2];
  // the old page's dot changes every step, so the watching guest holds a record as new as the room's clock (S3)
  const drive = p => (p === twin ? { x: 0.5 } : p === old ? { x: -0.5 - 0.1 * (k++ % 2) } : null);
  w.seconds(3, drive); at(H, 2).score = 9; w.seconds(0.2, drive);
  const entry = at(g2.engine, 2), join = entry.join;
  twin = w.addPeer({ key: old.key, wall0: 0 }); // knows old's key while old is live: never steals the seat
  w.seconds(1.5, drive);
  assert.equal(old.h.world.net.self, 2); assert.equal(w.host.h.world.net.bindings.get(2).peer, old.net.id, 'the live seat is kept');
  assert.equal(twin.h.world.net.self, 0, 'not welcomed');
  assert.ok(twin.h.events.of('player.refused').some(e => e.seat === 0 && e.reason === 'taken'));
  for (const p of [w.host, g2]) assert.ok(p.h.world.net.find('dot', 2).x < -4.9, `${p.name} still follows the live page's dot 2`);
  w.hub.away(old.net.id); w.seconds(1.5, drive); // a reload the server has not dropped yet: the old page is away
  assert.equal(twin.h.world.net.self, 2); assert.equal(w.host.h.world.net.bindings.get(2).peer, twin.net.id);
  assert.ok(twin.engine.time.wall < old.engine.time.wall - 3000, 'the new page\'s clock is over 3 s lower');
  for (const p of [w.host, g2]) assert.ok(Math.abs(p.h.world.net.find('dot', 2).x - 5) < 0.1, `${p.name} follows the new page's dot 2, not the stale one`);
  assert.equal(at(g2.engine, 2), entry, 'the watching guest keeps the same player entry'); assert.equal(entry.join, join); assert.equal(entry.score, 9);
  assert.equal(entry.away, false, 'the new page is not away');
  assert.deepEqual(g2.h.events.of('player.left').map(e => e.number), [], 'the player never left');
  assert.equal(g2.h.events.of('player.joined').filter(e => e.number === 2).length, 1, 'nor joined again');
});

test('a key never leaves the host: no roster entry or record carries it (N-18, review focus)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  for (const p of w.peers) for (const e of p.engine.players) assert.equal('key' in e, false, p.name);
  assert.equal('key' in seats.net.kinds.find(k => k.name === 'lh.player').fields, false);
  assert.deepEqual(w.host.h.world.net.bindings.get(2).key, [2, 0, 0, 0], 'the host has it');
  assert.equal(w.guests[0].h.world.net.bindings.size, 0, 'a guest binds nothing');
});

const spy = (p, pick) => { const out = [], send = p.net.send.bind(p.net); p.net.send = (to, d, r) => { const x = pick(to, d); if (x) out.push(x); return send(to, d, r); }; return out; };

test('a takeover tells the old page net.refused { seat, reason: \'taken\' } for each seat taken: back, it drops them (N-18, N-23, final review I1)', () => {
  const w = mp(seats, { peers: 3 }); w.seat(1, 'join', 1); w.seconds(1.5);
  const old = w.guests[0], H = w.host.h.world.net;
  assert.deepEqual([old.engine.controllerOf(0).player, old.engine.controllerOf(1).player], [2, 3]);
  const told = spy(w.host, (to, d) => to === old.net.id && d?.t === 'net.refused' && [d.seat, d.reason]);
  w.hub.away(old.net.id); w.step(1);
  const twin = w.addPeer({ key: old.key }); w.seat(twin, 'join', 1); w.seconds(1.5); // a page with the same key and both seats
  assert.deepEqual([twin.engine.controllerOf(0).player, twin.engine.controllerOf(1).player], [2, 3]);
  assert.deepEqual([H.bindings.get(2).peer, H.bindings.get(3).peer], [twin.net.id, twin.net.id]);
  assert.deepEqual(told, [[0, 'taken'], [1, 'taken']], 'one refusal per seat taken, sent at the takeover');
  w.hub.back(old.net.id); w.seconds(0.5); // a network blip, not a reload: the old page comes back and hears it
  assert.deepEqual(old.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[0, 'taken'], [1, 'taken']]);
  assert.equal(old.engine.controllerOf(1), undefined, 'the taken seat 1 left, as a refused seat does');
  assert.equal(old.h.world.net.self, 0, 'seat 0 is no longer the room\'s'); assert.deepEqual([...old.h.world.net.locals], []);
  const d2 = old.h.world.net.find('dot', 2); assert.ok(!d2 || old.h.world.net.remoteOf(d2), 'the old page owns no dot 2');
  assert.deepEqual([H.bindings.get(2).peer, H.bindings.get(3).peer], [twin.net.id, twin.net.id], 'the new page keeps both');
});

test('player.refused \'taken\' fires once per wait, not on every 1 s hello (N-23, final review I1)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const twin = w.addPeer({ key: w.guests[0].key });
  const hellos = spy(twin, (to, d) => d?.t === 'net.hello' && d);
  w.seconds(3.5);
  assert.ok(hellos.length >= 3, `it keeps asking (${hellos.length} hellos)`);
  assert.deepEqual(twin.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[0, 'taken']]);
});

test('a repeated net.refused \'taken\' for a seat above 0 emits player.refused once per seat (N-18, N-23, security minor)', () => {
  const w = mp(seats, { peers: 3 }); w.seat(1, 'join', 1); w.seconds(1.5);
  const old = w.guests[0];
  w.hub.away(old.net.id); w.step(1);
  const twin = w.addPeer({ key: old.key }); w.seat(twin, 'join', 1); w.seconds(1.5);
  w.hub.back(old.net.id); w.seconds(0.5);
  const seen = () => old.h.events.of('player.refused').map(e => [e.seat, e.reason]);
  assert.deepEqual(seen(), [[0, 'taken'], [1, 'taken']]);
  w.hub.away(old.net.id); w.step(1); w.hub.back(old.net.id); w.seconds(0.5); // the host tells it again on its peerBack
  for (let i = 0; i < 2; i++) w.host.net.send(old.net.id, { t: 'net.refused', seat: 1, reason: 'taken' }, true); // and the same refusal twice more
  w.seconds(0.5);
  assert.deepEqual(seen(), [[0, 'taken'], [1, 'taken']], 'a refusal for a seat already gone emits nothing');
});
