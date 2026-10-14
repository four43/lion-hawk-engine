# Phase 3k: Pig Pens on the phase 3 engine (sub-plan)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pig Pens builds its farm from engine parts. Its models are vendored Kenney GLBs, baked by `lion-hawk bake` into committed `baked/`. Its pigs, dog, chickens, fox, snacks, tractor and fences are World entities with material-tagged colliders, and its tractor drives on the vehicle kit. It draws through the engine renderer, light rig, tilt-shift post, material compiler (fur on the chickens), view sync and audio service, and it builds with `lion-hawk build`. The plan finishes with the cross-game final pass, the frame-rate and size records, and Pig Pens 2.2.0.

**Architecture:**
- **Sim.** `createSim(world, opts)` now takes the scene's World, not a Rapier module. Its old `step()` splits into `think()` (AI, impulses, vehicle inputs; stage `physics.world` before `lh.physics.step`) and `settle()` (read-back, hose rinse, regions; after `lh.physics.events`). The engine steps Rapier between them.
- **Entities.** Pigs, the dog, birds, the fox and snacks are entities; their game fields sit on the entity (E-4). The herd AI stays in the game (overview §1.2: no kit-herd).
- **View.** The view keeps its game-specific drawing (pig mud and eyelids, the chicken flock, feathers, the hose, the coop, day/night). It moves onto `view.gfx`, `view.assets`, `view.materials` and `view.sync`. The tractor and snacks are drawn by view sync; pigs and chickens are game-built instanced crowds driven by baked anim tables (A-11); the dog and fox use `AnimationMixer`.

