// test/net-join.test.mjs
// [N-19], [N-20], [N-24], [N-25]: the engine join (plan 2026-10-21-local-players-3, Task 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp, replay } from '../testing/index.js';
import { createRegistry, decodeFrame, kind, F } from '../src/index.sim.js';
import { createMemoryHub, createPort } from '../src/index.net.js';
import RAPIER from '@dimforge/rapier3d-compat';
import seats, { seatsGame, pawnsGame } from './net/fixtures/seats.js';

await RAPIER.init(); // the pawns room (Task 5's note) has bodies

const spy = (p, pick) => { const out = [], send = p.net.send.bind(p.net); p.net.send = (to, d, r) => { const x = pick(d); if (x) out.push(x); return send(to, d, r); }; return out; };

test('the engine joins guests in hello order; a guest\'s seat 0 is renumbered (N-19, N-20, N-25)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const H = w.host.h.world.net, [g1, g2] = w.guests;
  assert.deepEqual([...H.bindings].map(([n, b]) => [n, b.peer, b.key, b.seat]), [[2, g1.net.id, [2, 0, 0, 0], 0], [3, g2.net.id, [3, 0, 0, 0], 0]]);
  assert.equal(g1.h.world.net.self, 2); assert.equal(g1.engine.controllerOf(0).player, 2); assert.deepEqual([...g2.h.world.net.locals], [3]);
  assert.deepEqual(g1.h.events.of('player.renumbered').map(e => [e.seat, e.from, e.to]), [[0, 1, 2]]);
  for (const p of w.peers) for (const n of [1, 2, 3]) assert.ok(p.h.world.net.find('dot', n), `${p.name} has dot ${n}`);
});

test('a guest\'s second seat asks with net.seat; its records ride seat 0\'s frame (N-19, N-24)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const g = w.guests[0], reg = createRegistry(seats.net.kinds, { maxSender: 8 });
  const frames = spy(g, d => d instanceof ArrayBuffer && decodeFrame(d, reg));
  w.seat(1, 'join', 1); w.seconds(0.5);
  assert.equal(g.engine.controllerOf(1).player, 4, 'the host gave the lowest free number');
  assert.deepEqual([...g.h.world.net.locals], [2, 4]);
  assert.deepEqual(w.host.h.world.net.bindings.get(4), { peer: g.net.id, key: [2, 0, 0, 0], seat: 1 });
  assert.ok(frames.length && frames.every(f => f.sender === 2), 'one sender: the peer\'s seat 0');
  assert.ok(frames.some(f => [...(f.groups.get('dot')?.records.keys() ?? [])].join() === '2,4'), 'both seats in one frame');
  assert.ok(w.peers[2].h.world.net.find('dot', 4), 'relayed to the other guest');
  w.seconds(0.5, [null, { 1: { x: 0.5 } }]);
  assert.ok(Math.abs(w.host.h.world.net.find('dot', 4).x - 5) < 0.1, 'seat 1\'s input moves its own dot');
});

test('a guest that joins with two seats is renumbered without a clash (N-25, review focus)', () => {
  const w = mp(seats, { peers: 2 }); w.seat(1, 'join', 1); w.seconds(1); // seat 1 took 2 before the welcome said seat 0 is 2
  const g = w.guests[0];
  assert.deepEqual([g.engine.controllerOf(0).player, g.engine.controllerOf(1).player], [2, 3]);
  assert.deepEqual(g.h.events.of('player.renumbered').map(e => [e.seat, e.from, e.to]), [[0, 1, 2], [1, 2, 3]]);
  assert.deepEqual([...g.h.world.net.locals], [2, 3]);
});

