# Local players 2: seats, devices, pairing, mapping contexts and profiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page can seat several local players. Each seat holds its own devices (pads, keyboard schemes, touch, a game's own kinds) and drives its own controller from plan 1. A pad joins a seat on its first press, and a seat keeps its player when a pad drops out. Each seat has its own stack of mapping contexts and its own player-mappable bindings, saved per profile and per device id. A page that never calls `view.seats()` has one seat holding every device, so existing games and tests are unchanged.

**Architecture:** A new view module `src/view/seats.js` owns the seats (`view.localPlayers`). It is a driver device, polled once per frame before the game's devices. It reads `getGamepads()` and follows the sim's controllers through `engine.controllerOf(seat)`. It opens and closes seats only with the `lh.seat` command. Each of a seat's (device, context) pairs is one `bindGamepad` / `bindKeyboard` / touch module, built with `{ input: controller.input }` as its engine. It writes the seat's controller input under its own source name. `src/view/contexts.js` holds the pure parts: checking contexts and resolving a seat's stack with overrides into binding sets. `src/view/profiles.js` holds the guarded `localStorage` reads and writes. `src/view/boot.js` builds the seats and exposes `view.seats`, `view.context`, `view.device`, `view.onSeat`, `view.unpaired` and `view.localPlayers`.

**Tech Stack:** plain ES modules, `node:test`, happy-dom (already a dev dependency) for keyboard events, no new dependencies.

**Spec:** `docs/spec.md` §5.5 [C-5]–[C-13]; `docs/plans/2026-10-21-local-players-spec.md` §3, §4.1 and §10; `docs/research-players.md` §5–§6 (pads hidden until a press, index reuse, Chromium snapshots, `id` names the product).

