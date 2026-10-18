# Changelog

## Unreleased

- View sync: an instanced entity is re-uploaded whenever its drawn pose differs from the one last written, so a still prop moved by `world.place` redraws and a body that stops is drawn where it came to rest (it used to stay at its last interpolated pose); instanced paint finds its `paint-<slot>` on templates the compiler already applied (`userData.lhMat`), so `e.paint` reaches `instanceColor` with real assets.
- kit-terrain view: each chunk geometry has its own index, so evicting one chunk's LOD no longer frees the index buffer the other chunks at that LOD draw with.
- Net: a driven record carries `max(INPUT_BATCH, 2 × steps per send)` inputs (the wire allows up to `INPUT_WIRE_MAX` = 64) and the receiver's jitter queue scales with steps per send, so no owner step is skipped when sends are more than 8 steps apart (Rally's 240 Hz at 20 Hz); a driven kind whose sends are too far apart throws at install. A record that cannot encode (an out-of-range field) costs only its kind's frame (`stats.unsent`, warned once) instead of every send; each `onStep` listener runs in its own try, so one that throws no longer starves the port's drain. A JSON message (codec `'json'`) sent on the fast channel goes reliable, since WebRTC's fast channel carries only binary; the memory hub now drops JSON on the fast channel as `roomLink` does.
- Bake: `manifest.json` records each model's bake-options hash (`models[id].options`), and `bake --check` reports `bake options changed` for a model whose `game.config.js` options (or the global `rename`, `palette`, `paint.base`, `optimise`) changed since it was baked. Bakes from before this have no hash and read as stale once.
- Shadows: `mc.apply()` sets a FUR or WIND mesh's `customDepthMaterial` to its `mc.depth()` twin, so swaying grass and fur cast displaced shadows (fur no longer draws every shell undisplaced in the shadow pass); `instancedShadows` keeps a depth material a caster already has; view sync and `createCrowd` carry the twin onto their instanced meshes, and crowd parts now get `INSTANCED_DEPTH` too (X-4).
- Light rig: `follow()` snaps the shadow box to whole shadow-map texels across the light, so shadow edges no longer shimmer as the followed point moves (the box is within a texel of the point; the sun offset is exact).

## 0.11.1 — 2026-10-16

- SUBSURFACE is now wrap past the terminator, a view-dependent rim haze and back-lit transmission, all scaled by `BRDF_Lambert` (albedo / π). The old term was π× too strong and covered every lit face, so saturated colours like flesh's `#ff6040` washed whole models red. `subsurface.color` multiplies the albedo (white keeps the surface's hue). Strength 0 compiles no SUBSURFACE program.

## 0.11.0 — 2026-10-16

- Phase 3 complete.
- All three games (Pig Pens 2.2.0, Rally 0.4.0, Tractor 1.9.0) run fully on the engine.

## 0.10.3 — 2026-10-16

- `world.joint(a, b, { type: 'spherical' | 'revolute' | 'fixed' | 'prismatic', a: [x, y, z], b: [x, y, z], axis?, limits?: [lo, hi] })` builds the JointData from the injected Rapier (raw JointData still works; an unknown type, bad anchors, a missing or zero axis, or bad limits throw); net: every removal frame for an owner kind (the repeats too) is forgotten by the store and a re-bound player number drops its old relay and pending removals, so a player who reuses a number with a lower clock replicates again; `mp().addPeer({ wall0 })`.

## 0.10.2 — 2026-10-14

- Fixes for the Rally port: view sync binds `partXf` nodes (and checks their names) against whatever object the create hooks leave, including one a hook returns for an undrawn entity, one that replaces the model clone, and one from a hook added later; a render before an entity's first step draws its parts at the nodes' rest pose, and `partXf` in a spawn desc (or `world.add`) may be `{ name: { p, q } | null }` to seed curr and prev; `mc.depth(material)` returns a cached `MeshDepthMaterial` (RGBA packing) for `mesh.customDepthMaterial` that runs the material's WIND and FUR displacement on the same uniforms and its `extend()` patches with `{ depth: true }` (patches now receive a third argument `{ depth }`).