test('a seat that joins between the hello and the welcome is asked for after the welcome (N-19, N-25, S1)', () => {
  const w = mp(seats, { peers: 2 }); w.step(1); // step 1: the first hello goes out, with seat 0 only
  w.seat(1, 'join', 1); w.seconds(1); // step 2: seat 1 joins on number 2 (free on this page); step 3: the welcome names seat 0 alone
  const g = w.guests[0];
  assert.deepEqual([g.engine.controllerOf(0).player, g.engine.controllerOf(1).player], [2, 3]);
  assert.deepEqual([...g.h.world.net.locals], [2, 3]);
  assert.deepEqual(w.host.h.world.net.bindings.get(3), { peer: g.net.id, key: [2, 0, 0, 0], seat: 1 });
  assert.deepEqual(g.h.events.of('player.renumbered').map(e => [e.seat, e.from, e.to]), [[0, 1, 2], [1, 2, 3]], 'seat 1 reports its number from before it moved aside');
});

test('the host\'s own second seat is admitted like a guest\'s (N-19, N-20)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  w.seat(0, 'join', 1); w.seconds(0.5);
  assert.equal(w.host.engine.controllerOf(1).player, 3, 'player 2 is the guest');
  assert.deepEqual([...w.host.h.world.net.locals], [1, 3]);
  assert.ok(w.guests[0].h.world.net.find('dot', 3), 'the host\'s frame carries both of its seats');
  assert.deepEqual(w.host.engine.players.map(p => [p.number, p.seat, p.local]), [[1, 0, true], [2, 0, false], [3, 1, true]]);
});

test('maxPlayers and maxSeats refuse with a reason; a refused page stops asking (N-19)', () => {
  const w = mp(seatsGame({ maxPlayers: 2, maxSeats: 1 }), { peers: 3 }); w.seconds(1);
  const [g1, g2] = w.guests;
  assert.deepEqual(g2.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[0, 'full']]);
  assert.equal(g2.h.world.net.self, 0); assert.equal(w.host.h.world.net.bindings.size, 1);
  const hellos = spy(g2, d => d?.t === 'net.hello' && d); w.seconds(2); assert.equal(hellos.length, 0);
  w.seat(1, 'join', 1); w.seconds(0.5);
  assert.equal(g1.engine.controllerOf(1), undefined, 'the refused seat left');
  assert.deepEqual(g1.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[1, 'seats']]);
});

test('a game\'s admit decides; a taken number refuses a guest\'s seat \'admit\' and is loud only for the host\'s own (N-19, N9)', () => {
  const w = mp(seatsGame({ reasons: ['locked'], admit: ({ key }) => key[0] === 3 ? { refuse: 'locked' } : 7 }), { peers: 3 }); w.seconds(1);
  const g = w.guests[0];
  assert.equal(g.h.world.net.self, 7);
  assert.deepEqual(w.guests[1].h.events.of('player.refused').map(e => e.reason), ['locked']);
  const warned = [], cw = console.warn; console.warn = (...a) => warned.push(a);
  try { w.seat(1, 'join', 1); w.seconds(0.5); } finally { console.warn = cw; } // a guest's request: the host keeps stepping
  assert.deepEqual(g.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[1, 'admit']]);
  assert.equal(g.engine.controllerOf(1), undefined, 'the refused seat left');
  const admitWarns = warned.filter(([k]) => /admit refused a seat of/.test(k));
  assert.equal(admitWarns.length, 1, 'warned once'); assert.match(admitWarns[0][1].message, /player 7 is taken/);
  assert.deepEqual([...w.host.h.world.net.bindings.keys()], [7]);
  w.seat(0, 'join', 1); // the host's own seat: a game bug, thrown
  assert.throws(() => w.step(1), /net\.admit: player 7 is taken/);
});

test('a game admit that throws on a guest\'s seat refuses it; the host keeps stepping (N-19)', () => {
  const w = mp(seatsGame({ admit: ({ seat }) => { if (seat === 1) throw new Error('boom'); return 2; } }), { peers: 2 }); w.seconds(1);
  const g = w.guests[0], cw = console.warn; console.warn = () => {};
  try { w.seat(1, 'join', 1); w.seconds(0.5); } finally { console.warn = cw; }
  assert.deepEqual(g.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[1, 'admit']]);
  assert.equal(w.host.h.world.net.bindings.size, 1);
});

