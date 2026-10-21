// test/players-engine.test.mjs
// [N-21], [N-22] offline, [C-5] checks (plan 2026-10-21-local-players-3, Task 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, createEngine, actions, axis, F } from '../src/index.sim.js';
import { createControllers } from '../src/core/controllers.js';
import { SEATS } from '../src/core/players.js';
import { headless } from '../testing/index.js';

const schema = actions({ x: axis() });
const game = defineGame({ id: 'roster', start: 'a', actions: schema, player: { score: F.uint(2), name: F.oneOf(['anon', 'ada']) }, gameState: { round: F.uint(1, 9, 1) }, scenes: { a: {}, b: {} } });

test('solo: engine.players has player 1 on seat 0 from the start, fields at their zero, no event (N-21, N-22)', () => {
  const h = headless(game); h.step(1);
  assert.deepEqual(h.engine.players, [{ number: 1, local: true, seat: 0, away: false, active: true, join: 0, score: 0, name: 'anon' }]);
  assert.deepEqual(h.engine.gameState, { round: 1 });
  assert.equal(h.events.count('player.joined'), 0);
});

test('solo: lh.seat join and leave add and remove roster entries, numbered like the controllers (C-5, N-21)', () => {
  const h = headless(game);
  h.command('lh.seat', { op: 'join', seat: 2 }); h.step(1);
  assert.deepEqual(h.engine.players.map(p => [p.number, p.seat, p.local]), [[1, 0, true], [2, 2, true]]);
  assert.equal(h.engine.controllerOf(2).player, 2);
  h.command('lh.seat', { op: 'leave', seat: 2 }); h.step(1);
  assert.deepEqual(h.engine.players.map(p => p.number), [1]);
  assert.deepEqual(h.events.of('player.joined').map(e => [e.number, e.seat, e.rejoined]), [[2, 2, false]]);
  assert.deepEqual(h.events.of('player.left').map(e => e.number), [2]);
});

test('lh.seat data is checked at issue, never mid-step (C-5, N-3, review focus)', () => {
  const e = createEngine(game);
  for (const bad of [{ op: 'swap', seat: 1 }, { op: 'join', seat: 16 }, { op: 'join', seat: -1 }, { op: 'join', seat: 1.5 }, { op: 'join' }])
    assert.throws(() => e.command('lh.seat', bad), /engine: command 'lh.seat' does not match its schema/, JSON.stringify(bad));
  assert.throws(() => defineGame({ id: 'x', start: 's', scenes: { s: {} }, commands: { 'lh.seat': () => {} } }), /defineGame: commands\.lh\.seat is the engine's/);
});

test('player and game state outlive the World: a scene change keeps them (§5.5 state homes)', () => {
  const h = headless(game); h.engine.players[0].score = 12; h.engine.gameState.round = 3;
  h.go('b'); h.step(1);
  assert.equal(h.engine.players[0].score, 12); assert.equal(h.engine.gameState.round, 3);
});

test('defineGame checks player and gameState fields (N-22)', () => {
  const g = o => () => defineGame({ id: 'x', start: 's', scenes: { s: {} }, ...o });
  assert.throws(g({ player: { away: F.bool() } }), /defineGame: player\.away is an engine field/);
  assert.throws(g({ player: { number: F.uint(1) } }), /defineGame: player\.number is an engine field/);
  assert.throws(g({ player: { net: F.uint(1) } }), /defineGame: player\.net is an entity part's name; rename it/, 'N7: not later at installNet');
  assert.throws(g({ gameState: { tags: F.bool() } }), /defineGame: gameState\.tags is an entity part's name; rename it/);
  assert.throws(g({ player: { pose: F.body() } }), /defineGame: player\.pose: F\.body\(\) and 'input' belong to pawns/);
  assert.throws(g({ gameState: { input: F.bool() } }), /defineGame: gameState\.input: F\.body\(\) and 'input' belong to pawns/);
  assert.throws(g({ player: { n: 3 } }), /defineGame: player\.n is not an F field/);
  assert.throws(g({ player: Object.fromEntries('abcdefg'.split('').map(k => [k, F.bool()])) }), /defineGame: player: too many bools: 9/);
  assert.throws(g({ state: { round: F.uint(1) } }), /defineGame: state is the debug-state function \(\[D-4\]\); declare game state fields as gameState/);
});

test('controllers.seat takes an explicit number; a taken one throws (the net part\'s join)', () => {
  const e = createEngine(game), cs = e[SEATS].controllers;
  cs.seat('join', 3, 7); assert.equal(e.controllerOf(3).player, 7);
  assert.throws(() => cs.seat('join', 4, 7), /lh\.seat: player 7 is taken/);
  assert.throws(() => cs.seat('join', 4, 0), /lh\.seat: player number must be an integer in 1\.\.255 \(got 0\)/);
});

test('copy() drops a pawn another peer simulates since it was possessed (C-3, plan 1 deferral)', () => {
  const ev = [], car = { id: 1, net: 'cart' }, w = { get: id => (id === 1 ? car : undefined), net: { remoteOf: () => undefined } };
  const cs = createControllers(schema, { emit: (t, d) => ev.push({ t, ...d }), world: () => w }), c = cs.list[0];
  c.possess(car); w.net.remoteOf = e => (e === car ? {} : undefined); cs.copy();
  assert.equal(c.pawn, null); assert.deepEqual([ev.at(-1).t, ev.at(-1).reason], ['controller.unpossess', 'remote']);
});

test('every reserved name is refused at defineGame: each PLAYER_RESERVED and each entity part (N7)', () => {
  const g = o => () => defineGame({ id: 'x', start: 's', scenes: { s: {} }, ...o });
  for (const k of ['number', 'local', 'seat', 'away', 'active', 'join'])
    assert.throws(g({ player: { [k]: F.uint(1) } }), new RegExp(`defineGame: player\\.${k} is an engine field`), k);
  for (const k of ['id', 'tags', 'model', 'colliders', 'xf', 'sockets', 'net', 'netId', 'netFix']) {
    assert.throws(g({ player: { [k]: F.uint(1) } }), new RegExp(`defineGame: player\\.${k} is an entity part's name`), `player ${k}`);
    assert.throws(g({ gameState: { [k]: F.uint(1) } }), new RegExp(`defineGame: gameState\\.${k} is an entity part's name`), `gameState ${k}`);
  }
});
