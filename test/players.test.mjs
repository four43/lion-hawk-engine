// test/players.test.mjs
// [N-20]–[N-23]: the roster, player and game state (plan 2026-10-21-local-players-3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, actions, axis, button } from '../src/index.sim.js';
import { createRoster, zeroOf, stateKinds, PLAYER_BASE, PLAYER_RESERVED, PLAYER_CODE, GAME_CODE } from '../src/core/players.js';

const setup = () => {
  const ev = [], r = createRoster({ player: { score: F.uint(2), name: F.oneOf(['anon', 'ada']) }, gameState: { round: F.uint(1, 9, 1), phase: F.oneOf(['lobby', 'race']) } }, { emit: (type, d) => ev.push({ type, ...d }) });
  return { r, ev };
};

test('zeroOf: the value a new field starts at, for every F type', () => {
  assert.equal(zeroOf(F.bool()), false); assert.equal(zeroOf(F.uint(1, 9, 3)), 3); assert.equal(zeroOf(F.id()), null);
  assert.equal(zeroOf(F.oneOf(['a', 'b'])), 'a'); assert.equal(zeroOf(F.fixed(1, 5, 0.5)), 1); assert.equal(zeroOf(F.fixed(-5, 5, 0.5)), 0);
  assert.equal(zeroOf(F.angle()), 0); assert.deepEqual(zeroOf(F.quat()), { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(zeroOf(F.obj({ a: F.bool(), b: F.uint(1) })), { a: false, b: 0 });
  assert.deepEqual(zeroOf(F.list(F.uint(1), 4, 2)), [0, 0]);
  assert.deepEqual(zeroOf(F.actions(actions({ s: axis(), h: button() }))), { s: 0, h: false });
  assert.throws(() => zeroOf({ t: 'nope' }), /players: not an F field \(nope\)/);
});

test('stateKinds: lh.player per number and one lh.game, host authority, engine fields first (N-22)', () => {
  const [P, G] = stateKinds({ player: { score: F.uint(2) }, gameState: { round: F.uint(1) } }, 8);
  assert.deepEqual([P.name, P.code, P.authority, P.idMin, P.idMax, P.max], ['lh.player', PLAYER_CODE, 'host', 1, 8, 8]);
  assert.deepEqual(Object.keys(P.fields), [...Object.keys(PLAYER_BASE), 'score']);
  assert.deepEqual([G.name, G.code, G.idMin, G.idMax, G.max], ['lh.game', GAME_CODE, 0, 0, 1]);
  assert.deepEqual(Object.keys(G.fields), ['round']);
  assert.deepEqual(PLAYER_RESERVED, ['number', 'local', 'seat', 'away', 'active', 'join']);
});

test('add keeps number order and zeroes the game fields; quiet adds emit nothing (N-21)', () => {
  const { r, ev } = setup();
  r.add(3, { seat: 1, local: true, join: 7 }); r.add(1, { quiet: true });
  assert.deepEqual(r.list.map(p => p.number), [1, 3]);
  assert.deepEqual(r.get(3), { number: 3, local: true, seat: 1, away: false, active: true, join: 7, score: 0, name: 'anon' });
  assert.deepEqual(r.game, { round: 1, phase: 'lobby' });
  assert.deepEqual(ev, [{ type: 'player.joined', number: 3, seat: 1, local: true, rejoined: false }]);
  assert.throws(() => r.add(3), /players: player 3 is already in the roster/);
  assert.throws(() => r.add(0), /players: number must be an integer in 1\.\.255 \(got 0\)/);
});

test('away, inactive, rejoined and removal emit once per change (N-21, N-23)', () => {
  const { r, ev } = setup(); r.add(2, { quiet: true });
  r.away(2, true); r.away(2, true); r.away(2, false);
  r.activate(2, false); r.activate(2, false); r.activate(2, true);
  r.remove(2, 'expired'); r.remove(2); r.add(4, { quiet: true }); r.remove(4);
  assert.deepEqual(ev.map(e => [e.type, e.number, e.rejoined]), [
    ['player.away', 2, undefined], ['player.back', 2, undefined], ['player.inactive', 2, undefined],
    ['player.joined', 2, true], ['player.expired', 2, undefined], ['player.left', 4, undefined]]);
});

test('apply: a guest builds its roster from the host\'s records and hears what changed (N-21)', () => {
  const { r, ev } = setup(), rec = o => ({ seat: 0, away: false, active: true, join: 1, score: 0, name: 'anon', ...o });
  r.apply(2, rec({ score: 5 }), true); r.apply(5, rec({ active: false }), false);
  r.apply(2, rec({ score: 6, away: true }), true); r.apply(5, rec({ active: true }), false);
  assert.equal(r.get(2).score, 6); assert.equal(r.get(2).local, true); assert.equal(r.get(5).local, false);
  assert.deepEqual(ev.map(e => [e.type, e.number, e.rejoined]), [
    ['player.joined', 2, false], ['player.inactive', 5, undefined], ['player.away', 2, undefined], ['player.joined', 5, true]]);
  r.applyGame({ round: 4, phase: 'race', extra: 1 }); assert.deepEqual(r.game, { round: 4, phase: 'race' });
});

test('relocal, renumber and clear (N-25)', () => {
  const { r, ev } = setup(); r.add(1, { quiet: true, local: true }); r.add(2, { quiet: true });
  r.relocal(n => n === 2); assert.deepEqual(r.list.map(p => p.local), [false, true]);
  r.renumber(1, 9); assert.deepEqual(r.list.map(p => p.number), [2, 9]);
  assert.throws(() => r.renumber(2, 9), /players: player 9 is already in the roster/);
  r.clear(); assert.equal(r.list.length, 0); assert.equal(ev.length, 0, 'none of these emit');
});