**Tech Stack:** lion-hawk 0.8.0 → 0.9.0 (World, Rapier wrapper, bake/build CLI, renderer, assets, compiler, view sync, vehicle kit, audio), three 0.186, @dimforge/rapier3d-compat 0.21, @gltf-transform/core 4.5 (tests only), node:test, Playwright through `lion-hawk/playwright`.

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md` (deltas D1–D9, §4 contract, §5.3–§5.5).

**Where the code is:**
- Read at four43 `feat/lion-hawk` e03ed71 (`~/projects/four43/four43-lion-hawk/games/pig-pens`).
- Implemented in the worktree of overview §6: `~/projects/four43/four43-lh3-pigpens`, branch `feat/lion-hawk-3-pigpens` (cut from `feat/lion-hawk-3`).
- Below, `$G` is `~/projects/four43/four43-lh3-pigpens/games/pig-pens` and `$SCRATCH` is the session scratchpad.

---

## Global Constraints

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

**Plan constraints (3k):**

12. **Ownership.**
    - You may touch `games/pig-pens/**` only.
    - You may not touch `games/package-lock.json`, `games/test/**`, other games or `site/**`. Constraint 9's `package.json` means the engine's; Pig Pens' own `games/pig-pens/package.json` is yours.
    - Do not add or remove dependencies (that would rewrite `games/package-lock.json`). Unused dependencies stay, listed in the notes.
13. **Engine gates.**
    - Tasks 1–10 need engine ≥ 0.8.0. Task 12 needs ≥ 0.9.0 and the vehicle kit; Tasks 13–23 need ≥ 0.9.0.
    - Every task's first step checks this: `cd $G && node -p "require('lion-hawk/package.json').version"`.
    - Task 11 (the R1/R3 baseline) needs no engine change, but it must run **before Task 13** touches the view.
14. **Unit and browser commands.** Every command below uses one of these two prefixes (constraint 5's caps with `--working-directory`):
    ```
    UNIT="systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$G -E NODE_OPTIONS=--max-old-space-size=512"
    BROWSER="flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$G -E NODE_OPTIONS=--max-old-space-size=2048"
    ```
    - The unit suite is `$UNIT node --test --test-concurrency=4 test/*.test.mjs`.
    - The e2e suite is `$BROWSER node --test --test-concurrency=4 test/e2e.browser.mjs`.
15. **Goldens.**
    - `farm-seed3.json` is bit-exact today. It must stay bit-exact through Tasks 1–8 and again through Tasks 11–23.
    - Only Task 10 may re-bless, once, for the causes "World creation order, combine rules, √f, mass from density", under §5.5.
    - Task 12 (vehicle kit) is not a listed cause: a golden change there stops the plan.
16. **Herd RNG.** The game keeps its own mulberry32 (#58). Cosmetic view randomness stays `Math.random` (view only).

---

## Review Focus

The five input or failure modes most likely to bite, and the test that pins each:

1. **Contact drift from the combine rules.**
   - Today pigs use friction 0 with `Min` and restitution 0.15 with Rapier's default `Average`. The engine forces `√f`·`Multiply` and `Max`.
   - Pinned by `test/materials.test.mjs` (Task 2): the effective animal-on-grass values equal 2.1.0's (friction 0, restitution 0.075), snacks keep 500 kg/m³, and the grip swap keeps the density.
   - Pinned again by `test/feel.test.mjs` (Tasks 7 and 10).
2. **The step split.**
   - `think` → Rapier → `settle` must reproduce `step()` bit-for-bit, or every later comparison is noise.
   - Pinned by `test/split.test.mjs` (Task 5, two runs compared with `Object.is`), then by the bit-exact `farm-seed3` golden.
3. **Bake fidelity.**
   - Vendored GLBs → baked GLBs must draw what `assets.json` drew: triangles, colours, rest-pose bounds, and pig and chick anim frames.
   - Pinned by `test/assets-parity.test.mjs` (Task 4). It catches a wrong file mapping, a lost palette, a quantisation transform missing from an anim table, and the corn-cob duplicate-name case.
4. **Runtime statics.**
   - Gates spawn and despawn barrier entities mid-game. Food entities are despawned while pigs hold claims on their ids.
   - Pinned by `test/world.test.mjs` (Task 9):
     - a shut gate is one `gate` entity, and opening it removes it;
     - no pig crosses a shut gate in 120 s;
     - an eaten snack leaves `h.find('food')` and no pig keeps its id.
5. **Hand orbit against the tool gesture.**
   - With `bindGesture` and `uncapped` adopted, a Hand drag must orbit without pressing, tapping or driving.
   - Pinned by `test/flow-orbit.test.mjs` (Task 18): `pressing` is false after an orbit move, and a later `press` does not drive.
   - The e2e orbit and drive tests pin it in Chromium.

---

## File Structure

Paths are relative to `games/pig-pens/` in the four43 worktree.

| File | Status | Responsibility |
|---|---|---|
| `assets/models/{nature-kit,graveyard-kit,food-kit,car-kit,cube-pets}/…` | create | Vendored Kenney sources (33 GLBs, 4 `Textures/colormap.png`, each kit's `License.txt`), file names unchanged |
| `assets/models/SOURCES.json` | create | Pinned sha256 per vendored file and its origin in the Kenney 3.7.0 pack |
| `game.config.js` | create | CLI config: id, `outEnv: 'PIGPENS_OUT'`, bake (per-model files, renames, palette, anim tables), build |
| `src/defs/materials.js` | create | Material registry (`defineMaterials`): physics values reproducing 2.1.0 contacts, look-only model materials |
| `baked/**` | create (bake output, committed, D2) | `phys.json`, `manifest.json`, `models/*.glb`, `models/{pig,chick}.anim.json` |
| `src/sim.js` | modify | `createSim(world, opts)`, `think`/`settle`, entities via `world.spawn`, `GROUPS`, materials in place of literal friction |
| `src/chickens.js` | modify | birds and fox as entities; `world.place`; group names |
| `src/tractor.js` | modify | tractor entity with `massProps` (lh-allow), then the vehicle kit |
| `src/game.sim.js` | modify | `physics: { rapier, gravity, groups }`, `defs: { materials, models }` |
| `src/game/farm.js` | modify | `createSim(ctx.world)`, `farm.think`/`farm.settle` systems, orbit move clears the Hand target |
| `src/game.view.js` | modify | `defineView({ render })`, preload, tilt-shift post, sync hooks, audio service |
| `src/main.js` | modify | `boot(..., { canvas, timer })`, `?shading`, `?fps` |
| `src/view/world.js` | modify | content onto `view.gfx.scene`, compiler materials, `createInstances`, no lights or renderer |
| `src/farm3d.js` | modify | coop, gates, eggs, grain, feathers and day/night on the engine lights; chickens, fox and tractor moved out |
| `src/view/models.js` | create | geometry helpers over `view.assets` (model and part geometry, box/colour/merge helpers, `lerpM`) |
| `src/view/pigs3d.js` | create | pig crowd: anim tables, interpolation, pig skin (mud and eyelids) |
| `src/view/pigSkin.js` | create | pig mud and eyelid material (moved from `world.js`) |
| `src/view/flock3d.js` | create | chickens (fur via the compiler), fox and dog on `AnimationMixer` |
| `src/view/tractor3d.js` | create | `sync.on('model:tractor')`: model frame, wheels, headlight; `sync.on('#food')` snacks |
| `src/view/rig.js` | modify | pose math kept; pointer gestures on engine `bindGesture`; `makeProject` |
| `src/view/hud.js` | modify | selection compare without a per-frame string |
| `src/view/fps.js` | create | `?fps` readout (median frame ms, Rapier step ms) for the iPad run |
| `src/devices.js` | modify | `bindPointer({ uncapped: true })`, gesture and wheel devices, orbit `move` |
| `src/sound.js` | modify | synth on the engine audio service (#67) |
| `src/gfx.js`, `src/fur.js`, `src/tiltshift.js`, `bake.mjs`, `build.py` | delete | replaced by the engine |
| `src/assets.json` | move → `test/fixtures/assets-v2.1.0.json` | the parity test's reference |
| `pwa/sw.js` | modify | `const PRECACHE = __PRECACHE__;` |
| `template.html` | modify | Get out ≥ 44 px |
| `package.json` | modify | scripts (`bake`, `build`), version 2.2.0 |
| `test/farmSim.mjs` | create | headless farm handle for tests and the tuning scripts |
| `test/split.test.mjs`, `test/materials.test.mjs`, `test/vendor.test.mjs`, `test/bake.test.mjs`, `test/assets-parity.test.mjs`, `test/world.test.mjs`, `test/migration.test.mjs`, `test/checks.test.mjs`, `test/feel.test.mjs`, `test/feel.mjs`, `test/feel-baseline.json`, `test/flow-orbit.test.mjs`, `test/hud.test.mjs`, `test/perf.browser.mjs`, `test/offline.browser.mjs` | create | as named in the tasks |
| `test/golden.test.mjs`, `test/golden-farm.test.mjs`, `test/sim.test.mjs`, `test/pick.test.mjs`, `test/purity.test.mjs`, `test/e2e.browser.mjs`, `test/serve.mjs` and the tuning scripts (`day`, `door`, `food`, `night`, `fieldsweep`, `hose`, `scenarios`, `gates_fox`, `grain`, `tractor`, `headless`) | modify | engine path, new APIs |
| `docs/phase-3k-notes.md` | create | the notes draft (see "Notes") |

---

## Task 1: Vendor the Kenney sources

**Files:**
- Create: `assets/models/**`, `assets/models/SOURCES.json`, `test/vendor.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the source tree that `game.config.js` (Task 3) names. Model id → file:

| id | file (under `assets/models/`) | id | file |
|---|---|---|---|
| fence | `nature-kit/fence_simple.glb` | gate | `nature-kit/fence_gate.glb` |
| planks | `nature-kit/fence_planks.glb` | post | `nature-kit/fence_corner.glb` |
| oak | `nature-kit/tree_oak.glb` | tree | `nature-kit/tree_default.glb` |
| treeFat | `nature-kit/tree_fat.glb` | treeFall | `nature-kit/tree_default_fall.glb` |
| bush | `nature-kit/plant_bushLarge.glb` | bushS | `nature-kit/plant_bush.glb` |
| flowerY | `nature-kit/flower_yellowB.glb` | flowerR | `nature-kit/flower_redA.glb` |
| rock | `nature-kit/rock_smallC.glb` | pumpkin | `nature-kit/crop_pumpkin.glb` |
| corn | `nature-kit/crops_cornStageD.glb` | grass | `nature-kit/grass_large.glb` |
| grassS | `nature-kit/grass.glb` | wheat | `nature-kit/crops_wheatStageA.glb` |
| sign | `nature-kit/sign.glb` | hay | `graveyard-kit/hay-bale.glb` |
| hayB | `graveyard-kit/hay-bale-bundled.glb` | apple | `food-kit/apple.glb` |
| carrot | `food-kit/carrot.glb` | cabbage | `food-kit/cabbage.glb` |
| cob | `food-kit/corn.glb` | barrel | `food-kit/barrel.glb` |
| egg | `food-kit/egg.glb` | sack | `food-kit/bag.glb` |
| tractor | `car-kit/tractor.glb` | pig | `cube-pets/animal-pig.glb` |
| dog | `cube-pets/animal-dog.glb` | chick | `cube-pets/animal-chick.glb` |
| fox | `cube-pets/animal-fox.glb` | | |

Facts verified on 2026-10-13 against `~/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets/`:
- **Every file exists.**
  - Nature Kit `.glb` files sit in `Nature Kit/Models/GLTF format/`. They carry no textures, only factor colours.
  - The other kits sit in `<Kit>/Models/GLB format/`. They reference an external `Textures/colormap.png`.
  - Those four colormaps differ (md5 485dedc9…, 5d05c98a…, 451b163d…, f9a72b72…). So the kits get one subfolder each, and the bake needs per-model files (Contract issue C1).
- **All 33 match `src/assets.json`.**
  - A gltf-transform probe with the old bake's node keying matched per-node vertex and triangle counts for every model.
  - The pets differ only in part order, which the old bake sorted.
- **Pet clips.** The Cube Pets clips are `static, idle, walk, run, eat, dance, gesture-positive, gesture-negative`.

- [ ] **Step 1: Write the failing test** `test/vendor.test.mjs`:

```js
// Phase 3k T1: the Kenney sources Pig Pens bakes from are vendored (overview §5.4) and pinned, so a re-download that
// changes a model shows up here before it changes a bake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../assets/models/', import.meta.url);
const SOURCES = JSON.parse(readFileSync(new URL('SOURCES.json', dir), 'utf8'));
const sha16 = f => createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 16);

test('every vendored file is present and matches its pinned sha256', () => {
  assert.equal(Object.keys(SOURCES.files).length, 37); // 33 models, 4 palettes
  for (const [f, { sha256 }] of Object.entries(SOURCES.files)) assert.equal(sha16(f), sha256, f);
});
test('each kit folder carries its Kenney licence (CC0)', () => {
  for (const kit of ['nature-kit', 'graveyard-kit', 'food-kit', 'car-kit', 'cube-pets']) {
    assert.ok(existsSync(new URL(`${kit}/License.txt`, dir)), kit);
    assert.match(readFileSync(new URL(`${kit}/License.txt`, dir), 'utf8'), /Creative Commons Zero, CC0/, kit);
  }
});
test('textured kits ship their own palette next to the GLBs', () => {
  for (const kit of ['graveyard-kit', 'food-kit', 'car-kit', 'cube-pets']) assert.ok(existsSync(new URL(`${kit}/Textures/colormap.png`, dir)), kit);
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/vendor.test.mjs`
  - Expected: FAIL with `ENOENT … assets/models/SOURCES.json`.

- [ ] **Step 3: Copy the files** (sources stay read-only):

```bash
K="$HOME/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets"; M=$G/assets/models
mkdir -p $M/nature-kit $M/graveyard-kit/Textures $M/food-kit/Textures $M/car-kit/Textures $M/cube-pets/Textures
for f in fence_simple fence_gate fence_planks fence_corner tree_oak tree_default tree_fat tree_default_fall plant_bushLarge plant_bush flower_yellowB flower_redA rock_smallC crop_pumpkin crops_cornStageD grass_large grass crops_wheatStageA sign; do cp "$K/Nature Kit/Models/GLTF format/$f.glb" $M/nature-kit/; done
cp "$K/Nature Kit/License.txt" $M/nature-kit/
for f in hay-bale hay-bale-bundled; do cp "$K/Graveyard Kit/Models/GLB format/$f.glb" $M/graveyard-kit/; done
for f in apple carrot cabbage corn barrel egg bag; do cp "$K/Food Kit/Models/GLB format/$f.glb" $M/food-kit/; done
cp "$K/Car Kit/Models/GLB format/tractor.glb" $M/car-kit/
for f in animal-pig animal-dog animal-chick animal-fox; do cp "$K/Cube Pets/Models/GLB format/$f.glb" $M/cube-pets/; done
cp "$K/Graveyard Kit/Models/GLB format/Textures/colormap.png" $M/graveyard-kit/Textures/; cp "$K/Graveyard Kit/License.txt" $M/graveyard-kit/
cp "$K/Food Kit/Models/GLB format/Textures/colormap.png" $M/food-kit/Textures/; cp "$K/Food Kit/License.txt" $M/food-kit/
cp "$K/Car Kit/Models/GLB format/Textures/colormap.png" $M/car-kit/Textures/; cp "$K/Car Kit/License.txt" $M/car-kit/
cp "$K/Cube Pets/Models/GLB format/Textures/colormap.png" $M/cube-pets/Textures/; cp "$K/Cube Pets/License.txt" $M/cube-pets/
```

- [ ] **Step 4: Write `assets/models/SOURCES.json`.** The values are the first 16 hex digits of sha256, measured on 2026-10-13. Re-measure them with `sha256sum`. If any differs, stop: the pack changed, and that needs the user.

```json
{
  "pack": "Kenney Game Assets All-in-1 3.7.0 (CC0)",
  "files": {
    "nature-kit/fence_simple.glb": { "sha256": "ecaf6c29532aa9fd", "from": "Nature Kit/Models/GLTF format/fence_simple.glb" },
    "nature-kit/fence_gate.glb": { "sha256": "34d10d5620179b8a", "from": "Nature Kit/Models/GLTF format/fence_gate.glb" },
    "nature-kit/fence_planks.glb": { "sha256": "2db68f60d24443db", "from": "Nature Kit/Models/GLTF format/fence_planks.glb" },
    "nature-kit/fence_corner.glb": { "sha256": "f37060de68c5680e", "from": "Nature Kit/Models/GLTF format/fence_corner.glb" },
    "nature-kit/tree_oak.glb": { "sha256": "d7fd8773674928c5", "from": "Nature Kit/Models/GLTF format/tree_oak.glb" },
    "nature-kit/tree_default.glb": { "sha256": "562d29638c902de3", "from": "Nature Kit/Models/GLTF format/tree_default.glb" },
    "nature-kit/tree_fat.glb": { "sha256": "84b262c5dda3a91a", "from": "Nature Kit/Models/GLTF format/tree_fat.glb" },
    "nature-kit/tree_default_fall.glb": { "sha256": "f8e90ed7f7771644", "from": "Nature Kit/Models/GLTF format/tree_default_fall.glb" },
    "nature-kit/plant_bushLarge.glb": { "sha256": "10e1d9fbf29d96d1", "from": "Nature Kit/Models/GLTF format/plant_bushLarge.glb" },
    "nature-kit/plant_bush.glb": { "sha256": "ae7b1beb39e242b1", "from": "Nature Kit/Models/GLTF format/plant_bush.glb" },
    "nature-kit/flower_yellowB.glb": { "sha256": "aaa8707779a5de59", "from": "Nature Kit/Models/GLTF format/flower_yellowB.glb" },
    "nature-kit/flower_redA.glb": { "sha256": "171930b7789ddbf7", "from": "Nature Kit/Models/GLTF format/flower_redA.glb" },
    "nature-kit/rock_smallC.glb": { "sha256": "5cbc0a805f275771", "from": "Nature Kit/Models/GLTF format/rock_smallC.glb" },
    "nature-kit/crop_pumpkin.glb": { "sha256": "5b4878c599603362", "from": "Nature Kit/Models/GLTF format/crop_pumpkin.glb" },
    "nature-kit/crops_cornStageD.glb": { "sha256": "d90d9cbba85e9952", "from": "Nature Kit/Models/GLTF format/crops_cornStageD.glb" },
    "nature-kit/grass_large.glb": { "sha256": "af49a595624abca7", "from": "Nature Kit/Models/GLTF format/grass_large.glb" },
    "nature-kit/grass.glb": { "sha256": "260e41d3e5f24724", "from": "Nature Kit/Models/GLTF format/grass.glb" },
    "nature-kit/crops_wheatStageA.glb": { "sha256": "d8c690d473a23074", "from": "Nature Kit/Models/GLTF format/crops_wheatStageA.glb" },
    "nature-kit/sign.glb": { "sha256": "c658c21672ecd63c", "from": "Nature Kit/Models/GLTF format/sign.glb" },
    "graveyard-kit/hay-bale.glb": { "sha256": "675d70aab70a1ad6", "from": "Graveyard Kit/Models/GLB format/hay-bale.glb" },
    "graveyard-kit/hay-bale-bundled.glb": { "sha256": "94e00bc82083ebd3", "from": "Graveyard Kit/Models/GLB format/hay-bale-bundled.glb" },
    "graveyard-kit/Textures/colormap.png": { "sha256": "a94b4dc4f77a4b8a", "from": "Graveyard Kit/Models/GLB format/Textures/colormap.png" },
    "food-kit/apple.glb": { "sha256": "2a80ab65d5bc2cb4", "from": "Food Kit/Models/GLB format/apple.glb" },
    "food-kit/carrot.glb": { "sha256": "621949f7fb7947a8", "from": "Food Kit/Models/GLB format/carrot.glb" },
    "food-kit/cabbage.glb": { "sha256": "6ec1db20d0d1900e", "from": "Food Kit/Models/GLB format/cabbage.glb" },
    "food-kit/corn.glb": { "sha256": "81c5b7734ec74098", "from": "Food Kit/Models/GLB format/corn.glb" },
    "food-kit/barrel.glb": { "sha256": "da46fd63ab9d1f1a", "from": "Food Kit/Models/GLB format/barrel.glb" },
    "food-kit/egg.glb": { "sha256": "32e20b7ed798e42e", "from": "Food Kit/Models/GLB format/egg.glb" },
    "food-kit/bag.glb": { "sha256": "17803bb1e467d5cf", "from": "Food Kit/Models/GLB format/bag.glb" },
    "food-kit/Textures/colormap.png": { "sha256": "75baf74d9483a0fc", "from": "Food Kit/Models/GLB format/Textures/colormap.png" },
    "car-kit/tractor.glb": { "sha256": "48b30b3e4bb0adb4", "from": "Car Kit/Models/GLB format/tractor.glb" },
    "car-kit/Textures/colormap.png": { "sha256": "f3622a03a20c6696", "from": "Car Kit/Models/GLB format/Textures/colormap.png" },
    "cube-pets/animal-pig.glb": { "sha256": "0e09d3c745a7daa1", "from": "Cube Pets/Models/GLB format/animal-pig.glb" },
    "cube-pets/animal-dog.glb": { "sha256": "c127d71ac8794f97", "from": "Cube Pets/Models/GLB format/animal-dog.glb" },
    "cube-pets/animal-chick.glb": { "sha256": "86dd5f030c934148", "from": "Cube Pets/Models/GLB format/animal-chick.glb" },
    "cube-pets/animal-fox.glb": { "sha256": "ac1ae804da301371", "from": "Cube Pets/Models/GLB format/animal-fox.glb" },
    "cube-pets/Textures/colormap.png": { "sha256": "2f6d0032e51c2d49", "from": "Cube Pets/Models/GLB format/Textures/colormap.png" }
  }
}
```

- [ ] **Step 5: Run, expect PASS.** Prove the test can fail: flip one character of one `sha256` and run again (expect FAIL naming that file), then restore it.
- [ ] **Step 6: Commit:** `git add assets/models test/vendor.test.mjs && git commit -m "chore(pig-pens): vendor the Kenney source models the bake reads"`

---

## Task 2: The material registry

**Files:**
- Create: `src/defs/materials.js`, `test/materials.test.mjs`
- Modify: `test/purity.test.mjs` (add the `defs` root)

**Interfaces:**
- Consumes (§4.2): `defineMaterials(table)` → a registry with `ids`, `has`, `get`, `density(id)`, `collider(id)` → `{ friction: √f, restitution, density }`, and `hash`.
- Produces: `MATERIALS` (default export), imported by `game.sim.js` (Task 9) and by `game.config.js`'s bake.

**Why these values.** 2.1.0's contacts against the ground (friction 0.8, restitution 0) are:
- pigs and the dog: friction `Min(0, ·)` = 0, restitution `Average(0.15, 0)` = 0.075;
- chickens: friction 0, restitution 0.05;
- snacks: friction `Average(0.9, 0.8)` = 0.85, restitution 0.175;
- a grabbed pig: friction `Average(0.7, 0.8)` = 0.75.

Under `√f`·`Multiply` and `Max` restitution, the table below keeps each animal-on-ground value (snacks within 0.2%). Animal-on-animal restitution halves (0.15 → 0.075), and pig-on-fence friction while thrown drops from 0.45 to 0.37. Both are listed in the notes and on the playtest list.

- [ ] **Step 1: Write the failing test** `test/materials.test.mjs`:

```js
// Phase 3k T2 (M-1..M-3, M-9, D4): Pig Pens' registry. The physics numbers keep 2.1.0's animal-on-grass contacts
// under the engine's combine rules: friction √fa·√fb (Multiply), restitution max.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';

const pairF = (a, b) => MATERIALS.collider(a).friction * MATERIALS.collider(b).friction; // what Rapier's Multiply computes
const pairR = (a, b) => Math.max(MATERIALS.collider(a).restitution, MATERIALS.collider(b).restitution);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('the game ids are registered after the base library', () => {
  for (const id of ['pasture', 'fencing', 'pet', 'petGrip', 'bird', 'foxPelt', 'snack', 'paintwork', 'plumage', 'leaf', 'petal', 'crop', 'hay', 'produce', 'stone', 'scenery'])
    assert.ok(MATERIALS.has(id), id);
  assert.equal(MATERIALS.ids.indexOf('steel'), 0); // base library first (§4.2)
  assert.match(MATERIALS.hash, /^[0-9a-f]{8}$/);
});
test('animal-on-grass contacts equal 2.1.0 (friction Min 0, restitution Average with 0)', () => {
  assert.equal(pairF('pet', 'pasture'), 0); assert.equal(pairF('bird', 'pasture'), 0); assert.equal(pairF('foxPelt', 'pasture'), 0);
  near(pairR('pet', 'pasture'), 0.075, 1e-12, 'pig bounce'); near(pairR('bird', 'pasture'), 0.05, 1e-12, 'hen bounce');
  assert.equal(pairR('foxPelt', 'pasture'), 0);
  near(pairF('petGrip', 'pasture'), 0.75, 0.003, 'a held pig drags on the grass (was Average 0.75)');
  near(pairF('snack', 'pasture'), 0.85, 0.002, 'snack friction (was Average 0.85)'); near(pairR('snack', 'pasture'), 0.175, 1e-12, 'snack bounce');
  near(pairF('paintwork', 'pasture'), Math.sqrt(0.4 * 0.8), 1e-12, 'tractor body on grass');
  assert.equal(pairF('pet', 'fencing'), 0); // pigs slide along fences, as with Min
});
test('densities: snacks 500 kg/m³; the grip swap keeps a pig\'s density so world.setMaterial never re-masses it', () => {
  assert.equal(MATERIALS.density('snack'), 500);
  assert.equal(MATERIALS.density('petGrip'), MATERIALS.density('pet'));
  assert.ok(MATERIALS.density('pet') > 0 && MATERIALS.density('bird') > 0 && MATERIALS.density('foxPelt') > 0); // dynamic bodies need it (spawn throws otherwise)
});
test('plumage is the fur material; scenery and the model materials carry no physics overrides', () => {
  const p = MATERIALS.get('plumage');
  assert.deepEqual({ length: p.look.fur.length, shells: p.look.fur.shells, density: p.look.fur.density }, { length: 0.07, shells: 10, density: 34 });
  for (const id of ['scenery', 'leaf', 'petal', 'crop', 'hay', 'produce', 'stone']) assert.equal(MATERIALS.get(id).phys?.friction, MATERIALS.get(MATERIALS.get(id).extends ?? id).phys?.friction, id);
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/materials.test.mjs`
  - Expected: FAIL with `Cannot find module …/src/defs/materials.js`.

- [ ] **Step 3: Implement** `src/defs/materials.js`:

```js
// Pig Pens' materials (lion-hawk M-1..M-3, D4, D6). Physics: 2.1.0 set friction/restitution per collider with Rapier's
// default rules (friction Min for the animals, else Average; restitution Average). The engine uses √f with Multiply and
// restitution Max, so these values keep every animal-on-grass contact as it was (see test/materials.test.mjs and the
// phase 3k notes' table). Look-only ids name the baked models' materials (game.config.js renames Kenney's).
import { defineMaterials } from 'lion-hawk/sim';

export default defineMaterials({
  // ground and statics keep Rapier's default restitution 0, so Max with an animal gives the animal's own value
  pasture:   { extends: 'grass', phys: { friction: 0.8, restitution: 0 } },
  fencing:   { extends: 'wood', phys: { friction: 0.2, restitution: 0 } },          // fences, troughs, coop, hay, trees, barrels
  // animals are frictionless balls (was 0 with Min); restitution is half the old value, so the ground contact keeps Average(r, 0)
  pet:       { extends: 'flesh', phys: { friction: 0, restitution: 0.075 }, look: { roughness: 0.9 } }, // pigs, the dog; pig/dog/fox models
  petGrip:   { extends: 'pet', phys: { friction: 0.7 } },                            // grabbed or thrown pigs: √0.7·√0.8 ≈ 0.748 on grass
  bird:      { extends: 'flesh', phys: { friction: 0, restitution: 0.05 } },
  foxPelt:   { extends: 'flesh', phys: { friction: 0, restitution: 0 } },
  snack:     { extends: 'flesh', phys: { sg: 0.5, friction: 0.9, restitution: 0.175 } }, // 500 kg/m³, as 2.1.0's setDensity(500)
  paintwork: { extends: 'steel', phys: { friction: 0.4, restitution: 0 } },          // the tractor (mass from massProps, D3)
  // look-only model materials
  plumage:   { extends: 'fur', look: { fur: { length: 0.07, shells: 10, density: 34 } } }, // chicken shells (fur.js's len/density)
  leaf:      { extends: 'grass' },
  petal:     { extends: 'grass' },
  crop:      { extends: 'grass' },
  hay:       { extends: 'grass' },
  produce:   { extends: 'flesh' },
  stone:     { extends: 'gravel' },
  scenery:   { extends: 'grass', look: { roughness: 0.95, metalness: 0 } },          // one material for all instanced decor (draw-call parity)
});
```

- [ ] **Step 4: Add the root.** In `test/purity.test.mjs`, change the `SIM` list to `['game.sim.js', 'game', 'defs', 'sim.js', 'chickens.js', 'flow.js', 'layout.js', 'tractor.js']`.

- [ ] **Step 5: Run, expect PASS.**
  - Run: `$UNIT node --test --test-concurrency=4 test/materials.test.mjs test/purity.test.mjs`
  - Mutation check: set `pet` restitution to `0.15` and expect FAIL `pig bounce: 0.15 vs 0.075`. Restore it.
- [ ] **Step 6: Commit:** `git commit -am "feat(pig-pens): material registry that keeps 2.1.0's contacts under the engine combine rules"` (also `git add src/defs test/materials.test.mjs`)

---

## Task 3: Game config and the bake

**Files:**
- Create: `game.config.js`, `baked/**` (bake output), `test/bake.test.mjs`
- Modify: `package.json` (scripts only)

**Interfaces:**
- Consumes:
  - §4.3 game config and output;
  - the CLI `lion-hawk bake [--game <dir>] [--check]`;
  - Contract issue **C1**: the per-model `file`. If the integrator rules otherwise, follow the ruling.
- Produces:
  - `baked/phys.json` (`{ v, engine, materials, models }`);
  - `baked/manifest.json`;
  - `baked/models/<id>.glb` for the 33 ids;
  - `baked/models/pig.anim.json` and `baked/models/chick.anim.json`.

**Decisions:**
- **`quantize: false`.**
  - Pig Pens' view masks vertices by node-local metre positions and colours (pig eyes, chicken plumage), and its anim tables are node matrices. A quantisation transform inside node TRS would break all three.
  - The cost is size, measured in Task 22 against R3.
  - If 3d cannot run meshopt without quantisation, set `meshopt: false` as well and record it.
- **`weld: false`.** It keeps per-part vertex counts comparable for Task 4.
- **Anim tables only for the crowds (pig, chick).** The dog and fox are single animals on `AnimationMixer` (A-11).

- [ ] **Step 1: Write the failing test** `test/bake.test.mjs`:

```js
// Phase 3k T3 (A-1..A-6, D2): the committed bake matches the sources, the registry and the engine (bake --check), and
// carries what the game needs: 33 models, anim tables for the two crowds only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import MATERIALS from '../src/defs/materials.js';
import CONFIG from '../game.config.js';

const root = new URL('../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const IDS = ['fence', 'gate', 'planks', 'post', 'oak', 'tree', 'treeFat', 'treeFall', 'bush', 'bushS', 'flowerY', 'flowerR', 'rock', 'pumpkin', 'corn', 'grass', 'grassS',
  'hay', 'hayB', 'apple', 'carrot', 'cabbage', 'cob', 'barrel', 'tractor', 'egg', 'sack', 'wheat', 'sign', 'pig', 'dog', 'chick', 'fox'];

test('lion-hawk bake --check: sources, registry hash and engine version agree with baked/', () => {
  const r = spawnSync('npx', ['lion-hawk', 'bake', '--game', '.', '--check'], { cwd: new URL('.', root), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('the config bakes the 33 models the game draws, under the ids the code uses', () => {
  assert.deepEqual(Object.keys(CONFIG.bake.models).sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(json('baked/manifest.json').models).sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(json('baked/phys.json').models).sort(), [...IDS].sort());
});
test('phys.json records this registry; only the pig and chick carry anim tables (30 fps, the six clips)', () => {
  const phys = json('baked/phys.json'), man = json('baked/manifest.json');
  assert.equal(phys.materials, MATERIALS.hash);
  for (const id of IDS) assert.equal(man.models[id].anim !== null, id === 'pig' || id === 'chick', id);
  for (const id of ['pig', 'chick']) {
    const a = json(`baked/${man.models[id].anim}`);
    assert.equal(a.fps, 30); assert.deepEqual(Object.keys(a.clips).sort(), ['dance', 'eat', 'gesture-negative', 'idle', 'run', 'walk']);
  }
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/bake.test.mjs`
  - Expected: FAIL with `Cannot find module …/game.config.js`.

- [ ] **Step 3: Write** `game.config.js`:

```js
// Pig Pens for the lion-hawk CLI (overview §4.3, D1, D2). Node only. Sources: assets/models/<kit>/ (vendored Kenney,
// Task 1); bake output: baked/ (committed). Model ids are the ones the game has always used (bake.mjs's table).
const nature = f => ({ file: `nature-kit/${f}.glb` });
const kit = (k, f, material) => ({ file: `${k}/${f}.glb`, rename: { materials: { colormap: material } } });
const PET_CLIPS = ['idle', 'walk', 'run', 'eat', 'dance', 'gesture-negative'];

export default {
  id: 'pig-pens', site: 'piggie-game', outEnv: 'PIGPENS_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',
    // Kenney's Nature Kit names → registry ids (A-2: renames apply before the checks)
    rename: { materials: { woodDark: 'wood', woodBark: 'wood', woodBirch: 'wood', leafsGreen: 'leaf', leafsFall: 'leaf',
      colorYellow: 'petal', colorRed: 'petal', corn: 'crop', _defaultMat: 'wood' } },
    palette: 'vertex',          // palette texels × base factors → COLOR_0, as bake.mjs did (Tractor's tools/glb.mjs logic)
    models: {
      fence: nature('fence_simple'), gate: nature('fence_gate'), planks: nature('fence_planks'), post: nature('fence_corner'),
      oak: nature('tree_oak'), tree: nature('tree_default'), treeFat: nature('tree_fat'), treeFall: nature('tree_default_fall'),
      bush: nature('plant_bushLarge'), bushS: nature('plant_bush'), flowerY: nature('flower_yellowB'), flowerR: nature('flower_redA'),
      rock: nature('rock_smallC'), pumpkin: nature('crop_pumpkin'), corn: nature('crops_cornStageD'), grass: nature('grass_large'),
      grassS: nature('grass'), wheat: nature('crops_wheatStageA'), sign: nature('sign'),
      hay: kit('graveyard-kit', 'hay-bale', 'hay'), hayB: kit('graveyard-kit', 'hay-bale-bundled', 'hay'),
      apple: kit('food-kit', 'apple', 'produce'), carrot: kit('food-kit', 'carrot', 'produce'), cabbage: kit('food-kit', 'cabbage', 'produce'),
      cob: kit('food-kit', 'corn', 'produce'), egg: kit('food-kit', 'egg', 'produce'), barrel: kit('food-kit', 'barrel', 'wood'),
      sack: kit('food-kit', 'bag', 'fabric'), tractor: kit('car-kit', 'tractor', 'paintwork'),
      pig: { ...kit('cube-pets', 'animal-pig', 'pet'), animTable: { fps: 30, clips: PET_CLIPS } },
      chick: { ...kit('cube-pets', 'animal-chick', 'plumage'), animTable: { fps: 30, clips: PET_CLIPS } },
      dog: kit('cube-pets', 'animal-dog', 'pet'), fox: kit('cube-pets', 'animal-fox', 'pet'),
    },
    optimise: { meshopt: true, quantize: false, weld: false, prune: true, dedupe: true },
  },
  build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa' },
};
```

- [ ] **Step 4: Scripts.** In `package.json` `"scripts"`, add `"bake": "lion-hawk bake --game ."` and `"build": "lion-hawk build --game ."`. Leave `test` and `test:e2e` as they are.

- [ ] **Step 5: Bake.**
  - Run: `$UNIT npx lion-hawk bake --game .`
  - Expected: 33 models written to `baked/`.
  - If the bake fails on an A-2 check, it names the material. Add that name to `rename.materials` (global or per model), never to the registry by guess. Record each such name in the notes.

- [ ] **Step 6: Run, expect PASS.** `$UNIT node --test --test-concurrency=4 test/bake.test.mjs test/vendor.test.mjs test/materials.test.mjs`. The unit suite stays green, and goldens are unchanged (nothing reads `baked/` yet).
- [ ] **Step 7: Commit:** `git add game.config.js baked test/bake.test.mjs package.json && git commit -m "feat(pig-pens): game.config.js and the committed bake of the 33 farm models"`

---

## Task 4: Parity of the bake with assets.json

**Files:**
- Create: `test/assets-parity.test.mjs`

**Interfaces:**
- Consumes:
  - `baked/manifest.json`;
  - `baked/models/*.glb` (EXT_meshopt_compression, read with gltf-transform plus three's `meshopt_decoder.module.js`, which has `decodeGltfBuffer`);
  - `*.anim.json` (§4.3 layout; Contract issue **C2** on the 12-float order);
  - `src/assets.json` (Task 20 moves it to `test/fixtures/assets-v2.1.0.json` and updates this path).
- Produces: the regression guard for every later re-bake.

Overview §5.3-1 asks for equal per-part vertex counts. `palette: 'vertex'` may weld equal (position, normal, colour) vertices, so the test asserts the stronger invariants instead:
- triangles equal;
- vertices ≤ today's;
- model-space bounds within 1 mm;
- the same colour palette (±2/255);
- for the pets, the anim frames (±2e-3) and the idle frame-0 pose bounds (±2 mm).

Duplicate node names: `crops_cornStageD.glb` has four mesh nodes named `corn`, and the old bake kept only the last. So corn asserts baked triangles ≥ today's and records the fix ("all four cobs drawn") in the notes.

- [ ] **Step 1: Write the test** `test/assets-parity.test.mjs`:

```js
// Phase 3k T4 (overview §5.3-1): the baked models draw what assets.json (the 2.1.0 bake) drew. Triangles per model,
// vertices ≤ (the palette bake may weld), bounds, colour palette, and for the crowd pets the anim frames and the posed
// rest bounds (a quantisation or node transform missing from the anim table shows up as a pose that does not fit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = new URL('../', import.meta.url);
const OLD = JSON.parse(readFileSync(new URL('src/assets.json', root), 'utf8'));
const MAN = JSON.parse(readFileSync(new URL('baked/manifest.json', root), 'utf8'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const PETS = new Set(['pig', 'dog', 'chick', 'fox']), DUPES = new Set(['corn']);
const l2s = c => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));

// column-major mat4 helpers (the old bake's)
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const trs = n => { const [x, y, z, w] = n.getRotation(), t = n.getTranslation(), s = n.getScale(), x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; };
const world = n => { let m = trs(n), p = n.getParentNode(); while (p) { m = mul(trs(p), m); p = p.getParentNode(); } return m; };
const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const box = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const grow = (b, p) => { for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], p[k]); b.max[k] = Math.max(b.max[k], p[k]); } };
const boxNear = (a, b, tol, msg) => { for (const e of ['min', 'max']) for (let k = 0; k < 3; k++) assert.ok(Math.abs(a[e][k] - b[e][k]) <= tol, `${msg} ${e}[${k}] ${a[e][k]} vs ${b[e][k]}`); };

// One baked model: per mesh node { name, tris, verts, local positions, colours (sRGB 0..255) } and its world matrix.
async function baked(id) {
  const doc = await io.read(fileURLToPath(new URL(`baked/${MAN.models[id].glb}`, root))), parts = [], e = [];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const part = { name: n.getName(), m: world(n), tris: 0, verts: 0, pos: [], col: [] };
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), C = prim.getAttribute('COLOR_0'), I = prim.getIndices();
      part.verts += P.getCount(); part.tris += (I ? I.getCount() : P.getCount()) / 3;
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); part.pos.push([e[0], e[1], e[2]]); }
      assert.ok(C, `${id}/${part.name}: no COLOR_0 (palette: 'vertex' must bake the palette)`);
      for (let i = 0; i < C.getCount(); i++) { C.getElement(i, e); part.col.push([l2s(e[0]), l2s(e[1]), l2s(e[2])]); }
    }
    parts.push(part);
  }
  return parts;
}
const oldParts = id => PETS.has(id) ? OLD[id].parts : Object.entries(OLD[id]).map(([name, g]) => ({ name, ...g }));
const palette = cols => { const s = new Map(); for (const c of cols) s.set(c.join(), c); return [...s.values()]; };
const covers = (a, b) => a.every(c => b.some(d => Math.abs(c[0] - d[0]) <= 2 && Math.abs(c[1] - d[1]) <= 2 && Math.abs(c[2] - d[2]) <= 2));

for (const id of Object.keys(MAN.models)) {
  test(`${id}: triangles, vertices, bounds and palette match the 2.1.0 bake`, async () => {
    const now = await baked(id), was = oldParts(id);
    const tNow = now.reduce((s, p) => s + p.tris, 0), tWas = was.reduce((s, p) => s + p.idx.length / 3, 0);
    if (DUPES.has(id)) assert.ok(tNow >= tWas, `${id}: ${tNow} < ${tWas}`); else assert.equal(tNow, tWas, `${id} triangles`);
    if (!DUPES.has(id)) assert.ok(now.reduce((s, p) => s + p.verts, 0) <= was.reduce((s, p) => s + p.pos.length / 3, 0), `${id} vertices grew`);
    const cNow = palette(now.flatMap(p => p.col)), cWas = palette(was.flatMap(p => { const o = []; for (let i = 0; i < p.col.length; i += 3) o.push(p.col.slice(i, i + 3)); return o; }));
    assert.ok(covers(cWas, cNow) && covers(cNow, cWas), `${id}: palettes differ ${JSON.stringify(cWas)} vs ${JSON.stringify(cNow)}`);
    if (PETS.has(id)) return; // pet parts are node-local in assets.json; the posed check below covers them
    const bNow = box(), bWas = box();
    for (const p of now) for (const v of p.pos) grow(bNow, xf(p.m, v));
    for (const p of was) for (let i = 0; i < p.pos.length; i += 3) grow(bWas, p.pos.slice(i, i + 3));
    if (!DUPES.has(id)) boxNear(bNow, bWas, 1e-3, `${id} bounds`);
  });
}

// anim.json: { v, fps, parts: [names], clips: { clip: { dur, frames, data: base64 Float32 frames×parts×12 } } } (§4.3).
// C2: the 12 floats are taken as the column-major mat4 without its last row: elements 0,1,2, 4,5,6, 8,9,10, 12,13,14.
const COLS = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
const table = id => JSON.parse(readFileSync(new URL(`baked/${MAN.models[id].anim}`, root), 'utf8'));
const frame = (t, clip, f, k) => { const c = t.clips[clip], d = new Float32Array(Buffer.from(c.data, 'base64').buffer.slice(0)), o = (f * t.parts.length + k) * 12, m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; COLS.forEach((e, j) => { m[e] = d[o + j]; }); return m; };
for (const id of ['pig', 'chick']) {
  test(`${id}: anim tables reproduce the 2.1.0 frames and pose the baked parts where the old ones stood`, async () => {
    const t = table(id), old = OLD[id], now = await baked(id);
    for (const [clip, a] of Object.entries(old.anims)) {
      assert.ok(t.clips[clip], `${id}: clip ${clip}`); assert.equal(t.clips[clip].frames, a.frames.length, `${id}/${clip} frames`);
      assert.ok(Math.abs(t.clips[clip].dur - a.dur) < 1e-3, `${id}/${clip} dur`);
      old.parts.forEach((p, kOld) => {
        const k = t.parts.indexOf(p.name); assert.ok(k >= 0, `${id}: part ${p.name} missing from the table`);
        for (let f = 0; f < a.frames.length; f++) {
          const m = frame(t, clip, f, k), w = a.frames[f][kOld];
          for (const e of COLS) assert.ok(Math.abs(m[e] - w[e]) <= 2e-3, `${id}/${clip} frame ${f} part ${p.name} [${e}] ${m[e]} vs ${w[e]}`);
        }
      });
    }
    // idle frame 0: the table's matrix × the baked part's own vertices lands on the old part × the old matrix
    old.parts.forEach((p, kOld) => {
      const k = t.parts.indexOf(p.name), part = now.find(q => q.name === p.name), bNow = box(), bWas = box(), m = frame(t, 'idle', 0, k), w = old.anims.idle.frames[0][kOld];
      for (const v of part.pos) grow(bNow, xf(m, v));
      for (let i = 0; i < p.pos.length; i += 3) grow(bWas, xf(w, p.pos.slice(i, i + 3)));
      boxNear(bNow, bWas, 2e-3, `${id}/${p.name} posed bounds`);
    });
  });
}
```

- [ ] **Step 2: Run.**
  - Run: `$UNIT node --test --test-concurrency=4 test/assets-parity.test.mjs`
  - Expected: PASS. A FAIL here is a bake or contract mismatch, not a test to loosen:
    - a palette difference: `palette: 'vertex'` did not apply, or a rename merged two materials before the palette bake;
    - a frame or posed-bounds difference: C2's layout, or the table omits a node transform. Write it up as a contract issue and stop.
- [ ] **Step 3: Prove it red.**
  - In `game.config.js`, map `cob` to `food-kit/apple.glb`, re-bake, and run. Expect FAIL on `cob: triangles`.
  - `git checkout game.config.js baked/`.
- [ ] **Step 4: Commit:** `git add test/assets-parity.test.mjs && git commit -m "test(pig-pens): the baked models match the 2.1.0 assets.json (geometry, palette, pet anim)"`

---

## Task 5: Split the sim step (bit-exact)

**Files:**
- Modify: `src/sim.js`, `src/game/farm.js`
- Create: `test/split.test.mjs`

**Interfaces:**
- Consumes: nothing new (the raw `RAPIER.World` is still the sim's own).
- Produces:
  - `sim.think()`: the AI, impulses and vehicle update. It is today's `step()` up to, but excluding, `world.step()`.
  - `sim.settle()`: `readState()`, the hose rinse and regions (the rest of today's `step()`).
  - `sim.step()` stays as `think(); world.step(); settle();` until Task 9.

- [ ] **Step 1: Write the failing test** `test/split.test.mjs`:

```js
// Phase 3k T5: the farm step split into think → Rapier → settle reproduces step() bit-for-bit, so the engine can own
// the Rapier step between them (overview §4.4: game systems before lh.physics.step, read-back after).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
await R.init();

const snap = sim => ({ pigs: sim.pigs.map(p => [p.px, p.py, p.pz, p.vx, p.vz, p.state, p.hunger, p.mud]), birds: sim.flock.birds.map(b => [b.px, b.pz, b.state]),
  dog: [sim.dog.x, sim.dog.z], counts: [...sim.counts], troughs: sim.troughs.map(t => t.level), t: sim.tractor.x });
test('think + world.step + settle equals step, every bit, through a hose, a toss and a night (seed 3, 24 pigs)', () => {
  const a = createSim(R, { pigs: 24, seed: 3 }), b = createSim(R, { pigs: 24, seed: 3 });
  const poke = (sim, s) => { if (s === 200) sim.setHose(-6, 4, true, -2, 8); if (s === 400) sim.setHose(null, null, false); if (s === 500) sim.tossFood(0, 4, 6, 0, 0); if (s === 700) sim.setNight(true); };
  for (let s = 0; s < 900; s++) { poke(a, s); poke(b, s); a.step(); b.think(); b.world.step(); b.settle(); }
  assert.deepStrictEqual(snap(b), snap(a));
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/split.test.mjs`
  - Expected: FAIL with `b.think is not a function`.

- [ ] **Step 3: Implement.**
  - In `src/sim.js`, replace the line `function step() {` (sim.js:297) with `function think() {`.
  - At today's line 581, replace the two lines

    ```js
        world.step();
        readState();
    ```

    with

    ```js
      }
      // after the Rapier step (the engine's lh.physics.step from Task 9 on): read back, rinse, count
      function settle() {
        readState();
    ```

  - Directly after the closing `}` of `settle` (today's line 607), add

    ```js
      function step() { think(); world.step(); settle(); } // the phase-0 shape; the farm steps think and settle around the engine's Rapier step
    ```

  - Add `think, settle,` after `step,` in the returned object.
  - In `src/game/farm.js` `enter`, replace the `farm.sim` system with:

```js
      // the farm step around Rapier (#106 timing stays the engine's once Task 9 hands Rapier to the World)
      ctx.system('farm.think', () => s.sim.think(), { stage: 'physics.world' });
      ctx.system('farm.rapier', () => s.sim.world.step(), { stage: 'physics.world', after: ['farm.think'] });
      ctx.system('farm.settle', () => s.sim.settle(), { stage: 'physics.world', after: ['farm.rapier'] });
```

  - Update farm.js's header comment step-order line to `… lh.scene → farm.think → farm.rapier → farm.settle → farm.events …`.

- [ ] **Step 4: Run, expect PASS.**
  - Run: `$UNIT node --test --test-concurrency=4 test/*.test.mjs`
  - Every golden must be unchanged. `golden-farm`'s bit-exact engine-vs-direct test proves the systems order.
  - Mutation check: swap the order of `readState()` and the hose block in `settle`, and expect `split` and the goldens to FAIL. Restore it.
- [ ] **Step 5: Commit:** `git commit -am "refactor(pig-pens): split the farm step into think and settle around the Rapier step"` (and `git add test/split.test.mjs`)

---

## Task 6: Tests and scripts on the engine path (bit-exact)

**Files:**
- Create: `test/farmSim.mjs`
- Modify: `test/golden.test.mjs`, `test/sim.test.mjs`, `test/pick.test.mjs`, `test/headless.mjs`, `test/day.mjs`, `test/door.mjs`, `test/food.mjs`, `test/night.mjs`, `test/fieldsweep.mjs`, `test/hose.mjs`, `test/scenarios.mjs`, `test/gates_fox.mjs`, `test/grain.mjs`, `test/tractor.mjs`

**Interfaces:**
- Consumes: `headless(game, { seed, args })`, `engine.events.on`.
- Produces: `farmSim({ pigs, seed, night }) → sim`. The farm's `createSim` object gains:
  - `step()`: one engine step;
  - `log`: the non-farm engine events, append-only; callers may `splice(0)`;
  - `h`: the handle.

After Task 9 no test constructs `createSim` itself, because a World only comes from the engine.

- [ ] **Step 1: Write** `test/farmSim.mjs`:

```js
// A headless farm for tests and the tuning scripts (phase 3k T6): the farm scene's createSim object, stepped through the
// engine (think → Rapier → settle → farm.events), with `log` collecting what the sim emitted (the farm's own UI events,
// FARM_EVENTS, left out) so `sim.log.splice(0)` replaces the old `sim.events.splice(0)`.
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { FARM_EVENTS } from '../src/game/farm.js';
await R.init();

export function farmSim({ pigs = 48, seed = 1, night = false } = {}) {
  const h = headless(pigPensGame(), { seed, args: { pigs, seed, night } });
  const sim = h.engine.scene.state.sim, log = [];
  h.engine.events.on(e => { if (!FARM_EVENTS.has(e.type)) log.push(e); });
  return Object.assign(sim, { h, log, step(n = 1) { h.step(n); } });
}
```

- [ ] **Step 2: Rewrite `test/golden.test.mjs`** onto the engine path. It still blesses `farm-seed3.json`:

```js
// Characterisation golden (lion-hawk phase 0, on the engine path since phase 3k T6): 20 s of a 24-pig farm on seed 3
// must keep producing the same world. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { golden, assertFinite, canonical, checksum } from 'lion-hawk/test';
import { FARM_EVENTS } from '../src/game/farm.js';
import { farmSim } from './farmSim.mjs';

const STEPS = 1200;
const snapshot = sim => ({
  counts: [...sim.counts],
  troughs: sim.troughs.map(t => t.level),
  pigs: sim.pigs.map(p => ({ x: p.px, z: p.pz, state: p.state, hunger: p.hunger })),
});
function run() {
  const sim = farmSim({ pigs: 24, seed: 3 }), trail = [];
  for (let i = 0; i < STEPS; i++) { sim.step(); if (i % 60 === 59) { assertFinite(snapshot(sim), `step${i}`); trail.push(checksum(snapshot(sim))); } }
  const events = sim.h.events.filter(e => !FARM_EVENTS.has(e.type)).map(e => `${e.step}:${e.type}`);
  return { state: snapshot(sim), events, trail };
}
test('golden: seed 3, 24 pigs, 1200 steps', () => { golden(new URL('./goldens/farm-seed3.json', import.meta.url), run()); });
test('determinism: two runs in one process give the same state, bit-exactly (T-10)', () => {
  assert.equal(canonical(run(), { digits: 15 }), canonical(run(), { digits: 15 }));
});
```

- [ ] **Step 3: Port the rest mechanically.** Each file's edits:
  - Replace `import RAPIER from '@dimforge/rapier3d-compat';` and `await RAPIER.init();` with `import { farmSim } from './farmSim.mjs';`. In `pick.test.mjs` the import is `R`; replace it the same way.
  - Drop `createSim` from the `../src/sim.js` import (keep `ST`, `ST_NAME`), and drop the import line if nothing is left.
  - Replace `createSim(RAPIER, ` with `farmSim(`.
  - Replace `sim.events.splice(0)` with `sim.log.splice(0)` and `sim.events.filter(` with `sim.log.filter(`.
  - Change `sim.step()` nowhere: `farmSim` supplies `step`.
  - `test/golden-farm.test.mjs` keeps its direct `createSim(R, …)` comparison until Task 9.

- [ ] **Step 4: Run, expect PASS** (bit-exact, nothing re-blessed).
  - Run: `$UNIT node --test --test-concurrency=4 test/*.test.mjs` and `$UNIT node test/tractor.mjs` (a smoke run of one script; its printout matches a run of the same script at the previous commit).
  - Mutation check: in `farmSim`, drop the `FARM_EVENTS` filter, and expect `golden: seed 3` to FAIL on the `events` list. Restore it.
- [ ] **Step 5: Commit:** `git commit -am "test(pig-pens): goldens, facts and tuning scripts on the engine path (farmSim)"` (and `git add test/farmSim.mjs`)

---

## Task 7: Feel samples before the World swap (§5.5-1)

**Files:**
- Create: `test/feel.mjs`, `test/feel-baseline.json`, `test/feel.test.mjs`

**Interfaces:**
- Consumes: `farmSim`.
- Produces: `samples()` → `{ penned, munched, gulps, bedSec, tractor: { v4, turn2, stopSec } }`, plus the tolerance table.

**The samples and tolerances** (written before any run, §5.5-2: ±3% for times and time-like rates, ±1 for counts):

| Sample | Scenario | Tolerance |
|---|---|---|
| `penned` | seed 3, 48 pigs, 120 s of day: pigs inside the six pens (`counts[0..5]`) | ±1 |
| `munched` | the same run: 5 snacks thrown into pen 4 at 10 s, `munch` events by 120 s | ±1 |
| `gulps` | seed 9, 30 pigs, night from 5 s for 40 s: chickens the fox caught | ±1 |
| `bedSec` | the same night: seconds until every bird is `INSIDE` | ±3% |
| `tractor.v4` | seed 2: speed after 4 s full throttle | ±3% |
| `tractor.turn2` | then yaw change in 2 s full steer | ±3% |
| `tractor.stopSec` | then seconds to stop under full reverse | ±3% |

- [ ] **Step 1: Write** `test/feel.mjs`:

```js
// The feel samples for golden re-blessing (overview §5.5): pigs penned after 120 s on the golden seed, snacks eaten,
// chickens caught at night, bedtime, and the tractor's acceleration, turn and stop. `node test/feel.mjs` prints them.
import { farmSim } from './farmSim.mjs';

export function samples() {
  const a = farmSim({ pigs: 48, seed: 3 }); a.step(600);
  const pen = a.lay.pens[4];
  for (let k = 0; k < 5; k++) a.tossFood(pen.cx, 4, pen.cz + 6, pen.cx + k - 2, pen.cz);
  let munched = 0;
  for (let s = 600; s < 7200; s++) { a.step(); munched += a.log.splice(0).filter(e => e.type === 'munch').length; }
  const penned = a.counts.slice(0, 6).reduce((x, y) => x + y, 0);

  const n = farmSim({ pigs: 30, seed: 9 }); n.step(300); n.setNight(true);
  let gulps = 0, bedSec = -1;
  for (let s = 0; s < 60 * 40; s++) {
    n.step(); gulps += n.log.splice(0).filter(e => e.type === 'gulp').length;
    if (bedSec < 0 && n.flock.birds.every(b => b.state === 10)) bedSec = (s + 1) / 60;
  }

  const t = farmSim({ pigs: 48, seed: 2 }), T = t.tractor; t.step(120);
  T.driven = true; T.setInput(1, 0); t.step(240); const v4 = T.speed;
  T.setInput(1, 1); const y0 = T.yaw; t.step(120); let turn2 = T.yaw - y0; turn2 = Math.atan2(Math.sin(turn2), Math.cos(turn2));
  T.setInput(-1, 0); let stopSec = -1; for (let s = 0; s < 240; s++) { t.step(); if (stopSec < 0 && T.fwd < 0.1) stopSec = (s + 1) / 60; }
  return { penned, munched, gulps, bedSec, tractor: { v4, turn2, stopSec } };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(samples(), null, 1));
```

- [ ] **Step 2: Write the failing test** `test/feel.test.mjs`:

```js
// Phase 3k T7/T10 (overview §5.5): the farm's feel stays within the tolerances written before the World swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samples } from './feel.mjs';

const BASE = JSON.parse(readFileSync(new URL('./feel-baseline.json', import.meta.url), 'utf8'));
const count = (now, was, name) => assert.ok(Math.abs(now - was) <= 1, `${name}: ${now} vs baseline ${was} (±1)`);
const rel = (now, was, name) => assert.ok(Math.abs(now - was) <= 0.03 * Math.abs(was), `${name}: ${now} vs baseline ${was} (±3%)`);
test('feel within §5.5 tolerances of the pre-World baseline', () => {
  const s = samples();
  count(s.penned, BASE.penned, 'pigs penned at 120 s'); count(s.munched, BASE.munched, 'snacks eaten'); count(s.gulps, BASE.gulps, 'chickens caught');
  rel(s.bedSec, BASE.bedSec, 'all in bed'); rel(s.tractor.v4, BASE.tractor.v4, 'tractor speed at 4 s');
  rel(s.tractor.turn2, BASE.tractor.turn2, 'tractor turn in 2 s'); rel(s.tractor.stopSec, BASE.tractor.stopSec, 'tractor stop');
});
```

- [ ] **Step 3: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/feel.test.mjs`
  - Expected: FAIL with `ENOENT … feel-baseline.json`.
- [ ] **Step 4: Record the baseline.** Run `$UNIT node test/feel.mjs > test/feel-baseline.json`. Copy the numbers into the notes' "Feel baseline" table with the commit hash.
- [ ] **Step 5: Run, expect PASS.** Mutation check: edit `feel-baseline.json` `penned` by +2 and expect FAIL. Restore it.
- [ ] **Step 6: Commit:** `git add test/feel.mjs test/feel.test.mjs test/feel-baseline.json && git commit -m "test(pig-pens): feel samples and the pre-World baseline (overview 5.5)"`

---

## Task 8: Engine checks and the migration guard (red until Task 9)

**Files:**
- Create: `test/migration.test.mjs`, `test/checks.test.mjs`

**Interfaces:**
- Consumes (§4.4): `checks.{ determinism, simPurity, zeroAlloc, materials }` from `lion-hawk/test`.
- Produces: the "Done when" guard of overview §1.3 for Pig Pens.

This task commits failing tests on purpose; the commit says so, and Task 9 turns them green. If the reviewer prefers, merge this task into Task 9's first step instead.

- [ ] **Step 1: Write** `test/migration.test.mjs`:

```js
// Phase 3k (overview §1.3): no Pig Pens file builds its own Rapier world, makes collider descs, sets literal friction,
// density or restitution, or imports assets.json. Exceptions carry `// lh-allow: <reason>` on the same line: massProps
// (D3) and raw Rapier queries (L-1); every massProps and every raw query must carry one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const files = p => statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const lines = files(src).flatMap(f => readFileSync(f, 'utf8').split('\n').map((raw, i) => ({ f, n: i + 1, raw, code: stripComments(raw) })));
const where = l => `${l.f.slice(src.length)}:${l.n}: ${l.raw.trim()}`;
const BANNED = [/new\s+[\w.]*\.World\s*\(/, /ColliderDesc\./, /\.set(Friction|Density|Restitution)\s*\(/, /CombineRule/, /setAdditionalMassProperties/, /assets\.json/];

test('no hand-built Rapier world, collider descs or literal contact numbers in game code', () => {
  assert.deepEqual(lines.filter(l => BANNED.some(r => r.test(l.code))).map(where), []);
});
test('every massProps and every raw Rapier query says why (lh-allow)', () => {
  const need = /massProps|\.cast(Ray|Shape)\w*\s*\(|\.intersections?\w*\s*\(|\.projectPoint\s*\(/;
  assert.deepEqual(lines.filter(l => need.test(l.code) && !/lh-allow: \S/.test(l.raw)).map(where), []);
});
```

- [ ] **Step 2: Write** `test/checks.test.mjs`:

```js
// Phase 3k (T-10, T-12, T-13, T-14 via lion-hawk/test checks): determinism, purity, retained allocation and material
// references for the farm on the World.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { checks } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
await R.init();

const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
test('checks.determinism: two 600-step farms agree at every checksum', () => {
  const r = checks.determinism(pigPensGame(), { seed: 3, steps: 600 }); assert.ok(r.ok, `first difference at step ${r.step}`);
});
test('checks.simPurity over the sim roots', () => {
  const r = checks.simPurity(pigPensGame(), { roots: ['game.sim.js', 'game', 'defs', 'sim.js', 'chickens.js', 'flow.js', 'layout.js', 'tractor.js'].map(src) });
  assert.notEqual(r?.ok, false, JSON.stringify(r));
});
test('checks.materials: every collider material exists and phys.json matches the registry', () => {
  const r = checks.materials(pigPensGame()); assert.notEqual(r?.ok, false, JSON.stringify(r));
});
test('checks.zeroAlloc: retained heap growth under 64 KB over 10000 steps', () => {
  const r = checks.zeroAlloc(pigPensGame(), { steps: 10000, warm: 600 }); assert.notEqual(r?.ok, false, JSON.stringify(r));
});
```

> The return shapes of `simPurity`, `materials` and `zeroAlloc` are not fixed in §4.4 (only `determinism`'s is). The asserts above accept either "throws on failure" or `{ ok, … }`. Once 3c lands, tighten each assert to the real shape and record the shape in the notes.

- [ ] **Step 3: Run, expect FAIL.**
  - Run: `$UNIT node --test --test-concurrency=4 test/migration.test.mjs test/checks.test.mjs`
  - Expected:
    - the migration guard lists the `new RAPIER.World`, `ColliderDesc.` and `setFriction` lines of `sim.js`, `chickens.js` and `tractor.js`;
    - `checks.materials` fails because `defs.models`/`phys.json` are not declared.
- [ ] **Step 4: Commit (red on purpose):** `git add test/migration.test.mjs test/checks.test.mjs && git commit -m "test(pig-pens): migration guard and engine checks (red until the World swap)"`

---

## Task 9: The farm on the World (judgment)

**Files:**
- Modify: `src/sim.js`, `src/chickens.js`, `src/tractor.js`, `src/game.sim.js`, `src/game/farm.js`, `test/golden-farm.test.mjs`
- Create: `test/world.test.mjs`

**Interfaces:**
- Consumes:
  - §4.1 `defineGame({ defs: { materials, models }, physics: { rapier, gravity, groups } })`;
  - §4.4 `ctx.world`, `world.spawn/despawn/place/setMaterial/groups.mask/rapier/R/own`, `h.find`;
  - §4.5 combine rules, `massProps` (D3).
  - Inline colliders use `shape: 'sphere' | 'box' | 'cylinder'` with `r`, `half`, `halfHeight`, `p`, `q` and `material` (Contract issue **C3**).
- Produces:
  - `createSim(world, opts)`;
  - `GROUPS`;
  - pigs, the dog, birds, the fox and snacks as entities, with their game fields on the entity and tags `pig | dog | bird | fox | food`;
  - snack ids are World ids;
  - the tractor record keeps `body`, `vc`, `W` and the rest, and gains `e`.

**Decisions (judgment):**
- **Group bits.** The group order equals today's `G_*` bits (ground 1, static 2, pig 4, food 8, dog 16, chick 32, fox 64, tractor 128), so collision filtering is unchanged.
- **Statics.** All active obstacles are one fixed entity (`obstacles`) with one collider each, in today's order. Each shut gate is its own fixed `gate` entity, spawned and despawned as today's colliders were.
- **Animal mass.** Animal bodies use `body.mass` (D3, density rescaled), so every ball weighs what it did.
- **Tractor mass.** The tractor uses `massProps` with TP's tuned 1400 kg / com / inertia (lh-allow). 2.1.0's body also counted the two density-5 boxes, about 1438.5 kg with a slightly rotated inertia frame (probed 2026-10-13). The tuned numbers win; the 2.7% difference is a listed re-bless cause ("mass from density"), and the tractor feel samples gate it.
- **Teleports.** Bird ramp walks, the fox entering, respawns and righting the tractor use `world.place` (E-8), not raw `setTranslation`. Velocity resets follow `place`'s `keep: false`.
- **Raycasts.** The pig feelers and the vehicle's rays stay raw Rapier queries (L-1), marked `// lh-allow: raw Rapier query`.
- **Vehicle controller.** It stays raw here and moves to the kit in Task 12. It is freed through `world.own`.

- [ ] **Step 1: Write the failing test** `test/world.test.mjs`:

```js
// Phase 3k T9 (E-1..E-8, M-4..M-9, S-3): the farm's bodies are World entities. Gate barriers come and go as entities,
// eaten snacks leave the World and every claim on them, and contact numbers come from the registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';

test('entities: 48 pigs, a dog, 11 birds, a fox, a tractor, the ground and one obstacles entity; nothing else at start', () => {
  const sim = farmSim({ pigs: 48, seed: 3 }), h = sim.h;
  assert.equal(h.find('pig').length, 48); assert.equal(h.find('dog').length, 1); assert.equal(h.find('bird').length, 11);
  assert.equal(h.find('fox').length, 1); assert.equal(h.find('tractor').length, 1); assert.equal(h.find('obstacles').length, 1);
  assert.equal(h.find('gate').length, 0); assert.equal(h.find('food').length, 0);
  assert.equal(sim.pigs[0], h.find('pig')[0]); // the pig record is the entity (E-4)
  assert.equal(h.world.materialOf(sim.pigs[0].colliders[0].collider.handle), 'pet');
});
test('a shut gate is one gate entity; opening it despawns it; no pig crosses a shut gate in 120 s', () => {
  const sim = farmSim({ pigs: 48, seed: 3 }), h = sim.h; sim.step(120);
  for (const g of sim.lay.gates) sim.setGate(g.id, false);
  assert.equal(h.find('gate').length, sim.lay.gates.length);
  const start = sim.pigs.map(p => p.region); sim.step(60 * 120);
  assert.equal(sim.pigs.filter((p, i) => p.region !== start[i]).length, 0);
  sim.setGate(sim.lay.gates[0].id, true); assert.equal(h.find('gate').length, sim.lay.gates.length - 1);
});
test('a snack is an entity until eaten; then no pig holds its id', () => {
  const sim = farmSim({ pigs: 48, seed: 6 }), h = sim.h; sim.step(300);
  const pen = sim.lay.pens[5], f = sim.tossFood(pen.cx, 4, pen.cz + 6, pen.cx, pen.cz);
  assert.equal(h.find('food').length, 1); assert.equal(h.get(f.id), f);
  h.until(() => !h.get(f.id), { maxSteps: 60 * 60, message: 'the snack is eaten or trampled' });
  assert.equal(sim.pigs.filter(p => p.snack === f.id).length, 0); assert.equal(h.find('food').length, 0);
});
test('grabbing swaps a pig onto the grip material and settling swaps it back (world.setMaterial)', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }), h = sim.h, p = sim.pigs[0]; sim.step(30);
  sim.grab(p.i); assert.equal(h.world.materialOf(p.colliders[0].collider.handle), 'petGrip');
  sim.release(); h.until(() => p.state !== 8, { maxSteps: 60 * 10, message: 'the pig lands' });
  assert.equal(h.world.materialOf(p.colliders[0].collider.handle), 'pet');
});
```

- [ ] **Step 2: Run, expect FAIL**
  - Run: `$UNIT node --test --test-concurrency=4 test/world.test.mjs`
  - Expected: FAIL with `h.find('pig').length` 0, because pigs are not entities yet.

- [ ] **Step 3: `src/game.sim.js`.**
  - Add the imports:

    ```js
    import MATERIALS from './defs/materials.js';
    import PHYS from '../baked/phys.json' with { type: 'json' };
    ```

  - Change `import { DT } from './sim.js';` to `import { DT, GROUPS } from './sim.js';`.
  - In `defineGame({ … })`, add after `actions: ACTIONS,`:

```js
    defs: { materials: MATERIALS, models: PHYS },
    physics: { rapier: R, gravity: [0, -9.81, 0], groups: GROUPS }, // GROUPS' order is 2.1.0's collision bits (D9: the game passes Rapier)
```

  - Update the header comment: "The caller initialises Rapier (`await R.init()`) before createEngine/boot (#6); the engine creates the World per scene (S-3)."

- [ ] **Step 4: `src/sim.js`.** Make these replacements; everything else stays byte-for-byte.

  (a) The header constants. Replace lines 10–13 (`const G_GROUND …` through `const grp = …`) with:

```js
// Collision groups by name (overview §4.1), in 2.1.0's bit order: ground 1, static 2, pig 4, food 8, dog 16, chick 32, fox 64, tractor 128.
export const GROUPS = ['ground', 'static', 'pig', 'food', 'dog', 'chick', 'fox', 'tractor'];
const not = (...xs) => GROUPS.filter(g => !xs.includes(g));
const G_STATIC = { member: ['static'], filter: not('dog', 'fox') }; // the dog and the fox hop fences
const PET_BODY = { type: 'dynamic', lock: { rot: true }, linearDamping: 0.05, angularDamping: 1.2, ccd: true, canSleep: false };
```

  (b) `createSim`'s head and the static world. Replace lines 31–57 (from `export function createSim(RAPIER, opts = {}) {` through the end of the obstacles loop) with:

```js
export function createSim(world, opts = {}) {
  const N = opts.pigs ?? 48;
  const rng = mulberry32(opts.seed ?? 1);
  const lay = buildLayout();
  const { field } = lay;

  // ---- static world (ground first, then every active obstacle in layout order, as 2.1.0 created them) -----------
  world.spawn({ body: 'fixed', tags: ['ground'], groups: { member: ['ground'], filter: GROUPS },
    colliders: [{ shape: 'box', half: [120, 0.5, 120], p: [0, -0.5, 0], material: 'pasture' }] });
  const obstacleCollider = o => {
    const h = o.h / 2, q = o.rot ? [0, Math.sin(o.rot / 2), 0, Math.cos(o.rot / 2)] : [0, 0, 0, 1];
    return o.type === 'circle' ? { shape: 'cylinder', halfHeight: h, r: o.r, p: [o.x, h, o.z], q, material: 'fencing' }
      : { shape: 'box', half: [o.hx, h, o.hz], p: [o.x, h, o.z], q, material: 'fencing' };
  };
  world.spawn({ body: 'fixed', tags: ['obstacles'], groups: G_STATIC, colliders: lay.obstacles.filter(o => o.active !== false).map(obstacleCollider) });
  const staticEntity = o => world.spawn({ body: 'fixed', tags: ['gate'], groups: G_STATIC, colliders: [obstacleCollider(o)] });
```

  (c) Pigs. Replace `makeBody` and the pig push (lines 79–112) with:

```js
  // one animal: a rotation-locked ball whose density the engine scales to `mass` (D3); its game fields ride on the entity (E-4)
  const animal = (x, z, r, mass, groups, material, fields) =>
    world.spawn({ body: { ...PET_BODY, mass }, colliders: [{ shape: 'sphere', r, material }], groups, at: [x, r, z], ...fields });
  const nAdults = Math.round(N * 0.72);
  for (let i = 0; i < N; i++) {
    const piglet = i >= nAdults;
    const r = piglet ? P.pigletR : P.adultR;
    let x, z, mom = -1;
    if (!piglet) {
      const pen = lay.pens[i % 6];
      [x, z] = freeSpot(pen.x0 + 1, pen.z0 + 1, pen.x1 - 1, pen.z1 - 1, r);
    } else {
      mom = Math.floor(rng() * nAdults);
      const m = pigs[mom];
      [x, z] = freeSpot(m.spawnX - 1.8, m.spawnZ - 1.8, m.spawnX + 1.8, m.spawnZ + 1.8, r);
    }
    const fields = { // built before the spawn, in 2.1.0's order of rng() calls
      tags: ['pig'], model: 'pig', draw: false,
      i, r, piglet, mom, spawnX: x, spawnZ: z, name: PIG_NAMES[i % PIG_NAMES.length],
      scale: (piglet ? P.pigletScale : P.adultScale) * (0.93 + 0.14 * rng()),
      mass: piglet ? P.pigletMass : P.adultMass,
      state: ST.GRAZE, timer: 1 + rng() * 5, yaw: rng() * Math.PI * 2, wa: rng() * Math.PI * 2,
      hunger: rng() * 0.6, hungerRate: 1 / (50 + rng() * 35), panic: 0, threatX: 0, threatZ: 0,
      curiosity: 15 + rng() * 50, target: null, trough: -1, snack: -1, eatT: 0,
      px: x, py: r, pz: z, vx: 0, vy: 0, vz: 0, speed: 0, dvx: 0, dvz: 0,
      region: lay.region(x, z), getUp: 0, tumbleQ: [0, 0, 0, 1], airT: 0, settleT: 0, rot: [0, 0, 0, 1],
      oink: 0, mud: rng() < 0.35 ? 0.45 + 0.55 * rng() : 0, seed: rng(), washed: 0,
    };
    pigs.push(animal(x, z, r, fields.mass, { member: ['pig'], filter: GROUPS }, 'pet', fields));
  }

  // ---- dog ------------------------------------------------------------------
  const dog = animal(22, -9, 0.36, 25, { member: ['dog'], filter: ['ground', 'pig', 'food', 'chick', 'tractor', 'fox'] }, 'pet',
    { tags: ['dog'], model: 'dog', draw: false, r: 0.36, x: 22, z: -9, yaw: -2.2, tx: 22, tz: -9, active: false, hop: 0, speed: 0, vx: 0, vz: 0, bark: 0 });
```

  Then delete the old dog lines 115–116 (`const dogB = …` and `const dog = { ...dogB, … }`).

  > 2.1.0 built each pig record *after* its body. The body takes no `rng()`, so building `fields` first keeps the rng stream.

  (d) The tractor. Replace `const tractor = createTractor(RAPIER, world, lay.tractorSpawn, grp, G);` with `const tractor = createTractor(world, lay.tractorSpawn);`.

  (e) The feeler ray. Replace lines 154–155 with:

```js
  const ray = new world.R.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const RAY_GROUPS = world.groups.mask(GROUPS, ['static']);
```

  and the cast line (183) with:

```js
      const h = world.rapier.castRayAndGetNormal(ray, len, true, undefined, RAY_GROUPS); // lh-allow: raw Rapier query (L-1)
```

  (f) Gates. In `setGate`, replace the `if (open) { … } else gateCols.set(…)` line with:

```js
    if (open) { const e = gateCols.get(id); if (e) world.despawn(e); gateCols.delete(id); }
    else gateCols.set(id, staticEntity(g.barrier));
```

  (g) The flock. Replace `const flock = createFlock({ RAPIER, world, lay, rng, grid: cgrid, emit, grp, G, DT, feelers, turnToward });` with `const flock = createFlock({ world, lay, rng, grid: cgrid, emit, DT, feelers, turnToward });`.

  (h) Grab, settle and respawn: material swaps and `place`.
  - In `grab`, replace `p.col.setFriction(0.7); p.col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);` with `world.setMaterial(p, '*', 'petGrip');`.
  - In the AIR branch, replace `p.col.setFriction(0); p.col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);` with `world.setMaterial(p, '*', 'pet');`.
  - Replace `respawn` with:

```js
  function respawn(p) {
    const lane = lay.lane; const x = (lane.x0 + lane.x1) / 2 + (rng() - 0.5) * 6, z = (lane.z0 + lane.z1) / 2;
    world.place(p, { at: [x, p.r + 0.6, z] }, { q: [0, 0, 0, 1] }); // E-8: pose and velocities together, no smear
    p.body.lockRotations(true, true); world.setMaterial(p, '*', 'pet');
    dropClaims(p); setState(p, ST.GRAZE, 1); p.panic = 0; p.respawns = (p.respawns || 0) + 1;
  }
```

  (i) Snacks are entities whose `id` is the World id. Replace `tossFood`'s body creation and the `f` literal (lines 272–281) with:

```js
    const f = world.spawn({
      body: { type: 'dynamic', ccd: true, linearDamping: 0.1, angularDamping: 0.6 },
      colliders: [{ shape: 'sphere', r, material: 'snack' }], groups: { member: ['food'], filter: GROUPS }, at: [fx, fy, fz],
      tags: ['food'], model: kind, kind, r, x: tx, y: r, z: tz, rot: [0, 0, 0, 1], fx: tx, fz: tz,
      field: grid.field(tx, tz, 0.9), claims: 0, bites: 0, age: 0, ground: 0, life: 1,
    });
    foodSeq++;
    const T = 0.85, dx = tx - fx, dz = tz - fz, dy = r - fy;
    f.body.setLinvel({ x: dx / T, y: (dy + 0.5 * 9.81 * T * T) / T, z: dz / T }, true);
    f.body.setAngvel({ x: (rng() - 0.5) * 12, y: (rng() - 0.5) * 6, z: (rng() - 0.5) * 12 }, true);
```

  Also:
  - In `removeFood`, replace `world.removeRigidBody(f.body); foods.splice(k, 1);` with `world.despawn(f); foods.splice(k, 1);`.
  - The `id: foodSeq++` key is gone. `FOOD_KINDS[foodSeq % …]` still reads the counter, which now increments after the spawn. The kind is chosen before the increment, as before.

  (j) The step. Delete `function step() { think(); world.step(); settle(); }`. In the returned object, remove `step,`.

  (k) Remove the now-unused `grp` and `G` exports. No other module may import them: `rg -n "\bG\b|grp" src` lists only the lines this task rewrites.

- [ ] **Step 5: `src/chickens.js`.**
  - Change the context line to `const { world, lay, rng, grid, emit, DT, feelers, turnToward } = ctx;`.
  - Replace `makeBird`'s body and collider lines (42–44) and the `const b = { … }` head with:

```js
    const b = world.spawn({
      body: { type: 'dynamic', lock: { rot: true }, linearDamping: 0.05, ccd: true, canSleep: false, mass },
      colliders: [{ shape: 'sphere', r, material: 'bird' }], groups: { member: ['chick'], filter: ['ground', 'static', 'pig', 'food', 'dog', 'chick', 'tractor'] },
      at: [x, r, z], tags: ['bird'], model: 'chick', draw: false,
      i: birds.length, kind, r, mass, mom,
```

  The field list then continues unchanged from `scale:` to `cluck:` and `dustT:`. It closes with `});` instead of `};`, and `birds.push(b); return b;` stays.

  - Replace `setEnabled` and `place`:

```js
  function setEnabled(b, on) { if (b.enabled === on) return; b.enabled = on; b.body.setEnabled(on); }
  function place(b, x, y, z) { world.place(b, { at: [x, y, z] }); b.px = x; b.py = y; b.pz = z; } // E-8; velocities zeroed
```

  - Replace the fox (lines 71–74) with:

```js
  const fox = world.spawn({
    body: { type: 'dynamic', lock: { rot: true }, canSleep: false, mass: 7 }, colliders: [{ shape: 'sphere', r: 0.26, material: 'foxPelt' }],
    groups: { member: ['fox'], filter: ['ground', 'pig', 'dog', 'tractor'] }, at: [0, -50, 0], tags: ['fox'], model: 'fox', draw: false,
    state: FST.AWAY, wa: 0, x: 0, z: -50, vx: 0, vz: 0, speed: 0, yaw: 0, target: null, carrying: null, fear: 0, cooldown: 30, timer: 0, hop: 0, raids: 0, steals: 0, ex: 0, ez: 0,
  });
  fox.body.setEnabled(false); // away until night (2.1.0 created it disabled)
```

  - In `foxSpawn`, replace `fox.body.setEnabled(true); fox.body.setTranslation({ x, y: 0.26, z }, true); fox.body.setLinvel({ x: 0, y: 0, z: 0 }, true);` with `fox.body.setEnabled(true); world.place(fox, { at: [x, 0.26, z] });`.

- [ ] **Step 6: `src/tractor.js`.** Replace the signature through the `own` line (lines 9–41) with:

```js
export function createTractor(world, spawn) {
  const S = TP.scale;
  const yaw = spawn.yaw - Math.PI / 2; // model faces +z, chassis faces +x
  const e = world.spawn({
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.6,
      massProps: { mass: TP.mass, com: [0.15, 0.55, 0], inertia: [900, 2200, 2000] } }, // lh-allow: D3, the playtested 1400 kg tractor
    colliders: [{ shape: 'box', half: [1.55, 0.5, 1.0], p: [0.27, 0.95, 0], material: 'paintwork' },
                { shape: 'box', half: [0.55, 0.55, 0.62], p: [-0.55, 1.95, 0], material: 'paintwork' }],
    groups: { member: ['tractor'], filter: ['ground', 'static', 'pig', 'chick', 'food', 'dog', 'fox'] },
    at: [spawn.x, 0.05, spawn.z], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], tags: ['tractor'], model: 'tractor',
  });
  const body = e.body;
  const vc = world.rapier.createVehicleController(body);
  world.own(e, () => world.rapier.removeVehicleController(vc));
  // model-space wheel centres and radii (from the Kenney tractor), scaled into the chassis frame
  const W = [
    { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
    { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  ];
  for (const w of W) {
    w.cx = w.mz * S; w.cy = w.my * S; w.cz = -w.mx * S; w.radius = w.r * S;
    vc.addWheel({ x: w.cx, y: w.cy + 0.12, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TP.suspRest, w.radius);
  }
  for (let i = 0; i < W.length; i++) {
    vc.setWheelSuspensionStiffness(i, TP.stiffness); vc.setWheelSuspensionCompression(i, TP.compression);
    vc.setWheelSuspensionRelaxation(i, TP.relaxation); vc.setWheelFrictionSlip(i, TP.slip);
    vc.setWheelMaxSuspensionForce(i, 1e6); vc.setWheelMaxSuspensionTravel(i, 0.3);
  }
  const rayGroups = world.groups.mask(['ground', 'static', 'pig', 'food', 'dog', 'chick', 'fox', 'tractor'], ['ground', 'static']);
  const own = new Set(e.colliders.map(c => c.collider.handle));
```

  Then:
  - In the `t` literal, change `body, vc, W, cols,` to `e, body, vc, W,`.
  - Mark `vc.updateVehicle(DT, undefined, rayGroups, c => !own.has(c.handle));` with `// lh-allow: raw Rapier query (the vehicle's rays, L-1)`.
  - Replace `rightIfTipped`'s body:

```js
      const q = body.rotation(); const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (upY < 0.3) { const p = body.translation(); world.place(e, { at: [p.x, 0.6, p.z] }, { yaw: this.yaw - Math.PI / 2 }); return true; }
      return false;
```

- [ ] **Step 7: `src/game/farm.js`.**
  - In `enter`, replace `sim: createSim(R, { … })` with `sim: createSim(ctx.world, { pigs: a.pigs ?? 48, seed: a.seed ?? e.seed, night: !!a.night }),`.
  - Replace the three systems from Task 5 with:

```js
      // the farm step around the engine's Rapier step (overview §4.4): think before lh.physics.step, settle after the events
      ctx.system('farm.think', () => s.sim.think(), { stage: 'physics.world', before: ['lh.physics.step'] });
      ctx.system('farm.settle', () => s.sim.settle(), { stage: 'physics.world', after: ['lh.physics.events'] });
```

  - Delete `exit(e, ctx) { ctx.state.sim.world.free(); },`: the engine disposes the World (S-3).
  - Change `makeFarm({ R })` to `makeFarm()`, update its caller in `game.sim.js`, and remove the now-unused `R` parameter.

- [ ] **Step 8: `test/golden-farm.test.mjs`.** Delete the test `the engine path and a direct createSim run agree to the last bit` and the `createSim` import: a direct run no longer exists, and `golden.test.mjs` blesses `farm-seed3` on the same path.

- [ ] **Step 9: Run (goldens excluded), expect PASS.**
  - First delete `test/split.test.mjs`: it compares a direct `createSim(R)`, which no longer exists. Task 5's guarantee is carried by the goldens; record that in the commit body.
  - Run: `$UNIT node --test --test-concurrency=4 test/world.test.mjs test/migration.test.mjs test/checks.test.mjs test/flow.test.mjs test/pick.test.mjs test/sim.test.mjs test/invariants.test.mjs test/purity.test.mjs`
  - Expected: all pass. `sim.test.mjs` holds two-sided facts (tractor 5.2–5.6 m/s, turn 1.8–2.0 rad, stop 1.2–1.4 s, bedtime 10–13 s, gulp 20–24 s), so a failure there is a feel change. Do not widen a range: go to Task 10's stop rule.
  - Mutation check: give the pig `animal(…)` call `'petGrip'` instead of `'pet'`, and expect the world test's `materialOf` assert to FAIL. Restore it.
- [ ] **Step 10: Commit:** `git commit -am "feat(pig-pens): the farm's bodies are World entities on registry materials"` (and `git add test/world.test.mjs`; `git rm test/split.test.mjs`). The goldens are red until Task 10; say so in the body.

---

## Task 10: Re-bless the goldens under §5.5

**Files:**
- Modify: `test/goldens/farm-seed3.json`, `test/goldens/farm-scene.json`, `docs/phase-3k-notes.md`

**Interfaces:**
- Consumes: Task 7's baseline and Task 9's swap.
- Produces: blessed goldens and the notes' re-bless record.

- [ ] **Step 1: Determinism first.** `$UNIT node --test --test-concurrency=4 test/checks.test.mjs` must PASS (`checks.determinism`). If it fails, stop: that is a bug, not a re-bless.
- [ ] **Step 2: Feel.**
  - Run: `$UNIT node --test --test-concurrency=4 test/feel.test.mjs`
  - If any sample is outside its tolerance, **stop**. Record the sample table in the notes, and report it to the user as a playtest item with the numbers. Do not re-bless.
  - The herd counts are chaotic (±1 of 48). If `penned` misses by more than 1 while every other sample passes, that is still a stop. In the report, also give `penned` for seeds 5 and 7 before and after (run `feel.mjs` with the seed edited, scratch only), so the user can rule.
- [ ] **Step 3: Bless.** `$UNIT -E LH_BLESS=1 node --test --test-concurrency=4 test/golden.test.mjs test/golden-farm.test.mjs`, then the full unit suite without `LH_BLESS` must PASS.
- [ ] **Step 4: Notes.** Under "Re-bless 1 (World)", record:
  - the reason: World creation order, combine rules (`√f` with Multiply, restitution Max), mass from density with `body.mass`, and the tractor's `massProps` without the 38.5 kg box mass;
  - the baseline/after table of every feel sample;
  - the old and new golden checksums;
  - the commit.
  
  No tapes are stored for Pig Pens; `flow.test.mjs` records and replays in process.
- [ ] **Step 5: Commit:** `git add test/goldens docs/phase-3k-notes.md && git commit -m "test(pig-pens): re-bless the farm goldens for the World swap (combine rules, mass from density)"`

**0.8.0 checkpoint:** the unit suite is green, the e2e suite is green (`$BROWSER node --test --test-concurrency=4 test/e2e.browser.mjs`), and goldens are blessed once. Report to the controller before starting 0.9.0 work.

---

## Task 11: The R1/R3 baseline (today's view, before Task 13)

**Files:**
- Modify: `src/game.view.js` (a read-only `view.perf` hook)
- Create: `test/perf.browser.mjs`

**Interfaces:**
- Consumes:
  - `lion-hawk/playwright` `launch`, `openGame(browser, url, { preset, seed, args, query })`;
  - `game.page`;
  - `test/serve.mjs` (today's bundle).
- Produces: `view.perf()` → `{ calls, triangles, programs }` read after a frame, and the baseline rows in the notes.

- [ ] **Step 1: Hook.** In `src/game.view.js` `farm.enter`, after `view.project = project;`, add:

```js
      // R1 measurement (phase 3k): draw calls and programs of the last drawn frame (read with ?tilt=0: one render per frame)
      view.perf = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length });
```

  In `exit`, add `view.perf = undefined;`.

- [ ] **Step 2: Write** `test/perf.browser.mjs` (a script, not run by `npm test`):

```js
// R1/R3 measurement (overview §8): draw calls and shader programs per scene state, median frame time and time to settled,
// under SwiftShader on the desktop preset. Prints one JSON line. Run: $BROWSER node test/perf.browser.mjs [query]
import { launch, openGame } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';

const query = Object.fromEntries(new URLSearchParams(process.argv[2] ?? ''));
const chrome = await launch(), site = await servePigPens();
const t0 = Date.now();
const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: { pigs: 48 }, query: { tilt: '0', ...query } });
const settledMs = Date.now() - t0;
const frames = n => game.page.evaluate(n => new Promise(r => { const ts = []; const f = t => { ts.push(t); if (ts.length > n) r(ts); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const median = ts => { const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b); return d[d.length >> 1]; };
const out = { query, settledMs };
await frames(30); out.day = { ...(await game.page.evaluate(() => window.engine.view.perf())), frameMs: median(await frames(120)) };
await game.tap('farm.night'); await game.step(1); await frames(90);
out.night = { ...(await game.page.evaluate(() => window.engine.view.perf())), frameMs: median(await frames(120)) };
console.log(JSON.stringify(out));
await game.close(); await chrome.close(); await site.close();
```

- [ ] **Step 3: Measure today.** Run `$BROWSER node test/perf.browser.mjs` twice and keep the second run. Copy into the notes' "R1 baseline" row: `calls`, `programs`, `frameMs` (day and night) and `settledMs`.
- [ ] **Step 4: Size today (R3).** Bundle with `build.py`'s esbuild flags into the scratchpad, never `site/`:

```bash
mkdir -p $SCRATCH/pp-today && cd $G && npx esbuild src/main.js --bundle --format=iife --minify --loader:.json=json --outfile=$SCRATCH/pp-today/app.js --log-level=warning
node -e "const fs=require('fs');const app=fs.readFileSync('$SCRATCH/pp-today/app.js','utf8').replace(/<\/script/g,'<\\\\/script');fs.writeFileSync('$SCRATCH/pp-today/index.html',fs.readFileSync('template.html','utf8').replace('<!--APP-->',()=>app))"
wc -c < $SCRATCH/pp-today/index.html; gzip -9 -c $SCRATCH/pp-today/index.html | wc -c
```

  Record the html bytes and gzip bytes in the notes ("R3 baseline").

- [ ] **Step 5: Run the unit suite** (goldens unchanged); the e2e suite still passes.
- [ ] **Step 6: Commit:** `git commit -am "test(pig-pens): R1/R3 baseline hook and measurement script"` (and `git add test/perf.browser.mjs`)

---

## Task 12: The tractor on the vehicle kit (bit-exact or stop)

**Files:**
- Modify: `src/tractor.js`, `src/game/farm.js`

**Interfaces:**
- Consumes (§4.10):
  - `createVehicle(world, e, { wheels: [{ at, radius, front, suspension: { rest, stiffness, compression, relaxation, travel, maxForce } }], rayGroups })`;
  - `car.set(i, { steer, engine, brake, slip })`;
  - `car.controller`, `car.wheels[i]`.
  - The kit's update runs before `lh.physics.step` under the system name `lh.vehicle.update`, and the kit's rays exclude the chassis's own colliders (Contract issue **C4**).
- Produces: `tractor.car`. The record keeps `vc` (= `car.controller`) for the view's wheel reads.

- [ ] **Step 1: The test is the bit-exact goldens plus `sim.test.mjs`'s tractor facts.** Add one failing assertion to `test/world.test.mjs`:

```js
test('the tractor drives on the vehicle kit (lion-hawk/kits/vehicle)', () => {
  const sim = farmSim({ pigs: 24, seed: 2 }); assert.ok(sim.tractor.car?.controller, 'tractor.car from createVehicle');
  assert.equal(sim.tractor.vc, sim.tractor.car.controller);
});
```

  Run `$UNIT node --test --test-concurrency=4 test/world.test.mjs`. Expect FAIL: `tractor.car from createVehicle`.

- [ ] **Step 2: Implement.**
  - In `src/tractor.js`, import `{ createVehicle } from 'lion-hawk/kits/vehicle'`.
  - Replace everything from `const vc = world.rapier.createVehicleController(body);` through the `own` line with:

```js
  // model-space wheel centres and radii (from the Kenney tractor), scaled into the chassis frame
  const W = [
    { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
    { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  ];
  for (const w of W) { w.cx = w.mz * S; w.cy = w.my * S; w.cz = -w.mx * S; w.radius = w.r * S; }
  const car = createVehicle(world, e, {
    wheels: W.map(w => ({ at: [w.cx, w.cy + 0.12, w.cz], radius: w.radius, front: w.front,
      suspension: { rest: TP.suspRest, stiffness: TP.stiffness, compression: TP.compression, relaxation: TP.relaxation, travel: 0.3, maxForce: 1e6 } })),
    rayGroups: { member: ['ground', 'static', 'pig', 'food', 'dog', 'chick', 'fox', 'tractor'], filter: ['ground', 'static'] },
  });
  const vc = car.controller;
```

  - Change the `t` literal's `e, body, vc, W,` to `e, body, car, vc, W,`.
  - In `step`, replace the per-wheel loop and the `vc.updateVehicle(…)` line with:

```js
      for (let i = 0; i < 4; i++) car.set(i, { steer: W[i].front ? this.steer : 0, engine: W[i].front ? 0 : force / 2, brake, slip: TP.slip });
      // the kit's lh.vehicle.update runs the controller before lh.physics.step (after farm.think)
```

  - In `farm.js`, change `farm.think`'s options to `{ stage: 'physics.world', before: ['lh.vehicle.update', 'lh.physics.step'] }`.

- [ ] **Step 3: Run, expect PASS: the full unit suite with goldens unchanged.**
  - A golden change here is not a §5.5 cause. If one appears, check three things in this order: the kit's wheel axle and direction (Pig Pens uses (0,−1,0) and (0,0,1)), the kit's own-collider filter, and the update order.
  - If none of them explains it, stop and write it up for the integrator (C4).
- [ ] **Step 4: Commit:** `git commit -am "feat(pig-pens): the tractor on the lion-hawk vehicle kit"`

---

## Task 13: Renderer, lights, tilt-shift and preload (judgment)

**Files:**
- Modify: `src/game.view.js`, `src/main.js`, `src/view/world.js` (scene, lights and fog creation removed), `src/farm3d.js` (`buildFarmExtras` takes the light rig)

**Interfaces:**
- Consumes:
  - §4.6 `defineView({ scenes, render })` and `boot(game, view, { canvas, timer, … })`;
  - `view.gfx = { renderer, scene, camera, lights, resize, size, render }`;
  - `createTiltShift(renderer, opts)` → `{ render(scene, camera, focus), params }` (today's API, made generic);
  - §4.7 `view.assets.preload(keys)` and `view.wait`.
  - The manifest reaches boot as `defineView({ assets: { manifest, base } })` (Contract issue **C6**).
  - A post pass replaces `view.gfx.render` (Contract issue **C5**).
- Produces:
  - `pigPensView({ tilt, shading })`;
  - `MODEL_KEYS`;
  - `buildWorld({ gfx, assets, mc, sim, tilt })`.

**Decisions:**
- **Shading.** It defaults to `'lambert'` until Task 22 measures (D5 and R1: today's look and cost). `?shading=physical|standard|lambert` overrides it for the measurement.
- **DPR.** It stays 2 on touch and desktop (today's `min(dpr, 2)`, not the engine's touch default of 1.5). Task 22 may lower it on the measured numbers.
- **Day and night.** These stay game code: `updateSky` writes `lights.hemi`, `lights.sun`, the background and the fog, because the sun moves to the moon position at night and a preset change may not move it (§4.6). The light rig makes the lights.

- [ ] **Step 1: Write the failing e2e assertion.** Add to the first desktop test in `test/e2e.browser.mjs`, after `expectScene`:

```js
    const gfx = await game.page.evaluate(() => { const v = window.engine.view; return { gfx: !!v.gfx?.renderer, scene: v.gfx?.scene?.isScene, loaded: v.assets?.progress?.loaded, total: v.assets?.progress?.total }; });
    assert.deepEqual(gfx, { gfx: true, scene: true, loaded: 33, total: 33 }); // the engine renderer, every model preloaded (A-10)
```

  Run `$BROWSER node --test --test-concurrency=4 test/e2e.browser.mjs`. Expect FAIL: `gfx: false`.

- [ ] **Step 2: `src/game.view.js`.**
  - Replace the module-level `renderer`/`camera` and the bootstrap in `enter` with the engine's. The new head of the module:

```js
// Pig Pens' browser half (lion-hawk 2e P6/P7, [S-1]; on the phase 3 renderer since 3k T13): the farm's view half over the
// sim half's `farm` scene. It reads engine.scene.state and never writes it. Renderer, camera, lights, assets, compiler,
// sync and audio are the engine's (view.gfx, view.assets, view.materials, view.sync, view.audio).
import * as THREE from 'three';
import { defineView, createTiltShift } from 'lion-hawk/view';
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { buildWorld } from './view/world.js';
import { createHud } from './view/hud.js';
import { rig, attach, fitCam, applyCam, project, chase, afterDrive, bindGestures } from './view/rig.js';
import { Sound } from './sound.js';

export const MODEL_KEYS = Object.keys(MANIFEST.models);
const SKY = '#bfe6f5';
let sound = null, tilts = new WeakMap(); // one synth and one tilt-shift per page and renderer
```

  - `pigPensView` becomes `export function pigPensView({ tilt = true, shading = 'lambert' } = {})`. Its `defineView` call:

```js
  return defineView({ scenes: { farm }, assets: { manifest: MANIFEST, base: './assets/' },
    render: {
      shading, dpr: { touch: 2, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none', exposure: 1,
      camera: { fov: 48, fovPortrait: 64, near: 0.3, far: 400 },
      lights: { sky: SKY, ground: '#b9a27c', hemi: 1.3, sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: 38, offset: [-26, 46, 22] }, fog: [70, 170] },
    } });
```

  - `farm.enter(engine, view)` builds after the preload:

```js
    enter(engine, view) {
      const doc = view.doc, gfx = view.gfx, canvas = gfx.renderer.domElement, s = engine.scene.state;
      sound ??= new Sound();
      let fx = tilts.get(gfx.renderer); if (!fx) tilts.set(gfx.renderer, fx = createTiltShift(gfx.renderer, { on: tilt })); fx.params.on = tilt;
      const sun = gfx.lights.sun; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.camera.near = 5; sun.shadow.camera.far = 120;
      if (!gfx.scene.background?.isColor) gfx.scene.background = new THREE.Color(SKY);
      // C5: the tilt-shift post pass draws the frame instead of the plain render; restored on exit
      const plain = gfx.render; gfx.render = () => fx.render(gfx.scene, gfx.camera, rig.cam.dist);
      offs.push(() => { gfx.render = plain; });
      const first = !rig.ready; attach(gfx.camera, canvas); if (first) { fitCam(); applyCam(); }
      view.project = project;
      view.wait(view.assets.preload(MODEL_KEYS).then(() => {
        world = buildWorld({ gfx, assets: view.assets, mc: view.materials, sim: s.sim });
        hud = createHud(doc, { world }); frame = 0;
        doc.getElementById('loading')?.remove();
      }));
      // … the events listener and the rest of today's enter, unchanged, with `camera` read as gfx.camera
    },
```

  The resize closure, the `win.addEventListener('resize', …)`, `new THREE.WebGLRenderer` and `new THREE.PerspectiveCamera` all go: `gfx.resize` is the engine's (portrait FOV 64 below aspect 0.9 is in `render.camera`).

  - `frame` drops `world.draw(...)`; boot renders through `gfx.render` (step 4 of §4.6).
  - `exit` calls `world?.dispose()`.
  - The `view.perf` hook reads `view.gfx.renderer.info`.

- [ ] **Step 3: `src/view/world.js`.**
  - `buildWorld({ gfx, assets, mc, sim })` adds everything to one `root = new THREE.Group()` added to `gfx.scene`. The new `dispose()` is `gfx.scene.remove(root); disposeTree(root, { keepShared: true });`, with `disposeTree` from `lion-hawk/view`.
  - Delete:
    - lines 17–29: the scene, SKY, fog, the tilt-shift construction, `hemi` and `sun`;
    - the `draw` method;
    - the `tilts` WeakMap.
  - Every `scene.add(` becomes `root.add(`.
  - `buildFarmExtras({ scene: root, sim, matV, sun: gfx.lights.sun, hemi: gfx.lights.hemi, fogColor: gfx.scene.fog.color, background: gfx.scene.background })`, and in `farm3d.js` `updateSky` writes `background.copy(sky)` (it wrote `scene.background`).
  - The ASSETS-based geometry stays until Task 14, so this task changes no model geometry.

- [ ] **Step 4: `src/main.js`.**

```js
async function start() {
  await R.init();
  const q = new URLSearchParams(location.search), canvas = document.getElementById('c');
  const shading = ['physical', 'standard', 'lambert'].includes(q.get('shading')) ? q.get('shading') : 'lambert';
  const { engine } = boot(pigPensGame(), pigPensView({ tilt: q.get('tilt') !== '0', shading }), {
    canvas, args: { pigs: +q.get('pigs') || 48 }, seed: 1, devices: devices(document),
    timer: q.has('fps') ? () => performance.now() : undefined, // #106: world.stats.stepMs for the ?fps readout (Task 22)
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view half could not start (WebGL)
}
```

  The `$('loading')?.remove()` moves into the preload's `then` (Step 2).

- [ ] **Step 5: Run.** The unit suite must be unchanged (view-only, §5.5). Then `$BROWSER node --test --test-concurrency=4 test/e2e.browser.mjs`: expect PASS.
- [ ] **Step 6: Commit:** `git commit -am "feat(pig-pens): the farm draws through the engine renderer, light rig and tilt-shift post"`

---

## Task 14: Scenery from the baked models

**Files:**
- Create: `src/view/models.js`
- Modify: `src/view/world.js`, `src/farm3d.js`

**Interfaces:**
- Consumes:
  - `assets.get(key)` → `{ scene }`;
  - `mc.get(id, { instanced, vertexColors })` (§4.8);
  - `createInstances({ geometry, material, max, castShadow, receiveShadow })` → `{ mesh, set(i, p, q, s), commit() }` (§4.9). The game passes Matrix4s through `mesh.setMatrixAt` where an instance carries more than (p, q, s).
- Produces:
  - `modelGeometry(assets, key, xf?, { parts? })`;
  - `partGeometry(assets, key, name)`;
  - `boxGeo`, `colorGeo`, `mergeGeos` and `lerpM` (moved from `gfx.js`);
  - `sceneryMaterials(mc)` → `{ plain, instanced }`, both `scenery` with vertex colours.

**Decision: decor draws with one material.** All instanced decor uses `scenery` (vertex colours carry the look), so each decor model stays one draw call, as today. Per-material groups would add about 12 draws and fail R1's draw-call gate.

- [ ] **Step 1: Write the failing test** `test/models.test.mjs` (Node, three only, with a fake `assets` built from a baked GLB through three's `GLTFLoader.parse` and `MeshoptDecoder`):

```js
// Phase 3k T14: geometry from baked models matches what assets.json gave the view (triangles, bounds), and part
// geometry stays node-local (the pig's eyelid mask reads node-local positions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { modelGeometry, partGeometry } from '../src/view/models.js';

const root = new URL('../', import.meta.url), OLD = JSON.parse(readFileSync(new URL('src/assets.json', root), 'utf8'));
const MAN = JSON.parse(readFileSync(new URL('baked/manifest.json', root), 'utf8'));
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = key => { const b = readFileSync(new URL(`baked/${MAN.models[key].glb}`, root)); return new Promise((ok, no) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, no)); };
const fake = async keys => { const m = new Map(); for (const k of keys) m.set(k, { scene: (await load(k)).scene }); return { get: k => m.get(k) }; };

test('modelGeometry: model space, the old triangle count, position+normal+color only', async () => {
  const assets = await fake(['fence', 'hay']);
  for (const k of ['fence', 'hay']) {
    const g = modelGeometry(assets, k), tris = g.index.count / 3, old = Object.values(OLD[k]).reduce((s, p) => s + p.idx.length / 3, 0);
    assert.equal(tris, old, k); assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position'], k);
  }
});
test('partGeometry: the pig body is node-local and keeps the face where the eyelid mask expects it (z ≈ 0.64)', async () => {
  const g = partGeometry(await fake(['pig']), 'pig', 'body'); g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.max.z - 0.64) < 0.03, `${g.boundingBox.max.z}`);
});
```

  Run `$UNIT node --test --test-concurrency=4 test/models.test.mjs`. Expect FAIL: `Cannot find module …/src/view/models.js`.

> If `GLTFLoader.parse` needs a DOM global in Node (for images, which these palette-baked GLBs have none of), the test stubs `globalThis.self = globalThis` before importing the loader. Record it in the notes if needed.

- [ ] **Step 2: Write** `src/view/models.js`:

```js
// Geometry from baked models (phase 3k; replaces gfx.js's geoFrom/modelGeo over assets.json): a model's mesh nodes in
// model space merged into one geometry (position, normal, color only) so one instanced draw covers it, or one part in
// its node-local space for the anim-table crowds. Plus the small box/colour/merge helpers the farm builds props with.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'color'];
// a float copy of the attributes the farm draws with (baked attributes may be normalised integers)
function plain(g) {
  const out = new THREE.BufferGeometry();
  for (const k of KEEP) { const a = g.attributes[k]; if (!a) continue; const n = a.count, f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } out.setAttribute(k, new THREE.BufferAttribute(f, 3)); }
  if (g.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  else out.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i), 1));
  return out;
}
// every mesh of `key` (or only those named in `parts`) in model space, merged; `xf` applied last
export function modelGeometry(assets, key, xf = null, { parts = null } = {}) {
  const { scene } = assets.get(key), list = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (o.isMesh && (!parts || parts.includes(o.name))) list.push(plain(o.geometry).applyMatrix4(o.matrixWorld)); });
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (xf) g.applyMatrix4(xf);
  return g;
}
// one mesh node's geometry in its own node-local space (the pet crowds' anim tables give the node's model-space matrix)
export function partGeometry(assets, key, name) {
  let found = null; assets.get(key).scene.traverse(o => { if (!found && o.isMesh && o.name === name) found = o; });
  if (!found) throw new Error(`pig-pens: model '${key}' has no part '${name}'`);
  return plain(found.geometry);
}
export const colorGeo = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
export function mergeGeos(list) {
  const parts = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of KEEP) { const a = new Float32Array(n * 3); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, 3)); }
  return out;
}
export const boxGeo = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colorGeo(g, hex); };
export const lerpM = (a, b, u, out) => { const A = a.elements, B = b.elements, o = out.elements; for (let k = 0; k < 16; k++) o[k] = A[k] + (B[k] - A[k]) * u; return out; };
// the one decor material, plain and instanced (M-13: separate clones by construction)
export const sceneryMaterials = mc => ({ plain: mc.get('scenery', { vertexColors: true }), instanced: mc.get('scenery', { instanced: true, vertexColors: true }) });
```

- [ ] **Step 3: Replace the call sites.**
  - In `world.js`:
    - `import { ASSETS, geoFrom, modelGeo, mergeGeos, boxGeo, animM, sampleAnim, lerpM } from '../gfx.js';` becomes `import { modelGeometry, mergeGeos, boxGeo, sceneryMaterials } from './models.js';`.
    - Add `const MAT = sceneryMaterials(mc);`.
    - `matV` is replaced per use: `MAT.instanced` in `instanced(…)`, the trough food and the foods; `MAT.plain` in `patch`, the ground and the trough mesh.

    | Today | Becomes |
    |---|---|
    | `geoFrom([ASSETS.fence.fence_simple], recentre)` | `modelGeometry(assets, 'fence', recentre, { parts: ['fence_simple'] })` |
    | `geoFrom([ASSETS.planks.fence_planks], recentre)` | `modelGeometry(assets, 'planks', recentre, { parts: ['fence_planks'] })` |
    | `modelGeo('cob' \| 'cabbage' \| 'carrot' \| 'apple')` (trough food) | `modelGeometry(assets, kind)` |
    | decor `name === 'corn' ? geoFrom(Object.values(ASSETS.corn)) : …` | `modelGeometry(assets, name, name === 'barrel' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.34, 0.38, 0)) : null)` |

  - In `farm3d.js`:
    - The gfx import becomes `import { modelGeometry, mergeGeos, boxGeo, colorGeo } from './view/models.js';`.
    - `buildFarmExtras` takes `{ scene, sim, assets, mc, MAT, sun, hemi, fogColor, background }`.
    - The leaf geometry becomes `modelGeometry(assets, 'gate', new THREE.Matrix4().makeTranslation(0.15, 0.05, 0.465), { parts: ['gate'] }).scale(3.15, 1, 1)`.
    - The egg geometry becomes `modelGeometry(assets, 'egg')`.
    - `matV` becomes `MAT.instanced` for `InstancedMesh`es (posts, leaves, eggs) and `MAT.plain` for `coopMesh`, `nestMesh` and `doorPanel`.
  - The chickens, fox and tractor still read `ASSETS` until Tasks 16 and 17; `gfx.js` stays until Task 20.

- [ ] **Step 4: Run.** The unit suite (including `models.test.mjs`) must be unchanged and green, then the e2e suite. Screenshot check by hand: `$BROWSER node -e` is not needed; open the scratch build in Task 20's server. Record "corn shows four cobs" in the notes.
- [ ] **Step 5: Commit:** `git commit -am "feat(pig-pens): fences, decor, troughs, gates and eggs from the baked models on the compiler's scenery material"` (and `git add src/view/models.js test/models.test.mjs`)

---

## Task 15: The pig crowd on anim tables

**Files:**
- Create: `src/view/pigSkin.js`, `src/view/pigs3d.js`
- Modify: `src/view/world.js` (the pig, Zzz and dog blocks move out)

**Interfaces:**
- Consumes:
  - `sampleAnimTable(table, clip, t, partIndex, outMatrix4)`, with `table = assets.get('pig').anim` (§4.7; it wraps `t` cyclically, as `gfx.js`'s `sampleAnim` did);
  - `world.xfPrev(e, out)` and `e.xf.p` for interpolation (E-11);
  - `partGeometry`.
- Produces: `createPigs({ root, assets, sim, world })` → `{ update(dt, alpha), meshes, dispose }`.

**Decision: pig mud stays game-owned.** The pig skin (mud blotches that creep up from the legs, closed eyelids at night) stays a game material, `pigSkin.js`, moved verbatim. The compiler's `COVERAGE` is per entity (`mc.coverage` is a per-entity clone), and 48 pigs are one instanced draw per part. Contract issue **C7** asks for instanced coverage; until then the look and the program are unchanged.

- [ ] **Step 1: Write** `src/view/pigSkin.js`: the material from `world.js` lines 147–181, moved verbatim, plus a cache key:

```js
// The pig skin (moved from world.js, phase 3k T15): Lambert with vertex colours plus per-instance mud (blotchy noise that
// creeps up from the legs, aMud = mud, seed, scale, sleep) and closed eyelids at night (aEye on the face vertices).
// Game-owned until the compiler's COVERAGE takes per-instance values (contract issue C7).
import * as THREE from 'three';

export function pigSkin() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    // ← the body of world.js:148-181 (pigMat.onBeforeCompile), unchanged
  };
  m.customProgramCacheKey = () => 'pig-skin';
  return m;
}
```

  The comment line marks where the 34 moved lines go. The implementer pastes them without edits; the reviewer diffs them against `world.js` at the parent commit.

- [ ] **Step 2: Write** `src/view/pigs3d.js`:

```js
// The pig crowd (phase 3k T15, A-11): one InstancedMesh per pig part, posed from the baked anim table with a blend on
// clip changes, interpolated between steps from the World's transform pool (E-11), on the game's pig skin. Moved from
// world.js; pickAnim and the tumble/rest pose are unchanged.
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
import { partGeometry, lerpM } from './models.js';
import { pigSkin } from './pigSkin.js';
import { ST } from '../sim.js';

export function createPigs({ root, assets, sim, world }) {
  const table = assets.get('pig').anim, names = table.parts, N = sim.pigs.length, UP = new THREE.Vector3(0, 1, 0);
  const geos = names.map(n => partGeometry(assets, 'pig', n));
  // eyelids: tag the eye vertices (flat white and grey patches on the face) with (flag, u, v), as world.js did
  { const g = geos[names.indexOf('body')], pos = g.attributes.position, col = g.attributes.color, eye = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      const white = r > 0.75 && gg > 0.75 && b > 0.75, grey = Math.abs(r - gg) < 0.03 && b > r && r < 0.12;
      if (Math.abs(z - 0.64) < 0.02 && y > 0.6 && y < 0.93 && Math.abs(x) > 0.05 && Math.abs(x) < 0.48 && (white || grey)) eye.set([1, (Math.abs(x) - 0.06) / 0.41, (y - 0.62) / 0.31], i * 3);
    }
    g.setAttribute('aEye', new THREE.BufferAttribute(eye, 3)); }
  for (const g of geos) if (!g.attributes.aEye) g.setAttribute('aEye', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  const mud = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); mud.setUsage(THREE.DynamicDrawUsage);
  for (const g of geos) g.setAttribute('aMud', mud);
  const mat = pigSkin();
  const meshes = geos.map(g => { const m = new THREE.InstancedMesh(g, mat, N); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); return m; });
  const anim = sim.pigs.map(() => ({ name: 'idle', t: Math.random(), prev: 'idle', prevT: 0, blend: 1, rest: 0, phase: Math.random() * 10 }));
  function pickAnim(p, s) { /* world.js:191-205, unchanged */ }
  const W = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qid = new THREE.Quaternion(), Qt = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Qr = new THREE.Quaternion();
  const PM = new THREE.Matrix4(), PB = new THREE.Matrix4(), TMP = new THREE.Matrix4(), ZX = new THREE.Vector3(0, 0, 1), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
  function update(dt, alpha) {
    for (const p of sim.pigs) {
      const s = anim[p.i], [name, rate] = pickAnim(p, s);
      if (name !== s.name) { s.prev = s.name; s.prevT = s.t; s.name = name; s.blend = 0; }
      s.t += dt * rate; s.prevT += dt * rate; s.blend = Math.min(1, s.blend + dt * 6);
      s.rest += ((p.state === ST.REST ? 1 : 0) - s.rest) * Math.min(1, dt * 3);
      Qy.setFromAxisAngle(UP, p.yaw);
      if (p.state === ST.GRAB || p.state === ST.AIR) Q.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]).multiply(Qy);
      else if (p.getUp > 0) { Qt.set(p.tumbleQ[0], p.tumbleQ[1], p.tumbleQ[2], p.tumbleQ[3]); Q.copy(Qid).slerp(Qt, p.getUp * p.getUp * (3 - 2 * p.getUp)).multiply(Qy); }
      else Q.copy(Qy);
      if (s.rest > 0.01) Q.multiply(Qr.setFromAxisAngle(ZX, s.rest * 1.45 * (p.i % 2 ? 1 : -1)));
      world.xfPrev(p, prev); const c = p.xf.p; // E-11: lerp(prev, curr, alpha); 2.1.0 drew the current step only
      v3.set(prev.p.x + (c.x - prev.p.x) * alpha, prev.p.y + (c.y - prev.p.y) * alpha, prev.p.z + (c.z - prev.p.z) * alpha);
      W.compose(v3, Q, s3.setScalar(p.scale)).multiply(TMP.makeTranslation(0, -p.r / p.scale, 0));
      if (s.rest > 0.01) W.multiply(TMP.makeTranslation((p.i % 2 ? -1 : 1) * 0.35 * s.rest, -0.18 * s.rest, 0));
      for (let k = 0; k < meshes.length; k++) {
        sampleAnimTable(table, s.name, s.t, k, PM);
        if (s.blend < 1) { sampleAnimTable(table, s.prev, s.prevT, k, PB); lerpM(PB, PM, s.blend, PM); }
        meshes[k].setMatrixAt(p.i, TMP.multiplyMatrices(W, PM));
      }
      mud.setXYZW(p.i, p.mud, p.seed, p.scale, s.rest > 0.6 ? 1 : 0);
    }
    mud.needsUpdate = true; for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }
  return { update, meshes, anim, dispose() { for (const g of geos) g.dispose(); mat.dispose(); } };
}
```

  `pickAnim`'s marked body is world.js lines 192–204, verbatim. It uses `sim.hose` and `sim.time`, both in scope.

- [ ] **Step 3: `world.js`.**
  - Delete the pet block (lines 131–233) and `updatePigs`.
  - Construct `const pigs = createPigs({ root, assets, sim, world: engineWorld })`. `buildWorld` gains `engineWorld`; game.view passes `engine.world`.
  - The Zzz code reads `pigs.anim[p.i].rest` where it read `animState[p.i].rest`.
  - `update(dt, s, frame)` gains `alpha` and calls `pigs.update(dt, alpha)`; `game.view.js` frame passes `alpha`.

- [ ] **Step 4: Run.** Before Step 2's code is wired, add this e2e assertion to the first desktop test and run e2e. Expect FAIL with `0`: 2.1.0's pig material has no cache key.

```js
    const skins = await game.page.evaluate(() => window.engine.view.gfx.scene.getObjectsByProperty('isInstancedMesh', true).filter(m => m.material.customProgramCacheKey?.() === 'pig-skin').length);
    assert.equal(skins, 6, 'one pig-skin crowd per pig part (body, Group, four legs)');
