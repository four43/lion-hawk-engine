---
id: F07
title: View sync, camera, assets and audio
status: as-built
source_commit: cb8b3d3
paths:
  - src/view/sync/**
  - src/view/camera/**
  - src/view/instancing/**
  - src/view/assets/**
  - src/view/audio/**
generated: STE spec writer
---

# View sync, camera, assets and audio

## Summary
This feature turns World entities into three.js objects each frame. The feature also loads baked models, draws instanced meshes and crowds, and moves the camera. The feature plays sound through buses, voices, cues, contact sounds and a DSP host. All code here is view-only. Sim code never imports it.

## Scope
- **In scope:** view sync and its netFix smoothing, the asset store and loader, anim tables, instanced meshes and crowds. Also in scope: three camera rigs, the projection helper, the audio service, cues, contact sounds and the DSP host.
- **Out of scope:** the material compiler, `warm`, `instancedShadows` and `disposeTree` (the view-render feature, F06, outline only). The `bindGesture` input module is in the [view-input spec](view-input.md). The World is in the [sim-world-physics spec](sim-world-physics.md). The `netFix` source is in the [net-replication spec](net-replication.md).

## Terms
See the [glossary](_meta/glossary.md). The terms below are specific to this feature.

- **instanced part:** one InstancedMesh for one mesh of a model. All entities drawn `'instanced'` with that model share it. [src/view/sync/index.js:48] <!-- C-56 -->
- **view sync record:** the per-entity record that view sync makes when the entity first appears. [src/view/sync/index.js:97] <!-- C-55 -->
- **camera mount point:** the `{ p, look? }` object that the mount rig reads, in body space. A camera mount point is not a socket node. [src/view/camera/mount.js:1-3] <!-- C-187 -->
- **crowd:** the group of one instanced mesh per anim-table part, made by `createCrowd`. [src/view/instancing/crowd.js:1] <!-- C-250 -->
- **bus:** a named gain node between the sources and `master`. Each bus has a level and a list of active ducks. [src/view/audio/index.js:10; src/view/audio/index.js:20] <!-- C-271 -->
- **duck:** a factor that multiplies the gain of a bus until the undo function of `audio.duck` runs. [src/view/audio/index.js:102-107] <!-- C-278 -->
- **voice:** a long-lived audio emitter made by `audio.voice`. Sources connect to `voice.input`, and the audio service places the voice against the listener. [src/view/audio/index.js:128] <!-- C-265 -->
- **cue:** a named sound made by `createCues`. A cue picks one of its clips and varies the gain and the rate. [src/view/audio/cues.js:1-3] <!-- C-267 -->

## Interfaces

### View sync

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createViewSync(engine, { gfx, assets = null, compiler = null, view = { dt: 0 }, root = null })` | in | Returns the view sync object | [src/view/sync/index.js:41] <!-- C-1 --> |
| `sync.root`, `sync.frame(alpha)`, `sync.objectOf(e)`, `sync.on(match, hooks)`, `sync.dispose()` | in and out | Members of the view sync object | [src/view/sync/index.js:198-236] <!-- C-5 --> |
| `sync.on(match, { create, frame, remove })` | in | Returns a function that removes the hook. Each callback is optional. | [src/view/sync/index.js:230-234] <!-- C-44 --> |
| `match` as `'#tag'`, `'model:<key>'`, `'net:<kind>'` or a function | in | A string needs at least 1 character after the prefix. | [src/view/sync/index.js:31-37] <!-- C-45 --> |
| `sync.objectOf(e)` | out | The entity Object3D, or `undefined` for no record, a record of another entity, or no Object3D | [src/view/sync/index.js:229] <!-- C-53 --> |
| `smooth.js`: `newOffset()`, `active(o)`, `addFix(o, fix, smoothMs)`, `fade(o, dt)`, `applyOffset(o, p, q)` | in | Plain-number offset functions | [src/view/sync/smooth.js:5-6; src/view/sync/smooth.js:10; src/view/sync/smooth.js:23; src/view/sync/smooth.js:33] <!-- C-58 --> |

### Assets

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createAssets({ manifest, base = './assets/', compiler = null, renderer = null, gfx = null, decoders = {}, fetch = globalThis.fetch })` | in | Returns the asset store | [src/view/assets/index.js:11] <!-- C-67 --> |
| `preload(keys, { instanced = [] })`, `progress`, `has(key)`, `get(key)`, `clone(key, { paint = null, instanced = false })`, `dispose()` | in and out | Members of the asset store | [src/view/assets/index.js:83; src/view/assets/index.js:99; src/view/assets/index.js:106; src/view/assets/index.js:127] <!-- C-70 --> |
| `sharedLoader({ ktx2 = null, draco = null, renderer = null })` | in | Returns the one GLTFLoader | [src/view/assets/loader.js:8] <!-- C-96 --> |
| `loadGlb(url, { fetch, loader })` | in | Returns `{ gltf, bytes }` | [src/view/assets/loader.js:21] <!-- C-96 --> |
| `loadJson(url, { fetch })` | in | Returns the parsed JSON | [src/view/assets/loader.js:27] <!-- C-96 --> |
| `decodeAnimTable(json)` | in | Returns a frozen table | [src/view/assets/animTable.js:7] <!-- C-101 --> |
| `sampleAnimTable(table, clip, t, partIndex, out)` | in | `out` is a Matrix4 or an object with a 16-element `elements` array | [src/view/assets/animTable.js:22-23] <!-- C-101 C-113 --> |
| `blendAnimTable(table, clipA, tA, clipB, tB, k, partIndex, out)` | in | Fills `out` | [src/view/assets/animTable.js:37] <!-- C-101 --> |
| `<model>.anim.json` | in | Per clip: frames x parts x 12 floats. The 12 floats are the Matrix4 elements without the bottom row (indices 0,1,2, 4,5,6, 8,9,10, 12,13,14). | [src/view/assets/animTable.js:1-5] <!-- C-102 --> |

### Instancing

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createInstances({ geometry, material, max, castShadow = true, receiveShadow = true, colors = false, coverage = false })` | in | Returns one InstancedMesh with a live count | [src/view/instancing/instances.js:14] <!-- C-227 --> |
| Instances object: `mesh`, `max`, `coverage`, `count`, `set`, `setMatrix`, `getMatrix`, `color`, `cover`, `copy`, `commit`, `dispose` | in and out | Members | [src/view/instancing/instances.js:31-60] <!-- C-232 --> |
| `instancedPart(o, compiler)` | in | Returns `{ holder, paint, coverage }` | [src/view/instancing/parts.js:6-12] <!-- C-240 --> |
| `createCrowd(asset, { max, compiler, castShadow = true, receiveShadow = true })` | in | Returns the crowd: `group`, `parts`, `count`, `set`, `cover`, `commit`, `dispose` | [src/view/instancing/crowd.js:17; src/view/instancing/crowd.js:34-56] <!-- C-244 --> |
| `crowd.parts[k]` | out | `{ name, inst, coverage }`. `inst` is the `createInstances` object of the part. | [src/view/instancing/crowd.js:6; src/view/instancing/crowd.js:31] <!-- C-258 --> |

### Camera

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createChaseRig(camera, opts = {})` | in | Returns the chase rig | [src/view/camera/chase.js:23-24] <!-- C-161 --> |
| Chase rig: `opts`, `yaw`, `follow(pose, dt)`, `snap(pose)`, `orbit(pose, dt)`, `shake(a)`, `blendFrom(q, time = 1)` | in and out | Members. `yaw` is a getter. | [src/view/camera/chase.js:74-93] <!-- C-167 --> |
| `rig.yaw` | out | The view heading for a stick. It is null before the first `follow` or `snap`. | [src/view/camera/chase.js:11-12; src/view/camera/chase.js:33; src/view/camera/chase.js:76] <!-- C-173 --> |
| Chase pose for `'heading'` | in | `{ x, y, z, yaw, fwd?, velYaw? }` | [src/view/camera/chase.js:5] <!-- C-168 --> |
| Chase pose for `'travel'` | in | `{ p, q, v }`: position, rotation, velocity | [src/view/camera/chase.js:9-10; src/view/camera/chase.js:55-60] <!-- C-168 --> |
| `createMountRig(camera, { socket, fovAdd = null })` | in | Returns the mount rig: `fovAdd`, `set(socket)`, `follow(pose)` | [src/view/camera/mount.js:10; src/view/camera/mount.js:15-30] <!-- C-184 --> |
| Camera mount point | in | `{ p, look? }`. Each is `[x, y, z]` or `{ x, y, z }` in body space. When `look` is missing, it is (0, 0.3, 20). | [src/view/camera/mount.js:1-3; src/view/camera/mount.js:14] <!-- C-187 --> |
| `createOrbitRig(camera, { target, distance, min, max, pitch, yaw, pitchMin, pitchMax, bounds, ground, canvas, chase, fit })` | in | Returns the orbit rig | [src/view/camera/orbit.js:20-22] <!-- C-191 --> |
| Orbit rig: `state`, `limits`, `gesture`, `orbiting`, `fit`, `apply`, `update`, `panBy`, `chase`, `release`, `ray`, `bindGesture` | in and out | Members | [src/view/camera/orbit.js:28-117] <!-- C-195 --> |
| `orbit.bindGesture(engine, element, { mode = () => 'orbit', tapMove = 12 })` | in | Returns a device `{ update(dt, raw), dispose() }`. When no `canvas` option was given, `element` becomes the element that `ray` uses. | [src/view/camera/orbit.js:69-71; src/view/camera/orbit.js:105-115] <!-- C-209 --> |
| `orbit.ray(cx, cy, out)` | out | `[ox, oy, oz, dx, dy, dz]` | [src/view/camera/orbit.js:13; src/view/camera/orbit.js:60-67] <!-- C-206 --> |
| `makeProject(camera, canvas)` | in | Returns `project([x, y, z], out = {})` with the member `project.ndc(x, y, z, out)` | [src/view/camera/project.js:7; src/view/camera/project.js:11; src/view/camera/project.js:17; src/view/camera/project.js:23] <!-- C-220 --> |

### Audio

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createAudio({ doc, flags, AudioContext, fetch, volume, limiter, positional, buses })` | in | Returns the audio service | [src/view/audio/index.js:13] <!-- C-115 --> |
| `audio.play(buffer, { gain = 1, rate = 1, pan = 0, at = null, when = 0, loop = false, offset = 0, bus = 'sfx' })` | in | Returns `{ source, gain, stop(t = 0) }` or `null` | [src/view/audio/index.js:108; src/view/audio/index.js:126] <!-- C-133 C-138 --> |
| `audio.load(url)` | in | Returns a promise of a decoded buffer | [src/view/audio/index.js:155-166] <!-- C-144 --> |
| `audio.mute(on)`, `audio.muted`, `audio.unlocked` | in and out | `mute` returns the muted state. The other two are read-only getters. | [src/view/audio/index.js:167-171; src/view/audio/index.js:187-188] <!-- C-152 --> |
| `audio.onUnlock(fn)`, `audio.onGesture(fn)` | in | Each returns a function that removes the callback | [src/view/audio/index.js:189-194] <!-- C-154 --> |
| `audio.listen(obj)` | in | Sets the listener object. `listen(null)` clears it. The service reads its `position` and `matrixWorld`. | [src/view/audio/index.js:87-90; src/view/audio/index.js:198] <!-- C-143 --> |
| `audio.distanceGain(x, y, z)`, `audio.dispose()` | in | Gain by planar distance, and cleanup | [src/view/audio/index.js:83; src/view/audio/index.js:197] <!-- C-141 -->
| `audio.bus(name)` | in | Returns the gain node of the bus, or `null` before the context exists | [src/view/audio/index.js:195] <!-- C-262 -->
| `audio.volume(name, v)` | in and out | Reads a level when `v` is undefined. Otherwise sets the level. Returns the level. The name `'master'` is the game volume. | [src/view/audio/index.js:95-101; src/view/audio/index.js:196] <!-- C-263 -->
| `audio.duck(name, { to = 0.3, attack = 0.05, release = 0.4 })` | in | Returns an undo function | [src/view/audio/index.js:102-107] <!-- C-264 -->
| `audio.voice({ bus = 'sfx', gain = 1, follow = null })` | in | Returns a voice `{ input, follow, audible, stopped, place, pn, stop() }`, or `null` | [src/view/audio/index.js:128-141] <!-- C-265 -->
| `audio.frame()` | in | Takes no argument. Places the voices that follow an object. The render pipeline calls it. | [src/view/audio/index.js:151-154; src/view/audio/index.js:197] <!-- C-266 -->
| `createCues(audio, defs, { rng })` | in | Returns `{ ready, has(id), play(id, { gain = 1, rate = 1, at, when = 0 }) }` | [src/view/audio/cues.js:7; src/view/audio/cues.js:25-28] <!-- C-267 -->
| `bindContactSounds(engine, cues, { min = 0.5, full = 20, gap = 0.12 })` | in | Returns the value of `engine.events.on`, which removes the handler | [src/view/audio/contacts.js:4; src/view/audio/contacts.js:14; test/audio-contacts.test.mjs:26] <!-- C-268 -->
| `createDsp(audio, { name, Class, channels = 2, options = {}, AudioWorkletNode })` | in | Returns a promise of `{ node, mode, send(msg), dispose() }` | [src/view/audio/dsp.js:25; src/view/audio/dsp.js:36; src/view/audio/dsp.js:40] <!-- C-269 -->
| `workletSource(name, Class)` | in | Returns the source text of an AudioWorklet module | [src/view/audio/dsp.js:7-15] <!-- C-270 --> |

## Behavior

### View sync frame
- **B-1** The sync root is one Group named `lh.sync`. It goes under `root`, or under `gfx.scene` when `root` is null. [src/view/sync/index.js:44; test/sync.test.mjs:82] <!-- C-4 -->
- **B-2** After `dispose`, `frame(alpha)` returns at once and does nothing. [src/view/sync/index.js:201; test/sync.test.mjs:73] <!-- C-6 -->
- **B-3** Each frame, before the World check, view sync adds `view.dt` (or 0) to `compiler.time.value`. This happens only when the compiler has a time object. It happens with or without a World. [src/view/sync/index.js:202; test/sync.test.mjs:78] <!-- C-7 -->
- **B-4** When `engine.world` differs from the World last drawn, or its serial changed, view sync drops every Object3D and every instanced mesh. [src/view/sync/index.js:203-204; test/sync.test.mjs:38] <!-- C-8 -->
- **B-5** When `engine.world` is null, `frame` draws nothing. [src/view/sync/index.js:205; test/sync.test.mjs:38] <!-- C-9 -->
- **B-6** Each frame, view sync visits the entities of `world.with('xf')` in spawn order. [src/view/sync/index.js:17; src/view/sync/index.js:207-208] <!-- C-10 -->
- **B-7** An entity is drawn only when `e.model` is not null and `e.draw` is not false. Other entities get no model Object3D. A create hook may still give one. [src/view/sync/index.js:99; test/sync.test.mjs:54] <!-- C-11 -->
- **B-8** When `assets` exists and `assets.has(e.model)` is false, view sync skips a new drawn entity and its hooks. The record is made on a later frame. [src/view/sync/index.js:2; src/view/sync/index.js:213; test/sync.test.mjs:88] <!-- C-15 -->
- **B-9** A drawn entity with `draw` undefined or `'object'` gets `assets.clone(e.model, { paint: e.paint })`. View sync names the clone `<model>#<id>` when it has no name. View sync adds the clone to the sync root. [src/view/sync/index.js:103; test/sync.test.mjs:12] <!-- C-12 -->
- **B-10** When the entity of a view sync record differs from the entity now under the same id, view sync removes the record. View sync then makes a new record with a new Object3D. [src/view/sync/index.js:211; test/sync.test.mjs:48] <!-- C-36 -->
- **B-11** View sync removes a view sync record whose entity was not seen in the frame. This covers despawned entities. [src/view/sync/index.js:226; test/sync.test.mjs:12] <!-- C-35 -->
- **B-12** Removing a view sync record runs the `remove` callbacks of its hooks and frees its instance indexes. The Object3D of the record leaves its parent. View sync disposes that Object3D when view sync made it, and keeps shared geometry. [src/view/sync/index.js:164-170; test/sync.test.mjs:12] <!-- C-52 -->
- **B-13** The second call of `sync.dispose()` does nothing. The first call removes every view sync record, disposes every instanced mesh and clears the hooks. It also removes the sync root from its parent. [src/view/sync/index.js:171-175; src/view/sync/index.js:235; test/sync.test.mjs:73] <!-- C-54 -->

### View sync pose
- **B-14** The drawn position is `lerp(prev, curr, alpha)`. The prev pose comes from `world.xfPrev`. The curr pose comes from `e.xf`. [src/view/sync/index.js:176-180; test/sync.test.mjs:22] <!-- C-28 -->
- **B-15** The drawn rotation is a normalised nlerp of prev and curr. When their dot product is below 0, view sync negates curr, so the short arc is used. [src/view/sync/index.js:181-183; test/sync.test.mjs:33] <!-- C-29 -->
- **B-16** After interpolation, view sync applies the netFix offset to the pose. It then scales by `e.scale` (1 when `e.scale` is undefined or null). [src/view/sync/index.js:184-185] <!-- C-30 -->
- **B-17** For an Object3D entity, view sync copies the pose into `obj.position` and `obj.quaternion`. It sets `obj.scale` to the scale. [src/view/sync/index.js:186] <!-- C-31 -->

### netFix smoothing
- **B-18** Each frame, view sync fades the entity offset by `view.dt`. When `e.netFix.seq` differs from the offset `seq`, view sync adds the fix. [src/view/sync/index.js:219-221; test/sync-netfix.test.mjs:9] <!-- C-37 -->
- **B-19** A new record starts with the `seq` of any netFix already on the entity. View sync does not replay that fix. [src/view/sync/index.js:98; test/sync-netfix.test.mjs:31] <!-- C-37 -->
- **B-20** A fix is the drawn-pose jump of a correction. Its `dp` is the old position minus the new position. Its `dq` is the old rotation times the inverse of the new rotation, both in the world frame. [src/view/sync/smooth.js:1-3; src/view/sync/smooth.js:9] <!-- C-66 -->
- **B-21** A fix with `smoothMs` of 0 or less (or missing) clears the offset. The offset still records the `seq`. [src/view/sync/smooth.js:9-12; test/sync-smooth.test.mjs:38] <!-- C-57 -->
- **B-22** `active(o)` is true while `o.left` is above 0. [src/view/sync/smooth.js:6] <!-- C-60 -->
- **B-23** For a fix with `smoothMs` above 0, `addFix` adds `fix.dp` to the offset position. It multiplies the offset rotation by `fix.dq`. Stacked corrections keep the drawn pose continuous. [src/view/sync/smooth.js:13-16; test/sync-smooth.test.mjs:20] <!-- C-61 -->
- **B-24** `addFix` negates the combined rotation when its `w` is below 0. It normalises the rotation and sets `left` to `smoothMs / 1000` s. [src/view/sync/smooth.js:17-20] <!-- C-62 -->
- **B-25** `fade(o, dt)` does nothing when `left` or `dt` is not above 0. When `dt` is at least `left`, `fade` clears the offset. [src/view/sync/smooth.js:24-25] <!-- C-63 -->
- **B-26** Otherwise `fade` scales the offset position by `1 - dt/left`. It takes a nlerp of the rotation from identity and reduces `left` by `dt`. The offset falls linearly to nothing over `smoothMs` of view time from the latest correction. [src/view/sync/smooth.js:26-30; test/sync-smooth.test.mjs:28] <!-- C-64 -->
- **B-27** `applyOffset` does nothing when `left` is not above 0. Otherwise it adds the offset position to `p` and sets `q` to the offset rotation times `q`. [src/view/sync/smooth.js:33-38; test/sync-netfix.test.mjs:18] <!-- C-65 -->

### Instanced drawing
- **B-28** On the first `'instanced'` entity of a model, view sync makes one `createInstances` per mesh of the template. Each has max 16. Each has `colors` when the part has a paint slot, and `coverage` when the part reads coverage. [src/view/sync/index.js:26; src/view/sync/index.js:48-58; test/sync-instanced.test.mjs:15] <!-- C-20 -->
- **B-29** Each instanced mesh is named `<model>:<mesh name>`. It takes the holder's `customDepthMaterial` when one exists. It gets `instancedShadows` and goes under the sync root. [src/view/sync/index.js:59-60; test/sync-instanced.test.mjs:106] <!-- C-21 -->
- **B-30** The part matrix of an instanced mesh is the inverse of the template `matrixWorld` times the source mesh `matrixWorld`. [src/view/sync/index.js:51-52; src/view/sync/index.js:61] <!-- C-22 -->
- **B-31** When an entity joins an instanced part, it takes the next free instance index. The mesh count becomes that index plus 1. [src/view/sync/index.js:75-78] <!-- C-23 -->
- **B-32** When an instanced part is full (owners equal max), `grow()` makes a new instanced mesh with double max. It copies matrices, colours, coverage and count, then disposes the old mesh. [src/view/sync/index.js:67-74; src/view/sync/index.js:77; test/sync-instanced.test.mjs:37] <!-- C-24 -->
- **B-33** When an entity joins a part with a paint slot, view sync sets the instance colour to `e.paint[slot]`. When `e.paint` has no value for the slot, the colour is `'#ffffff'`. [src/view/sync/index.js:79; test/sync-instanced.test.mjs:15] <!-- C-25 -->
- **B-34** For coverage parts, view sync writes `e.coverage` to `instanceCoverage` only when a value changed since the last write. The values are dirt, rust, snow and mud, each 0 when missing. A join forces a write. [src/view/sync/index.js:80; src/view/sync/index.js:83-88; test/sync-instanced.test.mjs:67] <!-- C-26 -->
- **B-35** When an instanced entity leaves, the last instance moves into its index with matrix, colour and coverage. The mesh count then drops by 1. [src/view/sync/index.js:89-95; test/sync-instanced.test.mjs:29] <!-- C-27 -->
- **B-36** View sync does not re-write an instanced entity when scale, position and rotation equal the pose last written. The compare uses the last written pose, not prev and curr. [src/view/sync/index.js:190-192; test/sync-instanced.test.mjs:48; test/sync-instanced.test.mjs:80; test/sync-instanced.test.mjs:86] <!-- C-32 -->
- **B-37** When an instanced entity changes, view sync writes each part matrix as the pose matrix times the part matrix. [src/view/sync/index.js:193-195] <!-- C-33 -->
- **B-38** At the end of each frame, view sync commits every instanced mesh. [src/view/sync/index.js:227] <!-- C-34 -->

### Part poses
- **B-39** View sync binds part nodes when the record's `e.partXf` or Object3D differs from the last bind. This runs after the create hooks and uses the Object3D that they left. [src/view/sync/index.js:122-126; src/view/sync/index.js:218; test/sync-parts.test.mjs:53] <!-- C-39 -->
- **B-40** The centre of a part node is the centre of its bounding box after the create hooks. For an empty box, the centre is the node rest position. [src/view/sync/index.js:136-137; test/sync-parts.test.mjs:26] <!-- C-41 -->
- **B-41** Each frame, view sync interpolates each part pose from `world.partXfPrev` to `e.partXf[name]` with the body alpha. It uses the short arc and divides metres by the scale. It writes the position, quaternion and scale of the part node. [src/view/sync/index.js:145-162; test/sync-parts.test.mjs:13] <!-- C-42 -->
- **B-42** The World can mark a part half as rest. If that half holds the default pose, view sync draws the node rest centre with identity rotation. A rest value of 1 or more applies to prev. A rest value of 2 applies to curr. A render before the first step is not at the origin. [src/view/sync/index.js:150-155; test/sync-world.test.mjs:34] <!-- C-43 -->

### Sync hooks
- **B-43** Hooks run in registration order. `create(e, obj, view)` runs once per entity when the hook first matches. `frame(e, obj, alpha, view)` runs after the pose. `remove(e, obj)` runs before the Object3D goes. [src/view/sync/index.js:109-121; src/view/sync/index.js:164-165; src/view/sync/index.js:223-224; test/sync-hooks.test.mjs:8] <!-- C-47 -->
- **B-44** Create hooks receive `obj` null for instanced entities and for entities with no drawn model. A later hook of an undrawn entity receives any Object3D that a create hook returned. [src/view/sync/index.js:11-14; src/view/sync/index.js:97; src/view/sync/index.js:115] <!-- C-48 -->
- **B-45** When a create hook returns an Object3D that is not the entity Object3D, the returned Object3D becomes the entity Object3D. It goes under the sync root. View sync removes and disposes any model clone that it replaces. [src/view/sync/index.js:116-119; test/sync-hooks.test.mjs:27] <!-- C-49 -->
- **B-46** View sync does not dispose an Object3D that a hook returned. Disposal is the job of the hook. [src/view/sync/index.js:13-14; src/view/sync/index.js:118] <!-- C-50 -->
- **B-47** A hook added after entities exist meets them on the next frame. Adding or removing a hook raises an internal version number. Each record re-matches when its version differs. [src/view/sync/index.js:217; src/view/sync/index.js:232-233; test/sync-hooks.test.mjs:34] <!-- C-51 -->

### Asset store
- **B-48** `createAssets` adds a trailing `/` to `base` when it has none. [src/view/assets/index.js:13] <!-- C-69 -->
- **B-49** The asset store fetches each URL once, even under overlapping preloads. It caches the promise per URL. [src/view/assets/index.js:15; src/view/assets/index.js:27-31; test/assets.test.mjs:34] <!-- C-71 -->
- **B-50** When a URL load fails, the asset store drops its cached promise, so a failed key can be retried. [src/view/assets/index.js:29; test/assets.test.mjs:56] <!-- C-72 -->
- **B-51** Loading a key fetches `base` plus the manifest entry `glb`, and `base` plus its `anim` when the entry has one. The fetches run in parallel. The anim file passes through `decodeAnimTable`. [src/view/assets/index.js:58-63] <!-- C-73 -->
- **B-52** The asset store makes a template from a loaded model unless the store is disposed or the key is already ready. The template is frozen and holds `{ scene, clips, anim, sockets }`. [src/view/assets/index.js:54; src/view/assets/index.js:64; test/assets.test.mjs:76] <!-- C-76 -->
- **B-53** A template sets `castShadow` and `receiveShadow` to true on every mesh. It marks each mesh geometry `userData.lhShared`, so clones share the geometry. [src/view/assets/index.js:38-41] <!-- C-77 -->
- **B-54** A template reads each node whose name starts with `sock-` into `sockets[name without prefix]`. The value is a frozen `{ name, p, q }` of the node world position and rotation. [src/view/assets/index.js:42-46; test/assets.test.mjs:76] <!-- C-78 -->
- **B-55** When a compiler exists, a template compiles its scene with `compiler.apply` and disposes the old glTF materials. The compiled materials keep the textures. [src/view/assets/index.js:48-53; test/assets.test.mjs:76] <!-- C-79 -->
- **B-56** The asset store records a key as skinned when any mesh of the key is a SkinnedMesh. [src/view/assets/index.js:37] <!-- C-80 -->
- **B-57** When a key fails to load, the asset store removes its tracking and subtracts 1 from `progress.total`. [src/view/assets/index.js:76] <!-- C-82 -->
- **B-58** `preload` removes duplicate keys. It checks every key against the manifest before it loads any. [src/view/assets/index.js:85-86] <!-- C-84 -->
- **B-59** When a compiler exists, `preload` makes the instanced variant of every non-skinned mesh of each `{ instanced }` model before it warms. Painted parts use the `'instancedColor'` use. The other parts use `'instanced'`. [src/view/assets/index.js:80-95; test/assets.test.mjs:131] <!-- C-86 -->
- **B-60** For an instanced mesh with a depth twin, `preload` adds a depth entry. The entry has the same use and the side of the holder material. [src/view/assets/index.js:94] <!-- C-88 -->
- **B-61** When `gfx.warm` exists, `preload` resolves after `gfx.warm()` resolves. It passes `{ materials, depth }` when instanced variants exist, and `undefined` otherwise. [src/view/assets/index.js:80; src/view/assets/index.js:96; test/assets.test.mjs:45] <!-- C-87 -->
- **B-62** `has(key)` is true when the key is ready. [src/view/assets/index.js:127] <!-- C-90 -->
- **B-63** `clone(key)` returns `SkeletonUtils.clone` of the scene for a skinned key, and `scene.clone(true)` for other keys. Clones share the geometry and materials. [src/view/assets/index.js:106-111; test/assets.test.mjs:93; test/assets.test.mjs:107] <!-- C-91 -->
- **B-64** When a compiler exists and `paint` or `instanced` is set, `clone` recompiles only the clone with `compiler.apply(root, { paint, instanced })`. [src/view/assets/index.js:109; test/assets.test.mjs:93] <!-- C-92 -->
- **B-65** The second call of `dispose()` does nothing. The first call frees template geometry and the textures of template materials. It then clears the ready, file and tracking maps. [src/view/assets/index.js:113-124; test/assets.test.mjs:121] <!-- C-93 -->

### Loader
- **B-66** `sharedLoader` makes one GLTFLoader per page with the meshopt decoder set. Every call returns that loader. [src/view/assets/loader.js:7-9; src/view/assets/loader.js:12; test/assets-loader.test.mjs:10] <!-- C-97 -->
- **B-67** The game passes the KTX2 and Draco loaders, and the engine bundles neither. When `ktx2` and a renderer are given, `sharedLoader` calls `ktx2.detectSupport(renderer)` before it sets the KTX2 loader. [src/view/assets/loader.js:1-3; src/view/assets/loader.js:10-11; test/assets-loader.test.mjs:32] <!-- C-98 -->
- **B-68** `loadGlb` fetches the bytes itself and parses them with `loader.parseAsync`. The base path is the URL up to its last `/`. It returns `{ gltf, bytes }`. [src/view/assets/loader.js:3; src/view/assets/loader.js:21-25] <!-- C-99 -->

### Anim tables
- **B-69** `decodeAnimTable` reads the `data` field of each clip as base64 into a Float32Array. It returns a frozen `{ fps, parts, clips }`. Each clip is a frozen `{ dur, frames, data }`. [src/view/assets/animTable.js:13-19; test/assets-animTable.test.mjs:18] <!-- C-107 -->
- **B-70** A table with no `clips` field decodes with no clips. [src/view/assets/animTable.js:11] <!-- C-108 -->
- **B-71** `sampleAnimTable` loops the clip. The frame position is `((t / dur) mod 1)` times `frames`. It lerps element-wise between a frame and the next. The last frame blends back to the first. [src/view/assets/animTable.js:3-4; src/view/assets/animTable.js:28-30; test/assets-animTable.test.mjs:29] <!-- C-111 -->
- **B-72** `sampleAnimTable` writes the 12 floats into their matrix columns of `out.elements`. It sets elements 3, 7 and 11 to 0 and element 15 to 1, and returns `out`. It allocates nothing. [src/view/assets/animTable.js:4; src/view/assets/animTable.js:30-32; test/assets-animTable.test.mjs:18] <!-- C-112 -->
- **B-73** `blendAnimTable` writes `A*(1 - k) + B*k` element-wise into `out`. A is `clipA` at `tA`. B is `clipB` at `tB`. [src/view/assets/animTable.js:36-42; test/assets-animTable.test.mjs:40] <!-- C-114 -->

### Instances
- **B-74** An instanced mesh starts at count 0 and takes the `castShadow` and `receiveShadow` values. Frustum culling is off. The `instanceMatrix` uses `DynamicDrawUsage`. [src/view/instancing/instances.js:3-4; src/view/instancing/instances.js:26-28; test/sync-instances.test.mjs:9] <!-- C-229 -->
- **B-75** With `colors`, the colour buffer exists from the start and every value is 1 (white). [src/view/instancing/instances.js:4; src/view/instancing/instances.js:29; test/sync-instances.test.mjs:21] <!-- C-230 -->
- **B-76** With `coverage`, the mesh gets a per-instance 4-float attribute `instanceCoverage` (dirt, rust, snow, mud), zero at first. It lives on a geometry of its own that shares the source attributes and index. [src/view/instancing/instances.js:5-8; src/view/instancing/instances.js:19-25; test/sync-instances.test.mjs:42] <!-- C-231 -->
- **B-77** `set(i, p, q, s = 1)` composes instance `i` from a position, a rotation and a scale. The scale is a number or `{ x, y, z }`. `setMatrix(i, m)` copies a Matrix4. `getMatrix(i, out)` reads one. [src/view/instancing/instances.js:1-2; src/view/instancing/instances.js:35-41; test/sync-instances.test.mjs:9] <!-- C-234 -->
- **B-78** `color(i, c)` sets the instance colour from a CSS string, a hex number or a THREE.Color. A CSS string is parsed on each call. [src/view/instancing/instances.js:2; src/view/instancing/instances.js:9; src/view/instancing/instances.js:42; test/sync-instances.test.mjs:21] <!-- C-235 -->
- **B-79** `copy(from, to)` moves the matrix of an instance. It also moves the colour and the coverage when they exist. [src/view/instancing/instances.js:47-51; test/sync-instances.test.mjs:31] <!-- C-237 -->
- **B-80** `commit()` marks for upload only the buffers (matrix, colour, coverage) that changed since the last commit. [src/view/instancing/instances.js:3; src/view/instancing/instances.js:52-56; test/sync-instances.test.mjs:21] <!-- C-238 -->
- **B-81** `dispose()` removes the mesh from its parent and disposes it. The call does not dispose the shared geometry and material. For coverage, the call detaches the shared attributes and frees the wrapper geometry. [src/view/instancing/instances.js:7-8; src/view/instancing/instances.js:57-60; test/sync-instances.test.mjs:31; test/sync-instances.test.mjs:52] <!-- C-239 -->
- **B-82** `instancedPart` makes a holder mesh from the geometry and material. It compiles the holder with `compiler.apply(holder, { instanced: true, coverage: true })`. The holder carries the material and, for FUR or WIND, its depth twin. [src/view/instancing/parts.js:3-4; src/view/instancing/parts.js:9-11] <!-- C-241 -->
- **B-83** `instancedPart` reads the authored material name from `userData.lhMat[0]` or `material.name`. A name that starts with `paint-` gives the paint slot, which is the rest of the name. Otherwise `paint` is null. [src/view/instancing/parts.js:7-8; src/view/instancing/parts.js:12; test/sync-instanced.test.mjs:94] <!-- C-242 -->
- **B-84** `instancedPart` reports `coverage` as true when the holder material defines `COVERAGE_INSTANCED`. [src/view/instancing/parts.js:12] <!-- C-243 -->

### Crowd
- **B-85** A crowd makes one instanced mesh per part of the anim table. Each mesh has the given `max` and goes into a group named `crowd:<name>`. The name is the name of the asset scene, or `model` when that asset scene has no name. [src/view/instancing/crowd.js:1; src/view/instancing/crowd.js:19; src/view/instancing/crowd.js:23-32; test/sync-crowd.test.mjs:22] <!-- C-250 -->
- **B-86** Each crowd mesh takes the depth twin of its holder when one exists. Each crowd mesh gets `instancedShadows`. [src/view/instancing/crowd.js:29-30; test/sync-crowd.test.mjs:53] <!-- C-251 -->
- **B-87** The crowd count starts at 0. When code sets the count, the crowd sets the count of every part mesh. [src/view/instancing/crowd.js:33-40; test/sync-crowd.test.mjs:45] <!-- C-252 -->
- **B-88** `crowd.set(i, pose, clip, t, blend)` takes a pose that is a Matrix4 or `{ p, q, s? }`. The scale `s` is a number or `{ x, y, z }`. The default is 1. [src/view/instancing/crowd.js:3-4; src/view/instancing/crowd.js:41-46; test/sync-crowd.test.mjs:31] <!-- C-253 -->
- **B-89** `crowd.set` writes each part matrix as the pose times `sampleAnimTable(clip, t)` for that part. [src/view/instancing/crowd.js:47-51; test/sync-crowd.test.mjs:22] <!-- C-254 -->
- **B-90** With `blend = { clip, t, k }` and `k` below 1, `crowd.set` uses `blendAnimTable(blend.clip, blend.t, clip, t, k)`. The value `k` is the weight of this clip, and 1 means no blend. [src/view/instancing/crowd.js:3-5; src/view/instancing/crowd.js:48; test/sync-crowd.test.mjs:31] <!-- C-255 -->
- **B-91** `crowd.cover(i, dirt, rust, snow, mud)` writes `instanceCoverage` on the parts that read coverage only. [src/view/instancing/crowd.js:53; test/sync-crowd.test.mjs:39] <!-- C-256 -->
- **B-92** `crowd.commit()` commits every part mesh. `crowd.dispose()` removes the group from its parent. It disposes the instances of every part, including the coverage wrapper geometry. [src/view/instancing/crowd.js:54-55; test/sync-crowd.test.mjs:45; test/sync-crowd.test.mjs:57] <!-- C-257 -->

### Chase rig
- **B-93** `createChaseRig` fills each undefined key of `opts` with the default of the style. It sets `opts.style`. It keeps `opts` as the live object, so `?tune` can write `rig.opts.distance`. [src/view/camera/chase.js:11; src/view/camera/chase.js:27-29; test/camera-chase.test.mjs:50] <!-- C-163 -->
- **B-94** In `'heading'` follow, the wanted yaw is `pose.velYaw` (or `pose.yaw`) when `pose.fwd` is above `opts.slide`. Otherwise it is `pose.yaw`. [src/view/camera/chase.js:46; test/camera-chase.test.mjs:25] <!-- C-169 -->
- **B-95** In `'heading'` follow, the rig turns its yaw toward the wanted yaw by the shortest angle. Each frame it covers `min(1, dt * lag)` of the difference. The first wanted yaw sets the yaw at once. [src/view/camera/chase.js:47-48; src/view/camera/chase.js:77] <!-- C-170 -->
- **B-96** In `'heading'` follow, the camera looks at a point `lookAhead` in front of the target and `lookHeight` up. The camera position moves by `min(1, dt * ease)` toward a point `distance` behind and `height` above the target. [src/view/camera/chase.js:49-53; src/view/camera/chase.js:77; test/camera-chase.test.mjs:25] <!-- C-171 -->
- **B-97** When `camera.aspect` is below `portraitAspect`, the `'heading'` distance and height are multiplied by `portrait`. [src/view/camera/chase.js:49-51; test/camera-chase.test.mjs:65] <!-- C-172 -->
- **B-98** In `'travel'` follow, the heading blends toward the velocity when the planar speed is above `blendFrom`. The weight is `min(blendMax, (speed - blendFrom) / blendSpan)`. [src/view/camera/chase.js:61-63; test/camera-chase.test.mjs:134] <!-- C-174 -->
- **B-99** In `'travel'` follow, the chase direction eases toward the heading by `1 - exp(-dt * lag)`. The camera position eases by `1 - exp(-dt * ease)`. The look point eases by `1 - exp(-dt * lookEase)`. [src/view/camera/chase.js:64-70] <!-- C-175 -->
- **B-100** In `'travel'` follow, the field of view is the base plus `fovAdd` plus `min(fovMax, speed * fovSpeed)`. The base is `camera.userData.lhFov`, or the camera fov at creation. The rig updates the projection only when the fov changes. [src/view/camera/chase.js:6-8; src/view/camera/chase.js:44; src/view/camera/chase.js:71] <!-- C-176 -->
- **B-101** `snap(pose)` puts the camera straight behind the target at once. It cancels any blend and shake. In `'heading'` it first resets the yaw to null. [src/view/camera/chase.js:78-81; test/camera-chase.test.mjs:40] <!-- C-177 -->
- **B-102** `shake(a)` sets the amplitude to the larger of the old and new values. It sets the time to `opts.shakeTime`. For that time, the rig adds a fading jitter to the x and y of the wanted camera position. [src/view/camera/chase.js:34-38; src/view/camera/chase.js:91; test/camera-chase.test.mjs:50] <!-- C-178 -->
- **B-103** The shake jitter comes from a counter hash in the range -0.5 to 0.5. The rig does not use `Math.random`, so the jitter is deterministic. [src/view/camera/chase.js:13-14; src/view/camera/chase.js:34-37; test/camera-chase.test.mjs:50] <!-- C-179 -->
- **B-104** `blendFrom(q, time = 1)` turns the camera from rotation `q` back to the chase rotation over `time` s with a smoothstep. Each `follow` call advances the blend after the chase. [src/view/camera/chase.js:13-14; src/view/camera/chase.js:39-43; src/view/camera/chase.js:77; src/view/camera/chase.js:92; test/camera-chase.test.mjs:84] <!-- C-180 -->
- **B-105** In the `'travel'` style, `orbit(pose, dt)` puts the camera on a turntable of `orbitRadius` at `orbitHeight` round the body. The camera looks at `orbitLook` above the body. The start angle is behind the car plus `orbitStart`. The angle advances by `dt * orbitSpeed`. [src/view/camera/chase.js:6-10; src/view/camera/chase.js:84-88; test/camera-chase.test.mjs:134] <!-- C-182 -->
- **B-106** `orbit` sets the fov to the base plus `orbitFovAdd`. The next `follow` starts the chase afresh behind the car. [src/view/camera/chase.js:88-89] <!-- C-183 -->

### Mount rig
- **B-107** `follow(pose)` takes `{ p, q }` or an Object3D, whose position and quaternion it reads. The rig places the camera at the camera mount point and looks at the look point. The body rotation turns both. [src/view/camera/mount.js:21-25; test/camera-mount.test.mjs:15; test/camera-mount.test.mjs:26] <!-- C-188 -->
- **B-108** `follow` rolls `camera.up` with the body for the look-at. It then resets `camera.up` to (0, 1, 0). [src/view/camera/mount.js:26; test/camera-mount.test.mjs:15] <!-- C-189 -->
- **B-109** When `rig.fovAdd` is not null, `follow` sets the fov to the base plus `fovAdd`. The base is `camera.userData.lhFov`, or the fov when the rig was made. The rig never overwrites the fov with an absolute value. [src/view/camera/mount.js:1-5; src/view/camera/mount.js:27] <!-- C-190 -->

### Orbit rig
- **B-110** `apply()` clamps pitch to `pitchMin..pitchMax` and `dist` to `min..max`. When `bounds` exist, it clamps `tx` to `bounds.x` and `tz` to `bounds.z`. [src/view/camera/orbit.js:34-37] <!-- C-196 -->
- **B-111** `apply()` places the camera on a sphere round the target at `ground + sin(pitch) * dist` height. It looks at the target and updates the camera world matrix. [src/view/camera/orbit.js:38-41; test/camera-orbit.test.mjs:36] <!-- C-197 -->
- **B-112** `update(dt = 0, raw = dt)` updates each bound gesture device with `dt` and `raw`. It then calls `apply()`. [src/view/camera/orbit.js:43] <!-- C-198 -->
- **B-113** `fit(aspect = camera.aspect)` copies `fit.portrait` into `state` when `aspect` is below 0.9. Otherwise it copies `fit.landscape`. [src/view/camera/orbit.js:3-5; src/view/camera/orbit.js:32; test/camera-orbit.test.mjs:63] <!-- C-200 -->
- **B-114** `panBy(dx, dy)` moves the target on the ground by screen pixels. The scale is `dist * 0.0016`. The value `dy` is divided by `max(0.5, sin(pitch))`. [src/view/camera/orbit.js:44-48; test/camera-orbit.test.mjs:36] <!-- C-201 -->
- **B-115** `chase(t, dt)` with `t = { x, z, yaw, fwd }` turns `state.yaw` behind the target plus `chaseOff` by `min(1, dt * lag)`. The target follows with a lead of `clamp(fwd * lead, leadMin, leadMax)` metres. [src/view/camera/orbit.js:49-55; test/camera-orbit.test.mjs:36] <!-- C-202 -->
- **B-116** `chase` eases pitch toward the chase pitch. It clamps `dist` toward `near..far`. Both use `min(1, dt * ease)`. [src/view/camera/orbit.js:56-57] <!-- C-203 -->
- **B-117** While `rig.gesture` is null, `chase` decays `chaseOff` by `dt * recentre` each frame. Any other value of `rig.gesture` keeps the offset. [src/view/camera/orbit.js:52; test/camera-orbit.test.mjs:47] <!-- C-204 -->
- **B-118** `release({ pitch = 0.7, distance = 18 })` raises `state.pitch` and `state.dist` to at least those values. It sets `chaseOff` to 0. [src/view/camera/orbit.js:12; src/view/camera/orbit.js:59; test/camera-orbit.test.mjs:36] <!-- C-205 -->
- **B-119** `ray(cx, cy, out)` returns the camera ray through a client point as `[ox, oy, oz, dx, dy, dz]`. It returns a fresh array when `out` is not given. [src/view/camera/orbit.js:13; src/view/camera/orbit.js:60-67; test/camera-orbit.test.mjs:52] <!-- C-206 -->
- **B-120** A game does not add the orbit device to the devices of boot, because `rig.update` drives it. [src/view/camera/orbit.js:11] <!-- C-210 -->
- **B-121** A one-finger drag asks `mode()` when it starts. The answer `'orbit'` sets `rig.orbiting` and sets `rig.gesture` to `'orbit'`. The answer `'chase'` sets `rig.gesture` to `'chase'`. Other answers set `rig.gesture` to null. The end phase of the drag sets `rig.gesture` to null. [src/view/camera/orbit.js:6-8; src/view/camera/orbit.js:74; test/camera-orbit-gesture.test.mjs:27] <!-- C-211 -->
- **B-122** A one-finger `'orbit'` drag changes yaw by -0.006 and pitch by 0.005 per pixel. A `'chase'` drag changes `chaseOff` by -0.006 and pitch by 0.004 per pixel. [src/view/camera/orbit.js:77-78; test/camera-orbit-gesture.test.mjs:18; test/camera-orbit-gesture.test.mjs:27] <!-- C-212 -->
- **B-123** An orbit drag stops for good when `mode()` stops answering `'orbit'` during the drag. [src/view/camera/orbit.js:7-8; src/view/camera/orbit.js:76; test/camera-orbit-gesture.test.mjs:57] <!-- C-213 -->
- **B-124** A two-finger pinch sets `dist` to the start `dist` divided by `max(0.05, scale)`. The turn adds to yaw and the pan calls `panBy`. While `mode()` is `'chase'`, the turn adds to `chaseOff` instead. The pinch start sets `rig.gesture` to `'pinch'`, and the end phase sets it to null. [src/view/camera/orbit.js:81-89; test/camera-orbit-gesture.test.mjs:35; test/camera-orbit-gesture.test.mjs:57] <!-- C-214 -->
- **B-125** A mouse right-drag orbits and a middle-drag pans. Both use `tapMove` 0. The drag start sets `rig.gesture` to `'orbit'` or `'pan'`, and the end phase sets it to null. [src/view/camera/orbit.js:90-99; test/camera-orbit-gesture.test.mjs:44] <!-- C-215 -->
- **B-126** The wheel multiplies `dist` by `exp(deltaY * 0.0012)` and prevents the default. The element also prevents the context menu. [src/view/camera/orbit.js:102-104; test/camera-orbit-gesture.test.mjs:44] <!-- C-216 -->
- **B-127** A pointerdown on the element, in the capture phase, sets `rig.orbiting` to false. [src/view/camera/orbit.js:101; src/view/camera/orbit.js:104; test/camera-orbit-gesture.test.mjs:18] <!-- C-217 -->
- **B-128** The device `dispose()` disposes its gesture bindings and removes the listeners. It removes the device from the rig and sets `rig.gesture` to null. [src/view/camera/orbit.js:107-112; test/camera-orbit-gesture.test.mjs:44] <!-- C-218 -->

### Projection
- **B-129** `project` fills `out` with `x` and `y` in client pixels (canvas offset added), `z` as the NDC depth, and `onScreen`. It returns `out`. [src/view/camera/project.js:1-3; src/view/camera/project.js:17-21; test/camera-project.test.mjs:9] <!-- C-222 -->
- **B-130** `onScreen` is false when the point is behind the camera. `onScreen` is also false when the absolute NDC `x` or `y` exceeds 1. [src/view/camera/project.js:20; test/camera-project.test.mjs:13] <!-- C-223 -->
- **B-131** `project` and `project.ndc` refresh the camera matrices first. A camera moved since the last render projects where it is now. [src/view/camera/project.js:2-3; src/view/camera/project.js:12; test/camera-project.test.mjs:19] <!-- C-224 -->
- **B-132** `project.ndc(x, y, z, out)` fills `{ nx, ny, nz, behind }` and returns it. Without `out`, it fills one shared object. [src/view/camera/project.js:10-16; test/camera-project.test.mjs:19] <!-- C-225 -->
- **B-133** `project` returns a fresh object when `out` is not given. [src/view/camera/project.js:3-4; src/view/camera/project.js:17] <!-- C-226 -->

### Audio
- **B-134** On the first gesture, the service makes the AudioContext and this chain. Each bus gain node feeds `master`. Then `master` feeds the mute gain, the compressor limiter and the destination. [src/view/audio/index.js:32-41; test/audio.test.mjs:16; test/audio-buses.test.mjs:6] <!-- C-121 -->
- **B-135** From creation until the context runs, the service listens on `doc`, in the capture phase, for pointerdown, pointerup, touchend, click and keydown. [src/view/audio/index.js:7; src/view/audio/index.js:65; src/view/audio/index.js:201] <!-- C-123 -->
- **B-136** On a gesture, the service first calls each `onGesture` callback. It then makes the context if needed. When the context runs, the service settles. Otherwise the service tries to resume the context. [src/view/audio/index.js:59-64; test/audio.test.mjs:32] <!-- C-124 -->
- **B-137** When the context runs, the service stops listening for gestures. The first time, it calls and clears every `onUnlock` callback. [src/view/audio/index.js:50-54; test/audio.test.mjs:7] <!-- C-125 -->
- **B-138** `onUnlock` callbacks do not fire again after a later unlock, because the service keeps its unlocked state. [src/view/audio/index.js:25; src/view/audio/index.js:53; test/audio-lifecycle.test.mjs:12] <!-- C-130 -->
- **B-139** When a resume is refused, the service warns once `audio: resume refused (the next gesture tries again)` and keeps listening. [src/view/audio/index.js:55-58; test/audio.test.mjs:32] <!-- C-126 -->
- **B-140** When the document becomes hidden and the context runs, the service suspends the context. A failed suspend warns once `audio: suspend failed`. [src/view/audio/index.js:71-77; test/audio-lifecycle.test.mjs:5] <!-- C-127 -->
- **B-141** When the document becomes visible, or the window fires `pageshow`, the service checks the context. The service acts only when the context is not running, not closed, and the document is not hidden. Then the service listens for gestures again and tries to resume. [src/view/audio/index.js:67-70; src/view/audio/index.js:73; src/view/audio/index.js:200; test/audio-lifecycle.test.mjs:12; test/audio-lifecycle.test.mjs:20] <!-- C-128 -->
- **B-142** When the context leaves running while the document is visible and the context is not closed, the service listens for gestures again. An example is iOS `interrupted`. A change to running settles. [src/view/audio/index.js:78-82; test/audio-lifecycle.test.mjs:26] <!-- C-129 -->
- **B-143** `play` returns null when `buffer` is missing, no context exists, or the context is not running. [src/view/audio/index.js:110; test/audio-clips.test.mjs:23; test/audio-clips.test.mjs:55] <!-- C-134 -->
- **B-144** `play` connects a buffer source to a gain node. Then `play` connects the gain node to the node of the bus, through the panner when `play` adds one. `play` sets rate, loop and gain. `play` starts at `currentTime + when` with `offset`. [src/view/audio/index.js:118-125; test/audio-clips.test.mjs:23; test/audio-buses.test.mjs:31] <!-- C-135 -->
- **B-145** When the pan is not 0 and the context has `createStereoPanner`, `play` adds a stereo panner. It clamps the pan to -1..1. [src/view/audio/index.js:121-123; test/audio-clips.test.mjs:35] <!-- C-136 -->
- **B-146** When the source ends, `play` disconnects the source, gain and panner nodes. [src/view/audio/index.js:124; test/audio-clips.test.mjs:23] <!-- C-137 -->
- **B-147** The `stop(t = 0)` of a played sound calls `source.stop` at `currentTime + t`. It ignores the error of a stopped source. [src/view/audio/index.js:126] <!-- C-138 -->
- **B-148** When `at` is set, `play` multiplies the gain by `distanceGain(x, 0, z)`. The value `at` is an array `[x, y, z]` or an object with `x` and `z`. [src/view/audio/index.js:112-115; test/audio-clips.test.mjs:41] <!-- C-139 -->
- **B-149** When `at` is set, `positional.pan` is not 0 and a listener exists, `play` adds `panOf(x, z)` times `positional.pan` to the pan. [src/view/audio/index.js:116; test/audio-clips.test.mjs:41] <!-- C-140 -->
- **B-150** Without a listener, `distanceGain` returns `positional.max`. Otherwise it returns `ref / (planar distance + near)` clamped to `min..max`. It ignores `y`. [src/view/audio/index.js:83-87; test/audio-clips.test.mjs:41] <!-- C-141 -->
- **B-151** `panOf` is the unit vector from the listener to the point, projected on the listener world x axis. The value is 0 when the distance is below 1e-6. [src/view/audio/index.js:88-91] <!-- C-142 -->
- **B-152** `load` fetches at once and decodes once the context exists. It caches the promise by URL. [src/view/audio/index.js:4-5; src/view/audio/index.js:156; src/view/audio/index.js:162; src/view/audio/index.js:165; test/audio-clips.test.mjs:8] <!-- C-145 -->
- **B-153** A failed `load` removes its cache entry, so the load can be tried again. [src/view/audio/index.js:164; test/audio-clips.test.mjs:16] <!-- C-150 -->
- **B-154** `mute(on)` ramps the mute gain to 0 or 1 with `setTargetAtTime` and a time constant of 0.02 s. It never changes `master`. [src/view/audio/index.js:169; test/audio.test.mjs:24] <!-- C-153 -->
- **B-155** When the service has already unlocked, `onUnlock(fn)` calls `fn` at once. It returns a function that does nothing. [src/view/audio/index.js:191; test/audio.test.mjs:49] <!-- C-155 -->
- **B-156** `onGesture` callbacks run inside each gesture, so they can prime speech or similar. They run only while the service listens for gestures. [src/view/audio/index.js:61; src/view/audio/index.js:65-66; test/audio.test.mjs:32] <!-- C-157 -->
- **B-157** The second call of `audio.dispose()` does nothing. The first call removes the gesture, `visibilitychange` and `pageshow` listeners. The first call also stops every voice and clears the callbacks and the listener. Then the first call clears `onstatechange` and closes the context. [src/view/audio/index.js:172-183; test/audio-lifecycle.test.mjs:34; test/audio-voices.test.mjs:44] <!-- C-158 -->

### Audio buses
- **B-158** The `buses` option names the buses, and the default is `sfx`, `music`, `ui`, `voice`, `ambience`. Each name must be a non-empty string other than `'master'`, and no name repeats. Otherwise `createAudio` throws. [src/view/audio/index.js:10; src/view/audio/index.js:19; test/audio-buses.test.mjs:38] <!-- C-271 -->
- **B-159** When the service makes the context, it makes one gain node per bus. The service sets the gain to the bus level times the duck factors and connects the node to `master`. [src/view/audio/index.js:40; test/audio-buses.test.mjs:6] <!-- C-272 -->
- **B-160** `audio.bus(name)` returns the gain node of the bus, or `null` before the context exists. A name that is not a bus throws. [src/view/audio/index.js:92; src/view/audio/index.js:195; test/audio-buses.test.mjs:6] <!-- C-262 C-273 -->
- **B-161** `volume('master', v)` sets the master level. The service keeps the level before the context exists and uses it as the first `master` gain. When `master` exists, the service ramps its gain with a time constant of 0.02 s. [src/view/audio/index.js:23; src/view/audio/index.js:37; src/view/audio/index.js:97; test/audio-buses.test.mjs:13] <!-- C-274 -->
- **B-162** `volume(bus, v)` stores the level of the bus. When the bus node exists, the service ramps the bus gain with a time constant of 0.02 s. The call returns the stored level. [src/view/audio/index.js:94; src/view/audio/index.js:98-100; test/audio-buses.test.mjs:13] <!-- C-275 -->
- **B-163** The gain of a bus is its level times every active duck factor of the bus. [src/view/audio/index.js:93; test/audio-buses.test.mjs:23] <!-- C-277 -->
- **B-164** `duck` adds the factor `to` to the active ducks of the bus. Then `duck` ramps the bus gain with a time constant of `attack / 3` s. Ducks multiply. [src/view/audio/index.js:102-104; test/audio-buses.test.mjs:23] <!-- C-278 -->
- **B-165** The undo function of `duck` removes the first active duck with that factor. Then the undo function ramps the bus gain with a time constant of `release / 3` s. A second call does nothing. [src/view/audio/index.js:105-106; test/audio-buses.test.mjs:23] <!-- C-279 -->
- **B-166** `play` checks the bus name before it checks the context. A name that is not a bus throws even before audio runs. The `bus` option defaults to `'sfx'`. [src/view/audio/index.js:108-110; test/audio-buses.test.mjs:31] <!-- C-280 -->

### Audio voices
- **B-167** `voice` returns null when the context does not exist or does not run. The bus name check comes first. [src/view/audio/index.js:129-130; test/audio-voices.test.mjs:9] <!-- C-281 -->
- **B-168** A voice is an input gain node, then a place gain node, then a stereo panner, then the bus node. The input gain is the `gain` option. When `createStereoPanner` is missing, the place node connects to the bus node. [src/view/audio/index.js:131-133; test/audio-voices.test.mjs:9] <!-- C-282 -->
- **B-169** A new voice has `audible` true and `stopped` false. The service adds the voice to its voice list and places the voice at once. [src/view/audio/index.js:134; src/view/audio/index.js:140; test/audio-voices.test.mjs:9] <!-- C-283 -->
- **B-170** A voice without `follow` keeps place gain 1 and `audible` true. When no listener exists, a voice with `follow` also keeps its values. [src/view/audio/index.js:144; test/audio-voices.test.mjs:39] <!-- C-284 -->
- **B-171** For a voice with `follow`, the service reads the position from `follow.position`, or from `follow` itself. The voice is audible when the planar distance to the listener is at most `positional.cull`. [src/view/audio/index.js:145-146; test/audio-voices.test.mjs:20; test/audio-voices.test.mjs:30] <!-- C-285 -->
- **B-172** The place gain of an audible voice is `distanceGain(x, 0, z)`. The place gain of an inaudible voice is 0. [src/view/audio/index.js:147; test/audio-voices.test.mjs:30] <!-- C-286 -->
- **B-173** A new voice takes its place gain at once. During `frame()`, the place gain and the pan glide with `setTargetAtTime` and a time constant of 0.05 s. [src/view/audio/index.js:140; src/view/audio/index.js:143; src/view/audio/index.js:148; src/view/audio/index.js:153] <!-- C-287 -->
- **B-174** When a voice has `follow`, a listener exists, the voice has a panner and `positional.pan` is not 0, the voice pan is `panOf(x, z)` times `positional.pan`. The service clamps the pan to -1..1. [src/view/audio/index.js:144; src/view/audio/index.js:149; test/audio-voices.test.mjs:20] <!-- C-288 -->
- **B-175** `frame()` does nothing after dispose or before the context exists. Otherwise `frame()` places every voice. The header comment says `frame()` allocates nothing (R-8). [src/view/audio/index.js:151-154; test/audio-voices.test.mjs:44] <!-- C-289 -->
- **B-176** The second call of `voice.stop()` does nothing. The first call sets `stopped`, disconnects the input, place and panner nodes, and removes the voice from the voice list. [src/view/audio/index.js:135-139; test/audio-voices.test.mjs:44] <!-- C-290 -->
- **B-177** When `at` is set and a listener exists, `play` returns null if the planar distance to the listener is above `positional.cull`. Without a listener, `play` applies no cull. [src/view/audio/index.js:112-114; test/audio-voices.test.mjs:30] <!-- C-291 -->
- **B-178** The render pipeline calls `view.audio.frame()` each frame, unless the pipeline is disposed. With gfx, the call comes after `view.sync.frame(alpha)`. Without gfx, the pipeline calls only `view.audio.frame()`. [src/view/render/pipeline.js:62; src/view/render/pipeline.js:87] <!-- C-292 -->

### Cues
- **B-179** `createCues` throws `createCues: rng with next() required (pass engine.rng('fx'))` when `rng` has no `next` function. [src/view/audio/cues.js:8] <!-- C-293 -->
- **B-180** A cue def may have only the keys `src`, `gain`, `gainJitter`, `rate`, `rateJitter`, `bus`, `cooldown` and `max`. Another key throws. [src/view/audio/cues.js:4; src/view/audio/cues.js:11; test/audio-cues.test.mjs:39] <!-- C-294 -->
- **B-181** A cue `src` is a URL string or a non-empty list of non-empty URL strings. Otherwise `createCues` throws. [src/view/audio/cues.js:12-13; test/audio-cues.test.mjs:39] <!-- C-295 -->
- **B-182** A cue `max` defaults to 4. A `max` that is not an integer of at least 1 throws. [src/view/audio/cues.js:14-15; test/audio-cues.test.mjs:39] <!-- C-296 -->
- **B-183** A cue `bus` defaults to `'sfx'`. `createCues` calls `audio.bus(bus)`, so a name that is not a bus throws at creation. [src/view/audio/cues.js:16; test/audio-cues.test.mjs:39] <!-- C-297 -->
- **B-184** `createCues` calls `audio.load` at once for every URL of every cue. Each decoded buffer joins its cue. `ready` rejects when one load fails, and the cue plays the clips that did load. [src/view/audio/cues.js:19; src/view/audio/cues.js:22-23; test/audio-cues.test.mjs:47] <!-- C-299 -->
- **B-185** `cues.has(id)` is true when the cue is defined. [src/view/audio/cues.js:27; test/audio-cues.test.mjs:12] <!-- C-300 -->
- **B-186** `cues.play` returns null when audio is not unlocked or no clip of the cue has decoded. [src/view/audio/cues.js:31; test/audio-cues.test.mjs:12] <!-- C-302 -->
- **B-187** `cues.play` returns null when the context time minus the time of the last play is below the cooldown. The last play time starts at -Infinity. [src/view/audio/cues.js:17-18; src/view/audio/cues.js:32-33; test/audio-cues.test.mjs:28] <!-- C-303 -->
- **B-188** `cues.play` picks the clip at index `floor(rng.next() * clip count)`, limited to the last clip. The call draws from `rng` once for each play that passes the cooldown, even for one clip. [src/view/audio/cues.js:34; test/audio-cues.test.mjs:20] <!-- C-304 -->
- **B-189** The play gain is the cue gain times the call gain times a jitter. The play rate is the cue rate times the call rate times a jitter. A jitter is `1 + j * (2 * rng.next() - 1)`, and it is 1 without a draw when `j` is 0. [src/view/audio/cues.js:24; src/view/audio/cues.js:35; test/audio-cues.test.mjs:20] <!-- C-305 -->
- **B-190** `cues.play` drops the live plays that ended. When the live count is at `max`, it stops the oldest live play. Both happen before `audio.play` runs. [src/view/audio/cues.js:36-37; test/audio-cues.test.mjs:32] <!-- C-306 -->
- **B-191** `cues.play` calls `audio.play(buffer, { gain, rate, at, when, bus })`. When `audio.play` returns null, `cues.play` returns null and records nothing. [src/view/audio/cues.js:38-39] <!-- C-307 -->
- **B-192** After a successful play, the cue records the play time and a live entry that ends at `now + when + buffer duration / rate`. `cues.play` returns the handle of `audio.play`. [src/view/audio/cues.js:40-41; test/audio-cues.test.mjs:32] <!-- C-308 -->

### Contact sounds
- **B-193** `bindContactSounds` throws when `engine.events.on` is missing, when `cues.play` or `cues.has` is missing, or unless `min >= 0` and `full > min`. [src/view/audio/contacts.js:5-7; test/audio-contacts.test.mjs:33] <!-- C-309 -->
- **B-194** The contact handler ignores events that are not type `'contact'`. The handler also ignores contact events whose `impulse` is not at least `min`, including a missing or NaN `impulse`. [src/view/audio/contacts.js:15; test/audio-contacts.test.mjs:20] <!-- C-310 -->
- **B-195** The cue id comes from `engine.world.materials`. With no registry the id is null. With two materials the id is `reg.pair(a, b).sound`. With one material the id is `reg.get(m).sound`. With none the id is null. [src/view/audio/contacts.js:9-13; src/view/audio/contacts.js:16; test/audio-contacts.test.mjs:15; test/audio-contacts.test.mjs:20] <!-- C-311 -->
- **B-196** The handler plays nothing when the cue id is missing or `cues.has(id)` is false. [src/view/audio/contacts.js:17; test/audio-contacts.test.mjs:20] <!-- C-312 -->
- **B-197** The handler keys a pair by `e.a` and `e.b` in that order. The handler skips a contact when `engine.time.sim` minus the last time of the key is below `gap`. The handler records the time before it calls `cues.play`. [src/view/audio/contacts.js:18-19; src/view/audio/contacts.js:21; test/audio-contacts.test.mjs:26] <!-- C-313 -->
- **B-198** When the pair map holds more than 512 keys, the handler removes the keys at least `gap` old. Then the handler records the new key. [src/view/audio/contacts.js:20] <!-- C-314 -->
- **B-199** The handler calls `cues.play(id, { gain, at: e.point })`. The `gain` is `min(1, (impulse - min) / (full - min))`. [src/view/audio/contacts.js:22; test/audio-contacts.test.mjs:15] <!-- C-315 -->

### DSP host
- **B-200** `workletSource` returns text that defines `C` as the source of `Class`. The text registers a processor named `name` that extends `AudioWorkletProcessor`. The processor builds `new C(sampleRate, processorOptions)`. [src/view/audio/dsp.js:7-10; test/audio-dsp.test.mjs:14] <!-- C-316 -->
- **B-201** The processor sends each port message to `setParams`, except `{ type: 'dispose' }`, which ends the processor. Each `process` call renders into output channel 0 and channel 1 (null when absent). [src/view/audio/dsp.js:11-12; test/audio-dsp.test.mjs:14] <!-- C-317 -->
- **B-202** `createDsp` rejects when `name` is not a string of word characters and hyphens. `createDsp` rejects when `Class` lacks `render` or `setParams` on its prototype. `createDsp` rejects when `audio.ctx` is null. [src/view/audio/dsp.js:26-29; test/audio-dsp.test.mjs:50] <!-- C-318 C-319 C-320 -->
- **B-203** `createDsp` registers each name once per context. A second call with the same `Class` reuses the load result, so `addModule` runs once per context and name. [src/view/audio/dsp.js:5; src/view/audio/dsp.js:30-33; test/audio-dsp.test.mjs:23] <!-- C-321 -->
- **B-204** A name already registered on the context with another `Class` makes `createDsp` reject. [src/view/audio/dsp.js:32; test/audio-dsp.test.mjs:50] <!-- C-322 -->
- **B-205** When the context has no `audioWorklet`, or `AudioWorkletNode` is not a function, the module load warns and reports failure. The warning is `audio: no AudioWorklet; '<name>' runs on the main thread`. [src/view/audio/dsp.js:18; test/audio-dsp.test.mjs:35] <!-- C-323 -->
- **B-206** Otherwise the module load adds the `workletSource` text through a Blob URL with `audioWorklet.addModule`. The module load then revokes the URL. When `addModule` fails, it warns and reports failure. [src/view/audio/dsp.js:19-22; test/audio-dsp.test.mjs:35] <!-- C-324 -->
- **B-207** When the module loaded, `createDsp` makes an `AudioWorkletNode` with 0 inputs, 1 output, `outputChannelCount` `[channels]` and `processorOptions` set to `options`. The returned `mode` is `'worklet'`. [src/view/audio/dsp.js:34-36; test/audio-dsp.test.mjs:23] <!-- C-325 -->
- **B-208** In `'worklet'` mode, `send` posts the message to the port. `dispose` posts `{ type: 'dispose' }` and disconnects the node. [src/view/audio/dsp.js:36; test/audio-dsp.test.mjs:23] <!-- C-325 -->
- **B-209** When the module did not load, `createDsp` runs `new Class(ctx.sampleRate, options)` behind a ScriptProcessor. The ScriptProcessor has buffer size 1024, 1 input and `channels` outputs. `mode` is `'script'`. [src/view/audio/dsp.js:38-40; test/audio-dsp.test.mjs:35] <!-- C-326 -->
- **B-210** In `'script'` mode, each audio process event renders channel 0 and channel 1 (null when `channels` is 1). `send` calls `setParams`. `dispose` clears `onaudioprocess` and disconnects the node. [src/view/audio/dsp.js:39-40; test/audio-dsp.test.mjs:35] <!-- C-326 -->
- **B-211** `createDsp` does not connect the returned node to another node. The caller connects the node, for example to a voice input. (inferred) [src/view/audio/dsp.js:34-40; test/audio-dsp-e2e.test.mjs:46] <!-- C-327 -->
- **B-212** The `Class` source runs in the worklet scope, so the `Class` must name nothing outside itself. [src/view/audio/dsp.js:1-4; src/view/audio/dsp.js:8] <!-- C-328 -->

## Data and state
- View sync keeps one view sync record per entity, in an array and a Map by id. A steady-state frame allocates nothing. A new entity makes its record and, when drawn, its Object3D. Part binding makes matrices once. The first instanced write makes one Vector3 and one Quaternion. Instanced frames make no three.js objects and retain nothing. [src/view/sync/index.js:17-18; src/view/sync/index.js:45; test/sync.test.mjs:63; test/sync-parts.test.mjs:43] <!-- C-55 -->
- An instanced part group holds its instances, geometry, part matrix, paint slot, coverage marker and the list of owner view sync records. [src/view/sync/index.js:61] <!-- C-56 -->
- An offset is a plain object `{ px, py, pz, qx, qy, qz, qw, left, seq }`. It starts with identity rotation, `left` 0 and `seq` -1. The code makes it once per entity. [src/view/sync/smooth.js:4-5] <!-- C-59 -->
- The asset store holds three Maps: file promises by URL, tracked promises by key, and frozen templates by key. The store also holds the set of skinned keys. The returned object is not frozen. [src/view/assets/index.js:15-18; src/view/assets/index.js:126-127] <!-- C-94 -->
- `assets.progress` is `{ loaded, total, bytes }`. Each key counts once. `bytes` adds the manifest entry `bytes`, or 0 when it has none. [src/view/assets/index.js:19; src/view/assets/index.js:70-78; test/assets.test.mjs:34] <!-- C-81 -->
- `audio.ctx` and `audio.master` are null until the first gesture makes the context. [src/view/audio/index.js:6; src/view/audio/index.js:41; src/view/audio/index.js:186; test/audio.test.mjs:7] <!-- C-122 -->
- The audio service keeps one level and one list of active ducks for each bus. The bus gain is the level times the duck factors. [src/view/audio/index.js:20-21; src/view/audio/index.js:93] <!-- C-277 -->
- The audio service keeps one list of live voices. A voice leaves the list when its `stop()` runs. [src/view/audio/index.js:22; src/view/audio/index.js:138] <!-- C-283 C-290 -->
- A cue keeps its decoded clips, the time of its last play and a list of live plays. [src/view/audio/cues.js:17-18; src/view/audio/cues.js:40] <!-- C-308 -->
- The contact handler keeps a Map from the pair key `<a>|<b>` to the engine time of the last play. [src/view/audio/contacts.js:8; src/view/audio/contacts.js:18-21] <!-- C-313 -->
- The DSP host keeps one registry per context. The registry maps each name to its `Class` and its load result. [src/view/audio/dsp.js:5; src/view/audio/dsp.js:30-33] <!-- C-321 -->
- `rig.state` of the orbit rig is the live pose `{ tx, ty, tz, yaw, pitch, dist, chaseOff }`. `rig.limits` is `{ pitchMin, pitchMax, min, max, bounds }`. Both can be read and written. [src/view/camera/orbit.js:1-3; src/view/camera/orbit.js:24-25; test/camera-orbit.test.mjs:63] <!-- C-194 -->

## Configuration

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `SMOOTH_MS` (view sync) | 150 ms | Smoothing time of a fix. Live value is `world.net.tunables[e.net].smoothMs` when the kind has one. | [src/view/sync/index.js:25; src/view/sync/index.js:207; src/view/sync/index.js:221; test/sync-netfix.test.mjs:24] <!-- C-38 --> |
| `base` (assets) | `'./assets/'` | URL prefix for model files. A trailing `/` is added. | [src/view/assets/index.js:11; src/view/assets/index.js:13] <!-- C-67 C-69 --> |
| `limiter` (audio) | threshold -14, knee 24, ratio 4, attack 0.005, release 0.2 | Compressor limiter settings. The option overrides per key. | [src/view/audio/index.js:8; src/view/audio/index.js:18; src/view/audio/index.js:38] <!-- C-118 --> |
| `positional` (audio) | ref 18, near 10, min 0.05, max 0.6, pan 0, cull Infinity | Distance gain, pan and cull settings. The option overrides per key. | [src/view/audio/index.js:9; src/view/audio/index.js:18] <!-- C-119 --> |
| `volume` (audio) | 0.55 | First gain of `master`. | [src/view/audio/index.js:13; src/view/audio/index.js:23; src/view/audio/index.js:37] <!-- C-120 --> |
| `flags.mute` (audio) | false | When true, the service starts muted. | [src/view/audio/index.js:25; test/audio.test.mjs:24] <!-- C-120 --> |
| `AudioContext` and `fetch` (audio) | `window.AudioContext`, then `window.webkitAudioContext`. `window.fetch`, then `globalThis.fetch`. | A value of false for `AudioContext` means no Web Audio. | [src/view/audio/index.js:15-17] <!-- C-117 -->
| `buses` (audio) | `sfx`, `music`, `ui`, `voice`, `ambience` | Names of the buses. | [src/view/audio/index.js:10; src/view/audio/index.js:13; src/view/audio/index.js:19] <!-- C-271 -->
| Bus level | 1 | Start level of each bus. `audio.volume` changes it. | [src/view/audio/index.js:21; src/view/audio/index.js:95-101] <!-- C-275 -->
| `duck` options (audio) | to 0.3, attack 0.05, release 0.4 | Factor, and the times that set the ramp time constants (`attack / 3` and `release / 3`). | [src/view/audio/index.js:102-106] <!-- C-278 C-279 -->
| `voice` options (audio) | bus `'sfx'`, gain 1, follow null | Bus, input gain and the followed object. | [src/view/audio/index.js:128] <!-- C-265 -->
| Cue def keys | gain 1, gainJitter 0, rate 1, rateJitter 0, cooldown 0 s, max 4, bus `'sfx'` | Values of a cue. `src` has no default. | [src/view/audio/cues.js:14; src/view/audio/cues.js:16-17] <!-- C-298 -->
| `bindContactSounds` options | min 0.5, full 20, gap 0.12 | Impulse range of the gain and the time between plays of a pair. | [src/view/audio/contacts.js:4] <!-- C-268 -->
| `createDsp` options | channels 2, options `{}`, `AudioWorkletNode` is `globalThis.AudioWorkletNode` | Output channel count, class options and the worklet node class. | [src/view/audio/dsp.js:25] <!-- C-269 --> |
| Chase `'heading'` defaults | distance 12, height 10.2, lag 3, lookAhead 11, lookHeight 0.8, ease 6, slide 2, portrait 1.25, portraitAspect 0.9, shakeTime 0.25 | Fill undefined keys of `opts`. | [src/view/camera/chase.js:18] <!-- C-164 --> |
| Chase `'travel'` defaults | distance 6.8, height 2.4, lag 3.5, lookAhead 3, lookHeight 0.6, ease 8, lookEase 12, blendFrom 3, blendSpan 20, blendMax 0.55, shakeTime 0.25 | Fill undefined keys of `opts`. | [src/view/camera/chase.js:19] <!-- C-165 --> |
| Chase `'travel'` extra defaults | fovAdd 2, fovSpeed 0.25, fovMax 10, orbitRadius 9, orbitHeight 3.2, orbitLook 0.4, orbitSpeed 0.12, orbitStart 0.6, orbitFovAdd -5 | Fill undefined keys of `opts`. | [src/view/camera/chase.js:19-20] <!-- C-166 --> |
| Orbit rig options | target { x: 0, y: 0.5, z: 0 }, distance 46, min 2.5, max 80, pitch 0.92, yaw 0, pitchMin 0.28, pitchMax 1.48, bounds null, ground 0, canvas null, chase {}, fit null | Start values of the rig. | [src/view/camera/orbit.js:20-21] <!-- C-192 --> |
| Orbit drive-chase defaults | lag 2.5, recentre 0.8, lead 0.5, leadMin -1, leadMax 3, follow 5, pitch 0.42, near 9, far 22, ease 2 | The `chase` option overrides per key. | [src/view/camera/orbit.js:17; src/view/camera/orbit.js:23] <!-- C-193 --> |
| Instances start size in view sync | 16 | Max of a new instanced part before the first doubling. | [src/view/sync/index.js:26] <!-- C-20 --> |

## Errors and limits

All errors are thrown `Error` objects unless the row says RangeError or a rejection.

| Source | Condition | Message | Evidence |
| --- | --- | --- | --- |
| `createViewSync` | `engine` missing | `createViewSync: engine required` | [src/view/sync/index.js:42] <!-- C-2 --> |
| `createViewSync` | `gfx.scene` is not an Object3D | `createViewSync: gfx.scene required` | [src/view/sync/index.js:43] <!-- C-3 --> |
| view sync frame | Drawn entity has a bad `draw` | `sync: entity <id> has draw <json> (use 'object', 'instanced' or false)` | [src/view/sync/index.js:100] <!-- C-13 --> |
| view sync frame | Drawn entity and no `assets` | `sync: entity <id> (model '<model>') is drawn but the view has no assets` | [src/view/sync/index.js:101] <!-- C-14 --> |
| view sync frame | `'instanced'` entity with `partXf` | `sync: entity <id>: partXf needs draw 'object' (instanced parts are not posed per entity)` | [src/view/sync/index.js:102] <!-- C-16 --> |
| view sync frame | `'instanced'` model and no compiler | `sync: model '<model>' is drawn 'instanced' but the view has no material compiler` | [src/view/sync/index.js:50] <!-- C-17 --> |
| view sync frame | `'instanced'` skinned model | `sync: model '<model>' is skinned; draw it as 'object' or with createCrowd` | [src/view/sync/index.js:56] <!-- C-18 --> |
| view sync frame | `'instanced'` model with no meshes | `sync: model '<model>' has no meshes to instance` | [src/view/sync/index.js:64] <!-- C-19 --> |
| view sync frame | A `partXf` name has no node, or names the Object3D itself | `sync: entity <id> (model '<model>') has no part '<name>' for partXf (parts: <names>)` | [src/view/sync/index.js:129-134] <!-- C-40 --> |
| `sync.on` | `match` has another form | `sync: bad match <value> (use '#tag', 'model:<key>', 'net:<kind>' or a function)` | [src/view/sync/index.js:38] <!-- C-46 --> |
| `createAssets` | Bad manifest | `assets: manifest must be baked/manifest.json with v: 1 (got <v>)` | [src/view/assets/index.js:12] <!-- C-68 --> |
| asset store | Key not in the manifest | `assets: unknown asset '<key>' (the manifest has <keys>)`. An empty manifest gives `no models`. | [src/view/assets/index.js:22-26] <!-- C-75 --> |
| `load` of a key | Fetch, parse or decode fails | `assets: failed to load '<key>' (<glb url>): <reason>`, with the cause | [src/view/assets/index.js:65-67] <!-- C-74 --> |
| `preload` | Called after `dispose` | `assets: preload after dispose` | [src/view/assets/index.js:84] <!-- C-83 --> |
| `preload` | `{ instanced }` key not in `keys` | `assets: preload { instanced } names '<key>', which is not in keys` | [src/view/assets/index.js:87] <!-- C-85 --> |
| `get` | Manifest key not ready | `assets: '<key>' is not loaded; await assets.preload(['<key>']) first`. An unknown key gives the unknown-asset error. | [src/view/assets/index.js:99-104] <!-- C-89 --> |
| `loadGlb`, `loadJson` | Response not ok | `HTTP <status> for <url>` | [src/view/assets/loader.js:15-19] <!-- C-100 --> |
| `decodeAnimTable` | Missing table or `v` not 1 | `animTable: v<v> is not supported (expected v1)` | [src/view/assets/animTable.js:8] <!-- C-103 --> |
| `decodeAnimTable` | `parts` not a non-empty array | `animTable: parts must be a non-empty array of part names` | [src/view/assets/animTable.js:9] <!-- C-104 --> |
| `decodeAnimTable` | `dur` not above 0, or `frames` not an integer of at least 1 | `animTable: clip '<name>' needs dur > 0 and frames >= 1 (got dur <dur>, frames <frames>)` | [src/view/assets/animTable.js:12] <!-- C-105 --> |
| `decodeAnimTable` | Float count is wrong | `animTable: clip '<name>' has <n> floats, expected <frames> frames × <parts> parts × 12 = <want>` | [src/view/assets/animTable.js:13-16] <!-- C-106 --> |
| `sampleAnimTable` | Unknown clip | `animTable: no clip '<clip>' (has <names>)` | [src/view/assets/animTable.js:24-25] <!-- C-109 --> |
| `sampleAnimTable` | `partIndex` outside 0..P-1 | `animTable: part <i> is out of range 0..<P-1>` | [src/view/assets/animTable.js:26-27] <!-- C-110 --> |
| `createInstances` | Missing geometry, material, or bad max | `createInstances: geometry required`, `createInstances: material required`, `createInstances: max must be a whole number of at least 1 (got <max>)` | [src/view/instancing/instances.js:15-17] <!-- C-228 --> |
| instances `count` | Not an integer in 0..max | RangeError `instances: count <n> outside 0..<max>` | [src/view/instancing/instances.js:34] <!-- C-233 --> |
| instances `cover` | Mesh has no coverage | `instances: cover() needs coverage: true` | [src/view/instancing/instances.js:43-44] <!-- C-236 --> |
| `createCrowd` | `asset` has no scene | `createCrowd: asset required (assets.get(key))` | [src/view/instancing/crowd.js:18] <!-- C-245 --> |
| `createCrowd` | No anim table | `createCrowd: '<name>' has no anim table (bake it with animTable)` | [src/view/instancing/crowd.js:19-20] <!-- C-246 --> |
| `createCrowd` | No compiler | `createCrowd: compiler required` | [src/view/instancing/crowd.js:21] <!-- C-247 --> |
| `createCrowd` | Bad `max` | `createCrowd: max must be a whole number of at least 1 (got <max>)` | [src/view/instancing/crowd.js:22] <!-- C-248 --> |
| `createCrowd` | Table part is not a mesh in the scene | `createCrowd: part '<part>' of the anim table is not a mesh in '<name>'` | [src/view/instancing/crowd.js:24-26] <!-- C-249 --> |
| crowd `count` | Not an integer in 0..max | RangeError `crowd: count <n> outside 0..<max>` | [src/view/instancing/crowd.js:38] <!-- C-252 --> |
| `createChaseRig` | `camera` is not a Camera | `createChaseRig: camera required` | [src/view/camera/chase.js:24] <!-- C-161 --> |
| `createChaseRig` | Style is not `'heading'` or `'travel'` | `createChaseRig: style '<style>' (use 'heading' or 'travel')` | [src/view/camera/chase.js:25-26] <!-- C-162 --> |
| chase `orbit` | Style is `'heading'` | `chase.orbit: needs style 'travel'` | [src/view/camera/chase.js:82-83] <!-- C-181 --> |
| `createMountRig` | No camera | `createMountRig: camera required` | [src/view/camera/mount.js:11] <!-- C-185 --> |
| `createMountRig`, `set` | Camera mount point or its `p` missing | `createMountRig: socket required ({ p: [x, y, z], look?: [x, y, z] })` | [src/view/camera/mount.js:17-18; src/view/camera/mount.js:31] <!-- C-186 --> |
| `createOrbitRig` | No camera | `createOrbitRig: camera required` | [src/view/camera/orbit.js:22] <!-- C-191 --> |
| orbit `fit` | No `fit` option | `orbit.fit: no fit framing (createOrbitRig({ fit: { portrait, landscape } }))` | [src/view/camera/orbit.js:30-31] <!-- C-199 --> |
| orbit `ray` | No element known | `orbit.ray: no element (pass canvas, or bindGesture first)` | [src/view/camera/orbit.js:61] <!-- C-207 --> |
| orbit `bindGesture` | No element | `orbit.bindGesture: element required` | [src/view/camera/orbit.js:70] <!-- C-208 --> |
| `makeProject` | No camera, or canvas has no `getBoundingClientRect` | `makeProject: camera required`, `makeProject: canvas required` | [src/view/camera/project.js:8-9] <!-- C-221 --> |
| `createAudio` | `doc` has no `addEventListener` | `createAudio: doc required` | [src/view/audio/index.js:14] <!-- C-116 --> |
| audio context | No AudioContext class, or the constructor throws | The service stops listening, warns once `audio: no Web Audio`, and rejects its ready promise with `audio: no Web Audio (<reason>)`. | [src/view/audio/index.js:29; src/view/audio/index.js:35; src/view/audio/index.js:44-47; test/audio.test.mjs:43] <!-- C-131 --> |
| audio `load` | No fetch function | Rejects with `audio: no fetch in this page` | [src/view/audio/index.js:159] <!-- C-146 --> |
| audio `load` | Response not ok | Rejects with `audio: load '<url>' failed (<status>)` | [src/view/audio/index.js:160] <!-- C-147 --> |
| audio `load` | Decode fails | Rejects with `audio: decode '<url>' failed: <reason>` | [src/view/audio/index.js:163] <!-- C-148 --> |
| audio `load` | No Web Audio | Rejects with the no Web Audio reason, because it waits for the ready promise | [src/view/audio/index.js:162; src/view/audio/index.js:46] <!-- C-151 --> |
| audio messages | URL longer than 48 characters | The URL is cut to 45 characters plus `...` | [src/view/audio/index.js:11] <!-- C-149 --> |
| audio callbacks | `onUnlock` or `onGesture` callback throws | Logs `audio: listener failed` with `console.error`. The other callbacks still run. | [src/view/audio/index.js:30; src/view/audio/index.js:53; src/view/audio/index.js:61] <!-- C-132 --> |
| audio `onUnlock`, `onGesture` | Argument is not a function | `audio.onUnlock: function required`, `audio.onGesture: function required` | [src/view/audio/index.js:190; src/view/audio/index.js:194] <!-- C-156 --> |
| audio `dispose` | Context close fails | Warns once `audio: close failed` | [src/view/audio/index.js:180-181] <!-- C-159 -->
| `createAudio` | `buses` is not distinct non-empty names other than `'master'` | `createAudio: buses must be distinct names other than 'master'` | [src/view/audio/index.js:19] <!-- C-271 -->
| audio `bus`, `volume`, `duck`, `play`, `voice` | Bus name is not a bus | `audio.<method>: unknown bus '<name>' (<bus names>)`. The `<method>` is the method name. | [src/view/audio/index.js:92; src/view/audio/index.js:98; src/view/audio/index.js:103; src/view/audio/index.js:109; src/view/audio/index.js:129; src/view/audio/index.js:195] <!-- C-273 -->
| audio `volume` | `v` is not a finite number of at least 0 | `audio.volume: volume must be a number >= 0 (got <v>)`. The check comes before the bus name check. | [src/view/audio/index.js:96] <!-- C-276 -->
| `createCues` | `rng` has no `next` function | `createCues: rng with next() required (pass engine.rng('fx'))` | [src/view/audio/cues.js:8] <!-- C-293 -->
| `createCues` | A cue has a key that is not allowed | `createCues: cue '<id>' has no '<key>' (<keys>)` | [src/view/audio/cues.js:11] <!-- C-294 -->
| `createCues` | Bad `src` | `createCues: cue '<id>': src must be a url or a non-empty list of urls` | [src/view/audio/cues.js:13] <!-- C-295 -->
| `createCues` | Bad `max` | `createCues: cue '<id>': max must be an integer >= 1` | [src/view/audio/cues.js:15] <!-- C-296 -->
| `cues.play` | Unknown cue id | `cues.play: unknown cue '<id>'` | [src/view/audio/cues.js:30] <!-- C-301 -->
| `bindContactSounds` | `engine.events.on` is missing | `bindContactSounds: engine with events required` | [src/view/audio/contacts.js:5] <!-- C-309 -->
| `bindContactSounds` | `cues.play` or `cues.has` is missing | `bindContactSounds: cues from createCues required` | [src/view/audio/contacts.js:6] <!-- C-309 -->
| `bindContactSounds` | Not `min >= 0` and `full > min` | `bindContactSounds: need 0 <= min < full` | [src/view/audio/contacts.js:7] <!-- C-309 -->
| `createDsp` | Bad `name` | Rejects with `createDsp: name must match [\w-]+` | [src/view/audio/dsp.js:26] <!-- C-318 -->
| `createDsp` | `Class` lacks `render` or `setParams` | Rejects with `createDsp: Class must have render(L, R, n) and setParams(msg)` | [src/view/audio/dsp.js:27] <!-- C-319 -->
| `createDsp` | `audio.ctx` is null | Rejects with `createDsp: no audio context yet (call it from audio.onUnlock)` | [src/view/audio/dsp.js:29] <!-- C-320 -->
| `createDsp` | Name registered with another `Class` | Rejects with `createDsp: '<name>' is already registered with another class` | [src/view/audio/dsp.js:32] <!-- C-322 -->
| DSP module load | No AudioWorklet, or `addModule` fails | Warns with `console.warn` and runs the class on the main thread | [src/view/audio/dsp.js:18; src/view/audio/dsp.js:21] <!-- C-323 C-324 --> |

## Dependencies
- **Internal:** `bindGesture` from `src/view/gesture.js`, in the [view-input spec](view-input.md). The orbit rig makes three bindings: touch drag and pinch, mouse button 2, and mouse button 1. [src/view/camera/orbit.js:15; src/view/camera/orbit.js:96-100] <!-- C-219 -->
- **Internal:** View sync, crowd and the asset store call `compiler.apply`, `instancedShadows`, `disposeTree` and `gfx.warm` from the view-render feature (F06). The F06 outline gives those interfaces. [src/view/sync/index.js:20; src/view/instancing/parts.js:11; src/view/assets/index.js:96] <!-- C-259 -->
- **Internal:** View sync reads `world.with`, `world.xfPrev`, `world.partXfPrev`, `world.serial` and `world.net.tunables`. It reads the entity parts `xf`, `partXf`, `netFix`, `model`, `draw`, `paint`, `scale`, `coverage`, `tags` and `net`. [src/view/sync/index.js:149; src/view/sync/index.js:178; src/view/sync/index.js:207] <!-- C-260 -->
- **Internal:** The asset store is view only. Headless engines and sim code have no assets. [src/view/assets/index.js:4] <!-- C-95 -->
- **Internal:** The audio service is view only. Sim code never imports it. Each warning prints once per key through `console.warn`. [src/view/audio/index.js:6; src/view/audio/index.js:29] <!-- C-160 -->
- **Internal:** The render pipeline in the view-render feature (F06) calls `view.audio.frame()` after `view.sync.frame(alpha)`. [src/view/render/pipeline.js:62; src/view/render/pipeline.js:87] <!-- C-292 -->
- **Internal:** `bindContactSounds` reads `engine.events.on`, `engine.world.materials` (`pair`, `get` and the `sound` field), and `engine.time.sim`. The contact event fields are `a`, `b`, `materials`, `impulse` and `point`. [src/view/audio/contacts.js:5; src/view/audio/contacts.js:11-12; src/view/audio/contacts.js:16-18] <!-- C-311 C-313 -->
- **Internal:** `createCues` needs an `rng` with `next()`. The header comment says to pass `engine.rng('fx')`. [src/view/audio/cues.js:2; src/view/audio/cues.js:8] <!-- C-293 -->
- **External:** three, and `GLTFLoader` and the meshopt decoder from `three/addons`. [src/view/assets/loader.js:4-5; src/view/assets/index.js:5-6] <!-- C-261 -->

<!-- related-specs -->
Related specs:

- Imports: [View boot, input and seats](view-input.md)
- Imports: [Rendering and materials](view-render.md)
- Imported by: [Rendering and materials](view-render.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Open questions and discrepancies
- Open question: why does view sync start each instanced part at 16 instances? No source states the reason.
- Open question: why does the shake jitter move only x and y of the wanted camera position? No source states the reason.
- Open question: why does the contact handler prune its pair map only above 512 keys? No source states the reason.
- Open question: why does `cues.play` stop the oldest live play before it knows that `audio.play` succeeds? No source states the reason.
- Note: `docs/spec.md` [U-6] and [R-8] hold clarifications for [H-5]. A DSP class cannot reach `engine.rng`, and the engine does not control the structured clone of `postMessage`. The code of `dsp.js` does not show either rule. [docs/spec.md:311; docs/spec.md:382]
