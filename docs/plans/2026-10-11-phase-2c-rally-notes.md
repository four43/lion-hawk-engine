# Phase 2c-rally: outcome, rulings and carry-overs

**Status:** done. Rally runs on the Lion Hawk engine (0.4.0) through `defineGame` and `boot`.
- **Engine:** branch `phase-2c`.
- **Rally:** four43 `feat/lion-hawk`, from `a39cbaf` to `91632f6`.
- Not merged, pushed (four43) or deployed. `site/exp/rally` still holds the old bundle, so rebuild before any deploy.

## What landed
- **Engine 0.4.0:**
  - an input latch for presses shorter than one step;
  - keyboard function ramps, `shift+` chords, release by `e.code`, and Enter/Space left to focused buttons;
  - gamepad curves and multi-bindings;
  - a touch slider mode and adoption of existing markup;
  - `ui.choice` and `ui.field` controls plus `fill`;
  - `data-lh-slot` adoption and delegated clicks;
  - `view.dt` and `view.wait`;
  - Playwright `touch.end` lifts only the given fingers.
- **Rally:**
  - `game.sim.js` with a `stage` scene that owns the world, plus title, pause, results and settings overlays;
  - menus are registry controls; presets replace `window.rally.debug`;
  - devices preserve the feel exactly (keyboard: 0.000 difference at 144, 60 and 30 Hz; pad: ≤1e-16; pedal dt capped at 0.1 s);
  - view halves and an engine entry; the old `main.js` browser path, `Controls`, `Menus`, `Game` and `browser.py` are deleted; `window.rally` is removed.
- **Behaviour parity:** the old `Game`+`Sim` and the new engine path give bit-identical stage and time-attack results under a 60 Hz autopilot.
- **Tests:**
  - unit tests (`game.mjs` with 67 checks on `headless()`, flow 11+ tests, devices, purity);
  - two goldens: `Sim`-direct, plus a new stage-scene golden through the engine;
  - e2e 4/4 in Chromium; mobile 797 checks (was 727).
- **Size:** Rally `src` went from 4,123 to 4,316 lines (+193, of which +81 is the autopilot moving from `test/` into `src`). It is cleaner (one flow owner, headless-testable, no wall-clock timers in the sim), but not smaller. Most of its remaining workarounds are engine gaps scheduled for phase 2d.

## Rulings (each with its cost if wrong)
1. **Rally is the pilot.** Its world lives in a single `stage` main scene; menus are overlays; results don't pause.
2. **No async init option on boot.** `main.js` awaits `RAPIER.init()` before calling `boot`.
3. **`window.rally` is removed, not reduced.**
4. **Accepted feel changes:**
   - touch steering no longer overrides keyboard or pad steering; the largest input wins (#29);
   - all connected pads are merged (#30);
   - Camera and Wheels fire on press;
   - the Reset chip no longer cancels on pointerleave.
5. **Hidden-page auto-pause applies only to timed runs,** restoring the old behaviour.
6. **Typing a seed then tapping Drive** queues the start after loading, so one tap is enough.
7. **R9 was reviewed inside the final whole-plan review,** not in its own task review. Cost: one fewer review seat.

## Carry-overs
- **To the phase 2d engine round** (plan `2026-10-11-phase-2d.md`):
  - #5 commands and pointer input;
  - S-6 loading with a render-ack (#6, #21, #38);
  - overlay and UI ergonomics (#36, #39, #45, #46, #9);
  - device correctness (#41, #42, #44, plus the E1–E3 minors);
  - #10 multi-slot `onRender`;
  - #11 three/Rapier aliases;
  - #37/#26 `policy.every`;
  - #47 and #48 test tooling;
  - Rally adopting all of the above.
- **Final pass (Rally):**
  - `poseAt` duplication;
  - an unused `live()` parameter;
  - untested `ready`/`loading` presets;
  - flow gaps (confirm, pad A, `toTitle` via loading);
  - duplicate `pick`/`opts` helpers;
  - On/Off labels;
  - `title.enter` is not idempotent;
  - focus when settings opens from the title;
  - `Sim.dispose` untested;
  - a stale `window.rally` comment in `debugHook.js`;
  - body classes duplicate `data-lh-*`.
- **Needs a playtest (user):**
  - Rapier 0.21 feel: harsher hull strikes, stages about 0.5% slower;
  - the accepted feel changes above;
  - menus on a real iPhone or iPad.
