# Phase 3f: runtime assets and the material compiler — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the view one shared GLB loader and `engine.assets` (preload, cache, clone, anim tables), and a material compiler that turns registry `look` blocks into a small set of cached three.js materials with the `COVERAGE`, `FUR`, `SUBSURFACE` (and `WIND`) shader features ported from the three games.

**Architecture:** Two view-only modules. `src/view/assets/` fetches baked GLBs by manifest key, parses them once with a single `GLTFLoader` + `MeshoptDecoder`, compiles each template's materials through the compiler, and hands out clones (`SkeletonUtils.clone` when skinned). `src/view/materials/` maps a registry material to `MeshPhysicalMaterial` / `MeshStandardMaterial` / `MeshLambertMaterial` by tier (D5), caches one material per (id, tier, user kind, features) so matSplit is structural (M-13), and splices feature GLSL into three r186 chunks in `onBeforeCompile`, with `customProgramCacheKey` = the feature string so every material with the same features shares one program. Variable values are uniforms only.

**Tech Stack:** three 0.186 (`GLTFLoader`, `meshopt_decoder.module.js`, `SkeletonUtils`), `meshoptimizer` (test fixtures only), node:test, Playwright + SwiftShader for the GLSL checks.

**Spec:** `docs/spec.md` (A-4, A-9, A-10, A-11, M-11, M-12, M-13) plus `docs/plans/2026-10-13-phase-3-overview.md` (§4.7, §4.8, deltas D1, D5, D9).

**Worktree / branch:** `~/projects/four43/lion-hawk-engine-3f` on `phase-3-assets`, cut from `phase-3` after Wave A (0.8.0) merges. Merge point: Wave B, engine 0.9.0.

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

### Plan constraints (3f)

- **Ownership:** create or edit only `src/view/assets/**`, `src/view/materials/**`, `test/assets*`, `test/compiler*`, the new helper `test/helpers/glb.mjs`, and the notes file. Never touch `src/view/boot.js`, `src/view/render/**`, `src/sim/**`, `src/defs/**` (read only), `tools/**`, or the integrator files.
- **3e's stubs (controller ruling):** 3e ships inert stubs of `src/view/assets/index.js` and `src/view/materials/compiler.js` so boot can set `view.assets`/`view.materials`. Tasks 5 and 7 replace them wholesale with the same export names (`createAssets`, `createMaterialCompiler`); at merge this plan's files win (overview §4.6).
- **Agreed with 3e (controller ruling):** `warm` reads `mc.made()` → `[{ material, use }]` and `material.userData.lhUse` (`'instanced' | 'plain' | 'skinned'`); shared resources carry `userData.lhShared = true` (compiler cache materials, template geometries) and `disposeTree` skips them; `createAssets` takes `gfx` and ends `preload` with `await gfx.warm()`; matSplit is this compiler's cache key (3e ships no `splitShared`); without WebGL boot sets `view.gfx`, `view.materials` and `view.assets` to `null` and never constructs these modules, so they need no no-GL path. `createMaterialCompiler()` with no registry uses the base library (`defineMaterials({})`).
- **No new runtime imports beyond three:** `three`, `three/addons/loaders/GLTFLoader.js`, `three/addons/libs/meshopt_decoder.module.js`, `three/addons/utils/SkeletonUtils.js`. KTX2 and Draco loaders are never imported by the engine; a game passes configured instances (see Contract issues C1).
- **Shader values are uniforms.** Nothing variable (colours, lengths, fade distances, wind amplitude) is baked into GLSL source, so the program count depends only on the feature set and three's own parameters.
- **Allocation:** `sampleAnimTable` and `blendAnimTable` allocate nothing. `apply`, `clone`, `coverage`, `paint` allocate (create-time only); callers must not call them per frame.
- **Unit command** (worktree root `W=~/projects/four43/lion-hawk-engine-3f`):
  `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$W -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
  This page abbreviates it as **`UNIT <files>`**.
- **Browser command:** `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$W -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>`, abbreviated **`BROWSER <file>`**.

---

## Review Focus

The five inputs or failure modes most likely to bite, and the test that pins each:

1. **A three.js chunk rename or a GLSL error in one tier × feature combination** (the patches compile only inside a real GL context). Pinned by `test/compiler-chunks.test.mjs` "every patched chunk exists…" plus "CHUNKS lists exactly…" (Task 3), and by `test/compiler-e2e.test.mjs` "every feature compiles" with `renderer.debug.onShaderError` on all three tiers (Task 8).
2. **Programs or uniforms shared wrongly**: a per-entity coverage clone or a paint colour that compiles a new program (R1 iPad cost), or clones that share one `uCoverage`, so one tractor's dirt shows on every tractor. Pinned by `test/compiler-apply.test.mjs` "coverage(): a per-entity clone…" (Task 6) and the e2e "more paint and coverage users add no programs" and "a coverage clone's uCoverage reaches the GPU, and only for that clone" (Task 8).
3. **matSplit by construction (M-13):** an instanced and a plain user, or a shadow receiver and a non-receiver, getting the same material. Pinned by `test/compiler.test.mjs` "cache: same options share one material; each user kind gets its own" (Task 5) and `test/compiler-apply.test.mjs` "re-apply and clones keep the authored names; instanced users…" (Task 6).
4. **Loader cache and failure handling:** the same URL fetched twice under overlapping preloads, a failed fetch poisoning the cache so a retry never loads, or `preload` resolving before `gfx.warm()`. Pinned by `test/assets.test.mjs` "preload fetches each URL once…", "unknown keys, failed loads… a failed key can be retried" and "preload resolves only after gfx.warm() resolves" (Task 7).
5. **Animation data on the wrong object:** a skinned clone that shares the template's skeleton (the mixer moves every pig), or an anim-table layout that transposes rotations or does not loop. Pinned by `test/assets.test.mjs` "skinned models clone with SkeletonUtils…" (Task 7) and `test/assets-animTable.test.mjs` "decode keeps fps… (rotation not transposed)" and "sampling lerps… and loops" (Task 2).

---

## File Structure

| File | New/changed | Responsibility |
|---|---|---|
| `src/view/assets/loader.js` | new | The page's one `GLTFLoader` with `MeshoptDecoder`; optional injected KTX2/Draco loaders; `loadGlb(url)` / `loadJson(url)` via `fetch` (works in Node). |
| `src/view/assets/animTable.js` | new | `decodeAnimTable(json)`, `sampleAnimTable(table, clip, t, part, out)`, `blendAnimTable(...)`: baked crowd animation, zero allocation. |
| `src/view/assets/index.js` | new (replaces 3e's stub if present) | `createAssets({ manifest, base, compiler, renderer, gfx, decoders, fetch })`: manifest keys, `Map<url, Promise>` cache, progress, templates (compiled materials, sockets, clips, anim table), clones, dispose. |
| `src/view/materials/chunks.js` | new | `CHUNKS` table, `inject()` chunk guard, the GLSL of `COVERAGE` (dirt, rust, snow, mud), `FUR`, `SUBSURFACE`, `WIND`; `patchShader(sh, features)`. |
| `src/view/materials/fur.js` | new | `furGeometry(geometry, mask, { shells })`: Pig Pens' shell geometry, generic. |
| `src/view/materials/compiler.js` | new (replaces 3e's stub if present) | `createMaterialCompiler(registry, { shading, paint })`: tiers, `look` mapping, cache key, defines, `customProgramCacheKey`, `get`, `paint`, `coverage`, `extend`, `apply`, `furGeometry`, `keys`, `made`, `time`, `dispose`. |
| `test/helpers/glb.mjs` | new | `makeGlb()` (in-memory GLB, optional meshopt and skin), `fakeFetch()`, `makeAnimJson()`. |
| `test/assets-loader.test.mjs` | new | Task 1. |
| `test/assets-animTable.test.mjs` | new | Task 2. |
| `test/compiler-chunks.test.mjs` | new | Task 3. |
| `test/compiler-fur.test.mjs` | new | Task 4. |
| `test/compiler.test.mjs` | new | Task 5. |
| `test/compiler-apply.test.mjs` | new | Task 6. |
| `test/assets.test.mjs` | new | Task 7. |
| `test/compiler-e2e.page.js`, `test/compiler-e2e.test.mjs` | new | Task 8: real WebGL2 compile, program sharing and pixel checks. |
| `docs/plans/2026-10-13-phase-3f-assets-notes.md` | new | Decisions, contract issues, integrator requests, field note candidates. |

Exports (`createAssets`, `createMaterialCompiler`, `furGeometry`, `sampleAnimTable`, plus `blendAnimTable`, `decodeAnimTable`) are added to `src/index.view.js` by the integrator (Integrator request 1). Tests import the modules by path.

---

## Task 0: Worktree and preconditions

**Files:** none.

- [ ] **Step 1: Create the worktree** (after the integrator has merged Wave A, 0.8.0, into `phase-3`):

```bash
git -C ~/projects/four43/lion-hawk-engine worktree add ~/projects/four43/lion-hawk-engine-3f -b phase-3-assets phase-3
cd ~/projects/four43/lion-hawk-engine-3f && npm ci
```

- [ ] **Step 2: Check what this plan builds on.** Expected output: `function true true 186 function`.

```bash
cd ~/projects/four43/lion-hawk-engine-3f && node --input-type=module -e "
const m = await import('./src/defs/materials.js'); const r = m.defineMaterials({});
const t = await import('three'); const mo = await import('meshoptimizer');
console.log(typeof m.defineMaterials, r.has('steel'), !!r.get('steel').coverage, t.REVISION, typeof mo.MeshoptEncoder.encodeVertexBuffer);"
```

If `meshoptimizer` does not resolve, stop and ask the integrator (3a adds it to `dependencies`, overview §3.2). If the base `steel` has no `coverage` block, the tests still pass (they define their own materials), but note it.

---

## Task 1: The shared loader and the GLB test helper

**Files:**
- Create: `test/helpers/glb.mjs`
- Create: `test/assets-loader.test.mjs`
- Create: `src/view/assets/loader.js`

**Interfaces:**
- Consumes: `GLTFLoader` (`parseAsync`, `setMeshoptDecoder`, `setKTX2Loader`, `setDRACOLoader`, fields `meshoptDecoder`, `ktx2Loader`, `dracoLoader`), `MeshoptDecoder`, `MeshoptEncoder` (tests).
- Produces:
  - `sharedLoader({ ktx2 = null, draco = null, renderer = null } = {}) → GLTFLoader` (the same instance every call);
  - `loadGlb(url, { fetch = globalThis.fetch, loader = sharedLoader() } = {}) → Promise<{ gltf, bytes }>`;
  - `loadJson(url, { fetch } = {}) → Promise<any>`;
  - helpers `makeGlb({ parts, empties, anims, skin, meshopt }) → Promise<Uint8Array>`, `fakeFetch(files) → fetch` with `.calls`, `makeAnimJson(parts, clips, fps) → json`.

Why `fetch` and `parseAsync` instead of `loader.loadAsync`: three's `FileLoader` constructs a `ProgressEvent`, which Node lacks, so `loadAsync` throws in Node tests. Fetching the bytes ourselves also gives the byte count and a readable HTTP error.

- [ ] **Step 1: Write the helper**

`test/helpers/glb.mjs`:

```js
// Builds small GLB files in memory for the asset tests: no Kenney pack, no bake.
import { MeshoptEncoder } from 'meshoptimizer';

const pad4 = n => (n + 3) & ~3;
const F32 = 5126, U16 = 5123;

// parts: [{ name, material, pos: number[], nrm?: number[], col?: number[], idx: number[] }] (one mesh node each)
// empties: [{ name, t: [x,y,z], r?: [x,y,z,w] }]; anims: [{ name, node, times: number[], values: number[] }] (translation)
// skin: true adds a 1-joint skin to the first part. meshopt: true stores every buffer view with EXT_meshopt_compression.
export async function makeGlb({ parts, empties = [], anims = [], skin = false, meshopt = false }) {
  const views = [], accessors = [], chunks = []; let off = 0;
  const push = (arr, type, comp, count, target, extra = {}) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push({ off, bytes }); views.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    off = pad4(off + bytes.byteLength);
    accessors.push({ bufferView: views.length - 1, componentType: comp, count, type, ...extra });
    return accessors.length - 1;
  };
  const nodes = [], meshes = [], materials = [], matIndex = new Map();
  const mat = name => { if (!matIndex.has(name)) { matIndex.set(name, materials.length); materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }); } return matIndex.get(name); };
  for (const p of parts) {
    const n = p.pos.length / 3, min = [0, 1, 2].map(k => Math.min(...p.pos.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map(k => Math.max(...p.pos.filter((_, i) => i % 3 === k)));
    const attributes = { POSITION: push(new Float32Array(p.pos), 'VEC3', F32, n, 34962, { min, max }) };
    if (p.nrm) attributes.NORMAL = push(new Float32Array(p.nrm), 'VEC3', F32, n, 34962);
    if (p.col) attributes.COLOR_0 = push(new Float32Array(p.col), 'VEC3', F32, n, 34962);
    const indices = push(new Uint16Array(p.idx.length % 2 ? [...p.idx, 0] : p.idx), 'SCALAR', U16, p.idx.length, 34963);
    meshes.push({ primitives: [{ attributes, indices, material: mat(p.material) }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1 });
  }
  for (const e of empties) nodes.push({ name: e.name, translation: e.t, ...(e.r ? { rotation: e.r } : {}) });
  const animations = anims.map(a => {
    const input = push(new Float32Array(a.times), 'SCALAR', F32, a.times.length, 0, { min: [Math.min(...a.times)], max: [Math.max(...a.times)] });
    const output = push(new Float32Array(a.values), 'VEC3', F32, a.times.length, 0);
    return { name: a.name, samplers: [{ input, output, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: nodes.findIndex(x => x.name === a.node), path: 'translation' } }] };
  });
  const json = { asset: { version: '2.0' }, scene: 0, nodes, meshes, materials, animations, buffers: [], bufferViews: views, accessors };
  let skins;
  if (skin) {
    const p = parts[0], n = p.pos.length / 3;
    const joints = push(new Uint16Array(n * 4), 'VEC4', U16, n, 34962), weights = push(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 'VEC4', F32, n, 34962);
    const ibm = push(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 'MAT4', F32, 1, 0);
    Object.assign(meshes[0].primitives[0].attributes, { JOINTS_0: joints, WEIGHTS_0: weights });
    nodes.push({ name: 'bone' }); const bone = nodes.length - 1;
    nodes[0].skin = 0; skins = [{ joints: [bone], inverseBindMatrices: ibm }]; json.skins = skins;
  }
  json.scenes = [{ nodes: nodes.map((_, i) => i) }];
  const bin = new Uint8Array(pad4(off)); for (const c of chunks) bin.set(c.bytes, c.off);
  if (!meshopt) { json.buffers.push({ byteLength: bin.byteLength }); return pack(json, bin); }
  await MeshoptEncoder.ready;
  // buffer 0: compressed data (in the GLB); buffer 1: fallback with no data (the decoder fills it)
  const enc = []; let eoff = 0;
  for (const v of views) {
    const raw = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength), acc = accessors.find(a => views[a.bufferView] === v);
    const stride = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type] * (acc.componentType === U16 ? 2 : 4);
    const index = v.target === 34963;
    const data = index ? MeshoptEncoder.encodeIndexBuffer(raw.slice(0, acc.count * 2), acc.count, 2)
      : MeshoptEncoder.encodeVertexBuffer(raw, acc.count, pad4(stride));
    enc.push({ off: eoff, data });
    v.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: eoff, byteLength: data.byteLength, byteStride: index ? 2 : pad4(stride), count: acc.count, mode: index ? 'TRIANGLES' : 'ATTRIBUTES' } };
    if (!index) v.byteStride = v.target ? pad4(stride) : undefined;
    v.buffer = 1; eoff = pad4(eoff + data.byteLength);
  }
  const cbin = new Uint8Array(pad4(eoff)); for (const e of enc) cbin.set(e.data, e.off);
  json.buffers.push({ byteLength: cbin.byteLength }, { byteLength: bin.byteLength, extensions: { EXT_meshopt_compression: { fallback: true } } });
  json.extensionsUsed = ['EXT_meshopt_compression']; json.extensionsRequired = ['EXT_meshopt_compression'];
  return pack(json, cbin);
}

