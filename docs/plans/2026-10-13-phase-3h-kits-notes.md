# Phase 3h kits: notes

Plan: `docs/plans/2026-10-13-phase-3h-kits.md`. Branch `phase-3-kits`, worktree `lion-hawk-engine-3h`.

## Progress

| Task | Commit | Tests |
|---|---|---|
| 1 terrain sim half | 9f2762e | terrain 9 |
| 2 terrain vs Rapier | 49a2174 | terrain-rapier 3 (mutation `cu + cv < 1` red, then green) |
| 3 purity guard | bb695e8 | purity 3 (two mutations red, then green) |
| 4 vehicle core | a6a5fd4 | vehicle 8 (three mutations red, then green) |
| 5 material and grip | 4fbe326 | vehicle-material 4 (two mutations) |
| 6 lifecycle | 95b4ec4 | vehicle-lifecycle 4 |
| 6b part poses | afb3476, c46598f | vehicle-parts 3 (roll/steer order mutation red, then green) |
| 7 coverage kit | 6cf2f70 | coverage 7 (teleport mutation) |
| 8 sim kits determinism | eed470b | kits-sim 4 (determinism and allocation mutations) |
| 9 terrain view | 0cf76af | terrain-view 11 (skirt winding mutation) |
| 10 fx particles | e791351 | fx-particles 8 |
| 11 fx marks | 3102bbe | fx-marks 3 |
| 12 coverage view | cfe6372 | coverage-view 4 |
| 13 notes and hand-off | this commit | none |

Totals (run in the worktree, output in `/tmp/claude-1000/lion-hawk-phase3/3h/`):

- `UNIT test/kits/`: 71 tests pass in 13 files, 0 fail.
- `UNIT test/`: 813 tests, 802 pass, 11 skipped, 0 fail. The 0.8.0 baseline was 742 tests (731 pass, 11 skipped); the 71 kit tests bring it to 813.
- Ownership: `git diff --name-only phase-3...HEAD` lists only `src/kits/**`, `test/kits/**` and this notes file.
- Removed or renamed tests: none (only new files).

## Decisions

- materials grid is one registry index per height sample (nx·nz), looked up by nearest sample.
- grip defaults to false; pair friction scales slip/side only when a game opts in.
- rayGroups.member [] means every group (a ray with no membership hits nothing in Rapier). Ray filter only:
  colliders follow 3c (omitted member/filter = every group; explicit member [] = none).
- Coverage accrues dirtRate × metres from the pool's prev → curr pose (place() counts nothing).
- VEHICLE_SYSTEM is 'lh.kit.vehicle' (3k/3l match it via the exported constant); forward 'x' = axle +z, forward 'z' = axle -x.

Controller rulings (from the ledger):

- Batch Tasks 1-3, 5-6b, 7-8 and 10-12 into single implementer dispatches (throughput; full code in the plan). Cost if wrong: a larger review surface per batch.
- No real 3f is needed; every view task uses the plan's fakes. Cost if wrong: the view halves mismatch 3f at merge, caught by the integrator.
- Task 2 ground-group test uses `flatTerrain` cell 2, not 1: with cell 1 and n 21 the grid spans -21..-1, so balls at z = 0 are off-terrain (plan typo, assertions unchanged).
- Task 6b test drives the steered front wheels (engine 600): as written the fronts had roll near 0 and the steer/roll-order mutation passed, so the proof could not fail. Test is stricter, kit unchanged.
- `kitGame` MATERIALS coat is `coverage { dirt 0.5, mud 0 }`: the registry merges coverage over steel's block, so the "no mud" assertion needs an explicit 0. Fixture only.
- `carGame` rear engine force 400 raised to 1200: at 400 the car slid back down the fixture slope and failed the drive-sanity x check. Fixture only, kit unchanged.
- Task 9 colorAt/drop test samples at `cam(40, 0)` (d 24), not `cam(30, 0)`: with the default hysteresis 12 the finer LOD holds until d 22, so d 14 stays LOD 0. The hysteresis rule is pinned elsewhere and Rally relies on it. Test only.
- fx-marks flatness test uses `near(..., 0, 1e-9)`, not `=== 0`: `PlaneGeometry.rotateX` leaves 6e-17 float noise.

