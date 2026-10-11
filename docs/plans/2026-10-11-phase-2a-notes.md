# Phase 2a: outcome, rulings and carry-overs

Status: done on engine branch `phase-2a` (0.2.0). Engine only; the games are untouched. Not merged or pushed. Suites: engine 111, workspace 4, Pig Pens 2, Tractor Pickup 726.

## What landed
- `createSchedule`: named stages; systems are ordered by rank (the earliest system they must precede), then by insertion order.
- `createLoop`: fixed step, catch-up cap with dropped time counted, alpha, `stepN` and `advance`.
- `actions` and `createInput`: device, once and held layers; button edges; `apply()` allocates nothing.
- `createUi`: test ids `<scene>.<id>`, a tree, and taps (covered taps throw).
- `defineGame` and `createEngine`:
  - scenes and overlays, with transitions queued while busy and drained in order, keeping only the last `go`;
  - rollback when `enter` fails;
  - scoped `ctx.system`;
  - live `scene` and `time` views;
  - `rng` streams cached per name;
  - a `setup` hook;
  - built-in `lh.*` systems.
- `headless()`: policies, `until`, `untilEvent` and `untilScene` with explanatory failures, and an unbounded event log per handle (`h.events`).
- The countdown example game fixture.

## Rulings (each with its cost if wrong)
1. Phase 2 is split into 2a (headless core), 2b (browser half) and 2c (game migrations). Cost: none.
2. Two plan defects were fixed before dispatch: the `time.sim` precision, and the policy index.
3. Schedule order uses the rank rule. A random comparison against a reference found 0 mismatches over 4424 graphs.
4. `schedule.run(stage, a, b)` takes explicit arguments. The scene and time views are live objects, so don't store them expecting a snapshot.
5. Scene changes requested while busy are queued. A throwing step still applies the changes queued before the throw, flushes events, advances the step and rethrows. This supersedes an earlier "discard" ruling.
6. Overlaying a scene that is already open, or pending, throws at the call site.
7. While a pausing overlay is open, all stages freeze and only overlays at or above the topmost pausing one step.
8. **Carried into phase 2b, Task 1:**
   - `setup` and the start scene's `enter` must go through the transition queue. Today a `go` from either runs nested.
   - The duplicate check must project the queue, so that `close p; overlay p` works.

## Deferred
- **To 2b:**
  - a `scene` event for the initial scene;
  - `T-1` `clock`/`record` options; `T-4` `expectEvents`; `T-6` `fixtures.define`, `h.use`, `warm:N`;
  - a probe of the `HeapNumber` allocation for non-integer axes;
  - `maxFrame` validation.
- **Leave:**
  - the loop's EPS clamp count;
  - a throwing step leaves the loop's `acc` partly consumed;
  - `close()` on an overlay that isn't open does nothing;
  - overlays can't return results to the scene that opened them (use ack events);
  - a failed `go` leaves no main scene.

## Design inputs for 2c (from the final review)
- **Rally:**
  - The world survives title → run. Use one `stage` main scene with sub-states, and title, pause and results as overlays. Results must not pause, because the car keeps rolling.
  - `restart()` is a method or preset inside the scene, not a scene change.
  - Loading is async: a scene's `enter` is synchronous, so an async-load protocol is needed (S-6), plus a synchronous path for headless runs.
  - The `state` events remain the game's own.
  - The input gate becomes an `input.apply` system after `lh.input`.
  - Assert that `DT` equals `1/hz` (240).
- **Tractor Pickup:**
  - The farm main scene gets non-pausing show and reward overlays.
  - View acks need `ctx.on(type, fn)`, auto-removed on exit.
  - Menu mode is a separate axis.
  - Wrap `game.step` as a single system at first.
  - Network messages need a recorded command channel.
  - A pausing overlay must never freeze a networked sim.
  - Keep `makeRng` streams for golden parity.
  - Initialise Rapier before `createEngine`.
- **Pig Pens:**
  - `driving`, `tool` and `selected` move out of the view.
  - The tool picker needs a choice control.
  - Positional interactions (tap, drag, hose, toss) need a command/pointer input channel for replays.
  - `maxFrame` should be 0.1 and `maxCatchUp` 4.
  - It needs a per-frame "events since last frame" that doesn't allocate.
  - `setTimeout`, `performance.now` and `Math.random` in the view move to engine time and `engine.rng('fx')`.