```

  After the wiring: unit suite unchanged, then e2e PASS.

- [ ] **Step 5: Commit:** `git commit -am "feat(pig-pens): the pig crowd on baked anim tables, interpolated from the transform pool"` (and `git add src/view/pigSkin.js src/view/pigs3d.js`)

---

## Task 16: Chickens with compiler fur; the dog and fox on AnimationMixer

**Files:**
- Create: `src/view/flock3d.js`
- Modify: `src/farm3d.js` (the chickens and fox move out), `src/view/world.js` (the dog moves out)

**Interfaces:**
- Consumes:
  - `mc.furGeometry(geometry, mask)`: geometry with group 0 = base and group 1 = shells (§4.8);
  - `mc.get('plumage', { instanced: true, vertexColors: true })`: the `FUR` material for group 1;
  - `mc.get('pet', { instanced: true, vertexColors: true })` for group 0 and the other parts (Contract issue **C8**);
  - `assets.clone('dog' | 'fox')`, `assets.get(k).clips` and `THREE.AnimationMixer` (A-11);
  - `sampleAnimTable` for the chick.
- Produces: `createFlock3d({ root, assets, mc, sim, spawnFeathers })` → `{ update(dt) }`. Feathers stay in `farm3d.js`; the fox's feather spit calls the `spawnFeathers` it is given.

**Decision: the bare face is trimmed by vertex mask.** 2.1.0 trimmed the chicken's face per fragment with a `bare` box and a 0.14 fade. The compiler's `look.fur` has `length, shells, density, tint` only. Pig Pens zeroes the fur mask on the face's own vertices (front-facing normal inside the old bare box), so the face is bare without the fade. It goes on the playtest list, and C8 asks for a trim box.

- [ ] **Step 1: Write the failing e2e assertion** (desktop test 1):

```js
    const fur = await game.page.evaluate(() => { let n = 0; window.engine.view.gfx.scene.traverse(o => { if (o.isInstancedMesh && o.geometry.attributes.furShell && o.geometry.groups.length === 2) n++; }); return n; });
    assert.ok(fur >= 6, `chicken body and wings carry shells in both crowds: ${fur}`); // adult and chick sets × body, wing-left, wing-right
    assert.equal(await game.page.evaluate(() => !!window.engine.view.gfx.scene.getObjectByName('animal-dog')), true, 'the dog is a cloned model');