function pack(json, bin) {
  const js = new TextEncoder().encode(JSON.stringify(json)), jl = pad4(js.length), bl = pad4(bin.byteLength), total = 12 + 8 + jl + 8 + bl;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); out.fill(0x20, 20, 20 + jl); out.set(js, 20);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); out.set(bin, 28 + jl);
  return out;
}

// A fetch stand-in: files maps url → Uint8Array (served as bytes) or a JSON value. fetch.calls lists every url asked for.
export function fakeFetch(files) {
  const f = async url => {
    f.calls.push(url);
    const v = files[url];
    if (v === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength), json: async () => structuredClone(v) };
  };
  f.calls = [];
  return f;
}

// An <model>.anim.json as the bake writes it (overview §4.3): clips: { name: { dur, frames: [[Matrix4 per part], ...] } }
export function makeAnimJson(parts, clips, fps = 30) {
  const out = { v: 1, fps, parts, clips: {} };
  for (const [name, { dur, frames }] of Object.entries(clips)) {
    const f = new Float32Array(frames.length * parts.length * 12);
    frames.forEach((perPart, i) => perPart.forEach((m, p) => {
      const e = m.elements;
      f.set([e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10], e[12], e[13], e[14]], (i * parts.length + p) * 12);
    }));
    out.clips[name] = { dur, frames: frames.length, data: Buffer.from(f.buffer).toString('base64') };
  }
  return out;
}
```

- [ ] **Step 2: Write the failing test**

`test/assets-loader.test.mjs`:

```js
// A-9: one shared GLTFLoader with the meshopt decoder; optional injected KTX2/Draco loaders; fetch errors name the URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sharedLoader, loadGlb, loadJson } from '../src/view/assets/loader.js';
import { makeGlb, fakeFetch } from './helpers/glb.mjs';

const tri = { name: 'body', material: 'steel', pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2] };

test('one GLTFLoader per page, with the meshopt decoder set (A-9)', () => {
  const a = sharedLoader(), b = sharedLoader();
  assert.equal(a, b);
  assert.ok(a.meshoptDecoder, 'meshopt decoder set');
});

test('a meshopt-compressed GLB decodes to the authored vertices; a loader without the decoder refuses it', async () => {
  const glb = await makeGlb({ parts: [tri], meshopt: true }), fetch = fakeFetch({ '/m.glb': glb });
  const { gltf, bytes } = await loadGlb('/m.glb', { fetch });
  const mesh = gltf.scene.getObjectByName('body');
  assert.deepEqual([...mesh.geometry.attributes.position.array], tri.pos);
  assert.deepEqual([...mesh.geometry.index.array], tri.idx);
  assert.equal(mesh.material.name, 'steel');
  assert.equal(bytes, glb.byteLength);
  await assert.rejects(loadGlb('/m.glb', { fetch, loader: new GLTFLoader() }), /setMeshoptDecoder/); // proves the fixture really is compressed
});

test('fetch failures name the status and the URL; JSON loads', async () => {
  await assert.rejects(loadGlb('/missing.glb', { fetch: fakeFetch({}) }), /HTTP 404 for \/missing\.glb/);
  assert.deepEqual(await loadJson('/a.json', { fetch: fakeFetch({ '/a.json': { x: 1 } }) }), { x: 1 });
});

test('KTX2 and Draco loaders are optional and injected; KTX2 detects support on the renderer', () => { // last: it changes the shared loader
  const renderer = {}, ktx2 = { detectSupport(r) { this.seen = r; return this; } }, draco = {};
  const l = sharedLoader({ ktx2, draco, renderer });
  assert.equal(l, sharedLoader());
  assert.equal(l.ktx2Loader, ktx2);
  assert.equal(l.dracoLoader, draco);
  assert.equal(ktx2.seen, renderer);
});
```

- [ ] **Step 3: Run it; expect FAIL** with `ERR_MODULE_NOT_FOUND` for `src/view/assets/loader.js`.

`UNIT test/assets-loader.test.mjs`

- [ ] **Step 4: Implement**

`src/view/assets/loader.js`:

```js
// Runtime GLB loading (A-9): one GLTFLoader per page, with the meshopt decoder. KTX2 and Draco are optional: the game
// passes configured KTX2Loader / DRACOLoader instances (with their transcoder paths), so the engine bundles neither.
// Bytes are fetched here, not by three's FileLoader, so loading works the same in Node tests (no ProgressEvent there).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let shared = null;
export function sharedLoader({ ktx2 = null, draco = null, renderer = null } = {}) {
  if (!shared) { shared = new GLTFLoader(); shared.setMeshoptDecoder(MeshoptDecoder); }
  if (ktx2 && shared.ktx2Loader !== ktx2) { if (renderer) ktx2.detectSupport(renderer); shared.setKTX2Loader(ktx2); }
  if (draco && shared.dracoLoader !== draco) shared.setDRACOLoader(draco);
  return shared;
}

async function fetchOk(fetch, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function loadGlb(url, { fetch = globalThis.fetch, loader = sharedLoader() } = {}) {
  const bytes = await (await fetchOk(fetch, url)).arrayBuffer();
  const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
  return { gltf, bytes: bytes.byteLength };
}

export async function loadJson(url, { fetch = globalThis.fetch } = {}) {
  return (await fetchOk(fetch, url)).json();
}
```

- [ ] **Step 5: Run; expect PASS** (4 tests). `UNIT test/assets-loader.test.mjs`

- [ ] **Step 6: Prove the meshopt test bites.** Comment out `shared.setMeshoptDecoder(MeshoptDecoder);`, run again: expect 2 failures ("meshopt decoder set", and `setMeshoptDecoder must be called before loading compressed files` in the decode test). Restore the line; run: PASS.

- [ ] **Step 7: Commit**

```bash
git add test/helpers/glb.mjs test/assets-loader.test.mjs src/view/assets/loader.js
git commit -m "feat(view): one shared GLTFLoader with meshopt and optional KTX2/Draco (A-9)"
```

---

## Task 2: Baked animation tables

**Files:**
- Create: `test/assets-animTable.test.mjs`
- Create: `src/view/assets/animTable.js`

**Interfaces:**
- Consumes: the `<model>.anim.json` shape from overview §4.3: `{ v: 1, fps, parts: [names], clips: { <clip>: { dur, frames, data: '<base64 Float32 frames×parts×12>' } } }`.
- Produces:
  - `decodeAnimTable(json) → { fps, parts, clips: { <clip>: { dur, frames, data: Float32Array } } }` (frozen);
  - `sampleAnimTable(table, clip, t, partIndex, outMatrix4) → outMatrix4` (overview §4.7);
  - `blendAnimTable(table, clipA, tA, clipB, tB, k, partIndex, outMatrix4) → outMatrix4` = A·(1 − k) + B·k (the "blend helper" of §4.7).

**Layout decision (Contract issue C7):** the 12 floats per part per frame are `Matrix4.elements` (column-major) without the bottom row, in the order of indices `0,1,2, 4,5,6, 8,9,10, 12,13,14`. Sampling loops (the frame after the last is the first) and lerps element-wise, exactly like Pig Pens' and Tractor's `sampleAnim` (`games/pig-pens/src/gfx.js:37-43`), so crowds look the same after migration. 3d must write this layout.

- [ ] **Step 1: Write the failing test**

`test/assets-animTable.test.mjs`:

```js
// A-11: baked animation tables. Layout (frames × parts × 12, Matrix4.elements minus the bottom row), looping, lerp, blend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { decodeAnimTable, sampleAnimTable, blendAnimTable } from '../src/view/assets/animTable.js';
import { makeAnimJson } from './helpers/glb.mjs';

const at = (x, rot = 0) => new Matrix4().compose(new Vector3(x, 2 * x, -x), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rot), new Vector3(1, 1, 1));
const close = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${msg}: element ${i} ${v} vs ${b[i]}`));
// clip 'walk': 3 frames over 3 s; part 0 moves x 0 → 10 → 20 and turns; part 1 sits at x 100
const json = makeAnimJson(['body', 'head'], {
  walk: { dur: 3, frames: [[at(0, 0.3), at(100)], [at(10, 0.6), at(100)], [at(20, 0.9), at(100)]] },
  idle: { dur: 1, frames: [[at(-5), at(-5)]] },
});
const T = decodeAnimTable(json);

test('decode keeps fps, parts and clips; a frame samples back to the matrix the bake wrote (rotation not transposed)', () => {
  assert.equal(T.fps, 30);
  assert.deepEqual([...T.parts], ['body', 'head']);
  assert.deepEqual(Object.keys(T.clips), ['walk', 'idle']);
  const out = new Matrix4();
  assert.equal(sampleAnimTable(T, 'walk', 0, 0, out), out);
  close(out.elements, at(0, 0.3).elements, 'frame 0 part 0');
  close(sampleAnimTable(T, 'walk', 1, 0, out).elements, at(10, 0.6).elements, 'frame 1 part 0');
  close(sampleAnimTable(T, 'walk', 1, 1, out).elements, at(100).elements, 'frame 1 part 1');
});

test('sampling lerps between frames and loops from the last frame back to the first (Pig Pens sampleAnim)', () => {
  const out = new Matrix4(), x = t => sampleAnimTable(T, 'walk', t, 0, out).elements[12];
  assert.ok(Math.abs(x(0.5) - 5) < 1e-5);
  assert.ok(Math.abs(x(2.5) - 10) < 1e-5, 'frame 2 (20) → frame 0 (0)');
  assert.ok(Math.abs(x(3) - 0) < 1e-5);
  assert.ok(Math.abs(x(-0.5) - 10) < 1e-5, 'negative time wraps');
  assert.ok(Math.abs(x(7) - 10) < 1e-5);
  assert.equal(sampleAnimTable(T, 'idle', 0.7, 1, out).elements[12], -5);
  assert.deepEqual([out.elements[3], out.elements[7], out.elements[11], out.elements[15]], [0, 0, 0, 1]);
});

test('blend is A·(1 − k) + B·k', () => {
  const out = new Matrix4(), x = k => blendAnimTable(T, 'idle', 0, 'walk', 1, k, 0, out).elements[12];
  assert.ok(Math.abs(x(0) + 5) < 1e-5);
  assert.ok(Math.abs(x(1) - 10) < 1e-5);
  assert.ok(Math.abs(x(0.25) - -1.25) < 1e-5); // -5 + (10 - -5) * 0.25
});

test('bad tables and bad lookups throw readable errors', () => {
  assert.throws(() => decodeAnimTable({ ...json, v: 2 }), /animTable: v2 is not supported/);
  assert.throws(() => decodeAnimTable({ ...json, clips: { walk: { ...json.clips.walk, frames: 4 } } }), /clip 'walk' has 72 floats, expected 4 frames × 2 parts × 12 = 96/);
  assert.throws(() => decodeAnimTable({ ...json, clips: { walk: { ...json.clips.walk, dur: 0 } } }), /clip 'walk' needs dur > 0/);
  assert.throws(() => sampleAnimTable(T, 'run', 0, 0, new Matrix4()), /no clip 'run' \(has walk, idle\)/);
  assert.throws(() => sampleAnimTable(T, 'walk', 0, 2, new Matrix4()), /part 2 is out of range 0\.\.1/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` for `src/view/assets/animTable.js`. `UNIT test/assets-animTable.test.mjs`

- [ ] **Step 3: Implement**

`src/view/assets/animTable.js`:

```js
// Baked animation tables (A-11), for instanced crowds that cannot use AnimationMixer. `<model>.anim.json` holds, per
// clip, frames × parts × 12 floats: each part's model-space matrix as Matrix4.elements without the bottom row
// (indices 0,1,2, 4,5,6, 8,9,10, 12,13,14). Sampling loops the clip and lerps element-wise between frames, exactly as
// Pig Pens' and Tractor's sampleAnim did. Sampling allocates nothing.
const COLS = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

export function decodeAnimTable(json) {
  if (!json || json.v !== 1) throw new Error(`animTable: v${json?.v} is not supported (expected v1)`);
  if (!Array.isArray(json.parts) || !json.parts.length) throw new Error('animTable: parts must be a non-empty array of part names');
  const P = json.parts.length, clips = {};
  for (const [name, c] of Object.entries(json.clips ?? {})) {
    if (!(c.dur > 0) || !Number.isInteger(c.frames) || c.frames < 1) throw new Error(`animTable: clip '${name}' needs dur > 0 and frames >= 1 (got dur ${c.dur}, frames ${c.frames})`);
    const bin = atob(c.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const want = c.frames * P * 12;
    if (bytes.length !== want * 4) throw new Error(`animTable: clip '${name}' has ${bytes.length / 4} floats, expected ${c.frames} frames × ${P} parts × 12 = ${want}`);
    clips[name] = Object.freeze({ dur: c.dur, frames: c.frames, data: new Float32Array(bytes.buffer) });
  }
  return Object.freeze({ fps: json.fps, parts: Object.freeze([...json.parts]), clips: Object.freeze(clips) });
}

// out: a THREE.Matrix4 (or anything with a 16-element `elements`)
export function sampleAnimTable(table, clip, t, partIndex, out) {
  const c = table.clips[clip];
  if (c === undefined) throw new Error(`animTable: no clip '${clip}' (has ${Object.keys(table.clips).join(', ')})`);
  const P = table.parts.length;
  if (!(partIndex >= 0 && partIndex < P)) throw new Error(`animTable: part ${partIndex} is out of range 0..${P - 1}`);
  const n = c.frames, f = ((((t / c.dur) % 1) + 1) % 1) * n, fl = Math.floor(f), i0 = fl % n, i1 = (i0 + 1) % n, u = f - fl;
  const d = c.data, a = (i0 * P + partIndex) * 12, b = (i1 * P + partIndex) * 12, o = out.elements;
  for (let k = 0; k < 12; k++) o[COLS[k]] = d[a + k] + (d[b + k] - d[a + k]) * u;
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return out;
}

const TMP = { elements: new Array(16).fill(0) };
// A·(1 − k) + B·k, element-wise (Pig Pens' lerpM blend from the previous clip A to the current clip B)
export function blendAnimTable(table, clipA, tA, clipB, tB, k, partIndex, out) {
  sampleAnimTable(table, clipA, tA, partIndex, TMP);
  sampleAnimTable(table, clipB, tB, partIndex, out);
  const a = TMP.elements, o = out.elements;
  for (let i = 0; i < 16; i++) o[i] = a[i] + (o[i] - a[i]) * k;
  return out;
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the layout test bites.** Change `COLS` to the row-major order `[0, 4, 8, 1, 5, 9, 2, 6, 10, 12, 13, 14]`: expect "decode keeps fps…" to fail on frame 0 part 0 (the 0.3 rad turn is transposed). Then restore `COLS` and change `i1 = (i0 + 1) % n` to `i1 = Math.min(i0 + 1, n - 1)`: expect "sampling lerps… loops" to fail at `x(2.5)`. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/assets-animTable.test.mjs src/view/assets/animTable.js
git commit -m "feat(view): baked animation tables, sample and blend without allocation (A-11)"
```

---

## Task 3 (judgment): Shader chunks and the chunk guard

**Files:**
- Create: `test/compiler-chunks.test.mjs`
- Create: `src/view/materials/chunks.js`

