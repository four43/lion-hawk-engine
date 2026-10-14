# Phase 3e: renderer, light rig, GPU hygiene, snapshot, tilt-shift and boot's render pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `defineView({ scenes, render })` makes `boot` build one renderer per page, with a scene, a camera, a light rig, the compiler, assets, view sync and audio. Each render slot runs `reconcile → sync.frame(alpha) → halves' frame → gfx.render()`. The engine also gains:
- the GPU hygiene helpers `warm`, `instancedShadows`, `disposeTree` and `programCount`;
- a thumbnail `snapshot`;
- an optional tilt-shift post pass.

These replace the three games' renderer bootstraps, light rigs and Tractor Pickup's `warm`/`shadows`/`dispose` files and its three thumbnail copies.

**Architecture:**
- New view-only modules under `src/view/render/`:
  - `renderer.js`: renderer, DPR, shadows, tone mapping and resize.
  - `lights.js`: hemisphere light, following sun, fog and presets.
  - `hygiene.js`
  - `snapshot.js`
  - `tiltShift.js`
  - `pipeline.js`: what `boot` builds and draws.
- `boot.js` changes in three places: it calls `createPipeline` when `render` is declared, adds two slots in its render callback, and disposes the pipeline. Without `render`, boot is exactly 0.7.
- Inert stubs stand in for 3f/3g until they merge: `assets/index.js`, `sync/index.js`, `audio/index.js` and `materials/compiler.js`.
- Engine view modules import `three` directly (D9).
- Unit tests run in Node with a fake renderer (Node has no WebGL). One browser suite checks real pixels, DPR, resize, warm, snapshot, tilt-shift and the no-WebGL path under SwiftShader.