**Builds on plan 1 (as fixed 2026-10-21):** `engine.controllers` (live list), `engine.controllerOf(seat)` (the seat's controller or `undefined`), the builtin command `lh.seat { op: 'join' | 'leave', seat }` (a seat takes the lowest free player number and keeps it while playing), and `controller.input` with the full `createInput` surface (`device(p, source)`, `clearDevice(source)`, `snapshot`, `kinds`). Seats never call `controller.dispose()`, which throws for seated controllers.

## Design decisions

| Question | Decision | Why |
|---|---|---|
| Where seat state lives | `src/view/seats.js`, created by `boot` for every page | Seats are view-only (`ULocalPlayer`). The sim only sees `lh.seat` and the controllers. |
| How a seat's devices write | One device module per (device, context), with engine `{ input: controller.input }`, sources `pad:<index>:<context>`, `keys:<scheme>:<context>` (touch modules keep their own) and `<kind>:<key>` for a game kind | The existing modules write `engine.input` only, so they are reused unchanged. Per-context sources keep each context's `map`, `ramps` and `deadZone`, and removing a context is one `clearDevice`. |
| Which pad a binding reads | A reused filtered copy of this frame's `Gamepad`, given to `bindGamepad` through `getGamepads: () => [copy]` | One module per pad, without changing `bindGamepad`. The copy is where the pairing mask lives. |
| Join on first press | Each frame, poll pads. For an index that no seat holds, a button going down or an axis going past `JOIN_AXIS` (0.5) from centre is a press. A press tries regain first, then `join(dev)` | Browsers show a pad only after a press, so the reveal is the join (research §5). Edges (not levels) call `join` once per press. |
| Seat open / close | `engine.command('lh.seat', …)`. A seat is `pending` until `engine.controllerOf(seat)` returns a controller (the step after the command ran). It binds on the next frame's sync | The view never writes the sim. Plan 3 can delay the controller online with no view change. |
| A seat the sim opens or closes | The view follows `engine.controllers` each frame | Replays and game commands may call `lh.seat` themselves. |
| Disconnects | Polling: the slot is empty, `connected === false`, or the slot holds a different `id`. Polling is used, not the `gamepaddisconnected` event | One tested code path. It also catches an unplug and replug between two polls. |
| Default `join` | Seat 0 while seat 0 holds no pad, else `'new'` (nothing past `max`) | The keyboard starts on seat 0. With a literal `'new'`, a solo pad player would be player 2. |
| Keyboard and touch | Every keyboard scheme and the one touch device start on seat 0. A released scheme joins on its next key. Touch moves only by `claim` | §10: the keyboard is one device (`scheme: 'all'`) on seat 0, and touch is one device on seat 0 unless claimed. |
| Context entry shape | `pads: [{ match, bindings, map, mappable }]`, `keys: { [scheme]: { bindings, ramps, map, mappable } }`, `touch: target => devices` | `bindings` is exactly `bindGamepad`'s or `bindKeyboard`'s object ([I-2]). The device options sit beside it, so a key named `map` can never clash. |
| Mappable inputs | `mappable: { Brake: 'button:6' }` names the default input. Pad inputs are `'button:<i>'` / `'axis:<i>'`, keys use `bindKeyboard`'s lower-case key. `map()` moves the binding there, replacing what was there, same kind only | One string names an input across `get`, `map`, `capture` and the saved data. Same-kind moves never turn an axis binding into a button. |
| Profiles | `localStorage['lh.bindings.<game.id>.<profile>'] = { 'pad:<Gamepad.id>' \| 'keys:<scheme>': { [name]: input } }`. Every access is in try/catch. Junk is dropped field by field | Spec [C-13]. A wheel's overrides never reach a gamepad. Safari private mode, a full quota or bad JSON fall back to the defaults. |
| `capture()` | Resolves `{ device, input }` with the next pad button edge, axis edge or key from this seat's own devices. `cancel()`, a second `capture()` or the seat leaving resolve `null` | Remap screens need one answer and a way out. Another seat's pad must not answer. |
| Seat events | `view.onSeat(fn)` (view-side, never `engine.events`): `seat.joined` / `seat.left` (`device: null`), `seat.device` (`op: 'add' \| 'remove'`), `seat.lost`, `seat.regained` | View events must not enter the sim's event log, or replays and headless runs would differ. |
| No `view.seats()` call | One seat 0 holding keys, touch and every pad as it appears. Seats bind nothing until a context is added | Today's behaviour: games pass their own `devices` and nothing changes. |
| `lh.seat` offline | Applied at the next step (no host), per §10 | Plan 3 adds the host wait. |

## Global Constraints

- Sim purity: nothing in `src/core` or `src/sim` changes. `navigator`, `localStorage` and the DOM are reached only from `src/view/` (spec §1.2; `test/purity*.test.mjs` must still pass).
- Existing games and tests are unchanged: without `view.seats()` and without contexts, seats write no input and add no source to `engine.input`. `boot`'s game `devices` keep writing `engine.input` as today. Menus stay shared: `menuNav` and `padEdges` keep merging every pad.
- The existing device modules (`gamepad.js`, `keyboard.js`, `touch.js`, `mapPair.js`) are not changed. Contexts use their binding shapes, including `map` ([I-2]).
- Allocation-free per frame in steady state (R-8): no closures, arrays or strings per frame in `seats.update` with pads held and contexts bound. Allocation happens only when a device appears, pairs, is lost or rebinds.
- Error messages use the engine's `'<area>: <what>'` form (`seats: …`, `context '<name>': …`, `bindings.map: …`).
- Out of scope: haptics lifecycle, fake-pad actuators, `?debug=pads` (plan 4), network identity (plan 3).
- Do not touch `src/core/engine.js` or `test/controllers.test.mjs` (plan 1 is in progress there).
- Commits: conventional messages, no `Co-Authored-By` trailer (user rule).
- Tests run under the memory cap, from the engine root: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test <files>`.

## Review Focus

- **The press that pairs a pad also fires a game action** (the A that joins also pulls the handbrake). Buttons held at pairing stay masked until they are let go. Pinned by Task 4's `the press that pairs a pad is not also a game input`.
- **Index reuse silently hands a seat to another pad.** An unplug and a different pad on the same index between two polls must mark the old device lost, and the new pad pairs only on a press. Pinned by Task 3's `index reuse: another product on a held pad's index…`.
- **Binding into a controller that does not exist yet, or that has already gone.** A pending seat binds nothing until `engine.controllerOf(seat)` returns its controller. A seat that leaves before then never binds and goes once the sim has run both commands. Pinned by Task 2's `a seat that leaves before its controller exists…`.
- **Saved bindings break or leak.** A store that throws, or holds junk, must fall back to the defaults without throwing. One device id's overrides must never apply to another model. Pinned by Task 5's `storage that throws or holds junk…` and `overrides are per device id…`.
- **Games that never call `view.seats()` change behaviour.** Seats must write nothing by themselves, and a game's own `bindGamepad` must see the same pads and the same reveal press as today. Pinned by Task 1's `seats write nothing to any input by themselves…` and Task 7's `boot without view.seats()…`.

---

## File map

| File | Change |
|---|---|
| `src/view/seats.js` | **new.** `createSeats(engine, { getGamepads, target, doc, storage })`: seats, devices, pad polling, pairing, loss and regain, contexts per seat, bindings and capture, game device kinds. |
| `src/view/contexts.js` | **new.** `checkContext`, `resolvePad`, `resolveKeys`, `resolveTouch`, `mappableOf`, `schemeKeysOf`, `inputKind`. Pure. |
| `src/view/profiles.js` | **new.** `createProfiles({ game, storage })`, `deviceKey(dev)`. Guarded `localStorage`. |
| `src/view/boot.js` | Build seats before the game's devices. Add `view.seats`, `view.context`, `view.device`, `view.onSeat`, `view.unpaired` and `view.localPlayers`. New boot option `storage`. |
| `test/helpers/seats.mjs` | **new.** Test game, fake Gamepads, `setup()` harness, in-memory storage. |
| `test/seats.test.mjs` | **new.** Default seat, native pads, loss, pairing, regain, claim and release, game kinds. |
| `test/seat-contexts.test.mjs` | **new.** Contexts, the stack, keyboard schemes, the pairing mask. |
| `test/seat-bindings.test.mjs` | **new.** Mappable bindings, profiles, storage failures, capture. |
| `test/seats-boot.test.mjs` | **new.** Boot wiring, no-seats compatibility, and the allocation check. |
| `docs/spec.md` | Mark [C-5]–[C-13] built and record this plan's rulings. |

---

### Task 1: Seats module — one seat, devices, native pads, loss

**Files:**
- Create: `src/view/seats.js`
- Create: `test/helpers/seats.mjs`
- Test: `test/seats.test.mjs`

**Interfaces:**
- Consumes: `engine.controllerOf(0)` (plan 1).
- Produces:
  - `createSeats(engine, { getGamepads, target, doc })` → `{ list, on(fn) → off, update(dt, raw), dispose() }`.
  - `JOIN_AXIS = 0.5` (exported).
  - A seat: `{ seat, controller, pending, devices, pad, pads, lost }`. `pads` is this frame's `Gamepad` objects for the seat's live pads. `pad` is the one pressed last (else the first). `lost` is true while any device is lost.
  - Devices: `{ kind: 'keys', scheme: 'all' }`, `{ kind: 'touch' }`, `{ kind: 'pad', index, id, mapping, lost }`. Each device is a stable object.
  - Events to `on(fn)`: `{ type: 'seat.device', seat, device, op: 'add' | 'remove' }`, `{ type: 'seat.lost', seat, device }`.

- [ ] **Step 1: Write the test kit**

```js
// test/helpers/seats.mjs
// Seats test kit (plan 2026-10-21-local-players-2): a game, fake Gamepads, a createSeats harness on happy-dom, storage.
import { actions, axis, button, defineGame, createEngine } from '../../src/index.sim.js';
import { createSeats } from '../../src/view/seats.js';
import { dom } from './dom.mjs';

export const schema = actions({ steer: axis(), gas: axis(), brake: axis(), horn: button() });
export const game = defineGame({ id: 'seats', start: 'field', actions: schema, scenes: { field: {} } });
export const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
export const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
export const WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';
// a fresh Gamepad snapshot every call, as Chromium hands out (research §5)
export const pad = (index, { id = XBOX, mapping = id === WHEEL ? '' : 'standard', down = [], axes = [0, 0, 0, 0] } = {}) => ({
  index, id, mapping, connected: true, axes: axes.slice(),
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
export const memory = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
export function setup(opts = {}) {
  const { window, document } = dom(), e = createEngine(game), slots = [], ev = [];
  const seats = createSeats(e, { getGamepads: () => slots, target: window, doc: document, storage: null, ...opts });
  seats.on(x => ev.push(x.op === undefined ? [x.type, x.seat, x.device?.kind ?? null] : [x.type, x.seat, x.device.kind, x.op]));
  const frame = () => seats.update(1 / 60, 1 / 60);
  const key = (type, k) => document.body.dispatchEvent(new window.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  return { e, seats, slots, ev, frame, key, window, document };
}
```

- [ ] **Step 2: Write the failing tests**

```js
// test/seats.test.mjs
// [C-5]–[C-9]: seats, devices, native pads, pairing, loss and regain (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, XBOX, WHEEL } from './helpers/seats.mjs';

test('without enable() one seat holds every device: keyboard, touch and each pad as it appears (C-5, C-6)', () => {
  const { e, seats, slots, ev, frame } = setup();
  assert.equal(seats.list.length, 1);
  const lp = seats.list[0];
  assert.equal(lp.seat, 0); assert.equal(lp.controller, e.controllerOf(0)); assert.equal(lp.pending, false);
  assert.deepEqual(lp.devices, [{ kind: 'keys', scheme: 'all' }, { kind: 'touch' }]);
  slots[0] = pad(0); frame();
  slots[2] = pad(2, { id: WHEEL }); frame();
  assert.deepEqual(lp.devices.slice(2).map(d => [d.kind, d.index, d.id, d.lost]), [['pad', 0, XBOX, false], ['pad', 2, WHEEL, false]]);
  assert.deepEqual(ev, [['seat.device', 0, 'pad', 'add'], ['seat.device', 0, 'pad', 'add']]);
});

test("lp.pads and lp.pad are this frame's Gamepad objects; lp.pad is the pad pressed last (C-7)", () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1); frame();
  assert.equal(lp.pads[0], slots[0]); assert.equal(lp.pads[1], slots[1]); assert.equal(lp.pad, slots[0], 'no press yet: the first pad');
  slots[0] = pad(0); slots[1] = pad(1, { down: [0] }); frame(); // new snapshot objects every poll
  assert.equal(lp.pads[0], slots[0]); assert.equal(lp.pad, slots[1]);
  slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(lp.pad, slots[1], "still the pad used last, as this frame's object");
  slots[0] = pad(0, { axes: [0, 0.8, 0, 0] }); frame();
  assert.equal(lp.pad, slots[0], 'an axis past JOIN_AXIS counts as use');
});

test('a pad gone from its slot, disconnected or replaced by another product is lost; the seat keeps its controller (C-9)', () => {
  const { e, seats, slots, ev, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1); slots[2] = pad(2); frame();
  const [a, b, c] = lp.devices.slice(2); ev.length = 0;
  slots[0] = null; slots[1] = { ...pad(1), connected: false }; frame();
  assert.deepEqual([a.lost, b.lost, c.lost], [true, true, false]);
  assert.equal(lp.lost, true); assert.equal(lp.controller, e.controllerOf(0));
  assert.deepEqual(ev, [['seat.lost', 0, 'pad'], ['seat.lost', 0, 'pad']]);
  slots[2] = pad(2, { id: WHEEL }); frame(); // unplugged and another product in the same slot between two polls
  assert.equal(c.lost, true);
  assert.equal(lp.pads.length, 1); assert.equal(lp.pads[0], slots[2]);
  assert.equal(ev.filter(x => x[0] === 'seat.lost').length, 3);
});

test('seats write nothing to any input by themselves: a game without contexts keeps its own devices (review focus)', () => {
  const { e, slots, frame } = setup();
  e.input.device = () => assert.fail("seats wrote seat 0's input");
  e.input.clearDevice = () => assert.fail('seats cleared a source');
  slots[0] = pad(0, { down: [0], axes: [1, 0, 0, 0] }); frame();
  slots[0] = null; frame();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: FAIL with `Cannot find module '.../src/view/seats.js'`.

- [ ] **Step 4: Write the module**

Keep the order below. The `// seat 0` block must stay last before `return`, because it calls `makeSeat`, which later tasks make use every function defined above it.

```js
// src/view/seats.js
// [C-5]–[C-9] (spec §5.5): seats, Unreal's ULocalPlayer. A seat holds devices and drives the controller of its seat
// number ([C-1]). The view never writes the sim: a seat opens and closes through the lh.seat command and follows
// engine.controllerOf(seat). Without enable() the page has one seat holding every device, today's behaviour.
// A driver device: polls getGamepads() once per frame, before the game's devices. Nothing here runs in the sim.
export const JOIN_AXIS = 0.5; // an axis past this from centre is a press (join, regain, capture, lp.pad)
const NO = Object.freeze([]);

export function createSeats(engine, { getGamepads, target = globalThis, doc } = {}) {
  const get = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? []);
  doc ??= target.document ?? globalThis.document;
  const list = [], listeners = [];
  const slots = [];              // slots[index]: the connected pad device at that Gamepad index
  const info = new Map();        // device -> internal state (pads: this frame's Gamepad, edges)
  const holder = new Map();      // device -> the seat holding it
  const usedLast = new WeakMap(); // seat -> the pad device it pressed last ([C-7])
  const known = new Set();       // every device this page has
  let opts = null, losses = 0;

  const emit = (type, seat, device, op) => {
    const e = op === undefined ? { type, seat, device } : { type, seat, device, op };
    for (let i = 0; i < listeners.length; i++) listeners[i](e);
  };
  const on = fn => {
    if (typeof fn !== 'function') throw new Error('seats.on: needs a function');
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  };
  const seatOf = n => { for (let i = 0; i < list.length; i++) if (list[i].seat === n) return list[i]; return undefined; };
  const changed = lp => {}; // a seat's devices or contexts changed: Task 4 rebuilds its bindings here
  const paired = dev => {}; // a device was just paired to a seat: Task 4 masks the buttons held right now

  const makeSeat = (seat, controller) => {
    const lp = { seat, controller, pending: controller === null, devices: [], pad: null, pads: [], lost: false };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    return lp;
  };

  const newPad = (p, index) => {
    const dev = { kind: 'pad', index, id: String(p.id ?? ''), mapping: String(p.mapping ?? ''), lost: false };
    info.set(dev, { live: p, btn: [], hot: [], edge: false, kind: null, at: -1, lostAt: 0 });
    known.add(dev);
    return dev;
  };
  // s.edge: a button went down, or an axis went past JOIN_AXIS, this frame; s.kind / s.at name the first such input
  const edges = (s, p) => {
    s.edge = false;
    const b = p.buttons ?? NO, a = p.axes ?? NO;
    for (let i = 0; i < b.length; i++) { const d = b[i]?.pressed === true; if (d && !s.btn[i] && !s.edge) { s.edge = true; s.kind = 'button'; s.at = i; } s.btn[i] = d; }
    for (let i = 0; i < a.length; i++) { const h = Math.abs(a[i] ?? 0) > JOIN_AXIS; if (h && !s.hot[i] && !s.edge) { s.edge = true; s.kind = 'axis'; s.at = i; } s.hot[i] = h; }
  };

  const attach = (lp, dev) => {
    const from = holder.get(dev); if (from === lp) return;
    if (from !== undefined) detach(from, dev);
    holder.set(dev, lp); lp.devices.push(dev); paired(dev);
    emit('seat.device', lp.seat, dev, 'add'); changed(lp);
  };
  const detach = (lp, dev) => {
    const i = lp.devices.indexOf(dev); if (i >= 0) lp.devices.splice(i, 1);
    holder.delete(dev); if (usedLast.get(lp) === dev) usedLast.delete(lp);
    emit('seat.device', lp.seat, dev, 'remove'); changed(lp);
  };
  // [C-9] a pad gone from its slot (or replaced there by another product) is lost: its seat keeps it, marked, and keeps
  // its controller and player; an unpaired lost pad is forgotten
  const lose = dev => {
    if (slots[dev.index] === dev) slots[dev.index] = undefined;
    const s = info.get(dev); s.live = null; s.lostAt = ++losses; dev.lost = true;
    const lp = holder.get(dev);
    if (lp === undefined) { info.delete(dev); known.delete(dev); return; }
    emit('seat.lost', lp.seat, dev); changed(lp);
  };
  // an unpaired device pressed (or, with one seat for everything, first seen): returns the device that now stands for it
  const offer = dev => { attach(list[0], dev); return dev; };

  const refresh = () => {
    for (let k = 0; k < list.length; k++) {
      const lp = list[k], ds = lp.devices; let n = 0, lost = false;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i]; if (d.lost) { lost = true; continue; }
        if (d.kind === 'pad') lp.pads[n++] = info.get(d).live;
      }
      if (lp.pads.length !== n) lp.pads.length = n;
      lp.lost = lost;
      let last = usedLast.get(lp);
      if (last === undefined || last.lost) { last = undefined; for (let i = 0; i < ds.length; i++) if (ds[i].kind === 'pad' && !ds[i].lost) { last = ds[i]; break; } }
      lp.pad = last === undefined ? null : info.get(last).live;
    }
  };
  const poll = () => {
    const pads = get() ?? NO;
    for (let i = 0; i < slots.length; i++) {
      const dev = slots[i]; if (dev === undefined) continue;
      const p = pads[i];
      if (!p || p.connected === false || String(p.id ?? '') !== dev.id) lose(dev);
    }
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; if (!p || p.connected === false) continue;
      let dev = slots[i], fresh = false;
      if (dev === undefined) { dev = slots[i] = newPad(p, i); fresh = true; }
      const s = info.get(dev); s.live = p; edges(s, p);
      if (!holder.has(dev) && (s.edge || (fresh && opts === null))) dev = offer(dev);
      const lp = holder.get(dev);
      if (lp !== undefined && s.edge) usedLast.set(lp, dev);
    }
  };

  // seat 0 (keep this block last, before return): [C-8] the keyboard and touch start here
  const keys = { kind: 'keys', scheme: 'all' }, touch = { kind: 'touch' };
  const keysBy = new Map([['all', keys]]); // scheme -> keyboard device
  known.add(keys); known.add(touch);
  const zero = makeSeat(0, engine.controllerOf(0));
  zero.devices.push(keys, touch); holder.set(keys, zero); holder.set(touch, zero);

  return {
    list, // view.localPlayers, in seat order
    on,
    update() { poll(); refresh(); },
    dispose() { listeners.length = 0; },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/view/seats.js test/helpers/seats.mjs test/seats.test.mjs
git commit -m "feat(view): seats module with one default seat, native pads and pad loss (C-5..C-7, C-9)"
```

---

### Task 2: Pairing through the join hook; pending seats; leave

**Files:**
- Modify: `src/view/seats.js`
- Test: `test/seats.test.mjs` (append)

**Interfaces:**
- Consumes: `engine.command('lh.seat', { op, seat })`, `engine.controllerOf(seat)`, `engine.controllers`, `engine.time.step` (plan 1).
- Produces:
  - `seats.enable({ max = 4, join } = {})`: `max` is an integer in 1..16. `join(dev)` returns a seat number (add to it, opening it if needed), `'new'` (the lowest free seat below `max`, nothing if none), or `null` (ignore). Otherwise it throws `seats: join must return a seat number in 0..<max-1>, 'new' or null`.
  - Seats gain `leaving` and `leave()`. `seats.list[0].leave()` throws `seats: seat 0 never leaves`.
  - Events `{ type: 'seat.joined' | 'seat.left', seat, device: null }`.

- [ ] **Step 1: Write the failing tests (append)**

```js
// appended to test/seats.test.mjs
test('with enable(), a pad joins on its first press: seat 0 while it has no pad, then a new seat (C-8)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0); frame();
  assert.equal(seats.list[0].devices.length, 2, 'seen without a press: unpaired');
  slots[0] = pad(0, { down: [0] }); frame();
  assert.equal(seats.list[0].devices[2].index, 0);
  slots[1] = pad(1, { down: [9] }); frame();
  const lp = seats.list[1];
  assert.equal(lp.seat, 1); assert.equal(lp.pending, true); assert.equal(lp.controller, null); assert.equal(lp.devices[0].index, 1);
  assert.equal(e.controllerOf(1), undefined, 'the sim has not run the command yet');
  frame(); assert.equal(lp.pending, true, 'frames alone do not make the controller');
  e.stepN(1); frame();
  assert.equal(lp.pending, false); assert.equal(lp.controller, e.controllerOf(1)); assert.equal(lp.controller.player, 2);
  assert.deepEqual(ev.filter(x => x[0] === 'seat.joined'), [['seat.joined', 1, null]]);
});

test('join decides: a seat number adds to that seat (opening it), null ignores, a bad answer throws; once per press (C-8)', () => {
  const asked = [], { seats, slots, frame } = setup();
  seats.enable({ max: 3, join: dev => { asked.push(dev.index); return dev.index === 0 ? null : dev.index < 3 ? 2 : 7; } });
  slots[0] = pad(0, { down: [0] }); frame(); frame();
  assert.deepEqual(asked, [0], 'a held button is one press'); assert.equal(seats.list.length, 1);
  slots[0] = pad(0); frame(); slots[0] = pad(0, { down: [0] }); frame();
  assert.deepEqual(asked, [0, 0], 'a new press asks again');
  slots[1] = pad(1, { down: [0] }); slots[2] = pad(2, { down: [1] }); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0, 2]); assert.deepEqual(seats.list[1].devices.map(d => d.index), [1, 2]);
  slots[3] = pad(3, { down: [0] });
  assert.throws(frame, /seats: join must return a seat number in 0..2, 'new' or null/);
  assert.throws(() => seats.enable({ max: 0 }), /seats: max must be an integer in 1..16/);
  assert.throws(() => seats.enable({ join: 'new' }), /seats: join must be a function/);
});

test('the default join opens seats until max, then ignores presses (C-8)', () => {
  const { e, seats, slots, frame } = setup(); seats.enable({ max: 2 });
  for (let i = 0; i < 3; i++) slots[i] = pad(i, { down: [0] });
  frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.devices.filter(d => d.kind === 'pad').map(d => d.index)]), [[0, [0]], [1, [1]]]);
  e.stepN(1); frame();
  assert.equal(e.controllers.filter(c => c.seat !== null).length, 2);
});

test('leave: lh.seat leave runs, the seat goes with its controller and its pads become unpaired; seat 0 never leaves (C-5)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const lp = seats.list[1], dev = lp.devices[0];
  lp.leave(); frame();
  assert.equal(seats.list.length, 2, 'still there until the sim has run the command');
  e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0]); assert.equal(e.controllerOf(1), undefined);
  assert.deepEqual(ev.slice(-2), [['seat.device', 1, 'pad', 'remove'], ['seat.left', 1, null]]);
  slots[1] = pad(1); frame(); slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(seats.list[1].devices[0], dev, 'the same pad joins again on a new press');
  assert.throws(() => seats.list[0].leave(), /seats: seat 0 never leaves/);
});

test('a seat that leaves before its controller exists never binds and goes once the sim has run both commands (review focus)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame();
  const lp = seats.list[1]; assert.equal(lp.pending, true);
  lp.leave(); frame();
  assert.equal(seats.list.includes(lp), true, 'kept until the sim has run the commands');
  e.stepN(1); frame();
  assert.equal(seats.list.includes(lp), false); assert.equal(lp.controller, null); assert.equal(e.controllerOf(1), undefined);
  assert.equal(ev.some(x => x[0] === 'seat.joined'), false);
  assert.deepEqual(ev.slice(-2), [['seat.device', 1, 'pad', 'remove'], ['seat.left', 1, null]]);
});

test('a seat the sim opens or closes by itself is followed by the view (C-5)', () => {
  const { e, seats, ev, frame } = setup(); seats.enable();
  e.command('lh.seat', { op: 'join', seat: 3 }); e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.pending, s.controller === e.controllerOf(s.seat)]), [[0, false, true], [3, false, true]]);
  e.command('lh.seat', { op: 'leave', seat: 3 }); e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0]);
  assert.deepEqual(ev, [['seat.joined', 3, null], ['seat.left', 3, null]]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: FAIL: `TypeError: seats.enable is not a function` (the 4 Task 1 tests still pass).

- [ ] **Step 3: Implement in `src/view/seats.js`**

1. After `let opts = null, losses = 0;` add:

```js
  const leftAt = new WeakMap(); // leaving seat -> engine.time.step when leave() was called
```

2. Replace `makeSeat` with:

```js
  const makeSeat = (seat, controller) => {
    const lp = { seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false, leave: () => leave(lp) };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    return lp;
  };
```

3. Replace `offer` with:

```js
  // [C-8] an unpaired device pressed (or, with one seat for everything, first seen): returns the device that now stands for it
  const offer = dev => {
    if (opts === null) { attach(list[0], dev); return dev; }
    const r = opts.join(dev);
    if (r === null || r === undefined) return dev;
    let seat = r;
    if (r === 'new') { seat = freeSeat(); if (seat < 0) return dev; }
    else if (!Number.isInteger(r) || r < 0 || r >= opts.max) throw new Error(`seats: join must return a seat number in 0..${opts.max - 1}, 'new' or null`);
    attach(seatOf(seat) ?? open(seat), dev);
    return dev;
  };
  // the default join: seat 0 while it holds no pad (the keyboard sits there, so a solo pad player is player 1), else a new seat
  const defaultJoin = dev => (dev.kind === 'pad' && !seatOf(0).devices.some(d => d.kind === 'pad') ? 0 : 'new');
  const enable = ({ max = 4, join } = {}) => {
    if (!Number.isInteger(max) || max < 1 || max > 16) throw new Error('seats: max must be an integer in 1..16');
    if (join !== undefined && typeof join !== 'function') throw new Error('seats: join must be a function');
    opts = { max, join: join ?? defaultJoin };
  };
  const freeSeat = () => { for (let n = 0; n < opts.max; n++) if (seatOf(n) === undefined) return n; return -1; };
  // [C-5] a seat opens pending: lh.seat runs at the next step (offline; plan 3 asks the host), then sync() finds its controller
  const open = seat => { const lp = makeSeat(seat, null); engine.command('lh.seat', { op: 'join', seat }); return lp; };
  const leave = lp => {
    if (lp.seat === 0) throw new Error('seats: seat 0 never leaves');
    if (lp.leaving) return;
    lp.leaving = true; leftAt.set(lp, engine.time.step); changed(lp);
    engine.command('lh.seat', { op: 'leave', seat: lp.seat });
  };
  // a seat goes: out of the list first (so changed() binds nothing), its devices back to unpaired, lost ones forgotten
  const drop = lp => {
    list.splice(list.indexOf(lp), 1);
    for (let i = lp.devices.length - 1; i >= 0; i--) { const d = lp.devices[i]; detach(lp, d); if (d.lost) { info.delete(d); known.delete(d); } }
    emit('seat.left', lp.seat, null);
  };
  // the view follows the sim's controllers: a pending seat binds once its controller exists; a leaving seat goes once
  // its controller is gone after a step; a seat whose controller vanished goes; a seat the sim opened itself appears.
  // Steady state (a ready seat whose controller is still listed) only does an includes() check, so the frame allocates nothing.
  const sync = () => {
    const cs = engine.controllers;
    for (let k = list.length - 1; k >= 0; k--) {
      const lp = list[k];
      if (!lp.pending && !lp.leaving && cs.includes(lp.controller)) continue;
      const c = engine.controllerOf(lp.seat);
      if (lp.leaving) { if (c === undefined && engine.time.step > leftAt.get(lp)) drop(lp); continue; }
      if (lp.pending) { if (c !== undefined) { lp.controller = c; lp.pending = false; emit('seat.joined', lp.seat, null); changed(lp); } continue; }
      if (c !== lp.controller) { if (c === undefined) drop(lp); else { lp.controller = c; changed(lp); } }
    }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.seat !== null && seatOf(c.seat) === undefined) { makeSeat(c.seat, c); emit('seat.joined', c.seat, null); }
    }
  };
