# Local players 3: network identity, engine join, player and game state — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page is a peer with a stable key and one or more players. The engine runs the join: it gives out numbers, keeps a roster everyone can see, replicates player state and game state, keeps a player who drops for `rejoinSeconds` and gives the number back to the same key. Several seats on one page share one frame per send tick.

**Architecture:** A new sim-pure module `src/core/players.js` holds the roster (`engine.players`), the game state (`engine.gameState`) and the built-in kinds `lh.player` / `lh.game`. `src/core/engine.js` validates `defineGame({ player, gameState, net: { join, admit, maxPlayers, maxSeats, rejoinSeconds, reasons } })`, adds the engine's join commands and wire tags, computes the [N-6] schema hash, and exposes a private seam `engine[SEATS]` (controllers, roster, an online `route` for `lh.seat`). `src/sim/net/install.js` replaces the peer-to-number map with `bindings` / `locals`, checks each owner record against the frame's peer, relays by owner number, runs `net.hello` / `net.welcome` / `net.refused` / `net.seat`, replicates the roster, and runs away / inactive / rejoin / expiry. `src/sim/replica.js` stops tying owner ids to the frame's sender byte. `src/net/key.js` makes the peer key in the view; `createPort` passes it to the sim in `net.open`. `testing/mp.js` gets per-seat inputs, `w.seat` and `w.rejoin`.

**Tech Stack:** plain ES modules, `node:test`, no new dependencies.

**Spec:** `docs/spec.md` §4.6 [N-18]–[N-25] and §7.4 [T-22]. Design: `docs/plans/2026-10-21-local-players-spec.md` §5 and §2.2; `docs/research-players.md` §2.3, §2.5, §6.2. [T-25] (state homes per migrated game) belongs to plan 5 and is not planned here; Task 7's late-joiner test is its engine half.

**How the key reaches the sim (decision):** `createPort(engine, { key })` (default `peerKey()`, read from `sessionStorage` in the view) puts the key in the `net.open` command it already issues. Cost: the key sits in that page's own tape (tapes stay local; the key still goes only to the host on the wire), and a port made without a key in Node gets a fresh random one each run.

## Global Constraints

- Sim code stays pure (spec §1.2): `src/core/players.js` imports only `../defs/fields.js`; nothing under `src/core` or `src/sim` reads `sessionStorage`, `crypto` or a clock. `src/net/key.js` is view/Node code.
- Plan 1's names are fixed: `engine.controllers`, `engine.controllerOf(seat)`, `engine.controller({ bot: true })`, the internal `controllers.seat(op, seat)`, `controllers.renumber(from, to)` (emits `controller.renumbered { controller, seat, from, to }`), `controllers.of(seat)`, `controllers.copy()`. Seats leave only through `lh.seat` (the internal `controllers.seat('leave', …)` is that command's effect). A seat takes the lowest free number when it joins; only a guest's seats are renumbered, by `net.welcome`.
- Every 3i net test passes. The two fixtures that bind numbers by hand (`test/net/fixtures/carts.js`, `farmlet.js`) opt out with `net: { join: 'manual' }`. The only 3i assertions that change are the three that read the removed `world.net.players` map (Task 5).
- The frame format does not change: header, sender byte, groups. A single-seat peer's frames are byte-identical to today's.
- Allocation-free per step for the common case (R-8): `test/net-alloc.test.mjs` keeps its 9 KB budget; roster records reuse their pair and record objects like entity records.
- Error messages follow `'<area>: <what>'` (`net: …`, `net.admit: …`, `players: …`, `defineGame: …`, `port: …`, `mp: …`).
- Commits: conventional messages, no `Co-Authored-By` trailer (user rule).
- Tests run under the memory cap from the engine root: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test <files>`.

## Review Focus

- **A guest frame naming a number that is not its own.** Owner ids no longer have to equal the sender byte (one frame carries every seat), so the check moves from `decodeFrame` to the host: a record or a removal for a number bound to another peer must drop the whole frame. Pinned in Task 5 (`a frame may carry every seat of its peer; any number not bound to it drops the frame`).
- **`net.welcome` renumbering onto a number another of this page's seats still holds** (a guest's seats took 1 and 2 offline, the host says seat 0 is 2). `controllers.renumber` would throw `player 2 is taken` mid-step. The holder must move aside and every seat end on the host's number, with `player.renumbered` reporting the original numbers. Pinned in Task 6 (`a guest that joins with two seats is renumbered without a clash`).
- **A reload.** Handshake gives the reloaded page a new transport id and the old one may still be bound. Within `rejoinSeconds` the same key and seat must get the same number and record, and the new page's lower clock must not be rejected by a stale relay clock or store entry. Pinned in Task 8 (`back within rejoinSeconds with its key…`, `a reload the server has not dropped yet…`).
- **Bad seat data throwing mid-step.** `lh.seat` and `net.seat` must be refused at issue or at the port (schemas), never inside a step. Pinned in Task 2 (`lh.seat data is checked at issue, never mid-step`) and Task 3 (the `net.seat` schema).
- **The key leaking.** It must reach only the host: never a replicated field, the roster or another guest. Pinned in Task 8 (`a key never leaves the host`) and Task 3 (`lh.player` fields).

---

## File map

| File | Change |
|---|---|
| `src/core/players.js` | **new.** `createRoster`, `zeroOf`, `stateKinds`, `PLAYER_BASE`, `PLAYER_RESERVED`, kind names and codes, the `SEATS` symbol. |
| `src/core/controllers.js` | `seat(op, seat, n)` takes an explicit number; `copy()` drops a pawn that became remote. |
| `src/core/engine.js` | `defineGame({ player, gameState })` and the `lh.seat` schema; `engine.players`, `engine.gameState`, `engine[SEATS]`; `lh.seat` with an online route; `netConfig`: built-in kinds, join options, join schemas and wire tags, `net.schema`. |
| `src/sim/replica.js` | `decodeFrame` no longer ties owner ids to the sender; the store's keyframe sweep follows each object's last writer. |
| `src/sim/net/install.js` | `bindings`, `locals`, `player(peer, seat, n)`, per-record frame check, relay by owner number, engine join, roster replication, away / inactive / rejoin / expiry. |
| `src/net/key.js` | **new.** `peerKey({ storage, uuid })`, `keyWords(uuid)`. |
| `src/net/port.js` | `key` option, sent in `net.open`. |
| `src/index.net.js` | export `peerKey`, `keyWords`. |
| `testing/mp.js` | per-seat inputs, `w.seat`, `w.rejoin`, per-peer keys, `diverged` over `net.locals`. |
| `test/players.test.mjs` | **new.** Roster unit tests. |
| `test/players-engine.test.mjs` | **new.** Offline roster, game state, `lh.seat` checks, `defineGame` checks. |
| `test/net-config.test.mjs` | **new.** Join options, built-in kinds, schemas, wire tags, schema hash. |
| `test/net-key.test.mjs` | **new.** Peer key, port key, `mp` per-seat inputs and `w.rejoin`. |
| `test/net-locals.test.mjs` | **new.** Bindings, locals, multi-number frames. |
| `test/net-join.test.mjs` | **new.** Engine join. |
| `test/net-state.test.mjs` | **new.** Roster and game state replication. |
| `test/net-rejoin.test.mjs` | **new.** Away, inactive, rejoin, expiry, takeover. |
| `test/net/fixtures/seats.js` | **new.** A bodiless engine-join room. |
| `test/net/fixtures/carts.js`, `farmlet.js` | `join: 'manual'`; carts' `CART.max` 4. |
| `test/replica.test.mjs`, `test/mp-net.test.mjs`, `test/net-owner.test.mjs`, `test/net-host.test.mjs` | One assertion each (Task 5). |
| `docs/spec.md` | Mark [N-18]–[N-25], [T-22] built; record the rulings (Task 8). |

---

### Task 1: The roster module

**Files:**
- Create: `src/core/players.js`
- Test: `test/players.test.mjs`

**Interfaces:**
- Consumes: `F`, `kind` from `src/defs/fields.js`.
- Produces:
  - `PLAYER_KIND = 'lh.player'`, `GAME_KIND = 'lh.game'`, `PLAYER_CODE = 255`, `GAME_CODE = 254`.
  - `PLAYER_BASE = { seat: F.uint(1, 15), away: F.bool(), active: F.bool(), join: F.uint(1) }` (replicated engine fields); `PLAYER_RESERVED = ['number', 'local', 'seat', 'away', 'active', 'join']`.
  - `SEATS`: a symbol; `engine[SEATS] = { controllers, roster, route, changed }` (Task 2).
  - `zeroOf(f)` → the zero value of an F field.
  - `stateKinds({ player, gameState }, maxSender)` → `[lh.player kind, lh.game kind]`.
  - `createRoster({ player, gameState }, { emit })` → `{ list, game, get(n), add(n, { seat, local, join, quiet }), remove(n, why = 'left' | 'expired'), away(n, on), activate(n, on), apply(n, rec, local), applyGame(rec), relocal(has), renumber(from, to), clear() }`.
  - An entry: `{ number, seat, local, away, active, join, ...game player fields }`.
  - Events: `player.joined { number, seat, local, rejoined }`, `player.left`, `player.expired`, `player.away`, `player.back`, `player.inactive` (each `{ number, seat, local }`).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/players.test.mjs`
Expected: FAIL with `Cannot find module '.../src/core/players.js'`.

- [ ] **Step 3: Write the module**