test('one hello asking past maxSeats gets one \'seats\' refusal, not one per seat (DoS)', () => {
  const w = mp(seats, { peers: 1 }); w.step(1);
  const g = w.addPeer(), H = w.host, out = spy(H, d => d?.t && d);
  g.net.send = (send => (to, d, r) => d?.t === 'net.hello' && d.seats.length < 16 ? undefined : send(to, d, r))(g.net.send.bind(g.net)); // its own hellos are lost
  g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [...Array(16).keys()], schema: seats.net.schema }, true);
  w.step(3);
  assert.deepEqual(out.filter(m => m.t === 'net.refused').map(m => [m.seat, m.reason]), [[4, 'seats']]);
  assert.deepEqual(out.filter(m => m.t === 'net.welcome').map(m => m.players.map(p => p.seat)), [[0, 1, 2, 3]], 'maxSeats 4');
});

test('net.seat ops closer than 0.5 s are refused \'busy\' and do nothing; the guest asks again (DoS)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const g = w.guests[0], reg = createRegistry(seats.net.kinds, { maxSender: 8 }), H = w.host.h.world.net;
  const keys = spy(w.host, d => d instanceof ArrayBuffer && decodeFrame(d, reg)?.key && decodeFrame(d, reg).sender === 1);
  const refused = spy(w.host, d => d?.t === 'net.refused' && d);
  w.seat(1, 'join', 1); for (let i = 0; i < 20 && !g.h.world.net.locals.has(4); i++) w.step(1); // welcomed
  assert.equal(g.h.world.net.locals.has(4), true);
  w.seat(1, 'leave', 1); w.step(1); w.seat(1, 'join', 1); w.step(5); // churn inside the cooldown
  assert.deepEqual(refused.map(m => [m.seat, m.reason]), [[1, 'busy'], [1, 'busy']]);
  assert.equal(keys.length / 2, 1, 'one keyframe burst (to each of the two guests), not two');
  assert.equal(H.bindings.get(4)?.seat, 1, 'the busy leave did nothing');
  assert.equal(g.h.events.of('player.refused').length, 0, 'busy is not a refusal of the seat');
  w.seconds(1.5); // the retry: seat 1 has rejoined, so it asks for its number again and gets the same one
  assert.equal(g.engine.controllerOf(1).player, 4); assert.deepEqual([...g.h.world.net.locals], [2, 4]);
  w.seat(1, 'leave', 1); w.seconds(1.5);
  assert.equal(H.bindings.has(4), false, 'a leave after the cooldown unbinds');
});

test('a hello with another schema is refused; a repeated hello gets the same answer (N-6, N-19, M-19)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const g = w.guests[0];
  g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [0], schema: (seats.net.schema + 1) >>> 0 }, true);
  g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [0], schema: seats.net.schema }, true);
  w.seconds(0.3);
  assert.deepEqual(g.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[0, 'schema']]);
  assert.deepEqual([...w.host.h.world.net.bindings.keys()], [2], 'no second number for the same seat');
});

test('a hello without seat 0 is refused whole and binds nothing (N-19, S5)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const g = w.guests[0];
  g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [1, 2], schema: seats.net.schema }, true);
  w.seconds(0.3);
  assert.deepEqual(g.h.events.of('player.refused').map(e => [e.seat, e.reason]), [[0, 'seats']]);
  assert.deepEqual(w.host.h.events.of('player.joined').map(e => e.number), [2], 'seats 1 and 2 never got numbers');
  assert.deepEqual([...w.host.h.world.net.bindings].map(([n, b]) => [n, b.seat]), [[2, 0]]);
});