Steer sign: verified by test. steer > 0 yaws counter-clockwise seen from above (a left turn), for both forward 'x' and 'z'. The documented sign stands; the kit never negates steer.

## Contract issues

Full text in the plan's "Contract issues". All accepted. Resolutions on this branch:

- **C1 `world.engine`:** satisfied by 3c at 0.8.0. `createVehicle` reads `world.engine` and throws without it.
- **C2 `fixInternalEdges`:** satisfied by 3c at 0.8.0 (`world.heightfield` forwards it). `createTerrain` passes it in the desc; Task 1 tests the pass-through.
- **C3 free order:** satisfied by 3c at 0.8.0. `world.own` callbacks run before Rapier frees; Task 6 tests despawn, clear and scene change (no issue found).
- **C4 terrain details:** as implemented. `materials` is one registry index per height sample (nearest lookup); `material` and `groups` pass through to the collider; the terrain object carries `grid`; ids come from `ids` + `index(id)`.
- **C5 coverage kit options:** as implemented. `materialAt` required, `layer`, `washTime` 1.5 s, `washes` entries may be `{ at, washTime }`, first holding wash decides, the first argument may be an engine or a scene ctx, `coverageMaterial` per entity, returns `{ off }`.
- **C6 vehicle additions:** as implemented. `forward`, `tyre`, `grip` (default false), `rayGroups.member []` = every group for the ray filter only, `VEHICLE_SYSTEM = 'lh.kit.vehicle'`, extra wheel and car state, wheel `part` poses through `partXf` (Task 6b), sockets as arrays or objects.
- **C7 view additions:** as implemented (particles, marks, terrain mesh and coverage view options). Terrain mesh hosts Rally's numbers (see "For the game plans").

Contract note: 3f is not on this branch. The terrain view and coverage view tests use fakes with the section 4.8 signatures (`compiler.get(id, { vertexColors })`, `compiler.coverage(m, { uCoverage })`). The integrator should run `test/kits/terrain-view.test.mjs` and `test/kits/coverage-view.test.mjs` against the real 3f after the Wave B merge.

## Integrator requests

| # | Request | Blocking |
|---|---|---|
| R1 | `package.json` exports `"./kits/*/view": "./src/kits/*/view.js"` and `"./kits/*": "./src/kits/*/sim.js"`. `VEHICLE_SYSTEM` MUST be importable from `lion-hawk/kits/vehicle` (3k needs it; `src/kits/vehicle/sim.js` exports it). Add a package test that `lion-hawk/kits/terrain`, `/terrain/view`, `/vehicle`, `/coverage`, `/coverage/view` and `/fx/view` resolve to those files. | Non-blocking for this branch; needed by the games at merge. |
| R2 | `test/purity.test.mjs`: add `src/kits/*/sim.js` to the scanned roots (`test/kits/purity.test.mjs` already guards them). | Non-blocking |
| R3 | 3c: `world.engine`, `fixInternalEdges` forwarding, `own` before free. Done at 0.8.0. | Non-blocking (satisfied) |
| R4 | CHANGELOG 0.9.0: kits (terrain, vehicle, coverage, fx), M-10 `materialAt`, D4 pair friction on vehicle wheels (opt-in `grip`). | Non-blocking |
| R5 | Number the field note candidates below from #110. | Non-blocking |
| R6 | Terrain view `dispose()` frees geometries only; the material belongs to the compiler or the game. Write the rule down. | Non-blocking |

## Deferred minors

