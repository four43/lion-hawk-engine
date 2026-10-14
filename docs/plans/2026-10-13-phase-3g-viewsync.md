# Phase 3g: view sync, interpolation, smoothing, camera rigs, instancing, crowds and the audio service: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Goal:** the engine view layer that draws a World: `createViewSync` turns World entities into Object3Ds every frame, with interpolation from the prev/curr transform pool (E-6, E-11), N-15 smoothing of net corrections, instanced entity groups and baked-animation crowds; camera rigs that cover all three games, which all three adopt (Tractor's chase with velocity heading, portrait framing, shake, live `?tune` options and the F-10 blend back from the show camera, Rally's travel chase, title orbit and bumper/bonnet mounts, Pig Pens' orbit with gestures, framing and drive chase, and `view.project`); and the audio service (#67: unlock on a gesture or page show, suspend while hidden, master limiter, clip decode, positional option).

**Architecture:**
- **Sync reads, never writes.** `sync.frame(alpha)` walks `engine.world.with('xf')` in spawn order, keeps one record per entity (a `Map` by id plus an array, made when the entity first appears) and writes poses into Object3Ds or instance matrices. Prev poses come from `world.xfPrev(e, out)`, curr from `e.xf`. A new World (`engine.world` replaced, or `world.serial` changed) drops everything (S-3).
- **Drawn entities** (`model`, `draw !== false`): `draw: 'object'` (default) gets `assets.clone(model, { paint })`; `draw: 'instanced'` gets a slot in one `createInstances` per (model, part), compiled by 3f's compiler with `{ instanced: true, coverage: true }`. Paint slots become instance colours, and coverage materials (`COVERAGE_INSTANCED`) get a per-instance `instanceCoverage` written from `e.coverage`. Static instanced entities are not re-uploaded.
- **Part poses** (Task 13b): an entity's `e.partXf[name] = { p, q }` (3c Task 10b, written by sim code every step and swapped with `xf`) poses the model's named part: its centre at `p` in the body frame, turned by `q` from rest, interpolated with the body's alpha. Rally's wheels and the vehicle kit's wheels are drawn this way, so no game draws its own car.
- **Hooks** (`sync.on(match, { create, frame, remove })`) let games decorate or adopt objects for undrawn entities.
- **N-15** lives in `sync/smooth.js`: plain-number offsets, `dq = old ⊗ new⁻¹`, drawn = `offset ⊗ pose`, a linear fade over the kind's `smoothMs` on `view.dt`.
- **Rigs are small factories over a camera**, with live option objects so `?tune` can write them. Rigs that change the FOV add to 3e's `camera.userData.lhFov`; they never overwrite `camera.fov` blindly.
- **Audio** is one `AudioContext` per page, created inside the first gesture. Games connect synths to `audio.master`, which runs through a mute gain and a limiter.
- 3g runs alongside 3f with box-mesh stand-ins for `assets` and the compiler (`test/helpers/fakeAssets.mjs`) and a stand-in World (`test/helpers/fakeWorld.mjs`). One test runs the sync against 3c's real World.

**Tech Stack:** three 0.186 (engine view modules import `three` directly, D9), Node `node:test`, happy-dom for DOM tests, playwright-core Chromium for the audio e2e, esbuild for the e2e bundle.

**Spec:** `docs/spec.md` (E-6, E-10, E-11, N-15, N-17, S-1 `project`, S-3, R-8, A-11, I-2) plus `docs/plans/2026-10-13-phase-3-overview.md` (§4.4, §4.6–§4.9, §4.11, §5.2 row 3g) and the controller's rulings in `docs/plans/2026-10-13-phase-3-contract-issues.md` (3e: `camera.userData.lhFov`, null gfx without WebGL; 3f C3 `mc.time`, C6 `instanceCoverage`, C7 anim tables and `blendAnimTable`; 3g #1–#5 and the merge order; 3j #9 rigs cover Rally's chase/orbit/bumper/bonnet; 3k C9 orbit pose/clamps/chase; 3l CI-10 the chase rig gains velocity heading, portrait framing, shake and live tuning so Tractor adopts it).

**Branch:** `phase-3-viewsync` in worktree `/home/smiller/projects/four43/lion-hawk-engine-3g`, cut from `phase-3` after 0.8.0 (Wave A). Merges in Wave B (0.9.0) **after 3e and 3f**.

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

**3g's own constraints:**
- **Files.** Touch only `src/view/sync/**`, `src/view/camera/**`, `src/view/instancing/**`, `src/view/audio/**`, `test/sync*`, `test/camera*`, `test/audio*` and new helpers under `test/helpers/` (`fakeAudio.mjs`, `fakeWorld.mjs`, `fakeAssets.mjs`, `alloc.mjs`, `syncSetup.mjs`). Instancing tests are named `test/sync-instances*`/`test/sync-crowd*` to stay inside `test/sync*`.
- **Never touch** `src/view/boot.js` (3e owns it; seams are integrator requests), `src/view/render/**`, `src/view/assets/**`, `src/view/materials/**` or `src/sim/**`.
- **Stubs.** 3e creates stub `src/view/sync/index.js` and `src/view/audio/index.js`. 3g replaces both **wholesale**: at the Wave B merge 3g's file wins, and 3e's `test/render-stubs.test.mjs` is deleted (3e's integrator request 3).
- **No WebGL.** Boot sets `view.gfx`, `view.materials`, `view.assets` and `view.sync` to `null` and runs on (3e RF1). Sync is never built then. Audio does not depend on WebGL. Rigs are built by game view halves only when `view.gfx` exists.
- **FOV.** A rig that changes the FOV writes `camera.fov = (camera.userData.lhFov ?? <fov at create>) + <its add>` (3e ruling). It never writes an absolute FOV.
- **Shared clock.** `sync.frame` advances 3f's `compiler.time.value` (`mc.time`, the shared `uLhTime` uniform `{ value }`) by `view.dt` once per frame (3f C3, 3g ruling 4). Games never write it (Integrator request 6).
- **Prerequisites.** Tasks 1–10 need only `phase-3` at 0.8.0. Tasks 11–14 import 3e's `src/view/render/hygiene.js` (`instancedShadows`, `disposeTree`). Task 15 imports 3f's `src/view/assets/animTable.js` and its `test/helpers/glb.mjs` (`makeAnimJson`). Before Task 11, and again before Task 15, run `git -C /home/smiller/projects/four43/lion-hawk-engine-3g merge --no-edit phase-3` once the integrator says 3e (or 3f) has landed on `phase-3` (Integrator request 1). If it has not landed, stop after Task 10 and report.
- **Scratch.** Any scratch files go under `$SCRATCH/3g-work/` (plan writers and executors share one scratch root).

**Test commands** (worktree `WT=/home/smiller/projects/four43/lion-hawk-engine-3g`):
- `UNIT <files>` means:
  `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=300 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3g -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
- `BROWSER <file>` means:
  `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3g -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>`
- `SUITE` means the whole engine suite: `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3g -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/`

---

## Review Focus

The five failure modes most likely to bite, each pinned by a test:

| # | Failure mode | Pinned by |
|---|---|---|
| RF1 | **N-15 composition order.** With a correction landing while an earlier one still shows, `dq ⊗ offset` and `offset ⊗ dq` differ for rotations about different axes, and only one keeps the drawn pose continuous. A wrong order is a visible snap only in multiplayer bumps. | Task 10, "corrections stack…" (mutation: swap the product order); Task 13, "a correction never makes the mesh jump…". |
| RF2 | **Quaternion hemisphere in interpolation.** Rapier may hand `-q` for the same rotation from one step to the next; a plain lerp then swings the long way or through zero. | Task 11, "q and -q are one rotation…" (mutation: drop the dot-product flip). |
| RF3 | **Leaks and stale objects across World changes.** `world.clear()` (Rally restart, Tractor guest farm), id reuse after a clear, or a rebuilt entity object under the same id must drop or replace objects and instanced meshes (S-3). | Task 11, "a new World or a world.serial change…" and "an entity object replaced under the same id…"; Task 12, "past 16 instances the mesh doubles…" (instanced meshes disposed on a new World). |
| RF4 | **iOS audio unlock.** A touch `pointerdown` is not an activation on iOS; a refused `resume()` must keep listening, and an interruption (`interrupted`) while visible must re-arm. Getting this wrong means a silent game on the iPad. | Task 1, "a refused resume keeps listening…" and "an interruption while visible…" (mutations: listen only to pointerdown/keydown; drop the re-arm); Task 3, real Chromium. |
| RF5 | **Per-frame allocation and needless uploads** (R-8, R1 iPad). Records recreated each frame, Object3Ds made per frame, or static instanced props re-uploaded every frame. | Task 11, "frames make no three objects and retain nothing…" (mutation: recreate records every frame); Task 12, "instanced entities that did not move are not re-uploaded" and the instanced allocation test. |

---

## File Structure

| File | New/Modify | Responsibility |
|---|---|---|
| `src/view/audio/index.js` | replace 3e stub | `createAudio`: gesture unlock, hidden suspend, page-show and interruption resume, master → mute → limiter, `load`/`play`, positional gain and pan. |
| `src/view/camera/project.js` | new | `makeProject(camera, canvas)` → `view.project` (`{ x, y, z, onScreen }`), plus `project.ndc`. |
| `src/view/camera/chase.js` | new | `createChaseRig`: `'heading'` style (Tractor: velocity heading, portrait framing, shake, live opts, `blendFrom`) and `'travel'` style (Rally chase plus title orbit, speed FOV over `lhFov`). |
| `src/view/camera/mount.js` | new | `createMountRig`: body-fixed camera (Rally bumper, bonnet), FOV add over `lhFov`. |
| `src/view/camera/orbit.js` | new | `createOrbitRig`: Pig Pens' orbit (live pose and limits, `fit`, `panBy`, `chase`, `release`, `ray`) and `bindGesture` (one-finger orbit or chase drag, pinch/turn/pan, mouse, wheel). |
| `src/view/instancing/instances.js` | new | `createInstances`: one `InstancedMesh`, live count, matrices, colours, `instanceCoverage`, swap copy, dirty-only commit. |
| `src/view/instancing/crowd.js` | new | `createCrowd`: per-part instanced meshes posed by 3f's anim tables, blend, coverage. |
| `src/view/sync/smooth.js` | new | N-15 offsets: `newOffset`, `addFix`, `fade`, `applyOffset`, `active`. |
| `src/view/sync/index.js` | replace 3e stub | `createViewSync`: records, interpolation, object/instanced draw, hooks, coverage, smoothing, World changes, the shared clock. |
| `test/helpers/fakeAudio.mjs` | new | Fake Web Audio context, `fakeFetch`, `audioPage` (happy-dom page plus `createAudio`), `flush`. |
| `test/helpers/fakeWorld.mjs` | new | World stand-in with the surface sync reads. |
| `test/helpers/fakeAssets.mjs` | new | Box-mesh assets and compiler stand-ins (paint, instanced, coverage variant, `time`). |
| `test/helpers/alloc.mjs` | new | `threeIds()` counters and `retained(fn, n, warm)` heap probe. |
| `test/helpers/syncSetup.mjs` | new | Sync on a fake World with fake assets. |
| `test/audio.test.mjs`, `test/audio-lifecycle.test.mjs`, `test/audio-clips.test.mjs`, `test/audio-e2e.test.mjs` | new | Tasks 1–3. |
| `test/camera-project.test.mjs`, `test/camera-chase.test.mjs`, `test/camera-mount.test.mjs`, `test/camera-orbit.test.mjs`, `test/camera-orbit-gesture.test.mjs` | new | Tasks 4–8. |
| `test/sync-instances.test.mjs`, `test/sync-smooth.test.mjs` | new | Tasks 9–10. |
| `test/sync.test.mjs`, `test/sync-hooks.test.mjs`, `test/sync-instanced.test.mjs`, `test/sync-netfix.test.mjs`, `test/sync-parts.test.mjs`, `test/sync-world.test.mjs`, `test/sync-crowd.test.mjs` | new | Tasks 11–15 (`sync-parts`: Task 13b). |
| `docs/plans/2026-10-13-phase-3g-viewsync-notes.md` | new | Outcome, contract issues, integrator requests, field note candidates (Task 16). |

---

## Before Task 1: worktree

- [ ] Once the integrator reports 0.8.0 on `phase-3`: `git -C /home/smiller/projects/four43/lion-hawk-engine worktree add /home/smiller/projects/four43/lion-hawk-engine-3g -b phase-3-viewsync phase-3`, then `cd /home/smiller/projects/four43/lion-hawk-engine-3g && npm ci`.
- [ ] Baseline: `SUITE`, expect PASS. Record the test count in the notes file (Task 16).

---

## Task 1: Audio service: gesture unlock, master bus, mute, page lifecycle

**Files:**
- Create: `test/helpers/fakeAudio.mjs`, `test/audio.test.mjs`, `test/audio-lifecycle.test.mjs`
- Replace: `src/view/audio/index.js` (3e's stub, or create it if 3e has not merged)

**Interfaces:**
- Consumes: nothing engine-side. Browser `AudioContext`/`webkitAudioContext` on `doc.defaultView`, or the injected `AudioContext` option.
- Produces: `createAudio({ doc, flags, AudioContext?, volume = 0.55, limiter = {} })` → `{ ctx, master, unlocked, muted, onUnlock(fn) → off, onGesture(fn) → off, mute(on) → muted, dispose() }`. `ctx` and `master` are `null` until the first gesture. `AudioContext: false` means no Web Audio (tests). Task 2 adds `load`, `play`, `listen` and `distanceGain`.

**Decisions to confirm in review (judgment):**
- The context is created **inside** the first gesture, as Tractor does today. Creating it at boot would start it suspended and log Chrome's autoplay warning.
- It listens, capturing, on `pointerdown`, `pointerup`, `touchend`, `click` and `keydown`, until the context is running, and re-arms after a refused resume or an interruption. The overview names only `pointerdown`/`keydown`/`touchend`, but iOS grants activation on `pointerup`/`touchend`/`click`, not on a touch `pointerdown` (Tractor's `GEST` list). This is Contract issue 5.
- `onGesture(fn)` runs inside every gesture until audio runs, so Tractor's `voice.prime()` (speech must start in a gesture) keeps working.
- `mute` ramps a separate mute gain (time constant 0.02 s), so a game's own writes to `master.gain` are never fought over.

- [ ] **Step 1: Write the helper and the failing tests**

`test/helpers/fakeAudio.mjs`:

```js
// A fake Web Audio for the audio service's unit tests (no sound, no browser). Contexts record their graph (node.out), param
// writes (param.set), resumes and suspends; AudioContext.refuse keeps resume() from running a context (iOS outside a gesture).
// audioPage() is a happy-dom page with createAudio on it and fire(type) for a user gesture.
import { dom } from './dom.mjs';
import { createAudio } from '../../src/view/audio/index.js';
export const flush = () => new Promise(r => setImmediate(r));
export function fakeAudio({ refuse = false } = {}) {
  const made = [];
  const param = value => ({ value, set: [], setTargetAtTime(v, t, tc) { this.value = v; this.set.push([v, t, tc]); return this; } });
  const node = (kind, extra) => Object.assign({ kind, out: [], disconnected: false, connect(n) { this.out.push(n); return n; }, disconnect() { this.out.length = 0; this.disconnected = true; } }, extra);
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = node('destination'); this.onstatechange = null; this.resumes = 0; this.suspends = 0; made.push(this); }
    to(state) { if (this.state === state) return; this.state = state; queueMicrotask(() => this.onstatechange?.()); }
    resume() { this.resumes++; if (!AudioContext.refuse) this.to('running'); return Promise.resolve(); }
    suspend() { this.suspends++; this.to('suspended'); return Promise.resolve(); }
    close() { this.to('closed'); return Promise.resolve(); }
    createGain() { return node('gain', { gain: param(1) }); }
    createDynamicsCompressor() { return node('compressor', { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }); }
    createStereoPanner() { return node('panner', { pan: param(0) }); }
    createBufferSource() {
      return node('source', { buffer: null, loop: false, playbackRate: param(1), onended: null, started: null, stopped: null,
        start(t, o) { this.started = [t, o]; }, stop(t) { if (this.stopped !== null) throw new Error('InvalidStateError'); this.stopped = t; } });
    }
    decodeAudioData(ab) { return ab.byteLength ? Promise.resolve({ duration: ab.byteLength / 1000, length: ab.byteLength }) : Promise.reject(new Error('EncodingError')); }
  }
  AudioContext.refuse = refuse;
  return { AudioContext, made };
}
// fetch over a table of { url: byteLength }; anything else is a 404. f.calls lists the urls asked for.
export function fakeFetch(files) {
  const calls = [];
  const f = async url => { calls.push(url); return url in files ? { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(files[url]) } : { ok: false, status: 404 }; };
  f.calls = calls; return f;
}
export function audioPage({ fake, flags = {}, fetch, opts = {} } = {}) {
  const { window, document } = dom(), fa = fakeAudio(fake);
  const audio = createAudio({ doc: document, flags, AudioContext: fa.AudioContext, fetch, ...opts });
  const fire = (type = 'pointerup') => document.body.dispatchEvent(new window.Event(type, { bubbles: true }));
  const setVisibility = v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new window.Event('visibilitychange')); };
  return { window, document, fa, audio, fire, setVisibility };
}
```

`test/audio.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/view/audio/index.js';
import { dom } from './helpers/dom.mjs';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

test('3g: no context before a gesture; the first pointerup makes one, resumes it and fires onUnlock once (#67)', async () => {
  const s = audioPage(), got = [];
  s.audio.onUnlock(a => got.push(a.ctx.state));
  assert.equal(s.audio.ctx, null); assert.equal(s.audio.master, null); assert.equal(s.audio.unlocked, false);
  s.fire('pointerup'); await flush();
  assert.equal(s.fa.made.length, 1); assert.equal(s.audio.ctx, s.fa.made[0]); assert.equal(s.audio.unlocked, true); assert.deepEqual(got, ['running']);
  s.fire('keydown'); s.fire('click'); await flush();
  assert.equal(s.fa.made.length, 1); assert.equal(s.fa.made[0].resumes, 1); assert.deepEqual(got, ['running']); // not listening once running
});
test('3g: master -> mute gain -> limiter -> destination, with Tractor\'s limiter and the game volume (#67, R-8)', async () => {
  const s = audioPage({ opts: { volume: 0.4 } }); s.fire(); await flush();
  const m = s.audio.master; assert.equal(m.kind, 'gain'); assert.equal(m.gain.value, 0.4);
  const mg = m.out[0]; assert.equal(mg.kind, 'gain'); assert.equal(mg.gain.value, 1);
  const lim = mg.out[0]; assert.equal(lim.kind, 'compressor');
  assert.deepEqual([lim.threshold.value, lim.knee.value, lim.ratio.value, lim.attack.value, lim.release.value], [-14, 24, 4, 0.005, 0.2]);
  assert.equal(lim.out[0], s.fa.made[0].destination);
});
test('3g: ?mute starts muted; mute() ramps the mute gain and never touches the game\'s master (#67)', async () => {
  const s = audioPage({ flags: { mute: true } }); assert.equal(s.audio.muted, true);
  s.fire(); await flush();
  const mg = s.audio.master.out[0]; assert.equal(mg.gain.value, 0);
  assert.equal(s.audio.mute(false), false); assert.equal(mg.gain.value, 1); assert.equal(mg.gain.set.at(-1)[2], 0.02);
  s.audio.mute(true); assert.equal(mg.gain.value, 0); assert.equal(s.audio.master.gain.value, 0.55);
  const t = audioPage(); t.audio.mute(true); t.fire(); await flush(); assert.equal(t.audio.master.out[0].gain.value, 0); // muted before the context exists
});
test('3g: a refused resume keeps listening; onGesture runs inside every gesture until audio runs (#67, iOS)', async () => {
  const s = audioPage({ fake: { refuse: true } }), gest = [], unl = [];
  s.audio.onGesture(() => gest.push(s.audio.ctx?.state ?? null)); s.audio.onUnlock(() => unl.push(1));
  s.fire('pointerdown'); await flush();
  assert.equal(s.audio.unlocked, false); assert.deepEqual(unl, []);
  s.fa.AudioContext.refuse = false; s.fire('touchend'); await flush();
  assert.equal(s.audio.unlocked, true); assert.deepEqual(unl, [1]);
  s.fire('pointerup'); await flush();
  assert.deepEqual(gest, [null, 'suspended']); // the first gesture's callbacks run before the context exists
  assert.equal(s.fa.made[0].resumes, 2);
});
test('3g: no Web Audio: the first gesture warns once and stops listening (#67)', async t => {
  const warns = []; t.mock.method(console, 'warn', (...a) => warns.push(a[0]));
  const { window, document } = dom(), audio = createAudio({ doc: document, AudioContext: false });
  document.body.dispatchEvent(new window.Event('pointerup', { bubbles: true })); document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(warns, ['audio: no Web Audio']); assert.equal(audio.ctx, null); assert.equal(audio.unlocked, false);
});
test('3g: onUnlock after the unlock runs at once; off() drops a pending one; non-functions throw (#67)', async () => {
  const s = audioPage(), got = [];
  const off = s.audio.onUnlock(() => got.push('a')); s.audio.onUnlock(() => got.push('b')); off();
  s.fire(); await flush(); assert.deepEqual(got, ['b']);
  s.audio.onUnlock(() => got.push('c')); assert.deepEqual(got, ['b', 'c']);
  assert.throws(() => s.audio.onUnlock(1), /function required/); assert.throws(() => s.audio.onGesture(), /function required/);
  assert.throws(() => createAudio({ doc: {} }), /doc required/);
});
```

`test/audio-lifecycle.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

test('3g: a hidden tab suspends the running context; coming back resumes it (#67, Tractor D-1)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.setVisibility('hidden'); await flush();
  assert.equal(c.suspends, 1); assert.equal(c.state, 'suspended'); assert.equal(s.audio.unlocked, false);
  s.setVisibility('visible'); await flush();
  assert.equal(c.resumes, 2); assert.equal(c.state, 'running');
});
test('3g: back on the page with a refused resume, the next gesture resumes it; onUnlock does not fire again (#67)', async () => {
  const s = audioPage(), unl = []; s.audio.onUnlock(() => unl.push(1)); s.fire(); await flush(); const c = s.fa.made[0];
  s.setVisibility('hidden'); await flush();
  s.fa.AudioContext.refuse = true; s.setVisibility('visible'); await flush();
  assert.equal(c.state, 'suspended');
  s.fa.AudioContext.refuse = false; s.fire('click'); await flush();
  assert.equal(c.state, 'running'); assert.deepEqual(unl, [1]);
});
test('3g: pageshow (back-forward cache) resumes a stopped context (#67)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.fa.AudioContext.refuse = true; c.to('suspended'); await flush();
  s.fa.AudioContext.refuse = false; s.window.dispatchEvent(new s.window.Event('pageshow')); await flush();
  assert.equal(c.state, 'running'); assert.equal(c.resumes, 2);
});
test('3g: an interruption while visible (iOS "interrupted") re-arms the gesture listeners (#67, Tractor D-1)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  c.to('interrupted'); await flush();
  assert.equal(c.resumes, 1);
  s.fire('touchend'); await flush();
  assert.equal(c.resumes, 2); assert.equal(c.state, 'running');
  s.fire('touchend'); await flush(); assert.equal(c.resumes, 2); // listeners gone again
});
test('3g: dispose removes every listener and closes the context; it is idempotent (#67)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.audio.dispose(); await flush(); assert.equal(c.state, 'closed');
  s.setVisibility('visible'); s.window.dispatchEvent(new s.window.Event('pageshow')); await flush(); assert.equal(c.resumes, 1);
  s.audio.dispose();
  const t = audioPage(); t.audio.dispose(); t.fire(); await flush(); assert.equal(t.fa.made.length, 0);
});
```

- [ ] **Step 2: Run; expect FAIL.** `UNIT test/audio.test.mjs test/audio-lifecycle.test.mjs`. With 3e's stub in place: "no context before a gesture…" fails (`s.fa.made.length` is 0, since the stub never makes a context). Without the stub: `ERR_MODULE_NOT_FOUND` for `src/view/audio/index.js`.

- [ ] **Step 3: Implement**

`src/view/audio/index.js` (replace the whole file):

```js
// Audio service (#67, overview §4.9): one AudioContext per page, made and resumed inside a user gesture (iOS starts audio only
// there), suspended while the tab is hidden and resumed on return; after an interruption (a call, Siri) the next gesture
// resumes it. Games connect their synths to `master`: master -> mute gain -> compressor limiter (Tractor's R-8 settings) ->
// speakers. ctx and master stay null until the first gesture. View-only: sim code never imports this.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']; // iOS activates on pointerup/touchend/click, not a touch pointerdown
const LIMITER = Object.freeze({ threshold: -14, knee: 24, ratio: 4, attack: 0.005, release: 0.2 });

export function createAudio({ doc = globalThis.document, flags = {}, AudioContext: AC, volume = 0.55, limiter = {} } = {}) {
  if (!doc?.addEventListener) throw new Error('createAudio: doc required');
  const win = doc.defaultView ?? globalThis.window;
  AC ??= win?.AudioContext ?? win?.webkitAudioContext; // false: no Web Audio (tests)
  const lim = { ...LIMITER, ...limiter };
  const unlockFns = [], gestureFns = [], warned = new Set();
  let ctx = null, muteGain = null, muted = !!flags.mute, everUnlocked = false, armed = false, disposed = false, failed = false;
  const warn = (key, ...args) => { if (!warned.has(key)) { warned.add(key); console.warn(...args); } };
  const call = fn => { try { fn(audio); } catch (err) { console.error('audio: listener failed', err); } };

  function make() {
    if (ctx || failed) return ctx;
    try {
      if (!AC) throw new Error('no AudioContext');
      const c = new AC(), m = c.createGain(), mg = c.createGain(), comp = c.createDynamicsCompressor();
      m.gain.value = volume; mg.gain.value = muted ? 0 : 1;
      for (const k of Object.keys(LIMITER)) comp[k].value = lim[k];
      m.connect(mg); mg.connect(comp); comp.connect(c.destination);
      ctx = c; muteGain = mg; audio.ctx = c; audio.master = m;
      c.onstatechange = onState;
    } catch (err) {
      failed = true; disarm(); warn('make', 'audio: no Web Audio', err);
    }
    return ctx;
  }
  function settle() { // the context runs: stop listening; the first time, tell the game
    if (disposed || !ctx || ctx.state !== 'running') return;
    disarm();
    if (!everUnlocked) { everUnlocked = true; for (const fn of unlockFns.splice(0)) call(fn); }
  }
  function tryResume() {
    const refused = err => warn('resume', 'audio: resume refused (the next gesture tries again)', err);
    try { Promise.resolve(ctx.resume()).then(settle, refused); } catch (err) { refused(err); }
  }
  function onGesture() {
    if (disposed) return;
    for (const fn of gestureFns.slice()) call(fn); // inside the gesture: speech priming and the like (Tractor's voice.prime)
    if (!make()) return;
    if (ctx.state === 'running') settle(); else tryResume();
  }
  function arm() { if (armed || disposed || failed) return; armed = true; for (const t of GESTURES) doc.addEventListener(t, onGesture, true); }
  function disarm() { if (!armed) return; armed = false; for (const t of GESTURES) doc.removeEventListener(t, onGesture, true); }
  function back() { // visible again or a page show: resume where the browser allows it, and listen for a gesture in case it does not
    if (disposed || !ctx || ctx.state === 'running' || ctx.state === 'closed' || doc.visibilityState === 'hidden') return;
    arm(); tryResume();
  }
  function onVisibility() {
    if (disposed || !ctx) return;
    if (doc.visibilityState !== 'hidden') { back(); return; }
    if (ctx.state !== 'running') return;
    const failedSuspend = err => warn('suspend', 'audio: suspend failed', err);
    try { Promise.resolve(ctx.suspend()).catch(failedSuspend); } catch (err) { failedSuspend(err); }
  }
  function onState() { // an interruption while visible (iOS 'interrupted', a call): the next gesture resumes
    if (disposed || !ctx) return;
    if (ctx.state === 'running') settle();
    else if (ctx.state !== 'closed' && doc.visibilityState !== 'hidden') arm();
  }
  function mute(on) {
    muted = !!on;
    if (muteGain) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; disarm();
    doc.removeEventListener('visibilitychange', onVisibility); win?.removeEventListener?.('pageshow', back);
    unlockFns.length = 0; gestureFns.length = 0;
    if (ctx) {
      ctx.onstatechange = null;
      const failedClose = err => warn('close', 'audio: close failed', err);
      try { Promise.resolve(ctx.close()).catch(failedClose); } catch (err) { failedClose(err); }
    }
  }
  const remover = (list, fn) => () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  const audio = {
    ctx: null, master: null,
    get unlocked() { return !!ctx && ctx.state === 'running'; },
    get muted() { return muted; },
    onUnlock(fn) {
      if (typeof fn !== 'function') throw new Error('audio.onUnlock: function required');
      if (everUnlocked) { call(fn); return () => {}; }
      unlockFns.push(fn); return remover(unlockFns, fn);
    },
    onGesture(fn) { if (typeof fn !== 'function') throw new Error('audio.onGesture: function required'); gestureFns.push(fn); return remover(gestureFns, fn); },
    mute, dispose,
  };
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener?.('pageshow', back);
  arm();
  return audio;
}
```

- [ ] **Step 4: Run; expect PASS** (11 tests). `UNIT test/audio.test.mjs test/audio-lifecycle.test.mjs`

- [ ] **Step 5: Prove the iOS tests bite.**
  - Change `GESTURES` to `['pointerdown', 'keydown']`: expect every test that fires `pointerup`/`touchend`/`click` to fail. Restore.
  - In `onState`, change `else if (ctx.state !== 'closed' && doc.visibilityState !== 'hidden') arm();` to `else if (false) arm();`: expect "an interruption while visible…" to fail (`resumes` stays 1). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/audio/index.js test/helpers/fakeAudio.mjs test/audio.test.mjs test/audio-lifecycle.test.mjs && git commit -m "feat(audio): audio service with gesture unlock, hidden suspend, resume and a limited master bus (#67)"`