```

4. Replace the `return { … }` block with:

```js
  return {
    list, // view.localPlayers, in seat order
    on, enable,
    update() { sync(); poll(); refresh(); },
    dispose() { listeners.length = 0; },
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/view/seats.js test/seats.test.mjs
git commit -m "feat(view): pair devices to seats through a join hook and lh.seat (C-5, C-8)"
```

---

### Task 3: Regain, claim and release, keyboard join

**Files:**
- Modify: `src/view/seats.js`
- Test: `test/seats.test.mjs` (append)

**Interfaces:**
- Consumes: Task 2's `offer`, `attach`, `detach`.
- Produces:
  - Regain ([C-9]): before `join` runs, a press from an unpaired device of a kind goes to a seat holding a lost device of that kind. The same `id` comes first, then the device lost longest ago. The lost device object is reused (new `index`, `id`, `mapping`, `lost: false`). Event `{ type: 'seat.regained', seat, device }`.
  - `lp.claim(dev)` → `lp`. It throws `seats: claim needs a device from this page (lp.devices, seats.unpaired() or a seat event)`.
  - `lp.release(dev)` → `lp`. It throws `seats: seat <n> does not hold that device`.
  - `seats.unpaired()` → a new array of the page's devices that no seat holds.
  - Keyboard join: with `enable()` on, a `keydown` (no repeat, no Ctrl/Meta/Alt, not in a text field) of a key in an unpaired scheme offers that scheme's device. Scheme `'all'` takes every key. Other schemes take their contexts' keys (filled by Task 4).

- [ ] **Step 1: Write the failing tests (append)**

```js
// appended to test/seats.test.mjs
test('regain: a press goes to the seat that lost a pad with the same id, at any index, before an older loss (C-9)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); slots[2] = pad(2, { down: [0] }); frame(); e.stepN(1); frame();
  const wheel = seats.list[1].devices[0], second = seats.list[2].devices[0];
  slots[1] = null; frame(); slots[2] = null; frame();
  assert.deepEqual([wheel.lost, second.lost, seats.list[1].lost, seats.list[2].lost], [true, true, true, true]);
  slots[1] = pad(1, { down: [0] }); frame(); // an Xbox pad lands on the wheel's old index
  assert.equal(second.lost, false, 'same id wins over the older loss'); assert.equal(second.index, 1);
  assert.equal(seats.list[2].pad, slots[1]); assert.equal(wheel.lost, true);
  assert.deepEqual(ev.at(-1), ['seat.regained', 2, 'pad']);
  assert.equal(e.controllerOf(2).player, 3, 'the seat kept its player');
});

test('with no same-id pad, a press fills the seat whose pad was lost first, before join runs (C-9)', () => {
  let joins = 0;
  const { e, seats, slots, frame } = setup(); seats.enable({ join: () => { joins++; return 'new'; } });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const a = seats.list[1].devices[0], b = seats.list[2].devices[0];
  slots[1] = null; frame(); slots[0] = null; frame(); // b (seat 2) lost first
  slots[5] = pad(5, { id: WHEEL, down: [0] }); frame();
  assert.equal(b.lost, false); assert.equal(b.id, WHEEL); assert.equal(b.index, 5);
  assert.equal(a.lost, true); assert.equal(joins, 2);
});

test("index reuse: another product on a held pad's index is lost-and-new, and pairs only on a press (review focus)", () => {
  const { seats, slots, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); frame();
  const xbox = seats.list[0].devices[2];
  slots[0] = pad(0, { id: WHEEL }); frame(); // unplug and replug of another pad between two polls
  assert.equal(xbox.lost, true); assert.equal(seats.list[0].pads.length, 0, 'the wheel is not silently the old pad');
  slots[0] = pad(0, { id: WHEEL, down: [3] }); frame();
  assert.equal(xbox.lost, false); assert.equal(xbox.id, WHEEL, 'a press fills the seat with the lost pad');
});

test('without enable(), a pad that comes back returns to seat 0 as the same device (C-9)', () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); frame(); const dev = lp.devices[2];
  slots[0] = null; frame(); slots[2] = pad(2); frame();
  assert.equal(dev.lost, false); assert.equal(dev.index, 2); assert.equal(lp.devices.length, 3);
});