```js
// src/core/players.js
// [N-20]–[N-23] (spec §4.6): the roster and player and game state, Unreal's PlayerArray, APlayerState and AGameState. Sim-pure.
// One entry per active or inactive player number, { number, seat, local, away, active, join, ...the game's player fields }, in
// number order, and one game-state object. Offline the page's seats fill it; online the host does and the net part replicates
// both as the built-in kinds lh.player and lh.game (stateKinds). Entries are plain objects updated in place: a game writes fields
// on the host (or solo) and reads them the same way everywhere.
import { F, kind } from '../defs/fields.js';

export const PLAYER_KIND = 'lh.player', GAME_KIND = 'lh.game', PLAYER_CODE = 255, GAME_CODE = 254;
// the engine's replicated player fields (two of an F.obj's eight bools); join: which joining of this number (Tractor's counter)
export const PLAYER_BASE = Object.freeze({ seat: F.uint(1, 15), away: F.bool(), active: F.bool(), join: F.uint(1) });
export const PLAYER_RESERVED = Object.freeze(['number', 'local', ...Object.keys(PLAYER_BASE)]);
export const SEATS = Symbol('lh.seats'); // engine[SEATS] = { controllers, roster, route, changed }: the net part's seam, not public API

// the value a new player's or the game state's field starts at
export function zeroOf(f) {
  switch (f?.t) {
    case 'bool': return false;
    case 'uint': return f.min;
    case 'id': return null;
    case 'enum': return f.list[0];
    case 'fixed': return Math.max(f.lo, Math.min(f.hi, 0));
    case 'angle': return 0;
    case 'quat': return { x: 0, y: 0, z: 0, w: 1 };
    case 'obj': { const o = {}; for (const k in f.fields) o[k] = zeroOf(f.fields[k]); return o; }
    case 'list': return Array.from({ length: f.min }, () => zeroOf(f.of));
    case 'actions': { const o = {}; for (const n of f.axes) o[n] = 0; for (const n of f.buttons) o[n] = false; return o; }
  }
  throw new Error(`players: not an F field (${f?.t})`);
}

// [N-22] the built-in kinds: one lh.player record per number (1..maxSender), one lh.game record (id 0); host authority, no body
export const stateKinds = ({ player = {}, gameState = {} } = {}, maxSender = 255) => [
  kind({ name: PLAYER_KIND, code: PLAYER_CODE, authority: 'host', remote: 'view', max: maxSender, idMin: 1, idMax: maxSender, send: { hz: 10, key: 2 }, fields: { ...PLAYER_BASE, ...player } }),
  kind({ name: GAME_KIND, code: GAME_CODE, authority: 'host', remote: 'view', max: 1, idMin: 0, idMax: 0, send: { hz: 10, key: 2 }, fields: { ...gameState } }),
];

export function createRoster({ player = {}, gameState = {} } = {}, { emit }) {
  const list = [], fields = { ...PLAYER_BASE, ...player }, game = {};
  for (const k in gameState) game[k] = zeroOf(gameState[k]);
  const get = n => { for (let i = 0; i < list.length; i++) if (list[i].number === n) return list[i]; return undefined; };
  const insert = p => { let i = 0; while (i < list.length && list[i].number < p.number) i++; list.splice(i, 0, p); return p; };
  const fresh = (number, seat, local) => { const p = { number, local }; for (const k in fields) p[k] = zeroOf(fields[k]); p.seat = seat; p.active = true; return p; };
  const info = p => ({ number: p.number, seat: p.seat, local: p.local });
  const joined = (p, rejoined) => emit('player.joined', { ...info(p), rejoined });
  return {
    list, game, get,
    add(n, { seat = 0, local = false, join = 0, quiet = false } = {}) {
      if (!Number.isInteger(n) || n < 1 || n > 255) throw new Error(`players: number must be an integer in 1..255 (got ${n})`);
      if (get(n)) throw new Error(`players: player ${n} is already in the roster`);
      const p = insert(fresh(n, seat, local)); p.join = join;
      if (!quiet) joined(p, false);
      return p;
    },
    remove(n, why = 'left') {
      const p = get(n); if (!p) return;
      list.splice(list.indexOf(p), 1);
      emit(why === 'expired' ? 'player.expired' : 'player.left', info(p));
    },
    away(n, on) { const p = get(n); if (!p || p.away === on) return; p.away = on; emit(on ? 'player.away' : 'player.back', info(p)); },
    activate(n, on) { // [N-23] inactive while its peer is gone; active again on a rejoin (away cleared)
      const p = get(n); if (!p || p.active === on) return;
      p.active = on; if (on) { p.away = false; joined(p, true); } else emit('player.inactive', info(p));
    },
    apply(n, rec, local) { // a guest: the host's lh.player record, with events for what changed
      let p = get(n); const was = p ? { away: p.away, active: p.active } : null;
      if (!p) p = insert(fresh(n, rec.seat, local));
      for (const k in fields) p[k] = rec[k];
      p.local = local;
      if (!was) { if (p.active) { joined(p, false); if (p.away) emit('player.away', info(p)); } else emit('player.inactive', info(p)); return p; }
      if (was.active !== p.active) { if (p.active) joined(p, true); else emit('player.inactive', info(p)); }
      else if (was.away !== p.away) emit(p.away ? 'player.away' : 'player.back', info(p));
      return p;
    },
    applyGame(rec) { for (const k in game) if (k in rec) game[k] = rec[k]; },
    relocal(has) { for (let i = 0; i < list.length; i++) list[i].local = has(list[i].number); },
    renumber(from, to) { // the host's seat 0 must be 1 (Task 6); silent, the net part emits player.renumbered
      const p = get(from); if (!p) return;
      if (get(to)) throw new Error(`players: player ${to} is already in the roster`);
      list.splice(list.indexOf(p), 1); p.number = to; insert(p);
    },
    clear() { list.length = 0; },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/players.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/players.js test/players.test.mjs
git commit -m "feat(players): roster, player and game state records (N-21, N-22)"
```

---

### Task 2: Player and game state in the engine, offline

**Files:**
- Modify: `src/core/engine.js` (`defineGame` ~line 22; `createEngine` after `const events = …` ~line 94; the engine object ~line 357; the `lh.seat` builtin ~line 462)
- Modify: `src/core/controllers.js` (`seat`, `copy`)
- Test: `test/players-engine.test.mjs`

**Interfaces:**
- Consumes: Task 1; plan 1's `controllers.seat`, `controllers.of`, `engine.controllerOf`.
- Produces:
  - `defineGame({ player: { [field]: F.* }, gameState: { [field]: F.* } })`; the frozen game has `player` and `gameState` (default `{}`).
  - `game.schemas['lh.seat'] = { op: F.oneOf(['join', 'leave']), seat: F.uint(1, 15) }` (checked at issue, N-3); a game may not declare `commands['lh.seat']`.
  - `engine.players` (the live roster list; player 1, seat 0, local, from the start, without an event), `engine.gameState` (the live object).
  - `engine[SEATS] = { controllers, roster, route: null, changed: null }`: `route(op, seat)` returning true means the net part took the command; `changed()` runs after an offline seat change.
  - `controllers.seat(op, seat, n)`: `n` is the number for a join (default: lowest free); a taken or bad `n` throws `lh.seat: player <n> is taken` / `lh.seat: player number must be an integer in 1..255 (got <n>)`.
  - `controllers.copy()` drops a pawn that another peer now simulates, reason `'remote'`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/players-engine.test.mjs`
Expected: FAIL: `h.engine.players` is undefined (first test), the `lh.seat` schema test does not throw, `e[SEATS]` is undefined.

- [ ] **Step 3: Implement**

In `src/core/controllers.js`:

1. In `copy()`, after the `despawned` line, add:

```js
        if (e.net !== undefined && w.net?.remoteOf?.(e) !== undefined) { drop(c, 'remote'); continue; } // another peer simulates it now
```

2. In `seat(op, seat)`, take the number as a third parameter (the comment on `seat` becomes "the lh.seat command's effect; n: the number the net part chose (default: the lowest free)"):

```js
    seat(op, seat, n) {
      // (op and seat checks unchanged)
      const c = this.of(seat);
      if (op === 'join') {
        if (c) return c;
        const p = n ?? freeNumber();
        if (!Number.isInteger(p) || p < 1 || p > 255) throw new Error(`lh.seat: player number must be an integer in 1..255 (got ${p})`);
        if (list.some(x => x.player === p)) throw new Error(`lh.seat: player ${p} is taken`);
        const made = make({ seat, player: p });
        emit('controller.joined', { controller: made.id, seat, player: p });
        return made;
      }
      // (leave unchanged)
    },
```

In `src/core/engine.js`:

1. Imports: `import { createRoster, PLAYER_BASE, PLAYER_RESERVED, SEATS } from './players.js';` and `import { F } from '../defs/fields.js';`.
2. In `defineGame`, after the `for (const [k, c] of Object.entries(spec.commands ?? {}))` loop:

```js
  // [C-5] lh.seat is the engine's command, checked at issue (N-3): bad data never reaches a step
  if (Object.hasOwn(commands, 'lh.seat')) fail("commands.lh.seat is the engine's ([C-5])");
  schemas['lh.seat'] = { op: F.oneOf(['join', 'leave']), seat: F.uint(1, 15) };
  // [N-22] player and game state fields; `state` stays the [D-4] debug-state function
  if (spec.state !== undefined && typeof spec.state !== 'function') fail('state is the debug-state function ([D-4]); declare game state fields as gameState');
  const player = spec.player ?? {}, gameState = spec.gameState ?? {};
  for (const [what, f] of [['player', player], ['gameState', gameState]]) {
    try { checkFields(f, what); } catch (err) { fail(err.message); }
    for (const k in f) if (f[k].body === true || k === 'input') fail(`${what}.${k}: F.body() and 'input' belong to pawns, not ${what}`);
  }
  for (const k of PLAYER_RESERVED) if (Object.hasOwn(player, k)) fail(`player.${k} is an engine field`);
  try { F.obj({ ...PLAYER_BASE, ...player }); } catch (err) { fail(`player: ${err.message}`); }
  try { F.obj(gameState); } catch (err) { fail(`gameState: ${err.message}`); }
```

and add `player, gameState` to the frozen object: `return Object.freeze({ ...spec, sim, actions: …, policies: …, commands, schemas, net, player, gameState });`.

3. In `createEngine`, right after `const events = createEvents({ now: () => step });`:

```js
  // [N-21], [N-22]: the roster and the game state; offline, the page's seats (seat 0 is player 1 from the start, no event)
  const roster = createRoster(game, { emit: (t, d) => events.emit(t, d) });
  roster.add(1, { seat: 0, local: true, quiet: true });
```

4. In the engine object literal, after `controllerOf: …`:

```js
    players: roster.list, // [N-21] live: one entry per active or inactive number, in number order
    gameState: roster.game, // [N-22] live: lh.game's fields
```

5. Right after the engine object literal (before `schedule.add('lh.ui', …)`):

```js
  // the net part's seam (not public API): it numbers seats online through `route`, and hears offline seat changes through `changed`
  const seats = { controllers, roster, route: null, changed: null };
  Object.defineProperty(engine, SEATS, { value: seats });
```

6. Replace the `lh.seat` builtin line with:

```js
  engine.builtin('lh.seat', (e, d) => { // [C-5]: checked by its schema at issue; online the net part asks the host ([N-19])
    if (seats.route?.(d.op, d.seat)) return;
    const had = controllers.of(d.seat), c = controllers.seat(d.op, d.seat);
    if (d.op === 'join' && !had) roster.add(c.player, { seat: d.seat, local: true });
    if (d.op === 'leave' && had && d.seat !== 0) roster.remove(had.player);
    seats.changed?.();
  });
