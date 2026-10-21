// test/net-state.test.mjs
// [N-21], [N-22]: the roster and the game state, from the host to every peer (plan 2026-10-21-local-players-3, Task 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import { createRegistry, decodeFrame, kind, F } from '../src/index.sim.js';
import seats, { seatsGame, DOT } from './net/fixtures/seats.js';
import carts, { CART, CRATE, FLAG } from './net/fixtures/carts.js';
await RAPIER.init();

test('the roster and the game state reach every guest from the host (N-21, N-22)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const H = w.host.engine; H.players.find(p => p.number === 2).score = 7; H.gameState.round = 3; w.seconds(0.5);
  for (const g of w.guests) {
    assert.deepEqual(g.engine.players.map(p => [p.number, p.seat, p.active, p.away, p.score]), [[1, 0, true, false, 0], [2, 0, true, false, 7], [3, 0, true, false, 0]]);
    assert.equal(g.engine.gameState.round, 3);
    assert.deepEqual(g.engine.players.filter(p => p.local).map(p => p.number), [g.h.world.net.self]);
  }
});

test('a late joiner gets the game state and every player at once (N-22; the engine half of T-25)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1); w.host.engine.gameState.round = 5; w.seconds(3); // past a keyframe: no diff is pending
  const late = w.addPeer(); w.seconds(0.5);
  assert.equal(late.engine.gameState.round, 5); assert.deepEqual(late.engine.players.map(p => p.number), [1, 2, 3]);
});

test('guests hear roster events: joined for each player, left when a seat leaves (N-21)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1); const g2 = w.peers[2];
  assert.deepEqual(g2.h.events.of('player.joined').map(e => [e.number, e.local]).sort(), [[1, false], [2, false], [3, true]]);
  w.seat(1, 'join', 1); w.seconds(0.5); w.seat(1, 'leave', 1); w.seconds(0.5);
  assert.deepEqual(g2.h.events.of('player.left').map(e => e.number), [4]);
  assert.equal(g2.engine.players.some(p => p.number === 4), false);
});

test('only the engine writes lh.player and lh.game (N-22, E-7)', () => {
  const w = mp(seats, { peers: 1 }); w.step(1);
  assert.throws(() => w.host.h.spawn({ net: 'lh.player', netId: 2 }), /net: 'lh\.player' is the engine's: write engine\.players or engine\.gameState \(N-22\)/);
});

test('going solo keeps this page\'s players and drops the others (N-25)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1); w.drop(w.host); w.seconds(0.2);
  const g = w.guests[0];
  assert.equal(g.h.world.net.role, 'solo'); assert.deepEqual(g.engine.players.map(p => p.number), [2]); assert.equal(g.h.world.net.self, 2);
  assert.deepEqual(g.h.events.of('player.left').map(e => e.number).sort(), [1, 3]);
});

test('a manual join replicates no lh.player or lh.game: the game\'s own registry reads every host frame (B3, N-22)', () => {
  const w = mp(carts, { peers: 2, argsOf: i => ({ n: i + 1 }) });
  const own = createRegistry([CART, CRATE, FLAG], { maxSender: 4 }), frames = [], send = w.host.net.send.bind(w.host.net); // Tractor's way (game/net.js:41)
  w.host.net.send = (to, d, r) => { if (d instanceof ArrayBuffer) frames.push(decodeFrame(d, own)); return send(to, d, r); };
  w.seconds(2.5); // past a second keyframe
  assert.deepEqual(carts.net.kinds.map(k => k.name), ['cart', 'crate', 'flag']);
  assert.ok(frames.length && frames.every(f => f !== null), 'no frame has a group the game\'s registry does not know');
  assert.ok(frames.some(f => f.key), 'keyframes included');
  assert.deepEqual(w.host.engine.players.map(p => p.number), [1, 2], 'the host\'s roster still follows its bindings');
  assert.deepEqual(w.guests[0].engine.players, [], 'engine.players stays host-local');
});

// Security (Task 6 ruling, carried): a guest's records must never halt the host. Each hook throws on a dot with x > 5; the guest's
// seat 1 sends one (x 10) in the same frames as seat 0's good dot (x 2)
const bad = rec => { if (rec.x > 5) throw new Error('bad dot'); };
const hooks = {
  spawn: { spawn: rec => { bad(rec); return {}; } },
  spawned: { spawned: (e, w, rec) => bad(rec) }, // after world.spawn: the half-built replica must go
  apply: { apply: (e, rec) => { bad(rec); e.x = rec.x; } },
};
for (const [hook, extra] of Object.entries(hooks)) {
  test(`a guest's record that makes the kind's ${hook} hook throw is dropped and warned once; the host keeps stepping (security)`, () => {
    const D = kind({ name: 'dot', code: 1, authority: 'owner', remote: 'view', max: 8, idMin: 1, idMax: 8, fields: DOT.fields, ...extra });
    const w = mp(seatsGame({ kinds: [D] }), { peers: 2 }); w.seconds(1);
    w.seat(1, 'join', 1); w.step(1); // seat 1 is there, not yet the room's: its dot's first record has x 10
    const warned = [], cw = console.warn; console.warn = (...a) => warned.push(a);
    try { w.seconds(3, [null, { 0: { x: 0.2 }, 1: { x: 1 } }]); } finally { console.warn = cw; } // past a keyframe: the bad record comes again
    const H = w.host.h.world, good = H.net.find('dot', 2);
    assert.equal(good?.x, 2, 'the good record applied');
    assert.equal(warned.filter(([k]) => /'dot' record of .* dropped/.test(k)).length, 1, 'one warning');
    assert.ok(warned.some(([, err]) => /bad dot/.test(err?.message)));
    if (hook !== 'apply') assert.equal(H.with('net').filter(e => e.net === 'dot' && e.netId === 3).length, 0, 'no stray entity');
    w.step(1); // still stepping
  });
}

test('a record from the host that makes a hook throw stays loud on a guest: host data is trusted (security)', () => {
  // the host relays guest 1's bad dot; guest 2 builds it from the host's frame and throws (a game bug there stays visible)
  const D = kind({ name: 'dot', code: 1, authority: 'owner', remote: 'view', max: 8, idMin: 1, idMax: 8, fields: DOT.fields, ...hooks.spawn });
  const w = mp(seatsGame({ kinds: [D] }), { peers: 3 }); w.seconds(1);
  w.seat(1, 'join', 1); w.step(1);
  const cw = console.warn; console.warn = () => {};
  try { assert.throws(() => w.seconds(1, [null, { 0: { x: 0 }, 1: { x: 1 } }]), /bad dot/); } finally { console.warn = cw; }
});

test('one hello whose seat the game admit throws on gets one \'admit\' refusal, not one per seat (DoS)', () => {
  const w = mp(seatsGame({ admit: ({ seat }) => { if (seat >= 1) throw new Error('boom'); return 2; } }), { peers: 2 }); w.seconds(1);
  const g = w.guests[0], H = w.host, out = [], send = H.net.send.bind(H.net);
  H.net.send = (to, d, r) => { if (d?.t) out.push(d); return send(to, d, r); };
  const cw = console.warn; console.warn = () => {};
  try {
    g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [0, 1, 2, 3], schema: seats.net.schema }, true);
    w.step(3);
  } finally { console.warn = cw; }
  assert.deepEqual(out.filter(m => m.t === 'net.refused').map(m => [m.seat, m.reason]), [[1, 'admit']]);
  assert.deepEqual(out.filter(m => m.t === 'net.welcome').map(m => m.players.map(p => p.seat)), [[0]]);
});
