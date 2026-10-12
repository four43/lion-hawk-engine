# Phase 2g: Tractor Pickup's browser half on `boot`, the entry flip and the old path removed: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Precondition:** phase 2f (`docs/plans/2026-10-12-phase-2f-tractor.md`) is done: engine 0.7.0 on `phase-2f`, Tractor's `game.sim.js` with the farm scene, overlays, commands and engine-driven netcode, all 2f tests green. 2g reuses 2f's shared interfaces, its **Behaviour parity** table (rows cited as "parity #n") and its field notes (#75–#91) without restating them.

**Goal:**
- A browser half for Tractor Pickup on `boot`: `src/game.view.js` (view halves for every scene), `src/view/*` (the 3D farm, the camera rig, the HUD, the show cutscene, the menus' wiring), `src/devices.js` (point to go in the world frame, horn), and a new entry `src/entry.js` that boots it, built only for tests until G7.
- The multiplayer panel binds a Handshake room to the engine through a port; a two-page browser test plays host and guest through a Node bridge.
- Playwright e2e on `lion-hawk/playwright`: desktop, iPad Pro 11 landscape (the main device, X-3) and iPhone 15 Pro portrait (X-12).
- G7 flips the entry, deletes the old browser path and removes `window.tp` and `window.game`.

**Architecture:**
- **View halves read the sim, never write it.** Everything the old `main.js` did per frame with sim objects moves to view halves that read `engine.scene.state` (`game`, `guide`, `show`, `reward`, `bed`, `net.sync`) and react to engine events (`land`, `boop`, `horn`, `say`, `show`, `reward`, `sleep`, `wake`, `farm`, …). The show cutscene animates **copies** of the riders (#79) and ends with `show.done { spots }`.
- **Body interpolation:** the view keeps its own two snapshot sets of the tractor and car bodies, refreshed by an `engine.onStep` listener (allocation-free, as `main.js`'s `snapInto`), and draws `lerp(prev, curr, alpha)` ([E-11] until the phase 4 World).
- **One farm, rebuilt by the sim:** the farm view half builds the 3D farm in `enter` and again in `built` (after a `farm.new` or a guest welcome, 2f T5/T6), disposing the old one; shader warm-up stays fire-and-forget (B-2).
- **Devices:** a thumb stick with the 2f `map` hook (camera yaw → `goX`/`goZ`/`goBack`, `stickToWorld`), W/A/S/D/arrows and the pad's left stick through the same map, the horn on `bindHold`, H and pad A. The show's hurry/cheer is `bindGesture` on the show layer. Holds (gear, wake, skip) are the sim's `ui.hold({ wall })` controls on adopted markup.
- **Menus stay `menus.js` DOM**, opened and closed by the overlays' view halves; their choices issue the 2f local commands; their close buttons and the card's go button are adopted registry controls (`data-lh-slot`).
- **Strangler order (ruling 1):** G-E1 on the engine; G1–G6 a new entry `src/entry.js` built only for tests (`TRACTOR_ENTRY`), sharing `template.html`; G7 flips the entry, deletes the old path and the aliases. Tractor builds and passes after every task; the old entry ships until G7.

**Tech Stack:** as 2f, plus `playwright-core` ^1.64 as a Tractor devDependency.

**Spec:** engine `docs/spec.md` §5.2–5.4, §7.3, §7.5 (T-16–T-20). Tractor spec v1.12 §3, §7.3–7.4, §8, §9, §10, §11 (X-3, X-11–X-15), §14.5–14.6.

## Global Constraints

As 2f's Global Constraints (paths, branches, commits with no attribution, explicit `git add`, uncommitted Pig Pens edits never staged, Rally and Pig Pens read-only, goldens never blessed, no version bump, NET_VERSION 3, no release or deploy), with these changes:
- **Engine branch:** G-E1 commits on `phase-2f` (the controller may create `phase-2g` from its tip first; the plan doesn't depend on it).
- **Green after every task:** engine `npm test`; workspace `env -u CI npm test`; Tractor `npm test` and `TP_MP=engine npm test` (2f's one named exception); from G1 on also Tractor `npm run test:e2e`.
- **Builds:** never write `site/exp`. G1 adds `TRACTOR_ENTRY` and `TRACTOR_OUT` to `build.py`; every build check is `cd /home/smiller/projects/four43/four43-lion-hawk/games/tractor-pickup && TRACTOR_OUT="$SCRATCH/tp-site" python3 build.py` (old entry) and, until G7, `TRACTOR_ENTRY=src/entry.js TRACTOR_OUT="$SCRATCH/tp-site-new" python3 build.py`; then `git -C /home/smiller/projects/four43/four43-lion-hawk status --short site/exp` prints nothing. Before G1 lands the env vars, use 2f's esbuild bundle check.
- **Tests that import old modules:** a module that one of the 44 test files imports stays (even if the new entry no longer uses it), or its test's import line is retargeted with no assertion change; each case is listed in its task's commit body. `show.test.mjs` keeps testing `createShow`'s contract (G3).

---

## File structure

**Engine**

| File | Change |
|---|---|
| `src/net/bridge.js` (new), `src/index.net.js` | G-E1: `bridgeTransport()` (page side) |
| `testing/playwright.js` | G-E1: `peers(browser, url, n, opts)` over a Node hub; `game.seconds` waits out loads (2d carry-over) |
| `test/bridge-e2e.test.mjs` (new), `test/fixtures/relay.view.js`, `relay.html` (new) | G-E1 |
| `CHANGELOG.md`, `package.json`, `src/version.js`, `docs/spec.md`, `docs/field-notes.md` | G-E1: 0.7.1 |

**Tractor Pickup**

| File | Change |
|---|---|
| `src/entry.js` (new → `src/main.js` in G7) | G1: the engine browser entry; G4 storage, audio; G5 session |
| `src/game.view.js` (new) | G1–G5: `tractorView({ … })` |
| `src/view/world.js`, `src/view/rig.js`, `src/view/bodies.js` (new) | G1: the 3D farm (moved from `main.js` `build`/`dispose`/`stepFx`/`buildSandbox3D`), chase camera, projection, body snapshots |
| `src/devices.js` (new) | G1: stick, keyboard, gamepad, horn |
| `src/view/hud.js` (new) | G2: slot bar, words, arrows, barn path, help arrow, roster, finder, barn wait, horn marks (wiring of `ui/hud.js`, `ui/roster.js`, `render/hornMarks.js`) |
| `src/ui/show.js` | G3: timers on `update(dt)` time; injectable skip control |
| `src/view/menus.js` (new) | G3–G5: the overlays' view halves around `ui/menus.js` |
| `template.html` | G1–G3: adopted control slots, `--lh-sa-*` safe areas |
| `build.py`, `package.json` | G1: `TRACTOR_ENTRY`, `TRACTOR_OUT`; `test:e2e`; `playwright-core` |
| `test/serve.mjs`, `test/e2e.browser.mjs` (new) | G1–G6 |
| `src/main.js`, `src/ui/input.js`, `src/ui/hold.js`, `docs/tractor-pickup-spec.md` | G7 |

---

## Interfaces

**`tractorView({ tune = false, fps = false, sandbox = false })`** (`src/game.view.js`) → `defineView({ scenes: { farm, sandbox, start, show, reward, paint, book, parent, multiplayer, sleep } })`. The `farm` half:
- `enter(engine, view)`: the renderer and scene once per page on `#c` (`createScene`); `buildWorld` for `state.game`; `rig.attach(camera)`; `view.project = rig.project`; `bodies.watch(engine)` (an `onStep` listener); an `engine.events.on` listener for sounds, voice, fx and the HUD; resize.
- `built(engine, view)`: when `state.gen` changed, dispose the old world and build the new one (the HUD resets, the camera starts behind the new tractor).
- `frame(engine, alpha, view)`: bodies at `alpha`; `stepFx` (moved), `fx.update`, gibs, farm3d, animals3d (with the show's pose overrides), others3d (`sync.players.drawAt(time.wall)` when in a room), vehicles, horn marks, finder, roster; the chase camera unless the show has it, then the F-10 blend back; the barn path and arrows while `guide` or a help target; engine and skid sounds; night fade toward `bed.phase === 'asleep'`; `renderer.render`; the `?fps` meter.
- `exit`: disposes everything it made.

**`src/view/rig.js`:** `rig = { camera, chase, yaw }` (`yaw`: the chase camera's heading, read by the stick map), `attach(camera)`, `follow(dt, input)`, `project([x, y, z]) → { x, y, z, onScreen }` (client px, 2f T-E10's contract), `blendFrom(quaternion)` (F-10).

**`src/view/bodies.js`:** `createBodies() → { watch(engine) → unsubscribe, rebind(game), view, alpha(a) }` — two `{ p, q }` sets for `[tractor, ...cars]`, swapped and refilled after each step, `view` lerped at `alpha` (no allocation).

**`src/devices.js`:** `devices(doc, { rig })` → `[stick, keyboard, gamepad, horn]` factories:
- `bindStick(e, { root: #c, x: ['sx', 1], y: ['sy', 1], map: { from: ['sx', 'sy'], to: (x, y, out) => stickToWorld(x, y, rig.yaw, out) }, radius: 70, edge: 24, deadZone: 0.1, doc })` (parity #4, #5);
- `bindKeyboard(e, { w: ['sy', 1], arrowup: ['sy', 1], s: ['sy', -1], arrowdown: ['sy', -1], d: ['sx', 1], arrowright: ['sx', 1], a: ['sx', -1], arrowleft: ['sx', -1], h: 'horn' }, { map: { from: ['sx', 'sy'], to: … } })` (parity #6);
- `bindGamepad(e, { axes: { 0: ['sx', 1], 1: ['sy', -1] }, buttons: { 0: 'horn' }, deadZone: 0 }, { map: { from: ['sx', 'sy'], to: …, radial: 0.15 } })` (parity #6, #7);
- `bindHold(e, #horn, 'horn')` (parity #7).

**Adopted markup** (`data-lh-slot` on game-made elements; made before `boot` so the first UI sync adopts them, or re-adopted by the UI's refresh, see G2): `#horn` (device, not a control), `farm.paint`, `farm.book`, `farm.parent` (the gear), `start.go`, `reward.go`, `paint.close`, `book.close`, `parent.close`, `parent.mp`, `multiplayer.close`, `show.skip`, `sleep.wake`.

**`createShow` (`src/ui/show.js`) after G3:** the same API (`createShow({ root, camera, game, voice, sound, fx, scene, onHop })` → `{ active, update(dt), play(riders, steps), end() }`) and the same behaviour under `show.test.mjs`, plus: every wait (`SHOW.step`, `SUM_PAUSE`, `STAGE_PAUSE`, `tallyGap`, the hurry hold `CHEER.fastMs`) counts `update(dt)` time instead of `setTimeout`; option `skip: el` replaces the internal skip button and `holdToFire` (the view passes the adopted `show.skip` element and calls `show.skip()` on `showSkip`); option `gesture: false` leaves tap/hold on the layer to the caller (the view's `bindGesture`), which calls `show.cheer()` and `show.hurry()`.

**Entry (`src/entry.js`):** `await R.init()`; `q = URLSearchParams`; `settings`, `progress`, `bed` from `ui/store.js` (clamped as today; a bad record gives the default, X-15); `boot(tractorGame(), tractorView({ tune: q.has('tune'), fps: q.has('fps'), sandbox: q.has('sandbox') }), { seed: (Math.random() * 2 ** 32) >>> 0, scene: q.has('sandbox') ? 'sandbox' : 'farm', args: { seed: seedParam(q.get('seed')) ?? undefined, power: powerParam(q.get('power'), settings.power), progress, settings, bed }, devices: devices(document, { rig }) })`; saves `progress`/`settings`/`bed` on their events; a 1 Hz `clock { date: Date.now() }` (and one on `visibilitychange` to visible) (#85); a first-gesture `play` (pointerdown/keydown, capturing); the session (G5); history back guard (X-14); audio unlock and page-hide handling (X-13, moved from `main.js:97-108`).

---

### Task G-E1: A Node bridge transport and `peers()` (engine)

Spec [N-2] `bridge`, [T-20].

**Interfaces:** `bridgeTransport({ binding = '__lhBridge' })` (page side, `lion-hawk/net`): a transport (N-1) whose `send` calls the exposed binding and whose events arrive through `window.__lhBridgeIn(event, ...args)`. `peers(browser, url, n, { link, preset, args, query })` (`lion-hawk/playwright`): opens `n` pages (host first) with `?lh-test&lh-bridge=host|guest`, joins them through one Node `createMemoryHub(link)`, returns `{ games: [game drivers], hub, step(n = 1), close() }`. `room.step(n)` advances the hub clock by one step, ticks it, then steps every page once, `n` times (deterministic: the pages are in manual mode); closing one page's driver leaves the hub for it (its peers get `peerLeft`, or `closed` when it was the host). `game.seconds(s)` now hands back to Node while a load's settle is blocked, as `step` does (2d carry-over).

- [ ] **Step 1: Write the failing test** (`test/bridge-e2e.test.mjs`, skips without Chromium; fixture `test/fixtures/relay.view.js` boots 2f's `relay` game with `createPort(engine, { transport: bridgeTransport(), role })` when `?lh-bridge` is set, and `relay.html`):
```js
test('2g: two pages play host and guest through the Node bridge (T-20)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 2);
  try {
    const [host, guest] = room.games;
    await room.step(30);
    assert.ok((await guest.state()).logged > 1, 'the guest logged net.open and the host\'s says');
    assert.ok((await host.state()).n >= 29, 'the host stepped');
    await host.close(); await room.step(2);
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});
```
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** Exposed bindings are per page; keep the hub's copy semantics (JSON copied, `ArrayBuffer` bytes passed as byte arrays and rebuilt in the page). A page that has not stepped yet still receives messages; they wait in its port's command queue like any other.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Bump to 0.7.1 with a changelog entry and the spec lines ([N-2], [T-20]).
- [ ] **Step 5: Commit** (engine): `git add src/net/bridge.js src/index.net.js testing/playwright.js test/bridge-e2e.test.mjs test/fixtures/relay.view.js test/fixtures/relay.html package.json src/version.js CHANGELOG.md docs/spec.md docs/field-notes.md && git commit -m "feat(net): a Node bridge transport and peers() for multi-page browser tests (N-2, T-20)"`

---

### Task G1: The farm view, devices and the new entry

Parity #1, #4–#8, #22, #25 (`?sandbox`), #26 (part). Field notes #81, #82.

**Files:** `src/view/world.js`, `src/view/rig.js`, `src/view/bodies.js`, `src/devices.js`, `src/game.view.js`, `src/entry.js` (all new), `template.html`, `build.py`, `package.json`, `test/serve.mjs`, `test/e2e.browser.mjs` (new).

- [ ] **Step 1: Write the failing browser test** (`test/e2e.browser.mjs`; skips without Chromium):
```js
// Real-Chromium flows on Tractor Pickup's engine browser half (lion-hawk 2g). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { serveTractor } from './serve.mjs';

const ENTRY = process.env.TRACTOR_ENTRY ?? 'src/entry.js'; // G7 switches the default to src/main.js
const ARGS = { seed: 14, started: true };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveTractor({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: boots into the farm; W drives away from the camera; H honks; the 3D farm follows a new farm', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await expectScene(game, 'farm'); await expectState(game, 'mode', 'drive');
    const p0 = (await game.state()).tractor;
    await game.page.keyboard.down('w'); await frames(game); await game.step(120); await game.page.keyboard.up('w');
    const s = await game.state(); assert.ok(s.tractor.speed > 2, `speed ${s.tractor.speed}`);
    const cam = await game.page.evaluate(() => window.engine.view.project([0, 0, 0]));
    assert.ok(Math.hypot(s.tractor.x - p0.x, s.tractor.z - p0.z) > 3);
    await game.page.keyboard.press('h'); await frames(game); await game.untilEvent('horn', { maxSteps: 5 });
    await game.command('farm.new', {}); await game.untilLoaded();
    assert.equal((await game.state()).gen, 2);
    assert.ok(await game.page.evaluate(() => window.engine.debug.farm.gen === 2));
    assert.ok(cam && typeof cam.onScreen === 'boolean');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it:** `npm run test:e2e`. Expected: FAIL (no entry).
- [ ] **Step 3: Implement.** **(judgment)**:
  - Move code, don't rewrite it: `world.js` is `main.js`'s `build` (3D part), `dispose` (3D part), `stepFx`, `barnPath`, `buildSandbox3D`, `addMarkers`; `rig.js` wraps `render/camera.js`'s chase cam and `toNdc`. `main.js` stays untouched until G7.
  - The stick map reads `rig.yaw` as the old pilot read `chase.yaw ?? t.yaw` (before the first chase update, the tractor's yaw: `rig.yaw` falls back to it).
  - `template.html`: every `env(safe-area-inset-X, 0px)` becomes `var(--lh-sa-X, env(safe-area-inset-X, 0px))` (#31, #63 precedent); the old path keeps working.
  - `build.py`: `entry = os.environ.get('TRACTOR_ENTRY', 'src/main.js')`, `out_dir = Path(os.environ['TRACTOR_OUT']) if 'TRACTOR_OUT' in os.environ else <today's>`. `test/serve.mjs`: `serveTractor({ entry })` builds the bundle (esbuild, iife, `.json` loader), fills `<!--APP-->` and `<!--VOICE-->` (empty clips: speech fills in) like `build.py`, serves on a random port.
  - `package.json`: `"test:e2e": "node --test test/e2e.browser.mjs"`, `devDependencies` `playwright-core` (run `npm install` in `games/`; commit `games/package-lock.json` if it changes).
- [ ] **Step 4: Run** `npm run test:e2e`, Tractor `npm test`, `TP_MP=engine npm test`, the workspace suite and both build checks. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/view/world.js games/tractor-pickup/src/view/rig.js games/tractor-pickup/src/view/bodies.js games/tractor-pickup/src/devices.js games/tractor-pickup/src/game.view.js games/tractor-pickup/src/entry.js games/tractor-pickup/template.html games/tractor-pickup/build.py games/tractor-pickup/package.json games/tractor-pickup/test/serve.mjs games/tractor-pickup/test/e2e.browser.mjs games/package-lock.json && git commit -m "feat(tractor): engine browser entry with the 3D farm, chase camera and world-frame point-to-go devices (alongside the old main)"`

---

### Task G2: The HUD and the drive controls

Parity #9–#12, #16 (buttons), #18 (gear), #23 (circles, arrows, bubble, horn marks).

**Files:** `src/view/hud.js` (new), `src/game.view.js`, `src/entry.js`, `test/e2e.browser.mjs`.

**Interfaces:** `createTractorHud(root, { icons, voice, sound, rig, paints, tractorPic }) → { event(e, state), frame(engine, dt, state), reset(), dispose() }`: wires `ui/hud.js` (`land` → fill + word, `boop`/`unclaim` → bar, show `onHop` → mark off, golden flash), `ui/roster.js` (circles; finder after this device's horn in a room), `render/hornMarks.js`, the barn-wait bubble (`game.barnWait`, M-72), the drive buttons' visibility (started, mode `drive`, no show) and the sticker badge (`newStickers(progress)`), the help arrow (a `help` event, 10 s on engine time) and the barn path (`guide`). The drive buttons and the gear are game-made buttons with `data-lh-slot` (`farm.paint`, `farm.book`, `farm.parent`), created before `boot`.

- [ ] **Step 1: Write the failing browser test** (append):
```js
test('desktop: a boop fills a slot with its word; the drive buttons open and close the paint screen; the gear needs a 2 s hold', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'riders', { n: 2 }, ARGS); await game.step(2);
    assert.equal(await game.page.locator('#slots .slot.full').count(), 2);
    await game.tap('farm.paint'); await game.step(1); await expectState(game, 'mode', 'menu');
    await game.tap('paint.close'); await game.step(1); await expectState(game, 'mode', 'drive');
    await game.press('farm.parent'); await game.step(60); assert.deepEqual((await game.scene()).overlays, []);
    await game.step(70); assert.deepEqual((await game.scene()).overlays, ['parent']); await game.unpress('farm.parent');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** If `createUiDom` adopts only markup present at the first sync, create the adopted buttons in the entry before `boot` (hidden by CSS until the HUD shows them); do not change the engine for it in this task (if the engine must change, stop and report). `riders` is 2f's preset; the HUD reacts to the `land` events the preset's landings emit, or to `state` on `built`/`enter` (judge which keeps the old visual order).
- [ ] **Step 4: Run** `npm run test:e2e`, Tractor `npm test`, the workspace suite and both build checks.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/view/hud.js games/tractor-pickup/src/game.view.js games/tractor-pickup/src/entry.js games/tractor-pickup/test/e2e.browser.mjs && git commit -m "feat(tractor): slot bar, words, arrows, barn path, roster and drive controls on the engine path"`

---

### Task G3: The show cutscene, the sticker card and the start screen

Parity #2, #13–#15, #17 (paint/book screens). Field notes #79, #59.

**Files:** `src/ui/show.js`, `src/view/menus.js` (new), `src/game.view.js`, `test/e2e.browser.mjs`.

Test helper (top of `e2e.browser.mjs`): `const untilRewarded = async game => { for (let i = 0; i < 100; i++) { if (await game.page.evaluate(() => window.engine.events.since(0).some(e => e.type === 'reward'))) return; await game.page.waitForTimeout(50); await game.step(1); } throw new Error('no reward after the show'); };` (a synchronous `untilEvent` loop cannot wait for the cutscene's promises).

**Interfaces:** the `show` view half: on the `show` event it copies each rider's animal (`{ id, type, golden, x, y, z, yaw, state: 'ride', hat }` from the sim object at that moment) into a pose map that `animals3d` draws instead of the sim animal while the show runs, calls `createShow(...).play(copies, steps)` with the adopted `show.skip` element and `gesture: false`, binds `bindGesture` on the show layer (`tap` → `show.cheer()`, `hold: { seconds: CHEER.fastMs / 1000, fire: () => show.hurry() }`), calls `show.skip()` on `showSkip`, updates the gesture in its `frame` with `(view.dt, view.rawDt)`, marks the show layer `data-step="<index>"` (the current step, for tests), and when `play` settles issues `show.done { spots: copies.map(a => [a.id, a.x, a.y, a.z, a.yaw]) }` (only if the farm generation is unchanged, as today's `gen === myGen`). `reward` half: `menus.showReward(event payload)` with `reward.go` adopted; voice `you-did-it new-sticker`; bells on a new paint or hat. `start` half: `menus.showStart(progress)` with `start.go` adopted; paint pots → `paint` commands. `paint`/`book` halves: `menus.openPaint`/`showBook` with their close buttons adopted; pots, hats and sticker drags → `paint`, `hat`, `sticker.place`, `sticker.unplace`, `book.seen`.

- [ ] **Step 1: Write the failing browser test** (append):
```js
test('desktop: the show plays and acks; the riders walk in from their show spots; the card waits for go; skip ends the show', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'barn', { n: 2 }, ARGS); await game.step(190);
    await game.page.evaluate(() => { window.engine.debug.drive({ thr: 1, steer: 0, horn: false }); });
    await game.untilEvent('show', { maxSteps: 900 }); await game.page.evaluate(() => window.engine.debug.drive(null));
    assert.equal(await game.page.locator('#show').isVisible(), true);
    await game.press('show.skip'); await game.seconds(1.2); await game.unpress('show.skip');
    await untilRewarded(game); // the cutscene ends in the page's own event loop; its show.done lands with the next step
    await expectState(game, 'mode', 'reward');
    const left = await game.page.evaluate(() => window.engine.debug.game.herd.animals.filter(a => a.state === 'toBarn').length);
    assert.equal(left, 2, 'both riders walk into the barn (F-10)');
    await game.tap('reward.go'); await game.step(2); await expectState(game, 'mode', 'drive');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)**:
  - `show.test.mjs` must pass unchanged: it drives `update(0.05)` every 2 ms and taps the layer with `CHEER.fastMs = 0` and `CHEER.skipMs = 0`; with engine-time waits and the defaults (`skip` absent → internal button and `holdToFire`, `gesture` absent → internal listeners) its contract holds. Keep the internal paths as the defaults.
  - The voice promises stay real promises (the show's pacing follows the voice, 2f "Show timing").
  - A `farm.new` during the show: the farm view half ends the cutscene (`show.end()`) on `built`, and no `show.done` is sent for the old generation.
- [ ] **Step 4: Run** `npm run test:e2e`, Tractor `npm test` (`show.test.mjs` unchanged), the workspace suite and both build checks.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/ui/show.js games/tractor-pickup/src/view/menus.js games/tractor-pickup/src/game.view.js games/tractor-pickup/test/e2e.browser.mjs && git commit -m "feat(tractor): the show cutscene on engine time with a show.done ack, the sticker card and the start screen on the engine path"`

---

### Task G4: Parent menu, persistence, bedtime, audio and debug flags

Parity #18–#21, #25 (`?tune`, `?fps`), #26. Field notes #84, #85, #67.

**Files:** `src/view/menus.js`, `src/game.view.js`, `src/entry.js`, `test/e2e.browser.mjs`.

**Interfaces:** `parent` half: `menus.openParent(settings, seed, { guest, bed: { choice, left: minutesLeft(bed, Date.now()), phase } })`; its callbacks issue `settings`, `bed.set { minutes, date: Date.now() }`, `farm.new`, `stickers.clear`; `parent.mp` and `parent.close` adopted. `sleep` half: the dark layer and the adopted `sleep.wake` button shown after `BED.dusk` s of engine time (at once when `quiet`); `sleep`/`wake` events → night fade, lullaby, voice lines. Entry: `progress`, `settings` and `bed` events → `save('tp-progress' | 'tp-settings' | 'tp-bedtime', …)`; voice and music follow `settings`; the 1 Hz `clock` command; audio unlock on the first gesture and on page show (X-13); the back guard (X-14); `?tune` → `buildTunePanel(state.game)` on each `farm` build (kept, D-5); `?fps` → `createFpsMeter`.

- [ ] **Step 1: Write the failing browser tests** (append):
```js
test('desktop: bedtime from the parent menu, the last drive, sleep and a 5 s wake hold; storage keeps it (N-1..N-7)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.press('farm.parent'); await game.step(130); await game.unpress('farm.parent');
    await game.page.locator('[data-bed="0"]').click(); await game.step(2); // "Now"
    await game.page.evaluate(() => window.engine.command('clock', { date: Date.now() + 1000 })); await game.step(1);
    await expectState(game, 'bed.phase', 'last');
    assert.equal(JSON.parse(await game.page.evaluate(() => localStorage.getItem('tp-bedtime'))).phase, 'last');
    await game.jump('farm', 'asleep', {}, ARGS); await game.step(2);
    assert.equal(await game.page.locator('[data-testid="sleep.wake"]').isVisible(), true);
    await game.press('sleep.wake'); await game.step(290); await expectState(game, 'mode', 'sleep'); await game.step(20); await game.unpress('sleep.wake');
    await expectState(game, 'mode', 'drive');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
**(judgment)** The selector `[data-bed="0"]` names the "Now" button as `menus.js` renders it; use the real attribute or add a `data-testid` to that button (a markup-only change in `menus.js`, listed in the commit body).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Move `main.js:97-108` (audio unlock, visibility) and `:110` (back guard) into the entry unchanged in behaviour.
- [ ] **Step 4: Run** `npm run test:e2e`, Tractor `npm test`, the workspace suite and both build checks.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/view/menus.js games/tractor-pickup/src/game.view.js games/tractor-pickup/src/entry.js games/tractor-pickup/test/e2e.browser.mjs && git commit -m "feat(tractor): parent menu, storage, bedtime clock, sleep and wake, audio and debug flags on the engine path"`

---

### Task G5: Multiplayer on the engine path

Parity #23–#25. Field notes #75, #77, #80.

**Files:** `src/net/session.js`, `src/view/menus.js`, `src/entry.js`, `test/e2e.browser.mjs`.

**Interfaces:** `createSession({ …, bind })`: when `bind` is given, `host()` and `confirmJoin()` call `bind({ role, transport: link(room) })` instead of creating a sync, and `sync` reads `bind`'s result (`() => engine.scene.state.net.sync`); `stopHosting()`/`leave()` issue `net.close` before leaving the room. Without `bind` (the old entry, `session.test.mjs`) it behaves exactly as today. The entry's `bind` creates `createPort(engine, { transport, role, clock: () => performance.now() })` and returns the sync getter; `?lag=` wraps the transport with `withLag`; `?r=` opens the join prompt (M-34); the multiplayer half opens `menus.openMultiplayer(session)` and refreshes it on session changes; the netlog keeps logging; `?lh-bridge=host|guest` (tests only) binds `bridgeTransport()` instead of a Handshake room.

- [ ] **Step 1: Write the failing browser test** (append; uses G-E1's `peers`):
```js
test('two pages: the guest gets the host farm, both see each other, a horn reaches the other, leaving goes alone (M-1, M-8, M-41)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, site.url, 2, { args: { seed: 21, started: true } });
  try {
    const [host, guest] = room.games;
    await room.step(60);
    assert.equal((await guest.state()).seed, 21); assert.equal((await guest.state()).net.you, 2);
    await host.page.keyboard.press('h'); await frames(host); await room.step(30);
    assert.ok(await guest.page.evaluate(() => window.engine.events.since(0).some(e => e.type === 'remoteHorn')));
    await host.close(); await room.step(30);
    assert.equal((await guest.state()).net.role, 'solo');
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});
```
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** `session.test.mjs` passes unchanged (no `bind`). The panel's player list reads `sync.players`/`sync.you` through the getter; the M-33 "Connected!" close and the M-42 reconnect stay the session's.
- [ ] **Step 4: Run** `npm run test:e2e`, Tractor `npm test`, `TP_MP=engine npm test`, the workspace suite and both build checks.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/net/session.js games/tractor-pickup/src/view/menus.js games/tractor-pickup/src/entry.js games/tractor-pickup/test/e2e.browser.mjs && git commit -m "feat(tractor): the multiplayer panel binds rooms to the engine through a port; a two-page bridge test"`

---

### Task G6: iPad and iPhone: touch, holds and layout

Parity #4, #5, #7, #13 (hurry/cheer), #16, #18, #20 (wake). Field notes #43, #63, #82.

**Files:** `test/e2e.browser.mjs`.

- [ ] **Step 1: Write the browser tests** (append; `IPAD = 'iPad Pro 11 landscape'`, `PHONE = 'iPhone 15 Pro portrait'`; import `expectTappable`, `expectFitsSafeArea`):
```js
test('iPad: a thumb pushed up drives away from the camera; pulled down reverses; the horn button honks', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: IPAD, args: ARGS });
  try {
    await game.touch.start(1, { x: 600, y: 600 }); await game.touch.move(1, { x: 600, y: 520 }); await frames(game); await game.step(90);
    let s = await game.state(); assert.ok(s.tractor.speed > 1.5, `forward ${s.tractor.speed}`);
    const fwd = await game.page.evaluate(() => { const t = window.engine.debug.game.tractor; return t.fwd; }); assert.ok(fwd > 0);
    await game.touch.move(1, { x: 600, y: 680 }); await frames(game); await game.step(120);
    assert.ok(await game.page.evaluate(() => window.engine.debug.game.tractor.fwd < 0), 'reversing (C-8)');
    await game.touch.end(1); await game.step(1);
    await game.touch.start(2, '#horn'); await frames(game); await game.untilEvent('horn', { maxSteps: 5 }); await game.touch.end(2);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('iPhone portrait: the horn, drive buttons, gear and slot bar are tappable and inside the safe area (X-12)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, args: ARGS });
  try {
    await expectTappable(game, 'farm.paint'); await expectTappable(game, 'farm.book'); await expectTappable(game, { css: '#horn' });
    await expectFitsSafeArea(game, '#horn'); await expectFitsSafeArea(game, '#slots'); await expectFitsSafeArea(game, '#drivebtns');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('iPad: the wake button needs its full 5 s hold by touch; a short tap on the show is a cheer, a 1 s hold finishes the step (N-5, F-8)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: IPAD, args: ARGS });
  const step = () => game.page.evaluate(() => Number(document.querySelector('#show').dataset.step));
  try {
    await game.jump('farm', 'asleep', {}, ARGS); await game.step(2);
    await game.press('sleep.wake'); await game.step(270); await expectState(game, 'mode', 'sleep');
    await game.step(40); await game.unpress('sleep.wake'); await expectState(game, 'mode', 'drive');
    await game.jump('farm', 'barn', { n: 2 }, ARGS); await game.step(190);
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 1, steer: 0, horn: false }));
    await game.untilEvent('show', { maxSteps: 900 }); await game.page.evaluate(() => window.engine.debug.drive(null));
    await game.page.waitForTimeout(300); const s0 = await step();
    await game.touch.start(1, { x: 600, y: 500 }); await game.touch.end(1); await game.page.waitForTimeout(100);
    assert.equal(await step(), s0, 'a tap does not change the pace (A-3)');
    await game.touch.start(1, { x: 600, y: 500 }); await game.page.waitForTimeout(1150); await game.touch.end(1); await game.page.waitForTimeout(100);
    assert.ok(await step() > s0, 'a 1 s hold of real time finished the step (F-8, #56)');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```
**(judgment)** The step index can advance by itself while a short voice clip plays (speech is silent in Chromium and resolves at once, so the pace is the waits): if `s0` is not stable for 100 ms, pause the voice in the test page (`window.speechSynthesis.cancel` stubbed to never resolve) through `openGame`'s `initScript` (2f T-E10) rather than loosening the checks.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: PASS; a failure here is a G1–G5 defect, not a reason to loosen a check (see #43 before blaming the game for a lifted finger). If a control measures under 44 px, record it in the commit body and a field note; no restyling in this phase.
- [ ] **Step 3: Run** Tractor `npm test` and the workspace suite.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/tractor-pickup/test/e2e.browser.mjs && git commit -m "test(tractor): iPad and iPhone touch driving, holds and layout on lion-hawk/playwright"`

---

### Task G7: Flip the entry; delete the old path; remove `window.tp` and `window.game`

Parity #27. Field notes #4 (Tractor done), #34-style stale code.

**Files:** `src/main.js` (deleted, then `git mv src/entry.js src/main.js`), `build.py` (default entry `src/main.js`, `TRACTOR_ENTRY` removed; `TRACTOR_OUT` stays), `test/e2e.browser.mjs` (default entry `src/main.js`), `src/ui/hold.js` (deleted if nothing imports it after G3; `show.js` keeps its default skip path, so check), `src/ui/input.js` (kept: `input.test.mjs` imports it; its `createInput` is now unused by the game: say so in its header comment), `docs/tractor-pickup-spec.md` (X-15: the debug hook is `window.engine`; §13/§14.8: the tests and how to run them; §7.3: the inputs are engine devices; the version 1.12 text otherwise unchanged); engine `docs/field-notes.md`; `docs/plans/2026-10-12-phase-2g-notes.md` (new).

**Decision (ruling):** `window.tp` and `window.game` are **removed**, not reduced: [D-5] keeps aliases until a game finishes phase 2, which Tractor does here; `window.engine` (`debug.game`, `debug.farm`, `debug.sync`, `jump`, `state`, `command`, `stepN`, `render`, `view.project`) covers every use.

- [ ] **Step 1:** `git rm games/tractor-pickup/src/main.js`, `git mv games/tractor-pickup/src/entry.js games/tractor-pickup/src/main.js`; update `build.py` and the e2e default. `grep -rn "window\.tp\|window\.game\b\|tp: {\|installEngineHook" games/tractor-pickup/src games/tractor-pickup/test` → nothing.
- [ ] **Step 2:** Delete what nothing imports any more (`grep -rln` each candidate under `src` and `test`); keep every module a test imports.
- [ ] **Step 3: Run** Tractor `npm test`, `TP_MP=engine npm test`, `npm run test:e2e`, the workspace suite and `TRACTOR_OUT="$SCRATCH/tp-site" python3 build.py` (`site/exp` untouched). Then a manual look: serve the build (`node -e "import('./test/serve.mjs').then(m => m.serveTractor()).then(s => console.log(s.url))"`), open it on desktop: drive with W/A/S/D, honk, boop, the barn show (hurry, skip), the sticker card, the paint screen and the book, the parent menu (bedtime Now → last drive → sleep → wake hold), a new farm, `?sandbox`, `?tune`. Expected: all pass; nothing looks different from the old build except the changes flagged in 2f's parity table.
- [ ] **Step 4:** Field notes: #4 Tractor part done; statuses of every note 2f/2g planned; the 2g notes file (what landed, rulings with costs, measured bundle size before/after, the playtest list, carry-overs: the binary command codec and NET_VERSION 4, dropping the syncs' duplicate transport checks, Handshake vendoring).
- [ ] **Step 5: Commit** (four43 worktree): `git add -A games/tractor-pickup/src games/tractor-pickup/test games/tractor-pickup/build.py games/tractor-pickup/docs/tractor-pickup-spec.md && git commit -m "refactor(tractor): boot the engine browser half; remove the old main loop, window.tp and window.game"`; (engine repo) `git add docs/field-notes.md docs/plans/2026-10-12-phase-2g-notes.md && git commit -m "docs: phase 2g outcome and field notes after the Tractor Pickup migration"`.

---

## Decisions

- **View/sim boundary:** the view never writes sim objects; the one exception the old code had (the show writing rider positions and states) becomes view copies plus the `show.done` spots (2f #79).
- **Body interpolation:** the view's own snapshot sets through `engine.onStep`, until the phase 4 World gives `xf` slots.
- **Menus:** `menus.js` DOM stays; overlays own when it shows; close and go buttons are adopted registry controls; the rich parts (pots, hats, sticker drags, settings) issue commands.
- **Two-page tests:** a Node bridge (G-E1) in manual mode, deterministic, instead of a local Handshake server; a real WebRTC check stays the manual M-54 desktop check.

## Unresolved (for the user)

- 2f's playtest list, plus: the show's hurry/cheer on `bindGesture` and the holds on wall time, felt on a real iPad (#56, #59, #83); the world-frame stick under a swinging chase camera (#81).
- Whether `createUiDom` should adopt game markup added after boot (G2 may need it; the plan avoids an engine change).
- Real-iPad audio and touch remain the manual checklist ([T-21]).

---

## Self-review notes (for the reviewer)

- Every 2f parity row has a 2g home: #1–#2 G1/G3, #4–#8 G1/G6, #9–#12 G2, #13–#15 G3, #16–#17 G2/G3, #18–#21 G4, #22 G1, #23–#25 G5, #26 G4, #27 G7.
- Names used across tasks: `tractorView`, `buildWorld` (in `world.js`), `rig` (`yaw`, `project`, `follow`, `blendFrom`), `createBodies`, `devices(doc, { rig })`, `createTractorHud`, `serveTractor({ entry })`, `TRACTOR_ENTRY`, `TRACTOR_OUT`, `bridgeTransport`, `peers`, `createSession({ bind })`; 2f's commands, controls, events and presets unchanged.
