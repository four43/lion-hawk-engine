# Phase 3c notes: World, entities and the Rapier wrapper

Plan: `docs/plans/2026-10-13-phase-3c-world.md`. Branch `phase-3-world`.

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
| 10 | `feat(world): step pieces (swap, step, read, events), #2 re-sleep, digest, heightfield entity and audit` | test/world-step.test.mjs: 12/12; test/world-entities.test.mjs: 9/9; test/world-bodies.test.mjs: 11/11 | world.js per brief with controller rulings: stats.stepMs/stepMsTotal 0 after dispose; clear() probe registered on b. Task 9 follow-ups: joint() keeps both own() off handles and calls them in free (asserted via b[INTERNAL].own in the despawn test); world-scoped own(fn) calls live(); net-seam test asserts spawn guard got the desc. Mutations: removing the sleepers loop fails the #2 test; dropping fixInternalEdges fails the forward test; joint offs, own live() and guard-desc mutations each fail their assertion. Read-after-sleep mutation not observable in 0.21.0 (`!asleep || r.awake` -> `!asleep` still passes); code and test kept. Forwarded: 3h C2 (heightfield forwards fixInternalEdges), 3h C3 (owned frees before Rapier objects/world on despawn, clear, dispose), 3i-R2 (spawn guard sees desc) |

## Contract issues met

(Each "Contract issue:" from the plan, with what the implementation did.)

## Field note candidates

(The integrator numbers these from #110.)