test('claim and release move devices by hand; a released keyboard joins on its next key (C-8)', () => {
  const { e, seats, slots, ev, frame, key } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const [s0, s1] = seats.list, keys = s0.devices[0], p0 = s0.devices[2];
  s1.claim(p0);
  assert.deepEqual(s1.devices.map(d => d.index), [1, 0]); assert.equal(s0.devices.includes(p0), false);
  assert.deepEqual(ev.slice(-2), [['seat.device', 0, 'pad', 'remove'], ['seat.device', 1, 'pad', 'add']]);
  assert.throws(() => s0.release(p0), /seats: seat 0 does not hold that device/);
  assert.throws(() => s0.claim({ kind: 'pad', index: 9 }), /seats: claim needs a device from this page/);
  s0.release(keys);
  assert.deepEqual(seats.unpaired(), [keys]);
  key('keydown', 'w');
  assert.equal(seats.list.at(-1).seat, 2); assert.deepEqual(seats.list.at(-1).devices, [keys]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: FAIL. The two regain tests fail on `second.lost` / `b.lost` (`true !== false`), the index-reuse test on `xbox.lost`, and the claim test with `s1.claim is not a function`. The default-mode test fails on `dev.lost`.

- [ ] **Step 3: Implement in `src/view/seats.js`**

1. Replace `makeSeat` with:

```js
  const makeSeat = (seat, controller) => {
    const lp = {
      seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false,
      claim: dev => { claim(lp, dev); return lp; }, release: dev => { release(lp, dev); return lp; }, leave: () => leave(lp),
    };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    return lp;
  };
```

2. Replace `offer` (keep `defaultJoin`, `enable` and the rest that follow it) with:

```js
  // [C-8] an unpaired device pressed (or, with one seat for everything, first seen): returns the device that now stands for it
  const offer = dev => {
    const back = regain(dev); if (back !== null) return back;
    if (opts === null) { attach(list[0], dev); return dev; }
    const r = opts.join(dev);
    if (r === null || r === undefined) return dev;
    let seat = r;
    if (r === 'new') { seat = freeSeat(); if (seat < 0) return dev; }
    else if (!Number.isInteger(r) || r < 0 || r >= opts.max) throw new Error(`seats: join must return a seat number in 0..${opts.max - 1}, 'new' or null`);
    attach(seatOf(seat) ?? open(seat), dev);
    return dev;
  };
  // [C-9] a seat waiting for a lost device of this kind gets the press first: the same product id, else the device lost
  // longest ago. The lost device object is reused, so the seat, its saved bindings and a game holding it keep one device.
  const regain = dev => {
    let best = null, same = false;
    for (let k = 0; k < list.length; k++) {
      const ds = list[k].devices;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i]; if (!d.lost || d.kind !== dev.kind) continue;
        const m = d.id === dev.id;
        if (best === null || (m && !same) || (m === same && info.get(d).lostAt < info.get(best).lostAt)) { best = d; same = m; }
      }
    }
    if (best === null) return null;
    const lp = holder.get(best), s = info.get(dev);
    info.delete(dev); known.delete(dev); info.set(best, s);
    best.id = dev.id; best.lost = false; place(best, dev); paired(best);
    emit('seat.regained', lp.seat, best); changed(lp);
    return best;
  };
  // the regained device takes the new one's place (Task 6 adds game kinds)
  const place = (best, dev) => { best.index = dev.index; best.mapping = dev.mapping; slots[best.index] = best; };
  const claim = (lp, dev) => {
    if (!known.has(dev)) throw new Error('seats: claim needs a device from this page (lp.devices, seats.unpaired() or a seat event)');
    if (!list.includes(lp)) throw new Error(`seats: seat ${lp.seat} has left`);
    attach(lp, dev);
  };
  const release = (lp, dev) => {
    if (holder.get(dev) !== lp) throw new Error(`seats: seat ${lp.seat} does not hold that device`);
    detach(lp, dev);
    if (dev.lost) { info.delete(dev); known.delete(dev); }
  };
  const unpaired = () => { const out = []; for (const d of known) if (!holder.has(d)) out.push(d); return out; };
  // keyboard join: a key of an unpaired scheme offers that scheme's device ('all' takes every key; Task 4 fills schemeKeys)
  const GUARD = 'input, textarea, select, [contenteditable]';
  const schemeKeys = new Map(); // scheme -> Set of the keys its contexts bind
  const inScheme = (scheme, k) => scheme === 'all' || schemeKeys.get(scheme)?.has(k) === true;
  const onKey = e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.(GUARD)) return;
    const k = String(e.key).toLowerCase();
    if (opts !== null) for (const dev of keysBy.values()) if (!holder.has(dev) && inScheme(dev.scheme, k)) offer(dev);
  };
```

3. In the seat 0 block, after `zero.devices.push(keys, touch); …`, add:

```js
  target.addEventListener?.('keydown', onKey);
```

4. Replace the `return { … }` block with:

```js
  return {
    list, // view.localPlayers, in seat order
    on, enable, unpaired,
    update() { sync(); poll(); refresh(); },
    dispose() { target.removeEventListener?.('keydown', onKey); listeners.length = 0; },
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: PASS, 15 tests. Task 1's loss test still passes: its wheel at index 2 now regains device `a` (the oldest loss), and the test asserts only `c.lost` and `lp.pads`.

- [ ] **Step 5: Commit**

```bash
git add src/view/seats.js test/seats.test.mjs
git commit -m "feat(view): regain lost pads by id, claim and release, keyboard join (C-8, C-9)"
```

---

### Task 4: Mapping contexts and the per-seat stack

**Files:**
- Create: `src/view/contexts.js`
- Modify: `src/view/seats.js`
- Test: `test/seat-contexts.test.mjs`

**Interfaces:**
- Consumes: `bindGamepad(engine, bindings, { getGamepads, source, map })` from `./gamepad.js` and `bindKeyboard(engine, bindings, { target, doc, source, ramps, map })` from `./keyboard.js`, unchanged. They are given `{ input: controller.input }` as `engine`.
- Produces (`src/view/contexts.js`):
  - `checkContext(name, def)` → a frozen `{ pads: [{ match, bindings, map, mappable }], keys: { [scheme]: { bindings, ramps, map, mappable } }, touch }`. Keyboard keys are lower-cased. Errors: `context '<name>': pads[<i>].match must be a function`, `…: pads[<i>].bindings must be bindGamepad bindings`, `…: keys.<s>.bindings must be bindKeyboard bindings`, `…: pads[<i>] mappable '<n>' names "<input>", which it does not bind`, `…: touch must be a function (target) => devices`.
  - `resolvePad(stack, defs, pad, overrides?)` → `[{ context, bindings: { deadZone, axes, buttons }, map }]`, highest priority first, inputs already bound higher up removed.
  - `resolveKeys(stack, defs, scheme, overrides?)` → `[{ context, bindings, ramps, map }]`.
  - `resolveTouch(stack, defs)` → `[{ context, make }]`: the highest context with `touch` only.
  - `mappableOf(defs, dev, livePad, name)` → the default input or `null`.
  - `schemeKeysOf(defs)` → `Map<scheme, Set<key>>`.
  - `inputKind(x)` → `'button' | 'axis' | 'key' | null`.
- Produces (`seats`):
  - `seats.context(name, def)` declares a context or replaces it. Each new keyboard scheme it names becomes a `{ kind: 'keys', scheme }` device on seat 0.
  - `lp.contexts`: `{ add(name, priority = 0), remove(name), has(name), list }`. `list` is names, highest priority first, and ties go to the later add. Errors: `seats: unknown context '<name>' (declare it with view.context first)`, `seats: context priority must be a finite number`.
  - `seats.enable({ max, join, contexts = [] })`: every seat (seat 0 included) starts with `contexts` (names or `[name, priority]`).
  - Buttons held when a pad is paired (attach, regain, claim) are masked from its bindings until let go.

- [ ] **Step 1: Write the failing tests**

```js
// test/seat-contexts.test.mjs
// [C-10], [C-11]: mapping contexts and each seat's context stack (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, XBOX, WHEEL } from './helpers/seats.mjs';
import { checkContext, resolvePad, resolveKeys, mappableOf } from '../src/view/contexts.js';

const DRIVE = {
  pads: [
    { match: p => p.id === WHEEL, bindings: { deadZone: 0, axes: { 0: ['steer', -1], 2: ['gas', 1] } } },
    { match: p => p.mapping === 'standard', bindings: { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn', 7: ['gas', 1] } } },
  ],
  keys: { all: { bindings: { w: ['gas', 1], ' ': 'horn' } } },
};
const BOOST = { pads: [{ match: () => true, bindings: { buttons: { 7: 'horn' } } }] };
const snap = (e, seat) => e.controllerOf(seat).input.snapshot;

test('resolvePad: the first matching entry per context; a higher context keeps an input; a pad nothing matches gets nothing (C-10, C-11)', () => {
  const defs = new Map([['drive', checkContext('drive', DRIVE)], ['boost', checkContext('boost', BOOST)]]);
  const std = { id: XBOX, mapping: 'standard' };
  assert.deepEqual(resolvePad([{ name: 'boost' }, { name: 'drive' }], defs, std).map(r => [r.context, r.bindings.buttons, r.bindings.axes]),
    [['boost', { 7: 'horn' }, {}], ['drive', { 0: 'horn' }, { 0: ['steer', 1] }]]);
  assert.deepEqual(resolvePad([{ name: 'drive' }], defs, { id: 'USB box', mapping: '' }), []);
  assert.equal(resolvePad([{ name: 'drive' }], defs, { id: WHEEL, mapping: '' })[0].bindings.deadZone, 0);
});

test('overrides move a mappable binding, swaps included; a saved input of another kind is skipped (C-12)', () => {
  const def = checkContext('d', {
    pads: [{ match: () => true, bindings: { buttons: { 6: ['brake', 1], 7: ['gas', 1] } }, mappable: { Brake: 'button:6', Gas: 'button:7' } }],
    keys: { all: { bindings: { S: ['brake', 1], w: ['gas', 1] }, mappable: { Brake: 'S' } } },
  });
  const defs = new Map([['d', def]]), st = [{ name: 'd' }], p = { id: XBOX, mapping: 'standard' };
  assert.deepEqual(resolvePad(st, defs, p, { Brake: 'button:7', Gas: 'button:6' })[0].bindings.buttons, { 7: ['brake', 1], 6: ['gas', 1] });
  assert.deepEqual(resolvePad(st, defs, p, { Brake: 'axis:2' })[0].bindings.buttons, { 6: ['brake', 1], 7: ['gas', 1] });
  assert.deepEqual(resolveKeys(st, defs, 'all', { Brake: 'Q' })[0].bindings, { q: ['brake', 1], w: ['gas', 1] });
  assert.equal(mappableOf(defs, { kind: 'pad' }, p, 'Gas'), 'button:7');
  assert.equal(mappableOf(defs, { kind: 'keys', scheme: 'all' }, null, 'Brake'), 's');
  assert.equal(mappableOf(defs, { kind: 'keys', scheme: 'all' }, null, 'Gas'), null);
});

test('checkContext names what is wrong (C-10)', () => {
  assert.throws(() => checkContext('d', { pads: [{ bindings: {} }] }), /context 'd': pads\[0\].match must be a function/);
  assert.throws(() => checkContext('d', { keys: { all: { w: ['gas', 1] } } }), /context 'd': keys.all.bindings must be bindKeyboard bindings/);
  assert.throws(() => checkContext('d', { pads: [{ match: () => true, bindings: { buttons: { 6: 'horn' } }, mappable: { Brake: 'button:7' } }] }),
    /context 'd': pads\[0\] mappable 'Brake' names "button:7", which it does not bind/);
  assert.throws(() => checkContext('d', { touch: {} }), /context 'd': touch must be a function/);
});

test("each seat's pads drive only its own controller, by the first pads entry that matches; an unmatched pad is ignored (C-10)", () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); slots[2] = pad(2, { id: 'USB box', mapping: '', down: [0] });
  frame(); e.stepN(1); frame();
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL }); slots[2] = pad(2, { id: 'USB box', mapping: '' }); frame(); // let go of the joining presses
  slots[0] = pad(0, { down: [7] }); slots[1] = pad(1, { id: WHEEL, axes: [0.5, 0, 1, 0] }); slots[2] = pad(2, { id: 'USB box', mapping: '', down: [0, 7], axes: [1, 1, 1, 1] });
  frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1); assert.equal(snap(e, 0).steer, 0);
  assert.equal(snap(e, 1).gas, 1); assert.equal(snap(e, 1).steer, -0.5);
  assert.deepEqual([snap(e, 2).gas, snap(e, 2).steer, snap(e, 2).horn.down], [0, 0, false], 'no entry matches the USB box');
});

test('the press that pairs a pad is not also a game input (review focus)', () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, false, 'the A that paired seat 0 is not a horn');
  frame(); e.stepN(1); assert.equal(snap(e, 0).horn.down, false, 'still held: still masked');
  slots[0] = pad(0); frame(); slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.pressed, true, 'a new press is input');
  slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame(); e.stepN(1); frame(); e.stepN(1);
  assert.equal(snap(e, 1).horn.down, false, 'a new seat: the joining A held across the controller arriving');
});

