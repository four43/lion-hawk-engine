# Lion Hawk Engine: shared engine for Pig Pens, Rally and Tractor Pickup

How the three games in `four43/four43` (`gh-pages/games/`) could be pulled into one engine, how that fits the layered hierarchy we started from, and where that hierarchy has to change. It also specifies the material system, in which every mesh carries properties that define both its look and its physics.

Plain JavaScript throughout, matching the existing games and the shared Handshake client.

The engine lives in `games/lion-hawk-engine/`. Paths written as `engine/...` below mean `lion-hawk-engine/...`.

---

## 1. Where we started

The hierarchy from our earlier discussion, adapted from Gregory's *Game Engine Architecture*, with Unreal, Godot and Bevy as references:

| # | Layer | Contents |
|---|-------|----------|
| 1 | Platform / core | math, memory, logging, threading, windowing, file I/O |
| 2 | Resources | asset loading, caching, hot reload, serialization |
| 3 | Low-level subsystems | rendering, physics, audio, input, network transport. Each owns its data and hands out handles |
| 4 | Gameplay foundation | object model, scene graph, game loop and scheduling, events, replication |
| 5 | Game-specific | UI, cameras, rules, AI |

Two working rules came with it. Three.js and Rapier play the role of Godot's RenderingServer and PhysicsServer, so the real work is layer 4. And replication is designed into the object model from day one, as Unreal does with UObject.

The games show the stack is broadly right, but too flat in some places and missing pieces in others.

---

## 2. What the three games already share

All three games follow the same skeleton. Nobody designed it as an engine; it was copied from game to game.

| Pattern | Pig Pens | Rally | Tractor Pickup |
|---|---|---|---|
| Simulation separate from rendering, with no `three` or DOM imports in sim files | `sim.js`, `chickens.js`, `flow.js`, `layout.js` | `sim.js`, `vehicle.js`, `tire.js`, `drivetrain.js`, `snow.js`, `gen/*` | `sim/*` |
| Fixed-step accumulator | 60 Hz, ≤4 catch-up steps | 240 Hz Rapier, 8 tire/drivetrain substeps per step, ≤12 catch-up | 60 Hz, ≤3 catch-up (`MAX_STEPS`) |
| Render interpolation between steps | none | none (240 Hz hides it) | yes (`snapInto` / `lerpSnap`, swapped snapshot sets) |
| Sim emits events, view consumes them | `sim.events` → sound, toasts, feathers | control events | `game.step()` returns events → sound, fx, net |
| Debug hook for Playwright | `window.piggies` | `window.rally` | debug UI plus perf hooks |
| Asset bake | `bake.mjs` → `assets.json` | same | same, plus paint areas from glTF material names |
| Build | `build.py` → single HTML + PWA | same | same, plus voice and audio embedding |
| Tests | headless scenario scripts | `node test/*.mjs` | `node --test`, ~50 files, including a multiplayer harness |

The copies have drifted:

- **Three loop variants.** Only Tractor Pickup interpolates, and it is also the only one that avoids allocating per step.
- **Forked helpers.** `gfx.js` is in Pig Pens and Tractor Pickup with small differences, `rng.js` exists twice, and there are three bake and three build scripts.
- **Version spread.** three.js 0.160 vs 0.186, and Rapier 0.14 (Rally) vs 0.21.
- **Two tractors.** Both farm games have a tractor on Rapier's ray-cast vehicle controller. Each was written separately.
- **Three terrain generators.** `layout.js` (tile grid), `sim/terrain.js` (high and low cells), and `gen/terrain.js` (fBm plus road profile). All feed a Rapier heightfield.
- **Hard-coded physics numbers.** Friction values such as 0.2, 0.45, 0.6, 0.8 and 0.9 are typed directly into collider creation across all three games. Tractor Pickup sets density 0.1 on the cab colliders to get the mass it wants.
- **The same shader trick, written three times.** All are `onBeforeCompile` patches that blend a coverage layer over a base material: mud creeping up the pigs' legs, `dirtMat.js` dirt spots, and Rally's snow wear.

Some code is already engine-quality:

