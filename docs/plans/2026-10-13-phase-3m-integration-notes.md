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
| 3f | /home/smiller/projects/four43/lion-hawk-engine-3f | phase-3-assets (from v0.8.0) | 2026-10-14 |
| 3g | /home/smiller/projects/four43/lion-hawk-engine-3g | phase-3-viewsync (from v0.8.0) | 2026-10-14 |
| 3h | /home/smiller/projects/four43/lion-hawk-engine-3h | phase-3-kits (from v0.8.0) | 2026-10-14 |
| 3i | /home/smiller/projects/four43/lion-hawk-engine-3i | phase-3-net (from v0.8.0) | 2026-10-14 |
| four43 integration | /home/smiller/projects/four43/four43-lh3 | feat/lion-hawk-3 | 2026-10-14 |
| 3j Rally | /home/smiller/projects/four43/four43-lh3-rally | feat/lion-hawk-3-rally (from e6b384e = v-games-0.8.0) | 2026-10-14 |
| 3k Pig Pens | /home/smiller/projects/four43/four43-lh3-pigpens | feat/lion-hawk-3-pigpens (from e6b384e) | 2026-10-14 |
| 3l Tractor | /home/smiller/projects/four43/four43-lh3-tractor | feat/lion-hawk-3-tractor (from e6b384e) | 2026-10-14 |
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
| 0.7.5 (3e early landing, `--only engine,workspace`) | 2026-10-14 | f12f38a (`v0.7.5`) | 67f8abb (`v-games-0.7.5`) | pass: unit 521 (443 + 77 3e `render-*` tests + 1 `package-phase3` 0.7.5 surface row; 18 skipped), browser 20 (bridge-e2e 7, e2e-render 6, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2, untilLoaded-e2e 1) = 541 | pass 877 (the narrowed 'no three' rule from Task 13 holds with view code importing three) | TP_MP=engine 782/1 (allowed, M-50); game browser suites not run (`--only`) | none | none | GATE PASS; dirty 0; golden diff vs `v-games-0.7.4` empty. Pre-gate `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.5-3e.log`: GATE PASS, 541. esbuild 0.28.2 (engine and games) | `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.5.log` (verdict in `0.7.5.log.stdout`) |
| 0.8.0 (Wave A: 3c, 3d; full gate) | 2026-10-14 | e94d4d9 (`v0.8.0`) | e6b384e (`v-games-0.8.0`) | pass: unit 711 (521 + 118 3c + 63 3d + 7 `package-phase3` 0.8.0 rows + 2 `render-timer`; 11 skipped), browser 20 (bridge-e2e 7, e2e-render 6, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2, untilLoaded-e2e 1) = 731 | pass 877 | pass: TP_MP=engine 782/1 (allowed, M-50); Pig Pens e2e 6, Tractor e2e 14, Rally e2e 4, Rally mobile 0 | none (no `game.config.js` yet) | none | GATE PASS; dirty 0; budget []; golden diff vs `v-games-0.7.5` empty. Pre-gates: `0.8.0-3c.log` 639+20, `0.8.0-3d.log` 702+20, `0.8.0-pre.log` 711+20, all GATE PASS. Base material hash `2f4f4f95` (read from merged code). Fixture re-baked before the gate (engine stamp only) | `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.8.0.log` (verdict in `0.8.0.log.stdout`) |

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
| 3b-R5 | 3b | X | 0.8.0 | no | 3c `checks.materials`, inline collider checks | adopt `validateCollider` (`inline: true`) and `materialRefs` from `src/defs/sidecar.js`, or record them as unused (else inline `paint-*` and unknown fields such as `radius` pass at spawn) | done in 3c Task 17: inline colliders run `validateCollider` at spawn after 3c's own checks; `checks.materials` uses `materialRefs` | 608f5d8 (merged ac2c32a, 0.8.0) | `test/world-base-materials.test.mjs` |
| 3c-R1 | 3c | X | 0.8.0 | no | `test/engine.test.mjs:232` | expected built-in schedule gains the World systems (object in the plan) | done in 3c's Task 11 (branch carried it); checked at the merge | c4f87cc (merged ac2c32a, 0.8.0) | `test/engine.test.mjs` |
| 3c-R2 | 3c | E | 0.8.0 | no | `src/index.sim.js`, `testing/index.js` | `createWorld`, `heightfieldDesc`; `checks` | done: `createWorld`, `heightfieldDesc` in `src/index.sim.js`; `export { checks } from './checks.js'` in `testing/index.js` (`checks.js` exports the object). Red at 0.8.0 without them, green with; mutation (drop `heightfieldDesc`) → `lion-hawk/sim lacks heightfieldDesc` | 518d813 (0.8.0) | `test/package-phase3.test.mjs` |
| 3c-R3 | 3c | X | 0.8.0 (or 0.8.1 if 3b lands early) | soft: 3c Task 17 (plan falls back to this request at the Wave A merge) | `src/sim/world/world.js`, `testing/checks.js` | base-library default registry, with tests, if 3b merges after 3c | done on 3c's branch (Task 17) after the 0.7.4 merge | 608f5d8 (merged ac2c32a, 0.8.0) | `test/world-base-materials.test.mjs` |
| 3c-R4 | 3c | X | 0.9.0 | no | 3e `boot.js` | `boot(game, view, { timer })` passes `timer` to `createEngine`; 3c accepts it in `createEngine` only | met by 3e (`boot.js` passes `timer`; source pin in `test/render-boot.test.mjs`); behaviour assertion is 3e-R4 (open until 3c) | 61a7014 (0.7.5) | `test/render-boot.test.mjs` (source pin) plus 3e-R4 |
| 3c-R5 | 3c | X | 0.8.0 | no | 3b `validateCollider`/`validateSidecar` | accept `round` (> 0) on a `box` (3j #1 ruling); 3c `shapeDesc` builds it | done in 3b (Task 5 and the ruling): `box` `round` any finite > 0, other shapes reject it | 3b 449c6ab, on `phase-3` in 0.7.4 | `test/sidecar-collider.test.mjs` |
| 3c-R6 | 3c | S | 0.8.0 | no | `docs/spec.md`, `docs/field-notes.md` | spec T-1, E-10 (`e.xf.slot`, copy-not-flip), R-6, S-3; field notes #1, #2, #28, #64, #106 statuses | done: spec T-1, E-10 (copy-not-flip, `e.xf.slot`, part poses), R-6, S-3 marked `(phase 3, 0.8.0)`; field notes #1, #2, #28, #64, #106 done, candidates #120–#127 | 398e7fc, fd8dbf7 (0.8.0) | `test/field-notes.test.mjs` |
| 3c-R7 | 3c | X | 0.10.0 (after 3i) | no | `src/sim/world/install.js` | `installNet(engine)` in the World install (3i-R1a) | waits for 3i (`src/sim/net/install.js` does not exist); 3m Task 15, ruling P5 | — | 3i install tests |
| 3c-R8 | 3c | C | — | no | relay | CI-15: 3c never calls `world.net.guard` from `clear()`/`dispose()`; only a 3l host-frame re-request could settle it | controller ruling: 3i's CI-15 design stands (`world.serial` bumps on clear); 3l does not re-request a host frame. Relayed to 3i and 3l with the Task 12 pickup | n/a | — |
| 3c-R9 | 3c | P | — | no | `testing/checks.js` | should `checks.simPurity` apply scanPurity's Rapier rule to game sim roots? | controller ruling: no Rapier rule in `checks.simPurity` (games inject Rapier, D9) | n/a | — |
| 3d-R1 | 3d | D | 0.7.3 | no | `package.json`, lockfile | pin `@gltf-transform/*` 4.5.1, `meshoptimizer ~1.2.0`, add `pngjs ^7`, `esbuild ^0.28.2` to dependencies (verified against plan text and `2a5cbde:package.json`) | done (3m ruling 6) | 2a5cbde (Task 9) | `test/package-phase3.test.mjs` |
| 3d-R1b | 3d | E | 0.8.0 | no | `package.json` | `exports` `./bake` -> `tools/bake/index.js`, `./build` -> `tools/build/index.js` (still exports `dedupe`); `bin` `lion-hawk` -> `bin/lion-hawk.js` | done: `./bake` → `tools/bake/index.js`, `./build` → `tools/build/index.js` (still exports `dedupe`), `bin` `lion-hawk` → `bin/lion-hawk.js`; lockfile root carries `bin` | 518d813 (0.8.0) | `test/package-phase3.test.mjs` (`lion-hawk/bake`, `lion-hawk/build`, bin rows) |
| 3d-R2 | 3d | — | each minor | no | `test/fixtures/models/game/baked/` | after each engine minor bump run `node bin/lion-hawk.js bake --game test/fixtures/models/game` and commit `baked/` (hygiene) | done at 0.8.0 before the gate (ruling P3): only `phys.json`'s engine stamp changed (0.7.4 → 0.8.0); `bake --check` exit 0 | e94d4d9 (0.8.0) | — |
| 3d-R3 | 3d | — | 0.8.0 | no | relay to 3j, 3k, 3l | (a) weld/triangle parity, (b) palette colours, (c) per-model `rename.nodes`, (d) `.` stripped and `-2` names, (e) `__PRECACHE__` and bare `<!--APP-->`, (f) `build({ game, out, e2e })` shape | relayed with the 0.8.0 pickup to 3j, 3k, 3l (Task 12; Broadcasts) | Task 12 broadcast | — |
| 3d-R4 | 3d | — | 0.8.0 | soft: 3d Task 16 (integrator runs it at the Wave A merge if 3b is not on 3d's branch) | 3d `tools/bake` | Task 16 (real registry and `validatePhys`) at the Wave A merge if 3b is absent | done on 3d's branch (Task 16) after the 0.7.4 merge | 1e35ce4 (merged fb13601, 0.8.0) | 3d's 58th test |
| 3e-R1 | 3e | E | 0.7.5 | no | `src/index.view.js` | `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift` | done at 3e's early merge: five lines appended verbatim; the 3e `SURFACE` row moved from 0.9.0 to 0.7.5 (red at 0.7.5 without the lines: `lion-hawk/view lacks createRenderer`; then green). The `no 3e stub is left` check stays gated at 0.9.0 (skipped at 0.7.5) | f7c1ee3 (0.7.5) | `test/package-phase3.test.mjs` (0.7.5 row) |
| 3e-R2 | 3e | G | 0.9.0 | no | `games/test/workspace.test.mjs`; game builds | narrow 'engine source does not import three or Rapier yet' to the sim roots; each game must build with `lion-hawk build` (dedupe) before 0.9.0 | done by Task 13 (four43 f0f2d12) before the 3e merge; the 0.7.5 workspace step (877 pass) confirms it with view code importing three. Game builds through `lion-hawk build` remain each game plan's step before 0.9.0 | four43 f0f2d12 | `games/test/workspace.test.mjs` |
| 3e-R3 | 3e | X | 0.9.0 | no | `src/view/assets/index.js`, `src/view/materials/compiler.js` (3f); `src/view/sync/index.js`, `src/view/audio/index.js` (3g); `test/render-stubs.test.mjs` | take 3f/3g real modules over 3e's stubs; delete the stub-shape test; rerun render-pipeline and render-boot; confirm 3f Contract issue 2; add two paint assertions (3f C11) | open: at the 3f and 3g merges (Task 14 steps 2–3); the stubs ship in 0.7.5 | — | `test/render-pipeline.test.mjs`, `test/render-boot.test.mjs` |
| 3e-R4 | 3e | X | 0.8.x/0.9.0 | no | new `test/render-timer.test.mjs` | after 3c merges, assert `boot(…, { timer })` reaches `world.stats.stepMs` (#106) | done as an integrator cross-cutting test (controller ruling): `boot(…, { timer })` reaches `world.stats.stepMs` with and without `render`; red by mutation (drop `timer` from boot's `createEngine` call: actual 0, expected 0.25), then green | fe3e405 (0.8.0) | `test/render-timer.test.mjs` |
| 3e-R5 | 3e | S | 0.7.5 | no | `CHANGELOG.md` | entry (view render API, boot builds gfx/materials/assets/sync/audio, `render: …` error) | done: `## 0.7.5` entry with R5's bullets verbatim plus behaviour changes (boot with/without `render`, stubs inert until 3f/3g, D9 `lion-hawk build`, `timer`); the 0.9.0 entry will not repeat them | a9a5e5e (0.7.5) | — |
| 3e-R6 | 3e | — | 0.8.0 | no | relay to game plans | `render.assets`, `view.gfx.post`, light preset shape, `snapshot(…, { size })`, `render.paint` | relayed with the 0.8.0 pickup to 3j, 3k, 3l (Task 12) | Task 12 broadcast | — |
| 3f-R1 | 3f | E | 0.9.0 | no | `src/index.view.js` | `createAssets`, `createMaterialCompiler`, `furGeometry`, `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable` | at 3f's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3f-R2 | 3f | X | 0.9.0 | no | 3e `boot.js`, `checkRender`, `createPipeline` | boot builds `view.materials`/`view.assets`/`engine.assets`; 3e must accept `render.paint = { base, shade }` and pass `paint` | met by 3e (`pipeline.js`: `checkRender` checks `render.paint`, `createMaterialCompiler(…, { paint })`, `engine.assets = view.assets`); the two paint assertions with the real compiler are 3e-R3 at the 3f merge | 61a7014 (0.7.5) | `test/render-pipeline.test.mjs`, `test/render-boot.test.mjs` |
| 3f-R3 | 3f | X | 0.9.0 | no | 3e hygiene | `gfx.warm()` walks `view.materials.made()`; `disposeTree` skips `userData.lhShared` | met by 3e (`pipeline.js` `gfx.warm` reads `made()` → `[{ material, use }]`; `hygiene.js` keeps `userData.lhShared`) | 61a7014 (0.7.5) | `test/render-hygiene.test.mjs`, `test/render-pipeline.test.mjs` |
| 3f-R4 | 3f | X | 0.9.0 | no | 3d bake fixtures | 3d's anim-table bake writes Matrix4 elements 0,1,2,4,5,6,8,9,10,12,13,14; a shared fixture decoded by `decodeAnimTable` pins C7 | met by 3d ruling R6: the committed `test/fixtures/models/game/baked/models/pet.anim.json` is the shared fixture (12-float layout pinned by 3d Task 8); tell 3f at pickup | 3d (merged fb13601, 0.8.0) | shared fixture (if added) |
| 3f-R5 | 3f | D | 0.7.3 | no | `package.json` | `meshoptimizer` resolvable from the engine root (3f Task 0 stops otherwise) | done: dependency present in 0.7.3 | 2a5cbde | `test/package-phase3.test.mjs` |
| 3f-R6 | 3f | X | 0.9.0 | no | as 3e-R3 | take 3f `assets/index.js` and `materials/compiler.js` over 3e's stubs; drop 3e's stub cases | with 3e-R3 at the Wave B merge | — | as 3e-R3 |
| 3f-R7 | 3f | C | 0.9.0 | no | overview §4.7, §4.8 | record C1–C11 once reconciled; tell 3g (instanceCoverage, `blendAnimTable`) and 3h (`coverageView` writes `uCoverage`) | controller rules, then `docs(plan): <ruling>` and broadcast; Broadcasts table | — | — |
| 3g-R1 | 3g | — | 0.7.5 (3e), later patch (3f) | BLOCKS 3g: stop after Task 10 until 3e is on `phase-3` (Task 11), and until 3f is (Task 15) | `phase-3` merge order | merge 3e before 3g Task 11 and 3f before Task 15; tell 3g each time so it merges `phase-3` | 3e part done: on `phase-3` in 0.7.5 (tell 3g when it is cut/at Task 11); 3f part open | f12f38a (0.7.5, 3e) | — |
| 3g-R2 | 3g | X | 0.9.0 | no | 3e `boot.js` | build sync as `createViewSync(engine, { gfx, assets: view.assets, compiler: materials, view })`; keep `view.sync.dispose()` and `view.audio.dispose()` | met by 3e (`pipeline.js` builds sync exactly so; dispose calls both) | 61a7014 (0.7.5) | 3e render-boot tests |
| 3g-R3 | 3g | E | 0.9.0 | no | `src/index.view.js` | `createViewSync`, `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd`, `createAudio` | at 3g's merge; names into `SURFACE` | — | `test/package-phase3.test.mjs` |
| 3g-R4 | 3g | X | 0.9.0 | no | 3e stubs; `test/render-stubs.test.mjs` | take 3g `sync/index.js`, `audio/index.js` over 3e's stubs; delete the stub test; rerun render tests | with 3e-R3 at the Wave B merge | — | render-pipeline, render-boot |
| 3g-R5 | 3g | S | 0.9.0 | no | `docs/field-notes.md` | mark #67 done; number 3g's candidates | at the merge (Procedure F) | — | `test/field-notes.test.mjs` |
| 3g-R6 | 3g | — | 0.9.0 | no | relay to 3i, 3h, 3j, 3k, 3l | `netFix` convention (3i); `instanceCoverage` from `e.coverage` (3h); adopt the rigs (3j #9, 3k C9, 3l CI-10) | relayed with the 0.8.0 pickup to 3h, 3i, 3j, 3k, 3l (Task 12) | Task 12 broadcast | — |
| 3g-R7 | 3g | S | 0.8.0 (spec), relays | soft: 3g Task 13b needs 3c Task 10b on `phase-3` (in 0.8.0) | `docs/spec.md` | spec E-10 line: part poses are swapped with the pose pool; relay to 3h (Task 6b), 3j, 3k, 3l | done: spec E-10 clarification (part poses swapped with the pose pool) at the 3c merge; relayed to 3h, 3j, 3k, 3l with the pickup | 398e7fc (0.8.0) | — |
| 3h-R1 | 3h | E | 0.9.0 | no | `package.json` | `exports` `./kits/*/view` and `./kits/*`; package test for six kit entry points (verified: the test, skipped below 0.9.0, is in `test/package-phase3.test.mjs`) | test landed; exports at 3h's merge | test: 02a7c86 (Task 8); exports pending | `test/package-phase3.test.mjs` (kit rows, resolve test) |
| 3h-R2 | 3h | P | 0.7.3 | no | `test/purity.test.mjs`, `testing/purity.js` | kit `sim.js` files in the scanned sim roots (verified: `simRoots` in 9b05197) | done | 9b05197 (Task 7) | `test/purity-phase3.test.mjs` |
| 3h-R3 | 3h | X | 0.8.0 | no | 3c `world.js` | expose `world.engine`; forward `fixInternalEdges` to `heightfieldDesc`; run `world.own` callbacks before freeing Rapier on `despawn`/`clear()`/dispose (3c accepted) | met by 3c: `world.engine`, `heightfield` forwards `fixInternalEdges`, owned frees run before Rapier objects on despawn/clear/dispose (3c Task 10, forwarded 3h C2/C3) | 676ecf1 (merged ac2c32a, 0.8.0) | 3c `test/world-step.test.mjs`, `test/world-entities.test.mjs` |
| 3h-R4 | 3h | S | 0.9.0 | no | `CHANGELOG.md` | 0.9.0 kits lines, M-10 `materialAt`, D4 pair friction `grip` | at the Wave B merge | — | — |
| 3h-R5 | 3h | S | 0.9.0 | no | `docs/field-notes.md` | number 3h's candidates from #110 (next free number, Procedure F) | at the merge | — | `test/field-notes.test.mjs` |
| 3i-R1 | 3i | X | 0.8.0 (or 0.10.0) | no | 3c `src/sim/world/install.js` | `installNet(engine)` when `game.net?.world`; `engine.netPart?.attach(world)` after each World | attach part met by 3c (`engine.netPart?.attach(world)` per new World; unseat and dispose if it throws); `installNet` part open as 3c-R7 | c4f87cc, 5953b38 (merged ac2c32a, 0.8.0) | `test/world-engine.test.mjs` (3i hook) |
| 3i-R2 | 3i | X | 0.8.0 (or 0.10.0) | BLOCKS 3i Task 10 (not open yet) | 3c `src/sim/world/world.js` | `world.net?.guard` in `spawn`, `despawn`, `add`/`remove` (net part only), never `clear()`/dispose | met by 3c: `world.net?.guard` on spawn (with the desc), despawn and `net` add/remove, never from `clear()`/`dispose()` | 4ad4dcd, 676ecf1 (merged ac2c32a, 0.8.0) | `test/world-entities.test.mjs` (3i net seam) |
| 3i-R3 | 3i | S | 0.10.0 | no | `docs/spec.md`, overview §4.11, `CHANGELOG.md` | Contract issues 1–10 into spec §4.3/§4.4 and overview §4.11; user decisions (other tractors solid; NET_VERSION 4); CHANGELOG 0.10.0 | at the 3i merge | — | — |
| 3i-R4 | 3i | — | 0.10.0 | no | relay to the 3l writer | Tractor migration needs (rename `PLAYER.body` to `coat`, `TRAIN` fields and hooks, CI-15, honk) | relayed to 3l with the 0.8.0 pickup (Task 12) | Task 12 broadcast | — |
| 3j-R1 | 3j | G | after 3j Task 22 | no | `games/package-lock.json` | lock Rally 0.4.0; later prune Rally's unused `pngjs`, `@gltf-transform/core`, `esbuild` | at 3j's Task 22 / merge, on `feat/lion-hawk-3` | — | — |
| 3j-R2 | 3j | S | at the 3j merge | no | engine `docs/plans/`, `docs/field-notes.md` | copy `games/rally/docs/plans/2026-10-13-phase-3j-rally-notes.md`; number its candidates (next free) | at the merge (Procedure F) | — | `test/field-notes.test.mjs` |
| 3j-R3 | 3j | — | — | no | — | contract issues 1–9 | done at reconciliation | n/a | — |
| 3j-R4 | 3j | — | 0.8.0, 0.9.0 | no | relay | tell 3j when 0.8.0 and 0.9.0 are integrated | 0.8.0: in the Task 12 pickup; 0.9.0: at that gate | Task 12 broadcast (0.8.0) | — |
| 3j-R5 | 3j | X | 0.8.0 | no | 3b `validateCollider` | drop 3b's `round` < smallest `half` bound | met: 3b ruling 3j #1, `box` `round` any finite > 0, no upper bound (3c-R5) | 3b 449c6ab (0.7.4) | `test/sidecar-collider.test.mjs` |
| 3j-R6 | 3j | X | 0.9.0 | no | 3e light rig | `lights.follow(x, z, y = 0)` | met by 3e (`src/view/render/lights.js` `follow(x, z, y = 0)`) | 61a7014 (0.7.5) | 3e `test/render-lights.test.mjs` |
| 3j-R7 | 3j | — | 0.8.0 + 0.9.0 | soft: 3j Task 15 | 3c Task 10b, 3g Task 13b | per-step part poses for Rally's car | 3c part on `phase-3` in 0.8.0 (097c7ac); 3g Task 13b at the 0.9.0 merge | 097c7ac (0.8.0, 3c part) | 3c `test/world-parts.test.mjs` |
| 3k-R1 | 3k | G | 3k Tasks 3, 23 | no | `games/package-lock.json` | refresh after Pig Pens' `package.json` changes (scripts; 2.2.0); prune unused `esbuild`, `pngjs` | on `feat/lion-hawk-3` when 3k reports each change | — | — |
| 3k-R2 | 3k | G | 0.7.5 | no | `games/test/workspace.test.mjs` | narrow 'engine imports no three' to the sim roots | done (Task 13, = 3e-R2) | four43 f0f2d12 | `games/test/workspace.test.mjs` |
| 3k-R3 | 3k | — | — | no | — | browser runs under `/tmp/claude-1000/lion-hawk-browser.lock`; `TMPDIR=$SCRATCH` for `servePigPens` | process; restated in the pickup | n/a | — |
| 3k-R4 | 3k | S | at the 3k merge | no | engine `docs/plans/` | copy 3k's notes and number candidates | at the merge. Ruling P6 (contract 3j #8): the notes live under `games/pig-pens/docs/plans/`, not `games/pig-pens/docs/phase-3k-notes.md`; told in the pickup | — | `test/field-notes.test.mjs` |
| 3k-R5 | 3k | E | 0.9.0 | soft: 3k tasks that import them stop | exports | `lion-hawk/view` `createOrbitRig`, `makeProject`, `createTiltShift`, `sampleAnimTable`, `disposeTree`; `lion-hawk/kits/vehicle` `createVehicle` (wheel `part`), `VEHICLE_SYSTEM`; `lion-hawk/kits/fx/view` `createParticles`; `lion-hawk/build`; part poses (3c 10b, 3g 13b, 3h 6b) | `lion-hawk/build`, `createTiltShift`, `disposeTree` and 3c 10b on `phase-3` now (0.7.5/0.8.0); the rest with 3f/3g/3h at 0.9.0 (their E requests; check `VEHICLE_SYSTEM` is in 3h's list at that merge) | partial: 518d813, f7c1ee3 | `test/package-phase3.test.mjs` |
| 3k-R6 | 3k | — | — | no | — | desktop e2e opening unchanged (one Hand-drag assertion added) | noted; the probe needs no change | n/a | — |
| 3l-R1 | 3l | G | 3l Task 3 | no | `games/package-lock.json` | lock after `tractor-pickup/package.json` adds `meshoptimizer` (devDependency) | on `feat/lion-hawk-3` when 3l reports it | — | — |
| 3l-R2 | 3l | G | as needed | no | `games/test/**` | update workspace tests that reference `tractor-pickup/build.py`, `src/assets.json`, `TP_MP` or the old `test/mp.harness.mjs` world | when 3l deletes them (gate drops `TP_MP=engine` once `test/mp.engine.harness.mjs` is gone) | — | — |
| 3l-R3 | 3l | C | — | no | — | CI-3 per-material tier only if R1 forces `lambert` and the gold look is lost; CI-11, CI-14, CI-16 settled | open, conditional | — | — |
| 3l-R4 | 3l | S | at the 3l merge | no | `docs/field-notes.md` | number 3l's candidates (next free) | at the merge (Procedure F) | — | `test/field-notes.test.mjs` |
| 3l-R5 | 3l | X | 0.9.0 | soft: 3l Task 13b | 3h coverage kit | `washes` entries `{ at(x, z), washTime }` | in 3h's plan (reconciliation addition); lands at the 3h merge | — | 3h coverage tests |
| 3l-R6 | 3l | X | 0.9.0 | no | 3f Task 8b, 3e | paint (`PAINT`, hue, `repaint`); 3e accepts `render.paint` | 3e part met (0.7.5); 3f Task 8b at the 3f merge; integrator confirms at Wave B (3e-R3) | 61a7014 (3e part) | 3f paint tests |
| 3l-R7 | 3l | — | 0.9.0 | soft: 3l Tasks 13, 16, 23 | 3c 10b, 3g 13b, 3h 6b | part poses on `phase-3` | 3c part in 0.8.0 (097c7ac); 3g/3h at 0.9.0 | 097c7ac (0.8.0, 3c part) | — |
| P7 | 3m pre-flight | G | at the 3l merge | yes: Task 18 refuses the 3l merge without it | `games/tractor-pickup/package.json` | 3l adds `"test:peers": "node --test test/net.peers.browser.mjs"` so the gate runs the two-page `peers()` test | told in the pickup (via the controller) | — | gate `test:peers` step |

## Early landings

An early landing is a patch release (Procedure M, then Procedure G with `--only engine,workspace`, a CHANGELOG entry and a tag). The wave's minor version comes with the last merge of the wave.

| Needs | Landing | Why | Hardness |
|---|---|---|---|
| 3c Task 17 needs 3b on `phase-3` | 3b: landed as 0.7.4 (`v0.7.4`, 2026-10-14) | base library as the default registry | soft: otherwise request 3c-R3 at the Wave A merge |
| 3d Task 16 needs 3b | same 3b landing (0.7.4) | real registry and `validatePhys` | soft: otherwise the integrator runs it at the Wave A merge (3d-R4) |
| 3g Task 11 needs 3e | 3e: landed as 0.7.5 (`v0.7.5`, 2026-10-14) | sync imports `src/view/render/hygiene.js` | hard: 3g stops after Task 10 and reports |
| 3g Task 15 needs 3f | 3f before 3g Task 15 (3g-R1) | crowd imports `animTable.js` and `test/helpers/glb.mjs` | hard: same |
| 3f stub replacement needs 3e | 3e on `phase-3` in 0.7.5; stubs replaced at the 3f/3g merges (3e-R3, 3f-R6) | 3f's `assets/index.js` and `materials/compiler.js` replace 3e's stubs | at the Wave B merge |
| 3f Task 0 needs Wave A (0.8.0) on `phase-3` | Wave A merge: done, `v0.8.0` (3f cut from it) | `defineMaterials`; `meshoptimizer` resolvable | hard: 3f is cut from `phase-3` after Wave A |
| 3h and 3i need Wave A (0.8.0) | Wave A merge: done, `v0.8.0` (cut from it) | World, `engine.builtin`, `heightfieldDesc` | hard: cut from `phase-3` after Wave A |
| 3g Tasks 1–10 need 0.8.0; Task 13b needs 3c Task 10b | Wave A merge: done, `v0.8.0` (097c7ac in it) | `partXf` is in 3c's plan | hard |
| 3e-R4 timer assertion needs 3c | 3c on `phase-3` (0.8.0) | `world.stats.stepMs` | done: `test/render-timer.test.mjs` (fe3e405, 0.8.0) |

## Broadcasts

| Date | To | Message |
|---|---|---|
| 2026-10-14 | controller | Freeze before the 0.7.3 `--ff-only` of `phase-3` (constraint 16): no other worktree was active, so a no-op. |
| 2026-10-14 | controller | Procedure P pickup for 0.7.3 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.3.log`); no open game or engine worktree to relay to. Freeze lifted. |
| 2026-10-14 | controller | Freeze before the 0.7.4 `--ff-only` of `phase-3` (constraint 16): recorded as a no-op (posted through the controller's dispatch; no suite was started by 3m against the main checkout meanwhile). |
| 2026-10-14 | controller → 3c, 3d | Procedure P pickup for 0.7.4 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.4.log`): merge `phase-3`, `npm install`, rerun suites; 3c-R5 done in 3b; 3b-R5 forwarded to 3c; 3c Task 17 and 3d Task 16 unblocked. Freeze lifted. Text in `.superpowers/sdd/2026-10-13-phase-3m-integration/land-3b-report.md`. |
| 2026-10-14 | controller | Freeze before the 0.7.5 `--ff-only` of `phase-3` (constraint 16): treated as a no-op as at 0.7.4 (3m posted nothing itself; no suite was started by 3m against the main checkout meanwhile). |
| 2026-10-14 | controller → 3c, 3d | Procedure P pickup for 0.7.5 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.5.log`): 3e is on `phase-3`; merging it is optional for 3c and 3d (no view code used). Freeze lifted. Text in `.superpowers/sdd/2026-10-13-phase-3m-integration/land-3e-report.md`. |
| 2026-10-14 | controller | Freeze before the 0.8.0 `--ff-only` of `phase-3` (constraint 16): no-op by controller ruling (no game worktree existed; 3c and 3d had finished). |
| 2026-10-14 | controller → 3f, 3g, 3h, 3i, 3j, 3k, 3l | Procedure P pickup for 0.8.0 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.8.0.log`) to all seven new worktrees, with: the game start rule (asset and sim steps from 0.8.0, view steps at 0.9.0, Tractor's net step at 0.10.0; overview §5.1); the 0.8.0 reconciliation additions (part poses `partXf`/`world.partXfPrev`, box `round` > 0 and the registry hash rule `2f4f4f95`, physics pausing while a scene loads; ruling P8); 3d-R3 items a–f; 3e-R6; 3g-R6; 3g-R7; 3i-R4 (to 3l); rulings 3c-R8 (CI-15 design stands) and 3c-R9; process rulings P6 (game notes under `games/<game>/docs/plans/`) and P7 (3l `test:peers`). Freeze lifted. Text in `.superpowers/sdd/2026-10-13-phase-3m-integration/task-11-12-report.md`. |

## Field-note map

Closed at 0.8.0: #1, #2, #28, #64, #106 (3c), #11 (3d). Next free: #138.

| # | From | Candidate |
|---|---|---|
| 110 | 3a | 1: `bindGesture` reads the event clock (#109 outcome) |
| 111 | 3a | 2: `untilLoaded` waits for commands pending at the call (#100 outcome) |
| 112 | 3a | 3: `reset()` in every `createEngine`; tune after all `mp()` peers (#108 outcome) |
| 113 | 3a | 4: focus not moved after a fallback swap (G-E2 parked minor) |
| 114 | 3a | 5: a late-dispatched lift can still read as a hold (#109 residual) |
| 115 | 3b | 1: the material hash skips `look`/`game`; a stale baked `look` is not caught (contract issue 6) |
| 116 | 3b | 2: M-8 pairs are order-dependent; moving body `a`, ground `b` |
| 117 | 3e | 1: a renderer that cannot start is reported as `render: …` and the page runs on (RF1) |
| 118 | 3e | 2: tilt-shift on compiles 4 programs (3 passes + a render-target variant); warm with post on |
| 119 | 3e | 3: SwiftShader handles half-float MSAA (`samples: 4`) |
| 120 | 3c | Rapier handles are NaN-boxed; handle 0 is valid and falsy |
| 121 | 3c | mass changes apply next step unless recomputed |
| 122 | 3c | moving a fixed body needs collider propagation before queries |
| 123 | 3c | a body can fall asleep at the end of the step that moved it |
| 124 | 3c | read-after-sleep mutation not observable in Rapier 0.21.0 |
| 125 | 3c | `used_heap_size` excludes ArrayBuffer/WASM memory |
| 126 | 3c | `body.sleep()` zeroes velocity |
| 127 | 3c | despawn while iterating a live `with()` skips entities |
| 128 | 3d | 1: `quantize()`/`meshopt()` move mesh nodes |
| 129 | 3d | 2: `GLTFLoader` sanitises node names |
| 130 | 3d | 3: multi-material part loads as a `Group` |
| 131 | 3d | 4: flat decal primitives need a flat-group skip |
| 132 | 3d | 5: `bake --check` misses config changes |
| 133 | 3d | 6: pet anim tables nlerp → slerp |
| 134 | 3d | 7: Rapier f32 principal-frame drift |
| 135 | 3d | 8: `prune` drops single-colour textures |
| 136 | 3d | 9: `GLTFLoader` single node namespace |
| 137 | 3d | 10: dedupe test needs an engine-side importer |

## Contract issues (as reconciled)

## Removed or renamed tests

| Version | Plan | Test | Why |
|---|---|---|---|
| 0.8.0 | 3c | `test/world-bodies.test.mjs` "a collider needs a registry…" → "without a registry the base library applies…" | Task 17: base library is the default registry |
| 0.8.0 | 3c | `test/checks-materials.test.mjs` "a game without defs.materials is refused…" → "…is checked against the base library" | Task 17 |
| 0.8.0 | 3c | `test/engine.test.mjs:232` expected schedule gains `lh.world.swap`, `lh.physics.*` | 3c-R1 (approved) |

## Hand-off

## Field note candidates