test('a higher-priority context keeps an input both bind; removing it gives the input back (C-11)', () => {
  const { e, seats, slots, frame } = setup(), lp = seats.list[0];
  seats.context('drive', DRIVE); seats.context('boost', BOOST);
  lp.contexts.add('drive'); lp.contexts.add('boost', 1);
  assert.deepEqual(lp.contexts.list, ['boost', 'drive']); assert.equal(lp.contexts.has('boost'), true);
  slots[0] = pad(0); frame();
  slots[0] = pad(0, { down: [7] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, true); assert.equal(snap(e, 0).gas, 0);
  lp.contexts.remove('boost'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1); assert.equal(snap(e, 0).horn.down, false);
  assert.throws(() => lp.contexts.add('nope'), /seats: unknown context 'nope' \(declare it with view.context first\)/);
  assert.throws(() => lp.contexts.add('drive', NaN), /seats: context priority must be a finite number/);
});

test('keyboard schemes are devices: two seats on one keyboard (C-8, C-10)', () => {
  const { e, seats, frame, key } = setup();
  seats.context('two', { keys: { wasd: { bindings: { w: ['gas', 1] } }, arrows: { bindings: { ArrowUp: ['gas', 1] } } } });
  seats.enable({ contexts: ['two'] });
  const s0 = seats.list[0];
  assert.deepEqual(s0.devices.map(d => d.scheme ?? d.kind), ['all', 'touch', 'wasd', 'arrows']);
  s0.release(s0.devices[3]);
  key('keydown', 'ArrowUp'); key('keyup', 'ArrowUp'); e.stepN(1); frame();
  const s1 = seats.list[1];
  assert.equal(s1.devices[0].scheme, 'arrows'); assert.equal(s1.pending, false);
  key('keydown', 'ArrowUp'); frame(); e.stepN(1);
  assert.equal(snap(e, 1).gas, 1); assert.equal(snap(e, 0).gas, 0);
  key('keydown', 'w'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seat-contexts.test.mjs`
Expected: FAIL with `Cannot find module '.../src/view/contexts.js'`.

- [ ] **Step 3: Write `src/view/contexts.js`**

```js
// src/view/contexts.js
// [C-10]–[C-12] (spec §5.5): mapping contexts, Unreal Enhanced Input's Input Mapping Contexts. A context gives default
// bindings per device: `pads` (the first entry whose match(pad) is true), `keys` per keyboard scheme and `touch`. The
// binding objects are bindGamepad's and bindKeyboard's ([I-2]); `map` and `ramps` sit beside them, and `mappable` names
// the bindings a player may move ({ Brake: 'button:6' }, { Brake: 's' }; the name is the save key). Inputs are named
// 'button:<i>' / 'axis:<i>' on a pad and by bindKeyboard's lower-case key on a keyboard. resolve*() turn a seat's stack
// (highest priority first) into one binding set per context; a higher context keeps an input a lower one also binds.
// Pure: no DOM, no storage.
const NONE = Object.freeze({});
const PAD_INPUT = /^(button|axis):(\d+)$/;
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);

export const inputKind = x => {
  if (typeof x !== 'string' || x === '') return null;
  const m = PAD_INPUT.exec(x); if (m) return m[1];
  return /^(button|axis):/.test(x) ? null : 'key';
};
const lower = b => { const o = {}; for (const k of Object.keys(b)) o[k.toLowerCase()] = b[k]; return o; };
const lowerKey = x => (typeof x === 'string' ? x.toLowerCase() : x);
const padHas = b => x => { const m = PAD_INPUT.exec(x); return m !== null && Object.hasOwn((m[1] === 'button' ? b.buttons : b.axes) ?? NONE, m[2]); };
const checkMappable = (who, m, has, norm = x => x) => {
  if (m === undefined) return undefined;
  if (!isObj(m)) throw new Error(`${who} mappable must be { [name]: input }`);
  const out = {};
  for (const n of Object.keys(m)) {
    const v = norm(m[n]);
    if (typeof v !== 'string' || !has(v)) throw new Error(`${who} mappable '${n}' names ${JSON.stringify(m[n])}, which it does not bind`);
    out[n] = v;
  }
  return Object.freeze(out);
};

export function checkContext(name, def) {
  if (typeof name !== 'string' || name === '') throw new Error('context: name must be a non-empty string');
  const who = `context '${name}'`;
  if (!isObj(def)) throw new Error(`${who}: needs { pads, keys, touch }`);
  if (def.pads !== undefined && !Array.isArray(def.pads)) throw new Error(`${who}: pads must be a list of { match, bindings }`);
  const pads = (def.pads ?? []).map((p, i) => {
    if (typeof p?.match !== 'function') throw new Error(`${who}: pads[${i}].match must be a function`);
    if (!isObj(p.bindings)) throw new Error(`${who}: pads[${i}].bindings must be bindGamepad bindings`);
    return Object.freeze({ match: p.match, bindings: p.bindings, map: p.map, mappable: checkMappable(`${who}: pads[${i}]`, p.mappable, padHas(p.bindings)) });
  });
  if (def.keys !== undefined && !isObj(def.keys)) throw new Error(`${who}: keys must be { [scheme]: { bindings, ramps, map, mappable } }`);
  const keys = {};
  for (const s of Object.keys(def.keys ?? NONE)) {
    const k = def.keys[s];
    if (!isObj(k?.bindings)) throw new Error(`${who}: keys.${s}.bindings must be bindKeyboard bindings`);
    const b = lower(k.bindings);
    keys[s] = Object.freeze({ bindings: b, ramps: k.ramps, map: k.map, mappable: checkMappable(`${who}: keys.${s}`, k.mappable, x => Object.hasOwn(b, x), lowerKey) });
  }
  if (def.touch !== undefined && typeof def.touch !== 'function') throw new Error(`${who}: touch must be a function (target) => devices`);
  return Object.freeze({ pads: Object.freeze(pads), keys: Object.freeze(keys), touch: def.touch });
}

// a device's bindings with a profile's overrides ([C-12]): each overridden mappable binding moves from its default input
// to the saved one, replacing what was there. Moves read the defaults, so two bindings can swap. A saved input of another
// kind (a stale or hand-edited save) is skipped.
const movePad = (b, mappable, over) => {
  const out = { deadZone: b.deadZone, axes: { ...b.axes }, buttons: { ...b.buttons } };
  if (mappable === undefined || over === NONE) return out;
  const put = [];
  for (const n of Object.keys(mappable)) {
    const from = mappable[n], to = over[n], kind = inputKind(from);
    if (to === undefined || to === from || inputKind(to) !== kind) continue;
    const i = from.slice(kind.length + 1), j = to.slice(kind.length + 1);
    const src = kind === 'button' ? b.buttons : b.axes, dst = kind === 'button' ? out.buttons : out.axes;
    delete dst[i]; put.push([dst, j, src[i]]);
  }
  for (const [dst, j, v] of put) dst[j] = v;
  return out;
};
const moveKeys = (b, mappable, over) => {
  const out = { ...b };
  if (mappable === undefined || over === NONE) return out;
  const put = [];
  for (const n of Object.keys(mappable)) {
    const from = mappable[n], to = lowerKey(over[n]);
    if (to === undefined || to === from || inputKind(to) !== 'key') continue;
    delete out[from]; put.push([to, b[from]]);
  }
  for (const [k, v] of put) out[k] = v;
  return out;
};

export function resolvePad(stack, defs, pad, over = NONE) {
  const out = [], taken = new Set();
  for (const { name } of stack) {
    const def = defs.get(name); if (def === undefined) continue;
    const entry = def.pads.find(p => p.match(pad)); if (entry === undefined) continue;
    const b = movePad(entry.bindings, entry.mappable, over), axes = {}, buttons = {};
    for (const i of Object.keys(b.axes)) if (!taken.has('axis:' + i)) axes[i] = b.axes[i];
    for (const i of Object.keys(b.buttons)) if (!taken.has('button:' + i)) buttons[i] = b.buttons[i];
    for (const i of Object.keys(axes)) taken.add('axis:' + i);
    for (const i of Object.keys(buttons)) taken.add('button:' + i);
    if (Object.keys(axes).length + Object.keys(buttons).length > 0) out.push({ context: name, bindings: { deadZone: b.deadZone, axes, buttons }, map: entry.map });
  }
  return out;
}
export function resolveKeys(stack, defs, scheme, over = NONE) {
  const out = [], taken = new Set();
  for (const { name } of stack) {
    const entry = defs.get(name)?.keys[scheme]; if (entry === undefined) continue;
    const b = moveKeys(entry.bindings, entry.mappable, over), bindings = {};
    for (const k of Object.keys(b)) if (!taken.has(k)) bindings[k] = b[k];
    for (const k of Object.keys(bindings)) taken.add(k);
    if (Object.keys(bindings).length > 0) out.push({ context: name, bindings, ramps: entry.ramps, map: entry.map });
  }
  return out;
}
// touch bindings are DOM elements the engine cannot compare, so only the highest context with touch binds it
export function resolveTouch(stack, defs) {
  for (const { name } of stack) { const t = defs.get(name)?.touch; if (t !== undefined) return [{ context: name, make: t }]; }
  return [];
}
export function mappableOf(defs, dev, live, name) {
  for (const def of defs.values()) {
    const entry = dev.kind === 'pad' ? (live ? def.pads.find(p => p.match(live)) : undefined) : dev.kind === 'keys' ? def.keys[dev.scheme] : undefined;
    const at = entry?.mappable?.[name]; if (at !== undefined) return at;
  }
  return null;
}
export function schemeKeysOf(defs) {
  const out = new Map();
  for (const def of defs.values()) for (const s of Object.keys(def.keys)) {
    const set = out.get(s) ?? new Set();
    for (const k of Object.keys(def.keys[s].bindings)) set.add(k);
    out.set(s, set);
  }
  return out;
}
```

- [ ] **Step 4: Wire contexts into `src/view/seats.js`**

1. At the top, after the header comment, add the imports:

```js
import { bindGamepad } from './gamepad.js';
import { bindKeyboard } from './keyboard.js';
import { checkContext, resolvePad, resolveKeys, resolveTouch, schemeKeysOf } from './contexts.js';
```

and after `const NO = Object.freeze([]);` add `const NONE = Object.freeze({});`.

2. After `const leftAt = new WeakMap(); …` add:

```js
  const defs = new Map();         // context name -> checked context
  const stacks = new WeakMap();   // seat -> [{ name, priority, order }], highest priority first
  const binds = new WeakMap();    // seat -> device modules writing its controller's input
```

3. Replace the `changed` and `paired` lines with:

```js
  // [C-10], [C-11] rebuild a seat's bindings: one device module per (device, context) its stack binds, given the seat's
  // controller input as its engine, under source 'pad:<index>:<context>' or 'keys:<scheme>:<context>' (touch modules
  // keep their own). Nothing binds while the seat is pending, leaving or gone.
  const changed = lp => {
    const old = binds.get(lp);
    if (old !== undefined) { for (let i = 0; i < old.length; i++) old[i].dispose?.(); binds.delete(lp); }
    const stack = stacks.get(lp);
    if (!list.includes(lp) || lp.pending || lp.leaving || !lp.controller || stack === undefined || stack.length === 0) return;
    const out = [], to = { input: lp.controller.input };
    binds.set(lp, out);
    for (let i = 0; i < lp.devices.length; i++) {
      const dev = lp.devices[i]; if (dev.lost) continue;
      if (dev.kind === 'pad') {
        const s = info.get(dev);
        for (const r of resolvePad(stack, defs, s.live, overridesFor(lp, dev))) out.push(bindGamepad(to, r.bindings, { getGamepads: () => s.one, source: `pad:${dev.index}:${r.context}`, map: r.map }));
      } else if (dev.kind === 'keys') {
        for (const r of resolveKeys(stack, defs, dev.scheme, overridesFor(lp, dev))) out.push(bindKeyboard(to, r.bindings, { target, doc, source: `keys:${dev.scheme}:${r.context}`, ramps: r.ramps, map: r.map }));
      } else if (dev.kind === 'touch') {
        for (const r of resolveTouch(stack, defs)) { const made = r.make(to); for (const d of Array.isArray(made) ? made : [made]) if (d) out.push(d); }
      }
    }
  };
  const overridesFor = (lp, dev) => NONE; // Task 5: the seat's saved overrides for this device
  // the buttons held while a pad is paired stay masked from its bindings until let go, so the press that joined,
  // regained or was claimed with is not also a game input (review focus); context changes do not mask
  const paired = dev => {
    if (dev.kind !== 'pad') return;
    const s = info.get(dev); if (s === undefined) return;
    for (let i = 0; i < s.btn.length; i++) s.mask[i] = s.btn[i];
  };
```

4. Replace `makeSeat` with:

```js
  const makeSeat = (seat, controller) => {
    const lp = {
      seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false, contexts: null,
      claim: dev => { claim(lp, dev); return lp; }, release: dev => { release(lp, dev); return lp; }, leave: () => leave(lp),
    };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    lp.contexts = makeStack(lp); start(lp);
    return lp;
  };
  const makeStack = lp => {
    const stack = []; let order = 0;
    stacks.set(lp, stack);
    const api = {
      add(name, priority = 0) {
        if (!defs.has(name)) throw new Error(`seats: unknown context '${name}' (declare it with view.context first)`);
        if (!Number.isFinite(priority)) throw new Error('seats: context priority must be a finite number');
        const i = stack.findIndex(x => x.name === name); if (i >= 0) stack.splice(i, 1);
        stack.push({ name, priority, order: ++order });
        stack.sort((a, b) => b.priority - a.priority || b.order - a.order);
        changed(lp); return api;
      },
      remove(name) { const i = stack.findIndex(x => x.name === name); if (i >= 0) { stack.splice(i, 1); changed(lp); } return api; },
      has: name => stack.some(x => x.name === name),
      get list() { return stack.map(x => x.name); },
    };
    return api;
  };
  // enable({ contexts }): every seat starts with them (names or [name, priority])
  const start = lp => { if (opts !== null) for (const c of opts.contexts) { if (Array.isArray(c)) lp.contexts.add(c[0], c[1]); else lp.contexts.add(c); } };
  // [C-10] declare (or replace) a context; each new keyboard scheme it names is a device on seat 0 ([C-8])
  const context = (name, def) => {
    defs.set(name, checkContext(name, def));
    for (const s of Object.keys(defs.get(name).keys)) if (!keysBy.has(s)) { const d = { kind: 'keys', scheme: s }; keysBy.set(s, d); known.add(d); attach(list[0], d); }
    schemeKeys.clear(); for (const [s, ks] of schemeKeysOf(defs)) schemeKeys.set(s, ks);
    for (let k = 0; k < list.length; k++) if (list[k].contexts.has(name)) changed(list[k]);
  };
```

5. Replace `newPad` with:

```js
  const newPad = (p, index) => {
    const dev = { kind: 'pad', index, id: String(p.id ?? ''), mapping: String(p.mapping ?? ''), lost: false };
    const view = { id: dev.id, index, mapping: dev.mapping, axes: NO, buttons: [] }; // what this pad's bindings read
    info.set(dev, { live: p, btn: [], hot: [], edge: false, kind: null, at: -1, lostAt: 0, mask: [], view, one: [view] });
    known.add(dev);
    return dev;
  };
  // this frame's Gamepad as the bindings see it: its axes, and its buttons with masked ones up (reused objects, R-8)
  const viewOf = s => {
    const p = s.live, v = s.view, b = p.buttons ?? NO;
    v.id = p.id; v.index = p.index; v.mapping = p.mapping; v.axes = p.axes ?? NO;
    for (let i = 0; i < b.length; i++) {
      const src = b[i], d = src?.pressed === true;
      if (s.mask[i] && !d) s.mask[i] = false;
      let o = v.buttons[i]; if (o === undefined) o = v.buttons[i] = { pressed: false, value: 0 };
      if (s.mask[i]) { o.pressed = false; o.value = 0; } else { o.pressed = d; o.value = src?.value ?? (d ? 1 : 0); }
    }
    if (v.buttons.length !== b.length) v.buttons.length = b.length;
  };
  const views = () => { for (let i = 0; i < slots.length; i++) { const d = slots[i]; if (d !== undefined) viewOf(info.get(d)); } };
  const drive = (dt, raw) => {
    for (let k = 0; k < list.length; k++) { const b = binds.get(list[k]); if (b !== undefined) for (let i = 0; i < b.length; i++) b[i].update?.(dt, raw); }
  };
```

6. Replace `enable` with:

```js
  const enable = ({ max = 4, join, contexts = [] } = {}) => {
    if (!Number.isInteger(max) || max < 1 || max > 16) throw new Error('seats: max must be an integer in 1..16');
    if (join !== undefined && typeof join !== 'function') throw new Error('seats: join must be a function');
    if (!Array.isArray(contexts)) throw new Error('seats: contexts must be a list of names or [name, priority]');
    opts = { max, join: join ?? defaultJoin, contexts };
    for (let k = 0; k < list.length; k++) start(list[k]);
  };
```

7. Replace the `return { … }` block with:

```js
  return {
    list, // view.localPlayers, in seat order
    on, enable, unpaired, context,
    update(dt, raw = dt) { sync(); poll(); refresh(); views(); drive(dt, raw); },
    dispose() {
      target.removeEventListener?.('keydown', onKey);
      for (let k = 0; k < list.length; k++) { const b = binds.get(list[k]); if (b !== undefined) for (let i = 0; i < b.length; i++) b[i].dispose?.(); binds.delete(list[k]); }
      listeners.length = 0;
    },
  };
```

- [ ] **Step 5: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seat-contexts.test.mjs test/seats.test.mjs test/gamepad.test.mjs test/keyboard.test.mjs`
Expected: PASS: 7 new tests, Task 1–3's 15, and the unchanged gamepad and keyboard suites.

- [ ] **Step 6: Commit**

```bash
git add src/view/contexts.js src/view/seats.js test/seat-contexts.test.mjs
git commit -m "feat(view): mapping contexts and a context stack per seat (C-10, C-11)"
```

---

### Task 5: Player-mappable bindings, profiles and capture

**Files:**
- Create: `src/view/profiles.js`
- Modify: `src/view/seats.js`
- Test: `test/seat-bindings.test.mjs`

**Interfaces:**
- Consumes: `mappableOf`, `inputKind` (Task 4). The `storage` option is an object with `getItem` / `setItem`. `undefined` means `globalThis.localStorage`, read inside try. `null` means none.
- Produces (`src/view/profiles.js`):
  - `deviceKey(dev)` → `'pad:<id>'`, `'keys:<scheme>'`, or `null` (touch and game kinds are not mappable).
  - `createProfiles({ game, storage })` → `{ load(profile) → { [deviceKey]: { [name]: input } }, save(profile, data) → boolean }`. Neither ever throws.
- Produces (`lp.bindings`):
  - `profile` (get/set; default `'Player <seat + 1>'`; setting reloads). Setting a bad value throws `bindings.profile: must be a non-empty string`.
  - `get(name, dev)` → the effective input or `null`.
  - `map(name, dev, input)` saves and rebinds. Errors: `bindings: seat <n> does not hold that device`, `bindings.map: no mappable binding '<name>' for this device`, `bindings.map: '<name>' is on <from>; "<input>" is not the same kind of input`.
  - `reset(name?)` drops one name, or every override in the profile.
  - `capture()` → `Promise<{ device, input } | null>`. `cancel()` resolves the pending capture with `null`.
- Storage: `localStorage['lh.bindings.<game.id>.<profile>']`.

- [ ] **Step 1: Write the failing tests**

```js
// test/seat-bindings.test.mjs
// [C-12], [C-13]: player-mappable bindings, profiles in localStorage, capture (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, memory, XBOX, DUALSENSE } from './helpers/seats.mjs';

const DRIVE = {
  pads: [{ match: p => p.mapping === 'standard', bindings: { buttons: { 6: ['brake', 1], 7: ['gas', 1] } }, mappable: { Brake: 'button:6', Gas: 'button:7' } }],
  keys: { all: { bindings: { s: ['brake', 1], w: ['gas', 1] }, mappable: { Brake: 's' } } },
};
const KEY = 'lh.bindings.seats.Player 1';
const ready = storage => {
  const t = setup({ storage }), lp = t.seats.list[0];
  t.seats.context('drive', DRIVE); lp.contexts.add('drive');
  t.slots[0] = pad(0); t.frame();
  return { ...t, lp, dev: lp.devices[2], keys: lp.devices[0] };
};
const press = (t, i, down) => { t.slots[i] = pad(i, { id: t.slots[i].id, down }); t.frame(); t.e.stepN(1); return t.e.input.snapshot; };

test('a mappable binding moves for that device and is saved under lh.bindings.<game>.<profile> (C-12, C-13)', () => {
  const store = memory(), t = ready(store), { lp, dev } = t;
  assert.equal(lp.bindings.profile, 'Player 1'); assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  lp.bindings.map('Brake', dev, 'button:4');
  assert.deepEqual(JSON.parse(store.m.get(KEY)), { [`pad:${XBOX}`]: { Brake: 'button:4' } });
  assert.equal(lp.bindings.get('Brake', dev), 'button:4');
  assert.equal(press(t, 0, [4]).brake, 1);
  assert.equal(press(t, 0, [6]).brake, 0, 'the default input no longer brakes');
});

test('overrides are per device id: another pad model keeps its defaults (review focus)', () => {
  const t = ready(memory()), { lp, dev } = t;
  t.slots[1] = pad(1, { id: DUALSENSE }); t.frame();
  lp.bindings.map('Brake', dev, 'button:4');
  const ds = lp.devices[3];
  assert.equal(lp.bindings.get('Brake', ds), 'button:6');
  assert.equal(press(t, 1, [6]).brake, 1, 'the DualSense still brakes on 6');
});

test('a new page reads the saved profile; another profile starts from defaults; reset drops overrides (C-13)', () => {
  const store = memory();
  { const first = ready(store); first.lp.bindings.map('Brake', first.dev, 'button:4'); }
  const { lp, dev } = ready(store); // a second page on the same storage
  assert.equal(lp.bindings.get('Brake', dev), 'button:4', 'a reload keeps the mapping');
  lp.bindings.profile = 'Sam'; assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  lp.bindings.profile = 'Player 1'; assert.equal(lp.bindings.get('Brake', dev), 'button:4');
  lp.bindings.reset('Brake'); assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  assert.deepEqual(JSON.parse(store.m.get(KEY)), { [`pad:${XBOX}`]: {} });
  lp.bindings.map('Gas', dev, 'button:5'); lp.bindings.reset();
  assert.deepEqual(JSON.parse(store.m.get(KEY)), {});
  assert.throws(() => { lp.bindings.profile = ''; }, /bindings.profile: must be a non-empty string/);
});

test('storage that throws or holds junk falls back to defaults and never throws (review focus)', () => {
  const bad = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  const t = ready(bad);
  assert.equal(t.lp.bindings.get('Brake', t.dev), 'button:6');
  t.lp.bindings.map('Brake', t.dev, 'button:4');
  assert.equal(press(t, 0, [4]).brake, 1, 'the mapping still holds for this page');
  const junk = memory(); junk.setItem(KEY, '{nope');
  const j = ready(junk); assert.equal(j.lp.bindings.get('Brake', j.dev), 'button:6');
  const odd = memory(); odd.setItem(KEY, JSON.stringify({ [`pad:${XBOX}`]: { Brake: 5, Gas: 'axis:3' }, 'keys:all': [1] }));
  const o = ready(odd);
  assert.equal(o.lp.bindings.get('Brake', o.dev), 'button:6'); assert.equal(o.lp.bindings.get('Gas', o.dev), 'button:7', 'a saved axis for a button binding is skipped');
  assert.equal(press(o, 0, [7]).gas, 1);
  assert.doesNotThrow(() => ready(null));
});

test("map rejects a device the seat does not hold, an unknown name and an input of another kind; keys lower-case (C-12)", () => {
  const { lp, dev, keys } = ready(memory());
  assert.throws(() => lp.bindings.map('Clutch', dev, 'button:4'), /bindings.map: no mappable binding 'Clutch' for this device/);
  assert.throws(() => lp.bindings.map('Brake', dev, 'axis:2'), /bindings.map: 'Brake' is on button:6; "axis:2" is not the same kind of input/);
  lp.bindings.map('Brake', keys, 'Q'); assert.equal(lp.bindings.get('Brake', keys), 'q');
  lp.release(dev);
  assert.throws(() => lp.bindings.map('Brake', dev, 'button:4'), /bindings: seat 0 does not hold that device/);
});

test("capture resolves with the next input of this seat's own devices; cancel resolves null (C-13)", async () => {
  const t = setup(), { e, seats, slots, frame, key } = t; seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  slots[0] = pad(0); slots[1] = pad(1); frame();
  const [s0, s1] = seats.list;
  let got; const p = s1.bindings.capture(); p.then(v => { got = v; });
  slots[0] = pad(0, { down: [3] }); frame(); await Promise.resolve();
  assert.equal(got, undefined, "another seat's pad does not answer");
  slots[1] = pad(1, { down: [3] }); frame();
  assert.deepEqual(await p, { device: s1.devices[0], input: 'button:3' });
  const q = s1.bindings.capture(); slots[1] = pad(1, { axes: [0, 0, -0.9, 0] }); frame();
  assert.deepEqual(await q, { device: s1.devices[0], input: 'axis:2' });
  const k = s0.bindings.capture(); key('keydown', 'Q');
  assert.deepEqual(await k, { device: s0.devices[0], input: 'q' });
  const c = s0.bindings.capture(); const d = s0.bindings.capture();
  assert.equal(await c, null, 'a second capture ends the first'); s0.bindings.cancel(); assert.equal(await d, null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seat-bindings.test.mjs`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'profile')` (no `lp.bindings` yet).

- [ ] **Step 3: Write `src/view/profiles.js`**

```js
// src/view/profiles.js
// [C-13] (spec §5.5): saved binding overrides, Unreal's Enhanced Input User Settings. One localStorage entry per game
// and profile, 'lh.bindings.<game>.<profile>', holding { [device key]: { [mappable name]: input } }. Device keys are
// 'pad:<Gamepad.id>' and 'keys:<scheme>', so a wheel's overrides never reach a gamepad. Every storage access is in
// try/catch (private mode, a full quota, a blocked origin, bad JSON) and falls back to no overrides; junk is dropped
// field by field. View-only.
export const deviceKey = dev => (dev.kind === 'pad' ? 'pad:' + dev.id : dev.kind === 'keys' ? 'keys:' + dev.scheme : null);
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const clean = raw => {
  const out = {};
  if (!isObj(raw)) return out;
  for (const d of Object.keys(raw)) {
    const m = raw[d]; if (!isObj(m)) continue;
    const o = {}; for (const n of Object.keys(m)) if (typeof m[n] === 'string' && m[n] !== '') o[n] = m[n];
    out[d] = o;
  }
  return out;
};
export function createProfiles({ game, storage }) {
  const store = () => (storage === undefined ? globalThis.localStorage : storage) ?? null;
  const keyOf = profile => `lh.bindings.${game}.${profile}`;
  return {
    load(profile) {
      try { const t = store()?.getItem(keyOf(profile)); return typeof t === 'string' ? clean(JSON.parse(t)) : {}; } catch { return {}; }
    },
    save(profile, data) {
      try { const s = store(); if (s === null) return false; s.setItem(keyOf(profile), JSON.stringify(data)); return true; } catch { return false; }
    },
  };
}
```

- [ ] **Step 4: Wire bindings into `src/view/seats.js`**

1. Add to the imports:

```js
import { mappableOf, inputKind } from './contexts.js';
import { createProfiles, deviceKey } from './profiles.js';
```

(merge `mappableOf, inputKind` into the existing `./contexts.js` import line.)

2. Replace the `export function createSeats(…)` line with:

```js
export function createSeats(engine, { getGamepads, target = globalThis, doc, storage } = {}) {
```

3. After `const binds = new WeakMap(); …` add:

```js
  const profiles = createProfiles({ game: engine.game.id, storage });
  const saved = new WeakMap();     // seat -> { profile, data }
  const capturing = new WeakMap(); // seat -> the pending capture's resolve
```

4. Replace the `overridesFor` line with:

```js
  const overridesFor = (lp, dev) => saved.get(lp)?.data[deviceKey(dev)] ?? NONE; // [C-13] this profile's overrides for this device
  // [C-12], [C-13] lp.bindings: the seat's player-mappable overrides, saved per profile and per device id
  const makeBindings = lp => {
    const st = { profile: `Player ${lp.seat + 1}`, data: null };
    st.data = profiles.load(st.profile); saved.set(lp, st);
    const held = dev => { if (holder.get(dev) !== lp) throw new Error(`bindings: seat ${lp.seat} does not hold that device`); };
    const save = () => { profiles.save(st.profile, st.data); changed(lp); };
    const b = {
      get profile() { return st.profile; },
      set profile(name) {
        if (typeof name !== 'string' || name === '') throw new Error('bindings.profile: must be a non-empty string');
        st.profile = name; st.data = profiles.load(name); changed(lp);
      },
      get(name, dev) {
        held(dev);
        const from = mappableOf(defs, dev, info.get(dev)?.live ?? null, name); if (from === null) return null;
        const o = st.data[deviceKey(dev)]?.[name];
        return o !== undefined && inputKind(o) === inputKind(from) ? o : from;
      },
      map(name, dev, input) {
        held(dev);
        const from = mappableOf(defs, dev, info.get(dev)?.live ?? null, name);
        if (from === null) throw new Error(`bindings.map: no mappable binding '${name}' for this device`);
        if (dev.kind === 'keys' && typeof input === 'string') input = input.toLowerCase();
        if (inputKind(input) !== inputKind(from)) throw new Error(`bindings.map: '${name}' is on ${from}; ${JSON.stringify(input)} is not the same kind of input`);
        const d = (st.data[deviceKey(dev)] ??= {});
        if (input === from) delete d[name]; else d[name] = input;
        save();
      },
      reset(name) {
        for (const k of Object.keys(st.data)) { if (name === undefined) delete st.data[k]; else delete st.data[k][name]; }
        save();
      },
      // the next button or axis edge of this seat's pads, or key on its keyboard schemes, for remap screens
      capture() { b.cancel(); return new Promise(res => { capturing.set(lp, res); }); },
      cancel() { const r = capturing.get(lp); capturing.delete(lp); r?.(null); },
    };
    return b;
  };
  const captured = (lp, dev, s) => { const r = capturing.get(lp); if (r !== undefined) { capturing.delete(lp); r({ device: dev, input: s.kind + ':' + s.at }); } };
```

5. Replace `makeSeat` with (bindings before contexts: adding a context rebinds, which reads the overrides):

```js
  const makeSeat = (seat, controller) => {
    const lp = {
      seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false, contexts: null, bindings: null,
      claim: dev => { claim(lp, dev); return lp; }, release: dev => { release(lp, dev); return lp; }, leave: () => leave(lp),
    };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    lp.bindings = makeBindings(lp); lp.contexts = makeStack(lp); start(lp);
    return lp;
  };
```

6. In `poll`, replace the line `if (lp !== undefined && s.edge) usedLast.set(lp, dev);` with:

```js
      if (lp !== undefined && s.edge) { usedLast.set(lp, dev); captured(lp, dev, s); }
```

7. Replace `onKey` with:

```js
  const onKey = e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.(GUARD)) return;
    const k = String(e.key).toLowerCase();
    if (opts !== null) for (const dev of keysBy.values()) if (!holder.has(dev) && inScheme(dev.scheme, k)) offer(dev);
    for (let n = 0; n < list.length; n++) { // a capturing seat takes the key on its own scheme ('all' only when it has no other)
      const lp = list[n], r = capturing.get(lp); if (r === undefined) continue;
      let dev = null;
      for (const d of lp.devices) if (d.kind === 'keys' && inScheme(d.scheme, k) && (dev === null || dev.scheme === 'all')) dev = d;
      if (dev !== null) { capturing.delete(lp); r({ device: dev, input: k }); }
    }
  };
```

8. Replace `drop` with:

```js
  const drop = lp => {
    list.splice(list.indexOf(lp), 1);
    for (let i = lp.devices.length - 1; i >= 0; i--) { const d = lp.devices[i]; detach(lp, d); if (d.lost) { info.delete(d); known.delete(d); } }
    const r = capturing.get(lp); if (r !== undefined) { capturing.delete(lp); r(null); }
    emit('seat.left', lp.seat, null);
  };
```

- [ ] **Step 5: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seat-bindings.test.mjs test/seat-contexts.test.mjs test/seats.test.mjs`
Expected: PASS: 6 new tests plus 22 from Tasks 1–4.

- [ ] **Step 6: Commit**

```bash
git add src/view/profiles.js src/view/seats.js test/seat-bindings.test.mjs
git commit -m "feat(view): player-mappable bindings, saved profiles and capture per seat (C-12, C-13)"
```

---

### Task 6: Game device kinds

**Files:**
- Modify: `src/view/seats.js`
- Test: `test/seats.test.mjs` (append)

**Interfaces:**
- Consumes: Task 3's `offer`, `regain`, `place`.
- Produces: `seats.kind(name, { read })` ([C-6]). Each frame `read()` returns the kind's connected units as `{ key, id, active, values }`:
  - `key` names a unit while it is connected;
  - `id` is the product (used for regain);
  - `active` is true while a control is pressed (a rising edge pairs an unpaired unit, as a pad press does);
  - `values` are action values the kind binds itself (contexts do not apply).

  A held unit writes `values` to its seat's controller input as source `<kind>:<key>`. A unit missing from `read()` is lost, its source is cleared, and it is regained by the same rule as a pad. Errors: `seats.device: kind must be a new name ('pad', 'keys' and 'touch' are built in)`, `seats.device: kind '<name>' is already registered`, `seats.device: kind '<name>' needs read()`.

- [ ] **Step 1: Write the failing test (append)**

```js
// appended to test/seats.test.mjs
test('a game device kind: units pair on a press, write their values on their seat, are lost when gone and come back by id (C-6, C-9)', () => {
  const { e, seats, frame } = setup(); seats.enable({ join: () => 0 });
  let units = [];
  seats.kind('pedals', { read: () => units });
  units = [{ key: 'hid-1', id: 'Fanatec CSL', active: false, values: { gas: 0.3 } }]; frame();
  assert.deepEqual(seats.unpaired().map(d => [d.kind, d.key]), [['pedals', 'hid-1']], 'listed but not pressed: unpaired');
  units = [{ key: 'hid-1', id: 'Fanatec CSL', active: true, values: { gas: 0.6 } }]; frame(); e.stepN(1);
  const dev = seats.list[0].devices.find(d => d.kind === 'pedals');
  assert.equal(e.input.snapshot.gas, 0.6);
  units = []; frame(); e.stepN(1);
  assert.equal(dev.lost, true); assert.equal(seats.list[0].lost, true); assert.equal(e.input.snapshot.gas, 0, 'its source is cleared');
  units = [{ key: 'hid-7', id: 'Fanatec CSL', active: true, values: { gas: 1 } }]; frame(); e.stepN(1);
  assert.equal(dev.lost, false); assert.equal(dev.key, 'hid-7'); assert.equal(e.input.snapshot.gas, 1);
  assert.throws(() => seats.kind('pad', { read() {} }), /seats.device: kind must be a new name \('pad', 'keys' and 'touch' are built in\)/);
  assert.throws(() => seats.kind('pedals', { read() {} }), /seats.device: kind 'pedals' is already registered/);
  assert.throws(() => seats.kind('wheel', {}), /seats.device: kind 'wheel' needs read\(\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: FAIL: `TypeError: seats.kind is not a function`.

- [ ] **Step 3: Implement in `src/view/seats.js`**

1. After `const captured = …` add:

```js
  // [C-6] game device kinds (WebHID and the like): read() lists the kind's units each frame
  const kindList = []; // { kind, read, devs, byKey }
  let frameNo = 0;
  const kind = (name, spec) => {
    if (typeof name !== 'string' || name === '' || name === 'pad' || name === 'keys' || name === 'touch') throw new Error("seats.device: kind must be a new name ('pad', 'keys' and 'touch' are built in)");
    for (let i = 0; i < kindList.length; i++) if (kindList[i].kind === name) throw new Error(`seats.device: kind '${name}' is already registered`);
    if (typeof spec?.read !== 'function') throw new Error(`seats.device: kind '${name}' needs read()`);
    kindList.push({ kind: name, read: spec.read, devs: [], byKey: new Map() });
  };
  const readKinds = () => {
    frameNo++;
    for (let n = 0; n < kindList.length; n++) {
      const K = kindList[n], units = K.read() ?? NO;
      for (let i = 0; i < units.length; i++) {
        const u = units[i], key = String(u.key);
        let dev = K.byKey.get(key), fresh = false;
        if (dev === undefined) {
          dev = { kind: K.kind, key, id: String(u.id ?? ''), lost: false };
          K.byKey.set(key, dev); K.devs.push(dev); known.add(dev); fresh = true;
          info.set(dev, { live: u, seen: 0, act: false, edge: false, lostAt: 0, source: K.kind + ':' + key });
        }
        const s = info.get(dev), a = u.active === true;
        s.seen = frameNo; s.live = u; s.edge = a && !s.act; s.act = a;
        if (!holder.has(dev) && (s.edge || (fresh && opts === null))) dev = offer(dev);
        const lp = holder.get(dev);
        if (lp !== undefined && !lp.pending && !lp.leaving && lp.controller && u.values) lp.controller.input.device(u.values, info.get(dev).source);
      }
      for (let i = K.devs.length - 1; i >= 0; i--) {
        const dev = K.devs[i];
        if (info.get(dev).seen !== frameNo) { K.devs.splice(i, 1); K.byKey.delete(dev.key); loseUnit(dev); }
      }
    }
  };
  const loseUnit = dev => {
    const s = info.get(dev); s.live = null; s.lostAt = ++losses; dev.lost = true;
    const lp = holder.get(dev);
    if (lp === undefined) { info.delete(dev); known.delete(dev); return; }
    lp.controller?.input.clearDevice(s.source);
    emit('seat.lost', lp.seat, dev); changed(lp);
  };
```

2. Replace `place` with:

```js
  // the regained device takes the new one's place: a pad's slot, or a game kind's unit key
  const place = (best, dev) => {
    if (dev.kind === 'pad') { best.index = dev.index; best.mapping = dev.mapping; slots[best.index] = best; return; }
    const K = kindList.find(k => k.kind === dev.kind);
    best.key = dev.key; K.byKey.set(best.key, best); K.devs[K.devs.indexOf(dev)] = best;
    info.get(best).source = best.kind + ':' + best.key;
  };
```

3. Replace `detach` with (a game kind's values are written directly, so the old seat's source is cleared here):

```js
  const detach = (lp, dev) => {
    const i = lp.devices.indexOf(dev); if (i >= 0) lp.devices.splice(i, 1);
    holder.delete(dev); if (usedLast.get(lp) === dev) usedLast.delete(lp);
    const src = info.get(dev)?.source; if (src !== undefined) lp.controller?.input.clearDevice(src);
    emit('seat.device', lp.seat, dev, 'remove'); changed(lp);
  };
```

4. Replace the `return { … }` block with:

```js
  return {
    list, // view.localPlayers, in seat order
    on, enable, unpaired, context, kind,
    update(dt, raw = dt) { sync(); poll(); readKinds(); refresh(); views(); drive(dt, raw); },
    dispose() {
      target.removeEventListener?.('keydown', onKey);
      for (let k = 0; k < list.length; k++) { const b = binds.get(list[k]); if (b !== undefined) for (let i = 0; i < b.length; i++) b[i].dispose?.(); binds.delete(list[k]); }
      listeners.length = 0;
    },
  };
```

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs test/seat-contexts.test.mjs test/seat-bindings.test.mjs`
Expected: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add src/view/seats.js test/seats.test.mjs
git commit -m "feat(view): game device kinds on seats (C-6)"
```

---

### Task 7: Boot wiring, allocation check and spec status

**Files:**
- Modify: `src/view/boot.js` (imports, the `boot` options, the `view` object, the driver's `devices`)
- Test: `test/seats-boot.test.mjs`
- Modify: `docs/spec.md` ([C-5]–[C-13] lines, the amendment line)

**Interfaces:**
- Consumes: `createSeats` (Tasks 1–6).
- Produces:
  - `boot(game, halves, { …, getGamepads, storage })`. `storage` defaults to `localStorage`, and `null` turns saving off.
  - `view.seats(opts)` → `view.localPlayers`.
  - `view.context(name, def)`, `view.device(kind, { read })`, `view.onSeat(fn)` → off, `view.unpaired()`.
  - `view.localPlayers` (live list).
  - Driver device order: frame dt, seats, the game's devices, the menu navigator.

- [ ] **Step 1: Write the failing tests**

```js
// test/seats-boot.test.mjs
// [C-5]–[C-13] through boot; R-8 for seats (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { boot, defineView, parseFlags, bindGamepad } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
import { allocRate } from './helpers/alloc.mjs';
import { game, pad, setup, WHEEL } from './helpers/seats.mjs';

const VIEW = fileURLToPath(new URL('../src/view/', import.meta.url));
const DRIVE = {
  pads: [
    { match: p => p.id === WHEEL, bindings: { deadZone: 0, axes: { 0: ['steer', -1], 2: ['gas', 1] } } },
    { match: p => p.mapping === 'standard', bindings: { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn', 7: ['gas', 1] } } },
  ],
};
const start = (halves, devices = []) => {
  const { window, document } = dom(), slots = [];
  const app = boot(game, halves, { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), getGamepads: () => slots, devices, storage: null });
  const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); }; // what the driver's tick does
  return { app, slots, frame, window, document };
};

