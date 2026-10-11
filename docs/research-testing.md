# Lion Hawk: test helper research (2026-10-11)

Research behind the testing parts of `design.md`: what the current game tests show, prior art in other engines, Playwright for DOM-overlay + canvas games, and a proposed API.

## 1. What the existing tests show

**Tractor Pickup** (44 `node:test` files, all headless, none in a browser)

What repeats:
- Warm-up loops: `for (let i = 0; i < 60; i++) g.step(STILL)` opens almost every test.
- Copy-pasted fixtures. `quiet`, `pickable`, `unhide` and `place` are in `game.test.mjs`, and `mp.harness.mjs` re-implements them. Animals are placed by poking `a.x/a.z/state/timer`, in about 15 places.
- Hand-rolled step-capped waits: `for (... i < 60*6 && !boop; ...)`, and `settle()` until `disagreements(w)` is empty.
- Events captured by concatenating arrays. Spies (`countCalls`) and `console.warn` capture (`quietWarn`).

What to keep and what to fix:
- **Keep.** `mpWorld` injects a sim clock into the net layer. This is the right pattern and should become the default.
- **Fix: flow state lives in the view.** `main.js` sets `g.mode = 'reward'`, and `stepTrip` takes `showDone`/`rewardDone` from view animations. So the trip flow (intro → drive → show → reward → drive) can't run headless end to end.
- **Fix: comparison code.** `disagreements(w)` is about 40 lines of game-specific comparison; most of it could be generic over `net` parts.
- **Fix: gated debug hook.** It exists only with `?tune`.

**Rally** (custom harness: `check()` and `process.exit(fails)`)
- `game.mjs` `play(game, track, {until, onEvent, maxTime})` and `autopilot.js` `runUntil` are an input policy plus a wait-until.
- `window.rally` is the most mature debug hook:
  - `debugPause`, `stepN` and `render`;
  - `debug.screen(name)`, which jumps straight to a game state;
  - fake events (`finish/split/lap`) and fixtures (`teleport`, `nearFinish`);
  - `runTo(pred, maxSteps)`.
- `mobile.mjs` re-implements plumbing a shared helper should own:
  - browser discovery by path;
  - layout helpers: `box`, `hits` (an `elementFromPoint` hit test), `inside` (safe area) and `overlap`;
  - fake iOS safe areas through `--sa-*` CSS variables;
  - multi-touch through raw CDP `Input.dispatchTouchEvent`;
  - double-rAF waits, and a `waitForTimeout(100)`.
- `browser.py` monkey-patches `controls.update` to inject input, so the engine needs a proper input-injection API.

**Pig Pens** (scripts that print numbers, with no assertions)
- Hardcoded browser and output paths.
- 8 `waitForTimeout` calls in `interact.mjs`, and real-time drags against a free-running rAF loop.
- A hand-written world-to-screen `proj()`, and a hand-written "no NaN" invariant (`nan.mjs`).

**Patterns to standardise:**
- seed plus manual stepping;
- wait-until with a step cap;
- event logs;
- scene jumps;
- placement fixtures;
- input policies (still, constant, autopilot);
- layout and hit-test assertions per device;
- a finite-values invariant.

**Pain to remove:**
- wall-clock waits, and racing a free-running rAF loop;
- non-portable browser paths;
- monkey-patched input;
- flow state owned by the view;
- ad-hoc, gated debug hooks;
- three different test runners.

## 2. Prior art

