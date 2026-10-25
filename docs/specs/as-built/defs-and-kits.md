---
id: F02
title: Definitions and kits
status: as-built
source_commit: 7e239df
paths:
  - src/defs/**
  - src/kits/**
generated: STE spec writer
---

# Definitions and kits

## Summary
This feature holds the plain-data definitions and the kits. The definitions are the material registry, the physics sidecar schema, and the net field and kind builders. The kits are vehicle, terrain, coverage, fx and glyphs. Sim halves import no three.js. View halves import three.js or the DOM.

## Scope
- **In scope:** `src/defs/materials.js`, `src/defs/materials.base.js`, `src/defs/sidecar.js`, `src/defs/fields.js`, and the kits under `src/kits/`.
- **Out of scope:** the World, the engine, the replication code that packs fields, the bake, `checks.materials`, the material compiler, and view sync. Other specs cover them.

## Terms
See the [glossary](_meta/glossary.md). This spec uses these glossary terms: material, material registry, base library, material pair, registry hash, sidecar and phys.json. It also uses kit, heightfield, coverage, glyph role, glyph family and kind.

## Interfaces

### Definitions

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `defineMaterials(entries = {}, options = {})` | in, returns a material registry | entries by id, `options.pairs` | [src/defs/materials.js:115] <!-- C-1 --> |
| `PHYS_DEFAULTS`, `MAX_MATERIALS`, `canonicalJson` | out | constants and function | [src/defs/materials.js:7-8; src/defs/materials.js:91] <!-- C-1 --> |
| Registry members `ids`, `hash`, `get`, `has`, `index`, `byIndex`, `density`, `collider`, `pair` | out | frozen object | [src/defs/materials.js:207-217] <!-- C-2 --> |
| `BASE_MATERIALS` | out | frozen object of 18 entries | [src/defs/materials.base.js:7] <!-- C-40 --> |
| `SIDECAR_VERSION`, `SHAPES`, `MAX_HULL_POINTS`, `validateCollider`, `validateSidecar`, `validatePhys`, `materialRefs` | out | functions and constants | [src/defs/sidecar.js:5-7; src/defs/sidecar.js:30; src/defs/sidecar.js:75; src/defs/sidecar.js:123; src/defs/sidecar.js:136] <!-- C-45 --> |
| `F`, `kind`, `REMOTES`, `FOLLOWS`, `TUNE`, `SEND`, `INPUT_BATCH`, `INPUT_WIRE_MAX` | out | field builders and constants | [src/defs/fields.js:6; src/defs/fields.js:31-38] <!-- C-66 --> |

### Kits

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `coverageKit(host, { materialAt, washes, washTime, layer })`, `COVERAGE_SYSTEM` (`lh.kit.coverage`), `coverageLayer` | in, returns `{ off }` | sim half | [src/kits/coverage/sim.js:7-12; src/kits/coverage/sim.js:55] <!-- C-84 --> |
| `coverageView(sync, compiler, { match })`. The default `match` is `e => e.coverage != null`. | in, returns `{ off, size }` | view half | [src/kits/coverage/view.js:6; src/kits/coverage/view.js:38-41] <!-- C-94 --> |
| `createParticles(opts)` | in, returns `{ emit, update, mesh, color, dispose, live }` | view half | [src/kits/fx/view.js:12; src/kits/fx/view.js:81] <!-- C-99 --> |
| `createMarks(opts)` | in, returns `{ add, update, mesh, dispose }` | view half | [src/kits/fx/view.js:86; src/kits/fx/view.js:120] <!-- C-99 --> |
| `GLYPH_ROLES` (confirm, back, menu, move, prev, next), `GLYPH_FAMILIES`, `glyphFor`, `familyFor`, `bindGlyphs` | out | view half | [src/kits/glyphs/view.js:7-8; src/kits/glyphs/view.js:13; src/kits/glyphs/view.js:19; src/kits/glyphs/view.js:24] <!-- C-114 --> |
| `createTerrain(world, opts)` | in, returns a frozen terrain object | sim half | [src/kits/terrain/sim.js:9; src/kits/terrain/sim.js:51-73] <!-- C-122 --> |
| `createTerrainMesh(terrain, opts)`, `chunkIndex(n, m)` | in, returns `{ group, update, dispose, stats }` | view half | [src/kits/terrain/view.js:10; src/kits/terrain/view.js:30; src/kits/terrain/view.js:143] <!-- C-136 --> |
| `createVehicle(world, e, opts)`, `VEHICLE_SYSTEM` (`lh.kit.vehicle`) | in, returns a car | sim half | [src/kits/vehicle/sim.js:7; src/kits/vehicle/sim.js:48; src/kits/vehicle/sim.js:102-131] <!-- C-152 --> |

## Behavior

### Material registry: build
- **B-1** The registry ids list the base library first in base order, then the game entries in key order. [src/defs/materials.js:120-131] <!-- C-5 -->
- **B-2** If a game entry has a base id, defineMaterials deep-merges the entry over the base entry. The merged entry keeps the base index. [src/defs/materials.js:126-129] <!-- C-5 C-6 -->
- **B-3** A material with `extends` resolves by deep merge per block over the resolved parent. The child wins. [src/defs/materials.js:83-87; src/defs/materials.js:134-149] <!-- C-8 -->
- **B-4** In a merge, arrays and scalars replace the parent value. The `game` block copies through like any block. [src/defs/materials.js:83-87; src/defs/materials.js:134-149] <!-- C-8 -->
- **B-5** Each resolved material is a deep-frozen copy that carries its `id`. The caller's objects stay untouched. [src/defs/materials.js:82-88; src/defs/materials.js:150; test/materials.test.mjs:49] <!-- C-10 -->
- **B-6** The base library is a deeply frozen object of 18 entries. The order is steel, aluminium, wood, rubber, glass, plastic, fabric, flesh, fur, gravel, grass, dirt, mud, asphalt, snow, ice, water, air. [src/defs/materials.base.js:5-120; test/materials-base.test.mjs:5-10] <!-- C-40 -->
- **B-7** A World without `defs.materials` uses the base library. `checks.materials` also defaults to the base library. [test/world-base-materials.test.mjs:12; test/world-base-materials.test.mjs:29] <!-- C-174 -->
- **B-8** `checks.materials` reports a missing sidecar material at the location `models.<model>.colliders[<i>]`. `materialRefs` alone returns `<model>.colliders[<i>]`. [test/world-base-materials.test.mjs:45] <!-- C-174 -->

### Material registry: lookups
- **B-9** `get(id)` returns the resolved material. `has(id)` returns a boolean. `index(id)` returns the position in `ids`. [src/defs/materials.js:153-154; src/defs/materials.js:210-212] <!-- C-23 -->
- **B-10** The calls `get` and `index` throw `materials: unknown material '<id>'` for an unknown id. [src/defs/materials.js:153-154; src/defs/materials.js:210-212] <!-- C-23 -->
- **B-11** `byIndex(i)` returns the id string. [src/defs/materials.js:213] <!-- C-24 -->
- **B-12** A material has `sg` equal to `phys.sg`, else 0 if it has a `fluid` block, else 1. [src/defs/materials.js:155-156; test/materials.test.mjs:68] <!-- C-25 -->
- **B-13** If a material has no `phys.sg` and has a `fluid` block, its collider density is 0. [src/defs/materials.js:155-156; test/materials.test.mjs:68] <!-- C-25 -->
- **B-14** Otherwise the collider density is `sg × 1000 × fill`, with `fill` defaulting to 1. [src/defs/materials.js:155-156; test/materials.test.mjs:68] <!-- C-25 -->
- **B-15** `collider(id)` returns a frozen `{ friction, restitution, density }`. The friction is the square root of `phys.friction`, which defaults to 0.5. [src/defs/materials.js:157-161; src/defs/materials.js:214-215] <!-- C-26 -->
- **B-16** The restitution from `collider(id)` defaults to 0. `density(id)` returns the same density. [src/defs/materials.js:157-161; src/defs/materials.js:214-215] <!-- C-26 -->

### Material pairs
- **B-17** defineMaterials parses `options.pairs` into a table keyed by the unordered pair. Each key must read `a|b` with two non-empty ids. [src/defs/materials.js:100-113; src/defs/materials.js:164] <!-- C-27 -->
- **B-18** A pair entry takes `friction`, `restitution`, `tire`, `sound` and `fx`. The registry clones and deep-freezes each entry. [src/defs/materials.js:63; src/defs/materials.js:109-110] <!-- C-30 -->
- **B-19** If a pair entry has a `tire` block and neither of its two materials has `tire` data, the entry must give every `tire` field. [src/defs/materials.js:165-172] <!-- C-31 -->
- **B-20** `pair(a, b)` caches its result per ordered pair of ids. The result is a deep-frozen `{ friction, restitution, tire, sound, fx }`. [src/defs/materials.js:173-192] <!-- C-32 -->
- **B-21** In `pair(a, b)`, friction is the entry friction. Without an entry value, friction is the square root of the product of the two `phys.friction` values. [src/defs/materials.js:180-185; test/materials-pairs.test.mjs:5] <!-- C-33 -->
- **B-22** In `pair(a, b)`, the default for a `phys.friction` value is 0.5. Restitution is the entry value, else the larger of the two restitutions. [src/defs/materials.js:180-185; test/materials-pairs.test.mjs:5] <!-- C-33 -->
- **B-23** In `pair(a, b)`, the soft material is `b` if `sg(b) < sg(a)`, else `a`. A tie in `sg` gives the cues to `a`. [src/defs/materials.js:181; test/materials-pairs.test.mjs:16] <!-- C-34 -->
- **B-24** In `pair(a, b)`, sound is the entry value, else the soft material's sound, else the hard material's sound, else null. Fx follows the same order. [src/defs/materials.js:187-188; test/materials-pairs.test.mjs:16] <!-- C-34 -->
- **B-25** In `pair(a, b)`, the ground tire is the `tire` of `b`, else the `tire` of `a`. [src/defs/materials.js:182; test/materials-pairs.test.mjs:16] <!-- C-35 -->
- **B-26** The result `tire` is the ground tire merged field by field with the entry tire. Without a ground tire it is the entry tire alone. With no entry tire, it is the ground tire if one exists, else null. [src/defs/materials.js:186; test/materials-pairs.test.mjs:16] <!-- C-35 -->

### Registry hash
- **B-27** The registry hash is 8 lowercase hex digits. The hash is the FNV hash (`fnv` from `src/core/rng.js`) of canonical JSON. [src/defs/materials.js:4; src/defs/materials.js:98; src/defs/materials.js:194-205; test/materials-hash.test.mjs:10] <!-- C-36 C-171 -->
- **B-28** The canonical JSON holds the materials in index order and the pair friction and restitution values. [src/defs/materials.js:194-205] <!-- C-36 -->
- **B-29** For each material, the hash covers the id, friction, restitution, `sg` and `fill`, with defaults filled in. The `sg` of a fluid without `phys.sg` is 0. [src/defs/materials.js:199-203] <!-- C-37 -->
- **B-30** For each pair entry that sets friction or restitution, the hash covers the sorted pair key and those values. A pair entry with neither value adds nothing. [src/defs/materials.js:194-205; test/materials-hash.test.mjs:13] <!-- C-38 -->
- **B-31** The hash ignores `look`, `game`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `sound` and `fx`. A change to them needs no re-bake. [src/defs/materials.js:194-205; test/materials-hash.test.mjs:13] <!-- C-38 -->
- **B-32** `canonicalJson` sorts object keys at every level. [src/defs/materials.js:90-97; test/materials-hash.test.mjs:5] <!-- C-39 -->
- **B-33** `canonicalJson` throws `materials: cannot hash <value>` for a value that is not plain JSON. A function, `undefined` and a non-finite number are examples. [src/defs/materials.js:90-97; test/materials-hash.test.mjs:5] <!-- C-39 -->
- **B-34** The base library registry hash is pinned in a test. [test/materials-hash.test.mjs:10] <!-- C-175 -->

### Sidecar validation
- **B-35** Each sidecar validator returns its input unchanged or throws on the first error. [src/defs/sidecar.js:1-4; test/sidecar.test.mjs:76] <!-- C-46 -->
- **B-36** A collider needs `p` (3 finite numbers), `q` (a unit quaternion `[x, y, z, w]`) and `part` (a non-empty string). [src/defs/sidecar.js:21; src/defs/sidecar.js:36-41] <!-- C-50 -->
- **B-37** With `inline: true`, a collider may omit `p`, `q` and `part`. The validator still validates them when present. [src/defs/sidecar.js:36-41; test/sidecar-collider.test.mjs:53] <!-- C-50 -->
- **B-38** If the caller gives a `parts` list, a collider `part` must be in it. Otherwise the collider fails with `names an unknown part`. [src/defs/sidecar.js:40] <!-- C-51 -->
- **B-39** A collider `material` is always required and must be a non-empty string. [src/defs/sidecar.js:42-44; test/sidecar-collider.test.mjs:53] <!-- C-52 -->
- **B-40** A collider `material` that starts with `paint-` fails as a paint slot. [src/defs/sidecar.js:42-44] <!-- C-52 -->
- **B-41** If the caller gives a registry, the collider `material` must pass its `has()`. [src/defs/sidecar.js:42-44] <!-- C-52 -->
- **B-42** A box needs `half` as 3 numbers > 0. A box may carry `round`, a number > 0 with no upper bound. Rapier adds `round` outside `half`. [src/defs/sidecar.js:47-52] <!-- C-53 -->
- **B-43** A sphere needs `r` > 0. A capsule or cylinder needs `halfHeight` > 0 and `r` > 0. [src/defs/sidecar.js:53-54] <!-- C-53 -->
- **B-44** A hull needs `points` as a flat `[x, y, z, ...]` list of 4 to 64 points. [src/defs/sidecar.js:7; src/defs/sidecar.js:55-58; test/sidecar-collider.test.mjs:48] <!-- C-54 -->
- **B-45** A mesh needs `vertices` (a flat list, a multiple of 3, at least 9 numbers) and `indices` (whole triangles, at least 3). [src/defs/sidecar.js:60-66] <!-- C-55 -->
- **B-46** Every mesh index must be an integer from 0 to the vertex count minus 1. [src/defs/sidecar.js:60-66] <!-- C-55 -->
- **B-47** Collider number lists may be arrays or typed arrays except `DataView`. Every entry must be finite. [src/defs/sidecar.js:18-20] <!-- C-56 -->
- **B-48** `validateSidecar` accepts the keys `v`, `source`, `parts`, `colliders`, `mass`, `sockets` and `bounds`. Any other key fails as `unknown field`. [src/defs/sidecar.js:71; src/defs/sidecar.js:73-79] <!-- C-57 -->
- **B-49** A sidecar needs `v` equal to `SIDECAR_VERSION`, `parts` (a list of unique non-empty strings) and `colliders` (a list). [src/defs/sidecar.js:80; src/defs/sidecar.js:87-90] <!-- C-58 -->
- **B-50** `validateSidecar` validates each collider with the sidecar `parts` and the registry. [src/defs/sidecar.js:87-90] <!-- C-58 -->
- **B-51** A sidecar `source` is optional and hand-written fixtures have none. When present it needs `file` (a non-empty string) and `sha256` (64 lowercase hex digits). [src/defs/sidecar.js:74; src/defs/sidecar.js:81-86] <!-- C-59 -->
- **B-52** A sidecar `mass` is optional and informational. When present it needs `mass` >= 0, `com` (3 numbers), `inertia` (3 numbers >= 0) and `frame` (a unit quaternion). [src/defs/sidecar.js:74; src/defs/sidecar.js:91-99] <!-- C-60 -->
- **B-53** Each socket needs `p` (3 numbers), `q` (a unit quaternion) and `part`. The `part` is null or a name in `parts`. A null `part` means the socket has no parent part. [src/defs/sidecar.js:100-109; test/sidecar.test.mjs:32] <!-- C-61 -->
- **B-54** Sidecar `bounds` are optional. When present they need `min` (3 numbers) and `max` (3 numbers, each >= the matching `min`). [src/defs/sidecar.js:110-116] <!-- C-62 -->
- **B-55** `validatePhys` accepts the keys `v`, `engine`, `materials` and `models`. Any other key fails as `unknown field`. [src/defs/sidecar.js:120; src/defs/sidecar.js:126-130] <!-- C-63 -->
- **B-56** `validatePhys` needs `v` equal to `SIDECAR_VERSION` and `models` as an object. It needs `materials` as 8 lowercase hex digits. It needs `engine` as a version like `0.8.0`, and an optional `-suffix` is allowed. [src/defs/sidecar.js:126-130] <!-- C-63 -->
- **B-57** `validatePhys` validates each model with `validateSidecar` and the model id. [src/defs/sidecar.js:131] <!-- C-64 -->
- **B-58** `validatePhys` does not compare `materials` with `registry.hash`. The caller does that (`checks.materials`, `lion-hawk bake --check`). [src/defs/sidecar.js:120-123; test/checks-materials.test.mjs:22] <!-- C-64 -->
- **B-59** `materialRefs(phys)` returns an object that maps each material name used by a collider to a list of `<model>.colliders[<i>]` locations. Its keys are sorted. [src/defs/sidecar.js:135-140; test/sidecar.test.mjs:67] <!-- C-65 -->

### Net fields and kinds
- **B-60** `F.bool` packs into a shared flags byte. An `F.obj` holds at most 8 bools. `F.obj` keys lists the non-bool fields in order. [src/defs/fields.js:7; src/defs/fields.js:14] <!-- C-67 -->
- **B-61** `F.uint(bytes, max, min)` takes `bytes` 1, 2 or 4. The `max` defaults to 2^(8×bytes)-1 and `min` to 0. Encode throws below `min` and decode drops it. [src/defs/fields.js:8] <!-- C-68 -->
- **B-62** `F.id` is a u16 and null travels as `0xffff`. `F.oneOf` is a u8 index. `F.angle` is a u16 over a full turn. [src/defs/fields.js:9-10; src/defs/fields.js:12] <!-- C-70 -->
- **B-63** `F.fixed` is u16 steps from `lo`, and values clamp into `lo..hi`. `F.quat` is 4 × i16, normalized on decode. `F.list` is a u8 count. [src/defs/fields.js:11; src/defs/fields.js:13; src/defs/fields.js:15] <!-- C-70 -->
- **B-64** `F.actions(map)` packs axes as i16/32767 in the key order of the map, then buttons as flags, 8 per byte. [src/defs/fields.js:16-21] <!-- C-71 -->
- **B-65** `F.actions` decodes to `{ axis: number, button: boolean }`. [src/defs/fields.js:16-21] <!-- C-71 -->
- **B-66** `F.body({ range = 400, height = 50 })` packs one body `{ p, q, v, w }` in 26 bytes and marks the field with `body: true`. [src/defs/fields.js:22-29; test/net-fields.test.mjs:13-20] <!-- C-72 -->
- **B-67** The `F.body` precision for `p.x` and `p.z` is 1/64 m over ±`range`. For `p.y` it is 1/256 m over ±`height`. For `v` it is 1/1000 m/s over ±32. For `w` it is 1/2000 rad/s over ±16. [src/defs/fields.js:22-29; test/net-fields.test.mjs:13-20] <!-- C-72 -->
- **B-68** When `def.remote` is unset, `kind` uses `driven` for an owner kind that has an `F.actions` input field and a field named `body` made with `F.body()`. Otherwise `kind` uses `proxy`. [src/defs/fields.js:41-43; test/net-fields.test.mjs:35] <!-- C-77 -->
- **B-69** The `follow` value defaults to `interp`. The value must be `interp` or `forecast`. The value `forecast` needs at least one `F.body()` field. [src/defs/fields.js:47-49] <!-- C-79 -->
- **B-70** `kind` merges `def.tune` over `TUNE` and `def.send` over `SEND`. [src/defs/fields.js:36; src/defs/fields.js:50-51; src/defs/fields.js:55-56] <!-- C-80 -->
- **B-71** `kind` returns the definition with `idMin` defaulting to 0, plus `remote`, `follow`, frozen `tune` and `send`, `bodies`, `input` and `rec`. The `rec` field is `F.obj` of the wire fields. [src/defs/fields.js:37; src/defs/fields.js:61] <!-- C-82 -->
- **B-72** For a driven kind, the wire form replaces `input` with `F.obj({ s: F.uint(4), list: F.list(input, 64, 1) })`. [src/defs/fields.js:4; src/defs/fields.js:59-60; test/net-fields.test.mjs:61] <!-- C-83 -->
- **B-73** The wire field `s` is the owner step of the newest input. The `list` field holds snapshots, oldest first. Other kinds keep their wire bytes. [src/defs/fields.js:4; src/defs/fields.js:59-60; test/net-fields.test.mjs:61] <!-- C-83 -->
- **B-74** A driven record carries the newest input and at least 7 before it. It carries 2 × steps per send when that is more. [src/defs/fields.js:34; src/defs/fields.js:60] <!-- C-75 -->

### Coverage kit
- **B-75** The coverage system runs in stage `post` on the host, which is the engine or a scene ctx. The system does nothing when `engine.world` is null. [src/kits/coverage/sim.js:27-29; src/kits/coverage/sim.js:54; test/kits/coverage.test.mjs:60] <!-- C-87 -->
- **B-76** Each step the coverage system visits every entity that has a `coverage` part, an `xf` and a coverage object. [src/kits/coverage/sim.js:30-36] <!-- C-88 -->
- **B-77** The first wash entry whose `at(x, z)` is true decides the wash time. [src/kits/coverage/sim.js:30-36] <!-- C-88 -->
- **B-78** Each washes entry is a function `(x, z) => boolean` or `{ at, washTime }`. A function entry uses the kit-wide `washTime`. [src/kits/coverage/sim.js:17-24; test/kits/coverage.test.mjs:33] <!-- C-86 -->
- **B-79** In a wash, each layer among dirt, rust, snow and mud that the entity carries drops by `dt / washTime`, with a floor of 0. The entity gains nothing that step. [src/kits/coverage/sim.js:8; src/kits/coverage/sim.js:37-41; test/kits/coverage.test.mjs:24] <!-- C-89 -->
- **B-80** Outside a wash, the entity gains `dirtRate × metres moved` on the ground layer, capped at 1. [src/kits/coverage/sim.js:42-52; test/kits/coverage.test.mjs:16] <!-- C-90 -->
- **B-81** Metres moved is the horizontal distance from the pool prev pose to the curr pose. A `place()` adds nothing. [src/kits/coverage/sim.js:42-52; test/kits/coverage.test.mjs:50] <!-- C-90 -->
- **B-82** The gain is skipped when the entity did not move or when `materialAt` returns null or undefined. The gain is also skipped when the ground `dirtRate` is 0 or absent, or when the entity lacks the layer. [src/kits/coverage/sim.js:44-50; test/kits/coverage.test.mjs:50] <!-- C-91 -->
- **B-83** The ground material id maps to a layer through `layer(id)`. The default `coverageLayer` gives `mud` for `mud`, `snow` for `snow` and `dirt` for any other id. [src/kits/coverage/sim.js:10; src/kits/coverage/sim.js:49; test/kits/coverage.test.mjs:69] <!-- C-92 -->
- **B-84** The gain scales by what the entity's own material accepts. That material is `e.coverageMaterial`, else the first collider's material. [src/kits/coverage/sim.js:51; src/kits/coverage/sim.js:58-64; test/kits/coverage.test.mjs:41] <!-- C-93 -->
- **B-85** The scale is the `coverage` value of that material for the layer. It is 0 if the block lacks the layer, and 1 without a block or without a material. [src/kits/coverage/sim.js:58-64; test/kits/coverage.test.mjs:41] <!-- C-93 -->
- **B-86** On create, `coverageView` clones each non-instanced mesh whose single material has the `COVERAGE` define, through `compiler.coverage`. [src/kits/coverage/view.js:10-26; test/kits/coverage-view.test.mjs:17] <!-- C-95 -->
- **B-87** All clones of one entity share one `uCoverage` vector. An entity with no object or no such mesh is skipped. [src/kits/coverage/view.js:10-26; test/kits/coverage-view.test.mjs:47] <!-- C-95 -->
- **B-88** `coverageView` skips instanced meshes and array materials. Instanced meshes use `COVERAGE_INSTANCED` and an `instanceCoverage` attribute that the instancing owner writes. [src/kits/coverage/view.js:2-4; src/kits/coverage/view.js:15-17] <!-- C-96 -->
- **B-89** On create and on each frame, `coverageView` writes (dirt, rust, snow, mud) into `uCoverage` in place, with 0 for a missing layer. A frame allocates nothing. [src/kits/coverage/view.js:8; src/kits/coverage/view.js:27-30; test/kits/coverage-view.test.mjs:29] <!-- C-97 -->
- **B-90** On remove, `coverageView` restores the base material of each mesh and disposes the clone. [src/kits/coverage/view.js:9; src/kits/coverage/view.js:31-40; test/kits/coverage-view.test.mjs:39] <!-- C-98 -->
- **B-91** `off()` unsubscribes from sync and releases every entity. [src/kits/coverage/view.js:9; src/kits/coverage/view.js:31-40; test/kits/coverage-view.test.mjs:39] <!-- C-98 -->

### Fx kit
- **B-92** `emit(x, y, z, vx, vy, vz, life, size, c, g, d)` takes the next slot of a ring of `max` slots and returns the slot index. [src/kits/fx/view.js:28-43; test/kits/fx-particles.test.mjs:20] <!-- C-102 -->
- **B-93** Once `max` is reached, `emit` reuses the oldest slot. The per-particle `g` and `d` default to the pool gravity and drag. [src/kits/fx/view.js:28-43; test/kits/fx-particles.test.mjs:20; test/kits/fx-particles.test.mjs:70] <!-- C-102 -->
- **B-94** `emit` sets the colour of the slot from `c`. If `c` is null or undefined, the slot keeps the shared colour. [src/kits/fx/view.js:37-38; test/kits/fx-particles.test.mjs:60] <!-- C-103 -->
- **B-95** The start spin of a slot comes from the slot index times the golden angle. The kit uses no random numbers. [src/kits/fx/view.js:3; src/kits/fx/view.js:7; src/kits/fx/view.js:33] <!-- C-103 -->
- **B-96** `update(dt)` lowers life by `dt`. A particle with life <= 0 gets a zero-scale matrix and its slot frees. [src/kits/fx/view.js:53-54; test/kits/fx-particles.test.mjs:26] <!-- C-104 -->
- **B-97** Particles shrink over the last half of their life. [src/kits/fx/view.js:69; test/kits/fx-particles.test.mjs:26] <!-- C-104 -->
- **B-98** `update(dt)` applies gravity to `vy` unless the particle landed. It multiplies the horizontal velocity by `max(0, 1 - drag × dt)` and integrates the position. [src/kits/fx/view.js:55-60; test/kits/fx-particles.test.mjs:10] <!-- C-105 -->
- **B-99** With a `floor` function, a particle rests at `floor(x, z)` plus 0.02 for a quad or plus half its size for a cube. [src/kits/fx/view.js:34; src/kits/fx/view.js:59-67; test/kits/fx-particles.test.mjs:38] <!-- C-106 -->
- **B-100** On touching down while falling, `vy` becomes `-vy × bounce` and the horizontal velocity scales by `friction`. The particle lands when `vy` < 1. [src/kits/fx/view.js:59-67; test/kits/fx-particles.test.mjs:38] <!-- C-106 -->
- **B-101** A landed quad lies flat and stops spinning. Other particles tumble about a fixed axis, and their spin grows by 4 rad/s. [src/kits/fx/view.js:68-71; test/kits/fx-particles.test.mjs:52] <!-- C-107 -->
- **B-102** `update(dt)` uploads only the written range of instance matrices and colours. [src/kits/fx/view.js:74-81; test/kits/fx-particles.test.mjs:60] <!-- C-108 -->
- **B-103** When no particle lives, `update(dt)` resets the ring and sets `mesh.count` to 0. The `live` getter returns the live particle count. [src/kits/fx/view.js:74-81; test/kits/fx-particles.test.mjs:60] <!-- C-108 -->
- **B-104** Particle `dispose()` removes the mesh from its parent and frees the mesh. It frees the geometry and material only when `createParticles` made them. [src/kits/fx/view.js:79-80; test/kits/fx-particles.test.mjs:82] <!-- C-109 -->
- **B-105** `marks.add(x, z, nx, nz, alpha = 1)` writes a flat quad along the direction `(nx, nz)` and returns the slot index. [src/kits/fx/view.js:84-110; test/kits/fx-marks.test.mjs:10] <!-- C-111 -->
- **B-106** If the direction has zero length, `marks.add` returns -1. Length is along the direction and width across. The height is `heightAt(x, z)` (or 0) plus `lift`. [src/kits/fx/view.js:84-110; test/kits/fx-marks.test.mjs:29] <!-- C-111 -->
- **B-107** Alpha clamps to 0..1 and sets the mark width to `width × (0.5 + 0.5 × alpha)`. [src/kits/fx/view.js:99; test/kits/fx-marks.test.mjs:22] <!-- C-112 -->
- **B-108** Marks form a ring of `max` slots. `update()` uploads only the rows written since the last update. [src/kits/fx/view.js:96-119; test/kits/fx-marks.test.mjs:29] <!-- C-113 -->
- **B-109** Marks `dispose()` removes the mesh and frees the geometry. It frees the material only when the kit made it. [src/kits/fx/view.js:119; test/kits/fx-marks.test.mjs:40] <!-- C-113 -->

### Glyphs kit
- **B-110** `glyphFor(role, family)` returns the icon as a `data:image/svg+xml` URI, or null when the family has no input for the role. [src/kits/glyphs/view.js:9-17; test/kits/glyphs.test.mjs:10] <!-- C-116 -->
- **B-111** Pad families have every role. The `keys` family has no `prev` and no `next`. The `pointer` and `touch` families have only `confirm`. [test/kits/glyphs.test.mjs:7-8; test/kits/glyphs.test.mjs:10] <!-- C-117 -->
- **B-112** `familyFor(input, pad)` returns `pad` when `input` is `pad` and `pad` is a known family, else `xbox`. [src/kits/glyphs/view.js:18-19; test/kits/glyphs.test.mjs:21] <!-- C-118 -->
- **B-113** For another `input`, `familyFor` returns `input` when it is a known family, else `pointer`. [src/kits/glyphs/view.js:18-19; test/kits/glyphs.test.mjs:21] <!-- C-118 -->
- **B-114** `bindGlyphs(engine, { doc })` returns `{ update, dispose }` and keeps every `[data-lh-glyph]` element current. [src/kits/glyphs/view.js:21-39; test/kits/glyphs.test.mjs:29] <!-- C-119 -->
- **B-115** An `IMG` element gets its `src`. Any other element gets the CSS variable `--lh-glyph: url(...)`. The element gets `data-lh-glyph-family`. [src/kits/glyphs/view.js:21-39; test/kits/glyphs.test.mjs:29] <!-- C-119 -->
- **B-116** An element whose role is unknown or has no icon in the family gets `hidden = true`. [src/kits/glyphs/view.js:32-34] <!-- C-120 -->
- **B-117** The `doc` option defaults to `globalThis.document`. The family comes from the `data-lh-input` and `data-lh-pad` attributes of the html element. [src/kits/glyphs/view.js:1-4; src/kits/glyphs/view.js:25; src/kits/glyphs/view.js:41] <!-- C-120 -->
- **B-118** `update()` repaints only when the family changes or a MutationObserver saw added or changed glyph markup. `dispose()` disconnects the observer. [src/kits/glyphs/view.js:22-29; src/kits/glyphs/view.js:40-45] <!-- C-121 -->

### Terrain kit
- **B-119** Heights are row-major: `heights[iz × nx + ix]` at `(x0 + ix × cell, z0 + iz × cell)`. [src/kits/terrain/sim.js:1-4; src/kits/terrain/sim.js:16; test/kits/terrain-rapier.test.mjs:18] <!-- C-127 -->
- **B-120** `createTerrain` copies the heights to a `Float32Array`, so `heightAt` agrees with the ray casts of Rapier. [src/kits/terrain/sim.js:16; test/kits/terrain-rapier.test.mjs:18] <!-- C-127 -->
- **B-121** The collider material is `opts.material`. Without it, the collider material is the most common registry index of a `materials` array, with ties to the lowest index. [src/kits/terrain/sim.js:27-28; src/kits/terrain/sim.js:76-83; test/kits/terrain.test.mjs:46] <!-- C-128 -->
- **B-122** If `materials` is a function and `opts.material` is unset, the collider material is the function value at the grid centre. [src/kits/terrain/sim.js:27-28; test/kits/terrain.test.mjs:46] <!-- C-128 -->
- **B-123** `createTerrain` calls `world.heightfield` with `nx`, `nz`, `cell`, `x0`, `z0`, the float32 heights, the collider material and `fixInternalEdges`. The terrain entity is its result. [src/kits/terrain/sim.js:30; src/kits/terrain/sim.js:33; test/kits/terrain.test.mjs:72] <!-- C-129 -->
- **B-124** If `opts.groups` is unset and the World declares a `ground` collision group, the terrain joins it as `{ member: ['ground'] }`. [src/kits/terrain/sim.js:31-32; test/kits/terrain-rapier.test.mjs:45] <!-- C-130 -->
- **B-125** If `opts.groups` is unset and the World has no `ground` group, the heightfield gets no groups. An explicit `opts.groups` passes through. [src/kits/terrain/sim.js:31-32; test/kits/terrain.test.mjs:72] <!-- C-130 -->
- **B-126** `heightAt(x, z)` interpolates with the Rapier cell split along the `(ix+1, iz)`-`(ix, iz+1)` diagonal. [src/kits/terrain/sim.js:2-4; src/kits/terrain/sim.js:54-58; test/kits/terrain.test.mjs:21] <!-- C-131 -->
- **B-127** `heightAt` clamps `x` and `z` to the grid, so a point outside gives the edge height. [src/kits/terrain/sim.js:36-44; test/kits/terrain.test.mjs:14] <!-- C-131 -->
- **B-128** `normalAt(x, z, out)` writes the unit normal of the same triangle into `out.x`, `out.y` and `out.z`, and returns `out`. [src/kits/terrain/sim.js:59-65; test/kits/terrain.test.mjs:27] <!-- C-132 -->
- **B-129** If `materials` is a function, `materialAt(x, z)` is that function. With an array, `materialAt` returns the id of the nearest sample, with `x` and `z` clamped to the grid. [src/kits/terrain/sim.js:45-50; src/kits/terrain/sim.js:66; test/kits/terrain.test.mjs:38] <!-- C-133 -->
- **B-130** `blendAt(x, z, out)` calls `opts.blend(x, z, out)` when given. [src/kits/terrain/sim.js:67-71; test/kits/terrain.test.mjs:56] <!-- C-134 -->
- **B-131** Without `blend`, `blendAt` sets `out.a` and `out.b` to `materialAt(x, z)` and `out.w` to 0, and returns `out`. [src/kits/terrain/sim.js:67-71; test/kits/terrain.test.mjs:56] <!-- C-134 -->
- **B-132** The chunk side is `chunkCells` when set. Otherwise the side is the cells per chunk from the `chunks` counts, rounded up to a multiple of the coarsest LOD step. [src/kits/terrain/view.js:47-49; test/kits/terrain-view.test.mjs:135] <!-- C-141 -->
- **B-133** A chunk that starts past the grid is left out. [src/kits/terrain/view.js:55-60] <!-- C-141 -->
- **B-134** A material option that is a three.js material is used as is. Otherwise `createTerrainMesh` calls `compiler.get(material, { vertexColors: !!colorAt })`. [src/kits/terrain/view.js:43; test/kits/terrain-view.test.mjs:95; test/kits/terrain-view.test.mjs:110] <!-- C-140 -->
- **B-135** A chunk builds lazily per LOD. LOD 0 vertices sit on the height samples. [src/kits/terrain/view.js:64-81; test/kits/terrain-view.test.mjs:17] <!-- C-142 -->
- **B-136** Neighbour chunks share their edge vertices at one LOD, because normals come from the grid at the LOD spacing. [src/kits/terrain/view.js:64-81; test/kits/terrain-view.test.mjs:47] <!-- C-142 -->
- **B-137** Each chunk has four skirts, which are copies of the edge vertices hung `skirt` metres lower. The surface faces up and each skirt faces out of its chunk. [src/kits/terrain/view.js:9-27; src/kits/terrain/view.js:82-89; test/kits/terrain-view.test.mjs:32] <!-- C-143 -->
- **B-138** `chunkIndex` uses `Uint32Array` when the chunk has more than 65535 vertices, else `Uint16Array`. [src/kits/terrain/view.js:27] <!-- C-143 -->
- **B-139** `colorAt(x, z, rgb, normalY)` fills vertex colours. Each `attributes` entry `{ size, at(x, z, out) }` adds a float attribute of that size. [src/kits/terrain/view.js:42; src/kits/terrain/view.js:75-80; test/kits/terrain-view.test.mjs:95] <!-- C-144 -->
- **B-140** `drop(x, z, lodIndex)` lowers a vertex height. [src/kits/terrain/view.js:70] <!-- C-144 -->
- **B-141** Each chunk geometry gets its own copy of the index. Disposing one geometry then frees no buffer that other chunks at the same LOD still draw with. [src/kits/terrain/view.js:95; test/kits/terrain-view.test.mjs:162] <!-- C-145 -->
- **B-142** `update(camera)` returns at once when a first update ran, nothing is pending and the camera moved less than `moveEps` in x and z. [src/kits/terrain/view.js:101-114; test/kits/terrain-view.test.mjs:56] <!-- C-146 -->
- **B-143** Otherwise `update(camera)` picks a LOD per chunk from the distance to the chunk box. [src/kits/terrain/view.js:101-114; test/kits/terrain-view.test.mjs:56] <!-- C-146 -->
- **B-144** A chunk takes the first LOD whose `lodFar` distance is above its distance. A chunk at a finer LOD stays at it until the distance reaches that `lodFar` plus `hysteresis`. [src/kits/terrain/view.js:111-114; test/kits/terrain-view.test.mjs:56] <!-- C-147 -->
- **B-145** A chunk beyond `visFar` is hidden. [src/kits/terrain/view.js:111] <!-- C-147 -->
- **B-146** The first update builds with no time limit. Later updates stop building after `budgetMs`. [src/kits/terrain/view.js:104-106; src/kits/terrain/view.js:116-123; test/kits/terrain-view.test.mjs:68] <!-- C-148 -->
- **B-147** When the budget runs out, a chunk shows a LOD it has, else it builds its coarsest LOD at once. `stats.pending` is true. Pending builds finish on later updates. [src/kits/terrain/view.js:116-123; test/kits/terrain-view.test.mjs:68; test/kits/terrain-view.test.mjs:82] <!-- C-148 -->
- **B-148** When `evict` is set, `update` disposes the geometry of LOD `k` for a chunk whose distance exceeds `evict[k]`. The geometry builds again when the camera returns. [src/kits/terrain/view.js:110; test/kits/terrain-view.test.mjs:121] <!-- C-149 -->
- **B-149** `dispose()` frees every built geometry, empties the group of chunk meshes and removes the group from its parent. [src/kits/terrain/view.js:134-141; test/kits/terrain-view.test.mjs:152] <!-- C-151 -->

### Vehicle kit
- **B-150** Each wheel spec needs `at` (a point `[x, y, z]` or `{x, y, z}`) or a `socket` name, and `radius` > 0. [src/kits/vehicle/sim.js:18; src/kits/vehicle/sim.js:59-64; test/kits/vehicle.test.mjs:56] <!-- C-155 -->
- **B-151** The kit reads a socket from `e.sockets[socket].p`. A wheel with neither `at` nor `socket`, or with an unknown socket, throws. [src/kits/vehicle/sim.js:59-64; test/kits/vehicle.test.mjs:56] <!-- C-155 -->
- **B-152** A wheel spec may name a part. The name must be a non-empty string and unique among the wheels, else `createVehicle` throws. [src/kits/vehicle/sim.js:65-70; test/kits/vehicle-parts.test.mjs:37] <!-- C-156 -->
- **B-153** Named wheels write `e.partXf`, merged with the game's own part names. [src/kits/vehicle/sim.js:100-101; test/kits/vehicle-parts.test.mjs:37] <!-- C-156 -->
- **B-154** Each step a named wheel writes its part pose into `e.partXf` in the chassis frame. The hub is the connection point moved down by the suspension length. [src/kits/vehicle/sim.js:19-27; src/kits/vehicle/sim.js:128; test/kits/vehicle-parts.test.mjs:18] <!-- C-157 -->
- **B-155** The part pose is steered about +y, then rolled about the axle by minus the wheel rotation. [src/kits/vehicle/sim.js:19-27; test/kits/vehicle-parts.test.mjs:18] <!-- C-157 -->
- **B-156** `createVehicle` adds one Rapier wheel per spec. It uses the spec radius, a down ray and the axle for the forward axis. [src/kits/vehicle/sim.js:12-13; src/kits/vehicle/sim.js:72-82] <!-- C-158 -->
- **B-157** The suspension rest length is `suspension.rest`, with a default of 0.3. The spec `suspension` keys `stiffness`, `compression`, `relaxation`, `travel` and `maxForce` apply when set. [src/kits/vehicle/sim.js:72-82] <!-- C-158 -->
- **B-158** Engine force greater than 0 drives the chassis along +x or +z, as `forward` is `x` or `z`. The kit sets the forward axis index of Rapier and the axle sign for that. [src/kits/vehicle/sim.js:10-12; src/kits/vehicle/sim.js:73; test/kits/vehicle.test.mjs:28] <!-- C-159 -->
- **B-159** The `slip` and `side` values of a wheel start at the spec values, else the own defaults of Rapier. [src/kits/vehicle/sim.js:83-84] <!-- C-160 -->
- **B-160** Each wheel has five controls: `steer`, `engine`, `brake`, `slip` and `side`. [src/kits/vehicle/sim.js:14; src/kits/vehicle/sim.js:83-84] <!-- C-160 -->
- **B-161** `car.set(i, { steer, engine, brake, slip, side })` sets only the given controls of wheel `i` and returns the car. The new values reach the controller on the next update. [src/kits/vehicle/sim.js:104-113; test/kits/vehicle.test.mjs:44] <!-- C-161 -->
- **B-162** `car.update(dt)` pushes the controls to the controller and runs `updateVehicle(dt)` with the ray mask. [src/kits/vehicle/sim.js:114-130; test/kits/vehicle.test.mjs:12] <!-- C-162 -->
- **B-163** After `updateVehicle`, `car.update` reads `inContact`, the contact point, the normal, the suspension length, the steering and the suspension force for each wheel. [src/kits/vehicle/sim.js:122-129; test/kits/vehicle.test.mjs:12] <!-- C-162 -->
- **B-164** `VEHICLE_SYSTEM` calls `update` once per step. Games do not call `update`. [src/kits/vehicle/sim.js:114-115] <!-- C-162 -->
- **B-165** With `grip: true`, the `slip` and `side` values scale by the pair friction of the wheel from the previous step. Without `grip`, the factor is 1. [src/kits/vehicle/sim.js:117-119; test/kits/vehicle-material.test.mjs:32] <!-- C-163 -->
- **B-166** Each wheel in contact reads the ground material. If the ray hit the terrain collider, the material is `terrain.materialAt` at the contact point. [src/kits/vehicle/sim.js:89-99; test/kits/vehicle-material.test.mjs:11] <!-- C-164 -->
- **B-167** If the ray hit another collider, the material is the material of that collider from `world.materialOf`. A wheel in the air gets material null. [src/kits/vehicle/sim.js:89-99; test/kits/vehicle-material.test.mjs:21] <!-- C-164 -->
- **B-168** `rayGroups` is `{ member, filter }` of declared collision group names. With `rayGroups`, the wheel rays use `world.groups.mask(member, filter)` as a u32. [src/kits/vehicle/sim.js:38-46; test/kits/vehicle.test.mjs:96] <!-- C-166 C-167 -->
- **B-169** Without `rayGroups`, the wheel rays have no group filter. An empty `member` means every group, for the wheel rays only. [src/kits/vehicle/sim.js:38-46; test/kits/vehicle.test.mjs:96] <!-- C-166 C-167 -->
- **B-170** `createVehicle` installs one `VEHICLE_SYSTEM` per engine, in stage `physics.world` before `lh.physics.step`. [src/kits/vehicle/sim.js:8-9; src/kits/vehicle/sim.js:28-36; test/kits/vehicle.test.mjs:88] <!-- C-168 -->
- **B-171** `VEHICLE_SYSTEM` updates the cars of the current World in creation order. [src/kits/vehicle/sim.js:28-36; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-168 -->
- **B-172** Tuning stays in the game. A game system before `VEHICLE_SYSTEM` calls `car.set()`. [src/kits/vehicle/sim.js:3-4; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-169 -->
- **B-173** A game system after `VEHICLE_SYSTEM` and before `lh.physics.step` may read `car.wheels` and add impulses. [src/kits/vehicle/sim.js:3-4; test/kits/vehicle-lifecycle.test.mjs:43] <!-- C-169 -->
- **B-174** When the entity despawns or the World clears, the kit removes the car from the update list and frees the Rapier controller once. [src/kits/vehicle/sim.js:135-141; test/kits/vehicle-lifecycle.test.mjs:11; test/kits/vehicle-lifecycle.test.mjs:21] <!-- C-170 -->
- **B-175** A scene change leaves the vehicles of the scene with its World. [test/kits/vehicle-lifecycle.test.mjs:34] <!-- C-170 -->
- **B-176** The sim kits are deterministic and keep no memory per step. A recorded drive replays to the same checksums. [test/kits/kits-sim.test.mjs:15; test/kits/kits-sim.test.mjs:20; test/kits/kits-sim.test.mjs:27] <!-- C-173 -->

## Data and state

### Material blocks
| Block | Fields and ranges | Evidence |
| --- | --- | --- |
| Top-level keys | `extends`, `look`, `phys`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `fluid`, `sound`, `fx`, `game`. Every block is optional. | [src/defs/materials.js:41-61] <!-- C-15 --> |
| `look` colours | `color`, `sheenColor`, `emissive`: `#rgb`, `#rrggbb` or an integer 0..0xffffff | [src/defs/materials.js:29; src/defs/materials.js:43-46] <!-- C-16 --> |
| `look` unit values | `metalness`, `roughness`, `clearcoat`, `clearcoatRoughness`, `sheen`, `sheenRoughness`, `transmission`, `opacity`: 0..1 | [src/defs/materials.js:43-46] <!-- C-16 --> |
| `look` other | `ior` 1..2.333, `thickness` >= 0, `emissiveIntensity` >= 0, `transparent` boolean, `flatShading` boolean, `side` `front` or `double` | [src/defs/materials.js:45-46] <!-- C-17 --> |
| `look.subsurface` | `color`, `strength` 0..1 | [src/defs/materials.js:47] <!-- C-18 --> |
| `look.fur` | `length` 0.001..1, `shells` integer 1..32, `density` > 0, `tint` colour | [src/defs/materials.js:48] <!-- C-18 --> |
| `look.wear` | plain JSON data. The code accepts and ignores it in phase 3. | [src/defs/materials.js:49] <!-- C-18 --> |
| `phys` | `friction` 0..2, `restitution` 0..1, `sg` > 0, `fill` in (0, 1] | [src/defs/materials.js:24; src/defs/materials.js:51] <!-- C-19 --> |
| `tire` | `mu` >= 0, `C` > 0, `kp` > 0, `ap` > 0, `crr` >= 0, `drag` >= 0 | [src/defs/materials.js:40] <!-- C-20 --> |
| `dirtRate` | number >= 0 | [src/defs/materials.js:53] <!-- C-20 --> |
| `coverage` | `dirt`, `rust`, `snow`, `mud`, each 0..1 | [src/defs/materials.js:54] <!-- C-21 --> |
| `aero` | `skin` >= 0, `airfoil` `{ cl, cd, stall }`. A `cl` or `cd` curve needs at least 2 `[angle, value]` pairs of finite numbers. `stall` 0..90. | [src/defs/materials.js:30; src/defs/materials.js:55] <!-- C-21 --> |
| `magnet` | `strength` >= 0, `ferrous` 0..1 | [src/defs/materials.js:56] <!-- C-22 --> |
| `fluid` | `density` > 0, `viscosity` >= 0 | [src/defs/materials.js:57] <!-- C-22 --> |
| `sound`, `fx` | non-empty strings | [src/defs/materials.js:27; src/defs/materials.js:58-59] <!-- C-22 --> |
| `game` | plain JSON data. No schema check applies inside it. | [src/defs/materials.js:60] <!-- C-22 --> |
| Pair entry | `friction` 0..2, `restitution` 0..1, `tire`, `sound`, `fx` | [src/defs/materials.js:63] <!-- C-30 --> |

### Base library
- The base materials gravel, grass, dirt, mud, asphalt, snow and ice carry `tire` data and a `dirtRate`. Their `tire` values come from Rally's SURFACES. Asphalt is tarmac, dirt is hardpack and snow is packed snow. [src/defs/materials.base.js:3-4; src/defs/materials.base.js:63-111; test/materials-base.test.mjs:15] <!-- C-41 -->
- The base `dirtRate` values are gravel 0.006, grass 0.002, dirt 0.01, mud 0.03, asphalt 0, snow 0.004 and ice 0. [src/defs/materials.base.js:67; src/defs/materials.base.js:74; src/defs/materials.base.js:81; src/defs/materials.base.js:88; src/defs/materials.base.js:95; src/defs/materials.base.js:102; src/defs/materials.base.js:109] <!-- C-42 -->
- The base materials water and air have a `fluid` block and no `phys` block, so their collider density is 0. All other base materials have `phys` with `friction`, `restitution` and `sg`. [src/defs/materials.base.js:4; src/defs/materials.base.js:112-119; test/materials-base.test.mjs:33] <!-- C-43 -->
- The base `coverage` blocks differ per material. Steel accepts dirt, rust, mud and snow. Glass, mud, snow, water and air have no `coverage` block. [src/defs/materials.base.js:12; src/defs/materials.base.js:34-38; src/defs/materials.base.js:84-90; src/defs/materials.base.js:98-104] <!-- C-44 -->

### Sidecar shapes
| Shape | Fields besides `shape`, `p`, `q`, `part`, `material` | Evidence |
| --- | --- | --- |
| `box` | `half`, `round` | [src/defs/sidecar.js:6; src/defs/sidecar.js:24-25] <!-- C-47 --> |
| `sphere` | `r` | [src/defs/sidecar.js:24] <!-- C-47 --> |
| `capsule`, `cylinder` | `halfHeight`, `r` | [src/defs/sidecar.js:24] <!-- C-47 --> |
| `hull` | `points` | [src/defs/sidecar.js:24] <!-- C-47 --> |
| `mesh` | `vertices`, `indices` | [src/defs/sidecar.js:24] <!-- C-47 --> |

### Terrain and vehicle state
- `terrain.grid` is a frozen `{ nx, nz, cell, x0, z0, heights, materials }` for the view half. The `heights` value is the `Float32Array` copy. The `materials` value is a `Uint8Array` copy, or null when `materials` is a function. [src/kits/terrain/sim.js:25; src/kits/terrain/sim.js:53; test/kits/terrain.test.mjs:63] <!-- C-135 -->
- `stats` of the terrain mesh holds `chunks`, `builds`, `buildMs`, `lastUpdateMs` and `pending`. Each chunk mesh is named `terrain-chunk`, receives shadows and has `matrixAutoUpdate` false. The group is named `terrain`. [src/kits/terrain/view.js:53; src/kits/terrain/view.js:61; src/kits/terrain/view.js:126] <!-- C-150 -->
- Each `car.wheels` entry holds `front`, `radius`, `inContact`, `point`, `normal`, `material`, `pair`, `friction`, `suspension`, `steering` and `load`. [src/kits/vehicle/sim.js:85-86] <!-- C-165 -->
- The wheel `pair` is `registry.pair(tyre, ground)`. The wheel `friction` is the pair friction, or 1 without a pair. [src/kits/vehicle/sim.js:96-98] <!-- C-165 -->
- `GLYPH_FAMILIES` is the key list of `ICONS` in `src/kits/glyphs/icons.js`. `tools/glyphs/build.mjs` generates that file from Kenney Input Prompts 1.5A (CC0). The test names the families xbox, ps, deck, generic, keys, pointer and touch. [src/kits/glyphs/icons.js:1; src/kits/glyphs/view.js:8; test/kits/glyphs.test.mjs:8] <!-- C-115 -->
- The wire encodings and the kind fields are in the Behavior section. [src/defs/fields.js:6-30] <!-- C-70 -->

## Configuration

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `PHYS_DEFAULTS` | friction 0.5, restitution 0, sg 1, fill 1 | The values used when `phys` omits a field. Friction and restitution match Rapier's defaults. | [src/defs/materials.js:7] <!-- C-3 --> |
| `MAX_MATERIALS` | 255 | The most materials in one registry. The limit keeps `index()` inside a `Uint8Array` cell. | [src/defs/materials.js:8; src/defs/materials.js:132] <!-- C-7 --> |
| `TUNE` | `snapAt` 1.5, `nudge` 6, `smoothMs` 150 | Defaults for `kind` option `tune`. | [src/defs/fields.js:32] <!-- C-74 --> |
| `SEND` | `hz` 20, `key` 2 | Defaults for `kind` option `send`. A keyframe goes out every 2 s. | [src/defs/fields.js:33] <!-- C-74 --> |
| `REMOTES`, `FOLLOWS` | `driven`, `proxy`, `view` and `interp`, `forecast` | The allowed values of `remote` and `follow`. | [src/defs/fields.js:31] <!-- C-74 --> |
| `INPUT_BATCH` | 8 | The base count of inputs in a driven record. | [src/defs/fields.js:34] <!-- C-75 --> |
| `INPUT_WIRE_MAX` | 64 | The most inputs one record may carry. | [src/defs/fields.js:35] <!-- C-75 --> |
| `coverageKit` options | `washes` `[]`, `washTime` 1.5, `layer` `coverageLayer` | `materialAt` has no default and is required. | [src/kits/coverage/sim.js:12] <!-- C-84 --> |
| `createParticles` options | `max` 1200, `shape` `cube`, `geometry` null, `material` null, `gravity` 9.8, `drag` 0.5, `floor` null, `bounce` 0, `friction` 1 | Pool and physics settings. | [src/kits/fx/view.js:12-13] <!-- C-100 --> |
| `createMarks` options | `max` 400, `width` 0.45, `length` 0.9, `material` null, `heightAt` null, `lift` 0.06 | Mark settings. The default material is a transparent brown `MeshBasicMaterial` with opacity 0.4. | [src/kits/fx/view.js:86-90] <!-- C-110 --> |
| `createTerrain` options | `nx`, `nz`, `cell`, `x0` 0, `z0` 0, `heights`, `materials`, `blend` null, `material`, `groups`, `fixInternalEdges` false | Heightfield and sampling settings. | [src/kits/terrain/sim.js:10] <!-- C-123 --> |
| `createTerrainMesh` options | `compiler` null, `chunks` `[6, 6]`, `chunkCells` null, `lods` `[1]`, `lodFar` `[]`, `hysteresis` 12, `skirt` 2, `visFar` Infinity, `evict` null, `colorAt` null, `attributes` `{}`, `drop` null, `material` `grass`, `budgetMs` 3, `moveEps` 2, `now` `performance.now` | Chunk, LOD and build settings. | [src/kits/terrain/view.js:31-32] <!-- C-137 --> |
| `createVehicle` options | `wheels`, `rayGroups`, `forward` `x`, `terrain` null, `tyre` `rubber`, `grip` false | Vehicle settings. | [src/kits/vehicle/sim.js:53] <!-- C-153 --> |

## Errors and limits

All errors are thrown `Error` objects. The message prefixes vary by module: `materials:`, `sidecar:`, `phys:`, `coverage:`, `fx:`, `terrain:`, `terrain view:`, `vehicle:` and `glyphs:`. The `fields.js` errors have no module prefix.

### Material registry
- defineMaterials throws if `entries` or `options` is not a plain object. [src/defs/materials.js:116-118] <!-- C-4 -->
- defineMaterials throws `materials: unknown option '<k>'` for any option key other than `pairs`. [src/defs/materials.js:116-118] <!-- C-4 -->
- A game entry with a base id and an `extends` key throws `materials: '<id>' overrides the base entry and cannot extend '<parent>'`. [src/defs/materials.js:126-129] <!-- C-6 -->
- More than 255 materials throw `materials: <n> materials, at most 255`. [src/defs/materials.js:8; src/defs/materials.js:132] <!-- C-7 -->
- An `extends` that names no entry throws `materials: '<id>' extends unknown '<parent>'`. [src/defs/materials.js:142-143] <!-- C-9 -->
- An `extends` cycle throws `materials: extends cycle a -> b -> a`. [src/defs/materials.js:142-143] <!-- C-9 -->
- An entry id that contains `|` throws `materials: '<id>' id must not contain '|' (pair keys use it)`. [src/defs/materials.js:76] <!-- C-11 -->
- An entry id that starts with `paint-` throws, because the prefix is reserved for paint slots (A-4). [src/defs/materials.js:77] <!-- C-12 -->
- An entry that is not a plain object throws `materials: '<id>' must be an object (got <value>)`. [src/defs/materials.js:66-80] <!-- C-13 -->
- A top-level key outside the schema fails as `unknown block`. An unknown key in a nested block fails as `unknown field`. [src/defs/materials.js:66-80] <!-- C-13 -->
- A field error reads `materials: '<id>'<path> <problem> (got <value>)`. The value text is cut to 57 characters plus `...` when it exceeds 60 characters. [src/defs/materials.js:11-17; src/defs/materials.js:75] <!-- C-14 -->
- `byIndex(i)` throws `materials: no material at index <i>` if `i` is not an integer in 0..`ids.length`-1. [src/defs/materials.js:213] <!-- C-24 -->
- A pair table that is not a plain object throws `materials: pairs must be an object`. [src/defs/materials.js:101-106] <!-- C-28 -->
- A pair key that is not `a|b` throws `materials: pair '<key>' must be 'a|b'`. [src/defs/materials.js:101-106] <!-- C-28 -->
- A pair key with an unknown id throws `materials: pair '<key>' names unknown material '<id>'`. [src/defs/materials.js:101-106] <!-- C-28 -->
- Two keys that name the same unordered pair, such as `a|b` and `b|a`, throw `materials: pair '<key>' repeats '<first key>'`. [src/defs/materials.js:107-108] <!-- C-29 -->
- A missing field in a complete pair `tire` throws `materials: pair '<key>'.tire.<f> required when neither '<a>' nor '<b>' has tyre data (got undefined)`. [src/defs/materials.js:165-172] <!-- C-31 -->

### Sidecar
- A collider error reads `<where>: <path>.<field> <problem> (got <value>)`. The defaults for `where` and `path` are `collider`. [src/defs/sidecar.js:30-33] <!-- C-48 -->
- The shape `ball` fails with `unknown shape (use 'sphere')`. Any other unknown shape fails with the list of shapes. [src/defs/sidecar.js:30-33] <!-- C-48 -->
- A collider key that its shape does not allow fails as `unknown field for a <shape>`. A collider that is not a plain object fails as `must be an object`. [src/defs/sidecar.js:32; src/defs/sidecar.js:34-35] <!-- C-49 -->
- A hull outside 4 to 64 points fails. [src/defs/sidecar.js:7; src/defs/sidecar.js:55-58] <!-- C-54 -->
- Sidecar messages start with `sidecar: <model>`. The `model` option defaults to `?`. [src/defs/sidecar.js:73-79] <!-- C-57 -->

### Net fields
- `F.obj` throws `too many bools: <n>` above 8 bools. [src/defs/fields.js:14] <!-- C-67 -->
- `F.uint` throws `bad uint width <bytes>` for a width other than 1, 2 or 4. [src/defs/fields.js:8] <!-- C-69 -->
- `F.uint` throws `bad uint range <min>..<max>` if `min` or `max` is not an integer or `min` > `max`. [src/defs/fields.js:8] <!-- C-69 -->
- `F.actions` throws `F.actions: every action must be axis() or button()` for another action kind. [src/defs/fields.js:16-21] <!-- C-71 -->
- `F.body` throws `F.body: range must be in (0, 511] (got <range>)` when a u16 cannot hold the range. [src/defs/fields.js:25; test/net-fields.test.mjs:29] <!-- C-73 -->
- `F.body` throws `F.body: height must be in (0, 127] (got <height>)` when a u16 cannot hold the height. [src/defs/fields.js:26; test/net-fields.test.mjs:29] <!-- C-73 -->
- `kind(def)` throws `bad kind code <code>` if `def.code` is not an integer from 0 to 255. Other kind errors read `kind '<name>': <message>`. [src/defs/fields.js:39-40] <!-- C-76 -->
- `kind` fails if `remote` is not `driven`, `proxy` or `view`. [src/defs/fields.js:44-46; test/net-fields.test.mjs:46] <!-- C-78 -->
- `kind` fails if remote `driven` lacks an `input` `F.actions` field or a `body` `F.body()` field. `kind` also fails if the authority is not `owner`. [src/defs/fields.js:44-46; test/net-fields.test.mjs:46] <!-- C-78 -->
- An unknown key in `tune` or `send` fails as `unknown tune key '<k>'` or `unknown send key '<k>'`. [src/defs/fields.js:36; src/defs/fields.js:50; src/defs/fields.js:55] <!-- C-80 -->
- `kind` needs `tune.snapAt` > 0 and finite, `tune.nudge` an integer >= 1, and `tune.smoothMs` >= 0 and finite. [src/defs/fields.js:52-54; test/net-fields.test.mjs:46] <!-- C-81 -->
- `kind` needs `send.hz` > 0 and `send.key` > 0, both finite. The hooks `record`, `apply`, `newer`, `spawn` and `spawned` must be functions when set. [src/defs/fields.js:57-58; test/net-fields.test.mjs:46] <!-- C-81 -->
- `INPUT_WIRE_MAX` limits one driven record to 64 inputs. [src/defs/fields.js:35; src/defs/fields.js:60] <!-- C-75 -->

### Kits
- `coverageKit` throws `coverage: <message>` if `host` has no `.system` function or `materialAt` is not a function. It also throws if `washTime` is not > 0, `washes` is not an array or `layer` is not a function. [src/kits/coverage/sim.js:9; src/kits/coverage/sim.js:13-16; src/kits/coverage/sim.js:25; test/kits/coverage.test.mjs:69] <!-- C-85 -->
- A bad `washes` entry throws `coverage: washes[<k>] ...`. An entry `washTime` must be > 0. [src/kits/coverage/sim.js:17-24] <!-- C-86 -->
- `createParticles` throws `fx: max must be a positive integer (got <max>)` and `fx: shape must be 'cube' or 'quad' (got <shape>)`. `createMarks` throws the same `max` error. [src/kits/fx/view.js:6; src/kits/fx/view.js:14-15; src/kits/fx/view.js:87; test/kits/fx-particles.test.mjs:78] <!-- C-101 -->
- `glyphFor` throws `glyphs: unknown role '<role>'` or `glyphs: unknown family '<family>'`. [src/kits/glyphs/view.js:9-17; test/kits/glyphs.test.mjs:10] <!-- C-116 -->
- `createTerrain` throws `terrain: <message>` before it spawns anything. [src/kits/terrain/sim.js:7; test/kits/terrain.test.mjs:81] <!-- C-124 -->
- `createTerrain` requires `nx` and `nz` as integers >= 2, `cell` as a positive finite number, `x0` and `z0` as finite, and `heights` as `nx × nz` entries. [src/kits/terrain/sim.js:11-14] <!-- C-124 -->
- `createTerrain` fails if `blend` is not null or a function, or if a height is not finite. `createTerrain` also fails if `materials` is neither a `Uint8Array` nor a function. [src/kits/terrain/sim.js:15; src/kits/terrain/sim.js:17; src/kits/terrain/sim.js:21-26] <!-- C-125 -->
- A `materials` `Uint8Array` must hold `nx × nz` entries, and each entry must be a registry index. An unknown collider material fails as `unknown collider material '<id>'`. [src/kits/terrain/sim.js:22-24; src/kits/terrain/sim.js:29] <!-- C-126 -->
- `createTerrainMesh` throws `terrain view: <message>` if `terrain.grid` is missing. [src/kits/terrain/view.js:7; src/kits/terrain/view.js:34] <!-- C-138 -->
- `createTerrainMesh` also throws if `lods` is not a rising list of positive integers or `lodFar` does not hold one distance fewer than `lods`. [src/kits/terrain/view.js:34-39; test/kits/terrain-view.test.mjs:110] <!-- C-138 -->
- `createTerrainMesh` throws if `chunks` is not two integers >= 1, if an attribute lacks `{ size >= 1, at() }`, or if neither `compiler` nor a three.js material is given. [src/kits/terrain/view.js:40-43; test/kits/terrain-view.test.mjs:110] <!-- C-139 -->
- `createTerrainMesh` throws if `chunkCells` is not a positive multiple of the coarsest LOD step. [src/kits/terrain/view.js:46; test/kits/terrain-view.test.mjs:110] <!-- C-139 -->
- `createVehicle` throws `vehicle: <message>` before it makes a controller if the World has no engine, the entity has no body, or the body is not dynamic. [src/kits/vehicle/sim.js:16; src/kits/vehicle/sim.js:49-57; test/kits/vehicle.test.mjs:72] <!-- C-154 -->
- `createVehicle` also throws for an empty `wheels` list, a `forward` other than `x` or `z`, or an unknown `tyre` material. [src/kits/vehicle/sim.js:53-57; test/kits/vehicle-material.test.mjs:47] <!-- C-154 -->
- `car.set` throws `vehicle: wheel <i> out of range 0..<n-1>` if `i` is outside the wheel range. [src/kits/vehicle/sim.js:104-106; test/kits/vehicle.test.mjs:44] <!-- C-161 -->
- A `rayGroups` name that is undeclared, or is `mask`, throws `vehicle: rayGroups names undeclared group '<n>'`. [src/kits/vehicle/sim.js:38-46; test/kits/vehicle.test.mjs:96] <!-- C-166 -->

## Dependencies
- **Internal:** `src/core/rng.js` gives `fnv` for the registry hash (see the core spec). The kits call `world.materials`, `world.groups`, `world.rapier`, `world.engine`, `world.heightfield`, `world.materialOf`, `world.own`, `world.add`, `world.with` and `world.xfPrev`. The World belongs to a feature outside this spec. [src/defs/materials.js:4; src/kits/vehicle/sim.js:49-56; src/kits/vehicle/sim.js:95; src/kits/vehicle/sim.js:100; src/kits/vehicle/sim.js:137; src/kits/terrain/sim.js:33; src/kits/coverage/sim.js:30; src/kits/coverage/sim.js:42] <!-- C-171 C-172 -->
- **External:** the view kits fx and terrain import three. The sim kits import no three.js and get Rapier as `world.rapier`. [src/kits/vehicle/sim.js:5; src/kits/terrain/sim.js:5; src/kits/fx/view.js:4; src/kits/terrain/view.js:5] <!-- C-171 -->

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
- `docs/spec.md` 3.2 says `phys.fill` is 0-1. The code accepts only values in (0, 1] and rejects 0. [docs/spec.md:140; src/defs/materials.js:24; src/defs/materials.js:51]
- `docs/spec.md` 3.2 says the kit-vehicle tire backend reads the `tire` values. The vehicle kit reads only the pair friction. [docs/spec.md:141; src/kits/vehicle/sim.js:97-98]
- `docs/spec.md` A-5 says a sidecar holds aero panels and a closed volume from phase 8. The sidecar validator accepts only `v`, `source`, `parts`, `colliders`, `mass`, `sockets` and `bounds`. [docs/spec.md:449-453; src/defs/sidecar.js:79]
- `docs/spec.md` 3.1 gives the base library hash as `2f4f4f95`. This spec did not recompute the hash. A test pins it. [docs/spec.md:128; test/materials-hash.test.mjs:10]
- Why do the base materials glass, mud, snow, water and air have no `coverage` block? No source states the reason.
- Why does the particle landing threshold use `vy` < 1 with no named constant? No source states the reason.

## Evidence index
- `src/defs/materials.js`: the material registry, validation, pairs and hash.
- `src/defs/materials.base.js`: the 18 base materials.
- `src/defs/sidecar.js`: the sidecar and phys.json validators.
- `src/defs/fields.js`: the net field builders and `kind`.
- `src/kits/vehicle/sim.js`: the ray-cast vehicle kit.
- `src/kits/terrain/sim.js` and `src/kits/terrain/view.js`: the terrain kit.
- `src/kits/coverage/sim.js` and `src/kits/coverage/view.js`: the coverage kit.
- `src/kits/fx/view.js`: the particle and mark pools.
- `src/kits/glyphs/view.js` and `src/kits/glyphs/icons.js`: the glyph kit.