```

- [ ] **Step 4: Run the new tests and the suites that touch commands and controllers**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/players-engine.test.mjs test/players.test.mjs test/controllers.test.mjs test/replay-seats.test.mjs test/commands.test.mjs test/engine.test.mjs test/schema.test.mjs`
Expected: PASS (7 new tests; the others unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js src/core/controllers.js test/players-engine.test.mjs
git commit -m "feat(engine): engine.players and engine.gameState offline, lh.seat schema (N-21, N-22, C-5)"
```

---

### Task 3: Net config: built-in kinds, join options, join messages, schema hash

**Files:**
- Modify: `src/core/engine.js` (`netConfig` ~line 50 and its call ~line 46)
- Test: `test/net-config.test.mjs`

**Interfaces:**
- Consumes: Task 1 `stateKinds`, `PLAYER_CODE`, `GAME_CODE`; `fnv` from `src/core/rng.js`; `ENGINE_VERSION` from `src/version.js`.
- Produces on `game.net`:
  - `join: 'engine' | 'manual'` (default `'engine'`), `admit` (function or undefined), `maxPlayers` (default `maxSender`, 1..`maxSender`), `maxSeats` (default 4, 1..16), `rejoinSeconds` (default 60, finite ≥ 0), `reasons` (`['full', 'seats', 'schema', ...game's]`).
  - `kinds`: the game's kinds, then `lh.player` (255) and `lh.game` (254). Codes 254/255 and names starting `lh.` are refused for game kinds.
  - `schemas` gains `net.hello { key: F.list(F.uint(4), 4, 4), seats: F.list(F.uint(1, 15), 16, 1), schema: F.uint(4) }`, `net.seat { op, seat }`, `net.welcome { players: F.list(F.obj({ seat, number: F.uint(1, maxSender, 1) }), 16, 1) }`, `net.refused { reason: F.oneOf(reasons), seat }`. A game may not declare them with a schema.
  - `wire.toHost` gains tags `net.hello`, `net.seat`; `wire.toGuest` gains `net.welcome`, `net.refused`, after the game's tags (binary tag indices unchanged). A game wire tag with those names is refused.
  - `schema`: `fnv(ENGINE_VERSION + JSON of every kind's name, code, authority, remote, max, idMin, idMax, fields)` ([N-6]).
  - `export const REASONS`, `export const JOIN_TYPES` from `src/core/engine.js`.

- [ ] **Step 1: Write the failing tests**

```js
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
  assert.deepEqual(n.reasons, ['full', 'seats', 'schema']);
  assert.deepEqual(n.kinds.map(k => [k.name, k.code]), [['box', 1], ['lh.player', 255], ['lh.game', 254]]);
  assert.deepEqual(Object.keys(n.kinds[1].fields), ['seat', 'away', 'active', 'join', 'score'], 'no key field: it never leaves the host (N-18)');
  assert.equal(n.kinds[1].idMax, 8); assert.deepEqual(Object.keys(n.kinds[2].fields), ['round']);
  assert.deepEqual(base({ reasons: ['locked'] }).net.reasons, ['full', 'seats', 'schema', 'locked']);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-config.test.mjs`
Expected: FAIL: `n.join` is undefined.

- [ ] **Step 3: Implement in `src/core/engine.js`**

1. Imports: change `import { rng } from './rng.js';` to `import { rng, fnv } from './rng.js';`, add `import { ENGINE_VERSION } from '../version.js';` and extend the players import with `stateKinds, PLAYER_CODE, GAME_CODE`.
2. Above `defineGame`:

```js
export const REASONS = Object.freeze(['full', 'seats', 'schema']); // [N-19] refusal reasons every game has
export const JOIN_TYPES = Object.freeze(['net.hello', 'net.seat', 'net.welcome', 'net.refused']);
const KEY = F.list(F.uint(4), 4, 4), SEAT = F.uint(1, 15); // [N-18] a key is a UUID's 128 bits as four words
```

3. In `defineGame`, after the `lh.seat` lines of Task 2: `for (const t of JOIN_TYPES) if (Object.hasOwn(schemas, t)) fail(`commands.${t} is the engine's (N-19): handle it with a plain function, which runs after the engine's`);` and pass the game spec on: `const net = spec.net === undefined ? undefined : netConfig(spec.net, schemas, fail, { player, gameState });` (move the `net` line below the player checks).
4. Replace `netConfig` with:

```js
// the game net config (N-3): every limit a port applies, and every wire tag naming a schema'd command (built once to check it);
// N-19..N-23: the engine join's options and messages; N-22: the built-in kinds; N-6: the schema hash
function netConfig(n, schemas, fail, state) {
  if (n === null || typeof n !== 'object') fail('net must be an object');
  const c = { maxJson: 2048, maxFrame: 16384, codec: 'json', join: 'engine', maxSeats: 4, rejoinSeconds: 60, ...n };
  const pos = (v, p, int) => { if (typeof v !== 'number' || !(v > 0) || !Number.isFinite(v) || (int && !Number.isInteger(v))) fail(`${p} must be a positive ${int ? 'integer' : 'number'}`); };
  if (!Array.isArray(c.kinds)) fail('net.kinds must be an array of kinds');
  if (!Number.isInteger(c.maxSender) || c.maxSender < 1 || c.maxSender > 255) fail('net.maxSender must be an integer in 1..255');
  for (const k of c.kinds) if (k?.code === PLAYER_CODE || k?.code === GAME_CODE || String(k?.name).startsWith('lh.')) fail(`net.kinds: '${k.name}' (code ${k.code}): codes ${GAME_CODE} and ${PLAYER_CODE} and names starting 'lh.' are the engine's (N-22)`);
  c.kinds = Object.freeze([...c.kinds, ...stateKinds(state, c.maxSender)]);
  try { createRegistry(c.kinds, { maxSender: c.maxSender }); } catch (err) { fail(`net.kinds: ${err.message}`); }
  pos(c.maxJson, 'net.maxJson', true); pos(c.maxFrame, 'net.maxFrame', true);
  if (c.codec !== 'json' && c.codec !== 'binary') fail("net.codec must be 'json' or 'binary'");
  c.maxPlayers ??= c.maxSender;
  if (!Number.isInteger(c.maxPlayers) || c.maxPlayers < 1 || c.maxPlayers > c.maxSender) fail(`net.maxPlayers must be an integer in 1..${c.maxSender}`);
  if (!Number.isInteger(c.maxSeats) || c.maxSeats < 1 || c.maxSeats > 16) fail('net.maxSeats must be an integer in 1..16');
  if (typeof c.rejoinSeconds !== 'number' || !(c.rejoinSeconds >= 0) || !Number.isFinite(c.rejoinSeconds)) fail('net.rejoinSeconds must be a finite number >= 0');
  if (c.join !== 'engine' && c.join !== 'manual') fail("net.join must be 'engine' or 'manual'");
  if (c.admit !== undefined && typeof c.admit !== 'function') fail('net.admit must be a function');
  if (n.reasons !== undefined && (!Array.isArray(n.reasons) || n.reasons.some(r => typeof r !== 'string' || !r))) fail('net.reasons must be an array of non-empty strings');
  c.reasons = Object.freeze([...new Set([...REASONS, ...(n.reasons ?? [])])]);
  for (const [role, keys] of [['host', ['reliable', 'fast', 'reliableFrames']], ['guest', ['reliable', 'fast']]]) {
    const r = c.rates?.[role]; if (r === null || typeof r !== 'object') fail(`net.rates.${role} must be an object`);
    for (const k of keys) if (k !== 'reliableFrames' || r[k] !== undefined) pos(r[k], `net.rates.${role}.${k}`);
  }
  // [N-19] the engine's join messages: schema'd commands whose wire tags are their names, after the game's tags
  Object.assign(schemas, {
    'net.hello': { key: KEY, seats: F.list(SEAT, 16, 1), schema: F.uint(4) },
    'net.seat': { op: F.oneOf(['join', 'leave']), seat: SEAT },
    'net.welcome': { players: F.list(F.obj({ seat: SEAT, number: F.uint(1, c.maxSender, 1) }), 16, 1) },
    'net.refused': { reason: F.oneOf(c.reasons), seat: SEAT },
  });
  const wire = {};
  for (const [dir, mine] of [['toHost', ['net.hello', 'net.seat']], ['toGuest', ['net.welcome', 'net.refused']]]) {
    const w = c.wire?.[dir]; if (w === null || typeof w !== 'object') fail(`net.wire.${dir} must be an object`);
    for (const tag of Object.keys(w)) if (JOIN_TYPES.includes(tag)) fail(`net.wire.${dir}.${tag}: the tag is the engine's (N-19)`);
    wire[dir] = { ...w }; for (const t of mine) wire[dir][t] = t;
    const table = {};
    for (const [tag, type] of Object.entries(wire[dir])) { if (!Object.hasOwn(schemas, type)) fail(`net.wire.${dir}.${tag}: '${type}' is not a command with a schema`); table[tag] = schemas[type]; }
    try { wireCodec(table, { codec: c.codec }); } catch (err) { fail(`net.wire.${dir}: ${err.message}`); }
  }
  c.wire = Object.freeze(wire);
  // [N-6] a join needs the same engine and the same kinds: a field change is caught without a manual version bump
  c.schema = fnv(ENGINE_VERSION + JSON.stringify(c.kinds.map(k => [k.name, k.code, k.authority, k.remote, k.max, k.idMin, k.idMax, k.fields])));
  return Object.freeze(c);
}
```

- [ ] **Step 4: Run the new tests and every suite that defines a net game**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-config.test.mjs test/schema.test.mjs test/port.test.mjs test/replica.test.mjs test/net-*.test.mjs test/mp*.test.mjs`
Expected: PASS. The 3i suites still pass: until Task 6 nothing reads `join`, and the built-in kinds have no records yet (their empty groups ride the host's keyframes only).

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js test/net-config.test.mjs
git commit -m "feat(net): join options, lh.player and lh.game kinds, join messages and the schema hash (N-6, N-19, N-22)"
```

---

### Task 4: The peer key, the port's key and the mp() seat helpers

**Files:**
- Create: `src/net/key.js`
- Modify: `src/net/port.js` (signature line 10, the `net.open` issue line 64), `src/index.net.js`
- Modify: `testing/mp.js` (`addPeer`, `one`, `w`)
- Test: `test/net-key.test.mjs`

**Interfaces:**
- Produces:
  - `keyWords(uuid)` → `[u32, u32, u32, u32]`; a non-UUID throws `net: peer key must be a UUID (got <x>)`.
  - `peerKey({ storage = globalThis.sessionStorage, uuid = () => globalThis.crypto.randomUUID() } = {})` → words; the UUID is kept under `lh.peerKey`; reads and writes are in try/catch.
  - `createPort(engine, { …, key = peerKey() })`: `key` is a UUID or four words; `net.open` data gains `key: [4 words]`. A bad key throws `port: key must be a UUID or four uint32 words (N-18)`.
  - `mp()`: each peer has `p.key` (default `[index + 1, 0, 0, 0]`); `w.addPeer({ wall0, key })`; inputs per peer may be `{ [seat]: snapshot }` (every key a seat number; a bare snapshot is seat 0; an unknown seat throws `mp: <name> has no seat <s>`); `w.seat(peer, op, seat)` issues `lh.seat`; `w.rejoin(peer)` reconnects a dropped guest as a fresh engine on a new transport with the same key (`mp: the host cannot rejoin (its room closed)`, `mp: <name> is not dropped (drop it first)`).

- [ ] **Step 1: Write the failing tests**

```js
// test/net-key.test.mjs
// [N-18] the peer key; [T-22] mp() seats and rejoin (plan 2026-10-21-local-players-3, Task 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createMemoryHub, createPort, peerKey, keyWords } from '../src/index.net.js';
import { createEngine } from '../src/index.sim.js';
import { mp } from '../testing/index.js';
import relay from './fixtures/relay.js';
import carts from './net/fixtures/carts.js';
await RAPIER.init();

const U = '0123abcd-4567-89ef-0123-456789abcdef', U2 = '11111111-2222-3333-4444-555555555555';
const argsOf = i => ({ n: i + 1 });
const openOf = h => h.tape().log.flatMap(x => x.ops ?? []).find(o => o[0] === 'command' && o[1] === 'net.open');

test('keyWords: a UUID is four uint32 words (N-18)', () => {
  assert.deepEqual(keyWords(U), [0x0123abcd, 0x456789ef, 0x01234567, 0x89abcdef]);
  assert.throws(() => keyWords('nope'), /net: peer key must be a UUID \(got nope\)/);
});

test('peerKey keeps one key per tab in sessionStorage; junk is replaced; a storage that throws still gives a key (N-18)', () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let n = 0; const uuid = () => [U, U2][n++];
  const a = peerKey({ storage, uuid });
  assert.deepEqual(a, keyWords(U)); assert.deepEqual(peerKey({ storage, uuid }), a, 'a reload reads the same key'); assert.equal(n, 1);
  assert.equal(store.get('lh.peerKey'), U);
  store.set('lh.peerKey', 'junk'); assert.deepEqual(peerKey({ storage, uuid }), keyWords(U2));
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(peerKey({ storage: broken, uuid: () => U }), keyWords(U));
});

test('the port puts the key in net.open: the sim gets it as a recorded command (N-18)', () => {
  const hub = createMemoryHub(), H = createEngine(relay, { record: true });
  createPort(H, { transport: hub.host(), role: 'host', clock: () => 0, key: U }); H.stepN(1);
  assert.deepEqual(H.scene.state.log.find(c => c.type === 'net.open').data.key, keyWords(U));
  assert.deepEqual(openOf(H)[2].key, keyWords(U), 'in this page\'s own tape');
  assert.throws(() => createPort(createEngine(relay), { transport: hub.join(), role: 'guest', key: [1, 2] }), /port: key must be a UUID or four uint32 words \(N-18\)/);
  const G = createEngine(relay); createPort(G, { transport: hub.join(), role: 'guest', clock: () => 0 }); G.stepN(1);
  assert.equal(G.scene.state.log.find(c => c.type === 'net.open').data.key.length, 4, 'no key given: a fresh one');
});

test('mp: inputs per seat; a bare snapshot is seat 0; w.seat joins a seat by command (T-22)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  w.seat(1, 'join', 1); w.step(1);
  const g = w.guests[0].engine;
  w.step(1, [{ thr: 1 }, { 0: { thr: 0.5 }, 1: { thr: -1 } }]);
  assert.equal(w.host.engine.input.snapshot.thr, 1);
  assert.equal(g.controllerOf(0).input.snapshot.thr, 0.5); assert.equal(g.controllerOf(1).input.snapshot.thr, -1);
  assert.throws(() => w.step(1, [null, { 3: { thr: 1 } }]), /mp: guest1 has no seat 3/);
});