---

## Task 2: Audio service: clip load and decode, play, positional option

**Files:**
- Create: `test/audio-clips.test.mjs`
- Modify: `src/view/audio/index.js` (full content below)

**Interfaces:**
- Consumes: Task 1's `createAudio`, `test/helpers/fakeAudio.mjs`.
- Produces:
  - `createAudio({ ..., fetch?, positional = { ref: 18, near: 10, min: 0.05, max: 0.6, pan: 0 } })`;
  - `audio.load(url) → Promise<AudioBuffer>`: fetched at once, decoded once a context exists, cached per url; a failure rejects with `audio: load '<url>' failed (<status>)` or `audio: decode '<url>' failed: <reason>` (long urls shortened), and the url can be tried again;
  - `audio.play(buffer, { gain = 1, rate = 1, pan = 0, at, when = 0, loop = false, offset = 0 }) → { source, gain, stop(t) } | null` (null until audio runs);
  - `audio.listen(object3D)` sets the listener; `audio.distanceGain(x, y, z)` gives Pig Pens' planar volume, `clamp(ref / (d + near), min, max)`, or `max` with no listener. With `positional.pan`, `at` also pans by the listener's right axis.

- [ ] **Step 1: Write the failing test**

`test/audio-clips.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAudio } from '../src/view/audio/index.js';
import { dom } from './helpers/dom.mjs';
import { audioPage, fakeFetch, flush } from './helpers/fakeAudio.mjs';

test('3g: load fetches at once, decodes once a context exists, and caches by url (#67, Tractor B-8)', async () => {
  const f = fakeFetch({ 'moo.mp3': 300 }), s = audioPage({ fetch: f });
  const p = s.audio.load('moo.mp3'); assert.deepEqual(f.calls, ['moo.mp3']);
  assert.equal(s.audio.load('moo.mp3'), p);
  let done = false; p.then(() => { done = true; });
  await flush(); assert.equal(done, false); // no context yet
  s.fire(); const buf = await p; assert.equal(buf.duration, 0.3); assert.deepEqual(f.calls, ['moo.mp3']);
});
test('3g: a missing file and a bad decode reject with the url; a failed load can be tried again (#67)', async () => {
  const f = fakeFetch({ 'empty.mp3': 0 }), s = audioPage({ fetch: f }); s.fire(); await flush();
  await assert.rejects(s.audio.load('gone.mp3'), /^Error: audio: load 'gone\.mp3' failed \(404\)$/);
  await assert.rejects(s.audio.load('empty.mp3'), /^Error: audio: decode 'empty\.mp3' failed: EncodingError$/);
  await assert.rejects(s.audio.load('gone.mp3'), /404/); assert.deepEqual(f.calls, ['gone.mp3', 'empty.mp3', 'gone.mp3']);
  await assert.rejects(s.audio.load(`data:audio/mp3;base64,${'A'.repeat(200)}`), err => err.message.length < 100 && err.message.includes('...'));
});
test('3g: play is null until audio runs; then source -> gain -> master with rate, loop, when and offset; ended disconnects (#67)', async () => {
  const s = audioPage(), buf = { duration: 1 };
  assert.equal(s.audio.play(buf), null);
  s.fire(); await flush(); s.fa.made[0].currentTime = 2;
  const h = s.audio.play(buf, { gain: 0.5, rate: 1.5, loop: true, when: 0.25, offset: 0.1 }), src = h.source;
  assert.equal(src.buffer, buf); assert.equal(src.loop, true); assert.equal(src.playbackRate.value, 1.5);
  assert.equal(src.out[0], h.gain); assert.equal(h.gain.gain.value, 0.5); assert.equal(h.gain.out[0], s.audio.master);
  assert.deepEqual(src.started, [2.25, 0.1]);
  h.stop(); h.stop(); assert.equal(src.stopped, 2); // a second stop is harmless
  src.onended(); assert.equal(src.disconnected, true); assert.equal(h.gain.disconnected, true);
  assert.equal(s.audio.play(null), null);
});
test('3g: pan adds a stereo panner, clamped to -1..1 (#67)', async () => {
  const s = audioPage(); s.fire(); await flush();
  const h = s.audio.play({}, { pan: 3 }), pn = h.gain.out[0];
  assert.equal(pn.kind, 'panner'); assert.equal(pn.pan.value, 1); assert.equal(pn.out[0], s.audio.master);
  h.source.onended(); assert.equal(pn.disconnected, true);
});
test('3g: positional: Pig Pens\' distance volume from the listener (planar); optional pan from the listener\'s right (#67)', async () => {
  const s = audioPage({ opts: { positional: { pan: 1 } } }); s.fire(); await flush();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 30, 0); cam.updateMatrixWorld();
  assert.equal(s.audio.distanceGain(80, 0, 0), 0.6); // no listener: the cap
  s.audio.listen(cam);
  assert.equal(s.audio.distanceGain(8, 99, 0), 0.6); // 18 / 18 capped at 0.6; y is ignored
  assert.equal(s.audio.distanceGain(80, 0, 0), 0.2);
  assert.equal(s.audio.distanceGain(0, 0, 1000), 0.05);
  const h = s.audio.play({}, { at: [80, 0, 0], gain: 0.5 }); assert.ok(Math.abs(h.gain.gain.value - 0.1) < 1e-12);
  assert.equal(h.gain.out[0].pan.value, 1); // +x is the default camera's right
  assert.equal(s.audio.play({}, { at: { x: -10, y: 0, z: 0 } }).gain.out[0].pan.value, -1);
  const d = audioPage(); d.fire(); await flush(); d.audio.listen(cam);
  assert.equal(d.audio.play({}, { at: [10, 0, 0] }).gain.out[0], d.audio.master); // no pan unless positional.pan is set
});
test('3g: no Web Audio: load rejects with the reason and play returns null (#67)', async t => {
  t.mock.method(console, 'warn', () => {});
  const { window, document } = dom(), audio = createAudio({ doc: document, AudioContext: false, fetch: fakeFetch({ 'a.mp3': 8 }) });
  document.body.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  await assert.rejects(audio.load('a.mp3'), /^Error: audio: no Web Audio \(no AudioContext\)$/);
  assert.equal(audio.play({}), null);
});
```

- [ ] **Step 2: Run; expect FAIL** with `TypeError: s.audio.load is not a function` (and `play`, `listen`, `distanceGain`). `UNIT test/audio-clips.test.mjs`

- [ ] **Step 3: Implement**

`src/view/audio/index.js` (replace the whole file):

```js
// Audio service (#67, overview §4.9): one AudioContext per page, made and resumed inside a user gesture (iOS starts audio only
// there), suspended while the tab is hidden and resumed on return; after an interruption (a call, Siri) the next gesture
// resumes it. Games connect their synths to `master`: master -> mute gain -> compressor limiter (Tractor's R-8 settings) ->
// speakers. load(url) fetches at once and decodes once a context exists (Tractor's B-8: never mid-drive); play(buffer, opts)
// plays a decoded buffer, optionally placed in the world (`at`, against the object given to listen(): Pig Pens' distance
// volume). ctx and master stay null until the first gesture. View-only: sim code never imports this.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']; // iOS activates on pointerup/touchend/click, not a touch pointerdown
const LIMITER = Object.freeze({ threshold: -14, knee: 24, ratio: 4, attack: 0.005, release: 0.2 });
const POSITIONAL = Object.freeze({ ref: 18, near: 10, min: 0.05, max: 0.6, pan: 0 });
const short = url => { const s = String(url); return s.length > 48 ? `${s.slice(0, 45)}...` : s; };

export function createAudio({ doc = globalThis.document, flags = {}, AudioContext: AC, fetch: fetchFn, volume = 0.55, limiter = {}, positional = {} } = {}) {
  if (!doc?.addEventListener) throw new Error('createAudio: doc required');
  const win = doc.defaultView ?? globalThis.window;
  AC ??= win?.AudioContext ?? win?.webkitAudioContext; // false: no Web Audio (tests)
  fetchFn ??= win?.fetch ? win.fetch.bind(win) : globalThis.fetch?.bind(globalThis);
  const lim = { ...LIMITER, ...limiter }, pos = { ...POSITIONAL, ...positional };
  const unlockFns = [], gestureFns = [], clips = new Map(), warned = new Set();
  let ctx = null, muteGain = null, muted = !!flags.mute, everUnlocked = false, armed = false, disposed = false, failed = false, listener = null;
  let readyOk, readyFail;
  const ready = new Promise((ok, fail) => { readyOk = ok; readyFail = fail; });
  ready.catch(() => {}); // with no Web Audio only load() reports it
  const warn = (key, ...args) => { if (!warned.has(key)) { warned.add(key); console.warn(...args); } };
  const call = fn => { try { fn(audio); } catch (err) { console.error('audio: listener failed', err); } };

  function make() {
    if (ctx || failed) return ctx;
    try {
      if (!AC) throw new Error('no AudioContext');
      const c = new AC(), m = c.createGain(), mg = c.createGain(), comp = c.createDynamicsCompressor();
      m.gain.value = volume; mg.gain.value = muted ? 0 : 1;
      for (const k of Object.keys(LIMITER)) comp[k].value = lim[k];
      m.connect(mg); mg.connect(comp); comp.connect(c.destination);
      ctx = c; muteGain = mg; audio.ctx = c; audio.master = m;
      c.onstatechange = onState;
      readyOk(c);
    } catch (err) {
      failed = true; disarm(); warn('make', 'audio: no Web Audio', err);
      readyFail(new Error(`audio: no Web Audio (${err?.message ?? err})`));
    }
    return ctx;
  }
  function settle() { // the context runs: stop listening; the first time, tell the game
    if (disposed || !ctx || ctx.state !== 'running') return;
    disarm();
    if (!everUnlocked) { everUnlocked = true; for (const fn of unlockFns.splice(0)) call(fn); }
  }
  function tryResume() {
    const refused = err => warn('resume', 'audio: resume refused (the next gesture tries again)', err);
    try { Promise.resolve(ctx.resume()).then(settle, refused); } catch (err) { refused(err); }
  }
  function onGesture() {
    if (disposed) return;
    for (const fn of gestureFns.slice()) call(fn); // inside the gesture: speech priming and the like (Tractor's voice.prime)
    if (!make()) return;
    if (ctx.state === 'running') settle(); else tryResume();
  }
  function arm() { if (armed || disposed || failed) return; armed = true; for (const t of GESTURES) doc.addEventListener(t, onGesture, true); }
  function disarm() { if (!armed) return; armed = false; for (const t of GESTURES) doc.removeEventListener(t, onGesture, true); }
  function back() { // visible again or a page show: resume where the browser allows it, and listen for a gesture in case it does not
    if (disposed || !ctx || ctx.state === 'running' || ctx.state === 'closed' || doc.visibilityState === 'hidden') return;
    arm(); tryResume();
  }
  function onVisibility() {
    if (disposed || !ctx) return;
    if (doc.visibilityState !== 'hidden') { back(); return; }
    if (ctx.state !== 'running') return;
    const failedSuspend = err => warn('suspend', 'audio: suspend failed', err);
    try { Promise.resolve(ctx.suspend()).catch(failedSuspend); } catch (err) { failedSuspend(err); }
  }
  function onState() { // an interruption while visible (iOS 'interrupted', a call): the next gesture resumes
    if (disposed || !ctx) return;
    if (ctx.state === 'running') settle();
    else if (ctx.state !== 'closed' && doc.visibilityState !== 'hidden') arm();
  }
  function distanceGain(x, y, z) { // planar distance to the listener; y is ignored (ground games)
    if (!listener) return pos.max;
    const lp = listener.position, d = Math.hypot(x - lp.x, z - lp.z);
    return Math.max(pos.min, Math.min(pos.max, pos.ref / (d + pos.near)));
  }
  function panOf(x, z) { // -1 left .. 1 right of the listener (its world x axis)
    const lp = listener.position, e = listener.matrixWorld.elements, dx = x - lp.x, dz = z - lp.z, d = Math.hypot(dx, dz);
    return d < 1e-6 ? 0 : (dx * e[0] + dz * e[2]) / d;
  }
  function play(buffer, { gain = 1, rate = 1, pan = 0, at = null, when = 0, loop = false, offset = 0 } = {}) {
    if (!buffer || !ctx || ctx.state !== 'running') return null;
    let g = gain, p = pan;
    if (at) {
      const x = Array.isArray(at) ? at[0] : at.x, z = Array.isArray(at) ? at[2] : at.z;
      g *= distanceGain(x, 0, z);
      if (pos.pan && listener) p += panOf(x, z) * pos.pan;
    }
    const src = ctx.createBufferSource(), gn = ctx.createGain();
    src.buffer = buffer; src.loop = loop; src.playbackRate.value = rate; gn.gain.value = g;
    src.connect(gn);
    let pn = null;
    if (p !== 0 && ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, p)); gn.connect(pn); pn.connect(audio.master); }
    else gn.connect(audio.master);
    src.onended = () => { src.disconnect(); gn.disconnect(); pn?.disconnect(); };
    src.start(ctx.currentTime + when, offset);
    return { source: src, gain: gn, stop(t = 0) { try { src.stop(ctx.currentTime + t); } catch { /* stopping a stopped source throws; nothing to do */ } } };
  }
  function load(url) {
    const have = clips.get(url); if (have) return have;
    let bytes;
    try {
      if (typeof fetchFn !== 'function') throw new Error('audio: no fetch in this page');
      bytes = Promise.resolve(fetchFn(url)).then(r => { if (!r.ok) throw new Error(`audio: load '${short(url)}' failed (${r.status})`); return r.arrayBuffer(); });
    } catch (err) { bytes = Promise.reject(err); }
    const p = Promise.all([bytes, ready])
      .then(([ab, c]) => Promise.resolve(c.decodeAudioData(ab)).catch(err => { throw new Error(`audio: decode '${short(url)}' failed: ${err?.message ?? err}`); }))
      .catch(err => { if (clips.get(url) === p) clips.delete(url); throw err; }); // a failed load may be tried again
    clips.set(url, p); return p;
  }
  function mute(on) {
    muted = !!on;
    if (muteGain) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; disarm();
    doc.removeEventListener('visibilitychange', onVisibility); win?.removeEventListener?.('pageshow', back);
    unlockFns.length = 0; gestureFns.length = 0; listener = null;
    if (ctx) {
      ctx.onstatechange = null;
      const failedClose = err => warn('close', 'audio: close failed', err);
      try { Promise.resolve(ctx.close()).catch(failedClose); } catch (err) { failedClose(err); }
    }
  }
  const remover = (list, fn) => () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  const audio = {
    ctx: null, master: null,
    get unlocked() { return !!ctx && ctx.state === 'running'; },
    get muted() { return muted; },
    onUnlock(fn) {
      if (typeof fn !== 'function') throw new Error('audio.onUnlock: function required');
      if (everUnlocked) { call(fn); return () => {}; }
      unlockFns.push(fn); return remover(unlockFns, fn);
    },
    onGesture(fn) { if (typeof fn !== 'function') throw new Error('audio.onGesture: function required'); gestureFns.push(fn); return remover(gestureFns, fn); },
    load, play, mute, distanceGain, dispose,
    listen(obj) { listener = obj ?? null; },
  };
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener?.('pageshow', back);
  arm();
  return audio;
}
```

- [ ] **Step 4: Run; expect PASS.** `UNIT test/audio.test.mjs test/audio-lifecycle.test.mjs test/audio-clips.test.mjs` (17 tests).

- [ ] **Step 5: Prove the retry test bites.** Delete `if (clips.get(url) === p) clips.delete(url);`: expect "a missing file and a bad decode…" to fail (`f.calls` has two entries, not three). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/audio/index.js test/audio-clips.test.mjs && git commit -m "feat(audio): clip load and decode after unlock, play with gain, rate and pan, positional volume (#67)"`

---

## Task 3: Audio in real Chromium

**Files:**
- Create: `test/audio-e2e.test.mjs`

**Interfaces:**
- Consumes: Task 2's `createAudio`; `lion-hawk/playwright` `launch()`; esbuild.
- Produces: none (test only).

- [ ] **Step 1: Write the test**

`test/audio-e2e.test.mjs`:

```js
// Real Chromium: the audio service against real Web Audio (#67). A click makes and runs the context; a WAV data URL is fetched,
// decoded and played through the limiter; a hidden tab suspends it and coming back resumes it; ?mute starts muted.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, base, chrome, skip = false;
const ENTRY = `import { createAudio } from './src/view/audio/index.js';
const unlocks = [];
const audio = createAudio({ doc: document, flags: { mute: new URLSearchParams(location.search).has('mute') } });
audio.onUnlock(a => unlocks.push(a.ctx.state));
window.__audio = { audio, unlocks };`;
// 0.1 s of a 16-bit mono sine at 8 kHz
function wav() {
  const rate = 8000, n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 4) * 8000), 44 + i * 2);
  return `data:audio/wav;base64,${b.toString('base64')}`;
}

