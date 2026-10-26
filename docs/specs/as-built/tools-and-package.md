---
id: F09
title: CLI, tools and package surface
status: as-built
source_commit: 7224d6b
paths:
  - tools/**
  - bin/**
  - src/index.sim.js
  - src/index.view.js
  - src/index.net.js
  - package.json
generated: STE spec writer
---

# CLI, tools and package surface

## Summary
The `lion-hawk` CLI has five commands: `bake`, `build`, `dev`, `test` and `release`. The `bake` command turns glTF sources into optimised GLBs, sidecars and anim tables. The `build` command makes a single-page PWA build or a shared-mode build. The `dev` command serves a live-reload page. The `test` command runs the game tests and the engine checks. The `release` command bumps the version, bakes, builds, tests and commits. The feature also covers the glyph script, the dedupe plugin, and the package `exports` map with the three entry files `src/index.sim.js`, `src/index.view.js` and `src/index.net.js`.

## Scope
- **In scope:** the CLI, `tools/bake`, `tools/build`, `tools/dev`, `tools/test`, `tools/release`, `tools/dedupe.js`, `tools/glyphs/build.mjs`, `bin/lion-hawk.js`, `package.json`, and the three entry files that re-export other modules.
- **Out of scope:** the behavior of re-exported modules. See [core](core.md), [defs-and-kits](defs-and-kits.md), [sim-world-physics](sim-world-physics.md), [net-replication](net-replication.md), [view-input](view-input.md), [view-render](view-render.md) and [view-presentation](view-presentation.md).
- **Out of scope:** `testing/` (the `lion-hawk/test` and `lion-hawk/playwright` exports).

## Terms
See the [glossary](_meta/glossary.md). This spec adds three terms that the glossary lacks.
- **shared mode** — the build mode `lion-hawk build --mode shared`. The mode keeps lion-hawk, three and Rapier out of the game bundle and loads them from one pack through an import map. [tools/build/shared.js:1-8] <!-- C-233 -->
- **pack** — the directory of content-hashed engine, three and Rapier files that shared mode writes. Games built later reuse its files. [tools/build/shared.js:3-8] <!-- C-239 -->
- **web manifest** — the `manifest.webmanifest` file that the build writes from `build.manifest`. The web manifest is not the baked `manifest.json`. [tools/build/page.js:20-33] <!-- C-264 -->

## Interfaces

### CLI
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `lion-hawk bake [--game <dir>] [--check] [ids...]` | in | exit code 0, 1 or 2 | [tools/cli.js:10-15; tools/cli.js:34] <!-- C-3 C-11 --> |
| `lion-hawk build [--game <dir>] [--out <dir>] [--mode single or shared] [--e2e]` | in | exit code 0, 1 or 2 | [tools/cli.js:10-15; tools/cli.js:35] <!-- C-3 C-12 --> |
| `lion-hawk dev [--game <dir>] [--port 8740] [--host 0.0.0.0]` | in | HTTP server, no exit code while it serves | [tools/cli.js:10-15; tools/cli.js:38-41] <!-- C-3 C-14 --> |
| `lion-hawk test [--game <dir>] [--visual]` | in | exit code 0, 1 or 2 | [tools/cli.js:14; tools/cli.js:36] <!-- C-3 C-224 --> |
| `lion-hawk release [--game <dir>] [--bump patch, minor or major] [--out <dir>]` | in | exit code 0, 1 or 2 | [tools/cli.js:15; tools/cli.js:37] <!-- C-3 C-225 --> |
| `lion-hawk --help`, `-h`, `help` | in | USAGE text on the log sink, exit code 0 | [tools/cli.js:28] <!-- C-4 --> |
| `main(argv, { env, log, error })` | in | returns an exit code or `null` | [tools/cli.js:1-2; tools/cli.js:26] <!-- C-16 --> |
| `bin/lion-hawk.js` | in | Node script, bin name `lion-hawk` | [bin/lion-hawk.js:3-6; package.json:19-21] <!-- C-1 C-2 --> |

The exit codes are 0 (success), 1 (failed or stale) and 2 (usage error). [tools/cli.js:1-2] <!-- C-16 -->

### Package exports
| Export | Target | Evidence |
| --- | --- | --- |
| `lion-hawk/sim` | `src/index.sim.js` | [package.json:8] <!-- C-20 --> |
| `lion-hawk/view` | `src/index.view.js` | [package.json:9] <!-- C-20 --> |
| `lion-hawk/net` | `src/index.net.js` | [package.json:10] <!-- C-20 --> |
| `lion-hawk/kits/<kit>/view` | `src/kits/<kit>/view.js` | [package.json:11] <!-- C-21 --> |
| `lion-hawk/kits/<kit>` | `src/kits/<kit>/sim.js` | [package.json:12] <!-- C-21 --> |
| `lion-hawk/test` | `testing/index.js` | [package.json:13] <!-- C-20 C-26 --> |
| `lion-hawk/bake` | `tools/bake/index.js` | [package.json:14] <!-- C-20 --> |
| `lion-hawk/build` | `tools/build/index.js` | [package.json:15] <!-- C-20 --> |
| `lion-hawk/playwright` | `testing/playwright.js` | [package.json:16] <!-- C-20 C-26 --> |
| `lion-hawk/package.json` | `package.json` | [package.json:17] <!-- C-20 --> |

The exports map has no entry for the dev server, the glyph script, the test runner or the release command. The dev server, test runner and release command are reachable only through the CLI. [package.json:7-18; tools/cli.js:7-8] <!-- C-27 -->

### Re-exports of lion-hawk/sim
`src/index.sim.js` holds everything that runs headless. The file has no three.js, no DOM and no wall clock. [src/index.sim.js:1] <!-- C-28 -->

| Exports | Source module | Described in | Evidence |
| --- | --- | --- | --- |
| `ENGINE_VERSION`, `rng`, `fnv`, all of `core/math.js`, `createEvents`, `parseFlags`, `FLAGS`, `createSchedule`, `STEP_STAGES`, `createLoop`, `axis`, `button`, `actions`, `createInput`, `createUi`, `pickNeighbour`, `NAV_DIRS`, `checkNav`, `topNav`, `menuOwnsInput`, `defineGame`, `createEngine`, `policy` | `src/version.js`, `src/core/*` | [core](core.md) | [src/index.sim.js:2-14] <!-- C-29 --> |
| `F`, `kind`, `defineMaterials`, `BASE_MATERIALS`, `SIDECAR_VERSION`, `validateSidecar`, `validatePhys` | `src/defs/*` | [defs-and-kits](defs-and-kits.md) | [src/index.sim.js:15; src/index.sim.js:21-23] <!-- C-30 --> |
| `FRAME`, `MAX_FRAME`, `REPEAT`, `createRegistry`, `encodeRecord`, `encodeFrame`, `decodeFrame`, `isFrame`, `createTracker`, `createStore`, `frameToJson`, `frameFromJson`, `DELAY`, `lerp`, `lerpAngle`, `lerpPose`, `createInterp`, `FORECAST`, `newPose`, `extrapolate`, `createForecast`, `createRate`, `createWarnOnce`, `checkSchema`, `wireCodec` | `src/sim/replica.js`, `interp.js`, `forecast.js`, `limits.js`, `schema.js` | [net-replication](net-replication.md) | [src/index.sim.js:16-20] <!-- C-31 --> |
| `createWorld`, `heightfieldDesc` | `src/sim/world/world.js`, `src/sim/physics/heightfield.js` | [sim-world-physics](sim-world-physics.md) | [src/index.sim.js:24-25] <!-- C-32 --> |
| `installNet` | `src/sim/net/install.js` | [net-replication](net-replication.md) | [src/index.sim.js:26] <!-- C-33 --> |
| `createWind`, `createFields`, `FIELDS_SYSTEM` | `src/sim/fields/index.js` | [sim-world-physics](sim-world-physics.md) | [src/index.sim.js:27] <!-- C-221 --> |

### Re-exports of lion-hawk/view
`src/index.view.js` holds browser-only modules. It also re-exports everything in `lion-hawk/sim` with `export *`. [src/index.view.js:1-2] <!-- C-34 -->

| Exports | Source module | Described in | Evidence |
| --- | --- | --- | --- |
| `installEngineHook`, `createDriver`, `bindKeyboard`, `bindGamepad`, `bindMenuNav`, `createPadEdges`, `familyOf`, `PAD_BUTTONS`, `bindStick`, `bindHold`, `bindPointer`, `bindGesture`, `createUiDom`, `installEngine`, `defineView`, `boot` | `src/view/*.js` | [view-input](view-input.md) | [src/index.view.js:3-14] <!-- C-35 --> |
| `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift`, `createMaterialCompiler`, `furGeometry` | `src/view/render/*`, `src/view/materials/*` | [view-render](view-render.md) | [src/index.view.js:15-19; src/index.view.js:22-23] <!-- C-36 --> |
| `createAssets`, `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable`, `createViewSync`, `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd`, `createAudio` | `src/view/assets`, `sync`, `camera`, `instancing`, `audio` | [view-presentation](view-presentation.md) | [src/index.view.js:20-21; src/index.view.js:24-31] <!-- C-37 --> |

### Re-exports of lion-hawk/net
`lion-hawk/net` runs in Node and in the browser. The module is not sim-pure: a port reads the injected clock and `withLag` uses a timer. [src/index.net.js:1] <!-- C-39 -->

| Exports | Source module | Described in | Evidence |
| --- | --- | --- | --- |
| `emitter`, `createMemoryHub`, `parseLag`, `withLag`, `roomLink`, `createPort`, `bridgeTransport`, `peerKey`, `claimPeerKey`, `keyWords` | `src/net/transport.js`, `port.js`, `bridge.js`, `key.js` | [net-replication](net-replication.md) | [src/index.net.js:2-5] <!-- C-38 --> |

### Tool exports
| Export | Module | Evidence |
| --- | --- | --- |
| `loadConfig`, `ENGINE_VERSION`, `optionsHash`, `sources`, `loadRegistry`, `bakeModel`, `bake` | `lion-hawk/bake` | [tools/bake/index.js:18; tools/bake/index.js:20; tools/bake/index.js:25; tools/bake/index.js:30; tools/bake/index.js:46; tools/bake/index.js:55; tools/bake/index.js:80] <!-- C-40 --> |
| `build`, `bundle`, `bakedAssets`, `ENGINE_VERSION`, `dedupe`, `UsageError` | `lion-hawk/build` | [tools/build/index.js:22; tools/build/index.js:24; tools/build/index.js:26; tools/build/index.js:35; tools/build/index.js:48] <!-- C-41 --> |

### Function signatures
| Function | Returns | Evidence |
| --- | --- | --- |
| `bake({ game = '.', ids = [], check = false, log = console.log })` | `{ ok, baked, stale }` | [tools/bake/index.js:1-4; tools/bake/index.js:80] <!-- C-42 C-53 C-65 --> |
| `bakeModel(cfg, registry, id, { file, rel, opts }, log)` | `{ id, sidecar, glb, anim, options }` | [tools/bake/index.js:55; tools/bake/index.js:77] <!-- C-73 --> |
| `sources(cfg)` | Map from id to `{ file, rel, opts }`. `opts` is the `bake.models` entry or `null`. | [tools/bake/index.js:30; tools/bake/index.js:37-41] <!-- C-49 --> |
| `loadConfig(dir = '.')` | `dir`, `version`, `id`, `outEnv`, `bake`, `build`, `test` | [tools/bake/config.js:46; tools/bake/config.js:85-97] <!-- C-91 --> |
| `build({ game = '.', out, env, mode = 'single', e2e = false, entry, log })` | `{ out, version, hash, files, sizes }`, plus `shared` in shared mode | [tools/build/index.js:4-9; tools/build/index.js:48; tools/build/index.js:112] <!-- C-164 C-232 --> |
| `bundleGame(cfg, { entry, e2e = false })` | `{ js, needs }` | [tools/build/shared.js:32-39] <!-- C-233 --> |
| `buildPack(cfg, { dir, base, needs, e2e = false })` | `{ imports, files }` | [tools/build/shared.js:41-42; tools/build/shared.js:69] <!-- C-238 --> |
| `engineEntries()` | object from specifier to source file | [tools/build/shared.js:18-26] <!-- C-234 --> |
| `addImportMap(html, imports)` | the page HTML with an import map | [tools/build/shared.js:72-76] <!-- C-240 --> |
| `makeManifest(m, iconName)` | the web manifest object | [tools/build/page.js:20-33] <!-- C-264 --> |
| `linkManifest(html, m)` | the page HTML with the manifest link | [tools/build/page.js:34-41] <!-- C-266 --> |
| `compressTextures(doc, t)` | the document | [tools/bake/textures.js:14-15; tools/bake/textures.js:38] <!-- C-245 --> |
| `aeroOf(parts)` | `{ panels, volume, centroid }` | [tools/bake/aero.js:10; tools/bake/aero.js:38] <!-- C-256 C-258 --> |
| `runTests({ game = '.', visual = false, log })` | the exit code of `node --test` | [tools/test/index.js:22; tools/test/index.js:33] <!-- C-267 C-271 --> |
| `release({ game = '.', bump = 'patch', out, env, log })` | exit code 0, or a thrown error | [tools/release/index.js:19; tools/release/index.js:39] <!-- C-279 C-281 --> |
| `bumpVersion(v, bump)` | the new `x.y.z` version string | [tools/release/index.js:13-17] <!-- C-277 --> |
| `dev({ game = '.', port = 8740, host = '0.0.0.0', log })` | `{ url, port, close }` | [tools/dev/index.js:17; tools/dev/index.js:83-84] <!-- C-195 --> |
| `dedupe({ root, packages })` | esbuild plugin | [tools/dedupe.js:4] <!-- C-194 --> |
| `animTable(doc, model, rows, { fps = 30, clips = null })` | `{ v, fps, parts, clips }` | [tools/bake/animTable.js:35-39] <!-- C-133 --> |
| `massOf(colliders, density)` | `{ mass, com, inertia, frame }` | [tools/bake/mass.js:67] <!-- C-126 --> |
| `hull(points)` | `{ points, tris }` or `null` | [tools/bake/hull.js:2-3; tools/bake/hull.js:69-70] <!-- C-124 --> |
| `readBaked(outDir)` | `{ phys, manifest }`, each `null` when absent | [tools/bake/write.js:10-13] <!-- C-161 --> |

### Files
| File | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `<bake.out>/phys.json` | out | JSON, compact | [tools/bake/write.js:32] <!-- C-155 C-160 --> |
| `<bake.out>/manifest.json` | out | JSON, 2-space indent | [tools/bake/write.js:33] <!-- C-155 C-160 --> |
| `<bake.out>/models/<id>.glb` | out | GLB | [tools/bake/write.js:22] <!-- C-155 C-157 --> |
| `<bake.out>/models/<id>.anim.json` | out | JSON, only for a model with an anim table | [tools/bake/write.js:23-24] <!-- C-155 C-157 --> |
| `<out>/index.html`, `<out>/assets/models/*`, PWA files, `sw.js` | out | build output | [tools/build/index.js:91-105] <!-- C-178 C-179 --> |
| `<out>/manifest.webmanifest` and the icon | out | JSON with a 2-space indent, only with `build.manifest` | [tools/build/index.js:82; tools/build/index.js:100] <!-- C-263 --> |
| `<pack dir>/*` | out | content-hashed JS files, only in shared mode | [tools/build/shared.js:42-69] <!-- C-235 C-236 --> |
| `src/kits/glyphs/icons.js`, `src/kits/glyphs/LICENSE.txt` | out | generated by the glyph script | [tools/glyphs/build.mjs:28-32] <!-- C-216 --> |

## Behavior

### CLI
- **B-1** When the bin script runs, the script calls `main(process.argv.slice(2))`. The script sets `process.exitCode` only when `main` returns a value other than `null`. [bin/lion-hawk.js:3-6] <!-- C-1 -->
- **B-2** If the first argument is `--help`, `-h` or `help`, `main` logs `USAGE` and returns 0. [tools/cli.js:28] <!-- C-4 -->
- **B-3** If the command is missing or unknown, `main` writes `lion-hawk: unknown command '<cmd>'` and `USAGE` to the error sink and returns 2. [tools/cli.js:29; test/cli.test.mjs:17] <!-- C-5 -->
- **B-4** If option parsing fails, `main` writes `lion-hawk <cmd>: <message>` and `USAGE` to the error sink and returns 2. Parsing is strict. [tools/cli.js:31-32] <!-- C-6 -->
- **B-5** Only the `bake` command accepts positional arguments. Each positional argument is a model id. [tools/cli.js:31] <!-- C-7 -->
- **B-6** The `bake` command calls `bake` with `game`, the positional ids, `check` and `log`. `main` returns 0 if the result is ok and 1 if not. [tools/cli.js:34] <!-- C-11 -->
- **B-7** Tests pin the `bake` exit codes: 0 when current, 1 when stale, and 1 on a bake error. [test/cli.test.mjs:35] <!-- C-17 -->
- **B-8** The `build` command calls `build` with `game`, `out`, `env`, `mode`, `e2e` and `log`. `main` returns 0 when `build` finishes. [tools/cli.js:35] <!-- C-12 -->
- **B-9** Tests pin that a `build` with no `--out` and no `outEnv` variable exits 0 and writes `<game>/build/`, and that the `outEnv` variable moves the output. An unknown `--mode` exits 2. [test/cli.test.mjs:25-33] <!-- C-18 -->
- **B-10** If `--port` is not an integer from 0 to 65535, `main` writes `lion-hawk dev: --port must be 0..65535 (got <value>)` and returns 2. [tools/cli.js:38-39] <!-- C-13 -->
- **B-11** After `dev` starts, `main` returns `null`. The bin script then sets no exit code, and the process keeps serving until it is stopped. [tools/cli.js:40-41; bin/lion-hawk.js:6; test/cli.test.mjs:45] <!-- C-14 -->
- **B-12** If a command throws, `main` writes `lion-hawk: <message>` to the error sink. `main` returns 2 for a `UsageError` or for an error whose `usage` property is truthy. `main` returns 1 for any other error. [tools/cli.js:42-45] <!-- C-15 C-191 -->
- **B-13** Tests pin that the bin file is executable and that usage errors exit 2. [test/cli.test.mjs:17] <!-- C-19 -->
- **B-152** The `test` command calls `runTests` with `game`, `visual` and `log`. `main` returns 0 if `runTests` returns 0 and 1 for any other code. [tools/cli.js:36] <!-- C-224 -->
- **B-153** The `release` command calls `release` with `game`, `bump`, `out`, `env` and `log`. `main` returns the value that `release` returns. [tools/cli.js:37] <!-- C-225 -->

### Bake: command flow
- **B-14** If `game` is a string, `bake` loads game.config.js with `loadConfig`. Otherwise `bake` uses `game` as the loaded game.config.js. [tools/bake/index.js:80-81] <!-- C-42 -->
- **B-15** The `bake` function loads the registry and the sources. It then reads the earlier `phys.json` and `manifest.json` from `bake.out`, resolved against the game directory. [tools/bake/index.js:82] <!-- C-43 -->
- **B-16** If an id given to `bake` is not a source, `bake` throws `bake: <id>: no such model in <bake.src>`. [tools/bake/index.js:83] <!-- C-44 -->
- **B-17** In a write bake, the registry or engine is changed when `phys.json` exists. The registry hash or the engine major.minor in `phys.json` must differ from the current values. [tools/bake/index.js:99] <!-- C-61 -->
- **B-18** A write bake bakes every source if no ids are given, if the registry or engine changed, or if `phys.json` does not exist. Otherwise the bake covers only the given ids. [tools/bake/index.js:101; test/bake-output.test.mjs:63] <!-- C-62 -->
- **B-19** If ids are given but `bake` must bake every model, `bake` logs `bake: no phys.json yet, or the registry hash or engine version changed, so every model is baked`. [tools/bake/index.js:100] <!-- C-63 -->
- **B-20** For each baked model, `bake` logs `baked <id>: <n> parts, <n> colliders, <n> bytes`. The log line adds `, <n> clips` when the model has an anim table. [tools/bake/index.js:105] <!-- C-64 -->
- **B-21** After baking, `bake` calls `writeBaked` with the models it did not bake as `keep`. `bake` then returns `{ ok: true, baked: <ids baked>, stale: [] }`. [tools/bake/index.js:107-109] <!-- C-65 -->
- **B-22** Tests pin that a re-bake of unchanged sources is byte-identical. A partial bake after a source change equals a full bake of a fresh copy. [test/bake-output.test.mjs:57; test/bake-output.test.mjs:111] <!-- C-162 -->

### Bake: sources and registry
- **B-23** The `sources` function lists each `.glb` or `.gltf` file in `bake.src` in sorted order. The model id is the file name without its extension, unless a `models` entry claims the file with `file`. [tools/bake/index.js:31-35] <!-- C-45 -->
- **B-24** A `models` entry with a `file` key maps its id to that file in `bake.src`, so an id can differ from the source file name. [tools/bake/index.js:32; tools/bake/index.js:35; test/bake-output.test.mjs:81] <!-- C-46 -->
- **B-25** The `sources` function returns a Map from id (sorted) to `{ file, rel, opts }`. The `file` value is absolute. The `rel` value is relative to the game directory with forward slashes. The `opts` value is the `bake.models` entry for the id, or `null` if there is none. [tools/bake/index.js:30; tools/bake/index.js:37-41] <!-- C-49 -->
- **B-26** If `bake.src` does not exist, `sources` finds no files. [tools/bake/index.js:33] <!-- C-49 -->
- **B-27** If `bake.materials` is not set, `loadRegistry` throws `config: bake.materials is required (module whose default export is the registry)`. [tools/bake/index.js:47] <!-- C-50 -->
- **B-28** If the default export of the `bake.materials` module lacks a `has` function, a `density` function or a string `hash`, `loadRegistry` throws `config: <path> default export is not a material registry (needs has, density, hash)`. [tools/bake/index.js:48-50] <!-- C-51 -->
- **B-29** If the registry does not have the `bake.paint.base` id, `loadRegistry` throws `config: bake.paint.base '<id>' is not in the registry`. [tools/bake/index.js:51] <!-- C-52 -->
- **B-30** A test pins that kits with the same `Textures/colormap.png` resolve per source file and do not collide. [test/bake-output.test.mjs:90] <!-- C-219 -->

### Bake: check mode
- **B-31** With `check` true, `bake` writes nothing and returns `{ ok, baked: [], stale }`. A test pins that `--check` passes on a fresh bake and writes nothing. [tools/bake/index.js:84-98; test/bake-check.test.mjs:16] <!-- C-53 -->
- **B-32** If `phys.json` does not exist, `bake` logs `stale: *: no phys.json` and returns ok false with one stale entry for id `*`. [tools/bake/index.js:86] <!-- C-54 -->
- **B-33** If the registry hash differs from `phys.json`, `bake` adds a stale entry for `*` with the reason `registry hash <old> → <new>`. [tools/bake/index.js:87] <!-- C-55 -->
- **B-34** The check compares only the major and minor parts of the engine version. If they differ from `phys.json`, `bake` adds a stale entry for `*` with the reason `engine <old> → <new>`. [tools/bake/index.js:21; tools/bake/index.js:88] <!-- C-56 -->
- **B-35** For each source, `bake` reports `not baked` if `phys.json` has no sidecar for the id. Else it reports `source changed` if the sha256 of the source differs. [tools/bake/index.js:89-92; test/bake-check.test.mjs:22] <!-- C-57 -->
- **B-36** If neither condition applies, `bake` reports `bake options changed` when the options hash in `manifest.json` differs from `optionsHash`. [tools/bake/index.js:93; test/bake-check.test.mjs:47] <!-- C-57 -->
- **B-37** If a manifest has no options hash for a model, that model reads as `bake options changed`. The stored value is undefined and differs from the computed hash. [tools/bake/index.js:93; CHANGELOG.md:42] <!-- C-60 -->
- **B-38** `bake` reports `source removed` for each id in `phys.json` that has no source. [tools/bake/index.js:95] <!-- C-58 -->
- **B-39** `bake` logs `stale: <id>: <why>` for each stale entry. The result is ok only when no entry is stale. [tools/bake/index.js:96-97] <!-- C-59 -->

### Bake: one model
- **B-40** `bakeModel` first reads the source, applies renames and converts the palette to vertex colours (if enabled). `bakeModel` then classifies nodes, builds colliders and computes mass. `bakeModel` then builds the sidecar and the anim table, removes col-* nodes, optimises, compresses textures and writes the GLB. [tools/bake/index.js:55-77] <!-- C-66 -->
- **B-41** `bakeModel` merges the per-model rename maps over the global rename maps, so the per-model name wins. [tools/bake/index.js:58] <!-- C-67 -->
- **B-42** If a model has no `models` entry, `bakeModel` uses `DEFAULT_OPTS`: `static` false, `keepTextures` false, `sockets` empty, `colliders` true, `animTable` null, and empty rename maps. `DEFAULT_OPTS` has no `aero` key, so such a model gets no aero block. [tools/bake/index.js:22; tools/bake/index.js:56; tools/bake/index.js:68] <!-- C-68 -->
- **B-43** If a model sets `colliders` to false, the sidecar has no colliders and the mass is zero. [tools/bake/index.js:61-62; tools/bake/mass.js:77; test/bake-output.test.mjs:81] <!-- C-77 -->
- **B-44** If the model has an `animTable` option, the anim table rows are the parts in order, then each socket as `sock-<name>`. [tools/bake/index.js:70; test/bake-anim.test.mjs:20] <!-- C-70 -->
- **B-45** `bakeModel` disposes each col-* node before it writes the GLB. `bakeModel` also disposes the node mesh if no other Node uses the mesh. [tools/bake/index.js:71-74; test/bake-output.test.mjs:45] <!-- C-71 -->
- **B-46** `bakeModel` passes the model `keepTextures` value to `optimise` as `keepAttributes`. [tools/bake/index.js:59; tools/bake/index.js:75] <!-- C-72 -->
- **B-47** A test pins that a baked GLB loads in three 0.186 with `MeshoptDecoder`. The col-* nodes are gone, and the `sock-*` nodes and parts are present. [test/bake-output.test.mjs:45] <!-- C-220 -->
- **B-48** `socketsOf` returns `{ p, q, part }` for each socket name. The `p` and `q` values come from the node world matrix in body space and are rounded to 6 decimals. [tools/bake/sockets.js:1-10; tools/bake/math.js:4-5] <!-- C-163 -->

### Bake: reading and renames
- **B-49** `getIO` creates one `NodeIO` with all extensions and the meshopt decoder and encoder. `getIO` caches the `NodeIO` for later calls. [tools/bake/read.js:8-14] <!-- C-142 -->
- **B-50** `applyRenames` renames each material and each node whose name equals a key of the rename map exactly. [tools/bake/read.js:17-21; test/bake-read.test.mjs:27] <!-- C-143 -->
- **B-51** When `bake.palette` is `'vertex'` and the model does not set `keepTextures`, `paletteToVertex` gives a primitive a `COLOR_0` attribute. The primitive needs a base-colour texture and `TEXCOORD_0` and has no `COLOR_0`. [tools/bake/read.js:24-29; tools/bake/read.js:43-52; tools/bake/index.js:59; test/bake-read.test.mjs:6] <!-- C-144 -->
- **B-52** Each such vertex colour is the texel at the vertex UV times the base colour factor, in linear floats. [tools/bake/read.js:44-50; test/bake-read.test.mjs:6] <!-- C-144 -->
- **B-53** For such a primitive, `paletteToVertex` removes `TEXCOORD_0` and `TANGENT`. It sets the material factor to white and removes the texture when every user of the material has `COLOR_0` and no `TEXCOORD_0`. [tools/bake/read.js:53-56; tools/bake/read.js:58-62; test/bake-read.test.mjs:6] <!-- C-145 -->
- **B-54** A primitive whose material has no texture gets `COLOR_0` equal to the base colour factor at every vertex. The material factor becomes white when all its users got one. [tools/bake/read.js:31-36; tools/bake/read.js:40; tools/bake/read.js:62; test/bake-read.test.mjs:34] <!-- C-146 -->
- **B-55** `paletteToVertex` leaves a primitive alone if it already has `COLOR_0`, has no material, or has a texture but no `TEXCOORD_0`. After the pass, it disposes textures that no object uses. [tools/bake/read.js:39; tools/bake/read.js:41; tools/bake/read.js:64; test/bake-read.test.mjs:19] <!-- C-147 -->
- **B-56** `paletteToVertex` wraps UV coordinates into 0..1. It reads the PNG pixel at floor(u × width) and floor(v × height), clamped to the image. [tools/bake/read.js:45-49] <!-- C-149 -->

### Bake: node conventions
- **B-57** `classify` walks the default scene depth first, or the first scene if there is no default. It returns `{ parts, cols, socks }`. If the document has no scene, `classify` fails with `no scene`. [tools/bake/conventions.js:1-2; tools/bake/conventions.js:13-14; tools/bake/conventions.js:65-67] <!-- C-92 -->
- **B-58** Every `classify` failure throws an Error with the text `bake: <model>: <problem>`. The problem names the node or the material. [tools/bake/conventions.js:2; tools/bake/conventions.js:11; test/bake-conventions.test.mjs:12] <!-- C-93 -->
- **B-59** `sanitize` replaces each whitespace character with `_` and removes the characters `[`, `]`, `.`, `:` and `/`, as three's `GLTFLoader` does. For example `lamp.001` becomes `lamp001`. [tools/bake/conventions.js:5-7] <!-- C-95 -->
- **B-60** A node whose name starts with `col-` fails if its shape word is not in the shape list. It also fails if it has no mesh, has children, or has a primitive mode other than 4 (triangles). [tools/bake/conventions.js:26-31] <!-- C-96 -->
- **B-61** A col-* node belongs to its parent part. If it has no parent part, it uses `extras.part`, which must name a part found earlier in the walk. If neither exists, `classify` fails. [tools/bake/conventions.js:32-35] <!-- C-97 -->
- **B-62** A col-* node can set `extras.material`. The value must be a registry id or match `/^paint-[\w-]+$/`, else `classify` fails. Without `extras.material` the collider material is null at this stage. [tools/bake/conventions.js:12; tools/bake/conventions.js:36-37; test/bake-conventions.test.mjs:29] <!-- C-98 -->
- **B-63** `classify` does not check the material of the col-* mesh itself. [tools/bake/conventions.js:26-39; test/bake-conventions.test.mjs:29] <!-- C-98 -->
- **B-64** A node whose name starts with `sock-` fails if it has a mesh or if its name after `sock-` is empty. The node also fails if another socket has the same name. [tools/bake/conventions.js:40-44] <!-- C-99 -->
- **B-65** A socket gets the sanitised name in the GLB. Its sidecar name is the text after `sock-`. Its part is the enclosing part name, or null if no part encloses it. [tools/bake/conventions.js:42-45; test/bake-conventions.test.mjs:35] <!-- C-100 -->
- **B-66** A node with a mesh is a part. The node needs a non-empty name. The part name is the sanitised name with `-2`, `-3` added in turn until the name is unique, and the node is renamed to match. [tools/bake/conventions.js:48-54; tools/bake/conventions.js:61; test/bake-conventions.test.mjs:35; test/bake-conventions.test.mjs:55] <!-- C-101 -->
- **B-67** Part names are unique against the scene name and every named node that is not a part and not a col-* node. GLTFLoader names all nodes in one namespace. [tools/bake/conventions.js:16-23; test/bake-conventions.test.mjs:45] <!-- C-102 -->
- **B-68** For each primitive of a part, `classify` fails if the primitive has no material. It also fails if the material name is neither in the registry nor `paint-*`, or if the mode is not 4. [tools/bake/conventions.js:55-60] <!-- C-103 -->
- **B-69** Parts nest. A mesh node inside a part is a part too, and sockets and col-* nodes below it name the nearest part above them. [tools/bake/conventions.js:47-63; test/bake-conventions.test.mjs:35] <!-- C-104 -->
- **B-70** If a socket named in the `sockets` option of the model is missing, `classify` fails with `sock-<name> missing (required socket)`. [tools/bake/conventions.js:66] <!-- C-105 -->

### Bake: colliders
- **B-71** With col-* nodes, `collidersOf` gives one collider per col-* node in node order. A hull or mesh collider has `p` `[0,0,0]` and `q` `[0,0,0,1]`, and its points are in body space. [tools/bake/colliders.js:51; tools/bake/colliders.js:67-83] <!-- C-106 -->
- **B-72** A collider material is the `extras.material` of the col-* node, or if none the main material of its part. A `paint-*` material becomes the paint base material. [tools/bake/colliders.js:65; tools/bake/colliders.js:70] <!-- C-107 -->
- **B-73** The main material of a part is the material with the largest body-space triangle area over the primitives of the part. A tie goes to the first material. [tools/bake/colliders.js:19-31] <!-- C-108 -->
- **B-74** A col-hull node gives a hull from its mesh vertices in body space. A col-mesh node gives a welded triangle mesh. Vertices that match after rounding to 1e-6 merge. [tools/bake/colliders.js:39-50; tools/bake/colliders.js:71-72] <!-- C-109 -->
- **B-75** A col-box fits the own mesh bounds of the node. Its half extents are half the bound size times the absolute node scale. Its `p` and `q` come from the node world matrix. [tools/bake/colliders.js:73-77; test/bake-colliders.test.mjs:20] <!-- C-110 -->
- **B-76** A col-sphere has a radius equal to the largest half extent. [tools/bake/colliders.js:78] <!-- C-111 -->
- **B-77** For a col-capsule or col-cylinder, `r` is the largest half extent across the axis. A cylinder has `halfHeight` equal to the half extent along the axis. A capsule has `halfHeight` of max(0, that half extent − `r`). [tools/bake/colliders.js:79-81] <!-- C-112 -->
- **B-78** The rotation `q` of a capsule or cylinder is the node rotation times `AXIS_Q[axis]`. `AXIS_Q` turns the +y axis of Rapier onto the chosen axis. [tools/bake/colliders.js:7-8; tools/bake/colliders.js:81] <!-- C-112 -->
- **B-79** `axisOf` picks the extent whose other two extents are closest to equal (the round cross-section). A tie within 1e-6 goes to the longest extent. [tools/bake/colliders.js:52-61; test/bake-colliders.test.mjs:56; test/bake-colliders.test.mjs:64] <!-- C-113 -->
- **B-80** With no col-* nodes and `static` true, each part gets one welded mesh collider with the main material of the part. [tools/bake/colliders.js:85-87; test/bake-colliders.test.mjs:34] <!-- C-114 -->
- **B-81** With no col-* nodes and `static` false, each part gets one hull for each material of its primitives. The hull is built from the vertices in body space. [tools/bake/colliders.js:88-93; test/bake-colliders.test.mjs:34] <!-- C-115 -->
- **B-82** If the points of a (part, material) group have no hull (flat), `collidersOf` skips the group and warns `bake: <model>: <part> (<material>) is flat, so it has no default hull`. [tools/bake/colliders.js:91; tools/bake/colliders.js:96; test/bake-colliders.test.mjs:45] <!-- C-116 -->
- **B-83** A hull collider keeps at most 64 points. If the hull has more, `collidersOf` decimates it to 64 points and builds the hull again. Points are rounded to 6 decimals. [tools/bake/colliders.js:32-38; test/bake-hull.test.mjs:39] <!-- C-119 -->
- **B-84** `boundsOf` returns the min and max of the part vertices in body space, rounded to 6 decimals. If there are no vertices, `boundsOf` returns zero min and max. [tools/bake/colliders.js:100-110] <!-- C-120 -->

### Bake: hull
- **B-85** `hull(points)` removes points that match after rounding to 1e-6. If fewer than 4 points remain, `hull` returns `null`. [tools/bake/hull.js:7-9; test/bake-hull.test.mjs:22] <!-- C-121 -->
- **B-86** `hull` returns `null` if the points are collinear or coplanar. The tolerance is 1e-7 times the bounding box diagonal, and the diagonal counts as at least 1e-9. [tools/bake/hull.js:10-12; tools/bake/hull.js:20; tools/bake/hull.js:24; test/bake-hull.test.mjs:22] <!-- C-122 -->
- **B-87** `hull` adds points in quickhull order: the point farthest outside any face first, ties to the lowest index. The result is deterministic, and each face has outward winding. A test pins that a reversed input gives the same set of hull points. [tools/bake/hull.js:1-3; tools/bake/hull.js:34-36; test/bake-hull.test.mjs:10; test/bake-hull.test.mjs:27] <!-- C-123 -->
- **B-88** `hull` returns `{ points, tris }`. The `points` value holds the used points in input order, and `tris` holds index triples into `points`. [tools/bake/hull.js:2-3; tools/bake/hull.js:69-70] <!-- C-124 -->
- **B-89** `decimate(points, max = 64)` returns the points unchanged if there are `max` or fewer. Otherwise `decimate` picks the support point for each of `max` Fibonacci-sphere directions. [tools/bake/hull.js:73-83; test/bake-hull.test.mjs:27] <!-- C-125 -->
- **B-90** `decimate` returns the distinct support points in input order. [tools/bake/hull.js:82] <!-- C-125 -->

### Bake: mass
- **B-91** `massOf` computes volume, centre and inertia for box, sphere, cylinder, capsule, mesh and hull colliders. For a hull collider, `massOf` builds the hull again from its points. [tools/bake/mass.js:8-25] <!-- C-127 -->
- **B-92** `massOf` skips a collider whose mass is not above 0, for example a zero-density collider. If the total mass is 0, `massOf` returns zero mass, `com` and inertia, and the identity frame. [tools/bake/mass.js:71; tools/bake/mass.js:77; test/bake-mass.test.mjs:31] <!-- C-129 -->
- **B-93** `massOf` moves each collider into body space and sums them with the parallel-axis rule. It then diagonalises the inertia with cyclic Jacobi, at most 50 sweeps. It flips an axis so the frame is a proper rotation. [tools/bake/mass.js:49-65; tools/bake/mass.js:67-88] <!-- C-130 -->
- **B-94** For a mesh or hull, `massOf` sums signed tetrahedra from the origin. If the absolute volume is under 1e-12, the shape has zero volume and zero inertia. [tools/bake/mass.js:30-47] <!-- C-131 -->
- **B-95** Tests pin that the mass properties match Rapier 0.21 to 1% for each shape, for offset and rotated bodies, and for every baked sidecar. [test/bake-mass.test.mjs:23; test/bake-mass.test.mjs:27; test/bake-output.test.mjs:41] <!-- C-132 -->

### Bake: anim tables
- **B-96** If `clips` is null, `animTable` samples every animation in document order. Otherwise `animTable` samples the named clips. [tools/bake/animTable.js:35; tools/bake/animTable.js:38] <!-- C-134 -->
- **B-97** The clip duration is the largest last key time of its samplers. The frame count is max(1, round(dur × fps)). Frame f is sampled at t = f / frames × dur, so the clip loops and the end pose is frame 0. [tools/bake/animTable.js:1-3; tools/bake/animTable.js:44-47; test/bake-anim.test.mjs:20] <!-- C-137 -->
- **B-98** `animTable` interpolates rotation with shortest-arc slerp, and translation and scale linearly. A STEP sampler holds the earlier key. A key exactly at the sample time wins. [tools/bake/animTable.js:7-27] <!-- C-140 -->
- **B-99** A test pins that each row equals the three.js `AnimationMixer` result on the source GLB. [test/bake-anim.test.mjs:30] <!-- C-140 -->
- **B-100** If a clip has no channel for a node and path, `animTable` uses the own translation, rotation or scale of the node. [tools/bake/animTable.js:16-18] <!-- C-141 -->

### Bake: optimisation
- **B-101** `optimise` runs these steps in order, each only if its option is true: dedup (`keepUniqueNames`), weld, and prune (`keepLeaves`, `keepExtras`, `keepSolidTextures`). The last steps are quantize and reorder with the meshopt encoder (target size). [tools/bake/optimise.js:14-20; test/bake-optimise.test.mjs:45] <!-- C-150 -->
- **B-102** `quantize` applies only to `NORMAL`, `TANGENT` and `COLOR_n` attributes, with 10 bits for normals and 8 bits for colours. `POSITION` and `TEXCOORD` are never quantized, so part names, sockets and anim-table rows stay valid. [tools/bake/optimise.js:2-5; tools/bake/optimise.js:18; test/bake-optimise.test.mjs:19; test/bake-optimise.test.mjs:39] <!-- C-151 -->
- **B-103** If `o.meshopt` is true, `optimise` adds the `EXT_meshopt_compression` extension as required, with the FILTER encoder method. [tools/bake/optimise.js:21] <!-- C-152 -->
- **B-104** `prune` uses `keepAttributes` (default true). If `keepAttributes` is false, `prune` drops attributes that nothing reads, such as UVs without a texture and tangents without a normal map. [tools/bake/optimise.js:5-7; tools/bake/optimise.js:17; test/bake-output.test.mjs:119] <!-- C-153 -->
- **B-105** `prune` keeps solid-colour textures. [tools/bake/optimise.js:5; tools/bake/optimise.js:17] <!-- C-153 -->
- **B-106** `optimise` sets the document logger to the WARN level, so the info lines of `prune` do not print. [tools/bake/optimise.js:13] <!-- C-154 -->

### Bake: textures
- **B-154** `bakeModel` calls `compressTextures` after `optimise`, so only the textures that ship are encoded. [tools/bake/index.js:76] <!-- C-245 -->
- **B-155** `compressTextures` does nothing if `bake.textures` is null or the document has no textures. [tools/bake/textures.js:14-15] <!-- C-245 -->
- **B-156** With `format` `'webp'`, `compressTextures` runs `textureCompress` with sharp, target format webp, the quality setting (null if absent) and the resize setting. Without `bake.textures`, a bake leaves textures unchanged. [tools/bake/textures.js:16-20; test/bake-textures.test.mjs:18] <!-- C-246 -->
- **B-157** With `format` `'ktx2'` and no `toktx` on `PATH`, `compressTextures` throws `bake: textures.format 'ktx2' needs toktx (KTX-Software) on PATH: https://github.com/KhronosGroup/KTX-Software/releases`. [tools/bake/textures.js:21; test/bake-textures.test.mjs:35] <!-- C-247 -->
- **B-158** With `format` `'ktx2'` and a `resize` setting, `compressTextures` resizes first and keeps the format. [tools/bake/textures.js:22] <!-- C-248 -->
- **B-159** For `ktx2`, `compressTextures` writes each PNG, JPEG or WebP texture to a temporary directory. `compressTextures` runs `toktx --t2 --genmipmap` on the file and skips textures of any other type. [tools/bake/textures.js:12; tools/bake/textures.js:23-31] <!-- C-248 -->
- **B-160** For `ktx2`, `mode` `'uastc'` passes `--encode uastc`. Any other mode passes `--encode etc1s`, and a `quality` setting adds `--qlevel` round(quality × 2.55). [tools/bake/textures.js:29] <!-- C-249 -->
- **B-161** Colour textures use `--assign_oetf srgb`. Other textures use `--assign_oetf linear` and `--assign_primaries none`. [tools/bake/textures.js:30] <!-- C-249 -->
- **B-162** If `toktx` exits with a non-zero status, `compressTextures` throws `bake: toktx failed on texture '<name or index>': <stderr or stdout>`. [tools/bake/textures.js:31-32] <!-- C-250 -->
- **B-163** After a successful `toktx` run, `compressTextures` stores the KTX2 bytes in the texture and sets its type to `image/ktx2`. `compressTextures` changes a texture URI extension to `.ktx2`. [tools/bake/textures.js:33-34] <!-- C-251 -->
- **B-164** `compressTextures` removes the temporary directory. `compressTextures` then adds the `KHR_texture_basisu` extension as required. [tools/bake/textures.js:36-37] <!-- C-251 -->
- **B-165** A test pins that `ktx2` with `toktx` writes `KHR_texture_basisu` textures. The test is skipped when `toktx` is not installed. [test/bake-textures.test.mjs:44] <!-- C-252 -->
- **B-166** A test pins that changing the textures setting makes `bake --check` report `bake options changed`. A committed bake without a textures key stays current. [test/bake-textures.test.mjs:27] <!-- C-253 -->
- **B-167** If `bake.textures.format` is not `'webp'` or `'ktx2'`, `loadConfig` throws `config: 'bake.textures.format' must be 'webp' or 'ktx2'`. [tools/bake/config.js:56-58; test/bake-textures.test.mjs:35] <!-- C-242 -->
- **B-168** If `bake.textures.quality` is set, it must be an integer from 1 to 100. Else `loadConfig` throws `config: 'bake.textures.quality' must be an integer in 1..100`. [tools/bake/config.js:59; test/bake-textures.test.mjs:35] <!-- C-242 -->
- **B-169** If `bake.textures.mode` is set for a format other than `ktx2`, `loadConfig` throws `config: 'bake.textures.mode' is for ktx2 only`. The mode must be `'etc1s'` or `'uastc'`. [tools/bake/config.js:60-61; test/bake-textures.test.mjs:35] <!-- C-243 -->
- **B-170** `bake.textures.resize` must be `[width, height]` with two positive integers, or `'nearest-pot'`, `'ceil-pot'` or `'floor-pot'`. [tools/bake/config.js:62-63] <!-- C-243 -->

### Bake: aero
- **B-171** If `bake.models.<id>.aero` is set, it must be true or false. Else `loadConfig` throws `config: 'bake.models.<id>.aero' must be true or false`. [tools/bake/config.js:83] <!-- C-254 -->
- **B-172** The normalised model entry has an `aero` key only when `aero` is true, so the option hashes of other models stay the same. [tools/bake/config.js:82; test/bake-aero.test.mjs:42] <!-- C-254 -->
- **B-173** If a model sets `aero` true, `bakeModel` adds `sidecar.aero` from `aeroOf` over the parts of the model. [tools/bake/index.js:68; test/bake-aero.test.mjs:21] <!-- C-255 -->
- **B-174** `aeroOf` puts each triangle of each part, in body space, into the bucket of the nearest of 26 directions. The directions are the faces, edges and corners of a cube. [tools/bake/aero.js:1-4; tools/bake/aero.js:7-8; tools/bake/aero.js:19-26] <!-- C-256 -->
- **B-175** Each non-empty bucket becomes one panel `{ part, a, n, c }`. The panel has the total area, the area-weighted unit normal and the area-weighted centroid, rounded to 6 decimals. [tools/bake/aero.js:27-34] <!-- C-256 -->
- **B-176** `aeroOf` skips a degenerate triangle (twice its area under 1e-12) for panels. `aeroOf` skips a bucket whose area or normal length is under 1e-9. [tools/bake/aero.js:23; tools/bake/aero.js:33] <!-- C-257 -->
- **B-177** `aeroOf` computes the volume and its centroid with the divergence theorem over every part, as signed tetrahedra from the origin. The result is right for closed, outward-wound meshes. [tools/bake/aero.js:1-4; tools/bake/aero.js:21-22] <!-- C-258 -->
- **B-178** The aero volume is max(0, volume) rounded to 6 decimals. The centroid is `[0, 0, 0]` when the volume is not above 0. [tools/bake/aero.js:37-38] <!-- C-258 -->
- **B-179** Tests pin that a unit box gets six unit panels with volume 1. A wedge gets its slope as its own panel, with volume 0.5 × w × h × d. [test/bake-aero.test.mjs:21; test/bake-aero.test.mjs:34] <!-- C-259 -->

### Bake: output files
- **B-107** `writeBaked` copies the sidecar and the manifest entry of each `keep` id from the earlier files, if they exist. [tools/bake/write.js:15-16; tools/bake/write.js:20] <!-- C-156 -->
- **B-108** For each result, `writeBaked` writes the GLB. It writes the anim table as JSON plus a newline, or removes an old anim file if the model has no anim table. [tools/bake/write.js:21-25] <!-- C-157 -->
- **B-109** If `full` is true, `writeBaked` deletes every file in `<out>/models` that no manifest entry owns. A removed source loses its files this way. [tools/bake/write.js:15-17; tools/bake/write.js:28-31; test/bake-output.test.mjs:63] <!-- C-159 -->

### Build
- **B-110** If `game` is a string, `build` loads game.config.js with `loadConfig`. Otherwise `build` uses `game` as the loaded game.config.js. `build` then resolves the output directory with `resolveOut`. [tools/build/index.js:50-51] <!-- C-166 -->
- **B-111** If `build.hooks` is set, `build` imports that file fresh. The default export is the hooks object, or an empty object if there is none. [tools/build/index.js:55] <!-- C-167 -->
- **B-112** `bundle` runs esbuild on `build.entry`, or on the `entry` option, resolved against the game directory. [tools/build/index.js:26-28] <!-- C-169 -->
- **B-113** `bundle` builds an ES module, writes no file, loads `.json` files, and uses the dedupe plugin with the game directory as root. `bundle` returns the text of the first output. [tools/build/index.js:26-32] <!-- C-169 C-218 -->
- **B-114** `bundle` minifies unless `e2e` is true. With `e2e` true, `bundle` adds an inline sourcemap. [tools/build/index.js:28-29; test/build-run.test.mjs:60] <!-- C-170 -->
- **B-115** `build` runs in this order: bundle, create the output directory, remove `sw.js` if `e2e`, `hooks.beforePage`, fill the template, and `hooks.page`. `build` then reads assets and PWA files, hashes, stamps the page, and writes files. Shared mode and `build.manifest` add steps. [tools/build/index.js:57-100] <!-- C-171 -->
- **B-116** With `e2e` true, `build` removes an existing `sw.js` from the output directory, even one from an earlier normal build. Hooks see an existing output directory. [tools/build/index.js:62-63; test/build-run.test.mjs:50] <!-- C-172 -->
- **B-117** With `e2e` true, `build` skips minification and `sw.js`. `build` passes `e2e` to the hooks. [test/build-run.test.mjs:60; tools/build/index.js:56; tools/build/index.js:101] <!-- C-180 -->
- **B-118** `bakedAssets` reads `manifest.json` from `bake.out` and lists each model GLB and anim file. If there is no manifest, `bakedAssets` returns an empty list. [tools/build/index.js:34-46] <!-- C-174 -->
- **B-119** The PWA files are the regular files in the `build.pwa` directory, sorted by name. If the directory does not exist, there are none. [tools/build/index.js:69-70] <!-- C-176 -->
- **B-120** `build` writes `index.html` and copies each asset to `<out>/assets/models/`. `build` copies each PWA file except `sw.js` to the output root. `build` then writes each generated file (web manifest and icon) to the output root. [tools/build/index.js:91-100; test/build-run.test.mjs:15] <!-- C-178 -->
- **B-121** If the PWA directory has `sw.js` and `e2e` is false, `build` writes a stamped `sw.js`. The precache list is `./`, every written file except `index.html`, and in shared mode the base plus each pack file name. [tools/build/index.js:101-105] <!-- C-179 -->
- **B-122** `build` logs `build: <id> <version> (lion-hawk <engine>, <hash>) → <dir>`. It then logs one size line each for html, assets and total, with bytes and gzip bytes in KB (1 decimal). [tools/build/index.js:106-110] <!-- C-181 -->
- **B-123** The returned `version` string is `<gameVersion>+lh<engineVersion>-<hash>`. [tools/build/index.js:112] <!-- C-182 -->
- **B-124** The single-mode bundle runs through the dedupe plugin, so one copy of three and Rapier from the game root serves both engine and game code. [tools/build/index.js:29; tools/dedupe.js:1; test/build.test.mjs:9] <!-- C-218 -->
- **B-125** `fillTemplate` replaces the first `<!--APP-->` marker with `<script type="module">`, the bundle and `</script>`. It escapes each `</script` in the bundle as `<\/script`. [tools/build/page.js:1-6; test/build-page.test.mjs:17] <!-- C-183 -->
- **B-126** `stampPage` inserts `<meta name="lion-hawk-build" content="<id> <version> lion-hawk <engine> <hash>">` on a new line after the `<head>` tag. If there is no `<head>`, `stampPage` puts the tag before the page. [tools/build/page.js:8-12; test/build-page.test.mjs:22] <!-- C-185 -->
- **B-127** `stampWorker` replaces every `__VERSION__` with `<version>+lh<engine>-<hash>`. `stampWorker` replaces the first `__PRECACHE__` with a JSON array of the precache list. [tools/build/page.js:13-18; test/build-page.test.mjs:22] <!-- C-186 -->
- **B-128** `resolveOut` picks `--out` first, then the variable that `cfg.outEnv` names in `env`, then `cfg.build.out` resolved against the game directory, and otherwise `<game dir>/build`. It never throws. [tools/build/out.js:1-9; test/build-page.test.mjs:9-16; test/build-run.test.mjs:68] <!-- C-188 -->

### Build: shared mode
- **B-180** If `mode` is neither `single` nor `shared`, `build` throws a `UsageError`: `build: mode must be 'single' or 'shared' (got '<mode>')`. [tools/build/index.js:49; test/build-run.test.mjs:60] <!-- C-165 -->
- **B-181** In shared mode, if the base does not end with `/`, `build` throws a `UsageError`: `build: build.shared.base must end with '/' (got '<base>')`. Single mode does not check the base. [tools/build/index.js:53; test/build-shared.test.mjs:53] <!-- C-227 -->
- **B-182** In shared mode, the pack directory is `build.shared.dir` resolved against the game directory. Without it, the directory is `<out>/../lion-hawk/<ENGINE_VERSION>`. [tools/build/index.js:54; test/build-shared.test.mjs:53] <!-- C-228 -->
- **B-185** In shared mode, `build` calls `bundleGame` for the game bundle. `build` then calls `buildPack` with the pack directory, the base, the `needs` set and `e2e`. [tools/build/index.js:57-61] <!-- C-229 -->
- **B-186** In shared mode, after `fillTemplate`, `build` inserts an import map from the pack imports. The insert happens before `hooks.page` runs. [tools/build/index.js:65-67] <!-- C-230 -->
- **B-187** In shared mode, `build` logs `  shared <n> files in <packDir> at <base>` after the size lines. [tools/build/index.js:111] <!-- C-231 -->
- **B-188** In shared mode, the build result has `shared: { dir, base, files, imports }`. The `files` value holds the pack file names, and `imports` maps each specifier to its URL. [tools/build/index.js:6-7; tools/build/index.js:112] <!-- C-232 -->
- **B-189** `bundleGame` bundles the game entry like `bundle`. `bundleGame` marks every `three`, `@dimforge/rapier3d-compat` and `lion-hawk` import external. [tools/build/shared.js:29; tools/build/shared.js:32-37] <!-- C-233 -->
- **B-190** `bundleGame` returns `{ js, needs }`, where `needs` is the set of external import paths. [tools/build/shared.js:30; tools/build/shared.js:38] <!-- C-233 -->
- **B-191** `engineEntries` lists `lion-hawk/sim`, `lion-hawk/view` and `lion-hawk/net` from `src/index.*.js`. For each directory in `src/kits` in sorted order, it adds `lion-hawk/kits/<kit>` if `sim.js` exists. [tools/build/shared.js:18-23] <!-- C-234 -->
- **B-192** `engineEntries` adds `lion-hawk/kits/<kit>/view` for a kit directory that has `view.js`. [tools/build/shared.js:23-25] <!-- C-234 -->
- **B-193** `buildPack` builds every engine entry in one esbuild call with code splitting. The output is an ES module, minified unless `e2e` is true. [tools/build/shared.js:42-51] <!-- C-235 -->
- **B-194** Entry files are named `lh-<entry>-<hash>` and shared chunks `lh-chunk-<hash>`, so the entries share one copy of the engine core. Each entry specifier maps to the base plus its file name. [tools/build/shared.js:3-8; tools/build/shared.js:49; tools/build/shared.js:52-56] <!-- C-235 -->
- **B-195** `buildPack` builds each non-lion-hawk specifier that the game or the engine build imports as its own file named `<slug>-<hash>`. These specifiers are `three`, its subpaths and Rapier. [tools/build/shared.js:57-64] <!-- C-236 -->
- **B-196** Each such file re-exports the specifier, and for Rapier also its default export. Other shared specifiers stay bare. New external imports found in such a file join the list. [tools/build/shared.js:59-68] <!-- C-236 -->
- **B-197** If the game imports a lion-hawk specifier that is not an engine entry, `buildPack` throws `build: '<spec>' is not a lion-hawk browser entry (shared mode packs <entries>)`. [tools/build/shared.js:58] <!-- C-237 -->
- **B-198** `buildPack` creates the pack directory if it is missing. `buildPack` returns `imports` sorted by specifier and `files` sorted by name. [tools/build/shared.js:43; tools/build/shared.js:69] <!-- C-238 -->
- **B-199** File names in the pack carry a content hash, so a second game built later reuses the same files and adds none. [tools/build/shared.js:7-8; test/build-shared.test.mjs:53] <!-- C-239 -->
- **B-200** `addImportMap` inserts a `<script type="importmap">` tag with the imports on a new line after the `<head>` tag. If there is no `<head>`, the tag goes before the page. [tools/build/shared.js:72-76; test/build-shared.test.mjs:37] <!-- C-240 -->
- **B-201** `addImportMap` escapes `</` in the JSON as `<\/`. [tools/build/shared.js:74] <!-- C-240 -->
- **B-202** Tests pin that a shared-mode page boots in Chromium from the pack and that two games load the same engine URLs. A test also pins that the page holds no engine copy. [test/build-shared.test.mjs:37; test/build-shared.test.mjs:86] <!-- C-241 -->

### Build: web manifest
- **B-203** If `build.manifest` is set, its `name` must be a non-empty string, else `loadConfig` throws `config: 'build.manifest.name' must be a non-empty string`. [tools/bake/config.js:66-68; test/build-manifest.test.mjs:43] <!-- C-260 -->
- **B-204** The `display` value, if set, must be `fullscreen`, `standalone`, `minimal-ui` or `browser`. The values `shortName`, `themeColor`, `backgroundColor`, `icon` and `orientation`, if set, must be strings. [tools/bake/config.js:69-71; test/build-manifest.test.mjs:43] <!-- C-260 -->
- **B-205** If `build.manifest` is set and the PWA directory has `manifest.webmanifest`, `build` throws `build: pwa/manifest.webmanifest and build.manifest both make the manifest: keep one`. [tools/build/index.js:73-74; test/build-manifest.test.mjs:43] <!-- C-261 -->
- **B-206** If `build.manifest.icon` is set, `build` resolves it against the game directory and uses its file name in the web manifest. [tools/build/index.js:76-79] <!-- C-262 -->
- **B-207** If the icon does not exist, `build` throws `build: build.manifest.icon '<icon>' does not exist`. `build` copies the icon to the output root unless the PWA directory has a file of the same name. [tools/build/index.js:78; tools/build/index.js:80; test/build-manifest.test.mjs:43] <!-- C-262 -->
- **B-208** `build` writes `manifest.webmanifest` as JSON with a 2-space indent and a newline. `build` then links it from the page with `linkManifest`. [tools/build/index.js:82-83; test/build-manifest.test.mjs:20] <!-- C-263 -->
- **B-209** The web manifest and the icon are in the file list, so the precache and the content hash include them. [tools/build/index.js:88; tools/build/index.js:100-102; test/build-manifest.test.mjs:32] <!-- C-263 -->
- **B-210** `makeManifest` returns `name`, `short_name` (default `name`), `start_url` `./`, `scope` `./` and `display` (default `fullscreen`). [tools/build/page.js:22-23; test/build-manifest.test.mjs:32] <!-- C-264 -->
- **B-211** `makeManifest` adds `orientation`, `theme_color` and `background_color` only when set. With an icon it adds `icons` with `src`, `sizes` `any`, `type` from the extension and `purpose` `any`. [tools/build/page.js:24-31; test/build-manifest.test.mjs:20] <!-- C-264 -->
- **B-212** If the icon extension is not `.svg`, `.png`, `.webp`, `.jpg` or `.jpeg`, `makeManifest` throws `build: build.manifest.icon must be .svg, .png, .webp, .jpg, .jpeg (got '<name>')`. [tools/build/page.js:21; tools/build/page.js:28-29] <!-- C-265 -->
- **B-213** `linkManifest` adds `<link rel="manifest" href="manifest.webmanifest">` unless the page has a manifest link. `linkManifest` adds a theme-color meta when `themeColor` is set and the page has none. [tools/build/page.js:36-38; test/build-manifest.test.mjs:32] <!-- C-266 -->
- **B-214** The tags from `linkManifest` go on a new line after the `<head>` tag, or before the page if there is no `<head>`. [tools/build/page.js:39-40] <!-- C-266 -->

### Dedupe plugin
- **B-129** The dedupe plugin handles each bare import, that is a path that does not start with `.` or `/`. If the path is `three`, `@dimforge/rapier3d-compat`, or a subpath of them, the plugin resolves it again from the game root. [tools/dedupe.js:1-2; tools/dedupe.js:4; tools/dedupe.js:6-14; test/build.test.mjs:9] <!-- C-192 -->
- **B-130** For other paths, the plugin returns nothing, so esbuild resolves them. [tools/dedupe.js:6-12] <!-- C-192 -->
- **B-131** The plugin marks its own resolve calls with `pluginData` `lion-hawk-dedupe` and skips them, so it does not loop. If the resolve returns errors, the plugin returns them. [tools/dedupe.js:3; tools/dedupe.js:11-13] <!-- C-193 -->

### Dev server
- **B-132** `dev` loads game.config.js by path and loads the hooks. The hook context has `out` null, `e2e` true and `dev` true. [tools/dev/index.js:18-20] <!-- C-196 -->
- **B-133** Until the first build ends, the dev server serves `<!doctype html><p>lion-hawk dev: building…</p>` plus the reload script. [tools/dev/index.js:15; tools/dev/index.js:21] <!-- C-197 -->
- **B-134** `dev` creates an esbuild context on `build.entry` with bundling, ES module format, an inline sourcemap and no file output. The context has a `.json` loader, the dedupe plugin and an end-of-build plugin. `dev` then starts the watch. [tools/dev/index.js:30-41] <!-- C-198 -->
- **B-135** When a build ends with errors, `dev` logs `dev: build failed: <first error>` and keeps the old page. Otherwise `dev` stores the bundle, renders the page and logs `dev: rebuilt`. If the render throws, `dev` logs `dev: <message>`. [tools/dev/index.js:34-38] <!-- C-199 -->
- **B-136** `dev` renders the page by filling the template and running `hooks.beforePage` then `hooks.page`. `dev` adds the reload script before `</body>`, or at the end, and tells every connected client to reload. [tools/dev/index.js:22-29] <!-- C-200 -->
- **B-137** A template edit triggers a new render and a reload. [tools/dev/index.js:43; test/build-dev.test.mjs:39] <!-- C-201 -->
- **B-138** `dev` watches the model source directory only if `bake.materials` is set and the directory exists. `dev` reacts only to `.glb` and `.gltf` changes that carry a file name. [tools/dev/index.js:44-49] <!-- C-202 -->
- **B-139** `dev` waits 100 ms after the last source change and maps each changed file name to a model id. `dev` ignores files that map to no id. [tools/dev/index.js:46-56] <!-- C-203 -->
- **B-140** `dev` re-bakes only the mapped ids with `bake`, then reloads the clients. A test pins that a model edit re-bakes and reloads. [tools/dev/index.js:57; test/build-dev.test.mjs:18] <!-- C-203 -->
- **B-141** `dev` runs re-bakes one at a time through a promise chain, because two concurrent `bake` calls lose the update of one model. A re-bake error is logged as `dev: <message>`. [tools/dev/index.js:47; tools/dev/index.js:53-59] <!-- C-204 -->
- **B-142** The dev server answers `/lh-reload` with an event stream that starts with `: hi`. It answers `/` and `/index.html` with the page. [tools/dev/index.js:71-75] <!-- C-205 -->
- **B-143** The dev server answers `/assets/models/<file>` from `<bake.out>/models/<file>`. The server checks the `/assets/models/` prefix first. Any other path whose file name is `sw.js` gets 404. The server serves the rest from the `build.pwa` directory by file name. [tools/dev/index.js:76-78; test/build-dev.test.mjs:18] <!-- C-205 -->
- **B-144** If the request URL cannot be decoded, the dev server answers 400. If the file is missing or is not a file (for example a directory), the server answers 404 with no body. The server keeps running. [tools/dev/index.js:63-70; test/build-dev.test.mjs:46] <!-- C-206 -->
- **B-145** The dev server sends status 200 with a content type from the file extension and `cache-control` `no-store`. If the extension is unknown, the content type is `application/octet-stream`. [tools/dev/index.js:13-14; tools/dev/index.js:66; tools/dev/index.js:75] <!-- C-207 -->
- **B-146** For `/assets/models/` and PWA files, the dev server uses only the file name of the request path, so the server serves no subdirectory. [tools/dev/index.js:76; tools/dev/index.js:78] <!-- C-209 -->
- **B-147** `dev` listens on the given port and host. The returned `port` is the real port, so port 0 works. The URL uses `localhost` when the host is `0.0.0.0`. `dev` logs `dev: <id> at <url>`. [tools/dev/index.js:80-82] <!-- C-210 -->
- **B-148** `close()` stops the re-bake timer and the file watchers and ends the reload streams. `close()` also disposes the esbuild context and closes the server and its connections. [tools/dev/index.js:85-91] <!-- C-211 -->
- **B-149** `dev` serves no service worker and does not bake at start. The server serves the baked files that exist. [tools/dev/index.js:1-3; tools/dev/index.js:17-82; tools/dev/index.js:77; test/build-dev.test.mjs:18] <!-- C-212 -->

### Test command
- **B-215** `runTests` loads game.config.js if `game` is a string. The test directory is `test.dir` resolved against the game directory. `runTests` includes the directory only if it exists. [tools/test/index.js:22-25] <!-- C-267 -->
- **B-216** If `test.game` is set, `runTests` writes a generated engine-checks file to a temporary directory and includes it. [tools/test/index.js:26-27] <!-- C-267 -->
- **B-217** If there is no test directory and no `test.game`, `runTests` throws `test: nothing to run (no test/ directory and no test.game)`. The CLI then exits 1. [tools/test/index.js:28; test/cli-test-release.test.mjs:40] <!-- C-268 -->
- **B-218** The generated file always runs the checks `determinism` and `materials` on the game that `test.game` names. [tools/test/index.js:1-3; tools/test/index.js:13-19; test/cli-test-release.test.mjs:28] <!-- C-269 -->
- **B-219** The generated file adds `simPurity` over the `test.roots` paths only when `test.roots` is set. The file adds `zeroAlloc` only when `test.zeroAlloc` is true. [tools/test/index.js:20] <!-- C-269 -->
- **B-220** `runTests` spawns `node --test` in the game directory with the test directory and the generated file. `runTests` adds `--test-skip-pattern=@visual` unless `visual` is true. [tools/test/index.js:29; tools/test/index.js:33] <!-- C-270 -->
- **B-221** `runTests` sets `LH_VISUAL` to `1` with `visual` and to an empty string without it. `runTests` removes `NODE_TEST_CONTEXT` from the child environment. [tools/test/index.js:32] <!-- C-270 -->
- **B-222** `runTests` logs `test: <id> (with @visual)` or `test: <id> (@visual skipped)`. [tools/test/index.js:30] <!-- C-271 -->
- **B-223** `runTests` passes the child output through and resolves with the child exit code, or 1 if there is none. `runTests` removes the temporary directory. [tools/test/index.js:33-34] <!-- C-271 -->
- **B-224** Tests pin that `lion-hawk test` runs the game tests and the three engine checks. It skips `@visual` tests, runs them with `--visual`, and exits 1 for a failing test. [test/cli-test-release.test.mjs:28; test/cli-test-release.test.mjs:34] <!-- C-272 -->
- **B-225** If `test.roots` is set and is not an array of strings, `loadConfig` throws `config: 'test.roots' must be an array of paths`. [tools/bake/config.js:75] <!-- C-274 -->
- **B-226** If `test.game` is set and is not a string, `loadConfig` throws `config: 'test.game' must be a path`. [tools/bake/config.js:76] <!-- C-274 -->

### Release command
- **B-227** If `--bump` is not `patch`, `minor` or `major`, `release` throws a `UsageError`: `release: --bump must be patch, minor or major`. The CLI then exits 2. [tools/release/index.js:12; tools/release/index.js:20; test/cli-test-release.test.mjs:58] <!-- C-275 -->
- **B-228** If `git status --porcelain` in the game directory shows any change, `release` throws `release: the git tree is not clean (commit or stash first)`. The CLI then exits 1. [tools/release/index.js:21-22; test/cli-test-release.test.mjs:58] <!-- C-276 -->
- **B-229** `bumpVersion` raises the patch, minor or major part of an `x.y.z` version. A major bump gives `<a+1>.0.0`, and a minor bump gives `<a>.<b+1>.0`. [tools/release/index.js:13-17] <!-- C-277 -->
- **B-230** A `package.json` without a version counts as `0.0.0`. [tools/release/index.js:24] <!-- C-277 -->
- **B-231** If the `package.json` version is not `x.y.z`, `bumpVersion` throws `release: package.json version '<v>' is not x.y.z`. [tools/release/index.js:14] <!-- C-278 -->
- **B-232** `release` writes the new version into the `version` field of the game `package.json`. `release` logs `release: <old> → <new>`. [tools/release/index.js:25-28] <!-- C-279 -->
- **B-233** `release` then runs `bake`, which must return ok, else the step fails with `bake failed`. `release` then runs `build` with `game`, `out`, `env` and `log`. [tools/release/index.js:29-30] <!-- C-279 -->
- **B-234** `release` then runs `runTests`. A non-zero code gives `tests failed`. The test step runs without `--visual`. [tools/release/index.js:31] <!-- C-279 -->
- **B-235** If a step fails, `release` writes the old `package.json` text back. It throws `release: <step> failed; package.json is back at <old>, nothing committed (<message>)`. [tools/release/index.js:32-34; test/cli-test-release.test.mjs:58] <!-- C-280 -->
- **B-236** The thrown error has `usage` true when the cause is a `UsageError`, so the CLI then exits 2. [tools/release/index.js:34; tools/cli.js:44] <!-- C-280 -->
- **B-237** If all steps pass, `release` runs `git add -A` and `git commit` with the message `release: <id> <version>`. [tools/release/index.js:36-37; test/cli-test-release.test.mjs:48] <!-- C-281 -->
- **B-238** `release` then logs that push stays manual and returns 0. `release` never pushes. [tools/release/index.js:38-39; test/cli-test-release.test.mjs:48] <!-- C-281 -->

### Glyph script
- **B-150** The glyph script reads `<root>/<folder>/Vector/<file>.svg` for each role. The script removes `<defs/>` and whitespace between tags, and trims the text. [tools/glyphs/build.mjs:21-26] <!-- C-215 -->
- **B-151** The glyph script writes `ICONS` as JSON to `src/kits/glyphs/icons.js` with a generated-file header. It copies `License.txt` from the source to `src/kits/glyphs/LICENSE.txt` and logs `wrote <path> (<n> bytes)`. [tools/glyphs/build.mjs:28-33] <!-- C-216 -->

## Data and state
| Data | Content | Evidence |
| --- | --- | --- |
| Sidecar | `v` (1), `source` `{ file, sha256 }`, `parts`, `colliders`, `mass` `{ mass, com, inertia, frame }`, `sockets`, `bounds`, and `aero` only for a model with `aero` true. Mass numbers have 6 decimals. | [tools/bake/index.js:63-69] <!-- C-69 --> |
| Aero block | `{ panels: [{ part, a, n, c }], volume, centroid }` in body space | [tools/bake/aero.js:34; tools/bake/aero.js:38] <!-- C-256 C-258 --> |
| `phys.json` | `{ v: 1, engine, materials (registry hash), models }`. Compact JSON plus a newline. Model ids are sorted. | [tools/bake/write.js:8; tools/bake/write.js:32] <!-- C-160 --> |
| `manifest.json` | `{ v: 1, models }`. 2-space indent plus a newline. Model ids are sorted. | [tools/bake/write.js:8; tools/bake/write.js:33] <!-- C-160 --> |
| Manifest entry | `{ glb: 'models/<id>.glb', anim: 'models/<id>.anim.json' or null, bytes, sha256 of the GLB, options }` | [tools/bake/write.js:26] <!-- C-158 --> |
| Options hash | First 16 hex characters of a sha256 over a canonical string of the model options (without `file`), global `rename`, `palette`, `paint.base` and `optimise`, and `textures` only when set. | [tools/bake/index.js:25-27] <!-- C-74 --> |
| Canonical form | Object keys sorted, so key order in game.config.js does not change the hash. | [tools/bake/index.js:23] <!-- C-75 --> |
| Anim table | `{ v: 1, fps, parts, clips }`. Each clip is `{ dur (4 decimals), frames, data }`. `data` is base64 text of a `Float32Array` of frames × rows × 12 floats. | [tools/bake/animTable.js:39; tools/bake/animTable.js:45; tools/bake/animTable.js:53] <!-- C-133 C-139 --> |
| Anim row | 12 floats: the model-space column-major 4x4 matrix of the node without its last row. The matrix includes all parent nodes. | [tools/bake/animTable.js:2-3; tools/bake/animTable.js:28-33; tools/bake/animTable.js:49-51] <!-- C-138 --> |
| Collider shapes | `box`, `sphere`, `capsule`, `cylinder`, `hull`, `mesh` | [tools/bake/conventions.js:3] <!-- C-94 --> |
| Build hash | First 12 hex characters of a sha256 over the page HTML, each asset path and bytes, and each PWA file name and bytes except `sw.js`. The hash also covers each generated file name and bytes and, in shared mode, each pack file name. The hash changes when a baked model changes. | [tools/build/index.js:85-90; test/build-run.test.mjs:38; test/build-manifest.test.mjs:32] <!-- C-177 --> |
| `ENGINE_VERSION` | The `version` field of the engine `package.json`, read when the module loads, in `tools/bake/index.js` and `tools/build/index.js`. | [tools/bake/index.js:20; tools/build/index.js:24] <!-- C-76 --> |
| Game version | The `version` field of `package.json` in the game directory. It is `0.0.0` if the file or field is missing. | [tools/bake/config.js:53-54; test/bake-config.test.mjs:15] <!-- C-84 --> |
| Dev content types | `.html`, `.js`, `.json`, `.glb` (model/gltf-binary), `.svg`, `.png`, `.jpg`, `.webmanifest` (application/manifest+json), `.mp3` (audio/mpeg) | [tools/dev/index.js:13-14] <!-- C-208 --> |
| Glyph families | `xbox`, `ps`, `deck`, `generic`, `keys`, `pointer`, `touch`. Each maps to a Kenney folder and SVG names for the roles `confirm`, `back`, `menu`, `move`, `prev`, `next`. A family with no input for a role omits that role. | [tools/glyphs/build.mjs:4; tools/glyphs/build.mjs:8-16] <!-- C-214 --> |

The config loader `importFresh(file)` imports the module with a query `?v=<first 12 hex of the sha256 of the file content>`. A changed file then loads again in the same process. [tools/bake/config.js:9-10] <!-- C-90 -->

## Configuration

### CLI options
| Option | Command | Default | Evidence |
| --- | --- | --- | --- |
| `--game` | bake, build, dev, test, release | `'.'` | [tools/cli.js:18-23] <!-- C-8 C-9 C-10 C-222 C-223 --> |
| `--check` | bake | false | [tools/cli.js:18] <!-- C-8 --> |
| `--out` | build, release | none | [tools/cli.js:19; tools/cli.js:23] <!-- C-9 C-223 --> |
| `--mode` | build | `'single'` | [tools/cli.js:20] <!-- C-9 --> |
| `--e2e` | build | false | [tools/cli.js:20] <!-- C-9 --> |
| `--port` | dev | `'8740'` (a string, then parsed) | [tools/cli.js:21; tools/cli.js:38] <!-- C-10 C-13 --> |
| `--host` | dev | `'0.0.0.0'` | [tools/cli.js:21] <!-- C-10 --> |
| `--visual` | test | false | [tools/cli.js:22] <!-- C-222 --> |
| `--bump` | release | `'patch'` | [tools/cli.js:23] <!-- C-223 --> |

### game.config.js keys
The allowed keys are: [tools/bake/config.js:12-26] <!-- C-81 -->

| Section | Allowed keys |
| --- | --- |
| top level | `id`, `outEnv`, `bake`, `build`, `test` |
| `bake` | `src`, `out`, `materials`, `rename`, `palette`, `paint`, `models`, `optimise`, `textures` |
| `bake.textures` | `format`, `quality`, `resize`, `mode` |
| `bake.rename`, `bake.models.*.rename` | `materials`, `nodes` |
| `bake.paint` | `base` |
| `bake.optimise` | `meshopt`, `quantize`, `weld`, `prune`, `dedupe` |
| `bake.models.*` | `static`, `rename`, `keepTextures`, `animTable`, `sockets`, `file`, `colliders`, `aero` |
| `bake.models.*.animTable` | `fps`, `clips` |
| `build` | `entry`, `template`, `pwa`, `hooks`, `manifest`, `shared` |
| `build.shared` | `dir`, `base` |
| `build.manifest` | `name`, `shortName`, `themeColor`, `backgroundColor`, `icon`, `display`, `orientation` |
| `test` | `dir`, `game`, `roots`, `zeroAlloc` |

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `id` | none, required | Game id. A non-empty string. | [tools/bake/config.js:52] <!-- C-83 --> |
| `outEnv` | `null` | Name of the variable that holds the output directory. | [tools/bake/config.js:86; tools/build/out.js:8] <!-- C-88 C-188 --> |
| `bake.src` | `'assets/models'` | Directory of model sources. | [tools/bake/config.js:88] <!-- C-88 --> |
| `bake.out` | `'baked'` | Directory of baked output. | [tools/bake/config.js:88] <!-- C-88 --> |
| `bake.materials` | `null` | Module whose default export is the material registry. Required by `bake`. | [tools/bake/config.js:88; tools/bake/index.js:47] <!-- C-88 C-50 --> |
| `bake.palette` | `null` | `'vertex'` or absent. | [tools/bake/config.js:65; tools/bake/config.js:88] <!-- C-85 C-88 --> |
| `bake.paint.base` | `'steel'` | Base material for `paint-*` colliders. | [tools/bake/config.js:89] <!-- C-88 --> |
| `bake.rename` | empty maps | Global material and node renames. | [tools/bake/config.js:90] <!-- C-88 --> |
| `bake.optimise` | `meshopt`, `quantize`, `weld`, `prune`, `dedupe` all true | A partial block overrides only the keys it names. | [tools/bake/config.js:91; test/bake-config.test.mjs:40] <!-- C-89 --> |
| `bake.textures` | `null` | `{ format: 'webp' or 'ktx2', quality, resize, mode }`. A given block passes through unchanged. | [tools/bake/config.js:56-63; tools/bake/config.js:92] <!-- C-242 C-243 C-244 --> |
| `bake.models.<id>.static` | false | With no col-* nodes, one welded mesh collider per part. | [tools/bake/config.js:80] <!-- C-86 --> |
| `bake.models.<id>.keepTextures` | false | If true, the model skips the palette conversion and `prune` keeps all attributes. Without `bake.palette` set to `'vertex'`, textures stay either way. | [tools/bake/config.js:80; tools/bake/index.js:59; tools/bake/index.js:75] <!-- C-86 C-72 --> |
| `bake.models.<id>.sockets` | `[]` | Required socket names. | [tools/bake/config.js:80; tools/bake/conventions.js:66] <!-- C-86 C-105 --> |
| `bake.models.<id>.file` | `null` | Source file name in `bake.src`. | [tools/bake/config.js:80] <!-- C-86 C-46 --> |
| `bake.models.<id>.colliders` | true (false only when set to false) | If false, the model has no colliders. | [tools/bake/config.js:81; tools/bake/index.js:61] <!-- C-86 C-77 --> |
| `bake.models.<id>.animTable` | `null` | `true` gives `{ fps: 30, clips: null }`. An object gets `fps` default 30 and `clips` default null. | [tools/bake/config.js:79; test/bake-config.test.mjs:40] <!-- C-87 --> |
| `bake.models.<id>.rename` | empty maps | Per-model renames. These override the global renames. | [tools/bake/config.js:81; tools/bake/index.js:58] <!-- C-86 C-67 --> |
| `bake.models.<id>.aero` | absent (no aero block) | If true, the sidecar gets an aero block. The value must be true or false. | [tools/bake/config.js:82-83] <!-- C-254 --> |
| `build.entry` | `'src/main.js'` | Bundle entry file. | [tools/bake/config.js:95] <!-- C-89 --> |
| `build.template` | `'template.html'` | Page template with the `<!--APP-->` marker. | [tools/bake/config.js:95] <!-- C-89 --> |
| `build.pwa` | `'pwa'` | Directory of PWA files. | [tools/bake/config.js:95] <!-- C-89 --> |
| `build.hooks` | `null` | Module whose default export holds `beforePage` and `page` hooks. | [tools/bake/config.js:95; tools/build/index.js:55] <!-- C-89 C-167 --> |
| `build.manifest` | `null` | Settings for the generated web manifest. `name` is required. `display` defaults to `fullscreen`. | [tools/bake/config.js:66-72; tools/bake/config.js:95] <!-- C-89 C-260 --> |
| `build.shared.base` | `'../lion-hawk/<ENGINE_VERSION>/'` | URL prefix of the pack in shared mode, relative to the page by default. It must end with `/`. | [tools/build/index.js:52-53] <!-- C-226 C-227 --> |
| `build.out` | `'build'` | Output directory relative to the game directory, used when there is no `--out` and no `outEnv` variable. It must be a non-empty string. | [tools/bake/config.js:22; tools/bake/config.js:73; tools/build/out.js:8; test/bake-config.test.mjs:37] |
| `build.shared.dir` | none | Pack directory in shared mode, resolved against the game directory. | [tools/build/index.js:54] <!-- C-226 C-228 --> |
| `test.dir` | `'test'` | Directory of game tests, resolved against the game directory. | [tools/bake/config.js:96; tools/test/index.js:24] <!-- C-273 C-267 --> |
| `test.game` | `null` | Module whose default export is the game, for the engine checks. | [tools/bake/config.js:76; tools/bake/config.js:96] <!-- C-273 C-274 --> |
| `test.roots` | `null` | Paths for the `simPurity` check. | [tools/bake/config.js:75; tools/bake/config.js:96] <!-- C-273 C-274 --> |
| `test.zeroAlloc` | false | If true, the engine checks include `zeroAlloc`. | [tools/bake/config.js:96; tools/test/index.js:20] <!-- C-273 C-269 --> |

### Other settings
- The package is named `lion-hawk`, version 0.13.0, type `module`, and private. [package.json:2-3; package.json:5-6] <!-- C-22 -->
- The `npm test` script runs `node --test --test-concurrency=4 test/`. [package.json:36-38] <!-- C-25 -->
- The hook context for `build` is `{ config, game (directory), out, e2e, version (game version), engine, log }`. [tools/build/index.js:56] <!-- C-168 -->

## Errors and limits
| Condition | Result | Evidence |
| --- | --- | --- |
| Unknown or missing command | `lion-hawk: unknown command '<cmd>'` plus `USAGE`, exit 2 | [tools/cli.js:29] <!-- C-5 --> |
| Option parse failure | `lion-hawk <cmd>: <message>` plus `USAGE`, exit 2 | [tools/cli.js:31-32] <!-- C-6 --> |
| Bad `--port` | `lion-hawk dev: --port must be 0..65535 (got <value>)`, exit 2 | [tools/cli.js:38-39] <!-- C-13 --> |
| Any thrown error | `lion-hawk: <message>`, exit 2 for `UsageError` or an error with `usage` true, else exit 1 | [tools/cli.js:42-45] <!-- C-15 --> |
| `--mode` neither `single` nor `shared` | `UsageError`: `build: mode must be 'single' or 'shared' (got '<mode>')` | [tools/build/index.js:49] <!-- C-165 --> |
| `build.shared.base` without a final `/` in shared mode | `UsageError`: `build: build.shared.base must end with '/' (got '<base>')` | [tools/build/index.js:53] <!-- C-227 --> |
| Lion-hawk specifier that is not an engine entry | `build: '<spec>' is not a lion-hawk browser entry (shared mode packs <entries>)` | [tools/build/shared.js:58] <!-- C-237 --> |
| Template has no marker | `build: the template has no <!--APP--> marker` | [tools/build/page.js:4] <!-- C-184 --> |
| Marker right after a `<script>` tag | `build: <!--APP--> sits inside a <script>; remove that tag (the build writes <script type="module">)` | [tools/build/page.js:5; test/build-page.test.mjs:17] <!-- C-184 --> |
| `hooks.page` returns a non-string | `build: hooks.page must return the html string` | [tools/build/index.js:67-68] <!-- C-173 --> |
| GLB missing or sha256 differs from manifest | `build: <glb> does not match baked/manifest.json (run lion-hawk bake)` | [tools/build/index.js:41] <!-- C-175 --> |
| `sw.js` lacks `__PRECACHE__` | `build: pwa/sw.js has no __PRECACHE__ (const PRECACHE = __PRECACHE__;)` | [tools/build/page.js:15] <!-- C-187 --> |
| `sw.js` lacks `__VERSION__` | `build: pwa/sw.js has no __VERSION__` | [tools/build/page.js:16] <!-- C-187 --> |
| PWA directory holds `manifest.webmanifest` and `build.manifest` is set | `build: pwa/manifest.webmanifest and build.manifest both make the manifest: keep one` | [tools/build/index.js:74] <!-- C-261 --> |
| `build.manifest.icon` file missing | `build: build.manifest.icon '<icon>' does not exist` | [tools/build/index.js:78] <!-- C-262 --> |
| Icon extension not supported | `build: build.manifest.icon must be .svg, .png, .webp, .jpg, .jpeg (got '<name>')` | [tools/build/page.js:29] <!-- C-265 --> |
| `dedupe` without `root` | `dedupe: root required` | [tools/dedupe.js:5] <!-- C-194 --> |
| Missing `game.config.js` | `config: no game.config.js in <dir>` | [tools/bake/config.js:48; test/bake-config.test.mjs:32] <!-- C-78 --> |
| Default export not an object | `config: <file> has no default export object` | [tools/bake/config.js:50] <!-- C-79 --> |
| Unknown key | `config: unknown key '<path>'` | [tools/bake/config.js:33; test/bake-config.test.mjs:26] <!-- C-80 --> |
| Section not an object | `config: '<path>' must be an object` or `config: '<path>.<id>' must be an object`. `bake.models.*.animTable` may also be a boolean. | [tools/bake/config.js:35-42] <!-- C-82 --> |
| `id` not a non-empty string | `config: 'id' must be a non-empty string` | [tools/bake/config.js:52] <!-- C-83 --> |
| Bad `bake.palette` | `config: 'bake.palette' must be 'vertex' or absent (got <json>)` | [tools/bake/config.js:65] <!-- C-85 --> |
| Bad `bake.textures.format` or `quality` | `config: 'bake.textures.format' must be 'webp' or 'ktx2'` or `config: 'bake.textures.quality' must be an integer in 1..100` | [tools/bake/config.js:58-59; test/bake-textures.test.mjs:35] <!-- C-242 --> |
| Bad `bake.textures.mode` or `resize` | `config: 'bake.textures.mode' is for ktx2 only`, a mode error, or a resize error | [tools/bake/config.js:60-63] <!-- C-243 --> |
| `ktx2` format without `toktx` on `PATH` | `bake: textures.format 'ktx2' needs toktx (KTX-Software) on PATH: <url>` | [tools/bake/textures.js:21] <!-- C-247 --> |
| `toktx` fails on a texture | `bake: toktx failed on texture '<name or index>': <output>` | [tools/bake/textures.js:32] <!-- C-250 --> |
| Bad `bake.models.<id>.aero` | `config: 'bake.models.<id>.aero' must be true or false` | [tools/bake/config.js:83] <!-- C-254 --> |
| Bad `build.manifest` value | `config: 'build.manifest.name' must be a non-empty string`, a display error, or a string-type error | [tools/bake/config.js:68-71; test/build-manifest.test.mjs:43] <!-- C-260 --> |
| Bad `test.roots` or `test.game` | `config: 'test.roots' must be an array of paths` or `config: 'test.game' must be a path` | [tools/bake/config.js:75-76] <!-- C-274 --> |
| No tests and no `test.game` | `test: nothing to run (no test/ directory and no test.game)`, exit 1 | [tools/test/index.js:28] <!-- C-268 --> |
| Bad `--bump` | `UsageError`: `release: --bump must be patch, minor or major`, exit 2 | [tools/release/index.js:20] <!-- C-275 --> |
| Git tree not clean | `release: the git tree is not clean (commit or stash first)`, exit 1 | [tools/release/index.js:22] <!-- C-276 --> |
| `package.json` version not `x.y.z` | `release: package.json version '<v>' is not x.y.z` | [tools/release/index.js:14] <!-- C-278 --> |
| A release step fails | `release: <step> failed; package.json is back at <old>, nothing committed (<message>)`, exit 2 for a `UsageError` cause, else 1 | [tools/release/index.js:32-35] <!-- C-280 --> |
| Unknown model id given to `bake` | `bake: <id>: no such model in <bake.src>` | [tools/bake/index.js:83] <!-- C-44 --> |
| Source file missing | `bake: <id>: source <bake.src>/<file> not found` | [tools/bake/index.js:39] <!-- C-47 --> |
| Model configured with no source | `bake: <id>: configured in bake.models but no source in <bake.src>` | [tools/bake/index.js:42] <!-- C-48 --> |
| Palette texture not PNG | `bake: <model>: material '<name>' palette texture is <mime> (only PNG)` | [tools/bake/read.js:42] <!-- C-148 --> |
| Node convention failure | `bake: <model>: <problem>` | [tools/bake/conventions.js:11; test/bake-conventions.test.mjs:12] <!-- C-93 --> |
| Flat explicit col-hull, or hull with fewer than 4 points | `bake: <model>: <label> hull has fewer than 4 points` | [tools/bake/colliders.js:32-38; test/bake-colliders.test.mjs:45] <!-- C-118 --> |
| Every default hull group flat | `bake: <model>: <groups> hull has fewer than 4 points (add col-* nodes or set colliders: false)` | [tools/bake/colliders.js:95; test/bake-colliders.test.mjs:45] <!-- C-117 --> |
| Unknown collider shape in mass | `mass: unknown shape '<shape>'` | [tools/bake/mass.js:26] <!-- C-128 --> |
| Missing named clip | `bake: <model>: animation '<name>' missing (animTable.clips)` | [tools/bake/animTable.js:42; test/bake-anim.test.mjs:49] <!-- C-135 --> |
| CUBICSPLINE sampler | `bake: <model>: animation '<name>' uses CUBICSPLINE (animTable samples LINEAR and STEP only)` | [tools/bake/animTable.js:43; test/bake-anim.test.mjs:49] <!-- C-136 --> |
| Glyph script without a directory argument | usage text on the error stream, exit 1 | [tools/glyphs/build.mjs:18-19] <!-- C-217 --> |

Limits:
- A hull collider keeps at most 64 points. [tools/bake/colliders.js:32-38] <!-- C-119 -->
- The `--port` value must be an integer from 0 to 65535. [tools/cli.js:38-39] <!-- C-13 -->
- The dev server waits 100 ms after the last source change before it re-bakes. [tools/dev/index.js:51-60] <!-- C-203 -->
- The `bake.textures.quality` value must be an integer from 1 to 100. [tools/bake/config.js:59] <!-- C-242 -->

## Dependencies
- **Internal:** `lion-hawk/sim` re-exports [core](core.md), [defs-and-kits](defs-and-kits.md), [sim-world-physics](sim-world-physics.md) and [net-replication](net-replication.md). `lion-hawk/view` adds [view-input](view-input.md), [view-render](view-render.md) and [view-presentation](view-presentation.md). `lion-hawk/net` re-exports [net-replication](net-replication.md). [src/index.sim.js:2-27; src/index.view.js:2-31; src/index.net.js:2-5] <!-- C-29 C-30 C-31 C-32 C-33 C-221 C-34 C-35 C-36 C-37 C-38 -->
- **External, peer:** `@dimforge/rapier3d-compat` `^0.21.0`, `playwright-core` `^1.64.0` and `three` `^0.186.0`. The `peerDependenciesMeta` marks `playwright-core` as optional. [package.json:22-29] <!-- C-23 -->
- **External, runtime:** `@gltf-transform/core`, `@gltf-transform/extensions` and `@gltf-transform/functions` at 4.5.1, `esbuild` `^0.28.2`, `meshoptimizer` `~1.2.0`, `pngjs` `^7.0.0`, `sharp` `^0.35.5`. [package.json:40-48] <!-- C-24 -->
- **External, tool on PATH:** `toktx` from KTX-Software, needed only for `bake.textures.format` `'ktx2'`. [tools/bake/textures.js:21] <!-- C-247 -->

<!-- related-specs -->
Related specs:

- Imports: [Engine core](core.md)
- Imports: [Definitions and kits](defs-and-kits.md)
- Imports: [Simulation world and physics](sim-world-physics.md)
- Imports: [Networking and replication](net-replication.md)
- Imports: [View boot, input and seats](view-input.md)
- Imports: [Rendering and materials](view-render.md)
- Imports: [View sync, camera, assets and audio](view-presentation.md)
- Imported by: [Test helpers](testing.md)

## Operations
- The `dev` server logs `dev: <id> at <url>`, `dev: rebuilt`, `dev: build failed: <error>` and `dev: <message>`. [tools/dev/index.js:35-37; tools/dev/index.js:58; tools/dev/index.js:82] <!-- C-199 C-210 -->
- The `build` command logs one extra line in shared mode: `  shared <n> files in <packDir> at <base>`. [tools/build/index.js:111] <!-- C-231 -->
- The `release` command logs `release: <old> → <new>` and, on success, `release: committed 'release: <id> <version>' (push stays manual)`. [tools/release/index.js:28; tools/release/index.js:38] <!-- C-279 C-281 -->
- The glyph script regenerates `src/kits/glyphs/icons.js` from Kenney Input Prompts SVGs. The CLI does not run the glyph script. [tools/glyphs/build.mjs:1-3; tools/glyphs/build.mjs:28-31] <!-- C-213 -->

To regenerate the glyphs:
1. Run `node tools/glyphs/build.mjs "<Input Prompts dir>"`.
2. Check the log line `wrote <path> (<n> bytes)`. [tools/glyphs/build.mjs:33] <!-- C-213 C-216 -->

## Open questions and discrepancies
- Open question: why does the dev server listen on `0.0.0.0` by default, which exposes the server to the local network? No source states the reason.
- Open question: why does `bake --check` compare only the engine major.minor and not the patch? No source gives the reason.
- Open question: does a `col-hull` node under a scaled parent keep its scale? The code applies the full world matrix, but no test covers a scaled `col-hull`.
- Open question: does `lion-hawk dev` support shared mode? The dev server bundles with the single-mode plugins, and no source mentions shared mode for `dev`.