test('a page that was a guest hosts with seat 0 as player 1, in the controllers and the roster (N-20, S6)', () => {
  const w = mp(seats, { peers: 2 }); w.seat(1, 'join', 1); w.seconds(1); // the guest's seats are 2 and 3
  const g = w.guests[0]; w.drop(w.host); w.seconds(0.2);
  assert.equal(g.h.world.net.role, 'solo'); assert.deepEqual(g.engine.players.map(p => p.number), [2, 3], 'solo keeps the room\'s numbers');
  const hub = createMemoryHub(); createPort(g.engine, { transport: hub.host(), role: 'host', clock: () => hub.now, key: g.key }); g.h.step(1);
  assert.deepEqual([g.engine.controllerOf(0).player, g.engine.controllerOf(1).player], [1, 3]);
  assert.deepEqual(g.h.events.of('player.renumbered').map(e => [e.seat, e.from, e.to]), [[0, 1, 2], [1, 2, 3], [0, 2, 1]]);
  assert.deepEqual(g.engine.players.map(p => [p.number, p.seat, p.local]), [[1, 0, true], [3, 1, true]]);
  assert.deepEqual([...g.h.world.net.locals], [1, 3]); assert.equal(g.h.world.net.self, 1);
});

test('a guest seat that leaves is unbound on the host; its dot goes everywhere (N-19)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1); w.seat(1, 'join', 1); w.seconds(0.5);
  w.seat(1, 'leave', 1); w.seconds(0.5);
  assert.equal(w.host.h.world.net.bindings.has(4), false);
  assert.equal(w.host.h.world.net.find('dot', 4), undefined); assert.equal(w.peers[2].h.world.net.find('dot', 4), undefined);
});

test('every peer\'s tape of an engine join replays alone (T-9, #78, N-18)', () => {
  const w = mp(seats, { peers: 2, record: true }); w.seconds(1); w.seat(1, 'join', 1); w.step(1); // the seat exists once its lh.seat ran
  w.seconds(1, [null, { 0: { x: 1 }, 1: { x: -1 } }]);
  for (const p of w.peers) assert.equal(replay(seats, p.h.tape()).checksum(), p.h.checksum(), p.name);
});

// ---- carried items (Task 4's note, Task 5's note, plan 2's M4) ----

test('the peer key never reaches a guest: no message or frame a guest receives carries a key word (N-18, Task 4 note)', () => {
  const K = [[0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f], [0x1f83d9ab, 0x5be0cd19, 0x6a09e667, 0xcbbb9d5d]]; // distinctive words: no frame field holds one by chance
  const w = mp(seats, { peers: 1 });
  const got = []; w.hub.drop = (from, to, data) => { if (to !== w.host.net.id) got.push(data); return false; };
  w.addPeer({ key: K[0] }); w.addPeer({ key: K[1] });
  w.seconds(1); w.seat(1, 'join', 1); w.seat(2, 'join', 1); w.step(1); w.seconds(1, [null, { 0: { x: 1 }, 1: { x: -1 } }, { 0: { x: 0.5 } }]);
  w.seat(1, 'leave', 1); w.seconds(0.5);
  assert.deepEqual([...w.host.h.world.net.bindings.values()].map(b => b.key), [K[0], K[1], K[1]], 'the host holds the guests\' keys (guest1\'s seat 1 left)');
  const frames = got.filter(d => d instanceof ArrayBuffer), msgs = got.filter(d => !(d instanceof ArrayBuffer));
  assert.ok(frames.length > 10 && msgs.some(m => JSON.stringify(m).includes('net.welcome')), 'the guests heard frames and welcomes');
  const words = K.flat();
  for (const d of frames) {
    const v = new DataView(d);
    for (let i = 0; i + 4 <= d.byteLength; i++) for (const k of words) assert.ok(v.getUint32(i, true) !== k && v.getUint32(i, false) !== k, 'a frame carries a key word');
  }
  for (const m of msgs) { const s = JSON.stringify(m); for (const k of words) assert.ok(!s.includes(String(k)), `a message carries a key word: ${s}`); }
});