**Interfaces:**
- Consumes: `THREE.ShaderLib.{physical,standard,lambert}` sources and `THREE.REVISION` (r186).
- Produces:
  - `CHUNKS: { COVERAGE, FUR, SUBSURFACE, WIND: { vertex: string[], fragment: string[] } }`;
  - `inject(src, chunk, text, where = 'after' | 'before') → src` (throws `materials: three.js r<rev> has no '#include <chunk>' …`);
  - `patchShader(sh, features: string[]) → sh` (mutates `sh.vertexShader`/`sh.fragmentShader`; applies patches in `CHUNKS` order).

**Decisions to confirm in review:**
- The guard covers every chunk a patch touches: `common`, `worldpos_vertex`, `begin_vertex`, `color_fragment`, `clipping_planes_fragment`, `opaque_fragment`, `lights_fragment_end`, `normal_fragment_begin`. §4.8 names only four of them (Contract issue C9).
- **COVERAGE** (`uCoverage` = dirt, rust, snow, mud, times the material's `coverage` block in `uCoverageAccept`). Dirt is Tractor's `dirtMat.js` formula verbatim (object-space noise, more spots low down). Mud is Pig Pens' `world.js:166-174` formula, with the height taken in **object space** (`y / 1.5`) instead of world height over `scale × 1.5`; on flat ground the two agree, and on a hill the object-space one stays on the pig. Rust (orange blotches) and snow (whitening on up-facing faces, from a world-up normal) are new and small. Every layer is skipped below 0.002, so a clean entity pays only four compares. `COVERAGE_INSTANCED` reads a per-instance `instanceCoverage` vec4 (plus `uCoverage` as a shared floor) and seeds mud by `gl_InstanceID`, so Pig Pens' instanced pigs each get their own blotches.
- **FUR** is Pig Pens' `fur.js` shader with one change: `furMask` is a 0..1 strand-length factor (soft edges) instead of a binary mask plus the `bareMin/bareMax/furFade` box uniforms. A game trims a face by passing a mask that falls to 0 there. Shell 0 (`furShell == 0`) draws untouched, so one material draws base and shells in one draw call. `fwidth` is taken before the branch (derivatives in non-uniform control flow are undefined).
- **SUBSURFACE** is a wrap-lighting term over the directional lights, added to `reflectedLight.directDiffuse` after `lights_fragment_end`; it uses `geometryNormal` and `directionalLights`, which lambert's program also has, but D5 drops it for lambert in the compiler.
- **WIND** is Rally's verge grass (`trackView.js:414-424`) with the hard-coded fade and amplitude moved to `uWindFade`/`uWindAmp` and the time to `uLhTime`, plus its `normal = normalize( vNormal )` lighting fix, guarded by `#ifndef FLAT_SHADED`.
- Pig Pens' eyelids, Tractor's ground rock and Rally's snow stay game patches, through `mc.extend` (Task 6).

- [ ] **Step 1: Write the failing test**

`test/compiler-chunks.test.mjs`:

```js
// Chunk guard (overview §4.8): every three.js chunk a feature patches exists in every tier's shader, the CHUNKS table is
// exactly what each patch needs, and a missing chunk throws naming it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib, REVISION } from 'three';
import { CHUNKS, inject, patchShader } from '../src/view/materials/chunks.js';

const LIB = { physical: ShaderLib.physical, standard: ShaderLib.standard, lambert: ShaderLib.lambert };
const shader = tier => ({ vertexShader: LIB[tier].vertexShader, fragmentShader: LIB[tier].fragmentShader, uniforms: {} });
const ALL = { vertex: [...new Set(Object.values(CHUNKS).flatMap(c => c.vertex))], fragment: [...new Set(Object.values(CHUNKS).flatMap(c => c.fragment))] };

test(`every patched chunk exists in three r${REVISION} for every tier`, () => {
  assert.equal(REVISION, '186', 'three.js moved: re-check every chunk name in src/view/materials/chunks.js, then update this pin');
  for (const [tier, lib] of Object.entries(LIB)) for (const [feature, stages] of Object.entries(CHUNKS)) for (const stage of ['vertex', 'fragment'])
    for (const c of stages[stage]) assert.ok(lib[`${stage}Shader`].includes(`#include <${c}>`), `${tier} ${stage} shader lacks <${c}> (needed by ${feature})`);
});

test('inject throws naming the chunk and the three.js revision', () => {
  assert.throws(() => inject('void main() {}', 'color_fragment', 'x'), new RegExp(`three\\.js r${REVISION} has no '#include <color_fragment>'`));
  assert.equal(inject('a\n#include <common>\nb', 'common', 'X'), 'a\n#include <common>\nX\nb');
  assert.equal(inject('a\n#include <common>\nb', 'common', 'X', 'before'), 'a\nX\n#include <common>\nb');
});

test('CHUNKS lists exactly the chunks each feature patches: removing a listed one throws, removing another does not', () => {
  for (const feature of Object.keys(CHUNKS)) for (const stage of ['vertex', 'fragment']) for (const c of ALL[stage]) {
    const sh = shader('physical'), key = `${stage}Shader`;
    sh[key] = sh[key].replace(`#include <${c}>`, '');
    const listed = CHUNKS[feature][stage].includes(c), run = () => patchShader(sh, [feature]);
    if (listed) assert.throws(run, new RegExp(`<${c}>`), `${feature} patches <${c}> but CHUNKS does not say it throws`);
    else assert.doesNotThrow(run, `${feature} uses <${c}> but CHUNKS.${feature}.${stage} does not list it`);
  }
});

test('each feature declares its uniforms and attributes; patches apply in a fixed order whatever the list order', () => {
  const p = f => patchShader(shader('standard'), f);
  const cov = p(['COVERAGE']);
  assert.match(cov.fragmentShader, /uniform vec4 uCoverage; uniform vec4 uCoverageAccept;/);
  assert.match(cov.vertexShader, /#ifdef COVERAGE_INSTANCED\nattribute vec4 instanceCoverage;/);
  const fur = p(['FUR']);
  assert.match(fur.vertexShader, /attribute vec3 furNormal; attribute float furMask; attribute float furShell; uniform float furLen;/);
  assert.match(fur.fragmentShader, /uniform float furDensity; uniform vec3 furTint;/);
  assert.match(p(['SUBSURFACE']).fragmentShader, /uniform vec3 uSubColor; uniform float uSubStrength;[\s\S]*directionalLights\[ i \]/);
  assert.match(p(['WIND']).vertexShader, /uniform float uLhTime; uniform vec2 uWindFade; uniform vec2 uWindAmp;/);
  const a = p(['WIND', 'FUR', 'COVERAGE']), b = p(['COVERAGE', 'FUR', 'WIND']);
  assert.equal(a.vertexShader, b.vertexShader);
  assert.equal(a.fragmentShader, b.fragmentShader);
  assert.equal(p([]).fragmentShader, LIB.standard.fragmentShader);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` for `src/view/materials/chunks.js`. `UNIT test/compiler-chunks.test.mjs`

- [ ] **Step 3: Implement**

`src/view/materials/chunks.js`:

```js
// Shader patches for the material compiler (M-11). Each feature is a set of GLSL snippets spliced in after (or before) a
// three.js r186 chunk by onBeforeCompile. Every splice goes through inject(), which throws when the chunk is missing, so a
// three.js bump that renames a chunk fails loudly at compile time and in test/compiler-chunks.test.mjs, never silently.
// Variable values are uniforms, never baked into the source: one program per feature set, shared by every material.
import { REVISION } from 'three';

// The chunks each feature patches, per stage. The chunk-guard test walks this table for every tier.
export const CHUNKS = Object.freeze({
  COVERAGE: { vertex: ['common', 'worldpos_vertex'], fragment: ['common', 'color_fragment'] },
  FUR: { vertex: ['common', 'begin_vertex'], fragment: ['common', 'clipping_planes_fragment', 'color_fragment', 'opaque_fragment'] },
  SUBSURFACE: { vertex: [], fragment: ['common', 'lights_fragment_end'] },
  WIND: { vertex: ['common', 'begin_vertex'], fragment: ['normal_fragment_begin'] },
});

export function inject(src, chunk, text, where = 'after') {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`materials: three.js r${REVISION} has no '${tag}' in this shader; update src/view/materials/chunks.js`);
  return src.replace(tag, where === 'before' ? `${text}\n${tag}` : `${tag}\n${text}`);
}

// Value noise shared by the coverage layers (Tractor's dirtMat.js hash and Pig Pens' mud noise, one copy).
const NOISE = `
float lhH( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
float lhN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( lhH( i ), lhH( i + vec3( 1, 0, 0 ) ), f.x ), mix( lhH( i + vec3( 0, 1, 0 ) ), lhH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( lhH( i + vec3( 0, 0, 1 ) ), lhH( i + vec3( 1, 0, 1 ) ), f.x ), mix( lhH( i + vec3( 0, 1, 1 ) ), lhH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;

// COVERAGE: uCoverage = (dirt, rust, snow, mud), each scaled by the material's coverage block (uCoverageAccept). The noise
// is taken in the mesh's own space, so spots ride with the vehicle or animal. COVERAGE_INSTANCED reads the per-instance
// attribute instanceCoverage instead (plus uCoverage as a shared floor) and seeds the mud pattern by gl_InstanceID.
function coverage(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', `varying vec3 vLhP; varying float vLhUp;
#ifdef COVERAGE_INSTANCED
attribute vec4 instanceCoverage; varying vec4 vLhCov; varying float vLhSeed;
#endif`);
  sh.vertexShader = inject(sh.vertexShader, 'worldpos_vertex', `vLhP = transformed;
#ifdef USE_INSTANCING
vLhUp = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal ).y;
#else
vLhUp = normalize( mat3( modelMatrix ) * objectNormal ).y;
#endif
#ifdef COVERAGE_INSTANCED
vLhCov = instanceCoverage; vLhSeed = float( gl_InstanceID );
#endif`);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `uniform vec4 uCoverage; uniform vec4 uCoverageAccept; varying vec3 vLhP; varying float vLhUp;
#ifdef COVERAGE_INSTANCED
varying vec4 vLhCov; varying float vLhSeed;
#endif${NOISE}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `{
#ifdef COVERAGE_INSTANCED
  vec4 lhCov = clamp( uCoverage + vLhCov, 0.0, 1.0 ) * uCoverageAccept; float lhSeed = vLhSeed;
#else
  vec4 lhCov = uCoverage * uCoverageAccept; float lhSeed = 0.0;
#endif
  if ( lhCov.x > 0.002 ) { // dirt (Tractor's dirtMat.js): brown spots, more of them low down
    float n = lhN( vLhP * 2.7 ) * 0.65 + lhN( vLhP * 9.0 ) * 0.35;
    float low = clamp( 1.2 - vLhP.y * 0.45, 0.0, 1.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.30, 0.19, 0.10 ), step( n, lhCov.x * 0.8 * low ) * 0.9 );
  }
  if ( lhCov.y > 0.002 ) { // rust: orange-brown blotches
    float n = lhN( vLhP * 5.0 + 17.0 ) * 0.7 + lhN( vLhP * 13.0 ) * 0.3;
    vec3 rc = mix( vec3( 0.36, 0.14, 0.05 ), vec3( 0.55, 0.27, 0.09 ), lhN( vLhP * 21.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, rc, smoothstep( 1.0 - lhCov.y * 0.7, 1.05 - lhCov.y * 0.7, n ) );
  }
  if ( lhCov.z > 0.002 ) { // snow: settles on faces that point up
    float n = lhN( vLhP * 6.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.95, 1.0 ), smoothstep( 1.0 - lhCov.z, 1.15 - lhCov.z, vLhUp * 0.85 + n * 0.15 ) );
  }
  if ( lhCov.w > 0.002 ) { // mud (Pig Pens' pigs): blotches that creep up from the feet as the level rises
    vec3 mp = vLhP * 2.3 + vec3( lhSeed * 31.7, lhSeed * 17.3, lhSeed * 7.1 );
    float h = clamp( vLhP.y / 1.5, 0.0, 1.0 );
    float n = lhN( mp ) * 0.75 + lhN( mp * 2.4 ) * 0.25;
    float th = 1.22 - lhCov.w * 0.98;
    float m = smoothstep( th, th + 0.07, n * 0.6 + ( 1.0 - h ) * 0.6 );
    vec3 mc = mix( vec3( 0.15, 0.072, 0.028 ), vec3( 0.26, 0.135, 0.058 ), lhN( mp * 4.0 ) ) * ( 0.75 + 0.25 * h );
    diffuseColor.rgb = mix( diffuseColor.rgb, mc, m );
  }
}`);
}

// FUR (Pig Pens' fur.js): shells are copies of the mesh pushed out along a smoothed normal (furGeometry). Shell 0 is the
// mesh itself and draws untouched; outer shells keep only fragments inside a strand of 3D cell noise. furMask (0..1)
// scales strand length per vertex, so a 0 mask is bare skin and a soft mask fades the fur out.
function fur(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', `attribute vec3 furNormal; attribute float furMask; attribute float furShell; uniform float furLen;
varying vec3 vFurP; varying float vFurMask; varying float vFurShell;`);
  sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', `vFurP = position; vFurMask = furMask; vFurShell = furShell;
transformed += ( furNormal * furLen - vec3( 0.0, 0.25 * furLen * furShell, 0.0 ) ) * furShell * furMask; // tips droop a little`);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `uniform float furDensity; uniform vec3 furTint; varying vec3 vFurP; varying float vFurMask; varying float vFurShell;
vec3 furHash( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.xxy + p.yxx ) * p.zyx ); }`);
  sh.fragmentShader = inject(sh.fragmentShader, 'clipping_planes_fragment', `float furAA = length( fwidth( vFurP * furDensity ) ); // far away, strands fatten into soft shells rather than shimmer
if ( vFurShell > 0.0 ) {
  if ( vFurMask < 0.02 ) discard;
  vec3 fp = vFurP * furDensity, fc = floor( fp ); float best = 9.0, h = 0.0;
  for ( int i = 0; i < 8; i ++ ) { // nearest strand in a jittered 3D grid; each strand has its own length and thins to its tip
    vec3 c = fc + vec3( i & 1, ( i >> 1 ) & 1, i >> 2 ) - 1.0 + step( 0.5, fract( fp ) );
    vec3 r = furHash( c ); float d = length( fp - ( c + r * 0.8 + 0.1 ) );
    if ( d < best ) { best = d; h = ( 0.45 + 0.55 * r.x ) * vFurMask; }
  }
  if ( vFurShell > h + furAA * 0.3 || best > 0.62 * ( 1.0 - vFurShell / h ) + furAA * 0.5 ) discard;
}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `if ( vFurShell > 0.0 ) diffuseColor.rgb *= mix( vec3( 0.72 ), 1.06 * furTint, vFurShell ); // darker at the roots`);
  sh.fragmentShader = inject(sh.fragmentShader, 'opaque_fragment', `if ( vFurShell > 0.0 ) {
  float furRim = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 2.0 );
  outgoingLight += diffuseColor.rgb * furRim * vFurShell * 0.35;
}`, 'before');
}

// SUBSURFACE: a wrap-lighting term per directional light, so light bleeds past the terminator (skin, wax, leaves).
// Physical and standard only (the compiler drops it for lambert).
function subsurface(sh) {
  sh.fragmentShader = inject(sh.fragmentShader, 'common', 'uniform vec3 uSubColor; uniform float uSubStrength;');
  sh.fragmentShader = inject(sh.fragmentShader, 'lights_fragment_end', `#if NUM_DIR_LIGHTS > 0
for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
  float lhNL = dot( geometryNormal, directionalLights[ i ].direction );
  float lhWrap = max( 0.0, ( lhNL + 0.5 ) / 1.5 ) - max( 0.0, lhNL );
  reflectedLight.directDiffuse += uSubColor * uSubStrength * lhWrap * directionalLights[ i ].color * diffuseColor.rgb;
}
#endif`);
}

