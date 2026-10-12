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
| 4 | Flow state lives in the view | Tractor Pickup, Pig Pens, Rally | done for Rally (2c-rally R2–R3); Pig Pens in progress (2e P2 farm scene 932f19a; P3–P4); Tractor Pickup open |
| 5 | Positional input can't be expressed as actions | Pig Pens, Tractor Pickup | done (2d D1, D3) |
| 6 | Async loading vs synchronous scene `enter` | Rally, Tractor Pickup | done (Rally 2c; S-6 protocol 2d D4) |
| 7 | The world must survive menu screens | Rally | done (2c-rally) |
| 8 | Device needs beyond axes and buttons | all | done for Rally's needs; Pig Pens' fixed pad done (2e P-E2, see #53; scene scope not needed); Tractor Pickup's radial pair merge and gamepad.mapping open |
| 9 | UI controls need more than a text label | Tractor Pickup, Rally | done (2c E4 adoption; 2d D6 ui.hold; custom content = adopted markup); keyboard/gamepad focus open |
| 10 | `onRender` is a single slot | all | done (2d D9) |
| 11 | Engine code must not import three/Rapier until builds alias them | all | done (2d D9: lion-hawk/build dedupe; games adopt with the phase 3 CLI) |
| 12 | Tests borrowed tools from a parent folder | engine | done |
| 13 | Short presses fall between steps | Rally | done (2c-rally) |
| 14 | Keyboard feel needs stateful ramps, chords and release by key code | Rally | done (2c-rally) |
| 15 | Enter on a focused button fires twice | Rally | done (2c-rally) |
| 16 | One pad button, two actions | Rally | done (2c-rally) |
| 17 | The touch steering slider is the game's own markup | Rally | done (2c-rally) |
| 18 | Rich menus vs. a registry of plain buttons | Rally | done (2c-rally) |
| 19 | View halves need the frame time | Rally | done (2c-rally) |
| 20 | Async view loads and `settled()` | Rally | done (2c-rally) |
| 21 | A loading toast needs a paint before a synchronous build | Rally | done (2c-rally; engine 2d D4: ctx.load hold) |
| 22 | Flow and HUD timers on `setTimeout` | Rally | done (2c-rally) |
| 23 | Pause was a state of the game's own state machine | Rally | done (2c-rally) |
| 24 | Browser-only defaults inside sim modules | Rally | done (2c-rally) |
| 25 | Presets can't step the engine to reach a state | Rally | open (worked around in 2c-rally R3) |
| 26 | Policies that run slower than the sim | Rally | done (2d D10) |
| 27 | Events are delivered after physics, not inside game logic | Rally | won't (documented; 2c-rally R4) |
| 28 | Sim objects live in the scene's `state` | Rally, Pig Pens | open (Rally R2 and Pig Pens P2 workarounds; phase 4 World) |
| 29 | "Active touch overrides" vs. largest-value merge | Rally | won't (accepted; 2c-rally R5) |
| 30 | First pad only vs. every pad merged | Rally | won't (accepted; 2c-rally R5) |
| 31 | Two sets of safe-area variables | Rally | done (2c-rally) |
| 32 | CDP `touchEnd` semantics disagree | Rally, engine | done (Rally was right; engine helper fixed, #43) |
| 33 | Every debug jump rebuilds the world | Rally | won't for now (2c-rally R3) |
| 34 | Stale browser tooling | Rally | done (2c-rally) |
| 35 | A fixed engine seed gives every visitor the same first track | Rally | done (2c-rally) |
| 36 | Can't ask "is this overlay open or pending?" | Rally | done (2d D5) |
| 37 | Policies have no per-handle state or rate | Rally | done (2d D10) |
| 38 | No "a frame has been drawn" signal for deferring heavy sim work | Rally | done (2d D4: frame acks, engine.onPresent) |
| 39 | A control can't both trigger an action and be gated | Rally | done (2d D5) |
| 40 | Determinism makes some comparisons meaningless | Rally | done for Rally (final-fix: run 2 perturbed); engine guidance done (2d D10) |
| 41 | The input latch drops a second tap if no step sees the key go up | Rally | done (2d D7) |
| 42 | `bindHold` lets the button take focus | Rally | done (2d D8) |
| 43 | Playwright `touch.end(id)` lifted the wrong finger | engine test helper | done |
| 44 | Device ramps use uncapped frame time | Rally | done (2d D7) |
| 45 | No query for "is this control enabled?" | Rally | done (2d D5) |
| 46 | An overlay view half's `enter` runs before `ui.sync()` | Rally | done (2d D5) |
| 47 | Under `?lh-test` the driver still renders every frame | Rally | done (2d D11) |
| 48 | `expectTappable` only accepts test IDs | Rally | done (2d D11) |
| 49 | Commands to a scene under a pausing overlay are dropped | engine, Tractor Pickup | done (2d D12: documented in spec I-7; watch in the Tractor migration) |
| 50 | Playwright until vs view.wait loads | Rally | done (0.5.1 final review) |
| 51 | policy.every restart on sim swap | Rally | done (0.5.1 final review) |
| 52 | `bindPointer`'s `at()` can't tell a move from a press | Pig Pens | done (2e P-E1) |
| 53 | A fixed-centre thumb pad vs the floating stick | Pig Pens | done (2e P-E2) |
| 54 | Screen-space aim offsets under a finger | Pig Pens | planned (2e P3, P6) |
| 55 | A tap acts on what was picked at pointer down | Pig Pens | planned (2e P3); engine won't |
| 56 | A long press on capped device time runs slow at low frame rates | Pig Pens | open (accepted in 2e; playtest) |
| 57 | A game-owned event queue next to engine events | Pig Pens | bridged (2e P2 932f19a: farm.events re-emits sim.events each step, no allocation); kit-herd open |
| 58 | The game's RNG and seed live outside the engine streams | Pig Pens | open (phase 4/7) |
| 59 | Camera gestures need a second pointer tracker on the same canvas | Pig Pens | open |
| 60 | Sim inputs computed per frame in the view | Pig Pens | in progress (2e P2 moved gesture/grab/hose/ring state into the farm scene; P3–P4) |
| 61 | `pointercancel` counted as a lift (a cancelled touch could tap) | Pig Pens | planned (2e P3) |
| 62 | Stale browser scripts and print-only tests | Pig Pens | planned (2e P5, P9) |
| 63 | Safe areas read `env()` directly | Pig Pens | planned (2e P6, P8) |
| 64 | No finite invariant before the World | engine, Pig Pens | done (2e P-E3) |
| 65 | No helper for mouse gestures on world points | engine, Pig Pens | done (2e P-E4) |
| 66 | The old loop zeroed its remainder after a capped frame | Pig Pens | won't (invisible) |
| 67 | Audio unlock needs a user-gesture hook | Pig Pens | open (audio service) |
| 68 | Goldens compare to 6 digits | Pig Pens | open |
| 69 | Control when/get receive the engine, not ctx | Pig Pens | open |

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

### 4. Flow state lives in the view: Tractor Pickup, Pig Pens, Rally
- **What happened:**
  - Rally: `main.js` owns the flow (`toTitle`, `drive`, `restart`, the results card shown by a 1.5 s `setTimeout`, the hidden-page pause); the `Game` class only owns the run's sub-states.
  - Tractor Pickup: `main.js` sets `g.mode = 'reward'`, and the sim waits on `showDone`/`rewardDone`, which come from view animations.
  - Pig Pens: `driving`, `tool` and `selected` live in `main()`'s closures.
- **Engine change:** scenes own flow (S-4). View animations end with an ack event, which needs scene-scoped listeners (`ctx.on`).
- **Status:** Rally part done in 2c-rally R2–R3; Pig Pens planned (2e P2–P4: `tool`, `selected`, `driving` and the per-gesture state in the `farm` scene's `ctx.state`; drive mode is farm sub-state); Tractor Pickup remains.

### 5. Positional input can't be expressed as actions: Pig Pens, Tractor Pickup
- **What happened:**
  - In Pig Pens, tapping a pig, drags, hose aim, toss and gate taps all carry world x/z.
  - In Tractor Pickup, network claims and host answers are messages, not axes or buttons.
- **Engine change:** a recorded command channel (`engine.command(type, data)`), applied at the step boundary and included in replays (T-9).
- **Status:** done (2d D1, D3).

### 6. Async loading vs synchronous scene `enter`: Rally, Tractor Pickup
- **What happened:** `RAPIER.init()` and Rally's `await loadTrack()` are async, while scene `enter` is synchronous.
- **Engine change:** async init in `boot` before `createEngine`, plus a loading protocol (S-6) that has a synchronous headless path.
- **2c-rally plan:** Rally's entry awaits `RAPIER.init()` before calling `boot` (no engine option: one `await` in the entry is all it needs). Track generation and the Rapier build are already synchronous, so the stage builds in `enter` and during a sim-side `loading` hold (#21). The async part that remains is the three.js track view (a dynamic import), which goes through `view.wait` (#20). S-6 itself stays open.
- **Status:** done (Rally 2c; S-6 protocol 2d D4): `ctx.load({ build, then, hold, frames, settle })` suspends the scene's step and builds in its slot; headless and `?lh-test` count every step as a presented frame, so the path stays synchronous; `settle` waits for `view.wait` (`engine.block`).

### 7. The world must survive menu screens: Rally
- **What happened:** Rally's title is "the menu over the live scene". If title were its own scene, `go()` would dispose the world (S-3).
- **Engine change:**
  - Rally uses one main `stage` scene, with title, pause and results as overlays.
  - Results must not pause, because the car keeps rolling.
  - Restart is a method inside the scene, not a `go`.
- **Status:** done (2c-rally R2).

### 8. Device needs beyond axes and buttons: all
- **What happened:**
  - Rally: a horizontal-only steering slider whose range depends on the viewport; non-linear keyboard ramps; gamepad expo curves; Shift+R.
  - Tractor Pickup: point-to-go needs a 2D radial dead zone.
  - Pig Pens: a fixed stick, active only while driving; mouse tools must not start the stick.
- **2c-rally plan:** Rally's needs land in E1–E3 (#13–#17): function ramps, `shift+` chords, release by `e.code`, press latching, gamepad curves and multi-binding, an x-only slider with a function radius. Still open: Tractor Pickup's radial pair dead zone and vector merge, Pig Pens' scene-scoped stick and pointer filters, `gamepad.mapping`.
- **Engine change:**
  - device options for curves, slider mode, modifiers, and `pointerType`/`button` filters;
  - scene-scoped devices;
  - a per-source vector merge for stick pairs.
- **2d:** pointer filters done (2d D3: `bindPointer` `filter`).
- **Status:** done for Rally's needs; Pig Pens' pad done (2e P-E2, `bindStick({ origin: 'centre' })`, #53). Pig Pens doesn't need a scene-scoped stick: `#drive` is `display: none` outside drive mode, so the pad gets no pointers, and the sim reads `throttle`/`steer` only while driving. Its mouse-vs-tool filter is `bindPointer`'s `filter.button`. Tractor Pickup's radial pair merge and gamepad.mapping open.

### 9. UI controls need more than a text label: Tractor Pickup, Rally
- **What happened:**
  - Tractor Pickup's horn is an SVG button; its hold-to-fire button has a filling ring.
  - Rally's menus are rich HTML.
- **Engine change:** custom content in controls (icon or render hook), a `ui.hold` control on engine time, and keyboard/gamepad focus and activation of UI buttons.
- **2c-rally plan:** E4 adds `ui.choice`, `ui.field` and slot adoption (#18); adopted elements keep the game's own content, which covers icon buttons. Still open: `ui.hold`, focus and gamepad activation of UI buttons.
- **Status:** done (2c E4 adoption; 2d D6 `ui.hold`; custom content = adopted markup): `u.hold({ id, label, seconds, action, when })` on engine time, `engine.ui.press/release` (recorded, replayable), `--lh-progress` and `data-lh-down` on the DOM button, Space/Enter on a focused hold; Tractor Pickup's SVG horn and ring ride on slot adoption. Still open: gamepad activation and focus navigation of UI buttons.

### 10. `onRender` is a single slot: all
- **What happened:** a game calling `engine.onRender` after `boot` silently disables view-half frames.
- **Engine change:** make it additive and return an unsubscribe.
- **2c-rally:** not needed: Rally renders from its `stage` view half's `frame`, never `engine.onRender`. Stays open for the other games.
- **Status:** done (2d D9): `engine.onRender(fn)` appends and returns an unsubscribe; `boot` keeps its own slot.

### 11. Engine code must not import three/Rapier until builds alias them: all
- **What happened:** the engine lives in its own repo with its own `node_modules`. A bare `import 'three'` in engine source would bundle a second copy of three.js.
- **Workaround:** a workspace test asserts that engine source imports neither.
- **Engine change:** the phase 3 CLI aliases three and Rapier to the game's copies.
- **Status:** done (2d D9: lion-hawk/build dedupe; games adopt with the phase 3 CLI): `dedupe({ root })` is an esbuild plugin (`tools/dedupe.js`) that re-resolves three and Rapier from the game's root. Today's builds use the esbuild CLI, which takes no plugins; the workspace purity rule stays until then.

### 12. Tests borrowed tools from a parent folder: engine
- **What happened:** the e2e test used esbuild from the old games workspace. It broke once the engine moved to its own repo.
- **Fix:** esbuild became an engine devDependency.
- **Lesson:** test standalone early.

### 13. Short presses fall between steps: Rally
- **What happened:** Rally queues key and pad presses as events (`controls.events`) and handles every one, however short. In the engine, devices write a level once per frame and `apply()` turns levels into edges once per step. A key pressed and released between two device updates, or a `bindHold` tap that starts and ends between two steps, is never seen. On a 120 Hz iPad with a 60 Hz sim this loses taps; Rally's shift buttons fire on `pointerdown` and are tapped fast.
- **Engine change (2c-rally E1):** `createInput` latches a button that any `device()` call set true since the last `apply()`, so it is down for that step even if it was released again. `bindKeyboard` reports a key tapped between two updates as held for one update. `hold`/`set` still override the latch.
- **Status:** done (2c-rally). 2d D7: several taps between steps each count (#41).

### 14. Keyboard feel needs stateful ramps, chords and release by key code: Rally
- **What happened:**
  - Rally's keyboard steering has a rate that grows with how long the key has been held (1.2 → 4.2 /s over 0.35 s), snaps through centre at 6 /s when reversing, and returns at 4.5 /s. The engine's `{ rise, fall }` ramps are constant rates and can't express it.
  - Rally binds R to reset and Shift+R to restart. The engine keyboard has no modifier bindings.
  - A shifted symbol key goes down as one character and comes up as another (`` ` `` / `~`), so releasing by `e.key` can leave it held.
- **Engine change (2c-rally E1):** a ramp may be a function `(value, target, dt, scratch) => value` with a per-axis scratch object; bindings may be `shift+<key>` (wins over the plain key while Shift is down); keys are released by `e.code` as well as `e.key`.
- **Status:** done (2c-rally).

### 15. Enter on a focused button fires twice: Rally
- **What happened:** in 2b, `bindKeyboard` doesn't prevent Enter/Space on a focused button (so the button clicks) but still holds their bindings. Rally binds Enter to `confirm` (Drive on the title, Retry on the results card). After a click on a title choice (say "Stage"), focus stays on that button, so Enter would both click the choice and fire `confirm`, starting a run the player didn't ask for; Space (handbrake) would likewise click whatever is focused. Rally's own keyboard returns early for Enter on a button for this reason.
- **Engine change (2c-rally E1):** Enter and Space on a focused `<button>` belong to the button: not prevented and not bound. This changes 2b's tested behaviour.
- **Status:** done (2c-rally).

### 16. One pad button, two actions: Rally
- **What happened:** pad A is the handbrake while driving and Drive/Retry (`confirm`) on menus. `bindGamepad` maps one action per button index. Rally's left stick also uses a slight expo curve (`0.35·s·|s| + 0.65·s`) after the dead zone.
- **Engine change (2c-rally E2):** a button entry may be a list of bindings; an axis entry may take a curve function as its third element.
- **Status:** done (2c-rally).

### 17. The touch steering slider is the game's own markup: Rally
- **What happened:** Rally's steering is a horizontal slider, not a stick: vertical movement is ignored, travel clamps per axis, there is no dead zone, and full lock is `clamp(innerWidth · 0.12, 60, 110)` px, read when the thumb lands. The slider is Rally's own `#steerBase`/`#steerKnob` (sized from the range), the hint hides while steering, and the pedals show an `on` look while held. `bindStick` clamps radially (so a diagonal drag reduces steering), applies a radial dead zone, takes a fixed radius, and creates its own `.lh-stick` element.
- **Engine change (2c-rally E3):** `bindStick({ axis: 'x' | 'y', radius: number | () => px, base, knob })`: single-axis slider mode, a function radius read on `pointerdown`, adopted base/knob elements (left in place on dispose) with `--lh-r` set on the base; the surface carries `data-lh-active` while driven; `bindHold` marks its element `data-lh-down` while pressed.
- **Status:** done (2c-rally).

### 18. Rich menus vs. a registry of plain buttons: Rally
- **What happened:** Rally's title menu is segmented choices (mode, track, style, theme, obstacles, car), a seed text field with a dice button, and footer buttons; its pause and results cards and settings sheet are styled markup with icons (`❚❚ Pause`, `🎲`). The 2b registry renders plain text buttons in its own container, has no choice or text control, and listens for clicks only inside its own root.
- **Engine change (2c-rally E4):**
  - `ui.choice({ id, options, get, set })` registers one control per option (`<scene>.<id>.<value>`, `aria-pressed`);
  - `ui.field({ id, label, get, set })` is a text input, filled with `engine.ui.fill(id, text)` / `h.fill` / `game.fill`;
  - an element marked `data-lh-slot="<scene>.<id>"` (a `<button>`, or an `<input>` for a field) is adopted as that control: the engine manages its test id, `disabled`, `aria-pressed` and value but never its content; on removal it keeps its place, loses the test id and is disabled;
  - clicks are delegated from the document.
- **Status:** done (2c-rally).

### 19. View halves need the frame time: Rally
- **What happened:** Rally's chase camera, title orbit and the camera's FOV smoothing integrate frame time (`1 - exp(-dt·k)`). View-half `frame(engine, alpha, view)` gets no frame time.
- **Engine change (2c-rally E5):** `view.dt` is the seconds since the previous driver frame during a driver frame, and 0 for renders the driver didn't start (hook renders).
- **Status:** done (2c-rally).

### 20. Async view loads and `settled()`: Rally
- **What happened:** Rally's renderer loads the track view with a dynamic `import()` after the world swaps. `window.engine.settled()` only looks for `data-lh-state` attributes, so a test could screenshot or measure before the track exists.
- **Engine change (2c-rally E5):** `view.wait(promise)` marks the page unsettled until the promise settles (a rejection goes to `window.engine.errors`). This is the view half of S-6.
- **Status:** done (2c-rally).

### 21. A loading toast needs a paint before a synchronous build: Rally
- **What happened:** Rally shows "Building the track…", awaits one `requestAnimationFrame` so the toast paints, then generates the track (0.07–0.23 s) and builds the Rapier world synchronously. Inside the engine the build happens in a step, and all of a frame's steps run before the frame renders, so a toast set in the same step never paints.
- **Workaround (2c-rally R2):** a title change puts the stage in `loading` and the build runs once 0.05 s of engine time has passed (12 steps at 240 Hz). In the browser that spans a few frames, so the toast paints; headless it is just 12 steps. The first build (in `enter`) is immediate, behind the page's own loading screen.
- **Engine change:** S-6's loading protocol should offer "hold N seconds of engine time, then build" as its synchronous path.
- **Status:** done (2c-rally); engine change done (2d D4: ctx.load hold; builds in the same step as Rally's LOAD_HOLD counter).

### 22. Flow and HUD timers on `setTimeout`: Rally
- **What happened:** the results card opens 1.5 s after the finish by `setTimeout` in `main.js`; `GameHud` hides banners, the split pill and the countdown lights with `setTimeout`; the toast too. These break U-5 and can't run headless or under `?lh-test`.
- **Change:** the results timer moves into the stage scene on engine time (R2); `GameHud` and the toast take an engine-time clock (R5).
- **Status:** done (2c-rally).

### 23. Pause was a state of the game's own state machine: Rally
- **What happened:** `Game` had `paused` (with `resumeTo`) and the frame loop skipped `game.step()`/`sim.step()` while paused; `title` and `loading` were states too.
- **Change (2c-rally R2):** pause is the `pause` overlay with `pauses: true`; `Game.pause()/resume()` go away and `paused` no longer appears in Rally's `state` events (nothing listened for it). `title` and `loading` stay as stage sub-states, with the title overlay open in `title`.
- **Status:** done (2c-rally).

### 24. Browser-only defaults inside sim modules: Rally
- **What happened:** `makeBests()` defaults to `globalThis.localStorage` (the purity scan doesn't flag it); new seeds come from `Math.random()` in `main.js` and `menus.js`; settings are loaded and saved in `main.js`.
- **Change (2c-rally R1, R2):** bests take an injected store (in-memory by default), seeds come from `engine.rng('seeds')`, settings are normalised by a pure module and loaded/saved by the browser entry. Rally gets its own purity test, with extra rules for `localStorage`, timers and Rally's view modules.
- **Status:** done (2c-rally).

### 25. Presets can't step the engine to reach a state: Rally
- **What happened:** `rally.debug.screen('countdown', { n })` and `'running'` stepped the game and physics until the state was reached (`runTo`). A preset runs inside a transition; calling `stepN` there would run a step inside the drain.
- **Workaround (2c-rally R3):** presets set the sub-state directly (e.g. `countdown` sets `t` and `countN`), deterministically and without stepping.
- **Engine change:** consider `jump(..., { warm: n })` (T-6's `warm:N`) applied after the transition drains.

### 26. Policies that run slower than the sim: Rally
- **What happened:** the autopilot runs at 60 Hz inside the 240 Hz sim (every 4th step) in the golden and the game tests. A policy is called every step with no per-handle state.
- **Workaround (2c-rally R2):** the `autopilot` policy caches its last output per engine in a `WeakMap` and recomputes every 4 steps.
- **Engine change:** a `policy.every(n, fn)` helper, or a per-handle scratch object passed to policies. Status: done (2d D10): `policy.every(n, fn, { phase })`; see #37.

### 27. Events are delivered after physics, not inside game logic: Rally
- **What happened:** `Game` listeners ran synchronously inside `game.step()`, before that step's physics. Engine events flush at `events.flush`, after physics. A test that teleports the car when it sees a `split` acts one step later than before.
- **Decision:** won't change: flushing at the end of the step is the engine's model (E-13). `test/game.mjs`'s teleport check compares event sequences, which this doesn't change; event times are taken from `e.step`.

### 28. Sim objects live in the scene's `state`: Rally
- **What happened:** view halves only see `engine.scene.state` (the main scene's `ctx.state`), so Rally keeps its `Sim`, Rapier world and track there, next to plain data.
- **Workaround (2c-rally R2):** `ctx.state` holds them; `game.state()` returns a JSON-safe summary for tests and the hook.
- **Engine change:** the phase 4 `World` (E-2) should own the Rapier world and be what view halves read.

### 29. "Active touch overrides" vs. largest-value merge: Rally
- **What happened:** in Rally, an active touch steer (even at 0, thumb resting at the centre) overrode keyboard and pad steering. The engine merges sources by largest |value|.
- **Decision:** won't: holding a key while resting a thumb on the slider is not a real case; accepted.

### 30. First pad only vs. every pad merged: Rally
- **What happened:** Rally read only the first connected gamepad; `bindGamepad` merges all pads.
- **Decision:** won't: merging is harmless for a single-player game.

### 31. Two sets of safe-area variables: Rally
- **What happened:** Rally's CSS reads `--sa-t/r/b/l` (set from `env()` and by its mobile test); the engine injects and the Playwright helpers set `--lh-sa-*`.
- **Change (2c-rally R5):** Rally's `--sa-*` default to `var(--lh-sa-*, env(...))`, so both the old and the engine path work and `openGame` presets apply.
- **Status:** done (2c-rally R5).

### 32. CDP `touchEnd` semantics disagree: Rally, engine
- **What happened:** Rally's mobile test lifts one of two touches with `touchEnd` listing the point that lifts ("CDP: touchEnd lists the points that lift"); the engine's `game.touch.end` sends `touchEnd` listing the points that stay down. Both have passed their own checks.
- **Status:** done. Rally was right: Chromium's `touchEnd` lists the points that LIFT. The engine helper was wrong (fixed, see #43).

### 33. Every debug jump rebuilds the world: Rally
- **What happened:** `engine.jump('stage', preset)` re-enters the stage, so each jump generates the track and builds the Rapier world again (about 0.2 s). `rally.debug.screen` reused the live world.
- **Decision:** won't for now: tests and phones can afford it, and re-entering is what makes presets deterministic. Revisit with S-6.

### 34. Stale browser tooling: Rally
- **What happened:** `test/browser.py` uses selectors that no longer exist (`#gasPad`, `#brakePad`) and `window.rally.pause()`; nothing runs it.
- **Change (2c-rally R8):** deleted; the Playwright suites cover it.
- **Status:** done (2c-rally R8: `test/browser.py` deleted; `window.rally` removed in R9, Rally 0b6fa13).

### 35. A fixed engine seed gives every visitor the same first track: Rally
- **What happened:** `boot` seeds the engine with `?seed` or 1. Once Rally draws new seeds from `engine.rng('seeds')` (#24), every first visit would get the same track; today it's `Math.random()`.
- **Change (2c-rally R5):** the browser entry passes a random `seed` to `boot` (view code may use `Math.random`); `?seed=` and `?lh-test` still fix it.
- **Status:** done (2c-rally R5).

### 36. Can't ask "is this overlay open or pending?": Rally (phase 2c R2)
- **What happened:** results can be requested from several places in one step. A second `overlay('results')` throws "already open" at request time, which is the F2 ruling.
- **Workaround:** Rally's `openOnce` swallows only that error.
- **Engine change:** add `engine.isOpen(name, { pending: true })`, or an `overlay(name, args, { ifClosed: true })` option. Status: done (2d D5): `engine.isOpen(name, { pending })`; an unknown scene throws.

### 37. Policies have no per-handle state or rate: Rally (phase 2c R2; see #26)
- **What happened:** Rally's autopilot runs at 60 Hz inside the 240 Hz sim and keeps controller state between calls.
- **Workaround:** a per-engine WeakMap in Rally.
- **Engine change:** `policy.every(n, fn)`, plus a per-handle scratch object passed as `fn(h, i, scratch)`. Status: done (2d D10): `policy` moved to `lion-hawk/sim` (re-exported by `lion-hawk/test`); every policy is called `fn(h, i, scratch)` with one scratch object per (handle, policy function); `every` follows engine steps and re-anchors after a gap of n steps or more.

### 38. No "a frame has been drawn" signal for deferring heavy sim work: Rally (phase 2c R2; see #21, S-6)
- **What happened:** Rally shows a "Building the track…" toast, waits LOAD_HOLD (12 steps), then builds. With maxCatchUp 12, all 12 steps can run in a single rAF frame, so the toast never paints.
- **Engine change:** a render-ack, either `engine.afterRender(fn)` or a view-side "frame presented" event that the loading protocol can wait on; headless runs treat every step as a frame. Status: done (2d D4: frame acks, engine.onPresent): `engine.time.frames`, `engine.presented()` (the browser driver acks a rendered frame at the start of the next tick), `ctx.load({ frames })`.

### 39. A control can't both trigger an action and be gated: Rally (phase 2c R2)
- **What happened:** the Pause chip opens the overlay directly. A pause key and a chip tap in the same frame then open and close pause. Routing the chip through the `pause` action conflicts with the `when` gate on overlay state.
- **Engine change:** let `u.button({ action: 'pause', when })` press the action with the gate evaluated at tap time, and document "controls press actions; scenes own transitions". Status: done (2d D5): semantics plus docs only; taps already pressed the action for the next step with `when` decided at tap time. Controls press actions; scenes own transitions.

### 40. Determinism makes some comparisons meaningless: Rally (phase 2c R4)
- **What happened:** with the engine's step-exact policies, both runs of the "best kept only if faster" test finish in exactly 167.400 s. That check can no longer tell `min(a, b)` from `a`.
  - Before the port, the old harness's 60 Hz autopilot phase happened to differ between the two runs: 167.72 s vs 167.633 s.
  - The old harness was also phase-sensitive: shifting the phase gave 167.49–168.41 s.
- **Engine change:**
  - `policy.every(n, fn, { phase })` (see #37), so tests can vary phase explicitly.
  - Guidance: when a test compares two runs, perturb one of them on purpose.
  - Status: engine side done (2d D10): `policy.every` takes `{ phase }`; spec T-2 carries the guidance.
- **Game change:** final-pass fix to Rally `test/game.mjs`: run 2 starts one step later (the autopilot's phase shifts), giving 167.400 s vs 167.492 s, and the test asserts the two differ. Status: done for Rally; the engine guidance is open.

### 41. The input latch drops a second tap if no step sees the key go up: Rally (phase 2c R5)
- **What happened:** under manual stepping, two Esc taps with no step between them collapse into one press. A double tap faster than one sim step could do the same.
- **Workaround:** the Rally test steps once between the taps.
- **Engine change:** the latch queues a forced release for the next apply, so press → release → press within one step yields two pressed edges across two steps. Status: done (2d D7): each source counts its rising edges and every one is owed as a press (cap 3).

### 42. `bindHold` lets the button take focus: Rally (phase 2c R5; see #15)
- **What happened:** after tapping a held pedal, Space and Enter belong to that button.
- **Workaround:** Rally prevents focus locally.
- **Engine change:** `bindHold(..., { focus: false })`, default false for pedals: `preventDefault` on `pointerdown`, or `tabindex=-1`. Status: done (2d D8): `focus: false` by default prevents `pointerdown` and `mousedown` on the button.

### 43. Playwright `touch.end(id)` lifted the wrong finger: engine test helper (phase 2c R5; confirms #32)
- **What happened:** `game.touch.end(2)` lifted the steering touch instead of the gas touch.
- **Engine change:** CDP `touchEnd` lists the fingers that lift, not the ones that stay down; `touch.end` now sends exactly the lifted points (test/touch-e2e.test.mjs). A zero-velocity move before the lift did not avoid the fling, so the 150 ms wait stays. Status: done.

### 44. Device ramps use uncapped frame time: Rally (phase 2c R5 review)
- **What happened:** Rally's old controls ramped with `min(0.1, dt)`. The engine's `bindKeyboard` `{rise, fall}` ramps take the driver's raw dt, so a 0.3 s hitch snaps the throttle from 0.58 to 1.0.
- **Workaround:** Rally uses function ramps that cap dt (R6).
- **Engine change:** the driver passes devices a dt clamped like the loop's `maxFrame` (or 0.1 s), or `bindKeyboard` caps dt itself. Status: done (2d D7): the driver passes devices `min(dt, sim.maxFrame)`.

### 45. No query for "is this control enabled?": Rally (phase 2c R5 review)
- **What happened:** Rally's hidden-page auto-pause tells expected tap failures apart by matching the error text (`/is disabled|is covered|no control/`), which is brittle.
- **Engine change:** `engine.ui.enabled(id)`, or a `tryTap(id) → boolean`. Status: done (2d D5): `engine.ui.enabled(id)` and `engine.ui.tryTap(id)` (also on the hook and `h.enabled`/`h.tryTap`); neither throws for a missing, covered or disabled control.

### 46. An overlay view half's `enter` runs before `ui.sync()`: Rally (phase 2c R6)
- **What happened:** when an overlay's view `enter` runs, its buttons are still disabled, so it can't focus the default button.
- **Workaround:** Rally retries focus every frame.
- **Engine change:** `boot`'s refresh should sync the UI before calling view-half `enter`, or add `view.focus(testid)`, applied after the next sync. Status: done (2d D5): `boot` syncs the UI before view-half `enter`, and `view.focus(testid)` focuses once the control exists and is enabled, unless the player moved focus first.

### 47. Under `?lh-test` the driver still renders every frame: Rally (phase 2c R6)
- **What happened:** a test can't observe what `exit` left in the DOM across page calls, because the next automatic render changes it.
- **Engine change:** a full-manual option, `driver.manual('all')` or `?lh-test=render`, that also stops automatic renders. Tests then call `render()` themselves. Status: done (2d D11): `?lh-test=render` (`flags.lhRender`) boots with `driver.manual('all')`; `openGame(…, { render: 'manual' })`; devices still update, nothing steps or renders, so no frame ack.

### 48. `expectTappable` only accepts test IDs: Rally (phase 2c R7)
- **What happened:** Rally's pedals and HUD chips aren't registry controls (they're devices and plain DOM), so `mobile.mjs` keeps local box/hit checks for them. The research predicted `mobile.mjs` would shrink to about 80 lines; measured, it stayed at 197 lines (727 → 797 checks).
- **Size of the migration:** Rally's `src` did not shrink either. It was 4123 lines before the migration (a39cbaf) and is 4316 after (+193, of which +81 is the autopilot moved from `test/` into `src`). The gain is structure, not size: a single flow owner, headless-testable flow, and no wall-clock timers in the sim.
- **Engine change:** `expectTappable`, `expectFitsSafeArea` and `expectNoOverlap` accept any selector or locator. Status: done (2d D11): a string, `{ testid }`, `{ css }` or a Playwright locator; failure messages name the target.

### 49. Commands to a scene under a pausing overlay are dropped: engine (phase 2d D1 review)
- **What happened:** scene-scoped command handlers skip covered scenes, and the command is dropped, not held. That suits positional taps.
- **Rule for Tractor Pickup:** network messages and view acks must be game-wide handlers, or they are lost behind the pause menu. Status: done (2d D12: documented in spec [I-7]; watch in the Tractor migration).

### 50. Playwright `until` can't wait out a load held by `view.wait`: Rally (phase 2d R1)
- **What happened:** `until`/`step` run in one in-page `evaluate` loop. A load whose settle waits on a view promise (a dynamic import) never settles inside that synchronous loop under `?lh-test`.
- **Workaround:** Rally reverted its stage view's `built` hook, so the track view doesn't block the load.
- **Engine change:** in-page `until`/`step` returns control to Node and awaits `settled()` whenever `engine.loading.phase === 'settle'` with blocks pending, or add a `game.untilLoaded()`. Status: done (0.5.1 final review): `step`, `until` and `untilEvent` pause in Node while a settle is blocked, poll until the blocks clear (bounded `timeout`), then continue; `game.untilLoaded({ maxSteps, timeout })` added. Rally can restore its stage view's `built` hook.

### 51. `policy.every` doesn't restart when the sim behind it is replaced: Rally (phase 2d R1)
- **What happened:** Rally's old autopilot cache was keyed by the `Sim` object. `policy.every` keys its cadence to engine steps only, so after a jump or rebuild it can repeat a stale output for up to n−1 steps. The goldens are unaffected.
- **Engine change:** `policy.every(n, fn, { key: (h) => object })`, which recomputes immediately when the key changes. Status: done (0.5.1 final review): `key(h)` is compared with `===` on every call; a change recomputes at once and re-anchors the cadence.

### 52. `bindPointer`'s `at()` can't tell a move from a press: Pig Pens (phase 2e plan)
- **What happened:** the Hand tool must send nothing while the finger drags (the view turns the drag into a camera orbit) but must still send the 0.75 s press on the tractor. `at(clientX, clientY, event)` gets `undefined` as the event for both the coalesced move and the press that `update(dt)` sends, so it can't return `null` for one and a payload for the other.
- **Engine change:** pass the phase: `at(clientX, clientY, event, phase)`. Status: done (2e P-E1).

### 53. A fixed-centre thumb pad vs the floating stick: Pig Pens (phase 2e plan; see #8)
- **What happened:** Pig Pens' drive pad (`#stick`, 132 px, bottom left) is always visible while driving and deflects from its own centre on the first touch (`main.js:489-497`, travel 36% of its width, no dead zone). `bindStick` with an adopted base hides the base when idle, moves it under the thumb and reads zero on the first touch.
- **Decision:** add `bindStick({ origin: 'centre' })`: the origin is the base's centre at pointerdown, the down position is the first move, and the base is never hidden or moved. The floating stick would change the feel of the main drive control. Status: done (2e P-E2).

### 54. Screen-space aim offsets under a finger: Pig Pens (phase 2e plan)
- **What happened:** with a finger, Grab lifts the held animal to 80 px above the finger, eased over 0.18 s, and the Hose aims 55 px above it (v2 spec §16.2). Both are screen-space offsets eased per frame in `main.js`, so they can't be a sim input as they stand.
- **Workaround:** the view's `at()` sends a second ray (`aim`) through the lifted point; the sim takes plane hits from both rays and blends them over 0.18 s. The start and end points are the same as before; the path during the ease is a world-space blend, not a screen-space one (flagged for the playtest).
- **Engine lesson:** send rays, not hits, in positional commands. The sim then does all picking, and replays reproduce it. Status: planned (2e P3, P6).

### 55. A tap acts on what was picked at pointer down: Pig Pens (phase 2e plan)
- **What happened:** `main.js` classifies the Hand's target on pointerdown and acts on it at the tap; `bindPointer`'s `tap` carries the up position.
- **Workaround:** the sim keeps per-gesture state (`ctx.state.gesture = { tool, pointer, down, target }`), picked on `down`, used on `tap` and `press`. A gesture also finishes with the tool it started with.
- **Engine change:** none; per-gesture state is game state. Status: planned (2e P3); engine won't.

### 56. A long press on capped device time runs slow at low frame rates: Pig Pens (phase 2e plan)
- **What happened:** the v2 spec's defect 8 ("press and hold did not start the drive at a low frame rate") was fixed with a 750 ms `setTimeout`. `bindPointer` counts the press on device time, which the driver caps at `maxFrame` (0.1 s for Pig Pens, #44). Below 10 fps the hold still fires, but later in wall time (at 5 fps, about 1.5 s).
- **Decision:** accepted for 2e (ruling: engine time, no timers); flagged for a real-device check.
- **Engine change (maybe):** a `press` option that counts uncapped frame time. Status: open.

### 57. A game-owned event queue next to engine events: Pig Pens (phase 2e plan)
- **What happened:** `createSim` pushes events into its own `sim.events` (at most 64 queued) and `main.js` drains them once per frame for sound and hints. The phase-0 golden drains them per step.
- **Workaround:** a `post` system drains `sim.events` into `engine.emit` every step (so the cap now applies per step). The farm's own events use other types (`FARM_EVENTS`), so the engine-path test can filter them and compare against the phase-0 golden.
- **Engine change:** `kit-herd` (phase 7) emits through the engine. Status: planned (2e P2 bridge); kit open.

### 58. The game's RNG and seed live outside the engine streams: Pig Pens (phase 2e plan)
- **What happened:** `createSim` seeds its own mulberry32 from `opts.seed` (default 1); every first visit gets the same farm. `engine.rng` streams are not used.
- **Workaround:** the farm passes `args.seed ?? engine.seed`; `boot`'s default seed 1 matches today's default, so unlike Rally (#35) the fixed first farm is kept.
- **Engine change:** game randomness on `engine.rng` streams when the herd moves into `World`/kits (phases 4 and 7). Status: open.

### 59. Camera gestures need a second pointer tracker on the same canvas: Pig Pens (phase 2e plan)
- **What happened:** the canvas carries the tools (positional commands) and view-only camera gestures: one-finger Hand orbit after 10 px, two-finger orbit/pan/pinch, mouse right/middle drag, wheel, and the drive chase drag. `bindPointer` owns the tool gesture and cancels it on a second finger, but has no way to hand the multi-touch gesture to the view.
- **Workaround:** a view-only listener on the same canvas keeps its own pointer map; it and `bindPointer` agree on the Hand's orbit through `at()` (#52). Two trackers could disagree about which finger came first.
- **Engine change (maybe):** a view camera-gesture helper, or a `bindPointer` callback for the multi-touch gesture. Status: open.

### 60. Sim inputs computed per frame in the view: Pig Pens (phase 2e plan; part of #4)
- **What happened:** besides the flow state (#4), `main.js` feeds the sim from frame-time code:
  - it eases the hose nozzle per frame and passes the eased value to `sim.setHose` as the spray source, which the zooming pigs use, so the sim depends on the frame rate;
  - it sets the tractor's input and calls `rightIfTipped` per frame;
  - it eases the grab lift per frame;
  - it flips `lay.coop.open` directly;
  - it limits Feed taps on `performance.now()`.
- **Change:** each moves into a farm system or handler on engine time (`farm.ease`, `farm.keys`, `toggleDoor`, `TOSS_GAP`). Status: planned (2e P2–P4).

### 61. `pointercancel` counted as a lift: Pig Pens (phase 2e plan)
- **What happened:** `main.js` handles `pointercancel` with the same `end` as `pointerup`, so a touch the browser cancelled (iOS) could still count as a tap and select, toss or act.
- **Change:** `bindPointer` sends `cancel`, never a tap. This is a user-visible fix, listed in the plan's parity table. Status: planned (2e P3).

### 62. Stale browser scripts and print-only tests: Pig Pens (phase 2e plan; like #34)
- **What happened:**
  - `test/interact*.mjs` and `shot.mjs` use hard-coded `/opt/pw-browsers` and `/mnt/user-data/outputs` paths, `window.piggies`, and a removed `look` tool. Nothing runs them.
  - The headless scripts (`day`, `door`, `food`, `gates_fox`, `grain`, `hose`, `nan`, `night`, `scenarios`, `tractor`, …) print results; `npm test` runs only the golden.
  - `createSim` ignores the `hour` option that `day.mjs`, `grain.mjs` and `gates_fox.mjs` pass, so `gates_fox.mjs`'s fox part never starts a visit.
- **Change:** the browser scripts are deleted, and the e2e suite covers their flows. `nan.mjs` becomes an engine-path invariant test, and the v2 spec's §13.1 facts are asserted in `sim.test.mjs`; the other tuning scripts stay manual. Status: planned (2e P5, P9).

### 63. Safe areas read `env()` directly: Pig Pens (phase 2e plan; like #31)
- **What happened:** `template.html` uses `env(safe-area-inset-*)`, which Chromium can't emulate, so the Playwright presets' `--lh-sa-*` variables don't apply.
- **Change:** `var(--lh-sa-X, env(safe-area-inset-X, 0px))` everywhere. P8 also measures the Get out button, which its CSS makes about 43 px tall (under the 44 px guideline); no restyling in 2e. Status: planned (2e P6, P8).

### 64. No finite invariant before the World: engine, Pig Pens (phase 2e plan)
- **What happened:** [T-1] says a `finite()` invariant over every `xf` and body is always on, but there is no `World` yet (phase 4), so nothing checks. `nan.mjs` checks the birds' positions by hand.
- **Engine change:** `invariants.finite(select, label)` in `lion-hawk/test`, naming the path, seed and step. Status: done (2e P-E3).

### 65. No helper for mouse gestures on world points: engine, Pig Pens (phase 2e plan)
- **What happened:** `game.touch.*` resolves `{ world }` targets through `view.project`, but desktop presets have no touch, and Pig Pens' tools need left clicks and drags on world points (and right-drags for the camera).
- **Engine change:** `game.point(target)` exposes the resolver for `page.mouse`. Status: done (2e P-E4).

### 66. The old loop zeroed its remainder after a capped frame: Pig Pens (phase 2e plan)
- **What happened:** `main.js` set `acc = 0` whenever it ran 4 catch-up steps, even with less than one step left over; the engine loop keeps a sub-step remainder after the cap (`acc %= dt`).
- **Decision:** won't change: it only shifts the next step's phase by less than one step and is invisible.

### 67. Audio unlock needs a user-gesture hook: Pig Pens (phase 2e plan)
- **What happened:** Web Audio must be unlocked from a user gesture. `main.js` calls `sound.unlock()` from each game control's handler, but registry controls and devices give the game no first-gesture hook.
- **Workaround:** the view adds one capturing `pointerdown`/`keydown` listener on the document, so audio now unlocks on any first tap or key (flagged as a small change).
- **Engine change:** an audio service with its own unlock. Status: open (audio service).

### 68. Goldens compare to 6 digits; bit-exact comparison needs its own test: Pig Pens (phase 2e P2)
- **What happened:** to prove the engine path reproduces `farm-seed3.json` exactly, P2 needed an extra `deepStrictEqual` against a direct `createSim` run, because `golden()` rounds to 6 digits.
- **Engine change:** `golden(file, value, { exact: true })`, which skips rounding (canonical at 17 digits). Status: open.

### 69. Control `when`/`get` receive the engine, not the scene context: Pig Pens (phase 2e P2 review)
- **What happened:** farm controls read `e.scene.state`, which is always the main scene's state. That breaks for overlay controls and after re-entry.
- **Workaround:** close over `ctx.state` from `ui(u, e, ctx)`.
- **Engine change:** pass `ctx` as a second argument (`when(engine, ctx)`, `get(engine, ctx)`, `set(v, engine, ctx)`), or document the closure pattern. Status: open.

