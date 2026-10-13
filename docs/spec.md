# Lion Hawk Engine: specification

Version 0.1 (2026-10-11). Status: draft for review.

Lion Hawk is an opinionated 3D web physics engine for browser games, extracted from Pig Pens, Rally and Tractor Pickup and designed to carry games beyond them.

Background:
- `design.md`: the original layered design and material system, plus code survey findings.
- `research.md`: engine architecture research.
- `research-testing.md`: test helper research.

This spec decides; those files explain.

Requirement IDs (`[L-1]`, `[E-3]`, …) are referenced by the per-phase plans in `docs/plans/`.

---

## 1. What Lion Hawk is

### 1.1 Fixed stack

| Concern | Choice | Not swappable |
|---|---|---|
| Rendering | three.js (^0.186) | yes |
| Physics solver | Rapier (`@dimforge/rapier3d-compat` ^0.21) | yes |
| Models | glTF 2.0 (GLB, meshopt, KTX2) | yes |
| Materials | the Lion Hawk material registry (§3) | yes |
| Netcode | host-authoritative replication over WebRTC (§4) | yes |
| Language | plain JavaScript ES modules, no framework, no TypeScript | yes |

Because the stack is fixed, the engine can join the five parts automatically.

### 1.2 Rules

- **[L-1] Do not hide three.js or Rapier.** Games get the real `THREE.Scene`, `THREE.Camera` and `RAPIER.World`. The engine owns the wiring between them, not their APIs.
- **[L-2] Entities are where the parts meet** (§2). An entity's `model`, `body`, `material`, `net` and `input` parts are handled by the engine.
- **[L-3] The sim never touches the browser.** Every module is either *sim* (Node-safe, no `three`, no DOM, no wall clock) or *view* (browser only). Sim code never imports view code. This is enforced by a test (§7.4, [T-12]).
- **[L-4] The engine owns the loop** (§5). Games add systems to named stages. They do not write a frame loop.
- **[L-5] Kits are optional.** Vehicle, terrain, herd, coverage and fx are imported per game (§8.1).
- **[L-6] 3D only.** No 2D renderer, no `rapier2d`, no sprites or tilemaps. A body may still be locked to a plane with Rapier's locked axes.

### 1.3 Out of scope

- An engine-built UI toolkit (games use HTML overlays plus the helpers in §5.4).
- Swappable renderers or physics.
- Cross-device lockstep or rollback.
- Dedicated servers.
- More than 8 peers.
- A visual editor.

### 1.4 Layers

```
                 SIM (headless, Node-safe)            │  VIEW (browser)
──────────────────────────────────────────────────────┼──────────────────────────────────
 5  Game        scenes (sim half), rules, AI          │  scenes (view half), HUD, camera
 4b Kits        vehicle · terrain · herd · coverage · fx, each with a sim and a view half
 4  Entities    World, parts, systems, events,        │  entity views, interpolation,
                replication                           │  remote smoothing
 3  Services    Rapier wrapper, fields, net transport │  renderer, material compiler,
                                                      │  audio, input devices, PWA client
 2b Definitions materials · kinds · field types · vehicle specs   (shared plain data)
 2  Resources   physics sidecars (colliders, panels)  │  glTF scenes, textures, programs
 1  Core        loop clock, rng, math, events, flags  │  rAF driver, debug hook
════════════════════════════════════════════════════════════════════════════════════════
    Tooling     lion-hawk CLI (dev, bake, build, test, release) · test helpers
```

---

## 2. Entities

### 2.1 Shape

- **[E-1]** An entity is a plain object with a numeric `id`, an optional `tags` set, and optional parts. It is not a class instance.
- **[E-2]** A `World` holds the entities of one scene, plus that scene's `RAPIER.World`.
- **[E-3]** Systems query entities by the parts they have, for example `world.with('body', 'net')`. A query is a live, cached list that updates on spawn, despawn and part changes. This is miniplex-style; no ECS library is used.
- **[E-4]** Game data lives on the entity as plain fields, for example `e.pig = { mood, mud }`. Only fields declared in a `net` kind are replicated.

### 2.2 Built-in parts

| Part | Declared as | Sim side | View side |
|---|---|---|---|
| `model` | asset key, e.g. `'tractor'` | reads the physics sidecar (§6.2) | `Object3D` cloned from the cached glTF |
| `body` | `'dynamic' \| 'kinematic' \| 'fixed'` or `{ type, lock, ccd, linearDamping, angularDamping, sleep }` | one Rapier rigid body; one collider per sidecar collider | none |
| `material` | taken per collider from the sidecar; `material: { '*': 'rubber', wheel: 'rubber' }` overrides by part name | collider friction, restitution and density (§3.3) | compiled material (§3.6) |
| `net` | kind name, e.g. `'vehicle'` | record build and apply (§4.3) | remote smoothing (§4.4) |
| `xf` | `{ p: {x,y,z}, q: {x,y,z,w} }` | written from Rapier after each step, or by game code for bodiless entities | interpolated into the `Object3D` (§2.4) |
| `input` | an action snapshot (§5.3) | read by systems; written by the input stage, the network or a test policy | none |
| `sockets` | from the sidecar | named attachment points in body space | same, for attaching meshes |
| `owner` | peer number | who has authority for `owner` kinds | none |

### 2.3 Lifecycle

- **[E-5]** `world.spawn(desc)` creates the entity and its Rapier body and colliders in the same call. It returns the entity.
- **[E-6]** The view creates the matching `Object3D` on its next sync and removes it after despawn.
- **[E-7]** `world.despawn(e)` removes the Rapier objects, the view object, query membership and the net record. On a guest, only the replication layer may spawn or despawn entities of host-authority kinds.
- **[E-8]** `world.place(e, { at | rel, local, yaw })` moves an entity and its body together. Tests and game code use it rather than writing to Rapier directly.
- **[E-9]** Entity IDs are stable and allocated in spawn order from the scene seed. Replicated entities use the kind's ID range (§4.3).

### 2.4 Transforms and interpolation

- **[E-10]** Each entity with `xf` has two transform slots, `prev` and `curr`, in a shared `Float64Array` pool. They are swapped after every sim step. No objects are allocated per step or per frame.
- **[E-11]** The view writes `lerp(prev, curr, alpha)` (slerp for rotations) into each `Object3D`. For remote entities, interpolation and smoothing come from §4.4 instead.

### 2.5 Systems