```

  Run e2e. Expect FAIL: no `animal-dog` (today's dog meshes are anonymous).

- [ ] **Step 2: Write** `src/view/flock3d.js`. The chickens are moved from `farm3d.js` lines 116–171, with these changes:
  - geometry from `partGeometry`;
  - colours converted with `l2s`/`s2l` because baked colours are linear;
  - fur from the compiler;
  - frames from `sampleAnimTable`.

  The dog and fox move from `world.js` lines 185–187 and 255–265 and `farm3d.js` lines 187–211, onto mixers.

```js
// Chickens, the fox and the dog (phase 3k T16). Chickens: two instanced crowds (white adults, yellow chicks) on the baked
// chick anim table; body and wings carry shell fur from the material compiler (look.fur on `plumage`), the face kept bare by
// the mask (C8). Fox and dog: cloned models on AnimationMixer (A-11), as single animals need no table.
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
import { partGeometry, lerpM } from './models.js';
import { CST, FST } from '../chickens.js';

const l2s = c => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const UP = new THREE.Vector3(0, 1, 0), NB = 26;

export function createFlock3d({ root, assets, mc, sim, spawnFeathers }) {
  const flock = sim.flock, coop = sim.lay.coop, table = assets.get('chick').anim, names = table.parts;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), PM = new THREE.Matrix4(), PB = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), tint = new THREE.Color();
  const base = mc.get('pet', { instanced: true, vertexColors: true }), fur = mc.get('plumage', { instanced: true, vertexColors: true });
  // plumage test on sRGB 0..255 colours (as farm3d.js): white-ish/yellow body and wing feathers
  const plume = (wing, r, g) => r >= 250 && g >= (wing ? 140 : 170);
  const BARE = [[-0.47, 0.4, 0.5], [0.47, 0.96, 1]]; // 2.1.0's face box: front-facing vertices inside it get no fur
  const bare = (pos, nrm, i) => nrm.getZ(i) > 0.9 && pos.getX(i) > BARE[0][0] && pos.getX(i) < BARE[1][0] && pos.getY(i) > BARE[0][1] && pos.getY(i) < BARE[1][1] && pos.getZ(i) > BARE[0][2];
  function partSet(adult) {
    return names.map(name => {
      const g = partGeometry(assets, 'chick', name), col = g.attributes.color, wing = name.startsWith('wing'), pos = g.attributes.position, nrm = g.attributes.normal;
      const src = Array.from({ length: col.count }, (_, i) => [l2s(col.getX(i)), l2s(col.getY(i)), l2s(col.getZ(i))]);
      if (adult) src.forEach(([r, gg], i) => { if (!plume(wing, r, gg)) return; // white laying hens (Kenney's chick is yellow)
        const sh = wing ? 0.8 + 0.2 * Math.min(1, (gg - 150) / 57) : 0.9 + 0.1 * Math.min(1, (gg - 170) / 40);
        col.setXYZ(i, s2l(248 * sh), s2l(246 * sh), s2l(240 * sh)); });
      const furry = name === 'body' || wing;
      const geo = furry ? mc.furGeometry(g, i => plume(wing, src[i][0], src[i][1]) && !bare(pos, nrm, i) ? 1 : 0) : g;
      const m = new THREE.InstancedMesh(geo, furry ? [base, fur] : base, NB); m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < NB; i++) { m.setColorAt(i, tint.setRGB(1, 1, 1)); m.setMatrixAt(i, ZERO); }
      root.add(m); return m;
    });
  }
  const adultMeshes = partSet(true), babyMeshes = partSet(false), all = [...adultMeshes, ...babyMeshes], birdAnim = [];
  function birdClip(b) { /* farm3d.js:132-142, unchanged */ }
  function updateBirds(dt) {
    for (const b of flock.birds) {
      let a = birdAnim[b.i]; if (!a) a = birdAnim[b.i] = { name: 'idle', t: Math.random(), prev: 'idle', pt: 0, blend: 1, painted: false };
      const set = b.kind === 'chick' ? babyMeshes : adultMeshes, other = b.kind === 'chick' ? adultMeshes : babyMeshes;
      if (!a.painted) { if (b.kind === 'chick') tint.setRGB(1, 1, 1); else tint.setRGB(b.tint[0], b.tint[1], b.tint[2]); for (const m of set) { m.setColorAt(b.i, tint); m.instanceColor.needsUpdate = true; } for (const m of other) m.setMatrixAt(b.i, ZERO); a.painted = true; }
      if (b.hidden || b.state === CST.INSIDE || b.state === CST.LOST) { for (const m of set) m.setMatrixAt(b.i, ZERO); continue; }
      let [name, rate] = birdClip(b) || (b.speed < 0.08 ? ['idle', 1] : b.speed < 1.0 ? ['walk', b.speed / (0.5 * b.scale / 0.3)] : ['run', b.speed / (1.6 * b.scale / 0.3)]);
      if (name !== a.name) { a.prev = a.name; a.pt = a.t; a.name = name; a.blend = 0; }
      a.t += dt * rate; a.pt += dt * rate; a.blend = Math.min(1, a.blend + dt * 8);
      const sit = b.state === CST.LAY || b.state === CST.BROOD || (b.state === CST.DUST && b.dusting) ? 0.28 * b.scale : 0;
      M.compose(v.set(b.px, b.py - b.r - sit, b.pz), q.setFromAxisAngle(UP, b.yaw), s.setScalar(b.scale));
      for (let k = 0; k < set.length; k++) {
        sampleAnimTable(table, a.name, a.t, k, PM); if (a.blend < 1) { sampleAnimTable(table, a.prev, a.pt, k, PB); lerpM(PB, PM, a.blend, PM); }
        set[k].setMatrixAt(b.i, T.multiplyMatrices(M, PM));
      }
    }
    for (const m of all) m.instanceMatrix.needsUpdate = true;
  }
  // a single animal on its mixer: the clip by speed, rate as the old tables (no blend, as 2.1.0)
  function mixed(key) {
    const obj = assets.clone(key), mixer = new THREE.AnimationMixer(obj), clips = assets.get(key).clips, acts = {};
    for (const c of clips) acts[c.name] = mixer.clipAction(c);
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); obj.matrixAutoUpdate = false; root.add(obj);
    let cur = null;
    return { obj, play(name, rate, dt) { if (cur !== name) { if (cur) acts[cur].stop(); acts[name].reset().play(); cur = name; } mixer.update(dt * rate); } };
  }
  const dog = mixed('dog'), fox = mixed('fox');
  const cheekMat = new THREE.MeshLambertMaterial({ color: '#f0eadf' });
  const cheeks = [-1, 1].map(sd => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), cheekMat); m.position.set(sd * 0.36, 0.56, 0.7); m.castShadow = true; fox.obj.add(m); return m; });
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffd84a' })); tuft.position.set(0.05, 0.62, 0.98); fox.obj.add(tuft);
  for (const m of [...cheeks, tuft]) m.matrixAutoUpdate = true;
  const foxA = { t: 0, puff: 0 };
  function updateDog(dt) {
    const d = sim.dog, name = d.speed < 0.2 ? 'idle' : d.speed < 2.5 ? 'walk' : 'run', rate = name === 'idle' ? 1 : name === 'walk' ? d.speed / 0.7 : d.speed / 2.4;
    dog.obj.matrix.compose(v.set(d.x, Math.sin(Math.min(1, d.hop) * Math.PI / 2) * 1.05, d.z), q.setFromAxisAngle(UP, d.yaw), s.setScalar(0.62)); dog.obj.matrixWorldNeedsUpdate = true;
    dog.play(name, rate, dt);
  }
  function updateFox(dt) {
    const f = flock.fox; fox.obj.visible = f.state !== FST.AWAY; if (!fox.obj.visible) return;
    const name = f.speed < 0.2 ? 'idle' : f.speed < 2.2 ? 'walk' : 'run', rate = name === 'idle' ? 1 : name === 'walk' ? f.speed / 0.8 : f.speed / 3;
    foxA.t += dt * rate;
    fox.obj.matrix.compose(v.set(f.x, Math.sin(Math.min(1, f.hop) * Math.PI / 2) * 1.0, f.z), q.setFromAxisAngle(UP, f.yaw), s.setScalar(0.5)); fox.obj.matrixWorldNeedsUpdate = true;
    fox.play(name, rate, dt);
    foxA.puff += ((f.carrying ? 1 : 0) - foxA.puff) * Math.min(1, dt * 6);
    const wob = 1 + Math.sin(foxA.t * 9) * 0.08 * foxA.puff;
    cheeks.forEach((c, k) => { c.visible = foxA.puff > 0.02; c.scale.setScalar(Math.max(0.01, foxA.puff * wob * (k ? 1.05 : 0.95))); });
    tuft.visible = foxA.puff > 0.5; tuft.rotation.y = Math.sin(foxA.t * 6) * 0.4;
    if (f.carrying && Math.random() < dt * 4) { v.set(0, 0.62, 1.0).applyMatrix4(fox.obj.matrix); spawnFeathers(v.x, v.y, v.z, 1, f.carrying.tint, 0.6); }
  }
  return { update(dt) { updateBirds(dt); updateFox(dt); updateDog(dt); } };
}
```

  `birdClip`'s marked body is farm3d.js lines 133–141, verbatim.

  Check the clone's root name: the dog GLB's root node is `animal-dog`, so `getObjectByName('animal-dog')` finds the clone. If the bake renames roots, assert on `dog.obj.name` instead, and record it.

- [ ] **Step 3: Wire it.**
  - `farm3d.js` deletes the chickens and fox (lines 116–171 and 187–211) and the `furGeo`/`furMaterial` import.
  - `update(dt)` calls `flock3d.update(dt)`; `buildFarmExtras` constructs `createFlock3d({ root: scene, assets, mc, sim, spawnFeathers })` after the feathers block.
  - `world.js` deletes the dog meshes, `updateDog` and `DOG_ANIM`.
- [ ] **Step 4: Run.** The unit suite is unchanged. Then e2e: expect PASS. Playtest notes: the chicken face trim and the mixer's frame interpolation (it was table-sampled).
- [ ] **Step 5: Commit:** `git commit -am "feat(pig-pens): chickens with compiler fur on the anim table; dog and fox on AnimationMixer"` (and `git add src/view/flock3d.js`)

---

## Task 17: The tractor and snacks through view sync

**Files:**
- Create: `src/view/tractor3d.js`
- Modify: `src/farm3d.js` (the tractor moves out), `src/view/world.js` (the thrown snacks move out)

**Interfaces:**
- Consumes (§4.9):
  - `view.sync.on(match, { create(e, obj, view), frame(e, obj, alpha, view), remove(e, obj) })` → `off`;
  - `sync` draws `model` entities with `draw !== false` as `assets.clone(model)`, and sets pose (lerp/nlerp) and `scale = e.scale ?? 1` before the hook's `frame`;
  - the tractor entity (`model: 'tractor'`), `tractor.vc`;
  - snacks (`tags: ['food']`, `model: kind`).
- Produces: `bindTractorAndSnacks(sync, { sim, lightsNight })` → `off()`.

- [ ] **Step 1: Write the failing e2e assertion** (the iPhone landscape drive test, after driving):

```js
    const tr = await game.page.evaluate(() => { const e = window.engine.world.with('body').find(x => x.tags.has('tractor')), o = window.engine.view.sync.objectOf(e); return o ? Math.hypot(o.position.x - e.xf.p.x, o.position.z - e.xf.p.z) : -1; });
    assert.ok(tr >= 0 && tr < 0.5, `the synced tractor object sits on its body: ${tr}`);
