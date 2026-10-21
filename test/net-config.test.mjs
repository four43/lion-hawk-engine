// test/net-config.test.mjs
// [N-6], [N-19], [N-22]: the engine's join options, kinds, messages and schema hash (plan 2026-10-21-local-players-3, Task 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, F, kind, wireCodec, checkSchema } from '../src/index.sim.js';

const BOXDEF = { name: 'box', code: 1, authority: 'host', max: 4, idMax: 3, fields: { n: F.uint(1) } }, BOX = kind(BOXDEF);
const RATES = { host: { reliable: 9, fast: 9 }, guest: { reliable: 9, fast: 9 } };
const base = (net = {}, extra = {}) => defineGame({
  id: 'cfg', start: 's', scenes: { s: {} }, player: { score: F.uint(2) }, gameState: { round: F.uint(1) },
  commands: { 'host.hi': { schema: { n: F.uint(1) }, handler() {} } }, ...extra,
  net: { kinds: [BOX], maxSender: 8, codec: 'json', rates: RATES, wire: { toHost: { hi: 'host.hi' }, toGuest: {} }, ...net },
});

test('defaults, and the built-in kinds after the game\'s (N-19, N-22)', () => {
  const n = base().net;
  assert.deepEqual([n.join, n.maxPlayers, n.maxSeats, n.rejoinSeconds, n.admit], ['engine', 8, 4, 60, undefined]);
  assert.deepEqual(n.reasons, ['full', 'seats', 'schema', 'admit', 'busy', 'taken']);
  assert.deepEqual(n.kinds.map(k => [k.name, k.code]), [['box', 1], ['lh.player', 255], ['lh.game', 254]]);
  assert.deepEqual(Object.keys(n.kinds[1].fields), ['seat', 'away', 'active', 'join', 'score'], 'no key field: it never leaves the host (N-18)');
  assert.equal(n.kinds[1].idMax, 8); assert.deepEqual(Object.keys(n.kinds[2].fields), ['round']);
  assert.deepEqual(base({ reasons: ['locked'] }).net.reasons, ['full', 'seats', 'schema', 'admit', 'busy', 'taken', 'locked']);
  assert.deepEqual(base({ join: 'manual' }).net.kinds.map(k => k.name), ['box'], 'a manual join adds no engine kinds: a game registry reads its frames (B3)');
});

test('the join messages are schema\'d commands with wire tags after the game\'s (N-19, N-3)', () => {
  const g = base();
  assert.deepEqual(g.net.wire.toHost, { hi: 'host.hi', 'net.hello': 'net.hello', 'net.seat': 'net.seat' });
  assert.deepEqual(g.net.wire.toGuest, { 'net.welcome': 'net.welcome', 'net.refused': 'net.refused' });
  const table = Object.fromEntries(Object.entries(g.net.wire.toGuest).map(([tag, type]) => [tag, g.schemas[type]]));
  const bin = wireCodec(table, { codec: 'binary' }), m = { players: [{ seat: 0, number: 2 }, { seat: 1, number: 5 }] };
  assert.deepEqual(bin.decode(bin.encode('net.welcome', m)), { tag: 'net.welcome', data: m });
  assert.equal(checkSchema(g.schemas['net.hello'], { key: [1, 2, 3], seats: [0], schema: 1 }), null, 'a key is four words');
  assert.equal(checkSchema(g.schemas['net.seat'], { op: 'join', seat: 16 }), null, 'a bad seat is dropped at the port, never thrown mid-step');
  assert.ok(checkSchema(g.schemas['net.refused'], { reason: 'full', seat: 0 }));
});

test('the schema hash changes with any kind field, and is a uint32 (N-6)', () => {
  const s = base().net.schema;
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff); assert.equal(base().net.schema, s);
  assert.notEqual(base({}, { player: { score: F.uint(2), name: F.bool() } }).net.schema, s, 'a player field');
  assert.notEqual(base({}, { gameState: { round: F.uint(2) } }).net.schema, s, 'a game state field');
});

test('join options and reserved names are checked (N-19, N-22)', () => {
  const bad = [
    [{ maxPlayers: 9 }, /defineGame: net\.maxPlayers must be an integer in 1\.\.8/], [{ maxSeats: 0 }, /net\.maxSeats must be an integer in 1\.\.16/],
    [{ rejoinSeconds: -1 }, /net\.rejoinSeconds must be a finite number >= 0/], [{ join: 'auto' }, /net\.join must be 'engine' or 'manual'/],
    [{ admit: 3 }, /net\.admit must be a function/], [{ reasons: [''] }, /net\.reasons must be an array of non-empty strings/],
    [{ kinds: [kind({ ...BOXDEF, code: 255 })] }, /net\.kinds: 'box' \(code 255\): codes 254 and 255 and names starting 'lh\.' are the engine's/],
    [{ kinds: [kind({ ...BOXDEF, name: 'lh.box' })] }, /net\.kinds: 'lh\.box' \(code 1\)/],
    [{ wire: { toHost: { 'net.hello': 'host.hi' }, toGuest: {} } }, /net\.wire\.toHost\.net\.hello: the tag is the engine's/],
  ];
  for (const [net, re] of bad) assert.throws(() => base(net), re, JSON.stringify(net));
  assert.throws(() => base({}, { commands: { 'net.welcome': { schema: { n: F.uint(1) }, handler() {} } } }), /defineGame: commands\.net\.welcome is the engine's/);
});