- **[E-12]** A system is a function `(engine, dt) => void` registered with `engine.system(name, fn, { stage, before, after })` (§5.1).
- **[E-13]** Systems emit events with `engine.emit(type, data)`. Events are queued, delivered in order at the end of each step (the `events.flush` stage), and kept in the event log (§7.4). Outside a step, `engine.flushEvents()` delivers what is queued now (#71); it is re-entrancy safe: called from a listener (directly or by reading `h.events`), it does nothing, so each event is delivered and logged once.

---

## 3. Materials

### 3.1 Registry

- **[M-1]** Materials are plain data created with `defineMaterials({...})`. The definitions layer is used by both sim and view and has no runtime dependencies.
- **[M-2]** The engine ships a base library: `steel`, `aluminium`, `wood`, `rubber`, `glass`, `plastic`, `fabric`, `flesh`, `fur`, `gravel`, `grass`, `dirt`, `mud`, `asphalt`, `snow`, `ice`, `water`, `air`. Games add entries or extend base ones (`extends: 'steel'`, with overrides).
- **[M-3]** Validation runs when the registry is loaded. An unknown block, a value out of range, an unknown `extends` or an `extends` cycle throws an error that names the material and the field.

### 3.2 Schema

Every block is optional.

| Property | Units / meaning | Read by |
|---|---|---|
| `look.*` | `MeshPhysicalMaterial` params plus `subsurface`, `fur`, `wear` | material compiler (§3.6) |
| `phys.friction` | Coulomb coefficient, 0–2 | collider |
| `phys.restitution` | 0–1 | collider |
| `phys.sg` | specific gravity; density = `sg × 1000 × fill` kg/m³ | collider density → mass and inertia; buoyancy |
| `phys.fill` | solid fraction, 0–1, default 1 (a car shell ≈ 0.02) | collider density |
| `tire.{mu, C, kp, ap, crr, drag}` | Magic Formula surface params | `kit-vehicle` tire backend |
| `dirtRate` | coverage gained per metre driven | `kit-coverage` |
| `coverage` | `{ dirt, rust, snow, mud }`: which layers this material accepts, 0–1 | `kit-coverage`, material compiler |
| `aero.skin` | skin-friction coefficient | aero field |
| `aero.airfoil` | `{ cl: [[aoa, cl]...], cd: [[aoa, cd]...], stall }` | aero field |
| `magnet.strength` | dipole moment, A·m² | magnet field |
| `magnet.ferrous` | 0–1 | magnet field |
| `fluid.{density, viscosity}` | kg/m³, Pa·s | buoyancy, fluid drag |
| `sound`, `fx` | cue IDs | audio and fx, from contact events |

### 3.3 Materials on colliders

- **[M-4]** Each collider gets its material from the glTF material name of the part it was made from (§6.2). Its density, friction and restitution are set from that material.
- **[M-5]** The engine keeps a collider-handle → material-ID map. Contact events carry `{ a, b, materials: [ma, mb], impulse, point }`.
- **[M-6]** Mass and centre of mass come from the colliders' geometry and density. A game never sets a body's mass directly, except through `phys.fill`.

### 3.4 Pairs

- **[M-7]** A pair table, keyed by an unordered material pair, may override `friction`, `restitution`, `tire`, `sound` and `fx`.
- **[M-8]** When a pair has no entry:
  - friction is the geometric mean of the two materials;
  - restitution is the maximum;
  - `sound` and `fx` come from the material with the lower `sg` (the softer one).
- **[M-9]** Rapier's per-collider combine rules are set so that contacts match [M-8] without the engine having to intervene per contact.

### 3.5 Ground lookup

- **[M-10]** Terrain provides `materialAt(x, z) → materialId`. Wheel contacts, feet and particles use it. It replaces Rally `SURFACES` and Tractor Pickup `DIRT`.

### 3.6 View: material compiler

- **[M-11]** `look` compiles to one base `MeshPhysicalMaterial`. Optional features are compile-time defines: `COVERAGE`, `FUR`, `SUBSURFACE`. This keeps the number of shader programs small.
- **[M-12]** All materials in use are compiled while loading (`warm`).
- **[M-13]** Instanced users and plain users get separate material clones (`matSplit`). Both are always on.

### 3.7 Fields (phase 8)

- **[M-14]** Fields run in the `systems.pre` stage, before `world.step()`. They are deterministic and allocate nothing.
- **[M-15] Wind** is `wind.at(pos, t) → {x,y,z}`: one global field plus optional zones, with noise-based gusts. The aero field only calls `wind.at`, so the wind model can be replaced without touching aero.
- **[M-16] Aero**, per panel facing the relative wind:
  - flat-plate normal force `½ρv²A·f(n·v̂)` plus skin friction `½ρv²A·aero.skin`, applied at the panel centroid;
  - parts with `aero.airfoil` use its lift and drag curves instead.
- **[M-17] Buoyancy:**
  - submerged volume × fluid density, with the centre of buoyancy from submerged panels;
  - heave is damped relative to the fluid surface's velocity, not the world frame.
- **[M-18] Magnetism:**
  - Bodies with `magnet.strength` query a sphere around them.
  - Magnet → ferrous force falls off as `1/r⁴`; magnet ↔ magnet uses the dipole–dipole force.
  - `r` is clamped to a minimum and the force is capped.

---

## 4. Netcode

### 4.1 Transport

- **[N-1]** Every transport implements `{ isHost, id, hostId, send(to, data, reliable), on, off, leave }`. Events: `peer`, `message`, `peerAway`, `peerBack`, `peerLeft`, `hostAway`, `hostBack`, `closed`. Transports live in `lion-hawk/net` (Node and browser, not sim-pure): `emitter`, `createMemoryHub`, `withLag` (injectable `rng`, `timer` and `now`), `parseLag`, `roomLink` (a Handshake Room as a transport; the game vendors `handshake.js`, #89) and `bridgeTransport` (a page's end of the Node bridge, [T-20]).
  - **The port.** `createPort(engine, { transport, role, clock = () => performance.now(), onWarn })` joins a transport to an engine. It issues `net.open { role, id, hostId, at }` on creation and turns transport events into `net.peer { event, id?, reason?, at }` commands ([I-7]). A message is rate-checked per peer and channel, size-checked (`net.maxJson` on `JSON.stringify`, `net.maxFrame` on bytes), then a replica frame becomes `net.frame { frame: frameToJson(f), from, at, reliable }` and a JSON or binary wire is decoded with the incoming table (`toHost` for a host, `toGuest` for a guest), schema-checked and issued as `engine.command(type, { ...data, from, at, reliable })`. Anything bad is dropped (`port.stats.dropped`, warned once per kind); a guest hears only its host. After each step (`engine.onStep`) the port drains `engine.net`: frames go as bytes, JSON is encoded with the outgoing table (a bad one is warned once and counted in `stats.unsent`), `leave()` calls `transport.leave()`. `port.close()` unsubscribes.
- **[N-2]** Implementations:
  - `rtc`: WebRTC, signalled by the Handshake server, using a vendored `handshake.js` with a reliable and an unreliable channel. **Built** as `roomLink(room)` in `lion-hawk/net`: the game vendors `handshake.js` and hands its Room to `roomLink`;
  - `hub`: an in-memory hub for many peers in one Node process, with latency, jitter, loss and a `drop(from, to, data, reliable)` hook (decided at send, #94). **Built** (`createMemoryHub`, `withLag`);
  - `bridge`: browser pages connected through a Node test process's hub (§7.5). **Built** as `bridgeTransport({ binding = '__lhBridge' })` in `lion-hawk/net` (the page side): `send` and `leave` call the exposed binding with a sequence number (Node applies the calls in the page's order), and hub events arrive through `window.__lhBridgeIn(event, ...args)`; events that arrive before the transport exists are replayed in order just after it is made. The hub's copy semantics hold across the page boundary: JSON is copied, and an `ArrayBuffer` crosses as a byte array and is rebuilt as an `ArrayBuffer`;
- **[N-3]** Rate limits, size limits and message validation are part of the transport layer. They are applied to every message, and games cannot skip them. A game declares them in `defineGame({ net: { kinds, maxSender, maxJson = 2048, maxFrame = 16384, rates: { host: { reliable, fast, reliableFrames? }, guest: { reliable, fast } }, wire: { toHost, toGuest }, codec: 'json' | 'binary' } })` (rates per peer per 1 s window on the injected clock; every wire tag names a schema'd command), validated by `defineGame`.
  - **The outbox.** The sim sends through `engine.net`: `send(to, data, reliable = false)` queues `{ to, data, reliable }` (`data` a JSON message `{ t, ... }` or an `ArrayBuffer` replica frame), `leave()` queues `{ leave: true }`, `drain(fn)` hands out the items in order and empties the queue, `pending` is its length. After each step the `onStep` listeners run (a port drains there) and whatever is left is discarded, so without a port (headless, replays) the queue never grows; a send made between steps goes out after the next step. `send` queues `data` by reference: do not mutate it before the next step. `drain` is not re-entrant: a `drain` from inside its `fn` throws `engine: net.drain is not re-entrant`.
- **[N-4]** All net timing reads an injected clock. The default is wall time; tests use sim time. `engine.time.wall` stamps each step (real from the driver's frame time, virtual `wall0 + n * 1000 / hz` otherwise); a tape recorded with real stamps replays with a virtual wall from `wall0`, so wall-dependent sim state must not feed into results a tape checks.
  - `engine.time.wall` is the stamp, in ms, of the state the current (or last) step makes. `engine.frame(seconds, now)` stamps each of that frame's steps `now − (acc − dt) · 1000` (steps sit exactly `1000 / hz` apart); steps without `now` (`stepN`, `advance`, `frame(seconds)`) are virtual, exactly `base + n · 1000 / hz`, re-anchored on every real stamp; the first base is `createEngine(game, { wall0 = 0 })`. The browser driver passes the rAF timestamp. Port rate windows and `at` stamps read the port's `clock`.

### 4.2 Sessions and versions

- **[N-5]** The engine provides host and join (room codes), the player list (`players`), and recovery when the host or a guest goes away and comes back.
- **[N-6]** A join is refused, with a readable reason, unless `{ engine, game: netVersion, schema }` matches. `schema` is a hash of the game's kind definitions, so field changes are detected without a manual version bump.
- **[N-7]** A service-worker update never reloads a page during a session (§7.2).

### 4.3 Replication

- **[N-8]** Kinds are declared with `kind({ name, code, authority, remote, max, idMin, idMax, fields, record?, apply?, newer? })`. They use the field types `F.fixed`, `F.uint`, `F.bool`, `F.angle`, `F.quat`, `F.oneOf`, `F.obj`, `F.list` and `F.id`, plus:
  - `F.body()`: position, rotation, linear velocity and spin, at Tractor Pickup's current precision;
  - `F.actions(map)`: an action snapshot (§5.3); `F.uint(bytes, max, min = 0)` takes a lower bound.

  The codec lives in `lion-hawk/sim` (moved from Tractor Pickup's `replica.js`, `interp.js` and `forecast.js` with no behaviour change): `F`, `kind`, `createRegistry`, `encodeRecord`, `encodeFrame`, `decodeFrame`, `isFrame`, `createTracker`, `createStore`, `frameToJson` / `frameFromJson` (a decoded frame as plain JSON, for `net.frame` commands and tapes), `createInterp`, `createForecast` and `createRate` / `createWarnOnce`.
  - **Wire messages.** `checkSchema(fields, data)` returns a checked copy (unknown keys dropped) or null; `wireCodec(table, { codec })` encodes a tag and its fields as `{ t: tag, ...fields }` (`json`) or an `ArrayBuffer` `[0x20, tag index, fields packed as replica fields]` (`binary`). Binary `fixed`, `angle` and `quat` quantise exactly like the replica, so their round-trip is lossy (`angle` comes back in [0, 2π)).
- **[N-9]** An entity with a `net` part is replicated automatically:
  - The default record is the kind's fields read from the entity, with `body` taken from Rapier.
  - `record(e)` and `apply(e, rec)` override the default mapping.
  - `newer(old, rec)` resolves ownership epochs.
- **[N-10]** Authority modes:
  - `host`: the host simulates the entity.
  - `owner`: the entity's `owner` peer simulates it and sends its state. The host relays it to the other guests.
- **[N-11]** Sending runs on its own clock (default 20 Hz), separate from the sim rate:
  - a keyframe goes over the reliable channel every 2 s;
  - changes since the last keyframe go over the unreliable channel;
  - only changed fields are encoded (the binary format from `replica.js`).

### 4.4 Remote entities

- **[N-12]** A kind's `remote` setting controls how non-authority peers run it:

| `remote` | Non-authority peers run | Default for |
|---|---|---|
| `driven` | a full dynamic body, stepped by the local sim with the owner's replicated `input` | `owner` kinds with an `input` field |
| `proxy` | a kinematic body following snapshots interpolated about 100 ms in the past | `host` kinds |
| `view` | no body, drawing only | none (opt-in) |

- **[N-13] Driven actors, part 1 (inputs).**
  - The owner sends its actor's `input` every sim step, batched per send tick, over the unreliable channel.
  - Receivers apply each input at its step. If inputs are missing, the last one is held.
- **[N-14] Driven actors, part 2 (correction).**
  - When a body snapshot arrives, the receiver projects it forward by the measured one-way latency (`p + v·lat`, and `q` advanced by `w·lat`).
  - If the position error is below `snapAt` (default 1.5 m) and the rotation error is below 30°, the body's velocities are steered toward the target over `nudge` steps (default 6).
  - Otherwise the body is set to the projected state.
- **[N-15] Driven actors, part 3 (view smoothing).** On every correction the view keeps an offset (old drawn pose − new physics pose) and fades it out over `smoothMs` (default 150 ms). A correction never makes the drawn mesh jump.
- **[N-16] Collisions.** Each peer simulates collisions between all bodies it has. Each actor converges on its authority's version.
- **[N-17]** `snapAt`, `nudge` and `smoothMs` are set per kind and can be changed live with `?tune`.

### 4.5 Out of scope

Lockstep, rollback, re-simulating the whole world, guest-side prediction of host entities, dedicated servers, and more than 8 peers.

---

## 5. Loop, scenes, input and UI

### 5.1 Loop

- **[R-1]** The engine drives `requestAnimationFrame` and uses its timestamp. Frame time is clamped to 0.25 s.
- **[R-2] Fixed steps.** The sim runs fixed steps of `1/hz` from an accumulator, at most `maxCatchUp` per frame. Leftover time beyond the cap is dropped and counted as a clamped frame.
- **[R-3]** The view draws with `alpha = acc / dt`.
- **[R-4]** Each game sets its own rate: `sim: { hz, maxCatchUp }`. Defaults are `{ hz: 60, maxCatchUp: 3 }`; Rally uses `{ hz: 240, maxCatchUp: 12 }`. Substeps belong to kits.
- **[R-5] Hidden tab.** While the tab is hidden the loop pauses and resets its clock on return. A host keeps sending net state from a timer while hidden.
- **[R-6]** Stages run in this order:
  ```
  frame: input.poll → net.recv → [step × n] → net.send → view.sync → render → debug
  step:  input.apply → systems.pre → physics.world → systems.post → events.flush
  ```
  Systems order themselves within a stage with `before` / `after`. `engine.schedule()` returns the resolved order.
  - `input.apply` runs `lh.ui` (hold-control progress on engine time, [U-1]), then `lh.input`, then `lh.commands` ([I-7]), then the game's systems. In `pre`, `lh.scene` steps the scenes (a loading scene's slot runs its load tick instead, [S-6]).
  - With step acks (`acks: 'steps'`, the default: headless and `?lh-test`), `engine.presented()` runs at the very start of each step, so every step counts as a presented frame. A browser boot uses frame acks ([S-6]).
  - `engine.onStep(fn)` calls `fn(engine)` after every step (after `events.flush` and the step counter) and returns an unsubscribe; listeners are copy-on-write (N-4: a port drains `engine.net` there).
  - `engine.onRender(fn)` appends a render slot and returns an unsubscribe; `engine.render(alpha)` calls every slot in registration order (removal during a render applies from the next one). `boot` keeps its own slot, so a game's `onRender` no longer silences the view halves.
- **[R-7] Manual mode.** `engine.manual(true)` stops automatic stepping. `stepN(n)`, `advance(sec)` and `render(alpha)` then drive the engine by hand. Headless runs are always manual. `driver.manual('all')` (also `?lh-test=render`, [D-1]) additionally stops automatic rendering: the tick updates devices only (no step, no render, so no frame ack), and tests call `render()` themselves.
- **[R-8] No allocation.** Nothing is allocated per step or per frame in engine code. Enforced by [T-13].

### 5.2 Scenes

- **[S-1]** A scene has a sim half and a view half, keyed by the same name:
  - **Sim half** (headless-safe): `{ enter(engine, ctx), exit(engine, ctx), step(engine, dt, ctx), ui(ui), presets }`. `ctx` is the scene instance: `name`, `id`, `args`, `state`, `system(name, fn, opts)` (removed on exit), `command(type, fn)` ([I-7]) and `load(opts)` ([S-6]).
  - **View half** (browser): `{ enter(engine, view), exit(engine, view), frame(engine, alpha, view) }`. It builds the HUD and other DOM, and sets up camera rigs. `view` also carries `dt` (driver frame time, capped at `maxFrame`), `rawDt` (the same frame uncapped, #56; both 0 for renders the driver did not start), `wait(promise)`, `focus(testid)` ([U-1]) and `project` (the game's world-to-client projection, set by its view half; exposed as `window.engine.view.project`). `project([x, y, z])` returns `{ x, y, z, onScreen }`: client coordinates, `z` the NDC depth, and `onScreen` false when the point is behind the camera or outside the viewport (#73). A view half may also define `built(engine, view)`, called right after a load's build ([S-6]). View halves enter after the UI sync, so their scene's controls already exist, are adopted and enabled.
- **[S-2]** `engine.go(name, args)` replaces the main scene. `engine.overlay(name, args)` stacks a scene on top, and `engine.close(name)` removes it. An overlay may set `pauses: true` to freeze the sim below it while it is still drawn.
- **[S-3]** Each main scene owns a `World` and a Rapier world. Leaving the scene disposes both, plus the scene's GPU resources.
- **[S-4]** **Flow state lives in scenes or the sim, never in the view.** A view animation that gates flow (a show, a reward card) either becomes a scene timer or ends by emitting an ack event that the sim scene waits for.
- **[S-5]** Scenes export `presets`: named functions that put the scene in a known state (`race.nearFinish`, `farm.reward`). `engine.jump(scene, preset, opts)` enters the scene and applies the preset.
- **[S-6] Loading is a scene state, not a scene.** `ctx.load({ build, then, hold = 0, frames = 1, settle = false, label = '' })` (#6, #21, #38) suspends that scene's `step` hook; in that slot the engine counts ticks and calls `build(engine, ctx)` once `hold` seconds of engine time have passed and `frames` frames have been presented since the request (a frame drawn before the request, such as one still waiting for its ack, does not count). Then `then(engine, ctx)` runs: at once, or with `settle: true` once a frame has been presented after the build and no `engine.block()` is outstanding. `load.then` may be reassigned while the load is pending. One load is active in the engine at a time; `ctx.load` on a scene that is already loading throws `engine: '<scene>' is already loading` (no silent restart of `hold`/`frames`; a load may be requested again from `then`); exiting the scene drops its load; a throwing build drops the load and rethrows. Only the scene's `step` hook is suspended: command handlers ([I-7]) still run while it loads (the game-wide handler always; the scene's own handlers unless a pausing overlay covers it), so a handler that would start a load checks `engine.loading` first.
  - `engine.loading` is a live `{ active, scene, label, phase: '' | 'hold' | 'settle', blocks }` (`blocks`: the labels of unreleased blocks). `engine.onBuilt(fn)` runs `fn(engine, ctx)` right after a build, before settle is evaluated, so a view half's `built` can start a `view.wait` that blocks the settle in the same slot.
  - **Frame acks.** `engine.time.frames` counts presented frames. With step acks (headless, `?lh-test`) every step is one, so the first-tick behaviour is deterministic. With frame acks (a real browser boot) the driver calls `engine.presented()` at the start of the next tick after it rendered (the frame drew in the previous rAF, so it has been presented); `engine.onPresent(fn)` subscribes. If the build queued a `go`, `then` still runs and the go applies at the end of the step.
  - `engine.block(label)` returns a release; `engine.blocked` counts unreleased blocks. `view.wait(promise)` takes a block until the promise settles. `settled()` is false while a load is active ([D-6]).
  - Asset progress and material warming (the old "loading scene") move to phase 3 with `assets.preload`.

### 5.3 Input

- **[I-1]** A game declares its actions with `actions({ name: axis() | button() })`. An axis is in [-1, 1]. A button exposes `down`, `pressed` and `released`; a press shorter than a step is not lost: each device source counts its own rising edges since the last apply and every edge is owed as a press, spread over successive steps (pressed, released, pressed, ...; at most 3 owed), so two taps between two steps give two presses (#41). A `set` or `hold` of the button wins and clears what is owed.
  - `axis({ pair: 'other' })` pairs two axes (#8): the partner must be another axis, and a pair is declared once. A pair merges per source by vector length (ties to the first registered source), so both halves come from one device; `set`/`hold` still override per axis.
- **[I-2]** Devices bind to actions. They are view-only modules.
  - **Keyboard:** configurable ease ramps (a number or a function of time), `shift+` chords; keys are ignored while a text field has focus.
    - A key is released by `e.code`, since Shift may change `e.key` between down and up.
    - Enter and Space on a focused `<button>` belong to the button (the browser clicks it); the keyboard device does not bind them.
  - **Gamepad:** `getGamepads()` is polled every frame, using the standard mapping; axes take response curves.
  - **Touch:**
    - The stick takes `origin: 'thumb' | 'centre'` (#53): `'centre'` is a fixed adopted pad that deflects from its centre on pointerdown and is never hidden or moved. A floating stick with a 24 px left-edge guard and a radial dead zone (or a one-axis slider mode), plus hold buttons. `bindStick` calls `preventDefault` on the pointerdown it accepts (option `preventDefault`, default on), guards a non-positive or non-finite `radius()` (falls back to 70) and a knob-less adopted base. `bindHold(engine, el, action, { source, value, focus = false })` stops the button taking focus on pointerdown/mousedown unless `focus: true` (#42); Space and Enter stay the game's.
    - `bindPointer(engine, { surface, type, at, filter, ignore, edge, tap, press, doc })` turns pointer gestures into commands ([I-7]) of the given `type` with data `{ phase: 'down' | 'move' | 'up' | 'cancel' | 'tap' | 'press', pointer, button, kind, ...at(clientX, clientY, event, phase) }` (#5, #8, #52; `at()` gets the phase being built, so a game can silence moves but keep the press). It owns the gesture: filters (`filter.pointerType`, `filter.button`), an `ignore` selector (UI controls by default), an `edge` guard, pointer capture, window routing of move/up/cancel, a second finger cancelling the active gesture (and blocking until all lift), cancel on blur, pagehide and a hidden tab, moves coalesced to one per `update(dt)`, a tap (up within `tap.move` px, default 12, and `tap.seconds`, default 0.45, with no `press`) and an optional long press after `press` seconds. The reserved keys cannot be overridden by `at()`; if `at()` returns null on down the gesture is silent, and a null on move or press sends nothing. `at()` supplies the payload (a ground hit, a ray, an entity hint) so the sim does the picking and a replay reproduces it; `bindPointer` never sees three.js. Time counts only `update(dt, raw)` (`raw` with `uncapped: true`), never wall-clock timers.
    - Devices get frame time capped at the loop's `maxFrame` (#44), so ramps do not jump after a long frame: the driver calls `device.update(dt, raw)`, `raw` the uncapped frame time (#56). `bindPointer({ uncapped: true })` counts its long press on `raw`, so it takes `press` seconds at any frame rate.
    - **The map hook (#8, #81).** `bindStick`, `bindKeyboard` and `bindGamepad` all take the option `map: { from: [nx, ny], to(x, y, out), radial = 0 }` (`bindGamepad(engine, bindings, { getGamepads, source, map })`, the same `(engine, bindings, opts)` shape as `bindKeyboard`). The device's bindings may target the virtual names `nx`, `ny` instead of actions; on every write and every `update` the device feeds its virtual pair, after a radial dead zone `radial`, to `to` with a reused `out` and writes `out`'s keys (actions) in place of the virtual names, which never reach `engine.input`. `to()` writes into the passed `out`; its return value is ignored. The device's own dead zone (the stick's `deadZone`, the pad's per-axis `deadZone`) applies **before** `map.radial`, so a Tractor-style radial dead zone needs the device's `deadZone: 0`. With paired actions ([I-1]) the merge across devices picks the longest vector, a tie going to the first registered source. `bindStick` returns `{ update, dispose }`; `update()` re-applies the map while a finger is down (the camera may turn under a still thumb) and is a no-op without a map.
    - **Gestures (#59).** `bindGesture(engine, el, { tap, hold: { seconds, fire }, drag, pinch, uncapped = true, tapMove = 12, tapSeconds = 0.45, ignore, doc })` → `{ update(dt, raw), dispose() }` is a view-only gesture reader (no commands) with `bindPointer`'s routing. `tap(e)`; `hold.fire(e)` once per press after `hold.seconds` of `raw` (or `dt`) time within `tapMove` px; `drag({ dx, dy, phase })` for one finger past `tapMove`; `pinch({ scale, rotate, panX, panY, phase })` for two fingers. Values are cumulative from the gesture's start; phases are `start | move | end`, with at most one `move` per `update`; a second finger ends a one-finger gesture (no tap, no hold), a lift ends either, and the payload objects are reused.
    - Fingers are tracked by `pointerId`. `pointerdown` (and `lostpointercapture`) listen on the surface element. Moves, `pointerup` and `pointercancel` are routed by `pointerId` on the window, because iOS does not reliably retarget captured moves.
    - `pointercancel` and `lostpointercapture` count as a release.
    - The root has `touch-action: none`.
- **[I-3]** On `blur` and `visibilitychange`, every held action is released.
- **[I-4]** Once per step (`input.apply`), the local snapshot is copied into the local player's actor as `e.input`. Systems read only `e.input`.
- **[I-5]** Game-specific interpretation (for example Tractor Pickup's point-to-go stick) is a system in `input.apply` that the game registers.
- **[I-6]** `engine.input.set(snapshot)`, `hold(snapshot)` and `release()` override device input for tests and bots.
- **[I-7] Commands.** `engine.command(type, data = {})` queues a typed message for the sim: positional input, network messages, view acks (#5). It is the third input layer, after the action snapshot.
  - **Handlers.** `defineGame({ commands: { [type]: (engine, data, ctx) => void } })` are game-wide (`ctx` is the main scene's ctx, undefined if none is open, #69); `ctx.command(type, (engine, data, ctx) => void)` registers a scene handler (returns a remover, and the handler leaves with the scene). `engine.commands` is live `{ pending, dropped, handles(type) }`.
  - **Data.** `engine.command(type, data)` always checks `data` as plain JSON (plain objects and arrays, finite numbers, strings, booleans, null; else `engine: command data must be plain JSON`, recording or not) and delivers a copy, so handlers never see the caller's object (#72).
  - **Schemas.** A game-wide command may be declared `{ schema: { [field]: F.* }, handler }`: its data is checked at issue with `checkSchema` ([N-8]; `engine: command '<type>' does not match its schema`) and the handler receives the checked copy (unknown keys dropped). `ctx.command` for a schema'd type throws `engine: '<type>' has a schema: handle it in defineGame({ commands }) (#49)`.
  - **Reserved keys.** `from` (string: the transport peer id), `at` (finite number: ms on the injected clock) and `reliable` (boolean) may accompany any command's data; they are type-checked on every command, schema'd or not, and a schema may not declare them. The port sets them; local callers may (tests, replays).
  - **Net commands.** A port ([N-1]) issues the engine-reserved types `net.open { role: 'host' | 'guest', id, hostId, at }` (`hostId` may be `null` when the transport reports none), `net.peer { event, id?, reason?, at }` (`event`: `peer | peerLeft | peerAway | peerBack | hostAway | hostBack | closed`) and `net.frame { frame, from, at, reliable }`; a game that binds a port handles them game-wide. Replies go out through `engine.net.send(to, data, reliable)` (the outbox, [N-3]), which queues `data` by reference, not a copy.
  - **Delivery.** Commands queue FIFO and are delivered by `lh.commands` at the next step's `input.apply` (after `lh.input`): the game handler first, then each open scene bottom-up that handles the type. Only the commands queued before delivery starts are delivered; a command issued by a handler waits a step. A handler that throws counts its command as delivered; the rest stay queued.
  - **Covering rule (#49).** While an overlay with `pauses` is open, game-wide handlers still run, but scene handlers of scenes below the topmost pausing overlay are skipped. A command no handler ran is dropped (counted in `commands.dropped`, not held). That suits positional taps; **network messages and view acks must be game-wide handlers**, or they are lost behind a pause menu.
  - **Recording.** On an engine created with `record: true`, a command issued from outside the sim is logged as its checked copy and delivered as that copy ([T-9]); a command issued inside a step is not logged but is checked (JSON, schema, reserved keys) the same way.

### 5.4 UI helpers

- **[U-1]** A scene's `ui(ui)` declares controls with `ui.button({ id, label, action, when })`, `ui.toggle(...)`, `ui.choice(...)`, `ui.field(...)` and `ui.hold(...)`:
  - Callbacks (`when`, `get`, `set`, a function `action`) are called `(engine, ctx)`, `ctx` the control's scene ctx (#69).
  - **Controls press actions; scenes own transitions** (#39). A button's `action` is an action name (pressed for the next step) or a function; its `when` gate is decided at tap time. A pause chip should press the `pause` action and let a scene hook open the overlay, not open it directly.
  - `engine.ui.enabled(id)` never throws: false for a missing, covered or gated control. `engine.ui.tryTap(id)` taps and returns true, or returns false in those cases (#45).
  - `ui.hold({ id, label, seconds, action, when })` is a hold-to-fire control on engine time (#9). `engine.ui.press(id)` starts it and `engine.ui.release(id)` cancels it; `lh.ui` advances it each step and, when `seconds` have been held, fires `action` once (an action name or a function). It is cancelled if it is removed, covered or its `when` turns false. With `wall: true` it counts `engine.time.wall` from the press instead of engine time, so slow frames that `maxCatchUp` caps do not stretch it (#83; headless, the wall is virtual and exact). `seconds` must be > 0 and a named action must exist. Tree entries of role `'hold'` carry `{ pressed, progress }`. The DOM sets `--lh-progress` (0 to 1) and `data-lh-down` on the element; a hold presses on pointerdown (captured) or Space/Enter and releases when the last pointer or key lifts, on blur, pagehide or a hidden tab, and is not clicked. Custom content (an SVG, a progress ring) is adopted game markup (`data-lh-slot`) that reads `--lh-progress`.
  - `view.focus(testid)` focuses the control once it exists and is enabled, unless the player moved focus first; it gives up after 5 refreshes without the control (with a `console.warn` under `?debug`), or quietly on a scene change (#46).
  - Before a view half's `enter`, the UI is synced, so its controls exist (#46).
  - A game's markup marked `data-lh-slot` is adopted instead of the engine creating its own element. Adoption is also late: a slot that appears after the engine made its own element (a screen a view half builds when it opens) takes over on the next sync and the engine's element is removed, and an adopted element that leaves the document is replaced by a new slot or an engine-made element; `view.ui.adopt()` does this at once.
  - In the browser, buttons and toggles render as real `<button>` elements with an accessible name and `data-testid="<scene>.<id>"`. Toggles use `aria-pressed`.
  - A `field` renders as an `<input type="text">` with `aria-label`. It commits on `change` or on Enter (then blurs), and is not overwritten while focused.
  - A `choice` renders one `<button>` per option (`data-testid="<scene>.<id>.<value>"`) with `aria-pressed` set on the selected one. The options share a `group` in `ui.tree()`; the DOM has no wrapper element for them.
  - An adopted (`data-lh-slot`) control keeps the game's markup: the engine only sets `data-testid`, `disabled` and `aria-pressed`, and leaves the label alone. When the control leaves the registry it loses its `data-testid` and is disabled, not removed. Engine-created elements are removed.
  - Headless, they are registered without DOM so tests can tap them (§7.4).
- **[U-2]** HUD readouts use `<output data-testid="hud.<id>" data-value="<raw>">`.
- **[U-3]** The `<html>` element carries `data-lh-scene`, `data-lh-overlays` and `data-lh-settled`. Overlay roots carry `data-lh-overlay="<name>"`.
- **[U-4]** Safe areas are read through `--lh-sa-*` CSS variables, which default to `env(safe-area-inset-*)`.
- **[U-5]** View timers (toasts, cards) run on engine time, not `setTimeout`.
- **[U-6]** Cosmetic randomness uses `engine.rng('fx')`, never `Math.random`.

---

## 6. Models and the bake

### 6.1 Bake: `lion-hawk bake`

- **[A-1]** Input is `assets/models/*.glb`. Output is optimised GLBs plus one `<model>.phys.json` sidecar per model, written to the game's `build/assets/`.
- **[A-2] Checks.** The bake fails, naming the model and node, if:
  - a material name is neither in the registry nor `paint-*`;
  - a `col-*` node has an unsupported shape;
  - a socket required by the game config is missing.
- **[A-3]** Optimisation uses gltf-transform: meshopt geometry, KTX2 or WebP textures, prune and dedupe. Settings are per game, with engine defaults.
- **[A-4] Paint materials.** `paint-*` materials map to a base material, `steel` by default, overridable per game. At runtime their colour comes from per-instance colours.

### 6.2 Physics sidecar

- **[A-5]** A sidecar holds:
  - colliders: shape, transform in body space, part name, material ID;
  - mass properties from volume × density;
  - sockets;
  - aero panels and the closed volume (from phase 8).
- **[A-6] Collider rules:**
  - Nodes named `col-box`, `col-sphere`, `col-capsule`, `col-hull` or `col-mesh` are colliders. They are hidden at runtime and take the material of their parent part.
  - A model with no `col-*` nodes gets one convex hull per material part.
  - Models marked `static` in the game config default to `col-mesh`.
- **[A-7]** Empty nodes named `sock-*` become named sockets.
- **[A-8]** The sim reads only sidecars. It never parses glTF.

### 6.3 Runtime loading (view)

- **[A-9]** There is one shared `GLTFLoader` with the meshopt and KTX2 decoders, and Draco optional. Each URL is loaded once and cached as `Map<url, Promise>`. Instances are clones; skinned meshes use `SkeletonUtils.clone`.
- **[A-10]** `engine.assets.preload(keys)` drives the loading scene and ends by warming materials ([M-12]).
- **[A-11]** Animation uses `AnimationMixer`. A model may opt into baked animation tables (`bake: { animTable: true }`) for large instanced crowds.

---

## 7. Tooling and testing

### 7.1 CLI: `lion-hawk`

| Command | Does |
|---|---|
| `lion-hawk dev` | esbuild watch + live reload server; rebakes changed models |
| `lion-hawk bake` | §6 |
| `lion-hawk build [--mode single\|shared]` | bundles the game, writes `site/exp/<game>/`, stamps the PWA |
| `lion-hawk test [--visual]` | `node --test` for the game + engine checks; `--visual` adds `@visual` Playwright tests |
| `lion-hawk release` | bump version → bake → build → test → commit; push stays manual |

- **[B-1]** The CLI is Node only; it replaces `build.py`, `bake.mjs` and `dev.mjs`.
- **[B-2]** Game-specific build steps (for example Tractor Pickup's voice and animal audio embedding) are hooks declared in `game.config.js`.
- **[B-3] Single mode** (the default) produces one HTML file with everything inlined, GLBs and sidecars included as base64.
- **[B-4] Shared mode** (phase 9) serves the engine, three.js, Rapier and shared models from `/exp/lion-hawk/<version>/`.
- **[B-5]** Every build stamps the game version, the engine version and a content hash into the page and the service worker.

### 7.2 PWA

- **[P-1]** One service-worker template:
  - caches are versioned;
  - old caches are deleted on `activate`;
  - game files are served cache-first.
- **[P-2]** No `skipWaiting` while a session is running. When an update is waiting, the engine shows a "new version ready" message.
- **[P-3]** The manifest is generated from `game.config.js`: name, colours, icon.

### 7.3 Debug

- **[D-1]** `flags` parses the URL once into a frozen object. Recognised flags: `?debug`, `?tune`, `?fps`, `?seed=`, `?replay=`, `?slow=`, `?nosw`, `?mute`, `?lh-test`. `?lh-test=render` (`flags.lhRender`) additionally boots in full-manual mode: nothing renders until a test calls `render()` (#47).
- **[D-2]** `?tune` lazy-loads lil-gui. Kits and games register tunables with `engine.tune(group, obj, spec)`.
- **[D-3]** `?fps` shows:
  - frame ms;
  - sim steps per frame;
  - clamped frames;
  - draw calls;
  - shader programs.
- **[D-4] `window.engine`** is always present and exposes:
  - **lifecycle:** `ready`, `version`, `seed`, `errors`;
  - **loop:** `manual`, `hz`, `stepN`, `advance`, `render`, `time`;
  - **scenes:** `scene`, `go`, `overlay`, `close`, `jump`, `isOpen(name, { pending })`, `on(...)`;
  - **commands and loading:** `command(type, data)`, `loading` (the live `engine.loading`);
  - **events:** `events.since(seq)`;
  - **state:** `state`, `query`, `snapshot`, `restore`, `checksum`;
  - **input:** `input.set/hold/release/read`; `ui.enabled/tryTap/tap/press/release`;
  - **settling:** `settled()`;
  - **view:** `view.project` (set by the game's view half; world targets call it), `ui.tree()`;
  - **other:** `rng(name)`, `policies`, and the game's `debug()` extras.
- **[D-5]** `window.rally` is removed (Rally has migrated). `window.piggies` and `window.tp` remain as aliases until their games finish phase 2.
- **[D-6]** `settled()` is true when:
  - no asset, font or shader loads are pending (including promises handed to `view.wait`);
  - no scene load is active (`engine.loading.active`, [S-6]);
  - no element has `data-lh-state="opening|closing"`;
  - no scene transition is running.

  `?lh-test` turns off CSS transitions and starts in manual mode.

### 7.4 Headless helpers: `lion-hawk/test`

These run under `node:test`.

- **[T-1] Setup.** `headless(game, { seed, scene, args, clock: 'virtual', invariants, record: 'on-fail' })` returns a handle `h`. The `finite()` invariant (no NaN or Infinity in any `xf` or body) is always on. Until the `World` exists, `invariants.finite(select, label)` checks any selected value (#64).
- **[T-2] Stepping and policies.**
  - Stepping: `h.step(n, input)`, `h.seconds(s, input)`, `h.hold(input)`, `h.release()`.
  - Policies: `policy.still`, `policy.const({...})`, `policy.seq([[steps, input]...])`, `policy.fn((h) => input)`, `policy.every(n, fn, { phase, key })`. `policy` is exported by `lion-hawk/sim` (games register policies in `game.sim.js`, which is bundled for the browser) and re-exported by `lion-hawk/test`.
  - Every policy is called as `fn(h, i, scratch)`: `scratch` is one persistent object per handle and policy function. `policy.every(n, fn, { phase = 0 })` recomputes every `n` engine steps and holds the output in between (`n` a positive integer, `phase` an integer in `[0, n)`; cadence follows engine steps, so one-step `h.step(1, p)` loops keep it, and a gap of `n` steps or more re-anchors at the next call) (#26, #37). With `key: h => value`, a call whose key differs (`===`) from the previous call's recomputes at once and anchors the cadence there, e.g. when the sim behind the policy is rebuilt (#51).
  - When a test compares two runs, perturb one on purpose (`phase`, or a step offset): with step-exact policies two identical runs cannot tell `min(a, b)` from `a` (#40).
  - Games register named policies (for example `autopilot`) in `game.policies`.
- **[T-3] Waiting.**
  - `h.until(pred, { maxSteps | maxSeconds, input, message })`, `h.untilEvent(typeOrPred, opts)`, `h.untilScene(name, opts)`. All are counted in steps.
  - On timeout they throw with the seed, the step number, the scene and the last 20 events.
- **[T-4] Events.** `h.events` is the event log; reading it (`h.events`, `h.since`, and `window.engine.events.since` in a page) flushes pending events first with `engine.flushEvents()` (#71), which is re-entrancy safe: a listener that reads them sees each event once. `h.mark()`, `h.events.since(mark).of(type)`, `.first(...)`, `.count(...)`, and `expectEvents(h, since).toInclude(type, match)` / `.toBeSequence([...])`.
- **[T-5] World access.**
  - `h.find(kind | tag, where)`, `h.one(...)` (throws unless exactly one match), `h.get(id)`.
  - `h.place(e, opts)`, `h.spawn(desc)`, `h.despawn(e)`.
  - `h.go`, `h.overlay`, `h.jump`.
  - `h.tap(testid)` taps a registered UI control. It fails if the control is not present, or its `when` is false.
  - `h.fill(testid, value)` sets a `field` control. It fails if the control is not a field, or its `when` is false.
  - `h.command(type, data)` issues a command; it throws if no handler (game-wide or in an open scene) handles the type. `h.enabled(id)` and `h.tryTap(id)` are the non-throwing queries ([U-1]). `h.press(id)` and `h.unpress(id)` hold and release a `ui.hold` control.
  - `h.debug` is the game's `debug(engine)` extras, made once per handle (#70).
  - `h.untilLoaded(opts)` steps until `engine.loading.active` is false (a load with `hold` and `frames` completes in steps, since every step is a frame).
  - `stripComments(src)` (the function the purity scan uses: string-aware, line comments removed, block comments blanked keeping newlines) is exported for games' own source scans.
- **[T-6] Fixtures.** `fixtures.define(name, (h, ...args) => ...)` and `h.use('quietYard', 'warm:60', ['ahead', e])`. The built-in `warm:N` steps N times with `policy.still`.
- **[T-7] State.** `h.snapshot()`, `h.restore(snap)`, `h.fork()`, `h.checksum({ parts: 'sim' })`, `diff(a, b, { tol })`, and golden files with `--bless`. `golden(file, value, { exact: true })` stores unrounded values (#68; a stored golden's mode must match the call's); `assertFinite` walks Maps, Sets, typed arrays and cycles.
- **[T-8] Spies and logs.** `h.spy(obj, method)` returns `{ calls, count }`. Warnings and errors are captured, and fail the test unless it calls `h.expectWarning(re)`.
- **[T-9] Record and replay.** `headless(game, { record: true })` records what comes from outside the sim; `h.tape()` returns `{ v: 1, game, seed, scene, args, hz, wall0, log, end, sums }` (`replay` starts its virtual wall from `wall0`, default 0, [N-4]).
  - `log` is `[{ step, ops?, input? }]`. `ops` are the external operations issued before that step, in order: `['tap', id]`, `['fill', id, text]`, `['press', id]`, `['release', id]`, `['command', type, data]`, `['go', name, args]`, `['overlay', name, args]`, `['close', name]`, `['jump', scene, preset, opts, args]`. An operation made from inside a step, a transition or boot (a tap whose action calls `go`) is not recorded. `input` holds the action values that changed in that step's snapshot (axes as numbers, buttons as down).
  - **Plain-JSON rule while recording:** command data, scene args and jump opts must be plain JSON (checked at issue, and the handler or scene receives a copy of what was logged), so the tape and the replay see exactly what the handlers saw.
  - `sums` is `[[step, checksum]]`, one every 60 steps, taken after each step run through the handle (`h.step`, `until`) and not by `engine.stepN` called directly; `end` is the final step.
  - `replay(game, tape, { invariants })` (from `lion-hawk/test`) starts a headless handle from the tape's seed, scene and args, re-issues the ops before the steps they preceded, **sets** (not holds) the recorded input before every step so nothing stays held afterwards, and compares every checkpoint: the first divergence throws `replay: checksum differs at step N`. It rejects a tape of another version, game or `hz`. Replay and recording are headless only (a browser engine with `record` throws); `record: 'on-fail'` files are still deferred.
- **[T-10] Determinism.** `checks.determinism(game, { seed, steps })` runs twice and reports the first step whose checksums differ.
- **[T-11] Multiplayer.** `mp(game, { peers = 2, link = { delay, jitter, loss }, clock, record = false, seed = 1, argsOf, beforeStep, onWarn })` (built in 2f) runs headless peers over the in-memory hub, each with a port ([N-1]), and returns `w = { hub, peers, host, guests, now, step(n = 1, inputs), seconds(s, inputs), addPeer(), settle(agree, { maxSeconds = 3 }) }`:
  - peer `i` is `{ index, name: 'host' | 'guest<i>', h, engine, net, port }`; `inputs` is an array of action snapshots or `(peer, i) => snapshot`, applied with `engine.input.set`; `beforeStep(peer, i)` runs before each peer's step;
  - each `w.step` advances the hub clock by `1000 / hz`, ticks the hub, then steps every peer in order (`h.step(1)`, so tapes record); the hub's jitter and loss are seeded from `seed`;
  - `settle(agree)` steps until `agree(w)` returns `[]` and returns what is left;
  - the hub decides a drop at send time (`hub.drop`), so messages already in flight when a blackout starts still land (#94);
  - a peer added later starts with `wall0 = hub.now`; its virtual wall can be one ulp off the hub's, so compare a late peer's `time.wall` with a tolerance (#93);
  - still to come: `w.drop(peer)`, `w.blackout(s, { kinds })` and `w.diverged({ agree })` over `net` entities.
- **[T-12] Sim purity.** `checks.simPurity(game)` imports the sim entry under a guard. Using `three`, `document`, `window`, `Date.now`, `performance.now` or `Math.random` throws.
- **[T-13] Zero allocation.** `checks.zeroAlloc(game, { steps: 10000 })` compares heap use before and after (Node `--expose-gc`).
- **[T-14] Material references.** `checks.materials(game)` verifies that every material referenced by the game's models and sidecars exists.
- **[T-15]** `lion-hawk test` runs T-10, T-12, T-13 and T-14 for every game automatically.

### 7.5 Browser helpers: `lion-hawk/playwright`

- **[T-16] Presets.** iPhone SE, iPhone 15 Pro and 15 Pro Max (portrait and landscape), iPad Mini, iPad Pro 11 and desktop. Each preset has:
  - real iOS safe areas applied through `--lh-sa-*`;
  - a fixed DPR;
  - SwiftShader and `channel: 'chromium'`;
  - `serviceWorkers: 'block'`.

  The browser is located automatically.
- **[T-17] The `game` fixture.**
  - Opening: `open({ scene, args, seed, query, settings, render, initScript })` loads with `?lh-test` (`render: 'manual'` loads with `?lh-test=render`, [D-1]; `testUrl(url, opts)` builds the URL) and waits for `ready` and `settled()`. `initScript` (a function or `{ content }`) is added with `context.addInitScript` before navigation (so popups and new tabs get it too), e.g. to stub WebGL (#74).
  - Stepping: `step`, `seconds`, `until`, `untilEvent` and `untilLoaded({ maxSteps, timeout })`, each stepping inside the page. `step`, `seconds`, `until`, `untilEvent` and `untilLoaded` hand control back to Node while a load's settle is held by blocks (`engine.loading.phase === 'settle'` with `blocks` pending, e.g. a `view.wait`), poll until the blocks clear (bounded by `timeout` ms, default 30000), then continue stepping (#50). `untilLoaded` steps until `engine.loading.active` is false.
  - State and scenes: `render`, `state`, `query`, `go`, `jump`, `command(type, data)`.
  - Pointing: `point(target)` resolves a selector, `{ x, y }` or `{ world }` to client `{ x, y }` for `page.mouse` (#65). A `{ world }` point whose `view.project` returns `onScreen: false` throws `touch: { world } point is off-screen or behind the camera` (#73); a `project` without `onScreen` is taken as on-screen.
  - Input: `input.hold` / `release`.
  - Touch: `touch.start/move/end/drag` through CDP, so taps are hit-tested and multi-touch works. Targets are a locator, `{x, y}` or `{ world: [x, y, z] }`.
  - UI: `tap(label)`, `fill(testid, value)`, `press(testid)` / `unpress(testid)` (a held CDP touch beside the active touches on touch presets, the mouse on desktop; for `ui.hold` controls) and `control(testid)`. `fill` types into the real `<input>` and presses Enter to commit it.
  - Screenshots: `shot(name, { mask })`.
  - Errors: `errors` must be empty at teardown.
- **[T-18] Matchers.** The layout assertions `expectTappable(game, target, { min })`, `expectFitsSafeArea(game, target)` and `expectNoOverlap(game, a, b)` take a target: a string (a test id for `expectTappable`, a CSS selector for the other two), `{ testid }`, `{ css }` or a Playwright locator, and name the target in their failure messages (#48). Matcher names: `toBeInScene`, `toHaveEmitted`, `toBeSettled`, `toHaveState`, `toBeTappable({ min })`, `toFitSafeArea`, `toNotOverlap`, `toBeThumbReachable(side)`.
- **[T-19] Screenshots.** `@visual` tests run only with `--visual`, in a pinned container.
- **[T-20] Peers.** (Built in 2g.) `peers(browser, url, n, { link, preset, seed = 1, args, argsOf, query, timeout })` opens `n` pages, each in its own browser context (page 0 is the host), with `?lh-test&lh-bridge=host|guest`, and joins them through one Node `createMemoryHub(link)` (jitter and loss seeded from `seed`) over the `bridge` transport ([N-2]); the game binds its port to `bridgeTransport()` when it sees `?lh-bridge`. It returns `room = { games, hub, now, step(n = 1), close() }`:
  - `argsOf(i, name)` gives page `i` its own args and overrides `args`; other options go to each page's open ([T-17]);
  - `room.step(n)` does, `n` times, what `mp()` does ([T-11]): it advances the hub clock by `1000 / hz`, ticks the hub, delivers each page's events in order, then steps every open page once (the pages are in manual mode, so a run is deterministic), waiting after each page's step until Node has every bridge call that page made (bounded by `timeout` ms);
  - closing a page's driver (`game.close()`) leaves the hub for it: its host hears `peerLeft`, and a closed host closes the room (`closed`) for its guests; `room.close()` closes every page.
  - if a page fails to open, the pages already open are closed before the error is rethrown; `bridgeEnd(net)` (exported for tests) is the Node end of one page's bridge, applying its calls in sequence order;
  - a page must not reload or navigate: `info.sent` restarts at 0 while Node's sequence counter does not, so that page's bridge stalls.
- **[T-21]** Real-iPad audio and touch checks remain a manual checklist in each game's docs.

### 7.6 Deferred

- A flow DSL that runs the same script headless or in a browser.
- fast-check fuzzing over the action map.

Both build on §7.4–7.5 and are added once enough flows exist to shape them.

---

## 8. Repo layout, packaging and migration

### 8.1 Layout

```
games/
├── package.json              # npm workspaces: lion-hawk-engine, pig-pens, rally, tractor-pickup
├── lion-hawk-engine/         # package "lion-hawk"
│   ├── package.json          # peerDependencies: three ^0.186, @dimforge/rapier3d-compat ^0.21
│   ├── src/
│   │   ├── core/             # loop clock, rng, math, events, flags, scenes, engine object   (sim)
│   │   ├── defs/             # materials, kinds, field types                               (sim)
│   │   ├── sim/              # world/entities, physics wrapper, fields, replication        (sim)
│   │   ├── view/             # rAF driver, renderer, material compiler, assets, audio,
│   │   │                     # input devices, ui helpers, debug overlays, pwa client       (view)
│   │   ├── net/              # lion-hawk/net: transport.js (hub, lag, room link), port.js;
│   │   │                     # rtc (the game's vendored handshake.js), bridge                (net)
│   │   └── kits/<kit>/       # vehicle, terrain, herd, coverage, fx — each sim/ + view/
│   ├── testing/              # lion-hawk/test (headless, replay, mp), lion-hawk/playwright
│   ├── tools/                # lion-hawk CLI
│   ├── test/                 # engine tests
│   └── docs/                 # design.md, research*.md, spec.md, plans/
└── <game>/
    ├── game.config.js        # id, version, netVersion, sim, build hooks, PWA, model settings
    ├── src/game.sim.js       # defineGame sim half: defs, actions, kits, scenes (sim), policies
    ├── src/game.view.js      # view half: scene views, camera rigs, HUD
    ├── assets/  test/
```

### 8.2 Game contract

```js
// src/game.sim.js — headless-safe
export default defineGame({
  id: 'tractor-pickup',
  sim: { hz: 60, maxCatchUp: 3 },
  defs: { materials: MATERIALS, kinds: KINDS },
  actions: actions({ steer: axis(), throttle: axis(), horn: button(), pause: button() }),
  kits: [vehicleKit, terrainKit, herdKit, coverageKit, fxKit],
  scenes: { title, farm, show, reward },          // sim halves (§5.2)
  start: 'title',
  policies: { autopilot },
  debug: (engine) => ({ herd: engine.world.with('animal') }),
});

// src/game.view.js — browser only
export default defineView({ scenes: { title, farm, show, reward } }); // view halves
```

- **[G-1]** `headless()` imports only `game.sim.js`. The browser entry imports both.

### 8.3 Packaging

- **[G-2]** Packaging rules:
  - The engine package exposes `lion-hawk/sim`, `lion-hawk/view`, `lion-hawk/kits/*`, `lion-hawk/test`, `lion-hawk/playwright` and `lion-hawk/build` through `exports`.
  - three.js and Rapier are peer dependencies, and the esbuild config forces one copy of each. `lion-hawk/build` exports `dedupe({ root, packages = ['three', '@dimforge/rapier3d-compat'] })`, an esbuild plugin that re-resolves those packages (and their subpaths) from the game's `root`, so the engine and the game share one copy (#11). It lives in `tools/`, not `src/`: engine source imports neither three nor Rapier. Games adopt it with the phase 3 CLI; today's builds use the esbuild CLI, which takes no plugins.
  - Each game build bundles a snapshot of the engine.
- **[G-3]** The engine has its own semver version (0.x until migration ends) and a `CHANGELOG.md`.
- **[G-4]** `npm test` in `games/` runs every workspace's tests. An engine change ships only when all of them pass.

### 8.4 Migration phases

| # | Phase | Done when |
|---|---|---|
| 0 | Workspace; engine skeleton (`rng`, `math`, `events`, `flags`, `window.engine` with aliases); first headless helpers; **one golden/replay test per game written against today's code** | every game builds from the workspace; goldens pass |
| 1 | Version alignment: Pig Pens and Rally → three 0.186; Rally → Rapier 0.21 | goldens pass or are re-blessed with a written reason |
| 2 | Loop, scenes, input actions and UI helpers in all three games. Rally `Game` → scenes; Tractor Pickup trip flow → scenes ([S-4]); Pig Pens `main()` split. Playwright helpers land | each game runs on the engine loop; a headless end-to-end flow test per game |
| 3 | Tooling: CLI, glTF bake + sidecars, runtime glTF loading; `assets.json`, `build.py`, `bake.mjs` retired | builds are equal in behaviour; size measured against today |
| 4 | Entities and materials: `World`, parts, registry, pairs, ground lookup; hard-coded friction, `SURFACES` and `DIRT` replaced | no literal friction/density in game code |
| 5 | Netcode in the engine, driven by `net` parts, including driven remote actors ([N-12]–[N-17]); Tractor Pickup first; `test.peers` | the bump test (§4.4) passes under 80 ms latency and 2% loss |
| 6 | `kit-vehicle` (both tractors merged; Rally tire model as a second backend) and `kit-terrain` | three games on the kits |
| 7 | `kit-coverage`, `kit-herd`, `kit-fx` | mud, dirt and snow on one system |
| 8 | Fields: wind, aero, buoyancy, magnet; panel bake | field tests with analytic expectations |
| 9 | Shared build mode and one service worker across `/exp/` | second game loads only its own files |

- **[G-5]** Each phase gets its own plan in `docs/plans/`.
- **[G-6]** A phase is done when every game's tests, the goldens and the Playwright smoke tests pass, and each changed game is version-bumped and deployed.
- **[G-7]** Work happens on a `feat/lion-hawk` worktree. Rally's uncommitted game-loop work is committed before phase 0.

---

## 9. Decisions on the design's open questions

| Question (design.md §10) | Decision |
|---|---|
| Object model | Plain-object entities with live queries (§2); typed arrays allowed inside kits; no ECS library |
| Determinism | Same JS engine only, for tests and replays; snapshot replication for net; no lockstep |
| Pair-table scope | friction, restitution, tire, sound, fx ([M-7]) |
| Wind | Global field plus zones, behind `wind.at` ([M-15]) |
| Single file or shared bundle | Single file by default; shared mode in phase 9, opt-in per build |

## 10. Still open

- **Skerry Island and other sources.** The plane sims, jet ski and Surface booth (referenced in `design.md`) have no code in this repo. Before phase 8, locate them or treat their lessons as requirements only.
- **CI.** Nothing runs the game tests automatically today; GitHub Actions only deploys the site. Decide whether `npm test` (and `--visual` in a pinned container) runs on push.
- **Handshake vendoring.** How `handshake.js` updates flow from the Handshake repo into `lion-hawk-engine/src/net/transport/rtc/` (copy script plus version stamp is the default).