```

  Run e2e. Expect FAIL: `-1` (the tractor is drawn by `farm3d.js`).

- [ ] **Step 2: Write** `src/view/tractor3d.js`:

```js
// The tractor and thrown snacks through the engine's view sync (phase 3k T17, E-6/E-11): sync clones the model, poses it
// from the transform pool (interpolated) and removes it on despawn; these hooks add the model frame (Kenney's tractor
// faces +z, the chassis +x, scale 1.6), the red paint, the wheels from the vehicle controller and the night headlight,
// and give each snack its centred pivot and its shrink as it is eaten.
import * as THREE from 'three';
import { TP } from '../tractor.js';

const FOOD_SCALE = { apple: 1.7, carrot: 0.75, cabbage: 1.35, cob: 1.0 };
export function bindTractorAndSnacks(sync, { sim, night }) {
  const S = TP.scale, tr = sim.tractor, T = new THREE.Quaternion(), R = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const offs = [];
  offs.push(sync.on('model:tractor', {
    create(e, obj) {
      const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; inner.scale.setScalar(S);
      while (obj.children.length) inner.add(obj.children[0]); obj.add(inner); inner.updateMatrixWorld(true);
      // Kenney's grey-blue bodywork painted farm red, trim kept (farm3d.js's recolour, on the clone's own colours)
      const body = inner.getObjectByName('body'); body.geometry = body.geometry.clone();
      const c = body.geometry.attributes.color; for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); if (b > r * 1.1 && r > 0.08) { const l = 0.3 * r + 0.6 * g + 0.1 * b; c.setXYZ(i, Math.min(1, l * 3.4), l * 0.42, l * 0.32); } }
      c.needsUpdate = true;
      // each wheel turns about its own centre: a pivot at the centre, the wheel node attached under it (keeps its offset)
      obj.userData.wheels = tr.W.map(w => { const pivot = new THREE.Group(); pivot.position.set(w.mx, w.my, w.mz); inner.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(inner.getObjectByName(w.name)); return pivot; });
      obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const head = new THREE.SpotLight('#fff2cc', 0, 26, 0.55, 0.5, 1.2); head.position.set(1.7, 1.25, 0); head.target.position.set(9, 0, 0); obj.add(head, head.target); obj.userData.head = head;
    },
    frame(e, obj) {
      obj.userData.wheels.forEach((pivot, i) => {
        const w = tr.W[i], susp = tr.vc.wheelSuspensionLength(i) ?? TP.suspRest, rot = tr.vc.wheelRotation(i) ?? 0, st = tr.vc.wheelSteering(i) ?? 0;
        pivot.position.y = w.my + (0.12 - susp) / S;                          // chassis y = model y (rotY keeps y)
        pivot.quaternion.copy(T.setFromAxisAngle(Y, st)).multiply(R.setFromAxisAngle(X, rot)); // chassis rotZ(-rot) is model rotX(rot)
      });
      obj.userData.head.intensity = (tr.driven ? 60 : 0) * night();
    },
  }));
  offs.push(sync.on('#food', {
    create(e, obj) { const box = new THREE.Box3().setFromObject(obj), cy = (box.max.y + box.min.y) / 2; for (const c of obj.children) c.position.y -= cy; obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); },
    frame(e, obj) { obj.scale.setScalar(FOOD_SCALE[e.kind] * (1 - Math.min(1, e.bites / 2.5) * 0.7) * Math.max(0, e.life)); },
  }));
  return () => { for (const f of offs) f(); };
}
```

- [ ] **Step 3: Wire it.**
  - `game.view.js` enter: `offs.push(bindTractorAndSnacks(view.sync, { sim: s.sim, night: () => world?.night ?? 0 }))`. `world.night` returns `extras.night`.
  - `farm3d.js` deletes the tractor block (lines 213–239) and `updateTractor`.
  - `world.js` deletes `foodMeshes`, `FOOD_SCALE` and `updateFoods`.
- [ ] **Step 4: Run.**
  - The unit suite is unchanged. Then e2e: PASS, including the drive tests.
  - By hand on the scratch build: the wheels turn and steer about their centres. If a wheel orbits its centre, the pivot's `w.mx` is wrong for the baked node; record the measured centre.
- [ ] **Step 5: Commit:** `git commit -am "feat(pig-pens): tractor and snacks drawn by the engine's view sync"` (and `git add src/view/tractor3d.js`)

---

## Task 18: Camera gestures on bindGesture, uncapped presses, and pressing during an orbit

**Files:**
- Modify: `src/view/rig.js`, `src/devices.js`, `src/game/farm.js`
- Create: `test/flow-orbit.test.mjs`

**Interfaces:**
- Consumes:
  - `bindGesture(engine, el, { drag, pinch, uncapped, tapMove, filter })` → `{ update, dispose }` (0.7.x, #59);
  - `bindPointer({ uncapped: true })` (#56);
  - `makeProject(camera, canvas)` (§4.9).
- Produces:
  - `rig.downTool`;
  - `gestureDevices(engine, canvas)` → devices;
  - the `tool` command's Hand `move` with `orbit: true`, sent once per orbit.

**Decision: `createOrbitRig` is not adopted (Contract issue C9).** Its contract (`{ update, bindGesture, ray }`) exposes no pose. Pig Pens needs to read and write yaw, pitch, distance and target for its drive chase, aspect framing, clamps and the Hand's orbit hand-off. The pose math stays in `rig.js`; the pointer tracking (#59) and `project` move to the engine.

- [ ] **Step 1: Write the failing test** `test/flow-orbit.test.mjs`:

```js
// Phase 3k final pass: a Hand drag that became an orbit (the view's bindGesture) tells the sim once with an orbit `move`,
// so `pressing` turns off at once and a later press cannot drive (2e carry-over: pressing stayed true during an orbit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';
import { tool } from './rays.mjs';

