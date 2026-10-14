# Phase 3d bake and CLI: notes

## Outcome

- Commit range `2a5cbde..HEAD` (v0.7.3 to the commit that adds this file, branch `phase-3-bake`; the code and tests end at `7b4a9d0`, 46 commits to there plus this docs commit; includes the 0.7.4 merge `179d29e`). 81 files changed (3395 insertions, 8 deletions) at `7b4a9d0`, 50 of them under `test/`.
- The 3d set is 64 tests in 17 files, all passing. The 17 files are `test/bake-*.test.mjs`, `test/build-*.test.mjs`, `test/cli.test.mjs` and, outside those globs, `test/build.test.mjs` and `test/bake-sidecar.test.mjs` (the latter matches the bake glob; `build.test.mjs` does not match `build-*`, so name it explicitly). The plan said 57; the Task 6 fix added 2 (59), Task 16 added 2 (61), and the final fix wave added 3 (64: e2e-over-normal sw.js, partial-vs-full bake byte-identity, axisOf tie-break).
- The non-browser engine unit suite had no new failures (Task 15: 467 pass, 0 fail, 19 skip; after the 0.7.4 merge: 520 tests, 501 pass, 0 fail).
- Nothing under `src/` was created or edited (3d-1). The bake and CLI live in `tools/` and `bin/`.
- Real-game smoke: Tractor bakes all 40 models and Rally all 4, from scratch dirs only (see Measurements).

## Decisions

Controller rulings, each with why and cost if wrong:

- **R1** sw `__VERSION__` = `<gameVersion>+lh<engine>-<hash>`. Why: spec B-5 needs game version, engine version and hash in the sw, and C8 accepted this form. Cost: a one-line change in `stampWorker` and its test.
- **R2** `dev()` hook ctx carries `engine: ENGINE_VERSION`, not null. Why: matches C8's ctx shape. Cost: trivial.
- **R3** Task 16: the `bakeGame` helpers rewrite the fixture `materials.js` relative engine import to an absolute file URL when copying. The registry-change steps in Tasks 10 and 11 write a `materials.js` that differs in content (an added material) instead of editing a hash literal. Why: plan Task 16 step 4 cannot pass otherwise. Cost: test-helper rework only.
- **R4** This notes file uses the brief's sections plus Measurements. Why: the brief is binding for notes format. Cost: none.
- **R5** Tests keep `os.tmpdir()`; `RUN` sets `TMPDIR=/tmp/claude-1000/lion-hawk-phase3/3d/tmp`. Why: every temp game and build lands in 3d scratch (constraint 8). Cost: none.
- **R6** (3f-R4) No new code. The shared fixture for `decodeAnimTable` is the committed `test/fixtures/models/game/baked/models/pet.anim.json`; its 12-float layout is pinned by Task 8's AnimationMixer test at 1e-5. Why: it already exists and is pinned. Cost: 3f writes its own fixture.
- **R7** Task 2 mesh fixture is a non-degenerate tetrahedron (0,0,0), (1,0,0), (0,2,0), (0,0,3); massOf hand-verified at 7.5. Why: the unit tetrahedron has a repeated principal inertia, and Rapier's f32 principal frame drifts about 1.6% (over the 1% tolerance). Cost: the mass test loses the degenerate-eigenvalue case only.
- **R8** Task 10: `prune()` gets `keepSolidTextures: true`. Why: gltf-transform 4.5.1 prune drops single-colour textures, which broke the `keepTextures` test, and a `keepTextures` model must keep its texture as authored. Cost: a few bytes per solid texture.
- **R9** Task 13: the brief's dedupe mutation cannot fail (`main.js` sits in the game copy, so its `three` resolves there anyway). Added a committed engine-side probe package, symlinked into the copy's `node_modules` as a `file:` engine install is, whose module imports `three`; the test asserts it bundles the game's copy. Why: pins dedupe (#11) for real. Cost: helper/fixture rework only.
- **R10** Task 13: `runPage` returns a JSON round-trip of the vm context. Why: `deepEqual` fails on vm-realm prototypes. Cost: none.
- **R11** Task 15: the 3d set counted 59 tests (Task 6 fix added 2); the engine-suite step runs every non-browser test file, since browser suites need the shared flock and 3d touches no browser code. Failures are compared at base `2a5cbde`. Cost: a browser regression would surface at the integrator's gate instead.
- **R12** `dev --host` stays. Why: plan-mandated, additive to section 4.3's dev shape, needed to bind 127.0.0.1 in tests and the LAN for phones. Cost: drop one option. Also listed under Contract issues.