before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  const out = await build({ stdin: { contents: ENTRY, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' });
  const js = out.outputFiles[0].text, html = '<!doctype html><meta charset="utf-8"><body><button id="b">go</button><script src="/audio.js"></script></body>';
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(html);
    else if (p === '/audio.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(js);
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('3g e2e: a click unlocks real Web Audio once; a WAV decodes and plays; hidden suspends, visible resumes (#67)', async t => {
  if (skip) return t.skip(skip);
  const page = await chrome.browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    assert.equal(await page.evaluate(() => window.__audio.audio.ctx), null);
    await page.click('#b');
    await page.waitForFunction(() => window.__audio.audio.unlocked, null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.unlocks), ['running']);
    const got = await page.evaluate(async url => {
      const a = window.__audio.audio, buf = await a.load(url), h = a.play(buf, { gain: 0.5, pan: 0.3 });
      return { dur: buf.duration, same: a.master.context === a.ctx, stop: typeof h.stop };
    }, wav());
    assert.ok(Math.abs(got.dur - 0.1) < 0.01, `duration ${got.dur}`); assert.equal(got.same, true); assert.equal(got.stop, 'function');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__audio.audio.ctx.state === 'suspended', null, { timeout: 5000 });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__audio.audio.ctx.state === 'running', null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.unlocks), ['running']); // once
    await page.goto(`${base}?mute`); assert.equal(await page.evaluate(() => window.__audio.audio.muted), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
```

- [ ] **Step 2: Run; expect PASS.** `BROWSER test/audio-e2e.test.mjs` (1 test). The implementation exists, so this step checks the real Web Audio API surface: the promise forms of `resume`, `suspend` and `decodeAudioData`, the compressor params, `createStereoPanner`, and `fetch` of a data URL. If it fails, the failure is a real API mismatch: fix `src/view/audio/index.js`, rerun Tasks 1–2, and record it in the notes.

- [ ] **Step 3: Prove it can fail.** In `createAudio`, change `comp[k].value = lim[k]` to `comp[k + 'x'].value = lim[k]`: expect the test to time out waiting for `unlocked` (`make` fails and warns). Restore; PASS.

- [ ] **Step 4: Commit.** `git add test/audio-e2e.test.mjs && git commit -m "test(audio): real Chromium unlock, decode, play, suspend and resume (#67)"`

---

## Task 4: `makeProject`

**Files:**
- Create: `src/view/camera/project.js`, `test/camera-project.test.mjs`

**Interfaces:**
- Consumes: a three camera (`isCamera`) and a canvas-like `{ getBoundingClientRect() }`.
- Produces: `makeProject(camera, canvas)` → `project([x, y, z], out?) → { x, y, z, onScreen }` (S-1, #73). `x`/`y` are client px, `z` is NDC depth, and `onScreen` is false behind the camera or outside the viewport. It also has `project.ndc(x, y, z, out?) → { nx, ny, nz, behind }` (Tractor's `toNdc` for M-77).

- [ ] **Step 1: Write the failing test**

`test/camera-project.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeProject } from '../src/view/camera/project.js';

const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
const cam = () => { const c = new THREE.PerspectiveCamera(60, 2, 0.1, 100); c.position.set(0, 0, 10); c.lookAt(0, 0, 0); return c; };

test('3g: makeProject maps the view centre to the canvas centre, with the canvas offset and the NDC depth (S-1, #73)', () => {
  const r = makeProject(cam(), canvas)([0, 0, 0]);
  assert.ok(Math.abs(r.x - 110) < 1e-9 && Math.abs(r.y - 70) < 1e-9); assert.equal(r.onScreen, true); assert.ok(r.z > -1 && r.z < 1);
});
test('3g: a point at the right edge is on screen; past it, or behind the camera, is not (#73)', () => {
  const p = makeProject(cam(), canvas), half = Math.tan(Math.PI / 6) * 10 * 2; // half the view's width at the origin's depth
  const edge = p([half * 0.999, 0, 0]); assert.ok(Math.abs(edge.x - (10 + 200 * 1.999 / 2)) < 1e-6); assert.equal(edge.onScreen, true);
  assert.equal(p([half * 1.01, 0, 0]).onScreen, false);
  assert.equal(p([0, 0, 20]).onScreen, false); // projects onto the centre: only the behind test rejects it
});
test('3g: project reads a camera moved since the last render, fills out, and project.ndc gives raw NDC (#73, M-77)', () => {
  const c = cam(), p = makeProject(c, canvas); c.position.set(5, 0, 10); // moved: its matrices are stale
  const out = {}; assert.equal(p([5, 0, 0], out), out); assert.ok(Math.abs(out.x - 110) < 1e-9);
  assert.notEqual(p([5, 0, 0]), p([5, 0, 0])); // fresh objects without out (game.point may keep them)
  const n = p.ndc(5, 0, 0); assert.ok(Math.abs(n.nx) < 1e-9 && Math.abs(n.ny) < 1e-9); assert.equal(n.behind, false);
});
test('3g: makeProject needs a camera and a canvas', () => {
  assert.throws(() => makeProject({}, canvas), /makeProject: camera required/);
  assert.throws(() => makeProject(cam(), {}), /makeProject: canvas required/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` (`src/view/camera/project.js`). `UNIT test/camera-project.test.mjs`

- [ ] **Step 3: Implement**

`src/view/camera/project.js`:

```js
// view.project for a camera on a canvas (S-1, #73; Tractor's rig.project and toNdc): world -> client px with the canvas
// offset added, z the NDC depth, onScreen false behind the camera or outside the viewport. The camera's matrices are refreshed
// first, so a camera moved since the last render projects where it is now. project([x, y, z], out?) fills out (a fresh object
// without one: game.point may keep it); project.ndc(x, y, z, out?) gives the raw NDC { nx, ny, nz, behind } (Tractor's M-77 HUD).
import * as THREE from 'three';

export function makeProject(camera, canvas) {
  if (!camera?.isCamera) throw new Error('makeProject: camera required');
  if (typeof canvas?.getBoundingClientRect !== 'function') throw new Error('makeProject: canvas required');
  const v = new THREE.Vector3(), nd = { nx: 0, ny: 0, nz: 0, behind: false };
  function ndc(x, y, z, out = nd) {
    camera.updateMatrixWorld();
    out.behind = v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z > 0;
    v.set(x, y, z).project(camera); out.nx = v.x; out.ny = v.y; out.nz = v.z;
    return out;
  }
  function project([x, y, z], out = {}) {
    const r = canvas.getBoundingClientRect(), s = ndc(x, y, z);
    out.x = r.left + (s.nx + 1) / 2 * r.width; out.y = r.top + (1 - s.ny) / 2 * r.height; out.z = s.nz;
    out.onScreen = !s.behind && Math.abs(s.nx) <= 1 && Math.abs(s.ny) <= 1;
    return out;
  }
  project.ndc = ndc;
  return project;
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the behind test bites.** Replace `!s.behind && ` with nothing in `project`: expect "a point at the right edge…" to fail on `[0, 0, 20]`. Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/camera/project.js test/camera-project.test.mjs && git commit -m "feat(view): makeProject for view.project with depth and on-screen (S-1, #73)"`

---

## Task 5: Chase rig, heading style (Tractor) and travel style (Rally)

**Files:**
- Create: `src/view/camera/chase.js`, `test/camera-chase.test.mjs`

**Interfaces:**
- Consumes: a three camera; `camera.userData.lhFov` (3e) when present.
- Produces: `createChaseRig(camera, opts)` → `{ opts, yaw, follow(pose, dt), snap(pose), orbit(pose, dt), shake(a), blendFrom(q, time = 1) }`.
  - `opts.style: 'heading'` (default). pose `{ x, y, z, yaw, fwd?, velYaw? }`. Defaults `{ distance: 12, height: 10.2, lag: 3, lookAhead: 11, lookHeight: 0.8, ease: 6, slide: 2, portrait: 1.25, portraitAspect: 0.9, shakeTime: 0.25 }`. This is Tractor's chase cam (`render/camera.js` `CAM` + `LAG`, and `view/rig.js`), exactly (CI-10):
    - **velocity heading:** above `slide` m/s of forward speed (`pose.fwd`) it looks along `pose.velYaw` (the game passes `atan2(v.x, v.z)`), else along `pose.yaw`;
    - **portrait framing:** below `portraitAspect` the camera sits `portrait` times farther back and higher (X-12);
    - **shake:** `shake(a)` jitters the position for `shakeTime` s, fading linearly (a counter hash, not `Math.random`);
    - **live tuning:** `opts` is the caller's object, filled once and read every frame, so one module-level object can serve every farm's rig and `?tune` sliders write `opts.distance`/`height`/`lookAhead` (Tractor's `CAM.D`/`H`/`AHEAD`);
    - **F-10 blend:** `blendFrom(q, time = 1)` turns the camera from rotation `q` (the show camera's last) back to the chase over `time` s with a smoothstep slerp (Tractor's `view/rig.js` `blendFrom`); `snap` cancels it and any shake (a new farm's fresh camera).
  - `opts.style: 'travel'`. pose `{ p, q, v }`. Defaults `{ distance: 6.8, height: 2.4, lag: 3.5, lookAhead: 3, lookHeight: 0.6, ease: 8, lookEase: 12, blendFrom: 3, blendSpan: 20, blendMax: 0.55, fovAdd: 2, fovSpeed: 0.25, fovMax: 10, shakeTime: 0.25, orbit* }`. This is Rally's chase and title orbit; FOV = base + add, the base being `lhFov`. `shake` and `blendFrom` work in this style too.
  - `opts` is the caller's object, filled and kept live.

**Decisions to confirm in review (judgment):**
- Rally's absolute FOVs (55 title, 62 + speed chase) become adds over 3e's base (`-5`, `+2`). With 3e's default base of 60 the numbers are Rally's today. In portrait (base 64) the whole range is 4° wider, which Rally lacks today. This is Contract issue 3.
- The shake uses a counter hash instead of `Math.random` (view code, but deterministic for tests and replays).
- One factory with two styles, not two factories, because §4.9 names one `createChaseRig`.
- CI-10 (3l): everything Tractor's chase camera does lives in the rig, so Tractor deletes `render/camera.js` and the chase half of `view/rig.js`. Only the stand-in heading before the first follow (`rig.yaw ?? tractor.yaw`) stays game-side. A new farm calls `snap(pose)` where Tractor called `follow(1, pose)` on a fresh camera (the same pose).

- [ ] **Step 1: Write the failing test**

`test/camera-chase.test.mjs` (the oracles are verbatim copies of Tractor's `render/camera.js` and Rally's `render.js:152-171` at e03ed71, with only the FOV base made explicit):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChaseRig } from '../src/view/camera/chase.js';

// games/tractor-pickup/src/render/camera.js at e03ed71, with CAM and LAG inlined and the shake left out
function tractorChase(camera) {
  const CAM = { D: 12, H: 10.2, AHEAD: 11, portrait: 1.25 }, LAG = 3, tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  let yaw = null;
  return {
    update(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw;
      if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * LAG);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      tgt.set(s.x + fx * CAM.AHEAD, s.y + 0.8, s.z + fz * CAM.AHEAD);
      const k = camera.aspect < 0.9 ? CAM.portrait : 1;
      pos.set(s.x - fx * CAM.D * k, s.y + CAM.H * k, s.z - fz * CAM.D * k);
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
    },
  };
}

test('3g: createChaseRig matches Tractor Pickup\'s chase cam frame by frame, landscape and portrait (port of V-1..V-3)', () => {
  for (const aspect of [1.6, 0.6]) {
    const a = new THREE.PerspectiveCamera(60, aspect), b = new THREE.PerspectiveCamera(60, aspect);
    const rig = createChaseRig(a, { distance: 12, height: 10.2, lag: 3, lookAhead: 11 }), ref = tractorChase(b);
    const s = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, velYaw: 0 };
    for (let i = 0; i < 240; i++) {
      s.x += Math.sin(s.yaw) * 0.2; s.z += Math.cos(s.yaw) * 0.2; s.yaw += 0.02; s.fwd = i < 120 ? 1 : 6; s.velYaw = s.yaw + 0.4; s.y = Math.sin(i / 30);
      const dt = i % 3 ? 1 / 60 : 1 / 30;
      rig.follow(s, dt); ref.update(dt, s);
      assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
      assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    }
    assert.ok(Math.abs(rig.yaw - (s.yaw + 0.4)) < 0.3); // in a slide it follows velYaw
  }
});
test('3g: snap puts the camera straight behind, looking ahead; portrait backs it off (V-2, X-12)', () => {
  const c = new THREE.PerspectiveCamera(60, 1.5), rig = createChaseRig(c);
  assert.equal(rig.yaw, null);
  rig.snap({ x: 1, y: 2, z: 3, yaw: Math.PI / 2 }); // forward is +x
  assert.ok(c.position.distanceTo(new THREE.Vector3(1 - 12, 2 + 10.2, 3)) < 1e-9);
  const dir = c.getWorldDirection(new THREE.Vector3()), want = new THREE.Vector3(1 + 11, 2 + 0.8, 3).sub(c.position).normalize();
  assert.ok(dir.distanceTo(want) < 1e-9); assert.equal(rig.yaw, Math.PI / 2);
  const p = new THREE.PerspectiveCamera(60, 0.6); createChaseRig(p).snap({ x: 0, y: 0, z: 0, yaw: 0 });
  assert.ok(p.position.distanceTo(new THREE.Vector3(0, 10.2 * 1.25, -12 * 1.25)) < 1e-9);
});
test('3g: opts are the live object (?tune); shake jitters for 0.25 s, deterministically, then settles (V-3)', () => {
  const c = new THREE.PerspectiveCamera(60, 1.5), o = { distance: 12 }, rig = createChaseRig(c, o);
  assert.equal(rig.opts, o); assert.equal(o.height, 10.2);
  o.distance = 20; rig.snap({ x: 0, y: 0, z: 0, yaw: 0 }); assert.ok(Math.abs(c.position.z + 20) < 1e-9);
  const run = () => {
    const cc = new THREE.PerspectiveCamera(60, 1.5), r = createChaseRig(cc), pose = { x: 0, y: 0, z: 0, yaw: 0 }, xs = [];
    r.snap(pose); r.shake(0.5);
    for (let i = 0; i < 60; i++) { r.follow(pose, 1 / 60); xs.push(cc.position.x); }
    return xs;
  };
  const xs = run(), peak = Math.max(...xs.slice(0, 15).map(Math.abs));
  assert.ok(peak > 0.001 && peak < 0.25, `peak ${peak}`); assert.deepEqual(run(), xs); // no Math.random
  assert.ok(Math.abs(xs.at(-1)) < 0.01);
  assert.throws(() => createChaseRig({}), /camera required/);
});
test('3g: one opts object serves every rig (a new farm keeps ?tune values); portraitAspect and shakeTime are live (CI-10)', () => {
  const CAM = {}, pose = { x: 0, y: 0, z: 0, yaw: 0 };
  createChaseRig(new THREE.PerspectiveCamera(60, 1), CAM);
  assert.equal(CAM.portraitAspect, 0.9); assert.equal(CAM.shakeTime, 0.25); assert.equal(CAM.style, 'heading');
  CAM.distance = 15; const c = new THREE.PerspectiveCamera(60, 1), rig = createChaseRig(c, CAM); // the next farm's rig
  assert.equal(rig.opts.distance, 15); rig.snap(pose); assert.ok(Math.abs(c.position.z + 15) < 1e-9); // aspect 1: landscape
  CAM.portraitAspect = 1.2; rig.snap(pose); // aspect 1 is portrait now
  assert.ok(c.position.distanceTo(new THREE.Vector3(0, 10.2 * 1.25, -15 * 1.25)) < 1e-9);
  // ease 1e6 puts the camera on its target each frame, so the shaken-minus-plain distance is the jitter itself
  const o = { ease: 1e6, shakeTime: 0.5 }, ca = new THREE.PerspectiveCamera(60, 1.5), cb = new THREE.PerspectiveCamera(60, 1.5);
  const ra = createChaseRig(ca, o), rb = createChaseRig(cb, { ...o });
  ra.snap(pose); rb.snap(pose); ra.shake(0.4);
  for (let i = 0; i < 40; i++) {
    ra.follow(pose, 0.02); rb.follow(pose, 0.02); const off = ca.position.distanceTo(cb.position);
    if (i < 20) assert.ok(off > 1e-6, `still shaking at ${(i + 1) * 0.02} s`); else if (i >= 27) assert.ok(off < 1e-9, `settled at ${(i + 1) * 0.02} s`);
  }
  ra.shake(0.4); ra.snap(pose); rb.snap(pose); ra.follow(pose, 0.02); rb.follow(pose, 0.02);
  assert.ok(ca.position.distanceTo(cb.position) < 1e-9); // snap cancels a shake
});
test('3g: blendFrom turns from the show camera back to the chase over time s, smoothstep; snap cancels it (Tractor F-10, view/rig.js)', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6), rig = createChaseRig(a), ref = tractorChase(b);
  const showQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 2, 0)), chaseQ = new THREE.Quaternion();
  const s = { x: 0, y: 0, z: 0, yaw: 0.5, fwd: 0, velYaw: 0.5 };
  let blend = 1; // games/tractor-pickup/src/view/rig.js at e03ed71: follow() after the chase cam's update
  for (let i = 0; i < 90; i++) {
    if (i === 10) { rig.blendFrom(showQ); blend = 0; }
    s.x += 0.1; rig.follow(s, 1 / 60); ref.update(1 / 60, s);
    if (blend < 1) { blend = Math.min(1, blend + 1 / 60); const k = blend * blend * (3 - 2 * blend); chaseQ.copy(b.quaternion); b.quaternion.slerpQuaternions(showQ, chaseQ, k); }
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    if (i === 10) assert.ok(1 - Math.abs(a.quaternion.dot(showQ)) < 1e-4, 'starts at the show camera');
  }
  rig.blendFrom(showQ, 0.5); rig.snap(s);
  const c = new THREE.PerspectiveCamera(60, 1.6); createChaseRig(c).snap(s);
  assert.ok(1 - Math.abs(a.quaternion.dot(c.quaternion)) < 1e-12); // no blend after a snap
});

// games/rally/src/render.js:152-171 at e03ed71 (title orbit and chase), with its absolute FOVs 55 and 62 written as 3e's base 60
// plus -5 and +2
function rallyCam(cam) {
  const r = { cam, camPos: new THREE.Vector3(0, 4, -8), camLook: new THREE.Vector3(), chaseDir: null, orbitA: undefined, orbit: false };
  r.update = (body, dt) => {
    const p = body.p, q = body.q, v = body.v;
    const cp = new THREE.Vector3(p.x, p.y, p.z), bq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq); fwd.y = 0; fwd.normalize();
    const vel = new THREE.Vector3(v.x, 0, v.z);
    if (r.orbit) {
      r.orbitA = (r.orbitA ?? Math.atan2(-fwd.x, -fwd.z) + 0.6) + dt * 0.12;
      r.camPos.set(p.x + 9 * Math.sin(r.orbitA), p.y + 3.2, p.z + 9 * Math.cos(r.orbitA));
      r.camLook.set(p.x, p.y + 0.4, p.z);
      cam.position.copy(r.camPos); cam.lookAt(r.camLook);
      cam.fov = 60 - 5; cam.updateProjectionMatrix();
      r.chaseDir = null;
    } else {
      const sp = vel.length(), dir = fwd.clone();
      if (sp > 3) dir.lerp(vel.normalize(), Math.min(0.55, (sp - 3) / 20)).normalize();
      if (!r.chaseDir) r.chaseDir = dir.clone();
      r.chaseDir.lerp(dir, 1 - Math.exp(-dt * 3.5)).normalize();
      const want = cp.clone().addScaledVector(r.chaseDir, -6.8).add(new THREE.Vector3(0, 2.4, 0));
      r.camPos.lerp(want, 1 - Math.exp(-dt * 8));
      const look = cp.clone().addScaledVector(r.chaseDir, 3).add(new THREE.Vector3(0, 0.6, 0));
      r.camLook.lerp(look, 1 - Math.exp(-dt * 12));
      cam.position.copy(r.camPos); cam.lookAt(r.camLook);
      cam.fov = 60 + 2 + Math.min(10, sp * 0.25); cam.updateProjectionMatrix();
    }
  };
  return r;
}

test('3g: style "travel" matches Rally\'s title orbit and chase frame by frame, FOV added to 3e\'s base (port of render.js:152-187)', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6);
  a.position.set(0, 4, -8); a.userData.lhFov = 60;
  const rig = createChaseRig(a, { style: 'travel' }), ref = rallyCam(b);
  const body = { p: { x: 0, y: 0.5, z: 0 }, q: new THREE.Quaternion(), v: { x: 0, y: 0, z: 0 } };
  let yawB = 0.3;
  for (let i = 0; i < 300; i++) {
    const dt = i % 4 ? 1 / 60 : 1 / 45, title = i < 60;
    if (!title) { const sp = Math.min(40, (i - 60) * 0.3); yawB += 0.01; body.v.x = Math.sin(yawB + 0.4) * sp; body.v.z = Math.cos(yawB + 0.4) * sp; body.p.x += body.v.x * dt; body.p.z += body.v.z * dt; }
    body.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawB);
    ref.orbit = title; ref.update(body, dt);
    if (title) rig.orbit(body, dt); else rig.follow(body, dt);
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
    assert.ok(Math.abs(a.fov - b.fov) < 1e-12, `fov at frame ${i}`);
  }
  assert.ok(a.fov > 70); // fast: base 60 + 2 + up to 10
  a.userData.lhFov = 64; rig.follow(body, 1 / 60); assert.ok(Math.abs(a.fov - 76) < 1e-9); // a portrait base moves the whole range
  rig.snap(body); const look = new THREE.Vector3(); a.getWorldDirection(look);
  assert.ok(Math.abs(a.position.y - (0.5 + 2.4)) < 1e-9);
  assert.throws(() => createChaseRig(new THREE.PerspectiveCamera()).orbit(body, 0.1), /needs style 'travel'/);
  assert.throws(() => createChaseRig(new THREE.PerspectiveCamera(), { style: 'drone' }), /style 'drone'/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` (`src/view/camera/chase.js`). `UNIT test/camera-chase.test.mjs`

- [ ] **Step 3: Implement**

`src/view/camera/chase.js`:

```js
// Chase camera, two styles.
// - 'heading' (default; Tractor Pickup's render/camera.js, V-1..V-3): `distance` behind and `height` above the target, turning
//   with `lag`, looking at a point `lookAhead` in front and `lookHeight` up; the position eases in at `ease` per second. In a
//   slide (pose.fwd > `slide` m/s) it looks along the travel (pose.velYaw), otherwise along the nose (pose.yaw). Portrait
//   (aspect < `portraitAspect`) moves it `portrait` times back and up (X-12). pose = { x, y, z, yaw, fwd?, velYaw? }.
// - 'travel' (Rally's render.js:152-187): the look direction is the body's heading blended toward its velocity above `blendFrom`
//   m/s (up to `blendMax`), smoothed exponentially (`lag` per second); the position eases at `ease`, the look point at `lookEase`.
//   The field of view widens with speed: base + fovAdd + min(fovMax, speed x fovSpeed), the base being camera.userData.lhFov
//   (3e's portrait FOV rule) or the camera's fov at create. orbit(pose, dt) is Rally's title shot (a slow turntable round the car,
//   base + orbitFovAdd), after which the chase starts afresh behind. pose = { p, q, v } (positions, quaternion, velocity).
// opts is the object passed in, filled with the style's defaults and kept live (?tune may write rig.opts.distance). rig.yaw is
// the view heading a stick reads against (C-2, #81; heading style), null before the first follow or snap. shake(a) jitters the
// position for `shakeTime` s, fading, from a hash (no Math.random). blendFrom(q, time = 1) turns the camera from rotation q back to
// the chase over `time` s, smoothstep (Tractor's F-10 hand-back from the show camera); snap cancels a blend and a shake.
// Nothing is allocated per frame.
import * as THREE from 'three';

const HEADING = Object.freeze({ distance: 12, height: 10.2, lag: 3, lookAhead: 11, lookHeight: 0.8, ease: 6, slide: 2, portrait: 1.25, portraitAspect: 0.9, shakeTime: 0.25 });
const TRAVEL = Object.freeze({ distance: 6.8, height: 2.4, lag: 3.5, lookAhead: 3, lookHeight: 0.6, ease: 8, lookEase: 12, blendFrom: 3, blendSpan: 20, blendMax: 0.55, shakeTime: 0.25,
  fovAdd: 2, fovSpeed: 0.25, fovMax: 10, orbitRadius: 9, orbitHeight: 3.2, orbitLook: 0.4, orbitSpeed: 0.12, orbitStart: 0.6, orbitFovAdd: -5 });
const Z = new THREE.Vector3(0, 0, 1);

export function createChaseRig(camera, opts = {}) {
  if (!camera?.isCamera) throw new Error('createChaseRig: camera required');
  const style = opts.style ?? 'heading';
  if (style !== 'heading' && style !== 'travel') throw new Error(`createChaseRig: style '${style}' (use 'heading' or 'travel')`);
  const defs = style === 'travel' ? TRAVEL : HEADING;
  for (const k of Object.keys(defs)) if (opts[k] === undefined) opts[k] = defs[k];
  opts.style = style;
  const tgt = new THREE.Vector3(), pos = new THREE.Vector3(), cp = new THREE.Vector3(), bq = new THREE.Quaternion(), dir = new THREE.Vector3(), vel = new THREE.Vector3();
  const camPos = camera.position.clone(), camLook = new THREE.Vector3(), chaseDir = new THREE.Vector3(), fov0 = camera.fov;
  const fromQ = new THREE.Quaternion(), toQ = new THREE.Quaternion();
  let yaw = null, shakeT = 0, shakeA = 0, n = 0, fresh = true, orbitA = null, blendK = 1, blendT = 1;
  const jitter = () => { // -0.5..0.5, a counter hash
    n = (n + 1) | 0; let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296 - 0.5;
  };
  const shaken = dt => { if (shakeT > 0) { shakeT -= dt; const a = shakeA * (shakeT / opts.shakeTime); pos.x += jitter() * a; pos.y += jitter() * a; } else shakeA = 0; };
  const blended = dt => { // F-10: slerp from the given rotation to this frame's chase rotation, smoothstep over blendT s
    if (blendK >= 1) return;
    blendK = Math.min(1, blendK + dt / blendT); const k = blendK * blendK * (3 - 2 * blendK);
    toQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(fromQ, toQ, k); camera.updateMatrixWorld();
  };
  const setFov = add => { const f = (camera.userData.lhFov ?? fov0) + add; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } };
  function heading(pose, kYaw, kPos, dt) {
    const want = (pose.fwd ?? 0) > opts.slide ? (pose.velYaw ?? pose.yaw) : pose.yaw;
    if (yaw === null) yaw = want;
    let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * kYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), k = camera.aspect < opts.portraitAspect ? opts.portrait : 1;
    tgt.set(pose.x + fx * opts.lookAhead, pose.y + opts.lookHeight, pose.z + fz * opts.lookAhead);
    pos.set(pose.x - fx * opts.distance * k, pose.y + opts.height * k, pose.z - fz * opts.distance * k);
    shaken(dt);
    camera.position.lerp(pos, kPos); camera.lookAt(tgt); camera.updateMatrixWorld();
  }
  function body(pose) { // cp, bq, the flat heading (dir) and velocity (vel) of a { p, q, v } pose; returns the planar speed
    cp.set(pose.p.x, pose.p.y, pose.p.z); bq.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    dir.copy(Z).applyQuaternion(bq); dir.y = 0; dir.normalize();
    vel.set(pose.v?.x ?? 0, 0, pose.v?.z ?? 0);
    return vel.length();
  }
  function travel(pose, dt, snap) {
    const sp = body(pose);
    if (sp > opts.blendFrom) dir.lerp(vel.normalize(), Math.min(opts.blendMax, (sp - opts.blendFrom) / opts.blendSpan)).normalize();
    if (fresh || snap) { chaseDir.copy(dir); fresh = false; } else chaseDir.lerp(dir, 1 - Math.exp(-dt * opts.lag)).normalize();
    pos.copy(cp).addScaledVector(chaseDir, -opts.distance); pos.y += opts.height;
    shaken(dt);
    tgt.copy(cp).addScaledVector(chaseDir, opts.lookAhead); tgt.y += opts.lookHeight;
    if (snap) { camPos.copy(pos); camLook.copy(tgt); }
    else { camPos.lerp(pos, 1 - Math.exp(-dt * opts.ease)); camLook.lerp(tgt, 1 - Math.exp(-dt * opts.lookEase)); }
    camera.position.copy(camPos); camera.lookAt(camLook);
    setFov(opts.fovAdd + Math.min(opts.fovMax, sp * opts.fovSpeed));
    camera.updateMatrixWorld();
  }
  return {
    opts,
    get yaw() { return yaw; },
    follow(pose, dt) { if (style === 'travel') travel(pose, dt, false); else heading(pose, Math.min(1, dt * opts.lag), Math.min(1, dt * opts.ease), dt); blended(dt); },
    snap(pose) { // straight behind at once, no blend or shake (a new farm)
      shakeT = 0; shakeA = 0; blendK = 1;
      if (style === 'travel') travel(pose, 0, true); else { yaw = null; heading(pose, 1, 1, 0); }
    },
    orbit(pose, dt) { // travel style: Rally's title turntable
      if (style !== 'travel') throw new Error("chase.orbit: needs style 'travel'");
      body(pose);
      orbitA = (orbitA ?? Math.atan2(-dir.x, -dir.z) + opts.orbitStart) + dt * opts.orbitSpeed;
      camPos.set(cp.x + opts.orbitRadius * Math.sin(orbitA), cp.y + opts.orbitHeight, cp.z + opts.orbitRadius * Math.cos(orbitA));
      camLook.set(cp.x, cp.y + opts.orbitLook, cp.z);
      camera.position.copy(camPos); camera.lookAt(camLook); setFov(opts.orbitFovAdd); camera.updateMatrixWorld();
      fresh = true; // the chase starts afresh behind the car
    },
    shake(a) { shakeA = Math.max(shakeA, a); shakeT = opts.shakeTime; },
    blendFrom(q, time = 1) { fromQ.copy(q); blendK = 0; blendT = time; },
  };
}
```

- [ ] **Step 4: Run; expect PASS** (6 tests).

- [ ] **Step 5: Prove the oracles bite.**
  - Change `HEADING.ease` to 5: expect the Tractor oracle test to fail at frame 0.
  - Restore, then change `shakeT = opts.shakeTime` in `shake` to `shakeT = 0.25`: expect the live-opts test to fail at "still shaking at 0.26 s".
  - Restore, then delete `blended(dt);` from `follow`: expect the blend test to fail on rotation at frame 10.
  - Restore, then change `TRAVEL.lookEase` to 11: expect the Rally oracle test to fail on rotation.
  - Restore, then change `setFov`'s `camera.userData.lhFov ?? fov0` to `fov0`: expect the `76` assertion to fail.
  - Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/camera/chase.js test/camera-chase.test.mjs && git commit -m "feat(view): chase rig with Tractor's heading style (velocity heading, portrait, shake, live opts, F-10 blend) and Rally's travel style, title orbit and speed FOV over lhFov"`

---

## Task 6: Mount rig (Rally bumper and bonnet)

**Files:**
- Create: `src/view/camera/mount.js`, `test/camera-mount.test.mjs`
- Modify: `test/camera-chase.test.mjs` (one test: Rally's four modes on one camera)

**Interfaces:**
- Consumes: a three camera; `camera.userData.lhFov`.
- Produces: `createMountRig(camera, { socket: { p, look? }, fovAdd? })` → `{ fovAdd, set(socket), follow(pose) }`. `pose` is `{ p, q }` or an Object3D (`sync.objectOf(car)`). `p`/`look` take `[x, y, z]` or `{ x, y, z }` in body space; `look` defaults to `[0, 0.3, 20]`.

**Decision (judgment):** §4.9 gives `createMountRig(camera, { socket })` with no methods. `follow`/`set` are the smallest surface that works (Contract issue 3). A socket *name* (resolved through `world.socket`) is left to the game, which passes `e.sockets[name]`.

**3j #9: the rigs cover all four of Rally's camera modes** (`render.js:152-184`, `camMode` 0 chase, 1 bumper, 2 bonnet, plus the title `orbit`). Rally keeps one travel chase rig and one mount rig on its camera:
- title → `chase.orbit(pose, dt)`; chase → `chase.follow(pose, dt)`; bumper → `mount.set({ p: [0, 0.05, zFront + 0.9] })`, bonnet → `mount.set({ p: [0, 0.62, 0.35] })`, then `mount.follow(pose)`, with `fovAdd: 12`;
- the socket is a plain body-space offset, so the Kenney cars need no `sock-*` empties (3j's objection);
- the mount never touches the chase rig's eased position, so switching back to chase eases from where the chase left off, as Rally's `this.camPos` does today. Step 1's second test pins all of it frame by frame.

- [ ] **Step 1: Write the failing test**

`test/camera-mount.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMountRig } from '../src/view/camera/mount.js';

// games/rally/src/render.js:173-180 at e03ed71 (bumper: camMode 1, bonnet: camMode 2)
function rallyMount(cam, cp, bq, camMode, frontZ) {
  const off = camMode === 1 ? new THREE.Vector3(0, 0.05, frontZ + 0.9) : new THREE.Vector3(0, 0.62, 0.35);
  cam.position.copy(cp).add(off.applyQuaternion(bq));
  const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(bq));
  cam.up.set(0, 1, 0).applyQuaternion(bq); cam.lookAt(look); cam.up.set(0, 1, 0);
  cam.fov = 72; cam.updateProjectionMatrix();
}

test('3g: createMountRig matches Rally\'s bumper and bonnet cameras, rolling with the body (port)', () => {
  const p = new THREE.Vector3(3, 1, -4), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.7, 0.3));
  const sockets = { 1: { p: [0, 0.05, 1.3 + 0.9] }, 2: { p: { x: 0, y: 0.62, z: 0.35 } } };
  for (const mode of [1, 2]) {
    const a = new THREE.PerspectiveCamera(60, 1.5), b = new THREE.PerspectiveCamera(60, 1.5);
    createMountRig(a, { socket: sockets[mode], fovAdd: 12 }).follow({ p, q }); rallyMount(b, p, q, mode, 1.3); // Rally's 72 = 3e's base 60 + 12
    assert.ok(a.position.distanceTo(b.position) < 1e-12, `position, mode ${mode}`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation, mode ${mode}`);
    assert.equal(a.fov, 72); assert.ok(a.up.equals(new THREE.Vector3(0, 1, 0)));
  }
});
test('3g: follow takes the synced Object3D; set swaps the mount; a socket is required', () => {
  const a = new THREE.PerspectiveCamera(60, 1.5), b = new THREE.PerspectiveCamera(60, 1.5), obj = new THREE.Object3D();
  obj.position.set(1, 2, 3); obj.quaternion.setFromEuler(new THREE.Euler(0, 1, 0.2));
  const rig = createMountRig(a, { socket: { p: [0, 0.05, 2.2] } }); rig.set({ p: [0, 0.62, 0.35] }); rig.follow(obj);
  rallyMount(b, obj.position, obj.quaternion, 2, 0);
  assert.ok(a.position.distanceTo(b.position) < 1e-12); assert.equal(a.fov, 60); // no fovAdd: left alone
  const c = new THREE.PerspectiveCamera(60, 0.6), r = createMountRig(c, { socket: { p: [0, 0, 0] }, fovAdd: 12 });
  c.userData.lhFov = 64; r.follow(obj); assert.equal(c.fov, 76); // 3e's portrait base 64, plus the rig's 12
  r.follow(obj); assert.equal(c.fov, 76); // added to the base, never to itself
  delete c.userData.lhFov; r.follow(obj); assert.equal(c.fov, 72); // no base from 3e: the fov at create
  assert.throws(() => createMountRig(a, {}), /socket required/); assert.throws(() => createMountRig(null, { socket: { p: [0, 0, 0] } }), /camera required/);
});
```

Append to `test/camera-chase.test.mjs` (it has Task 5's `rallyCam` oracle; add `import { createMountRig } from '../src/view/camera/mount.js';` at the top):

```js
// Rally's updateCamera at e03ed71 over all four modes: rallyCam for the title orbit and chase, render.js:179-184 for the mounts
test('3g: Rally\'s four camera modes on one camera, title -> chase -> bumper -> bonnet -> chase, frame by frame (3j #9)', () => {
  const a = new THREE.PerspectiveCamera(60, 1.6), b = new THREE.PerspectiveCamera(60, 1.6), zFront = 1.2;
  a.position.set(0, 4, -8); a.userData.lhFov = 60;
  const SOCK = { 1: { p: [0, 0.05, zFront + 0.9] }, 2: { p: [0, 0.62, 0.35] } };
  const chase = createChaseRig(a, { style: 'travel' }), mount = createMountRig(a, { socket: SOCK[1], fovAdd: 12 }), ref = rallyCam(b);
  const body = { p: { x: 0, y: 0.5, z: 0 }, q: new THREE.Quaternion(), v: { x: 0, y: 0, z: 0 } }, Y = new THREE.Vector3(0, 1, 0);
  let yawB = 0.3;
  for (let i = 0; i < 300; i++) {
    const dt = i % 4 ? 1 / 60 : 1 / 45, mode = i < 40 ? 'title' : i < 120 ? 0 : i < 160 ? 1 : i < 200 ? 2 : 0;
    if (mode !== 'title') { const sp = Math.min(30, (i - 40) * 0.3); yawB += 0.01; body.v.x = Math.sin(yawB + 0.3) * sp; body.v.z = Math.cos(yawB + 0.3) * sp; body.p.x += body.v.x * dt; body.p.z += body.v.z * dt; }
    body.q.setFromAxisAngle(Y, yawB);
    if (mode === 'title' || mode === 0) { ref.orbit = mode === 'title'; ref.update(body, dt); }
    else { // render.js:179-184 (Rally's camPos is left alone in these modes)
      const cp = new THREE.Vector3(body.p.x, body.p.y, body.p.z), off = mode === 1 ? new THREE.Vector3(0, 0.05, zFront + 0.9) : new THREE.Vector3(0, 0.62, 0.35);
      b.position.copy(cp).add(off.applyQuaternion(body.q));
      const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(body.q));
      b.up.set(0, 1, 0).applyQuaternion(body.q); b.lookAt(look); b.up.set(0, 1, 0); b.fov = 72; b.updateProjectionMatrix();
    }
    if (mode === 'title') chase.orbit(body, dt); else if (mode === 0) chase.follow(body, dt); else { mount.set(SOCK[mode]); mount.follow(body); }
    assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i} (mode ${mode})`);
    assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i} (mode ${mode})`);
    assert.ok(Math.abs(a.fov - b.fov) < 1e-12, `fov at frame ${i} (mode ${mode})`);
  }
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND`. `UNIT test/camera-mount.test.mjs`

- [ ] **Step 3: Implement**

`src/view/camera/mount.js`:

```js
// Mounted camera (Rally's bumper and bonnet views, render.js:173-180): fixed to a body at socket.p (body space), looking at
// socket.look (body space; default 20 m ahead and 0.3 m up) and rolling with the body. follow(pose) takes { p, q } or an
// Object3D (the synced object, so the camera rides the interpolated pose). set(socket) swaps the mount (bumper <-> bonnet).
// With `fovAdd` the field of view is the base plus that many degrees: the base is camera.userData.lhFov (3e's portrait FOV
// rule, kept up to date by the renderer's resize), else the camera's fov when the rig was made. Never an absolute overwrite.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0), LOOK = new THREE.Vector3(0, 0.3, 20), ZERO = new THREE.Vector3();

export function createMountRig(camera, { socket, fovAdd = null } = {}) {
  if (!camera?.isCamera) throw new Error('createMountRig: camera required');
  const fov0 = camera.fov;
  const off = new THREE.Vector3(), look = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion(), at = new THREE.Vector3();
  const read = (v, out, def) => (v == null ? out.copy(def) : Array.isArray(v) ? out.fromArray(v) : out.set(v.x, v.y, v.z));
  const rig = {
    fovAdd,
    set(s) {
      if (!s || s.p == null) throw new Error('createMountRig: socket required ({ p: [x, y, z], look?: [x, y, z] })');
      read(s.p, off, ZERO); read(s.look, look, LOOK);
    },
    follow(pose) {
      const pp = pose.isObject3D ? pose.position : pose.p, pq = pose.isObject3D ? pose.quaternion : pose.q;
      p.set(pp.x, pp.y, pp.z); q.set(pq.x, pq.y, pq.z, pq.w);
      camera.position.copy(off).applyQuaternion(q).add(p);
      at.copy(look).applyQuaternion(q).add(p);
      camera.up.copy(UP).applyQuaternion(q); camera.lookAt(at); camera.up.copy(UP);
      if (rig.fovAdd != null) { const f = (camera.userData.lhFov ?? fov0) + rig.fovAdd; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
      camera.updateMatrixWorld();
    },
  };
  rig.set(socket);
  return rig;
}
```

- [ ] **Step 4: Run; expect PASS** (2 tests, and 7 in `test/camera-chase.test.mjs`). `UNIT test/camera-mount.test.mjs test/camera-chase.test.mjs`

- [ ] **Step 5: Prove the tests bite.**
  - Delete `camera.up.copy(UP).applyQuaternion(q); ` (keep `camera.lookAt(at)`): expect the oracle test to fail on rotation (the camera no longer rolls with the body). Restore; PASS.
  - In `chase.js`, make `travel` ease from the camera's current position (insert `camPos.copy(camera.position);` before the `camPos.lerp`): expect the four-modes test to fail on position at frame 200 (the chase must ease from its own last position, not the mount's). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/camera/mount.js test/camera-mount.test.mjs test/camera-chase.test.mjs && git commit -m "feat(view): mount rig for body-fixed cameras (Rally bumper and bonnet), FOV over lhFov"`

---

## Task 7: Orbit rig: pose, limits, framing, pan, drive chase, release, ray

**Files:**
- Create: `src/view/camera/orbit.js`, `test/camera-orbit.test.mjs`

**Interfaces:**
- Consumes: a three camera; `src/view/gesture.js` `bindGesture` (for Task 8; imported now).
- Produces: `createOrbitRig(camera, { target, distance, min, max, pitch, yaw, pitchMin, pitchMax, bounds, ground, canvas, chase, fit })` → `{ state, limits, gesture, orbiting, fit(aspect?), apply(), update(dt, raw), panBy(dx, dy), chase(pose, dt), release({ pitch, distance }), ray(cx, cy, out?), bindGesture(engine, el, opts) }`.
  - `state` `{ tx, ty, tz, yaw, pitch, dist, chaseOff }` and `limits` `{ pitchMin, pitchMax, min, max, bounds }` are live, readable and writable (3k's need).
  - `fit` is `{ portrait, landscape }` partial states (Pig Pens' `fitCam`).
  - `chase(pose, dt)` with pose `{ x, z, yaw, fwd }` eases the target toward a moving point; `release()` hands back to orbit (Pig Pens' `afterDrive`).
  - **3k C9.** This is the surface 3k said `createOrbitRig` lacked (a readable/writable pose, clamps, drive chase): Pig Pens adopts the rig and deletes `cam`, `applyCam`, `fitCam`, `panBy`, `chase`, `afterDrive`, `ray` and its gesture code from `view/rig.js`. Its values are the defaults here plus `PIG_PENS` in the test (`target { x: 0, y: 0.5, z: 1 }`, `bounds { x: [-34, 34], z: [-30, 30] }`) and its `fit` (portrait `{ yaw: π/2, dist: 60, tx: -3, tz: -9 }`, landscape `{ yaw: 0, dist: 46, tx: -1, tz: -4 }`).

- [ ] **Step 1: Write the failing test**

`test/camera-orbit.test.mjs` (the oracle is Pig Pens' `view/rig.js` at e03ed71, verbatim but for the module state moved onto a local object):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitRig } from '../src/view/camera/orbit.js';

// games/pig-pens/src/view/rig.js at e03ed71: applyCam, panBy and chase (rig.gesture null), on a local cam object
function pigPensRig(camera) {
  const cam = { tx: 0, tz: 1, yaw: 0, pitch: 0.92, dist: 46 }, o = { chaseOff: 0 };
  const applyCam = () => {
    cam.pitch = Math.max(0.28, Math.min(1.48, cam.pitch)); cam.dist = Math.max(2.5, Math.min(80, cam.dist));
    cam.tx = Math.max(-34, Math.min(34, cam.tx)); cam.tz = Math.max(-30, Math.min(30, cam.tz));
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 0.5, cam.tz); camera.updateMatrixWorld();
  };
  const panBy = (dx, dy) => {
    const k = cam.dist * 0.0016, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.tx -= (dx * rx - dy * fx / Math.max(0.5, Math.sin(cam.pitch))) * k; cam.tz -= (dx * rz - dy * fz / Math.max(0.5, Math.sin(cam.pitch))) * k;
  };
  const chase = (t, dt) => {
    const want = t.yaw + Math.PI + o.chaseOff; let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * Math.min(1, dt * 2.5); o.chaseOff *= Math.max(0, 1 - dt * 0.8);
    const lead = Math.max(-1, Math.min(3, t.fwd * 0.5));
    cam.tx += (t.x + Math.sin(t.yaw) * lead - cam.tx) * Math.min(1, dt * 5); cam.tz += (t.z + Math.cos(t.yaw) * lead - cam.tz) * Math.min(1, dt * 5);
    cam.pitch += (0.42 - cam.pitch) * Math.min(1, dt * 2); cam.dist += (Math.min(Math.max(cam.dist, 9), 22) - cam.dist) * Math.min(1, dt * 2);
  };
  const afterDrive = () => { cam.pitch = Math.max(cam.pitch, 0.7); cam.dist = Math.max(cam.dist, 18); o.chaseOff = 0; };
  return { cam, o, applyCam, panBy, chase, afterDrive };
}
const PIG_PENS = { target: { x: 0, y: 0.5, z: 1 }, distance: 46, pitch: 0.92, bounds: { x: [-34, 34], z: [-30, 30] } };
const same = (a, b, what) => {
  assert.ok(a.position.distanceTo(b.position) < 1e-9, `${what}: position`);
  assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `${what}: rotation`);
};

test('3g: createOrbitRig matches Pig Pens\' orbit, pan, drive chase, release and clamps (port of view/rig.js)', () => {
  const a = new THREE.PerspectiveCamera(50, 1.5), b = new THREE.PerspectiveCamera(50, 1.5), rig = createOrbitRig(a, PIG_PENS), ref = pigPensRig(b);
  rig.update(); ref.applyCam(); same(a, b, 'start');
  rig.state.yaw = ref.cam.yaw = 0.4; rig.panBy(30, -12); ref.panBy(30, -12); rig.update(); ref.applyCam(); same(a, b, 'pan');
  rig.state.chaseOff = ref.o.chaseOff = 0.3;
  const t = { x: 3, z: -2, yaw: 1, fwd: 4 };
  for (let i = 0; i < 90; i++) { t.x += 0.1; t.yaw += 0.01; rig.chase(t, 1 / 60); ref.chase(t, 1 / 60); rig.update(1 / 60); ref.applyCam(); same(a, b, `chase ${i}`); }
  rig.release(); ref.afterDrive(); rig.update(); ref.applyCam(); same(a, b, 'release'); assert.equal(rig.state.chaseOff, 0);
  rig.state.pitch = ref.cam.pitch = 3; rig.state.dist = ref.cam.dist = 500; rig.state.tx = ref.cam.tx = 100; rig.state.tz = ref.cam.tz = -100;
  rig.update(); ref.applyCam(); same(a, b, 'clamps'); assert.deepEqual([rig.state.pitch, rig.state.dist, rig.state.tx, rig.state.tz], [1.48, 80, 34, -30]);
});
test('3g: a held chase drag keeps the chase offset; let go, it recentres (Pig Pens drive)', () => {
  const rig = createOrbitRig(new THREE.PerspectiveCamera()), t = { x: 0, z: 0, yaw: 0, fwd: 0 };
  rig.state.chaseOff = 0.5; rig.gesture = 'chase'; rig.chase(t, 0.5); assert.equal(rig.state.chaseOff, 0.5);
  rig.gesture = null; rig.chase(t, 0.5); assert.ok(Math.abs(rig.state.chaseOff - 0.3) < 1e-12);
});
test('3g: ray through the canvas centre runs from the camera along its view; a fresh array unless out is given (#72)', () => {
  const c = new THREE.PerspectiveCamera(60, 2), canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
  const rig = createOrbitRig(c, { canvas }); rig.update();
  const r = rig.ray(110, 70), dir = c.getWorldDirection(new THREE.Vector3());
  assert.equal(r.length, 6);
  assert.ok(Math.hypot(r[0] - c.position.x, r[1] - c.position.y, r[2] - c.position.z) < 1e-9);
  assert.ok(Math.hypot(r[3] - dir.x, r[4] - dir.y, r[5] - dir.z) < 1e-9);
  assert.notEqual(rig.ray(110, 70), r); const out = [0, 0, 0, 0, 0, 0]; assert.equal(rig.ray(110, 70, out), out);
  assert.throws(() => createOrbitRig(c).ray(0, 0), /orbit\.ray: no element/);
  assert.throws(() => createOrbitRig({}), /camera required/);
});
test('3g: fit frames by aspect (Pig Pens\' fitCam); limits are live (Pig Pens framing)', () => {
  const fit = { portrait: { yaw: Math.PI / 2, dist: 60, tx: -3, tz: -9 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } };
  const c = new THREE.PerspectiveCamera(50, 0.5), rig = createOrbitRig(c, { ...PIG_PENS, fit });
  rig.fit(); assert.deepEqual([rig.state.yaw, rig.state.dist, rig.state.tx, rig.state.tz], [Math.PI / 2, 60, -3, -9]);
  rig.fit(1.5); assert.deepEqual([rig.state.yaw, rig.state.dist, rig.state.tx, rig.state.tz], [0, 46, -1, -4]);
  rig.limits.max = 30; rig.update(); assert.equal(rig.state.dist, 30);
  rig.limits.bounds = null; rig.state.tx = 500; rig.update(); assert.equal(rig.state.tx, 500);
  assert.throws(() => createOrbitRig(c).fit(), /no fit framing/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND`. `UNIT test/camera-orbit.test.mjs`

- [ ] **Step 3: Implement**

`src/view/camera/orbit.js` (the gesture binding is tested in Task 8):

```js
// Orbit camera (Pig Pens' view/rig.js, #59): yaw, pitch and distance round a ground target. rig.state is the live pose
// { tx, ty, tz, yaw, pitch, dist, chaseOff }, readable and writable; rig.limits the live clamps { pitchMin, pitchMax, min, max,
// bounds: { x: [lo, hi], z: [lo, hi] } | null }. fit(aspect?) applies the `fit` framing for the aspect (Pig Pens' fitCam:
// fit.portrait below 0.9, else fit.landscape; each a partial state). update(dt, raw) drives the bound gestures, then apply()
// clamps and places the camera.
// bindGesture(engine, el, { mode, tapMove }) adds the view-only camera gestures (lion-hawk bindGesture): one finger drags by
// mode() ('orbit' | 'chase' | 'none' | null, asked when the drag starts; 'orbit' sets rig.orbiting for the game's tool picker, #52;
// an orbit drag stops for good once mode() stops answering 'orbit', e.g. a drive began mid-drag, 3k C9),
// two fingers pinch-zoom, turn and pan (turn the chase offset instead while mode() is 'chase', asked on every move),
// mouse right-drag orbits, middle-drag pans,
// the wheel zooms, no context menu. Do not also add it to boot's devices: rig.update drives it.
// chase(pose, dt) is Pig Pens' drive camera (pose { x, z, yaw, fwd }); release() lifts it back over the farm.
// ray(cx, cy, out?) is the camera ray through a client point, [ox, oy, oz, dx, dy, dz] (a fresh array without out, #72).
import * as THREE from 'three';
import { bindGesture as bindViewGesture } from '../gesture.js';

const CHASE = Object.freeze({ lag: 2.5, recentre: 0.8, lead: 0.5, leadMin: -1, leadMax: 3, follow: 5, pitch: 0.42, near: 9, far: 22, ease: 2 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createOrbitRig(camera, { target = { x: 0, y: 0.5, z: 0 }, distance = 46, min = 2.5, max = 80, pitch = 0.92, yaw = 0,
  pitchMin = 0.28, pitchMax = 1.48, bounds = null, ground = 0, canvas = null, chase = {}, fit = null } = {}) {
  if (!camera?.isCamera) throw new Error('createOrbitRig: camera required');
  const ch = { ...CHASE, ...chase };
  const state = { tx: target.x, ty: target.y, tz: target.z, yaw, pitch, dist: distance, chaseOff: 0 };
  const limits = { pitchMin, pitchMax, min, max, bounds };
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), devices = [];
  let el = canvas;
  const rig = {
    state, limits, gesture: null, orbiting: false,
    fit(aspect = camera.aspect) {
      if (!fit) throw new Error('orbit.fit: no fit framing (createOrbitRig({ fit: { portrait, landscape } }))');
      Object.assign(state, aspect < 0.9 ? fit.portrait : fit.landscape);
    },
    apply() {
      const L = limits;
      state.pitch = clamp(state.pitch, L.pitchMin, L.pitchMax); state.dist = clamp(state.dist, L.min, L.max);
      if (L.bounds) { state.tx = clamp(state.tx, L.bounds.x[0], L.bounds.x[1]); state.tz = clamp(state.tz, L.bounds.z[0], L.bounds.z[1]); }
      const cp = Math.cos(state.pitch);
      camera.position.set(state.tx + Math.sin(state.yaw) * cp * state.dist, ground + Math.sin(state.pitch) * state.dist, state.tz + Math.cos(state.yaw) * cp * state.dist);
      camera.lookAt(state.tx, state.ty, state.tz);
      camera.updateMatrixWorld(); // ray() and project() use the camera as drawn
    },
    update(dt = 0, raw = dt) { for (let i = 0; i < devices.length; i++) devices[i].update(dt, raw); rig.apply(); },
    panBy(dx, dy) { // screen px -> ground metres, Pig Pens' feel
      const k = state.dist * 0.0016, s = Math.max(0.5, Math.sin(state.pitch));
      const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
      state.tx -= (dx * rx - dy * fx / s) * k; state.tz -= (dx * rz - dy * fz / s) * k;
    },
    chase(t, dt) {
      let d = t.yaw + Math.PI + state.chaseOff - state.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      state.yaw += d * Math.min(1, dt * ch.lag);
      if (!rig.gesture) state.chaseOff *= Math.max(0, 1 - dt * ch.recentre); // a drag holds the offset; let go, it recentres
      const lead = clamp(t.fwd * ch.lead, ch.leadMin, ch.leadMax);
      state.tx += (t.x + Math.sin(t.yaw) * lead - state.tx) * Math.min(1, dt * ch.follow);
      state.tz += (t.z + Math.cos(t.yaw) * lead - state.tz) * Math.min(1, dt * ch.follow);
      state.pitch += (ch.pitch - state.pitch) * Math.min(1, dt * ch.ease);
      state.dist += (clamp(state.dist, ch.near, ch.far) - state.dist) * Math.min(1, dt * ch.ease);
    },
    release({ pitch: p = 0.7, distance: dd = 18 } = {}) { state.pitch = Math.max(state.pitch, p); state.dist = Math.max(state.dist, dd); state.chaseOff = 0; },
    ray(cx, cy, out = new Array(6)) {
      if (!el) throw new Error('orbit.ray: no element (pass canvas, or bindGesture first)');
      const r = el.getBoundingClientRect();
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      out[0] = o.x; out[1] = o.y; out[2] = o.z; out[3] = d.x; out[4] = d.y; out[5] = d.z;
      return out;
    },
    bindGesture(engine, element, { mode = () => 'orbit', tapMove = 12 } = {}) {
      if (!element) throw new Error('orbit.bindGesture: element required');
      el ??= element;
      let one = null, lx = 0, ly = 0, d0 = 0, r0 = 0, px = 0, py = 0, mx = 0, my = 0;
      const drag = d => { // cumulative from the down point; apply the change since the last call
        if (d.phase === 'start') { one = mode(); lx = 0; ly = 0; if (one === 'orbit') rig.orbiting = true; rig.gesture = one === 'orbit' || one === 'chase' ? one : null; return; }
        const ix = d.dx - lx, iy = d.dy - ly; lx = d.dx; ly = d.dy;
        if (one === 'orbit' && mode() !== 'orbit') { one = null; rig.gesture = null; } // Pig Pens: a Hand drag begun before a drive must not orbit it
        if (one === 'orbit') { state.yaw -= ix * 0.006; state.pitch += iy * 0.005; }
        else if (one === 'chase') { state.chaseOff -= ix * 0.006; state.pitch += iy * 0.004; }
        if (d.phase === 'end') { one = null; rig.gesture = null; }
      };
      const pinch = p => {
        if (p.phase === 'start') { d0 = state.dist; r0 = 0; px = 0; py = 0; rig.gesture = 'pinch'; return; }
        state.dist = d0 / Math.max(0.05, p.scale);
        const da = p.rotate - r0; r0 = p.rotate; // the turn since the last move, so a drive that starts mid-pinch turns the chase from then on
        if (mode() === 'chase') state.chaseOff += da;
        else { state.yaw += da; rig.panBy(p.panX - px, p.panY - py); }
        px = p.panX; py = p.panY;
        if (p.phase === 'end') rig.gesture = null;
      };
      const mouse = kind => d => {
        if (d.phase === 'start') { mx = 0; my = 0; rig.gesture = kind; return; }
        const ix = d.dx - mx, iy = d.dy - my; mx = d.dx; my = d.dy;
        if (kind === 'orbit') { state.yaw -= ix * 0.006; state.pitch += iy * 0.005; } else rig.panBy(ix, iy);
        if (d.phase === 'end') rig.gesture = null;
      };
      const gs = [
        bindViewGesture(engine, element, { drag, pinch, tapMove }),
        bindViewGesture(engine, element, { drag: mouse('orbit'), tapMove: 0, filter: { pointerType: ['mouse'], button: [2] } }),
        bindViewGesture(engine, element, { drag: mouse('pan'), tapMove: 0, filter: { pointerType: ['mouse'], button: [1] } }),
      ];
      const onDown = () => { rig.orbiting = false; }; // every new gesture starts as a tool gesture (#52)
      const onWheel = e => { e.preventDefault(); state.dist *= Math.exp(e.deltaY * 0.0012); };
      const onMenu = e => e.preventDefault();
      element.addEventListener('pointerdown', onDown, true); element.addEventListener('wheel', onWheel, { passive: false }); element.addEventListener('contextmenu', onMenu);
      const device = {
        update(dt, raw = dt) { for (let i = 0; i < gs.length; i++) gs[i].update(dt, raw); },
        dispose() {
          for (let i = gs.length - 1; i >= 0; i--) gs[i].dispose();
          element.removeEventListener('pointerdown', onDown, true); element.removeEventListener('wheel', onWheel); element.removeEventListener('contextmenu', onMenu);
          const i = devices.indexOf(device); if (i >= 0) devices.splice(i, 1);
          rig.gesture = null;
        },
      };
      devices.push(device);
      return device;
    },
  };
  return rig;
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the oracle bites.** Change `CHASE.recentre` to 0.7: expect the oracle test to fail in the chase loop. Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/camera/orbit.js test/camera-orbit.test.mjs && git commit -m "feat(view): orbit rig with live pose and limits, aspect framing, pan, drive chase and ray (Pig Pens rig)"`

---

## Task 8: Orbit gestures

**Files:**
- Create: `test/camera-orbit-gesture.test.mjs`
- (Code is Task 7's `bindGesture`. This task proves it, and fixes it if a test shows a fault.)

**Interfaces:**
- Consumes: Task 7's `rig.bindGesture(engine, el, { mode = () => 'orbit', tapMove = 12 })` → device `{ update(dt, raw), dispose() }`, driven by `rig.update(dt, raw)`; engine `bindGesture` (#59).
- Produces: nothing new.

**Decisions to confirm in review (judgment):**
- `bindGesture` starts a drag only past `tapMove`, and its `dx` is measured from the down point. Two small changes from Pig Pens follow:
  - a chase drag now waits for `tapMove` px;
  - the first orbit step includes the threshold distance (about 0.07 rad at Pig Pens' `ORBIT_PX`).

  Both are flagged for 3k's playtest in the notes.
- `rig.gesture` clears at the gesture's `end`, not when the last finger lifts (Pig Pens' `'idle'` state is not modelled).
- `mode()` is asked again as a gesture moves (3k C9, Pig Pens' `rig.js` reads `driving` on every move): an orbit drag stops once a drive starts, and a pinch turns the chase offset from the move the drive starts on.

- [ ] **Step 1: Write the test**

`test/camera-orbit-gesture.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitRig } from '../src/view/camera/orbit.js';
import { createEngine, defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';

const setup = (opts) => {
  const { window, document } = dom(), el = document.createElement('div'); document.body.appendChild(el);
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const rig = createOrbitRig(new THREE.PerspectiveCamera(50, 4 / 3)), dev = rig.bindGesture(engine, el, opts);
  const ev = (t, type, id, x, y, extra = {}) => t.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0, ...extra }));
  return { window, document, el, rig, dev, ev };
};
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test('3g: one finger orbits past tapMove (rig.orbiting for the tool picker); a tap does not (#59, #52)', () => {
  const s = setup(), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointerup', 1, 104, 100); s.rig.update(0.016);
  near(st.yaw, 0, 'tap yaw'); assert.equal(s.rig.orbiting, false);
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.window, 'pointermove', 2, 150, 120); assert.equal(s.rig.orbiting, true); assert.equal(s.rig.gesture, 'orbit');
  s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 150, 120);
  near(st.yaw, -50 * 0.006, 'yaw'); near(st.pitch, 0.92 + 20 * 0.005, 'pitch'); assert.equal(s.rig.gesture, null);
  s.ev(s.el, 'pointerdown', 3, 0, 0); assert.equal(s.rig.orbiting, false); // the next gesture starts as a tool gesture
});
test('3g: mode() picks the one-finger drag: chase turns the chase offset, none leaves the camera alone (#59)', () => {
  let mode = 'chase'; const s = setup({ mode: () => mode }), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointermove', 1, 150, 120); s.rig.update(0.016); s.ev(s.window, 'pointerup', 1, 150, 120);
  near(st.chaseOff, -0.3, 'chaseOff'); near(st.pitch, 0.92 + 20 * 0.004, 'pitch'); near(st.yaw, 0, 'yaw'); assert.equal(s.rig.orbiting, false);
  mode = 'none'; const before = { ...st };
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.window, 'pointermove', 2, 180, 150); s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 180, 150);
  assert.deepEqual({ ...st }, before);
});
test('3g: two fingers pinch-zoom, turn and pan (Pig Pens\' two-pointer gesture) (#59)', () => {
  const s = setup(), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.el, 'pointerdown', 2, 200, 100); assert.equal(s.rig.gesture, 'pinch');
  s.ev(s.window, 'pointermove', 2, 300, 100); s.rig.update(0.016);
  near(st.dist, 23, 'dist'); near(st.yaw, 0, 'yaw'); near(st.tx, -50 * 23 * 0.0016, 'pan x'); near(st.tz, 0, 'pan z');
  s.ev(s.window, 'pointermove', 1, 100, 200); s.rig.update(0.016); // turn the pair by 45 degrees about the first finger... and move the midpoint
  const a = Math.atan2(100 - 200, 300 - 100); assert.ok(Math.abs(st.yaw - a) < 1e-9, `yaw ${st.yaw}`);
  s.ev(s.window, 'pointerup', 2, 300, 100); s.ev(s.window, 'pointerup', 1, 100, 200); assert.equal(s.rig.gesture, null);
});
test('3g: mouse right-drag orbits, middle-drag pans, the wheel zooms, no context menu; dispose removes it all (#59)', () => {
  const s = setup(), st = s.rig.state, mouse = { pointerType: 'mouse' };
  s.ev(s.el, 'pointerdown', 1, 100, 100, { ...mouse, button: 2 }); s.ev(s.window, 'pointermove', 1, 103, 100, mouse); s.rig.update(0.016); s.ev(s.window, 'pointerup', 1, 103, 100, { ...mouse, button: 2 });
  near(st.yaw, -3 * 0.006, 'right-drag yaw');
  s.ev(s.el, 'pointerdown', 2, 100, 100, { ...mouse, button: 1 }); s.ev(s.window, 'pointermove', 2, 110, 100, mouse); s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 110, 100, { ...mouse, button: 1 });
  assert.ok(st.tx < 0, 'middle-drag pans');
  const w = new s.window.WheelEvent('wheel', { deltaY: 100, cancelable: true }); s.el.dispatchEvent(w);
  near(st.dist, 46 * Math.exp(0.12), 'wheel'); assert.equal(w.defaultPrevented, true);
  const m = new s.window.MouseEvent('contextmenu', { cancelable: true, bubbles: true }); s.el.dispatchEvent(m); assert.equal(m.defaultPrevented, true);
  s.dev.dispose(); const before = { ...st };
  s.ev(s.el, 'pointerdown', 3, 100, 100); s.ev(s.window, 'pointermove', 3, 200, 100); s.rig.update(0.016); s.el.dispatchEvent(new s.window.WheelEvent('wheel', { deltaY: 100 }));
  assert.deepEqual({ ...st }, before); assert.equal(s.el.style.touchAction, '');
});
test('3g: mode() is asked again as a gesture moves: a drive that starts mid-drag stops the orbit; mid-pinch it turns the chase offset (3k C9)', () => {
  let mode = 'orbit'; const s = setup({ mode: () => mode }), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointermove', 1, 150, 100); s.rig.update(0.016);
  near(st.yaw, -50 * 0.006, 'orbits before the drive');
  mode = 'chase'; s.ev(s.window, 'pointermove', 1, 200, 120); s.rig.update(0.016);
  near(st.yaw, -50 * 0.006, 'no orbit once driving'); near(st.chaseOff, 0, 'nor a chase turn'); assert.equal(s.rig.gesture, null);
  s.ev(s.window, 'pointerup', 1, 200, 120);
  mode = 'orbit'; const yaw0 = st.yaw;
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.el, 'pointerdown', 3, 200, 100);
  s.ev(s.window, 'pointermove', 3, 200, 200); s.rig.update(0.016); near(st.yaw, yaw0 + Math.PI / 4, 'pinch turns the view');
  mode = 'chase'; s.ev(s.window, 'pointermove', 3, 100, 200); s.rig.update(0.016);
  near(st.yaw, yaw0 + Math.PI / 4, 'not the view once driving'); near(st.chaseOff, Math.PI / 4, 'the chase offset instead');
  s.ev(s.window, 'pointerup', 3, 100, 200); s.ev(s.window, 'pointerup', 2, 100, 100);
});
```

- [ ] **Step 2: Run; expect PASS** (5 tests). `UNIT test/camera-orbit-gesture.test.mjs`. A failure here is a fault in Task 7's `bindGesture`: fix it there, and rerun Task 7's test too.

- [ ] **Step 3: Prove the tests bite.**
  - In `drag`, change `const ix = d.dx - lx` to `const ix = d.dx`: expect "one finger orbits…" to fail (the end phase applies the drag twice).
  - Restore, then remove `rig.panBy(p.panX - px, p.panY - py);`: expect the pinch test to fail on `pan x`.
  - Restore, then delete the `if (one === 'orbit' && mode() !== 'orbit')` line in `drag`: expect the 3k C9 test to fail on "no orbit once driving".
  - Restore; PASS.

- [ ] **Step 4: Commit.** `git add test/camera-orbit-gesture.test.mjs && git commit -m "test(view): orbit gestures: one-finger orbit and chase, pinch, mouse, wheel, mode changes mid-gesture (#59)"`

---

## Task 9: `createInstances`

**Files:**
- Create: `src/view/instancing/instances.js`, `test/sync-instances.test.mjs`

**Interfaces:**
- Consumes: three.
- Produces: `createInstances({ geometry, material, max, castShadow = true, receiveShadow = true, colors = false, coverage = false })` → `{ mesh, max, coverage, count (get/set), set(i, p, q, s), setMatrix(i, m), getMatrix(i, out), color(i, c), cover(i, dirt, rust, snow, mud), copy(from, to), commit(), dispose() }`. `setMatrix`, `getMatrix`, `cover`, `copy`, `dispose`, `colors` and `coverage` are additive (Contract issue 4). `instanceCoverage` is the per-instance vec4 that 3f's `COVERAGE_INSTANCED` reads (3f C6).

**Decision (judgment):** `instanceCoverage` goes on a geometry of the mesh's own that **shares** the source's attribute objects, so templates and plain clones never carry an instanced attribute. That wrapper is never disposed, because disposing it would free the shared GPU buffers. It costs one small `WebGLGeometries` entry per instanced coverage mesh until the page closes (field note candidate).

- [ ] **Step 1: Write the failing test**

`test/sync-instances.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInstances } from '../src/view/instancing/instances.js';

const geo = new THREE.BoxGeometry(), mat = new THREE.MeshLambertMaterial(), Q = new THREE.Quaternion();
const at = (inst, i) => new THREE.Vector3().setFromMatrixPosition(inst.getMatrix(i, new THREE.Matrix4()));

test('3g: createInstances: an InstancedMesh with count 0, shadows on, culling off; set composes p, q, s (instancing)', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 4 });
  assert.equal(inst.mesh.isInstancedMesh, true); assert.equal(inst.count, 0); assert.equal(inst.mesh.count, 0);
  assert.deepEqual([inst.mesh.castShadow, inst.mesh.receiveShadow, inst.mesh.frustumCulled, inst.mesh.instanceColor], [true, true, false, null]);
  inst.count = 2; assert.equal(inst.mesh.count, 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
  inst.set(1, { x: 1, y: 2, z: 3 }, q, 2); inst.getMatrix(1, new THREE.Matrix4()).decompose(p, r, s);
  assert.ok(p.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-6); assert.ok(1 - Math.abs(r.dot(q)) < 1e-6); assert.ok(s.distanceTo(new THREE.Vector3(2, 2, 2)) < 1e-6);
  inst.set(0, { x: 0, y: 0, z: 0 }, q, { x: 1, y: 2, z: 3 }); inst.getMatrix(0, new THREE.Matrix4()).decompose(p, r, s);
  assert.ok(s.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-6);
  inst.setMatrix(1, new THREE.Matrix4().makeTranslation(7, 0, 0)); assert.ok(at(inst, 1).distanceTo(new THREE.Vector3(7, 0, 0)) < 1e-6);
});
test('3g: commit uploads only what changed; colours start white and take CSS strings (instancing)', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 4, colors: true }), m = inst.mesh;
  const v0 = m.instanceMatrix.version, c0 = m.instanceColor.version;
  inst.commit(); assert.equal(m.instanceMatrix.version, v0);
  inst.set(0, { x: 1, y: 0, z: 0 }, Q); inst.commit(); assert.equal(m.instanceMatrix.version, v0 + 1); assert.equal(m.instanceColor.version, c0);
  inst.commit(); assert.equal(m.instanceMatrix.version, v0 + 1);
  inst.color(2, '#ff0000'); inst.commit(); assert.equal(m.instanceColor.version, c0 + 1);
  assert.deepEqual([...m.instanceColor.array.slice(6, 9)], [1, 0, 0]); assert.deepEqual([...m.instanceColor.array.slice(0, 3)], [1, 1, 1]);
  inst.color(1, new THREE.Color(0, 1, 0)); assert.deepEqual([...m.instanceColor.array.slice(3, 6)], [0, 1, 0]);
});
test('3g: copy moves an instance\'s matrix and colour (swap-remove); count is range-checked; dispose keeps shared buffers', () => {
  const inst = createInstances({ geometry: geo, material: mat, max: 3, colors: true });
  inst.count = 3; inst.set(2, { x: 9, y: 0, z: 0 }, Q); inst.color(2, '#0000ff');
  inst.copy(2, 0); assert.ok(at(inst, 0).distanceTo(new THREE.Vector3(9, 0, 0)) < 1e-6); assert.deepEqual([...inst.mesh.instanceColor.array.slice(0, 3)], [0, 0, 1]);
  assert.throws(() => { inst.count = 4; }, /count 4 outside 0\.\.3/); assert.throws(() => { inst.count = -1; }, RangeError);
  let geoGone = false; geo.addEventListener('dispose', () => { geoGone = true; });
  const parent = new THREE.Group(); parent.add(inst.mesh); inst.dispose();
  assert.equal(inst.mesh.parent, null); assert.equal(geoGone, false);
  assert.throws(() => createInstances({ geometry: geo, material: mat, max: 0 }), /max must be/);
  assert.throws(() => createInstances({ material: mat, max: 2 }), /geometry required/);
});
test('3g: coverage adds a per-instance vec4 instanceCoverage on a geometry of its own that shares the source buffers (3f COVERAGE_INSTANCED)', () => {
  const src = new THREE.BoxGeometry(), inst = createInstances({ geometry: src, material: mat, max: 3, coverage: true }), g = inst.mesh.geometry;
  assert.notEqual(g, src); assert.equal(src.attributes.instanceCoverage, undefined); // the template never sees it
  assert.equal(g.attributes.position, src.attributes.position); assert.equal(g.index, src.index);
  assert.equal(inst.coverage, g.attributes.instanceCoverage); assert.equal(inst.coverage.itemSize, 4); assert.equal(inst.coverage.isInstancedBufferAttribute, true);
  const v = inst.coverage.version; inst.cover(1, 0.5, 0, 0.25, 1); inst.commit();
  assert.deepEqual([...inst.coverage.array.slice(4, 8)], [0.5, 0, 0.25, 1]); assert.equal(inst.coverage.version, v + 1);
  inst.copy(1, 0); assert.deepEqual([...inst.coverage.array.slice(0, 4)], [0.5, 0, 0.25, 1]);
  assert.throws(() => createInstances({ geometry: geo, material: mat, max: 1 }).cover(0, 1, 0, 0, 0), /cover\(\) needs coverage: true/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND`. `UNIT test/sync-instances.test.mjs`

- [ ] **Step 3: Implement**

`src/view/instancing/instances.js`:

```js
// One InstancedMesh with a live count (overview §4.9). set(i, p, q, s) composes instance i (s a number or { x, y, z }),
// setMatrix(i, m) copies a Matrix4, color(i, c) sets its instance colour (a CSS string, a hex number or a THREE.Color), copy(from,
// to) moves an instance (swap-remove), commit() flags for upload only what changed. Frustum culling is off: instances spread over
// the whole map and the mesh's bounds would be its first instance's. With `colors` the colour buffer exists from the start, white.
// With `coverage` (3f's COVERAGE_INSTANCED materials) the mesh gets a per-instance vec4 `instanceCoverage` (dirt, rust, snow,
// mud; zero) written by cover(i, d, r, s, m). It lives on a geometry of the mesh's own that shares the source's attributes, so
// the template and plain clones never see it; that wrapper is not disposed (disposing it would free the shared buffers).
// Nothing is allocated after create (setting a colour from a CSS string parses it: do that at spawn, not per frame).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function createInstances({ geometry, material, max, castShadow = true, receiveShadow = true, colors = false, coverage = false } = {}) {
  if (!geometry?.isBufferGeometry) throw new Error('createInstances: geometry required');
  if (!material) throw new Error('createInstances: material required');
  if (!(Number.isInteger(max) && max >= 1)) throw new Error(`createInstances: max must be a whole number of at least 1 (got ${max})`);
  let geo = geometry, cov = null;
  if (coverage) {
    geo = new THREE.BufferGeometry(); geo.name = geometry.name;
    for (const k of Object.keys(geometry.attributes)) geo.setAttribute(k, geometry.attributes[k]);
    geo.setIndex(geometry.index); for (const g of geometry.groups) geo.addGroup(g.start, g.count, g.materialIndex);
    cov = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); cov.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceCoverage', cov);
  }
  const mesh = new THREE.InstancedMesh(geo, material, max);
  mesh.count = 0; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  let dirtyM = false, dirtyC = false, dirtyV = false;
  return {
    mesh, max, coverage: cov,
    get count() { return mesh.count; },
    set count(n) { if (!(Number.isInteger(n) && n >= 0 && n <= max)) throw new RangeError(`instances: count ${n} outside 0..${max}`); mesh.count = n; },
    set(i, p, q, s = 1) {
      _p.set(p.x, p.y, p.z); _q.set(q.x, q.y, q.z, q.w);
      if (typeof s === 'number') _s.setScalar(s); else _s.set(s.x, s.y, s.z);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s)); dirtyM = true;
    },
    setMatrix(i, m) { mesh.setMatrixAt(i, m); dirtyM = true; },
    getMatrix(i, out) { mesh.getMatrixAt(i, out); return out; },
    color(i, c) { mesh.setColorAt(i, c?.isColor ? c : _c.set(c)); dirtyC = true; },
    cover(i, d, r, s, m) {
      if (!cov) throw new Error('instances: cover() needs coverage: true');
      const a = cov.array, o = i * 4; a[o] = d; a[o + 1] = r; a[o + 2] = s; a[o + 3] = m; dirtyV = true;
    },
    copy(from, to) {
      const a = mesh.instanceMatrix.array; a.copyWithin(to * 16, from * 16, from * 16 + 16); dirtyM = true;
      if (mesh.instanceColor) { mesh.instanceColor.array.copyWithin(to * 3, from * 3, from * 3 + 3); dirtyC = true; }
      if (cov) { cov.array.copyWithin(to * 4, from * 4, from * 4 + 4); dirtyV = true; }
    },
    commit() {
      if (dirtyM) { mesh.instanceMatrix.needsUpdate = true; dirtyM = false; }
      if (dirtyC && mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; dirtyC = false; }
      if (dirtyV) { cov.needsUpdate = true; dirtyV = false; }
    },
    dispose() { mesh.removeFromParent(); mesh.dispose(); }, // geometry and material are shared: not disposed here
  };
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the dirty-only commit bites.** Change `if (dirtyM)` to `if (true)`: expect "commit uploads only what changed…" to fail. Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/instancing/instances.js test/sync-instances.test.mjs && git commit -m "feat(view): createInstances with live count, colours, instanceCoverage, swap copy and dirty-only upload"`

---

## Task 10: N-15 smoothing offsets

**Files:**
- Create: `src/view/sync/smooth.js`, `test/sync-smooth.test.mjs`

**Interfaces:**
- Consumes: `e.netFix = { seq, dp: [x, y, z], dq: [x, y, z, w] }` from 3i (§4.9/§4.11).
- Produces: `newOffset()`, `addFix(o, fix, smoothMs)`, `fade(o, dt)`, `applyOffset(o, p, q)`, `active(o)`.

**Decision (judgment):** `dq = q_old ⊗ q_new⁻¹` in the world frame, and the drawn rotation is `offset.q ⊗ q`. A new fix multiplies on the **right** (`offset ← offset ⊗ dq`), which keeps the drawn pose continuous when corrections stack. The fade is linear in view time from the latest correction (it restarts at each fix), with nlerp toward identity for the rotation. 3i must produce `dq` in this convention (Contract issue 2).

- [ ] **Step 1: Write the failing test**

`test/sync-smooth.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newOffset, addFix, fade, applyOffset, active } from '../src/view/sync/smooth.js';

const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const fixOf = (seq, oldP, oldQ, newP, newQ) => {
  const dq = oldQ.clone().multiply(newQ.clone().invert());
  return { seq, dp: [oldP.x - newP.x, oldP.y - newP.y, oldP.z - newP.z], dq: [dq.x, dq.y, dq.z, dq.w] };
};
const drawn = (o, p, q) => { const pp = p.clone(), qq = q.clone(); applyOffset(o, pp, qq); return [pp, qq]; };

test('3g: after a correction the drawn pose is the pose before it: never a jump (N-15)', () => {
  const o = newOffset(), oldP = new THREE.Vector3(5, 1, 2), newP = new THREE.Vector3(4, 1, 2.5), oldQ = E(0.2, 0.9, 0), newQ = E(0, 0.4, 0.1);
  addFix(o, fixOf(1, oldP, oldQ, newP, newQ), 150);
  const [p, q] = drawn(o, newP, newQ);
  assert.ok(p.distanceTo(oldP) < 1e-12); assert.ok(1 - Math.abs(q.dot(oldQ)) < 1e-12);
  assert.equal(o.seq, 1); assert.equal(active(o), true);
});
test('3g: corrections stack: a second jump while the first still shows keeps the drawn pose continuous (N-15)', () => {
  const o = newOffset(), A = new THREE.Vector3(0, 0, 0), B = new THREE.Vector3(1, 0, 0), C = new THREE.Vector3(1, 2, 0), qA = E(0.3, 0, 0), qB = E(0, 0.5, 0), qC = E(0, 0, 0.7);
  addFix(o, fixOf(1, A, qA, B, qB), 150); fade(o, 0.05);
  const [dp, dq] = drawn(o, B, qB); // what is on screen now
  addFix(o, fixOf(2, B, qB, C, qC), 150);
  const [p, q] = drawn(o, C, qC);
  assert.ok(p.distanceTo(dp) < 1e-12); assert.ok(1 - Math.abs(q.dot(dq)) < 1e-12); // rotations about different axes: the product order matters
});
test('3g: the offset fades linearly to nothing over smoothMs of view time from the latest correction (N-15)', () => {
  const o = newOffset(), yaw = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
  addFix(o, { seq: 1, dp: [1, 0, 0], dq: yaw(0.6) }, 150);
  fade(o, 0.05); assert.ok(Math.abs(o.px - 2 / 3) < 1e-12);
  fade(o, 0.05); assert.ok(Math.abs(o.px - 1 / 3) < 1e-12);
  assert.ok(Math.abs(2 * Math.acos(o.qw) - 0.2) < 0.01); // nlerp: about a third of 0.6 rad left
  fade(o, 0); assert.ok(Math.abs(o.px - 1 / 3) < 1e-12); // a render the driver did not start (dt 0) fades nothing
  fade(o, 0.06); assert.deepEqual([o.px, o.qx, o.qy, o.qz, o.qw, active(o)], [0, 0, 0, 0, 1, false]);
  const p = new THREE.Vector3(3, 0, 0), q = new THREE.Quaternion(); applyOffset(o, p, q); assert.equal(p.x, 3);
});
test('3g: smoothMs 0 clears the offset (no smoothing) but still records the seq (N-17)', () => {
  const o = newOffset(); addFix(o, { seq: 1, dp: [1, 0, 0], dq: [0, 0, 0, 1] }, 150);
  addFix(o, { seq: 2, dp: [1, 0, 0], dq: [0, 0, 0, 1] }, 0);
  assert.deepEqual([o.px, o.seq, active(o)], [0, 2, false]);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND`. `UNIT test/sync-smooth.test.mjs`

- [ ] **Step 3: Implement**

`src/view/sync/smooth.js`:

```js
// N-15 view smoothing (overview §4.9, with 3i). A correction's drawn-pose jump (e.netFix: dp = old - new position, dq = old (x)
// new^-1, world frame) is added to the entity's offset, which then fades linearly to nothing over smoothMs of view time from the
// latest correction. The drawn pose is p + offset.p and offset.q (x) q, so a correction never makes the mesh jump. An offset is a
// plain object of numbers made once per entity; nothing here allocates.
export const newOffset = () => ({ px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, left: 0, seq: -1 });
export const active = o => o.left > 0;
function zero(o) { o.px = o.py = o.pz = 0; o.qx = o.qy = o.qz = 0; o.qw = 1; o.left = 0; }

// fix = { seq, dp: [x, y, z], dq: [x, y, z, w] }; smoothMs <= 0 (or missing) means no smoothing: the offset is cleared
export function addFix(o, fix, smoothMs) {
  o.seq = fix.seq;
  if (!(smoothMs > 0)) { zero(o); return o; }
  const dp = fix.dp, dq = fix.dq;
  o.px += dp[0]; o.py += dp[1]; o.pz += dp[2];
  const ax = o.qx, ay = o.qy, az = o.qz, aw = o.qw, bx = dq[0], by = dq[1], bz = dq[2], bw = dq[3]; // o.q <- o.q (x) dq
  let x = aw * bx + ax * bw + ay * bz - az * by, y = aw * by - ax * bz + ay * bw + az * bx, z = aw * bz + ax * by - ay * bx + az * bw, w = aw * bw - ax * bx - ay * by - az * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; } // the short way round, so the fade never spins the long way
  const n = Math.hypot(x, y, z, w) || 1;
  o.qx = x / n; o.qy = y / n; o.qz = z / n; o.qw = w / n;
  o.left = smoothMs / 1000;
  return o;
}
export function fade(o, dt) {
  if (!(o.left > 0) || !(dt > 0)) return o;
  if (dt >= o.left) { zero(o); return o; }
  const f = 1 - dt / o.left; // linear in time: remaining / total stays on the line from the latest correction
  o.left -= dt; o.px *= f; o.py *= f; o.pz *= f;
  const x = o.qx * f, y = o.qy * f, z = o.qz * f, w = 1 - f + o.qw * f, n = Math.hypot(x, y, z, w) || 1; // nlerp from identity
  o.qx = x / n; o.qy = y / n; o.qz = z / n; o.qw = w / n;
  return o;
}
// p: { x, y, z } (a Vector3), q: a THREE.Quaternion (set once, so its onChange runs once)
export function applyOffset(o, p, q) {
  if (!(o.left > 0)) return;
  p.x += o.px; p.y += o.py; p.z += o.pz;
  const ax = o.qx, ay = o.qy, az = o.qz, aw = o.qw, bx = q.x, by = q.y, bz = q.z, bw = q.w; // q <- o.q (x) q
  q.set(aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz);
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the order test bites (RF1).** In `addFix`, swap the operands (`const bx = o.qx, by = o.qy, bz = o.qz, bw = o.qw, ax = dq[0], ay = dq[1], az = dq[2], aw = dq[3];`): expect "corrections stack…" to fail. Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/sync/smooth.js test/sync-smooth.test.mjs && git commit -m "feat(view): N-15 smoothing offsets that keep the drawn pose continuous across corrections"`

---

## Task 11: View sync: object draw, interpolation, hooks, World changes, shared clock

**Precondition:** 3e is merged into `phase-3`, and `phase-3` is merged into this worktree (constraints, "Prerequisites"). `src/view/render/hygiene.js` exports `instancedShadows` and `disposeTree`.

**Files:**
- Create: `test/helpers/fakeWorld.mjs`, `test/helpers/fakeAssets.mjs`, `test/helpers/alloc.mjs`, `test/helpers/syncSetup.mjs`, `test/sync.test.mjs`, `test/sync-hooks.test.mjs`
- Replace: `src/view/sync/index.js` (3e's stub)

**Interfaces:**
- Consumes:
  - `engine.world` (3c §4.4) with `serial`, `with('xf')` (live, spawn order), `xfPrev(e, out)` (out `{ p: {x,y,z}, q: {x,y,z,w} }`), `e.xf.p`/`e.xf.q` (curr), `e.model`, `e.draw`, `e.paint`, `e.scale`, `e.tags`, `e.net`;
  - `assets.clone(model, { paint })` (3f §4.7);
  - `compiler.time` (3f C3);
  - `disposeTree(obj, { keepShared: true })` (3e).
- Produces: `createViewSync(engine, { gfx, assets, compiler, view })` → `{ root, frame(alpha), objectOf(e), on(match, { create, frame, remove }) → off, dispose() }`. `view` (for `view.dt` and the hook argument), `root` and `dispose` are additions (Contract issue 1). Draw `'instanced'` throws "not built yet" until Task 12.

**Decisions to confirm in review (judgment):**
- Entities come from `world.with('xf')`, every entity with a pool slot. The overview does not say that `xf` is a queryable part; Task 14 proves it on the real World (Contract issue 1).
- An undrawn entity's `create` may return an Object3D, which sync poses and takes out of the scene. Disposing it is the hook's job.
- `off()` stops future calls. It does not remove objects already made.

- [ ] **Step 1: Write the helpers and the failing tests**

`test/helpers/fakeWorld.mjs`:

```js
// A stand-in for 3c's World (overview §4.4) with only what view sync reads: with('xf') (live, spawn order), xfPrev(e, out),
// e.xf.p / e.xf.q (curr), serial and net.tunables. move() writes curr, step() copies curr -> prev (lh.world.swap), place()
// writes both (no smear), clear() empties it and changes serial. Prev poses are kept by id.
let SERIAL = 0;
export function fakeWorld() {
  const list = [], prev = new Map();
  let nextId = 1;
  const copy = (from, to) => { to.p.x = from.p.x; to.p.y = from.p.y; to.p.z = from.p.z; to.q.x = from.q.x; to.q.y = from.q.y; to.q.z = from.q.z; to.q.w = from.q.w; return to; };
  const w = {
    serial: ++SERIAL, net: { tunables: {} },
    with(...parts) { if (parts.length !== 1 || parts[0] !== 'xf') throw new Error(`fakeWorld: with(${parts.join(', ')}) is not faked`); return list; },
    spawn({ at = [0, 0, 0], q = [0, 0, 0, 1], tags = [], ...rest } = {}) {
      const e = { id: nextId++, tags: new Set(tags), ...rest, xf: { p: { x: at[0], y: at[1], z: at[2] }, q: { x: q[0], y: q[1], z: q[2], w: q[3] } } };
      prev.set(e.id, copy(e.xf, { p: {}, q: {} })); list.push(e); return e;
    },
    despawn(e) { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); prev.delete(e.id); },
    move(e, at, q) { e.xf.p.x = at[0]; e.xf.p.y = at[1]; e.xf.p.z = at[2]; if (q) { e.xf.q.x = q[0]; e.xf.q.y = q[1]; e.xf.q.z = q[2]; e.xf.q.w = q[3]; } },
    place(e, at, q) { w.move(e, at, q); copy(e.xf, prev.get(e.id)); },
    step() { for (let i = 0; i < list.length; i++) copy(list[i].xf, prev.get(list[i].id)); },
    clear() { list.length = 0; prev.clear(); nextId = 1; w.serial = ++SERIAL; },
    xfPrev(e, out) { return copy(prev.get(e.id), out); },
  };
  return w;
}
```

`test/helpers/fakeAssets.mjs`:

```js
// Box-mesh stand-ins for 3f's assets and material compiler (overview §4.7, §4.8), so view sync is tested before 3f merges.
// models = { key: [{ name, material, p?: [x, y, z], skinned? }] }: each model is a Group named key of part meshes (one shared
// BoxGeometry per part) whose materials are named by registry id or paint-<slot>. compiler.apply swaps each mesh's material for
// a cached MeshLambertMaterial per (name, instanced); paint-<slot> becomes a painted clone on plain meshes and 'steel' when
// instanced (the colour then goes per instance). A material named in `covered` stands for one with a coverage block: with
// { instanced, coverage } it compiles to a variant with defines.COVERAGE_INSTANCED (3f's shared variant). compiler.time is
// 3f's shared clock { value }. assets.clone and compiler.apply calls are logged.
import * as THREE from 'three';

export function fakeAssets(models = { crate: [{ name: 'body', material: 'wood' }] }, { covered = ['mud'] } = {}) {
  const log = [], mats = new Map(), templates = new Map();
  const mat = (name, instanced, cov = false) => {
    const k = `${name}|${instanced}|${cov}`; let m = mats.get(k);
    if (!m) { m = new THREE.MeshLambertMaterial(); m.name = name; m.userData.instanced = instanced; if (cov) m.defines = { COVERAGE: '', COVERAGE_INSTANCED: '' }; mats.set(k, m); }
    return m;
  };
  const compiler = {
    time: { value: 0 },
    get(id, { instanced = false } = {}) { log.push(['get', id, instanced]); return mat(id, instanced); },
    apply(root, { instanced = false, paint, coverage = false } = {}) {
      log.push(['apply', root.name, instanced]);
      root.traverse(o => {
        if (!o.isMesh) return;
        const n = o.material.name, slot = n.startsWith('paint-') ? n.slice(6) : null;
        if (slot && !instanced) { const m = mat(n, false).clone(); m.color.set(paint?.[slot] ?? '#ffffff'); o.material = m; }
        else o.material = mat(slot ? 'steel' : n, instanced, instanced && coverage && covered.includes(n));
      });
      return root;
    },
  };
  for (const [key, parts] of Object.entries(models)) {
    const g = new THREE.Group(); g.name = key;
    for (const { name, material, p = [0, 0, 0], skinned = false } of parts) {
      const geo = new THREE.BoxGeometry(), m = new THREE.MeshBasicMaterial(); m.name = material;
      const mesh = skinned ? new THREE.SkinnedMesh(geo, m) : new THREE.Mesh(geo, m);
      mesh.name = name; mesh.position.fromArray(p); g.add(mesh);
    }
    templates.set(key, g);
  }
  const tpl = key => { const t = templates.get(key); if (!t) throw new Error(`fakeAssets: '${key}' is not preloaded`); return t; };
  const assets = {
    has: key => templates.has(key),
    get: key => ({ scene: tpl(key), clips: [], anim: null, sockets: {} }),
    clone(key, opts = {}) { log.push(['clone', key, opts]); const c = tpl(key).clone(true); compiler.apply(c, { instanced: !!opts.instanced, paint: opts.paint }); return c; },
  };
  return { assets, compiler, log };
}
```

`test/helpers/alloc.mjs`:

```js
// Allocation probes for view code (R-8): three.js id counters (any new Object3D, Material or BufferGeometry moves them; each
// threeIds() call itself makes one of each) and retained heap after forced GCs, measured after `warm` runs so the JIT's own
// code and feedback do not count. Short-lived garbage is not caught here.
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
export const threeIds = () => ({ object: new THREE.Object3D().id, material: new THREE.Material().id, geometry: new THREE.BufferGeometry().id });
export function retained(fn, n, warm = 2000) {
  for (let i = 0; i < warm; i++) fn();
  gc(); gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) fn();
  gc(); gc();
  return process.memoryUsage().heapUsed - before;
}
```

`test/helpers/syncSetup.mjs`:

```js
// View sync on a fake World, box-mesh assets and a fresh scene (test/sync*.test.mjs). engine.world may be swapped by tests.
import * as THREE from 'three';
import { createViewSync } from '../../src/view/sync/index.js';
import { fakeWorld } from './fakeWorld.mjs';
import { fakeAssets } from './fakeAssets.mjs';

export function syncSetup(models) {
  const world = fakeWorld(), engine = { world }, gfx = { scene: new THREE.Scene() }, fa = fakeAssets(models), view = { dt: 1 / 60 };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view });
  return { world, engine, gfx, view, sync, ...fa };
}
```

`test/sync.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createViewSync } from '../src/view/sync/index.js';
import { syncSetup } from './helpers/syncSetup.mjs';
import { fakeWorld } from './helpers/fakeWorld.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';

const clones = s => s.log.filter(l => l[0] === 'clone');
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

test('3g: a drawn entity gets assets.clone(model, { paint }) under the sync root on the next frame, and goes after despawn (E-6)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', paint: { body: '#c33' } });
  assert.equal(s.sync.root.parent, s.gfx.scene); assert.equal(s.sync.root.name, 'lh.sync'); assert.equal(s.sync.root.children.length, 0);
  s.sync.frame(1);
  const obj = s.sync.objectOf(e); assert.equal(obj.parent, s.sync.root); assert.equal(obj.name, 'crate');
  assert.deepEqual(clones(s), [['clone', 'crate', { paint: { body: '#c33' } }]]);
  s.sync.frame(1); assert.equal(clones(s).length, 1); // made once
  s.world.despawn(e); s.sync.frame(1);
  assert.equal(s.sync.objectOf(e), undefined); assert.equal(obj.parent, null); assert.equal(s.sync.root.children.length, 0);
});
test('3g: the pose is lerp(prev, curr, alpha) with a normalised nlerp rotation, scaled by e.scale (E-11)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', scale: 0.62 }), q1 = yaw(Math.PI / 2);
  s.world.move(e, [2, 4, -6], [q1.x, q1.y, q1.z, q1.w]); // curr moved; prev is still the spawn pose
  s.sync.frame(0.25); const o = s.sync.objectOf(e);
  assert.ok(o.position.distanceTo(new THREE.Vector3(0.5, 1, -1.5)) < 1e-12);
  const want = new THREE.Quaternion(0.25 * q1.x, 0.25 * q1.y, 0.25 * q1.z, 0.75 + 0.25 * q1.w).normalize();
  assert.ok(1 - Math.abs(o.quaternion.dot(want)) < 1e-12); assert.ok(Math.abs(o.quaternion.length() - 1) < 1e-12);
  assert.ok(o.scale.equals(new THREE.Vector3(0.62, 0.62, 0.62)));
  s.sync.frame(1); assert.ok(o.position.distanceTo(new THREE.Vector3(2, 4, -6)) < 1e-12);
  s.world.step(); s.sync.frame(0); assert.ok(o.position.distanceTo(new THREE.Vector3(2, 4, -6)) < 1e-12); // prev caught up
});
test('3g: q and -q are one rotation: interpolation takes the short arc (E-11)', () => {
  const s = syncSetup(), a = yaw(0.2), b = yaw(0.4), e = s.world.spawn({ model: 'crate', q: [a.x, a.y, a.z, a.w] });
  s.world.move(e, [0, 0, 0], [-b.x, -b.y, -b.z, -b.w]); // the same rotation as b, stored negated
  s.sync.frame(0.5); assert.ok(1 - Math.abs(s.sync.objectOf(e).quaternion.dot(yaw(0.3))) < 1e-12); // nlerp = slerp at the midpoint
});
test('3g: a new World or a world.serial change drops every object; no World draws nothing (S-3)', () => {
  const s = syncSetup(); s.world.spawn({ model: 'crate' }); s.world.spawn({ model: 'crate' });
  s.sync.frame(1); assert.equal(s.sync.root.children.length, 2);
  const first = s.sync.root.children[0];
  s.world.clear(); s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); assert.equal(first.parent, null);
  const e = s.world.spawn({ model: 'crate' }); s.sync.frame(1); assert.equal(s.sync.root.children.length, 1); assert.equal(e.id, 1);
  assert.notEqual(s.sync.objectOf(e), first);
  s.engine.world = undefined; s.sync.frame(1); assert.equal(s.sync.root.children.length, 0);
  const w2 = fakeWorld(); w2.spawn({ model: 'crate' }); s.engine.world = w2; s.sync.frame(1); assert.equal(s.sync.root.children.length, 1);
});
test('3g: an entity object replaced under the same id gets a fresh Object3D (E-6)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate' }); s.sync.frame(1); const o = s.sync.objectOf(e);
  const twin = { ...e }; s.world.with('xf')[0] = twin; // same id, new object: a rebuilt entity
  s.sync.frame(1);
  assert.notEqual(s.sync.objectOf(twin), o); assert.equal(o.parent, null); assert.equal(s.sync.objectOf(e), undefined);
});
test('3g: draw: false and model-less entities are not drawn; a bad draw value or missing assets throw (E-6)', () => {
  const s = syncSetup(), a = s.world.spawn({ model: 'crate', draw: false }), b = s.world.spawn({ tags: ['marker'] });
  s.sync.frame(1); assert.equal(s.sync.objectOf(a), undefined); assert.equal(s.sync.objectOf(b), undefined); assert.equal(s.sync.root.children.length, 0);
  s.world.spawn({ model: 'crate', draw: 'sprite' });
  assert.throws(() => s.sync.frame(1), /^Error: sync: entity 3 has draw "sprite" \(use 'object', 'instanced' or false\)$/);
  const w = fakeWorld(), bare = createViewSync({ world: w }, { gfx: { scene: new THREE.Scene() } }); w.spawn({ model: 'crate' });
  assert.throws(() => bare.frame(1), /sync: entity 1 \(model 'crate'\) is drawn but the view has no assets/);
  assert.throws(() => createViewSync({}, {}), /gfx\.scene required/);
});
test('3g: frames make no three objects and retain nothing: 10000 frames of 50 moving entities (R-8)', () => {
  const s = syncSetup(), es = [];
  for (let i = 0; i < 50; i++) es.push(s.world.spawn({ model: 'crate', at: [i, 0, 0] }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (let i = 0; i < es.length; i++) es[i].xf.p.y = Math.sin(t + i); s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
test('3g: dispose drops everything and takes the root out of the scene; frames after it do nothing', () => {
  const s = syncSetup(); s.world.spawn({ model: 'crate' }); s.sync.frame(1);
  s.sync.dispose(); assert.equal(s.sync.root.parent, null); assert.equal(s.sync.root.children.length, 0);
  s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); s.sync.dispose();
});
test('3g: each frame advances the compiler\'s shared clock by view.dt, World or not (3f WIND)', () => {
  const s = syncSetup(); s.view.dt = 0.25; s.sync.frame(1); s.sync.frame(1); assert.equal(s.compiler.time.value, 0.5);
  s.engine.world = undefined; s.view.dt = 0; s.sync.frame(1); s.view.dt = 0.5; s.sync.frame(1); assert.equal(s.compiler.time.value, 1);
});
```

`test/sync-hooks.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';

const MODELS = { crate: [{ name: 'body', material: 'wood' }], barrel: [{ name: 'body', material: 'wood' }] };

test('3g: on("#tag" | "model:" | "net:" | fn): create once, frame after the pose, remove on despawn, in registration order (§4.9)', () => {
  const s = syncSetup(MODELS), log = [];
  const hook = name => ({
    create: (e, obj, v) => log.push([name, 'create', e.id, obj?.name ?? null, v === s.view]),
    frame: (e, obj, a, v) => log.push([name, 'frame', e.id, a, obj.position.x, v === s.view]),
    remove: (e, obj) => log.push([name, 'remove', e.id, obj.parent === s.sync.root]),
  });
  s.sync.on('#pig', hook('tag')); s.sync.on('model:crate', hook('model')); s.sync.on('net:train', hook('net')); s.sync.on(e => e.id === 2, hook('fn'));
  const a = s.world.spawn({ model: 'crate', tags: ['pig'] }); s.world.spawn({ model: 'barrel', net: 'train' });
  s.world.move(a, [3, 0, 0]); s.sync.frame(1);
  assert.deepEqual(log.splice(0), [
    ['tag', 'create', 1, 'crate', true], ['model', 'create', 1, 'crate', true], ['tag', 'frame', 1, 1, 3, true], ['model', 'frame', 1, 1, 3, true],
    ['net', 'create', 2, 'barrel', true], ['fn', 'create', 2, 'barrel', true], ['net', 'frame', 2, 1, 0, true], ['fn', 'frame', 2, 1, 0, true],
  ]);
  s.world.despawn(a); s.sync.frame(0.5);
  assert.deepEqual(log.splice(0), [['net', 'frame', 2, 0.5, 0, true], ['fn', 'frame', 2, 0.5, 0, true], ['tag', 'remove', 1, true], ['model', 'remove', 1, true]]);
  s.world.clear(); s.sync.frame(1);
  assert.deepEqual(log.splice(0), [['net', 'remove', 2, true], ['fn', 'remove', 2, true]]); // a new World removes through the hooks too
});
test('3g: an undrawn entity\'s create may return an Object3D: sync poses it and takes it out on removal (§4.9)', () => {
  const s = syncSetup(); let made = null, gone = null;
  s.sync.on('#marker', { create: () => (made = new THREE.Object3D()), remove: (e, obj) => { gone = obj; } });
  const e = s.world.spawn({ tags: ['marker'] }); s.world.move(e, [4, 0, 0]); s.sync.frame(0.5);
  assert.equal(s.sync.objectOf(e), made); assert.equal(made.parent, s.sync.root); assert.equal(made.position.x, 2);
  s.world.despawn(e); s.sync.frame(1); assert.equal(made.parent, null); assert.equal(gone, made);
});
test('3g: a hook added later meets existing entities on the next frame; off() stops it; a bad match throws (§4.9)', () => {
  const s = syncSetup(), log = []; s.world.spawn({ model: 'crate', tags: ['pig'] }); s.sync.frame(1);
  const off = s.sync.on('#pig', { create: x => log.push(['create', x.id]), frame: x => log.push(['frame', x.id]) });
  s.sync.frame(1); assert.deepEqual(log.splice(0), [['create', 1], ['frame', 1]]);
  s.sync.frame(1); assert.deepEqual(log.splice(0), [['frame', 1]]); // create only once
  off(); s.sync.frame(1); assert.deepEqual(log, []);
  for (const bad of ['pig', '#', 'model:', 'net:', 3, null]) assert.throws(() => s.sync.on(bad, {}), /sync: bad match/);
});
```

- [ ] **Step 2: Run; expect FAIL.** `UNIT test/sync.test.mjs test/sync-hooks.test.mjs`. 3e's stub draws nothing, so "a drawn entity gets assets.clone…" fails (`s.sync.root` is undefined).

- [ ] **Step 3: Implement**

`src/view/sync/index.js` (replace the whole file):

```js
// View sync (E-6, E-11, N-15; overview §4.9): every frame, World entities -> Object3Ds under one root group in gfx.scene.
// - Drawn entities (`model`, draw !== false) get assets.clone(model, { paint }) (draw 'object', the default; 'instanced'
//   comes in the next task).
// - The pose is lerp(prev, curr, alpha) and a normalised nlerp on the short arc (prev from world.xfPrev, curr from e.xf), times
//   e.scale.
// - on(match, { create, frame, remove }) decorates matching entities ('#tag', 'model:<key>', 'net:<kind>' or a predicate), in
//   registration order: create(e, obj, view) once (an undrawn entity's create may return an Object3D, which sync then poses
//   and takes out of the scene on removal; disposing it is the hook's job), frame(e, obj, alpha, view) after the pose, and
//   remove(e, obj) before the object goes. obj is null for instanced and undrawn entities. off() stops the calls.
// - A new World (engine.world replaced, or world.serial changed by clear()) drops every object (S-3).
// - Each frame first advances the compiler's shared clock (compiler.time.value += view.dt, 3f's WIND), with or without a World.
// Entities are taken from world.with('xf') in spawn order. Nothing is allocated per frame: records are made when an entity
// first appears (a Map by id and an array), and the math objects are module-level.
import * as THREE from 'three';
import { disposeTree } from '../render/hygiene.js';

const _prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

function matcher(m) {
  if (typeof m === 'function') return m;
  if (typeof m === 'string') {
    if (m.length > 1 && m[0] === '#') { const tag = m.slice(1); return e => !!e.tags?.has?.(tag); }
    if (m.length > 6 && m.startsWith('model:')) { const key = m.slice(6); return e => e.model === key; }
    if (m.length > 4 && m.startsWith('net:')) { const kind = m.slice(4); return e => e.net === kind; }
  }
  throw new Error(`sync: bad match ${typeof m === 'string' ? `'${m}'` : String(m)} (use '#tag', 'model:<key>', 'net:<kind>' or a function)`);
}

export function createViewSync(engine, { gfx, assets = null, compiler = null, view = { dt: 0 } } = {}) {
  if (!engine) throw new Error('createViewSync: engine required');
  if (!gfx?.scene?.isObject3D) throw new Error('createViewSync: gfx.scene required');
  const root = new THREE.Group(); root.name = 'lh.sync'; gfx.scene.add(root);
  const recs = [], byId = new Map(), hooks = [];
  let world, serial = -1, frame = 0, hookVer = 0, disposed = false;

  function add(e) {
    const r = { e, id: e.id, obj: null, own: false, seen: 0, hooks: [], hv: -1, at: recs.length };
    if (e.model != null && e.draw !== false) {
      if (e.draw !== undefined && e.draw !== 'object' && e.draw !== 'instanced') throw new Error(`sync: entity ${e.id} has draw ${JSON.stringify(e.draw)} (use 'object', 'instanced' or false)`);
      if (!assets) throw new Error(`sync: entity ${e.id} (model '${e.model}') is drawn but the view has no assets`);
      if (e.draw === 'instanced') throw new Error(`sync: entity ${e.id}: draw 'instanced' is not built yet (Task 12)`);
      r.obj = assets.clone(e.model, { paint: e.paint }); if (!r.obj.name) r.obj.name = `${e.model}#${e.id}`; r.own = true; root.add(r.obj);
    }
    recs.push(r); byId.set(e.id, r);
    rematch(r);
    return r;
  }
  function rematch(r) { // hooks matched against this entity; create for each newly matching one
    const was = r.hooks; r.hooks = []; r.hv = hookVer;
    for (const h of hooks) {
      if (!h.test(r.e)) continue;
      r.hooks.push(h);
      if (was.includes(h) || !h.create) continue;
      const out = h.create(r.e, r.obj, view);
      if (out?.isObject3D && !r.obj) { r.obj = out; r.own = false; root.add(out); }
    }
  }
  function remove(r) {
    for (const h of r.hooks) h.remove?.(r.e, r.obj);
    if (r.obj) { r.obj.removeFromParent(); if (r.own) disposeTree(r.obj, { keepShared: true }); }
    byId.delete(r.id);
    const last = recs.pop(); if (last !== r) { recs[r.at] = last; last.at = r.at; }
  }
  function dropAll() {
    for (let n = recs.length - 1; n >= 0; n--) remove(recs[n]);
  }
  function pose(r, a) {
    const e = r.e, c = e.xf;
    world.xfPrev(e, _prev);
    const pp = _prev.p, pq = _prev.q, cp = c.p, cq = c.q;
    _p.set(pp.x + (cp.x - pp.x) * a, pp.y + (cp.y - pp.y) * a, pp.z + (cp.z - pp.z) * a);
    let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
    if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // q and -q: take the short arc
    _q.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
    const s = e.scale ?? 1;
    if (r.obj) { r.obj.position.copy(_p); r.obj.quaternion.copy(_q); r.obj.scale.setScalar(s); }
  }
  const sync = {
    root,
    frame(alpha) {
      if (disposed) return;
      if (compiler?.time) compiler.time.value += view.dt || 0; // 3f's shared WIND clock, once per frame
      const w = engine.world;
      if (w !== world || (w && w.serial !== serial)) { dropAll(); world = w; serial = w ? w.serial : -1; }
      if (!w) return;
      frame++;
      const list = w.with('xf');
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        let r = byId.get(e.id);
        if (r && r.e !== e) { remove(r); r = undefined; } // a rebuilt entity under the same id
        if (!r) r = add(e);
        r.seen = frame;
        if (r.hv !== hookVer) rematch(r);
        pose(r, alpha);
        const hs = r.hooks;
        for (let k = 0; k < hs.length; k++) hs[k].frame?.(e, r.obj, alpha, view);
      }
      for (let n = recs.length - 1; n >= 0; n--) if (recs[n].seen !== frame) remove(recs[n]); // despawned
    },
    objectOf(e) { const r = byId.get(e.id); return r && r.e === e && r.obj ? r.obj : undefined; },
    on(match, h = {}) {
      const hook = { test: matcher(match), create: h.create, frame: h.frame, remove: h.remove };
      hooks.push(hook); hookVer++;
      return () => { const i = hooks.indexOf(hook); if (i >= 0) { hooks.splice(i, 1); hookVer++; } };
    },
    dispose() { if (disposed) return; dropAll(); hooks.length = 0; root.removeFromParent(); disposed = true; },
  };
  return sync;
}
```

- [ ] **Step 4: Run; expect PASS** (12 tests).

- [ ] **Step 5: Prove the subtle tests bite.**
  - RF2: change `if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0)` to `if (false)`: expect "q and -q are one rotation…" to fail. Restore.
  - RF5: change `if (r && r.e !== e)` to `if (r)`: expect "frames make no three objects…" to fail (a clone per entity per frame). Restore.
  - Change `if (r.hv !== hookVer) rematch(r);` to nothing: expect "a hook added later…" to fail. Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/sync/index.js test/helpers/fakeWorld.mjs test/helpers/fakeAssets.mjs test/helpers/alloc.mjs test/helpers/syncSetup.mjs test/sync.test.mjs test/sync-hooks.test.mjs && git commit -m "feat(view): view sync draws World entities with interpolation, hooks and World changes (E-6, E-11, S-3)"`

---

## Task 12: View sync: instanced entity groups, paint, coverage, static props

**Files:**
- Create: `test/sync-instanced.test.mjs`
- Modify: `src/view/sync/index.js` (full content below)

**Interfaces:**
- Consumes:
  - Task 9's `createInstances`;
  - `assets.get(model).scene` (3f);
  - `compiler.apply(holder, { instanced: true, coverage: true })` and `material.defines.COVERAGE_INSTANCED` (3f C6);
  - `instancedShadows(mesh)` (3e);
  - `e.coverage = { dirt, rust, snow, mud }` (3h's coverage kit; missing fields are 0).
- Produces: `draw: 'instanced'`. One instanced mesh per (model, part), named `<model>:<part>`. It starts at 16 and doubles. A removed slot takes the last one. Paint is per-instance colour. `instanceCoverage` is written only when `e.coverage` changes. Static entities are not rewritten. Skinned models throw.

**Decision (judgment):** sync writes `instanceCoverage` itself from `e.coverage`, since only sync knows the slots. 3h's `coverageView` keeps feeding `uCoverage` for object-drawn entities (Contract issue 4).

- [ ] **Step 1: Write the failing test**

`test/sync-instanced.test.mjs` (`customDepthMaterial` is the mark of 3e's `instancedShadows`, ported from Tractor's `shadows.js`; if 3e's port marks something else, assert that instead and note it):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';

const CRATE = { crate: [{ name: 'body', material: 'wood' }, { name: 'lid', material: 'paint-body', p: [0, 0.5, 0] }] };
const at = (mesh, i) => new THREE.Vector3().setFromMatrixPosition((() => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; })());
const near = (v, x, y, z) => v.distanceTo(new THREE.Vector3(x, y, z)) < 1e-6;

test('3g: draw "instanced" joins one InstancedMesh per (model, part), with the part offset and paint as instance colour (§4.9)', () => {
  const s = syncSetup(CRATE), a = s.world.spawn({ model: 'crate', draw: 'instanced', at: [1, 0, 0] });
  s.world.spawn({ model: 'crate', draw: 'instanced', at: [5, 0, 0], paint: { body: '#ff0000' } });
  s.sync.frame(1);
  const [body, lid] = s.sync.root.children;
  assert.deepEqual(s.sync.root.children.map(m => [m.name, m.isInstancedMesh, m.count]), [['crate:body', true, 2], ['crate:lid', true, 2]]);
  assert.equal(s.sync.objectOf(a), undefined);
  assert.ok(near(at(lid, 1), 5, 0.5, 0)); assert.ok(near(at(body, 0), 1, 0, 0));
  assert.deepEqual([...lid.instanceColor.array.slice(3, 6)], [1, 0, 0]); assert.deepEqual([...lid.instanceColor.array.slice(0, 3)], [1, 1, 1]);
  assert.equal(body.instanceColor, null); // no paint slot on the body
  assert.equal(lid.material.userData.instanced, true); assert.equal(lid.material.name, 'steel'); // compiled for instancing
  assert.equal(body.customDepthMaterial?.isMeshDepthMaterial, true); // 3e's instancedShadows (Tractor's shadows.js) ran
  assert.deepEqual(s.log.filter(l => l[0] === 'clone'), []); // never cloned
});
test('3g: despawning the middle instance moves the last one into its slot, matrix and colour (§4.9)', () => {
  const s = syncSetup(CRATE), es = ['#ff0000', '#00ff00', '#0000ff'].map((c, i) => s.world.spawn({ model: 'crate', draw: 'instanced', at: [i * 10, 0, 0], paint: { body: c } }));
  s.sync.frame(1); s.world.despawn(es[1]); s.sync.frame(1);
  const [body, lid] = s.sync.root.children; assert.equal(body.count, 2); assert.equal(lid.count, 2);
  assert.ok(near(at(body, 1), 20, 0, 0)); assert.deepEqual([...lid.instanceColor.array.slice(3, 6)], [0, 0, 1]);
  s.world.move(es[2], [30, 0, 0]); s.sync.frame(1); assert.ok(near(at(body, 1), 30, 0, 0)); // the moved one writes its new slot
  s.world.despawn(es[0]); s.world.despawn(es[2]); s.sync.frame(1); assert.equal(body.count, 0);
});
test('3g: past 16 instances the mesh doubles (the old one disposed), keeping every matrix; a new World disposes them all', () => {
  const s = syncSetup(CRATE); for (let i = 0; i < 10; i++) s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] });
  s.sync.frame(1); const first = s.sync.root.children[0]; let disposed = 0; first.addEventListener('dispose', () => disposed++);
  for (let i = 10; i < 40; i++) s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] });
  s.sync.frame(1);
  const [body] = s.sync.root.children; assert.equal(s.sync.root.children.length, 2); assert.equal(body.count, 40); assert.equal(body.instanceMatrix.count, 64);
  assert.equal(first.parent, null); assert.equal(disposed, 1);
  for (const i of [0, 9, 15, 16, 39]) assert.ok(near(at(body, i), i, 0, 0), `instance ${i}`);
  let gone = 0; for (const m of s.sync.root.children) m.addEventListener('dispose', () => gone++);
  s.world.clear(); s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); assert.equal(gone, 2);
});
test('3g: instanced entities that did not move are not re-uploaded (R1: static props cost nothing per frame)', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' }); s.world.spawn({ model: 'crate', draw: 'instanced', at: [3, 0, 0] });
  s.sync.frame(1); const body = s.sync.root.children[0], v = body.instanceMatrix.version;
  s.sync.frame(0.3); s.sync.frame(0.7); assert.equal(body.instanceMatrix.version, v);
  s.world.move(e, [1, 0, 0]); s.sync.frame(0.5); assert.equal(body.instanceMatrix.version, v + 1); assert.ok(near(at(body, 0), 0.5, 0, 0));
  e.scale = 2; s.world.step(); s.sync.frame(1); s.sync.frame(1); assert.equal(body.instanceMatrix.version, v + 2); // a scale change is written once
});
test('3g: a skinned model cannot be instanced; instanced frames make no three objects and retain nothing (R-8)', () => {
  const k = syncSetup({ pig: [{ name: 'body', material: 'pet', skinned: true }] }); k.world.spawn({ model: 'pig', draw: 'instanced' });
  assert.throws(() => k.sync.frame(1), /sync: model 'pig' is skinned; draw it as 'object' or with createCrowd/);
  const s = syncSetup(CRATE), es = [];
  for (let i = 0; i < 50; i++) es.push(s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (let i = 0; i < es.length; i += 2) es[i].xf.p.y = Math.sin(t + i); s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
test('3g: a coverage material instanced gets instanceCoverage from e.coverage, written only when it changes (3f C6, 3h)', () => {
  const s = syncSetup({ pig: [{ name: 'body', material: 'mud' }, { name: 'hat', material: 'wood' }] });
  const e = s.world.spawn({ model: 'pig', draw: 'instanced', coverage: { dirt: 0.5, mud: 0.25 } }); s.world.spawn({ model: 'pig', draw: 'instanced' });
  s.sync.frame(1);
  const [body, hat] = s.sync.root.children, cov = body.geometry.attributes.instanceCoverage;
  assert.equal(body.material.defines.COVERAGE_INSTANCED, ''); assert.equal(hat.geometry.attributes.instanceCoverage, undefined);
  assert.deepEqual([...cov.array.slice(0, 8)], [0.5, 0, 0, 0.25, 0, 0, 0, 0]);
  const v = cov.version; s.sync.frame(1); assert.equal(cov.version, v); // unchanged: no upload
  e.coverage.snow = 0.75; s.sync.frame(1); assert.equal(cov.version, v + 1); assert.deepEqual([...cov.array.slice(0, 4)], [0.5, 0, 0.75, 0.25]);
  for (let i = 0; i < 20; i++) s.world.spawn({ model: 'pig', draw: 'instanced', coverage: { rust: 1 } });
  s.sync.frame(1); const grown = s.sync.root.children[0].geometry.attributes.instanceCoverage; // past 16: the mesh doubled
  assert.deepEqual([...grown.array.slice(0, 4)], [0.5, 0, 0.75, 0.25]); assert.deepEqual([...grown.array.slice(84, 88)], [0, 1, 0, 0]);
});
```

- [ ] **Step 2: Run; expect FAIL** with `sync: entity 1: draw 'instanced' is not built yet (Task 12)`. `UNIT test/sync-instanced.test.mjs`

- [ ] **Step 3: Implement**

`src/view/sync/index.js` (replace the whole file):

```js
// View sync (E-6, E-11, N-15; overview §4.9): every frame, World entities -> Object3Ds under one root group in gfx.scene.
// - Drawn entities (`model`, draw !== false) get assets.clone(model, { paint }) (draw 'object', the default) or a slot in one
//   createInstances per (model, part) (draw 'instanced', compiled for instancing, instancedShadows, paint-<slot> parts coloured
//   per instance from e.paint). Instanced meshes double when full; a removed slot takes the last one (swap-remove). A part
//   whose instanced material has COVERAGE_INSTANCED (3f) gets instanceCoverage, written from e.coverage { dirt, rust, snow,
//   mud } when it changes (3h's coverage kit fills e.coverage; its coverageView feeds the object-drawn entities).
// - The pose is lerp(prev, curr, alpha) and a normalised nlerp on the short arc (prev from world.xfPrev, curr from e.xf), times
//   e.scale. Instanced entities that did not move are not rewritten, so static props cost no upload.
// - on(match, { create, frame, remove }) decorates matching entities ('#tag', 'model:<key>', 'net:<kind>' or a predicate), in
//   registration order: create(e, obj, view) once (an undrawn entity's create may return an Object3D, which sync then poses
//   and takes out of the scene on removal; disposing it is the hook's job), frame(e, obj, alpha, view) after the pose, and
//   remove(e, obj) before the object goes. obj is null for instanced and undrawn entities. off() stops the calls.
// - A new World (engine.world replaced, or world.serial changed by clear()) drops every object and instanced mesh (S-3).
// - Each frame first advances the compiler's shared clock (compiler.time.value += view.dt, 3f's WIND), with or without a World.
// Entities are taken from world.with('xf') in spawn order. Nothing is allocated per frame: records are made when an entity
// first appears (a Map by id and an array), and the math objects are module-level.
import * as THREE from 'three';
import { instancedShadows, disposeTree } from '../render/hygiene.js';
import { createInstances } from '../instancing/instances.js';

const START_MAX = 16;  // instances per (model, part) before the first doubling
const _prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _pm = new THREE.Matrix4();

function matcher(m) {
  if (typeof m === 'function') return m;
  if (typeof m === 'string') {
    if (m.length > 1 && m[0] === '#') { const tag = m.slice(1); return e => !!e.tags?.has?.(tag); }
    if (m.length > 6 && m.startsWith('model:')) { const key = m.slice(6); return e => e.model === key; }
    if (m.length > 4 && m.startsWith('net:')) { const kind = m.slice(4); return e => e.net === kind; }
  }
  throw new Error(`sync: bad match ${typeof m === 'string' ? `'${m}'` : String(m)} (use '#tag', 'model:<key>', 'net:<kind>' or a function)`);
}

export function createViewSync(engine, { gfx, assets = null, compiler = null, view = { dt: 0 } } = {}) {
  if (!engine) throw new Error('createViewSync: engine required');
  if (!gfx?.scene?.isObject3D) throw new Error('createViewSync: gfx.scene required');
  const root = new THREE.Group(); root.name = 'lh.sync'; gfx.scene.add(root);
  const recs = [], byId = new Map(), hooks = [], models = new Map(), groups = [];
  let world, serial = -1, frame = 0, hookVer = 0, disposed = false;

  function partsOf(model) { // one instance group per mesh of the model, made on the model's first instanced entity
    let list = models.get(model); if (list) return list;
    if (!compiler) throw new Error(`sync: model '${model}' is drawn 'instanced' but the view has no material compiler`);
    const tpl = assets.get(model).scene; tpl.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
    list = [];
    tpl.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) throw new Error(`sync: model '${model}' is skinned; draw it as 'object' or with createCrowd`);
      const name = typeof o.material?.name === 'string' ? o.material.name : '';
      const holder = new THREE.Mesh(o.geometry, o.material); holder.name = o.name; compiler.apply(holder, { instanced: true, coverage: true });
      const paint = name.startsWith('paint-') ? name.slice(6) : null, coverage = holder.material.defines?.COVERAGE_INSTANCED !== undefined;
      const inst = createInstances({ geometry: o.geometry, material: holder.material, max: START_MAX, colors: !!paint, coverage });
      inst.mesh.name = `${model}:${o.name}`; instancedShadows(inst.mesh); root.add(inst.mesh);
      const g = { inst, geometry: o.geometry, part: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), paint, coverage, owners: [] };
      list.push(g); groups.push(g);
    });
    if (!list.length) throw new Error(`sync: model '${model}' has no meshes to instance`);
    models.set(model, list); return list;
  }
  function grow(g) { // double the mesh, keeping every matrix and colour; the old mesh is disposed (geometry and material are shared)
    const old = g.inst, next = createInstances({ geometry: g.geometry, material: old.mesh.material, max: old.max * 2, colors: !!old.mesh.instanceColor, coverage: g.coverage });
    next.mesh.name = old.mesh.name;
    next.mesh.instanceMatrix.array.set(old.mesh.instanceMatrix.array); next.mesh.instanceMatrix.needsUpdate = true;
    if (old.mesh.instanceColor) { next.mesh.instanceColor.array.set(old.mesh.instanceColor.array); next.mesh.instanceColor.needsUpdate = true; }
    if (g.coverage) { next.coverage.array.set(old.coverage.array); next.coverage.needsUpdate = true; }
    next.count = old.count; instancedShadows(next.mesh); root.add(next.mesh); old.dispose(); g.inst = next;
  }
  function join(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k]; if (g.owners.length === g.inst.max) grow(g);
      const i = g.owners.length; g.owners.push(r); r.slots[k] = i; g.inst.count = i + 1;
      if (g.paint) g.inst.color(i, r.e.paint?.[g.paint] ?? '#ffffff');
      if (g.coverage) { r.cov ??= [-1, -1, -1, -1]; r.cov[0] = -1; } // written on the next cover()
    }
  }
  function cover(r) { // e.coverage -> instanceCoverage of every coverage part, only when it changed
    const c = r.e.coverage, d = c?.dirt ?? 0, ru = c?.rust ?? 0, sn = c?.snow ?? 0, m = c?.mud ?? 0, v = r.cov;
    if (v[0] === d && v[1] === ru && v[2] === sn && v[3] === m) return;
    v[0] = d; v[1] = ru; v[2] = sn; v[3] = m;
    for (let k = 0; k < r.parts.length; k++) if (r.parts[k].coverage) r.parts[k].inst.cover(r.slots[k], d, ru, sn, m);
  }
  function leave(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k], i = r.slots[k], last = g.owners.length - 1;
      if (i !== last) { g.inst.copy(last, i); const moved = g.owners[last]; g.owners[i] = moved; moved.slots[k] = i; }
      g.owners.pop(); g.inst.count = last;
    }
  }
  function add(e) {
    const r = { e, id: e.id, obj: null, own: false, parts: null, slots: null, cov: null, seen: 0, hooks: [], hv: -1, wrote: false, ws: 1, at: recs.length };
    if (e.model != null && e.draw !== false) {
      if (e.draw !== undefined && e.draw !== 'object' && e.draw !== 'instanced') throw new Error(`sync: entity ${e.id} has draw ${JSON.stringify(e.draw)} (use 'object', 'instanced' or false)`);
      if (!assets) throw new Error(`sync: entity ${e.id} (model '${e.model}') is drawn but the view has no assets`);
      if (e.draw === 'instanced') { r.parts = partsOf(e.model); r.slots = new Array(r.parts.length); join(r); }
      else { r.obj = assets.clone(e.model, { paint: e.paint }); if (!r.obj.name) r.obj.name = `${e.model}#${e.id}`; r.own = true; root.add(r.obj); }
    }
    recs.push(r); byId.set(e.id, r);
    rematch(r);
    return r;
  }
  function rematch(r) { // hooks matched against this entity; create for each newly matching one
    const was = r.hooks; r.hooks = []; r.hv = hookVer;
    for (const h of hooks) {
      if (!h.test(r.e)) continue;
      r.hooks.push(h);
      if (was.includes(h) || !h.create) continue;
      const out = h.create(r.e, r.obj, view);
      if (out?.isObject3D && !r.obj) { r.obj = out; r.own = false; root.add(out); }
    }
  }
  function remove(r) {
    for (const h of r.hooks) h.remove?.(r.e, r.obj);
    if (r.slots) leave(r);
    if (r.obj) { r.obj.removeFromParent(); if (r.own) disposeTree(r.obj, { keepShared: true }); }
    byId.delete(r.id);
    const last = recs.pop(); if (last !== r) { recs[r.at] = last; last.at = r.at; }
  }
  function dropAll() {
    for (let n = recs.length - 1; n >= 0; n--) remove(recs[n]);
    for (const g of groups) g.inst.dispose();
    groups.length = 0; models.clear();
  }
  function pose(r, a) {
    const e = r.e, c = e.xf;
    world.xfPrev(e, _prev);
    const pp = _prev.p, pq = _prev.q, cp = c.p, cq = c.q;
    const still = pp.x === cp.x && pp.y === cp.y && pp.z === cp.z && pq.x === cq.x && pq.y === cq.y && pq.z === cq.z && pq.w === cq.w;
    _p.set(pp.x + (cp.x - pp.x) * a, pp.y + (cp.y - pp.y) * a, pp.z + (cp.z - pp.z) * a);
    let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
    if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // q and -q: take the short arc
    _q.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
    const s = e.scale ?? 1;
    if (r.obj) { r.obj.position.copy(_p); r.obj.quaternion.copy(_q); r.obj.scale.setScalar(s); }
    if (r.slots) {
      if (r.cov) cover(r);
      if (still && r.wrote && s === r.ws) return; // static props: nothing to upload
      _m.compose(_p, _q, _s.setScalar(s));
      for (let k = 0; k < r.parts.length; k++) r.parts[k].inst.setMatrix(r.slots[k], _pm.multiplyMatrices(_m, r.parts[k].part));
      r.wrote = true; r.ws = s;
    }
  }
  const sync = {
    root,
    frame(alpha) {
      if (disposed) return;
      if (compiler?.time) compiler.time.value += view.dt || 0; // 3f's shared WIND clock, once per frame
      const w = engine.world;
      if (w !== world || (w && w.serial !== serial)) { dropAll(); world = w; serial = w ? w.serial : -1; }
      if (!w) return;
      frame++;
      const list = w.with('xf');
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        let r = byId.get(e.id);
        if (r && r.e !== e) { remove(r); r = undefined; } // a rebuilt entity under the same id
        if (!r) r = add(e);
        r.seen = frame;
        if (r.hv !== hookVer) rematch(r);
        pose(r, alpha);
        const hs = r.hooks;
        for (let k = 0; k < hs.length; k++) hs[k].frame?.(e, r.obj, alpha, view);
      }
      for (let n = recs.length - 1; n >= 0; n--) if (recs[n].seen !== frame) remove(recs[n]); // despawned
      for (let n = 0; n < groups.length; n++) groups[n].inst.commit();
    },
    objectOf(e) { const r = byId.get(e.id); return r && r.e === e && r.obj ? r.obj : undefined; },
    on(match, h = {}) {
      const hook = { test: matcher(match), create: h.create, frame: h.frame, remove: h.remove };
      hooks.push(hook); hookVer++;
      return () => { const i = hooks.indexOf(hook); if (i >= 0) { hooks.splice(i, 1); hookVer++; } };
    },
    dispose() { if (disposed) return; dropAll(); hooks.length = 0; root.removeFromParent(); disposed = true; },
  };
  return sync;
}
```

- [ ] **Step 4: Run; expect PASS.** `UNIT test/sync.test.mjs test/sync-hooks.test.mjs test/sync-instanced.test.mjs` (18 tests).

- [ ] **Step 5: Prove the subtle tests bite.**
  - In `leave`, delete `moved.slots[k] = i;`: expect "despawning the middle instance…" to fail at the move to 30.
  - Restore, then change `if (still && r.wrote && s === r.ws) return;` to nothing: expect "instanced entities that did not move are not re-uploaded" to fail.
  - Restore, then delete `if (g.coverage) { next.coverage.array.set(old.coverage.array); next.coverage.needsUpdate = true; }`: expect the coverage test to fail after the doubling.
  - Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/sync/index.js test/sync-instanced.test.mjs && git commit -m "feat(view): instanced entity groups in view sync with paint, coverage, growth and static-prop skip"`