- **`tractor-pickup/src/net/`**
  - `replica.js` is a field schema (`F.fixed`, `F.quat`, `F.oneOf`, …) with binary keyframe and diff frames.
  - `kinds.js` declares replicated object types with host or owner authority.
  - `forecast.js` does dead reckoning with fading corrections.
  - `handshake.js` is vendored from the Handshake repo. That vendoring is already the shared-library pattern the engine would use.
- **`rally/src/tire.js` `SURFACES`** is a table of per-surface physics: grip `mu`, Magic Formula shape `C`, slip peaks `kp`/`ap`, rolling resistance `crr` and drag. It is the first draft of a material registry.
- **`tractor-pickup/src/sim/dirt.js` `DIRT`** sets how fast each surface (gravel, grass, mud) makes things dirty. That is another per-material property.
- **`rally/src/ui.js`** merges all input sources into one normalised control struct, so the physics never knows where a command came from.
- **Tractor Pickup's stutter fixes.** `warm.js` compiles shaders while loading. `matSplit.js` gives instanced and shadowed users their own material clones to avoid GC pauses. The main loop allocates nothing per frame.

---

## 3. How the hierarchy needs to change

### 3.1 Add a vertical split: simulation | presentation

The most important boundary in these games is not between layers. It runs down through them. Every layer has a headless half and a presentation half:

| Layer | Simulation half (Node-safe, deterministic) | Presentation half (browser only) |
|---|---|---|
| Core | loop clock, rng, math, events | rAF driver, interpolation |
| Resources | geometry data, material physics params | GPU buffers, textures, shader programs |
| Subsystems | physics, fields, vehicles | rendering, audio, particles |
| Foundation | entities, components, replication | views bound to entities |
| Game | rules, AI | HUD, menus, camera |

This rule is what lets the headless tests in all three games run in Node before any screenshot. The engine should enforce it with separate entry points (`engine/sim` and `engine/view`) and a lint or test check that `engine/sim/**` never imports `three` or touches `document`.

### 3.2 Add a definitions layer between resources and subsystems

The original stack had no home for data that several subsystems read. Materials are the clearest case: one `steel` entry is read by physics (friction, density), aerodynamics (skin drag), magnetism, rendering, audio (impact sound), effects (sparks) and coverage (rust, dirt). Replication `kinds`, vehicle specs (`cars.js`, `TP`), and animal types (`TYPES` in `herd.js`) belong here too.

The definitions layer is plain data plus validation. It is shared by both halves and has no runtime dependencies.

### 3.3 Physics becomes "simulation services", with Rapier as one backend

In these games, Rapier is one part of what "physics" means. Code that is not Rapier:

- the Rally tire model (Magic Formula with relaxation lengths) and drivetrain substeps
- deformable snow (`snow.js`)
- boids, flow fields (`flow.js`) and herd steering
- breakable trees (`trees.js`) and, from the plane sims, breakage based on accumulated strain
- buoyancy and wake from the jet ski
- the new force fields: aerodynamics, magnetism, wind

So layer 3's physics box splits in two:

- **Solver backend:** Rapier, wrapped. It covers world creation, collision groups, heightfields, and colliders built from materials and shapes.
- **Simulation services:** force fields, vehicle models, deformation, breakage and steering. These run inside the fixed step, around `world.step()`.

### 3.4 Split networking across two layers

This was already planned, and Tractor Pickup confirms it:

- **Layer 3, transport:** Handshake signaling, the WebRTC link, rate limits and message validation (`link.js`, `handshake.js`, the checks in `protocol.js`).
- **Layer 4, replication:** `replica.js` field types, `kinds`, keyframes and diffs, authority, interpolation and forecasting.

Replicated kinds are declared next to entity types in the definitions layer, so adding a replicated thing means one schema entry, as `kinds.js` already says.

### 3.5 Add a kits layer between the foundation and each game

Some systems are shared by two or three games but are not engine core:

| Kit | Used by | Contents |
|---|---|---|
| `kit-vehicle` | all three | wheel and contact reporting, an input → controls mapping, two backends: Rapier ray-cast (tractors) and the tire model (rally) |
| `kit-terrain` | all three | heightfield sampling, seeded noise and fBm, roads along splines, ground-material lookup per point |
| `kit-herd` | Pig Pens, Tractor Pickup | boids and steering, flow fields, animation state, per-animal coverage |
| `kit-coverage` | all three | mud, dirt, snow and rust as one system: a sim-side level per entity and a view-side shader layer |
| `kit-fx` | all three | pooled instanced particles, tire marks, gibs |

