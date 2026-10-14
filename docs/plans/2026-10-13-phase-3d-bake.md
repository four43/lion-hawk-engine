# Phase 3d: the `lion-hawk` CLI and the bake — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lion-hawk bake` turns a game's `assets/models/*.glb` into the committed `baked/` output (optimised GLBs, one `phys.json` of sidecars, `manifest.json`, `*.anim.json` tables), and `lion-hawk build` / `lion-hawk dev` replace `build.py`, `bake.mjs` and `dev.mjs`, with test fixture models so no test needs the Kenney pack.

**Architecture:** Node-only code under `tools/` (never imported by `src/`). The bake reads each source with one gltf-transform `NodeIO`, applies the config's renames and the palette → vertex-colour step, classifies nodes (`col-*`, `sock-*`, parts) with the A-2 checks, computes sidecar colliders, sockets, bounds and Rapier-equivalent mass properties from the un-optimised document, samples animation tables, removes `col-*` nodes, optimises (dedup, weld, prune, quantize of normals/tangents/colours only, meshopt) and writes `baked/` deterministically. `build` bundles with esbuild plus the existing `dedupe` plugin, fills `template.html`, copies baked models and PWA files and stamps `sw.js`. `dev` is an esbuild watch context behind a small HTTP server with server-sent reload events. `bin/lion-hawk.js` dispatches to `tools/cli.js`.

**Tech Stack:** Node ≥ 22 ESM, `@gltf-transform/core|extensions|functions` 4.5.1, `meshoptimizer` 1.2.0, `pngjs` 7.0.0, `esbuild` 0.28.2; tests use `three` 0.186 (`GLTFLoader`, `MeshoptDecoder`, `AnimationMixer`) and `@dimforge/rapier3d-compat` 0.21 as references.