---

## Task 13: View sync: N-15 smoothing of net corrections

**Files:**
- Create: `test/sync-netfix.test.mjs`
- Modify: `src/view/sync/index.js` (full content below)

**Interfaces:**
- Consumes:
  - Task 10's `smooth.js`;
  - `e.netFix` (3i);
  - `world.net.tunables[e.net].smoothMs` (3i, N-17; default 150);
  - `view.dt`.
- Produces: the drawn pose of every entity includes its N-15 offset.

- [ ] **Step 1: Write the failing test**

`test/sync-netfix.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';

const CRATE = { crate: [{ name: 'body', material: 'wood' }] };
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

test('3g: a correction never makes the mesh jump; the jump fades over smoothMs on view.dt (N-15)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate', at: [5, 0, 0], net: 'train' }); s.view.dt = 0.016; s.sync.frame(1);
  const o = s.sync.objectOf(e); assert.equal(o.position.x, 5);
  s.world.place(e, [4, 0, 0]); e.netFix = { seq: 1, dp: [1, 0, 0], dq: [0, 0, 0, 1] }; // the sim set it back 1 m
  s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 5) < 1e-12);
  s.view.dt = 0.075; s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 4.5) < 1e-12);
  s.sync.frame(0.4); assert.ok(Math.abs(o.position.x - 4) < 1e-12);
  s.sync.frame(0.4); assert.equal(o.position.x, 4); // the same seq is not applied again
});
test('3g: a rotation correction is smoothed too: drawn = offset (x) pose (N-15)', () => {
  const s = syncSetup(), e = s.world.spawn({ model: 'crate' }); s.sync.frame(1);
  const q = yaw(0.5), dq = yaw(-0.5); // old pose: identity; new pose: yaw 0.5; dq = old (x) new^-1
  s.world.place(e, [0, 0, 0], [q.x, q.y, q.z, q.w]); e.netFix = { seq: 1, dp: [0, 0, 0], dq: [dq.x, dq.y, dq.z, dq.w] };
  s.sync.frame(1); assert.ok(1 - Math.abs(s.sync.objectOf(e).quaternion.w) < 1e-12);
});
test('3g: smoothMs comes from world.net.tunables[kind], live; 150 ms without one (N-15, N-17)', () => {
  const s = syncSetup(), a = s.world.spawn({ model: 'crate', net: 'train' }), b = s.world.spawn({ model: 'crate' });
  s.world.net.tunables.train = { smoothMs: 300 }; s.sync.frame(1); s.view.dt = 0.15;
  for (const e of [a, b]) { s.world.place(e, [0, 0, 0]); e.netFix = { seq: 7, dp: [2, 0, 0], dq: [0, 0, 0, 1] }; }
  s.sync.frame(1); assert.equal(s.sync.objectOf(a).position.x, 2); assert.equal(s.sync.objectOf(b).position.x, 2);
  s.sync.frame(1); assert.ok(Math.abs(s.sync.objectOf(a).position.x - 1) < 1e-12); assert.equal(s.sync.objectOf(b).position.x, 0);
});
test('3g: a netFix already on a new entity is not replayed; instanced entities are smoothed (N-15)', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' });
  e.netFix = { seq: 3, dp: [9, 0, 0], dq: [0, 0, 0, 1] }; s.sync.frame(1);
  const body = s.sync.root.children[0], m = new THREE.Matrix4(), p = new THREE.Vector3();
  body.getMatrixAt(0, m); assert.equal(p.setFromMatrixPosition(m).x, 0);
  e.netFix = { seq: 4, dp: [1, 0, 0], dq: [0, 0, 0, 1] }; s.sync.frame(1);
  body.getMatrixAt(0, m); assert.ok(Math.abs(p.setFromMatrixPosition(m).x - 1) < 1e-6); // a still entity with an offset is rewritten
});
```