test('Hand down on the tractor presses; an orbit move clears it; the press that follows does not drive', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }), h = sim.h, at = [sim.tractor.x, 1.2, sim.tractor.z];
  tool(h, 'down', at); h.step(1); assert.equal(h.state().pressing, true);
  tool(h, 'move', at, { orbit: true }); h.step(1); assert.equal(h.state().pressing, false, 'pressing during an orbit');
  tool(h, 'press', at); h.step(1); assert.equal(h.state().driving, false);
  tool(h, 'up', at); tool(h, 'tap', at, { orbit: true }); h.step(1); assert.equal(h.state().selected, null);
});
```

  Run `$UNIT node --test --test-concurrency=4 test/flow-orbit.test.mjs`. Expect FAIL: `pressing during an orbit` (true !== false).

- [ ] **Step 2: Sim.** In `farm.js` `api.pointer`, change the `move` branch to:

```js
      if (ph === 'move') { if (g.tool === 'hand' && d.orbit) g.target = null; else if (g.down) move(e, s, g, d); } // the view turned the Hand into an orbit: nothing to press
```

- [ ] **Step 3: View, `rig.js`.**
  - Delete `bindGestures` and `project`.
  - Import `bindGesture` and `makeProject` from `lion-hawk/view`.
  - Add `downTool: 'hand'` to `rig`, and in `attach` set `rig.project = makeProject(camera, canvas)`. `game.view.js` uses `view.project = rig.project`.
  - Append:

```js
// Camera gestures on the engine's bindGesture (#59), on uncapped time (#56): one finger (Hand: orbit after ORBIT_PX;
// driving: the chase offset), two fingers pinch/turn/pan, right-drag orbit, middle-drag pan, the wheel zooms. The tool
// gesture is bindPointer's; the two agree through rig.orbiting, which the view sets here and devices.js reads.
export function gestureDevices(canvas) {
  const cam = rig.cam;
  let kind = null, lx = 0, ly = 0, d0 = 0, r0 = 0, px = 0, py = 0;
  const one = engine => ({ dx, dy, phase }) => {
    const s = engine.scene.state;
    if (phase === 'start') { kind = s.driving ? 'chase' : rig.downTool === 'hand' ? 'orbit' : null; if (kind === 'orbit') rig.orbiting = true; lx = 0; ly = 0; return; }
    if (phase === 'end') { kind = null; return; }
    if (kind === 'orbit' && s.driving) kind = null; // a Hand gesture begun before the drive must not orbit it
    const mx = dx - lx, my = dy - ly; lx = dx; ly = dy;
    if (kind === 'chase') { rig.chaseOff -= mx * 0.006; cam.pitch += my * 0.004; }
    else if (kind === 'orbit') { cam.yaw -= mx * 0.006; cam.pitch += my * 0.005; }
  };
  const two = engine => ({ scale, rotate, panX, panY, phase }) => {
    if (phase === 'start') { d0 = cam.dist; r0 = 0; px = 0; py = 0; return; }
    cam.dist = d0 / Math.max(0.1, scale);
    const da = rotate - r0; r0 = rotate;
    if (engine.scene.state.driving) rig.chaseOff += da; else { cam.yaw += da; panBy(panX - px, panY - py); }
    px = panX; py = panY;
  };
  const drag = (engine, f) => { let x = 0, y = 0; return ({ dx, dy, phase }) => { if (phase === 'start') { x = 0; y = 0; return; } f(dx - x, dy - y); x = dx; y = dy; }; };
  const wheel = () => { const on = e => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); }, menu = e => e.preventDefault();
    canvas.addEventListener('wheel', on, { passive: false }); canvas.addEventListener('contextmenu', menu);
    return { update() {}, dispose() { canvas.removeEventListener('wheel', on); canvas.removeEventListener('contextmenu', menu); } }; };
  return [
    engine => bindGesture(engine, canvas, { drag: one(engine), pinch: two(engine), tapMove: ORBIT_PX }),
    engine => bindGesture(engine, canvas, { filter: { button: [2] }, tapMove: 0, drag: drag(engine, (mx, my) => { cam.yaw -= mx * 0.006; cam.pitch += my * 0.005; }) }),
    engine => bindGesture(engine, canvas, { filter: { button: [1] }, tapMove: 0, drag: drag(engine, (mx, my) => panBy(mx, my)) }),
    wheel,
  ];
}
```

- [ ] **Step 4: Devices.** In `devices.js`:
  - In `toolAt`, on `'down'` set `rig.downTool = tool; rig.orbiting = false; rig.pressAt = { x: cx, y: cy };`. These lines were `bindGestures`' pointerdown work.
  - Add a per-gesture `let orbitSent = false;` (reset on `'down'`).
  - Replace the Hand block with:

```js
    if (tool === 'hand') {
      if (phase === 'move') { if (rig.orbiting && !orbitSent) { orbitSent = true; return { ray: ray(cx, cy), orbit: true }; } return null; } // once: the sim drops the press target
      if (rig.orbiting && phase === 'press') return null;
      if (rig.orbiting && phase === 'tap') return { ray: ray(cx, cy), orbit: true };
    }
