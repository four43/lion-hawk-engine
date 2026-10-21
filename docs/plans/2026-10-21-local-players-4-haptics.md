# Local players 4: axis edges, haptics lifecycle, fake pads and the `?debug=pads` bench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seats read real d-pads, pedals and sticks correctly: an axis's first push is a press, and letting a held axis go never is. The engine stops rumble it would otherwise leave running (page hide, blur, a pausing overlay, a pad left rumbling by the previous page), and games keep calling `lp.pad.vibrationActuator` themselves. Playwright tests get any number of fake pads with recording actuators. `?debug=pads` opens the Gamepad Bench inside any game. It shows the seats as the game sees them, each pad's raw channels, and haptics tests.

**Architecture:** Task 1 changes one function in `src/view/seats.js` (`edges`). A new view module `src/view/haptics.js` is a driver device that runs after the seats. It reads `seats.list[k].pads` (this frame's `Gamepad`s), listens for `blur`, `pagehide` and a hidden `visibilitychange`, and watches `engine.scene.overlays` for an open scene with `pauses`. On a trigger it sends each pad a zero `dual-rumble` effect plus `reset()`, at once and on each of the next 19 frames. It resets a pad once on `seat.seen`. `boot` builds it unless `defineView({ haptics: { autoStop: false } })`. The fake pads in `testing/playwright.js` hold an array of pads, each with a recording `vibrationActuator`. The bench is two files. `src/view/bench/padStats.js` is pure: stats, tap shaping, patterns, `play` with its watchdog, and the self-test. `src/view/bench/pads.js` is the DOM overlay. `boot` loads the overlay with a dynamic `import()` only when `flags.debugs` includes `'pads'`. It hands the overlay a read-only facade over the seats (`localPlayers`, `unpaired()`, `gamepad(dev)`, `onSeat`).

**Tech Stack:** plain ES modules, `node:test`, happy-dom (dev dependency) for DOM and window events, `playwright-core` and esbuild (already used by the browser suites), no new dependencies.

**Spec:** `docs/spec.md` §5.5 [C-14] and the plan 2 rulings, §7.3 [D-1], [D-7], §7.5 [T-17], [T-24]; `docs/plans/2026-10-21-local-players-spec.md` §6–§7; `.superpowers/sdd/2026-10-21-local-players-2-seats/progress.md` ("Final fix wave" rulings, carried here as Task 1). Sources: Rally's `games/rally/src/rumbleOut.js` (stop = zero effect plus reset, repeated; one reset for a pad seen first) and the Gamepad Bench artifact (`gamepad-bench.html`: feature set, presets, live taps, self-test).

**Builds on plan 2 (as fixed 2026-10-21):** `createSeats` (`list`, `on(fn)`, `gamepad(dev)`, `unpaired()`, `update`), the `seat.seen` event (once per pad index and `id` for the page's life, emitted before the pad is used, with `seats.gamepad(dev)` readable), `lp.pads` / `lp.pad` refreshed every frame, `lp.bindings.capture()`, and boot's `view.localPlayers`, `view.unpaired`, `view.gamepad`, `view.onSeat`. Plan 3 (network identity) runs at the same time in `src/core`, `src/sim`, `src/net` and `testing/mp.js`. This plan touches none of those files.

## Design decisions

| Question | Decision | Why |
|---|---|---|
| Axis edge rule | `h = |v − anchor| > JOIN_AXIS && !(v · anchor ≥ 0 && |v| < |anchor|)`. The axis anchors at its first reading and again after 10 still polls. The "first non-zero reading of an always-0 axis" re-anchor is gone | Ruled in plan 2's final fix wave. An exact-0 d-pad or an unreported pedal must press on its first push. A held axis released toward centre must not answer `capture()` |
| What a stop is | `playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 })` then `reset()`, 20 rounds: one at the trigger and one on each of the next 19 driver frames. A new trigger restarts the count | Chromium queues `playEffect` on a task but runs `reset()` at once. A reset alone can be overtaken by an effect sent a frame earlier. The zero effect queues behind the late one. Rally playtests 2026-10-19 |
| Which pads stop | Every seat's `lp.pads` (live pads only). Hide, blur and pause are page-wide, so every seat is affected | `engine.scene.overlays` and the page's focus are shared by all seats. Per-seat pause does not exist |
| When a pausing overlay stops | On the frame an overlay whose scene has `pauses` first appears among `engine.scene.overlays` (a rising edge), not on every frame it stays open | A pause menu may rumble on purpose (a selection tick). Stopping every frame would cancel it |
| Hidden page | The event stops at once. The driver does not tick while hidden, so the other 19 rounds run on the frames after the page returns | No timers. The first round covers the hide, and the rest catch a late effect when frames resume |
| First-sight reset | `seats.on` → on `seat.seen`, `seats.gamepad(dev).vibrationActuator.reset()` once | `seat.seen` is once per index and `id` for the page's life (plan 2 ruling). A game that wants a reset on every replug listens to `seat.regained` |
| Turning it off | `defineView({ haptics: { autoStop: false } })`: boot builds no haptics device. No listeners, no first-sight reset, no stops | A game that runs its own lifecycle (Rally's `rumbleOut`) keeps full control |
| Fake pads API | `game.pad(index, state)` plugs or updates. `game.pad(state)` is index 0. `game.pad(null)` / `game.pad(index, null)` / `game.unplug(index)` unplug and fire `gamepaddisconnected`. Plugging an empty slot fires `gamepadconnected` | Existing one-argument callers keep working. The events match what a browser fires |
| Fake actuator | `effects` defaults to `['dual-rumble', 'trigger-rumble']`. `state.effects` sets the list, and `effects: null` gives that state no `vibrationActuator`. Every call is recorded as `{ op: 'playEffect', type, params }` / `{ op: 'reset' }`. An unlisted type rejects `NotSupportedError`. The actuator stays with the index until a pad with another `id` plugs in there | `game.haptics(index)` reads `{ effects, calls }`. Tests can model Firefox (no actuator) and Linux (body only) |
| `?debug=pads` parsing | `parseFlags` adds `debugs`: the comma-separated topics of an on `?debug` (`[]` when off) | [D-1] parses the URL once. `flags.debug` stays a boolean |
| Loading the bench | Only with `'pads'` in `flags.debugs`: one slot device, last in the driver's list, plus `import('./bench/pads.js')`. The build inlines the import, but it is never evaluated without the flag | "No cost when off". The engine has no lazy `?fps` / `?tune` overlay to copy yet, so this is the pattern for [D-2]/[D-3] later |
| What the bench may touch | A facade `{ localPlayers, unpaired(), gamepad(dev), onSeat }` and the haptics device's `on` (for its log). It drives the selected pad's actuator, as a game does | [D-7]: reads view state only and never changes seats or bindings |

## Global Constraints

- Files: only those in the File map. Do not touch `src/core/engine.js`, `src/core/controllers.js`, `src/core/players.js`, `src/sim/**`, `src/net/**`, `testing/mp.js` or their tests (plan 3 is in progress there). `src/core/flags.js` gains one field. Plan 3 does not touch it.
- `docs/spec.md` is edited by plan 3 too. Before each spec step, re-read the lines you change and edit only those lines.
- Sim purity: `navigator`, the DOM and window events are reached only from `src/view/` and `testing/playwright.js` (spec §1.2; `test/purity*.test.mjs` must still pass).
- Existing games and tests are unchanged. Without the flag, the bench adds no device, element or listener. `game.pad({...})` with one argument still drives pad 0. Haptics write no input and touch no seat.
- Allocation-free per frame in steady state (R-8): `haptics.update()` allocates nothing while no stop is running. The bench is debug-only and exempt, but it costs nothing when off.
- Rumble is never an error: a missing actuator, a missing `playEffect`, or a call that throws or rejects is skipped silently.
- Error messages use the engine's `'<area>: <what>'` form (`haptics: …`, `defineView: …`, `playwright: …`).
- Commits: conventional messages, no `Co-Authored-By` trailer (user rule).
- Tests run under the memory cap, from the engine root. Unit tests: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test <files>`. Browser (Playwright) suites run ONE FILE AT A TIME, never concurrently: `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=1536 --test <one file>`.

## Review Focus

- **Axis edges miss the first push or count the release.** An exact-0 d-pad or an unreported pedal must press on its first move. An axis held still and then released toward centre must not answer a pending `capture()`. Pinned by Task 1's `an exact-0 axis … presses on its first push; its release is no press` and `an axis held 12 polls and then released leaves a pending capture() unresolved`.
- **A stop that a late effect outlives.** A reset alone, or a single round, lets an effect queued a frame earlier keep the pad running. Each stop must be a zero `dual-rumble` and then `reset()`, on every seat's pads, 20 rounds, then nothing more. Pinned by Task 2's `blur stops every seat's pads: a zero dual-rumble then reset, at once and on each of the next 19 frames, then nothing`.
- **Stops where none belong.** Stopping on every frame of an open pause menu cancels its own rumble. Stopping on a non-pausing overlay, or with `autoStop: false`, takes control from the game. Pinned by Task 2's `a pausing overlay stops once as it opens, not every frame it stays open; a non-pausing overlay never stops` and Task 3's `defineView({ haptics: { autoStop: false } }) installs nothing`.
- **The bench changes what it shows.** A debug overlay that claims a pad, edits a context or saves a binding would make the bench lie about how `join` paired a rig. Pinned by Task 6's `the bench never changes seats or bindings, whatever is clicked`.
- **The new fake pads break existing tests, or `?debug=pads` costs pages without it.** `game.pad(state)` must still mean pad 0. A page without the flag must load no bench code and add no device. Pinned by Task 4's `T-24: game.pad(state) is pad 0 …` and `game.pad(index, state) plugs any number of pads …; game.pad(state) is still pad 0`, and by Task 6's `?debug=pads loads the bench through boot; without it boot adds no device, no element and imports no bench code`.

---

## File map

| File | Change |
|---|---|
| `src/view/seats.js` | `edges()`: no first-non-zero re-anchor; a move back toward centre is never an edge. `newPad` drops the `zero` array. |
| `src/view/haptics.js` | **new.** `createHaptics(engine, { seats, target, doc, frames })`, `STOP_FRAMES`. |
| `src/view/boot.js` | `defineView({ haptics })`; boot builds the haptics device after the seats; `?debug=pads` slot device and lazy bench import. |
| `src/view/bench/padStats.js` | **new.** Pure bench logic: `STD_BUTTONS`, `STD_AXES`, `SECTORS`, `TRACE`, `TAP_MIN`, `FULL`, `createPadStats`, `updateStats`, `rate`, `stickEdge`, `shapeTap`, `liveState`, `liveEffect`, `PATTERNS`, `play`, `selfTest`, `supports`, `describe`. |
| `src/view/bench/pads.js` | **new.** `openPadBench(view, { doc, haptics, now, timer, env })` → `{ el, update(), dispose() }`. |
| `src/core/flags.js` | `debugs`: the topics of an on `?debug`. |
| `testing/playwright.js` | `FAKE_PADS`: any number of pads, events, recording actuators; driver `pad(index, state)`, `unplug(index)`, `haptics(index)`. |
| `test/helpers/seats.mjs` | Exact-0 default axes; `act` pad option; `actuator()`; `hud` and `pause` scenes on the test game. |
| `test/seats.test.mjs` | Axis-edge tests (one rewritten, three new). |
| `test/haptics.test.mjs` | **new.** Haptics lifecycle unit tests. |
| `test/haptics-boot.test.mjs` | **new.** Boot wiring, `autoStop: false`, `defineView` checks, R-8. |
| `test/playwright.test.mjs` | One unit test for the pad driver's arguments. |
| `test/pads-e2e.test.mjs` | **new.** Real-Chromium fake pads on a stub page. |
| `test/bench-stats.test.mjs` | **new.** `padStats.js` unit tests. |
| `test/bench.test.mjs` | **new.** The overlay on happy-dom, and boot's lazy loading. |
| `test/flags.test.mjs` | `debugs` default and parsing. |
| `test/fixtures/rumble.js`, `rumble.view.js`, `rumble.html` | **new.** A game with a pausing overlay for the browser checks. |
| `test/haptics-e2e.test.mjs` | **new.** Real-Chromium haptics lifecycle and bench. |
| `docs/spec.md` | Plan 2 axis ruling text; [C-14], [D-7], [T-24] built with rulings; [D-1] `?debug=<topics>`; amendment line. |

---

### Task 1: Seats axis edges — stillness-only anchors, no release edges

**Files:**
- Modify: `src/view/seats.js`
- Modify: `test/helpers/seats.mjs`
- Test: `test/seats.test.mjs`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: plan 2's `edges(s, p)` state per pad (`btn`, `hot`, `anchor`, `prev`, `still`), `JOIN_AXIS = 0.5`, `STILL = 0.02`, `STILL_POLLS = 10`.
- Produces: the same `s.edge` / `s.kind` / `s.at` contract. For each axis, `h = Math.abs(v - anchor) > JOIN_AXIS && !(v * anchor >= 0 && Math.abs(v) < Math.abs(anchor))`, with an edge on `h && !hot`. Anchors: the first reading, then wherever the axis sat still for `STILL_POLLS` polls. Test kit: `pad(index, { axes = [0, 0, 0, 0] })` (exact 0; `DRIFT` is removed).

- [ ] **Step 1: Return the test kit's axes to exact 0**

In `test/helpers/seats.mjs`, replace:

```js
// a fresh Gamepad snapshot every call, as Chromium hands out (research §5). Real sticks drift a little off 0; an axis at
// exactly 0 models one the browser has not reported yet (Firefox), whose first non-zero reading is its rest.
export const DRIFT = [0.004, -0.004, 0.004, -0.004];
export const pad = (index, { id = XBOX, mapping = id === WHEEL ? '' : 'standard', down = [], axes = DRIFT } = {}) => ({
```

with:

```js
// a fresh Gamepad snapshot every call, as Chromium hands out (research §5). Axes default to exactly 0: a d-pad on axes, or
// an axis the browser has not reported yet (Firefox), anchors there, so its first push is a press (plan 4 Task 1).
export const pad = (index, { id = XBOX, mapping = id === WHEEL ? '' : 'standard', down = [], axes = [0, 0, 0, 0] } = {}) => ({
```

Run `grep -rn DRIFT test/` first. Nothing outside the helper may import it. If something does, give that test its own literal axes.

- [ ] **Step 2: Write the failing tests**

In `test/seats.test.mjs`, replace the whole test `'a pedal that reads 0 until touched and then rests at -1 re-anchors: a press to +1 is an edge for capture and lp.pad (final review 1a)'` (it follows the `const hold = …` line) with these four tests:

```js
test('a pedal that rests at -1 for 10 still polls re-anchors there: a press to +1 is an edge for capture and lp.pad (final review 1a, plan 4 Task 1)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  const wheel = axes => pad(1, { id: WHEEL, axes });
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0, 0]); frame();
  hold(frame, 11, () => { slots[0] = pad(0); slots[1] = wheel([0, 0, -1, 0]); }); // the move to -1, then 10 still polls
  slots[0] = pad(0, { down: [0] }); slots[1] = wheel([0, 0, -1, 0]); frame();
  assert.equal(lp.pad, slots[0]);
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = wheel([0, 0, 1, 0]); frame();
  assert.equal(lp.pad, slots[1], 'lp.pad follows the pedal');
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:2' });
});

test('an exact-0 axis (a d-pad on axes, or one Firefox has not reported) presses on its first push; its release is no press (plan 4 Task 1, review focus)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL }); frame(); // every axis reads exactly 0
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL }); frame();
  assert.equal(lp.pad, slots[0]);
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL, axes: [0, 0, 0, 1] }); frame(); // the hat's first push
  assert.equal(lp.pad, slots[1], 'the first push is use');
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:3' });
  let got; lp.bindings.capture().then(v => { got = v; });
  slots[1] = pad(1, { id: WHEEL }); frame(); await null;
  assert.equal(got, undefined, 'letting the hat go is not a press');
  lp.bindings.cancel(); await null;
  assert.equal(got, null);
});

test("a pedal's first touch from an unreported 0 is a press (plan 4 Task 1)", async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  const wheel = axes => pad(1, { id: WHEEL, axes });
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0, 0]); frame();
  slots[0] = pad(0, { down: [0] }); slots[1] = wheel([0, 0, 0, 0]); frame();
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0.8, 0]); frame();
  assert.equal(lp.pad, slots[1]);
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:2' });
});

test('an axis held 12 polls and then released leaves a pending capture() unresolved (plan 4 Task 1, review focus)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); frame();
  hold(frame, 12, () => { slots[0] = pad(0, { axes: [1, 0, 0, 0] }); }); // pushed, then held still: re-anchored at +1
  let got; lp.bindings.capture().then(v => { got = v; });
  slots[0] = pad(0); frame(); await null;
  assert.equal(got, undefined, 'the release toward centre is not an edge');
  slots[0] = pad(0, { axes: [-1, 0, 0, 0] }); frame(); await null;
  assert.deepEqual(got, { device: lp.devices[2], input: 'axis:0' }, 'a push past centre to the other side is');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs`
Expected: FAIL. `an exact-0 axis …` fails at `'the first push is use'`, `a pedal's first touch …` fails at `assert.equal(lp.pad, slots[1])`, and `an axis held 12 polls …` fails at `'the release toward centre is not an edge'`. The rewritten 1a passes; it guards the stillness path. Older seats tests that move an axis off exact 0 may also fail, because the old first-non-zero re-anchor swallows that move. They pass after Step 4.

- [ ] **Step 4: Fix `edges` in `src/view/seats.js`**

1. In `newPad`, replace `prev: [], still: [], zero: [], edge: false,` with `prev: [], still: [], edge: false,`.

2. Replace the comment above `edges` and the whole `edges` function (from `// s.edge: a button went down, or an axis moved more than JOIN_AXIS from its anchor, this frame;` to the `};` that closes `edges`) with:

```js
  // s.edge: a button went down, or an axis moved more than JOIN_AXIS from its anchor and not back toward centre, this
  // frame; s.kind / s.at name the first such input. An axis anchors at its first reading (a pedal at +-1 or a trigger at
  // -1 is not a press) and again wherever it has sat still for STILL_POLLS polls, so a pedal that rests somewhere new
  // presses from there. An axis that reads exactly 0 until first touched (a d-pad on axes, Firefox) anchors at 0, so its
  // first touch is an edge. A move back toward centre (the same side of 0 as the anchor, and closer to 0) is never an
  // edge: letting a held axis go is not a press. Per-axis state lives in arrays that only grow when the pad reports more
  // axes (R-8).
  const edges = (s, p) => {
    s.edge = false;
    const b = p.buttons ?? NO, a = p.axes ?? NO;
    for (let i = 0; i < b.length; i++) { const d = b[i]?.pressed === true; if (d && !s.btn[i] && !s.edge) { s.edge = true; s.kind = 'button'; s.at = i; } s.btn[i] = d; }
    for (let i = 0; i < a.length; i++) {
      const v = a[i] ?? 0;
      if (i >= s.anchor.length) { s.anchor[i] = s.prev[i] = v; s.still[i] = 0; s.hot[i] = false; continue; }
      s.still[i] = Math.abs(v - s.prev[i]) < STILL ? s.still[i] + 1 : 0; s.prev[i] = v;
      if (s.still[i] >= STILL_POLLS) { s.anchor[i] = v; s.still[i] = 0; }
      const o = s.anchor[i];
      const h = Math.abs(v - o) > JOIN_AXIS && !(v * o >= 0 && Math.abs(v) < Math.abs(o));
      if (h && !s.hot[i] && !s.edge) { s.edge = true; s.kind = 'axis'; s.at = i; }
      s.hot[i] = h;
    }
  };
```

- [ ] **Step 5: Run the seats suites**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/seats.test.mjs test/seat-contexts.test.mjs test/seat-bindings.test.mjs test/seats-boot.test.mjs`
Expected: PASS, with 3 more tests than before in `seats.test.mjs` (one test rewritten, three added). If an older test fails, check whether it expected a release toward centre to count, or a press from a resting pedal before it passes centre. The ruling stands, so fix the test's input, not `edges`.

- [ ] **Step 6: Update the plan 2 ruling in `docs/spec.md`**

In the `**Rulings (plan 2, 2026-10-21).**` bullet of §5.5, replace the sentence:

```markdown
An axis edge is a move of more than `JOIN_AXIS` (0.5) from the axis's anchor: it anchors at its first reading (an axis that appears later, at its first), at its first non-zero reading if it read exactly 0 until then, and wherever it has been still (under 0.02 per poll) for 10 polls.
```

with:

```markdown
An axis edge is a move of more than `JOIN_AXIS` (0.5) from the axis's anchor that is not a move back toward centre (`|v − anchor| > 0.5 && !(v·anchor ≥ 0 && |v| < |anchor|)`, plan 4): it anchors at its first reading (an axis that appears later, at its first) and wherever it has been still (under 0.02 per poll) for 10 polls, never on a first non-zero reading. An axis that reads exactly 0 until touched (a d-pad on axes, Firefox) presses on its first push, and letting a held axis go is never a press. Two consequences are accepted: a pedal resting at −1 presses only once it passes centre, and an axis pushed again within 10 polls of releasing a long hold is not a press.
```

- [ ] **Step 7: Commit**

```bash
git add src/view/seats.js test/helpers/seats.mjs test/seats.test.mjs docs/spec.md
git commit -m "fix(view): seats axis edges anchor on stillness only and never count a release (C-8, C-13)"
```

---

### Task 2: Haptics lifecycle module

**Files:**
- Create: `src/view/haptics.js`
- Modify: `test/helpers/seats.mjs`
- Test: `test/haptics.test.mjs`

**Interfaces:**
- Consumes: `seats.list` (each seat's `pads`, this frame's `Gamepad`s), `seats.on(fn)` and its `seat.seen` event, `seats.gamepad(dev)`, `engine.scene.overlays` (a live array of overlay names), `engine.game.scenes[name].pauses`.
- Produces:
  - `STOP_FRAMES = 20` (exported).
  - `createHaptics(engine, { seats, target = globalThis, doc, frames = STOP_FRAMES })` → `{ on(fn) → off, stopping, update(), dispose() }`. `stopping` is the number of stop rounds still to run on coming frames.
  - Events to `on(fn)`: `{ type: 'haptics.stop', reason: 'blur' | 'pagehide' | 'hidden' | 'pause', frames }`, one per trigger.
  - Errors: `haptics: needs the seats`, `haptics: frames must be a positive integer`, `haptics.on: needs a function`.
  - Test kit: `pad(index, { act })` sets `vibrationActuator` (default `null`); `actuator(effects = ['dual-rumble', 'trigger-rumble'])` → `{ effects, calls, playEffect, reset }`, with calls `['play', type, params]` / `['reset']`; the test game gains scenes `hud: {}` and `pause: { pauses: true }`.

- [ ] **Step 1: Extend the test kit**

In `test/helpers/seats.mjs`:

1. Replace `export const game = defineGame({ id: 'seats', start: 'field', actions: schema, scenes: { field: {} } });` with:

```js
export const game = defineGame({ id: 'seats', start: 'field', actions: schema, scenes: { field: {}, hud: {}, pause: { pauses: true } } }); // hud and pause: haptics (plan 4)
```

2. Replace the `pad` definition (from `export const pad = (index, {` to its closing `});`) with:

```js
export const pad = (index, { id = XBOX, mapping = id === WHEEL ? '' : 'standard', down = [], axes = [0, 0, 0, 0], act = null } = {}) => ({
  index, id, mapping, connected: true, axes: axes.slice(), vibrationActuator: act,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
// a fake GamepadHapticActuator (plan 4): records every call; a playEffect of an unlisted type rejects, as Chromium's does.
// Pass the same one to every pad() snapshot of a pad: the actuator outlives the snapshots.
export const actuator = (effects = ['dual-rumble', 'trigger-rumble']) => {
  const a = {
    effects, calls: [],
    playEffect(type, params) { a.calls.push(['play', type, { ...params }]); return a.effects.includes(type) ? Promise.resolve('complete') : Promise.reject(new Error(`${type} is not supported`)); },
    reset() { a.calls.push(['reset']); return Promise.resolve('complete'); },
  };
  return a;
};
```

- [ ] **Step 2: Write the failing tests**

```js
// test/haptics.test.mjs
// [C-14]: the haptics lifecycle (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics, STOP_FRAMES } from '../src/view/haptics.js';
import { setup, pad, actuator, WHEEL } from './helpers/seats.mjs';

const ZERO = ['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }];
const rounds = n => Array.from({ length: n }, () => [ZERO, ['reset']]).flat();
const rig = (opts = {}) => {
  const t = setup(), h = createHaptics(t.e, { seats: t.seats, target: t.window, doc: t.document, ...opts });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t.frame(); h.update(); } };
  return { ...t, h, tick };
};

test('a pad seen for the first time gets one reset; the same pad again, or later frames, get none (C-14)', () => {
  const { slots, tick } = rig(), a = actuator(), b = actuator();
  slots[0] = pad(0, { act: a }); tick(3);
  assert.deepEqual(a.calls, [['reset']]);
  slots[0] = null; tick(); slots[0] = pad(0, { act: a }); tick(); // unplugged and back: seen already (index and id, for the page's life)
  assert.deepEqual(a.calls, [['reset']]);
  slots[0] = null; tick(); slots[0] = pad(0, { id: WHEEL, act: b }); tick();
  assert.deepEqual(b.calls, [['reset']], 'another product on that index is a new pad');
});

test("blur stops every seat's pads: a zero dual-rumble then reset, at once and on each of the next 19 frames, then nothing (C-14, review focus)", () => {
  const { e, seats, slots, tick, window } = rig(), a = actuator(), b = actuator();
  seats.enable();
  slots[0] = pad(0, { act: a, down: [0] }); slots[1] = pad(1, { act: b, down: [0] }); tick(); e.stepN(1); tick();
  assert.deepEqual(seats.list.map(lp => lp.pads.length), [1, 1], 'two seats, one pad each');
  a.calls.length = 0; b.calls.length = 0;
  window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(a.calls, rounds(1), 'the first stop is sent at once');
  tick(30);
  assert.deepEqual(a.calls, rounds(STOP_FRAMES)); assert.deepEqual(b.calls, rounds(STOP_FRAMES));
});

test('pagehide and a hidden page stop and restart the count; a page turning visible does not; on(fn) hears each stop (C-14)', () => {
  const { slots, tick, window, document, h } = rig(), a = actuator(), got = [];
  const off = h.on(x => got.push(x));
  slots[0] = pad(0, { act: a }); tick(); a.calls.length = 0;
  let vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.deepEqual(a.calls, []);
  vis = 'hidden'; document.dispatchEvent(new window.Event('visibilitychange'));
  assert.deepEqual(a.calls, rounds(1)); assert.equal(h.stopping, STOP_FRAMES - 1);
  tick(5); assert.equal(h.stopping, STOP_FRAMES - 6);
  a.calls.length = 0; window.dispatchEvent(new window.Event('pagehide'));
  assert.deepEqual(a.calls, rounds(1)); assert.equal(h.stopping, STOP_FRAMES - 1, 'a new trigger restarts the count');
  assert.deepEqual(got, [{ type: 'haptics.stop', reason: 'hidden', frames: STOP_FRAMES }, { type: 'haptics.stop', reason: 'pagehide', frames: STOP_FRAMES }]);
  off(); window.dispatchEvent(new window.Event('blur')); assert.equal(got.length, 2);
  assert.throws(() => h.on(1), /haptics\.on: needs a function/);
});

test('a pausing overlay stops once as it opens, not every frame it stays open; a non-pausing overlay never stops (C-14, review focus)', () => {
  const { e, slots, tick } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick(); a.calls.length = 0;
  e.overlay('hud'); tick(5);
  assert.deepEqual(a.calls, [], 'hud does not pause');
  e.overlay('pause'); tick(60);
  assert.deepEqual(a.calls, rounds(STOP_FRAMES), 'twenty rounds, then the pause menu may rumble');
  a.calls.length = 0; e.close('pause'); tick(3);
  assert.deepEqual(a.calls, []);
  e.overlay('pause'); tick();
  assert.deepEqual(a.calls, rounds(1), 'opening it again stops again');
});

test("a game's rumble after the last stop round is left alone (C-14)", () => {
  const { slots, tick, window } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  window.dispatchEvent(new window.Event('blur')); tick(STOP_FRAMES - 1);
  a.calls.length = 0;
  a.playEffect('dual-rumble', { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 0 }); tick(10);
  assert.deepEqual(a.calls, [['play', 'dual-rumble', { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 0 }]]);
});

test('pads without an actuator, without playEffect, or whose actuator throws are skipped; the others still stop (C-14)', () => {
  const { slots, tick, window } = rig(), a = actuator();
  const bad = { effects: ['dual-rumble'], playEffect() { throw new Error('boom'); }, reset() { return Promise.reject(new Error('gone')); } };
  slots[0] = pad(0); slots[1] = pad(1, { act: {} }); slots[2] = pad(2, { act: bad }); slots[3] = pad(3, { act: a }); tick();
  a.calls.length = 0;
  assert.doesNotThrow(() => window.dispatchEvent(new window.Event('blur')));
  assert.deepEqual(a.calls, rounds(1));
  assert.doesNotThrow(() => tick(3));
  assert.throws(() => createHaptics(rig().e, {}), /haptics: needs the seats/);
  assert.throws(() => rig({ frames: 0 }), /haptics: frames must be a positive integer/);
});

test('dispose removes the listeners and the seat.seen hook (C-14)', () => {
  const { slots, window, h, seats } = rig(), a = actuator();
  h.dispose();
  slots[0] = pad(0, { act: a }); seats.update(1 / 60, 1 / 60);
  window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(a.calls, []);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/haptics.test.mjs`
Expected: FAIL with `Cannot find module '.../src/view/haptics.js'`.

- [ ] **Step 4: Write the module**

```js
// src/view/haptics.js
// [C-14] (spec §5.5): the haptics lifecycle. Games drive lp.pad.vibrationActuator themselves (after checking `effects`);
// the engine only stops rumble it would otherwise leave running. From Rally's playtests (games/rally/src/rumbleOut.js,
// 2026-10-19): Chromium queues each playEffect on a task but runs reset() at once, so a reset alone can be overtaken by an
// effect sent a frame earlier. A stop is therefore a zero dual-rumble effect (queued behind any late one) plus reset(),
// sent at once and on each of the next frames, STOP_FRAMES rounds in all. A pad this page sees for the first time gets one
// reset, clearing what the previous page left playing.
// A driver device after the seats (it reads this frame's lp.pads). It never writes seats, input or the sim.
export const STOP_FRAMES = 20;
const ZERO = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
const quiet = () => {}; // a stop's promises resolve 'preempted' or reject on a pad that went away: nothing to handle

const zero = a => {
  if (typeof a?.playEffect !== 'function') return; // no actuator (Firefox, most of Safari): rumble is never an error
  try { a.playEffect('dual-rumble', ZERO)?.catch?.(quiet); } catch { /* an actuator that throws is skipped */ }
  try { a.reset?.()?.catch?.(quiet); } catch { /* as above */ }
};
const resetOnce = a => {
  if (typeof a?.reset !== 'function') return;
  try { a.reset()?.catch?.(quiet); } catch { /* as above */ }
};

export function createHaptics(engine, { seats, target = globalThis, doc, frames = STOP_FRAMES } = {}) {
  if (!seats) throw new Error('haptics: needs the seats');
  if (!Number.isInteger(frames) || frames < 1) throw new Error('haptics: frames must be a positive integer');
  doc ??= target.document ?? globalThis.document;
  const scenes = engine.game.scenes, listeners = [];
  let left = 0, paused = false;
  // hide, blur and pause are page-wide: every seat is affected; lp.pads holds live pads only
  const stopPads = () => {
    const list = seats.list;
    for (let k = 0; k < list.length; k++) { const ps = list[k].pads; for (let i = 0; i < ps.length; i++) zero(ps[i]?.vibrationActuator); }
  };
  const stop = reason => {
    stopPads(); left = frames - 1;
    const e = { type: 'haptics.stop', reason, frames };
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](e); } catch { /* a listener (the bench's log) must not stop a stop */ } }
  };
  // an open overlay whose scene pauses ([S-*] pauses); engine.scene.overlays is a live array, so this allocates nothing
  const pausing = () => { const o = engine.scene.overlays; for (let i = 0; i < o.length; i++) if (scenes[o[i]]?.pauses) return true; return false; };
  const onBlur = () => stop('blur'), onHide = () => stop('pagehide');
  const onVis = () => { if (doc?.visibilityState === 'hidden') stop('hidden'); };
  const offSeen = seats.on(e => { if (e.type === 'seat.seen') resetOnce(seats.gamepad(e.device)?.vibrationActuator); });
  target.addEventListener?.('blur', onBlur); target.addEventListener?.('pagehide', onHide);
  doc?.addEventListener?.('visibilitychange', onVis);
  return {
    on(fn) {
      if (typeof fn !== 'function') throw new Error('haptics.on: needs a function');
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    get stopping() { return left; },
    // the frame a pausing overlay appears is a trigger (its first round); otherwise run the next round while any are left.
    // The driver does not tick while the page is hidden, so a hide's remaining rounds run once it is back.
    update() {
      const p = pausing();
      if (p && !paused) { paused = true; stop('pause'); return; }
      paused = p;
      if (left > 0) { left--; stopPads(); }
    },
    dispose() {
      target.removeEventListener?.('blur', onBlur); target.removeEventListener?.('pagehide', onHide);
      doc?.removeEventListener?.('visibilitychange', onVis);
      offSeen(); listeners.length = 0; left = 0;
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/haptics.test.mjs test/seats.test.mjs test/seat-contexts.test.mjs test/seat-bindings.test.mjs test/seats-boot.test.mjs`
Expected: PASS: 7 new haptics tests. The seats suites are unchanged by the kit's new `act` option and scenes.

- [ ] **Step 6: Commit**

```bash
git add src/view/haptics.js test/helpers/seats.mjs test/haptics.test.mjs
git commit -m "feat(view): haptics lifecycle stops rumble on hide, blur and pause (C-14)"
```

---

### Task 3: Boot wiring and `defineView({ haptics })`

**Files:**
- Modify: `src/view/boot.js`
- Test: `test/haptics-boot.test.mjs`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: `createHaptics` (Task 2); boot's `seats`, `target`, `doc`.
- Produces:
  - `defineView({ scenes, render, haptics })`: `haptics` is `undefined` or `{ autoStop?: boolean }`, kept frozen on the result as `halves.haptics`. Anything else throws `defineView: haptics must be { autoStop: boolean }`.
  - `boot` builds the haptics device unless `halves.haptics?.autoStop === false`. Driver devices are `[frameDt, seats, haptics?, ...game devices, nav?]`. `dispose()` disposes it with the other devices.

- [ ] **Step 1: Write the failing tests**

```js
// test/haptics-boot.test.mjs
// [C-14] through boot; R-8 for haptics (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { createHaptics, STOP_FRAMES } from '../src/view/haptics.js';
import { dom } from './helpers/dom.mjs';
import { allocRate } from './helpers/alloc.mjs';
import { game, pad, actuator, setup } from './helpers/seats.mjs';

const VIEW = fileURLToPath(new URL('../src/view/', import.meta.url));
const ZERO = ['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }];
const start = halves => {
  const { window, document } = dom(), slots = [];
  const app = boot(game, halves, { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), getGamepads: () => slots, storage: null });
  const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); }; // what the driver's tick does
  return { app, slots, frame, window, document };
};

test('boot stops rumble on blur and when a pausing overlay opens, through the driver; dispose removes it (C-14)', () => {
  const { app, slots, frame, window } = start(defineView({ scenes: {} })), a = actuator();
  try {
    slots[0] = pad(0, { act: a }); frame();
    assert.deepEqual(a.calls, [['reset']], 'seen for the first time');
    a.calls.length = 0; window.dispatchEvent(new window.Event('blur'));
    for (let i = 0; i < 30; i++) frame();
    assert.equal(a.calls.length, 2 * STOP_FRAMES);
    a.calls.length = 0; app.engine.overlay('pause'); frame();
    assert.deepEqual(a.calls, [ZERO, ['reset']]);
  } finally { app.dispose(); }
  a.calls.length = 0; window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(a.calls, [], 'dispose removed the listeners');
});

test('defineView({ haptics: { autoStop: false } }) installs nothing: no first reset, no stop on blur, hide or pause (C-14, review focus)', () => {
  const on = start(defineView({ scenes: {} })), n = on.app.driver.devices.length; on.app.dispose();
  const { app, slots, frame, window } = start(defineView({ scenes: {}, haptics: { autoStop: false } })), a = actuator();
  try {
    assert.equal(app.driver.devices.length, n - 1, 'no haptics device');
    slots[0] = pad(0, { act: a }); frame();
    window.dispatchEvent(new window.Event('blur')); window.dispatchEvent(new window.Event('pagehide'));
    app.engine.overlay('pause'); for (let i = 0; i < 5; i++) frame();
    assert.deepEqual(a.calls, []);
  } finally { app.dispose(); }
});

test('defineView checks haptics (C-14)', () => {
  assert.equal(defineView({ scenes: {}, haptics: { autoStop: false } }).haptics.autoStop, false);
  assert.ok(Object.isFrozen(defineView({ scenes: {}, haptics: {} }).haptics));
  assert.equal(defineView({ scenes: {} }).haptics, undefined);
  for (const bad of [null, 1, 'off', { autoStop: 'no' }, { stop: false }]) {
    assert.throws(() => defineView({ scenes: {}, haptics: bad }), /defineView: haptics must be \{ autoStop: boolean \}/);
  }
});

test('a steady frame with haptics on, two pads with actuators and an open overlay allocates under 128 bytes in view code (R-8)', async () => {
  const t = setup(), h = createHaptics(t.e, { seats: t.seats, target: t.window, doc: t.document });
  t.slots[0] = pad(0, { act: actuator(), down: [0] }); t.slots[1] = pad(1, { act: actuator() });
  const step = () => { t.frame(); h.update(); };
  step(); t.e.overlay('hud'); step(); // a non-pausing overlay: the pause scan runs every frame
  const r = await allocRate(step, 2000, { warm: 500, top: 8, within: VIEW });
  assert.ok(r.inside < 128, `${Math.round(r.inside)} bytes per frame in view code:\n${r.top.join('\n')}`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/haptics-boot.test.mjs`
Expected: FAIL. The first test fails at `'seen for the first time'` (`[]`), the second at `'no haptics device'`, and the third at the first `throws` (`defineView` ignores `haptics`). The R-8 test may already pass, because it drives `createHaptics` directly.

- [ ] **Step 3: Implement in `src/view/boot.js`**

1. After `import { createSeats } from './seats.js';` add:

```js
import { createHaptics } from './haptics.js';
```

2. Replace the `defineView` function with:

```js
export function defineView({ scenes, render, haptics } = {}) {
  if (!scenes || typeof scenes !== 'object') throw new Error('defineView: scenes required');
  for (const [n, s] of Object.entries(scenes)) for (const h of ['enter', 'exit', 'frame', 'built']) if (s[h] !== undefined && typeof s[h] !== 'function') throw new Error(`defineView: scene '${n}'.${h} must be a function`);
  checkRender(render); // overview §4.6: with render, boot builds the renderer, lights, compiler, assets, sync and audio
  // [C-14] haptics: { autoStop: false } turns the engine's rumble stops off
  if (haptics !== undefined && (haptics === null || typeof haptics !== 'object' || Object.keys(haptics).some(k => k !== 'autoStop') || (haptics.autoStop !== undefined && typeof haptics.autoStop !== 'boolean'))) {
    throw new Error('defineView: haptics must be { autoStop: boolean }');
  }
  const out = { scenes: Object.freeze({ ...scenes }) };
  if (render !== undefined) out.render = Object.freeze({ ...render });
  if (haptics !== undefined) out.haptics = Object.freeze({ ...haptics });
  return Object.freeze(out);
}
```

3. After the `const seats = createSeats(engine, { getGamepads, target, doc, storage, onError: report });` line add:

```js
  // [C-14] the haptics lifecycle: stops the rumble a hide, blur or pausing overlay would leave running; after the seats
  const haptics = halves.haptics?.autoStop === false ? null : createHaptics(engine, { seats, target, doc });
```

4. In the `createDriver(...)` call, replace `devices: [frameDt, seats, ...devices.map(f => f(engine)), ...(view.nav ? [view.nav] : [])]` with:

```js
devices: [frameDt, seats, ...(haptics ? [haptics] : []), ...devices.map(f => f(engine)), ...(view.nav ? [view.nav] : [])]
```

`dispose()` already calls `dispose?.()` on every driver device.

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/haptics-boot.test.mjs test/haptics.test.mjs test/seats-boot.test.mjs test/boot.test.mjs test/boot-args.test.mjs test/render-boot.test.mjs test/menuNav.test.mjs test/view-alloc.test.mjs`
Expected: PASS: 4 new tests, and the boot, render-boot, menu navigator and view-alloc suites unchanged. If the allocation test fails, fix `haptics.update()` (no closures, arrays or objects on a frame without a stop), not the budget.

- [ ] **Step 5: Mark [C-14] built and record the rulings in `docs/spec.md`**

1. Replace `- **[C-14] Haptics.** Games call` with `- **[C-14] Haptics.** (built, plan 4) Games call`.
2. After the [C-14] bullet, add:

```markdown
- **Rulings (plan 4, 2026-10-21).** A stop is `playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 })` then `reset()`, sent at once (on `blur`, `pagehide`, a `visibilitychange` to hidden, or the frame a pausing overlay opens) and on each of the next 19 driver frames, 20 rounds in all; a new trigger restarts the count. Hide, blur and pause are page-wide, so every seat is affected; the stops go to each seat's `lp.pads` (live pads only). While the page is hidden the driver does not tick, so the remaining rounds run on the frames after it returns. A pausing overlay (any open overlay whose scene has `pauses`) stops once as it opens, not while it stays open, so a pause menu may rumble. The first-sight reset follows `seat.seen` (once per index and `id` for the page's life). Actuators without `playEffect`, and calls that throw or reject, are skipped silently. `defineView({ haptics })` accepts only `{ autoStop: boolean }`; with `autoStop: false` boot builds no haptics device at all.
```

- [ ] **Step 6: Commit**

```bash
git add src/view/boot.js test/haptics-boot.test.mjs docs/spec.md
git commit -m "feat(view): boot runs the haptics lifecycle; defineView haptics.autoStop (C-14)"
```

---

### Task 4: Fake pads — any number, unplug events, recording actuators

**Files:**
- Modify: `testing/playwright.js`
- Test: `test/playwright.test.mjs`
- Test: `test/pads-e2e.test.mjs`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: Playwright `page.evaluate`, `context.addInitScript` (`open`'s `pads: 'fake'`, the default).
- Produces (on the `game` driver):
  - `pad(index, state)` → Promise: plugs or updates pad `index` (an integer 0..15). `pad(state)` is `pad(0, state)`. `state` holds the standard buttons down (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`, `select`, `start`, `ls`, `rs`, `up`, `down`, `left`, `right`), `axes` (padded with 0 to at least 4, extra axes kept), `id` (default `'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)'`), `mapping` (default `'standard'`) and `effects` (an array sets the actuator's list; `null` gives this state no `vibrationActuator`). `pad(null)` / `pad(index, null)` unplug.
  - `unplug(index)` → Promise: empties the slot (trailing empty slots are trimmed) and fires `gamepaddisconnected` with `{ ...pad, connected: false }`. Plugging an empty slot fires `gamepadconnected`. Unplugging an empty slot does nothing.
  - `haptics(index)` → Promise of `{ effects, calls }` or `null`. `calls` are `{ op: 'playEffect', type, params }` and `{ op: 'reset' }`, in order. The actuator stays with the index until a pad with another `id` plugs in there.
  - The in-page `navigator.getGamepads()` returns a new array each call, with `null` in empty slots.
  - Errors: `playwright: pad index must be an integer in 0..15 (got <json>)`.

- [ ] **Step 1: Write the failing unit test**

Append to `test/playwright.test.mjs`:

```js
test('T-24: game.pad(state) is pad 0, pad(index, state) any pad; unplug and haptics name an index 0..15 (review focus)', async () => {
  const calls = [];
  const g = fake(async (fn, a) => { calls.push(a); return null; });
  await g.pad({ a: true }); await g.pad(3, { b: true }); await g.pad(null); await g.pad(2, null); await g.unplug(1); await g.haptics(0);
  assert.deepEqual(calls, [[0, { a: true }], [3, { b: true }], [0, null], [2, null], 1, 0]);
  for (const bad of [-1, 16, 1.5, '1']) await assert.rejects(g.unplug(bad), /playwright: pad index must be an integer in 0\.\.15/);
  await assert.rejects(g.pad(16, {}), /pad index must be an integer in 0\.\.15 \(got 16\)/);
});
```

- [ ] **Step 2: Write the failing browser test**

```js
// test/pads-e2e.test.mjs
// Real-Chromium check of the Playwright fake pads (T-24): any number of pads, connect and disconnect events, recording actuators.
import test, { before, after } from 'node:test';
import http from 'node:http';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

let server, base, chrome, skip = false;
const PAGE = '<!doctype html><body><script>window.log=[];for(const t of ["gamepadconnected","gamepaddisconnected"])addEventListener(t,e=>log.push([t,e.gamepad.index,e.gamepad.id,e.gamepad.connected]));</script>';
const ENGINE = 'window.engine={render(){},errors:[],state(){return{}},ready:Promise.resolve(),settled(){return true}};';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE + '<script>' + ENGINE + '</script>'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

const pads = game => game.page.evaluate(() => [...navigator.getGamepads()].map(p => p && [p.index, p.id, p.mapping, p.buttons[0].pressed, p.axes.slice(0, 2)]));

test('game.pad(index, state) plugs any number of pads with their own id and mapping; game.pad(state) is still pad 0 (T-24, review focus)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    assert.deepEqual(await pads(game), [], 'no pad until one is plugged');
    await game.pad({ a: true, axes: [0.5, 0] });
    await game.pad(2, { id: WHEEL, mapping: '', axes: [-1, 0, 1, 0, 0.25] });
    assert.deepEqual(await pads(game), [[0, XBOX, 'standard', true, [0.5, 0]], null, [2, WHEEL, '', false, [-1, 0]]]);
    assert.equal(await game.page.evaluate(() => navigator.getGamepads()[2].axes.length), 5, 'axes beyond four are kept');
    await game.pad({ b: true });
    assert.equal((await pads(game))[0][3], false, 'pad 0 updated');
    await assert.rejects(game.pad(16, {}), /pad index must be an integer in 0\.\.15/);
  } finally { await game.close(); }
});

test('game.unplug(index) empties the slot and fires gamepaddisconnected; plugging fires gamepadconnected (T-24)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.pad(1, { id: 'Pad B' }); await game.pad(1, { id: 'Pad B', a: true });
    await game.unplug(1);
    assert.deepEqual((await pads(game)).map(p => p?.[0]), [0], 'the trailing empty slot is trimmed');
    await game.unplug(3); await game.pad(null);
    assert.deepEqual(await pads(game), []);
    assert.deepEqual(await game.page.evaluate(() => window.log), [
      ['gamepadconnected', 0, XBOX, true], ['gamepadconnected', 1, 'Pad B', true],
      ['gamepaddisconnected', 1, 'Pad B', false], ['gamepaddisconnected', 0, XBOX, false],
    ]);
  } finally { await game.close(); }
});

test("each pad's vibrationActuator records playEffect and reset; effects is settable; an unlisted effect rejects; effects: null has none (T-24)", async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {});
    const r = await game.page.evaluate(async () => {
      const a = navigator.getGamepads()[0].vibrationActuator, out = [[...a.effects]];
      out.push(await a.playEffect('dual-rumble', { duration: 100, strongMagnitude: 1, weakMagnitude: 0.5 }), await a.reset());
      return out;
    });
    assert.deepEqual(r, [['dual-rumble', 'trigger-rumble'], 'complete', 'complete']);
    await game.pad(0, { effects: ['dual-rumble'] });
    const err = await game.page.evaluate(async () => {
      try { await navigator.getGamepads()[0].vibrationActuator.playEffect('trigger-rumble', { duration: 50, leftTrigger: 1 }); return null; } catch (e) { return e.name; }
    });
    assert.equal(err, 'NotSupportedError');
    assert.deepEqual(await game.haptics(0), { effects: ['dual-rumble'], calls: [
      { op: 'playEffect', type: 'dual-rumble', params: { duration: 100, strongMagnitude: 1, weakMagnitude: 0.5 } },
      { op: 'reset' },
      { op: 'playEffect', type: 'trigger-rumble', params: { duration: 50, leftTrigger: 1 } },
    ] });
    await game.pad(0, { effects: null });
    assert.equal(await game.page.evaluate(() => navigator.getGamepads()[0].vibrationActuator), null);
    assert.equal(await game.haptics(1), null, 'no pad was ever at 1');
    await game.pad(0, { id: 'Another pad' });
    assert.deepEqual((await game.haptics(0)).calls, [], 'another id at the index: a new actuator');
  } finally { await game.close(); }
});
```

- [ ] **Step 3: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/playwright.test.mjs`
Expected: FAIL: `T-24: …` fails because `g.unplug` is not a function, or the `pad` arguments differ.

Run (browser, alone): `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=1536 --test test/pads-e2e.test.mjs`
Expected: FAIL. The first test fails at the `pads(game)` deep-equal (one pad only, at index 0), the second at `game.unplug is not a function`, and the third at `vibrationActuator` being undefined. On a machine without Chromium the tests skip; say so in the report.

- [ ] **Step 4: Implement in `testing/playwright.js`**

1. Above `export function gameDriver(`, add:

```js
// [T-24] a fake pad's index: an integer in 0..15
const padIndex = i => { if (!Number.isInteger(i) || i < 0 || i > 15) throw new Error(`playwright: pad index must be an integer in 0..15 (got ${JSON.stringify(i)})`); return i; };
```

2. In the `game` object, replace the comment block and the line `pad: state => ev(st => window.__lhSetPad(st), state ?? null),` with:

```js
    // [T-24] fake pads (open's default pads: 'fake'). pad(index, state) plugs or updates pad `index`; pad(state) is pad 0,
    // as before. state: the standard buttons down ({ a: true, lt: true, ... }), axes, and optional id, mapping and effects
    // (the actuator's list; effects: null gives this state no vibrationActuator). pad(null) and pad(index, null) unplug, as
    // unplug(index) does (gamepaddisconnected fires; plugging an empty slot fires gamepadconnected). haptics(index) is
    // { effects, calls } of that index's actuator ({ op: 'playEffect', type, params } / { op: 'reset' }), or null. Devices
    // read a change on the next frame, so follow with frames() before stepping.
    pad: async (index, state) => {
      if (typeof index !== 'number') { state = index; index = 0; }
      return ev(([i, st]) => window.__lhSetPad(i, st), [padIndex(index), state ?? null]);
    },
    unplug: async index => ev(i => window.__lhUnplug(i), padIndex(index)),
    haptics: async index => ev(i => window.__lhHaptics(i), padIndex(index)),
```

3. Replace the whole `FAKE_PADS` definition (from `const FAKE_PADS = () => {` to its closing `};`) and the two comment lines above it with:

```js
// a page's navigator.getGamepads() with pads: 'fake' (the default): none until game.pad() plugs one in, so a controller on
// the test machine (or Steam's virtual pad) never reaches a test. [T-24] any number of pads, connect and disconnect events,
// and a recording vibrationActuator per index (kept until a pad with another id plugs in there).
const FAKE_PADS = () => {
  const NAMES = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };
  const ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', EFFECTS = ['dual-rumble', 'trigger-rumble'];
  const pads = [], acts = []; // by index: the plugged pad (or null), and { id, a } its actuator
  const fire = (type, gamepad) => { const e = new Event(type); Object.defineProperty(e, 'gamepad', { value: gamepad }); window.dispatchEvent(e); };
  const actuator = () => {
    const a = {
      effects: [...EFFECTS], calls: [],
      playEffect(type, params = {}) {
        a.calls.push({ op: 'playEffect', type, params: { ...params } });
        return a.effects.includes(type) ? Promise.resolve('complete') : Promise.reject(new DOMException(`${type} is not supported by this pad`, 'NotSupportedError'));
      },
      reset() { a.calls.push({ op: 'reset' }); return Promise.resolve('complete'); },
    };
    return a;
  };
  window.__lhUnplug = index => {
    const p = pads[index]; if (!p) return;
    pads[index] = null;
    while (pads.length && !pads[pads.length - 1]) pads.length--;
    fire('gamepaddisconnected', { ...p, connected: false });
  };
  window.__lhSetPad = (index, st) => {
    if (!st) { window.__lhUnplug(index); return; }
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    for (const [k, i] of Object.entries(NAMES)) if (st[k]) buttons[i] = { pressed: true, touched: true, value: 1 };
    const axes = [...(st.axes ?? [])]; while (axes.length < 4) axes.push(0);
    const id = st.id ?? ID, fresh = !pads[index];
    if (!acts[index] || acts[index].id !== id) acts[index] = { id, a: actuator() };
    const a = acts[index].a;
    if (Array.isArray(st.effects)) a.effects = [...st.effects];
    while (pads.length < index) pads.push(null);
    pads[index] = { id, index, connected: true, mapping: st.mapping ?? 'standard', timestamp: performance.now(), axes, buttons, vibrationActuator: st.effects === null ? null : a };
    if (fresh) fire('gamepadconnected', pads[index]);
  };
  window.__lhHaptics = index => { const x = acts[index]; return x ? { effects: [...x.a.effects], calls: x.a.calls.map(c => ({ ...c, ...(c.params ? { params: { ...c.params } } : {}) })) } : null; };
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => pads.slice() });
};
```

- [ ] **Step 5: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/playwright.test.mjs`
Expected: PASS, with 1 new test.

Run (browser, alone): `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=1536 --test test/pads-e2e.test.mjs`
Expected: PASS: 3 tests.

Then run the browser suites that use `game.pad` today, one at a time, to check that existing callers still work: `grep -rln "\.pad(" test/*e2e*.test.mjs`. Run each file listed alone with the same command. Expected: PASS, unchanged.

- [ ] **Step 6: Mark [T-24] built in `docs/spec.md`**

1. Replace `- **[T-24] Fake pads.** The Playwright fake pads` with `- **[T-24] Fake pads.** (built, plan 4) The Playwright fake pads`.
2. At the end of that bullet, append:

```markdown
 Rulings (plan 4): `game.pad(state)` is `game.pad(0, state)`; `game.pad(null)` and `game.pad(index, null)` unplug like `game.unplug(index)`; plugging an empty slot fires `gamepadconnected`; indexes are integers 0..15; `navigator.getGamepads()` returns a new array each call with `null` in empty slots (trailing ones trimmed). The actuator lists `['dual-rumble', 'trigger-rumble']` unless `effects` is given; `effects: null` gives that state no `vibrationActuator`; an unlisted effect rejects `NotSupportedError`; the actuator and its call log stay with the index until a pad with another `id` plugs in there. `game.haptics(index)` is `{ effects, calls }` (`{ op: 'playEffect', type, params }` / `{ op: 'reset' }`) or `null`.
```

3. In [T-17]'s `Input:` item, replace `` `game.pad({ a, b, start, lb, rb, up, …, axes: [x, y], id })` plugs one in (`game.pad(null)` unplugs it; `` with `` `game.pad({ a, b, start, lb, rb, up, …, axes: [x, y], id })` plugs pad 0 in (any number of pads, [T-24]; `game.pad(null)` unplugs it; ``.

- [ ] **Step 7: Commit**

```bash
git add testing/playwright.js test/playwright.test.mjs test/pads-e2e.test.mjs docs/spec.md
git commit -m "feat(testing): any number of fake pads with recording actuators (T-24)"
```

---

### Task 5: Pad bench logic — stats, live taps, patterns, play and self-test

**Files:**
- Create: `src/view/bench/padStats.js`
- Test: `test/bench-stats.test.mjs`

**Interfaces:**
- Consumes: plain `Gamepad`-shaped objects (`id`, `index`, `mapping`, `timestamp`, `axes`, `buttons[{ pressed, touched, value }]`, `vibrationActuator`).
- Produces:
  - Constants: `STD_BUTTONS` (18 names), `STD_AXES` (4), `SECTORS = 36`, `TRACE = 3000`, `TAP_MIN = 50`, `FULL = 0.95`.
  - `createPadStats(pad, now)` → `{ id, lastTs, changes, presses, peak, down, min, max, trace: [[], []], bins: [Float32Array(36) ×2], calm: [0, 0], rest: [0, 0], seenAt }`.
  - `updateStats(s, pad, now, onButton?)`: `onButton(i, down, value)` on each button change; presses count down edges; peaks and axis min/max (starting at 0) for the pad's life; one `changes` entry per new `timestamp`, kept for 1000 ms; each stick's distinct readings in `trace` (at most `TRACE`); the furthest reach over 0.3 per sector in `bins`; `rest[k]` = the stick's radius after 30 updates without moving more than 0.01, while under 0.3.
  - `rate(s)` → changes in the last second. `stickEdge(s, k)` → `{ avg, lo, hi, filled }` or `null`.
  - `shapeTap(v, curve)` → `0` at or under 0.02, `1` past `FULL`, else `min(1, v ** curve)`.
  - `liveState()` → `{ tapAt, bodyAt, active }`. `liveEffect(st, { L, R, stick }, now, { trig, body, stickBody, interval = 130, length = 60, curve = 0.6 })` → `{ type, params }`, `'idle'` (once, when everything is let go) or `null`. Taps last `max(TAP_MIN, length)` ms and come every `max(interval, length + 20)` ms. Body rumble (`dual-rumble`, 120 ms) is refreshed every 50 ms.
  - `PATTERNS`: 12 `{ name, sub, trig?, steps: [[atMs, type, params]] }`.
  - `play(actuator, type, params, { log, label = type, quiet = false, timer = globalThis })` → Promise of the answer, or `null`. Logs `(text, cls)`. Its watchdog logs `<label>: no answer after <duration + startDelay + 1500> ms (promise still pending)`.
  - `selfTest(pad, { log, play, env })`. `supports(actuator)` → `{ dual, trigger }`, each `true | false | null` (`null` = not listed). `describe(device)` → one line per device.

- [ ] **Step 1: Write the failing tests**

```js
// test/bench-stats.test.mjs
// [D-7]: the pad bench's numbers and haptics helpers (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STD_BUTTONS, STD_AXES, SECTORS, TRACE, TAP_MIN, PATTERNS, createPadStats, updateStats, rate, stickEdge, shapeTap, liveState, liveEffect, play, selfTest, supports, describe } from '../src/view/bench/padStats.js';

const gp = (o = {}) => ({ id: 'Pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...o });
const fakeTimer = () => {
  const t = { pending: new Map(), n: 0, setTimeout(fn, ms) { t.pending.set(++t.n, [fn, ms]); return t.n; }, clearTimeout(id) { t.pending.delete(id); },
    run() { const all = [...t.pending.values()]; t.pending.clear(); for (const [fn] of all) fn(); } };
  return t;
};

test('updateStats counts presses on the down edge, keeps peaks, and reports each button change (D-7)', () => {
  const s = createPadStats(gp(), 0), seen = [];
  const pull = (v, ts) => { const p = gp({ timestamp: ts }); p.buttons[6] = { pressed: v > 0.5, value: v }; return p; };
  for (const [v, ts] of [[0.3, 1], [0.9, 2], [0.7, 3], [0, 4], [1, 5]]) updateStats(s, pull(v, ts), ts * 10, (...a) => seen.push(a));
  assert.equal(s.presses[6], 2); assert.equal(s.peak[6], 1);
  assert.deepEqual(seen, [[6, true, 0.9], [6, false, 0], [6, true, 1]]);
  assert.equal(STD_BUTTONS[6], 'LT / L2'); assert.equal(STD_BUTTONS.length, 18); assert.equal(STD_AXES[0], 'left stick X');
});

test('axis range starts at 0; rate counts timestamp changes in the last second (D-7)', () => {
  const s = createPadStats(gp(), 0);
  for (let i = 0; i < 10; i++) updateStats(s, gp({ timestamp: i, axes: [i / 10, -i / 20, 0, 0] }), i * 100);
  assert.equal(rate(s), 10);
  assert.deepEqual([s.min[0], s.max[0], s.min[1], s.max[1]], [0, 0.9, -0.45, 0]);
  updateStats(s, gp({ timestamp: 9 }), 1950);
  assert.equal(rate(s), 0, 'nothing new in the last second');
});

test("stick traces keep distinct readings; the outline keeps each sector's furthest reach; rest drift is the still stick's offset (D-7)", () => {
  const s = createPadStats(gp(), 0);
  for (let i = 0; i < 40; i++) updateStats(s, gp({ axes: [0.03, 0.02, 0, 0] }), i);
  assert.equal(s.trace[0].length, 1, 'one distinct reading');
  assert.ok(Math.abs(s.rest[0] - Math.hypot(0.03, 0.02)) < 1e-9, 'resting offset');
  assert.equal(stickEdge(s, 0), null, 'not rolled yet');
  updateStats(s, gp({ axes: [1, 0, 0, 0] }), 50); updateStats(s, gp({ axes: [0, 1, 0, 0] }), 51);
  assert.equal(s.bins[0][18], 1); assert.equal(s.bins[0][27], 1);
  assert.deepEqual(stickEdge(s, 0), { avg: 1, lo: 1, hi: 1, filled: 2 });
  assert.ok(Math.abs(s.rest[0] - Math.hypot(0.03, 0.02)) < 1e-9, 'moving away keeps the resting offset');
  for (let i = 0; i < TRACE + 5; i++) updateStats(s, gp({ axes: [i / (TRACE * 2), 0, 0, 0] }), 100 + i);
  assert.equal(s.trace[0].length, TRACE); assert.equal(SECTORS, 36);
});

test('shapeTap: silent at 2% or less, the response curve in between, full strength past 95% (D-7)', () => {
  assert.equal(shapeTap(0.01, 0.6), 0); assert.equal(shapeTap(0.02, 0.6), 0);
  assert.equal(shapeTap(0.5, 1), 0.5); assert.ok(Math.abs(shapeTap(0.5, 0.6) - 0.5 ** 0.6) < 1e-12);
  assert.equal(shapeTap(0.95, 1), 0.95); assert.equal(shapeTap(0.951, 0.6), 1);
});

test('liveEffect: taps at least 50 ms, every max(interval, tap + 20) ms; body rumble every 50 ms; one idle when let go (D-7)', () => {
  const opts = { trig: true, interval: 80, length: 10, curve: 1 }, st = liveState();
  const e = liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 0, opts);
  assert.equal(e.type, 'trigger-rumble');
  assert.deepEqual(e.params, { startDelay: 0, duration: TAP_MIN, leftTrigger: 0.5, rightTrigger: 0, strongMagnitude: 0, weakMagnitude: 0 });
  assert.equal(liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 79, opts), null);
  assert.equal(liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 80, opts).type, 'trigger-rumble');
  const long = liveState(), lo = { trig: true, interval: 80, length: 100, curve: 1 };
  liveEffect(long, { L: 1, R: 1, stick: 0 }, 0, lo);
  assert.equal(liveEffect(long, { L: 1, R: 1, stick: 0 }, 119, lo), null, 'a long tap pushes the next one back');
  assert.equal(liveEffect(long, { L: 1, R: 1, stick: 0 }, 120, lo).params.duration, 100);
  const body = liveState();
  assert.deepEqual(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 0, { body: true }), { type: 'dual-rumble', params: { startDelay: 0, duration: 120, strongMagnitude: 0.4, weakMagnitude: 0.2 } });
  assert.equal(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 30, { body: true }), null);
  assert.equal(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 50, { body: true }).type, 'dual-rumble');
  assert.equal(liveEffect(body, { L: 0, R: 0, stick: 0 }, 100, { body: true }), 'idle');
  assert.equal(liveEffect(body, { L: 0, R: 0, stick: 0 }, 116, { body: true }), null, 'idle only once');
  const stick = liveEffect(liveState(), { L: 0, R: 0, stick: 0.5 }, 0, { stickBody: true }).params;
  assert.deepEqual([stick.strongMagnitude, stick.weakMagnitude], [0.5, 0.3]);
});

test('play logs the call and the answer; a watchdog reports a promise still pending; rejections and missing actuators are logged (D-7)', async () => {
  const log = [], timer = fakeTimer(), opts = label => ({ log: (...x) => log.push(x), label, timer });
  assert.equal(await play({ playEffect: async () => 'complete' }, 'dual-rumble', { duration: 100 }, opts('Body')), 'complete');
  assert.deepEqual(log, [['Body: playEffect("dual-rumble", {"duration":100})', ''], ['Body: complete', 'ok']]);
  assert.equal(timer.pending.size, 0, 'the watchdog is cleared once it answers');
  log.length = 0;
  play({ playEffect: () => new Promise(() => {}) }, 'trigger-rumble', { duration: 500, startDelay: 100 }, opts('T'));
  assert.equal([...timer.pending.values()][0][1], 2100);
  timer.run();
  assert.deepEqual(log.at(-1), ['T: no answer after 2100 ms (promise still pending)', 'err']);
  const nope = Object.assign(new Error('nope'), { name: 'NotSupportedError' });
  assert.equal(await play({ playEffect: async () => { throw nope; } }, 'trigger-rumble', {}, opts('R')), null);
  assert.deepEqual(log.at(-1), ['R: NotSupportedError: nope', 'err']);
  assert.equal(await play(null, 'dual-rumble', {}, opts('N')), null);
  assert.deepEqual(log.at(-1), ['N: this pad has no vibrationActuator', 'err']);
  assert.equal(await play({}, 'dual-rumble', {}, opts('M')), null);
  assert.deepEqual(log.at(-1), ['M: vibrationActuator has no playEffect() in this browser', 'err']);
  log.length = 0;
  assert.equal(await play({ playEffect: async () => 'preempted' }, 'dual-rumble', {}, { ...opts('Q'), quiet: true }), 'preempted');
  assert.deepEqual(log, [], 'quiet: no call line, no watchdog, no preempted line'); assert.equal(timer.pending.size, 0);
});

test('selfTest logs the browser, the pad and its actuator, then plays a body and a trigger effect (D-7)', async () => {
  const log = [], played = [], env = { userAgent: 'UA', focused: true, visibility: 'visible', secure: true };
  const run = p => selfTest(p, { log: t => log.push(t), play: async (type, params, label) => { played.push([type, label, params.duration]); }, env });
  await run(gp({ vibrationActuator: { effects: ['dual-rumble'], playEffect() {}, reset() {} } }));
  assert.ok(log.includes('browser: UA')); assert.ok(log.includes('effects: ["dual-rumble"]'));
  assert.deepEqual(played, [['dual-rumble', 'self-test body', 500], ['trigger-rumble', 'self-test triggers', 500]]);
  log.length = 0; played.length = 0;
  await run(gp({ vibrationActuator: null }));
  assert.ok(log.includes("'vibrationActuator' in gamepad: true · value: null")); assert.deepEqual(played, []);
  log.length = 0;
  await run(null);
  assert.ok(log.includes('controller: none selected. Press a button on it first.')); assert.deepEqual(played, []);
});

test('supports, describe and the patterns (D-7)', () => {
  assert.deepEqual(supports(null), { dual: false, trigger: false });
  assert.deepEqual(supports({ effects: ['dual-rumble'] }), { dual: true, trigger: false });
  assert.deepEqual(supports({ type: 'dual-rumble' }), { dual: true, trigger: null });
  assert.deepEqual(supports({}), { dual: null, trigger: null });
  assert.equal(describe({ kind: 'pad', index: 1, id: 'G29', mapping: '', lost: true }), 'pad 1 "G29" mapping "" · lost');
  assert.equal(describe({ kind: 'keys', scheme: 'all' }), 'keys all');
  assert.equal(describe({ kind: 'touch' }), 'touch');
  assert.equal(describe({ kind: 'hid', key: 'k1', id: 'Pedals', lost: false }), 'hid k1 "Pedals"');
  assert.equal(describe(null), '-');
  assert.equal(PATTERNS.length, 12);
  for (const p of PATTERNS) {
    let last = -1;
    for (const [at, type, params] of p.steps) {
      assert.ok(at >= last, `${p.name}: steps in time order`); last = at;
      assert.ok(type === 'dual-rumble' || type === 'trigger-rumble');
      assert.ok(params.duration >= 10 && params.startDelay === 0);
      if (type === 'trigger-rumble') assert.equal(p.trig, true, `${p.name} uses the triggers`);
    }
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/bench-stats.test.mjs`
Expected: FAIL with `Cannot find module '.../src/view/bench/padStats.js'`.

- [ ] **Step 3: Write the module**

```js
// src/view/bench/padStats.js
// [D-7] the pad bench's numbers and haptics helpers, from the Gamepad Bench artifact: per-pad peaks, press counts, axis
// range, stick traces and edge outline, rest drift, update rate; trigger-tap shaping and live coupling; effect patterns;
// a playEffect wrapper with a pending-promise watchdog; the self-test. No DOM: the overlay (pads.js) draws these.
export const STD_BUTTONS = Object.freeze(['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'Back / Select', 'Start / Options', 'L3 (left stick)', 'R3 (right stick)', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right',
  'Home / Guide', 'Touchpad / Share']);
export const STD_AXES = Object.freeze(['left stick X', 'left stick Y', 'right stick X', 'right stick Y']);
export const SECTORS = 36, TRACE = 3000, TAP_MIN = 50, FULL = 0.95;
const WINDOW = 1000, CENTRE = 0.3, CALM = 30, CALM_MOVE = 0.01;

export function createPadStats(pad, now) {
  return { id: pad.id, lastTs: -1, changes: [], presses: [], peak: [], down: [], min: [], max: [], trace: [[], []],
    bins: [new Float32Array(SECTORS), new Float32Array(SECTORS)], calm: [0, 0], rest: [0, 0], seenAt: now };
}
export function updateStats(s, pad, now, onButton) {
  if (pad.timestamp !== s.lastTs) { s.lastTs = pad.timestamp; s.changes.push(now); }
  while (s.changes.length && now - s.changes[0] > WINDOW) s.changes.shift();
  const b = pad.buttons ?? [], a = pad.axes ?? [];
  for (let i = 0; i < b.length; i++) {
    const d = b[i]?.pressed === true, v = b[i]?.value ?? (d ? 1 : 0), was = s.down[i] === true;
    if (d && !was) { s.presses[i] = (s.presses[i] ?? 0) + 1; onButton?.(i, true, v); } else if (!d && was) onButton?.(i, false, v);
    s.down[i] = d; s.peak[i] = Math.max(s.peak[i] ?? 0, v);
  }
  for (let i = 0; i < a.length; i++) { const v = a[i] ?? 0; s.min[i] = Math.min(s.min[i] ?? 0, v); s.max[i] = Math.max(s.max[i] ?? 0, v); }
  for (let k = 0; k < 2; k++) {
    const x = a[k * 2], y = a[k * 2 + 1];
    if (x === undefined || y === undefined) continue;
    const tr = s.trace[k], last = tr[tr.length - 1], m = Math.hypot(x, y);
    const still = last !== undefined && Math.abs(last[0] - x) < CALM_MOVE && Math.abs(last[1] - y) < CALM_MOVE;
    s.calm[k] = still ? s.calm[k] + 1 : 0;
    if (s.calm[k] >= CALM && m < CENTRE) s.rest[k] = m; // drift: where the stick sits when nobody moves it
    if (last === undefined || last[0] !== x || last[1] !== y) { tr.push([x, y]); if (tr.length > TRACE) tr.shift(); }
    if (m > CENTRE) {
      const bi = Math.min(SECTORS - 1, Math.floor((Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * SECTORS));
      if (m > s.bins[k][bi]) s.bins[k][bi] = m;
    }
  }
}
export const rate = s => s.changes.length;
export function stickEdge(s, k) {
  let filled = 0, sum = 0, lo = Infinity, hi = 0;
  for (let i = 0; i < SECTORS; i++) { const m = s.bins[k][i]; if (!m) continue; filled++; sum += m; lo = Math.min(lo, m); hi = Math.max(hi, m); }
  return filled ? { avg: sum / filled, lo, hi, filled } : null;
}

// live coupling: trigger pull taps that trigger (strength follows the pull); trigger pull or the left stick drives the body
export const shapeTap = (v, curve) => (v > FULL ? 1 : v > 0.02 ? Math.min(1, v ** curve) : 0);
export const liveState = () => ({ tapAt: -Infinity, bodyAt: -Infinity, active: false });
export function liveEffect(st, { L, R, stick }, now, { trig = false, body = false, stickBody = false, interval = 130, length = 60, curve = 0.6 } = {}) {
  length = Math.max(TAP_MIN, length);
  let strong = 0, weak = 0;
  if (body) { strong = Math.max(strong, L); weak = Math.max(weak, R); }
  if (stickBody && stick > 0.1) { strong = Math.max(strong, stick); weak = Math.max(weak, stick * 0.6); }
  const bodyOn = strong > 0.01 || weak > 0.01, trigOn = trig && (L > 0.02 || R > 0.02);
  if (!bodyOn && !trigOn) { st.tapAt = -Infinity; if (st.active) { st.active = false; return 'idle'; } return null; }
  st.active = true;
  // taps carry the body values too: each playEffect preempts the last
  if (trigOn && now - st.tapAt >= Math.max(interval, length + 20)) {
    st.tapAt = now; st.bodyAt = now;
    return { type: 'trigger-rumble', params: { startDelay: 0, duration: length, leftTrigger: shapeTap(L, curve), rightTrigger: shapeTap(R, curve), strongMagnitude: strong, weakMagnitude: weak } };
  }
  if (!bodyOn || now - st.bodyAt < 50 || (trigOn && now - st.tapAt < length)) return null;
  st.bodyAt = now;
  return { type: 'dual-rumble', params: { startDelay: 0, duration: 120, strongMagnitude: strong, weakMagnitude: weak } };
}

// patterns: [atMs, type, params]; each playEffect preempts the previous one
const T = (l, r, d, extra = {}) => ['trigger-rumble', { startDelay: 0, duration: d, leftTrigger: l, rightTrigger: r, strongMagnitude: 0, weakMagnitude: 0, ...extra }];
const D = (s, w, d) => ['dual-rumble', { startDelay: 0, duration: d, strongMagnitude: s, weakMagnitude: w }];
const rep = (n, every, fn) => Array.from({ length: n }, (_, i) => [i * every, ...fn(i)]);
export const PATTERNS = Object.freeze([
  { name: 'Trigger click L', sub: 'one 40 ms tick', trig: true, steps: [[0, ...T(1, 0, 40)]] },
  { name: 'Trigger click R', sub: 'one 40 ms tick', trig: true, steps: [[0, ...T(0, 1, 40)]] },
  { name: 'Ping-pong', sub: 'alternating L/R', trig: true, steps: rep(10, 140, i => T(i % 2 ? 0 : 1, i % 2 ? 1 : 0, 100)) },
  { name: 'ABS brake', sub: 'LT stutter 1.2 s', trig: true, steps: rep(15, 80, () => T(0.9, 0, 40)) },
  { name: 'Recoil', sub: 'RT kick + body thump', trig: true, steps: [[0, ...T(0, 1, 45, { strongMagnitude: 0.7 })], [45, ...T(0, 0.35, 90, { weakMagnitude: 0.3 })]] },
  { name: 'Bowstring', sub: 'RT tension ramp, release', trig: true, steps: [...rep(20, 60, i => T(0, 0.05 + i * 0.03, 70)), [1200, ...T(0, 0, 10, { strongMagnitude: 1 })], [1210, ...D(1, 0.6, 120)]] },
  { name: 'Trigger sweep', sub: 'ramp 0 to 1 both', trig: true, steps: rep(25, 60, i => T(i / 24, i / 24, 70)) },
  { name: 'Heartbeat', sub: 'lub-dub x 3', steps: [0, 900, 1800].flatMap(t => [[t, ...D(0.8, 0, 90)], [t + 200, ...D(0.45, 0, 90)]]) },
  { name: 'Engine idle', sub: 'body, 2 s', steps: rep(34, 60, i => D(i % 2 ? 0.22 : 0.32, 0.12, 70)) },
  { name: 'Motor ramp', sub: 'strong 0 to 1', steps: rep(25, 60, i => D(i / 24, 0, 70)) },
  { name: 'Weak buzz', sub: 'high motor 0.5 s', steps: [[0, ...D(0, 1, 500)]] },
  { name: 'Max everything', sub: '4 motors, 0.6 s', trig: true, steps: [[0, ...T(1, 1, 600, { strongMagnitude: 1, weakMagnitude: 1 })]] },
]);

// one playEffect, logged; unless quiet, a watchdog reports a promise the browser never settles (seen on Linux hidraw)
export async function play(a, type, params, { log = () => {}, label = type, quiet = false, timer = globalThis } = {}) {
  if (!a) { if (!quiet) log(`${label}: this pad has no vibrationActuator`, 'err'); return null; }
  if (typeof a.playEffect !== 'function') { if (!quiet) log(`${label}: vibrationActuator has no playEffect() in this browser`, 'err'); return null; }
  if (!quiet) log(`${label}: playEffect("${type}", ${JSON.stringify(params)})`, '');
  const wait = (params.duration || 0) + (params.startDelay || 0) + 1500;
  let settled = false;
  const dog = quiet ? null : timer.setTimeout(() => { if (!settled) log(`${label}: no answer after ${wait} ms (promise still pending)`, 'err'); }, wait);
  try {
    const r = await a.playEffect(type, params);
    settled = true; if (dog !== null) timer.clearTimeout(dog);
    if (!quiet || r !== 'preempted') log(`${label}: ${r}`, r === 'complete' ? 'ok' : '');
    return r;
  } catch (e) {
    settled = true; if (dog !== null) timer.clearTimeout(dog);
    log(`${label}: ${e?.name}: ${e?.message}`, 'err');
    return null;
  }
}
export async function selfTest(pad, { log, play: run, env = {} }) {
  log('- self-test -', 'sys');
  if (env.userAgent) log(`browser: ${env.userAgent}`, '');
  log(`page focused: ${env.focused} · visibility: ${env.visibility} · secure: ${env.secure}`, '');
  if (!pad) { log('controller: none selected. Press a button on it first.', 'err'); return; }
  log(`controller: "${pad.id}" · index ${pad.index} · mapping "${pad.mapping}"`, '');
  const a = pad.vibrationActuator;
  log(`'vibrationActuator' in gamepad: ${'vibrationActuator' in pad} · value: ${a ? 'object' : a}`, a ? 'ok' : 'err');
  if (!a) return;
  log(`playEffect: ${typeof a.playEffect} · reset: ${typeof a.reset}`, '');
  log(`effects: ${'effects' in a ? JSON.stringify(Array.from(a.effects ?? [])) : 'not exposed'}`, '');
  await run('dual-rumble', { startDelay: 0, duration: 500, strongMagnitude: 1, weakMagnitude: 1 }, 'self-test body');
  await run('trigger-rumble', { startDelay: 0, duration: 500, leftTrigger: 1, rightTrigger: 1, strongMagnitude: 0, weakMagnitude: 0 }, 'self-test triggers');
}
export function supports(a) {
  if (!a) return { dual: false, trigger: false };
  const list = 'effects' in a && a.effects ? Array.from(a.effects) : null;
  return { dual: list ? list.includes('dual-rumble') : a.type === 'dual-rumble' ? true : null, trigger: list ? list.includes('trigger-rumble') : null };
}
export function describe(d) {
  if (d === null || d === undefined) return '-';
  const lost = d.lost ? ' · lost' : '';
  if (d.kind === 'pad') return `pad ${d.index} "${d.id}" mapping "${d.mapping}"${lost}`;
  if (d.kind === 'keys') return `keys ${d.scheme}`;
  if (d.kind === 'touch') return 'touch';
  return `${d.kind} ${d.key} "${d.id}"${lost}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/bench-stats.test.mjs test/purity.test.mjs test/purity-phase3.test.mjs`
Expected: PASS: 8 new tests; the purity suites unchanged (`src/view/bench/` is view code).

- [ ] **Step 5: Commit**

```bash
git add src/view/bench/padStats.js test/bench-stats.test.mjs
git commit -m "feat(view): pad bench stats, live taps, patterns and self-test (D-7)"
```

---

### Task 6: The `?debug=pads` overlay, lazy-loaded by boot

**Files:**
- Create: `src/view/bench/pads.js`
- Modify: `src/core/flags.js`
- Modify: `src/view/boot.js`
- Test: `test/bench.test.mjs`
- Test: `test/flags.test.mjs`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: Task 5's `padStats.js`; the facade `{ localPlayers, unpaired(), gamepad(dev), onSeat(fn) }`; the haptics device's `on(fn)` (Task 2), or `null` with `autoStop: false`.
- Produces:
  - `parseFlags(search).debugs`: a frozen array of the comma-separated topics of an on `?debug` (`?debug=pads,net` → `['pads', 'net']`), `[]` when `?debug` is off or bare.
  - `openPadBench(view, { doc, haptics = null, now = () => performance.now(), timer = globalThis, env = {} })` → `{ el, update(), dispose() }`. `el` is `<section data-lh-bench="pads">` in `doc.body`. Its parts carry `data-bench="<name>"` (`seats`, `tabs`, `info`, `buttons`, `axes`, `sticks`, `support`, `log`, `hlog`, `self-test`, `stop`, `fold`, `trace-clear`, sliders and checkboxes by id). Haptics buttons carry `data-hap` (`dual`, `dual-strong`, `dual-weak`, `trig-both`, `trig-l`, `trig-r`).
  - Seat line: `P<player or ?> · seat <n>[ · pending][ · leaving][ · a device is lost] · profile "<profile>" · contexts [<names>]`, then one `describe(device)` per device. An `unpaired` group follows when any device is unpaired.
  - Boot: with `'pads'` in `flags.debugs`, one slot device last in the driver's list and `import('./bench/pads.js')`. Without it, nothing.

- [ ] **Step 1: Write the failing tests**

Append to `test/flags.test.mjs`, and in its first test replace `extra: {} });` with `extra: {}, debugs: [] });`:

```js
test('D-7: ?debug=<topics> lists its topics in debugs; a bare or off ?debug has none', () => {
  const f = parseFlags('?debug=pads');
  assert.equal(f.debug, true); assert.deepEqual(f.debugs, ['pads']); assert.ok(Object.isFrozen(f.debugs));
  assert.deepEqual(parseFlags('?debug').debugs, []);
  assert.deepEqual(parseFlags('?debug=pads, net').debugs, ['pads', 'net']);
  assert.deepEqual(parseFlags('?debug=0').debugs, []); assert.equal(parseFlags('?debug=0').debug, false);
});
```

Then the overlay tests:

```js
// test/bench.test.mjs
// [D-7]: the ?debug=pads bench overlay, and boot's lazy loading (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { openPadBench } from '../src/view/bench/pads.js';
import { dom } from './helpers/dom.mjs';
import { game, pad, setup, actuator, WHEEL, XBOX } from './helpers/seats.mjs';

const facade = seats => ({ get localPlayers() { return seats.list; }, unpaired: () => seats.unpaired(), gamepad: d => seats.gamepad(d), onSeat: fn => seats.on(fn) });
const fakeTimer = () => {
  const t = { pending: new Map(), n: 0, setTimeout(fn, ms) { t.pending.set(++t.n, [fn, ms]); return t.n; }, clearTimeout(id) { t.pending.delete(id); },
    run() { const all = [...t.pending.values()]; t.pending.clear(); for (const [fn] of all) fn(); } };
  return t;
};
const flush = () => new Promise(r => setTimeout(r, 0));
const DRIVE = { pads: [{ match: () => true, bindings: { buttons: { 7: ['gas', 1] } } }] };
const rig = () => {
  const t = setup(), timer = fakeTimer(); let now = 1000;
  const bench = openPadBench(facade(t.seats), { doc: t.document, timer, now: () => now, env: { userAgent: 'UA' } });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += 16; t.frame(); bench.update(); } };
  const el = sel => t.document.querySelector(`[data-lh-bench] ${sel}`);
  const text = id => el(`[data-bench="${id}"]`).textContent;
  return { ...t, bench, timer, tick, el, text, advance: ms => { now += ms; } };
};

test('the bench lists each seat: player number, profile, devices with id, mapping and lost, and active contexts (D-7)', () => {
  const { e, seats, slots, tick, text } = rig();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); tick();
  assert.match(text('seats'), /P\? · seat 1 · pending · profile "Player 2"/);
  e.stepN(1); tick();
  const s = text('seats');
  assert.match(s, /P1 · seat 0 · profile "Player 1" · contexts \[drive\]/);
  assert.match(s, /keys all/); assert.match(s, /touch/);
  assert.ok(s.includes(`pad 0 "${XBOX}" mapping "standard"`));
  assert.match(s, /P2 · seat 1 · profile "Player 2" · contexts \[drive\]/);
  assert.ok(s.includes(`pad 1 "${WHEEL}" mapping ""`));
  slots[1] = null; tick();
  assert.match(text('seats'), /P2 · seat 1 · a device is lost/);
  assert.ok(text('seats').includes(`pad 1 "${WHEEL}" mapping "" · lost`));
  assert.match(text('log'), /seat\.lost · seat 1 · pad 1/);
});

test("the selected pad's buttons and axes show live values, peaks and press counts; the update rate counts the last second (D-7)", () => {
  const { slots, tick, el, text, advance } = rig();
  const at = (ts, extra) => ({ ...pad(0, extra), timestamp: ts });
  slots[0] = at(1); tick();
  slots[0] = at(2, { down: [7] }); tick(); slots[0] = at(3); tick(); slots[0] = at(4, { down: [7] }); tick();
  slots[0] = at(5, { axes: [0.5, -0.25, 0, 0] }); tick();
  const row = el('[data-bench="buttons"]').children[7].children;
  assert.deepEqual([row[1].textContent, row[2].textContent, row[4].textContent, row[5].textContent], ['RT / R2', 'up', '1.000', '2']);
  const ax = el('[data-bench="axes"]').children[1].children;
  assert.deepEqual([ax[1].textContent, ax[2].textContent, ax[3].textContent, ax[4].textContent], ['left stick Y', '-0.2500', '-0.250', '0.000']);
  assert.match(text('sticks'), /left stick {2}x 0\.500 {2}y -0\.250 {2}r 0\.559/);
  assert.match(text('info'), /update rate\s*5 \/s/);
  assert.match(text('log'), /pad 0 · RT \/ R2 \[7\] down/);
  advance(2000); slots[0] = at(5); tick();
  assert.match(text('info'), /update rate\s*0 \/s/);
});

test("haptics buttons play on the selected pad's actuator and log the answer; the self-test reports a playEffect that never settles (D-7)", async () => {
  const { slots, tick, el, text, timer } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  el('[data-hap="dual"]').click(); await flush();
  assert.deepEqual(a.calls, [['play', 'dual-rumble', { startDelay: 0, duration: 400, strongMagnitude: 1, weakMagnitude: 0.5 }]]);
  assert.match(text('hlog'), /Body: complete/);
  el('[data-hap="trig-r"]').click(); await flush();
  assert.deepEqual(a.calls[1], ['play', 'trigger-rumble', { startDelay: 0, duration: 300, leftTrigger: 0, rightTrigger: 0.8, strongMagnitude: 0, weakMagnitude: 0 }]);
  assert.match(text('support'), /trigger-rumble\s*yes/);
  a.playEffect = (type, params) => { a.calls.push(['play', type, { ...params }]); return new Promise(() => {}); }; // a browser that never answers
  el('[data-bench="self-test"]').click(); await flush();
  assert.match(text('hlog'), /effects: \["dual-rumble","trigger-rumble"\]/);
  timer.run(); await flush();
  assert.match(text('hlog'), /self-test body: no answer after 2000 ms \(promise still pending\)/);
});

test('live trigger taps follow the pull: taps last at least 50 ms and are full strength past 95% (D-7)', () => {
  const { slots, tick, el, advance } = rig(), a = actuator();
  const pull = (lt, rt) => { const p = pad(0, { act: a }); p.buttons[6] = { pressed: lt > 0.5, value: lt }; p.buttons[7] = { pressed: rt > 0.5, value: rt }; return p; };
  slots[0] = pull(0, 0); tick();
  el('[data-bench="live-tap-len"]').value = '20'; // under the floor: taps stay 50 ms
  el('[data-bench="live-trig"]').checked = true;
  slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls[0][1], 'trigger-rumble');
  const p = a.calls[0][2];
  assert.equal(p.duration, 50); assert.equal(p.leftTrigger, 1, 'past 95%: full strength');
  assert.ok(Math.abs(p.rightTrigger - 0.3 ** 0.6) < 1e-9, 'the response curve');
  advance(50); slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls.length, 1, 'the next tap waits for the interval');
  advance(130); slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls.length, 2);
  slots[0] = pull(0, 0); tick();
  assert.deepEqual(a.calls[2], ['reset'], 'let go: one reset');
  tick(); assert.equal(a.calls.length, 3);
});

test('the bench never changes seats or bindings, whatever is clicked (D-7, review focus)', async () => {
  const { e, seats, slots, tick, el, document, timer } = rig();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { act: actuator(), down: [0] }); slots[1] = pad(1, { act: actuator(), down: [0] }); tick(); e.stepN(1); tick();
  const shape = () => JSON.stringify(seats.list.map(lp => [lp.seat, lp.pending, lp.devices.map(d => [d.kind, d.index ?? null, d.lost ?? false]), lp.contexts.list, lp.bindings.profile]));
  const before = shape(), cmds = e.commands.pending, touched = [];
  for (const lp of seats.list) {
    for (const k of ['claim', 'release', 'leave']) lp[k] = () => touched.push(`lp.${k}`);
    for (const k of ['add', 'remove']) lp.contexts[k] = () => touched.push(`contexts.${k}`);
    for (const k of ['map', 'reset', 'capture', 'cancel']) lp.bindings[k] = () => touched.push(`bindings.${k}`);
    const profile = lp.bindings.profile;
    Object.defineProperty(lp.bindings, 'profile', { configurable: true, get: () => profile, set: () => touched.push('bindings.profile') });
  }
  for (const id of ['live-trig', 'live-body', 'live-stick']) el(`[data-bench="${id}"]`).checked = true;
  for (const b of document.querySelectorAll('[data-lh-bench] button')) b.click();
  tick(5); timer.run(); await flush(); tick(5);
  assert.deepEqual(touched, []);
  assert.equal(shape(), before);
  assert.equal(e.commands.pending, cmds, 'no lh.seat command');
});

test('?debug=pads loads the bench through boot; without it boot adds no device, no element and imports no bench code (D-7, review focus)', async () => {
  const run = query => {
    const { window, document } = dom(), slots = [];
    const app = boot(game, defineView({ scenes: {} }), { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags(query), getGamepads: () => slots, storage: null });
    const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); };
    return { app, slots, frame, document };
  };
  const off = run('?lh-test'), on = run('?lh-test&debug=pads');
  try {
    for (let i = 0; i < 50 && !on.document.querySelector('[data-lh-bench]'); i++) await flush();
    assert.ok(on.document.querySelector('[data-lh-bench]') !== null, 'the bench opened');
    on.slots[0] = pad(0); on.frame();
    assert.ok(on.document.querySelector('[data-lh-bench] [data-bench="seats"]').textContent.includes(`pad 0 "${XBOX}"`));
    assert.equal(on.app.driver.devices.length, off.app.driver.devices.length + 1, 'one slot device, only with the flag');
    assert.ok(off.document.querySelector('[data-lh-bench]') === null, 'no bench without the flag');
  } finally { on.app.dispose(); off.app.dispose(); }
  assert.ok(on.document.querySelector('[data-lh-bench]') === null, 'dispose removes it');
  const src = fs.readFileSync(new URL('../src/view/boot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import .*bench/m, 'boot never imports the bench statically');
  assert.match(src, /import\('\.\/bench\/pads\.js'\)/);
  assert.doesNotMatch(fs.readFileSync(new URL('../src/index.view.js', import.meta.url), 'utf8'), /bench/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/flags.test.mjs test/bench.test.mjs`
Expected: FAIL. The flags tests fail on `debugs`. `bench.test.mjs` fails with `Cannot find module '.../src/view/bench/pads.js'`.

- [ ] **Step 3: Add `debugs` to `src/core/flags.js`**

After the `out.lhRender = …` line, add:

```js
  // [D-7] ?debug=<topics>: the comma-separated topics of an on ?debug (?debug=pads opens the pad bench); [] when off or bare
  out.debugs = Object.freeze(out.debug ? (p.get('debug') ?? '').split(',').map(s => s.trim()).filter(Boolean) : []);
```

- [ ] **Step 4: Write the overlay**

```js
// src/view/bench/pads.js
// [D-7] ?debug=pads: the pad bench, the Gamepad Bench artifact as an engine overlay. boot loads it only behind the flag.
// It reads view state only (localPlayers, unpaired(), gamepad(dev), onSeat) and the engine's haptics stops for its log; it
// never changes seats or bindings. Its haptics tests drive the selected pad's vibrationActuator, as a game does.
import { STD_BUTTONS, STD_AXES, SECTORS, PATTERNS, createPadStats, updateStats, rate, stickEdge, liveState, liveEffect, play, selfTest, supports, describe } from './padStats.js';

const CSS = `[data-lh-bench]{position:fixed;top:calc(var(--lh-sa-top,0px) + 8px);right:calc(var(--lh-sa-right,0px) + 8px);z-index:2147483000;width:min(440px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:#0d1117f0;color:#e6edf3;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;pointer-events:auto}
[data-lh-bench] h3{margin:10px 0 4px;font-size:11px;color:#7d8590;text-transform:uppercase;letter-spacing:.05em}
[data-lh-bench] button{font:inherit;color:inherit;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:3px 6px;margin:2px;cursor:pointer}
[data-lh-bench] button[aria-pressed=true]{border-color:#2f81f7}
[data-lh-bench] table{width:100%;border-collapse:collapse}[data-lh-bench] td,[data-lh-bench] th{padding:1px 4px;text-align:left;white-space:nowrap}
[data-lh-bench] tr.on{color:#3fb950}[data-lh-bench] .err{color:#f85149}[data-lh-bench] .ok{color:#3fb950}[data-lh-bench] .sys{color:#7d8590}
[data-lh-bench] fieldset{border:1px solid #30363d;border-radius:4px;margin:6px 0;padding:4px 6px}
[data-lh-bench] label{display:flex;gap:6px;align-items:center}[data-lh-bench] input[type=range]{flex:1}
[data-lh-bench] ol,[data-lh-bench] ul{margin:0;padding-left:12px}[data-lh-bench] ol{list-style:none;padding:0;max-height:160px;overflow:auto}
[data-lh-bench] canvas{width:160px;height:160px;background:#010409;border-radius:4px}
[data-lh-bench] dl{display:grid;grid-template-columns:auto 1fr;gap:0 8px;margin:0}[data-lh-bench] dd{margin:0;overflow-wrap:anywhere}`;
// [id, label, min, max, step, value]: the artifact's controls and defaults
const SLIDERS = [
  ['dr-strong', 'strong', 0, 1, 0.01, 1], ['dr-weak', 'weak', 0, 1, 0.01, 0.5], ['dr-dur', 'duration ms', 10, 5000, 10, 400], ['dr-delay', 'start delay ms', 0, 2000, 10, 0],
  ['tr-left', 'left trigger', 0, 1, 0.01, 0.8], ['tr-right', 'right trigger', 0, 1, 0.01, 0.8], ['tr-strong', 'strong (body)', 0, 1, 0.01, 0], ['tr-weak', 'weak (body)', 0, 1, 0.01, 0], ['tr-dur', 'duration ms', 10, 5000, 10, 300],
  ['live-tap', 'tap interval ms', 80, 400, 10, 130], ['live-tap-len', 'tap length ms', 50, 150, 5, 60], ['live-curve', 'response curve', 0.3, 1.5, 0.05, 0.6],
  ['dz', 'deadzone', 0, 0.3, 0.01, 0.08],
];
const slider = id => { const [, label, min, max, step, value] = SLIDERS.find(s => s[0] === id); return `<label>${label}<input type="range" data-bench="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output data-out="${id}">${value}</output></label>`; };
const check = (id, label) => `<label><input type="checkbox" data-bench="${id}">${label}</label>`;
const hap = (id, label) => `<button type="button" data-hap="${id}">${label}</button>`;
const HTML = `<header><b>Pad bench</b> <span data-bench="fps"></span> <button type="button" data-bench="fold">hide</button></header>
<div data-bench="body">
<h3>Seats</h3><div data-bench="seats"></div>
<h3>Pads</h3><nav data-bench="tabs"></nav><dl data-bench="info"></dl>
<table><thead><tr><th>#</th><th>button</th><th>state</th><th>value</th><th>peak</th><th>presses</th></tr></thead><tbody data-bench="buttons"></tbody></table>
<table><thead><tr><th>#</th><th>axis</th><th>value</th><th>min</th><th>max</th></tr></thead><tbody data-bench="axes"></tbody></table>
<h3>Sticks</h3><div><canvas data-bench="stick0" width="160" height="160"></canvas> <canvas data-bench="stick1" width="160" height="160"></canvas></div><pre data-bench="sticks"></pre>
${slider('dz')}<button type="button" data-bench="trace-clear">clear traces</button>
<h3>Haptics</h3><dl data-bench="support"></dl>
<fieldset><legend>Body: dual-rumble</legend>${slider('dr-strong')}${slider('dr-weak')}${slider('dr-dur')}${slider('dr-delay')}${hap('dual', 'Play')}${hap('dual-strong', 'Strong motor')}${hap('dual-weak', 'Weak motor')}</fieldset>
<fieldset><legend>Triggers: trigger-rumble</legend>${slider('tr-left')}${slider('tr-right')}${slider('tr-strong')}${slider('tr-weak')}${slider('tr-dur')}${hap('trig-both', 'Both')}${hap('trig-l', 'Left')}${hap('trig-r', 'Right')}</fieldset>
<fieldset><legend>Patterns</legend><div data-bench="patterns"></div></fieldset>
<fieldset><legend>Live</legend>${check('live-trig', 'trigger pull taps that trigger')}${check('live-body', 'trigger pull drives the body (LT strong, RT weak)')}${check('live-stick', 'left stick drives the body')}${slider('live-tap')}${slider('live-tap-len')}${slider('live-curve')}</fieldset>
<button type="button" data-bench="self-test">Self-test</button><button type="button" data-bench="stop">Stop all</button>
<h3>Haptics log</h3><ol data-bench="hlog"></ol>
<h3>Log</h3><ol data-bench="log"></ol>
</div>`;
const btnName = (p, i) => (p.mapping === 'standard' && STD_BUTTONS[i]) || `button ${i}`;
const axName = (p, i) => (p.mapping === 'standard' && STD_AXES[i]) || `axis ${i}`;
const signed = v => (v >= 0 ? '+' : '') + v.toFixed(4);

function drawStick(cv, x, y, s, k, dz) {
  let ctx = null; try { ctx = cv.getContext?.('2d') ?? null; } catch { ctx = null; } // happy-dom and some test pages: no 2D context
  if (!ctx) return;
  const w = cv.width, c = w / 2, R = w * 0.42;
  ctx.clearRect(0, 0, w, w);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
  ctx.strokeStyle = '#d29922'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c, c, R * dz, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#f85149'; ctx.lineWidth = 2; ctx.beginPath();
  let started = false;
  for (let i = 0; i <= SECTORS; i++) {
    const m = s.bins[k][i % SECTORS]; if (!m) { started = false; continue; }
    const ang = ((i % SECTORS) + 0.5) / SECTORS * 2 * Math.PI - Math.PI, px = c + Math.cos(ang) * m * R, py = c + Math.sin(ang) * m * R;
    if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
  }
  ctx.stroke();
  ctx.fillStyle = '#2f81f7'; ctx.globalAlpha = 0.35;
  for (const [tx, ty] of s.trace[k]) ctx.fillRect(c + tx * R - 1, c + ty * R - 1, 2, 2);
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(c + x * R, c + y * R, 5, 0, 2 * Math.PI); ctx.fill();
}

export function openPadBench(view, { doc = globalThis.document, haptics = null, now = () => globalThis.performance.now(), timer = globalThis, env = {} } = {}) {
  const style = doc.createElement('style'); style.setAttribute('data-lh-bench-style', ''); style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
  const root = doc.createElement('section'); root.setAttribute('data-lh-bench', 'pads'); root.innerHTML = HTML; // static markup: every live value goes in through textContent
  doc.body.appendChild(root);
  const q = id => root.querySelector(`[data-bench="${id}"]`);
  const num = id => +q(id).value, on = id => q(id).checked === true;
  const T0 = now(), stamp = () => ((now() - T0) / 1000).toFixed(3).padStart(8, ' ');
  const logTo = (list, max) => (text, cls = '') => {
    const li = doc.createElement('li'); if (cls) li.className = cls; li.textContent = `${stamp()}  ${text}`;
    list.prepend(li); while (list.childElementCount > max) list.lastElementChild.remove();
  };
  const log = logTo(q('log'), 300), hlog = logTo(q('hlog'), 60);
  const stats = new Map(), frames = [];
  let sel = null, current = null, seatsSig = '', tabsSig = '', infoSig = '', btnSig = '', axSig = '', supSig = '', btnRows = [], axRows = [], seq = [], lst = liveState();

  for (const inp of root.querySelectorAll('input[type="range"]')) {
    const out = root.querySelector(`[data-out="${inp.getAttribute('data-bench')}"]`);
    inp.addEventListener('input', () => { out.textContent = inp.value; });
  }
  const offSeat = view.onSeat(e => log(`${e.type} · seat ${e.seat ?? '-'} · ${describe(e.device)}${e.op ? ` · ${e.op}` : ''}`, e.type === 'seat.lost' ? 'err' : 'sys'));
  const offStop = haptics?.on(e => hlog(`engine stop (${e.reason}): zero dual-rumble + reset for ${e.frames} frames`, 'sys')) ?? null;

  // haptics on the selected pad
  const act = () => current?.vibrationActuator ?? null;
  const hplay = (type, params, label, quiet = false) => play(act(), type, params, { log: hlog, label, quiet, timer });
  const reset = label => {
    const a = act(); if (typeof a?.reset !== 'function') return;
    try { Promise.resolve(a.reset()).then(r => hlog(`${label}: ${r}`, 'ok'), e => hlog(`${label}: ${e?.name}: ${e?.message}`, 'err')); }
    catch (e) { hlog(`${label}: ${e?.name}: ${e?.message}`, 'err'); }
  };
  const dual = (s, w) => ({ startDelay: num('dr-delay'), duration: num('dr-dur'), strongMagnitude: s, weakMagnitude: w });
  const trig = (l, r) => ({ startDelay: 0, duration: num('tr-dur'), leftTrigger: l, rightTrigger: r, strongMagnitude: num('tr-strong'), weakMagnitude: num('tr-weak') });
  const HAP = {
    dual: () => hplay('dual-rumble', dual(num('dr-strong'), num('dr-weak')), 'Body'),
    'dual-strong': () => hplay('dual-rumble', dual(num('dr-strong') || 1, 0), 'Strong motor'),
    'dual-weak': () => hplay('dual-rumble', dual(0, num('dr-weak') || 1), 'Weak motor'),
    'trig-both': () => hplay('trigger-rumble', trig(num('tr-left'), num('tr-right')), 'Triggers'),
    'trig-l': () => hplay('trigger-rumble', trig(num('tr-left'), 0), 'Left trigger'),
    'trig-r': () => hplay('trigger-rumble', trig(0, num('tr-right')), 'Right trigger'),
  };
  for (const b of root.querySelectorAll('[data-hap]')) b.addEventListener('click', () => { HAP[b.getAttribute('data-hap')](); });
  const stopSeq = () => { for (const t of seq) timer.clearTimeout(t); seq = []; };
  const runPattern = p => {
    stopSeq();
    if (!act()) { hlog(`${p.name}: this pad has no vibrationActuator`, 'err'); return; }
    if (p.trig && supports(act()).trigger === false) hlog(`${p.name}: the pad does not list trigger-rumble; expect an error`, 'err');
    hlog(`${p.name}: ${p.steps.length} effect(s)`);
    p.steps.forEach(([at, type, params], i) => { seq.push(timer.setTimeout(() => { hplay(type, params, p.name, i < p.steps.length - 1); }, at)); });
  };
  for (const p of PATTERNS) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = `${p.name}${p.trig ? ' (triggers)' : ''}`; b.title = p.sub;
    b.addEventListener('click', () => runPattern(p)); q('patterns').appendChild(b);
  }
  q('self-test').addEventListener('click', () => {
    selfTest(current, { log: hlog, play: (type, params, label) => hplay(type, params, label),
      env: { userAgent: globalThis.navigator?.userAgent, focused: doc.hasFocus?.(), visibility: doc.visibilityState, secure: globalThis.isSecureContext, ...env } });
  });
  q('stop').addEventListener('click', () => {
    stopSeq(); for (const id of ['live-trig', 'live-body', 'live-stick']) q(id).checked = false;
    lst = liveState(); reset('Stop all');
  });
  q('trace-clear').addEventListener('click', () => { for (const s of stats.values()) { s.trace = [[], []]; s.bins = [new Float32Array(SECTORS), new Float32Array(SECTORS)]; } });
  q('fold').addEventListener('click', () => { const b = q('body'); b.hidden = !b.hidden; q('fold').textContent = b.hidden ? 'show' : 'hide'; });
  const live = t => {
    const tg = on('live-trig'), body = on('live-body'), stick = on('live-stick');
    if (!(tg || body || stick) || !act()) { if (lst.active) { lst = liveState(); reset('live off'); } return; }
    const b = current.buttons ?? [], a = current.axes ?? [];
    const e = liveEffect(lst, { L: b[6]?.value ?? 0, R: b[7]?.value ?? 0, stick: Math.min(1, Math.hypot(a[0] ?? 0, a[1] ?? 0)) }, t,
      { trig: tg, body, stickBody: stick, interval: num('live-tap'), length: num('live-tap-len'), curve: num('live-curve') });
    if (e === 'idle') reset('live idle'); else if (e !== null) hplay(e.type, e.params, 'live', true);
  };

  // rendering: each part is rebuilt only when what it shows changes
  const dl = (box, rows) => {
    box.replaceChildren();
    for (const [k, v] of rows) { const dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = k; dd.textContent = v; box.append(dt, dd); }
  };
  const padDevices = () => {
    const out = [];
    for (const lp of view.localPlayers) for (const d of lp.devices) if (d.kind === 'pad') out.push(d);
    for (const d of view.unpaired()) if (d.kind === 'pad') out.push(d);
    return out;
  };
  const renderSeats = () => {
    const groups = [];
    for (const lp of view.localPlayers) {
      groups.push([`P${lp.controller?.player ?? '?'} · seat ${lp.seat}${lp.pending ? ' · pending' : ''}${lp.leaving ? ' · leaving' : ''}${lp.lost ? ' · a device is lost' : ''} · profile "${lp.bindings.profile}" · contexts [${lp.contexts.list.join(', ')}]`, lp.devices.map(describe)]);
    }
    const free = view.unpaired(); if (free.length) groups.push(['unpaired', free.map(describe)]);
    const sig = JSON.stringify(groups); if (sig === seatsSig) return; seatsSig = sig;
    const box = q('seats'); box.replaceChildren();
    for (const [head, devs] of groups) {
      const div = doc.createElement('div'), b = doc.createElement('b'), ul = doc.createElement('ul');
      b.textContent = head; div.appendChild(b);
      for (const d of devs) { const li = doc.createElement('li'); li.textContent = d; ul.appendChild(li); }
      div.appendChild(ul); box.appendChild(div);
    }
  };
  const renderTabs = devs => {
    const sig = devs.map(d => `${d.index}|${d.id}|${d.lost}`).join(',') + '#' + devs.indexOf(sel);
    if (sig === tabsSig) return; tabsSig = sig;
    const nav = q('tabs'); nav.replaceChildren();
    for (const d of devs) {
      const b = doc.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(d === sel));
      b.textContent = `pad ${d.index}${d.lost ? ' (lost)' : ''}`; b.title = d.id;
      b.addEventListener('click', () => { sel = d; tabsSig = ''; }); nav.appendChild(b);
    }
  };
  const rows = (body, n, cols, label) => Array.from({ length: n }, (_, i) => {
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c++) tr.appendChild(doc.createElement('td'));
    tr.children[0].textContent = String(i); tr.children[1].textContent = label(i); body.appendChild(tr);
    return tr;
  });
  const renderPad = (p, s) => {
    if (!p || !s) {
      if (infoSig !== 'none') { infoSig = 'none'; dl(q('info'), [['pad', sel?.lost ? 'lost' : 'none yet: press a button on a controller']]); q('buttons').replaceChildren(); q('axes').replaceChildren(); btnSig = axSig = ''; }
      return;
    }
    const a = p.vibrationActuator ?? null, bs = p.buttons ?? [], as = p.axes ?? [];
    const info = [['id', p.id], ['index', String(p.index)], ['mapping', `"${p.mapping ?? ''}"${p.mapping === 'standard' ? ' (standard)' : ' (raw channels)'}`],
      ['axes / buttons', `${as.length} / ${bs.length}`], ['update rate', `${rate(s)} /s`],
      ['effects', a ? ('effects' in a ? `[${Array.from(a.effects ?? []).join(', ')}]` : 'not listed') : 'no vibrationActuator']];
    const sig = JSON.stringify(info); if (sig !== infoSig) { infoSig = sig; dl(q('info'), info); }
    const bk = `${p.index}|${p.id}|${bs.length}|${p.mapping}`;
    if (bk !== btnSig) { btnSig = bk; q('buttons').replaceChildren(); btnRows = rows(q('buttons'), bs.length, 6, i => btnName(p, i)); }
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], c = btnRows[i].children, d = b?.pressed === true;
      btnRows[i].className = d ? 'on' : '';
      c[2].textContent = d ? 'pressed' : b?.touched ? 'touched' : 'up'; c[3].textContent = (b?.value ?? 0).toFixed(3);
      c[4].textContent = (s.peak[i] ?? 0).toFixed(3); c[5].textContent = String(s.presses[i] ?? 0);
    }
    const ak = `${p.index}|${p.id}|${as.length}|${p.mapping}`;
    if (ak !== axSig) { axSig = ak; q('axes').replaceChildren(); axRows = rows(q('axes'), as.length, 5, i => axName(p, i)); }
    for (let i = 0; i < as.length; i++) {
      const c = axRows[i].children;
      c[2].textContent = signed(as[i] ?? 0); c[3].textContent = (s.min[i] ?? 0).toFixed(3); c[4].textContent = (s.max[i] ?? 0).toFixed(3);
    }
    const dz = num('dz'), out = [];
    for (let k = 0; k < 2; k++) {
      const x = as[k * 2], y = as[k * 2 + 1], label = k === 0 ? 'left stick' : 'right stick';
      if (x === undefined || y === undefined) { out.push(`${label}: axes ${k * 2}/${k * 2 + 1} not reported`); continue; }
      const m = Math.hypot(x, y), e = stickEdge(s, k);
      out.push(`${label}  x ${x.toFixed(3)}  y ${y.toFixed(3)}  r ${m.toFixed(3)}${m < dz ? ' (in deadzone)' : ''}\n  rest drift r ${s.rest[k].toFixed(3)} · ${e ? `edge ${e.avg.toFixed(2)} avg, ${e.lo.toFixed(2)}-${e.hi.toFixed(2)}, ${e.filled}/${SECTORS} sectors` : 'roll the stick round its edge'}`);
      drawStick(q(`stick${k}`), x, y, s, k, dz);
    }
    q('sticks').textContent = out.join('\n');
    const sup = supports(a), yn = v => (v === true ? 'yes' : v === false ? 'no' : 'not listed: try it');
    const support = [['vibrationActuator', a ? 'yes' : 'no'], ['dual-rumble', yn(sup.dual)], ['trigger-rumble', yn(sup.trigger)]];
    const ss = JSON.stringify(support); if (ss !== supSig) { supSig = ss; dl(q('support'), support); }
  };

  return {
    el: root,
    update() {
      const t = now();
      frames.push(t); while (frames.length && t - frames[0] > 1000) frames.shift();
      q('fps').textContent = `${frames.length} fps`;
      const devs = padDevices();
      for (const d of devs) {
        const gp = view.gamepad(d); if (!gp) continue;
        let s = stats.get(d); if (s === undefined || s.id !== gp.id) stats.set(d, s = createPadStats(gp, t));
        updateStats(s, gp, t, (i, down, v) => log(`pad ${gp.index} · ${btnName(gp, i)} [${i}] ${down ? `down · ${v.toFixed(3)}` : 'up'}`));
      }
      if (!devs.includes(sel)) sel = devs.find(d => !d.lost) ?? devs[0] ?? null;
      renderSeats(); renderTabs(devs);
      current = sel === null ? null : view.gamepad(sel);
      renderPad(current, current ? stats.get(sel) : null);
      live(t);
    },
    dispose() { offSeat(); offStop?.(); stopSeq(); root.remove(); style.remove(); },
  };
}
```

- [ ] **Step 5: Load it from `src/view/boot.js`**

1. After the haptics line from Task 3 (`const haptics = halves.haptics?.autoStop === false ? null : createHaptics(…);`) add:

```js
  // [D-7] ?debug=pads: the pad bench. Only behind the flag: a slot device and a dynamic import (inlined by the build, never
  // evaluated without the flag), so a page without it pays nothing. The bench gets a read-only view of the seats.
  const benchOn = flags.debugs?.includes('pads') === true;
  let bench = null;
  const benchSlot = benchOn ? { update() { bench?.update(); }, dispose() { bench?.dispose(); bench = null; } } : null;
```

2. In the `createDriver(...)` call, replace `...(view.nav ? [view.nav] : [])]` with `...(view.nav ? [view.nav] : []), ...(benchSlot ? [benchSlot] : [])]`.

3. Immediately before the final `driver.start();` add:

```js
  if (benchOn) {
    import('./bench/pads.js').then(m => {
      if (disposed) return;
      bench = m.openPadBench({ get localPlayers() { return seats.list; }, unpaired: () => seats.unpaired(), gamepad: d => seats.gamepad(d), onSeat: fn => seats.on(fn) }, { doc, haptics });
    }).catch(report);
  }
```

- [ ] **Step 6: Run the tests**

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test test/flags.test.mjs test/bench.test.mjs test/bench-stats.test.mjs test/boot.test.mjs test/boot-args.test.mjs test/haptics-boot.test.mjs test/seats-boot.test.mjs test/view-alloc.test.mjs test/purity.test.mjs test/purity-phase3.test.mjs`
Expected: PASS: 1 new flags test (and the edited defaults test) and 6 new bench tests. The boot, purity and allocation suites are unchanged. If happy-dom lacks a DOM method the overlay uses (`prepend`, `replaceChildren`), replace it in `pads.js` with `insertBefore` / a `while (firstChild) remove` loop. Do not stub happy-dom.

- [ ] **Step 7: Mark [D-7] built and document `?debug=<topics>` in `docs/spec.md`**

1. In [D-1], replace the text

```markdown
Recognised flags: `?debug`, `?tune`,
```

with

```markdown
Recognised flags: `?debug` (`?debug=<topics>`, comma-separated, lists its topics in `flags.debugs`; `?debug=pads` opens the pad bench, [D-7]), `?tune`,
```
2. Replace `- **[D-7] Pad bench (draft 2026-10-21).**` with `- **[D-7] Pad bench.** (built, plan 4)`.
3. At the end of the [D-7] bullet, append:

```markdown
 Rulings (plan 4): with `'pads'` in `flags.debugs`, boot adds one driver device after the game's and loads `src/view/bench/pads.js` with a dynamic `import()` (bundled inline, evaluated only behind the flag); without it nothing is added. The bench gets a read-only view (`localPlayers`, `unpaired()`, `gamepad(dev)`, `onSeat`) and the engine's haptics stops for its log; it never calls a seat's `claim`, `release`, `leave`, `contexts` or `bindings` methods, and issues no command. Seat lines read `P<player> · seat <n> · profile "<name>" · contexts [<names>]`, with `pending`, `leaving` and `a device is lost` when they apply. Presses count down edges; peaks and axis min/max (from 0) are for the page's life; the update rate counts `timestamp` changes in the last second; rest drift is the stick's radius after 30 polls without a move over 0.01, while under 0.3; the stick outline keeps the furthest reach over 0.3 in each of 36 sectors. Live trigger taps last at least 50 ms, come every max(interval, length + 20) ms, scale by `v^curve` and are full strength past 95% pull; body coupling refreshes a 120 ms `dual-rumble` every 50 ms. The watchdog reports a `playEffect` unanswered after duration + delay + 1500 ms.
```

- [ ] **Step 8: Commit**

```bash
git add src/view/bench/pads.js src/core/flags.js src/view/boot.js test/bench.test.mjs test/flags.test.mjs docs/spec.md
git commit -m "feat(view): ?debug=pads pad bench overlay, lazy-loaded by boot (D-7)"
```

---

### Task 7: Real-browser checks and the spec's built list

**Files:**
- Create: `test/fixtures/rumble.js`
- Create: `test/fixtures/rumble.view.js`
- Create: `test/fixtures/rumble.html`
- Test: `test/haptics-e2e.test.mjs`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: Tasks 2–6 through a real page: `boot`, the haptics device, the fake pads' `game.pad` / `game.unplug` / `game.haptics`, `window.engine.overlay`, `?debug=pads`.
- Produces: the fixture game `rumble` (`field`, plus `pause` with `pauses: true`). Its view entry sets `window.lhView` (the boot's `view`), so the test can play an effect on `lp.pad` as a game does.

- [ ] **Step 1: Write the fixture**

```js
// test/fixtures/rumble.js
// A game with a pausing overlay for the real-browser haptics and pad bench checks (plan 2026-10-21-local-players-4).
import { defineGame } from '../../src/index.sim.js';

export default defineGame({ id: 'rumble', start: 'field', scenes: { field: {}, pause: { pauses: true } } });
```

```js
// test/fixtures/rumble.view.js
// Browser entry for the rumble fixture: no view halves; window.lhView lets the test play an effect on lp.pad as a game does.
import { boot, defineView } from '../../src/index.view.js';
import rumble from './rumble.js';

window.lhView = boot(rumble, defineView({ scenes: {} })).view;
```

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rumble</title>
<style>html, body { margin: 0; height: 100%; background: #123; color: #fff; font: 16px sans-serif; }</style>
</head>
<body>
<script src="rumble.bundle.js"></script>
</body>
</html>
```

(The last block is `test/fixtures/rumble.html`.)

- [ ] **Step 2: Write the browser test**

```js
// test/haptics-e2e.test.mjs
// Real-Chromium run of the haptics lifecycle and the ?debug=pads bench on the fake pads (C-14, D-7, T-24).
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
const WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';
const ZERO = { op: 'playEffect', type: 'dual-rumble', params: { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 } };
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/rumble.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'rumble.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/fixtures/rumble.html'), 'text/html'], '/rumble.bundle.js': [path.join(out, 'rumble.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('a pausing overlay stops a rumbling fake pad: a first-sight reset, then 20 zero dual-rumble effects each followed by a reset (C-14, T-24)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.frames(3);
    assert.deepEqual((await game.haptics(0)).calls, [{ op: 'reset' }], 'seen for the first time');
    await game.page.evaluate(() => window.lhView.localPlayers[0].pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 5000, strongMagnitude: 1, weakMagnitude: 1 }));
    await game.page.evaluate(() => window.engine.overlay('pause'));
    await game.frames(30);
    const calls = (await game.haptics(0)).calls.slice(2);
    assert.deepEqual(calls, Array.from({ length: 20 }, () => [ZERO, { op: 'reset' }]).flat());
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('game.unplug fires gamepaddisconnected and the seat marks the pad lost (T-24, C-9)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.pad(1, { id: 'Pad B' }); await game.frames(3);
    await game.unplug(1); await game.frames(3);
    const seat = await game.page.evaluate(() => { const lp = window.lhView.localPlayers[0]; return { lost: lp.lost, pads: lp.devices.filter(d => d.kind === 'pad').map(d => [d.index, d.lost]) }; });
    assert.deepEqual(seat, { lost: true, pads: [[0, false], [1, true]] });
  } finally { await game.close(); }
});

test('?debug=pads opens the bench on a real page: seats, pads, and a body effect on the selected pad (D-7)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { query: { debug: 'pads' } });
  try {
    await game.pad(0, {}); await game.pad(1, { id: WHEEL, mapping: '' }); await game.frames(3);
    const seats = game.page.locator('[data-lh-bench] [data-bench="seats"]');
    await seats.waitFor();
    const text = await seats.textContent();
    assert.ok(text.includes('P1 · seat 0') && text.includes('mapping "standard"') && text.includes(`pad 1 "${WHEEL}" mapping ""`), text);
    await game.page.locator('[data-lh-bench] [data-hap="dual"]').click(); await game.frames(2);
    assert.deepEqual((await game.haptics(0)).calls.at(-1), { op: 'playEffect', type: 'dual-rumble', params: { startDelay: 0, duration: 400, strongMagnitude: 1, weakMagnitude: 0.5 } });
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```

- [ ] **Step 3: Run the browser test (alone)**

Run: `systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=1536 --test test/haptics-e2e.test.mjs`
Expected: PASS: 3 tests. If the first test sees more than 20 rounds, a `blur` reached the page. Log `window.engine.events` and the `haptics.stop` reasons before changing the count. If the third test finds no `[data-lh-bench]`, check that esbuild inlined `import('./bench/pads.js')` into `rumble.bundle.js` (`grep openPadBench test-results/rumble.bundle.js`).

- [ ] **Step 4: Record plan 4 in the spec's built list**

Read `docs/spec.md` line 7, the amendment line. Plans 1–3 may have edited it. Add `(plan 4): [C-14], [D-7], [T-24]` to its "Built in 0.13" list, after the last plan named there, keeping the line's existing style.

- [ ] **Step 5: Run everything under the memory rule**

Unit suites (everything that is not a browser suite), concurrency 4:

Run: `systemd-run --user --scope -q -p MemoryMax=2G node --max-old-space-size=1536 --test --test-concurrency=4 $(find test -name '*.test.mjs' ! -name '*e2e*' | sort)`
Expected: PASS with the count from before this plan plus 37 (Task 1: 3, Task 2: 7, Task 3: 4, Task 4: 1, Task 5: 8, Task 6: 7, Task 7: 0). Record the before count first with the same command on the base commit (`git stash` is not needed: run it before Task 1).

Browser suites, ONE FILE AT A TIME, never concurrently:

Run: `for f in $(find test -name '*e2e*.test.mjs' | sort); do echo "== $f"; systemd-run --user --scope -q -p MemoryMax=3G node --max-old-space-size=1536 --test "$f" || break; done`
Expected: every file PASSes, including `test/pads-e2e.test.mjs` (3) and `test/haptics-e2e.test.mjs` (3). If Chromium is missing, the suites skip; say which ones were skipped.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/rumble.js test/fixtures/rumble.view.js test/fixtures/rumble.html test/haptics-e2e.test.mjs docs/spec.md
git commit -m "test(view): real-browser haptics lifecycle and pad bench; spec lists plan 4 built (C-14, D-7, T-24)"
```

---

## After this plan

Games that run their own rumble lifecycle (Rally's `rumbleOut.js`) either set `defineView({ haptics: { autoStop: false } })` or drop their `kill()` on hide and pause, leaving the engine's stop. That choice belongs to each game's migration, not to this plan. The bench pattern (a slot device plus an inlined dynamic `import()` behind a `flags.debugs` topic) is how [D-2] `?tune` and [D-3] `?fps` should load when they are built.