## 0.10.1 — 2026-10-14

- Fixes for the Pig Pens port: view sync skips a drawn entity until `assets.has(model)` and makes it on a later frame (no throw while loading); the bake's convex hull runs in quickhull order with a connected visible region, so near-coplanar meshes (Kenney tractor `wheel-back-right`) finish; `palette: 'vertex'` also writes `COLOR_0` from the factor of untextured materials (factor goes white, alpha kept).

## 0.10.0 — 2026-10-14

- World net part (3i): entities with a `net` part replicate on their own (N-9). `F.body()` (N-8); kind options `remote` (`driven` | `proxy` | `view`), `follow`, `tune` (`snapAt`, `nudge`, `smoothMs`, live per engine as `world.net.tunables`), `send`, `spawn`, `spawned`, `record`, `apply`. Driven remotes play the owner's batched inputs and are nudged or snapped (N-13…N-16; the nudge holds while touching another dynamic body), with `e.netFix` for 3g's smoothing. The host relays owner records and departures; a guest's `world.clear()` respawns every replica from its newest record (CI-15, `world.serial`); E-7 guard on spawn and despawn. `world.net`: `role`, `self`, `players`, `player(peer, n)`, `find(kind, netId)`, `remoteOf(e)`, `stats`.
- `defineGame({ net: { world: true } })` installs the net part in `createEngine`; `installNet(engine)` is exported from `lion-hawk/sim` and stays idempotent.
- `mp()` gains `w.drop(peer)`, `w.blackout(seconds, { kinds })` and `w.diverged({ agree })` (T-11).
- **Behaviour change:** driven kinds send `input` as `{ s, list }` (NET_VERSION 4 for Tractor).

## 0.9.0 — 2026-10-14

Phase 3 Wave B complete (3e + 3f + 3g + 3h).

- View sync (3g): `createViewSync(engine, { gfx, assets, compiler, view, root })` draws World entities (`assets.clone` or `draw: 'instanced'` groups with paint and `instanceCoverage`), interpolates `xf`/`xfPrev` and part poses (`partXf`), smooths `e.netFix` (N-15, `smoothMs` per kind), advances `mc.time`, and runs `sync.on(selector, { create, frame, remove })` hooks.
- Cameras, instancing and audio (3g): `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd`, `createAudio`. All 3e stubs are gone.

## 0.8.2 — 2026-10-14

- Assets and material compiler (3f): `createAssets` (manifest `preload` with one fetch per URL and `gfx.warm()`, `has`, `get`, `clone(key, { paint, instanced })`, sockets, skinned clones), `createMaterialCompiler` (tiers, `get`, `paint`, `coverage`, `extend`, `apply`, `repaint`, `PAINT`/hue paint, `time`), `furGeometry`, `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable`. These replace 3e's stubs; `render.paint = { base, shade }` reaches the compiler.

## 0.8.1 — 2026-10-14

- Kits (3h): `lion-hawk/kits/terrain` (`createTerrain`) and `/view` (`createTerrainMesh`), `lion-hawk/kits/vehicle` (`VEHICLE_SYSTEM`, `createVehicle`, part poses for wheels), `lion-hawk/kits/coverage` (`coverageKit`) and `/view` (`coverageView`), `lion-hawk/kits/fx/view` (`createParticles`, `createMarks`).

## 0.8.0 — 2026-10-14

Phase 3 Wave A: materials, the World and the bake.