```

  - In `devices(doc)`, pass `uncapped: true` to `bindPointer` (#56), and append `...gestureDevices($('c'))`.
  - Delete `bindGestures(engine, canvas)` from `game.view.js`'s `offs`.

- [ ] **Step 5: Run.**
  - Unit suite: `flow-orbit` PASS, goldens unchanged.
  - e2e: PASS for the right-drag test, the pinch test and "a Hand press that became a drive does not orbit".
  - The e2e `holdUntil` comment about capped time changes to "uncapped since 3k (#56): about 0.75 s of real time".
- [ ] **Step 6: Commit:** `git commit -am "feat(pig-pens): camera gestures on bindGesture with uncapped presses; an orbit clears the Hand's press"` (and `git add test/flow-orbit.test.mjs`)

---

## Task 19: Sound on the engine audio service

**Files:**
- Modify: `src/sound.js`, `src/game.view.js`

**Interfaces:**
- Consumes (§4.9, #67): `view.audio = createAudio({ doc, flags })` → `{ ctx, master, unlocked, onUnlock, mute, … }`. It unlocks on the first capturing `pointerdown`/`keydown`/`touchend`, suspends while hidden, honours `?mute`, and puts a limiter on the master bus.
- Produces: `new Sound(audio)`.

- [ ] **Step 1: Write the failing e2e assertion** (desktop test 1, after the first click):

```js
    assert.equal(await game.page.evaluate(() => window.engine.view.audio.unlocked), true, 'the first click unlocked audio (#67)');