This is Unreal's plugin idea, and the same as Bevy's plugin groups. A game imports only the kits it needs.

### 3.6 Make tooling a parallel column

Unreal separates Runtime, Editor and Developer modules. These games need the same:

- **`tools/bake`**: one glTF baker with paint areas, material IDs, aero panels, thickness for subsurface scattering and animation tables.
- **`tools/build`**: one builder producing a single-file or shared-bundle build, PWA, service-worker versioning and audio embedding.
- **`tools/test`**: a headless harness (create a sim, `stepN`, assert), a Playwright driver, and the multiplayer harness generalised from `mp.harness.mjs`.

### 3.7 Move UI and input to where the code actually puts them

- **Input** drops to layer 3. Touch sticks, hold buttons, keyboard ease ramps and gamepads all feed one normalised control struct (the Rally pattern) that the sim reads.
- **UI** is an HTML overlay layer, not part of the renderer. It reads sim state and presentation state, and sends commands back as events.

---

## 4. The revised hierarchy

```
                 SIMULATION (headless)          │  PRESENTATION (browser)
──────────────────────────────────────────────────┼──────────────────────────────────
 5  Game        rules, AI, progression         │  HUD, menus, camera rigs
──────────────────────────────────────────────────┼──────────────────────────────────
 4b Kits        vehicle · terrain · herd ·     │  matching views for each kit
                coverage · fx (sim side)       │
──────────────────────────────────────────────────┼──────────────────────────────────
 4  Foundation  entities + components,         │  views bound to entities,
                fixed-step scheduler, events,  │  interpolation, event → sound/fx
                replication (kinds, authority) │
──────────────────────────────────────────────────┼──────────────────────────────────
 3  Services    solver (Rapier) + fields:      │  renderer (three), material
                aero, buoyancy, magnetism,     │  compiler, instancing, post,
                wind; breakage; transport      │  audio, input → control struct
──────────────────────────────────────────────────┼──────────────────────────────────
 2b Definitions materials · kinds · vehicle specs · entity types   (shared data)
──────────────────────────────────────────────────┼──────────────────────────────────
 2  Resources   geometry, panels, volumes      │  GPU buffers, textures, programs
──────────────────────────────────────────────────┼──────────────────────────────────
 1  Core        clock, rng, math, events, log  │  rAF driver, perf, debug API
═══════════════════════════════════════════════════════════════════════════════════
    Tooling     bake · build · test harness · Playwright driver · mp harness
```

Changes from the original five layers:

1. A vertical sim/presentation split through every layer.
2. A new definitions layer (2b), with materials as its centrepiece.
3. Physics broadened into simulation services, with Rapier as one backend.
4. Networking split between layers 3 and 4.
5. A new kits layer (4b) for systems shared between games.
6. Tooling as a separate column.
7. Input at layer 3, and UI as an overlay at layer 5.

---

## 5. Where today's files go

### Core (`engine/core`)

| Engine module | Source |
|---|---|
| `loop.js`: fixed step, catch-up cap, interpolation alpha | Tractor Pickup `main.js` frame loop (snapshot swap, `MAX_STEPS`, nothing allocated per frame), plus a substep setting for Rally |
| `rng.js` | merge `rally/src/gen/rng.js` and `tractor-pickup/src/sim/rng.js` |
| `math.js`: quaternions, vectors, plain-object math with no three.js | `net/forecast.js` (`qmul`, `rotate`), the `bake.mjs` mat4 helpers |
| `events.js` | the `sim.events` / step-return pattern from all three |
| `debug.js`: standard `window.engine` hook | `window.piggies`, `window.rally`, `ui/debug.js`, perf hooks |

### Resources and definitions (`engine/assets`, `engine/defs`)

| Engine module | Source |
|---|---|
| binary geometry format plus loader | replaces the three `assets.json` files (~0.3–1 MB of JSON numbers each) |
| `materials.js` registry | Rally `SURFACES`, Tractor Pickup `DIRT`, hard-coded friction values, the Surface booth entries |
| `kinds` / schema helpers | `net/replica.js` `F` and `kind()` |

