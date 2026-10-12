# Phase 2e: Pig Pens on `defineGame`, scenes and `boot`: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Goal:** Pig Pens becomes the second game on the engine ([§8.4] row 2), after Rally:
- a headless sim half `src/game.sim.js` (`defineGame`: actions, one `farm` main scene, presets, state, debug) that never touches three.js or the DOM;
- a browser half `src/game.view.js` plus `src/view/*` and `src/devices.js`, started by `boot`;
- every tool gesture is a recorded `tool` command (`bindPointer`), so headless flow tests, an engine-path golden and a replay cover what used to need a browser;
- the phase-0 sim golden (`test/goldens/farm-seed3.json`) is reproduced bit-for-bit through the engine path, untouched;
- Playwright e2e on `lion-hawk/playwright` (desktop and iPhone 15 Pro portrait), including touch taps and drags on world points.

The engine grows only where Pig Pens needs it (P-E1–P-E4), each addition tested, before the game task that uses it.

**Architecture:**
- **One main scene, `farm`, owns the world** (`createSim`: pigs, dog, chickens, fox, tractor, gates, coop, day/night) for the life of the page. There are no menus to put in overlays: the tool picker is a `ui.choice`, the day/night switch a `ui.toggle`, the bell, the card's close button and Get out are `ui.button`s, all adopted from the existing markup (`data-lh-slot`). The info card is DOM drawn by the view from `ctx.state.selected`; it is not an overlay (nothing pauses, nothing stacks).
- **Flow state lives in the sim ([S-4], field note #4):** `tool`, `selected`, `driving` and the per-gesture state (`gesture`, `grab`, `hose` nozzle, shoo `ring`, `lastToss`) are fields of the farm's `ctx.state`. Drive mode is farm sub-state (`driving`), not a scene change: the world and camera must survive it.
- **Input is three layers:** actions (keyboard 1–5, B, Esc, E, H, WASD/arrows; the thumb pad; the horn button) are read by a farm system each step; positional input is the `tool` command from `bindPointer` on `#c`, whose `at()` sends camera rays (never hits), so the sim does all picking and a replay reproduces it; camera gestures (one-finger Hand orbit, two-finger orbit/pan/pinch, mouse right/middle drag, wheel, drive chase) stay a view-only listener on the same canvas.
- **Step order matches today's frame loop:** `input.apply`: `lh.input` → `farm.ease` (grab lift and hose nozzle easing, before commands, as the old per-frame easing ran after the frame's steps) → `lh.commands` (`tool` commands) → `farm.keys` (tool keys, bell, back, drive input, horn, auto-right) → `pre`: `lh.scene` → `physics.world`: `farm.sim` (`sim.step()`) → `post`: `farm.events` (drains `sim.events` into `engine.emit`) → `events.flush`. With no input, the farm scene steps exactly the `createSim` the phase-0 golden drives, which P2 proves against the committed golden.
- **Strangler order (ruling 1):** P-E1–P-E5 on the engine; P1 pure prep; P2–P5 the sim half alongside the old code (old `main.js` still ships); P6–P8 a new browser entry `src/entry.js` built only for tests (`PIGPENS_ENTRY`), sharing `template.html` through `data-lh-slot` attributes the old path ignores; P9 flips the entry and deletes the old path; P10 removes `window.piggies`. Pig Pens builds and passes after every task.
- **Async start-up:** the entry awaits `RAPIER.init()` before `boot` (Rally precedent, #6). `createSim` is synchronous, so the farm builds in `enter`, behind the page's own `#loading` screen. No `ctx.load` is needed.

**Tech Stack:** plain JS ES modules, `node:test`, happy-dom (engine view unit tests), `playwright-core` with `lion-hawk/playwright` and the cached Chromium (SwiftShader), esbuild, Rapier `@dimforge/rapier3d-compat` ^0.21, three ^0.186.

**Spec:** `docs/spec.md` §5 (R-1…R-8, S-1…S-5, I-1…I-7, U-1…U-5), §7 (D-1, D-4…D-6, T-1…T-9, T-12, T-16…T-18), §8.2/§8.4. Inputs: `docs/field-notes.md` (#4, #5, #8, #31, #34 and the new #52–#67 from this plan), `docs/plans/2026-10-11-phase-2c-rally.md` (format and strangler precedent), `2026-10-11-phase-2c-rally-notes.md`, `2026-10-11-phase-2d-notes.md` (ruling 6: Pig Pens next). Pig Pens: `games/pig-pens/docs/pig-pens-spec.md` (§3.2–3.4, §10), `pig-pens-v2-spec.md` (§9.3–9.4, §10, §13, §14 defect 8, §16.2–16.3).

## Global Constraints

- **Controller precondition:** this plan and its field notes are committed on `phase-2d`. Before P-E1 the controller creates the engine branch from the tip of `phase-2d` (after the 0.5.1 fix wave): `cd /home/smiller/projects/four43/lion-hawk-engine && git switch -c phase-2e phase-2d`. All P-E tasks commit on `phase-2e`. Refresh the bare backup (`/home/smiller/projects/four43/lion-hawk-engine-backup.git`) at the end, as in earlier phases.
- **Where:**
  - Engine repo `/home/smiller/projects/four43/lion-hawk-engine`, branch `phase-2e` (P-E1–P-E5).
  - Pig Pens in the four43 worktree `/home/smiller/projects/four43/four43-lion-hawk/games/pig-pens`, branch `feat/lion-hawk` (P1–P10). It consumes the engine through `games/node_modules/lion-hawk`, so engine commits are visible at once.
  - Never modify `/home/smiller/projects/four43/four43` (the main checkout). Don't touch Rally or Tractor Pickup (read-only; run their suites).
- **Green after every task:**
  - engine: `cd /home/smiller/projects/four43/lion-hawk-engine && npm test` (270 tests at the start of 2e; the count only grows);
  - workspace: `cd /home/smiller/projects/four43/four43-lion-hawk/games && env -u CI npm test`;
  - Pig Pens: `cd /home/smiller/projects/four43/four43-lion-hawk/games/pig-pens && npm test`; from P6 on also `npm run test:e2e`;
  - after P-E2 and P-E4 also Rally's `npm run test:e2e` and `npm run test:mobile` (797 checks): they use `bindStick` and the Playwright driver.
- **Goldens and ranges:** `test/goldens/farm-seed3.json` and `test/golden.test.mjs` are never changed and never blessed (`LH_BLESS` is not used; P2 even passes `bless: false`). The one new golden file, `test/goldens/farm-scene.json` (P3), is written by its first run and committed. Rally's goldens and its 167.400 s / 167.492 s pair stay. Every new range check is two-sided (#3).
- **Purity:** `src/game.sim.js`, `src/game/`, `src/sim.js`, `src/chickens.js`, `src/flow.js`, `src/layout.js`, `src/tractor.js` stay sim-pure (P1's purity test enforces it). View code (`src/view/`, `src/game.view.js`, `src/devices.js`, `src/entry.js`, `src/main.js`, `farm3d.js`, `gfx.js`, `fur.js`, `tiltshift.js`, `sound.js`) may use the DOM, three.js, timers and `Math.random`; sim code may not. `sim.js`, `chickens.js`, `flow.js`, `layout.js` and `tractor.js` are not edited at all in this phase (the golden proves it).
- **Parity:** every user-visible behaviour listed in "Behaviour parity" below keeps its feel. A change not listed there is a defect; a listed change is reported to the user for the playtest.
- **Builds:** verify with `python3 build.py` (and `PIGPENS_ENTRY=src/entry.js python3 build.py` while the entry is new), then discard the output: `cd /home/smiller/projects/four43/four43-lion-hawk && git checkout -- site/exp/piggie-game && git clean -fdq site/exp/piggie-game && git status --short site/exp` (expected: nothing). No game version bump (stays 2.1.0), no release, no deploy, no push.
- **Engine conventions:** view modules take their environment as options; no allocation per step or per device update in engine code (except the documented per-command and per-move cases); `CHANGELOG.md` and version `0.6.0` in P-E5.
- **Field notes:** each task sets the status of the notes it lands to `done (2e <task>)` in both the index table and the entry's text, in the same commit.
- **Code style:** match each repo: dense, short comments citing spec IDs (`[S-4]`) and field notes (`#54`).
- **Commits:** conventional commits, explicit `git add` paths, **no `Co-Authored-By` trailer and no AI attribution**, no push. Engine: `feat:`/`fix:`/`test:`/`docs:`; Pig Pens: `feat(pig-pens):`/`refactor(pig-pens):`/`test(pig-pens):`.

---

## File structure

**Engine** (`/home/smiller/projects/four43/lion-hawk-engine`)

| File | Change |
|---|---|
| `src/view/pointer.js` | P-E1: `at(clientX, clientY, event, phase)` (#52) |
| `src/view/touch.js` | P-E2: `bindStick({ origin: 'centre' })`, a fixed pad (#53) |
| `testing/invariants.js` (new), `testing/index.js` | P-E3: `invariants.finite(select, label)` (#64) |
| `testing/playwright.js` | P-E4: `game.point(target)` (#65) |
| `test/pointer.test.mjs`, `test/touch.test.mjs`, `test/headless.test.mjs`, `test/playwright.test.mjs` | tests for the above |
| `CHANGELOG.md`, `package.json`, `src/version.js`, `docs/spec.md`, `docs/field-notes.md` | P-E5: 0.6.0 |

**Pig Pens** (`/home/smiller/projects/four43/four43-lion-hawk/games/pig-pens`)

| File | Change |
|---|---|
| `src/game/pick.js` (new) | P1: analytic picks moved out of `farm3d.js`/`main.js` (`planeHit`, `rayDist`, `classify`, `grabTarget`, …) |
| `test/purity.test.mjs`, `test/pick.test.mjs`, `test/rays.mjs` (new) | P1: purity, pick checks, test ray helpers |
| `src/game/farm.js` (new) | P2–P4: `makeFarm({ R }) → { scene, api }`, constants, hints |
| `src/game.sim.js` (new) | P2: `ACTIONS`, `pigPensGame()`, default export, `state`, `debug` |
| `test/flow.test.mjs`, `test/golden-farm.test.mjs` (new) | P2–P4: headless flows, engine-path goldens, replay |
| `test/invariants.test.mjs`, `test/sim.test.mjs` (new); `test/nan.mjs` (deleted) | P5: asserted versions of the print scripts that matter |
| `src/view/rig.js`, `src/view/world.js`, `src/view/hud.js` (new) | P6/P7: camera rig and gestures; the 3D farm (moved from `main.js`); card, hints, badge, eggs |
| `src/devices.js` (new) | P6: pointer; P7: keyboard, thumb pad, horn |
| `src/game.view.js` (new) | P6/P7: `pigPensView({ tilt })` |
| `src/entry.js` (new → `src/main.js` in P9) | P6: the engine browser entry |
| `template.html` | P6: `data-lh-slot`s, `--lh-sa-*` safe areas |
| `build.py`, `package.json` | P6: `PIGPENS_ENTRY`; `test:e2e`; `playwright-core` devDependency |
| `test/serve.mjs`, `test/e2e.browser.mjs` (new) | P6–P8: build-and-serve helper, browser tests |
| `src/main.js`, `src/farm3d.js`, `test/interact*.mjs`, `test/shot.mjs` | P9: replaced / picks removed / deleted |
| `docs/pig-pens-v2-spec.md` | P10 |

---

## Interfaces shared by the Pig Pens tasks

**Actions** (`src/game.sim.js`, `ACTIONS`): axes `throttle` (+1 forward) and `steer` (+1 left); buttons `hand`, `shoo`, `feed`, `hose`, `grab` (keys 1–5), `bell` (B), `back` (Escape: deselect, or get out while driving), `getOut` (E, only while driving), `horn` (H and the horn button).

**The `tool` command** (`bindPointer` type `'tool'`, scene handler on `farm`): data `{ phase: 'down' | 'move' | 'up' | 'cancel' | 'tap' | 'press', pointer, button, kind, ray, aim?, orbit? }`.
- `ray`: `[ox, oy, oz, dx, dy, dz]`, the camera ray through the finger (origin = camera position, unit direction), plain numbers.
- `aim`: only with a finger and a lifting tool: the ray through the point `LIFT[tool]` px above the finger (`hose` 55, `grab` 80). Mouse gestures send no `aim`.
- `orbit: true` on a Hand `tap` whose drag the view turned into a camera orbit (it must not act).
- The view's `at()` returns `null` on `down` while driving or before the camera exists (the gesture is silent), `null` on a Hand `move`, and `null` on a Hand `press` once the view has turned the drag into an orbit.

**Farm state** (`ctx.state` of `farm`; view halves read it as `engine.scene.state`):

| Field | Meaning |
|---|---|
| `sim` | the `createSim(R, { pigs, seed, night })` object (#28: kept here, never in `game.state()`) |
| `tool` | `'hand' \| 'shoo' \| 'feed' \| 'hose' \| 'grab'` |
| `selected` | `null` or `{ kind: 'pig' \| 'bird', i } \| { kind: 'fox' \| 'dog' \| 'tractor' }` |
| `driving` | drive sub-state |
| `gesture` | `null` or `{ tool, pointer, down, target }`: the gesture's tool is the one at `down`; `target` is the Hand pick made at `down` |
| `grab` | `null` or `{ kind: 'pig' \| 'bird', u, ray, aim }` (`u`: the 0→1 lift ease) |
| `hose` | nozzle `{ tx, tz, gx, gz, nx, nz, bx, bz }` (target, goal, eased nozzle, back vector) |
| `ring` | `null` or `[x, z]`: the Shoo target ring |
| `lastToss` | engine time of the last Feed tap |

**Farm API** (`makeFarm({ R }) → { scene, api }`; every function takes the engine first and reads `e.scene.state`): `setTool(e, t)`, `select(e, sel)`, `act(e, target)`, `toggleDoor(e)`, `enterDrive(e)`, `exitDrive(e)`, `ringBell(e)`, `setNight(e, n)`, `pointer(e, d)` (the `tool` handler), `hint(e, text, seconds = 3.2)`; plus `pressing(s)` (Hand down on the tractor, not driving).

**Constants** (`src/game/farm.js`): `TOOLS = ['hand', 'shoo', 'feed', 'hose', 'grab']`, `TOOL_HINT` (today's five strings), `START_HINT` (today's), `PRESS = 0.75`, `TAP = { move: 12, seconds: 0.45 }`, `ORBIT_PX = 10`, `LIFT = { hose: 55, grab: 80 }`, `GRAB_EASE = 0.18`, `GRAB_Y = 1.7`, `TOSS_GAP = 0.18`, `STEER_POW = 1.4`, `FARM_EVENTS = new Set(['hint', 'select', 'door', 'bark', 'hose', 'toss', 'scatter', 'drive'])`.

**Events** (`engine.emit`): everything `createSim` emits, bridged unchanged once per step (`oink`, `squeal`, `munch`, `clean`, `refill`, `bell`, `horn`, `gate`, `daynight`, `fox`, `feathers`, `gulp`, `spit`, `squawk`, `yip`, `lay`, `egg`, `hatch`, `crow`, `cluck`, `flap`, …), plus the farm's own: `hint { text, seconds }`, `select { kind, i? }`, `door { open }`, `bark { x, z }`, `hose { on }`, `toss`, `scatter`, `drive { on }`. No farm type collides with a sim type.

**`game.state(engine)`** (JSON-safe): `{ tool, driving, selected, night, door, gates: [open…], basket, eggs, foods, foodLeft, dog: { active, x, z }, hose: { active, x, z }, ring, grabbed: { pig, bird }, pressing, tractor: { x, z, speed, driven, thr, steer }, counts, time }` (`thr`/`steer` are the tractor's `inThr`/`inSteer`).

**UI control ids** (test ids, all adopted from `template.html`): `farm.tool.{hand,shoo,feed,hose,grab}` (choice, `when` not driving), `farm.night` (toggle), `farm.bell`, `farm.close` (`when` something is selected), `farm.exit` (`when` driving).

**Presets** (`farm.presets`, `engine.jump('farm', name, opts, args)`): `driving`, `night`, `tool { name }`, `selected { kind, i }`.

**`game.debug(engine)`** (→ `window.engine.debug`): `{ sim, farm, tool(name), select(sel), drive(), night(on) }` (`farm` is the farm's `ctx.state`).

**Scene args:** `{ pigs = 48, seed = engine.seed, night = false }`. `boot`'s seed is `?seed=` or 1, today's default, so every first visit still gets the same farm (#58).

---

## Behaviour parity (ruling 5)

Every user-visible behaviour of today's `main.js`, where it lives after the migration, and whether it changes. **Changes are flagged and go to the playtest list.**

| # | Behaviour today | New home | Change |
|---|---|---|---|
| 1 | Tool picker: five buttons, `aria-pressed`, a hint on every pick; keys 1–5 when not driving | `farm.tool` choice (adopted), `hand…grab` actions in `farm.keys`, `hint` event | none |
| 2 | Hand tap (< 12 px, < 450 ms) acts on what was under the finger **at pointer down**: egg → collect; gate → toggle + "Gate open./shut."; fox with a chicken → spit; coop door → toggle + gate sound + hint; pig/bird/fox/dog/tractor → card + pop; empty ground → close the card | `bindPointer` tap; `gesture.target` picked in the sim at `down` (`classify`, P1) | none |
| 3 | Hand drag > 10 px turns into a camera orbit and cancels the hold | view gesture listener (`ORBIT_PX`), `at()` silences the press and flags the tap (`orbit`) | none |
| 4 | Hand hold on the tractor 0.75 s → drive, with a filling ring | `bindPointer` `press: PRESS` on device time → `enterDrive`; ring shown by the view while `pressing` | **below 10 fps the hold takes longer in wall time** (device dt is capped at `maxFrame` 0.1 s; #56); the ring appears one step after the touch |
| 5 | Shoo: down/move send the dog, white ring under the finger, bark on down; up stops | `tool` down/move/up; `ring` in state; `bark` event | none |
| 6 | Feed tap: a snack (five at most, then a hint) or grain in the run (hint when plenty); 180 ms between taps; whoosh/scatter; badge | `tool` tap; `lastToss` on engine time; `toss`/`scatter` events | rate limit quantised to steps (0.18 s = 11 steps) |
| 7 | Hose: aims 55 px above a finger; nozzle placed back toward the camera and to the side, eased; spray, ring, pipe; hose sound; up stops | `aim` ray; nozzle goal and easing in the sim (`farm.ease`); `hose` events; spray/pipe in the view | nozzle eases per step, not per frame (the sim no longer depends on frame rate, #60) |
| 8 | Grab: nearest pig or chicken (fox with a chicken → spit; nothing → hint); lifted to the 1.7 m plane under the pointer; a finger eases 80 px higher over 0.18 s; release throws | `tool` down/move/up; `grab` state; easing in `farm.ease` | **the 0.18 s ease blends the two world hits, not screen pixels** (same start and end, slightly different path while easing, #54) |
| 9 | A second finger cancels the tool gesture; two fingers orbit, pan and pinch (drive: turn the chase offset, pinch distance) | `bindPointer` cancel; view gesture listener | **pointercancel no longer counts as a lift** (a cancelled touch can't tap/toss any more, #61) |
| 10 | Mouse: right-drag orbits, middle-drag pans, wheel zooms, no context menu; left button = tools | view gesture listener; `bindPointer` `filter.button: [0]` | none |
| 11 | Camera: start framing by aspect (phone portrait), clamps, fov by aspect on resize | `src/view/rig.js` | none |
| 12 | Info card: name, type line, activity, bars and facts, refreshed every 6 frames; yellow ring; × and Escape close it | `selected` in the sim; `src/view/hud.js`; `farm.close`; `back` action | none |
| 13 | Drive: card closes, dog stops, engine sound, hint, toolbar hidden; fixed thumb pad (bottom left, travel 36% of its width); WASD/arrows; steering power 1.4; horn button/H; Get out button/E/Escape; auto-right when tipped + hint; chase camera (follows, one-finger drag offsets and recentres, pinch 9–22 m, pitch 0.42); leaving lifts the camera | `driving` sub-state; `farm.keys`; `bindStick({ origin: 'centre' })` (P-E2); `bindHold('#horn')`; `farm.exit`; chase in `rig.js` | **a drive key held before entering drive now counts; W+S (or A+D) held together cancel to 0** (today the later key in the code wins) |
| 14 | Bell (button any time, B when not driving): troughs full, pigs hungry, hint, bell sound | `farm.bell` (function action), `bell` action gated by `driving` | none |
| 15 | Day/night switch: `aria-pressed`, `aria-label`, hints, sky, Zzz, headlights | `farm.night` toggle; label by the view | none |
| 16 | Egg counter with a bump; floating basket number from the nest; reduced motion | view, from `egg` events | none |
| 17 | Snack badge and the Feed button's `aria-label` | view | none |
| 18 | Hints (tools, start, fox/gulp/spit/hatch, gate/door/bell/night/grab/toss, "Back on four wheels.") on frame time | `hint` events from the sim; view timer on engine time ([U-5]) | none |
| 19 | Sounds: sim events through `sound.event`, plus pop/gate/bark/hose/whoosh/scatter/horn/bell/engine; unlocked on the first tap of a game control | view mapping of engine events | **audio unlocks on any first tap or key on the page** (#67) |
| 20 | Tilt-shift (zoom only, `?tilt=0`), shell fur, mud, eyelids, Zzz, feathers, trough food, gate/door animation, sky | moved view code (`world.js`, `farm3d.js`, `fur.js`, `tiltshift.js`) | none |
| 21 | "Waking the pigs…" loading screen and its error text | entry | none |
| 22 | `?pigs=` (48), `?seed=` (1), `?tilt=0` | scene args, `boot` seed, view option | none |
| 23 | iOS: `--app-h`, gesture and double-tap zoom blocks, PWA registration | `template.html` (unchanged scripts) | none |
| 24 | Sim loop: 60 Hz, ≤ 4 steps per frame, frame dt ≤ 0.1 s; hidden tab stops | `sim: { hz: 60, maxCatchUp: 4, maxFrame: 0.1 }`; driver | the sub-step remainder after a capped frame is kept, not zeroed (invisible, #66) |
| 25 | A gesture started with one tool finishes with it | `gesture.tool` | today a tool switch mid-drag ran the new tool's lift (edge case); now the gesture's own tool ends it |
| 26 | `window.piggies` debug hook | `window.engine` (+ `debug`); a thin alias until P10 | dev-facing: removed in P10 |

---

### Task P-E1: `at()` learns the phase (`src/view/pointer.js`)

Field note #52.

**Interfaces:** `bindPointer`'s `at(clientX, clientY, event, phase)`: `phase` is the command phase being built (`'down' | 'move' | 'up' | 'cancel' | 'tap' | 'press'`); `event` stays the pointer event for down/up and `undefined` for the move and press that `update(dt)` sends and for cancels. Existing three-argument `at()` functions are unaffected.

- [ ] **Step 1: Write the failing test** (add to `test/pointer.test.mjs`):
```js
test('2e: at() gets the phase as its fourth argument, so a game can silence moves but keep the press (#52)', () => {
  const seen = [];
  const s = setup({ press: 0.1, at: (x, y, ev, phase) => { seen.push([phase, ev === undefined]); return phase === 'move' ? null : { x }; } });
  s.ev(s.el, 'pointerdown', 1, 50, 50); s.ev(s.window, 'pointermove', 1, 52, 50); s.p.update(0.016);
  s.p.update(0.1); s.ev(s.window, 'pointerup', 1, 52, 50);
  assert.deepEqual(s.phases(), ['down', 'press', 'up']); // the move was silenced by at(), the press was not
  assert.deepEqual(seen, [['down', false], ['move', true], ['press', true], ['up', false]]);
  seen.length = 0; s.ev(s.el, 'pointerdown', 2, 50, 50); s.ev(s.window, 'pointerup', 2, 50, 50);
  assert.deepEqual(s.phases(), ['down', 'up', 'tap']); assert.deepEqual(seen.map(x => x[0]), ['down', 'up', 'tap']);
  seen.length = 0; s.ev(s.el, 'pointerdown', 3, 50, 50); s.window.dispatchEvent(new s.window.Event('blur'));
  assert.deepEqual(s.phases(), ['down', 'cancel']); assert.deepEqual(seen, [['down', false], ['cancel', true]]);
});
```
- [ ] **Step 2: Run it:** `node --test test/pointer.test.mjs`. Expected: FAIL (the fourth argument is `undefined`).
- [ ] **Step 3: Implement:** `send(phase, x, y, ev)` calls `at(x, y, ev, phase)`; `onDown` calls `at(e.clientX, e.clientY, e, 'down')`. Update the header comment and the spec line in P-E5.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/view/pointer.js test/pointer.test.mjs docs/field-notes.md && git commit -m "feat(view): bindPointer passes the phase to at() (#52)"`

---

### Task P-E2: A fixed-centre thumb pad (`src/view/touch.js`)

Field notes #53, #8.

**Decision (ruling 3, stick origin): add `origin: 'centre'`; do not accept the floating stick.** Pig Pens' pad is a visible, always-present control in a fixed corner (`#stick`, 132 px): a touch anywhere on it deflects at once from the pad's centre (`main.js:489-497`), which is the mental model the game teaches ("push the stick"). The floating stick would hide the pad when idle (`base.hidden = true` on adoption and release), move it under the thumb (`base.style.left/top`), and make the first touch read zero, so a child's tap-and-hold off-centre would stop driving. That is a feel change on the core drive control, while the engine change is small (one branch in `onDown`, no new per-move work) and also fits Tractor Pickup's on-screen pads. The "scene-scoped stick" part of #8 is not needed: `#drive` is `display: none` outside drive mode, so the pad gets no pointers, and the sim ignores `throttle`/`steer` unless `driving`.

**Interfaces:** `bindStick(engine, { …, origin = 'thumb' })`:
- `origin: 'centre'` needs `base` (adopted) and throws `bindStick: origin 'centre' needs a base` without one; any other value than `'thumb'`/`'centre'` throws `bindStick: origin must be 'thumb' or 'centre'`.
- With `'centre'`, on `pointerdown` the origin is the centre of `base.getBoundingClientRect()` and the down position is applied at once as the first move (knob transform and values); the base is never hidden, shown or moved (not on bind, release or dispose); release resets the knob transform and writes zeros; `radius`, `deadZone`, `edge`, `--lh-r`, `data-lh-active` and `preventDefault` behave as today.
- `'thumb'` (default) is today's floating stick, unchanged.

- [ ] **Step 1: Write the failing test** (add to `test/touch.test.mjs`):
```js
test('2e: origin centre: a fixed pad deflects from its centre at once and is never hidden or moved (#53)', () => {
  const s = setup();
  const base = s.document.createElement('div'), knob = s.document.createElement('div'); base.appendChild(knob); s.document.body.appendChild(base);
  base.getBoundingClientRect = () => ({ left: 100, top: 200, width: 132, height: 132, right: 232, bottom: 332, x: 100, y: 200 }); // centre (166, 266)
  const h = bindStick(s.engine, { root: base, base, knob, origin: 'centre', x: ['steer', -1], y: ['throttle', 1], radius: () => 50, deadZone: 0, edge: 0, doc: s.document });
  assert.equal(base.hidden, false);
  s.ev(base, 'pointerdown', 1, 166, 241); // 25 px above the centre: half throttle on the touch itself
  let v = s.v(); assert.equal(v.throttle, 0.5); assert.equal(v.steer, 0);
  assert.equal(knob.style.transform, 'translate(0px, -25px)'); assert.equal(base.style.left, ''); assert.equal(base.hidden, false);
  assert.equal(base.style.getPropertyValue('--lh-r'), '50px'); assert.equal(base.hasAttribute('data-lh-active'), true);
  s.ev(s.window, 'pointermove', 1, 266, 266); v = s.v(); assert.equal(v.steer, -1); assert.equal(v.throttle, 0); // clamped radially
  s.ev(s.window, 'pointerup', 1); v = s.v(); assert.equal(v.steer, 0); assert.equal(base.hidden, false); assert.equal(knob.style.transform, '');
  h.dispose(); assert.equal(base.hidden, false); assert.equal(base.isConnected, true);
  assert.throws(() => bindStick(s.engine, { root: base, x: ['steer', 1], origin: 'centre', doc: s.document }), /origin 'centre' needs a base/);
  assert.throws(() => bindStick(s.engine, { root: base, base, x: ['steer', 1], origin: 'middle', doc: s.document }), /origin must be 'thumb' or 'centre'/);
});
```
- [ ] **Step 2: Run it:** `node --test test/touch.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Factor today's `onMove` body into a `moveTo(clientX, clientY)` used by both `onMove` and the centre-mode `onDown`; skip every `base.hidden`/`left`/`top` write in centre mode. The thumb-mode tests must pass unchanged.
- [ ] **Step 4: Run** engine `npm test`, the workspace suite, and Rally's `npm run test:e2e` and `npm run test:mobile` (its slider is a thumb-origin stick). Expected: all pass, 797 mobile checks.
- [ ] **Step 5: Commit** (engine): `git add src/view/touch.js test/touch.test.mjs docs/field-notes.md && git commit -m "feat(view): bindStick origin 'centre' for a fixed thumb pad (#53, #8)"`

---

### Task P-E3: A selectable finite invariant (`testing/invariants.js`)

Field note #64.

**Interfaces:** `lion-hawk/test` exports `invariants.finite(select, label = 'state')`: `select(h)` returns any plain value; the returned invariant `(h) => void` walks it with `assertFinite` and, on the first non-finite number, throws `finite: <label path> is not finite: <value> (seed <s>, step <n>)`. `select` must be a function (`invariants.finite: select must be a function`). [T-1]'s always-on `finite()` over `xf`/bodies still arrives with the phase 4 `World`.

- [ ] **Step 1: Write the failing test** (add to `test/headless.test.mjs`; import `invariants` from `../testing/index.js`):
```js
test('2e: invariants.finite names the path, seed and step of the first non-finite value (#64)', () => {
  const g = defineGame({ id: 'nanny', start: 's', scenes: { s: {
    enter(e, c) { c.state.b = { x: 1, list: [1, 2] }; },
    step(e, dt, c) { if (e.time.step === 4) c.state.b.x = NaN; },
  } } });
  const h = headless(g, { seed: 7, invariants: [invariants.finite(x => x.engine.scene.state.b, 'bird')] });
  h.step(4);
  assert.throws(() => h.step(1), /finite: bird\.x is not finite: NaN \(seed 7, step 5\)/);
  assert.throws(() => invariants.finite('nope'), /select must be a function/);
});
```
- [ ] **Step 2: Run it:** `node --test test/headless.test.mjs`. Expected: FAIL (`invariants` is not exported).
- [ ] **Step 3: Implement** `testing/invariants.js` (uses `assertFinite` from `./state.js`; reads `h.seed` and `h.engine.time.step`) and export it from `testing/index.js`.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add testing/invariants.js testing/index.js test/headless.test.mjs docs/field-notes.md && git commit -m "feat(test): invariants.finite over a selected value (#64)"`

---

### Task P-E4: `game.point(target)` (`testing/playwright.js`)

Field note #65.

**Interfaces:** the game driver gains `point(target) → Promise<{ x, y }>`: the same resolution the touch helpers use (a CSS selector string → the centre of its first match's box; `{ x, y }` as is; `{ world: [x, y, z] }` through `window.engine.view.project`, failing with today's message when the game sets no `project`). Desktop tests use it with `page.mouse` for clicks and drags on world points.

- [ ] **Step 1: Write the failing test** (add to `test/playwright.test.mjs`):
```js
test('2e: game.point resolves a selector, {x, y} or { world } to client coordinates (#65)', async () => {
  const page = {
    locator: () => ({ first: () => ({ boundingBox: async () => ({ x: 10, y: 20, width: 40, height: 60 }) }) }),
    evaluate: async (fn, w) => ({ x: w[0] * 2, y: w[2] * 2 }),
  };
  const g = gameDriver({ page, context: {}, preset: presets.desktop, presetName: 'desktop' });
  assert.deepEqual(await g.point('#stick'), { x: 30, y: 50 });
  assert.deepEqual(await g.point({ x: 3, y: 4 }), { x: 3, y: 4 });
  assert.deepEqual(await g.point({ world: [1, 0, 5] }), { x: 2, y: 10 });
});
```
- [ ] **Step 2: Run it:** `node --test test/playwright.test.mjs`. Expected: FAIL (`g.point` is not a function).
- [ ] **Step 3: Implement:** expose the existing internal `point` as `game.point`. No behaviour change for `touch.*`.
- [ ] **Step 4: Run** engine `npm test` (including the Chromium e2e and touch-e2e tests), the workspace suite, and Rally's `npm run test:e2e` and `npm run test:mobile`. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add testing/playwright.js test/playwright.test.mjs docs/field-notes.md && git commit -m "feat(playwright): game.point resolves touch targets for mouse tests (#65)"`

---

### Task P-E5: Engine 0.6.0 (changelog, spec, version)

- [ ] **Step 1:** Bump `package.json` and `src/version.js` to `0.6.0` (the package test checks they agree).
- [ ] **Step 2:** `CHANGELOG.md`: a `## 0.6.0 — <date>` entry, "Phase 2e, the engine additions Pig Pens' migration needs": `at(x, y, event, phase)` in `bindPointer` (#52); `bindStick({ origin: 'centre' })` (#53); `invariants.finite(select, label)` in `lion-hawk/test` (#64); `game.point(target)` (#65). No behaviour changes for existing callers.
- [ ] **Step 3:** `docs/spec.md`, one line each, no new IDs: [I-2] `bindPointer`'s `at()` gets the phase; the touch stick takes `origin: 'thumb' | 'centre'` (a fixed pad); [T-1] `invariants.finite(select)` until the World's always-on check; [T-17] `game.point(target)`.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add package.json src/version.js CHANGELOG.md docs/spec.md docs/field-notes.md && git commit -m "docs: lion-hawk 0.6.0 changelog and spec notes for the 2e additions"`

---

### Task P1: Pure picks, purity test, test rays

Field notes #60, #62.

**Files:** `src/game/pick.js` (new), `test/pick.test.mjs` (new), `test/purity.test.mjs` (new), `test/rays.mjs` (new).

**Interfaces** (`src/game/pick.js`, all pure; `r` is a `[ox, oy, oz, dx, dy, dz]` ray with a unit direction):
- `planeHit(r, y) → { x, y, z } | null` (today's `planeHit`: null when `|dy| < 1e-4` or behind the origin).
- `rayDist(r, x, y, z)`: three's `Ray.distanceToPoint` (distance to the origin when the point is behind it).
- `pickGate(lay, x, z)`, `pickDoor(lay, x, z)`, `pickEgg(flock, r)`, `foxHit(flock, r)`, `tractorHit(tractor, r)`, `dogHit(dog, r)`: moved verbatim from `farm3d.js` and `main.js:452` (same tolerances: gate 1.5, door 1.3, egg 0.45 at y 0.12, fox 0.9 at y 0.4 and not `FST.AWAY`, tractor 2.1 at y 1.2, dog 0.8 at y 0.4).
- `classify(sim, r) → null | { kind: 'egg', id } | { kind: 'pig' | 'bird', i } | { kind: 'fox' | 'dog' | 'door' | 'tractor' } | { kind: 'gate', id }`: today's `classify` (`main.js:443-457`): egg first; then the nearest animal by today's distances (`pig` from `sim.pick`, `bird` from `flock.pick` minus 0.4, `fox` minus 0.6, `dog`), ties to the earlier candidate (stable sort); then gate, door (ground hit at y 0); then tractor.
- `grabTarget(sim, r) → null | { kind: 'pig' | 'bird', i } | { kind: 'fox' }`: today's grab pick (`main.js:538-545`): pig if `dp <= db`, bird otherwise; `fox` only when neither and `foxHit` and the fox carries a chicken.
- `test/rays.mjs`: `rayTo([x, y, z], up = 20, back = 15)` (an eye `up` m above and `back` m toward +z, looking at the point, unit direction), `tool(h, phase, at, extra)` (issues `h.command('tool', { phase, pointer: 1, button: 0, kind: 'touch', ray: rayTo(at), ...extra })`), `tapAt(h, at, extra)` (down, up and tap, then one step), `findPig(sim)` (a pig `classify` picks when aimed at), `emptyAt(sim)` (a field point `classify` returns null for), `waitFor(h, at, kind, opts)` (steps until `classify` at `at` with a near-vertical ray gives `kind`).

- [ ] **Step 1: Write the tests.** `test/purity.test.mjs`:
```js
// L-3 / T-12: Pig Pens' sim half never touches three.js, the DOM, the wall clock, Math.random, browser storage or timers,
// and never imports a view module (lion-hawk 2e P1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const SIM = ['game.sim.js', 'game', 'sim.js', 'chickens.js', 'flow.js', 'layout.js', 'tractor.js'].map(p => join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RULES = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(main|entry|game\.view|devices|farm3d|gfx|fur|tiltshift|sound|view\/[^'"]*)(\.js)?['"]/];

test('sim modules pass the engine purity scan', () => { assert.deepEqual(scanPurity(SIM), []); });
test('sim modules use no browser storage or timers and import no view module', () => {
  const bad = SIM.flatMap(files).flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => RULES.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
```
`test/pick.test.mjs`:
```js
// The analytic picks moved out of main.js/farm3d.js (lion-hawk 2e P1): ray maths against three.js, and today's priorities.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { planeHit, rayDist, classify, grabTarget, pickGate, pickDoor } from '../src/game/pick.js';
import { rayTo } from './rays.mjs';
await RAPIER.init();

test('rayDist matches three.js Ray.distanceToPoint, behind-the-origin included', () => {
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40 - 20;
  for (let k = 0; k < 300; k++) {
    const o = new THREE.Vector3(rnd(), rnd(), rnd()), d = new THREE.Vector3(rnd(), rnd(), rnd()).normalize(), p = new THREE.Vector3(rnd(), rnd(), rnd());
    const want = new THREE.Ray(o, d).distanceToPoint(p), got = rayDist([o.x, o.y, o.z, d.x, d.y, d.z], p.x, p.y, p.z);
    assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`);
  }
});
test('planeHit: a hit, a parallel ray and a plane behind the eye', () => {
  const h = planeHit(rayTo([3, 0, -2]), 0); assert.ok(Math.abs(h.x - 3) < 1e-12 && Math.abs(h.z + 2) < 1e-12 && h.y === 0);
  assert.equal(planeHit([0, 1, 0, 1, 0, 0], 0), null); assert.equal(planeHit([0, 1, 0, 0, 1, 0], 0), null);
});
test('classify: an egg wins over everything; a pig is a pig; empty ground is null; gates and the coop door', () => {
  const sim = createSim(RAPIER, { pigs: 24, seed: 3 }); for (let i = 0; i < 30; i++) sim.step();
  const n = sim.lay.nests[1]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  assert.deepEqual(classify(sim, rayTo([n.x, 0.12, n.z], 20, 0.01)), { kind: 'egg', id: 999 });
  const p = sim.pigs.find(q => { const c = classify(sim, rayTo([q.px, q.py, q.pz])); return c?.kind === 'pig' && c.i === q.i; });
  assert.ok(p, 'some pig is pickable'); assert.equal(classify(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(grabTarget(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(pickGate(sim.lay, sim.lay.gates[1].x, sim.lay.gates[1].z), sim.lay.gates[1]);
  const c = sim.lay.coop; assert.equal(pickDoor(sim.lay, c.doorX, c.z + c.hz + 0.5), true);
  assert.equal(classify(sim, rayTo([sim.lay.field.x0 - 30, 0, sim.lay.field.z0 - 30])), null);
});
```
- [ ] **Step 2: Run them:** `node --test test/purity.test.mjs test/pick.test.mjs`. Expected: purity PASSES already (the sim modules are pure today; the test guards the new files); pick FAILS (`../src/game/pick.js` missing).
- [ ] **Step 3: Implement** `src/game/pick.js` and `test/rays.mjs`. **(judgment)** Copy the bodies, don't re-derive them: `rayDist` is three's `distanceToPoint` (`t = (p - o)·d`, `t < 0` → distance to `o`), and the `classify` candidate list keeps today's insertion order so ties resolve the same way. `farm3d.js` and `main.js` stay untouched until P9.
- [ ] **Step 4: Run** Pig Pens `npm test`, the workspace suite and the build check. Expected: all pass, `site/exp` clean.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/game/pick.js games/pig-pens/test/pick.test.mjs games/pig-pens/test/purity.test.mjs games/pig-pens/test/rays.mjs && git commit -m "refactor(pig-pens): pure analytic picks, sim purity test and test rays"`

---

### Task P2: `game.sim.js`: the farm scene core and the engine-path golden

Field notes #4, #28, #57, #58, #66.

**Files:** `src/game/farm.js` (new), `src/game.sim.js` (new), `test/flow.test.mjs` (new), `test/golden-farm.test.mjs` (new).

**Interfaces** (see the shared interfaces; P2 delivers the subset below, P3 the `tool` command, P4 drive):
- `src/game.sim.js`: `export const ACTIONS` (as above); `export function pigPensGame()` → `defineGame({ id: 'pig-pens', sim: { hz: 60, maxCatchUp: 4, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm', scenes: { farm }, state, debug })`; `export default pigPensGame()`. Imports `R` from `@dimforge/rapier3d-compat` (initialised by the caller).
- `makeFarm({ R })` → `{ scene, api }`, scene:
  - `enter(e, ctx)`: `ctx.state` = `{ sim: createSim(R, { pigs: a.pigs ?? 48, seed: a.seed ?? e.seed, night: !!a.night }), tool: 'hand', selected: null, driving: false, gesture: null, grab: null, ring: null, lastToss: -Infinity, hose: { tx: 0, tz: 0, gx: 0, gz: 0, nx: 0, nz: 0, bx: 0, bz: 1 } }` (`a = ctx.args ?? {}`); systems `farm.ease` (`input.apply`, after `lh.input`, before `lh.commands`; empty until P3), `farm.keys` (`input.apply`, after `lh.commands`: tool keys, `bell` and `back` when not driving; P4 adds driving), `farm.sim` (`physics.world`: `s.sim.step()`), `farm.events` (`post`: `for (const ev of s.sim.events.splice(0)) e.emit(ev.type, ev)`); then `api.hint(e, START_HINT, 5)`.
  - `exit(e, ctx)`: `ctx.state.sim.world.free()` ([S-3]).
  - `ui(u)`: `farm.tool` choice (`when: !driving`, `set: (v, e) => api.setTool(e, v)`), `farm.night` toggle (`get: sim.clock.night`, `set: (v, e) => api.setNight(e, v)`), `farm.bell` (`action: e => api.ringBell(e)`), `farm.close` (`when: selected`, `action: e => api.select(e, null)`), `farm.exit` (`when: driving`, `action: e => api.exitDrive(e)`; P4 implements `exitDrive`).
- `api.setTool(e, t)`: `tool = t`, `hint(TOOL_HINT[t])`. `api.ringBell(e)`: `sim.bell()`, hint "Dinner time. Every trough is full." 2.5 s. `api.setNight(e, n)`: `sim.setNight(n)`, then today's hints (night 4.5 s; morning 3.5 s, text by `lay.coop.open`). `api.select(e, sel)`: store a copy; emit `select` when not null. `api.hint(e, text, seconds = 3.2)`: emit `hint { text, seconds }`.
- `state(e)` and `debug(e)` as in the shared interfaces (`pressing` false until P3).

- [ ] **Step 1: Write the failing tests.** `test/golden-farm.test.mjs`:
```js
// The engine path (lion-hawk 2e P2): with no input, headless(pigPensGame) steps the same createSim the phase-0 golden
// drives directly, so it must reproduce goldens/farm-seed3.json bit-for-bit. Never blessed from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { FARM_EVENTS } from '../src/game/farm.js';
import { DT } from '../src/sim.js';
await R.init();

const STEPS = 1200;
const snapshot = sim => ({
  counts: [...sim.counts],
  troughs: sim.troughs.map(t => t.level),
  pigs: sim.pigs.map(p => ({ x: p.px, z: p.pz, state: p.state, hunger: p.hunger })),
});
function run() {
  const h = headless(pigPensGame(), { seed: 3, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, trail = [];
  for (let i = 0; i < STEPS; i++) {
    h.step(1);
    if (i % 60 === 59) { assertFinite(snapshot(sim), `step${i}`); trail.push(checksum(snapshot(sim))); }
  }
  const events = h.events.filter(e => !FARM_EVENTS.has(e.type)).map(e => `${e.step}:${e.type}`);
  return { state: snapshot(sim), events, trail };
}

test('the sim rate is the herd step', () => { assert.equal(1 / pigPensGame().sim.hz, DT); });
test('the farm scene reproduces the phase-0 sim golden (seed 3, 24 pigs, 1200 steps) bit-for-bit', () => {
  golden(new URL('./goldens/farm-seed3.json', import.meta.url), run(), { bless: false });
});
```
`test/flow.test.mjs`:
```js
// Headless flows (lion-hawk 2e, [T-1]–[T-5], [T-9]): Pig Pens' farm scene, its controls, tools and drive mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, canonical } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { TOOLS, START_HINT, TOOL_HINT } from '../src/game/farm.js';
await R.init();

const ARGS = { pigs: 24 };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);

test('the farm starts with the Hand and the start hint; the picker and keys 1–5 switch tools', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS });
  assert.equal(h.scene.name, 'farm'); assert.deepEqual(h.scene.overlays, []);
  assert.equal(h.state().tool, 'hand'); assert.equal(h.state().driving, false); assert.equal(h.state().selected, null);
  h.step(1); assert.deepEqual(hints(h, 0), [START_HINT]);
  let m = h.mark(); h.tap('farm.tool.hose'); h.step(1);
  assert.equal(h.state().tool, 'hose'); assert.deepEqual(hints(h, m), [TOOL_HINT.hose]);
  m = h.mark(); h.step(1, { grab: true }); h.step(1);
  assert.equal(h.state().tool, 'grab'); assert.deepEqual(hints(h, m), [TOOL_HINT.grab]);
  assert.deepEqual(h.engine.ui.tree().filter(c => c.group === 'farm.tool').map(c => [c.id, c.pressed]), TOOLS.map(t => [`farm.tool.${t}`, t === 'grab']));
});

test('the bell fills the troughs; the day/night switch; state is JSON-safe', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS }); h.step(60);
  const sim = h.engine.scene.state.sim;
  let m = h.mark(); h.tap('farm.bell'); h.step(1);
  assert.ok(sim.troughs.every(t => t.level > 0.99)); assert.equal(h.events.since(m).count('bell'), 1);
  assert.deepEqual(hints(h, m), ['Dinner time. Every trough is full.']);
  m = h.mark(); h.step(1, { bell: true }); assert.equal(h.events.since(m).count('bell'), 1); // the B key
  m = h.mark(); h.tap('farm.night'); h.step(1);
  assert.equal(h.state().night, true); assert.equal(h.events.since(m).first('daynight').night, true); assert.match(hints(h, m)[0], /^Night time/);
  m = h.mark(); h.tap('farm.night'); h.step(1); assert.equal(h.state().night, false); assert.match(hints(h, m)[0], /^Good morning!/);
  assert.equal(h.enabled('farm.close'), false); assert.equal(h.enabled('farm.exit'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state())), h.state());
});

test('the engine path is deterministic: same seed and commands, bit-identical state', () => {
  const run = () => { const h = headless(pigPensGame(), { seed: 9, args: ARGS }); h.step(120); h.tap('farm.bell'); h.step(240); return canonical(h.state(), { digits: 15 }); };
  assert.equal(run(), run());
});
```
- [ ] **Step 2: Run them:** `node --test test/golden-farm.test.mjs test/flow.test.mjs`. Expected: FAIL (`../src/game.sim.js` missing).
- [ ] **Step 3: Implement** `src/game/farm.js` and `src/game.sim.js`. **(judgment)** The parity golden passes only if nothing the farm adds touches the sim when there is no input: `farm.ease` and `farm.keys` must not call `setInput`, `moveGrab`, `setHose` or `setDog` unless their state says so, and `farm.events` must bridge in step order without filtering. If the golden differs, find the stray call; never bless. If `world.free()` on exit complains about the vehicle controller, free it first (`world.removeVehicleController`).
- [ ] **Step 4: Run** Pig Pens `npm test` (the phase-0 `golden.test.mjs` passes untouched), the workspace suite and the build check. Expected: all pass (the old path is unchanged).
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/game/farm.js games/pig-pens/src/game.sim.js games/pig-pens/test/flow.test.mjs games/pig-pens/test/golden-farm.test.mjs && git commit -m "feat(pig-pens): game.sim.js with the farm scene, its controls and the engine-path golden"`

---

### Task P3: The `tool` command: Hand, Shoo, Feed, Hose and Grab in the sim

Field notes #5, #54, #55, #60, #61.

**Files:** `src/game/farm.js`, `test/flow.test.mjs`, `test/golden-farm.test.mjs`.

**Interfaces:** `api.pointer(e, d)` (registered in `enter` as `ctx.command('tool', (e, d) => api.pointer(e, d))`):
- `down`: ignored while driving; otherwise `gesture = { tool, pointer, down: true, target: null }`. Later phases apply only to the same `pointer` and use `gesture.tool`. `up`/`cancel` set `gesture.down = false` (the gesture stays for its `tap`; the next `down` replaces it).
- **Hand:** `down` → `target = classify(sim, d.ray)`; `press` → if `gesture.down` and `target.kind === 'tractor'` and not driving, `enterDrive` and `target = null`; `tap` → unless `d.orbit`, `act(e, gesture.target)`.
- `act(e, t)`: `null` → `select(null)`; `egg` → `flock.collectEgg(id)`; `gate` → `sim.setGate(id, !open)` + "Gate open." / "Gate shut." 1.2 s; `fox` with a chicken → `flock.tapFox()`; `door` → `toggleDoor` (flip `lay.coop.open`, emit `door { open }`, today's hint, 2 s); otherwise `select(t)` (`tractor` → `{ kind: 'tractor' }`).
- **Shoo:** `down`/`move` → hit at y 0: `sim.setDog(x, z, true)`, `ring = [x, z]`, and on `down` emit `bark { x, z }`; `up`/`cancel` → `sim.setDog(null, null, false)`, `ring = null`.
- **Feed:** `tap` → `toss(e, d.ray)`: skip if `e.time.sim - lastToss < TOSS_GAP - 1e-9`, else `lastToss = e.time.sim`; hit at y 0 clamped to the field ±1; `back` = unit horizontal vector from the hit to the ray origin (zero stays zero); in the run → `flock.scatterGrain(x + bx·2.5, 1.6, z + bz·2.5, x, z)` (false → "Plenty of grain down already. Let them peck." 2.2 s; true → emit `scatter`); otherwise `sim.tossFood(x + bx·5, 3.5, z + bz·5, x, z)` (null → "That’s all the snacks for now. Wait for the pigs to finish." 2.5 s; else emit `toss { kind }`).
- **Hose:** `down`/`move` → hit of `d.aim ?? d.ray` at y 0; if there is one, `aimHose`: `back` from the hit to `d.ray`'s origin (zero → `(0, 1)` in x/z), `side = (-bz, bx)`, goal `= hit + back·5.2 + side·1.2`; if `sim.hose.active` was false, the nozzle snaps to the goal; `sim.setHose(x, z, true, nx, nz)`; on `down` emit `hose { on: true }`. `up`/`cancel` → `sim.setHose(null, null, false)`, emit `hose { on: false }`.
- **Grab:** `down` → `grabTarget(sim, d.ray)`: `fox` → `flock.tapFox()`; `null` → "Touch a pig or a chicken to pick it up." 1.8 s; pig/bird → `sim.grab(i)` / `flock.grab(i)`, `grab = { kind, u: 0, ray, aim }`, `moveGrab`. `move` → update `ray`/`aim`, `moveGrab`. `up`/`cancel` → `release()` on the holder, `grab = null`.
- `moveGrab(e)`: `a = planeHit(ray, GRAB_Y)`; `b = aim && u > 0 ? planeHit(aim, GRAB_Y) : a`; skip if either is null; target `a + (b − a)·u` at y 1.7 (pig) or 1.4 (bird).
- `farm.ease` (each step, before commands): a held grab with an `aim` and `u < 1` → `u = min(1, u + dt / GRAB_EASE)`, `moveGrab`; an active hose → nozzle `n += (g − n)·min(1, dt·6)`.
- `pressing(s)` = `s.gesture?.tool === 'hand' && s.gesture.down && s.gesture.target?.kind === 'tractor' && !s.driving`.

- [ ] **Step 1: Write the failing tests** (append to `test/flow.test.mjs`; add `import { ST } from '../src/sim.js'; import { classify } from '../src/game/pick.js'; import { tool, tapAt, rayTo, findPig, emptyAt, waitFor } from './rays.mjs'; import { replay } from 'lion-hawk/test';`):
```js
const farm = (seed = 3, args = ARGS) => { const h = headless(pigPensGame(), { seed, args }); h.step(30); return { h, s: h.engine.scene.state, sim: h.engine.scene.state.sim }; };
const pen = (sim, i) => [sim.lay.pens[i].cx, 0, sim.lay.pens[i].cz];

test('Hand: a tap on a pig opens its card; empty ground and Escape close it (#55)', () => {
  const { h, sim } = farm(), p = findPig(sim), at = [p.px, p.py, p.pz];
  let m = h.mark(); tapAt(h, at);
  assert.deepEqual(h.state().selected, { kind: 'pig', i: p.i }); assert.equal(h.events.since(m).count('select'), 1);
  assert.equal(h.enabled('farm.close'), true);
  tapAt(h, emptyAt(sim)); assert.equal(h.state().selected, null);
  tapAt(h, at); h.step(1, { back: true }); assert.equal(h.state().selected, null);
  tapAt(h, at); h.tap('farm.close'); assert.equal(h.state().selected, null);
});

test('Hand: the tap acts on what was under the finger at pointer down; an orbit drag does not tap (#55)', () => {
  const { h, sim } = farm(), p = findPig(sim), at = [p.px, p.py, p.pz], empty = emptyAt(sim);
  tool(h, 'down', at); h.step(1); tool(h, 'up', empty); tool(h, 'tap', empty); h.step(1);
  assert.deepEqual(h.state().selected, { kind: 'pig', i: p.i });
  h.tap('farm.close'); tool(h, 'down', at); tool(h, 'up', at); tool(h, 'tap', at, { orbit: true }); h.step(1);
  assert.equal(h.state().selected, null);
});

test('Hand: gates, the coop door and an egg', () => {
  const { h, sim } = farm(), lay = sim.lay, g = lay.gates[1], G = [g.x, 0, g.z];
  waitFor(h, G, 'gate'); const was = g.open; let m = h.mark(); tapAt(h, G, { ray: rayTo(G, 20, 0.01) });
  assert.equal(g.open, !was); assert.equal(h.events.since(m).first('gate').id, g.id); assert.deepEqual(hints(h, m), [g.open ? 'Gate open.' : 'Gate shut.']);
  const c = lay.coop, D = [c.doorX, 0, c.z + c.hz + 0.5];
  waitFor(h, D, 'door'); m = h.mark(); tapAt(h, D, { ray: rayTo(D, 20, 0.01) });
  assert.equal(h.state().door, false); assert.equal(h.events.since(m).first('door').open, false); assert.match(hints(h, m)[0], /^Coop door shut/);
  const n = lay.nests[1], E = [n.x, 0.12, n.z]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  m = h.mark(); tapAt(h, E, { ray: rayTo(E, 20, 0.01) });
  assert.equal(h.state().basket, 1); assert.equal(h.events.since(m).count('egg'), 1);
});

test('Hand: holding the tractor shows the ring, then drives; the lift after the press does nothing', () => {
  const { h, sim } = farm(), t = sim.tractor, T = [t.x, 1.2, t.z];
  waitFor(h, T, 'tractor');
  tool(h, 'down', T, { ray: rayTo(T, 20, 0.01) }); h.step(1); assert.equal(h.state().pressing, true);
  tool(h, 'press', T, { ray: rayTo(T, 20, 0.01) }); h.step(1);
  assert.equal(h.state().driving, true); assert.equal(t.driven, true); assert.equal(h.state().pressing, false);
  tool(h, 'up', T); tool(h, 'tap', T); h.step(1); assert.equal(h.state().driving, true); assert.equal(h.state().selected, null);
  assert.equal(h.enabled('farm.tool.feed'), false); assert.equal(h.enabled('farm.exit'), true);
});

test('Shoo: down and moves steer the dog and the ring; up, a cancel and a mid-drag tool switch stop it', () => {
  const { h, sim } = farm(), P = pen(sim, 1);
  h.tap('farm.tool.shoo'); let m = h.mark(); tool(h, 'down', P); h.step(1);
  assert.equal(sim.dog.active, true); assert.ok(Math.abs(h.state().ring[0] - P[0]) < 1e-9); assert.equal(h.events.since(m).count('bark'), 1);
  tool(h, 'move', [P[0] + 1, 0, P[2]]); h.step(1); assert.ok(Math.abs(sim.dog.tx - (P[0] + 1)) < 1e-9);
  tool(h, 'up', P); h.step(1); assert.equal(sim.dog.active, false); assert.equal(h.state().ring, null);
  tool(h, 'down', P); tool(h, 'cancel', P); h.step(1); assert.equal(sim.dog.active, false); // a second finger
  tool(h, 'down', P); h.step(1); h.tap('farm.tool.feed'); tool(h, 'up', P); tool(h, 'tap', P); h.step(1);
  assert.equal(sim.dog.active, false); assert.equal(sim.foods.length, 0); // the gesture ends as a Shoo
});

test('Feed: a tap tosses (five at most, then a hint), 0.18 s apart; grain in the run; no tap, no toss', () => {
  const { h, sim } = farm(); h.tap('farm.tool.feed'); const P = pen(sim, 4);
  tapAt(h, P); assert.equal(sim.foods.length, 1); assert.equal(h.events.count('toss'), 1);
  tapAt(h, P); assert.equal(sim.foods.length, 1); // inside TOSS_GAP
  for (let k = 0; k < 4; k++) { h.step(11); tapAt(h, [P[0] + k - 1.5, 0, P[2]]); }
  assert.equal(sim.foods.length, 5); assert.equal(h.state().foodLeft, 0);
  h.step(11); let m = h.mark(); tapAt(h, P);
  assert.equal(sim.foods.length, 5); assert.match(hints(h, m)[0], /^That’s all the snacks/);
  const r = sim.lay.run; h.step(11); m = h.mark(); tapAt(h, [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]);
  assert.equal(sim.flock.handfuls.length, 1); assert.equal(h.events.since(m).count('scatter'), 1);
  h.step(11); tool(h, 'down', P); tool(h, 'up', P); h.step(1); assert.equal(sim.flock.handfuls.length, 1); assert.equal(sim.foods.length, 5);
});

test('Hose: aims at the lifted point; the nozzle snaps on the first aim, then eases; up stops', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.hose'); const P = pen(sim, 2), A = [P[0], 0, P[2] - 1];
  let m = h.mark(); tool(h, 'down', P, { aim: rayTo(A) }); h.step(1);
  assert.equal(sim.hose.active, true); assert.ok(Math.abs(sim.hose.x - A[0]) < 1e-9 && Math.abs(sim.hose.z - A[2]) < 1e-9);
  const H = s.hose; assert.ok(Math.abs(Math.hypot(H.nx - A[0], H.nz - A[2]) - Math.hypot(5.2, 1.2)) < 1e-9);
  tool(h, 'move', P, { aim: rayTo([P[0] + 3, 0, P[2] - 1]) }); h.step(1);
  assert.ok(Math.abs(H.nx - H.gx) > 0.1, 'eases, does not snap'); h.step(60); assert.ok(Math.abs(H.nx - H.gx) < 0.01);
  tool(h, 'up', P); h.step(1); assert.equal(sim.hose.active, false);
  assert.deepEqual(h.events.since(m).of('hose').map(e => e.on), [true, false]);
});

test('Grab: lifts a pig, eases to the lifted point over 0.18 s, throws on release; nothing under the finger hints (#54)', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.grab'); const p = findPig(sim), at = [p.px, p.py, p.pz];
  tool(h, 'down', at, { aim: rayTo([p.px, p.py, p.pz - 1.5]) }); h.step(1);
  assert.equal(sim.grabbed, p.i); assert.equal(s.grab.u, 0); // the first step holds the finger point
  h.step(5); assert.ok(s.grab.u > 0.4 && s.grab.u < 0.6, `${s.grab.u}`);
  h.step(6); assert.equal(s.grab.u, 1);
  h.step(60); assert.ok(p.py > 1.2, `lifted to ${p.py}`);
  tool(h, 'up', at); h.step(1); assert.equal(sim.grabbed, -1); assert.equal(p.state, ST.AIR); assert.equal(s.grab, null);
  const m = h.mark(); tool(h, 'down', emptyAt(sim)); h.step(1); assert.deepEqual(hints(h, m), ['Touch a pig or a chicken to pick it up.']);
});

test('Hand: a tap on the fox with a chicken in its cheeks makes it spit', () => {
  const h = headless(pigPensGame(), { seed: 9, args: { pigs: 30 } }), sim = h.engine.scene.state.sim;
  h.step(300); h.tap('farm.night'); h.untilEvent('gulp', { maxSeconds: 40 }); h.step(60);
  const f = sim.flock.fox, F = () => [f.x, 0.4, f.z];
  h.until(() => classify(sim, rayTo(F()))?.kind === 'fox', { maxSteps: 600, message: 'the fox is pickable' });
  const m = h.mark(); tapAt(h, F());
  assert.equal(h.events.since(m).first('spit')?.reason, 'tap'); assert.equal(f.carrying, null);
});

test('a session of taps and drags records and replays to the same checksums (T-9)', () => {
  const h = headless(pigPensGame(), { seed: 5, args: ARGS, record: true }), sim = h.engine.scene.state.sim, P = pen(sim, 1);
  h.step(60); h.tap('farm.tool.shoo'); tool(h, 'down', P);
  for (let k = 0; k < 30; k++) { tool(h, 'move', [P[0] + k * 0.1, 0, P[2]]); h.step(1); }
  tool(h, 'up', P); h.tap('farm.tool.feed'); tapAt(h, pen(sim, 4)); h.step(120);
  const r = replay(pigPensGame(), h.tape());
  assert.equal(r.checksum(), h.checksum());
});
```
Append the scripted golden to `test/golden-farm.test.mjs` (import `tool`, `tapAt`, `rayTo` from `./rays.mjs`, `canonical` from `lion-hawk/test`):
```js
// Every tool through the engine path, seed 5: a Shoo drag, three Feed taps, a Hose drag with a lifted aim, a Grab and
// throw, the bell and nightfall; 1200 steps. New in 2e; re-bless only for a deliberate behaviour change.
function scripted() {
  const h = headless(pigPensGame(), { seed: 5, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, lay = sim.lay;
  const pen = i => [lay.pens[i].cx, 0, lay.pens[i].cz];
  h.step(120);
  h.tap('farm.tool.shoo'); tool(h, 'down', pen(1));
  for (let k = 0; k < 60; k++) { tool(h, 'move', [pen(1)[0] + k * 0.1, 0, pen(1)[2]]); h.step(1); }
  tool(h, 'up', pen(1)); h.step(60);
  h.tap('farm.tool.feed'); for (let k = 0; k < 3; k++) { tapAt(h, [pen(4)[0] + k, 0, pen(4)[2]]); h.step(20); }
  h.tap('farm.tool.hose'); tool(h, 'down', pen(2), { aim: rayTo([pen(2)[0], 0, pen(2)[2] - 1]) });
  for (let k = 0; k < 60; k++) { tool(h, 'move', pen(2), { aim: rayTo([pen(2)[0] + k * 0.05, 0, pen(2)[2] - 1]) }); h.step(1); }
  tool(h, 'up', pen(2)); h.step(60);
  h.tap('farm.tool.grab'); const p = sim.pigs.find(q => !q.piglet), x0 = p.px, z0 = p.pz;
  tool(h, 'down', [p.px, p.py, p.pz]); h.step(30);
  for (let k = 0; k < 20; k++) { tool(h, 'move', [x0 + k * 0.3, 2, z0]); h.step(1); }
  tool(h, 'up', [x0 + 6, 2, z0]); h.tap('farm.bell'); h.tap('farm.night');
  h.step(1200 - h.time.step);
  return {
    state: { ...snapshot(sim), dog: [sim.dog.x, sim.dog.z], foods: sim.foods.length, handfuls: sim.flock.handfuls.length, night: sim.clock.night, grabbed: p.state },
    events: h.events.map(e => `${e.step}:${e.type}`),
  };
}
test('golden: every tool on the engine path (seed 5, 24 pigs, 1200 steps)', () => {
  golden(new URL('./goldens/farm-scene.json', import.meta.url), scripted());
});
test('determinism: two scripted runs give the same state, bit-exactly', () => {
  assert.equal(canonical(scripted(), { digits: 15 }), canonical(scripted(), { digits: 15 }));
});
```
- [ ] **Step 2: Run them:** `node --test test/flow.test.mjs test/golden-farm.test.mjs`. Expected: the new tests FAIL (no `tool` handler: `h.command` throws), P2's pass.
- [ ] **Step 3: Implement** `api.pointer`, `act`, `toggleDoor`, `toss`, `aimHose`, `moveGrab`, the `farm.ease` body and `pressing`. **(judgment)** Move today's arithmetic, don't re-derive it: `toolDown`/`toolMove`/`toolUp`/`toss`/`aimHose`/`moveGrabTo` in `main.js:528-583` and `314-322`, with `camera.position` replaced by the ray origin and `performance.now()` by `e.time.sim`. The first run writes `goldens/farm-scene.json`; run the suite twice and check the file is stable and its `events` include `bark`, `toss`, `hose`, `squeal`, `bell` and `daynight`.
- [ ] **Step 4: Run** Pig Pens `npm test`, the workspace suite and the build check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/game/farm.js games/pig-pens/test/flow.test.mjs games/pig-pens/test/golden-farm.test.mjs games/pig-pens/test/goldens/farm-scene.json && git commit -m "feat(pig-pens): every tool as a recorded tool command, picked and eased in the sim; tools golden and replay"`

---

### Task P4: Drive mode, keys, presets and debug extras

Field notes #4, #25 (presets set state, never step).

**Files:** `src/game/farm.js`, `src/game.sim.js`, `test/flow.test.mjs`.

**Interfaces:**
- `api.enterDrive(e)`: `driving = true`, `sim.tractor.driven = true`, `selected = null`, a working dog stops (`setDog(null, null, false)`), emit `drive { on: true }`, hint "Push the stick to drive. Honk to clear the way." 4 s.
- `api.exitDrive(e)`: `driving = false`, `driven = false`, `setInput(0, 0)`, emit `drive { on: false }` (the view lifts the camera on it).
- `farm.keys` while driving: `horn.pressed` → `sim.horn()`; `back.pressed` or `getOut.pressed` → `exitDrive` (and nothing else that step); else `setInput(throttle, sign(steer)·|steer|^STEER_POW)`; then `speed < 0.3 && rightIfTipped()` → hint "Back on four wheels." 1.5 s. Not driving: tool keys, `bell` (ringBell), `back` (select null); `horn` and `getOut` do nothing.
- `farm.presets`: `driving` (`enterDrive`), `night` (`setNight(true)`), `tool { name }` (`setTool`), `selected { kind, i }` (`select`).
- `debug(e)`: `{ get sim(), get farm(), tool(name), select(sel), drive(), night(on) }`.

- [ ] **Step 1: Write the failing tests** (append to `test/flow.test.mjs`):
```js
test('Drive: throttle and steering (power 1.4) reach the tractor; H honks only while driving; E, Escape and Get out leave', () => {
  const h = headless(pigPensGame(), { seed: 2, args: ARGS }), t = () => h.engine.scene.state.sim.tractor;
  let m = h.mark(); h.step(1, { horn: true }); assert.equal(h.events.since(m).count('horn'), 0);
  h.jump('farm', 'driving', {}, ARGS); assert.equal(h.state().driving, true);
  h.step(1, { throttle: 1, steer: 0.5 }); assert.equal(t().inThr, 1); assert.ok(Math.abs(t().inSteer - 0.5 ** 1.4) < 1e-12);
  h.step(1, { steer: -0.5 }); assert.ok(Math.abs(t().inSteer + 0.5 ** 1.4) < 1e-12);
  h.seconds(4, { throttle: 1 }); assert.ok(t().speed > 4 && t().speed < 6.5, `${t().speed}`);
  m = h.mark(); h.step(1, { horn: true }); assert.equal(h.events.since(m).count('horn'), 1);
  h.step(1, { getOut: true }); assert.equal(h.state().driving, false); assert.equal(t().driven, false); assert.equal(t().inThr, 0);
  h.jump('farm', 'driving', {}, ARGS); h.step(1, { back: true }); assert.equal(h.state().driving, false);
  h.jump('farm', 'driving', {}, ARGS); h.tap('farm.exit'); assert.equal(h.state().driving, false);
  h.step(1); // a tap between steps: its event flushes with the next step
  assert.deepEqual(h.events.of('drive').map(e => e.on).slice(-2), [true, false]);
});

test('Drive: a tipped tractor is put back on its wheels with a hint', () => {
  const h = headless(pigPensGame(), { seed: 2, args: ARGS }); h.jump('farm', 'driving', {}, ARGS);
  const b = h.engine.scene.state.sim.tractor.body, k = Math.SQRT1_2;
  b.setRotation({ x: k, y: 0, z: 0, w: k }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  const m = h.mark(); h.step(1); assert.deepEqual(hints(h, m), ['Back on four wheels.']);
});

test('presets put the farm in a known state without stepping (S-5)', () => {
  const h = headless(pigPensGame(), { args: ARGS });
  h.jump('farm', 'night', {}, ARGS); assert.equal(h.state().night, true);
  h.jump('farm', 'tool', { name: 'hose' }, ARGS); assert.equal(h.state().tool, 'hose');
  h.jump('farm', 'selected', { kind: 'pig', i: 3 }, ARGS); assert.deepEqual(h.state().selected, { kind: 'pig', i: 3 });
  h.jump('farm', 'driving', {}, ARGS); assert.equal(h.state().driving, true); assert.equal(h.state().selected, null);
  assert.equal(h.engine.game.debug(h.engine).sim, h.engine.scene.state.sim);
});
```
- [ ] **Step 2: Run them:** `node --test test/flow.test.mjs`. Expected: the new tests FAIL, P2/P3's pass.
- [ ] **Step 3: Implement.** **(judgment)** `farm.keys` runs after `lh.commands`, so a `press` that enters drive and a key in the same step see the new state, as the old frame order did (pointer timer, then `driveInput`).
- [ ] **Step 4: Run** Pig Pens `npm test`, the workspace suite and the build check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/game/farm.js games/pig-pens/src/game.sim.js games/pig-pens/test/flow.test.mjs && git commit -m "feat(pig-pens): drive mode as farm sub-state with keys, horn and auto-right; presets and debug extras"`

---

### Task P5: Assert what the print scripts only printed

Field notes #3, #62, #64.

**Files:** `test/invariants.test.mjs` (new), `test/sim.test.mjs` (new), `test/nan.mjs` (deleted).

**Interfaces:** `nan.mjs` becomes an engine-path test with `invariants.finite` (P-E3): a Shoo dog circling the run for 60 s, three chickens grabbed and thrown through the `tool` command, then 60 s of night. `test/sim.test.mjs` drives `createSim` directly (like the phase-0 golden) and asserts the v2 spec's §13.1 results, two-sided where they are measurements (values measured on 2026-10-12: tractor 5.40 m/s after 4 s, 1.89 rad turn in 2 s, stop in 1.30 s; fox gulp at 21.9 s, hiccup spit at 47.1 s, tap spit 2.1 s after the gulp; 5 of 10 tosses accepted). The other print scripts (`day`, `door`, `fieldsweep`, `food`, `gates_fox`, `grain`, `hose`, `night`, `scenarios`, `headless`, `tractor`) stay as manual scripts (they print distributions for tuning, not pass/fail facts).

- [ ] **Step 1: Write the tests.** `test/invariants.test.mjs`:
```js
// nan.mjs on the engine path (lion-hawk 2e P5, #64): no bird value is ever non-finite through a dog chase, grabs and a night.
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { headless, invariants } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { grabTarget } from '../src/game/pick.js';
import { tool, rayTo } from './rays.mjs';
await R.init();

const birds = h => h.engine.scene.state.sim.flock.birds.map(b => ({ px: b.px, py: b.py, pz: b.pz, yaw: b.yaw, speed: b.speed, scale: b.scale }));
test('birds stay finite through a dog chase, three grabs and a night', () => {
  const h = headless(pigPensGame(), { seed: 4, args: { pigs: 30 }, invariants: [invariants.finite(birds, 'birds')] });
  const sim = h.engine.scene.state.sim, r = sim.lay.run, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  h.tap('farm.tool.shoo'); tool(h, 'down', [cx, 0, cz]);
  for (let s = 0; s < 3600; s++) { const a = s / 60; tool(h, 'move', [cx + Math.sin(a) * 5, 0, cz + Math.cos(a * 1.3) * 2]); h.step(1); }
  tool(h, 'up', [cx, 0, cz]); h.step(60);
  h.tap('farm.tool.grab');
  for (let k = 0; k < 3; k++) {
    const b = sim.flock.birds.find(q => { const g = grabTarget(sim, rayTo([q.px, q.py, q.pz])); return g?.kind === 'bird' && g.i === q.i; });
    if (!b) break;
    tool(h, 'down', [b.px, b.py, b.pz]); for (let s = 0; s < 30; s++) { tool(h, 'move', [b.px + 0.2, 1.4, b.pz]); h.step(1); }
    tool(h, 'up', [b.px, 1.4, b.pz]); h.step(60);
  }
  h.tap('farm.night'); h.seconds(60);
});
```
`test/sim.test.mjs`:
```js
// Facts the v2 spec's §13.1 reports, asserted (lion-hawk 2e P5, #62): createSim directly, like the phase-0 golden.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
await RAPIER.init();
const steps = (sim, n, f) => { for (let s = 0; s < n; s++) { f?.(s); sim.step(); } };

test('snacks: ten quick tosses land five; none while five are out', () => {
  const sim = createSim(RAPIER, { pigs: 48, seed: 6 }); steps(sim, 300);
  const pen = sim.lay.pens[5]; let ok = 0;
  for (let k = 0; k < 10; k++) if (sim.tossFood(pen.cx, 4, pen.cz + 6, pen.cx + (k % 5) - 2, pen.cz)) ok++;
  assert.equal(ok, 5); assert.equal(sim.foods.length, 5); assert.equal(sim.tossFood(26, 4, 22, 27, 23), null);
});
test('tractor: 0 to 5.2–5.6 m/s in 4 s; full steer turns 1.8–2.0 rad in 2 s; stops in 1.2–1.4 s', () => {
  const sim = createSim(RAPIER, { pigs: 48, seed: 2 }), T = sim.tractor; steps(sim, 120);
  T.driven = true; T.setInput(1, 0); steps(sim, 240);
  assert.ok(T.speed > 5.2 && T.speed < 5.6, `${T.speed}`);
  T.setInput(1, 1); const y0 = T.yaw; steps(sim, 120);
  let dy = T.yaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); assert.ok(dy > 1.8 && dy < 2.0, `${dy}`);
  T.setInput(-1, 0); let stop = 0; steps(sim, 240, s => { if (!stop && T.fwd < 0.1) stop = s / 60; });
  assert.ok(stop > 1.2 && stop < 1.4, `${stop}`);
});
test('night (seed 9): all in bed by 15 s, a gulp at 20–24 s, a tap makes the fox spit, nobody is lost by morning', () => {
  const sim = createSim(RAPIER, { pigs: 30, seed: 9 }), F = sim.flock; steps(sim, 300); sim.setNight(true);
  let bed = -1, gulp = -1, spit = null;
  steps(sim, 60 * 40, s => {
    for (const e of sim.events.splice(0)) { if (e.type === 'gulp' && gulp < 0) gulp = s / 60; if (e.type === 'spit' && !spit) spit = { t: s / 60, reason: e.reason }; }
    if (bed < 0 && F.birds.every(b => b.state === 10)) bed = s / 60;
    if (gulp >= 0 && !spit && s / 60 > gulp + 2 && F.fox.carrying) F.tapFox();
  });
  assert.ok(bed > 0 && bed < 15, `${bed}`); assert.ok(gulp > 20 && gulp < 24, `${gulp}`);
  assert.equal(spit?.reason, 'tap'); assert.ok(spit.t - gulp > 1.9 && spit.t - gulp < 2.4, `${spit.t - gulp}`);
  sim.setNight(false); steps(sim, 60 * 20);
  assert.equal(F.birds.length, 11); assert.equal(F.birds.filter(b => b.state === 12).length, 0); assert.equal(F.fox.carrying, null);
});
test('gates: with every gate shut for 120 s no pig changes area', () => {
  const sim = createSim(RAPIER, { pigs: 48, seed: 3 }); steps(sim, 120);
  for (const g of sim.lay.gates) sim.setGate(g.id, false);
  const start = sim.pigs.map(p => p.region); steps(sim, 60 * 120);
  assert.equal(sim.pigs.filter((p, i) => p.region !== start[i]).length, 0);
});
```
- [ ] **Step 2: Run them:** `node --test test/invariants.test.mjs test/sim.test.mjs`. Expected: PASS (they assert today's behaviour; a failure means a measurement in this plan is wrong — re-measure with the print script, record it in the commit body, and keep the bound two-sided; never widen it to pass).
- [ ] **Step 3:** `git rm games/pig-pens/test/nan.mjs`. Check the suite's wall time (`time npm test`) and note it in the commit body; if it exceeds 60 s, shorten the invariant run's chase to 30 s rather than dropping a check.
- [ ] **Step 4: Run** Pig Pens `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/test/invariants.test.mjs games/pig-pens/test/sim.test.mjs && git commit -m "test(pig-pens): finite-bird invariant on the engine path; asserted snack, tractor, night and gate facts; drop nan.mjs"`

---

### Task P6: Browser half part 1: the farm view, camera rig, pointer device and entry

Field notes #31, #59, #63.

**Files:** `src/view/world.js` (new), `src/view/rig.js` (new), `src/devices.js` (new), `src/game.view.js` (new), `src/entry.js` (new), `template.html`, `build.py`, `package.json`, `test/serve.mjs` (new), `test/e2e.browser.mjs` (new).

**Interfaces:**
- `src/view/world.js`: `buildWorld({ renderer, sim, tilt })` → `{ scene, update(dt, s, frame), draw(camera, dist), select(at, kind), dispose() }`: the moved rendering code of `main.js:19-366` (lights, ground, patches, fences, troughs and their food, decor, pigs with mud/eyelids, Zzz, dog, snacks, the two rings, `buildFarmExtras`, hose nozzle/spray/pipe), with these reads changed: the shoo ring follows `s.ring`; the nozzle is drawn at `s.hose.nx/nz` (y 1.5) looking at `s.hose.tx/tz`, the pipe from `s.hose`; the spray is still spawned in the view (`Math.random` is fine there).
- `src/view/rig.js` (module-level, one per page): `rig = { ready, camera, canvas, cam: { tx, tz, yaw, pitch, dist }, chaseOff, gesture, orbiting, pressAt }`; `attach(camera, canvas)`, `fitCam()`, `applyCam()`, `panBy(dx, dy)`, `ray(cx, cy) → [ox, oy, oz, dx, dy, dz]`, `project([x, y, z]) → { x, y }` (client px), `chase(tractor, dt)` (`main.js:512-517`), `afterDrive()` (pitch ≥ 0.7, dist ≥ 18, `chaseOff = 0`), `bindGestures(engine, canvas) → dispose`: today's pointer map and camera gestures (`main.js:521-613` minus the tool calls): driving single pointer → `chase`; mouse button 2 → `orbit`, 1 → `pan`; Hand single pointer → `orbit` once it moved more than `ORBIT_PX` from the down point (sets `rig.orbiting`); two pointers → `two` (pinch, rotate, pan; drive: chase offset); a lift to one pointer → idle; wheel zoom; no context menu. `rig.orbiting` resets on every first-pointer down; `rig.pressAt` is that down's client point.
- `src/devices.js`: `devices(doc)` → `[pointer]` in P6 (P7 adds the rest): `e => bindPointer(e, { surface: #c, type: 'tool', at, filter: { button: [0] }, press: PRESS, tap: TAP, doc })` with `at(cx, cy, ev, phase)`: `null` unless `rig.ready`; `null` on `down` while driving; on `down` remember the tool (`engine.scene.state.tool`) and `touch = ev.pointerType !== 'mouse'`; Hand: `null` on `move`, `null` on `press` when `rig.orbiting`, `{ ray, orbit: true }` on a `tap` when `rig.orbiting`; otherwise `{ ray: rig.ray(cx, cy) }` plus `aim: rig.ray(cx, cy − LIFT[tool])` when `touch` and the tool lifts.
- `src/game.view.js`: `pigPensView({ tilt = true })` → `defineView({ scenes: { farm } })`. The `farm` half: `enter` creates the renderer once per page on `#c`, `buildWorld` for `engine.scene.state.sim`, `rig.attach` (+ `fitCam` on the first enter), `view.project = rig.project`, `rig.bindGestures`, an `engine.events.on` listener (`sound.event(ev, rig.camera)` plus `bark`/`hose`/`toss`/`scatter`/`horn`/`bell`/`door`/`select`/`feathers`; hints and eggs come in P7), `resize` and a capturing first-gesture `sound.unlock()` listener on the document; `frame(engine, alpha, view)`: driving → `rig.chase`, engine level; `world.update(view.dt, s, frame)`; `rig.applyCam()`; `world.draw(rig.camera, rig.cam.dist)`; `exit` disposes the world and listeners.
- `src/entry.js`: `await R.init()`; `q = URLSearchParams`; `boot(pigPensGame(), pigPensView({ tilt: q.get('tilt') !== '0' }), { args: { pigs: +q.get('pigs') || 48 }, seed: 1, devices: devices(document) })` (`?seed=` and `?lh-test` still win inside `boot`); remove `#loading`; a thin `window.piggies = { get engine(), get sim(), stepN(n), render() }` (removed in P10); a failure writes "Could not start: …" into `#loading` as today.
- `template.html` (the old path must keep working): `data-lh-slot` on `[data-tool=hand…grab]` (`farm.tool.<tool>`), `#daynight` (`farm.night`), `#bell` (`farm.bell`), `#cardClose` (`farm.close`), `#exit` (`farm.exit`); every `env(safe-area-inset-X,0px)` becomes `var(--lh-sa-X, env(safe-area-inset-X,0px))` (#63, as Rally #31).
- `build.py`: entry from `PIGPENS_ENTRY` (default `src/main.js`). `package.json`: `"test:e2e": "node --test test/e2e.browser.mjs"`, `devDependencies: { "playwright-core": "^1.64.0" }` (run `npm install` at `games/` and commit `games/package-lock.json` if it changes).
- `test/serve.mjs`: `servePigPens({ entry = 'src/main.js' }) → { url, close }`: esbuild (iife, `.json` loader) into `build/e2e/`, `template.html` with `<!--APP-->` replaced by the bundle as `build.py` does, `pwa/` files except `sw.js`, a static server on a random port (Rally's `serve.mjs` is the model).

- [ ] **Step 1: Write the failing browser test** (`test/e2e.browser.mjs`; skips without Chromium like the engine's e2e):
```js
// Real-Chromium flows on the engine browser half (lion-hawk 2e). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';

const ENTRY = process.env.PIGPENS_ENTRY ?? 'src/entry.js'; // P9 switches the default to src/main.js
const ARGS = { pigs: 24 };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // devices update per frame
const world = (game, fn) => game.page.evaluate(fn);
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await servePigPens({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: boots into the farm; a Hand click picks; a Shoo drag sends the dog; a Feed click tosses; right-drag only turns the camera', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await expectScene(game, 'farm'); await expectState(game, 'tool', 'hand');
    const pig = await world(game, () => { const p = window.engine.debug.sim.pigs[2]; return [p.px, p.py, p.pz]; });
    let at = await game.point({ world: pig });
    await game.page.mouse.click(at.x, at.y); await game.step(2);
    assert.notEqual((await game.state()).selected, null, 'the click selected what was under it');
    await game.tap('farm.tool.shoo');
    const pen = await world(game, () => { const q = window.engine.debug.sim.lay.pens[1]; return [q.cx, 0, q.cz]; });
    at = await game.point({ world: pen });
    await game.page.mouse.move(at.x, at.y); await game.page.mouse.down(); await frames(game); await game.step(1);
    assert.equal((await game.state()).dog.active, true);
    await game.page.mouse.move(at.x + 40, at.y, { steps: 4 }); await frames(game); await game.step(1);
    await game.page.mouse.up(); await game.step(1);
    assert.equal((await game.state()).dog.active, false);
    await game.tap('farm.tool.feed');
    const pen4 = await world(game, () => { const q = window.engine.debug.sim.lay.pens[4]; return [q.cx, 0, q.cz]; });
    at = await game.point({ world: pen4 }); await game.page.mouse.click(at.x, at.y); await game.step(2);
    await expectState(game, 'foods', 1);
    const before = await world(game, () => window.engine.view.project([0, 0, 0]));
    await game.page.mouse.move(640, 360); await game.page.mouse.down({ button: 'right' });
    await game.page.mouse.move(760, 360, { steps: 6 }); await game.page.mouse.up({ button: 'right' }); await game.render();
    assert.notDeepEqual(await world(game, () => window.engine.view.project([0, 0, 0])), before);
    await expectState(game, 'foods', 1); await expectState(game, 'dog.active', false);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it:** `npm run test:e2e`. Expected: FAIL (no entry yet).
- [ ] **Step 3: Implement** the files above. **(judgment)**:
  - Move code, don't rewrite it: `world.js` is `main.js:19-366` with the three reads changed; the old `main.js` stays as it is until P9 (temporary duplication, as Rally's R5–R8).
  - `rig.ray` must use the camera as drawn last (`applyCam` runs in every `frame`, including hook renders under `?lh-test`), and `project` must add the canvas' client offset.
  - Both the gesture listener and `bindPointer` capture the pointer on `#c`; that's fine (same element). The listener must not call any sim API: camera only (#59).
  - `view.dt` is 0 for hook renders: animation, chase and ring pulses must not divide by it.
- [ ] **Step 4: Run** `npm run test:e2e` (passes), Pig Pens `npm test`, the workspace suite, and both builds: `python3 build.py` (old path) and `PIGPENS_ENTRY=src/entry.js python3 build.py`, discarding `site/exp` each time. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/view/world.js games/pig-pens/src/view/rig.js games/pig-pens/src/devices.js games/pig-pens/src/game.view.js games/pig-pens/src/entry.js games/pig-pens/template.html games/pig-pens/build.py games/pig-pens/package.json games/pig-pens/test/serve.mjs games/pig-pens/test/e2e.browser.mjs games/package-lock.json && git commit -m "feat(pig-pens): engine browser entry with the farm view, camera rig and pointer tools (alongside the old main)"`

---

### Task P7: Browser half part 2: HUD, keyboard, thumb pad and horn

Field notes #53, #56, #67.

**Files:** `src/view/hud.js` (new), `src/devices.js`, `src/game.view.js`, `test/e2e.browser.mjs`.

**Interfaces:**
- `src/view/hud.js`: `createHud(doc, { project })` → `{ hint(text, seconds, now), event(ev, basket), update(engine, s, frame, dt), dispose() }`: the card (`PIG_DOING`, `BIRD_DOING`, `cardInfo`, `renderCard` moved from `main.js:410-439`; shown or hidden on the frame `selected` changes and filled at once, then refreshed every 6 frames as today; drives `world.select(at, kind)` for the yellow ring); the hint (`#hint`, deadline on `engine.time.sim`, [U-5]); the snack badge and the Feed button's `aria-label`; the egg counter and its bump; egg pops (`main.js:643-659`, positioned with `project`); `#daynight`'s `aria-label`; `body.driving`; the press ring (`#press` at `rig.pressAt`, restarted when `pressing(s) && !rig.orbiting` turns true, hidden when it turns false).
- `src/game.view.js`: the events listener also feeds `hint` → `hud.hint`, `egg` → `hud.event`, `fox`/`gulp`/`spit`/`hatch` → today's hint texts (`main.js:660-667`), `drive` → `sound.engine(on)`, `rig.afterDrive()` on `on: false`.
- `src/devices.js`: `KEYS = { 1: 'hand', 2: 'shoo', 3: 'feed', 4: 'hose', 5: 'grab', b: 'bell', escape: 'back', e: 'getOut', h: 'horn', w: ['throttle', 1], arrowup: ['throttle', 1], s: ['throttle', -1], arrowdown: ['throttle', -1], a: ['steer', 1], arrowleft: ['steer', 1], d: ['steer', -1], arrowright: ['steer', -1] }` (no ramps: today's keys are instant); `devices(doc)` adds `bindKeyboard(e, KEYS, { target: win, doc })`, `bindStick(e, { root: #stick, base: #stick, knob: #knob, origin: 'centre', x: ['steer', -1], y: ['throttle', 1], radius: () => #stick width · 0.36, deadZone: 0, edge: 0, doc })` and `bindHold(e, #horn, 'horn')`.

- [ ] **Step 1: Write the failing browser test** (append to `test/e2e.browser.mjs`):
```js
test('desktop: card and Escape; bell and night hints and label; Feed badge; holding the tractor drives, W moves it, Escape gets out', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await game.page.evaluate(() => window.engine.debug.select({ kind: 'pig', i: 2 })); await game.step(1);
    assert.equal(await game.page.locator('#card').isVisible(), true);
    assert.equal(await game.page.textContent('#cardName'), await world(game, () => window.engine.debug.sim.pigs[2].name));
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    await expectState(game, 'selected', null); assert.equal(await game.page.locator('#card').isVisible(), false);
    await game.tap('farm.bell'); await game.step(1); assert.match(await game.page.textContent('#hint'), /Dinner time/);
    await game.tap('farm.night'); await game.step(1);
    await expectState(game, 'night', true); assert.equal(await game.page.getAttribute('#daynight', 'aria-label'), 'Night. Switch to day');
    await game.page.keyboard.press('3'); await frames(game); await game.step(1); await expectState(game, 'tool', 'feed');
    const pen4 = await world(game, () => { const q = window.engine.debug.sim.lay.pens[4]; return [q.cx, 0, q.cz]; });
    let at = await game.point({ world: pen4 }); await game.page.mouse.click(at.x, at.y); await game.step(2);
    assert.equal(await game.page.textContent('#snacks'), '4');
    await game.page.keyboard.press('1'); await frames(game); await game.step(1);
    const tr = await world(game, () => { const x = window.engine.debug.sim.tractor; return [x.x, 1.2, x.z]; });
    at = await game.point({ world: tr });
    await game.page.mouse.move(at.x, at.y); await game.page.mouse.down(); await frames(game); await game.step(1);
    assert.equal(await game.page.locator('#press').isVisible(), true, 'the hold ring shows');
    await game.page.waitForTimeout(1000); await game.step(1); // 0.75 s of device time, then the press command lands
    await game.page.mouse.up(); await game.step(1);
    await expectState(game, 'driving', true); assert.equal(await game.page.locator('#tools').isVisible(), false);
    await game.page.keyboard.down('w'); await frames(game); await game.step(120); await game.page.keyboard.up('w');
    assert.ok((await game.state()).tractor.speed > 1, 'W drives the tractor');
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    await expectState(game, 'driving', false); assert.equal(await game.page.locator('#tools').isVisible(), true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it:** `npm run test:e2e`. Expected: the new test FAILS, P6's passes.
- [ ] **Step 3: Implement.** **(judgment)** If the tractor click selects a pig or a chicken instead of pressing, the ray passes near an animal: aim at a point on the tractor's far side (`x + 1` along its heading) rather than changing `classify`. Keep the long-press wait as real time (`waitForTimeout`): it measures device time, which is the point (#56).
- [ ] **Step 4: Run** `npm run test:e2e`, Pig Pens `npm test`, the workspace suite and both builds (discard). Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/pig-pens/src/view/hud.js games/pig-pens/src/devices.js games/pig-pens/src/game.view.js games/pig-pens/test/e2e.browser.mjs && git commit -m "feat(pig-pens): card, hints, badge and eggs on the engine path; keyboard, fixed thumb pad and horn devices"`

---

### Task P8: iPhone e2e: touch on world points, the pad, pinch and layout

Field notes #43 (touch helper semantics), #54, #63.

**Files:** `test/e2e.browser.mjs`.

**Interfaces:** iPhone tests use the `'iPhone 15 Pro portrait'` preset (393 × 852, the old scripts used 390 × 844) and `game.touch.start/move/end` with `{ world }` targets; every touch move is followed by `frames(game)` so `bindPointer.update` has sent the coalesced move before `game.step`.

- [ ] **Step 1: Write the browser tests** (append to `test/e2e.browser.mjs`; import `expectTappable`, `expectFitsSafeArea` too):
```js
const PHONE = 'iPhone 15 Pro portrait';

test('iPhone: Shoo and Hose drags; Grab lifts a pig by touch and throws it (#54)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, seed: 3, args: ARGS });
  try {
    const pen = await world(game, () => { const q = window.engine.debug.sim.lay.pens[1]; return [q.cx, 0, q.cz]; });
    await game.tap('farm.tool.shoo');
    await game.touch.start(1, { world: pen }); await game.touch.move(1, { world: [pen[0] + 2, 0, pen[2]] }); await frames(game); await game.step(2);
    let s = await game.state(); assert.equal(s.dog.active, true); assert.ok(s.ring);
    await game.touch.end(1); await game.step(1); assert.equal((await game.state()).dog.active, false);
    await game.tap('farm.tool.hose');
    await game.touch.start(1, { world: pen }); await frames(game); await game.step(2);
    assert.equal((await game.state()).hose.active, true);
    await game.touch.end(1); await game.step(1); assert.equal((await game.state()).hose.active, false);
    await game.tap('farm.tool.grab');
    const pig = await world(game, () => { const p = window.engine.debug.sim.pigs.find(q => !q.piglet); return [p.px, p.py, p.pz]; });
    await game.touch.start(1, { world: pig }); await frames(game); await game.step(2);
    s = await game.state(); assert.ok(s.grabbed.pig >= 0 || s.grabbed.bird >= 0, 'an animal was lifted');
    await game.step(45);
    if (s.grabbed.pig >= 0) assert.ok(await game.page.evaluate(i => window.engine.debug.sim.pigs[i].py, s.grabbed.pig) > 1, 'lifted');
    await game.touch.end(1); await game.step(1);
    s = await game.state(); assert.deepEqual([s.grabbed.pig, s.grabbed.bird], [-1, -1]);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('iPhone: hold the tractor, drive with the thumb pad, honk, Get out; a pinch zooms the camera', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, seed: 3, args: ARGS });
  try {
    const tr = await world(game, () => { const x = window.engine.debug.sim.tractor; return [x.x, 1.2, x.z]; });
    await game.touch.start(1, { world: tr }); await frames(game); await game.step(1);
    await game.page.waitForTimeout(1000); await game.step(1); await game.touch.end(1); await game.step(1);
    await expectState(game, 'driving', true);
    const c = await game.point('#stick');
    await game.touch.start(2, c); await game.touch.move(2, { x: c.x, y: c.y - 40 }); await frames(game); await game.step(120);
    const s = await game.state(); assert.ok(s.tractor.thr > 0.7 && s.tractor.speed > 1, JSON.stringify(s.tractor));
    await game.touch.start(3, '#horn'); await frames(game); await game.untilEvent('horn', { maxSteps: 5 }); await game.touch.end(3);
    await game.touch.end(2); await game.step(1);
    await game.tap('farm.exit'); await game.step(1); await expectState(game, 'driving', false);
    const span = () => world(game, () => { const a = window.engine.view.project([0, 0, 0]), b = window.engine.view.project([4, 0, 0]); return Math.hypot(a.x - b.x, a.y - b.y); });
    const before = await span();
    await game.touch.start(1, { x: 150, y: 400 }); await game.touch.start(2, { x: 250, y: 400 });
    await game.touch.move(1, { x: 90, y: 400 }); await game.touch.move(2, { x: 310, y: 400 }); await game.touch.end(1, 2); await game.render();
    assert.ok(await span() > before * 1.2, 'spreading two fingers zooms in');
    await expectState(game, 'tool', 'hand'); await expectState(game, 'selected', null); // the second finger cancelled the Hand
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('iPhone: the toolbar, top bar and drive controls are tappable and inside the safe area (#63)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, seed: 3, args: ARGS });
  try {
    for (const id of ['hand', 'shoo', 'feed', 'hose', 'grab']) await expectTappable(game, `farm.tool.${id}`);
    await expectTappable(game, 'farm.bell'); await expectTappable(game, 'farm.night');
    await expectFitsSafeArea(game, '#tools'); await expectFitsSafeArea(game, '#top');
    await game.jump('farm', 'driving', {}, ARGS); await game.render();
    await expectTappable(game, 'farm.exit'); await expectTappable(game, { css: '#horn' });
    await expectFitsSafeArea(game, '#stick'); await expectFitsSafeArea(game, '#driveBtns');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: PASS. **(judgment)** `#exit`'s CSS gives a box of about 43 px: if `expectTappable(game, 'farm.exit')` fails on height alone, record the measurement in field note #63 and the commit body and assert it with `{ min: 40 }` (no restyling in this phase). Any other failure here is a P6/P7 defect (touch `aim`, the pad's centre origin, the gesture listener's two-finger path), not a reason to loosen a check; if `touch.end(1, 2)` leaves a finger down, see #43 before blaming the game.
- [ ] **Step 3: Run** Pig Pens `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/pig-pens/test/e2e.browser.mjs && git commit -m "test(pig-pens): iPhone touch tools, thumb pad, horn, pinch and layout on lion-hawk/playwright"`

---

### Task P9: Flip the entry; delete the old browser path

Field notes #34-style stale tooling (#62).

**Files:** `src/entry.js` → `src/main.js` (`git mv` after deleting the old `main.js`), `src/farm3d.js` (drop `pickGate`, `pickEgg`, `pickDoor`, `tractorHit`, `foxHit` from its return value and body: `src/game/pick.js` owns them), `test/interact.mjs`, `test/interact2.mjs`, `test/interact3.mjs`, `test/interact4.mjs`, `test/shot.mjs` (deleted: hard-coded `/opt/pw-browsers` and `/mnt/user-data` paths, `window.piggies`, a removed `look` tool; P6–P8 cover their flows), `build.py`, `test/e2e.browser.mjs` (default entry `src/main.js`).

- [ ] **Step 1:** `git rm games/pig-pens/src/main.js games/pig-pens/test/interact.mjs games/pig-pens/test/interact2.mjs games/pig-pens/test/interact3.mjs games/pig-pens/test/interact4.mjs games/pig-pens/test/shot.mjs`, `git mv games/pig-pens/src/entry.js games/pig-pens/src/main.js`; remove `PIGPENS_ENTRY` from `build.py` (back to `src/main.js` only); default the e2e entry to `src/main.js`.
- [ ] **Step 2:** Remove the picks from `farm3d.js`. `grep -rn "piggies\.\|installEngineHook\|extras\.pick\|extras\.\(foxHit\|tractorHit\)" games/pig-pens/src games/pig-pens/test` → only the thin `window.piggies` alias in `main.js` remains.
- [ ] **Step 3: Run** Pig Pens `npm test`, `npm run test:e2e`, the workspace suite, `python3 build.py` (discard `site/exp`). Then a manual look: serve the build (`node -e "import('./test/serve.mjs').then(m => m.servePigPens()).then(s => console.log(s.url))"`), open it on desktop: the Hand card, a Shoo drag, a Feed toss, a Hose drag, a Grab throw, hold the tractor and drive with WASD, Get out, the bell, night and back. Expected: all pass; nothing looks different from the old build except the changes flagged in "Behaviour parity".
- [ ] **Step 4: Commit** (four43 worktree): `git add -A games/pig-pens/src games/pig-pens/test games/pig-pens/build.py && git commit -m "refactor(pig-pens): boot the engine browser half; remove the old main loop, view picks and stale browser scripts"`

---

### Task P10: Remove `window.piggies`; Pig Pens docs; field notes

**Decision (ruling 1):** `window.piggies` is **removed**, not reduced: [D-5] keeps aliases until a game finishes phase 2, which Pig Pens does here; `window.engine` (`debug.sim`, `debug.farm`, `jump`, `state`, `stepN`, `render`, `view.project`) covers every use, and no test reads `window.piggies` after P9.

**Files:** `src/main.js`; `docs/pig-pens-v2-spec.md` (§9.3 the hold counts device time; §10 the tools are `tool` commands and registry controls with test ids; §13 the headless tests now asserted (`flow`, `golden-farm`, `invariants`, `sim`) and the browser tests in `e2e.browser.mjs`; §16.3 the stale-script note replaced by `npm test` / `npm run test:e2e`; the debug hook is `window.engine`); in the engine repo `docs/field-notes.md` (statuses for #4 (Pig Pens part), #8 (Pig Pens part), #52–#55, #57, #60–#65 per the tasks that landed them; #56, #58, #59, #67 stay open with the playtest outcome if known).

- [ ] **Step 1:** Delete the alias from `src/main.js`; `grep -rn "piggies" games/pig-pens/src games/pig-pens/test games/pig-pens/template.html` → nothing.
- [ ] **Step 2:** Update the Pig Pens docs as listed (facts only: what moved where, test ids, how to jump to a state).
- [ ] **Step 3: Run** Pig Pens `npm test`, `npm run test:e2e`, the workspace suite, `python3 build.py` (discard `site/exp`). Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/pig-pens/src/main.js games/pig-pens/docs/pig-pens-v2-spec.md && git commit -m "feat(pig-pens): drop the window.piggies alias; the spec describes the farm scene, tool commands and engine hooks"`; (engine repo) `git add docs/field-notes.md && git commit -m "docs: field notes after the Pig Pens migration"`.

---

## Decisions on the open questions

- **Stick origin:** engine `bindStick({ origin: 'centre' })` (P-E2), justified above; the floating stick is not accepted for Pig Pens. The scene-scoped-stick half of #8 is not needed.
- **Hand orbit vs press/tap:** the 10 px orbit threshold stays in the view; `at()` (with the phase, P-E1) silences the press and flags the tap once a drag became an orbit, so `bindPointer`'s 12 px tap rule and today's 10 px Hand rule both hold.
- **Positional payload:** rays, never hits (`ray`, plus `aim` for the touch lift); the sim does every pick and plane hit, so the scripted golden and the replay reproduce a whole session.
- **Grab lift easing:** in the sim (`farm.ease`), as a blend of the finger's and the lifted point's world hits over 0.18 s (#54).
- **Long press:** `bindPointer` `press: 0.75` on device time replaces `setTimeout` (ruling 3); the low-fps slowdown is accepted and flagged (#56).
- **Feed rate limit:** engine time (`TOSS_GAP`), 11 steps.
- **Events:** the sim's own queue is bridged per step (`farm.events`); farm events are separate types (`FARM_EVENTS`) so the phase-0 golden comparison can filter them (#57).
- **Seed:** `boot` seed 1 (today's default), `?seed=` and `?lh-test` win; Pig Pens keeps a fixed first farm (#58).
- **Card and menus:** no overlays; the card is view DOM over `selected`, its close button and every other control are adopted registry controls.

## Unresolved (for the user)

- Real-device playtest: the hold at low frame rates (#56), the grab ease path (#54), keys held before driving and W+S cancelling, pinch/orbit next to `bindPointer` on an iPad (#59).
- Whether `bindPointer` should report multi-touch to a view callback (one tracker instead of two, #59), and whether `press` should optionally count uncapped time (#56): engine decisions for a later round.
- Audio unlock as an engine hook (#67) waits for the audio service.
- The print-only tuning scripts stay manual (P5); `gates_fox.mjs`'s fox part and `day.mjs`/`grain.mjs`'s `hour` option still test nothing (#62) until someone rewrites them on `night`.

---

## Self-review notes (for the reviewer)

- Engine additions are each used by a named Pig Pens task: P-E1 → P6 (`at()` per phase for the Hand); P-E2 → P7 (`#stick`); P-E3 → P5 (`invariants.test.mjs`); P-E4 → P6/P7 (desktop mouse on world points).
- Not added (Pig Pens doesn't need them): overlays, `ctx.load`, `ui.hold`, gamepad, `policy.every`, scene-scoped devices, a camera-gesture helper (#59 stays open).
- Golden safety: P2 compares the engine path against the untouched `farm-seed3.json` with `bless: false`; the only new golden is `farm-scene.json` (P3).
- Names used across tasks: `pigPensGame`, `ACTIONS`, `makeFarm → { scene, api }`, `pressing`, `TOOLS`, `TOOL_HINT`, `START_HINT`, `PRESS`, `TAP`, `ORBIT_PX`, `LIFT`, `GRAB_EASE`, `GRAB_Y`, `TOSS_GAP`, `STEER_POW`, `FARM_EVENTS`, `planeHit`, `rayDist`, `classify`, `grabTarget`, `pickGate`, `pickDoor`, `pickEgg`, `foxHit`, `tractorHit`, `dogHit`, `rayTo`, `tool`, `tapAt`, `findPig`, `emptyAt`, `waitFor`, `buildWorld`, `rig`, `bindGestures`, `createHud`, `devices`, `KEYS`, `pigPensView({ tilt })`, `servePigPens({ entry })`, `PIGPENS_ENTRY`, `invariants.finite`, `game.point`, `origin: 'centre'`, `at(x, y, event, phase)`; control ids `farm.tool.*`, `farm.night`, `farm.bell`, `farm.close`, `farm.exit`.