Per-task rulings:

- **Task 6** fix: seed the unique-name set with the scene name and every non-part, non-col node's sanitised name (empties, `sock-*`), so parts dedupe with `-2` against them; also reject a name that sanitises to empty. Why: `GLTFLoader` names nodes in one namespace across all nodes and the scene, and sidecar names must equal runtime names (reproduced as `Group` vs `Group_1`). Cost: a part rename in rare models.
- **Task 11** fix: the "no phys.json" early return in `--check` now logs `stale: *: no phys.json`, with a test assertion. Why: the brief's interface text wins over its own code, and the CLI on a never-baked game must say why it exits 1. Cost: one log line.
- **Task 14** fix round 1 also took minors 2-4 (debounce timer in `close()`, `serve()` EISDIR, `onEnd` hook throw) along with the unguarded `decodeURIComponent` crash (`GET /%`). Why: same file, cheap, all crash paths on a server bound to 0.0.0.0. Cost: none.
- **Task 16** expected data change: re-baking the fixture against the real 3b registry changed the pet's mass from 269.5 to 282.975 kg, because 3b's base `flesh` density is 1050, not the duck-typed 1000. No test literal depends on it.

Plan judgment-task decisions (as implemented):

- C1 to C9 accepted as written (see Contract issues).
- Optimisation keeps every named node, parent and world matrix: POSITION is not quantized, `prune()` keeps empty leaves such as `sock-*`, and `dedup` uses `keepUniqueNames` (Review Focus 1 and 2, each with a mutation step in Task 9).
- The sidecar is computed from the source document after renames and the palette step, but before optimisation (3d-4).
- Re-bakes are byte-identical (3d-3): sorted keys where order is free, 6-decimal rounding, no timestamps.
- Default hulls skip flat (part, material) groups with a warning; only an all-flat model fails (C4).
- 3f/3g must treat a multi-material part node as a `Group`.

### Final review

- **R13** final fix wave = I-1, M-1 (+ Task 17 review: exports/bin request blocking for Wave A; Task 16 minors; file-count note), M-2 (mkdir before hooks), M-3 (hook ctx.out test can fail), M-4 (serialise dev re-bakes), M-7 (partial-then-full bake byte-identical test), M-8 (C1 tie-break test); all cheap and correctness or test-honesty fixes. M-5, M-6 and M-9 stay deferred and are listed below. Cost if wrong: dev misses edits to kit subfolder sources until restart.
- Fixed in the wave: I-1 an `--e2e` build into a dir holding an earlier normal build kept the old stamped `sw.js` (breaks C8); it now removes it. M-2 `beforePage` ran before the out dir existed; it is now created first. M-3 the hook fixture's `out` check could not fail; it now records `typeof ctx.out === 'string'` and the dir's existence, and the build test asserts `'set'` (dev passes `out: null`). M-4 dev re-bakes are chained on one promise, so two saves more than 100 ms apart cannot run two `bake()` calls at once. The test is skipped: a fixture bake takes a few ms, so the two bakes never overlap and a test passed without the fix (checked by mutation, 3 of 3 runs). M-7 and M-8 added tests, each checked by mutation (removing `sorted()` fails the partial-vs-full test; flipping the axis tie comparison fails the axisOf test).
- Still deferred:
  - **M-5** the dev watcher is not recursive: subfolder `file` sources and same-basename kits are not re-baked in dev (restart dev).
  - **M-6** `fs.watch` on the template stops after an atomic rename save (editors that write a temp file and rename).
  - **M-9** a template with no `<head>` gets the build meta before the doctype.