- Tasks 1-3: `heightAt`/`materialAt` NaN inputs are unchecked; function-material ids are unvalidated; no 'ground' group means a silent all-groups collider; the purity view regex misses side-effect and dynamic imports.
- Task 4: the vehicle system updates only `engine.world`'s cars (no warning for other Worlds); `update()` overwrites direct controller friction sets; `ENGINES.add` happens before `engine.system`; no NaN checks on wheel specs; a dead ternary in `car.js:11`; an unused terrain in the vehicle test setup.
- Tasks 5-6b: `world.add` of `partXf` after `createVehicleController` could leak if it throws; `tHandle` assumes terrain `colliders[0]`; a removed car's `update()` is unguarded; the scene-change test does not assert the old controller was freed; the grip one-step lag is unpinned (determinism is covered by Task 8).
- Tasks 7-8: a `washes` null entry throws a raw TypeError (brief code); the `carGame` 1200 N force has no comment.
- Task 9: evict can dispose a geometry a hidden mesh still references (safe today); `dispose()` leaves `update()` callable and does not dispose the material (the owner's); edge normals are one-sided; test gaps (grid-past `drop`, Tractor `lods [2]`, `moveEps`, evict plus fallback); the fallback build may exceed `budgetMs` (intended).
- Housekeeping: a stray `git stash` entry (`stash@{0}`, "WIP on phase-3-kits: c46598f") was left by an implementer. It touches no tree; the user may drop it. Do not drop `stash@{1}`, which is older and not ours.

## Field note candidates

- Rapier 0.21's vehicle controller sets its forward axis through a property setter named `setIndexForwardAxis`;
  with forward x the axle must be +z, with forward z it must be -x, or engine force drives backwards.
- Rapier's vehicle controller already excludes its own chassis from wheel rays; Tractor's and Pig Pens'
  own-collider predicates were redundant.
- Tractor's DIRT rates are per second at full speed (`rate × speedFrac × dt`); spec dirtRate is per metre.
  Ruling (3h/3l): Tractor moves to per-metre dirtRate; 3l picks rates equal to today's at normal speed, pins
  them with a test and lists the feel as a playtest item.
- createParticles.emit takes (…, life, size, …) per the contract; Tractor's fx.emit took (…, size, life, …).
- Rapier: a ray collision group with no membership hits nothing, so an empty `rayGroups.member` must be passed to `world.groups.mask` as omitted (= every group). Colliders keep 3c's rule (explicit `member: []` = none).
- Material registry: a block's `coverage` merges over the parent's, it does not replace it. A child that must not inherit `mud` needs an explicit `mud: 0`.
- three.js: `PlaneGeometry.rotateX(-PI / 2)` leaves about 6e-17 of float noise in the flat axis; tests of "flat" geometry need a tolerance, not `=== 0`.
- Mutation proofs must be able to fail: the Task 6b steer/roll-order mutation passed while the steered front wheels were undriven (roll near 0). The test now drives the fronts.
- Terrain view LOD hysteresis: a chunk holds the finer LOD until `lodFar + hysteresis`, so a test sampling just past `lodFar` still sees the finer LOD.
- Terrain `materials` Uint8Array is per height sample (nx*nz), not per cell.
- Steer sign is the documented one: steer > 0 yaws counter-clockwise seen from above (left), for forward 'x' and 'z'.

## For the game plans

**3j (Rally)**
- `createTerrain` with `blend` for its section blends and `material: 'rally-ground'` for the heightfield collider (3j #4).
- `createTerrainMesh` replaces its own chunked terrain (3j #9) with Rally's numbers (Task 9 mapping): `chunkCells: 64`, `lods: [1, 2, 4]`, `lodFar: [150, 400]`, `hysteresis: 12`, `visFar: 760`, `evict: [300, 720]`, `skirt: 2`, `budgetMs: 3`, `drop`, `colorAt(x, z, out, ny)`, `attributes.uv`, and its `MeshStandardMaterial` as `material`.

**3k (Pig Pens)**
- `createVehicle` with `forward: 'x'` (axle +z, Rapier's defaults), plus its tractor tunables.
- The system is `VEHICLE_SYSTEM` (`'lh.kit.vehicle'`), not `lh.vehicle.update` (3k C4; Task 4's stable names). Needs R1.
- Feathers become `createParticles({ shape: 'quad' })`.

**3l (Tractor)**
- Transpose its x-major grid to row-major for `createTerrain`, and pass `fixInternalEdges: true` (CI-11).
- Trains are three vehicles in creation order, with slide help and the jackknife limit as a system `after: [VEHICLE_SYSTEM], before: ['lh.physics.step']`.
- `rayGroups: { member: [...], filter: ['ground', 'static'] }` as today; `member: []` would also mean every group (ray filter only).
- Dirt per metre (`dirtRate`): ruling, 3l picks rates equal to today's at normal speed, pins them with a test, playtest item.
- fx through `createParticles` (per-emit `g`/`drag`, `floor: groundY`) and `createMarks` (`heightAt: groundY`) per the Task 10 and 11 mappings (CI-14).