### Services (`engine/physics`, `engine/render`, `engine/audio`, `engine/input`, `engine/net`)

| Engine module | Source |
|---|---|
| `physics/world.js`: world, groups, heightfield | `sim/physics.js` (`G`, `groups`), `world/padWorld.js`, `world/trackWorld.js` |
| `physics/colliders.js`: material → collider | new; replaces hard-coded values at each call site |
| `physics/fields/*`: aero, buoyancy, magnet, wind | new; buoyancy from the jet ski |
| `physics/breakage.js` | `sim/trees.js`, strain-based breakage from the plane sims |
| `render/materials.js`: material compiler | Surface booth, `dirtMat.js`, `fur.js`, the snow and mud patches |
| `render/instancing.js`, `warm.js`, `matSplit.js`, `dispose.js` | Tractor Pickup `render/*`, plus `geoFrom` from both `gfx.js` files |
| `render/post/tiltshift.js` | Pig Pens `tiltshift.js` |
| `audio/*` | the three sound modules, plus synthesized impact sounds from the Surface booth |
| `input/*` | Rally `ui.js` control struct, Tractor Pickup `ui/input.js` (`radial`), `ui/hold.js` |
| `net/transport/*` | `link.js`, `session.js`, vendored `handshake.js`, `protocol.js` checks |
| `net/replication/*` | `replica.js`, `host.js`, `guest.js`, `interp.js`, `forecast.js`, `netlog.js` |

### Kits

| Kit | Source |
|---|---|
| `kit-vehicle` | Pig Pens `tractor.js`, Tractor Pickup `sim/tractor.js`, `sim/hitch.js`, Rally `vehicle.js`, `tire.js`, `drivetrain.js`, `cars.js` |
| `kit-terrain` | Rally `gen/noise.js`, `gen/terrain.js`, `gen/track.js`, Tractor Pickup `sim/terrain.js`, `sim/road.js`, Pig Pens `layout.js` |
| `kit-herd` | Pig Pens `sim.js` (boids), `flow.js`, `chickens.js`; Tractor Pickup `sim/herd.js`, `render/animals3d.js` |
| `kit-coverage` | `sim/dirt.js`, `dirtMat.js`, Pig Pens mud, Rally `snow.js` and `snowView.js` |
| `kit-fx` | `render/fx.js`, `render/gibs.js`, tire marks, Pig Pens feathers |

### Stays in each game

Rules, progression, menus and content: for example `bedtime.js`, `showSteps.js`, `progress.js`, the chicken and fox story, track generation rules, lap targets, and sticker art.

---

## 6. Material system

### 6.1 One entry, every subsystem

```js
// engine/defs/materials.js
export const MATERIALS = defineMaterials({
  steel: {
    look:     { color: '#8a9099', metalness: 1, roughness: 0.35 },
    phys:     { friction: 0.6, restitution: 0.2, sg: 7.85 },
    aero:     { skin: 0.004 },
    magnet:   { ferrous: 0.9 },
    sound:    'clang', fx: 'sparks',
    coverage: { dirt: 1, rust: 1 },
  },
  rubber: {
    look: { color: '#222', roughness: 0.9 },
    phys: { friction: 1.0, restitution: 0.6, sg: 1.1 },
    sound: 'thud',
  },
  gravel: {                       // a ground material: also drives tires and dirt
    look: { color: '#9a8f80', roughness: 1 },
    phys: { friction: 0.8 },
    tire: { mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
    dirtRate: 0.006,
    sound: 'crunch', fx: 'spray',
  },
  water: {                        // a fluid: a volume, not a collider surface
    fluid: { density: 1000, viscosity: 1e-3 },
  },
});
```

Every block is optional. A material is defined by what it declares; unused blocks cost nothing.

### 6.2 What each property means and who reads it

