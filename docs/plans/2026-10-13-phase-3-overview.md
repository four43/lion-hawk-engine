# Phase 3 overview and interface contract (2026-10-13)

Status: binding for the phase 3 sub-plans. Base: engine `phase-2g` (0.7.2, head 27e4701); four43 `feat/lion-hawk` (e03ed71).

Inputs:
- `docs/plans/2026-10-13-phase-3-survey.md` (the user's decisions are binding);
- `docs/spec.md` (binding where this page does not record a delta);
- `docs/design.md` §3–§7;
- field notes #1, #2, #6, #11, #28, #33, #67, #95, #100, #103, #105–#109.

How to use this page:
- **Plan writers:** write one sub-plan per row of §5.2. Copy §7 into every plan verbatim. Work only inside the files your row owns.
- **Implementers:** build against §4. Any change to a signature, data shape or invariant in §4 goes through the integrator, who edits this page and tells every open worktree.
- **Decisions:** "Decision:" marks a choice the spec left open, with what it costs.

Phase 3 here covers spec §8.4 phases 3 to 5 (tooling and models, entities and materials, netcode on `net` parts) plus the kits the three games need now. The spec's phase numbers stay as history.

---

## 1. Goal and scope

**Goal.** Each of the three games builds its world from engine parts:
- entities in a scene-owned `World` with Rapier bodies made from material-tagged colliders;
- models baked from GLB into optimised GLBs plus physics sidecars;
- drawn by an engine renderer that compiles registry materials and interpolates entities;
- Tractor Pickup's multiplayer replicated through `net` parts.

`assets.json`, `bake.mjs`, `build.py` and every hand-written `RAPIER.World` setup in the games are retired.

### 1.1 In scope

| Area | Requirement IDs | Sub-plan |
|---|---|---|
| Engine carry-overs: #95, #100, #105, #107, #108, #109, G-E2 minors | R-6, S-2, T-5, T-17, T-20, I-2 | 3a |
| Material registry, base library of 18, `extends`, pairs, validation, sidecar schema | M-1, M-2, M-3, M-7, M-8, A-5 (schema) | 3b |
| `World`, entities, parts, live queries, ID allocation, transform pool, place, scene ownership | E-1…E-13, S-3, L-2 | 3c |
| Rapier wrapper: init by injection, pinned parameters, colliders from sidecars and materials, combine rules, groups, heightfield, sleep, contact and sensor events, timing hook (#106) | M-4, M-5, M-6, M-9, #1, #2, #106 | 3c |
| Headless world access, finite over `xf` and bodies, `checks.*` | T-1, T-5, T-10, T-12, T-13, T-14 | 3c (T-14 with 3b) |
| `lion-hawk` CLI: `bake`, `build`, `dev`; dedupe in builds | A-1…A-4, A-6, A-7, A-11 (anim tables), B-1, B-2, B-3 (amended), B-5, #11 | 3d |
| Renderer, light rig, resize and DPR, GPU hygiene (warm, instanced depth, dispose), snapshot, tilt-shift; `boot` render pipeline | M-12 (warm), S-3 (GPU), design §6.6 | 3e |
| Shared `GLTFLoader` (meshopt), `engine.assets` (preload, cache, clone), material compiler (`COVERAGE`, `FUR`, `SUBSURFACE`, paint), anim-table runtime | A-8, A-9, A-10, A-11, M-11, M-12, M-13, A-4 | 3f |
| View sync and interpolation, remote smoothing in the view, cameras, `project`, instancing, crowds, audio service (#67) | E-6, E-11, N-15 (view), S-1 `project`, #67 | 3g |
| Kits: terrain (heightfield, `materialAt`, chunked LOD mesh), vehicle (Rapier ray-cast controller), coverage (dirt/mud), fx (particle and mark pools) | M-10, L-5, design §7.3 | 3h |
| `net` part: auto-replication, `F.body()`, remote modes driven/proxy/view, correction, tunables, `mp()` extras | N-9, N-12…N-17, N-8 (`F.body`), T-11 (rest) | 3i |
| Game migrations, including each game's cross-game final pass | G-4, G-6, phase table rows 3–5 | 3j, 3k, 3l |
| Integration, spec and CHANGELOG, final review | G-3, G-5 | 3m |

### 1.2 Out of scope

- Fields (M-14…M-18), aero panels and closed volumes in sidecars, the panel bake.
- Kit-herd. Chicken, pig and herd AI stay in the games.
- Rally's tyre model as a vehicle-kit backend. Rally keeps its custom ray-cast vehicle and drivetrain.
- PWA template and update flow (P-1…P-3). Each game keeps its `sw.js`, which gains only a precache list.
- Shared build mode (B-4).
- `lion-hawk release` and `lion-hawk test`. Games keep `npm test`, which calls the `checks.*` helpers.
- KTX2 and WebP texture compression (A-3 textures). Textures pass through.
- Draco.
- lil-gui `?tune` (D-2). Tunables are exposed as data, and Tractor keeps its `tune` command.
- Snapshot, restore and fork of a World (T-7 with Rapier).
- Browser tape recording (#98).

### 1.3 Done when

- Every game's unit, e2e and mobile suites pass on engine 0.11.0. Every golden is either bit-exact or re-blessed under §5.5.
- `npm test` in `games/` passes. The engine suite passes.
- No game file imports `assets.json`, calls `new RAPIER.World`, calls `ColliderDesc.*` or sets a literal friction, density or restitution. Two exceptions, each marked `// lh-allow: <reason>` and listed in the game's notes:
  - `body.massProps` (D3);
  - raw Rapier queries (raycasts and shape casts are allowed: L-1).
- Each game builds with `lion-hawk build` to a scratch `--out`. Size and load are measured against today's single file (§8, R3).
- The frame-rate check (§8, R1) is recorded per game.
- Tractor passes the bump test (N-14…N-16) under 80 ms latency and 2% loss, headless (`mp`) and in two pages (`peers`).

---

## 2. Spec deltas (recommended; the integrator writes them into `spec.md` in 3a once the user approves)

| # | Spec | Delta | Why |
|---|---|---|---|
| D1 | B-3, A-1 | A "single" build is one HTML file plus `assets/models/*.glb` and `*.anim.json` beside it. The service worker precaches all of them. Sidecars and code stay inside the page. | User decision. Base64 GLBs grow by a third and block parsing. |
| D2 | A-1, A-5, A-6 | The bake writes to `<game>/baked/`, which is **committed**. Sidecars go into one `baked/phys.json` keyed by model, which the sim imports as JSON. `col-cylinder` joins the collider shapes. A node's `extras.material` overrides its inherited material. | The sim needs sidecars synchronously in Node and in the bundle. Tests must not need the Kenney pack. Pig Pens has cylinder obstacles. |
| D3 | M-6 | `body: { mass }` scales every collider's density so the body weighs `mass` (centre of mass and inertia stay geometric). `body: { massProps: { mass, com, inertia } }` sets them explicitly and is marked `// lh-allow`. | Tractor's 1400 kg body with tuned inertia, and Pig Pens' 60/12 kg pigs, were tuned by playtest. Refitting them is a feel risk. |
| D4 | M-7, M-9 | Pair `friction` and `restitution` overrides apply only where the engine computes a contact itself: vehicle-kit wheels, and `materials.pair()` reads in kits and games. Rapier contacts use the combine rules only. | Rapier JS has `filterContactPair` but no solver-contact modification hook. |
| D5 | M-11 | The compiler has a per-game `shading: 'physical' \| 'standard' \| 'lambert'` tier (default `physical`). Lambert and standard honour `COVERAGE` and `FUR`. Physical-only `look` fields are ignored below `physical`. Vertex colours, when a mesh has them, replace `look.color`. | iPad budget (survey risk). A measured regression then has a way out without rewriting materials. Kenney art is vertex-coloured. |
| D6 | M-2, M-3 | A material may carry a free-form `game: {...}` block. It is not validated and is copied through `extends`. | Tractor's `grip`/`vmul` and Rally's blend keys can stay without schema churn. |
| D7 | E-9, N-8 | `e.id` is unique within a World (a counter from 1, reset by `clear()`). A replicated entity also carries `e.netId` in its kind's `idMin..idMax`. | Tractor's kinds overlap ID ranges (tree 0..1023, animal 0..MAX_ID). |
| D8 | N-12 | `proxy` and `view` remotes take `follow: 'interp' \| 'forecast'` (default `interp`). | Tractor draws other trains by forecast (M-65), not 100 ms late. |
| D9 | L-3, #11 | The engine never imports Rapier: the game passes its initialised module, `defineGame({ physics: { rapier } })`. Engine **view** modules import `three` and `three/addons/*` directly, and builds must use `lion-hawk build` (dedupe). Sim modules still import neither. | Two Rapier WASM instances in one Node process crash when objects cross between them. The three.js addons import `three` themselves. |

Not deltas, but recorded here so plans agree:
- Baked animation tables live in `<model>.anim.json`, which only the view reads (A-8 holds).
- The physics stage names stay `pre` and `post` in code. The spec's `systems.pre` means `pre`.

---

## 3. Package and file layout

### 3.1 New and changed engine files (owner sub-plan in brackets)

```
src/
  core/engine.js            [3a, then 3c in Wave A; frozen after 0.8.0 — changes via integrator]
  core/schedule.js          [3c]  (no new stages; physics systems live in 'physics.world')
  defs/
    materials.js            [3b]  defineMaterials, validation, pair resolution, hashing
    materials.base.js       [3b]  BASE_MATERIALS (the 18)
    sidecar.js              [3b]  SIDECAR_VERSION, validateSidecar, validatePhys
    fields.js               [3i]  + F.body(), kind({ remote, follow, tune, send })
  sim/
    world/world.js          [3c]  createWorld, entity lifecycle, queries, ids
    world/pool.js           [3c]  transform pool (E-10)
    world/place.js          [3c]
    world/install.js        [3c]  wires a World into the engine (scene enter/exit, systems, state digest)
    physics/rapier.js       [3c]  world creation, pinned params, step, timing
    physics/colliders.js    [3c]  sidecar/inline collider → Rapier, materials, combine rules
    physics/groups.js       [3c]  named collision groups
    physics/events.js       [3c]  contact and sensor events
    physics/heightfield.js  [3c]  row-major heights → Rapier heightfield (the column-major quirk)
    net/replicate.js        [3i]  record/apply, send clock, store → world
    net/remote.js           [3i]  driven/proxy/view, correction, input jitter buffer
    net/install.js          [3i]  the built-in net.* handlers (via the 3c seam)
    replica.js, interp.js, forecast.js  [3i]  (only if needed; existing behaviour unchanged)
  view/
    boot.js                 [3a (#105), then 3e]  render pipeline, seams for 3f/3g
    gesture.js              [3a]  (#109)
    render/renderer.js      [3e]  createRenderer (DPR, shadows, tone mapping, resize)
    render/lights.js        [3e]  createLightRig (hemi + sun following, fog, presets, lerp)
    render/hygiene.js       [3e]  warm, instancedShadows, disposeTree, programCount
    render/snapshot.js      [3e]  thumbnail render-to-dataURL
    render/tiltShift.js     [3e]  optional post pass (Pig Pens)
    assets/index.js         [3f]  createAssets (stub by 3e until 3f lands)
    assets/loader.js        [3f]  one GLTFLoader + MeshoptDecoder
    assets/animTable.js     [3f]  anim-table decode and sample
    materials/compiler.js   [3f]  createMaterialCompiler
    materials/chunks.js     [3f]  onBeforeCompile patches, chunk-name guard
    materials/fur.js        [3f]  furGeometry (shells as geometry groups)
    sync/index.js           [3g]  createViewSync (stub by 3e until 3g lands)
    sync/smooth.js          [3g]  N-15 correction offsets
    camera/chase.js, camera/orbit.js, camera/project.js  [3g]
    instancing/instances.js, instancing/crowd.js         [3g]
    audio/index.js          [3g]  createAudio (stub by 3e until 3g lands)
  kits/
    terrain/sim.js, terrain/view.js     [3h]
    vehicle/sim.js                      [3h]
    coverage/sim.js, coverage/view.js   [3h]
    fx/view.js                          [3h]
testing/
  headless.js               [3a (#100), then 3c]  + world access (T-5)
  invariants.js             [3c]  finite over xf and bodies, always on
  checks.js                 [3c]  determinism, simPurity, zeroAlloc, materials
  mp.js                     [3i]  + drop, blackout, diverged
  playwright.js             [3a]  (#100, #107); later changes via integrator
tools/
  dedupe.js                 [3d]
  bake/*.js                 [3d]  read, conventions, colliders, mass, sockets, animTable, optimise, write
  build/*.js                [3d]  esbuild + dedupe, page template, assets copy, sw stamp, hooks
  dev/*.js                  [3d]
bin/lion-hawk.js            [3d]  CLI dispatcher
```

**Integrator only:** `src/index.sim.js`, `src/index.view.js`, `src/index.net.js`, `testing/index.js`, `src/version.js`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`, this file.

### 3.2 Public exports (exact names; the integrator adds them at each merge)

**`lion-hawk/sim`** adds:
- `defineMaterials`, `BASE_MATERIALS`, `SIDECAR_VERSION`, `validateSidecar`, `validatePhys` (3b);
- `createWorld`, `heightfieldDesc` (3c). Normally the engine creates the World; tests and kits call these directly.

`F` gains `F.body` (3i).

**`lion-hawk/view`** adds:
- 3e: `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift`;
- 3f: `createAssets`, `createMaterialCompiler`, `furGeometry`, `sampleAnimTable`;
- 3g: `createViewSync`, `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd`, `createAudio`.

**`lion-hawk/net`:** no new exports. The net part lives in the sim.

**`lion-hawk/kits/terrain`** `{ createTerrain }`, **`lion-hawk/kits/terrain/view`** `{ createTerrainMesh }`.
**`lion-hawk/kits/vehicle`** `{ createVehicle }`.
**`lion-hawk/kits/coverage`** `{ coverageKit }`, **`lion-hawk/kits/coverage/view`** `{ coverageView }`.
**`lion-hawk/kits/fx/view`** `{ createParticles, createMarks }`.
Exports map entries: `"./kits/*/view": "./src/kits/*/view.js"` and `"./kits/*": "./src/kits/*/sim.js"`.

**`lion-hawk/test`** adds `checks` (`{ determinism, simPurity, zeroAlloc, materials }`).
**`lion-hawk/bake`** (`./tools/bake/index.js`): `{ bake, loadConfig }`, programmatic, for tests.
**`lion-hawk/build`** keeps `dedupe` and adds `build` (`./tools/build/index.js`).
**`bin`**: `"lion-hawk": "bin/lion-hawk.js"`.

New dependencies, added in 3a by the integrator: `@gltf-transform/core`, `@gltf-transform/extensions` and `@gltf-transform/functions` (^4.5), and `meshoptimizer`, all as `dependencies` (bake and build). `three` and `@dimforge/rapier3d-compat` stay peer and dev dependencies.

---

## 4. Interface contract

Notation: `→` returns. "Produced by" names the sub-plan that builds the interface; "Consumed by" names the ones that may rely on it. All sim code is sim-pure (§7).

### 4.1 Game declaration additions (produced by 3b/3c/3i; consumed by all)

```js
import RAPIER from '@dimforge/rapier3d-compat';        // the GAME imports Rapier (D9)
import MATERIALS from './defs/materials.js';            // defineMaterials(...)
import PHYS from '../baked/phys.json' with { type: 'json' };
export default defineGame({
  id: 'tractor-pickup',
  sim: { hz: 60, maxCatchUp: 3 },
  defs: { materials: MATERIALS, models: PHYS },         // models optional (inline colliders work without)
  physics: {
    rapier: RAPIER,                                     // initialised (await RAPIER.init() in the entry and the test)
    gravity: [0, -9.81, 0],
    params: { numSolverIterations: 4 },                 // merged over PINNED_DEFAULTS (§4.5)
    groups: ['ground', 'static', 'vehicle', 'trailer', 'prop', 'wall'], // ≤ 16 names
  },
  net: { ...today's net config, world: true },          // world: replicate entities with `net` parts (3i)
  reset() { /* 3a, #108: restore module tunables; called first in createEngine */ },
  scenes, start, policies, commands, debug,
});
```

- Without `physics.rapier`, the World still exists but holds only bodiless entities. A spawn with `body` or colliders throws `world: '<desc>' needs a body but the game has no physics.rapier`.
- `createEngine` checks that `rapier` has been initialised (a guarded `new rapier.World`). If not, it throws `physics: await RAPIER.init() before createEngine`.
- `defs.materials` defaults to a registry of the base library only.

### 4.2 Materials (produced by 3b; consumed by 3c, 3d, 3f, 3h, games)

```js
export default defineMaterials({
  pet:   { extends: 'flesh', look: { roughness: 0.85 }, sound: 'squish' },
  stone: { extends: 'gravel', phys: { friction: 0.7 } },
  route: { extends: 'gravel', game: { grip: 1, vmul: 1 }, dirtRate: 0.006 },
}, {
  pairs: { 'rubber|ice': { friction: 0.1, sound: 'squeal' } },   // unordered key 'a|b'
});
```

- The registry is a frozen object. `extends` resolves at definition time with a deep merge per block, child wins. `game` blocks are copied too.

| Member | Contract |
|---|---|
| `get(id)` | the resolved, frozen material. Throws `materials: unknown material '<id>'`. |
| `has(id)` | boolean. |
| `ids` | frozen array: base library first (in spec order), then game entries in key order. |
| `index(id)` / `byIndex(i)` | stable small integers (0..254). Terrain material grids store them in a `Uint8Array`. More than 255 materials throws. |
| `density(id)` | `sg × 1000 × fill` kg/m³. `sg` defaults to 1 and `fill` to 1. Air or a fluid without `phys.sg` → 0, which is not allowed on colliders. |
| `collider(id)` | `{ friction: √f, restitution: r, density }` for the physics wrapper (D4: √f with `Multiply` gives the geometric mean). Cached. |
| `pair(a, b)` | frozen `{ friction, restitution, tire, sound, fx }`. The pair table entry wins field by field. Otherwise (M-8): friction = √(fa·fb), restitution = max, `sound`/`fx` from the lower `sg`, ties to `a`; `tire` = the entry's, else the ground material's (`b`'s `tire`, else `a`'s). Cached per unordered pair. |
| `hash` | 8-hex FNV-1a of the canonical JSON of the resolved table and pairs. Sidecars record it, and `checks.materials` compares it. |

Validation (M-3) throws on the first error. Message format: `materials: '<id>'.<block>.<field> <problem> (got <value>)`. The cases:
- unknown block;
- an unknown field in a known block;
- out of range: friction 0–2, restitution 0–1, `sg` > 0, `fill` in (0, 1], `look.metalness`/`roughness` 0–1, `coverage.*` 0–1;
- `'<id>' extends unknown '<x>'`;
- `extends cycle a -> b -> a`;
- `pair '<a>|<b>' names unknown material '<x>'`.

`look` fields:
- three.js parameters: `color`, `metalness`, `roughness`, `clearcoat`, `clearcoatRoughness`, `sheen`, `sheenColor`, `sheenRoughness`, `transmission`, `ior`, `thickness`, `opacity`, `transparent`, `emissive`, `emissiveIntensity`, `flatShading`, `side` (`'front' | 'double'`);
- engine extensions: `subsurface: { color, strength }`, `fur: { length, shells, density, tint }`, and `wear` (accepted and ignored in phase 3).

### 4.3 Sidecar and bake (schema by 3b; bake by 3d; consumed by 3c, 3f, games)

**Bake input conventions** (glTF scene, model id = file basename):

| Node or material | Meaning |
|---|---|
| mesh node | a **part**. The part name is the node name. |
| `col-box*`, `col-sphere*`, `col-capsule*`, `col-cylinder*` | a primitive fitted to the node's own mesh bounds in body space. A capsule or cylinder follows the longest axis. The node is not drawn. |
| `col-hull*` | a convex hull of the node's vertices, capped at 64 points (bake decimates). |
| `col-mesh*` | a trimesh: vertices and indices, welded. |
| no `col-*` in the model | one hull per (part, material). With `static: true`, one `col-mesh` per part (A-6). |
| collider material | inherited from the nearest ancestor part, using its largest-area material. The node's `extras.material` overrides it. |
| `sock-<name>` empty | socket `<name>`, `{ p, q }` in body space, plus the parent `part`. |
| material name | a registry id, or `paint-<slot>` (A-4: physics takes `bake.paint.base`, default `steel`). |
| animations | kept in the GLB for `AnimationMixer`. With `animTable: true`, they are also sampled into `<model>.anim.json`. |

**Game config** (`<game>/game.config.js`, Node only, read by the CLI):

```js
export default {
  id: 'tractor-pickup', site: 'tractor-pickup', outEnv: 'TRACTOR_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',                 // module whose default export is the registry
    rename: { materials: { colormap: 'pet', color: 'plastic', woodBark: 'wood' }, nodes: { hat: 'sock-hat' } },
    palette: 'vertex',             // palette textures → COLOR_0 (Tractor's tools/glb.mjs logic, moved)
    paint: { base: 'steel' },
    models: { barn: { static: true, rename: { materials: { planks: 'wood', shingles: 'wood' } }, keepTextures: true },
              pig: { animTable: { fps: 30, clips: ['idle', 'walk', 'run', 'eat', 'dance'] }, sockets: ['hat'] } },
    optimise: { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true },
  },
  build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: './build.hooks.js' },
};
```

- Renames apply before the A-2 checks. A per-model `rename` merges over the global one.
- The checks fail with `bake: <model>: <node|material> <problem>`:
  - a material that is neither in the registry nor `paint-*`;
  - an unsupported `col-*` shape;
  - a missing required socket;
  - a part with no material;
  - a hull with fewer than 4 points.

**Output** (committed, D2):

```
baked/
  phys.json             { v: 1, engine: '0.8.0', materials: '<registry hash>', models: { <id>: Sidecar } }
  manifest.json         { v: 1, models: { <id>: { glb: 'models/<id>.glb', anim: 'models/<id>.anim.json' | null, bytes, sha256 } } }
  models/<id>.glb       optimised; col-* nodes removed; materials renamed to registry ids; sock-* kept
  models/<id>.anim.json { v: 1, fps, parts: [names], clips: { <clip>: { dur, frames, data: '<base64 Float32 frames×parts×12>' } } }
```

**Sidecar** (validated by `validateSidecar`):

```js
{
  v: 1,
  source: { file: 'assets/models/tractor.glb', sha256: '…' },   // `lion-hawk bake --check` compares it
  parts: ['body', 'wheel-front-left', ...],
  colliders: [
    { shape: 'box', half: [x, y, z], p: [x, y, z], q: [x, y, z, w], part: 'body', material: 'steel' },
    { shape: 'sphere', r }, { shape: 'capsule', halfHeight, r }, { shape: 'cylinder', halfHeight, r },
    { shape: 'hull', points: [x, y, z, ...] }, { shape: 'mesh', vertices: [...], indices: [...] },
  ],                                                              // every entry has p, q, part, material
  mass: { mass, com: [x, y, z], inertia: [ix, iy, iz], frame: [x, y, z, w] }, // informational; the bake computes it like Rapier
  sockets: { hat: { p: [x, y, z], q: [x, y, z, w], part: 'body' } },
  bounds: { min: [x, y, z], max: [x, y, z] },
}
```

- Units are metres. Body space is the glTF model space. `+y` is up.
- 3c's tests check `mass` against Rapier's computed mass to 1%.
- Inline colliders in `spawn({ colliders })` use **exactly the same entry shape** (`p`, `q`, `part` optional; `material` required).

**CLI** (3d):
- `lion-hawk bake [--game <dir>] [--check] [ids…]`: `--check` exits 1 when a source sha, the registry hash or the engine major.minor differs from `phys.json`, or a model's bake options differ from the hash in `manifest.json`.
- `lion-hawk build [--game <dir>] (--out <dir> | $<outEnv>) [--site] [--mode single] [--e2e]`:
  - bundles with esbuild plus `dedupe`;
  - writes `index.html` (template `<!--APP-->`), `assets/models/*`, the PWA files and `sw.js` with `__VERSION__` and `__PRECACHE__` (a JSON list) stamped;
  - prints the size report (html, assets, gzip totals);
  - runs `hooks.beforePage(ctx)`/`hooks.page(html, ctx) → html` (Tractor's audio embedding, B-2);
  - refuses a path under `site/exp/` unless `--site` is passed;
  - with no `--out` and no env var, exits 2: `build: pass --out or set $<outEnv>`.
- `lion-hawk dev [--game <dir>] [--port 8740]`: an esbuild context with live reload that serves `baked/models` as `assets/models` and re-bakes a changed source.

### 4.4 World (produced by 3c; consumed by 3h, 3i, 3g, games)

**Ownership (S-3).**
- When a main scene enters, the engine creates `createWorld(engine, { seed })` before the scene's `enter`.
- It disposes the World after `exit`: Rapier objects are freed, and `world.serial` changes so the view drops its objects and per-scene GPU resources.
- Overlays use the main scene's World.
- `ctx.world` (main scene and overlays) and `engine.world` (getter, `undefined` with no main scene) point at it.
- `ctx.load` builds may call `world.clear()` to rebuild in place (Rally restart, Tractor guest farm).

**Entity (E-1, E-4).** A plain object:

```js
{
  id: 7,                       // D7: World-unique, from 1 in spawn order, reset by clear()
  tags: Set(['pig']),
  model: 'pig',                // asset key; sim reads baked sidecar sockets/colliders
  body: RAPIER.RigidBody,      // the real body (L-1), or absent
  colliders: [{ collider: RAPIER.Collider, part: 'body', material: 'pet' }],
  xf: { p: { x, y, z }, q: { x, y, z, w } }, // live accessors onto the pool's CURRENT slot
  sockets: { hat: { p, q, part } },          // body space, frozen, from the sidecar
  net: 'animal', netId: 12, owner: 1,        // 3i
  input: { thr: 0, steer: 0 },               // actor input (I-4), written by input.apply, net or a policy
  paint: { body: '#c33', trim: '#fff' },     // view (paint-* slots)
  scale: 0.62, draw: 'object',               // view: uniform scale; 'object' | 'instanced' | false
  pig: { mood: 0, mud: 0 },                  // game data (E-4)
}
```

**API.**

```js
world.spawn(desc) → e              // E-5: body + colliders made in this call
world.despawn(e)                   // E-7: Rapier objects, pool slot, queries, net record; idempotent
world.place(e, { at: [x,y,z] } | { rel: other, local: [x,y,z] }, { yaw, q, keep = false }) // E-8
world.with(...parts) → Entity[]    // E-3: live, cached, same array every call, spawn order
world.get(id) → e | undefined
world.add(e, part, value) / world.remove(e, part)  // part changes update queries; 'body'/'model' cannot be added after spawn
world.clear()                      // despawn all, recreate the Rapier world, reset ids and pool
world.socket(e, name, out) → out   // world-space { p, q } of a socket (out reused)
world.xfPrev(e, out) → out         // previous-step pose
world.materialOf(colliderHandle) → id | undefined   // M-5 map
world.entityOf(colliderHandle) → e | undefined
world.heightfield({ nx, nz, cell, x0, z0, heights, material, groups }) → e  // row-major heights[iz*nx+ix]
world.groups                       // { ground: 1, static: 2, ... } and world.groups.mask(member, filter) → u32
world.rapier, world.R              // RAPIER.World and the module (L-1)
world.materials                    // the registry
world.serial                       // increments on create/clear (view drops its objects)
world.stats                        // { entities, bodies, colliders, stepMs } (stepMs only with a timer, #106)
world.xf                           // { pool: Float64Array, stride: 14 } read-only for the view
world.digest() → { n, sum }        // checksum part: ids, pool curr, linvel/angvel bits
```

**`spawn(desc)`:**

```js
world.spawn({
  model: 'tractor',                 // sidecar colliders/sockets; omit for inline-only
  colliders: [{ shape: 'ball'... }],// inline: REPLACES the sidecar's colliders when both are given
  body: 'dynamic' | 'kinematic' | 'fixed' |
        { type, lock: { rot: true } | { x, y, z }, ccd, linearDamping, angularDamping,
          sleep: true, canSleep, mass, massProps: { mass, com, inertia } },   // D3
  material: { '*': 'rubber', wheel: 'rubber' },   // per-part overrides (spec §2.2)
  groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop', 'wall'] }, // default: member [], filter all
  at: [x, y, z], yaw: 0, q: null,
  tags: ['pig'], xf: true,          // xf: true gives a bodiless entity a pool slot
  contacts: { min: 40 },            // opt-in contact events, impulse threshold N·s (§4.5)
  sensor: false,                    // all colliders become sensors (sensor events)
  net: 'animal', netId, owner,      // 3i
  ...gameFields,                    // copied onto e as is
});
```

Spawn throws (with the desc's tags or model in the message):
- an unknown material;
- an unknown model or socket;
- a zero-density collider on a dynamic body without `massProps`;
- a group name not declared.

**Transform pool (E-10).**
- One `Float64Array` with `stride` 14 per slot: `[px,py,pz,qx,qy,qz,qw]` prev, then the same for curr. Slots are allocated at spawn from a free list, lowest first, so allocation is deterministic.
- The pool doubles when full, at spawn, never inside a step.
- `e.xf.p` and `e.xf.q` are accessor objects made once at spawn that read and write **curr**. A write to a body entity's `xf` throws (`world.place` is the way).
- Per step (Decision: copy, not pointer flip, so bodiless entities that game code does not move every step keep `prev == curr`):
  1. `lh.world.swap` (stage `input.apply`, before `lh.ui`) copies curr → prev for every live slot;
  2. game and kit systems run;
  3. `lh.physics.step` steps Rapier;
  4. `lh.physics.read` writes curr from every non-sleeping body.
- `place` writes prev and curr (no smear), wakes the body, zeroes velocities unless `keep`, and sets kinematic next poses.
- Cost: 14 floats per entity copied per step.

**Systems the World installs (stage, order):**
- `lh.world.swap` (`input.apply`, before `lh.ui`);
- `lh.physics.step` (`physics.world`);
- `lh.physics.read` (`physics.world`, after `lh.physics.step`);
- `lh.physics.events` (`physics.world`, after `lh.physics.read`).

Kits put pre-step work in `physics.world` with `before: ['lh.physics.step']` (vehicle `updateVehicle`). 3i's net systems are `lh.net.recv` (`pre`, before `lh.scene`) and `lh.net.send` (registered with `engine.onStep`).

**Engine seam for 3i (3c adds it to engine.js).**
- `engine.builtin(type, fn)` registers an engine-level command handler. `deliver` runs it before the game's handler and the scene handlers. The game's handler for the same type still runs afterwards, so during migration Tractor can observe frames.
- `engine.state()` gains `world: world.digest()` only while the World has at least one entity. Un-migrated goldens are unaffected.

**Headless additions (T-5, 3c in testing/headless.js):**
- `h.world`;
- `h.find(name, where)`: a bare `name` matches a tag or a `net` kind. `where` is a predicate or a partial object compared with `===` on top-level fields;
- `h.one(name, where)`: throws unless there is exactly one match;
- `h.get(id)`, `h.spawn(desc)`, `h.despawn(e)`, `h.place(e, at, opts)`.

`invariants.finite` stays. A built-in finite check over every pool slot and every body's velocities runs after each `h.step` whenever a World has entities. Its message is `finite: entity <id> (<tags>) <field> is <value> (seed, step)`.

**Checks (T-10, T-12, T-13, T-14, `testing/checks.js`).**
- `checks.determinism(game, { seed, steps, input })` → `{ ok, step, a, b }` (first differing checksum).
- `checks.simPurity(game, { roots })` reuses `scanPurity` over the game's sim roots.
- `checks.zeroAlloc(game, { steps = 10000, warm = 600 })` is meant to run under `--expose-gc` (a child process when the flag is absent). It reports **retained** heap growth over the steps, which must stay under 64 KB. Garbage that Rapier makes per call (its JS vector objects) is collected and does not count.
- `checks.materials(game)` verifies:
  - every material named in `defs.models` sidecars, inline-collider fixtures and `world.heightfield` calls exists;
  - `phys.json.materials === registry.hash`.

### 4.5 Physics wrapper (produced by 3c; consumed by 3h, 3i, games)

- **Creation.** `new R.World(gravity)`, then:
  - `world.timestep = 1 / game.sim.hz`;
  - every field of `world.integrationParameters` that Rapier 0.21 exposes is written from `{ ...PINNED_DEFAULTS, ...physics.params }`. `PINNED_DEFAULTS` is a table in `physics/rapier.js` equal to 0.21.0's own defaults, captured by a test (#1). A Rapier bump that changes a default then fails that test instead of silently changing feel.
- **Colliders.**
  - `ColliderDesc.<shape>` from the sidecar or inline entry, with translation and rotation;
  - density from `materials.density`, rescaled for `body.mass`, or 0 with `massProps` (then `setAdditionalMassProperties`);
  - friction `√f` with `CoefficientCombineRule.Multiply`, restitution with `Max` (M-9, D4);
  - collision groups from `groups`;
  - `ActiveEvents` only as opted in.
  - `world.materialOf` maps each collider handle to its material id.
- **Combine priority.** Rapier applies the higher-priority rule (Average < Min < Multiply < Max) when two colliders differ. Engine colliders always agree. A raw game collider that sets its own rule wins, which is allowed but flagged under `?debug` once per collider.
- **Runtime material swap** (Pig Pens' slide/grip toggle): `world.setMaterial(e, part | '*', id)` resets friction, restitution and density on those colliders. Mass is recomputed only when `density` changes.
- **Heightfield.** `heightfieldDesc(R, { nx, nz, cell, x0, z0, heights })` takes **row-major** `heights[iz*nx+ix]`. It reorders to Rapier's column-major layout, passes subdivision counts `(nz-1, nx-1)` and the full extent as scale, and translates to the field's centre (Rally's `trackWorld.js:21-27`, moved). With `fixInternalEdges`, `HeightFieldFlags.FIX_INTERNAL_EDGES` is set. A test drops a ball on a sloped field and asserts it rests where `heightAt` says.
- **Sleep (#2).** A `body: { sleep: true }` is inserted asleep. After its first step it is put back to sleep unless `|v| > 0.2` or `|ω| > 0.5` (Rally's `afterStep`, moved).
- **Contact events (M-5).**
  - Colliders of an entity with `contacts` get `CONTACT_FORCE_EVENTS` and a threshold of `min × hz` (force).
  - Drained after the step into `engine.emit('contact', { a, b, materials: [ma, mb], impulse, point: [x, y, z] })`. `a` and `b` are entity ids, `impulse = totalForceMagnitude / hz`, and `point` is the first solver contact of `world.rapier.contactPair` (or the midpoint of the two bodies when there is none).
  - Sensor colliders emit `sensor { sensor, other, on }` from collision events.
  - Event order is the Rapier drain order, which is deterministic.
- **Joints.** `world.joint(a, b, desc)` → `RAPIER.ImpulseJoint`: a thin wrapper that records the joint on both entities so `despawn` frees it (Tractor's hitch). Joint descs are raw Rapier (L-1).
- **Vehicle hook.** None in the wrapper. 3h's kit creates `world.rapier.createVehicleController(e.body)` and registers its update before `lh.physics.step`.
- **Timing (#106).** `createEngine(game, { timer })` / `boot(..., { timer })`. With a timer (the browser entry passes `performance.now` under `?fps`), `world.stats.stepMs` holds the last Rapier step's ms and `stats.stepMsTotal` a running total. Neither is in state or checksums.
- **Freeing.** `despawn` removes bodies with their colliders (`removeRigidBody`) and frees joints and controllers registered through `world.own(e, freeFn)`. `dispose` calls `rapier.free()` and frees the event queue.

### 4.6 View: renderer, lights and hygiene (produced by 3e; consumed by 3f, 3g, 3h, games)

```js
defineView({ scenes, render: {
  shading: 'physical',                         // D5 tier, passed to the compiler
  dpr: { touch: 1.5, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none' | 'aces', exposure: 1,
  camera: { fov: 60, fovPortrait: 64, near: 0.3, far: 500 },
  lights: { sky: '#bfe6f5', ground: '#b9a27c', hemi: 1.3, sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: [-26, 46, 22] },
            fog: [90, 220], presets: { day: {...}, dusk: {...}, night: {...} } },
} });
boot(game, view, { canvas, timer, ... });
```

- With `render` declared, `boot` builds `view.gfx = { renderer, scene, camera, lights, resize(), size: { w, h } }`, `view.assets`, `view.materials` (the compiler), `view.sync`, `view.audio` and `engine.assets` (view-only; `undefined` headless). Without `render`, boot behaves exactly as in 0.7 (games migrate one at a time).
- Boot's render slot runs:
  1. reconcile;
  2. `view.sync.frame(alpha)`;
  3. each view half's `frame`;
  4. `view.gfx.render()` (one `renderer.render(scene, camera)`).
- `createRenderer({ canvas, dpr, antialias, shadows, toneMapping, exposure, camera })` → `{ renderer, scene, camera, resize, render, dispose, info() }`. `resize` reads the canvas client size, caps DPR by `navigator.maxTouchPoints > 1`, and sets the portrait FOV when aspect < 0.9.
- `createLightRig(scene, opts)` → `{ hemi, sun, follow(x, z), set(preset | k), lerp(a, b, k) }`. A preset change touches colours and intensities only, never shader-affecting state.
- Hygiene:
  - `warm(renderer, scene, camera)` → Promise (Tractor's `warmShaders`, plus every material the compiler has made, on a hidden warm group);
  - `instancedShadows(root)` (always applied by sync to its instanced meshes);
  - `disposeTree(root, { keepShared })`;
  - `programCount(renderer)`.
- `snapshot(renderer, object, { size, camera }) → dataURL` (Tractor's three thumbnail copies).
- `createTiltShift(renderer, opts)` (Pig Pens' post pass, made generic).
- 3e also creates stub `src/view/assets/index.js`, `src/view/sync/index.js` and `src/view/audio/index.js` with the signatures below that return inert objects. The owners (3f, 3g) replace them wholesale; at merge the owner's file wins.

### 4.7 Assets and loader (produced by 3f; consumed by 3g, 3h, games)

```js
const assets = createAssets({ manifest, base: './assets/', compiler, renderer });
await view.wait(assets.preload(['tractor', 'pig'], { instanced: ['pig'] }));   // A-10; resolves after warm(); instanced: their instanced variants are warmed too
assets.progress                    // { loaded, total, bytes }
assets.has(key); assets.get(key)   // → { scene, clips, anim, sockets } (template; throws if not preloaded)
assets.clone(key, { paint, instanced = false }) → THREE.Object3D   // materials compiled via compiler.apply
assets.dispose()
```

- There is one `GLTFLoader` per page, with `MeshoptDecoder` (A-9). Cache: `Map<url, Promise<gltf>>`.
- `clone` uses `SkeletonUtils.clone` for skinned scenes and `scene.clone(true)` otherwise. Geometries are shared and materials come from the compiler.
- The manifest is `baked/manifest.json`, imported by the game's view entry. URLs resolve against `base`.
- Headless and Node have no assets. Sim code never references `engine.assets`.
- `sampleAnimTable(table, clip, t, partIndex, outMatrix4)` and the blend helper live in `assets/animTable.js`. They replace Pig Pens' and Tractor's `animM`/`sampleAnim`.

### 4.8 Material compiler (produced by 3f; consumed by 3g, 3h, games)

```js
const mc = createMaterialCompiler(registry, { shading: 'physical' });
mc.get(id, { instanced = false, vertexColors = false, skinned = false, receiveShadow = true, map = null }) → THREE.Material
mc.paint(id, color, opts) → THREE.Material     // one clone per (key, colour); shares the program
mc.coverage(material) → { material, uniforms: { uCoverage: THREE.Vector4 } } // per-entity clone, same program
mc.apply(root, { instanced, paint, coverage }) // replaces every mesh material by name (registry id or paint-<slot>)
mc.furGeometry(geometry, mask) → geometry      // shells as a second group (Pig Pens fur.js)
mc.keys() → string[]; mc.dispose()
```

- **Base class.** By tier:
  - `MeshPhysicalMaterial` (physical);
  - `MeshStandardMaterial` (standard);
  - `MeshLambertMaterial` (lambert).

  `look` maps onto its parameters; fields the class lacks are dropped.
- **Defines** (M-11) are set from the material:
  - `COVERAGE`: the material has a `coverage` block. `uCoverage` is a `vec4` (dirt, rust, snow, mud), with object-space noise as in Tractor's `dirtMat.js`.
  - `FUR`: `look.fur`. Shell attributes `furNormal`, `furMask`, `furShell`.
  - `SUBSURFACE`: `look.subsurface`. A wrap-lighting term; physical and standard only.
- **Cache key** = `id|tier|instanced|vertexColors|skinned|receiveShadow|map.uuid|features`. Separate instanced and plain users therefore get separate materials by construction (M-13 matSplit, always on). `customProgramCacheKey` returns the feature string.
- **Chunk guard.** Patches name `#include <common>`, `<color_fragment>`, `<worldpos_vertex>` and `<lights_fragment_end>`. A unit test asserts each exists in `THREE.ShaderLib` for every tier, so a three.js bump fails loudly.
- **Colours.** With a `color` attribute, vertex colours replace `look.color` (D5). A glTF base-colour texture is kept as `map` (the barn).
- **Paint.** `paint-<slot>`: on plain meshes, `mc.paint` (per-colour clone). On instanced meshes, `instanceColor` with the base material.

### 4.9 View sync, interpolation and smoothing (produced by 3g; consumed by games)

```js
const sync = createViewSync(engine, { gfx, assets, compiler });  // made by boot
sync.frame(alpha)                  // E-6/E-11: create, update, remove
sync.objectOf(e) → Object3D | undefined
sync.on(match, { create(e, obj, view), frame(e, obj, alpha, view), remove(e, obj) }) → off
```

- `match` is `'#tag'`, `'model:<key>'`, `'net:<kind>'` or a predicate.
- Drawn entities are those with `model` and `draw !== false`.
- `draw: 'instanced'` joins one `createInstances` per (model, part) and gets `instancedShadows`. `draw: 'object'` (the default) gets `assets.clone(model, { paint })`.
- Each frame, for every drawn entity:
  - position = lerp(prev, curr, alpha); rotation = normalised nlerp (slerp-equivalent at step sizes) from `world.xf.pool`; scale = `e.scale ?? 1`;
  - plus the N-15 offset.
- **N-15 contract (with 3i).** On every correction the sim sets `e.netFix = { seq, dp: [x, y, z], dq: [x, y, z, w] }`, the drawn-pose jump (old pose − new pose). `sync/smooth.js` sees a new `seq`, adds the jump to the entity's offset and fades it over the kind's `tune.smoothMs` on view frame time (`view.dt`).
- **World change.** When `world.serial` changes, every object is removed and `disposeTree` runs on the per-scene objects (S-3).
- **No allocation per frame:** `Map<id, record>`, reused math objects.
- **Cameras.**
  - `createChaseRig(camera, { distance, height, lag, lookAhead })` → `{ follow(pose, dt), snap(pose) }`;
  - `createOrbitRig(camera, { target, distance, min, max, pitch })` → `{ update(dt), bindGesture(engine, el), ray(cx, cy, out) }` (Pig Pens' `rig.js`);
  - `createMountRig(camera, { socket })` (Rally's bumper and bonnet);
  - `makeProject(camera, canvas)` → `view.project` per S-1 (`{ x, y, z, onScreen }`).
- **Instancing.** `createInstances({ geometry, material, max, castShadow, receiveShadow })` → `{ mesh, count, set(i, p, q, s), color(i, c), commit() }`.
- **Crowds.** `createCrowd(asset, { max, compiler })` → per-part `InstancedMesh`es driven by anim tables: `set(i, pose, clip, t, blend?)` where `blend = { clip, t, k }`, then `commit()`.
- **Audio (#67).** `createAudio({ doc, flags })` → `{ ctx, master, unlocked, onUnlock(fn), load(url) → Promise<AudioBuffer>, play(buffer, { gain, rate, pan }) → handle, mute(on), dispose }`.
  - It unlocks on the first capturing `pointerdown`/`keydown`/`touchend`.
  - It suspends while the tab is hidden and resumes on return.
  - `?mute` starts muted.
  - The master bus has a compressor limiter.

### 4.10 Kits (produced by 3h; consumed by games)

```js
// lion-hawk/kits/terrain (sim)
const terrain = createTerrain(world, { nx, nz, cell, x0, z0, heights /* row-major */,
  materials: Uint8Array /* registry.index per cell */ | ((x, z) => id), blend?: (x, z, out) => out });
terrain.heightAt(x, z); terrain.normalAt(x, z, out); terrain.materialAt(x, z) → id  // M-10
terrain.blendAt(x, z, out) → { a, b, w }    // optional, for Rally's blended tyre surfaces
terrain.entity                              // the heightfield entity (groups: ground)
// lion-hawk/kits/terrain/view
createTerrainMesh(terrain, { compiler, chunks: [6, 6], lods: [1, 2, 4], colorAt(x, z, out), material: 'grass' }) → { group, update(camera) }
// lion-hawk/kits/vehicle (sim)
const car = createVehicle(world, e, { wheels: [{ at | socket, radius, front, suspension: { rest, stiffness, compression, relaxation, travel, maxForce } }],
  rayGroups: { member: [], filter: ['ground', 'static'] }, terrain });
car.controller                              // the RAPIER DynamicRayCastVehicleController (L-1)
car.wheels[i]                               // { inContact, point, normal, material, suspension, steering } (design §7.3), reused objects
car.set(i, { steer, engine, brake, slip, side }); // per wheel; tuning stays game-side
// update runs automatically before lh.physics.step; material = the ground collider's, or terrain.materialAt
// lion-hawk/kits/coverage
coverageKit(engine, { washes: [(x, z) => bool] }) // entities with `coverage: { dirt, mud, snow }` gain dirtRate × metres on materialAt
coverageView(sync, compiler)                      // feeds uCoverage per entity
// lion-hawk/kits/fx/view
createParticles({ max, shape: 'cube' | 'quad', material }) → { emit(x, y, z, vx, vy, vz, life, size, color), update(dt), mesh }
createMarks({ max, width, material }) → { add(x, z, nx, nz, alpha), update(dt), mesh }
```

Cosmetic randomness in kits uses `engine.rng('fx')` (U-6).

### 4.11 Net part (produced by 3i; consumed by 3g (netFix), Tractor)

```js
const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', max: 1, idMin: 1, idMax: 4,
  remote: 'driven',                         // default: driven for owner kinds with input, proxy for host kinds
  follow: 'interp',                         // D8, for proxy/view
  tune: { snapAt: 1.5, nudge: 6, smoothMs: 150 }, // N-17: live-editable object (world.net.tunables.train)
  send: { hz: 20, key: 2 },                 // N-11: diffs every round(hz_sim / 20) steps, keyframe every 2 s
  fields: { body: F.body(), input: F.actions(ACTIONS), mode: F.oneOf([...]) },
  record(e, out) { ... }, apply(e, rec, world) { ... }, newer(old, rec) { ... } });