- Materials registry (M-1, M-2, M-3, M-7, M-8) and sidecar schema (A-5): landed early in 0.7.4 (see that entry); since 0.8.0 the base library is the World's default registry.
- `World` in `lion-hawk/sim` (E-1…E-13, S-3): `createWorld`; each main scene owns one (`engine.world`, `ctx.world`; overlays share it), made before `enter` and disposed after `exit`. Entities with deterministic ids, live `with()` queries, a transform pool with prev/curr halves (`e.xf.slot`, `world.xf.pool`), `place`/`socket`, bodies, colliders, joints, contact and sensor events in Rapier order, a heightfield entity, part poses (`partXf`, `world.partXfPrev`), `own`/`onSpawn`/`onDespawn`, `audit()` and the net seam (`world.net?.guard`, `engine.netPart?.attach(world)`).
- Rapier wrapper (M-4…M-6, M-9, #1, #2, #106): Rapier is injected (`defineGame({ physics: { rapier } })`, nothing under `src/` imports it), every 0.21 integration parameter is pinned, named collision groups, √f/Multiply and Max combine rules, `heightfieldDesc` (row-major heights), `body: { sleep: true }` re-sleeps after the first step, and `createEngine(game, { timer })` fills `world.stats.stepMs`/`stepMsTotal` (never `state()`). Built-in systems `lh.world.swap` (input.apply) and `lh.physics.step`/`read`/`events` (physics.world); no Rapier step while a scene loads.
- Headless World access and `checks` in `lion-hawk/test` (T-1, T-5, T-10, T-12…T-14): `h.world`/`find`/`one`/`get`/`spawn`/`despawn`/`place`, an always-on finite check over poses and body velocities after every headless step, and `checks.determinism`, `checks.simPurity`, `checks.zeroAlloc`, `checks.materials`.
- `lion-hawk bake`/`build`/`dev` (A-1…A-7, B-1…B-5, #11): the `lion-hawk` bin; `lion-hawk/bake` (`bake`, `loadConfig`) and `lion-hawk/build` (`build`, `dedupe`). The bake writes optimised GLBs, `phys.json` (validated with `validatePhys`, stamped with the registry hash) and anim tables, byte-identical on re-bake; `bake --check` reports stale sources, registry or engine minor. `build` bundles with esbuild and dedupes three (#11), stamps the page and `sw.js` (`<gameVersion>+lh<engine>-<hash>`), and takes `--e2e`; it never writes `site/` without `--site`. `dev` serves and re-bakes on change.
- **Behaviour changes:**
  - `engine.state()` gains `world` (the World digest) only while a World has entities, so games without entities keep their goldens.
  - `createEngine` throws `physics: await RAPIER.init() before createEngine` for an uninitialised Rapier module.
  - `engine.builtin(type, fn)`: engine-side command handlers that run before the game's handler (§4.4).
  - The `./build` export now points at `tools/build/index.js` (it still exports `dedupe`).

## 0.7.5 — 2026-10-14

Phase 3e: renderer, lights and boot render pipeline (early landing, ahead of Wave B).

- view: `defineView({ render })`, `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift`;
- boot builds `view.gfx`/`materials`/`assets`/`sync`/`audio` and `engine.assets`;
- a renderer that cannot start is reported as `render: …`.
- **Behaviour changes:**
  - `boot` builds `view.gfx`, `view.assets`, `view.materials`, `view.sync` and `view.audio` when `render` is declared, and is unchanged without it. Until 3f and 3g land (0.9.0), the asset loader, material compiler, view sync and audio are inert stubs with their final surface.
  - Engine view modules now import three (D9), so game builds must go through `lion-hawk build` (dedupe); a `build.py`/esbuild-CLI build would bundle the engine's own copy of three.
  - `boot(game, view, { timer, canvas, renderer })`: `timer` is passed to `createEngine` (3c, #106).

## 0.7.4 — 2026-10-14

Phase 3b: material registry and sidecar schema (early landing, before Wave A closes).

- Material registry in `lion-hawk/sim`: `defineMaterials(entries, { pairs })` with validation that names the material and field, `extends` (and in-place overrides of base ids), a pair table resolved by M-8 (`pair(a, b)`, cached per ordered pair: moving body `a`, ground `b`) and an 8-hex `hash` over ids, order, effective `phys` and pair friction/restitution only (M-1, M-2, M-3, M-7, M-8). `BASE_MATERIALS`: the base library of 18 (hash `2f4f4f95`).
- Sidecar schema: `SIDECAR_VERSION`, `validateSidecar(s, { model, materials })` and `validatePhys(phys, { materials })` (A-5, A-6, D2). Baked and inline colliders share one entry shape; `'ball'` is rejected for `'sphere'`; `box` takes `round` > 0. `validatePhys` does not compare the registry hash.

## 0.7.3 — 2026-10-14

Phase 3a: engine carry-overs.

- `engine.overlay(name, args, { once })`: a no-op when the overlay is open or about to be, and never recorded (#95).
- `engine.scene.overlayArgs(name)`, and view halves' `enter(engine, view, args)` (#105).
- `defineGame({ reset })`, called first in every `createEngine`, so replays and `mp()` peers start from the shipped tunables (#108). Tunables are per process: a test that tunes must tune after all its `mp()` peers are created.
- `bindGesture` times holds and taps on the event clock, with an injectable `now`; `uncapped` is ignored (#109).
- Headless and Playwright `untilLoaded` take the step that delivers the commands pending at the call (#100); `window.engine.commands`.
- `peers()` defaults to `render: 'manual'` (#107).
- The domAsserts guard sees every equality form and skips quoted text (G-E2).
- Dependencies for the phase 3 bake and build: `@gltf-transform/core`, `/extensions`, `/functions` 4.5.1, `meshoptimizer` ~1.2, `pngjs`; `esbuild` moves to `dependencies`.
- Testing: `scanSource`/`scanPurity` take `{ rapier: true }`; engine roots are scanned with it (D9). Guard tests for field-note numbering and the phase 3 public surface.

## 0.7.2 — 2026-10-13

Phase 2g G-E2: late adoption of game markup.

- UI DOM ([U-1]): a `data-lh-slot` element that appears after its control already has an engine-made element is adopted on the next sync after a `MutationObserver` saw it added (or on `view.ui.adopt()`; without a `MutationObserver`, only then), and the engine-made one is removed. The adopted element gets everything adoption gives (`data-testid`, `disabled`, `aria-pressed`, taps, holds with `--lh-progress` and `data-lh-down`). An adopted element that leaves the document while its control lives is replaced on the next sync by a new slot element, or else by an engine-made control. Removing a control still never deletes an adopted element.
- `view.ui.adopt()` (also on what `createUiDom` returns) runs that swap at once, for a view half that has just built a screen. A sync looks for slots only after a mutation that adds a `data-lh-slot` element or changes that attribute (a `MutationObserver`, read with `takeRecords()` so markup built earlier in the same task counts), so an unchanged frame does no querying.
- Tests: `same(actual, expected)` in `test/helpers/dom.mjs` compares DOM nodes. A failing `assert.equal` on a happy-dom node diffs the inspected window and needs gigabytes; a guard test rejects such assertions in the DOM tests.

## 0.7.1 — 2026-10-12

Phase 2g G-E1: two real browser pages as host and guest.

- `lion-hawk/net` (N-2): `bridgeTransport({ binding = '__lhBridge' })`, the page side of a Node bridge: a transport whose `send` and `leave` call the exposed binding (in order, sequence-numbered) and whose events arrive through `window.__lhBridgeIn(event, ...args)`. The hub's copy semantics hold across the page boundary: JSON is copied, an `ArrayBuffer` crosses as a byte array and is rebuilt as an `ArrayBuffer`. Events that reach the page before the transport exists are replayed, in order, just after it is made.
- Playwright (T-20): `peers(browser, url, n, { link, preset, seed, args, argsOf, query })` opens `n` pages (host first) with `?lh-test&lh-bridge=host|guest` over one Node `createMemoryHub(link)` and returns `{ games, hub, now, step(n = 1), close() }`. `argsOf(i, name)` gives each page its own args and overrides `args`. `room.step` advances the hub clock by `1000 / hz`, ticks it, delivers each page's events, then steps every open page once, waiting until Node has each page's sends, so a run is deterministic as with `mp()`. Closing a page's driver leaves the hub for it (its host hears `peerLeft`; a closed host closes the room).
- Playwright (#50, the 2d carry-over): `game.seconds(s, input, timeout)` also hands back to Node while a load's settle is blocked, then continues; the engine time it advances is unchanged.
- `window.engine.hz` (D-4): the game's step rate.

## 0.7.0 — 2026-10-12

Phase 2f, the network command round Tractor Pickup needs.

- Commands (#69, #72): game-wide handlers get the main scene's ctx; `when`/`get`/`set`/`action` get the control's own scene ctx (`(engine, data, ctx)` and `(engine, ctx)`). `engine.command` always checks `data` as plain JSON and delivers a copy, recording or not. **Behaviour change:** non-JSON command data now throws (`engine: command data must be plain JSON`) without recording, and handlers no longer see the caller's object.
- Testing (#68, #70, #71): `h.debug` (the game's `debug()` extras, made once per handle); `h.events`, `h.since` and `window.engine.events.since` flush pending events on read; `golden(file, value, { exact })` stores unrounded values; `assertFinite` walks Map, Set, typed arrays and cycles.
- Clock (N-4): `engine.time.wall` stamps each step on the injected clock (real from the driver's rAF time via `engine.frame(seconds, now)`, else virtual `wall0 + n * 1000 / hz`, re-anchored on real stamps); `createEngine({ wall0 })`, tapes carry `wall0`; `engine.onStep(fn)` runs after every step.
- Replication in `lion-hawk/sim`: the replica codec (`F`, `kind`, `createRegistry`, `encodeFrame`, `decodeFrame`, trackers, stores, `frameToJson`/`frameFromJson`; `F.uint` takes a `min`, new `F.actions`), interpolation, forecast and `createRate`/`createWarnOnce`, moved from Tractor Pickup with no behaviour change.
- Command schemas and the outbox: `defineGame({ commands: { [type]: { schema, handler } } })` checks data at issue and delivers the checked copy; `checkSchema` and `wireCodec` (json or binary; binary `fixed`/`angle`/`quat` quantise like the replica); the reserved keys `from`, `at` and `reliable`, type-checked on every command; commands issued inside a step are checked while recording; `defineGame({ net })`; `engine.net` (`send`, `leave`, `drain`, `pending`), emptied after each step.
- `lion-hawk/net`: the in-memory hub, `withLag` (injectable `now`), `parseLag`, `roomLink`, and `createPort`, which turns transport events and messages into `net.open`, `net.peer`, `net.frame` and schema'd commands (rate, size and schema checks) and sends `engine.net` after each step.
- Multiplayer tests (T-11): `mp(game, { peers, link, clock, record, seed, argsOf, beforeStep })` runs headless peers over the hub with ports.
- Input (#8): `axis({ pair })` merges a pair per source by vector length; devices take `map: { from, to, radial }` to turn a stick, keys or a pad into world-frame actions; `bindStick` returns `update()`, which re-applies the map while a finger is down.
- Holds and gestures (#56, #59, #83): devices get `update(dt, raw)` (capped and uncapped frame time) and `view.rawDt` sits beside `view.dt`; `bindPointer({ uncapped })` counts the long press on raw time; `ui.hold({ wall: true })` counts `engine.time.wall`; `bindGesture` (tap, hold, drag, pinch; view-only). A real-browser test covers a wall hold.
- Playwright (#73, #74): `view.project` returns `{ x, y, z, onScreen }` and `game.point({ world })` refuses a point that is off-screen or behind the camera; `openGame(…, { initScript })` adds a script before the page loads.
- Fixes: `engine.flushEvents()` is re-entrancy safe. A listener that calls it (or reads `h.events`, `h.since` or the hook's `events.since`) outside a step no longer recurses or re-delivers the first queued event.

## 0.6.0 — 2026-10-12

Phase 2e, the engine additions Pig Pens' migration needs. No behaviour changes for existing callers.

- Pointer (#52): `bindPointer`'s `at(clientX, clientY, event, phase)` gets the command phase, so a game can silence moves but keep the press.
- Touch (#53, #8): `bindStick({ origin: 'centre' })`, a fixed pad that deflects from its centre on pointerdown and is never hidden or moved (`'thumb'`, the floating stick, stays the default).
- Testing (#64): `invariants.finite(select, label)` in `lion-hawk/test`, naming the path, seed and step of the first non-finite value.
- Playwright (#65): `game.point(target)` resolves a selector, `{ x, y }` or `{ world }` to client coordinates for `page.mouse`.

## 0.5.1 — 2026-10-12

Phase 2d final-review fixes.

- Input: a rise from one device source is an owed tap only when no other source already holds the button, so a second device pressing a held button no longer forces a release and re-press (double gear shifts or horns); clearing a button's last contributing source drops its owed taps.
- Loading (S-6): `ctx.load` on a scene that is already loading throws `engine: '<scene>' is already loading` instead of silently restarting `hold`/`frames`. The spec now says that command handlers still run for a loading scene.
- Playwright (#50): `game.step`, `until` and `untilEvent` hand control back to Node while a load's settle is held by blocks (a `view.wait`), poll until they clear (bounded `timeout`), then keep stepping; new `game.untilLoaded({ maxSteps, timeout })`. A browser test covers `unpress` keeping a stick finger down.
- Policies (#51): `policy.every(n, fn, { key })` recomputes at once when `key(h)` changes.
- View: a `view.focus` that gives up after its retries warns once (`console.warn`) under `?debug`.

## 0.5.0 — 2026-10-12

Phase 2d, the engine round from the Rally field notes.

- Commands and replay (#5, #49, T-9): `engine.command(type, data)`, game-wide handlers (`defineGame({ commands })`) and scene handlers (`ctx.command`), delivered FIFO by `lh.commands` at the next step's `input.apply`; a command no handler ran is dropped (`engine.commands.dropped`), and handlers of scenes covered by a pausing overlay are skipped, so network messages and view acks belong in game-wide handlers. `h.command`, `game.command` and `window.engine.command`. `headless(game, { record: true })` records external ops and input changes as a plain-JSON tape (`h.tape()`: `v`, `game`, `seed`, `scene`, `args`, `hz`, `log`, `end`, `sums`); `replay(game, tape)` re-feeds it, sets the recorded input at every step and names the first checkpoint that differs. Command data, scene args and jump opts must be plain JSON while recording.
- Pointer: `bindPointer` turns world-position taps, drags and long presses into commands (filters, capture, window routing, second-finger cancel, coalesced moves); `window.engine.view.project` is wired from `view.project`, which the game's view half sets.
- Loading and acks (S-6, #6, #21, #38): `ctx.load({ build, then, hold, frames, settle, label })` suspends the scene's step and builds after `hold` seconds and `frames` presented frames, then waits (with `settle`) for a frame after the build and no `view.wait`; `engine.loading` (with `blocks`), `engine.block`, `engine.onBuilt` (and the view half's `built`), `engine.onPresent`, `engine.time.frames`, `h.untilLoaded`; `settled()` is false while a load is active. Step acks in headless and `?lh-test`, frame acks in a browser boot. Frames drawn before the request do not count.
- UI (#9, #36, #39, #45, #46): `ui.hold` (hold-to-fire on engine time, `--lh-progress`, `data-lh-down`), `engine.ui.press/release`, `h.press/unpress`, `game.press/unpress`; `engine.isOpen(name, { pending })`; `engine.ui.enabled` and `tryTap` (`h.enabled`, `h.tryTap`); `view.focus(testid)` (gives up after 5 refreshes); controls press actions and scenes own transitions (documented).
- Devices (#41, #42, #44): two taps between two steps now give two presses (owed presses per source); `bindHold` prevents focus by default (`focus: true` restores it); devices get frame time capped at `maxFrame`; stick, gamepad and field minors (`preventDefault` option, bad `radius()` guard, curves not applied at rest, IME-safe Enter in fields, released `aria-pressed`, hold release on blur and key up).
- Render slots and build (#10, #11): `engine.onRender` is additive and returns an unsubscribe (`boot` keeps its own slot); `lion-hawk/build` exports the esbuild `dedupe({ root })` plugin.
- Policies (#26, #37, #40): `policy.every(n, fn, { phase })`, a per-handle scratch object (`fn(h, i, scratch)`), `policy` exported from `lion-hawk/sim` (still re-exported by `lion-hawk/test`), `stripComments` exported from `lion-hawk/test`.
- Tooling (#47, #48): `?lh-test=render` and `driver.manual('all')` (no step, no render); `openGame(…, { render: 'manual' })` and `testUrl`; `expectTappable`, `expectFitsSafeArea` and `expectNoOverlap` take a string, `{ testid }`, `{ css }` or a Playwright locator. Fixes: `game.press` keeps the active touches down, `bindPointer` and the hold DOM review minors.
- Behaviour changes: two taps between steps give two presses (#41); `bindHold` prevents focus by default (#42); devices get capped dt (#44); a boot outside `?lh-test` acks real frames; view halves enter after the UI sync.

## 0.4.0 — 2026-10-11

Phase 2c-rally, the engine additions Rally's migration needs.

- Input latch: a button press shorter than a step (a tap between two applies) still reads `pressed` on the next step and is released after it, so no tap is lost.
- Keyboard: ramps may be functions of time, `shift+` chords bind separately from the plain key, a key releases by `e.code` (so Shift up or a layout change can't leave it stuck), taps latch, and Enter/Space on a focused button are left entirely to the button (the browser clicks it; the key no longer also drives its action), a behaviour change from 0.3.0.
- Gamepad: per-axis response curves, and several bindings per button.
- Touch: slider mode (`bindStick` with `axis: 'x' | 'y'` as a one-axis slider), a function radius, an adopted base/knob from game markup, `data-lh-active` while a finger is down on the stick and `data-lh-down` on held buttons.
- UI: `ui.choice` (one of N) and `ui.field` (text), `fill` on `engine.ui`, the hook, `h.fill` (headless) and `game.fill` (Playwright); the DOM renderer adopts game markup marked `data-lh-slot` instead of creating its own, and clicks are delegated from the document.
- View halves: `view.dt` (driver frame time, 0 for renders the driver didn't start) and `view.wait(promise)` (`settled()` and `data-lh-settled` hold until it settles; a rejection is reported into `errors`); `boot` returns `{ engine, driver, ui, hook, view, dispose }` and `installEngine` takes `busy`.

## 0.3.0 — 2026-10-11

Phase 2b, the browser half of the engine and its test tooling.

- `lion-hawk/view`: `boot` (engine + driver + devices + DOM UI + scene view halves, `?lh-test` manual mode), `defineView`, `installEngine` (the full `window.engine` hook: stepping, scenes, events, input, UI, errors, `settled`), the rAF driver (hidden-tab pause, manual mode), `createUiDom` (real `<button data-testid="<scene>.<id>">`), `bindKeyboard`, `bindGamepad`, `bindStick` and `bindHold` (touch, pointer events).
- `lion-hawk/playwright` (new): device `presets` with safe areas, `launch` (finds Chromium), `openGame` and the in-page `game` driver (`step`, `seconds`, `until`, `untilEvent`, `go`, `jump`, `input`, real `tap`, CDP multi-touch `touch.start/move/end`, `errors`), and the assertions `expectScene`, `expectState`, `expectTappable`, `expectFitsSafeArea`, `expectNoOverlap`.
- Countdown example game with a browser entry (`test/fixtures/countdown.view.js`) and a real-Chromium end-to-end test.
- Final-review fixes: the rAF driver survives a throwing device/frame/render (`onError` option, boot reports into `window.engine.errors`) and `start()` resets the loop; `bindHold` writes `1`/`0` for axis actions (and takes a `value` option; `engine.input.kinds` exposes action kinds); `bindStick` takes optional `x`/`y` (one required), a `surface` and a `parent` (the base is `position: fixed` under `body` by default); `bindKeyboard` lowercases binding keys, ignores ctrl/meta/alt chords and leaves Enter/Space alone on buttons; boot injects low-specificity `--lh-sa-*` safe-area variables (removed on dispose); under `?lh-test`, `?scene=` and `?args=<json>` choose the start scene (`openGame` takes `args` and waits for `settled()`); `data-lh-overlays` is space-separated and `data-lh-settled` is `1`/`0`.
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