| Property | Units / meaning | Read by |
|---|---|---|
| `phys.friction` | Coulomb coefficient | Rapier collider (`setFriction`), with a combine rule per material |
| `phys.restitution` | bounciness, 0–1 | Rapier collider |
| `phys.sg` | specific gravity: density = `sg × 1000` kg/m³ | Rapier collider density → mass and inertia; buoyancy |
| `phys.fill` | solid fraction, 0–1 (default 1) | density × fill. A steel car shell might be ~0.02. This replaces the density-0.1 hack with real numbers |
| `tire.*` | Magic Formula surface params | `kit-vehicle` tire model, through a ground lookup under each wheel |
| `dirtRate` | coverage gained per metre driven | `kit-coverage` |
| `aero.skin` | skin-friction coefficient (surface roughness) | aero field |
| `aero.airfoil` | optional lift and drag curves vs angle of attack, plus stall angle | aero field; overrides flat-plate behaviour for wings |
| `magnet.strength` | dipole moment (permanent magnet) | magnet field |
| `magnet.ferrous` | how strongly it is attracted, 0–1 | magnet field |
| `fluid.density`, `fluid.viscosity` | for volumes such as water, mud and air | buoyancy, drag in fluid |
| `look.*` | `MeshPhysicalMaterial` params plus engine extensions (subsurface, fur/shell style, wear) | material compiler |
| `coverage` | which coverage layers this material accepts, and how strongly | `kit-coverage`, material compiler |
| `sound`, `fx` | impact and contact cue IDs | audio and fx, from contact events |

**Pair overrides.** Some combinations need a value neither material implies on its own, such as rubber on ice. Put these in a small table keyed by the material pair. The tire model and contact-sound code check the pair table first, then fall back to combining the two materials.

### 6.3 Drag and lift depend on shape, so bake them with the mesh

A material cannot say how much drag an object has; that depends on its shape. So the work is split:

- **At bake time:** from each mesh, store a simplified panel set (a few dozen panels, each with area, normal and centroid in body space), the closed volume, and the volume centroid.
- **At run time:** each step, for every body with aero enabled:
  1. Find the relative wind: body velocity at each panel minus the wind field.
  2. For each panel facing the wind, apply the flat-plate normal force (`½ ρ v² A · f(n·v̂)`) plus skin friction along the panel (`½ ρ v² A · aero.skin`). Apply it at the panel's centroid so it produces torque naturally.
  3. Sum the panel forces. This gives drag for any shape, and some lift from angled flat surfaces such as a box sliding through air.
- **Wings:** for real lift, give the wing's material or collider an `aero.airfoil` with lift and drag curves and a stall angle, as the plane sims already do.
- **Breakage:** with this, a detached wing keeps its own panels and falls realistically.

Buoyancy reuses the same data. Sample each panel's depth below the fluid surface. For a cheaper version, use submerged volume × fluid density, with the panels giving the centre of buoyancy. Damp heave against the moving water surface, not the world frame (a jet ski lesson).

### 6.4 Magnetism

- Each step, query a sphere around every body with `magnet.strength` to find nearby colliders whose material has `magnet.ferrous > 0` or its own strength.
- **Magnet → ferrous:** apply an attractive force along the line between them, falling off steeply with distance (roughly `1/r⁴` for an induced dipole).
- **Magnet ↔ magnet:** dipole-dipole force, which depends on the orientation of both magnets.
- **Stability:** clamp `r` to a minimum and cap the force, so things don't explode on contact. Apply the force at the collider's centroid. It is deterministic and runs inside the fixed step.
- **Example use:** a magnet crane on the tractor, or magnetic pickups in Skerry Island missions.

### 6.5 Hooking materials to meshes

- **glTF material names become registry keys.** The bake already reads `paint-body` and `paint-trim` this way, so `steel`, `rubber` and `glass` work the same. A name that isn't in the registry fails the bake.
- **One mesh, several materials.** A tractor is one rigid body with several colliders (the "one body, many colliders" lesson from the breakable plane). Each collider takes the material of the mesh part it was generated from, so mass and centre of mass come out of the real geometry.
- **Variants.** `extends: 'steel'` with overrides (`paintedSteel`, `rustySteel`) avoids copy-paste.

### 6.6 Rendering cost

- Compile materials into a small number of shader variants: one base `MeshPhysicalMaterial`, with features turned on by compile-time switches (subsurface, shell fur, coverage). The alternative is one program per material.
- Keep `warm.js` (compile everything during loading) and `matSplit.js` (separate clones for instanced vs plain users) as default engine behaviour.