// WIND (Rally's verge grass, trackView.js): blades sway by height squared, phase from the instance's world position, and
// shrink to nothing between uWindFade.x and .y metres from the camera (off when y <= x). Lit as facing their normal from
// both sides, so double-sided blades have no black undersides.
function wind(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', 'uniform float uLhTime; uniform vec2 uWindFade; uniform vec2 uWindAmp;');
  sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', `#ifdef USE_INSTANCING
vec4 lhRoot = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#else
vec4 lhRoot = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif
if ( uWindFade.y > uWindFade.x ) transformed *= 1.0 - smoothstep( uWindFade.x, uWindFade.y, distance( lhRoot.xz, cameraPosition.xz ) );
float lhPh = lhRoot.x * 0.37 + lhRoot.z * 0.23, lhHh = transformed.y * transformed.y;
transformed.x += sin( uLhTime * 1.7 + lhPh ) * uWindAmp.x * lhHh;
transformed.z += sin( uLhTime * 1.1 + lhPh * 1.3 ) * uWindAmp.y * lhHh;`);
  sh.fragmentShader = inject(sh.fragmentShader, 'normal_fragment_begin', `#ifndef FLAT_SHADED
normal = normalize( vNormal );
#endif`);
}

const PATCH = { COVERAGE: coverage, FUR: fur, SUBSURFACE: subsurface, WIND: wind };

// Applies the features in a fixed order (CHUNKS order), whatever order they are listed in.
export function patchShader(sh, features) {
  for (const f of Object.keys(CHUNKS)) if (features.includes(f)) PATCH[f](sh);
  return sh;
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the table test bites.** Remove `'worldpos_vertex'` from `CHUNKS.COVERAGE.vertex`: expect "CHUNKS lists exactly…" to fail with `COVERAGE uses <worldpos_vertex> but CHUNKS.COVERAGE.vertex does not list it`. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/compiler-chunks.test.mjs src/view/materials/chunks.js
git commit -m "feat(view): coverage, fur, subsurface and wind shader patches with a three r186 chunk guard (M-11)"
```

---

## Task 4: Fur shell geometry

**Files:**
- Create: `test/compiler-fur.test.mjs`
- Create: `src/view/materials/fur.js`

**Interfaces:**
- Consumes: a `BufferGeometry` with `position` and `normal` (indexed or not, interleaved attributes allowed).
- Produces: `furGeometry(geometry, mask, { shells = 10 } = {}) → BufferGeometry` with every source attribute repeated `shells + 1` times, plus `furNormal` (vec3, normals averaged over shared positions), `furMask` (float, `mask(i)` clamped to 0..1), `furShell` (float, `c / shells`), one index, groups `[base → material 0, shells → material 1]`, `userData.fur = { shells }`. `shells` is 1..32 (the registry's `look.fur.shells` range).

- [ ] **Step 1: Write the failing test**

`test/compiler-fur.test.mjs`:

```js
// furGeometry: Pig Pens' shell geometry, made generic (any attributes, indexed or not, a 0..1 mask).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three';
import { furGeometry } from '../src/view/materials/fur.js';

test('shells repeat every attribute and the index; furShell steps 0, 1/shells … 1; two groups', () => {
  const box = new BoxGeometry(1, 1, 1), n = box.attributes.position.count, ni = box.index.count;
  box.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  const g = furGeometry(box, () => 1, { shells: 4 });
  for (const k of ['position', 'normal', 'uv', 'color']) assert.equal(g.attributes[k].count, n * 5, k);
  assert.equal(g.index.count, ni * 5);
  assert.deepEqual(g.groups, [{ start: 0, count: ni, materialIndex: 0 }, { start: ni, count: ni * 4, materialIndex: 1 }]);
  assert.deepEqual([0, 1, 2, 3, 4].map(c => g.attributes.furShell.getX(c * n)), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(g.index.getX(ni * 2), box.index.getX(0) + 2 * n, 'shell c indexes its own copy');
  assert.deepEqual([...g.attributes.position.array.slice(n * 3 * 3, n * 3 * 3 + 3)], [...box.attributes.position.array.slice(0, 3)]);
  assert.deepEqual(g.userData.fur, { shells: 4 });
  assert.equal(furGeometry(box, () => 1).attributes.furShell.count, n * 11, 'default 10 shells');
});

test('furNormal averages the normals of vertices that share a position; furMask is the clamped mask', () => {
  const box = new BoxGeometry(1, 1, 1), g = furGeometry(box, i => (box.attributes.position.getY(i) > 0 ? 3 : -1), { shells: 1 });
  const s = 1 / Math.sqrt(3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.abs(g.attributes.furNormal.array[i]) - s) < 1e-6, 'a cube corner points out diagonally');
  for (let i = 0; i < box.attributes.position.count; i++) assert.equal(g.attributes.furMask.getX(i), box.attributes.position.getY(i) > 0 ? 1 : 0);
});

test('non-indexed geometry works; bad input throws', () => {
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  tri.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  assert.deepEqual([...furGeometry(tri, () => 1, { shells: 2 }).index.array], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => furGeometry(tri, () => 1, { shells: 0 }), /shells must be an integer 1\.\.32 \(got 0\)/);
  assert.throws(() => furGeometry(tri, 1), /mask\(i\) must be a function/);
  const bare = new BufferGeometry(); bare.setAttribute('position', tri.attributes.position);
  assert.throws(() => furGeometry(bare, () => 1), /needs position and normal attributes/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` for `src/view/materials/fur.js`. `UNIT test/compiler-fur.test.mjs`

- [ ] **Step 3: Implement**

`src/view/materials/fur.js`:

```js
// Shell fur geometry (Pig Pens' fur.js, made generic): the mesh is repeated `shells` more times in one geometry, and the
// FUR program pushes copy c out by c/shells of the fur length along a smoothed normal. Copy 0 is the mesh itself.
// One index buffer, so an InstancedMesh draws base and shells with one set of instance matrices and colours.
import { BufferGeometry, BufferAttribute } from 'three';

const GET = ['getX', 'getY', 'getZ', 'getW'];
const flat = a => { // interleaved (meshopt GLBs) → a plain Float32Array
  if (!a.isInterleavedBufferAttribute) return a.array;
  const o = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) o[i * a.itemSize + k] = a[GET[k]](i);
  return o;
};

// geometry: position + normal (indexed or not); mask(i) → 0..1 fur length factor for vertex i (0 = bare)
export function furGeometry(geometry, mask, { shells = 10 } = {}) {
  if (!Number.isInteger(shells) || shells < 1 || shells > 32) throw new Error(`furGeometry: shells must be an integer 1..32 (got ${shells})`);
  if (typeof mask !== 'function') throw new Error('furGeometry: mask(i) must be a function returning 0..1 per vertex');
  const pos = geometry.attributes.position, nrm = geometry.attributes.normal;
  if (!pos || !nrm) throw new Error('furGeometry: the geometry needs position and normal attributes');
  const n = pos.count, L = shells + 1;
  const idx = geometry.index ? geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  // average normals over vertices that share a position, so shells stay closed across hard edges
  const sum = new Map(), key = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < n; i++) { const k = key(i), s = sum.get(k) ?? [0, 0, 0]; s[0] += nrm.getX(i); s[1] += nrm.getY(i); s[2] += nrm.getZ(i); sum.set(k, s); }
  const out = new BufferGeometry();
  const big = (a, size, normalized = false) => { const o = new a.constructor(n * L * size); for (let c = 0; c < L; c++) o.set(a, c * n * size); return new BufferAttribute(o, size, normalized); };
  for (const [name, a] of Object.entries(geometry.attributes)) out.setAttribute(name, big(flat(a), a.itemSize, a.isInterleavedBufferAttribute ? false : a.normalized));
  const fn = new Float32Array(n * 3), fm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1;
    fn[i * 3] = s[0] / l; fn[i * 3 + 1] = s[1] / l; fn[i * 3 + 2] = s[2] / l;
    fm[i] = Math.min(1, Math.max(0, Number(mask(i)) || 0));
  }
  out.setAttribute('furNormal', big(fn, 3));
  out.setAttribute('furMask', big(fm, 1));
  const sh = new Float32Array(n * L); for (let c = 0; c < L; c++) sh.fill(c / shells, c * n, (c + 1) * n);
  out.setAttribute('furShell', new BufferAttribute(sh, 1));
  const ix = new Uint32Array(idx.length * L); for (let c = 0; c < L; c++) for (let j = 0; j < idx.length; j++) ix[c * idx.length + j] = idx[j] + c * n;
  out.setIndex(new BufferAttribute(ix, 1));
  out.addGroup(0, idx.length, 0);                   // the mesh itself (material 0 when a game passes an array)
  out.addGroup(idx.length, idx.length * shells, 1); // the shells (material 1)
  out.userData.fur = { shells };
  return out;
}
```

- [ ] **Step 4: Run; expect PASS** (3 tests).

- [ ] **Step 5: Prove the mask test bites.** Replace `Math.min(1, Math.max(0, Number(mask(i)) || 0))` with `Number(mask(i)) || 0`: expect "furNormal averages… furMask is the clamped mask" to fail (3 ≠ 1). Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/compiler-fur.test.mjs src/view/materials/fur.js
git commit -m "feat(view): furGeometry, Pig Pens' shell fur made generic"
```

---

## Task 5: Material compiler core — tiers, look, cache key, defines

**Files:**
- Create: `test/compiler.test.mjs`
- Create (or replace 3e's stub): `src/view/materials/compiler.js`

**Interfaces:**
- Consumes: `defineMaterials` (default registry) and the 3b registry (`get(id)` → resolved frozen material, throws `materials: unknown material '<id>'`; `has(id)`), `patchShader`/`inject` (Task 3), `furGeometry` (Task 4).
- Produces (this task):
  - `createMaterialCompiler(registry, { shading = 'physical', paint: { base = 'steel' } = {} } = {}) → mc`;
  - `mc.get(id, { instanced = false, vertexColors = false, skinned = false, receiveShadow = true, map = null, fur = true, wind = null } = {}) → THREE.Material`;
  - `mc.shading`, `mc.time` (`{ value }`, the shared `uLhTime` uniform), `mc.furGeometry(geometry, mask, opts)`, `mc.keys() → string[]`, `mc.made() → [{ material, use }]` (for 3e's `warm`), `mc.dispose()`;
  - `createMaterialCompiler(undefined)` uses `defineMaterials({})` (the base library);
  - on every compiled material: `name = id`, `defines[FEATURE] = ''`, `customProgramCacheKey() → 'lh:<features joined by +>'` (three's default when there are no features), `userData.lhUse = 'instanced' | 'skinned' | 'plain'`, `userData.lhShared = true`, and JSON-safe `userData.lh = { id, key, tier, instanced, vertexColors, skinned, receiveShadow, features }`.

**Cache key** (§4.8): `id|tier|instanced|vertexColors|skinned|receiveShadow|map.uuid|features`, booleans as 0/1, plus `|wind:<fade>:<amp>` for windy materials. `receiveShadow` and `skinned` are not material properties in three r186; they are in the key so each kind of user has its own material (M-13: three otherwise re-resolves the program at every switch between users, Tractor's `matSplit.js` finding).

**Feature rules:** `COVERAGE` when the registry entry has a `coverage` block; `FUR` when `look.fur` and `opts.fur !== false`; `SUBSURFACE` when `look.subsurface` and the tier is not lambert (D5); `WIND` when `opts.wind` is given. `look` fields map onto the tier's class through a fixed list per tier; fields the class lacks are dropped (D5). With `vertexColors`, `color` is white (D5: vertex colours replace `look.color`). A `map` is kept (the barn's texture).

- [ ] **Step 1: Write the failing test**

`test/compiler.test.mjs`:

```js
// M-11..M-13, D5: tiers, look → parameters, vertex colours, the cache key (matSplit), defines and program keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, DoubleSide, ShaderLib, Texture } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ff0000', metalness: 0.2, roughness: 0.7, clearcoat: 0.5, side: 'double' }, coverage: { dirt: 1, mud: 0.5 } },
  testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 10, density: 34, tint: '#ffeecc' } } },
  testWax: { look: { color: '#ffffff', subsurface: { color: '#ff8866', strength: 0.6 } } },
  testBare: { look: { color: '#808080' } },
});
const LIB = { physical: ShaderLib.physical, standard: ShaderLib.standard, lambert: ShaderLib.lambert };
const compile = (m, tier) => { const sh = { vertexShader: LIB[tier].vertexShader, fragmentShader: LIB[tier].fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };

test('one base class per tier (D5); a bad tier, registry or paint base throws', () => {
  assert.ok(createMaterialCompiler(REG).get('testMud').isMeshPhysicalMaterial, 'physical is the default');
  assert.ok(createMaterialCompiler(REG, { shading: 'standard' }).get('testMud').isMeshStandardMaterial);
  assert.ok(createMaterialCompiler(REG, { shading: 'lambert' }).get('testMud').isMeshLambertMaterial);
  assert.throws(() => createMaterialCompiler(REG, { shading: 'toon' }), /shading must be 'physical' \| 'standard' \| 'lambert' \(got "toon"\)/);
  assert.throws(() => createMaterialCompiler({}), /needs a material registry/);
  assert.ok(createMaterialCompiler(undefined).get('steel').isMeshPhysicalMaterial, 'no registry: the base library');
  assert.throws(() => createMaterialCompiler(REG, { paint: { base: 'unobtainium' } }), /paint base 'unobtainium' is not in the registry/);
  assert.throws(() => createMaterialCompiler(REG).get('nope'), /unknown material 'nope'/);
});

test('look maps onto the class; fields the tier lacks are dropped', () => {
  const p = createMaterialCompiler(REG).get('testMud'), s = createMaterialCompiler(REG, { shading: 'standard' }).get('testMud');
  const l = createMaterialCompiler(REG, { shading: 'lambert' }).get('testMud');
  assert.ok(p.color.equals(new Color('#ff0000')));
  assert.equal(p.metalness, 0.2); assert.equal(p.roughness, 0.7); assert.equal(p.clearcoat, 0.5); assert.equal(p.side, DoubleSide);
  assert.equal(s.roughness, 0.7); assert.equal('clearcoat' in s, false, 'standard has no clearcoat');
  assert.equal(l.metalness, undefined); assert.equal(l.side, DoubleSide); assert.ok(l.color.equals(new Color('#ff0000')));
  assert.equal(p.name, 'testMud');
});

test('vertex colours replace look.color (D5); a map is kept', () => {
  const mc = createMaterialCompiler(REG), map = new Texture();
  const v = mc.get('testMud', { vertexColors: true });
  assert.equal(v.vertexColors, true); assert.ok(v.color.equals(new Color(1, 1, 1)));
  assert.equal(mc.get('testMud').vertexColors, false);
  assert.equal(mc.get('testMud', { map }).map, map);
});

test('cache: same options share one material; each user kind gets its own (M-13 matSplit, always on)', () => {
  const mc = createMaterialCompiler(REG), a = mc.get('testMud');
  assert.equal(mc.get('testMud', {}), a);
  assert.equal(mc.get('testMud', { receiveShadow: true, instanced: false }), a, 'defaults: receiveShadow true, plain');
  const kinds = [{ instanced: true }, { skinned: true }, { receiveShadow: false }, { vertexColors: true }, { map: new Texture() }];
  const ms = kinds.map(k => mc.get('testMud', k));
  assert.equal(new Set([a, ...ms]).size, 6);
  assert.equal(a.userData.lh.key, 'testMud|physical|0|0|0|1||COVERAGE');
  assert.equal(ms[0].userData.lh.key, 'testMud|physical|1|0|0|1||COVERAGE');
  assert.equal(ms[0].userData.lh.instanced, true);
  assert.deepEqual(mc.keys(), [a, ...ms].map(m => m.userData.lh.key));
  assert.deepEqual(mc.made().map(x => x.material), [a, ...ms]);
  assert.deepEqual(mc.made().map(x => x.use), ['plain', 'instanced', 'skinned', 'plain', 'plain', 'plain']);
  assert.equal(a.userData.lhShared, true);
});

test('defines and program keys follow the material (M-11); SUBSURFACE is dropped for lambert', () => {
  for (const tier of ['physical', 'standard', 'lambert']) {
    const mc = createMaterialCompiler(REG, { shading: tier });
    const mud = mc.get('testMud'), fur = mc.get('testFur'), wax = mc.get('testWax'), bare = mc.get('testBare');
    assert.equal(mud.defines.COVERAGE, ''); assert.equal(mud.customProgramCacheKey(), 'lh:COVERAGE');
    assert.equal(fur.defines.FUR, ''); assert.equal(fur.customProgramCacheKey(), 'lh:FUR');
    assert.equal(mc.get('testFur', { fur: false }).defines.FUR, undefined, 'fur: false (no shells in the geometry) drops FUR');
    if (tier === 'lambert') { assert.equal(wax.defines.SUBSURFACE, undefined); assert.doesNotMatch(wax.customProgramCacheKey(), /^lh:/); }
    else { assert.equal(wax.defines.SUBSURFACE, ''); assert.equal(wax.customProgramCacheKey(), 'lh:SUBSURFACE'); }
    assert.doesNotMatch(bare.customProgramCacheKey(), /^lh:/, 'no features: three.js default program key');
    if (tier === 'physical') assert.equal(mud.defines.PHYSICAL, '', 'the class defines survive');
  }
});

test('onBeforeCompile hands the material its own uniform objects, with the registry values', () => {
  const mc = createMaterialCompiler(REG), mud = compile(mc.get('testMud'), 'physical');
  assert.deepEqual(mud.uniforms.uCoverageAccept.value.toArray(), [1, 0, 0, 0.5]);
  assert.deepEqual(mud.uniforms.uCoverage.value.toArray(), [0, 0, 0, 0]);
  assert.match(mud.fragmentShader, /uniform vec4 uCoverage;/);
  const fur = compile(mc.get('testFur'), 'physical');
  assert.equal(fur.uniforms.furLen.value, 0.07); assert.equal(fur.uniforms.furDensity.value, 34);
  assert.ok(fur.uniforms.furTint.value.equals(new Color('#ffeecc')));
  const wax = compile(mc.get('testWax'), 'physical');
  assert.ok(wax.uniforms.uSubColor.value.equals(new Color('#ff8866'))); assert.equal(wax.uniforms.uSubStrength.value, 0.6);
  assert.notEqual(compile(mc.get('testMud', { instanced: true }), 'physical').uniforms.uCoverage, mud.uniforms.uCoverage, 'per material, not per program');
});

test('wind: one shared clock (mc.time), fade and amplitude in the key', () => {
  const mc = createMaterialCompiler(REG, { shading: 'standard' });
  const a = mc.get('testBare', { instanced: true, wind: { fade: [30, 60] } }), b = mc.get('testBare', { instanced: true, wind: { fade: [20, 40], amp: [0.2, 0.1] } });
  assert.notEqual(a, b);
  assert.equal(a.userData.lh.key, 'testBare|standard|1|0|0|1||WIND|wind:30,60:0.12,0.08');
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey(), 'one program');
  const sa = compile(a, 'standard'), sb = compile(b, 'standard');
  assert.equal(sa.uniforms.uLhTime, mc.time); assert.equal(sb.uniforms.uLhTime, mc.time);
  assert.deepEqual(sb.uniforms.uWindAmp.value.toArray(), [0.2, 0.1]);
});

test('dispose disposes every cached material and empties the cache', () => {
  const mc = createMaterialCompiler(REG), m = mc.get('testMud');
  let n = 0; m.addEventListener('dispose', () => n++);
  mc.dispose();
  assert.equal(n, 1); assert.deepEqual(mc.keys(), []);
  assert.notEqual(mc.get('testMud'), m);
});

test('mc.furGeometry is furGeometry', () => {
  const mc = createMaterialCompiler(REG), box = new BoxGeometry();
  assert.deepEqual(mc.furGeometry(box, () => 1, { shells: 3 }).attributes.furShell.array, furGeometry(box, () => 1, { shells: 3 }).attributes.furShell.array);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` for `src/view/materials/compiler.js` (or, with 3e's stub present, assertion failures from its inert returns). `UNIT test/compiler.test.mjs`

- [ ] **Step 3: Implement**

`src/view/materials/compiler.js`:

```js
// Material compiler (M-11..M-13, D5). A registry material's `look` becomes one three.js material per
// (id, tier, user kind, features), cached, so every mesh that draws `steel` the same way shares one material and every
// material with the same feature set shares one shader program (customProgramCacheKey). Instanced and plain users,
// skinned users and shadow receivers get separate materials by construction (matSplit, M-13).
import { MeshPhysicalMaterial, MeshStandardMaterial, MeshLambertMaterial, Color, Vector2, Vector4, DoubleSide, FrontSide } from 'three';
import { patchShader, inject } from './chunks.js';
import { furGeometry } from './fur.js';
import { defineMaterials } from '../../defs/materials.js';

const TIERS = { physical: MeshPhysicalMaterial, standard: MeshStandardMaterial, lambert: MeshLambertMaterial };
const BASIC = ['color', 'emissive', 'emissiveIntensity', 'opacity', 'transparent', 'flatShading', 'side'];
const PARAMS = { lambert: BASIC, standard: [...BASIC, 'metalness', 'roughness'] };
PARAMS.physical = [...PARAMS.standard, 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'transmission', 'ior', 'thickness'];
const COLORS = new Set(['color', 'emissive', 'sheenColor']);
const WIND_AMP = [0.12, 0.08];

// material → { id, o, features, extras, uniforms }. clone() drops onBeforeCompile and the defines, so install() redoes them.
const STATE = new WeakMap();

function install(m, st) {
  m.defines = { ...(m.defines ?? {}) };
  for (const f of st.features) m.defines[f] = '';
  if (st.features.length || st.extras.length) {
    const key = `lh:${st.features.join('+')}${st.extras.map(x => `|x:${x.name}`).join('')}`;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, st.uniforms);
      patchShader(sh, st.features);
      for (const x of st.extras) x.patch(sh, inject);
    };
    m.customProgramCacheKey = () => key;
  }
  STATE.set(m, st);
  return m;
}

export function createMaterialCompiler(registry = defineMaterials({}), { shading = 'physical', paint: { base: paintBase = 'steel' } = {} } = {}) {
  if (!Object.hasOwn(TIERS, shading)) throw new Error(`compiler: shading must be 'physical' | 'standard' | 'lambert' (got ${JSON.stringify(shading)})`);
  if (typeof registry?.get !== 'function' || typeof registry?.has !== 'function') throw new Error('compiler: needs a material registry from defineMaterials');
  if (!registry.has(paintBase)) throw new Error(`compiler: paint base '${paintBase}' is not in the registry`);
  const Base = TIERS[shading], params = PARAMS[shading], cache = new Map(), time = { value: 0 };

  const norm = (o = {}) => ({
    instanced: !!o.instanced, vertexColors: !!o.vertexColors, skinned: !!o.skinned, receiveShadow: o.receiveShadow !== false,
    map: o.map ?? null, fur: o.fur !== false,
    wind: o.wind ? { fade: [...(o.wind.fade ?? [0, 0])], amp: [...(o.wind.amp ?? WIND_AMP)] } : null,
  });

  function featuresOf(def, o) {
    const look = def.look ?? {}, f = [];
    if (def.coverage) f.push('COVERAGE');
    if (look.fur && o.fur) f.push('FUR');
    if (look.subsurface && shading !== 'lambert') f.push('SUBSURFACE'); // D5: physical and standard only
    if (o.wind) f.push('WIND');
    return f;
  }

  function uniformsFor(def, features, o, uCoverage = new Vector4(0, 0, 0, 0)) {
    const look = def.look ?? {}, u = {};
    if (features.includes('COVERAGE')) {
      const c = def.coverage;
      u.uCoverage = { value: uCoverage };
      u.uCoverageAccept = { value: new Vector4(c.dirt ?? 0, c.rust ?? 0, c.snow ?? 0, c.mud ?? 0) };
    }
    if (features.includes('FUR')) {
      const fu = look.fur;
      u.furLen = { value: fu.length ?? 0.07 }; u.furDensity = { value: fu.density ?? 34 }; u.furTint = { value: new Color(fu.tint ?? '#ffffff') };
    }
    if (features.includes('SUBSURFACE')) {
      const s = look.subsurface;
      u.uSubColor = { value: new Color(s.color ?? '#ffffff') }; u.uSubStrength = { value: s.strength ?? 0.5 };
    }
    if (features.includes('WIND')) {
      u.uLhTime = time; // one clock for every windy material: mc.time.value = seconds
      u.uWindFade = { value: new Vector2(o.wind.fade[0], o.wind.fade[1]) }; u.uWindAmp = { value: new Vector2(o.wind.amp[0], o.wind.amp[1]) };
    }
    return u;
  }

  const keyOf = (id, o, features) => [id, shading, +o.instanced, +o.vertexColors, +o.skinned, +o.receiveShadow, o.map?.uuid ?? '', features.join('+')].join('|')
    + (o.wind ? `|wind:${o.wind.fade.join(',')}:${o.wind.amp.join(',')}` : '');

  function get(id, opts) {
    const def = registry.get(id), o = norm(opts), features = featuresOf(def, o), key = keyOf(id, o, features);
    const hit = cache.get(key);
    if (hit) return hit;
    const m = new Base(), look = def.look ?? {};
    for (const k of params) {
      if (look[k] === undefined) continue;
      if (COLORS.has(k)) m[k].set(look[k]);
      else if (k === 'side') m.side = look.side === 'double' ? DoubleSide : FrontSide;
      else m[k] = look[k];
    }
    m.name = id;
    m.vertexColors = o.vertexColors;
    if (o.vertexColors) m.color.setRGB(1, 1, 1); // D5: vertex colours replace look.color
    if (o.map) m.map = o.map;                     // a glTF base-colour texture (the barn)
    m.userData.lh = { id, key, tier: shading, instanced: o.instanced, vertexColors: o.vertexColors, skinned: o.skinned, receiveShadow: o.receiveShadow, features };
    m.userData.lhUse = o.instanced ? 'instanced' : o.skinned ? 'skinned' : 'plain'; // the mesh kind warm() needs (matSplit)
    m.userData.lhShared = true;                                                     // disposeTree skips it
    install(m, { id, o, features, extras: [], uniforms: uniformsFor(def, features, o) });
    cache.set(key, m);
    return m;
  }

  function dispose() { for (const m of cache.values()) m.dispose(); cache.clear(); }

  return Object.freeze({
    shading, time, get,
    furGeometry: (geometry, mask, opts) => furGeometry(geometry, mask, opts),
    keys: () => [...cache.keys()], made: () => [...cache.values()].map(material => ({ material, use: material.userData.lhUse })), dispose,
  });
}
```

- [ ] **Step 4: Run; expect PASS** (9 tests). Also run `UNIT test/compiler-fur.test.mjs test/compiler-chunks.test.mjs`: PASS.

- [ ] **Step 5: Prove the matSplit test bites.** In `keyOf`, delete `+o.receiveShadow, `: expect "cache: … each user kind gets its own" to fail (5 distinct materials, not 6). Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/compiler.test.mjs src/view/materials/compiler.js
git commit -m "feat(view): material compiler tiers, look mapping and the matSplit cache key (M-11, M-13, D5)"
```

---

## Task 6 (judgment): Paint, per-entity coverage, game extensions, apply

**Files:**
- Create: `test/compiler-apply.test.mjs`
- Modify: `src/view/materials/compiler.js`

**Interfaces:**
- Consumes: Task 5's `get`, `STATE`, `install`, `uniformsFor`.
- Produces:
  - `mc.paint(id, color, opts) → THREE.Material`: one clone per (key, colour), cached, same program, `color` = the paint (times vertex colours, as Tractor's `paintable` did);
  - `mc.coverage(material, { uCoverage } = {}) → { material, uniforms: { uCoverage: THREE.Vector4 } }`: plain material → a new uncached clone with its own (or the given) `uCoverage`, `userData.lhShared = false` (the entity's to dispose); instanced material → one cached shared variant with `COVERAGE_INSTANCED` that reads the `instanceCoverage` attribute;
  - `mc.extend(material, name, patch(shader, inject)) → THREE.Material`: a cached clone whose `onBeforeCompile` runs the engine patches, then `patch`; program key `lh:<features>|x:<name>`;
  - `mc.apply(root, { instanced = false, paint = null, coverage = false } = {}) → { uCoverage: THREE.Vector4 | null }`.

**Decisions to confirm in review:**
- `apply` reads each mesh's authored material names from `mesh.userData.lhMat` (written on first apply; `userData` survives `clone()`), else from `material.name`. So re-applying a compiled tree, or a clone of one, still resolves `paint-trim` correctly even though paint materials of one colour are shared between slots.
- Per mesh, the options come from the mesh: `instanced` (option or `isInstancedMesh`), `vertexColors` (a `color` attribute), `skinned` (`isSkinnedMesh`), `receiveShadow` (the mesh's flag), `map` (the authored material's map), `fur` (a `furShell` attribute). So a fur material on a mesh without shells compiles without `FUR` (an unbound attribute would read a stale generic value).
- `paint-<slot>`: plain meshes with a colour get `mc.paint(paintBase, colour)`; instanced meshes and slots without a colour get the paint base material (the caller writes `instanceColor`, A-4).
- An unknown material name throws `compiler: mesh '<mesh>' uses material '<name>', which is neither a registry id nor paint-<slot>`.
- `coverage: true` makes one `Vector4` per call and gives it to every coverage material in the tree, so one entity's dirt is one vec4 that 3h's `coverageView` writes.

- [ ] **Step 1: Write the failing test**

`test/compiler-apply.test.mjs`:

```js
// Paint (A-4), per-entity coverage, game extensions, and mc.apply over a model tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, ShaderLib, Texture, Vector4 } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1, mud: 0.5 } },
  testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 10, density: 34, tint: '#ffffff' } } },
  testBare: { look: { color: '#808080' } },
});
const compile = m => { const sh = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };
const named = (name, geo = new BoxGeometry()) => { const m = new Mesh(geo, new MeshStandardMaterial({ name })); m.receiveShadow = true; return m; };

