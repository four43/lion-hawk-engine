# Phase 3e render notes

## Outcome

Branch `phase-3-render`, cut at 2a5cbde (v0.7.3). Tasks 1-10 are committed (a036c12 through d2880cd), and this notes file is Task 11.

- Unit: 500 tests, 481 pass, 0 fail, 19 skipped. The 8 new `render-*` files contribute 72 tests (4 + 12 + 12 + 7 + 9 + 7 + 11 + 10), all passing.
- Browser: all six files pass, run one at a time under the lock. `test/e2e-render.test.mjs` has 6 tests. The five existing files are unchanged and pass (1, 2, 2, 1 and 7 tests).
- Tolerance changes from Tasks 9-10: the tilt-shift "on" program delta is asserted `>= 3` instead of the plan's `>= 2` fallback (observed 4). See Decisions and Field note candidates.

## Decisions

- Ruling: notes file uses the brief's sections (Outcome, Decisions, Done-when evidence, Contract issues, Integrator requests, Removed or renamed tests, Field note candidates) and field note candidates stay unnumbered, overriding the plan's "numbered from #110" — the brief is binding and #110–#114 are already taken by 3a — cost if wrong: integrator renumbers/reshuffles notes headings.
- Ruling: the Done-when "git diff phase-3 --stat" check runs against 2a5cbde (the cut point) — phase-3 may have moved with other merges and would show unrelated files — cost if wrong: none, same set of files checked.
- Ruling: commits carry no Co-Authored-By/Claude trailer despite the harness attribution reminder — user CLAUDE.md and the brief forbid it — cost if wrong: none.
- Ruling: models — haiku for transcription tasks 1,2,4,5,6; sonnet for 3,7,8,9,10,11 (judgment/browser); sonnet task reviewers; opus final review — cost if wrong: extra fix rounds.
- Ruling: tilt-shift 'on' program delta asserted >= 3 (observed 4: the 3 passes + a linear-render-target variant of the scene's lit material) — the plan's fallback (>= 2) assumed fewer, not more; the extra variant is real three.js behaviour (a scene material drawn into a non-null target compiles without the output colour-space/tone-mapping step) and Pig Pens has it today — cost if wrong: games enabling tilt-shift mid-game pay one compile per lit material; recorded as a field note candidate (warm with post on).

## Done-when evidence

Unit, every non-e2e file:

```
systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 $(ls /home/smiller/projects/four43/lion-hawk-engine-3e/test/*.test.mjs | grep -v e2e)
```

Result: tests 500, pass 481, fail 0, skipped 19. The 8 `render-*` files alone (`node --test --test-concurrency=4 test/render-*.test.mjs`, same systemd-run wrapper): tests 72, pass 72, fail 0, skipped 0. That is the 72 expected, so the base count is 428.

Browser, one file at a time, each as:

```
flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 <file>
```

| File | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| test/e2e.test.mjs | 1 | 1 | 0 | 0 |
| test/load-e2e.test.mjs | 2 | 2 | 0 | 0 |
| test/touch-e2e.test.mjs | 2 | 2 | 0 | 0 |
| test/hold-e2e.test.mjs | 1 | 1 | 0 | 0 |
| test/bridge-e2e.test.mjs | 7 | 7 | 0 | 0 |
| test/e2e-render.test.mjs | 6 | 6 | 0 | 0 |

Diff scope: `git diff --stat 2a5cbde..HEAD` (against the cut point, not phase-3, per the ledger ruling) before this notes file shows 24 files, 1429 insertions, 4 deletions:

```
 src/view/assets/index.js            |   6 ++
 src/view/audio/index.js             |   4 ++
 src/view/boot.js                    |  17 ++++--
 src/view/materials/compiler.js      |   7 +++
 src/view/render/hygiene.js          |  76 ++++++++++++++++++++++++
 src/view/render/lights.js           |  87 +++++++++++++++++++++++++++
 src/view/render/pipeline.js         |  85 ++++++++++++++++++++++++++
 src/view/render/renderer.js         |  80 +++++++++++++++++++++++++
 src/view/render/snapshot.js         |  91 ++++++++++++++++++++++++++++
 src/view/render/tiltShift.js        | 103 ++++++++++++++++++++++++++++++++
 src/view/sync/index.js              |   5 ++
 test/e2e-render.test.mjs            | 115 ++++++++++++++++++++++++++++++++++++
 test/helpers/fakeCanvas.mjs         |  19 ++++++
 test/helpers/fakeRenderer.mjs       |  28 +++++++++
 test/render-boot.test.mjs           |  77 ++++++++++++++++++++++++
 test/render-fixtures/render.html    |  18 ++++++
 test/render-fixtures/render.view.js |  61 +++++++++++++++++++
 test/render-hygiene.test.mjs        |  84 ++++++++++++++++++++++++++
 test/render-lights.test.mjs         |  96 ++++++++++++++++++++++++++++++
 test/render-pipeline.test.mjs       | 110 ++++++++++++++++++++++++++++++++++
 test/render-renderer.test.mjs       |  94 +++++++++++++++++++++++++++++
 test/render-snapshot.test.mjs       |  73 +++++++++++++++++++++++
 test/render-stubs.test.mjs          |  45 ++++++++++++++
 test/render-tiltshift.test.mjs      |  52 ++++++++++++++++
 24 files changed, 1429 insertions(+), 4 deletions(-)
```

Every file is in the File Structure. Nothing under `src/core`, `src/sim` or `src/defs` changed, and none of the integrator-only files changed (`src/index.*.js`, `testing/index.js`, `src/version.js`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`). The notes file is the only addition from Task 11.

## Contract issues

1. **There is no compiler stub in §4.6.** Boot must build `view.materials`, but the overview lists stubs only for `assets`, `sync` and `audio`. Decision: 3e also creates an inert `src/view/materials/compiler.js`. 3f owns that path and its file wins at the merge, as with the other stubs. In practice: held as written.
2. **`warm` needs the compiler's materials and their mesh kind, and `preload` needs the scene.** Decision: `warm(renderer, scene, camera, { materials })` places each material on a hidden mesh of the kind named by `material.userData.lhUse` (`'plain'`, `'mesh'`, `'instanced'`, `'instancedColor'`, `'skinned'`). `gfx.warm(opts)` adds the `material` of each `view.materials.made()` entry (`[{ material, use }]`, 3f C5). `createAssets` receives `gfx`, so `preload` can end with `gfx.warm()`. Asks of 3f: `mc.made()` returns `[{ material, use }]`; set `userData.lhUse` on each; set `userData.lhShared = true` on compiler materials and template geometries; accept `gfx` in `createAssets`; accept an `undefined` registry, meaning the base library. In practice: held as written.
3. **The `defineView` `render` block grows by four optional keys:** `render.assets = { manifest, base }` (optional `decoders` passes 3f C1's `{ ktx2, draco }` through; without it boot makes no `createAssets` and `view.assets` is `null`); `render.lights.hemiSky` (preset fields `{ sky, hemiSky, ground, hemi, sun: { color, intensity, offset }, fog: [near, far] }`); `render.lights: false` for no rig; `render.paint = { base, shade }` passed to `createMaterialCompiler` as `paint` (3f C11). `checkRender` checks the shape; the compiler checks `base` against the registry. In practice: held as written.
4. **Additive options and members, no changed signatures:** `createRenderer` options `renderer` (inject) and `target`, members `size` and `post` (the post-pass seam games use instead of replacing `gfx.render`); `camera.userData.lhFov`, the base FOV after the portrait rule; `boot` option `renderer`; `createLightRig` `dispose` and `presets`; the `disposeTree` return count and its `userData.lhShared` rule; `snapshot` options `yaw, pitch, fov, fill, lights, crop, outline, alpha, colorSpace, out`, and `size` as a number or `[w, h]`; `createTiltShift` `params.focus`, `setSize`, `dispose`, `targets` and `passes`; `createViewSync` `dispose`, which boot calls if present, and the `view` option boot passes. In practice: held as written.
5. **matSplit (M-13).** The brief lists matSplit under 3e's hygiene, but §3.2 and §4.8 make it the compiler's cache key (3f). 3e ships no `splitShared`. A game with its own non-compiler material shared between instanced and plain meshes keeps its own split until it moves to the compiler. In practice: held as written.
6. **No WebGL.** The spec is silent. Decision: boot reports `render: <message>` once into `engine.errors` and runs on with `view.gfx`, `view.materials`, `view.assets` and `view.sync` set to `null`. View halves must check `view.gfx`. A game e2e that stubs WebGL now sees one error. In practice: held as written; the no-WebGL path is verified in unit and in the SwiftShader browser test.

## Integrator requests

1. **Exports (non-blocking).** Add to `src/index.view.js` at the Wave B merge:
   ```js
   export { createRenderer } from './view/render/renderer.js';
   export { createLightRig } from './view/render/lights.js';
   export { warm, instancedShadows, disposeTree, programCount } from './view/render/hygiene.js';
   export { snapshot } from './view/render/snapshot.js';
   export { createTiltShift } from './view/render/tiltShift.js';
   ```
2. **The four43 workspace test (non-blocking).** `games/test/workspace.test.mjs` ("engine source does not import three or Rapier yet") fails once 3e merges into `phase-3`, because `src/view/render/*` imports `three` (D9).
   - Narrow it to the sim roots (`src/core`, `src/defs`, `src/sim`, `src/kits/*/sim.js`).
   - Make sure each game builds with `lion-hawk build` (dedupe) before it takes 0.9.0. A `build.py`/esbuild-CLI build would bundle the engine's own copy of three.
3. **Stubs at the Wave B merge (non-blocking).** Take 3f's `src/view/assets/index.js` and `src/view/materials/compiler.js`, and 3g's `src/view/sync/index.js` and `src/view/audio/index.js`, over 3e's stubs. Then rerun `test/render-pipeline.test.mjs` and `test/render-boot.test.mjs`. The stub-shape test `test/render-stubs.test.mjs` should be deleted at that merge, since its "inert" assertions no longer hold. Confirm the 3f asks in Contract issue 2 (`made()` returns `[{ material, use }]`, `userData.lhUse` including `'plain'`, `userData.lhShared`, `gfx`, `decoders`), and that 3g's sync reads `view.dt` from the `view` boot passes. With 3f's compiler in place, add two assertions to "render.paint reaches the compiler": `setup({ paint: { base: 'unobtainium' } }).make()` throws `/paint base 'unobtainium' is not in the registry/`, and a game whose registry has `chassis` builds with `render.paint = { base: 'chassis', shade: [0.25, 0.85, 1.1] }` (3f C11).
4. **The timer (non-blocking).** After 3c merges, add one assertion that `boot(…, { timer })` reaches `world.stats.stepMs` (#106) with a physics game. 3e passes `timer` to `createEngine` (3c ruling; pinned in `test/render-boot.test.mjs` by source) but cannot observe it before 3c.
5. **CHANGELOG (0.9.0) (non-blocking):**
   - "view: `defineView({ render })`, `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift`;
   - boot builds `view.gfx`/`materials`/`assets`/`sync`/`audio` and `engine.assets`;
   - a renderer that cannot start is reported as `render: …`."
6. **Game plans at reconciliation (non-blocking)** (names they must match): `defineView({ render: { assets: { manifest, base } } })` (not a top-level `assets`); `view.gfx.post = pass` / `null` (not replacing `view.gfx.render`); light presets `{ sky, hemiSky, ground, hemi, sun: { color, intensity, offset }, fog }` (not `sun: '#…'`, `sunIntensity`); `snapshot(renderer, object, { size: [w, h] })`; `render.paint = { base, shade }` (Tractor: `{ base: 'chassis', shade: [0.25, 0.85, 1.1] }`).
7. **Early landing (non-blocking).** 3g needs 3e on phase-3 before its Task 11; 3e is ready to land as a patch ahead of Wave B (stubs replaced by 3f/3g files when those merge, per request 3).

## Removed or renamed tests

None.

## Field note candidates

- A renderer that fails is reported as `render: …` and the page runs on (RF1). A game e2e that stubs WebGL now sees one error.
- Turning tilt-shift on compiled 4 programs on SwiftShader, not 3. They are the 3 passes plus a render-target variant of the scene's lit material. A game enabling a post pass mid-game should warm with it on, because `gfx.warm` never goes through post. See `.superpowers/sdd/2026-10-13-phase-3e-render/task-10-report.md` for the finding.
- SwiftShader handled half-float MSAA (`samples: 4`) with GL error 0, and the sky pixel matched within 3.