**Tech Stack:** three 0.186 (peer/dev), happy-dom (unit DOM), esbuild + `lion-hawk/playwright` (browser suite), `node:test`.

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md`. Requirements:
- M-12 (`warm`);
- M-13, through the instanced depth material here and the compiler's cache key in 3f;
- S-3 (GPU resources freed with `disposeTree`);
- R-8 (no per-frame allocation);
- A-10, the warm seam for `assets.preload`;
- design §6.6.

Interface: overview §4.6, plus the stub surfaces of §4.7, §4.8 and §4.9.

**Worktree:** `~/projects/four43/lion-hawk-engine-3e` on branch `phase-3-render`. It is cut from `phase-3` **after 3a merges**, so `boot.js` already has 3a's #105 change: `enter(engine, view, args)`. Every path below is relative to that worktree.

---

## Global Constraints

```
GLOBAL CONSTRAINTS (phase 3)
1. Sim purity (L-3, T-12): files under src/core, src/defs, src/sim, src/kits/*/sim.js and every game's
   sim tree never import three, three/addons, @dimforge/rapier3d-compat, DOM globals, Date.now, performance.now,
   new Date or Math.random. Rapier is injected (defineGame({ physics: { rapier } })). testing/purity.js
   enforces it; add new sim roots to the purity test, never allowlist a new line without the integrator.
2. Determinism: sim results depend only on seed, steps, input, commands (with their at stamps) and
   engine.time.wall. No wall-clock reads in sim code; timing diagnostics come through the injected timer and
   never enter state() or checksums. Every new sim feature gets a checks.determinism test and a headless replay.
3. Allocation (R-8, T-13): nothing allocated per step or per frame in engine code: reuse out-params and pools;
   allocate at spawn/create only. Rapier's own per-call vector objects are tolerated; retained growth is not.
4. View code: never instanceof on three.js objects (use .isMesh etc.); a second three copy may exist in Node tests.
   Engine view modules may import three directly; game builds go through `lion-hawk build` (dedupe).
5. Memory-safe tests. Unit and workspace suites:
     systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
       -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files|dir>
   Browser suites (engine e2e, game test:e2e, Rally test:mobile), ONE AT A TIME ACROSS ALL AGENTS:
     flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G \
       -p MemorySwapMax=0 -p RuntimeMaxSec=900 -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>
   Never raise the caps; never run node --test without --test-concurrency=4.
6. Never assert.equal / deepEqual a DOM node (#103): compare with same() from test/helpers/dom.mjs.
7. Commits: conventional style, no Co-Authored-By or any Claude attribution line.
8. four43: never write, modify, restore or delete anything under site/ (including site/exp/). Builds go only to a
   scratchpad: `lion-hawk build --out $SCRATCH/<game>` or the game's *_OUT env var. Never pass --site.
9. Stay inside your plan's file ownership (overview §5.2). Integrator-only files: src/index.*.js, testing/index.js,
   src/version.js, package.json, package-lock.json, CHANGELOG.md, docs/spec.md, docs/field-notes.md, the overview.
   Ask the integrator for anything else.
10. The contract in the overview §4 is fixed. If reality disagrees, stop and write the mismatch in your notes file
    for the integrator; do not change a signature on your own.
11. Goldens: re-bless only under overview §5.5, with the reason and metrics in your notes.
```

**3e's own constraints:**

12. **Imports.**
    - Tests import the new modules by file path (`../src/view/render/*.js`), never through `src/index.view.js`. That file is the integrator's (Integrator request 1).
    - Nothing under `src/core`, `src/sim` or `src/defs` changes. 3e only reads them (the pipeline test calls `createEngine`).
13. **Hot paths.** These are per-frame and allocate nothing:
    - `gfx.render`
    - `gfx.info`
    - the light rig's `follow`, `lerp` and `set`
    - the tilt-shift `render`
    - the pipeline's `frame` and `draw`
    - boot's render callback additions (a `try` block, not a closure).

    Each has a test that scans its source (`fn.toString()`) for `new `, `.clone(`, `...`, `.slice(`, `.map(`, `.concat(` and `Array.from`. Error paths use `throw Error(...)` without `new`.
14. **No three.js objects in assertions.** Never pass a three.js object to `assert.equal`/`deepEqual`. A failure would print the whole graph. Compare identity with `assert.ok(a === b, msg)`.
15. **Stubs.**
    - Stub files carry `// STUB (3e)` on line 1.
    - 3f and 3g replace them wholesale. At the Wave B merge the owner's file wins.
    - 3e never adds behaviour to a stub beyond the inert surface.
16. **Parity.**
    - Tractor Pickup's numbers stay the defaults: lights, shadow box and bedtime presets.
    - Pig Pens' tilt-shift numbers stay its defaults.
    - The three source files are cited in each module's header comment.

---

## Review Focus

| # | Input or failure mode | Pinned by |
|---|---|---|
| RF1 | **No WebGL** (old iPad, blocked context, happy-dom). `new WebGLRenderer` throws inside `boot`. The page must keep running: the sim, the UI and audio still work, the error is reported once as `render: …`, and the halves see `view.gfx === null`. | Task 7, test "a renderer that cannot start is reported…"; Task 8, test "no WebGL: boot reports…"; Task 9, browser test "no WebGL". |
| RF2 | **The DPR cap and portrait boundaries.** `maxTouchPoints` of 1 (a desktop touch screen) vs 5 (iPad). Aspect exactly 0.9. A canvas with no layout yet (clientWidth 0). Rotation through the resize listener. | Task 2 (`fitView` tables, resize listener test, mutation proof); Task 9 browser tests (forced touch, rotation). |
| RF3 | **Look presets that change shaders.** A preset that toggles fog, shadows or map size would recompile programs mid-game: the iPad stutter X-4. Tractor's `setNight(k)` must stay bit-for-bit (within 1e-12). | Task 3, tests "set(k) reproduces Tractor setNight…" and "a preset change touches no shader-affecting state"; validation test. |
| RF4 | **`disposeTree` freeing shared GPU resources.** Asset geometries, compiler materials, the module-level instanced depth material and a kept material's textures must survive. Everything else is freed exactly once. | Task 4, tests "disposeTree frees each … once, and keeps what is shared" and "keepShared may be a predicate"; mutation proof. |
| RF5 | **`snapshot` leaving traces.** The previous render target, the clear colour and alpha, and the object's parent and own transform must all be restored. GPU rows come bottom-up. | Task 5 (fake renderer: state restore, parent, yaw/pitch framing; `copyRows` orientation, with mutation proof); Task 10 browser test "snapshot". |

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/view/render/renderer.js` | Create | `fitView` (the pure DPR/FOV rule) and `createRenderer`: one per page, shadows, tone mapping, resize listener and `ResizeObserver`, `render` (through `post`), `info`, `dispose`. Also `checkShadows`/`checkToneMapping`. |
| `src/view/render/lights.js` | Create | `createLightRig` (hemisphere light, sun with a following shadow box, fog in the sky colour, presets, `set`/`lerp`/`follow`/`dispose`) and `checkLights`. Tractor's defaults; dusk/night reproduce `setNight`. |
| `src/view/render/hygiene.js` | Create | `warm` (hidden objects plus a warm group of given materials), `instancedShadows` with `INSTANCED_DEPTH`, `disposeTree` (shared-aware, once each), `programCount`. |
| `src/view/render/snapshot.js` | Create | `snapshot` to a PNG data URL: studio lights, auto-framing, crop, outline, state restore. Also the pure `alphaBounds` and `copyRows`. |
| `src/view/render/tiltShift.js` | Create | `createTiltShift`: Pig Pens' pass, generic, plus tone mapping, `focus` and `dispose`. |
| `src/view/render/pipeline.js` | Create | `checkRender` (defineView validation) and `createPipeline` (builds the gfx and services, `frame`, `draw`, `dispose`; the no-WebGL path). |
| `src/view/boot.js` | Modify | `defineView` accepts and validates `render`. `boot` takes `{ canvas, timer, renderer }`, passes `timer` to `createEngine`, builds the pipeline before any half enters, adds the two render slots and disposes the pipeline. |
| `src/view/assets/index.js` | Create (stub) | Inert `createAssets` with the §4.7 surface (3f replaces it). |
| `src/view/sync/index.js` | Create (stub) | Inert `createViewSync` with the §4.9 surface plus `dispose` (3g replaces it). |
| `src/view/audio/index.js` | Create (stub) | Inert `createAudio` with the §4.9 audio surface (3g replaces it). |
| `src/view/materials/compiler.js` | Create (stub) | Inert `createMaterialCompiler` with the §4.8 surface plus `made()`. 3f replaces it. **Contract issue 1.** |
| `test/helpers/fakeRenderer.mjs` | Create | A WebGLRenderer stand-in for Node tests. |
| `test/helpers/fakeCanvas.mjs` | Create | A document whose canvases record 2D calls (for snapshot in Node). |
| `test/render-stubs.test.mjs` | Create | Stub surfaces. |
| `test/render-renderer.test.mjs` | Create | `fitView`, `createRenderer`. |
| `test/render-lights.test.mjs` | Create | Light rig. |
| `test/render-hygiene.test.mjs` | Create | `warm`, `instancedShadows`, `disposeTree`, `programCount`. |
| `test/render-snapshot.test.mjs` | Create | `alphaBounds`, `copyRows`, `snapshot` against fakes. |
| `test/render-tiltshift.test.mjs` | Create | Tilt-shift passes against the fake. |
| `test/render-pipeline.test.mjs` | Create | `checkRender`, `createPipeline` (happy-dom plus the fake; the no-WebGL path with the real three). |
| `test/render-boot.test.mjs` | Create | Boot wiring: 0.7 behaviour without `render`, slot order, errors, dispose, no WebGL. |
| `test/render-fixtures/render.html`, `test/render-fixtures/render.view.js` | Create | The browser fixture: the countdown game with `render` declared, and the `window.__fx` hooks. |
| `test/e2e-render.test.mjs` | Create | Browser suite (SwiftShader). |
| `docs/plans/2026-10-13-phase-3e-render-notes.md` | Create | Notes, contract issues, field note candidates. |

Not touched: `src/core/**`, `src/sim/**`, `src/defs/**`, `src/index.*.js`, `testing/**`, `package.json`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`.

---

## Test commands

The worktree is `W=/home/smiller/projects/four43/lion-hawk-engine-3e`. Every run below is written out in full.

- **Unit runs:** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
- **Browser runs:** `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 <file>`

---

## Task 1: Inert stubs for assets, sync, audio and the material compiler

**Files:**
- Create: `src/view/assets/index.js`, `src/view/sync/index.js`, `src/view/audio/index.js`, `src/view/materials/compiler.js`
- Test: `test/render-stubs.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createAssets({ manifest, base, compiler, renderer, gfx })` → `{ progress, preload(keys) → Promise<void>, has(key), get(key), clone(key, opts), dispose() }`
  - `createViewSync(engine, { gfx, assets, compiler })` → `{ frame(alpha), objectOf(e), on(match, hooks) → off, dispose() }`
  - `createAudio({ doc, flags })` → `{ ctx, master, unlocked, onUnlock(fn) → off, load(url) → Promise, play(buffer, opts) → handle, mute(on), dispose() }`
  - `createMaterialCompiler(registry, { shading })` → `{ shading, get, paint, coverage, apply, furGeometry, keys, made, dispose }`

- [ ] **Step 1: Write the failing test.** Create `test/render-stubs.test.mjs`:

```js
// The inert stubs 3e ships so boot's render pipeline runs before 3f/3g land (overview §4.6). Their owners replace them
// wholesale; these tests pin only the surface boot relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssets } from '../src/view/assets/index.js';
import { createViewSync } from '../src/view/sync/index.js';
import { createAudio } from '../src/view/audio/index.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';

const fns = (o, names) => { for (const n of names) assert.equal(typeof o[n], 'function', `${n} is a function`); };

test('stub createAssets has the §4.7 surface and is inert', async () => {
  const a = createAssets({ manifest: null, base: './assets/', compiler: null, renderer: null, gfx: null });
  fns(a, ['preload', 'has', 'get', 'clone', 'dispose']);
  assert.deepEqual(a.progress, { loaded: 0, total: 0, bytes: 0 });
  assert.equal(await a.preload(['pig']), undefined);
  assert.equal(a.has('pig'), false);
  assert.throws(() => a.get('pig'), /assets: 'pig' is not preloaded/);
  assert.throws(() => a.clone('pig', {}), /assets: 'pig' is not preloaded/);
  a.dispose();
});
test('stub createViewSync has the §4.9 surface plus dispose, and draws nothing', () => {
  const s = createViewSync({}, { gfx: null, assets: null, compiler: null });
  fns(s, ['frame', 'objectOf', 'on', 'dispose']);
  assert.equal(s.frame(0.5), undefined);
  assert.equal(s.objectOf({ id: 1 }), undefined);
  const off = s.on('#pig', {}); assert.equal(typeof off, 'function'); off(); s.dispose();
});
test('stub createAudio has the §4.9 audio surface and stays silent', async () => {
  const a = createAudio({ doc: null, flags: {} });
  fns(a, ['onUnlock', 'load', 'play', 'mute', 'dispose']);
  assert.equal(a.ctx, null); assert.equal(a.master, null); assert.equal(a.unlocked, false);
  assert.equal(typeof a.onUnlock(() => {}), 'function');
  assert.equal(await a.load('x.mp3'), null); assert.equal(a.play(null, {}), null);
  a.mute(true); a.dispose();
});
test('stub createMaterialCompiler has the §4.8 surface plus made(); get/paint/coverage say 3f', () => {
  const mc = createMaterialCompiler(undefined, { shading: 'lambert' });
  fns(mc, ['get', 'paint', 'coverage', 'apply', 'furGeometry', 'keys', 'made', 'dispose']);
  assert.equal(mc.shading, 'lambert'); assert.equal(createMaterialCompiler().shading, 'physical');
  for (const f of ['get', 'paint', 'coverage']) assert.throws(() => mc[f]('steel'), /materials: the compiler lands in 3f/);
  const root = {}; assert.ok(mc.apply(root, {}) === root);
  const g = {}; assert.ok(mc.furGeometry(g) === g);
  assert.deepEqual(mc.keys(), []); assert.deepEqual([...mc.made()], []); mc.dispose();
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-stubs.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/assets/index.js`.

- [ ] **Step 3: Implement.** Create the four files.

`src/view/assets/index.js`:

```js
// STUB (3e): createAssets with the overview §4.7 surface, inert, so boot's render pipeline (render/pipeline.js) runs before
// 3f lands. 3f replaces this file wholesale; at the Wave B merge the owner's file wins.
export function createAssets({ manifest = null, base = './assets/', compiler = null, renderer = null, gfx = null } = {}) {
  const missing = key => { throw new Error(`assets: '${key}' is not preloaded (stub until 3f)`); };
  return { progress: { loaded: 0, total: 0, bytes: 0 }, preload: async () => undefined, has: () => false, get: missing, clone: missing, dispose() {} };
}
```

`src/view/sync/index.js`:

```js
// STUB (3e): createViewSync with the overview §4.9 surface (plus dispose, which boot calls), inert: it draws nothing.
// 3g replaces this file wholesale; at the Wave B merge the owner's file wins.
export function createViewSync(engine, { gfx = null, assets = null, compiler = null } = {}) {
  return { frame() {}, objectOf() { return undefined; }, on() { return () => {}; }, dispose() {} };
}
```

`src/view/audio/index.js`:

```js
// STUB (3e): createAudio with the overview §4.9 audio surface, silent. 3g replaces this file wholesale (#67).
export function createAudio({ doc = null, flags = {} } = {}) {
  return { ctx: null, master: null, unlocked: false, onUnlock() { return () => {}; }, load: async () => null, play: () => null, mute() {}, dispose() {} };
}
```

`src/view/materials/compiler.js`:

```js
// STUB (3e): createMaterialCompiler with the overview §4.8 surface plus made() (the materials it has compiled, which
// gfx.warm compiles; contract issue in docs/plans/2026-10-13-phase-3e-render.md). 3f replaces this file wholesale.
export function createMaterialCompiler(registry, { shading = 'physical' } = {}) {
  const notYet = () => { throw new Error('materials: the compiler lands in 3f (stub)'); };
  return { shading, get: notYet, paint: notYet, coverage: notYet, apply: root => root, furGeometry: g => g, keys: () => [], made: () => [], dispose() {} };
}
```

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 4 tests.
- [ ] **Step 5: Commit.** `git add src/view/assets/index.js src/view/sync/index.js src/view/audio/index.js src/view/materials/compiler.js test/render-stubs.test.mjs && git commit -m "feat(view): inert assets, sync, audio and compiler stubs for the render pipeline"`

---

## Task 2: `createRenderer`, with the DPR cap and the portrait FOV rule

**Files:**
- Create: `src/view/render/renderer.js`, `test/helpers/fakeRenderer.mjs`
- Test: `test/render-renderer.test.mjs`

**Interfaces:**
- Consumes: `three` (`WebGLRenderer`, `Scene`, `PerspectiveCamera`, shadow and tone-mapping constants).
- Produces:
  - `createRenderer({ canvas, dpr = { touch: 1.5, desktop: 2 }, antialias = true, shadows = 'pcf', toneMapping = 'none', exposure = 1, camera = { fov: 60, fovPortrait: 64, near: 0.3, far: 500 }, renderer?, target? })` → `{ renderer, scene, camera, size: { w, h }, post: null, resize() → size, render(), info() → stats, dispose() }`. `renderer`, `target`, `size` and `post` are additive (Contract issue 4).
  - `fitView(input, opts, out)` → `out`. Not a public export.
  - `checkShadows(v)`, `checkToneMapping(v)`, `SHADOWS`, `TONE`, `PORTRAIT_BELOW`.
  - `camera.userData.lhFov`: the base FOV after the portrait rule. Rigs that animate the FOV add to it (Contract issue 4).

- [ ] **Step 1: Write the fake renderer helper.** Create `test/helpers/fakeRenderer.mjs`:

```js
// A WebGLRenderer stand-in for Node tests of lion-hawk/view render modules (Node has no WebGL). It records calls in `log`
// and keeps the state the modules read back: pixel ratio, size, the render target and the clear colour.
const visibleMeshes = scene => { const out = []; scene.traverseVisible(o => { if (o.isMesh) out.push(o); }); return out; };
export function fakeRenderer({ programs = 0, doc = null, pixels = null } = {}) {
  const log = [];
  const r = {
    log, disposed: false, domElement: doc ? { ownerDocument: doc } : null,
    shadowMap: { enabled: false, type: -1 }, toneMapping: -1, toneMappingExposure: -1,
    pixelRatio: 1, width: 0, height: 0, target: null, clearColor: 0x000000, clearAlpha: 1,
    info: { render: { calls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: Array.from({ length: programs }, () => ({})) },
    setPixelRatio(v) { r.pixelRatio = v; log.push(['setPixelRatio', v]); },
    getPixelRatio() { return r.pixelRatio; },
    setSize(w, h, style) { r.width = w; r.height = h; log.push(['setSize', w, h, style]); },
    getDrawingBufferSize(out) { return out.set(Math.floor(r.width * r.pixelRatio), Math.floor(r.height * r.pixelRatio)); },
    render(scene, camera) { r.info.render.calls++; log.push(['render', scene, camera, r.target]); },
    clear() { log.push(['clear', r.target]); },
    compile(scene) { log.push(['compile', visibleMeshes(scene)]); },
    compileAsync(scene) { log.push(['compileAsync', visibleMeshes(scene)]); return Promise.resolve(scene); },
    setRenderTarget(t) { r.target = t; log.push(['setRenderTarget', t]); },
    getRenderTarget() { return r.target; },
    getClearColor(out) { return out.setHex(r.clearColor); },
    getClearAlpha() { return r.clearAlpha; },
    setClearColor(c, a = 1) { r.clearColor = typeof c === 'number' ? c : c.getHex(); r.clearAlpha = a; },
    readRenderTargetPixels(rt, x, y, w, h, px) { log.push(['read', rt, w, h]); pixels?.(px, w, h); },
    dispose() { r.disposed = true; log.push(['dispose']); },
  };
  return r;
}
```

- [ ] **Step 2: Write the failing test.** Create `test/render-renderer.test.mjs`:

```js
// createRenderer (overview §4.6): the DPR cap by touch, the portrait FOV rule, shadows, tone mapping, resize, one per page.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitView, createRenderer, PORTRAIT_BELOW } from '../src/view/render/renderer.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const fit = (o, opts) => fitView({ cssW: 800, cssH: 600, winW: 0, winH: 0, deviceDpr: 1, touchPoints: 0, ...o }, opts);
const page = ({ w = 390, h = 844, dpr = 3, touch = 5 } = {}) => {
  const ls = {}, doc = {};
  const canvas = { clientWidth: w, clientHeight: h, ownerDocument: doc };
  const target = { innerWidth: w, innerHeight: h, devicePixelRatio: dpr, navigator: { maxTouchPoints: touch }, addEventListener: (t, f) => { ls[t] = f; }, removeEventListener: (t, f) => { if (ls[t] === f) delete ls[t]; } };
  return { canvas, target, ls };
};

test('fitView caps DPR by touch: 1.5 on touch, 2 on desktop, never above the device', () => {
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }).pixelRatio, 1.5);
  assert.equal(fit({ deviceDpr: 3, touchPoints: 1 }).pixelRatio, 2); // one touch point: a desktop touch screen, not an iPad
  assert.equal(fit({ deviceDpr: 1, touchPoints: 5 }).pixelRatio, 1);
  assert.equal(fit({ deviceDpr: 0, touchPoints: 0 }).pixelRatio, 1);
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }, { dpr: 2 }).pixelRatio, 2); // a number caps both
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }, { dpr: { touch: 1, desktop: 2 } }).pixelRatio, 1);
});
test('fitView: the portrait FOV starts strictly below aspect 0.9', () => {
  assert.equal(PORTRAIT_BELOW, 0.9);
  assert.equal(fit({ cssW: 90, cssH: 100 }).fov, 60);
  assert.equal(fit({ cssW: 89, cssH: 100 }).fov, 64);
  assert.equal(fit({ cssW: 89, cssH: 100 }, { fov: 48, fovPortrait: 64 }).fov, 64);
  assert.equal(fit({ cssW: 1600, cssH: 900 }, { fov: 48 }).fov, 48);
});
test('fitView falls back to the window size, then 1, while the canvas has no layout', () => {
  const a = fit({ cssW: 0, cssH: 0, winW: 1280, winH: 720 }); assert.deepEqual([a.w, a.h], [1280, 720]);
  const b = fit({ cssW: 0, cssH: 0 }); assert.deepEqual([b.w, b.h, b.aspect], [1, 1, 1]);
});
test('createRenderer applies shadows, tone mapping and the first resize', () => {
  const { canvas, target } = page(), r = fakeRenderer();
  const g = createRenderer({ canvas, target, renderer: r, toneMapping: 'aces', exposure: 1.05 });
  assert.equal(r.shadowMap.enabled, true); assert.equal(r.shadowMap.type, THREE.PCFShadowMap);
  assert.equal(r.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(r.toneMappingExposure, 1.05);
  assert.equal(r.pixelRatio, 1.5); assert.deepEqual(r.log.find(l => l[0] === 'setSize'), ['setSize', 390, 844, false]);
  assert.equal(g.camera.fov, 64); assert.equal(g.camera.userData.lhFov, 64); assert.equal(g.camera.aspect, 390 / 844);
  assert.equal(g.camera.near, 0.3); assert.equal(g.camera.far, 500); assert.deepEqual(g.size, { w: 390, h: 844 });
  assert.equal(g.scene.isScene, true); g.dispose();
});
test('createRenderer defaults: PCF, no tone mapping, exposure 1; shadows: false turns the map off', () => {
  const a = page(), r = fakeRenderer(), g = createRenderer({ canvas: a.canvas, target: a.target, renderer: r });
  assert.equal(r.toneMapping, THREE.NoToneMapping); assert.equal(r.toneMappingExposure, 1); g.dispose();
  const b = page(), r2 = fakeRenderer(), g2 = createRenderer({ canvas: b.canvas, target: b.target, renderer: r2, shadows: false });
  assert.equal(r2.shadowMap.enabled, false); g2.dispose();
});
test('createRenderer rejects unknown shadows and tone mapping by name', () => {
  const { canvas, target } = page();
  assert.throws(() => createRenderer({ canvas, target, renderer: fakeRenderer(), shadows: 'soft' }), /render: shadows must be 'pcf' \| 'vsm' \| 'basic' \| false \(got "soft"\)/);
  assert.throws(() => createRenderer({ canvas, target, renderer: fakeRenderer(), toneMapping: 'filmic' }), /render: toneMapping must be 'none' \| 'aces' \| 'agx' \| 'neutral' \(got "filmic"\)/);
  const g = createRenderer({ canvas, target, renderer: fakeRenderer() }); g.dispose(); // a rejected call left no page claim
});
test('the resize listener follows rotation; dispose removes it', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  p.canvas.clientWidth = 844; p.canvas.clientHeight = 390; p.ls.resize();
  assert.equal(g.camera.fov, 60); assert.deepEqual(g.size, { w: 844, h: 390 }); assert.deepEqual(r.log.at(-1), ['setSize', 844, 390, false]);
  g.dispose(); assert.equal(p.ls.resize, undefined);
});
test('one renderer per page: a second createRenderer on the same document throws until the first is disposed', () => {
  const p = page(), q = page(); q.canvas.ownerDocument = p.canvas.ownerDocument;
  const g = createRenderer({ canvas: p.canvas, target: p.target, renderer: fakeRenderer() });
  assert.throws(() => createRenderer({ canvas: q.canvas, target: q.target, renderer: fakeRenderer() }), /render: this page already has a renderer \(one WebGLRenderer per page\)/);
  g.dispose();
  createRenderer({ canvas: q.canvas, target: q.target, renderer: fakeRenderer() }).dispose();
});
test('render draws once per call, through post when one is set; nothing after dispose; dispose is idempotent', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  g.render(); assert.equal(r.info.render.calls, 1);
  const seen = []; g.post = { render: (s, c) => seen.push(s === g.scene && c === g.camera), dispose() { seen.push('disposed'); } };
  g.render(); assert.equal(r.info.render.calls, 1); assert.deepEqual(seen, [true]);
  g.dispose(); assert.equal(r.disposed, true); assert.deepEqual(seen, [true, 'disposed']); assert.equal(g.post, null);
  g.render(); assert.equal(r.info.render.calls, 1); g.dispose(); assert.equal(r.log.filter(l => l[0] === 'dispose').length, 1);
});
test('info() reads renderer.info into one reused object', () => {
  const p = page(), r = fakeRenderer({ programs: 3 }), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  g.render(); const a = g.info(); assert.equal(a.calls, 1); assert.equal(a.programs, 3); assert.ok(g.info() === a); g.dispose();
});
test('per-frame paths allocate nothing (R-8)', () => {
  const p = page(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: fakeRenderer() });
  for (const f of [g.render, g.info]) assert.doesNotMatch(f.toString(), HOT);
  g.dispose();
});
```

- [ ] **Step 3: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-renderer.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/renderer.js`.

- [ ] **Step 4: Implement.** Create `src/view/render/renderer.js`:

```js
// lion-hawk/view renderer (overview §4.6, design §6.6): one WebGLRenderer per page, the DPR cap by touch, PCF shadows, tone
// mapping, and a resize with the portrait FOV rule. Merges the bootstraps of Rally (src/render.js), Pig Pens
// (src/game.view.js) and Tractor Pickup (src/render/scene.js).
import * as THREE from 'three';

export const SHADOWS = Object.freeze({ pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap, basic: THREE.BasicShadowMap });
export const TONE = Object.freeze({ none: THREE.NoToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping });
export const PORTRAIT_BELOW = 0.9; // aspect below this: the portrait FOV (Tractor X-12, Pig Pens)
export const DEFAULT_DPR = Object.freeze({ touch: 1.5, desktop: 2 }); // an iPad at 1.5 holds 60 fps (Tractor X-4)
export const DEFAULT_CAMERA = Object.freeze({ fov: 60, fovPortrait: 64, near: 0.3, far: 500 });
const names = o => Object.keys(o).map(k => `'${k}'`).join(' | ');
export function checkShadows(v) { if (v !== false && !Object.hasOwn(SHADOWS, v)) throw new Error(`render: shadows must be ${names(SHADOWS)} | false (got ${JSON.stringify(v)})`); }
export function checkToneMapping(v) { if (!Object.hasOwn(TONE, v)) throw new Error(`render: toneMapping must be ${names(TONE)} (got ${JSON.stringify(v)})`); }

// The resize rule, pure. The CSS size falls back to the window, then 1, while the canvas has no layout. The DPR is capped by
// touch: navigator.maxTouchPoints > 1 is an iPad or a phone; 1 is a desktop touch screen. The portrait FOV applies below
// aspect 0.9.
export function fitView({ cssW, cssH, winW, winH, deviceDpr, touchPoints }, { dpr = DEFAULT_DPR, fov = DEFAULT_CAMERA.fov, fovPortrait = DEFAULT_CAMERA.fovPortrait } = {}, out = {}) {
  const w = cssW > 0 ? cssW : winW > 0 ? winW : 1, h = cssH > 0 ? cssH : winH > 0 ? winH : 1;
  const cap = typeof dpr === 'number' ? dpr : touchPoints > 1 ? dpr.touch ?? DEFAULT_DPR.touch : dpr.desktop ?? DEFAULT_DPR.desktop;
  out.w = w; out.h = h; out.pixelRatio = Math.min(deviceDpr > 0 ? deviceDpr : 1, cap); out.aspect = w / h;
  out.fov = out.aspect < PORTRAIT_BELOW ? fovPortrait : fov;
  return out;
}

const live = new WeakMap(); // page (the canvas's document) → its renderer: one WebGLRenderer per page

export function createRenderer({ canvas, dpr = DEFAULT_DPR, antialias = true, shadows = 'pcf', toneMapping = 'none', exposure = 1, camera = {}, renderer = null, target } = {}) {
  checkShadows(shadows); checkToneMapping(toneMapping);
  canvas ??= renderer?.domElement;
  if (!canvas) throw new Error('render: createRenderer needs { canvas }');
  const page = canvas.ownerDocument ?? canvas;
  if (live.has(page)) throw new Error('render: this page already has a renderer (one WebGLRenderer per page); dispose the first one');
  target ??= canvas.ownerDocument?.defaultView ?? globalThis;
  const r = renderer ?? new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' }); // throws without WebGL
  live.set(page, r);
  r.shadowMap.enabled = shadows !== false;
  if (shadows !== false) r.shadowMap.type = SHADOWS[shadows];
  r.toneMapping = TONE[toneMapping]; r.toneMappingExposure = exposure;
  const cam = { ...DEFAULT_CAMERA, ...camera };
  const scene = new THREE.Scene(), view = new THREE.PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
  const size = { w: 1, h: 1 }, fit = { w: 1, h: 1, pixelRatio: 1, aspect: 1, fov: cam.fov }, opts = { dpr, fov: cam.fov, fovPortrait: cam.fovPortrait };
  const input = { cssW: 0, cssH: 0, winW: 0, winH: 0, deviceDpr: 1, touchPoints: 0 };
  const stats = { calls: 0, triangles: 0, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0 };
  let disposed = false;
  function resize() {
    if (disposed) return size;
    input.cssW = canvas.clientWidth ?? 0; input.cssH = canvas.clientHeight ?? 0;
    input.winW = target.innerWidth ?? 0; input.winH = target.innerHeight ?? 0;
    input.deviceDpr = target.devicePixelRatio ?? 1;
    input.touchPoints = (target.navigator ?? globalThis.navigator)?.maxTouchPoints ?? 0;
    fitView(input, opts, fit);
    size.w = fit.w; size.h = fit.h;
    r.setPixelRatio(fit.pixelRatio); r.setSize(fit.w, fit.h, false);
    view.aspect = fit.aspect; view.fov = fit.fov; view.userData.lhFov = fit.fov; view.updateProjectionMatrix();
    return size;
  }
  const onResize = () => resize();
  target.addEventListener?.('resize', onResize);
  const ro = typeof target.ResizeObserver === 'function' ? new target.ResizeObserver(onResize) : null; // the canvas can change size without a window resize (Tractor X-11)
  ro?.observe(canvas);
  const gfx = {
    renderer: r, scene, camera: view, size, post: null, resize,
    render() { if (disposed) return; if (gfx.post) gfx.post.render(scene, view); else r.render(scene, view); },
    info() {
      const i = r.info;
      stats.calls = i.render.calls; stats.triangles = i.render.triangles; stats.points = i.render.points; stats.lines = i.render.lines;
      stats.geometries = i.memory.geometries; stats.textures = i.memory.textures; stats.programs = i.programs?.length ?? 0;
      return stats;
    },
    dispose() {
      if (disposed) return; disposed = true;
      target.removeEventListener?.('resize', onResize); ro?.disconnect();
      gfx.post?.dispose?.(); gfx.post = null;
      r.dispose(); if (live.get(page) === r) live.delete(page);
    },
  };
  resize();
  return gfx;
}
```

- [ ] **Step 5: Run it again** (same command). Expected: PASS, 11 tests.
- [ ] **Step 6: Prove the boundaries red by mutation.**
  - Change `out.aspect < PORTRAIT_BELOW` to `<=` and run again. Expected: FAIL in "the portrait FOV starts strictly below aspect 0.9".
  - Restore it. Then change `touchPoints > 1` to `touchPoints >= 1`. Expected: FAIL in "fitView caps DPR by touch" (the `touchPoints: 1` line).
  - Restore it and run again. Expected: PASS.
- [ ] **Step 7: Commit.** `git add src/view/render/renderer.js test/helpers/fakeRenderer.mjs test/render-renderer.test.mjs && git commit -m "feat(view): createRenderer with the touch DPR cap, portrait FOV, shadows and tone mapping"`

---

## Task 3: The light rig (judgment)

**Files:**
- Create: `src/view/render/lights.js`
- Test: `test/render-lights.test.mjs`

**Interfaces:**
- Consumes: `three`.
- Produces:
  - `createLightRig(scene, opts)` → `{ hemi, sun, follow(x, z), set(preset | k), lerp(a, b, k), dispose(), presets }`. `dispose` and `presets` are additive.
  - `checkLights(opts)`, `LIGHT_DEFAULTS`, `DEFAULT_PRESETS`.

**Options shape:**

```
opts  = { sky, hemiSky, ground, hemi, sun: { color, intensity, map, box: number | [x, z], offset: [x, y, z], near, far, bias, normalBias }, fog: [near, far] | false, presets }
preset = { sky, hemiSky, ground, hemi, sun: { color, intensity, offset }, fog: [near, far] }
```

`hemiSky` is additive (Contract issue 3). Tractor's hemisphere sky colour is `#eef7ff`, while its background is `#bfe6f5`.

**Decisions expected (judgment):**
- `sky` is the background colour and the fog colour. `hemiSky` is the hemisphere's sky colour.
- A preset may change colours, intensities, the sun offset and the fog distances. It may not change anything that selects a program: fog on/off, shadow casting, map size, the shadow box.
- The default `dusk` and `night` presets are Tractor's bedtime colours, with intensities at the linear midpoint and end. `set(k)` therefore equals Tractor's `setNight(k)`.
- `set(k)` blends day → dusk over k in [0, 0.5) and dusk → night over [0.5, 1].
- The rig owns `scene.background` (one `Color`, mutated) and `scene.fog` (one `Fog`, mutated).
- `sun.map: 0` gives an unshadowed sun.
- Pig Pens' moving moon and Rally's per-world look stay game code. Both use `rig.sun` and `rig.hemi` directly, or a preset.

- [ ] **Step 1: Write the failing test.** Create `test/render-lights.test.mjs`:

```js
// createLightRig (overview §4.6): Tractor Pickup's rig as defaults, a following shadow box, presets that never change shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLightRig, checkLights } from '../src/view/render/lights.js';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const hex = c => '#' + c.getHexString();
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

test('defaults are Tractor Pickup render/scene.js', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  assert.equal(hex(scene.background), '#bfe6f5'); assert.equal(hex(scene.fog.color), '#bfe6f5'); assert.deepEqual([scene.fog.near, scene.fog.far], [90, 220]);
  assert.equal(hex(rig.hemi.color), '#eef7ff'); assert.equal(hex(rig.hemi.groundColor), '#b9a27c'); assert.equal(rig.hemi.intensity, 1.3);
  assert.equal(hex(rig.sun.color), '#fff3dc'); assert.equal(rig.sun.intensity, 2.1); assert.equal(rig.sun.castShadow, true);
  assert.deepEqual([rig.sun.shadow.mapSize.x, rig.sun.shadow.mapSize.y], [2048, 2048]);
  const c = rig.sun.shadow.camera; assert.deepEqual([c.left, c.right, c.top, c.bottom, c.near, c.far], [-30, 30, 30, -30, 5, 120]);
  assert.deepEqual([rig.sun.shadow.bias, rig.sun.shadow.normalBias], [-0.0006, 0.03]);
  assert.ok(scene.children.includes(rig.hemi) && scene.children.includes(rig.sun) && scene.children.includes(rig.sun.target));
});
test('the shadow box follows a point: the sun at the point plus the offset, aimed at the point (Tractor follow)', () => {
  const rig = createLightRig(new THREE.Scene()); rig.follow(10, -4);
  assert.deepEqual(rig.sun.position.toArray(), [-16, 46, 18]); assert.deepEqual(rig.sun.target.position.toArray(), [10, 0, -4]);
});
test('box: [x, z] gives Pig Pens\' uneven shadow box', () => {
  const c = createLightRig(new THREE.Scene(), { sun: { box: [38, 36] } }).sun.shadow.camera;
  assert.deepEqual([c.left, c.right, c.top, c.bottom], [-38, 38, 36, -36]);
});
test('set(k) reproduces Tractor setNight(k) through day, dusk and night', () => {
  // Tractor Pickup src/render/scene.js, copied as the reference
  const SKY = new THREE.Color('#bfe6f5'), DAY = SKY.clone(), DUSK = new THREE.Color('#f4a76b'), NIGHT = new THREE.Color('#1b2440');
  const SUN = [new THREE.Color('#fff3dc'), new THREE.Color('#ffa860'), new THREE.Color('#9fb4ff')], sunC = new THREE.Color();
  const mix = (cols, k, out) => k < 0.5 ? out.copy(cols[0]).lerp(cols[1], k * 2) : out.copy(cols[1]).lerp(cols[2], k * 2 - 1);
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  for (const k of [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1]) {
    rig.set(k); mix([DAY, DUSK, NIGHT], k, SKY); mix(SUN, k, sunC);
    for (const ch of ['r', 'g', 'b']) {
      close(scene.background[ch], SKY[ch], `sky ${ch} at ${k}`); close(scene.fog.color[ch], SKY[ch], `fog ${ch} at ${k}`); close(rig.sun.color[ch], sunC[ch], `sun ${ch} at ${k}`);
    }
    close(rig.hemi.intensity, 1.3 - 1.0 * k, `hemi at ${k}`); close(rig.sun.intensity, 2.1 - 1.95 * k, `sun at ${k}`);
    assert.equal(hex(rig.hemi.color), '#eef7ff', 'the hemisphere colour stays');
  }
});
test('a preset change touches no shader-affecting state (fog object, shadows, light set, background object)', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  const shape = () => ({ n: scene.children.length, cast: rig.sun.castShadow, map: rig.sun.shadow.mapSize.x, types: scene.children.map(o => o.type).join() });
  const fog = scene.fog, bg = scene.background, before = shape();
  rig.set('night'); rig.lerp('day', 'dusk', 0.3); rig.set(0.8);
  assert.ok(scene.fog === fog && scene.background === bg, 'the same Fog and background objects'); assert.deepEqual(shape(), before);
});
test('lerp blends named presets; a game preset can move the sun (Rally snow) and the fog', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { presets: { snow: { sky: '#b7c6cc', hemi: 0.85, sun: { intensity: 3.6, offset: [34, 15, 22] }, fog: [60, 330] } } });
  rig.set('snow'); rig.follow(0, 0);
  assert.deepEqual(rig.sun.position.toArray(), [34, 15, 22]); assert.equal(rig.sun.intensity, 3.6); assert.deepEqual([scene.fog.near, scene.fog.far], [60, 330]);
  rig.lerp('day', 'snow', 0.5); close(rig.hemi.intensity, (1.3 + 0.85) / 2, 'hemi halfway'); close(scene.fog.near, 75, 'fog near halfway');
  assert.deepEqual(rig.presets, ['day', 'dusk', 'night', 'snow']);
  assert.throws(() => rig.set('noon'), /lights: unknown preset 'noon' \(known: day, dusk, night, snow\)/);
  assert.throws(() => rig.set(NaN), /lights: set takes a preset name or k in \[0, 1\]/);
});
test('validation names the field: unknown fields, preset fields that would change shaders, fog without fog', () => {
  assert.throws(() => checkLights({ shadow: 1 }), /lights: shadow is unknown/);
  assert.throws(() => checkLights({ sun: { size: 1 } }), /lights: sun\.size is unknown/);
  assert.throws(() => checkLights({ presets: { night: { sun: { map: 512 } } } }), /lights: preset 'night'\.sun\.map is unknown \(presets change colours/);
  assert.throws(() => checkLights({ presets: { night: { castShadow: false } } }), /lights: preset 'night'\.castShadow is unknown/);
  assert.throws(() => checkLights({ fog: false, presets: { dusk: { fog: [10, 20] } } }), /lights: preset 'dusk'\.fog needs lights\.fog/);
  assert.throws(() => checkLights({ fog: [1] }), /lights: fog must be \[near, far\] or false/);
  assert.throws(() => createLightRig(new THREE.Scene(), { shadow: 1 }), /lights: shadow is unknown/);
});
test('fog: false leaves the scene without fog; sun.map: 0 gives a sun without shadows', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { fog: false, sun: { map: 0 } });
  assert.equal(scene.fog, null); assert.equal(rig.sun.castShadow, false); rig.set(1); assert.equal(scene.fog, null);
});
test('per-frame paths allocate nothing (R-8)', () => {
  const rig = createLightRig(new THREE.Scene());
  for (const f of [rig.follow, rig.lerp, rig.set]) assert.doesNotMatch(f.toString(), HOT);
});
test('dispose takes the lights and the background out of the scene', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene); rig.dispose();
  assert.equal(scene.children.length, 0); assert.equal(scene.background, null);
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-lights.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/lights.js`.

- [ ] **Step 3: Implement.** Create `src/view/render/lights.js`:

```js
// lion-hawk/view light rig (overview §4.6): a hemisphere light, a shadowed sun whose shadow box follows a point, fog in the
// sky colour, and named looks (presets) blended by k. A preset changes colours, intensities, the sun's offset and the fog
// distances, never state that selects a shader program: fog on/off, shadow casting, map size (Tractor X-4 stutters).
// Defaults are Tractor Pickup's src/render/scene.js. The default dusk and night presets reproduce its setNight(k) exactly.
// Pig Pens (src/view/world.js) and Rally (src/render.js setLook) map onto options and presets.
import * as THREE from 'three';

export const LIGHT_DEFAULTS = Object.freeze({
  sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3,
  sun: Object.freeze({ color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: Object.freeze([-26, 46, 22]), near: 5, far: 120, bias: -0.0006, normalBias: 0.03 }),
  fog: Object.freeze([90, 220]),
});
export const DEFAULT_PRESETS = Object.freeze({ // Tractor E-5 bedtime: k 0.5 = sunset, 1 = night (hemi 1.3 - k, sun 2.1 - 1.95 k)
  dusk: Object.freeze({ sky: '#f4a76b', hemi: 0.8, sun: Object.freeze({ color: '#ffa860', intensity: 1.125 }) }),
  night: Object.freeze({ sky: '#1b2440', hemi: 0.3, sun: Object.freeze({ color: '#9fb4ff', intensity: 0.15 }) }),
});
const TOP = ['sky', 'hemiSky', 'ground', 'hemi', 'sun', 'fog', 'presets'];
const SUN = ['color', 'intensity', 'map', 'box', 'offset', 'near', 'far', 'bias', 'normalBias'];
const PRESET = ['sky', 'hemiSky', 'ground', 'hemi', 'sun', 'fog'];
const PRESET_SUN = ['color', 'intensity', 'offset'];
const unknown = (o, known, where, why = '') => { for (const k of Object.keys(o ?? {})) if (!known.includes(k)) throw new Error(`lights: ${where}${k} is unknown${why}`); };

export function checkLights(opts = {}) {
  if (!opts || typeof opts !== 'object') throw new Error('lights: options must be an object');
  unknown(opts, TOP, '');
  unknown(opts.sun, SUN, 'sun.');
  if (opts.fog !== undefined && opts.fog !== false && !(Array.isArray(opts.fog) && opts.fog.length === 2)) throw new Error(`lights: fog must be [near, far] or false (got ${JSON.stringify(opts.fog)})`);
  for (const [name, p] of Object.entries(opts.presets ?? {})) {
    unknown(p, PRESET, `preset '${name}'.`);
    unknown(p.sun, PRESET_SUN, `preset '${name}'.sun.`, ' (presets change colours, intensities, the sun offset and fog distances only)');
    if (p.fog !== undefined && opts.fog === false) throw new Error(`lights: preset '${name}'.fog needs lights.fog (fog on or off changes shaders)`);
  }
}

export function createLightRig(scene, opts = {}) {
  checkLights(opts);
  const base = { ...LIGHT_DEFAULTS, ...opts, sun: { ...LIGHT_DEFAULTS.sun, ...opts.sun } }, s = base.sun;
  const hemi = new THREE.HemisphereLight(base.hemiSky, base.ground, base.hemi);
  const sun = new THREE.DirectionalLight(s.color, s.intensity);
  sun.castShadow = s.map > 0;
  if (sun.castShadow) {
    const [bx, bz] = Array.isArray(s.box) ? s.box : [s.box, s.box];
    sun.shadow.mapSize.set(s.map, s.map);
    Object.assign(sun.shadow.camera, { left: -bx, right: bx, top: bz, bottom: -bz, near: s.near, far: s.far });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = s.bias; sun.shadow.normalBias = s.normalBias;
  }
  scene.add(hemi, sun, sun.target);
  const sky = new THREE.Color(base.sky);
  scene.background = sky;
  scene.fog = base.fog ? new THREE.Fog(base.sky, base.fog[0], base.fog[1]) : null;
  const fogOf = (p, d) => p.fog ?? d.fog ?? (base.fog || [0, 0]);
  const resolve = (p = {}, d = {}) => ({ // a preset over its default (dusk, night) over the base look; made once, read by lerp
    sky: new THREE.Color(p.sky ?? d.sky ?? base.sky), hemiSky: new THREE.Color(p.hemiSky ?? d.hemiSky ?? base.hemiSky),
    ground: new THREE.Color(p.ground ?? d.ground ?? base.ground), hemi: p.hemi ?? d.hemi ?? base.hemi,
    sunColor: new THREE.Color(p.sun?.color ?? d.sun?.color ?? s.color), sun: p.sun?.intensity ?? d.sun?.intensity ?? s.intensity,
    offset: new THREE.Vector3().fromArray(p.sun?.offset ?? d.sun?.offset ?? s.offset),
    near: fogOf(p, d)[0], far: fogOf(p, d)[1],
  });
  const presets = {};
  for (const name of new Set(['day', 'dusk', 'night', ...Object.keys(opts.presets ?? {})])) presets[name] = resolve(opts.presets?.[name], name === 'day' ? undefined : DEFAULT_PRESETS[name]);
  const names = Object.freeze(Object.keys(presets));
  const offset = new THREE.Vector3().copy(presets.day.offset);
  let fx = 0, fz = 0;
  const fail = name => { throw Error(`lights: unknown preset '${name}' (known: ${names.join(', ')})`); };
  const get = name => presets[name] ?? fail(name);
  function follow(x, z) { fx = x; fz = z; sun.position.set(x + offset.x, offset.y, z + offset.z); sun.target.position.set(x, 0, z); }
  function lerp(a, b, k) {
    const A = get(a), B = get(b), t = k < 0 ? 0 : k > 1 ? 1 : k;
    sky.copy(A.sky).lerp(B.sky, t);
    if (scene.fog) { scene.fog.color.copy(sky); scene.fog.near = A.near + (B.near - A.near) * t; scene.fog.far = A.far + (B.far - A.far) * t; }
    hemi.color.copy(A.hemiSky).lerp(B.hemiSky, t); hemi.groundColor.copy(A.ground).lerp(B.ground, t); hemi.intensity = A.hemi + (B.hemi - A.hemi) * t;
    sun.color.copy(A.sunColor).lerp(B.sunColor, t); sun.intensity = A.sun + (B.sun - A.sun) * t;
    offset.copy(A.offset).lerp(B.offset, t); follow(fx, fz);
  }
  function set(x) {
    if (typeof x === 'string') return lerp(x, x, 0);
    if (typeof x !== 'number' || x !== x) throw Error(`lights: set takes a preset name or k in [0, 1] (got ${x})`);
    const k = x < 0 ? 0 : x > 1 ? 1 : x;
    return k < 0.5 ? lerp('day', 'dusk', k * 2) : lerp('dusk', 'night', k * 2 - 1);
  }
  function dispose() { scene.remove(hemi, sun, sun.target); sun.dispose(); hemi.dispose(); if (scene.background === sky) scene.background = null; }
  set('day'); follow(0, 0);
  return { hemi, sun, follow, set, lerp, dispose, presets: names };
}
```

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 10 tests.
- [ ] **Step 5: Prove the parity test red by mutation.** Change the default night `intensity: 0.15` to `0.2` and run again. Expected: FAIL in "set(k) reproduces Tractor setNight(k)", with `sun at 0.7`. Restore it and run again. Expected: PASS.
- [ ] **Step 6: Commit.** `git add src/view/render/lights.js test/render-lights.test.mjs && git commit -m "feat(view): light rig with a following sun, fog and look presets (Tractor setNight parity)"`

---

## Task 4: GPU hygiene: warm, instanced shadow depth, disposeTree, programCount

**Files:**
- Create: `src/view/render/hygiene.js`
- Test: `test/render-hygiene.test.mjs`

**Interfaces:**
- Consumes: `three`.
- Produces:
  - `warm(renderer, scene, camera, { materials = [] } = {})` → `Promise<void>`. It never throws synchronously. Each material in `materials` goes onto a hidden warm group as one mesh, of the kind its `userData.lhUse` names: `'mesh'` (the default), `'instanced'`, `'instancedColor'` or `'skinned'` (Contract issue 2).
  - `instancedShadows(root)` → `root`.
  - `INSTANCED_DEPTH`
  - `disposeTree(root, { keepShared } = {})` → the number of resources disposed. `keepShared` is a `Set` or a predicate. Anything with `userData.lhShared === true` is always kept.
  - `programCount(renderer)` → number.

- [ ] **Step 1: Write the failing test.** Create `test/render-hygiene.test.mjs`:

```js
// GPU hygiene (M-12, S-3; Tractor Pickup render/{warm,shadows,dispose}.js): warm compiles hidden objects and given materials;
// instanced casters get their own depth material; disposeTree frees each resource once and keeps shared ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warm, instancedShadows, disposeTree, programCount, INSTANCED_DEPTH } from '../src/view/render/hygiene.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const counter = () => {
  const hits = new Map();
  const watch = (r, name) => { r.addEventListener('dispose', () => hits.set(name, (hits.get(name) ?? 0) + 1)); return r; };
  return { hits, watch };
};

test('instancedShadows gives instanced casters the shared instanced depth material, and nothing else', () => {
  const geo = new THREE.BoxGeometry(), mat = new THREE.MeshLambertMaterial(), root = new THREE.Group();
  const cast = new THREE.InstancedMesh(geo, mat, 4); cast.castShadow = true;
  const quiet = new THREE.InstancedMesh(geo, mat, 4);
  const plain = new THREE.Mesh(geo, mat); plain.castShadow = true;
  root.add(cast, quiet, plain);
  assert.ok(instancedShadows(root) === root);
  assert.ok(cast.customDepthMaterial === INSTANCED_DEPTH, 'the instanced caster');
  assert.equal(quiet.customDepthMaterial, undefined); assert.equal(plain.customDepthMaterial, undefined);
  assert.equal(INSTANCED_DEPTH.isMeshDepthMaterial, true); assert.equal(INSTANCED_DEPTH.userData.lhShared, true);
});
test('disposeTree frees each geometry, material and texture once, and keeps what is shared', () => {
  const { hits, watch } = counter();
  const geo = watch(new THREE.BoxGeometry(), 'geo'), sharedGeo = watch(new THREE.BoxGeometry(), 'sharedGeo'); sharedGeo.userData.lhShared = true;
  const map = watch(new THREE.Texture(), 'map'), extra = watch(new THREE.Texture(), 'extra'), uni = watch(new THREE.Texture(), 'uni'), keptMap = watch(new THREE.Texture(), 'keptMap');
  const mat = watch(new THREE.MeshLambertMaterial({ map }), 'mat'); mat.userData.textures = [extra];
  const shader = watch(new THREE.ShaderMaterial({ uniforms: { tex: { value: uni } } }), 'shader');
  const keptMat = watch(new THREE.MeshLambertMaterial({ map: keptMap }), 'keptMat');
  const inst = new THREE.InstancedMesh(geo, mat, 2); inst.castShadow = true; instancedShadows(inst);
  const depthHits = []; const onDepth = () => depthHits.push(1); INSTANCED_DEPTH.addEventListener('dispose', onDepth);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, [mat, shader]), new THREE.Mesh(sharedGeo, keptMat), inst);
  try {
    const n = disposeTree(root, { keepShared: new Set([keptMat]) });
    assert.deepEqual(Object.fromEntries(hits), { geo: 1, map: 1, extra: 1, mat: 1, uni: 1, shader: 1 });
    assert.equal(n, 6); assert.equal(depthHits.length, 0, 'the shared instanced depth material survives');
  } finally { INSTANCED_DEPTH.removeEventListener('dispose', onDepth); }
});
test('keepShared may be a predicate', () => {
  const { hits, watch } = counter(), g = new THREE.BufferGeometry(); g.userData.lhShared = true;
  const a = watch(new THREE.MeshBasicMaterial(), 'a'), b = watch(new THREE.MeshBasicMaterial(), 'b'), root = new THREE.Group();
  root.add(new THREE.Mesh(g, a), new THREE.Mesh(g, b));
  assert.equal(disposeTree(root, { keepShared: r => r === a }), 1); assert.deepEqual(Object.fromEntries(hits), { b: 1 });
});
test('warm compiles hidden objects too, then hides them again before any frame (Tractor warmShaders)', async () => {
  const r = fakeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const shown = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()), hat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const holder = new THREE.Group(); holder.visible = false; hat.visible = false; holder.add(hat); scene.add(shown, holder);
  const p = warm(r, scene, cam);
  const [, seen] = r.log.find(l => l[0] === 'compileAsync');
  assert.ok(seen.includes(shown) && seen.includes(hat), 'the hidden hat was visible while compiling');
  assert.equal(holder.visible, false); assert.equal(hat.visible, false);
  assert.equal(await p, undefined);
});
test('warm adds one mesh per given material, of the kind userData.lhUse names, on a group it removes', async () => {
  const r = fakeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const mats = ['mesh', 'instanced', 'instancedColor', 'skinned'].map(k => { const m = new THREE.MeshLambertMaterial(); m.userData.lhUse = k; return m; });
  mats.push(new THREE.MeshLambertMaterial()); // untagged: a plain mesh
  await warm(r, scene, cam, { materials: mats });
  const [, seen] = r.log.find(l => l[0] === 'compileAsync'), by = m => seen.find(o => o.material === m);
  assert.ok(by(mats[0]) && !by(mats[0]).isInstancedMesh && !by(mats[0]).isSkinnedMesh, 'mesh');
  assert.ok(by(mats[1]).isInstancedMesh && by(mats[1]).instanceColor === null, 'instanced');
  assert.ok(by(mats[2]).isInstancedMesh && by(mats[2]).instanceColor !== null, 'instancedColor');
  assert.ok(by(mats[3]).isSkinnedMesh, 'skinned');
  assert.ok(by(mats[4]) && !by(mats[4]).isInstancedMesh, 'untagged');
  assert.equal(scene.children.length, 0, 'the warm group is gone');
});
test('warm rejects (never throws) on an unknown lhUse or a failing compile, restores hidden objects, and falls back to compile()', async () => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(), odd = new THREE.MeshBasicMaterial(); odd.name = 'odd'; odd.userData.lhUse = 'points';
  await assert.rejects(warm(fakeRenderer(), scene, cam, { materials: [odd] }), /warm: material 'odd' has userData\.lhUse 'points'/);
  const bad = fakeRenderer(); bad.compileAsync = () => { throw new Error('ANGLE'); };
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hidden.visible = false; scene.add(hidden);
  await assert.rejects(warm(bad, scene, cam), /ANGLE/); assert.equal(hidden.visible, false, 'hidden again after a throw');
  const old = fakeRenderer(); delete old.compileAsync; await warm(old, scene, cam); assert.equal(old.log[0][0], 'compile');
  assert.equal(scene.children.length, 1);
});
test('programCount reads renderer.info.programs', () => {
  assert.equal(programCount(fakeRenderer({ programs: 7 })), 7); assert.equal(programCount({ info: {} }), 0);
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-hygiene.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/hygiene.js`.

- [ ] **Step 3: Implement.** Create `src/view/render/hygiene.js`:

```js
// lion-hawk/view GPU hygiene (M-12, S-3, design §6.6), from Tractor Pickup src/render/{warm,shadows,dispose}.js, generalised.
// matSplit (M-13) is the material compiler's cache key (3f), not a helper here.
import * as THREE from 'three';

// X-4 (Tractor review 3): three.js draws every shadow caster with one shared depth material. Instanced and plain casters
// take turns in the shadow pass, so that material keeps switching programs: garbage every frame and a GC pause on an
// iPad. Instanced casters get a depth material of their own, so neither ever changes kind.
export const INSTANCED_DEPTH = new THREE.MeshDepthMaterial();
INSTANCED_DEPTH.name = 'lh.instancedDepth'; INSTANCED_DEPTH.userData.lhShared = true;

export function instancedShadows(root) {
  root.traverse(o => { if (o.isInstancedMesh && o.castShadow) o.customDepthMaterial = INSTANCED_DEPTH; });
  return root;
}

const WARM_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01); WARM_GEO.userData.lhShared = true; // compile never uploads it
const WHITE = new THREE.Color(1, 1, 1);
export const WARM_USES = Object.freeze(['mesh', 'instanced', 'instancedColor', 'skinned']);
function warmMesh(m) { // the kind of object decides the program (USE_INSTANCING, USE_INSTANCING_COLOR, USE_SKINNING)
  const use = m.userData?.lhUse ?? 'mesh';
  if (use === 'mesh') return new THREE.Mesh(WARM_GEO, m);
  if (use === 'instanced' || use === 'instancedColor') { const im = new THREE.InstancedMesh(WARM_GEO, m, 1); if (use === 'instancedColor') im.setColorAt(0, WHITE); return im; }
  if (use === 'skinned') { const sm = new THREE.SkinnedMesh(WARM_GEO, m), bone = new THREE.Bone(); sm.add(bone); sm.bind(new THREE.Skeleton([bone])); return sm; }
  throw new Error(`warm: material '${m.name}' has userData.lhUse '${use}' (known: ${WARM_USES.join(', ')})`);
}

// B-2 (Tractor X-4): compile every program while loading, not the first time a mesh comes into view. An iPad compile
// through ANGLE to Metal takes 50-400 ms. three.js compiles only visible objects, so hidden ones are shown for the
// synchronous part of compileAsync and hidden again before any frame draws. Materials not in the scene yet (the compiler's)
// go on a warm group for that moment.
export function warm(renderer, scene, camera, { materials = [] } = {}) {
  const hidden = [];
  let group = null, done;
  try {
    for (const m of materials) { group ??= new THREE.Group(); group.add(warmMesh(m)); }
    if (group) { group.name = 'lh.warm'; scene.add(group); }
    scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    done = renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera);
  } catch (err) {
    done = Promise.reject(err);
  } finally {
    for (const o of hidden) o.visible = false;
    if (group) { scene.remove(group); for (const c of group.children) { if (c.isInstancedMesh) c.dispose(); else if (c.isSkinnedMesh) c.skeleton.dispose(); } }
  }
  return Promise.resolve(done).then(() => undefined);
}

// Free what a tree owns on the GPU: geometries, materials, the textures they hold (maps, ShaderMaterial uniforms, and
// material.userData.textures for textures only a patched shader reads), instanced attributes and skeletons. Each resource
// is freed once. Kept: anything with userData.lhShared (asset geometries, compiler materials, INSTANCED_DEPTH) and anything
// keepShared names (a Set or a predicate); a kept material keeps its textures.
export function disposeTree(root, { keepShared } = {}) {
  const keep = keepShared == null ? null : typeof keepShared === 'function' ? keepShared : r => keepShared.has(r);
  const seen = new Set();
  let n = 0;
  const kept = r => r.userData?.lhShared === true || (keep !== null && keep(r) === true);
  const free = r => { if (!r || seen.has(r)) return; seen.add(r); if (kept(r)) return; r.dispose(); n++; };
  const material = m => {
    if (!m || seen.has(m)) return; seen.add(m);
    if (kept(m)) return;
    for (const k of Object.keys(m)) { const v = m[k]; if (v?.isTexture) free(v); }
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) free(u.value);
    for (const t of m.userData?.textures ?? []) free(t);
    m.dispose(); n++;
  };
  root.traverse(o => {
    free(o.geometry);
    if (Array.isArray(o.material)) for (const m of o.material) material(m); else material(o.material);
    material(o.customDepthMaterial); material(o.customDistanceMaterial);
    if (o.isInstancedMesh) o.dispose();
    if (o.isSkinnedMesh && o.skeleton) free(o.skeleton);
  });
  return n;
}

export function programCount(renderer) { return renderer.info?.programs?.length ?? 0; }
```

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 7 tests.
- [ ] **Step 5: Prove RF4 red by mutation.** Replace `const kept = r => r.userData?.lhShared === true || …` with `const kept = r => keep !== null && keep(r) === true;` and run again. Expected: FAIL in "disposeTree frees each … once". `sharedGeo` and `INSTANCED_DEPTH` get disposed. Restore it and run again. Expected: PASS.
- [ ] **Step 6: Commit.** `git add src/view/render/hygiene.js test/render-hygiene.test.mjs && git commit -m "feat(view): warm, instancedShadows, shared-aware disposeTree and programCount (M-12, S-3)"`

---

## Task 5: `snapshot` to a data URL

**Files:**
- Create: `src/view/render/snapshot.js`, `test/helpers/fakeCanvas.mjs`
- Test: `test/render-snapshot.test.mjs`

**Interfaces:**
- Consumes: `three`.
- Produces:
  - `snapshot(renderer, object, { size = 256 | [w, h], camera, yaw = 0, pitch = 0.22, fov = 28, fill = 1.02, lights = true, crop = false, outline = null | { px = 11, color = '#ffffff' }, alpha = 8, colorSpace = 'linear', out })` → data URL string, or `''` when a crop finds nothing.
  - With `out`, writes `out.w` and `out.h`. These options are additive (Contract issue 4).
  - `alphaBounds(px, w, h, min, out)` and `copyRows(px, w, x0, y0, x1, y1, dst)`.
  - `STUDIO`

**Behaviour:**
- The object is moved into a private studio scene (one per renderer) for the call.
- Afterwards it is put back under its old parent. Its index in that parent may change, which is documented.
- Its own transform is never written.
- `colorSpace: 'linear'` keeps Tractor's output as it ships today. `'srgb'` is available.

- [ ] **Step 1: Write the fake canvas helper.** Create `test/helpers/fakeCanvas.mjs`:

```js
// A document whose canvases record their 2D calls (Node has no canvas): enough for render/snapshot.js.
export function fakeDoc() {
  const canvases = [];
  return {
    canvases,
    createElement(tag) {
      const c = { tag, width: 0, height: 0, image: null, ops: [], getContext: () => ctx, toDataURL: () => `data:image/png;fake,${c.width}x${c.height}` };
      const ctx = {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img, x, y) => { c.image = img; c.ops.push(['put', x, y]); },
        drawImage: (src, x, y) => c.ops.push(['draw', src, x, y]),
        fillRect: (x, y, w, h) => c.ops.push(['fill', x, y, w, h]),
        set globalCompositeOperation(v) { c.ops.push(['op', v]); },
        set fillStyle(v) { c.ops.push(['style', v]); },
      };
      canvases.push(c); return c;
    },
  };
}
```

- [ ] **Step 2: Write the failing test.** Create `test/render-snapshot.test.mjs`:

```js
// snapshot (overview §4.6): Tractor Pickup's thumbnail copies (ui/icons.js, ui/stickerArt.js) as one engine helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapshot, alphaBounds, copyRows } from '../src/view/render/snapshot.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';
import { fakeDoc } from './helpers/fakeCanvas.mjs';

test('alphaBounds finds the drawn box (alpha strictly above min); empty when nothing is drawn', () => {
  const w = 4, h = 3, px = new Uint8Array(w * h * 4); px[(1 * w + 2) * 4 + 3] = 255; px[(2 * w + 1) * 4 + 3] = 9;
  assert.deepEqual(alphaBounds(px, w, h, 8), { empty: false, x0: 1, y0: 1, x1: 2, y1: 2 });
  px[(2 * w + 1) * 4 + 3] = 8; assert.deepEqual(alphaBounds(px, w, h, 8), { empty: false, x0: 2, y0: 1, x1: 2, y1: 1 });
  assert.equal(alphaBounds(new Uint8Array(w * h * 4), w, h, 8).empty, true);
});
test('copyRows flips GPU rows (bottom-up) to image rows (top-down) and crops columns', () => {
  const w = 3, h = 2, px = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) px[i * 4] = i; // red = pixel index in GPU order
  const reds = a => [...a].filter((_, i) => i % 4 === 0);
  assert.deepEqual(reds(copyRows(px, w, 0, 0, 2, 1, new Uint8Array(w * h * 4))), [3, 4, 5, 0, 1, 2]);
  assert.deepEqual(reds(copyRows(px, w, 1, 0, 2, 1, new Uint8Array(2 * 2 * 4))), [4, 5, 1, 2]);
});
test('snapshot renders the object alone into a clear target and restores the renderer and the object\'s parent', () => {
  const doc = fakeDoc(), r = fakeRenderer({ doc, pixels: (px, w) => { for (let y = 1; y < 3; y++) for (let x = 2; x < 5; x++) px[(y * w + x) * 4 + 3] = 255; } });
  r.setClearColor(0x123456, 0.5); const prev = { isRenderTarget: true }; r.setRenderTarget(prev); r.log.length = 0;
  const home = new THREE.Group(), obj = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); home.add(obj);
  const info = {}, url = snapshot(r, obj, { size: 8, crop: true, out: info });
  const draw = r.log.find(l => l[0] === 'render');
  assert.ok(draw[3]?.isWebGLRenderTarget, 'drawn into a render target'); assert.ok(draw[1].isScene && draw[1] !== home, 'in the studio scene');
  assert.ok(r.log.some(l => l[0] === 'clear' && l[1] === draw[3]), 'the target was cleared first');
  assert.ok(r.getRenderTarget() === prev, 'the previous target is back'); assert.equal(r.clearColor, 0x123456); assert.equal(r.clearAlpha, 0.5);
  assert.ok(obj.parent === home, 'the object is back home');
  assert.deepEqual(info, { w: 3, h: 2 }); assert.equal(url, 'data:image/png;fake,3x2');
});
test('a crop that finds nothing is an empty string and 0x0', () => {
  const info = {};
  assert.equal(snapshot(fakeRenderer({ doc: fakeDoc() }), new THREE.Group(), { size: 4, crop: true, out: info }), '');
  assert.deepEqual(info, { w: 0, h: 0 });
});
test('outline grows the picture by the border and stamps the silhouette under the art (stickerArt)', () => {
  const doc = fakeDoc(), info = {};
  snapshot(fakeRenderer({ doc, pixels: px => { px[3] = 255; } }), new THREE.Group(), { size: 4, crop: true, outline: { px: 11 }, out: info });
  assert.deepEqual(info, { w: 23, h: 23 });
  const last = doc.canvases.at(-1), draws = last.ops.filter(o => o[0] === 'draw');
  assert.equal(draws.length, 49); assert.deepEqual(draws.at(-1).slice(2), [11, 11]); // 2 rings x 24 stamps, then the art on top
});
test('auto-framing: yaw turns the object, pitch raises the camera; the object\'s transform is untouched; a given camera is used as is', () => {
  const r = fakeRenderer({ doc: fakeDoc() }), obj = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  obj.position.set(5, 0, 0);
  snapshot(r, obj, { size: 8, yaw: Math.PI / 2, pitch: 0 });
  const cam = r.log.find(l => l[0] === 'render')[2], d = Math.sqrt(3) / Math.sin(28 * Math.PI / 360) * 1.02;
  assert.ok(Math.abs(cam.position.x) < 1e-9 && Math.abs(cam.position.y) < 1e-9 && Math.abs(cam.position.z - (-5 + d)) < 1e-9, cam.position.toArray().join());
  assert.deepEqual(obj.position.toArray(), [5, 0, 0]); assert.equal(obj.rotation.y, 0); assert.equal(obj.parent, null);
  const own = new THREE.PerspectiveCamera(); snapshot(r, obj, { size: 8, camera: own });
  assert.ok(r.log.filter(l => l[0] === 'render').at(-1)[2] === own);
});
```

- [ ] **Step 3: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-snapshot.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/snapshot.js`.

- [ ] **Step 4: Implement.** Create `src/view/render/snapshot.js`:

```js
// lion-hawk/view thumbnails (overview §4.6): an object rendered alone in a studio light, on a clear background, to a PNG data
// URL. Replaces Tractor Pickup's three copies (src/ui/icons.js renderIcons and tractorPicture, src/ui/stickerArt.js), with
// auto-framing by yaw and pitch (stickerArt), an optional crop to the drawn pixels and a die-cut outline. The object is put
// back under its parent afterwards (its index there may change); its own transform is never written. colorSpace 'linear'
// (default) is what Tractor ships today; 'srgb' encodes the target.
import * as THREE from 'three';

export const STUDIO = Object.freeze({ sky: '#ffffff', ground: '#b9a27c', hemi: 2.2, sun: 1.6, sunAt: Object.freeze([2, 5, 4]) });

// GPU rows come bottom-up: the box of pixels whose alpha is above min, in GPU rows
export function alphaBounds(px, w, h, min = 8, out = {}) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  out.empty = x1 < 0; out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
  return out;
}
// GPU rows y0..y1 (bottom-up), columns x0..x1, into dst top-down (an ImageData's data)
export function copyRows(px, w, x0, y0, x1, y1, dst) {
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  for (let y = 0; y < ch; y++) dst.set(px.subarray(((y1 - y) * w + x0) * 4, ((y1 - y) * w + x1 + 1) * 4), y * cw * 4);
  return dst;
}

const studios = new WeakMap(); // renderer → { scene, pivot, lit, cam }
function studioOf(renderer) {
  let st = studios.get(renderer);
  if (!st) {
    const scene = new THREE.Scene(), pivot = new THREE.Group(), lit = new THREE.Group(), cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const sun = new THREE.DirectionalLight('#ffffff', STUDIO.sun); sun.position.fromArray(STUDIO.sunAt);
    lit.add(new THREE.HemisphereLight(STUDIO.sky, STUDIO.ground, STUDIO.hemi), sun);
    scene.add(lit, pivot); studios.set(renderer, st = { scene, pivot, lit, cam });
  }
  return st;
}
const box = new THREE.Box3(), centre = new THREE.Vector3(), extent = new THREE.Vector3();
function frame(st, object, aspect, fov, pitch, fill) { // stickerArt: the bounding sphere fills the view
  const cam = st.cam;
  box.setFromObject(object); box.getCenter(centre);
  const r = (box.isEmpty() ? 0 : box.getSize(extent).length() / 2) || 1, d = r / Math.sin(fov * Math.PI / 360) * fill;
  cam.fov = fov; cam.aspect = aspect; cam.near = Math.max(0.01, d - r * 2); cam.far = d + r * 2;
  cam.position.set(centre.x, centre.y + Math.sin(pitch) * d, centre.z + Math.cos(pitch) * d); cam.lookAt(centre);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
}

export function snapshot(renderer, object, { size = 256, camera = null, yaw = 0, pitch = 0.22, fov = 28, fill = 1.02, lights = true, crop = false, outline = null, alpha = 8, colorSpace = 'linear', out = null } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size];
  const st = studioOf(renderer), parent = object.parent, px = new Uint8Array(W * H * 4);
  st.lit.visible = lights !== false; st.pivot.rotation.y = yaw; st.pivot.add(object);
  try {
    st.scene.updateMatrixWorld(true);
    const cam = camera ?? frame(st, object, W / H, fov, pitch, fill);
    const rt = new THREE.WebGLRenderTarget(W, H);
    if (colorSpace === 'srgb') rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(st.scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally { renderer.setRenderTarget(prev); renderer.setClearColor(clear, clearA); rt.dispose(); }
  } finally {
    st.pivot.remove(object); st.pivot.rotation.y = 0;
    if (parent) parent.add(object);
  }
  return encode(renderer, px, W, H, crop, outline, alpha, out);
}

function encode(renderer, px, W, H, crop, outline, alpha, out) {
  const doc = renderer.domElement?.ownerDocument ?? globalThis.document;
  let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
  if (crop) {
    const b = alphaBounds(px, W, H, alpha);
    if (b.empty) { if (out) { out.w = 0; out.h = 0; } return ''; }
    ({ x0, y0, x1, y1 } = b);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, art = doc.createElement('canvas'); art.width = w; art.height = h;
  const ctx = art.getContext('2d'), img = ctx.createImageData(w, h);
  copyRows(px, W, x0, y0, x1, y1, img.data); ctx.putImageData(img, 0, 0);
  let result = art;
  if (outline) { // stickerArt's die-cut border: the shape in white, stamped all around it, under the art
    const B = outline.px ?? 11, sil = doc.createElement('canvas'); sil.width = w; sil.height = h;
    const sc = sil.getContext('2d'); sc.drawImage(art, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = outline.color ?? '#ffffff'; sc.fillRect(0, 0, w, h);
    result = doc.createElement('canvas'); result.width = w + B * 2; result.height = h + B * 2;
    const oc = result.getContext('2d');
    for (const rr of [B * 0.5, B]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; oc.drawImage(sil, B + Math.cos(a) * rr, B + Math.sin(a) * rr); }
    oc.drawImage(art, B, B);
  }
  if (out) { out.w = result.width; out.h = result.height; }
  return result.toDataURL();
}
```

- [ ] **Step 5: Run it again** (same command). Expected: PASS, 6 tests.
- [ ] **Step 6: Prove RF5 red by mutation.**
  - In `copyRows`, change `(y1 - y)` to `(y0 + y)` and run again. Expected: FAIL in "copyRows flips GPU rows".
  - Restore it. Then delete `if (parent) parent.add(object);`. Expected: FAIL in "…restores the renderer and the object's parent".
  - Restore it and run again. Expected: PASS.
- [ ] **Step 7: Commit.** `git add src/view/render/snapshot.js test/helpers/fakeCanvas.mjs test/render-snapshot.test.mjs && git commit -m "feat(view): snapshot an object to a PNG data URL with framing, crop and outline"`

---

## Task 6: The tilt-shift post pass, made generic

**Files:**
- Create: `src/view/render/tiltShift.js`
- Test: `test/render-tiltshift.test.mjs`

**Interfaces:**
- Consumes: `three`.
- Produces:
  - `createTiltShift(renderer, opts)` → `{ render(scene, camera, focus = params.focus), setSize(), dispose(), params, targets: { full, half, blur }, passes: { pre, blur, comp, quad } }`.
  - `TILT_DEFAULTS`, `SHADERS`.
  - A game sets `view.gfx.post = fx` and writes `fx.params.focus` each frame. Pig Pens used `rig.cam.dist`.

**Changes from Pig Pens' `src/tiltshift.js`:**
- `focus` defaults to `params.focus`.
- Options are validated.
- The full target always has a depth buffer, so `samples: 0` works.
- The composite runs `#include <tonemapping_fragment>` before `<colorspace_fragment>`. For `toneMapping: 'none'` this is a no-op, so Pig Pens' pixels are unchanged.
- `dispose()` is new.

- [ ] **Step 1: Write the failing test.** Create `test/render-tiltshift.test.mjs`:

```js
// createTiltShift (overview §4.6): Pig Pens' src/tiltshift.js, generic.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTiltShift, SHADERS } from '../src/view/render/tiltShift.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;

test('defaults are Pig Pens\' tiltshift.js; unknown options throw', () => {
  assert.deepEqual({ ...createTiltShift(fakeRenderer()).params }, { on: true, band: 0.06, scale: 3.2, nearScale: 1.6, blur: 0.011, sat: 1.05, vig: 0.2, fullAt: 10, offAt: 24, focus: 10, samples: 4 });
  assert.throws(() => createTiltShift(fakeRenderer(), { strength: 1 }), /tiltShift: strength is unknown/);
});
test('zoomed out (focus >= offAt) or off: one plain render to the screen, no extra passes', () => {
  const r = fakeRenderer(), fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  fx.render(scene, cam, 24); fx.params.on = false; fx.render(scene, cam, 5);
  const draws = r.log.filter(l => l[0] === 'render'); assert.equal(draws.length, 2);
  for (const d of draws) { assert.ok(d[1] === scene && d[2] === cam, 'the game scene and camera'); assert.equal(d[3], null); }
});
test('zoomed in: scene to the full target, then prefilter, blur and composite to the screen, sized to the drawing buffer', () => {
  const r = fakeRenderer(); r.setPixelRatio(2); r.setSize(400, 300, false);
  const fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.3, 400);
  r.log.length = 0; fx.render(scene, cam, 5);
  const t = r.log.filter(l => l[0] === 'render').map(l => l[3]);
  assert.equal(t.length, 4);
  assert.ok(t[0] === fx.targets.full && t[1] === fx.targets.half && t[2] === fx.targets.blur && t[3] === null, 'pass order');
  assert.deepEqual([fx.targets.full.width, fx.targets.full.height, fx.targets.half.width, fx.targets.half.height], [800, 600, 400, 300]);
  assert.ok(Math.abs(fx.passes.comp.uniforms.maxR.value - 0.011 * 600 * 0.5) < 1e-12, 'full strength below fullAt');
  assert.equal(fx.passes.comp.uniforms.focus.value, 5); assert.equal(fx.passes.comp.uniforms.near.value, 0.3);
  fx.params.focus = 7; fx.render(scene, cam); assert.equal(fx.passes.comp.uniforms.focus.value, 7, 'focus defaults to params.focus');
});
test('setSize reallocates only when the drawing buffer changes', () => {
  const r = fakeRenderer(); r.setSize(100, 100, false);
  const fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  let n = 0; const orig = fx.targets.full.setSize.bind(fx.targets.full); fx.targets.full.setSize = (...a) => { n++; return orig(...a); };
  fx.render(scene, cam, 5); fx.render(scene, cam, 5); assert.equal(n, 1);
  r.setSize(120, 100, false); fx.render(scene, cam, 5); assert.equal(n, 2);
});
test('the composite tone-maps before converting colour space (ACES games keep their look)', () => {
  const tm = SHADERS.COMP.indexOf('#include <tonemapping_fragment>'), cs = SHADERS.COMP.indexOf('#include <colorspace_fragment>');
  assert.ok(tm > 0 && cs > tm, `tonemapping at ${tm}, colorspace at ${cs}`);
});
test('dispose frees the three targets, the depth texture, three materials and the quad geometry', () => {
  const fx = createTiltShift(fakeRenderer()), hits = [];
  const watch = (o, n) => o.addEventListener('dispose', () => hits.push(n));
  watch(fx.targets.full, 'full'); watch(fx.targets.half, 'half'); watch(fx.targets.blur, 'blur'); watch(fx.targets.full.depthTexture, 'depth');
  watch(fx.passes.pre, 'pre'); watch(fx.passes.blur, 'blurMat'); watch(fx.passes.comp, 'comp'); watch(fx.passes.quad.geometry, 'quad');
  fx.dispose(); assert.deepEqual([...new Set(hits)].sort(), ['blur', 'blurMat', 'comp', 'depth', 'full', 'half', 'pre', 'quad']);
});
test('render allocates nothing per frame (R-8)', () => {
  assert.doesNotMatch(createTiltShift(fakeRenderer()).render.toString(), HOT);
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-tiltshift.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/tiltShift.js`.

- [ ] **Step 3: Implement.** Create `src/view/render/tiltShift.js`:

```js
// Tilt-shift "miniature" post pass (overview §4.6), from Pig Pens src/tiltshift.js, made generic: a very shallow depth of
// field focused at `focus` (the camera-to-target distance). Blur grows with depth away from the focus, relative to it.
//   1. scene -> full-res MSAA target with a depth texture
//   2. half-res prefilter: colour + signed circle of confusion (CoC) packed in alpha
//   3. half-res gather blur: golden-angle spiral; a sample lands only if its own CoC reaches the centre (no halos)
//   4. full-res composite: sharp where CoC ~ 0, blurred elsewhere, a little saturation and vignette, then tone mapping and
//      the output colour space (tone mapping is a no-op for toneMapping 'none', so Pig Pens' pixels are unchanged)
// The look fades in as the camera zooms in (full at fullAt, gone by offAt); zoomed out it is one plain render.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const PRE = `
#include <packing>
uniform sampler2D tColor, tDepth; uniform float near, far, focus, band, scale, nearScale;
varying vec2 vUv;
float coc(vec2 uv) {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
  float d = (z - focus) / focus;
  return sign(d) * clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
}
void main() {
  vec2 px = 0.5 / vec2(textureSize(tColor, 0));
  vec3 c = texture2D(tColor, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, -px.y)).rgb
         + texture2D(tColor, vUv + vec2(-px.x, px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, px.y)).rgb;
  gl_FragColor = vec4(c * 0.25, coc(vUv));
}`;
const BLUR = `
uniform sampler2D tHalf; uniform float maxR;
varying vec2 vUv;
#define N 40
void main() {
  vec2 px = 1.0 / vec2(textureSize(tHalf, 0));
  vec4 c0 = texture2D(tHalf, vUv);
  float rc = abs(c0.a) * maxR;
  vec3 acc = c0.rgb; float tot = 1.0, fg = 0.0;
  for (int i = 1; i < N; i++) {
    float r = sqrt(float(i) / float(N)) * maxR;
    float a = float(i) * 2.39996323;
    vec4 s = texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * r * px);
    float rs = abs(s.a) * maxR;
    if (s.a > c0.a) rs = min(rs, rc * 2.0);
    float m = smoothstep(r - 0.5, r + 0.5, rs);
    if (s.a < c0.a) fg = max(fg, m * abs(s.a));
    acc += mix(acc / tot, s.rgb, m); tot += 1.0;
  }
  gl_FragColor = vec4(acc / tot, fg);
}`;
const COMP = `
#include <packing>
uniform sampler2D tColor, tDepth, tBlur; uniform float near, far, focus, band, scale, nearScale, maxR, sat, vig;
varying vec2 vUv;
void main() {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
  float d = (z - focus) / focus;
  float k = clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
  vec3 sharp = texture2D(tColor, vUv).rgb;
  vec4 bl = texture2D(tBlur, vUv);
  float w = smoothstep(0.25, 1.25, max(k, bl.a) * maxR);
  vec3 c = mix(sharp, bl.rgb, w);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.6;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SHADERS = Object.freeze({ VERT, PRE, BLUR, COMP });
export const TILT_DEFAULTS = Object.freeze({ on: true, band: 0.06, scale: 3.2, nearScale: 1.6, blur: 0.011, sat: 1.05, vig: 0.2, fullAt: 10, offAt: 24, focus: 10, samples: 4 });

export function createTiltShift(renderer, opts = {}) {
  for (const k of Object.keys(opts)) if (!Object.hasOwn(TILT_DEFAULTS, k)) throw new Error(`tiltShift: ${k} is unknown (known: ${Object.keys(TILT_DEFAULTS).join(', ')})`);
  const P = { ...TILT_DEFAULTS, ...opts };
  const mk = (samples, depthBuffer) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer });
  const full = mk(P.samples, true); full.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const half = mk(0, false), blurT = mk(0, false);
  const U = { near: { value: 1 }, far: { value: 100 }, focus: { value: 10 }, band: { value: P.band }, scale: { value: P.scale }, nearScale: { value: P.nearScale }, maxR: { value: 4 } };
  const pass = (frag, extra) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { ...U, ...extra }, depthTest: false, depthWrite: false });
  const pre = pass(PRE, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture } });
  const blur = pass(BLUR, { tHalf: { value: half.texture } });
  const comp = pass(COMP, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture }, tBlur: { value: blurT.texture }, sat: { value: P.sat }, vig: { value: P.vig } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qScene = new THREE.Scene(), qCam = new THREE.Camera();
  quad.frustumCulled = false; qScene.add(quad);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  const size = new THREE.Vector2();
  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = size.x, h = size.y, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    if (full.width === w && full.height === h) return;
    full.setSize(w, h); half.setSize(hw, hh); blurT.setSize(hw, hh);
  }
  function render(scene, camera, focus = P.focus) {
    const k = 1 - THREE.MathUtils.smoothstep(focus, P.fullAt, P.offAt);
    if (!P.on || k <= 0.001) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    setSize();
    U.near.value = camera.near; U.far.value = camera.far; U.focus.value = focus;
    U.band.value = P.band; U.scale.value = P.scale; U.nearScale.value = P.nearScale; U.maxR.value = P.blur * full.height * 0.5 * k;
    comp.uniforms.sat.value = 1 + (P.sat - 1) * k; comp.uniforms.vig.value = P.vig * k;
    renderer.setRenderTarget(full); renderer.render(scene, camera);
    run(pre, half); run(blur, blurT); run(comp, null);
  }
  function dispose() { full.depthTexture.dispose(); full.dispose(); half.dispose(); blurT.dispose(); pre.dispose(); blur.dispose(); comp.dispose(); quad.geometry.dispose(); }
  return { render, setSize, dispose, params: P, targets: { full, half, blur: blurT }, passes: { pre, blur, comp, quad } };
}
```

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 7 tests.
- [ ] **Step 5: Commit.** `git add src/view/render/tiltShift.js test/render-tiltshift.test.mjs && git commit -m "feat(view): generic tilt-shift post pass from Pig Pens with tone mapping and dispose"`

---

## Task 7: The render pipeline: what boot builds, draws and disposes (judgment)

**Files:**
- Create: `src/view/render/pipeline.js`
- Test: `test/render-pipeline.test.mjs`

**Interfaces:**
- Consumes:
  - `createRenderer`, `checkShadows`, `checkToneMapping` (Task 2);
  - `createLightRig`, `checkLights` (Task 3);
  - `warm` (Task 4);
  - the Task 1 stubs, through the overview §4.7–§4.9 signatures;
  - `engine.game.defs?.materials` (3b/3c; `undefined` before Wave A merges, which the compiler accepts).
- Produces:
  - `checkRender(render)`, which throws with `defineView: render.<field> …`.
  - `createPipeline(engine, view, render, { doc, target, canvas, renderer, flags, report })` → `{ frame(alpha), draw(), dispose() }`.
  - It sets `view.gfx`, `view.materials`, `view.assets`, `view.sync`, `view.audio` and `engine.assets`.
  - `view.gfx` is the `createRenderer` result plus `lights` and `warm(opts)`.

**Decisions expected (judgment):**
- **A missing canvas is a programming error and throws.** Message: `boot: defineView({ render }) needs a canvas: …`.
- **A renderer that fails** (no WebGL) is reported once through `report` as `render: <message>`. Then:
  - `view.gfx`, `view.materials`, `view.assets` and `view.sync` are all `null`, and `engine.assets` is `undefined`;
  - `view.audio` still exists (sound works without WebGL);
  - `frame` and `draw` are no-ops.

  This is Contract issue 6.
- **`render.assets = { manifest, base = './assets/' }`** feeds `createAssets` (Contract issue 3). `createAssets` also receives `gfx`, so 3f's `preload` can end with `gfx.warm()` in the real scene and its lights (Contract issue 2).
- **`gfx.warm(opts)`** compiles the scene plus the compiler's `made()` materials, plus `opts.materials`.
- **Build order:** audio, then renderer, lights, compiler, assets, sync. **Dispose order** is the reverse: sync, assets, compiler, audio, lights, renderer.

- [ ] **Step 1: Write the failing test.** Create `test/render-pipeline.test.mjs`:

```js
// createPipeline (overview §4.6): boot's render services, the frame order hooks, dispose, and the no-WebGL path (RF1).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPipeline, checkRender } from '../src/view/render/pipeline.js';
import { createEngine } from '../src/core/engine.js';
import game from './fixtures/countdown.js';
import { dom } from './helpers/dom.mjs';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const setup = (render = {}, { renderer = fakeRenderer(), withCanvas = true } = {}) => {
  const { document } = dom(), engine = createEngine(game, {}), view = { doc: document }, errors = [];
  const canvas = withCanvas ? document.createElement('canvas') : null; if (canvas) document.body.appendChild(canvas);
  if (renderer && canvas) renderer.domElement = canvas;
  const make = () => createPipeline(engine, view, render, { doc: document, target: { addEventListener() {}, removeEventListener() {} }, canvas: canvas ?? undefined, renderer, flags: {}, report: e => errors.push(e.message) });
  return { engine, view, errors, renderer, make };
};

test('builds gfx with lights and warm, the compiler, assets, sync and audio; engine.assets is view.assets', () => {
  const s = setup({ shading: 'lambert' }), pipe = s.make(), g = s.view.gfx;
  assert.ok(g.renderer === s.renderer && g.scene.isScene && g.camera.isPerspectiveCamera, 'gfx parts');
  for (const k of ['resize', 'render', 'warm', 'info', 'dispose']) assert.equal(typeof g[k], 'function', k);
  assert.ok(g.scene.children.includes(g.lights.hemi), 'the light rig is in the scene');
  assert.equal(s.view.materials.shading, 'lambert');
  for (const k of ['assets', 'sync', 'audio']) assert.equal(typeof s.view[k], 'object', k);
  assert.ok(s.engine.assets === s.view.assets, 'engine.assets'); assert.deepEqual(s.errors, []);
  pipe.dispose();
});
test('lights: false builds no rig; shading defaults to physical', () => {
  const s = setup({ lights: false }), pipe = s.make();
  assert.equal(s.view.gfx.lights, null); assert.equal(s.view.gfx.scene.children.length, 0); assert.equal(s.view.materials.shading, 'physical');
  pipe.dispose();
});
test('frame runs view.sync.frame(alpha); draw renders the scene with the camera once', () => {
  const s = setup(), pipe = s.make(), log = [];
  s.view.sync.frame = a => log.push(a);
  pipe.frame(0.25); pipe.draw();
  assert.deepEqual(log, [0.25]);
  const draws = s.renderer.log.filter(l => l[0] === 'render'); assert.equal(draws.length, 1);
  assert.ok(draws[0][1] === s.view.gfx.scene && draws[0][2] === s.view.gfx.camera, 'scene and camera');
  for (const f of [pipe.frame, pipe.draw]) assert.doesNotMatch(f.toString(), HOT);
  pipe.dispose();
});
test('gfx.warm compiles the compiler\'s materials and the ones it is given', async () => {
  const s = setup(), pipe = s.make(), made = new THREE.MeshLambertMaterial(), extra = new THREE.MeshPhongMaterial();
  s.view.materials.made = () => [made];
  await s.view.gfx.warm({ materials: [extra] });
  const [, seen] = s.renderer.log.find(l => l[0] === 'compileAsync');
  assert.ok(seen.some(o => o.material === made) && seen.some(o => o.material === extra), 'both on the warm group');
  pipe.dispose();
});
test('a renderer that cannot start is reported once as render: …; the page runs on without gfx (RF1)', () => {
  const s = setup({}, { renderer: null }), pipe = s.make(); // happy-dom canvas: three cannot create a WebGL context
  assert.equal(s.errors.length, 1); assert.match(s.errors[0], /^render: .*WebGL context/);
  for (const k of ['gfx', 'materials', 'assets', 'sync']) assert.equal(s.view[k], null, k);
  assert.equal(s.engine.assets, undefined); assert.equal(typeof s.view.audio.play, 'function');
  pipe.frame(0.5); pipe.draw(); pipe.dispose(); pipe.dispose();
});
test('no canvas anywhere is a programming error', () => {
  const s = setup({}, { renderer: null, withCanvas: false });
  assert.throws(() => s.make(), /boot: defineView\(\{ render \}\) needs a canvas/);
});
test('dispose frees everything once, in reverse, and stops drawing', () => {
  const s = setup(), pipe = s.make(), order = [], scene = s.view.gfx.scene;
  s.view.sync.dispose = () => order.push('sync'); s.view.assets.dispose = () => order.push('assets');
  s.view.materials.dispose = () => order.push('materials'); s.view.audio.dispose = () => order.push('audio');
  pipe.dispose(); pipe.dispose();
  assert.deepEqual(order, ['sync', 'assets', 'materials', 'audio']);
  assert.equal(s.renderer.disposed, true); assert.equal(scene.children.length, 0, 'lights removed'); assert.equal(s.engine.assets, undefined);
  pipe.draw(); assert.equal(s.renderer.log.filter(l => l[0] === 'render').length, 0);
});
test('checkRender names the field', () => {
  checkRender(undefined); checkRender({});
  assert.throws(() => checkRender(1), /defineView: render must be an object/);
  assert.throws(() => checkRender({ fps: 1 }), /defineView: render\.fps is unknown \(known: shading, dpr/);
  assert.throws(() => checkRender({ shading: 'toon' }), /defineView: render\.shading must be physical \| standard \| lambert \(got "toon"\)/);
  assert.throws(() => checkRender({ shadows: 'soft' }), /render: shadows must be/);
  assert.throws(() => checkRender({ toneMapping: 'filmic' }), /render: toneMapping must be/);
  assert.throws(() => checkRender({ dpr: 0 }), /defineView: render\.dpr must be a number above 0 or \{ touch, desktop \}/);
  assert.throws(() => checkRender({ dpr: { phone: 1 } }), /defineView: render\.dpr must be/);
  assert.throws(() => checkRender({ camera: { zoom: 2 } }), /defineView: render\.camera\.zoom is unknown/);
  assert.throws(() => checkRender({ assets: { url: 'x' } }), /defineView: render\.assets\.url is unknown \(known: manifest, base\)/);
  assert.throws(() => checkRender({ lights: { presets: { night: { sun: { map: 1 } } } } }), /lights: preset 'night'\.sun\.map is unknown/);
  checkRender({ shading: 'standard', dpr: { touch: 1, desktop: 2 }, shadows: false, toneMapping: 'aces', exposure: 1.05, camera: { fov: 48 }, lights: false, assets: { manifest: {}, base: './a/' } });
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-pipeline.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/view/render/pipeline.js`. The no-WebGL test prints three's own `console.error` once; that is expected.

- [ ] **Step 3: Implement.** Create `src/view/render/pipeline.js`:

```js
// Boot's render pipeline (overview §4.6). With defineView({ render }), boot builds this before any view half enters:
//   view.gfx      createRenderer's result plus lights and warm(opts)
//   view.materials  the compiler (shading tier D5)
//   view.assets   also engine.assets (view-only)
//   view.sync, view.audio
// Each render slot runs reconcile (boot) → frame(alpha): sync.frame → the halves' frames (boot) → draw(): gfx.render.
// Without WebGL the renderer's error is reported once as 'render: …' and the page runs on with view.gfx = null; the sim,
// the UI and audio keep working (RF1).
import { createRenderer, checkShadows, checkToneMapping } from './renderer.js';
import { createLightRig, checkLights } from './lights.js';
import { warm } from './hygiene.js';
import { createAssets } from '../assets/index.js';
import { createViewSync } from '../sync/index.js';
import { createAudio } from '../audio/index.js';
import { createMaterialCompiler } from '../materials/compiler.js';

export const RENDER_KEYS = Object.freeze(['shading', 'dpr', 'antialias', 'shadows', 'toneMapping', 'exposure', 'camera', 'lights', 'assets']);
export const SHADING = Object.freeze(['physical', 'standard', 'lambert']);
const CAMERA_KEYS = ['fov', 'fovPortrait', 'near', 'far'], ASSET_KEYS = ['manifest', 'base'], DPR_KEYS = ['touch', 'desktop'];
const known = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`defineView: render.${where}${k} is unknown (known: ${keys.join(', ')})`); };

export function checkRender(render) {
  if (render === undefined) return;
  if (!render || typeof render !== 'object') throw new Error('defineView: render must be an object');
  known(render, RENDER_KEYS, '');
  if (render.shading !== undefined && !SHADING.includes(render.shading)) throw new Error(`defineView: render.shading must be ${SHADING.join(' | ')} (got ${JSON.stringify(render.shading)})`);
  if (render.shadows !== undefined) checkShadows(render.shadows);
  if (render.toneMapping !== undefined) checkToneMapping(render.toneMapping);
  const d = render.dpr;
  if (d !== undefined && !(typeof d === 'number' && d > 0) && !(d && typeof d === 'object' && Object.keys(d).length && Object.keys(d).every(k => DPR_KEYS.includes(k) && d[k] > 0))) throw new Error(`defineView: render.dpr must be a number above 0 or { touch, desktop } (got ${JSON.stringify(d)})`);
  if (render.camera !== undefined) known(render.camera, CAMERA_KEYS, 'camera.');
  if (render.assets !== undefined) { if (!render.assets || typeof render.assets !== 'object') throw new Error('defineView: render.assets must be { manifest, base }'); known(render.assets, ASSET_KEYS, 'assets.'); }
  if (render.lights !== undefined && render.lights !== false) checkLights(render.lights);
}

export function createPipeline(engine, view, render, { doc, target, canvas, renderer = null, flags = {}, report }) {
  canvas ??= renderer?.domElement ?? doc?.querySelector?.('canvas') ?? null;
  if (!canvas) throw new Error('boot: defineView({ render }) needs a canvas: pass boot(game, view, { canvas }) or put a <canvas> in the page');
  view.audio = createAudio({ doc, flags });
  let gfx = null;
  try {
    gfx = createRenderer({ canvas, renderer, target, dpr: render.dpr, antialias: render.antialias, shadows: render.shadows, toneMapping: render.toneMapping, exposure: render.exposure, camera: render.camera });
  } catch (err) {
    report(new Error(`render: ${err?.message ?? err}`));
  }
  if (!gfx) {
    view.gfx = view.materials = view.assets = view.sync = null; engine.assets = undefined;
    let gone = false;
    return { frame() {}, draw() {}, dispose() { if (gone) return; gone = true; view.audio.dispose(); } };
  }
  gfx.lights = render.lights === false ? null : createLightRig(gfx.scene, render.lights ?? {});
  const materials = createMaterialCompiler(engine.game.defs?.materials, { shading: render.shading ?? 'physical' });
  gfx.warm = (opts = {}) => warm(gfx.renderer, gfx.scene, gfx.camera, { materials: [...(materials.made?.() ?? []), ...(opts.materials ?? [])] });
  view.gfx = gfx; view.materials = materials;
  view.assets = createAssets({ manifest: render.assets?.manifest ?? null, base: render.assets?.base ?? './assets/', compiler: materials, renderer: gfx.renderer, gfx });
  engine.assets = view.assets;
  view.sync = createViewSync(engine, { gfx, assets: view.assets, compiler: materials });
  let disposed = false;
  return {
    frame(alpha) { if (!disposed) view.sync.frame(alpha); },
    draw() { if (!disposed) gfx.render(); },
    dispose() {
      if (disposed) return; disposed = true;
      view.sync.dispose?.(); view.assets.dispose(); materials.dispose(); view.audio.dispose();
      gfx.lights?.dispose(); gfx.dispose();
      if (engine.assets === view.assets) engine.assets = undefined;
    },
  };
}
```

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 8 tests.
- [ ] **Step 5: Prove RF1 red by mutation.** Replace the `try { … } catch (err) { report(…) }` around `createRenderer` with a bare `gfx = createRenderer(…)` and run again. Expected: FAIL in "a renderer that cannot start is reported once…" with the thrown WebGL error. Restore it and run again. Expected: PASS.
- [ ] **Step 6: Commit.** `git add src/view/render/pipeline.js test/render-pipeline.test.mjs && git commit -m "feat(view): render pipeline that builds gfx, lights, compiler, assets, sync and audio for boot"`

---

## Task 8: Wire the pipeline into `defineView` and `boot`

**Files:**
- Modify: `src/view/boot.js`
- Test: `test/render-boot.test.mjs`

**Interfaces:**
- Consumes: `createPipeline`, `checkRender` (Task 7). `createEngine(game, { …, timer })`: 3c adds `timer` (#106). Until 3c merges, `createEngine` ignores the extra key.
- Produces:
  - `defineView({ scenes, render })` → `Object.freeze({ scenes, render? })`. `render` is present only when declared.
  - `boot(game, view, { …existing, canvas, timer, renderer })`. With `render`, the view object gains `gfx`, `materials`, `assets`, `sync` and `audio` before any half enters, and `engine.assets` is set.
  - Render slot order: reconcile → `pipe.frame(alpha)` → the halves' `frame` → `pipe.draw()` → the existing `dt` reset and refresh.

**Base text.** 3e's branch starts after 3a, so `boot.js` has 3a's #105 change: view halves' `enter(engine, view, args)`. The edits below touch only lines 3a does not change. If a quoted `old` line differs only by 3a's edit, keep 3a's version and apply the 3e insertion.

- [ ] **Step 1: Write the failing test.** Create `test/render-boot.test.mjs`:

```js
// boot with defineView({ render }) (overview §4.6): services built before any half enters, the render slot order
// (reconcile → sync.frame → halves → gfx.render), errors, dispose; without render, boot is exactly 0.7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView } from '../src/view/boot.js';
import { parseFlags } from '../src/core/flags.js';
import game from './fixtures/countdown.js';
import { dom } from './helpers/dom.mjs';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const raf = () => 0, caf = () => {};
const run = ({ render, renderer = fakeRenderer(), canvas = true, frame } = {}) => {
  const { document } = dom(), target = { document, addEventListener() {}, removeEventListener() {} }, log = [];
  let c; if (canvas) { c = document.createElement('canvas'); document.body.appendChild(c); if (renderer) renderer.domElement = c; }
  const title = { enter: (e, v) => log.push(`enter gfx=${v.gfx ? 'yes' : String(v.gfx)}`), frame: frame ?? (() => log.push('frame title')) };
  const view = defineView(render === undefined ? { scenes: { title } } : { scenes: { title }, render });
  const app = boot(game, view, { doc: document, target, raf, caf, flags: parseFlags('?lh-test'), renderer, canvas: c });
  return { app, log, renderer, view };
};

test('without render, defineView and boot are exactly 0.7: no render key, no services, no engine.assets', () => {
  const { app, log, view } = run({ renderer: null });
  assert.deepEqual(Object.keys(view), ['scenes']);
  for (const k of ['gfx', 'materials', 'assets', 'sync', 'audio']) assert.equal(k in app.view, false, k);
  assert.equal('assets' in app.engine, false);
  app.engine.render(0); assert.deepEqual(log, ['enter gfx=undefined', 'frame title']); app.dispose();
});
test('with render, the services exist before the first half enters, and engine.assets is view.assets', () => {
  const { app, log, renderer } = run({ render: { lights: { fog: [60, 200] } } });
  assert.deepEqual(log, ['enter gfx=yes']);
  assert.ok(app.view.gfx.renderer === renderer, 'the injected renderer'); assert.equal(app.view.gfx.scene.fog.far, 200);
  assert.ok(app.engine.assets === app.view.assets, 'engine.assets'); assert.equal(typeof app.view.audio.play, 'function');
  app.dispose();
});
test('the render slot runs sync.frame(alpha), then the halves\' frames, then one gfx.render', () => {
  const { app, log, renderer } = run({ render: {} }); log.length = 0;
  app.view.sync.frame = a => log.push(`sync ${a}`);
  const draw = renderer.render; renderer.render = (s, c) => { log.push('draw'); draw(s, c); };
  app.engine.render(0.5); assert.deepEqual(log, ['sync 0.5', 'frame title', 'draw']); app.dispose();
});
test('a throwing sync.frame or half is reported; the frame still draws', () => {
  const { app, log, renderer } = run({ render: {}, frame: () => { throw new Error('half bug'); } }); log.length = 0;
  app.view.sync.frame = () => { throw new Error('sync bug'); };
  app.engine.render(0);
  assert.deepEqual(app.hook.errors.map(e => e.message), ['sync bug', 'half bug']);
  assert.equal(renderer.log.filter(l => l[0] === 'render').length, 1); app.dispose();
});
test('defineView validates render by field', () => {
  assert.throws(() => defineView({ scenes: {}, render: { shading: 'toon' } }), /defineView: render\.shading must be physical \| standard \| lambert \(got "toon"\)/);
  assert.throws(() => defineView({ scenes: {}, render: { fps: 1 } }), /defineView: render\.fps is unknown/);
  assert.throws(() => defineView({ scenes: {}, render: { lights: { presets: { night: { sun: { map: 1 } } } } } }), /lights: preset 'night'\.sun\.map is unknown/);
  const v = defineView({ scenes: {}, render: { shading: 'lambert' } }); assert.equal(Object.isFrozen(v.render), true); assert.equal(v.render.shading, 'lambert');
});
test('dispose frees the renderer and clears engine.assets', () => {
  const { app, renderer } = run({ render: {} }); app.dispose();
  assert.equal(renderer.disposed, true); assert.equal(app.engine.assets, undefined);
});
test('no WebGL: boot reports render: …, the halves see gfx null, frames and the UI keep working (RF1)', () => {
  const { app, log } = run({ render: {}, renderer: null });
  assert.equal(app.hook.errors.length, 1); assert.match(app.hook.errors[0].message, /^render: /);
  assert.deepEqual(log, ['enter gfx=null']); assert.equal(app.view.gfx, null);
  app.engine.render(0); assert.deepEqual(log, ['enter gfx=null', 'frame title']);
  app.hook.go('race'); assert.equal(app.engine.scene.name, 'race'); app.dispose();
});
test('render without any canvas throws from boot', () => {
  assert.throws(() => run({ render: {}, renderer: null, canvas: false }), /boot: defineView\(\{ render \}\) needs a canvas/);
});
```

- [ ] **Step 2: Run it.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/render-boot.test.mjs`. Expected: FAIL. The first test passes as a 0.7 guard. Every `render` test fails: `defineView` drops `render`, so `gfx` is `undefined` (`enter gfx=undefined`). The validation test fails with "Missing expected exception".

- [ ] **Step 3: Implement.** Make five edits in `src/view/boot.js`.

  1. **Import.** After `import { installEngine } from './hook.js';` add:

     ```js
     import { createPipeline, checkRender } from './render/pipeline.js';
     ```

  2. **`defineView`.** Replace the function with:

     ```js
     export function defineView({ scenes, render } = {}) {
       if (!scenes || typeof scenes !== 'object') throw new Error('defineView: scenes required');
       for (const [n, s] of Object.entries(scenes)) for (const h of ['enter', 'exit', 'frame', 'built']) if (s[h] !== undefined && typeof s[h] !== 'function') throw new Error(`defineView: scene '${n}'.${h} must be a function`);
       checkRender(render); // overview §4.6: with render, boot builds the renderer, lights, compiler, assets, sync and audio
       const out = { scenes: Object.freeze({ ...scenes }) };
       if (render !== undefined) out.render = Object.freeze({ ...render });
       return Object.freeze(out);
     }
     ```

     If 3a added hooks to the `['enter', 'exit', 'frame', 'built']` list, keep 3a's list.

  3. **The `boot` signature and `createEngine`.**
     - Add `canvas, timer, renderer` to the destructured options: `{ root, doc, target = globalThis, seed, scene, args, flags, devices = [], raf, caf, canvas, timer, renderer } = {}`.
     - In the `createEngine(game, { … })` call, add `timer` after `acks: …`. That gives `acks: flags.lhTest ? 'steps' : 'frames', timer`. This is #106: under `?fps` the entry passes `performance.now`.

  4. **Build the pipeline before any half enters.** Insert this directly after the line `const caught = fn => { try { fn(); } catch (err) { report(err); } };`:

     ```js
     // overview §4.6: with defineView({ render }) the gfx, compiler, assets, sync and audio exist before any half enters
     const pipe = halves.render ? createPipeline(engine, view, halves.render, { doc, target, canvas, renderer, flags, report }) : null;
     ```

  5. **The render slot and dispose.** Replace the `offRender` registration with the code below. It has no closures, so it is allocation-free. Then add `pipe?.dispose();` at the end of `dispose`, after `offRender();`.

     ```js
     const offRender = engine.onRender(alpha => {
       if (disposed) return;
       reconcile();
       if (pipe) { try { pipe.frame(alpha); } catch (err) { report(err); } } // §4.6: sync.frame before the halves
       for (const e of active.slice()) if (active.some(a => same(a, e))) caught(() => views[e.name]?.frame?.(engine, alpha, view)); // snapshot; skip halves a previous frame exited
       if (pipe) { try { pipe.draw(); } catch (err) { report(err); } } // one renderer.render(scene, camera) after the halves
       view.dt = view.rawDt = 0; refresh();
     });
     ```

     Keep 3a's text for the halves loop line if it differs. Only the two `if (pipe)` lines are new.

- [ ] **Step 4: Run it again** (same command). Expected: PASS, 8 tests.
- [ ] **Step 5: Run the existing boot, hook and loading suites.** These suites must be unchanged: `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/boot.test.mjs test/hook.test.mjs test/loading.test.mjs test/uiDom.test.mjs test/package.test.mjs`. Expected: PASS with the same counts as on the base branch.
- [ ] **Step 6: Prove the slot order red by mutation.** Move the `pipe.frame` line below the halves loop and run `test/render-boot.test.mjs`. Expected: FAIL in "the render slot runs sync.frame(alpha), then…". Restore it and run again. Expected: PASS.
- [ ] **Step 7: Commit.** `git add src/view/boot.js test/render-boot.test.mjs && git commit -m "feat(view): boot builds the render pipeline from defineView({ render }) and draws after the halves"`

---

## Task 9: Browser suite, part 1: pixels, DPR, portrait and resize, no WebGL

**Files:**
- Create: `test/render-fixtures/render.html`, `test/render-fixtures/render.view.js`, `test/e2e-render.test.mjs`

**Interfaces:**
- Consumes: `boot`/`defineView` (Task 8), `snapshot`, `programCount`, `createTiltShift`, and `lion-hawk/playwright` (`launch`, `openGame`).
- Produces: the `window.__fx` hooks:
  - `view`
  - `box`, `hidden`
  - `size()`
  - `pixel(x, y)`
  - `programs()`
  - `warm()`
  - `snap(opts)`
  - `decode(url)`
  - `tilt(on)`
  - `noPost()`

  Task 10 uses the later hooks.

- [ ] **Step 1: Write the fixture page.** Create `test/render-fixtures/render.html`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>render</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  #c { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
  [data-lh-ui-root] { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  [data-lh-ui] button { pointer-events: auto; min-width: 96px; min-height: 56px; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script src="render.bundle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the fixture entry.** Create `test/render-fixtures/render.view.js`:

```js
// Browser entry for test/e2e-render.test.mjs: the countdown game with defineView({ render }). The title view puts a red box
// at the origin in front of the sky and a hidden toon sphere (a material nothing visible uses). window.__fx holds the hooks
// the test calls. Each pixel read draws a frame and reads it in the same task (no preserveDrawingBuffer).
import * as THREE from 'three';
import { boot, defineView } from '../../src/view/boot.js';
import { snapshot } from '../../src/view/render/snapshot.js';
import { programCount } from '../../src/view/render/hygiene.js';
import { createTiltShift } from '../../src/view/render/tiltShift.js';
import countdown from '../fixtures/countdown.js';

const fx = window.__fx = { view: null };
const title = {
  enter(engine, view) {
    fx.view = view;
    if (!view.gfx) return;
    const { scene, camera } = view.gfx;
    camera.position.set(0, 1.5, 5); camera.lookAt(0, 0.5, 0);
    fx.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ff0000' }));
    fx.box.position.y = 0.5; fx.box.castShadow = true;
    fx.hidden = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshToonMaterial({ color: '#00ff00' })); fx.hidden.visible = false;
    scene.add(fx.box, fx.hidden);
  },
};
fx.size = () => {
  const g = fx.view.gfx, gl = g.renderer.getContext();
  return { fov: g.camera.fov, lhFov: g.camera.userData.lhFov, pr: g.renderer.getPixelRatio(), bw: gl.drawingBufferWidth, bh: gl.drawingBufferHeight, w: g.size.w, h: g.size.h, touch: navigator.maxTouchPoints, dpr: devicePixelRatio };
};
fx.pixel = (x, y) => { // CSS px from the top-left
  const g = fx.view.gfx, gl = g.renderer.getContext(), pr = g.renderer.getPixelRatio(), out = new Uint8Array(4);
  window.engine.render(0);
  gl.readPixels(Math.floor(x * pr), gl.drawingBufferHeight - 1 - Math.floor(y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return [...out];
};
fx.programs = () => programCount(fx.view.gfx.renderer);
fx.warm = async () => {
  const g = fx.view.gfx, before = programCount(g.renderer), extra = new THREE.MeshPhongMaterial({ color: '#0000ff' });
  extra.userData.lhUse = 'instanced';
  await g.warm({ materials: [extra] });
  return { before, after: programCount(g.renderer), hidden: fx.hidden.visible };
};
fx.snap = (opts = {}) => {
  const g = fx.view.gfx, info = {}, alpha = g.renderer.getClearAlpha();
  const url = snapshot(g.renderer, fx.box, { size: 64, ...opts, out: info });
  return { url, info, parentOk: fx.box.parent === g.scene, y: fx.box.position.y, target: g.renderer.getRenderTarget(), alphaKept: g.renderer.getClearAlpha() === alpha };
};
fx.decode = async url => {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, centre: [...x.getImageData(img.width >> 1, img.height >> 1, 1, 1).data], corner: [...x.getImageData(0, 0, 1, 1).data] };
};
fx.tilt = on => {
  const g = fx.view.gfx;
  g.post ??= createTiltShift(g.renderer);
  g.post.params.on = on; g.post.params.focus = 3;
  const before = programCount(g.renderer), px = fx.pixel(4, 4);
  return { before, after: programCount(g.renderer), px, err: g.renderer.getContext().getError() };
};
fx.noPost = () => { const g = fx.view.gfx; g.post?.dispose(); g.post = null; };

boot(countdown, defineView({ scenes: { title }, render: { camera: { fov: 60, fovPortrait: 64 }, lights: {} } }), { canvas: document.getElementById('c') });
```

- [ ] **Step 3: Write the failing browser test.** Create `test/e2e-render.test.mjs`:

```js
// Real-Chromium (SwiftShader) checks of the render pipeline (overview §4.6): pixels, the DPR cap on touch, the portrait FOV,
// rotation, warm, snapshot, tilt-shift and the no-WebGL path. Browser suite: run alone under the browser lock (overview §7).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
let server, base, chrome, skip = false;
const TOUCH = () => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 }); // an iPad's touch points
const NO_WEBGL = () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/i.test(type) ? null : get.call(this, type, ...a); }; };
const near = (a, b, tol, msg) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= tol), `${msg}: ${a} vs ${b}`);

before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/render-fixtures/render.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'render.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/render-fixtures/render.html'), 'text/html'], '/render.bundle.js': [path.join(out, 'render.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('desktop: DPR 1, landscape FOV, the red box in the middle, the sky colour in the corner', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual' });
  try {
    const s = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([s.pr, s.bw, s.bh, s.fov, s.lhFov], [1, 1280, 720, 60, 60]);
    const mid = await game.page.evaluate(() => window.__fx.pixel(640, 360));
    assert.ok(mid[0] > 150 && mid[1] < 80 && mid[2] < 80, `red box: ${mid}`);
    near(await game.page.evaluate(() => window.__fx.pixel(4, 4)), [191, 230, 245, 255], 3, 'sky #bfe6f5');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('touch portrait: DPR capped at 1.5, the portrait FOV; rotating gives the landscape FOV and size', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'iPhone 15 Pro portrait', render: 'manual', initScript: TOUCH });
  try {
    const p = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([p.touch, p.dpr, p.pr, p.fov], [5, 3, 1.5, 64]);
    assert.deepEqual([p.bw, p.bh], [Math.floor(393 * 1.5), Math.floor(852 * 1.5)]);
    await game.page.setViewportSize({ width: 852, height: 393 });
    await game.page.waitForFunction(() => window.__fx.size().fov === 60, null, { timeout: 10000 });
    const l = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([l.bw, l.bh, l.w, l.h], [Math.floor(852 * 1.5), Math.floor(393 * 1.5), 852, 393]);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('no WebGL: one render: error, no gfx, and the game still plays (RF1)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual', initScript: NO_WEBGL });
  try {
    const st = await game.page.evaluate(() => ({ gfx: window.__fx.view.gfx, errs: window.engine.errors.map(e => e.message) }));
    assert.equal(st.gfx, null); assert.equal(st.errs.length, 1); assert.match(st.errs[0], /^render: /);
    await game.tap('title.play');
    assert.equal(await game.page.evaluate(() => window.engine.scene.name), 'race');
  } finally { await game.close(); }
});
```

- [ ] **Step 4: Run it, part red.** The fixture exists, so to see red, temporarily set `DEFAULT_DPR.touch` to `2` in `renderer.js`. Then run `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 test/e2e-render.test.mjs`. Expected: FAIL in "touch portrait" (`pr` 2, not 1.5). Restore `1.5`.
- [ ] **Step 5: Run it again** (same command). Expected: PASS, 3 tests. They skip if no Chromium is found; record that in the notes and treat it as a FAIL for this task.
  - If SwiftShader's sky pixel differs by more than 3, record the values in the notes.
  - If the difference comes from the output colour-space path, widen the tolerance with a comment. Do not change the renderer.
- [ ] **Step 6: Commit.** `git add test/render-fixtures/render.html test/render-fixtures/render.view.js test/e2e-render.test.mjs && git commit -m "test(view): browser checks for render pixels, touch DPR, portrait FOV, rotation and no WebGL"`

---

## Task 10: Browser suite, part 2: warm, snapshot and tilt-shift on a real GPU path

**Files:**
- Modify: `test/e2e-render.test.mjs` (append)

**Interfaces:**
- Consumes: the `window.__fx` hooks from Task 9.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests.** Append to `test/e2e-render.test.mjs`:

```js
test('warm compiles the hidden toon sphere and an instanced material, and leaves the sphere hidden (M-12)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual' });
  try {
    await game.page.evaluate(() => window.__fx.pixel(1, 1)); // the visible scene's programs exist first
    const w = await game.page.evaluate(() => window.__fx.warm());
    assert.ok(w.after >= w.before + 2, `programs ${w.before} -> ${w.after}`); assert.equal(w.hidden, false);
    const again = await game.page.evaluate(() => { const n = window.__fx.programs(); window.__fx.pixel(1, 1); return [n, window.__fx.programs()]; });
    assert.equal(again[1], again[0], 'the next frame compiles nothing new');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('snapshot: a PNG with a clear corner and the red box in the middle; renderer and scene untouched (RF5)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual' });
  try {
    const plain = await game.page.evaluate(() => window.__fx.pixel(640, 360));
    const s = await game.page.evaluate(() => window.__fx.snap());
    assert.match(s.url, /^data:image\/png;base64,/); assert.deepEqual([s.info.w, s.info.h], [64, 64]);
    assert.equal(s.parentOk, true); assert.equal(s.y, 0.5); assert.equal(s.target, null); assert.equal(s.alphaKept, true);
    const d = await game.page.evaluate(url => window.__fx.decode(url), s.url);
    assert.equal(d.corner[3], 0, `clear corner: ${d.corner}`); assert.ok(d.centre[3] > 200 && d.centre[0] > d.centre[1] + 40, `red centre: ${d.centre}`);
    const c = await game.page.evaluate(() => window.__fx.snap({ crop: true, outline: { px: 4 } }));
    assert.ok(c.info.w > 8 && c.info.w < 64 + 8 && c.info.h > 8, `cropped ${c.info.w}x${c.info.h}`);
    near(await game.page.evaluate(() => window.__fx.pixel(640, 360)), plain, 0, 'the main view draws as before');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('tilt-shift: off draws exactly the plain frame with no new programs; on adds its three passes without GL errors', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual' });
  try {
    const plain = await game.page.evaluate(() => window.__fx.pixel(4, 4));
    const off = await game.page.evaluate(() => window.__fx.tilt(false));
    assert.equal(off.after, off.before); assert.deepEqual(off.px, plain); assert.equal(off.err, 0);
    const on = await game.page.evaluate(() => window.__fx.tilt(true));
    assert.equal(on.after - on.before, 3, `programs ${on.before} -> ${on.after}`); assert.equal(on.err, 0);
    await game.page.evaluate(() => window.__fx.noPost());
    assert.deepEqual(await game.page.evaluate(() => window.__fx.pixel(4, 4)), plain);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```

- [ ] **Step 2: Run it, part red.** Temporarily change the `finally` in `hygiene.js` `warm` so it no longer hides objects: comment out `for (const o of hidden) o.visible = false;`. Then run `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 test/e2e-render.test.mjs`. Expected: FAIL in "warm compiles…" (`hidden` true). Restore the line.
- [ ] **Step 3: Run it again** (same command). Expected: PASS, 6 tests. **(judgment)**
  - SwiftShader may lack half-float MSAA render targets. If so, the tilt-shift `err` is non-zero. Record the error code in the notes as a field note candidate, then change the test to create the pass with `{ samples: 0 }` and assert `err === 0`. Pig Pens' iPad path keeps `samples: 4`.
  - If `after - before` is not 3, because a program is shared, record the count and assert `>= 2`.
- [ ] **Step 4: Commit.** `git add test/e2e-render.test.mjs && git commit -m "test(view): browser checks for warm, snapshot and tilt-shift"`

---

## Task 11: Full suites, notes and hand-off

**Files:**
- Create: `docs/plans/2026-10-13-phase-3e-render-notes.md`

- [ ] **Step 1: Run every unit file in the engine.** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 $(ls /home/smiller/projects/four43/lion-hawk-engine-3e/test/*.test.mjs | grep -v e2e)`. Expected: PASS. The count is the base count plus 61 (4 + 11 + 10 + 7 + 6 + 7 + 8 + 8).
- [ ] **Step 2: Run each browser file, one at a time.** Run the browser command once per file: `test/e2e.test.mjs`, `test/load-e2e.test.mjs`, `test/touch-e2e.test.mjs`, `test/hold-e2e.test.mjs`, `test/bridge-e2e.test.mjs`, `test/e2e-render.test.mjs`. Each uses `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3e -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 <file>`. Expected: all PASS, with the existing ones unchanged.
- [ ] **Step 3: Write the notes.** Create `docs/plans/2026-10-13-phase-3e-render-notes.md` with these sections:
  - `## Outcome`: commits, test counts, any tolerance changes from Tasks 9–10.
  - `## Contract issues`: copy the section below, with what happened in practice.
  - `## Integrator requests`: copy the section below.
  - `## Field note candidates`: numbered by the integrator from #110. Seed it with:
    - "a renderer that fails is reported and the page runs on (RF1)", if a game relied on throwing;
    - any SwiftShader half-float or tolerance finding.
- [ ] **Step 4: Commit.** `git add docs/plans/2026-10-13-phase-3e-render-notes.md && git commit -m "docs(plan): phase 3e render notes"`

---

## Done when

- **Unit:** every `test/*.test.mjs` except the e2e files passes in the worktree, including the 8 new `render-*` files with 61 tests.
- **Browser:**
  - `test/e2e-render.test.mjs` passes: 6 tests, under the lock.
  - The five existing browser files pass unchanged.
- **Engine source:** `src/core/**`, `src/sim/**`, `src/defs/**` and the integrator files are unchanged (`git diff phase-3 --stat` shows only the files in File Structure).
- **Merge:** `phase-3-render` is merged by the integrator with `--no-ff` at **Wave B (0.9.0)**, together with 3f, 3g and 3h. At that merge, 3f's and 3g's files replace the four stubs.

## Notes stub

The file is `docs/plans/2026-10-13-phase-3e-render-notes.md`. Its sections are `## Outcome`, `## Contract issues`, `## Integrator requests` and `## Field note candidates`. The last is numbered by the integrator from #110.

---

## Contract issues

1. **There is no compiler stub in §4.6.** Boot must build `view.materials`, but the overview lists stubs only for `assets`, `sync` and `audio`. Decision: 3e also creates an inert `src/view/materials/compiler.js`. 3f owns that path and its file wins at the merge, as with the other stubs.
2. **`warm` needs the compiler's materials and their mesh kind, and `preload` needs the scene.**
   - Decision: `warm(renderer, scene, camera, { materials })` places each material on a hidden mesh of the kind named by `material.userData.lhUse`: `'mesh' | 'instanced' | 'instancedColor' | 'skinned'`.
   - `gfx.warm(opts)` adds `view.materials.made()`.
   - `createAssets` receives `gfx`, so `preload` can end with `gfx.warm()`.
   - Asks of 3f:
     - `mc.made()` → an iterable of the compiled materials;
     - set `userData.lhUse` on each;
     - set `userData.lhShared = true` on compiler materials and template geometries, so `disposeTree` keeps them;
     - accept `gfx` in `createAssets`;
     - accept an `undefined` registry, meaning the base library.
3. **The `defineView` `render` block grows by three optional keys:**
   - `render.assets = { manifest, base }`, because boot needs the manifest for `createAssets`;
   - `render.lights.hemiSky`, because Tractor's hemisphere sky colour differs from its background;
   - `render.lights: false`, for no rig.
4. **Additive options and members, no changed signatures:**
   - `createRenderer` options `renderer` (inject) and `target`, and members `size` and `post`;
   - `camera.userData.lhFov`, the base FOV after the portrait rule. 3g's rigs that animate the FOV should add to it;
   - `boot` option `renderer`;
   - `createLightRig` `dispose` and `presets`;
   - the `disposeTree` return count and its `userData.lhShared` rule;
   - `snapshot` options `yaw, pitch, fov, fill, lights, crop, outline, alpha, colorSpace, out`;
   - `createTiltShift` `params.focus`, `setSize`, `dispose`, `targets` and `passes`;
   - `createViewSync` `dispose`, which boot calls if present.
5. **matSplit (M-13).** The brief lists matSplit under 3e's hygiene, but §3.2 and §4.8 make it the compiler's cache key (3f). 3e ships no `splitShared`. A game with its own non-compiler material shared between instanced and plain meshes keeps its own split until it moves to the compiler.
6. **No WebGL.** The spec is silent. Decision: boot reports `render: <message>` once into `engine.errors` and runs on with `view.gfx`, `view.materials`, `view.assets` and `view.sync` set to `null`. View halves must check `view.gfx`. A game e2e that stubs WebGL now sees one error.

## Integrator requests

1. **Exports.** Add to `src/index.view.js` at the Wave B merge:
   ```js
   export { createRenderer } from './view/render/renderer.js';
   export { createLightRig } from './view/render/lights.js';
   export { warm, instancedShadows, disposeTree, programCount } from './view/render/hygiene.js';
   export { snapshot } from './view/render/snapshot.js';
   export { createTiltShift } from './view/render/tiltShift.js';
   ```
2. **The four43 workspace test.** `games/test/workspace.test.mjs` ("engine source does not import three or Rapier yet") fails once 3e merges into `phase-3`, because `src/view/render/*` imports `three` (D9).
   - Narrow it to the sim roots (`src/core`, `src/defs`, `src/sim`, `src/kits/*/sim.js`).
   - Make sure each game builds with `lion-hawk build` (dedupe) before it takes 0.9.0. A `build.py`/esbuild-CLI build would bundle the engine's own copy of three.
3. **Stubs at the Wave B merge.** Take 3f's `src/view/assets/index.js` and `src/view/materials/compiler.js`, and 3g's `src/view/sync/index.js` and `src/view/audio/index.js`, over 3e's stubs. Then rerun `test/render-pipeline.test.mjs` and `test/render-boot.test.mjs`. The stub-shape test `test/render-stubs.test.mjs` should be deleted at that merge, since its "inert" assertions no longer hold. Confirm the 3f asks in Contract issue 2 (`made()`, `userData.lhUse`, `userData.lhShared`, `gfx`).
4. **The timer.** After 3c merges, add one assertion that `boot(…, { timer })` reaches `world.stats.stepMs` (#106). 3e passes `timer` to `createEngine` but cannot observe it before 3c.
5. **CHANGELOG (0.9.0):**
   - "view: `defineView({ render })`, `createRenderer`, `createLightRig`, `warm`, `instancedShadows`, `disposeTree`, `programCount`, `snapshot`, `createTiltShift`;
   - boot builds `view.gfx`/`materials`/`assets`/`sync`/`audio` and `engine.assets`;
   - a renderer that cannot start is reported as `render: …`."
