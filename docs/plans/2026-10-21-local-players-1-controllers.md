# Local players 1: controllers, possession and bots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page has a list of controllers (one per local seat, plus bots), each with its own input, each possessing at most one pawn whose `e.input` it fills every step; seat 0 is today's `engine.input`, so existing games and tests are unchanged.

**Architecture:** A new sim-pure module `src/core/controllers.js` owns the controller list, possession and the per-step copy. `src/core/engine.js` builds seat 0's controller around the input it already makes, applies every controller's input in `lh.input`, runs the copy in a new `lh.possess` system, handles the `lh.seat` builtin command and records per-seat input on tapes. `testing/replay.js` replays per-seat input.

**Tech Stack:** plain ES modules, `node:test`, no new dependencies.

**Spec:** `docs/plans/2026-10-21-local-players-spec.md` §4, and `docs/spec.md` [C-1]–[C-4], [I-4], [T-23].

## Global Constraints

- Sim code stays pure: no DOM, no `navigator`, no timers (spec §1.2). `src/core/controllers.js` imports only `./actions.js`.
- `engine.input` stays the same object it is today (seat 0's input): every existing test must pass unchanged.
- Allocation-free per step for the common case (one controller, a pawn already possessed): spec R-8 and `test/alloc-rate.test.mjs` / `test/checks-alloc.test.mjs` must still pass.
- Error messages follow the engine's `'<area>: <what>'` form (e.g. `controller.possess: ...`, `lh.seat: ...`).
- Commits: conventional messages, no `Co-Authored-By` trailer (user rule).
- Tests run under the memory cap: `systemd-run --user --scope -p MemoryMax=2G node --max-old-space-size=1536 --test --test-concurrency=4 <files>` (from the engine root).

## Review Focus

- Possessing an entity that another peer simulates (a remote `driven` or `proxy` replica): must throw, not silently fight the network for its `e.input`.
- A pawn despawned or its World swapped by a scene change: the controller must drop it (with an event) on the next step, never write into a dead entity.
- A tape recorded before this change (no `seats` in entries): must replay exactly as before.
- Possessing a pawn whose `e.input` was made by the net layer (an owner kind's `input` field, a subset of the game's actions with plain booleans): only that kind's keys are written, buttons as `down` booleans, so the replica's shape never changes.
- `lh.seat` with bad data (seat 0 leave, a negative or fractional seat, an unknown op): a readable error or a documented no-op, never a broken controller list.

---

## File map

| File | Change |
|---|---|
| `src/core/controllers.js` | **new.** `createControllers(schema, { input, emit, world })`: list, `make`, possession, `applyInputs`, `gate`, `copy`, `seat(op, seat)`. |
| `src/core/engine.js` | Build controllers around the existing `input`; `lh.input` applies every controller; new `lh.possess` system; `engine.controllers`, `engine.controller(opts)`; `lh.seat` builtin; per-seat tape recording. |
| `testing/replay.js` | Replay `entry.seats` into each seat's controller. |
| `test/controllers.test.mjs` | **new.** Controllers, possession, copy, bots, seats, gating. |
| `test/replay-seats.test.mjs` | **new.** Per-seat tape round trip and old-tape compatibility. |
| `docs/spec.md` | Mark [C-1]–[C-4], [I-4], [T-23] built (drop "draft" on those lines). |

---

### Task 1: The controllers module

**Files:**
- Create: `src/core/controllers.js`
- Test: `test/controllers.test.mjs`

**Interfaces:**
- Consumes: `createInput(schema)` from `src/core/actions.js` (returns `{ snapshot, kinds, device, clearDevice, gate, gated, set, hold, release, apply, values }`).
- Produces:
  - `createControllers(schema, { input, emit, world })` → `{ list, make(opts), applyInputs(), gate(on), copy(), seat(op, seat) }`
    - `input`: an existing input to use for seat 0 (engine passes its own), `emit(type, data)`, `world()` → current World or undefined.
  - A controller: `{ seat: number | null, player: number, bot: boolean, input, pawn: entity | null, possess(e), unpossess(), dispose() }`.
  - Events: `controller.possess { seat, player, pawn }`, `controller.unpossess { seat, player, pawn, reason: 'unpossess' | 'taken' | 'despawned' | 'left' }`, `controller.joined { seat, player }`, `controller.left { seat, player }` (`pawn` is the entity id).

- [ ] **Step 1: Write the failing tests**

```js
// test/controllers.test.mjs
// [C-1]–[C-4], [I-4]: controllers, possession, the per-step copy, bots and seats (plan 2026-10-21-local-players-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, axis, button, createInput } from '../src/core/actions.js';
import { createControllers } from '../src/core/controllers.js';

const schema = actions({ steer: axis(), throttle: axis(), horn: button() });
const fakeWorld = () => {
  const byId = new Map(); let next = 1;
  return { get: id => byId.get(id), spawn: (d = {}) => { const e = { id: next++, ...d }; byId.set(e.id, e); return e; }, despawn: e => byId.delete(e.id) };
};
const setup = () => {
  const ev = [], w = { current: fakeWorld() };
  const cs = createControllers(schema, { emit: (type, data) => ev.push({ type, ...data }), world: () => w.current });
  return { cs, ev, w };
};

test('seat 0 exists from the start as player 1 and can wrap an existing input (C-1)', () => {
  const input = createInput(schema);
  const cs = createControllers(schema, { input, emit() {}, world: () => undefined });
  assert.equal(cs.list.length, 1);
  const c = cs.list[0];
  assert.equal(c.seat, 0); assert.equal(c.player, 1); assert.equal(c.bot, false); assert.equal(c.pawn, null);
  assert.equal(c.input, input, 'seat 0 uses the input it was given');
});

test('possess copies the snapshot into e.input every step; buttons keep the snapshot shape (C-2, C-3)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], car = w.current.spawn({ tags: ['car'] });
  c.possess(car);
  assert.equal(c.pawn, car);
  assert.deepEqual(ev.at(-1), { type: 'controller.possess', seat: 0, player: 1, pawn: car.id });
  c.input.set({ steer: 0.5, horn: true }); cs.applyInputs(); cs.copy();
  assert.equal(car.input, c.input.snapshot, 'a pawn without its own input object gets the snapshot itself');
  assert.equal(car.input.steer, 0.5); assert.equal(car.input.horn.pressed, true);
});

test('a pawn with a net-made input object keeps its shape: only its keys, buttons as down (C-3, review focus)', () => {
  const { cs, w } = setup(), c = cs.list[0];
  const train = w.current.spawn({ net: 'train', input: { steer: 0, horn: false } }); // what install.js zeroActions makes
  c.possess(train);
  c.input.set({ steer: -1, throttle: 1, horn: true }); cs.applyInputs(); cs.copy();
  assert.deepEqual(train.input, { steer: -1, horn: true }, 'throttle is not in the kind, so it is not added');
});

test('one controller per pawn: possessing a held pawn takes it (C-2)', () => {
  const { cs, ev, w } = setup(), a = cs.list[0], bot = cs.make({ bot: true }), car = w.current.spawn({});
  a.possess(car); bot.possess(car);
  assert.equal(a.pawn, null); assert.equal(bot.pawn, car);
  assert.deepEqual(ev.slice(-2).map(e => [e.type, e.seat, e.reason]), [['controller.unpossess', 0, 'taken'], ['controller.possess', null, undefined]]);
});

test('possessing a new pawn releases the old one; unpossess clears it (C-2)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], a = w.current.spawn({}), b = w.current.spawn({});
  c.possess(a); c.possess(b);
  assert.equal(c.pawn, b);
  assert.deepEqual(ev.slice(-2).map(e => [e.type, e.pawn]), [['controller.unpossess', a.id], ['controller.possess', b.id]]);
  c.unpossess(); assert.equal(c.pawn, null); assert.equal(ev.at(-1).reason, 'unpossess');
  c.unpossess(); assert.equal(ev.at(-1).reason, 'unpossess', 'a second unpossess is a no-op (no new event)');
  assert.equal(ev.filter(e => e.type === 'controller.unpossess').length, 2);
});

test('a despawned pawn or a swapped World drops the pawn on the next copy (review focus)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], car = w.current.spawn({});
  c.possess(car); w.current.despawn(car); cs.copy();
  assert.equal(c.pawn, null); assert.equal(ev.at(-1).reason, 'despawned');
  const car2 = w.current.spawn({}); c.possess(car2); w.current = fakeWorld(); cs.copy();
  assert.equal(c.pawn, null, 'a scene change gave a new World');
});

test('possess rejects non-entities and replicas another peer simulates (review focus)', () => {
  const { cs, w } = setup(), c = cs.list[0];
  assert.throws(() => c.possess(null), /controller.possess: needs an entity/);
  assert.throws(() => c.possess({ id: 'x' }), /controller.possess: needs an entity/);
  const remote = w.current.spawn({ net: 'train' });
  w.current.net = { remoteOf: e => (e === remote ? {} : undefined) };
  assert.throws(() => c.possess(remote), /controller.possess: entity \d+ is simulated by another peer/);
});

test('bots have no seat or player and are driven by set/hold; dispose removes them (C-4)', () => {
  const { cs, ev, w } = setup(), bot = cs.make({ bot: true }), car = w.current.spawn({});
  assert.equal(bot.seat, null); assert.equal(bot.player, 0); assert.equal(bot.bot, true);
  assert.equal(cs.list.length, 2);
  bot.possess(car); bot.input.hold({ throttle: 1 }); cs.applyInputs(); cs.copy();
  assert.equal(car.input.throttle, 1);
  bot.dispose();
  assert.equal(cs.list.length, 1); assert.equal(car.input, bot.input.snapshot, 'the pawn keeps its last input');
  assert.equal(ev.at(-1).reason, 'left');
});

test('gate applies to every controller (U-9 for all seats)', () => {
  const { cs } = setup(), b = cs.make({ bot: true });
  cs.gate(true);
  assert.equal(cs.list[0].input.gated, true); assert.equal(b.input.gated, true);
  const late = cs.make({ bot: true }); assert.equal(late.input.gated, true, 'a controller made while gated starts gated');
  cs.gate(false); assert.equal(late.input.gated, false);
});

test('seats: join takes the lowest free player number, keeps seat order; leave frees it (C-1, C-5 sim side)', () => {
  const { cs, ev } = setup();
  cs.seat('join', 2); cs.seat('join', 1);
  assert.deepEqual(cs.list.map(c => [c.seat, c.player]), [[0, 1], [1, 3], [2, 2]]);
  assert.deepEqual(ev.filter(e => e.type === 'controller.joined').map(e => [e.seat, e.player]), [[2, 2], [1, 3]]);
  cs.seat('join', 1); assert.equal(cs.list.length, 3, 'joining an open seat is a no-op');
  cs.seat('leave', 2); assert.deepEqual(cs.list.map(c => c.seat), [0, 1]);
  cs.seat('join', 3); assert.equal(cs.list.find(c => c.seat === 3).player, 2, 'number 2 was freed');
  cs.seat('leave', 0); assert.equal(cs.list[0].seat, 0, 'seat 0 never leaves');
  for (const bad of [-1, 1.5, 16, '1']) assert.throws(() => cs.seat('join', bad), /lh.seat: seat must be an integer in 0..15/);
  assert.throws(() => cs.seat('swap', 1), /lh.seat: op must be 'join' or 'leave'/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/controllers.test.mjs`
Expected: FAIL with `Cannot find module '.../src/core/controllers.js'`.

- [ ] **Step 3: Write the module**

```js
// src/core/controllers.js
// [C-1]–[C-4] (spec §5.5): controllers, Unreal's APlayerController / AAIController. One per local seat (seat 0 always,
// player 1) plus bots; each has its own input over the game's one action schema. possess(e) makes e the pawn, one
// controller per pawn; copy() (lh.possess, each step) fills e.input from the snapshot ([I-4]). Sim-pure.
import { createInput } from './actions.js';

const MAX_SEAT = 15;

export function createControllers(schema, { input, emit, world }) {
  const list = [], holder = new Map(); // pawn -> controller
  let gated = false;
  const drop = (c, reason) => {
    const e = c.pawn; if (!e) return;
    c.pawn = null; holder.delete(e);
    emit('controller.unpossess', { seat: c.seat, player: c.player, pawn: e.id, reason });
  };
  const isEntity = e => e !== null && typeof e === 'object' && Number.isInteger(e.id);
  const make = ({ seat = null, bot = false, player = 0, input: own } = {}) => {
    const c = {
      seat, bot, player, input: own ?? createInput(schema), pawn: null,
      possess(e) {
        if (!isEntity(e)) throw new Error('controller.possess: needs an entity');
        if (e.net !== undefined && world()?.net?.remoteOf?.(e) !== undefined) throw new Error(`controller.possess: entity ${e.id} is simulated by another peer`);
        if (c.pawn === e) return c;
        drop(c, 'unpossess');
        const other = holder.get(e); if (other) drop(other, 'taken');
        c.pawn = e; holder.set(e, c);
        emit('controller.possess', { seat: c.seat, player: c.player, pawn: e.id });
        return c;
      },
      unpossess() { drop(c, 'unpossess'); return c; },
      dispose() { const i = list.indexOf(c); if (i < 0) return; drop(c, 'left'); list.splice(i, 1); },
    };
    if (gated) c.input.gate(true);
    // seats in seat order, then bots in creation order
    let at = list.length;
    if (seat !== null) { at = list.findIndex(x => x.seat === null || x.seat > seat); if (at < 0) at = list.length; }
    list.splice(at, 0, c);
    return c;
  };
  make({ seat: 0, player: 1, input });

  const freeNumber = () => { let n = 1; while (list.some(c => c.player === n)) n++; return n; };
  return {
    list, make,
    applyInputs() { for (let i = 0; i < list.length; i++) list[i].input.apply(); },
    gate(on) { gated = !!on; for (let i = 0; i < list.length; i++) list[i].input.gate(gated); },
    // [I-4]: a dead pawn (despawned, or from a World a scene change replaced) is dropped; a pawn whose e.input the net
    // layer made keeps its shape (only its keys, buttons as down); any other pawn reads the snapshot itself
    copy() {
      const w = world();
      for (let i = 0; i < list.length; i++) {
        const c = list[i], e = c.pawn; if (!e) continue;
        if (w === undefined || w.get(e.id) !== e) { drop(c, 'despawned'); continue; }
        const s = c.input.snapshot, I = e.input;
        if (I === undefined || I === s) { e.input = s; continue; }
        for (const k in I) if (k in s) { const v = s[k]; I[k] = typeof v === 'number' ? v : v.down; }
      }
    },
    // the lh.seat command's effect, offline numbering (solo/host: lowest free number); plan 3 asks the host online
    seat(op, seat) {
      if (op !== 'join' && op !== 'leave') throw new Error("lh.seat: op must be 'join' or 'leave'");
      if (!Number.isInteger(seat) || seat < 0 || seat > MAX_SEAT) throw new Error(`lh.seat: seat must be an integer in 0..${MAX_SEAT}`);
      const c = list.find(x => x.seat === seat);
      if (op === 'join') {
        if (c) return c;
        const n = make({ seat, player: freeNumber() });
        emit('controller.joined', { seat, player: n.player });
        return n;
      }
      if (!c || seat === 0) return null; // seat 0 is the page's first player and never leaves
      c.dispose(); emit('controller.left', { seat, player: c.player });
      return null;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/controllers.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/controllers.js test/controllers.test.mjs
git commit -m "feat(input): controllers with possession and bots (C-1..C-4)"
```

---

### Task 2: Wire controllers into the engine

**Files:**
- Modify: `src/core/engine.js` (input creation ~line 77, `sync()` gate ~line 89, the engine object ~line 355, `lh.input` ~line 427)
- Modify: `src/index.sim.js` (export `createControllers`)
- Test: `test/controllers.test.mjs` (append engine-level tests)

**Interfaces:**
- Consumes: `createControllers` from Task 1.
- Produces:
  - `engine.controllers` — the live list (`Array` of controllers, seat order then bots).
  - `engine.controller({ bot: true })` — makes a bot controller; `{ bot: false }` throws `engine.controller: only bots are made directly (seats join with the lh.seat command)`.
  - `engine.input === engine.controllers[0].input`.
  - Systems: `lh.input` applies every controller's input; `lh.possess` (stage `input.apply`, after `lh.commands`) runs `copy()`.
  - Builtin command `lh.seat { op, seat }` → `controllers.seat(op, seat)`.

- [ ] **Step 1: Write the failing tests (append)**

```js
// appended to test/controllers.test.mjs
import { defineGame, createEngine } from '../src/index.sim.js';

const game = defineGame({ id: 'ctl', start: 'field', actions: schema, scenes: { field: {}, other: {} } });

test('engine.input is seat 0; lh.possess fills e.input during input.apply (C-1, I-4)', () => {
  const e = createEngine(game);
  assert.equal(e.controllers.length, 1); assert.equal(e.input, e.controllers[0].input);
  const car = e.world.spawn({ tags: ['car'] }); e.controllers[0].possess(car);
  let seen;
  e.system('reader', en => { seen = en.world.get(car.id).input?.steer; }, { stage: 'input.apply', after: ['lh.possess'] });
  e.input.set({ steer: 0.25 }); e.stepN(1);
  assert.equal(seen, 0.25, 'a game system after lh.possess reads this step\'s input');
});

test('lh.seat joins and leaves seats through a command; events reach listeners (C-5 sim side)', () => {
  const e = createEngine(game), got = [];
  e.events.on(ev => { if (ev.type.startsWith('controller.')) got.push([ev.type, ev.seat, ev.player]); });
  e.command('lh.seat', { op: 'join', seat: 1 }); e.stepN(1);
  assert.deepEqual(e.controllers.map(c => c.seat), [0, 1]);
  e.command('lh.seat', { op: 'leave', seat: 1 }); e.stepN(1);
  assert.deepEqual(got, [['controller.joined', 1, 2], ['controller.left', 1, 2]]);
});

test('a scene change drops pawns from the old World (review focus)', () => {
  const e = createEngine(game), c = e.controllers[0];
  c.possess(e.world.spawn({})); e.go('other'); e.stepN(1);
  assert.equal(c.pawn, null);
});

test('a pausing menu gates every controller, not only seat 0 (U-9)', () => {
  const g = defineGame({ id: 'ctl-menu', start: 'field', actions: schema,
    scenes: { field: {}, menu: { pauses: true, input: 'menu', nav: { back: 'horn' } } } });
  const e = createEngine(g), bot = e.controller({ bot: true });
  e.overlay('menu'); e.stepN(1);
  assert.equal(e.controllers[0].input.gated, true); assert.equal(bot.input.gated, true);
  assert.throws(() => e.controller({}), /engine.controller: only bots are made directly/);
});
```

Check the `menu` scene shape against `test/menu-nav*.test.mjs` before running (the `input: 'menu'` and `nav` keys must match `checkNav`); adjust only the fixture, not the assertion.

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/controllers.test.mjs`
Expected: FAIL: `e.controllers` is undefined.

- [ ] **Step 3: Implement in `src/core/engine.js`**

1. Import: `import { createControllers } from './controllers.js';`
2. Replace `input = createInput(game.actions)` in the `const base = rng(seed), schedule = ..., input = createInput(game.actions);` line with:

```js
  const base = rng(seed), schedule = createSchedule(STEP_STAGES), input = createInput(game.actions);
  // [C-1]: seat 0's controller wraps `input`, so engine.input is unchanged; events and worlds exist later, hence the arrows
  const controllers = createControllers(game.actions, { input, emit: (t, d) => events.emit(t, d), world: () => worlds?.current });
```

(`worlds` is assigned after `installWorld`; declare it with `let` where it is declared today if it is a `const`. `events` is a `const` declared before any step runs, so the arrow is safe.)

3. In `sync()`, replace `input.gate(menuOwnsInput(game, sceneView.overlays));` with `controllers.gate(menuOwnsInput(game, sceneView.overlays));`.
4. In the engine object literal, after `game, seed: base.seed, events, input, loop, commands, loading, net,` add:

```js
    controllers: controllers.list, // [C-1] live: seats in seat order, then bots
    controller({ bot } = {}) {
      if (bot !== true) throw new Error('engine.controller: only bots are made directly (seats join with the lh.seat command)');
      return controllers.make({ bot: true });
    },
```

5. Replace the `lh.input` line and add `lh.possess` and the builtin:

```js
  schedule.add('lh.input', () => { controllers.applyInputs(); if (rec) recordInput(); }, { stage: 'input.apply' });
```

and after `schedule.add('lh.commands', deliverAll, ...)`:

```js
  schedule.add('lh.possess', () => controllers.copy(), { stage: 'input.apply', after: ['lh.commands'] }); // [I-4]
  engine.builtin('lh.seat', (e, d) => controllers.seat(d?.op, d?.seat)); // [C-5]: plan 3 routes it through the host online
```

6. In `src/index.sim.js` add `export { createControllers } from './core/controllers.js';` after the `actions.js` export.

- [ ] **Step 4: Run the new tests and the whole suite**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/controllers.test.mjs`
Expected: PASS, 14 tests.

Run: `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=2560 --test --test-concurrency=4 test/`
Expected: PASS with the same count as before plus 14 (record the before count first with the same command on the base commit). Browser suites need the shared browser; if they cannot start, run `test/*.test.mjs` without them and say which were skipped.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js src/index.sim.js test/controllers.test.mjs
git commit -m "feat(engine): engine.controllers, lh.possess and the lh.seat command (C-1..C-5, I-4)"
```

---

### Task 3: Per-seat tapes

**Files:**
- Modify: `src/core/engine.js` (`recordInput`, ~line 253)
- Modify: `testing/replay.js` (`apply`, ~line 31)
- Test: `test/replay-seats.test.mjs`

**Interfaces:**
- Consumes: `engine.controllers` (Task 2).
- Produces: a tape entry may carry `seats: { [seat]: { [action]: value } }` for seats other than 0 (seat 0 stays in `input`). `replay()` sets each seat's values on its controller before the step; a seat with recorded input but no controller throws `replay: seat <n> has input but no controller at step <k>`.

- [ ] **Step 1: Write the failing tests**

```js
// test/replay-seats.test.mjs
// [T-23]: tapes record input per seat; a tape without seats replays as seat 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, axis, button, defineGame, createEngine } from '../src/index.sim.js';
import { replay } from '../testing/replay.js';

const schema = actions({ steer: axis(), horn: button() });
const trace = [];
const game = defineGame({ id: 'seats-tape', start: 'field', actions: schema, scenes: { field: {} },
  setup(e) { e.system('trace', en => { if (en.controllers[1]) trace.push([en.time.step, en.controllers[1].input.snapshot.steer]); }, { stage: 'input.apply', after: ['lh.possess'] }); } });

test('seat 1 input is recorded under seats and replays the same (T-23)', () => {
  const e = createEngine(game, { record: true });
  e.command('lh.seat', { op: 'join', seat: 1 }); e.stepN(1);
  e.controllers[1].input.set({ steer: 0.5 }); e.stepN(1);
  e.controllers[1].input.set({ steer: -1 }); e.input.set({ horn: true }); e.stepN(1);
  e.stepN(1);
  const tape = e.tape();
  assert.ok(tape.log.some(x => x.seats?.[1]?.steer === 0.5));
  assert.ok(tape.log.some(x => x.input?.horn === true), 'seat 0 stays in input');
  // set() is one step only, so seat 1 reads 0.5, then -1, then 0 again; the replay must read the same
  trace.length = 0; replay(game, tape);
  assert.deepEqual(trace.filter(t => t[1] !== 0).map(t => t[1]), [0.5, -1]);
});

test('an old tape without seats replays as seat 0 (review focus)', () => {
  const old = { v: 1, game: 'seats-tape', seed: 1, scene: 'field', args: undefined, hz: 60, wall0: 0, log: [{ step: 0, input: { steer: 1 } }, { step: 2, input: { steer: 0 } }] };
  assert.doesNotThrow(() => replay(game, old));
});

test('a tape with seat input but no seat join throws a readable error', () => {
  const bad = { v: 1, game: 'seats-tape', seed: 1, scene: 'field', args: undefined, hz: 60, wall0: 0, log: [{ step: 0, seats: { 2: { steer: 1 } } }] };
  assert.throws(() => replay(game, bad), /replay: seat 2 has input but no controller at step 0/);
});
```

Read `testing/replay.js` in full before Step 3 and match the tape field names it uses (`scene`, `args`, `end`, `sums`); fix only the fixtures above if a field name differs.

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/replay-seats.test.mjs`
Expected: FAIL: no entry has `seats`.

- [ ] **Step 3: Implement**

In `src/core/engine.js`, replace `recordInput` with:

```js
  const recordInput = () => { // after the controllers' apply: each seat's changed values (axes as numbers, buttons as down)
    const seats = rec.seats ??= new Map(); // seat -> last recorded values; bots are sim-driven and not recorded
    const cs = controllers.list;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i]; if (c.seat === null) continue;
      const kinds = c.input.kinds, snap = c.input.snapshot;
      let last = seats.get(c.seat);
      if (!last) seats.set(c.seat, last = Object.fromEntries(Object.keys(kinds).map(n => [n, kinds[n] === 'axis' ? 0 : false])));
      for (const n in last) {
        const v = kinds[n] === 'axis' ? snap[n] : snap[n].down;
        if (v === last[n]) continue;
        last[n] = v;
        const x = entryAt(step);
        if (c.seat === 0) (x.input ??= {})[n] = v; else ((x.seats ??= {})[c.seat] ??= {})[n] = v;
      }
    }
  };
```

(Delete the old `rec.last` line; nothing else reads `rec.last` — confirm with `grep -n 'rec.last' src/core/engine.js`.) A seat that leaves and rejoins keeps its `last` values, so a rejoin records only real changes.

In `testing/replay.js`, keep a per-seat values map next to `vals` and set it before every step:

```js
  const seatVals = new Map(); // seat -> recorded values so far (seat 0 is vals)
  const apply = k => {
    const x = at.get(k); if (!x) return;
    for (const o of x.ops ?? []) op(o);
    if (x.input) Object.assign(vals, x.input);
    for (const s in x.seats ?? {}) Object.assign(seatVals.get(+s) ?? (seatVals.set(+s, {}), seatVals.get(+s)), x.seats[s]);
  };
```

and where it does `apply(k); e.input.set(vals); h.step(1);`:

```js
    apply(k); e.input.set(vals);
    for (const [s, v] of seatVals) {
      const c = e.controllers.find(x => x.seat === s);
      if (!c) throw new Error(`replay: seat ${s} has input but no controller at step ${k}`);
      c.input.set(v);
    }
    h.step(1);
```

Seat input is first recorded on the step after its `lh.seat` command was delivered, so the controller exists by the time its values are set.

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/replay-seats.test.mjs test/replay*.test.mjs test/record*.test.mjs`
Expected: PASS (the existing replay and record suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js testing/replay.js test/replay-seats.test.mjs
git commit -m "feat(test): tapes record and replay input per seat (T-23)"
```

---

### Task 4: Spec status and allocation check

**Files:**
- Modify: `docs/spec.md` ([C-1]–[C-4], [I-4], [T-23] lines; the amendment line)
- Test: `test/alloc-rate.test.mjs`, `test/checks-alloc.test.mjs` (run, not changed)

- [ ] **Step 1: Run the allocation suites**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/alloc-rate.test.mjs test/checks-alloc.test.mjs`
Expected: PASS. If `lh.possess` or the per-controller apply allocates per step, fix the code (no closures or arrays per step), not the budget.

- [ ] **Step 2: Mark the requirements built**

In `docs/spec.md`, change the amendment line's "Draft, not yet built." to "Built in 0.13 (plan 1): [C-1]–[C-4], [I-4], [T-23]; the rest is draft." and add "(built, plan 1)" after the bold label of each of [C-1], [C-2], [C-3], [C-4], [T-23].

- [ ] **Step 3: Commit**

```bash
git add docs/spec.md
git commit -m "docs(spec): controllers and per-seat tapes built"
```

---

## Plans 2–5

Written after this plan lands, against the code as built (their interfaces depend on Task 1–3's names): `2026-10-21-local-players-2-seats.md` (view: seats, devices, `join`, contexts, bindings), `-3-net.md` (identity), `-4-haptics.md` (haptics lifecycle, fake pads, `?debug=pads`), `-5-migrate.md` (Tractor, Rally, Pig Pens, release).
