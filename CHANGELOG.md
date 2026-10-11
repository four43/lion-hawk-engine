# Changelog

## 0.2.0 — 2026-10-11

Phase 2a, the sim half of the engine: the step schedule (named stages, before/after ordering), the fixed-step loop, input actions (axes and buttons), the UI registry, `defineGame`/`createEngine` with scenes and overlays, headless test helpers and input policies (`headless`, `policy`, `until`/`untilEvent`/`untilScene`, event lists), and the countdown example game fixture. `engine.scene` and `engine.time` are live views (persistent objects updated in place). Scene transitions requested during a step are queued and applied at its end, before the events flush. A scene whose `enter`/`ui` throws is rolled back, opening an already-open scene throws, scenes get scoped systems via `ctx.system` (removed on exit), and `jump` accepts scene args.

## 0.1.2 — 2026-10-11

Golden failure messages name the first diverging trail entry; devDependencies mirror the peers so the engine tests standalone.

## 0.1.1 — 2026-10-11

Peer dependencies three ^0.186 and Rapier ^0.21 (G-2).

## 0.1.0 — 2026-10-11

Phase 0: the headless core, the debug hook and the test helpers.

- `lion-hawk/sim` modules: `rng` / `fnv` (seeded, deterministic), `math` (vectors, quaternions, mat4 helpers), `events` (queued events with a ring log, `since(seq)`), `flags` (`parseFlags`, `FLAGS`), `ENGINE_VERSION`.
- `lion-hawk/view`: everything in sim plus `installEngineHook`, which installs `window.engine` as `{ version, game, …, debug }` — `version` and `game` are reserved; the game's own members (lifecycle, loop, state, …) and `debug` extras are merged in.
- `lion-hawk/test` helpers: `canonical`, `checksum`, `diff`, `assertFinite` (state comparison), golden files (`LH_BLESS` to bless, missing goldens fail in CI), and the purity scanner (`scanSource`, `scanPurity`) that keeps sim code free of three.js, the DOM, view imports, the wall clock and `Math.random`.
