# Lion Hawk Engine: specification

Version 0.1 (2026-10-11). Status: draft for review.
Amended 2026-10-13: phase 3 deltas D1–D9 and the 0.7.3 carry-overs.
Amended 2026-10-14: 0.7.4 clarifications from phase 3b (materials registry and sidecar schema).
Amended 2026-10-14: 0.8.0 clarifications from phase 3c (World and physics) and 3d (bake and CLI).
Amended 2026-10-21: local players, controllers, player and game state: §4.6 [N-18]–[N-25], §5.5 [C-1]–[C-14], [I-4] rewritten, [D-7], [T-22]–[T-25]. Built in 0.13 (plan 1): [C-1]–[C-4], [I-4], [T-23]; (plan 2): [C-5]–[C-13]; (plan 3): [N-18]–[N-25], [T-22], [C-5]'s online `lh.seat` route; (plan 4): [C-14], [D-7], [T-24]; (plan 5): [T-25]. Released in 0.13.0.

Lion Hawk is an opinionated 3D web physics engine for browser games.

Background:
- `design.md`: the original layered design and material system, plus code survey findings.
- `research.md`: engine architecture research.
- `research-testing.md`: test helper research.

This spec decides; those files explain.

Requirement IDs (`[L-1]`, `[E-3]`, …) are cited by code comments, tests, commits and the changelog.

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
- **[L-3] The sim never touches the browser.** Every module is either *sim* (Node-safe, no `three`, no DOM, no wall clock) or *view* (browser only). Sim code never imports view code. This is enforced by a test (§7.4, [T-12]). The engine never imports Rapier: the game passes its initialised module, `defineGame({ physics: { rapier } })`. Engine **view** modules import `three` and `three/addons/*` directly, and game builds go through `lion-hawk build` (dedupe, [G-2]). Sim modules import neither (D9).
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

- **[E-1]** An entity is a plain object with a numeric `id`, a `tags` set (always present, empty by default), and optional parts. It is not a class instance.
- **[E-2]** A `World` holds the entities of one scene, plus that scene's `RAPIER.World`.
- **[E-3]** Systems query entities by the parts they have, for example `world.with('body', 'net')`. A query is a live, cached list that updates on spawn, despawn and part changes. This is miniplex-style; no ECS library is used.
- **[E-4]** Game data lives on the entity as plain fields, for example `e.pig = { mood, mud }`. Only fields declared in a `net` kind are replicated.

### 2.2 Built-in parts

| Part | Declared as | Sim side | View side |
|---|---|---|---|
| `model` | asset key, e.g. `'truck'` | reads the physics sidecar (§6.2) | `Object3D` cloned from the cached glTF |
| `body` | `'dynamic' \| 'kinematic' \| 'fixed'` or `{ type, lock, ccd, linearDamping, angularDamping, sleep, canSleep, mass, massProps }` | one Rapier rigid body; one collider per sidecar collider | none |
| `material` | taken per collider from the sidecar; `material: { '*': 'rubber', wheel: 'rubber' }` overrides by part name | collider friction, restitution and density (§3.3) | compiled material (§3.6) |
| `net` | kind name, e.g. `'vehicle'` | record build and apply (§4.3) | remote smoothing (§4.4) |
| `xf` | `{ p: {x,y,z}, q: {x,y,z,w} }` | written from Rapier after each step, or by game code for bodiless entities | interpolated into the `Object3D` (§2.4) |
| `input` | an action snapshot (§5.3) | read by systems; written by the input stage, the network or a test policy | none |
| `sockets` | from the sidecar | named attachment points in body space | same, for attaching meshes |
| `owner` | peer number | who has authority for `owner` kinds | none |

### 2.3 Lifecycle

- **[E-5]** `world.spawn(desc)` creates the entity and its Rapier body and colliders in the same call. It returns the entity.
- **[E-6]** The view creates the matching `Object3D` on its next sync and removes it after despawn.
- **[E-7]** `world.despawn(e)` removes the Rapier objects, query membership and the World's own records. View sync drops the entity's view object on its next frame, and replication drops the net record on its next pass. On a guest, only the replication layer may spawn or despawn entities of host-authority kinds.
- **[E-8]** `world.place(e, { at | rel, local, yaw })` moves an entity and its body together. Tests and game code use it rather than writing to Rapier directly.
- **[E-9]** `e.id` is unique within a World: a counter from 1 in spawn order, reset by `world.clear()`. A replicated entity also carries `e.netId` in its kind's `idMin..idMax` (§4.3) (D7).

### 2.4 Transforms and interpolation

- **[E-10]** Each entity with `xf` has two transform slots, `prev` and `curr`, in a shared `Float64Array` pool. `curr` is copied into `prev` at the start of every sim step. No objects are allocated per step or per frame.
  - *Clarification (phase 3, 0.8.0; 3c):* the swap copies `curr` into `prev` (it does not flip the halves), in `lh.world.swap` at the start of `input.apply`. `e.xf.slot` is the entity's read-only pool slot; `world.xf.pool` is re-read every frame because growth replaces the array.
  - *Clarification (phase 3, 0.8.0; 3c Task 10b, 3g-R7):* part poses are swapped with the pose pool. An entity spawned with `partXf: [names]` has `e.partXf[name] = { p, q }` (written by the sim each step); `lh.world.swap` copies each part's `curr` to `prev` with the entity's `xf`, and `world.partXfPrev(e, name, out)` reads the previous pose. Part poses are not in the World digest.
- **[E-11]** The view writes `lerp(prev, curr, alpha)` (a normalised nlerp on the short arc for rotations) into each `Object3D`. For remote entities, interpolation and smoothing come from §4.4 instead.

### 2.5 Systems

- **[E-12]** A system is a function `(engine, dt) => void` registered with `engine.system(name, fn, { stage, before, after })` (§5.1).
- **[E-13]** Systems emit events with `engine.emit(type, data)`. Events are queued, delivered in order at the end of each step (the `events.flush` stage), and kept in the event log (§7.4). Outside a step, `engine.flushEvents()` delivers what is queued now (#71); it is re-entrancy safe: called from a listener (directly or by reading `h.events`), it does nothing, so each event is delivered and logged once.

---

## 3. Materials

### 3.1 Registry

- **[M-1]** Materials are plain data created with `defineMaterials({...})`. The definitions layer is used by both sim and view and has no runtime dependencies.
- **[M-2]** The engine ships a base library: `steel`, `aluminium`, `wood`, `rubber`, `glass`, `plastic`, `fabric`, `flesh`, `fur`, `gravel`, `grass`, `dirt`, `mud`, `asphalt`, `snow`, `ice`, `water`, `air`. Games add entries or extend base ones (`extends: 'steel'`, with overrides).
- **[M-3]** Validation runs when the registry is loaded. An unknown block, a value out of range, an unknown `extends` or an `extends` cycle throws an error that names the material and the field. A material may carry a free-form `game: {...}` block. It is not validated and is copied through `extends` (D6).
  - *Clarification (phase 3, 0.7.4; 3b contract issue 4):* a game entry whose id is a base id is merged over the base entry in place (same index; `extends` from other entries sees the merged version). Such an entry may not itself `extends` (it throws).
  - *Clarification (phase 3, 0.7.4; 3b contract issue 5):* the registry is `{ ids, hash, get, has, index, byIndex, density, collider, pair }`. A resolved material carries its `id`. `byIndex(i)` returns the id string; terrain stores indices and `materialAt` returns ids.
  - *Clarification (phase 3, 0.7.4; 3b contract issue 6; overview §4.2):* `registry.hash` covers only what sidecars and colliders depend on: the ids **in index order**, each material's effective `phys` (`friction`, `restitution`, `sg`, `fill`, with defaults filled in and `sg` 0 for a fluid without `phys.sg`), and each pair entry's `friction`/`restitution`. It is canonical JSON (keys sorted) hashed with FNV-1a, as 8 lowercase hex digits; the base library's hash is `2f4f4f95`. `look`, `game`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `fluid` (beyond its effect on `sg`), `sound`, `fx` and pair `tire`/`sound`/`fx` are read live and not hashed, so changing them needs no re-bake. Cost: a stale `look` baked into a GLB is not caught by `checks.materials`.

### 3.2 Schema

Every block is optional.

| Property | Units / meaning | Read by |
|---|---|---|
| `look.*` | `MeshPhysicalMaterial` params plus `subsurface`, `fur`, `wear` | material compiler (§3.6) |
| `phys.friction` | Coulomb coefficient, 0–2 | collider |
| `phys.restitution` | 0–1 | collider |
| `phys.sg` | specific gravity; density = `sg × 1000 × fill` kg/m³ | collider density → mass and inertia; buoyancy |
| `phys.fill` | solid fraction, above 0 and at most 1, default 1 (a car shell ≈ 0.02) | collider density |
| `tire.{mu, C, kp, ap, crr, drag}` | Magic Formula surface params | `kit-vehicle` tire backend |
| `dirtRate` | coverage gained per metre driven | `kit-coverage` |
| `coverage` | `{ dirt, rust, snow, mud }`: which layers this material accepts, 0–1 | `kit-coverage`, material compiler |
| `aero.skin` | skin-friction coefficient | aero field |
| `aero.airfoil` | `{ cl: [[aoa, cl]...], cd: [[aoa, cd]...], stall }` | aero field |
| `magnet.strength` | dipole moment, A·m² | magnet field |
| `magnet.ferrous` | 0–1 | magnet field |
| `fluid.{density, viscosity}` | kg/m³, Pa·s | buoyancy, fluid drag |
| `sound`, `fx` | cue IDs | audio and fx, from contact events |

*Clarification (built, post-0.13):* `createVehicle(world, e, { backend: 'tire', substeps = 'auto' })` is a racing tire model (`src/kits/vehicle/tire.js`): the kit casts each wheel's ray and runs its spring and damper (`suspension: { rest = 0.3, stiffness, bump, rebound }`, defaults from the chassis mass), then steps the tire (brush patch with relaxation lengths, combined-slip Magic Formula with `B = tan(π / 2C)`, load sensitivity, low-speed damper), rolling resistance (`crr`) and the wheel's spin (`inertia = 1`) `substeps` times per step; `'auto'` keeps each substep at 1/1920 s or less, where the explicit integration is stable. Surface drag (`drag`) and the tire and spring forces are applied as impulses at the contact points. Controls are `steer`, `engine` (drive torque at the wheel, N m) and `brake` (torque, ≥ 0). The surface is the pair's `tire` block (`pair(tyre, ground).tire`), else dry asphalt. Each wheel also reports `omega`, `kappa`, `alpha`, `fx`, `fy` and `surface`. Game-specific parts (plows, anti-roll bars, aero drag, driver assists) stay in the game.

### 3.3 Materials on colliders

- **[M-4]** Each collider gets its material from the glTF material name of the part it was made from (§6.2). Its density, friction and restitution are set from that material.
- **[M-5]** The engine keeps a collider-handle → material-ID map. Contact events carry `{ a, b, materials: [ma, mb], impulse, point }`.
- **[M-6]** Mass and centre of mass come from the colliders' geometry and density. A game sets mass only through `phys.fill`; through `body: { mass }`, which scales every collider's density so that the body weighs `mass` (centre of mass and inertia stay geometric); or through `body: { massProps: { mass, com, inertia } }`, which is explicit and marked `// lh-allow` in game code (D3).

### 3.4 Pairs

- **[M-7]** A pair table, keyed by an unordered material pair, may override `friction`, `restitution`, `tire`, `sound` and `fx`. Pair `friction` and `restitution` overrides apply only where the engine computes a contact itself: vehicle-kit wheels, and `materials.pair()` reads in kits and games. Rapier contacts use only the combine rules of [M-9] (D4: Rapier JS has `filterContactPair` but no solver-contact modification hook).
- **[M-8]** When a pair has no entry:
  - friction is the geometric mean of the two materials;
  - restitution is the maximum;
  - `sound` and `fx` come from the material with the lower `sg` (the softer one).
  - *Clarification (phase 3, 0.7.4; 3b contract issues 1 and 5):* `pair(a, b)` is order-dependent and cached per **ordered** pair. A tie in `sg` gives the cues to `a`; the tyre is `b`'s (else `a`'s). Kits pass the moving body as `a` and the ground as `b`. A softer material without `sound`/`fx` falls back to the harder one's; absent `tire`, `sound` or `fx` are `null`. A pair entry's `tire` merges field by field over the ground's tyre; when neither material has tyre data it must give every field (parse-time error otherwise). The pair table itself is keyed by the unordered pair: `'a|b'` and `'b|a'` in one table is an error.