test('a guest with two seats joins through the engine join; a third peer sees both pawns move as driven remotes (N-19, N-24, Task 5 note)', () => {
  const g = pawnsGame(), w = mp(g, { peers: 3 }); w.seat(1, 'join', 1); w.seconds(1);
  const [a, b] = w.guests;
  assert.deepEqual([a.engine.controllerOf(0).player, a.engine.controllerOf(1).player], [2, 3]);
  assert.deepEqual([...w.host.h.world.net.bindings].map(([n, x]) => [n, x.peer, x.seat]), [[2, a.net.id, 0], [3, a.net.id, 1], [4, b.net.id, 0]]);
  const B = b.h.world.net, at = n => B.find('pawn', n).xf.p.x;
  const x0 = [at(2), at(3)];
  w.seconds(1.5, [null, { 0: { x: 1 }, 1: { x: -1 } }, null]);
  for (const n of [2, 3]) assert.equal(B.remoteOf(B.find('pawn', n))?.kind.remote, 'driven', `pawn ${n} is a driven replica on the third peer`);
  assert.ok(at(2) - x0[0] > 1, `seat 0's pawn moved +x (${x0[0]} -> ${at(2)})`);
  assert.ok(at(3) - x0[1] < -1, `seat 1's pawn moved -x (${x0[1]} -> ${at(3)})`);
  const A = a.h.world.net;
  for (const n of [2, 3]) assert.ok(Math.abs(A.find('pawn', n).xf.p.x - at(n)) < 0.5, `the third peer follows the owner's pawn ${n}`);
});

test('a refused seat is visible to the view: player.refused on the host for its own seat, the guest\'s seat leaves (M4)', () => {
  const w = mp(seatsGame({ maxSeats: 1 }), { peers: 2 }); w.seconds(1);
  w.seat(0, 'join', 1); w.step(1);
  assert.equal(w.host.engine.controllerOf(1), undefined, 'the host\'s seat 1 was not admitted');
  assert.deepEqual(w.host.h.events.of('player.refused').map(e => [e.seat, e.reason, e.local]), [[1, 'seats', true]]);
  const g = w.guests[0]; w.seat(1, 'join', 1); w.step(1);
  assert.ok(g.engine.controllerOf(1), 'a guest\'s seat plays at once while it asks');
  w.seconds(0.3);
  assert.equal(g.engine.controllerOf(1), undefined, 'refused: the controller is gone');
  assert.deepEqual(g.h.events.of('player.refused').map(e => [e.seat, e.reason, e.local]), [[1, 'seats', true]]);
});

// ---- the final review's fixes (plan 3) ----

test('a welcomed peer\'s hello answers only its numbers: new seats must use net.seat and its cooldown (final review M1, DoS)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const g = w.guests[0], out = spy(w.host, d => d?.t && d);
  for (let i = 0; i < 3; i++) g.engine.net.send(g.net.hostId, { t: 'net.hello', key: [2, 0, 0, 0], seats: [0, 1, 2, 3], schema: seats.net.schema }, true);
  w.step(3);
  assert.deepEqual([...w.host.h.world.net.bindings].map(([n, b]) => [n, b.seat]), [[2, 0]], 'no new seat bound by a hello');
  assert.deepEqual(out.filter(m => m.t === 'net.welcome').map(m => m.players.map(p => [p.seat, p.number])), [[[0, 2]], [[0, 2]], [[0, 2]]]);
  assert.deepEqual(out.filter(m => m.t === 'net.refused'), [], 'and no refusal');
});

test('net.reasons joins the schema hash: two configs that differ only in reasons do not join (final review M2, N-6)', () => {
  assert.notEqual(seatsGame({ reasons: ['locked'] }).net.schema, seats.net.schema);
  assert.notEqual(seatsGame({ reasons: ['locked'] }).net.schema, seatsGame({ reasons: ['banned'] }).net.schema);
  assert.equal(seatsGame({ reasons: ['locked'] }).net.schema, seatsGame({ reasons: ['locked'] }).net.schema);
});

test('a second net.open on the host leaves no ghost roster entry of the old room\'s guests (final review M3)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const H = w.host;
  assert.deepEqual(H.engine.players.map(p => p.number), [1, 2]);
  const hub = createMemoryHub(); createPort(H.engine, { transport: hub.host(), role: 'host', clock: () => hub.now, key: H.key }); H.h.step(1); // no closed in between
  assert.deepEqual(H.engine.players.map(p => [p.number, p.local]), [[1, true]], 'the old guest\'s entry is gone');
  assert.deepEqual([...H.h.world.net.locals], [1]);
});