**Spec:** `docs/spec.md` (A-1…A-8, A-11 anim tables, B-1, B-2, B-3 as amended by D1, B-5, G-2/#11) plus `docs/plans/2026-10-13-phase-3-overview.md` (§2 D1, D2; §3; §4.3; §5.4).

**Tooling findings (checked on npm, 2026-10-13):**
- `@gltf-transform/*` latest is 4.5.1 (2026-09-28). Its own CLI pins `meshoptimizer ~1.2.0`, so this plan pins `meshoptimizer` 1.2.0 (1.3.0 exists but gltf-transform has not moved to it). three 0.186's bundled `meshopt_decoder.module.js` is built from meshoptimizer 1.1 and decodes 1.2's output; Task 9 proves that with a load test.
- `@gltf-transform/functions` pulls `sharp` 0.35 (native, prebuilt) in through `ndarray-pixels`. Nothing here calls it.
- KTX2 and WebP are out of scope (overview §1.2). For later: WebP is possible through that `sharp`; KTX2 needs either the KTX-Software `toktx` binary (for gltf-transform's `toktx()`) or the WASM `ktx2-encoder` 0.6.0. Draco is out of scope.
- Measured on the real games with this plan's code: Tractor's 40 models bake in about 0.25 s to 897 KB of GLBs (150 KB gzip) plus a 106 KB `phys.json`, against 988 KB (134 KB gzip) of `assets.json` today. Tractor's vertex counts are unchanged (its GLBs are already welded). Rally's `hatchback-sports` drops from 3709 to 2048 vertices, because dropping UVs and tangents lets `weld` merge them (see the integrator requests).

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

**Plan 3d's own constraints:**
- 3d-1. Nothing under `src/` is created or edited. `tools/` may read the engine's `package.json` (for its version) but imports nothing from `src/` except, in Task 16 only, `src/defs/*`.
- 3d-2. No test writes into the repo. Every bake, build or dev test works on a temp copy (`test/helpers/bakeGame.mjs`). The committed fixture `baked/` is written only by the explicit command in Task 10, step 6.
- 3d-3. A re-bake of unchanged sources must be byte-identical: JSON keys sorted where order is free, numbers rounded to 6 decimals, no timestamps.
- 3d-4. The sidecar is computed from the source document after renames and the palette step, but before optimisation. The optimised GLB keeps every part and `sock-*` node with its name, parent and world matrix, so sidecar names, anim-table rows and `GLTFLoader` object names agree.
- 3d-5. Unit-test command for this plan (constraint 5), run from the worktree:
  ```
  systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
    --working-directory=$HOME/projects/four43/lion-hawk-engine-3d \
    -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>
  ```
  Below, `RUN <files>` means exactly that command. No suite in this plan opens a browser.

## Review Focus

1. **Optimisation must not move or rename nodes.** `quantize()` on POSITION adds a dequantisation transform to the part node, or moves the mesh under an unnamed child. `prune()` drops empty leaves such as `sock-*`. Either one silently breaks part names, sockets and anim tables. Pinned by Task 9, "optimisation keeps every named node, its parent and its world matrix", with a mutation step: add POSITION to the quantize pattern and the test fails.
2. **Registry material names must survive `dedup`.** After the palette step, many materials are identical white materials. Without `keepUniqueNames`, `paint-body`, `plastic` and `steel` merge into one, and the compiler (3f) can no longer tell them apart. Pinned by Task 9, "materials that look identical keep their registry names", with a mutation step.
3. **Mass must equal Rapier's.** That covers box, sphere, capsule and cylinder (with the axis rotation), the convex hull, the trimesh, the parallel-axis sum and the principal frame; 3c checks it to 1%. Pinned by Task 2 per shape and composite, and by Task 10, "every sidecar mass matches Rapier built from its own colliders".
4. **Anim tables must equal what `AnimationMixer` draws.** That covers slerp, not the old nlerp; a STEP key exactly at a sample time; parent chains; socket rows; and the 12-float layout 3f decodes (Matrix4 elements 0,1,2,4,5,6,8,9,10,12,13,14). Pinned by Task 8, "every row equals three.js AnimationMixer on the source GLB", to 1e-5.
5. **Staleness and determinism.** `bake --check` must catch a changed, added or removed source, a registry hash change and an engine major.minor change, and must write nothing. A partial `bake ids…` after a registry change must re-bake everything. A re-bake must be byte-identical. Pinned by Task 10 (determinism, partial bake) and Task 11. Close behind: the `site/exp/` guard (constraint 8), pinned by Task 12 and Task 15.

## File Structure

| File | Responsibility |
|---|---|
| `tools/bake/math.js` | vector, quaternion and mat4 helpers; 6-decimal rounding |
| `tools/bake/hull.js` | deterministic incremental convex hull; support-point decimation to 64 |
| `tools/bake/mass.js` | Rapier-equivalent mass properties of sidecar colliders |
| `tools/bake/config.js` | `loadConfig(dir)`, strict key check, defaults, `importFresh` |
| `tools/bake/read.js` | shared `NodeIO` with meshopt codecs, renames, palette → `COLOR_0` |
| `tools/bake/conventions.js` | node classification and the A-2 checks; name sanitising |
| `tools/bake/colliders.js` | sidecar collider entries (fitted primitives, hulls, meshes); bounds |
| `tools/bake/sockets.js` | `sock-*` → `{ p, q, part }` |
| `tools/bake/animTable.js` | `<model>.anim.json` sampling |
| `tools/bake/optimise.js` | gltf-transform pipeline |
| `tools/bake/write.js` | `baked/` writer and reader, sha256 |
| `tools/bake/index.js` | `bake()`, `bakeModel()`, `sources()`, `loadRegistry()`, `loadConfig` re-export (`lion-hawk/bake`) |
| `tools/build/out.js` | output dir resolution and the `site/exp/` guard; `UsageError` |
| `tools/build/page.js` | template fill and the B-5 stamps |
| `tools/build/index.js` | `build()`, plus a `dedupe` re-export (`lion-hawk/build`) |
| `tools/dev/index.js` | `dev()` server |
| `tools/cli.js` | argv parsing and exit codes |
| `bin/lion-hawk.js` | executable entry |
| `test/fixtures/models/make.mjs` | fixture GLB builders (crate, cart, ramp, pet, palette) |
| `test/fixtures/models/game/**` | fixture game: `game.config.js`, `materials.js`, `package.json`, `assets/models/*.glb`, committed `baked/`, `src/main.js`, `template.html`, `build.hooks.js`, `pwa/` |
| `test/helpers/bakeGame.mjs`, `test/helpers/rapierMass.mjs` | temp game dirs; the Rapier mass reference |
| `test/bake-*.test.mjs`, `test/build-*.test.mjs`, `test/cli.test.mjs` | the tests below (new files; `test/build.test.mjs` is untouched) |
| `docs/plans/2026-10-13-phase-3d-bake-notes.md` | notes and field-note candidates |

`tools/dedupe.js` stays where it is and unchanged; `tools/build/index.js` re-exports it.

---

## Tasks

### Task 0: Worktree and dependencies

**Files:** none (checks only).

- [ ] **Step 1:** Create the worktree from `phase-3` after 3a has merged:
  `git -C ~/projects/four43/lion-hawk-engine worktree add ~/projects/four43/lion-hawk-engine-3d -b phase-3-bake phase-3`.
- [ ] **Step 2:** Check the dependencies (3a's integrator adds gltf-transform and meshoptimizer; `pngjs` and the esbuild move are integrator request 1):
  `cd ~/projects/four43/lion-hawk-engine-3d && npm install && node -e "Promise.all(['@gltf-transform/core','@gltf-transform/extensions','@gltf-transform/functions','meshoptimizer','pngjs','esbuild','three','@dimforge/rapier3d-compat'].map(m=>import(m))).then(()=>console.log('deps ok'))"`
  Expected: `deps ok`. If any is missing, stop and send integrator request 1. Do not edit `package.json`.
- [ ] **Step 3:** `node -p "require('./node_modules/@gltf-transform/functions/package.json').version + ' ' + require('./node_modules/meshoptimizer/package.json').version"`. Expected: `4.5.1 1.2.0`. Any other version goes into the notes before you continue (Task 9's load test is the real gate).

### Task 1: Math helpers and the convex hull

**Files:** create `tools/bake/math.js`, `tools/bake/hull.js`, `test/bake-hull.test.mjs`.
**Interfaces:**
- Produces `hull(points: number[][]) → { points: number[][], tris: number[][] } | null`.
- Produces `decimate(points, max = 64) → number[][]`.
- Produces the math helpers `r6`, `r6a`, `sub`, `dot`, `cross`, `len`, `xfPoint`, `mul`, `compose`, `decompose`, `qmul`, `qmat`, `matq`.

- [ ] **Step 1: Write the failing test** `test/bake-hull.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hull, decimate } from '../tools/bake/hull.js';

const cube = [];
for (const x of [-1, 1]) for (const y of [0, 2]) for (const z of [-0.5, 0.5]) cube.push([x, y, z]);
const sorted = pts => pts.map(p => p.join(',')).sort();

test('3d: the hull of a cube plus interior and duplicate points is its 8 corners, 12 outward triangles', () => {
  const h = hull([[0, 1, 0], ...cube, [0.5, 1.5, 0.1], cube[3]]);
  assert.deepEqual(sorted(h.points), sorted(cube));
  assert.equal(h.tris.length, 12);
  const c = [0, 1, 0];
  for (const [i, j, k] of h.tris) {           // every face normal points away from the centre
    const a = h.points[i], b = h.points[j], d = h.points[k];
    const u = [0, 1, 2].map(n => b[n] - a[n]), v = [0, 1, 2].map(n => d[n] - a[n]);
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(nrm[0] * (a[0] - c[0]) + nrm[1] * (a[1] - c[1]) + nrm[2] * (a[2] - c[2]) > 0, `face ${i},${j},${k} faces inwards`);
  }
});
test('3d: flat, collinear and too-few point sets have no hull', () => {
  assert.equal(hull([[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0.5, 0, 0.5]]), null);
  assert.equal(hull([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]]), null);
  assert.equal(hull([[0, 0, 0], [1, 0, 0], [0, 1, 0]]), null);
});
test('3d: decimate keeps at most max support points, all from the input, and the hull is order-independent', () => {
  const pts = []; let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) { const a = rnd() * 6.283, b = Math.acos(2 * rnd() - 1); pts.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]); }
  const h = hull(pts);
  assert.ok(h.points.length > 64);
  const d = decimate(h.points, 64), keys = new Set(h.points.map(p => p.join(',')));
  assert.ok(d.length >= 32 && d.length <= 64, `kept ${d.length}`);
  for (const p of d) assert.ok(keys.has(p.join(',')));
  assert.equal(hull(d).points.length, d.length);   // every kept point is a hull vertex
  assert.deepEqual(decimate(cube, 64), cube);       // under the cap: unchanged
  assert.deepEqual(sorted(hull([...pts].reverse()).points), sorted(h.points));
});
```
- [ ] **Step 2:** `RUN test/bake-hull.test.mjs`. Expected: FAIL with `Cannot find module '.../tools/bake/hull.js'`.
- [ ] **Step 3: Implement** `tools/bake/math.js`:
```js
// Small vector, quaternion and matrix helpers for the bake (Node only). Matrices are column-major 4x4 arrays, as glTF and three.js.
import { MathUtils } from '@gltf-transform/core';

export const r6 = v => Math.round(v * 1e6) / 1e6 + 0;           // 6 decimals, and no -0, for stable JSON
export const r6a = a => Array.from(a, r6);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const xfPoint = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
  }
  return o;
}
export const compose = (t, q, s) => Array.from(MathUtils.compose(t, q, s, new Array(16)));
export function decompose(m) {
  const t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1];
  MathUtils.decompose(m, t, q, s);
  return { t, q, s };
}
// q * r (apply r first)
export const qmul = (q, r) => [
  q[3] * r[0] + q[0] * r[3] + q[1] * r[2] - q[2] * r[1],
  q[3] * r[1] - q[0] * r[2] + q[1] * r[3] + q[2] * r[0],
  q[3] * r[2] + q[0] * r[1] - q[1] * r[0] + q[2] * r[3],
  q[3] * r[3] - q[0] * r[0] - q[1] * r[1] - q[2] * r[2]];
// 3x3 rotation (rows) of a unit quaternion
export function qmat(q) {
  const [x, y, z, w] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
// unit quaternion of a proper rotation matrix (rows)
export function matq(m) {
  const tr = m[0][0] + m[1][1] + m[2][2]; let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / s; x = s / 4; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = s / 4; z = (m[1][2] + m[2][1]) / s; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w), sg = w < 0 ? -1 : 1;
  return [sg * x / l, sg * y / l, sg * z / l, sg * w / l];
}
```
and `tools/bake/hull.js`:
```js
// Convex hull for col-hull and the default per-(part, material) hulls (A-6). Incremental hull over points in input order, so
// the result is deterministic. hull(points) → { points: [[x,y,z]...], tris: [[i,j,k]...] } with outward winding, or null when
// the points span no volume. decimate(points, max) keeps the support points of `max` fixed directions (Fibonacci sphere).
import { sub, dot, cross, len } from './math.js';

export function hull(input) {
  const seen = new Map(), pts = [];
  for (const p of input) { const k = p.map(v => Math.round(v * 1e6)).join(','); if (!seen.has(k)) { seen.set(k, pts.length); pts.push(p); } }
  if (pts.length < 4) return null;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const eps = 1e-7 * Math.max(1e-9, len(sub(hi, lo)));
  // initial tetrahedron: x extremes, the point farthest from that line, the point farthest from that plane
  let a = 0, b = 0;
  for (let i = 1; i < pts.length; i++) { if (pts[i][0] < pts[a][0]) a = i; if (pts[i][0] > pts[b][0]) b = i; }
  if (a === b) { let best = -1; for (let i = 0; i < pts.length; i++) { const d = len(sub(pts[i], pts[a])); if (d > best) { best = d; b = i; } } }
  const ab = sub(pts[b], pts[a]);
  let c = -1, bc = eps;
  for (let i = 0; i < pts.length; i++) { const d = len(cross(ab, sub(pts[i], pts[a]))) / (len(ab) || 1); if (d > bc) { bc = d; c = i; } }
  if (c < 0) return null;
  const n0 = cross(ab, sub(pts[c], pts[a])), nl = len(n0);
  let d4 = -1, bd = eps;
  for (let i = 0; i < pts.length; i++) { const d = Math.abs(dot(n0, sub(pts[i], pts[a]))) / nl; if (d > bd) { bd = d; d4 = i; } }
  if (d4 < 0) return null;
  const centre = [0, 1, 2].map(k => (pts[a][k] + pts[b][k] + pts[c][k] + pts[d4][k]) / 4);
  let faces = [];
  const face = (i, j, k) => {
    let n = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    if (dot(n, sub(centre, pts[i])) > 0) { [j, k] = [k, j]; n = n.map(v => -v); }
    const l = len(n) || 1; n = n.map(v => v / l);
    return { v: [i, j, k], n, d: dot(n, pts[i]) };
  };
  faces.push(face(a, b, c), face(a, b, d4), face(a, c, d4), face(b, c, d4));
  for (let p = 0; p < pts.length; p++) {
    if (p === a || p === b || p === c || p === d4) continue;
    const vis = faces.filter(f => dot(f.n, pts[p]) - f.d > eps);
    if (!vis.length) continue;
    const edges = new Set();
    for (const f of vis) for (let e = 0; e < 3; e++) edges.add(f.v[e] + ',' + f.v[(e + 1) % 3]);
    const horizon = [];
    for (const f of vis) for (let e = 0; e < 3; e++) {
      const i = f.v[e], j = f.v[(e + 1) % 3];
      if (!edges.has(j + ',' + i)) horizon.push([i, j]);
    }
    faces = faces.filter(f => !vis.includes(f));
    for (const [i, j] of horizon) {
      let n = cross(sub(pts[j], pts[i]), sub(pts[p], pts[i])); const l = len(n) || 1; n = n.map(v => v / l);
      faces.push({ v: [i, j, p], n, d: dot(n, pts[i]) });
    }
  }
  const used = [...new Set(faces.flatMap(f => f.v))].sort((x, y) => x - y), remap = new Map(used.map((v, i) => [v, i]));
  return { points: used.map(i => pts[i]), tris: faces.map(f => f.v.map(v => remap.get(v))) };
}

export function decimate(points, max = 64) {
  if (points.length <= max) return points;
  const out = new Set(), g = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < max; k++) {
    const y = 1 - (2 * k + 1) / max, r = Math.sqrt(1 - y * y), dir = [Math.cos(g * k) * r, y, Math.sin(g * k) * r];
    let best = 0, bd = -Infinity;
    for (let i = 0; i < points.length; i++) { const d = dot(points[i], dir); if (d > bd) { bd = d; best = i; } }
    out.add(best);
  }
  return [...out].sort((x, y) => x - y).map(i => points[i]);
}
```
- [ ] **Step 4:** `RUN test/bake-hull.test.mjs`. Expected: PASS (3 tests).
- [ ] **Step 5: Prove red by mutation.** In `hull.js`, change `if (dot(n, sub(centre, pts[i])) > 0)` to `< 0`. Run again and expect the outward-normal assertion to fail. Revert.
- [ ] **Step 6:** `git add tools/bake/math.js tools/bake/hull.js test/bake-hull.test.mjs && git commit -m "feat(bake): convex hull and decimation for sidecar colliders"`

### Task 2: Mass properties equal to Rapier's

**Files:** create `tools/bake/mass.js`, `test/helpers/rapierMass.mjs`, `test/bake-mass.test.mjs`.
**Interfaces:**
- Consumes `hull()` (Task 1).
- Produces `massOf(colliders, density: (id) => kg/m³) → { mass, com: [3], inertia: [3], frame: [x,y,z,w] }` over sidecar collider entries (§4.3 shape).

- [ ] **Step 1: Write the failing tests.** `test/helpers/rapierMass.mjs`:
```js
// Rapier 0.21 as the reference for the bake's mass properties (3d). rapierMass(colliders, density) builds one dynamic body
// from sidecar-shaped colliders and returns { mass, com, tensor }; assertMassClose(sidecarMass, that) checks mass, centre and
// the full inertia tensor (principal values rotated by the frame) to 1%.
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

// a Rapier body built from sidecar-shaped colliders: { mass, com, tensor (3x3 from principal inertia and frame) }
export function rapierMass(colliders, density) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }), body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
  for (const c of colliders) {
    const d = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(...c.half) : c.shape === 'sphere' ? RAPIER.ColliderDesc.ball(c.r)
      : c.shape === 'capsule' ? RAPIER.ColliderDesc.capsule(c.halfHeight, c.r) : c.shape === 'cylinder' ? RAPIER.ColliderDesc.cylinder(c.halfHeight, c.r)
      : c.shape === 'hull' ? RAPIER.ColliderDesc.convexHull(new Float32Array(c.points)) : RAPIER.ColliderDesc.trimesh(new Float32Array(c.vertices), new Uint32Array(c.indices));
    d.setTranslation(...c.p).setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] }).setDensity(density(c.material));
    world.createCollider(d, body);
  }
  const pi = body.principalInertia(), f = body.principalInertiaLocalFrame(), com = body.localCom();
  const out = { mass: body.mass(), com: [com.x, com.y, com.z], tensor: tensor([f.x, f.y, f.z, f.w], [pi.x, pi.y, pi.z]) };
  world.free();
  return out;
}
export function tensor(q, d) {
  const [x, y, z, w] = q, R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  return [0, 1, 2].map(i => [0, 1, 2].map(j => R[i][0] * d[0] * R[j][0] + R[i][1] * d[1] * R[j][1] + R[i][2] * d[2] * R[j][2]));
}
export function assertMassClose(mine, rapier, label = '') {
  const tol = 0.01;
  assert.ok(Math.abs(mine.mass - rapier.mass) <= tol * rapier.mass, `${label} mass ${mine.mass} vs ${rapier.mass}`);
  const size = Math.cbrt(rapier.mass / 1000) || 1;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(mine.com[k] - rapier.com[k]) <= tol * size, `${label} com[${k}] ${mine.com[k]} vs ${rapier.com[k]}`);
  const T = tensor(mine.frame, mine.inertia), big = Math.max(...rapier.tensor.flat().map(Math.abs));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(T[i][j] - rapier.tensor[i][j]) <= tol * big, `${label} I[${i}][${j}] ${T[i][j]} vs ${rapier.tensor[i][j]}`);
}
```
`test/bake-mass.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { massOf } from '../tools/bake/mass.js';
import { hull } from '../tools/bake/hull.js';
import { rapierMass, assertMassClose } from './helpers/rapierMass.mjs';

const DENSITY = { wood: 600, steel: 7850, rubber: 1100, air: 0 };
const S = Math.SQRT1_2;

const cloud = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 200; i++) cloud.push([rnd() * 1.5 - 0.75, rnd() - 0.5, rnd() * 0.6 - 0.3]);
const SHAPES = {
  box: { shape: 'box', half: [1, 0.25, 2], p: [0, 0.5, 0.2], q: [0, S, 0, S], material: 'wood' },
  sphere: { shape: 'sphere', r: 0.25, p: [0, 1, -1], q: [0, 0, 0, 1], material: 'steel' },
  capsule: { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: [1, 0, 0], q: [0, 0, S, S], material: 'steel' },
  cylinder: { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: [-1, 0.2, 0.5], q: [S, 0, 0, S], material: 'rubber' },
  hull: { shape: 'hull', points: hull(cloud).points.flat(), p: [0, 0, 0], q: [0, 0, 0, 1], material: 'wood' },
  mesh: { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'wood' },
};

for (const [name, c] of Object.entries(SHAPES)) {
  test(`3d: ${name} mass properties match Rapier 0.21 to 1%`, () => {
    assertMassClose(massOf([c], id => DENSITY[id]), rapierMass([c], id => DENSITY[id]), name);
  });
}
test('3d: a body of every shape, offset and rotated, matches Rapier to 1% (parallel axis and principal frame)', () => {
  const all = Object.values(SHAPES);
  assertMassClose(massOf(all, id => DENSITY[id]), rapierMass(all, id => DENSITY[id]), 'all');
});
test('3d: zero-density colliders add nothing; an all-air body has zero mass', () => {
  const air = { ...SHAPES.box, material: 'air' };
  assert.deepEqual(massOf([air], id => DENSITY[id]), { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] });
  assert.deepEqual(massOf([air, SHAPES.sphere], id => DENSITY[id]), massOf([SHAPES.sphere], id => DENSITY[id]));
});
```
- [ ] **Step 2:** `RUN test/bake-mass.test.mjs`. Expected: FAIL, `Cannot find module '.../tools/bake/mass.js'`.
- [ ] **Step 3: Implement** `tools/bake/mass.js`:
```js
// Mass properties of sidecar colliders, computed the way Rapier (parry) does (A-5): per-shape volume, centre and inertia, moved
// into body space and summed with the parallel-axis rule, then diagonalised. massOf(colliders, density) →
// { mass, com, inertia: principal [ix, iy, iz], frame: quaternion of the principal axes }. density(id) → kg/m³.
import { qmat, matq, cross, sub, dot } from './math.js';
import { hull } from './hull.js';

// [volume, local centre, 3x3 inertia per unit density about that centre]
function shapeProps(c) {
  const Z = [0, 0, 0];
  if (c.shape === 'box') {
    const [x, y, z] = c.half, v = 8 * x * y * z;
    return [v, Z, diag(v / 3 * (y * y + z * z), v / 3 * (x * x + z * z), v / 3 * (x * x + y * y))];
  }
  if (c.shape === 'sphere') { const v = 4 / 3 * Math.PI * c.r ** 3, i = 0.4 * v * c.r * c.r; return [v, Z, diag(i, i, i)]; }
  if (c.shape === 'cylinder' || c.shape === 'capsule') {
    const r = c.r, h = 2 * c.halfHeight, vc = Math.PI * r * r * h;
    let ix = vc * (h * h / 12 + r * r / 4), iy = vc * r * r / 2, v = vc;
    if (c.shape === 'capsule') { const vb = 4 / 3 * Math.PI * r ** 3; v += vb; iy += 0.4 * vb * r * r; ix += 0.4 * vb * r * r + vb * (h * h / 4 + 3 * h * r / 8); }
    return [v, Z, diag(ix, iy, ix)];
  }
  if (c.shape === 'mesh') return polyProps(c.indices, c.vertices);
  if (c.shape === 'hull') {
    const pts = []; for (let i = 0; i < c.points.length; i += 3) pts.push([c.points[i], c.points[i + 1], c.points[i + 2]]);
    const h = hull(pts); return h ? polyProps(h.tris.flat(), h.points.flat()) : [0, [0, 0, 0], diag(0, 0, 0)];
  }
  throw new Error(`mass: unknown shape '${c.shape}'`);
}
const diag = (x, y, z) => [[x, 0, 0], [0, y, 0], [0, 0, z]];

// closed triangle mesh: signed tetrahedra from the origin, covariance form (Blow & Binstock)
function polyProps(tris, flat) {
  const P = i => [flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]];
  let vol = 0; const cm = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let t = 0; t < tris.length; t += 3) {
    const a = P(tris[t]), b = P(tris[t + 1]), c = P(tris[t + 2]), det = dot(a, cross(b, c)), v = det / 6;
    vol += v;
    for (let k = 0; k < 3; k++) cm[k] += v * (a[k] + b[k] + c[k]) / 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      C[i][j] += det / 120 * (a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + (a[i] + b[i] + c[i]) * (a[j] + b[j] + c[j]));
  }
  if (Math.abs(vol) < 1e-12) return [0, [0, 0, 0], diag(0, 0, 0)];
  const com = cm.map(x => x / vol);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] -= vol * com[i] * com[j];
  const tr = C[0][0] + C[1][1] + C[2][2];
  const I = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? tr : 0) - C[i][j]));
  return [vol, com, I];
}

// symmetric 3x3 → eigenvalues and eigenvectors (columns), cyclic Jacobi
function jacobi(A) {
  const a = A.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], V };
}

export function massOf(colliders, density) {
  let mass = 0; const com = [0, 0, 0], parts = [];
  for (const c of colliders) {
    const [v, lc, I] = shapeProps(c), m = v * density(c.material);
    if (!(m > 0)) continue;
    const R = qmat(c.q), wc = [0, 1, 2].map(i => c.p[i] + R[i][0] * lc[0] + R[i][1] * lc[1] + R[i][2] * lc[2]);
    // R (I·m) Rᵀ
    const Ib = [0, 1, 2].map(i => [0, 1, 2].map(j => { let s = 0; for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += R[i][k] * I[k][l] * R[j][l]; return s * density(c.material); }));
    parts.push({ m, c: wc, I: Ib }); mass += m; for (let k = 0; k < 3; k++) com[k] += m * wc[k];
  }
  if (!(mass > 0)) return { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] };
  for (let k = 0; k < 3; k++) com[k] /= mass;
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { m, c, I } of parts) {
    const d = sub(c, com), dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[i][j] += I[i][j] + m * ((i === j ? dd : 0) - d[i] * d[j]);
  }
  const { values, V } = jacobi(T);
  if (V[0][0] * (V[1][1] * V[2][2] - V[1][2] * V[2][1]) - V[0][1] * (V[1][0] * V[2][2] - V[1][2] * V[2][0]) + V[0][2] * (V[1][0] * V[2][1] - V[1][1] * V[2][0]) < 0)
    for (let k = 0; k < 3; k++) V[k][2] = -V[k][2];
  return { mass, com, inertia: values, frame: matq(V) };
}
```
- [ ] **Step 4:** `RUN test/bake-mass.test.mjs`. Expected: PASS (8 tests). Measured during planning: the composite matches Rapier to about 0.01%.
- [ ] **Step 5: Mutation.** Change the capsule term `3 * h * r / 8` to `3 * h * r / 4`. Run and expect the capsule and composite tests to fail. Revert.
- [ ] **Step 6:** `git add tools/bake/mass.js test/helpers/rapierMass.mjs test/bake-mass.test.mjs && git commit -m "feat(bake): Rapier-equivalent mass properties for sidecars"`

### Task 3: `game.config.js` loader

**Files:** create `tools/bake/config.js`, `test/bake-config.test.mjs`.
**Interfaces:**
- Produces `loadConfig(dir = '.') → Promise<Config>`, with the §4.3 shape plus `dir` and `version`. Per-model `file` and `colliders` are additions (contract issues C5 and C4).
- Produces `importFresh(file) → Promise<module>`.

- [ ] **Step 1: Failing test** `test/bake-config.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../tools/bake/config.js';

const game = (config, pkg) => {
  const dir = mkdtempSync(join(tmpdir(), 'lh-cfg-'));
  writeFileSync(join(dir, 'game.config.js'), `export default ${JSON.stringify(config)};\n`);
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
};

test('3d: loadConfig fills the engine defaults and reads the game version', async () => {
  const dir = game({ id: 'g', bake: { materials: './m.js', models: { pig: { animTable: true, sockets: ['hat'] } } } }, { version: '2.3.4' });
  const c = await loadConfig(dir);
  assert.equal(c.dir, dir); assert.equal(c.version, '2.3.4'); assert.equal(c.site, 'g'); assert.equal(c.outEnv, null);
  assert.deepEqual(c.bake.optimise, { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true });
  assert.deepEqual(c.bake.paint, { base: 'steel' });
  assert.equal(c.bake.src, 'assets/models'); assert.equal(c.bake.out, 'baked'); assert.equal(c.bake.palette, null);
  assert.deepEqual(c.bake.models.pig, { static: false, keepTextures: false, sockets: ['hat'], file: null, colliders: true,
    animTable: { fps: 30, clips: null }, rename: { materials: {}, nodes: {} } });
  assert.deepEqual(c.build, { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: null });
});
test('3d: a misspelt key fails loudly with its path', async () => {
  await assert.rejects(loadConfig(game({ id: 'g', bake: { optimize: { meshopt: false } } })), /config: unknown key 'bake\.optimize'/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { models: { pig: { socket: ['hat'] } } } })), /config: unknown key 'bake\.models\.pig\.socket'/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { models: { pig: { animTable: { fps: 30, clip: [] } } } } })), /unknown key 'bake\.models\.pig\.animTable\.clip'/);
  await assert.rejects(loadConfig(game({ id: 'g', buld: {} })), /unknown key 'buld'/);
});
test('3d: bad values and a missing config are reported', async () => {
  await assert.rejects(loadConfig(game({ bake: {} })), /config: 'id' must be a non-empty string/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { palette: 'texture' } })), /'bake\.palette' must be 'vertex' or absent/);
  await assert.rejects(loadConfig(game({ id: 'g', bake: { rename: 'x' } })), /'bake\.rename' must be an object/);
  await assert.rejects(loadConfig(mkdtempSync(join(tmpdir(), 'lh-cfg-'))), /config: no game\.config\.js in /);
});
test('3d: animTable false and a partial optimise block are accepted', async () => {
  const c = await loadConfig(game({ id: 'g', bake: { optimise: { meshopt: false }, models: { a: { animTable: false, colliders: false } } } }));
  assert.equal(c.bake.models.a.animTable, null); assert.equal(c.bake.models.a.colliders, false);
  assert.equal(c.bake.optimise.meshopt, false); assert.equal(c.bake.optimise.weld, true);
});
```
- [ ] **Step 2:** `RUN test/bake-config.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/config.js`:
```js
// game.config.js loader for the lion-hawk CLI (overview §4.3). loadConfig(dir) → the config with defaults filled in, plus
// `dir` (absolute game dir) and `version` (the game's package.json version). Unknown keys throw, so a typo such as
// `optimize` fails instead of being ignored.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// import a game module fresh whenever its content changes (tests and `dev` edit configs and registries in one process)
export const importFresh = file => import(`${pathToFileURL(file).href}?v=${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)}`);

const KEYS = {
  '': ['id', 'site', 'outEnv', 'bake', 'build'],
  bake: ['src', 'out', 'materials', 'rename', 'palette', 'paint', 'models', 'optimise'],
  'bake.rename': ['materials', 'nodes'],
  'bake.paint': ['base'],
  'bake.optimise': ['meshopt', 'quantize', 'weld', 'prune', 'dedupe'],
  'bake.models.*': ['static', 'rename', 'keepTextures', 'animTable', 'sockets', 'file', 'colliders'],
  'bake.models.*.rename': ['materials', 'nodes'],
  'bake.models.*.animTable': ['fps', 'clips'],
  build: ['entry', 'template', 'pwa', 'hooks'],
};
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkKeys(obj, path, pattern) {
  const allowed = KEYS[pattern];
  for (const k of Object.keys(obj)) {
    const at = path ? `${path}.${k}` : k;
    if (!allowed.includes(k)) throw new Error(`config: unknown key '${at}'`);
    const sub = pattern ? `${pattern}.${k}` : k;
    if (pattern === 'bake' && k === 'models') {
      if (!isObj(obj.models)) throw new Error(`config: '${at}' must be an object`);
      for (const [id, m] of Object.entries(obj.models)) {
        if (!isObj(m)) throw new Error(`config: '${at}.${id}' must be an object`);
        checkKeys(m, `${at}.${id}`, 'bake.models.*');
      }
    } else if (KEYS[sub] && isObj(obj[k])) checkKeys(obj[k], at, sub);
    else if (KEYS[sub] && !(sub === 'bake.models.*.animTable' && typeof obj[k] === 'boolean')) throw new Error(`config: '${at}' must be an object`);
  }
}

export async function loadConfig(dir = '.') {
  const gameDir = resolve(dir), file = join(gameDir, 'game.config.js');
  if (!existsSync(file)) throw new Error(`config: no game.config.js in ${gameDir}`);
  const raw = (await importFresh(file)).default;
  if (!isObj(raw)) throw new Error(`config: ${file} has no default export object`);
  checkKeys(raw, '', '');
  if (typeof raw.id !== 'string' || !raw.id) throw new Error(`config: 'id' must be a non-empty string`);
  const pkgFile = join(gameDir, 'package.json');
  const version = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')).version ?? '0.0.0' : '0.0.0';
  const b = raw.bake ?? {};
  if (b.palette != null && b.palette !== 'vertex') throw new Error(`config: 'bake.palette' must be 'vertex' or absent (got ${JSON.stringify(b.palette)})`);
  const models = {};
  for (const [id, m] of Object.entries(b.models ?? {})) {
    const at = m.animTable === true ? { fps: 30, clips: null } : m.animTable ? { fps: m.animTable.fps ?? 30, clips: m.animTable.clips ?? null } : null;
    models[id] = { static: !!m.static, keepTextures: !!m.keepTextures, sockets: m.sockets ?? [], file: m.file ?? null,
      colliders: m.colliders !== false, animTable: at, rename: { materials: m.rename?.materials ?? {}, nodes: m.rename?.nodes ?? {} } };
  }
  return {
    dir: gameDir, version, id: raw.id, site: raw.site ?? raw.id, outEnv: raw.outEnv ?? null,
    bake: {
      src: b.src ?? 'assets/models', out: b.out ?? 'baked', materials: b.materials ?? null, palette: b.palette ?? null,
      paint: { base: b.paint?.base ?? 'steel' },
      rename: { materials: b.rename?.materials ?? {}, nodes: b.rename?.nodes ?? {} },
      optimise: { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true, ...(b.optimise ?? {}) },
      models,
    },
    build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: null, ...(raw.build ?? {}) },
  };
}
```
- [ ] **Step 4:** `RUN test/bake-config.test.mjs`. Expected: PASS (4 tests).
- [ ] **Step 5:** `git add tools/bake/config.js test/bake-config.test.mjs && git commit -m "feat(bake): game.config.js loader with strict keys and defaults"`

### Task 4: Fixture models and the fixture game

**Files:**
- create `test/fixtures/models/make.mjs`;
- create `test/fixtures/models/game/{game.config.js,materials.js,package.json}`;
- create `test/fixtures/models/game/assets/models/{cart,crate,palette,pet,ramp}.glb` (generated);
- create `test/helpers/bakeGame.mjs` and `test/bake-fixtures.test.mjs`.

**Interfaces:**
- Produces `MODELS: { crate, cart, ramp, pet, palette }: () => builder`, `build(name) → Promise<Uint8Array>`, `model()` and the geometry helpers `boxGeom`, `cylinderXGeom`, `wedgeGeom`, `octaGeom`, `planeGeom`.
- Produces `copyFixture({ baked }) → dir`, `gameWith(models, bake) → dir`, `stubThree(dir)` and `FIXTURE`.
- The fixture registry is duck-typed to 3b's contract (`has`, `density`, `hash`, `ids`); see contract issue C9. Task 16 swaps it for `defineMaterials` once 3b is on the branch.

- [ ] **Step 1: Failing test** `test/bake-fixtures.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODELS, build } from './fixtures/models/make.mjs';

test('3d: the committed fixture models are exactly what make.mjs writes (no drift)', async () => {
  for (const name of Object.keys(MODELS)) {
    const committed = readFileSync(new URL(`./fixtures/models/game/assets/models/${name}.glb`, import.meta.url));
    assert.ok(Buffer.from(await build(name)).equals(committed), `${name}.glb differs: run node test/fixtures/models/make.mjs`);
  }
});
```
- [ ] **Step 2:** `RUN test/bake-fixtures.test.mjs`. Expected: FAIL, `Cannot find module '.../fixtures/models/make.mjs'`.
- [ ] **Step 3: Implement.** `test/fixtures/models/make.mjs`:
```js
// Fixture models for the bake tests (3d). `node test/fixtures/models/make.mjs` rewrites game/assets/models/*.glb; the bake
// tests also call the builders to make broken models in temp dirs. Every model is plain geometry made here, so the tests never
// need the Kenney pack. build(name) → Uint8Array (GLB bytes); MODELS lists the committed ones.
import { Document, NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const S = Math.SQRT1_2;
// box of size [sx, sy, sz] centred at c: 24 vertices (flat normals), 36 indices
export function boxGeom([sx, sy, sz], c = [0, 0, 0]) {
  const pos = [], nrm = [], uv = [], idx = [], h = [sx / 2, sy / 2, sz / 2];
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [ax, sg] of faces) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0]; p[ax] = sg * h[ax]; p[u] = a * h[u]; p[v] = b * h[v];
      pos.push(p[0] + c[0], p[1] + c[1], p[2] + c[2]); const n = [0, 0, 0]; n[ax] = sg; nrm.push(...n); uv.push((a + 1) / 4, (b + 1) / 2);
    }
    idx.push(...(sg > 0 ? [base, base + 1, base + 2, base, base + 2, base + 3] : [base, base + 2, base + 1, base, base + 3, base + 2]));
  }
  return { pos, nrm, uv, idx };
}
// cylinder along x, radius r, length l, n segments, centred at the origin (caps included)
export function cylinderXGeom(r, l, n = 12) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i < n; i++) for (const x of [-l / 2, l / 2]) { const a = i / n * 2 * Math.PI; pos.push(x, r * Math.cos(a), r * Math.sin(a)); nrm.push(0, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < n; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); idx.push(a, b, a + 1, a + 1, b, b + 1); }
  for (const [x, sg] of [[-l / 2, -1], [l / 2, 1]]) {
    const c = pos.length / 3; pos.push(x, 0, 0); nrm.push(sg, 0, 0);
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; pos.push(x, r * Math.cos(a), r * Math.sin(a)); nrm.push(sg, 0, 0); }
    for (let i = 0; i < n; i++) { const a = c + 1 + i, b = c + 1 + (i + 1) % n; idx.push(...(sg > 0 ? [c, a, b] : [c, b, a])); }
  }
  return { pos, nrm, idx };
}
// a wedge (ramp) with unwelded, flat-shaded triangles: 8 triangles, 24 vertices, 6 distinct corners
export function wedgeGeom(w = 2, h = 1, d = 3) {
  const A = [-w / 2, 0, 0], B = [w / 2, 0, 0], C = [w / 2, 0, d], D = [-w / 2, 0, d], E = [-w / 2, h, 0], F = [w / 2, h, 0];
  const tris = [[A, B, C], [A, C, D], [A, F, B], [A, E, F], [E, C, F], [E, D, C], [A, D, E], [B, F, C]]; // outward winding
  const pos = [], nrm = [], idx = [];
  for (const t of tris) for (const p of t) { idx.push(pos.length / 3); pos.push(...p); nrm.push(0, 1, 0); }
  return { pos, nrm, idx };
}
export const octaGeom = (r, c = [0, 0, 0]) => {
  const P = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map(p => p.map((v, k) => v + c[k]));
  const T = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  return { pos: P.flat(), nrm: P.flatMap(() => [0, 1, 0]), idx: T.flat() };
};
export const planeGeom = (s = 1) => ({ pos: [-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], idx: [0, 2, 1, 0, 3, 2] });

// A small document builder: m = model(); m.mesh(name, [[geom, material], ...]); m.node(name, { mesh, t, r, s, extras, parent })
export function model() {
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene('Scene'), mats = new Map(), nodes = new Map();
  doc.getRoot().setDefaultScene(scene);
  const acc = (arr, type, C) => doc.createAccessor().setType(type).setArray(new C(arr)).setBuffer(buf);
  const api = {
    doc, nodes,
    material(name, extras) {
      if (!mats.has(name)) { const m = doc.createMaterial(name); if (extras) m.setExtras(extras); mats.set(name, m); }
      return mats.get(name);
    },
    prim(g, material, { mode } = {}) {
      const p = doc.createPrimitive().setAttribute('POSITION', acc(g.pos, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(g.nrm, 'VEC3', Float32Array)).setIndices(acc(g.idx, 'SCALAR', Uint16Array));
      if (g.uv) p.setAttribute('TEXCOORD_0', acc(g.uv, 'VEC2', Float32Array));
      if (g.tan) p.setAttribute('TANGENT', acc(g.tan, 'VEC4', Float32Array));
      if (g.col) p.setAttribute('COLOR_0', acc(g.col, 'VEC3', Float32Array));
      if (material !== null) p.setMaterial(api.material(material));
      if (mode !== undefined) p.setMode(mode);
      return p;
    },
    mesh(name, prims) { const m = doc.createMesh(name); for (const [g, mat, o] of prims) m.addPrimitive(api.prim(g, mat, o)); return m; },
    node(name, { mesh, t, r, s, extras, parent } = {}) {
      const n = doc.createNode(name);
      if (mesh) n.setMesh(mesh); if (t) n.setTranslation(t); if (r) n.setRotation(r); if (s) n.setScale(s); if (extras) n.setExtras(extras);
      (parent ? nodes.get(parent) : scene).addChild(n); nodes.set(name, n); return n;
    },
    // keyframes: [[t, value[]], ...] on node.path (translation | rotation | scale)
    animate(clip, nodeName, path, keys, interpolation = 'LINEAR') {
      let a = doc.getRoot().listAnimations().find(x => x.getName() === clip); if (!a) a = doc.createAnimation(clip);
      const s = doc.createAnimationSampler().setInput(acc(keys.map(k => k[0]), 'SCALAR', Float32Array))
        .setOutput(acc(keys.flatMap(k => k[1]), path === 'rotation' ? 'VEC4' : 'VEC3', Float32Array)).setInterpolation(interpolation);
      a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(nodeName)).setTargetPath(path).setSampler(s));
    },
    bytes: () => new NodeIO().writeBinary(doc),
  };
  return api;
}

const qy = deg => [0, Math.sin(deg * Math.PI / 360), 0, Math.cos(deg * Math.PI / 360)];
const qx = deg => [Math.sin(deg * Math.PI / 360), 0, 0, Math.cos(deg * Math.PI / 360)];

export const MODELS = {
  // one part, no col-*: one default hull (8 points), 1 m³ of wood
  crate() { const m = model(); m.node('body', { mesh: m.mesh('body', [[boxGeom([1, 1, 1], [0, 0.5, 0]), 'wood']]) }); return m; },
  // every collider shape, paint, extras.material, extras.part, sockets with and without a part
  cart() {
    const m = model();
    m.node('body', { t: [0, 0.5, 0], mesh: m.mesh('body', [[boxGeom([2, 0.5, 3]), 'paint-body'], [boxGeom([0.5, 0.3, 0.5], [0, 0.4, 0]), 'plastic']]) });
    m.node('col-box', { parent: 'body', r: qy(30), mesh: m.mesh('cb', [[boxGeom([2, 0.5, 3]), 'proxy']]) });
    m.node('col-box.001', { parent: 'body', t: [0, 0.5, 1], extras: { material: 'rubber' }, mesh: m.mesh('cb1', [[boxGeom([0.4, 0.2, 0.4]), 'proxy']]) });
    m.node('col-hull', { parent: 'body', mesh: m.mesh('ch', [[octaGeom(0.5, [0, 0.5, -1]), 'proxy']]) });
    m.node('sock-hitch', { parent: 'body', t: [0, 0, -1.6] });
    m.node('wheel', { t: [1.1, 0.3, 1], mesh: m.mesh('wheel', [[cylinderXGeom(0.3, 0.2), 'rubber']]) });
    m.node('col-cylinder', { parent: 'wheel', mesh: m.mesh('cc', [[cylinderXGeom(0.3, 0.2), 'proxy']]) });
    m.node('mast', { t: [0, 1.25, -1], mesh: m.mesh('mast', [[boxGeom([0.2, 1, 0.2]), 'steel']]) });
    m.node('col-capsule', { parent: 'mast', mesh: m.mesh('cp', [[boxGeom([0.2, 1, 0.2]), 'proxy']]) });
    m.node('col-sphere', { t: [0, 1, 0], extras: { part: 'body' }, mesh: m.mesh('cs', [[boxGeom([0.5, 0.5, 0.5]), 'proxy']]) });
    m.node('sock-seat', { t: [0, 1, 0], r: qx(90) });
    m.node('lamp.001', { parent: 'mast', t: [0, 0.6, 0], mesh: m.mesh('lamp', [[boxGeom([0.1, 0.1, 0.1]), 'plastic']]) });
    m.node('lamp.001', { parent: 'mast', t: [0, 0.8, 0], mesh: m.mesh('lamp', [[boxGeom([0.1, 0.1, 0.1]), 'plastic']]) });
    return m;
  },
  // static: one welded col-mesh
  ramp() { const m = model(); m.node('ramp', { mesh: m.mesh('ramp', [[wedgeGeom(), 'wood']]) }); return m; },
  // Cube Pets shape: renamed material and socket, nested parts, two clips
  pet() {
    const m = model();
    m.node('animal-pet'); m.node('root', { parent: 'animal-pet' });
    m.node('body', { parent: 'root', t: [0, 0.2, 0], mesh: m.mesh('body', [[boxGeom([0.6, 0.4, 0.8], [0, 0.2, 0]), 'colormap']]) });
    m.node('Group', { parent: 'body', t: [0, 0.4, 0.4], mesh: m.mesh('head', [[boxGeom([0.4, 0.4, 0.4]), 'colormap']]) });
    m.node('hat', { parent: 'body', t: [0, 0.7, 0.4] });
    m.node('leg-left', { parent: 'root', t: [0.2, 0.2, 0], mesh: m.mesh('leg', [[boxGeom([0.15, 0.3, 0.15], [0, -0.1, 0]), 'colormap']]) });
    m.node('leg-right', { parent: 'root', t: [-0.2, 0.2, 0], mesh: m.mesh('leg2', [[boxGeom([0.15, 0.3, 0.15], [0, -0.1, 0]), 'colormap']]) });
    m.animate('walk', 'leg-left', 'rotation', [[0, qx(-30)], [0.5, qx(30)], [1, qx(-30)]]);
    m.animate('walk', 'body', 'translation', [[0, [0, 0.2, 0]], [0.5, [0, 0.3, 0]], [1, [0, 0.2, 0]]]);
    m.animate('idle', 'body', 'scale', [[0, [1, 1, 1]], [1, [1, 1.2, 1]], [2, [1, 1, 1]]], 'STEP');
    return m;
  },
  // Kenney-style palette texture: TEXCOORD_0 + TANGENT into a 2x1 PNG (left red, right blue)
  palette() {
    const m = model(), png = new PNG({ width: 2, height: 1 });
    png.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const tex = m.doc.createTexture('colormap').setImage(PNG.sync.write(png)).setMimeType('image/png');
    m.material('colormap').setBaseColorTexture(tex);
    const g = boxGeom([1, 1, 1], [0, 0.5, 0]);
    g.uv = g.pos.map((_, i) => i).filter(i => i % 3 === 0).flatMap((_, v) => [g.pos[v * 3] < 0 ? 0.25 : 0.75, 0.5]);
    g.tan = Array.from({ length: g.pos.length / 3 }, () => [1, 0, 0, 1]).flat();
    m.node('cone', { mesh: m.mesh('cone', [[g, 'colormap']]) });
    return m;
  },
};

export const build = async name => MODELS[name]().bytes();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of Object.keys(MODELS)) writeFileSync(new URL(`./game/assets/models/${name}.glb`, import.meta.url), await build(name));
  console.log('wrote', Object.keys(MODELS).join(', '));
}
```
`test/fixtures/models/game/materials.js`:
```js
// Fixture material registry for the bake tests: the members the bake reads (has, density, hash), shaped like 3b's
// defineMaterials registry. Densities are sg × 1000 for the base entries the fixtures name.
const DENSITY = { steel: 7850, wood: 600, rubber: 1100, plastic: 950, flesh: 1000 };
export default Object.freeze({
  ids: Object.freeze(Object.keys(DENSITY)),
  has: id => Object.hasOwn(DENSITY, id),
  density: id => { if (!Object.hasOwn(DENSITY, id)) throw new Error(`materials: unknown material '${id}'`); return DENSITY[id]; },
  hash: '0f1e7a2b',
});
```
`test/fixtures/models/game/game.config.js`. It names `build.hooks.js`, which Task 13 adds; `loadConfig` does not open it.
```js
// Fixture game for the lion-hawk CLI tests (3d): every bake convention and the build steps on five small models.
export default {
  id: 'fixture', site: 'fixture', outEnv: 'LH_FIXTURE_OUT',
  bake: {
    materials: './materials.js', palette: 'vertex', paint: { base: 'steel' },
    rename: { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } },
    models: {
      ramp: { static: true },
      pet: { animTable: { fps: 10, clips: ['walk', 'idle'] }, sockets: ['hat'] },
      palette: { rename: { materials: { colormap: 'plastic' } } },
    },
  },
  build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: './build.hooks.js' },
};
```
`test/fixtures/models/game/package.json`:
```json
{ "name": "lh-fixture-game", "version": "1.2.3", "private": true, "type": "module" }
```
`test/helpers/bakeGame.mjs`:
```js
// Temp game dirs for the 3d bake, build and CLI tests. copyFixture() copies test/fixtures/models/game (optionally without its
// committed baked/) and stubs `three` in its node_modules, so a build proves dedupe resolves from the game root.
// gameWith({ id: bytes }, bake) writes a one-off game with the fixture registry and the given bake config.
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const FIXTURE = fileURLToPath(new URL('../fixtures/models/game', import.meta.url));

export function stubThree(dir) {
  mkdirSync(join(dir, 'node_modules/three'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/three/package.json'), '{"name":"three","type":"module","main":"index.js"}');
  writeFileSync(join(dir, 'node_modules/three/index.js'), 'export const REVISION = "game-copy";\n');
}

export function copyFixture({ baked = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: src => baked || relative(FIXTURE, src).split(sep)[0] !== 'baked' });
  stubThree(dir);
  return dir;
}

export function gameWith(models, bake = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-game-'));
  mkdirSync(join(dir, 'assets/models'), { recursive: true });
  copyFileSync(join(FIXTURE, 'materials.js'), join(dir, 'materials.js'));
  for (const [id, bytes] of Object.entries(models)) writeFileSync(join(dir, 'assets/models', `${id}.glb`), bytes);
  writeFileSync(join(dir, 'game.config.js'), `export default ${JSON.stringify({ id: 't', bake: { materials: './materials.js', ...bake } })};\n`);
  return dir;
}
```
- [ ] **Step 4:** Generate the GLBs with `node test/fixtures/models/make.mjs`. Expected: `wrote crate, cart, ramp, pet, palette`. Then `RUN test/bake-fixtures.test.mjs`. Expected: PASS.
- [ ] **Step 5:** `git add test/fixtures/models test/helpers/bakeGame.mjs test/bake-fixtures.test.mjs && git commit -m "test(bake): fixture models and fixture game for the CLI"`

### Task 5: Reading sources, renames, palette → vertex colours

**Files:** create `tools/bake/read.js`, `test/bake-read.test.mjs`.
**Interfaces:**
- Produces `getIO() → Promise<NodeIO>` (memoised, meshopt codecs registered) and the re-exported `MeshoptEncoder`.
- Produces `applyRenames(doc, { materials, nodes })` and `paletteToVertex(doc, model)`.

- [ ] **Step 1: Failing test** `test/bake-read.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getIO, applyRenames, paletteToVertex } from '../tools/bake/read.js';
import { build } from './fixtures/models/make.mjs';

test('3d: palette textures become linear vertex colours; UVs, tangents and the texture go', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('palette'));
  paletteToVertex(doc, 'palette');
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0], P = prim.getAttribute('POSITION'), C = prim.getAttribute('COLOR_0');
  assert.ok(C); assert.equal(prim.getAttribute('TEXCOORD_0'), null); assert.equal(prim.getAttribute('TANGENT'), null);
  assert.equal(doc.getRoot().listTextures().length, 0);
  assert.equal(prim.getMaterial().getBaseColorTexture(), null);
  const p = [], c = [];
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); C.getElement(i, c);
    assert.deepEqual(Array.from(c), p[0] < 0 ? [1, 0, 0] : [0, 0, 1], `vertex ${i} at x=${p[0]}`);   // left texel red, right blue
  }
});
test('3d: primitives that already have COLOR_0 are left alone', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('crate'));
  const before = await io.writeBinary(doc);
  paletteToVertex(doc, 'crate');
  assert.ok(Buffer.from(await io.writeBinary(doc)).equals(Buffer.from(before)));
});
test('3d: renames apply to materials and nodes by exact name', async () => {
  const io = await getIO(), doc = await io.readBinary(await build('pet'));
  applyRenames(doc, { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat', body: 'torso' } });
  assert.deepEqual(doc.getRoot().listMaterials().map(m => m.getName()), ['flesh']);
  const names = doc.getRoot().listNodes().map(n => n.getName());
  assert.ok(names.includes('sock-hat') && names.includes('torso') && !names.includes('hat') && names.includes('leg-left'));
});
```
- [ ] **Step 2:** `RUN test/bake-read.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/read.js` (the colour math is `tools/glb.mjs`'s `vertexColors` and `s2l`, moved):
```js
// Reading sources (A-1): one NodeIO with every extension and the meshopt codecs, the rename maps, and the palette → vertex
// colour step (`palette: 'vertex'`, Tractor's tools/glb.mjs logic moved here).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

let io = null;
export async function getIO() {
  if (io) return io;
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  return io;
}
export { MeshoptEncoder };

// rename = { materials: { from: to }, nodes: { from: to } }, global merged under per-model by the caller
export function applyRenames(doc, rename) {
  for (const m of doc.getRoot().listMaterials()) { const to = rename.materials[m.getName()]; if (to) m.setName(to); }
  for (const n of doc.getRoot().listNodes()) { const to = rename.nodes[n.getName()]; if (to) n.setName(to); }
}

const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
// Every primitive with a base-colour texture and TEXCOORD_0 but no COLOR_0 gets COLOR_0 (linear floats) = texel at the vertex
// UV × base colour factor (Kenney writes sRGB-looking values into the factor; used as they are, as Tractor's bake did). Its
// texture, TEXCOORD_0 and TANGENT go; the factor becomes white. Textures left unused are disposed.
export function paletteToVertex(doc, model) {
  const cache = new Map();
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), tex = mat?.getBaseColorTexture(), uv = prim.getAttribute('TEXCOORD_0');
    if (prim.getAttribute('COLOR_0') || !tex || !uv) continue;
    if (tex.getMimeType() !== 'image/png') throw new Error(`bake: ${model}: material '${mat.getName()}' palette texture is ${tex.getMimeType()} (only PNG)`);
    if (!cache.has(tex)) cache.set(tex, PNG.sync.read(Buffer.from(tex.getImage())));
    const png = cache.get(tex), f = mat.getBaseColorFactor(), n = prim.getAttribute('POSITION').getCount(), out = new Float32Array(n * 3), e = [0, 0];
    for (let i = 0; i < n; i++) {
      uv.getElement(i, e);
      const u = ((e[0] % 1) + 1) % 1, v = ((e[1] % 1) + 1) % 1;
      const px = Math.min(png.width - 1, Math.floor(u * png.width)), py = Math.min(png.height - 1, Math.floor(v * png.height)), o = (py * png.width + px) * 4;
      for (let k = 0; k < 3; k++) out[i * 3 + k] = s2l(Math.round(Math.max(0, Math.min(1, png.data[o + k] / 255 * f[k])) * 255));
    }
    const buf = doc.getRoot().listBuffers()[0];
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf));
    for (const sem of ['TEXCOORD_0', 'TANGENT']) {
      const a = prim.getAttribute(sem); prim.setAttribute(sem, null);
      if (a && !a.listParents().some(p => p !== doc.getRoot())) a.dispose();
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m.getBaseColorTexture()) {
    const users = m.listParents().filter(p => p.propertyType === 'Primitive');
    if (users.every(p => p.getAttribute('COLOR_0') && !p.getAttribute('TEXCOORD_0'))) m.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  }
  for (const t of doc.getRoot().listTextures()) if (!t.listParents().some(p => p !== doc.getRoot())) t.dispose();
}
```
- [ ] **Step 4:** `RUN test/bake-read.test.mjs`. Expected: PASS (3 tests).
- [ ] **Step 5:** `git add tools/bake/read.js test/bake-read.test.mjs && git commit -m "feat(bake): source reader, renames and palette to vertex colours"`

### Task 6 (judgment): Conventions and the A-2 checks

**Files:** create `tools/bake/conventions.js`, `test/bake-conventions.test.mjs`.
**Interfaces:**
- Produces `classify(doc, model, { registry, sockets }) → { parts: [{ node, name }], cols: [{ node, name, shape, part, material }], socks: [{ node, name, part }] }`.
- Produces `SHAPES` and `sanitize(name)`.

**Expected decisions:**
- (a) Part and socket names are sanitised exactly as three's `GLTFLoader` does (`PropertyBinding.sanitizeNodeName`), and repeated part names get `-2`, `-3` in document order. The GLB nodes are renamed too, so sidecar names equal runtime object names. Kenney's `corn.glb` has four nodes called `corn`; today's `assets.json` silently kept one of them. (C6)
- (b) A `col-*` node with no ancestor part may name its part in `extras.part`; otherwise it is an error.
- (c) `col-*` proxy meshes' own materials are never checked.
- (d) A socket with no ancestor part has `part: null` (C3).

- [ ] **Step 1: Failing test** `test/bake-conventions.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getIO } from '../tools/bake/read.js';
import { classify, sanitize } from '../tools/bake/conventions.js';
import { model, boxGeom, build } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const box = (m, name, mat, extra = {}) => m.node(name, { ...extra, mesh: m.mesh(name, [[boxGeom([1, 1, 1]), mat]]) });
const run = async (m, opts = {}) => classify(await (await getIO()).readBinary(await m.bytes()), 'm', { registry: REGISTRY, ...opts });

test('3d: A-2 failures name the model and the node or material', async () => {
  const cases = [
    [m => box(m, 'body', 'planks'), /^Error: bake: m: material 'planks' is not in the registry or paint-\* \(on body\)$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-cone', 'x', { parent: 'body' }); }, /^Error: bake: m: col-cone unsupported collider shape 'cone'$/],
    [m => box(m, 'body', null), /^Error: bake: m: body has no material$/],
    [m => { box(m, 'body', 'wood'); box(m, 'sock-x', 'wood', { parent: 'body' }); }, /^Error: bake: m: sock-x is a socket with a mesh/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x'); }, /^Error: bake: m: col-box has no parent part/],
    [m => { box(m, 'body', 'wood'); m.node('col-box', { parent: 'body' }); }, /^Error: bake: m: col-box has no mesh$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { parent: 'body', extras: { material: 'unobtainium' } }); }, /^Error: bake: m: col-box extras\.material 'unobtainium' is not in the registry/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { extras: { part: 'nope' } }); }, /^Error: bake: m: col-box extras\.part 'nope' is not a part$/],
    [m => { box(m, 'body', 'wood'); box(m, 'col-box', 'x', { parent: 'body' }); box(m, 'inner', 'wood', { parent: 'col-box' }); }, /^Error: bake: m: col-box has children/],
    [m => { box(m, 'body', 'wood'); m.node('sock-a', { parent: 'body' }); m.node('sock-a'); }, /^Error: bake: m: sock-a duplicate socket$/],
  ];
  for (const [make, re] of cases) { const m = model(); make(m); await assert.rejects(run(m), re); }
  const m = model(); box(m, 'body', 'wood');
  await assert.rejects(run(m, { sockets: ['hat'] }), /^Error: bake: m: sock-hat missing \(required socket\)$/);
});
test('3d: registry ids and paint-* pass; col-* proxy materials are not checked', async () => {
  const m = model(); box(m, 'body', 'paint-body'); box(m, 'trim', 'steel', { parent: 'body' }); box(m, 'col-box', 'proxy', { parent: 'body' });
  const c = await run(m);
  assert.deepEqual(c.parts.map(p => p.name), ['body', 'trim']);
  assert.deepEqual(c.cols.map(x => [x.name, x.shape, x.part.name, x.material]), [['col-box', 'box', 'body', null]]);
});
test('3d: parts nest, sockets record their part (or null), names are sanitised as GLTFLoader does and repeats get -2, -3', async () => {
  const c = await run((await import('./fixtures/models/make.mjs')).MODELS.cart());
  assert.deepEqual(c.parts.map(p => p.name), ['body', 'wheel', 'mast', 'lamp001', 'lamp001-2']);
  assert.deepEqual(c.socks.map(s => [s.name, s.part]), [['hitch', 'body'], ['seat', null]]);
  assert.deepEqual(c.cols.map(x => [x.name, x.shape, x.part.name, x.material]), [
    ['col-box', 'box', 'body', null], ['col-box.001', 'box', 'body', 'rubber'], ['col-hull', 'hull', 'body', null],
    ['col-cylinder', 'cylinder', 'wheel', null], ['col-capsule', 'capsule', 'mast', null], ['col-sphere', 'sphere', 'body', null]]);
  assert.equal(c.parts[3].node.getName(), 'lamp001');    // the GLB node is renamed too, so runtime names match the sidecar
  assert.equal(sanitize('a b.c[1]:d/e'), 'a_bc1de');
});
```
- [ ] **Step 2:** `RUN test/bake-conventions.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/conventions.js`:
```js
// Node and material conventions (overview §4.3, A-2, A-6, A-7). classify(doc, model, opts) walks the default scene depth
// first and returns { parts, cols, socks } with every A-2 check applied. Errors read `bake: <model>: <node|material> <problem>`.
export const SHAPES = ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh'];
const TRIANGLES = 4;
// three's PropertyBinding.sanitizeNodeName, which GLTFLoader applies to every node name: parts and sockets are renamed the same
// way at bake time, so sidecar names, anim-table rows and runtime object names agree ('lamp.001' → 'lamp001').
export const sanitize = name => name.replace(/\s/g, '_').replace(/[\[\].:\/]/g, '');

// opts: { registry, sockets: required names }
export function classify(doc, model, { registry, sockets = [] }) {
  const fail = msg => { throw new Error(`bake: ${model}: ${msg}`); };
  const okMaterial = id => registry.has(id) || /^paint-[\w-]+$/.test(id);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) fail('no scene');
  const parts = [], cols = [], socks = [], names = new Set(), sockNames = new Set();
  const walk = (node, part) => {
    const name = node.getName(), mesh = node.getMesh();
    if (name.startsWith('col-')) {
      const shape = /^col-([a-z]*)/.exec(name)[1];
      if (!SHAPES.includes(shape)) fail(`${name} unsupported collider shape '${shape}'`);
      if (!mesh) fail(`${name} has no mesh`);
      if (node.listChildren().length) fail(`${name} has children (collider nodes must be leaves)`);
      for (const prim of mesh.listPrimitives()) if (prim.getMode() !== TRIANGLES) fail(`${name} primitive mode ${prim.getMode()} (triangles only)`);
      const extra = node.getExtras() ?? {};
      let owner = part;
      if (!owner && extra.part) owner = parts.find(p => p.name === extra.part) ?? fail(`${name} extras.part '${extra.part}' is not a part`);
      if (!owner) fail(`${name} has no parent part (nest it under a part or set extras.part)`);
      if (extra.material !== undefined && !okMaterial(extra.material)) fail(`${name} extras.material '${extra.material}' is not in the registry or paint-*`);
      cols.push({ node, name, shape, part: owner, material: extra.material ?? null });
      return;
    }
    if (name.startsWith('sock-')) {
      if (mesh) fail(`${name} is a socket with a mesh (sockets are empty nodes)`);
      if (sanitize(name) !== name) node.setName(sanitize(name));
      const sock = sanitize(name).slice(5);
      if (!sock || sockNames.has(sock)) fail(`${name} ${sock ? 'duplicate socket' : 'socket with no name'}`);
      sockNames.add(sock); socks.push({ node, name: sock, part: part?.name ?? null });
    }
    let here = part;
    if (mesh) {
      if (!name) fail('mesh node with no name');
      const base = sanitize(name);
      let unique = base;
      for (let k = 2; names.has(unique); k++) unique = `${base}-${k}`;   // Kenney repeats names (corn cobs): name-2, name-3…
      if (unique !== name) node.setName(unique);
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        if (!mat) fail(`${name} has no material`);
        if (!okMaterial(mat.getName())) fail(`material '${mat.getName()}' is not in the registry or paint-* (on ${name})`);
        if (prim.getMode() !== TRIANGLES) fail(`${name} primitive mode ${prim.getMode()} (triangles only)`);
      }
      names.add(unique); here = { node, name: unique }; parts.push(here);
    }
    for (const c of node.listChildren()) walk(c, here);
  };
  for (const n of scene.listChildren()) walk(n, null);
  for (const s of sockets) if (!sockNames.has(s)) fail(`sock-${s} missing (required socket)`);
  return { parts, cols, socks };
}
```
- [ ] **Step 4:** `RUN test/bake-conventions.test.mjs`. Expected: PASS (3 tests).
- [ ] **Step 5:** `git add tools/bake/conventions.js test/bake-conventions.test.mjs && git commit -m "feat(bake): node conventions and A-2 checks"`

### Task 7 (judgment): Colliders, sockets and bounds

**Files:** create `tools/bake/colliders.js`, `tools/bake/sockets.js`, `test/bake-colliders.test.mjs`.
**Interfaces:**
- Consumes `classify` (Task 6) and `hull`/`decimate` (Task 1).
- Produces `collidersOf(cls, { model, static, paintBase, warn }) → Collider[]` (§4.3 entries), `boundsOf(parts) → { min, max }`, `axisOf(half) → 0|1|2` and `socketsOf(socks) → { [name]: { p, q, part } }`.

**Expected decisions:**
- (a) A primitive is fitted to the node's local mesh AABB. Half extents are scaled by the node's world scale, the centre goes through the world matrix, and `q` is the node's world rotation (times the axis rotation for capsules and cylinders).
- (b) The capsule/cylinder axis is the extent whose other two are closest to equal; a tie goes to the longest extent. The overview's "longest axis" fits a wheel (0.2 m wide, 0.6 m across) along its diameter. (C1)
- (c) Hull and mesh points are in body space with `p = [0,0,0]` and `q = identity`. (C7)
- (d) For default hulls, a flat (part, material) group is skipped with a warning; the model fails only when every group is flat. Real Kenney rocks carry flat grass decals. An explicit flat `col-hull` still fails. (C4)
- (e) The collider material is the paint base for `paint-*`.

- [ ] **Step 1: Failing test** `test/bake-colliders.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getIO, applyRenames } from '../tools/bake/read.js';
import { classify } from '../tools/bake/conventions.js';
import { collidersOf, boundsOf, axisOf } from '../tools/bake/colliders.js';
import { socketsOf } from '../tools/bake/sockets.js';
import { MODELS, model, boxGeom, planeGeom } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const S = 0.707107;
async function bakeParts(m, { rename, ...opts } = {}) {
  const doc = await (await getIO()).readBinary(await m.bytes());
  if (rename) applyRenames(doc, rename);
  const cls = classify(doc, 'm', { registry: REGISTRY });
  const warnings = [];
  return { cls, warnings, colliders: collidersOf(cls, { model: 'm', paintBase: 'steel', warn: w => warnings.push(w), ...opts }) };
}
const strip = c => { const { points, vertices, indices, ...rest } = c; return rest; };

test('3d: col-* primitives fit the node mesh bounds, oriented by the node; materials inherit or override', async () => {
  const { colliders, cls } = await bakeParts(MODELS.cart());
  assert.deepEqual(colliders.map(strip), [
    { shape: 'box', half: [1, 0.25, 1.5], p: [0, 0.5, 0], q: [0, 0.258819, 0, 0.965926], part: 'body', material: 'steel' }, // paint-body → paint base
    { shape: 'box', half: [0.2, 0.1, 0.2], p: [0, 1, 1], q: [0, 0, 0, 1], part: 'body', material: 'rubber' },               // extras.material
    { shape: 'hull', p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' },
    { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: [1.1, 0.3, 1], q: [0, 0, -S, S], part: 'wheel', material: 'rubber' }, // wheel: axis x
    { shape: 'capsule', halfHeight: 0.4, r: 0.1, p: [0, 1.25, -1], q: [0, 0, 0, 1], part: 'mast', material: 'steel' },
    { shape: 'sphere', r: 0.25, p: [0, 1, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' },                          // extras.part
  ]);
  assert.equal(colliders[2].points.length, 18);                                                                         // octahedron: 6 points, body space
  assert.deepEqual(colliders[2].points.slice(0, 3), [0.5, 1, -1]);   // octahedron centre (0, 0.5, -1) in body + body at y 0.5
  assert.deepEqual(socketsOf(cls.socks), { hitch: { p: [0, 0.5, -1.6], q: [0, 0, 0, 1], part: 'body' }, seat: { p: [0, 1, 0], q: [S, 0, 0, S], part: null } });
});
test('3d: no col-*: one hull per (part, material) in body space; static: one welded col-mesh per part', async () => {
  const pet = await bakeParts(MODELS.pet(), { rename: { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } } });
  assert.deepEqual(pet.colliders.map(c => [c.shape, c.part, c.material, c.points.length]),
    [['hull', 'body', 'flesh', 24], ['hull', 'Group', 'flesh', 24], ['hull', 'leg-left', 'flesh', 24], ['hull', 'leg-right', 'flesh', 24]]);
  assert.equal(Math.max(...pet.colliders[1].points.filter((_, i) => i % 3 === 1)), 0.8);   // head: body y 0.2 + Group 0.4 + half 0.2
  const ramp = await bakeParts(MODELS.ramp(), { static: true });
  assert.equal(ramp.colliders.length, 1);
  assert.deepEqual(strip(ramp.colliders[0]), { shape: 'mesh', p: [0, 0, 0], q: [0, 0, 0, 1], part: 'ramp', material: 'wood' });
  assert.equal(ramp.colliders[0].vertices.length, 18); assert.equal(ramp.colliders[0].indices.length, 24);   // 24 corners welded to 6
  assert.deepEqual(boundsOf(ramp.cls.parts), { min: [-1, 0, 0], max: [1, 1, 3] });
});
test('3d: a flat (part, material) group gets no default hull (warned); all flat throws; explicit col-hull flat throws', async () => {
  const m = model();
  m.node('rock', { mesh: m.mesh('rock', [[boxGeom([1, 1, 1]), 'wood'], [planeGeom(), 'plastic']]) });
  const r = await bakeParts(m);
  assert.deepEqual(r.colliders.map(c => c.material), ['wood']);
  assert.deepEqual(r.warnings, ['bake: m: rock (plastic) is flat, so it has no default hull']);
  const flat = model(); flat.node('leaf', { mesh: flat.mesh('leaf', [[planeGeom(), 'wood']]) });
  await assert.rejects(bakeParts(flat), /^Error: bake: m: leaf \(wood\) hull has fewer than 4 points \(add col-\* nodes or set colliders: false\)$/);
  const col = model(); col.node('body', { mesh: col.mesh('b', [[boxGeom([1, 1, 1]), 'wood']]) }); col.node('col-hull', { parent: 'body', mesh: col.mesh('c', [[planeGeom(), 'x']]) });
  await assert.rejects(bakeParts(col), /bake: m: col-hull hull has fewer than 4 points/);
});
test('3d: the capsule/cylinder axis is the round cross-section (contract issue: not simply the longest extent)', () => {
  assert.equal(axisOf([0.1, 0.3, 0.3]), 0);   // wheel: short along x
  assert.equal(axisOf([0.2, 1, 0.2]), 1);     // post
  assert.equal(axisOf([0.3, 0.3, 0.9]), 2);
  assert.equal(axisOf([0.5, 0.5, 0.5]), 0);   // a tie keeps the first longest
  assert.equal(axisOf([0.2, 0.5, 0.5]), 0);
});
```
- [ ] **Step 2:** `RUN test/bake-colliders.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/colliders.js`:
```js
// Sidecar colliders (A-5, A-6, overview §4.3). collidersOf(cls, opts) → entries in the sidecar shape: primitives fitted to a
// col-* node's own mesh bounds (oriented by the node), hulls of body-space vertices (≤ 64 points), welded trimeshes; with no
// col-* nodes, one hull per (part, material), or one col-mesh per part for static models.
import { xfPoint, decompose, qmul, r6, r6a, sub, cross, len } from './math.js';
import { hull, decimate } from './hull.js';

const S = Math.SQRT1_2;
const AXIS_Q = [[0, 0, -S, S], [0, 0, 0, 1], [S, 0, 0, S]]; // rotates +y (Rapier's capsule/cylinder axis) onto x, y, z

function positions(prim) {
  const P = prim.getAttribute('POSITION'), out = [], e = [0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); out.push([e[0], e[1], e[2]]); }
  return out;
}
function triangles(prim) {
  const I = prim.getIndices(), n = prim.getAttribute('POSITION').getCount();
  return I ? Array.from(I.getArray()) : Array.from({ length: n }, (_, i) => i);
}
// body-space area per material name over a part's primitives; the largest wins, ties to the first
function mainMaterial(node) {
  const W = node.getWorldMatrix(), area = new Map();
  for (const prim of node.getMesh().listPrimitives()) {
    const P = positions(prim).map(p => xfPoint(W, p)), I = triangles(prim), name = prim.getMaterial().getName();
    let a = area.get(name) ?? 0;
    for (let t = 0; t + 2 < I.length; t += 3) a += len(cross(sub(P[I[t + 1]], P[I[t]]), sub(P[I[t + 2]], P[I[t]]))) / 2;
    area.set(name, a);
  }
  let best = null, ba = -1;
  for (const [name, a] of area) if (a > ba) { ba = a; best = name; }
  return best;
}
function hullEntry(model, label, pts) {
  const h = hull(pts);
  if (!h || h.points.length < 4) throw new Error(`bake: ${model}: ${label} hull has fewer than 4 points`);
  const kept = h.points.length > 64 ? hull(decimate(h.points, 64)) : h;
  if (!kept) throw new Error(`bake: ${model}: ${label} hull has fewer than 4 points`);
  return { shape: 'hull', points: kept.points.flat().map(r6) };
}
function meshEntry(prims, W) {
  const keys = new Map(), vertices = [], indices = [];
  for (const prim of prims) {
    const P = positions(prim).map(p => xfPoint(W, p)), remap = P.map(p => {
      const k = p.map(v => Math.round(v * 1e6)).join(',');
      if (!keys.has(k)) { keys.set(k, vertices.length / 3); vertices.push(...p.map(r6)); }
      return keys.get(k);
    });
    for (const i of triangles(prim)) indices.push(remap[i]);
  }
  return { shape: 'mesh', vertices, indices };
}
const ID = { p: [0, 0, 0], q: [0, 0, 0, 1] };
// Contract issue (overview §4.3 says "the longest axis"): the axis is the extent whose other two are closest to equal (the
// round cross-section), so a wheel (short cylinder) and a post (tall one) both fit; a tie goes to the longest extent.
export function axisOf(half) {
  let best = -1, bd = Infinity;
  for (let k = 0; k < 3; k++) {
    const [i, j] = [0, 1, 2].filter(x => x !== k), d = Math.abs(half[i] - half[j]) / (Math.max(half[i], half[j]) || 1);
    if (d < bd - 1e-6 || (Math.abs(d - bd) <= 1e-6 && half[k] > half[best])) { bd = d; best = k; }
  }
  return best;
}

// opts: { model, static, paintBase, warn }. A flat (part, material) group gets no default hull (warned); every group flat throws.
export function collidersOf(cls, { model, static: isStatic = false, paintBase, warn = () => {} }) {
  const phys = id => (id.startsWith('paint-') ? paintBase : id);
  const out = [], flat = [];
  if (cls.cols.length) {
    for (const col of cls.cols) {
      const { node, shape, part } = col, W = node.getWorldMatrix(), prims = node.getMesh().listPrimitives();
      const material = phys(col.material ?? mainMaterial(part.node)), tail = { part: part.name, material };
      if (shape === 'hull') { out.push({ ...hullEntry(model, col.name, prims.flatMap(p => positions(p).map(v => xfPoint(W, v)))), ...ID, ...tail }); continue; }
      if (shape === 'mesh') { out.push({ ...meshEntry(prims, W), ...ID, ...tail }); continue; }
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const prim of prims) for (const p of positions(prim)) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      const { q, s } = decompose(W), half = [0, 1, 2].map(k => (hi[k] - lo[k]) / 2 * Math.abs(s[k]));
      const p = xfPoint(W, [0, 1, 2].map(k => (lo[k] + hi[k]) / 2));
      if (shape === 'box') { out.push({ shape, half: r6a(half), p: r6a(p), q: r6a(q), ...tail }); continue; }
      if (shape === 'sphere') { out.push({ shape, r: r6(Math.max(...half)), p: r6a(p), q: r6a(q), ...tail }); continue; }
      const axis = axisOf(half), r = Math.max(...half.filter((_, k) => k !== axis));
      const halfHeight = shape === 'capsule' ? Math.max(0, half[axis] - r) : half[axis];
      out.push({ shape, halfHeight: r6(halfHeight), r: r6(r), p: r6a(p), q: r6a(qmul(q, AXIS_Q[axis])), ...tail });
    }
    return out;
  }
  for (const { node, name } of cls.parts) {
    const W = node.getWorldMatrix(), prims = node.getMesh().listPrimitives();
    if (isStatic) { out.push({ ...meshEntry(prims, W), ...ID, part: name, material: phys(mainMaterial(node)) }); continue; }
    const byMat = new Map();
    for (const prim of prims) { const m = prim.getMaterial().getName(); if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(...positions(prim).map(v => xfPoint(W, v))); }
    for (const [m, pts] of byMat) {
      if (!hull(pts)) { flat.push(`${name} (${m})`); continue; }          // a flat decal or leaf card: no default hull
      out.push({ ...hullEntry(model, `${name} (${m})`, pts), ...ID, part: name, material: phys(m) });
    }
  }
  if (!out.length && flat.length) throw new Error(`bake: ${model}: ${flat.join(', ')} hull has fewer than 4 points (add col-* nodes or set colliders: false)`);
  for (const f of flat) warn(`bake: ${model}: ${f} is flat, so it has no default hull`);
  return out;
}

export function boundsOf(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { node } of parts) {
    const W = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) for (const p of positions(prim)) {
      const w = xfPoint(W, p); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
    }
  }
  if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: r6a(min), max: r6a(max) };
}
```
and `tools/bake/sockets.js`:
```js
// Sockets (A-7): each sock-<name> empty → { p, q, part } in body space (the scene root's space).
import { decompose, r6a } from './math.js';

export function socketsOf(socks) {
  const out = {};
  for (const { node, name, part } of socks) {
    const { t, q } = decompose(node.getWorldMatrix());
    out[name] = { p: r6a(t), q: r6a(q), part };
  }
  return out;
}
```
- [ ] **Step 4:** `RUN test/bake-colliders.test.mjs`. Expected: PASS (4 tests).
- [ ] **Step 5: Mutation.** Replace `axisOf(half)` in `collidersOf` with `half.indexOf(Math.max(...half))`. Expect the cart test to fail on the wheel's `halfHeight`. Revert.
- [ ] **Step 6:** `git add tools/bake/colliders.js tools/bake/sockets.js test/bake-colliders.test.mjs && git commit -m "feat(bake): sidecar colliders, sockets and bounds"`

### Task 8: Animation tables

**Files:** create `tools/bake/animTable.js`, `test/bake-anim.test.mjs`.
**Interfaces:**
- Produces `animTable(doc, model, rows: [{ node, name }], { fps, clips }) → { v: 1, fps, parts, clips: { [clip]: { dur, frames, data } } }`.
- `data` is base64 of a little-endian Float32Array of frames × rows × 12, where the 12 floats are three.js `Matrix4.elements` indices 0,1,2,4,5,6,8,9,10,12,13,14 of the model-space matrix. 3f's `decodeAnimTable` reads exactly this.
- Rows are the parts followed by `sock-<name>` rows (C2).

- [ ] **Step 1: Failing test** `test/bake-anim.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getIO, applyRenames } from '../tools/bake/read.js';
import { classify } from '../tools/bake/conventions.js';
import { animTable } from '../tools/bake/animTable.js';
import { MODELS, model, boxGeom } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const RENAME = { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } };
async function table(m, opts) {
  const doc = await (await getIO()).readBinary(await m.bytes());
  applyRenames(doc, RENAME);
  const cls = classify(doc, 'pet', { registry: REGISTRY });
  return animTable(doc, 'pet', [...cls.parts, ...cls.socks.map(s => ({ node: s.node, name: `sock-${s.name}` }))], opts);
}
const decode = b64 => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer);

test('3d: anim table rows are the parts then sock-* rows; frames = round(dur × fps), dur from the samplers', async () => {
  const t = await table(MODELS.pet(), { fps: 10, clips: ['walk', 'idle'] });
  assert.equal(t.v, 1); assert.equal(t.fps, 10);
  assert.deepEqual(t.parts, ['body', 'Group', 'leg-left', 'leg-right', 'sock-hat']);
  assert.deepEqual(Object.keys(t.clips), ['walk', 'idle']);
  assert.deepEqual([t.clips.walk.dur, t.clips.walk.frames, t.clips.idle.dur, t.clips.idle.frames], [1, 10, 2, 20]);
  assert.equal(decode(t.clips.walk.data).length, 10 * 5 * 12);
  const all = await table(MODELS.pet(), { fps: 30, clips: null });
  assert.deepEqual(Object.keys(all.clips), ['walk', 'idle']);                 // null: every clip, document order
});
test('3d: every row equals three.js AnimationMixer on the source GLB (slerp, STEP at a key time, parents included)', async () => {
  const t = await table(MODELS.pet(), { fps: 10, clips: ['walk', 'idle'] });
  const bytes = await MODELS.pet().bytes(), buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let worst = 0;
  for (const [name, clip] of Object.entries(t.clips)) {
    mixer.stopAllAction(); mixer.clipAction(gltf.animations.find(a => a.name === name)).play();
    const data = decode(clip.data);
    for (let f = 0; f < clip.frames; f++) {
      mixer.setTime(f / clip.frames * clip.dur); gltf.scene.updateMatrixWorld(true);
      t.parts.forEach((part, r) => {
        const e = gltf.scene.getObjectByName(part === 'sock-hat' ? 'hat' : part).matrixWorld.elements;
        for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(e[c * 4 + k] - data[(f * t.parts.length + r) * 12 + c * 3 + k]));
      });
    }
  }
  assert.ok(worst < 1e-5, `worst element error ${worst}`);
});
test('3d: a missing clip and CUBICSPLINE samplers fail with the model and clip', async () => {
  await assert.rejects(table(MODELS.pet(), { fps: 30, clips: ['walk', 'fly'] }), /bake: pet: animation 'fly' missing \(animTable\.clips\)/);
  const m = model(); m.node('body', { mesh: m.mesh('b', [[boxGeom([1, 1, 1]), 'wood']]) });
  m.animate('spin', 'body', 'translation', [[0, [0, 0, 0, 0, 0, 0, 0, 0, 0]], [1, [0, 0, 0, 0, 1, 0, 0, 0, 0]]], 'CUBICSPLINE');
  await assert.rejects(table(m, { fps: 30, clips: null }), /bake: pet: animation 'spin' uses CUBICSPLINE/);
});
```
- [ ] **Step 2:** `RUN test/bake-anim.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/animTable.js`:
```js
// Baked animation tables (A-11, overview §4.3): every clip sampled at `fps` into model-space matrices of each row node (the
// parts, then the sockets as `sock-<name>`). Row layout: 12 floats, the column-major 4x4 without its last row
// [m0 m1 m2  m4 m5 m6  m8 m9 m10  m12 m13 m14]. Frame f is at t = f / frames × dur (loops; the end pose is frame 0).
// Ported from Tractor's and Pig Pens' bake.mjs `bakePet`; rotations now slerp (as AnimationMixer) where bakePet used nlerp.
import { compose, mul } from './math.js';

// shortest-arc slerp, as three's QuaternionLinearInterpolant (the runtime AnimationMixer)
function slerp(a, b, u) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let ka = 1 - u, kb = u;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - u) * th) / sn; kb = Math.sin(u * th) / sn; }
  const r = [0, 1, 2, 3].map(k => ka * a[k] + s * kb * b[k]), l = Math.hypot(...r);
  return r.map(x => x / l);
}
function sampler(anim, node, path, time) {
  const ch = anim.listChannels().find(c => c.getTargetNode() === node && c.getTargetPath() === path);
  if (!ch) return path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
  const s = ch.getSampler(), T = s.getInput().getArray(), V = s.getOutput().getArray(), w = path === 'rotation' ? 4 : 3;
  if (time <= T[0]) return Array.from(V.slice(0, w));
  if (time >= T[T.length - 1]) return Array.from(V.slice((T.length - 1) * w, T.length * w));
  let i = 0; while (T[i + 1] <= time) i++;                       // a key exactly at `time` wins, as in three's interpolants
  const u = s.getInterpolation() === 'STEP' ? 0 : (time - T[i]) / (T[i + 1] - T[i]);
  const A = V.slice(i * w, i * w + w), B = V.slice(i * w + w, i * w + 2 * w);
  if (w === 4) return slerp(A, B, u);
  return [0, 1, 2].map(k => A[k] * (1 - u) + B[k] * u);
}
function modelMatrix(anim, node, t) {
  let m = compose(sampler(anim, node, 'translation', t), sampler(anim, node, 'rotation', t), sampler(anim, node, 'scale', t));
  for (let p = node.getParentNode(); p; p = p.getParentNode())
    m = mul(compose(sampler(anim, p, 'translation', t), sampler(anim, p, 'rotation', t), sampler(anim, p, 'scale', t)), m);
  return m;
}

// rows: [{ node, name }] in table order; opts: { fps, clips: names | null (all, document order) }
export function animTable(doc, model, rows, { fps = 30, clips = null }) {
  const anims = doc.getRoot().listAnimations(), byName = new Map(anims.map(a => [a.getName(), a]));
  const names = clips ?? anims.map(a => a.getName());
  const out = { v: 1, fps, parts: rows.map(r => r.name), clips: {} };
  for (const name of names) {
    const anim = byName.get(name);
    if (!anim) throw new Error(`bake: ${model}: animation '${name}' missing (animTable.clips)`);
    for (const s of anim.listSamplers()) if (s.getInterpolation() === 'CUBICSPLINE') throw new Error(`bake: ${model}: animation '${name}' uses CUBICSPLINE (animTable samples LINEAR and STEP only)`);
    let dur = 0; for (const s of anim.listSamplers()) { const T = s.getInput().getArray(); dur = Math.max(dur, T[T.length - 1]); }
    const frames = Math.max(1, Math.round(dur * fps)), data = new Float32Array(frames * rows.length * 12);
    for (let f = 0; f < frames; f++) {
      const t = f / frames * dur;
      rows.forEach(({ node }, r) => {
        const m = modelMatrix(anim, node, t), o = (f * rows.length + r) * 12;
        for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) data[o + c * 3 + k] = m[c * 4 + k];
      });
    }
    out.clips[name] = { dur: Math.round(dur * 1e4) / 1e4, frames, data: Buffer.from(data.buffer).toString('base64') };
  }
  return out;
}
```
- [ ] **Step 4:** `RUN test/bake-anim.test.mjs`. Expected: PASS (3 tests).
- [ ] **Step 5: Mutation (two).** (a) In `sampler`, change `T[i + 1] <= time` to `T[i + 1] < time`: the STEP `idle` clip at t = 1.0 must fail the mixer test. (b) Replace `return slerp(A, B, u)` with a normalised lerp: the walk rows must fail at 1e-5. Revert both.
- [ ] **Step 6:** `git add tools/bake/animTable.js test/bake-anim.test.mjs && git commit -m "feat(bake): baked animation tables matching AnimationMixer"`

### Task 9 (judgment): Optimisation pipeline

**Files:** create `tools/bake/optimise.js`, `test/bake-optimise.test.mjs`.
**Interfaces:**
- Produces `optimise(doc, { meshopt, quantize, weld, prune, dedupe }, { encoder }) → Promise<doc>`.

**Expected decisions:**
- POSITION and TEXCOORD are never quantised (Review Focus 1). NORMAL, TANGENT and COLOR_n are quantised. meshopt is applied as `reorder` plus `EXT_meshopt_compression` (FILTER), not through the `meshopt()` wrapper, which re-quantises POSITION.
- `prune({ keepLeaves, keepAttributes, keepExtras })` keeps sockets and the barn's UVs (`keepTextures`).
- `dedup({ keepUniqueNames: true })` is used.
- The cost: float positions compress worse than 14-bit ones. Measured on Tractor: 150 KB gzip for all 40 models. Record it in the notes. Animation translation and scale go through meshopt's lossy EXPONENTIAL filter (about 2e-4), which is invisible; the tables are sampled from the source, so they are exact.

- [ ] **Step 1: Failing test** `test/bake-optimise.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { getIO, MeshoptEncoder } from '../tools/bake/read.js';
import { optimise } from '../tools/bake/optimise.js';
import { MODELS } from './fixtures/models/make.mjs';

const ALL = { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true };
const load = async bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
async function before(name) { return load(await MODELS[name]().bytes()); }
async function after(name, o = ALL) {
  const io = await getIO(), doc = await io.readBinary(await MODELS[name]().bytes());
  await optimise(doc, o, { encoder: MeshoptEncoder });
  return { bytes: await io.writeBinary(doc), gltf: await load(await io.writeBinary(doc)) };
}
const nodes = root => { const out = []; root.traverse(o => { if (o.name && !/_\d+$/.test(o.name)) out.push(o); }); return out; };

test('3d: optimisation keeps every named node, its parent and its world matrix (no quantize transforms, sockets kept)', async () => {
  for (const name of ['cart', 'pet']) {
    const a = await before(name), { gltf: b, bytes } = await after(name);
    assert.ok(JSON.parse(Buffer.from(bytes.slice(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))).toString()).extensionsRequired.includes('EXT_meshopt_compression'));
    a.scene.updateMatrixWorld(true); b.scene.updateMatrixWorld(true);
    const want = nodes(a.scene);
    assert.ok(want.some(o => o.name.startsWith('sock-') || o.name === 'hat'), `${name} has an empty socket node`);
    for (const o of want) {
      const p = b.scene.getObjectByName(o.name);
      assert.ok(p, `${name}: node ${o.name} survives`);
      assert.equal(p.parent?.name, o.parent?.name, `${name}: ${o.name} keeps its parent`);
      p.matrixWorld.elements.forEach((v, i) => assert.ok(Math.abs(v - o.matrixWorld.elements[i]) < 1e-6, `${name}: ${o.name} matrix[${i}]`));
    }
  }
});
test('3d: materials that look identical keep their registry names (dedup keeps unique names)', async () => {
  const { gltf } = await after('cart');
  const names = new Set(); gltf.scene.traverse(o => { if (o.isMesh) names.add(o.material.name); });
  for (const n of ['paint-body', 'plastic', 'rubber', 'steel']) assert.ok(names.has(n), `material ${n} kept (${[...names]})`);
});
test('3d: positions stay float and vertex counts unchanged on welded fixtures; animations survive', async () => {
  const a = await before('pet'), { gltf: b } = await after('pet');
  const count = g => { let n = 0; g.scene.traverse(o => { if (o.isMesh) { n += o.geometry.attributes.position.count; assert.ok(o.geometry.attributes.position.array instanceof Float32Array); } }); return n; };
  assert.equal(count(b), count(a));
  assert.deepEqual(b.animations.map(c => c.name), ['walk', 'idle']);
});
test('3d: every step can be turned off', async () => {
  const off = { meshopt: false, quantize: false, weld: false, prune: false, dedupe: false };
  const { bytes } = await after('crate', off), json = JSON.parse(Buffer.from(bytes.slice(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))).toString());
  assert.equal(json.extensionsUsed, undefined);
});
```
- [ ] **Step 2:** `RUN test/bake-optimise.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/bake/optimise.js`:
```js
// gltf-transform optimisation (A-3, overview §4.3) with the engine defaults { meshopt, quantize, weld, prune, dedupe }.
// Decision: POSITION and TEXCOORD are never quantized. quantize() would move a dequantization transform into the part nodes
// (or re-parent the mesh under an unnamed child), which breaks part names, sockets and anim-table rows. NORMAL, TANGENT and
// COLOR_n are quantized. Empty leaf nodes (sock-*) and extras survive prune; materials keep their (registry) names in dedup.
import { dedup, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { Logger } from '@gltf-transform/core';

export async function optimise(doc, o, { encoder }) {
  doc.setLogger(new Logger(Logger.Verbosity.WARN));          // prune's per-model info lines are noise
  const steps = [];
  if (o.dedupe) steps.push(dedup({ keepUniqueNames: true }));
  if (o.weld) steps.push(weld());
  if (o.prune) steps.push(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }));
  if (o.quantize) steps.push(quantize({ pattern: /^(NORMAL|TANGENT|COLOR_\d+)$/, quantizeNormal: 10, quantizeColor: 8 }));
  if (o.meshopt) steps.push(reorder({ encoder, target: 'size' }));
  if (steps.length) await doc.transform(...steps);
  if (o.meshopt) doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return doc;
}
```
- [ ] **Step 4:** `RUN test/bake-optimise.test.mjs`. Expected: PASS (4 tests). The first test is also the decoder check: three 0.186's `MeshoptDecoder` (meshoptimizer 1.1) reads meshoptimizer 1.2.0's output.
- [ ] **Step 5: Mutations (two).** (a) Set the quantize pattern to `/^(POSITION|NORMAL|TANGENT|COLOR_\d+)$/`: the node-matrix test must fail. (b) Set `keepUniqueNames: false`: the material-names test must fail. Revert both.
- [ ] **Step 6:** `git add tools/bake/optimise.js test/bake-optimise.test.mjs && git commit -m "feat(bake): gltf-transform optimisation that keeps node structure"`

### Task 10: `bake()` and the `baked/` output

**Files:** create `tools/bake/write.js`, `tools/bake/index.js`, `test/bake-output.test.mjs`, and the committed `test/fixtures/models/game/baked/**` (generated).
**Interfaces:**
- Produces `bake({ game, ids, check, log }) → Promise<{ ok, baked: string[], stale: { id, why }[] }>`. `check` lands in Task 11.
- Produces `bakeModel(cfg, registry, id, src, log)`, `sources(cfg) → Map<id, { file, rel, opts }>`, `loadRegistry(cfg)` and `ENGINE_VERSION`, and re-exports `loadConfig`. These are the `lion-hawk/bake` exports, `{ bake, loadConfig }` plus extras.
- Produces `writeBaked(outDir, { results, engine, materials, prev, keep, full })`, `readBaked(outDir)` and `sha256(bytes)`.
- Produces the output exactly as §4.3: `phys.json` `{ v, engine, materials, models }`, `manifest.json`, and `models/<id>.glb` and `.anim.json`.

- [ ] **Step 1: Failing test** `test/bake-output.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { getIO } from '../tools/bake/read.js';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { bake, ENGINE_VERSION } from '../tools/bake/index.js';
import { sha256 } from '../tools/bake/write.js';
import { copyFixture, gameWith } from './helpers/bakeGame.mjs';
import { rapierMass, assertMassClose } from './helpers/rapierMass.mjs';
import { build, MODELS } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const quiet = () => {};
const read = (dir, f) => readFileSync(join(dir, 'baked', f));
const json = (dir, f) => JSON.parse(read(dir, f));
const load = bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

test('3d: bake writes phys.json, manifest.json, one GLB per model and anim tables only where asked', async () => {
  const dir = copyFixture({ baked: false }), r = await bake({ game: dir, log: quiet });
  assert.deepEqual(r, { ok: true, baked: ['cart', 'crate', 'palette', 'pet', 'ramp'], stale: [] });
  const phys = json(dir, 'phys.json'), man = json(dir, 'manifest.json');
  assert.deepEqual([phys.v, phys.engine, phys.materials], [1, ENGINE_VERSION, REGISTRY.hash]);
  assert.deepEqual(Object.keys(phys.models), ['cart', 'crate', 'palette', 'pet', 'ramp']);
  assert.deepEqual(readdirSync(join(dir, 'baked/models')).sort(), ['cart.glb', 'crate.glb', 'palette.glb', 'pet.anim.json', 'pet.glb', 'ramp.glb']);
  for (const [id, m] of Object.entries(man.models)) {
    const glb = read(dir, m.glb);
    assert.deepEqual(m, { glb: `models/${id}.glb`, anim: id === 'pet' ? 'models/pet.anim.json' : null, bytes: glb.length, sha256: sha256(glb) });
  }
  const crate = phys.models.crate;
  assert.deepEqual(crate.source, { file: 'assets/models/crate.glb', sha256: sha256(readFileSync(join(dir, 'assets/models/crate.glb'))) });
  assert.deepEqual(crate.mass, { mass: 600, com: [0, 0.5, 0], inertia: [100, 100, 100], frame: [0, 0, 0, 1] });
  assert.deepEqual(crate.bounds, { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] });
  assert.deepEqual(phys.models.pet.sockets, { hat: { p: [0, 0.9, 0.4], q: [0, 0, 0, 1], part: 'body' } });
  assert.deepEqual(phys.models.palette.colliders.map(c => c.material), ['plastic']);           // per-model rename beats the global one
});
test('3d: every sidecar mass matches Rapier built from its own colliders (1%)', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  for (const [id, s] of Object.entries(json(dir, 'phys.json').models)) assertMassClose(s.mass, rapierMass(s.colliders, m => REGISTRY.density(m)), id);
});
test('3d: the baked GLB loads in three 0.186 with MeshoptDecoder: col-* gone, sock-* and parts present, registry names', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const phys = json(dir, 'phys.json');
  for (const id of Object.keys(phys.models)) {
    const g = await load(read(dir, `models/${id}.glb`)), names = [], mats = new Set();
    g.scene.traverse(o => { names.push(o.name); if (o.isMesh) mats.add(o.material.name); });
    assert.ok(!names.some(n => n.startsWith('col-')), `${id}: collider nodes removed`);
    for (const p of phys.models[id].parts) assert.ok(g.scene.getObjectByName(p), `${id}: part ${p}`);
    for (const s of Object.keys(phys.models[id].sockets)) assert.ok(g.scene.getObjectByName(`sock-${s}`), `${id}: sock-${s}`);
    for (const m of mats) assert.ok(REGISTRY.has(m) || m.startsWith('paint-'), `${id}: material ${m}`);
  }
});
test('3d: a re-bake of unchanged sources is byte-identical', async () => {
  const a = copyFixture({ baked: false }), b = copyFixture({ baked: false });
  await bake({ game: a, log: quiet }); await bake({ game: b, log: quiet });
  for (const f of ['phys.json', 'manifest.json', ...readdirSync(join(a, 'baked/models')).map(f => `models/${f}`)])
    assert.ok(read(a, f).equals(read(b, f)), `${f} differs`);
});
test('3d: bake ids… re-bakes only those and keeps the rest; a registry change re-bakes everything; removed sources go', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const before = json(dir, 'phys.json');
  writeFileSync(join(dir, 'assets/models/crate.glb'), await build('ramp'));
  assert.deepEqual((await bake({ game: dir, ids: ['crate'], log: quiet })).baked, ['crate']);
  const after = json(dir, 'phys.json');
  assert.notDeepEqual(after.models.crate, before.models.crate);
  for (const id of ['cart', 'palette', 'pet', 'ramp']) assert.deepEqual(after.models[id], before.models[id]);
  assert.equal(Object.keys(json(dir, 'manifest.json').models).length, 5);
  writeFileSync(join(dir, 'materials.js'), readFileSync(join(dir, 'materials.js'), 'utf8').replace(REGISTRY.hash, 'ffffffff'));
  const logs = [], r = await bake({ game: dir, ids: ['crate'], log: m => logs.push(m) });
  assert.equal(r.baked.length, 5); assert.ok(logs.some(l => /every model is baked/.test(l)));
  assert.equal(json(dir, 'phys.json').materials, 'ffffffff');
  rmSync(join(dir, 'assets/models/pet.glb')); writeFileSync(join(dir, 'game.config.js'), readFileSync(join(dir, 'game.config.js'), 'utf8').replace(/\n\s*pet: \{[^\n]*\n/, '\n'));
  await bake({ game: dir, log: quiet });
  assert.ok(!existsSync(join(dir, 'baked/models/pet.glb')) && !existsSync(join(dir, 'baked/models/pet.anim.json')));
  assert.equal(json(dir, 'phys.json').models.pet, undefined);
});
test('3d: models.<id>.file maps an id onto a differently named source; colliders: false gives none', async () => {
  const dir = gameWith({ 'nature-kit_fence-simple': await build('crate') }, { models: { fence: { file: 'nature-kit_fence-simple.glb', colliders: false } } });
  assert.deepEqual((await bake({ game: dir, log: quiet })).baked, ['fence']);
  const s = json(dir, 'phys.json').models.fence;
  assert.deepEqual(s.colliders, []); assert.equal(s.mass.mass, 0); assert.equal(s.source.file, 'assets/models/nature-kit_fence-simple.glb');
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }, { models: { b: {} } }), log: quiet }), /bake: b: configured in bake\.models but no source/);
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }), ids: ['zz'], log: quiet }), /bake: zz: no such model/);
  await assert.rejects(bake({ game: gameWith({ a: await build('crate') }, { paint: { base: 'adamantium' } }), log: quiet }), /config: bake\.paint\.base 'adamantium' is not in the registry/);
});
test('3d: kits with the same Textures/colormap.png resolve per source file and never collide (3k: models.<id>.file)', async () => {
  const dir = gameWith({}, { palette: 'vertex', rename: { materials: { colormap: 'plastic' } },
    models: { a: { file: 'kit-a/palette.gltf' }, b: { file: 'kit-b/palette.gltf' }, c: { file: 'kit-b/copy.gltf', keepTextures: true } } });
  for (const [kit, rgb, files] of [['kit-a', [255, 0, 0], ['palette']], ['kit-b', [0, 255, 0], ['palette', 'copy']]]) {
    mkdirSync(join(dir, 'assets/models', kit), { recursive: true });
    for (const f of files) {
      const m = MODELS.palette(), png = new PNG({ width: 2, height: 1 }); png.data.set([...rgb, 255, ...rgb, 255]);
      m.doc.getRoot().listTextures()[0].setImage(PNG.sync.write(png)).setURI('Textures/colormap.png');
      await new NodeIO().write(join(dir, 'assets/models', kit, `${f}.gltf`), m.doc);
    }
  }
  assert.deepEqual((await bake({ game: dir, log: quiet })).baked, ['a', 'b', 'c']);
  const io = await getIO(), colour = async id => (await io.read(join(dir, 'baked/models', `${id}.glb`))).getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0').getElement(0, []);
  assert.deepEqual(await colour('a'), [1, 0, 0]); assert.deepEqual(await colour('b'), [0, 1, 0]);
  const c = await io.read(join(dir, 'baked/models/c.glb')), tex = c.getRoot().listTextures();   // keepTextures: embedded in its own GLB
  assert.equal(tex.length, 1); assert.equal(PNG.sync.read(Buffer.from(tex[0].getImage())).data[1], 255);
  assert.deepEqual(readdirSync(join(dir, 'baked/models')).sort(), ['a.glb', 'b.glb', 'c.glb']);
});
```
- [ ] **Step 2:** `RUN test/bake-output.test.mjs`. Expected: FAIL, `Cannot find module '.../tools/bake/index.js'`.
- [ ] **Step 3: Implement** `tools/bake/write.js`:
```js
// Bake output (D2, overview §4.3): baked/phys.json, baked/manifest.json, baked/models/<id>.glb and <id>.anim.json. Keys are
// sorted so a re-bake of unchanged sources is byte-identical. readBaked(dir) → { phys, manifest } (empty ones when absent).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));

export function readBaked(outDir) {
  const read = (f, empty) => existsSync(join(outDir, f)) ? JSON.parse(readFileSync(join(outDir, f), 'utf8')) : empty;
  return { phys: read('phys.json', null), manifest: read('manifest.json', null) };
}

// results: [{ id, sidecar, glb: Uint8Array, anim: object | null }]; prev: readBaked() of the same dir; keep: ids carried over
// from prev; full: also delete files under models/ that no model owns any more (a removed source)
export function writeBaked(outDir, { results, engine, materials, prev, keep, full = false }) {
  mkdirSync(join(outDir, 'models'), { recursive: true });
  const models = {}, entries = {};
  for (const id of keep) { if (prev.phys?.models?.[id]) models[id] = prev.phys.models[id]; if (prev.manifest?.models?.[id]) entries[id] = prev.manifest.models[id]; }
  for (const { id, sidecar, glb, anim } of results) {
    writeFileSync(join(outDir, 'models', `${id}.glb`), glb);
    const animFile = join(outDir, 'models', `${id}.anim.json`);
    if (anim) writeFileSync(animFile, JSON.stringify(anim) + '\n'); else rmSync(animFile, { force: true });
    models[id] = sidecar;
    entries[id] = { glb: `models/${id}.glb`, anim: anim ? `models/${id}.anim.json` : null, bytes: glb.byteLength, sha256: sha256(glb) };
  }
  if (full) {
    const owned = new Set(Object.values(entries).flatMap(e => [e.glb, e.anim]).filter(Boolean).map(f => f.slice('models/'.length)));
    for (const f of readdirSync(join(outDir, 'models'))) if (!owned.has(f)) rmSync(join(outDir, 'models', f));
  }
  writeFileSync(join(outDir, 'phys.json'), JSON.stringify({ v: 1, engine, materials, models: sorted(models) }) + '\n');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ v: 1, models: sorted(entries) }, null, 2) + '\n');
}
```
and `tools/bake/index.js`. The `check` parameter is accepted but not yet honoured; Task 11 adds that.
```js
// lion-hawk bake (A-1…A-8 with D2): sources in bake.src → optimised GLBs, anim tables and one phys.json in bake.out.
// bake({ game, ids, check, log }) → { ok, baked: [ids], stale: [{ id, why }] }. `check` writes nothing: it reports models whose
// source sha, the registry hash or the engine major.minor differ from phys.json (and sources added or removed).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { loadConfig, importFresh } from './config.js';
import { getIO, applyRenames, paletteToVertex, MeshoptEncoder } from './read.js';
import { classify } from './conventions.js';
import { collidersOf, boundsOf } from './colliders.js';
import { socketsOf } from './sockets.js';
import { massOf } from './mass.js';
import { animTable } from './animTable.js';
import { optimise } from './optimise.js';
import { readBaked, writeBaked, sha256 } from './write.js';
export { loadConfig };

export const ENGINE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const minor = v => v.split('.').slice(0, 2).join('.');

// id → { file (absolute), rel (relative to the game dir), opts }
export function sources(cfg) {
  const dir = resolve(cfg.dir, cfg.bake.src), out = new Map(), claimed = new Set();
  for (const [id, m] of Object.entries(cfg.bake.models)) if (m.file) claimed.add(m.file);
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.(glb|gltf)$/.test(f)).sort() : [];
  for (const f of files) if (!claimed.has(f)) out.set(basename(f, extname(f)), f);
  for (const [id, m] of Object.entries(cfg.bake.models)) if (m.file) out.set(id, m.file);
  const res = new Map();
  for (const id of [...out.keys()].sort()) {
    const f = out.get(id), file = join(dir, f);
    if (!existsSync(file)) throw new Error(`bake: ${id}: source ${join(cfg.bake.src, f)} not found`);
    res.set(id, { file, rel: join(cfg.bake.src, f).split('\\').join('/'), opts: cfg.bake.models[id] ?? null });
  }
  for (const id of Object.keys(cfg.bake.models)) if (!res.has(id)) throw new Error(`bake: ${id}: configured in bake.models but no source in ${cfg.bake.src}`);
  return res;
}

export async function loadRegistry(cfg) {
  if (!cfg.bake.materials) throw new Error('config: bake.materials is required (module whose default export is the registry)');
  const reg = (await importFresh(resolve(cfg.dir, cfg.bake.materials))).default;
  if (!reg || typeof reg.has !== 'function' || typeof reg.density !== 'function' || typeof reg.hash !== 'string')
    throw new Error(`config: ${cfg.bake.materials} default export is not a material registry (needs has, density, hash)`);
  if (!reg.has(cfg.bake.paint.base)) throw new Error(`config: bake.paint.base '${cfg.bake.paint.base}' is not in the registry`);
  return reg;
}

export async function bakeModel(cfg, registry, id, { file, rel, opts }, log = () => {}) {
  const m = opts ?? { static: false, keepTextures: false, sockets: [], colliders: true, animTable: null, rename: { materials: {}, nodes: {} } };
  const io = await getIO(), bytes = readFileSync(file), doc = await io.read(file);
  applyRenames(doc, { materials: { ...cfg.bake.rename.materials, ...m.rename.materials }, nodes: { ...cfg.bake.rename.nodes, ...m.rename.nodes } });
  if (cfg.bake.palette === 'vertex' && !m.keepTextures) paletteToVertex(doc, id);
  const cls = classify(doc, id, { registry, sockets: m.sockets });
  const colliders = m.colliders ? collidersOf(cls, { model: id, static: m.static, paintBase: cfg.bake.paint.base, warn: log }) : [];
  const mp = massOf(colliders, mat => registry.density(mat));
  const round = v => Math.round(v * 1e6) / 1e6 + 0;
  const sidecar = {
    v: 1, source: { file: rel, sha256: sha256(bytes) }, parts: cls.parts.map(p => p.name), colliders,
    mass: { mass: round(mp.mass), com: mp.com.map(round), inertia: mp.inertia.map(round), frame: mp.frame.map(round) },
    sockets: socketsOf(cls.socks), bounds: boundsOf(cls.parts),
  };
  const anim = m.animTable ? animTable(doc, id, [...cls.parts, ...cls.socks.map(s => ({ node: s.node, name: `sock-${s.name}` }))], m.animTable) : null;
  for (const col of cls.cols) {
    const mesh = col.node.getMesh(); col.node.dispose();
    if (!mesh.listParents().some(p => p.propertyType === 'Node')) mesh.dispose();
  }
  await optimise(doc, cfg.bake.optimise, { encoder: MeshoptEncoder });
  return { id, sidecar, glb: await io.writeBinary(doc), anim };
}

export async function bake({ game = '.', ids = [], check = false, log = console.log } = {}) {
  const cfg = typeof game === 'string' ? await loadConfig(game) : game;
  const registry = await loadRegistry(cfg), src = sources(cfg), outDir = resolve(cfg.dir, cfg.bake.out), prev = readBaked(outDir);
  for (const id of ids) if (!src.has(id)) throw new Error(`bake: ${id}: no such model in ${cfg.bake.src}`);
  const changed = prev.phys && (prev.phys.materials !== registry.hash || minor(prev.phys.engine) !== minor(ENGINE_VERSION));
  if (ids.length && (changed || !prev.phys)) log('bake: no phys.json yet, or the registry hash or engine version changed, so every model is baked');
  const full = !ids.length || changed || !prev.phys, todo = full ? [...src.keys()] : ids, results = [];
  for (const id of todo) {
    const r = await bakeModel(cfg, registry, id, src.get(id), log);
    results.push(r);
    log(`baked ${id}: ${r.sidecar.parts.length} parts, ${r.sidecar.colliders.length} colliders, ${r.glb.byteLength} bytes${r.anim ? `, ${Object.keys(r.anim.clips).length} clips` : ''}`);
  }
  const keep = [...src.keys()].filter(id => !todo.includes(id));
  writeBaked(outDir, { results, engine: ENGINE_VERSION, materials: registry.hash, prev, keep, full });
  return { ok: true, baked: todo, stale: [] };
}
```
- [ ] **Step 4:** `RUN test/bake-output.test.mjs`. Expected: PASS (7 tests). The last one is 3k's need: two kits each ship `Textures/colormap.png`; each `.gltf` source resolves its own, and every output is a self-contained GLB, so nothing collides.
- [ ] **Step 5: Mutation.** In `index.js`, change `const full = !ids.length || changed || !prev.phys` to `const full = !ids.length`. Expect the partial-bake test to fail on `baked.length`. Revert.
- [ ] **Step 6:** Write the committed fixture output: `node -e "import('./tools/bake/index.js').then(m => m.bake({ game: 'test/fixtures/models/game' }))"`. Expected: five `baked …` lines and `test/fixtures/models/game/baked/` containing `phys.json`, `manifest.json` and six files under `models/`.
- [ ] **Step 7:** `git add tools/bake/write.js tools/bake/index.js test/bake-output.test.mjs test/fixtures/models/game/baked && git commit -m "feat(bake): lion-hawk bake writes the committed baked/ output"`

### Task 11: `bake --check`

**Files:** modify `tools/bake/index.js`; create `test/bake-check.test.mjs`.
**Interfaces:** `bake({ check: true })` writes nothing. It returns `ok: false` and `stale` entries:
- `{ id, why: 'source changed' | 'not baked' | 'source removed' }`;
- `{ id: '*', why: 'registry hash <a> → <b>' | 'engine <a> → <b>' | 'no phys.json' }`.

Each one is also logged as `stale: <id>: <why>`.

- [ ] **Step 1: Failing test** `test/bake-check.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bake, ENGINE_VERSION } from '../tools/bake/index.js';
import { copyFixture, FIXTURE } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const quiet = () => {};
const snapshot = dir => Object.fromEntries(readdirSync(join(dir, 'baked'), { recursive: true }).filter(f => statSync(join(dir, 'baked', f)).isFile()).map(f => [f, readFileSync(join(dir, 'baked', f)).toString('base64')]));

test('3d: the committed fixture baked/ is current (sources and registry; the engine minor is checked below)', async () => {
  const r = await bake({ game: FIXTURE, check: true, log: quiet });
  assert.deepEqual(r.stale.filter(s => !s.why.startsWith('engine ')), [], 'run: node bin/lion-hawk.js bake --game test/fixtures/models/game');
});
test('3d: --check passes on a fresh bake and writes nothing', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const before = snapshot(dir), r = await bake({ game: dir, check: true, log: quiet });
  assert.deepEqual(r, { ok: true, baked: [], stale: [] });
  assert.deepEqual(snapshot(dir), before);
});
test('3d: --check reports a changed, added or removed source, the registry hash and the engine major.minor', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const logs = [];
  writeFileSync(join(dir, 'assets/models/crate.glb'), await build('ramp'));
  writeFileSync(join(dir, 'assets/models/extra.glb'), await build('crate'));
  rmSync(join(dir, 'assets/models/ramp.glb'));
  writeFileSync(join(dir, 'game.config.js'), readFileSync(join(dir, 'game.config.js'), 'utf8').replace(/\n\s*ramp: \{[^\n]*\n/, '\n'));
  const r = await bake({ game: dir, check: true, log: m => logs.push(m) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.stale, [{ id: 'crate', why: 'source changed' }, { id: 'extra', why: 'not baked' }, { id: 'ramp', why: 'source removed' }]);
  assert.deepEqual(logs, ['stale: crate: source changed', 'stale: extra: not baked', 'stale: ramp: source removed']);
  const dir2 = copyFixture({ baked: false }); await bake({ game: dir2, log: quiet });
  const phys = JSON.parse(readFileSync(join(dir2, 'baked/phys.json'), 'utf8'));
  const [maj, min] = ENGINE_VERSION.split('.');
  writeFileSync(join(dir2, 'baked/phys.json'), JSON.stringify({ ...phys, engine: `${maj}.${Number(min) + 1}.0` }));
  writeFileSync(join(dir2, 'materials.js'), readFileSync(join(dir2, 'materials.js'), 'utf8').replace(/hash: '[0-9a-f]+'/, "hash: 'abcdef01'"));
  assert.deepEqual((await bake({ game: dir2, check: true, log: quiet })).stale.map(s => s.why),
    [`registry hash ${phys.materials} → abcdef01`, `engine ${maj}.${Number(min) + 1}.0 → ${ENGINE_VERSION}`]);
  writeFileSync(join(dir2, 'baked/phys.json'), JSON.stringify({ ...phys, engine: `${maj}.${min}.99`, materials: 'abcdef01' }));   // a patch bump is not stale
  assert.equal((await bake({ game: dir2, check: true, log: quiet })).ok, true);
  rmSync(join(dir2, 'baked/phys.json'));
  assert.deepEqual((await bake({ game: dir2, check: true, log: quiet })).stale, [{ id: '*', why: 'no phys.json' }]);
});
```
- [ ] **Step 2:** `RUN test/bake-check.test.mjs`. Expected: FAIL. "--check passes on a fresh bake and writes nothing" fails with `baked: [5 ids]` against `[]`, because `check` still bakes.
- [ ] **Step 3: Implement.** In `tools/bake/index.js`, insert this block immediately before the line `  const changed = prev.phys && (prev.phys.materials !== registry.hash || …`:
```js
  if (check) {
    const stale = [], phys = prev.phys;
    if (!phys) return { ok: false, baked: [], stale: [{ id: '*', why: 'no phys.json' }] };
    if (phys.materials !== registry.hash) stale.push({ id: '*', why: `registry hash ${phys.materials} → ${registry.hash}` });
    if (minor(phys.engine) !== minor(ENGINE_VERSION)) stale.push({ id: '*', why: `engine ${phys.engine} → ${ENGINE_VERSION}` });
    for (const [id, s] of src) {
      const side = phys.models[id];
      if (!side) stale.push({ id, why: 'not baked' });
      else if (side.source.sha256 !== sha256(readFileSync(s.file))) stale.push({ id, why: 'source changed' });
    }
    for (const id of Object.keys(phys.models)) if (!src.has(id)) stale.push({ id, why: 'source removed' });
    for (const s of stale) log(`stale: ${s.id}: ${s.why}`);
    return { ok: stale.length === 0, baked: [], stale };
  }
```
- [ ] **Step 4:** `RUN test/bake-check.test.mjs test/bake-output.test.mjs`. Expected: PASS (3 + 7 tests).
- [ ] **Step 5:** `git add tools/bake/index.js test/bake-check.test.mjs && git commit -m "feat(bake): bake --check reports stale sources, registry and engine"`

### Task 12: Build output dir, template and stamps

**Files:** create `tools/build/out.js`, `tools/build/page.js`, `test/build-page.test.mjs`.
**Interfaces:**
- Produces `resolveOut({ cfg, out, env, site }) → absDir`, which throws `UsageError` (`build: pass --out or set $<outEnv>`, or `… is under site/exp/; only a deploy passes --site`).
- Produces `fillTemplate(template, js)`, `stampPage(html, { id, version, engine, hash })` and `stampWorker(sw, { version, engine, hash, precache })`.

- [ ] **Step 1: Failing test** `test/build-page.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { resolveOut, UsageError } from '../tools/build/out.js';
import { fillTemplate, stampPage, stampWorker } from '../tools/build/page.js';

const cfg = { dir: '/w/four43/games/tractor-pickup', outEnv: 'TRACTOR_OUT', site: 'tractor-pickup' };

test('3d: --out wins over $<outEnv>; neither is a usage error naming the variable', () => {
  assert.equal(resolveOut({ cfg, out: '/scratch/a', env: { TRACTOR_OUT: '/scratch/b' } }), '/scratch/a');
  assert.equal(resolveOut({ cfg, env: { TRACTOR_OUT: '/scratch/b' } }), '/scratch/b');
  assert.equal(resolveOut({ cfg, out: 'rel', env: {} }), resolve('rel'));
  assert.throws(() => resolveOut({ cfg, env: {} }), e => e instanceof UsageError && e.message === 'build: pass --out or set $TRACTOR_OUT');
});
test('3d: any path under site/exp/ is refused without --site (constraint 8); --site alone means the default site dir', () => {
  for (const out of ['/w/four43/site/exp/tractor-pickup', '/w/four43/site/exp', '/tmp/x/site/exp/a/b'])
    assert.throws(() => resolveOut({ cfg, out, env: {} }), e => e instanceof UsageError && /under site\/exp\/; only a deploy passes --site/.test(e.message), out);
  assert.throws(() => resolveOut({ cfg, env: { TRACTOR_OUT: '/w/four43/site/exp/tractor-pickup' } }), UsageError);
  assert.equal(resolveOut({ cfg, out: '/w/four43/site/expo/x', env: {} }), '/w/four43/site/expo/x');
  assert.equal(resolveOut({ cfg, env: {}, site: true }), join('/w/four43/site/exp', 'tractor-pickup'));   // path only; nothing is written
});
test('3d: the template takes the bundle at <!--APP--> with </script escaped; a template without the marker fails', () => {
  assert.equal(fillTemplate('<script><!--APP--></script>', 'a("</script>");$&'), '<script>a("<\\/script>");$&</script>');
  assert.throws(() => fillTemplate('<script>/*BUNDLE*/</script>', 'x'), /build: the template has no <!--APP--> marker/);
});
test('3d: B-5 stamps: a meta tag after <head>, and sw.js __VERSION__ and __PRECACHE__', () => {
  const html = stampPage('<html><head lang="en"><title>t</title></head></html>', { id: 'g', version: '1.2.3', engine: '0.8.0', hash: 'abc123def456' });
  assert.equal(html, '<html><head lang="en">\n<meta name="lion-hawk-build" content="g 1.2.3 lion-hawk 0.8.0 abc123def456"><title>t</title></head></html>');
  const sw = stampWorker("const C = 'g-__VERSION__';\nconst P = __PRECACHE__;", { version: '1.2.3', engine: '0.8.0', hash: 'abc', precache: ['./', 'assets/models/a.glb'] });
  assert.equal(sw, "const C = 'g-1.2.3+lh0.8.0-abc';\nconst P = [\"./\",\"assets/models/a.glb\"];");
  assert.throws(() => stampWorker("const C = '__VERSION__';", { version: '1', engine: '0', hash: 'h', precache: [] }), /pwa\/sw\.js has no __PRECACHE__/);
});
```
- [ ] **Step 2:** `RUN test/build-page.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/build/out.js`:
```js
// Where a build may write (overview §4.3, global constraint 8). resolveOut({ cfg, out, env, site }) → absolute dir.
// --out wins, then $<outEnv>; with neither, --site gives the default site dir (<repo>/site/exp/<site>), else exit 2. Any
// path under a site/exp/ directory is refused unless --site is passed.
import { resolve, sep } from 'node:path';

export class UsageError extends Error {}

export function resolveOut({ cfg, out, env = process.env, site = false }) {
  let dir = out ?? (cfg.outEnv ? env[cfg.outEnv] : undefined);
  if (!dir && site) dir = resolve(cfg.dir, '../../site/exp', cfg.site);
  if (!dir) throw new UsageError(`build: pass --out or set $${cfg.outEnv ?? '<outEnv>'}`);
  const abs = resolve(dir);
  if (!site && (abs + sep).includes(`${sep}site${sep}exp${sep}`)) throw new UsageError(`build: ${abs} is under site/exp/; only a deploy passes --site`);
  return abs;
}
```
and `tools/build/page.js`:
```js
// The page (B-1, B-5): the template with the bundle at <!--APP-->, a build stamp meta tag, and the service worker stamp.
export function fillTemplate(template, js) {
  if (!template.includes('<!--APP-->')) throw new Error('build: the template has no <!--APP--> marker');
  return template.replace('<!--APP-->', () => js.replace(/<\/script/gi, '<\\/script'));
}
// B-5: <meta name="lion-hawk-build" content="<game> <gameVersion> lion-hawk <engineVersion> <hash>"> after <head>
export function stampPage(html, { id, version, engine, hash }) {
  const meta = `<meta name="lion-hawk-build" content="${id} ${version} lion-hawk ${engine} ${hash}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}\n${meta}`) : `${meta}\n${html}`;
}
// sw.js: __VERSION__ → "<gameVersion>+lh<engineVersion>-<hash>", __PRECACHE__ → a JSON array literal
export function stampWorker(sw, { version, engine, hash, precache }) {
  if (!sw.includes('__PRECACHE__')) throw new Error('build: pwa/sw.js has no __PRECACHE__ (const PRECACHE = __PRECACHE__;)');
  if (!sw.includes('__VERSION__')) throw new Error('build: pwa/sw.js has no __VERSION__');
  return sw.replaceAll('__VERSION__', `${version}+lh${engine}-${hash}`).replace('__PRECACHE__', () => JSON.stringify(precache));
}
```
- [ ] **Step 4:** `RUN test/build-page.test.mjs`. Expected: PASS (4 tests).
- [ ] **Step 5: Mutation.** Delete the `if (!site && …site/exp…)` line. Expect the site/exp test to fail. Revert.
- [ ] **Step 6:** `git add tools/build/out.js tools/build/page.js test/build-page.test.mjs && git commit -m "feat(build): output dir guard, template fill and B-5 stamps"`

### Task 13 (judgment): `build()`

**Files:**
- create `tools/build/index.js` and `test/build-run.test.mjs`;
- create `test/fixtures/models/game/{src/main.js,template.html,build.hooks.js,pwa/sw.js,pwa/manifest.webmanifest,pwa/icon.svg}`.

**Interfaces:**
- Produces `build({ game, out, env, site, mode, e2e, entry, log }) → Promise<{ out, version, hash, files, sizes: { html, assets, total: { bytes, gzip } } }>`.
- Produces `bundle(cfg, { entry, e2e })`, `bakedAssets(cfg)` and `ENGINE_VERSION`, and re-exports `dedupe` and `UsageError`.
- Hooks get `ctx = { config, game, out, e2e, version, engine, log }`. `beforePage(ctx)` is awaited before the page is made; `page(html, ctx) → html`.

**Expected decisions:**
- (a) `--e2e` means no minify, an inline sourcemap, `ctx.e2e = true` for hooks (Tractor skips ffmpeg) and no `sw.js` (tests run without a service worker).
- (b) The content hash is sha256 over the page before stamping, the baked assets and the non-sw PWA files, 12 hex characters.
- (c) The page stamp is a `<meta name="lion-hawk-build">` tag. The sw `__VERSION__` becomes `<game>+lh<engine>-<hash>`. `__PRECACHE__` becomes `./`, every `assets/models/*` and every PWA file except `sw.js`. (C8)
- (d) A baked GLB whose sha differs from `manifest.json` fails the build.
- (e) `--mode` accepts only `single`.

- [ ] **Step 1: Fixture build inputs.** `test/fixtures/models/game/src/main.js`:
```js
// Fixture entry: imports the baked sidecars and manifest as JSON (D2) and three (deduped from the game root, #11).
import PHYS from '../baked/phys.json' with { type: 'json' };
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { REVISION } from 'three';
globalThis.fixture = { models: Object.keys(PHYS.models), glbs: Object.values(MANIFEST.models).map(m => m.glb), three: REVISION, tag: '</script>' };
```
`test/fixtures/models/game/template.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"><title>fixture</title></head>
<body><script><!--HOOK--></script><script><!--APP--></script></body></html>
```
`test/fixtures/models/game/build.hooks.js`:
```js
// Fixture build hooks (B-2): beforePage records the context; page fills <!--HOOK--> as Tractor's voice embedding does.
let seen = null;
export default {
  beforePage(ctx) { seen = { e2e: ctx.e2e, version: ctx.version, engine: ctx.engine }; },
  page(html, ctx) { return html.replace('<!--HOOK-->', `window.__HOOK__=${JSON.stringify({ ...seen, out: ctx.out === undefined ? null : 'set' })};`); },
};
```
`test/fixtures/models/game/pwa/sw.js`:
```js
const CACHE = 'fixture-__VERSION__';
const PRECACHE = __PRECACHE__;
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE))));
```
`pwa/manifest.webmanifest`: `{ "name": "fixture", "start_url": "./" }`, and `pwa/icon.svg`: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`.
- [ ] **Step 2: Failing test** `test/build-run.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { build, ENGINE_VERSION } from '../tools/build/index.js';
import { copyFixture } from './helpers/bakeGame.mjs';

const quiet = () => {};
const scratch = () => mkdtempSync(join(tmpdir(), 'lh-out-'));
const runPage = html => { const ctx = { window: {} }; ctx.globalThis = ctx; for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(m[1], ctx); return ctx; };

test('3d: build writes the page, the baked models, the PWA files and a stamped sw.js; the bundle runs', async () => {
  const game = copyFixture(), out = scratch(), logs = [];
  const r = await build({ game, out, env: {}, log: m => logs.push(m) });
  assert.deepEqual(readdirSync(out, { recursive: true }).sort(), ['assets', 'assets/models', 'assets/models/cart.glb', 'assets/models/crate.glb',
    'assets/models/palette.glb', 'assets/models/pet.anim.json', 'assets/models/pet.glb', 'assets/models/ramp.glb', 'icon.svg', 'index.html', 'manifest.webmanifest', 'sw.js']);
  for (const f of readdirSync(join(game, 'baked/models'))) assert.ok(readFileSync(join(out, 'assets/models', f)).equals(readFileSync(join(game, 'baked/models', f))));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<meta name="lion-hawk-build" content="fixture 1\\.2\\.3 lion-hawk ${ENGINE_VERSION.replaceAll('.', '\\.')} ${r.hash}">`));
  const page = runPage(html);
  assert.deepEqual(page.fixture.models, ['cart', 'crate', 'palette', 'pet', 'ramp']);
  assert.equal(page.fixture.three, 'game-copy');                                 // dedupe: three from the game root (#11)
  assert.equal(page.fixture.tag, '</script>');                                   // escaped in the page, intact at runtime
  assert.deepEqual(page.window.__HOOK__, { e2e: false, version: '1.2.3', engine: ENGINE_VERSION, out: 'set' });   // B-2 hooks ran
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  assert.match(sw, new RegExp(`'fixture-1\\.2\\.3\\+lh${ENGINE_VERSION.replaceAll('.', '\\.')}-${r.hash}'`));
  assert.ok(sw.includes(`const PRECACHE = ${JSON.stringify(['./', 'assets/models/cart.glb', 'assets/models/crate.glb', 'assets/models/palette.glb', 'assets/models/pet.glb', 'assets/models/pet.anim.json', 'assets/models/ramp.glb', 'icon.svg', 'manifest.webmanifest'])};`));
  assert.equal(r.version, `1.2.3+lh${ENGINE_VERSION}-${r.hash}`);
  assert.equal(r.sizes.html.bytes, Buffer.byteLength(html)); assert.equal(r.sizes.html.gzip, gzipSync(Buffer.from(html)).length);
  assert.ok(r.sizes.total.bytes > r.sizes.html.bytes + r.sizes.assets.bytes);
  assert.ok(logs.some(l => /^\s+total\s/.test(l)) && logs.some(l => /^\s+assets\s/.test(l)));
});
test('3d: $<outEnv> is used when --out is absent; the hash changes when a baked model changes', async () => {
  const game = copyFixture(), out = scratch();
  const a = await build({ game, env: { LH_FIXTURE_OUT: out }, log: quiet });
  assert.ok(existsSync(join(out, 'index.html')));
  const man = JSON.parse(readFileSync(join(game, 'baked/manifest.json'))), glb = readFileSync(join(game, 'baked/models/crate.glb'));
  writeFileSync(join(game, 'baked/models/crate.glb'), Buffer.concat([glb, Buffer.alloc(4)]));
  await assert.rejects(build({ game, out: scratch(), env: {}, log: quiet }), /build: models\/crate\.glb does not match baked\/manifest\.json \(run lion-hawk bake\)/);
  man.models.crate.sha256 = (await import('../tools/bake/write.js')).sha256(readFileSync(join(game, 'baked/models/crate.glb')));
  writeFileSync(join(game, 'baked/manifest.json'), JSON.stringify(man));
  const b = await build({ game, out: scratch(), env: {}, log: quiet });
  assert.notEqual(a.hash, b.hash);
});
test('3d: --e2e skips minify and the service worker and tells the hooks; shared mode and site/exp are refused', async () => {
  const game = copyFixture(), out = scratch();
  await build({ game, out, env: {}, e2e: true, log: quiet });
  assert.ok(!existsSync(join(out, 'sw.js')));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /sourceMappingURL=data:/);
  assert.equal(runPage(html).window.__HOOK__.e2e, true);
  await assert.rejects(build({ game, out, env: {}, mode: 'shared', log: quiet }), /build: mode 'shared' is not available/);
  await assert.rejects(build({ game, out: join(scratch(), 'site/exp/fixture'), env: {}, log: quiet }), /under site\/exp\//);
  await assert.rejects(build({ game, env: {}, log: quiet }), /build: pass --out or set \$LH_FIXTURE_OUT/);
});
```
- [ ] **Step 3:** `RUN test/build-run.test.mjs`. Expected: FAIL, `Cannot find module '.../tools/build/index.js'`.
- [ ] **Step 4: Implement** `tools/build/index.js`:
```js
// lion-hawk build (B-1, B-2, B-3 as amended by D1, B-5): esbuild + dedupe, the page from the template, assets/models/* from
// baked/, the PWA files, sw.js stamped with the version and the precache list, then a size report.
// build({ game, out, env, site, mode, e2e, entry, log }) → { out, version, hash, files, sizes }.
import { build as esbuild } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dedupe } from '../dedupe.js';
import { loadConfig, importFresh } from '../bake/config.js';
import { readBaked, sha256 } from '../bake/write.js';
import { resolveOut, UsageError } from './out.js';
import { fillTemplate, stampPage, stampWorker } from './page.js';
export { dedupe, UsageError };

export const ENGINE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export async function bundle(cfg, { entry, e2e = false } = {}) {
  const res = await esbuild({
    entryPoints: [resolve(cfg.dir, entry ?? cfg.build.entry)], bundle: true, format: 'iife', minify: !e2e, write: false,
    sourcemap: e2e ? 'inline' : false, loader: { '.json': 'json' }, logLevel: 'silent', plugins: [dedupe({ root: cfg.dir })],
  });
  return res.outputFiles[0].text;
}

// the baked models listed in manifest.json, each checked against its recorded sha256
export function bakedAssets(cfg) {
  const outDir = resolve(cfg.dir, cfg.bake.out), { manifest } = readBaked(outDir);
  if (!manifest) return [];
  const files = [];
  for (const [id, m] of Object.entries(manifest.models)) {
    const glb = join(outDir, m.glb);
    if (!existsSync(glb) || sha256(readFileSync(glb)) !== m.sha256) throw new Error(`build: ${m.glb} does not match baked/manifest.json (run lion-hawk bake)`);
    files.push({ src: glb, rel: `assets/${m.glb}` });
    if (m.anim) files.push({ src: join(outDir, m.anim), rel: `assets/${m.anim}` });
  }
  return files;
}

export async function build({ game = '.', out, env = process.env, site = false, mode = 'single', e2e = false, entry, log = console.log } = {}) {
  if (mode !== 'single') throw new UsageError(`build: mode '${mode}' is not available (only 'single'; shared mode is B-4, not built)`);
  const cfg = typeof game === 'string' ? await loadConfig(game) : game;
  const dir = resolveOut({ cfg, out, env, site });
  const hooks = cfg.build.hooks ? (await importFresh(resolve(cfg.dir, cfg.build.hooks))).default ?? {} : {};
  const ctx = { config: cfg, game: cfg.dir, out: dir, e2e, version: cfg.version, engine: ENGINE_VERSION, log };
  const js = await bundle(cfg, { entry, e2e });
  if (hooks.beforePage) await hooks.beforePage(ctx);
  let html = fillTemplate(readFileSync(resolve(cfg.dir, cfg.build.template), 'utf8'), js);
  if (hooks.page) html = await hooks.page(html, ctx);
  if (typeof html !== 'string') throw new Error('build: hooks.page must return the html string');
  const assets = bakedAssets(cfg), pwaDir = resolve(cfg.dir, cfg.build.pwa);
  const pwa = existsSync(pwaDir) ? readdirSync(pwaDir).sort().filter(f => statSync(join(pwaDir, f)).isFile()) : [];
  const h = createHash('sha256').update(html);
  for (const a of assets) h.update(a.rel).update(readFileSync(a.src));
  for (const f of pwa) if (f !== 'sw.js') h.update(f).update(readFileSync(join(pwaDir, f)));
  const hash = h.digest('hex').slice(0, 12);
  html = stampPage(html, { id: cfg.id, version: cfg.version, engine: ENGINE_VERSION, hash });
  mkdirSync(join(dir, 'assets/models'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  for (const a of assets) copyFileSync(a.src, join(dir, a.rel));
  const files = ['index.html', ...assets.map(a => a.rel)];
  for (const f of pwa) {
    if (f === 'sw.js') continue;
    copyFileSync(join(pwaDir, f), join(dir, f)); files.push(f);
  }
  if (pwa.includes('sw.js') && !e2e) {
    const precache = ['./', ...files.filter(f => f !== 'index.html')];
    writeFileSync(join(dir, 'sw.js'), stampWorker(readFileSync(join(pwaDir, 'sw.js'), 'utf8'), { version: cfg.version, engine: ENGINE_VERSION, hash, precache }));
    files.push('sw.js');
  }
  const size = list => list.reduce((s, f) => { const b = readFileSync(join(dir, f)); return { bytes: s.bytes + b.length, gzip: s.gzip + gzipSync(b).length }; }, { bytes: 0, gzip: 0 });
  const sizes = { html: size(['index.html']), assets: size(assets.map(a => a.rel)), total: size(files) };
  const kb = n => `${(n / 1024).toFixed(1)} KB`;
  log(`build: ${cfg.id} ${cfg.version} (lion-hawk ${ENGINE_VERSION}, ${hash}) → ${dir}`);
  for (const k of ['html', 'assets', 'total']) log(`  ${k.padEnd(6)} ${kb(sizes[k].bytes).padStart(10)}  gzip ${kb(sizes[k].gzip).padStart(10)}`);
  return { out: dir, version: `${cfg.version}+lh${ENGINE_VERSION}-${hash}`, hash, files, sizes };
}
```
- [ ] **Step 5:** `RUN test/build-run.test.mjs test/build.test.mjs`. Expected: PASS (3 + 1 tests).
- [ ] **Step 6: Mutation.** Remove `plugins: [dedupe({ root: cfg.dir })]` from `bundle`. Expect `page.fixture.three` to be `'186'` rather than `'game-copy'`. Revert.
- [ ] **Step 7:** `git add tools/build/index.js test/build-run.test.mjs test/fixtures/models/game && git commit -m "feat(build): lion-hawk build with dedupe, baked assets, PWA stamp and size report"`

### Task 14: `dev()`

**Files:** create `tools/dev/index.js`, `test/build-dev.test.mjs`.
**Interfaces:** `dev({ game, port = 8740, host = '0.0.0.0', log }) → Promise<{ url, port, close() }>`. It serves:
- `/` (the page plus the reload script);
- `/lh-reload` (server-sent events: `data: reload`);
- `/assets/models/*` from `<bake.out>/models`;
- the PWA files, with `sw.js` → 404.

Hooks get `ctx.dev = true` and `ctx.e2e = true`.

- [ ] **Step 1: Failing test** `test/build-dev.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { dev } from '../tools/dev/index.js';
import { copyFixture } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error('timed out'); };
const sse = url => {
  const events = [];
  const req = http.get(url, res => res.on('data', c => { if (String(c).includes('data: reload')) events.push(Date.now()); }));
  return { events, close: () => req.destroy() };
};

test('3d: dev serves the live page, baked models as assets/models and no service worker; a model edit re-bakes and reloads', async t => {
  const game = copyFixture(), logs = [];
  const d = await dev({ game, port: 0, host: '127.0.0.1', log: m => logs.push(m) });
  t.after(() => d.close());
  const page = await until(async () => { const h = await (await fetch(d.url)).text(); return h.includes('globalThis.fixture') && h; });
  assert.match(page, /new EventSource\('\/lh-reload'\)/);
  assert.match(page, /__HOOK__/);
  const glb = Buffer.from(await (await fetch(`${d.url}assets/models/crate.glb`)).arrayBuffer());
  assert.ok(glb.equals(readFileSync(join(game, 'baked/models/crate.glb'))));
  assert.equal((await fetch(`${d.url}sw.js`)).status, 404);
  assert.equal((await fetch(`${d.url}manifest.webmanifest`)).status, 200);
  const s = sse(`${d.url}lh-reload`); t.after(() => s.close());
  await new Promise(r => setTimeout(r, 200));
  const bytes = await build('cart');
  writeFileSync(join(game, 'assets/models/crate.glb'), bytes);
  await until(() => s.events.length > 0);
  const phys = JSON.parse(readFileSync(join(game, 'baked/phys.json'), 'utf8'));
  assert.equal(phys.models.crate.source.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(phys.models.crate.parts, ['body', 'wheel', 'mast', 'lamp001', 'lamp001-2']);
  assert.ok(logs.some(l => /^baked crate:/.test(l)));
});
test('3d: a template edit rebuilds the page', async t => {
  const game = copyFixture(), d = await dev({ game, port: 0, host: '127.0.0.1', log: () => {} });
  t.after(() => d.close());
  await until(async () => (await (await fetch(d.url)).text()).includes('globalThis.fixture'));
  writeFileSync(join(game, 'template.html'), readFileSync(join(game, 'template.html'), 'utf8').replace('<title>fixture</title>', '<title>edited</title>'));
  await until(async () => (await (await fetch(d.url)).text()).includes('<title>edited</title>'));
});
```
- [ ] **Step 2:** `RUN test/build-dev.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `tools/dev/index.js`:
```js
// lion-hawk dev (B-1, overview §4.3): an esbuild context with live reload. Serves the page (template + bundle + a reload
// script), baked/models as assets/models, and the PWA files except sw.js (no service worker in dev). A changed model source
// is re-baked (that model only) and the page reloads. dev({ game, port, host, log }) → { url, port, close }.
import { context } from 'esbuild';
import http from 'node:http';
import { existsSync, readFileSync, watch } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { dedupe } from '../dedupe.js';
import { loadConfig, importFresh } from '../bake/config.js';
import { bake, sources } from '../bake/index.js';
import { fillTemplate } from '../build/page.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
const RELOAD = `<script>new EventSource('/lh-reload').onmessage = () => location.reload();</script>`;

export async function dev({ game = '.', port = 8740, host = '0.0.0.0', log = console.log } = {}) {
  const cfg = await loadConfig(game), template = resolve(cfg.dir, cfg.build.template), clients = new Set();
  const hooks = cfg.build.hooks ? (await importFresh(resolve(cfg.dir, cfg.build.hooks))).default ?? {} : {};
  const hctx = { config: cfg, game: cfg.dir, out: null, e2e: true, dev: true, version: cfg.version, engine: null, log };
  let html = '<!doctype html><p>lion-hawk dev: building…</p>' + RELOAD, js = '';
  const reload = () => { for (const res of clients) res.write('data: reload\n\n'); };
  const render = async () => {
    let page = fillTemplate(readFileSync(template, 'utf8'), js);
    if (hooks.beforePage) await hooks.beforePage(hctx);
    if (hooks.page) page = await hooks.page(page, hctx);
    html = page.includes('</body>') ? page.replace('</body>', () => `${RELOAD}</body>`) : page + RELOAD;
    reload();
  };
  const ctx = await context({
    entryPoints: [resolve(cfg.dir, cfg.build.entry)], bundle: true, format: 'iife', sourcemap: 'inline', write: false,
    outfile: join(cfg.dir, 'build/dev/app.js'), loader: { '.json': 'json' }, logLevel: 'silent',
    plugins: [dedupe({ root: cfg.dir }), { name: 'lh-dev-page', setup(b) {
      b.onEnd(async res => {
        if (res.errors.length) { log(`dev: build failed: ${res.errors[0].text}`); return; }
        js = res.outputFiles[0].text; await render(); log('dev: rebuilt');
      });
    } }],
  });
  await ctx.watch();
  const watchers = [watch(template, () => render().catch(e => log(`dev: ${e.message}`)))];
  const srcDir = resolve(cfg.dir, cfg.bake.src);
  if (cfg.bake.materials && existsSync(srcDir)) {
    let timer = null; const pending = new Set();
    watchers.push(watch(srcDir, (_, file) => {
      if (!file || !/\.(glb|gltf)$/.test(file)) return;
      pending.add(file); clearTimeout(timer);
      timer = setTimeout(async () => {
        const files = [...pending]; pending.clear();
        try {
          const byFile = new Map([...sources(cfg)].map(([id, s]) => [basename(s.file), id]));
          const ids = files.map(f => byFile.get(f)).filter(Boolean);
          if (ids.length) { await bake({ game: cfg, ids, log }); reload(); }
        } catch (e) { log(`dev: ${e.message}`); }
      }, 100);
    }));
  }
  const serve = (res, file) => {
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/lh-reload') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }).write(': hi\n\n');
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(html); return; }
    if (p.startsWith('/assets/models/')) { serve(res, join(resolve(cfg.dir, cfg.bake.out), 'models', basename(p))); return; }
    if (basename(p) === 'sw.js') { res.writeHead(404).end(); return; }
    serve(res, join(resolve(cfg.dir, cfg.build.pwa), basename(p)));
  });
  await new Promise(r => server.listen(port, host, r));
  const actual = server.address().port, url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actual}/`;
  log(`dev: ${cfg.id} at ${url}`);
  return {
    url, port: actual,
    async close() {
      for (const w of watchers) w.close();
      for (const res of clients) res.end();
      await ctx.dispose();
      await new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); });
    },
  };
}
```
- [ ] **Step 4:** `RUN test/build-dev.test.mjs`. Expected: PASS (2 tests).
- [ ] **Step 5:** `git add tools/dev/index.js test/build-dev.test.mjs && git commit -m "feat(dev): lion-hawk dev with live reload and re-bake on model change"`

### Task 15: CLI and bin

**Files:** create `tools/cli.js`, `bin/lion-hawk.js` (mode 755), `test/cli.test.mjs`.
**Interfaces:** `main(argv, { env, log, error }) → Promise<0 | 1 | 2 | null>`:
- 2 for usage errors (an unknown command or option, `UsageError`);
- 1 for a bake or build failure, or a stale `--check`;
- `null` while `dev` serves.

The CLI shape is exactly §4.3.

- [ ] **Step 1: Failing test** `test/cli.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { copyFixture } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const BIN = fileURLToPath(new URL('../bin/lion-hawk.js', import.meta.url));
const run = (args, env = {}) => new Promise(resolve => {
  const clean = { ...process.env }; delete clean.LH_FIXTURE_OUT;
  execFile(process.execPath, [BIN, ...args], { env: { ...clean, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});

test('3d: the bin is executable and usage errors exit 2', async () => {
  assert.ok(statSync(BIN).mode & 0o111, 'bin/lion-hawk.js is executable');
  let r = await run([]); assert.equal(r.code, 2); assert.match(r.stderr, /unknown command ''/); assert.match(r.stderr, /usage:/);
  r = await run(['frob']); assert.equal(r.code, 2);
  r = await run(['bake', '--chek']); assert.equal(r.code, 2); assert.match(r.stderr, /lion-hawk bake: Unknown option '--chek'/);
  r = await run(['dev', '--port', 'x']); assert.equal(r.code, 2);
  r = await run(['--help']); assert.equal(r.code, 0); assert.match(r.stdout, /lion-hawk build \[--game <dir>\]/);
});
test('3d: build with no --out and no $<outEnv> exits 2 with the contract message; site/exp exits 2 and writes nothing', async () => {
  const game = copyFixture();
  let r = await run(['build', '--game', game]);
  assert.equal(r.code, 2); assert.match(r.stderr, /build: pass --out or set \$LH_FIXTURE_OUT/);
  const site = join(mkdtempSync(join(tmpdir(), 'lh-site-')), 'site/exp/fixture');
  r = await run(['build', '--game', game, '--out', site]);
  assert.equal(r.code, 2); assert.ok(!existsSync(site));
  r = await run(['build', '--game', game, '--mode', 'shared', '--out', mkdtempSync(join(tmpdir(), 'lh-out-'))]);
  assert.equal(r.code, 2);
  const out = mkdtempSync(join(tmpdir(), 'lh-out-'));
  r = await run(['build', '--game', game], { LH_FIXTURE_OUT: out });
  assert.equal(r.code, 0, r.stderr); assert.ok(existsSync(join(out, 'index.html'))); assert.match(r.stdout, /gzip/);
});
test('3d: bake and bake --check exit codes: 0 current, 1 stale, 1 on a bake error', async () => {
  const game = copyFixture({ baked: false });
  let r = await run(['bake', '--game', game]); assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /baked pet: 4 parts, 4 colliders, \d+ bytes, 2 clips/);
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 0);
  writeFileSync(join(game, 'assets/models/crate.glb'), await build('ramp'));
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 1); assert.match(r.stdout, /stale: crate: source changed/);
  r = await run(['bake', '--game', game, 'crate']); assert.equal(r.code, 0);
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 0);
  r = await run(['bake', '--game', game, 'nope']); assert.equal(r.code, 1); assert.match(r.stderr, /lion-hawk: bake: nope: no such model/);
});
test('3d: dev keeps serving until killed', async () => {
  const game = copyFixture(), p = spawn(process.execPath, [BIN, 'dev', '--game', game, '--port', '0', '--host', '127.0.0.1']);
  let out = ''; p.stdout.on('data', c => { out += c; });
  try {
    const url = await new Promise((res, rej) => { const t = setInterval(() => { const m = /dev: fixture at (http:\S+)/.exec(out); if (m) { clearInterval(t); res(m[1]); } }, 50); setTimeout(() => rej(new Error(`no url: ${out}`)), 10000); });
    assert.equal((await fetch(url)).status, 200);
    assert.equal(p.exitCode, null);
  } finally { p.kill(); }
});
```
- [ ] **Step 2:** `RUN test/cli.test.mjs`. Expected: FAIL, `statSync` ENOENT on `bin/lion-hawk.js`.
- [ ] **Step 3: Implement** `tools/cli.js`:
```js
// lion-hawk CLI (B-1): `bake`, `build`, `dev`. main(argv, { env, log, error }) → exit code (0 ok, 1 failed or stale, 2 usage),
// or null while `dev` keeps serving.
import { parseArgs } from 'node:util';
import { bake } from './bake/index.js';
import { build, UsageError } from './build/index.js';
import { dev } from './dev/index.js';

export const USAGE = `usage:
  lion-hawk bake  [--game <dir>] [--check] [ids...]
  lion-hawk build [--game <dir>] (--out <dir> | $<outEnv>) [--site] [--mode single] [--e2e]
  lion-hawk dev   [--game <dir>] [--port 8740] [--host 0.0.0.0]`;

const OPTIONS = {
  bake: { game: { type: 'string', default: '.' }, check: { type: 'boolean', default: false } },
  build: { game: { type: 'string', default: '.' }, out: { type: 'string' }, site: { type: 'boolean', default: false },
    mode: { type: 'string', default: 'single' }, e2e: { type: 'boolean', default: false } },
  dev: { game: { type: 'string', default: '.' }, port: { type: 'string', default: '8740' }, host: { type: 'string', default: '0.0.0.0' } },
};

export async function main(argv, { env = process.env, log = console.log, error = console.error } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') { log(USAGE); return 0; }
  if (!OPTIONS[cmd]) { error(`lion-hawk: unknown command '${cmd ?? ''}'\n${USAGE}`); return 2; }
  let values, positionals;
  try { ({ values, positionals } = parseArgs({ args: rest, options: OPTIONS[cmd], allowPositionals: cmd === 'bake', strict: true })); }
  catch (e) { error(`lion-hawk ${cmd}: ${e.message}\n${USAGE}`); return 2; }
  try {
    if (cmd === 'bake') { const r = await bake({ game: values.game, ids: positionals, check: values.check, log }); return r.ok ? 0 : 1; }
    if (cmd === 'build') { await build({ game: values.game, out: values.out, env, site: values.site, mode: values.mode, e2e: values.e2e, log }); return 0; }
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) { error(`lion-hawk dev: --port must be 0..65535 (got ${values.port})`); return 2; }
    await dev({ game: values.game, port, host: values.host, log });
    return null;
  } catch (e) {
    error(`lion-hawk: ${e.message}`);
    return e instanceof UsageError ? 2 : 1;
  }
}
```
`bin/lion-hawk.js`:
```js
#!/usr/bin/env node
// lion-hawk CLI entry (B-1). See tools/cli.js.
import { main } from '../tools/cli.js';

const code = await main(process.argv.slice(2));
if (code !== null) process.exitCode = code;
```
then run `chmod +x bin/lion-hawk.js`.
- [ ] **Step 4:** `RUN test/cli.test.mjs`. Expected: PASS (4 tests).
- [ ] **Step 5:** Run the whole 3d set together:
  `RUN test/bake-hull.test.mjs test/bake-mass.test.mjs test/bake-config.test.mjs test/bake-fixtures.test.mjs test/bake-read.test.mjs test/bake-conventions.test.mjs test/bake-colliders.test.mjs test/bake-anim.test.mjs test/bake-optimise.test.mjs test/bake-output.test.mjs test/bake-check.test.mjs test/build-page.test.mjs test/build-run.test.mjs test/build-dev.test.mjs test/cli.test.mjs test/build.test.mjs`
  Expected: 57 tests, all pass. Then run the engine suite, `RUN test/`, and expect no new failures.
- [ ] **Step 6:** `git add tools/cli.js bin/lion-hawk.js test/cli.test.mjs && git update-index --chmod=+x bin/lion-hawk.js && git commit -m "feat(cli): lion-hawk bake, build and dev"`

### Task 16 (after 3b is on this branch; otherwise the integrator runs it at the Wave A merge): the real registry and `validatePhys`

**Files:** modify `test/fixtures/models/game/materials.js` and the committed `test/fixtures/models/game/baked/**`; create `test/bake-sidecar.test.mjs`.
**Interfaces:** consumes 3b's `defineMaterials`, `validatePhys` and `validateSidecar` (§3.2).

- [ ] **Step 1: Failing test** `test/bake-sidecar.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePhys, validateSidecar } from '../src/defs/sidecar.js';
import REGISTRY from './fixtures/models/game/materials.js';

test('3d: the baked fixture phys.json passes 3b validation and records the real registry hash', () => {
  const phys = JSON.parse(readFileSync(new URL('./fixtures/models/game/baked/phys.json', import.meta.url), 'utf8'));
  validatePhys(phys);
  for (const s of Object.values(phys.models)) validateSidecar(s);
  assert.equal(phys.materials, REGISTRY.hash);
  assert.match(REGISTRY.hash, /^[0-9a-f]{8}$/);
  assert.ok(Object.isFrozen(REGISTRY) && typeof REGISTRY.collider === 'function');   // a real defineMaterials registry
});
```
- [ ] **Step 2:** `RUN test/bake-sidecar.test.mjs`. Expected: FAIL on `REGISTRY.collider` (the duck-typed fixture), or on `validateSidecar` if the bake disagrees with 3b. Any validator failure is a contract mismatch: record it in the notes and stop (constraint 10).
- [ ] **Step 3:** Replace `test/fixtures/models/game/materials.js` with:
```js
// Fixture material registry for the 3d tests: 3b's base library only (steel, wood, rubber, plastic, flesh are all in it).
import { defineMaterials } from '../../../../src/defs/materials.js';
export default defineMaterials({});
```
Then re-bake: `node bin/lion-hawk.js bake --game test/fixtures/models/game`.
- [ ] **Step 4:** `RUN test/bake-sidecar.test.mjs test/bake-output.test.mjs test/bake-check.test.mjs test/bake-mass.test.mjs test/build-run.test.mjs`. Expected: PASS. The output test's crate mass of 600 kg needs `wood` at sg 0.6. If 3b's base `wood` differs, update the literal in "bake writes phys.json…" to 1000 × sg (the inertia is mass/6) and note it.
- [ ] **Step 5:** `git add test/fixtures/models/game test/bake-sidecar.test.mjs test/bake-output.test.mjs && git commit -m "test(bake): fixture uses the 3b registry; baked phys.json validates"`

### Task 17: Notes

**Files:** create `docs/plans/2026-10-13-phase-3d-bake-notes.md`.
- [ ] **Step 1:** Write the notes file with these sections: "Outcome" (test counts, commit range), "Decisions" (the judgment tasks above), "Contract issues" (copied from the end of this plan, each marked open or reconciled), "Measurements" (Tractor and Rally bake size and time from a scratch bake into `$SCRATCH`, never into the games' trees), and "Field note candidates" (seeded below).
- [ ] **Step 2:** `git add docs/plans/2026-10-13-phase-3d-bake-notes.md && git commit -m "docs: phase 3d notes"`

**Field note candidates (seed):**
1. `quantize()` and gltf-transform's `meshopt()` re-parent or re-transform mesh nodes, so engine parts can't use them on POSITION. Float positions cost compression.
2. `GLTFLoader` sanitises node names (`.`, `:`, `/`, `[`, `]` dropped, spaces → `_`) and de-duplicates them with `_n`. The bake now pre-sanitises, and Kenney models repeat node names (corn).
3. A multi-material part loads as a `Group` with child meshes `<name>_1`, `<name>_2` (3f/3g must treat the part node as the Group).
4. Kenney decorations carry flat decal primitives, so the "one hull per (part, material)" default needed a flat-group skip.
5. `bake --check` doesn't see config changes (renames, `static`, palette); only sources, the registry and the engine.
6. Pet anim tables moved from nlerp to slerp; frames differ from the old `assets.json` by under 1e-3 at 30 fps.

## Done when

- The 3d set passes: 57 tests across the 16 files in Task 15, step 5 (58 with Task 16). The engine unit suite (`RUN test/`) has no new failures.
- `node bin/lion-hawk.js bake --game test/fixtures/models/game --check` exits 0, apart from an engine-minor line after the integrator's version bump (integrator request 2).
- A scratch smoke run of the real games works without writing into four43:
  - a temp `game.config.js` pointing `bake.src` at Tractor's `assets/models` with a permissive registry bakes all 40 models;
  - so does Rally's 4.

  The numbers go in the notes.
- Merge point: Wave A (with 3b and 3c) → engine **0.8.0**, integrated by the controller with `--no-ff`.

## Contract issues

- **C1** (§4.3 "follows the longest axis"): a capsule or cylinder axis is the extent with the round cross-section (other two closest to equal), with ties going to the longest. "Longest" fits a wheel along its diameter.
- **C2** (§4.3 anim.json, underspecified): `parts` lists the part rows, then one row per socket named `sock-<name>`, as Tractor's mount rows did. Rotations slerp. The 12-float layout is Matrix4 elements 0,1,2,4,5,6,8,9,10,12,13,14 (agreed with 3f).
- **C3** (§4.3 sockets): a socket with no ancestor part has `part: null`. 3b's `validateSidecar` must accept null.
- **C4** (§4.3 checks): in default hulls, a flat (part, material) group is skipped with a warning, and only an all-flat model fails. A new per-model `colliders: false` gives `colliders: []` and zero mass, for decorations.
- **C5** (§4.3 game config): a new per-model `file` (a path under `bake.src`, `.glb` or `.gltf`, subfolders allowed) maps an id to a differently named source. External textures resolve relative to that file, and outputs are self-contained GLBs, so kits that share `Textures/colormap.png` never collide (3k's need; tested in Task 10).
- **C6** (§4.3 "the part name is the node name"): the name is sanitised as `GLTFLoader` does, and duplicates get `-2`, `-3`. The GLB node is renamed to match.
- **C7** (§4.3 colliders): hull and mesh entries hold body-space points with `p = [0,0,0]` and `q = [0,0,0,1]`.
- **C8** (§4.3 build, underspecified):
  - the B-5 page stamp is `<meta name="lion-hawk-build" content="<id> <ver> lion-hawk <engine> <hash>">`;
  - the sw `__VERSION__` is `<ver>+lh<engine>-<hash>`;
  - `--e2e` = unminified, no `sw.js`, `ctx.e2e`;
  - the hooks' ctx is `{ config, game, out, e2e, version, engine, log }` (dev adds `dev: true`).
- **C9** (§4.2 via the bake): the bake needs only `registry.has`, `density` and `hash`, and `bake.materials` is required. Until 3b merges, the fixture registry is duck-typed (Task 16 swaps it).

## Integrator requests

1. **`package.json`.** Add these before 3d starts:
   - `dependencies`: pin `@gltf-transform/core`, `@gltf-transform/extensions` and `@gltf-transform/functions` at `4.5.1`, and `meshoptimizer` at `~1.2.0` (match gltf-transform's tested range rather than `^1.3`);
   - add `pngjs` `^7.0.0` (new; the palette step);
   - move `esbuild` `^0.28.2` from devDependencies to dependencies (the CLI bundles at runtime).

   At the Wave A merge:
   - `exports`: `"./bake": "./tools/bake/index.js"`, and `"./build": "./tools/build/index.js"` (still exports `dedupe`, so `test/build.test.mjs` and `test/package.test.mjs` keep passing);
   - `"bin": { "lion-hawk": "bin/lion-hawk.js" }`.
2. **After each engine minor bump:** run `node bin/lion-hawk.js bake --game test/fixtures/models/game` and commit `baked/`. The current-fixture test ignores the engine line, so this is hygiene, not a red test.
3. **Tell 3j, 3k and 3l:**
   - (a) `weld` changes vertex counts where the palette step drops UVs and tangents (Rally's hatchback goes from 3709 to 2048), so the §5.3 parity test should compare triangle counts, or that game sets `optimise.weld: false`;
   - (b) the palette colours follow Tractor's formula, not Rally's old `pow(f, 1/2.2)` factor;
   - (c) Tractor's `rename.nodes: { hat: 'sock-hat' }` must be per pet model, because `hat-cowboy.glb` has a mesh node called `hat`;
   - (d) part names with `.` lose it (`lamp.001` → `lamp001`), and repeated names get `-2`;
   - (e) each game's `pwa/sw.js` needs `const PRECACHE = __PRECACHE__;`, and Rally's template needs `<!--APP-->` in place of `/*BUNDLE*/`.
4. **Task 16** runs at the Wave A merge if 3b is not on 3d's branch by then.