---

## 7. Engine contracts

### 7.1 A game

```js
export default defineGame({
  id: 'tractor-pickup',
  sim:   { hz: 60, maxCatchUp: 3 },             // Rally: { hz: 240, maxCatchUp: 12 }
  kits:  [vehicleKit, terrainKit, herdKit, coverageKit, fxKit],
  defs:  { materials: MATERIALS, kinds: KINDS },
  createSim(engine, { seed }) { /* headless: returns { step(input) → events } */ },
  createView(engine, sim)     { /* browser: returns { draw(alpha), onEvent(ev) } */ },
  debug(sim) { return { herd: sim.herd }; },    // merged into window.engine
});
```

### 7.2 The loop

- The step rate is fixed per game. Substeps (Rally's 8 tire substeps) stay inside the vehicle kit, not the loop.
- After a hitch, catch up at most `maxCatchUp` steps and drop the rest, so the game never spirals.
- After each step, snapshot every view-bound transform into a swapped pair of buffers; the view interpolates by `alpha`. Remote entities use `interp.js` and `forecast.js` instead.
- Nothing is allocated per step or per frame.

### 7.3 Vehicles

All vehicle backends take the same input and report the same contacts:

```js
// input:  { throttle, brake, steer, handbrake, gear? }
// output: per wheel { inContact, point, normal, load, slip, material }
```

The ground `material` under each wheel drives dirt accrual, tire marks, spray, sound, and (on the tire backend) grip. Today each game does this its own way.

### 7.4 Debug and testing

- `window.engine` exposes `stepN`, `pause`, `resume`, `render(alpha)`, `state()`, plus each game's own `debug()` extras.
- Playwright scripts use only this API, so one driver works for every game.

---

## 8. Optimizations

1. **Shared bundle and one service worker.** Built games are about 2.9 MB (Rally), 5.9 MB (Pig Pens) and 6.5 MB (Tractor Pickup). Each one inlines three.js, the Rapier WASM and its own copy of shared Kenney models (bushes and trees appear in both farm games). Serve the engine, three.js, Rapier and a shared model pack from `/exp/engine/`, with versioned file names, and cache them with one service worker. The second game then loads only its own code and content. Keep the single-file build as an option for artifacts and the arcade kiosk.
2. **Binary assets.** Replace JSON number arrays with quantized positions, compact normals and 8-bit vertex colours. A rough expectation is 3–5× smaller and much faster to parse; measure before committing.
3. **Interpolation everywhere.** Pig Pens is the one that needs it now.
4. **Stutter fixes as defaults.** Shader warming, material splitting, nothing allocated per frame, and snapshots in two swapped buffers.
5. **Fewer shader programs** (section 6.6).
6. **Herd level of detail.** Update far-away animals at a lower rate, interpolate their positions, and let Rapier sleep animals that are standing still.
7. **One three.js and one Rapier version.** Upgrade Rally from Rapier 0.14 and Pig Pens from three.js 0.160 as part of migration, re-running each game's headless tests to catch behaviour changes.
8. **Optional later: simulation in a Web Worker** for Rally or big herds. GitHub Pages can't set the headers needed for shared memory, so this would use transferred buffers. Only worth doing if profiling shows the main thread is the bottleneck.

---

## 9. Migration plan

Each phase ends with every game's existing tests passing, and a Playwright screenshot check on phone and desktop sizes.

| Phase | Work | Proves |
|---|---|---|
| 0 | Create `engine/` in the repo; move `rng`, `math` and `events` into it; give each game the standard `window.engine` hook alongside its old one | layout, import paths, test harness |
| 1 | Tractor Pickup's loop becomes `engine/core/loop.js`; Pig Pens and Rally switch to it | interpolation and allocation-free stepping in all games |
| 2 | One bake and one build script; binary geometry; align three.js and Rapier versions | tooling column, size savings |
| 3 | Material registry; replace hard-coded friction; Rally `SURFACES` and `DIRT` become entries; glTF names map to materials | definitions layer |
| 4 | `kit-vehicle`: merge the two Rapier tractors; wrap Rally's tire model as the second backend | kits layer, vehicle contract |
| 5 | `kit-coverage`: one system for mud, dirt and snow | sim and view halves of a kit |
| 6 | Lift `net/` into `engine/net`; Tractor Pickup is the first user | transport and replication split |
| 7 | Aero, buoyancy and magnet fields; the panel bake | material-driven physics beyond friction |
| 8 | Shared bundle and service worker across `/exp/` | load-time savings |

Phases 1–3 are low risk and help every game straight away. Phase 7 is where Skerry Island's vehicles (plane, RC plane, jet ski) can start moving onto the engine.

---

## 10. Open questions

- **Object model.** Plain objects with components, plus typed arrays for herds, is the proposal. Should one game prototype a light ECS (for example bitecs) for the herd before we commit?
- **How deterministic?** Same-machine replays need fixed step order. Cross-device lockstep would also need deterministic Rapier builds and float-careful math. Snapshot replication (the current approach) avoids this. Is lockstep ever a goal?
- **Pair-table scope.** Should pairs only affect friction and sound, or also restitution and tire params?
- **Wind.** Is wind a global field, a field per terrain area, or turbulence sampled per panel? This connects to the open wind question in the flight sim.
- **Ship as single file or shared bundle.** Should the arcade kiosk keep single-file builds, or rely on the service worker cache?

---

## 11. Code survey findings (2026-10-11)

A read-only survey of the three games checked the sections above against the working tree. Corrections and additions:

- **three.js versions.** Rally is also on three 0.160 (`rally/package.json`). Both Rally and Pig Pens need the move to 0.186, not just Pig Pens (section 8, item 7).
- **RNG exists three times, not twice.** Pig Pens has its own mulberry32 in `pig-pens/src/layout.js:7`. All three use the same algorithm and constants. Rally's `gen/rng.js` (`fork(label)`, FNV string seeds) is the best base.
- **No runtime glTF loading anywhere.** All three bake GLB to `assets.json` and never load GLBs at runtime. The binary-geometry work replaces that format, not a loader.
- **`gfx.js`** is a near-identical fork (`pig-pens/src/gfx.js`, `tractor-pickup/src/render/gfx.js`): `s2l`, `geoFrom`, `colorGeo`, `mergeGeos`, `boxGeo`, `animM`, `sampleAnim` are the same.
- **`pwa/sw.js` is identical** in all three except the cache prefix. `build.py` is the same core (esbuild IIFE, template marker, sw stamped with version + HTML hash, output to `site/exp/<game>/`); the template marker differs (`<!--APP-->` vs `<script>/*BUNDLE*/</script>`).
- **Missing from section 5:**
  - **Game state machine.** Rally's `game/game.js` (title, loading, ready, countdown, running, finished, paused, with `on()/emit()`) is the model for an engine primitive. Tractor Pickup uses a `game.mode` string; Pig Pens is implicit.
  - **Persistence.** `localStorage` try/catch wrappers are duplicated (`tractor-pickup/src/ui/store.js`, Rally `game/bests.js`).
  - **Renderer/scene factory and resize.** Near-identical renderer setup, pixel-ratio cap (Tractor Pickup lowers it to 1.5 on touch) and portrait FOV switch in all three.
  - **Chase camera.** All three use exponential smoothing (`min(1, dt*k)`); Tractor Pickup's `render/camera.js` is the cleanest.
- **Input.** Only Tractor Pickup resets input on blur/visibility change (`ui/input.js:44-46`); the engine should make that default. Its floating stick with a 24 px Safari back-swipe guard and `radial()` dead-zone is the cleanest touch base; Rally's key-event map and text-input guard is the best keyboard base. Pig Pens has no gamepad support.
- **Packaging is unresolved.** There is no root workspace; each game has its own `package.json` and `node_modules`. How games import `lion-hawk-engine/` (npm workspaces, path dependency, or vendored copy) is the first decision of phase 0.
- **Migration risk.** Pig Pens' `main.js` is one ~680-line `main()` with closure state, so moving it onto the shared loop is the hardest phase-1 step. Tractor Pickup's `main.js` also carries trip, bedtime and network concerns. Rally's `main.js` is the cleanest model.
- **Not in this repo.** Skerry Island, the plane sims, the jet ski and the Surface booth are referenced above but have no code here. Treat them as outside inputs until their source is located.
