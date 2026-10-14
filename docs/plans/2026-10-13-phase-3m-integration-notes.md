# Phase 3m: integration notes (ledger)

Plan: `2026-10-13-phase-3m-integration.md`. Owner: the integrator. Every gate, request, broadcast and field-note number is recorded here before it is announced.

## Paths

| Name | Path | Branch | Created |
|---|---|---|---|
| Engine main checkout | /home/smiller/projects/four43/lion-hawk-engine | phase-3 | (exists) |
| Integration worktree | /home/smiller/projects/four43/lion-hawk-engine-3m | phase-3-integrate | 2026-10-14 |
| 3a | /home/smiller/projects/four43/lion-hawk-engine-3a | phase-3-carryovers | 2026-10-14 |
| 3b | /home/smiller/projects/four43/lion-hawk-engine-3b | phase-3-materials | 2026-10-14 |
| 3c | /home/smiller/projects/four43/lion-hawk-engine-3c | phase-3-world | 2026-10-14 |
| 3d | /home/smiller/projects/four43/lion-hawk-engine-3d | phase-3-bake | 2026-10-14 |
| 3e | /home/smiller/projects/four43/lion-hawk-engine-3e | phase-3-render | 2026-10-14 |
| four43 integration | /home/smiller/projects/four43/four43-lh3 | feat/lion-hawk-3 | 2026-10-14 |
| Scratch | /tmp/claude-1000/lion-hawk-phase3/3m | — | 2026-10-14 |

Pre-existing state found at Task 1: `git status --short` of four43-lion-hawk showed ` M site/exp/piggie-game/index.html` and ` M site/exp/piggie-game/sw.js` (an earlier Pig Pens `build.py` run; not restored, constraint 8).

## Baselines (engine 0.7.2, four43 e03ed71)

### Test counts

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| Engine unit | 374 | 0 | |
| Engine browser (bridge-e2e 7, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2) | 13 | 0 | engine total 387 |
| Workspace | 874 | 0 | 851 + 23 new games/test (gate 9, owners 5, perf 9) |
| tractor-pickup TP_MP=engine | 782 | 1 | pass (allowed); the failure is the M-50 frozen-frame test |
| Pig Pens e2e | 6 | 0 | |
| Tractor e2e | 14 | 0 | |
| Rally e2e | 4 | 0 | |
| Rally mobile | 0 | 0 | exit 0 |

