# Changelog

## 0.3.0 — 2026-10-11

Phase 2b, the browser half of the engine and its test tooling.

- `lion-hawk/view`: `boot` (engine + driver + devices + DOM UI + scene view halves, `?lh-test` manual mode), `defineView`, `installEngine` (the full `window.engine` hook: stepping, scenes, events, input, UI, errors, `settled`), the rAF driver (hidden-tab pause, manual mode), `createUiDom` (real `<button data-testid="<scene>.<id>">`), `bindKeyboard`, `bindGamepad`, `bindStick` and `bindHold` (touch, pointer events).
- `lion-hawk/playwright` (new): device `presets` with safe areas, `launch` (finds Chromium), `openGame` and the in-page `game` driver (`step`, `seconds`, `until`, `untilEvent`, `go`, `jump`, `input`, real `tap`, CDP multi-touch `touch.start/move/end`, `errors`), and the assertions `expectScene`, `expectState`, `expectTappable`, `expectFitsSafeArea`, `expectNoOverlap`.
- Countdown example game with a browser entry (`test/fixtures/countdown.view.js`) and a real-Chromium end-to-end test.
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