test('paint: one clone per (key, colour), same program, colour set; colours normalise', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('steel');
  const red = mc.paint('steel', '#ff0000'), red2 = mc.paint('steel', '#f00'), green = mc.paint('steel', '#00ff00');
  assert.equal(red, red2); assert.notEqual(red, green); assert.notEqual(red, base);
  assert.ok(red.color.equals(new Color('#ff0000')));
  assert.equal(red.customProgramCacheKey(), base.customProgramCacheKey());
  assert.equal(red.userData.lh.key, `${base.userData.lh.key}|paint:ff0000`);
  const pm = mc.paint('testMud', '#0000ff');
  assert.deepEqual(pm.defines, mc.get('testMud').defines, 'clone() drops defines; the compiler restores them');
  assert.equal(pm.customProgramCacheKey(), 'lh:COVERAGE');
  assert.notEqual(compile(pm).uniforms.uCoverage, compile(mc.get('testMud')).uniforms.uCoverage);
});

test('coverage(): a per-entity clone with its own uCoverage, same program; materials without a coverage block throw', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('testMud');
  const a = mc.coverage(base), b = mc.coverage(base);
  assert.notEqual(a.material, b.material); assert.notEqual(a.uniforms.uCoverage, b.uniforms.uCoverage);
  assert.ok(a.uniforms.uCoverage.isVector4);
  assert.equal(compile(a.material).uniforms.uCoverage.value, a.uniforms.uCoverage, 'the returned vector is the one the shader reads');
  a.uniforms.uCoverage.set(1, 0, 0, 0);
  assert.equal(compile(b.material).uniforms.uCoverage.value.x, 0, 'one entity\'s dirt does not show on another');
  assert.equal(a.material.customProgramCacheKey(), base.customProgramCacheKey());
  assert.equal(a.material.userData.lhShared, false); assert.equal(base.userData.lhShared, true);
  assert.equal(mc.keys().length, 1, 'per-entity clones are not cached');
  const shared = new Vector4(0, 0, 0, 0);
  assert.equal(mc.coverage(base, { uCoverage: shared }).uniforms.uCoverage, shared);
  assert.throws(() => mc.coverage(mc.get('testBare')), /coverage\(\) needs a compiled material whose registry entry has a coverage block \(got 'testBare'\)/);
});