test('a number given again is relayed only after its old object\'s removals: the first relayed frame of the new owner is taken and no stale entry stays (S3, relay leaving)', () => {
  // dots sent every step, so the new owner's first record reaches the host while the old object's REPEAT removals are still going out
  const DOT60 = kind({ name: 'dot', code: 1, authority: 'owner', remote: 'view', max: 8, idMin: 1, idMax: 8, send: { hz: 60 }, fields: { x: F.fixed(-10, 10, 1 / 64) } });
  const game = seatsGame({ kinds: [DOT60] }), reg = createRegistry(game.net.kinds, { maxSender: 8 });
  const w = mp(game, { peers: 3 }); let k = 0, twin = null;
  const old = w.guests[0], g2 = w.peers[2];
  const drive = p => (p === twin ? { x: 0.5 } : p === old ? { x: -0.5 - 0.1 * (k++ % 2) } : null); // old's dot changes every step (S3)
  w.seconds(3, drive);
  const stale = g2.h.world.net.find('dot', 2);
  let step = 0; const sent = []; // the host's frames of number 2 to the watching guest: [step, records, removed]
  const send = w.host.net.send.bind(w.host.net);
  w.host.net.send = (to, d, r) => {
    if (to === g2.net.id && d instanceof ArrayBuffer) { const f = decodeFrame(d, reg), g = f?.groups.get('dot'); if (f?.sender === 2 && g) sent.push([step, g.records.size, g.removed.length]); }
    return send(to, d, r);
  };
  w.hub.away(old.net.id); w.step(1, drive);
  twin = w.addPeer({ key: old.key, wall0: 0 }); // the same key, a far lower clock: it takes player 2 over
  const xs = [];
  for (step = 1; step <= 12; step++) { w.step(1, drive); const d = g2.h.world.net.find('dot', 2); xs.push(d ? d.x : null); }
  const firstRec = sent.findIndex(x => x[1] > 0 && x[0] > 1), lastRem = sent.findLastIndex(x => x[2] > 0);
  assert.ok(lastRem >= 0 && firstRec > lastRem, `no record of 2 relayed before its old removals are out (${JSON.stringify(sent)})`);
  assert.equal(xs[sent[firstRec][0]], 5, `the first relayed record is taken at once (sent at step ${sent[firstRec][0]}; seen ${xs.join()})`);
  assert.ok(xs.slice(sent[firstRec][0]).every(x => x === 5), `nothing stale after it (${xs.join()})`);
  assert.notEqual(g2.h.world.net.find('dot', 2), stale, 'a new replica');
  assert.equal(g2.h.world.with('net').filter(e => e.net === 'dot' && e.netId === 2).length, 1, 'one dot 2');
});

test('world.net.numbersOf(peer): a peer\'s numbers, frozen, reused until they change; empty for an unknown peer (plan 5)', () => {
  const w = mp(seats, { peers: 3 }); w.seat(1, 'join', 1); w.seconds(1.5);
  const H = w.host.h.world.net, [a, b] = w.guests;
  const na = H.numbersOf(a.net.id);
  assert.deepEqual([...na], [2, 3]); assert.ok(Object.isFrozen(na)); assert.equal(H.numbersOf(a.net.id), na, 'the same array until a change');
  assert.deepEqual([...H.numbersOf(b.net.id)], [4]);
  assert.deepEqual([...H.numbersOf('nobody')], []); assert.ok(Object.isFrozen(H.numbersOf('nobody')));
  w.seat(a, 'leave', 1); w.seconds(0.7);
  assert.deepEqual([...H.numbersOf(a.net.id)], [2], 'seat 1 left');
  assert.deepEqual([...w.guests[0].h.world.net.numbersOf(a.net.id)], [], 'a guest binds nothing');
});
