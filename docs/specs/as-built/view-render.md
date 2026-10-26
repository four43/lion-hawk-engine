---
id: F06
title: Rendering and materials
status: as-built
source_commit: 7224d6b
paths:
  - src/view/render/**
  - src/view/materials/**
generated: STE spec writer
---

# Rendering and materials

## Summary
This feature builds the renderer, the light rig and the render pipeline that `boot` creates for `defineView({ render })`. It also holds the GPU hygiene helpers, the object snapshot, the tilt-shift post pass and the material compiler. The material compiler turns each material of the material registry into a three.js material with shader features.
## Scope
- **In scope:** `createPipeline`, `checkRender`, `createRenderer`, `fitView`, the light rig, `warm`, `instancedShadows`, `disposeTree`, `snapshot`, `createTiltShift`, the material compiler, its shader features and `furGeometry`.
- **Out of scope:** view sync, assets, instancing, camera rigs and audio. See the [view-presentation spec](view-presentation.md).
- **Out of scope:** the material registry and the coverage kit. See the [defs-and-kits spec](defs-and-kits.md).

## Terms
See the [glossary](_meta/glossary.md). The terms below are specific to this feature.

- **coat:** a resolved paint value `{ mode, axis, s, l, color, key }` that the compiler gives to the PAINT uniforms. [src/view/materials/compiler.js:20-30] <!-- new term -->
- **extra:** a game patch that `compiler.extend()` adds to a material. The extra runs after the engine patches. [src/view/materials/compiler.js:160-166] <!-- new term -->

## Interfaces

### Material compiler

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createMaterialCompiler(registry = defineMaterials({}), { shading = 'physical', paint: { base = 'steel', shade = [0.25, 0.85, 1.1] } })` | in | Returns the compiler | [src/view/materials/compiler.js:16; src/view/materials/compiler.js:51] <!-- C-1 --> |
| Compiler members `shading`, `time`, `get`, `paint`, `coverage`, `extend`, `apply`, `repaint`, `depth`, `furGeometry`, `keys`, `made`, `dispose`, `twins` | out | The object is not frozen | [src/view/materials/compiler.js:284-290] <!-- C-2 --> |
| `made()` and `twins()` | out | `made()` returns `[{ material, use }]`. `twins()` returns `[{ material, use, side }]`. | [src/view/materials/compiler.js:288-289] <!-- C-3 --> |
| `CHUNKS`, `inject(src, chunk, text, where = 'after')`, `DEPTH_FEATURES`, `patchDepth(sh, features)`, `patchShader(sh, features)` | out | Functions and constants of `chunks.js` | [src/view/materials/chunks.js:8; src/view/materials/chunks.js:16; src/view/materials/chunks.js:179-188] <!-- C-4 --> |
| `furGeometry(geometry, mask, { shells = 10 } = {})` | in | Returns a geometry. The compiler member `furGeometry` forwards its arguments. | [src/view/materials/fur.js:15; src/view/materials/compiler.js:287] <!-- C-5 --> |

### Render pipeline and renderer

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `RENDER_KEYS`, `SHADING`, `checkRender(render)` | out | Constants and a validator | [src/view/render/pipeline.js:17-18; src/view/render/pipeline.js:22] <!-- C-9 --> |
| `createPipeline(engine, view, render, { doc, target, canvas, renderer = null, flags = {}, report })` | in | Returns `{ frame(alpha), draw(), dispose() }` | [src/view/render/pipeline.js:47; src/view/render/pipeline.js:62; src/view/render/pipeline.js:86-98] <!-- C-9 C-10 --> |
| `view.audio`, `view.gfx`, `view.materials`, `view.assets`, `view.sync`, `engine.assets` | out | Set by `createPipeline` | [src/view/render/pipeline.js:50; src/view/render/pipeline.js:79-83] <!-- C-16 -->|
| `gfx.warm(opts = {})` | out | Takes `opts.materials` and `opts.depth` | [src/view/render/pipeline.js:74-78] <!-- C-15 --> |
| `SHADOWS`, `TONE`, `PORTRAIT_BELOW`, `DEFAULT_DPR`, `DEFAULT_CAMERA`, `checkShadows`, `checkToneMapping`, `fitView`, `createRenderer` | out | Exports of `renderer.js` | [src/view/render/renderer.js:6-13; src/view/render/renderer.js:18; src/view/render/renderer.js:31] <!-- C-11 --> |
| `gfx`: `renderer`, `scene`, `camera`, `size`, `post`, `resize`, `lost`, `render()`, `info()`, `dispose()` | out | Result of `createRenderer` | [src/view/render/renderer.js:70-86] <!-- C-12 --> |

### Lights, hygiene, object snapshot and tilt-shift

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `LIGHT_DEFAULTS`, `DEFAULT_PRESETS`, `checkLights(opts = {})`, `createLightRig(scene, opts = {})` | out | Exports of `lights.js` | [src/view/render/lights.js:8; src/view/render/lights.js:13; src/view/render/lights.js:24; src/view/render/lights.js:37] <!-- C-7 --> |
| Light rig `{ hemi, sun, follow, set, lerp, dispose, presets }` | out | `presets` is the frozen list of names | [src/view/render/lights.js:64; src/view/render/lights.js:100] <!-- C-8 --> |
| `INSTANCED_DEPTH`, `instancedShadows(root)`, `WARM_USES`, `warm(renderer, scene, camera, { materials = [], depth = [] } = {})`, `disposeTree(root, { keepShared } = {})`, `programCount(renderer)` | out | Exports of `hygiene.js` | [src/view/render/hygiene.js:9; src/view/render/hygiene.js:12; src/view/render/hygiene.js:19; src/view/render/hygiene.js:54; src/view/render/hygiene.js:92; src/view/render/hygiene.js:121] <!-- C-6 --> |
| `STUDIO`, `alphaBounds(px, w, h, min = 8, out = {})`, `copyRows(px, w, x0, y0, x1, y1, dst)`, `snapshot(renderer, object, options)` | out | Exports of `snapshot.js` | [src/view/render/snapshot.js:8; src/view/render/snapshot.js:11; src/view/render/snapshot.js:18; src/view/render/snapshot.js:47] <!-- C-13 --> |
| `SHADERS`, `TILT_DEFAULTS`, `createTiltShift(renderer, opts = {})` | out | The result has `render`, `setSize`, `dispose`, `params`, `targets` and `passes` | [src/view/render/tiltShift.js:67-70; src/view/render/tiltShift.js:102] <!-- C-14 --> |

## Behavior

### Render pipeline
- **B-1** Each render slot runs reconcile in `boot`, then `frame(alpha)`, then `draw()`. [src/view/render/pipeline.js:6-7] <!-- C-153 -->
- **B-2** `frame(alpha)` calls `view.sync.frame(alpha)`. `draw()` calls `gfx.render()`. Both do nothing after dispose. [src/view/render/pipeline.js:87-88; test/render-pipeline.test.mjs:51; test/render-pipeline.test.mjs:80] <!-- C-166 -->
- **B-3** `createPipeline` finds the canvas in this order: the `canvas` option, `renderer.domElement`, the first canvas element in `doc`. [src/view/render/pipeline.js:48] <!-- C-155 -->
- **B-4** `createPipeline` calls `createRenderer` with the `dpr`, `antialias`, `shadows`, `toneMapping`, `exposure` and `camera` values of `render`. [src/view/render/pipeline.js:53] <!-- C-156 -->
- **B-5** When the WebGL context is lost, the pipeline reports an Error that starts with `render: the WebGL context was lost`. [src/view/render/pipeline.js:54; test/render-pipeline.test.mjs:128] <!-- C-157 -->
- **B-6** When the context is restored, the pipeline calls `gfx.warm()` again, because every program is gone. A failure of that call goes to `report`. [src/view/render/pipeline.js:55; test/render-pipeline.test.mjs:128] <!-- C-157 -->
- **B-7** When `createRenderer` throws (no WebGL), the pipeline calls `report` once with `Error('render: <message>')`. The page runs on. [src/view/render/pipeline.js:56-58; test/render-pipeline.test.mjs:69; test/e2e-render.test.mjs:60] <!-- C-158 -->
- **B-8** In that case the pipeline sets `view.gfx`, `view.materials`, `view.assets` and `view.sync` to null. The pipeline sets `engine.assets` to undefined. [src/view/render/pipeline.js:59-61] <!-- C-158 -->
- **B-9** In that case `frame` and `draw` do nothing. The `dispose` of the pipeline disposes `view.audio` once. `view.audio` exists in that case. [src/view/render/pipeline.js:50; src/view/render/pipeline.js:62] <!-- C-159 -->
- **B-10** The pipeline builds the light rig with `createLightRig(gfx.scene, render.lights ?? {})`. When `render.lights` is false, `gfx.lights` is null. The scene then has no rig, no background and no fog. [src/view/render/pipeline.js:72; test/render-pipeline.test.mjs:45] <!-- C-160 -->
- **B-11** The pipeline builds the compiler from `engine.game.defs?.materials`. The shading tier is `render.shading ?? 'physical'`. The paint option is `render.paint`. [src/view/render/pipeline.js:73; test/render-pipeline.test.mjs:39; test/render-pipeline.test.mjs:45] <!-- C-161 -->
- **B-12** `gfx.warm(opts)` calls `warm` with the materials of `compiler.made()` plus `opts.materials`. It passes the twins of `compiler.twins()` plus `opts.depth` as the `depth` option. [src/view/render/pipeline.js:74-78; test/render-pipeline.test.mjs:61] <!-- C-162 -->
- **B-13** Only when `render.assets` is set, the pipeline builds the asset store with the manifest, `base` (default `./assets/`), `decoders`, the compiler, the renderer and `gfx`. Otherwise `view.assets` is null and `engine.assets` is undefined. [src/view/render/pipeline.js:80-82; test/render-pipeline.test.mjs:31] <!-- C-163 -->
- **B-14** The pipeline builds view sync with `createViewSync(engine, { gfx, assets, compiler, view })`. [src/view/render/pipeline.js:83; test/render-pipeline.test.mjs:36] <!-- C-164 -->
- **B-15** The pipeline `dispose()` runs once. It clears `engine.assets` when that equals `view.assets`. [src/view/render/pipeline.js:89-91; test/render-pipeline.test.mjs:80] <!-- C-167 -->
- **B-16** Then `dispose()` runs these steps in order: view sync dispose, assets dispose, compiler dispose, audio dispose, light rig dispose, `gfx` dispose. [src/view/render/pipeline.js:93] <!-- C-167 -->
- **B-17** `checkRender` calls `checkLights` for `render.lights` when it is set and is not false. [src/view/render/pipeline.js:44] <!-- C-152 -->

### Renderer and resize
- **B-18** `fitView` takes the width and height from the CSS size, then from the window size, then 1, for each value that is not above 0. [src/view/render/renderer.js:15-19; test/render-renderer.test.mjs:32] <!-- C-172 -->
- **B-19** A numeric `dpr` option is the DPR cap. An object `dpr` gives the cap `touch` (default 1.5) when `touchPoints` is above 1, and `desktop` (default 2) otherwise. [src/view/render/renderer.js:16-17; src/view/render/renderer.js:20; test/render-renderer.test.mjs:17] <!-- C-173 -->
- **B-20** The pixel ratio is the smaller of the device DPR and the cap. A device DPR that is not above 0 counts as 1. [src/view/render/renderer.js:21] <!-- C-173 -->
- **B-21** `navigator.maxTouchPoints` above 1 means an iPad or a phone. A value of 1 means a desktop touch screen. [src/view/render/renderer.js:15-17] <!-- C-175 -->
- **B-22** `fitView` sets the aspect to `w / h`. It uses `fovPortrait` only when the aspect is below 0.9, and `fov` otherwise. [src/view/render/renderer.js:21-22; test/render-renderer.test.mjs:25] <!-- C-174 -->
- **B-23** Without a given renderer, `createRenderer` makes a `WebGLRenderer` with the canvas, the `antialias` option and `powerPreference` `'high-performance'`. The constructor throws when WebGL is not available. [src/view/render/renderer.js:38] <!-- C-179 -->
- **B-24** `createRenderer` enables the shadow map unless `shadows` is false. It sets the shadow map type from `SHADOWS`, the tone mapping type from `TONE`, and `toneMappingExposure` to `exposure`. [src/view/render/renderer.js:40-42; test/render-renderer.test.mjs:36; test/render-renderer.test.mjs:46] <!-- C-180 -->
- **B-25** `createRenderer` makes a `Scene` and a `PerspectiveCamera`. The camera takes `fov`, `near` and `far` from `DEFAULT_CAMERA` merged with the `camera` option. The aspect is 1 until the first resize. [src/view/render/renderer.js:43-44] <!-- C-181 -->
- **B-26** `resize()` reads the client size of the canvas. It also reads the size and the device pixel ratio of the target. The target is the window of the canvas, or `globalThis`. The touch point count is `target.navigator.maxTouchPoints`, else `globalThis.navigator.maxTouchPoints`, else 0. [src/view/render/renderer.js:37; src/view/render/renderer.js:49-57] <!-- C-182 -->
- **B-27** `resize()` calls `fitView` and returns the size object `{ w, h }`. `resize()` does nothing after dispose. [src/view/render/renderer.js:49-57] <!-- C-182 -->
- **B-28** When the size and the pixel ratio did not change since the last resize, `resize()` does not touch the renderer. The window event and the ResizeObserver both fire, and `setSize` reallocates the drawing buffer. [src/view/render/renderer.js:58; test/render-renderer.test.mjs:95] <!-- C-183 -->
- **B-29** On a change, `resize()` sets the pixel ratio and calls `setSize(w, h, false)`. It also sets the aspect, the `fov`, `userData.lhFov` and the projection matrix of the camera. [src/view/render/renderer.js:59-61; test/render-renderer.test.mjs:36] <!-- C-184 -->
- **B-30** `createRenderer` calls `resize()` once at creation. It adds a `resize` listener to the target. [src/view/render/renderer.js:63-64; src/view/render/renderer.js:87; test/render-renderer.test.mjs:58] <!-- C-185 -->
- **B-31** When the target has `ResizeObserver`, `createRenderer` observes the canvas, because the canvas can change size without a window resize. [src/view/render/renderer.js:65-66] <!-- C-185 -->
- **B-32** On `webglcontextlost`, `createRenderer` calls `preventDefault` so the browser may restore the context. It sets `gfx.lost` to true and calls `onLost`. [src/view/render/renderer.js:28-30; src/view/render/renderer.js:67] <!-- C-186 -->
- **B-33** On `webglcontextrestored`, `createRenderer` sets `gfx.lost` to false and calls `onRestored`. [src/view/render/renderer.js:68-69; test/render-pipeline.test.mjs:128] <!-- C-186 -->
- **B-34** `gfx.render()` draws nothing when `gfx` is disposed or lost. Otherwise it calls `gfx.post.render(scene, camera)` when `gfx.post` is set, and `renderer.render(scene, camera)` when not. [src/view/render/renderer.js:72; test/render-renderer.test.mjs:71] <!-- C-187 -->
- **B-35** `gfx.info()` fills one reused object with `calls`, `triangles`, `points`, `lines`, `geometries`, `textures` and `programs` from `renderer.info`. It returns that object. [src/view/render/renderer.js:47; src/view/render/renderer.js:73-78; test/render-renderer.test.mjs:86] <!-- C-188 -->
- **B-36** `gfx.dispose()` runs once. It removes the resize and context listeners and disconnects the ResizeObserver. [src/view/render/renderer.js:79-82; test/render-renderer.test.mjs:58; test/render-renderer.test.mjs:71] <!-- C-189 -->
- **B-37** `gfx.dispose()` then disposes `gfx.post` when it has a `dispose` function, and sets `gfx.post` to null. It disposes the renderer and frees the page claim. [src/view/render/renderer.js:83-84] <!-- C-189 -->
- **B-38** `gfx.post` belongs to the game. Clearing or replacing `gfx.post` disposes nothing. `gfx.dispose()` disposes the post object that is set at that time. [src/view/render/renderer.js:83; test/render-renderer.test.mjs:79] <!-- C-190 -->
- **B-39** The per-frame paths of the renderer, the light rig and tilt-shift allocate nothing (R-8). [test/render-renderer.test.mjs:90; test/render-lights.test.mjs:91; test/render-tiltshift.test.mjs:50] <!-- C-238 -->

### Light rig
- **B-40** `createLightRig` first runs `checkLights`. It merges `opts` over `LIGHT_DEFAULTS`, and `opts.sun` over `LIGHT_DEFAULTS.sun`. [src/view/render/lights.js:38-39] <!-- C-130 -->
- **B-41** `createLightRig` makes a `HemisphereLight` and a `DirectionalLight`. It adds both lights and the sun target to the scene. [src/view/render/lights.js:40-41; src/view/render/lights.js:50] <!-- C-131 -->
- **B-42** The sun casts shadows only when `sun.map` is above 0. Then the shadow map is `sun.map` by `sun.map` pixels. The shadow camera gets `near` and `far`, and the sun gets `bias` and `normalBias`. [src/view/render/lights.js:42-49; test/render-lights.test.mjs:87] <!-- C-132 -->
- **B-43** The shadow box is `box` by `box` when `box` is a number. When `box` is `[x, z]`, the box is uneven. [src/view/render/lights.js:44; test/render-lights.test.mjs:30] <!-- C-132 -->
- **B-44** `createLightRig` sets `scene.background` to a `Color` of the sky value. Then it sets `scene.fog` to a three.js `Fog` in the sky colour with the near and far of `fog`. When `fog` is false, it sets `scene.fog` to null. [src/view/render/lights.js:51-53; test/render-lights.test.mjs:87] <!-- C-133 -->
- **B-45** The rig always has the light presets `day`, `dusk` and `night`, plus the names in `opts.presets`. [src/view/render/lights.js:63; test/render-lights.test.mjs:71] <!-- C-134 -->
- **B-46** The rig makes each light preset once. The preset values come over its default (`dusk` and `night` only) over the base look. The `day` preset has no default. [src/view/render/lights.js:55-63; test/render-lights.test.mjs:71] <!-- C-134 -->
- **B-47** The fog distances of a light preset are the preset `fog`, else the default `fog`, else the base `fog`, else `[0, 0]`. [src/view/render/lights.js:54] <!-- C-135 -->
- **B-48** A light preset changes colours, intensities, the sun offset and the fog distances. A light preset never changes state that selects a shader program, such as fog on or off, shadow casting or the map size. [src/view/render/lights.js:1-4; test/render-lights.test.mjs:49] <!-- C-136 -->
- **B-49** `follow(x, z, y = 0)` puts the sun target at the point and the sun at the point plus the current offset. [src/view/render/lights.js:69-83] <!-- C-137 -->
- **B-50** When the sun casts shadows, `follow` first moves the point in whole shadow-map texels across the light, so shadow edges do not shimmer. Along the light the point moves freely. [src/view/render/lights.js:69-83; test/render-lights.test.mjs:22; test/render-lights.test.mjs:99] <!-- C-137 -->
- **B-51** The texel size is the width (and the height) of the shadow box divided by the map size. The drawn box is within one texel of the point. [src/view/render/lights.js:71-72] <!-- C-138 -->
- **B-52** `lerp(a, b, k)` clamps `k` to 0..1. It blends the sky colour and the hemisphere sky colour, ground colour and intensity. [src/view/render/lights.js:84-88; test/render-lights.test.mjs:56] <!-- C-139 -->
- **B-53** `lerp` also blends the fog colour and distances when `scene.fog` exists, the sun colour and intensity, and the sun offset. Then it calls `follow` again with the last point. [src/view/render/lights.js:87-90; test/render-lights.test.mjs:56] <!-- C-139 -->
- **B-54** `set(name)` with a string applies that light preset exactly. [src/view/render/lights.js:93; test/render-lights.test.mjs:34] <!-- C-140 -->
- **B-55** `set(k)` with a number clamps `k` to 0..1. When `k` is below 0.5, it blends `day` to `dusk` with `k * 2`. Otherwise it blends `dusk` to `night` with `k * 2 - 1`. [src/view/render/lights.js:95-96; test/render-lights.test.mjs:34] <!-- C-140 -->
- **B-56** At creation the rig calls `set('day')` and `follow(0, 0)`. [src/view/render/lights.js:99] <!-- C-142 -->
- **B-57** A game light preset named `day` replaces the base look, and the rig starts from it. [src/view/render/lights.js:63; src/view/render/lights.js:99; test/render-lights.test.mjs:71] <!-- C-143 -->
- **B-58** The rig `dispose()` removes the hemisphere light, the sun and its target from the scene and disposes the lights. [src/view/render/lights.js:98; test/render-lights.test.mjs:95] <!-- C-144 -->
- **B-59** The rig `dispose()` sets `scene.background` to null only when the background is still the sky colour of the rig. [src/view/render/lights.js:98; test/render-lights.test.mjs:95] <!-- C-144 -->

### Material compiler: cache and construction
- **B-60** The compiler maps each shading tier to a three.js class. `physical` gives `MeshPhysicalMaterial`, `standard` gives `MeshStandardMaterial`, and `lambert` gives `MeshLambertMaterial`. [src/view/materials/compiler.js:10] <!-- C-50 -->
- **B-61** The compiler copies these look fields for `lambert`: `color`, `emissive`, `emissiveIntensity`, `opacity`, `transparent`, `flatShading` and `side`. [src/view/materials/compiler.js:11-12; test/compiler.test.mjs:30] <!-- C-51 -->
- **B-62** The tier `standard` adds `metalness` and `roughness`. The tier `physical` adds `clearcoat`, `clearcoatRoughness`, `sheen`, `sheenColor`, `sheenRoughness`, `transmission`, `ior` and `thickness`. A field that the tier lacks is dropped. [src/view/materials/compiler.js:12-13; src/view/materials/compiler.js:109; test/compiler.test.mjs:30] <!-- C-51 -->
- **B-63** The compiler skips a look field that is undefined. It sets `color`, `emissive` and `sheenColor` with `Color.set`. [src/view/materials/compiler.js:14; src/view/materials/compiler.js:110-111] <!-- C-52 -->
- **B-64** The compiler maps `side` `'double'` to `DoubleSide` and any other value to `FrontSide`. [src/view/materials/compiler.js:112] <!-- C-52 -->
- **B-65** `get(id, opts)` turns `instanced`, `vertexColors`, `skinned` and `paint` into booleans. `receiveShadow` is true unless it is false. `map` defaults to null. `fur` is true unless it is false. [src/view/materials/compiler.js:58-63] <!-- C-53 -->
- **B-66** A `wind` option becomes `{ fade, amp }`. `fade` defaults to `[0, 0]` and `amp` defaults to `[0.12, 0.08]`. Without a `wind` option the value is null. [src/view/materials/compiler.js:15; src/view/materials/compiler.js:61] <!-- C-54 -->
- **B-67** `get()` chooses `COVERAGE` when the registry entry has a coverage block. It chooses `FUR` when `look.fur` is set and the `fur` option is true. [src/view/materials/compiler.js:64-67; test/compiler.test.mjs:71] <!-- C-55 -->
- **B-237** `get()` also chooses `COVERAGE_WET` when the coverage block has `wet` above 0. `COVERAGE_WET` is a define only: it adds no patch of its own. [src/view/materials/compiler.js:67; test/compiler.test.mjs:98] <!-- C-wet-1 -->
- **B-68** `get()` chooses `SUBSURFACE` when `look.subsurface.strength` is above 0 and the tier is not `lambert`. It chooses `WIND` when a `wind` option is set, and `PAINT` when the `paint` option is set. [src/view/materials/compiler.js:68-71; test/compiler.test.mjs:64; test/compiler.test.mjs:71] <!-- C-55 -->
- **B-69** The cache key of `get()` joins the id, the tier, the map uuid and the feature list. It also joins four flags as 0 or 1: `instanced`, `vertexColors`, `skinned` and `receiveShadow`. A `wind` option adds `|wind:` with the `fade` and `amp` values. [src/view/materials/compiler.js:101-102; test/compiler.test.mjs:48] <!-- C-56 -->
- **B-70** The compiler gives each user kind its own material: instanced, plain, skinned and shadow-receiving users (matSplit). The cache key holds these flags, and this behavior is always on. [src/view/materials/compiler.js:1-4; src/view/materials/compiler.js:101; test/compiler.test.mjs:48] <!-- C-240 -->
- **B-71** `get()` returns the cached material when the key exists. Otherwise it makes a new material of the tier class, names it with the id and caches it. [src/view/materials/compiler.js:104-126] <!-- C-57 -->
- **B-72** When the `vertexColors` option is set, `get()` sets `material.vertexColors` and sets `color` to white (1, 1, 1). The vertex colours then replace `look.color`. [src/view/materials/compiler.js:116-117; test/compiler.test.mjs:40] <!-- C-58 -->
- **B-73** When the `paint` option is set, `get()` sets `color` to white. A `map` option sets `material.map`. [src/view/materials/compiler.js:118-119] <!-- C-59 -->
- **B-74** `get()` sets `userData.lh` to `{ id, key, tier, instanced, vertexColors, skinned, receiveShadow, features }`. It sets `userData.lhShared` to true. [src/view/materials/compiler.js:120; src/view/materials/compiler.js:122] <!-- C-60 -->
- **B-75** `get()` sets `userData.lhUse` to `'instanced'`, `'skinned'` or `'plain'`, in that priority. [src/view/materials/compiler.js:121] <!-- C-60 -->
- **B-76** `install()` sets a define with an empty value for each feature. [src/view/materials/compiler.js:36-37] <!-- C-61 -->
- **B-77** When the material has features or extras, `install()` sets `onBeforeCompile` and `customProgramCacheKey`. The key is `lh:` plus the features joined by `+` plus `|x:<name>` for each extra. [src/view/materials/compiler.js:38-45; test/compiler.test.mjs:71] <!-- C-61 -->
- **B-78** The `onBeforeCompile` of a compiled material copies the uniforms of the material into the shader. It runs `patchShader`, then runs each extra patch as `patch(shader, inject, { depth: false })`. [src/view/materials/compiler.js:40-44; test/compiler.test.mjs:85] <!-- C-62 -->
- **B-79** `Material.clone()` drops `onBeforeCompile` and the defines, so the compiler calls `install()` again on each clone. [src/view/materials/compiler.js:32; src/view/materials/compiler.js:136] <!-- C-63 -->

### Material compiler: uniforms
- **B-80** A `COVERAGE` material gets the uniform `uCoverage` (a `Vector4`, default zero). It also gets `uCoverageAccept` = (dirt, rust, snow, mud) from the coverage block, with 0 for a missing field. [src/view/materials/compiler.js:76-80] <!-- C-64 -->
- **B-238** A `COVERAGE_WET` material gets the uniform `uWet` (a `Vector2`): x is the wet level (0 at first), y is the `wet` value of the coverage block. Each per-entity clone has its own `uWet`. [src/view/materials/compiler.js:81; src/view/materials/compiler.js:134; test/compiler.test.mjs:98] <!-- C-wet-2 -->
- **B-81** A `FUR` material gets `furLen` (default 0.07), `furDensity` (default 34) and `furTint` (default `#ffffff`) from `look.fur`. [src/view/materials/compiler.js:81-84] <!-- C-65 -->
- **B-82** A `SUBSURFACE` material gets `uSubColor` (default `#ffffff`) and `uSubStrength` from `look.subsurface`. [src/view/materials/compiler.js:85-88] <!-- C-66 -->
- **B-83** A `WIND` material gets `uLhTime`, `uWindFade` and `uWindAmp`. `uLhTime` is the one clock object of the compiler, shared by all windy materials. The game sets `compiler.time.value` in seconds. [src/view/materials/compiler.js:56; src/view/materials/compiler.js:89-92; test/compiler.test.mjs:98] <!-- C-67 -->
- **B-84** A `PAINT` material gets `uPaintMode` = (mode, s, l), `uPaintAxis` and `uPaintShade`. `uPaintShade` is one `Vector3` per compiler. [src/view/materials/compiler.js:56; src/view/materials/compiler.js:93-97] <!-- C-68 -->
- **B-85** Without a coat, the mode of a `PAINT` material is 1 (instance colour) for an instanced material and 0 (vertex colours) otherwise. [src/view/materials/compiler.js:17-19; src/view/materials/compiler.js:94] <!-- C-68 -->

### Material compiler: paint, coverage and extend
- **B-86** `coatOf` turns a paint value into a coat. A string, a number or a `Color` gives mode 1 with that colour. The key is the hex string of the colour. [src/view/materials/compiler.js:21-22] <!-- C-69 -->
- **B-87** A hue value `{ hue: { axis = [0, 0, 1], from = -1, to = 1, s = 0.75, l = 0.5 } }` gives mode 2. `axis` must have 3 elements, all values must be finite, and `from` must differ from `to`. [src/view/materials/compiler.js:23-28] <!-- C-70 -->
- **B-88** For a hue value the coat divides `axis` by `to - from` and sets `w = -from / (to - from)`. [src/view/materials/compiler.js:27] <!-- C-70 -->
- **B-89** `paint(id, value, opts)` gets the base material, with the `paint` option set for a hue value. It caches one clone for each base key and coat key. The clone shares the program. [src/view/materials/compiler.js:141-148; test/compiler-apply.test.mjs:17; test/compiler-paint.test.mjs:74] <!-- C-71 -->
- **B-90** The colour of the clone from `paint()` is the coat colour, or white for a hue. [src/view/materials/compiler.js:146] <!-- C-71 -->
- **B-91** A clone made by `variant()` has its own uniform objects and the same program as its source. [src/view/materials/compiler.js:128-139] <!-- C-72 -->
- **B-92** When the key is null, the clone is not cached and has `userData.lhShared` false. The entity that holds the clone disposes it. [src/view/materials/compiler.js:128; src/view/materials/compiler.js:135] <!-- C-72 -->
- **B-93** `coverage(material, { uCoverage })` for a plain material returns a new per-entity clone with its own `uCoverage` vector. The default vector is zero. The compiler does not cache the clone. [src/view/materials/compiler.js:154-156; test/compiler-apply.test.mjs:30] <!-- C-73 -->
- **B-94** `coverage(material)` for an instanced material returns one shared variant per material. The variant has `COVERAGE_INSTANCED` added after the first feature. The cache key ends with `|covi`. [src/view/materials/compiler.js:153-155; test/compiler-apply.test.mjs:46] <!-- C-74 -->
- **B-239** `coverage()` returns `uniforms.uWet`, the `uWet` vector of the returned material, or null without `COVERAGE_WET`. [src/view/materials/compiler.js:159-160; test/compiler.test.mjs:98] <!-- C-wet-3 -->
- **B-95** `coverage()` returns `{ material, uniforms: { uCoverage } }`. `uCoverage` is the vector of the returned material. [src/view/materials/compiler.js:157] <!-- C-75 -->
- **B-96** `extend(material, name, patch)` returns the cached variant with the key `<material key>|x:<name>` when it exists. Otherwise it makes a variant with the extra `{ name, patch }` added after the existing extras. [src/view/materials/compiler.js:164-165; test/compiler-apply.test.mjs:55] <!-- C-76 -->
- **B-97** An `extend()` patch runs after the engine patches. Its program cache key contains the extra name. [src/view/materials/compiler.js:39; src/view/materials/compiler.js:43; test/compiler-apply.test.mjs:55] <!-- C-77 -->
- **B-98** The game must call `extend()` before `coverage()`, because `extend()` accepts only shared materials. [src/view/materials/compiler.js:162] <!-- C-77 -->
- **B-99** `paintAttributes(root)` writes the attribute `lhPaint` (4 floats per vertex) onto each geometry that has vertex colours and no `lhPaint`. The geometry must belong to a mesh with a `paint-<slot>` material. [src/view/materials/compiler.js:168-197; test/compiler-paint.test.mjs:58] <!-- C-78 -->
- **B-100** `paintAttributes` writes each geometry once. [src/view/materials/compiler.js:173; src/view/materials/compiler.js:177-180] <!-- C-78 -->
- **B-101** `lhPaint` holds the vertex position in the space of the root, and the brightness `0.3 r + 0.6 g + 0.1 b` of the vertex colour. [src/view/materials/compiler.js:168-170; src/view/materials/compiler.js:184-187] <!-- C-79 -->
- **B-102** The compiler divides the brightness by the brightest vertex of the same slot in the tree, or by 1 when that value is 0. [src/view/materials/compiler.js:192-194] <!-- C-79 -->

### Material compiler: apply and repaint
- **B-103** `apply(root, { instanced = false, paint = null, coverage = false })` first runs `paintAttributes`. [src/view/materials/compiler.js:199-200] <!-- C-80 -->
- **B-104** For each mesh, `apply()` reads the authored material names from `userData.lhMat`, or from the names of the materials. It stores the names in `userData.lhMat`. [src/view/materials/compiler.js:204-206; test/compiler-apply.test.mjs:85] <!-- C-80 -->
- **B-105** For each material name `apply()` passes these options to `get()`. `instanced` is the option or an `InstancedMesh`. `vertexColors` is true when the mesh has a `color` attribute. [src/view/materials/compiler.js:207-209; test/compiler-apply.test.mjs:98] <!-- C-81 -->
- **B-106** `apply()` also passes `skinned`, the `receiveShadow` of the mesh, the `map` of the material and `fur` (the geometry has `furShell`). It passes `paint` when the name starts with `paint-` and the geometry has `color` and `lhPaint`. [src/view/materials/compiler.js:209; test/compiler-apply.test.mjs:98] <!-- C-81 -->
- **B-107** For a `paint-<slot>` name, `apply()` uses `colors[slot]`. When the mesh is not instanced and the value is set, it calls `paint()`. [src/view/materials/compiler.js:211-214; test/compiler-apply.test.mjs:85] <!-- C-82 -->
- **B-108** Otherwise `apply()` calls `get()` on the paint base. An instanced mesh takes its paint from `instanceColor`. [src/view/materials/compiler.js:214; test/compiler-apply.test.mjs:85] <!-- C-82 -->
- **B-109** For a name that is in the registry, `apply()` calls `get()`. [src/view/materials/compiler.js:215] <!-- C-83 -->
- **B-110** When `coverage` is true, `apply()` replaces each `COVERAGE` material with `coverage(m, { uCoverage }).material`. All meshes of the call share one `Vector4`. [src/view/materials/compiler.js:200-201; src/view/materials/compiler.js:217; test/compiler-apply.test.mjs:112] <!-- C-83 -->
- **B-240** `apply()` returns `{ uCoverage, uWet }`. With `coverage` true, `uWet` lists the `uWet` vector of each `COVERAGE_WET` clone, so the caller sets each `.x` to the wet level. Without `coverage`, both are null. [src/view/materials/compiler.js:204-205; src/view/materials/compiler.js:221; src/view/materials/compiler.js:229; test/compiler.test.mjs:98] <!-- C-wet-4 -->
- **B-111** `apply()` returns `{ uCoverage }`. The value is null when the `coverage` option is false. [src/view/materials/compiler.js:201; src/view/materials/compiler.js:225] <!-- C-84 -->
- **B-112** `apply()` keeps the shape of `mesh.material`, so an array stays an array. [src/view/materials/compiler.js:220] <!-- C-85 -->
- **B-113** A mesh with a `FUR` or `WIND` material gets `customDepthMaterial` = `depth(that material)`. The first such material in the list decides. [src/view/materials/compiler.js:221-223; test/compiler-depth.test.mjs:43] <!-- C-85 -->
- **B-114** `repaint(root, colors)` points each `paint-<slot>` material of a compiled tree at a new value. It returns `root`. It skips instanced materials. [src/view/materials/compiler.js:228-251] <!-- C-86 -->
- **B-115** For a shared material, `repaint()` swaps in the cached paint material, or the plain paint base when the value is null. A missing slot value counts as null. [src/view/materials/compiler.js:241; src/view/materials/compiler.js:243; test/compiler-paint.test.mjs:109] <!-- C-87 -->
- **B-116** For a per-entity clone (`userData.lhShared` false), `repaint()` changes the material in place, so its holders keep a valid material and its `uCoverage`. [src/view/materials/compiler.js:229-230; src/view/materials/compiler.js:244; test/compiler-paint.test.mjs:109] <!-- C-88 -->
- **B-117** With `PAINT`, the in-place change sets `uPaintMode` and `uPaintAxis`. The in-place change also sets the colour of the material, with or without `PAINT`. The colour is the coat colour when the coat has one. Without a coat colour, the colour is white when the material has `PAINT` or vertex colours. Otherwise the colour is the colour of the paint base material. [src/view/materials/compiler.js:244-245] <!-- C-88 -->

### Depth twins
- **B-118** `depth(material)` returns a `MeshDepthMaterial` with `RGBADepthPacking`. The name is `<material name>:depth` and the side is the side of the material. [src/view/materials/compiler.js:253-265; test/compiler-depth.test.mjs:14] <!-- C-89 -->
- **B-119** The compiler caches one depth twin for each material key. Per-entity coverage clones share the twin of their base. [src/view/materials/compiler.js:257; src/view/materials/compiler.js:261-262; test/compiler-depth.test.mjs:14] <!-- C-89 -->
- **B-120** A depth twin runs the `FUR` and `WIND` displacement through `patchDepth`, on the uniform objects of the source material. [src/view/materials/compiler.js:253-255; src/view/materials/compiler.js:271-272; test/compiler-depth.test.mjs:27] <!-- C-90 -->
- **B-121** A depth twin then runs each extra patch as `patch(shader, inject, { depth: true })`. [src/view/materials/compiler.js:273] <!-- C-90 -->
- **B-122** A depth twin has the defines of the moving features. Its program key is `lhd:` plus those features plus `|x:<name>` for each extra. [src/view/materials/compiler.js:266-269; src/view/materials/compiler.js:275] <!-- C-90 -->
- **B-123** A depth twin with no moving feature and no extra has no `onBeforeCompile` and no program key. [src/view/materials/compiler.js:267] <!-- C-91 -->
- **B-124** A depth twin has `userData.lhShared` true and `userData.lh = { depthOf: key of the source }`. It also has the `lhUse` of the source and `userData.lhSide`, the side of the source. [src/view/materials/compiler.js:277] <!-- C-92 -->
- **B-125** `compiler.dispose()` disposes every cached material and every depth twin. It empties both caches. [src/view/materials/compiler.js:282; test/compiler.test.mjs:109] <!-- C-93 -->

### Shader features
- **B-126** Every shader feature splices GLSL after a three.js chunk with `inject()`. Variable values are uniforms and are not baked into the source, so one program serves each feature set. [src/view/materials/chunks.js:1-4; src/view/materials/chunks.js:16-20] <!-- C-17 -->
- **B-127** `inject` puts the text after the line `#include <chunk>` by default. With `where = 'before'` it puts the text before that line. [src/view/materials/chunks.js:16-20] <!-- C-19 -->
- **B-128** `CHUNKS` lists the chunks that each feature patches. See the table in "Data and state". [src/view/materials/chunks.js:8-14] <!-- C-18 -->
- **B-129** `patchShader` applies the listed features in the key order of `CHUNKS`: `COVERAGE`, `FUR`, `SUBSURFACE`, `WIND`, `PAINT`. The order of the list does not matter. [src/view/materials/chunks.js:188-191; test/compiler-chunks.test.mjs:43] <!-- C-20 -->
- **B-130** `patchShader` ignores a listed name that is not a `CHUNKS` key. [src/view/materials/chunks.js:189] <!-- C-20 -->
- **B-131** Each injection goes directly after its chunk include. A patch applied later therefore runs before an earlier patch at the same chunk. `PAINT` is applied last, so `PAINT` runs before the coverage layers. [src/view/materials/chunks.js:19; src/view/materials/chunks.js:155; src/view/materials/chunks.js:188-191; test/compiler-paint.test.mjs:49] <!-- C-21 -->
- **B-132** `COVERAGE` reads the uniform `uCoverage` = (dirt, rust, snow, mud). The shader scales each level by `uCoverageAccept`, which comes from the coverage block of the material. [src/view/materials/chunks.js:29-30; src/view/materials/chunks.js:46; src/view/materials/chunks.js:54] <!-- C-22 -->
- **B-133** `COVERAGE` takes its noise in the own space of the mesh (the vertex value before the model matrix), so spots move with the mesh. [src/view/materials/chunks.js:29-31; src/view/materials/chunks.js:37] <!-- C-23 -->
- **B-134** When the define `COVERAGE_INSTANCED` is set, `COVERAGE` reads the per-instance attribute `instanceCoverage`. The level is `clamp(uCoverage + instanceCoverage, 0, 1)` times `uCoverageAccept`, so `uCoverage` is a shared floor. [src/view/materials/chunks.js:31; src/view/materials/chunks.js:35; src/view/materials/chunks.js:44; src/view/materials/chunks.js:51-52] <!-- C-24 -->
- **B-135** With `COVERAGE_INSTANCED` the mud pattern is seeded by `gl_InstanceID`. Without it the seed is 0. [src/view/materials/chunks.js:44; src/view/materials/chunks.js:52-54; src/view/materials/chunks.js:71] <!-- C-25 -->
- **B-136** Each coverage layer runs only when its level is above 0.002. The layers run in the order dirt, rust, snow, mud. [src/view/materials/chunks.js:56; src/view/materials/chunks.js:61; src/view/materials/chunks.js:66; src/view/materials/chunks.js:70] <!-- C-26 -->
- **B-137** The dirt layer mixes brown spots into the colour. The spots are more frequent low on the mesh. The height factor is `clamp(1.2 - y * 0.45, 0, 1)`. [src/view/materials/chunks.js:56-60] <!-- C-27 -->
- **B-138** The rust layer mixes orange-brown blotches into the colour. [src/view/materials/chunks.js:61-65] <!-- C-28 -->
- **B-139** The snow layer settles on faces that point up. The vertex stage works out the world-space up factor `vLhUp` from the object normal, with the instance matrix when `USE_INSTANCING` is set. [src/view/materials/chunks.js:38-42; src/view/materials/chunks.js:66-69] <!-- C-29 -->
- **B-140** The mud layer makes blotches that rise from the feet as the level rises. The height scale is 1.5 units. [src/view/materials/chunks.js:70-78] <!-- C-30 -->
- **B-241** With `COVERAGE_WET` the wet level is `uWet.x * uWet.y`. With `COVERAGE_INSTANCED` too, the level is `clamp(uWet.x + instanceWet, 0, 1) * uWet.y`, so `uWet.x` is a shared floor. Wet multiplies the colour by `1 - 0.25 * wet`. [src/view/materials/chunks.js:44-47; src/view/materials/chunks.js:76-83] <!-- C-wet-5 -->
- **B-242** `COVERAGE` computes a gloss value `lhGloss`: the wet level, or 0.55 times the mud blotch mask where that is higher. [src/view/materials/chunks.js:40; src/view/materials/chunks.js:69; src/view/materials/chunks.js:83; src/view/materials/chunks.js:107] <!-- C-wet-6 -->
- **B-243** When `lhGloss` is above 0.002, `COVERAGE` adds a Blinn-Phong highlight per directional light at `lights_fragment_end`: `0.6 * lhGloss * pow(saturate(dot(N, H)), 40) * saturate(dot(N, L)) * light colour`. Lambert adds it to the direct diffuse light, because lambert has no specular term. The other tiers add it to the direct specular light. The code exists only when `NUM_DIR_LIGHTS > 0`. [src/view/materials/chunks.js:109-122; test/compiler-e2e.test.mjs:72] <!-- C-wet-7 -->
- **B-141** `FUR` draws shells of a mesh made by `furGeometry`. Shell 0 draws untouched. Outer shells keep only fragments that lie inside a strand of 3D cell noise. [src/view/materials/chunks.js:82-84; src/view/materials/chunks.js:93-102] <!-- C-31 -->
- **B-142** The `FUR` vertex stage moves each vertex by `(furNormal * furLen - (0, 0.25 * furLen * furShell, 0)) * furShell * furMask`. The tips droop. [src/view/materials/chunks.js:88-89] <!-- C-32 -->
- **B-143** `furMask` scales the strand length per vertex. A mask of 0 is bare skin. The `FUR` fragment stage discards a shell fragment when `furMask` is below 0.02. [src/view/materials/chunks.js:83-84; src/view/materials/chunks.js:94] <!-- C-33 -->
- **B-244** With `COVERAGE`, the `FUR` vertex stage mats the coat: it multiplies `furMask` by `1 - 0.9 * lhMat`. `lhMat` is the mud level (the w lane of the coverage levels) or, with `COVERAGE_WET`, the wet level where that is higher. The fragment stage reads the matted mask, so strands get shorter and a fully matted coat keeps only short stubs. A depth twin defines only `FUR` and `WIND`, so its shadow does not mat. [src/view/materials/chunks.js:128-150; test/compiler-e2e.test.mjs:72] <!-- C-wet-8 -->
- **B-144** For each outer-shell fragment, the `FUR` shader finds the nearest strand among 8 cells of a jittered 3D grid. Each strand has the length `(0.45 + 0.55 * r.x) * furMask`. [src/view/materials/chunks.js:95-100] <!-- C-34 -->
- **B-145** The `FUR` shader discards a shell fragment when `furShell > h + furAA * 0.3`. It also discards the fragment when the strand distance exceeds `0.62 * (1 - furShell / h) + furAA * 0.5`. The value `furAA` widens strands at a distance. [src/view/materials/chunks.js:92; src/view/materials/chunks.js:101] <!-- C-35 -->
- **B-146** On outer shells `FUR` multiplies the colour by `mix(0.72, 1.06 * furTint, furShell)`. The roots are darker. [src/view/materials/chunks.js:103] <!-- C-36 -->
- **B-147** On outer shells `FUR` adds a rim term to the outgoing light before the `opaque_fragment` chunk. The term is the diffuse colour times `furRim * furShell * 0.35`. [src/view/materials/chunks.js:104-107] <!-- C-37 -->
- **B-148** `furRim` is `pow(1 - saturate(dot(normal, normalize(vViewPosition))), 2)`. [src/view/materials/chunks.js:105] <!-- C-37 -->
- **B-149** `SUBSURFACE` patches only the fragment stage. For each directional light it adds `uSubStrength * lhSss * light colour * BRDF_Lambert(uSubColor * diffuse colour)` to the direct diffuse light. The code exists only when `NUM_DIR_LIGHTS > 0`. [src/view/materials/chunks.js:117-130] <!-- C-38 -->
- **B-150** The `SUBSURFACE` factor `lhSss` is `wrap + rim * (0.6 * saturate(NL + 0.4) + back)`. `NL` is `dot(normal, light direction)`. [src/view/materials/chunks.js:124-127] <!-- C-39 -->
- **B-151** Wrap is `saturate((NL + 0.4) / 1.4) - saturate(NL)`. Rim is `pow(1 - saturate(dot(normal, view)), 3)`. Back is `pow(saturate(dot(view, -light)), 4)`. [src/view/materials/chunks.js:121-126] <!-- C-39 -->
- **B-152** `uSubColor` tints the scattered light and multiplies the albedo, so white keeps the hue of the surface. [src/view/materials/chunks.js:115; src/view/materials/chunks.js:128] <!-- C-40 -->
- **B-153** The `WIND` vertex stage takes the root position from the model matrix, times the instance matrix when `USE_INSTANCING` is set. [src/view/materials/chunks.js:138-142] <!-- C-41 -->
- **B-154** The `WIND` vertex stage scales the vertex by `1 - smoothstep(uWindFade.x, uWindFade.y, camera distance in the xz plane)`. The vertex stage does this only when `uWindFade.y > uWindFade.x`. [src/view/materials/chunks.js:133-134; src/view/materials/chunks.js:143] <!-- C-41 -->
- **B-155** `WIND` sways a vertex by the square of its height. It adds `sin(uLhTime * 1.7 + ph) * uWindAmp.x * h^2` to x and `sin(uLhTime * 1.1 + ph * 1.3) * uWindAmp.y * h^2` to z. [src/view/materials/chunks.js:133; src/view/materials/chunks.js:145-146] <!-- C-42 -->
- **B-156** In that formula `ph` is `root.x * 0.37 + root.z * 0.23`. The value `h` is the vertex y. [src/view/materials/chunks.js:144] <!-- C-42 -->
- **B-157** Unless `FLAT_SHADED` is set, the `WIND` fragment stage sets the normal to `normalize(vNormal)` with no back-face flip. Double-sided blades then have no black undersides. [src/view/materials/chunks.js:134-135; src/view/materials/chunks.js:147-149] <!-- C-43 -->
- **B-158** `PAINT` reads the attribute `lhPaint`: model-space xyz and a brightness `w`. The shade factor is `k = min(uPaintShade.z, uPaintShade.x + uPaintShade.y * w)`. The vertex stage works it out per vertex. [src/view/materials/chunks.js:152-155; src/view/materials/chunks.js:161-164] <!-- C-44 -->
- **B-159** When `USE_INSTANCING_COLOR` is set, `PAINT` multiplies the vertex value `vLhPaint` by `instanceColor.rgb`. [src/view/materials/chunks.js:165-167] <!-- C-45 -->
- **B-160** When `uPaintMode.x` is above 1.5 (mode 2), `PAINT` sets `vLhPaint` to a hue ramp. The ramp is `hsl(fract(dot(xyz, axis.xyz) + axis.w), uPaintMode.y, uPaintMode.z)` times `k`. [src/view/materials/chunks.js:153-155; src/view/materials/chunks.js:168] <!-- C-46 -->
- **B-161** In the `PAINT` fragment stage, mode 2 sets the diffuse colour to `vLhPaint`. Mode 1 (x above 0.5) sets it to diffuse times `vLhPaint`. Mode 0 keeps the vertex colours. [src/view/materials/chunks.js:153-154; src/view/materials/chunks.js:170-171] <!-- C-47 -->
- **B-162** `DEPTH_FEATURES` is the frozen list `FUR` and `WIND`. These features move vertices, so they must move them in the shadow pass too. [src/view/materials/chunks.js:177-179] <!-- C-48 -->
- **B-163** `patchDepth` patches only the vertex stage, and only for the features of `DEPTH_FEATURES` that the list holds. Each patch runs against a stand-in fragment shader that has every fragment chunk tag. [src/view/materials/chunks.js:177-187] <!-- C-49 -->

### Fur geometry
- **B-164** `furGeometry` returns a geometry with `shells + 1` copies of every attribute (copy 0 is the mesh) and one index buffer. Copy c has its indices offset by c times the vertex count. [src/view/materials/fur.js:1-3; src/view/materials/fur.js:20-27; src/view/materials/fur.js:38; test/compiler-fur.test.mjs:7] <!-- C-94 -->
- **B-165** `furGeometry` reads interleaved attributes (from meshopt GLBs) into plain `Float32Array` copies. A non-indexed geometry gets a generated index 0..n-1. [src/view/materials/fur.js:7-12; src/view/materials/fur.js:21; test/compiler-fur.test.mjs:28] <!-- C-95 -->
- **B-166** `furGeometry` adds the attribute `furNormal`. Each value is the normalised sum of the normals of all vertices that share a position. The position key has 4 decimals. The shells stay closed across hard edges. [src/view/materials/fur.js:22-24; src/view/materials/fur.js:29-31; src/view/materials/fur.js:34; test/compiler-fur.test.mjs:21] <!-- C-96 -->
- **B-167** `furGeometry` adds the attribute `furMask`. Each value is `Number(mask(i))` clamped to 0..1, and 0 when the number is not valid. [src/view/materials/fur.js:32; src/view/materials/fur.js:35; test/compiler-fur.test.mjs:21] <!-- C-97 -->
- **B-168** `furGeometry` adds the attribute `furShell`. Copy c has the value `c / shells`, so the values step 0, 1/shells, up to 1. [src/view/materials/fur.js:36-37; test/compiler-fur.test.mjs:7] <!-- C-98 -->
- **B-169** `furGeometry` adds two groups. Group 0 covers the mesh itself with material index 0. Group 1 covers all shells with material index 1. [src/view/materials/fur.js:40-41; test/compiler-fur.test.mjs:7] <!-- C-99 -->
- **B-170** `furGeometry` sets `userData.fur = { shells }`. [src/view/materials/fur.js:42] <!-- C-99 -->

### GPU hygiene
- **B-171** three.js draws all shadow casters with one shared depth material. Plain and instanced casters then switch its program each frame, which makes garbage and a GC pause on an iPad. [src/view/render/hygiene.js:5-8] <!-- C-100 -->
- **B-172** `INSTANCED_DEPTH` is a `MeshDepthMaterial` named `lh.instancedDepth` with `userData.lhShared` true. [src/view/render/hygiene.js:9-10] <!-- C-100 -->
- **B-173** `instancedShadows(root)` sets `customDepthMaterial = INSTANCED_DEPTH` on each `InstancedMesh` that has `castShadow` and has no `customDepthMaterial`. It changes nothing else and returns `root`. [src/view/render/hygiene.js:12-15; test/render-hygiene.test.mjs:15; test/render-hygiene.test.mjs:103] <!-- C-101 -->
- **B-174** `WARM_USES` lists the mesh kinds that `warm` can make: `plain`, `mesh`, `instanced`, `instancedColor` and `skinned`. `plain` is another name for `mesh`. [src/view/render/hygiene.js:19] <!-- C-102 -->
- **B-175** `warmMesh` makes a `Mesh` for `mesh` or `plain`, and an `InstancedMesh` of count 1 for `instanced`. For `instancedColor` it adds an instance colour. For `skinned` it makes a `SkinnedMesh` with one bone. [src/view/render/hygiene.js:20-23] <!-- C-103 -->
- **B-176** Each warm mesh uses a 0.01 box geometry marked `lhShared`. The use value defaults to `userData.lhUse` or `'mesh'`. [src/view/render/hygiene.js:17; src/view/render/hygiene.js:20] <!-- C-103 -->
- **B-177** `warm()` accepts each material as a `Material` or as `{ material, use }`. For a `Material` the use is `userData.lhUse`, or `'mesh'` when that is missing. [src/view/render/hygiene.js:52; src/view/render/hygiene.js:55] <!-- C-104 -->
- **B-178** `warm()` puts one warm mesh for each given material on a group named `lh.warm`. It adds the group to the scene during the compile and removes the group afterward. [src/view/render/hygiene.js:58-59; src/view/render/hygiene.js:81; test/render-hygiene.test.mjs:59] <!-- C-105 -->
- **B-179** three.js compiles only visible objects. `warm()` therefore shows each hidden object that is not a light for the synchronous part of the compile. [src/view/render/hygiene.js:48-50; src/view/render/hygiene.js:60; test/render-hygiene.test.mjs:49] <!-- C-106 -->
- **B-180** `warm()` hides these objects again before any frame draws. [src/view/render/hygiene.js:80; test/render-hygiene.test.mjs:49] <!-- C-106 -->
- **B-181** `warm()` leaves hidden lights hidden, because a light count that the frame does not have compiles the wrong program variants. [src/view/render/hygiene.js:50-51; src/view/render/hygiene.js:60; test/render-hygiene.test.mjs:93] <!-- C-107 -->
- **B-182** `warm()` calls `renderer.compileAsync(scene, camera)` when it exists. Otherwise it calls `renderer.compile`. [src/view/render/hygiene.js:61-62] <!-- C-108 -->
- **B-183** When `renderer.shadowMap.enabled` is true and the renderer has `setRenderTarget`, `warm()` also compiles the depth programs of the shadow pass. [src/view/render/hygiene.js:27-31; src/view/render/hygiene.js:64; test/e2e-render.test.mjs:82] <!-- C-109 -->
- **B-184** For that compile `warm()` removes the warm group first and binds a shared 1 by 1 render target. It sets `scene.fog` to null, and restores the target and the fog afterward. [src/view/render/hygiene.js:65-67; src/view/render/hygiene.js:74] <!-- C-109 -->
- **B-185** `warm()` compiles one depth program for each entry of (depth material, mesh kind, side). Each shadow-casting mesh gives its `customDepthMaterial`, or the default depth material, with its kind. [src/view/render/hygiene.js:34-41; src/view/render/hygiene.js:69] <!-- C-110 -->
- **B-186** Each given material gives the default depth material with its use. Each item of the `depth` option gives its own material. [src/view/render/hygiene.js:42-43] <!-- C-110 -->
- **B-187** The side of a depth entry is the `shadowSide` of the source material when it has one. Otherwise it is the opposite of the side of the source for non-VSM shadow maps, and the same side for VSM. [src/view/render/hygiene.js:32; src/view/render/hygiene.js:36; src/view/render/hygiene.js:38] <!-- C-111 -->
- **B-188** `DoubleSide` stays `DoubleSide` in that rule. [src/view/render/hygiene.js:32] <!-- C-111 -->
- **B-189** During each depth compile, `warm()` sets the side of the depth material to the side of the entry and restores it afterward. [src/view/render/hygiene.js:70-72] <!-- C-112 -->
- **B-190** `warm()` returns a promise that resolves to undefined when all compiles end. `warm()` never throws. [src/view/render/hygiene.js:76-84; test/render-hygiene.test.mjs:73] <!-- C-113 -->
- **B-191** When a use is unknown or a compile fails, the promise rejects. In both cases `warm()` hides the objects again and removes the warm meshes. [src/view/render/hygiene.js:77-83; test/render-hygiene.test.mjs:73] <!-- C-113 -->
- **B-192** After `warm()`, the warm meshes release their instance buffers (`InstancedMesh.dispose`) and skeletons (`Skeleton.dispose`). [src/view/render/hygiene.js:46; src/view/render/hygiene.js:81-82] <!-- C-114 -->
- **B-193** `disposeTree(root, { keepShared })` disposes the geometries, materials, textures, instanced attributes and skeletons of a tree. It disposes each resource once. [src/view/render/hygiene.js:87-119; test/render-hygiene.test.mjs:26] <!-- C-115 -->
- **B-194** `disposeTree` returns the number of resources it disposed. The number does not count `InstancedMesh.dispose()` calls. [src/view/render/hygiene.js:100-102; src/view/render/hygiene.js:118] <!-- C-115 -->
- **B-195** `disposeTree` keeps each resource that has `userData.lhShared === true`. It also keeps each resource for which the `keepShared` predicate returns true. A kept material keeps its textures. [src/view/render/hygiene.js:88-91; src/view/render/hygiene.js:101; src/view/render/hygiene.js:105] <!-- C-116 -->
- **B-196** `keepShared` of true, null or undefined means the `lhShared` rule only. A function is a predicate. An object with a `.has` function is a Set-like. Another value throws. [src/view/render/hygiene.js:90-91; src/view/render/hygiene.js:93-98; test/render-hygiene.test.mjs:43; test/render-hygiene.test.mjs:85] <!-- C-117 -->
- **B-197** For a material that it disposes, `disposeTree` first disposes each texture in a property of the material. It also disposes each texture that a uniform holds and each texture in `material.userData.textures`. [src/view/render/hygiene.js:103-110] <!-- C-118 -->
- **B-198** `disposeTree` visits each object of the tree. It handles the geometry, the material or each material of an array, `customDepthMaterial` and `customDistanceMaterial`. It also handles the skeleton of a `SkinnedMesh` and the instance buffers of an `InstancedMesh`. [src/view/render/hygiene.js:111-117] <!-- C-119 -->
- **B-199** `disposeTree` calls `InstancedMesh.dispose()` on each `InstancedMesh`, also when it keeps the geometry and the material. [src/view/render/hygiene.js:115] <!-- C-120 -->
- **B-200** `programCount(renderer)` returns the length of `renderer.info.programs`, or 0 when the list is missing. [src/view/render/hygiene.js:121; test/render-hygiene.test.mjs:82] <!-- C-121 -->

### Object snapshot
- **B-201** `alphaBounds` returns the box of pixels whose alpha is above `min`, in GPU rows (bottom-up). It sets `empty` to true when no pixel qualifies. [src/view/render/snapshot.js:10-16; test/render-snapshot.test.mjs:9] <!-- C-194 -->
- **B-202** `copyRows` copies GPU rows `y0..y1` and columns `x0..x1` into `dst` top-down, which flips the rows. It returns `dst`. [src/view/render/snapshot.js:17-22; test/render-snapshot.test.mjs:15] <!-- C-195 -->
- **B-203** `snapshot` renders the object alone in a studio scene of its own. The scene has a hemisphere light and a directional light from `STUDIO`. The renderer keeps one studio scene. [src/view/render/snapshot.js:24-34; test/render-snapshot.test.mjs:21] <!-- C-196 -->
- **B-204** The option `lights: false` hides the studio lights. [src/view/render/snapshot.js:51] <!-- C-196 -->
- **B-205** `snapshot` turns the object by `yaw` about the y axis, with a pivot group. `snapshot` does not write the transform of the object. [src/view/render/snapshot.js:3-5; src/view/render/snapshot.js:51; test/render-snapshot.test.mjs:45] <!-- C-197 -->
- **B-206** When no `camera` option is given, `snapshot` frames the object. The bounding sphere fills the narrower field of view. The camera distance is `r / sin(fit) * fill`. [src/view/render/snapshot.js:37-45; src/view/render/snapshot.js:54; test/render-snapshot.test.mjs:45] <!-- C-198 -->
- **B-207** `pitch` raises the camera. A given camera is used as is. A portrait size frames by the horizontal field of view. [src/view/render/snapshot.js:38; src/view/render/snapshot.js:42; src/view/render/snapshot.js:54; test/render-snapshot.test.mjs:45; test/render-snapshot.test.mjs:67] <!-- C-198 -->
- **B-208** A `size` of `[w, h]` gives a `w` by `h` render target, the framing aspect `w / h`, and an output of `w` by `h`. [src/view/render/snapshot.js:48; src/view/render/snapshot.js:55; test/render-snapshot.test.mjs:55] <!-- C-199 -->
- **B-209** `snapshot` renders into a new render target with a transparent clear (`0x000000`, alpha 0) and reads the pixels. [src/view/render/snapshot.js:55-60; test/render-snapshot.test.mjs:21] <!-- C-200 -->
- **B-210** Then `snapshot` restores the previous render target and clear colour and disposes the new target. [src/view/render/snapshot.js:61; test/render-snapshot.test.mjs:21] <!-- C-200 -->
- **B-211** `colorSpace: 'srgb'` sets the colour space of the render target texture to sRGB. The default `'linear'` leaves it as it is. [src/view/render/snapshot.js:5-6; src/view/render/snapshot.js:56] <!-- C-201 -->
- **B-212** After the render, `snapshot` removes the object from the studio and adds it back to its former parent. The index of the object under that parent may change. [src/view/render/snapshot.js:3-5; src/view/render/snapshot.js:62-65; test/render-snapshot.test.mjs:21] <!-- C-202 -->
- **B-213** With `crop: true`, `snapshot` crops the picture to the pixels with alpha above the `alpha` option. When no pixel qualifies, `snapshot` returns `''` and sets `out.w` and `out.h` to 0. [src/view/render/snapshot.js:72-76; test/render-snapshot.test.mjs:33] <!-- C-203 -->
- **B-214** With the `outline` option, `snapshot` stamps the silhouette of the art in `outline.color` (default `#ffffff`) under the art. It stamps 24 times at each of the radii `0.5 * B` and `B`. [src/view/render/snapshot.js:81-88; test/render-snapshot.test.mjs:38] <!-- C-204 -->
- **B-215** In that formula `B` is `outline.px` with the default 11. The picture grows by `B` on each side. [src/view/render/snapshot.js:82-84; test/render-snapshot.test.mjs:38] <!-- C-204 -->
- **B-216** `snapshot` returns the PNG data URL of the picture. It sets `out.w` and `out.h` to the picture size when `out` is given. [src/view/render/snapshot.js:89-90] <!-- C-205 -->

### Tilt-shift
- **B-217** `createTiltShift` makes a half-float scene target with MSAA samples and a depth texture. It also makes two half-float targets for the prefilter and the blur. These two targets have half the size and no depth buffer. [src/view/render/tiltShift.js:72-75; src/view/render/tiltShift.js:87-89; test/render-tiltshift.test.mjs:20] <!-- C-208 -->
- **B-218** `render(scene, camera, focus = P.focus)` computes `k = 1 - smoothstep(focus, fullAt, offAt)`. The effect is full at or below `fullAt` and gone at `offAt`. `focus` is the camera-to-target distance. [src/view/render/tiltShift.js:6-8; src/view/render/tiltShift.js:91-92] <!-- C-209 -->
- **B-219** When the option `on` is false, or `k` is at most 0.001, `render()` makes one plain render to the screen and no extra pass. [src/view/render/tiltShift.js:93; test/render-tiltshift.test.mjs:14] <!-- C-210 -->
- **B-220** Otherwise `render()` draws the scene into the full target. Then it runs the prefilter pass to the half target, the blur pass to the blur target, and the composite pass to the screen. [src/view/render/tiltShift.js:2-8; src/view/render/tiltShift.js:98-99; test/render-tiltshift.test.mjs:20] <!-- C-211 -->
- **B-221** Before each effect render, tilt-shift sets the uniforms `near`, `far` and `focus` from the camera and the argument. It sets `maxR` to `blur * full target height * 0.5 * k`. [src/view/render/tiltShift.js:95-96] <!-- C-212 -->
- **B-222** Tilt-shift also sets `sat` to `1 + (sat - 1) * k` and `vig` to `vig * k`. [src/view/render/tiltShift.js:97] <!-- C-212 -->
- **B-223** The prefilter averages 4 colour samples and packs the signed circle of confusion (CoC) in alpha. [src/view/render/tiltShift.js:12-26] <!-- C-213 -->
- **B-224** The CoC is `sign(d) * clamp((abs(d) - band) * k2, 0, 1)`, where `d = (z - focus) / focus`. The factor `k2` is `nearScale` when `d` is negative, and `scale` otherwise. [src/view/render/tiltShift.js:16-20] <!-- C-213 -->
- **B-225** The blur pass is a gather blur with 40 samples (`N`) on a golden-angle spiral. A sample lands only when its own CoC reaches the centre, so there are no halos. [src/view/render/tiltShift.js:3-5; src/view/render/tiltShift.js:27-47] <!-- C-214 -->
- **B-226** The composite pass is sharp where the CoC is near 0 and blurred elsewhere. It adds saturation and a vignette. [src/view/render/tiltShift.js:5-8; src/view/render/tiltShift.js:48-62] <!-- C-215 -->
- **B-227** The composite pass applies tone mapping before the conversion to the output colour space. Tone mapping has no effect for `toneMapping` `'none'`. [src/view/render/tiltShift.js:63-65; test/render-tiltshift.test.mjs:39] <!-- C-215 -->
- **B-228** `setSize()` reads the drawing buffer size of the renderer. It reallocates the three targets only when that size changed. [src/view/render/tiltShift.js:85-89; test/render-tiltshift.test.mjs:32] <!-- C-216 -->
- **B-229** The half size is the full size shifted right by 1, and at least 1. [src/view/render/tiltShift.js:87; test/render-tiltshift.test.mjs:32] <!-- C-216 -->
- **B-230** The pass materials are `ShaderMaterial`s with `depthTest` and `depthWrite` false. They draw on a full-screen quad with `frustumCulled` false. [src/view/render/tiltShift.js:77; src/view/render/tiltShift.js:81-82] <!-- C-217 -->
- **B-231** Tilt-shift `dispose()` frees the depth texture, the three targets, the three pass materials and the quad geometry. [src/view/render/tiltShift.js:101; test/render-tiltshift.test.mjs:43] <!-- C-218 -->
- **B-232** The `render` of the tilt-shift object has the signature of `gfx.post.render(scene, camera)`, so a game can assign it to `gfx.post`. [src/view/render/renderer.js:72; src/view/render/tiltShift.js:91; test/e2e-render.test.mjs:112] <!-- C-219 -->
- **B-233** With the effect off, tilt-shift as `gfx.post` draws exactly the plain frame with no new programs. [test/e2e-render.test.mjs:112] <!-- C-219 -->
- **B-234** Turning a post pass on compiles one render-target variant of each lit material, so tilt-shift adds 3 or 4 programs. [doc:docs/field-notes.md:797-801; test/e2e-render.test.mjs:112] <!-- C-220 -->
- **B-235** `gfx.warm` never compiles through `gfx.post`. A game that enables a post pass mid-game can warm with the pass on, to avoid one compile per lit material. [doc:docs/field-notes.md:797-801; src/view/render/pipeline.js:74-78] <!-- C-220 -->
- **B-236** A half-float target with 4 samples gives GL error 0 on SwiftShader in the browser test. [test/e2e-render.test.mjs:112; doc:docs/field-notes.md:803-807] <!-- C-239 -->

## Data and state

| Item | Content | Evidence |
| --- | --- | --- |
| Compiler state | A WeakMap from each material to `{ id, o, features, extras, uniforms, coat }`. A cache Map holds shared materials by key. A second Map holds depth twins by material key. | [src/view/materials/compiler.js:32-33; src/view/materials/compiler.js:56; src/view/materials/compiler.js:123; src/view/materials/compiler.js:257] <!-- C-233 --> |
| `lhPaint` attribute | Written once onto the shared template geometry. Clones and repeated `apply()` calls find it there. | [src/view/materials/compiler.js:168-171] <!-- C-234 --> |
| Coat | `{ mode, axis [ax, ay, az, w], s, l, color, key }`. `KEEP` (mode 0, key `keep`) and `SOLID` (mode 1, key `solid`) are frozen coats. | [src/view/materials/compiler.js:18-20] <!-- C-235 --> |
| `gfx.lost` | True between a `webglcontextlost` event and the next `webglcontextrestored` event. | [src/view/render/renderer.js:28-30; src/view/render/renderer.js:67-68] <!-- C-236 --> |
| Renderer registry | A WeakMap from each page to its renderer. `gfx.dispose()` deletes the entry. | [src/view/render/renderer.js:26; src/view/render/renderer.js:39; src/view/render/renderer.js:84] <!-- C-237 --> |

### Feature chunks

| Feature | Vertex chunks | Fragment chunks | Evidence |
| --- | --- | --- | --- |
| `COVERAGE` | `common`, `worldpos_vertex` | `common`, `color_fragment`, `lights_fragment_end` | [src/view/materials/chunks.js:9] <!-- C-18 --> |
| `FUR` | `common`, `begin_vertex` | `common`, `clipping_planes_fragment`, `color_fragment`, `opaque_fragment` | [src/view/materials/chunks.js:10] <!-- C-18 --> |
| `SUBSURFACE` | none | `common`, `lights_fragment_end` | [src/view/materials/chunks.js:11] <!-- C-18 --> |
| `WIND` | `common`, `begin_vertex` | `normal_fragment_begin` | [src/view/materials/chunks.js:12] <!-- C-18 --> |
| `PAINT` | `common`, `begin_vertex` | `common`, `color_fragment` | [src/view/materials/chunks.js:13] <!-- C-18 --> |

## Configuration

### `render` keys of `defineView`

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `shading` | `'physical'` | One of `physical`, `standard`, `lambert`. Chooses the shading tier. | [src/view/render/pipeline.js:17-18; src/view/render/pipeline.js:73] <!-- C-145 C-161 --> |
| `dpr` | `{ touch: 1.5, desktop: 2 }` | A number above 0, or an object with only `touch` and `desktop`. The object has at least one key, and each value is above 0. | [src/view/render/pipeline.js:19; src/view/render/pipeline.js:29-30; src/view/render/renderer.js:9] <!-- C-148 C-171 --> |
| `antialias` | `true` | Passed to the `WebGLRenderer`. | [src/view/render/renderer.js:31; src/view/render/renderer.js:38] <!-- C-176 --> |
| `shadows` | `'pcf'` | `'pcf'`, `'vsm'`, `'basic'` or `false`. | [src/view/render/renderer.js:6; src/view/render/renderer.js:31] <!-- C-169 C-176 --> |
| `toneMapping` | `'none'` | `'none'`, `'aces'`, `'agx'` or `'neutral'`. | [src/view/render/renderer.js:7; src/view/render/renderer.js:31] <!-- C-169 C-176 --> |
| `exposure` | `1` | Sets `toneMappingExposure`. | [src/view/render/renderer.js:31; src/view/render/renderer.js:42] <!-- C-176 --> |
| `camera` | `{ fov: 60, fovPortrait: 64, near: 0.3, far: 500 }` | Accepts only these four keys. | [src/view/render/renderer.js:10; src/view/render/pipeline.js:19; src/view/render/pipeline.js:31] <!-- C-149 C-171 --> |
| `lights` | `{}` | A lights object, or `false` for no rig. | [src/view/render/pipeline.js:44; src/view/render/pipeline.js:72] <!-- C-152 C-160 --> |
| `assets` | none | `{ manifest, base, decoders }`. `manifest` is required. `base` defaults to `./assets/`. | [src/view/render/pipeline.js:19; src/view/render/pipeline.js:32-35; src/view/render/pipeline.js:81] <!-- C-149 C-150 C-163 --> |
| `paint` | `{ base: 'steel', shade: [0.25, 0.85, 1.1] }` | Accepts only `base` and `shade`. | [src/view/render/pipeline.js:19; src/view/materials/compiler.js:16; src/view/materials/compiler.js:51] <!-- C-1 C-149 --> |

### Other constants

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `PORTRAIT_BELOW` | `0.9` | Aspect below this value uses the portrait FOV. | [src/view/render/renderer.js:8] <!-- C-171 --> |
| `createRenderer` options | `dpr = DEFAULT_DPR`, `antialias = true`, `shadows = 'pcf'`, `toneMapping = 'none'`, `exposure = 1`, `camera = {}`, `renderer = null`, `onLost = null`, `onRestored = null` | Options of the renderer. | [src/view/render/renderer.js:31; test/render-renderer.test.mjs:46] <!-- C-176 --> |
| `LIGHT_DEFAULTS` | `sky '#bfe6f5'`, `hemiSky '#eef7ff'`, `ground '#b9a27c'`, `hemi 1.3`, `fog [90, 220]` | Base look of the light rig. | [src/view/render/lights.js:8-12] <!-- C-122 --> |
| `LIGHT_DEFAULTS.sun` | `color '#fff3dc'`, `intensity 2.1`, `map 2048`, `box 30`, `offset [-26, 46, 22]`, `near 5`, `far 120`, `bias -0.0006`, `normalBias 0.03` | Base look of the sun. | [src/view/render/lights.js:10] <!-- C-123 --> |
| `DEFAULT_PRESETS.dusk` | `sky '#f4a76b'`, `hemi 0.8`, sun `color '#ffa860'`, sun `intensity 1.125` | Default `dusk` light preset. | [src/view/render/lights.js:14] <!-- C-124 --> |
| `DEFAULT_PRESETS.night` | `sky '#1b2440'`, `hemi 0.3`, sun `color '#9fb4ff'`, sun `intensity 0.15` | Default `night` light preset. | [src/view/render/lights.js:15] <!-- C-124 --> |
| `lights` top-level keys | `sky`, `hemiSky`, `ground`, `hemi`, `sun`, `fog`, `presets` | The only keys that `checkLights` accepts. The `sun` block accepts `color`, `intensity`, `map`, `box`, `offset`, `near`, `far`, `bias` and `normalBias`. | [src/view/render/lights.js:18-19] <!-- C-126 --> |
| Light preset keys | `sky`, `hemiSky`, `ground`, `hemi`, `sun`, `fog` | A light preset `sun` accepts only `color`, `intensity` and `offset`. | [src/view/render/lights.js:20-21; src/view/render/lights.js:30-32] <!-- C-127 --> |
| `SHADOWS`, `TONE` | `pcf`, `vsm`, `basic`. `none`, `aces`, `agx`, `neutral`. | Names that map to the three.js shadow map types and tone mapping types. | [src/view/render/renderer.js:6-7] <!-- C-169 --> |
| `STUDIO` | `sky '#ffffff'`, `ground '#b9a27c'`, `hemi 2.2`, `sun 1.6`, `sunAt [2, 5, 4]` | Light of the object snapshot studio. | [src/view/render/snapshot.js:8] <!-- C-191 --> |
| `snapshot` options | `size 256`, `camera null`, `yaw 0`, `pitch 0.22`, `fov 28`, `fill 1.02`, `lights true`, `crop false`, `outline null`, `alpha 8`, `colorSpace 'linear'`, `out null` | Options of `snapshot`. | [src/view/render/snapshot.js:47] <!-- C-192 --> |
| `TILT_DEFAULTS` | `on true`, `band 0.06`, `scale 3.2`, `nearScale 1.6`, `blur 0.011`, `sat 1.05`, `vig 0.2`, `fullAt 10`, `offAt 24`, `focus 10`, `samples 4` | Options of `createTiltShift`. | [src/view/render/tiltShift.js:68] <!-- C-206 --> |

## Errors and limits

| Source | Condition | Error message | Evidence |
| --- | --- | --- | --- |
| `createMaterialCompiler` | Tier is not `physical`, `standard` or `lambert` | `compiler: shading must be 'physical' \| 'standard' \| 'lambert' (got ...)` | [src/view/materials/compiler.js:52; test/compiler.test.mjs:19] <!-- C-221 --> |
| `createMaterialCompiler` | Registry has no `get` function or no `has` function | `compiler: needs a material registry from defineMaterials` | [src/view/materials/compiler.js:53] <!-- C-221 --> |
| `createMaterialCompiler` | Paint base is not in the registry | `compiler: paint base '<id>' is not in the registry` | [src/view/materials/compiler.js:54; test/compiler.test.mjs:19] <!-- C-222 --> |
| `createMaterialCompiler` | Shade is not an array of 3 finite numbers | `compiler: paint.shade must be [floor, gain, max] numbers (got ...)` | [src/view/materials/compiler.js:55] <!-- C-222 --> |
| `inject` | Chunk tag is missing from the shader | `materials: three.js r<REVISION> has no '#include <chunk>' in this shader; update src/view/materials/chunks.js` | [src/view/materials/chunks.js:18; test/compiler-chunks.test.mjs:17; test/compiler-chunks.test.mjs:27] <!-- C-223 --> |
| `coatOf` | Paint value is not a colour and not a valid hue object | `compiler: a paint value is a colour or { hue: { axis: [x, y, z], from, to (from ≠ to), s, l } } (got ...)` | [src/view/materials/compiler.js:29; test/compiler-paint.test.mjs:128] <!-- C-224 --> |
| `coverage()` | Material has no `COVERAGE` feature or is not from the compiler | `compiler: coverage() needs a compiled material whose registry entry has a coverage block (got ...)` | [src/view/materials/compiler.js:151-152; test/compiler-apply.test.mjs:30] <!-- C-225 --> |
| `extend()` | Material is not from the compiler or its `lhShared` is false | `compiler: extend() needs a shared material from this compiler (got ...); extend first, then take coverage()` | [src/view/materials/compiler.js:161-162] <!-- C-226 --> |
| `extend()` | Name does not match `[A-Za-z0-9_-]` or patch is not a function | `compiler: extend(material, name, patch) needs a name of [A-Za-z0-9_-] and a patch(shader, inject) function (got ...)` | [src/view/materials/compiler.js:163] <!-- C-226 --> |
| `apply()` | Hue value and the mesh lacks vertex colours or `lhPaint` | `compiler: a hue paint needs vertex colours (mesh <name>, <material>)` | [src/view/materials/compiler.js:213; test/compiler-apply.test.mjs:70] <!-- C-227 --> |
| `apply()` | Material name is not a registry id and not `paint-<slot>` | `compiler: mesh <name> uses material <name>, which is neither a registry id nor paint-<slot>` | [src/view/materials/compiler.js:216; test/compiler-apply.test.mjs:70] <!-- C-227 --> |
| `repaint()` | Paint slot material is not from the compiler | `compiler: repaint() needs a tree compiled by apply() ...` | [src/view/materials/compiler.js:239; test/compiler-paint.test.mjs:128] <!-- C-228 --> |
| `repaint()` | Hue value on a material without `PAINT` | The hue error of `apply()` | [src/view/materials/compiler.js:242] <!-- C-228 --> |
| `depth()` | Material is not from the compiler | `compiler: depth() needs a material from this compiler (got ...)` | [src/view/materials/compiler.js:259-260] <!-- C-229 --> |
| `furGeometry` | `shells` is not an integer 1..32 | `furGeometry: shells must be an integer 1..32 (got ...)` | [src/view/materials/fur.js:16; test/compiler-fur.test.mjs:28] <!-- C-230 --> |
| `furGeometry` | `mask` is not a function | `furGeometry: mask(i) must be a function returning 0..1 per vertex` | [src/view/materials/fur.js:17] <!-- C-230 --> |
| `furGeometry` | Geometry lacks `position` or `normal` | `furGeometry: the geometry needs position and normal attributes` | [src/view/materials/fur.js:19] <!-- C-230 --> |
| `warm()` | Unknown `lhUse` (the promise rejects) | `warm: material '<name>' has userData.lhUse '<use>' (known: ...)` | [src/view/render/hygiene.js:24; test/render-hygiene.test.mjs:73] <!-- C-231 --> |
| `disposeTree` | `keepShared` is not true, null, undefined, a function or an object with `.has` | `disposeTree: keepShared must be true, a Set or a predicate (got ...)` | [src/view/render/hygiene.js:95-96; test/render-hygiene.test.mjs:85] <!-- C-232 --> |
| `checkLights` | `opts` is falsy or not an object | `lights: options must be an object` | [src/view/render/lights.js:25] <!-- C-125 --> |
| `checkLights` | Unknown key in `opts`, `opts.sun`, a light preset or a light preset `sun` | `lights: <where><key> is unknown`. For a light preset `sun`, the message ends with ` (presets change colours, intensities, the sun offset and fog distances only)`. The `<where>` value there is `preset '<name>'.sun.`. | [src/view/render/lights.js:22; src/view/render/lights.js:26-27] <!-- C-125 --> |
| `checkLights` | `fog` is not undefined, false or an array of 2 items | `lights: fog must be [near, far] or false (got ...)` | [src/view/render/lights.js:28] <!-- C-128 --> |
| `checkLights` | A light preset `sun` is not an object | `lights: preset '<name>'.sun must be { color, intensity, offset } (got ...)` | [src/view/render/lights.js:31] <!-- C-129 --> |
| `checkLights` | A light preset has `fog` and `lights.fog` is false | `lights: preset '<name>'.fog needs lights.fog (fog on or off changes shaders)` | [src/view/render/lights.js:33; test/render-lights.test.mjs:78] <!-- C-129 --> |
| rig `set()` | Value is not a string or a number, or is NaN | `lights: set takes a preset name or k in [0, 1] (got ...)` | [src/view/render/lights.js:94] <!-- C-141 --> |
| rig `set()` and `lerp()` | Name is not a light preset | `lights: unknown preset '<name>' (known: ...)` | [src/view/render/lights.js:67-68] <!-- C-141 --> |
| `checkRender` | `render` is not an object | `defineView: render must be an object` | [src/view/render/pipeline.js:24; test/render-pipeline.test.mjs:89] <!-- C-146 --> |
| `checkRender` | Unknown key in `render` or a nested block | `defineView: render.<where><key> is unknown (known: ...)` | [src/view/render/pipeline.js:20; test/render-pipeline.test.mjs:89] <!-- C-146 --> |
| `checkRender` | `shading` is not in `SHADING`, or `shadows` or `toneMapping` is invalid | A `defineView` or `render:` error with the field name | [src/view/render/pipeline.js:26-28] <!-- C-147 --> |
| `checkRender` | `assets` is not an object, or `assets.manifest` is missing | `defineView: render.assets must be { manifest, base, decoders? }`. `defineView: render.assets.manifest is required (the baked manifest.json)` | [src/view/render/pipeline.js:32-35] <!-- C-150 --> |
| `checkRender` | `paint` is not a plain object, `paint.base` is not a non-empty string, or `paint.shade` is not an array of 3 finite numbers | `defineView: render.paint ...` | [src/view/render/pipeline.js:37-43] <!-- C-151 --> |
| `checkShadows` | Value is not `'pcf'`, `'vsm'`, `'basic'` or false | `render: shadows must be 'pcf' \| 'vsm' \| 'basic' \| false (got ...)` | [src/view/render/renderer.js:11-12; test/render-renderer.test.mjs:52] <!-- C-170 --> |
| `checkToneMapping` | Value is not `'none'`, `'aces'`, `'agx'` or `'neutral'` | `render: toneMapping must be 'none' \| 'aces' \| 'agx' \| 'neutral' (got ...)` | [src/view/render/renderer.js:11; src/view/render/renderer.js:13; test/render-renderer.test.mjs:52] <!-- C-170 --> |
| `createRenderer` | No canvas and no renderer | `render: createRenderer needs { canvas }` | [src/view/render/renderer.js:33-34] <!-- C-177 --> |
| `createRenderer` | The page already has a renderer | `render: this page already has a renderer (one WebGLRenderer per page); dispose the first one` | [src/view/render/renderer.js:26; src/view/render/renderer.js:35-36; src/view/render/renderer.js:84; test/render-renderer.test.mjs:64] <!-- C-178 --> |
| `createPipeline` | No canvas from the option, the renderer or the page | An Error that begins `boot: defineView({ render }) needs a canvas` | [src/view/render/pipeline.js:48-49; test/render-pipeline.test.mjs:76] <!-- C-154 --> |
| `snapshot` | `size` is not a positive integer or a 2-item array of positive integers | `snapshot: size must be a positive integer or [w, h] of positive integers (got ...)` | [src/view/render/snapshot.js:36; src/view/render/snapshot.js:48-49; test/render-snapshot.test.mjs:67] <!-- C-193 --> |
| `createTiltShift` | Option key is not in `TILT_DEFAULTS` | `tiltShift: <key> is unknown (known: ...)` | [src/view/render/tiltShift.js:71; test/render-tiltshift.test.mjs:10] <!-- C-207 --> |

- **Pipeline build failure.** When a build step throws, the pipeline disposes the assets, the compiler, the light rig, `gfx` and the audio, each with its own error guard. It sets `view.gfx`, `view.materials`, `view.assets` and `view.sync` to null, and sets `engine.assets` to undefined. It throws the original error. `gfx.dispose()` frees the page for a retry. [src/view/render/pipeline.js:65-70; src/view/render/pipeline.js:84; test/render-pipeline.test.mjs:111] <!-- C-165 -->
- **Pipeline dispose failure.** If a dispose step throws, the pipeline still runs the other steps. After all steps, the pipeline throws the first error. [src/view/render/pipeline.js:92-96; test/render-pipeline.test.mjs:120] <!-- C-168 -->
- **Limits.** `furGeometry` accepts 1 to 32 shells. A page has at most one renderer. [src/view/materials/fur.js:16; src/view/render/renderer.js:35-36] <!-- C-230 C-178 -->

## Dependencies
- **Internal:** the material registry from `defineMaterials` and its `look` and `coverage` blocks, in the [defs-and-kits spec](defs-and-kits.md). [src/view/materials/compiler.js:8] <!-- C-1 -->
- **Internal:** `createAssets`, `createViewSync` and `createAudio`, which `createPipeline` builds. See the [view-presentation spec](view-presentation.md). [src/view/render/pipeline.js:12-14; src/view/render/pipeline.js:81-83] <!-- C-163 C-164 -->
- **External:** three.js. `chunks.js` names r186 in its comments and reads `REVISION` for its error message. [src/view/materials/chunks.js:1-5; src/view/materials/chunks.js:18] <!-- C-223 -->

<!-- related-specs -->
Related specs:

- Imports: [Definitions and kits](defs-and-kits.md)
- Imports: [View sync, camera, assets and audio](view-presentation.md)
- Imported by: [View boot, input and seats](view-input.md)
- Imported by: [View sync, camera, assets and audio](view-presentation.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Open questions and discrepancies
- **Open question.** The default `uSubStrength` of 0.5 in `uniformsFor` cannot apply, because `SUBSURFACE` needs `look.subsurface.strength` above 0. No source states the reason for the default. [src/view/materials/compiler.js:68; src/view/materials/compiler.js:87]
- **Open question.** `createPipeline` does not call `gfx.warm()` at boot. Only a restored context calls it in this feature. No source states where the first call comes from. [src/view/render/pipeline.js:55; src/view/render/pipeline.js:74]

## Evidence index
- `src/view/materials/compiler.js`: the material compiler.
- `src/view/materials/chunks.js`: shader features and chunk patches.
- `src/view/materials/fur.js`: shell fur geometry.
- `src/view/render/pipeline.js`: `checkRender` and `createPipeline`.
- `src/view/render/renderer.js`: `createRenderer` and `fitView`.
- `src/view/render/lights.js`: the light rig.
- `src/view/render/hygiene.js`: `warm`, `instancedShadows`, `disposeTree` and `programCount`.
- `src/view/render/snapshot.js`: the object snapshot.
- `src/view/render/tiltShift.js`: the tilt-shift post pass.
