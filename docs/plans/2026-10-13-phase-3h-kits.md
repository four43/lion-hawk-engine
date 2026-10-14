# Phase 3h: kits (terrain, vehicle, coverage, fx) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four kits the three games need now, as optional imports (L-5):
- `lion-hawk/kits/terrain`: a heightfield World entity with `heightAt`, `normalAt`, `materialAt` (M-10) and `blendAt`, all agreeing with Rapier's own triangles;
- `lion-hawk/kits/terrain/view`: chunked terrain meshes with distance LODs and skirts;
- `lion-hawk/kits/vehicle`: Rapier's ray-cast vehicle controller on a World entity, updated before `lh.physics.step`, with the ground material under each wheel and opt-in pair-table grip (D4);
- `lion-hawk/kits/coverage` and `/view`: dirt, mud and snow levels per entity, fed to the compiler's `uCoverage`;
- `lion-hawk/kits/fx/view`: pooled particles (cubes, quads, gibs) and ground marks.

**Architecture:** Each kit has a sim half (`src/kits/<kit>/sim.js`, three-free and Rapier-import-free: it uses `world.R`/`world.rapier`) and, where it draws, a view half (`view.js`, imports three). Sim halves register engine systems through the 3c World (`world.engine`, `world.own`), never through a module singleton per page. All per-step and per-frame work runs on preallocated typed arrays and reused objects.

