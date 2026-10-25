---
id: F08
title: Test helpers
status: as-built
source_commit: 7e239df
paths:
  - testing/**
generated: STE spec writer
---

# Test helpers

## Summary
The `lion-hawk/test` export gives `node:test` suites a headless harness, whole-game checks, invariants, golden files, record and replay, and a multiplayer harness. The `lion-hawk/playwright` export gives browser tests device presets, a Chromium launcher, an in-page game driver, fake pads, a multi-page room and layout assertions. Games call these helpers from their own test suites. [package.json:13; package.json:16] <!-- C-1 -->

## Scope
- **In scope:** the files under `testing/`, which are the two exports and the helpers behind them.
- **Out of scope:** the engine API that the helpers call, see [core](core.md). The kinds, the memory hub and the port, see [net-replication](net-replication.md). Material registries and sidecars, see [defs-and-kits](defs-and-kits.md). The `lion-hawk test` command, see [tools-and-package](tools-and-package.md).

## Terms
See the [glossary](_meta/glossary.md). This spec uses the terms headless handle, invariant, checksum, golden file, tape, blackout, device preset, safe area, game driver and fake pads.

## Interfaces

### `lion-hawk/test` exports
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `lion-hawk/test` | out | package export that maps to `testing/index.js` | [package.json:13] <!-- C-1 --> |
| `scanSource`, `scanPurity`, `simRoots`, `stripComments` | out | functions from `purity.js` | [testing/index.js:2] <!-- C-2 --> |
| `canonical`, `checksum`, `diff`, `assertFinite` | out | functions from `state.js` | [testing/index.js:3] <!-- C-3 --> |
| `golden` | out | function from `golden.js` | [testing/index.js:4] <!-- C-3 --> |
| `headless`, `eventList` | out | functions from `headless.js` | [testing/index.js:5] <!-- C-4 --> |
| `replay`, `mp` | out | functions | [testing/index.js:6; testing/index.js:8] <!-- C-4 -->
| `invariants`, `checks` | out | objects | [testing/index.js:7; testing/index.js:9] <!-- C-4 --> |
| `policy` | out | re-export from `src/core/policy.js` | [testing/headless.js:5; testing/headless.js:8] <!-- C-80 --> |

### State and golden functions
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `canonical(value, { digits = 6, exact = false })` | out | JSON string of the normalised value | [testing/state.js:16] <!-- C-7 --> |
| `checksum(value, opts)` | out | 8 hex digits | [testing/state.js:17] <!-- C-14 --> |
| `diff(a, b, { tol = 0 })` | out | list of `{ path, a, b }` | [testing/state.js:19-27] <!-- C-15 --> |
| `assertFinite(value, label = 'value')` | out | returns nothing, throws on the first value that is not finite | [testing/state.js:30-43] <!-- C-21 --> |
| `golden(file, value, { digits = 6, exact = false, bless, ci })` | out | `{ written: true }` or `{ written: false }` | [testing/golden.js:8] <!-- C-24 --> |

### Checks
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `checks` | out | object with `determinism`, `simPurity`, `zeroAlloc`, `materials` | [testing/checks.js:99] <!-- C-49 --> |
| `checks.determinism(game, { seed = 1, steps = 600, input, scene, args })` | out | `{ ok, step, a, b }` | [testing/checks.js:22] <!-- C-53 --> |
| `checks.simPurity(game, { roots })` | out | `{ ok, found }` | [testing/checks.js:40-44] <!-- C-58 --> |
| `checks.zeroAlloc(game, { steps = 10000, warm = 600, seed = 1, scene, args, input, limit = 64 * 1024 })` | out | `{ ok, growth, steps }` | [testing/checks.js:67; testing/checks.js:79] <!-- C-61 --> |
| `checks.materials(game, { inline = [] })` | out | `{ ok, missing, hash }` | [testing/checks.js:85; testing/checks.js:96] <!-- C-72 --> |

### Headless handle
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `headless(game, { seed = 1, scene, args, invariants = [], record = false, wall0 = 0 })` | out | headless handle `h` | [testing/headless.js:20-21] <!-- C-78 --> |
| `h.engine`, `h.seed`, `h.scene`, `h.time` | out | properties. `scene` and `time` read the engine at each access | [testing/headless.js:45-46] <!-- C-79 --> |
| `eventList(arr)` | out | array plus `of`, `first`, `count`, `types`, `since` | [testing/headless.js:9-18] <!-- C-82 --> |
| `h.hold(p)`, `h.release(...names)` | in | forward to `engine.input` and return `h` | [testing/headless.js:50-51] <!-- C-92 --> |
| `h.tap(id)`, `h.press(id)`, `h.unpress(id)`, `h.fill(id, text)` | in | forward to `engine.ui`, return `h` | [testing/headless.js:76-78] <!-- C-104 --> |
| `h.enabled(id)`, `h.tryTap(id)` | in | return the `engine.ui` result | [testing/headless.js:79] <!-- C-105 --> |
| `h.go(n, a)`, `h.overlay(n, a, o)`, `h.close(n)`, `h.jump(s, p, o, a)` | in | transitions, return `h`. The `o` of `overlay` is `{ once }` | [testing/headless.js:81-84] <!-- C-107 --> |
| `h.state()`, `h.checksum()` | out | engine state, and its checksum | [testing/headless.js:85-86] <!-- C-108 --> |
| `h.world`, `h.get(id)` | out | the World, and an entity by id | [testing/headless.js:87; testing/headless.js:99] <!-- C-109 --> |
| `invariants.finite(select, label = 'state')` | out | invariant function | [testing/invariants.js:5-13] <!-- C-117 --> |
| `replay(game, tape, { invariants })` | out | headless handle after the replay | [testing/replay.js:5; testing/replay.js:53] <!-- C-123 --> |

### Multiplayer harness
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `mp(game, { peers = 2, link = {}, clock, record = false, seed = 1, argsOf, beforeStep, onWarn })` | out | room object `w` | [testing/mp.js:13; testing/mp.js:50] <!-- C-141 --> |
| `w.hub`, `w.peers`, `w.host`, `w.guests`, `w.now`, `w.live` | out | properties. `live` lists the peers that are not dropped | [testing/mp.js:50-52] <!-- C-148 --> |

### `lion-hawk/playwright` exports
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `lion-hawk/playwright` | out | package export that maps to `testing/playwright.js` | [package.json:16] <!-- C-1 --> |
| Exported names | out | `presets`, `launch`, `formatFailure`, `gameDriver`, `testUrl`, `openGame`, `bridgeEnd`, `peers`, and the five `expect*` functions | [testing/playwright.js:17; testing/playwright.js:37; testing/playwright.js:46; testing/playwright.js:54; testing/playwright.js:253; testing/playwright.js:264; testing/playwright.js:338; testing/playwright.js:352; testing/playwright.js:411-457] <!-- C-5 -->|
| `openGame(browser, url, { preset = 'desktop', seed, scene, args, query = {}, settings, render = 'auto', initScript, pads = 'fake' })` | out | game driver | [testing/playwright.js:264; testing/playwright.js:307] <!-- C-179 --> |
| `peers(browser, url, n, { link = {}, preset = 'desktop', seed = 1, args, argsOf, query = {}, timeout = 10000, render = 'manual', ...rest })` | out | room `{ hub, games, now, step, close }` | [testing/playwright.js:352; testing/playwright.js:392-403] <!-- C-231 --> |

### Game driver
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `game.page`, `game.preset`, `game.presetName` | out | properties | [testing/playwright.js:163-164] <!-- C-199 --> |
| `game.render()` | in | calls `engine.render(0)` | [testing/playwright.js:171] <!-- C-210 --> |
| `game.state()` | out | JSON copy of `engine.state()` | [testing/playwright.js:172] <!-- C-210 --> |
| `game.scene()` | out | `{ name, args, overlays }` | [testing/playwright.js:173] <!-- C-210 --> |
| `game.go(name, args)`, `game.jump(scene, preset, opts, args)` | in | engine calls in the page | [testing/playwright.js:174-175] <!-- C-211 --> |
| `game.command(type, data)` | in | issues the command, then renders | [testing/playwright.js:176] <!-- C-211 --> |
| `game.input.hold(p)`, `game.input.release(...names)` | in | engine input calls in the page | [testing/playwright.js:177-180] <!-- C-212 --> |
| `game.unplug(index)`, `game.haptics(index)` | in, out | unplug a fake pad, and read its `{ effects, calls }` or null | [testing/playwright.js:195-196; testing/playwright.js:304] <!-- C-217 --> |
| `game.errors()` | out | page errors, then copies of `engine.errors` | [testing/playwright.js:246] <!-- C-230 --> |
| `game.close()` | in | closes the browser context | [testing/playwright.js:247] <!-- C-230 --> |

## Behavior

### State comparison
- **B-1** `canonical` rounds each number to `digits` decimal places and adds 0, so -0 becomes 0. [testing/state.js:5] <!-- C-8 -->
- **B-2** `canonical` writes NaN, Infinity and -Infinity as the strings 'NaN', 'Infinity' and '-Infinity'. [testing/state.js:5; testing/state.js:8] <!-- C-9 -->
- **B-3** With `exact: true`, `canonical` keeps every bit of a number and still turns -0 into 0. [testing/state.js:7-8; testing/state.js:16; test/golden.test.mjs:55] <!-- C-10 -->
- **B-4** `canonical` turns a Map or a Set into an array of its normalised entries. A Map entry is a [key, value] pair. [testing/state.js:9-10] <!-- C-11 -->
- **B-5** `canonical` turns a typed array, except a DataView, into a plain array. [testing/state.js:6; testing/state.js:11; test/state.test.mjs:26] <!-- C-12 -->
- **B-6** `canonical` sorts the keys of an object and drops keys whose value is undefined. Other values pass unchanged. [testing/state.js:13-14; test/state.test.mjs:5] <!-- C-13 -->
- **B-7** `checksum` is the FNV hash of the canonical string, as 8 hex digits padded with leading zeros. [testing/state.js:17; test/state.test.mjs:11] <!-- C-14 -->
- **B-8** `diff` treats two numbers as equal when their distance is at most `tol`, or when Object.is says they are the same. [testing/state.js:22; test/state.test.mjs:17] <!-- C-16 -->
- **B-9** Two NaN values are equal in `diff`. [testing/state.js:22] <!-- C-16 -->
- **B-10** `diff` converts typed arrays to plain arrays before it compares them. [testing/state.js:20-21; test/state.test.mjs:26] <!-- C-17 -->
- **B-11** If one side is not an object, `diff` reports one entry when the two values are not strictly equal. The same rule applies when only one side is an array. [testing/state.js:23-24] <!-- C-18 -->
- **B-12** `diff` compares objects over the sorted union of their keys, and arrays over the indexes up to the longer length. A missing key compares as undefined. [testing/state.js:25-26; test/state.test.mjs:17] <!-- C-19 -->
- **B-13** `diff` writes paths as `a.b` for object keys and `a[0]` for array indexes. The root path is an empty string. [testing/state.js:19; testing/state.js:26] <!-- C-20 -->
- **B-14** `assertFinite` walks arrays, typed arrays, Maps, Sets and plain objects. It throws `<path> is not finite: <value>` at the first number that is not finite. [testing/state.js:30-43; test/state.test.mjs:22] <!-- C-21 -->
- **B-15** `assertFinite` visits each object once, so a cycle or a shared reference is safe. [testing/state.js:31; testing/state.js:34-35; test/state.test.mjs:33] <!-- C-22 -->
- **B-16** `assertFinite` checks the values of a Map and not its keys. A Map path is `<path>.<key>`. A Set or array path is `<path>[<index>]`. [testing/state.js:36-40] <!-- C-23 -->

### Golden files
- **B-17** `golden` accepts `file` as a path string or as a file URL. [testing/golden.js:9; test/golden.test.mjs:24] <!-- C-25 -->
- **B-18** If `bless` is true or the file is missing, `golden` creates the parent directories, writes the file and returns `{ written: true }`. [testing/golden.js:13-16; test/golden.test.mjs:11] <!-- C-27 -->
- **B-19** If the stored checksum equals the new checksum, `golden` returns `{ written: false }`. [testing/golden.js:20; test/golden.test.mjs:11] <!-- C-30 -->
- **B-20** If both the stored value and the new value have an array `trail`, the golden error adds `first divergence: trail[<k>]` before the diff lines. [testing/golden.js:22-28; test/golden.test.mjs:35] <!-- C-32 -->
- **B-21** A shorter `trail` diverges at its length. [test/golden.test.mjs:49] <!-- C-32 -->

### Purity scan
- **B-22** `scanSource` applies six rules by name: `three`, `view-import`, `window`, `document`, `wall-clock` and `math-random`. [testing/purity.js:6-13] <!-- C-33 -->
- **B-23** The `three` rule matches a static import, a side-effect import or a dynamic import of 'three' or of a 'three/' subpath. [testing/purity.js:7; test/purity.test.mjs:39] <!-- C-34 -->
- **B-24** The `view-import` rule matches only an import of the form `from '<path>'`, where the path has a `/view/` segment or ends in `/view.js`. A side-effect import or a dynamic `import()` does not match. [testing/purity.js:8] <!-- C-35 -->
- **B-25** The `window` rule matches `window.`, `globalThis.window` and `self.`. The `document` rule matches `document.` and `globalThis.document`. A word character, `$` or `.` before the name stops a match. [testing/purity.js:9-10; test/purity.test.mjs:46] <!-- C-36 -->
- **B-26** The `wall-clock` rule matches `Date.now(`, `performance.now(`, `new Date(` and a bare `Date(`. The `math-random` rule matches `Math.random(`. [testing/purity.js:11-12; test/purity.test.mjs:46] <!-- C-37 -->
- **B-27** With the option `rapier: true`, `scanSource` adds a `rapier` rule. The rule matches static, side-effect and dynamic imports of '@dimforge/...'. [testing/purity.js:14-15; testing/purity.js:38; test/purity-phase3.test.mjs:11] <!-- C-38 -->
- **B-28** The `rapier` rule is off by default, because the entry file of a game imports Rapier. [testing/purity.js:14; testing/purity.js:36] <!-- C-39 -->
- **B-29** `stripComments` removes line comments and replaces block comments with spaces. Every newline stays, so line numbers stay. [testing/purity.js:16-34; test/headless.test.mjs:99] <!-- C-40 -->
- **B-30** `stripComments` keeps the text of quoted strings (single, double and template). The function does not read comment openers inside them. [testing/purity.js:16-25; test/purity.test.mjs:33] <!-- C-41 -->
- **B-31** `scanSource(src, file, { rapier = false })` returns a list of `{ file, line, rule }` sorted by line. The list holds each line and rule once. [testing/purity.js:36-42; test/purity.test.mjs:8] <!-- C-42 -->
- **B-32** `scanSource` also scans the whole cleaned source for a dynamic import whose call spans lines. It reports the line where the match starts. [testing/purity.js:40-41; test/purity-phase3.test.mjs:11] <!-- C-43 -->
- **B-33** The multi-line scan covers 'three', and '@dimforge/' when `rapier` is true. [testing/purity.js:40-41] <!-- C-43 -->
- **B-34** `scanSource` ignores comments and look-alike names. [test/purity.test.mjs:22] <!-- C-44 -->
- **B-35** `scanPurity(paths, opts)` skips paths that do not exist, walks directories in sorted name order, and scans only files that end in `.js` or `.mjs`. [testing/purity.js:44-47] <!-- C-45 -->
- **B-36** `scanPurity` passes `opts` to `scanSource`. [testing/purity.js:45-46] <!-- C-45 -->
- **B-37** `simRoots(root)` returns `src/core`, `src/defs`, `src/sim` and `src/index.sim.js` under `root`. The list ends with the `sim.js` file of each kit directory that has one, in kit-name order. The argument `root` must end with '/', because `simRoots` joins paths as strings. [testing/purity.js:48-53] <!-- C-46 -->
- **B-38** The engine's own tests check that the engine sim roots and the kit sim halves pass the scan. The tests also check that no engine source imports Rapier. [test/purity.test.mjs:55; test/purity-phase3.test.mjs:25; test/purity-phase3.test.mjs:28; test/kits/purity.test.mjs:10-16] <!-- C-47 -->
- **B-39** A kit test checks that kit view halves use no `Math.random` and no `instanceof` on three.js objects. [test/kits/purity.test.mjs:24] <!-- C-48 -->

### Checks
- **B-40** The `input` option of `determinism` and `zeroAlloc` is a function of the step, a name in `game.policies`, or a constant input snapshot. A null `input` gives no input. [testing/checks.js:10-19] <!-- C-50 -->
- **B-41** When `input` is a function, the checks call it with the engine step counter, `h.engine.time.step`. [testing/checks.js:13; test/checks-determinism.test.mjs:31] <!-- C-51 -->
- **B-42** `determinism` runs the game headless twice, one run after the other. Each run records a checksum before the first step and after every step. [testing/checks.js:21-25; testing/checks.js:30; test/checks-determinism.test.mjs:19] <!-- C-54 -->
- **B-43** `determinism` wraps a policy once per run, so a stateful policy keeps one scratch object. The policy gets the step index of the run as its `i`. [testing/checks.js:26-30] <!-- C-55 -->
- **B-44** `determinism` disposes the World of each run when the run ends, even if the run throws. [testing/checks.js:30-31] <!-- C-56 -->
- **B-45** If a checksum differs, `determinism` returns `{ ok: false, step, a, b }` for the first differing index. [testing/checks.js:34-35; test/checks-determinism.test.mjs:24] <!-- C-57 -->
- **B-46** If all checksums agree, `determinism` returns `{ ok: true, step: -1, a, b }` with the final checksums. [testing/checks.js:36] <!-- C-57 -->
- **B-47** `checks.simPurity` returns `found` from `scanPurity(roots)`. The value `ok` is true when `found` is empty. [testing/checks.js:42-43; test/checks-determinism.test.mjs:45] <!-- C-58 -->
- **B-48** `checks.simPurity` does not read the `game` argument. The check scans with the default options, so it never applies the `rapier` rule. [testing/checks.js:40-43] <!-- C-60 -->
- **B-49** `zeroAlloc` uses `globalThis.gc` when it exists. Otherwise the function sets the V8 flag `--expose-gc` in the current process and takes `gc` from a new vm context. [testing/checks.js:46-52] <!-- C-62 -->
- **B-50** A settled heap reading calls `gc` up to 10 times. The reading stops when the used heap falls by less than 1024 bytes between two calls. [testing/checks.js:53-59] <!-- C-63 -->
- **B-51** `zeroAlloc` creates the engine with `createEngine` and not with `headless`. A policy gets a stand-in handle `{ engine, seed }` and a scratch object. [testing/checks.js:64-70] <!-- C-64 -->
- **B-52** The stand-in handle has no `h.find`, no `h.world` and no `h.time`. [testing/checks.js:64-66] <!-- C-64 -->
- **B-53** `zeroAlloc` resolves `input` before it creates the engine, so an unknown policy name leaks no World. [testing/checks.js:64-68; test/checks-alloc.test.mjs:39] <!-- C-65 -->
- **B-54** `zeroAlloc` runs `warm` steps and takes a settled reading. It runs half of `steps` (rounded down) and takes the reading `mid`. It runs the other steps and takes a final reading. [testing/checks.js:72-77] <!-- C-66 -->
- **B-55** `growth` is (final reading − `mid`) × 2. [testing/checks.js:78] <!-- C-66 -->
- **B-56** `zeroAlloc` returns `ok` when `growth` is less than `limit`. The verdict uses only the second half of the run. [testing/checks.js:60-63; testing/checks.js:79] <!-- C-67 -->
- **B-57** The verdict skips the first half because bounded engine state, such as the 256-entry event ring, keeps filling in a short window. [testing/checks.js:60-63] <!-- C-67 -->
- **B-58** Before each measured step, `zeroAlloc` calls the policy with the handle, the step index counted from the first warm step, and the scratch object. The result becomes the engine input. [testing/checks.js:70; test/checks-alloc.test.mjs:42] <!-- C-68 -->
- **B-59** `zeroAlloc` disposes the World when the run ends, even if the run throws. [testing/checks.js:71; testing/checks.js:80] <!-- C-70 -->
- **B-60** A test shows that `zeroAlloc` catches a system that keeps what it allocates. Another test shows that a scene with 30 crates retains under 64 KB. [test/checks-alloc.test.mjs:21; test/checks-alloc.test.mjs:30] <!-- C-71 -->
- **B-61** `materials` uses `game.defs.materials`, or an empty `defineMaterials({})` registry when the game has none. It uses `game.defs.models` as the sidecar data, or null. [testing/checks.js:86-87] <!-- C-73 -->
- **B-62** For each sidecar collider material that the registry lacks, `materials` adds `{ where: 'models.<location>', material }` to `missing`. The order is the sidecar order (model, then collider index). [testing/checks.js:88-93] <!-- C-74 -->
- **B-63** For each inline entry whose material the registry lacks, `materials` adds `{ where: 'inline[<i>]', material }` to `missing`. [testing/checks.js:94] <!-- C-75 -->
- **B-64** `hash` is `{ phys, registry, ok }`. The value `phys` is the registry hash stored in the sidecar data, or null. [testing/checks.js:95] <!-- C-76 -->
- **B-65** `hash.ok` is true when there is no sidecar data or the two registry hashes are equal. [testing/checks.js:95] <!-- C-76 -->
- **B-66** `materials` returns `ok` only when `missing` is empty and `hash.ok` is true. [testing/checks.js:96] <!-- C-77 -->

### Headless handle
- **B-67** The handle logs every event that the engine delivers, in an unbounded event list. The engine's own log is a ring. [testing/headless.js:26-27; test/headless.test.mjs:54] <!-- C-81 -->
- **B-68** `since(seq)` on an event list returns a new event list of the events whose `seq` is greater than the argument. [testing/headless.js:16] <!-- C-83 -->
- **B-69** The `input` argument of a handle step is a function `(h, i, scratch)`, a name in `game.policies`, a constant input snapshot, or null. [testing/headless.js:28-33] <!-- C-84 -->
- **B-70** The handle keeps one scratch object for each policy function. Every call of that policy gets the object as its third argument. [testing/headless.js:22-23; testing/headless.js:35; test/headless.test.mjs:93] <!-- C-86 -->
- **B-71** Each handle step sets the policy result as engine input and then runs `engine.stepN(1)`. [testing/headless.js:34-35] <!-- C-87 -->
- **B-72** When `record` is true, the handle stores `[step, checksum of engine state]` each time `engine.time.step` is a multiple of 60 after a handle step. [testing/headless.js:25; testing/headless.js:36] <!-- C-88 -->
- **B-73** After each handle step, if a World exists with more than 0 entities, the handle runs `worldFinite`. Then the handle calls each invariant with `h`. [testing/headless.js:37-38; test/headless.test.mjs:21] <!-- C-89 -->
- **B-74** `h.step(n = 1, input)` runs n handle steps and returns `h`. The index `i` of a policy counts from 0 at the start of each call. [testing/headless.js:47-48; test/headless.test.mjs:7] <!-- C-90 -->
- **B-75** `h.seconds(s, input)` runs `Math.round(s * hz)` steps. [testing/headless.js:49] <!-- C-91 -->
- **B-76** `h.until(pred, { maxSteps, maxSeconds = 10, input, message })` returns `{ steps, events }`. The list `events` holds the events logged since the call began. [testing/headless.js:52-55; test/headless.test.mjs:54] <!-- C-93 -->
- **B-77** `until` sets the step cap to `maxSteps`, or to `Math.round(maxSeconds * hz)`. It tests `pred(h)` before each step and once more after the last step. [testing/headless.js:53-57] <!-- C-94 -->
- **B-78** `h.untilEvent(match, opts)` runs `until` until an event with `seq` above the mark at the call matches. It returns that event. [testing/headless.js:61-65; test/headless.test.mjs:54] <!-- C-96 -->
- **B-79** `match` for `untilEvent` is a function or an event type string. [testing/headless.js:9; testing/headless.js:62] <!-- C-96 -->
- **B-80** `h.untilLoaded(opts)` records the current step when commands are pending, or -1 when none are. It waits until the step counter differs from that value and `engine.loading.active` is false. [testing/headless.js:66-71] <!-- C-98 -->
- **B-81** Commands that the stepped systems issue do not hold `untilLoaded`, because such commands keep `pending` above 0. [testing/headless.js:66-67] <!-- C-99 -->
- **B-82** `h.untilScene(name, opts)` waits until the scene name equals `name` or the overlay list includes `name`. [testing/headless.js:72] <!-- C-100 -->
- **B-83** `h.mark()` returns `engine.events.seq`. [testing/headless.js:73] <!-- C-101 -->
- **B-84** Reading `h.events` or calling `h.since(mark)` first calls `engine.flushEvents()`. An event emitted outside a step is visible at once. [testing/headless.js:74; test/headless.test.mjs:133] <!-- C-102 -->
- **B-85** A listener that flushes sees each event once, and the log holds one copy. [test/headless.test.mjs:139] <!-- C-102 -->
- **B-86** `h.debug` is `game.debug(engine)`, or an empty object when the game has none. The handle makes it once, on first read. [testing/headless.js:24; testing/headless.js:75; test/headless.test.mjs:127] <!-- C-103 -->
- **B-87** `h.find(name, where)` returns the entities whose tags have `name` or whose `net` equals `name`. A null `name` matches every entity. With no World the result is an empty list. [testing/headless.js:88-93] <!-- C-110 -->
- **B-88** `where` is a predicate or a partial object. A partial object matches when each of its keys is strictly equal on the entity. [testing/headless.js:42-43; testing/headless.js:88] <!-- C-111 -->
- **B-89** `h.spawn(desc)`, `h.despawn(e)` and `h.place(e, at, opts)` use the World. `despawn` and `place` return `h`. [testing/headless.js:100-102] <!-- C-113 -->
- **B-90** `h.tape()` returns `engine.tape()` plus `end` (the current step) and `sums` (a copy of the stored pairs). [testing/headless.js:103; test/replay.test.mjs:6] <!-- C-115 -->
- **B-91** If `h.command(type, data)` finds a handler, it calls `engine.command` and returns `h`. [testing/headless.js:80] <!-- C-106 -->

### Invariants
- **B-92** After each step, the invariant from `invariants.finite` runs `assertFinite` on `select(h)`. [testing/invariants.js:5-13; test/headless.test.mjs:116] <!-- C-117 -->
- **B-93** `worldFinite` checks every entity that has a pose slot. For each slot it checks 14 pool floats, the current half first and then the previous half. [testing/invariants.js:16-20; testing/invariants.js:24-26] <!-- C-120 -->
- **B-94** `worldFinite` also checks the x, y and z parts of `linvel()` and `angvel()` of each entity that has a body. [testing/invariants.js:27-34] <!-- C-121 -->

### Replay
- **B-95** `replay` starts a headless handle from the tape seed, scene and args, from `invariants`, and from the tape `wall0` (0 when the tape has none). [testing/replay.js:9; test/replay.test.mjs:71] <!-- C-127 -->
- **B-96** The replay end step is `tape.end`, or the step of the last `log` entry, or 0. [testing/replay.js:11] <!-- C-128 -->
- **B-97** Before each step k, `replay` issues the ops of the log entry for step k in order. The ops are `tap`, `fill`, `press`, `release`, `command`, `go`, `overlay`, `close` and `jump`. [testing/replay.js:13-27; testing/replay.js:33-35] <!-- C-129 -->
- **B-98** `replay` passes a deep JSON copy of recorded command data to the engine, so the tape stays unchanged. [testing/replay.js:21; test/replay.test.mjs:36] <!-- C-130 -->
- **B-99** `replay` issues a recorded command even when the original run dropped it. [testing/replay.js:21] <!-- C-130 -->
- **B-100** `replay` reads a null args or opts value of the tape as undefined. [testing/replay.js:12; testing/replay.js:22-25] <!-- C-131 -->
- **B-101** Before every replayed step, `replay` sets the recorded input values so far on the engine input. The call sets the values and does not hold them, so nothing stays held after the replay. [testing/replay.js:29-30; testing/replay.js:36; testing/replay.js:40; test/replay.test.mjs:30] <!-- C-133 -->
- **B-102** `replay` merges the per-seat input of a log entry into the values of that seat. Before each step it sets those values on the controller of the seat. [testing/replay.js:31-32; testing/replay.js:37; testing/replay.js:41-46] <!-- C-134 -->
- **B-103** A seat that had a controller earlier in the replay and has none now is skipped. [testing/replay.js:31; testing/replay.js:42-44] <!-- C-135 -->
- **B-104** After the last step, `replay` issues the ops recorded at the end step. The call merges the end-step input into its local values but does not set that input on the engine. [testing/replay.js:52; test/replay.test.mjs:30] <!-- C-138 -->
- **B-105** Commands that the sim issues are not recorded. Recorded data must be plain JSON, checked at issue. [test/replay.test.mjs:24; test/replay.test.mjs:42] <!-- C-139 -->
- **B-106** A tape keeps `wall0`, and the replay starts from it. [test/replay.test.mjs:71] <!-- C-140 -->

### Multiplayer harness
- **B-107** `mp` creates one memory hub with an rng forked from `seed` under the name 'mp.link'. The `link` options are spread after it, so `link.rng` replaces it. [testing/mp.js:16; test/mp.test.mjs:29] <!-- C-143 -->
- **B-108** The port clock is `clock`, or `hub.now` when no `clock` is given. The wall clock of each engine is the hub clock. [testing/mp.js:17; test/mp.test.mjs:5] <!-- C-144 -->
- **B-109** Peer 0 is the host and has the name 'host'. Peer i above 0 is a guest with the name 'guest<i>'. The default peer key is `[i + 1, 0, 0, 0]`. [testing/mp.js:27-30; testing/mp.js:113] <!-- C-145 -->
- **B-110** Each peer has a headless handle with the room seed and `argsOf(index, name)` as args. The host gets `hub.host()` and a guest gets `hub.join()`. Each peer also gets a port from `createPort`. [testing/mp.js:21-26] <!-- C-146 -->
- **B-111** A peer is `{ index, name, key, h, engine, net, port, dropped }`. When `onWarn` is given, it receives `(peer, kind, e)` for the port warnings. [testing/mp.js:22-25; testing/mp.js:28] <!-- C-147 -->
- **B-112** `w.addPeer({ wall0 = hub.now, key })` adds a peer whose engine starts with that `wall0`. The virtual wall of a late peer can be one ulp off the hub clock. [testing/mp.js:19; testing/mp.js:27-30] <!-- C-149 -->
- **B-113** `w.step(n = 1, inputs)` repeats one room step n times and returns `w`. `w.seconds(s, inputs)` runs `Math.round(s * hz)` steps. [testing/mp.js:53-54] <!-- C-150 -->
- **B-114** A room step increments a counter k and ticks the hub to `k * 1000 / hz`. Then it steps each peer in list order through its handle. [testing/mp.js:40-47; test/mp.test.mjs:5] <!-- C-151 -->
- **B-115** A room step skips dropped peers. For each other peer it calls `beforeStep(peer, i)` before it sets the input. [testing/mp.js:43] <!-- C-152 -->
- **B-116** `inputs` is a function `(peer, i) => snapshot` or an array indexed by peer. A null snapshot leaves the input of that peer as it is. [testing/mp.js:44-45; test/mp.test.mjs:29] <!-- C-153 -->
- **B-117** If a snapshot has at least one key and every key is a digit string, `mp` treats the snapshot as per seat. Key s is the seat number. [testing/mp.js:32] <!-- C-154 -->
- **B-190** Any other snapshot is the input of seat 0. An empty object `{}` is therefore the input of seat 0. [testing/mp.js:31-34] <!-- C-154 -->
- **B-118** For each seat key of a per-seat snapshot, `mp` looks for the controller of that seat, even when the value is null. If none exists, `mp` throws 'mp: <peer name> has no seat <s>'. `mp` sets the input only when the value is non-null. [testing/mp.js:35-38] <!-- C-155 -->
- **B-119** `w.settle(agree, { maxSeconds = 3 })` calls `agree(w)`. While the result is a non-empty list, `settle` runs one room step with no input, for at most `Math.round(maxSeconds * hz)` steps. [testing/mp.js:56-60; test/mp.test.mjs:13] <!-- C-156 -->
- **B-120** `settle` returns the list that is left. [testing/mp.js:56-60] <!-- C-156 -->
- **B-121** `w.drop(peer)` marks the peer dropped, closes its port and calls `hub.leave(id, 'dropped')`. The argument `peer` is an index or a peer object. [testing/mp.js:49; testing/mp.js:62-65; test/mp.test.mjs:13] <!-- C-157 -->
- **B-122** `w.seat(peer, op, seat)` issues the command `lh.seat` with `{ op, seat }` on the engine of that peer. A recording tape records it like any command. [testing/mp.js:66] <!-- C-159 -->
- **B-123** `w.rejoin(peer, { wall0 = hub.now })` gives a dropped guest a new engine, a new transport and a new port, with the same key. [testing/mp.js:20-26; testing/mp.js:67-73] <!-- C-160 -->
- **B-124** `w.blackout(seconds, { kinds })` wraps `hub.drop`. While `hub.now` is below the call time plus `seconds * 1000`, the wrapper drops replica frames at send. JSON messages pass. [testing/mp.js:74-85; test/mp.test.mjs:13] <!-- C-162 -->
- **B-125** With `kinds`, a blackout drops only the frames that hold a group of one of those kinds. Without `kinds`, it drops every replica frame. Other messages go to the previous `hub.drop`. [testing/mp.js:76-83] <!-- C-163 -->
- **B-126** The hub decides a drop at send time, so messages already on the wire when a blackout starts still arrive. [testing/mp.js:74; test/mp.test.mjs:18] <!-- C-164 -->
- **B-127** `w.diverged({ agree })` returns a list of differences. For each kind in `agree` and each live peer, it takes the entities of that kind that the peer has authority over. [testing/mp.js:86-98] <!-- C-167 -->
- **B-128** A peer has authority over a host kind entity when the net role of the peer is 'host'. For an owner kind, the peer has authority when the net id of the entity is in `net.locals`. A replica is never the source. [testing/mp.js:97-98] <!-- C-168 -->
- **B-129** For each other live peer, `diverged` finds the same kind and net id. A missing entity gives `{ kind, netId, peer, missing: true }`. [testing/mp.js:99-102] <!-- C-169 -->
- **B-130** If both entities have a pose, `diverged` reports `{ kind, netId, peer, d }` when the distance `d` is not at most the tolerance in metres. If either has no pose, `diverged` checks only presence. [testing/mp.js:103-105] <!-- C-170 -->
- **B-131** A test shows that `mp({ record: true })` gives each peer a tape that replays alone. [test/mp.test.mjs:23] <!-- C-171 -->

### Presets and launch
- **B-132** `launch({ headless = true })` finds Chromium and starts it with the args `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`. It returns `{ browser, executablePath, close }`. [testing/playwright.js:37-42] <!-- C-176 -->
- **B-133** The browser search first uses the path from `playwright-core` when that file exists. Then it looks in `~/.cache/ms-playwright` for `chromium-<number>` folders, newest number first, and for a `chrome-linux*/chrome` file in each. [testing/playwright.js:25-35] <!-- C-177 -->
- **B-134** `preset` is a name in `presets` or a preset object. A preset object gets the name 'custom'. [testing/playwright.js:309] <!-- C-181 -->
- **B-135** `openGame` creates a new browser context from the preset without `safeArea`, with `serviceWorkers: 'block'`, and opens one page. [testing/playwright.js:311-313] <!-- C-182 -->
- **B-136** `openGame` records each page error as `{ type: 'pageerror', message }`. [testing/playwright.js:314-315] <!-- C-183 -->
- **B-137** `openGame` works in this order. It adds the fake pads init script when `pads` is 'fake'. It adds `initScript` on the context. It runs `prepare(context, page)`. It adds the `settings` init script. It goes to the URL. [testing/playwright.js:316-321] <!-- C-184 -->
- **B-138** `initScript` is a function or `{ content }`. It runs on the context, so popups and new tabs get it too. [testing/playwright.js:263; testing/playwright.js:317; test/playwright.test.mjs:109] <!-- C-185 -->
- **B-139** `settings` writes each key to localStorage before the page scripts run. A string value is stored as it is and any other value as JSON. A storage error is ignored. [testing/playwright.js:319] <!-- C-186 -->
- **B-140** After navigation, `openGame` sets the CSS variable `--lh-sa-<side>` in px on the root element for each side of the preset safe area. [testing/playwright.js:322] <!-- C-187 -->
- **B-141** Then `openGame` waits up to 30000 ms for `window.engine`, awaits `engine.ready`, and waits up to 30000 ms for `engine.settled()`. [testing/playwright.js:323-325] <!-- C-188 -->
- **B-142** `testUrl` sets the `lh-test` parameter to empty, or to 'render' when `render` is 'manual'. It adds `seed`, `scene`, `args` (as JSON) and each `query` entry. [testing/playwright.js:253-259; test/playwright.test.mjs:76] <!-- C-189 -->
- **B-143** `testUrl` writes the empty `lh-test` parameter without an equals sign, as `?lh-test`. [testing/playwright.js:260] <!-- C-190 -->

### Fake pads
- **B-144** With fake pads, `navigator.getGamepads()` returns no pad until `game.pad` plugs one in. It returns a new array at each call. [testing/playwright.js:266-267; testing/playwright.js:305] <!-- C-191 -->
- **B-145** Plugging a pad into an empty slot fires `gamepadconnected`. Updating a plugged pad fires no event. [testing/playwright.js:296; testing/playwright.js:302] <!-- C-194 -->
- **B-146** Unplugging a pad empties its slot, trims empty trailing slots and fires `gamepaddisconnected` with `connected: false`. Unplugging an empty slot does nothing. [testing/playwright.js:285-290] <!-- C-195 -->
- **B-147** Each fake pad has a `vibrationActuator` with the effects 'dual-rumble' and 'trigger-rumble' by default. A state `effects` array replaces the list, and `effects: null` gives the pad no actuator. [testing/playwright.js:271-276; testing/playwright.js:299; testing/playwright.js:301] <!-- C-196 -->
- **B-148** The actuator records `playEffect` and `reset` calls. `playEffect` resolves 'complete' for a listed effect and rejects with a NotSupportedError DOMException for any other effect. `reset` resolves 'complete'. [testing/playwright.js:277-282] <!-- C-197 -->
- **B-149** The actuator and its call log stay with a pad index until a pad with another id plugs in there. [testing/playwright.js:266-268; testing/playwright.js:297] <!-- C-198 -->
- **B-150** `game.pad(index, state)` plugs or updates the fake pad `index`. `game.pad(state)` is pad 0. `game.pad(null)` and `game.pad(index, null)` unplug. [testing/playwright.js:181-194; test/playwright.test.mjs:123] <!-- C-214 -->
- **B-151** A bare `game.pad()` or `game.pad(undefined)` unplugs pad 0. [testing/playwright.js:188; test/playwright.test.mjs:134] <!-- C-215 -->
- **B-152** A device reads a pad change on the next frame, so a test calls `game.frames()` before it steps. [testing/playwright.js:185-186] <!-- C-218 -->
- **B-153** `game.frames(n = 2)` waits n animation frames in the page. [testing/playwright.js:197] <!-- C-213 -->

### Driving the page
- **B-154** `game.step(n, input)` steps n times in the page and returns the step counter. [testing/playwright.js:96-107; testing/playwright.js:166] <!-- C-200 -->
- **B-155** `game.seconds(s, input, timeout)` advances s seconds in chunks of at most one step and returns the step counter. A negative `s` counts as 0. [testing/playwright.js:130-141; testing/playwright.js:167] <!-- C-200 -->
- **B-156** The `input` argument of `step`, `seconds`, `until` and `untilEvent` is held for the stretch and released at its end, even on failure. [testing/playwright.js:77-78; testing/playwright.js:88; testing/playwright.js:100-101; testing/playwright.js:134-135] <!-- C-201 -->
- **B-157** `game.until(fn, opts)` serialises `fn` with `toString` and runs it in the page as `fn(engine.state(), engine)`. The function must not use outside variables. It returns the number of steps taken. [testing/playwright.js:44; testing/playwright.js:57; testing/playwright.js:80-83; testing/playwright.js:168; test/playwright.test.mjs:28] <!-- C-202 -->
- **B-158** `game.untilEvent(type, opts)` steps until an event of that type appears that is newer than the last event at the call. It returns the number of steps taken. [testing/playwright.js:81-83; testing/playwright.js:169] <!-- C-203 -->
- **B-159** The page loop of `until` and `untilEvent` tests before each step and once after the last step. It renders with `engine.render(0)` when it returns. [testing/playwright.js:82-86] <!-- C-204 -->
- **B-160** The page loops stop and return to Node when `engine.loading.phase` is 'settle' and blocks are pending. Node polls the page every 20 ms until the blocks clear. Then the loop continues. [testing/playwright.js:59-69; testing/playwright.js:70] <!-- C-206 -->
- **B-161** `game.untilLoaded({ maxSteps = 1200, timeout = 30000 })` first takes the step that delivers commands pending at the call (-1 when none are pending). Then it steps until `engine.loading.active` is false and returns the number of steps. [testing/playwright.js:108-125] <!-- C-208 -->
- **B-162** `game.tap(testid)` finds `[data-testid="<testid>"]`. On a touch preset it waits for the element to be visible. Then it sends a CDP touchStart (id 0) and a touchEnd at the centre. On desktop it uses `click()`. [testing/playwright.js:198-205] <!-- C-219 -->
- **B-163** After a tap, the driver waits two animation frames and renders. [testing/playwright.js:206-207] <!-- C-220 -->
- **B-164** `game.fill(testid, text)` fills the element, presses Enter and renders. [testing/playwright.js:209-213; test/playwright.test.mjs:45] <!-- C-221 -->
- **B-165** `game.press(testid)` holds a control down. On a touch preset it starts a CDP touch with the lowest free id from 90 and keeps the active touches down. On desktop it moves the mouse and presses it. Then it renders. [testing/playwright.js:214-225; test/playwright.test.mjs:56; test/playwright.test.mjs:65] <!-- C-222 -->
- **B-166** `game.unpress(testid)` lifts the touch that `press` started, or releases the mouse on desktop. Then it renders. [testing/playwright.js:226-230] <!-- C-223 -->
- **B-167** `game.touch.start(id, target)` and `game.touch.move(id, target)` put or move a CDP touch point. Each call sends all active touch points. `move` also renders. [testing/playwright.js:231-233] <!-- C-224 -->
- **B-168** `game.touch.end(...ids)` waits 150 ms if any listed id is active. Then it lifts those touches. The wait avoids a Chromium fling that swallows the next tap. The call renders at its end. [testing/playwright.js:234-244] <!-- C-225 -->
- **B-169** `game.point(target)` returns client `{ x, y }`. A string target is a selector, and the point is the centre of its first match. [testing/playwright.js:143-148; test/playwright.test.mjs:90] <!-- C-226 -->
- **B-170** A target with `world` uses `engine.view.project`. Any other object gives its own x and y. [testing/playwright.js:149-155; test/playwright.test.mjs:90] <!-- C-226 -->
- **B-171** If `project` returns `onScreen: false`, `point` throws. A `project` without `onScreen` counts as on screen. [testing/playwright.js:152; test/playwright.test.mjs:101] <!-- C-228 -->
- **B-172** The driver opens one CDP session on the first touch. It sends `Input.dispatchTouchEvent` with touch points of radius 8 and force 1. [testing/playwright.js:157-160] <!-- C-229 -->

### Room of pages
- **B-173** Page 0 of `peers` is the host and the other pages are guests. Each page opens through `openGame` with the query `lh-bridge=host` or `lh-bridge=guest`, args from `argsOf(i, name)` or `args`, and the other options in `rest`. [testing/playwright.js:369-383] <!-- C-234 -->
- **B-174** `peers` makes the hub with an rng forked from `seed` under the name 'peers.link'. The `link` options are spread after it. [testing/playwright.js:354] <!-- C-233 -->
- **B-175** `peers` defaults to `render: 'manual'`, because pages that render every frame starve the second SwiftShader page. [testing/playwright.js:329-330; testing/playwright.js:352; docs/field-notes.md:731-735] <!-- C-235 -->
- **B-176** `peers` forwards the hub events `peer`, `peerLeft`, `peerAway`, `peerBack`, `hostAway`, `hostBack` and `closed`, and the hub messages, to an inbox of the page. A binary message goes as an array of bytes. [testing/playwright.js:335; testing/playwright.js:373-374] <!-- C-236 -->
- **B-177** Before the page loads, `peers` exposes the binding `__lhBridge` and adds an init script. The script sets `__lhBridgeInfo` to `{ isHost, id, hostId, sent: 0 }` and creates a queue for early events until `bridgeTransport()` takes over. [testing/playwright.js:375-381] <!-- C-237 -->
- **B-178** `bridgeEnd(net)` applies the bridge calls of a page to its hub transport in sequence order. A later call waits for the earlier ones. Calls after `closed` are dropped. [testing/playwright.js:336-351] <!-- C-238 -->
- **B-179** A bridge call 'leave' calls `net.leave()`. Any other call sends the data to the target, with byte arrays rebuilt as ArrayBuffers. [testing/playwright.js:344-346] <!-- C-239 -->
- **B-180** `room.step(count = 1)` repeats this count times. It advances a counter k and ticks the hub to `k * 1000 / hz`. For each open page it delivers the inbox in one evaluate, steps the page once and waits for the bridge calls of the page. [testing/playwright.js:391-400; testing/playwright.js:356-368] <!-- C-240 -->
- **B-181** Closing a page driver makes its transport leave the hub with the reason 'left', once, and closes the page. `room.close()` closes every page. [testing/playwright.js:384-385; testing/playwright.js:401] <!-- C-242 -->
- **B-182** If a page fails to open, `peers` closes the pages already open and rethrows the error. [testing/playwright.js:387-390] <!-- C-243 -->

### Assertions
- **B-183** `expectScene(game, name)` and `expectState(game, path, value)` throw an AssertionError on a mismatch. `expectState` reads the dotted `path` in `game.state()` and compares by JSON text. [testing/playwright.js:407-418; test/playwright.test.mjs:37] <!-- C-245 -->
- **B-184** A layout target is a string, `{ testid }`, `{ css }` or a Playwright locator (an object with `evaluate`). For `expectTappable` a string is a test id. For the other two functions a string is a CSS selector. [testing/playwright.js:420-421; testing/playwright.js:430-436; test/playwright.test.mjs:80] <!-- C-247 -->
- **B-185** The in-page measurer gives the box of an element. The element is visible if display is not 'none', visibility is not 'hidden', width and height are above 0, and opacity is above 0. [testing/playwright.js:422-428] <!-- C-249 -->
- **B-186** The measurer reports a hit when `elementFromPoint` at the centre of the box is the element or one of its children. [testing/playwright.js:426-427] <!-- C-250 -->
- **B-187** A box is inside the safe area when it lies within the viewport minus the safe-area insets, both from the preset. The tolerance is 0.5 px. [testing/playwright.js:438-441] <!-- C-251 -->
- **B-188** `expectTappable(game, target, { min = 44 })` checks in this order: found, visible, inside the safe area, width and height each at least `min`, and not covered at the centre. It throws at the first failure. [testing/playwright.js:449-456] <!-- C-253 -->
- **B-189** `expectNoOverlap(game, a, b)` throws when the two boxes overlap. Boxes that only touch at an edge do not overlap. [testing/playwright.js:457-461] <!-- C-255 -->

## Data and state

### Preset data
| Preset | Viewport (px) | Device scale factor | Touch | Safe area top, right, bottom, left (px) | Evidence |
| --- | --- | --- | --- | --- | --- |
| `iPhone SE` | 667 x 375 | 2 | yes | 0, 0, 0, 0 | [testing/playwright.js:18; testing/playwright.js:12] <!-- C-174 C-175 --> |
| `iPhone 15 Pro landscape` | 852 x 393 | 3 | yes | 0, 59, 21, 59 | [testing/playwright.js:19; testing/playwright.js:11] <!-- C-174 C-175 --> |
| `iPhone 15 Pro portrait` | 393 x 852 | 3 | yes | 59, 0, 34, 0 | [testing/playwright.js:20; testing/playwright.js:11] <!-- C-174 C-175 --> |
| `iPad Pro 11 landscape` | 1194 x 834 | 2 | yes | 24, 0, 20, 0 | [testing/playwright.js:21; testing/playwright.js:12] <!-- C-174 C-175 --> |
| `desktop` | 1280 x 720 | 1 | no | 0, 0, 0, 0 | [testing/playwright.js:22] <!-- C-174 C-175 --> |

`presets` is a frozen object with these 5 device presets. [testing/playwright.js:17-23; test/playwright.test.mjs:5] <!-- C-172 -->
Each preset has viewport, `deviceScaleFactor`, `isMobile`, `hasTouch`, `safeArea` and, except `desktop`, a `userAgent`. [testing/playwright.js:18-22] <!-- C-173 -->

### Tape and golden data
- A golden file is JSON with one-space indentation and a final newline. It holds `{ checksum, value }`, and `{ checksum, exact: true, value }` when `exact` is true. [testing/golden.js:15] <!-- C-28 -->
- A fake pad has 17 buttons and at least 4 axes. The names a, b, x, y, lb, rb, lt, rt, select, start, ls, rs, up, down, left and right map to indexes 0 to 15. A true state key gives a pressed, touched button with value 1. [testing/playwright.js:270; testing/playwright.js:293-295] <!-- C-192 -->
- A fake pad has the default id `Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)`, the default mapping 'standard', and a timestamp from `performance.now()`. [testing/playwright.js:271; testing/playwright.js:296; testing/playwright.js:301] <!-- C-193 -->

## Configuration
| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `LH_BLESS` environment variable | unset | The value '1' makes `golden` write the file. | [testing/golden.js:8] <!-- C-24 C-27 --> |
| `CI` environment variable | unset | A set value makes `golden` throw on a missing file unless `bless` is true. | [testing/golden.js:8; testing/golden.js:12] <!-- C-24 C-26 --> |
| `determinism` `steps` | 600 | Number of steps in each run. | [testing/checks.js:22] <!-- C-53 --> |
| `zeroAlloc` `steps`, `warm`, `limit` | 10000, 600, 65536 bytes | Measured steps, warm-up steps and the growth limit. | [testing/checks.js:67] <!-- C-61 --> |
| `until` `maxSeconds` | 10 | Step cap in seconds when `maxSteps` is absent. | [testing/headless.js:52-53] <!-- C-94 -->|
| `mp` `peers` | 2 | Number of peers. | [testing/mp.js:13] <!-- C-141 --> |
| `settle` `maxSeconds` | 3 | Maximum time that `settle` steps. | [testing/mp.js:56] <!-- C-156 --> |
| Game driver `maxSteps`, `timeout` | 1200, 30000 ms | Step cap and real-time block limit of `until`, `untilEvent` and `untilLoaded`. | [testing/playwright.js:73; testing/playwright.js:110] <!-- C-204 C-207 C-208 --> |
| `peers` `timeout` | 10000 ms | Wait for the bridge calls of a page. | [testing/playwright.js:352; testing/playwright.js:361-368] <!-- C-241 --> |
| `expectTappable` `min` | 44 px | Minimum width and height. | [testing/playwright.js:449] <!-- C-253 --> |
| `openGame` `pads` | 'fake' | The value 'host' keeps the controllers of the test machine. | [testing/playwright.js:307-308; testing/playwright.js:316] <!-- C-179 C-180 --> |
| `launch` `headless` | true | Starts Chromium without a window. | [testing/playwright.js:37] <!-- C-176 --> |

## Errors and limits
| Condition | What the caller sees | Evidence |
| --- | --- | --- |
| `golden` with `ci`, a missing file and no `bless` | Error 'golden <path> is missing. Run locally (or with LH_BLESS=1) to create it, then commit it.' | [testing/golden.js:12; test/golden.test.mjs:28] <!-- C-26 --> |
| `golden` with a different `exact` mode | Error 'golden <path>: stored exact=<stored>, called with exact=<called>' | [testing/golden.js:19; test/golden.test.mjs:55] <!-- C-29 --> |
| `golden` with a changed value | Error 'golden <path> changed (<old> → <new>)' with at most 10 diff lines `  <path>: <old> → <new>` and 'Re-run with LH_BLESS=1 to accept.' | [testing/golden.js:21; testing/golden.js:29; test/golden.test.mjs:17] <!-- C-31 --> |
| Unknown string `input` in `checks` | Error "checks: no policy '<name>'" | [testing/checks.js:14-15; test/checks-alloc.test.mjs:39] <!-- C-52 --> |
| `checks.simPurity` without a non-empty `roots` array | Error 'checks.simPurity: pass { roots: [dirs or files] }' | [testing/checks.js:41] <!-- C-59 --> |
| Unknown string `input` in `headless` | Error "headless: no policy '<name>'". Names on the prototype chain do not count. | [testing/headless.js:31; test/headless.test.mjs:46] <!-- C-85 --> |
| `until` reaches its cap | Error '<message or "until: condition not met"> after <cap> steps (seed <seed>, step <step>, scene <name>)' and then the last 20 logged events, one per line as `  @<step> <type> <json>` | [testing/headless.js:40; testing/headless.js:58-59; test/headless.test.mjs:16] <!-- C-95 --> |
| `untilEvent` reaches its cap | The `until` error with the message 'untilEvent(<type>)' or 'untilEvent(fn)'. A `message` in `opts` replaces it. | [testing/headless.js:63] <!-- C-97 --> |
| `h.command` for a type with no handler | Error "headless: no handler for command '<type>'" | [testing/headless.js:80] <!-- C-106 --> |
| `h.one` finds a count other than 1 | Error 'headless: one(<json name>) found <n> entities (seed <seed>, step <step>)' | [testing/headless.js:94-98] <!-- C-112 --> |
| `spawn`, `despawn` or `place` with no World | Error 'headless: no World (no main scene)' | [testing/headless.js:41; testing/headless.js:100-102] <!-- C-114 --> |
| `h.tape()` on a handle that does not record | Error 'headless: not recording' | [testing/headless.js:103] <!-- C-116 --> |
| `invariants.finite` with a `select` that is not a function | Error 'invariants.finite: select must be a function' | [testing/invariants.js:7] <!-- C-118 --> |
| An `invariants.finite` violation | Error 'finite: <path message> (seed <seed>, step <step>)' | [testing/invariants.js:10-11; test/headless.test.mjs:116] <!-- C-119 --> |
| `worldFinite` finds a value that is not finite | Error 'finite: entity <id> (<tags, comma separated>) <field> is <value> (seed <seed>, step <step>)' | [testing/invariants.js:21; testing/invariants.js:26] <!-- C-122 --> |
| `replay` with a tape that is not version 1 | Error 'replay: unknown tape version' | [testing/replay.js:6] <!-- C-124 --> |
| `replay` with a tape for another game | Error "replay: tape is for '<game>'" | [testing/replay.js:7] <!-- C-125 --> |
| `replay` with another `hz` | Error 'replay: tape hz differs (tape <hz>, game <hz>)' | [testing/replay.js:8; test/replay.test.mjs:52] <!-- C-126 --> |
| `replay` with no `ui.press` or `ui.release` function | Error 'replay: this engine has no ui.<op>' | [testing/replay.js:17-19] <!-- C-132 --> |
| `replay` with an unknown op | Error "replay: unknown op '<op>'" | [testing/replay.js:26] <!-- C-132 --> |
| `replay` with a seat that has input and never had a controller | Error 'replay: seat <s> has input but no controller at step <k>' | [testing/replay.js:45] <!-- C-136 --> |
| `replay` with a checksum that differs | Error 'replay: checksum differs at step <k+1> (tape <want>, replay <got>)' | [testing/replay.js:49-50; test/replay.test.mjs:17] <!-- C-137 --> |
| `mp` with a game that has no `net` config | Error 'mp: the game has no net config (defineGame({ net }))' | [testing/mp.js:14] <!-- C-142 --> |
| `mp` with a `peers` value that is not an integer of at least 1 | Error 'mp: peers must be a positive integer' | [testing/mp.js:15] <!-- C-142 --> |
| `mp` per-seat snapshot for a seat with no controller | Error 'mp: <peer name> has no seat <s>' | [testing/mp.js:36] <!-- C-155 --> |
| `w.drop` for a dropped peer | Error 'mp: <name> is already dropped' | [testing/mp.js:63] <!-- C-158 --> |
| An unknown peer index or object | Error 'mp: no such peer' | [testing/mp.js:49] <!-- C-158 --> |
| `w.rejoin` for the host | Error 'mp: the host cannot rejoin (its room closed)' | [testing/mp.js:70] <!-- C-161 --> |
| `w.rejoin` for a peer that is not dropped | Error 'mp: <name> is not dropped (drop it first)' | [testing/mp.js:71] <!-- C-161 --> |
| `blackout` or `diverged` with an unknown kind | Error "mp: blackout: unknown kind '<name>'", or the same text with 'diverged' | [testing/mp.js:18; testing/mp.js:76; testing/mp.js:92] <!-- C-165 --> |
| `w.diverged` with `agree` that is not an object | Error 'mp: diverged needs { agree: { kind: metres } }' | [testing/mp.js:89] <!-- C-166 --> |
| `launch` finds no Chromium | Error 'playwright: no chromium found (run npx playwright-core install chromium)' | [testing/playwright.js:39] <!-- C-178 --> |
| `openGame` with a `pads` value other than 'fake' or 'host' | Error "playwright: pads must be 'fake' or 'host'" | [testing/playwright.js:308] <!-- C-180 --> |
| `openGame` with an unknown preset name | Error "playwright: unknown preset '<name>' (known: <names>)" | [testing/playwright.js:310] <!-- C-180 --> |
| A pad index that is not an integer in 0..15 | Error 'playwright: pad index must be an integer in 0..15 (got <json>)'. `pad('1')`, `pad(true)`, `pad(NaN)` and `pad(undefined, state)` throw it. | [testing/playwright.js:51-52; testing/playwright.js:189-193; test/playwright.test.mjs:134] <!-- C-216 --> |
| `until` or `untilEvent` reaches its cap | Error '<what>: condition not met after <maxSteps> steps (step <n>, scene <name>[ + <overlays>])' and 'last events:' with the last 8 events as JSON, or '  (none)' | [testing/playwright.js:46-48; testing/playwright.js:87; testing/playwright.js:91; test/playwright.test.mjs:18] <!-- C-205 --> |
| `untilLoaded` reaches its cap | The text of `formatFailure('untilLoaded', ...)` | [testing/playwright.js:120; testing/playwright.js:123] <!-- C-209 --> |
| Blocks last longer than `timeout` | Error '<what>: load still blocked by <labels> after <timeout> ms' | [testing/playwright.js:66; testing/playwright.js:73; testing/playwright.js:96; testing/playwright.js:130] <!-- C-207 --> |
| `point` for an element with no box | Error "touch: '<selector>' has no box" | [testing/playwright.js:146] <!-- C-227 --> |
| `point` with `world` and no `view.project` | Error 'touch: { world } needs engine.view.project (not provided by this game)' | [testing/playwright.js:151] <!-- C-227 --> |
| `point` with `world` off screen | Error 'touch: { world } point is off-screen or behind the camera (<json>)' | [testing/playwright.js:152; test/playwright.test.mjs:101] <!-- C-228 --> |
| `peers` with an `n` that is not an integer of at least 1 | Error 'peers: n must be a positive integer' | [testing/playwright.js:353] <!-- C-232 --> |
| A page does not deliver its bridge calls in `timeout` ms | Error 'peers: page <i> made <sent> bridge calls, only <next> arrived in <timeout> ms' | [testing/playwright.js:361-368] <!-- C-241 --> |
| A page of `peers` reloads or navigates | The bridge of that page stalls, because `info.sent` restarts at 0 and the Node counter does not | [testing/playwright.js:334; docs/field-notes.md:681-684] <!-- C-244 --> |
| `expectScene` mismatch | AssertionError "expectScene: expected '<name>', got '<actual>'" | [testing/playwright.js:413] <!-- C-246 --> |
| `expectState` mismatch | AssertionError 'expectState: <path> is <actual>, expected <expected>' | [testing/playwright.js:417] <!-- C-246 --> |
| A layout target of another type | TypeError 'expect*: a target is a string, { testid }, { css } or a locator' | [testing/playwright.js:435] <!-- C-248 --> |
| `expectFitsSafeArea` fails | AssertionError "expectFitsSafeArea: '<name>' not found", or "... (<w>x<h> at <x>,<y>) leaves the safe area <json>" | [testing/playwright.js:444-448] <!-- C-252 --> |
| `expectTappable` fails | AssertionError "expectTappable: '<name>' not found", "is not visible", "(<dims>) leaves the safe area <json>", "is <dims>, needs at least <min>x<min>" or "is covered at its centre (elementFromPoint is another element)" | [testing/playwright.js:451-455] <!-- C-254 --> |
| `expectNoOverlap` fails | AssertionError "expectNoOverlap: '<name>' not found" for the first missing target, or "'<a>' (<dims>) overlaps '<b>' (<dims>)" | [testing/playwright.js:459-460] <!-- C-256 --> |

Limit: `zeroAlloc` cannot see ArrayBuffer backing stores or Rapier WASM memory, because the function reads V8 `used_heap_size`. [testing/checks.js:63-64; docs/field-notes.md:839-843] <!-- C-69 -->

## Dependencies
- **Internal:** [core](core.md) gives `createEngine`, which the headless handle, `zeroAlloc` and `replay` call. [testing/headless.js:3; testing/checks.js:4] <!-- C-257 -->
- **Internal:** [net-replication](net-replication.md) gives the memory hub, `createPort` and the replica registry to `mp`. `peers` uses the memory hub. [testing/mp.js:9-11; testing/playwright.js:8] <!-- C-257 -->
- **Internal:** [defs-and-kits](defs-and-kits.md) gives `defineMaterials` and `materialRefs` to `checks.materials`. The `rng` and `fnv` helpers come from `src/core/rng.js`. [testing/checks.js:6-7; testing/mp.js:10; testing/state.js:3] <!-- C-258 -->
- **Internal:** `peers` needs a game that binds its port to `bridgeTransport()` when the page URL has `?lh-bridge`. See [net-replication](net-replication.md). [testing/playwright.js:329-331; docs/spec.md:604] <!-- C-259 -->
- **External:** `testing/playwright.js` imports `playwright-core`. The file `package.json` lists `playwright-core` ^1.64.0 only under `devDependencies`. [testing/playwright.js:7; package.json:26-31] <!-- C-6 -->

<!-- related-specs -->
Related specs:

- Imports: [Engine core](core.md)
- Imports: [Definitions and kits](defs-and-kits.md)
- Imports: [Networking and replication](net-replication.md)
- Imports: [CLI, tools and package surface](tools-and-package.md)

## Operations
The game driver needs the page to expose `window.engine` with these members: `ready`, `settled`, `stepN`, `advance`, `render`, `state`, `events`, `input`, `loading`, `commands`, `errors` and `view.project`. (inferred) [testing/playwright.js:64; testing/playwright.js:76-87; testing/playwright.js:323-325] <!-- C-260 -->

## Open questions and discrepancies
- **Presets.** The spec lists iPhone SE, iPhone 15 Pro and Pro Max, iPad Mini, iPad Pro 11 and desktop, with SwiftShader and channel 'chromium'. The code has 5 presets, no iPad Mini, no Pro Max, and passes SwiftShader through launch args. [docs/spec.md:585-590; testing/playwright.js:17-23; testing/playwright.js:40]
- **Headless options.** The spec names `clock: 'virtual'` and `record: 'on-fail'`. The code takes `record` as a boolean and `wall0`, and has no `clock` option. [docs/spec.md:540; testing/headless.js:20]
- **Missing helpers.** The spec names expectEvents, fixtures, `h.use`, `h.snapshot`, `h.restore`, `h.fork`, `h.spy` and `h.expectWarning`. The code under `testing/` has none of them. [docs/spec.md:551; docs/spec.md:562-564; testing/headless.js:44-104; testing/index.js:1-9]
- **Sim purity.** The spec says `checks.simPurity(game)` imports the sim entry under a guard and throws. The code takes `{ roots }`, scans source text and returns `{ ok, found }` without a throw on a hit. [docs/spec.md:578; testing/checks.js:40-44]
- **Zero allocation.** The spec says `zeroAlloc` compares heap use before and after under `--expose-gc`. The code enables the flag in the process and judges only the second half of the run. [docs/spec.md:579; testing/checks.js:46-81]
- **Driver methods.** The spec names the driver methods query, shot, control and `touch.drag`, and the matchers `toBeInScene` and others. The driver has none of them. [docs/spec.md:595-602; testing/playwright.js:163-248]
- **Tap argument.** The spec says `tap(label)`. The driver `tap` takes a test id. [docs/spec.md:599; testing/playwright.js:198-199]
- **Added peers.** A comment in `mp.js` says that peers added by `beforeStep` wait for the next step. The loop re-reads `list.length` on each pass, so a peer added in a pass is stepped in the same room step. [testing/mp.js:42; testing/mp.js:40-47]
- **Package dependency.** `testing/playwright.js` imports `playwright-core`. The file `package.json` lists it only under `devDependencies`. [testing/playwright.js:7; package.json:22-31]
- **Policy guard.** `headless` calls `Object.hasOwn(game.policies, ...)` with no guard. `checks.js` uses `game.policies ?? {}`. [testing/headless.js:31; testing/checks.js:15]
- **Research proposal.** The research doc proposes `replay.run(file)`, fuzz, a flow DSL, the policies still, const, seq, fn and rate, and `toMatchGolden`. The code under `testing/` has none of them. `policy.every` exists in `src/core/policy.js`. [docs/research-testing.md:125-157; testing/index.js:1-9]
- **End-step input in replay.** `replay` merges the input of the end step into its local values after the loop, so the engine never receives it. The code may not intend this. No source says. [testing/replay.js:33-38; testing/replay.js:52]
- **Open question.** Does `defineGame` always set `game.policies`? `headless` throws a TypeError for a named policy if the value is undefined. No source states it.
- **Open question.** Why is `playwright-core` only a development dependency? No source states the reason.
- **Open question.** Which engine tests check `peers()` against a real game? The test file `test/playwright.test.mjs` uses fakes, and no other test of this feature is listed.

## Evidence index
- `testing/index.js`: the exports of `lion-hawk/test`.
- `testing/headless.js`: the headless handle and event lists.
- `testing/checks.js`: determinism, simPurity, zeroAlloc and materials.
- `testing/state.js`: canonical state, checksum, diff and finite checks.
- `testing/golden.js`: golden files.
- `testing/purity.js`: the static purity scan.
- `testing/replay.js`: tape replay.
- `testing/invariants.js`: invariants and the World finite check.
- `testing/mp.js`: the multiplayer harness.
- `testing/playwright.js`: presets, launch, the game driver, fake pads, `peers` and layout assertions.