```

  Run e2e. Expect FAIL: `view.audio` undefined before boot gets `render`. If 3e's stub makes it inert and `unlocked` is false, the assertion still fails red.

- [ ] **Step 2: `sound.js`.** Replace the constructor, `unlock()` and `ok` with:

```js
// Tiny WebAudio synth for farm noises, on the engine's audio service (#67: unlock, hidden-tab suspend, ?mute, limiter).
export class Sound {
  constructor(audio) { this.audio = audio; this.muted = false; this.lastOink = 0; this.oinks = 0; this.bus = null; }
  get ctx() { return this.audio.ctx; }
  get master() { if (!this.bus && this.ctx) { this.bus = this.ctx.createGain(); this.bus.gain.value = 0.55; this.bus.connect(this.audio.master); } return this.bus; }
  get ok() { return !!this.ctx && this.audio.unlocked && !this.muted && this.ctx.state === 'running'; }
```

  The rest of the class reads `this.ctx` and `this.master` as before.

- [ ] **Step 3: `game.view.js`.**
  - `sound ??= new Sound(view.audio)`.
  - Delete the `unlock`/`onKey` closures and their two `addEventListener`/`removeEventListener` pairs. The engine's capturing listener replaces them; 2.1.0 skipped Escape, and the engine unlocks on any key, which goes on the playtest list.
- [ ] **Step 4: Run.** The unit suite is unchanged; e2e PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat(pig-pens): farm sounds on the engine audio service (#67)"`

---

## Task 20: Retire the old pipeline; build with lion-hawk build

**Files:**
- Delete: `src/gfx.js`, `src/fur.js`, `src/tiltshift.js`, `bake.mjs`, `build.py`
- Move: `src/assets.json` → `test/fixtures/assets-v2.1.0.json`
- Modify: `test/assets-parity.test.mjs`, `test/models.test.mjs` (fixture path), `test/serve.mjs`, `pwa/sw.js`, `test/purity.test.mjs`
- Create: `test/offline.browser.mjs`

**Interfaces:**
- Consumes: `lion-hawk build --game <dir> --out <dir> [--e2e]`, which writes `index.html`, `assets/models/*`, the PWA files and `sw.js` with `__VERSION__` and `__PRECACHE__` stamped, and prints the size report (§4.3).
- Produces: `servePigPens()` serving a `lion-hawk build` output; the offline check (R3).

- [ ] **Step 1: Write the failing test** `test/offline.browser.mjs`:

```js
// R3 (overview §8): after one online visit the service worker serves the page and every model offline. Run under the
// browser lock: $BROWSER node --test --test-concurrency=4 test/offline.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';

test('loads offline after the first visit (sw precache: page, manifest, icons, assets/models/*)', async t => {
  let chrome; try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) return t.skip(e.message); throw e; }
  const site = await servePigPens(), ctx = await chrome.browser.newContext({ serviceWorkers: 'allow' }), page = await ctx.newPage();
  try {
    await page.goto(site.url + '?lh-test'); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => window.engine?.view?.assets?.progress?.loaded === 33, null, { timeout: 60000 });
    await ctx.setOffline(true); await page.reload();
    await page.waitForFunction(() => window.engine?.view?.assets?.progress?.loaded === 33, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.engine.scene.name), 'farm');
  } finally { await ctx.close(); await chrome.close(); await site.close(); }
});
```

  Run `$BROWSER node --test --test-concurrency=4 test/offline.browser.mjs`. Expect FAIL: the 2.1.0 `sw.js` precaches no `assets/models/*`, and today's server serves none.

- [ ] **Step 2: `test/serve.mjs`.**

```js
// Builds Pig Pens with `lion-hawk build` into a scratch dir (never site/, constraint 8) and serves it on a random local
// port for the browser tests. servePigPens() → { url, dir, close }. $PIGPENS_OUT, when set, is the build dir.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
export async function servePigPens() {
  const dir = process.env.PIGPENS_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pigpens-e2e-'));
  const r = spawnSync('npx', ['lion-hawk', 'build', '--game', root, '--out', dir, '--e2e'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`lion-hawk build failed:\n${r.stdout}${r.stderr}`);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, dir, close: () => new Promise(ok => { server.closeAllConnections?.(); server.close(() => ok()); }) };
}
```

  `os.tmpdir()` follows `$TMPDIR`; set `TMPDIR=$SCRATCH` in the `BROWSER` runs. In `e2e.browser.mjs`, delete `ENTRY`/`PIGPENS_ENTRY` and call `servePigPens()`.

- [ ] **Step 3: `pwa/sw.js`.**
  - Replace the `PRECACHE` line with `const PRECACHE = __PRECACHE__; // stamped by lion-hawk build: ./, the manifest, the icons and every assets/models/* (D1)`.
  - Update the header comment: "The game is one HTML file plus its baked models beside it (D1)".
- [ ] **Step 4: Delete and move.**
  - `git rm src/gfx.js src/fur.js src/tiltshift.js bake.mjs build.py`
  - `git mv src/assets.json test/fixtures/assets-v2.1.0.json`
  - In both tests, change `src/assets.json` to `test/fixtures/assets-v2.1.0.json`.
  - In `test/purity.test.mjs` `RULES`, change the view-module pattern to `(main|entry|game\.view|devices|farm3d|sound|view\/[^'"]*)`: `gfx`, `fur` and `tiltshift` are gone.
  - `rg -n "gfx|fur\.js|tiltshift|assets\.json" src` must print nothing.
- [ ] **Step 5: Build to scratch** and read the size report: `$UNIT npx lion-hawk build --game . --out $SCRATCH/pig-pens`. Keep the printed report for Task 22.
- [ ] **Step 6: Run.**
  - The unit suite (the migration guard now scans the view too) is green.
  - Then e2e, then `offline.browser.mjs` (both under `$BROWSER`, one at a time): PASS.
- [ ] **Step 7: Commit:** `git commit -am "build(pig-pens): lion-hawk build replaces build.py and bake.mjs; models precached by the service worker"` (and `git add test/offline.browser.mjs test/fixtures`)

---

## Task 21: Final-pass UI items (Get out, hose move, HUD selection)

**Files:**
- Modify: `template.html`, `test/e2e.browser.mjs`, `src/view/hud.js`
- Create: `test/hud.test.mjs`

**Interfaces:**
- Produces: `sameSelection(last, sel)` → boolean, which updates `last` in place (no allocation).

- [ ] **Step 1: Write the failing tests.**
  - In `test/e2e.browser.mjs`, the tappable test: replace the `exitBox` lines and `expectTappable(game, 'farm.exit', { min: 40 })` with `await expectTappable(game, 'farm.exit'); // ≥ 44 px (#63)`.
  - In the iPhone Shoo/Hose test, after `assert.equal((await game.state()).hose.active, true);` add:

```js
    const hx0 = (await game.state()).hose.x;
    await game.touch.move(1, { world: [pen[0] + 3, 0, pen[2]] }); await frames(game); await game.step(2);
    assert.ok((await game.state()).hose.x > hx0 + 1, 'a hose drag moves the spray (the move commands reach the sim)');
```

  - `test/hud.test.mjs`:

```js
// 2e carry-over: the HUD compared selections through a string built every frame; sameSelection compares in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sameSelection } from '../src/view/hud.js';

test('sameSelection: true for the same kind and index, false (and remembered) on a change, null handled', () => {
  const last = { kind: null, i: -1 };
  assert.equal(sameSelection(last, null), true);
  assert.equal(sameSelection(last, { kind: 'pig', i: 2 }), false); assert.deepEqual(last, { kind: 'pig', i: 2 });
  assert.equal(sameSelection(last, { kind: 'pig', i: 2 }), true);
  assert.equal(sameSelection(last, { kind: 'dog' }), false); assert.deepEqual(last, { kind: 'dog', i: -1 });
  assert.equal(sameSelection(last, null), false); assert.deepEqual(last, { kind: null, i: -1 });
});
```

  - Run `$UNIT node --test --test-concurrency=4 test/hud.test.mjs`. Expect FAIL: `sameSelection is not a function`.
  - Run e2e. Expect FAIL: `farm.exit` is 42 px.
  - `hud.test.mjs` imports `hud.js`, which imports three. If three fails to load in Node, move `sameSelection` to `src/view/selection.js` and import it from both.

- [ ] **Step 2: Implement.**
  - In `template.html`, change the `#exit` rule to `#exit{all:unset;box-sizing:border-box;min-height:44px;display:inline-flex;align-items:center;cursor:pointer;padding:10px 18px;border-radius:18px;font-weight:800;font-size:15px;color:var(--ink)}`.
  - In `hud.js`, add:

```js
// in place, no allocation per frame: the HUD's last selection { kind, i } against the farm's (2e carry-over)
export function sameSelection(last, sel) {
  const kind = sel ? sel.kind : null, i = sel && sel.i !== undefined ? sel.i : -1;
  if (last.kind === kind && last.i === i) return true;
  last.kind = kind; last.i = i; return false;
}
```

  - In `createHud`, replace `let selKey = null` with `const last = { kind: null, i: -1 };`.
  - In `update`, replace the two lines from `const sim = s.sim, sel = s.selected, key = …` through `else if (sel && frame % 6 === 0) renderCard(sim, sel);` with:

```js
      const sim = s.sim, sel = s.selected;
      if (!sameSelection(last, sel)) { card.hidden = !sel; if (sel) renderCard(sim, sel); else world.select(null); }
      else if (sel && frame % 6 === 0) renderCard(sim, sel);
```

- [ ] **Step 3: Run.** Unit: PASS. e2e: PASS. Prove the hose assert can fail: in `devices.js`, temporarily return `null` for `hose` moves, and expect FAIL. Restore it.
- [ ] **Step 4: Commit:** `git commit -am "fix(pig-pens): Get out is 44 px tall, a hose drag is asserted, the HUD compares selections in place"` (and `git add test/hud.test.mjs`)

---

## Task 22: Frame rate, size and the shading tier (R1, R3)

**Files:**
- Create: `src/view/fps.js`
- Modify: `src/game.view.js`, `docs/phase-3k-notes.md`; maybe `src/main.js` (the shipped `shading` default)

**Interfaces:**
- Consumes:
  - `programCount(renderer)`, `view.rawDt` and `engine.world.stats.stepMs` (#106);
  - Task 11's baseline;
  - `test/perf.browser.mjs`.
- Produces: the `?fps` readout and the R1 and R3 records.

**The gate, written before measuring (overview §8):**
- **SwiftShader.** At `?tilt=0`, per state (day, night): programs ≤ baseline + 2, and draw calls ≤ baseline.
- **Size.** Total gzip of `lion-hawk build`'s report (html plus `assets/models/*`) ≤ baseline gzip × 1.10.
- **Load.** `settledMs` ≤ baseline × 1.20.
- **iPad (the user, R1).** Median frame time from today's release against the branch build, same scene, `?fps`. If the branch regresses more than 10%, keep `shading: 'lambert'`. Ship `physical` only when it is within 10%. Without iPad numbers, `lambert` ships.

- [ ] **Step 1: `src/view/fps.js`:**

```js
// ?fps (phase 3k R1): a corner readout of the median frame time over the last 120 drawn frames and Rapier's step time
// (#106, world.stats.stepMs through boot's timer). View only; one Float32Array, no allocation per frame.
export function createFps(doc) {
  const el = doc.createElement('div'); el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;font:12px ui-monospace,monospace;background:#0008;color:#fff;padding:4px 6px;border-radius:6px;pointer-events:none';
  doc.body.appendChild(el);
  const ring = new Float32Array(120), tmp = new Float32Array(120); let n = 0, k = 0;
  return {
    frame(rawDt, world) {
      if (rawDt > 0) { ring[k] = rawDt * 1000; k = (k + 1) % 120; n = Math.min(120, n + 1); }
      if ((k & 15) !== 0 || n < 16) return;
      tmp.set(ring); const s = tmp.subarray(0, n).sort(), med = s[n >> 1];
      el.textContent = `${med.toFixed(1)} ms · ${(1000 / med).toFixed(0)} fps · physics ${(world?.stats?.stepMs ?? 0).toFixed(2)} ms`;
    },
    dispose() { el.remove(); },
  };
}
```

  In `game.view.js`: `enter` creates it when `new URLSearchParams(view.doc.defaultView.location.search).has('fps')`; `frame` calls `fps?.frame(view.rawDt, engine.world)`; `exit` disposes it.

- [ ] **Step 2: Measure the branch.** Run `$BROWSER node test/perf.browser.mjs` (lambert) and `$BROWSER node test/perf.browser.mjs shading=physical`. Fill the notes' R1 table (baseline / lambert / physical × day / night: calls, programs, frameMs).
- [ ] **Step 3: Apply the gate.**
  - Programs or draw calls over the gate in **lambert** is a regression of this plan. Find the extra programs (e.g. instanced and plain variants of a material used once) and fix them, or record the measured cause as a field-note candidate and stop for the controller.
- [ ] **Step 4: Size.** Use Task 20's size report gzip total against Task 11's, and `settledMs` against the baseline. Record both. Over budget: record and report (R3); do not change formats on your own.
- [ ] **Step 5: Hand the user the iPad check** (needs the user):
  1. Today's release: `https://four43.com/exp/piggie-game/?fps`. Same scene: default camera, day, 30 s after load.
  2. The branch build `$SCRATCH/pig-pens` (any static server, `?fps`), then `?fps&shading=physical`.
  3. Read off the median ms of each.
  
  Until they answer, `lambert` stays the default and the notes say "iPad pending".
- [ ] **Step 6: Run** unit and e2e. **Commit:** `git commit -am "feat(pig-pens): ?fps readout; R1/R3 measurements recorded"` (and `git add src/view/fps.js`)

---

## Task 23: Version 2.2.0 and the notes

**Files:**
- Modify: `package.json` (`"version": "2.2.0"`), `docs/phase-3k-notes.md`

- [ ] **Step 1: Bump.** `"version": "2.2.0"`. The service-worker cache name is stamped from it by `lion-hawk build` (B-5).
- [ ] **Step 2: Notes** (below) completed: decisions, playtest list, unused dependencies, contract issues as resolved, and field-note candidates.
- [ ] **Step 3: Final run.**
  - Unit: `$UNIT node --test --test-concurrency=4 test/*.test.mjs`.
  - The workspace: `$UNIT npm test --prefix ..` (from `$G`, it runs `games/` tests and every workspace, each with `--test-concurrency=4`).
  - Then e2e, then offline (browser lock), then `$UNIT npx lion-hawk bake --game . --check` and `$UNIT npx lion-hawk build --game . --out $SCRATCH/pig-pens`.
- [ ] **Step 4: Commit:** `git commit -am "chore(pig-pens): 2.2.0 on lion-hawk phase 3"`

---

## Done when

- **Unit suite.** `npm test` in `games/pig-pens` passes. The test files are:
  - `bake`, `vendor`, `materials`, `assets-parity`, `models`;
  - `world`, `migration`, `checks`, `feel`;
  - `golden`, `golden-farm`, `flow`, `flow-orbit`, `pick`, `sim`, `invariants`, `purity`, `hud`.
  
  `split.test.mjs` existed from Task 5 to Task 9 only.
- **Browser suites.** `test/e2e.browser.mjs` (today's 6 tests, with the added assertions) and `test/offline.browser.mjs` (1) pass on engine 0.9.x. `npm test` in `games/` passes.
- **Goldens.** `farm-seed3` and `farm-scene` were re-blessed exactly once (Task 10), with the §5.5 record in the notes. Every later task left them unchanged.
- **The guard.** `migration.test.mjs` passes: no `new …World`, `ColliderDesc.`, literal friction, density or restitution, combine rules, or `assets.json` anywhere in `src`. Every `massProps` and raw query is marked `lh-allow`. Listed in the notes: one `massProps` (the tractor) and two raw queries (the pig feelers, the vehicle in Task 9 until the kit).
- **The CLI.** `lion-hawk bake --check` exits 0, and `lion-hawk build --out $SCRATCH/pig-pens` builds. The R1 SwiftShader rows and the R3 size and load rows are recorded; the iPad row is recorded or marked pending for the user.
- **Version.** Pig Pens is 2.2.0. Merge point: the integrator merges `feat/lion-hawk-3-pigpens` into `feat/lion-hawk-3` (overview §6). No push, deploy or `site/` change.

---

## Notes

Notes file: `docs/plans/2026-10-13-phase-3k-pigpens-notes.md` in the engine repo. The implementer drafts it in the worktree as `games/pig-pens/docs/phase-3k-notes.md`, and the integrator copies it into the engine repo. Sections:

- **Decisions:** each "Decision" above, with what it costs.
- **Feel baseline:** Task 7's table, with its commit.
- **Re-bless 1 (World):** Task 10's record.
- **R1 / R3:** Tasks 11 and 22's tables.
- **Visible changes / playtest list:**
  - restitution between animals halved (0.15 → 0.075), and thrown-pig friction on fences 0.45 → 0.37;
  - the tractor at 1400 kg (was effectively 1438.5);
  - corn draws all four cobs;
  - the chicken face trimmed by the vertex mask (no fade);
  - dog and fox on mixers;
  - pigs interpolated between steps;
  - audio unlocks on Escape too;
  - Get out at 44 px;
  - the shading tier and DPR as shipped.
- **Unused dependencies left in `package.json`:** `esbuild` (still used by nothing after Task 20), `pngjs`. The integrator may prune them with the lock.
- **Field note candidates** (the integrator numbers them from #110):
  - instanced `COVERAGE` (C7);
  - a fur trim box (C8);
  - an orbit rig with pose access (C9);
  - a post-pass seam in boot (C5);
  - per-model bake files (C1);
  - anim-table layout (C2);
  - herd feel metrics are chaotic at ±1 (Task 10);
  - the `checks.*` return shapes found in Task 8.

---

## Contract issues

Each is the smallest decision that lets 3k proceed; the controller reconciles them.

- **C1 (§4.3 bake input).**
  - The issue: "model id = file basename" in one flat `src` cannot vendor Pig Pens. Four Kenney kits each reference their own different `Textures/colormap.png`, and the game's ids (`fence`, `cob`, …) are not the file names.
  - Decision: `bake.models.<id>.file` names the source relative to `bake.src` (subfolders allowed); without `file`, the id is the basename as specified.
- **C2 (§4.3 anim.json).** The 12 floats per part are unspecified. Pig Pens' parity test assumes the column-major mat4 without its last row: elements 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, in model space, like `bake.mjs`'s tables.
- **C3 (§4.4 inline colliders).** The `spawn` example writes `{ shape: 'ball' }`, but §4.3 says inline entries use exactly the sidecar shape (`sphere`, `r`). Pig Pens uses `sphere`.
- **C4 (§4.10 vehicle kit).**
  - Pig Pens orders `farm.think` before the kit's update by name and assumes `lh.vehicle.update`.
  - It also assumes the kit's rays exclude the chassis's own colliders, and that wheels use Rapier's default axes: suspension (0, −1, 0) and axle (0, 0, 1).
- **C5 (§4.6 boot render).** There is no seam for a post pass. Pig Pens replaces `view.gfx.render` with its tilt-shift and restores it on exit, which assumes boot calls `view.gfx.render()` through the property each frame.
- **C6 (§4.6/§4.7 manifest).** It is not said how the game's `baked/manifest.json` reaches the `createAssets` that boot makes. Pig Pens passes `defineView({ assets: { manifest, base: './assets/' } })`.
- **C7 (§4.8 COVERAGE).** `mc.coverage` is per entity (a material clone), which cannot serve an instanced crowd. Pig Pens' pig mud stays a game material until coverage takes a per-instance attribute (e.g. `instanceCoverage`, vec4).
- **C8 (§4.8 FUR).**
  - The group-to-material mapping of `furGeometry` is unspecified. Pig Pens assumes group 0 is drawn with a plain material and group 1 with the `FUR` material (`[mc.get('pet'), mc.get('plumage')]`).
  - `look.fur` has no trim region, so Pig Pens trims the chicken face through the mask.
- **C9 (§4.9 createOrbitRig).** The rig exposes no pose (yaw, pitch, distance, target), clamps or drive chase. Pig Pens keeps its pose math and adopts `bindGesture` and `makeProject` only.

## Integrator requests

1. **Refresh `games/package-lock.json`** after Pig Pens' `package.json` changes: the scripts in Task 3 and version 2.2.0 in Task 23. Later, prune the unused `esbuild` and `pngjs` from Pig Pens.
2. **The workspace rule.** `games/test/workspace.test.mjs`'s "engine source does not import three or Rapier yet" contradicts D9 once 3e lands (engine view modules import three). It belongs to the integrator (`games/test/**`).
3. **The shared lock.** Pig Pens' browser runs need the shared lock file `/tmp/claude-1000/lion-hawk-browser.lock`, and `TMPDIR=$SCRATCH` for `servePigPens`' build dir, so no build lands outside the scratchpad.
4. **Notes.** Copy `games/pig-pens/docs/phase-3k-notes.md` to `docs/plans/2026-10-13-phase-3k-pigpens-notes.md`, and number its field-note candidates.
