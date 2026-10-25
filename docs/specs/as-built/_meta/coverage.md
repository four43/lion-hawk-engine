# Coverage

Source commit `7e239df`. 9 features. `inventory.py coverage` reports 0 unassigned files.

| ID | Spec | Source files | Source lines | Test files | Claims | B- statements | Lint errors | Remaining issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | [core](../core.md) | 15 | 1252 | 25 | 315 | 232 | 0 | 0 |
| F02 | [defs-and-kits](../defs-and-kits.md) | 12 | 1231 | 24 | 175 | 176 | 0 | 0 |
| F03 | [sim-world-physics](../sim-world-physics.md) | 9 | 914 | 15 | 197 | 201 | 0 | 0 |
| F04 | [net-replication](../net-replication.md) | 12 | 1424 | 28 | 238 | 262 | 0 | 0 |
| F05 | [view-input](../view-input.md) | 19 | 2157 | 33 | 412 | 344 | 0 | 0 |
| F06 | [view-render](../view-render.md) | 9 | 1130 | 18 | 240 | 236 | 0 | 0 |
| F07 | [view-presentation](../view-presentation.md) | 13 | 1027 | 21 | 261 | 157 | 0 | 0 |
| F08 | [testing](../testing.md) | 10 | 1007 | 11 | 260 | 190 | 0 | 0 |
| F09 | [tools-and-package](../tools-and-package.md) | 20 | 1013 | 16 | 220 | 151 | 0 | 0 |

Totals: 2318 claims, 1949 B- statements.

## Files per feature

- **F01 core**: `src/core/actions.js`, `src/core/controllers.js`, `src/core/engine.js`, `src/core/events.js`, `src/core/flags.js`, `src/core/loop.js`, `src/core/math.js`, `src/core/nav.js`, `src/core/navScore.js`, `src/core/players.js`, `src/core/policy.js`, `src/core/rng.js`, `src/core/schedule.js`, `src/core/ui.js`, `src/version.js`
- **F02 defs-and-kits**: `src/defs/fields.js`, `src/defs/materials.base.js`, `src/defs/materials.js`, `src/defs/sidecar.js`, `src/kits/coverage/sim.js`, `src/kits/coverage/view.js`, `src/kits/fx/view.js`, `src/kits/glyphs/icons.js`, `src/kits/glyphs/view.js`, `src/kits/terrain/sim.js`, `src/kits/terrain/view.js`, `src/kits/vehicle/sim.js`
- **F03 sim-world-physics**: `src/sim/physics/colliders.js`, `src/sim/physics/events.js`, `src/sim/physics/groups.js`, `src/sim/physics/heightfield.js`, `src/sim/physics/rapier.js`, `src/sim/world/install.js`, `src/sim/world/place.js`, `src/sim/world/pool.js`, `src/sim/world/world.js`
- **F04 net-replication**: `src/net/bridge.js`, `src/net/key.js`, `src/net/port.js`, `src/net/transport.js`, `src/sim/forecast.js`, `src/sim/interp.js`, `src/sim/limits.js`, `src/sim/net/install.js`, `src/sim/net/remote.js`, `src/sim/net/replicate.js`, `src/sim/replica.js`, `src/sim/schema.js`
- **F05 view-input**: `src/view/bench/padStats.js`, `src/view/bench/pads.js`, `src/view/boot.js`, `src/view/contexts.js`, `src/view/debugHook.js`, `src/view/driver.js`, `src/view/gamepad.js`, `src/view/gesture.js`, `src/view/haptics.js`, `src/view/hook.js`, `src/view/keyboard.js`, `src/view/mapPair.js`, `src/view/menuNav.js`, `src/view/padEdges.js`, `src/view/pointer.js`, `src/view/profiles.js`, `src/view/seats.js`, `src/view/touch.js`, `src/view/uiDom.js`
- **F06 view-render**: `src/view/materials/chunks.js`, `src/view/materials/compiler.js`, `src/view/materials/fur.js`, `src/view/render/hygiene.js`, `src/view/render/lights.js`, `src/view/render/pipeline.js`, `src/view/render/renderer.js`, `src/view/render/snapshot.js`, `src/view/render/tiltShift.js`
- **F07 view-presentation**: `src/view/assets/animTable.js`, `src/view/assets/index.js`, `src/view/assets/loader.js`, `src/view/audio/index.js`, `src/view/camera/chase.js`, `src/view/camera/mount.js`, `src/view/camera/orbit.js`, `src/view/camera/project.js`, `src/view/instancing/crowd.js`, `src/view/instancing/instances.js`, `src/view/instancing/parts.js`, `src/view/sync/index.js`, `src/view/sync/smooth.js`
- **F08 testing**: `testing/checks.js`, `testing/golden.js`, `testing/headless.js`, `testing/index.js`, `testing/invariants.js`, `testing/mp.js`, `testing/playwright.js`, `testing/purity.js`, `testing/replay.js`, `testing/state.js`
- **F09 tools-and-package**: `bin/lion-hawk.js`, `package.json`, `src/index.net.js`, `src/index.sim.js`, `src/index.view.js`, `tools/bake/animTable.js`, `tools/bake/colliders.js`, `tools/bake/config.js`, `tools/bake/conventions.js`, `tools/bake/hull.js`, `tools/bake/index.js`, `tools/bake/mass.js`, `tools/bake/math.js`, `tools/bake/optimise.js`, `tools/bake/read.js`, `tools/bake/sockets.js`, `tools/bake/write.js`, `tools/cli.js`, `tools/dedupe.js`, `tools/dev/index.js`, `tools/glyphs/build.mjs`