- [ ] **Step 2: Run; expect FAIL**: "a correction never makes the mesh jump…" finds `x` 4, not 5. `UNIT test/sync-netfix.test.mjs`

- [ ] **Step 3: Implement**

`src/view/sync/index.js` (replace the whole file; this is the final version):

```js
// View sync (E-6, E-11, N-15; overview §4.9): every frame, World entities -> Object3Ds under one root group in gfx.scene.
// - Drawn entities (`model`, draw !== false) get assets.clone(model, { paint }) (draw 'object', the default) or a slot in one
//   createInstances per (model, part) (draw 'instanced', compiled for instancing, instancedShadows, paint-<slot> parts coloured
//   per instance from e.paint). Instanced meshes double when full; a removed slot takes the last one (swap-remove). A part
//   whose instanced material has COVERAGE_INSTANCED (3f) gets instanceCoverage, written from e.coverage { dirt, rust, snow,
//   mud } when it changes (3h's coverage kit fills e.coverage; its coverageView feeds the object-drawn entities).
// - The pose is lerp(prev, curr, alpha) and a normalised nlerp on the short arc (prev from world.xfPrev, curr from e.xf), plus
//   the N-15 offset (smooth.js: e.netFix, faded over world.net.tunables[e.net].smoothMs, default 150, on view.dt), times
//   e.scale. Instanced entities that did not move are not rewritten, so static props cost no upload.
// - on(match, { create, frame, remove }) decorates matching entities ('#tag', 'model:<key>', 'net:<kind>' or a predicate), in
//   registration order: create(e, obj, view) once (an undrawn entity's create may return an Object3D, which sync then poses
//   and takes out of the scene on removal; disposing it is the hook's job), frame(e, obj, alpha, view) after the pose, and
//   remove(e, obj) before the object goes. obj is null for instanced and undrawn entities. off() stops the calls.
// - A new World (engine.world replaced, or world.serial changed by clear()) drops every object and instanced mesh (S-3).
// - Each frame first advances the compiler's shared clock (compiler.time.value += view.dt, 3f's WIND), with or without a World.
// Entities are taken from world.with('xf') in spawn order. Nothing is allocated per frame: records are made when an entity
// first appears (a Map by id and an array), and the math objects are module-level.
import * as THREE from 'three';
import { instancedShadows, disposeTree } from '../render/hygiene.js';
import { createInstances } from '../instancing/instances.js';
import { newOffset, addFix, fade, applyOffset, active } from './smooth.js';

const SMOOTH_MS = 150; // N-15 default when the kind has no tune.smoothMs
const START_MAX = 16;  // instances per (model, part) before the first doubling
const _prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _pm = new THREE.Matrix4();

function matcher(m) {
  if (typeof m === 'function') return m;
  if (typeof m === 'string') {
    if (m.length > 1 && m[0] === '#') { const tag = m.slice(1); return e => !!e.tags?.has?.(tag); }
    if (m.length > 6 && m.startsWith('model:')) { const key = m.slice(6); return e => e.model === key; }
    if (m.length > 4 && m.startsWith('net:')) { const kind = m.slice(4); return e => e.net === kind; }
  }
  throw new Error(`sync: bad match ${typeof m === 'string' ? `'${m}'` : String(m)} (use '#tag', 'model:<key>', 'net:<kind>' or a function)`);
}

export function createViewSync(engine, { gfx, assets = null, compiler = null, view = { dt: 0 } } = {}) {
  if (!engine) throw new Error('createViewSync: engine required');
  if (!gfx?.scene?.isObject3D) throw new Error('createViewSync: gfx.scene required');
  const root = new THREE.Group(); root.name = 'lh.sync'; gfx.scene.add(root);
  const recs = [], byId = new Map(), hooks = [], models = new Map(), groups = [];
  let world, serial = -1, frame = 0, hookVer = 0, disposed = false;

  function partsOf(model) { // one instance group per mesh of the model, made on the model's first instanced entity
    let list = models.get(model); if (list) return list;
    if (!compiler) throw new Error(`sync: model '${model}' is drawn 'instanced' but the view has no material compiler`);
    const tpl = assets.get(model).scene; tpl.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
    list = [];
    tpl.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) throw new Error(`sync: model '${model}' is skinned; draw it as 'object' or with createCrowd`);
      const name = typeof o.material?.name === 'string' ? o.material.name : '';
      const holder = new THREE.Mesh(o.geometry, o.material); holder.name = o.name; compiler.apply(holder, { instanced: true, coverage: true });
      const paint = name.startsWith('paint-') ? name.slice(6) : null, coverage = holder.material.defines?.COVERAGE_INSTANCED !== undefined;
      const inst = createInstances({ geometry: o.geometry, material: holder.material, max: START_MAX, colors: !!paint, coverage });
      inst.mesh.name = `${model}:${o.name}`; instancedShadows(inst.mesh); root.add(inst.mesh);
      const g = { inst, geometry: o.geometry, part: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), paint, coverage, owners: [] };
      list.push(g); groups.push(g);
    });
    if (!list.length) throw new Error(`sync: model '${model}' has no meshes to instance`);
    models.set(model, list); return list;
  }
  function grow(g) { // double the mesh, keeping every matrix and colour; the old mesh is disposed (geometry and material are shared)
    const old = g.inst, next = createInstances({ geometry: g.geometry, material: old.mesh.material, max: old.max * 2, colors: !!old.mesh.instanceColor, coverage: g.coverage });
    next.mesh.name = old.mesh.name;
    next.mesh.instanceMatrix.array.set(old.mesh.instanceMatrix.array); next.mesh.instanceMatrix.needsUpdate = true;
    if (old.mesh.instanceColor) { next.mesh.instanceColor.array.set(old.mesh.instanceColor.array); next.mesh.instanceColor.needsUpdate = true; }
    if (g.coverage) { next.coverage.array.set(old.coverage.array); next.coverage.needsUpdate = true; }
    next.count = old.count; instancedShadows(next.mesh); root.add(next.mesh); old.dispose(); g.inst = next;
  }
  function join(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k]; if (g.owners.length === g.inst.max) grow(g);
      const i = g.owners.length; g.owners.push(r); r.slots[k] = i; g.inst.count = i + 1;
      if (g.paint) g.inst.color(i, r.e.paint?.[g.paint] ?? '#ffffff');
      if (g.coverage) { r.cov ??= [-1, -1, -1, -1]; r.cov[0] = -1; } // written on the next cover()
    }
  }
  function cover(r) { // e.coverage -> instanceCoverage of every coverage part, only when it changed
    const c = r.e.coverage, d = c?.dirt ?? 0, ru = c?.rust ?? 0, sn = c?.snow ?? 0, m = c?.mud ?? 0, v = r.cov;
    if (v[0] === d && v[1] === ru && v[2] === sn && v[3] === m) return;
    v[0] = d; v[1] = ru; v[2] = sn; v[3] = m;
    for (let k = 0; k < r.parts.length; k++) if (r.parts[k].coverage) r.parts[k].inst.cover(r.slots[k], d, ru, sn, m);
  }
  function leave(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k], i = r.slots[k], last = g.owners.length - 1;
      if (i !== last) { g.inst.copy(last, i); const moved = g.owners[last]; g.owners[i] = moved; moved.slots[k] = i; }
      g.owners.pop(); g.inst.count = last;
    }
  }
  function add(e) {
    const r = { e, id: e.id, obj: null, own: false, parts: null, slots: null, cov: null, off: newOffset(), seen: 0, hooks: [], hv: -1, wrote: false, ws: 1, at: recs.length };
    r.off.seq = e.netFix?.seq ?? -1; // a correction made before the entity was first drawn has nothing to smooth
    if (e.model != null && e.draw !== false) {
      if (e.draw !== undefined && e.draw !== 'object' && e.draw !== 'instanced') throw new Error(`sync: entity ${e.id} has draw ${JSON.stringify(e.draw)} (use 'object', 'instanced' or false)`);
      if (!assets) throw new Error(`sync: entity ${e.id} (model '${e.model}') is drawn but the view has no assets`);
      if (e.draw === 'instanced') { r.parts = partsOf(e.model); r.slots = new Array(r.parts.length); join(r); }
      else { r.obj = assets.clone(e.model, { paint: e.paint }); if (!r.obj.name) r.obj.name = `${e.model}#${e.id}`; r.own = true; root.add(r.obj); }
    }
    recs.push(r); byId.set(e.id, r);
    rematch(r);
    return r;
  }
  function rematch(r) { // hooks matched against this entity; create for each newly matching one
    const was = r.hooks; r.hooks = []; r.hv = hookVer;
    for (const h of hooks) {
      if (!h.test(r.e)) continue;
      r.hooks.push(h);
      if (was.includes(h) || !h.create) continue;
      const out = h.create(r.e, r.obj, view);
      if (out?.isObject3D && !r.obj) { r.obj = out; r.own = false; root.add(out); }
    }
  }
  function remove(r) {
    for (const h of r.hooks) h.remove?.(r.e, r.obj);
    if (r.slots) leave(r);
    if (r.obj) { r.obj.removeFromParent(); if (r.own) disposeTree(r.obj, { keepShared: true }); }
    byId.delete(r.id);
    const last = recs.pop(); if (last !== r) { recs[r.at] = last; last.at = r.at; }
  }
  function dropAll() {
    for (let n = recs.length - 1; n >= 0; n--) remove(recs[n]);
    for (const g of groups) g.inst.dispose();
    groups.length = 0; models.clear();
  }
  function pose(r, a) {
    const e = r.e, c = e.xf;
    world.xfPrev(e, _prev);
    const pp = _prev.p, pq = _prev.q, cp = c.p, cq = c.q;
    const still = pp.x === cp.x && pp.y === cp.y && pp.z === cp.z && pq.x === cq.x && pq.y === cq.y && pq.z === cq.z && pq.w === cq.w && !active(r.off);
    _p.set(pp.x + (cp.x - pp.x) * a, pp.y + (cp.y - pp.y) * a, pp.z + (cp.z - pp.z) * a);
    let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
    if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // q and -q: take the short arc
    _q.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
    applyOffset(r.off, _p, _q);
    const s = e.scale ?? 1;
    if (r.obj) { r.obj.position.copy(_p); r.obj.quaternion.copy(_q); r.obj.scale.setScalar(s); }
    if (r.slots) {
      if (r.cov) cover(r);
      if (still && r.wrote && s === r.ws) return; // static props: nothing to upload
      _m.compose(_p, _q, _s.setScalar(s));
      for (let k = 0; k < r.parts.length; k++) r.parts[k].inst.setMatrix(r.slots[k], _pm.multiplyMatrices(_m, r.parts[k].part));
      r.wrote = true; r.ws = s;
    }
  }
  const sync = {
    root,
    frame(alpha) {
      if (disposed) return;
      if (compiler?.time) compiler.time.value += view.dt || 0; // 3f's shared WIND clock, once per frame
      const w = engine.world;
      if (w !== world || (w && w.serial !== serial)) { dropAll(); world = w; serial = w ? w.serial : -1; }
      if (!w) return;
      frame++;
      const list = w.with('xf'), dt = view.dt || 0, tun = w.net?.tunables;
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        let r = byId.get(e.id);
        if (r && r.e !== e) { remove(r); r = undefined; } // a rebuilt entity under the same id
        if (!r) r = add(e);
        r.seen = frame;
        if (r.hv !== hookVer) rematch(r);
        fade(r.off, dt);
        const fix = e.netFix;
        if (fix && fix.seq !== r.off.seq) addFix(r.off, fix, tun?.[e.net]?.smoothMs ?? SMOOTH_MS);
        pose(r, alpha);
        const hs = r.hooks;
        for (let k = 0; k < hs.length; k++) hs[k].frame?.(e, r.obj, alpha, view);
      }
      for (let n = recs.length - 1; n >= 0; n--) if (recs[n].seen !== frame) remove(recs[n]); // despawned
      for (let n = 0; n < groups.length; n++) groups[n].inst.commit();
    },
    objectOf(e) { const r = byId.get(e.id); return r && r.e === e && r.obj ? r.obj : undefined; },
    on(match, h = {}) {
      const hook = { test: matcher(match), create: h.create, frame: h.frame, remove: h.remove };
      hooks.push(hook); hookVer++;
      return () => { const i = hooks.indexOf(hook); if (i >= 0) { hooks.splice(i, 1); hookVer++; } };
    },
    dispose() { if (disposed) return; dropAll(); hooks.length = 0; root.removeFromParent(); disposed = true; },
  };
  return sync;
}
```

- [ ] **Step 4: Run; expect PASS.** `UNIT test/sync.test.mjs test/sync-hooks.test.mjs test/sync-instanced.test.mjs test/sync-netfix.test.mjs` (22 tests).

- [ ] **Step 5: Prove the order of fade and fix bites.** Move `fade(r.off, dt);` below the `addFix` line: expect "a correction never makes the mesh jump…" to fail (the new jump fades on its own frame). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/sync/index.js test/sync-netfix.test.mjs && git commit -m "feat(view): N-15 smoothing of net corrections in view sync, smoothMs per kind (N-15, N-17)"`