- **[M-9]** Rapier's per-collider combine rules are set so that contacts match [M-8] without the engine having to intervene per contact. Each engine collider gets friction `√f` with `CoefficientCombineRule.Multiply` (so a contact gets the geometric mean) and restitution with `Max`.

### 3.5 Ground lookup

- **[M-10]** Terrain provides `materialAt(x, z) → materialId`. Wheel contacts, feet and particles use it. Games use it instead of their own surface tables.

### 3.6 View: material compiler

- **[M-11]** `look` compiles to one base material per shading tier. The game sets `shading: 'physical' | 'standard' | 'lambert'` (default `physical`), which gives `MeshPhysicalMaterial`, `MeshStandardMaterial` or `MeshLambertMaterial`. Optional features are compile-time defines (`COVERAGE`, `COVERAGE_INSTANCED`, `FUR`, `SUBSURFACE`, `WIND`, `PAINT`), which keeps the number of shader programs small. Lambert and standard honour `COVERAGE` and `FUR`. `SUBSURFACE` is physical and standard only. Physical-only `look` fields are ignored below `physical`. Vertex colours, when a mesh has them, replace `look.color` (D5).
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
- *Clarification (built, post-0.13):* `createWind({ base = [0, 0, 0], gust: { amp, scale = 20, period = 4 }, zones: [{ min, max, v }], seed })` from `lion-hawk/sim` gives `wind.at(p, t, out?)`: the base, plus a seeded value-noise gust along it bounded by `amp`, plus every zone box containing `p`. `createFields(world, { wind, aero, buoyancy, magnet, models })` (`models`: the sidecars to read, default `game.defs.models`) adds the World to one engine system, `lh.fields`, in `pre`, and returns `{ submerged(e), dispose() }` (the World's clear or dispose removes it).
  - **Aero** (`aero: true | { plate = 1.1, density }`, density from the `air` material): for each dynamic entity whose model's sidecar has `aero` ([A-5]), each panel facing the relative wind `u = wind - v(point)` gets `½ρ|u|²A·plate·c²` along `-n` (`c` the cosine between `-n` and the flow) plus `½ρ|u|²A·aero.skin` along the flow's tangent, at the panel centroid. A part whose collider material has `aero.airfoil` uses its planform (the largest, most upward panel): below `stall`, lift `½ρ|u|²A·cl(aoa)` across the flow and drag `cd(aoa)` along it at the part's centroid, the curves read linearly; past stall it is plates again.
  - **Buoyancy** (`buoyancy: { fluids: [{ material = 'water', level: y | (x, z, t) => y, surfaceVel?, damping = 1 }] }`): the submerged volume and its centre are `∮ min(y - h, 0) n_y dA` and its moments over the panels (exact for boxes), the force `ρ g V` up at the centre, heave damped by `damping ρ V (v_y - surfaceVel)`.
  - **Magnetism** (`magnet: { radius = 3, gain = 1, rMin = 0.1, maxForce = 1e5 }`): each collider whose material has `magnet.strength` acts on the colliders with magnet data within `radius` (from the World's entities, not a Rapier query): ferrous ones by `gain S f / r⁴` toward it, magnets by the dipole–dipole force with moments along each collider's `+y`; `r` is clamped to `rMin`, the force capped at `maxForce`, and the reaction applied to the magnet.

---

## 4. Netcode

### 4.1 Transport

- **[N-1]** Every transport implements `{ isHost, id, hostId, send(to, data, reliable), on, off, leave }`. Events: `peer`, `message`, `peerAway`, `peerBack`, `peerLeft`, `hostAway`, `hostBack`, `closed`. Transports live in `lion-hawk/net` (Node and browser, not sim-pure): `emitter`, `createMemoryHub`, `withLag` (injectable `rng`, `timer` and `now`), `parseLag`, `roomLink` (a Handshake Room as a transport; the game vendors `handshake.js`, #89) and `bridgeTransport` (a page's end of the Node bridge, [T-20]).
  - **The port.** `createPort(engine, { transport, role, key = peerKey(), clock = () => performance.now(), onWarn })` joins a transport to an engine. It issues `net.open { role, id, hostId, at, key }` (`key` as four uint32 words, [N-18]) on creation and turns transport events into `net.peer { event, id?, reason?, at }` commands ([I-7]). A message is rate-checked per peer and channel, size-checked (`net.maxJson` on `JSON.stringify`, `net.maxFrame` on bytes), then a replica frame becomes `net.frame { frame: frameToJson(f), from, at, reliable }` and a JSON or binary wire is decoded with the incoming table (`toHost` for a host, `toGuest` for a guest), schema-checked and issued as `engine.command(type, { ...data, from, at, reliable })`. Anything bad is dropped (`port.stats.dropped`, warned once per kind); a guest hears only its host. After each step (`engine.onStep`) the port drains `engine.net`: frames go as bytes, JSON is encoded with the outgoing table (a bad one is warned once and counted in `stats.unsent`), `leave()` calls `transport.leave()`. `port.close()` unsubscribes.
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
  - `F.body()`: position, rotation, linear velocity and spin, at fixed precision (position 1/64 m across, 1/256 m up). A replicated entity's kind range applies to `e.netId`, not `e.id` (D7);
  - `F.actions(map)`: an action snapshot (§5.3); `F.uint(bytes, max, min = 0)` takes a lower bound.

  The codec lives in `lion-hawk/sim`: `F`, `kind`, `createRegistry`, `encodeRecord`, `encodeFrame`, `decodeFrame`, `isFrame`, `createTracker`, `createStore`, `frameToJson` / `frameFromJson` (a decoded frame as plain JSON, for `net.frame` commands and tapes), `createInterp`, `createForecast` and `createRate` / `createWarnOnce`.
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
| `driven` | a full dynamic body, stepped by the local sim with the owner's replicated `input` | `owner` kinds with an `input` field and a `body` field (`F.body()`) |
| `proxy` | a kinematic body following snapshots interpolated about 100 ms in the past | `host` kinds |
| `view` | no body, drawing only | none (opt-in) |

  `proxy` and `view` remotes take `follow: 'interp' | 'forecast'` (default `interp`). `forecast` draws the remote at its forecast pose instead of about 100 ms in the past (D8).

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

### 4.6 Players and identity (draft 2026-10-21)

A peer is a page; a player is a person. A peer carries one or more players, one per local seat ([C-5]). Unreal equivalents: peer = `UNetConnection`, player = `APlayerState`, the roster = `PlayerArray`.

- **[N-18] Peer key.** (built, plan 3) The view makes a random key once per tab (`crypto.randomUUID()`), kept in `sessionStorage` (a reload keeps it; another tab is another peer), and sends it only to the host. It never enters the roster or a replicated field. A transport peer id may change across a reload; the key does not.
  - *Note (plan 3 final review, I1):* Chrome's "Duplicate tab" and `target=_blank` copy `sessionStorage`, so two live tabs can share a key. Games should `await claimPeerKey()` (`lion-hawk/net`) and pass the key to `createPort({ key })`: it holds a Web Lock for the page's life and, if another live tab holds it, stores and claims a fresh key (without `navigator.locks` or `crypto.subtle` it is `peerKey()`). The lock is named by a hash of the key (`lh.peer.` + the first 16 bytes of SHA-256 of `lion-hawk peer lock\0` + the key hex, as hex) and never the key itself: `navigator.locks.query()` lists lock names to every same-origin page, and a reader of them learns nothing usable. When a page takes a player over ([N-23] rulings), the old page is sent `net.refused { seat, reason: 'taken' }` per seat taken (again on its `peerBack`) and drops those seats; a waiting page hears `player.refused` `'taken'` once per wait, not once per hello.
  - *Note (plan 5):* `keyWords` errors name the input's type only (`got string`), never its value: a near-valid key is still a secret.
- **[N-19] Join.** (built, plan 3) The engine owns the join with reserved commands: a guest sends `net.hello { key, seats: [seat, ...], schema }` (the [N-6] schema hash; a mismatch is refused with reason `schema`); the host answers `net.welcome { players: [{ seat, number }] }` or, per seat, `net.refused { seat, reason }`; a seat joining or leaving later sends `net.seat { op: 'join' | 'leave', seat }`, answered by `net.welcome` or `net.refused`. The host hook `defineGame({ net: { admit({ key, seat, peer, players }) } })` returns a number, `null` (refuse, reason `full`) or `{ refuse: reason }`; the default takes the lowest free number in 2..`maxPlayers` and refuses past `maxPlayers` (default `maxSender`) or past `maxSeats` seats per peer (default 4).
- **[N-20] Numbers.** (built, plan 3) A player number (1..`maxSender`) is the player's identity on the wire and in owner kinds. The host's seat 0 is 1; a seat takes the lowest free number when it joins, so a player's number never changes while they play; a guest's seats are renumbered by `net.welcome` ([N-25]), and a page that hosts has its seat 0 renumbered to 1 (a former guest kept the room's numbers when it went solo). The host keeps `number → { peer, key, seat }` privately as `world.net.bindings` (replacing the peer-to-number `world.net.players` map). `world.net.player(peer, seat, n)` binds by hand (`player(peer, n)` is seat 0).
  - *Note (plan 3 final review):* `world.net.numbersOf(peer)` (host) is that transport peer's numbers, ascending, as a frozen array reused until they change (empty for an unknown peer, and on a guest).
- **[N-21] Roster.** (built, plan 3) `engine.players` is the roster on every peer: one entry per active or inactive number, `{ number, seat, local, away, active, ...state }`, where `state` is the `lh.player` record ([N-22]) and `local` is true for this page's seats. Events: `player.joined`, `player.left`, `player.away`, `player.back`, `player.inactive`, `player.expired`, `player.renumbered { from, to }`.
  - *Note (plan 3 final review, M4):* with `join: 'manual'` a guest's `engine.players` is empty (`lh.player` replicates only with the engine join; a manual join's host roster is host-local).
- **[N-22] Player and game state.** (built, plan 3) Two built-in host-authority kinds: `lh.player` (one record per number; Unreal `APlayerState`) and `lh.game` (one record; Unreal `AGameState`). A game extends them with `defineGame({ player: { [field]: F.* }, gameState: { [field]: F.* } })`. The host writes them; every peer reads them through `engine.players` and `engine.gameState` (`engine.state` stays the [D-4] debug state). Their fields join the `schema` hash ([N-6]). Offline, the same records exist locally, so a game reads player and game state the same way solo or online. What goes where is §5.5's state table.
  - *Note (plan 3 final review, M5):* the peer key reaches the sim in `net.open`, so it is recorded in tapes ([T-9]): keep debug tapes private (a shared tape lets its holder take over an away player). It is not redacted, since the host's replay needs it.
- **[N-23] Away, leave and rejoin.** (built, plan 3) `peerAway`/`peerBack` set and clear `away` on the peer's players and keep everything. `peerLeft` despawns the peer's owner entities (as before) and moves its players to an inactive list for `rejoinSeconds` (`defineGame({ net: { rejoinSeconds } })`, default 60). A `net.hello` whose key and seat match an inactive player gets the same number and `lh.player` record back (Unreal `FindInactivePlayer` + `OverridePlayerState`). On expiry the number is freed; reusing it starts fresh (relay clock and store entry cleared).
- **[N-24] Several numbers per peer.** (built, plan 3) `net.locals` is the set of this page's numbers; `net.self` is seat 0's number: 1 on the host, a guest's seat 0 number once that seat is confirmed, else 0. The spawn guard accepts an owner entity whose `netId` is in `net.locals`. The host accepts a guest frame only if every owner record in it belongs to a number bound to the frame's `from`. A peer sends one frame per send tick carrying every local seat's records; rate windows stay per peer ([N-3]). The host relays and clocks each record by its owner number.
- **[N-25] Going online.** (built, plan 3) When a page joins as a guest, its seats are renumbered by `net.welcome`, each controller's `player` changes, and `player.renumbered` fires per seat so the game can rekey or respawn pawns. On `closed` (going solo), local seats keep their numbers.
- **Rulings (plan 3, 2026-10-21).** The key reaches the sim in `net.open` from `createPort({ key })`, as four uint32 words, made by `crypto.randomUUID` or, off a secure context, `getRandomValues` (S4). The game state is `defineGame({ gameState })` (not `state`, which stays [D-4]), and player and game state field names may not be entity parts (N7). `net.join: 'engine' | 'manual'` defaults to `'engine'`; a manual-join game must set `join: 'manual'`. `lh.player` and `lh.game` exist and replicate only with `'engine'` (a manual join's frames are the game's alone and `engine.players` is host-local, B3). Every online `lh.seat` is numbered by the net part from the controllers and the roster together (B1); a host-assigned number that clashes with another of this page's seats moves that seat to a free number first. `net.reasons` extends the built-in reasons (`full`, `seats`, `schema`, `admit`, `busy`, `taken`); `net.refused { seat, reason }` reaches the guest's game as `player.refused`. A hello without seat 0 is refused `'seats'` (S5); a seat that joins after the hello is asked for after the welcome (S1). A guest-originated admit failure (a throwing `admit` or a broken admit contract) is refused `'admit'` and warned, and never halts the host; the host's own seats still throw, so `net.admit: player <n> is taken` throws mid-step on a local seat by design (N9). `net.seat` ops have a 0.5 s per-peer cooldown (sim time), refused `'busy'`; the guest asks again. Guest records that make game hooks (spawn, spawned, apply, the kind contract) throw are dropped with a warning once per sender and kind, on the host and on other guests, and the host never relays them. A removal of a free number in a guest frame is ignored (S2); a number given again is relayed only after its old object's removals (S3). `lh.player`'s engine fields are `seat, away, active, join`. `maxSeats` applies with a custom `admit` and to the host's seats. A hello whose key and seat match a player bound to another peer takes that player over (same number and record, `away` cleared) only while the old peer is away (`peerAway`); while the old peer is live it is refused `'taken'` and the new page's hellos keep asking (a peer that knows another's key never steals a live seat); once the old peer has left, the player is inactive and rejoins as [N-23]. A rejoin clears `away` and fires `player.joined { rejoined: true }`, not `player.back`. `net.schema` is the [N-6] hash, carried in `net.hello`. `world.net.players` is replaced by `world.net.bindings`. Solo, `net.self` is seat 0's number (1 at start, was 0) and its setter is ignored (N5). The relay is per owner number, so host-to-guest frames scale with seats (N3, accepted: batch later if rates bite).

---

## 5. Loop, scenes, input and UI

### 5.1 Loop

- **[R-1]** In the browser, the view's driver (`createDriver`, started by `boot`) runs `requestAnimationFrame` and feeds the engine its timestamp. The engine loop has no rAF of its own. Frame time is clamped to `sim.maxFrame` (default 0.25 s).
- **[R-2] Fixed steps.** The sim runs fixed steps of `1/hz` from an accumulator, at most `maxCatchUp` per frame. Leftover time beyond the cap is dropped and counted as a clamped frame.
- **[R-3]** The view draws with `alpha = acc / dt`.
- **[R-4]** Each game sets its own rate: `sim: { hz, maxCatchUp }`. Defaults are `{ hz: 60, maxCatchUp: 3 }`; a racing game may use `{ hz: 240, maxCatchUp: 12 }`. Substeps belong to kits.
- **[R-5] Hidden tab.** While the tab is hidden the loop pauses and resets its clock on return. A host keeps sending net state from a timer while hidden.
- **[R-6]** Stages run in this order:
  ```
  frame: input.poll → net.recv → [step × n] → net.send → view.sync → render → debug
  step:  input.apply → systems.pre → physics.world → systems.post → events.flush
  ```
  Systems order themselves within a stage with `before` / `after`. `engine.schedule()` returns the resolved order.
  - *Clarification (phase 3, 0.8.0; 3c):* the World adds built-in systems: `lh.world.swap` first in `input.apply` (before `lh.ui`), and `lh.physics.step`, `lh.physics.read`, `lh.physics.events` in `physics.world`.
  - `input.apply` runs `lh.ui` (hold-control progress on engine time, [U-1]), then `lh.input`, then `lh.commands` ([I-7]), then the game's systems. In `pre`, `lh.scene` steps the scenes (a loading scene's slot runs its load tick instead, [S-6]).
  - With step acks (`acks: 'steps'`, the default: headless and `?lh-test`), `engine.presented()` runs at the very start of each step, so every step counts as a presented frame. A browser boot uses frame acks ([S-6]).
  - `engine.onStep(fn)` calls `fn(engine)` after every step (after `events.flush` and the step counter) and returns an unsubscribe; listeners are copy-on-write (N-4: a port drains `engine.net` there).
  - `engine.onRender(fn)` appends a render slot and returns an unsubscribe; `engine.render(alpha)` calls every slot in registration order (removal during a render applies from the next one). `boot` keeps its own slot, so a game's `onRender` no longer silences the view halves.
- **[R-7] Manual mode.** `driver.manual(true)` (`window.engine.manual(true)` in a page; `?lh-test` sets it) stops automatic stepping; the engine itself has no manual switch. `stepN(n)`, `advance(sec)` and `render(alpha)` then drive the engine by hand. Headless runs are always manual. `driver.manual('all')` (also `?lh-test=render`, [D-1]) additionally stops automatic rendering: the tick updates devices only (no step, no render, so no frame ack), and tests call `render()` themselves.
- **[R-8] No allocation.** Nothing is allocated per step or per frame in engine code. Enforced by [T-13].

### 5.2 Scenes

- **[S-1]** A scene has a sim half and a view half, keyed by the same name:
  - **Sim half** (headless-safe): `{ enter(engine, ctx), exit(engine, ctx), step(engine, dt, ctx), ui(ui), presets }`. `ctx` is the scene instance: `name`, `id`, `args`, `state`, `system(name, fn, opts)` (removed on exit), `command(type, fn)` ([I-7]) and `load(opts)` ([S-6]).
  - **View half** (browser): `{ enter(engine, view, args), exit(engine, view), frame(engine, alpha, view) }`. `args` is the scene's args: `engine.scene.args` for the main scene, `engine.scene.overlayArgs(name)` for an overlay, read when the half enters. Treat it as read-only (#105). It builds the HUD and other DOM, and sets up camera rigs. `view` also carries `dt` (driver frame time, capped at `maxFrame`), `rawDt` (the same frame uncapped, #56; both 0 for renders the driver did not start), `wait(promise)`, `focus(testid)` ([U-1]) and `project` (the game's world-to-client projection, set by its view half; exposed as `window.engine.view.project`). `project([x, y, z])` returns `{ x, y, z, onScreen }`: client coordinates, `z` the NDC depth, and `onScreen` false when the point is behind the camera or outside the viewport (#73). A view half may also define `built(engine, view)`, called right after a load's build ([S-6]). View halves enter after the UI sync, so their scene's controls already exist, are adopted and enabled.
- **[S-2]** `engine.go(name, args)` replaces the main scene. `engine.overlay(name, args, { once })` stacks a scene on top, and `engine.close(name)` removes it. With `once: true`, the request is a no-op when the overlay is open or will be once the queued transitions apply (`isOpen(name, { pending: true })`), and a no-op is never recorded (#95). `engine.scene.overlayArgs(name)` returns the args an open overlay entered with (its `ctx.args`), or `undefined` (#105). An overlay may set `pauses: true` to freeze the sim below it while it is still drawn.
- **[S-3]** Each main scene owns a `World` and a Rapier world. Leaving the scene disposes both, plus the scene's GPU resources.
  - *Clarification (phase 3, 0.8.0; 3c, CI-16):* the World is made before the main scene's `enter` and disposed after its `exit`; overlays share the main scene's World (`ctx.world`, `engine.world`). While a scene loads (`engine.loading.active`, [S-6]) `lh.physics.step` skips the Rapier step and `read`/`events` skip with it; `lh.world.swap` still runs, so `prev` catches up. `engine.state()` carries `world` (the digest) only while the World has entities.
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
    - **The map hook (#8, #81).** `bindStick`, `bindKeyboard` and `bindGamepad` all take the option `map: { from: [nx, ny], to(x, y, out), radial = 0 }` (`bindGamepad(engine, bindings, { getGamepads, source, map })`, the same `(engine, bindings, opts)` shape as `bindKeyboard`). The device's bindings may target the virtual names `nx`, `ny` instead of actions; on every write and every `update` the device feeds its virtual pair, after a radial dead zone `radial`, to `to` with a reused `out` and writes `out`'s keys (actions) in place of the virtual names, which never reach `engine.input`. `to()` writes into the passed `out`; its return value is ignored. The device's own dead zone (the stick's `deadZone`, the pad's per-axis `deadZone`) applies **before** `map.radial`, so a radial dead zone needs the device's `deadZone: 0`. With paired actions ([I-1]) the merge across devices picks the longest vector, a tie going to the first registered source. `bindStick` returns `{ update, dispose }`; `update()` re-applies the map while a finger is down (the camera may turn under a still thumb) and is a no-op without a map.
    - **Gestures (#59).** `bindGesture(engine, el, { tap, hold: { seconds, fire }, drag, pinch, tapMove = 12, tapSeconds = 0.45, ignore, doc, now })` → `{ update(dt, raw), dispose() }` is a view-only gesture reader (no commands) with `bindPointer`'s routing. `tap(e)`; `hold.fire(e)` once per press, on the first `update` at least `hold.seconds` after the down event's `timeStamp` (read on `now()`, default `performance.now`, the same clock; an injected `now` must read the clock of `event.timeStamp`), within `tapMove` px. A lift taps when `up.timeStamp − down.timeStamp < tapSeconds`. Summed frame time is not used, so a tap stays a tap at any frame rate (#109); `uncapped` is accepted and ignored, and `now` is injectable for tests; `drag({ dx, dy, phase })` for one finger past `tapMove`; `pinch({ scale, rotate, panX, panY, phase })` for two fingers. Values are cumulative from the gesture's start; phases are `start | move | end`, with at most one `move` per `update`; a second finger ends a one-finger gesture (no tap, no hold), a lift ends either, and the payload objects are reused.
    - Fingers are tracked by `pointerId`. `pointerdown` (and `lostpointercapture`) listen on the surface element. Moves, `pointerup` and `pointercancel` are routed by `pointerId` on the window, because iOS does not reliably retarget captured moves.
    - `pointercancel` and `lostpointercapture` count as a release.
    - The root has `touch-action: none`.
- **[I-3]** On `blur` and `visibilitychange`, every held action is released.
- **[I-4]** Once per step (`input.apply`), each controller's snapshot is copied into the pawn it possesses as `e.input` ([C-3]). Systems read only `e.input`. (Rewritten 2026-10-21: the single "local player's actor" became per-controller possession.)
- **[I-5]** Game-specific interpretation (for example a point-to-go stick) is a system in `input.apply` that the game registers.
- **[I-6]** `engine.input.set(snapshot)`, `hold(snapshot)` and `release()` override device input for tests and bots.
- **[I-8] Pad edges.** `createPadEdges({ getGamepads })` (view) reads every pad on the standard mapping (`PAD_BUTTONS`) once per `update()`, without allocating: `dir` is one direction per push of the D-pad or of the left stick (a push crosses 0.5 on its main axis; the stick re-arms when both axes are under 0.3), `pressed`/`released`/`down` per button, `active` when something was pressed or pushed, and `family` of the pad in use (`familyOf`: Sony `054c` → `ps`, Valve `28de` → `deck`, Microsoft or a standard mapping → `xbox`, else `generic`).
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
  - A game's markup marked `data-lh-slot` is adopted instead of the engine creating its own element. Adoption is also late: a slot that appears after the engine made its own element (a screen a view half builds when it opens) takes over on the next sync after a `MutationObserver` saw a `data-lh-slot` element added (or that attribute change), or at once on `view.ui.adopt()`, and the engine's element is removed; without a `MutationObserver` only `adopt()` swaps. An adopted element that leaves the document is replaced on the next sync by a new slot or an engine-made element.
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
- **[U-7] Menu navigation** (#138). `bindMenuNav(engine, { doc, target, getGamepads, rectOf })` is a view device that `boot` adds after the game's devices whenever a scene declares `nav` ([U-9]); `boot(…, { nav: false })` opts out, `boot(…, { getGamepads })` injects pads. `window.engine.view.nav` is its live state `{ last, family, menu }`.
  - **The menu** is the topmost open overlay with `nav` (`topNav`); the main scene never is one. While there is a menu: the D-pad, the left stick and the arrow keys move focus one step per push (no repeat, no wrap); A and Enter activate the focused control (`click()`, which reaches `engine.ui.tap` for a registered control; a `hold` is `engine.ui.press`ed while A is held and released with it; Enter on a focused button is the browser's own click, [I-2]); B and Esc send `engine.command('lh.back')`; X, Y, View (`select`) and Start send `engine.command('lh.press', { button })` when the menu's `nav.buttons` has that button, and Start without one sends `lh.back`; LB/RB select the previous/next option of the menu's `nav.shoulders` row, else of the focused `choice` row, else of the menu's first, without wrapping, keeping focus where it is.
  - **Candidates** of a scene are its registered controls (`[data-testid^="<scene>."]` that are buttons or marked `data-lh-nav`) plus every `button` or `[data-lh-nav]` inside `[data-lh-nav-scope~="<scene>"]` (game markup outside the registry). Disabled, `aria-disabled`, `[hidden]`/`[inert]`-wrapped and zero-size elements are skipped, and so are text inputs unless marked `data-lh-nav` (pad text entry is open, §10). While the last input is a pad, the options of a menu's `nav.shoulders` row are not candidates (the shoulders step them); keys and pointers still reach them. A modal menu searches only itself; a non-modal one searches itself first, then each scene below it down to the main scene.
  - **Overrides:** `data-lh-nav-up|down|left|right="<testid>"` on a candidate sends that move to the named control; `"none"` stops it.
  - **Focus:** when a menu instance becomes the menu, focus goes to the control last focused in that instance, else `nav.initial`, else its first candidate, retried for a few frames until the control exists. Focus uses `focus({ preventScroll: true, focusVisible })` (`focusVisible` while the last input was a pad or keys) and `scrollIntoView({ block: 'nearest' })`. Focus is presentation: it is not recorded.
  - **Open triggers:** outside a menu that owns input, a pad button or key named by some scene's `nav.open` is timed on the uncapped frame time (`raw`, #56, so slow frames do not stretch a hold): a tap opens a `seconds: 0` menu on the press, or on the release when a hold menu shares the source and was not reached; a hold opens its menu once `seconds` are reached. The view sends `engine.command('lh.open', { name })`.
  - **Input device:** `<html data-lh-input="pad|keys|pointer|touch">` follows the last device (a pad button or a stick push, a key, a mouse or touch/pen pointerdown) and `data-lh-pad="xbox|ps|deck|generic"` the family of the pad last used ([I-8]).
- **[U-8] Scorer.** `pickNeighbour(from, dir, rects)` (`lion-hawk/sim`) is pure: `from` a rect or an index into `rects` (skipped), rects `{ x, y, w, h }`, `dir` one of `NAV_DIRS`. A candidate counts when its centre is past `from`'s centre and it reaches beyond `from`'s far edge. Candidates that overlap `from` on the cross axis win over those that don't; one that doesn't must lie in the 45° cone (`crossGap <= gap`). Within a class the lowest `gap + 2·crossGap + 0.1·|centre offset|` wins, ties to the lower index. It returns `-1` when nothing qualifies.
- **[U-9] Menu options.** A scene may declare `nav: { modal = false, initial, back, input = 'menu', open, shoulders, buttons }`, checked by `defineGame`:
  - `initial`: the test id focused first ([U-7]).
  - `back`: an action name (pressed for the next step) or `(engine, ctx) => void`. The built-in `lh.back` handler runs the topmost menu's `back`; a menu without one ignores Back.
  - `input`: `'menu'` gates the game's devices while this menu is the menu: `engine.input` ignores device layers and drops their owed taps (`set`/`hold`, and so UI actions and tests, still apply; `engine.input.gated` reads it), and when the gate lifts a button a device still holds stays off until every device has let go. `'shared'` leaves the devices live; the navigator then moves only with the D-pad and the arrow keys.
  - `open: { button, key, seconds = 0, when }`: how the menu is summoned from gameplay ([U-7]); `button` is a standard-mapping name (`NAV_OPEN_BUTTONS`), `key` a key name, `when(engine)` a gate. The built-in `lh.open { name }` handler opens it (`{ once: true }`) when it has `nav.open`, `when` allows it, and no menu that owns input is open.
  - `shoulders`: the id of one of the scene's `choice` controls (`'mode'` for `<scene>.mode.*`): LB/RB step it from anywhere in the menu, and the pad does not focus it ([U-7]). A tab row's shape.
  - `buttons: { x, y, select, start }` (`NAV_PRESS_BUTTONS`): per pad button, an action name or `(engine, ctx) => void` like `back`, run by the built-in `lh.press { button }` handler for the topmost menu; a button the menu does not list does nothing (Start: Back).
  - `lh.back`, `lh.press` and `lh.open` are ordinary commands: recorded and replayable ([T-9]), and they run behind a pausing overlay (built-ins always run).
- **[U-10] Glyphs.** `lion-hawk/kits/glyphs/view`: `glyphFor(role, family)` returns an SVG data URI or `null`; roles `confirm`, `back`, `menu` (Start), `move`, `prev`, `next` (LB/RB), `view` (Xbox View, PlayStation Create, Steam Deck View, a generic square); families `xbox`, `ps`, `deck`, `generic`, `keys`, `pointer`, `touch` (pointer and touch have only `confirm`; keys have no `prev`/`next`/`view`). `bindGlyphs(engine, { doc })` is a view device that keeps every `[data-lh-glyph="<role>"]` element on the family of `<html data-lh-input>`/`data-lh-pad` (`familyFor`): an `<img>` gets `src`, any other element the CSS variable `--lh-glyph: url(…)`; a role the family lacks hides the element. Icons are Kenney Input Prompts 1.5A (CC0), regenerated by `tools/glyphs/build.mjs`.

---

### 5.5 Players, controllers and seats (draft 2026-10-21)

Follows Unreal's player model (docs/research-players.md §6): a **seat** (local player, view, `ULocalPlayer`) holds devices and drives a **controller** (sim, owning page only, `APlayerController`), which possesses a **pawn** (`APawn`); the person is a **player** ([N-20]–[N-22], `APlayerState`). Native browser objects are exposed as they are.

Where state goes:

| Home | Unreal | Who has it | Examples |
|---|---|---|---|
| game rules | `AGameMode` | host only, never replicated | `admit`, spawning, scoring rules |
| game state, `lh.game` | `AGameState` | every peer, from the host | phase, clocks, round, shared world progress |
| player state, `lh.player` | `APlayerState` | every peer, from the host | name, colour, score, ready, lap times |
| controller and seat | `APlayerController`, `ULocalPlayer`, save data | owning page only | input, devices, bindings, camera, haptics |
| pawn | `APawn` | every peer | pose, speed, damage: lost with the pawn |

**Controllers (sim).**
- **[C-1] Controllers.** (built, plan 1) `engine.controllers` lists this page's controllers: one per seat, in seat order, plus bots. A controller is `{ seat, player, input, pawn, bot, possess(e), unpossess() }`; `input` has the full `engine.input` surface (`snapshot`, `set`, `hold`, `release`, `device`, `clearDevice`, `gate`) over the game's one action schema. `engine.input` is seat 0's controller's input, so single-seat games are unchanged. `engine.controllerOf(seat)` returns the seat's controller or `undefined`. Seats leave only with the `lh.seat` command; `dispose()` is for bots and throws on a seated controller.
- **[C-2] Possession.** (built, plan 1) `possess(e)` makes `e` the controller's pawn; a pawn has at most one controller, so possessing a held pawn takes it from the other (events `controller.possess` and `controller.unpossess` with `{ controller, seat, player, pawn }`, `pawn` the entity id; `controller` is the controller's own id, 1, 2, ... in creation order; unpossess adds `reason`: `'unpossess' | 'taken' | 'despawned' | 'left' | 'remote'`, `'remote'` when the pawn becomes a replica another peer simulates). A removed pawn clears `pawn` and fires `controller.unpossess`. Possession happens in the sim (a system, a command handler, a scene's enter).
- **[C-3] Input copy.** (built, plan 1) In `input.apply` each controller copies its snapshot into its pawn's `e.input` ([I-4]); a controller with no pawn copies nothing. A pawn possessed mid-step is filled at once. A released pawn's net-made input object is zeroed in place (axes 0, buttons false). An owner pawn's `e.input` is what [N-13] sends.
- **[C-4] Bots.** (built, plan 1) `engine.controller({ bot: true })` makes a controller with no seat or devices (Unreal `AAIController`), driven by `set`/`hold` ([I-6]) or a policy writing its input each step. A bot has player number 0 and is not in the roster. Menu gating ([U-9]) applies to every controller.

**Seats and devices (view).**
- **[C-5] Seats.** (built, plan 2) `view.seats({ max = 4, join, contexts })` turns on seat management (`contexts`, names or `[name, priority]`, start on every seat); without it the page has one seat holding every device (today's behaviour). `view.localPlayers` lists the seats: `{ seat, controller, pending, devices, pad, pads, lost, contexts, bindings }` (`pending` is true until the seat's controller exists). Joining or leaving a seat is the sim command `lh.seat { op: 'join' | 'leave', seat }` (recorded, [T-9]); online it waits for the host's number ([N-19]) (online route built, plan 3).
- **[C-6] Devices.** (built, plan 2) A device is `{ kind: 'pad', index, id, mapping }`, `{ kind: 'keys', scheme }`, `{ kind: 'touch' }` or a game's own kind registered with `view.device(kind, { read })` (for WebHID and the like). Each device is its own input source on its seat; sources merge as [I-1] describes.
- **[C-7] Native pads.** (built, plan 2) `lp.pads` is every live pad the seat holds and `lp.pad` the one it used last, each the live `Gamepad` from `getGamepads()[index]`, refreshed every frame (Chromium returns snapshots). A lost pad is omitted from `lp.pads`; `lp.pad` is `null` only when no live pad remains. `view.gamepad(dev)` is the live `Gamepad` of any pad device, paired or not (`null` when lost).
- **[C-8] Pairing.** (built, plan 2) `join(dev)` runs on a device's first press and returns a seat number (add to it), `'new'` (open a seat) or `null` (ignore); the default puts a pad on seat 0 while seat 0 holds no pad, else answers `'new'` until `max`, then `null`. Keyboard and touch start on seat 0. `lp.claim(dev)` and `lp.release(dev)` move devices by hand. Buttons held when a pad is paired are masked until let go; axes are not.
- **[C-9] Loss and regain.** (built, plan 2) Pads are polled: an empty slot, `connected: false` or another `id` at the index is a loss. The seat keeps its controller and player and `lp.lost` is true while any device is lost. The next unpaired pad with the same `id` that presses a button returns to that seat; otherwise a press fills the seat whose device was lost first before `join` runs. Seat events go to the view-only emitter `view.onSeat(fn)` (not `engine.events`): `seat.joined`, `seat.left`, `seat.device`, `seat.lost`, `seat.regained`, each `{ type, seat, device }`, and `seat.seen { device }` the first time a pad index and `id` appear (for a one-time reset such as haptics).
  - *Note (plan 2 final review, parked):* `seat.seen` is once per pad index and `id` for the page's life, so a pad that comes back to a lost seat emits `seat.regained`, not `seat.seen`; a game that wants a reset on every replug listens to `seat.regained` too.

**Bindings (view, Unreal Enhanced Input).**
- **[C-10] Mapping contexts.** (built, plan 2) `context(name, { pads: [{ match(pad), bindings, map, mappable }], keys: { [scheme]: { bindings, ramps, map, mappable } }, touch: engine => devices })` declares default bindings per device in the view half; `bindings` is exactly `bindGamepad`'s or `bindKeyboard`'s object. `pads` entries are tried in order, so a game lists its rigs by `id` before the standard mapping. A pad no entry matches is ignored (the bench shows its raw channels). `map` is as in [I-2]. Only the top context that declares `touch` binds touch.
- **[C-11] Context stack.** (built, plan 2) Each seat has its own stack: `lp.contexts.add(name, priority = 0)` and `remove(name)`. A higher priority context's binding wins for the same device input.
- **[C-12] Player-mappable bindings.** (built, plan 2) A context entry's `mappable: { [name]: defaultInput }` lists the bindings a player can change; the name is its save key (Unreal Player Mappable Key Settings). `defaultInput` is `'button:6'` or `'axis:2'` on a pad and a key on a keyboard.
- **[C-13] Profiles.** (built, plan 2) `lp.bindings` is the seat's overrides (Unreal Enhanced Input User Settings): `profile` (a name, default "Player N"), `map(name, device, input)`, `reset(name?)`, `capture()` (resolves with the next button or axis this seat's devices produce, for remap screens). Overrides are stored per profile and per device `id` in `localStorage` (`lh.bindings.<game>.<profile>`), read and written in try/catch. Bindings are view-only: no commands, not in tapes.
- **Rulings (plan 2, 2026-10-21).** Context entries are `pads: [{ match, bindings, map, mappable }]` and `keys: { [scheme]: { bindings, ramps, map, mappable } }`, where `bindings` is exactly `bindGamepad`'s or `bindKeyboard`'s object, and `touch: engine => devices`. `mappable` is `{ [name]: defaultInput }`; inputs are `'button:<i>'` / `'axis:<i>'` on a pad and the lower-case key on a keyboard; `map()` moves a binding within its kind and replaces what the target input held. Only the highest context with `touch` binds touch. The default `join` gives a pad seat 0 while seat 0 holds no pad, then `'new'`. Every keyboard scheme and the touch device start on seat 0; a released scheme joins on its next key; touch moves only by `claim`. Pads are polled: an empty slot, `connected: false` or another `id` at the index is a loss; "oldest" for regain is the device lost first. A pad's buttons held when it is paired (join, regain, claim) are masked until let go; axes are not. A pending seat binds the frame after `engine.controllerOf(seat)` returns its controller. Seat events go to `view.onSeat(fn)` (which returns its off function; a scene that registers in `enter` calls it in `exit`), never `engine.events`; `seat.device` carries `op: 'add' | 'remove'`, `seat.joined` and `seat.left` carry `device: null`. `view.unpaired()` lists devices no seat holds. `boot({ storage })` injects the profile store (`null` turns saving off; the default is `window.localStorage`). Offline `lh.seat` takes effect at the next step (commands deliver only in `lh.commands`). A game kind's `read()` that throws is reported once, its paired units' input is cleared each failing frame, and they are not marked lost. `capture()` answers with pad and keyboard inputs only; a game kind binds its own values. An axis edge is a move of more than `JOIN_AXIS` (0.5) from the axis's anchor that is not a move back toward centre (`|v − anchor| > 0.5 && !(v·anchor ≥ 0 && |v| < |anchor|)`, plan 4): it anchors at its first reading (an axis that appears later, at its first) and wherever it has been still (under 0.02 per poll) for 10 polls, never on a first non-zero reading. An axis that reads exactly 0 until touched (a d-pad on axes, Firefox) presses on its first push, and letting a held axis go is never a press. A trigger first seen held at +1 and then released to −1 counts as an edge, because the move crosses centre. Two consequences are accepted: a pedal resting at −1 presses only once it passes centre, and an axis pushed again within 10 polls of releasing a long hold is not a press. The first `view.seats()` call leaves seat 0 only its last-used pad (else its first); every other pad is released, its input cleared, and joins through `join` on its next press. With a custom `join`, a lost seat is regained directly only by a device with the same `id`; another `id` goes through `join` (the default `join` keeps the oldest-loss rule). Adding or removing a context drops held keys and touch (S1).

**Haptics (view).**
- **[C-14] Haptics.** (built, plan 4) Games call `lp.pad.vibrationActuator.playEffect(...)` and `reset()` themselves, after checking `effects`. The engine only stops rumble it would otherwise leave running: on page hide, blur or a pausing overlay, each affected seat's pads get a zero effect plus `reset()` every frame for 20 frames (a zero `trigger-rumble` on a pad whose `effects` lists it, so a trigger effect sent a frame earlier is cleared too; otherwise a zero `dual-rumble`); a pad seen for the first time gets the same stop once (a zero effect plus `reset()`, so a refresh does not leave the previous page's rumble running). Limits: the bench code ships inline in every bundle and is evaluated only behind `?debug=pads`; a pause stops pad rumble for its first 20 frames, so a pause menu's own rumble is cancelled in that window and can start after it. `defineView({ haptics: { autoStop: false } })` turns this off. A game must stop sending rumble while a pausing overlay is open (`view.haptics.paused`); the engine's pause stop runs 20 frames and a game that keeps re-sending would rumble under the menu. `view.haptics.stop(reason)` is the engine's stop for game moments like menus, a finish or a scene exit. Rumble for a remote player is the game's own command to that player's page.
- **Rulings (plan 4, 2026-10-21).** A stop is a zero effect then `reset()`: `playEffect('trigger-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0, leftTrigger: 0, rightTrigger: 0 })` on a pad whose `effects` lists `trigger-rumble`, else `playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 })`. The pad bench's own stops use the same zero effect. It is sent at once (on `blur`, `pagehide`, a `visibilitychange` to hidden, or the frame a pausing overlay opens) and on each of the next 19 driver frames, 20 rounds in all; a new trigger restarts the count. Hide, blur and pause are page-wide, so every seat is affected; the stops go to every connected pad the seats module knows, seated (`lp.pads`, live pads only) or unpaired. While the page is hidden the driver does not tick, so the remaining rounds run on the frames after it returns. A pausing overlay (any open overlay whose scene has `pauses`) stops once as it opens, not while it stays open, but that stop runs 20 rounds (about 1/3 s): a game's rumble in the 20 frames after a pausing overlay opens is cancelled by design, so a pause menu's own rumble is heard only after its first 20 frames. A game that keeps sending effects after a blur overrides the stop on its next frame. The first-sight stop follows `seat.seen` (once per index and `id` for the page's life) and is a full stop round (zero effect plus `reset()`), clearing what a previous page left playing. Actuators without `playEffect`, and calls that throw or reject, are skipped silently. `defineView({ haptics })` accepts only `{ autoStop: boolean }`; with `autoStop: false` boot builds no haptics device at all.

---

## 6. Models and the bake

### 6.1 Bake: `lion-hawk bake`

- **[A-1]** Input is `assets/models/*.glb`. Output goes to the game's `baked/` directory, which is committed: optimised GLBs in `baked/models/`, optional `<model>.anim.json` tables beside them, one `baked/phys.json` holding every model's sidecar keyed by model id (the sim imports it as JSON), and `baked/manifest.json` (D1, D2).
  - *Clarification (phase 3, 0.8.0; 3d C5, C8):* each model may map its own source `file`; output GLBs are self-contained. Re-bakes are byte-identical (sorted keys, 6-decimal rounding, no timestamps). `bake --check` reports stale sources, a changed registry hash or a changed engine major.minor. *(0.11.2)* It also reports a model whose bake options in `game.config.js` changed: `manifest.json` records a hash of each model's resolved options plus the global `rename`, `palette`, `paint.base` and `optimise`.
- **[A-2] Checks.** The bake fails, naming the model and node, if:
  - a material name is neither in the registry nor `paint-*`;
  - a `col-*` node has an unsupported shape;
  - a socket required by the game config is missing.
- **[A-3]** Optimisation uses gltf-transform: meshopt geometry, KTX2 or WebP textures, prune and dedupe. Settings are per game, with engine defaults.
  - *Clarification (built, post-0.13):* textures are compressed only when `game.config.js` sets `bake.textures: { format: 'webp' | 'ktx2', quality?, resize?, mode? }`, after prune, so only the textures a model ships are encoded (`palette: 'vertex'` removes them unless `keepTextures`). `webp` uses sharp (`EXT_texture_webp`, which three's `GLTFLoader` reads). `ktx2` runs `toktx` from KTX-Software, which must be on `PATH` (`mode: 'etc1s'`, the default, or `'uastc'`; colour slots sRGB, data slots linear; `KHR_texture_basisu`); the page then needs the optional KTX2 loader ([A-9]). `resize` is `[w, h]` or a `*-pot` preset. The setting is in the bake options hash only when set, so bakes without it stay current.
- **[A-4] Paint materials.** `paint-*` materials map to a base material, `steel` by default, overridable per game. At runtime their colour comes from per-instance colours.

### 6.2 Physics sidecar

- **[A-5]** A sidecar holds:
  - colliders: shape, transform in body space, part name, material ID;
  - mass properties from volume × density;
  - sockets;
  - aero panels and the closed volume (from phase 8).
    - *Clarification (built, post-0.13):* opt-in per model, `bake.models.<id>.aero: true`, so other sidecars and their option hashes are unchanged. `sidecar.aero = { panels: [{ part, a, n, c }], volume, centroid }` in body space: each part's triangles are bucketed by the nearest of 26 directions, a panel being the bucket's area, area-weighted unit normal and centroid; the volume and its centroid come from the divergence theorem (right for closed, outward-wound meshes). The fields that read them are [M-14]–[M-18].

  All of a game's sidecars live in `baked/phys.json`, `{ v, engine, materials: <registry hash>, models: { <id>: sidecar } }` (D2).
  *Clarification (phase 3, 0.7.4; 3b):* `<registry hash>` is the [M-3] hash (ids, order, effective `phys`, pair friction/restitution). `validatePhys` checks shape and material existence only; comparing the hash is the caller's job (`checks.materials`, `bake --check`), so a stale bake reads as stale, not malformed.
- **[A-6] Collider rules:**
  - Nodes named `col-box`, `col-sphere`, `col-capsule`, `col-cylinder`, `col-hull` or `col-mesh` are colliders. They are hidden at runtime and take the material of their nearest ancestor part (its largest-area material); a node's `extras.material` overrides it (D2).
  - A model with no `col-*` nodes gets one convex hull per material part.
  - Models marked `static` in the game config default to `col-mesh`.
  - *Clarification (phase 3, 0.8.0; 3d C1, C4, C7):* a capsule or cylinder's axis is the round cross-section's normal (ties go to the longest extent). The default hull is skipped, with a warning, for a flat (part, material) group; a model whose groups are all flat fails, and `colliders: false` per model turns colliders off. Hull and mesh points are in body space with identity `p`/`q`.
  - *Clarification (phase 3, 0.7.4; 3b contract issue 2):* baked and inline colliders share one entry shape. The shapes are `box`, `sphere`, `capsule`, `cylinder`, `hull`, `mesh`; `'ball'` throws `unknown shape (use 'sphere')`. Unknown fields and `paint-*` materials are errors.
  - *Clarification (phase 3, 0.7.4; 3b contract issue 8; 3c-R5):* a `box` may carry `round`, any finite number > 0 with no upper bound. It builds Rapier's roundCuboid, which adds the radius outside `half`. Other shapes reject `round`.
- **[A-7]** Empty nodes named `sock-*` become named sockets.
  - *Clarification (phase 3, 0.8.0; 3d C3, C6):* a socket with no ancestor part has `part: null`. Part and socket names are sanitised as `GLTFLoader` does (`.`, `:`, `/`, `[`, `]` dropped, spaces to `_`) and de-duplicated with `-2`, `-3` against every node and the scene, and the GLB node is renamed to match.
- **[A-8]** The sim reads only sidecars. It never parses glTF.

### 6.3 Runtime loading (view)

- **[A-9]** There is one shared `GLTFLoader` with the meshopt decoder. KTX2 and Draco are optional: the game passes configured `KTX2Loader` / `DRACOLoader` instances (`sharedLoader({ ktx2, draco, renderer })`), so the engine bundles neither. Each URL is loaded once and cached as `Map<url, Promise>`. Instances are clones; skinned meshes use `SkeletonUtils.clone`.
- **[A-10]** `engine.assets.preload(keys)` loads the models, compiles their materials and ends by warming them ([M-12]). It does not touch a scene: a loading scene ([S-6]) awaits it.
  - *Clarification (0.11.2):* `preload(keys, { instanced: [keys] })` names the models drawn `instanced` (or by `createCrowd`). Their instanced variants are made before warm, painted parts as instance-colour users, so the first spawn compiles nothing. With shadows on, warm also compiles the shadow pass's depth programs.
- **[A-11]** Animation uses `AnimationMixer`. A model may opt into baked animation tables (`bake: { animTable: true }`) for large instanced crowds.

---

## 7. Tooling and testing

### 7.1 CLI: `lion-hawk`

| Command | Does |
|---|---|
| `lion-hawk dev` | esbuild watch + live reload server; rebakes changed models |
| `lion-hawk bake` | §6 |
| `lion-hawk build [--mode single\|shared]` | bundles the game, writes `--out` (else `$<outEnv>`, else `build.out`, default `build/` in the game dir), stamps the PWA |
| `lion-hawk test [--visual]` | `node --test` for the game + engine checks; `--visual` adds `@visual` Playwright tests |
| `lion-hawk release` | bump version → bake → build → test → commit; push stays manual |

- *Clarification (built, post-0.13):* `lion-hawk test [--game] [--visual]` runs `node --test` over the game's `test.dir` (default `test`) and, when `game.config.js` names `test.game` (the module whose default export is the game), a generated file with the engine checks: `determinism`, `materials`, `simPurity` over `test.roots` when given, and `zeroAlloc` with `test.zeroAlloc: true`. Tests whose names contain `@visual` are skipped unless `--visual` (`$LH_VISUAL` is `1` then). `lion-hawk release [--game] [--bump patch|minor|major] [--out]` needs a clean git tree; it bumps `package.json`, bakes, builds and tests, then commits `release: <id> <version>`. A failing step restores `package.json` and commits nothing. It never pushes or tags.
- **[B-1]** The CLI is Node only; it replaces `build.py`, `bake.mjs` and `dev.mjs`.
- **[B-2]** Game-specific build steps (for example embedding generated audio) are hooks declared in `game.config.js`.
- **[B-3] Single mode** (the default) produces one HTML file plus `assets/models/*.glb` and `*.anim.json` beside it. The service worker precaches all of them. Sidecars and code stay inside the page: the build writes the bundle at the template's bare `<!--APP-->` marker as an inline `<script type="module">` (D1).
- **[B-4] Shared mode** (phase 9) serves the engine, three.js, Rapier and shared models from one versioned pack that several games share.
  - *Clarification (built, post-0.13: the engine side):* `lion-hawk build --mode shared` keeps `lion-hawk/*`, `three`, `three/*` and `@dimforge/rapier3d-compat` out of the game's bundle and writes a `<script type="importmap">` into `<head>` that maps each one the game (or the engine) imports to the pack. The pack, by default `<out>/../lion-hawk/<engine version>/` and mapped at `../lion-hawk/<version>/` relative to the page (`build.shared: { dir, base }`), holds every lion-hawk browser entry (`sim`, `view`, `net`, each kit's sim and view) built in one call with code splitting, so they share one engine core, plus three, each three subpath and Rapier, one file each. File names carry content hashes, so a second game reuses the same files and adds none. Each game's own service worker precaches every pack file its build wrote or reused (the lion-hawk entries and chunks, and the three and Rapier files it needs), and `build()` returns them as `shared: { dir, base, files, imports }`. Not built yet: one service worker across the games and a shared model pack.
- **[B-5]** Every build stamps the game version, the engine version and a content hash into the page and the service worker.
  - *Clarification (phase 3, 0.8.0; 3d C8):* the page gets a `lion-hawk-build` meta; the service worker's `__VERSION__` becomes `<gameVersion>+lh<engine>-<hash>` and its `__PRECACHE__` the file list. `--e2e` builds are unminified and write no `sw.js`. `build({ game, out, e2e })` from `lion-hawk/build` returns `{ out, version, hash, files, sizes }`, plus `shared` in shared mode ([B-4]). `lion-hawk dev` also takes `--host` (default `0.0.0.0`).

### 7.2 PWA

- **[P-1]** One service-worker template:
  - caches are versioned;
  - old caches are deleted on `activate`;
  - game files are served cache-first.
- **[P-2]** No `skipWaiting` while a session is running. When an update is waiting, the engine shows a "new version ready" message.
- **[P-3]** The manifest is generated from `game.config.js`: name, colours, icon.
  - *Clarification (built, post-0.13):* `build.manifest: { name, shortName?, themeColor?, backgroundColor?, icon?, display = 'fullscreen', orientation? }` makes the build write `manifest.webmanifest` (`start_url` and `scope` `./`; `short_name` defaults to `name`; the icon, a path from the game dir, is copied beside it with its MIME type, svg, png, webp or jpeg). The page gets `<link rel="manifest">` and a `theme-color` meta unless the template has them; the manifest and icon are in the content hash and the precache. A `pwa/manifest.webmanifest` beside `build.manifest` is an error. Without `build.manifest` the pwa directory's files are copied as before.

### 7.3 Debug

- **[D-1]** `flags` parses the URL once into a frozen object. Recognised flags: `?debug` (`?debug=<topics>`, comma-separated, lists its topics in `flags.debugs`; `?debug=pads` opens the pad bench, [D-7]), `?tune`, `?fps`, `?seed=`, `?replay=` (`?replay=session`, [D-4]), `?lh-record` (with `?lh-test`: record the tape), `?slow=`, `?nosw`, `?mute`, `?lh-test`. `?lh-test=render` (`flags.lhRender`) additionally boots in full-manual mode: nothing renders until a test calls `render()` (#47).
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
  - **scenes:** `scene`, `go`, `overlay(name, args, opts)`, `close`, `jump`, `isOpen(name, { pending })`, `on(...)`;
  - **commands and loading:** `command(type, data)`, `commands` (the live `engine.commands`: `pending`, `dropped`, `handles`), `loading` (the live `engine.loading`);
  - **events:** `events.since(seq)`;
  - **state:** `state`, `query`, `snapshot`, `restore`, `checksum`;
    - *Clarification (built, post-0.13):* `query(name, where)` matches a tag or a net kind (`null`: every entity) and a `where` partial object or predicate, and returns JSON-safe summaries `{ id, tags, net?, netId?, p?, q?, ...primitive fields }`. `checksum()` is the [T-7] checksum of `state()`. `snapshot()` needs a recording page, `?lh-test&lh-record`, and returns `{ v: 1, step, checksum, tape }` like `h.snapshot()`. `restore(snap)` stores it in `sessionStorage` (`lh-replay`) and reloads with `?replay=session`; boot then starts from the tape, replays it before the first frame and reports a checksum mismatch in `errors`. A replay is used once. `policies` is `game.policies`.
  - **input:** `input.set/hold/release/read`; `ui.enabled/tryTap/tap/press/release`;
  - **settling:** `settled()`;
  - **view:** `view.project` (set by the game's view half; world targets call it), `ui.tree()`;
  - **other:** `rng(name)`, `policies`, and the game's `debug()` extras.
- **[D-5]** A game's debug helpers come from its definition (`game.debug(engine)`) and drive `window.engine`. The engine adds no per-game window globals.
- **[D-6]** `settled()` is true when:
  - no asset, font or shader loads are pending (including promises handed to `view.wait`);
  - no scene load is active (`engine.loading.active`, [S-6]);
  - no element has `data-lh-state="opening|closing"`;
  - no scene transition is running.

  `?lh-test` turns off CSS transitions and starts in manual mode.
- **[D-7] Pad bench.** (built, plan 4) `?debug=pads` opens an overlay showing each seat (player number, profile, devices with `id`, `mapping` and lost state, active contexts), each pad's live buttons and axes with peaks and press counts, stick range and drift, update rate and `effects`, haptics tests (trigger and body effects, patterns, live trigger-pull taps, a self-test that reports a `playEffect` that never settles) and a log of seat events and haptics calls. It reads view state only and never changes seats or bindings. Rulings (plan 4): with `'pads'` in `flags.debugs`, boot adds one driver device after the menu navigator (which follows the game's devices) and loads `src/view/bench/pads.js` with a dynamic `import()` (bundled inline, evaluated only behind the flag); without it nothing is added. The bench gets a read-only view (`localPlayers`, `unpaired()`, `gamepad(dev)`, `onSeat`) and the engine's haptics stops for its log; it never calls a seat's `claim`, `release`, `leave`, `contexts` or `bindings` methods, and issues no command. Seat lines read `P<player> · seat <n> · profile "<name>" · contexts [<names>]`, with `pending`, `leaving` and `a device is lost` when they apply. Presses count down edges; peaks and axis min/max (from 0) are for the page's life; the update rate counts `timestamp` changes in the last second; rest drift is the stick's radius after 30 polls without a move over 0.01, while under 0.3; the stick outline keeps the furthest reach over 0.3 in each of 36 sectors. Live trigger taps last at least 50 ms, come every max(interval, length + 20) ms, scale by `v^curve` and are full strength past 95% pull; body coupling refreshes a 120 ms `dual-rumble` every 50 ms. The watchdog reports a `playEffect` unanswered after duration + delay + 1500 ms. The bench code ships inline in every bundle (the build inlines the `import()`), but is evaluated only behind the flag: no listener, device or element exists without it, though the bytes are not free. Starting a pattern cancels the pending steps of the one running; a `play()` watchdog that fires after the bench closes logs nothing.

### 7.4 Headless helpers: `lion-hawk/test`

These run under `node:test`.

- **[T-1] Setup.** `headless(game, { seed, scene, args, clock: 'virtual', invariants, record: 'on-fail' })` returns a handle `h`. The `finite()` invariant (no NaN or Infinity in any `xf` or body) is always on. Until the `World` exists, `invariants.finite(select, label)` checks any selected value (#64).
  - *Clarification (built, post-0.13):* `clock` accepts only `'virtual'` (the default: steps set the wall). `record: 'on-fail'` records like `record: true`; under `node --test`, when a test fails or leaves an unexpected warning ([T-8]), the tapes of the on-fail handles made during it are written to `$LH_TAPES` (default `test-results/tapes/`) as `<test>.<game>.<n>.tape.json`, and each path is printed as a test diagnostic. `replay(game, JSON.parse(text))` runs one.
  - *Clarification (phase 3, 0.8.0; 3c):* the always-on `finite` check runs after every headless step over the pose pool and every body's linear and angular velocity. The handle gives World access: `h.world`, `h.find`, `h.one`, `h.get`, `h.spawn`, `h.despawn`, `h.place`.
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
  - *Clarification (built, post-0.13):* `since` defaults to 0 and `match` is a partial object (`===` per key) or a predicate; `toInclude` returns the event. `.toBeSequence([type | [type, match], ...])` wants the entries in that order, with other events allowed between them. Failures list the events seen.
- **[T-5] World access.**
  - `h.find(kind | tag, where)`, `h.one(...)` (throws unless exactly one match), `h.get(id)`.
  - `h.place(e, opts)`, `h.spawn(desc)`, `h.despawn(e)`.
  - `h.go`, `h.overlay`, `h.jump`.
  - `h.tap(testid)` taps a registered UI control. It fails if the control is not present, or its `when` is false.
  - `h.fill(testid, value)` sets a `field` control. It fails if the control is not a field, or its `when` is false.
  - `h.command(type, data)` issues a command; it throws if no handler (game-wide or in an open scene) handles the type. `h.enabled(id)` and `h.tryTap(id)` are the non-throwing queries ([U-1]). `h.press(id)` and `h.unpress(id)` hold and release a `ui.hold` control.
  - `h.debug` is the game's `debug(engine)` extras, made once per handle (#70).
  - `h.untilLoaded(opts)` steps until `engine.loading.active` is false. When commands are pending at the call, it first takes the step that delivers them, since one of them may start a load (#100). Commands that the stepped systems issue do not hold it. That step is mandatory: with commands pending, `untilLoaded({ maxSteps: 0 })` throws.
  - `stripComments(src)` (the function the purity scan uses: string-aware, line comments removed, block comments blanked keeping newlines) is exported for games' own source scans.
- **[T-6] Fixtures.** `fixtures.define(name, (h, ...args) => ...)` and `h.use('quietYard', 'warm:60', ['ahead', e])`. The built-in `warm:N` steps N times with `policy.still`.
  - *Clarification (built, post-0.13):* a spec is a name, `'name:arg'` (one string argument) or `[name, ...args]`, run in order; `h.use` returns `h`. Names are non-empty and have no `:`; defining a name twice (or `warm`) throws, and so does using an unknown one. `fixtures.has(name)` checks the per-process registry.
- **[T-7] State.** `h.snapshot()`, `h.restore(snap)`, `h.fork()`, `h.checksum({ parts: 'sim' })`, `diff(a, b, { tol })`, and golden files with `--bless`. `golden(file, value, { exact: true })` stores unrounded values (#68; a stored golden's mode must match the call's); `assertFinite` walks Maps, Sets, typed arrays and cycles.
  - *Clarification (built, post-0.13):* snapshots are built on the tape ([T-9]), so `snapshot`, `restore` and `fork` need `headless(game, { record: true })`. `h.snapshot()` is plain JSON `{ v: 1, step, checksum, tape }`. `h.restore(snap)` rebuilds the handle's engine from the tape's start and replays it, in place (the same `h`; its event log, policy scratch and `debug` are the replayed ones). `h.fork()` replays the tape into a new recording handle. Both throw when the replayed checksum differs from the snapshot's, which means something changed outside the tape (a test writing to an entity, `engine.stepN` called directly). `checksum({ parts })` accepts only `'sim'`, the default.
- **[T-8] Spies and logs.** `h.spy(obj, method)` returns `{ calls, count }`. Warnings and errors are captured, and fail the test unless it calls `h.expectWarning(re)`.
  - *Clarification (built, post-0.13):* `h.spy` also returns `restore()`. `console.warn` and `console.error` calls made during a handle's own calls (`step`, `until`, `command`, `tap` and the rest) go to `h.warnings` (`{ level, text, expected }`) instead of the console. Under `node --test`, a test that leaves one unexpected fails after it ends; run directly with `node`, nothing fails. `h.expectWarning(re)` marks the first unexpected match and returns its text, or throws. A test that replaced `console.warn` / `console.error` itself still gets the call, and the warning counts as expected. A call of one handle inside another's (as `h.fork()` replays) records only in the inner handle, and a fork drops the warnings its replay repeats. Warnings printed outside a handle call (a port's transport callback between steps) are not captured.
- **[T-9] Record and replay.** `headless(game, { record: true })` records what comes from outside the sim; `h.tape()` returns `{ v: 1, game, seed, scene, args, hz, wall0, log, end, sums }` (`replay` starts its virtual wall from `wall0`, default 0, [N-4]). Every engine calls the game's `reset()` first ([G-1] contract), so module tunables are back at their shipped values before a replay (#108).
  - `log` is `[{ step, ops?, input? }]`. `ops` are the external operations issued before that step, in order: `['tap', id]`, `['fill', id, text]`, `['press', id]`, `['release', id]`, `['command', type, data]`, `['go', name, args]`, `['overlay', name, args]`, `['close', name]`, `['jump', scene, preset, opts, args]`. An operation made from inside a step, a transition or boot (a tap whose action calls `go`) is not recorded. `input` holds the action values that changed in that step's snapshot (axes as numbers, buttons as down).
  - **Plain-JSON rule while recording:** command data, scene args and jump opts must be plain JSON (checked at issue, and the handler or scene receives a copy of what was logged), so the tape and the replay see exactly what the handlers saw.
  - `sums` is `[[step, checksum]]`, one every 60 steps, taken after each step run through the handle (`h.step`, `until`) and not by `engine.stepN` called directly; `end` is the final step.
  - `replay(game, tape, { invariants })` (from `lion-hawk/test`) starts a headless handle from the tape's seed, scene and args, re-issues the ops before the steps they preceded, **sets** (not holds) the recorded input before every step so nothing stays held afterwards, and compares every checkpoint: the first divergence throws `replay: checksum differs at step N`. It rejects a tape of another version, game or `hz`. Recording needs step acks: headless, or a test page booted with `?lh-test&lh-record` ([D-4]); a browser engine with frame acks and `record` throws.
- **[T-10] Determinism.** `checks.determinism(game, { seed, steps })` runs twice and reports the first step whose checksums differ.
- **[T-11] Multiplayer.** `mp(game, { peers = 2, link = { delay, jitter, loss }, clock, record = false, seed = 1, argsOf, beforeStep, onWarn })` (built in 2f) runs headless peers over the in-memory hub, each with a port ([N-1]), and returns `w = { hub, peers, host, guests, now, step(n = 1, inputs), seconds(s, inputs), addPeer(), settle(agree, { maxSeconds = 3 }) }`:
  - peer `i` is `{ index, name: 'host' | 'guest<i>', h, engine, net, port }`; `inputs` is an array of action snapshots or `(peer, i) => snapshot`, applied with `engine.input.set`; `beforeStep(peer, i)` runs before each peer's step;
  - each `w.step` advances the hub clock by `1000 / hz`, ticks the hub, then steps every peer in order (`h.step(1)`, so tapes record); the hub's jitter and loss are seeded from `seed`;
  - `settle(agree)` steps until `agree(w)` returns `[]` and returns what is left;
  - the hub decides a drop at send time (`hub.drop`), so messages already in flight when a blackout starts still land (#94);
  - a peer added later starts with `wall0 = hub.now`; its virtual wall can be one ulp off the hub's, so compare a late peer's `time.wall` with a tolerance (#93);
  - also built: `w.drop(peer)`, `w.rejoin(peer, { wall0 })`, `w.seat(peer, op, seat)` and per-seat inputs ([T-22]), `w.blackout(s, { kinds })` and `w.diverged({ agree })` over `net` entities.
- **[T-12] Sim purity.** `checks.simPurity(game, { roots })` scans the source text of the named sim files and directories, without importing them, and returns `{ ok, found }`. It flags `three` and view imports, `document`, `window`, `Date.now`, `performance.now` and `Math.random`.
- **[T-13] Zero allocation.** `checks.zeroAlloc(game, { steps = 10000, warm = 600, limit = 64 KiB })` measures retained heap growth with full GCs (it enables `--expose-gc` in-process). After `warm` steps it judges the second half of the run only, scaled ×2, and returns `{ ok, growth, steps }`.
- **[T-14] Material references.** `checks.materials(game)` verifies that every material referenced by the game's models and sidecars exists.
- **[T-15]** `lion-hawk test` runs T-10, T-12, T-13 and T-14 for every game automatically.

### 7.5 Browser helpers: `lion-hawk/playwright`

- **[T-16] Presets.** iPhone SE, iPhone 15 Pro and 15 Pro Max (portrait and landscape), iPad Mini, iPad Pro 11 and desktop. Each preset has:
  - real iOS safe areas applied through `--lh-sa-*`;
  - a fixed DPR;
  - SwiftShader (`launch()` finds the Playwright Chromium build and starts it with `--use-angle=swiftshader`; no browser channel);
  - `serviceWorkers: 'block'`.

  The browser is located automatically.
- **[T-17] The `game` fixture.**
  - Opening: `open({ scene, args, seed, query, settings, render, initScript })` loads with `?lh-test` (`render: 'manual'` loads with `?lh-test=render`, [D-1]; `testUrl(url, opts)` builds the URL) and waits for `ready` and `settled()`. `initScript` (a function or `{ content }`) is added with `context.addInitScript` before navigation (so popups and new tabs get it too), e.g. to stub WebGL (#74).
  - Stepping: `step`, `seconds`, `until`, `untilEvent` and `untilLoaded({ maxSteps, timeout })`, each stepping inside the page. `step`, `seconds`, `until`, `untilEvent` and `untilLoaded` hand control back to Node while a load's settle is held by blocks (`engine.loading.phase === 'settle'` with `blocks` pending, e.g. a `view.wait`), poll until the blocks clear (bounded by `timeout` ms, default 30000), then continue stepping (#50). `untilLoaded` steps until `engine.loading.active` is false, first taking the step that delivers commands pending at the call (#100); with commands pending, `untilLoaded({ maxSteps: 0 })` throws.
  - State and scenes: `render`, `state`, `query`, `go`, `jump`, `command(type, data)`.
  - Pointing: `point(target)` resolves a selector, `{ x, y }` or `{ world }` to client `{ x, y }` for `page.mouse` (#65). A `{ world }` point whose `view.project` returns `onScreen: false` throws `touch: { world } point is off-screen or behind the camera` (#73); a `project` without `onScreen` is taken as on-screen.
  - Input: `input.hold` / `release`. Pads (#138): `open({ pads = 'fake' })` replaces `navigator.getGamepads` with a fake that has no pad until `game.pad({ a, b, start, lb, rb, up, …, axes: [x, y], id })` plugs pad 0 in (any number of pads, [T-24]; `game.pad(null)` unplugs it; `game.frames(n)` waits n animation frames so devices read it), so the test machine's controllers never reach a test; `pads: 'host'` keeps the real ones.
  - Touch: `touch.start/move/end/drag` through CDP, so taps are hit-tested and multi-touch works. Targets are a locator, `{x, y}` or `{ world: [x, y, z] }`.
  - UI: `tap(testid)`, `fill(testid, value)`, `press(testid)` / `unpress(testid)` (a held CDP touch beside the active touches on touch presets, the mouse on desktop; for `ui.hold` controls) and `control(testid)`. `fill` types into the real `<input>` and presses Enter to commit it.
  - Screenshots: `shot(name, { mask })`.
  - Errors: `errors` must be empty at teardown.
  - *Clarification (built, post-0.13):* `query(name, where)` returns the page's [D-4] entity summaries (`where` may be a predicate, sent as source); `control(testid)` is that control's `ui.tree()` entry or `null`; `checksum()`, `snapshot()` and `restore(snap)` are the [D-4] calls, with `open({ record: true })` adding `?lh-record`, and `restore` waiting for the reload until the page is ready and settled again. `touch.drag(id, from, to, { steps = 8 })` is a start, `steps` moves on the line and an end. `shot(name, { mask })` renders, then writes `$LH_SHOTS` (default `test-results/shots`)`/<preset>/<name>.png` with each mask target covered, and returns the path; a name is letters, digits, `.`, `_` and `-`.
- **[T-18] Matchers.** The layout assertions `expectTappable(game, target, { min })`, `expectFitsSafeArea(game, target)` and `expectNoOverlap(game, a, b)` take a target: a string (a test id for `expectTappable`, a CSS selector for the other two), `{ testid }`, `{ css }` or a Playwright locator, and name the target in their failure messages (#48). Matcher names: `toBeInScene`, `toHaveEmitted`, `toBeSettled`, `toHaveState`, `toBeTappable({ min })`, `toFitSafeArea`, `toNotOverlap`, `toBeThumbReachable(side)`.
  - *Clarification (built, post-0.13):* the matchers hang off `expectGame(game)` (`toBeInScene`, `toHaveEmitted(type, match)`, `toBeSettled`, `toHaveState(path, value)`) and `expectGame(game, target)` (`toBeTappable`, `toFitSafeArea`, `toNotOverlap(other)`, `toBeThumbReachable('left' | 'right')`). All are async and throw `AssertionError`. `toBeThumbReachable` wants the target's centre within 0.6 × the viewport's short side of the bottom-left or bottom-right corner inside the safe area.
- **[T-19] Screenshots.** `@visual` tests run only with `--visual`, in a pinned container.
- **[T-20] Peers.** (Built in 2g.) `peers(browser, url, n, { link, preset, seed = 1, args, argsOf, query, timeout, render = 'manual' })` opens `n` pages, each in its own browser context (page 0 is the host), with `?lh-test&lh-bridge=host|guest`, and joins them through one Node `createMemoryHub(link)` (jitter and loss seeded from `seed`) over the `bridge` transport ([N-2]); the game binds its port to `bridgeTransport()` when it sees `?lh-bridge`. Pages open with `?lh-test=render` unless `render: 'auto'` is passed, because a manual-stepping SwiftShader page that renders every rAF starves the others (#107). It returns `room = { games, hub, now, step(n = 1), close() }`:
  - `argsOf(i, name)` gives page `i` its own args and overrides `args`; other options go to each page's open ([T-17]);
  - `room.step(n)` does, `n` times, what `mp()` does ([T-11]): it advances the hub clock by `1000 / hz`, ticks the hub, delivers each page's events in order, then steps every open page once (the pages are in manual mode, so a run is deterministic), waiting after each page's step until Node has every bridge call that page made (bounded by `timeout` ms);
  - closing a page's driver (`game.close()`) leaves the hub for it: its host hears `peerLeft`, and a closed host closes the room (`closed`) for its guests; `room.close()` closes every page.
  - if a page fails to open, the pages already open are closed before the error is rethrown; `bridgeEnd(net)` (exported for tests) is the Node end of one page's bridge, applying its calls in sequence order;
  - a page must not reload or navigate: `info.sent` restarts at 0 while Node's sequence counter does not, so that page's bridge stalls.
- **[T-21]** Real-iPad audio and touch checks remain a manual checklist in each game's docs.

Local players (draft 2026-10-21):

- **[T-22] Seats in `mp()`.** (built, plan 3) Inputs per peer take a per-seat form `{ [peer]: { [seat]: snapshot } }`; a bare snapshot is seat 0. `w.seat(peer, op, seat)` joins or leaves a seat; `w.drop(peer)` and `w.rejoin(peer)` leave and come back with the same key, to test [N-23] inside and past `rejoinSeconds`.
- **[T-23] Tapes per seat.** (built, plan 1) Tapes record input changes per seat and the `lh.seat` commands; a tape without seats replays as seat 0.
- **[T-24] Fake pads.** (built, plan 4) The Playwright fake pads ([T-20]'s `pads: 'fake'`) hold any number of pads: `game.pad(index, state)` plugs or updates one (with optional `id` and `mapping`), `game.unplug(index)` removes it and fires `gamepaddisconnected`. Each fake pad has a `vibrationActuator` with a settable `effects` list that records every `playEffect` and `reset` call, read with `game.haptics(index)`. Rulings (plan 4): `game.pad(state)` is `game.pad(0, state)`; `game.pad(null)` and `game.pad(index, null)` unplug like `game.unplug(index)`; plugging an empty slot fires `gamepadconnected`; indexes are integers 0..15; `navigator.getGamepads()` returns a new array each call with `null` in empty slots (trailing ones trimmed). The actuator lists `['dual-rumble', 'trigger-rumble']` unless `effects` is given; `effects: null` gives that state no `vibrationActuator`; an unlisted effect rejects `NotSupportedError`; the actuator and its call log stay with the index until a pad with another `id` plugs in there. `game.haptics(index)` is `{ effects, calls }` (`{ op: 'playEffect', type, params }` / `{ op: 'reset' }`) or `null`.
  - *Note (plan 5):* a bare `game.pad()` or `game.pad(undefined)` is `game.pad(null)` (pad 0 unplugged), as in 0.12; `'1'`, `true`, `NaN`, and `undefined` with a state, still throw.
- **[T-25] State homes.** (built, plan 5) Each migrated game has headless tests that player state survives a respawn and a rejoin, and that game state reaches a late joiner.
  - *Ruling (plan 5):* a game with no net part tests the offline half: player 1's record outlives the pawn changing and game state follows the sim; the rejoin and late-joiner halves apply to networked games.

### 7.6 Deferred

- A flow DSL that runs the same script headless or in a browser.
- fast-check fuzzing over the action map.

Both build on §7.4–7.5 and are added once enough flows exist to shape them.

---

## 8. Repo layout, packaging and migration

### 8.1 Layout

```
lion-hawk-engine/             # package "lion-hawk"
├── package.json              # peerDependencies: three ^0.186, @dimforge/rapier3d-compat ^0.21
├── src/
│   ├── core/                 # loop clock, rng, math, events, flags, scenes, engine object   (sim)
│   ├── defs/                 # materials, kinds, field types                               (sim)
│   ├── sim/                  # world/entities, physics wrapper, fields, replication        (sim)
│   ├── view/                 # rAF driver, renderer, material compiler, assets, audio,
│   │                         # input devices, ui helpers, debug overlays, pwa client       (view)
│   ├── net/                  # lion-hawk/net: transport.js (hub, lag, room link), port.js,
│   │                         # bridge                                                      (net)
│   └── kits/<kit>/           # vehicle, terrain, coverage, fx, glyphs: sim.js and/or view.js
├── testing/                  # lion-hawk/test (headless, replay, mp), lion-hawk/playwright
├── tools/                    # lion-hawk CLI
├── test/                     # engine tests
└── docs/                     # agents.md, spec.md, specs/as-built/, design.md, research*.md, field-notes.md

<game>/                       # any game, in its own repo, with lion-hawk as a dependency
├── game.config.js            # id, version, netVersion, sim, build hooks, PWA, model settings
├── src/game.sim.js           # defineGame sim half: defs, actions, kits, scenes (sim), policies
├── src/game.view.js          # view half: scene views, camera rigs, HUD
├── assets/  test/
```

### 8.2 Game contract

```js
// src/game.sim.js — headless-safe
export default defineGame({
  id: 'farm-run',
  sim: { hz: 60, maxCatchUp: 3 },
  defs: { materials: MATERIALS, kinds: KINDS },
  actions: actions({ steer: axis(), throttle: axis(), horn: button(), pause: button() }),
  kits: [vehicleKit, terrainKit, herdKit, coverageKit, fxKit],
  scenes: { title, farm, show, reward },          // sim halves (§5.2)
  start: 'title',
  policies: { autopilot },
  debug: (engine) => ({ herd: engine.world.with('animal') }),
  reset() { … },
});

// src/game.view.js — browser only
export default defineView({ scenes: { title, farm, show, reward } }); // view halves
```

- **[G-1a]** `reset()` (optional, no arguments) restores the game's module-level tunables. `createEngine` calls it before anything else, so every headless handle, replay, `mp()` peer and browser boot starts from the shipped values. Two engines in one process still share module state: a later engine's reset also resets an earlier one's tunables, so a test that tunes must tune after all its `mp()` peers are created (#108).

- **[G-1]** `headless()` imports only `game.sim.js`. The browser entry imports both.

### 8.3 Packaging

- **[G-2]** Packaging rules:
  - The engine package exposes `lion-hawk/sim`, `lion-hawk/view`, `lion-hawk/net`, `lion-hawk/kits/*` (and `kits/*/view`), `lion-hawk/test`, `lion-hawk/playwright`, `lion-hawk/bake`, `lion-hawk/build` and `lion-hawk/package.json` through `exports`.
  - three.js and Rapier are peer dependencies, and the esbuild config forces one copy of each. `lion-hawk/build` exports `dedupe({ root, packages = ['three', '@dimforge/rapier3d-compat'] })`, an esbuild plugin that re-resolves those packages (and their subpaths) from the game's `root`, so the engine and the game share one copy (#11). It lives in `tools/`, not `src/`: engine sim source imports neither three nor Rapier, and engine view source imports three directly (D9). `lion-hawk build` calls the esbuild API with this plugin.
  - Each game build bundles a snapshot of the engine.
- **[G-3]** The engine has its own semver version (0.x until migration ends) and a `CHANGELOG.md`.
- **[G-4]** `npm test` runs the engine's tests. An engine change ships only when they pass.

### 8.4 Migration phases

| # | Phase | Done when |
|---|---|---|
| 0 | Workspace; engine skeleton (`rng`, `math`, `events`, `flags`, `window.engine` with aliases); first headless helpers; **one golden/replay test per game written against today's code** | every game builds from the workspace; goldens pass |
| 1 | Version alignment: three 0.186 and Rapier 0.21 | goldens pass or are re-blessed with a written reason |
| 2 | Loop, scenes ([S-4]), input actions and UI helpers. Playwright helpers land | a game runs on the engine loop; a headless end-to-end flow test |
| 3 | Tooling: CLI, glTF bake + sidecars, runtime glTF loading; `assets.json`, `build.py`, `bake.mjs` retired | builds are equal in behaviour; size measured against today |
| 4 | Entities and materials: `World`, parts, registry, pairs, ground lookup; hard-coded friction, `SURFACES` and `DIRT` replaced | no literal friction/density in game code |
| 5 | Netcode in the engine, driven by `net` parts, including driven remote actors ([N-12]–[N-17]); `test.peers` | the bump test (§4.4) passes under 80 ms latency and 2% loss |
| 6 | `kit-vehicle` (raycast backend; tire model as a second backend) and `kit-terrain` | games on the kits |
| 7 | `kit-coverage`, `kit-herd`, `kit-fx` | mud, dirt and snow on one system |
| 8 | Fields: wind, aero, buoyancy, magnet; panel bake | field tests with analytic expectations |
| 9 | Shared build mode and one service worker across games | a second game loads only its own files |

- **[G-5]** Each phase gets its own plan.
- **[G-6]** A phase is done when every game's tests, the goldens and the Playwright smoke tests pass, and each changed game is version-bumped and deployed.

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

- **CI.** Nothing runs the game tests automatically today; GitHub Actions only deploys the site. Decide whether `npm test` (and `--visual` in a pinned container) runs on push.
- **Pad text entry.** The menu navigator skips text inputs (a seed or a room code), so a pad can't type: decide between a digit picker, an on-screen keyboard or skip-only (#138).
- **Handshake vendoring.** How `handshake.js` updates flow from the Handshake repo into `lion-hawk-engine/src/net/transport/rtc/` (copy script plus version stamp is the default).