- For 3k: a `.gltf` or `.glb` source's sha does not cover external `.bin` files or textures, so `--check` and dev miss texture-only edits.

Process incident: a Task 15 implementer ran `pkill -f "node --test"` machine-wide to clear a hung run. It may have killed other agents' test runs. Later tasks were told never to use `pkill`.

### Deferred minors

Task 1
- math helpers `mul`, `compose`, `decompose`, `qmul`, `qmat`, `matq` are untested directly (covered via Tasks 2, 7, 8).
- `hull.js` seen-map index unused; `vis.includes` is O(n^2); `decimate` returns the same reference under the cap.

Task 2
- `assertMassClose` tensor tolerance is relative to the largest entry, so the composite test misses a capsule mutation (the per-shape test catches it).
- `massOf` silently drops inward-wound (negative volume) meshes.
- Rapier f32 frame drift on repeated principal values (see R7).

Task 3
- Temp configs without `package.json` `type: module` print Node's MODULE_TYPELESS_PACKAGE_JSON warning (also `gameWith` in Task 4).
- Leaf types are unchecked (`colliders: 'false'`, `sockets: 'hat'`); a bad `package.json` throws a bare SyntaxError; `importFresh` refreshes the entry only.

Task 4
- `make.mjs` has an unused `S`; the duplicate `lamp.001` needs a "deliberate (C6)" comment; the fixture test is drift-only.

Task 5
- A shared material with mixed converted and unconverted primitives keeps its texture; texCoord index and `KHR_texture_transform` are ignored; other textures are left without UVs; the `s2l` curve is untested.

Task 6
- `extras.part` forward references fail misleadingly; `col-*` names are unsanitised (removed before write); an unused `build` import; coverage gaps (mode error, no scene, required-socket success).

Task 7
- The hull is computed twice for default groups; untested: explicit `col-mesh`, the >64 decimate path, capsule clamp, non-uniform scale; the mirrored node comment.

Task 8
- The negative-dot slerp branch is untested (the sign flip is deletable); the lerp fallback at d>=0.9995 differs from three's epsilon; stored `dur` is rounded to 1e-4 but sampling uses the unrounded value; morph weights are ignored.

Task 9
- No test proves `weld` and `quantize` act (NORMAL quantized); `setLogger` side effect; missing option keys silently false; gzip cost measured below.

Task 10
- A `.gltf` source sha covers only the `.gltf` (not `.bin` or textures).
- A partial bake with a newly added source silently omits it; after a removed source it leaves an orphan `models/<id>.glb`; missing `phys.engine` gives a TypeError; a configured `file` id silently shadows an auto-discovered source.

Task 11
- A malformed `phys.json` gives a raw TypeError; `--check` ignores missing baked files and config option changes; ids are ignored with `--check`.

Task 12
- The in-script marker check only catches a marker right after `<script>` (the D1 hint is weak); a duplicate `<!--APP-->` is ignored; `/<head[^>]*>/` matches `<header>`; `__PRECACHE__` is replaced at its first occurrence only; the site/exp guard is lexical (symlinks).

Task 13
- The hash-change test cannot catch dropped asset hashing (the manifest sha is in the bundle); PWA hash untested; unused `gunzipSync` and `id`; entry or config passed as `game` untested; anim sidecar not sha-checked.

Task 14
- Minors 2 to 4 (debounce timer in `close()`, `serve()` EISDIR, `onEnd` hook throw) were fixed in `af41a4a`. Only this gap remains: no test pins the inline module or `ctx.dev`/`ctx.engine`.

Task 15
- `--port ''` is accepted as 0; sub-command `--help` exits 2; in the dev test `p.kill` is not awaited.

Task 16
- The pet's mass moved from 269.5 to 282.975 kg (3b's `flesh` density is 1050); noted under Decisions.
- The stale `bakeGame` helper header comment: fixed in `7b4a9d0` (it now names the registry rewrite and `changeRegistry`).
- A patch-version bump check keeps old models: `--check` compares engine major.minor only, so a patch bump leaves old baked models in place by design.

## Done-when evidence