test('coverage() of an instanced material: one shared COVERAGE_INSTANCED variant reading instanceCoverage', () => {
  const mc = createMaterialCompiler(REG), inst = mc.get('testMud', { instanced: true });
  const a = mc.coverage(inst), b = mc.coverage(inst);
  assert.equal(a.material, b.material);
  assert.equal(a.material.defines.COVERAGE_INSTANCED, '');
  assert.equal(a.material.customProgramCacheKey(), 'lh:COVERAGE+COVERAGE_INSTANCED');
  assert.match(compile(a.material).vertexShader, /attribute vec4 instanceCoverage;/);
});

test('extend(): a game patch runs after the engine patches, gets its own program key, and is cached', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('testMud'), seen = [];
  const patch = (sh, inject) => { seen.push(sh.fragmentShader.includes('uCoverageAccept')); sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', '// eyelids'); };
  const x = mc.extend(base, 'eyelids', patch);
  assert.equal(mc.extend(base, 'eyelids', patch), x);
  assert.equal(x.customProgramCacheKey(), 'lh:COVERAGE|x:eyelids');
  assert.match(compile(x).fragmentShader, /\/\/ eyelids/);
  assert.deepEqual(seen, [true]);
  assert.doesNotMatch(compile(base).fragmentShader, /eyelids/);
  const cov = mc.coverage(x);
  assert.match(compile(cov.material).fragmentShader, /\/\/ eyelids/, 'coverage() of an extended material keeps the patch');
  assert.throws(() => mc.extend(cov.material, 'more', patch), /extend\(\) needs a shared material/);
  assert.throws(() => mc.extend(base, 'bad name', patch), /needs a name of \[A-Za-z0-9_-\]/);
});

test('apply(): materials by name, paint slots, unknown names throw', () => {
  const mc = createMaterialCompiler(REG), root = new Group();
  const body = named('testMud'), trim = named('paint-trim'), cab = named('paint-cab');
  root.add(body, trim); trim.add(cab);
  const r = mc.apply(root, { paint: { trim: '#00ff00' } });
  assert.equal(r.uCoverage, null);
  assert.equal(body.material, mc.get('testMud'));
  assert.equal(trim.material, mc.paint('steel', '#00ff00'));
  assert.equal(cab.material, mc.get('steel'), 'a slot without a colour gets the paint base');
  assert.deepEqual(trim.userData.lhMat, ['paint-trim']);
  const bad = new Group().add(named('unobtainium'));
  bad.children[0].name = 'wheel';
  assert.throws(() => mc.apply(bad), /mesh 'wheel' uses material 'unobtainium', which is neither a registry id nor paint-<slot>/);
});

test('apply(): re-apply and clones keep the authored names; instanced users get instanced materials, paint via instanceColor', () => {
  const mc = createMaterialCompiler(REG), root = new Group().add(named('testMud'), named('paint-trim'));
  mc.apply(root, { paint: { trim: '#00ff00' } });
  const copy = root.clone(true);
  mc.apply(copy, { instanced: true, paint: { trim: '#00ff00' } });
  assert.equal(copy.children[0].material, mc.get('testMud', { instanced: true }));
  assert.equal(copy.children[1].material, mc.get('steel', { instanced: true }));
  const im = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ name: 'testMud' }), 4);
  im.receiveShadow = true;
  mc.apply(new Group().add(im));
  assert.equal(im.material.userData.lh.instanced, true, 'an InstancedMesh is instanced without the option');
});