test("boot without view.seats(): one seat holds every device and a game's own bindGamepad is unchanged (review focus)", () => {
  const t = start(defineView({ scenes: {} }), [e => bindGamepad(e, { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn' } }, { getGamepads: () => t.slots })]);
  try {
    t.slots[0] = pad(0, { down: [0], axes: [0.5, 0, 0, 0] }); t.frame(); t.app.engine.stepN(1);
    assert.equal(t.app.view.localPlayers.length, 1); assert.equal(t.app.view.localPlayers[0].pads[0], t.slots[0]);
    assert.equal(t.app.engine.input.snapshot.horn.pressed, true, 'the reveal press still counts, as today');
    assert.ok(Math.abs(t.app.engine.input.snapshot.steer - (0.5 - 0.15) / 0.85) < 1e-9);
  } finally { t.app.dispose(); }
});

test('a view half turns seats on: two pads, two players, seat events, and dispose detaches (C-5, C-8, C-10)', () => {
  const ev = [];
  const halves = defineView({ scenes: { field: { enter(e, view) {
    view.context('drive', DRIVE); view.seats({ contexts: ['drive'] }); view.onSeat(x => ev.push([x.type, x.seat]));
  } } } });
  const { app, slots, frame, window, document } = start(halves);
  try {
    slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); frame(); app.engine.stepN(1); frame();
    assert.deepEqual(app.view.localPlayers.map(s => [s.seat, s.pending, s.controller?.player]), [[0, false, 1], [1, false, 2]]);
    slots[1] = pad(1, { id: WHEEL, axes: [0, 0, 1, 0] }); frame(); app.engine.stepN(1);
    assert.equal(app.engine.controllerOf(1).input.snapshot.gas, 1); assert.equal(app.engine.input.snapshot.gas, 0);
    assert.deepEqual(ev.filter(x => x[0] === 'seat.joined'), [['seat.joined', 1]]);
    assert.deepEqual(app.view.unpaired(), []);
  } finally { app.dispose(); }
  assert.doesNotThrow(() => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true })));
});

