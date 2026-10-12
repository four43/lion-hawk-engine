# Phase 2f: the network command round, and Tractor Pickup's sim and net on the engine: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Scope split.** Tractor Pickup is too big for one plan. **2f (this plan)** is the engine round (T-E1–T-E11, engine 0.7.0) and Tractor's headless half: `game.sim.js`, the trip flow as scenes and commands, bedtime, farm rebuilds, and its netcode driven by engine commands, proven by the goldens, the 44 existing test files and the multiplayer harness. **2g** (`docs/plans/2026-10-12-phase-2g-tractor-view.md`) is the browser half, the end-to-end tests, the entry flip, deleting the old path and removing `window.tp`/`window.game`. 2g starts only after 2f's last task. The old `src/main.js` keeps shipping, unchanged in behaviour, until 2g flips the entry.

**Goal:**
- The engine gets the network command contract Tractor needs: declared command schemas (validation, N-3; a JSON and a binary wire codec), reserved `from`/`at`/`reliable` keys, a sim-side outbox, a transport port and the in-memory hub in a new `lion-hawk/net`, the replication codec moved from Tractor into `lion-hawk/sim`, an injected wall clock (N-4), and `mp()` (T-11). Plus the Pig Pens carry-overs (#56, #59, #68–#74) and Tractor's input needs (#8 pair merge, a device `map` hook).
- Tractor Pickup gets `src/game.sim.js`: one `farm` main scene owning the game for the page's life, the trip flow (intro → drive → show → reward → drive, bedtime, start screen, menus) as overlays and game-wide commands, farm rebuilds through `ctx.load`, and host/guest sync fed by engine commands.
- Parity is proven three ways: the engine path reproduces `drive-seed14.json` and `pickup-seed14.json` exactly (never re-blessed); every one of the 44 test files passes unchanged; the multiplayer suites run a second time on the engine path (`TP_MP=engine`), and an old-path device and an engine-path device play together over one hub at NET_VERSION 3.

**Architecture:**
- **One main scene, `farm`, for the page's life** (Rally #7 precedent). The menus, the show, the sticker card, the start screen and the sleep screen are **non-pausing** overlays: a pausing overlay would freeze the host's sim and its guests with it. They hold the tractor through `game.mode` as today (`start`, `menu`, `show`, `reward`, `sleep`).
- **The farm pipeline is the scene's `step` hook**, not `ctx.system`s, because the engine suspends only the step hook while a load is active ([S-6], #90): `pilot → sync.before → game.step → sync.after → bridge events → step sounds → bedtime → trip`, the order of today's frame loop.
- **Flow state lives in the sim ([S-4], #4):** `started`, `trip`, `guide`, `sleepAfter`, `show`, `reward`, `bed`, `progress`, `settings`. The show stays a view cutscene (its timing follows the voice) that ends with a game-wide `show.done` ack carrying where each animal stands (#79). The reward is computed in the sim (`completeShow`, already pure).
- **Network messages are game-wide commands** (#49, #75). A port (view/service side) turns transport events into commands with reserved keys `from` (transport peer id), `at` (arrival time on the injected clock) and `reliable`; JSON messages are validated by declared schemas; replica frames arrive decoded to plain JSON (`net.frame`), so tapes stay plain JSON and a guest's tape replays without its host (#78). The sim sends through `engine.net` (an outbox the port drains after each step); binary appears only in replica frames on the outbox and on the wire.
- **Net placement:** the generic, entity-free pieces move into the engine (codec, interpolation, forecast, rate/size limits, schemas, transports, port, `mp()`); Tractor's rules stay game-side (`host.js`, `guest.js`, `kinds.js`, `bindings.js`, `players.js`, `protocol.js`, `session.js`, vendored `handshake.js`). See "Decisions" for why.
- **Wire compatibility:** Tractor keeps JSON event messages (`codec: 'json'`) and today's frames, so NET_VERSION stays 3 and an old-path device plays with an engine-path device (T7's interop test). The binary command codec is built and tested in the engine but not adopted (it would need NET_VERSION 4, #91).
- **Point to go in the world frame:** the device `map` hook (T-E8) turns the screen stick and the camera yaw into world-frame axes `goX`/`goZ` (a radially merged pair, #8) and a `goBack` button (the screen-relative reverse cone, #81); the pilot reads only those. They are ordinary actions: recorded in tapes as input changes, never per-frame commands.
- **Strangler order (ruling 1):** T-E1–T-E11 on the engine; T1–T2 prep (purity, engine modules behind the game's paths); T3–T6 the sim half alongside the old code; T7–T8 multiplayer and replay parity; T9 notes. The old entry ships unchanged; every task leaves Tractor building and green.

**Tech Stack:** plain JS ES modules, `node:test`, happy-dom (engine view unit tests), `playwright-core` with `lion-hawk/playwright` (engine e2e only in 2f), esbuild, Rapier `@dimforge/rapier3d-compat` ^0.21, three ^0.186.

**Spec:** `docs/spec.md` §4 (N-1…N-17), §5 (R-1…R-8, S-1…S-6, I-1…I-7, U-1…U-5), §7 (D-4, T-1…T-11, T-17), §8.2/§8.4. Inputs: `docs/field-notes.md` (#4, #5, #6, #8, #49, #56, #59, #67–#74 and the new #75–#91 from this plan), `docs/plans/2026-10-12-phase-2e-pigpens.md` and `2026-10-11-phase-2c-rally.md` (format, strangler and parity precedents), `2026-10-11-phase-2d-notes.md` (Tractor needs). Tractor: `games/tractor-pickup/docs/tractor-pickup-spec.md` v1.12 (§3 F-/N-, §7 C-, §8 U-/S-/W-, §9 W-, §10 P-, §11 X-, §14 M-).

## Global Constraints

- **Controller precondition:** this plan, the 2g plan and their field notes are committed on `phase-2e`. Before T-E1 the controller creates the engine branch: `cd /home/smiller/projects/four43/lion-hawk-engine && git switch -c phase-2f phase-2e`. All T-E tasks commit on `phase-2f`. Refresh the bare backup (`/home/smiller/projects/four43/lion-hawk-engine-backup.git`) at the end, as in earlier phases.
- **Where:**
  - Engine repo `/home/smiller/projects/four43/lion-hawk-engine`, branch `phase-2f` (T-E1–T-E11, and the field-note commits of T1–T9).
  - Tractor Pickup in the four43 worktree `/home/smiller/projects/four43/four43-lion-hawk/games/tractor-pickup`, branch `feat/lion-hawk` (T1–T9). It consumes the engine through `games/node_modules/lion-hawk`, so engine commits are visible at once.
  - The worktree has uncommitted Pig Pens edits that are not this plan's: never stage them; always `git add` explicit paths.
  - Never modify `/home/smiller/projects/four43/four43` (the main checkout). Rally and Pig Pens are read-only: run their suites.
- **Green after every task:**
  - engine: `cd /home/smiller/projects/four43/lion-hawk-engine && npm test` (274 tests at the start of 2f; the count only grows);
  - workspace: `cd /home/smiller/projects/four43/four43-lion-hawk/games && env -u CI npm test`;
  - Tractor: `cd /home/smiller/projects/four43/four43-lion-hawk/games/tractor-pickup && npm test` (726 tests in 44 files at the start; every one keeps passing with **no assertion changed**; from T7 also `TP_MP=engine npm test`, see T7 for its named exceptions);
  - after T-E8 and T-E9 (devices and the driver) also Rally's `npm run test:e2e` and `npm run test:mobile` (797 checks) and Pig Pens' `npm run test:e2e`.
- **Goldens:** `test/goldens/drive-seed14.json`, `test/goldens/pickup-seed14.json` and `test/golden.test.mjs` are never changed and never blessed (`LH_BLESS` is not used; T3 passes `bless: false`). New goldens are written by their first run and committed. Every new range check is two-sided (#3).
- **Purity:** after T1, `src/game.sim.js`, `src/game/`, `src/sim/` and the sim-side net modules (`src/net/host.js`, `guest.js`, `players.js`, `kinds.js`, `bindings.js`, `protocol.js`, `replica.js`, `interp.js`, `forecast.js`) stay sim-pure (T1's purity test). `session.js`, `link.js`, `netlog.js`, `handshake.js`, `src/main.js`, `src/ui/`, `src/render/`, `src/audio/` are view/service code.
- **Builds:** never run `build.py` in 2f (it writes `site/exp`). Bundle-check the old entry into the scratchpad instead: `cd /home/smiller/projects/four43/four43-lion-hawk/games/tractor-pickup && npx esbuild src/main.js --bundle --format=iife --minify --loader:.json=json --outfile="$SCRATCH/tp/app.js" --log-level=warning`, where `$SCRATCH` is the session scratchpad directory the controller gives each implementer; then `git -C /home/smiller/projects/four43/four43-lion-hawk status --short site/exp` must print nothing. No game version bump (stays 1.8.0), NET_VERSION stays 3, no release, no deploy, no push.
- **Parity:** every player-visible behaviour in "Behaviour parity" below keeps its feel. A change not listed there is a defect; a listed change goes to the playtest list.
- **Engine conventions:** view modules take their environment as options; no allocation per step or per device update in engine code except the documented per-command, per-message and per-move cases; `CHANGELOG.md` and version `0.7.0` in T-E11.
- **Field notes:** each task sets the status of the notes it lands to `done (2f <task>)` in both the index table and the entry's text, in the same commit (engine repo). A task in the four43 worktree commits its field-note update separately in the engine repo (`docs: field notes after 2f <task>`).
- **Code style:** match each repo: dense, short comments citing spec IDs (`[S-4]`, `M-14`) and field notes (`#79`).
- **Commits:** conventional commits, explicit `git add` paths, **no `Co-Authored-By` trailer and no AI attribution**, no push. Engine: `feat:`/`fix:`/`test:`/`docs:`; Tractor: `feat(tractor):`/`refactor(tractor):`/`test(tractor):`.

---

## File structure

**Engine** (`/home/smiller/projects/four43/lion-hawk-engine`)

| File | Change |
|---|---|
| `src/core/engine.js`, `src/core/ui.js` | T-E1: ctx to control callbacks and game-wide handlers (#69); always-copied command data (#72); `engine.flushEvents()` (#71). T-E3: `time.wall`, `wall0`, `engine.onStep`. T-E5: schema'd commands, `engine.net` outbox. T-E9: `ui.hold({ wall })` |
| `src/core/loop.js` | T-E3: `frame(seconds, now)` stamps each step (N-4, M-69) |
| `src/core/actions.js` | T-E8: `axis({ pair })`, radial pair merge (#8) |
| `src/defs/fields.js` (new) | T-E4: `F` (from Tractor's `replica.js`, plus `F.uint` min and `F.actions`), `kind` |
| `src/sim/replica.js`, `src/sim/interp.js`, `src/sim/forecast.js`, `src/sim/limits.js` (new) | T-E4: frames, tracker, store, `frameToJson`/`frameFromJson`; interpolation and forecast (moved from Tractor); `createRate`, `createWarnOnce` |
| `src/sim/schema.js` (new) | T-E5: `checkSchema`, `wireCodec` (json, binary) |
| `src/net/transport.js`, `src/net/port.js`, `src/index.net.js` (new) | T-E6: `emitter`, `createMemoryHub`, `withLag`, `parseLag`, `roomLink` (moved from Tractor's `link.js`); `createPort`; the `lion-hawk/net` entry |
| `src/index.sim.js`, `src/index.view.js`, `package.json` | exports for the above; `"./net"` |
| `src/view/driver.js`, `src/view/pointer.js`, `src/view/gesture.js` (new) | T-E9: devices get `update(dt, raw)`; `bindPointer({ uncapped })` (#56); `bindGesture` (#59) |
| `src/view/touch.js`, `src/view/keyboard.js`, `src/view/gamepad.js`, `src/view/mapPair.js` (new) | T-E8: the device `map` hook |
| `testing/headless.js`, `testing/state.js`, `testing/golden.js`, `testing/replay.js`, `testing/mp.js` (new), `testing/index.js` | T-E2: `h.debug` (#70), events flushed on read (#71), `golden({ exact })` (#68), `assertFinite` over Map/Set/cycles. T-E3: tapes carry `wall0`. T-E7: `mp()` |
| `testing/playwright.js` | T-E10: `point` refuses off-screen points (#73), `openGame({ initScript })` (#74) |
| `test/*.test.mjs`, `test/fixtures/relay.js`, `test/fixtures/hold.{js,view.js,html}` (new) | tests for the above |
| `CHANGELOG.md`, `package.json`, `src/version.js`, `docs/spec.md`, `docs/field-notes.md` | T-E11: 0.7.0 |

**Tractor Pickup** (`/home/smiller/projects/four43/four43-lion-hawk/games/tractor-pickup`)

| File | Change |
|---|---|
| `test/purity.test.mjs` (new); `src/net/host.js`, `src/net/guest.js`, `src/net/session.js` | T1: sim purity; the syncs' `clock` becomes required (session passes `performance.now`) |
| `src/net/replica.js`, `interp.js`, `forecast.js`, `link.js`, `protocol.js` | T2: thin re-exports of the engine modules; `protocol.js`'s checks derived from schema tables |
| `src/sim/pilot.js` | T3: `stickToWorld`, `pilot.drive` (world frame, #81) |
| `src/game.sim.js`, `src/game/farm.js` (new) | T3–T6: `tractorGame()`, the farm scene, its API, presets, state, debug |
| `src/game/flow.js`, `src/game/overlays.js`, `src/game/commands.js` (new) | T4–T5: trip cues, show/reward/bedtime/start/menus, the overlays' sim halves and local commands |
| `src/game/net.js` (new); `src/net/host.js`, `src/net/guest.js` | T6: the net facade and network commands; `sync.message`/`sync.frame`; the guest's building-farm welcome (#80) |
| `test/golden-farm.test.mjs`, `test/pilot-world.test.mjs`, `test/flow.test.mjs`, `test/bed.test.mjs` (new) | T3–T5 |
| `test/mp.engine.harness.mjs`, `test/mp.engine.test.mjs`, `test/mp.interop.test.mjs` (new); `test/mp.harness.mjs` | T7: the engine-path harness, the `TP_MP=engine` switch (harness only), interop |
| `test/tape.test.mjs` (new) | T8: record and replay, solo and as a guest |

---

## Interfaces shared by the engine tasks

**Commands ([I-7] as extended):**
- Game-wide handlers are called `(engine, data, ctx)`, `ctx` being the main scene's ctx (undefined if none is open) (#69). Scene handlers are unchanged.
- `engine.command(type, data)` always validates `data` as plain JSON and delivers a copy, recording or not (#72). The error message stays `engine: command data must be plain JSON`.
- A command may be declared with a schema: `defineGame({ commands: { [type]: { schema: { [field]: F.* }, handler } } })`. Its data is checked at issue (`engine: command '<type>' does not match its schema`) and its handler receives the checked copy (unknown keys dropped). `ctx.command(type, fn)` for a schema'd type throws `engine: '<type>' has a schema: handle it in defineGame({ commands }) (#49)`.
- **Reserved keys** `from` (string: the transport peer id), `at` (finite number: ms on the injected clock) and `reliable` (boolean) may accompany any command's data; a schema may not declare them (`defineGame: commands.<type>.schema may not declare reserved key '<k>'`). The port sets them; local callers may (tests, replays).
- Engine-reserved command types issued by a port: `net.open { role: 'host' | 'guest', id, hostId, at }`, `net.peer { event, id?, reason?, at }` (`event`: `peer | peerLeft | peerAway | peerBack | hostAway | hostBack | closed`), `net.frame { frame, from, at, reliable }` (`frame`: `frameToJson` of a decoded frame). A game that binds a port handles them game-wide.

**`engine.net`** (sim-side outbox): `send(to, data, reliable = false)` queues `{ to, data, reliable }` (`data` a JSON message `{ t, ... }` or an `ArrayBuffer` replica frame); `leave()` queues `{ leave: true }`; `drain(fn)` calls `fn(item)` for each item in order and empties the queue; `pending` is the queue length. After each step the `onStep` listeners run (a port drains there), then whatever is left is discarded, so with no port attached (headless, replays) the queue never grows. A send made between steps goes out after the next step.

**Game net config** (`defineGame({ net })`, validated by `defineGame`):
```js
net: {
  kinds,                       // replicated kinds (F/kind); the port decodes frames with createRegistry(kinds, { maxSender })
  maxSender,                   // highest device number (Tractor: MAX_PLAYERS)
  maxJson = 2048, maxFrame = 16384,
  rates: { host: { reliable, fast, reliableFrames? }, guest: { reliable, fast } }, // per peer, per 1 s window on the injected clock
  wire: { toHost: { [tag]: commandType }, toGuest: { [tag]: commandType } },     // every commandType must be declared with a schema
  codec: 'json' | 'binary',
}
```

**Injected clock (N-4, M-69):** `engine.time.wall` is the stamp, in ms, of the state the current (or last) step makes. `engine.frame(seconds, now)`: each step of that frame is stamped `now − (acc − dt)·1000` with `acc` the accumulator before the step (steps sit exactly `1000/hz` apart). Steps run without `now` (`stepN`, `advance`, `frame(seconds)`) are stamped `previous + 1000/hz`; the first previous is `createEngine(game, { wall0 = 0 })`. The browser driver passes the rAF timestamp. `engine.onStep(fn)` calls `fn(engine)` after every step (after `events.flush` and the step counter), returns an unsubscribe; listeners are copy-on-write.

**Replication codec** (`lion-hawk/sim`, moved from Tractor's `src/net/replica.js`, `interp.js`, `forecast.js` with no behaviour change): `F.{bool, uint(bytes, max, min = 0), id, oneOf, fixed, angle, quat, obj, list, actions(actionsMap)}`, `kind`, `createRegistry`, `encodeRecord`, `encodeFrame`, `decodeFrame`, `isFrame`, `FRAME`, `MAX_FRAME`, `REPEAT`, `createTracker`, `createStore`, `frameToJson(decoded) → { key, sender, time, groups: [{ kind: name, records: [[id, rec]], removed: [id] }] }`, `frameFromJson(json, registry) → decoded form` (`groups` a `Map` of `{ records: Map, removed }`, as `decodeFrame` returns), `createInterp`, `lerp`, `lerpAngle`, `lerpPose`, `DELAY`, `createForecast`, `FORECAST`, `extrapolate`, `qmul`, `rotate`, `newPose`; `createRate(perSec)`, `createWarnOnce(log)`.

**Schemas** (`lion-hawk/sim`): `checkSchema(fields, data) → copy | null` (plain JSON validation: `uint` an integer in `[min, max]`; `id` null or an integer `0..0xfffe`; `oneOf` a listed value; `bool` a boolean; `fixed` finite in `[lo, hi]`; `angle` finite; `quat` four finite numbers; `obj`/`list` recursively, `list` length in `[min, max]`; every declared field present; unknown keys dropped). `wireCodec(table, { codec }) → { encode(tag, data), decode(wire) → { tag, data } | null }`, `table` mapping a tag to fields: `json` wires are `{ t: tag, ...fields }`; `binary` wires are an `ArrayBuffer` `[0x20, tagIndex u8, fields packed as replica fields]`.

**`lion-hawk/net`** (Node and browser; not sim-pure): `emitter`, `createMemoryHub`, `withLag`, `parseLag`, `roomLink` (moved from Tractor's `link.js`, unchanged), and `createPort(engine, { transport, role, clock = () => performance.now(), onWarn })`:
- on creation it issues `net.open { role, id: transport.id, hostId: transport.hostId, at }`;
- transport events → `net.peer` commands; messages → rate check (per peer: `fast`, `reliable`, and `reliableFrames` for reliable binary when configured) → size check (`maxJson` on `JSON.stringify`, `maxFrame` on bytes) → frames: `decodeFrame` → `net.frame`; JSON: tag in the incoming table (`toHost` for a host, `toGuest` for a guest) → `checkSchema` → `engine.command(type, { ...data, from, at, reliable })`; anything bad is dropped (counted in `port.stats.dropped`, warned once per kind);
- `engine.onStep` → `engine.net.drain`: frames are sent as bytes; JSON is checked against the outgoing table (a bad one is warned once and dropped); `leave` calls `transport.leave()`;
- `port.close()` unsubscribes everything.

**`mp()`** (`lion-hawk/test`, [T-11]): `mp(game, { peers = 2, link = {}, clock, record = false, seed = 1, argsOf = () => undefined, beforeStep })` → `w = { hub, peers, host, guests, now, step(n = 1, inputs), seconds(s, inputs), addPeer(), settle(agree, { maxSeconds = 3 }) }`. Peer `i`: `{ index, name: 'host' | 'guest<i>', h (headless handle), engine, net (hub endpoint), port }`; `inputs` is an array of action snapshots or `(peer, i) => snapshot`, applied with `engine.input.set`; `beforeStep(peer, i)` runs before each peer's step. Each `w.step` advances the hub clock by `1000/hz`, ticks the hub, then steps every peer in order (`h.step(1)`, so tapes record). A peer added later is created with `wall0 = hub.now`, so every engine's `time.wall` equals `hub.now` after each step. `settle(agree)` steps until `agree(w)` returns `[]` and returns what is left.

**Input (#8, I-5):** `axis({ pair: 'other' })` declares a pair (the partner must be another axis, and each pair is declared once). A pair merges per source by vector length (ties to the first registered source); `set`/`hold` still override per axis. Devices take `map: { from: [nx, ny], to(x, y, out) → out, radial = 0 }`: the device's bindings may target the virtual names `nx`, `ny` instead of actions; on every write and on every `update`, the device feeds its virtual pair (after a radial dead zone `radial`) to `to` with a reused `out` and writes `out` (whose keys must be actions) as its layer. `bindStick` gains `update()` for this.

**Holds and gestures (#56, #59):** the driver calls `device.update(dt, raw)` (`dt` capped at `maxFrame`, `raw` uncapped); `boot` keeps both for view halves as `view.dt` and `view.rawDt`. `bindPointer({ uncapped: true })` counts its long press on `raw`. `ui.hold({ wall: true })` counts `engine.time.wall − (wall at press)` instead of engine time. `bindGesture(engine, el, { tap, hold: { seconds, fire }, drag, pinch, uncapped = true, tapMove = 12, tapSeconds = 0.45, doc })` (view-only callbacks, no commands) → `{ update(dt, raw), dispose() }`.

---

## Interfaces shared by the Tractor tasks

**Actions** (`src/game.sim.js`, `ACTIONS`): `goX: axis({ pair: 'goZ' })`, `goZ: axis()` (the wanted direction in the world frame, length = stick distance), `goBack: button()` (the stick is in the reverse cone, C-8), `horn: button()`.

**Pilot** (`src/sim/pilot.js`, sim-pure): `stickToWorld(sx, sy, camYaw, out) → out` sets `out.goX`, `out.goZ` (`m·sin(camYaw − a)`, `m·cos(camYaw − a)` with `a = atan2(sx, sy)`, `m = min(1, hypot)`) and `out.goBack` (`m > 0 && |a| > π − PILOT.revCone`); `createPilot().drive(goX, goZ, back, yaw, speed) → { thr, steer, turn, onTarget }` gives what `update(stick, camYaw, yaw, speed)` gives for the same stick (within 1e-9). `update` stays for `pilot.test.mjs` and the old entry.

**`tractorGame({ clock, bindings } = {})`** (`src/game.sim.js`) → `defineGame({ id: 'tractor-pickup', sim: { hz: 60, maxCatchUp: 3, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm', scenes: { farm, sandbox, start, show, reward, paint, book, parent, multiplayer, sleep }, commands, net, state, debug })`; `export default tractorGame()`. `clock` overrides the syncs' wall clock (tests only); `bindings` overrides the replicated kinds (tests only, `mp.test.mjs`'s new-kind test). The caller initialises Rapier first (#6).

**Farm scene args:** `{ seed, power, player = 1, started = false, trip = true, progress, settings, bed }`. `seed` defaults to `settings.seed`, then `engine.rng('seeds').int(0, 0xffffffff)` (#86); `power` to `settings.power`; `progress`, `settings` and `bed` are the stored records (clamped with `clampProgress`, `clampSettings`, `clampBedtime`); `trip: false` turns off the trip and bedtime (the old harness's world).

**Farm state** (`ctx.state` of `farm`; view halves read it as `engine.scene.state`):

| Field | Meaning |
|---|---|
| `game` | the `createGame` (or `createSandbox`) object (#28: never in `game.state()`) |
| `gen`, `seed` | farm builds so far; this farm's seed |
| `started` | the trip has started (F-11) |
| `tripOn`, `trip` | the `trip` arg; `createTrip()` state |
| `raw` | `null`, or `{ thr, steer, turn?, horn }` used instead of the pilot (goldens and the mp harness only; not recorded) |
| `stepIn` | the reused pilot output `{ thr, steer, turn, onTarget, horn }` |
| `guide` | the barn path and arrow are on (F-2, N-2) |
| `sleepAfter` | the next `drive` cue goes to sleep (N-4) |
| `show` | `null` or `{ riders, done, skipped }` (`riders`: `[{ animal, slot }]` from `startShow`) |
| `showDone`, `rewardDone` | flags `stepTrip` consumes |
| `reward` | `null` or `{ sticker, newPaint, newHat }` |
| `bed`, `date` | the bedtime record; the latest wall date (epoch ms) from a `clock` command, `null` before |
| `progress`, `settings` | the player's records (W-1…W-4, P-3…P-7) |
| `sfx` | `{ surface, air, whee }` for the step sounds (#87) |
| `net` | `{ role: 'solo' \| 'host' \| 'guest', sync, facade, at, registry }` |
| `nextFarm` | a farm request that arrived while a load was active |

**Local commands** (game-wide, view → sim; plain functions; each validates or clamps its own data): `play {}`, `paint { body, trim }`, `hat { id }`, `sticker.place { i, page, x, y }`, `sticker.unplace { i }`, `book.seen {}`, `stickers.clear {}`, `settings { power, voice, music, seed }`, `bed.set { minutes, date }` (`minutes` one of `BEDTIME_CHOICES` or `null`), `clock { date }`, `farm.new {}`, `show.done { spots: [[id, x, y, z, yaw], ...] }`, `net.close {}`.

**Network commands** (game-wide, from the port): `net.open`, `net.peer`, `net.frame`; host side `host.hello`, `host.claim`, `host.release`, `host.delivered`, `host.tree`, `host.regrow`, `host.horn`, `host.help`, `host.paint`; guest side `guest.welcome`, `guest.tree`, `guest.regrow`, `guest.horn`, `guest.help`. Schemas are `protocol.js`'s `TO_HOST`/`TO_GUEST` tables (T2).

**UI controls** (registry; 2g adopts the game's markup with `data-lh-slot`): `farm.paint`, `farm.book` (drive buttons, `when` started, mode `drive`, no show), `farm.parent` (`ui.hold`, 2 s, `wall: true`), `start.go`, `reward.go`, `paint.close`, `book.close`, `parent.close`, `parent.mp`, `multiplayer.close`, `show.skip` (`ui.hold`, 1 s, `wall: true`), `sleep.wake` (`ui.hold`, 5 s, `wall: true`).

**Events** (`engine.emit`): everything `game.step` and the syncs return, bridged unchanged in their order (net events first, M-44), plus the farm's own (`FARM_EVENTS`): `play`, `say { ids, low? }`, `guide { on }`, `help { animal }` (local help; a guest's comes from its sync with the same shape), `show { riders: [{ id, type, golden, car, k }], steps }`, `showSkip`, `reward { sticker, newPaint, newHat }`, `progress { progress }`, `settings { settings }`, `bed { bed }`, `sleep { quiet }`, `wake`, `whee`, `cheer`, `squelch`, `farm { gen, seed }`.

**`game.state(engine)`** (JSON-safe): `{ mode, started, gen, seed, landed, full, tractor: { x, z, yaw, speed }, trip, guide, show, reward, bed: { phase, choice }, net: { role, you }, paint, shows, barnWait }`.

**`game.debug(engine)`**: `{ get game(), get farm(), get sync(), drive(raw), trainAt(x, z, yaw), riders(n), newFarm() }`.

**Presets** (`farm.presets`): `started`, `riders { n }` (n free single animals land in the slots), `barn { n = 3 }` (riders, the train 20 m out from the barn facing in), `last` (bedtime's last drive), `asleep`.

---

## Behaviour parity (ruling 5)

Every player-visible behaviour of today's game, where it lives after 2f+2g, and whether it changes. **Changes are flagged and go to the playtest list.** 2g's tasks cite these rows.

| # | Behaviour today | New home | Change |
|---|---|---|---|
| 1 | A new farm per visit (random seed), `?seed=`, P-5 seed setting | `boot` seed random per visit; farm arg `seed`; `farm.new` draws from `engine.rng('seeds')` | none |
| 2 | F-11 start screen (paint + go) only with a paint choice; otherwise drive at once, first touch/key/stick move starts the trip and the voice | `start` overlay, `start.go`; `play` command from the view's first gesture; the farm starts on the first non-zero `goX`/`goZ` (A-7) | none |
| 3 | Intro: "Let's find animals!", 3 s | trip cue → `say` event | none |
| 4 | Point to go (C-1, C-2, C-8–C-11): stick vs the camera heading, read each step; reverse cone 35°; crawl, turn help, aim help | device `map` → `goX`/`goZ`/`goBack`; `pilot.drive` | heading within 1e-9; **keys, stick and pad merge by vector length** (today: keys override the stick, a pad overrides both, #82) |
| 5 | Touch stick: floating, 24 px edge guard, radial dead zone 0.1, radius 70, buttons don't start it, lets go on hide/blur | `bindStick` (thumb origin) with `map` | none |
| 6 | Keyboard W/A/S/D and arrows as stick directions, diagonals normalised; gamepad left stick (radial dead zone 0.15) | `bindKeyboard`/`bindGamepad` with `map` (`radial: 0.15` for the pad) | none |
| 7 | Horn: button (pointerdown), H, pad A (once per press, per pad) | `horn` action (`bindHold`, keyboard, gamepad button 0) | none |
| 8 | Boops, flights, landing, riders, dodges, trees, props, mud, wash, dirt (game.step) | unchanged `createGame`, stepped by the farm | none (goldens exact) |
| 9 | Landing word (W-5), slot bar (U-1), slot tap (W-8), golden flash | view, from `land` events | none |
| 10 | Full: "Great job! Go to the barn!", sparkle path and arrow (F-2) | `say` + `guide` | none |
| 11 | Help after 20 s idle (F-4): an animal comes, arrow 10 s; a guest asks the host | trip cue → `help` event (local) or the guest sync's `help` | none |
| 12 | Barn pass → stop (F-1, F-5), barn wait bubble (M-72) | `game.step`; `barnWait` in state | none |
| 13 | Show (F-5–F-8, F-12–F-16): camera, hops, counts, sum, tally, golden loop, voice-paced; hurry hold 1 s; cheer tap; skip hold 1 s | view cutscene; `show` overlay; `show.skip` `ui.hold` (wall); hurry/cheer with `bindGesture` (2g) | **remote players see your riders stay in the trailer during your show** (today they see them hop out, #79); the end positions are the same |
| 14 | After the show: riders walk into the barn from their show spots (F-10) | `show.done { spots }` → `finishShow` | none |
| 15 | Sticker card (F-3, W-1, W-3, W-4): sticker, new paint/hat, bells, voice; go button | `reward` overlay, `reward.go`; reward computed in the sim | none |
| 16 | Drive buttons (U-6): paint screen and sticker book hold the tractor; red X closes; intro end does not free it | `farm.paint`/`farm.book` → `paint`/`book` overlays (mode `menu`) | none |
| 17 | Paint pots, hats, sticker drags, book seen badge, persisted | `paint`, `hat`, `sticker.*`, `book.seen` commands; `progress` events saved by the view | none |
| 18 | Parent menu: 2 s hold on the gear; bedtime, power, voice, music, seed, new farm (not for a guest), clear stickers (closes open screens), multiplayer | `farm.parent` (`ui.hold` wall 2 s) → `parent` overlay; `settings`, `bed.set`, `farm.new`, `stickers.clear`; `parent.mp` | none |
| 19 | New farm: everything rebuilt, guests follow (M-19) | `farm.new` → `ctx.load` (frames 1); `sync.setGame` | **the farm is rebuilt one presented frame after the request** (today: in the same frame, behind a stopped loop) |
| 20 | Bedtime (N-1–N-7): minutes on the wall clock, last drive, empty last drive stops, goodnight, wake hold 5 s, kept across reloads | `bed.set`/`clock` commands; `sleep` overlay, `sleep.wake` (`ui.hold` wall 5 s); `bed` events saved by the view | **the bedtime is checked once a second** (the view's `clock` command), not every step |
| 21 | Night/day fade, lullaby, voice lines | view, from `sleep`/`wake` events and `bed.phase` | none |
| 22 | Step sounds: squelch (sandbox), whee and cheer when airborne > 0.15 s | `farm` step → `whee`/`cheer`/`squelch` events (#87) | none |
| 23 | Multiplayer: host/join panel, room code, QR, `?r=`, lock, remove, away/back, alone, barn lock, claims, poofs, trees, horn marks, arrows, circles | syncs fed by engine commands; panel in 2g | **a message is handled at the next step, not on arrival** (the same frame in practice, #75); **a guest's farm arrives one step and one frame after the welcome** (#80) |
| 24 | M-50 checks, rate limits in wall time, size limits | the port (N-3) and, until 2g's last task, the syncs too | none |
| 25 | `?lag=`, `?signal=`, `?sandbox`, `?tune`, `?fps` | 2g (`withLag` from `lion-hawk/net`; a `sandbox` scene) | none |
| 26 | Audio unlock, page hide/show (X-13), back gesture (X-14), PWA | 2g (view) | none |
| 27 | `window.tp`, `window.game` (with `?tune`), `window.engine` | `window.engine` (+ `debug`); aliases removed at the end of 2g | dev-facing |

---

### Task T-E1: ctx to callbacks, copied commands, loads from a game-wide handler (`src/core/engine.js`, `src/core/ui.js`)

Field notes #69, #72, #49 (part), priority 3 (engine side).

**Interfaces:** control `when(engine, ctx)`, `get(engine, ctx)`, `set(value, engine, ctx)`, function `action(engine, ctx)` and `ui.hold` function actions get the ctx of the control's own scene (`createUi` takes `ctxOf(sceneName)`). Game-wide command handlers are called `(engine, data, mainCtx)`. Command data is always validated as plain JSON and delivered as a copy. A game-wide handler may call `ctx.load(...)` on the main scene; it checks `engine.loading.active` first, as S-6 says.

- [ ] **Step 1: Write the failing tests** (add to `test/commands.test.mjs`; `actions`, `button` from `../src/index.sim.js`):
```js
test('2f: game-wide handlers get the main scene ctx and can start its load; a second request while loading waits (#69, S-6)', () => {
  const freed = [];
  const g = defineGame({ id: 'rebuild', start: 'farm',
    commands: { 'farm.new': (e, d, ctx) => { if (e.loading.active) { ctx.state.next = d.seed; return; }
      ctx.load({ build: (en, c) => { freed.push(c.state.world.id); c.state.world = { id: d.seed }; }, frames: 1 }); } },
    scenes: { farm: { enter(e, ctx) { ctx.state.world = { id: 0 }; }, exit(e, ctx) { freed.push(ctx.state.world.id); } } } });
  const h = headless(g);
  h.command('farm.new', { seed: 7 }).command('farm.new', { seed: 8 }).step(1);
  assert.equal(h.engine.loading.active, true); assert.equal(h.scene.state.next, 8);
  h.untilLoaded(); assert.equal(h.scene.state.world.id, 7); assert.deepEqual(freed, [0]); // the old world went in the build, once
});
test('2f: command data is always checked as plain JSON and delivered as a copy, recording or not (#72)', () => {
  const got = [], g = defineGame({ id: 'copy', start: 's', scenes: { s: {} }, commands: { keep: (e, d) => got.push(d) } });
  const e = createEngine(g), ray = [1, 2, 3];
  e.command('keep', { ray }); ray[0] = 99; e.stepN(1);
  assert.deepEqual(got[0], { ray: [1, 2, 3] });
  assert.throws(() => e.command('keep', { f: () => 1 }), /engine: command data must be plain JSON/);
  assert.throws(() => e.command('keep', { n: NaN }), /plain JSON/);
});
```
(add to `test/ui.test.mjs`):
```js
test('2f: when/get/set and function actions get (engine, ctx) of their own scene, also on an overlay (#69)', () => {
  const seen = [];
  const g = defineGame({ id: 'ctxui', start: 'main', scenes: {
    main: { ui(u) { u.toggle({ id: 't', label: 'T', get: (e, c) => !!c.state.on, set: (v, e, c) => { c.state.on = v; } }); } },
    menu: { enter(e, c) { c.state.k = 'menu'; }, ui(u) {
      u.button({ id: 'b', label: 'B', when: (e, c) => c.state.k === 'menu', action: (e, c) => seen.push(['action', c.name, e.scene.name]) });
      u.hold({ id: 'h', label: 'H', seconds: 1 / 60, action: (e, c) => seen.push(['hold', c.name]) });
    } } } });
  const h = headless(g); h.overlay('menu');
  h.tap('main.t'); assert.equal(h.scene.state.on, true);
  assert.equal(h.engine.ui.tree().find(c => c.id === 'main.t').pressed, true);
  h.tap('menu.b'); h.press('menu.h'); h.step(1);
  assert.deepEqual(seen, [['action', 'menu', 'main'], ['hold', 'menu']]);
  assert.equal(h.enabled('menu.b'), true);
});
```
- [ ] **Step 2: Run them:** `node --test test/commands.test.mjs test/ui.test.mjs`. Expected: the new tests FAIL (handlers get no ctx; the toggle's `get` reads `c.state` of an engine; data is passed by reference).
- [ ] **Step 3: Implement.** `createUi({ …, ctxOf })`: every call site that passed `ctx` (the engine) now passes `(engine, ctxOf(c.scene))`; `set(v, engine, ctx)`; tree/enabled/press/advance likewise. `deliver`: `gf(engine, c.data, stack[0]?.ctx)`. `command`: always `json(data, 'command data')`, delivering the checked copy (keep the recording path: it already logs that copy). **(judgment)** Rally and Pig Pens read `e.scene.state` in their controls with one argument; the extra arguments are additive, so they must pass unchanged. If a game issues non-JSON command data, stop and report (do not relax the check; those games are read-only here).
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/core/engine.js src/core/ui.js test/commands.test.mjs test/ui.test.mjs docs/field-notes.md && git commit -m "feat: callbacks and game-wide handlers get their scene ctx; command data is always a checked copy (#69, #72)"`

---

### Task T-E2: Test helpers: `h.debug`, events on read, exact goldens, a safer `assertFinite` (`testing/`)

Field notes #68, #70, #71.

**Interfaces:** `h.debug` → `game.debug?.(engine) ?? {}`, made once per handle. `engine.flushEvents()` flushes pending events unless a step or transition is running; `h.events`, `h.since` and `window.engine.events.since` call it first. `golden(file, value, { exact: true })` canonicalises without rounding (the stored file records `exact: true`; comparing an exact file without `exact`, or the reverse, throws `golden <file>: stored exact=<a>, called with exact=<b>`). `assertFinite` walks `Map` values (path `.key`), `Set` values (path `[i]`), typed arrays, and visits each object once (cycles are fine).

- [ ] **Step 1: Write the failing tests** (`test/headless.test.mjs`, `test/golden.test.mjs`, `test/state.test.mjs`, `test/hook.test.mjs`):
```js
test('2f: h.debug is the game\'s debug extras, made once per handle (#70)', () => {
  let made = 0;
  const g = defineGame({ id: 'dbg', start: 's', scenes: { s: {} }, debug: e => { made++; return { step: () => e.time.step }; } });
  const h = headless(g); assert.equal(h.debug.step(), 0); h.step(2); assert.equal(h.debug.step(), 2); assert.equal(made, 1);
  assert.deepEqual(headless(defineGame({ id: 'nod', start: 's', scenes: { s: {} } })).debug, {});
});
test('2f: an event emitted outside a step is visible to h.events and h.since at once (#71)', () => {
  const h = headless(defineGame({ id: 'ev', start: 's', scenes: { s: {} } }));
  const m = h.mark(); h.engine.emit('poke', { n: 1 });
  assert.deepEqual(h.events.of('poke').map(e => e.n), [1]); assert.equal(h.since(m).count('poke'), 1);
  h.step(1); assert.equal(h.events.of('poke').length, 1, 'flushed once, not again');
});
```
```js
test('2f: golden({ exact: true }) compares every bit and refuses a mode mix (#68)', () => {
  const f = join(dir, 'exact.json');
  golden(f, { x: 0.1 + 0.2 }, { exact: true, bless: true });
  assert.doesNotThrow(() => golden(f, { x: 0.30000000000000004 }, { exact: true }));
  assert.throws(() => golden(f, { x: 0.3 }, { exact: true }), /changed/);
  assert.throws(() => golden(f, { x: 0.3 }), /stored exact=true, called with exact=false/);
});
```
```js
test('2f: assertFinite walks Maps, Sets and typed arrays and survives cycles', () => {
  const a = { m: new Map([['k', { v: 1 }]]), s: new Set([2]), t: new Float64Array([3]) }; a.self = a;
  assert.doesNotThrow(() => assertFinite(a, 'a'));
  a.m.get('k').v = NaN; assert.throws(() => assertFinite(a, 'a'), /a\.m\.k\.v is not finite: NaN/);
  a.m.get('k').v = 1; a.s.add(Infinity); assert.throws(() => assertFinite(a, 'a'), /a\.s\[1\] is not finite: Infinity/);
  a.s.delete(Infinity); a.t[0] = NaN; assert.throws(() => assertFinite(a, 'a'), /a\.t\[0\] is not finite: NaN/);
});
```
```js
test('2f: window.engine.events.since sees an event emitted outside a step (#71)', () => {
  const e = createEngine(defineGame({ id: 'hk', start: 's', scenes: { s: {} } })), target = {};
  installEngine(e, { driver: { manual() {} }, target }); e.emit('poke', {});
  assert.deepEqual(target.engine.events.since(0).map(x => x.type), ['poke']);
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `h.events` becomes a getter (the same array object every time) that calls `engine.flushEvents()`; `since` too. `golden`: `exact` skips `norm`'s rounding (`-0` still becomes `0`); the stored JSON gains `exact` only when true. `assertFinite`: a `WeakSet` of visited objects.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite (Rally's and Pig Pens' goldens are 6-digit files: unchanged). Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add testing/headless.js testing/golden.js testing/state.js src/core/engine.js src/view/hook.js test/headless.test.mjs test/golden.test.mjs test/state.test.mjs test/hook.test.mjs docs/field-notes.md && git commit -m "feat(test): h.debug, events flushed on read, exact goldens, assertFinite over Map/Set/cycles (#68, #70, #71)"`

---

### Task T-E3: The injected wall clock and `engine.onStep` (`src/core/loop.js`, `src/core/engine.js`, `src/view/driver.js`, `testing/`)

Field notes #76 (N-4, M-69).

**Interfaces:** as "Injected clock" above. `loop.frame(seconds, now)` passes each step its stamp (`step(dt, stamp)`); the engine sets `time.wall` before `input.apply`. The driver calls `engine.frame(dt, ts)`. `headless(game, { wall0 })`; tapes carry `wall0` (`v` stays 1; `replay` uses `tape.wall0 ?? 0`).

- [ ] **Step 1: Write the failing tests** (`test/loop.test.mjs`, `test/engine.test.mjs`, `test/replay.test.mjs`):
```js
test('2f: time.wall stamps each step: virtual when stepped by hand, from the frame time in a frame (N-4, M-69)', () => {
  const g = defineGame({ id: 'clk', start: 's', scenes: { s: {} } }), seen = [];
  const e = createEngine(g, { wall0: 1000 }); e.system('rec', en => seen.push(en.time.wall), { stage: 'input.apply' });
  e.stepN(3); assert.deepEqual(seen.map(x => +x.toFixed(3)), [1016.667, 1033.333, 1050]);
  const f = createEngine(g, { acks: 'frames' }), w = []; f.system('rec', en => w.push(en.time.wall), { stage: 'input.apply' });
  f.frame(2.5 / 60, 5000); // two steps fit; half a step is still owed after them
  assert.deepEqual(w.map(x => +x.toFixed(3)), [4975, 4991.667]);
  f.frame(1 / 60, 5000 + 50 / 3); assert.equal(+w[2].toFixed(3), 5008.333); // exactly one step after the last
  f.stepN(1); assert.equal(+w[3].toFixed(3), 5025);
});
test('2f: onStep runs after each step, once events are flushed; it unsubscribes', () => {
  const g = defineGame({ id: 'os', start: 's', scenes: { s: { step(e) { e.emit('tick'); } } } }), e = createEngine(g), seen = [];
  e.events.on(x => seen.push(x.type));
  const off = e.onStep(en => seen.push(`after:${en.time.step}`)); e.stepN(2); off(); e.stepN(1);
  assert.deepEqual(seen, ['tick', 'after:1', 'tick', 'after:2', 'tick']);
});
```
```js
test('2f: a tape keeps wall0 and the replay starts from it', () => {
  const g = defineGame({ id: 'w0', start: 's', scenes: { s: { step(e, dt, c) { c.state.t = e.time.wall; } } }, state: e => ({ t: e.scene.state.t ?? 0 }) });
  const h = headless(g, { record: true, wall0: 5000 }); h.step(120);
  const tape = h.tape(); assert.equal(tape.wall0, 5000);
  assert.equal(replay(g, tape).state().t, h.state().t);
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `run(cap)` compute the stamp before `step(dt, stamp)` and `acc -= dt`; `frame(seconds, now)` with `now` undefined stamps nothing (the engine continues virtually). Allocation-free.
- [ ] **Step 4: Run** engine `npm test`, the workspace suite and Rally's/Pig Pens' e2e (the driver changed). Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/core/loop.js src/core/engine.js src/view/driver.js testing/headless.js testing/replay.js test/loop.test.mjs test/engine.test.mjs test/replay.test.mjs test/driver.test.mjs docs/field-notes.md && git commit -m "feat: engine.time.wall step stamps from an injected clock, engine.onStep, tapes keep wall0 (N-4, #76)"`

---

### Task T-E4: The replication codec in the engine (`src/defs/fields.js`, `src/sim/replica.js`, `interp.js`, `forecast.js`, `limits.js`)

Field note #78 (part).

**Interfaces:** as "Replication codec" above. The code moves verbatim from Tractor's `src/net/replica.js`, `interp.js`, `forecast.js` and `protocol.js` (`createRate`, `createWarnOnce`), with three additions: `F.uint(bytes, max, min = 0)` (encode throws `bad uint` and decode returns null below `min`); `F.actions(actionsMap)` (axes as `i16/32767`, buttons in a flags byte; decodes to `{ [axis]: number, [button]: boolean }`); `frameToJson`/`frameFromJson`.

- [ ] **Step 1: Write the failing tests** (`test/replica.test.mjs` (new), `test/interp.test.mjs` (new), `test/forecast.test.mjs` (new)). Copy Tractor's `test/replica.test.mjs`, `interp.test.mjs` and `forecast.test.mjs` cases that need no Tractor module, replacing Tractor's kinds with a local fixture:
```js
import { F, kind, createRegistry, encodeFrame, decodeFrame, createTracker, createStore, frameToJson, frameFromJson, axis, button, actions } from '../src/index.sim.js';
const POS = F.fixed(-400, 400, 1 / 64);
const CRATE = kind({ name: 'crate', code: 1, authority: 'host', max: 64, idMax: 100, fields: { x: POS, z: POS, open: F.bool(), level: F.uint(1, 9, 2) } });
const CART = kind({ name: 'cart', code: 2, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { yaw: F.angle(), q: F.quat(), pad: F.actions(actions({ steer: axis(), honk: button() })) } });
const REG = createRegistry([CRATE, CART], { maxSender: 4 });

test('2f: a frame round-trips through decode, frameToJson and frameFromJson as plain JSON (#78)', () => {
  const buf = encodeFrame({ key: true, sender: 1, time: 1234, groups: [{ kind: CRATE, records: [[5, { x: 1.5, z: -2, open: true, level: 4 }]], removed: [] }] });
  const f = decodeFrame(buf, REG), j = frameToJson(f);
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j);
  assert.deepEqual(j, { key: true, sender: 1, time: 1234, groups: [{ kind: 'crate', records: [[5, { open: true, x: 1.5, z: -2, level: 4 }]], removed: [] }] });
  const back = frameFromJson(j, REG); assert.deepEqual(back.groups.get('crate').records.get(5), f.groups.get('crate').records.get(5));
});
test('2f: F.uint has a minimum; F.actions packs a snapshot', () => {
  assert.throws(() => encodeFrame({ key: false, sender: 1, time: 0, groups: [{ kind: CRATE, records: [[1, { x: 0, z: 0, open: false, level: 1 }]] }] }), /bad uint 1/);
  const buf = encodeFrame({ key: false, sender: 2, time: 9, groups: [{ kind: CART, records: [[2, { yaw: 1, q: { x: 0, y: 0, z: 0, w: 1 }, pad: { steer: -0.5, honk: true } }]] }] });
  const r = decodeFrame(buf, REG).groups.get('cart').records.get(2);
  assert.ok(Math.abs(r.pad.steer + 0.5) < 1e-4); assert.equal(r.pad.honk, true);
});
```
plus the tracker (repeat 3, removal), store (newer, keyframe removal, `forget`), interpolation (offset follows the least-delayed message, delay 100–300 ms) and forecast (horizon, fade, snap) cases, re-pointed at the engine modules with unchanged expectations.
- [ ] **Step 2: Run them:** `node --test test/replica.test.mjs test/interp.test.mjs test/forecast.test.mjs`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Move the code; keep every comment's spec ID (they cite Tractor's M- IDs: keep them and add the engine's N- IDs). `src/defs/fields.js` holds `F` and `kind`; `src/sim/replica.js` the rest. Export everything from `src/index.sim.js`. **(judgment)** `F.actions` keeps a stable field order (`Object.keys` of the actions map) and at most 8 buttons per flags byte (more buttons get more bytes); it is not used by Tractor yet (N-8).
- [ ] **Step 4: Run** engine `npm test` (the purity test now scans the new `src/defs` and `src/sim` files) and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/defs/fields.js src/sim/replica.js src/sim/interp.js src/sim/forecast.js src/sim/limits.js src/index.sim.js test/replica.test.mjs test/interp.test.mjs test/forecast.test.mjs docs/field-notes.md && git commit -m "feat: the replication codec, interpolation and forecast in lion-hawk/sim, moved from Tractor Pickup (N-8, N-11)"`

---

### Task T-E5: Command schemas, wire codecs and the outbox (`src/sim/schema.js`, `src/core/engine.js`)

Field notes #49, #77, #91.

**Interfaces:** as "Commands", "Schemas", "`engine.net`" and "Game net config" above.

- [ ] **Step 1: Write the failing tests** (`test/schema.test.mjs` (new), `test/commands.test.mjs`):
```js
import { F, checkSchema, wireCodec, defineGame, createEngine } from '../src/index.sim.js';
import { headless } from '../testing/index.js';
const IDS = F.list(F.uint(2, 0xfffe), 16), PAINT = F.obj({ body: F.oneOf(['red', 'blue']), trim: F.oneOf(['red', 'blue']) });
const TABLE = { hello: { v: F.uint(1, 3, 3), paint: PAINT }, claim: { ids: IDS }, help: { id: F.id() }, regrow: {} };

test('2f: checkSchema accepts good data, drops unknown keys and refuses the rest (N-3)', () => {
  assert.deepEqual(checkSchema(TABLE.claim, { ids: [3, 4], extra: 1 }), { ids: [3, 4] });
  assert.deepEqual(checkSchema(TABLE.help, { id: null }), { id: null });
  for (const bad of [{ ids: [1.5] }, { ids: [-1] }, { ids: 'a' }, {}, { ids: Array.from({ length: 17 }, (_, i) => i) }]) assert.equal(checkSchema(TABLE.claim, bad), null, JSON.stringify(bad));
  assert.equal(checkSchema(TABLE.hello, { v: 2, paint: { body: 'red', trim: 'red' } }), null);
  assert.equal(checkSchema(TABLE.hello, { v: 3, paint: { body: 'green', trim: 'red' } }), null);
  assert.equal(checkSchema(TABLE.hello, { v: 3, paint: { body: 'red', trim: 'blue' }, farm: undefined }) !== null, true);
});
test('2f: the json and binary wire codecs round-trip a table and drop bad wires (#91)', () => {
  for (const codec of ['json', 'binary']) {
    const w = wireCodec(TABLE, { codec });
    for (const [tag, data] of [['hello', { v: 3, paint: { body: 'blue', trim: 'red' } }], ['claim', { ids: [1, 2, 3] }], ['help', { id: 7 }], ['regrow', {}]]) {
      const wire = w.encode(tag, data); if (codec === 'json') assert.deepEqual(wire, { t: tag, ...data }); else assert.ok(wire instanceof ArrayBuffer);
      assert.deepEqual(w.decode(wire), { tag, data }, `${codec} ${tag}`);
    }
    assert.equal(w.decode(codec === 'json' ? { t: 'nope' } : new ArrayBuffer(2)), null);
    assert.throws(() => w.encode('claim', { ids: [-1] }), /wire: 'claim' does not match its schema/);
  }
});
test('2f: a schema\'d command is checked at issue, gets the checked copy, and is game-wide only (#49)', () => {
  const got = [];
  const g = defineGame({ id: 'sch', start: 's', commands: { 'host.claim': { schema: TABLE.claim, handler: (e, d) => got.push(d) } },
    scenes: { s: { enter(e, ctx) { assert.throws(() => ctx.command('host.claim', () => {}), /'host.claim' has a schema: handle it in defineGame/); } } } });
  const h = headless(g);
  h.command('host.claim', { ids: [1], junk: 2, from: 'g2', at: 5, reliable: true }).step(1);
  assert.deepEqual(got, [{ ids: [1], from: 'g2', at: 5, reliable: true }]);
  assert.throws(() => h.command('host.claim', { ids: [1.5] }), /engine: command 'host.claim' does not match its schema/);
  assert.throws(() => defineGame({ id: 'r', start: 's', scenes: { s: {} }, commands: { x: { schema: { from: F.bool() }, handler() {} } } }), /may not declare reserved key 'from'/);
});
test('2f: engine.net hands a step\'s sends to its onStep listeners, then empties (no port, no growth)', () => {
  const g = defineGame({ id: 'out', start: 's', scenes: { s: { step(e, dt, c) { if (c.state.send !== false) e.net.send('g1', { t: 'help', id: 1 }, true); } } } });
  const e = createEngine(g), seen = [];
  const off = e.onStep(en => en.net.drain(x => seen.push(x))); e.stepN(1); off();
  assert.deepEqual(seen, [{ to: 'g1', data: { t: 'help', id: 1 }, reliable: true }]);
  e.stepN(2); assert.equal(e.net.pending, 0, 'nobody drained: discarded after each step');
  e.scene.state.send = false; e.net.leave(); assert.equal(e.net.pending, 1, 'a send between steps waits for the next step');
  e.onStep(en => en.net.drain(x => seen.push(x))); e.stepN(1); assert.deepEqual(seen.at(-1), { leave: true });
});
test('2f: defineGame checks the net config: every wire tag names a schema\'d command', () => {
  assert.throws(() => defineGame({ id: 'n', start: 's', scenes: { s: {} }, net: { kinds: [], maxSender: 4, rates: { host: { reliable: 60, fast: 60 }, guest: { reliable: 60, fast: 120 } }, wire: { toHost: { claim: 'host.claim' }, toGuest: {} }, codec: 'json' } }), /net.wire.toHost.claim: 'host.claim' is not a command with a schema/);
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `src/sim/schema.js` (sim-pure) and the engine parts. Reserved keys are copied through after the schema check (type-checked: `from` string, `at` finite number, `reliable` boolean). The binary codec packs fields with the replica field encoders (one shared `put`/`get` from `src/sim/replica.js`). **(judgment)** Keep `engine.command`'s plain-JSON check first (the same message as today), then the schema.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/sim/schema.js src/core/engine.js src/index.sim.js test/schema.test.mjs test/commands.test.mjs docs/field-notes.md && git commit -m "feat: declared command schemas, json and binary wire codecs, reserved from/at/reliable keys and the engine.net outbox (N-3, #49, #77)"`

---

### Task T-E6: `lion-hawk/net`: transports and the port (`src/net/transport.js`, `src/net/port.js`, `src/index.net.js`)

Field notes #75, #77, #78.

**Interfaces:** as "`lion-hawk/net`" above. `transport.js` is Tractor's `link.js` minus `createWarnOnce` (now from `src/sim/limits.js`), unchanged in behaviour. `package.json` exports `"./net": "./src/index.net.js"`.

- [ ] **Step 1: Write the failing tests.** `test/fixtures/relay.js` (new; also used by T-E7):
```js
// A two-role game for the port and mp() tests (lion-hawk 2f T-E6): the host says a number to every peer each step and sends a
// `ping` keyframe every 10 steps; a guest can be told to send a wrong-direction message or to leave. Every command is logged.
import { defineGame, F, kind, encodeFrame } from '../../src/index.sim.js';
export const PING = kind({ name: 'ping', code: 1, authority: 'host', max: 4, idMax: 3, fields: { n: F.uint(2) } });
const N = { n: F.uint(2) }, log = type => (e, d, ctx) => { ctx.state.log.push({ type, data: d }); };
export default defineGame({
  id: 'relay', start: 's',
  net: { kinds: [PING], maxSender: 4, rates: { host: { reliable: 60, fast: 60, reliableFrames: 4 }, guest: { reliable: 60, fast: 120 } },
    wire: { toHost: { echo: 'host.echo' }, toGuest: { say: 'guest.say' } }, codec: 'json' },
  commands: {
    'net.open': (e, d, ctx) => { log('net.open')(e, d, ctx); ctx.state.role = d.role; ctx.state.hostId = d.hostId; },
    'net.peer': (e, d, ctx) => { log('net.peer')(e, d, ctx); if (d.event === 'peer') ctx.state.peers.push(d.id); },
    'net.frame': log('net.frame'),
    'host.echo': { schema: N, handler: log('host.echo') },
    'guest.say': { schema: N, handler: log('guest.say') },
  },
  scenes: { s: {
    enter(e, ctx) { Object.assign(ctx.state, { log: [], peers: [], role: null, hostId: null, n: 0, bad: false, leave: false }); },
    step(e, dt, ctx) {
      const s = ctx.state;
      if (s.role === 'guest') { if (s.bad) e.net.send(s.hostId, { t: 'say', n: 1 }, true); if (s.leave) { s.leave = false; e.net.leave(); } return; }
      if (s.role !== 'host') return;
      s.n++;
      for (const p of s.peers) {
        e.net.send(p, { t: 'say', n: s.n }, true);
        if (s.n % 10 === 0) e.net.send(p, encodeFrame({ key: true, sender: 1, time: s.n, groups: [{ kind: PING, records: [[1, { n: s.n }]], removed: [] }] }), true);
      }
    },
  } },
  state: e => ({ n: e.scene.state.n, logged: e.scene.state.log.length }),
});
```
`test/port.test.mjs` (new):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHub, createPort } from '../src/index.net.js';
import { createEngine } from '../src/index.sim.js';
import relay from './fixtures/relay.js';

const pair = ({ onWarn } = {}) => {
  const hub = createMemoryHub(); let now = 0; const clock = () => now;
  const H = createEngine(relay), G = createEngine(relay);
  const hp = createPort(H, { transport: hub.host(), role: 'host', clock }), gp = createPort(G, { transport: hub.join(), role: 'guest', clock, onWarn });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { now += 1000 / 60; hub.tick(now); H.stepN(1); G.stepN(1); } };
  return { hub, H, G, hp, gp, step };
};
const log = (e, type) => e.scene.state.log.filter(c => c.type === type).map(c => c.data);

test('2f: net.open and transport events become commands with at (N-1, #75)', () => {
  const w = pair(); w.step(2);
  assert.equal(log(w.H, 'net.open')[0].role, 'host'); assert.equal(log(w.G, 'net.open')[0].role, 'guest');
  const p = log(w.H, 'net.peer')[0]; assert.equal(p.event, 'peer'); assert.equal(p.id, w.gp.transport.id); assert.ok(Number.isFinite(p.at));
});
test('2f: messages arrive as schema-checked commands with from, at and reliable; frames as plain-JSON net.frame (#77, #78)', () => {
  const w = pair(); w.step(12);
  const say = log(w.G, 'guest.say')[0];
  assert.deepEqual([say.from, say.reliable, typeof say.n, typeof say.at], [w.hp.transport.id, true, 'number', 'number']);
  const fr = log(w.G, 'net.frame')[0]; assert.equal(fr.frame.groups[0].kind, 'ping'); assert.deepEqual(JSON.parse(JSON.stringify(fr)), fr);
});
test('2f: bad, oversized, unknown or too many messages are dropped at the port, counted on the injected clock (N-3)', () => {
  const w = pair(); w.step(2); const g = w.gp.transport, to = g.hostId;
  for (let i = 0; i < 70; i++) g.send(to, { t: 'echo', n: i }, true);
  w.step(1); assert.equal(log(w.H, 'host.echo').length, 60); assert.equal(w.hp.stats.dropped, 10);
  w.step(66); // a new 1 s window on the port's clock
  g.send(to, { t: 'echo', n: -1 }, true); g.send(to, { t: 'echo', n: 1, pad: 'x'.repeat(3000) }, true); g.send(to, { t: 'nope' }, true); g.send(to, { t: 'echo', n: 5 }, true);
  w.step(1); assert.equal(log(w.H, 'host.echo').length, 61); assert.equal(w.hp.stats.dropped, 13);
});
test('2f: the port drains engine.net after each step: frames as bytes, JSON checked against the outgoing table, leave closes', () => {
  const warned = [], w = pair({ onWarn: k => warned.push(k) }), sent = [];
  w.hub.drop = (from, to, d) => { sent.push([from, d instanceof ArrayBuffer ? 'bytes' : d.t]); return false; };
  w.step(12); assert.ok(sent.some(([, t]) => t === 'say') && sent.some(([, t]) => t === 'bytes'));
  w.G.scene.state.bad = true; w.step(1); w.G.scene.state.bad = false;
  assert.equal(sent.some(([f, t]) => f === w.gp.transport.id && t === 'say'), false, 'a guest may not send a host message'); assert.equal(warned.length, 1);
  w.G.scene.state.leave = true; w.step(2);
  assert.ok(log(w.H, 'net.peer').some(p => p.event === 'peerLeft' && p.id === w.gp.transport.id));
});
```
- [ ] **Step 2: Run them:** `node --test test/port.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** `createPort` keeps one rate set per peer id (`fast`, `reliable`, `reliableFrames`), created on first message, deleted on `peerLeft`. The port never steps the engine. `port.transport` exposes the transport (tests send raw through it).
- [ ] **Step 4: Run** engine `npm test` (`package.test.mjs` also imports `lion-hawk/net`) and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/net/transport.js src/net/port.js src/index.net.js package.json test/fixtures/relay.js test/port.test.mjs test/package.test.mjs docs/field-notes.md && git commit -m "feat(net): lion-hawk/net with the in-memory hub, lag, room link and a port that turns messages into commands (N-1, N-2, N-3)"`

---

### Task T-E7: `mp()` (`testing/mp.js`)

Field note #75.

**Interfaces:** as "`mp()`" above.

- [ ] **Step 1: Write the failing test** (`test/mp.test.mjs` (new)):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp, replay } from '../testing/index.js';
import relay from './fixtures/relay.js';
test('2f: mp() runs peers over one hub in lockstep; every engine\'s wall clock is the hub\'s (T-11, N-4)', () => {
  const w = mp(relay, { peers: 3 });
  w.seconds(1);
  assert.deepEqual(w.peers.map(p => p.name), ['host', 'guest1', 'guest2']);
  for (const p of w.peers) assert.equal(p.engine.time.wall, w.now);
  assert.ok(w.guests.every(g => g.engine.scene.state.log.some(c => c.type === 'guest.say')));
  const late = w.addPeer(); w.seconds(0.5); assert.equal(late.engine.time.wall, w.now);
});
test('2f: mp() latency, drop and settle', () => {
  const w = mp(relay, { peers: 2, link: { delay: 200 } });
  w.seconds(0.1); assert.equal(w.guests[0].engine.scene.state.log.some(c => c.type === 'guest.say'), false, 'nothing within 200 ms');
  const left = w.settle(x => x.guests[0].engine.scene.state.log.some(c => c.type === 'guest.say') ? [] : ['no say'], { maxSeconds: 1 });
  assert.deepEqual(left, []);
  w.hub.drop = () => true; const n = w.guests[0].engine.scene.state.log.length; w.seconds(0.5); assert.equal(w.guests[0].engine.scene.state.log.length, n);
});
test('2f: mp({ record: true }) gives each peer a tape that replays alone (T-9)', () => {
  const w = mp(relay, { peers: 2, record: true }); w.seconds(2);
  const g = w.guests[0], tape = g.h.tape();
  assert.ok(tape.log.some(x => x.ops?.some(o => o[0] === 'command' && o[1] === 'net.frame')));
  assert.equal(replay(relay, tape).checksum(), g.h.checksum());
});
```
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** `testing/mp.js`, exported from `testing/index.js`. Peers are `headless` handles with `wall0` (T-E3); ports use `clock ?? (() => hub.now)`.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add testing/mp.js testing/index.js test/mp.test.mjs docs/field-notes.md && git commit -m "feat(test): mp() runs headless peers over the in-memory hub with ports (T-11)"`

---

### Task T-E8: Paired axes and the device `map` hook (`src/core/actions.js`, `src/view/{touch,keyboard,gamepad,mapPair}.js`)

Field notes #8, #81, #82.

**Interfaces:** as "Input" above. `bindStick` returns `{ update, dispose }` (`update` re-applies `map` while a finger is down; it is a no-op without `map`). `bindKeyboard`'s `update` and `bindGamepad`'s `update` apply `map` after computing their values. With `map`, a device writes only `out`'s keys; the virtual names never reach `engine.input`.

- [ ] **Step 1: Write the failing tests** (`test/actions.test.mjs`, `test/touch.test.mjs`, `test/keyboard.test.mjs`, `test/gamepad.test.mjs`):
```js
test('2f: a paired axis merges per source by vector length, not per axis (#8)', () => {
  const inp = createInput(actions({ gx: axis({ pair: 'gz' }), gz: axis(), other: axis() }));
  inp.device({ gx: 0.9, gz: 0 }, 'keys'); inp.device({ gx: 0.5, gz: 0.8 }, 'stick'); // 0.9 < 0.943
  let s = inp.apply(); assert.deepEqual([s.gx, s.gz], [0.5, 0.8]);
  inp.device({ gx: 1, gz: 0.5 }, 'keys'); s = inp.apply(); assert.deepEqual([s.gx, s.gz], [1, 0.5]); // both from keys now
  inp.set({ gz: -1 }); s = inp.apply(); assert.deepEqual([s.gx, s.gz], [1, -1]); // set still overrides one axis
  assert.throws(() => actions({ a: axis({ pair: 'b' }) }), /actions: 'a' pairs with unknown action 'b'/);
  assert.throws(() => actions({ a: axis({ pair: 'b' }), b: button() }), /actions: 'a' pairs with 'b', which must be an axis/);
  assert.throws(() => actions({ a: axis({ pair: 'b' }), b: axis({ pair: 'a' }) }), /actions: declare the pair 'a'\/'b' once/);
});
```
```js
const WORLD = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button() });
const camMap = cam => ({ from: ['sx', 'sy'], to: (x, y, out) => {
  const m = Math.min(1, Math.hypot(x, y)), a = Math.atan2(x, y), w = cam.yaw - a;
  out.goX = m * Math.sin(w); out.goZ = m * Math.cos(w); out.goBack = m > 0 && Math.abs(a) > Math.PI * 0.8; return out; } });
test('2f: bindStick map turns the stick into world-frame actions and re-applies it each update while held (#8, #81)', () => {
  const s = setupWith(WORLD), cam = { yaw: 0 }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  const st = bindStick(s.engine, { root: s.root, x: ['sx', 1], y: ['sy', 1], map: camMap(cam), deadZone: 0, doc: s.document });
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 200, 230); // straight up, full
  let v = s.v(); near(v.goX, 0); near(v.goZ, 1); assert.equal(v.goBack.down, false);
  cam.yaw = Math.PI / 2; st.update(0.016); v = s.v(); near(v.goX, 1); near(v.goZ, 0); // the camera turned under a still thumb
  s.ev(s.window, 'pointermove', 1, 200, 370); v = s.v(); assert.equal(v.goBack.down, true);
  s.ev(s.window, 'pointerup', 1); v = s.v(); assert.deepEqual([v.goX, v.goZ, v.goBack.down], [0, 0, false]);
});
```
(`setupWith(schema)` is `setup` with the given actions; add it beside `setup`.) `test/keyboard.test.mjs`: W+D with `map: camMap({ yaw: 0 })` gives `goX = goZ = √½` (diagonals normalised by the map); S alone gives `goBack.down === true`. `test/gamepad.test.mjs`: `axes: { 0: ['sx', 1], 1: ['sy', -1] }`, `deadZone: 0`, `map: { ...camMap({ yaw: 0 }), radial: 0.15 }`: a stick at `(0.1, -0.1)` (inside the radial zone, outside a per-axis one) writes zeros; `(0, -1)` writes `goZ === 1`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `src/view/mapPair.js` exports `applyMap(map, x, y, out)` (radial dead zone like Tractor's `radial`, then `map.to`). Each device keeps one reused `out` per map. `createInput` builds the pair table once; `merged` for a paired axis picks the source with the largest `hypot` over both axes (allocation-free).
- [ ] **Step 4: Run** engine `npm test`, the workspace suite, Rally's `npm run test:e2e` and `npm run test:mobile`, Pig Pens' `npm run test:e2e`. Expected: all pass (no game declares a pair or a map yet).
- [ ] **Step 5: Commit** (engine): `git add src/core/actions.js src/view/mapPair.js src/view/touch.js src/view/keyboard.js src/view/gamepad.js test/actions.test.mjs test/touch.test.mjs test/keyboard.test.mjs test/gamepad.test.mjs docs/field-notes.md && git commit -m "feat(input): paired axes merge by vector length; devices take a map hook to world-frame actions (#8)"`

---

### Task T-E9: Holds on wall time, an uncapped long press, `bindGesture`, and a hold e2e (`src/core/ui.js`, `src/view/{driver,pointer,gesture}.js`)

Field notes #56, #59, #83.

**Interfaces:** as "Holds and gestures" above. `ui.hold({ wall: true })`: at press the control records `engine.time.wall`; each `lh.ui` pass sets `held = (time.wall − t0) / 1000`; it fires once `held ≥ seconds`; `tree()` progress uses it. `bindGesture` callbacks: `tap(e)`, `hold.fire(e)` (once per press, after `hold.seconds` of `raw` or `dt` time with the finger within `tapMove` px), `drag({ dx, dy, phase })` (one finger past `tapMove`; phases `start | move | end`), `pinch({ scale, rotate, panX, panY, phase })` (two fingers); a second finger ends a one-finger gesture.

- [ ] **Step 1: Write the failing tests** (`test/ui.test.mjs`, `test/pointer.test.mjs`, `test/driver.test.mjs`, `test/gesture.test.mjs` (new), `test/hold-e2e.test.mjs` (new)):
```js
test('2f: ui.hold({ wall: true }) counts wall time between steps, not capped engine time (#56, #83)', () => {
  const g = defineGame({ id: 'wake', start: 's', scenes: { s: { ui(u) { u.hold({ id: 'wake', label: 'Wake', seconds: 5, wall: true, action: e => e.emit('woke') }); } } } });
  const e = createEngine(g, { acks: 'frames' }); let fired = 0; e.events.on(x => { if (x.type === 'woke') fired++; });
  e.frame(1 / 60, 1000); e.ui.press('s.wake');
  for (const now of [1700, 2400, 3100, 3800, 4500, 5200, 5900]) e.frame(0.7, now); // slow frames: 3 capped steps (0.05 s) each
  assert.equal(fired, 0); assert.ok(e.ui.tree()[0].progress > 0.9);
  e.frame(0.7, 6600); assert.equal(fired, 1);
});
test('2f: bindPointer({ uncapped: true }) counts the long press on raw frame time (#56)', () => {
  const s = setup({ press: 0.75, uncapped: true, at: () => ({}) });
  s.ev(s.el, 'pointerdown', 1, 50, 50);
  for (let i = 0; i < 4; i++) s.p.update(0.1, 0.2); // the driver passes (capped, raw)
  assert.deepEqual(s.phases(), ['down', 'press']);
});
test('2f: the driver gives devices (capped, raw) frame time (#56)', () => {
  const seen = [], device = { update: (dt, raw) => seen.push([dt, raw]) };
  const { tick, driver } = setup({ devices: [device] }); driver.start(); tick(0); tick(400);
  assert.deepEqual(seen[1].map(x => +x.toFixed(3)), [0.25, 0.4]); // countdown's maxFrame is the default 0.25
});
```
`test/gesture.test.mjs` (new; drags start on the move that passes `tapMove`, then move once per `update`; a pinch starts when the second finger lands and moves once per `update`; a lift ends either):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGesture, createEngine, defineGame } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
const setup = (o = {}) => {
  const { window, document } = dom(), log = [];
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const ev = (t, type, id, x = 0, y = 0) => t.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0 }));
  const g = bindGesture(engine, el, { tap: () => log.push('tap'), hold: { seconds: 1, fire: () => log.push('hold') }, drag: d => log.push(`drag:${d.phase}`),
    pinch: p => log.push(`pinch:${p.phase}:${p.scale.toFixed(2)}`), doc: document, ...o });
  return { window, el, ev, g, log };
};
test('2f: bindGesture: a quick tap; a still finger held 1 s of raw time fires once and is no tap (#59, #56)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.g.update(0.016, 0.016); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log, ['tap']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 2, 10, 10); for (let i = 0; i < 4; i++) s.g.update(0.1, 0.3); // capped 0.4 s, raw 1.2 s
  s.ev(s.window, 'pointerup', 2, 10, 10); assert.deepEqual(s.log, ['hold']);
});
test('2f: bindGesture: a drag past 12 px, a two-finger pinch, and a second finger cancels a hold (#59)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.ev(s.window, 'pointermove', 1, 50, 10); s.g.update(0.016, 0.016); s.ev(s.window, 'pointerup', 1, 50, 10);
  assert.deepEqual(s.log, ['drag:start', 'drag:move', 'drag:end']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.el, 'pointerdown', 2, 200, 100); s.ev(s.window, 'pointermove', 2, 300, 100); s.g.update(0.016, 0.016);
  s.ev(s.window, 'pointerup', 2, 300, 100); s.ev(s.window, 'pointerup', 1, 100, 100);
  assert.deepEqual(s.log, ['pinch:start:1.00', 'pinch:move:2.00', 'pinch:end:2.00']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.g.update(0.5, 0.5); s.ev(s.el, 'pointerdown', 2, 60, 10); s.g.update(0.6, 0.6);
  s.ev(s.window, 'pointerup', 2, 60, 10); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log.filter(x => x === 'hold' || x === 'tap'), []);
});
```
`test/fixtures/hold.js` (`defineGame({ id: 'hold', start: 's', scenes: { s: { ui(u) { u.hold({ id: 'wake', label: 'Wake', seconds: 1, wall: true, action: e => e.emit('woke') }); } } } })`), `hold.view.js` (`boot(hold, defineView({ scenes: {} }))`) and `hold.html` (the countdown page's head, a `<button data-lh-slot="s.wake">Wake</button>` and the bundle). `test/hold-e2e.test.mjs` builds and serves them exactly as `e2e.test.mjs` serves the countdown, skips without Chromium, and loads the page **without** `?lh-test`, so the driver runs on real frames:
```js
test('2f: a ui.hold({ wall: true }) button fires after its seconds of real time, not before (#56, #83)', async t => {
  if (skip) return t.skip(skip);
  const ctx = await chrome.browser.newContext(), page = await ctx.newPage();
  try {
    await page.goto(base); await page.waitForFunction(() => window.engine?.ui.tree().some(c => c.id === 's.wake'));
    const b = await page.locator('[data-testid="s.wake"]').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const woke = () => page.evaluate(() => window.engine.events.since(0).filter(e => e.type === 'woke').length);
    const progress = () => page.evaluate(() => document.querySelector('[data-testid="s.wake"]').style.getPropertyValue('--lh-progress'));
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
    assert.equal(await woke(), 0); assert.equal(Number(await progress() || 0), 0);
    await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
    assert.equal(await woke(), 1);
  } finally { await ctx.close(); }
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `createDriver` keeps the uncapped `dt` and passes both; `boot`'s frame-time device sets `view.rawDt` beside `view.dt` (both 0 for renders the driver didn't start). `bindPointer`'s `update(dt, raw = dt)` adds `uncapped ? raw : dt`. `bindGesture` in `src/view/gesture.js`, exported from `lion-hawk/view`. **(judgment)** `bindGesture` shares `bindPointer`'s routing rules (moves/ups by `pointerId` on the window, `pointercancel` is a cancel, blur/pagehide/hidden cancel); do not refactor `bindPointer` onto it in this phase.
- [ ] **Step 4: Run** engine `npm test` (with the new e2e), the workspace suite, Rally's `npm run test:e2e` and `npm run test:mobile`, Pig Pens' `npm run test:e2e`. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add src/core/ui.js src/core/engine.js src/view/driver.js src/view/boot.js src/view/pointer.js src/view/gesture.js src/index.view.js test/ui.test.mjs test/pointer.test.mjs test/driver.test.mjs test/gesture.test.mjs test/hold-e2e.test.mjs test/fixtures/hold.js test/fixtures/hold.view.js test/fixtures/hold.html docs/field-notes.md && git commit -m "feat: ui.hold on wall time, bindPointer uncapped presses, bindGesture, and a real-browser hold test (#56, #59, #83)"`

---

### Task T-E10: Playwright: off-screen points and an init script (`testing/playwright.js`)

Field notes #73, #74.

**Interfaces:** the `view.project` contract becomes `project([x, y, z]) → { x, y, z, onScreen }` (`z` the NDC depth; `onScreen` false when behind the camera or outside the viewport). `game.point({ world })` throws `touch: { world } point is off-screen or behind the camera` when `onScreen === false` (a game whose `project` returns no `onScreen` keeps today's behaviour). `openGame(browser, url, { initScript })` passes `initScript` (a function or `{ content }`) to `page.addInitScript` before navigation.

- [ ] **Step 1: Write the failing tests** (`test/playwright.test.mjs`):
```js
test('2f: game.point refuses a { world } point behind the camera or off-screen (#73)', async () => {
  const page = { evaluate: async (fn, w) => w[0] > 0 ? { x: 5, y: 6, z: 0.5, onScreen: true } : { x: -9, y: 6, z: 1.2, onScreen: false } };
  const g = gameDriver({ page, context: {}, preset: presets.desktop, presetName: 'desktop' });
  assert.deepEqual(await g.point({ world: [1, 0, 0] }), { x: 5, y: 6 });
  await assert.rejects(g.point({ world: [-1, 0, 0] }), /off-screen or behind the camera/);
});
test('2f: openGame adds initScript before the page loads (#74)', async () => {
  const calls = [];
  const page = { on() {}, addInitScript: async (f, a) => calls.push(['init', typeof f === 'function' ? 'fn' : f.content]), goto: async u => calls.push(['goto', u]),
    evaluate: async () => {}, waitForFunction: async () => {} };
  const browser = { newContext: async () => ({ newPage: async () => page }) };
  await openGame(browser, 'http://x/', { initScript: () => { window.WebGLRenderingContext = undefined; } });
  assert.deepEqual(calls.map(c => c[0]), ['init', 'goto']);
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the spec lines ([S-1] `view.project`, [T-17]) in T-E11.
- [ ] **Step 4: Run** engine `npm test`, the workspace suite, Rally's and Pig Pens' e2e. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add testing/playwright.js test/playwright.test.mjs docs/field-notes.md && git commit -m "feat(playwright): game.point refuses off-screen points, openGame takes an initScript (#73, #74)"`

---

### Task T-E11: Engine 0.7.0 (changelog, spec, version)

- [ ] **Step 1:** Bump `package.json` and `src/version.js` to `0.7.0`.
- [ ] **Step 2:** `CHANGELOG.md`: `## 0.7.0 — <date>`, "Phase 2f, the network command round Tractor Pickup needs": ctx to callbacks and game-wide handlers (#69); always-copied command data (#72, **behaviour change**: non-JSON command data now throws without recording); `h.debug`, events flushed on read, exact goldens, `assertFinite` over Map/Set/cycles (#68, #70, #71); `engine.time.wall` and `engine.onStep` (N-4); the replication codec, interpolation and forecast in `lion-hawk/sim`; command schemas, wire codecs, reserved keys and `engine.net`; `lion-hawk/net` (hub, lag, room link, port); `mp()`; paired axes and the device `map` hook (#8); `ui.hold({ wall })`, `bindPointer({ uncapped })`, `bindGesture`, devices get raw time (#56, #59); `game.point` refuses off-screen points, `openGame({ initScript })` (#73, #74).
- [ ] **Step 3:** `docs/spec.md`, short additions, no new IDs: [I-1] `axis({ pair })`; [I-2] the `map` hook, `bindGesture`, `uncapped`; [I-7] ctx to game-wide handlers, always-copied data, schemas, reserved keys, the `net.*` types; [U-1] `ui.hold({ wall })`, ctx arguments; [S-1] `view.project` returns `{ x, y, z, onScreen }`; [R-6] `engine.onStep`; [N-1]–[N-4] the port, `engine.net`, `time.wall`; [N-8] where the codec lives, `F.uint` min, `F.actions`; [T-4] events flushed on read; [T-7] `exact`; [T-9] `wall0`; [T-11] `mp()` as built; [T-17] `initScript`, `point` and off-screen points; §8.1 `src/net/` and `lion-hawk/net`.
- [ ] **Step 4: Run** engine `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 5: Commit** (engine): `git add package.json src/version.js CHANGELOG.md docs/spec.md docs/field-notes.md && git commit -m "docs: lion-hawk 0.7.0 changelog and spec notes for the 2f additions"`

---

### Task T1: Tractor sim purity and required clocks

Field notes #86, #89.

**Files:** `test/purity.test.mjs` (new), `src/net/host.js`, `src/net/guest.js`, `src/net/session.js`.

**Interfaces:** `createHostSync({ clock })` and `createGuestSync({ clock })` throw `host sync: clock required` / `guest sync: clock required` without one; `session.js` passes `clock: () => performance.now()`; the old harness already passes one. `randomSeed` stays in `src/sim/rng.js` (its unit test imports it there) as the one allowed exception, and no sim module may call it.

- [ ] **Step 1: Write the test** (`test/purity.test.mjs`):
```js
// L-3 / T-12: Tractor's sim half never touches three.js, the DOM, the wall clock, Math.random, storage or timers (lion-hawk 2f T1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const NET = ['host', 'guest', 'players', 'kinds', 'bindings', 'protocol', 'replica', 'interp', 'forecast'].map(n => join(src, 'net', n + '.js'));
const SIM = ['game.sim.js', 'game', 'sim', ...NET].map(p => p.startsWith('/') ? p : join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RULES = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(main|game\.view|devices|ui\/[^'"]*|render\/[^'"]*|audio\/[^'"]*|net\/(session|link|netlog|handshake))(\.js)?['"]/];
// #86: randomSeed() keeps its Math.random (its unit test imports it from sim/rng.js); only view code may call it
const ALLOWED = [['sim/rng.js', 'math-random']];

test('sim modules pass the engine purity scan (one named exception)', () => {
  const found = scanPurity(SIM).filter(v => !ALLOWED.some(([f, r]) => v.file.endsWith(f) && v.rule === r));
  assert.deepEqual(found, []);
});
test('sim modules use no storage, timers or view imports, and never call randomSeed', () => {
  const bad = SIM.flatMap(files).flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([f, , l]) => RULES.some(r => r.test(l)) || (!f.endsWith('sim/rng.js') && /\brandomSeed\b/.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
```
- [ ] **Step 2: Run it:** `node --test test/purity.test.mjs`. Expected: FAIL on `host.js`/`guest.js` (`performance.now` defaults).
- [ ] **Step 3: Implement.** Replace the two defaults with the required-clock check; `session.js` passes `clock: () => performance.now()` to both syncs.
- [ ] **Step 4: Run** Tractor `npm test` (all 44 files unchanged), the workspace suite and the bundle check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/test/purity.test.mjs games/tractor-pickup/src/net/host.js games/tractor-pickup/src/net/guest.js games/tractor-pickup/src/net/session.js && git commit -m "refactor(tractor): sim purity test; the syncs take their wall clock from the caller"`

---

### Task T2: Engine net modules behind the game's paths; schema tables for the protocol

Field notes #77, #89, #91.

**Files:** `src/net/replica.js`, `src/net/interp.js`, `src/net/forecast.js`, `src/net/link.js`, `src/net/protocol.js`.

**Interfaces:**
- `replica.js`, `interp.js`, `forecast.js`: `export { … } from 'lion-hawk/sim'` with exactly today's export names; `link.js`: `export { emitter, createMemoryHub, parseLag, withLag, roomLink } from 'lion-hawk/net'`.
- `protocol.js` keeps its constants and gains the schema tables used by T6's net config: `PAINT = F.obj({ body: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES) })`, `IDS = F.list(F.uint(2, MAX_ID), MAX_IDS)`, `TO_HOST = { hello: { v: F.uint(1, NET_VERSION, NET_VERSION), paint: PAINT }, claim: { ids: IDS }, release: { ids: IDS }, delivered: { ids: IDS }, tree: { id: F.uint(2, MAX_ID) }, regrow: {}, horn: {}, help: {}, paint: { paint: PAINT } }`, `TO_GUEST = { welcome: { v: F.uint(1, NET_VERSION, NET_VERSION), seed: F.uint(4), farm: F.uint(4), you: F.uint(1, MAX_PLAYERS, 2), next: F.uint(2, MAX_ID + 1) }, tree: { id: F.uint(2, MAX_ID) }, regrow: {}, horn: { n: F.uint(1, MAX_PLAYERS, 1) }, help: { id: F.id() } }`; `checkFromGuest(m)` / `checkFromHost(m)` = `m` is a plain object whose `t` is in the table and whose fields pass `checkSchema` → `{ t, ...checked }`, else `null`; `createRate`, `createWarnOnce` re-exported from `lion-hawk/sim`; `fitsJson`, `chunks` unchanged.

- [ ] **Step 1:** No new test: `replica.test.mjs`, `interp.test.mjs`, `forecast.test.mjs`, `link.test.mjs`, `protocol.test.mjs`, the mp suites and `session.test.mjs` now run against the engine code and the schema tables. That is this task's test.
- [ ] **Step 2: Implement** the shims and the tables. **(judgment)** If any of the 44 files fails, the engine move (T-E4/T-E6) or the tables changed behaviour: fix the engine or the table, never the test. `protocol.test.mjs`'s `assert.deepEqual(checkFromGuest(m), m)` holds because its good messages carry no extra keys.
- [ ] **Step 3: Run** Tractor `npm test` (726 tests), the workspace suite and the bundle check (the old entry now bundles `lion-hawk/sim` and `lion-hawk/net`). Expected: all pass; the bundle grows by less than 2 KB (report the size before and after in the commit body).
- [ ] **Step 4: Commit** (four43 worktree): `git add games/tractor-pickup/src/net/replica.js games/tractor-pickup/src/net/interp.js games/tractor-pickup/src/net/forecast.js games/tractor-pickup/src/net/link.js games/tractor-pickup/src/net/protocol.js && git commit -m "refactor(tractor): replication, interpolation, forecast and transports come from lion-hawk; protocol checks are schema tables"`

---

### Task T3: `game.sim.js`: the farm scene core and the engine-path goldens

Field notes #4, #28, #81, #87, #90.

**Files:** `src/sim/pilot.js`, `src/game/farm.js` (new), `src/game.sim.js` (new), `test/pilot-world.test.mjs` (new), `test/golden-farm.test.mjs` (new).

**Interfaces** (see the shared interfaces; T3 delivers the farm core, T4–T6 the rest):
- `src/sim/pilot.js`: `stickToWorld`, `pilot.drive` as specified.
- `makeFarm({ R, clock, bindings }) → { scene, api }`. `scene.enter(e, ctx)`: clamps the args' records into state; builds `game` (`createGame(R, { seed, power, player })`, `game.wearHats(wornHats(progress))`, `game.lastDrive = bed.phase === 'last'`); `started = !!a.started`; `game.mode = started ? (bed.phase === 'asleep' ? 'sleep' : 'drive') : hasPaintChoice(progress) ? 'start' : 'drive'`; emits `farm { gen: 1, seed }`. `scene.exit`: frees the Rapier world. `scene.step(e, dt, ctx)`: the pipeline (T3: input → `game.step` → bridge → sounds; T5 adds bedtime, T4 the trip, T6 the syncs).
- Input: `s.raw ?? s.pilot.drive(goX, goZ, goBack.down, game.tractor.yaw, game.tractor.speed)` into `s.stepIn`; `stepIn.horn = horn.pressed` (or `raw.horn`); A-7: not started, mode `drive`, a non-zero `goX`/`goZ` → `api.play(e)`.
- Bridge: every event `game.step` returns, in order, as `e.emit(ev.type, ev)` (the payload keeps its object fields: `animal`, `tree`, `slot`).
- Sounds (#87, today's `stepSounds`): `squelch` (sandbox only), `whee` after 0.15 s with no wheel in contact, `cheer` with it when riders are aboard.
- `src/game/farm.js` also exports `moveTrain(game, x, z, yaw)`, a copy of `test/train.mjs`'s (`src` never imports tests), used by `debug.trainAt` and T4's `barn` preset.
- `src/game.sim.js`: `ACTIONS`, `tractorGame()` (T3: `scenes: { farm, sandbox }`), `state`, `debug` (`game`, `farm`, `drive(raw)` sets `raw`, `trainAt(x, z, yaw)`), `FARM_EVENTS`. `sandbox` is a main scene around `createSandbox` with the same input and sounds steps (no trip, no net).

- [ ] **Step 1: Write the failing tests.** `test/pilot-world.test.mjs`:
```js
// The point-to-go pilot in the world frame (lion-hawk 2f T3, #81): the same driving as the camera-frame pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, stickToWorld, PILOT } from '../src/sim/pilot.js';
import { makeRng } from '../src/sim/rng.js';

test('drive(stickToWorld(stick, camYaw)) gives what update(stick, camYaw) gives', () => {
  const r = makeRng(5), a = createPilot(), b = createPilot(), w = {};
  for (let i = 0; i < 4000; i++) {
    const ang = r.range(-Math.PI, Math.PI), m = r.next() < 0.1 ? 0 : r.range(0, 1.3), stick = { x: Math.sin(ang) * m, y: Math.cos(ang) * m };
    const cam = r.range(-20, 20), yaw = r.range(-20, 20), speed = r.range(0, 9);
    const u = { ...a.update(stick, cam, yaw, speed) }; stickToWorld(stick.x, stick.y, cam, w);
    const d = b.drive(w.goX, w.goZ, w.goBack, yaw, speed);
    for (const k of ['thr', 'steer', 'turn']) assert.ok(Math.abs(u[k] - d[k]) < 1e-9, `${k} ${u[k]} vs ${d[k]} (case ${i})`);
    const e = Math.abs(Math.atan2(Math.sin(cam - Math.atan2(stick.x, stick.y) - yaw), Math.cos(cam - Math.atan2(stick.x, stick.y) - yaw)));
    if (Math.abs(e - PILOT.fullErr) > 1e-6) assert.equal(u.onTarget, d.onTarget, `case ${i}`);
  }
});
test('the reverse cone is the stick\'s, on the screen: straight down reverses whatever the world direction', () => {
  const w = {}; stickToWorld(0, -1, 2.0, w); assert.equal(w.goBack, true);
  stickToWorld(Math.sin(Math.PI - PILOT.revCone + 0.05), Math.cos(Math.PI - PILOT.revCone + 0.05), 0, w); assert.equal(w.goBack, true);
  stickToWorld(1, 0, 0, w); assert.equal(w.goBack, false); stickToWorld(0, 0, 1, w); assert.deepEqual([w.goX, w.goZ, w.goBack], [0, 0, false]);
});
```
`test/golden-farm.test.mjs`:
```js
// The engine path (lion-hawk 2f T3): headless(tractorGame) with the raw input seam reproduces the phase-0 goldens exactly. Never blessed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum, canonical } from 'lion-hawk/test';
import { tractorGame, FARM_EVENTS } from '../src/game.sim.js';
import { createGame } from '../src/sim/game.js';
await R.init();

const ARGS = { seed: 14, power: 'medium', started: true };
const STILL = { thr: 0, steer: 0, horn: false };
const inputAt = i => i < 120 ? STILL : i < 600 ? { thr: 1, steer: Math.sin(i / 60) * 0.6, horn: i % 240 === 0 } : { thr: -0.5, steer: 0.3, horn: false };
const body = b => ({ p: b.translation(), q: b.rotation(), v: b.linvel() });
const snapshot = g => ({ mode: g.mode, landed: g.load.landed(), tractor: body(g.tractor.body), cars: g.train.cars.map(c => body(c.body)),
  animals: g.herd.animals.map(a => ({ id: a.id, type: a.type, state: a.state, x: a.x, z: a.z })) });
const gameEvents = h => h.events.filter(e => !FARM_EVENTS.has(e.type) && e.type !== 'scene' && e.type !== 'overlay').map(e => `${e.step}:${e.type}`);

function drive() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, trail = [];
  for (let i = 0; i < 900; i++) { s.raw = inputAt(i); h.step(1); if (i % 60 === 59) { assertFinite(snapshot(s.game), `step${i}`); trail.push(checksum(snapshot(s.game))); } }
  return { state: snapshot(s.game), events: gameEvents(h), trail };
}
function pickup() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, g = s.game, trail = []; let n = 0;
  const step = input => { s.raw = input; h.step(1); if (n % 60 === 59) trail.push(checksum(snapshot(g))); n++; };
  g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; });
  for (let i = 0; i < 60; i++) step(STILL);
  const single = g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  for (const a of single.slice(0, 3)) { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) step(STILL); }
  for (let i = 0; i < 600; i++) step({ thr: 1, steer: Math.sin(i / 50) * 0.5, horn: false });
  return { state: { ...snapshot(g), slots: g.load.slots.map(x => ({ car: x.car, animal: x.animal?.id ?? null })) }, events: gameEvents(h), trail };
}
function direct() { // the phase-0 run itself, for a bit-exact comparison (#68)
  const g = createGame(R, { seed: 14, power: 'medium' }), events = [], trail = [];
  for (let i = 0; i < 900; i++) { for (const e of g.step(inputAt(i))) events.push(`${i}:${e.type}`); if (i % 60 === 59) trail.push(checksum(snapshot(g))); }
  return { state: snapshot(g), events, trail };
}

test('the farm scene reproduces drive-seed14.json', () => { golden(new URL('./goldens/drive-seed14.json', import.meta.url), drive(), { bless: false }); });
test('the farm scene reproduces pickup-seed14.json', () => { golden(new URL('./goldens/pickup-seed14.json', import.meta.url), pickup(), { bless: false }); });
test('and bit for bit: the engine path equals a direct createGame run', () => { assert.equal(canonical(drive(), { digits: 17 }), canonical(direct(), { digits: 17 })); });
test('the sim rate is the physics step', () => { assert.equal(tractorGame().sim.hz, 60); });
```
- [ ] **Step 2: Run them:** `node --test test/pilot-world.test.mjs test/golden-farm.test.mjs`. Expected: FAIL (`stickToWorld` and `game.sim.js` missing).
- [ ] **Step 3: Implement.** **(judgment)** The goldens pass only if nothing the farm adds touches the game while `raw` drives it: the trip is on (`started`) but within 15 s it only says the intro and sets the mode to `drive` (already `drive`; no help before 20 s idle; no barn pass). If a golden differs, find the stray call (a `wearHats`, a mode write, a sound reading a body); never bless. `farm.exit` frees the world as `main.js`'s `dispose` does. Measure `createGame`'s time for seed 14 and record it in the commit body (it decides T5's load settings).
- [ ] **Step 4: Run** Tractor `npm test`, the workspace suite and the bundle check. Expected: all pass (`golden.test.mjs` untouched).
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/sim/pilot.js games/tractor-pickup/src/game/farm.js games/tractor-pickup/src/game.sim.js games/tractor-pickup/test/pilot-world.test.mjs games/tractor-pickup/test/golden-farm.test.mjs && git commit -m "feat(tractor): game.sim.js with the farm scene, the world-frame pilot and the engine-path goldens"`

---

### Task T4: The trip flow in the sim: show, reward, start, drive buttons, menus, progress

Field notes #4, #79, #84.

**Files:** `src/game/flow.js` (new), `src/game/overlays.js` (new), `src/game/commands.js` (new), `src/game/farm.js`, `src/game.sim.js`, `test/flow.test.mjs` (new).

**Interfaces:**
- `api.play(e)`: not started → `started = true`, `mode = 'drive'`, then `goSleep(e, { quiet: true })` if asleep, `lastDrive(e)` if `last`; close `start`; emit `play`.
- Trip (`flow.js`, run at the end of the farm step when `tripOn && started && bed.phase !== 'asleep'`): `stepTrip(trip, { dt, landed, booped, barnPass, showDone, rewardDone })`, then clear both flags, then each cue as today's `main.js:302-318`:
  - `drive`: `sleepAfter` → `goSleep(e)`; else `mode = modeAfterDrive(mode)`.
  - `say-intro` → `say ['lets-find', 'animals']`; `full` → `say ['great-job', 'go-to-barn']`, `guide = true`.
  - `help` (not while `barnWait`): a guest with a sync → `sync.requestHelp()`; otherwise `herd.callHelp(tractor)` → `help { animal }`.
  - `show`: `guide = false`; `riders = game.startShow()`; `sync?.showStarted()`; `sleepAfter ||= bed.phase === 'last'`; no riders → `showDone = true`; else every rider's animal gets `state = 'show'` (the slot spring stops moving it; the view animates its own copies, #79), `show = { riders, done: false, skipped: false }`, `e.overlay('show')`, emit `show { riders: [{ id, type, golden, car, k }], steps: buildShowSteps(...) }`.
  - `reward`: no riders → `finishShow`, `rewardDone = true`, `mode = 'reward'`; else close `show`, `finishShow(riders)`, `sync?.delivered(riders)`, `mode = 'reward'`, `completeShow(progress, animals)` → `progress`, a new hat → `wearHats`, emit `progress` and `reward { sticker, newPaint, newHat }`, `e.overlay('reward')`; a throw (R-1) → `rewardDone = true` and no card.
- `show.done { spots }` (game-wide): while `show` is open and not done, each `[id, x, y, z, yaw]` whose id is a rider and whose numbers are finite moves that animal there; then `show.done = true`, `showDone = true`. A second ack does nothing.
- Overlays (`overlays.js`, all non-pausing, sim halves only): `start` (`start.go` → `play`), `show` (`show.skip`: `ui.hold` 1 s wall → `show.skipped = true`, emit `showSkip`), `reward` (`reward.go` → `rewardDone = true`, close), `paint`/`book` (enter: `mode = 'menu'`; exit: `mode === 'menu'` → `drive`; `paint.close`/`book.close`; `book` enter also `progress = seeBook(progress)`, emit `progress`), `parent` (`parent.close`, `parent.mp` → close `parent`, overlay `multiplayer`), `multiplayer` (`multiplayer.close`), `sleep` (T5). Farm controls: `farm.paint`, `farm.book` (`when`: started, mode `drive`, no `show`), `farm.parent` (`ui.hold` 2 s wall, always).
- Local commands (`commands.js`): `play`; `paint` (`progress.paint`, `sync?.setPaint`, emit `progress`); `hat` (`toggleHat`, `wearHats`, emit `progress`); `sticker.place`/`sticker.unplace` (`placeSticker`/`unplaceSticker`, emit `progress`); `book.seen`; `stickers.clear` (empties `progress.stickers` in place, emits `progress`; an open `paint`/`book`/`reward` closes as its own close button would: `reward` sets `rewardDone`); `settings` (`clampSettings`, `tractor.setPower`, emit `settings`).

- [ ] **Step 1: Write the failing tests** (`test/flow.test.mjs`):
```js
// Headless trips on the engine path (lion-hawk 2f T4, spec 3.1, 3.4, 9, [S-4]).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { emptyProgress } from '../src/sim/progress.js';
await R.init();
const ARGS = { seed: 14, started: true };
const says = (h, m = 0) => h.since(m).of('say').map(e => e.ids.join(' '));

test('a trip: intro, the barn, the show waits for its ack, the card waits for go, then drive (S-4)', () => {
  const h = headless(tractorGame(), { args: ARGS });
  h.step(1); assert.deepEqual(says(h), ['lets-find animals']);
  h.jump('farm', 'barn', { n: 3 }, ARGS); const s = h.engine.scene.state; // a new scene instance: read its state after the jump
  h.seconds(3.1); // the intro is over: a barn pass during it would not start a show (stepTrip)
  s.raw = { thr: 1, steer: 0, horn: false }; const sh = h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  assert.equal(sh.riders.length, 3); assert.ok(sh.steps.some(x => x.kind === 'all'));
  assert.deepEqual(h.scene.overlays, ['show']); h.seconds(5); assert.equal(s.game.mode, 'show', 'held until the view says the show is over');
  const a = s.game.herd.animals[sh.riders[0].id];
  h.command('show.done', { spots: [[a.id, 3, 0, 4, 1]] }); const rw = h.untilEvent('reward', { maxSteps: 5 });
  assert.deepEqual([a.x, a.z], [3, 4], 'it walks into the barn from where the show left it (F-10)');
  assert.equal(s.game.mode, 'reward'); assert.deepEqual(h.scene.overlays, ['reward']); assert.ok(rw.sticker);
  assert.equal(s.progress.shows, 1); assert.equal(h.events.of('progress').length >= 1, true);
  h.seconds(3); assert.equal(s.game.mode, 'reward');
  h.tap('reward.go'); h.step(2); assert.equal(s.game.mode, 'drive'); assert.deepEqual(h.scene.overlays, []);
});
test('the skip hold ends the show from the sim side; an empty barn pass has no show (F-13, N-3)', () => {
  const h = headless(tractorGame(), { args: ARGS });
  h.jump('farm', 'barn', { n: 1 }, ARGS); const s = h.engine.scene.state; h.seconds(3.1);
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  h.press('show.skip'); h.seconds(0.9); assert.equal(h.events.of('showSkip').length, 0); h.seconds(0.2); assert.equal(h.events.of('showSkip').length, 1);
  assert.equal(s.show.skipped, true);
});
test('the start screen shows only with a paint choice; start.go starts the trip; a stick move starts it otherwise (F-11, A-7)', () => {
  const rich = { ...emptyProgress(), shows: 3 };
  let h = headless(tractorGame(), { args: { seed: 14, progress: rich } });
  assert.equal(h.engine.scene.state.game.mode, 'start'); h.step(1); assert.deepEqual(h.scene.overlays, ['start']);
  h.tap('start.go'); h.step(1); assert.equal(h.engine.scene.state.started, true); assert.deepEqual(h.scene.overlays, []);
  h = headless(tractorGame(), { args: { seed: 14 } }); h.step(1);
  assert.equal(h.engine.scene.state.game.mode, 'drive'); assert.equal(h.engine.scene.state.started, false);
  h.step(1, { goZ: 0.5 }); assert.equal(h.engine.scene.state.started, true); assert.equal(h.events.of('play').length, 1);
});
test('drive buttons hold the tractor; the intro end does not free it; paints, hats and stickers are commands (U-6, W-2..W-4)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true, progress: { ...emptyProgress(), shows: 4 } } }), s = h.engine.scene.state;
  h.tap('farm.paint'); h.step(1); assert.equal(s.game.mode, 'menu'); h.seconds(3.5); assert.equal(s.game.mode, 'menu');
  h.command('paint', { body: 'green', trim: 'red' }).step(1); assert.deepEqual(s.progress.paint, { body: 'green', trim: 'red' });
  h.command('hat', { id: 'straw' }).step(1); assert.deepEqual(s.game.hats, []);
  h.tap('paint.close'); h.step(1); assert.equal(s.game.mode, 'drive');
  h.press('farm.parent'); h.seconds(1.9); assert.deepEqual(h.scene.overlays, []); h.seconds(0.2); assert.deepEqual(h.scene.overlays, ['parent']);
});
```
- [ ] **Step 2: Run them:** `node --test test/flow.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** Keep the cue handling a line-for-line port of `main.js:298-318`, with the view effects turned into events; anything purely visual (`fx.sparkleTrail([])`, `hud.arrowTo(null)`, camera blend) is the view's reaction to `guide`, `show` and `reward`. The `barn` preset takes real free animals (singles, as `pickup()` does), lands them with `load.reserve`/`land` and `newRider()`, and moves the train with the same transform as `test/train.mjs`'s `moveTrain` (copy it into the preset: tests must not be imported by `src`).
- [ ] **Step 4: Run** Tractor `npm test` (the goldens of T3 must still pass), the workspace suite and the bundle check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/game games/tractor-pickup/src/game.sim.js games/tractor-pickup/test/flow.test.mjs && git commit -m "feat(tractor): the trip flow, show ack, sticker card, start screen, drive buttons and menus as sim scenes and commands"`

---

### Task T5: Bedtime on a clock command; new farms through `ctx.load`

Field notes #6, #80, #83, #85, #90.

**Files:** `src/game/flow.js`, `src/game/overlays.js`, `src/game/commands.js`, `src/game/farm.js`, `src/game.sim.js`, `test/bed.test.mjs` (new), `test/flow.test.mjs`.

**Interfaces:**
- `clock { date }` → `date` (a finite number). `bed.set { minutes, date }` → `setBedtime(bed, minutes, date)`, `date = date`, emit `bed`. In the farm step (before the trip): `tripOn && started && bed.phase !== 'asleep' && date !== null && stepBedtime(bed, date) === 'last'` → emit `bed`, `lastDrive(e)`.
- `lastDrive(e)`: `game.lastDrive = true`; mode `drive`/`menu` → `say ['go-to-barn']`, `guide = true`; else `sleepAfter ||= mode === 'show' || mode === 'reward'`.
- `goSleep(e, { quiet })`: `sleepNow(bed)`, emit `bed`; `sleepAfter = false`; `game.lastDrive = false`; `guide = false`; `mode = 'sleep'`; emit `sleep { quiet }` (the view: night, lullaby, voice unless quiet); `e.overlay('sleep', { quiet })`. `sleep.wake` (`ui.hold` 5 s wall) → `wake(e)`: `wakeUp(bed)`, emit `bed`, close `sleep`, emit `wake`, mode `sleep` → `drive`.
- `farm.new {}` (game-wide): a guest (`net.role === 'guest'`) → ignored (M-19); while `engine.loading.active` → `nextFarm = true`; else `ctx.load({ label: 'farm', frames: 1, build, then })`: `build` closes `show`/`reward`/`start`, frees the old world, builds the new game (seed `settings.seed ?? engine.rng('seeds').int(0, 0xffffffff)`), keeps `started` and `bed`, resets `trip`, `show`, `reward`, `guide`, `gen++`, emits `farm { gen, seed }`; `then`: `sync?.setGame(game)` (a host), not started → the start overlay as in `enter`, `nextFarm` → request again.
- `farm.enter` with `started` and `bed.phase === 'asleep'` calls `goSleep(e, { quiet: true })` (a reload while asleep, N-7).
- Presets `last` (`bed.phase = 'last'`, `lastDrive`) and `asleep` (`goSleep({ quiet: true })`).

- [ ] **Step 1: Write the failing tests** (`test/bed.test.mjs`):
```js
// Bedtime on the engine path (lion-hawk 2f T5, spec 3.5): the view sends the wall date; the wake button is a 5 s wall hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const T0 = 1_000_000_000_000;

test('the clock brings the last drive; an empty pass through the barn sleeps; a 5 s hold wakes (N-1..N-6)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true } }), s = h.engine.scene.state, d = h.debug;
  h.command('bed.set', { minutes: 3, date: T0 }).step(1); assert.equal(s.bed.choice, 3);
  h.command('clock', { date: T0 + 179_000 }).step(1); assert.equal(s.bed.phase, 'awake');
  h.command('clock', { date: T0 + 180_000 }).step(1); assert.equal(s.bed.phase, 'last'); assert.equal(s.guide, true);
  assert.deepEqual(h.events.of('say').at(-1).ids, ['go-to-barn']);
  const b = s.game.farm.yard.barn; d.trainAt(b.x - Math.sin(b.yaw) * 20, b.z - Math.cos(b.yaw) * 20, b.yaw); h.seconds(3.1); // past the intro
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('sleep', { maxSeconds: 15 }); s.raw = null;
  assert.equal(s.game.mode, 'sleep'); assert.deepEqual(h.scene.overlays, ['sleep']); assert.equal(s.bed.phase, 'asleep');
  h.press('sleep.wake'); h.seconds(4.9); assert.equal(s.game.mode, 'sleep'); h.seconds(0.2);
  assert.equal(h.events.of('wake').length, 1); assert.equal(s.game.mode, 'drive'); assert.equal(s.bed.phase, 'awake'); assert.equal(s.bed.choice, null);
});
test('bedtime during a show makes it the last show; a reload while asleep starts asleep and quiet (N-2, N-7)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true } });
  h.jump('farm', 'barn', { n: 2 }, { seed: 14, started: true }); const s = h.engine.scene.state; h.seconds(3.1);
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  h.command('bed.set', { minutes: 0, date: T0 }).command('clock', { date: T0 }).step(1); assert.equal(s.bed.phase, 'last'); assert.equal(s.sleepAfter, true);
  h.command('show.done', { spots: [] }); h.untilEvent('reward', { maxSteps: 5 }); h.tap('reward.go'); h.untilEvent('sleep', { maxSteps: 5 });
  const r = headless(tractorGame(), { args: { seed: 14, started: true, bed: { phase: 'asleep', at: null, choice: null } } });
  assert.equal(r.engine.scene.state.game.mode, 'sleep'); assert.deepEqual(r.scene.overlays, ['sleep']);
});
```
(add to `test/flow.test.mjs`):
```js
test('a new farm builds through ctx.load from farm.new and frees the old Rapier world (P-8, S-6)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true, settings: { seed: 99 } } }), s = h.engine.scene.state, old = s.game;
  let freed = 0; const free = old.phys.world.free.bind(old.phys.world); old.phys.world.free = () => { freed++; free(); };
  h.command('farm.new', {}).step(1); assert.equal(h.engine.loading.active, true);
  h.untilLoaded(); assert.equal(freed, 1); assert.notEqual(s.game, old); assert.equal(s.game.farm.seed, 99); assert.equal(s.gen, 2);
  assert.equal(h.events.of('farm').at(-1).seed, 99); assert.equal(s.started, true);
  h.command('farm.new', {}).command('farm.new', {}).step(1); h.untilLoaded(); h.untilLoaded(); assert.equal(s.gen, 4, 'the second request waited for the first');
});
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** `frames: 1` is the decision of "Async farm generation" below: one presented frame after the request (the view drops the old farm and can show its leaf), then a synchronous seeded build; no Promise in the sim; settle is not used (shader warm-up stays fire-and-forget, B-2). If T3 measured `createGame` above 300 ms on this machine, report it: splitting the build over several steps is a later decision, not this task's.
- [ ] **Step 4: Run** Tractor `npm test`, the workspace suite and the bundle check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/game games/tractor-pickup/src/game.sim.js games/tractor-pickup/test/bed.test.mjs games/tractor-pickup/test/flow.test.mjs && git commit -m "feat(tractor): bedtime on a clock command, the wake hold on wall time, new farms through ctx.load"`

---

### Task T6: Tractor's netcode on engine commands

Field notes #75, #77, #78, #80, #88.

**Files:** `src/game/net.js` (new), `src/game/farm.js`, `src/game.sim.js`, `src/net/host.js`, `src/net/guest.js`, `test/mp.engine.test.mjs` (new).

**Interfaces:**
- `host.js`/`guest.js` split their `net.on('message')` body into `sync.message(from, m, reliable)` (a JSON message, today's rate, size and `checkFrom*` checks) and `sync.frame(from, f, reliable)` (a decoded frame; the host drops a frame whose `sender` is not that peer's player number, M-50). The `net.on('message')` listener decodes binary and calls them, so the old harness is unchanged.
- `guest.js`: `onFarm(seed, you)` may return `null` (the farm is building). The welcome then waits as a deferred welcome does (M-19: `deferred = m`, frames go to the store, a host keyframe is kept in `deferredKey`); `sync.farmReady(game)` applies it. An `onFarm` that returns a game behaves exactly as today.
- `src/game/net.js` (sim-pure): `netFacade(engine, { isHost, id, hostId }) → { isHost, id, hostId, send, on, off, leave, emit }` (`send` → `engine.net.send`, `leave` → `engine.net.leave`, `emit(event, ...args)` calls the listeners); `NET` (the game's net config: `kinds` from the bindings, `maxSender: MAX_PLAYERS`, `maxJson: MAX_JSON`, `maxFrame: MAX_FRAME`, `rates: { host: { reliable: RATE.perSec, fast: RATE.perSec, reliableFrames: RATE.guestKeys }, guest: { reliable: RATE.perSec, fast: RATE.guestFast } }`, `wire: { toHost: { hello: 'host.hello', … }, toGuest: { welcome: 'guest.welcome', … } }`, `codec: 'json'`); `netCommands(api)` → the game-wide handlers:
  - `net.open { role, id, hostId }`: closes an earlier sync; `facade = netFacade(…)`; a host sync or a guest sync over it with `paint: progress.paint`, `clock: clock ?? (() => net.at ?? engine.time.wall)`, `bindings`; the guest's `onFarm(seed, you)` requests the farm load (`player: you`, `started` true) and returns `null`; the load's `then` calls `sync.farmReady(game)`.
  - `net.peer { event, id, reason, at }`: `net.at = at`; `facade.emit(event, …)` (`peerLeft: (id, reason)`, `closed: (reason)`, `hostAway`/`hostBack: ()`, else `(id)`); `net.at = null`; after `closed`: a host's sync closes; either way `role = 'solo'`, `sync = null`.
  - `net.frame { frame, from, at, reliable }`: `sync.frame(from, frameFromJson(frame, registry), reliable)` with `net.at = at`.
  - `host.<t>` / `guest.<t>`: `sync.message(from, { t, …fields }, reliable)` with `net.at = at` (reserved keys removed).
  - `net.close {}` (the panel's Leave or Stop): `sync.close()`; a guest's leave goes out through the outbox.
- Farm step: `sync.before(time.wall)` events go first into the bridged list, `sync.after(events, time.wall)` after `game.step`; both through `createWarnOnce` (M-44); `sync` is looked up on `s.net` each step (tests replace methods on it, #88).
- `game.state()` `net: { role, you }`; `debug.sync`.

- [ ] **Step 1: Write the failing tests** (`test/mp.engine.test.mjs`):
```js
// Tractor's netcode on engine commands (lion-hawk 2f T6): two engines over the hub through ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { spawnPoint } from '../src/sim/spawn.js';
await R.init();
const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }];
const world = (o = {}) => mp(tractorGame(), { peers: 2, ...o, argsOf: i => ({ seed: i ? 1000 + i : 21, started: true, trip: false, progress: { shows: 0, stickers: [], paint: PAINTS[i % 2], hatsOff: [], bookSeen: 0 } }),
  beforeStep: p => { p.engine.scene.state.raw ??= { thr: 0, steer: 0, horn: false }; } });
const st = p => p.engine.scene.state;

test('a guest gets the welcome as a command and builds the host farm through ctx.load (M-1, M-24, #80)', () => {
  const w = world(); w.seconds(0.5);
  const g = w.guests[0]; assert.equal(st(g).game.farm.seed, 21); assert.equal(st(g).net.sync.you, 2); assert.equal(st(g).gen, 2);
  const p = spawnPoint(st(g).game.farm, 2); assert.ok(Math.hypot(st(g).game.tractor.x - p.x, st(g).game.tractor.z - p.z) < 0.5);
  assert.deepEqual(st(w.host).net.sync.players.list().map(x => [x.n, x.paint]), [[2, PAINTS[1]]]);
});
test('the guest\'s commands are plain JSON: decoded frames and schema-checked messages, with from and at (#78)', () => {
  const w = world({ record: true }); w.seconds(1);
  const tape = w.guests[0].h.tape(); assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  const ops = tape.log.flatMap(x => x.ops ?? []).filter(o => o[0] === 'command').map(o => o[1]);
  for (const t of ['net.open', 'net.peer', 'guest.welcome', 'net.frame']) assert.ok(ops.includes(t), t);
});
test('a guest boop is claimed and granted through commands (M-13, M-14)', () => {
  const w = world(); w.seconds(1);
  const H = st(w.host).game, G = st(w.guests[0]).game;
  const a = H.herd.free().find(x => !x.hidden && x.type !== 'chick' && !H.herd.animals.some(c => c.leader === x.id) && x.home === 'route');
  const ga = G.herd.animals[a.id], p = G.tractorWorld({ x: 2.5, y: 0, z: 0 }, {});
  for (const x of [a, ga]) { x.x = p.x; x.z = p.z; x.state = 'idle'; x.timer = 99; x.hidden = false; }
  w.seconds(3); assert.equal(ga.state, 'ride'); assert.equal(a.state, 'carried'); assert.equal(a.owner, 2);
});
test('the host leaving sends the guest on alone on the same farm (M-41)', () => {
  const w = world(); w.seconds(1); w.host.net.leave(); w.seconds(0.5);
  const g = st(w.guests[0]); assert.equal(g.net.role, 'solo'); assert.equal(g.game.herd.remote, false); assert.equal(g.game.farm.seed, 21);
});
```
- [ ] **Step 2: Run them:** `node --test test/mp.engine.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** **(judgment)** Change `host.js`/`guest.js` by moving code, not rewriting it: the old harness and all mp suites must pass unchanged after the split. In `guest.js`, the building-farm path reuses `deferred`/`deferredKey`; `farmReady` is the only new entry point. The farm's pipeline does not run while the load is active, so `before`/`after` never see the old game with the new farm's data.
- [ ] **Step 4: Run** Tractor `npm test` (all mp suites on the old harness), the workspace suite and the bundle check. Expected: all pass.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/src/game/net.js games/tractor-pickup/src/game/farm.js games/tractor-pickup/src/game.sim.js games/tractor-pickup/src/net/host.js games/tractor-pickup/src/net/guest.js games/tractor-pickup/test/mp.engine.test.mjs && git commit -m "feat(tractor): host and guest sync fed by engine commands through a port; guest farms build through ctx.load"`

---

### Task T7: Multiplayer parity: the engine-path harness, the sweep and interop

Field notes #75, #88.

**Files:** `test/mp.engine.harness.mjs` (new), `test/mp.harness.mjs`, `test/mp.interop.test.mjs` (new).

**Interfaces:**
- `test/mp.engine.harness.mjs` exports `engineWorld(opts)` with **exactly** `mpWorld`'s options and result shape: `{ hub, host, guests, devs, step(n, inputs), seconds(s, inputs), addGuest(), now }`; each dev `{ name, events, game (get/set: `state.game`), sync (get: `state.net.sync`), net (the hub endpoint), engine }`. `inputs` (raw `{ thr, steer, horn }` per dev, or `(dev, i) => input`) go to `state.raw` in `beforeStep`; `events` collects every engine event with its fields; farm args `{ seed, started: true, trip: false, progress: { paint: PAINTS[i] } }`; `tractorGame({ clock, bindings })`; ports and `mp()` share `clock` when given.
- `test/mp.harness.mjs`: `export const mpWorld = process.env.TP_MP === 'engine' ? engineWorld : oldWorld` (the old body renamed `oldWorld`); every other export is unchanged.
- Named exceptions (a test that cannot hold on the engine path by design): `mp.test.mjs` "the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)" (it counts handled messages with no step run, #75). The harness skips nothing: the task reports the sweep's result with this list.

- [ ] **Step 1: Write the interop test** (`test/mp.interop.test.mjs`):
```js
// NET_VERSION 3 on the wire (lion-hawk 2f T7, #91): an old-path device and an engine-path device play together over one hub.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { createMemoryHub, createPort } from 'lion-hawk/net';
import { tractorGame } from '../src/game.sim.js';
import { createGame } from '../src/sim/game.js';
import { createHostSync } from '../src/net/host.js';
import { createGuestSync } from '../src/net/guest.js';
import { disagreements, PAINTS, STILL } from './mp.harness.mjs';
await R.init();

function mixed({ engineHost }) {
  const hub = createMemoryHub(); let now = 0; const clock = () => now, devs = [];
  const oldDev = (isHost, i) => { const d = { name: isHost ? 'host' : 'guest' + i, events: [], game: createGame(R, { seed: isHost ? 31 : 1000 + i, power: 'medium' }) };
    d.net = isHost ? hub.host() : hub.join();
    d.sync = isHost ? createHostSync({ game: d.game, net: d.net, paint: PAINTS[i], clock }) : createGuestSync({ game: d.game, net: d.net, paint: PAINTS[i], clock, onFarm: (s, n) => (d.game = createGame(R, { seed: s, power: 'medium', player: n })) });
    d.tick = () => { d.events.push(...d.sync.before(now)); const ev = d.game.step(STILL); d.events.push(...ev); d.sync.after(ev, now); }; return d; };
  const newDev = (isHost, i) => { const h = headless(tractorGame(), { wall0: now, args: { seed: isHost ? 31 : 1000 + i, started: true, trip: false, progress: { shows: 0, stickers: [], paint: PAINTS[i], hatsOff: [], bookSeen: 0 } } });
    const net = isHost ? hub.host() : hub.join(), d = { name: isHost ? 'host' : 'guest' + i, h, net, events: [], get game() { return h.engine.scene.state.game; }, get sync() { return h.engine.scene.state.net.sync; } };
    createPort(h.engine, { transport: net, role: isHost ? 'host' : 'guest', clock }); d.tick = () => { h.engine.scene.state.raw = STILL; h.step(1); }; return d; };
  devs.push(engineHost ? newDev(true, 0) : oldDev(true, 0)); devs.push(engineHost ? oldDev(false, 1) : newDev(false, 1));
  const w = { hub, devs, host: devs[0], get guests() { return devs.slice(1); }, get now() { return now; },
    step(n = 1) { for (let k = 0; k < n; k++) { now += 1000 / 60; hub.tick(now); for (const d of devs) d.tick(); } }, seconds(s) { w.step(Math.round(s * 60)); } };
  return w;
}
for (const engineHost of [false, true]) test(`an ${engineHost ? 'engine host and an old guest' : 'old host and an engine guest'} agree (M-1, M-58)`, () => {
  const w = mixed({ engineHost }); w.seconds(1);
  assert.equal(w.guests[0].game.farm.seed, 31); assert.equal(w.guests[0].sync.you, 2);
  w.seconds(3); assert.deepEqual(disagreements(w), []);
});
```
- [ ] **Step 2: Run it:** `node --test test/mp.interop.test.mjs`. Expected: FAIL until the engine harness pieces exist, then PASS.
- [ ] **Step 3: Implement** `test/mp.engine.harness.mjs` and the switch. Then run the sweep: `TP_MP=engine node --test test/mp.test.mjs test/mp.animals.test.mjs test/mp.barn.test.mjs test/mp.relay.test.mjs test/mp.repair.test.mjs test/forecast.test.mjs`. **(judgment)** Every test must pass except the named exception. A new failure is a T6 defect (an order difference, a seam the harness lost, a clock read in the wrong place): find it, don't add it to the list. If a second test truly cannot hold on the engine path by design, stop and report it to the controller with the reason before listing it. Record the sweep's counts in the commit body and in field note #75.
- [ ] **Step 4: Run** Tractor `npm test` (the default is still the old harness), `TP_MP=engine npm test` (only the named exception fails), the workspace suite and the bundle check.
- [ ] **Step 5: Commit** (four43 worktree): `git add games/tractor-pickup/test/mp.engine.harness.mjs games/tractor-pickup/test/mp.harness.mjs games/tractor-pickup/test/mp.interop.test.mjs && git commit -m "test(tractor): the mp suites on the engine path (TP_MP=engine) and old/new devices together at NET_VERSION 3"`

---

### Task T8: Tapes: a solo trip and a guest replay alone

Field notes #78, [T-9].

**Files:** `test/tape.test.mjs` (new).

- [ ] **Step 1: Write the tests:**
```js
// Record and replay on the engine path (lion-hawk 2f T8, [T-9], #78).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, replay, mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();

test('a solo trip with the stick, the horn, a show ack and the card replays to the same checksums', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: { seed: 14, started: true } });
  h.step(120, { goZ: 1 }); h.step(1, { horn: true }); h.step(200, (hh, i) => ({ goX: Math.sin(i / 40), goZ: Math.cos(i / 40) }));
  h.command('clock', { date: 1_000_000 }); h.tap('farm.paint'); h.step(30); h.tap('paint.close'); h.step(30);
  const tape = h.tape(); assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  assert.equal(replay(g, tape).checksum(), h.checksum());
});
test('a guest\'s tape replays without its host: welcome, decoded frames and claims are in it', () => {
  const g = tractorGame();
  const w = mp(g, { peers: 2, record: true, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  w.seconds(3, (p, i) => i === 1 ? { goZ: 0.6 } : {});
  const guest = w.guests[0], tape = guest.h.tape();
  const r = replay(g, tape); assert.equal(r.checksum(), guest.h.checksum());
  assert.equal(r.engine.scene.state.game.farm.seed, 21, 'the host\'s farm, built from the tape alone');
});
```
- [ ] **Step 2: Run them:** `node --test test/tape.test.mjs`. Expected: PASS. **(judgment)** A divergence means some state is read from outside the commands: the raw seam (not used here), a clock read outside `time.wall`/`at`, or a `Math.random` the purity test missed. Find it; never loosen the comparison. `game.state()` is the checksum's input: if it is too thin to catch a divergence, add fields to it (tractor body positions are already there).
- [ ] **Step 3: Run** Tractor `npm test` and the workspace suite. Expected: all pass.
- [ ] **Step 4: Commit** (four43 worktree): `git add games/tractor-pickup/test/tape.test.mjs && git commit -m "test(tractor): a solo trip and a guest in a room record plain-JSON tapes that replay alone"`

---

### Task T9: Field notes and 2f outcome

**Files:** engine `docs/field-notes.md` (statuses for #4 (Tractor sim part), #6, #8 (Tractor part), #49, #56, #59, #68–#74, #75–#91 per the tasks that landed them; #67 stays open; #79's remote-show change and #82's merge rule go to the playtest list), `docs/plans/2026-10-12-phase-2f-notes.md` (new: what landed, rulings made during execution with their costs, the sweep result, measured build times, carry-overs into 2g).

- [ ] **Step 1:** Update the field notes; write the notes file in the format of `2026-10-11-phase-2d-notes.md`.
- [ ] **Step 2: Run** engine `npm test`, the workspace suite, Tractor `npm test` and `TP_MP=engine npm test`. Expected: all pass (one named engine-path exception).
- [ ] **Step 3: Commit** (engine): `git add docs/field-notes.md docs/plans/2026-10-12-phase-2f-notes.md && git commit -m "docs: phase 2f outcome and field notes"`

---

## Decisions on the open questions

- **Net placement (engine vs game):**
  - **Moved to the engine now:** the codec (`F`, kinds, frames, tracker, store), interpolation and forecast, rate/size limits, schemas and wire codecs, transports (hub, lag, room link) and the port, `mp()`. They know nothing of tractors, they are what spec §4 promises every game, and moving them is a file move whose tests already exist (Tractor's own suites run against the engine code from T2 on).
  - **Kept game-side for 2f/2g:** `host.js`, `guest.js` (claims, barn lock, repair, trust following, deferral: Tractor rules), `kinds.js`, `bindings.js`, `players.js` (trains, riders), `protocol.js` (now schema tables), `session.js` (the panel's room flow) and the vendored `handshake.js` (its contract test reads it by path, #89). Generic replication driven by `net` parts (N-9) needs the phase 4 `World`; extracting these files now would bake Tractor's rules into the engine.
- **Show timing:** the show stays a **view cutscene** paced by the voice (promises that end when a word has been spoken), ending with a game-wide `show.done` ack that carries where each animal stands; the sim holds the train in `show` until then ([S-4]'s second option). Moving the timing into the sim would need word durations the sim cannot know and would change the core counting show. The skip button is a sim `ui.hold` on wall time; hurry and cheer stay view gestures. Cost: remote players see your riders stay in the trailer during your show (#79).
- **Async farm generation:** keep the build **synchronous and seeded** inside `ctx.load({ frames: 1 })`: one presented frame after the request, then build, then `then`. No Promise in the sim, no worker. A guest's welcome waits for its farm through the existing deferred-welcome path (#80). The host sends the seed (`guest.welcome`); each farm's seed comes from settings or `engine.rng('seeds')`. Splitting `createGame` over several steps waits for a measurement that shows a hitch (T3 measures).
- **Stick:** world-frame axes `goX`/`goZ` from a device `map` hook with the camera yaw, merged as a radial pair, plus `goBack` for the screen-relative reverse cone (#81). Axes are actions, recorded as input changes; no per-frame commands.
- **Network messages:** game-wide commands (`host.*`, `guest.*`, `net.*`) with `from`/`at`/`reliable`; frames decoded to plain JSON at the port; JSON on the wire kept so NET_VERSION stays 3 (#91).
- **Holds:** `ui.hold({ wall: true })` for the gear (2 s), wake (5 s) and skip (1 s), matching today's `performance.now` holds (#83).
- **Bedtime clock:** a 1 Hz `clock { date }` command from the view (epoch ms, so bedtime survives reloads and hidden tabs) (#85).
- **Persistent player data:** owned by the sim, seeded from scene args, changed by commands, saved by the view from `progress`/`settings`/`bed` events (#84).

## Unresolved (for the user)

- Playtest list: keys/stick/pad merge by vector length (#82); remote riders during a show (#79); the one-frame farm rebuild and the guest's one-step-later farm (#80); bedtime checked once a second.
- The engine-path sweep's named exception (frozen-frame rate limits, #75): accept it as a by-design difference, or add an engine "deliver commands now" for tests (not recommended).
- Binary command codec adoption (NET_VERSION 4) and dropping the syncs' duplicate transport checks: after 2g, decided with the next multiplayer release.
- Handshake vendoring into the engine (spec §10) stays open (#89).

---

## Self-review notes (for the reviewer)

- Every engine addition is used by a named Tractor task: T-E1 → T5/T6 (game-wide ctx, loads from handlers); T-E2 → T3/T8 (exact goldens, debug); T-E3 → T6/T8 (`time.wall`, `onStep` for the port); T-E4 → T2; T-E5/T-E6 → T6; T-E7 → T6–T8; T-E8 → T3 actions (devices in 2g); T-E9 → T4/T5 (`ui.hold` wall; gestures in 2g); T-E10 → 2g e2e. `bindGesture` drag/pinch and `F.actions` are not used by Tractor: #59 and N-8 close with them.
- Golden safety: T3 compares the engine path against the untouched phase-0 goldens with `bless: false` and bit-exactly against a direct run.
- Test safety: no existing Tractor test file changes; the mp harness gains a switch, not new behaviour for the default run.
- Names used across tasks: `tractorGame`, `ACTIONS` (`goX`, `goZ`, `goBack`, `horn`), `FARM_EVENTS`, `makeFarm → { scene, api }`, `api.play`, `lastDrive`, `goSleep`, `wake`, `stickToWorld`, `pilot.drive`, `netFacade`, `NET`, `netCommands`, `sync.message`, `sync.frame`, `sync.farmReady`, `engineWorld`, `TO_HOST`, `TO_GUEST`, `PAINT`, `IDS`; engine `checkSchema`, `wireCodec`, `frameToJson`, `frameFromJson`, `createPort`, `mp`, `engine.net`, `engine.onStep`, `engine.time.wall`, `wall0`, `engine.flushEvents`, `axis({ pair })`, `map: { from, to, radial }`, `ui.hold({ wall })`, `bindPointer({ uncapped })`, `bindGesture`, `golden({ exact })`, `h.debug`, `initScript`; commands `play`, `paint`, `hat`, `sticker.place`, `sticker.unplace`, `book.seen`, `stickers.clear`, `settings`, `bed.set`, `clock`, `farm.new`, `show.done`, `net.close`, `net.open`, `net.peer`, `net.frame`, `host.*`, `guest.*`; controls `farm.paint`, `farm.book`, `farm.parent`, `start.go`, `reward.go`, `paint.close`, `book.close`, `parent.close`, `parent.mp`, `multiplayer.close`, `show.skip`, `sleep.wake`.
