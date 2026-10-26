---
id: F02
title: Definitions and kits
status: as-built
source_commit: cb8b3d3
paths:
  - src/defs/**
  - src/kits/**
generated: STE spec writer
---

# Definitions and kits

## Summary
This feature holds the plain-data definitions and the kits. The definitions are the material registry, the physics sidecar schema, and the net field and kind builders. The kits are vehicle, terrain, coverage, fx and glyphs. Sim halves import no three.js. View halves import three.js or the DOM.

The vehicle kit has two backends, raycast and tire. The vehicle kit also holds a powertrain and an engine sound with a synth.

## Scope
- **In scope:** `src/defs/materials.js`, `src/defs/materials.base.js`, `src/defs/sidecar.js`, `src/defs/fields.js`, and the kits under `src/kits/`. The vehicle kit includes `powertrain.js`, `engineDsp.js` and `view.js`.
- **Out of scope:** the World, the engine, the replication code that packs fields, the bake, `checks.materials`, the material compiler, view sync, and the audio service. The audio service holds `createDsp`, `audio.voice` and `audio.onUnlock`. Other specs cover them.

## Terms
See the [glossary](_meta/glossary.md). The spec uses these glossary terms: material, material registry, base library, material pair, registry hash, sidecar and phys.json. The spec also uses kit, heightfield, coverage, glyph role, glyph family, kind and sim-pure.

The glossary lacks these terms. The terms are specific to the engine sound.
- **powertrain:** the kit-vehicle sim object from `createPowertrain`. The powertrain holds an engine and gearbox. `step()` returns the drive torque for the driven wheels. [src/kits/vehicle/powertrain.js:1-5]
- **parameter frame:** the plain object of numbers that `createEngineSound` sends to the synth each frame. The object is not a browser animation frame. [src/kits/vehicle/view.js:1-4]
- **listening position:** the `mic` option of the engine sound, which is `behind`, `bay` or `cabin`. The position picks a built-in balance and a mix. [src/kits/vehicle/view.js:8]
- **engine preset:** a frozen layout in `ENGINE_PRESETS` with firing angles, banks, header delays and engine numbers. [src/kits/vehicle/powertrain.js:13]
- **launching:** a clutch state in the powertrain. The clutch launches when the wheel rpm through the gear ratio is below the idle rpm. The word is not a start of the engine. [src/kits/vehicle/powertrain.js:90]
- **synth:** the `EngineDSP` instance that `createDsp` runs in an AudioWorklet or a ScriptProcessor. [src/kits/vehicle/engineDsp.js:1-4]

## Interfaces

### Definitions

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `defineMaterials(entries = {}, options = {})` | in, returns a material registry | entries by id, `options.pairs` | [src/defs/materials.js:115-118] <!-- C-401 --> |
| `PHYS_DEFAULTS`, `MAX_MATERIALS`, `canonicalJson` | out | constants and function | [src/defs/materials.js:7-8; src/defs/materials.js:91] <!-- C-402 --> |
| Registry members `ids`, `hash`, `get`, `has`, `index`, `byIndex`, `density`, `collider`, `pair` | out | frozen object | [src/defs/materials.js:207-217] <!-- C-403 --> |
| `BASE_MATERIALS` | out | frozen object of 18 entries | [src/defs/materials.base.js:7] <!-- C-404 --> |
| `SIDECAR_VERSION`, `SHAPES`, `MAX_HULL_POINTS`, `validateCollider`, `validateSidecar`, `validatePhys`, `materialRefs` | out | functions and constants | [src/defs/sidecar.js:5-7; src/defs/sidecar.js:30; src/defs/sidecar.js:75; src/defs/sidecar.js:140; src/defs/sidecar.js:153] <!-- C-405 --> |
| `F`, `kind`, `REMOTES`, `FOLLOWS`, `TUNE`, `SEND`, `INPUT_BATCH`, `INPUT_WIRE_MAX` | out | field builders and constants | [src/defs/fields.js:6; src/defs/fields.js:31-38] <!-- C-406 --> |

### Kits

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `coverageKit(host, { materialAt, washes, washTime, layer })`, `COVERAGE_SYSTEM` (`lh.kit.coverage`), `coverageLayer` | in, returns `{ off }` | sim half | [src/kits/coverage/sim.js:7-12; src/kits/coverage/sim.js:55] <!-- C-407 --> |
| `coverageView(sync, compiler, { match })`. The default `match` is `e => e.coverage != null`. | in, returns `{ off, size }` | view half | [src/kits/coverage/view.js:6; src/kits/coverage/view.js:38-41] <!-- C-408 --> |
| `createParticles(opts)` | in, returns `{ emit, update, mesh, color, dispose, live }` | view half | [src/kits/fx/view.js:12; src/kits/fx/view.js:81] <!-- C-409 --> |
| `createMarks(opts)` | in, returns `{ add, update, mesh, dispose }` | view half | [src/kits/fx/view.js:86; src/kits/fx/view.js:120] <!-- C-410 --> |
| `GLYPH_ROLES` (confirm, back, menu, move, prev, next), `GLYPH_FAMILIES`, `glyphFor`, `familyFor`, `bindGlyphs` | out | view half | [src/kits/glyphs/view.js:7-8; src/kits/glyphs/view.js:13; src/kits/glyphs/view.js:19; src/kits/glyphs/view.js:24] <!-- C-411 --> |
| `createTerrain(world, opts)` | in, returns a frozen terrain object | sim half | [src/kits/terrain/sim.js:9; src/kits/terrain/sim.js:51-73] <!-- C-412 --> |
| `createTerrainMesh(terrain, opts)`, `chunkIndex(n, m)` | in, returns `{ group, update, dispose, stats }` | view half | [src/kits/terrain/view.js:10; src/kits/terrain/view.js:30; src/kits/terrain/view.js:143] <!-- C-413 --> |
| `createVehicle(world, e, opts)`, `VEHICLE_SYSTEM` (`lh.kit.vehicle`). The raycast car holds `controller`, `entity`, `wheels`, `tyre`, `removed`, `set` and `update`. | in, returns a car | sim half | [src/kits/vehicle/sim.js:12; src/kits/vehicle/sim.js:53; src/kits/vehicle/sim.js:110-139] <!-- C-414 --> |
| The tire car holds `entity`, `wheels`, `tyre`, `backend` (`tire`), `substeps`, `removed`, `set` and `update`. The tire car has no `controller`. The raycast car has no `backend` field. | out | car object | [src/kits/vehicle/sim.js:110-111; src/kits/vehicle/sim.js:194-196] <!-- C-415 --> |
| `mfNorm(rho, s)`, `TIRE`, `surfaceOf(tire)`, `DEFAULT_SURFACE`, `tireStep(out, st, vsx, vy, vx, fz, surf, h, cx, cy, apScale = 1)` | out | sim-pure maths in `src/kits/vehicle/tire.js` | [src/kits/vehicle/tire.js:1-3; src/kits/vehicle/tire.js:6; src/kits/vehicle/tire.js:9; src/kits/vehicle/tire.js:21; src/kits/vehicle/tire.js:27; src/kits/vehicle/tire.js:34] <!-- C-416 --> |
| `createPowertrain(opts)`, `ENGINE_PRESETS`. The file `src/kits/vehicle/sim.js` re-exports both. | in, returns a powertrain | sim half in `src/kits/vehicle/powertrain.js` | [src/kits/vehicle/powertrain.js:13; src/kits/vehicle/powertrain.js:23; src/kits/vehicle/sim.js:10] <!-- C-223 --> |
| The powertrain holds `spec`, `turbo`, `gears` (the number of forward gears), `state`, `throttle`, `start`, `stop`, `shift` and `step`. | out | powertrain object | [src/kits/vehicle/powertrain.js:74-101] <!-- C-230 --> |
| `EngineDSP` class and `engineConfig(s)` | out | synth class and configuration message in `src/kits/vehicle/engineDsp.js` | [src/kits/vehicle/engineDsp.js:1-5; src/kits/vehicle/engineDsp.js:229-230] <!-- C-280 C-289 --> |
| `createEngineSound(audio, pt, options)`. The returned sound object holds `ready`, the getters `mode`, `voice` and `dsp`, `mic(name)`, `update()` and `dispose()`. The doc names the import path `lion-hawk/kits/vehicle/view`. | in, returns a sound object | view half in `src/kits/vehicle/view.js` | [src/kits/vehicle/view.js:20; src/kits/vehicle/view.js:45-60; docs/spec.md:451] <!-- C-342 --> |

## Behavior

### Material registry: build
- **B-1** The registry ids list the base library first in base order, then the game entries in key order. [src/defs/materials.js:120-131] <!-- C-1 -->
- **B-2** If a game entry has a base id, defineMaterials deep-merges the entry over the base entry. The merged entry keeps the base index. [src/defs/materials.js:126-129; test/materials.test.mjs:59] <!-- C-2 -->
- **B-3** A material with `extends` resolves by deep merge per block over the resolved parent. The child wins. [src/defs/materials.js:83-87; src/defs/materials.js:134-149] <!-- C-3 -->
- **B-4** In a merge, arrays and scalars replace the parent value. The `game` block copies through like any block. [src/defs/materials.js:83-87; src/defs/materials.js:134-149] <!-- C-4 -->
- **B-5** Each resolved material is a deep-frozen copy that carries its `id`. The caller's objects stay untouched. [src/defs/materials.js:82-88; src/defs/materials.js:150; test/materials.test.mjs:49] <!-- C-5 -->
- **B-6** The base library is a deeply frozen object of 18 entries. The order is steel, aluminium, wood, rubber, glass, plastic, fabric, flesh, fur, gravel, grass, dirt, mud, asphalt, snow, ice, water, air. [src/defs/materials.base.js:5-120; test/materials-base.test.mjs:5-10] <!-- C-6 -->
- **B-7** A World without `defs.materials` uses the base library. `checks.materials` also defaults to the base library. [test/world-base-materials.test.mjs:12; test/world-base-materials.test.mjs:29] <!-- C-7 -->
- **B-8** `checks.materials` reports a missing sidecar material at the location `models.<model>.colliders[<i>]`. `materialRefs` alone returns `<model>.colliders[<i>]`. [test/world-base-materials.test.mjs:45] <!-- C-8 -->

### Material registry: lookups
- **B-9** `get(id)` returns the resolved material. `has(id)` returns a boolean. `index(id)` returns the position in `ids`. [src/defs/materials.js:153-154; src/defs/materials.js:210-212] <!-- C-9 -->
- **B-10** The calls `get` and `index` throw `materials: unknown material '<id>'` for an unknown id. [src/defs/materials.js:154; src/defs/materials.js:210-212] <!-- C-10 -->
- **B-11** `byIndex(i)` returns the id string. [src/defs/materials.js:213] <!-- C-11 -->
- **B-12** A material has `sg` equal to `phys.sg`, else 0 if it has a `fluid` block, else 1. [src/defs/materials.js:155; test/materials.test.mjs:68] <!-- C-12 -->
- **B-13** If a material has no `phys.sg` and has a `fluid` block, its collider density is 0. [src/defs/materials.js:156; test/materials.test.mjs:68] <!-- C-13 -->
- **B-14** Otherwise the collider density is `sg × 1000 × fill`, with `fill` defaulting to 1. [src/defs/materials.js:156; test/materials.test.mjs:68] <!-- C-14 -->
- **B-15** `collider(id)` returns a frozen `{ friction, restitution, density }`. The friction is the square root of `phys.friction`, which defaults to 0.5. [src/defs/materials.js:157-161; src/defs/materials.js:215] <!-- C-15 -->
- **B-16** The restitution from `collider(id)` defaults to 0. `density(id)` returns the same density. [src/defs/materials.js:159-160; src/defs/materials.js:214] <!-- C-16 -->

### Material pairs
- **B-17** defineMaterials parses `options.pairs` into a table keyed by the unordered pair. Each key must read `a|b` with two non-empty ids. [src/defs/materials.js:100-113; src/defs/materials.js:164] <!-- C-17 -->
- **B-18** A pair entry takes `friction`, `restitution`, `tire`, `sound` and `fx`. The registry clones and deep-freezes each entry. [src/defs/materials.js:63; src/defs/materials.js:109-110] <!-- C-18 -->
- **B-19** If a pair entry has a `tire` block and neither of its two materials has `tire` data, the entry must give every `tire` field. [src/defs/materials.js:165-172] <!-- C-19 -->
- **B-20** `pair(a, b)` caches its result per ordered pair of ids. The result is a deep-frozen `{ friction, restitution, tire, sound, fx }`. [src/defs/materials.js:173-192; test/materials-pairs.test.mjs:37] <!-- C-20 -->
- **B-21** In `pair(a, b)`, friction is the entry friction. Without an entry value, friction is the square root of the product of the two `phys.friction` values. [src/defs/materials.js:184; test/materials-pairs.test.mjs:5] <!-- C-21 -->
- **B-22** In `pair(a, b)`, the default for a `phys.friction` value is 0.5. Restitution is the entry value, else the larger of the two restitutions. [src/defs/materials.js:184-185; test/materials-pairs.test.mjs:5] <!-- C-22 -->
- **B-23** In `pair(a, b)`, the soft material is `b` if `sg(b) < sg(a)`, else `a`. A tie in `sg` gives the cues to `a`. [src/defs/materials.js:181; test/materials-pairs.test.mjs:16] <!-- C-23 -->
- **B-24** In `pair(a, b)`, sound is the entry value, else the soft material's sound, else the hard material's sound, else null. Fx follows the same order. [src/defs/materials.js:187-188; test/materials-pairs.test.mjs:16] <!-- C-24 -->
- **B-25** In `pair(a, b)`, the ground tire is the `tire` of `b`, else the `tire` of `a`. [src/defs/materials.js:182; test/materials-pairs.test.mjs:16] <!-- C-25 -->
- **B-26** The result `tire` is the ground tire merged field by field with the entry tire. Without a ground tire it is the entry tire alone. With no entry tire, it is the ground tire if one exists, else null. [src/defs/materials.js:186; test/materials-pairs.test.mjs:16] <!-- C-26 -->

### Registry hash
- **B-27** The registry hash is 8 lowercase hex digits. The hash is the FNV hash (`fnv` from `src/core/rng.js`) of canonical JSON. [src/defs/materials.js:4; src/defs/materials.js:98; src/defs/materials.js:198-205; test/materials-hash.test.mjs:10] <!-- C-27 -->
- **B-28** The canonical JSON holds the materials in index order and the pair friction and restitution values. [src/defs/materials.js:194-205] <!-- C-28 -->
- **B-29** For each material, the hash covers the id, friction, restitution, `sg` and `fill`, with defaults filled in. The `sg` of a fluid without `phys.sg` is 0. [src/defs/materials.js:155; src/defs/materials.js:199-203] <!-- C-29 -->
- **B-30** For each pair entry that sets friction or restitution, the hash covers the sorted pair key and those values. A pair entry with neither value adds nothing. [src/defs/materials.js:197; src/defs/materials.js:204; test/materials-hash.test.mjs:13] <!-- C-30 -->
- **B-31** The hash ignores `look`, `game`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `sound` and `fx`. A change to them needs no re-bake. [src/defs/materials.js:194-196; test/materials-hash.test.mjs:13] <!-- C-31 -->
- **B-32** `canonicalJson` sorts object keys at every level. [src/defs/materials.js:90-97; test/materials-hash.test.mjs:5] <!-- C-32 -->
- **B-33** `canonicalJson` throws `materials: cannot hash <value>` for a value that is not plain JSON. A function, `undefined` and a non-finite number are examples. [src/defs/materials.js:96; test/materials-hash.test.mjs:5] <!-- C-33 -->
- **B-34** A test pins the base library registry hash as `2f4f4f95`. The file `docs/spec.md` gives the same value. [test/materials-hash.test.mjs:11; docs/spec.md:128] <!-- C-34 -->

### Sidecar validation
- **B-35** Each sidecar validator returns its input unchanged or throws on the first error. [src/defs/sidecar.js:1-4; test/sidecar.test.mjs:26] <!-- C-35 -->
- **B-36** A collider needs `p` (3 finite numbers), `q` (a unit quaternion `[x, y, z, w]`) and `part` (a non-empty string). [src/defs/sidecar.js:20-22; src/defs/sidecar.js:36-39] <!-- C-36 -->
- **B-37** With `inline: true`, a collider may omit `p`, `q` and `part`. The validator still validates them when present. [src/defs/sidecar.js:29; src/defs/sidecar.js:36-38; test/sidecar-collider.test.mjs:53] <!-- C-37 -->
- **B-38** If the caller gives a `parts` list, a collider `part` must be in it. Otherwise the collider fails with `names an unknown part`. [src/defs/sidecar.js:40] <!-- C-38 -->
- **B-39** A collider `material` is always required and must be a non-empty string. [src/defs/sidecar.js:42; test/sidecar-collider.test.mjs:53] <!-- C-39 -->
- **B-40** A collider `material` that starts with `paint-` fails as a paint slot. [src/defs/sidecar.js:43] <!-- C-40 -->
- **B-41** If the caller gives a registry, the collider `material` must pass its `has()`. [src/defs/sidecar.js:44] <!-- C-41 -->
- **B-42** A box needs `half` as 3 numbers > 0. A box may carry `round`, a number > 0 with no upper bound. Rapier adds `round` outside `half`. [src/defs/sidecar.js:47-52] <!-- C-42 -->
- **B-43** A sphere needs `r` > 0. A capsule or cylinder needs `halfHeight` > 0 and `r` > 0. [src/defs/sidecar.js:45; src/defs/sidecar.js:53-54] <!-- C-43 -->
- **B-44** A hull needs `points` as a flat `[x, y, z, ...]` list of 4 to 64 points. [src/defs/sidecar.js:7; src/defs/sidecar.js:55-58; test/sidecar-collider.test.mjs:48] <!-- C-44 -->
- **B-45** A mesh needs `vertices` (a flat list, a multiple of 3, at least 9 numbers) and `indices` (whole triangles, at least 3). [src/defs/sidecar.js:60-63] <!-- C-45 -->
- **B-46** Every mesh index must be an integer from 0 to the vertex count minus 1. [src/defs/sidecar.js:64] <!-- C-46 -->
- **B-47** Collider number lists may be arrays or typed arrays except `DataView`. Every entry must be finite. [src/defs/sidecar.js:18-20] <!-- C-47 -->
- **B-48** `validateSidecar` accepts the keys `v`, `source`, `parts`, `colliders`, `mass`, `sockets`, `bounds` and `aero`. Any other key fails as `unknown field`. [src/defs/sidecar.js:71; src/defs/sidecar.js:73-79] <!-- C-48 -->
- **B-49** A sidecar needs `v` equal to `SIDECAR_VERSION`, `parts` (a list of unique non-empty strings) and `colliders` (a list). [src/defs/sidecar.js:80; src/defs/sidecar.js:87-89] <!-- C-49 -->
- **B-50** `validateSidecar` validates each collider with the sidecar `parts` and the registry. [src/defs/sidecar.js:90] <!-- C-50 -->
- **B-51** A sidecar `source` is optional and hand-written fixtures have none. When present it needs `file` (a non-empty string) and `sha256` (64 lowercase hex digits). [src/defs/sidecar.js:74; src/defs/sidecar.js:81-86] <!-- C-51 -->
- **B-52** A sidecar `mass` is optional and informational. When present it needs `mass` >= 0, `com` (3 numbers), `inertia` (3 numbers >= 0) and `frame` (a unit quaternion). [src/defs/sidecar.js:74; src/defs/sidecar.js:91-99] <!-- C-52 -->
- **B-53** Each socket needs `p` (3 numbers), `q` (a unit quaternion) and `part`. The `part` is null or a name in `parts`. A null `part` means the socket has no parent part. [src/defs/sidecar.js:100-109; test/sidecar.test.mjs:32] <!-- C-53 -->
- **B-54** Sidecar `bounds` are optional. When present they need `min` (3 numbers) and `max` (3 numbers, each >= the matching `min`). [src/defs/sidecar.js:127-133] <!-- C-54 -->
- **B-55** `validatePhys` accepts the keys `v`, `engine`, `materials` and `models`. Any other key fails as `unknown field`. [src/defs/sidecar.js:137; src/defs/sidecar.js:143] <!-- C-55 -->
- **B-56** `validatePhys` needs `v` equal to `SIDECAR_VERSION` and `models` as an object. The call needs `materials` as 8 lowercase hex digits. The call needs `engine` as a version like `0.8.0`, and an optional `-suffix` is allowed. [src/defs/sidecar.js:144-147] <!-- C-56 -->
- **B-57** `validatePhys` validates each model with `validateSidecar` and the model id. [src/defs/sidecar.js:148] <!-- C-57 -->
- **B-58** `validatePhys` does not compare `materials` with `registry.hash`. The caller does that (`checks.materials`, `lion-hawk bake --check`). [src/defs/sidecar.js:137-140; test/checks-materials.test.mjs:22] <!-- C-58 -->
- **B-59** `materialRefs(phys)` returns an object that maps each material name used by a collider to a list of `<model>.colliders[<i>]` locations. The keys of the object are sorted. [src/defs/sidecar.js:152-157; test/sidecar.test.mjs:67] <!-- C-59 -->
- **B-177** A sidecar `aero` field is optional. When present it must be an object with only the keys `panels`, `volume` and `centroid`. [src/defs/sidecar.js:74; src/defs/sidecar.js:110-113] <!-- C-177 -->
- **B-178** The `aero.panels` field must be a list. Each panel must be an object with only the keys `part`, `a`, `n` and `c`. [src/defs/sidecar.js:114-118] <!-- C-178 -->
- **B-179** In an aero panel, `part` must name a sidecar part and `a` must be a finite number > 0. The vector `n` must be 3 numbers with a length within 1e-4 of 1. The point `c` must be 3 numbers. [src/defs/sidecar.js:119-122] <!-- C-179 -->
- **B-180** The `aero.volume` field must be a finite number >= 0. The `aero.centroid` field must be 3 numbers. The source comment gives the frame as body space. [src/defs/sidecar.js:110; src/defs/sidecar.js:124-125] <!-- C-180 -->

### Net fields and kinds
- **B-60** `F.bool` packs into a shared flags byte. An `F.obj` holds at most 8 bools. `F.obj` keys lists the non-bool fields in order. [src/defs/fields.js:7; src/defs/fields.js:14] <!-- C-60 -->
- **B-61** `F.uint(bytes, max, min)` takes `bytes` 1, 2 or 4. The `max` defaults to 2^(8×bytes)-1 and `min` to 0. Encode throws below `min` and decode drops it. [src/defs/fields.js:8] <!-- C-61 -->
- **B-62** `F.id` is a u16 and null travels as `0xffff`. `F.oneOf` is a u8 index. `F.angle` is a u16 over a full turn. [src/defs/fields.js:9-10; src/defs/fields.js:12] <!-- C-62 -->
- **B-63** `F.fixed` is u16 steps from `lo`, and values clamp into `lo..hi`. `F.quat` is 4 × i16, normalized on decode. `F.list` is a u8 count. [src/defs/fields.js:11; src/defs/fields.js:13; src/defs/fields.js:15] <!-- C-63 -->
- **B-64** `F.actions(map)` packs axes as i16/32767 in the key order of the map, then buttons as flags, 8 per byte. [src/defs/fields.js:16-21] <!-- C-64 -->
- **B-65** `F.actions` decodes to `{ axis: number, button: boolean }`. [src/defs/fields.js:16] <!-- C-65 -->
- **B-66** `F.body({ range = 400, height = 50 })` packs one body `{ p, q, v, w }` in 26 bytes and marks the field with `body: true`. [src/defs/fields.js:22-29; test/net-fields.test.mjs:13-20] <!-- C-66 -->
- **B-67** The `F.body` precision for `p.x` and `p.z` is 1/64 m over ±`range`. For `p.y` it is 1/256 m over ±`height`. For `v` it is 1/1000 m/s over ±32. For `w` it is 1/2000 rad/s over ±16. [src/defs/fields.js:22-29; test/net-fields.test.mjs:20] <!-- C-67 -->
- **B-68** When `def.remote` is unset, `kind` uses `driven` for an owner kind that has an `F.actions` input field and a field named `body` made with `F.body()`. Otherwise `kind` uses `proxy`. [src/defs/fields.js:41-43; test/net-fields.test.mjs:35] <!-- C-68 -->
- **B-69** The `follow` value defaults to `interp`. The value must be `interp` or `forecast`. The value `forecast` needs at least one `F.body()` field. [src/defs/fields.js:47-49] <!-- C-69 -->
- **B-70** `kind` merges `def.tune` over `TUNE` and `def.send` over `SEND`. [src/defs/fields.js:36; src/defs/fields.js:50-51; src/defs/fields.js:55-56] <!-- C-70 -->
- **B-71** `kind` returns the definition with `idMin` defaulting to 0, plus `remote`, `follow`, frozen `tune` and `send`, `bodies`, `input` and `rec`. The `rec` field is `F.obj` of the wire fields. [src/defs/fields.js:37; src/defs/fields.js:61] <!-- C-71 -->
- **B-72** For a driven kind, the wire form replaces `input` with `F.obj({ s: F.uint(4), list: F.list(input, 64, 1) })`. [src/defs/fields.js:4; src/defs/fields.js:59-60; test/net-fields.test.mjs:61] <!-- C-72 -->
- **B-73** The wire field `s` is the owner step of the newest input. The `list` field holds snapshots, oldest first. Other kinds keep their wire bytes. [src/defs/fields.js:4; src/defs/fields.js:59-60; test/net-fields.test.mjs:61] <!-- C-73 -->
- **B-74** A driven record carries the newest input and at least 7 before it. The record carries 2 × steps per send when that is more. [src/defs/fields.js:34; src/defs/fields.js:60] <!-- C-74 -->

### Coverage kit
- **B-75** The coverage system runs in stage `post` on the host, which is the engine or a scene ctx. The system does nothing when `engine.world` is null. [src/kits/coverage/sim.js:27-29; src/kits/coverage/sim.js:54; test/kits/coverage.test.mjs:60] <!-- C-75 -->
- **B-76** Each step the coverage system visits every entity that has a `coverage` part, an `xf` and a coverage object. [src/kits/coverage/sim.js:30-34] <!-- C-76 -->
- **B-77** The first wash entry whose `at(x, z)` is true decides the wash time. [src/kits/coverage/sim.js:35-36] <!-- C-77 -->
- **B-78** Each washes entry is a function `(x, z) => boolean` or `{ at, washTime }`. A function entry uses the kit-wide `washTime`. [src/kits/coverage/sim.js:17-24; test/kits/coverage.test.mjs:33] <!-- C-78 -->
- **B-79** In a wash, each layer among dirt, rust, snow and mud that the entity carries drops by `dt / washTime`, with a floor of 0. The entity gains nothing that step. [src/kits/coverage/sim.js:8; src/kits/coverage/sim.js:37-41; test/kits/coverage.test.mjs:24] <!-- C-79 -->
- **B-80** Outside a wash, the entity gains `dirtRate × metres moved` on the ground layer, capped at 1. [src/kits/coverage/sim.js:42-52; test/kits/coverage.test.mjs:16] <!-- C-80 -->
- **B-81** Metres moved is the horizontal distance from the pool prev pose to the curr pose. A `place()` adds nothing. [src/kits/coverage/sim.js:42-43; test/kits/coverage.test.mjs:50] <!-- C-81 -->
- **B-82** The gain is skipped when the entity did not move or when `materialAt` returns null or undefined. The gain is also skipped when the ground `dirtRate` is 0 or absent, or when the entity lacks the layer. [src/kits/coverage/sim.js:44-50; test/kits/coverage.test.mjs:50] <!-- C-82 -->
- **B-83** The ground material id maps to a layer through `layer(id)`. The default `coverageLayer` gives `mud` for `mud`, `snow` for `snow` and `dirt` for any other id. [src/kits/coverage/sim.js:10; src/kits/coverage/sim.js:49; test/kits/coverage.test.mjs:69] <!-- C-83 -->
- **B-84** The gain scales by what the entity's own material accepts. That material is `e.coverageMaterial`, else the first collider's material. [src/kits/coverage/sim.js:51; src/kits/coverage/sim.js:58-60; test/kits/coverage.test.mjs:41] <!-- C-84 -->
- **B-85** The scale is the `coverage` value of that material for the layer. The scale is 0 if the block lacks the layer, and 1 without a block or without a material. [src/kits/coverage/sim.js:58-64; test/kits/coverage.test.mjs:41] <!-- C-85 -->
- **B-86** On create, `coverageView` clones each non-instanced mesh whose single material has the `COVERAGE` define, through `compiler.coverage`. [src/kits/coverage/view.js:10-22; test/kits/coverage-view.test.mjs:17] <!-- C-86 -->
- **B-87** All clones of one entity share one `uCoverage` vector. An entity with no object or no such mesh is skipped. [src/kits/coverage/view.js:12-23; test/kits/coverage-view.test.mjs:47] <!-- C-87 -->
- **B-88** `coverageView` skips instanced meshes and array materials. Instanced meshes use `COVERAGE_INSTANCED` and an `instanceCoverage` attribute that the instancing owner writes. [src/kits/coverage/view.js:2-4; src/kits/coverage/view.js:15-17] <!-- C-88 -->
- **B-89** On create and on each frame, `coverageView` writes (dirt, rust, snow, mud) into `uCoverage` in place, with 0 for a missing layer. A frame allocates nothing. [src/kits/coverage/view.js:4; src/kits/coverage/view.js:8; src/kits/coverage/view.js:25; src/kits/coverage/view.js:27-30; test/kits/coverage-view.test.mjs:29] <!-- C-89 -->
- **B-90** On remove, `coverageView` restores the base material of each mesh and disposes the clone. [src/kits/coverage/view.js:9; src/kits/coverage/view.js:31-36; test/kits/coverage-view.test.mjs:39] <!-- C-90 -->
- **B-91** `off()` unsubscribes from sync and releases every entity. [src/kits/coverage/view.js:39; test/kits/coverage-view.test.mjs:47] <!-- C-91 -->

### Fx kit
- **B-92** `emit(x, y, z, vx, vy, vz, life, size, c, g, d)` takes the next slot of a ring of `max` slots and returns the slot index. [src/kits/fx/view.js:28-43; test/kits/fx-particles.test.mjs:20] <!-- C-92 -->
- **B-93** Once `max` is reached, `emit` reuses the oldest slot. The per-particle `g` and `d` default to the pool gravity and drag. [src/kits/fx/view.js:28-30; test/kits/fx-particles.test.mjs:20; test/kits/fx-particles.test.mjs:70] <!-- C-93 -->
- **B-94** `emit` sets the colour of the slot from `c`. If `c` is null or undefined, the slot keeps the shared colour. [src/kits/fx/view.js:37-38; test/kits/fx-particles.test.mjs:60] <!-- C-94 -->
- **B-95** The start spin of a slot comes from the slot index times the golden angle. The kit uses no random numbers. [src/kits/fx/view.js:3; src/kits/fx/view.js:7; src/kits/fx/view.js:33] <!-- C-95 -->
- **B-96** `update(dt)` lowers life by `dt`. A particle with life <= 0 gets a zero-scale matrix and its slot frees. [src/kits/fx/view.js:53-54; test/kits/fx-particles.test.mjs:26] <!-- C-96 -->
- **B-97** Particles shrink over the last half of their life. [src/kits/fx/view.js:69; test/kits/fx-particles.test.mjs:26] <!-- C-97 -->
- **B-98** `update(dt)` applies gravity to `vy` unless the particle landed. The call multiplies the horizontal velocity by `max(0, 1 - drag × dt)` and integrates the position. [src/kits/fx/view.js:55-60; test/kits/fx-particles.test.mjs:10] <!-- C-98 -->
- **B-99** With a `floor` function, a particle rests at `floor(x, z)` plus 0.02 for a quad or plus half its size for a cube. [src/kits/fx/view.js:34; src/kits/fx/view.js:59-62; test/kits/fx-particles.test.mjs:38] <!-- C-99 -->
- **B-100** On touching down while falling, `vy` becomes `-vy × bounce` and the horizontal velocity scales by `friction`. The particle lands when `vy` < 1. [src/kits/fx/view.js:62-66; test/kits/fx-particles.test.mjs:38] <!-- C-100 -->
- **B-101** A landed quad lies flat and stops spinning. Other particles tumble about a fixed axis, and their spin grows by 4 rad/s. [src/kits/fx/view.js:68-71; test/kits/fx-particles.test.mjs:52] <!-- C-101 -->
- **B-102** `update(dt)` uploads only the written range of instance matrices and colours. [src/kits/fx/view.js:74-75; test/kits/fx-particles.test.mjs:60] <!-- C-102 -->
- **B-103** When no particle lives, `update(dt)` resets the ring and sets `mesh.count` to 0. The `live` getter returns the live particle count. [src/kits/fx/view.js:76; src/kits/fx/view.js:81; test/kits/fx-particles.test.mjs:26] <!-- C-103 -->
- **B-104** Particle `dispose()` removes the mesh from its parent and frees the mesh. The call frees the geometry and material only when `createParticles` made them. [src/kits/fx/view.js:79-80; test/kits/fx-particles.test.mjs:82] <!-- C-104 -->
- **B-105** `marks.add(x, z, nx, nz, alpha = 1)` writes a flat quad along the direction `(nx, nz)` and returns the slot index. [src/kits/fx/view.js:96-110; test/kits/fx-marks.test.mjs:10] <!-- C-105 -->
- **B-106** If the direction has zero length, `marks.add` returns -1. Length runs along the direction and width across. The height is `heightAt(x, z)` (or 0) plus `lift`. [src/kits/fx/view.js:97-105; test/kits/fx-marks.test.mjs:29] <!-- C-106 -->
- **B-107** Alpha clamps to 0..1 and sets the mark width to `width × (0.5 + 0.5 × alpha)`. [src/kits/fx/view.js:99; test/kits/fx-marks.test.mjs:22] <!-- C-107 -->
- **B-108** Marks form a ring of `max` slots. `update()` uploads only the rows written since the last update. [src/kits/fx/view.js:96-117; test/kits/fx-marks.test.mjs:29] <!-- C-108 -->
- **B-109** Marks `dispose()` removes the mesh and frees the geometry. The call frees the material only when the kit made it. [src/kits/fx/view.js:119; test/kits/fx-marks.test.mjs:40] <!-- C-109 -->

### Glyphs kit
- **B-110** `glyphFor(role, family)` returns the icon as a `data:image/svg+xml` URI, or null when the family has no input for the role. [src/kits/glyphs/view.js:10-17; test/kits/glyphs.test.mjs:10] <!-- C-110 -->
- **B-111** Pad families have every role. The `keys` family has no `prev` and no `next`. The `pointer` and `touch` families have only `confirm`. [test/kits/glyphs.test.mjs:7-8; test/kits/glyphs.test.mjs:10] <!-- C-111 -->
- **B-112** `familyFor(input, pad)` returns `pad` when `input` is `pad` and `pad` is a known family, else `xbox`. [src/kits/glyphs/view.js:18-19; test/kits/glyphs.test.mjs:21] <!-- C-112 -->
- **B-113** For another `input`, `familyFor` returns `input` when it is a known family, else `pointer`. [src/kits/glyphs/view.js:19; test/kits/glyphs.test.mjs:21] <!-- C-113 -->
- **B-114** `bindGlyphs(engine, { doc })` returns `{ update, dispose }` and keeps every `[data-lh-glyph]` element current. [src/kits/glyphs/view.js:21-45; test/kits/glyphs.test.mjs:29] <!-- C-114 -->
- **B-115** An `IMG` element gets its `src`. Any other element gets the CSS variable `--lh-glyph: url(...)`. The element gets `data-lh-glyph-family`. [src/kits/glyphs/view.js:21-23; src/kits/glyphs/view.js:35-37; test/kits/glyphs.test.mjs:29] <!-- C-115 -->
- **B-116** An element whose role is unknown or has no icon in the family gets `hidden = true`. [src/kits/glyphs/view.js:32-34] <!-- C-116 -->
- **B-117** The `doc` option defaults to `globalThis.document`. The family comes from the `data-lh-input` and `data-lh-pad` attributes of the html element. [src/kits/glyphs/view.js:1-4; src/kits/glyphs/view.js:25; src/kits/glyphs/view.js:41] <!-- C-117 -->
- **B-118** `update()` repaints only when the family changes or a MutationObserver saw added or changed glyph markup. `dispose()` disconnects the observer. [src/kits/glyphs/view.js:22-29; src/kits/glyphs/view.js:40-45] <!-- C-118 -->

### Terrain kit
- **B-119** Heights are row-major: `heights[iz × nx + ix]` at `(x0 + ix × cell, z0 + iz × cell)`. [src/kits/terrain/sim.js:1-4; src/kits/terrain/sim.js:16; test/kits/terrain-rapier.test.mjs:18] <!-- C-119 -->
- **B-120** `createTerrain` copies the heights to a `Float32Array`, so `heightAt` agrees with the ray casts of Rapier. [src/kits/terrain/sim.js:16; test/kits/terrain-rapier.test.mjs:18] <!-- C-120 -->
- **B-121** The collider material is `opts.material`. Without it, the collider material is the most common registry index of a `materials` array, with ties to the lowest index. [src/kits/terrain/sim.js:28; src/kits/terrain/sim.js:76-83; test/kits/terrain.test.mjs:46] <!-- C-121 -->
- **B-122** If `materials` is a function and `opts.material` is unset, the collider material is the function value at the grid centre. [src/kits/terrain/sim.js:27-28; test/kits/terrain.test.mjs:46] <!-- C-122 -->
- **B-123** `createTerrain` calls `world.heightfield` with `nx`, `nz`, `cell`, `x0`, `z0`, the float32 heights, the collider material and `fixInternalEdges`. The terrain entity is its result. [src/kits/terrain/sim.js:30; src/kits/terrain/sim.js:33; test/kits/terrain.test.mjs:72] <!-- C-123 -->
- **B-124** If `opts.groups` is unset and the World declares a `ground` collision group, the terrain joins it as `{ member: ['ground'] }`. [src/kits/terrain/sim.js:31-32; test/kits/terrain-rapier.test.mjs:45] <!-- C-124 -->
- **B-125** If `opts.groups` is unset and the World has no `ground` group, the heightfield gets no groups. An explicit `opts.groups` passes through. [src/kits/terrain/sim.js:31-32; test/kits/terrain.test.mjs:72] <!-- C-125 -->
- **B-126** `heightAt(x, z)` interpolates with the Rapier cell split along the `(ix+1, iz)`-`(ix, iz+1)` diagonal. [src/kits/terrain/sim.js:2-4; src/kits/terrain/sim.js:54-58; test/kits/terrain.test.mjs:21] <!-- C-126 -->
- **B-127** `heightAt` clamps `x` and `z` to the grid, so a point outside gives the edge height. [src/kits/terrain/sim.js:36-44; test/kits/terrain.test.mjs:14] <!-- C-127 -->
- **B-128** `normalAt(x, z, out)` writes the unit normal of the same triangle into `out.x`, `out.y` and `out.z`, and returns `out`. [src/kits/terrain/sim.js:59-65; test/kits/terrain.test.mjs:27] <!-- C-128 -->
- **B-129** If `materials` is a function, `materialAt(x, z)` is that function. With an array, `materialAt` returns the id of the nearest sample, with `x` and `z` clamped to the grid. [src/kits/terrain/sim.js:45-50; src/kits/terrain/sim.js:66; test/kits/terrain.test.mjs:38] <!-- C-129 -->
- **B-130** `blendAt(x, z, out)` calls `opts.blend(x, z, out)` when given. [src/kits/terrain/sim.js:67-68; test/kits/terrain.test.mjs:56] <!-- C-130 -->
- **B-131** Without `blend`, `blendAt` sets `out.a` and `out.b` to `materialAt(x, z)` and `out.w` to 0, and returns `out`. [src/kits/terrain/sim.js:67-71; test/kits/terrain.test.mjs:56] <!-- C-131 -->
- **B-132** The chunk side is `chunkCells` when set. Otherwise the side is the cells per chunk from the `chunks` counts, rounded up to a multiple of the coarsest LOD step. [src/kits/terrain/view.js:47-49; test/kits/terrain-view.test.mjs:135] <!-- C-132 -->
- **B-133** A chunk that starts past the grid is left out. [src/kits/terrain/view.js:55-57] <!-- C-133 -->
- **B-134** A material option that is a three.js material is used as is. Otherwise `createTerrainMesh` calls `compiler.get(material, { vertexColors: !!colorAt })`. [src/kits/terrain/view.js:43; test/kits/terrain-view.test.mjs:95; test/kits/terrain-view.test.mjs:110] <!-- C-134 -->
- **B-135** A chunk builds lazily per LOD. LOD 0 vertices sit on the height samples. [src/kits/terrain/view.js:1-4; src/kits/terrain/view.js:64-70; test/kits/terrain-view.test.mjs:17] <!-- C-135 -->
- **B-136** Neighbour chunks share their edge vertices at one LOD, because normals come from the grid at the LOD spacing. [src/kits/terrain/view.js:71-74; test/kits/terrain-view.test.mjs:47] <!-- C-136 -->
- **B-137** Each chunk has four skirts, which are copies of the edge vertices hung `skirt` metres lower. The surface faces up and each skirt faces out of its chunk. [src/kits/terrain/view.js:9-27; src/kits/terrain/view.js:82-89; test/kits/terrain-view.test.mjs:32] <!-- C-137 -->
- **B-138** `chunkIndex` uses `Uint32Array` when the chunk has more than 65535 vertices, else `Uint16Array`. [src/kits/terrain/view.js:27] <!-- C-138 -->
- **B-139** `colorAt(x, z, rgb, normalY)` fills vertex colours. Each `attributes` entry `{ size, at(x, z, out) }` adds a float attribute of that size. [src/kits/terrain/view.js:41-42; src/kits/terrain/view.js:75-80; test/kits/terrain-view.test.mjs:95] <!-- C-139 -->
- **B-140** `drop(x, z, lodIndex)` lowers a vertex height. [src/kits/terrain/view.js:70] <!-- C-140 -->
- **B-141** Each chunk geometry gets its own copy of the index. Disposing one geometry then frees no buffer that other chunks at the same LOD still draw with. [src/kits/terrain/view.js:95; test/kits/terrain-view.test.mjs:162] <!-- C-141 -->
- **B-142** `update(camera)` returns at once when a first update ran, nothing is pending and the camera moved less than `moveEps` in x and z. [src/kits/terrain/view.js:102-104; test/kits/terrain-view.test.mjs:56] <!-- C-142 -->
- **B-143** Otherwise `update(camera)` picks a LOD per chunk from the distance to the chunk box. [src/kits/terrain/view.js:105-114; test/kits/terrain-view.test.mjs:56] <!-- C-143 -->
- **B-144** A chunk takes the first LOD whose `lodFar` distance is above its distance. A chunk at a finer LOD stays at it until the distance reaches that `lodFar` plus `hysteresis`. [src/kits/terrain/view.js:112-114; test/kits/terrain-view.test.mjs:56] <!-- C-144 -->
- **B-145** A chunk beyond `visFar` is hidden. [src/kits/terrain/view.js:111] <!-- C-145 -->
- **B-146** The first update builds with no time limit. Later updates stop building after `budgetMs`. [src/kits/terrain/view.js:105; src/kits/terrain/view.js:116-117; test/kits/terrain-view.test.mjs:68] <!-- C-146 -->
- **B-147** When the budget runs out, a chunk shows a LOD it has, else it builds its coarsest LOD at once. `stats.pending` is true. Pending builds finish on later updates. [src/kits/terrain/view.js:118-122; test/kits/terrain-view.test.mjs:68; test/kits/terrain-view.test.mjs:82] <!-- C-147 -->
- **B-148** When `evict` is set, `update` disposes the geometry of LOD `k` for a chunk whose distance exceeds `evict[k]`. The geometry builds again when the camera returns. [src/kits/terrain/view.js:110; test/kits/terrain-view.test.mjs:121] <!-- C-148 -->
- **B-149** `dispose()` frees every built geometry, empties the group of chunk meshes and removes the group from its parent. [src/kits/terrain/view.js:134-141; test/kits/terrain-view.test.mjs:152] <!-- C-149 -->

### Vehicle kit: both backends
- **B-150** Each wheel spec needs `at` (a point `[x, y, z]` or `{x, y, z}`) or a `socket` name, and `radius` > 0. Both backends share this check. [src/kits/vehicle/sim.js:66-71; src/kits/vehicle/sim.js:79; test/kits/vehicle.test.mjs:56] <!-- C-150 -->
- **B-151** The kit reads a socket from `e.sockets[socket].p`. A wheel with neither `at` nor `socket`, or with an unknown socket, throws. [src/kits/vehicle/sim.js:67-68; test/kits/vehicle.test.mjs:56] <!-- C-151 -->
- **B-152** A wheel spec may name a part. The name must be a non-empty string and unique among the wheels, else `createVehicle` throws. [src/kits/vehicle/sim.js:72-77; test/kits/vehicle-parts.test.mjs:37] <!-- C-152 -->
- **B-153** Named wheels write `e.partXf`, merged with the game's own part names. Both backends do this. [src/kits/vehicle/sim.js:108; src/kits/vehicle/sim.js:187; test/kits/vehicle-parts.test.mjs:37] <!-- C-153 -->
- **B-154** Each step a named wheel writes its part pose into `e.partXf` in the chassis frame. The hub is the connection point moved down by the suspension length. [src/kits/vehicle/sim.js:24-31; src/kits/vehicle/sim.js:136; test/kits/vehicle-parts.test.mjs:18] <!-- C-154 -->
- **B-155** The part pose is steered about +y, then rolled about the axle by minus the wheel rotation. The raycast backend reads the rotation from Rapier. The tire backend uses its own accumulated spin. [src/kits/vehicle/sim.js:24-31; src/kits/vehicle/sim.js:136; src/kits/vehicle/sim.js:267; test/kits/vehicle-parts.test.mjs:18] <!-- C-155 -->
- **B-181** The `backend` option is `raycast` (the default) or `tire`. The raycast backend uses the ray-cast vehicle controller of Rapier. The tire backend runs the own suspension and tire model of the kit. [src/kits/vehicle/sim.js:1-4; src/kits/vehicle/sim.js:58-59; src/kits/vehicle/sim.js:79-80; CHANGELOG.md:22] <!-- C-181 -->
- **B-166** Each wheel in contact reads the ground material. If the ray hit the terrain collider, the material is `terrain.materialAt` at the contact point. [src/kits/vehicle/sim.js:97-107; src/kits/vehicle/sim.js:219-222; test/kits/vehicle-material.test.mjs:11] <!-- C-166 -->
- **B-167** If the ray hit another collider, the material is the material of that collider from `world.materialOf`. A wheel in the air gets material null. Both backends do this. [src/kits/vehicle/sim.js:97-107; src/kits/vehicle/sim.js:218-222; test/kits/vehicle-material.test.mjs:21] <!-- C-167 -->
- **B-168** `rayGroups` is `{ member, filter }` of declared collision group names. With `rayGroups`, the wheel rays use `world.groups.mask(member, filter)` as a u32. [src/kits/vehicle/sim.js:43-51; test/kits/vehicle.test.mjs:96] <!-- C-168 -->
- **B-169** Without `rayGroups`, the wheel rays have no group filter. An empty `member` means every group, for the wheel rays only. Both backends pass the mask to their rays. [src/kits/vehicle/sim.js:43-50; src/kits/vehicle/sim.js:129; src/kits/vehicle/sim.js:211; test/kits/vehicle.test.mjs:96] <!-- C-169 -->
- **B-170** `createVehicle` installs one `VEHICLE_SYSTEM` per engine, in stage `physics.world` before `lh.physics.step`. [src/kits/vehicle/sim.js:12-14; src/kits/vehicle/sim.js:33-41; test/kits/vehicle.test.mjs:88] <!-- C-170 -->
- **B-171** `VEHICLE_SYSTEM` updates the cars of the current World in creation order. Both backends join the same list. [src/kits/vehicle/sim.js:33-41; src/kits/vehicle/sim.js:140-142; src/kits/vehicle/sim.js:271-273; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-171 -->
- **B-172** Tuning stays in the game. A game system before `VEHICLE_SYSTEM` calls `car.set()`. [src/kits/vehicle/sim.js:5-6; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-172 -->
- **B-173** A game system after `VEHICLE_SYSTEM` and before `lh.physics.step` may read `car.wheels` and add impulses. [src/kits/vehicle/sim.js:5-6; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-173 -->
- **B-175** A scene change leaves the vehicles of the scene with its World. [test/kits/vehicle-lifecycle.test.mjs:34] <!-- C-175 -->
- **B-176** The sim kits are deterministic and keep no memory per step. A recorded drive replays to the same checksums. [test/kits/kits-sim.test.mjs:15; test/kits/kits-sim.test.mjs:20; test/kits/kits-sim.test.mjs:27] <!-- C-176 -->

### Vehicle kit: raycast backend
- **B-156** The raycast backend adds one Rapier wheel per spec. The backend uses the spec radius, a down ray and the axle for the forward axis. [src/kits/vehicle/sim.js:15-18; src/kits/vehicle/sim.js:80-85] <!-- C-156 -->
- **B-157** The suspension rest length is `suspension.rest`, with a default of 0.3. The spec `suspension` keys `stiffness`, `compression`, `relaxation`, `travel` and `maxForce` apply when set. [src/kits/vehicle/sim.js:84-90] <!-- C-157 -->
- **B-158** Engine force greater than 0 drives the chassis along +x or +z, as `forward` is `x` or `z`. The kit sets the forward axis index of Rapier and the axle sign for that. [src/kits/vehicle/sim.js:15-17; src/kits/vehicle/sim.js:81; test/kits/vehicle.test.mjs:28] <!-- C-158 -->
- **B-159** The `slip` and `side` values of a wheel start at the spec values, else the own defaults of Rapier. [src/kits/vehicle/sim.js:91-92] <!-- C-159 -->
- **B-160** Each raycast wheel has five controls: `steer`, `engine`, `brake`, `slip` and `side`. [src/kits/vehicle/sim.js:19; src/kits/vehicle/sim.js:91-92] <!-- C-160 -->
- **B-161** `car.set(i, { steer, engine, brake, slip, side })` sets only the given controls of wheel `i` and returns the car. The new values reach the controller on the next update. [src/kits/vehicle/sim.js:112-121; test/kits/vehicle.test.mjs:44] <!-- C-161 -->
- **B-162** `car.update(dt)` pushes the controls to the controller and runs `updateVehicle(dt)` with the ray mask. [src/kits/vehicle/sim.js:123-129; test/kits/vehicle.test.mjs:12] <!-- C-162 -->
- **B-163** After `updateVehicle`, `car.update` reads `inContact`, the contact point, the normal, the suspension length, the steering and the suspension force for each wheel. [src/kits/vehicle/sim.js:129-135; test/kits/vehicle.test.mjs:12] <!-- C-163 -->
- **B-164** `VEHICLE_SYSTEM` calls `update` once per step. Games do not call `update`. [src/kits/vehicle/sim.js:122-123] <!-- C-164 -->
- **B-165** With `grip: true`, the `slip` and `side` values scale by the pair friction of the wheel from the previous step. Without `grip`, the factor is 1. [src/kits/vehicle/sim.js:125-127; test/kits/vehicle-material.test.mjs:32] <!-- C-165 -->
- **B-174** When the entity despawns or the World clears, the raycast backend removes the car from the update list and frees the Rapier controller once. [src/kits/vehicle/sim.js:143-149; test/kits/vehicle-lifecycle.test.mjs:11; test/kits/vehicle-lifecycle.test.mjs:21] <!-- C-174 -->

### Vehicle kit: tire backend
- **B-182** A tire wheel `suspension` takes `rest` (default 0.3, must be > 0), `stiffness`, `bump` and `rebound`. A `rest` that is not > 0 throws `vehicle: wheel <i>: suspension.rest must be > 0`. [src/kits/vehicle/sim.js:176-178] <!-- C-182 -->
- **B-183** Any other tire `suspension` key throws `vehicle: wheel <i>: the tire backend's suspension has no '<key>' (rest, stiffness, bump, rebound)`. [src/kits/vehicle/sim.js:179] <!-- C-183 -->
- **B-184** The mass `mC` is the body mass divided by the wheel count. The default stiffness is `mC × 9.81 / (0.5 × rest)`. The default bump is `0.5 × sqrt(stiffness × mC)`. The default rebound is `1.5 × bump`. [src/kits/vehicle/sim.js:155; src/kits/vehicle/sim.js:174; src/kits/vehicle/sim.js:178; src/kits/vehicle/sim.js:183] <!-- C-184 -->
- **B-185** A tire wheel spec may give `inertia` (default 1 kg m^2) and `apScale` (default 1). A value of `apScale` below 1 is a stiffer tire. [src/kits/vehicle/sim.js:169-171; src/kits/vehicle/sim.js:183] <!-- C-185 -->
- **B-186** `car.set(i, controls)` accepts only `steer` (rad, positive is left), `engine` (drive torque at the wheel, N m) and `brake` (brake torque, N m, >= 0). [src/kits/vehicle/sim.js:166; src/kits/vehicle/sim.js:168; src/kits/vehicle/sim.js:196-202; test/kits/vehicle-tire.test.mjs:53] <!-- C-186 -->
- **B-187** Any other control key throws `vehicle: the tire backend has no '<key>' control (steer, engine, brake)`. A brake that is not >= 0 throws `vehicle: wheel <i>: brake torque must be >= 0`. [src/kits/vehicle/sim.js:198; src/kits/vehicle/sim.js:201; test/kits/vehicle-tire.test.mjs:53] <!-- C-187 -->
- **B-188** An index outside the wheel range throws the same range error as the raycast backend. [src/kits/vehicle/sim.js:197] <!-- C-188 -->
- **B-189** Each update casts one ray per wheel from the body-space point, along minus the chassis up axis. The ray length is the suspension rest plus the radius. [src/kits/vehicle/sim.js:207-211] <!-- C-189 -->
- **B-190** The ray skips the own body of the car and uses the ray mask. [src/kits/vehicle/sim.js:211] <!-- C-190 -->
- **B-191** The wheel compression `x` is rest minus (hit distance minus radius), or 0 without a hit. The suspension reading is rest minus `x`. The steering reading is the `steer` control. [src/kits/vehicle/sim.js:209; src/kits/vehicle/sim.js:213-217] <!-- C-191 -->
- **B-192** The suspension force is `max(0, stiffness × x + damping × xd)`. The damping is `bump` while compressing and `rebound` otherwise. [src/kits/vehicle/sim.js:227] <!-- C-192 -->
- **B-193** The load is the suspension force times `max(0, normal dot up)`. [src/kits/vehicle/sim.js:224; src/kits/vehicle/sim.js:228] <!-- C-193 -->
- **B-194** The compression rate `xd` comes from the change of `x` over `dt` when the wheel touched the ground last step. [src/kits/vehicle/sim.js:212; src/kits/vehicle/sim.js:225-226] <!-- C-194 -->
- **B-195** Otherwise `xd` is minus the contact point velocity along up, divided by `max(0.3, normal dot up)`. [src/kits/vehicle/sim.js:225] <!-- C-195 -->
- **B-196** A wheel with no hit gets material null, pair null, friction 1, the default surface, load 0 and no force. [src/kits/vehicle/sim.js:218] <!-- C-196 -->
- **B-197** A wheel in contact gets the surface `surfaceOf(pair.tire)` when its pair has a tire block, else the default surface. [src/kits/vehicle/sim.js:220-223] <!-- C-197 -->
- **B-198** The contact frame is the steered heading on the ground plane (`cf`) and its left (`cl`). The kit rotates the chassis forward axis about up by the steer angle for the heading. [src/kits/vehicle/sim.js:159; src/kits/vehicle/sim.js:229-238] <!-- C-198 -->
- **B-199** With substeps `auto`, the count is `max(1, ceil(dt / (1/1920)))` with a 1e-9 tolerance. A fixed `substeps` value is used as given. Each substep lasts `dt` divided by the count. [src/kits/vehicle/sim.js:156-157; src/kits/vehicle/sim.js:240] <!-- C-199 -->
- **B-200** In each substep, a wheel in contact with load > 0 calls `tireStep`. The damper gains are `cy = 0.3 × mC / dt` and `cx = min(cy, 0.4 × inertia / (radius² × substep length))`. [src/kits/vehicle/sim.js:245-248] <!-- C-200 -->
- **B-201** Otherwise the patch state `dx` and `dy` scale by 0.9, and `kappa` and `alpha` become 0. [src/kits/vehicle/sim.js:249] <!-- C-201 -->
- **B-202** In contact, the rolling resistance torque is `crr × load × radius × tanh(2 × omega)`. [src/kits/vehicle/sim.js:250] <!-- C-202 -->
- **B-203** The wheel `omega` changes by (engine torque minus `fx × radius` minus the rolling torque) × substep length / inertia. The brake torque removes up to its impulse and holds `omega` at 0 instead of reversing it. [src/kits/vehicle/sim.js:251-252] <!-- C-203 -->
- **B-204** The wheel `fx` and `fy` are the means of the substep forces. The spin grows by `omega × dt`. [src/kits/vehicle/sim.js:253; src/kits/vehicle/sim.js:257] <!-- C-204 -->
- **B-205** For a wheel in contact, the kit applies the impulse `(up × spring force + cf × fx + cl × fy) × dt` at the contact point to the body. [src/kits/vehicle/sim.js:258-260] <!-- C-205 -->
- **B-206** The kit applies a second impulse against the horizontal point velocity. The kit does so only when the surface drag is non-zero, the load is > 0 and the ground speed `sp` is >= 1e-3. [src/kits/vehicle/sim.js:158; src/kits/vehicle/sim.js:261-264] <!-- C-206 -->
- **B-207** The size of the drag impulse is `drag × load × tanh(sp / 2) × (1 + (sp / 18)²) × dt`. [src/kits/vehicle/sim.js:158; src/kits/vehicle/sim.js:264] <!-- C-207 -->
- **B-208** The tire backend ignores the `grip` option. The pair friction only fills the wheel `friction` field. [src/kits/vehicle/sim.js:58; src/kits/vehicle/sim.js:222] <!-- C-208 -->
- **B-209** When the entity despawns or the World clears, the tire backend removes the car from the update list and sets `removed`. No controller exists to free. [src/kits/vehicle/sim.js:274] <!-- C-209 -->
- **B-210** On a flat terrain the tire car settles with every wheel loaded, with loads that add up to about the car weight. [test/kits/vehicle-tire.test.mjs:45] <!-- C-210 -->
- **B-211** Drive torque moves the car forward and brake torque stops it. A steer above 0 turns it left. [test/kits/vehicle-tire.test.mjs:53] <!-- C-211 -->
- **B-212** The grip follows the ground tire block. The same torque makes the wheels spin on ice and moves the car away on asphalt. [test/kits/vehicle-tire.test.mjs:68] <!-- C-212 -->

### Tire model
- **B-213** `mfNorm(rho, s)` is `sin(C × atan(B × rho))`. A surface has `B = tan(pi / (2C))`, so the peak value 1 falls at `rho = 1`. [src/kits/vehicle/tire.js:5-6; src/kits/vehicle/tire.js:23; test/kits/vehicle-tire.test.mjs:15] <!-- C-213 -->
- **B-214** `surfaceOf(tire)` returns a frozen `{ mu, C, kp, ap, crr, drag, B }` and caches it per tire block object. [src/kits/vehicle/tire.js:19-25; test/kits/vehicle-tire.test.mjs:15] <!-- C-214 -->
- **B-215** `tireStep` advances the patch state `dx` and `dy` with an exact exponential decay by `|vx|` over the relaxation lengths, plus the slip velocities times `h`. [src/kits/vehicle/tire.js:36-38] <!-- C-215 -->
- **B-216** The slip ratio `kappa` is `dx / sigmaX`. [src/kits/vehicle/tire.js:39] <!-- C-216 -->
- **B-217** The peak slip angle is `ap × apScale × clamp(load / loadRef, 0.6, 1.6)^apLoad`. The normalised slip `rho` is `hypot(kappa / kp, tan(slip angle) / tan(peak slip angle))`. [src/kits/vehicle/tire.js:40-42] <!-- C-217 -->
- **B-218** A `rho` above `rhoMax` scales the patch state back to `rhoMax`. [src/kits/vehicle/tire.js:43-46] <!-- C-218 -->
- **B-219** The force limit `D` is `mu × max(0.5, 1 − loadSens × (load / loadRef − 1)) × load`. For `rho` above 1e-9 the force is `D × mfNorm(rho) / rho` along the normalised slips. [src/kits/vehicle/tire.js:47-49] <!-- C-219 -->
- **B-220** A low-speed damper has the weight `w = max(0, 1 − hypot(vx, vy) / lowSpeed)`. The damper applies when `w` > 0 and load > 0. [src/kits/vehicle/tire.js:50-51] <!-- C-220 -->
- **B-221** The damper adds `cx × w × vsx` to `fx` and subtracts `cy × w × vy` from `fy`. The force then scales down to `D` when it exceeds `D`. [src/kits/vehicle/tire.js:52-55] <!-- C-221 -->
- **B-222** `tireStep` writes `fx`, `fy`, `rho`, `kappa` and `alpha` (the atan of the lateral slip, in rad) into the `out` object of the caller. `tireStep` returns that object and allocates nothing. [src/kits/vehicle/tire.js:3; src/kits/vehicle/tire.js:29-30; src/kits/vehicle/tire.js:56-57] <!-- C-222 -->

### Vehicle kit: powertrain
- **B-223** `createPowertrain` and `ENGINE_PRESETS` live in `src/kits/vehicle/powertrain.js`. `src/kits/vehicle/sim.js` re-exports both. [src/kits/vehicle/powertrain.js:13; src/kits/vehicle/powertrain.js:23; src/kits/vehicle/sim.js:10] <!-- C-223 -->
- **B-224** The `engine` option is a preset name or an engine object. An unknown name throws `powertrain: unknown engine '<engine>' (i4, flat4, i6, v8x, v8f, v12, vtwin)`. [src/kits/vehicle/powertrain.js:25-26; test/kits/powertrain.test.mjs:79] <!-- C-225 -->
- **B-225** A `turbo` option makes a frozen `{ maxBoost, size, bov }` with the defaults 1, 0.4 and true. An empty object enables the turbo. A null or falsy `turbo` gives `pt.turbo` null and no turbo model. The code checks no turbo value. [src/kits/vehicle/powertrain.js:27-31] <!-- C-229 -->
- **B-226** `start()` sets `starter` to true, `crankT` to 0 and `stalled` to false only when the engine is not running and the starter is off. `start()` returns the powertrain. [src/kits/vehicle/powertrain.js:76] <!-- C-232 -->
- **B-227** `stop()` sets `running` and `starter` to false and returns the powertrain. [src/kits/vehicle/powertrain.js:77] <!-- C-233 -->
- **B-228** `shift(g)` needs an integer from -1 to the number of gears. A gear that differs from the current gear sets the gear and starts a shift of `shiftTime` seconds. [src/kits/vehicle/powertrain.js:78-82; test/kits/powertrain.test.mjs:84] <!-- C-234 -->
- **B-229** The gear ratio in `step()` is 0 during a shift and in gear 0. The ratio is `-reverse × final` in gear -1 and `gears[g - 1] × final` in a forward gear. [src/kits/vehicle/powertrain.js:87] <!-- C-236 -->
- **B-230** `step(dt, wheelOmega = 0)` returns the drive torque in N m for the driven wheels together. The `wheelOmega` value is the mean spin of the driven wheels in rad/s, with + as forward. [src/kits/vehicle/powertrain.js:83-85; src/kits/vehicle/powertrain.js:100] <!-- C-237 -->
- **B-231** `step` runs `max(1, ceil(dt / 0.002))` engine substeps with a 1e-9 tolerance. Each substep lasts `dt` divided by the count. [src/kits/vehicle/powertrain.js:6; src/kits/vehicle/powertrain.js:95-97] <!-- C-239 -->
- **B-232** When the gear ratio is not 0, the clutch slip is the engine rpm minus the wheel rpm seen through the gear ratio. The clutch is launching when that wheel rpm is below the idle rpm of the engine. [src/kits/vehicle/powertrain.js:89-90] <!-- C-240 -->
- **B-233** While launching, the clutch engagement is `clamp((rpm - 0.9 × idle) / 600, 0, 1)`. Otherwise the engagement is 1. [src/kits/vehicle/powertrain.js:91] <!-- C-241 -->
- **B-234** The clutch capacity is the smaller of two values. One value is 1.6 × the torque of the engine. The other is `|slip| / (60 / (2π) × dt × (G² / wheelInertia + 1 / engine inertia))`. Here `G` is the gear ratio. [src/kits/vehicle/powertrain.js:92] <!-- C-242 -->
- **B-235** The clutch torque is the slip times 0.6 N m per rpm while launching, and times 8 otherwise. The kit limits the torque to plus or minus the capacity and scales it by the engagement. The torque stays the same for all substeps of the step. [src/kits/vehicle/powertrain.js:93; src/kits/vehicle/powertrain.js:96-97] <!-- C-243 -->
- **B-236** After the substeps, `step` lowers the shift timer by `dt` to a floor of 0. Then `step` sets `wheelTorque` to the clutch torque times the gear ratio and returns it. [src/kits/vehicle/powertrain.js:98-100] <!-- C-244 -->
- **B-237** Each substep reads the `throttle` property clamped to 0..1. The throttle is 0 while a shift timer runs. [src/kits/vehicle/powertrain.js:52] <!-- C-245 -->
- **B-238** While the starter runs, the crank timer grows by the substep. The engine counts as running once the timer passes 0.55 s with rpm above 150. The starter releases when the engine runs above 0.7 × idle rpm or the timer passes 4 s. [src/kits/vehicle/powertrain.js:53; test/kits/powertrain.test.mjs:30] <!-- C-246 -->
- **B-239** While the engine runs, the idle air is `clamp(0.05 + (idle - rpm) × 0.00015, 0, 0.14)`. Otherwise the idle air is 0. The effective throttle is the larger of the throttle and the idle air. `state.thrEff` holds the throttle without idle air. [src/kits/vehicle/powertrain.js:54-55] <!-- C-247 -->
- **B-240** The manifold pressure `map` moves toward `(1 + boost) × clamp(area / sqrt(area² + q²), 0.18, 1)`. The fraction per substep is `min(1, h / 0.06)`. Here `area = 0.012 + thrEff^1.6` and `q = 6.5e-5 × max(rpm, 1)`. [src/kits/vehicle/powertrain.js:56-57; test/kits/powertrain.test.mjs:15] <!-- C-248 -->
- **B-241** While running, fuel cut starts when the throttle is below 0.02 and rpm is above idle + 500. Fuel cut ends when the throttle is 0.03 or more, or rpm is below idle + 250. [src/kits/vehicle/powertrain.js:58-60; test/kits/powertrain.test.mjs:25] <!-- C-249 -->
- **B-242** While running, the rev limiter turns on above the limiter rpm and off below the limiter rpm minus 250. When the engine is not running, fuel cut and limiter are false. [src/kits/vehicle/powertrain.js:61-62; test/kits/powertrain.test.mjs:20] <!-- C-250 -->
- **B-243** The afterfire window `popWin` is set to 1 when fuel cut starts above 2500 rpm. The value stays 0 while the throttle is above 0.05, and otherwise decays by `h / 1.8` to a floor of 0. [src/kits/vehicle/powertrain.js:59; src/kits/vehicle/powertrain.js:63; test/kits/powertrain.test.mjs:25] <!-- C-251 -->
- **B-244** The combustion torque is the torque curve times `max(0, (map - 0.15) / 0.85)`, times 0.15 while the limiter is on. The torque is 0 without combustion. The curve is `torque × clamp(1 - 1.3 × ((rpm - peakRpm) / redline)², 0.35, 1)`. [src/kits/vehicle/powertrain.js:64-66] <!-- C-252 -->
- **B-245** The friction torque is 0 at rpm 1 or below. Otherwise it is `torque × (0.04 + 0.08 × rpm / redline)` plus `torque × 0.15 × max(0, 1 - map) × min(1, rpm / 1000)`. The starter torque is `torque × 0.6 × max(0, 1 - rpm / 320)`. [src/kits/vehicle/powertrain.js:67-68] <!-- C-253 -->
- **B-246** Each substep sets rpm to `max(0, rpm + (combustion + starter - friction - clutch torque) / inertia × 60 / (2π) × h)`. A running engine below 220 rpm without the starter stalls. [src/kits/vehicle/powertrain.js:6; src/kits/vehicle/powertrain.js:71-72] <!-- C-254 -->
- **B-247** With a turbo, the shaft target is `clamp((1.25 × flow)^1.4, 0, 1) × (1 - 0.45 × wastegate)`. The time constant is `0.35 + 1.8 × size` when the target is above the shaft, and `1 + 1.5 × size` otherwise. The shaft moves by `min(1, h / tau)`. [src/kits/vehicle/powertrain.js:38-43] <!-- C-255 -->
- **B-248** The turbo flow is `(rpm / redline) × map × (1 if combusting, else 0.3) × (1.35 - 0.5 × size)`. The compressor pressure is `1.35 × maxBoost × shaft²`. The wastegate opening is `clamp((comp - maxBoost) / (0.35 × maxBoost), 0, 1)`. [src/kits/vehicle/powertrain.js:38-39] <!-- C-256 -->
- **B-249** The shaft time constant halves while a blow-off vent runs on a turbo without a blow-off valve and the target is below the shaft. [src/kits/vehicle/powertrain.js:42] <!-- C-257 -->
- **B-250** The boost target is `min(compressor pressure, maxBoost)` while the effective throttle is above 0.12, and 0 otherwise. The time constant is 0.12 s while on. While off it is 0.06 s when a valve vents, 0.5 s when a vent runs without a valve, else 0.35 s. [src/kits/vehicle/powertrain.js:44-45; test/kits/powertrain.test.mjs:35] <!-- C-258 -->
- **B-251** A blow-off event fires when three conditions hold. The slow throttle (time constant 0.2 s) minus the effective throttle exceeds 0.3. The boost exceeds 0.15. The 0.6 s cooldown is over. The event adds 1 to `bovId`. [src/kits/vehicle/powertrain.js:46-48; test/kits/powertrain.test.mjs:35] <!-- C-259 -->
- **B-252** A blow-off event sets `bovAmp` to `clamp(boost / 1.2, 0.2, 1.3)` and `bovMode` to 1 with a valve and 0 without. The event sets the cooldown to 0.6 s and the vent time to 0.4 s. [src/kits/vehicle/powertrain.js:48] <!-- C-260 -->
- **B-253** Without a turbo, the shaft decays with `min(1, h / 1.2)` and boost decays with `min(1, h / 0.2)`. The wastegate is 0 and the slow throttle follows the effective throttle. [src/kits/vehicle/powertrain.js:70] <!-- C-261 -->
- **B-254** The powertrain is sim-pure with no randomness or clock. The powertrain passes substep inputs through one object, so no number is boxed per call. A test measures under 64 bytes per step. [src/kits/vehicle/powertrain.js:1-5; src/kits/vehicle/powertrain.js:34-35; test/kits/powertrain.test.mjs:72-77] <!-- C-262 -->
- **B-255** (inferred) The `wheelInertia` option enters only the clutch capacity. The powertrain has no code for a vehicle backend. [src/kits/vehicle/powertrain.js:23-104; docs/spec.md:449] <!-- C-263 -->
- **B-256** In a test, idle settles within 30 rpm of the preset idle 850 with 0.3 to 0.4 bar in the manifold. [test/kits/powertrain.test.mjs:15] <!-- C-264 -->
- **B-257** In a test, full throttle in neutral climbs to between 7150 and 7500 rpm. The limiter toggles at least 3 times and the manifold passes 0.85 bar. [test/kits/powertrain.test.mjs:20] <!-- C-265 -->
- **B-258** In a test, lifting the throttle above 2500 rpm cuts fuel and opens the afterfire window. Idle ends the cut. [test/kits/powertrain.test.mjs:25] <!-- C-266 -->
- **B-259** In a test, `start()` cranks between 200 and 320 rpm at 0.4 s. At 2 s the engine runs and has released the starter near idle. [test/kits/powertrain.test.mjs:30] <!-- C-267 -->
- **B-260** In a test, a turbo builds boost above 0.8 at full throttle and one blow-off fires on the lift. [test/kits/powertrain.test.mjs:35] <!-- C-268 -->
- **B-261** In a test, a fake car drives through the gears with the clutch locked within 300 rpm. A shift gives 0 torque and nothing diverges. [test/kits/powertrain.test.mjs:40] <!-- C-269 -->
- **B-262** In a test on the tire backend, the powertrain pulls the car away through the gears. Two runs give equal results. [test/kits/powertrain.test.mjs:54] <!-- C-270 -->
- **B-263** `ENGINE_PRESETS` is a frozen object of seven frozen presets named `i4`, `flat4`, `i6`, `v8x`, `v8f`, `v12` and `vtwin`. The `angles`, `banks` and `header` arrays of each preset are frozen. [src/kits/vehicle/powertrain.js:9-10; src/kits/vehicle/powertrain.js:13-21; test/kits/powertrain.test.mjs:86] <!-- C-271 -->

### Engine synthesizer (EngineDSP)
- **B-264** `EngineDSP` names nothing outside itself, so `createDsp` can run it from its own source text in an AudioWorklet. The source of `EngineDSP` holds no `Math.random`. [src/kits/vehicle/engineDsp.js:1-5; test/kits/engine-dsp.test.mjs:50] <!-- C-280 -->
- **B-265** The `EngineDSP` constructor takes the sample rate `sr` and the options `{ seed = 1 }`. The constructor keeps the seed as `(seed >>> 0) || 1`. [src/kits/vehicle/engineDsp.js:23-24] <!-- C-281 -->
- **B-266** The constructor loads the engine layout of the `i4` preset with `pulseDeg` 230, `gain` 1 and `stereo` 0. A synth works before any engine message. [src/kits/vehicle/engineDsp.js:44] <!-- C-284 -->
- **B-267** `EngineDSP` draws noise from a per-instance mulberry32 PRNG seeded by `options.seed`. The same seed renders the same samples and another seed differs. [src/kits/vehicle/engineDsp.js:2; src/kits/vehicle/engineDsp.js:46; test/kits/engine-dsp.test.mjs:41] <!-- C-285 -->
- **B-268** `setParams(m)` calls `setEngine(m)` when `m.type` is `engine`. Otherwise `setParams(m)` copies every key of `m` into the parameter frame. [src/kits/vehicle/engineDsp.js:47] <!-- C-286 -->
- **B-269** `setEngine(e)` stores the firing angles as `((a mod 720) + 720) mod 720 / 720` and copies `banks` and `header`. The method keeps `pulseDeg`, `gain` and `stereo` and builds per-cylinder variations `cylVar` and `durVar` from fixed sine hashes. [src/kits/vehicle/engineDsp.js:48-57] <!-- C-287 -->
- **B-270** With `n` cylinders, `cylVar` is `1 + 0.16 × (frac(sin((i + 1) × 12.9898 + n × 78.233) × 43758.5453) - 0.5)`. The `durVar` value is `1 + 0.12 × (frac(sin((i + 1) × 39.346 + n × 11.135) × 24634.6345) - 0.5)`. [src/kits/vehicle/engineDsp.js:49-54] <!-- C-288 -->
- **B-271** `engineConfig(s)` returns `{ type: 'engine', angles, banks, header, pulseDeg, gain, stereo }` taken from a preset or engine object. [src/kits/vehicle/engineDsp.js:229-230; test/kits/engine-dsp.test.mjs:59] <!-- C-289 -->
- **B-272** The biquad `set()` clamps the frequency to 10 Hz up to 0.45 × `sr`. The function builds a low-pass for type 0, a band-pass for type 1 and a peaking filter for any other type. The `run()` function applies the filter in Direct Form I. [src/kits/vehicle/engineDsp.js:12-21] <!-- C-292 -->
- **B-273** `render(L, R, n)` works in blocks of 64 samples. The method recomputes the filters that depend on state at the start of each block. [src/kits/vehicle/engineDsp.js:83-107] <!-- C-293 -->
- **B-274** When `R` is absent, `render` writes the mean of the left and right sample to `L`. [src/kits/vehicle/engineDsp.js:223] <!-- C-294 -->
- **B-275** When `on` is 0 and the output gate is below 1e-4, a block sets the gate to 0. The block writes zeros to `L` and `R` and skips the model. [src/kits/vehicle/engineDsp.js:3; src/kits/vehicle/engineDsp.js:88; test/kits/engine-dsp.test.mjs:45] <!-- C-295 -->
- **B-276** With `on` 0 the output gate fades with a 150 ms time constant. The output is exact zeros after about 1.4 s. [src/kits/vehicle/engineDsp.js:85; src/kits/vehicle/engineDsp.js:111; test/kits/engine-dsp.test.mjs:45] <!-- C-296 -->
- **B-277** Per sample, `rpm`, `charge`, `throttle`, `shaft`, `boostN` and `wg` follow their frame values with a 12 ms time constant. [src/kits/vehicle/engineDsp.js:85; src/kits/vehicle/engineDsp.js:109-110] <!-- C-297 -->
- **B-278** Per block, the muffler cutoff is `MUF[muffler] × (1 - 0.35 × turbo)` Hz. The brightness is `BRIGHT[muffler] × (1 - 0.4 × turbo)`. Each bank gets low-pass stages at the cutoff (Q 0.65) and at 1.6 × the cutoff (Q 0.6). [src/kits/vehicle/engineDsp.js:89-94] <!-- C-298 -->
- **B-279** Per block, each bank gets a peaking filter at `210 / max(0.6, pipe)` Hz, times 0.96 on bank 1. The filter has Q 1.4 and the gain `BODY_DB[muffler]` dB. [src/kits/vehicle/engineDsp.js:95] <!-- C-299 -->
- **B-280** Per block, the intake resonance is a band-pass at `120 + 0.025 × rpm` Hz (Q 2.5). The intake roar is a band-pass at `650 + 0.08 × rpm` Hz (Q 1.1). The turbo whoosh is a band-pass at `1800 + 2800 × shaft` Hz (Q 0.9). The wastegate filter is a band-pass at 2600 Hz (Q 0.7). [src/kits/vehicle/engineDsp.js:97-100] <!-- C-300 -->
- **B-281** Per block, the blow-off filter is a band-pass at `900 + 3000 × exp(-5 × bovT)` Hz (Q 1.2) in valve mode. In flutter mode it is a band-pass at `1250 + 300 × exp(-3 × bovT)` Hz (Q 1.4). [src/kits/vehicle/engineDsp.js:101-102] <!-- C-301 -->
- **B-282** The listening position row is `MIC[mic]`. An unknown `mic` value uses the behind row. The exhaust low-pass coefficient is `1 - exp(-2π × exLP / sr)`. When the row has `cab` set, each channel gets a cabin low-pass at 750 Hz (Q 0.75). [src/kits/vehicle/engineDsp.js:103-105] <!-- C-302 -->
- **B-283** The waveguide target length is `2 × pipe / 480 × sr` samples for bank 0. For bank 1 the length is `2 × pipe × 1.035 / 480 × sr` samples. [src/kits/vehicle/engineDsp.js:106] <!-- C-303 -->
- **B-284** The constructor sets seven fixed filters. The table in the Data and state section lists them. [src/kits/vehicle/engineDsp.js:40-43] <!-- C-304 -->
- **B-285** A starter gate follows the starter flag with a 30 ms time constant. A rising starter flag sets the clunk to 1. [src/kits/vehicle/engineDsp.js:85; src/kits/vehicle/engineDsp.js:115-117] <!-- C-305 -->
- **B-286** The cranking depth follows `0.38 × clamp(1 - rpm / 520, 0, 1)` while the starter runs, and 0 otherwise, with a 30 ms time constant. [src/kits/vehicle/engineDsp.js:118] <!-- C-306 -->
- **B-287** While the cranking depth is above 1e-4, the load is `min(1, sum of exp(-q²))` over the cylinders. Here `q = wrap(phase - (angle - 0.03)) / 0.065`. The crank speed is `rpm × (1 - depth × load)`. Otherwise the load is 0. [src/kits/vehicle/engineDsp.js:119-123] <!-- C-307 -->
- **B-288** The crank phase advances by `speed / 120 / sr` per sample. A cylinder fires when the phase crosses its angle. The synth handles both sides when the phase wraps past 1. [src/kits/vehicle/engineDsp.js:124-127] <!-- C-308 -->
- **B-289** Without a wrap, the synth fires cylinders only while rpm is above 1. [src/kits/vehicle/engineDsp.js:126] <!-- C-309 -->
- **B-290** A firing cylinder starts with the amplitude `charge^0.75 × cylVar`. The amplitude then multiplies by `1 + cv × (2 × U01 - 1)`. Here `U01` is a random number from 0 up to 1 and `cv = 0.05 + 0.25 × max(0, 1 - charge)`. [src/kits/vehicle/engineDsp.js:60-62] <!-- C-310 -->
- **B-291** A cycle burns unless `fuelCut` is above 0.5. While the limiter is on, a burning cycle is cut with probability 0.65. [src/kits/vehicle/engineDsp.js:63-64] <!-- C-311 -->
- **B-292** For a cycle that does not burn, the synth checks three cases in order. While cranking, the amplitude multiplies by 0.55. Else, on fuel cut, the amplitude is `0.65 × (0.24 + 0.3 × min(1, rpm / 6000)) × cylVar × (0.9 + 0.2 × U01) × mixOv`. Otherwise the amplitude multiplies by 0.2. [src/kits/vehicle/engineDsp.js:65-68] <!-- C-312 -->
- **B-293** While cranking, a cycle that does not burn also sets the block thump to at least `0.7 + 0.3 × U01`. [src/kits/vehicle/engineDsp.js:69] <!-- C-313 -->
- **B-294** On a cycle that does not burn, a pop happens only when `pops` and `on` are set. The probability is 0.3 with the limiter on, else `0.2 × popWin`. A pop sets the amplitude to `0.7 + 1.3 × U01`. [src/kits/vehicle/engineDsp.js:70-71] <!-- C-314 -->
- **B-295** A firing cylinder takes the first free voice from the pool of 48. When no voice is free, the synth drops the event and skips the pop crackle and the valve tick of that cycle. [src/kits/vehicle/engineDsp.js:73-74] <!-- C-315 -->
- **B-296** A voice gets the duration `max(24, pulseDeg × durVar / (6 × max(60, rpm)) × sr)` samples, halved for a pop. The rise fraction is `clamp(0.0016 × sr / duration, 0.04, 0.3)`. [src/kits/vehicle/engineDsp.js:75-76] <!-- C-316 -->
- **B-297** A voice gets the amplitude times `gain` and the bank of its cylinder. The delay is `floor(header × 0.001 × sr + U01 × 0.00012 × sr)` samples. The rasp is 1.4 for a pop, else `0.7 × min(1, rpm / 6000 × charge)^0.7`. [src/kits/vehicle/engineDsp.js:77-79] <!-- C-317 -->
- **B-298** A pop arms the crackle of its bank to at least `0.5 + 0.7 × U01`. Each firing that gets a voice sets the valve tick with `clk` 1 and `clkA` `0.6 + 0.4 × U01`. [src/kits/vehicle/engineDsp.js:80-81] <!-- C-318 -->
- **B-299** Each active voice waits out its delay and ends when `x = t / duration` reaches 1. The voice adds `y × amplitude` to the pressure of its bank. Here `y = u × e^(1-u) × (1 - x)` and `u = x / rise`. The voice adds the same value times rasp to the turbulence of the bank. [src/kits/vehicle/engineDsp.js:129-137] <!-- C-319 -->
- **B-300** While the crackle of a bank is above 1e-3, the bank gets `0.5 × crackle × (2 × U01 - 1)` of noise. With probability 0.006 it also gets a spike of `2.2 × crackle` with random sign. The crackle decays with a 40 ms time constant. [src/kits/vehicle/engineDsp.js:139-141] <!-- C-320 -->
- **B-301** Per bank, the exhaust chain blocks DC with the factor 0.997 and adds `bright × 6 ×` the difference of the signal. The signal then passes a delay line whose length moves toward its target by 0.0005 per sample. [src/kits/vehicle/engineDsp.js:147-153] <!-- C-321 -->
- **B-302** The delay line reads with linear interpolation and low-passes the reflection with the coefficient 0.42. The chain subtracts 0.5 × the reflection from the signal and writes the signal at the shared write index. [src/kits/vehicle/engineDsp.js:151-155] <!-- C-322 -->
- **B-303** After the delay line, the chain adds flow turbulence. The turbulence is noise through the coefficients 0.2 and 0.035, scaled by the bank turbulence envelope (coefficient 0.02) and 1.6. The order keeps the turbulence from ringing the pipe modes. [src/kits/vehicle/engineDsp.js:156-159] <!-- C-323 -->
- **B-304** Then the signal runs through both muffler stages and the chamber filter. A `tanh` saturation follows with `tanh(0.45 × drive × y)`, where `drive = 1.1 + 1.4 × min(1.6, charge)`. A one-pole low-pass at the `exLP` coefficient ends the chain. [src/kits/vehicle/engineDsp.js:144; src/kits/vehicle/engineDsp.js:160-163] <!-- C-324 -->
- **B-305** The intake layer is the intake resonance of the high-passed pulse sum times `(0.25 + 0.75 × throttle) × 0.8`. The layer adds the roar noise × envelope × throttle × `min(1, rpm / 3500)` × 2.2. [src/kits/vehicle/engineDsp.js:167-171] <!-- C-325 -->
- **B-306** The intake layer adds closed-throttle hiss. The hiss is noise × `max(0, 1 - charge)` × `(1 - throttle)` × `min(1, rpm / 5000)` × 0.12 × `mixOv`. [src/kits/vehicle/engineDsp.js:172-173] <!-- C-326 -->
- **B-307** The mechanical layer has a valve tick. The tick is noise × `clk` × `clkA` through two metallic resonances, times `0.2 / (1 + rpm / 2500)`. The `clk` value decays by 0.96 per sample. [src/kits/vehicle/engineDsp.js:175-177] <!-- C-327 -->
- **B-308** The mechanical layer adds engine body rumble and whir whenever the engine spins. The value is `(1.6 × low-passed noise + 0.12 × a sine at 21 cycles per crank turn) × min(1.4, rpm / 6000)^1.3 × 0.35`. [src/kits/vehicle/engineDsp.js:178-181] <!-- C-328 -->
- **B-309** While the starter gate is above 1e-3, the starter layer has three parts. The parts are a growl at 11 × the crank rate, a ring-gear mesh tone and a commutator noise. The layer multiplies the parts by the gate and by the overrunning-clutch factor `clamp((380 - rpm) / 80, 0, 1)`. [src/kits/vehicle/engineDsp.js:182-196] <!-- C-329 -->
- **B-310** The starter layer adds a clunk and a thump while each is above 1e-3. The clunk is noise through the 850 Hz band-pass plus a sine, with a 14 ms decay. The thump is a 34 Hz sine with a 60 ms decay. [src/kits/vehicle/engineDsp.js:85; src/kits/vehicle/engineDsp.js:197-198] <!-- C-330 -->
- **B-311** When the `turbo` flag is set, the turbo layer is a whine, a whoosh and a wastegate hiss. The whine is a sine at `380 + 4400 × shaft` Hz plus a second harmonic. [src/kits/vehicle/engineDsp.js:200-207] <!-- C-331 -->
- **B-312** When `bovId` changes, the synth starts a blow-off event with the amplitude and mode of the frame. The event plays even if the `turbo` flag is 0. [src/kits/vehicle/engineDsp.js:208-214] <!-- C-332 -->
- **B-313** A blow-off event lasts 2.5 s. In valve mode the event is noise through the blow-off filter with a 0.28 s decay. In flutter mode the event is noise gated by a sine with a 0.45 s decay. The sine starts at 24 Hz and falls by 45 percent over 1 s. [src/kits/vehicle/engineDsp.js:209-214] <!-- C-333 -->
- **B-314** The center signal is the sum of four terms. The terms are `intake × int × mixIn`, `mech × mech × mixMe`, `turbo × tur × mixTu` and `starter × st × mixSt`. The exhaust gain is `exh × mixEx`. [src/kits/vehicle/engineDsp.js:216-217] <!-- C-334 -->
- **B-315** With a stereo engine, left is `(0.82 × e0 + 0.3 × e1) × exhaust gain + center`. Right is `(0.82 × e1 + 0.3 × e0) × exhaust gain + center`. [src/kits/vehicle/engineDsp.js:218] <!-- C-335 -->
- **B-316** With a mono engine, left and right are both `0.62 × (e0 + e1) × exhaust gain + center`. [src/kits/vehicle/engineDsp.js:219] <!-- C-336 -->
- **B-317** With the cabin position, each channel passes the cabin low-pass and is multiplied by 1.5. [src/kits/vehicle/engineDsp.js:220] <!-- C-337 -->
- **B-318** The output of each channel is `tanh(x × vol × gate × 1.2)`. [src/kits/vehicle/engineDsp.js:221-223] <!-- C-338 -->
- **B-319** In a test, the levels at idle and on coast at 2000, 4000 and 6000 rpm match the engine-sound spec section 7 targets. The tolerance is 1.5 dB at every listening position. [test/kits/engine-dsp.test.mjs:23-31] <!-- C-339 -->
- **B-320** In a test, every preset at every listening position stays finite within [-1, 1]. The test covers idle, the limiter, coast, boost and cranking. [test/kits/engine-dsp.test.mjs:32-40] <!-- C-340 -->
- **B-321** A test runs `EngineDSP` from its own source as a worklet processor and gets finite non-silent output. [test/kits/engine-dsp.test.mjs:50-58] <!-- C-341 -->

### Engine sound (view half)
- **B-322** The frame `pipe` is the `pipe` option, else `pt.spec.pipe`, else 2.1. The frame `muffler` is the index of the `muffler` option. [src/kits/vehicle/view.js:25] <!-- C-352 -->
- **B-323** `setMic` sets the frame `mic` and sets each mix field to `10^((dB of the position + mix entry or 0) / 20)`. The `mix` option adds dB on top of the position balance. [src/kits/vehicle/view.js:3-4; src/kits/vehicle/view.js:27-31; test/kits/vehicle-sound.test.mjs:21] <!-- C-353 -->
- **B-324** `createEngineSound` applies the `mic` option at creation. `mic(name)` applies a new position, rewrites the `mic` and mix fields and returns the sound object. [src/kits/vehicle/view.js:32; src/kits/vehicle/view.js:50; test/kits/vehicle-sound.test.mjs:21] <!-- C-354 -->
- **B-325** `createEngineSound` builds no synth when called. The function registers a callback with `audio.onUnlock` that builds the synth after the audio unlock. [src/kits/vehicle/view.js:36-38; test/kits/vehicle-sound.test.mjs:12-14] <!-- C-355 -->
- **B-326** After the unlock, `createEngineSound` calls `createDsp(audio, { name: 'lh-engine', Class: EngineDSP, options: { seed } })`. [src/kits/vehicle/view.js:38] <!-- C-356 -->
- **B-327** When `createDsp` succeeds and the sound is not disposed, `createEngineSound` makes a voice with `audio.voice({ bus, follow })`. Then the function connects the synth node to the voice input. Next the function sends `engineConfig(pt.spec)` as the first message and resolves `ready` with the sound object. [src/kits/vehicle/view.js:39-42; test/kits/vehicle-sound.test.mjs:12-19] <!-- C-357 -->
- **B-328** If `audio.voice` returns no voice, `createEngineSound` disposes the synth and rejects `ready` with `audio stopped before the synth was ready`. [src/kits/vehicle/view.js:41] <!-- C-358 -->
- **B-329** If `createDsp` rejects, `ready` rejects with the same error. If the sound was disposed first, `createEngineSound` disposes the new synth. [src/kits/vehicle/view.js:38-39; src/kits/vehicle/view.js:43] <!-- C-359 -->
- **B-330** A catch on `ready` logs `engine sound:` and the error with `console.error`. A game that never awaits `ready` still hears of a failure. [src/kits/vehicle/view.js:34-35] <!-- C-360 -->
- **B-331** The `mode` getter returns the mode of the synth (`worklet` or `script`), or null before the synth exists. The `voice` and `dsp` getters return the voice and the synth, or null. [src/kits/vehicle/view.js:47-49; test/kits/vehicle-sound.test.mjs:12-17] <!-- C-361 -->
- **B-332** `update()` does nothing before the synth exists. [src/kits/vehicle/view.js:52; test/kits/vehicle-sound.test.mjs:14] <!-- C-362 -->
- **B-333** `update()` copies the powertrain state to the frame. The frame gets `rpm`, `charge` from `map`, `throttle` from `thrEff`, `popWin`, `shaft`, `wg`, `bovId`, `bovAmp` and `bovMode`. The `limiter` and `starter` fields become 1 or 0, and `boostN` is `boost / 1.5`. [src/kits/vehicle/view.js:53-56; test/kits/vehicle-sound.test.mjs:21] <!-- C-363 -->
- **B-334** `update()` sets the frame `fuelCut` to 0 when the engine is running and not in fuel cut, else 1. [src/kits/vehicle/view.js:54; test/kits/vehicle-sound.test.mjs:33] <!-- C-364 -->
- **B-335** `update()` sets the frame `on` to 1 only when rpm is above 25 or the starter runs, and the voice is audible. A voice beyond `positional.cull` sends `on` 0. [src/kits/vehicle/view.js:3-4; src/kits/vehicle/view.js:56; test/kits/vehicle-sound.test.mjs:33] <!-- C-365 -->
- **B-336** `update()` sends the same frame object to the synth on each call. [src/kits/vehicle/view.js:1-2; src/kits/vehicle/view.js:57; test/kits/vehicle-sound.test.mjs:21] <!-- C-366 -->
- **B-337** `update()` never writes the frame fields `pops`, `turbo`, `vol`, `pipe` and `muffler`. The values of those fields stay as set at creation. [src/kits/vehicle/view.js:24-26; src/kits/vehicle/view.js:53-56] <!-- C-367 -->
- **B-338** `dispose()` runs once. The call stops the unlock subscription, disposes the synth and stops the voice. A second call does nothing. [src/kits/vehicle/view.js:59; test/kits/vehicle-sound.test.mjs:43-46] <!-- C-368 -->
- **B-339** If `dispose()` runs before the unlock, the unlock callback builds nothing and `mode` stays null. [src/kits/vehicle/view.js:36-37; test/kits/vehicle-sound.test.mjs:47-48] <!-- C-369 -->
- **B-340** Without AudioWorklet, the synth runs in a ScriptProcessor with mode `script`. `createDsp` warns that the synth runs on the main thread. [src/view/audio/dsp.js:18; test/kits/vehicle-sound.test.mjs:50-53] <!-- C-370 -->
- **B-341** In a minified browser bundle in Chromium, a powertrain with the `v8x` preset at full throttle gives mode `worklet` and no non-finite samples. The rms at the master is above 0.02 and rpm is above 2000. [test/engine-sound-e2e.test.mjs:42-53] <!-- C-371 -->
- **B-342** `src/kits/vehicle/sim.js` re-exports only `createPowertrain` and `ENGINE_PRESETS` from the powertrain files. A game imports `createEngineSound` and `EngineDSP` from the view and `engineDsp` files. [src/kits/vehicle/sim.js:10; src/kits/vehicle/view.js:6] <!-- C-372 -->
- **B-343** In a test, the synth node connects to the voice input. The first message to the synth equals `engineConfig(pt.spec)`. [test/kits/vehicle-sound.test.mjs:12-19] <!-- C-373 -->
- **B-344** In a test, a stopped engine sends `fuelCut` 1 and `on` 0. [test/kits/vehicle-sound.test.mjs:33-36] <!-- C-374 -->

## Data and state

### Material blocks
| Block | Fields and ranges | Evidence |
| --- | --- | --- |
| Top-level keys | `extends`, `look`, `phys`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `fluid`, `sound`, `fx`, `game`. Every block is optional. | [src/defs/materials.js:41-61] <!-- C-430 --> |
| `look` colours | `color`, `sheenColor`, `emissive`: `#rgb`, `#rrggbb` or an integer 0..0xffffff | [src/defs/materials.js:29; src/defs/materials.js:44-46] <!-- C-431 --> |
| `look` unit values | `metalness`, `roughness`, `clearcoat`, `clearcoatRoughness`, `sheen`, `sheenRoughness`, `transmission`, `opacity`: 0..1 | [src/defs/materials.js:44-46] <!-- C-432 --> |
| `look` other | `ior` 1..2.333, `thickness` >= 0, `emissiveIntensity` >= 0, `transparent` boolean, `flatShading` boolean, `side` `front` or `double` | [src/defs/materials.js:45-46] <!-- C-433 --> |
| `look.subsurface` | `color`, `strength` 0..1 | [src/defs/materials.js:47] <!-- C-434 --> |
| `look.fur` | `length` 0.001..1, `shells` integer 1..32, `density` > 0, `tint` colour | [src/defs/materials.js:48] <!-- C-435 --> |
| `look.wear` | plain JSON data. The code accepts and ignores it in phase 3. | [src/defs/materials.js:49] <!-- C-436 --> |
| `phys` | `friction` 0..2, `restitution` 0..1, `sg` > 0, `fill` in (0, 1] | [src/defs/materials.js:24; src/defs/materials.js:51] <!-- C-437 --> |
| `tire` | `mu` >= 0, `C` > 0, `kp` > 0, `ap` > 0, `crr` >= 0, `drag` >= 0 | [src/defs/materials.js:40] <!-- C-438 --> |
| `dirtRate` | number >= 0 | [src/defs/materials.js:53] <!-- C-439 --> |
| `coverage` | `dirt`, `rust`, `snow`, `mud`, each 0..1 | [src/defs/materials.js:54] <!-- C-440 --> |
| `aero` | `skin` >= 0, `airfoil` `{ cl, cd, stall }`. A `cl` or `cd` curve needs at least 2 `[angle, value]` pairs of finite numbers. `stall` 0..90. | [src/defs/materials.js:30; src/defs/materials.js:55] <!-- C-441 --> |
| `magnet` | `strength` >= 0, `ferrous` 0..1 | [src/defs/materials.js:56] <!-- C-442 --> |
| `fluid` | `density` > 0, `viscosity` >= 0 | [src/defs/materials.js:57] <!-- C-443 --> |
| `sound`, `fx` | non-empty strings | [src/defs/materials.js:27; src/defs/materials.js:58-59] <!-- C-444 --> |
| `game` | plain JSON data. No schema check applies inside it. | [src/defs/materials.js:60] <!-- C-445 --> |
| Pair entry | `friction` 0..2, `restitution` 0..1, `tire`, `sound`, `fx` | [src/defs/materials.js:63] <!-- C-446 --> |

### Base library
- The base materials gravel, grass, dirt, mud, asphalt, snow and ice carry `tire` data and a `dirtRate`. Their `tire` values follow the usual racing surface names. Asphalt is tarmac, dirt is hardpack and snow is packed snow. [src/defs/materials.base.js:3-4; src/defs/materials.base.js:63-111; test/materials-base.test.mjs:15] <!-- C-447 -->
- The base `dirtRate` values are gravel 0.006, grass 0.002, dirt 0.01, mud 0.03, asphalt 0, snow 0.004 and ice 0. [src/defs/materials.base.js:67; src/defs/materials.base.js:74; src/defs/materials.base.js:81; src/defs/materials.base.js:88; src/defs/materials.base.js:95; src/defs/materials.base.js:102; src/defs/materials.base.js:109] <!-- C-448 -->
- The base materials water and air have a `fluid` block and no `phys` block, so their collider density is 0. All other base materials have `phys` with `friction`, `restitution` and `sg`. [src/defs/materials.base.js:4; src/defs/materials.base.js:112-119; test/materials-base.test.mjs:33] <!-- C-449 -->
- The base `coverage` blocks differ per material. Steel accepts dirt, rust, mud and snow. Glass, mud, snow, water and air have no `coverage` block. [src/defs/materials.base.js:12; src/defs/materials.base.js:34-38; src/defs/materials.base.js:84-90; src/defs/materials.base.js:98-104; src/defs/materials.base.js:112-119] <!-- C-450 -->

### Sidecar shapes
| Shape | Fields besides `shape`, `p`, `q`, `part`, `material` | Evidence |
| --- | --- | --- |
| `box` | `half`, `round` | [src/defs/sidecar.js:6; src/defs/sidecar.js:24-25] <!-- C-451 --> |
| `sphere` | `r` | [src/defs/sidecar.js:24] <!-- C-451 --> |
| `capsule`, `cylinder` | `halfHeight`, `r` | [src/defs/sidecar.js:24] <!-- C-451 --> |
| `hull` | `points` | [src/defs/sidecar.js:24] <!-- C-451 --> |
| `mesh` | `vertices`, `indices` | [src/defs/sidecar.js:24] <!-- C-451 --> |

### Terrain and vehicle state
- `terrain.grid` is a frozen `{ nx, nz, cell, x0, z0, heights, materials }` for the view half. The `heights` value is the `Float32Array` copy. The `materials` value is a `Uint8Array` copy, or null when `materials` is a function. [src/kits/terrain/sim.js:25; src/kits/terrain/sim.js:53; test/kits/terrain.test.mjs:63] <!-- C-452 -->
- `stats` of the terrain mesh holds `chunks`, `builds`, `buildMs`, `lastUpdateMs` and `pending`. Each chunk mesh is named `terrain-chunk`, receives shadows and has `matrixAutoUpdate` false. The group is named `terrain`. [src/kits/terrain/view.js:53; src/kits/terrain/view.js:61; src/kits/terrain/view.js:126] <!-- C-453 -->
- Each `car.wheels` entry of either backend holds `front`, `radius`, `inContact`, `point`, `normal`, `material`, `pair`, `friction`, `suspension`, `steering` and `load`. [src/kits/vehicle/sim.js:93-94; src/kits/vehicle/sim.js:180-181] <!-- C-454 -->
- The wheel `pair` is `registry.pair(tyre, ground)`. The wheel `friction` is the pair friction, or 1 without a pair. [src/kits/vehicle/sim.js:105-106; src/kits/vehicle/sim.js:221-222] <!-- C-455 -->
- Each tire backend wheel entry also holds `omega`, `kappa`, `alpha`, `fx`, `fy` and `surface`. The kit keeps further internal fields on the same entry. [src/kits/vehicle/sim.js:180-184; test/kits/vehicle-tire.test.mjs:53] <!-- C-456 -->
- `GLYPH_FAMILIES` is the key list of `ICONS` in `src/kits/glyphs/icons.js`. `tools/glyphs/build.mjs` generates that file from Kenney Input Prompts 1.5A (CC0). The test names the families xbox, ps, deck, generic, keys, pointer and touch. [src/kits/glyphs/icons.js:1; src/kits/glyphs/view.js:8; test/kits/glyphs.test.mjs:8] <!-- C-457 -->
- The wire encodings and the kind fields are in the Behavior section. [src/defs/fields.js:6-30] <!-- C-62 -->

### Powertrain state
- The powertrain `state` object holds these fields:
  - `rpm`, `map`, `thrEff`, `fuelCut`, `limiter`, `popWin`, `running`, `starter`, `stalled`, `crankT`, `gear`
  - `shiftT`, `shaft`, `boost`, `wg`, `thrSlow`, `bovCool`, `bovVent`, `bovId`, `bovAmp`, `bovMode`, `wheelTorque` [src/kits/vehicle/powertrain.js:32-33] <!-- C-458 -->
- The initial `rpm` is the idle rpm, or 0 when `running` is false. The initial `map` is 0.35, or 1 when `running` is false. [src/kits/vehicle/powertrain.js:32] <!-- C-231 -->
- The initial `bovMode` is 1 with a blow-off valve turbo and 0 otherwise. The initial `gear` is 0 and all other numbers start at 0 or false. [src/kits/vehicle/powertrain.js:32-33] <!-- C-231 -->

### Engine presets
Each preset holds `angles`, `banks`, `header`, `stereo`, `idle`, `redline`, `limiter`, `torque`, `peakRpm`, `inertia`, `pipe`, `pulseDeg` and `gain`. [src/kits/vehicle/powertrain.js:9-10] <!-- C-272 -->

| Preset | angles (degrees) | banks | header (ms) | stereo | idle | redline | limiter | torque | peakRpm | inertia | pipe (m) | pulseDeg | gain | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `i4` | 0, 180, 360, 540 | 0, 1, 0, 1 | 0, 0, 0, 0 | 0 | 850 | 7000 | 7200 | 210 | 4800 | 0.13 | 2.1 | 230 | 1.0 | [src/kits/vehicle/powertrain.js:14] <!-- C-273 --> |
| `flat4` | 0, 180, 360, 540 | 0, 1, 0, 1 | 0, 2.6, 0, 2.6 | 0 | 800 | 6800 | 7000 | 250 | 4200 | 0.14 | 2.3 | 240 | 1.05 | [src/kits/vehicle/powertrain.js:15] <!-- C-274 --> |
| `i6` | every 120 from 0 to 600 | alternating 0, 1 | all 0 | 0 | 750 | 7000 | 7200 | 340 | 4600 | 0.18 | 2.5 | 235 | 0.95 | [src/kits/vehicle/powertrain.js:11; src/kits/vehicle/powertrain.js:16] <!-- C-275 --> |
| `v8x` | every 90 from 0 to 630 | 0, 1, 0, 0, 1, 0, 1, 1 | all 0 | 1 | 650 | 6500 | 6700 | 530 | 4400 | 0.24 | 2.7 | 240 | 1.15 | [src/kits/vehicle/powertrain.js:17; test/kits/powertrain.test.mjs:87] <!-- C-276 --> |
| `v8f` | every 90 from 0 to 630 | alternating 0, 1 | all 0 | 1 | 900 | 8500 | 8700 | 440 | 6200 | 0.16 | 1.9 | 225 | 1.0 | [src/kits/vehicle/powertrain.js:11; src/kits/vehicle/powertrain.js:18] <!-- C-277 --> |
| `v12` | every 60 from 0 to 660 | alternating 0, 1 | all 0 | 1 | 800 | 9000 | 9200 | 620 | 6800 | 0.22 | 2.2 | 220 | 0.85 | [src/kits/vehicle/powertrain.js:11; src/kits/vehicle/powertrain.js:19] <!-- C-278 --> |
| `vtwin` | 0, 405 | 0, 1 | 0, 0.4 | 0 | 900 | 5500 | 5700 | 150 | 3200 | 0.10 | 1.4 | 210 | 1.45 | [src/kits/vehicle/powertrain.js:20] <!-- C-279 --> |

### Synth state
The `EngineDSP` parameter frame starts with these values. [src/kits/vehicle/engineDsp.js:25-27] <!-- C-282 -->

| Field | Initial value |
| --- | --- |
| `rpm`, `throttle`, `popWin`, `shaft`, `boostN`, `wg`, `bovId`, `bovAmp`, `on`, `starter` | 0 |
| `charge` | 0.3 |
| `fuelCut`, `bovMode` | 1 |
| `limiter`, `turbo`, `mic` | 0 |
| `pops` | 1 |
| `vol` | 0.6 |
| `pipe` | 2.1 |
| `muffler` | 1 |
| `mixEx`, `mixOv`, `mixIn`, `mixTu`, `mixMe`, `mixSt` | 1 |

- `EngineDSP` holds a pool of 48 pulse voices and two delay lines of 16384 samples. Both banks write the delay lines at one shared index. [src/kits/vehicle/engineDsp.js:30-31; src/kits/vehicle/engineDsp.js:165] <!-- C-283 -->

The `MIC` table holds one row per listening position. [src/kits/vehicle/engineDsp.js:6-10] <!-- C-290 -->

| Position | `mic` | exh | int | tur | mech | st | exLP (Hz) | cab |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| behind | 0 | 1.0 | 0.22 | 0.5 | 0.3 | 0.45 | 16000 | 0 |
| bay | 1 | 0.32 | 1.0 | 1.15 | 0.75 | 1.0 | 1700 | 0 |
| cabin | 2 | 0.8 | 0.5 | 0.35 | 0.3 | 0.5 | 16000 | 1 |

The muffler tables use the `muffler` value as the index. [src/kits/vehicle/engineDsp.js:11] <!-- C-291 -->

| Muffler | `muffler` | `MUF` (Hz) | `BRIGHT` | `BODY_DB` (dB) |
| --- | --- | --- | --- | --- |
| stock | 0 | 1300 | 0.15 | 5 |
| sport | 1 | 3200 | 0.5 | 3.5 |
| straight | 2 | 7000 | 1.0 | 2 |

The constructor sets these fixed filters. [src/kits/vehicle/engineDsp.js:40-43] <!-- C-304 -->

| Type | Frequency (Hz) | Q |
| --- | --- | --- |
| low-pass (starter growl) | 650 | 0.9 |
| band-pass (hiss) | 2200 | 1.2 |
| low-pass | 1600 | 0.8 |
| band-pass | 1900 | 1.3 |
| band-pass (clunk) | 850 | 2.2 |
| band-pass (valve tick) | 2900 | 9 |
| band-pass (valve tick) | 4700 | 7 |

### Engine sound state
The names map to indexes and frame fields as these tables show.

| Name | Index | Evidence |
| --- | --- | --- |
| `mic` `behind`, `bay`, `cabin` | 0, 1, 2 | [src/kits/vehicle/view.js:8] <!-- C-348 --> |
| `muffler` `stock`, `sport`, `straight` | 0, 1, 2 | [src/kits/vehicle/view.js:9] <!-- C-348 --> |

| Mix name | Frame field | Evidence |
| --- | --- | --- |
| `exhaust` | `mixEx` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |
| `coast` | `mixOv` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |
| `intake` | `mixIn` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |
| `turbo` | `mixTu` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |
| `engineBody` | `mixMe` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |
| `starter` | `mixSt` | [src/kits/vehicle/view.js:16] <!-- C-350 --> |

The mix defaults in dB sit on top of the built-in balance of each position. [src/kits/vehicle/view.js:10-15] <!-- C-349 -->

| Position | exhaust | coast | intake | turbo | engineBody | starter |
| --- | --- | --- | --- | --- | --- | --- |
| behind | 4.1 | 4.1 | 2.7 | 0 | -8.2 | 0 |
| bay | 6.4 | 7.5 | 0 | 3.4 | -4.7 | 8.7 |
| cabin | 6.9 | 9.5 | 3 | 9.5 | -13.6 | 0 |

The frame that `createEngineSound` sends starts with these values. [src/kits/vehicle/view.js:24-26] <!-- C-351 -->

| Field | Initial value |
| --- | --- |
| `rpm`, `throttle`, `popWin`, `shaft`, `boostN`, `wg`, `bovId`, `bovAmp`, `on`, `starter`, `limiter`, `mic` | 0 |
| `charge` | 0.3 |
| `fuelCut`, `bovMode` | 1 |
| `pops` | 1 if the `pops` option is true, else 0 |
| `turbo` | 1 if the powertrain has a turbo, else 0 |
| `vol` | the `volume` option |
| `pipe` | see B-322 |
| `muffler` | the index of the `muffler` option |
| `mixEx`, `mixOv`, `mixIn`, `mixTu`, `mixMe`, `mixSt` | 1 until `setMic` runs, and `setMic` runs at creation |

## Configuration

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `PHYS_DEFAULTS` | friction 0.5, restitution 0, sg 1, fill 1 | The values used when `phys` omits a field. Friction and restitution match Rapier's defaults. | [src/defs/materials.js:7] <!-- C-470 --> |
| `MAX_MATERIALS` | 255 | The most materials in one registry. The limit keeps `index()` inside a `Uint8Array` cell. | [src/defs/materials.js:8; src/defs/materials.js:132] <!-- C-471 --> |
| `TUNE` | `snapAt` 1.5, `nudge` 6, `smoothMs` 150 | Defaults for `kind` option `tune`. | [src/defs/fields.js:32] <!-- C-472 --> |
| `SEND` | `hz` 20, `key` 2 | Defaults for `kind` option `send`. A keyframe goes out every 2 s. | [src/defs/fields.js:33] <!-- C-473 --> |
| `REMOTES`, `FOLLOWS` | `driven`, `proxy`, `view` and `interp`, `forecast` | The allowed values of `remote` and `follow`. | [src/defs/fields.js:31] <!-- C-474 --> |
| `INPUT_BATCH` | 8 | The base count of inputs in a driven record. | [src/defs/fields.js:34] <!-- C-475 --> |
| `INPUT_WIRE_MAX` | 64 | The most inputs one record may carry. | [src/defs/fields.js:35] <!-- C-476 --> |
| `coverageKit` options | `washes` `[]`, `washTime` 1.5, `layer` `coverageLayer` | `materialAt` has no default and is required. | [src/kits/coverage/sim.js:12] <!-- C-477 --> |
| `createParticles` options | `max` 1200, `shape` `cube`, `geometry` null, `material` null, `gravity` 9.8, `drag` 0.5, `floor` null, `bounce` 0, `friction` 1 | Pool and physics settings. | [src/kits/fx/view.js:12-13] <!-- C-478 --> |
| `createMarks` options | `max` 400, `width` 0.45, `length` 0.9, `material` null, `heightAt` null, `lift` 0.06 | Mark settings. The default material is a transparent brown `MeshBasicMaterial` with opacity 0.4. | [src/kits/fx/view.js:86-90] <!-- C-479 --> |
| `createTerrain` options | `nx`, `nz`, `cell`, `x0` 0, `z0` 0, `heights`, `materials`, `blend` null, `material`, `groups`, `fixInternalEdges` false | Heightfield and sampling settings. | [src/kits/terrain/sim.js:10] <!-- C-480 --> |
| `createTerrainMesh` options | `compiler` null, `chunks` `[6, 6]`, `chunkCells` null, `lods` `[1]`, `lodFar` `[]`, `hysteresis` 12, `skirt` 2, `visFar` Infinity, `evict` null, `colorAt` null, `attributes` `{}`, `drop` null, `material` `grass`, `budgetMs` 3, `moveEps` 2, `now` `performance.now` | Chunk, LOD and build settings. | [src/kits/terrain/view.js:31-32] <!-- C-481 --> |
| `createVehicle` options | `wheels`, `rayGroups`, `forward` `x`, `terrain` null, `tyre` `rubber`, `grip` false, `backend` `raycast`, `substeps` `auto` | Vehicle settings. | [src/kits/vehicle/sim.js:58] <!-- C-482 --> |
| `suspension.rest` (in the vehicle spec) | 0.3 | Suspension rest length in metres. Both backends use this default. | [src/kits/vehicle/sim.js:85; src/kits/vehicle/sim.js:176] <!-- C-483 --> |
| `TIRE` | `sigmaX` 0.12 m, `sigmaY` 0.30 m, `loadRef` 3500 N, `loadSens` 0.12, `rhoMax` 4, `lowSpeed` 3 m/s, `apLoad` 0.5 | Frozen parameters that every tire shares. | [src/kits/vehicle/tire.js:9-17] <!-- C-484 --> |
| `DEFAULT_SURFACE` | `mu` 0.9, `C` 1.4, `kp` 0.14, `ap` 0.15, `crr` 0.025, `drag` 0 | The surface for ground with no tire data. The surface matches dry asphalt of the base library. | [src/kits/vehicle/tire.js:26-27] <!-- C-485 --> |
| `createPowertrain` options | `engine` `i4`, `gears` `[3.5, 2.1, 1.45, 1.1, 0.88, 0.72]`, `reverse` 3.2, `final` 3.9, `shiftTime` 0.28, `wheelInertia` 2, `turbo` null, `running` true | Engine and gearbox settings. | [src/kits/vehicle/powertrain.js:23-24] <!-- C-224 --> |
| `createEngineSound` options | `mic` `behind`, `mix` `{}`, `muffler` `sport`, `pipe` undefined, `pops` false, `volume` 0.6, `bus` `sfx`, `follow` null, `seed` 1 | Listening position, mix, muffler and voice settings. | [src/kits/vehicle/view.js:20] <!-- C-343 --> |

## Errors and limits

All errors are thrown `Error` objects. The message prefixes vary by module: `materials:`, `sidecar:`, `phys:`, `coverage:`, `fx:`, `terrain:`, `terrain view:`, `vehicle:`, `glyphs:`, `powertrain:` and `engine sound:`. The `fields.js` errors have no module prefix.

### Material registry
- defineMaterials throws if `entries` or `options` is not a plain object. [src/defs/materials.js:116-117] <!-- C-490 -->
- defineMaterials throws `materials: unknown option '<k>'` for any option key other than `pairs`. [src/defs/materials.js:118] <!-- C-491 -->
- A game entry with a base id and an `extends` key throws `materials: '<id>' overrides the base entry and cannot extend '<parent>'`. [src/defs/materials.js:126-127] <!-- C-492 -->
- More than 255 materials throw `materials: <n> materials, at most 255`. [src/defs/materials.js:8; src/defs/materials.js:132] <!-- C-493 -->
- An `extends` that names no entry throws `materials: '<id>' extends unknown '<parent>'`. [src/defs/materials.js:142] <!-- C-494 -->
- An `extends` cycle throws `materials: extends cycle a -> b -> a`. [src/defs/materials.js:143] <!-- C-495 -->
- An entry id that contains `|` throws `materials: '<id>' id must not contain '|' (pair keys use it)`. [src/defs/materials.js:76] <!-- C-496 -->
- An entry id that starts with `paint-` throws, because the prefix is reserved for paint slots (A-4). [src/defs/materials.js:77] <!-- C-497 -->
- An entry that is not a plain object throws `materials: '<id>' must be an object (got <value>)`. [src/defs/materials.js:78] <!-- C-498 -->
- A top-level key outside the schema fails as `unknown block`. An unknown key in a nested block fails as `unknown field`. [src/defs/materials.js:65-73; src/defs/materials.js:79] <!-- C-499 -->
- A field error reads `materials: '<id>'<path> <problem> (got <value>)`. The value text is cut to 57 characters plus `...` when it exceeds 60 characters. [src/defs/materials.js:11-17; src/defs/materials.js:75] <!-- C-500 -->
- `byIndex(i)` throws `materials: no material at index <i>` if `i` is not an integer in 0..`ids.length`-1. [src/defs/materials.js:213] <!-- C-501 -->
- A pair table that is not a plain object throws `materials: pairs must be an object`. [src/defs/materials.js:101] <!-- C-502 -->
- A pair key that is not `a|b` throws `materials: pair '<key>' must be 'a|b'`. [src/defs/materials.js:104-105] <!-- C-503 -->
- A pair key with an unknown id throws `materials: pair '<key>' names unknown material '<id>'`. [src/defs/materials.js:106] <!-- C-504 -->
- Two keys that name the same unordered pair, such as `a|b` and `b|a`, throw `materials: pair '<key>' repeats '<first key>'`. [src/defs/materials.js:107-108] <!-- C-505 -->
- A missing field in a complete pair `tire` throws `materials: pair '<key>'.tire.<f> required when neither '<a>' nor '<b>' has tyre data (got undefined)`. [src/defs/materials.js:165-171] <!-- C-506 -->

### Sidecar
- A collider error reads `<where>: <path>.<field> <problem> (got <value>)`. The defaults for `where` and `path` are `collider`. [src/defs/sidecar.js:30-31] <!-- C-507 -->
- The shape `ball` fails with `unknown shape (use 'sphere')`. Any other unknown shape fails with the list of shapes. [src/defs/sidecar.js:33] <!-- C-508 -->
- A collider key that its shape does not allow fails as `unknown field for a <shape>`. A collider that is not a plain object fails as `must be an object`. [src/defs/sidecar.js:32; src/defs/sidecar.js:34-35] <!-- C-509 -->
- A hull outside 4 to 64 points fails. [src/defs/sidecar.js:7; src/defs/sidecar.js:55-58] <!-- C-44 -->
- Sidecar messages start with `sidecar: <model>`. The `model` option defaults to `?`. [src/defs/sidecar.js:75-77] <!-- C-511 -->
- An aero error names its path, such as `sidecar: <model>: aero.panels[<i>].a must be a number > 0 (got <value>)`. [src/defs/sidecar.js:77; src/defs/sidecar.js:116; src/defs/sidecar.js:120] <!-- C-512 -->
- Aero panel errors read `must be a list`, `names an unknown part`, `must be a unit vector` and `must be 3 numbers`. [src/defs/sidecar.js:114; src/defs/sidecar.js:119; src/defs/sidecar.js:121-122] <!-- C-513 -->

### Net fields
- `F.obj` throws `too many bools: <n>` above 8 bools. [src/defs/fields.js:14] <!-- C-514 -->
- `F.uint` throws `bad uint width <bytes>` for a width other than 1, 2 or 4. [src/defs/fields.js:8] <!-- C-515 -->
- `F.uint` throws `bad uint range <min>..<max>` if `min` or `max` is not an integer or `min` > `max`. [src/defs/fields.js:8] <!-- C-516 -->
- `F.actions` throws `F.actions: every action must be axis() or button()` for another action kind. [src/defs/fields.js:19] <!-- C-517 -->
- `F.body` throws `F.body: range must be in (0, 511] (got <range>)` when a u16 cannot hold the range. [src/defs/fields.js:25; test/net-fields.test.mjs:29] <!-- C-518 -->
- `F.body` throws `F.body: height must be in (0, 127] (got <height>)` when a u16 cannot hold the height. [src/defs/fields.js:26; test/net-fields.test.mjs:29] <!-- C-519 -->
- `kind(def)` throws `bad kind code <code>` if `def.code` is not an integer from 0 to 255. Other kind errors read `kind '<name>': <message>`. [src/defs/fields.js:39-40] <!-- C-520 -->
- `kind` fails if `remote` is not `driven`, `proxy` or `view`. [src/defs/fields.js:44; test/net-fields.test.mjs:46] <!-- C-521 -->
- `kind` fails if remote `driven` lacks an `input` `F.actions` field or a `body` `F.body()` field. `kind` also fails if the authority is not `owner`. [src/defs/fields.js:45-46; test/net-fields.test.mjs:46] <!-- C-522 -->
- An unknown key in `tune` or `send` fails as `unknown tune key '<k>'` or `unknown send key '<k>'`. [src/defs/fields.js:36; src/defs/fields.js:50; src/defs/fields.js:55] <!-- C-523 -->
- `kind` needs `tune.snapAt` > 0 and finite, `tune.nudge` an integer >= 1, and `tune.smoothMs` >= 0 and finite. [src/defs/fields.js:52-54; test/net-fields.test.mjs:46] <!-- C-524 -->
- `kind` needs `send.hz` > 0 and `send.key` > 0, both finite. The hooks `record`, `apply`, `newer`, `spawn` and `spawned` must be functions when set. [src/defs/fields.js:57-58; test/net-fields.test.mjs:46] <!-- C-525 -->
- `INPUT_WIRE_MAX` limits one driven record to 64 inputs. [src/defs/fields.js:35; src/defs/fields.js:60] <!-- C-526 -->

### Kits
- `coverageKit` throws `coverage: <message>` if `host` has no `.system` function or `materialAt` is not a function. The call also throws if `washTime` is not > 0, `washes` is not an array or `layer` is not a function. [src/kits/coverage/sim.js:9; src/kits/coverage/sim.js:13-16; src/kits/coverage/sim.js:25; test/kits/coverage.test.mjs:69] <!-- C-527 -->
- A bad `washes` entry throws `coverage: washes[<k>] ...`. An entry `washTime` must be > 0. [src/kits/coverage/sim.js:17-24] <!-- C-528 -->
- `createParticles` throws `fx: max must be a positive integer (got <max>)` and `fx: shape must be 'cube' or 'quad' (got <shape>)`. `createMarks` throws the same `max` error. [src/kits/fx/view.js:6; src/kits/fx/view.js:14-15; src/kits/fx/view.js:87; test/kits/fx-particles.test.mjs:78] <!-- C-529 -->
- `glyphFor` throws `glyphs: unknown role '<role>'` or `glyphs: unknown family '<family>'`. [src/kits/glyphs/view.js:13-17; test/kits/glyphs.test.mjs:10] <!-- C-530 -->
- `createTerrain` throws `terrain: <message>` before it spawns anything. [src/kits/terrain/sim.js:7; test/kits/terrain.test.mjs:81] <!-- C-531 -->
- `createTerrain` requires `nx` and `nz` as integers >= 2, `cell` as a positive finite number, `x0` and `z0` as finite, and `heights` as `nx × nz` entries. [src/kits/terrain/sim.js:11-14] <!-- C-532 -->
- `createTerrain` fails if `blend` is not null or a function, or if a height is not finite. `createTerrain` also fails if `materials` is neither a `Uint8Array` nor a function. [src/kits/terrain/sim.js:15; src/kits/terrain/sim.js:17; src/kits/terrain/sim.js:21-26] <!-- C-533 -->
- A `materials` `Uint8Array` must hold `nx × nz` entries, and each entry must be a registry index. An unknown collider material fails as `unknown collider material '<id>'`. [src/kits/terrain/sim.js:22-24; src/kits/terrain/sim.js:29] <!-- C-534 -->
- `createTerrainMesh` throws `terrain view: <message>` if `terrain.grid` is missing. [src/kits/terrain/view.js:7; src/kits/terrain/view.js:34] <!-- C-535 -->
- `createTerrainMesh` also throws if `lods` is not a rising list of positive integers or `lodFar` does not hold one distance fewer than `lods`. [src/kits/terrain/view.js:36-39; test/kits/terrain-view.test.mjs:110] <!-- C-536 -->
- `createTerrainMesh` throws if `chunks` is not two integers >= 1, if an attribute lacks `{ size >= 1, at() }`, or if neither `compiler` nor a three.js material is given. [src/kits/terrain/view.js:40-43; test/kits/terrain-view.test.mjs:110] <!-- C-537 -->
- `createTerrainMesh` throws if `chunkCells` is not a positive multiple of the coarsest LOD step. [src/kits/terrain/view.js:46; test/kits/terrain-view.test.mjs:110] <!-- C-538 -->
- `createVehicle` throws `vehicle: <message>` before it makes a controller if the World has no engine, the entity has no body, or the body is not dynamic. [src/kits/vehicle/sim.js:21; src/kits/vehicle/sim.js:54-57; test/kits/vehicle.test.mjs:72] <!-- C-539 -->
- `createVehicle` also throws for an empty `wheels` list, a `forward` other than `x` or `z`, or an unknown `tyre` material. [src/kits/vehicle/sim.js:61-64; test/kits/vehicle-material.test.mjs:47] <!-- C-540 -->
- `createVehicle` throws `vehicle: backend must be 'raycast' or 'tire'` for any other `backend` value. [src/kits/vehicle/sim.js:59; test/kits/vehicle-tire.test.mjs:76] <!-- C-541 -->
- `createVehicle` throws `vehicle: substeps must be 'auto' or an integer in 1..64` for a bad `substeps` value. The check applies only when the backend is `tire`. [src/kits/vehicle/sim.js:60; test/kits/vehicle-tire.test.mjs:76] <!-- C-542 -->
- `car.set` throws `vehicle: wheel <i> out of range 0..<n-1>` if `i` is outside the wheel range. [src/kits/vehicle/sim.js:113; test/kits/vehicle.test.mjs:44] <!-- C-543 -->
- A `rayGroups` name that is undeclared, or is `mask`, throws `vehicle: rayGroups names undeclared group '<n>'`. [src/kits/vehicle/sim.js:49; test/kits/vehicle.test.mjs:96] <!-- C-544 -->

### Powertrain
- `createPowertrain` throws `powertrain: engine.<k> must be a number > 0 (got <value>)` when `idle`, `redline`, `limiter`, `torque`, `peakRpm` or `inertia` of the engine is not > 0. [src/kits/vehicle/powertrain.js:27; test/kits/powertrain.test.mjs:80] <!-- C-226 -->
- `createPowertrain` throws `powertrain: gears must be a non-empty list of ratios > 0` unless `gears` is a non-empty array of numbers > 0. [src/kits/vehicle/powertrain.js:28; test/kits/powertrain.test.mjs:81] <!-- C-227 -->
- `createPowertrain` throws `powertrain: <k> must be a number > 0 (got <value>)` when `reverse`, `final` or `wheelInertia` is not > 0. The call throws `powertrain: shiftTime must be a number >= 0 (got <value>)` when `shiftTime` is not >= 0. [src/kits/vehicle/powertrain.js:29-30; test/kits/powertrain.test.mjs:82] <!-- C-228 -->
- `shift(g)` throws `powertrain: gear must be an integer in -1..<n> (got <g>)` for another value of `g`. [src/kits/vehicle/powertrain.js:79; test/kits/powertrain.test.mjs:84] <!-- C-235 -->
- `step` throws `powertrain: dt must be a number > 0 (got <dt>)` when `dt` is not > 0. [src/kits/vehicle/powertrain.js:86; test/kits/powertrain.test.mjs:85] <!-- C-238 -->
- An unknown preset name throws the error in B-224. [src/kits/vehicle/powertrain.js:26; test/kits/powertrain.test.mjs:79] <!-- C-225 -->

### Engine sound
- `createEngineSound` throws `engine sound: a powertrain from createPowertrain required` unless `pt` has `state` and `spec`. [src/kits/vehicle/view.js:17; src/kits/vehicle/view.js:21; test/kits/vehicle-sound.test.mjs:57] <!-- C-344 -->
- `createEngineSound` throws `engine sound: muffler must be stock, sport or straight (got <muffler>)` for another muffler name. [src/kits/vehicle/view.js:9; src/kits/vehicle/view.js:18; src/kits/vehicle/view.js:22; test/kits/vehicle-sound.test.mjs:59] <!-- C-345 -->
- `createEngineSound` throws `engine sound: mix has no '<key>' (exhaust, coast, intake, turbo, engineBody, starter)` for another key in `mix`. [src/kits/vehicle/view.js:16; src/kits/vehicle/view.js:23; test/kits/vehicle-sound.test.mjs:60] <!-- C-346 -->
- `createEngineSound` and `mic(name)` throw `engine sound: mic must be behind, bay or cabin (got <name>)` for another listening position. [src/kits/vehicle/view.js:8; src/kits/vehicle/view.js:28; src/kits/vehicle/view.js:32; src/kits/vehicle/view.js:50; test/kits/vehicle-sound.test.mjs:58] <!-- C-347 -->
- A failed synth start rejects `ready` and logs the error with `console.error`. See B-328, B-329 and B-330. [src/kits/vehicle/view.js:34-35; src/kits/vehicle/view.js:41; src/kits/vehicle/view.js:43] <!-- C-358 C-359 C-360 -->

## Dependencies
- **Internal:** `src/core/rng.js` gives `fnv` for the registry hash (see the core spec). The kits call `world.materials`, `world.groups`, `world.rapier`, `world.engine`, `world.heightfield`, `world.materialOf`, `world.own`, `world.add`, `world.with` and `world.xfPrev`. The tire backend also calls `world.R`. The World belongs to a feature outside this spec. [src/defs/materials.js:4; src/kits/vehicle/sim.js:54-63; src/kits/vehicle/sim.js:103; src/kits/vehicle/sim.js:108; src/kits/vehicle/sim.js:145; src/kits/vehicle/sim.js:173; src/kits/terrain/sim.js:33; src/kits/coverage/sim.js:30; src/kits/coverage/sim.js:42] <!-- C-550 -->
- **Internal, engine sound:** `createEngineSound` imports `createDsp` from `src/view/audio/dsp.js`. The function uses `audio.onUnlock`, `audio.voice` and the voice members `input`, `audible` and `stop`. The audio service belongs to a feature outside this spec. [src/kits/vehicle/view.js:5; src/kits/vehicle/view.js:36-42; src/kits/vehicle/view.js:56; src/kits/vehicle/view.js:59] <!-- C-552 -->
- **Internal, synth host:** `createDsp(audio, { name, Class, options })` needs an audio context. The function returns a synth with `node`, `mode`, `send` and `dispose`. Before the unlock it throws `createDsp: no audio context yet (call it from audio.onUnlock)`. [src/view/audio/dsp.js:25-40] <!-- C-553 -->
- **External:** the view kits fx and terrain import three. The sim kits import no three.js and get Rapier as `world.rapier`. [src/kits/vehicle/sim.js:7; src/kits/terrain/sim.js:5; src/kits/fx/view.js:4; src/kits/terrain/view.js:5] <!-- C-551 -->

<!-- related-specs -->
Related specs:

- Imports: [Engine core](core.md)
- Imported by: [Engine core](core.md)
- Imported by: [Simulation world and physics](sim-world-physics.md)
- Imported by: [Networking and replication](net-replication.md)
- Imported by: [Rendering and materials](view-render.md)
- Imported by: [Test helpers](testing.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Open questions and discrepancies
- `docs/design.md` 7.3 sketches the vehicle input as `{ throttle, brake, steer, handbrake, gear? }` and the wheel output with `slip`. The kit takes per-wheel controls through `car.set` and reports `kappa` and `alpha` on the tire backend. [docs/design.md:356-359; src/kits/vehicle/sim.js:166; src/kits/vehicle/sim.js:181]
- `docs/research-engine-sound.md` section 3.5 says the prototype automatic clutch slips at 2.0 N m per rpm when not launching. The powertrain uses 8, and `docs/spec.md` H-6 also says 8. [docs/research-engine-sound.md:148; src/kits/vehicle/powertrain.js:93; docs/spec.md:449]
- `docs/research-engine-sound.md` section 5 names the second listening position `engineBay`. The code names it `bay` in the `mic` option and in `MIX_DB`. [docs/research-engine-sound.md:367; src/kits/vehicle/view.js:8; src/kits/vehicle/view.js:13]
- `docs/research-engine-sound.md` section 2.1 gives the default of `pops` as 0. The `EngineDSP` frame starts with `pops` 1, and `createEngineSound` sends `pops` 0 unless the `pops` option is true. [docs/research-engine-sound.md:46; src/kits/vehicle/engineDsp.js:25; src/kits/vehicle/view.js:24]
- `docs/research-engine-sound.md` section 2.2 says the engine message is sent when the engine changes. `createEngineSound` sends it once after the synth is ready and has no call that sends another. [docs/research-engine-sound.md:64; src/kits/vehicle/view.js:42]
- Why do the base materials glass, mud, snow, water and air have no `coverage` block? No source states the reason.
- Why does the particle landing threshold use `vy` < 1 with no named constant? No source states the reason.
- Why does `createEngineSound` send no new engine message when the powertrain `spec` changes? No source states the reason.
- Why does the clutch capacity formula use the engine inertia and the wheel inertia as B-234 shows? The source comment says only that one step's torque cannot reverse the slip.

## Evidence index
- `src/defs/materials.js`: the material registry, validation, pairs and hash.
- `src/defs/materials.base.js`: the 18 base materials.
- `src/defs/sidecar.js`: the sidecar and phys.json validators.
- `src/defs/fields.js`: the net field builders and `kind`.
- `src/kits/vehicle/sim.js`: the raycast and tire vehicle backends.
- `src/kits/vehicle/tire.js`: the tire model.
- `src/kits/vehicle/powertrain.js`: the engine and gearbox, and the engine presets.
- `src/kits/vehicle/engineDsp.js`: the engine synth and the engine configuration message.
- `src/kits/vehicle/view.js`: the engine sound view half.
- `src/kits/terrain/sim.js` and `src/kits/terrain/view.js`: the terrain kit.
- `src/kits/coverage/sim.js` and `src/kits/coverage/view.js`: the coverage kit.
- `src/kits/fx/view.js`: the particle and mark pools.
- `src/kits/glyphs/view.js` and `src/kits/glyphs/icons.js`: the glyph kit.
