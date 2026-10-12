# Changelog

## 0.5.0 — 2026-10-12

Phase 2d, the engine round from the Rally field notes.

- Commands and replay (#5, #49, T-9): `engine.command(type, data)`, game-wide handlers (`defineGame({ commands })`) and scene handlers (`ctx.command`), delivered FIFO by `lh.commands` at the next step's `input.apply`; a command no handler ran is dropped (`engine.commands.dropped`), and handlers of scenes covered by a pausing overlay are skipped, so network messages and view acks belong in game-wide handlers. `h.command`, `game.command` and `window.engine.command`. `headless(game, { record: true })` records external ops and input changes as a plain-JSON tape (`h.tape()`: `v`, `game`, `seed`, `scene`, `args`, `hz`, `log`, `end`, `sums`); `replay(game, tape)` re-feeds it, sets the recorded input at every step and names the first checkpoint that differs. Command data, scene args and jump opts must be plain JSON while recording.
- Pointer: `bindPointer` turns world-position taps, drags and long presses into commands (filters, capture, window routing, second-finger cancel, coalesced moves); `window.engine.view.project` is wired from `view.project`, which the game's view half sets.
- Loading and acks (S-6, #6, #21, #38): `ctx.load({ build, then, hold, frames, settle, label })` suspends the scene's step and builds after `hold` seconds and `frames` presented frames, then waits (with `settle`) for a frame after the build and no `view.wait`; `engine.loading` (with `blocks`), `engine.block`, `engine.onBuilt` (and the view half's `built`), `engine.onPresent`, `engine.time.frames`, `h.untilLoaded`; `settled()` is false while a load is active. Step acks in headless and `?lh-test`, frame acks in a browser boot. Frames drawn before the request do not count.
- UI (#9, #36, #39, #45, #46): `ui.hold` (hold-to-fire on engine time, `--lh-progress`, `data-lh-down`), `engine.ui.press/release`, `h.press/unpress`, `game.press/unpress`; `engine.isOpen(name, { pending })`; `engine.ui.enabled` and `tryTap` (`h.enabled`, `h.tryTap`); `view.focus(testid)` (gives up after 5 refreshes); controls press actions and scenes own transitions (documented).
- Devices (#41, #42, #44): two taps between two steps now give two presses (owed presses per source); `bindHold` prevents focus by default (`focus: true` restores it); devices get frame time capped at `maxFrame`; stick, gamepad and field minors (`preventDefault` option, bad `radius()` guard, curves not applied at rest, IME-safe Enter in fields, released `aria-pressed`, hold release on blur and key up).
- Render slots and build (#10, #11): `engine.onRender` is additive and returns an unsubscribe (`boot` keeps its own slot); `lion-hawk/build` exports the esbuild `dedupe({ root })` plugin.
- Policies (#26, #37, #40): `policy.every(n, fn, { phase })`, a per-handle scratch object (`fn(h, i, scratch)`), `policy` exported from `lion-hawk/sim` (still re-exported by `lion-hawk/test`), `stripComments` exported from `lion-hawk/test`.
- Tooling (#47, #48): `?lh-test=render` and `driver.manual('all')` (no step, no render); `openGame(…, { render: 'manual' })` and `testUrl`; `expectTappable`, `expectFitsSafeArea` and `expectNoOverlap` take a string, `{ testid }`, `{ css }` or a Playwright locator. Fixes: `game.press` keeps the active touches down, `bindPointer` and the hold DOM review minors.
- Behaviour changes: two taps between steps give two presses (#41); `bindHold` prevents focus by default (#42); devices get capped dt (#44); a boot outside `?lh-test` acks real frames; view halves enter after the UI sync.

## 0.4.0 — 2026-10-11

Phase 2c-rally, the engine additions Rally's migration needs.

- Input latch: a button press shorter than a step (a tap between two applies) still reads `pressed` on the next step and is released after it, so no tap is lost.
- Keyboard: ramps may be functions of time, `shift+` chords bind separately from the plain key, a key releases by `e.code` (so Shift up or a layout change can't leave it stuck), taps latch, and Enter/Space on a focused button are left entirely to the button (the browser clicks it; the key no longer also drives its action), a behaviour change from 0.3.0.
- Gamepad: per-axis response curves, and several bindings per button.
- Touch: slider mode (`bindStick` with `axis: 'x' | 'y'` as a one-axis slider), a function radius, an adopted base/knob from game markup, `data-lh-active` while a finger is down on the stick and `data-lh-down` on held buttons.
- UI: `ui.choice` (one of N) and `ui.field` (text), `fill` on `engine.ui`, the hook, `h.fill` (headless) and `game.fill` (Playwright); the DOM renderer adopts game markup marked `data-lh-slot` instead of creating its own, and clicks are delegated from the document.
- View halves: `view.dt` (driver frame time, 0 for renders the driver didn't start) and `view.wait(promise)` (`settled()` and `data-lh-settled` hold until it settles; a rejection is reported into `errors`); `boot` returns `{ engine, driver, ui, hook, view, dispose }` and `installEngine` takes `busy`.

## 0.3.0 — 2026-10-11

Phase 2b, the browser half of the engine and its test tooling.

- `lion-hawk/view`: `boot` (engine + driver + devices + DOM UI + scene view halves, `?lh-test` manual mode), `defineView`, `installEngine` (the full `window.engine` hook: stepping, scenes, events, input, UI, errors, `settled`), the rAF driver (hidden-tab pause, manual mode), `createUiDom` (real `<button data-testid="<scene>.<id>">`), `bindKeyboard`, `bindGamepad`, `bindStick` and `bindHold` (touch, pointer events).
- `lion-hawk/playwright` (new): device `presets` with safe areas, `launch` (finds Chromium), `openGame` and the in-page `game` driver (`step`, `seconds`, `until`, `untilEvent`, `go`, `jump`, `input`, real `tap`, CDP multi-touch `touch.start/move/end`, `errors`), and the assertions `expectScene`, `expectState`, `expectTappable`, `expectFitsSafeArea`, `expectNoOverlap`.
- Countdown example game with a browser entry (`test/fixtures/countdown.view.js`) and a real-Chromium end-to-end test.
- Final-review fixes: the rAF driver survives a throwing device/frame/render (`onError` option, boot reports into `window.engine.errors`) and `start()` resets the loop; `bindHold` writes `1`/`0` for axis actions (and takes a `value` option; `engine.input.kinds` exposes action kinds); `bindStick` takes optional `x`/`y` (one required), a `surface` and a `parent` (the base is `position: fixed` under `body` by default); `bindKeyboard` lowercases binding keys, ignores ctrl/meta/alt chords and leaves Enter/Space alone on buttons; boot injects low-specificity `--lh-sa-*` safe-area variables (removed on dispose); under `?lh-test`, `?scene=` and `?args=<json>` choose the start scene (`openGame` takes `args` and waits for `settled()`); `data-lh-overlays` is space-separated and `data-lh-settled` is `1`/`0`.
- Fixes and changes carried over: carry-over fix (`setup` and the start scene's `enter` now go through the transition queue, so a start scene that calls `go()` leaves no systems or UI behind), per-source device input layers (keyboard, stick, hold and gamepad no longer overwrite each other; each is released on blur/hide/cancel), and scene instance ids (`scene.id`, `scene.overlayIds`) so view halves follow the real scene stack.

## 0.2.0 — 2026-10-11

Phase 2a, the sim half of the engine: the step schedule (named stages, before/after ordering), the fixed-step loop, input actions (axes and buttons), the UI registry, `defineGame`/`createEngine` with scenes and overlays, headless test helpers and input policies (`headless`, `policy`, `until`/`untilEvent`/`untilScene`, event lists), and the countdown example game fixture. `engine.scene` and `engine.time` are live views (persistent objects updated in place). Scene transitions requested during a step are queued and applied at its end, before the events flush. A scene whose `enter`/`ui` throws is rolled back, opening an already-open scene throws, scenes get scoped systems via `ctx.system` (removed on exit), and `jump` accepts scene args. Transitions are never re-entrant: a go/overlay/close/jump requested during a step or from inside another transition (an `enter` or `exit` hook) is queued and drained by the outermost transition or the end of the step, and only the last queued go (and what follows it) applies. `overlay(name)` of an open or already-pending scene throws at the call site; the step always finishes (drain, events flush, step++) and then rethrows. `engine.rng(name)` returns one cached stream per name. `engine.time` updates every step while the scene view only changes on transitions (R-8). `defineGame` takes an optional `setup(engine)` run once before the start scene, validates `sim.hz`/`sim.maxCatchUp` and passes `sim.maxFrame` (default 0.25) to the loop. While an overlay with `pauses` is open all stages stay frozen and only overlays at or above the topmost pausing one step; tapping a control below it throws `ui: control '<id>' is covered by '<overlay>'`. `state()` puts the game's keys first so `scene`/`overlays`/`step` win. Built-in systems are named `lh.input`, `lh.scene`, `lh.events`, and a stale remover cannot delete a re-added system. Headless handles keep their own unbounded event log, exposed as `h.events` (`of`/`first`/`count`/`types`/`since`), used by `since`, `until`, `untilEvent` and failure messages.

## 0.1.2 — 2026-10-11

Golden failure messages name the first diverging trail entry; devDependencies mirror the peers so the engine tests standalone.

## 0.1.1 — 2026-10-11

Peer dependencies three ^0.186 and Rapier ^0.21 (G-2).

## 0.1.0 — 2026-10-11

Phase 0: the headless core, the debug hook and the test helpers.

- `lion-hawk/sim` modules: `rng` / `fnv` (seeded, deterministic), `math` (vectors, quaternions, mat4 helpers), `events` (queued events with a ring log, `since(seq)`), `flags` (`parseFlags`, `FLAGS`), `ENGINE_VERSION`.
- `lion-hawk/view`: everything in sim plus `installEngineHook`, which installs `window.engine` as `{ version, game, …, debug }` — `version` and `game` are reserved; the game's own members (lifecycle, loop, state, …) and `debug` extras are merged in.
- `lion-hawk/test` helpers: `canonical`, `checksum`, `diff`, `assertFinite` (state comparison), golden files (`LH_BLESS` to bless, missing goldens fail in CI), and the purity scanner (`scanSource`, `scanPurity`) that keeps sim code free of three.js, the DOM, view imports, the wall clock and `Math.random`.
