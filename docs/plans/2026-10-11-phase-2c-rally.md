# Phase 2c-rally: Rally on `defineGame`, scenes and `boot`: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Goal:** Rally becomes the pilot game of phase 2 ([§8.4] row 2):
- a headless sim half `src/game.sim.js` (`defineGame`: actions, a `stage` main scene, `title`/`pause`/`results`/`settings` overlays, policies, presets) that never touches three.js or the DOM;
- a browser half `src/game.view.js` (`defineView`: renderer, camera, HUD, menus) plus the devices, started by `boot`;
- a headless flow test (title → stage → countdown → finish → results → retry), the existing suites green with unwidened ranges, and the mobile suite on `lion-hawk/playwright`.

The engine grows only where Rally needs it (E1–E6), each addition tested, before the Rally task that uses it.

**Architecture:**
- **One main scene, `stage`, owns the world** (Sim, Rapier world, track) and survives every menu ([S-3], field note #7). `title`, `pause`, `results` and `settings` are overlays. Only `pause` has `pauses: true`: under `title` the car idles held on the line; under `results` the finished car keeps rolling to a stop.
- **Rally's sub-states stay Rally's:** `ctx.state.phase` is `title | loading | ready | countdown | running | finished`, and Rally keeps emitting its own `state` events (`{ state, from }`). `paused` disappears: pause is the overlay (#23). Restart, new seed and quit are stage methods, not `go()`.
- **`Game` is moved, not wrapped.** Its run logic (ready/countdown/clock/progress/splits/laps/finish/roll-to-stop) moves into `src/game/stage.js` as functions over `ctx.state`; `game/game.js` is deleted once nothing uses it (R8). Why move: wrapping would keep a second event bus next to `engine.emit`, a second pause next to the overlay, a `title`/`loading` flow next to the overlays, and a clock (`Game.t += DT`) next to the engine's; the moved code is the same arithmetic, so the unchanged `test/game.mjs` ranges prove it. `makeProgress`, `MODES`, `bestKey`, `pace.js` are reused untouched.
- **Step order matches today's frame loop:** `input.apply` (`lh.input`, then `rally.input` copies the snapshot into `car.input` in `ready/countdown/running`, zeroes it on menus, leaves it alone in `finished`) → `pre` (`lh.scene`: the stage's run logic, then overlays) → `physics.world` (`rally.physics`: `sim.step()`) → `post` → `events.flush`. That is today's `game.step(); sim.step()` per physics step.
- **Strangler order:** E1–E6 engine; R1 pure prep; R2–R4 the sim half alongside the old code (old `main.js` still ships); R5–R7 a new browser entry `src/entry.js` built only for tests (`RALLY_ENTRY`), sharing `index.template.html` through `data-lh-slot` attributes that the old path ignores; R8 flips the entry and deletes the old code; R9 removes `window.rally`. Rally builds and passes after every task.
- **Async start-up:** the entry awaits `RAPIER.init()` before `boot` (decision for ruling 4: no engine option; one `await` is all Rally needs, field note #6). Track generation and the Rapier build stay synchronous (headless path); the only async piece left, the three.js track view's dynamic import, goes through `view.wait` (E5, #20).

**Tech Stack:** plain JS ES modules, `node:test`, happy-dom (engine view unit tests), `playwright-core` with `lion-hawk/playwright` and the cached Chromium (SwiftShader), esbuild, Rapier `@dimforge/rapier3d-compat` ^0.21, three ^0.186. Rally's own `node test/*.mjs` check scripts stay.

**Spec:** `docs/spec.md` §5 (R-1…R-8, S-1…S-6, I-1…I-6, U-1…U-6), §7 (D-4…D-6, T-1…T-5, T-12, T-16…T-18), §8.2/§8.4. Inputs: `2026-10-11-phase-2a-notes.md` (design inputs for 2c: Rally), `2026-10-11-phase-2b-notes.md` (carry-overs), `2026-10-11-rally-catch-up-notes.md`, `docs/field-notes.md` (#4, #6–#9, #13–#35). Rally: `games/rally/docs/spec/rally-spec.md` (Controls, UI, Debug hook, R4), `tracks-spec.md` (T-20…T-27).

## Global Constraints

- **Where:**
  - Engine repo `/home/smiller/projects/four43/lion-hawk-engine`, branch `phase-2c` (E1–E6 commit here).
  - Rally in the four43 worktree `/home/smiller/projects/four43/four43-lion-hawk/games/rally`, branch `feat/lion-hawk` (R1–R9 commit there). Rally consumes the engine through `games/node_modules/lion-hawk -> ../../../lion-hawk-engine`, so engine commits are visible to Rally immediately.
  - Never modify `/home/smiller/projects/four43/four43` (the main checkout). Don't touch Pig Pens or Tractor Pickup.
- **Green after every task:**
  - engine: `cd /home/smiller/projects/four43/lion-hawk-engine && npm test`;
  - workspace (after every engine task too: the other games consume the engine): `cd /home/smiller/projects/four43/four43-lion-hawk/games && env -u CI npm test`;
  - Rally: `cd /home/smiller/projects/four43/four43-lion-hawk/games/rally && npm test` (the chain `node --test test/*.test.mjs && node test/gen-layout.mjs && … && node test/game.mjs`).
- **Goldens and ranges:** `test/golden.test.mjs` and its golden file are not touched; no `LH_BLESS`. No `check(name, val, lo, hi)` range in any Rally test is widened; ported checks keep their names and bounds.
- **Purity:** `src/game.sim.js` and everything it imports stay sim-pure (R1's purity test enforces it from R1 on). View code (`render*.js`, `snowView.js`, `ui.js`, `menus.js`, `devices.js`, `game.view.js`, `entry.js`, `main.js`) may use the DOM, timers and `Math.random`; sim code may not.
- **Builds:** verify with `python3 build.py` (and `RALLY_ENTRY=src/entry.js python3 build.py` while the entry is new), then discard the output: `cd /home/smiller/projects/four43/four43-lion-hawk && git checkout -- site/exp/rally && git clean -fdq site/exp/rally && git status --short site/exp` (expected: nothing). No game version bump, no release, no deploy, no push.
- **Engine conventions:** view modules take their environment as options (no globals at import time); no allocation per step or per device update in engine code; DOM conventions from 2b ([U-1]–[U-3]); `CHANGELOG.md` and version `0.4.0` in E6.
- **Code style:** match each repo: dense, short comments citing spec IDs (engine `[S-5]`, Rally `T-20`, field notes `#21`).
- **Commits:** conventional commits, explicit `git add` paths, **no `Co-Authored-By` trailer and no AI attribution**. Engine: `feat:`/`fix:`/`docs:`; Rally: `feat(rally):`/`refactor(rally):`/`test(rally):`.

---

## File structure

**Engine** (`/home/smiller/projects/four43/lion-hawk-engine`)

| File | Change |
|---|---|
| `src/core/actions.js` | E1: button latch between applies (#13) |
| `src/view/keyboard.js` | E1: function ramps, `shift+` chords, release by `e.code`, tap latch, Enter/Space on buttons left to the button (#14, #15) |
| `src/view/gamepad.js` | E2: axis curves, several bindings per button (#16) |
| `src/view/touch.js` | E3: slider mode, function radius, adopted base/knob, `data-lh-active`, `data-lh-down` (#17) |
| `src/core/ui.js`, `src/core/engine.js` | E4: `ui.choice`, `ui.field`, `ui.fill` / `engine.ui.fill` (#18) |
| `src/view/uiDom.js` | E4: renders choices and fields, adopts `[data-lh-slot]` elements, document-delegated clicks (#18) |
| `src/view/hook.js` | E4: `ui.fill`; E5: `settled()` honours pending waits |
| `testing/headless.js`, `testing/playwright.js` | E4: `h.fill`, `game.fill` |
| `src/view/boot.js` | E5: `view.dt`, `view.wait`, returns `view` (#19, #20) |
| `test/*.test.mjs` | tests for each of the above |
| `CHANGELOG.md`, `package.json`, `src/version.js`, `docs/spec.md` | E6: 0.4.0 |

**Rally** (`/home/smiller/projects/four43/four43-lion-hawk/games/rally`)

| File | Change |
|---|---|
| `src/game/autopilot.js` | R1: moved from `test/autopilot.js` (pure); R2 adds `autopilotPolicy` |
| `test/autopilot.js` | R1: re-exports `autopilot`, `runUntil` (tests keep their imports) |
| `src/game/settings.js` | R1: `DEFAULTS`, `SETTINGS_V`, `normalizeSettings`, `newSeed` (pure) |
| `src/game/bests.js` | R1: `memoryStore()`; `makeBests()` defaults to it |
| `src/sim.js` | R1: `Sim.dispose()` |
| `test/purity.test.mjs` | R1: sim modules stay pure |
| `src/game/stage.js` | R2/R3: `makeStage({ R, bests })` → `{ scene, api }` (logic moved from `game/game.js`) |
| `src/game/overlays.js` | R2/R3: `makeOverlays(api)` → `{ title, pause, results, settings }` |
| `src/game.sim.js` | R2/R3: `ACTIONS`, `rallyGame({ bests })`, default export |
| `test/flow.test.mjs` | R2/R3: headless flow tests |
| `test/game.mjs` | R4: `Game`-class sections ported to `headless()`, ranges unchanged |
| `src/devices.js` | R5: keyboard, pad, touch bindings |
| `src/game.view.js` | R5 (stage view half), R6 (overlay view halves) |
| `src/menus.js` | R5: `GameHud` on an injectable clock; R8: `Menus` removed |
| `src/entry.js` | R5: the engine browser entry; R8: becomes `src/main.js` |
| `index.template.html` | R5: `data-lh-slot`s, safe-area fallbacks, engine-path CSS |
| `dev.mjs`, `build.py`, `package.json` | R5: `RALLY_ENTRY`; `test:e2e`; R8: entry back to `src/main.js` |
| `test/serve.mjs`, `test/e2e.browser.mjs` | R5/R6: build-and-serve helper, browser flow tests |
| `test/mobile.mjs` | R7: on `lion-hawk/playwright`, self-serving |
| `src/main.js`, `src/ui.js`, `src/game/game.js`, `test/browser.py` | R8: replaced / reduced / deleted |
| `docs/spec/rally-spec.md`, `docs/spec/tracks-spec.md` | R9 |

---

## Interfaces shared by the Rally tasks

**Actions** (`src/game.sim.js`, `ACTIONS`): axes `steer` (+left), `throttle`, `brake`, `handbrake` (0…1 in practice); buttons `shiftUp`, `shiftDown`, `reset` (R / pad Y: back onto the road), `resetAll` (Shift+R: restart), `resetHold` (the touch Reset chip: tap = reset, held 0.6 s = restart), `camera`, `debug`, `pause`, `confirm`.

**Stage state** (`ctx.state` of `stage`, read by view halves as `engine.scene.state`):

| Field | Meaning |
|---|---|
| `settings` | normalised settings (`car, surface, assist, gearbox, mode, world, seed, theme, density, style, units, v`) |
| `pad` | `true` for the hidden test pad (`args.pad`) |
| `sim`, `world`, `mode` | the `Sim`, `sim.world`, `MODES[settings.mode]` (`MODES.freeDrive` on the pad) |
| `phase` | `title \| loading \| ready \| countdown \| running \| finished` |
| `t`, `countN`, `time`, `lapTime`, `clockOn`, `laps`, `splits`, `best`, `result`, `progress`, `pose` | the run (as `Game` had them; `pose` is the last start pose incl. `off`) |
| `load` | `null` or `{ key, then: 'title' \| 'begin', t }` while a rebuild is pending (#21) |
| `builtKey` | key of the built track (`JSON.stringify([seed, { kind, theme, density, style }])`) |
| `worldRev`, `carRev`, `settingsRev` | bumped on world rebuild, car swap, settings change (the view polls them) |
| `cam`, `wheels` | camera mode 0–2 and the wheel-debug panel (view preferences, toggled by actions) |
| `holdT`, `holdFired`, `resultsIn`, `titleBest` | reset-hold timer, results-card timer, `{ label, time } \| null` for the title footer |

**Stage API** (`makeStage({ R, bests })` → `{ scene, api }`; every `api` function takes the engine first and reads `e.scene.state`):
`drive(e)`, `restart(e)`, `toTitle(e)`, `choose(e, key, value)`, `setSeed(e, text)`, `rollSeed(e)`, `newSeedRun(e)`, `teleport(e, p) → pose`, `nearFinish(e, d = 40) → pose | null`, `finish(e, { time, best, splits })`.

**Constants** (`src/game/stage.js`): `READY_T = 0.8`, `COUNT_T = 3`, `LOAD_HOLD = 0.05`, `RESULTS_AFTER = 1.5`, `RESET_HOLD = 0.6`, `DRIVING = new Set(['ready', 'countdown', 'running'])`.

**Events** (`engine.emit`): `state { state, from }`, `count { n }`, `start`, `split { index, of, time, delta }`, `lap { n, time, valid, prev, delta, isBest }`, `missed { index }`, `blocked { index }`, `finish { time, splits, prev, delta, isBest, bestSplits }`, `toast { text, seconds }`.

**`game.state(engine)`** (JSON-safe): `{ phase, mode, seed, kind, time, lapTime, laps, countN, p, next, missed, speed, gear, rpm, hold, x, y, z, simTime, cam, wheels }` (`p`/`next`/`missed` are `null` without progress; `kind` is `sim.world.kind`).

**UI control ids** (test ids): `stage.pause`; `title.mode.{freeDrive,stage,timeAttack}`, `title.world.{loop,stage}`, `title.seed` (field), `title.dice`, `title.style.{twisty,flowing}`, `title.theme.{summer,winter}`, `title.density.{mild,wild}`, `title.car.{awd,rwd}`, `title.settings`, `title.drive`; `pause.{resume,restart,settings,quit}`; `results.{retry,newSeed,menu}`; `settings.surface.{tarmac,hardpack,gravel,snow,ice}`, `settings.assist.{true,false}`, `settings.units.{mph,kmh}`, `settings.gearbox.{auto,manual}`, `settings.close`.

**Presets** (`stage.presets`, `engine.jump('stage', name, opts, { settings, pad })`): `title`, `loading`, `ready`, `countdown { n = 3 }`, `running`, `paused`, `results { time = 163.42, best = 165, splits }`, `settings`, `nearFinish { d = 40 }`, `teleport { p }`.

**`game.debug(engine)`** (→ `window.engine.debug`): `{ sim, settings, screen(name, opts), nearFinish(d), teleport(p), finish(opts), split(i, delta), lap(valid), missed(i), blocked(i), count(n) }` (HUD fakes emit events; they show after the next step's flush).

---

### Task E1: Input latch and keyboard feel (`src/core/actions.js`, `src/view/keyboard.js`)

Field notes #13, #14, #15.

**Interfaces:**
- `createInput`: a button that any `device(partial, source)` call set truthy since the last `apply()` is down for that `apply()` (pressed edge included), even if a later `device()` call set it false. `hold` and `set` values still win over the latch. The latch is cleared by `apply()`. Still allocation-free (a preset `latch` object keyed by button names).
- `bindKeyboard(engine, bindings, { ramps })`:
  - `ramps[axis]` may be a function `(value, target, dt, scratch) => nextValue`, called on every `update(dt)` (held or not); `scratch` is one persistent object per axis. `{ rise, fall }` objects work as before.
  - A binding key may be `shift+<key>` (lowercased). On keydown with `shiftKey`, if `shift+<key>` is bound it is held instead of `<key>`; otherwise `<key>` is held as before.
  - Each keydown remembers which binding key it held under `e.code` (falling back to the lowercased `e.key`); keyup releases that binding, plus `<key>` and `shift+<key>`.
  - A button binding whose key went down and up between two `update()` calls reports `true` for one update.
  - **Changed:** Enter and Space whose target is inside a `<button>` are ignored entirely (not prevented, not held): the browser clicks the button.

- [ ] **Step 1: Write the failing tests.** Add to `test/actions.test.mjs`:
```js
test('2c: a button set and cleared between two applies is latched for one step (#13)', () => {
  const inp = createInput(schema);
  inp.device({ horn: true }, 'keyboard'); inp.device({ horn: false }, 'keyboard');
  let s = inp.apply(); assert.equal(s.horn.pressed, true); assert.equal(s.horn.down, true);
  s = inp.apply(); assert.equal(s.horn.released, true); assert.equal(s.horn.down, false);
  inp.device({ horn: true }, 'pad'); inp.device({ horn: false }, 'pad'); inp.hold({ horn: false });
  assert.equal(inp.apply().horn.down, false); // hold wins over the latch
  inp.release(); inp.device({ horn: true }, 'pad'); inp.device({ horn: false }, 'pad'); inp.set({ horn: false });
  assert.equal(inp.apply().horn.down, false); // so does set
});
```
Add to `test/keyboard.test.mjs` (replace the existing `F4: Enter and Space on a button are not prevented` test with the last one below):
```js
test('2c: a function ramp gets value, target, dt and one scratch object per axis (#14)', () => {
  const seen = [];
  const { kb, key, last } = setup({ ramps: { steer: (v, t, dt, st) => { seen.push(st); st.n = (st.n ?? 0) + 1; return v + t * dt; } } });
  key('keydown', 'd'); kb.update(0.5); assert.equal(last().steer, 0.5);
  kb.update(0.25); assert.equal(last().steer, 0.75);
  key('keyup', 'd'); kb.update(0.1); assert.equal(last().steer, 0.75); // still called with target 0
  assert.equal(seen.length, 3); assert.equal(seen[0], seen[2]); assert.equal(seen[2].n, 3);
});
test('2c: shift+<key> wins while Shift is held; keyup by code releases it (#14)', () => {
  const { window, document } = dom(); const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { r: 'reset', 'shift+r': 'resetAll', '`': 'debug' }, { target: window, doc: document });
  const ev = (type, o) => document.body.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...o }));
  ev('keydown', { key: 'R', code: 'KeyR', shiftKey: true }); kb.update(0.016);
  assert.deepEqual(calls.at(-1), { reset: false, resetAll: true, debug: false });
  ev('keyup', { key: 'r', code: 'KeyR' }); kb.update(0.016);
  assert.deepEqual(calls.at(-1), { reset: false, resetAll: false, debug: false });
  ev('keydown', { key: 'r', code: 'KeyR' }); kb.update(0.016); assert.equal(calls.at(-1).reset, true);
  ev('keyup', { key: 'r', code: 'KeyR' });
  ev('keydown', { key: '`', code: 'Backquote' }); kb.update(0.016); assert.equal(calls.at(-1).debug, true);
  ev('keyup', { key: '~', code: 'Backquote', shiftKey: true }); kb.update(0.016); assert.equal(calls.at(-1).debug, false);
});
test('2c: a key tapped between two updates counts for one update (#13)', () => {
  const { kb, key, last } = setup();
  key('keydown', 'h'); key('keyup', 'h'); kb.update(0.016); assert.equal(last().horn, true);
  kb.update(0.016); assert.equal(last().horn, false);
});
test('2c (changed F4): Enter and Space on a focused button are left to the button (#15)', () => {
  const { window, document } = dom(); const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { enter: 'ok', ' ': 'jump', w: ['t', 1] }, { target: window, doc: document });
  const b = document.createElement('button'); document.body.appendChild(b);
  const fire = (el, key) => { const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; };
  assert.equal(fire(b, 'Enter'), false); assert.equal(fire(b, ' '), false);
  kb.update(0.016); assert.equal(calls.at(-1).ok, false); assert.equal(calls.at(-1).jump, false);
  assert.equal(fire(document.body, 'Enter'), true); assert.equal(fire(b, 'w'), true);
  kb.update(0.016); assert.equal(calls.at(-1).ok, true); assert.equal(calls.at(-1).t, 1);
});
```
- [ ] **Step 2: Run them:** `node --test test/actions.test.mjs test/keyboard.test.mjs`. Expected: the new tests FAIL; the old ones pass.
- [ ] **Step 3: Implement** in `src/core/actions.js` and `src/view/keyboard.js` as specified. Keep `update()` allocation-free (scratch objects and the per-code map are built in event handlers or at bind time, never in `update`). `release()` (blur/hide/dispose) also clears taps and the per-code map.
- [ ] **Step 4: Run** `npm test` (engine) and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/core/actions.js src/view/keyboard.js test/actions.test.mjs test/keyboard.test.mjs && git commit -m "feat: latch short button presses; keyboard function ramps, shift chords, release by code"`

---

### Task E2: Gamepad curves and several bindings per button (`src/view/gamepad.js`)

Field note #16.

**Interfaces:**
- `map.axes[i]` may be `[name, sign, curve]`; `curve(v)` gets the dead-zoned value (−1…1) before the sign is applied.
- `map.buttons[i]` may be a list of bindings: an array whose first element is not a string, e.g. `[['handbrake', 1], 'confirm']`. Each binding behaves like a single one (axis bindings take `value · sign`, button bindings `pressed`).
- Everything else unchanged.

- [ ] **Step 1: Write the failing test** (add to `test/gamepad.test.mjs`):
```js
test('2c: axis curve after the dead zone; one button drives two actions (#16)', () => {
  const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const curve = v => 0.35 * v * Math.abs(v) + 0.65 * v;
  const pad = bindGamepad(engine, { deadZone: 0.08, axes: { 0: ['steer', -1, curve] }, buttons: { 0: [['handbrake', 1], 'confirm'], 7: ['throttle', 1] } },
    { getGamepads: () => [{ index: 0, axes: [0.54], buttons: btns({ 0: { pressed: true, value: 1 }, 7: { pressed: false, value: 0.25 } }) }] });
  pad.update();
  const s = (0.54 - 0.08) / 0.92;
  assert.ok(Math.abs(calls.at(-1).steer - -curve(s)) < 1e-12);
  assert.equal(calls.at(-1).handbrake, 1); assert.equal(calls.at(-1).confirm, true); assert.equal(calls.at(-1).throttle, 0.25);
});
```
- [ ] **Step 2: Run it:** `node --test test/gamepad.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Flatten the button map at bind time into one entry per binding; keep `update()` allocation-free.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/view/gamepad.js test/gamepad.test.mjs && git commit -m "feat: gamepad axis curves and several bindings per button"`

---

### Task E3: Touch slider mode and adopted markup (`src/view/touch.js`)

Field note #17.

**Interfaces:**
- `bindStick(engine, { …, axis, radius, base, knob })`:
  - `axis: 'x' | 'y'` (slider mode): only that axis is read and written; its travel is clamped to ±radius on its own (no radial clamp); the dead zone applies to that axis only, rescaled as today; the knob transform is `translate(<dx>px, 0px)` (or `translate(0px, <dy>px)`). Without `axis` the stick behaves exactly as before.
  - `radius`: a number or a function returning px, read once on `pointerdown` and kept for the gesture.
  - `base`, `knob`: existing elements to use instead of creating `.lh-stick`/`.lh-knob`. Adopted elements are positioned (`left`/`top` at the thumb), shown and hidden, but not styled otherwise, and are left in the DOM (hidden) on `dispose()`.
  - On `pointerdown` the base gets `--lh-r: <radius>px`; the surface gets `data-lh-active` until release.
- `bindHold(engine, el, action)`: `el` carries `data-lh-down` while pressed.

- [ ] **Step 1: Write the failing tests** (add to `test/touch.test.mjs`):
```js
test('2c slider: x only, vertical ignored, per-axis clamp, function radius per gesture, adopted base/knob (#17)', () => {
  const s = setup();
  const base = s.document.createElement('div'), knob = s.document.createElement('div');
  base.hidden = true; base.appendChild(knob); s.document.body.appendChild(base);
  let r = 100;
  const h = bindStick(s.engine, { root: s.root, x: ['steer', -1], axis: 'x', radius: () => r, deadZone: 0, edge: 20, base, knob, doc: s.document });
  s.ev(s.root, 'pointerdown', 1, 300, 300);
  assert.equal(base.hidden, false); assert.equal(base.style.left, '300px'); assert.equal(base.style.getPropertyValue('--lh-r'), '100px');
  assert.equal(s.root.hasAttribute('data-lh-active'), true);
  r = 50; // read again only on the next pointerdown
  s.ev(s.window, 'pointermove', 1, 350, 390); assert.equal(s.v().steer, -0.5); // 50 of 100 px right; 90 px down ignored
  assert.equal(knob.style.transform, 'translate(50px, 0px)');
  s.ev(s.window, 'pointermove', 1, 100, 300); assert.equal(s.v().steer, 1); // clamped on x alone
  s.ev(s.window, 'pointerup', 1);
  assert.equal(s.v().steer, 0); assert.equal(base.hidden, true); assert.equal(s.root.hasAttribute('data-lh-active'), false);
  h.dispose(); assert.equal(base.isConnected, true); assert.equal(s.document.querySelector('.lh-stick'), null);
});
test('2c: bindHold marks its element with data-lh-down while pressed (#17)', () => {
  const s = setup(); const h = bindHold(s.engine, s.btn, 'throttle');
  s.ev(s.btn, 'pointerdown', 5); assert.equal(s.btn.hasAttribute('data-lh-down'), true); assert.equal(s.v().throttle, 1);
  s.ev(s.btn, 'pointerup', 5); assert.equal(s.btn.hasAttribute('data-lh-down'), false);
  h.dispose(); assert.equal(s.btn.hasAttribute('data-lh-down'), false);
});
```
- [ ] **Step 2: Run them:** `node --test test/touch.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the one documented per-move allocation (the transform string).
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/view/touch.js test/touch.test.mjs && git commit -m "feat(view): touch slider mode with function radius and adopted base/knob; hold marks data-lh-down"`

---

### Task E4: Choice and text controls, slot adoption (`src/core/ui.js`, `src/view/uiDom.js`, hook, headless, playwright)

Field note #18.

**Interfaces:**
- Builder (`ui(u, engine, ctx)` in scenes):
  - `u.choice({ id, options: [{ value, label }], get(engine) → value, set(value, engine), when })` registers one control per option, id `<scene>.<id>.<String(value)>`. Tree entry: `{ id, scene, role: 'choice', label, enabled, pressed: get() === value, group: '<scene>.<id>' }`. `tap` calls `set(value, engine)` with the option's original value (booleans stay booleans).
  - `u.field({ id, label, get(engine) → string, set(text, engine), when })`. Tree entry: `{ id, scene, role: 'textbox', label, enabled, value: String(get() ?? '') }`. `tap` on a field throws `ui: control '<id>' is a field: use fill`.
  - `createUi(...).fill(id, text, ctx)`: same checks as `tap` (unknown, covered, disabled), then `set(String(text), ctx)`; throws `ui: control '<id>' is not a field` for other roles.
- `engine.ui.fill(id, text)`; `h.fill(id, text)` (returns `h`); `window.engine.ui.fill(id, text)` (refreshes like `tap`); Playwright `game.fill(testid, text)`: `locator.fill(text)`, then `locator.press('Enter')`, then one render.
- `createUiDom`:
  - choices render as `<button type="button" aria-pressed>`; fields as `<input type="text" aria-label="<label>">`;
  - **slots:** when creating a control, if the document holds `[data-lh-slot="<id>"]` that is a `<button>` (button, switch, choice roles) or an `<input>` (textbox), that element is adopted instead: uiDom sets `data-testid`, `disabled`, `aria-pressed` (switch/choice) and `value` (field, only while it isn't focused), and never writes its content, label, classes or position. A slot of the wrong element type is ignored (the control is created in its scene box as usual). When the control leaves the registry, an adopted element stays where it is, loses `data-testid` and gets `disabled`;
  - clicks are handled by one listener on the document for elements uiDom manages (created or adopted); a field commits with `engine.ui.fill(id, el.value)` on `change` and on Enter (which also blurs it), at most once per distinct value (uiDom remembers the last committed or synced value, so the `change` that follows an Enter's blur doesn't commit twice);
  - `sync()` with nothing changed still writes nothing.

- [ ] **Step 1: Write the failing tests.** Add to `test/ui.test.mjs`:
```js
test('2c: choice registers one control per option; tap sets the original value (#18)', () => {
  const ui = createUi({ onAction() {} }), ctx = { mode: 'stage', assist: false };
  const b = ui.builder('title');
  b.choice({ id: 'mode', options: [{ value: 'stage', label: 'Stage' }, { value: 'loop', label: 'Loop' }], get: c => c.mode, set: (v, c) => { c.mode = v; } });
  b.choice({ id: 'assist', options: [{ value: true, label: 'Assisted' }, { value: false, label: 'Sim' }], get: c => c.assist, set: (v, c) => { c.assist = v; } });
  assert.deepEqual(ui.tree(ctx).slice(0, 2), [
    { id: 'title.mode.stage', scene: 'title', role: 'choice', label: 'Stage', enabled: true, pressed: true, group: 'title.mode' },
    { id: 'title.mode.loop', scene: 'title', role: 'choice', label: 'Loop', enabled: true, pressed: false, group: 'title.mode' },
  ]);
  ui.tap('title.mode.loop', ctx); assert.equal(ctx.mode, 'loop');
  ui.tap('title.assist.true', ctx); assert.equal(ctx.assist, true);
});
test('2c: field shows its value, fills with text, cannot be tapped (#18)', () => {
  const ui = createUi({ onAction() {} }), ctx = { seed: 'abc', open: true };
  ui.builder('title').field({ id: 'seed', label: 'Track seed', get: c => c.seed, set: (t, c) => { c.seed = t; }, when: c => c.open });
  ui.builder('title').button({ id: 'go', label: 'Go', action: () => {} });
  assert.deepEqual(ui.tree(ctx)[0], { id: 'title.seed', scene: 'title', role: 'textbox', label: 'Track seed', enabled: true, value: 'abc' });
  ui.fill('title.seed', 'xyz', ctx); assert.equal(ctx.seed, 'xyz');
  assert.throws(() => ui.tap('title.seed', ctx), /'title.seed' is a field: use fill/);
  assert.throws(() => ui.fill('title.go', 'q', ctx), /'title.go' is not a field/);
  ctx.open = false; assert.throws(() => ui.fill('title.seed', 'q', ctx), /is disabled/);
  assert.throws(() => ui.fill('title.nope', 'q', ctx), /no control 'title.nope'/);
});
```
Add to `test/uiDom.test.mjs` (add `defineGame` to its imports from `../src/index.view.js`):
```js
const slotGame = defineGame({ id: 'g', start: 't', scenes: {
  t: {
    enter(e, c) { Object.assign(c.state, { mode: 'a', seed: 's1', went: 0 }); },
    ui(u) {
      u.button({ id: 'go', label: 'Go', action: e => { e.scene.state.went++; } });
      u.choice({ id: 'mode', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], get: e => e.scene.state.mode, set: (v, e) => { e.scene.state.mode = v; } });
      u.field({ id: 'seed', label: 'Seed', get: e => e.scene.state.seed, set: (t, e) => { e.scene.state.seed = t; } });
    },
  },
  u: {},
} });
test('2c: [data-lh-slot] elements are adopted; content stays the game\'s (#18)', () => {
  const { window, document } = dom();
  document.body.innerHTML = '<div id="menu"><button data-lh-slot="t.go">🏁 Go</button><span data-lh-slot="t.mode.a">x</span><button data-lh-slot="t.mode.b">B!</button><input data-lh-slot="t.seed"></div>';
  const engine = createEngine(slotGame), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const go = document.querySelector('#menu button[data-testid="t.go"]');
  assert.ok(go); assert.equal(go.textContent, '🏁 Go');
  go.click(); assert.equal(engine.scene.state.went, 1);
  const a = document.querySelector('[data-testid="t.mode.a"]'); // a <span> slot can't be a button: created in the scene box
  assert.equal(a.tagName, 'BUTTON'); assert.equal(a.closest('#menu'), null); assert.equal(a.getAttribute('aria-pressed'), 'true');
  const b = document.querySelector('#menu [data-testid="t.mode.b"]'); assert.equal(b.textContent, 'B!'); assert.equal(b.getAttribute('aria-pressed'), 'false');
  b.click(); assert.equal(engine.scene.state.mode, 'b'); assert.equal(b.getAttribute('aria-pressed'), 'true');
  const seed = document.querySelector('#menu input[data-testid="t.seed"]'); assert.equal(seed.value, 's1');
  seed.value = 'zz'; seed.dispatchEvent(new window.Event('change', { bubbles: true })); assert.equal(engine.scene.state.seed, 'zz');
  engine.go('u'); ui.sync();
  assert.equal(go.isConnected, true); assert.equal(go.hasAttribute('data-testid'), false); assert.equal(go.disabled, true);
  go.click(); assert.equal(engine.scene.name, 'u'); // a released element no longer taps
});
test('2c: a created field renders as an input and Enter commits it', () => {
  const { window, document } = dom();
  const engine = createEngine(slotGame), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const f = document.querySelector('input[data-testid="t.seed"]');
  assert.equal(f.getAttribute('aria-label'), 'Seed'); assert.equal(f.value, 's1');
  f.focus(); f.value = 'qq'; f.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(engine.scene.state.seed, 'qq');
});
```
Add to `test/headless.test.mjs` (import `defineGame` from `../src/index.sim.js` if it isn't imported yet):
```js
const fieldGame = defineGame({ id: 'f', start: 't', scenes: { t: {
  enter(e, c) { c.state.seed = 'a'; },
  ui(u) { u.field({ id: 'seed', label: 'Seed', get: e => e.scene.state.seed, set: (t, e) => { e.scene.state.seed = t; } }); },
} } });
test('2c: h.fill fills a field', () => {
  const h = headless(fieldGame); assert.equal(h.fill('t.seed', 'b'), h); assert.equal(h.engine.scene.state.seed, 'b');
});
```
Add to `test/hook.test.mjs` (same `fieldGame`, defined locally; `createEngine`, `defineGame` from `../src/index.view.js`):
```js
test('2c: window.engine.ui.fill fills a field', () => {
  const target = {}, engine = createEngine(fieldGame);
  installEngine(engine, { driver: { manual: () => false }, target });
  target.engine.ui.fill('t.seed', 'c'); assert.equal(engine.scene.state.seed, 'c');
});
```
Add to `test/playwright.test.mjs`:
```js
test('2c: game.fill types into the control and commits with Enter', async () => {
  const calls = [], loc = { fill: async t => calls.push(['fill', t]), press: async k => calls.push(['press', k]) };
  const g = gameDriver({ page: { locator: s => { calls.push(['locator', s]); return loc; }, evaluate: async () => {} }, context: {}, preset: presets.desktop, presetName: 'desktop' });
  await g.fill('title.seed', 'abc');
  assert.deepEqual(calls, [['locator', '[data-testid="title.seed"]'], ['fill', 'abc'], ['press', 'Enter']]);
});
```
- [ ] **Step 2: Run them:** `node --test test/ui.test.mjs test/uiDom.test.mjs test/headless.test.mjs test/hook.test.mjs test/playwright.test.mjs`. Expected: the new tests FAIL; the existing ones (including "sync with no change performs no DOM mutations" and the deepEqual of plain button/switch tree entries) still pass.
- [ ] **Step 3: Implement** in `src/core/ui.js` (builder `choice`/`field`, `fill`), `src/core/engine.js` (`engine.ui.fill`), `src/view/uiDom.js`, `src/view/hook.js`, `testing/headless.js`, `testing/playwright.js`. **(judgment)** In `uiDom`, look a slot up when the control is first created (or re-created after removal), not on every `sync()`; keep a `WeakMap` element → control id for the delegated click handler so stray `[data-testid]` elements elsewhere in the page are never tapped. The `e2e` countdown test must still pass unchanged.
- [ ] **Step 4: Run** engine `npm test` (includes the real-Chromium e2e) and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/core/ui.js src/core/engine.js src/view/uiDom.js src/view/hook.js testing/headless.js testing/playwright.js test/ui.test.mjs test/uiDom.test.mjs test/headless.test.mjs test/hook.test.mjs test/playwright.test.mjs && git commit -m "feat: choice and text-field UI controls, fill, and adoption of game markup via data-lh-slot"`

---

### Task E5: Frame time and pending waits for view halves (`src/view/boot.js`, `src/view/hook.js`)

Field notes #19, #20.

**Interfaces:**
- The `view` object passed to view halves gains:
  - `view.dt`: seconds since the previous driver frame while the driver renders a frame (0 on the driver's first frame); 0 for renders the driver didn't start (`window.engine.render`, `engine.render`).
  - `view.wait(promise) → promise`: until it settles, `window.engine.settled()` is false and `<html data-lh-settled="0">`; on settling, boot refreshes (attribute back to `1` if nothing else is pending). A rejection is reported into `window.engine.errors`.
- `boot(...)` returns `{ engine, driver, ui, hook, view, dispose }`.
- `installEngine(engine, { …, busy })`: `settled()` returns false while `busy()` is true (default `() => false`).

- [ ] **Step 1: Write the failing test** (add to `test/boot.test.mjs`):
```js
test('2c: view.dt is the driver frame time in frame(), 0 for hook renders; view.wait holds settled (#19, #20)', async () => {
  const { document } = dom(); let tick; const seen = [];
  const view = defineView({ scenes: { title: { frame: (e, a, v) => seen.push(v.dt) } } });
  const target = { document, addEventListener() {}, removeEventListener() {} };
  const app = boot(game, view, { doc: document, target, raf: f => { tick = f; return 1; }, caf() {}, flags: parseFlags('') });
  tick(1000); tick(1016); app.hook.render(0);
  assert.deepEqual(seen.map(x => +x.toFixed(3)), [0, 0.016, 0]);
  let resolve; const p = new Promise(r => { resolve = r; });
  assert.equal(app.view.wait(p), p);
  assert.equal(app.hook.settled(), false); assert.equal(document.documentElement.getAttribute('data-lh-settled'), '0');
  resolve(); await p; await new Promise(r => setTimeout(r, 0));
  assert.equal(app.hook.settled(), true); assert.equal(document.documentElement.getAttribute('data-lh-settled'), '1');
  app.view.wait(Promise.reject(new Error('no track view'))); await new Promise(r => setTimeout(r, 0));
  assert.match(target.engine.errors.at(-1).message, /no track view/); assert.equal(app.hook.settled(), true);
  app.dispose();
});
```
- [ ] **Step 2: Run it:** `node --test test/boot.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Create the `view` object before the driver so a first internal device can record `dt` (`update(dt) { view.dt = dt; }`) ahead of the game's devices; reset `view.dt = 0` after the frame's view halves ran. Pass `busy: () => pending > 0` to `installEngine`.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/view/boot.js src/view/hook.js test/boot.test.mjs && git commit -m "feat(view): view.dt frame time and view.wait pending loads for settled()"`

---

### Task E6: Engine 0.4.0 (changelog, spec, version)

- [ ] **Step 1:** Bump `package.json` and `src/version.js` to `0.4.0` (the package test checks they agree).
- [ ] **Step 2:** `CHANGELOG.md`: a `## 0.4.0 — <date>` entry, "Phase 2c-rally, the engine additions Rally's migration needs", listing E1–E5 by behaviour (button latch; keyboard function ramps, `shift+` chords, release by code, taps, Enter/Space on buttons left to the button — a change from 0.3.0; gamepad curves and multi-binding; touch slider mode, function radius, adopted base/knob, `data-lh-active`, `data-lh-down`; `ui.choice`, `ui.field`, `fill` everywhere, `data-lh-slot` adoption, document-delegated clicks; `view.dt`, `view.wait`, `boot` returns `view`).
- [ ] **Step 3:** `docs/spec.md`, one line each, no new IDs: [I-2] keyboard (function ramps, `shift+` chords), gamepad (curves), touch (slider mode); [I-1] buttons latch presses shorter than a step; [U-1] `ui.choice`, `ui.field`, and `data-lh-slot` adoption; [S-1] view halves get `view.dt` and `view.wait`; [D-6] `settled()` also waits for `view.wait` promises.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add package.json src/version.js CHANGELOG.md docs/spec.md && git commit -m "docs: lion-hawk 0.4.0 changelog and spec notes for the 2c-rally additions"`

---

### Task R1: Rally sim preparation (pure modules, purity test)

Field note #24.

**Files:** `src/game/autopilot.js` (new, moved), `test/autopilot.js`, `src/game/settings.js` (new), `src/game/bests.js`, `src/sim.js`, `test/purity.test.mjs` (new).

**Interfaces:**
- `src/game/autopilot.js`: `autopilot(sim, track, opts)` and `runUntil(sim, track, opts)` moved verbatim from `test/autopilot.js` (imports re-pointed); `test/autopilot.js` becomes `export { autopilot, runUntil } from '../src/game/autopilot.js';`.
- `src/game/settings.js`: `SETTINGS_V = 4`; `DEFAULTS = { car: 'awd', surface: 'gravel', assist: false, gearbox: 'auto', mode: 'freeDrive', world: 'loop', theme: 'summer', density: 'mild', style: 'twisty', units: 'mph' }` (no seed); `normalizeSettings(saved = {}) → settings` (copy of `{ ...DEFAULTS, ...saved, v: 4 }` with today's rules: `v < 2` drops `assist`, an unknown `mode` becomes `freeDrive`, `world: 'pad'` becomes `'loop'`; never mutates `saved`); `newSeed(r) → string`: 5 characters from `0-9a-z` drawn with `r.int(0, 35)` (`r` is an engine `rng` stream).
- `src/game/bests.js`: `memoryStore() → { getItem, setItem }` (a `Map`); `makeBests(storage = memoryStore())`.
- `src/sim.js`: `Sim.dispose()` frees the Rapier world (`this.phys.free()`), clears `phys` and `car`; idempotent.
- `test/purity.test.mjs`: `scanPurity` over `src/game.sim.js`, `src/sim.js`, `src/vehicle.js`, `src/drivetrain.js`, `src/tire.js`, `src/snow.js`, `src/cars.js`, `src/gen/`, `src/world/`, `src/game/` must be empty, plus a Rally rule over the same files: no `localStorage`, `setTimeout`, `setInterval`, `requestAnimationFrame`, and no import of `render`, `snowView`, `ui.js`, `menus.js`, `devices.js`, `game.view.js`, `entry.js`, `main.js`.

- [ ] **Step 1: Write the purity test** (`test/purity.test.mjs`):
```js
// L-3 / T-12: Rally's sim half never touches three.js, the DOM, the wall clock, Math.random, browser storage or timers,
// and never imports Rally's view modules (lion-hawk field note #24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const SIM = ['game.sim.js', 'sim.js', 'vehicle.js', 'drivetrain.js', 'tire.js', 'snow.js', 'cars.js', 'gen', 'world', 'game'].map(p => join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RALLY = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(render|snowView|ui|menus|devices|game\.view|entry|main)(\.js)?['"]/];

test('sim modules pass the engine purity scan', () => { assert.deepEqual(scanPurity(SIM), []); });
test('sim modules use no browser storage or timers and import no Rally view module', () => {
  const bad = SIM.flatMap(files).flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => !/^\s*\/\//.test(l) && RALLY.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
```
- [ ] **Step 2: Run it:** `node --test test/purity.test.mjs`. Expected: FAIL on `src/game/bests.js` (`globalThis.localStorage`).
- [ ] **Step 3: Implement** the moves and modules above, and add a third test to `test/purity.test.mjs` for the settings module: `normalizeSettings({ v: 1, assist: true, mode: 'nope', world: 'pad' })` gives `assist: false, mode: 'freeDrive', world: 'loop', v: 4` and leaves its argument unchanged; `newSeed(rng('x'))` (engine `rng` from `lion-hawk/sim`) matches `/^[0-9a-z]{5}$/` and equals `newSeed(rng('x'))` again.
- [ ] **Step 4: Run** Rally `npm test` (the golden is untouched and must pass: the autopilot is the same code), the workspace suite, and the build check (Global Constraints). Expected: all pass, `site/exp` clean.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/rally/src/game/autopilot.js games/rally/test/autopilot.js games/rally/src/game/settings.js games/rally/src/game/bests.js games/rally/src/sim.js games/rally/test/purity.test.mjs && git commit -m "refactor(rally): pure autopilot, settings and bests modules, Sim.dispose, sim purity test"`

---

### Task R2: `game.sim.js`: the stage scene and the core flow (headless)

Field notes #7, #21, #22, #23, #26, #28.

**Files:** `src/game/stage.js` (new), `src/game/overlays.js` (new), `src/game.sim.js` (new), `src/game/autopilot.js` (adds the policy), `test/flow.test.mjs` (new).

**Interfaces** (see "Interfaces shared by the Rally tasks" above; R2 delivers the subset below, R3 the rest):
- `src/game.sim.js`: `export const ACTIONS`; `export function rallyGame({ bests } = {})` → `defineGame({ id: 'rally', sim: { hz: 1 / DT, maxCatchUp: 12, maxFrame: 0.1 }, actions: ACTIONS, start: 'stage', scenes: { stage, title, pause, results, settings }, policies: { autopilot: autopilotPolicy }, state, debug })`; `export default rallyGame()`. Imports `R` from `@dimforge/rapier3d-compat` (initialised by the caller before `createEngine`).
- `makeStage({ R, bests })` → `{ scene, api }`:
  - `enter(e, ctx)`: fill `ctx.state` (table above) from `ctx.args` (`{ settings, pad }`, both optional): `normalizeSettings(args.settings)`, a seed from `newSeed(e.rng('seeds'))` when none; build the world synchronously (pad: `new Sim(R, { car, surface, assist })`; otherwise `generateTrack(seed, { kind: mode.kind ?? settings.world, theme, density, style })` in a `TrackWorld`; if generation throws, fall back to the pad and emit `toast`); `car.autoShift = gearbox === 'auto'`; register `ctx.system('rally.input', …, { stage: 'input.apply', after: ['lh.input'] })` and `ctx.system('rally.physics', () => s.sim.step(), { stage: 'physics.world' })`; then the pad begins free drive at once, a track goes to `title` (phase `title`, car placed and held, `e.overlay('title')`).
  - `exit(e, ctx)`: `ctx.state.sim.dispose()` ([S-3]).
  - `rally.input` (runs even under the pause overlay): copy `steer/throttle/brake/handbrake` from `e.input.snapshot` into `car.input` in `DRIVING` phases; zero them in `title`/`loading`; leave them alone in `finished`; `camera.pressed` → `cam = (cam + 1) % 3`; `debug.pressed` → `wheels = !wheels`.
  - `step(e, dt, ctx)`: `loading` (hold `LOAD_HOLD` of engine time, then build and continue with `load.then`, #21); `ready`/`countdown`/`running`/`finished` exactly as `Game.step()` + `Game.handle()` (same constants, same order: clock first, then progress); `finished` also counts `resultsIn` down from `RESULTS_AFTER` and then opens `results` once (#22); in `running`/`finished`: `reset.pressed` → recover onto the road (pad: `sim.resetCar()`), `resetAll.pressed` → `restart` (pad: `sim.resetCar()`), `resetHold` tap/hold (`RESET_HOLD`, fires once per hold), `shiftUp/shiftDown.pressed` → if Auto, switch to Manual (`settings.gearbox`, `car.autoShift`, `settingsRev++`), then `shift(car.dt, ±1)`; `pause.pressed` in a `DRIVING` phase → `e.overlay('pause')` (#23).
  - `ui(u)`: `stage.pause` (`when`: `DRIVING` phase and pause not open).
  - `api.drive(e)` (only from `title`: close `title`, begin), `api.restart(e)` (close `pause`/`results` if open, `world.resetProps()`, `snow?.clear()`, begin), `api.toTitle(e)` (close `pause`/`results`; open `title` unless it is already open or pending; rebuild if the track key changed (`load.then = 'title'`, the title stays open while loading) else title now; `titleBest` from `bests`), `api.teleport(e, p)`, `api.nearFinish(e, d)` (the old `rally.debug` bodies). Every phase change goes through `setPhase(e, s, phase)`, which emits `state { state, from }` (including `enter`'s first `title`).
  - `stage.pause` control: `action: e => e.overlay('pause')`.
- `makeOverlays(api)` → R2 part: `title` (`ui`: `title.drive` with `when` phase `title`; `step`: `confirm.pressed` and no `settings` overlay → `api.drive`), `pause` (`pauses: true`; `pause.resume`; `step`: `pause.pressed` and no `settings` overlay → close), `results` (`results.retry` → `api.restart`; `step`: `confirm.pressed` and no `settings` → `api.restart`), `settings` (`settings.close`; `step`: `pause.pressed` → close).
- `autopilotPolicy(h)`: `{}` unless the stage is `running` on a track; otherwise the autopilot's `{ steer, throttle, brake, handbrake: 0 }`, recomputed when 4 or more steps passed since the last computation for that engine (`WeakMap`), as the golden's 60 Hz (#26).
- `state(e)` and `debug(e)` (R2 part: `sim`, `settings`, `nearFinish`, `teleport`) as in the shared interfaces.

- [ ] **Step 1: Write the failing tests** (`test/flow.test.mjs`):
```js
// Headless flow (lion-hawk phase 2c, [T-1]–[T-5]): Rally's stage scene with its title, pause and results overlays.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, canonical } from 'lion-hawk/test';
import { rallyGame } from '../src/game.sim.js';
import { DT } from '../src/sim.js';
await R.init();

const STAGE = { settings: { mode: 'stage', seed: 'flow1' } };
const FREE = { settings: { mode: 'freeDrive', world: 'loop', seed: 'p1' } };
const running = h => h.until(x => x.state().phase === 'running', { maxSeconds: 5, message: 'running' });

test('the sim rate is the vehicle step', () => { assert.equal(1 / rallyGame().sim.hz, DT); });

test('flow: title → drive → countdown → finish → results (car rolling) → retry', () => {
  const h = headless(rallyGame(), { seed: 3, args: STAGE });
  assert.equal(h.scene.name, 'stage'); assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
  assert.equal(h.state().hold, true);
  h.tap('title.drive');
  assert.deepEqual(h.scene.overlays, []); assert.equal(h.state().phase, 'ready');
  running(h);
  assert.deepEqual(h.events.of('count').map(e => e.n), [3, 2, 1, 0]);
  assert.deepEqual(h.events.of('state').map(e => e.state), ['title', 'ready', 'countdown', 'running']); // enter's title flushes on step 1
  h.engine.game.debug(h.engine).nearFinish(40);
  const fin = h.untilEvent('finish', { maxSeconds: 20, input: 'autopilot' });
  assert.ok(fin.time > 0); assert.equal(fin.isBest, true);
  assert.equal(h.state().phase, 'finished'); assert.deepEqual(h.scene.overlays, []);
  h.untilScene('results', { maxSeconds: 2 });
  const t0 = h.state().simTime; h.step(24);
  assert.ok(h.state().simTime > t0, 'results do not pause: physics keeps stepping');
  h.tap('results.retry');
  assert.deepEqual(h.scene.overlays, []); assert.equal(h.state().phase, 'ready'); assert.equal(h.state().time, 0);
});

test('pause freezes the stage and physics; the pause key or Resume closes it; covered controls throw', () => {
  const h = headless(rallyGame(), { args: FREE });
  h.tap('title.drive'); assert.equal(h.state().phase, 'running');
  h.step(240, { throttle: 1 });
  h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, ['pause']);
  const a = h.state(); h.step(120, { throttle: 1 }); const b = h.state();
  assert.equal(b.simTime, a.simTime); assert.deepEqual([b.x, b.z], [a.x, a.z]);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, []);
  h.step(1); h.step(1, { pause: true }); h.tap('pause.resume'); assert.deepEqual(h.scene.overlays, []);
  h.step(1); h.step(1, { pause: true });
  assert.throws(() => h.tap('stage.pause'), /covered by 'pause'/);
});

test('the engine path is deterministic: same seed and inputs, bit-identical state', () => {
  const run = () => {
    const h = headless(rallyGame(), { seed: 9, args: { settings: { mode: 'stage', seed: 'det1' } } });
    h.tap('title.drive'); running(h); h.seconds(5, 'autopilot');
    return canonical(h.state(), { digits: 15 });
  };
  assert.equal(run(), run());
});
```
- [ ] **Step 2: Run them:** `node --test test/flow.test.mjs`. Expected: FAIL (`../src/game.sim.js` missing).
- [ ] **Step 3: Implement** `src/game/stage.js`, `src/game/overlays.js`, `src/game.sim.js` and the policy. **(judgment)** Move `Game`'s code rather than re-deriving it: `clear`, `startPose` (with its pose cache), `place`, `title`, `begin`, `restart`, `step`, `handle` become functions over `s`; replace `this.emit` with `e.emit`, `this.set` with a `setPhase(e, s, phase)` that emits `state { state, from }`, and `DT` with the step's `dt` (the same value; the R2 test asserts it). Keep `game/game.js` untouched (the old `main.js` still uses it until R8). `ctx.state` holds the `Sim` (#28): never put it in `game.state()`.
- [ ] **Step 4: Run** `node --test test/flow.test.mjs`, then Rally `npm test`, the workspace suite and the build check. Expected: all pass (the old path is unchanged).
- [ ] **Step 5: Commit** (four43 worktree): `git add games/rally/src/game/stage.js games/rally/src/game/overlays.js games/rally/src/game.sim.js games/rally/src/game/autopilot.js games/rally/test/flow.test.mjs && git commit -m "feat(rally): game.sim.js with the stage scene, title/pause/results overlays and a headless flow test"`

---

### Task R3: Menus as registry controls, settings overlay, presets, debug extras

Field notes #18, #25, #33.

**Files:** `src/game/stage.js`, `src/game/overlays.js`, `src/game.sim.js`, `test/flow.test.mjs`.

**Interfaces:**
- `title` overlay `ui`: `u.choice` for `mode`, `world` (`when`: mode `freeDrive`), `style`, `theme`, `density`, `car`, each `set: (v, e) => api.choose(e, key, v)`; `u.field({ id: 'seed', label: 'Track seed', get: e => e.scene.state.settings.seed, set: (t, e) => api.setSeed(e, t) })`; `title.dice` → `api.rollSeed`; `title.settings` → `e.overlay('settings')`; `title.drive` (from R2).
- `api.choose(e, key, value)`: no-op when unchanged; sets `settings[key]`, `settingsRev++`; per key: `car` → `sim.setCar(value)`, `autoShift`, `carRev++`, then `toTitle`; `mode/world/style/theme/density` → `toTitle` (which rebuilds via `loading` when the key changed); `surface` → `sim.setSurface(value)` (pad only); `assist` → `sim.setAssist(value)`; `gearbox` → `car.autoShift`; `units` → nothing else (view only).
- `api.setSeed(e, text)`: `text.trim()` or `newSeed(e.rng('seeds'))`, then `toTitle`. `api.rollSeed(e)`: a new seed, then `toTitle`. `api.newSeedRun(e)`: close `results`, a new seed, rebuild (`load.then = 'begin'`).
- `pause` overlay: `pause.restart` (`when`: on a track) → `api.restart`; `pause.settings` → `e.overlay('settings')`; `pause.quit` → `api.toTitle`.
- `results` overlay: `results.newSeed` → `api.newSeedRun`; `results.menu` → `api.toTitle`.
- `settings` overlay `ui`: choices `surface` (`when`: `s.pad`), `assist` (`true`/`false`), `units` (`mph`/`kmh`), `gearbox` (`auto`/`manual`), all via `api.choose`; `settings.close`.
- `stage.presets` (#25: set state, never step): `title` (nothing), `loading` (a pending rebuild of the current key, `then: 'title'`), `ready` (`api.drive`), `countdown { n = 3 }` (drive, then phase `countdown`, `countN = n`, `t = (3 - n) · COUNT_T / 3`, car held, emit `count { n }`), `running` (drive, then phase `running`, car released, `clockOn = mode.clock === 'go'`), `paused` (`running` + `e.overlay('pause')`), `results { time, best, splits }` (`running` + `api.finish` + `e.overlay('results')`), `settings` (`e.overlay('settings')`), `nearFinish { d }`, `teleport { p }` (`running` first). Presets close `title` themselves where the phase leaves `title`.
- `api.finish(e, { time = 163.42, best = 165, splits })`: the old `debug.finish` body.
- `debug(e)` adds `screen(name, opts = {})` (`e.jump('stage', name, opts, { settings: { ...s.settings, ...(opts.mode ? { mode: opts.mode } : {}) }, pad: s.pad })`), `finish`, `split`, `lap`, `missed`, `blocked`, `count` (the old HUD fakes, through `e.emit` or the moved `handle`).

- [ ] **Step 1: Write the failing tests** (append to `test/flow.test.mjs`):
```js
test('title choices rebuild the preview after a short loading hold; car and seed choices', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'stage', seed: 'c1' } } });
  const S = () => h.engine.scene.state, rev = S().worldRev;
  h.tap('title.theme.winter');
  assert.equal(h.state().phase, 'loading');
  h.until(x => x.state().phase === 'title', { maxSteps: 60 });
  assert.equal(S().worldRev, rev + 1); assert.equal(S().world.track.theme, 'winter'); assert.deepEqual(h.scene.overlays, ['title']);
  const car = S().carRev; h.tap('title.car.rwd');
  assert.equal(S().sim.car.cfg.id, 'rwd'); assert.ok(S().carRev > car); assert.equal(h.state().phase, 'title'); // same track: no rebuild
  h.fill('title.seed', 'abc'); h.until(x => x.state().phase === 'title', { maxSteps: 60 }); assert.equal(h.state().seed, 'abc');
  h.fill('title.seed', '   '); h.until(x => x.state().phase === 'title', { maxSteps: 60 }); assert.match(h.state().seed, /^[0-9a-z]{5}$/);
  assert.equal(h.engine.ui.tree().find(c => c.id === 'title.world.loop').enabled, false); // free drive only
  assert.ok(S().settingsRev >= 4);
});

test('settings overlay: options apply at once; Esc closes the sheet before the pause menu', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'freeDrive', world: 'loop', seed: 's1', assist: false } } });
  const S = () => h.engine.scene.state;
  h.tap('title.settings'); assert.deepEqual(h.scene.overlays, ['title', 'settings']);
  h.tap('settings.assist.true'); assert.equal(S().sim.car.assist, true);
  h.tap('settings.gearbox.manual'); assert.equal(S().sim.car.autoShift, false);
  h.tap('settings.units.kmh'); assert.equal(S().settings.units, 'kmh');
  assert.equal(h.engine.ui.tree().find(c => c.id === 'settings.surface.snow').enabled, false); // the pad only
  h.tap('settings.close'); h.tap('title.drive');
  h.step(1, { pause: true }); h.tap('pause.settings'); assert.deepEqual(h.scene.overlays, ['pause', 'settings']);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, ['pause']);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, []);
});

test('Reset: a tap puts the car back on the road, a 0.6 s hold restarts; a shift in Auto switches to Manual', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'stage', seed: 'r1' } } });
  h.tap('title.drive'); running(h);
  h.seconds(3, { throttle: 1 }); assert.ok(h.state().speed > 5);
  h.step(1, { resetHold: true }); h.step(1);
  assert.equal(h.state().phase, 'running'); assert.ok(Math.abs(h.state().speed) < 0.5);
  h.hold({ resetHold: true }); h.seconds(0.7); h.release('resetHold');
  assert.equal(h.state().phase, 'ready'); // restart: a new countdown
  running(h); h.step(1, { shiftUp: true });
  assert.equal(h.engine.scene.state.settings.gearbox, 'manual'); assert.equal(h.engine.scene.state.sim.car.autoShift, false);
});

test('presets put the stage in a known state without stepping (S-5)', () => {
  const args = { settings: { mode: 'stage', seed: 'p2' } }, h = headless(rallyGame(), { args });
  h.jump('stage', 'countdown', { n: 2 }, args);
  assert.deepEqual([h.state().phase, h.state().countN, h.scene.overlays.length], ['countdown', 2, 0]);
  const m = h.mark(); h.step(1);
  assert.equal(h.events.of('count').at(-1).n, 2); assert.equal(h.events.since(m).count('count'), 0); // light 2 shown once, nothing skipped
  h.jump('stage', 'paused', {}, args); assert.deepEqual(h.scene.overlays, ['pause']);
  h.jump('stage', 'results', { time: 100, best: null }, args);
  assert.deepEqual(h.scene.overlays, ['results']); assert.equal(h.engine.scene.state.result.isBest, true);
  h.jump('stage', 'nearFinish', { d: 40 }, args); assert.equal(h.state().phase, 'running'); assert.ok(h.state().p > 0);
  h.jump('stage', 'settings', {}, args); assert.deepEqual(h.scene.overlays, ['title', 'settings']);
});

test('results: New seed builds another stage and starts a run; Menu and Quit return to the title', () => {
  const args = { settings: { mode: 'stage', seed: 'n1' } }, h = headless(rallyGame(), { seed: 4, args });
  h.jump('stage', 'results', {}, args);
  h.tap('results.newSeed'); assert.equal(h.state().phase, 'loading'); assert.deepEqual(h.scene.overlays, []);
  h.until(x => x.state().phase === 'ready', { maxSteps: 60 }); assert.notEqual(h.state().seed, 'n1');
  h.jump('stage', 'results', {}, args); h.tap('results.menu');
  assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
  h.jump('stage', 'paused', {}, args); h.tap('pause.quit');
  assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
});
```
- [ ] **Step 2: Run them:** `node --test test/flow.test.mjs`. Expected: the new tests FAIL, R2's pass.
- [ ] **Step 3: Implement.** **(judgment)** The `countdown` preset must leave `t` and `countN` such that the next `step` neither repeats light `n` nor skips one (the test's second assertion); the `results` preset must not start the 1.5 s timer a second time (the card is already open). Jumps rebuild the world each time (#33): fine.
- [ ] **Step 4: Run** `node --test test/flow.test.mjs`, Rally `npm test`, the workspace suite and the build check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/rally/src/game/stage.js games/rally/src/game/overlays.js games/rally/src/game.sim.js games/rally/test/flow.test.mjs && git commit -m "feat(rally): title, pause, results and settings controls in the UI registry; stage presets and debug extras"`

---

### Task R4: Port the `Game` sections of `test/game.mjs` to `headless()`

Field note #27.

**Files:** `test/game.mjs`.

**Interfaces:** unchanged sections: `hold`, `pace`, `progress`, `bests` (they test `Sim`, `pace`, `makeProgress`, `makeBests` directly). Ported sections: `game stage`, `game time attack`, `game free drive` drive `rallyGame({ bests: makeBests(memStore()) })` through `headless()` with the same check names and the same `[lo..hi]` bounds. A `play(h, { maxTime, until, onEvent })` helper replaces the old one: `h.step(1, 'autopilot')` per step, collecting `h.events` with `at = e.step * DT`, calling `onEvent` from an `h.engine.events.on` listener (at `events.flush`, after physics: #27).

- [ ] **Step 1: Port the three sections.** Rules:
  - Settings for the old `trackSim(seed, kind)`: `{ mode, seed, world: kind, theme: 'summer', assist: true }` (`assist: true` matches the old `Sim` options; the default is `false` and would change lap times).
  - `game.title()` / `game.begin()` → the headless start (title) / `h.tap('title.drive')`; `game.restart()` after a finish → `h.untilScene('results', { maxSeconds: 2 })` then `h.tap('results.retry')`; `game.pause()/resume()` → `h.step(1, { pause: true })` / `h.tap('pause.resume')`, with the check `pause` reading `h.scene.overlays.includes('pause')` (#23).
  - Times: `t0 = h.time.step * DT` when Drive is tapped; `goAt`/`fin.at` from the event's `step · DT`. Same arithmetic as before (an event's step is the step whose logic emitted it).
  - `game.startPose().off` → `h.engine.scene.state.pose.off`; `game.progress` → `h.engine.scene.state.progress`; `game.bests.get(game.key)` → the test's `bests.get(bestKey('stage', track, 'awd'))`; `game.laps` → `h.engine.scene.state.laps`.
  - The teleport check resets the car from the event listener (`sim.car.reset(...)` on `split` index 0 / on `blocked`), as before.
  - Remove the now-unused imports (`Game`, `READY_T`, `COUNT_T` come from `../src/game/stage.js`).
- [ ] **Step 2: Run** `node test/game.mjs`. Expected: every check passes with unchanged bounds (67 checks at 0.3.1; the count may change only where a check line itself was replaced one-for-one). **(judgment)** If a check fails, it is a behaviour difference in the moved code: find it (compare against `src/game/game.js`, still present) — never widen a bound.
- [ ] **Step 3: Run** Rally `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/rally/test/game.mjs && git commit -m "test(rally): game loop checks drive the engine headless (ranges unchanged)"`

---

### Task R5: Browser half part 1: devices, entry, stage view half

Field notes #19, #20, #22, #29, #30, #31, #35.

**Files:** `src/devices.js` (new), `src/game.view.js` (new), `src/entry.js` (new), `src/menus.js` (`GameHud` clock), `index.template.html`, `dev.mjs`, `build.py`, `package.json` (`test:e2e`), `test/serve.mjs` (new), `test/e2e.browser.mjs` (new).

**Interfaces:**
- `src/devices.js`:
  - `steerRange(width = innerWidth) = Math.max(60, Math.min(110, width * 0.12))`;
  - `steerRamp(v, t, dt, st)`: today's `Controls.update` steering (hold time in `st.hold`, rate `1.2 + 3·min(1, hold/0.35)`, snap through centre at 6/s, return at 4.5/s, clamp ±1);
  - `KEYS = { a/arrowleft: ['steer', 1], d/arrowright: ['steer', -1], w/arrowup: ['throttle', 1], s/arrowdown: ['brake', 1], ' ': ['handbrake', 1], q: 'shiftDown', e: 'shiftUp', r: 'reset', 'shift+r': 'resetAll', c: 'camera', f3: 'debug', '`': 'debug', escape: 'pause', p: 'pause', enter: 'confirm' }`, `RAMPS = { steer: steerRamp, throttle: { rise: 5, fall: 8 }, brake: { rise: 6, fall: 9 } }`;
  - `PAD = { deadZone: 0.08, axes: { 0: ['steer', -1, v => 0.35 * v * Math.abs(v) + 0.65 * v] }, buttons: { 7: ['throttle', 1], 6: ['brake', 1], 0: [['handbrake', 1], 'confirm'], 5: 'shiftUp', 4: 'shiftDown', 3: 'reset', 2: 'camera', 9: 'pause' } }`;
  - `devices(doc) → [factory]`: `bindKeyboard(e, KEYS, { ramps: RAMPS })`, `bindGamepad(e, PAD)`, `bindStick(e, { root: #steerZone, x: ['steer', -1], axis: 'x', radius: () => steerRange(), deadZone: 0, edge: 20, base: #steerBase, knob: #steerKnob })`, `bindHold` on `#gasBtn` (throttle), `#brakeBtn` (brake), `#hbBtn` (handbrake), `#upBtn` (shiftUp), `#dnBtn` (shiftDown), `#resetBtn` (resetHold), `#camBtn` (camera), `#dbgBtn` (debug).
- `src/game.view.js`: `rallyView({ save })` → `defineView({ scenes: { stage } })` (R6 adds the overlays). The `stage` half:
  - one `Renderer` per page (module-level, created on first enter on `#view`), a `Hud`, a `GameHud({ now: () => engine.time.sim })`, the toast and seed chip;
  - `frame(engine, alpha, view)`: when `s` (the stage state object), `s.worldRev` or `s.carRev` changed: `renderer.setCar(s.sim.car)` and `view.wait(renderer.setWorld(s.world))`; follow `settings.surface`/`units`; `renderer.orbit` = title open; `renderer.camMode = s.cam`; `hud.debug.hidden = !s.wheels`; `renderer.sync(s.sim)`, `renderer.updateCamera(s.sim, view.dt)`, `hud.update(car)`, `ghud.update(<adapter over s>)`, toast while `phase === 'loading'` ("Building the track…") or a `toast` event's text until its engine-time deadline; body classes `scr-title`/`scr-play` (title open), `menuOpen` (pause or results open), `timed`, `onTrack`, `manual`; `save(s.settings)` when `settingsRev` changed; `renderer.render()`;
  - an `engine.events.on` listener → `ghud.event(e)`, and `ghud.reset()` on `state` events entering `title`, `loading` or `ready`; removed on exit;
  - `resize` and hidden-page listeners (hidden + `stage.pause` enabled → `engine.ui.tap('stage.pause')`); removed on exit.
- `src/menus.js`: `new GameHud({ now })`: with `now`, `later(name, ms, f)` stores a deadline `now() + ms / 1000` and `update()` runs due callbacks; without it, `setTimeout` as today (the old `main.js` keeps working) (#22).
- `src/entry.js`: `await R.init()`; read `rally-sim-settings` from `localStorage` (guarded); `boot(rallyGame({ bests: makeBests(storage ?? memoryStore()) }), rallyView({ save }), { args: { settings: normalizeSettings(saved), pad: q.has('pad') }, seed: (Math.random() * 2 ** 32) >>> 0, devices: devices(document) })` (#35: `?seed=`/`?lh-test` still win inside `boot`); remove `#loading`; `?debug=<screen>&mode=&n=` → `engine.debug.screen(...)`; `window.rally` = a thin alias `{ get engine(), get sim(), get settings(), state(), stepN(n), render(), screen(name, opts) }` (kept until R9).
- `index.template.html` (old path must keep working):
  - `:root { --sa-t: var(--lh-sa-top, env(safe-area-inset-top, 0px)); … }` for all four sides (#31);
  - `data-lh-slot` on every control listed in the shared interfaces: `#pauseBtn` (`stage.pause`), the title `data-title` buttons (`title.<key>.<value>`), `#seedInput` (`title.seed`), `#diceBtn`, `#menuBtn` (`title.settings`), `#driveBtn`, `#resumeBtn`/`#restartBtn`/`#setBtn`/`#quitBtn`, `#retryBtn`/`#newSeedBtn`/`#menuBtn2` (`results.menu`), the sheet's `data-set` buttons (`settings.<key>.<value>`), `#closeSheet`;
  - engine-path CSS scoped under `html[data-lh-scene]`: `#steerBase { width: calc(2 * var(--lh-r) + 56px); margin: -28px 0 0 calc(-1 * var(--lh-r) - 28px); }`, `#steerZone[data-lh-active] #steerHint { opacity: 0 }`; and `.pedal[data-lh-down]` next to each `.on` rule.
- `dev.mjs`, `build.py`: entry from `RALLY_ENTRY` (default `src/main.js`; the dev template plugin's filter follows the entry); `package.json`: `"test:e2e": "node --test test/e2e.browser.mjs"`.
- `test/serve.mjs`: `serveRally({ entry = 'src/main.js' }) → { url, close }`: esbuild bundle (iife, `.json` loader) into `build/e2e/`, the template with the bundle inlined as `build.py` does, a static `http` server on a random port.

- [ ] **Step 1: Write the failing browser test** (`test/e2e.browser.mjs`; skips without Chromium like the engine's e2e):
```js
// Real-Chromium flow on the engine browser half (lion-hawk 2c-rally). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState, expectTappable } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

const ENTRY = process.env.RALLY_ENTRY ?? 'src/entry.js'; // R8 switches the default to src/main.js
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // devices update per frame
const SETTINGS = { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'e2e1' } };
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: title → Drive → countdown → running, keyboard pause and resume', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  try {
    await expectScene(game, 'stage');
    await expectState(game, 'phase', 'title');
    await expectTappable(game, 'title.drive');
    await game.tap('title.drive');
    await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1); // a tap shorter than a frame is latched (#13)
    assert.deepEqual((await game.scene()).overlays, ['pause']);
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    assert.deepEqual((await game.scene()).overlays, []);
    assert.equal(await game.page.evaluate(() => document.body.classList.contains('scr-play')), true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it:** `npm run test:e2e`. Expected: FAIL (no entry yet).
- [ ] **Step 3: Implement** the files above. **(judgment)**:
  - `Renderer.updateCamera` with `view.dt === 0` (hook renders under `?lh-test`) must not snap or divide by zero; frames from the driver carry the real `dt`.
  - The `GameHud` adapter maps `phase` to the `state` field it reads, plus `timed`, `mode`, `time`, `lapTime`, `clockOn`, `laps`, `best`.
  - Keyboard `preventDefault` now covers every bound key, as the old code did for arrows and Space; the text-field guard keeps the seed input typable.
  - Behaviour changes accepted and logged: largest-value merge instead of touch override (#29); every pad merged (#30); the Pause chip shows `disabled` after a finish (its `when`).
- [ ] **Step 4: Run** `npm run test:e2e` (passes), Rally `npm test`, the workspace suite, and both builds: `python3 build.py` (old path) and `RALLY_ENTRY=src/entry.js python3 build.py`, discarding `site/exp` each time. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/rally/src/devices.js games/rally/src/game.view.js games/rally/src/entry.js games/rally/src/menus.js games/rally/index.template.html games/rally/dev.mjs games/rally/build.py games/rally/package.json games/rally/test/serve.mjs games/rally/test/e2e.browser.mjs && git commit -m "feat(rally): engine browser entry with devices and the stage view half (alongside the old main)"`

---

### Task R6: Browser half part 2: title, pause, results and settings view halves

Field note #18.

**Files:** `src/game.view.js`, `test/e2e.browser.mjs`.

**Interfaces** (`rallyView` gains `title`, `pause`, `results`, `settings` halves; all content comes from `engine.scene.state`, the stage's state):
- `title`: `#title.free` while mode is free drive; `#modeHelp` text (the `HELP` table moves from `menus.js` into `game.view.js`); `#titleBest` from `s.titleBest`; the seed form's `submit` is prevented and blurs `#seedInput` (its `change` commits through the adopted field); on exit, blur the focused element (today's `play()`).
- `pause`: show `#pause`; `#restartBtn.hidden = !s.world.track`; the lap list for lap modes; focus `pause.resume`; hide on exit.
- `results`: show `#results`, fill `#resTime`, `#resDelta`, `#resSplits` from `s.result` (today's `Menus.showResults`); focus `results.retry`; hide on exit.
- `settings`: show `#sheet`; hide on exit. (`padOnly`/`trackOnly` already follow `body.onTrack`; `body.manual` follows `settings.gearbox` in the stage half.)

- [ ] **Step 1: Write the failing browser tests** (append to `test/e2e.browser.mjs`):
```js
test('desktop: settings sheet, a title choice rebuilds the track, results card, Retry with Enter', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  try {
    await game.tap('title.settings');
    assert.equal(await game.page.locator('#sheet').isVisible(), true);
    await game.tap('settings.units.kmh');
    assert.equal(await game.page.locator('#unit').textContent(), 'km/h');
    await game.tap('settings.close');
    assert.equal(await game.page.locator('#sheet').isVisible(), false);
    await game.tap('title.theme.winter');
    await game.until(s => s.phase === 'title', { maxSteps: 120 });
    await game.page.waitForFunction(() => window.engine.settled());
    await game.fill('title.seed', 'e2e2');
    await game.until(s => s.phase === 'title' && s.seed === 'e2e2', { maxSteps: 120 });
    await game.page.focus('[data-testid="title.mode.stage"]');
    await game.page.keyboard.press('Enter'); await frames(game); await game.step(2);
    await expectState(game, 'phase', 'title'); // Enter on a focused button only clicks it, no confirm/Drive (#15)
    await game.jump('stage', 'results', { time: 100, best: 101 }, { settings: { mode: 'stage', seed: 'e2e2' } });
    await game.render();
    assert.equal(await game.page.locator('#resTime').textContent(), '1:40.00');
    await expectTappable(game, 'results.retry');
    await game.page.keyboard.press('Enter'); await game.render(); // the focused Retry clicks
    await expectState(game, 'phase', 'ready');
    assert.deepEqual((await game.scene()).overlays, []);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it:** `npm run test:e2e`. Expected: the new test FAILS; R5's passes.
- [ ] **Step 3: Implement** the four halves. **(judgment)** If Enter on the focused title choice starts a run, the E1 guard isn't seeing the adopted `<button>` as the event target (focus must be on the button itself, not a wrapper).
- [ ] **Step 4: Run** `npm run test:e2e`, Rally `npm test`, the workspace suite, both builds (discard). Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/rally/src/game.view.js games/rally/test/e2e.browser.mjs && git commit -m "feat(rally): title, pause, results and settings view halves on the engine path"`

---

### Task R7: Port `test/mobile.mjs` to `lion-hawk/playwright` on the engine entry

Field notes #31, #32.

**Files:** `test/mobile.mjs`, `package.json` (`test:mobile` unchanged name).

**Interfaces:** `node test/mobile.mjs [filter]` builds and serves the entry itself (`serveRally({ entry: process.env.RALLY_ENTRY ?? 'src/entry.js' })`, R8 changes the default), so it no longer needs `npm run dev`. Same 7 devices, as `openGame` custom presets: `{ ...devices[name], userAgent: undefined, safeArea: { top, right, bottom, left } }` from today's insets. Same checks by name and threshold (`MIN_BTN` 56, `MIN_TAP` 44, `SWIPE_EDGE` 20, thumb reach, overlaps, slider behaviour, menus fit), with these substitutions:
- open: `openGame(browser, url, { preset, settings: { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'mobile12' } }, query: world === 'pad' ? { pad: '' } : {} })` (waits for `ready` and `settled`; no `waitForTimeout`);
- title selectors: `[data-testid="title.drive"]`, `[data-testid="title.settings"]`, `[data-testid="title.mode.timeAttack"]`; pause/results buttons by their test ids;
- `rally.debug.screen('running')` → `game.jump('stage', 'running', {}, { settings })`, `'paused'` / `'results'` likewise; `rally.debug.split(2, -0.42)` → `page.evaluate(() => window.engine.debug.split(2, -0.42))` then `game.step(1)`; `rally.debugPause()/debugResume()` → nothing (`?lh-test` is manual);
- control readout: `out()` = `game.step(1)` then `page.evaluate(() => window.engine.input.read())`; `rally.controls.steerRange()` → `Math.max(60, Math.min(110, W * 0.12))`;
- touches: `game.touch.start/move/end` where they keep the meaning; **(judgment, #32)** for "gas released → 0, steering still held", first try `game.touch.end(2)`; if that check fails, the engine helper's `touchEnd` semantics are wrong for partial lifts: fix `testing/playwright.js` in the engine repo (with its unit test) in a separate engine commit `fix(playwright): touchEnd lists …`, rerun the engine suite, and record the outcome in field note #32;
- the hidden-page check dispatches `visibilitychange` as today and reads `window.engine.input.read()` after `game.step(1)`;
- `SHOTS=dir` still saves screenshots (`game.render()` before each).

- [ ] **Step 1: Port** the script as above, keeping its `check()`/summary/exit-code style.
- [ ] **Step 2: Run** `npm run test:mobile`. Expected: all checks pass on all 7 devices (pad + stage). Record the check count in the commit body (727 at 0.3.1; a different count is fine only where a check was replaced one-for-one or a selector now matches a test id).
- [ ] **Step 3: Run** Rally `npm test`, `npm run test:e2e`, the workspace suite. Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/rally/test/mobile.mjs games/rally/package.json && git commit -m "test(rally): mobile layout and touch suite on lion-hawk/playwright and the engine entry"` (plus the engine fix commit if #32 needed one).

---

### Task R8: Flip the entry; delete the old browser path

Field note #34.

**Files:** `src/entry.js` → `src/main.js` (`git mv` after deleting the old `main.js`), `src/ui.js` (keep `Hud`, delete `Controls`), `src/menus.js` (keep `fmtTime`, `fmtDelta`, `GameHud` on the engine clock only; delete `Menus`), `src/game/game.js` (delete), `test/browser.py` (delete), `dev.mjs`, `build.py`, `test/e2e.browser.mjs`, `test/mobile.mjs` (default entry `src/main.js`), `index.template.html` (drop the old-path-only CSS: the inline-style fallbacks for `#steerBase`, `.on` pedal rules, `body.steering`; un-scope the `html[data-lh-scene]` rules).

- [ ] **Step 1:** `git rm games/rally/src/main.js games/rally/src/game/game.js games/rally/test/browser.py`, `git mv games/rally/src/entry.js games/rally/src/main.js`; remove `RALLY_ENTRY` handling from `dev.mjs`/`build.py` (back to `src/main.js` only); default the test entries to `src/main.js`.
- [ ] **Step 2:** Remove the dead code (`Controls`, `Menus`, `GameHud`'s `setTimeout` branch) and the old-path CSS. `grep -rn "rally\.\(debug\|controls\|game\|menus\)\|Controls\|Menus\|new Game\b" games/rally/src games/rally/test` → only `window.rally`'s thin alias in `main.js` remains.
- [ ] **Step 3: Run** Rally `npm test`, `npm run test:e2e`, `npm run test:mobile`, the workspace suite, `python3 build.py` (discard `site/exp`). Then a manual look: `npm run dev`, open `http://localhost:8740/` on desktop: title, Drive, countdown, a few corners with the keyboard, Esc pause, Restart, finish screen via `window.engine.debug.screen('results')`. Expected: all pass; nothing looks different from the old build except the disabled Pause chip after a finish.
- [ ] **Step 4: Commit** (four43 worktree): `git add -A games/rally/src games/rally/test games/rally/dev.mjs games/rally/build.py games/rally/index.template.html && git commit -m "refactor(rally): boot the engine browser half; remove the old frame loop, Controls, Menus and Game"`

---

### Task R9: Remove `window.rally`; Rally docs

**Decision (ruling 7):** `window.rally` is **removed**, not reduced: [D-5] keeps aliases until a game finishes phase 2, which Rally does here; `window.engine` (`debug`: `sim`, `settings`, `screen`, the HUD fakes; `jump`, `state`, `stepN`, `render`) covers every use, and no test reads `window.rally` after R7.

**Files:** `src/main.js`, `docs/spec/rally-spec.md` (Controls: the engine devices and the press latch; UI: registry controls with test ids; Debug hook → `window.engine`; validation targets incl. the flow test), `docs/spec/tracks-spec.md` (T-20: pause is an overlay, results open on engine time; T-26: debug hooks are presets and `engine.debug`; T-27: `test/flow.test.mjs`, `test/game.mjs` on the engine, `test/mobile.mjs` self-serving), and in the engine repo `docs/field-notes.md` (statuses: `planned` → `done` for #6 (Rally part), #7, #13–#24, #31, #34, #35; #32 per R7's outcome).

- [ ] **Step 1:** Delete the alias from `src/main.js`; `grep -rn "window\.rally\|rally\.\w" games/rally/src games/rally/test games/rally/index.template.html` → nothing.
- [ ] **Step 2:** Update the Rally docs as listed (facts only: what moved where, test ids, how to jump to a screen).
- [ ] **Step 3: Run** Rally `npm test`, `npm run test:e2e`, `npm run test:mobile`, the workspace suite, `python3 build.py` (discard `site/exp`). Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/rally/src/main.js games/rally/docs/spec/rally-spec.md games/rally/docs/spec/tracks-spec.md && git commit -m "feat(rally): drop the window.rally alias; specs describe the engine scenes, controls and hooks"`; (engine repo) `git add docs/field-notes.md && git commit -m "docs: field notes after the Rally migration"`.

---

## Self-review notes (for the reviewer)

- Engine additions are each used by a named Rally task: E1 → R5 (`KEYS`, `RAMPS`, latch for shift/pedal taps, Enter on Retry in R6); E2 → R5 (`PAD`); E3 → R5 (slider, pedals); E4 → R3 (choices, seed field), R5/R6 (slots), R6/R7 (`game.fill`); E5 → R5 (`view.dt` camera, `view.wait` track view, `settled` in R6/R7).
- Not added (Rally doesn't need them): additive `onRender` (#10), an async `init` option on `boot` (#6), `ctx.on`, the command channel (#5), `ui.hold`, `inert` covered controls, `maxFrame` validation.
- Names used across tasks: `rallyGame`, `ACTIONS`, `makeStage → { scene, api }`, `makeOverlays(api)`, `autopilotPolicy`, `normalizeSettings`, `newSeed`, `memoryStore`, `makeBests`, `Sim.dispose`, `steerRange`, `steerRamp`, `KEYS`, `RAMPS`, `PAD`, `devices`, `rallyView({ save })`, `serveRally({ entry })`, `view.dt`, `view.wait`, `ui.choice`, `ui.field`, `engine.ui.fill`, `h.fill`, `game.fill`, `data-lh-slot`, `data-lh-active`, `data-lh-down`, `--lh-r`.