RUN = `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3d -E NODE_OPTIONS=--max-old-space-size=512 -E TMPDIR=/tmp/claude-1000/lion-hawk-phase3/3d/tmp node --test --test-concurrency=4`

- `RUN test/bake-*.test.mjs test/build-*.test.mjs test/cli.test.mjs test/build.test.mjs` (17 files): tests 64, pass 64, fail 0, skipped 0 (final run after the fix wave).
- `node bin/lion-hawk.js bake --game test/fixtures/models/game --check`: exit 0.
- Engine unit suite (non-browser, run by Task 15 and again after the 0.7.4 merge): no new failures (see Outcome).
- Smoke: Tractor bakes 40 of 40 models and Rally 4 of 4 into scratch (see Measurements). Nothing was written under four43.

## Contract issues

- **C1** capsule/cylinder axis is the round-cross-section extent, ties to the longest: reconciled (Tasks 1, 2, 7).
- **C2** anim.json `parts` = part rows then `sock-<name>` rows, slerp, 12-float layout (Matrix4 elements 0,1,2,4,5,6,8,9,10,12,13,14): reconciled with 3f (Task 8; see R6 for the shared fixture).
- **C3** `part: null` for a socket with no ancestor part: reconciled. 3b's `validateSidecar` accepts it; Task 16 validates the baked `phys.json` with it.
- **C4** flat-group skip with a warning, `colliders: false`: reconciled (Task 7; the Tractor smoke shows the warnings below).
- **C5** per-model `file` mapping, self-contained GLBs: reconciled (Task 10).
- **C6** sanitised and de-duplicated part names, GLB node renamed: reconciled. The Task 6 fix widened de-duplication to the whole node and scene namespace.
- **C7** hull and mesh entries in body space with `p = [0,0,0]`, `q = [0,0,0,1]`: reconciled.
- **C8** build stamps, `--e2e`, hook ctx, `__PRECACHE__`, bare `<!--APP-->`, public `build()`: reconciled (Tasks 12-15, with R1 and R2).
- **C9** bake needs only `registry.has`, `density`, `hash`, and `bake.materials` is required: reconciled. Task 16 swapped the duck-typed registry for 3b's real one.
- **Additive note (R12):** `dev --host` is an extra option beyond section 4.3's dev shape. It is open for the integrator to accept or drop.

## Integrator requests

None of these blocks 3d's own tests, but item 1's `exports` and `bin` are BLOCKING for the Wave A merge.

1. `package.json`. BLOCKING for the Wave A merge (3l imports `lion-hawk/build`); not blocking 3d's own tests.
   - Dependencies landed with 0.7.3: gltf-transform 4.5.1, `meshoptimizer` 1.2.0, `pngjs`, `esbuild` in dependencies. Done.
   - Still needed at the Wave A merge: `exports` `"./bake": "./tools/bake/index.js"` and `"./build": "./tools/build/index.js"` (today `./build` points at `./tools/dedupe.js`; the new entry keeps exporting `dedupe`, so `test/build.test.mjs` and `test/package.test.mjs` keep passing), and `"bin": { "lion-hawk": "bin/lion-hawk.js" }`. Without them `import 'lion-hawk/build'` (3l, CI-7) and the `lion-hawk` command do not resolve. Not needed by 3d's own tests: they import by path, and the CLI runs as `node bin/lion-hawk.js`. Also add `"./bake"` for 3k.
