# Field notes: what the games teach the engine

This is a running log of oddities and challenges found while moving real games onto Lion Hawk. Each entry records:
- the game;
- what happened;
- the workaround used in the game;
- what the engine should change;
- its status: `open`, `planned` (in a plan), `done`, or `won't` (with the reason).

Add entries as you go. Don't wait for the end of a phase. Plans pull their engine work from the `open` entries.

## Index by theme

| # | Theme | Game | Status |
|---|---|---|---|
| 1 | Library upgrades change feel, and range checks don't notice | Rally | open |
| 2 | Rapier 0.21 wakes sleeping bodies on their first step | Rally | done (in-game) |
| 3 | One-sided range checks hide regressions | Rally | open |
| 4 | Flow state lives in the view | Tractor Pickup, Pig Pens | planned (2c) |
| 5 | Positional input can't be expressed as actions | Pig Pens, Tractor Pickup | open |
| 6 | Async loading vs synchronous scene `enter` | Rally, Tractor Pickup | open |
| 7 | The world must survive menu screens | Rally | planned (2c) |
| 8 | Device needs beyond axes and buttons | all | open |
| 9 | UI controls need more than a text label | Tractor Pickup, Rally | open |
| 10 | `onRender` is a single slot | all | open |
| 11 | Engine code must not import three/Rapier until builds alias them | all | open |
| 12 | Tests borrowed tools from a parent folder | engine | done |

## Entries

### 1. Library upgrades change feel, and range checks don't notice: Rally (Rapier 0.14 → 0.21)
- **What happened:**
  - Rapier's new contact defaults (prediction distance 0.002 → 0.02, max corrective velocity 10 → 3) make hull strikes harsher.
  - Stages run 0.2–1.2% slower, and one verge sample dropped from 54.2 to 25.6 km/h.
  - Every range check still passed.
- **Workaround:** Rapier's defaults were kept, the golden was re-blessed once with metrics, and the change is flagged for a playtest.
- **Engine change:**
  - The physics wrapper (phase 4) should pin integration parameters explicitly per game, so a library bump can't change feel silently.
  - Golden tests should record a "feel" sample set (stage times, bump speeds) alongside trajectories.

### 2. Rapier 0.21 wakes sleeping bodies on their first step: Rally
- **What happened:** marker posts created asleep woke up and fell over.
- **Workaround:** `TrackWorld.afterStep()` puts untouched new posts back to sleep after their first step.
- **Engine change:** `world.spawn({ body: { sleep: true } })` (E-5) must handle this itself.

### 3. One-sided range checks hide regressions: Rally `verge.mjs`
- **What happened:** the check `[-5, 55]` is effectively "speed must stay under 55 km/h". It can't detect a car that bogs down.
- **Engine change:**
  - The headless helpers should push tests toward two-sided expectations, or toward relative comparisons against a baseline.
  - Rally's check needs a real lower bound, decided after a playtest.

### 4. Flow state lives in the view: Tractor Pickup, Pig Pens
- **What happened:**
  - Tractor Pickup: `main.js` sets `g.mode = 'reward'`, and the sim waits on `showDone`/`rewardDone`, which come from view animations.
  - Pig Pens: `driving`, `tool` and `selected` live in `main()`'s closures.
- **Engine change:** scenes own flow (S-4). View animations end with an ack event, which needs scene-scoped listeners (`ctx.on`).

### 5. Positional input can't be expressed as actions: Pig Pens, Tractor Pickup
- **What happened:**
  - In Pig Pens, tapping a pig, drags, hose aim, toss and gate taps all carry world x/z.
  - In Tractor Pickup, network claims and host answers are messages, not axes or buttons.
- **Engine change:** a recorded command channel (`engine.command(type, data)`), applied at the step boundary and included in replays (T-9).

### 6. Async loading vs synchronous scene `enter`: Rally, Tractor Pickup
- **What happened:** `RAPIER.init()` and Rally's `await loadTrack()` are async, while scene `enter` is synchronous.
- **Engine change:** async init in `boot` before `createEngine`, plus a loading protocol (S-6) that has a synchronous headless path.

### 7. The world must survive menu screens: Rally
- **What happened:** Rally's title is "the menu over the live scene". If title were its own scene, `go()` would dispose the world (S-3).
- **Engine change:**
  - Rally uses one main `stage` scene, with title, pause and results as overlays.
  - Results must not pause, because the car keeps rolling.
  - Restart is a method inside the scene, not a `go`.

### 8. Device needs beyond axes and buttons: all
- **What happened:**
  - Rally: a horizontal-only steering slider whose range depends on the viewport; non-linear keyboard ramps; gamepad expo curves; Shift+R.
  - Tractor Pickup: point-to-go needs a 2D radial dead zone.
  - Pig Pens: a fixed stick, active only while driving; mouse tools must not start the stick.
- **Engine change:**
  - device options for curves, slider mode, modifiers, and `pointerType`/`button` filters;
  - scene-scoped devices;
  - a per-source vector merge for stick pairs.

### 9. UI controls need more than a text label: Tractor Pickup, Rally
- **What happened:**
  - Tractor Pickup's horn is an SVG button; its hold-to-fire button has a filling ring.
  - Rally's menus are rich HTML.
- **Engine change:** custom content in controls (icon or render hook), a `ui.hold` control on engine time, and keyboard/gamepad focus and activation of UI buttons.

### 10. `onRender` is a single slot: all
- **What happened:** a game calling `engine.onRender` after `boot` silently disables view-half frames.
- **Engine change:** make it additive and return an unsubscribe.

### 11. Engine code must not import three/Rapier until builds alias them: all
- **What happened:** the engine lives in its own repo with its own `node_modules`. A bare `import 'three'` in engine source would bundle a second copy of three.js.
- **Workaround:** a workspace test asserts that engine source imports neither.
- **Engine change:** the phase 3 CLI aliases three and Rapier to the game's copies.

### 12. Tests borrowed tools from a parent folder: engine
- **What happened:** the e2e test used esbuild from the old games workspace. It broke once the engine moved to its own repo.
- **Fix:** esbuild became an engine devDependency.
- **Lesson:** test standalone early.
