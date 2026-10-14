# Phase 3c notes: World, entities and the Rapier wrapper

Plan: `docs/plans/2026-10-13-phase-3c-world.md`. Branch `phase-3-world`.

## Outcome

All 18 tasks (1-17 and 10b) are done on `phase-3-world`, plus the final-review fix wave. The World (entities, live queries, pool with prev/curr halves, bodies, colliders, materials, joints, events, heightfield, partXf) wraps an injected Rapier 0.21; the engine gives each main scene its own World and runs `lh.world.swap` and `lh.physics.*`; headless and `checks.determinism`/`simPurity`/`zeroAlloc`/`materials` cover it. Since Task 17 the base material library is the default registry. Nothing under `src/` imports Rapier. Open integrator items are listed under "Integrator requests"; none blocks the Wave A merge.

## Decisions

(Controller rulings, verbatim from `.superpowers/sdd/2026-10-13-phase-3c-world/rulings.md`.)

- Ruling: 3i-R1's `installNet(engine)` call is NOT added in 3c; only `engine.netPart?.attach(world)` lands (Task 11) — 3m plan Task 15 step 1 (integrator ruling P5) lands installNet as a 0.9.x X request after 3i merges because src/sim/net/install.js does not exist yet — cost if wrong: integrator adds a 2-line call + test later.
- Ruling: Integrator request 1 (test/engine.test.mjs:232) is approved — contract-issues "3c World and physics" says "Approved" — cost if wrong: one-line revert.
- Ruling: T6 test "a dynamic body is moved, woken and stopped; keep keeps its velocity" — set the velocity after sleep: `body.sleep(); body.setLinvel({x:3,y:0,z:0}, false)`; code unchanged — sleep() zeroes velocity in Rapier, test as written cannot pass — cost: a weaker keep test.
- Ruling: T10 test "clear() with physics" — register the joint-validity probe with `w.own(b, …)` (b is released first and frees the shared joint) — the plan's probe on `a` sees an already-freed joint — cost: none functionally.
- Ruling: T10 code — `stats.stepMs`/`stepMsTotal` return 0 once disposed (`ph && !disposed ? … : 0`) — the plan's getter leaks the last value after dispose and its own test fails — cost: none.
- Ruling: T16 Step 3 mutation — use "delete `if (s < hint) hint = s;` in pool.free" (the plan's "highest free slot" mutation is a no-op) — cost: none.
- Ruling: every `$UNIT test/` run (T11 Step 7, T17 Step 4, Done when) excludes the six browser suites (e2e, bridge-e2e, hold-e2e, load-e2e, touch-e2e, untilLoaded-e2e); controller runs them once at the end under flock — GC5 forbids browsers under unit caps — cost: one late browser run.
- Ruling: T13 `determinism()` builds ONE policy wrapper per run reading a run-level step counter (not a new wrapper per step) — per-step wrappers break stateful policies (#37) and grow headless's scratch Map per step (R-8) — cost: none.
- Ruling: T10 read-after-sleep test kept though not mutation-observable in Rapier 0.21.0; recorded in notes as the plan asks — cost: the `|| r.awake` line is unguarded by a failing test.
- Ruling: CI-15 — 3c keeps "guard never from clear()/dispose()" (3i #8 ruling); CI-15 can only be settled by "3l re-requests a host frame"; logged as a non-blocking integrator request — cost: integrator relays to 3i/3l.
- Ruling: T9 Step 6 runs both test/purity.test.mjs and test/purity-phase3.test.mjs (the Rapier ban lives in the latter) — cost: none.
- Ruling: T9 net-seam test also asserts `w.dispose()` never calls `net.guard` (3i-R2 says "never in clear() or dispose") — forwarded request needs its own assertion — cost: one extra assertion.
- Ruling: `isVec` is defined once, exported from src/sim/world/pool.js (Task 5), and imported by place.js, world.js and colliders.js instead of three verbatim copies — rubric treats verbatim duplication as Important; pool.js is the earliest file — cost: colliders.js imports from ../world/pool.js.
- Ruling: T11 `checkPhysics` reuses `mergeParams` for its param-key check instead of repeating the loop and message — duplication — cost: none if the message is identical.
- Ruling: T10b "despawn stops the swap" also asserts the despawned entity's prev part pose stays unchanged across a step — the plan's test asserts only curr, which swap never touches — cost: none.
- Ruling: 3b-R5 (forwarded mid-run) — the plan does NOT call 3b's validateCollider or materialRefs (src/defs/sidecar.js does not exist before 3b merges; P5 forbids src/defs imports before Task 17). Adopt both in Task 17: world.js spawn runs validateCollider(entry, { inline: true, materials: registry, where: `spawn '<model or first tag>'`, path: `colliders[i]` }) on every inline collider AFTER 3c's own shape/material checks (so Task 8/9 messages such as `unknown collider shape 'ball' (use 'sphere')` keep winning on the cases they cover) and before building the Rapier desc; checks.materials uses materialRefs(phys) for sidecar refs. New tests in world-base-materials: an inline `paint-*` material and an unknown collider field throw at spawn with 3b's message; checks.materials reports sidecar refs via materialRefs. Notes record the adoption — cost if wrong: Task 17 touches error ordering; reorder later.
- Ruling: Task 9 minors 1 (joint() discards own() offs → closures retained on long-lived entities), 2 (world-scoped own(fn) after dispose silently never runs; add live()), 5 (net-seam test should show spawn guard gets the desc, e.g. log `'id' in x`) are carried into the Task 10 dispatch since Task 10 edits world.js and world tests anyway — cheap, real, forwarded-request evidence — cost: slightly larger Task 10 diff.
- Ruling: fix it anyway (hoist a module-level fail(), direct x/y/z checks on linvel/angvel, no per-call arrays/closures) — the always-on check runs inside every headless step including the T14 zeroAlloc-style runs, and GC3/T-13 forbid retained per-step garbage in shared paths; the plan text is the argument, the constraint wins — cost: a few lines; none if wrong.
- Ruling: checks-alloc grows from 3 to 4 tests (unknown-policy P6 test) — covers a fix the review required — cost: Done-when count +1.
- Ruling: setMaterial on a body.mass entity re-solves the scale so the body keeps its declared mass (D3 "weighs exactly that") — a slide/grip toggle must not change weight — cost: one extra recompute per setMaterial.
- Ruling: checks.simPurity's missing Rapier rule is an integrator request (plan text follows scanPurity defaults; games' roots may include game.sim.js that injects Rapier) — not changed in 3c — cost: game sim trees importing Rapier pass until the integrator rules.

## Done-when evidence

Per-file runs after the fix wave (5953b38), one file at a time, each with
`systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 $WT/test/<file>.test.mjs`:

| File | pass/total | Plan count |
|---|---|---|
| physics-fixtures | 4/4 | 4 |
| physics-rapier | 8/8 | 8 |
| physics-groups | 4/4 | 4 |
| physics-heightfield | 3/3 | 3 |
| world-pool | 6/6 | 6 |
| world-place | 6/6 | 6 |
| physics-events | 4/4 | 4 |
| physics-colliders | 6/6 | 6 |
| world-entities | 9/9 | 9 |
| world-bodies | 11/11 | 11 |
| world-step | 12/12 | 12 |
| world-parts | 3/3 | 3 |
| world-engine | 15/15 | 15 |
| world-headless | 5/5 | 5 |
| checks-determinism | 5/5 | 5 |
| checks-alloc | 4/4 | 3 (+1, ruling: unknown-policy P6 test) |
| checks-materials | 4/4 | 4 |
| world-replay | 4/4 | 4 |
| world-base-materials | 5/5 | 3 (+2, 3b-R5 ruling) |

Total 118 new tests (plan: 115; +1 checks-alloc, +2 world-base-materials).

Whole non-browser suite (every `test/*.test.mjs`, 85 files, minus the 7 in `.superpowers/sdd/2026-10-13-phase-3c-world/browser-tests.txt`), same command with all files: 657 tests, 639 pass, 0 fail, 18 skipped, 0 cancelled. It includes `test/engine.test.mjs` with Integrator request 1 applied and both purity suites.

Browser suites at 6db170b (run by the controller under flock): 7 files, 20/20 pass.

`grep -rn rapier3d src/` (comments and strings only):

```
src/sim/physics/heightfield.js:2:// rapier3d-compat 0.14–0.21: heightfield(nrows, ncols, ...) takes SUBDIVISION counts (rows along z, columns along x),
src/sim/physics/rapier.js:39:  if (typeof R.World !== 'function') throw new Error('physics: physics.rapier must be the @dimforge/rapier3d-compat module');
```

## Progress

| Task | Commit | Tests (file: pass/total) | Notes |
|---|---|---|---|
| 1 | 0770860 `test(world): fixture registry, sidecars and Rapier 0.21 pin for 3c` | test/physics-fixtures.test.mjs: 4/4 | Fixtures only (rapier.js, materials.js stand-in, phys.json, engine.js stub); no src/ change |
| 2 | 9e62dc0 `feat(physics): Rapier world creation with pinned 0.21 parameters, timed step and init check (#1, #106, D9)` | test/physics-rapier.test.mjs: 8/8 | src/sim/physics/rapier.js (pins, mergeParams, checkRapier, createPhysics); mutation on normalizedPredictionDistance caught by PINNED test and reverted |
| 3 | b198f3e `feat(physics): named collision groups with Rapier's membership/filter packing` | test/physics-groups.test.mjs: 4/4 | src/sim/physics/groups.js (createGroups, frozen bit map, non-enumerable mask); Rapier agreement test on contactPair |
| 4 | dd3c9e6 `feat(physics): heightfieldDesc takes row-major heights and pins Rapier's column-major layout (R4)` | test/physics-heightfield.test.mjs: 3/3 | src/sim/physics/heightfield.js (row-major in, Rapier subdivision/column-major out); transpose mutation caught by the ball-rest and layout tests, reverted |
| 5 | 71a53cb `feat(world): transform pool with prev/curr halves and lowest-first slots (E-10)` | test/world-pool.test.mjs: 6/6 | src/sim/world/pool.js (STRIDE 14, createPool, makeXf, deadXf); also exports isVec (controller ruling, shared by place/world/colliders); growth-capture mutation on makeXf caught by the growth test, reverted |
| 6 | c706a4b `feat(world): place writes prev and curr and moves bodies with their colliders (E-8)` | test/world-place.test.mjs: 6/6 | src/sim/world/place.js (createPlacer: place, socket, xfPrev; isVec imported from pool.js per controller ruling). Controller ruling 2: the dynamic-body test sets velocity after sleep (`body.sleep(); body.setLinvel(..., false)`) because sleep() zeroes velocity; implementation as briefed. Mutation: removing the PREV write fails the no-smear test, reverted |
| 7 | c9ed2e9 `feat(physics): contact and sensor events drained in Rapier order (M-5)` | test/physics-events.test.mjs: 4/4 | src/sim/physics/events.js (createEventDrain: contacts then sensors, null ids for raw colliders, solver point with midpoint fallback). Brief has no mutation step; RED was ERR_MODULE_NOT_FOUND |
| 8 | 550892c `feat(physics): colliders from sidecar entries with √f/Multiply and Max combine rules (M-4, M-9, D4)` | test/physics-colliders.test.mjs: 6/6 | src/sim/physics/colliders.js (shapeDesc, materialFor, applyMaterial). isVec imported from world/pool.js per controller ruling (no local copy). Mutation: friction rule Average fails the combine-rule test and the slide test (1.566 vs 2.793), reverted |
| 9 | 4ad4dcd `feat(world): createWorld with live queries, deterministic ids, bodies, materials and mass (E-1..E-9, M-4, M-6, D3)` | test/world-entities.test.mjs: 9/9; test/world-bodies.test.mjs: 11/11 | src/sim/world/world.js verbatim from the brief except isVec imported from pool.js (ruling 1). Added assertions: dispose() never calls net.guard (3i-R2) and dispose runs own frees once. Decisions: colliders without a body sit on a fixed body; body.lock { rot } / { x, y, z } rotation axes; omitted groups member/filter = every group; all throwing checks precede any Rapier object and the id; World desc keys are not copied onto the entity, others are; id/sockets cannot be given; add/remove refuse id, tags, model, body, colliders, sockets, heightfield; despawned entity keeps id, tags, game fields and a frozen last pose (no slot). Mutation: creating a body and taking an id before the collider validation fails the nothing-behind test (and 4 more), reverted. Purity (purity + purity-phase3): 10/10 |
| 10 | 676ecf1 `feat(world): step pieces (swap, step, read, events), #2 re-sleep, digest, heightfield entity and audit` | test/world-step.test.mjs: 12/12; test/world-entities.test.mjs: 9/9; test/world-bodies.test.mjs: 11/11 | world.js per brief with controller rulings: stats.stepMs/stepMsTotal 0 after dispose; clear() probe registered on b. Task 9 follow-ups: joint() keeps both own() off handles and calls them in free (asserted via b[INTERNAL].own in the despawn test); world-scoped own(fn) calls live(); net-seam test asserts spawn guard got the desc. Mutations: removing the sleepers loop fails the #2 test; dropping fixInternalEdges fails the forward test; joint offs, own live() and guard-desc mutations each fail their assertion. Read-after-sleep mutation not observable in 0.21.0 (`!asleep || r.awake` -> `!asleep` still passes); code and test kept. Forwarded: 3h C2 (heightfield forwards fixInternalEdges), 3h C3 (owned frees before Rapier objects/world on despawn, clear, dispose), 3i-R2 (spawn guard sees desc) |
| 10b | 097c7ac `feat(world): partXf part poses with prev/curr, swapped by lh.world.swap (3g request 7)` | test/world-parts.test.mjs: 3/3 | world.js partXf: spawn/add/remove/forget, partXfPrev, swap copies curr to prev in id order (parted list). Controller ruling: despawn test also holds the despawned entity's prev object (`f[INTERNAL].parts[0].prev`, read before despawn) and asserts it stays put after curr changes and a swap. Mutations: no parts loop in swap fails the first two tests; despawned parts kept in the swap list fails the despawn test with `actual 7, expected 3` (not a crash); both reverted. Test count stays 3 (RED on HEAD world.js: fails as expected). World files 47/47 |
| 11 | c4f87cc `feat(engine): scene-owned World, lh.world/lh.physics systems, physics paused during loads, builtin seam, timer and state digest (S-3, #106)` | test/world-engine.test.mjs: 15/15; suite minus 6 browser files: 534 pass / 0 fail / 19 skipped (553) | install.js, engine.js edits (a)-(i) by anchor, fixture game.js, test/engine.test.mjs line 232 (approved). checkPhysics reuses mergeParams (message rewritten `physics: params.` -> `physics.params.`; groups errors `physics:` -> `physics.groups:`). installNet not landed (integrator after 3i); netPart?.attach only. Mutations: closing the World in doGo fails 3 tests; dropping the loading check fails the load-pause test; read ignoring `stepped` fails the asleep-post test; all reverted |
| 12 | f82fe70 `feat(test): headless World access and the always-on finite check over xf and bodies (T-1, T-5)` | test/world-headless.test.mjs: 5/5; with headless+replay: 32/32; suite minus 6 browser files: 539 pass / 0 fail / 19 skipped (558) | testing/invariants.js worldFinite, testing/headless.js (world/find/one/get/spawn/despawn/place, finite after each step). Brief code used verbatim; no mutations required |
| 13 | 5afe43c `feat(test): checks.determinism and checks.simPurity (T-10, T-12)` | test/checks-determinism.test.mjs: 5/5 | testing/checks.js per brief with rulings: ONE input wrapper per run reading a run-level step counter (headless scratch keyed on fn identity). headless resolve() is not exported, so policyOf kept; unused v8/vm/createEngine imports dropped (Tasks 14/15 re-add). Mutation: per-step wrapper fails the named-policy scratch assertion (scratch objects: actual 1/expected 2 mismatch, per-step wrappers), reverted |
| 14 | db5fbca, 4630bd2 | test/checks-alloc.test.mjs: 4/4 | testing/checks.js zeroAlloc per brief, input via the shared policyOf (resolved once per run, no second copy), v8/vm/createEngine imports re-added. Named policies get stand-in h = { engine, seed } (h.find/world/time absent; deferred minor). Measured: 30 crates 3000 steps -31 KB, 10000 steps +33 KB (limit 64 KB). Mutation: catch test (kept Float64Array per step) fails the scene as expected (ok false, growth over 64 KB). No RED run of the missing export (impl written first) |
| 15 | a93c454 `feat(test): checks.materials over sidecars, inline entries and the registry hash (T-14)` | test/checks-materials.test.mjs: 4/4 | testing/checks.js materials per brief and added to the checks object; (Task 17: the throw is gone; a game without defs.materials is checked against the base library). No src/defs import (P5). Brief has no mutation step; RED was SyntaxError (no export named materials) |
| 16 | 2343b2c `test(world): full physics scene is deterministic and replays across clear()` | test/world-replay.test.mjs: 4/4 | Test only, brief verbatim; no code change needed (passed first run). Mutations (controller ruling): deleting `if (s < hint) hint = s;` in pool free fails the slot-reuse test (actual 16, expected 1); deleting `nextId = 1;` in clear() fails the tape test on the cart id (actual 33, expected 14); both reverted, 4/4 |
| 17 | 608f5d8 `feat(world): the base material library is the default registry (§4.1)` | test/world-base-materials.test.mjs: 5/5 (with world-bodies 11/11, checks-materials 4/4: 20/20); whole non-browser suite 580 tests, 561 pass, 0 fail, 19 skipped | world.js: lazy BASE registry default; validateCollider on inline entries after the shape/material/density checks and after shapeDesc (so 3c messages are unchanged; the resolved material id stands in for a desc.material override); checks.materials: base default and materialRefs (its locations are `<model>.colliders[i]`, so `where` prefixes `models.` and keeps sidecar order; Task 15 tests unchanged except the replaced one). No paint-* test: 3b reserves `paint-` ids, so a paint id is never in the registry and 3c's own unknown-material check fires first. 3b-only checks tested instead: unknown field, non-unit q. |
| Final fix wave | 5953b38 `fix(world): final-review fixes: setMaterial keeps body.mass, no orphaned World on attach throw, xf/partXf, heightfield tags and key, P6 disposes` | world-bodies 11/11, world-engine 15/15, world-parts 3/3, world-step 12/12, world-entities 9/9, world-base-materials 5/5, world-headless 5/5; whole non-browser suite 657 tests, 639 pass, 0 fail, 18 skipped | setMaterial re-solves k on a body.mass entity (D3; mutation dropping the re-solve fails setMaterial test, 1308 vs 100); seat.open unseats and disposes the World when netPart.attach throws (mutations: keep seat / skip dispose each fail the 3i hook test); remove(e, 'xf') refuses while partXf; heightfield() checks tags; 'heightfield' is a World key; makeXf comment; world-engine/world-headless dispose every engine's World in afterEach (P6); paint-* inline material pinned (refused by 3c's unknown-material check). Test counts unchanged |

## Contract issues met

(Each "Contract issue:" from the plan, with what the implementation did and the test that pins it.)

- **Default groups.** An omitted `member` or `filter` is every group (Rapier's default); an explicit `member: []` means none (Task 3). Pinned: physics-groups "names get bits in order; mask packs membership high and filter low" (`g.mask()` is `0xffffffff`); world-bodies "groups, sensor and contact flags reach every collider".
- **Physics pauses during a scene load** (CI-16, S-3). While `engine.loading.active`, `lh.physics.step` skips the Rapier step and `read`/`events` skip with it; `lh.world.swap` still runs (Task 11). Pinned: world-engine "the World does not step while a scene loads; prev catches up; physics resumes when the load ends (S-3, CI-16)" and "a load build that rebuilds in place: a body spawned asleep stays asleep when physics resumes (#2, CI-16)".
- **The view needs each entity's pool slot.** `e.xf.slot` is read-only; `world.xf.pool` is re-read per frame because growth replaces it (Task 5). Pinned: world-pool "xf accessors read and write curr through growth; a body entity refuses writes" and "a full pool doubles inside alloc and keeps every pose"; world-entities "despawn keeps a frozen last pose; …" (`slot` gone after despawn).
- **Raw colliders in events.** `contact.a`/`b`, `materials[i]`, `sensor.sensor`/`other` are `null` for a collider no entity owns (Task 7). Pinned: physics-events "a raw collider without an entity reports null ids and materials".
- **`body.lock: { x, y, z }`** is per-axis rotation locks; `{ rot: true }` locks all; translation locks stay raw Rapier (Task 9). Pinned: world-bodies "colliders without a body sit on a fixed body; kinematic bodies work; lock and sleep reach Rapier".
- **Colliders without `body`** sit on a fixed body (Task 9). Pinned: the same world-bodies test.
- **Inline shapes.** `'sphere'` only (`'ball'` throws `unknown collider shape 'ball' (use 'sphere')`); `box` takes `round` (Rapier `roundCuboid`) (Task 8). Pinned: physics-colliders "each sidecar shape becomes the matching Rapier shape" and "bad shapes throw before Rapier sees them".
- **Additive World members.** `world.engine`, `world.net`, `world.own(fn)`, `onSpawn`/`onDespawn`, `dispose`/`disposed`, `sys`, `audit()`, `with()` with no parts = every entity (at most 4 parts); `world.net?.guard` on spawn (with the desc), despawn and `net` add/remove, never from `clear()`/`dispose()`; `installWorld` calls `engine.netPart?.attach(world)` for each new World, and (fix wave) unseats and disposes that World if `attach` throws (Tasks 9-11). Pinned: world-entities "with() is live, cached and in id order; …", "onSpawn/onDespawn see each entity once; off stops them", "the 3i net seam: …", "without physics.rapier the World holds bodiless entities only (§4.1)" (`w.engine`); world-step "audit lists raw colliders whose combine rules override the engine's"; world-engine "3i hook: engine.netPart.attach(world) runs for every new World".
- **`checks.zeroAlloc` without `--expose-gc`** enables GC in-process (`v8.setFlagsFromString` + `vm`), because the game object cannot cross a process boundary (Task 14, controller ruling). Pinned: checks-alloc "zeroAlloc: 30 crates, a moving marker and per-step queries retain under 64 KB (T-13)" and "zeroAlloc catches a system that keeps what it allocates".
- **`checks.materials(game, { inline })`.** Inline colliders and heightfield materials are passed by the caller; runtime calls are not seen (a missing one throws at spawn) (Task 15). Pinned: checks-materials "fixture sidecars and inline entries all resolve and the hash matches (T-14)" and "every missing material is named, and a stale registry hash fails".
- **Checks input** (controller ruling). `determinism` and `zeroAlloc` take `args` and `input` as `(step) → snapshot`, a named policy or a constant; one wrapper per run (ruling). Pinned: checks-determinism "determinism takes args and an input function of the step (controller ruling)"; checks-alloc "zeroAlloc takes start args and an input(step) policy over warm and measured steps (3j #5 ruling)" and "zeroAlloc: an unknown named policy throws before an engine or World exists".
- **`read` after sleep.** curr is written for bodies awake now or at the previous read (Task 10). Pinned: world-step "the step a body falls asleep is read: the pool matches Rapier exactly once it sleeps" (the `|| r.awake` mutation is not observable in Rapier 0.21.0; see Decisions).
- **`stats.stepMs`/`stepMsTotal` are 0 without a timer** (and 0 once disposed, ruling) (Tasks 2, 10). Pinned: physics-rapier "with a timer, stats hold the last step and a running total; without one they stay 0 (#106)"; world-step "with a timer, stats.stepMs is the last Rapier step (#106); disposed Worlds ignore sys calls".
- **`add`/`remove` of `xf`** is allowed on bodiless entities; `id`, `tags`, `model`, `body`, `colliders`, `sockets`, `heightfield` cannot be added or removed; `spawn` refuses `id`, `sockets` and (fix wave) `heightfield`; (fix wave) `remove(e, 'xf')` is refused while the entity has `partXf` (Task 9, fix wave). Pinned: world-entities "add/remove: World parts are fixed; xf can be given to and taken from a bodiless entity" and "ids count from 1 in spawn order; …"; world-parts "partXf refuses a bodiless entity without xf and bad names, before an id is taken".
- **Part poses for view sync** (3g request 7). `partXf` (desc and `add`/`remove`), its swap in `lh.world.swap` and `world.partXfPrev(e, name, out)`; not in the digest (Task 10b). Pinned: the three world-parts tests.
- **`place` forms.** `q` is `[x, y, z, w]`; `place` returns `e`; `rel` without `yaw`/`q` takes the other entity's rotation (Task 6). Pinned: world-place "place { at } writes prev and curr and keeps the rotation unless yaw or q is given" and "place { rel, local } offsets in the other entity's frame and composes the rotation".
- **3b-R5** (forwarded mid-run): inline colliders are validated with 3b's `validateCollider` at spawn after 3c's own checks; `checks.materials` uses `materialRefs` for sidecar refs (Task 17). A `paint-*` id is never a registry id (3b reserves it), so 3c's unknown-material check refuses it first. Pinned: world-base-materials "3b-R5: inline colliders are validated with 3b's validateCollider at spawn" (unknown field, non-unit q, and since the fix wave an inline `paint-red`) and "3b-R5: checks.materials reports a missing sidecar material at the materialRefs location".

## Integrator requests

(None blocking.)

1. `test/engine.test.mjs:232` schedule expectation — approved; applied in Task 11.
2. Exports at the Wave A merge: `src/index.sim.js` `export { createWorld } from './sim/world/world.js'; export { heightfieldDesc } from './sim/physics/heightfield.js';` and `testing/index.js` `export { checks } from './checks.js';`.
3. Task 17 — done in-branch (3b merged at 0.7.4).
4. 3e boot passes timer — met (0.7.5).
5. 3b box `round` — met (3b).
6. Spec and field notes at 0.8.0: T-1, E-10 (`e.xf.slot`, copy-not-flip, part poses swapped with the pool), R-6 (`lh.world.swap`, `lh.physics.*`), S-3 (no World step while a scene loads); field notes statuses from "Field note candidates".
7. 3i-R1a `installNet(engine)` in the World install: not in 3c (`src/sim/net/install.js` doesn't exist); lands after 3i per 3m Task 15 ruling P5. 3i-R1b attach and 3i-R2 guard are in 3c.
8. CI-15: 3c never calls `world.net.guard` from `clear()`/`dispose()` (3i #8), so only "3l re-requests a host frame" can settle it — relay to 3i/3l.
9. `checks.simPurity` does not apply scanPurity's Rapier rule; decide whether game sim roots should be scanned with `{ rapier: true }` (`game.sim.js` may inject Rapier).

## Removed or renamed tests

- Task 17, `test/world-bodies.test.mjs`: "a collider needs a registry: without one the spawn says so" replaced by "without a registry the base library applies: base ids resolve, game ids do not".
- Task 17, `test/checks-materials.test.mjs`: "a game without defs.materials is refused until the base library is the default (Task 17)" replaced by "a game without defs.materials is checked against the base library".
- Task 11, `test/engine.test.mjs:232`: the exact built-in schedule expectation now includes `lh.world.swap` and `lh.physics.step`/`read`/`events` (Integrator request 1, approved).

## Field note candidates

(Unnumbered; the integrator numbers these from #110.)

- #1 closed: `PINNED_DEFAULTS` pins every Rapier 0.21 integration parameter; a bump fails physics-rapier "PINNED_DEFAULTS is Rapier 0.21.0's own defaults, …" and physics-fixtures' version pin. → #1 done (0.8.0)
- #2 closed: `body: { sleep: true }` re-sleeps after the first step inside the World (the `sleepers` pass in `sys.read`; world-step "#2" tests, world-engine load test). → #2 done (0.8.0)
- #28 closed: the World owns the Rapier world; view halves read `engine.world` (each main scene owns one, S-3). → #28 done (0.8.0)
- #64 closed: the always-on `finite` over the pool and body velocities runs after every headless step (`worldFinite`, world-headless). → #64 done (0.8.0)
- #106 closed: `createEngine(game, { timer })` fills `world.stats.stepMs`/`stepMsTotal`; never in `state()`. → #106 done (0.8.0)
- Rapier collider handles are NaN-boxed float64s (handle 0 is valid and falsy): never test a handle for truthiness. → #120
- `setDensity` and `setAdditionalMassProperties` take effect at the next step unless `recomputeMassPropertiesFromColliders()` is called; the World always calls it. → #121
- Moving a fixed body needs `propagateModifiedBodyPositionsToColliders()` before queries see it. → #122
- A body can fall asleep at the end of the step that moved it: the World reads it once more. → #123
- Read-after-sleep mutation not observable in Rapier 0.21.0 (`!asleep || r.awake` → `!asleep` still passes); code and test kept. → #124
- `used_heap_size` excludes ArrayBuffer and WASM memory: `checks.zeroAlloc` is blind to growth there (Rapier's heap, typed arrays). → #125
- Rapier's `body.sleep()` zeroes the body's velocity: set a velocity after `sleep()`, with `wakeUp: false`, to keep it. → #126
- Despawning while iterating a live `with()` list skips the next entity (the list shrinks under the loop): iterate backwards. → #127