2. After each engine minor bump, run `node bin/lion-hawk.js bake --game test/fixtures/models/game` and commit `baked/`. Not blocking: the current-fixture test ignores the engine line, and `--check` reports an engine-minor line.
3. Tell 3j, 3k and 3l. Not blocking.
   - (a) `weld` changes vertex counts where the palette step drops UVs and tangents (Rally's hatchback goes from 3709 to 2048), so parity tests should compare triangle counts, or the game sets `optimise.weld: false`.
   - (b) Palette colours follow Tractor's formula, not Rally's old `pow(f, 1/2.2)`.
   - (c) Tractor's `rename.nodes: { hat: 'sock-hat' }` must be per pet model, because `hat-cowboy.glb` has a mesh node called `hat`.
   - (d) Part names with `.` lose it (`lamp.001` becomes `lamp001`), and repeated names get `-2`. Names also dedupe against non-part nodes and the scene (Task 6 fix).
   - (e) Each game's `pwa/sw.js` needs `const PRECACHE = __PRECACHE__;`, and every template needs a bare `<!--APP-->` with no wrapping `<script>`: Rally's replaces `<script>/*BUNDLE*/</script>`; Tractor's and Pig Pens' `<script><!--APP--></script>` lose the tag.
   - (f) 3l (CI-7): `import { build } from 'lion-hawk/build'`, `build({ game, out, e2e: true }) -> { out, version, hash, files, sizes }` (no `report`).
4. Task 16 at the Wave A merge: DONE. 3b reached the branch at 0.7.4 and Task 16 landed (`1e35ce4`). Not blocking.

## Removed or renamed tests

- None removed or renamed.
- Task 2's mesh fixture changed from the unit tetrahedron to a non-degenerate one (R7).
- Task 16 changed the fixture registry to 3b's real one; the pet's mass moved from 269.5 to 282.975 kg (`flesh` density 1050). No test literal depended on it.
- The 3d set is 64 tests (plan said 57).

## Measurements

Scratch smoke bakes (done-when), bake from `<scratch>/smoke-<game>/game.config.js` with `bake.src` the game's real `assets/models` (read-only), `bake.out` the scratch `baked`, `palette: 'vertex'`, permissive frozen registry, `paint.base: 'steel'`. No per-model overrides were needed. Each ran under the RUN memory caps (2G, no swap, `--max-old-space-size=512`).

| Game | Models baked | GLB bytes | GLB gzip (per file, level 9) | phys.json bytes | Wall | Failures |
|---|---|---|---|---|---|---|
| Tractor | 40 of 40 | 560224 | 171573 | 88561 | 0.34 s | none |
| Rally | 4 of 4 | 57448 | 30987 | 16481 | 0.30 s | none |

- No `anim.json` was written for either game, since no model configured an `animTable` (so Tractor's pet `hat` rename was not needed to pass).
- Tractor warnings (C4 flat-group skips, five lines): `rock` (`rock_smallC`, grass), `rockA` (`rock_largeA`, grass), `rockB` (`rock_largeB`, `_defaultMat` and grass), `rockC` (`rock_tallA`, `_defaultMat`): "is flat, so it has no default hull". No other warnings.
- Wall times are the second runs (first runs had a service runtime of about 0.3 s too); peak memory about 100 MB.
- Gzip cost of the optimised GLBs is about 31% of raw for Tractor and 54% for Rally.

## Field note candidates

1. `quantize()` and gltf-transform's `meshopt()` re-parent or re-transform mesh nodes, so engine parts can't use them on POSITION. Float positions cost compression.
2. `GLTFLoader` sanitises node names (`.`, `:`, `/`, `[`, `]` dropped, spaces to `_`) and de-duplicates them with `_n`. The bake now pre-sanitises, and Kenney models repeat node names (corn).
3. A multi-material part loads as a `Group` with child meshes `<name>_1`, `<name>_2` (3f/3g must treat the part node as the Group).
4. Kenney decorations carry flat decal primitives, so the "one hull per (part, material)" default needed a flat-group skip.
5. `bake --check` doesn't see config changes (renames, `static`, palette); only sources, the registry and the engine.
6. Pet anim tables moved from nlerp to slerp; frames differ from the old `assets.json` by under 1e-3 at 30 fps.
7. Rapier's f32 principal frame drifts on repeated principal inertia (R7); use a non-degenerate mesh fixture when comparing mass tensors.
8. gltf-transform `prune` drops single-colour textures unless `keepSolidTextures` is set (R8).
9. `GLTFLoader` names nodes in one namespace across all nodes and the scene, with suffix `_N` (Task 6 fix), so part names must dedupe against non-part nodes too.
10. A test whose entry sits in the game dir cannot pin dedupe, because `three` resolves there anyway (R9); the probe must be an engine-side package.