**Tech Stack:** Node ≥ 22 `node:test`; `@dimforge/rapier3d-compat` 0.21.0 (injected; tests import it as the game would); `three` 0.186 (view halves and their tests only).

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md` (binding: §4.4 World, §4.5 physics wrapper, §4.8 compiler, §4.9 view sync, §4.10 kits; deltas D3, D4, D9). Requirement IDs: M-10, L-5, U-6, R-8, T-10, T-12, T-13, design §7.3.

**Base:** engine branch `phase-3-kits`, cut from `phase-3` after Wave A merges (0.8.0: 3b materials, 3c World, 3d bake). Worktree `/home/smiller/projects/four43/lion-hawk-engine-3h`. Merges at Wave B (0.9.0). 3f's compiler and 3g's view sync are not needed at build time: the view tests use small fakes with the §4.8/§4.9 signatures.

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

**Plan constraints (3h):**
- 12. Files: only `src/kits/**`, `test/kits/**` and this plan's notes file `docs/plans/2026-10-13-phase-3h-kits-notes.md`. Kits are imported in tests by relative path (`../../src/kits/<kit>/sim.js`); the `lion-hawk/kits/*` export map is an integrator request.
- 13. Sim halves read Rapier only through `world.R` and `world.rapier`. They never import `../view.js` or `@dimforge/*` (Task 3 enforces it).
- 14. No game feel lives in a kit. Forces, grip curves, drift help, the jackknife limit, effect presets and colours stay game-side. Kits own wiring, lookups, pools and lifecycle.
- 15. Opt-ins default to today's behaviour. `grip` defaults to `false` and unset wheel controls keep Rapier's defaults. A game that ports its vehicle onto the kit can then stay bit-exact (§5.5).
- 16. The unit test command, run from the worktree (`$WT` = `/home/smiller/projects/four43/lion-hawk-engine-3h`):

```
systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
  --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3h \
  -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>
```

  Below it is written `UNIT <files>`. No browser suite is needed.

---

## Review Focus

The five input or failure modes most likely to bite, each pinned by a test:

1. **Terrain sampling disagrees with Rapier.** Possible causes: row-major versus Rapier's column-major layout, the wrong cell diagonal, or float64 heights where Rapier holds float32. Cars would then float or sink and `materialAt` would be read at the wrong place. Pinned by the Task 1 diagonal unit test, and by the Task 2 ray-cast agreement tests with a mutation proof.
2. **A wheel's ground material read from the wrong place.** Possible causes: the body centre instead of the contact point, the heightfield's single collider material instead of `materialAt`, or a stale value in the air. Pinned by Task 5's split-material terrain (left wheels on grass, right wheels on gravel, centre on grass) and its static-collider and airborne cases.
3. **Rapier 0.21 vehicle quirks.**
   - `setIndexForwardAxis` is a property setter with a method's name.
   - The axle sign decides which way the engine drives.
   - A ray group with no membership hits nothing, so `rayGroups.member: []` must mean "every group". This is the **ray filter only**: colliders follow 3c, where an omitted `member`/`filter` means every group and an explicit `member: []` means none (3c ruling). The kit never passes `member: []` to `world.groups.mask`.

   Pinned by Task 4's forward-axis tests (with `indexForwardAxis`, `currentVehicleSpeed()` and steer-sign checks) and its ray-group test.
4. **Vehicle lifecycle.** Possible causes: a despawn, `world.clear()` or a scene change leaving a controller in the update list, which then steps a freed Rapier object, or a second system registration throwing. Pinned by Task 6, and by Task 4's one-system test.
5. **Coverage accrual errors.** Possible causes:
   - a `place()` teleport counted as distance driven;
   - washing below 0 or gains above 1;
   - a layer the entity does not carry being created;
   - the entity's own material ignored.

   Pinned by Task 7.

Also checked across all sim kits: determinism, replay and retained allocation (Task 8).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/kits/terrain/sim.js` (new) | `createTerrain(world, opts)`: validation, the heightfield entity via `world.heightfield`, `heightAt`, `normalAt`, `materialAt`, `blendAt`, `grid` |
| `src/kits/terrain/view.js` (new) | `createTerrainMesh(terrain, opts)` → `{ group, update(camera), dispose(), stats }`; `chunkIndex(n, m)` |
| `src/kits/vehicle/sim.js` (new) | `createVehicle(world, e, opts)` → car; `VEHICLE_SYSTEM`; one engine system per engine; ground materials; free on despawn |
| `src/kits/coverage/sim.js` (new) | `coverageKit(host, opts)` → `{ off }`; `coverageLayer`; `COVERAGE_SYSTEM` |
| `src/kits/coverage/view.js` (new) | `coverageView(sync, compiler, opts)` → `{ off(), size }` |
| `src/kits/fx/view.js` (new) | `createParticles(opts)`, `createMarks(opts)` |
| `test/kits/fixtures/kitGame.js` (new) | physics fixture game factory, `MATERIALS`, `GROUPS`, `flatTerrain` |
| `test/kits/fixtures/car.js` (new) | `carWheels`, `spawnCar`, `SUSPENSION`, `CART` sidecar, `physFor` |
| `test/kits/fixtures/carGame.js` (new) | a whole game on the three sim kits (determinism, replay, zeroAlloc) |
| `test/kits/terrain.test.mjs` (new) | terrain sampling, validation, `material`/`groups`/`fixInternalEdges` pass-through |
| `test/kits/terrain-rapier.test.mjs` (new) | terrain against Rapier ray casts and groups |
| `test/kits/purity.test.mjs` (new) | kit sim purity; view halves free of `Math.random` and `instanceof THREE.` |
| `test/kits/vehicle.test.mjs` (new) | vehicle wiring, axes and steer sign, controls, sockets, errors, system, ray groups |
| `test/kits/vehicle-material.test.mjs` (new) | wheel ground materials, pairs, grip |
| `test/kits/vehicle-lifecycle.test.mjs` (new) | despawn, clear, scene change, update order |
| `test/kits/vehicle-parts.test.mjs` (new) | named wheels' part poses (`partXf`) for view sync |
| `test/kits/coverage.test.mjs` (new) | coverage accrual, wash, acceptance, hosts |
| `test/kits/kits-sim.test.mjs` (new) | drive sanity, `checks.determinism`, replay, `checks.zeroAlloc` |
| `test/kits/terrain-view.test.mjs` (new) | chunk geometry, faces, seams, LOD hysteresis, budget and drain, eviction, attributes, Rally's settings, dispose |
| `test/kits/fx-particles.test.mjs` (new) | particle integration, per-emit gravity and drag, ring, expiry, floor and bounce, quads, uploads |
| `test/kits/fx-marks.test.mjs` (new) | mark orientation, alpha and height, ring and uploads |
| `test/kits/coverage-view.test.mjs` (new) | `uCoverage` clones per entity, frame writes, remove, off |
| `docs/plans/2026-10-13-phase-3h-kits-notes.md` (new) | progress, decisions, contract issues, field note candidates |

Must not touch: everything else, in particular `src/sim/**`, `src/view/**` (3e/3f/3g), `testing/**`, `src/index.*.js` and `package.json`.

---

## Task 1: Terrain sim half (sampling, materials, validation)

**Files:**
- Create: `test/kits/fixtures/kitGame.js`, `test/kits/terrain.test.mjs`, `src/kits/terrain/sim.js`, `docs/plans/2026-10-13-phase-3h-kits-notes.md`

**Interfaces:**
- Consumes (3c, §4.4):
  - `world.heightfield({ nx, nz, cell, x0, z0, heights, material, groups, fixInternalEdges }) → e`;
  - `world.materials` (3b §4.2: `ids`, `index(id)`, `has(id)`);
  - `world.groups`, `world.materialOf(handle)`, `world.stats`;
  - `headless(game).world`;
  - `defineMaterials`, `defineGame` from `src/index.sim.js`.
- Produces: `createTerrain(world, { nx, nz, cell, x0 = 0, z0 = 0, heights, materials, blend?, material?, groups?, fixInternalEdges = false })` → frozen `{ entity, grid: { nx, nz, cell, x0, z0, heights: Float32Array, materials: Uint8Array | null }, heightAt(x, z), normalAt(x, z, out) → out, materialAt(x, z) → id, blendAt(x, z, out) → out }`.
  - `material` is the heightfield collider's material (3j #4: Rally passes `material: 'rally-ground'`); `fixInternalEdges` and `groups` go to `world.heightfield` unchanged (CI-11: Tractor passes `fixInternalEdges: true`; 3c forwards it to `heightfieldDesc`). An omitted `groups` is `{ member: ['ground'] }` with the filter omitted, which 3c reads as every group.

- [ ] **Step 1: Create the notes stub**

Create `docs/plans/2026-10-13-phase-3h-kits-notes.md`:

```markdown
# Phase 3h kits: notes

Plan: `docs/plans/2026-10-13-phase-3h-kits.md`. Branch `phase-3-kits`, worktree `lion-hawk-engine-3h`.

## Progress

| Task | Commit | Tests |
|---|---|---|

## Decisions

- materials grid is one registry index per height sample (nx·nz), looked up by nearest sample.
- grip defaults to false; pair friction scales slip/side only when a game opts in.
- rayGroups.member [] means every group (a ray with no membership hits nothing in Rapier). Ray filter only:
  colliders follow 3c (omitted member/filter = every group; explicit member [] = none).
- Coverage accrues dirtRate × metres from the pool's prev → curr pose (place() counts nothing).
- VEHICLE_SYSTEM is 'lh.kit.vehicle' (3k/3l match it via the exported constant); forward 'x' = axle +z, forward 'z' = axle -x.

## Contract issues

(see the plan's "Contract issues"; record here how each was resolved at merge)

## Integrator requests

(see the plan's "Integrator requests")

## Field note candidates

- Rapier 0.21's vehicle controller sets its forward axis through a property setter named `setIndexForwardAxis`;
  with forward x the axle must be +z, with forward z it must be -x, or engine force drives backwards.
- Rapier's vehicle controller already excludes its own chassis from wheel rays; Tractor's and Pig Pens'
  own-collider predicates were redundant.
- Tractor's DIRT rates are per second at full speed (`rate × speedFrac × dt`); spec dirtRate is per metre.
  Ruling (3h/3l): Tractor moves to per-metre dirtRate; 3l picks rates equal to today's at normal speed, pins
  them with a test and lists the feel as a playtest item.
- createParticles.emit takes (…, life, size, …) per the contract; Tractor's fx.emit took (…, size, life, …).
```

- [ ] **Step 2: Write the fixture game**

Create `test/kits/fixtures/kitGame.js`:

```js
// Kit suite fixtures: a one-scene physics game around the World, a shared material registry and flat terrains.
// The scene keeps a `movers` list: each step moves those (bodiless) entities +x by their own `v` metres.
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, defineMaterials } from '../../../src/index.sim.js';
import { createTerrain } from '../../../src/kits/terrain/sim.js';

await RAPIER.init();
export { RAPIER };

export const MATERIALS = defineMaterials({
  route: { extends: 'gravel', dirtRate: 0.01 },
  bog: { extends: 'mud', dirtRate: 0.2 },
  coat: { extends: 'steel', coverage: { dirt: 0.5 } },
}, { pairs: { 'rubber|ice': { friction: 0.1 } } });

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];

export function kitGame({ enter, step, setup, models, state, groups = GROUPS, hz = 60 } = {}) {
  const play = {
    enter(e, ctx) { ctx.state.movers = []; enter?.(e, ctx); },
    step(e, dt, ctx) { for (const m of ctx.state.movers) m.xf.p.x += m.v; step?.(e, dt, ctx); },
  };
  return defineGame({
    id: 'kit-test', sim: { hz, maxCatchUp: 3 },
    ...(setup ? { setup } : {}),
    defs: models ? { materials: MATERIALS, models } : { materials: MATERIALS },
    physics: { rapier: RAPIER, gravity: [0, -9.81, 0], groups },
    start: 'play', scenes: { play, other: {} },
    ...(state ? { state } : {}),
  });
}

// A flat n×n terrain from x0 = z0 = -n: with cell 2 every sample sits on an odd coordinate, so x = 0 and z = 0 fall
// midway between samples. at(x, z) names each sample's material.
export function flatTerrain(world, { n = 41, cell = 2, h = 0, at = () => 'gravel' } = {}) {
  const x0 = -n, z0 = -n, heights = new Float32Array(n * n).fill(h), mats = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) mats[iz * n + ix] = world.materials.index(at(x0 + ix * cell, z0 + iz * cell));
  return createTerrain(world, { nx: n, nz: n, cell, x0, z0, heights, materials: mats });
}
```

- [ ] **Step 3: Write the failing tests**

Create `test/kits/terrain.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame } from './fixtures/kitGame.js';
import { createTerrain } from '../../src/kits/terrain/sim.js';

const world = () => headless(kitGame()).world;
const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const ids = (w, list) => Uint8Array.from(list.map(id => w.materials.index(id)));
// 3 × 2 samples, cell 2, from (10, -4): a plane rising 0.5 per m along x and 1.5 per m along z
const plane = (w, extra = {}) => createTerrain(w, { nx: 3, nz: 2, cell: 2, x0: 10, z0: -4, heights: [0, 1, 2, 3, 4, 5],
  materials: ids(w, ['grass', 'gravel', 'grass', 'snow', 'grass', 'asphalt']), ...extra });

test('heightAt interpolates the samples and clamps outside the grid', () => {
  const t = plane(world());
  assert.equal(t.heightAt(10, -4), 0); near(t.heightAt(12, -4), 1, 1e-12); near(t.heightAt(10, -2), 3, 1e-12); near(t.heightAt(14, -2), 5, 1e-12);
  near(t.heightAt(11, -3), 2, 1e-12); near(t.heightAt(13.5, -2.5), 4, 1e-12);
  assert.equal(t.heightAt(-100, -100), 0); near(t.heightAt(100, 100), 5, 1e-12);
});

test("heightAt splits each cell along Rapier's (ix+1, iz)–(ix, iz+1) diagonal", () => {
  const w = world(), t = createTerrain(w, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 1], materials: ids(w, Array(4).fill('grass')) });
  assert.equal(t.heightAt(0.25, 0.25), 0); near(t.heightAt(0.75, 0.75), 0.5, 1e-12); near(t.heightAt(0.5, 0.5), 0, 1e-12);
  // the (ix, iz)–(ix+1, iz+1) diagonal would give 0.25, 0.75 and 0.5
});

test('normalAt is the triangle normal and fills the out object', () => {
  const t = plane(world()), out = { x: 9, y: 9, z: 9 }, l = Math.sqrt(0.25 + 1 + 2.25);
  assert.equal(t.normalAt(11, -3.5, out), out);
  near(out.x, -0.5 / l, 1e-12); near(out.y, 1 / l, 1e-12); near(out.z, -1.5 / l, 1e-12);
  t.normalAt(13.5, -2.5, out);
  near(out.x, -0.5 / l, 1e-12); near(out.y, 1 / l, 1e-12); near(out.z, -1.5 / l, 1e-12);
  const w = world(), d = createTerrain(w, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 1], materials: ids(w, Array(4).fill('grass')) });
  d.normalAt(0.25, 0.25, out); near(out.y, 1, 1e-12);
  d.normalAt(0.75, 0.75, out); near(out.x, -1 / Math.sqrt(3), 1e-12); near(out.z, -1 / Math.sqrt(3), 1e-12);
});

test('materialAt picks the nearest sample and clamps outside the grid (M-10)', () => {
  const t = plane(world());
  assert.equal(t.materialAt(10.9, -4), 'grass'); assert.equal(t.materialAt(11.1, -4), 'gravel');
  assert.equal(t.materialAt(12, -3.1), 'gravel'); assert.equal(t.materialAt(12, -2.9), 'grass');
  assert.equal(t.materialAt(10, -2), 'snow'); assert.equal(t.materialAt(14, -2), 'asphalt');
  assert.equal(t.materialAt(100, 100), 'asphalt'); assert.equal(t.materialAt(-100, -100), 'grass');
});

test('materials may be a function; the collider material defaults to the most common sample', () => {
  const w = world(), t = plane(w);
  assert.equal(t.entity.colliders[0].material, 'grass');
  assert.equal(w.materialOf(t.entity.colliders[0].collider.handle), 'grass');
  const f = createTerrain(world(), { nx: 3, nz: 2, cell: 2, heights: [0, 0, 0, 0, 0, 0], materials: x => (x < 2 ? 'mud' : 'snow') });
  assert.equal(f.materialAt(1, 0), 'mud'); assert.equal(f.materialAt(3, 0), 'snow');
  assert.equal(f.entity.colliders[0].material, 'snow'); // the function sampled at the centre (2, 1)
  assert.equal(plane(world(), { material: 'ice' }).entity.colliders[0].material, 'ice');
});

test('blendAt: without blend one material at w 0; a blend function fills the out object', () => {
  const t = plane(world()), out = {};
  assert.equal(t.blendAt(11.1, -4, out), out); assert.deepEqual(out, { a: 'gravel', b: 'gravel', w: 0 });
  const b = plane(world(), { blend: (x, z, o) => { o.a = 'grass'; o.b = 'mud'; o.w = 0.25; return o; } });
  assert.equal(b.blendAt(0, 0, out), out); assert.deepEqual(out, { a: 'grass', b: 'mud', w: 0.25 });
});

test('grid holds float32 copies of the heights for the view half', () => {
  const src = [0.1, 1, 2, 3, 4, 5], w = world(), t = plane(w, { heights: src });
  assert.ok(Object.isFrozen(t) && Object.isFrozen(t.grid));
  assert.equal(t.grid.heights.constructor.name, 'Float32Array');
  assert.deepEqual([t.grid.nx, t.grid.nz, t.grid.cell, t.grid.x0, t.grid.z0], [3, 2, 2, 10, -4]);
  src[0] = 99; assert.equal(t.heightAt(10, -4), Math.fround(0.1)); // copied, and float32 like Rapier's
  assert.equal(t.grid.materials[1], w.materials.index('gravel'));
});

test('material, groups and fixInternalEdges reach world.heightfield unchanged (3j #4, CI-11)', () => {
  const w = world(), descs = [], spy = { materials: w.materials, groups: w.groups, heightfield: d => (descs.push(d), { colliders: [] }) };
  plane(spy, { material: 'ice', fixInternalEdges: true, groups: { member: ['static'] } }); // Rally: material 'rally-ground'
  plane(spy);
  assert.equal(descs[0].material, 'ice'); assert.equal(descs[0].fixInternalEdges, true); assert.deepEqual(descs[0].groups, { member: ['static'] });
  assert.equal(descs[1].fixInternalEdges, false);
  assert.deepEqual(descs[1].groups, { member: ['ground'] }); // filter omitted: every group (3c)
});

test('createTerrain names what is wrong and spawns nothing when it refuses', () => {
  const w = world(), g = ids(w, Array(6).fill('grass')), base = { nx: 3, nz: 2, cell: 2, heights: [0, 0, 0, 0, 0, 0], materials: g };
  assert.throws(() => createTerrain(w, { ...base, nx: 1 }), /terrain: nx and nz must be integers >= 2 \(got 1, 2\)/);
  assert.throws(() => createTerrain(w, { ...base, cell: 0 }), /terrain: cell must be a positive number \(got 0\)/);
  assert.throws(() => createTerrain(w, { ...base, heights: [0, 0, 0, 0, 0] }), /terrain: heights must have nx\*nz = 6 entries \(got 5\)/);
  assert.throws(() => createTerrain(w, { ...base, heights: [0, 0, NaN, 0, 0, 0] }), /terrain: heights\[2\] is NaN/);
  assert.throws(() => createTerrain(w, { ...base, materials: Uint8Array.of(...g.slice(0, 5), 250) }), /terrain: materials\[5\] = 250 is not a registry index/);
  assert.throws(() => createTerrain(w, { ...base, materials: g.slice(0, 4) }), /terrain: materials must have nx\*nz = 6 entries, one per height sample \(got 4\)/);
  assert.throws(() => createTerrain(w, { ...base, materials: ['grass'] }), /terrain: materials must be a Uint8Array of registry indices or a function/);
  assert.throws(() => createTerrain(w, { ...base, material: 'cheese' }), /terrain: unknown collider material 'cheese'/);
  assert.throws(() => createTerrain(w, { ...base, blend: 3 }), /terrain: blend must be a function/);
  assert.equal(w.stats.entities, 0);
});
```

- [ ] **Step 4: Run, expect FAIL**

`UNIT test/kits/terrain.test.mjs`. Expected: every test fails at import with `Cannot find module '…/src/kits/terrain/sim.js'`.

- [ ] **Step 5: Implement**

Create `src/kits/terrain/sim.js`:

```js
// kit-terrain (sim half, M-10): a heightfield World entity plus height, normal and material sampling that agree with
// Rapier's own triangles. Heights are row-major, heights[iz * nx + ix] at (x0 + ix * cell, z0 + iz * cell); the World's
// heightfield reorders them for Rapier (column-major). Rapier 0.21 splits each cell along the (ix+1, iz)–(ix, iz+1)
// diagonal, and heightAt/normalAt use the same split on the same float32 heights.
// Sim-pure (L-3): no three, no Rapier import (the World makes the collider), no clocks.

const fail = m => { throw new Error(`terrain: ${m}`); };

export function createTerrain(world, opts = {}) {
  const { nx, nz, cell, x0 = 0, z0 = 0, heights, materials, blend = null, material, groups, fixInternalEdges = false } = opts;
  if (!Number.isInteger(nx) || nx < 2 || !Number.isInteger(nz) || nz < 2) fail(`nx and nz must be integers >= 2 (got ${nx}, ${nz})`);
  if (!(cell > 0) || !Number.isFinite(cell)) fail(`cell must be a positive number (got ${cell})`);
  if (!Number.isFinite(x0) || !Number.isFinite(z0)) fail(`x0 and z0 must be finite (got ${x0}, ${z0})`);
  if (!heights || heights.length !== nx * nz) fail(`heights must have nx*nz = ${nx * nz} entries (got ${heights?.length})`);
  if (blend !== null && typeof blend !== 'function') fail('blend must be a function (x, z, out) => out');
  const H = Float32Array.from(heights); // the float32 values Rapier holds, so heightAt agrees with its ray casts
  for (let i = 0; i < H.length; i++) if (!Number.isFinite(H[i])) fail(`heights[${i}] is ${heights[i]}`);
  const reg = world.materials, ID = [];
  for (const id of reg.ids) ID[reg.index(id)] = id;
  let grid = null, fn = null;
  if (typeof materials === 'function') fn = materials;
  else if (materials instanceof Uint8Array) {
    if (materials.length !== nx * nz) fail(`materials must have nx*nz = ${nx * nz} entries, one per height sample (got ${materials.length})`);
    for (let i = 0; i < materials.length; i++) if (ID[materials[i]] === undefined) fail(`materials[${i}] = ${materials[i]} is not a registry index`);
    grid = Uint8Array.from(materials);
  } else fail('materials must be a Uint8Array of registry indices or a function (x, z) => id');
  const sx = (nx - 1) * cell, sz = (nz - 1) * cell;
  const colliderMaterial = material ?? (grid ? ID[mostCommon(grid)] : fn(x0 + sx / 2, z0 + sz / 2));
  if (!reg.has(colliderMaterial)) fail(`unknown collider material '${colliderMaterial}'`);
  const desc = { nx, nz, cell, x0, z0, heights: H, material: colliderMaterial, fixInternalEdges };
  const g = groups ?? (Object.hasOwn(world.groups, 'ground') ? { member: ['ground'] } : null);
  if (g) desc.groups = g;
  const entity = world.heightfield(desc);

  let ci = 0, cu = 0, cv = 0; // the last locate(): cell index iz * nx + ix and the in-cell coordinates
  const locate = (x, z) => {
    let fx = (x - x0) / cell, fz = (z - z0) / cell;
    fx = fx < 0 ? 0 : fx > nx - 1 ? nx - 1 : fx;
    fz = fz < 0 ? 0 : fz > nz - 1 ? nz - 1 : fz;
    let ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix > nx - 2) ix = nx - 2;
    if (iz > nz - 2) iz = nz - 2;
    cu = fx - ix; cv = fz - iz; ci = iz * nx + ix;
  };
  const nearest = (x, z) => {
    let ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell);
    ix = ix < 0 ? 0 : ix > nx - 1 ? nx - 1 : ix;
    iz = iz < 0 ? 0 : iz > nz - 1 ? nz - 1 : iz;
    return iz * nx + ix;
  };
  const terrain = {
    entity,
    grid: Object.freeze({ nx, nz, cell, x0, z0, heights: H, materials: grid }),
    heightAt(x, z) {
      locate(x, z);
      const a = H[ci], b = H[ci + 1], c = H[ci + nx], d = H[ci + nx + 1];
      return cu + cv < 1 ? a + (b - a) * cu + (c - a) * cv : d + (c - d) * (1 - cu) + (b - d) * (1 - cv);
    },
    normalAt(x, z, out) {
      locate(x, z);
      const a = H[ci], b = H[ci + 1], c = H[ci + nx], d = H[ci + nx + 1], low = cu + cv < 1;
      const gx = (low ? b - a : d - c) / cell, gz = (low ? c - a : d - b) / cell, l = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      out.x = -gx * l; out.y = l; out.z = -gz * l;
      return out;
    },
    materialAt: fn ?? ((x, z) => ID[grid[nearest(x, z)]]),
    blendAt(x, z, out) {
      if (blend) return blend(x, z, out);
      out.a = out.b = terrain.materialAt(x, z); out.w = 0;
      return out;
    },
  };
  return Object.freeze(terrain);
}

// The most common registry index in a grid (ties to the lowest index).
function mostCommon(grid) {
  const n = new Uint32Array(256);
  for (let i = 0; i < grid.length; i++) n[grid[i]]++;
  let best = 0;
  for (let k = 1; k < 256; k++) if (n[k] > n[best]) best = k;
  return best;
}
```

- [ ] **Step 6: Run, expect PASS**

`UNIT test/kits/terrain.test.mjs`. Expected: 9 pass.

- [ ] **Step 7: Commit**

```
git add src/kits/terrain/sim.js test/kits/fixtures/kitGame.js test/kits/terrain.test.mjs docs/plans/2026-10-13-phase-3h-kits-notes.md
git commit -m "feat(kits): terrain sim half with heightAt, normalAt, materialAt and blendAt (M-10)"
```

---

## Task 2: Terrain against Rapier (orientation, diagonal, groups)

**Files:**
- Create: `test/kits/terrain-rapier.test.mjs`

**Interfaces:**
- Consumes: `createTerrain` (Task 1); `world.rapier.castRay`, `castRayAndGetNormal`, `world.R.Ray` (L-1); `world.spawn`; `rng` from `src/core/rng.js`.
- Produces: nothing new. This task pins Review Focus 1.

- [ ] **Step 1: Write the tests**

Create `test/kits/terrain-rapier.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { rng } from '../../src/core/rng.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { createTerrain } from '../../src/kits/terrain/sim.js';

const nx = 17, nz = 13, cell = 1.5, x0 = -7, z0 = 3;
function bumpy() {
  const h = headless(kitGame()), w = h.world, r = rng(7);
  const heights = Array.from({ length: nx * nz }, () => 3 * r.next());
  const t = createTerrain(w, { nx, nz, cell, x0, z0, heights, materials: new Uint8Array(nx * nz).fill(w.materials.index('grass')) });
  h.step(1); // the broad phase sees new colliders after a step
  return { h, w, t, r };
}
const down = (w, x, z) => new w.R.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });

test('heightAt agrees with a Rapier ray cast on a bumpy field (row-major in, column-major inside Rapier)', () => {
  const { w, t, r } = bumpy();
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const x = x0 + 0.01 + r.next() * ((nx - 1) * cell - 0.02), z = z0 + 0.01 + r.next() * ((nz - 1) * cell - 0.02);
    const hit = w.rapier.castRay(down(w, x, z), 100, true);
    assert.ok(hit, `no hit at ${x}, ${z}`);
    worst = Math.max(worst, Math.abs(50 - hit.timeOfImpact - t.heightAt(x, z)));
  }
  assert.ok(worst < 1e-4, `worst height error ${worst}`);
});

test("normalAt agrees with Rapier's hit normal away from edges and the diagonal", () => {
  const { w, t, r } = bumpy(), n = { x: 0, y: 0, z: 0 };
  let worst = 0, used = 0;
  for (let k = 0; k < 400; k++) {
    const x = x0 + r.next() * (nx - 1) * cell, z = z0 + r.next() * (nz - 1) * cell;
    const u = ((x - x0) / cell) % 1, v = ((z - z0) / cell) % 1;
    if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98 || Math.abs(u + v - 1) < 0.02) continue;
    const hit = w.rapier.castRayAndGetNormal(down(w, x, z), 100, true);
    t.normalAt(x, z, n); used++;
    worst = Math.max(worst, Math.abs(hit.normal.x - n.x), Math.abs(hit.normal.y - n.y), Math.abs(hit.normal.z - n.z));
  }
  assert.ok(used > 300, `only ${used} samples`);
  assert.ok(worst < 1e-4, `worst normal error ${worst}`);
});

test("the terrain entity is in the 'ground' group: a ball filtered to ground lands on it, one filtered to static falls through", () => {
  const h = headless(kitGame()), w = h.world;
  const t = flatTerrain(w, { n: 21, cell: 1, h: 2 });
  const ball = (x, filter) => w.spawn({ body: { type: 'dynamic', linearDamping: 1 }, colliders: [{ shape: 'sphere', r: 0.5, material: 'steel' }],
    at: [x, 6, 0], groups: { member: ['prop'], filter } });
  const a = ball(-3, ['ground']), b = ball(3, ['static']);
  h.step(360);
  assert.ok(Math.abs(a.xf.p.y - (t.heightAt(-3, 0) + 0.5)) < 0.03, `a at ${a.xf.p.y}`);
  assert.ok(b.xf.p.y < 0, `b at ${b.xf.p.y}`);
});
```

- [ ] **Step 2: Run, expect PASS (Task 1 already implements it)**

`UNIT test/kits/terrain-rapier.test.mjs`. Expected: 3 pass. If the first test fails, the bug is in `heightfieldDesc` (3c) or in `locate`. Do not loosen the tolerance. Record it in the notes and stop (constraint 10).

- [ ] **Step 3: Prove it red by mutation**

In `src/kits/terrain/sim.js`'s `heightAt`, change `cu + cv < 1` to `cu > cv`. Run `UNIT test/kits/terrain-rapier.test.mjs`. Expected: FAIL `worst height error …` (well above 1e-4). Restore the line and run again. Expected: PASS.

- [ ] **Step 4: Commit**

```
git add test/kits/terrain-rapier.test.mjs
git commit -m "test(kits): terrain sampling agrees with Rapier ray casts and the ground group"
```

---

## Task 3: Kit purity guard

**Files:**
- Create: `test/kits/purity.test.mjs`

**Interfaces:**
- Consumes: `scanPurity`, `stripComments` from `testing/purity.js`.
- Produces: a guard over every `src/kits/*/sim.js` (L-3) and every `src/kits/*/view.js` (U-6, constraint 4).

- [ ] **Step 1: Write the test**

Create `test/kits/purity.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from '../../testing/purity.js';

const kits = fileURLToPath(new URL('../../src/kits/', import.meta.url));
const halves = name => (existsSync(kits) ? readdirSync(kits).sort() : []).map(k => `${kits}${k}/${name}`).filter(f => existsSync(f));

test('kit sim halves are sim-pure: no three, DOM, clocks or Math.random (L-3, T-12)', () => {
  const files = halves('sim.js');
  assert.ok(files.length >= 1, 'no kit sim halves found');
  assert.deepEqual(scanPurity(files), []);
});

test('kit sim halves never import Rapier (D9: it is injected) or a view half', () => {
  for (const f of halves('sim.js')) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.doesNotMatch(src, /['"]@dimforge\//, f);
    assert.doesNotMatch(src, /from\s*['"][^'"]*\/view(\.js)?['"]/, f);
  }
});

test('kit view halves use no Math.random (U-6) and no instanceof on three.js objects (constraint 4)', () => {
  for (const f of halves('view.js')) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.doesNotMatch(src, /\bMath\.random\s*\(/, f);
    assert.doesNotMatch(src, /\binstanceof\s+THREE\./, f);
  }
});
```

- [ ] **Step 2: Run, expect PASS**

`UNIT test/kits/purity.test.mjs`. Expected: 3 pass. Only `terrain/sim.js` exists so far, and later tasks are covered automatically.

- [ ] **Step 3: Prove it red by mutation**

Add the line `const _t = Date.now();` at the end of `src/kits/terrain/sim.js`. Run the test. Expected: FAIL in the first test, naming `wall-clock`. Replace it with `import R from '@dimforge/rapier3d-compat';` at the top. Expected: FAIL in the second test. Remove the line and run again. Expected: PASS.

- [ ] **Step 4: Commit**

```
git add test/kits/purity.test.mjs
git commit -m "test(kits): purity guard for kit sim and view halves"
```

---

## Task 4: Vehicle kit core

**Files:**
- Create: `src/kits/vehicle/sim.js`, `test/kits/fixtures/car.js`, `test/kits/vehicle.test.mjs`

**Interfaces:**
- Consumes (3c):
  - `world.engine` (Contract issue C1), `world.rapier.createVehicleController(body)`, `world.groups` and `world.groups.mask(member, filter)`;
  - `e.body` (RigidBody), `e.sockets[name].p`, `world.spawn`;
  - `engine.system(name, fn, { stage, before })` and `engine.world`.
- Produces:
  - `VEHICLE_SYSTEM = 'lh.kit.vehicle'`;
  - `createVehicle(world, e, { wheels: [{ at: [x, y, z] | socket, radius, front?, slip?, side?, suspension?: { rest = 0.3, stiffness?, compression?, relaxation?, travel?, maxForce? } }], rayGroups?: { member: [], filter: [...] }, forward: 'x' | 'z' = 'x' })` → `car`, where `car` is:
    - `controller`, `entity`, `removed`;
    - `wheels[i]`: `{ front, radius, inContact, point, normal, material, pair, friction, suspension, steering, load }`, reused objects;
    - `set(i, { steer, engine, brake, slip, side }) → car`;
    - `update(dt)`, called by the system.
- **Stable names for the game plans (3k C4; 3k and 3l match these; 3k's draft named the system `lh.vehicle.update`):**
  - **System:** `VEHICLE_SYSTEM = 'lh.kit.vehicle'`, one per engine, stage `'physics.world'`, `before: ['lh.physics.step']`. Games import the constant. Game controls sit `before: [VEHICLE_SYSTEM]`; assists that read `car.wheels` sit `after: [VEHICLE_SYSTEM], before: ['lh.physics.step']`.
  - **Chassis:** the game spawns it; the kit never adds, edits or reads its colliders, mass or groups. Required: a dynamic `body` (`{ type: 'dynamic', … }`; kinematic and bodiless entities throw). Colliders are any 3c collider: a sidecar `model` (wheel `socket`s come from it) or inline `colliders`, including `{ shape: 'box', half, round }` (roundCuboid, 3j #1). Chassis `groups` follow 3c: an omitted `member`/`filter` means every group. The fixtures use `body: { type: 'dynamic', canSleep: false, mass }` and `groups: { member: ['vehicle'], filter: ['ground', 'static', …] }`. Rapier's controller already leaves the chassis's own colliders out of the wheel rays; no predicate is needed.
  - **Wheel rays:** `rayGroups` (optional; omitted = no group filter) is `{ member?, filter? }` of declared names. `member: []` or omitted means every group (**ray filter only**, because a ray with no membership hits nothing); an omitted `filter` means every group (3c).
  - **Axes (body space):** up +y; the suspension ray points (0, −1, 0). `forward: 'x'` (default): forward +x, axle +z (the car's right), `indexForwardAxis` 0. `forward: 'z'` (Kenney models): forward +z, axle −x (the car's right), `indexForwardAxis` 2. `engine` > 0 drives forward. `steer` (radians) passes to Rapier unchanged: > 0 yaws the car counter-clockwise seen from above (a left turn: toward −z for forward x, toward +x for forward z). `brake` ≥ 0.

- [ ] **Step 1: Write the car fixture**

Create `test/kits/fixtures/car.js`:

```js
// A 1200 kg box car on four ray-cast wheels, plus a hand-written sidecar with wheel sockets (D2 shape).
import { createVehicle } from '../../../src/kits/vehicle/sim.js';

export const SUSPENSION = { rest: 0.3, stiffness: 30, compression: 2.5, relaxation: 3, travel: 0.3, maxForce: 1e5 };

// front pair, then rear pair; the first of each pair is at +z for forward x (the car's right: right = forward × up)
// and at +x for forward z (the car's left)
export function carWheels(forward = 'x') {
  const pts = forward === 'x' ? [[0.9, 0.75], [0.9, -0.75], [-0.9, 0.75], [-0.9, -0.75]] : [[0.75, 0.9], [-0.75, 0.9], [0.75, -0.9], [-0.75, -0.9]];
  return pts.map(([a, b], i) => ({ at: forward === 'x' ? [a, -0.1, b] : [a, -0.1, b], radius: 0.35, front: i < 2, suspension: SUSPENSION }));
}

export function spawnCar(world, { at = [0, 1, 0], forward = 'x', filter = ['ground', 'static', 'prop'], ...opts } = {}) {
  const e = world.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 },
    colliders: [{ shape: 'box', half: forward === 'x' ? [1.2, 0.3, 0.7] : [0.7, 0.3, 1.2], material: 'steel' }],
    groups: { member: ['vehicle'], filter }, at });
  return createVehicle(world, e, { wheels: carWheels(forward), forward, ...opts });
}

const sock = p => ({ p, q: [0, 0, 0, 1], part: 'body' });
export const CART = {
  v: 1, source: { file: 'test/kits/fixtures/cart.glb', sha256: '0'.repeat(64) }, parts: ['body'],
  colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' }],
  mass: { mass: 15825.6, com: [0, 0, 0], inertia: [3059.6, 10181.1, 8071.1], frame: [0, 0, 0, 1] },
  // forward x: left is -z, right is +z
  sockets: { 'wheel-fl': sock([0.9, -0.1, -0.75]), 'wheel-fr': sock([0.9, -0.1, 0.75]), 'wheel-rl': sock([-0.9, -0.1, -0.75]), 'wheel-rr': sock([-0.9, -0.1, 0.75]) },
  bounds: { min: [-1.2, -0.3, -0.7], max: [1.2, 0.3, 0.7] },
};
export const physFor = registry => ({ v: 1, engine: '0.8.0', materials: registry.hash, models: { cart: CART } });
```

- [ ] **Step 2: Write the failing tests**

Create `test/kits/vehicle.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain, MATERIALS } from './fixtures/kitGame.js';
import { spawnCar, carWheels, physFor, SUSPENSION } from './fixtures/car.js';
import { createVehicle, VEHICLE_SYSTEM } from '../../src/kits/vehicle/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const xyz = p => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const setup = () => { const h = headless(kitGame()); const terrain = flatTerrain(h.world); return { h, terrain }; };

test('a car settles on the terrain: every wheel in contact, flat normal, loaded suspension (design §7.3)', () => {
  const { h } = setup();
  const car = spawnCar(h.world);
  h.step(120);
  assert.equal(car.wheels.length, 4);
  car.wheels.forEach((w, i) => {
    assert.equal(w.inContact, true, `wheel ${i}`);
    near(w.point.y, 0, 0.01, `wheel ${i} point.y`); near(w.normal.y, 1, 1e-4, `wheel ${i} normal.y`);
    assert.ok(w.suspension > 0 && w.suspension <= SUSPENSION.rest + SUSPENSION.travel + 1e-6, `wheel ${i} suspension ${w.suspension}`);
    assert.ok(w.load > 0, `wheel ${i} load ${w.load}`);
  });
  assert.deepEqual(car.wheels.map(w => w.front), [true, true, false, false]);
  assert.ok(h.world.rapier.vehicleControllers.has(car.controller));
});

for (const [forward, axis, other, index] of [['x', 'x', 'z', 0], ['z', 'z', 'x', 2]]) {
  test(`forward '${forward}': engine force > 0 drives along +${axis} (setIndexForwardAxis quirk, axle sign)`, () => {
    const { h } = setup();
    const car = spawnCar(h.world, { forward });
    h.step(60);
    car.set(2, { engine: 800 }).set(3, { engine: 800 });
    h.step(120);
    const p = car.entity.xf.p;
    assert.ok(p[axis] > 1.5, `${axis} ${p[axis]}`); assert.ok(Math.abs(p[other]) < 0.3, `${other} ${p[other]}`);
    assert.equal(car.controller.indexForwardAxis, index);
    assert.ok(car.controller.currentVehicleSpeed() > 0.5, `speed ${car.controller.currentVehicleSpeed()}`);
    car.set(0, { steer: 0.3 }).set(1, { steer: 0.3 });
    h.step(30);
    assert.ok(car.entity.body.angvel().y > 0.05, `steer > 0 turns left (counter-clockwise from above): yaw rate ${car.entity.body.angvel().y}`);
  });
}

test('car.set reaches the controller on the next update; partial sets keep the rest; unset controls keep Rapier defaults', () => {
  const { h } = setup(), car = spawnCar(h.world), f = Math.fround, c = car.controller;
  car.set(0, { steer: 0.3, brake: 5 }).set(3, { engine: 800, slip: 2, side: 0.8 });
  car.set(0, { brake: 7 });
  h.step(1);
  near(c.wheelSteering(0), f(0.3), 0); near(c.wheelBrake(0), 7, 0); near(c.wheelEngineForce(3), 800, 0);
  near(c.wheelFrictionSlip(3), 2, 0); near(c.wheelSideFrictionStiffness(3), f(0.8), 0);
  near(car.wheels[0].steering, f(0.3), 0);
  assert.equal(c.wheelSteering(1), 0); near(c.wheelFrictionSlip(1), 10.5, 0); near(c.wheelSideFrictionStiffness(1), 1, 0);
  assert.throws(() => car.set(4, { steer: 1 }), /vehicle: wheel 4 out of range 0\.\.3/);
});

test('wheels may sit on sidecar sockets; an unknown socket names itself', () => {
  const h = headless(kitGame({ models: physFor(MATERIALS) })), w = h.world;
  flatTerrain(w);
  const desc = { model: 'cart', body: { type: 'dynamic', canSleep: false, mass: 1200 }, groups: { member: ['vehicle'], filter: ['ground', 'static'] } };
  const e = w.spawn({ ...desc, at: [0, 1, 0] }), names = ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr'];
  const car = createVehicle(w, e, { wheels: names.map(socket => ({ socket, radius: 0.35, suspension: SUSPENSION })) });
  names.forEach((n, i) => {
    const p = car.controller.wheelChassisConnectionPointCs(i), s = xyz(e.sockets[n].p);
    near(p.x, s[0], 1e-6); near(p.y, s[1], 1e-6); near(p.z, s[2], 1e-6);
  });
  h.step(90);
  assert.ok(car.wheels.every(x => x.inContact));
  const e2 = w.spawn({ ...desc, at: [6, 1, 0] });
  assert.throws(() => createVehicle(w, e2, { wheels: [{ socket: 'wheel-x', radius: 0.3 }] }), /vehicle: wheel 0: socket 'wheel-x' not on 'cart'/);
});

test('createVehicle refuses what cannot drive, before making anything', () => {
  const { h } = setup(), w = h.world, box = [{ shape: 'box', half: [1, 0.3, 0.6], material: 'steel' }];
  assert.throws(() => createVehicle({}, {}, {}), /vehicle: the World has no engine/);
  const ghost = w.spawn({ xf: true, tags: ['ghost'], at: [0, 1, 0] });
  assert.throws(() => createVehicle(w, ghost, { wheels: carWheels() }), /vehicle: 'ghost' has no body/);
  const kin = w.spawn({ body: 'kinematic', colliders: box, tags: ['kin'], at: [0, 1, 0] });
  assert.throws(() => createVehicle(w, kin, { wheels: carWheels() }), /vehicle: 'kin' needs a dynamic body/);
  const dyn = w.spawn({ body: { type: 'dynamic', mass: 900 }, colliders: box, tags: ['dyn'], at: [3, 1, 0] });
  assert.throws(() => createVehicle(w, dyn, { wheels: [] }), /vehicle: 'dyn' needs at least one wheel/);
  assert.throws(() => createVehicle(w, dyn, { wheels: carWheels(), forward: 'y' }), /vehicle: forward must be 'x' or 'z' \(got y\)/);
  assert.throws(() => createVehicle(w, dyn, { wheels: [{ at: [0, 0, 0], radius: 0 }] }), /vehicle: wheel 0: radius must be > 0 \(got 0\)/);
  assert.throws(() => createVehicle(w, dyn, { wheels: [{ radius: 0.3 }] }), /vehicle: wheel 0 needs at or socket/);
  assert.throws(() => createVehicle(w, dyn, { wheels: carWheels(), rayGroups: { filter: ['water'] } }), /vehicle: rayGroups names undeclared group 'water'/);
  assert.equal(w.rapier.vehicleControllers.size, 0);
});

test(`one '${VEHICLE_SYSTEM}' system per engine, in physics.world before lh.physics.step`, () => {
  const { h } = setup();
  spawnCar(h.world); spawnCar(h.world, { at: [6, 1, 0] });
  const order = h.engine.schedule()['physics.world'];
  assert.equal(order.filter(n => n === VEHICLE_SYSTEM).length, 1);
  assert.ok(order.indexOf(VEHICLE_SYSTEM) < order.indexOf('lh.physics.step'), order.join(', '));
});

test('rayGroups: member [] means every group (ray filter only); rays skip groups outside the filter; omitted means no filter', () => {
  const { h } = setup(), w = h.world;
  // a prop slab 0.5 m above the terrain under the cars; the chassis ignore props, so only wheel rays can touch it
  w.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [10, 0.05, 10], material: 'wood' }], at: [0, 0.45, 0], groups: { member: ['prop'] } });
  const a = spawnCar(w, { at: [-4, 1.5, 0], filter: ['ground', 'static'], rayGroups: { member: [], filter: ['ground', 'static'] } });
  const b = spawnCar(w, { at: [4, 1.5, 0], filter: ['ground', 'static'] });
  const c = spawnCar(w, { at: [0, 1.5, 6], filter: ['ground', 'static'], rayGroups: { member: ['vehicle'] } }); // filter omitted: every group (3c)
  h.step(120);
  a.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `a wheel ${i}`); near(x.point.y, 0, 0.01, `a wheel ${i} on the terrain`); });
  b.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `b wheel ${i}`); near(x.point.y, 0.5, 0.01, `b wheel ${i} on the slab`); });
  c.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `c wheel ${i}`); near(x.point.y, 0.5, 0.01, `c wheel ${i} on the slab`); });
});
```

- [ ] **Step 3: Run, expect FAIL**

`UNIT test/kits/vehicle.test.mjs`. Expected: fails at import with `Cannot find module '…/src/kits/vehicle/sim.js'`.

- [ ] **Step 4: Implement**

Create `src/kits/vehicle/sim.js`:

```js
// kit-vehicle (sim half, design §7.3): Rapier's ray-cast vehicle controller on a World entity (L-1: car.controller is
// the real one). The kit owns the wiring: wheels from body-space points or sockets, per-wheel controls, one update per
// step before 'lh.physics.step', and contact readback. Tuning stays game-side: a game system before VEHICLE_SYSTEM calls
// car.set(); one after it (and before 'lh.physics.step') may read car.wheels and add its own impulses.
// Sim-pure (L-3): Rapier is world.rapier, never an import.

export const VEHICLE_SYSTEM = 'lh.kit.vehicle';
const CARS = new WeakMap();    // World → its vehicles, updated in creation order
const ENGINES = new WeakSet(); // engines that already run VEHICLE_SYSTEM
const AXIS = { x: 0, z: 2 };
// engine force > 0 drives the chassis forward with these axles (checked on Rapier 0.21.0)
const AXLE = { x: { x: 0, y: 0, z: 1 }, z: { x: -1, y: 0, z: 0 } };
const DOWN = { x: 0, y: -1, z: 0 };
const C = 5; // controls per wheel: steer, engine, brake, slip, side

const fail = m => { throw new Error(`vehicle: ${m}`); };
const label = e => e?.model ?? ((e?.tags && [...e.tags].join(',')) || `entity ${e?.id}`);
const xyz = p => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y, z: p.z });

function install(engine) {
  if (ENGINES.has(engine)) return;
  ENGINES.add(engine);
  engine.system(VEHICLE_SYSTEM, (en, dt) => {
    const w = en.world, list = w && CARS.get(w);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i].update(dt);
  }, { stage: 'physics.world', before: ['lh.physics.step'] });
}

// rayGroups → a Rapier InteractionGroups u32, or undefined (no group filter). member [] means every group: a ray with
// no membership would hit nothing. That reading is for this ray filter ONLY: colliders follow 3c, where an explicit
// member [] means none, so [] never reaches world.groups.mask. An omitted member or filter means every group (3c).
function rayMask(world, rg) {
  if (rg === undefined) return undefined;
  const { member, filter } = rg;
  for (const n of (member ?? []).concat(filter ?? [])) if (n === 'mask' || !Object.hasOwn(world.groups, n)) fail(`rayGroups names undeclared group '${n}'`);
  return world.groups.mask(member?.length ? member : undefined, filter) >>> 0;
}

export function createVehicle(world, e, opts = {}) {
  const engine = world?.engine;
  if (!engine) fail('the World has no engine (world.engine): create vehicles on a scene World');
  if (!e?.body) fail(`'${label(e)}' has no body`);
  if (!e.body.isDynamic()) fail(`'${label(e)}' needs a dynamic body`);
  const { wheels: specs, rayGroups, forward = 'x' } = opts;
  if (!Array.isArray(specs) || specs.length === 0) fail(`'${label(e)}' needs at least one wheel`);
  if (!Object.hasOwn(AXIS, forward)) fail(`forward must be 'x' or 'z' (got ${forward})`);
  const mask = rayMask(world, rayGroups);
  const points = specs.map((s, i) => {
    const at = s.at ?? (s.socket !== undefined ? e.sockets?.[s.socket]?.p : undefined);
    if (!at) fail(s.socket !== undefined ? `wheel ${i}: socket '${s.socket}' not on '${label(e)}'` : `wheel ${i} needs at or socket`);
    if (!(s.radius > 0)) fail(`wheel ${i}: radius must be > 0 (got ${s.radius})`);
    return xyz(at);
  });

  const vc = world.rapier.createVehicleController(e.body);
  vc.setIndexForwardAxis = AXIS[forward]; // Rapier 0.21: a property setter with a method's name (read back as indexForwardAxis)
  const n = specs.length, ctl = new Float64Array(n * C), axle = AXLE[forward];
  const wheels = specs.map((s, i) => {
    const sus = s.suspension ?? {};
    vc.addWheel(points[i], DOWN, axle, sus.rest ?? 0.3, s.radius);
    if (sus.stiffness !== undefined) vc.setWheelSuspensionStiffness(i, sus.stiffness);
    if (sus.compression !== undefined) vc.setWheelSuspensionCompression(i, sus.compression);
    if (sus.relaxation !== undefined) vc.setWheelSuspensionRelaxation(i, sus.relaxation);
    if (sus.travel !== undefined) vc.setWheelMaxSuspensionTravel(i, sus.travel);
    if (sus.maxForce !== undefined) vc.setWheelMaxSuspensionForce(i, sus.maxForce);
    ctl[i * C + 3] = s.slip ?? vc.wheelFrictionSlip(i);          // Rapier's own defaults unless the spec sets them
    ctl[i * C + 4] = s.side ?? vc.wheelSideFrictionStiffness(i);
    return { front: !!s.front, radius: s.radius, inContact: false, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 },
      material: null, pair: null, friction: 1, suspension: 0, steering: 0, load: 0 };
  });

  const car = {
    controller: vc, entity: e, wheels, removed: false,
    set(i, c) {
      if (!(i >= 0 && i < n)) fail(`wheel ${i} out of range 0..${n - 1}`);
      const k = i * C;
      if (c.steer !== undefined) ctl[k] = c.steer;
      if (c.engine !== undefined) ctl[k + 1] = c.engine;
      if (c.brake !== undefined) ctl[k + 2] = c.brake;
      if (c.slip !== undefined) ctl[k + 3] = c.slip;
      if (c.side !== undefined) ctl[k + 4] = c.side;
      return car;
    },
    // called by VEHICLE_SYSTEM once per step; games do not call it
    update(dt) {
      for (let i = 0; i < n; i++) {
        const k = i * C;
        vc.setWheelSteering(i, ctl[k]); vc.setWheelEngineForce(i, ctl[k + 1]); vc.setWheelBrake(i, ctl[k + 2]);
        vc.setWheelFrictionSlip(i, ctl[k + 3]); vc.setWheelSideFrictionStiffness(i, ctl[k + 4]);
      }
      vc.updateVehicle(dt, undefined, mask); // the controller already leaves its own chassis out of the wheel rays
      for (let i = 0; i < n; i++) {
        const w = wheels[i];
        w.inContact = vc.wheelIsInContact(i);
        vc.wheelContactPoint(i, w.point); vc.wheelContactNormal(i, w.normal);
        w.suspension = vc.wheelSuspensionLength(i) ?? 0; w.steering = vc.wheelSteering(i) ?? 0; w.load = vc.wheelSuspensionForce(i) ?? 0;
      }
    },
  };
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  install(engine);
  return car;
}
```

- [ ] **Step 5: Run, expect PASS**

`UNIT test/kits/vehicle.test.mjs test/kits/purity.test.mjs`. Expected: 8 + 3 pass.

- [ ] **Step 6: Prove the quirks red by mutation**

Each mutation is reverted after its run:
- Delete the `vc.setIndexForwardAxis = …` line. Expected: the `forward 'z'` test fails on `indexForwardAxis` (0, not 2).
- In `AXLE.z`, use `x: 1`. Expected: the `forward 'z'` test fails with `z -…`.
- In `rayMask`, pass `member` straight to `world.groups.mask` (drop the `?.length` check). Expected: the ray-group test fails with `a wheel 0` not in contact (3c's `mask([], …)` has no membership).

If the steer-sign assertion fails (Rapier 0.21 yawing the other way), do not negate `steer` in the kit: games port their own steering unchanged. Record it in the notes, flip the documented sign in the Task 4 Interfaces and the test, and tell the integrator (3k and 3l read it).

- [ ] **Step 7: Commit**

```
git add src/kits/vehicle/sim.js test/kits/fixtures/car.js test/kits/vehicle.test.mjs
git commit -m "feat(kits): vehicle kit on Rapier's ray-cast controller, updated before the physics step"
```

---

## Task 5: Wheel ground materials and pair-table grip (M-10, D4)

**Files:**
- Modify: `src/kits/vehicle/sim.js`
- Create: `test/kits/vehicle-material.test.mjs`

**Interfaces:**
- Consumes: `terrain.entity`, `terrain.materialAt` (Task 1); `world.materialOf(handle)`; `world.materials.pair(a, b)` (§4.2, cached frozen); `vc.wheelGroundObject(i)`.
- Produces: the `createVehicle` options gain `terrain`, `tyre = 'rubber'` and `grip = false`. `wheels[i]` gains `material`, `pair` and `friction`. With `grip: true`, slip and side are multiplied by the last step's pair friction.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/vehicle-material.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar } from './fixtures/car.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const slab = (w, material, half = 30) => w.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [half, 0.5, half], material }],
  at: [0, -0.5, 0], groups: { member: ['static'] } });

test('each wheel reads the terrain material under its own contact point, not the body centre (M-10)', () => {
  const h = headless(kitGame());
  const terrain = flatTerrain(h.world, { at: (x, z) => (z > 0 ? 'grass' : 'gravel') });
  const car = spawnCar(h.world, { terrain });
  h.step(120);
  assert.deepEqual(car.wheels.map(w => w.material), ['grass', 'gravel', 'grass', 'gravel']);
  assert.equal(terrain.materialAt(0, 0), 'grass'); // the body centre alone would have said grass for all four
  assert.equal(car.wheels[1].pair, h.world.materials.pair('rubber', 'gravel'));
});

test('off the terrain a wheel reads its ground collider material; in the air it reads none', () => {
  const h = headless(kitGame()), w = h.world;
  slab(w, 'asphalt', 20);
  const car = spawnCar(w), sky = spawnCar(w, { at: [0, 30, 10] });
  h.step(90);
  assert.deepEqual(car.wheels.map(x => x.material), ['asphalt', 'asphalt', 'asphalt', 'asphalt']);
  assert.equal(car.wheels[0].pair, w.materials.pair('rubber', 'asphalt'));
  near(car.wheels[0].friction, w.materials.pair('rubber', 'asphalt').friction, 0);
  sky.wheels.forEach(x => { assert.equal(x.inContact, false); assert.equal(x.material, null); assert.equal(x.pair, null); assert.equal(x.friction, 1); });
});

test('grip: true scales slip and side stiffness by the tyre/ground pair friction (D4 pair table)', () => {
  const h = headless(kitGame()), w = h.world;
  slab(w, 'ice');
  const grippy = spawnCar(w, { at: [-5, 1, 0], grip: true }), plain = spawnCar(w, { at: [5, 1, 0] });
  for (const car of [grippy, plain]) for (let i = 0; i < 4; i++) car.set(i, { slip: 2, side: 0.8 });
  h.step(90);
  for (let i = 0; i < 4; i++) {
    assert.equal(grippy.wheels[i].friction, 0.1, 'the rubber|ice pair entry, not the geometric mean');
    near(grippy.controller.wheelFrictionSlip(i), Math.fround(2 * 0.1), 1e-7);
    near(grippy.controller.wheelSideFrictionStiffness(i), Math.fround(0.8 * 0.1), 1e-7);
    near(plain.controller.wheelFrictionSlip(i), 2, 0);
    near(plain.controller.wheelSideFrictionStiffness(i), Math.fround(0.8), 0);
  }
});

test('an unknown tyre material throws before a controller is made', () => {
  const h = headless(kitGame()), w = h.world;
  assert.throws(() => spawnCar(w, { tyre: 'cheese' }), /vehicle: unknown tyre material 'cheese'/);
  assert.equal(w.rapier.vehicleControllers.size, 0);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/vehicle-material.test.mjs`. Expected:
- the first test fails on `[null, null, null, null]`;
- the second on `null` materials;
- the third on `friction` 1;
- the fourth with `Missing expected exception`.

- [ ] **Step 3: Implement**

Make these edits in `src/kits/vehicle/sim.js`. Each block is the exact old text and its replacement.

Old:
```js
  const { wheels: specs, rayGroups, forward = 'x' } = opts;
  if (!Array.isArray(specs) || specs.length === 0) fail(`'${label(e)}' needs at least one wheel`);
  if (!Object.hasOwn(AXIS, forward)) fail(`forward must be 'x' or 'z' (got ${forward})`);
```
New:
```js
  const { wheels: specs, rayGroups, forward = 'x', terrain = null, tyre = 'rubber', grip = false } = opts;
  if (!Array.isArray(specs) || specs.length === 0) fail(`'${label(e)}' needs at least one wheel`);
  if (!Object.hasOwn(AXIS, forward)) fail(`forward must be 'x' or 'z' (got ${forward})`);
  const reg = world.materials;
  if (!reg.has(tyre)) fail(`unknown tyre material '${tyre}'`);
```

Old:
```js
  const car = {
    controller: vc, entity: e, wheels, removed: false,
```
New:
```js
  // The ground under a wheel (M-10): the terrain's materialAt at the contact point when the ray hit the terrain,
  // else the hit collider's material. The pair (tyre, ground) is the registry's cached frozen entry (D4).
  const tHandle = terrain ? terrain.entity.colliders[0].collider.handle : -1;
  const ground = (i, w) => {
    if (!w.inContact) { w.material = null; w.pair = null; w.friction = 1; return; }
    const hit = vc.wheelGroundObject(i), h = hit ? hit.handle : -1;
    const id = terrain && h === tHandle ? terrain.materialAt(w.point.x, w.point.z) : h >= 0 ? (world.materialOf(h) ?? null) : null;
    w.material = id;
    w.pair = id ? reg.pair(tyre, id) : null;
    w.friction = w.pair ? w.pair.friction : 1;
  };
  const car = {
    controller: vc, entity: e, wheels, tyre, removed: false,
```

Old:
```js
      for (let i = 0; i < n; i++) {
        const k = i * C;
        vc.setWheelSteering(i, ctl[k]); vc.setWheelEngineForce(i, ctl[k + 1]); vc.setWheelBrake(i, ctl[k + 2]);
        vc.setWheelFrictionSlip(i, ctl[k + 3]); vc.setWheelSideFrictionStiffness(i, ctl[k + 4]);
      }
```
New:
```js
      for (let i = 0; i < n; i++) {
        const k = i * C, g = grip ? wheels[i].friction : 1; // the last step's pair friction; × 1 keeps values bit-exact
        vc.setWheelSteering(i, ctl[k]); vc.setWheelEngineForce(i, ctl[k + 1]); vc.setWheelBrake(i, ctl[k + 2]);
        vc.setWheelFrictionSlip(i, ctl[k + 3] * g); vc.setWheelSideFrictionStiffness(i, ctl[k + 4] * g);
      }
```

Old:
```js
        w.suspension = vc.wheelSuspensionLength(i) ?? 0; w.steering = vc.wheelSteering(i) ?? 0; w.load = vc.wheelSuspensionForce(i) ?? 0;
      }
```
New:
```js
        w.suspension = vc.wheelSuspensionLength(i) ?? 0; w.steering = vc.wheelSteering(i) ?? 0; w.load = vc.wheelSuspensionForce(i) ?? 0;
        ground(i, w);
      }
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/vehicle-material.test.mjs test/kits/vehicle.test.mjs test/kits/purity.test.mjs`. Expected: 4 + 8 + 3 pass.

- [ ] **Step 5: Prove the per-wheel lookup red by mutation**

In `ground`, replace `terrain.materialAt(w.point.x, w.point.z)` with `terrain.materialAt(e.xf.p.x, e.xf.p.z)`. Expected: the first test fails with `['grass', 'grass', 'grass', 'grass']`. Revert. Then set `g = 1` unconditionally. Expected: the grip test fails. Revert.

- [ ] **Step 6: Commit**

```
git add src/kits/vehicle/sim.js test/kits/vehicle-material.test.mjs
git commit -m "feat(kits): ground material and pair friction under each wheel; opt-in grip (M-10, D4)"
```

---

## Task 6: Vehicle lifecycle (despawn, clear, scene change, order)

**Files:**
- Modify: `src/kits/vehicle/sim.js`
- Create: `test/kits/vehicle-lifecycle.test.mjs`

**Interfaces:**
- Consumes:
  - `world.own(e, freeFn)` (§4.5 Freeing; Contract issue C3 on its order);
  - `world.despawn`, `world.clear`, `h.go`;
  - `engine.system` with `before`/`after`.
- Produces: `car.removed`. A despawned or cleared vehicle leaves the update list, and its controller is removed from the Rapier world that made it.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/vehicle-lifecycle.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar } from './fixtures/car.js';
import { VEHICLE_SYSTEM } from '../../src/kits/vehicle/sim.js';

const setup = () => { const h = headless(kitGame()); flatTerrain(h.world); return h; };
const counted = (car, log, name) => { const u = car.update; car.update = dt => { log.push(name); u(dt); }; };

test('despawn frees the controller and drops the car from the update list', () => {
  const h = setup(), car = spawnCar(h.world), log = [];
  h.step(10); counted(car, log, 'car');
  h.step(2); assert.equal(log.length, 2);
  h.world.despawn(car.entity);
  assert.equal(car.removed, true);
  assert.equal(h.world.rapier.vehicleControllers.size, 0);
  h.step(5); assert.equal(log.length, 2);
});

test('world.clear() frees every controller; vehicles on the rebuilt World run', () => {
  const h = setup();
  const a = spawnCar(h.world), b = spawnCar(h.world, { at: [6, 1, 0] });
  h.step(10);
  h.world.clear();
  assert.equal(a.removed && b.removed, true);
  assert.equal(h.world.rapier.vehicleControllers.size, 0);
  flatTerrain(h.world);
  const c = spawnCar(h.world);
  h.step(90);
  assert.ok(c.wheels.every(w => w.inContact));
});

test("leaving the scene leaves its vehicles with its World; the next scene's vehicles run", () => {
  const h = setup();
  spawnCar(h.world); h.step(10);
  h.go('other'); h.step(10);
  h.go('play'); flatTerrain(h.world);
  const car = spawnCar(h.world); h.step(90);
  assert.ok(car.wheels.every(w => w.inContact));
});

test('vehicles update in creation order; game systems sit before and after the kit', () => {
  const h = setup(), log = [];
  counted(spawnCar(h.world, { at: [-5, 1, 0] }), log, 'a');
  counted(spawnCar(h.world, { at: [5, 1, 0] }), log, 'b');
  h.engine.system('game.controls', () => log.push('pre'), { stage: 'physics.world', before: [VEHICLE_SYSTEM] });
  h.engine.system('game.assist', () => log.push('post'), { stage: 'physics.world', after: [VEHICLE_SYSTEM], before: ['lh.physics.step'] });
  h.step(1);
  assert.deepEqual(log, ['pre', 'a', 'b', 'post']);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/vehicle-lifecycle.test.mjs`. Expected:
- the despawn test fails on `removed` (false);
- the clear test fails on `removed`, or throws from a stale controller's `update` after the clear.

The scene and order tests may pass already; they guard regressions.

- [ ] **Step 3: Implement**

In `src/kits/vehicle/sim.js`:

Old:
```js
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  install(engine);
  return car;
```
New:
```js
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  // despawn and clear() free the controller (3c runs own() callbacks while this Rapier world is still alive)
  const rw = world.rapier;
  world.own(e, () => {
    const k = list.indexOf(car);
    if (k !== -1) list.splice(k, 1);
    if (!car.removed) { car.removed = true; rw.removeVehicleController(vc); }
  });
  install(engine);
  return car;
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/vehicle-lifecycle.test.mjs test/kits/vehicle.test.mjs test/kits/vehicle-material.test.mjs`. Expected: 4 + 8 + 4 pass.

If `world.clear()` runs `own` callbacks after it frees the old Rapier world, the clear test crashes inside `removeVehicleController`. That is Contract issue C3: record it in the notes and ask the integrator. Do not catch the error.

- [ ] **Step 5: Commit**

```
git add src/kits/vehicle/sim.js test/kits/vehicle-lifecycle.test.mjs
git commit -m "feat(kits): vehicles leave the update list and free their controller on despawn and clear"
```

---

## Task 6b: Wheel part poses for view sync (3g Task 13b, 3c `partXf`)

**Why:** user ruling 2026-10-14 (every game fully on the engine). Pig Pens' and Tractor's sync hooks turn their wheel nodes themselves from `vc` reads. With a wheel `part`, the kit writes the wheel's pose into 3c's `e.partXf` every step, and 3g's view sync draws it interpolated with the body, so the games' wheel-turning code goes.

**Files:**
- Modify: `src/kits/vehicle/sim.js`
- Create: `test/kits/vehicle-parts.test.mjs`

**Interfaces:**
- Consumes: 3c Task 10b: `world.add(e, 'partXf', names)` (merges with names the game gave), `e.partXf[name] = { p, q }`, `world.partXfPrev(e, name, out)`; `vc.wheelRotation(i)`.
- Produces: a wheel spec may name `part: '<model part name>'` (the baked node, e.g. `'wheel-front-left'`). For each such wheel, after every update, `e.partXf[part]` holds, in the chassis (body) frame:
  - `p` = the hub: the connection point moved `wheels[i].suspension` along the suspension ray (0, −1, 0);
  - `q` = steer `wheels[i].steering` about +y, then roll about the axle by `−vc.wheelRotation(i)` (`forward: 'x'`: axle +z; `'z'`: axle −x), so a forward roll moves the bottom of the wheel backward.
  This is what 3g's sync needs (hub centre in the body frame, rotation from rest). Unnamed wheels write nothing; a car with no named wheel adds no `partXf`.
- Errors (before any controller is made): `vehicle: wheel <i>: part must be a model part name (got <v>)`, `vehicle: wheel <i>: part '<name>' is used twice`. Whether the model has the part is checked by view sync when it draws.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/vehicle-parts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar, carWheels } from './fixtures/car.js';
import { createVehicle } from '../../src/kits/vehicle/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const NAMES = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
const qmul = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const axis = (v, t) => ({ x: v.x * Math.sin(t / 2), y: v.y * Math.sin(t / 2), z: v.z * Math.sin(t / 2), w: Math.cos(t / 2) });
const conj = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const turn = (q, v) => { const r = qmul(qmul(q, { ...v, w: 0 }), conj(q)); return { x: r.x, y: r.y, z: r.z }; };
const named = forward => carWheels(forward).map((w, i) => ({ ...w, part: NAMES[i] }));

for (const [forward, axle] of [['x', { x: 0, y: 0, z: 1 }], ['z', { x: -1, y: 0, z: 0 }]]) {
  test(`forward '${forward}': named wheels write e.partXf (hub, steer about up, roll about the axle); prev swaps; a forward roll moves the bottom back`, () => {
    const h = headless(kitGame()); flatTerrain(h.world);
    const car = spawnCar(h.world, { forward, wheels: named(forward) }), e = car.entity, vc = car.controller;
    assert.deepEqual(Object.keys(e.partXf), NAMES);
    car.set(0, { steer: 0.3 }).set(1, { steer: 0.3 }); h.step(60);
    car.wheels.forEach((w, i) => {
      const at = carWheels(forward)[i].at, P = e.partXf[NAMES[i]];
      near(P.p.x, at[0], 1e-6, `wheel ${i} p.x`); near(P.p.y, at[1] - w.suspension, 1e-6, `wheel ${i} p.y`); near(P.p.z, at[2], 1e-6, `wheel ${i} p.z`);
      const want = qmul(axis({ x: 0, y: 1, z: 0 }, w.steering), axis(axle, -vc.wheelRotation(i)));
      for (const k of ['x', 'y', 'z', 'w']) near(P.q[k], want[k], 1e-9, `wheel ${i} q.${k}`);
    });
    car.set(0, { steer: 0 }).set(1, { steer: 0 }).set(2, { engine: 800 }).set(3, { engine: 800 }); h.step(60);
    const q0 = { ...e.partXf[NAMES[2]].q }; h.step(1);
    assert.deepEqual({ ...h.world.partXfPrev(e, NAMES[2]).q }, q0, "prev is the last step's pose (lh.world.swap)");
    const bottom = turn(qmul(e.partXf[NAMES[2]].q, conj(q0)), { x: 0, y: -1, z: 0 });
    assert.ok(bottom[forward] < 0, `the bottom of a rear wheel moves back: ${bottom[forward]}`);
  });
}

test('wheel parts merge into a partXf the game gave; unnamed wheels add none; bad or repeated names throw before a controller is made', () => {
  const h = headless(kitGame()), w = h.world; flatTerrain(w);
  assert.equal(spawnCar(w).entity.partXf, undefined);
  const e = w.spawn({ tags: ['cart'], body: { type: 'dynamic', canSleep: false, mass: 900 }, colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }], at: [6, 1, 0], partXf: ['body'] });
  createVehicle(w, e, { wheels: carWheels().map((x, i) => (i < 2 ? { ...x, part: NAMES[i] } : x)) });
  assert.deepEqual(Object.keys(e.partXf), ['body', NAMES[0], NAMES[1]]);
  const made = w.rapier.vehicleControllers.size;
  assert.throws(() => spawnCar(w, { at: [0, 1, 6], wheels: carWheels().map(x => ({ ...x, part: 'wheel' })) }), /vehicle: wheel 1: part 'wheel' is used twice/);
  assert.throws(() => spawnCar(w, { at: [0, 1, -6], wheels: [{ ...carWheels()[0], part: 3 }] }), /vehicle: wheel 0: part must be a model part name \(got 3\)/);
  assert.equal(w.rapier.vehicleControllers.size, made);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/vehicle-parts.test.mjs`. Expected: the forward tests fail on `Object.keys(undefined)` (no `partXf`); the last test fails on the missing keys.

- [ ] **Step 3: Implement**

In `src/kits/vehicle/sim.js`. Each block is the exact old text and its replacement.

Old:
```js
const xyz = p => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y, z: p.z });
```
New:
```js
const xyz = p => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y, z: p.z });
// A named wheel's part pose for view sync (3g Task 13b, 3c partXf), in the chassis frame: the hub (connection point moved
// `suspension` down the ray), steered about +y, then rolled about the axle by -rotation (a forward roll moves the bottom back).
function partPose(o, at, w, rot, axle) {
  o.p.x = at.x; o.p.y = at.y - w.suspension; o.p.z = at.z;
  const sy = Math.sin(w.steering / 2), cy = Math.cos(w.steering / 2), sr = Math.sin(-rot / 2), bw = Math.cos(-rot / 2);
  const bx = axle.x * sr, bz = axle.z * sr; // the axle has no y
  o.q.x = cy * bx + sy * bz; o.q.y = sy * bw; o.q.z = cy * bz - sy * bx; o.q.w = cy * bw;
}
```

Old:
```js
    return xyz(at);
  });
```
New:
```js
    return xyz(at);
  });
  const parts = specs.map((s, i) => {
    if (s.part === undefined) return null;
    if (typeof s.part !== 'string' || s.part === '') fail(`wheel ${i}: part must be a model part name (got ${s.part})`);
    if (specs.findIndex(t => t.part === s.part) !== i) fail(`wheel ${i}: part '${s.part}' is used twice`);
    return s.part;
  });
```

Old:
```js
  const car = {
    controller: vc, entity: e, wheels, tyre, removed: false,
```
New:
```js
  if (parts.some(p => p !== null)) world.add(e, 'partXf', parts.filter(p => p !== null)); // merges with the game's own names
  const poses = parts.map(p => (p === null ? null : e.partXf[p])); // the World's objects, written in place every step
  const car = {
    controller: vc, entity: e, wheels, tyre, removed: false,
```

Old:
```js
        ground(i, w);
      }
```
New:
```js
        ground(i, w);
        if (poses[i] !== null) partPose(poses[i], points[i], w, vc.wheelRotation(i) ?? 0, axle);
      }
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/vehicle-parts.test.mjs test/kits/vehicle.test.mjs test/kits/vehicle-material.test.mjs test/kits/vehicle-lifecycle.test.mjs test/kits/purity.test.mjs`. Expected: 3 + 8 + 4 + 4 + 3 pass.

If the "bottom moves back" assertion fails, Rapier 0.21's `wheelRotation` runs the other way: change `-rot` to `rot` in `partPose` and `-vc.wheelRotation(i)` in the test, record it in the notes and tell the integrator (3k and 3l read the convention). Do not change the steer sign.

- [ ] **Step 5: Prove it red by mutation.** In `partPose`, swap the steer and roll order (`roll ⊗ steer`): expect the `q` checks to fail on the steered front wheels. Revert; PASS.

- [ ] **Step 6: Commit**

```
git add src/kits/vehicle/sim.js test/kits/vehicle-parts.test.mjs
git commit -m "feat(kits): named vehicle wheels write their part poses (partXf) for view sync"
```

---

## Task 7: Coverage sim half

**Files:**
- Create: `src/kits/coverage/sim.js`, `test/kits/coverage.test.mjs`

**Interfaces:**
- Consumes:
  - `host.system(name, fn, { stage })`, where `host` is the engine or a scene ctx;
  - `engine.world`, `world.with('coverage')`, `world.xfPrev(e, out)`, `e.xf.p`, `world.place`;
  - `world.materials.get(id)` (`dirtRate`, `coverage`).
- Produces:
  - `COVERAGE_SYSTEM = 'lh.kit.coverage'`;
  - `coverageLayer(id) → 'dirt' | 'mud' | 'snow'`;
  - `coverageKit(host, { materialAt, washes = [], washTime = 1.5, layer = coverageLayer })` → `{ off }`. Each `washes` entry is `(x, z) => boolean` (cleans in the kit-wide `washTime`) or `{ at: (x, z) => boolean, washTime }` (its own time; Tractor's yard wash is 3× a sprinkler, 3l Integrator request 5). The first wash that holds at the entity's position decides.
  - Entities may set `coverageMaterial`. Without it, the first collider's material is used.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/coverage.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame } from './fixtures/kitGame.js';
import { coverageKit, coverageLayer, COVERAGE_SYSTEM } from '../../src/kits/coverage/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const LAYER = id => (id === 'bog' ? 'mud' : 'dirt');
function rig(opts = {}) {
  const h = headless(kitGame());
  coverageKit(h.engine, { materialAt: x => (x < 10 ? 'route' : 'bog'), layer: LAYER, ...opts });
  const mover = fields => { const e = h.world.spawn({ xf: true, at: [0, 0, 0], v: 0.25, ...fields }); h.scene.state.movers.push(e); return e; };
  return { h, mover };
}

test('an entity gains dirtRate × metres on its ground layer, clamped at 1 (spec §3.2)', () => {
  const { h, mover } = rig(), e = mover({ coverage: { dirt: 0, mud: 0 } });
  h.step(20);                                   // 20 × 0.25 m on route (dirtRate 0.01)
  near(e.xf.p.x, 5, 1e-12); near(e.coverage.dirt, 0.05, 1e-12); assert.equal(e.coverage.mud, 0);
  h.step(40);                                   // 19 more on route, then 21 on bog (dirtRate 0.2 → mud)
  near(e.coverage.dirt, 0.0975, 1e-12); assert.equal(e.coverage.mud, 1);
});

test('washes clean every layer at 1 / washTime per second and never below 0', () => {
  const { h, mover } = rig({ washes: [x => x >= 20] }), e = mover({ coverage: { dirt: 0.2, mud: 1 }, v: 0 });
  h.world.place(e, { at: [25, 0, 0] });
  h.step(45);
  near(e.coverage.mud, 0.5, 1e-9); assert.equal(e.coverage.dirt, 0);
  h.step(60);
  assert.equal(e.coverage.mud, 0);
});

test('a wash entry { at, washTime } overrides the kit-wide washTime; the first wash that holds decides (3l request 5)', () => {
  const { h, mover } = rig({ washTime: 1.5, washes: [{ at: x => x >= 20 && x < 30, washTime: 0.5 }, x => x >= 20] });
  const fast = mover({ coverage: { mud: 1 }, v: 0 }), slow = mover({ coverage: { mud: 1 }, v: 0 });
  h.world.place(fast, { at: [25, 0, 0] }); h.world.place(slow, { at: [35, 0, 0] });
  h.step(15);                                   // 0.25 s: 0.5 off in the 0.5 s wash, 1/6 off in the kit-wide 1.5 s one
  near(fast.coverage.mud, 0.5, 1e-9); near(slow.coverage.mud, 1 - 1 / 6, 1e-9);
});

test("the entity's own material scales what it accepts (no coverage block = everything)", () => {
  const { h, mover } = rig();
  const coated = mover({ coverage: { dirt: 0, mud: 0 }, coverageMaterial: 'coat' }), plain = mover({ coverage: { dirt: 0, mud: 0 } });
  h.step(60);
  assert.ok(plain.coverage.dirt > 0 && plain.coverage.mud > 0);
  near(coated.coverage.dirt, plain.coverage.dirt / 2, 1e-12);
  assert.equal(coated.coverage.mud, 0); // coat's coverage block has no mud
});

test('place() moves without accruing; standing still accrues nothing; layers the entity lacks stay absent', () => {
  const { h, mover } = rig(), e = mover({ coverage: { dirt: 0 } }), still = mover({ coverage: { dirt: 0 }, v: 0 });
  h.step(4); near(e.coverage.dirt, 0.01, 1e-12);
  h.world.place(e, { at: [8, 0, 0] }); h.step(1);
  near(e.coverage.dirt, 0.0125, 1e-12);         // the 0.25 m step, not the 7 m jump
  assert.equal(still.coverage.dirt, 0);
  h.step(20);                                   // into the bog: these entities carry no mud layer
  assert.equal('mud' in e.coverage, false);
});

test('coverageKit runs in post on the engine, or for one scene on its ctx', () => {
  const h = headless(kitGame({ enter: (e, ctx) => { coverageKit(ctx, { materialAt: () => 'route' }); } }));
  const has = () => h.engine.schedule().post.includes(COVERAGE_SYSTEM);
  assert.equal(has(), true);
  h.go('other'); assert.equal(has(), false);
  const k = coverageKit(h.engine, { materialAt: () => 'route' });
  assert.equal(has(), true); k.off(); assert.equal(has(), false);
});

test('coverageKit validates its options; the default layer maps mud and snow by id', () => {
  const h = headless(kitGame()), ok = { materialAt: () => 'route' };
  assert.throws(() => coverageKit({}, ok), /coverage: coverageKit needs the engine or a scene ctx/);
  assert.throws(() => coverageKit(h.engine, {}), /coverage: coverageKit needs materialAt/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washes: [1] }), /coverage: washes\[0\] must be \(x, z\) => boolean or \{ at, washTime \}/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washes: [{ at: () => true, washTime: -1 }] }), /coverage: washes\[0\]\.washTime must be > 0 \(got -1\)/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washTime: 0 }), /coverage: washTime must be > 0 \(got 0\)/);
  assert.throws(() => coverageKit(h.engine, { ...ok, layer: 'dirt' }), /coverage: layer must be a function/);
  assert.deepEqual(['mud', 'snow', 'gravel', 'bog'].map(coverageLayer), ['mud', 'snow', 'dirt', 'dirt']);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/coverage.test.mjs`. Expected: fails at import with `Cannot find module '…/src/kits/coverage/sim.js'`.

- [ ] **Step 3: Implement**

Create `src/kits/coverage/sim.js`:

```js
// kit-coverage (sim half): dirt, mud, snow and rust as levels 0..1 on entities (spec §3.2 dirtRate and coverage).
// An entity opts in with a `coverage` part; only the layers it carries change. Each step it gains the ground material's
// dirtRate × metres moved (the pool's prev → curr pose, so a place() teleport counts nothing) on that ground's layer,
// scaled by what its own material accepts (`coverageMaterial`, else its first collider's). Washes clean every layer at
// 1 / washTime per second (a wash entry { at, washTime } at its own time). Sim-pure (L-3); the view half feeds the same levels to the compiler's uCoverage.

export const COVERAGE_SYSTEM = 'lh.kit.coverage';
const LAYERS = ['dirt', 'rust', 'snow', 'mud'];
const fail = m => { throw new Error(`coverage: ${m}`); };
export const coverageLayer = id => (id === 'mud' ? 'mud' : id === 'snow' ? 'snow' : 'dirt');

export function coverageKit(host, { materialAt, washes = [], washTime = 1.5, layer = coverageLayer } = {}) {
  if (typeof host?.system !== 'function') fail('coverageKit needs the engine or a scene ctx (anything with .system)');
  if (typeof materialAt !== 'function') fail('coverageKit needs materialAt: (x, z) => material id');
  if (!(washTime > 0)) fail(`washTime must be > 0 (got ${washTime})`);
  if (!Array.isArray(washes)) fail('washes must be an array');
  // made once: washAt[k](x, z) and its washTimes[k] (the entry's own, else the kit-wide one)
  const washAt = [], washTimes = [];
  washes.forEach((w, k) => {
    const at = typeof w === 'function' ? w : w?.at, t = typeof w === 'function' ? washTime : w.washTime ?? washTime;
    if (typeof at !== 'function') fail(`washes[${k}] must be (x, z) => boolean or { at, washTime }`);
    if (!(t > 0)) fail(`washes[${k}].washTime must be > 0 (got ${t})`);
    washAt.push(at); washTimes.push(t);
  });
  if (typeof layer !== 'function') fail('layer must be a function (material id) => layer');
  const prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
  const off = host.system(COVERAGE_SYSTEM, (engine, dt) => {
    const world = engine.world;
    if (!world) return;
    const list = world.with('coverage'), reg = world.materials;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], c = e.coverage;
      if (!e.xf || !c) continue;
      const x = e.xf.p.x, z = e.xf.p.z;
      let wash = 0;
      for (let k = 0; k < washAt.length; k++) if (washAt[k](x, z)) { wash = washTimes[k]; break; }
      if (wash > 0) {
        const d = dt / wash;
        for (let k = 0; k < LAYERS.length; k++) { const L = LAYERS[k], v = c[L]; if (v !== undefined) c[L] = v > d ? v - d : 0; }
        continue;
      }
      world.xfPrev(e, prev);
      const dx = x - prev.p.x, dz = z - prev.p.z, m = Math.sqrt(dx * dx + dz * dz);
      if (m === 0) continue;
      const id = materialAt(x, z);
      if (id == null) continue;
      const rate = reg.get(id).dirtRate ?? 0;
      if (rate === 0) continue;
      const L = layer(id), v = c[L];
      if (v === undefined) continue;
      const g = v + rate * m * accept(e, L, reg);
      c[L] = g < 1 ? g : 1;
    }
  }, { stage: 'post' });
  return { off };
}

// How much of layer L the entity's own material takes: its coverage block's value, 0 if the block lacks L, 1 without a block.
function accept(e, L, reg) {
  const id = e.coverageMaterial ?? e.colliders?.[0]?.material;
  if (!id) return 1;
  const cov = reg.get(id).coverage;
  return cov ? (cov[L] ?? 0) : 1;
}
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/coverage.test.mjs test/kits/purity.test.mjs`. Expected: 7 + 3 pass.

- [ ] **Step 5: Prove the teleport rule red by mutation**

Replace `world.xfPrev(e, prev);` with `prev.p.x = 0; prev.p.z = 0;`, which measures from the origin. Expected: the `place()` test fails, with dirt far above 0.0125. Revert.

- [ ] **Step 6: Commit**

```
git add src/kits/coverage/sim.js test/kits/coverage.test.mjs
git commit -m "feat(kits): coverage kit: dirtRate per metre on the ground layer, washes, acceptance"
```

---

## Task 8: Sim kits together: drive sanity, determinism, replay, zero retained allocation

**Files:**
- Create: `test/kits/fixtures/carGame.js`, `test/kits/kits-sim.test.mjs`

**Interfaces:**
- Consumes:
  - `checks.determinism(game, { seed, steps, input })` → `{ ok, step, a, b }`;
  - `checks.zeroAlloc(game, { steps, warm, input })` (3c, T-10, T-13; `input` is a function `(step) → snapshot`, a named policy or a constant, as in `determinism`);
  - `replay`, `headless(…, { record: true })`, all from `testing/index.js`.
- Produces: one fixture game built only from the three sim kits.

> 3c ruling: `checks.zeroAlloc` runs in-process (it enables GC itself) and takes the game object, so no module URL is needed.

- [ ] **Step 1: Write the fixture game**

Create `test/kits/fixtures/carGame.js`:

```js
// One game made only of the sim kits: striped terrain (field/track), a driven car with grip, coverage on the car.
import RAPIER from '@dimforge/rapier3d-compat';
import { defineGame, defineMaterials, actions, axis } from '../../../src/index.sim.js';
import { createTerrain } from '../../../src/kits/terrain/sim.js';
import { createVehicle } from '../../../src/kits/vehicle/sim.js';
import { coverageKit } from '../../../src/kits/coverage/sim.js';
import { carWheels } from './car.js';

await RAPIER.init();
const MATERIALS = defineMaterials({ field: { extends: 'grass', dirtRate: 0.004 }, track: { extends: 'gravel', dirtRate: 0.006 } });
const N = 65, CELL = 2, X0 = -64, Z0 = -64;
function field(reg) {
  const heights = new Float32Array(N * N), mats = new Uint8Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    heights[iz * N + ix] = 0.4 * Math.sin(ix * 0.5) * Math.cos(iz * 0.4);
    mats[iz * N + ix] = reg.index((ix >> 2) & 1 ? 'track' : 'field'); // 8 m stripes across x
  }
  return { heights, mats };
}
const CTL = { steer: 0, engine: 0, brake: 0, slip: 2.5, side: 1 };

export default defineGame({
  id: 'kit-car', sim: { hz: 60, maxCatchUp: 3 },
  actions: actions({ throttle: axis(), steer: axis() }),
  defs: { materials: MATERIALS },
  physics: { rapier: RAPIER, gravity: [0, -9.81, 0], groups: ['ground', 'static', 'vehicle', 'prop'] },
  start: 'drive',
  scenes: {
    drive: {
      enter(e, ctx) {
        const w = ctx.world, f = field(w.materials);
        const terrain = createTerrain(w, { nx: N, nz: N, cell: CELL, x0: X0, z0: Z0, heights: f.heights, materials: f.mats });
        const car = w.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 },
          colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }],
          groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop'] },
          at: [-40, terrain.heightAt(-40, 0) + 1, 0], coverage: { dirt: 0 } });
        const v = createVehicle(w, car, { wheels: carWheels('x'), terrain, grip: true, rayGroups: { member: [], filter: ['ground', 'static'] } });
        coverageKit(ctx, { materialAt: (x, z) => terrain.materialAt(x, z) });
        Object.assign(ctx.state, { car, v });
      },
      step(e, dt, ctx) {
        const { v } = ctx.state, s = e.input.snapshot;
        for (let i = 0; i < 4; i++) {
          CTL.steer = i < 2 ? 0.4 * s.steer : 0; CTL.engine = i < 2 ? 0 : 400 * s.throttle;
          v.set(i, CTL);
        }
      },
    },
  },
  policies: { drive: (h, k) => ({ throttle: 1, steer: Math.sin(k / 60) }) },
  state: e => {
    const st = e.scene.state;
    if (!st.car) return {};
    const p = st.car.xf.p;
    return { x: p.x, y: p.y, z: p.z, dirt: st.car.coverage.dirt, wheels: st.v.wheels.map(w => w.material).join(',') };
  },
});
```

- [ ] **Step 2: Write the tests**

Create `test/kits/kits-sim.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, replay, checks } from '../../testing/index.js';
import game from './fixtures/carGame.js';

test('the sim kits drive a car over striped terrain; its wheels read both materials', () => {
  const h = headless(game, { seed: 3 }), seen = new Set();
  for (let k = 0; k < 600; k++) { h.step(1, { throttle: 1, steer: Math.sin(k / 60) }); for (const w of h.scene.state.v.wheels) if (w.material) seen.add(w.material); }
  const p = h.scene.state.car.xf.p;
  assert.ok(p.x > -33, `x ${p.x}`);
  assert.deepEqual([...seen].sort(), ['field', 'track']);
  assert.ok(Number.isFinite(h.scene.state.car.coverage.dirt));
});

test('terrain, vehicle and coverage are deterministic (checks.determinism, T-10)', async () => {
  const r = await checks.determinism(game, { seed: 5, steps: 600, input: 'drive' });
  assert.ok(r.ok, `diverged at step ${r.step}`);
});

test('a recorded drive replays to the same checksums (T-9)', () => {
  const h = headless(game, { seed: 7, record: true });
  h.step(600, 'drive');
  const sum = h.checksum(), r = replay(game, JSON.parse(JSON.stringify(h.tape())));
  assert.equal(r.checksum(), sum);
});

test('the sim kits retain no memory per step (checks.zeroAlloc, T-13)', async () => {
  const r = await checks.zeroAlloc(game, { steps: 3000, warm: 600, input: 'drive' }); // driving, so wheels, grip and coverage all run
  assert.ok(r.ok, JSON.stringify(r));
});
```

- [ ] **Step 3: Run, expect PASS**

`UNIT test/kits/kits-sim.test.mjs`. Expected: 4 pass. If the first test fails on `x`, the car is not driving: check the wheel contact and the axle (Task 4) before touching the numbers.

- [ ] **Step 4: Prove determinism and allocation red by mutation**

Each mutation is reverted after its run:
- In `src/kits/vehicle/sim.js` `update`, change `vc.setWheelEngineForce(i, ctl[k + 1])` to `vc.setWheelEngineForce(i, ctl[k + 1] * (1 + 1e-9 * (globalThis.__lhRun = (globalThis.__lhRun ?? 0) + 1)))`. The counter is process-global, so two runs differ. Expected: the determinism test FAILS.
- Add `const LEAK = [];` at module scope and `LEAK.push(new Float64Array(64));` at the top of `update`. Expected: the zeroAlloc test FAILS with retained growth well over 64 KB.

- [ ] **Step 5: Commit**

```
git add test/kits/fixtures/carGame.js test/kits/kits-sim.test.mjs
git commit -m "test(kits): sim kits are deterministic, replay exactly and retain nothing per step"
```

---

## Task 9: Terrain view half (chunks, LODs, skirts) **(judgment)**

**Decision expected:**
- `chunks: [cx, cz]` is a chunk **count** per axis. Chunk cells per side are rounded up to a multiple of the coarsest LOD step, so every LOD tiles a chunk exactly. Alternatively `chunkCells: n` fixes the chunk side at `n` cells (a multiple of the coarsest step) and derives the counts as ceil((nx − 1) / n), ceil((nz − 1) / n); it overrides `chunks`. Chunks wholly past the grid are dropped, and vertices past the grid edge clamp (degenerate, invisible triangles).
- `lods` are vertex spacings in cells, and `lodFar` holds the switch distances (one fewer than `lods`).
- Rally's settings are `chunkCells: 64`, `lods: [1, 2, 4]`, `lodFar: [150, 400]`, `hysteresis: 12`, `visFar: 760`, `evict: [300, 720]`, `skirt: 2`, `budgetMs: 3`, plus `drop` for its road sink and a `uv` attribute for its detail map. Tractor's are `chunks: [6, 6]` and `lods: [2]` (0.5 m grid drawn every 1 m), and it keeps its flat outer apron and rock shader game-side (`material` may be a three.js material; `attributes.rock`).

The reviewer checks that these defaults change nothing for a game that passes its own values.

**Rally adoption (controller ruling).** The kit mesh must be able to replace Rally's own chunked terrain (`trackView.js:237-320`). The mapping:

| Rally constant | Kit option |
|---|---|
| `CHUNK` 64 | `chunkCells: 64` (the same chunk grid for any `nx`; `chunks` counts would round the side to `ceil((nx-1)/count)`, e.g. 60 for 900 cells) |
| `LOD_STEP` | `lods: [1, 2, 4]` |
| `LOD_FAR` | `lodFar: [150, 400]` |
| `HYST` | `hysteresis: 12` |
| `VIS_FAR` | `visFar: 760` |
| `EVICT` | `evict: [300, 720]` |
| `SKIRT` | `skirt: 2` |
| `BUILD_MS` | `budgetMs: 3` |
| `DROP` near the road | `drop(x, z, lod)` (Rally returns `DROP[lod] × (1 − smooth(4.5, 7, d))` from its road distance) |
| palette, noise and slope colour | `colorAt(x, z, out, ny)`: `ny` is the vertex normal's y at this LOD's spacing, Rally's slope input, so colours match today's |
| `uv` (x / 8, z / 8) for the detail map | `attributes: { uv: { size: 2, at(x, z, out) } }` (skirts copy it, as Rally's do) |
| `MeshStandardMaterial` with detail map | `material` (a three.js material, or a compiler id) |
| `updateLod(spawn.x, spawn.z, Infinity)` at build | the first `update(camera)` is unbudgeted |
| `pending`, the 2 m move threshold | `stats.pending`, `moveEps: 2` (a pending mesh keeps building on later updates with a still camera) |

Its `stats` match Rally's `{ builds, buildMs, lastUpdateMs }` (plus `chunks`, `pending`). The hysteresis, budget, drain, eviction and Rally-settings tests below pin the paths Rally relies on. `now` (default `performance.now`) is a test clock for the budget.

**Files:**
- Create: `src/kits/terrain/view.js`, `test/kits/terrain-view.test.mjs`

**Interfaces:**
- Consumes:
  - `terrain.grid` (Task 1);
  - `compiler.get(id, { vertexColors })` (3f §4.8; faked in tests);
  - `camera.position`.
- Produces:
  - `createTerrainMesh(terrain, { compiler, chunks = [6, 6], chunkCells = null, lods = [1], lodFar = [], hysteresis = 12, skirt = 2, visFar = Infinity, evict = null, colorAt = null, attributes = {}, drop = null, material = 'grass', budgetMs = 3, moveEps = 2, now = () => performance.now() })` → `{ group, update(camera), dispose(), stats: { chunks, builds, buildMs, lastUpdateMs, pending } }`; `colorAt(x, z, out, ny) → out`;
  - `chunkIndex(n, m) → BufferAttribute`.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/terrain-view.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrainMesh } from '../../src/kits/terrain/view.js';

// view tests need no World: the mesh reads only terrain.grid
const grid = (nx, nz, cell, x0, z0, f) => {
  const H = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) H[iz * nx + ix] = f(ix, iz);
  return { grid: { nx, nz, cell, x0, z0, heights: H, materials: null } };
};
const T = grid(17, 9, 2, -16, -8, (ix, iz) => Math.sin(ix * 0.7) + iz * 0.25);
const compiler = () => { const calls = []; return { calls, get(id, o) { calls.push([id, o]); return new THREE.MeshLambertMaterial(); } }; };
const cam = (x, z) => ({ position: { x, y: 10, z } });
const verts = (n, m) => n * m + 2 * (n + m);

test('LOD 0 vertices sit on the height samples; counts include the four skirts', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  t.update(cam(-8, 0));
  assert.equal(t.group.children.length, 2);
  const [m0, m1] = t.group.children, p = m0.geometry.attributes.position;
  assert.equal(p.count, verts(9, 9));
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const v = j * 9 + i;
    assert.equal(p.getX(v), -16 + i * 2); assert.equal(p.getZ(v), -8 + j * 2); assert.equal(p.getY(v), T.grid.heights[j * 17 + i]);
  }
  assert.equal(m1.geometry.attributes.position.getX(0), 0);
  assert.equal(t.stats.chunks, 2); assert.equal(t.stats.builds, 2);
  assert.equal(m0.receiveShadow, true); assert.equal(m0.matrixAutoUpdate, false);
});

test('surface triangles face up and every skirt triangle faces out of its chunk', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1] });
  t.update(cam(0, 0));
  const g = t.group.children[0].geometry, p = g.attributes.position, idx = g.index.array, surface = 16 * 8 * 6;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  let skirts = 0;
  for (let k = 0; k < idx.length; k += 3) {
    A.fromBufferAttribute(p, idx[k]); B.fromBufferAttribute(p, idx[k + 1]); Cv.fromBufferAttribute(p, idx[k + 2]);
    N.subVectors(B, A).cross(E.subVectors(Cv, A));
    if (k < surface) assert.ok(N.y > 0, `surface triangle ${k / 3} faces down`);
    else { skirts++; const ox = (A.x + B.x + Cv.x) / 3, oz = (A.z + B.z + Cv.z) / 3; assert.ok(N.x * ox + N.z * oz > 0, `skirt triangle ${k / 3} faces in`); }
  }
  assert.equal(skirts, 2 * (16 + 8) * 2);
});

test('neighbouring chunks share their edge vertices exactly at one LOD (no cracks)', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  t.update(cam(-8, 0));
  const [a, b] = t.group.children.map(m => m.geometry.attributes);
  for (let j = 0; j < 9; j++) for (const k of ['position', 'normal']) for (let c = 0; c < 3; c++) {
    assert.equal(a[k].array[(j * 9 + 8) * 3 + c], b[k].array[(j * 9) * 3 + c], `${k} row ${j}`);
  }
});

test('LOD follows the distance to the chunk, with hysteresis toward the finer level', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1, 2, 4], lodFar: [10, 30] });
  const count = () => t.group.children[0].geometry.attributes.position.count, L = [verts(17, 9), verts(9, 5), verts(5, 3)];
  t.update(cam(25, 0)); assert.equal(count(), L[0]);   // d 9
  t.update(cam(27, 0)); assert.equal(count(), L[0]);   // d 11: past 10, inside 10 + 12
  t.update(cam(40, 0)); assert.equal(count(), L[1]);   // d 24
  t.update(cam(50, 0)); assert.equal(count(), L[1]);   // d 34: inside 30 + 12
  t.update(cam(60, 0)); assert.equal(count(), L[2]);   // d 44
  t.update(cam(0, 0)); assert.equal(count(), L[0]);    // finer at once, from the cached geometry
  assert.equal(t.stats.builds, 3);
});

test('after the first update building is budgeted: a chunk shows what it has, or its coarsest LOD, never a hole', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 0 });
  t.update(cam(-8, 0));                                 // the first update is unbudgeted: both chunks at LOD 0
  t.update(cam(-60, 0));                                // chunk 0 now wants LOD 2: no budget, keeps LOD 0
  assert.equal(t.group.children[0].geometry.attributes.position.count, verts(9, 9));
  assert.equal(t.stats.pending, true); assert.equal(t.stats.builds, 2);
  const u = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 0, visFar: 20 });
  u.update(cam(-60, 0));                                // both beyond visFar: nothing built
  assert.equal(u.group.children.length, 0);
  u.update(cam(-8, 0));                                 // no budget: the coarsest LOD, so no hole
  assert.deepEqual(u.group.children.map(m => m.geometry.attributes.position.count), [verts(3, 3), verts(3, 3)]);
  assert.equal(u.stats.pending, true);
});

test('pending builds drain on later updates while the camera stands still (Rally streaming), then updates idle', () => {
  let t = 0;
  const now = () => (t += 2);                           // every clock read costs 2 ms: one build fits a 3 ms budget
  const m = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2, 4], lodFar: [10, 30], budgetMs: 3, now });
  const counts = () => m.group.children.map(c => c.geometry.attributes.position.count);
  m.update(cam(-8, 0)); assert.equal(m.stats.builds, 2);
  m.update(cam(-60, 0));                                // chunk 0 builds LOD 2; chunk 1 is over budget and keeps LOD 0
  assert.deepEqual(counts(), [verts(3, 3), verts(9, 9)]); assert.equal(m.stats.pending, true); assert.equal(m.stats.builds, 3);
  m.update(cam(-60, 0));                                // same place: pending work continues
  assert.deepEqual(counts(), [verts(3, 3), verts(3, 3)]); assert.equal(m.stats.pending, false); assert.equal(m.stats.builds, 4);
  m.update(cam(-60, 0)); assert.equal(m.stats.builds, 4);
});

test('colorAt, extra attributes and drop shape the vertices; the compiler is asked for vertex colours', () => {
  const c = compiler();
  const t = createTerrainMesh(T, { compiler: c, chunks: [1, 1], lods: [1, 2], lodFar: [10], material: 'grass',
    colorAt: (x, z, out) => { out[0] = (x + 16) / 32; out[1] = 0.5; out[2] = (z + 8) / 16; return out; },
    attributes: { rock: { size: 1, at: (x, z, out) => { out[0] = x > 0 ? 1 : 0; return out; } } },
    drop: (x, z, lod) => (lod ? 0.5 : 0) });
  assert.deepEqual(c.calls, [['grass', { vertexColors: true }]]);
  t.update(cam(0, 0));
  const g = t.group.children[0].geometry, v = 4 * 17 + 10; // ix 10, iz 4: x 4, z 0
  assert.equal(g.attributes.color.getX(v), 0.625); assert.equal(g.attributes.color.getY(v), 0.5); assert.equal(g.attributes.color.getZ(v), 0.5);
  assert.equal(g.attributes.rock.getX(v), 1); assert.equal(g.attributes.rock.getX(4 * 17 + 2), 0);
  t.update(cam(30, 0));                                 // d 14: LOD 1, sunk 0.5 m
  assert.equal(t.group.children[0].geometry.attributes.position.getY(0), Math.fround(T.grid.heights[0] - 0.5));
});

test('a three.js material passes straight through; bad options throw', () => {
  const mat = new THREE.MeshBasicMaterial(), t = createTerrainMesh(T, { material: mat, chunks: [1, 1] });
  t.update(cam(0, 0));
  assert.equal(t.group.children[0].material, mat);
  assert.throws(() => createTerrainMesh({}, {}), /terrain view: terrain.grid is missing/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), lods: [2, 1], lodFar: [10] }), /terrain view: lods must be rising positive integers/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), lods: [1, 2], lodFar: [] }), /terrain view: lodFar needs 1 distance\(s\) for 2 LODs/);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), chunks: [0, 1] }), /terrain view: chunks must be \[x, z\] counts/);
  assert.throws(() => createTerrainMesh(T, { chunks: [1, 1] }), /terrain view: pass compiler/);
});

test('evict drops far fine geometry (Rally EVICT) and it is rebuilt on return', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [1, 1], lods: [1, 2, 4], lodFar: [10, 30], evict: [20, 50] });
  const real = THREE.BufferGeometry.prototype.dispose; let freed = 0;
  THREE.BufferGeometry.prototype.dispose = function () { freed++; return real.call(this); };
  try {
    t.update(cam(0, 0)); assert.equal(t.stats.builds, 1);
    t.update(cam(40, 0));                               // d 24 > evict[0]: LOD 0 freed, LOD 1 built
    assert.equal(freed, 1); assert.equal(t.stats.builds, 2);
    assert.equal(t.group.children[0].geometry.attributes.position.count, verts(9, 5));
    t.update(cam(0, 0));                                // back: LOD 0 rebuilt
    assert.equal(t.stats.builds, 3); assert.equal(t.group.children[0].geometry.attributes.position.count, verts(17, 9));
  } finally { THREE.BufferGeometry.prototype.dispose = real; }
});

test("Rally's settings: chunkCells fixes the chunk grid; colorAt gets the normal's y; uv rides on attributes (3j #9)", () => {
  const R = grid(901, 65, 1, 0, 0, (ix, iz) => 0.05 * ix + 0.02 * iz);
  const t = createTerrainMesh(R, { compiler: compiler(), chunkCells: 64, lods: [1, 2, 4], lodFar: [150, 400], hysteresis: 12, visFar: 760,
    evict: [300, 720], skirt: 2, budgetMs: 3, drop: (x, z, lod) => [0, 0.35, 0.9][lod],
    colorAt: (x, z, out, ny) => { out[0] = ny; out[1] = 0; out[2] = 0; return out; },
    attributes: { uv: { size: 2, at: (x, z, out) => { out[0] = x / 8; out[1] = z / 8; return out; } } } });
  assert.equal(t.stats.chunks, 15);                     // ceil(900 / 64); chunks: [15, 1] would make 60-cell chunks
  t.update(cam(32, 32));
  const [a, b] = t.group.children.map(m => m.geometry.attributes), v = 10 * 65 + 10;
  assert.equal(a.position.count, verts(65, 65)); assert.equal(b.position.getX(0), 64);
  assert.equal(a.color.getX(v), a.normal.getY(v)); assert.ok(a.color.getX(v) < 1);
  assert.equal(a.uv.getX(v), 1.25); assert.equal(a.uv.getY(v), 1.25);
  assert.ok(Number.isFinite(t.stats.lastUpdateMs) && t.stats.lastUpdateMs >= 0);
  assert.throws(() => createTerrainMesh(T, { compiler: compiler(), chunkCells: 6, lods: [1, 2, 4], lodFar: [10, 30] }),
    /terrain view: chunkCells must be a multiple of the coarsest LOD step 4 \(got 6\)/);
});

test('dispose frees every built geometry and empties the group', () => {
  const t = createTerrainMesh(T, { compiler: compiler(), chunks: [2, 1], lods: [1, 2], lodFar: [10] });
  t.update(cam(-8, 0)); t.update(cam(-40, 0));
  assert.equal(t.stats.builds, 4);
  const real = THREE.BufferGeometry.prototype.dispose; let freed = 0;
  THREE.BufferGeometry.prototype.dispose = function () { freed++; return real.call(this); };
  try { t.dispose(); } finally { THREE.BufferGeometry.prototype.dispose = real; }
  assert.equal(freed, 4); assert.equal(t.group.children.length, 0);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/terrain-view.test.mjs`. Expected: fails at import with `Cannot find module '…/src/kits/terrain/view.js'`.

- [ ] **Step 3: Implement**

Create `src/kits/terrain/view.js`:

```js
// kit-terrain (view half): the terrain as chunked meshes with distance LODs and skirts (Rally's trackView chunks,
// generalised; Tractor's 6×6 farm chunks are chunks: [6, 6] with one LOD). Each chunk builds lazily per LOD; after the
// first update, building spends at most budgetMs per call, and a chunk shows any LOD it already has meanwhile (or its
// coarsest, never a hole). Heights come from terrain.grid, so LOD 0 vertices sit exactly on the samples.
import * as THREE from 'three';

const fail = m => { throw new Error(`terrain view: ${m}`); };

// The shared index of an n×m vertex chunk plus its four skirts (bottom, top, left, right edge copies), facing out.
export function chunkIndex(n, m) {
  const idx = [], g = (i, j) => j * n + i;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = g(i, j), b = a + n, c = a + 1, d = b + 1;
    idx.push(a, b, c, b, d, c); // faces up; the split is Rapier's (ix+1, iz)–(ix, iz+1) diagonal
  }
  const edges = [[k => g(k, 0), n, [0, 0, -1], [1, 0, 0]], [k => g(k, m - 1), n, [0, 0, 1], [1, 0, 0]],
    [k => g(0, k), m, [-1, 0, 0], [0, 0, 1]], [k => g(n - 1, k), m, [1, 0, 0], [0, 0, 1]]];
  let base = n * m;
  for (const [e, len, out, t] of edges) {
    const flip = -t[2] * out[0] + t[0] * out[2] < 0; // (e_k, s_k, e_k+1) faces (-t.z, 0, t.x): flip when that points in
    for (let k = 0; k < len - 1; k++) {
      const e0 = e(k), e1 = e(k + 1), s0 = base + k, s1 = base + k + 1;
      if (!flip) idx.push(e0, s0, e1, e1, s0, s1); else idx.push(e0, e1, s0, e1, s1, s0);
    }
    base += len;
  }
  return new THREE.BufferAttribute(base > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
}

export function createTerrainMesh(terrain, opts = {}) {
  const { compiler = null, chunks = [6, 6], chunkCells = null, lods = [1], lodFar = [], hysteresis = 12, skirt = 2, visFar = Infinity,
    evict = null, colorAt = null, attributes = {}, drop = null, material = 'grass', budgetMs = 3, moveEps = 2, now = () => performance.now() } = opts;
  const G = terrain?.grid;
  if (!G) fail('terrain.grid is missing (pass the object createTerrain returned)');
  const { nx, nz, cell, x0, z0, heights: H } = G;
  if (!Array.isArray(lods) || !lods.length || lods.some((s, i) => !Number.isInteger(s) || s < 1 || (i > 0 && s <= lods[i - 1]))) {
    fail(`lods must be rising positive integers (got ${JSON.stringify(lods)})`);
  }
  if (!Array.isArray(lodFar) || lodFar.length !== lods.length - 1) fail(`lodFar needs ${lods.length - 1} distance(s) for ${lods.length} LODs (got ${JSON.stringify(lodFar)})`);
  if (!Array.isArray(chunks) || chunks.length !== 2 || chunks.some(c => !Number.isInteger(c) || c < 1)) fail(`chunks must be [x, z] counts (got ${JSON.stringify(chunks)})`);
  const extra = Object.entries(attributes);
  for (const [name, a] of extra) if (!(Number.isInteger(a?.size) && a.size >= 1 && typeof a.at === 'function')) fail(`attributes.${name} needs { size, at(x, z, out) }`);
  const mat = material?.isMaterial ? material : compiler ? compiler.get(material, { vertexColors: !!colorAt }) : fail('pass compiler (or a three.js material as material)');

  const top = lods[lods.length - 1];
  if (chunkCells !== null && !(Number.isInteger(chunkCells) && chunkCells > 0 && chunkCells % top === 0)) fail(`chunkCells must be a multiple of the coarsest LOD step ${top} (got ${chunkCells})`);
  // chunkCells (Rally's CHUNK) fixes the chunk side; otherwise chunks counts set it, rounded up to the coarsest step
  const csx = chunkCells ?? Math.ceil(Math.ceil((nx - 1) / chunks[0]) / top) * top, csz = chunkCells ?? Math.ceil(Math.ceil((nz - 1) / chunks[1]) / top) * top;
  const ncx = chunkCells ? Math.ceil((nx - 1) / chunkCells) : chunks[0], ncz = chunkCells ? Math.ceil((nz - 1) / chunkCells) : chunks[1];
  const clx = g => (g < 0 ? 0 : g > nx - 1 ? nx - 1 : g), clz = g => (g < 0 ? 0 : g > nz - 1 ? nz - 1 : g);
  const hAt = (gx, gz) => H[clz(gz) * nx + clx(gx)];
  const index = lods.map(st => chunkIndex(csx / st + 1, csz / st + 1));
  const group = new THREE.Group(); group.name = 'terrain';
  const list = [];
  for (let cz = 0; cz < ncz; cz++) for (let cx = 0; cx < ncx; cx++) {
    const gx0 = cx * csx, gz0 = cz * csz;
    if (gx0 >= nx - 1 || gz0 >= nz - 1) continue; // rounding up to the coarsest step can leave chunks past the grid
    list.push({ gx0, gz0, x0: x0 + gx0 * cell, z0: z0 + gz0 * cell, x1: x0 + Math.min(gx0 + csx, nx - 1) * cell,
      z1: z0 + Math.min(gz0 + csz, nz - 1) * cell, geo: lods.map(() => null), lod: -1, mesh: null });
  }
  const stats = { chunks: list.length, builds: 0, buildMs: 0, lastUpdateMs: 0, pending: false };
  const rgb = [1, 1, 1], scratch = extra.map(([, a]) => new Array(a.size).fill(0));

  function build(ch, li) {
    const t0 = now(), st = lods[li], n = csx / st + 1, m = csz / st + 1, nv = n * m + 2 * (n + m);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = colorAt ? new Float32Array(nv * 3) : null;
    const ext = extra.map(([, a]) => new Float32Array(nv * a.size));
    for (let j = 0, v = 0; j < m; j++) for (let i = 0; i < n; i++, v++) {
      const gx = ch.gx0 + i * st, gz = ch.gz0 + j * st, x = x0 + clx(gx) * cell, z = z0 + clz(gz) * cell;
      pos[v * 3] = x; pos[v * 3 + 1] = hAt(gx, gz) - (drop ? drop(x, z, li) : 0); pos[v * 3 + 2] = z;
      // normal from the grid at this LOD's spacing, so neighbouring chunks agree on their shared edges
      const dx = (hAt(gx + st, gz) - hAt(gx - st, gz)) / (2 * st * cell), dz = (hAt(gx, gz + st) - hAt(gx, gz - st)) / (2 * st * cell);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      nor[v * 3] = -dx * il; nor[v * 3 + 1] = il; nor[v * 3 + 2] = -dz * il;
      if (col) { colorAt(x, z, rgb, il); col[v * 3] = rgb[0]; col[v * 3 + 1] = rgb[1]; col[v * 3 + 2] = rgb[2]; }
      for (let a = 0; a < extra.length; a++) {
        const sz = extra[a][1].size, o = scratch[a];
        extra[a][1].at(x, z, o);
        for (let k = 0; k < sz; k++) ext[a][v * sz + k] = o[k];
      }
    }
    // skirts: copies of the edge vertices (in chunkIndex's order) hung `skirt` m lower
    const edgeV = [k => k, k => (m - 1) * n + k, k => k * n, k => k * n + n - 1], lens = [n, n, m, m];
    for (let e = 0, s = n * m; e < 4; e++) for (let k = 0; k < lens[e]; k++, s++) {
      const v = edgeV[e](k);
      for (let a = 0; a < 3; a++) { pos[s * 3 + a] = pos[v * 3 + a]; nor[s * 3 + a] = nor[v * 3 + a]; if (col) col[s * 3 + a] = col[v * 3 + a]; }
      pos[s * 3 + 1] -= skirt;
      for (let a = 0; a < extra.length; a++) { const sz = extra[a][1].size; for (let q = 0; q < sz; q++) ext[a][s * sz + q] = ext[a][v * sz + q]; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    extra.forEach(([name, a], k) => geo.setAttribute(name, new THREE.BufferAttribute(ext[k], a.size)));
    geo.setIndex(index[li]);
    geo.computeBoundingSphere();
    ch.geo[li] = geo; stats.builds++; stats.buildMs += now() - t0;
    return geo;
  }

  let has = false, lx = 0, lz = 0;
  function update(camera) {
    const px = camera.position.x, pz = camera.position.z;
    if (has && !stats.pending && Math.hypot(px - lx, pz - lz) < moveEps) return;
    const t0 = now(), budget = has ? budgetMs : Infinity;
    has = true; lx = px; lz = pz; stats.pending = false;
    for (let c = 0; c < list.length; c++) {
      const ch = list[c];
      const dx = Math.max(ch.x0 - px, 0, px - ch.x1), dz = Math.max(ch.z0 - pz, 0, pz - ch.z1), d = Math.hypot(dx, dz);
      if (evict) for (let k = 0; k < evict.length; k++) if (ch.geo[k] && d > evict[k]) { if (ch.lod === k) ch.lod = -1; ch.geo[k].dispose(); ch.geo[k] = null; }
      if (d > visFar) { if (ch.mesh) ch.mesh.visible = false; continue; }
      let want = 0;
      while (want < lodFar.length && d >= lodFar[want]) want++;
      if (ch.lod >= 0 && ch.lod < want && d < lodFar[ch.lod] + hysteresis) want = ch.lod; // stay finer a little longer
      let li = want;
      if (!ch.geo[want]) {
        if (now() - t0 < budget) build(ch, want);
        else {
          stats.pending = true; li = -1;
          for (let k = 0; k < lods.length; k++) if (ch.geo[k]) { li = k; break; }
          if (li < 0) { li = lods.length - 1; build(ch, li); } // never leave a hole; the coarsest LOD is cheap
        }
      }
      if (!ch.mesh) {
        ch.mesh = new THREE.Mesh(ch.geo[li], mat);
        ch.mesh.name = 'terrain-chunk'; ch.mesh.receiveShadow = true; ch.mesh.matrixAutoUpdate = false;
        group.add(ch.mesh);
      }
      ch.mesh.geometry = ch.geo[li]; ch.mesh.visible = true; ch.lod = li;
    }
    stats.lastUpdateMs = now() - t0;
  }

  function dispose() {
    for (const ch of list) {
      for (let k = 0; k < ch.geo.length; k++) if (ch.geo[k]) { ch.geo[k].dispose(); ch.geo[k] = null; }
      if (ch.mesh) group.remove(ch.mesh);
      ch.mesh = null; ch.lod = -1;
    }
    group.removeFromParent();
  }

  return { group, update, dispose, stats };
}
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/terrain-view.test.mjs test/kits/purity.test.mjs`. Expected: 11 + 3 pass.

- [ ] **Step 5: Prove the skirt winding red by mutation**

In `chunkIndex`, swap the two push branches (`if (flip)` instead of `if (!flip)`). Expected: the skirt test fails with `skirt triangle … faces in`. Revert.

- [ ] **Step 6: Commit**

```
git add src/kits/terrain/view.js test/kits/terrain-view.test.mjs
git commit -m "feat(kits): terrain view: chunked meshes with distance LODs, skirts and a build budget"
```

---

## Task 10: Fx particles **(judgment)**

**Decision expected:** one pool type covers Tractor's fx cubes, its tree gibs and Pig Pens' feathers.
- **Gibs:** `bounce: 0.35, friction: 0.65`.
- **Feathers:** `shape: 'quad'` with drag, lying flat once landed. Their sideways sine flutter is dropped (a field note if Pig Pens wants it back).
- **Spins:** they start from the slot index (golden angle), so the kit has no randomness (U-6).
- **Gravity and drag:** a pool has defaults, and `emit` may override both per particle (Tractor's dust floats with negative gravity).
- **Ground (CI-14):** `floor(x, z)` is sampled once at emit, like Tractor's `gy = groundY(x, z)`.

**Tractor mapping (CI-14, settled here; 3l adopts it instead of keeping its own motion):** `createParticles({ max: 1200, gravity: 9.8, drag: 0.5, floor: groundY, material })`; Tractor's `emit(x, y, z, vx, vy, vz, size, life, color, g, drag)` becomes `emit(x, y, z, vx, vy, vz, life, size, color, g, drag)` (life and size swap places); `color === null` keeps `particles.color`, as Tractor's `col`. A landed cube rests at `floor + size / 2` (Tractor: `gy + 0.03`), a visual-only difference for the 3l playtest list.

The reviewer checks that no per-emit or per-frame allocation exists and that uploads are range-limited (Tractor's B-4).

**Files:**
- Create: `src/kits/fx/view.js` (particles part), `test/kits/fx-particles.test.mjs`

**Interfaces:**
- Produces: `createParticles({ max = 1200, shape = 'cube' | 'quad', geometry?, material?, gravity = 9.8, drag = 0.5, floor = null | ((x, z) => y), bounce = 0, friction = 1 })` → `{ emit(x, y, z, vx, vy, vz, life, size, color, g?, drag?) → slot, update(dt), mesh, color: THREE.Color, live }`.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/fx-particles.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createParticles } from '../../src/kits/fx/view.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const pose = (fx, i) => { fx.mesh.getMatrixAt(i, M); M.decompose(P, Q, S); return { p: P, s: S }; };

test('emit then update integrates gravity, drag and position into the instance matrix', () => {
  const fx = createParticles({ max: 8, gravity: 10, drag: 0.5 });
  assert.equal(fx.emit(1, 2, 3, 4, 5, 6, 2, 0.5, '#ff0000'), 0);
  assert.equal(fx.mesh.count, 1); assert.equal(fx.live, 1);
  fx.update(0.1);                                   // vy 4; drag k 0.95: vx 3.8, vz 5.7
  const { p, s } = pose(fx, 0);
  near(p.x, 1.38, 1e-6); near(p.y, 2.4, 1e-6); near(p.z, 3.57, 1e-6); near(s.x, 0.5, 1e-6);
  const c = new THREE.Color(); fx.mesh.getColorAt(0, c); assert.deepEqual([c.r, c.g, c.b], [1, 0, 0]);
});

test('the pool is a ring: the oldest slot is reused once max is reached', () => {
  const fx = createParticles({ max: 3 });
  for (let k = 0; k < 4; k++) assert.equal(fx.emit(k, 0, 0, 0, 0, 0, 1, 1, null), k % 3);
  assert.equal(fx.mesh.count, 3); assert.equal(fx.live, 3);
});

test('particles shrink over the last half of life, collapse when expired, and an empty pool draws nothing', () => {
  const fx = createParticles({ max: 4, gravity: 0 });
  fx.emit(0, 0, 0, 0, 0, 0, 0.25, 1, null); fx.emit(0, 0, 0, 0, 0, 0, 1, 1, null);
  fx.update(0.125); near(pose(fx, 0).s.x, 1, 1e-6);
  fx.update(0.0625); near(pose(fx, 0).s.x, 0.5, 1e-6);    // 0.0625 of 0.25 left
  fx.update(0.1);
  fx.mesh.getMatrixAt(0, M); assert.deepEqual([M.elements[0], M.elements[5], M.elements[10]], [0, 0, 0]);
  assert.equal(fx.live, 1); assert.equal(fx.mesh.count, 2);
  fx.update(1);
  assert.equal(fx.live, 0); assert.equal(fx.mesh.count, 0);
});

test('floor and bounce: a gib bounces off the ground, then lands and stays on it', () => {
  const fx = createParticles({ max: 2, floor: () => 1, bounce: 0.35, friction: 0.65, drag: 0 });
  fx.emit(0, 3, 0, 2, 0, 0, 10, 0.2, null);
  let up = false, prev = 3;
  for (let k = 0; k < 200; k++) {
    fx.update(1 / 60);
    const y = pose(fx, 0).p.y;
    assert.ok(y >= Math.fround(1.1) - 1e-6, `below the floor at ${k}: ${y}`);
    if (y > prev + 1e-9) up = true;
    prev = y;
  }
  assert.ok(up, 'never bounced'); near(prev, 1.1, 1e-6);
});

test("'quad' particles lie flat once landed", () => {
  const fx = createParticles({ max: 1, shape: 'quad', floor: () => 0 });
  fx.emit(0, 0.5, 0, 0, 0, 0, 30, 0.1, null);
  for (let k = 0; k < 60; k++) fx.update(1 / 60);
  fx.mesh.getMatrixAt(0, M);
  near(new THREE.Vector3(0, 0, 1).transformDirection(M).y, 1, 1e-6);
});

test('a null colour keeps the shared colour; uploads cover only the rows written', () => {
  const fx = createParticles({ max: 10 });
  fx.color.setRGB(0, 1, 0);
  for (let k = 0; k < 3; k++) fx.emit(0, 0, 0, 0, 0, 0, 1, 1, null);
  fx.update(0.01);
  const c = new THREE.Color(); fx.mesh.getColorAt(2, c); assert.deepEqual([c.r, c.g, c.b], [0, 1, 0]);
  assert.deepEqual(fx.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  assert.deepEqual(fx.mesh.instanceColor.updateRanges, [{ start: 0, count: 9 }]);
});

test('emit overrides gravity and drag per particle (Tractor dust: g < 0 floats up) (CI-14)', () => {
  const fx = createParticles({ max: 2, gravity: 10, drag: 0 });
  fx.emit(0, 0, 0, 1, 0, 0, 5, 1, null, -2, 1); fx.emit(0, 0, 0, 1, 0, 0, 5, 1, null);
  fx.update(0.5);                                   // 0: vy +1, vx × 0.5; 1: the pool's g 10 and drag 0
  near(pose(fx, 0).p.y, 0.5, 1e-6); near(pose(fx, 0).p.x, 0.25, 1e-6);
  near(pose(fx, 1).p.y, -2.5, 1e-6); near(pose(fx, 1).p.x, 0.5, 1e-6);
});

test('createParticles refuses a bad shape or size', () => {
  assert.throws(() => createParticles({ shape: 'cone' }), /fx: shape must be 'cube' or 'quad' \(got cone\)/);
  assert.throws(() => createParticles({ max: 0 }), /fx: max must be a positive integer \(got 0\)/);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/fx-particles.test.mjs`. Expected: fails at import with `Cannot find module '…/src/kits/fx/view.js'`.

- [ ] **Step 3: Implement**

Create `src/kits/fx/view.js`:

```js
// kit-fx (view half): pooled particles and ground marks, one InstancedMesh each (Tractor's fx.js and gibs.js, Pig Pens'
// feathers). State lives in typed arrays; nothing is allocated per emit or per frame, and uploads cover only the rows
// written. No randomness here (U-6): callers pass velocities drawn from engine.rng('fx'); start spins come from the slot.
import * as THREE from 'three';

const fail = m => { throw new Error(`fx: ${m}`); };
const GOLDEN = 2.399963229728653;
const UP = new THREE.Vector3(0, 1, 0), TUMBLE = new THREE.Vector3(0.3, 1, 0.2).normalize();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const F = 13; // per slot: x y z vx vy vz life max size spin g drag floorY

export function createParticles({ max = 1200, shape = 'cube', geometry = null, material = null, gravity = 9.8, drag = 0.5,
  floor = null, bounce = 0, friction = 1 } = {}) {
  if (!Number.isInteger(max) || max < 1) fail(`max must be a positive integer (got ${max})`);
  if (shape !== 'cube' && shape !== 'quad') fail(`shape must be 'cube' or 'quad' (got ${shape})`);
  const geo = geometry ?? (shape === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.PlaneGeometry(1, 1));
  const flat = shape === 'quad';
  const mesh = new THREE.InstancedMesh(geo, material ?? new THREE.MeshLambertMaterial(), max);
  mesh.name = 'fx-particles'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const color = new THREE.Color(1, 1, 1);
  mesh.setColorAt(0, color); // makes instanceColor
  mesh.count = 0;
  const S = new Float64Array(max * F), live = new Uint8Array(max), landed = new Uint8Array(max);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let next = 0, high = 0, nLive = 0, cLo = max, cHi = -1;

  function emit(x, y, z, vx, vy, vz, life, size, c, g = gravity, d = drag) {
    const i = next, o = i * F;
    next = (next + 1) % max;
    if (i >= high) high = i + 1;
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = vx; S[o + 4] = vy; S[o + 5] = vz;
    S[o + 6] = life; S[o + 7] = life; S[o + 8] = size; S[o + 9] = (i * GOLDEN) % (2 * Math.PI); S[o + 10] = g; S[o + 11] = d;
    S[o + 12] = floor ? floor(x, z) : -Infinity;
    if (!live[i]) nLive++;
    live[i] = 1; landed[i] = 0;
    if (c !== null && c !== undefined) color.set(c);
    mesh.setColorAt(i, color);
    if (i < cLo) cLo = i;
    if (i > cHi) cHi = i;
    mesh.count = high;
    return i;
  }

  function update(dt) {
    if (high === 0) return;
    let lo = max, hi = -1;
    for (let i = 0; i < high; i++) {
      if (!live[i]) continue;
      const o = i * F;
      if (i < lo) lo = i;
      hi = i;
      S[o + 6] -= dt;
      if (S[o + 6] <= 0) { live[i] = 0; nLive--; mesh.setMatrixAt(i, ZERO); continue; }
      if (!landed[i]) S[o + 4] -= S[o + 10] * dt;
      const k = Math.max(0, 1 - S[o + 11] * dt);
      S[o + 3] *= k; S[o + 5] *= k;
      S[o] += S[o + 3] * dt; S[o + 2] += S[o + 5] * dt;
      if (!landed[i]) {
        S[o + 1] += S[o + 4] * dt;
        const rest = S[o + 12] + (flat ? 0.02 : S[o + 8] * 0.5);
        if (S[o + 1] <= rest) {
          S[o + 1] = rest;
          if (S[o + 4] < 0) { S[o + 4] = -S[o + 4] * bounce; S[o + 3] *= friction; S[o + 5] *= friction; }
          if (S[o + 4] < 1) { S[o + 4] = 0; landed[i] = 1; }
        }
      }
      if (!(flat && landed[i])) S[o + 9] += dt * 4;
      const sc = S[o + 8] * Math.min(1, (S[o + 6] / S[o + 7]) * 2);
      if (flat && landed[i]) q.multiplyQuaternions(qa.setFromAxisAngle(UP, S[o + 9]), FLAT);
      else q.setFromAxisAngle(TUMBLE, S[o + 9]);
      mesh.setMatrixAt(i, m4.compose(v.set(S[o], S[o + 1], S[o + 2]), q, s.set(sc, sc, sc)));
    }
    if (hi >= 0) { const a = mesh.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(lo * 16, (hi - lo + 1) * 16); a.needsUpdate = true; }
    if (cHi >= 0) { const c = mesh.instanceColor; c.clearUpdateRanges(); c.addUpdateRange(cLo * 3, (cHi - cLo + 1) * 3); c.needsUpdate = true; cLo = max; cHi = -1; }
    if (nLive === 0) { high = 0; next = 0; mesh.count = 0; }
  }

  return { emit, update, mesh, color, get live() { return nLive; } };
}
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/fx-particles.test.mjs test/kits/purity.test.mjs`. Expected: 8 + 3 pass.

- [ ] **Step 5: Commit**

```
git add src/kits/fx/view.js test/kits/fx-particles.test.mjs
git commit -m "feat(kits): fx particle pool for cubes, quads and gibs with range-limited uploads"
```

---

## Task 11: Fx ground marks

**Files:**
- Modify: `src/kits/fx/view.js` (append `createMarks`)
- Create: `test/kits/fx-marks.test.mjs`

**Interfaces:**
- Produces: `createMarks({ max = 400, width = 0.45, length = 0.9, material?, heightAt = null | ((x, z) => y), lift = 0.06 })` → `{ add(x, z, nx, nz, alpha = 1) → slot | -1, update(dt), mesh }`. `(nx, nz)` is the direction along the mark (any length). `alpha` in 0..1 narrows it to between half and full width. Marks do not fade (Tractor parity).
- **Tractor mapping (CI-14):** `createMarks({ max: 400, width: 0.45, length: 0.9, heightAt: groundY, lift: 0.06, material: <today's MeshBasicMaterial> })`; `tireMark(x, z, yaw, alpha)` → `marks.add(x, z, Math.sin(yaw), Math.cos(yaw), alpha)`. `heightAt` puts marks on the hilly farm, so 3l drops its own marks mesh.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/fx-marks.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMarks } from '../../src/kits/fx/view.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const M = new THREE.Matrix4();
const at = (mk, i, x, y, z) => { mk.mesh.getMatrixAt(i, M); return new THREE.Vector3(x, y, z).applyMatrix4(M); };

test('add() lays a mark along (nx, nz): length along it, width across, flat on the ground', () => {
  const mk = createMarks({ max: 4, width: 0.5, length: 1 });
  assert.equal(mk.add(2, 3, 3, 4, 1), 0);                         // heading (0.6, 0.8)
  const tip = at(mk, 0, 0, 0, 0.5), side = at(mk, 0, 0.5, 0, 0);
  near(tip.x, 2.3, 1e-6); near(tip.y, 0.06, 1e-6); near(tip.z, 3.4, 1e-6);
  near(side.x, 2.2, 1e-6); near(side.z, 2.85, 1e-6);              // across = (0.8, -0.6) × width 0.5 × 0.5
  near(new THREE.Vector3(0, 1, 0).transformDirection(M).y, 1, 1e-6);
  const box = mk.mesh.geometry.boundingBox ?? (mk.mesh.geometry.computeBoundingBox(), mk.mesh.geometry.boundingBox);
  assert.equal(box.max.y - box.min.y, 0);                         // a quad lying in xz
  assert.equal(mk.mesh.count, 1);
});

test('alpha narrows the mark; heightAt and lift set its height', () => {
  const mk = createMarks({ max: 2, width: 0.5, heightAt: (x, z) => x + z, lift: 0.1 });
  mk.add(1, 2, 0, 1, 0);                                          // alpha 0: half width, heading +z
  const side = at(mk, 0, 1, 0, 0);
  near(side.x, 1.25, 1e-6); near(side.y, 3.1, 1e-6); near(side.z, 2, 1e-6);
});

test('marks form a ring; update uploads only the rows written; a zero direction is ignored', () => {
  const mk = createMarks({ max: 3 });
  for (let k = 0; k < 4; k++) mk.add(k, 0, 1, 0);
  assert.equal(mk.mesh.count, 3);
  mk.update(0);
  assert.deepEqual(mk.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  mk.add(9, 9, 0, 1);                                             // slot 1
  mk.update(0);
  assert.deepEqual(mk.mesh.instanceMatrix.updateRanges, [{ start: 16, count: 16 }]);
  assert.equal(mk.add(0, 0, 0, 0), -1); assert.equal(mk.mesh.count, 3);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/fx-marks.test.mjs`. Expected: `SyntaxError: The requested module '../../src/kits/fx/view.js' does not provide an export named 'createMarks'`.

- [ ] **Step 3: Implement**

Append to `src/kits/fx/view.js`:

```js
// Ground marks (tyre tracks): a ring of flat quads on one InstancedMesh. add() writes the instance matrix directly
// (no trig, no allocation): across = (nz, 0, -nx) × width, up, along = (nx, 0, nz) × length.
export function createMarks({ max = 400, width = 0.45, length = 0.9, material = null, heightAt = null, lift = 0.06 } = {}) {
  if (!Number.isInteger(max) || max < 1) fail(`max must be a positive integer (got ${max})`);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = material ?? new THREE.MeshBasicMaterial({ color: '#5a4630', transparent: true, opacity: 0.4, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'fx-marks'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
  const a = mesh.instanceMatrix.array;
  let next = 0, lo = max, hi = -1;

  function add(x, z, nx, nz, alpha = 1) {
    const l = Math.sqrt(nx * nx + nz * nz);
    if (!(l > 0)) return -1;
    const fx = nx / l, fz = nz / l, al = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha, w = width * (0.5 + 0.5 * al);
    const y = (heightAt ? heightAt(x, z) : 0) + lift, i = next, o = i * 16;
    next = (next + 1) % max;
    a[o] = fz * w; a[o + 1] = 0; a[o + 2] = -fx * w; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = fx * length; a[o + 9] = 0; a[o + 10] = fz * length; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    if (mesh.count < max) mesh.count++;
    if (i < lo) lo = i;
    if (i > hi) hi = i;
    return i;
  }

  function update() {
    if (hi < 0) return;
    const m = mesh.instanceMatrix;
    m.clearUpdateRanges(); m.addUpdateRange(lo * 16, (hi - lo + 1) * 16); m.needsUpdate = true;
    lo = max; hi = -1;
  }

  return { add, update, mesh };
}
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/fx-marks.test.mjs test/kits/fx-particles.test.mjs test/kits/purity.test.mjs`. Expected: 3 + 8 + 3 pass.

- [ ] **Step 5: Commit**

```
git add src/kits/fx/view.js test/kits/fx-marks.test.mjs
git commit -m "feat(kits): fx ground marks ring with direct matrix writes"
```

---

## Task 12: Coverage view half

**Files:**
- Create: `src/kits/coverage/view.js`, `test/kits/coverage-view.test.mjs`

**Interfaces:**
- Consumes:
  - `sync.on(match, { create(e, obj, view), frame(e, obj, alpha, view), remove(e, obj) }) → off` (3g §4.9);
  - `compiler.coverage(material, { uCoverage }?) → { material, uniforms: { uCoverage: Vector4 } }` (3f §4.8, with an optional shared vector). A compiled material with a `coverage` block carries `defines.COVERAGE` (M-11).
- Produces: `coverageView(sync, compiler, { match = e => e.coverage != null })` → `{ off(), size }`.
  - Each entity has **one** `uCoverage` vector, shared by all its COVERAGE clones. The first clone makes it, and the rest receive it through `{ uCoverage }`.
  - The vector holds `(dirt, rust, snow, mud)` from `e.coverage`, written once per frame without allocation.

> **Instanced meshes (3f fact).** Instanced draws use the compiler's shared `COVERAGE_INSTANCED` variant, which reads a per-instance `instanceCoverage` attribute. The instancing owner (3g `createInstances`/view sync, or the game) writes that attribute from the same `e.coverage` levels that this kit's sim half maintains. `coverageView` skips instanced meshes, and an entity whose `create` gets no `Object3D` is skipped.

- [ ] **Step 1: Write the failing tests**

Create `test/kits/coverage-view.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coverageView } from '../../src/kits/coverage/view.js';

const fakeSync = () => { const s = { h: null, match: null, offs: 0, on(match, h) { s.match = match; s.h = h; return () => { s.offs++; }; } }; return s; };
const fakeCompiler = () => { const c = { made: [], coverage(m, o) { const r = { material: m.clone(), uniforms: { uCoverage: o?.uCoverage ?? new THREE.Vector4() } }; c.made.push(r); return r; } }; return c; };
const covMat = () => { const m = new THREE.MeshLambertMaterial(); m.defines = { COVERAGE: '' }; return m; };
function model() {
  const g = new THREE.Group(), a = new THREE.Mesh(new THREE.BoxGeometry(), covMat()), b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  const a2 = new THREE.Mesh(new THREE.BoxGeometry(), covMat()), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), covMat(), 2);
  g.add(a, b, a2, inst);
  return { g, a, b, a2, inst, baseA: a.material, baseInst: inst.material };
}
const v4 = u => [u.x, u.y, u.z, u.w];

test('create clones each COVERAGE mesh, sharing one uCoverage per entity, and writes (dirt, rust, snow, mud)', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc), m = model(), e = { id: 3, coverage: { dirt: 0.25, mud: 0.5 } };
  sync.h.create(e, m.g);
  assert.equal(mc.made.length, 2);
  assert.equal(m.a.material, mc.made[0].material); assert.notEqual(m.a.material, m.baseA);
  assert.equal(m.a2.material, mc.made[1].material);
  assert.equal(mc.made[1].uniforms.uCoverage, mc.made[0].uniforms.uCoverage); // one vector per entity
  assert.equal(m.inst.material, m.baseInst);         // instanced meshes use COVERAGE_INSTANCED, written by their owner
  assert.deepEqual(v4(mc.made[0].uniforms.uCoverage), [0.25, 0, 0, 0.5]);
  assert.equal(cv.size, 1);
});

test('frame rewrites the levels in place, making nothing new', () => {
  const sync = fakeSync(), mc = fakeCompiler(), m = model(), e = { id: 3, coverage: { dirt: 0, snow: 0 } };
  coverageView(sync, mc);
  sync.h.create(e, m.g);
  const u = mc.made[0].uniforms.uCoverage;
  e.coverage.dirt = 0.75; e.coverage.snow = 0.125;
  sync.h.frame(e, m.g, 0.5);
  assert.equal(mc.made[0].uniforms.uCoverage, u); assert.deepEqual(v4(u), [0.75, 0, 0.125, 0]); assert.equal(mc.made.length, 2);
});

test('remove restores the shared material and disposes the clone', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc), m = model(), e = { id: 4, coverage: { dirt: 1 } };
  sync.h.create(e, m.g);
  let disposed = 0; mc.made[0].material.addEventListener('dispose', () => { disposed++; });
  sync.h.remove(e, m.g);
  assert.equal(m.a.material, m.baseA); assert.equal(disposed, 1); assert.equal(cv.size, 0);
});

test('the default match takes entities with coverage; an entity without an object is skipped; off unsubscribes', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc);
  assert.equal(sync.match({ coverage: { dirt: 0 } }), true); assert.equal(sync.match({ id: 1 }), false);
  sync.h.create({ id: 9, coverage: { dirt: 0 } }, undefined);
  sync.h.frame({ id: 9, coverage: { dirt: 0.5 } }, undefined, 0);
  assert.equal(cv.size, 0);
  cv.off(); assert.equal(sync.offs, 1);
});
```

- [ ] **Step 2: Run, expect FAIL**

`UNIT test/kits/coverage-view.test.mjs`. Expected: fails at import with `Cannot find module '…/src/kits/coverage/view.js'`.

- [ ] **Step 3: Implement**

Create `src/kits/coverage/view.js`:

```js
// kit-coverage (view half): feeds each covered entity's levels (dirt, rust, snow, mud) to one uCoverage vector per
// entity, shared by per-entity clones of every COVERAGE material in its object (compiler.coverage(m, { uCoverage }):
// same program). Instanced meshes are skipped: they use COVERAGE_INSTANCED and an `instanceCoverage` attribute that
// their instancing owner writes from the same e.coverage. frame() writes in place and allocates nothing.

export function coverageView(sync, compiler, { match = e => e.coverage != null } = {}) {
  const recs = new Map(); // entity id → { u, list: [{ mesh, base, material }] }
  const write = (e, r) => { const c = e.coverage; r.u.set(c.dirt ?? 0, c.rust ?? 0, c.snow ?? 0, c.mud ?? 0); };
  const release = r => { for (const x of r.list) { x.mesh.material = x.base; x.material.dispose(); } };
  const offSync = sync.on(match, {
    create(e, obj) {
      if (!obj) return;
      const r = { u: null, list: [] };
      obj.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh) return;
        const m = o.material;
        if (!m || Array.isArray(m) || !m.defines || !('COVERAGE' in m.defines)) return;
        const c = compiler.coverage(m, r.u ? { uCoverage: r.u } : undefined);
        r.u ??= c.uniforms.uCoverage;
        r.list.push({ mesh: o, base: m, material: c.material });
        o.material = c.material;
      });
      if (!r.u) return; // nothing to cover
      recs.set(e.id, r);
      write(e, r);
    },
    frame(e) {
      const r = recs.get(e.id);
      if (r) write(e, r);
    },
    remove(e) {
      const r = recs.get(e.id);
      if (!r) return;
      release(r);
      recs.delete(e.id);
    },
  });
  return {
    off() { offSync(); for (const r of recs.values()) release(r); recs.clear(); },
    get size() { return recs.size; },
  };
}
```

- [ ] **Step 4: Run, expect PASS**

`UNIT test/kits/coverage-view.test.mjs test/kits/purity.test.mjs`. Expected: 4 + 3 pass.

- [ ] **Step 5: Commit**

```
git add src/kits/coverage/view.js test/kits/coverage-view.test.mjs
git commit -m "feat(kits): coverage view feeds uCoverage per entity on compiler clones"
```

---

## Task 13: Full run, notes, hand-off

**Files:**
- Modify: `docs/plans/2026-10-13-phase-3h-kits-notes.md`

- [ ] **Step 1: Run every kit suite**

`UNIT test/kits/`. Expected: 71 tests pass across 13 files:

| File | Tests |
|---|---|
| terrain | 9 |
| terrain-rapier | 3 |
| purity | 3 |
| vehicle | 8 |
| vehicle-material | 4 |
| vehicle-lifecycle | 4 |
| vehicle-parts | 3 |
| coverage | 7 |
| kits-sim | 4 |
| terrain-view | 11 |
| fx-particles | 8 |
| fx-marks | 3 |
| coverage-view | 4 |

- [ ] **Step 2: Run the whole engine suite**

`UNIT test/`. Expected: all pass. That is the 0.8.0 count plus the 71 above, with no other file changed. Record both numbers in the notes.

- [ ] **Step 3: Check ownership**

Run `git diff --name-only phase-3...HEAD`. Expected: only `src/kits/**`, `test/kits/**` and the notes file. Anything else is reverted.

- [ ] **Step 4: Complete the notes**

Fill in the notes file:
- the Progress table (task, commit, tests);
- how each Contract issue (C1–C7) was resolved at merge time;
- the integrator requests (R1–R5);
- the field note candidates, adding any found while implementing.

Add a "For the game plans" section:
- **3j (Rally):** `createTerrain` with `blend` for its section blends and `material: 'rally-ground'` for the heightfield collider (3j #4), and `createTerrainMesh` replacing its own chunked terrain with Rally's numbers (3j #9; the Task 9 mapping table: `chunkCells: 64`, `lods: [1, 2, 4]`, `lodFar: [150, 400]`, `hysteresis: 12`, `visFar: 760`, `evict: [300, 720]`, `skirt: 2`, `budgetMs: 3`, `drop`, `colorAt(x, z, out, ny)`, `attributes.uv`, its `MeshStandardMaterial` as `material`).
- **3k (Pig Pens):** `createVehicle` with `forward: 'x'` (axle +z, Rapier's defaults), plus its tractor tunables; the system is `VEHICLE_SYSTEM` (`'lh.kit.vehicle'`), not `lh.vehicle.update` (3k C4; Task 4's stable names). Feathers become `createParticles({ shape: 'quad' })`.
- **3l (Tractor):**
  - transpose its x-major grid to row-major for `createTerrain`, and pass `fixInternalEdges: true` (CI-11);
  - trains are three vehicles in creation order, with slide help and the jackknife limit as a system `after: [VEHICLE_SYSTEM], before: ['lh.physics.step']`;
  - `rayGroups: { member: [...], filter: ['ground', 'static'] }` as today; `member: []` would also mean every group (ray filter only);
  - dirt per metre (`dirtRate`): ruling, 3l picks rates equal to today's at normal speed, pins them with a test, playtest item;
  - fx through `createParticles` (per-emit `g`/`drag`, `floor: groundY`) and `createMarks` (`heightAt: groundY`) per the Task 10 and 11 mappings (CI-14).

- [ ] **Step 5: Commit**

```
git add docs/plans/2026-10-13-phase-3h-kits-notes.md
git commit -m "docs(kits): 3h notes, test counts and hand-off to the game plans"
```

---

## Done when

- `UNIT test/kits/` passes: 71 tests in 13 files, with the mutation proofs in Tasks 2, 3, 4, 5, 6b, 7, 8 and 9 shown red, then green.
- `UNIT test/` (the whole engine suite) passes in the worktree.
- No file outside `src/kits/**`, `test/kits/**` and the notes file changed.
- The notes file lists the contract-issue resolutions, the integrator requests and the field note candidates.
- The integrator merges `phase-3-kits` with `--no-ff` in Wave B, and the engine becomes **0.9.0** (with 3e, 3f, 3g). The `lion-hawk/kits/*` exports (R1) land in the same merge.

## Notes

Notes file: `docs/plans/2026-10-13-phase-3h-kits-notes.md` (created in Task 1). It has a "Field note candidates" section, which the integrator numbers from #110.

---

## Contract issues

All accepted (contract issues, "## 3h kits"); C1–C3 are 3c's (accepted there). The rulings that change this plan are folded into the tasks and noted per item below.

- **C1. `world.engine`.** `createVehicle(world, e, …)` receives only the World but must register its update system. Decision: the kit reads `world.engine`, the engine passed to `createWorld(engine, …)`, and throws `vehicle: the World has no engine (world.engine)…` without it. 3c needs to expose it, read-only.
- **C2. `world.heightfield` ignores `fixInternalEdges`.** §4.4 lists `{ nx, nz, cell, x0, z0, heights, material, groups }`, but Tractor's heightfield sets `FIX_INTERNAL_EDGES`, which `heightfieldDesc` supports (§4.5). Decision: `createTerrain` passes `fixInternalEdges` in the desc. 3c forwards it (accepted; CI-11). Task 1 tests that the kit passes it through.
- **C3. Free order.** The vehicle's `world.own` callback calls `removeVehicleController` on the Rapier world that made it. On `despawn`, `clear()` and scene dispose, 3c must run `own` callbacks before it frees that Rapier world (or skip them on dispose: the kit keys its list by World, so a disposed World's vehicles are simply never stepped again).
- **C4. Terrain details §4.10 leaves open.** Decisions:
  - `materials` as a `Uint8Array` holds one registry index per **height sample** (nx·nz, nearest-sample lookup), not per cell.
  - Optional `material` sets the collider material (default: the most common sample, or the function at the centre), and `groups` overrides the default `{ member: ['ground'] }` (filter omitted = every group, 3c). Rally passes `material: 'rally-ground'` (3j #4); Task 1 tests the pass-through.
  - The terrain object adds `grid`, which the view half reads.
  - The registry id for an index comes from `ids` + `index(id)`, not from `byIndex`, whose return type §4.2 leaves open.
- **C5. `coverageKit(engine, { washes })` has no ground lookup.** Decisions:
  - the options gain `materialAt` (required), `layer` (ground id → layer, default `coverageLayer`) and `washTime` (1.5 s, Tractor's);
  - a `washes` entry may be `{ at(x, z) → boolean, washTime }` beside a plain function, with its own time (3l Integrator request 5: Tractor's yard wash at `DIRT.washTime / WASH_RATE` = 0.5 s, sprinklers at the kit-wide 1.5 s); the first wash that holds decides;
  - the first argument may be the engine or a scene ctx (anything with `.system`; a ctx scopes the kit to the scene);
  - entities may set `coverageMaterial` for what they accept;
  - it returns `{ off }`.
- **C6. Vehicle additions.**
  - New options: `forward: 'x' | 'z'` (Kenney models face +z); `tyre` (default `'rubber'`); `grip` (default `false`, so pair friction scales slip and side stiffness only when asked, and Tractor and Pig Pens can stay bit-exact).
  - `rayGroups.member: []` means every group, and omitted `rayGroups` means no group filter. **3c ruling:** this reading is for the wheel-ray filter only. Colliders (chassis, terrain, everything spawned) follow 3c: an omitted `member`/`filter` means every group and an explicit `member: []` means none. `rayMask` passes an omitted or empty `member` to `world.groups.mask` as omitted, and an omitted ray `filter` means every group.
  - **Stable names (3k C4):** `VEHICLE_SYSTEM = 'lh.kit.vehicle'`, the chassis requirements and the axes are fixed in Task 4's Interfaces; 3k and 3l match them.
  - Wheel state adds `front`, `radius`, `load`, `friction` and `pair`. The car adds `entity`, `removed`, `tyre` and `update`.
  - **Wheel part poses (3g request 7, user ruling 2026-10-14).** A wheel spec may name `part`; the kit then writes the hub and steer/roll rotation into 3c's `e.partXf[part]` every step (Task 6b), and 3g's view sync draws the wheel. Pig Pens and Tractor drop their own wheel-turning hook code.
  - Sockets are read as `p: [x, y, z]` (or `{ x, y, z }`).
- **C7. View option additions (all optional, additive).**
  - `createParticles`: `gravity`, `drag`, `floor`, `bounce`, `friction`, `geometry`; `emit`'s trailing `g`, `drag`; `particles.color`; `live`. These settle Tractor's CI-14 (per-particle gravity, drag and ground height).
  - `createMarks`: `length`, `heightAt`, `lift`. `heightAt` settles CI-14's hilly-farm marks.
  - `createTerrainMesh`: `chunkCells`, `lodFar`, `hysteresis`, `skirt`, `visFar`, `evict`, `drop`, `attributes`, `budgetMs`, `moveEps`, `now` (test clock); `colorAt`'s fourth argument `ny`; `material` may be a three.js material; it returns `dispose` and `stats` (`chunks`, `builds`, `buildMs`, `lastUpdateMs`, `pending`).
  - `coverageView`: a third `{ match }` argument; it returns `{ off, size }`.
  - `createTerrainMesh` is sized to host Rally's terrain (3 LODs, hysteresis, budget, eviction, `drop`, `colorAt`), so Rally can adopt the kit in 3j: this is not deferred.
  - The coverage view shares one `uCoverage` per entity through 3f's `mc.coverage(m, { uCoverage })`. Instanced coverage (`COVERAGE_INSTANCED`, `instanceCoverage`) is written by the instancing owner from `e.coverage`; the kit exposes the levels and does not write the attribute.

## Integrator requests

1. **R1:** `package.json` `exports`: add `"./kits/*/view": "./src/kits/*/view.js"` and `"./kits/*": "./src/kits/*/sim.js"`, per overview §3.2. Add a package test that `lion-hawk/kits/terrain`, `lion-hawk/kits/terrain/view`, `lion-hawk/kits/vehicle`, `lion-hawk/kits/coverage`, `lion-hawk/kits/coverage/view` and `lion-hawk/kits/fx/view` resolve to those files.
2. **R2:** `test/purity.test.mjs` ("engine sim sources are pure"): add the `src/kits/*/sim.js` files to the scanned roots. `test/kits/purity.test.mjs` already guards them, but the central list should name every sim root (constraint 1).
3. **R3 (to 3c, the same as C1–C3; accepted by 3c):** expose `world.engine`; forward `fixInternalEdges` from `world.heightfield` to `heightfieldDesc`; run `world.own` callbacks before freeing the Rapier world on `despawn`, `clear()` and dispose.
4. **R4:** CHANGELOG 0.9.0 lines:
   - kits: terrain (`createTerrain`, `createTerrainMesh`), vehicle (`createVehicle`), coverage (`coverageKit`, `coverageView`), fx (`createParticles`, `createMarks`);
   - M-10 `materialAt`;
   - D4 pair friction on vehicle wheels (opt-in `grip`).
5. **R5:** field notes: number the candidates in `docs/plans/2026-10-13-phase-3h-kits-notes.md` from #110.

## Needs the user

Nothing blocks this plan. Tractor's dirt moving from per second to per metre (`dirtRate`) is ruled (3l matches today's rate at normal speed, pins it with a test); how a slow tractor now gets dirty is on 3l's playtest list.