---

## Task 13b: View sync: part poses (`partXf`) for sub-parts such as wheels

**Why:** user ruling 2026-10-14 (every game fully on the engine). Rally's wheels (spin, steer, suspension travel) are per-step sim state, so Rally drew its own car from the current slot; Pig Pens and Tractor turn their wheels in sync hooks of their own. Part poses make that data: the sim writes one pose per named model part each step, the World swaps prev/curr with the entity pose (3c Task 10b), and view sync interpolates it onto the part's node with the same alpha as the body, so body and wheels never slide against each other.

**Precondition:** 3c's Task 10b (`partXf`, `world.partXfPrev`) is on `phase-3` (Integrator request 7). It is part of 3c, so 0.8.0 has it.

**Files:**
- Create: `test/sync-parts.test.mjs`
- Modify: `test/helpers/fakeWorld.mjs` (parts), `src/view/sync/index.js` (the edits below, on Task 13's final version)

**Interfaces:**
- Consumes: `e.partXf[name] = { p, q }` (curr, written by sim code) and `world.partXfPrev(e, name, out)` (3c Task 10b).
- Produces: for every object-drawn entity (or one whose hook `create` returned an Object3D) with `e.partXf`, each frame:
  - the named node is found once with `obj.getObjectByName(name)` (the baked part names, 3d; sanitised as GLTFLoader does);
  - `p` (metres) and `q` are the pose of the part's **centre** in the entity's body frame (e.xf's frame, before `e.scale`), with `q` relative to the part's rest orientation. The centre is the node's bounding-box centre (a wheel's hub), measured once after the entity's create hooks ran (a hook may rescale a part first, as Rally's does). At `p` = the rest centre and `q` = identity the node is drawn at its rest pose;
  - the drawn pose is `lerp(prev.p, curr.p, alpha)` and the short-arc nlerp of `q`, with the body's alpha. The node keeps its rest scale (and `e.scale` applies through the root as for the body);
  - errors: `sync: entity <id> (model '<m>') has no part '<name>' for partXf (parts: <names>)`; `sync: entity <id>: partXf needs draw 'object' (instanced parts are not posed per entity)`.
  - A part turning more than half a turn in one step draws the short way round (backwards); at 240 Hz that is above 750 rad/s.