test('a steady frame with two seats, two pads and a context allocates under 128 bytes in view code (R-8)', async () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  slots[0] = pad(0, { axes: [0.4, 0, 0, 0] }); slots[1] = pad(1, { down: [7] }); frame();
  const r = await allocRate(frame, 2000, { warm: 500, top: 8, within: VIEW });
  assert.ok(r.inside < 128, `${Math.round(r.inside)} bytes per frame in view code:\n${r.top.join('\n')}`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats-boot.test.mjs`
Expected: FAIL: `TypeError: Cannot read properties of undefined (reading 'length')` (`app.view.localPlayers` is undefined). The allocation test may already pass, because it drives `createSeats` directly.

- [ ] **Step 3: Implement in `src/view/boot.js`**

1. Add the import after `import { bindMenuNav } from './menuNav.js';`:

```js
import { createSeats } from './seats.js';
```

2. In the `boot` signature, replace `renderer, nav, getGamepads } = {}) {` with `renderer, nav, getGamepads, storage } = {}) {`.

3. Replace the `const view = { root: …, focus: id => focus(id) };` line with:

```js
  // [C-5]–[C-13] seats: one seat holding every device until view.seats() is called; polled before the game's devices
  const seats = createSeats(engine, { getGamepads, target, doc, storage });
  const view = { root: root ?? doc.body, doc, ui: null, driver: null, dt: 0, rawDt: 0, wait: p => wait(p), focus: id => focus(id), // #19: dt is the driver frame time (capped), rawDt uncapped (#56); both 0 for renders the driver didn't start
    seats: o => { seats.enable(o); return seats.list; }, context: (name, def) => seats.context(name, def), device: (kind, spec) => seats.kind(kind, spec),
    onSeat: fn => seats.on(fn), unpaired: () => seats.unpaired(), get localPlayers() { return seats.list; } };
```

4. In the `createDriver(engine, { … devices: [frameDt, ...devices.map(f => f(engine)), …] … })` call, replace `[frameDt, ...devices.map(f => f(engine)),` with `[frameDt, seats, ...devices.map(f => f(engine)),`. `dispose()` already calls `dispose?.()` on every driver device, which disposes the seats.

- [ ] **Step 4: Run the new tests and the whole suite**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats-boot.test.mjs test/boot.test.mjs test/boot-args.test.mjs test/menuNav.test.mjs test/view-alloc.test.mjs`
Expected: PASS: 3 new tests, plus the boot, menu navigator and view-alloc suites unchanged. If the allocation test fails, fix the per-frame path in `seats.js` (no closures, arrays or strings per frame), not the budget.

Run: `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=2560 --test --test-concurrency=4 test/`
Expected: PASS with the count from before this plan plus 32 (Tasks 1–7). Record the before count first with the same command on the base commit. Browser suites need the shared browser; if they cannot start, run the rest without them and say which were skipped.

- [ ] **Step 5: Mark the requirements built and record the rulings in `docs/spec.md`**

1. Read the amendment line (line 7; plan 1 has already edited it) and add [C-5]–[C-13] to its "Built in 0.13" list, naming plan 2 next to plan 1.
2. Add "(built, plan 2)" after the bold label of each of [C-5] through [C-13].
3. After the [C-13] bullet, add:

```markdown
- **Rulings (plan 2, 2026-10-21).** Context entries are `pads: [{ match, bindings, map, mappable }]` and `keys: { [scheme]: { bindings, ramps, map, mappable } }`, where `bindings` is exactly `bindGamepad`'s or `bindKeyboard`'s object, and `touch: target => devices`. `mappable` is `{ [name]: defaultInput }`; inputs are `'button:<i>'` / `'axis:<i>'` on a pad and the lower-case key on a keyboard; `map()` moves a binding within its kind and replaces what the target input held. Only the highest context with `touch` binds touch. The default `join` gives a pad seat 0 while seat 0 holds no pad, then `'new'`. Every keyboard scheme and the touch device start on seat 0; a released scheme joins on its next key; touch moves only by `claim`. Pads are polled: an empty slot, `connected: false` or another `id` at the index is a loss; "oldest" for regain is the device lost first. A pad's buttons held when it is paired (join, regain, claim) are masked until let go. A pending seat binds the frame after `engine.controllerOf(seat)` returns its controller. Seat events go to `view.onSeat(fn)`, never `engine.events`; `seat.device` carries `op: 'add' | 'remove'`, `seat.joined` and `seat.left` carry `device: null`. `view.unpaired()` lists devices no seat holds. `boot({ storage })` injects the profile store (`null` turns saving off).
```

- [ ] **Step 6: Commit**

```bash
git add src/view/boot.js test/seats-boot.test.mjs docs/spec.md
git commit -m "feat(view): view.seats, contexts and local players through boot (C-5..C-13)"
```

---

## After this plan

Plan 3 (`-3-net.md`) makes `lh.seat` wait for the host online. Seats need no change for that: a seat stays `pending` until `engine.controllerOf(seat)` returns its controller. Plan 4 (`-4-haptics.md`) reads `lp.pad` / `lp.pads` for the haptics lifecycle, and `view.localPlayers` and `view.onSeat` for `?debug=pads`.