- **Godot GUT.**
  - `simulate(obj, times, delta)` steps without the main loop, so timers don't fire.
  - `wait_until(callable, max_wait)`, `wait_for_signal`, `wait_physics_frames`; every wait takes a timeout.
  - Docs: [Simulate](https://gut.readthedocs.io/en/latest/Simulate.html), [Awaiting](https://gut.readthedocs.io/en/latest/Awaiting.html).
- **gdUnit4 SceneRunner.**
  - `simulate_frames`, `set_time_factor`.
  - `simulate_action_*`: input simulated at the level of named actions, which matches Lion Hawk's model.
  - `await_signal`, `await_func`; calls chain.
  - [docs](https://godot-gdunit-labs.github.io/gdUnit4/latest/advanced_testing/sceneRunner/)
- **Unity.**
  - `InputTestFixture` gives an isolated input system per test, with `Press`/`Release` on virtual devices.
  - PlayMode tests yield one frame at a time.
  - [Input testing](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.6/manual/Testing.html)
- **Unreal.**
  - `AFunctionalTest` runs `PrepareTest` → `IsReady()` (polled every frame) → `StartTest` → `FinishTest`, with a time limit and typed asserts.
  - Gauntlet runs full builds on devices.
  - Sea of Thieves "actor tests" treat engine concepts as first-class dependencies.
  - [API](https://dev.epicgames.com/documentation/unreal-engine/API/Developer/FunctionalTesting/AFunctionalTest), [Gauntlet](https://dev.epicgames.com/documentation/unreal-engine/gauntlet-automation-framework-in-unreal-engine), [GDC](https://gdcvault.com/play/1026366/Automated-Testing-of-Gameplay-Features)
- **Bevy.** Swap in `MinimalPlugins` to run headless, mutate the input resource, call `app.update()`, then query the world and assert. This is the closest analogue to `headless()` + `world.with()`. [how_to_test_apps.rs](https://github.com/bevyengine/bevy/blob/main/tests/how_to_test_apps.rs)
- **AltTester, GameDriver, Poco.**
  - They query an object tree: `FindObject(By.NAME/TAG/COMPONENT)`, `WaitForObject`, `WaitForCurrentSceneToBe`, get/set properties, time scale, touch begin/move/end.
  - Poco's `freeze()` snapshots the tree so repeated queries are fast.
  - [AltTester](https://alttester.com/docs/sdk/2.2.2/pages/commands.html), [Poco](https://poco-chinese.readthedocs.io/en/dev/source/doc/poco-example/optimize_speed_by_freezing_UI.html)
- **Factorio.** A CRC of the whole map every tick in desync-test mode finds the exact tick where two runs diverge. [FFF #47](https://factorio.com/blog/post/fff-47)
- **fast-check model-based testing.**
  - `fc.commands` plus `fc.modelRun`.
  - A failing sequence shrinks to a minimal one and replays from `seed`/`path`.
  - [docs](https://fast-check.dev/docs/advanced/model-based-testing/)

## 3. Playwright for DOM-overlay + canvas games

- **Locators and assertions.**
  - Use `getByRole`/`getByTestId`, auto-retrying `expect(locator)` assertions, the trace viewer and soft assertions. [best practices](https://playwright.dev/docs/best-practices)
  - Assert game state with `expect.poll(fn)` and `expect(...).toPass()`. [assertions](https://playwright.dev/docs/test-assertions)
  - `toMatchAriaSnapshot` checks menu structure as YAML, with partial and regex matching; it's cheap and robust. [aria snapshots](https://playwright.dev/docs/aria-snapshots)
- **Clock.** `page.clock.install()` fakes Date, timers, rAF and `performance`. It suits UI timers. For the sim, the engine's manual mode is better than faking `performance.now` underneath three.js and Rapier. [clock](https://playwright.dev/docs/clock)
- **Screenshots.**
  - `toHaveScreenshot` waits until the page is stable, then compares. Options include `mask`, `animations: 'disabled'` and `maxDiffPixelRatio`.
  - Results vary by OS, GPU, headless mode and power source. So pin a container plus SwiftShader, keep baselines per platform, and use `channel: 'chromium'`.
  - [assertions](https://playwright.dev/docs/api/class-pageassertions), [snapshots](https://playwright.dev/docs/test-snapshots), [browsers](https://playwright.dev/docs/browsers)
- **Touch.** Playwright documents dispatching TouchEvents directly, but that skips real hit-testing. CDP `Input.dispatchTouchEvent`, as in `mobile.mjs`, goes through hit-testing and supports multi-touch. [touch-events](https://playwright.dev/docs/touch-events)
- **Service workers.** Use `serviceWorkers: 'block'` normally. Update tests use `context.serviceWorkers()` and wait for `controllerchange`. [service-workers](https://playwright.dev/docs/service-workers)
- **jsdom/happy-dom.** Neither does layout or hit-testing, and most real mobile bugs are layout bugs. Skip them. Test flows headless against the engine's UI model, and leave layout and touch to Playwright. [comparison](https://www.pkgpulse.com/guides/happy-dom-vs-jsdom-2026)

## 4. Sources of flakiness

| Source | Mitigation |
|---|---|
| Free-running rAF loop while the test pokes state | Manual mode before the first step; the test owns every step and frame |
| `waitForTimeout` / ms budgets | Wait in steps (`until(pred, {maxSteps})`); `expect.poll` only at async edges |
| Variable rAF dt; background tabs throttled | Fixed step; virtual accumulator; explicit `render(alpha)` |
| Wall clock in sim or net | Injected clock; the sim purity check fails on `Date.now`/`performance.now` |
| Asset, shader and font timing | `engine.ready` plus `settled()` |
| CSS transitions | `data-lh-state` plus transitions off in test mode |
| `Math.random` in view; iteration order | `engine.rng(name)` per subsystem; stable IDs; checksum covers sim parts only |
| Cross-machine float or Rapier differences | Goldens checked on the same platform; checksum every N steps to find the first divergent step |
| GPU/DPR pixel differences | Pinned container, fixed DPR, masks, `@visual` tests kept out of the default run |
| Leftover storage, SW or cache | Fresh context per test, SW blocked, settings seeded with `addInitScript` |
| Real network timing | Hub transport on virtual time; browser peers bridged through the Node hub |

## 5. Proposed API

The adopted version is in `design.md` §7 (Testing). This section is the full research proposal it was cut from.

### Headless: `lion-hawk/test`

- **Setup:** `headless(game, { seed, scene, args, invariants, clock: 'virtual', record: 'on-fail' })`.
- **Stepping:** `step(n, input)`, `seconds(s, input)`, `hold`/`release`.
- **Policies:** `still`, `const`, `seq`, `fn`, `rate`. Rally's autopilot plugs in as a policy.
- **Waiting:**
  - `until(pred, { maxSteps | maxSeconds, input, message })`, `untilEvent`, `untilScene`.
  - On timeout it throws with the seed, the step number and the last 20 events.
- **Events:** a ring log with `mark()`, `since(mark).of(type)`, and `expectEvents(...).toInclude / toBeSequence`.
- **Spies and logs:** `spy(obj, name)`. Warnings and errors are captured and fail the test unless the test expects them.
- **World:** `find(kind, where)`, `one(kind, where)` (throws unless exactly one match), `get(id)`, `go`, `overlay`, `place(e, {at | rel, local, yaw})`.
- **State:** `snapshot`/`restore`/`fork`, `checksum`, `diff(a, b, {tol})`, `toMatchGolden`.
- **Fixtures:** `fixtures.define(name, fn)` and `h.use('quietYard', 'warm:60')`.
- **Checks:** `simPurity`, `zeroAlloc`, `materials`, `determinism` (two runs, checksum every 60 steps).
- **Replay:** `replay.run(file)`, with `--bless`.
- **Fuzz:** `fuzz(game, {...})`, built on fast-check commands generated from the action map. A failure shrinks to a minimal input sequence and is written as a replay file.
- **Multiplayer:**
  - `mp(game, { peers, link: { latency, jitter, loss } })`, with `step`, `seconds`, `addPeer`, `drop` and `blackout`.
  - `diverged({ agree })` compares every `net` entity generically, with a game hook for semantic rules. `settle()` steps until nothing diverges.

### Playwright: `lion-hawk/playwright`

- **Presets:** iPhone SE, 15 Pro and Pro Max; iPad Mini and Pro 11; desktop. Each carries real iOS safe areas, SwiftShader, a fixed DPR and a blocked SW. The launcher finds the browser itself.
- **`game` fixture:**
  - `open({ scene, args, query, settings })`.
  - `step`, `seconds`, `until`, `untilEvent`, each in one `evaluate`.
  - `render`, `state`, `query`, `go`, `jump`.
  - `input.hold`/`release`.
  - `touch` (CDP-backed, targets a locator, a point or a `{world}` position).
  - `tap(label)`, `control(testid)`, `shot(name, {mask})`, `errors`.
- **Matchers:** `toBeInScene`, `toHaveEmitted`, `toBeSettled`, `toHaveState`, `toBeTappable({min})`, `toFitSafeArea`, `toNotOverlap`, `toBeThumbReachable`.
- **Peers:** `test.peers(n, { link })` opens browser contexts bridged through the Node hub. No signalling server is needed, and the link is deterministic.
- **Flow DSL:** `flow(backend).go().tap().expectScene().until().drive().expect().run()`. The same script runs headless (taps resolve through the UI registry) or in the browser (real taps).

### What the engine must expose

- **`window.engine`**, always present:
  - `ready`, `version`, `seed`, `errors`;
  - `manual(bool)`, `stepN`, `advance`, `render`, `time`;
  - `scene`, `go`, `overlay`, `close`, `on(...)`;
  - `jump(scene, preset, opts)`;
  - `events.since(seq)`;
  - `state`/`query`, `snapshot`/`restore`/`checksum`;
  - `input.set/hold/release/read`;
  - `settled()`;
  - `view.project`, `ui.tree()`;
  - `net`, with an injectable transport;
  - `rng(name)`.
- **UI conventions:**
  - `ui.button({ id, label, action })` renders a real `<button>` with `data-testid="<scene>.<id>"` and registers it for headless taps.
  - `<html data-lh-scene data-lh-overlays data-lh-settled>`.
  - HUD readouts are `<output data-testid data-value>`.
  - Safe areas come from `--lh-sa-*`, falling back to `env()`.
  - Transitions are off in test mode.
  - View timers run on engine time.
- **Flow state is owned by the scene or sim, never the view.** View animations that gate flow become scene timers or event acks.

## 6. Existing tests that would get simpler

- `tractor-pickup/test/game.test.mjs`: fixtures, warm-ups, placement and capped loops become `use`/`place`/`untilEvent`. Roughly 30–40% fewer lines.
- `tractor-pickup/test/mp.harness.mjs`: becomes built-in `mp` plus an `agree()` hook.
- `tractor-pickup/test/session.test.mjs`: `mock.timers` plus `flush()` become `clock: 'virtual'`.
- `rally/test/game.mjs` and `autopilot.js`: move to `node:test` with `until` and policies.
- `rally/test/mobile.mjs`: from 197 lines to probably under 80, using presets, matchers and `touch`.
- `rally/test/browser.py`: `input.hold` replaces the monkey-patch.
- `pig-pens/test/interact*.mjs`: manual mode, `touch.drag({world})` and real assertions.
- `pig-pens/test/nan.mjs`: becomes `invariants.finite()`, on every test for free.