```

- `F.body({ range = 400, height = 50 })` encodes `{ p, q, v, w }` at Tractor's precision: p.x/p.z in steps of 1/64 m, p.y in steps of 1/256 m, `v` ±32 in steps of 1/1000, `w` ±16 in steps of 1/2000. Its default record reads `e.body` (or the pool for bodiless entities).
- **Default record (N-9).** For each field `k`: `body` comes from Rapier, `input` from `e.input`, everything else from `e[k]`. `apply` writes them back. `record`/`apply` override it.
- **Host.** It owns `host` kinds and sends its own `owner` records. A guest owns its `owner` entity (`world.net.self` = the player number, set by the game, #77).
- **Receive.** A built-in `net.frame` handler (through `engine.builtin`):
  1. `frameFromJson`;
  2. store;
  3. spawn, apply or despawn entities with `{ net, netId }`.

  On a guest only replication may spawn or despawn host-authority kinds (E-7); a game spawn throws.
- **Remote modes.**
  - **proxy:** the body is kinematic. In `pre` the next pose = interp sample at `engine.time.wall` (or forecast, D8).
  - **view:** bodiless. The pool is written the same way.
  - **driven (N-13, N-14).** Inputs come batched in the record (`input` plus a step stamp and the inputs before it: 8, or 2 × the steps per send when that is more, up to 64). Receivers keep a jitter queue: each local step takes one, holds the last when it is empty, and drops to the newest `max(2, every − 1)` when it grows past `max(4, every + 1)`, where `every` is the steps per send.
    - On a body snapshot, the snapshot is projected by the one-way latency (`offset` from interp). If the error is under `snapAt` and 30°, velocities are steered toward it over `nudge` steps; otherwise the body is set (`place` with `keep`).
    - Every correction sets `e.netFix` (§4.9).
- **Determinism.** Everything runs on sim steps, `engine.time.wall` and command `at` stamps, so guest tapes replay alone (#78).
- **`mp()` additions (T-11):** `w.drop(peer)`, `w.blackout(seconds, { kinds })`, `w.diverged({ agree })` over `net` entities (position tolerance per kind).
- **NET_VERSION** stays the game's. The engine's `{ engine, game, schema }` join check (N-6) is unchanged.

---

## 5. Waves and parallelism

### 5.1 Dependency graph

```
3a carryovers ──► (0.7.3) ──┬──► 3b materials ──┐
                            ├──► 3c world ──────┼──► (0.8.0) ──┬──► 3f assets+compiler ──┐
                            ├──► 3d bake+cli ───┘              ├──► 3g viewsync+audio ────┼──► (0.9.0) ──► 3j rally, 3k pig pens (view/final steps)
                            └──► 3e render ────────────────────┴──────────(merges with B)┘
                                                               ├──► 3h kits ─────────────► (0.9.0)
                                                               └──► 3i net ──────────────► (0.10.0) ──► 3l tractor (net step)