test('apply(): vertex colours, maps, receiveShadow, multi-material meshes and fur geometry pick the right variant', () => {
  const mc = createMaterialCompiler(REG), geo = new BoxGeometry(), map = new Texture();
  geo.setAttribute('color', new BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  const m = new Mesh(geo, [new MeshStandardMaterial({ name: 'testMud', map }), new MeshStandardMaterial({ name: 'steel' })]);
  m.receiveShadow = false;
  mc.apply(new Group().add(m));
  assert.ok(Array.isArray(m.material));
  assert.equal(m.material[0], mc.get('testMud', { vertexColors: true, map, receiveShadow: false }));
  assert.equal(m.material[1], mc.get('steel', { vertexColors: true, receiveShadow: false }));
  const furry = named('testFur', furGeometry(new BoxGeometry(), () => 1)), plain = named('testFur');
  mc.apply(new Group().add(furry, plain));
  assert.equal(furry.material.defines.FUR, ''); assert.equal(plain.material.defines.FUR, undefined);
});

test('apply({ coverage: true }): one vector per call drives every coverage material in the tree', () => {
  const mc = createMaterialCompiler(REG), a = named('testMud'), b = named('testMud'), s = named('testBare');
  const { uCoverage } = mc.apply(new Group().add(a, b, s), { coverage: true });
  assert.ok(uCoverage.isVector4);
  assert.notEqual(a.material, mc.get('testMud'));
  assert.equal(compile(a.material).uniforms.uCoverage.value, uCoverage);
  assert.equal(compile(b.material).uniforms.uCoverage.value, uCoverage);
  assert.equal(s.material, mc.get('testBare'), 'no coverage block: the shared material');
});
```

- [ ] **Step 2: Run; expect FAIL**: every test fails with `TypeError: mc.paint is not a function` (or `mc.coverage` / `mc.extend` / `mc.apply`). `UNIT test/compiler-apply.test.mjs`

- [ ] **Step 3: Implement.** In `src/view/materials/compiler.js`, insert this block immediately before the line `  function dispose() { for (const m of cache.values()) m.dispose(); cache.clear(); }`:

```js
  // a clone of a compiled material with its own uniforms (same program); `key` null means not cached (per entity)
  function variant(material, key, { features, extras, uCoverage } = {}) {
    const s = STATE.get(material), def = registry.get(s.id);
    const st = { ...s, features: features ?? s.features, extras: extras ?? s.extras };
    st.uniforms = uniformsFor(def, st.features, s.o, uCoverage);
    const m = material.clone();
    m.userData.lh = { ...material.userData.lh, key: key ?? material.userData.lh.key, features: st.features };
    m.userData.lhShared = key !== null; // per-entity clones are the entity's to dispose
    install(m, st);
    if (key !== null) cache.set(key, m);
    return m;
  }

  function paint(id, color, opts) {
    const base = get(id, opts), c = new Color(color), key = `${base.userData.lh.key}|paint:${c.getHexString()}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = variant(base, key);
    m.color.copy(c); // times the vertex colours, when the mesh has them
    return m;
  }

  function coverage(material, { uCoverage } = {}) {
    const s = STATE.get(material);
    if (!s || !s.features.includes('COVERAGE')) throw new Error(`compiler: coverage() needs a compiled material whose registry entry has a coverage block (got '${material?.name}')`);
    if (material.userData.lh.instanced) { // one shared variant per material: coverage comes from the instanceCoverage attribute
      const key = `${material.userData.lh.key}|covi`;
      const m = cache.get(key) ?? variant(material, key, { features: [...s.features.slice(0, 1), 'COVERAGE_INSTANCED', ...s.features.slice(1)], uCoverage });
      return { material: m, uniforms: { uCoverage: STATE.get(m).uniforms.uCoverage.value } };
    }
    const m = variant(material, null, { uCoverage: uCoverage ?? new Vector4(0, 0, 0, 0) });
    return { material: m, uniforms: { uCoverage: STATE.get(m).uniforms.uCoverage.value } };
  }

  function extend(material, name, patch) {
    const s = STATE.get(material);
    if (!s || material.userData.lhShared === false) throw new Error(`compiler: extend() needs a shared material from this compiler (got '${material?.name}'); extend first, then take coverage()`);
    if (!/^[\w-]+$/.test(name) || typeof patch !== 'function') throw new Error(`compiler: extend(material, name, patch) needs a name of [A-Za-z0-9_-] and a patch(shader, inject) function (got '${name}')`);
    const key = `${material.userData.lh.key}|x:${name}`;
    return cache.get(key) ?? variant(material, key, { extras: [...s.extras, { name, patch }] });
  }

  function apply(root, { instanced = false, paint: colors = null, coverage: cov = false } = {}) {
    const uCoverage = cov ? new Vector4(0, 0, 0, 0) : null; // one vec4 per call: one entity's (dirt, rust, snow, mud)
    root.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const names = o.userData.lhMat ?? list.map(m => m.name);
      o.userData.lhMat = names; // the authored names survive re-apply and clone (userData is JSON-copied)
      const a = o.geometry.attributes, inst = instanced || !!o.isInstancedMesh;
      const out = names.map((name, i) => {
        const opts = { instanced: inst, vertexColors: !!a.color, skinned: !!o.isSkinnedMesh, receiveShadow: o.receiveShadow, map: list[i]?.map ?? null, fur: !!a.furShell };
        let m;
        if (name.startsWith('paint-')) {
          const c = colors?.[name.slice(6)];
          m = c != null && !inst ? paint(paintBase, c, opts) : get(paintBase, opts); // instanced paint: instanceColor on the base
        } else if (registry.has(name)) m = get(name, opts);
        else throw new Error(`compiler: mesh '${o.name}' uses material '${name}', which is neither a registry id nor paint-<slot>`);
        if (uCoverage && STATE.get(m).features.includes('COVERAGE')) m = coverage(m, { uCoverage }).material;
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    return { uCoverage };
  }
```

Then, in the returned object, replace the line `    shading, time, get,` with `    shading, time, get, paint, coverage, extend, apply,`.

- [ ] **Step 4: Run; expect PASS** (8 tests), and `UNIT test/compiler.test.mjs` still passes.

- [ ] **Step 5: Prove the isolation test bites.** In `variant`, replace `st.uniforms = uniformsFor(def, st.features, s.o, uCoverage);` with `st.uniforms = s.uniforms;`: expect "coverage(): a per-entity clone with its own uCoverage…" and "paint: … colours normalise" to fail. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/compiler-apply.test.mjs src/view/materials/compiler.js
git commit -m "feat(view): paint, per-entity coverage, game shader extensions and apply over a model tree (A-4, M-11)"
```

---

## Task 7 (judgment): `createAssets`

**Files:**
- Create: `test/assets.test.mjs`
- Create (or replace 3e's stub): `src/view/assets/index.js`

**Interfaces:**
- Consumes: `sharedLoader`, `loadGlb`, `loadJson` (Task 1), `decodeAnimTable` (Task 2), `mc.apply` (Task 6), `SkeletonUtils.clone`, `baked/manifest.json` (`{ v: 1, models: { <id>: { glb, anim, bytes, sha256 } } }`, overview §4.3).
- Produces (overview §4.7, plus the options in Contract issue C1):
  - `createAssets({ manifest, base = './assets/', compiler = null, renderer = null, gfx = null, decoders = {}, fetch = globalThis.fetch }) → assets`;
  - `assets.preload(keys) → Promise<void>`: resolves after every key is loaded and compiled and then after `await gfx.warm()` (A-10, M-12);
  - `assets.progress` (live `{ loaded, total, bytes }`), `assets.has(key)` (loaded and ready), `assets.get(key) → { scene, clips, anim, sockets }` (frozen template; throws if not loaded), `assets.clone(key, { paint, instanced = false }) → THREE.Object3D`, `assets.dispose()`;
  - `sockets`: `{ <name>: { name: 'sock-<name>', p: [x, y, z], q: [x, y, z, w] } }` in model space, from the GLB's `sock-*` empties (the view-side twin of the sidecar's sockets; a clone finds its node with `getObjectByName(name)`).

**Decisions to confirm in review:**
- The cache is per `createAssets` (boot makes one per page) and keyed by URL; a rejected promise is removed so a later `preload` retries. Progress counts each key once; a failed key is uncounted again.
- Templates are compiled once at load (`compiler.apply(scene)`), and glTF's own materials are disposed (their textures live on as the compiled materials' `map`). `clone` shares geometry and materials, and calls `apply` again only for `paint` or `instanced`.
- Template meshes default to `castShadow = receiveShadow = true` (every game shadows its models today), matching `mc.get`'s default `receiveShadow: true`. A game that changes `receiveShadow` on a clone re-runs `compiler.apply(clone)` to get the matching material (M-13).
- Template geometries get `userData.lhShared = true` (every clone shares them, so 3e's `disposeTree` skips them). `dispose()` frees template geometry and textures; compiled materials belong to the compiler (`mc.dispose()`).

- [ ] **Step 1: Write the failing test**

`test/assets.test.mjs`:

```js
// engine.assets (A-9, A-10, A-11): manifest keys, one fetch per URL, progress, warm ordering, templates, clones, dispose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Matrix4 } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { createAssets } from '../src/view/assets/index.js';
import { sampleAnimTable } from '../src/view/assets/animTable.js';
import { makeGlb, makeAnimJson, fakeFetch } from './helpers/glb.mjs';

const REG = defineMaterials({ testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1 } } });
const body = { name: 'body', material: 'testMud', pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
const trim = { name: 'trim', material: 'paint-trim', pos: [0, 0, 1, 1, 0, 1, 0, 1, 1], idx: [0, 1, 2] };
const anim = makeAnimJson(['body', 'trim'], { walk: { dur: 1, frames: [[new Matrix4(), new Matrix4().makeTranslation(0, 0, 4)]] } });

async function setup({ gfx = null, skin = false, extra = {} } = {}) {
  const pig = await makeGlb({ parts: [body, trim], empties: [{ name: 'sock-hat', t: [0, 1.5, 0.25] }], anims: [{ name: 'bob', node: 'body', times: [0, 1], values: [0, 0, 0, 0, 1, 0] }], meshopt: true, skin });
  const cone = await makeGlb({ parts: [{ ...body, name: 'cone' }] });
  const manifest = { v: 1, models: {
    pig: { glb: 'models/pig.glb', anim: 'models/pig.anim.json', bytes: pig.byteLength, sha256: 'x' },
    cone: { glb: 'models/cone.glb', anim: null, bytes: cone.byteLength, sha256: 'y' },
    lost: { glb: 'models/lost.glb', anim: null, bytes: 9, sha256: 'z' },
  } };
  const fetch = fakeFetch({ './assets/models/pig.glb': pig, './assets/models/pig.anim.json': anim, './assets/models/cone.glb': cone, ...extra });
  const mc = createMaterialCompiler(REG);
  return { mc, fetch, manifest, assets: createAssets({ manifest, compiler: mc, fetch, gfx }) };
}

test('the manifest must be baked/manifest.json v1', () => {
  assert.throws(() => createAssets({ manifest: { v: 2, models: {} } }), /manifest must be baked\/manifest\.json with v: 1 \(got v2\)/);
  assert.throws(() => createAssets({}), /manifest must be/);
});

test('preload fetches each URL once, even under overlapping preloads; progress counts keys and bytes', async () => {
  const { assets, fetch, manifest } = await setup();
  assert.deepEqual(assets.progress, { loaded: 0, total: 0, bytes: 0 });
  await Promise.all([assets.preload(['pig', 'cone']), assets.preload(['pig']), assets.preload(['cone', 'cone'])]);
  assert.deepEqual(fetch.calls.toSorted(), ['./assets/models/cone.glb', './assets/models/pig.anim.json', './assets/models/pig.glb']);
  assert.deepEqual(assets.progress, { loaded: 2, total: 2, bytes: manifest.models.pig.bytes + manifest.models.cone.bytes });
  await assets.preload(['pig']);
  assert.equal(fetch.calls.length, 3, 'a later preload is served from the cache');
  assert.equal(assets.has('pig'), true); assert.equal(assets.has('lost'), false);
});

test('preload resolves only after gfx.warm() resolves (A-10, M-12)', async () => {
  let release, warmed = 0;
  const { assets } = await setup({ gfx: { warm: () => { warmed++; return new Promise(r => { release = r; }); } } });
  let done = false;
  const p = assets.preload(['cone']).then(() => { done = true; });
  for (let i = 0; i < 20 && !release; i++) await new Promise(r => setImmediate(r));
  assert.equal(warmed, 1); assert.equal(assets.has('cone'), true); assert.equal(done, false);
  release(); await p;
  assert.equal(done, true);
});

test('unknown keys, failed loads and get() before preload say what to do; a failed key can be retried', async () => {
  const { assets, manifest } = await setup();
  await assert.rejects(assets.preload(['nope']), /unknown asset 'nope' \(the manifest has pig, cone, lost\)/);
  await assert.rejects(assets.preload(['lost']), /assets: failed to load 'lost' \(\.\/assets\/models\/lost\.glb\): HTTP 404/);
  assert.deepEqual(assets.progress, { loaded: 0, total: 0, bytes: 0 }, 'a failure leaves progress as it was');
  assert.throws(() => assets.get('cone'), /'cone' is not loaded; await assets\.preload\(\['cone'\]\) first/);
  assert.throws(() => assets.get('nope'), /unknown asset 'nope'/);
  const cone = await makeGlb({ parts: [{ ...body, name: 'lost' }] });
  const retry = createAssets({ manifest, fetch: fakeFetch({}), compiler: null });
  await assert.rejects(retry.preload(['lost']));
  const files = { './assets/models/lost.glb': cone }, fetch = fakeFetch(files);
  const again = createAssets({ manifest, fetch });
  delete files['./assets/models/lost.glb'];
  await assert.rejects(again.preload(['lost']));
  files['./assets/models/lost.glb'] = cone;
  await again.preload(['lost']);
  assert.equal(fetch.calls.length, 2, 'the failed URL was not cached');
  assert.deepEqual(again.progress, { loaded: 1, total: 1, bytes: 9 });
});

test('a template: compiled materials, sockets from sock-* empties, glTF clips, the decoded anim table', async () => {
  const { assets, mc } = await setup();
  await assets.preload(['pig', 'cone']);
  const t = assets.get('pig');
  assert.ok(Object.isFrozen(t));
  const b = t.scene.getObjectByName('body'), tr = t.scene.getObjectByName('trim');
  assert.equal(b.material, mc.get('testMud', { vertexColors: true }));
  assert.equal(tr.material, mc.get('steel'));
  assert.equal(b.castShadow, true); assert.equal(b.receiveShadow, true);
  assert.equal(b.geometry.userData.lhShared, true, 'clones share it: disposeTree must skip it');
  assert.deepEqual(t.sockets, { hat: { name: 'sock-hat', p: [0, 1.5, 0.25], q: [0, 0, 0, 1] } });
  assert.deepEqual(t.clips.map(c => c.name), ['bob']);
  assert.deepEqual([...t.anim.parts], ['body', 'trim']);
  assert.equal(sampleAnimTable(t.anim, 'walk', 0, 1, new Matrix4()).elements[14], 4);
  assert.equal(assets.get('cone').anim, null);
});

test('clone shares geometry and materials; paint and instanced recompile only the clone', async () => {
  const { assets, mc } = await setup();
  await assets.preload(['pig']);
  const t = assets.get('pig').scene, c = assets.clone('pig');
  assert.notEqual(c, t);
  assert.equal(c.getObjectByName('body').geometry, t.getObjectByName('body').geometry);
  assert.equal(c.getObjectByName('body').material, t.getObjectByName('body').material);
  const red = assets.clone('pig', { paint: { trim: '#ff0000' } });
  assert.equal(red.getObjectByName('trim').material, mc.paint('steel', '#ff0000', { receiveShadow: true }));
  assert.equal(t.getObjectByName('trim').material, mc.get('steel'), 'the template keeps the base');
  const inst = assets.clone('pig', { instanced: true });
  assert.equal(inst.getObjectByName('body').material.userData.lh.instanced, true);
});

test('skinned models clone with SkeletonUtils: each clone has its own skeleton and animates alone (A-11)', async () => {
  const { assets } = await setup({ skin: true });
  await assets.preload(['pig']);
  const t = assets.get('pig'), a = assets.clone('pig'), b = assets.clone('pig');
  const sa = a.getObjectByName('body'), sb = b.getObjectByName('body');
  assert.ok(sa.isSkinnedMesh);
  assert.notEqual(sa.skeleton, sb.skeleton); assert.notEqual(sa.skeleton, t.scene.getObjectByName('body').skeleton);
  assert.equal(sa.skeleton.bones[0], a.getObjectByName('bone'), 'bones are the clone\'s own nodes');
  const mixer = new AnimationMixer(a);
  mixer.clipAction(t.clips[0]).play(); mixer.update(0.5);
  assert.ok(Math.abs(sa.position.y - 0.5) < 1e-6);
  assert.equal(sb.position.y, 0); assert.equal(t.scene.getObjectByName('body').position.y, 0);
});

test('dispose frees template geometry; afterwards nothing is loaded and preload refuses', async () => {
  const { assets } = await setup();
  await assets.preload(['cone']);
  let freed = 0;
  assets.get('cone').scene.getObjectByName('cone').geometry.addEventListener('dispose', () => freed++);
  assets.dispose(); assets.dispose();
  assert.equal(freed, 1);
  assert.equal(assets.has('cone'), false);
  await assert.rejects(assets.preload(['cone']), /assets: preload after dispose/);
});
```

- [ ] **Step 2: Run; expect FAIL**: `ERR_MODULE_NOT_FOUND` for `src/view/assets/index.js`, or, if 3e's stub is present, assertion failures from its inert returns. `UNIT test/assets.test.mjs`

- [ ] **Step 3: Implement**

`src/view/assets/index.js`:

```js
// engine.assets (A-9, A-10): baked GLBs by manifest key. Each URL is fetched and parsed once (Map<url, Promise>); a
// loaded model is a template whose materials the compiler has already replaced, and instances are clones that share its
// geometry and materials (SkeletonUtils.clone for skinned models, so each clone animates on its own skeleton).
// View only: headless engines and sim code have no assets.
import { Vector3, Quaternion } from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { sharedLoader, loadGlb, loadJson } from './loader.js';
import { decodeAnimTable } from './animTable.js';

export function createAssets({ manifest, base = './assets/', compiler = null, renderer = null, gfx = null, decoders = {}, fetch = globalThis.fetch } = {}) {
  if (!manifest || manifest.v !== 1 || typeof manifest.models !== 'object') throw new Error(`assets: manifest must be baked/manifest.json with v: 1 (got ${manifest ? `v${manifest.v}` : manifest})`);
  if (!base.endsWith('/')) base += '/';
  const loader = sharedLoader({ ...decoders, renderer });
  const files = new Map();    // url → Promise (the A-9 cache)
  const tracked = new Map();  // key → Promise (progress counts each key once)
  const ready = new Map();    // key → frozen { scene, clips, anim, sockets }
  const skinned = new Set();
  const progress = { loaded: 0, total: 0, bytes: 0 };
  let disposed = false;

  const entry = key => {
    const m = manifest.models[key];
    if (!m) throw new Error(`assets: unknown asset '${key}' (the manifest has ${Object.keys(manifest.models).join(', ') || 'no models'})`);
    return m;
  };
  const once = (url, load) => {
    let p = files.get(url);
    if (!p) { p = load(); files.set(url, p); p.catch(() => { if (files.get(url) === p) files.delete(url); }); } // a failure can be retried
    return p;
  };

  function template(key, gltf, anim) {
    const scene = gltf.scene, sockets = {};
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (o.isSkinnedMesh) skinned.add(key);
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; // engine default; re-apply the compiler after changing receiveShadow
        o.geometry.userData.lhShared = true;         // clones share it; disposeTree skips it, assets.dispose frees it
      }
      if (o.name.startsWith('sock-')) {
        const p = new Vector3(), q = new Quaternion();
        o.matrixWorld.decompose(p, q, new Vector3());
        sockets[o.name.slice(5)] = Object.freeze({ name: o.name, p: Object.freeze(p.toArray()), q: Object.freeze(q.toArray()) });
      }
    });
    if (compiler) {
      const old = new Set();
      scene.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) old.add(m); });
      compiler.apply(scene);
      for (const m of old) m.dispose(); // glTF's own materials; their textures live on as the compiled materials' maps
    }
    return Object.freeze({ scene, clips: gltf.animations, anim, sockets: Object.freeze(sockets) });
  }

  async function load(key) {
    const m = entry(key), glbUrl = base + m.glb, animUrl = m.anim ? base + m.anim : null;
    try {
      const [g, anim] = await Promise.all([
        once(glbUrl, () => loadGlb(glbUrl, { fetch, loader })),
        animUrl ? once(animUrl, () => loadJson(animUrl, { fetch }).then(decodeAnimTable)) : null,
      ]);
      if (!disposed && !ready.has(key)) ready.set(key, template(key, g.gltf, anim));
    } catch (err) {
      throw new Error(`assets: failed to load '${key}' (${glbUrl}): ${err.message}`, { cause: err });
    }
  }

  function track(key) {
    let p = tracked.get(key);
    if (p) return p;
    progress.total++;
    p = load(key).then(() => { progress.loaded++; progress.bytes += manifest.models[key].bytes ?? 0; });
    tracked.set(key, p);
    p.catch(() => { tracked.delete(key); progress.total--; });
    return p;
  }

  // A-10: resolves once every key is loaded and compiled, then after gfx.warm() (M-12)
  async function preload(keys) {
    if (disposed) throw new Error('assets: preload after dispose');
    const list = [...new Set(keys)];
    for (const k of list) entry(k);
    await Promise.all(list.map(track));
    if (gfx?.warm) await gfx.warm();
  }

  function get(key) {
    const t = ready.get(key);
    if (t) return t;
    entry(key);
    throw new Error(`assets: '${key}' is not loaded; await assets.preload(['${key}']) first`);
  }

  function clone(key, { paint = null, instanced = false } = {}) {
    const t = get(key);
    const root = skinned.has(key) ? SkeletonUtils.clone(t.scene) : t.scene.clone(true);
    if (compiler && (paint || instanced)) compiler.apply(root, { paint, instanced });
    return root;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const textures = new Set();
    for (const t of ready.values()) t.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    });
    for (const tx of textures) tx.dispose();
    ready.clear(); files.clear(); tracked.clear();
  }

  return Object.freeze({ preload, progress, has: key => ready.has(key), get, clone, dispose });
}
```

- [ ] **Step 4: Run; expect PASS** (8 tests). Then the whole 3f unit set:

`UNIT test/assets-loader.test.mjs test/assets-animTable.test.mjs test/assets.test.mjs test/compiler-chunks.test.mjs test/compiler-fur.test.mjs test/compiler.test.mjs test/compiler-apply.test.mjs` → 40 tests pass.

- [ ] **Step 5: Prove the cache and skeleton tests bite.** (a) In `once`, delete `p.catch(() => { if (files.get(url) === p) files.delete(url); });`: expect "a failed key can be retried" to fail (the second preload rejects from the cache). (b) In `clone`, use `t.scene.clone(true)` for every key: expect "skinned models clone with SkeletonUtils" to fail (the skeleton is shared). Restore both; PASS.

- [ ] **Step 6: Commit**

```bash
git add test/assets.test.mjs src/view/assets/index.js
git commit -m "feat(view): engine.assets: manifest preload with one fetch per URL, warm, templates, clones (A-9, A-10, A-11)"
```

---

## Task 8: Real-GPU checks of every tier and feature

**Files:**
- Create: `test/compiler-e2e.page.js`
- Create: `test/compiler-e2e.test.mjs`

**Interfaces:**
- Consumes: `launch` from `lion-hawk/playwright` (SwiftShader WebGL2), esbuild, `createMaterialCompiler`, `furGeometry`, `defineMaterials`.
- Produces: three page functions (`window.lhCompileAll(tier)`, `window.lhCoverage(tier)`, `window.lhFeatures(tier)`) returning plain data; 9 tests (3 per tier).

This is the only place the GLSL is compiled. The page builds its own renderer per call with `renderer.debug.onShaderError` collecting program and shader info logs, so an error names the line. What each test pins:
- **Compile:** every feature, plain and instanced, with vertex and instance colours, `COVERAGE_INSTANCED` with an `instanceCoverage` attribute, a fur geometry, a windy instanced mesh, an extended material and a paint clone: no shader errors. Then 4 more coverage clones and 3 more paint colours: `renderer.info.programs.length` does not change (R1).
- **Coverage:** a white plane's blue channel drops by more than 10% when its clone's `uCoverage.x` goes 0 → 1, and another clone of the same material renders exactly as clean.
- **Features:** fur shells light more pixels than the same geometry with `fur: false`; `SUBSURFACE` brightens a side-lit sphere on physical and standard and changes nothing on lambert (D5); `mc.time` moves a windy blade.

A probe of this page against this plan's code (three 0.186.1, SwiftShader) gave: programs 11 → 11 (lambert 9 → 9); blue 523108 → 281522, other clone 523108; fur 594 vs 484 lit pixels; subsurface 258441 vs 173863 (lambert equal); wind 378 pixels moved.

- [ ] **Step 1: Write the page**

`test/compiler-e2e.page.js`:

```js
// Bundled by test/compiler-e2e.test.mjs: real WebGL2 (SwiftShader) checks of the compiled materials. Each window.lh*
// function builds its own renderer and returns plain data.
import * as THREE from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ffffff', roughness: 1 }, coverage: { dirt: 1, rust: 1, snow: 1, mud: 1 } },
  testFur: { look: { color: '#ffffff', roughness: 1, fur: { length: 0.3, shells: 8, density: 6, tint: '#ffffff' } } },
  testWax: { look: { color: '#ffffff', roughness: 1, subsurface: { color: '#ff8866', strength: 1 } } },
  testBare: { look: { color: '#ffffff', roughness: 1 } },
});
const S = 64;

function rig(tier) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S; document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(S, S, false); renderer.shadowMap.enabled = true;
  const errors = [];
  renderer.debug.onShaderError = (gl, program, vs, fs) => errors.push(`${gl.getProgramInfoLog(program)}\n${gl.getShaderInfoLog(vs)}\n${gl.getShaderInfoLog(fs)}`.trim());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 2); sun.castShadow = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6), sun);
  const mc = createMaterialCompiler(REG, { shading: tier });
  const pixels = () => { const gl = renderer.getContext(), px = new Uint8Array(S * S * 4); gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const shot = () => { renderer.render(scene, camera); return pixels(); };
  const done = () => { mc.dispose(); renderer.dispose(); canvas.remove(); };
  return { renderer, scene, camera, mc, errors, shot, done };
}
const coloured = geo => { geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); return geo; };
const sum = (px, ch) => { let s = 0; for (let i = ch; i < px.length; i += 4) s += px[i]; return s; };
const lit = px => { let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) n++; return n; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++; return n; };

