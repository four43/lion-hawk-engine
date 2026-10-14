# Phase 3c notes: World, entities and the Rapier wrapper

Plan: `docs/plans/2026-10-13-phase-3c-world.md`. Branch `phase-3-world`.

## Progress

| Task | Commit | Tests (file: pass/total) | Notes |
|---|---|---|---|
| 1 | 0770860 `test(world): fixture registry, sidecars and Rapier 0.21 pin for 3c` | test/physics-fixtures.test.mjs: 4/4 | Fixtures only (rapier.js, materials.js stand-in, phys.json, engine.js stub); no src/ change |
| 2 | `feat(physics): Rapier world creation with pinned 0.21 parameters, timed step and init check (#1, #106, D9)` | test/physics-rapier.test.mjs: 8/8 | src/sim/physics/rapier.js (pins, mergeParams, checkRapier, createPhysics); mutation on normalizedPredictionDistance caught by PINNED test and reverted |

## Contract issues met

(Each "Contract issue:" from the plan, with what the implementation did.)

## Field note candidates

(The integrator numbers these from #110.)