game plans 3j/3k/3l start their asset and sim steps at 0.8.0, their view steps at 0.9.0
all ──► 3m integration (0.11.0)
```

- Within Wave A, 3b, 3c and 3d build against §4.2–§4.5. 3c and 3d use 3b's registry through its contract. Until 3b merges, 3c tests with a local fixture registry in `test/fixtures/phys/`.
- 3e runs alongside Wave A (it needs only three.js).
- 3g may run alongside 3f with a fake `assets`/`compiler` (box meshes) and merges after 3f.

### 5.2 Sub-plans

| File (`docs/plans/…`) | Branch / worktree | Owns (may touch) | Must not touch |
|---|---|---|---|
| `2026-10-13-phase-3a-carryovers.md` | `phase-3-carryovers` | `src/core/engine.js` (#95 `overlay(name, args, { once })`, #105 `engine.scene.overlayArgs`, #108 `reset`), `src/view/boot.js` (#105: `enter(engine, view, args)`), `src/view/gesture.js` (#109: hold by event `timeStamp`), `testing/headless.js` and `testing/playwright.js` (#100, #107 `peers` default `render: 'manual'`), `test/domAsserts*` (G-E2), new tests | all new phase 3 dirs; integrator files |
| `2026-10-13-phase-3b-materials.md` | `phase-3-materials` | `src/defs/materials.js`, `materials.base.js`, `sidecar.js`, `test/materials*.test.mjs`, `test/sidecar*.test.mjs` | `src/sim/**`, `src/view/**`, `tools/**`, `testing/**` |
| `2026-10-13-phase-3c-world.md` | `phase-3-world` | `src/core/engine.js`, `src/core/schedule.js`, `src/sim/world/**`, `src/sim/physics/**`, `testing/headless.js`, `testing/invariants.js`, `testing/checks.js`, `test/fixtures/phys/**`, `test/world*`, `test/physics*`, `test/checks*` | `src/defs/**` (except reading), `src/view/**`, `tools/**`, `src/sim/replica.js` |
| `2026-10-13-phase-3d-bake.md` | `phase-3-bake` | `tools/**`, `bin/**`, `test/fixtures/models/**`, `test/bake*`, `test/build*`, `test/cli*` | `src/**` (it imports `src/defs/*` only) |
| `2026-10-13-phase-3e-render.md` | `phase-3-render` | `src/view/boot.js`, `src/view/render/**`, stub `src/view/{assets,sync,audio}/index.js`, `test/render*`, `test/e2e-render*` | `src/core/**`, `src/sim/**`, `src/defs/**` |
| `2026-10-13-phase-3f-assets.md` | `phase-3-assets` | `src/view/assets/**`, `src/view/materials/**`, `test/assets*`, `test/compiler*` | `src/view/boot.js`, `src/view/render/**`, `src/sim/**` |
| `2026-10-13-phase-3g-viewsync.md` | `phase-3-viewsync` | `src/view/sync/**`, `src/view/camera/**`, `src/view/instancing/**`, `src/view/audio/**`, `test/sync*`, `test/camera*`, `test/audio*` | `src/view/boot.js` (seams only, by request), `src/sim/**` |
| `2026-10-13-phase-3h-kits.md` | `phase-3-kits` | `src/kits/**`, `test/kits/**` | everything else |
| `2026-10-13-phase-3i-net.md` | `phase-3-net` | `src/sim/net/**`, `src/defs/fields.js`, `src/sim/{replica,interp,forecast}.js`, `testing/mp.js`, `test/net*`, `test/mp*` | `src/core/engine.js` (uses the `builtin` seam), `src/view/**` |
| `2026-10-13-phase-3j-rally.md` | four43 `feat/lion-hawk-3-rally` | `games/rally/**` | other games, `games/test/**` (request it), `site/**` |
| `2026-10-13-phase-3k-pigpens.md` | four43 `feat/lion-hawk-3-pigpens` | `games/pig-pens/**` | as above |
| `2026-10-13-phase-3l-tractor.md` | four43 `feat/lion-hawk-3-tractor` | `games/tractor-pickup/**` | as above |
| `2026-10-13-phase-3m-integration.md` | integrator on `phase-3` and `feat/lion-hawk-3` | integrator files, `games/test/**`, merges, cross-cutting fixes | — |

Rules for every sub-plan:
- New tests go in new files.
- Shared helpers are new files under `test/helpers/`.
- Notes go in the sub-plan's own `…-notes.md`, with a "field note candidates" section that the integrator numbers from #110.
- A needed change outside the plan's own files is a written request to the integrator, never an edit.

### 5.3 What each game plan contains (in this order)

1. **Assets** (needs 0.8.0):
   - add `game.config.js`;
   - add `src/defs/materials.js`;
   - vendor sources;
   - `lion-hawk bake`;
   - commit `baked/`;
   - add a parity test: per model, the baked part vertex counts equal those in today's `assets.json`.
2. **Sim onto the World** (0.8.0; kits at 0.9.0): spawn bodies through the World, drop the hand-built worlds, materials in place of literal friction, `materialAt` in place of `SURFACES`/`DIRT`, the feel metrics, then golden re-blessing (§5.5).
3. **View onto the engine renderer** (0.9.0): `defineView({ render })`, `assets.preload` in the loading flow, compiler materials, view sync, rigs, instancing/crowds, audio; then delete `gfx.js`, `warm.js`, `matSplit.js`, `shadows.js`, `dispose.js` and the per-game renderer bootstraps.
4. **Net** (Tractor only, 0.10.0): kinds on `net` parts, NET_VERSION 4, bump test, two-page test.
5. **Final pass:**
   - the survey's cross-game items for that game;
   - `lion-hawk build --out $SCRATCH`;
   - the size report;
   - the frame-rate record (§8 R1);
   - version bump (minor);
   - notes.

Cross-game final-pass items, by game:
- **Rally (3j):**
  - restore the stage view's `built` hook (#50);
  - body classes vs `data-lh-*`;
  - keep `s.ctx` out of serialised state;
  - retire `dev.mjs` once `lion-hawk dev` works.
- **Pig Pens (3k):**
  - ≥44 px with a plain `expectTappable`;
  - adopt `bindGesture` and `uncapped` (#56, #59);
  - a hose `move` assertion;
  - `pressing` during an orbit;
  - the HUD selection string;
  - add `PIGPENS_OUT` (via `outEnv`).
- **Tractor (3l):**
  - the 2g parked minors (`2026-10-12-phase-2g-notes.md`);
  - drop the extra `step(1)` before `untilLoaded` (#100);
  - drop the `?fps` `timer` workaround for `world.stats` (#106);
  - drop `flow.open`'s guard for `overlay(..., { once })` (#95);
  - drop the sleep half's event scan for overlay args (#105);
  - drop the tune `afterEach` resets for `reset` (#108).

### 5.4 Asset migration per game

| Game | Sources today | Phase 3 sources | Bake notes |
|---|---|---|---|
| Rally | `games/rally/assets/models/{cone,hatchback-sports,sedan-sports,wheel-racing}.glb` + `Textures/colormap.png` (Kenney Car Kit, licence file present); `bake.mjs` → `src/assets.json` (276 KB) | unchanged | `palette: 'vertex'`; rename `colormap` per model (`car-body` extends `steel`, `tyre` → `rubber`, cone → `plastic`); the car's colliders stay inline (Rally's vehicle builds them, `massProps` from `cars.js`); the track terrain and posts are procedural (terrain kit, inline colliders). |
| Pig Pens | **not in the repo.** `bake.mjs` reads `assets/<kit>_<name>.glb` that were never committed; `src/assets.json` (944 KB) is the only record | vendor from `~/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets/` (Nature Kit, Graveyard Kit, Food Kit, Car Kit, Cube Pets; GLB/GLTF folders) into `games/pig-pens/assets/models/`, keeping Kenney's file names, plus `LICENSE-kenney.txt` (CC0); `game.config.js` maps ids (`fence` → `fence_simple.glb`, …) | the 3k plan writer builds the id → file table from `bake.mjs:61-67`; the parity test compares vertex counts with `assets.json`; pets: `animTable` (idle, walk, run, eat, dance, gesture-negative at 30 fps, as today); pigs use inline ball colliders with `body.mass`. |
| Tractor | `games/tractor-pickup/assets/models/*.glb` (40 models, vertex-coloured, made by `models.mjs` from the Kenney pack plus three.js shapes; `hat` nodes; `paint-body`/`paint-trim` on the tractor; barn `planks`/`shingles` textured); `bake.mjs` → `src/assets.json` (988 KB) | unchanged; `models.mjs` and `tools/glb.mjs` stay as authoring tools (its vertex-colour helper moves into the engine bake as `palette: 'vertex'`) | rename `hat` → `sock-hat`; materials `colormap` (pets) → `pet`, `color` → per model, `grass`, `woodBark`/`wood`/`woodDark`/`woodInner` → `wood`, `leafsGreen`/`leafsFall` → `leaf` (extends `grass`), `dirt`/`_defaultMat` → `stone`, `corn` → `crop`; barn `static: true`, `keepTextures`; pets `animTable` with 8 clips; tractor/trailer bodies keep inline colliders and `massProps` (D3). |

**Builds.**
- Each game's `build.py` is deleted. Its steps move to `lion-hawk build`: esbuild with dedupe, the template, the PWA copy and the sw stamp.
- Tractor's voice and animal audio embedding moves into `build.hooks.js`. It keeps the data-URL embedding, so audio is unchanged. Moving audio to files is deferred.
- `sw.js` in each game gains `__PRECACHE__` (`./`, the manifest, the icons, every `assets/models/*`).
- Output env vars: `RALLY_OUT`, `PIGPENS_OUT`, `TRACTOR_OUT`. The default site dirs (`rally`, `piggie-game`, `tractor-pickup`) are reachable only with `--site`, which only the user runs before a deploy.

### 5.5 Goldens and tapes

- **View-only steps must not change any golden or tape checksum.** A change there is a bug.
- **Asset steps (5.3-1)** must not change sim goldens, since colliders stay inline or come from sidecars that match today's shapes. Any change is investigated before going on.
- **Sim steps (5.3-2)** may re-bless once per cause: World creation order, combine rules, `√f`, mass from density, the heightfield helper, NET_VERSION 4. Only when all of these hold:
  1. Before the swap, the plan records a two-sided feel sample per game:
     - Rally: stage times on 3 seeds, the verge speed samples;
     - Pig Pens: pigs penned after 120 s on the golden seed, chickens caught, food eaten;
     - Tractor: course time on the farm-seed route, animals booped per trip, the bump-test outcome.
  2. After the swap, `checks.determinism` passes and every feel sample is within its tolerance. Tolerances are written in the plan before the run: ±3% for times, ±1 for counts.
  3. The notes file records the reason, the metric table and the commit. Tapes are re-recorded in the same commit.
  4. Any sample outside its tolerance stops the plan and is reported to the user as a playtest item. A golden is never re-blessed just to make a test pass.

---

## 6. Branching and versions

- **Engine.**
  - `phase-3` is created from `phase-2g` (27e4701; the 2g docs commits 24b68bd..27e4701 are included).
  - The main checkout `~/projects/four43/lion-hawk-engine` stays on `phase-3` and only the integrator commits there. The games' `file:../../../lion-hawk-engine` link therefore always sees integrated code.
  - Each engine sub-plan works in a worktree `~/projects/four43/lion-hawk-engine-3<x>` on branch `phase-3-<name>`. Branches are cut from `phase-3` **after 3a merges** and merged back with `--no-ff` by the integrator.
- **Games.**
  - `feat/lion-hawk-3` is created from `feat/lion-hawk` (e03ed71).
  - Each game gets a worktree `~/projects/four43/four43-lh3-<game>` on `feat/lion-hawk-3-<game>`. It sits at the same depth as `four43-lion-hawk`, so `../../../lion-hawk-engine` resolves.
  - Run `npm install` in `games/` per worktree.
  - The integrator merges each game branch into `feat/lion-hawk-3`.
- **Versions** (the integrator bumps `package.json`, `src/version.js` and `CHANGELOG.md`):

| Merge | Engine version |
|---|---|
| 3a | 0.7.3 |
| Wave A (3b + 3c + 3d) | 0.8.0 |
| Wave B (3e + 3f + 3g + 3h) | 0.9.0 |
| Wave C (3i) | 0.10.0 |
| fixes requested during Wave D | 0.10.x |
| 3m final | 0.11.0 |

  Games bump minor versions when their plan finishes: Rally 0.4.0, Pig Pens 2.2.0, Tractor 1.9.0.
- **Not in phase 3:** push, merge to `gh-pages`, deploy, and how four43 pins the engine. All of these stay with the user.

---

## 7. Global constraints (copy verbatim into every sub-plan)

```
GLOBAL CONSTRAINTS (phase 3)
1. Sim purity (L-3, T-12): files under src/core, src/defs, src/sim, src/kits/*/sim.js and every game's
   sim tree never import three, three/addons, @dimforge/rapier3d-compat, DOM globals, Date.now, performance.now,
   new Date or Math.random. Rapier is injected (defineGame({ physics: { rapier } })). testing/purity.js
   enforces it; add new sim roots to the purity test, never allowlist a new line without the integrator.