test('mp: w.rejoin brings a dropped guest back as a fresh page with its key, on a new transport id (T-22, N-18)', () => {
  const w = mp(carts, { peers: 2, argsOf, record: true }); w.seconds(0.5);
  const g = w.guests[0], id0 = g.net.id, e0 = g.engine;
  assert.throws(() => w.rejoin(g), /mp: guest1 is not dropped \(drop it first\)/);
  assert.throws(() => w.rejoin(w.host), /mp: the host cannot rejoin \(its room closed\)/);
  w.drop(g); w.seconds(0.5); w.rejoin(g); w.step(1);
  assert.equal(g.dropped, false); assert.notEqual(g.engine, e0, 'a reload is a new engine'); assert.notEqual(g.net.id, id0);
  assert.deepEqual(g.key, [2, 0, 0, 0]); assert.deepEqual(openOf(g.h)[2].key, g.key);
  assert.deepEqual(w.addPeer({ key: [9, 9, 9, 9] }).key, [9, 9, 9, 9]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-key.test.mjs`
Expected: FAIL: `peerKey` is not exported from `src/index.net.js`.

- [ ] **Step 3: Implement**

`src/net/key.js`:

```js
// src/net/key.js: [N-18] the peer key. One random key per tab, kept in sessionStorage (a reload keeps it; another tab is another
// peer), sent only to the host in net.hello. Handshake keeps its resume token in memory only, so a reload rejoins with a new
// transport id: the key is what survives. View and Node code (not sim-pure): the sim gets the key from the port's net.open.
const NAME = 'lh.peerKey', UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a UUID -> its 128 bits as four uint32 words (the wire form, F.list(F.uint(4), 4, 4): no string field type needed)
export function keyWords(uuid) {
  if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new Error(`net: peer key must be a UUID (got ${uuid})`);
  const h = uuid.replace(/-/g, '');
  return [0, 8, 16, 24].map(i => parseInt(h.slice(i, i + 8), 16) >>> 0);
}
export function peerKey({ storage = globalThis.sessionStorage, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  let k = null;
  try { k = storage?.getItem(NAME) ?? null; } catch { k = null; } // private mode, blocked storage
  if (typeof k !== 'string' || !UUID.test(k)) { k = uuid(); try { storage?.setItem(NAME, k); } catch { /* a key for this page load only */ } }
  return keyWords(k);
}
```

`src/index.net.js`: add `export { peerKey, keyWords } from './net/key.js';`.

`src/net/port.js`:

1. `import { peerKey, keyWords } from './key.js';`
2. Signature: `export function createPort(engine, { transport, role, clock = () => performance.now(), onWarn, key = peerKey() } = {}) {`
3. After the role/transport checks:

```js
  const words = Array.isArray(key) ? key : keyWords(key); // N-18: to the sim in net.open, so a tape replays the same join
  if (words.length !== 4 || !words.every(w => Number.isInteger(w) && w >= 0 && w <= 0xffffffff)) throw new Error('port: key must be a UUID or four uint32 words (N-18)');
```

4. The last issue: `issue('net.open', { role, id: transport.id, hostId: transport.hostId ?? null, at: clock(), key: [...words] });`

`testing/mp.js`:

1. Replace `addPeer` with:

```js
  // a page: a fresh engine on a new transport (a reload has a new transport id; its key is kept, N-18)
  const connect = (p, wall0) => {
    p.h = headless(game, { seed, args: argsOf(p.index, p.name), record, wall0 }); p.engine = p.h.engine;
    p.net = p.index ? hub.join() : hub.host();
    p.port = createPort(p.engine, { transport: p.net, role: p.index ? 'guest' : 'host', clock: at, key: p.key, onWarn: onWarn && ((kind, e) => onWarn(p, kind, e)) });
    p.dropped = false; return p;
  };
  const addPeer = ({ wall0 = hub.now, key } = {}) => { // wall0: a peer whose clock starts elsewhere (a rejoin with a lower clock)
    const index = list.length, p = { index, name: index ? `guest${index}` : 'host', key: key ?? [index + 1, 0, 0, 0] };
    list.push(p); return connect(p, wall0);
  };
```

2. Above `one`, and in `one` replace `if (snap != null) p.engine.input.set(snap);` with `if (snap != null) setInputs(p, snap);`:

```js
  // [T-22] { 0: snap, 1: snap }: every key a seat number; anything else is seat 0's snapshot
  const perSeat = s => { let any = false; for (const k in s) { if (!/^\d+$/.test(k)) return false; any = true; } return any; };
  const setInputs = (p, snap) => {
    if (!perSeat(snap)) return p.engine.input.set(snap);
    for (const s in snap) {
      const c = p.engine.controllerOf(+s); if (!c) throw new Error(`mp: ${p.name} has no seat ${s}`);
      if (snap[s] != null) c.input.set(snap[s]);
    }
  };
```

3. In `w`, after `drop(peer) { … }`:

```js
    seat(peer, op, seat) { peerOf(peer).engine.command('lh.seat', { op, seat }); return w; }, // [T-22]: recorded like any command
    // [T-22] a dropped guest comes back as a reload does: a fresh engine on a new transport id, with the same key (N-18, N-23)
    rejoin(peer) {
      const p = peerOf(peer);
      if (p.index === 0) throw new Error('mp: the host cannot rejoin (its room closed)');
      if (!p.dropped) throw new Error(`mp: ${p.name} is not dropped (drop it first)`);
      connect(p, hub.now); return w;
    },
```

Update the header comment's 3i line to add: "plan 3: per-seat inputs, seat(peer, op, seat), rejoin(peer) and per-peer keys (T-22)".

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-key.test.mjs test/port.test.mjs test/mp.test.mjs test/mp-net.test.mjs test/net-replay.test.mjs`
Expected: PASS (5 new tests; the rest unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/net/key.js src/net/port.js src/index.net.js testing/mp.js test/net-key.test.mjs
git commit -m "feat(net): peer key in net.open; mp() per-seat inputs, seat and rejoin (N-18, T-22)"
```

---

### Task 5: Several numbers per peer (bindings, locals, per-record frame checks)

**Files:**
- Modify: `src/sim/replica.js` (`decodeFrame` ~line 101, `createStore` ~line 158)
- Modify: `src/sim/net/install.js` (state ~line 43, `keepForRelay`, `unbind`, `sendFrame`, `goSolo`, `ctl`, the built-ins, the send loop)
- Modify: `testing/mp.js` (`diverged`)
- Modify: `test/net/fixtures/carts.js` (`CART` `max: 4`), `test/replica.test.mjs`, `test/mp-net.test.mjs`, `test/net-owner.test.mjs`, `test/net-host.test.mjs` (one assertion each)
- Test: `test/net-locals.test.mjs`

**Interfaces:**
- Consumes: `engine[SEATS]` (Task 2), `controllers.renumber`, `engine.controllerOf`.
- Produces on `world.net`:
  - `bindings`: host only, `Map<number, { peer, key, seat }>` (replaces `players`). `player(peer, seat, n)` / `player(peer, n)` (seat 0) binds by hand; `n = 0` unbinds that seat, `player(peer, 0)` every seat of the peer. Binding adds a roster entry (`local: false`, `join` counted); unbinding removes it.
  - `locals`: `Set` of this page's numbers whose seat is the room's (every seat solo or host; a guest's once given its number). `self`: seat 0's number in `locals`, or 0 (the host is 1).
  - The manual `self = n` setter on a guest renumbers seat 0 to `n` through `controllers.renumber`.
  - Host frame rule: drop unless `f.sender` and every owner-kind record id and removal in the frame are numbers bound to `d.from`. Relay is per owner number. A guest ignores a frame whose sender is one of its `locals`.
  - `decodeFrame`: owner-kind ids need only be in the kind's range. `createStore`: entries carry `s` (the sender that last wrote them); a keyframe from sender `s` ends the owner objects `s` last wrote.
  - `engine[SEATS].changed` is set: after an offline seat change, `locals` follows.

- [ ] **Step 1: Write the failing tests**

```js
// test/net-locals.test.mjs
// [N-20], [N-24]: bindings, locals and frames that carry several numbers (plan 2026-10-21-local-players-3, Task 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp, headless } from '../testing/index.js';
import { encodeFrame } from '../src/index.sim.js';
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

test('net.locals is this page\'s numbers: every seat solo, seat 0 first as net.self (N-24)', () => {
  const h = headless(carts); h.step(1);
  assert.deepEqual([...h.world.net.locals], [1]); assert.equal(h.world.net.self, 1);
  h.command('lh.seat', { op: 'join', seat: 1 }); h.step(1);
  assert.deepEqual([...h.world.net.locals], [1, 2]);
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  const G = w.guests[0];
  assert.deepEqual([...G.h.world.net.locals], [2], 'a guest: the number its game set (manual join)');
  assert.equal(G.engine.controllerOf(0).player, 2, 'seat 0 took it');
});
```

Append to `test/replica.test.mjs`:

```js
test('a keyframe ends the owner objects its sender last wrote, whatever their ids (N-24)', () => {
  const SEATED = kind({ name: 'seated', code: 7, authority: 'owner', max: 4, idMin: 1, idMax: 4, fields: { x: F.uint(1) } }), reg = createRegistry([SEATED]);
  const s = createStore([SEATED]), at = (time, records, key, sender) => s.apply(decodeFrame(encodeFrame({ key, sender, time, groups: [{ kind: SEATED, records, removed: [] }] }), reg));
  at(10, [[2, { x: 1 }], [4, { x: 1 }]], false, 2); at(10, [[3, { x: 1 }]], false, 3);
  assert.deepEqual(at(20, [[2, { x: 2 }]], true, 2).map(c => [c.id, c.rec === null]), [[2, false], [4, true]], 'seat 1 of the same peer left');
  assert.ok(s.get('seated', 3), 'another sender\'s object stays');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-locals.test.mjs test/replica.test.mjs`
Expected: FAIL: `H.player(peer, 1, 4)` throws `net: player number must be 2..4 (got 1)`; the replica test gets `null` from `decodeFrame`.

- [ ] **Step 3: Implement**

`src/sim/replica.js`:

1. The comment above `decodeFrame` becomes: "… Every host-kind record or removal must come from the host (sender 1); owner-kind ids only need to be in range: the host's net part checks them against the frame's peer (N-24, M-50), since one frame carries every seat of a peer …".
2. In `decodeFrame`, the record check becomes `if (id < k.idMin || id > k.idMax || records.has(id) || (k.authority === 'host' && sender !== 1)) return null;` and the removal check `if (id < k.idMin || id > k.idMax || (k.authority === 'host' && sender !== 1)) return null;`.
3. In `createStore`:

```js
  // a keyframe ends the objects its sender speaks for: a host kind's are the host's (sender 1); an owner kind's are those this sender
  // last wrote (N-24: one frame carries every seat of a peer, so an owner object is its writer's, not only id === sender)
  const authority = (k, e, sender) => k.authority === 'host' ? sender === 1 : e.s === sender;
```

   In `apply`: records `if (e) { e.rec = rec; e.t = f.time; e.s = f.sender; } else m.set(id, { rec, t: f.time, s: f.sender });`; removals `if (e) { e.rec = null; e.t = f.time; e.s = f.sender; } else m.set(id, { rec: null, t: f.time, s: f.sender });`; the keyframe line `… && authority(k, e, f.sender) && …`. Update the map comment to `id -> { rec (null: removed), t, s: the sender that wrote it }`.

`src/sim/net/install.js`:

1. Import `import { SEATS } from '../../core/players.js';`.
2. Replace the `players` / `self` state (line 43–44) with:

```js
  const seats = engine[SEATS]; // { controllers, roster, route, changed } (engine.js): this page's seats and the roster
  if (!seats) throw new Error('net: the engine has no seats seam (local players plan 3)');
  const bindings = new Map(), peerNums = new Map(), locals = new Set(), confirmed = new Set(), warn = createWarnOnce(), objs = {};
  // bindings: host only, player number -> { peer, key, seat } (N-20); peerNums: transport peer id -> its numbers; locals: this page's
  // numbers (N-24); confirmed: this page's seats whose number is the room's (every seat solo or host; a guest's once welcomed)
  let role = 'solo', hostId = null, self = 0, world = null, serial = -1, W = null, replicating = 0, joins = 0;
  function refreshLocals() { // N-24: the numbers of this page's seats that are the room's; self is seat 0's (the host's is 1)
    locals.clear();
    const cs = seats.controllers.list;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.seat !== null && c.player > 0 && confirmed.has(c.seat)) locals.add(c.player); }
    self = role === 'host' ? 1 : confirmed.has(0) ? engine.controllerOf(0)?.player ?? 0 : 0;
    seats.roster.relocal(n => locals.has(n));
  }
  const confirmAll = () => { confirmed.clear(); for (const c of seats.controllers.list) if (c.seat !== null) confirmed.add(c.seat); };
  seats.changed = () => { if (role !== 'guest') confirmAll(); refreshLocals(); }; // an offline lh.seat (engine.js)
```

   and after `const ctl = { … };` and before the built-ins: `confirmAll(); refreshLocals();`.
3. Replace `keepForRelay` with:

```js
  // ---- the host's relay (N-10, C-3, N-24): each guest's newest owner records, by owner number, passed on with that guest's clock ----
  let rk = null, rt = 0; // keepOne's kind and time (one callback, made once: R-8)
  const keepOne = (n, rec) => {
    let m = W.fwd.get(n); if (!m) W.fwd.set(n, m = new Map());
    const old = m.get(rk.name); if (old && rt <= old.time) return;
    if (old) { old.time = rt; old.rec = rec; old.fresh = true; } else m.set(rk.name, { time: rt, rec, fresh: true });
  };
  const keepRec = (rec, n) => keepOne(n, rec);
  function keepForRelay(f) { // a peer with several seats sends them in one frame: each record is kept under its own number
    rt = f.time;
    for (const k of ownerKinds) { const g = f.groups.get(k.name); if (!g) continue; rk = k; g.records.forEach(keepRec); for (let j = 0; j < g.removed.length; j++) keepOne(g.removed[j], null); }
    rk = null;
  }
```

4. Replace `unbind(peer)` with:

```js
  const numberAt = (peer, seat) => { for (const [n, b] of bindings) if (b.peer === peer && b.seat === seat) return n; return undefined; };
  function bind(n, peer, key, seat) { // host: player n is this peer's seat (N-20)
    const old = bindings.get(n);
    if (old && old.peer !== peer) throw new Error(`net: player ${n} is already bound to ${old.peer}`);
    const again = old !== undefined && old.seat === seat, prev = numberAt(peer, seat);
    if (prev !== undefined && prev !== n) unbindNumber(prev); // the seat had another number
    bindings.set(n, { peer, key, seat }); let s = peerNums.get(peer); if (!s) peerNums.set(peer, s = new Set()); s.add(n);
    if (!seats.roster.get(n)) seats.roster.add(n, { seat, local: false, join: joins = (joins + 1) % 256 });
    if (sync()) W.lastKey.fill(-Infinity); // M-23: a joiner gets every keyframe at once
    if (W && !again) { // a reused number starts fresh: no old relay clock, no pending removals, no store entry
      W.fwd.delete(n);
      for (let j = W.gone.length - 1; j >= 0; j--) if (W.gone[j].n === n) W.gone.splice(j, 1);
      for (const k of ownerKinds) W.store.forget(k.name, n);
    }
  }
  function unbindNumber(n, { keep = false } = {}) { // its replicas go; keep: the roster entry stays (inactive, N-23)
    const b = bindings.get(n); if (!b) return; bindings.delete(n);
    const s = peerNums.get(b.peer); if (s) { s.delete(n); if (!s.size) peerNums.delete(b.peer); }
    if (!keep) seats.roster.remove(n);
    if (!sync()) return;
    let time = 0; const m = W.fwd.get(n); if (m) for (const x of m.values()) if (x.time > time) time = x.time; W.fwd.delete(n);
    for (const k of ownerKinds) { const e = W.byKey.get(keyOf(k, n)); if (e) despawnRemote(e); W.store.forget(k.name, n); }
    W.gone.push({ n, time: time + 1, left: REPEAT });
  }
  const unbindPeer = peer => { const s = peerNums.get(peer); if (s) for (const n of [...s]) unbindNumber(n); };
  // N-24: the frame's sender and every owner record and removal in it are numbers bound to `peer` (M-50: a device speaks for itself)
  let mine = null, ok = true;
  const speakRec = (rec, id) => { if (!mine.has(id)) ok = false; };
  function fromPeer(peer, f) {
    mine = peerNums.get(peer); if (!mine || !mine.has(f.sender)) { mine = null; return false; }
    ok = true;
    for (let i = 0; i < ownerKinds.length && ok; i++) {
      const g = f.groups.get(ownerKinds[i].name); if (!g) continue;
      g.records.forEach(speakRec);
      for (let j = 0; j < g.removed.length; j++) if (!mine.has(g.removed[j])) ok = false;
    }
    mine = null; return ok;
  }
```

5. In `sendFrame`, the host branch becomes `if (role === 'host') { for (const [peer, nums] of peerNums) if (!nums.has(except)) { engine.net.send(peer, buf, key); stats.sent++; } }` (comment: `except: a number whose own peer is skipped (the relay); 0 sends to every peer`).
6. `goSolo`: replace `players.clear();` with:

```js
    role = 'solo'; hostId = null; bindings.clear(); peerNums.clear();
    for (let i = seats.roster.list.length - 1; i >= 0; i--) { const p = seats.roster.list[i]; if (!p.local) seats.roster.remove(p.number); } // N-25: this page's players stay
    confirmAll(); refreshLocals();
```

7. In `ctl`: replace the `self` getter/setter, `players` and `player`:

```js
    get self() { return self; }, get locals() { return locals; }, get bindings() { return bindings; },
    set self(n) { // the manual join (#77): the game names this page's number; a guest's seat 0 takes it
      if (!Number.isInteger(n) || n < 0 || n > cfg.maxSender) throw new Error(`net: self must be a player number 0..${cfg.maxSender} (got ${n})`);
      if (role === 'host' && n !== 1) throw new Error('net: the host is player 1');
      if (role === 'guest') {
        if (n === 0) confirmed.delete(0);
        else { const c = engine.controllerOf(0); if (c.player !== n) seats.controllers.renumber(c.player, n); confirmed.add(0); }
      }
      refreshLocals(); if (sync()) W.lastKey.fill(-Infinity);
    },
    tunables, stats,
    player(peer, a, b) { // host: bind a transport peer's seat to its number by hand (#77, N-20); n = 0 unbinds; player(peer, n) is seat 0
      if (role !== 'host') throw new Error('net: only the host binds players');
      if (typeof peer !== 'string') throw new Error('net: player(peer, seat, n): peer must be a transport peer id');
      const seat = b === undefined ? 0 : a, n = b === undefined ? a : b;
      if (!Number.isInteger(seat) || seat < 0 || seat > 15) throw new Error(`net: player(peer, seat, n): seat must be an integer in 0..15 (got ${seat})`);
      if (n === 0) { if (b === undefined) unbindPeer(peer); else { const m = numberAt(peer, seat); if (m !== undefined) unbindNumber(m); } return; }
      if (!Number.isInteger(n) || n < 2 || n > cfg.maxSender) throw new Error(`net: player number must be 2..${cfg.maxSender} (got ${n})`);
      bind(n, peer, null, seat);
    },
```

8. The guard's owner line becomes:

```js
        if (role !== 'solo' && k.authority === 'owner' && !locals.has(d.netId)) throw new Error(`net: ${locals.size > 1 ? `players ${[...locals].join(', ')}` : `player ${self}`} may not spawn '${k.name}' ${d.netId}: only its owner does (E-7)`);
```

9. Built-ins: `net.open` becomes

```js
  engine.builtin('net.open', (e, d) => {
    if (sync()) { for (let i = W.list.length - 1; i >= 0; i--) despawnRemote(W.list[i].e); W = fresh(); }
    role = d.role; hostId = d.hostId; bindings.clear(); peerNums.clear();
    if (role === 'host') confirmAll(); else confirmed.clear(); // #77, N-25: a guest's numbers are the host's to give
    refreshLocals();
  });
```

   `net.peer`: `if (d.event === 'peerLeft' && role === 'host') unbindPeer(d.id);`. `net.frame`: the check becomes `if (role === 'host' ? !fromPeer(d.from, f) : d.from !== hostId) { stats.dropped++; return; } // #77, M-50, N-24` and the next line `if (locals.has(f.sender)) return;`.
10. Send loop: `const k = kinds[ki]; if (k.authority === 'host' ? role !== 'host' : !locals.has(e.netId)) continue;` and `if (role === 'host' ? !peerNums.size : hostId === null) return;`. Update the loop comment to "its own owner-kind entities (every seat's) everywhere".

`testing/mp.js` `diverged`: `if (kd.authority === 'host' ? net.role !== 'host' : !net.locals?.has(e.netId)) continue;`.

Fixtures and old assertions:
- `test/net/fixtures/carts.js`: `cartKind`'s `max: 1` → `max: 4` (comment: "a peer's seats share one frame, N-24").
- `test/replica.test.mjs` line 57: `assert.ok(decodeFrame(encodeFrame({ … records: [[3, …]] … }), REG), 'owner ids are the host net part\'s to check (N-24)');`
- `test/mp-net.test.mjs` line 15 and `test/net-owner.test.mjs` line 24: `assert.deepEqual([...<net>.bindings.keys()], [3]);`
- `test/net-host.test.mjs` line 17: `assert.deepEqual([...h.bindings.keys()], [2, 3]);`

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-locals.test.mjs test/replica.test.mjs test/net-*.test.mjs test/mp*.test.mjs test/port.test.mjs test/sync-netfix.test.mjs test/camera-mount.test.mjs`
Expected: PASS (3 new tests and 1 new replica test; every 3i test unchanged apart from the three `bindings` lines).

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --expose-gc --test test/net-alloc.test.mjs`
Expected: PASS under 9 KB per engine per step.

- [ ] **Step 5: Commit**

```bash
git add src/sim/replica.js src/sim/net/install.js testing/mp.js test/net-locals.test.mjs test/replica.test.mjs test/net/fixtures/carts.js test/mp-net.test.mjs test/net-owner.test.mjs test/net-host.test.mjs
git commit -m "feat(net): several numbers per peer: bindings, locals, per-record frame checks, relay by owner (N-20, N-24)"
```

---

### Task 6: The engine join

**Files:**
- Modify: `src/sim/net/install.js`
- Create: `test/net/fixtures/seats.js`
- Modify: `test/net/fixtures/carts.js`, `test/net/fixtures/farmlet.js` (`join: 'manual'`)
- Test: `test/net-join.test.mjs`

**Interfaces:**
- Consumes: Tasks 3–5; `controllers.seat(op, seat, n)`, `controllers.renumber`.
- Produces (only with `net.join: 'engine'`):
  - A guest sends `net.hello { key, seats, schema }` from the step its `net.open` lands, then every 1 s (wall) until seat 0 is welcomed or refused.
  - Host `net.hello`: `schema` must equal `game.net.schema` (else `net.refused { reason: 'schema', seat: 0 }`); seats in order, seat 0 first; a seat already bound to that peer gets the same number; past `maxSeats` per peer → `'seats'`; else `admit({ key, seat, peer, players })` or the default (lowest number in 2..`maxPlayers` not in the roster) → a number, `null` (`'full'`) or `{ refuse: reason }` (reason must be in `net.reasons`, else throws `net.admit: refuse reason '<r>' is not in net.reasons`). A number outside 2..`maxPlayers` throws `net.admit: must return a number in 2..<max>, null or { refuse } (got <x>)`; a taken one `net.admit: player <n> is taken`. If seat 0 is refused, the rest is too. One `net.welcome { players }` lists the admitted seats.
  - Host `net.seat { op, seat }` from a bound peer: join as above (answer `net.welcome` or `net.refused`); leave unbinds that number (seat 0 leaves only with its peer).
  - Guest `net.welcome`: each seat takes its number (a page seat holding that number moves aside first); `player.renumbered { seat, from, to }` per changed seat (from: the number before this welcome); `locals` updated; keyframes go at once. A number for a seat this page no longer has is answered with `net.seat { op: 'leave' }`.
  - Guest `net.refused { reason, seat }`: seat > 0 leaves (`controllers.seat('leave', seat)`); seat 0 stops the hellos. Event `player.refused { seat, reason, local: true }` on that page.
  - `lh.seat` online (`engine[SEATS].route`): host join → admit (peer `null`) → `controllers.seat('join', seat, n)` and a roster entry; refusal → `player.refused`. Guest join → the seat takes the lowest number free in its controllers and the roster (not in `locals`) and sends `net.seat` (or waits for the next hello before seat 0 is welcomed). Leave: host removes the roster entry; a guest sends `net.seat { op: 'leave' }` if the seat was the room's.
  - Host `net.open` makes seat 0 player 1 if it is not (a page that was a guest kept the room's numbers when it went solo), with `player.renumbered`.

- [ ] **Step 1: Write the fixture and the failing tests**

```js
// test/net/fixtures/seats.js
// A bodiless room for plan 3 (N-18..N-25): the engine owns the join. Each of this page's numbered seats has a `dot` (an owner kind,
// drawn only) whose x follows that seat's input. A dot exists only while its number is the room's (net.locals): a renumbered or
// leaving seat's dot goes and the new number's comes (the game rekeys its pawns, N-25). Player state: score; game state: round.
import { defineGame, F, kind, actions, axis } from '../../../src/index.sim.js';
import { installNet } from '../../../src/sim/net/install.js';

export const ACTIONS = actions({ x: axis() });
export const DOT = kind({ name: 'dot', code: 1, authority: 'owner', remote: 'view', max: 8, idMin: 1, idMax: 8, fields: { x: F.fixed(-10, 10, 1 / 64) } });
const RATES = { host: { reliable: 60, fast: 120, reliableFrames: 8 }, guest: { reliable: 60, fast: 240 } };
export const seatsGame = (net = {}, extra = {}) => defineGame({
  id: 'seats', start: 'room', actions: ACTIONS,
  player: { score: F.uint(2) }, gameState: { round: F.uint(1) },
  net: { kinds: [DOT], world: true, maxSender: 8, codec: 'json', rates: RATES, wire: { toHost: {}, toGuest: {} }, ...net },
  setup(engine) {
    installNet(engine);
    engine.system('seats.dots', e => {
      const w = e.world, net = w.net, dots = e.scene.state.dots;
      for (const [n, d] of dots) if (!net.locals.has(n)) { w.despawn(d); dots.delete(n); }
      for (const c of e.controllers) {
        if (c.seat === null || !net.locals.has(c.player)) continue;
        let d = dots.get(c.player); if (!d) dots.set(c.player, d = w.spawn({ net: 'dot', netId: c.player, owner: c.player, x: 0 }));
        d.x = c.input.snapshot.x * 10;
      }
    }, { stage: 'pre' });
  },
  scenes: { room: { enter(e, ctx) { ctx.state.dots = new Map(); } } },
  ...extra,
});
export default seatsGame();
```

```js
// test/net-join.test.mjs
// [N-19], [N-20], [N-24], [N-25]: the engine join (plan 2026-10-21-local-players-3, Task 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp, replay } from '../testing/index.js';
import { createRegistry, decodeFrame } from '../src/index.sim.js';
import seats, { seatsGame } from './net/fixtures/seats.js';

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

test('a game\'s admit decides; a taken number is loud (N-19)', () => {
  const w = mp(seatsGame({ reasons: ['locked'], admit: ({ key }) => key[0] === 3 ? { refuse: 'locked' } : 7 }), { peers: 3 }); w.seconds(1);
  assert.equal(w.guests[0].h.world.net.self, 7);
  assert.deepEqual(w.guests[1].h.events.of('player.refused').map(e => e.reason), ['locked']);
  w.seat(1, 'join', 1);
  assert.throws(() => w.seconds(0.5), /net\.admit: player 7 is taken/);
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

test('a guest seat that leaves is unbound on the host; its dot goes everywhere (N-19)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1); w.seat(1, 'join', 1); w.seconds(0.5);
  w.seat(1, 'leave', 1); w.seconds(0.5);
  assert.equal(w.host.h.world.net.bindings.has(4), false);
  assert.equal(w.host.h.world.net.find('dot', 4), undefined); assert.equal(w.peers[2].h.world.net.find('dot', 4), undefined);
});

test('every peer\'s tape of an engine join replays alone (T-9, #78, N-18)', () => {
  const w = mp(seats, { peers: 2, record: true }); w.seconds(1); w.seat(1, 'join', 1);
  w.seconds(1, [null, { 0: { x: 1 }, 1: { x: -1 } }]);
  for (const p of w.peers) assert.equal(replay(seats, p.h.tape()).checksum(), p.h.checksum(), p.name);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-join.test.mjs`
Expected: FAIL: the host has no bindings (nobody sends `net.hello`).

- [ ] **Step 3: Implement in `src/sim/net/install.js`**

1. Below the state block of Task 5:

```js
  // ---- the engine join (N-19): net.hello / net.welcome / net.refused / net.seat; `join: 'manual'` leaves numbering to the game ----
  const byEngine = cfg.join === 'engine', HELLO_MS = 1000; // a hello is repeated until seat 0 is welcomed (one sent before the channel opened is lost)
  let key = null, helloAt = -Infinity, refusedAll = false;
  const seatList = () => { const out = []; for (const c of seats.controllers.list) if (c.seat !== null) out.push(c.seat); return out; };
  function hello() {
    helloAt = engine.time.wall;
    if (!key) return warn('net: no peer key', 'net.open has no key: the engine join needs createPort({ key }) (N-18)');
    engine.net.send(hostId, { t: 'net.hello', key, seats: seatList(), schema: cfg.schema }, true);
  }
  const taken = n => seats.roster.get(n) !== undefined || bindings.has(n); // the roster holds this page's, the guests' and the inactive
  const freeNumber = () => { for (let n = 2; n <= cfg.maxPlayers; n++) if (!taken(n)) return n; return null; };
  function refuse(peer, seat, reason) {
    if (peer === null) engine.emit('player.refused', { seat, reason, local: true });
    else engine.net.send(peer, { t: 'net.refused', reason, seat }, true);
    return 0;
  }
  // host: a number for (peer, seat), or 0 once refused; peer null is the host's own seat (N-19, N-20)
  function admitSeat(peer, k, seat) {
    if (peer !== null) { const n = numberAt(peer, seat); if (n !== undefined) return n; } // a repeated hello (M-19): the same answer
    const count = peer === null ? locals.size : peerNums.get(peer)?.size ?? 0;
    if (count >= cfg.maxSeats) return refuse(peer, seat, 'seats');
    const r = cfg.admit ? cfg.admit({ key: k, seat, peer, players: engine.players }) : freeNumber();
    if (r === null) return refuse(peer, seat, 'full');
    if (typeof r === 'object') {
      if (!cfg.reasons.includes(r.refuse)) throw new Error(`net.admit: refuse reason '${r.refuse}' is not in net.reasons`);
      return refuse(peer, seat, r.refuse);
    }
    if (!Number.isInteger(r) || r < 2 || r > cfg.maxPlayers) throw new Error(`net.admit: must return a number in 2..${cfg.maxPlayers}, null or { refuse } (got ${JSON.stringify(r)})`);
    if (taken(r)) throw new Error(`net.admit: player ${r} is taken`);
    if (peer !== null) bind(r, peer, k, seat);
    return r;
  }
  // N-25: a guest's seats take the room's numbers; a seat of this page holding one moves aside first (it gets its own number later)
  function welcome(list) {
    const R = seats.controllers.renumber, cs = seats.controllers.list, was = new Map();
    for (const { seat } of list) { const c = engine.controllerOf(seat); if (c) was.set(seat, c.player); }
    for (const { seat, number } of list) {
      const c = engine.controllerOf(seat);
      if (!c) { engine.net.send(hostId, { t: 'net.seat', op: 'leave', seat }, true); continue; } // it left while asking
      if (c.player !== number) {
        const holder = cs.find(x => x !== c && x.player === number);
        if (holder) { let p = 255; while (cs.some(x => x.player === p)) p--; R(holder.player, p); }
        R(c.player, number);
      }
      confirmed.add(seat);
      if (was.get(seat) !== number) engine.emit('player.renumbered', { seat, from: was.get(seat), to: number });
    }
    refreshLocals(); if (sync()) W.lastKey.fill(-Infinity); // this page's records under the new numbers, at once
  }
  function hostSeat0() { // N-20: the host's seat 0 is 1 (a page that was a guest kept the room's numbers when it went solo)
    const c = engine.controllerOf(0); if (!c || c.player === 1) return;
    const R = seats.controllers.renumber, Q = seats.roster.renumber, from = c.player, h = seats.controllers.list.find(x => x !== c && x.player === 1);
    if (h) { R(1, 255); Q(1, 255); }
    R(from, 1); Q(from, 1); engine.emit('player.renumbered', { seat: 0, from, to: 1 });
    if (h) { R(255, from); Q(255, from); engine.emit('player.renumbered', { seat: h.seat, from: 1, to: from }); }
  }
  const freeLocal = () => { let n = 1; while (seats.controllers.list.some(x => x.player === n) || seats.roster.get(n)) n++; return n; };
  // [C-5] lh.seat online: the host admits its own seats; a guest asks the host. Solo, or a manual join: the engine's offline path
  seats.route = (op, seat) => {
    if (role === 'solo' || !byEngine) return false;
    const c = engine.controllerOf(seat);
    if (op === 'join') {
      if (c) return true;
      if (role === 'host') {
        const n = admitSeat(null, key, seat);
        if (n) { seats.controllers.seat('join', seat, n); seats.roster.add(n, { seat, local: true, join: joins = (joins + 1) % 256 }); confirmed.add(seat); }
      } else { seats.controllers.seat('join', seat, freeLocal()); if (confirmed.has(0)) engine.net.send(hostId, { t: 'net.seat', op, seat }, true); } // before the welcome, the next hello asks
    } else {
      if (!c || seat === 0) return true; // seat 0 is the page's first player and never leaves
      const n = c.player, room = confirmed.has(seat);
      seats.controllers.seat('leave', seat); confirmed.delete(seat);
      if (role === 'host') seats.roster.remove(n); else if (room) engine.net.send(hostId, { t: 'net.seat', op, seat }, true);
    }
    refreshLocals(); return true;
  };
```

2. `net.open` gains the key and the host's seat 0:

```js
  engine.builtin('net.open', (e, d) => {
    if (sync()) { for (let i = W.list.length - 1; i >= 0; i--) despawnRemote(W.list[i].e); W = fresh(); }
    role = d.role; hostId = d.hostId; key = Array.isArray(d.key) ? d.key : null; bindings.clear(); peerNums.clear();
    helloAt = -Infinity; refusedAll = false; // a guest's first hello goes after this step (the send clock below)
    if (role === 'host') { hostSeat0(); confirmAll(); } else confirmed.clear(); // #77, N-25: a guest's numbers are the host's to give
    refreshLocals();
  });
```

   (`goSolo` also sets `refusedAll = false`.)

3. New built-ins, after `net.frame`:

```js
  engine.builtin('net.hello', (e, d) => { // host (N-19): only from a port (from: a transport peer id)
    if (role !== 'host' || !byEngine || typeof d.from !== 'string') return;
    if (d.schema !== cfg.schema) { refuse(d.from, 0, 'schema'); return; } // N-6: another engine or other kinds
    const out = [], order = [...new Set(d.seats)].sort((a, b) => a - b);
    for (const seat of order) { const n = admitSeat(d.from, d.key, seat); if (n) out.push({ seat, number: n }); else if (seat === 0) break; } // no seat without seat 0
    if (out.length) engine.net.send(d.from, { t: 'net.welcome', players: out }, true);
  });
  engine.builtin('net.seat', (e, d) => { // host: a welcomed peer's seat joins or leaves
    if (role !== 'host' || !byEngine || !peerNums.has(d.from)) return;
    if (d.op === 'join') {
      const n = admitSeat(d.from, bindings.get(numberAt(d.from, 0))?.key ?? null, d.seat);
      if (n) engine.net.send(d.from, { t: 'net.welcome', players: [{ seat: d.seat, number: n }] }, true);
      return;
    }
    const n = numberAt(d.from, d.seat); if (n !== undefined && d.seat !== 0) unbindNumber(n); // seat 0 leaves with its peer
  });
  engine.builtin('net.welcome', (e, d) => { if (role === 'guest' && byEngine && d.from === hostId) welcome(d.players); });
  engine.builtin('net.refused', (e, d) => {
    if (role !== 'guest' || !byEngine || d.from !== hostId) return;
    if (d.seat === 0) refusedAll = true; // the room will not take this page: no more hellos
    else if (engine.controllerOf(d.seat)) { seats.controllers.seat('leave', d.seat); confirmed.delete(d.seat); refreshLocals(); }
    engine.emit('player.refused', { seat: d.seat, reason: d.reason, local: true });
  });
```

4. At the top of the send clock (`engine.onStep`), before its first `return`:

```js
    if (role === 'guest' && byEngine && !refusedAll && !confirmed.has(0) && hostId !== null && engine.time.wall - helloAt >= HELLO_MS) hello();
```

Fixtures: add `join: 'manual',` to the `net` objects of `test/net/fixtures/carts.js` and `test/net/fixtures/farmlet.js` (comment: "the game binds numbers itself (#77): the 3i suites keep their hand-made join").

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-join.test.mjs test/net-locals.test.mjs test/net-key.test.mjs test/net-*.test.mjs test/mp*.test.mjs test/port.test.mjs`
Expected: PASS (9 new tests; the 3i suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/sim/net/install.js test/net/fixtures/seats.js test/net/fixtures/carts.js test/net/fixtures/farmlet.js test/net-join.test.mjs
git commit -m "feat(net): engine-owned join with admit, limits, renumbering and online lh.seat (N-19, N-20, N-25)"
```

---

### Task 7: Replicate the roster and the game state

**Files:**
- Modify: `src/sim/net/install.js` (guard, send loop, `net.frame`, `net.open`)
- Test: `test/net-state.test.mjs`

**Interfaces:**
- Consumes: Task 1 `roster.apply`, `applyGame`, `relocal`, `clear`; `PLAYER_KIND`, `GAME_KIND`.
- Produces:
  - The host sends one `lh.player` record per roster entry (id = number) and one `lh.game` record (id 0) on the kinds' send clock (10 Hz diffs, a keyframe every 2 s and on every join).
  - A guest builds `engine.players` from them (`local` from `locals`) and fills `engine.gameState`; a removed record emits `player.expired` (the entry was inactive) or `player.left`. A guest's roster is cleared (silently) on its `net.open`.
  - Spawning or adding a `net` part of `lh.player` / `lh.game` throws `net: '<kind>' is the engine's: write engine.players or engine.gameState (N-22)`.

- [ ] **Step 1: Write the failing tests**

```js
// test/net-state.test.mjs
// [N-21], [N-22]: the roster and the game state, from the host to every peer (plan 2026-10-21-local-players-3, Task 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp } from '../testing/index.js';
import seats from './net/fixtures/seats.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-state.test.mjs`
Expected: FAIL: a guest's roster holds only its offline player 1.

- [ ] **Step 3: Implement in `src/sim/net/install.js`**

1. Import `PLAYER_KIND, GAME_KIND` with `SEATS`. After `ownerKinds`:

```js
  const PK = reg.byName.get(PLAYER_KIND), GK = reg.byName.get(GAME_KIND), pki = index.get(PLAYER_KIND), gki = index.get(GAME_KIND); // N-22
```

2. In `guard`, right after `if (!k) throw …`: `if (k === PK || k === GK) throw new Error(`net: '${k.name}' is the engine's: write engine.players or engine.gameState (N-22)`);`
3. Below `fresh`:

```js
  // N-22: a roster entry or the game state as an own record (reused per object like an entity's: R-8); id is its number, or 0
  const ownState = (k, x, id) => {
    let o = W.own.get(x);
    if (!o) { const rec = newRecord(k); W.own.set(x, o = { e: x, rec, ring: null, pair: [id, rec], base: (y, out) => defaultRecord(k, y, out, null) }); }
    o.pair[0] = id; return o;
  };
```

4. In the send loop, after the entity loop and before the bucket trim:

```js
    if (role === 'host') { // N-22: the roster and the game state are the host's records
      const ps = seats.roster.list;
      for (let i = 0; i < ps.length; i++) W.buckets[pki][W.bucketN[pki]++] = ownState(PK, ps[i], ps[i].number);
      W.buckets[gki][W.bucketN[gki]++] = ownState(GK, seats.roster.game, 0);
    }
```

5. In `net.frame`, the change loop:

```js
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], k = reg.byName.get(c.kind);
      if (k === PK) { // N-21: the guest's roster is the host's
        if (c.rec) seats.roster.apply(c.id, c.rec, locals.has(c.id));
        else { const p = seats.roster.get(c.id); if (p) seats.roster.remove(c.id, p.active ? 'left' : 'expired'); }
        continue;
      }
      if (k === GK) { if (c.rec) seats.roster.applyGame(c.rec); continue; }
      if (c.rec) receive(k, c.id, c.rec, f.time, d.at); else removed(k, c.id);
    }
```

6. In `net.open`, the guest branch: `else { confirmed.clear(); seats.roster.clear(); } // the roster restarts from the host's records`.

- [ ] **Step 4: Run the tests and the allocation check**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-state.test.mjs test/net-join.test.mjs test/net-*.test.mjs test/mp*.test.mjs`
Expected: PASS (5 new tests).

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --expose-gc --test test/net-alloc.test.mjs test/checks-alloc.test.mjs`
Expected: PASS within the existing budgets (the roster's records reuse their pair and record; a guest decodes them only on change).

- [ ] **Step 5: Commit**

```bash
git add src/sim/net/install.js test/net-state.test.mjs
git commit -m "feat(net): replicate engine.players and engine.gameState as lh.player and lh.game (N-21, N-22)"
```

---

### Task 8: Away, leave, inactive rejoin and expiry; spec status

**Files:**
- Modify: `src/sim/net/install.js` (`net.peer`, `admitSeat`, the send clock, `goSolo`)
- Modify: `docs/spec.md`
- Test: `test/net-rejoin.test.mjs`

**Interfaces:**
- Consumes: Task 1 `roster.away`, `roster.activate`, `roster.remove(n, 'expired')`; Task 4 `w.rejoin`, `w.addPeer({ key })`.
- Produces:
  - Host `peerAway` / `peerBack`: `away` set / cleared on that peer's players (`player.away` / `player.back` everywhere).
  - Host `peerLeft` (engine join): each of the peer's numbers is unbound (replicas despawned and removals relayed, as before) and its roster entry becomes inactive (`player.inactive`), held for `rejoinSeconds` of `engine.time.wall`. A manual join removes it as before.
  - A hello whose key and seat match an inactive player gets that number and entry back (`player.joined { rejoined: true }`; `join` unchanged). A hello whose key and seat match a player bound to another, still connected peer moves that player to the new peer (a reload the server has not dropped yet).
  - On expiry: `player.expired`, the number is free; reusing it starts fresh (relay clock and store entry cleared by `bind`).
  - Going solo clears the inactive list.

- [ ] **Step 1: Write the failing tests**

```js
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

test('a guest that leaves is inactive; back within rejoinSeconds with its key it gets its number and state back (N-23, T-22, review focus)', () => {
  const w = mp(seats, { peers: 3 }); w.seconds(1);
  const H = w.host.engine, g1 = w.guests[0], g2 = w.peers[2];
  at(H, 2).score = 9; w.drop(g1); w.seconds(0.5);
  assert.equal(at(H, 2).active, false); assert.equal(w.host.h.world.net.bindings.has(2), false);
  assert.equal(w.host.h.world.net.find('dot', 2), undefined, 'its pawn went, as before');
  assert.equal(at(g2.engine, 2).active, false); assert.deepEqual(g2.h.events.of('player.inactive').map(e => e.number), [2]);
  w.rejoin(g1); w.seconds(1);
  assert.equal(g1.h.world.net.self, 2); assert.equal(at(g1.engine, 2).score, 9, 'the same record');
  assert.equal(at(H, 2).active, true);
  assert.deepEqual(w.host.h.events.of('player.joined').filter(e => e.number === 2).map(e => e.rejoined), [false, true]);
  assert.ok(g2.h.world.net.find('dot', 2), 'the new page\'s frames are not held back by the old clock');
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

test('a reload the server has not dropped yet: the same key on a new peer takes its player over (N-18, N-23, review focus)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  const twin = w.addPeer({ key: w.guests[0].key }); w.seconds(1);
  assert.equal(twin.h.world.net.self, 2); assert.equal(w.host.h.world.net.bindings.get(2).peer, twin.net.id);
});

test('a key never leaves the host: no roster entry or record carries it (N-18, review focus)', () => {
  const w = mp(seats, { peers: 2 }); w.seconds(1);
  for (const p of w.peers) for (const e of p.engine.players) assert.equal('key' in e, false, p.name);
  assert.equal('key' in seats.net.kinds.find(k => k.name === 'lh.player').fields, false);
  assert.deepEqual(w.host.h.world.net.bindings.get(2).key, [2, 0, 0, 0], 'the host has it');
  assert.equal(w.guests[0].h.world.net.bindings.size, 0, 'a guest binds nothing');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-rejoin.test.mjs`
Expected: FAIL: player 2 is removed on leave (not inactive); away is never set.

- [ ] **Step 3: Implement in `src/sim/net/install.js`**

1. State, next to `bindings`: `const inactive = new Map(); // host: number -> { key, seat, since } of a player whose peer left, held for rejoinSeconds (N-23)` and

```js
  const sameKey = (a, b) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  function left(peer) { // N-23: the replicas go as before; with the engine join the players wait, inactive, for a rejoin
    const s = peerNums.get(peer); if (!s) return;
    for (const n of [...s]) {
      const b = bindings.get(n), hold = byEngine && b.key !== null;
      unbindNumber(n, { keep: hold });
      if (hold) { inactive.set(n, { key: b.key, seat: b.seat, since: engine.time.wall }); seats.roster.activate(n, false); }
    }
  }
  const expire = (x, n) => { if (engine.time.wall - x.since < cfg.rejoinSeconds * 1000) return; inactive.delete(n); seats.roster.remove(n, 'expired'); };
```

2. `net.peer`:

```js
  engine.builtin('net.peer', (e, d) => {
    if (role === 'host' && (d.event === 'peerAway' || d.event === 'peerBack')) { const s = peerNums.get(d.id); if (s) for (const n of s) seats.roster.away(n, d.event === 'peerAway'); }
    if (d.event === 'peerLeft' && role === 'host') left(d.id);
    if (d.event === 'closed') goSolo();
  });
```

3. In `admitSeat`, after the repeated-hello line:

```js
    if (peer !== null) {
      for (const [n, x] of inactive) if (x.seat === seat && sameKey(x.key, k)) { // N-23: Unreal's FindInactivePlayer + OverridePlayerState
        inactive.delete(n); bind(n, peer, k, seat); seats.roster.activate(n, true); return n;
      }
      for (const [n, b] of bindings) if (b.peer !== peer && b.seat === seat && sameKey(b.key, k)) { // a reload the server has not dropped yet
        unbindNumber(n, { keep: true }); bind(n, peer, k, seat); seats.roster.away(n, false); return n;
      }
    }
```

4. At the top of the send clock, after the hello line: `if (role === 'host' && inactive.size) inactive.forEach(expire);`
5. `goSolo`: `inactive.clear();` with `bindings.clear()`.

`docs/spec.md`:
- The amendment line: "Built in 0.13 (plans 1 and 3): [C-1]–[C-4], [I-4], [T-23], [N-18]–[N-25], [T-22]; the rest is draft."
- Add "(built, plan 3)" after the bold labels of [N-18]–[N-25] and [T-22].
- Under §4.6, add a "Rulings (plan 3)" list: the key reaches the sim in `net.open` from `createPort({ key })`, as four uint32 words; `defineGame({ gameState })` (not `state`, which stays [D-4]); `net.join: 'engine' | 'manual'`; `net.reasons` and `net.refused { reason, seat }` with `player.refused`; `lh.player` engine fields `seat, away, active, join`; `maxSeats` applies with a custom `admit` and to the host's seats; the same key on another live peer takes the player over; `net.schema` is the [N-6] hash, carried in `net.hello`; `world.net.players` is replaced by `world.net.bindings`.
- [T-11]: "still to come: `w.drop(peer)`…" becomes a sentence listing `w.drop`, `w.rejoin`, `w.seat` and per-seat inputs.

- [ ] **Step 4: Run every net suite, the allocation checks and the whole headless suite**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/net-rejoin.test.mjs test/net-state.test.mjs test/net-join.test.mjs test/net-locals.test.mjs test/net-key.test.mjs test/net-config.test.mjs test/players.test.mjs test/players-engine.test.mjs`
Expected: PASS (6 new tests here, 46 across the plan).

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --expose-gc --test test/net-alloc.test.mjs test/checks-alloc.test.mjs test/alloc-rate.test.mjs`
Expected: PASS.

Run: `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=2560 --test --test-concurrency=4 test/*.test.mjs`
Expected: PASS with the base count plus 46 (record the base count first on the commit before Task 1). Browser suites need the shared browser; run them one at a time, and if they cannot start, say which were skipped.

- [ ] **Step 5: Commit**

```bash
git add src/sim/net/install.js docs/spec.md test/net-rejoin.test.mjs
git commit -m "feat(net): away, inactive rejoin by key and expiry; spec marks N-18..N-25, T-22 built"
```

---

## After this plan

Plan 5 migrates Tractor onto this API (its `hello`/`welcome` `you` becomes `net.welcome`'s number, `byPeer` becomes `world.net.bindings`, `freeNumber` becomes the default `admit` with `maxPlayers: 4`, `away` and the join counter come from `engine.players`, the `PLAYER` kind's `coat`, `trim` and `barn` become `defineGame({ player })` fields, the game-specific `seed`/`farm`/`next` stay a game message) and writes the [T-25] state-home tests per game.