**Decisions to confirm in review (judgment):**
- Data, not a hook: the pose rides 3c's swap exactly as `xf` does. A per-kind `draw` hook would put interpolation back in every game.
- Body frame and hub centre, not the node's raw local transform: the vehicle kit (sim, 3h Task 6b) and Rally's vehicle know the hub in the chassis frame and nothing of the model's node offsets, axis fixes or scales. The node's parent chain (rest, measured at bind) converts. A part under a parent with non-uniform scale and a rotation would shear; such a part is not supported (no game has one).
- Binding is redone when `e.partXf` is replaced or removed (`world.add`/`remove`); otherwise once, on the entity's first frame, after the create hooks that are registered by then. A hook that reshapes parts must be registered before the entity is first drawn (a view half's `enter`); hooks added later do not re-measure (the nodes are no longer at rest). Names merged into the same `e.partXf` after the first frame (3c's `add` merges) are not bound; the vehicle kit adds its wheels in `createVehicle`, in the spawn's step.

- [ ] **Step 1: Write the helpers and the failing tests**

`test/helpers/fakeWorld.mjs`: in the header add "partXf: [names] at spawn gives e.partXf (curr) and a prev per part, copied by step(), read by partXfPrev(e, name, out); place() does not touch parts (3c Task 10b)". In `spawn`, after `prev.set(…)`:

```js
      if (rest.partXf) { const names = rest.partXf; e.partXf = {}; const pp = new Map(); for (const n of names) { e.partXf[n] = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }; pp.set(n, copy(e.partXf[n], { p: {}, q: {} })); } partPrev.set(e.id, pp); }
```

with `const partPrev = new Map();` beside `prev`. `step()` also copies every part: `for (const [id, pp] of partPrev) { const e = list.find(x => x.id === id); if (e) for (const [n, v] of pp) copy(e.partXf[n], v); }`. `despawn` and `clear` drop `partPrev` entries. Add:

```js
    partXfPrev(e, name, out) { const v = partPrev.get(e.id)?.get(name); if (!v) throw new Error(`world.partXfPrev: entity ${e.id} has no part '${name}'`); return copy(v, out); },
```

`test/sync-parts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';

const CAR = { car: [{ name: 'body', material: 'steel' }, { name: 'hub', material: 'rubber', p: [0.8, 0.3, 1.2] }] };
const yaw = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const set = (part, p, q = yaw(0), sign = 1) => { Object.assign(part.p, { x: p[0], y: p[1], z: p[2] }); Object.assign(part.q, { x: sign * q.x, y: sign * q.y, z: sign * q.z, w: sign * q.w }); };
const centre = node => { node.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()); };
const near = (a, b, msg) => assert.ok(a.distanceTo(b) < 1e-9, `${msg}: ${a.toArray()} vs ${b.toArray()}`);

test('3g: a part centre is drawn at body · p, turned body · q · rest, interpolated with the body\'s alpha on the short arc; e.scale keeps metres', () => {
  const s = syncSetup(CAR), body = yaw(Math.PI / 2);
  const e = s.world.spawn({ model: 'car', at: [10, 0, 0], q: [body.x, body.y, body.z, body.w], scale: 2, partXf: ['hub'] });
  set(e.partXf.hub, [1, 0, 2]); s.sync.frame(1);
  const hub = s.sync.objectOf(e).getObjectByName('hub');
  near(centre(hub), new THREE.Vector3(12, 0, -1), 'centre at body · p'); // yaw 90°: (1, 0, 2) → (2, 0, -1)
  assert.ok(Math.abs(hub.getWorldScale(new THREE.Vector3()).x - 2) < 1e-9, 'rest scale × e.scale');
  s.world.step(); set(e.partXf.hub, [3, 0, 2], yaw(Math.PI / 2), -1); // curr stored as -q
  s.sync.frame(0.5);
  near(centre(hub), new THREE.Vector3(12, 0, -2), 'p halfway');
  const want = body.clone().multiply(yaw(Math.PI / 4)), got = hub.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(1 - Math.abs(got.dot(want)) < 1e-12, 'q halfway on the short arc');
});
test('3g: the centre is the node\'s bounding-box centre after create hooks: an off-centre wheel turns about its hub', () => {
  const s = syncSetup(CAR);
  s.sync.on('model:car', { create: (e, obj) => { obj.getObjectByName('hub').geometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0); } });
  const e = s.world.spawn({ model: 'car', partXf: ['hub'] }), q = yaw(Math.PI / 2);
  set(e.partXf.hub, [0, 0.3, 1.2]); s.sync.frame(1);
  const hub = s.sync.objectOf(e).getObjectByName('hub');
  near(centre(hub), new THREE.Vector3(0, 0.3, 1.2), 'centre at p'); near(hub.position, new THREE.Vector3(-0.5, 0.3, 1.2), 'node origin');
  set(e.partXf.hub, [0, 0.3, 1.2], q); s.world.step(); s.sync.frame(1);
  near(centre(hub), new THREE.Vector3(0, 0.3, 1.2), 'turned about its centre'); near(hub.position, new THREE.Vector3(0, 0.3, 1.7), 'node swung round it');
});
test('3g: a missing part names the model\'s parts; instanced entities refuse partXf; an undrawn entity\'s parts are ignored', () => {
  const s = syncSetup(CAR); s.world.spawn({ model: 'car', partXf: ['wheel-x'] });
  assert.throws(() => s.sync.frame(1), /^Error: sync: entity 1 \(model 'car'\) has no part 'wheel-x' for partXf \(parts: body, hub\)$/);
  const t = syncSetup(CAR); t.world.spawn({ model: 'car', draw: 'instanced', partXf: ['hub'] });
  assert.throws(() => t.sync.frame(1), /sync: entity 1: partXf needs draw 'object'/);
  const u = syncSetup(CAR); u.world.spawn({ model: 'car', draw: false, partXf: ['hub'] }); u.sync.frame(1); assert.equal(u.sync.root.children.length, 0);
});
test('3g: part poses make no three objects and retain nothing: 10000 frames of 20 cars with 4 parts (R-8)', () => {
  const wheels = ['fl', 'fr', 'rl', 'rr'], s = syncSetup({ car: [{ name: 'body', material: 'steel' }, ...wheels.map((name, i) => ({ name, material: 'rubber', p: [i, 0, 0] }))] }), es = [];
  for (let i = 0; i < 20; i++) es.push(s.world.spawn({ model: 'car', at: [i * 3, 0, 0], partXf: wheels }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (const e of es) for (const w of wheels) { const q = e.partXf[w].q, a = t * 0.3; q.x = Math.sin(a); q.w = Math.cos(a); e.partXf[w].p.y = Math.sin(t) * 0.1; } s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
```

- [ ] **Step 2: Run; expect FAIL.** `UNIT test/sync-parts.test.mjs`. The first test fails on "centre at body · p" (the hub stays at its rest pose).

- [ ] **Step 3: Implement** in `src/view/sync/index.js`:
  - Header comment, after the pose bullet: "- Part poses (3c's e.partXf, swapped like xf): each named part's centre (its bounding-box centre after create hooks) is drawn at lerp(prev.p, curr.p, alpha) in the body frame, turned by the short-arc nlerp of q from its rest orientation (Task 13b)."
  - Module scratch, beside `_prev`: `const _part = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, _pp = new THREE.Vector3(), _pq = new THREE.Quaternion(), _pm2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);`
  - The record in `add` gains `pv: undefined, pnodes: null`. In `add`'s instanced branch, first: `if (e.partXf) throw new Error(`sync: entity ${e.id}: partXf needs draw 'object' (instanced parts are not posed per entity)`);`.
  - Add, after `rematch`:

```js
  // Part poses (Task 13b): find each named node once, after the create hooks, and keep A = T(-centre) · rest and the inverse of
  // its parent's rest, both in the model's own space (the object's local frame), so a frame is one compose and two multiplies.
  function bindParts(r) {
    const e = r.e, obj = r.obj; r.pv = e.partXf; r.pnodes = null;
    if (!e.partXf || !obj) return;
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), box = new THREE.Box3(), c = new THREE.Vector3();
    r.pnodes = Object.keys(e.partXf).map(name => {
      const node = obj.getObjectByName(name);
      if (!node || node === obj) {
        const names = []; obj.traverse(o => { if (o !== obj && o.name) names.push(o.name); });
        throw new Error(`sync: entity ${e.id} (model '${e.model}') has no part '${name}' for partXf (parts: ${names.join(', ')})`);
      }
      const rest = new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld);
      box.setFromObject(node);
      if (box.isEmpty()) c.setFromMatrixPosition(rest); else box.getCenter(c).applyMatrix4(inv);
      const a = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z).multiply(rest);
      const parent = new THREE.Matrix4().multiplyMatrices(inv, node.parent.matrixWorld).invert();
      return { name, node, a, parent };
    });
  }
  function poseParts(r, a, s) {
    const e = r.e, ps = r.pnodes;
    for (let k = 0; k < ps.length; k++) {
      const pn = ps[k], c = e.partXf[pn.name];
      world.partXfPrev(e, pn.name, _part);
      const pp = _part.p, pq = _part.q, cp = c.p, cq = c.q;
      _pp.set((pp.x + (cp.x - pp.x) * a) / s, (pp.y + (cp.y - pp.y) * a) / s, (pp.z + (cp.z - pp.z) * a) / s); // metres → model space
      let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
      if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // short arc, as the body
      _pq.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
      _pm2.compose(_pp, _pq, _one).multiply(pn.a).premultiply(pn.parent);
      _pm2.decompose(pn.node.position, pn.node.quaternion, pn.node.scale);
    }
  }
```

  - In `pose`, after the `if (r.obj) { … }` line: `if (r.pnodes) poseParts(r, a, s);`.
  - In `frame`, after `if (r.hv !== hookVer) rematch(r);`: `if (r.pv !== e.partXf) bindParts(r);` (the first frame binds after `add`'s create hooks; a replaced or removed `partXf` rebinds).

- [ ] **Step 4: Run; expect PASS.** `UNIT test/sync.test.mjs test/sync-hooks.test.mjs test/sync-instanced.test.mjs test/sync-netfix.test.mjs test/sync-parts.test.mjs` (26 tests).

- [ ] **Step 5: Prove the subtle tests bite.**
  - Change the short-arc test in `poseParts` to `if (false)`: expect the first test to fail on "q halfway on the short arc". Restore.
  - In `bindParts`, make `a` just `rest` (drop the `makeTranslation(-c.x, -c.y, -c.z)`): expect the second test to fail on "turned about its centre". Restore.
  - Move `if (r.pv !== e.partXf) bindParts(r);` into `add` before `rematch(r)`: expect the second test to fail on "centre at p" (the hook's geometry was not seen). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/sync/index.js test/helpers/fakeWorld.mjs test/sync-parts.test.mjs && git commit -m "feat(view): view sync draws part poses (partXf) on named model parts, interpolated with the body"`

---

## Task 14: View sync on 3c's real World

**Files:**
- Create: `test/sync-world.test.mjs`

**Interfaces:**
- Consumes: 3c's `createEngine` World (`engine.world`, `spawn({ model, xf: true, partXf })`, `e.xf` accessors, `xfPrev`, `partXfPrev`, `lh.world.swap`, `despawn`, `clear`, `serial`), and `defs.models` sidecars (§4.3).
- Produces: none (test only).

- [ ] **Step 1: Write the test**

`test/sync-world.test.mjs`:

```js
// View sync against 3c's real World (overview §4.4): bodiless entities with a pool slot, prev from xfPrev, curr from e.xf, the
// swap in lh.world.swap, clear() changing serial. Assets are the box stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEngine, defineGame } from '../src/index.sim.js';
import { createViewSync } from '../src/view/sync/index.js';
import { fakeAssets } from './helpers/fakeAssets.mjs';

const CRATE = { v: 1, source: { file: 'test/crate.glb', sha256: '0' }, parts: ['body'], colliders: [],
  mass: { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] }, sockets: {}, bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } };
const game = defineGame({ id: 'sync-world', start: 's', scenes: { s: {} }, defs: { models: { v: 1, engine: '0.8.0', materials: '00000000', models: { crate: CRATE } } } });

test('3g: sync draws a real World: xf entities, prev from xfPrev, the step\'s swap, despawn and clear (E-6, E-10, E-11, S-3)', () => {
  const engine = createEngine(game), fa = fakeAssets(), gfx = { scene: new THREE.Scene() };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view: { dt: 0 } }), w = engine.world;
  const e = w.spawn({ model: 'crate', xf: true, at: [0, 0, 0] });
  sync.frame(1); const o = sync.objectOf(e); assert.equal(o.position.x, 0);
  e.xf.p.x = 2; sync.frame(0.5); assert.equal(o.position.x, 1); // curr moved, prev not
  engine.stepN(1); sync.frame(0.5); assert.equal(o.position.x, 2); // lh.world.swap: prev caught up
  w.despawn(e); sync.frame(1); assert.equal(o.parent, null);
  w.spawn({ model: 'crate', xf: true }); sync.frame(1); assert.equal(sync.root.children.length, 1);
  w.clear(); sync.frame(1); assert.equal(sync.root.children.length, 0);
});
test('3g: part poses on a real World: e.partXf curr, partXfPrev, swapped by lh.world.swap (3c Task 10b)', () => {
  const engine = createEngine(game), fa = fakeAssets(), gfx = { scene: new THREE.Scene() };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view: { dt: 0 } }), w = engine.world;
  const e = w.spawn({ model: 'crate', xf: true, partXf: ['body'] });
  e.partXf.body.p.x = 2; sync.frame(0.5);
  const body = sync.objectOf(e).getObjectByName('body'); assert.equal(body.position.x, 1); // prev is still the identity part pose
  engine.stepN(1); sync.frame(0.5); assert.equal(body.position.x, 2);
});
```

- [ ] **Step 2: Run; expect PASS** (2 tests). `UNIT test/sync-world.test.mjs`. This checks Contract issue 1 against the real World. If it fails, see which:
  - The sidecar fixture is rejected (the message names the field). Fix the fixture, or import 3c's `test/fixtures/phys/` fixture (read only).
  - `with('xf')` misses bodiless `xf: true` entities, or `xfPrev` (or `partXfPrev`) has another out shape. That is a contract mismatch: **stop**, write it in the notes, and ask the integrator (constraint 10). Do not change the sync's reads on your own.

- [ ] **Step 3: Prove it can fail.** In each test, replace `engine.stepN(1);` with nothing: expect its `2` assertion to fail (prev not caught up). Restore; PASS.

- [ ] **Step 4: Commit.** `git add test/sync-world.test.mjs && git commit -m "test(view): view sync against the real World: pool, swap, part poses, despawn and clear"`

---

## Task 15: Crowds

**Precondition:** 3f is merged into `phase-3`, and `phase-3` is merged here: `src/view/assets/animTable.js` (`sampleAnimTable`, `blendAnimTable`, `decodeAnimTable`) and `test/helpers/glb.mjs` (`makeAnimJson`) exist.

**Files:**
- Create: `src/view/instancing/crowd.js`, `test/sync-crowd.test.mjs`

**Interfaces:**
- Consumes:
  - `assets.get(key)` → `{ scene, anim }` with `anim` decoded (3f);
  - `sampleAnimTable(table, clip, t, part, out)` and `blendAnimTable(table, clipA, tA, clipB, tB, k, part, out)` = A·(1−k) + B·k (3f C7);
  - `compiler.apply(holder, { instanced: true, coverage: true })`;
  - Task 9's `createInstances`.
- Produces: `createCrowd(asset, { max, compiler, castShadow, receiveShadow })` → `{ group, parts: [{ name, inst, coverage }], count (get/set), set(i, pose, clip, t, blend?), cover(i, d, r, s, m), commit(), dispose() }`.
  - `pose` is a Matrix4 or `{ p, q, s? }`.
  - `blend = { clip, t, k }`, where `k` is this clip's weight: `blendAnimTable(table, blend.clip, blend.t, clip, t, k)`.
  - `cover`, `parts` and the Matrix4 pose are additive (Contract issue 4).

- [ ] **Step 1: Write the failing test**

`test/sync-crowd.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowd } from '../src/view/instancing/crowd.js';
import { decodeAnimTable } from '../src/view/assets/animTable.js';
import { makeAnimJson } from './helpers/glb.mjs';
import { fakeAssets } from './helpers/fakeAssets.mjs';

// a table where part k of 'walk' sits at (k, 3, 0) and of 'idle' at (k, 0, 0), the same in both frames (t does not matter)
const T = (x, y) => new THREE.Matrix4().makeTranslation(x, y, 0);
const table = decodeAnimTable(makeAnimJson(['body', 'head'], {
  walk: { dur: 1, frames: [[T(0, 3), T(1, 3)], [T(0, 3), T(1, 3)]] },
  idle: { dur: 1, frames: [[T(0, 0), T(1, 0)], [T(0, 0), T(1, 0)]] },
}));
const setup = () => {
  const fa = fakeAssets({ pig: [{ name: 'body', material: 'mud' }, { name: 'head', material: 'pet' }] });
  const asset = { ...fa.assets.get('pig'), anim: table };
  return { ...fa, asset, crowd: createCrowd(asset, { max: 8, compiler: fa.compiler }) };
};
const pos = (inst, i) => { const m = new THREE.Matrix4(); inst.getMatrix(i, m); return new THREE.Vector3().setFromMatrixPosition(m); };

test('3g: createCrowd makes one instanced mesh per anim-table part; set poses each part as pose x sample (A-11)', () => {
  const c = setup().crowd;
  assert.deepEqual(c.group.children.map(m => [m.name, m.isInstancedMesh, m.material.userData.instanced]), [['pig:body', true, true], ['pig:head', true, true]]);
  c.count = 1; assert.deepEqual(c.parts.map(p => p.inst.count), [1, 1]);
  c.set(0, { p: { x: 1, y: 0, z: 0 }, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), s: 2 }, 'walk', 0.3);
  // head: (1, 3, 0) in the model, scaled to (2, 6, 0), turned 90 degrees about y to (0, 6, -2), moved by (1, 0, 0)
  assert.ok(pos(c.parts[1].inst, 0).distanceTo(new THREE.Vector3(1, 6, -2)) < 1e-5);
  assert.ok(pos(c.parts[0].inst, 0).distanceTo(new THREE.Vector3(1, 6, 0)) < 1e-5);
});
test('3g: blend = { clip, t, k } weighs this clip by k (3f blendAnimTable, Pig Pens lerpM); a Matrix4 pose is taken as is', () => {
  const c = setup().crowd; c.count = 2;
  c.set(0, new THREE.Matrix4(), 'walk', 0, { clip: 'idle', t: 0, k: 0.25 });
  assert.ok(pos(c.parts[1].inst, 0).distanceTo(new THREE.Vector3(1, 0.75, 0)) < 1e-6);
  c.set(1, new THREE.Matrix4().makeTranslation(0, 10, 0), 'idle', 0, { clip: 'walk', t: 0, k: 1 });
  assert.ok(pos(c.parts[0].inst, 1).distanceTo(new THREE.Vector3(0, 10, 0)) < 1e-6);
  const v = c.parts[0].inst.mesh.instanceMatrix.version; c.commit(); assert.equal(c.parts[0].inst.mesh.instanceMatrix.version, v + 1);
});
test('3g: cover writes instanceCoverage on the coverage parts only (Pig Pens per-pig mud, 3f COVERAGE_INSTANCED)', () => {
  const c = setup().crowd; c.cover(3, 0, 0, 0, 0.8);
  const [body, head] = c.parts;
  assert.equal(body.coverage, true); assert.equal(head.coverage, false); assert.equal(head.inst.mesh.geometry.attributes.instanceCoverage, undefined);
  assert.deepEqual([...body.inst.coverage.array.slice(12, 16)], [0, 0, 0, 0.8].map(Math.fround));
});
test('3g: crowd count is range-checked; dispose takes the group out; bad assets throw', () => {
  const s = setup(), c = s.crowd, parent = new THREE.Group(); parent.add(c.group);
  assert.throws(() => { c.count = 9; }, /crowd: count 9 outside 0\.\.8/);
  c.dispose(); assert.equal(c.group.parent, null);
  assert.throws(() => createCrowd({ scene: new THREE.Group() }, { max: 1, compiler: s.compiler }), /has no anim table/);
  assert.throws(() => createCrowd({ ...s.asset, anim: { ...table, parts: ['tail'] } }, { max: 1, compiler: s.compiler }), /part 'tail' of the anim table is not a mesh in 'pig'/);
  assert.throws(() => createCrowd(s.asset, { max: 0, compiler: s.compiler }), /max must be/);
});
```

- [ ] **Step 2: Run; expect FAIL** with `ERR_MODULE_NOT_FOUND` (`src/view/instancing/crowd.js`). `UNIT test/sync-crowd.test.mjs`

- [ ] **Step 3: Implement**

`src/view/instancing/crowd.js`:

```js
// Crowds (overview §4.9, A-11): one InstancedMesh per animated part, posed from a baked animation table (Pig Pens' pigs and
// chickens). asset is assets.get(key) with its decoded anim table (3f's decodeAnimTable). set(i, pose, clip, t, blend?) writes
// instance i: pose is a Matrix4 or { p, q, s? }; each part's matrix is pose x 3f's sampleAnimTable(clip, t). With blend =
// { clip, t, k } it is 3f's blendAnimTable(blend.clip, blend.t, clip, t, k): k is this clip's weight (1 = no blend), as Pig
// Pens' lerpM. Parts whose instanced material has COVERAGE_INSTANCED (3f) get instanceCoverage: cover(i, dirt, rust, snow, mud)
// (Pig Pens' per-pig mud). count sets how many draw; commit() uploads. parts[k].inst is the part's createInstances, for games
// that add attributes. Nothing is allocated after create.
import * as THREE from 'three';
import { sampleAnimTable, blendAnimTable } from '../assets/animTable.js';
import { createInstances } from './instances.js';

const _w = new THREE.Matrix4(), _a = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export function createCrowd(asset, { max, compiler, castShadow = true, receiveShadow = true } = {}) {
  if (!asset?.scene) throw new Error('createCrowd: asset required (assets.get(key))');
  const table = asset.anim, name = asset.scene.name || 'model';
  if (!table) throw new Error(`createCrowd: '${name}' has no anim table (bake it with animTable)`);
  if (!compiler) throw new Error('createCrowd: compiler required');
  if (!(Number.isInteger(max) && max >= 1)) throw new Error(`createCrowd: max must be a whole number of at least 1 (got ${max})`);
  const group = new THREE.Group(); group.name = `crowd:${name}`;
  const parts = table.parts.map(pn => {
    const src = asset.scene.getObjectByName(pn);
    if (!src?.isMesh) throw new Error(`createCrowd: part '${pn}' of the anim table is not a mesh in '${name}'`);
    const holder = new THREE.Mesh(src.geometry, src.material); holder.name = pn; compiler.apply(holder, { instanced: true, coverage: true });
    const coverage = holder.material.defines?.COVERAGE_INSTANCED !== undefined;
    const inst = createInstances({ geometry: src.geometry, material: holder.material, max, castShadow, receiveShadow, coverage });
    inst.mesh.name = `${name}:${pn}`; group.add(inst.mesh);
    return { name: pn, inst, coverage };
  });
  let count = 0;
  return {
    group, parts,
    get count() { return count; },
    set count(n) {
      if (!(Number.isInteger(n) && n >= 0 && n <= max)) throw new RangeError(`crowd: count ${n} outside 0..${max}`);
      count = n; for (let k = 0; k < parts.length; k++) parts[k].inst.count = n;
    },
    set(i, pose, clip, t, blend) {
      if (pose.isMatrix4) _w.copy(pose);
      else {
        const s = pose.s ?? 1;
        _w.compose(_p.set(pose.p.x, pose.p.y, pose.p.z), _q.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w), typeof s === 'number' ? _s.setScalar(s) : _s.set(s.x, s.y, s.z));
      }
      for (let k = 0; k < parts.length; k++) {
        if (blend && blend.k < 1) blendAnimTable(table, blend.clip, blend.t, clip, t, blend.k, k, _a);
        else sampleAnimTable(table, clip, t, k, _a);
        parts[k].inst.setMatrix(i, _t.multiplyMatrices(_w, _a));
      }
    },
    cover(i, d, r, s, m) { for (let k = 0; k < parts.length; k++) if (parts[k].coverage) parts[k].inst.cover(i, d, r, s, m); },
    commit() { for (let k = 0; k < parts.length; k++) parts[k].inst.commit(); },
    dispose() { group.removeFromParent(); for (let k = 0; k < parts.length; k++) parts[k].inst.mesh.dispose(); },
  };
}
```

- [ ] **Step 4: Run; expect PASS** (4 tests).

- [ ] **Step 5: Prove the blend direction bites.** Change the call to `blendAnimTable(table, clip, t, blend.clip, blend.t, blend.k, k, _a)`: expect the blend test to fail (2.25 instead of 0.75). Restore; PASS.

- [ ] **Step 6: Commit.** `git add src/view/instancing/crowd.js test/sync-crowd.test.mjs && git commit -m "feat(view): crowds of instanced parts posed by baked anim tables, with blend and coverage (A-11)"`

---

## Task 16: Notes and the full suite

**Files:**
- Create: `docs/plans/2026-10-13-phase-3g-viewsync-notes.md`

- [ ] **Step 1: Run** `SUITE` and expect PASS. Then run `BROWSER test/audio-e2e.test.mjs` and expect PASS.
- [ ] **Step 2: Write the notes file** with these sections:
  - `## Outcome`: the test counts before and after, the commits, and anything an executor changed from this plan and why.
  - `## Contract issues`: copy the section below, with what happened in practice (Task 14 especially).
  - `## Integrator requests`: copy the section below.
  - `## Field note candidates` (the integrator numbers them from #110):
    - #67 status → done (the audio service);
    - the `instanceCoverage` geometry wrapper that is never disposed (Task 9);
    - Pig Pens' gesture feel changes (Task 8);
    - Rally's FOVs as adds over `lhFov` and the portrait widening (Task 5);
    - Tractor's chase shake from a counter hash instead of `Math.random`, and its F-10 blend moved into the rig as `blendFrom` (Task 5, CI-10);
    - Pig Pens' `mode()` asked on every move, so a drive that starts mid-gesture stops an orbit (Task 8, 3k C9);
    - JIT warm-up in heap probes (`retained` warms 2000 runs first: the first 2000 frames retain about 110 KB of compiled code and feedback, measured while writing this plan);
    - any surprise from Tasks 3 and 14.
- [ ] **Step 3: Commit.** `git add docs/plans/2026-10-13-phase-3g-viewsync-notes.md && git commit -m "docs: phase 3g notes, contract issues and field note candidates"`

---

## Done when

- `SUITE` passes in the worktree: the baseline count plus 3g's 80 new tests: audio 17, audio e2e 1 (it runs in SUITE too, and skips only where no Chromium is installed), cameras 22 (project 4, chase 7, mount 2, orbit 4, gestures 5), instances 4, smoothing 4, sync 28 (9 + 3 + 6 + 4 + 4 + 2), crowd 4.
- `BROWSER test/audio-e2e.test.mjs` passes (1 test).
- Every mutation step above was seen red, then green.
- `git diff --stat phase-3...phase-3-viewsync` touches only the files in the File Structure table.
- Merge point: Wave B (engine 0.9.0), after 3e and 3f, with `src/view/sync/index.js` and `src/view/audio/index.js` taken from this branch.

## Notes stub

`docs/plans/2026-10-13-phase-3g-viewsync-notes.md`, with sections `## Outcome`, `## Contract issues`, `## Integrator requests` and `## Field note candidates` (numbered by the integrator from #110). Task 16 writes it.

---

## Contract issues

1. **`createViewSync` gains `view`, `root` and `dispose`, and reads `world.with('xf')` and `world.xfPrev`.**
   - §4.9's hooks take a `view` argument and N-15 fades on `view.dt`, but `createViewSync(engine, { gfx, assets, compiler })` gets no `view`. Decision: an added `view` option. `sync.frame(alpha)` stays as specified.
   - `root` (the `lh.sync` group) and `dispose()` (3e's boot calls it) are additive.
   - The entity set is `world.with('xf')`, and prev poses come from `world.xfPrev(e, { p, q })`. §4.4 says neither that `xf` is a queryable part nor what shape `xfPrev`'s `out` has. Task 14 checks both on 3c's World.
2. **`e.netFix.dq` convention.** `dq = q_old ⊗ q_new⁻¹` (world frame), and drawn = `offset ⊗ q`. `dp = p_old − p_new`. `smoothMs` is read from `world.net.tunables[e.net].smoothMs` (default 150). 3i must produce `netFix` in this convention.
3. **Rigs beyond the §4.9 signatures** (3e, 3j and 3k rulings):
   - `createChaseRig` adds `opts.style: 'heading' | 'travel'`, `orbit(pose, dt)`, `yaw`, `shake(a)`, `blendFrom(q, time)` and live `opts`. Rally's absolute FOVs (55, 62 + speed) become adds over `camera.userData.lhFov` (−5, +2), so in portrait Rally's FOV is 4° wider than today.
   - **CI-10 (3l).** The heading style carries Tractor's velocity heading (`slide`, `pose.velYaw`), portrait framing (`portrait`, `portraitAspect`), shake (`shake(a)`, `shakeTime`), live tuning (the caller's `opts` object, shared across rigs) and the F-10 blend (`blendFrom`), so Tractor adopts the rig (Task 5).
   - `createMountRig` has `follow(pose)`, `set(socket)` and `fovAdd`; §4.9 gave it no methods. With the travel chase it covers all four of Rally's modes (3j #9, Task 6's four-modes test); sockets are plain offsets, so no `sock-*` empties are needed.
   - `createOrbitRig` adds `state`, `limits`, `fit`, `apply`, `panBy`, `chase`, `release`, `gesture`/`orbiting`, a `canvas` option, `update(dt, raw)` and `bindGesture(engine, el, { mode, tapMove })`; `mode()` is asked again on every move (3k C9: the pose, clamps and drive chase Pig Pens needs).
   - `makeProject` adds `project.ndc` and an optional `out`.
4. **Instancing extras.**
   - `createInstances` adds `setMatrix`, `getMatrix`, `color` accepting CSS strings, `cover`, `copy`, `dispose`, and the `colors` and `coverage` options; `count` is settable.
   - `createCrowd` adds `parts`, `cover`, `dispose`, and a Matrix4 pose. `blend.k` is the current clip's weight.
   - Sync writes `instanceCoverage` from `e.coverage { dirt, rust, snow, mud }` for instanced entities (3h's `coverageView` does object-drawn ones), and advances `compiler.time` once per frame (3f C3).
   - Particle and mark pools are 3h's fx kit (§4.10), not 3g's.
5. **Part poses (`partXf`).** §4.4/§4.9 have no per-part state. 3c adds `partXf` and `world.partXfPrev(e, name, out)` (3c Task 10b, Integrator request 7); sync poses named parts from it (Task 13b): body-frame centre and rest-relative rotation, interpolated with the body; `draw: 'instanced'` refuses it.
6. **Audio.**
   - Unlock listens on `pointerup` and `click` too, and keeps listening until the context runs: iOS grants activation on up/click/touchend, not on a touch `pointerdown`.
   - Added: `onGesture(fn)`, `muted`, `listen(obj)`, `distanceGain(x, y, z)`, and the `play` options `at`, `when`, `loop` and `offset`.
   - Test seams: the `AudioContext` and `fetch` options, and `positional`, `volume` and `limiter` tunables.
   - `ctx`/`master` stay `null` until the first gesture.

## Integrator requests

1. **Merge order.** Merge 3e into `phase-3` before 3g's Task 11 (sync imports `src/view/render/hygiene.js`), and 3f before Task 15 (crowd imports `src/view/assets/animTable.js` and uses 3f's `test/helpers/glb.mjs`). Tell the 3g worktree each time, so it can merge `phase-3`.
2. **boot.js (3e's).** Build the sync as `createViewSync(engine, { gfx, assets: view.assets, compiler: materials, view })`, passing `view` (Contract issue 1). Keep calling `view.sync.dispose()` and `view.audio.dispose()` in dispose. `createAudio({ doc, flags })` is unchanged.
3. **Exports in `src/index.view.js`:** `createViewSync`, `createChaseRig`, `createOrbitRig`, `createMountRig`, `makeProject`, `createInstances`, `createCrowd` and `createAudio` (overview §3.2).
4. **At the Wave B merge:** take 3g's `src/view/sync/index.js` and `src/view/audio/index.js` over 3e's stubs, and delete `test/render-stubs.test.mjs` (as 3e's request 3 says). Rerun `test/render-pipeline.test.mjs` and `test/render-boot.test.mjs` with the real sync and audio.
5. **Field notes:** mark #67 done at the merge, and number 3g's candidates from the notes file.
6. **Forward to 3i:** the `netFix` convention (Contract issue 2). **Forward to 3h:** sync writes `instanceCoverage` for instanced entities from `e.coverage` (Contract issue 4). **Forward to 3j/3k/3l** (each amends its plan to adopt the rigs; option names and defaults are the code in Tasks 5–7):
   - **Rally (3j #9; replaces 3j's own-camera Task 16):** `chase = createChaseRig(camera, { style: 'travel' })` (defaults `distance 6.8, height 2.4, lag 3.5, lookAhead 3, lookHeight 0.6, ease 8, lookEase 12, blendFrom 3, blendSpan 20, blendMax 0.55, fovAdd 2, fovSpeed 0.25, fovMax 10, orbitRadius 9, orbitHeight 3.2, orbitLook 0.4, orbitSpeed 0.12, orbitStart 0.6, orbitFovAdd -5, shakeTime 0.25`): title → `chase.orbit(pose, dt)`, chase → `chase.follow(pose, dt)`, pose `{ p, q, v }`; `mount = createMountRig(camera, { socket: { p: [0, 0.05, zFront + 0.9] }, fovAdd: 12 })`, bonnet `mount.set({ p: [0, 0.62, 0.35] })`, `mount.follow(pose)`. The FOV base is `camera.userData.lhFov` (3e sets 60 in landscape; a camera made outside boot, as in 3j's camera golden, sets `userData.lhFov = 60` itself), so landscape numbers are today's and only portrait is 4° wider. Rally does not write `mc.time` (view sync advances it, 3f C3).
   - **Pig Pens (3k C9; replaces 3k's "not adopted" decision):** `createOrbitRig(camera, { target: { x: 0, y: 0.5, z: 1 }, distance: 46, pitch: 0.92, bounds: { x: [-34, 34], z: [-30, 30] }, canvas, fit: { portrait: { yaw: π/2, dist: 60, tx: -3, tz: -9 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } } })` (defaults `min 2.5, max 80, pitchMin 0.28, pitchMax 1.48, yaw 0, ground 0`; chase `lag 2.5, recentre 0.8, lead 0.5, leadMin -1, leadMax 3, follow 5, pitch 0.42, near 9, far 22, ease 2`; `release({ pitch: 0.7, distance: 18 })`), `rig.bindGesture(engine, canvas, { mode: () => driving ? 'chase' : downTool === 'hand' ? 'orbit' : 'none', tapMove: ORBIT_PX })`, read `rig.orbiting` in `devices.js`, `rig.ray` for tool rays, `makeProject` for `view.project`.
   - **Tractor (CI-10; replaces 3l's "keeps render/camera.js"):** one module-level `CAM = {}` passed to every farm's `createChaseRig(camera, CAM)` (heading defaults `distance 12, height 10.2, lag 3, lookAhead 11, lookHeight 0.8, ease 6, slide 2, portrait 1.25, portraitAspect 0.9, shakeTime 0.25`); `?tune` rows write `CAM.distance`/`height`/`lookAhead`; pose `{ x, y, z, yaw, fwd, velYaw: atan2(v.x, v.z) }`; `snap(pose)` on a new farm; `shake(0.35)`/`shake(0.25)` on boop/bump; `blendFrom(showCamera.quaternion)` at the show's end; `rig.yaw ?? tractor.yaw` for the stick (C-2); `makeProject` for `view.project`.
7. **Part poses (Task 13b; user ruling 2026-10-14).** 3c's Task 10b (`partXf`, its swap in `lh.world.swap`, `world.partXfPrev`) must be on `phase-3` before Task 13b; it is in 3c's plan, so 0.8.0 carries it. Spec E-10 gains a line: part poses are swapped with the pose pool. **Forward:** to 3h, its Task 6b (the vehicle kit writes `partXf` for wheels that name a `part`); to 3j, Rally's car is drawn by sync (3j Task 15, closes 3j request 7); to 3k and 3l, drop the wheel-turning code in their sync hooks: name each kit wheel's `part` (3h Task 6b) and keep only static decoration (axis fix, paint) in `create`.