2. Determinism: sim results depend only on seed, steps, input, commands (with their at stamps) and
   engine.time.wall. No wall-clock reads in sim code; timing diagnostics come through the injected timer and
   never enter state() or checksums. Every new sim feature gets a checks.determinism test and a headless replay.
3. Allocation (R-8, T-13): nothing allocated per step or per frame in engine code: reuse out-params and pools;
   allocate at spawn/create only. Rapier's own per-call vector objects are tolerated; retained growth is not.
4. View code: never instanceof on three.js objects (use .isMesh etc.); a second three copy may exist in Node tests.
   Engine view modules may import three directly; game builds go through `lion-hawk build` (dedupe).
5. Memory-safe tests. Unit and workspace suites:
     systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
       -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files|dir>
   Browser suites (engine e2e, game test:e2e, Rally test:mobile), ONE AT A TIME ACROSS ALL AGENTS:
     flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G \
       -p MemorySwapMax=0 -p RuntimeMaxSec=900 -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>
   Never raise the caps; never run node --test without --test-concurrency=4.
6. Never assert.equal / deepEqual a DOM node (#103): compare with same() from test/helpers/dom.mjs.
7. Commits: conventional style, no Co-Authored-By or any Claude attribution line.
8. four43: never write, modify, restore or delete anything under site/ (including site/exp/). Builds go only to a
   scratchpad: `lion-hawk build --out $SCRATCH/<game>` or the game's *_OUT env var. Never pass --site.
9. Stay inside your plan's file ownership (overview §5.2). Integrator-only files: src/index.*.js, testing/index.js,
   src/version.js, package.json, package-lock.json, CHANGELOG.md, docs/spec.md, docs/field-notes.md, the overview.
   Ask the integrator for anything else.
10. The contract in the overview §4 is fixed. If reality disagrees, stop and write the mismatch in your notes file
    for the integrator; do not change a signature on your own.
11. Goldens: re-bless only under overview §5.5, with the reason and metrics in your notes.
```

---

## 8. Risks

| # | Risk | What catches it |
|---|---|---|
| R1 | **iPad frame rate.** MeshPhysical (with fur shells on Pig Pens' chickens and coverage on Tractor) can drop below today's Lambert 60 fps. | Per game, after its view step: `programCount` and draw calls per scene, recorded under SwiftShader. The gate is ≤ today + 2 programs and ≤ today's draw calls. Then the user's iPad `?fps` on the same scene, today's release against the branch build. If the median frame time regresses by more than 10%, the game sets `shading: 'lambert'` (D5) and a field note records the numbers. |
| R2 | **Determinism and feel drift** when physics moves into the World: creation order, `√f` with `Multiply`, densities replacing explicit mass, heightfield layout. | `checks.determinism` per game. Pre- and post-swap feel samples under §5.5. A Rapier params test against `PINNED_DEFAULTS`. Unit tests in 3c: two blocks sliding give the geometric-mean friction; `body.mass` gives that mass to 0.1%; heightfield orientation. |
| R3 | **Size and load time.** Separate GLBs, meshopt decoding and GLTFLoader cost against today's inline JSON (Tractor's page carries 988 KB of `assets.json` today). | `lion-hawk build`'s size report per game against today's `index.html`. The budget is total gzip ≤ today + 10%. Playwright desktop time to `settled()` ≤ today + 20%. A service-worker test (`serviceWorkers: 'allow'`) checks the game loads offline after the first visit. |
| R4 | **Rapier 0.21 quirks.** Heightfield column-major and scale (pinned in `heightfieldDesc`); wake-on-insert (#2); combine-rule priority; vehicle controller API; a second WASM instance; per-call garbage. | 3c and 3h unit tests per quirk (orientation, sleep, combine priority, controller wheel contact on the terrain). The init-error test (D9). `checks.zeroAlloc` (retained growth). A test that fails when `@dimforge/rapier3d-compat`'s version is not 0.21.x. |
| R5 | **Tractor NET_VERSION interop and driven feel.** Decision: phase 3 **forces NET_VERSION 4**, because `F.body()` without dirt plus batched inputs changes the wire. Handshake keys rooms by app version, so a 1.8.0 device and a 1.9.0 device never see each other's rooms. A code typed across versions fails as Handshake's version refusal. | 3l tests: (a) `mp()` with NET_VERSION 4 on both sides; the bump test under 80 ms and 2% loss, both peers within 0.5 m of the owner's pose 1 s after contact; no correction over `snapAt` during the bump. (b) `peers()` two pages with `render: 'manual'`. (c) A manual check that a 1.8.0 device given a 1.9.0 room code shows a readable message (Tractor shows "This room is running a different version. Reload to update."; the message is added if missing). (d) A playtest note, because solid other tractors change play. |

Also watched: merge conflicts in `engine.js`, `boot.js` and `headless.js`. These files have one owner per wave (§5.2) and 3a goes first.

---

## 9. Needs the user

1. **Approve deltas D1–D9.** They go into `spec.md` in 3a. Plans proceed on them meanwhile.
2. **Driven trains.** The spec makes other players' tractors solid, driven bodies (N-12). Today they are drawn only and never collide. Phase 3 builds `driven` and keeps `remote: 'view', follow: 'forecast'` as a one-line fallback. Does the user want solid tractors in multiplayer, after a playtest?
3. **Real-iPad frame-rate runs** for R1. They need the user's device: today's release against each branch build, `?fps`, the same route.