## Excluded

- `test/fixtures/**`: Test support: fixture games, models and phys data
- `test/helpers/**`: Test support: shared fakes and helpers
- `test/kits/fixtures/**`: Test support: kit fixture games
- `test/net/fixtures/**`: Test support: net fixture games
- `test/field-notes.test.mjs`: Repo hygiene guard on docs/field-notes.md numbering
- `test/domAsserts*.test.mjs`: Repo hygiene guard on DOM assert usage in tests

## Known gaps

- `inventory.py scan` puts every file under a directory named `build` in category "other" with 0 lines (its `SKIP_DIRS` holds `build`). So `tools/build/index.js`, `tools/build/out.js` and `tools/build/page.js` (118 lines) have no outline and are not in the F09 line count. The F09 author and verifier read them directly, and the `tools/**` glob covers them.


## Open questions

- F01: Where does engine.manual(true) from docs/spec.md [R-7] live? It is not on the core engine object, so it may be in the view driver or the headless handle.
- F01: Why does defineGame check sim.hz and sim.maxCatchUp but not sim.maxFrame? No source states the reason.
- F01: Why does an engine without physics.rapier still make a World with bodiless entities? test/world-engine.test.mjs:151 shows it, but no comment states the reason.
- F02: Why do the base materials glass, mud, snow, water and air have no coverage block? No source states the reason.
- F02: Why does the particle landing threshold use vy < 1 with no named constant? No source states the reason.
- F03: Why do the sleepers thresholds use 0.2 m/s and 0.5 rad/s? The code comment only says they come from Rally's afterStep.
- F03: Field note 124 says no test guards one read: a body that fell asleep in the step that moved it (the r.awake check). Status is open.
- F04: Why does a bridge guest leave emit closed to itself after its endpoint is removed from the hub? No source states the reason.
- F04: Why is REPEAT 3? Only the comment states that it keeps one lost diff from hiding a change.
- F05: Why does the bench stop with a dual-rumble zero only, while the engine stop uses a trigger-rumble zero for pads that list it? No source states the reason.
- F05: Why does padEdges read only axes 0 and 1 (the left stick) for pushes? The comment says standard mapping, and no source states why the right stick is left out.
- F06: The default uSubStrength of 0.5 in uniformsFor cannot apply, because SUBSURFACE needs look.subsurface.strength above 0. No source states the reason for the default.
- F06: Why does pipeline createPipeline not call gfx.warm() at boot? Only a restored context calls it in this feature. The asset preload calls it elsewhere (F07).
- F07: Why does view sync start each instanced part at 16 instances? No source states the reason.
- F07: Why does the shake jitter move only x and y of the wanted camera position? No source states the reason.
- F08: Does defineGame always set game.policies? headless() throws a TypeError for a named policy if it is undefined. No source states it.
- F08: Why is playwright-core a devDependency only? No source states the reason.
- F08: Which engine tests check that peers() works with a real game? test/playwright.test.mjs uses fakes. No other test of F08 is listed.
- F09: Why does the dev server listen on 0.0.0.0 by default, which exposes it to the local network? No source states the reason.
- F09: Why does bake --check compare only the engine major.minor and not the patch? CHANGELOG and code show it, but no source gives the reason.
- F09: tools/bake/colliders.js sets p and q to identity for hull and mesh colliders. Does a col-hull node with a scaled parent keep scale? The code applies the full world matrix, but no test covers a scaled col-hull.