Gate 0: GATE PASS (log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.2.log`). All counts as expected.

### Sizes and frame rate (Chromium, SwiftShader, desktop preset; probe of the built page)

| Game | Build | Programs | Draw calls (median, max) | Frame ms (median, p95) | Settled ms (median of 3) | Total gzip | Total bytes |
|---|---|---|---|---|---|---|---|
| rally | e03ed71 scratch build (`site/exp/rally`) | 9 | 99, 139 | 316.6, 333.4 | 1808 (single run) | 2020008 | 5445677 |
| pig-pens | e03ed71 scratch build (`site/exp/piggie-game`) | 16 | 140, 140 | 233.4, 250.1 | 1889 (single run) | 2111208 | 6107760 |
| tractor-pickup | e03ed71 scratch build (`site/exp/tractor-pickup`) | 19 | 141, 144 | 433.4, 483.2 | 1283 (single run) | 2579061 | 6849966 |

Probe ran on the built pages through `serveDir` (no fallback needed); frames 119 each, errors empty. Settled ms is one run, not a median of 3. Frame ms is high because software rendering (SwiftShader) on this host.

```json
{
 "rally": {
  "game": "rally",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/rally",
  "settledMs": 1808,
  "programs": 9,
  "drawsMedian": 99,
  "drawsMax": 139,
  "frameMsMedian": 316.59999999999854,
  "frameMsP95": 333.3999999999978,
  "frames": 119,
  "size": {
   "bytes": 5445677,
   "gzip": 2020008
  },
  "errors": []
 },
 "pig-pens": {
  "game": "pig-pens",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/piggie-game",
  "settledMs": 1889,
  "programs": 16,
  "drawsMedian": 140,
  "drawsMax": 140,
  "frameMsMedian": 233.4000000000001,
  "frameMsP95": 250.09999999999945,
  "frames": 119,
  "size": {
   "bytes": 6107760,
   "gzip": 2111208
  },
  "errors": []
 },
 "tractor-pickup": {
  "game": "tractor-pickup",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/tractor-pickup",
  "settledMs": 1283,
  "programs": 19,
  "drawsMedian": 141,
  "drawsMax": 144,
  "frameMsMedian": 433.40000000000146,
  "frameMsP95": 483.1999999999998,
  "frames": 119,
  "size": {
   "bytes": 6849966,
   "gzip": 2579061
  },
  "errors": []
 }
}
```

## Gates

| Version | Date | Engine head | four43 head | Engine | Workspace | Browser | Builds | Probes | Verdict | Log |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.7.3 | 2026-10-14 | 2a5cbde (`v0.7.3`) | d884cf3 (`v-games-0.7.3`) | pass: unit 409, browser 14 (bridge-e2e 7, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2, untilLoaded-e2e 1) = 423 | pass 874 | pass: TP_MP=engine 782/1 (allowed, M-50); Pig Pens e2e 6, Tractor e2e 14, Rally e2e 4, Rally mobile 0 | none (no `game.config.js` yet) | none | GATE PASS; dirty 0; golden diff vs `v-games-0.7.2` empty | `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.3.log` |
| 0.7.4 (3b early landing, `--only engine,workspace`) | 2026-10-14 | 60db92c (`v0.7.4`) | 6cd2ae0 (`v-games-0.7.4`) | pass: unit 443 (409 + 32 3b tests + 2 `package-phase3` 0.7.4 surface rows; 19 skipped), browser 14 (bridge-e2e 7, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2, untilLoaded-e2e 1) = 457 | pass 877 (games/test 31, Pig Pens 37, Tractor 783, Rally 26; 876 after Task 13 + 1 from Task 16's `phase3-done` test, no skips) | TP_MP=engine 782/1 (allowed, M-50); game browser suites not run (`--only`) | none | none | GATE PASS; dirty 0; golden diff vs `v-games-0.7.3` empty. Pre-gate `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.4-3b.log`: GATE PASS, 457. Base material hash `2f4f4f95` (read from merged code) | `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.4.log` (verdict in `0.7.4.log.stdout`) |

## Frame-rate table (overview §8 R1, R3)

Budgets: programs ≤ baseline + 2; draw calls (median) ≤ baseline; total gzip ≤ baseline × 1.10; settled ≤ baseline × 1.20. Enforced from a game's view step on; earlier rows are informational. iPad `?fps` is the user's (Task 21).

| Game | Engine / game version | Step | Programs | Draw calls | Frame ms | Settled ms | Gzip | vs budget | iPad median frame ms (today → branch) |
|---|---|---|---|---|---|---|---|---|---|

## Requests

| ID | From | Kind | Target | Blocks | Files | Ask | Decision | Landed in | Test |
|---|---|---|---|---|---|---|---|---|---|
| 3a-R1 | 3a | D | 0.7.3 | no | `package.json`, `package-lock.json`, `src/version.js` | 0.7.3; `@gltf-transform/*` 4.5.1, `meshoptimizer ~1.2.0`, `pngjs ^7`, `esbuild` as dependencies (with 3d R1's pins) | done | 2a5cbde (0.7.3) | `test/package-phase3.test.mjs` (red without `pngjs`, then green) |
| 3a-R2 | 3a | S | 0.7.3 | no | `CHANGELOG.md` | `## 0.7.3` entry | done; checked against the merged notes (reset bullet adds ruling 4) | 2a5cbde | — |
| 3a-R3 | 3a | S | 0.7.3 | no | `docs/spec.md` | Task 10 steps 1–3 (header, part A D1–D9, part B) | done verbatim, plus R7 | 350e614 | — |
| 3a-R4 | 3a | S | 0.7.3 | no | `docs/field-notes.md` | #95, #100, #105, #107, #108, #109 done; candidates from #110 | done: five candidates → #110–#114 | e902f5c | `test/field-notes.test.mjs` |
| 3a-R5 | 3a | — | 0.7.3 | no | — | games workspace suite after the merge, before Wave A | done: the 0.7.3 gate's workspace step, 874/874 (against `feat/lion-hawk-3`, which links the main checkout) | gate 0.7.3 | — |
| 3a-R6 | 3a | — | 0.7.3 | no | — | Tractor iPad gesture e2e against 0.7.3 before dropping a #109 workaround | forwarded to 3l (non-blocking); the 0.7.3 gate's Tractor e2e passed 14/14 at the current settings | — | — |
| 3a-R7 | 3a | S | 0.7.3 | no | `docs/spec.md` | [I-2]: `now` reads the clock of `event.timeStamp`, for tests; [T-5]/[T-17]: `maxSteps: 0` with commands pending throws | both applied: code reads `clock() - t0` with `t0 = event.timeStamp`; a scratch probe showed `untilLoaded({ maxSteps: 0 })` throws `untilLoaded after 0 steps` with a command pending (Playwright loop reads the same) | 350e614 | — |
| 3b-R1 | 3b | E | 0.7.4 | no | `src/index.sim.js` | exports `defineMaterials`, `BASE_MATERIALS`, `SIDECAR_VERSION`, `validateSidecar`, `validatePhys` (exact lines in the plan) | done at 3b's early merge; the 3b `SURFACE` rows (sim, and `defineMaterials` in view) moved from 0.8.0 to 0.7.4 (red without the lines at 0.7.4, then green) | 3d6adca (0.7.4) | `test/package-phase3.test.mjs` (0.7.4 rows) |
| 3b-R2 | 3b | S | 0.7.4 | no | `CHANGELOG.md` | entry: material registry, sidecar schema | done: `## 0.7.4` entry (early landing; the 0.8.0 entry will not repeat it) | e619d0f (0.7.4) | — |
| 3b-R3 | 3b | S | 0.7.4 | no | `docs/spec.md` | Contract issues 1, 2, 4, 5, 6, 8 as clarifications of M-2/M-8, §4.2 hash, §6.2 | done: no verbatim text supplied, so written from the merged code and notes, each marked `(phase 3, 0.7.4)` under [M-3], [M-8], [A-5] and [A-6] | adffb55 (0.7.4) | — |
| 3b-R4 | 3b | — | — | no | — | no purity-root change needed (`src/defs` already scanned) | nothing to do | n/a | — |
| 3b-R5 | 3b | X | 0.8.0 | no | 3c `checks.materials`, inline collider checks | adopt `validateCollider` (`inline: true`) and `materialRefs` from `src/defs/sidecar.js`, or record them as unused (else inline `paint-*` and unknown fields such as `radius` pass at spawn) | forwarded to 3c through the controller with the 0.7.4 pickup (open) | — | 3c's tests |
| 3c-R1 | 3c | X | 0.8.0 | no | `test/engine.test.mjs:232` | expected built-in schedule gains the World systems (object in the plan) | 3c's Task 11 makes the one-line change; integrator checks at merge | — | `test/engine.test.mjs` |
| 3c-R2 | 3c | E | 0.8.0 | no | `src/index.sim.js`, `testing/index.js` | `createWorld`, `heightfieldDesc`; `checks` | at 3c's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3c-R3 | 3c | X | 0.8.0 (or 0.8.1 if 3b lands early) | soft: 3c Task 17 (plan falls back to this request at the Wave A merge) | `src/sim/world/world.js`, `testing/checks.js` | base-library default registry, with tests, if 3b merges after 3c | 3b is on `phase-3` in 0.7.4 (early landing), so 3c's Task 17 can run on its branch after `git merge phase-3` | — | 3c's Task 17 tests |
| 3c-R4 | 3c | X | 0.9.0 | no | 3e `boot.js` | `boot(game, view, { timer })` passes `timer` to `createEngine`; 3c accepts it in `createEngine` only | forward to 3e (open); also 3e-R4 | — | 3e `test/render-boot.test.mjs` (source pin) plus 3e-R4 |
| 3c-R5 | 3c | X | 0.8.0 | no | 3b `validateCollider`/`validateSidecar` | accept `round` (> 0) on a `box` (3j #1 ruling); 3c `shapeDesc` builds it | done in 3b (Task 5 and the ruling): `box` `round` any finite > 0, other shapes reject it | 3b 449c6ab, on `phase-3` in 0.7.4 | `test/sidecar-collider.test.mjs` |
| 3c-R6 | 3c | S | 0.8.0 | no | `docs/spec.md`, `docs/field-notes.md` | spec T-1, E-10 (`e.xf.slot`, copy-not-flip), R-6, S-3; field notes #1, #2, #28, #64, #106 statuses | at the merge (Procedure F for notes) | — | `test/field-notes.test.mjs` |
| 3d-R1 | 3d | D | 0.7.3 | no | `package.json`, lockfile | pin `@gltf-transform/*` 4.5.1, `meshoptimizer ~1.2.0`, add `pngjs ^7`, `esbuild ^0.28.2` to dependencies (verified against plan text and `2a5cbde:package.json`) | done (3m ruling 6) | 2a5cbde (Task 9) | `test/package-phase3.test.mjs` |
| 3d-R1b | 3d | E | 0.8.0 | no | `package.json` | `exports` `./bake` -> `tools/bake/index.js`, `./build` -> `tools/build/index.js` (still exports `dedupe`); `bin` `lion-hawk` -> `bin/lion-hawk.js` | at 3d's merge (Procedure M step 4) | — | `test/package-phase3.test.mjs` (`lion-hawk/bake`, `lion-hawk/build` rows); bin |
| 3d-R2 | 3d | — | each minor | no | `test/fixtures/models/game/baked/` | after each engine minor bump run `node bin/lion-hawk.js bake --game test/fixtures/models/game` and commit `baked/` (hygiene) | do at 0.8.0 and each later minor, on `phase-3-integrate` | — | — |
| 3d-R3 | 3d | — | 0.8.0 | no | relay to 3j, 3k, 3l | (a) weld/triangle parity, (b) palette colours, (c) per-model `rename.nodes`, (d) `.` stripped and `-2` names, (e) `__PRECACHE__` and bare `<!--APP-->`, (f) `build({ game, out, e2e })` shape | relay through the controller when 3j/3k/3l are assigned (Task 12) | — | — |
| 3d-R4 | 3d | — | 0.8.0 | soft: 3d Task 16 (integrator runs it at the Wave A merge if 3b is not on 3d's branch) | 3d `tools/bake` | Task 16 (real registry and `validatePhys`) at the Wave A merge if 3b is absent | 3b is on `phase-3` in 0.7.4 (early landing), so 3d's Task 16 can run on its branch after `git merge phase-3` | — | 3d's 58th test |
| 3e-R1 | 3e | E | 0.9.0 | no | `src/index.view.js` | `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift` | at 3e's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3e-R2 | 3e | G | 0.9.0 | no | `games/test/workspace.test.mjs`; game builds | narrow 'engine source does not import three or Rapier yet' to the sim roots; each game must build with `lion-hawk build` (dedupe) before 0.9.0 | on `feat/lion-hawk-3` before the 3e merge, then Procedure P step 1 | — | `games/test/workspace.test.mjs` |
| 3e-R3 | 3e | X | 0.9.0 | no | `src/view/assets/index.js`, `src/view/materials/compiler.js` (3f); `src/view/sync/index.js`, `src/view/audio/index.js` (3g); `test/render-stubs.test.mjs` | take 3f/3g real modules over 3e's stubs; delete the stub-shape test; rerun render-pipeline and render-boot; confirm 3f Contract issue 2; add two paint assertions (3f C11) | at the Wave B merge | `test/render-pipeline.test.mjs`, `test/render-boot.test.mjs` |
| 3e-R4 | 3e | X | 0.9.0 | no | 3e `test/render-boot.test.mjs` | after 3c merges, assert `boot(…, { timer })` reaches `world.stats.stepMs` (#106) | after 3c is on `phase-3` | — | that assertion |
| 3e-R5 | 3e | S | 0.9.0 | no | `CHANGELOG.md` | 0.9.0 entry (view render API, boot builds gfx/materials/assets/sync/audio, `render: …` error) | at the Wave B merge | — | — |
| 3e-R6 | 3e | — | 0.8.0 | no | relay to game plans | `render.assets`, `view.gfx.post`, light preset shape, `snapshot(…, { size })`, `render.paint` | relay at reconciliation / Task 12 intake | — | — |
| 3f-R1 | 3f | E | 0.9.0 | no | `src/index.view.js` | `createAssets`, `createMaterialCompiler`, `furGeometry`, `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable` | at 3f's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3f-R2 | 3f | X | 0.9.0 | no | 3e `boot.js`, `checkRender`, `createPipeline` | boot builds `view.materials`/`view.assets`/`engine.assets`; 3e must accept `render.paint = { base, shade }` and pass `paint` | forward to 3e now (3e open); gap found 2026-10-14 | — | 3e render-boot and render-pipeline tests |
| 3f-R3 | 3f | X | 0.9.0 | no | 3e hygiene | `gfx.warm()` walks `view.materials.made()`; `disposeTree` skips `userData.lhShared` | confirm with 3e (relay) | — | 3e hygiene tests |
| 3f-R4 | 3f | X | 0.9.0 | no | 3d bake fixtures | 3d's anim-table bake writes Matrix4 elements 0,1,2,4,5,6,8,9,10,12,13,14; a shared fixture decoded by `decodeAnimTable` pins C7 | relay to 3d (open) as a suggestion | — | shared fixture (if added) |
| 3f-R5 | 3f | D | 0.7.3 | no | `package.json` | `meshoptimizer` resolvable from the engine root (3f Task 0 stops otherwise) | done: dependency present in 0.7.3 | 2a5cbde | `test/package-phase3.test.mjs` |
| 3f-R6 | 3f | X | 0.9.0 | no | as 3e-R3 | take 3f `assets/index.js` and `materials/compiler.js` over 3e's stubs; drop 3e's stub cases | with 3e-R3 at the Wave B merge | — | as 3e-R3 |
| 3f-R7 | 3f | C | 0.9.0 | no | overview §4.7, §4.8 | record C1–C11 once reconciled; tell 3g (instanceCoverage, `blendAnimTable`) and 3h (`coverageView` writes `uCoverage`) | controller rules, then `docs(plan): <ruling>` and broadcast; Broadcasts table | — | — |
| 3g-R1 | 3g | — | 0.8.1 (3e), 0.8.2 (3f), patch releases | BLOCKS 3g: stop after Task 10 until 3e is on `phase-3` (Task 11), and until 3f is (Task 15) | `phase-3` merge order | merge 3e before 3g Task 11 and 3f before Task 15; tell 3g each time so it merges `phase-3` | early landings (Step 3) | — | — |
| 3g-R2 | 3g | X | 0.9.0 | no | 3e `boot.js` | build sync as `createViewSync(engine, { gfx, assets: view.assets, compiler: materials, view })`; keep `view.sync.dispose()` and `view.audio.dispose()` | forward to 3e (open) | — | 3e render-boot tests |
| 3g-R3 | 3g | E | 0.9.0 | no | `src/index.view.js` | `createViewSync`, `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd`, `createAudio` | at 3g's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3g-R4 | 3g | X | 0.9.0 | no | 3e stubs; `test/render-stubs.test.mjs` | take 3g `sync/index.js`, `audio/index.js` over 3e's stubs; delete the stub test; rerun render tests | with 3e-R3 at the Wave B merge | — | render-pipeline, render-boot |
| 3g-R5 | 3g | S | 0.9.0 | no | `docs/field-notes.md` | mark #67 done; number 3g's candidates | at the merge (Procedure F) | — | `test/field-notes.test.mjs` |
| 3g-R6 | 3g | — | 0.9.0 | no | relay to 3i, 3h, 3j, 3k, 3l | `netFix` convention (3i); `instanceCoverage` from `e.coverage` (3h); adopt the rigs (3j #9, 3k C9, 3l CI-10) | relay when each plan is assigned | — | — |
| 3g-R7 | 3g | S | 0.8.0 (spec), relays | soft: 3g Task 13b needs 3c Task 10b on `phase-3` (in 0.8.0) | `docs/spec.md` | spec E-10 line: part poses are swapped with the pose pool; relay to 3h (Task 6b), 3j, 3k, 3l | at the 3c merge | — | — |
| 3h-R1 | 3h | E | 0.9.0 | no | `package.json` | `exports` `./kits/*/view` and `./kits/*`; package test for six kit entry points (verified: the test, skipped below 0.9.0, is in `test/package-phase3.test.mjs`) | test landed; exports at 3h's merge | test: 02a7c86 (Task 8); exports pending | `test/package-phase3.test.mjs` (kit rows, resolve test) |
| 3h-R2 | 3h | P | 0.7.3 | no | `test/purity.test.mjs`, `testing/purity.js` | kit `sim.js` files in the scanned sim roots (verified: `simRoots` in 9b05197) | done | 9b05197 (Task 7) | `test/purity-phase3.test.mjs` |
| 3h-R3 | 3h | X | 0.8.0 | no | 3c `world.js` | expose `world.engine`; forward `fixInternalEdges` to `heightfieldDesc`; run `world.own` callbacks before freeing Rapier on `despawn`/`clear()`/dispose (3c accepted) | forward to 3c (open) | — | 3c world tests |
| 3h-R4 | 3h | S | 0.9.0 | no | `CHANGELOG.md` | 0.9.0 kits lines, M-10 `materialAt`, D4 pair friction `grip` | at the Wave B merge | — | — |
| 3h-R5 | 3h | S | 0.9.0 | no | `docs/field-notes.md` | number 3h's candidates from #110 (next free number, Procedure F) | at the merge | — | `test/field-notes.test.mjs` |
| 3i-R1 | 3i | X | 0.8.0 (or 0.10.0) | no | 3c `src/sim/world/install.js` | `installNet(engine)` when `game.net?.world`; `engine.netPart?.attach(world)` after each World | forward to 3c (open); until then games call `installNet` in `setup` | — | 3i install tests |
| 3i-R2 | 3i | X | 0.8.0 (or 0.10.0) | BLOCKS 3i Task 10 (not open yet) | 3c `src/sim/world/world.js` | `world.net?.guard` in `spawn`, `despawn`, `add`/`remove` (net part only), never `clear()`/dispose | forward to 3c (open); 3c's Task 9 and 'net seam' test build it | — | 3c net seam test |
| 3i-R3 | 3i | S | 0.10.0 | no | `docs/spec.md`, overview §4.11, `CHANGELOG.md` | Contract issues 1–10 into spec §4.3/§4.4 and overview §4.11; user decisions (other tractors solid; NET_VERSION 4); CHANGELOG 0.10.0 | at the 3i merge | — | — |
| 3i-R4 | 3i | — | 0.10.0 | no | relay to the 3l writer | Tractor migration needs (rename `PLAYER.body` to `coat`, `TRAIN` fields and hooks, CI-15, honk)  | relay when 3l is assigned | — | — |

## Early landings

An early landing is a patch release (Procedure M, then Procedure G with `--only engine,workspace`, a CHANGELOG entry and a tag). The wave's minor version comes with the last merge of the wave.

| Needs | Landing | Why | Hardness |
|---|---|---|---|
| 3c Task 17 needs 3b on `phase-3` | 3b: landed as 0.7.4 (`v0.7.4`, 2026-10-14) | base library as the default registry | soft: otherwise request 3c-R3 at the Wave A merge |
| 3d Task 16 needs 3b | same 3b landing (0.7.4) | real registry and `validatePhys` | soft: otherwise the integrator runs it at the Wave A merge (3d-R4) |
| 3g Task 11 needs 3e | 3e before 3g Task 11 (3g-R1) | sync imports `src/view/render/hygiene.js` | hard: 3g stops after Task 10 and reports |
| 3g Task 15 needs 3f | 3f before 3g Task 15 (3g-R1) | crowd imports `animTable.js` and `test/helpers/glb.mjs` | hard: same |
| 3f stub replacement needs 3e | 3e before 3f's merge (3e-R3, 3f-R6) | 3f's `assets/index.js` and `materials/compiler.js` replace 3e's stubs | at the Wave B merge |
| 3f Task 0 needs Wave A (0.8.0) on `phase-3` | Wave A merge | `defineMaterials`; `meshoptimizer` resolvable | hard: 3f is cut from `phase-3` after Wave A |
| 3h and 3i need Wave A (0.8.0) | Wave A merge | World, `engine.builtin`, `heightfieldDesc` | hard: cut from `phase-3` after Wave A |
| 3g Tasks 1–10 need 0.8.0; Task 13b needs 3c Task 10b | Wave A merge | `partXf` is in 3c's plan | hard |
| 3e-R4 timer assertion needs 3c | 3c on `phase-3` | `world.stats.stepMs` | add after the 3c merge |

## Broadcasts

| Date | To | Message |
|---|---|---|
| 2026-10-14 | controller | Freeze before the 0.7.3 `--ff-only` of `phase-3` (constraint 16): no other worktree was active, so a no-op. |
| 2026-10-14 | controller | Procedure P pickup for 0.7.3 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.3.log`); no open game or engine worktree to relay to. Freeze lifted. |
| 2026-10-14 | controller | Freeze before the 0.7.4 `--ff-only` of `phase-3` (constraint 16): recorded as a no-op (posted through the controller's dispatch; no suite was started by 3m against the main checkout meanwhile). |
| 2026-10-14 | controller → 3c, 3d | Procedure P pickup for 0.7.4 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.4.log`): merge `phase-3`, `npm install`, rerun suites; 3c-R5 done in 3b; 3b-R5 forwarded to 3c; 3c Task 17 and 3d Task 16 unblocked. Freeze lifted. Text in `.superpowers/sdd/2026-10-13-phase-3m-integration/land-3b-report.md`. |

## Field-note map

| # | From | Candidate |
|---|---|---|
| 110 | 3a | 1: `bindGesture` reads the event clock (#109 outcome) |
| 111 | 3a | 2: `untilLoaded` waits for commands pending at the call (#100 outcome) |
| 112 | 3a | 3: `reset()` in every `createEngine`; tune after all `mp()` peers (#108 outcome) |
| 113 | 3a | 4: focus not moved after a fallback swap (G-E2 parked minor) |
| 114 | 3a | 5: a late-dispatched lift can still read as a hold (#109 residual) |
| 115 | 3b | 1: the material hash skips `look`/`game`; a stale baked `look` is not caught (contract issue 6) |
| 116 | 3b | 2: M-8 pairs are order-dependent; moving body `a`, ground `b` |

## Contract issues (as reconciled)

## Removed or renamed tests

| Version | Plan | Test | Why |
|---|---|---|---|

## Hand-off

## Field note candidates