// Every feature, plain and instanced, in one scene: no shader errors; then more paint and coverage users add no programs.
window.lhCompileAll = tier => {
  const r = rig(tier), { mc, scene } = r, box = coloured(new THREE.BoxGeometry(0.5, 0.5, 0.5));
  const add = (o, x) => { o.position.x = x; scene.add(o); return o; };
  let x = -3;
  for (const id of ['testMud', 'testFur', 'testWax', 'testBare']) {
    add(new THREE.Mesh(box, mc.get(id, { vertexColors: true })), x += 0.4);
    const im = add(new THREE.InstancedMesh(box, mc.get(id, { instanced: true, vertexColors: true }), 2), x += 0.4);
    im.setColorAt(0, new THREE.Color(1, 0, 0)); im.setColorAt(1, new THREE.Color(0, 1, 0));
  }
  add(new THREE.Mesh(furGeometry(box, () => 1), mc.get('testFur', { vertexColors: true })), x += 0.4);
  add(new THREE.InstancedMesh(box, mc.get('testBare', { instanced: true, vertexColors: true, wind: { fade: [30, 60] } }), 2), x += 0.4);
  add(new THREE.Mesh(box, mc.coverage(mc.get('testMud', { vertexColors: true })).material), x += 0.4);
  const cg = box.clone(); cg.setAttribute('instanceCoverage', new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 1, 0, 1, 1, 0]), 4));
  add(new THREE.InstancedMesh(cg, mc.coverage(mc.get('testMud', { instanced: true, vertexColors: true })).material, 2), x += 0.4);
  add(new THREE.Mesh(box, mc.extend(mc.get('testMud', { vertexColors: true }), 'tint', (sh, inject) => { sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= 0.9;'); })), x += 0.4);
  add(new THREE.Mesh(box, mc.paint('steel', '#ff0000', { vertexColors: true })), x += 0.4);
  r.renderer.compile(scene, r.camera); r.shot();
  const before = r.renderer.info.programs.length;
  for (let i = 0; i < 4; i++) add(new THREE.Mesh(box, mc.coverage(mc.get('testMud', { vertexColors: true })).material), 2.5);
  for (const c of ['#00ff00', '#0000ff', '#ffff00']) add(new THREE.Mesh(box, mc.paint('steel', c, { vertexColors: true })), 2.5);
  r.shot();
  const out = { errors: r.errors, before, after: r.renderer.info.programs.length };
  r.done();
  return out;
};

// A coverage clone's own uCoverage reaches the GPU: dirt 0 → 1 browns a white plane; another entity's clone stays clean.
window.lhCoverage = tier => {
  const r = rig(tier), plane = coloured(new THREE.PlaneGeometry(3, 3));
  const a = r.mc.coverage(r.mc.get('testMud', { vertexColors: true })), b = r.mc.coverage(r.mc.get('testMud', { vertexColors: true }));
  const mesh = new THREE.Mesh(plane, a.material); r.scene.add(mesh);
  const clean = r.shot();
  a.uniforms.uCoverage.set(1, 0, 0, 0); const dirty = r.shot();
  mesh.material = b.material; const other = r.shot();
  const out = { errors: r.errors, blue: [sum(clean, 2), sum(dirty, 2), sum(other, 2)] };
  r.done();
  return out;
};

// FUR shells widen the silhouette; SUBSURFACE brightens past the terminator (not on lambert); WIND moves blades with mc.time.
window.lhFeatures = tier => {
  const r = rig(tier), { mc, scene } = r;
  const fg = furGeometry(coloured(new THREE.BoxGeometry(1, 1, 1)), () => 1, { shells: 8 });
  const fur = new THREE.Mesh(fg, mc.get('testFur', { vertexColors: true })); scene.add(fur);
  const furLit = lit(r.shot());
  fur.material = mc.get('testFur', { vertexColors: true, fur: false });
  const bareLit = lit(r.shot());
  scene.remove(fur);
  const ball = coloured(new THREE.SphereGeometry(1, 32, 16)), sphere = new THREE.Mesh(ball, mc.get('testWax', { vertexColors: true })); scene.add(sphere);
  const wax = sum(r.shot(), 0);
  sphere.material = mc.get('testBare', { vertexColors: true });
  const plain = sum(r.shot(), 0);
  scene.remove(sphere);
  const blade = new THREE.Mesh(coloured(new THREE.BoxGeometry(0.2, 2, 0.2)), mc.get('testBare', { vertexColors: true, wind: { amp: [0.5, 0.5] } })); scene.add(blade);
  mc.time.value = 0; const t0 = r.shot();
  mc.time.value = 1; const t1 = r.shot();
  const out = { errors: r.errors, furLit, bareLit, wax, plain, windMoved: diff(t0, t1) };
  r.done();
  return out;
};
```

- [ ] **Step 2: Write the test**

`test/compiler-e2e.test.mjs`:

```js
// The compiled materials in real WebGL2 (SwiftShader): every tier × feature compiles without a shader error, extra
// paint and coverage users share programs, and each feature's uniforms change what is drawn.
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { launch } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
const PAGE = '<!doctype html><meta charset=utf-8><body><script src="compiler.bundle.js"></script>';
let server, base, chrome, page, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/compiler-e2e.page.js')], bundle: true, format: 'iife', outfile: path.join(out, 'compiler.bundle.js'), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === '/compiler.bundle.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, 'compiler.bundle.js')));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  page = await chrome.browser.newPage();
  await page.goto(base);
  await page.waitForFunction(() => typeof window.lhFeatures === 'function');
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

for (const tier of ['physical', 'standard', 'lambert']) {
  test(`${tier}: every feature compiles; more paint and coverage users add no programs (M-11, M-13)`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhCompileAll(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.equal(r.after, r.before, `programs ${r.before} → ${r.after}`);
  });
  test(`${tier}: a coverage clone's uCoverage reaches the GPU, and only for that clone`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhCoverage(tr), tier);
    assert.deepEqual(r.errors, []);
    const [clean, dirty, other] = r.blue;
    assert.ok(dirty < clean * 0.9, `dirt should brown the plane: blue ${clean} → ${dirty}`);
    assert.equal(other, clean, 'the other entity stays clean');
  });
  test(`${tier}: fur shells widen the silhouette, subsurface brightens (not on lambert), wind moves with mc.time`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhFeatures(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.ok(r.furLit > r.bareLit * 1.05, `fur ${r.furLit} vs bare ${r.bareLit} lit pixels`);
    if (tier === 'lambert') assert.equal(r.wax, r.plain, 'lambert drops SUBSURFACE (D5)');
    else assert.ok(r.wax > r.plain, `subsurface ${r.wax} vs plain ${r.plain}`);
    assert.ok(r.windMoved > 10, `wind moved ${r.windMoved} pixels`);
  });
}
```

- [ ] **Step 3: Run; expect PASS** (9 tests; skipped only when no Chromium is installed, which counts as not done). `BROWSER test/compiler-e2e.test.mjs`

- [ ] **Step 4: Prove the GPU tests bite.** (a) In `compiler.js` `install`, change the program key to `` const key = `lh:${m.uuid}`; ``: expect the three "more paint and coverage users add no programs" tests to fail. (b) In `install`, delete `Object.assign(sh.uniforms, st.uniforms);`: expect the coverage tests to fail (the uniforms never reach the GPU, so dirt stays 0). (c) In `chunks.js` `fur()`, change `if ( vFurMask < 0.02 ) discard;` to `if ( vFurMask < 0.02 ) discard`: expect `errors` to list a GLSL syntax error. Restore all; PASS.

- [ ] **Step 5: Commit**

```bash
git add test/compiler-e2e.page.js test/compiler-e2e.test.mjs
git commit -m "test(view): compile every tier and feature in WebGL2; program sharing and per-entity uniforms on the GPU"
```

---

## Task 9: Notes, full run, hand-off

**Files:**
- Create: `docs/plans/2026-10-13-phase-3f-assets-notes.md`

- [ ] **Step 1: Write the notes file** with these sections, filled from the run:
  - **Outcome:** test counts, commits, and the e2e probe numbers (programs per tier, coverage blue drop, fur/subsurface/wind numbers).
  - **Decisions:** the "(judgment)" decisions of Tasks 3, 6 and 7 as built, and anything a reviewer changed.
  - **Contract issues:** C1–C10 below, with their status.
  - **Integrator requests:** 1–6 below.
  - **For the game plans (3j/3k/3l):** how to port each game patch: Tractor `dirtify` → a registry `coverage` block plus `coverageView`; Pig Pens pig mud → `coverage.mud` with `mc.coverage(instancedMaterial)` and an `instanceCoverage` attribute, eyelids → `mc.extend(m, 'eyelids', patch)`; Pig Pens fur → `furGeometry(geo, mask, { shells })` with a soft face mask and the registry `fur` entry (`length 0.07`, `density 34`); Rally verge grass → `mc.get(id, { instanced: true, vertexColors: true, wind: { fade: COVER.fade } })` and `mc.time.value = t` per frame; Tractor ground rock and Rally snow → `mc.extend`.
  - **Field note candidates** (the integrator numbers them from #110):
    1. three's `FileLoader` builds a `ProgressEvent`, which Node lacks: load bytes with `fetch` and call `GLTFLoader.parseAsync` so assets load the same in Node tests and the browser.
    2. `Material.clone()` drops `onBeforeCompile` and the `defines` (the subclass resets them) and JSON-copies `userData`: any clone of a patched material must re-install its patch, defines and uniform objects (the compiler's `install`).
    3. A program attribute the geometry lacks reads whatever generic vertex value was last set at that location, not zero: never draw a `FUR` or `COVERAGE_INSTANCED` program on geometry without its attribute (the compiler picks the variant from the geometry).
    4. Every base material with a `coverage` block (most of them) compiles the `COVERAGE` program even on clean entities. The cost is four compares per fragment; R1's program count per scene is the gate.

- [ ] **Step 2: Full engine run** (the engine `test/` directory includes browser suites, so it runs under the browser lock): `BROWSER test/` → every test passes, including the 49 of this plan (40 unit + 9 e2e). Record the counts in the notes.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-10-13-phase-3f-assets-notes.md
git commit -m "docs(plan): phase 3f notes, contract issues and integrator requests"
```

---

## Done when

- `UNIT` over the seven 3f unit files: **40 tests pass** (loader 4, animTable 4, chunks 4, fur 3, compiler 9, compiler-apply 8, assets 8).
- `BROWSER test/compiler-e2e.test.mjs`: **9 tests pass**, none skipped.
- `BROWSER test/` (the whole engine suite) passes with no other test changed.
- Every mutation step above was seen red, then restored.
- The notes file lists the contract issues and integrator requests below.
- Merge point: Wave B (3e + 3f + 3g + 3h) → engine **0.9.0**. 3g may have built against fakes of `assets`/`compiler`; it merges after this plan (overview §5.1).

## Notes stub

`docs/plans/2026-10-13-phase-3f-assets-notes.md`, with a **"Field note candidates"** section (Task 9 Step 1 lists the four known ones).

---

## Integrator requests

1. **`src/index.view.js` exports:** `createAssets` from `./view/assets/index.js`; `createMaterialCompiler` from `./view/materials/compiler.js`; `furGeometry` from `./view/materials/fur.js`; `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable` from `./view/assets/animTable.js` (the last two are additions to §3.2).
2. **Boot wiring (3e owns `boot.js`):** with `render` declared and WebGL present, boot builds
   `view.materials = createMaterialCompiler(game.defs?.materials, { shading: render.shading, paint: render.paint })` and
   `view.assets = engine.assets = createAssets({ manifest: render.assets?.manifest, base: render.assets?.base, compiler: view.materials, renderer, gfx: view.gfx, decoders: render.assets?.decoders })`.
   The manifest reaches boot from the game's view entry, e.g. `defineView({ render: { assets: { manifest } } })` (3e names the field; this plan only needs it passed). Without a manifest, boot skips `createAssets` (`engine.assets` stays `undefined`).
3. **3e's hygiene (as ruled):** `gfx.warm()` walks `view.materials.made()` and builds a dummy of each `use` (`InstancedMesh` for `'instanced'`, a skinned dummy for `'skinned'`), so their programs compile too. `disposeTree(root, { keepShared })` skips anything with `userData.lhShared === true` (compiler cache materials, template geometries) and frees the rest (per-entity coverage clones).
4. **3d's anim-table bake** writes the 12 floats as `Matrix4.elements` indices `0,1,2,4,5,6,8,9,10,12,13,14`, little-endian Float32, base64 (C7). A shared fixture in 3d's tests decoded by `decodeAnimTable` would pin it across plans.
5. **`meshoptimizer`** must be resolvable from the engine root (it is a `dependencies` entry per §3.2, installed by 3a); `test/helpers/glb.mjs` imports its encoder.
6. **Overview §4.7 and §4.8:** record C1–C10 once reconciled, and tell 3g (crowds write `instanceCoverage` and use `blendAnimTable`) and 3h (`coverageView` writes the `uCoverage` vector from `apply`/`coverage`).

## Contract issues

- **C1. `createAssets` options.** §4.7 lists `{ manifest, base, compiler, renderer }`. This plan adds optional `gfx` (as ruled with 3e: `preload` ends with `await gfx.warm()`; without it `preload` resolves after loading), `decoders: { ktx2, draco }` (configured `KTX2Loader`/`DRACOLoader` instances; KTX2 calls `detectSupport(renderer)`), and `fetch` (tests). Spec A-9 asks for KTX2 and optional Draco while overview §1.2 puts both out of scope; injection satisfies A-9 without bundling either. Untested beyond wiring.
- **C2. `assets.has(key)`** means "loaded and ready" (so `has` guards `get`), not "in the manifest". Template meshes default to `castShadow`/`receiveShadow` true.
- **C3. `mc.get` options** gain `fur` (default true; `apply` passes whether the geometry has shells) and `wind: { fade: [near, far], amp: [x, z] }`. `WIND` is a fourth feature (Rally's grass) that §4.8 does not list, with one shared clock `mc.time`.
- **C4. `mc.extend(material, name, patch(shader, inject))`** for game-only patches (Pig Pens' eyelids, Tractor's ground rock, Rally's snow). Without it a game's `onBeforeCompile` would overwrite the compiler's.
- **C5. `mc.made()`, `userData.lhUse`, `userData.lhShared`** (agreed with 3e via the controller) so `warm` and `disposeTree` can see what the compiler made; §4.8 has only `keys()`. `userData.lh` (`id`, `key`, `tier`, `features`, …) is extra, for debugging. `createMaterialCompiler()` with no registry falls back to the base library.
- **C6. Coverage plumbing.** `mc.apply` returns `{ uCoverage }` (one `Vector4` shared by the tree's coverage materials, `null` without `coverage: true`); `mc.coverage(material, { uCoverage })` takes an optional shared vector. For an instanced material, `coverage()` returns one shared `COVERAGE_INSTANCED` variant that reads a per-instance `instanceCoverage` vec4 attribute, which the caller (3g crowds, 3h `coverageView`) must add to the geometry.
- **C7. Anim-table layout.** §4.3 says "frames×parts×12" without the order. Decision: `Matrix4.elements` minus the bottom row (indices 0,1,2, 4,5,6, 8,9,10, 12,13,14), looping, element-wise lerp. `get(key).anim` is the decoded table. `blendAnimTable` and `decodeAnimTable` are exported alongside `sampleAnimTable`.
- **C8. `createMaterialCompiler(registry, { shading, paint: { base } })`.** The view cannot read `game.config.js`'s `bake.paint.base`; the compiler takes it (default `steel`) and throws if it is not in the registry.
- **C9. Chunk guard scope.** §4.8 names four chunks; the patches also need `begin_vertex`, `clipping_planes_fragment`, `opaque_fragment` and `normal_fragment_begin`. The guard covers all eight, for every tier.
- **C10. Fur parameters.** `furMask` is a 0..1 strand-length factor (Pig Pens' `bare` box and `fade` become the game's mask). The shell count belongs to the geometry (`furGeometry(g, mask, { shells })`, 1..32); `look.fur.shells` is what the game passes there. `mc.furGeometry` takes the same optional third argument.
