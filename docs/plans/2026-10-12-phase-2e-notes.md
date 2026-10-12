# Phase 2e (Pig Pens): outcome, rulings and carry-overs

**Status:** done.
- **Engine:** 0.6.0 on branch `phase-2e`.
- **Pig Pens:** on four43 `feat/lion-hawk`, `4f7f364..6a39bd7`, running on `defineGame` + `boot`; `window.piggies` removed.
- Not merged, pushed (four43) or deployed. Run the real `build.py` before any deploy (see ruling 3).

## What landed
- **Engine 0.6.0:**
  - `bindPointer` passes the phase to `at()`;
  - `bindStick({ origin: 'centre' })`;
  - `invariants.finite`;
  - Playwright `game.point`.
- **Pig Pens:**
  - pure analytic picks (match three.js exactly on 100k rays);
  - a `farm` scene that owns the world;
  - every tool is a recorded `tool` command carrying camera rays, so a replay reproduces a whole session;
  - drive mode;
  - the print-only scripts became asserted tests with two-sided bounds;
  - view, camera rig, HUD and devices;
  - e2e 6/6 (2 desktop, 4 iPhone).
- **Parity:** the engine path reproduces `farm-seed3` bit for bit, confirmed with a full-precision `deepStrictEqual`. A line-by-line review against the old `main.js` found no unflagged player-facing regression.
- **Size:** Pig Pens `src` grew from 2763 to 3146 lines. The 715-line `main()` became a 20-line entry plus explicit sim, view and device halves. It is cleaner, not smaller. The growth sits mostly in `farm.js`'s gesture state machine and `rig.js`'s second pointer tracker, which are engine candidates (#59, a gesture helper).

## Rulings (each with its cost if wrong)
1. **Design calls accepted from the planner:**
   - a fixed-centre pad (`origin: 'centre'`);
   - commands carry rays, and the sim does all picking;
   - the grab ease moves into the sim;
   - the default seed stays 1;
   - no overlays.
2. **Holding H honks once per press,** where the old game honked on key repeat. Accepted, and on the playtest list.
3. **No real `build.py` run.** The auto-mode classifier blocked discarding tracked `site/exp` output, so verification bundles into the scratchpad with `build.py`'s esbuild flags. The controller did not run the blocked action on the implementer's behalf. Cost: the real `site/exp` bundle for Pig Pens still holds the old build until the user runs `build.py`.
4. **P9–P10 were reviewed inside the final whole-plan review.**

## Playtest list (Pig Pens)
- the grab ease path;
- a drive key held before entering drive now counts, and W+S or A+D cancel to 0;
- Feed is rate-limited to 11 steps (was 180 ms);
- the hose eases per step;
- the press ring appears one step late, and a long press fires later below 10 fps (#56);
- `pointercancel` no longer taps;
- a gesture keeps the tool it started with;
- H honks once per press;
- audio unlocks on any tap or key except Escape;
- the Get out button is 42 px tall, under the 44 px guideline: restyle it in the final pass (#63).

## Carry-overs
- **Final pass:**
  - Get out to ≥44 px, and switch its check to a plain `expectTappable`;
  - the hose `move` commands aren't covered by an assertion (only `down` is);
  - `game.state().pressing` stays true during an orbit;
  - the HUD builds a selection key string every frame.
- **Engine round before Tractor Pickup (phase 2f plan):**
  - the network command contract;
  - `ctx` passed to callbacks (#69); `h.debug` (#70); events flushed on read (#71);
  - a farm rebuild test;
  - a world-frame stick map hook;
  - #56 press on uncapped time and the #59 gesture helper;
  - #68 exact goldens; #73 project depth; #74 `initScript`;
  - `assertFinite` on cycles, Map and Set.
