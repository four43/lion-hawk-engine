# Phase 3l: Tractor Pickup onto the phase 3 engine — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. One dispatch per task; each task is reviewed before the next starts.

**Goal:** Tractor Pickup builds its farm from engine parts: models baked by `lion-hawk bake` into a committed `baked/`, materials from a registry, every Rapier body and collider made by the scene's `World` (the tractor and the two-car hitch on the vehicle kit, the farm ground on the terrain kit), drawn by the engine renderer, view sync, asset loader and material compiler, its sounds on the engine audio service, and its multiplayer replicated through the 3i `net` part (NET_VERSION 4, solid driven trains that honk when they touch). `assets.json`, `bake.mjs`, `build.py`, `sim/physics.js`'s hand-made `RAPIER.World`, `view/bodies.js` and the per-game render bootstrap are deleted. The game ships as Tractor Pickup 1.9.0.

**Architecture:** Five parts, in the order the engine waves land:
- **A (engine 0.8.0) assets:** `game.config.js`, `src/defs/materials.js`, `lion-hawk bake` into `baked/`, `build.hooks.js` for the voice and animal clips, `lion-hawk build`.
- **B (0.8.0) sim:** the farm's `createGame` takes the scene's `World`; `game.step` splits into a `pre` half (the farm scene's `step` hook) and a `post` half (a farm scene system at stage `post`), so the engine's `lh.physics.step` sits exactly where `phys.step()` sat. Surfaces and dirt rates come from the registry (`materialAt`). One golden re-bless under overview §5.5.
- **C (0.9.0) kits:** the terrain kit replaces the hand heightfield and the road's surface lookup; the vehicle kit replaces the raw ray-cast controllers. Second re-bless (cause: the kit runs `updateVehicle` before `lh.physics.step`).
- **D (0.9.0) view:** `defineView({ render })`, `assets.preload` in the farm load, view sync with `sync.on` hooks for the tractor and cars, the compiler (`COVERAGE` for dirt), instancing and fx through the kits, `createAudio` under the game's synth and voice, thumbnails through `snapshot`. Goldens and tapes must not move.
- **E (0.10.0) net:** animals, trees, players and trains become `net` entities; trains are `remote: 'driven'` (user decision 2026-10-13: tractors are solid and honk on contact); NET_VERSION 4; the host/guest syncs keep only their JSON messages and game rules.
- **F final pass:** the overview's Tractor workarounds and the 2g parked minors, build and size report, frame-rate record, 1.9.0.

**Tech Stack:** Node 22 ESM, `node:test`, lion-hawk 0.8.0 → 0.11.0 (`lion-hawk/sim`, `/view`, `/net`, `/test`, `/playwright`, `/bake`, `/build`, `/kits/*`), `@dimforge/rapier3d-compat` 0.21 (injected), three 0.186, playwright-core, happy-dom (engine tests only).

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md` (binding, with deltas D1–D9). Requirement IDs here: E-1…E-13, M-2…M-13, A-1…A-11, B-1…B-3, N-8…N-17, T-5, T-10, T-12, T-13, T-14, S-3, G-4, G-6; Tractor's own spec is `games/tractor-pickup/docs/tractor-pickup-spec.md` (spec 1.12).

**Where the work happens:** four43 worktree `~/projects/four43/four43-lh3-tractor` (overview §6) on branch `feat/lion-hawk-3-tractor`, cut from `feat/lion-hawk-3` (itself from `feat/lion-hawk` e03ed71). Below, `$WT` is that worktree and `$G` is `$WT/games/tractor-pickup`; every path in this plan is relative to `$G` unless it starts with `$WT/` or names the engine. The read-only reference copy of today's game is `~/projects/four43/four43-lion-hawk/games/tractor-pickup` (`$OLD`). `$SCRATCH` is the agent's scratchpad directory.

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

**This plan's own constraints:**

12. Ownership: only `games/tractor-pickup/**` in `$WT`. Never touch other games, `games/test/**`, `games/package.json`, `games/package-lock.json`, `site/**`, or any engine file. `games/tractor-pickup/package.json` is this plan's (it is the game's, not the engine's integrator file).
13. Test commands. In this plan `UNIT <files>` means exactly
    `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$G -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
    and `BROWSER <file>` means exactly
    `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$G -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>`.
    A whole-suite run is `UNIT test/` (it excludes `*.browser.mjs` because only `*.test.mjs` files match the runner's default glob; `npm test` does the same).
14. The `?tune` table (`src/sim/tune.js`) keeps writing the same core objects (`POWER` presets, `TP`, `PILOT`, `TR`, `TREE`) through the sim `tune` command (user rule 2g G4b: tuning goes through game commands; the view writes nothing to the sim). No task may move a tunable into a copy, a material, or the view. Where a kit takes a tuning value (vehicle kit `set(i, {...})`), the game passes the live `TP`/`TR`/`POWER` value every step, never a cached copy.
15. #102 stays fixed: no view module writes `engine.scene.state`, a sim object, an entity or a body. View code reads entities through `world.xf.pool`, `sync`, and entity fields.
16. Feel-sample tolerances (overview §5.5, written before any run): course time ±3 %; animals booped per trip ±1; bump outcome (0.8.0 only, soft bump): bump events per peer ±1 and final tractor separation ±0.5 m. A sample outside its tolerance stops the plan and goes to the user as a playtest item.
17. A golden or tape changes only in the tasks that say so (Tasks 11, 13, 13b, 26). Any other task that moves a checksum is a bug: stop and investigate.
18. Every `// lh-allow: <reason>` line is listed in `docs/plans/2026-10-13-phase-3l-tractor-notes.md` § "lh-allow lines".

---

## Review Focus (the five failure modes most likely to bite; each pinned by a test)

1. **The heightfield transposed.** Tractor's grid is x-major (`heights[i*n+j]`, i = x); `world.heightfield` and the terrain kit take row-major `heights[iz*nx+ix]`. A missing or doubled transpose mirrors the farm across the diagonal: the tractor drives through cuttings and sinks into banks. Pinned by `test/ground.test.mjs` "ray casts land on terrain.height at asymmetric points" (Task 5, mutation step) and again on the kit (Task 12).
2. **The pre/post split reorders the step.** Moving `phys.step()` out of `game.step` into the engine's `physics.world` stage must keep everything that ran after it (herd, boops, flights, riders, barn, dirt, sync.after) after it, in the same step, and must not run the post half during a load or twice. Pinned by `test/split.test.mjs` "post runs once per stepped pre, never during a load" and by the unchanged first differing step between Tasks 9 and 10 (Tasks 8–11).
3. **Mass and friction drift.** Massless-collider + `setAdditionalMassProperties` (tractor), per-collider `setMass` (trailer, props) and Rapier's default `Average` combine all change under the World. Pinned by `test/mass.test.mjs` (tractor 1400 kg ± 0.1 % with the tuned inertia, each car 265 kg ± 0.5 %, bale/cone/barrel 150/2/25 kg) and by the feel samples (Tasks 6, 7, 11).
4. **Driven trains diverge or double-honk.** Remote trains are solid jointed bodies (the tractor and its linked trailer and wagon entities, 3i Contract issue 1) stepped from replicated input and corrected by the net part. Pinned by `test/net.bump.test.mjs`: two sims collide, both get exactly one `bump` per contact episode (debounce), both peers within 0.5 m of the owner's pose 1 s after contact under 80 ms latency and 2 % loss, no correction over `snapAt` during the bump (Tasks 23, 24, 26).
5. **View changes moving a checksum, or the view writing the sim.** Pinned by `test/view.purity.test.mjs` (no assignment to `engine.scene.state`, `e.*` or a Rapier setter in `src/view/**`, `src/render/**`, `src/game.view.js`) and by re-running the goldens and tapes unchanged after every view task (Tasks 14–20, 25).

---

## File Structure

New files:

| File | Responsibility |
|---|---|
| `game.config.js` | CLI config (§4.3): id, site, `outEnv: 'TRACTOR_OUT'`, bake (renames, palette, sockets, anim tables, barn static/keepTextures), build (entry, template, pwa, hooks). Node only. |
| `build.hooks.js` | B-2 hooks: trims and levels `audio/voice/*.mp3` and `audio/animals/*.mp3` (ffmpeg when present), embeds them as `window.__VOICE__` / `window.__ANIMALS__` at `<!--VOICE-->`. |
| `src/defs/materials.js` | The registry: surfaces (`route`, `meadow`, `mudhole`) with `game: { surface, grip, vmul, dirt, scaled }`, collider materials, art materials for the bake renames, `gold`. Sim-pure. |
| `baked/` (generated, committed) | `phys.json`, `manifest.json`, `models/*.glb`, `models/*.anim.json` (D2). |
| `src/sim/ground.js` | Replaces `sim/physics.js`: `GROUPS`, `DT`, `addGround(world, { terrain })` (0.8.0 heightfield / slab; 0.9.0 terrain kit), `rayFilter`. |
| `src/sim/trains.js` | Part E: remote trains: spawn desc and attach hooks for the TRAIN kind, and `stepRemoteTrains(world)` from replicated input. |
| `src/view/vehicles.js` | Part D: `sync.on('#tractor'|'#car')` hooks: model axis fix and the car's second wheel node (view sync draws the wheels from the kit's part poses, 3g Task 13b), the engine's paint through `view.materials.repaint` (3f Task 8b: shading kept, rainbow a hue ramp), away ghost on per-entity materials; `PAINTS`, `RAINBOW`, `PAINT_LOOK`, `paintValues`. Replaces `render/vehicles3d.js`, `render/others3d.js`, `view/bodies.js`. |
| `src/view/pets.js` | Part D: Cube Pet part meshes from `assets.get(key)` + `sampleAnimTable`; replaces `render/gfx.js`'s `animM`/`sampleAnim`/`PET_ANIMS`. |
| `src/view/riders.js` | Part E: other players' carried riders from train entity `riders` (slot riders placed in the drawn car; flying riders interpolated view-side, D8 `forecast` not needed). Read-only (#102). |
| `test/helpers/world.mjs` | `testWorld({ terrain, sandbox })`: a headless World with Tractor's materials and groups, plus `step(pre)`. |
| `test/helpers/feel.mjs` | The §5.5 feel samples: `courseRun(seed)`, `bumpRun()`. |
| `test/feel-baseline.json` | Pre-swap feel samples (Task 1), then the post-swap rows appended by Tasks 10 and 12. |
| `test/fixtures/assets-counts.json` | Per model, per part vertex and index counts read once from today's `src/assets.json` (Task 3), so the parity test outlives `assets.json`. |
| `test/materials.test.mjs`, `test/bake.test.mjs`, `test/parity.test.mjs`, `test/build.hooks.test.mjs`, `test/ground.test.mjs`, `test/mass.test.mjs`, `test/split.test.mjs`, `test/checks.test.mjs`, `test/surface.test.mjs`, `test/kits.test.mjs`, `test/view.purity.test.mjs`, `test/view.rig.test.mjs`, `test/view.sync.test.mjs`, `test/net.kinds.test.mjs`, `test/net.driven.test.mjs`, `test/net.bump.test.mjs`, `test/perf.browser.mjs`, `test/net.peers.browser.mjs` | New tests (one file each, named per task). |

Modified files (kept, rewritten in part):

| File | Change |
|---|---|
| `package.json` | scripts `bake`, `build`, `dev`, `test:e2e` on the CLI; version 1.9.0 (Task 29); drops `pngjs`/`@gltf-transform/*` only if `models.mjs` no longer needs them (it does: they stay). |
| `pwa/sw.js` | `__PRECACHE__` replaces the literal list. |
| `template.html` | one markup change (Task 4): `<script><!--APP--></script>` becomes a bare `<!--APP-->` (3d's build writes the inline `<script type="module">` there and fails on a marker inside a `<script>`); keeps `<script><!--VOICE--></script>` (the game's own hook marker). |
| `src/game.sim.js` | `physics`, `defs`, `net.world`, `reset()`; timer through `createEngine`'s option. |
| `src/game/farm.js` | scene builds through `ctx.world`; `world.clear()` on rebuild; pre/post split; post system. |
| `src/sim/game.js`, `tractor.js`, `hitch.js`, `trees.js`, `scenery.js`, `sandbox.js`, `dirt.js`, `road.js`, `terrain.js`, `bump.js`, `herd.js` (Part E: entity per animal), `tune.js` (defaults + reset) | onto the World, registry and kits. |
| `src/net/kinds.js`, `bindings.js`, `protocol.js`, `host.js`, `guest.js`, `players.js`, `game/net.js` | Part E. |
| `src/game.view.js`, `src/main.js`, `src/view/world.js`, `src/view/rig.js` (Task 14: a thin wrapper over the engine's `createChaseRig`, CI-10), `src/view/hud.js`, `src/render/farm3d.js`, `animals3d.js`, `fx.js` (on the fx kit's `createParticles`/`createMarks`), `gibs.js`, `textures.js`, `hornMarks.js`, `src/ui/icons.js`, `src/ui/stickerArt.js`, `src/ui/debug.js`, `src/audio/sound.js`, `src/audio/voice.js` | Part D. |
| `test/*.test.mjs` that build a physics world (`tractor`, `hitch`, `pilot`, `bump`, `trees`, `yard`, `terrain`, `sandbox`, `game`, `dirt`, `golden`, `golden-farm`, `tape`, `tune`, `mp.*`, `assets`, `purity`, `serve.mjs`, `e2e.browser.mjs`) | moved onto the helpers; `assets.test.mjs` reads the baked GLBs. |

Deleted: `bake.mjs`, `build.py`, `src/assets.json`, `src/net/bindings.js` (Task 22), `src/sim/physics.js`, `src/render/gfx.js`, `src/render/warm.js`, `src/render/matSplit.js`, `src/render/shadows.js`, `src/render/dispose.js`, `src/render/scene.js`, `src/render/dirtMat.js` (unless Task 16's gold fallback keeps it, see there), `src/render/vehicles3d.js`, `src/render/others3d.js`, `src/render/camera.js` (Task 14, CI-10: the engine's chase rig), `src/view/bodies.js`, `test/mp.harness.mjs`'s old-world half and the `TP_MP` switch (Task 22), `test/matSplit.test.mjs`, `test/shadows.test.mjs`, `test/warm.test.mjs`. `models.mjs` and `tools/glb.mjs` stay as authoring tools (overview §5.4).

---

## Part A — assets and build (needs engine 0.8.0)

### Task 1: Worktree, baselines and the feel samples

**Files:** create `test/helpers/feel.mjs`, `test/feel-baseline.json`; create the notes file `docs/plans/2026-10-13-phase-3l-tractor-notes.md` in the **engine** repo is the controller's; this task writes the game-side numbers into `$G/docs/lh3-baseline.md` (new, game docs).

**Interfaces:** Consumes `headless`, `mp` (lion-hawk/test 0.8.0), `tractorGame`, `moveTrain` (`src/game/farm.js`). Produces `courseRun({ seed, route, cap }) → { seconds, boops }`, `bumpRun({ seconds }) → { bumps: [host, guest], separation }`.

- [ ] **Step 1: Make the worktree** (integrator has created `feat/lion-hawk-3`):

```bash
cd ~/projects/four43/four43 && git worktree add ~/projects/four43/four43-lh3-tractor -b feat/lion-hawk-3-tractor feat/lion-hawk-3
cd ~/projects/four43/four43-lh3-tractor/games && npm install
```
Expected: `npm install` ends without errors; `ls node_modules/lion-hawk` resolves to the engine checkout (0.8.0 or later: `node -e "import('lion-hawk/sim').then(m=>console.log(m.ENGINE_VERSION))"` prints `0.8.x`).

- [ ] **Step 2: Build today's game once, for the R1/R3 comparisons later** (nothing under `site/`):

```bash
cd $G && TRACTOR_OUT=$SCRATCH/tractor-old python3 build.py
ls -l $SCRATCH/tractor-old/index.html && gzip -9 -c $SCRATCH/tractor-old/index.html | wc -c
```
Record both numbers in `docs/lh3-baseline.md` under "R3 today". Keep `$SCRATCH/tractor-old` until Task 30.

- [ ] **Step 3: Write the feel helper** `test/helpers/feel.mjs`:

```js
// test/helpers/feel.mjs — the overview §5.5 feel samples for Tractor Pickup (3l). No tests here. Run directly to print them:
//   node test/helpers/feel.mjs  →  { course: { seconds, boops }, bump: { bumps, separation } }
// courseRun: seed 14, started, trip off. The train is placed on route 0's third point facing along it; each step the stick points at
// the route point 12 m past the nearest one (searched forward from the last, so the run never jumps to another part of the route);
// the run ends within 8 m of the route's last point, or at `cap` s. boops: 'boop' events on the way (the herd is on the road).
// bumpRun: two peers (host seed 21); after the welcome the guest's train is turned to face the host's, 12 m apart, and both
// drive at each other for `seconds`. bumps: 'bump' events per peer; separation: the two tractors' distance at the end (each from its own sim).
import { pathToFileURL } from 'node:url';
import { headless, mp } from 'lion-hawk/test';
import { tractorGame } from '../../src/game.sim.js';
import { moveTrain } from '../../src/game/farm.js';

const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export function courseRun({ seed = 14, route = 0, cap = 240 } = {}) {
  const h = headless(tractorGame(), { args: { seed, started: true, trip: false } });
  h.step(1);
  const s = h.engine.scene.state, R = s.game.road.routes[route].pts, last = R.length - 1;
  moveTrain(s.game, R[2].x, R[2].z, yawTo(R[2], R[3]), { ground: true });
  let boops = 0, k = 2, steps = 0;
  const off = h.engine.events.on(e => { if (e.type === 'boop') boops++; });
  for (; steps < cap * 60; steps++) {
    const t = s.game.tractor;
    if (Math.hypot(R[last].x - t.x, R[last].z - t.z) < 8) break;
    for (let j = k; j < Math.min(last, k + 40); j++) if (Math.hypot(R[j].x - t.x, R[j].z - t.z) < Math.hypot(R[k].x - t.x, R[k].z - t.z)) k = j;
    const g = R[Math.min(last, k + 12)], d = Math.hypot(g.x - t.x, g.z - t.z) || 1;
    h.step(1, { goX: (g.x - t.x) / d, goZ: (g.z - t.z) / d });
  }
  off();
  return { seconds: steps / 60, boops };
}
export function bumpRun({ seconds = 3 } = {}) {
  const w = mp(tractorGame(), { peers: 2, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  const bumps = [0, 0];
  w.peers.forEach((p, i) => p.engine.events.on(e => { if (e.type === 'bump') bumps[i]++; }));
  w.seconds(3);
  const gs = w.peers.map(p => p.engine.scene.state.game), [a, b] = gs.map(g => g.tractor);
  moveTrain(gs[1], a.x + Math.sin(a.yaw) * 12, a.z + Math.cos(a.yaw) * 12, a.yaw + Math.PI, { ground: true });
  w.seconds(seconds, (p, i) => { const t = gs[i].tractor; return { goX: Math.sin(t.yaw), goZ: Math.cos(t.yaw) }; });
  return { bumps, separation: Math.hypot(a.x - b.x, a.z - b.z) };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const R = (await import('@dimforge/rapier3d-compat')).default; await R.init();
  console.log(JSON.stringify({ course: courseRun(), bump: bumpRun() }));
}
```
(`tractorGame()`'s tests already `await R.init()` at the top of each file; the CLI guard does it for a direct run.)

- [ ] **Step 4: Record the pre-swap samples.**

```bash
systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$G -E NODE_OPTIONS=--max-old-space-size=512 node test/helpers/feel.mjs | tee $SCRATCH/feel-pre.json
```
Expected: one JSON line; `course.seconds` between 20 and 240 (a run that hits the cap means the autopilot is stuck: fix the helper before going on, never the game); `bump.bumps` both ≥ 1. Write `test/feel-baseline.json`:

```json
{ "tolerance": { "seconds": 0.03, "boops": 1, "bumps": 1, "separation": 0.5 },
  "rows": [ { "at": "pre-swap (e03ed71 game, engine 0.8.0)", "course": <course>, "bump": <bump> } ] }
```

- [ ] **Step 5: Run the whole suite once on the new engine** (nothing changed yet): `UNIT test/`. Expected: same count as at e03ed71 (774 at G7 plus the bind tests: compare with `git log -1 --format=%h` notes; any failure here is an engine 0.8.0 regression: stop and report it to the integrator).

- [ ] **Step 6: Commit**

```bash
git add test/helpers/feel.mjs test/feel-baseline.json docs/lh3-baseline.md
git commit -m "test(tractor): feel samples and R3 baseline before the phase 3 migration"
```

### Task 2: The material registry

**Files:** create `src/defs/materials.js`, `test/materials.test.mjs`; modify `test/purity.test.mjs` (adds `defs` to the sim roots).

**Interfaces:** Consumes `defineMaterials` (lion-hawk/sim, §4.2). Produces the default export `MATERIALS` (a frozen registry) and `SURFACE_IDS = ['route', 'meadow', 'mudhole']`.

- [ ] **Step 1: Failing test** `test/materials.test.mjs`:

```js
// Tractor's material registry (3l Task 2, M-2, D6): surfaces carry the old SURFACE grip/vmul and DIRT per-second rates in their
// game block; collider materials reproduce today's frictions and the trailer's per-collider masses; every bake rename target exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS, { SURFACE_IDS } from '../src/defs/materials.js';

test('surfaces keep the old grip, vmul and dirt rates, and name their legacy surface', () => {
  const g = id => MATERIALS.get(id).game;
  assert.deepEqual(SURFACE_IDS, ['route', 'meadow', 'mudhole']);
  assert.deepEqual(g('route'), { surface: 'gravel', grip: 1, vmul: 1, dirt: 0.006, scaled: true });
  assert.deepEqual(g('meadow'), { surface: 'grass', grip: 0.8, vmul: 0.7, dirt: 0.004, scaled: true });
  assert.deepEqual(g('mudhole'), { surface: 'mud', grip: 0.55, vmul: 0.5, dirt: 0.6, scaled: false });
  for (const id of SURFACE_IDS) assert.ok(MATERIALS.index(id) < 255);
});
test('collider frictions and restitutions are today\'s literals', () => {
  const f = id => MATERIALS.get(id).phys;
  for (const [id, fr, re] of [['ground', 0.6, 0], ['pad', 0.9, 0], ['ramp', 0.9, 0], ['chassis', 0.2, 0], ['bed', 0.2, 0], ['tongue', 0.5, 0], ['fence', 0.1, 0], ['trunk', 0.1, 0], ['prop', 0.6, 0.1]]) {
    assert.equal(f(id).friction, fr, id); assert.equal(f(id).restitution ?? 0, re, id);
  }
});
test('the trailer bed and tongue densities give today\'s setMass masses (260 kg, 5 kg)', () => {
  assert.ok(Math.abs(MATERIALS.density('bed') * 2.8 * 0.3 * 2 - 260) < 1e-6);
  assert.ok(Math.abs(MATERIALS.density('tongue') * 1.8 * 0.12 * 0.16 - 5) < 1e-6);
});
test('every bake rename target and paint base is in the registry', async () => {
  const cfg = (await import('../game.config.js')).default.bake, ids = new Set();
  const add = r => Object.values(r?.materials ?? {}).forEach(v => ids.add(v));
  add(cfg.rename); for (const m of Object.values(cfg.models)) add(m.rename);
  ids.add(cfg.paint.base); for (const id of ['grass', 'gold']) ids.add(id);
  for (const id of ids) assert.ok(MATERIALS.has(id), id);
});
test('dirt-taking materials accept the dirt coverage layer (the compiler\'s COVERAGE define)', () => {
  for (const id of ['chassis', 'bed', 'pet', 'gold']) assert.equal(MATERIALS.get(id).coverage.dirt, 1, id);
});
```
(The last-but-one test needs `game.config.js` from Task 3; it is written now and expected to fail with `ERR_MODULE_NOT_FOUND` until Task 3.)

- [ ] **Step 2: Run** `UNIT test/materials.test.mjs`. Expected: FAIL, `Cannot find module '../src/defs/materials.js'`.

- [ ] **Step 3: Implement** `src/defs/materials.js`:

```js
// Tractor Pickup's materials (lion-hawk 3l, M-2, D6). Sim-pure data: the sim reads surfaces and colliders, the bake checks the renamed
// glTF materials, the view compiles the looks. Surfaces: the old SURFACE grip/vmul (sim/tractor.js) and DIRT per-second rates
// (sim/dirt.js) moved into each surface's game block; `surface` keeps the legacy name the view, the sounds and the events use;
// `scaled`: the rate grows with the speed fraction (gravel, grass) or not (mud). Colliders: today's literal frictions. The trailer's
// bed and tongue reproduce their setMass masses through `fill` (density × volume, M-6): 260 kg over 2.8 × 0.3 × 2 m, 5 kg over 1.8 × 0.12 × 0.16 m.
import { defineMaterials } from 'lion-hawk/sim';

export const SURFACE_IDS = Object.freeze(['route', 'meadow', 'mudhole']);
const dirty = { coverage: { dirt: 1 } };
export default defineMaterials({
  // surfaces (materialAt)
  route:   { extends: 'gravel', game: { surface: 'gravel', grip: 1, vmul: 1, dirt: 0.006, scaled: true } },
  meadow:  { extends: 'grass', game: { surface: 'grass', grip: 0.8, vmul: 0.7, dirt: 0.004, scaled: true } },
  mudhole: { extends: 'mud', game: { surface: 'mud', grip: 0.55, vmul: 0.5, dirt: 0.6, scaled: false } },
  // colliders
  ground:  { extends: 'dirt', phys: { friction: 0.6, restitution: 0 } },
  pad:     { extends: 'gravel', phys: { friction: 0.9, restitution: 0 } },
  ramp:    { extends: 'wood', phys: { friction: 0.9, restitution: 0 } },
  chassis: { extends: 'steel', phys: { friction: 0.2, restitution: 0 }, ...dirty },
  bed:     { extends: 'wood', phys: { friction: 0.2, restitution: 0, sg: 1, fill: 260 / 1.68 / 1000 }, ...dirty },
  tongue:  { extends: 'steel', phys: { friction: 0.5, restitution: 0, sg: 1, fill: 5 / 0.03456 / 1000 } },
  fence:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  trunk:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  prop:    { extends: 'wood', phys: { friction: 0.6, restitution: 0.1 } },
  // art (bake renames, overview §5.4); vertex colours give the colour (D5)
  pet:     { extends: 'flesh', look: { roughness: 1, metalness: 0 }, ...dirty },
  gold:    { extends: 'steel', look: { color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' }, ...dirty },
  leaf:    { extends: 'grass', look: { roughness: 1 } },
  petal:   { extends: 'grass', look: { roughness: 1 } },
  crop:    { extends: 'grass', look: { roughness: 1 } },
  stone:   { extends: 'gravel', look: { roughness: 1 } },
});
```

- [ ] **Step 4: Add the defs root to the purity test.** In `test/purity.test.mjs` replace
`const SIM = ['game.sim.js', 'game', 'sim', ...NET].map(...)` with
`const SIM = ['game.sim.js', 'game', 'sim', 'defs', ...NET].map(p => p.startsWith('/') ? p : join(src, p));`

- [ ] **Step 5: Run** `UNIT test/materials.test.mjs test/purity.test.mjs`. Expected: PASS except "every bake rename target…" (FAIL until Task 3, `Cannot find module '../game.config.js'`). If `defineMaterials` rejects `fill` above 1 or `sg` beside `extends`, that is a 3b validation message naming the field: fix the value, never the test.

- [ ] **Step 6: Commit** `git add src/defs/materials.js test/materials.test.mjs test/purity.test.mjs && git commit -m "feat(tractor): material registry with surfaces, collider materials and art ids"`

### Task 3: `game.config.js`, the bake and the parity test

**Files:** create `game.config.js`, `test/fixtures/assets-counts.json`, `test/bake.test.mjs`, `test/parity.test.mjs`; generate and commit `baked/**`; modify `package.json` (`"bake": "lion-hawk bake"`, devDependency `meshoptimizer` at the engine's version); delete `bake.mjs`.

**Interfaces:** Consumes `lion-hawk bake` (§4.3), `validatePhys`, `SIDECAR_VERSION` (lion-hawk/sim). Produces `baked/phys.json` (`{ v, engine, materials, models }`), `baked/manifest.json`, `baked/models/<id>.glb`, `baked/models/<pet>.anim.json`.

- [ ] **Step 1: Freeze today's counts** (from the read-only copy, before anything is deleted):

```bash
cd $G && node -e "
const A=require('$OLD/src/assets.json'),o={};
for(const[k,v]of Object.entries(A)){const parts=Array.isArray(v.parts)?v.parts:Object.entries(v).map(([n,p])=>({name:n,...p}));
o[k]=Object.fromEntries(parts.map(p=>[p.name,{v:p.pos.length/3,i:p.idx.length}]));}
require('fs').writeFileSync('test/fixtures/assets-counts.json',JSON.stringify(o,null,1));"
```
Expected: a file with 40 model keys (`node -e "console.log(Object.keys(require('./test/fixtures/assets-counts.json')).length)"` prints 40).

- [ ] **Step 2: Failing tests.** `test/parity.test.mjs`:

```js
// Overview §5.3-1: per model and part, the baked GLB has today's vertex and triangle counts (assets.json, frozen in
// test/fixtures/assets-counts.json). A part name that appears twice in a model (corn's four 'corn' nodes) is compared with the last
// one, as assets.json kept only the last (its keys were node names).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const OLD = JSON.parse(fs.readFileSync(new URL('./fixtures/assets-counts.json', import.meta.url)));
const MAN = JSON.parse(fs.readFileSync(new URL('../baked/manifest.json', import.meta.url)));

async function counts(id) {
  const doc = await io.read(new URL(`../baked/${MAN.models[id].glb}`, import.meta.url).pathname), out = {};
  for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; let v = 0, i = 0;
    for (const p of m.listPrimitives()) { const c = p.getAttribute('POSITION').getCount(); v += c; i += p.getIndices()?.getCount() ?? c; }
    out[n.getName()] = { v, i }; }
  return out;
}
test('every model of today is baked', () => { assert.deepEqual(Object.keys(MAN.models).sort(), Object.keys(OLD).sort()); });
for (const id of Object.keys(OLD)) test(`${id}: parts keep their vertex and triangle counts`, async () => {
  const now = await counts(id);
  for (const [part, c] of Object.entries(OLD[id])) { assert.ok(now[part], `${id}.${part} missing`); assert.deepEqual(now[part], c, `${id}.${part}`); }
});
```
`test/bake.test.mjs`:

```js
// The bake's output (3l Task 3, A-1…A-6, D2): fresh against its sources, valid, keyed to this registry, with hat sockets and anim tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhys } from 'lion-hawk/sim';
import MATERIALS from '../src/defs/materials.js';
const root = fileURLToPath(new URL('..', import.meta.url)), read = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const PHYS = read('baked/phys.json'), MAN = read('baked/manifest.json');
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'];
const CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'];
const cli = path.join(path.dirname(fileURLToPath(import.meta.resolve('lion-hawk/package.json'))), 'bin/lion-hawk.js');

test('lion-hawk bake --check: the committed bake matches its sources, the registry and the engine', () => {
  const r = spawnSync(process.execPath, [cli, 'bake', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('phys.json is valid and keyed to this registry (T-14)', () => {
  validatePhys(PHYS); assert.equal(PHYS.materials, MATERIALS.hash);
});
test('every pet has a hat socket and an anim table with the eight clips at 30 fps', () => {
  for (const pet of PETS) {
    assert.ok(PHYS.models[pet].sockets.hat, `${pet} hat`);
    const a = read(`baked/${MAN.models[pet].anim}`); assert.equal(a.fps, 30); assert.deepEqual(Object.keys(a.clips).sort(), [...CLIPS].sort());
  }
});
test('the tractor keeps its paint slots and the barn its UVs', async () => {
  const { NodeIO } = await import('@gltf-transform/core'), { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'), { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const mats = d => new Set(d.getRoot().listMaterials().map(m => m.getName()));
  const t = await io.read(path.join(root, 'baked', MAN.models.tractor.glb)); for (const n of ['paint-body', 'paint-trim', 'chassis']) assert.ok(mats(t).has(n), n);
  const b = await io.read(path.join(root, 'baked', MAN.models.barn.glb));
  const walls = b.getRoot().listNodes().find(n => n.getName() === 'walls'); assert.ok(walls.getMesh().listPrimitives()[0].getAttribute('TEXCOORD_0'), 'barn walls keep UVs');
});
```

- [ ] **Step 3: Run** `UNIT test/parity.test.mjs test/bake.test.mjs`. Expected: FAIL, `ENOENT … baked/manifest.json`.

- [ ] **Step 4: Write** `game.config.js`:

```js
// Tractor Pickup for the lion-hawk CLI (3l, overview §4.3). Node only. `lion-hawk bake` turns assets/models/*.glb (made by
// models.mjs from the Kenney pack, vertex-coloured) into baked/; `lion-hawk build --out <dir>` (or $TRACTOR_OUT) makes the page.
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'];
const CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'];
const as = (from, to) => ({ rename: { materials: { [from]: to } } });
export default {
  id: 'tractor-pickup', site: 'tractor-pickup', outEnv: 'TRACTOR_OUT',
  bake: {
    src: 'assets/models', out: 'baked', materials: './src/defs/materials.js',
    palette: 'vertex', paint: { base: 'chassis' },
    rename: {
      materials: { colormap: 'pet', color: 'wood', woodBark: 'wood', woodDark: 'wood', woodInner: 'wood', leafsGreen: 'leaf', leafsFall: 'leaf',
        dirt: 'stone', _defaultMat: 'stone', corn: 'crop', colorRed: 'petal', colorYellow: 'petal' },
    },
    models: { // the hat empty is a socket on the pets only (3d: node renames are per model)
      ...Object.fromEntries(PETS.map(p => [p, { animTable: { fps: 30, clips: CLIPS }, sockets: ['hat'], rename: { nodes: { hat: 'sock-hat' } } }])),
      tractor: { rename: { materials: { colormap: 'chassis', tractor: 'chassis' } } },
      trailer: as('color', 'bed'), cone: as('color', 'plastic'), bale: as('color', 'crop'), hay: as('colormap', 'crop'),
      'hat-cowboy': as('color', 'fabric'), 'hat-party': as('color', 'fabric'), 'hat-straw': as('color', 'fabric'),
      sprinkler: as('color', 'steel'), wash: as('color', 'steel'), shrub: as('color', 'leaf'),
      barn: { static: true, keepTextures: true, rename: { materials: { planks: 'wood', shingles: 'wood' } } },
    },
    optimise: { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true },
  },
  build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: './build.hooks.js' },
};
```

- [ ] **Step 5: Bake and look.**

```bash
cd $G && npx lion-hawk bake && ls baked baked/models | head -60 && du -sh baked
```
Expected: `baked/phys.json`, `baked/manifest.json`, 40 `.glb`, 8 `.anim.json`. A bake error names `bake: <model>: <node|material> <problem>`: fix the rename table in `game.config.js` (never the GLB sources; `models.mjs` stays the authoring path).

- [ ] **Step 6: Run** `UNIT test/parity.test.mjs test/bake.test.mjs test/materials.test.mjs`. Expected: PASS. **(judgment)** If only vertex counts differ (the bake's `weld` merged vertices `writeTris` had already welded to 4 decimals) while triangle counts match, do not loosen the test: set `optimise.weld: false` for that model in `game.config.js`, re-bake, and record the model in the notes. Expected decision: weld stays on everywhere (models.mjs output is already welded, so weld is a no-op).

- [ ] **Step 7: Prove the parity test can fail.** Temporarily edit `test/fixtures/assets-counts.json`: `pig.body.v += 1`; run `UNIT test/parity.test.mjs`; expected FAIL naming `pig.body`; revert with `git checkout test/fixtures/assets-counts.json`.

- [ ] **Step 8: Delete the old bake**: `git rm bake.mjs`; in `package.json` set `"bake": "lion-hawk bake"` and add `"meshoptimizer"` to `devDependencies` with the engine's range (read it from `$WT/../../lion-hawk-engine/package.json`'s dependencies). `assets.test.mjs` still reads `src/assets.json` (deleted in Task 17); leave it for now.

- [ ] **Step 9: Commit** `git add game.config.js baked test/fixtures/assets-counts.json test/parity.test.mjs test/bake.test.mjs package.json && git commit -m "feat(tractor): bake the models with lion-hawk bake into baked/ (D2), parity with assets.json"`. Integrator request 1 (lockfile) applies.

### Task 4: Build with `lion-hawk build`: audio hooks, the precache list, the e2e server

**Files:** create `build.hooks.js`, `test/build.hooks.test.mjs`; modify `template.html` (the `<!--APP-->` marker only), `pwa/sw.js`, `package.json` (scripts), `test/serve.mjs`, `README.md` (build lines); delete `build.py`.

**Interfaces:** Consumes the CLI build (§4.3: `hooks.beforePage(ctx)`, `hooks.page(html, ctx) → html`, `__PRECACHE__`, `__VERSION__`) and the programmatic `build({ game, out, env, site, mode, e2e, entry, log }) → Promise<{ out, version, hash, files, sizes }>` from `lion-hawk/build` (3d Task 13; CI-7 settled: there is no `report` member, the size report goes to `log`; hooks get `ctx = { config, game, out, e2e, version, engine, log }`). The template's `<!--APP-->` is bare: 3d writes an inline `<script type="module">` there and fails the build on a marker inside a `<script>`. Produces `collectAudio({ root, ffmpeg, log }) → { voice, animals }`, `audioScript({ voice, animals }) → string`, `beforePage`, `page`.

- [ ] **Step 1: Failing test** `test/build.hooks.test.mjs`:

```js
// build.hooks.js (3l Task 4, B-2, overview §5.4 "Builds"): the voice and animal clips embedded as data URLs, as build.py did.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAudio, audioScript, beforePage, page } from '../build.hooks.js';

const tree = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hooks-'));
  for (const f of ['audio/voice/pig.mp3', 'audio/voice/one.mp3', 'audio/animals/pig.mp3', 'audio/animals/pig-2.mp3', 'audio/animals/cow.mp3']) {
    fs.mkdirSync(path.join(d, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(d, f), Buffer.from(f));
  }
  return d;
};
test('voice clips by name, animal takes grouped by type in file order, as data URLs', () => {
  const a = collectAudio({ root: tree(), ffmpeg: false, log: () => {} });
  assert.deepEqual(Object.keys(a.voice).sort(), ['one', 'pig']);
  assert.equal(a.voice.pig, 'data:audio/mpeg;base64,' + Buffer.from('audio/voice/pig.mp3').toString('base64'));
  assert.deepEqual(Object.keys(a.animals).sort(), ['cow', 'pig']); assert.equal(a.animals.pig.length, 2);
  assert.equal(a.animals.pig[1], 'data:audio/mpeg;base64,' + Buffer.from('audio/animals/pig-2.mp3').toString('base64'));
});
test('page() puts window.__VOICE__ and window.__ANIMALS__ where <!--VOICE--> was, once', () => {
  const html = page('<script><!--VOICE--></script><!--APP-->', {});
  assert.match(html, /^<script>window\.__VOICE__=\{.*\};window\.__ANIMALS__=\{.*\};<\/script><!--APP-->$/s);
  assert.throws(() => page('<html></html>', {}), /no <!--VOICE-->/);
});
test('audioScript is JSON (a clip can never close the script tag)', () => {
  const s = audioScript({ voice: { a: 'data:x' }, animals: { pig: ['data:y'] } });
  assert.equal(s, 'window.__VOICE__={"a":"data:x"};window.__ANIMALS__={"pig":["data:y"]};');
});
test('sw.js takes the precache list and the version from the build', () => {
  const sw = fs.readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const PRECACHE = __PRECACHE__;/); assert.match(sw, /'tractor-pickup-__VERSION__'/);
});
test('the template has one bare <!--APP--> (3d writes the module script; a marker inside <script> fails the build)', () => {
  const html = fs.readFileSync(new URL('../template.html', import.meta.url), 'utf8');
  assert.equal(html.split('<!--APP-->').length, 2); assert.doesNotMatch(html, /<script\b[^>]*>\s*<!--APP-->/i);
});
test('an e2e build embeds no clips (ctx.e2e: speech and the synth fill in, no ffmpeg)', () => {
  beforePage({ e2e: true, log: () => {} });
  assert.equal(page('<script><!--VOICE--></script>', {}), '<script>window.__VOICE__={};window.__ANIMALS__={};</script>');
});
```

- [ ] **Step 2: Run** `UNIT test/build.hooks.test.mjs`. Expected: FAIL, `Cannot find module '../build.hooks.js'`.

- [ ] **Step 3: Implement** `build.hooks.js`:

```js
// lion-hawk build hooks for Tractor Pickup (3l, B-2; build.py's audio half, moved): spec 12.2 trims silence and evens out loudness of
// each audio/voice/<id>.mp3 and audio/animals/<type>[-n].mp3 (with ffmpeg; without it the clips go in as they are, with a warning, D-8),
// and the page carries them as data URLs: window.__VOICE__ { id: url } and window.__ANIMALS__ { type: [url, ...] } (E-2). Node only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILTER = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.05,areverse,loudnorm=I=-16:TP=-1.5';
export const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const url = buf => 'data:audio/mpeg;base64,' + buf.toString('base64');

function clip(src, dst, ffmpeg, log) {
  if (ffmpeg) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', FILTER, '-ac', '1', '-b:a', '64k', dst]);
    if (r.status !== 0) throw new Error(`build.hooks: ffmpeg failed on ${src}: ${r.stderr}`);
  } else { log(`WARNING: ffmpeg not found: ${path.basename(src)} is not trimmed or levelled (D-8)`); fs.copyFileSync(src, dst); }
  return fs.readFileSync(dst);
}
const mp3s = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp3')).sort() : [];
export function collectAudio({ root = HERE, ffmpeg = hasFfmpeg(), log = console.log } = {}) {
  const voice = {}, animals = {};
  for (const [kind, put] of [['voice', (f, b) => { voice[f.slice(0, -4)] = url(b); }], ['animals', (f, b) => { (animals[f.split('-')[0].replace(/\.mp3$/, '')] ??= []).push(url(b)); }]]) {
    const src = path.join(root, 'audio', kind), out = path.join(root, 'build', kind); fs.mkdirSync(out, { recursive: true });
    for (const f of mp3s(src)) put(f, clip(path.join(src, f), path.join(out, f), ffmpeg, log));
  }
  log(`voice clips ${Object.keys(voice).length}; animal clips ${JSON.stringify(Object.fromEntries(Object.entries(animals).map(([k, v]) => [k, v.length])))}`);
  return { voice, animals };
}
export const audioScript = ({ voice, animals }) => 'window.__VOICE__=' + JSON.stringify(voice) + ';window.__ANIMALS__=' + JSON.stringify(animals) + ';';
let audio = null;
export function beforePage(ctx = {}) { audio = ctx.e2e ? null : collectAudio({ log: ctx.log ?? console.log }); } // 3d: --e2e sets ctx.e2e (no clips, no ffmpeg)
export function page(html) {
  if (!html.includes('<!--VOICE-->')) throw new Error('build.hooks: the template has no <!--VOICE--> marker');
  return html.replace('<!--VOICE-->', () => audioScript(audio ?? { voice: {}, animals: {} }));
}
```
(`page()` without clips embeds empty tables, which is what the tests and the e2e build want; the CLI always awaits `beforePage(ctx)` first.)

- [ ] **Step 4: Template marker and precache list.** In `template.html` replace `<script><!--APP--></script>` with a bare `<!--APP-->` (3d's `fillTemplate` writes `<script type="module">…</script>` there; today's wrapped marker fails the build with "<!--APP--> sits inside a <script>"). Nothing else in the markup changes: the bundle becomes a module script, which runs after parsing, so the `<!--VOICE-->` script before it still sets `window.__VOICE__` first, and the service-worker line registers on `load` as before. In `pwa/sw.js` replace the PRECACHE line with `const PRECACHE = __PRECACHE__; // lion-hawk build stamps the list: ./, the manifest, the icons and every assets/models file (D1)` and the header comment's first sentence with `// Offline support: the page, its model files (assets/models, D1), the icons and the Google Font.`

- [ ] **Step 5: Run** `UNIT test/build.hooks.test.mjs`. Expected: PASS.

- [ ] **Step 6: Build to the scratchpad and compare.**

```bash
cd $G && npx lion-hawk build --out $SCRATCH/tractor && ls $SCRATCH/tractor $SCRATCH/tractor/assets/models | head && grep -c "assets/models/tractor.glb" $SCRATCH/tractor/sw.js
```
Expected: `index.html`, `sw.js`, `manifest.webmanifest`, the icons, `assets/models/*.glb` and `*.anim.json`; the grep prints 1; the size report prints. Record the report under "R3 after Task 4" in `docs/lh3-baseline.md` (the page still carries `assets.json` until Task 17, so it is larger than the final page).

- [ ] **Step 7: The e2e server on the CLI build.** Replace `test/serve.mjs` with:

```js
// Builds Tractor Pickup with lion-hawk build (--e2e: unminified, no audio clips: speech and the synth fill in) into build/e2e/ and
// serves that directory on a random local port (lion-hawk 3l; was an esbuild bundle in a template). serveTractor() → { url, close }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'lion-hawk/build';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
export async function serveTractor() {
  const out = path.join(root, 'build/e2e');
  await build({ game: root, out, e2e: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = path.join(out, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(out) || path.basename(f) === 'sw.js' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
```
This also closes the G7 minor "`serveTractor({ entry })` keeps an option only the default uses". Update the one caller (`test/e2e.browser.mjs`) if it passes `{ entry }`.

- [ ] **Step 8: Run** `BROWSER test/e2e.browser.mjs`. Expected: PASS, 14/14 (as at G7). A failure that only appears here (not at e03ed71) is a build difference: compare `build/e2e/index.html` with the old `build/e2e/main.html`.

- [ ] **Step 9: Retire build.py.** `git rm build.py`; `package.json` scripts: `"build": "lion-hawk build"`, `"dev": "lion-hawk dev"`, keep `"test"` and `"test:e2e"`; README: replace the `python3 build.py` lines with `npm run build -- --out <dir>` (or `TRACTOR_OUT=<dir> npm run build`) and `npm run bake`.

- [ ] **Step 10: Commit** `git add build.hooks.js test/build.hooks.test.mjs template.html pwa/sw.js test/serve.mjs test/e2e.browser.mjs package.json README.md docs/lh3-baseline.md && git commit -m "build(tractor): lion-hawk build with audio hooks and a precache list; build.py retired (D1, B-2)"`

---

## Part B — the sim onto the World (needs engine 0.8.0)

**Suite state during Part B.** Tasks 6 and 7 change the signatures of `createTractor`, `createTrain`, `createTrees`, `addFarmColliders`, `addYardProps` and `createSandbox` (they take the scene's `World`), so `src/sim/game.js` and every suite that builds a farm stay red until Task 8 rewires `createGame` and Task 9 moves the tests. Each of Tasks 5–10 runs only the files it names. From Task 9 on, the whole suite is green except `test/golden.test.mjs` (its blessed numbers move with the World: combine rules, `√f`, mass from density, creation order); Task 11 re-blesses it under §5.5. Tapes are recorded and replayed in-run (no stored tape files), so they need no re-bless.

### Task 5: `sim/ground.js` and the test World

**Files:** create `src/sim/ground.js`, `test/helpers/world.mjs`, `test/ground.test.mjs`; delete `src/sim/physics.js` in Task 8 (its importers move in Tasks 6–8).

**Interfaces:** Consumes `world.heightfield`, `world.spawn`, `world.groups.mask`, `world.rapier`, `world.R` (§4.4). Produces `DT`, `GROUPS`, `PHYSICS`, `rowMajor(grid) → Float32Array`, `addGround(world, { terrain }) → e`, `rayMask(world) → u32`; test helper `testWorld() → { h, world, step(n, pre) }`.

- [ ] **Step 1: Failing test** `test/ground.test.mjs`:

```js
// The farm ground on the World (3l Task 5; Review Focus 1). Tractor's grid is x-major (heights[ix*n+iz]); world.heightfield takes
// row-major heights[iz*nx+ix]. A missing transpose mirrors the farm across its diagonal, which only asymmetric points can show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround, rowMajor, rayMask } from '../src/sim/ground.js';
import { generateFarm } from '../src/sim/track.js';
import { buildRoad } from '../src/sim/road.js';
import { createTerrain } from '../src/sim/terrain.js';
import { makeRng } from '../src/sim/rng.js';

const terrainOf = seed => { const farm = generateFarm(seed), road = buildRoad(farm); return createTerrain(farm, road, makeRng(seed ^ 0x7e11a1)); };
const hitY = (world, x, z) => { const R = world.R, hit = world.rapier.castRay(new R.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 }), 120, true, undefined, rayMask(world)); return hit ? 60 - (hit.timeOfImpact ?? hit.toi) : null; };

test('rowMajor transposes an x-major grid', () => {
  assert.deepEqual([...rowMajor({ n: 2, heights: new Float32Array([1, 2, 3, 4]) })], [1, 3, 2, 4]);
});
test('ray casts land on terrain.height at grid points where the farm is not symmetric', () => {
  const T = terrainOf(5), { n, step, heights } = T.grid, F = T.grid.size / 2, { world } = testWorld(); addGround(world, { terrain: T });
  const pts = [];
  for (let i = 0; i < n && pts.length < 12; i += 7) for (let j = 0; j < n && pts.length < 12; j += 11) if (Math.abs(heights[i * n + j] - heights[j * n + i]) > 1) pts.push([i, j]);
  assert.ok(pts.length >= 6, `only ${pts.length} asymmetric points`);
  for (const [i, j] of pts) { const x = -F + i * step, z = -F + j * step, y = hitY(world, x, z); assert.ok(Math.abs(y - T.height(x, z)) < 0.02, `(${x}, ${z}): hit ${y}, height ${T.height(x, z)}`); }
});
test('without a terrain the ground is the sandbox slab, top at y = 0, material pad', () => {
  const { world } = testWorld(), e = addGround(world);
  assert.ok(Math.abs(hitY(world, 13, -7)) < 1e-6); assert.equal(world.materialOf(e.colliders[0].collider.handle), 'pad');
});
```

- [ ] **Step 2: Run** `UNIT test/ground.test.mjs`. Expected: FAIL, `Cannot find module './helpers/world.mjs'`.

- [ ] **Step 3: Implement.** `src/sim/ground.js`:

```js
// The farm's physics on the scene's World (lion-hawk 3l; was sim/physics.js, which made its own RAPIER.World). The engine owns the
// world (S-3), steps it in 'physics.world' (60 Hz, the game's sim.hz) and frees it; this module names the collision groups and lays
// the ground: the farm's height grid as a heightfield (0.8.0; the terrain kit from Task 12) or the sandbox's flat slab. Top is y = 0.
export const DT = 1 / 60;
// wall: fences and barn walls. Bodies hit them, but wheel rays (ground | static) do not: a wheel that pokes over a wall beside its body
// would otherwise start its ray inside the wall and jack that side up.
export const GROUPS = Object.freeze(['ground', 'static', 'vehicle', 'trailer', 'prop', 'wall']);
export const PHYSICS = Object.freeze({ gravity: [0, -9.81, 0], groups: GROUPS }); // params: none, Rapier 0.21's own (pinned by the wrapper, #1)
// The terrain grid is x-major (heights[ix*n+iz], the layout Rapier itself reads); the World takes row-major heights[iz*nx+ix]
export function rowMajor({ n, heights }) {
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j * n + i] = heights[i * n + j];
  return out;
}
export function addGround(world, { terrain = null } = {}) {
  if (terrain) {
    const { n, size, step } = terrain.grid;
    return world.heightfield({ nx: n, nz: n, cell: step, x0: -size / 2, z0: -size / 2, heights: rowMajor(terrain.grid), material: 'ground', groups: { member: ['ground'] }, fixInternalEdges: true });
  }
  return world.spawn({ tags: ['ground'], body: 'fixed', groups: { member: ['ground'] },
    colliders: [{ shape: 'box', half: [200, 0.5, 200], p: [0, -0.5, 0], q: [0, 0, 0, 1], material: 'pad' }] });
}
// wheel rays: every member bit, hitting only the ground and static colliders (today's groups(0xffff, GROUND | STATIC))
export const rayMask = world => world.groups.mask(GROUPS, ['ground', 'static']);
```
`test/helpers/world.mjs`:

```js
// test/helpers/world.mjs — a headless World with Tractor Pickup's materials, sidecars and collision groups (3l). No tests here.
// testWorld() → { h, world, step(n = 1, pre = null) }: each step runs pre(world) in the scene step, before the engine's lh.physics.step,
// where the farm runs its tractor and train (Task 8).
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, button } from 'lion-hawk/sim';
import { headless } from 'lion-hawk/test';
import MATERIALS from '../../src/defs/materials.js';
import PHYS from '../../baked/phys.json' with { type: 'json' };
import { PHYSICS } from '../../src/sim/ground.js';
await R.init();

export function testWorld() {
  let pre = null;
  const game = defineGame({ id: 'tp-test-world', sim: { hz: 60, maxCatchUp: 3 }, actions: actions({ go: button() }), start: 'pad',
    defs: { materials: MATERIALS, models: PHYS }, physics: { rapier: R, ...PHYSICS },
    scenes: { pad: { enter() {}, step(e, dt, ctx) { pre?.(ctx.world); } } } });
  const h = headless(game);
  return { h, world: h.world, step(n = 1, fn = null) { pre = fn; try { for (let i = 0; i < n; i++) h.step(1); } finally { pre = null; } } };
}
```

- [ ] **Step 4: Run** `UNIT test/ground.test.mjs`. Expected: PASS. (`world.heightfield` forwards `fixInternalEdges` to `heightfieldDesc`: 3c, CI-11 settled. The flag matters for wheel rays crossing triangle edges, so Task 12's kit call sets it too.)

- [ ] **Step 5: Prove the transpose test red.** Temporarily make `rowMajor` return `new Float32Array(heights)`; run `UNIT test/ground.test.mjs`; expected FAIL in "ray casts land on terrain.height…" with a hit/height mismatch over 1 m; restore.

- [ ] **Step 6: Commit** `git add src/sim/ground.js test/helpers/world.mjs test/ground.test.mjs && git commit -m "feat(tractor): ground and collision groups on the scene World; test World helper"`

### Task 6: The tractor and the hitch on `world.spawn`

**Files:** modify `src/sim/tractor.js`, `src/sim/hitch.js`; create `test/mass.test.mjs`; modify `test/tractor.test.mjs`, `test/hitch.test.mjs`, `test/pilot.test.mjs`, `test/bump.test.mjs` (their `make`/setup only).

**Interfaces:** Consumes `world.spawn` (with `body.massProps`, D3), `world.own`, `world.joint`, `world.rapier.createVehicleController`, `rayMask`. Produces `createTractor(world, { x, z, yaw, power, surfaceAt }) → t` (as today plus `t.e`), `createTrain(world, tractor) → { cars: [{ e, body, vc, index, joint, front, frontAnchor, dirt }], angle, hitchGap, step }` (as today plus `e`).

- [ ] **Step 1: Failing test** `test/mass.test.mjs`:

```js
// Mass and pose of the train on the World (3l Task 6; Review Focus 3): the tractor keeps its playtested 1400 kg and inertia (D3,
// massProps), each car weighs today's 260 + 5 kg from its materials' densities, and spawn puts the bodies where createTractor did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround } from '../src/sim/ground.js';
import { createTractor, TP } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg}: ${a} vs ${b}`);
test('the tractor weighs TP.mass with its tuned inertia; each car 265 kg; materials are mapped', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 3, z: -4, yaw: 0.7 }), tr = createTrain(world, t);
  near(t.body.mass(), TP.mass, 0.001, 'tractor');
  const I = t.body.principalInertia(); near(I.x, 900, 0.001, 'Ixx'); near(I.y, 2200, 0.001, 'Iyy'); near(I.z, 2000, 0.001, 'Izz');
  for (const c of tr.cars) near(c.body.mass(), 265, 0.005, `car ${c.index}`);
  assert.equal(world.materialOf(t.e.colliders[0].collider.handle), 'chassis');
  assert.deepEqual(tr.cars[0].e.colliders.map(c => world.materialOf(c.collider.handle)), ['bed', 'tongue']);
});
test('spawn keeps createTractor\'s pose: (x, 0.3, z), rotated yaw - 90 degrees about y', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 3, z: -4, yaw: 0.7 }), p = t.body.translation(), q = t.body.rotation(), a = 0.7 - Math.PI / 2;
  assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(9)), [3, 0.3, -4]);
  for (const [k, v] of [['x', 0], ['y', Math.sin(a / 2)], ['z', 0], ['w', Math.cos(a / 2)]]) assert.ok(Math.abs(q[k] - v) < 1e-7, `q.${k}`);
  assert.ok(Math.abs(t.yaw - 0.7) < 1e-12, 'the yaw it reports before its first step');
});
test('the train despawns cleanly (controllers and joints freed with their entities)', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t), n = world.stats.bodies;
  for (const c of [...tr.cars].reverse()) world.despawn(c.e); world.despawn(t.e);
  assert.equal(world.stats.bodies, n - 3);
});
```

- [ ] **Step 2: Run** `UNIT test/mass.test.mjs`. Expected: FAIL, `createTractor(world…)`: `world.createRigidBody is not a function` (the old code calls `phys.world`).

- [ ] **Step 3: Implement.** In `src/sim/tractor.js` replace the import line `import { G, groups } from './physics.js';` with `import { rayMask } from './ground.js';` and add `const Q0 = [0, 0, 0, 1];`. Replace `createTractor`'s first lines up to and including `const rayGroups = …, own = …;` with:

```js
export function createTractor(world, { x, z, yaw, power = 'medium', surfaceAt = () => 'gravel' }) {
  const a = yaw - Math.PI / 2; // yawQuat: the chassis +x is the heading
  const e = world.spawn({ tags: ['tractor'], at: [x, 0.3, z], q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)],
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.8,
      massProps: { mass: TP.mass, com: [0.15, 0.45, 0], inertia: [900, 2200, 2000] } }, // lh-allow: D3, the playtested 1400 kg and tuned inertia
    colliders: [
      { shape: 'box', half: [1.55, 0.5, 1.0], p: [0.27, 0.95, 0], q: Q0, part: 'body', material: 'chassis' },
      { shape: 'box', half: [0.55, 0.55, 0.62], p: [-0.55, 1.95, 0], q: Q0, part: 'cab', material: 'chassis' },
    ],
    groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop', 'wall'] } });
  const body = e.body, cols = e.colliders.map(c => c.collider), vc = world.rapier.createVehicleController(body);
  world.own(e, () => world.rapier.removeVehicleController(vc));
  const W = TRACTOR_WHEELS.map(w => ({ ...w }));
  W.forEach((w, i) => {
    vc.addWheel({ x: w.cx, y: w.cy + 0.12, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TP.suspRest, w.radius);
    vc.setWheelSuspensionStiffness(i, TP.stiffness); vc.setWheelSuspensionCompression(i, TP.compression);
    vc.setWheelSuspensionRelaxation(i, TP.relaxation); vc.setWheelMaxSuspensionForce(i, 1e6); vc.setWheelMaxSuspensionTravel(i, TP.travel);
  });
  const rayGroups = rayMask(world), own = new Set(cols.map(c => c.handle));
```
and in the returned object add `e,` before `body,`. Delete `yawQuat` (now unused). Everything from `const t = {` on is unchanged.

In `src/sim/hitch.js` replace the import `import { G, groups } from './physics.js';` with `import { rayMask } from './ground.js';`, add `const Q0 = [0, 0, 0, 1];`, and replace `createCar` and `createTrain`'s first lines with:

```js
function createCar(world, frontE, frontAnchor, index) {
  const front = frontE.body, h = local2world(front, frontAnchor), q = front.rotation(), { f } = quatAxes(q);
  const cx = h.x - f.x * TR.tongue.x, cz = h.z - f.z * TR.tongue.x;
  const e = world.spawn({ tags: ['car'], at: [cx, h.y - TR.tongue.y, cz], q: [q.x, q.y, q.z, q.w],
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.6 },
    colliders: [ // bed: 260 kg and tongue: 5 kg through their materials' densities (src/defs/materials.js), as setMass gave
      { shape: 'box', half: [TR.half.x, TR.half.y, TR.half.z], p: [0, 0, 0], q: Q0, part: 'bed', material: 'bed' },
      { shape: 'box', half: [0.9, 0.06, 0.08], p: [TR.half.x + 0.9, -0.15, 0], q: Q0, part: 'tongue', material: 'tongue' },
    ],
    groups: { member: ['trailer'], filter: ['ground', 'static', 'prop', 'wall'] } });
  const body = e.body, vc = world.rapier.createVehicleController(body);
  world.own(e, () => world.rapier.removeVehicleController(vc));
  for (const side of [-1, 1]) vc.addWheel({ x: TR.axleX, y: 0, z: side * TR.track }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TR.suspRest, TR.wheelR);
  for (let i = 0; i < 2; i++) {
    vc.setWheelSuspensionStiffness(i, 22); vc.setWheelSuspensionCompression(i, 2.2); vc.setWheelSuspensionRelaxation(i, 2.8);
    vc.setWheelFrictionSlip(i, 2.5); vc.setWheelSideFrictionStiffness(i, 1.2); vc.setWheelMaxSuspensionForce(i, 1e5); vc.setWheelMaxSuspensionTravel(i, 0.4);
  }
  const joint = world.joint(frontE, e, world.R.JointData.spherical(frontAnchor, TR.tongue));
  joint.setContactsEnabled(false);
  return { e, body, vc, index, joint, front, frontAnchor, dirt: 0 };
}

export function createTrain(world, tractor) {
  const c0 = createCar(world, tractor.e, TRACTOR_HITCH, 0);
  const c1 = createCar(world, c0.e, TR.rear, 1);
  const cars = [c0, c1], rayGroups = rayMask(world);
```
(The rest of `createTrain` is unchanged.)

- [ ] **Step 4: Move the four test files onto the helper.** In each of `test/tractor.test.mjs`, `test/hitch.test.mjs`, `test/pilot.test.mjs`, `test/bump.test.mjs` apply exactly this rewrite and nothing else:
  - imports: `import { createPhysics, DT[, G, groups] } from '../src/sim/physics.js';` → `import { addGround, DT } from '../src/sim/ground.js';` plus `import { testWorld } from './helpers/world.mjs';` (remove `RAPIER` import and `await RAPIER.init()` only if nothing else in the file uses them);
  - `const phys = createPhysics(RAPIER[, { terrain }]);` → `const { world, step } = testWorld(); addGround(world[, { terrain }]);` and every `createTractor(phys, …)`/`createTrain(phys, …)`/`extra?.(phys)` takes `world`;
  - a loop body of the form `A; B; phys.world.step();` (or `phys.step()`) → `step(1, () => { A; B; });` — the work that ran before the Rapier step now runs in the scene step, before `lh.physics.step`, which is the same order;
  - `hitch.test.mjs`'s `extra` callbacks that add raw colliders with `G`/`groups` (if any) spawn a fixed entity instead: `world.spawn({ body: 'fixed', groups: { member: ['static'] }, colliders: [{ shape: 'box', half: [hx, hy, hz], p: [x, y, z], q: [0, 0, 0, 1], material: 'pad' }] })` with the same sizes and place.
  Example (`test/tractor.test.mjs`'s `make`):

```js
const make = (power = 'medium', surface = 'gravel') => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0, power, surfaceAt: () => surface });
  const run = (sec, thr, steer, each) => { for (let i = 0; i < sec * 60; i++) { step(1, () => { t.setInput(thr, steer); t.step(DT); }); each?.(); } };
  return { world, t, run };
};
```

- [ ] **Step 5: Run** `UNIT test/mass.test.mjs test/tractor.test.mjs test/hitch.test.mjs test/pilot.test.mjs test/bump.test.mjs`. Expected: PASS. The behaviour tests (top speeds, mud, steering, jackknife limits, settle) keep their thresholds; a threshold that now fails is a feel change from the World (combine rules): stop, note the numbers, and report before touching it.

- [ ] **Step 6: Prove the mass test can fail.** Temporarily set the `bed` material's `fill` in `src/defs/materials.js` to `0.2`; run `UNIT test/mass.test.mjs`; expected FAIL "car 0: … vs 265"; restore.

- [ ] **Step 7: Commit** `git add src/sim/tractor.js src/sim/hitch.js test/mass.test.mjs test/tractor.test.mjs test/hitch.test.mjs test/pilot.test.mjs test/bump.test.mjs && git commit -m "feat(tractor): tractor and hitch spawned through the World with registry materials (D3 massProps)"`

### Task 7: Trees, walls, props, ramps and the sandbox on the World

**Files:** modify `src/sim/trees.js`, `src/sim/scenery.js`, `src/sim/sandbox.js`; modify `test/trees.test.mjs`, `test/yard.test.mjs`, `test/terrain.test.mjs`, `test/sandbox.test.mjs` (setup only); extend `test/mass.test.mjs`.

**Interfaces:** Produces `createTrees(world, items)` (list items gain `e`; `collider` is replaced by `solid: boolean`), `addFarmColliders(world, farm, road, terrain)`, `addYardProps(world, farm) → { props: [{ …o, e, body, start }], reset() }`, `addRamp(world, { x, z, yaw, width })`, `createSandbox(world, { power }) → { tractor, train, materialAt?, ramps, mud, pre(input), post() }` (see Task 8 for `pre/post`).

- [ ] **Step 1: Failing tests.** Append to `test/mass.test.mjs`:

```js
import { addYardProps } from '../src/sim/scenery.js';
import { createTrees } from '../src/sim/trees.js';
import { generateFarm } from '../src/sim/track.js';
test('yard props weigh today\'s setMass values: bale 150, cone 2, barrel 25 kg', () => {
  const { world } = testWorld(); addGround(world);
  const { props } = addYardProps(world, generateFarm(5)), want = { bale: 150, cone: 2, barrel: 25 };
  assert.ok(props.length > 0);
  for (const p of props) near(p.body.mass(), want[p.kind], 0.005, p.kind);
});
test('a broken tree\'s trunk stops colliding and a regrown one collides again (one entity each, bushes bodiless)', () => {
  const { world } = testWorld(); addGround(world);
  const T = createTrees(world, [{ kind: 'tree', x: 0, z: 10, r: 1.5 }, { kind: 'bush', x: 5, z: 10, r: 0.9 }]), [tree, bush] = T.list;
  assert.equal(tree.e.colliders.length, 1); assert.equal(bush.e.body, undefined);
  const c = tree.e.colliders[0].collider; assert.equal(c.isEnabled(), true);
  T.breakById(0); assert.equal(c.isEnabled(), false); assert.equal(tree.solid, false);
  T.regrowById(0); assert.equal(c.isEnabled(), true); assert.equal(tree.solid, true);
});
```

- [ ] **Step 2: Run** `UNIT test/mass.test.mjs`. Expected: FAIL in the two new tests (`world.createRigidBody is not a function` / `tree.e` undefined).

- [ ] **Step 3: Trees.** In `src/sim/trees.js` replace `import { G, groups } from './physics.js';` (delete it) and the body of `createTrees` up to `list.forEach(addCollider);` with:

```js
export function createTrees(world, items) {
  const list = items.map((o, id) => ({ id, kind: o.kind === 'bush' ? 'bush' : 'tree', x: o.x, z: o.z, r: o.r, young: !!o.young, scale: o.scale ?? 1, yaw: o.yaw ?? 0, state: 'standing', wobble: 0, grow: 1, near: false, solid: false, e: null }));
  // a tree's trunk: a fixed cylinder only the tractor (and props) hit, the trailers go through; a bush: no body (popped by distance)
  for (const t of list) t.e = t.kind === 'tree'
    ? world.spawn({ tags: ['tree'], body: 'fixed', at: [t.x, 1.2, t.z], tree: t, groups: { member: ['wall'], filter: ['vehicle', 'prop'] },
      colliders: [{ shape: 'cylinder', halfHeight: 1.2, r: t.young ? TRUNK.young : TRUNK.single, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'trunk' }] })
    : world.spawn({ tags: ['bush'], tree: t });
  const addCollider = t => { if (t.kind === 'tree' && !t.solid) { t.e.colliders[0].collider.setEnabled(true); t.solid = true; } };
  const dropCollider = t => { if (t.solid) { t.e.colliders[0].collider.setEnabled(false); t.solid = false; } };
  list.forEach(addCollider);
```
and in `reset()` and `regrowById` replace `if (!t.collider) addCollider(t);` with `addCollider(t);`. (A disabled collider is skipped by contacts and queries exactly as a removed one; the entity, its handle and its future `net` part stay.)

- [ ] **Step 4: Walls, ramps, props.** In `src/sim/scenery.js` delete `import { G, groups } from './physics.js';`, keep `yawQ`, add `const qa = q => [q.x, q.y, q.z, q.w], Q0 = [0, 0, 0, 1];` and replace `addWall`, `addFarmColliders` and `addYardProps` with:

```js
function wallBox([ax, az, bx, bz], h, y0 = 0) { // a 0.3 m thick wall from y0 up to y0 + h
  const L = Math.hypot(bx - ax, bz - az), th = Math.atan2(-(bz - az), bx - ax);
  return { shape: 'box', half: [L / 2, h / 2, 0.15], p: [(ax + bx) / 2, y0 + h / 2, (az + bz) / 2], q: qa(yawQ(th)), material: 'fence' };
}
// one fixed 'walls' entity holds every wall collider, in today's creation order (barn, wash, yard, route fences); ramps come first
export function addFarmColliders(world, farm, road, terrain) {
  const y = farm.yard, b = y.barn, walls = [];
  farm.routes.forEach((R2, r) => R2.tiles.forEach((t, k) => { if (t.type === 'ramp') addRamp(world, { ...road.featureCenter(r, k), width: 14 }); }));
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  for (const sd of [-1, 1]) { // drive-through barn: two side walls along the axis (T-28), and the open door leaves in line with them
    const ox = Math.cos(b.yaw) * sd * b.width, oz = -Math.sin(b.yaw) * sd * b.width;
    walls.push({ shape: 'box', half: [0.3, 2.5, b.half], p: [b.x + ox, 2.5, b.z + oz], q: qa(yawQ(b.yaw)), material: 'fence' });
    for (const end of [-1, 1]) { const a = end * (b.half + b.leaf / 2);
      walls.push({ shape: 'box', half: [0.15, 2.3, b.leaf / 2], p: [b.x + ox + fx * a, 2.3, b.z + oz + fz * a], q: qa(yawQ(b.yaw)), material: 'fence' }); }
  }
  if (y.wash) { // T-36: the wash's corner posts and side brushes
    const w = y.wash, wf = [Math.sin(w.yaw), Math.cos(w.yaw)], wr = [Math.cos(w.yaw), -Math.sin(w.yaw)], at = (a, s) => [w.x + wf[0] * a + wr[0] * s, WASH.h / 2, w.z + wf[1] * a + wr[1] * s];
    for (const sd of [-1, 1]) {
      for (const e of [-1, 1]) walls.push({ shape: 'box', half: [0.25, WASH.h / 2, 0.25], p: at(e * WASH.half, sd * (WASH.width + 0.3)), q: Q0, material: 'fence' });
      walls.push({ shape: 'cylinder', halfHeight: 1.6, r: 0.5, p: at(0, sd * (WASH.width + 0.3)), q: Q0, material: 'fence' });
    }
  }
  for (const seg of yardWalls(farm)) walls.push(wallBox(seg, 1.0));
  for (const seg of terrain.fences) { // T-17 route fences, 1.2 m above the ground; where a fence runs onto the cut foot it reaches down into the slope
    const ya = terrain.height(seg[0], seg[1]), yb = terrain.height(seg[2], seg[3]), y0 = Math.min(ya, yb) - 0.3;
    walls.push(wallBox(seg, Math.max(ya, yb) + 1.2 - y0, y0));
  }
  return world.spawn({ tags: ['walls'], body: 'fixed', groups: { member: ['wall'] }, colliders: walls });
}

// T-31: bales roll (cylinder on its side), cones and barrels tip; trees and bushes are in trees.js. T-32: reset() on each show.
// Masses are today's setMass values through body.mass (D3). The cone is a 17-point hull (CI-4: no cone shape in the collider schema).
const CONE = [0, 0.35, 0, ...Array.from({ length: 16 }, (_, i) => [Math.cos(i / 8 * Math.PI) * 0.25, -0.35, Math.sin(i / 8 * Math.PI) * 0.25]).flat()];
const PROP = {
  bale: { y: 0.75, mass: 150, shape: { shape: 'cylinder', halfHeight: 0.6, r: 0.75 } },
  cone: { y: 0.35, mass: 2, shape: { shape: 'hull', points: CONE } },
  barrel: { y: 0.5, mass: 25, shape: { shape: 'cylinder', halfHeight: 0.5, r: 0.4 } },
};
export function addYardProps(world, farm) {
  const props = [], S = Math.SQRT1_2;
  for (const o of farm.yard.obstacles) {
    if (o.kind === 'tree' || o.kind === 'bush') continue; // they belong to the tree system (trees.js): the tractor breaks them (T-34)
    const cy = Math.cos(o.yaw / 2), sy = Math.sin(o.yaw / 2), P = PROP[o.kind];
    const q = o.kind === 'bale' ? { x: cy * S, y: sy * S, z: -sy * S, w: cy * S } : yawQ(o.yaw); // bale: yaw then 90 degrees about x
    const e = world.spawn({ tags: ['prop', o.kind], at: [o.x, P.y, o.z], q: qa(q), prop: o,
      body: { type: 'dynamic', linearDamping: 0.3, angularDamping: 0.5, mass: P.mass },
      colliders: [{ ...P.shape, p: [0, 0, 0], q: Q0, material: 'prop' }], groups: { member: ['prop'] } });
    props.push({ ...o, e, body: e.body, start: { at: [o.x, P.y, o.z], q: qa(q) } });
  }
  return {
    props,
    reset() { for (const p of props) world.place(p.e, { at: p.start.at }, { q: p.start.q }); }, // place: pose set, velocities zeroed, body woken (E-8)
  };
}
```
Replace `addRamp` (it lives in `sandbox.js`) with:

```js
export function addRamp(world, { x, z, yaw, width = 7 }) { // kicker along +heading: 5 m up to 0.6 m, 1 m table, 3 m down (spec T-14)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, pts = [];
  for (const [a, y] of [[-5, 0], [0, 0.6], [1, 0.6], [4, 0]]) for (const s of [-width / 2, width / 2]) {
    const px = x + fx * a + rx * s, pz = z + fz * a + rz * s; pts.push(px, y, pz, px, -0.2, pz);
  }
  return world.spawn({ tags: ['ramp'], body: 'fixed', groups: { member: ['static'] }, colliders: [{ shape: 'hull', points: pts, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'ramp' }] });
}
```
`scenery.js` imports `WASH` from `./track.js` (add it to the existing import).

- [ ] **Step 5: Sandbox.** Replace `createSandbox` in `src/sim/sandbox.js` (imports become `import { addGround, DT } from './ground.js';`):

```js
export function createSandbox(world, { power = 'medium' } = {}) {
  addGround(world);
  const ramps = [{ x: 0, z: 40, yaw: 0 }], mud = [{ x: 25, z: 20, r: 8 }];
  ramps.forEach(r => addRamp(world, r));
  const surfaceAt = (x, z) => mud.some(m => Math.hypot(x - m.x, z - m.z) < m.r) ? 'mud' : 'gravel';
  const tractor = createTractor(world, { x: 0, z: 0, yaw: 0, power, surfaceAt });
  const train = createTrain(world, tractor);
  return {
    world, tractor, train, surfaceAt, ramps, mud,
    pre(input) { // before lh.physics.step (Task 8)
      tractor.setInput(input.thr, input.steer, input.turn || 0); tractor.step(DT);
      train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 });
    },
    post() { return NONE; },
  };
}
const NONE = [];
```

- [ ] **Step 6: Move the setup of** `test/trees.test.mjs`, `test/yard.test.mjs`, `test/terrain.test.mjs`, `test/sandbox.test.mjs` with Task 6 Step 4's rewrite rule. `yard.test.mjs`'s prop reset checks read `p.body` as before. `sandbox.test.mjs` steps `step(1, () => sb.pre(input))` where it called `sb.step(input)`.

- [ ] **Step 7: Run** `UNIT test/mass.test.mjs test/trees.test.mjs test/yard.test.mjs test/terrain.test.mjs test/sandbox.test.mjs`. Expected: PASS.

- [ ] **Step 8: Prove the trunk test can fail.** Temporarily make `dropCollider` set `t.solid = false` without `setEnabled(false)`; run `UNIT test/mass.test.mjs`; expected FAIL `c.isEnabled()` true; restore.

- [ ] **Step 9: Commit** `git add src/sim/trees.js src/sim/scenery.js src/sim/sandbox.js test/mass.test.mjs test/trees.test.mjs test/yard.test.mjs test/terrain.test.mjs test/sandbox.test.mjs && git commit -m "feat(tractor): trees, walls, props, ramps and the sandbox spawned through the World"`

### Task 8 (judgment): `createGame` on the scene's World, split into `pre` and `post`

**Decision expected:** the physics step leaves `game.step` and becomes the engine's `lh.physics.step` (stage `physics.world`). `game.step(input)` splits at the old `phys.step()` line: `game.pre(input)` (horn, aim help, tractor, train, trees) runs in the farm scene's `step` hook; `game.post() → events` (herd, boops, dodges, flights, riders, barn pass, stop, dirt) runs in a farm scene system at stage `post`, followed by today's bridge, `sync.after`, sounds, bedtime and flow. A `stepped` flag set by `pre` and cleared by `post` makes `post` run once per stepped `pre` and never during a load (#90: `post`-stage systems keep running while a scene loads). `lh.physics.step` itself does not run during a load (3c, S-3; CI-16 settled): Rapier, the pool read and the contact events skip, so the old farm's bodies hold still for the load's frames, as in 1.8; nothing in Tractor relies on a step during a load. Cost: two halves to keep in step; covered by `test/split.test.mjs`. The rejected alternative, calling `world.rapier.step()` inside `game.step`, would bypass the pool swap/read, the timer (#106) and the event drain.

**Files:** modify `src/sim/game.js`, `src/game/farm.js`, `src/game.sim.js`, `src/game.view.js` (the `?fps` Rapier line only), `src/main.js` (the `timer` moves to `boot`'s options); delete `src/sim/physics.js`; create `test/split.test.mjs`.

**Interfaces:** Consumes `ctx.world`, `e.world`, `ctx.system(name, fn, { stage: 'post' })`, `world.clear()`, `world.place`, `world.stats.stepMsTotal` (#106), `defineGame({ defs, physics })`, `boot(game, view, { timer })`. Produces `createGame(world, { seed, power, player }) → game` with `game.pre(input)`, `game.post() → events[]`, `game.world`; `tractorGame({ clock, bindings })` (no `timer`); `moveTrain(g, x, z, yaw, { ground })` on `world.place`.

- [ ] **Step 1: Failing test** `test/split.test.mjs`:

```js
// The farm step split around the engine's physics step (3l Task 8; Review Focus 2): pre (scene step hook) → lh.physics.step → post
// (a 'post' stage system), once each per step, and neither while a new farm loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const ARGS = { seed: 14, started: true, trip: false };
const spy = h => { const g = h.engine.scene.state.game, log = [], P = g.pre, Q = g.post;
  g.pre = i => { log.push(['pre', g.tractor.body.translation().z]); return P.call(g, i); };
  g.post = () => { log.push(['post', g.tractor.body.translation().z]); return Q.call(g); };
  return log; };

test('pre, physics, post: once each per step, in that order', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(60); const log = spy(h);
  h.step(3, { goZ: 1 });
  assert.deepEqual(log.map(x => x[0]), ['pre', 'post', 'pre', 'post', 'pre', 'post']);
});
test('the Rapier step happens between the halves: the body moves between pre and post', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(60); h.step(90, { goZ: 1 }); const log = spy(h);
  h.step(1, { goZ: 1 }); assert.notEqual(log[0][1], log[1][1]);
});
test('a load suspends both halves; the new farm steps both again', () => {
  const h = headless(tractorGame(), { args: { ...ARGS, seed: 15 } }); h.step(1); const log = spy(h);
  h.command('farm.new', {}); h.step(1); assert.equal(h.engine.loading.active, true);
  const t = h.engine.scene.state.game.tractor.e, y = t.xf.p.y; // CI-16 (3c): Rapier does not step while the scene loads (one step in, the tractor is still settling onto the ground, so a step would move it)
  const before = log.length; h.step(1); assert.equal(log.length, before, 'no half ran during the load');
  assert.equal(t.xf.p.y, y, 'no physics step during the load');
  h.untilLoaded(); const g2 = h.engine.scene.state.game; let n = 0; const P = g2.post; g2.post = () => (n++, P.call(g2));
  h.step(2); assert.equal(n, 2);
});
test('game.post emits the step\'s events exactly once (the bridge sees each boop once)', () => {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state; h.step(60);
  const g = s.game, a = g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  h.step(30); assert.equal(h.events.filter(e => e.type === 'boop' && e.animal === a).length, 1);
});
```

- [ ] **Step 2: Run** `UNIT test/split.test.mjs`. Expected: FAIL, `createGame(R, …)`: `world.spawn is not a function` (the farm still passes Rapier).

- [ ] **Step 3: `src/sim/game.js`.** Imports: `import { createPhysics, DT } from './physics.js';` → `import { addGround, DT } from './ground.js';`. Signature and setup:

```js
export function createGame(world, { seed, power = 'medium', player = 1 }) {
  const farm = generateFarm(seed), road = buildRoad(farm), terrain = createTerrain(farm, road, makeRng(seed ^ 0x7e11a1)), rng = makeRng(seed ^ 0x51ed);
  const items = scatterScenery(farm, road, makeRng(seed ^ 0x9e3779b9), terrain);
  addGround(world, { terrain }); addFarmColliders(world, farm, road, terrain); // routes are closed in by banks, fences and the yard fence (T-17)
  const yardProps = addYardProps(world, farm), s = spawnPoint(farm, player); // M-10
  const trees = createTrees(world, [...farm.yard.obstacles.filter(o => o.kind === 'tree' || o.kind === 'bush'), ...roadside(farm, road, makeRng(seed ^ 0x70adc0de))]); // T-34, T-35
  const tractor = createTractor(world, { x: s.x, z: s.z, yaw: s.yaw, power, surfaceAt: road.surfaceAt });
```
(the rest of the setup is unchanged; the creation order is today's: ground, ramps, walls, props, trees, tractor, cars). In the `game` object replace `phys,` with `world,` and replace the whole `step(input) { … }` method with the two halves, the cut being exactly the old `phys.step()`:

```js
    // the step before the engine's Rapier step (the farm scene's step hook): horn, aim help, the tractor and train, the trees
    pre(input) {
      const drive = game.mode === 'drive' ? input : STILL; cur = []; curLoad = game.load;
      axes = quatAxes(tractor.body.rotation());
      if (drive.horn) { herd.horn(tractor); cur.push({ type: 'horn' }); }
      let assist = 0, best = AIM.range; // B-3 aim help: nudge steering toward a close animal ahead
      if (game.mode === 'drive') for (const a of herd.free()) { const l = tractorLocal(a.x, 0, a.z, tmp), d = Math.hypot(l.x, l.z);
        if (l.x > 0 && d < best && Math.abs(Math.atan2(l.z, l.x)) < AIM.cone) { best = d; assist = Math.max(-AIM.max, Math.min(AIM.max, -Math.atan2(l.z, l.x) * AIM.gain)); } }
      tractor.setAssist(tractor.fwd > 0.5 && drive.onTarget !== false ? assist : 0); // C-11: only when nearly on the wanted heading
      tractor.hold = game.mode !== 'drive'; tractor.setInput(drive.thr, drive.steer, drive.turn || 0); tractor.step(DT);
      train.step(DT, { parked: tractor.hold || (Math.abs(drive.thr) < 0.05 && tractor.speed < 0.3) });
      cur.push(...trees.step(DT, bodies, game.mode === 'drive')); // trees first: a broken trunk's collider is gone before contact resolves
    },
    // the step after it (a 'post' stage system): herd, boops, flights, riders, the barn pass, the barn stop and dirt; its events in order
    post() {
      const events = cur, load = curLoad; cur = null; curLoad = null;
      axes = quatAxes(tractor.body.rotation());
      // … the old step's lines from `herd.step(DT, { tractor, others: game.others });` to `if (game.dirt.tractor > 0.05) wasClean = false;`, unchanged …
      axes = null;
      return events;
    },
```
and add `let cur = null, curLoad = null;` beside `let pendingPass = …`. The moved block reads `load` and `events` exactly as before. (Copy the lines verbatim from the old `step`; the only edits are the two first lines of each half shown above.)

- [ ] **Step 4: `src/game/farm.js`.**
  - Imports: drop `DT` from `'../sim/physics.js'` → `import { DT } from '../sim/ground.js';`.
  - `moveTrain` places entities:

```js
export const moveTrain = (g, x, z, yaw, { ground = false } = {}) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const dy = ground ? g.terrain.height(x, z) - g.terrain.height(p0.x, p0.z) + 0.3 : 0;
  const list = [g.tractor.e, ...g.train.cars.map(c => c.e)].map(e => { const t = e.body.translation(); return [e, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [e, l] of list) g.world.place(e, { at: [x + f.x * l.x + u.x * l.y + r.x * l.z, p0.y + dy + f.y * l.x + u.y * l.y + r.y * l.z, z + f.z * l.x + u.z * l.y + r.z * l.z] }, { q: [q.x, q.y, q.z, q.w] });
};
```
  (The sandbox has no `tractorLocal`/`terrain`; `moveTrain` is only called on the farm, as today.)
  - `makeFarm({ clock, bindings })` (no `R`, no `timer`). `build(e, s, …)`: `s.game = createGame(e.world, { seed, power, player }); s.stepped = false;` (rest unchanged).
  - `rebuild`: replace `s.game.phys.world.free(); s.game = null;` with `s.game = null; e.world.clear();` and in the catch replace `s.game?.phys.world.free(); s.game = null;` with `s.game = null; e.world.clear();`.
  - `scene.exit`: `exit() {}` (the engine disposes the World after exit, S-3).
  - `scene.enter`: after `build(e, s, seed, power, player);` add `ctx.system('tp.farm.post', en => post(en, ctx), { stage: 'post' });`.
  - `scene.step` becomes the pre half and a new `post` function holds the rest:

```js
    step(e, dt, ctx) {
      const s = ctx.state, I = e.input.snapshot, net = s.net; // #88: the sync is looked up here each step and called by name (tests replace its methods)
      if (net.sync) { let nev = NONE; try { nev = net.sync.before(e.time.wall); } catch (err) { warn('net before', err); } bridge(e, nev); } // M-44: net events first
      if (e.loading.active) return; // #80: the welcome asked for the host's farm: the old one steps no more (the load suspends this hook)
      if (!s.started && s.game.mode === 'drive' && (I.goX || I.goZ)) api.play(e); // A-7: the first stick move starts the trip
      s.game.pre(readInput(e, s)); s.stepped = true;
    },
```
```js
// the farm step's second half (3l Task 8): after the engine's Rapier step, in the same step; never without a pre (a load, #90)
function post(e, ctx) {
  const s = ctx.state; if (!s.stepped || !s.game) return; s.stepped = false;
  const ev = s.game.post(), net = s.net;
  bridge(e, ev);
  if (net.sync) try { net.sync.after(ev, e.time.wall); } catch (err) { warn('net after', err); } // N-4: the step's wall stamp is the frame clock (M-69)
  sounds(e, s);
  if (s.tripOn && s.started && s.bed.phase !== 'asleep') stepBed(e, s); // E-5, #85
  if (s.tripOn && s.started && s.bed.phase !== 'asleep') stepFlow(e, s, ev); // spec 3.1 (not after bedtime put the farm to sleep)
}
```
  (`post` lives inside `makeFarm`, beside `rebuild`, so it sees `warn` and `api`.)
  - `makeSandbox({})`: `enter`: `game: createSandbox(e.world, { power: … })`, `stepped: false`, plus `ctx.system('tp.sandbox.post', en => { const s = ctx.state; if (!s.stepped) return; s.stepped = false; bridge(en, s.game.post()); sounds(en, s); }, { stage: 'post' });`; `exit() {}`; `step(e, dt, ctx) { const s = ctx.state; s.game.pre(readInput(e, s)); s.stepped = true; }`.

- [ ] **Step 5: `src/game.sim.js`.** Imports add `import MATERIALS from './defs/materials.js'; import PHYS from '../baked/phys.json' with { type: 'json' }; import { PHYSICS } from './sim/ground.js';`. `tractorGame({ clock, bindings } = {})`; `makeFarm({ clock, bindings })`, `makeSandbox({})`; `defineGame({ …, defs: { materials: MATERIALS, models: PHYS }, physics: { rapier: R, ...PHYSICS }, … })` (`R` stays imported here: this file is where the game hands its initialised Rapier to the engine, overview §4.1 and D9). Header comment's "timer" sentence becomes: `?fps: the entry passes performance.now as boot's timer; world.stats.stepMsTotal is Rapier's running total (#106)`.

- [ ] **Step 6: The `?fps` reader and the entry.** In `src/main.js`: `boot(tractorGame(), tractorView({ … }), { …, timer: fps ? () => performance.now() : undefined })`. In `src/game.view.js` replace the `page.perf` block's step callback with:

```js
        offs.push(engine.onStep(() => {
          page.perf.step(); const w = engine.world; if (!w) return;
          if (w.serial === last) page.perf.worldMs(w.stats.stepMsTotal - ms); last = w.serial; ms = w.stats.stepMsTotal; // #106: the engine times Rapier
        }));
```
and `src/ui/debug.js`'s `worldMs` comment: `// Rapier World.step time from the engine's timer hook (#106, world.stats)`.

- [ ] **Step 7: Delete** `src/sim/physics.js` (`git rm`). `grep -rn "sim/physics.js\|createPhysics" src` must print nothing.

- [ ] **Step 8: Run** `UNIT test/split.test.mjs test/flow.test.mjs test/bed.test.mjs test/show.engine.test.mjs`. Expected: PASS. (Suites that call `createGame` directly move in Task 9.)

- [ ] **Step 9: Prove the guard matters.** Temporarily delete `if (!s.stepped || !s.game) return; s.stepped = false;` from `post`; run `UNIT test/split.test.mjs`; expected FAIL in "a load suspends both halves" (post runs during the load) or `TypeError` on a null game; restore.

- [ ] **Step 10: Commit** `git add -A src test/split.test.mjs && git commit -m "feat(tractor): the farm on the scene's World; game.step split into pre and post around lh.physics.step"`

### Task 9: Tests that built a game by hand move onto the engine; the old mp world retires

**Files:** modify `test/helpers/world.mjs` (adds `testGame`), `test/train.mjs` (re-exports `moveTrain` from `src/game/farm.js`), `test/game.test.mjs`, `test/golden.test.mjs`, `test/dirt.test.mjs`, `test/session.test.mjs`, `test/mp.harness.mjs`, `test/mp.test.mjs`, `test/mp.animals.test.mjs`, `test/mp.repair.test.mjs`, `test/mp.interop.test.mjs`, `test/mp.barn.test.mjs`, `test/mp.relay.test.mjs`, `test/forecast.test.mjs`, `test/replica.test.mjs`, `test/progress.test.mjs` (only those that `grep -l "createGame\|createPhysics\|TP_MP"` lists); delete `test/golden-farm.test.mjs`, `test/mp.engine.test.mjs` if it only compared the two harnesses.

**Interfaces:** Produces `testGame({ seed, power, player }) → game` whose `game.step(input) → events` drives the headless farm scene through the raw input seam (`state.raw`) for one engine step and returns that step's game events (FARM_EVENTS, `scene` and `overlay` filtered out), so tests that called `createGame(R, …).step(input)` keep their bodies; `engineWorld` stays the only mp harness.

- [ ] **Step 1: The helper.** Append to `test/helpers/world.mjs`:

```js
import { tractorGame, FARM_EVENTS } from '../../src/game.sim.js';
// a farm scene stepped one engine step at a time through the raw input seam: game.step(input) → that step's game events, as
// createGame(...).step(input) returned them before the World (the phase-0 goldens are driven this way, golden.test.mjs)
export function testGame({ seed = 14, power = 'medium', player = 1, args = {} } = {}) {
  const h = headless(tractorGame(), { args: { seed, power, player, started: true, trip: false, ...args } }), s = h.engine.scene.state, buf = [];
  h.engine.events.on(e => { if (!FARM_EVENTS.has(e.type) && e.type !== 'scene' && e.type !== 'overlay') buf.push(e); });
  const g = s.game;
  g.step = input => { buf.length = 0; s.raw = input; h.step(1); s.raw = null; return buf.slice(); };
  g.h = h;
  return g;
}
```
(`buf.slice()` allocates in the test helper only. A test that waits for a new farm reads `g.h.engine.scene.state.game` instead.)

- [ ] **Step 2: Rewrite call sites.** Every `createGame(RAPIER, { seed, power[, player] })` → `testGame({ seed, power[, player] })`; drop `RAPIER` imports where nothing else uses them. `test/train.mjs` becomes `export { moveTrain } from '../src/game/farm.js';` (one copy, on `world.place`). A test that read `g.phys` reads `g.world`.

- [ ] **Step 3: Goldens on the engine path only.** Replace `test/golden.test.mjs`'s `run()` and `pickup()` with the engine-path versions from `test/golden-farm.test.mjs` (`drive()` and `pickup()` through `headless(tractorGame(), { args: ARGS })` and `s.raw`), keep both `golden(…)` calls (blessable) and the two determinism tests (now over the engine path), and add `test('the sim rate is the physics step', …)` from `golden-farm`. Delete `test/golden-farm.test.mjs` (its `direct()` comparison has no second path left).

- [ ] **Step 4: Retire the old mp world and `TP_MP`.** In `test/mp.harness.mjs` delete the old-world harness (the code that builds devices from `createGame` and the link transport) and make the module re-export `engineWorld as mpWorld` from `./mp.engine.harness.mjs`, keeping `STILL`, `PAINTS`, `disagreements` and `settle`. Delete every `process.env.TP_MP` branch. The frozen-frame M-50 test at `test/mp.test.mjs` ("the rate limits count in wall time: with the game frozen…") was the one test that needed the old path (#75): move its assertion onto the port-level clock instead (step the engine with `w.step` while the port's clock is held, then advance the clock 1 s and assert a new message is accepted), or, if it cannot be expressed on the engine path, delete it and record it in the notes as a deliberate drop with the reason. Expected decision: rewrite (the port's `clock` is injectable in `engineWorld({ clock })`).

- [ ] **Step 5: Run** `UNIT test/` . Expected: PASS except `test/golden.test.mjs` (FAIL: checksums differ from the blessed files: the World changed creation order, combine rules, `√f` friction and the tractor's 1 kg of collider mass). Any other failure is a migration bug: fix it here.

- [ ] **Step 6: Commit** `git add -A test && git commit -m "test(tractor): suites drive the farm through the engine; the old mp world and TP_MP retire"`

### Task 10: Surfaces and dirt rates from the registry (`materialAt`)

**Files:** modify `src/sim/road.js`, `src/sim/tractor.js`, `src/sim/dirt.js`, `src/sim/game.js`, `src/sim/sandbox.js`, `test/dirt.test.mjs`, `test/tractor.test.mjs` (`surfaceAt` → `materialAt` in `make`); create `test/surface.test.mjs`.

**Interfaces:** Produces `road.materialAt(x, z) → 'route' | 'meadow' | 'mudhole'` (registry ids; `road.surfaceAt` is removed), `createTractor(world, { …, materialAt })` with `t.ground` (material id) and `t.surface` (its `game.surface`: `'gravel' | 'grass' | 'mud'`, unchanged for the view and events), `stepDirt(level, { ground, speedFrac, washing }, dt)` where `ground` is a material's `game` block, `DIRT = { splash, washTime }`, `WASH_RATE`. `SURFACE` is deleted from `tractor.js`.

- [ ] **Step 1: Failing test** `test/surface.test.mjs`:

```js
// M-10, D6 (3l Task 10): the surfaces come from the registry. materialAt names a material; its game block carries the grip, vmul and
// dirt rate the sim used to read from SURFACE and DIRT.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';
import { generateFarm } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF } from '../src/sim/road.js';
import { stepDirt } from '../src/sim/dirt.js';
import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor, POWER } from '../src/sim/tractor.js';

test('road.materialAt: route in the yard and on the road, meadow off it, mudhole on a mud tile', () => {
  const farm = generateFarm(9), road = buildRoad(farm);
  assert.equal(road.materialAt(0, 0), 'route');
  const p = road.routes[0].pts[40]; assert.equal(road.materialAt(p.x, p.z), farm.routes[p.r].tiles[p.k].type === 'mud' && Math.abs(p.u - 0.5) < 0.35 ? 'mudhole' : 'route');
  assert.equal(road.materialAt(p.x - p.tz * (ROAD_HALF + 3), p.z + p.tx * (ROAD_HALF + 3)), 'meadow');
  assert.equal(road.surfaceAt, undefined, 'one lookup, the material one');
});
test('dirt: per-second rates from the material; mud does not scale with speed', () => {
  const g = id => MATERIALS.get(id).game;
  assert.ok(Math.abs(stepDirt(0, { ground: g('route'), speedFrac: 0.5, washing: 0 }, 1) - 0.003) < 1e-12);
  assert.ok(Math.abs(stepDirt(0, { ground: g('mudhole'), speedFrac: 0, washing: 0 }, 1) - 0.6) < 1e-12);
});
test('the tractor reads grip and vmul through materialAt (mud from the registry halves the top speed)', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0, materialAt: () => 'mudhole' });
  step(60, () => { t.setInput(0, 0); t.step(DT); }); step(600, () => { t.setInput(1, 0); t.step(DT); });
  assert.equal(t.surface, 'mud'); assert.equal(t.ground, 'mudhole');
  assert.ok(t.speed < POWER.medium.vmax * 0.55, `speed ${t.speed}`);
});
```

- [ ] **Step 2: Run** `UNIT test/surface.test.mjs`. Expected: FAIL, `road.materialAt is not a function`.

- [ ] **Step 3: Implement.**
  - `road.js`: rename the method `surfaceAt(x, z)` to a local `surface(x, z)` (body unchanged) and return `materialAt(x, z) { return SURFACE_ID[surface(x, z)]; }` with `const SURFACE_ID = { gravel: 'route', grass: 'meadow', mud: 'mudhole' };` at module level.
  - `tractor.js`: delete `export const SURFACE = …`; `createTractor(world, { x, z, yaw, power = 'medium', materialAt = () => 'route' })`; in the object `ground: 'route', surface: 'gravel',`; in `step` replace `this.surface = surfaceAt(p.x, p.z); const SF = SURFACE[this.surface];` with `this.ground = materialAt(p.x, p.z); const SF = world.materials.get(this.ground).game; this.surface = SF.surface;` (a frozen, cached object: no allocation per step).
  - `dirt.js`:

```js
// Dirt levels 0 (clean) .. 1 (very dirty) for the tractor, the cars and every animal (T-16). The rate comes from the ground material's
// game block (src/defs/materials.js, D6): `dirt` per second, times the speed fraction where `scaled`. Only the sprinkler (T-15) and the
// farmyard wash (T-36) clean. washing: 0, 1 (the sprinkler: clean in washTime) or a speed-up (the wash: WASH_RATE).
export const DIRT = { splash: 0.4, washTime: 1.5 }, WASH_RATE = 3; // the wash is short (9 m): it cleans 3 times as fast, so any pass comes out clean
const clamp = v => Math.max(0, Math.min(1, v));
export function stepDirt(level, { ground, speedFrac, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return clamp(level + ground.dirt * (ground.scaled ? Math.min(1, speedFrac) : 1) * dt);
}
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
```
  - `game.js`: `createTractor(world, { …, materialAt: road.materialAt })`; in `post()` the dirt block becomes:

```js
      const M = world.materials, sf = tractor.speed / tractor.P.vmax, washAt = (x, z) => road.inSprinkler(x, z) ? 1 : inWash(farm.yard, x, z) ? WASH_RATE : 0, washing = washAt(tractor.x, tractor.z); let anyWash = washing > 0;
      game.dirt.tractor = stepDirt(game.dirt.tractor, { ground: M.get(tractor.ground).game, speedFrac: sf, washing }, DT);
      for (const c of train.cars) {
        const p = c.body.translation(), w = washAt(p.x, p.z), ground = M.get(road.materialAt(p.x, p.z)).game;
        anyWash ||= w > 0; c.dirt = stepDirt(c.dirt, { ground, speedFrac: sf, washing: w }, DT);
        for (const sl of load.slots) if (sl.car === c.index && sl.landed) sl.animal.dirt = stepRiderDirt(sl.animal.dirt, { carInMud: ground.surface === 'mud', speed: tractor.speed, washing: w }, DT);
      }
```
  (`washAt` stays the closure it was; it is not new.)
  - `sandbox.js`: `const materialAt = (x, z) => mud.some(m => Math.hypot(x - m.x, z - m.z) < m.r) ? 'mudhole' : 'route';` and pass `materialAt`; return `materialAt` instead of `surfaceAt`. `src/view/world.js`'s sandbox mud patch reads `game.mud` (unchanged).
  - `test/dirt.test.mjs`: `stepDirt(l, { surface: 'gravel', … })` → `stepDirt(l, { ground: MATERIALS.get('route').game, … })` (import `MATERIALS`), `'mud'` → `'mudhole'`, `'grass'` → `'meadow'`; `DIRT.mud`/`DIRT.gravel` reads → `MATERIALS.get('mudhole').game.dirt` / `…('route')…`.
  - `test/tractor.test.mjs`: `surfaceAt: () => surface` → `materialAt: () => ({ gravel: 'route', grass: 'meadow', mud: 'mudhole' })[surface]`.

- [ ] **Step 4: Run** `UNIT test/surface.test.mjs test/dirt.test.mjs test/tractor.test.mjs test/game.test.mjs`. Expected: PASS. This task moves no number: the registry holds today's values. Check it: `LH_BLESS= UNIT test/golden.test.mjs` fails with the **same** first differing checksum step as at the end of Task 9 (write both in the notes).

- [ ] **Step 5: Prove the registry is read.** Temporarily set `mudhole`'s `vmul` to `1` in `src/defs/materials.js`; run `UNIT test/surface.test.mjs`; expected FAIL "speed …"; restore.

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): surfaces and dirt rates from the material registry (M-10, D6); SURFACE and DIRT rates retired"`

### Task 11: Re-bless the goldens once (World), with feel samples and the engine checks

**Files:** create `test/checks.test.mjs`, `test/feel.test.mjs`; modify `test/goldens/drive-seed14.json`, `test/goldens/pickup-seed14.json` (re-blessed), `test/feel-baseline.json` (a row); notes.

**Interfaces:** Consumes `checks.determinism`, `checks.simPurity`, `checks.materials`, `checks.zeroAlloc` (lion-hawk/test, §4.4), `courseRun`, `bumpRun`.

- [ ] **Step 1: The checks and the feel test** (both must pass before any bless). `test/checks.test.mjs`:

```js
// Engine checks over Tractor Pickup (3l Task 11; T-10, T-12, T-13, T-14).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { fileURLToPath } from 'node:url';
import { checks } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
const drive = (h, i) => ({ goX: Math.sin(i / 90), goZ: Math.cos(i / 90), horn: i % 300 === 0 });

test('determinism: two runs of 1800 steps on seed 14 agree at every checksum (T-10)', () => {
  const r = checks.determinism(tractorGame(), { seed: 14, steps: 1800, input: drive }); assert.ok(r.ok, JSON.stringify(r));
});
test('sim purity over the game\'s sim roots (T-12)', () => {
  const r = checks.simPurity(tractorGame(), { roots: ['game.sim.js', 'game', 'sim', 'defs', 'net/host.js', 'net/guest.js', 'net/players.js', 'net/kinds.js', 'net/bindings.js', 'net/protocol.js'].map(src) });
  assert.ok(r.ok ?? r.length === 0, JSON.stringify(r));
});
test('materials: every collider, sidecar and heightfield material exists, and phys.json matches the registry (T-14)', () => {
  const r = checks.materials(tractorGame()); assert.ok(r.ok, JSON.stringify(r));
});
test('zero retained allocation over 10000 farm steps (T-13)', { timeout: 240_000 }, () => {
  const r = checks.zeroAlloc(tractorGame(), { steps: 10000, warm: 600 }); assert.ok(r.ok, JSON.stringify(r));
});
```
`test/feel.test.mjs`:

```js
// Overview §5.5 feel samples against the pre-swap row of test/feel-baseline.json, with the tolerances written there before any run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import { courseRun, bumpRun } from './helpers/feel.mjs';
await R.init();
const B = JSON.parse(fs.readFileSync(new URL('./feel-baseline.json', import.meta.url))), pre = B.rows[0], T = B.tolerance;

test('course time within 3 % and boops within 1 of the pre-swap sample', { timeout: 240_000 }, () => {
  const c = courseRun();
  assert.ok(Math.abs(c.seconds - pre.course.seconds) <= pre.course.seconds * T.seconds, `course ${c.seconds} s vs ${pre.course.seconds} s`);
  assert.ok(Math.abs(c.boops - pre.course.boops) <= T.boops, `boops ${c.boops} vs ${pre.course.boops}`);
});
test('the soft bump keeps its outcome (until Part E makes trains solid)', { timeout: 240_000 }, () => {
  const b = bumpRun();
  for (const i of [0, 1]) assert.ok(Math.abs(b.bumps[i] - pre.bump.bumps[i]) <= T.bumps, `bumps[${i}] ${b.bumps[i]} vs ${pre.bump.bumps[i]}`);
  assert.ok(Math.abs(b.separation - pre.bump.separation) <= T.separation, `separation ${b.separation} vs ${pre.bump.separation}`);
});
```

- [ ] **Step 2: Run** `UNIT test/checks.test.mjs test/feel.test.mjs`. Expected: PASS. **If a feel sample is outside its tolerance: stop.** Write the table (pre, post, tolerance) into the notes and report it to the user as a playtest item (§5.5-4); do not bless. If `zeroAlloc` reports retained growth, find the retaining owner with `--heap-prof` on a 10000-step headless run (the engine's 256-event log is bounded; a growing array in the farm, the herd's trail or the flow is the usual suspect) and fix the game code.

- [ ] **Step 3: Prove the feel test can fail.** Temporarily set `rows[0].course.seconds` in `test/feel-baseline.json` to 70 % of its value; run `UNIT test/feel.test.mjs`; expected FAIL "course …"; restore.

- [ ] **Step 4: Bless.** `LH_BLESS=1 UNIT test/golden.test.mjs`, then `UNIT test/golden.test.mjs` (PASS without the flag). Append a row to `test/feel-baseline.json`: `{ "at": "post World swap (Task 11, <commit>)", "course": …, "bump": … }` from `node test/helpers/feel.mjs`.

- [ ] **Step 5: Notes.** In `docs/plans/2026-10-13-phase-3l-tractor-notes.md` (the controller creates it; add the section) "Re-bless 1 (World)": causes (creation order unchanged by design; `√f` with Multiply for friction and Max for restitution (D4/M-9) in place of Rapier's Average; the tractor's 1.04 kg of collider density dropped by `massProps` (D3); collision groups by name), the metric table, the golden commit, and the first differing step before the bless.

- [ ] **Step 6: Run** `UNIT test/`. Expected: all PASS.

- [ ] **Step 7: Commit** `git add test && git commit -m "test(tractor): re-bless the goldens for the World (overview 5.5), with feel samples and the engine checks"` (body: the metric table).

---

## Part C — kits (needs engine 0.9.0)

### Task 12: The farm ground on the terrain kit

**Files:** modify `src/sim/ground.js`, `src/sim/game.js`, `test/ground.test.mjs`; create `test/kits.test.mjs`.

**Interfaces:** Consumes `createTerrain(world, { nx, nz, cell, x0, z0, heights, materials, material, groups, fixInternalEdges })` → `{ entity, grid, heightAt, normalAt, materialAt, blendAt }` from `lion-hawk/kits/terrain` (3h Task 1; `materials` is a `Uint8Array` of registry indices per height sample or a function `(x, z) => id`; `material` is the heightfield collider's; CI-11 settled), imported as `terrainKit`. Produces `addGround(world, { terrain, materialAt }) → kit | e` (the kit object for the farm, the slab entity for the sandbox), `game.ground` (the kit), and the tractor's `materialAt` = `game.ground.materialAt`.

- [ ] **Step 1: Failing test** `test/kits.test.mjs`:

```js
// The farm ground is the terrain kit (3l Task 12, M-10): its heights match the game's terrain at asymmetric grid points, and its
// materialAt is the road's (route / meadow / mudhole).
import test from 'node:test';
import assert from 'node:assert/strict';
import { testGame } from './helpers/world.mjs';

test('the kit ground: heightAt equals terrain.height on grid points, materialAt equals road.materialAt everywhere', () => {
  const g = testGame({ seed: 5 }), T = g.terrain, { n, step, heights } = T.grid, F = T.grid.size / 2;
  assert.ok(g.ground && typeof g.ground.materialAt === 'function', 'game.ground is the terrain kit');
  let k = 0;
  for (let i = 0; i < n; i += 9) for (let j = 0; j < n; j += 13) if (Math.abs(heights[i * n + j] - heights[j * n + i]) > 1) {
    const x = -F + i * step, z = -F + j * step; k++;
    assert.ok(Math.abs(g.ground.heightAt(x, z) - T.height(x, z)) < 1e-4, `(${x}, ${z})`);
  }
  assert.ok(k >= 6);
  for (let i = 0; i < 400; i++) { const x = (i * 37 % 760) - 380, z = (i * 53 % 760) - 380; assert.equal(g.ground.materialAt(x, z), g.road.materialAt(x, z)); }
});
```

- [ ] **Step 2: Run** `UNIT test/kits.test.mjs`. Expected: FAIL, `game.ground is the terrain kit`.

- [ ] **Step 3: Implement.** `src/sim/ground.js`: `import { createTerrain as terrainKit } from 'lion-hawk/kits/terrain';` and `addGround`'s terrain branch becomes:

```js
  if (terrain) { // the terrain kit (M-10): the heightfield (groups: ground) and materialAt over the road's surfaces
    const { n, size, step } = terrain.grid;
    return terrainKit(world, { nx: n, nz: n, cell: step, x0: -size / 2, z0: -size / 2, heights: rowMajor(terrain.grid), materials: materialAt,
      material: 'ground', groups: { member: ['ground'] }, fixInternalEdges: true }); // Task 5's collider exactly (CI-11, settled by 3c/3h)
  }
```
with the signature `addGround(world, { terrain = null, materialAt = null } = {})`. In `game.js`: `const ground = addGround(world, { terrain, materialAt: road.materialAt });`, add `ground` to the `game` object, and `createTractor(world, { …, materialAt: ground.materialAt })`. `test/ground.test.mjs`'s heightfield test now passes `{ terrain: T, materialAt: () => 'route' }`.

- [ ] **Step 4: Run** `UNIT test/kits.test.mjs test/ground.test.mjs test/golden.test.mjs`. Expected: PASS, goldens unchanged (the kit makes the same heightfield). If the goldens move, compare the kit's heightfield collider (material `ground`, friction 0.6; `FIX_INTERNAL_EDGES`; groups) with Task 5's: any difference is a wrong option in the call above, not a missing kit feature (CI-11 is settled).

- [ ] **Step 5: Commit** `git add -A src test && git commit -m "feat(tractor): farm ground on the terrain kit (heightfield and materialAt)"`

### Task 13 (judgment): The tractor and the trailers on the vehicle kit; re-bless 2

**Decision expected:** adopt `createVehicle` for the tractor (4 wheels) and each car (2 wheels). The game keeps every tuning value and the per-step maths (drift, slide help, turn help, yaw clamp, self-righting, jackknife limit) and hands the per-wheel results to `car.set(i, { steer, engine, brake, slip, side })` every step from the live `TP`/`POWER`/`TR` objects (constraint 14). The kit runs `updateVehicle` before `lh.physics.step`, after the scene step, so the slide and turn impulses and the jackknife impulses now act before the wheel update in the same step instead of after it: a re-bless cause that overview §5.5 does not list (CI-6). The surface stays the chassis centre's `materialAt` (today's feel); the kit's per-wheel `material` is used only by the view (dust and marks).

**Files:** modify `src/sim/tractor.js`, `src/sim/hitch.js`, `test/tractor.test.mjs`, `test/hitch.test.mjs` (wheel reads), `test/goldens/*.json` (re-bless), `test/feel-baseline.json`.

**Interfaces:** Consumes `createVehicle(world, e, { wheels: [{ at, radius, front, part, suspension: { rest, stiffness, compression, relaxation, travel, maxForce } }], rayGroups: { member, filter }, forward: 'x' })` → `{ controller, entity, removed, wheels, set(i, { steer, engine, brake, slip, side }), update }` and `VEHICLE_SYSTEM = 'lh.kit.vehicle'` (stage `physics.world`, `before: ['lh.physics.step']`) from `lion-hawk/kits/vehicle` (3h Task 4 stable names). `forward: 'x'` is the kit's default and Rapier's (axle +z), which today's raw controllers use; `grip` stays `false` (bit-exact slip and side) and `tyre` unused. Produces `t.car` / `c.car` (the kit vehicle); `t.vc` / `c.vc` stay as aliases of `car.controller` for read-only wheel queries (`sounds`, tests).

**Wheel part poses (3h Task 6b on 3c Task 10b's `partXf`; 3g Task 13b draws them; user ruling 2026-10-14).** Each kit wheel names its GLB node in `part`: the tractor's `TRACTOR_WHEELS[i].name` (`wheel-front-left` … `wheel-back-right`, the baked node names), each car's `CAR_WHEELS = ['wheel-left', 'wheel-right']` (side −1, +1; exported from `hitch.js`; `trailer.glb` has one `wheel` node, which Task 16's car hook clones and names). The kit adds the names to `e.partXf` and writes `e.partXf[part] = { p, q }` every step in the chassis frame: `p` = `at` moved `suspension` down (vehicles3d's `T(cx, cy + 0.12 − susp, cz)`, and `T(axleX, −susp, side · track)` for a car), `q` = `Ry(steer) · Rz(−rotation)` (`forward: 'x'`, axle +z). Part poses are view data: not in `world.digest()`, so they move no golden. Produces `CAR_WHEELS` (`hitch.js`).

- [ ] **Step 1: Failing test** (append to `test/kits.test.mjs`):

```js
import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor, TP, TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { createTrain, TR, CAR_WHEELS } from '../src/sim/hitch.js';
test('the train runs on the vehicle kit: wheels touch the ground, the controller is the kit\'s, tuning is read live', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t);
  step(90, () => { t.setInput(0, 0); t.step(DT); tr.step(DT, { parked: true }); });
  assert.equal(t.vc, t.car.controller); assert.ok(t.car.wheels.every(w => w.inContact));
  for (const c of tr.cars) assert.ok(c.car.wheels.every(w => w.inContact), `car ${c.index}`);
  const slip = TP.slip; TP.slip = slip * 2;
  try { step(1, () => { t.setInput(1, 0); t.step(DT); tr.step(DT, { parked: false }); }); assert.ok(Math.abs(t.vc.wheelFrictionSlip(0) - TP.slip * 1) < 1e-9); }
  finally { TP.slip = slip; }
});
test('each kit wheel names its GLB node: the kit writes e.partXf at vehicles3d\'s hub, rolled about the axle', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t), near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
  step(120, () => { t.setInput(1, 0); t.step(DT); tr.step(DT, { parked: false }); });
  assert.deepEqual(Object.keys(t.e.partXf), TRACTOR_WHEELS.map(w => w.name), 'the tractor wheels name their GLB nodes');
  TRACTOR_WHEELS.forEach((w, i) => { const P = t.e.partXf[w.name]; // vehicles3d: T(cx, cy + 0.12 - susp, cz)
    near(P.p.x, w.cx, w.name); near(P.p.y, w.cy + 0.12 - t.car.wheels[i].suspension, w.name); near(P.p.z, w.cz, w.name); });
  const q = t.e.partXf['wheel-back-left'].q, a = -t.vc.wheelRotation(2); // a rear wheel: no steer, Rz(-rot)
  assert.ok(Math.abs(a) > 0.5, 'the rear wheels rolled'); near(q.x, 0, 'rear q.x'); near(q.y, 0, 'rear q.y'); near(q.z, Math.sin(a / 2), 'rear q.z'); near(q.w, Math.cos(a / 2), 'rear q.w');
  for (const c of tr.cars) { assert.deepEqual(Object.keys(c.e.partXf), CAR_WHEELS, `car ${c.index}`);
    CAR_WHEELS.forEach((n, i) => { const P = c.e.partXf[n]; // vehicles3d: T(axleX, -susp, side · track)
      near(P.p.x, TR.axleX, n); near(P.p.y, -c.car.wheels[i].suspension, n); near(P.p.z, (i ? 1 : -1) * TR.track, n); }); }
});
```

- [ ] **Step 2: Run** `UNIT test/kits.test.mjs`. Expected: FAIL, `t.car` undefined.

- [ ] **Step 3: Implement.** `tractor.js` (add `import { createVehicle } from 'lion-hawk/kits/vehicle';`): replace the `createVehicleController` line, `world.own(...)` and the `W.forEach(… addWheel …)` block with

```js
  const W = TRACTOR_WHEELS.map(w => ({ ...w }));
  const car = createVehicle(world, e, { forward: 'x', rayGroups: { member: [...GROUPS], filter: ['ground', 'static'] },
    wheels: W.map(w => ({ at: [w.cx, w.cy + 0.12, w.cz], radius: w.radius, front: w.front, part: w.name, // the baked node: the kit writes its pose
      suspension: { rest: TP.suspRest, stiffness: TP.stiffness, compression: TP.compression, relaxation: TP.relaxation, travel: TP.travel, maxForce: 1e6 } })) });
  const vc = car.controller;
```
(import `GROUPS` from `./ground.js`; drop `rayMask` and `own`). In `step(dt)` replace the four per-wheel `vc.set…` calls and the `vc.updateVehicle(...)` line with

```js
      for (let i = 0; i < 4; i++) {
        const w = W[i], n = vc.wheelIsInContact(i) && vc.wheelContactNormal(i), g = SF.grip * (n && n.y < TP.steep ? TP.steepGrip : 1);
        wheelSet.steer = w.front ? this.steer : 0; wheelSet.engine = w.front ? 0 : force / 2; wheelSet.brake = brake;
        wheelSet.slip = TP.slip * g; wheelSet.side = (w.front ? 1 : rearSide) * SF.grip * (steep ? TP.steepGrip : 1); // slide sideways off the bank
        car.set(i, wheelSet);
      }
      // the kit runs updateVehicle before lh.physics.step (3l Task 13): the impulses below act on this step's velocities, before the wheels
```
with `const wheelSet = { steer: 0, engine: 0, brake: 0, slip: 0, side: 0 };` made once per tractor (no allocation per step). The object gains `car,`. `hitch.js` likewise (with `export const CAR_WHEELS = ['wheel-left', 'wheel-right']; // the kit's wheel parts, side -1 then +1 (Task 16's car hook names the nodes)`): per car `const car = createVehicle(world, e, { forward: 'x', rayGroups: { member: [...GROUPS], filter: ['ground', 'static'] }, wheels: [-1, 1].map((side, k) => ({ at: [TR.axleX, 0, side * TR.track], radius: TR.wheelR, front: false, part: CAR_WHEELS[k], suspension: { rest: TR.suspRest, stiffness: 22, compression: 2.2, relaxation: 2.8, travel: 0.4, maxForce: 1e5 } })) }), vc = car.controller;` and in `createTrain.step` replace `for (let i = 0; i < 2; i++) c.vc.setWheelBrake(i, parked ? 20 : 0.2); c.vc.updateVehicle(dt, undefined, rayGroups);` with `for (let i = 0; i < 2; i++) { carSet.brake = parked ? 20 : 0.2; carSet.slip = 2.5; carSet.side = 1.2; c.car.set(i, carSet); }` (`const carSet = { steer: 0, engine: 0, brake: 0, slip: 2.5, side: 1.2 };` once per train). Cars return `{ e, body, vc, car, … }`.

- [ ] **Step 4: Run** `UNIT test/kits.test.mjs test/tractor.test.mjs test/hitch.test.mjs test/pilot.test.mjs test/mass.test.mjs`. Expected: PASS (behaviour thresholds unchanged; one that fails is a feel change: stop and report).

- [ ] **Step 5: Feel and re-bless 2.** `UNIT test/feel.test.mjs test/checks.test.mjs` (PASS required; outside tolerance: stop and report, §5.5-4). Then `LH_BLESS=1 UNIT test/golden.test.mjs`; append the feel row "post vehicle kit (Task 13)"; notes "Re-bless 2 (vehicle kit order)" with the metric table and CI-6.

- [ ] **Step 6: Prove the live-tuning check.** Temporarily copy `TP.slip` into a const at the top of `createTractor` and use the const in `step`; run `UNIT test/kits.test.mjs`; expected FAIL; restore. Then drop `part: w.name` from the tractor's wheels: expected FAIL "the tractor wheels name their GLB nodes"; restore. Part poses are not in the digest: if adding `part` moves a golden, stop and report it against 3c Task 10b.

- [ ] **Step 7: Run** `UNIT test/` (all PASS) and **commit** `git add -A src test && git commit -m "feat(tractor): tractor and trailers on the vehicle kit; re-bless 2 (wheel update order)"`

### Task 13b (judgment): Dirt on the coverage kit (per metre: a feel change)

**Decision expected:** the tractor's and the cars' dirt moves onto `coverageKit` (3h): dirt is `e.coverage.dirt`, gained as the ground material's `dirtRate` × metres moved (spec §3.2), cleaned by `washes` at `1 / washTime`. Today's dirt is per second, times the speed fraction `speed / P.vmax` on gravel and grass, and a flat 0.6/s in mud even standing still. The per-metre rates are chosen to equal today's build-up at normal driving speed, Medium power (`vmax` 9 m/s; most play is on Medium):
- `route`: 0.006 / 9 per metre and `meadow`: 0.004 / 9 per metre. These are **exact** at every speed up to Medium's top speed, because today's rate is linear in speed there; Low power now dirties 1.5× faster and High 0.75× as fast as before;
- `mudhole`: 0.6 / 4.5 per metre (mud's top speed on Medium is 9 × 0.5 = 4.5 m/s): equal at mud top speed; slower in mud dirties less, and a tractor standing in mud no longer gets dirtier.
The yard wash cleans 3× as fast as a sprinkler today (`WASH_RATE`). The kit has one `washTime`; under the user ruling of 2026-10-14 (games move fully onto the engine) the game does not add the extra cleaning itself: Integrator request 5 asks 3h for a per-wash time (`washes: [fn | { at: fn, washTime }]`), and this task's kit call uses it. If the patch has not landed when the task starts, stop here and resume on it. Riders' splash dirt (`stepRiderDirt`) stays game-side (animals are not pose entities). These go into the playtest list: dirt on Low/High power, standing in mud, the look of a muddy run.

**Files:** modify `src/defs/materials.js` (surfaces get `dirtRate`; the game blocks drop `dirt`/`scaled`), `src/sim/tractor.js`, `src/sim/hitch.js` (entities get `coverage: { dirt: 0 }`; `game.dirt.tractor` and `car.dirt` become accessors onto it), `src/sim/game.js` (the dirt block shrinks to the riders, the yard-wash extra and the `washed`/`mud-enter` events), `src/game/farm.js` (installs the kit for the farm scene), `src/sim/dirt.js`, `test/materials.test.mjs`, `test/surface.test.mjs`, `test/dirt.test.mjs`.

**Interfaces:** Consumes `coverageKit(engineOrCtx, { materialAt, washes, washTime, layer }) → { off }` and `COVERAGE_SYSTEM = 'lh.kit.coverage'` (`lion-hawk/kits/coverage`, 3h Task 7 and C5): `dirtRate` × metres moved (prev → curr pool pose) on `layer(groundId)`, scaled by what the entity's own material accepts (`coverageMaterial`, else its first collider's; a material with no `coverage` block accepts everything, which is Tractor's case: its chassis and car materials have none). A ctx scopes the kit to the farm scene. `dirtRate` is not in the registry hash (3b), so `baked/phys.json` does not change. Produces `DIRT_RATES` (exported from `src/defs/materials.js` for the tests), `game.dirt.tractor` (get/set onto `tractor.e.coverage.dirt`), `car.dirt` (get/set onto `car.e.coverage.dirt`); `stepDirt` is deleted; `stepRiderDirt`, `DIRT = { splash, washTime }` and `WASH_RATE` stay.

- [ ] **Step 1: Failing test** (append to `test/dirt.test.mjs`):

```js
import MATERIALS from '../src/defs/materials.js';
import { POWER } from '../src/sim/tractor.js';
import { testGame } from './helpers/world.mjs';
test('per-metre rates equal the old per-second curve at Medium speeds (route, meadow) and at mud top speed', () => {
  const r = id => MATERIALS.get(id).dirtRate, v = POWER.medium.vmax;
  for (const s of [1, 4, 6.5, v]) { assert.ok(Math.abs(r('route') * s - 0.006 * Math.min(1, s / v)) < 1e-12, `route at ${s}`); assert.ok(Math.abs(r('meadow') * s - 0.004 * Math.min(1, s / v)) < 1e-12, `meadow at ${s}`); }
  assert.ok(Math.abs(r('mudhole') * v * 0.5 - 0.6) < 1e-12);
});
test('a Medium drive on the route dirties the tractor as the old per-second rule did over the same speeds (within 2 %)', () => {
  const g = testGame({ seed: 14 }), v = POWER.medium.vmax; let old = 0;
  g.step({ thr: 0, steer: 0, horn: false });
  for (let i = 0; i < 360; i++) { g.step({ thr: 1, steer: 0, horn: false }); if (g.tractor.surface === 'gravel' && !g.road.inSprinkler(g.tractor.x, g.tractor.z)) old += 0.006 * Math.min(1, g.tractor.speed / v) / 60; }
  assert.ok(old > 0.005, 'the drive stayed on gravel long enough to compare');
  assert.ok(Math.abs(g.dirt.tractor - old) <= old * 0.02, `kit ${g.dirt.tractor} vs old ${old}`);
});
```
(The second test starts in the farmyard, which is `route`; if the seed-14 start drives into the yard wash, use the next seed whose straight run stays out of it and note the seed in a comment.)

- [ ] **Step 2: Run** `UNIT test/dirt.test.mjs`. Expected: FAIL (`dirtRate` undefined: NaN comparisons).

- [ ] **Step 3: Implement.**
  - `src/defs/materials.js`: `export const DIRT_RATES = Object.freeze({ route: 0.006 / 9, meadow: 0.004 / 9, mudhole: 0.6 / 4.5 }); // per metre; 1.8's per-second rates at Medium speeds (Task 13b)`; the surfaces become `route: { extends: 'gravel', dirtRate: DIRT_RATES.route, game: { surface: 'gravel', grip: 1, vmul: 1 } }`, and likewise `meadow`, `mudhole`. `test/materials.test.mjs`'s surface test asserts `{ surface, grip, vmul }` and the three `dirtRate`s; `test/surface.test.mjs` drops its `stepDirt` test.
  - `tractor.js` spawn desc: `coverage: { dirt: 0 }`; `hitch.js` car spawn desc: `coverage: { dirt: 0 }`, and the returned car object defines `get dirt() { return this.e.coverage.dirt; }, set dirt(v) { this.e.coverage.dirt = v; }` (the tape probes and the HUD keep reading and writing `car.dirt`).
  - `game.js`: `game.dirt` becomes `{ get tractor() { return tractor.e.coverage.dirt; }, set tractor(v) { tractor.e.coverage.dirt = v; } }`. In `post()` the dirt block becomes:

```js
      // dirt (T-15, T-16): the coverage kit (run before this system) added dirtRate × metres and the sprinkler and yard-wash cleaning (the
      // wash at its own washTime, WASH_RATE × faster). Riders get the splash from a car in mud (animals are not entities: game rule).
      const M = world.materials, yardWash = (x, z) => inWash(farm.yard, x, z);
      let anyWash = road.inSprinkler(tractor.x, tractor.z) || yardWash(tractor.x, tractor.z);
      for (const c of train.cars) {
        const p = c.body.translation(), w = road.inSprinkler(p.x, p.z) ? 1 : yardWash(p.x, p.z) ? WASH_RATE : 0, under = M.get(game.ground.materialAt(p.x, p.z)).game;
        anyWash ||= w > 0;
        for (const sl of load.slots) if (sl.car === c.index && sl.landed) sl.animal.dirt = stepRiderDirt(sl.animal.dirt, { carInMud: under.surface === 'mud', speed: tractor.speed, washing: w }, DT);
      }
```
  (the `mud-enter` and `washed` lines after it are unchanged).
  - `dirt.js`: delete `stepDirt`; keep `DIRT = { splash: 0.4, washTime: 1.5 }`, `WASH_RATE`, `stepRiderDirt`; header: "the tractor's and cars' dirt is the coverage kit's (Task 13b); riders' splash dirt stays here".
  - `farm.js` `enter`, before `ctx.system('tp.farm.post', …)`:

```js
      coverageKit(ctx, { layer: () => 'dirt', washTime: DIRT.washTime, // one dirt level per thing (T-16); every ground dirties it
        materialAt: (x, z) => ctx.state.game?.ground.materialAt(x, z) ?? 'route',
        washes: [(x, z) => !!ctx.state.game?.road.inSprinkler(x, z), // the sprinkler: clean in DIRT.washTime
          { at: (x, z) => { const g = ctx.state.game; return !!g && inWash(g.farm.yard, x, z); }, washTime: DIRT.washTime / WASH_RATE }] }); // the yard wash: 3× (Integrator request 5)
```
  and the post system is registered with `{ stage: 'post', after: [COVERAGE_SYSTEM] }`. The sandbox gets no kit (it never had dirt).

- [ ] **Step 4: Run** `UNIT test/dirt.test.mjs test/materials.test.mjs test/surface.test.mjs test/tape.test.mjs test/game.test.mjs test/feel.test.mjs test/golden.test.mjs`. Expected: PASS. The goldens' snapshot holds no dirt, so they must not move; `state()`'s dirt values change, and the in-run tapes record and replay with the same rule. If a golden moves, find out why before going on (dirt leaking into a checksummed field is a bug).

- [ ] **Step 5: Prove the curve test bites.** Temporarily set `DIRT_RATES.route` to `0.006 / 6`; run `UNIT test/dirt.test.mjs`; expected FAIL; restore.

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): dirt on the coverage kit, per metre at Medium-speed parity (feel change, playtest)"`. Notes: the rate table, the Low/High/standing-in-mud differences, the playtest item.

---

## Part D — the view on the engine renderer (needs engine 0.9.0)

**Rule for every task in Part D:** goldens and in-run tapes must not move (overview §5.5: a view-only change that moves a checksum is a bug). Each task ends with `UNIT test/` all green, including `test/golden.test.mjs` without `LH_BLESS`. Two small sim-side edits are part of Part D and are data only: Task 16 gives the tractor and car entities `model`, `scale` and a `car` field (game data, E-4); none of them enters `engine.state()`, a checksum or the World digest (ids, pool, velocities).

### Task 14: `defineView({ render })`, the light rig and night, the chase camera on the engine rig

**Files:** modify `src/game.view.js`, `src/main.js`, `src/ui/show.js` (its `VIEW` import), `src/ui/debug.js` (`createFpsMeter` reads `view.gfx.renderer`; the camera rows write `CAM` from `view/rig.js`), `src/view/rig.js` (rewritten over `createChaseRig`); create `src/view/size.js`, `test/view.purity.test.mjs`, `test/view.rig.test.mjs`; delete `src/render/scene.js`, `src/render/camera.js`.

**Interfaces:** Consumes `defineView({ scenes, render })`, `boot(game, view, { canvas, timer, … })`, `view.gfx = { renderer, scene, camera, lights, resize, size }`, `lights.follow(x, z)`, `lights.lerp(a, b, k)`, `lights.set(k)` (§4.6; 3e Task 3: options `{ sky, hemiSky, ground, hemi, sun: { color, intensity, map, box, offset, near, far, bias, normalBias }, fog, presets }`, presets `{ sky, hemiSky, ground, hemi, sun: { color, intensity, offset }, fog }`; a flat `sun: '#…'` or `sunIntensity` throws), `createChaseRig(camera, opts)` → `{ opts, yaw, follow(pose, dt), snap(pose), shake(a), blendFrom(q, time = 1) }` heading style (3g Task 5, CI-10) and `makeProject(camera, canvas)` → `project(p, out?)` with `project.ndc(x, y, z, out?)` (3g Task 4). Produces `RENDER` (exported from `game.view.js`), `setNight(lights, k)`, `rig` and `CAM` (`src/view/rig.js`), `VIEW` (`src/view/size.js`: `{ w, h }`, written by the drive half each frame from `view.gfx.size`).

- [ ] **Step 1: Failing test** `test/view.purity.test.mjs` (Review Focus 5; it guards every later view task):

```js
// The view never writes the sim (#102, 2g G4b user rule; 3l Review Focus 5): no assignment into engine.scene.state or a sim game,
// no entity part writes, no Rapier setters or impulses, no World mutation, in any view-side file. And the render config is declared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';
const src = fileURLToPath(new URL('../src/', import.meta.url));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const VIEW = ['view', 'render', 'ui', 'audio', 'game.view.js', 'main.js', 'devices.js'].flatMap(p => files(join(src, p)));
const WRITES = [
  /\bengine\.scene\.state(\.[\w$]+)+\s*(=|\+=|-=|\+\+|--)(?!=)/, /\b(s|state)\.game(\.[\w$]+)+\s*(=|\+=|-=)(?!=)/,
  /\.(setTranslation|setRotation|setLinvel|setAngvel|applyImpulse|applyTorqueImpulse|setNextKinematicTranslation|setNextKinematicRotation|setEnabled)\(/,
  /\bworld\.(place|spawn|despawn|add|remove|clear|setMaterial)\(/, /\be\.(xf|body|coverage|input|net|netFix|car)\b(\.[\w$]+)*\s*(=|\+=|-=)(?!=)/,
];
test('no view-side file writes the sim', () => {
  const bad = VIEW.flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l])).filter(([, , l]) => WRITES.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
test('the view declares the engine render pipeline', async () => {
  const { RENDER } = await import('../src/game.view.js');
  assert.equal(RENDER.shading, 'standard'); assert.deepEqual(RENDER.dpr, { touch: 1.5, desktop: 2 }); assert.equal(RENDER.camera.fovPortrait, 64);
  const { createLightRig } = await import('lion-hawk/view'), THREE = await import('three');
  createLightRig(new THREE.Scene(), RENDER.lights).dispose(); // 3e's names (CI-8): a flat sun colour or sunIntensity throws
  assert.equal(RENDER.lights.hemiSky, '#eef7ff'); assert.equal(RENDER.lights.presets.night.sun.color, '#9fb4ff');
});
```
(`game.view.js` imports three at module level; under Node it loads the dev three copy, which is fine.)

And the feel-parity test for the chase camera, `test/view.rig.test.mjs` (CI-10: Tractor adopts 3g's rig; its oracle is 1.8's camera, so the feel cannot drift):

```js
// The chase camera on the engine rig (3l Task 14, CI-10): Tractor's feel frame by frame against 1.8's render/camera.js + view/rig.js
// (copied below at e03ed71; the shake is left out: 1.8's used Math.random, the engine's is a counter hash). V-1..V-3, X-12, F-10, C-2, M-77.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rig, CAM } from '../src/view/rig.js';

function oldRig(camera) { // render/camera.js createChaseCam + view/rig.js follow/blendFrom at e03ed71, CAM and LAG inlined
  const C = { D: 12, H: 10.2, AHEAD: 11, portrait: 1.25 }, tgt = new THREE.Vector3(), pos = new THREE.Vector3(), showQ = new THREE.Quaternion(), chaseQ = new THREE.Quaternion();
  let yaw = null, blend = 1;
  return {
    get yaw() { return yaw; },
    follow(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw; if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 3);
      const fx = Math.sin(yaw), fz = Math.cos(yaw); tgt.set(s.x + fx * C.AHEAD, s.y + 0.8, s.z + fz * C.AHEAD);
      const k = camera.aspect < 0.9 ? C.portrait : 1; pos.set(s.x - fx * C.D * k, s.y + C.H * k, s.z - fz * C.D * k);
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
      if (blend < 1) { blend = Math.min(1, blend + dt); const b = blend * blend * (3 - 2 * blend); chaseQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(showQ, chaseQ, b); }
    },
    blendFrom(q) { showQ.copy(q); blend = 0; },
  };
}
const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) };
const same = (a, b, at) => { assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at ${at}`); assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at ${at}`); };

test('the engine rig is 1.8\'s chase: a new farm, a slide, the show hand-back, landscape and portrait', () => {
  for (const aspect of [1.6, 0.6]) {
    const a = new THREE.PerspectiveCamera(60, aspect), b = new THREE.PerspectiveCamera(60, aspect), old = oldRig(b);
    const s = { x: 3, y: 0, z: -2, yaw: 0.4, fwd: 0, velYaw: 0.4 };
    rig.attach(a, { canvas, tractor: { yaw: 0.4 } }); rig.snap(s); old.follow(1, s); same(a, b, 'the new farm'); // 1.8: follow(1, pose) on a fresh cam
    for (let i = 0; i < 300; i++) {
      s.x += Math.sin(s.yaw) * 0.2; s.z += Math.cos(s.yaw) * 0.2; s.yaw += 0.015; s.fwd = i < 100 ? 1 : 6; s.velYaw = s.yaw + 0.35; s.y = Math.sin(i / 40);
      if (i === 150) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 2, 0)); rig.blendFrom(q); old.blendFrom(q); } // F-10
      const dt = i % 4 ? 1 / 60 : 1 / 30; rig.follow(s, dt); old.follow(dt, s); same(a, b, `frame ${i}`);
    }
    assert.ok(Math.abs(rig.yaw - old.yaw) < 1e-12, 'the stick heading');
  }
});
test('the ?tune camera rows write the shared CAM live, and a new farm keeps them', () => {
  const c = new THREE.PerspectiveCamera(60, 1.6); rig.attach(c, { canvas, tractor: { yaw: 0 } });
  assert.deepEqual([CAM.distance, CAM.height, CAM.lookAhead, CAM.portrait, CAM.portraitAspect], [12, 10.2, 11, 1.25, 0.9]); // 1.8's CAM.D, H, AHEAD, portrait
  const was = CAM.distance; CAM.distance = 16;
  try { rig.attach(c, { canvas, tractor: { yaw: 0 } }); rig.snap({ x: 0, y: 0, z: 0, yaw: 0 }); assert.ok(Math.abs(c.position.z + 16) < 1e-9); }
  finally { CAM.distance = was; }
});
test('the stick heading is the tractor\'s before the first follow, then the rig\'s (C-2, #81); shake settles', () => {
  const c = new THREE.PerspectiveCamera(60, 1.6); rig.attach(c, { canvas, tractor: { yaw: 1.2 } });
  assert.equal(rig.yaw, 1.2); const pose = { x: 0, y: 0, z: 0, yaw: 0.3 }; rig.snap(pose); assert.equal(rig.yaw, 0.3);
  const at = c.position.clone(); rig.shake(0.35); rig.follow(pose, 1 / 60); assert.ok(c.position.distanceTo(at) > 1e-6, 'boop shake');
  for (let i = 0; i < 60; i++) rig.follow(pose, 1 / 60); assert.ok(c.position.distanceTo(at) < 0.01, 'settled');
});
test('rig.project and rig.toNdc give 1.8\'s numbers (S-1, #73, M-77)', () => {
  const c = new THREE.PerspectiveCamera(60, 800 / 600); rig.attach(c, { canvas, tractor: { yaw: 0 } }); rig.snap({ x: 0, y: 0, z: 0, yaw: 0 });
  c.updateMatrixWorld(); const v = new THREE.Vector3(2, 1, 6).project(c), p = rig.project([2, 1, 6]), n = rig.toNdc(2, 1, 6);
  assert.ok(Math.abs(p.x - (10 + (v.x + 1) / 2 * 800)) < 1e-6 && Math.abs(p.y - (20 + (1 - v.y) / 2 * 600)) < 1e-6 && Math.abs(p.z - v.z) < 1e-9); assert.equal(p.onScreen, true);
  assert.ok(Math.abs(n.nx - v.x) < 1e-9 && Math.abs(n.ny - v.y) < 1e-9 && Math.abs(n.nz - v.z) < 1e-9); assert.equal(n.behind, false);
  assert.equal(rig.toNdc(0, 0, -40).behind, true); assert.equal(rig.project([0, 0, -40]).onScreen, false);
});
```

- [ ] **Step 2: Run** `UNIT test/view.purity.test.mjs test/view.rig.test.mjs`. Expected: FAIL in "declares the engine render pipeline" (`RENDER` undefined) and in every `view.rig` test (`CAM` is not exported by today's `view/rig.js`; `rig.snap` is not a function); the first purity test must already PASS (2g left no view write; if it fails, fix the line it names: that is a #102 regression).

- [ ] **Step 3: Implement.** `src/view/size.js`:

```js
// X-11: the size of the game view (the canvas), for screen-space layout (ui/show.js). The drive half copies view.gfx.size here each frame.
export const VIEW = { w: globalThis.innerWidth || 1, h: globalThis.innerHeight || 1 };
```
In `src/game.view.js` add, above `tractorView`:

```js
// The engine render pipeline (3l, overview §4.6, D5): today's renderer, camera and light rig as data. shading 'standard' (judgment,
// Task 14): golden animals keep their metal look and vertex-coloured art at roughness 1 reads like today's Lambert; R1 (Task 20) may
// move it to 'lambert'. Night (E-5): day → dusk → night, colours and intensities only (no shader change).
export const RENDER = Object.freeze({
  shading: 'standard', dpr: { touch: 1.5, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none', exposure: 1,
  camera: { fov: 60, fovPortrait: 64, near: 0.3, far: 500 },
  lights: { sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3, sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: [-26, 46, 22] }, fog: [90, 220],
    presets: { dusk: { sky: '#f4a76b', hemi: 0.8, sun: { color: '#ffa860', intensity: 1.125 } },
      night: { sky: '#1b2440', hemi: 0.3, sun: { color: '#9fb4ff', intensity: 0.15 } } } }, // 3e's field names (CI-8): day is the base look; a preset's sun is nested
});
// k 0 = day, 0.5 = sunset, 1 = night (render/scene.js setNight, moved): two lerps through dusk (3e's lights.set(k) is the same blend)
export const setNight = (lights, k) => k < 0.5 ? lights.lerp('day', 'dusk', k * 2) : lights.lerp('dusk', 'night', k * 2 - 1);
```
and `defineView({ scenes: …, render: RENDER })`. `pageOf(doc)` becomes `pageOf(view)`:

```js
function pageOf(view) {
  if (page) return page;
  const { renderer, scene, camera, lights } = view.gfx;
  page = { canvas: renderer.domElement, renderer, scene, camera, lights, aniso: renderer.capabilities.getMaxAnisotropy(), ...audioOf(), nightK: 0, perf: null };
  return page;
}
```
(every `pageOf(view.doc)` / `pageOf(doc)` call passes `view`; `menuHalves(doc => picturesOf(pageOf(doc)), net)` becomes `menuHalves(view => picturesOf(pageOf(view)), net)` and `src/view/menus.js` passes `view` where it passed `view.doc` to that callback). In the drive half's `frame`: replace `page.follow(v0.x, v0.z);` with `page.lights.follow(v0.x, v0.z);`, `page.setNight(page.nightK)` with `setNight(page.lights, page.nightK)`, delete `page.renderer.render(page.scene, page.camera);` (boot renders once after every half's frame, §4.6), and add `VIEW.w = view.gfx.size.w; VIEW.h = view.gfx.size.h;` at the top. The `?fps` meter's draw-time split moves: `perf.tick(...)` keeps its arguments but its draw time is now measured from the previous frame's end (record it in the notes as the G4 minor "sim ms is approximate", now "draw ms is the previous frame's").
`src/main.js`: `boot(tractorGame(), tractorView({…}), { canvas: document.getElementById('c'), timer: …, seed, scene, args, devices })`. `src/ui/show.js`: `import { VIEW } from '../view/size.js';`. `git rm src/render/scene.js`.
**Chase camera (CI-10, ruled: adopt 3g's rig).** 3g's heading style carries everything 1.8's camera did (velocity heading in a slide, the X-12 portrait distance below `portraitAspect` 0.9, shake, live `?tune` opts, the F-10 `blendFrom`), so Tractor's own port goes: `git rm src/render/camera.js`, and `src/view/rig.js` becomes a thin per-page wrapper:

```js
// The camera rig (lion-hawk 3l Task 14, CI-10): the engine's chase rig, heading style (V-1..V-3, X-12, F-10), and view.project, one per
// page. CAM is the rig's opts object, shared by every farm's rig, so a ?tune value outlives a new farm. rig.yaw is the heading the stick
// is read against (C-2, #81): the chase rig's, or before its first follow or snap the tractor's. Nothing here writes the sim.
import { createChaseRig, makeProject } from 'lion-hawk/view';
export const CAM = {}; // filled with the heading defaults by the first createChaseRig (distance 12, height 10.2, lookAhead 11, portrait 1.25, …)
const NDC = { nx: 0, ny: 0, nz: 0, behind: false }; let proj = null;
export const rig = {
  camera: null, chase: null, tractor: null,
  get yaw() { return rig.chase?.yaw ?? rig.tractor?.yaw ?? 0; },
  attach(camera, { canvas, tractor }) { // a fresh chase per farm (main.js build); the page's camera and canvas never change
    if (rig.camera !== camera || !proj) proj = makeProject(camera, canvas);
    rig.camera = camera; rig.tractor = tractor; rig.chase = createChaseRig(camera, CAM);
  },
  follow(pose, dt) { rig.chase.follow(pose, dt); }, // pose { x, y, z, yaw, fwd, velYaw: atan2(v.x, v.z) }
  snap(pose) { rig.chase.snap(pose); },             // a new farm: straight behind; cancels a blend and a shake
  shake(a) { rig.chase?.shake(a); },                // boop 0.35, bump 0.25
  blendFrom(q) { rig.chase?.blendFrom(q, 1); },     // F-10: the show's last camera turn, eased out over 1 s
  project: (p, out) => proj(p, out),                // engine.view.project (S-1, #73): one stable function for the page
  toNdc: (x, y, z) => proj.ndc(x, y, z, NDC),       // M-77 (hud.js arrows and finder): { nx, ny, nz, behind }, one reused object
};
```
Callers in `game.view.js`: `built()`'s `rig.follow(1, chaseIn)` becomes `rig.snap(chaseIn)`; the drive half's `rig.follow(dt, chaseIn)` becomes `rig.follow(chaseIn, dt)`; `rig.shake` and `rig.blendFrom` calls stay. `src/ui/debug.js`: `import { CAM } from '../view/rig.js';` and `VIEW_ROWS = [['cam dist', 'distance', 4, 20, 0.5], ['cam height', 'height', 4, 22, 0.5], ['cam ahead', 'lookAhead', 2, 24, 0.5]]` (the panel is built after `build()` has attached the rig, so `CAM` is filled). `hud.js` and `devices.js` keep `rig.toNdc` and `rig.yaw`. Feel changes: none in the chase path (the parity test pins it); the shake is a counter hash instead of `Math.random` (same amplitude and 0.25 s fade; 3g's field note).

- [ ] **Step 4: Run** `UNIT test/view.purity.test.mjs test/view.rig.test.mjs test/golden.test.mjs test/show.test.mjs test/menus.view.test.mjs` then `BROWSER test/e2e.browser.mjs`. Expected: PASS; e2e 14/14. (CI-8 is settled: the lights use 3e's field names, with `hemiSky` `#eef7ff` apart from the background `#bfe6f5`.)

- [ ] **Step 5: Prove the parity test bites.** Temporarily pass `{ ...CAM }` instead of `CAM` in `attach` (a copy per farm); run `UNIT test/view.rig.test.mjs`; expected FAIL in "the ?tune camera rows…" (`CAM` stays empty). Then temporarily `rig.chase = createChaseRig(camera, { ...CAM, ease: 5 })`; expected FAIL in "1.8's chase" at the first frame; restore.

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): engine renderer and light rig (defineView render), night as preset lerps; the chase camera on the engine rig"`

### Task 15: Models from `baked/` through `engine.assets`; Cube Pet parts and anim tables

**Files:** modify `src/game.view.js` (preload in the farm load); create `src/view/pets.js`, `src/view/geom.js`, `test/view.models.test.mjs`.

**Interfaces:** Consumes `view.assets.preload(keys)`, `view.wait(p)`, `assets.get(key) → { scene, clips, anim, sockets }`, `assets.clone(key, opts)`, `sampleAnimTable(table, clip, t, partIndex, outMatrix4)` (§4.7). Produces `MODELS` (every key in `baked/manifest.json`), `petKind(assets, key) → { key, table, parts: [{ name, index, geometry }], hat(clip, t, out) }`, `posePart(kind, clip, t, index, out)`, `modelGeometry(assets, key) → BufferGeometry` (all meshes merged in model space, float attributes), `partGeometry(assets, key, node) → BufferGeometry`.

- [ ] **Step 1: Failing test** `test/view.models.test.mjs` (Node, no WebGL: it loads the baked GLBs with three's `GLTFLoader.parse` and the meshopt decoder, as 3f's loader does):

```js
// The baked models as the view reads them (3l Task 15): pets pose from the anim tables with their hats on the head, and merged
// model geometry has float attributes in model space (quantized GLB attributes would overflow if transformed in place).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { petKind, posePart } from '../src/view/pets.js';
import { modelGeometry } from '../src/view/geom.js';
const MAN = JSON.parse(fs.readFileSync(new URL('../baked/manifest.json', import.meta.url)));
const PHYS = JSON.parse(fs.readFileSync(new URL('../baked/phys.json', import.meta.url)));
async function fakeAssets(keys) { // the subset of engine.assets the view modules use: get(key)
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), out = new Map();
  for (const k of keys) { const b = fs.readFileSync(new URL(`../baked/${MAN.models[k].glb}`, import.meta.url));
    const g = await l.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    const anim = MAN.models[k].anim ? JSON.parse(fs.readFileSync(new URL(`../baked/${MAN.models[k].anim}`, import.meta.url))) : null;
    out.set(k, { scene: g.scene, clips: g.animations, anim, sockets: PHYS.models[k].sockets }); }
  return { get: k => out.get(k) };
}
test('a pet poses from its table; the hat sits on the head top through the walk (W-4, HEAD_TOP 1.26)', async () => {
  const A = await fakeAssets(['pig']), pig = petKind(A, 'pig'), m = new THREE.Matrix4(), h = new THREE.Matrix4(), p = new THREE.Vector3(), b = new THREE.Vector3();
  assert.ok(pig.parts.length >= 5 && pig.parts.every(x => x.geometry?.isBufferGeometry));
  const body = pig.parts.find(x => x.name === 'body');
  for (let t = 0; t < 1; t += 0.1) { posePart(pig, 'walk', t, body.index, m); pig.hat('walk', t, h);
    p.setFromMatrixPosition(h); b.setFromMatrixPosition(m); assert.ok(p.y > 1.1 && p.y < 1.8, `hat y ${p.y}`); assert.ok(Math.abs(p.y - b.y - 1.26) < 0.05, `hat above body ${p.y - b.y}`); }
});
test('modelGeometry: one float geometry per model, in model space, with colours', async () => {
  const A = await fakeAssets(['oak']), g = modelGeometry(A, 'oak');
  for (const k of ['position', 'normal', 'color']) { assert.ok(g.attributes[k], k); assert.equal(g.attributes[k].array.constructor, Float32Array, k); assert.equal(g.attributes[k].normalized, false, k); }
  g.computeBoundingBox(); assert.ok(g.boundingBox.max.y > 1, 'the oak stands up in model space');
});
```

- [ ] **Step 2: Run** `UNIT test/view.models.test.mjs`. Expected: FAIL, `Cannot find module '../src/view/pets.js'`.

- [ ] **Step 3: Implement** `src/view/geom.js`:

```js
// Model geometry for instancing and merged statics (3l Task 15; was render/gfx.js geoFrom over assets.json): every mesh of a baked
// model in model space, merged, with float attributes. Baked GLBs are meshopt-quantized (normalized ints), so attributes are
// denormalized to Float32 before any transform. Cached per (assets, key); never per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const KEEP = ['position', 'normal', 'color', 'uv'];
const f32 = a => { const n = a.count, s = a.itemSize, out = new Float32Array(n * s); for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) out[i * s + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, s); };
function floatCopy(mesh, withUv) {
  const g = new THREE.BufferGeometry(), src = mesh.geometry;
  for (const k of KEEP) if (src.attributes[k] && (k !== 'uv' || withUv)) g.setAttribute(k, f32(src.attributes[k]));
  if (src.attributes.color && src.attributes.color.itemSize === 4) g.setAttribute('color', f32(src.attributes.color)); // RGBA kept as is
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g.applyMatrix4(mesh.matrixWorld);
}
const cache = new WeakMap();
export function modelGeometry(assets, key, { uv = false } = {}) {
  let per = cache.get(assets); if (!per) cache.set(assets, per = new Map());
  const ck = key + (uv ? '|uv' : ''); if (per.has(ck)) return per.get(ck);
  const root = assets.get(key).scene, list = []; root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) list.push(floatCopy(o, uv)); });
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false); per.set(ck, g); return g;
}
export function partGeometry(assets, key, node, { uv = false } = {}) {
  const root = assets.get(key).scene; root.updateMatrixWorld(true);
  const o = root.getObjectByName(node); if (!o?.isMesh) throw new Error(`geom: ${key} has no mesh '${node}'`);
  return floatCopy(o, uv);
}
```
`src/view/pets.js`:

```js
// Cube Pets in the view (3l Task 15; was render/gfx.js animM/sampleAnim over assets.json): per kind, the part geometries in the anim
// table's part order (each in its node's own space, as the table's frames are pet-space matrices per part) and the hat's frame. The
// hat row is the table's 'sock-hat' row when the bake samples sockets (CI-2); otherwise the hat rides its parent part: the part's
// frame × the inverse of that part's rest matrix × the socket (body space, from the sidecar).
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
const kinds = new WeakMap(), M = new THREE.Matrix4();
export function petKind(assets, key) {
  let per = kinds.get(assets); if (!per) kinds.set(assets, per = new Map()); if (per.has(key)) return per.get(key);
  const a = assets.get(key), table = a.anim, scene = a.scene; scene.updateMatrixWorld(true);
  const parts = [];
  table.parts.forEach((name, index) => { const o = scene.getObjectByName(name); if (o?.isMesh) parts.push({ name, index, geometry: o.geometry }); });
  const row = table.parts.indexOf('sock-hat'), sock = a.sockets?.hat;
  let hat;
  if (row >= 0) hat = (clip, t, out) => posePart(kind, clip, t, row, out);
  else {
    if (!sock) throw new Error(`pets: ${key} has no hat socket`);
    const parent = parts.find(p => p.name === sock.part) ?? parts.find(p => p.name === 'body');
    const restInv = scene.getObjectByName(parent.name).matrixWorld.clone().invert();
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...sock.p), new THREE.Quaternion(...sock.q), new THREE.Vector3(1, 1, 1));
    const after = new THREE.Matrix4().multiplyMatrices(restInv, local);
    hat = (clip, t, out) => { posePart(kind, clip, t, parent.index, M); return out.multiplyMatrices(M, after); };
  }
  const kind = { key, table, parts, hat };
  per.set(key, kind); return kind;
}
export function posePart(kind, clip, t, index, out) {
  sampleAnimTable(kind.table, kind.table.clips[clip] ? clip : 'idle', t, index, out); return out;
}
export const hasClip = (kind, clip) => !!kind.table.clips[clip];
```
In `src/game.view.js`: `import MANIFEST from '../baked/manifest.json' with { type: 'json' }; export const MODELS = Object.freeze(Object.keys(MANIFEST.models));` and in the drive half's `enter`, replace `build(s, engine.scene.args);` with `view.wait(view.assets.preload(MODELS).then(() => { if (engine.scene.state === s && !w) build(s, engine.scene.args); }));` so the first farm draws once every model is loaded and every compiled material is warm (A-10). Boot's assets get the manifest from the render config (3e; CI-12 settled): add `assets: { manifest: MANIFEST, base: './assets/' }` to `RENDER` (under `render`, never a top-level `defineView` key; `render.assets.decoders` only if 3f's loader needs one for the baked GLBs, 3f C1).

- [ ] **Step 4: Run** `UNIT test/view.models.test.mjs test/view.purity.test.mjs`. Expected: PASS.

- [ ] **Step 5: Prove the hat check bites.** Temporarily make `hat` return `posePart(kind, clip, t, parts[0].index, out)`; run; expected FAIL "hat above body"; restore.

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): models from baked/ through engine.assets; pet anim tables and merged model geometry"`

### Task 16 (judgment): The tractor and cars drawn by view sync; `view/bodies.js` and `vehicles3d.js` retire

**Decision expected:** the tractor and car entities get `model` (`'tractor'`, `'trailer'`) and `scale` (`TP.scale` / 1). View sync draws them (interpolated from the pool, E-11), **wheels included**: the vehicle kit writes each wheel's part pose (`e.partXf`, Task 13) and sync turns each named node about its bounding-box centre, interpolated with the body (3g Task 13b; as 3j Task 15 and 3k Tasks 12/17). `sync.on('#tractor')` and `sync.on('#car')` hooks add what sync cannot know, with no wheel code: in `create` the Kenney axis fix (model +z is chassis +x) and, for a car, a second wheel node (`trailer.glb` has one `wheel`; the hook clones it and names the two `CAR_WHEELS`); in `frame`, on a change only, the paint and the away ghost. Sync measures each hub once after the create hooks registered by then, so `trainViews` is registered in the drive half's `enter`, before any train is drawn. The ghost writes only the train's own materials: every train material carries a `coverage` block (`chassis`, `bed`, and the paint slots on the `chassis` base), so `coverageView` gives each train per-entity clones (3f `mc.coverage`: `userData.lhShared === false`, same program) before its first frame; a shared compiled material would ghost every train, so `ghost` throws on one. The paint is the engine's (3f Task 8b): compiled `paint-body`/`paint-trim` materials keep each vertex's shading, and `rainbow` is a hue ramp along the model's z. When a train's paint pair changes, the hook calls `view.materials.repaint(obj, paintValues(paintOf(e)))`. `e.paint` is not set. The paint is the player's progress (or, for a remote train, its roster row), which the view reads, and the view writes no entity (#102). `coverageView(sync, compiler)` feeds `uCoverage` from `e.coverage`. `repaint` changes coverageView's per-entity clones in place, so the order of the two hooks does not matter.

**User ruling 2026-10-14 (games fully on the engine): closed.** 1.8's per-train vertex recolour (`paintable`) does not move into the game. 3f Task 8b gives the engine a `PAINT` feature: the paint colour times the source vertex's relative brightness, the hue ramp, and one program per feature set, plus `mc.repaint`. That closes Integrator request 6. The paint test below checks the engine's drawn colours at every paint vertex of the baked tractor against 1.8's `paintable`, copied in as the oracle. This task needs engine 0.9.0 with 3f Task 8b, 3e accepting `render.paint` (3e Task 7; 3f Integrator request 2) and the part poses (3c Task 10b, 3g Task 13b, 3h Task 6b). If the paint pieces are missing when the task starts, do the rest (sync draw, wheels, coverage, away ghost), stop before the paint, and resume on the patch; if the part poses are missing, stop and file it (no game wheel code).

**Files:** create `src/view/vehicles.js`, `test/view.sync.test.mjs`, `test/helpers/assets.mjs`; modify `src/sim/tractor.js`, `src/sim/hitch.js`, `src/sim/game.js` (entity fields only), `src/game.view.js` (`RENDER.paint`, the hooks), `src/view/world.js`, `src/view/hud.js` (`tractorAt`), `src/ui/icons.js`, `src/ui/menus.js`, `src/ui/roster.js` (the `PAINTS` import), `test/view.models.test.mjs` (`fakeAssets` moves out); delete `src/view/bodies.js`, `src/render/vehicles3d.js`, `src/render/dirtMat.js` (see Task 17 for gold).

**Interfaces:** Consumes `view.sync.on(match, hooks) → off`, `view.sync.objectOf(e)`, view sync's part poses (3g Task 13b: each `e.partXf` name is a node found by `getObjectByName` after the create hooks; its bounding-box centre is drawn at `p` in the body frame, turned by `q` from rest; a missing node throws), `CAR_WHEELS` and the kit's wheel `part`s (Task 13) and `coverageView(sync, compiler)` (`lion-hawk/kits/coverage/view`), whose per-entity clones (3f `mc.coverage`, `userData.lhShared === false`) the ghost writes. From 3f Task 8b it consumes `view.materials.repaint(root, paint) → root`, the paint values (a colour, or `{ hue: { axis, from, to, s, l } }`), `render.paint = { base, shade }`, and, in tests, `createMaterialCompiler(registry, { paint })` (`lion-hawk/view`). Produces:
- `PAINTS`: CSS colours for the UI, with `rainbow: null` as in 1.8;
- `RAINBOW`;
- `PAINT_LOOK`;
- `paintValues({ body, trim }) → { body, trim }` (engine paint values);
- `trainViews(sync, { materials, paintOf, awayOf }) → off`;
- `fakeAssets(keys)` (`test/helpers/assets.mjs`).

- [ ] **Step 1: Failing test.** Move `fakeAssets` from `test/view.models.test.mjs` (Task 15) into `test/helpers/assets.mjs` as `export async function fakeAssets(keys)`, unchanged, and have the models test import it from there. Then write `test/view.sync.test.mjs`:

```js
// The train's view hooks (3l Task 16): create only shapes the model (view sync draws the wheels from the kit's part poses); the away ghost
// stays on its own train; the engine paint (3f PAINT, repaint) draws 1.8's paintable colours at every paint vertex of the baked tractor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialCompiler } from 'lion-hawk/view';
import MATERIALS from '../src/defs/materials.js';
import { fakeAssets } from './helpers/assets.mjs';
import { coverageView } from 'lion-hawk/kits/coverage/view';
import { trainViews, paintValues, PAINTS, RAINBOW, PAINT_LOOK } from '../src/view/vehicles.js';
import { TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { CAR_WHEELS } from '../src/sim/hitch.js';

// view sync's hook order (3g): each entity's create hooks, then its frame hooks; a match is '#tag' or a predicate
function fakeSync() {
  const hooks = [], is = (m, e) => typeof m === 'function' ? m(e) : e.tags.has(m.slice(1));
  return { on(m, h) { hooks.push([m, h]); return () => {}; },
    create(e, o) { for (const [m, h] of hooks) if (is(m, e)) h.create?.(e, o); }, frame(e, o) { for (const [m, h] of hooks) if (is(m, e)) h.frame?.(e, o, 1); } };
}
// two tractors and two cars from the baked models, as sync clones them (shared compiled materials), through the hooks as wired in game.view.js
async function trains({ cover = true } = {}) {
  const A = await fakeAssets(['tractor', 'trailer']), mc = createMaterialCompiler(MATERIALS, { paint: PAINT_LOOK }), sync = fakeSync(), away = new Set();
  trainViews(sync, { materials: mc, paintOf: () => ({ body: 'red', trim: 'yellow' }), awayOf: e => away.has(e.id) }); if (cover) coverageView(sync, mc);
  const ents = [['tractor', 'tractor'], ['tractor', 'tractor'], ['car', 'trailer'], ['car', 'trailer']].map(([tag, model], i) => ({ id: i + 1, tags: new Set([tag]), model, coverage: { dirt: 0 } }));
  const objs = ents.map(e => { const o = A.get(e.model).scene.clone(true); mc.apply(o); sync.create(e, o); return o; });
  return { objs, away, frame: () => ents.forEach((e, i) => sync.frame(e, objs[i])) };
}
const mats = o => { const out = []; o.traverse(m => { if (m.isMesh) out.push(...[].concat(m.material)); }); return out; };
test('create only shapes the model: the axis fix, one node per kit wheel part; no wheel code in the hooks (view sync draws the wheels)', async () => {
  const { objs } = await trains();
  assert.equal(objs[0].children.length, 1, 'the model sits under the axis-fix group');
  for (const w of TRACTOR_WHEELS) assert.ok(objs[0].getObjectByName(w.name)?.isMesh, w.name);
  for (const n of CAR_WHEELS) assert.ok(objs[2].getObjectByName(n)?.isMesh, n);
  assert.doesNotMatch(trainViews.toString(), /wheelRotation|wheelSteering|wheelSuspensionLength|matrixAutoUpdate|e\.car\b/, 'no per-frame wheel code');
});
test('ghosting one train leaves the other trains\' materials opaque (per-entity clones from coverageView)', async () => {
  const { objs, away, frame } = await trains();
  away.add(2); away.add(4); frame();
  objs.forEach((o, i) => { const on = i === 1 || i === 3;
    for (const m of mats(o)) { assert.equal(m.userData.lhShared, false, `train ${i + 1}: ${m.name} is its own`); assert.equal(m.transparent, on, `train ${i + 1} ${m.name}`); assert.equal(m.opacity, on ? 0.45 : 1); } });
  away.clear(); frame();
  for (const o of objs) for (const m of mats(o)) assert.ok(!m.transparent && m.opacity === 1, 'un-ghosted');
});
test('ghosting a train on shared compiled materials throws instead of ghosting every train', async () => {
  const { objs, away, frame } = await trains({ cover: false });
  away.add(2); assert.throws(frame, /tractor: ghost needs per-entity materials/);
  for (const m of mats(objs[0])) assert.equal(m.opacity, 1, 'the other tractor stays opaque');
});
test('paintValues: colours by name (red for an unknown name), rainbow as the hue ramp along the model z; the compiler look', () => {
  assert.deepEqual(paintValues({ body: 'blue', trim: 'rainbow' }), { body: PAINTS.blue, trim: RAINBOW });
  assert.deepEqual(RAINBOW, { hue: { axis: [0, 0, 1], from: -1, to: 1, s: 0.75, l: 0.5 } });
  assert.equal(paintValues({ body: 'mauve', trim: 'red' }).body, PAINTS.red);
  assert.deepEqual(PAINT_LOOK, { base: 'chassis', shade: [0.25, 0.85, 1.1] });
  assert.equal(PAINTS.rainbow, null, 'the UI keeps drawing its own rainbow gradient');
});
// Tractor 1.8's paintable (render/vehicles3d.js at 1.8.0), the oracle. rows: [{ area 1 body | 2 trim, pos (model space), col (linear) }].
// Each paint vertex gets the paint, or the rainbow hue at its model z, times 0.25 + 0.85 × its brightness over its area's brightest, at most 1.1.
function paintable18(rows, { body, trim }) {
  const top = [0, 0, 0], c = new THREE.Color();
  const lum = rows.map(r => Array.from({ length: r.col.length / 3 }, (_, i) => 0.3 * r.col[i * 3] + 0.6 * r.col[i * 3 + 1] + 0.1 * r.col[i * 3 + 2]));
  rows.forEach((r, j) => lum[j].forEach(l => { top[r.area] = Math.max(top[r.area], l); }));
  return rows.map((r, j) => lum[j].flatMap((l, i) => {
    const name = r.area === 1 ? body : trim, k = Math.min(1.1, 0.25 + 0.85 * l / top[r.area]);
    if (name === 'rainbow') c.setHSL(((r.pos[i * 3 + 2] + 1) * 0.5) % 1, 0.75, 0.5); else c.set(PAINTS[name] ?? PAINTS.red);
    return [c.r * k, c.g * k, c.b * k];
  }));
}
// 3f's PAINT for a plain mesh in JS (chunks.js paint(): the vertex stage's vLhPaint), from lhPaint and the material's own uniforms
const fract = x => x - Math.floor(x);
function drawn(m, a, i, out) {
  const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  m.onBeforeCompile(sh, null);
  const md = sh.uniforms.uPaintMode.value, ax = sh.uniforms.uPaintAxis.value, s = sh.uniforms.uPaintShade.value, k = Math.min(s.z, s.x + s.y * a.getW(i));
  if (md.x > 1.5) return out.setHSL(fract(ax.x * a.getX(i) + ax.y * a.getY(i) + ax.z * a.getZ(i) + ax.w), md.y, md.z).multiplyScalar(k);
  assert.ok(md.x > 0.5, 'every paint vertex is painted');
  return out.copy(m.color).multiplyScalar(k);
}
test('the engine paint draws 1.8\'s paintable colours at every paint vertex of the baked tractor (the fenders and the roof share one top)', async () => {
  const A = await fakeAssets(['tractor']), mc = createMaterialCompiler(MATERIALS, { paint: PAINT_LOOK }), obj = A.get('tractor').scene.clone(true);
  mc.apply(obj); obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), rows = [];
  obj.traverse(m => {
    const area = m.isMesh && { 'paint-body': 1, 'paint-trim': 2 }[m.userData.lhMat?.[0]];
    if (!area) return;
    const g = m.geometry, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), v = new THREE.Vector3(), pos = [], col = [];
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(M); pos.push(v.x, v.y, v.z);
      col.push(g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i));
    }
    rows.push({ m, area, pos, col });
  });
  assert.deepEqual(rows.map(r => r.area).sort(), [1, 2, 2], 'paint-body on the body; paint-trim on the fenders and the roof');
  const out = new THREE.Color();
  for (const p of [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'rainbow' }, { body: 'rainbow', trim: 'white' }]) {
    mc.repaint(obj, paintValues(p));
    const want = paintable18(rows, p);
    rows.forEach((r, j) => { const a = r.m.geometry.attributes.lhPaint; assert.ok(a, `${r.m.name}: apply wrote lhPaint`);
      for (let i = 0; i < a.count; i++) { drawn(r.m.material, a, i, out);
        ['r', 'g', 'b'].forEach((ch, k) => assert.ok(Math.abs(out[ch] - want[j][i * 3 + k]) < 1e-5, `${p.body}/${p.trim} ${r.m.name} vertex ${i} ${ch}: ${out[ch]} vs ${want[j][i * 3 + k]}`)); } });
  }
});
```

- [ ] **Step 2: Run** `UNIT test/view.sync.test.mjs`. Expected: FAIL, `Cannot find module '../src/view/vehicles.js'`.

- [ ] **Step 3: Implement** `src/view/vehicles.js`:

```js
// The train's drawing (3l Task 16; was render/vehicles3d.js, render/others3d.js and view/bodies.js). View sync clones each tractor and
// car entity's model and poses it from the pool every frame (E-11, interpolated), wheels included: the vehicle kit writes each wheel's
// part pose (e.partXf) and sync turns the named node about its hub (3g Task 13b). These hooks add the Kenney axis fix (model +z is the
// chassis +x) and the car's second wheel node at create, then, on a change only, the paint (W-3: the engine's shading-preserving paint
// on the paint-body / paint-trim slots, rainbow a hue ramp along the tractor; 3f Task 8b) and the away ghost (M-39, M-40). Local and
// remote trains alike.
import * as THREE from 'three';
import { CAR_WHEELS } from '../sim/hitch.js';

// W-3: the paints as CSS colours for the UI (roster, menus, HUD), in unlock order; rainbow is null there (the UI draws its own gradient)
export const PAINTS = { red: '#d8342c', yellow: '#f2c230', green: '#3f9b3a', blue: '#2f6fd6', pink: '#f07aa8', orange: '#f28a1e', purple: '#8a4fd0', white: '#f4f1ea', rainbow: null };
// rainbow on the tractor (1.8's paintable): hue = fract((z + 1) / 2) along the model's z, saturation 0.75, lightness 0.5
export const RAINBOW = Object.freeze({ hue: Object.freeze({ axis: Object.freeze([0, 0, 1]), from: -1, to: 1, s: 0.75, l: 0.5 }) });
// the compiler's paint look (RENDER.paint): the paint base is chassis (it takes dirt); shade k = 0.25 + 0.85 × relative brightness, at most 1.1
export const PAINT_LOOK = Object.freeze({ base: 'chassis', shade: Object.freeze([0.25, 0.85, 1.1]) });
const COAT = Object.freeze({ ...PAINTS, rainbow: RAINBOW });
// a { body, trim } pair of paint names → the engine's paint values (an unknown name paints red, as 1.8 did); on a change only
export const paintValues = ({ body, trim }) => ({ body: COAT[body] ?? PAINTS.red, trim: COAT[trim] ?? PAINTS.red });
const AXES = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
// the away ghost writes only this train's own materials: coverageView's per-entity clones (3f mc.coverage, lhShared false; every train
// material has a coverage block). A shared compiled material is every train's, so ghosting it would ghost them all: that throws.
function ghost(obj, on, shadowOf) {
  obj.traverse(m => { if (!m.isMesh) return; m.castShadow = !on && shadowOf(m);
    for (const mat of [].concat(m.material)) {
      if (mat.userData.lhShared !== false) throw new Error(`tractor: ghost needs per-entity materials (mesh '${m.name}' has the shared '${mat.name}'): register coverageView, and give the registry material a coverage block`);
      mat.transparent = on; mat.opacity = on ? 0.45 : 1; mat.depthWrite = !on; mat.needsUpdate = true; } });
}
// materials: view.materials (repaint, 3f Task 8b); paintOf(e) → { body, trim } names; awayOf(e) → boolean (remote trains, Part E); local
// trains give false
export function trainViews(sync, { materials, paintOf, awayOf = () => false }) {
  const state = new Map(); // entity id → per-train view state (made at create, dropped at remove)
  const offTractor = sync.on('#tractor', {
    create(e, obj) { // static shaping only, before sync measures the wheel hubs (the wheels are sync's, from e.partXf)
      const inner = new THREE.Group(); inner.quaternion.copy(AXES); while (obj.children.length) inner.add(obj.children[0]); obj.add(inner);
      state.set(e.id, { body: '', trim: '', away: false }); // paint: the first frame repaints (lhPaint is model space, so the axis fix does not move the rainbow)
    },
    frame(e, obj) {
      const st = state.get(e.id); if (!st) return;
      const p = paintOf(e); if (p.body !== st.body || p.trim !== st.trim) { st.body = p.body; st.trim = p.trim; materials.repaint(obj, paintValues(p)); } // a change only: repaint allocates
      const away = awayOf(e); if (away !== st.away) { st.away = away; ghost(obj, away, m => !m.name.startsWith('wheel')); }
    },
    remove(e) { state.delete(e.id); }, // per-entity materials go with the object (coverageView's remove, sync's disposeTree); geometry is the template's
  });
  const offCar = sync.on('#car', {
    create(e, obj) { // trailer.glb has one wheel node (centred, models.mjs); the kit's two wheel parts need a node each: CAR_WHEELS (side -1, +1)
      const w0 = obj.getObjectByName('wheel'), w1 = w0.clone(); w0.parent.add(w1); w0.name = CAR_WHEELS[0]; w1.name = CAR_WHEELS[1];
      state.set(e.id, { away: false });
    },
    frame(e, obj) {
      const st = state.get(e.id); if (!st) return; const away = awayOf(e); if (away !== st.away) { st.away = away; ghost(obj, away, m => m.name === 'bed'); }
    },
    remove(e) { state.delete(e.id); },
  });
  return () => { offTractor(); offCar(); state.clear(); };
}
```
Sim data (no checksum effect): in `createTractor`'s spawn desc add `model: 'tractor', scale: TP.scale`; in `createCar` add `model: 'trailer'` (`coverage` is already there, Task 13b; the wheel `part`s and `e.partXf` are Task 13's). No `e.car`: the view reads no controller.
View: in `game.view.js`, `RENDER` gains `paint: PAINT_LOOK` (import `PAINT_LOOK`, `PAINTS` and `trainViews` from `./view/vehicles.js`). Boot then builds `view.materials` with the `chassis` paint base and 1.8's shade, which needs 3e to accept `render.paint` (3f Integrator request 2). In the drive half's `enter` itself (not in the preload's `then`: sync measures the wheel hubs after the create hooks registered when a train is first drawn): `offs.push(trainViews(view.sync, { materials: view.materials, paintOf: e => engine.scene.state.progress?.paint ?? engine.scene.args?.progress?.paint ?? START_PAINT }), coverageView(view.sync, view.materials))` (import `START_PAINT` from `../net/players.js`, `coverageView` from `lion-hawk/kits/coverage/view`; if `coverageView` returns no `off`, push `() => {}`). Delete `createBodies`, `bodies.*`, `vehSnap`, `w.vehicles` and the `progress` event's `w.vehicles.setPaint` (the hook reads the paint each frame). The chase input reads the drawn tractor: `const v0 = view.sync.objectOf(g.tractor.e)?.position ?? g.tractor.body.translation();` HUD's `tractorAt: () => view.sync.objectOf(engine.scene.state.game.tractor.e)?.position`. `ui/icons.js`'s `tractorPicture` imports `paintValues` from `../view/vehicles.js` (it is rewritten in Task 17); `ui/menus.js` and `game.view.js` import `PAINTS` from `../view/vehicles.js` / `./view/vehicles.js`, and `ui/roster.js`'s comment names it there. `render/others3d.js` stays until Task 25. `git rm src/view/bodies.js src/render/vehicles3d.js`.

- [ ] **Step 4: Run** `UNIT test/view.sync.test.mjs test/view.models.test.mjs test/view.purity.test.mjs test/golden.test.mjs` then `BROWSER test/e2e.browser.mjs`. Expected: PASS; goldens bit-exact (if not: the entity fields moved a checksum; remove them from whatever reads them into state and report). Manual look: `node test/serve.mjs`-style quick page (`npx lion-hawk dev`), drive W/A/S/D, paint screen through all paints including rainbow: wheels roll forward, steer at the front, bounce over the ramp, on the trailer and wagon too; **the bbox hub matches the old pivots**: view sync now turns each wheel about its node's bounding-box centre, where 1.8 used `TRACTOR_WHEELS`' hand-set `(mx, my, mz)` and the car wheel's origin. In the console, for each tractor wheel compare `getObjectByName(w.name)`'s geometry bounding-box centre (in the model, inside the axis-fix group) with `(w.mx, w.my, w.mz)`, and for a car compare `wheel-left`'s centre with its origin; record all six in the notes. A wheel that wobbles, orbits its axle or sits off its arch, or a centre more than 5 mm off, is a playtest stop: report it (it is the GLB's, so the fix is a bake or engine one, not game wheel code); dirt appears in mud; paints match today's screenshots (take them from `$SCRATCH/tractor-old`), including dirt over the paint and the rainbow running front to back. Paint is now uniforms of one program: `renderer.info.programs.length` must not change through the paint screen (log it before and after).

- [ ] **Step 5: Prove the wheel, ghost and paint checks bite.** Temporarily delete the car hook's `w0.name = …; w1.name = …;`, run `UNIT test/view.sync.test.mjs`, expect FAIL "create only shapes the model…" (`wheel-left`), and restore. Delete the `lhShared` guard in `ghost`: expect FAIL "ghosting a train on shared compiled materials throws…" (no throw, and the other tractor turns transparent with it); restore. Then change `RAINBOW`'s `from: -1` to `from: 0`: expect FAIL in "paintValues…" and in "the engine paint draws…" on the rainbow pairs. Restore it, then change `PAINT_LOOK.shade` to `[0.25, 0.85, 1]`: expect FAIL in both tests (the brightest vertices are capped). Restore; PASS.

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): train drawn by view sync (wheels from kit part poses, engine paint, coverage, per-train ghost); bodies.js and vehicles3d.js retire"`

### Task 17: Animals, hats, icons and stickers on the assets; `gfx.js` and `assets.json` retire

**Files:** modify `src/render/animals3d.js`, `src/ui/icons.js`, `src/ui/stickerArt.js`, `src/game.view.js` (`picturesOf`), `src/view/menus.js` (`createStickerArt`), `test/assets.test.mjs` (reads `baked/` through `test/helpers/assets.mjs`'s `fakeAssets`, moved there in Task 16); delete `src/render/gfx.js`, `src/assets.json`, `src/render/dirtMat.js`.

**Interfaces:** Consumes `petKind`, `posePart`, `view.assets.clone('hat-<id>')`, `mc.get(id, { vertexColors })`, `mc.coverage(material) → { material, uniforms: { uCoverage } }`, `snapshot(renderer, object, { size, camera, yaw, pitch, lights, crop, outline, out }) → dataURL` (3e Task 5: the object alone in a studio scene, the renderer's state restored, `''` when a crop finds nothing; `lights: false` turns the studio lights off so a picture brings 1.8's own; `crop`/`outline`/`out` are the stickers' die-cut), `view.materials.repaint(root, paint)` and `paintValues` (3f Task 8b, Task 16). Produces `createAnimals3D(scene, herd, { assets, compiler })` (same `update(dt, game, view)`, `sing`), `renderIcons(renderer, assets, compiler)`, `tractorPicture(renderer, assets, compiler)`, `createStickerArt(renderer, assets, compiler)`.

- [ ] **Step 1: Failing test.** Rewrite `test/assets.test.mjs` onto `fakeAssets` (`test/helpers/assets.mjs`, Task 16): each old assertion keeps its meaning against the baked models: statics present (`modelGeometry(A, k)` non-empty), tractor paint slots (`paint-body` on the `body` node, `paint-trim` on `fenders` and `roof`, none on glass/details/wheels: read `mesh.material.name`), barn parts by name with UVs on `walls`/`roof-gables`, hats on the head through the walk (as in Task 15 for all eight pets), eight pets with ≥ 5 parts and idle/walk/run clips, the sheep/duck/chicken/rock colour shares (read the merged `color` attribute through `modelGeometry`; colours are linear in the GLB, so convert with `THREE.Color.prototype.convertLinearToSRGB` before the 0..255 thresholds). Add: `test('no src module imports assets.json or render/gfx.js', …)` scanning `src/**` for `assets.json` and `render/gfx`, and `test('pictures go through the engine snapshot: no render target, pixel read or paintable under src/', …)` scanning `src/**` for `WebGLRenderTarget`, `readRenderTargetPixels` and `paintable(` (user ruling 2026-10-14: no game copy of `snapshot` or of the paint).

- [ ] **Step 2: Run** `UNIT test/assets.test.mjs`. Expected: FAIL in the import scan (`render/animals3d.js`, `ui/icons.js`, `ui/stickerArt.js`, `render/farm3d.js` still import `gfx.js`) and in the picture scan (`ui/icons.js` and `ui/stickerArt.js` keep their own render targets).

- [ ] **Step 3: `render/animals3d.js`.** Replace the gfx/dirtMat imports with `import { petKind, posePart, hasClip } from '../view/pets.js';`. `createAnimals3D(scene, herd, { assets, compiler })`:
  - `const base = compiler.get('pet', { vertexColors: true }), gold = compiler.get('gold'); const kinds = Object.fromEntries(Object.entries(MODEL).map(([t, m]) => [t, petKind(assets, m)]));`
  - hats: `buildHat(id)` → `assets.clone('hat-' + id)` (shared geometry and compiled material; `castShadow` on its meshes).
  - `makeView(a)`: `const cov = compiler.coverage(a.golden ? gold : base)` (one per animal, one program) and parts `kinds[a.type].parts.map(p => { const m = new THREE.Mesh(p.geometry, cov.material); … })`; keep `dirt = cov.uniforms.uCoverage` and write `v.dirt.value.x = a.dirt || 0` where it wrote `v.dirt.value = …`; `wings` = indexes of parts whose name starts with `wing`; `hatRow` is gone (the hat uses `kinds[type].hat(name, v.t, v.hat.matrix)`).
  - pose: `v.parts.forEach((m, i) => { posePart(kind, name, v.t, kind.parts[i].index, m.matrix); m.matrixWorldNeedsUpdate = true; })` with `const kind = kinds[a.type], name = hasClip(kind, anim) ? anim : 'idle'`; the `dance` check uses `hasClip(kind, 'dance')`.
  - the B-3 keeper meshes are deleted (the compiler's materials are warmed by `assets.preload`/`warm`, M-12).
  - `drop(i)` disposes `v.parts[0].material` (the coverage clone; the program is shared).
  The drive half creates it with `createAnimals3D(world, game.herd, { assets: view.assets, compiler: view.materials })` (`view/world.js`'s `buildWorld` gains `{ assets, compiler }`).
- [ ] **Step 4: Icons, the paint picture and stickers on `snapshot`.** Each picture draws the posed baked model with the compiled materials, and the engine's `snapshot` (3e Task 5) renders it once to a data URL. 3e's code shows how the parameters map: the portraits and the paint picture keep 1.8's fixed cameras and their own lights (`lights: false`, with the lights inside the snapshotted group). The stickers use the studio, whose lights and yaw/pitch framing are 1.8's sticker rig (hemisphere 2.2 `#ffffff`/`#b9a27c`, sun 1.6 at (2, 5, 4), fov 28, fill 1.02), plus `crop` and `outline`. The paint picture paints a tractor clone with the engine paint (`repaint`, Task 16), once per paint pair. `ui/icons.js`:

```js
// The slot bar and sticker card portraits and the paint screen's tractor (3l Task 17; were hand-made render targets): posed baked
// models drawn with the compiled materials, rendered once each to a data URL by the engine's snapshot (3e, §4.6). Each keeps 1.8's
// fixed camera and light rig: the lights ride in the snapshotted group and the studio lights are off (lights: false).
import * as THREE from 'three';
import { snapshot } from 'lion-hawk/view';
import { petKind, posePart } from '../view/pets.js';
import { MODEL } from '../render/animals3d.js';
import { paintValues } from '../view/vehicles.js';
// 1.8's picture lights: a hemisphere (sky #ffffff, ground #b9a27c, 2.2) and a white sun of the given intensity at sunAt (aimed at the origin)
function stage(sun, sunAt) {
  const g = new THREE.Group(), d = new THREE.DirectionalLight('#ffffff', sun); d.position.fromArray(sunAt);
  g.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2), d);
  return g;
}
// { [type]: dataURL, golden: { [type]: dataURL } }, 256 px (the sticker card shows it big; the slot bar scales it down by CSS)
export function renderIcons(renderer, assets, compiler) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.9, 2.2, 3.1); cam.lookAt(0, 0.6, 0); cam.updateMatrixWorld();
  const out = { golden: {} }, mat = compiler.get('pet', { vertexColors: true }), gold = compiler.get('gold'), st = stage(1.5, [2, 4, 3]);
  for (const [type, model] of Object.entries(MODEL)) for (const golden of [false, true]) {
    const k = petKind(assets, model), g = new THREE.Group(); g.rotation.y = -0.5;
    for (const p of k.parts) { const m = new THREE.Mesh(p.geometry, golden ? gold : mat); m.matrixAutoUpdate = false; posePart(k, 'idle', 0, p.index, m.matrix); g.add(m); } // part geometry is in its node's own space
    st.add(g);
    (golden ? out.golden : out)[type] = snapshot(renderer, st, { size: 256, camera: cam, lights: false });
    st.remove(g); // geometries and materials are shared (the template's, the compiler's): nothing to dispose
  }
  return out;
}
// W-3: the paint screen's picture: the tractor in a paint pair, three-quarter view, 480 × 360 (CI-13), cached per pair
export function tractorPicture(renderer, assets, compiler) {
  const cam = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 50), cache = new Map(), st = stage(1.6, [3, 5, 4]), obj = assets.clone('tractor');
  st.add(obj); st.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  obj.rotation.y = -0.6; cam.position.set(c.x + r * 0.2, c.y + r * 1.1, c.z + r * 3.6); cam.lookAt(c.x, c.y - r * 0.1, c.z); cam.updateMatrixWorld();
  return paint => {
    const key = paint.body + '/' + paint.trim;
    if (!cache.has(key)) { compiler.repaint(obj, paintValues(paint)); cache.set(key, snapshot(renderer, st, { size: [480, 360], camera: cam, lights: false })); }
    return cache.get(key);
  };
}
```

`ui/stickerArt.js` (user ruling 2026-10-14: its render target, pixel read, crop and die-cut border are `snapshot`'s `crop`, `outline` and `out`):

```js
// W-1: die-cut stickers (3l Task 17; was a hand-made render target, crop and border). The animal in the sticker's pose (one frame of
// a clip) and camera angle, through the engine's snapshot: the studio lights and yaw/pitch framing are 1.8's sticker rig, crop:
// true cuts to the animal, outline the thick white border that follows its shape. Each look is rendered once, then cached.
import * as THREE from 'three';
import { snapshot } from 'lion-hawk/view';
import { petKind, posePart, hasClip } from '../view/pets.js';
import { MODEL } from '../render/animals3d.js';

// pose -> [clip, the moment in it as a part of its length]: a frame where the pose reads clearly
export const POSE_FRAME = { idle: ['idle', 0.2], walk: ['walk', 0.25], run: ['run', 0.3], dance: ['dance', 0.35], eat: ['eat', 0.5], shake: ['gesture-negative', 0.4] };
// view -> the animal turned by yaw (0 faces the camera) and the camera raised by pitch (rad)
export const VIEW_ANGLES = [{ yaw: -0.55, pitch: 0.22 }, { yaw: 0.55, pitch: 0.22 }, { yaw: -1.05, pitch: 0.3 }, { yaw: 1.05, pitch: 0.3 }, { yaw: -0.3, pitch: 0.55 }];
const N = 384, BORDER = 11; // render size and white border (px)

export function createStickerArt(renderer, assets, compiler) {
  const mat = compiler.get('pet', { vertexColors: true }), gold = compiler.get('gold'), cache = new Map(), info = {};
  function render({ type, golden, pose, view }) {
    const k = petKind(assets, MODEL[type]), [clip, at] = POSE_FRAME[pose] || POSE_FRAME.idle, name = hasClip(k, clip) ? clip : 'idle', v = VIEW_ANGLES[view] || VIEW_ANGLES[0];
    const g = new THREE.Group(), t = at * k.table.clips[name].dur;
    for (const p of k.parts) { const m = new THREE.Mesh(p.geometry, golden ? gold : mat); m.matrixAutoUpdate = false; posePart(k, name, t, p.index, m.matrix); g.add(m); }
    const src = snapshot(renderer, g, { size: N, yaw: v.yaw, pitch: v.pitch, crop: true, outline: { px: BORDER, color: '#ffffff' }, out: info });
    return src ? { src, w: info.w, h: info.h } : { src: '', w: 1, h: 1 }; // nothing drawn: 1.8's empty sticker
  }
  return {
    // { src (PNG data URL), w, h } for a sticker { type, golden, pose, view }
    get(s) { const key = `${s.type}|${!!s.golden}|${s.pose}|${s.view}`; if (!cache.has(key)) cache.set(key, render(s)); return cache.get(key); },
  };
}
```
The callers pass the engine's renderer, assets and compiler: `picturesOf` in `game.view.js` becomes `p.icons ??= renderIcons(p.renderer, view.assets, view.materials); p.tractorPic ??= tractorPicture(p.renderer, view.assets, view.materials);`, and `view/menus.js` makes `createStickerArt(p.renderer, view.assets, view.materials)`. Compare each with 1.8's screenshots (`$SCRATCH/tractor-old`): a sticker whose crop or border differs from 1.8's by more than 1 px stops the task, and the measured difference goes to the integrator as a request against 3e's `snapshot`. The portraits and the paint picture differ only by the shading tier (compiled `standard` versus 1.8's Lambert), which goes into the playtest list with Task 20's side-by-side.
- [ ] **Step 5: Gold.** **(judgment)** With `shading: 'standard'` the `gold` registry material carries today's look (metalness 0.7, roughness 0.3, emissive). If Task 20 moves the game to `lambert`, gold loses its sheen (lambert has no metalness): CI-3 asks 3f for a per-material tier override; until then gold stays as `standard` only if the compiler allows it, otherwise the look change goes into the playtest list. `git rm src/render/dirtMat.js src/render/gfx.js src/assets.json`.
- [ ] **Step 6: Run** `UNIT test/assets.test.mjs test/view.models.test.mjs test/hats.test.mjs test/view.purity.test.mjs test/golden.test.mjs` then `BROWSER test/e2e.browser.mjs`. Expected: PASS. Manual look: the slot bar icons, the sticker card, the book's stickers, the paint picture in every unlocked pair (rainbow on body and on trim), a golden animal, a dirty pig, hats on riders through a drive.
- [ ] **Step 7: Commit** `git add -A src test && git commit -m "feat(tractor): animals, hats, icons and stickers from the baked models; gfx.js and assets.json retire"`

### Task 18: The farm's 3D on compiled materials and instancing; hygiene from the engine

**Files:** modify `src/render/farm3d.js`, `src/render/fx.js`, `src/render/gibs.js`, `src/view/world.js`; delete `src/render/matSplit.js`, `src/render/shadows.js`, `src/render/warm.js`, `src/render/dispose.js`, `test/matSplit.test.mjs`, `test/shadows.test.mjs`, `test/warm.test.mjs`.

**Interfaces:** Consumes `createInstances({ geometry, material, max, castShadow, receiveShadow }) → { mesh, count, set, color, commit }`, `instancedShadows(root)`, `warm(renderer, scene, camera)`, `disposeTree(root, { keepShared })`, `createParticles({ max, shape, geometry, material, gravity, drag, floor, bounce, friction })` → `emit(x, y, z, vx, vy, vz, life, size, color, g?, drag?)` and `createMarks({ max, width, length, material, heightAt, lift })` → `add(x, z, nx, nz, alpha)` (kits fx, 3h Tasks 10 and 11; CI-14 settled), `mc.extend(material, name, patch)` (3f C4), `modelGeometry`, `partGeometry`, `mc.get(id, { instanced, vertexColors, map })`. Produces `buildFarm3D(group, farm, road, terrain, items, props, { anisotropy, trees, assets, compiler })` (same returned `{ sprinklers, update }`), `createFx(group, groundY, { compiler })`, `createGibs(group, { compiler })`.

- [ ] **Step 1: Failing test.** Add to `test/view.purity.test.mjs`:

```js
test('the per-game GPU hygiene and geometry helpers are gone; the farm builds on the engine\'s', () => {
  for (const f of ['render/matSplit.js', 'render/shadows.js', 'render/warm.js', 'render/dispose.js', 'render/gfx.js', 'render/scene.js']) assert.equal(existsSync(join(src, f)), false, f);
  const farm = readFileSync(join(src, 'render/farm3d.js'), 'utf8');
  assert.match(farm, /createInstances/); assert.doesNotMatch(farm, /new THREE\.MeshLambertMaterial\(\{ vertexColors: true \}\)/);
});
```

- [ ] **Step 2: Run** `UNIT test/view.purity.test.mjs`. Expected: FAIL, `render/matSplit.js` exists.

- [ ] **Step 3: Implement.**
  - `farm3d.js`: `const matV = compiler.get('wood', { vertexColors: true }), matVI = compiler.get('wood', { vertexColors: true, instanced: true });` (one look for all vertex-coloured statics, as today's single `matV`; the compiler keys instanced and plain users apart, M-13, which replaces `splitShared`). Every `new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[k])), matV, n)` → `createInstances({ geometry: modelGeometry(assets, k), material: matVI, max: n, castShadow: true, receiveShadow: <as today> }).mesh` (then `setMatrixAt` as today, and `.commit()` / `instanceMatrix.needsUpdate` where it set it); every `geoFrom(Object.values(ASSETS[k]))` on a plain mesh → `modelGeometry(assets, k)`; `geoFrom([ASSETS.wash.frame])` → `partGeometry(assets, 'wash', 'frame')` (and `canopy`, `brush`); the fence piece → `modelGeometry(assets, 'fence').clone().applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.05, 0.465))`. Barn: `part = n => partGeometry(assets, 'barn', n, { uv: true })`, walls and gables `compiler.get('wood', { map: planks })`, shingles `compiler.get('wood', { map: shingles })` (fading roof materials are cloned once: `.clone()` then `transparent = true`, as today's `fade`); trim `matV`. The ground, road ribbons, pond, ramps and the mud go through the compiler too (user ruling 2026-10-14: no game-made materials where the engine provides them): `compiler.get(<registry id>, { map })` for each, with the world-UV mapping and the rock blend as `mc.extend(material, 'tp-worlduv' | 'tp-rockblend', patch)` game patches (3f C4). If a look cannot be expressed that way (compare screenshots against 1.8 at the e2e seed), stop the task and file an integrator request with the shader difference; do not keep a hand-made material. Delete the `splitShared(scene, matV)` call and its import. The `performance.now()` sway in `update` is view time and stays.
  - `fx.js`: the particle pool and its motion go to the fx kit (3h Task 10 mapping, CI-14 settled): `const parts = createParticles({ max: 1200, gravity: 9.8, drag: 0.5, floor: groundY, material: compiler.get('plastic', { instanced: true }) })` and the game's `emit(x, y, z, vx, vy, vz, size, life, color, g, drag)` calls become `parts.emit(x, y, z, vx, vy, vz, life, size, color, g, drag)` (**life and size swap places**; `color === null` keeps `parts.color`, as today's `col`); the per-frame motion loop goes (the kit's `update(dt)` runs it). Tyre marks: `createMarks({ max: 400, width: 0.45, length: 0.9, heightAt: groundY, lift: 0.06, material: compiler.get(…) })` with `tireMark(x, z, yaw, alpha)` → `marks.add(x, z, Math.sin(yaw), Math.cos(yaw), alpha)` (3h Task 11; `heightAt` lays them on the hilly farm). The effect presets (stars, gravel, dust, mud splash, water, sparkles, confetti, rainbow trail and halo) stay game code: they are what the game emits, not a pool. A landed cube rests at `floor + size / 2` (1.8: `gy + 0.03`): playtest list.
  - `gibs.js`: the gib pool becomes `createParticles({ max: GIB.cap, bounce: 0.35, friction: 0.65, floor: groundY, material: compiler.get('wood', { instanced: true }) })` (3h Task 10's gib settings); `stepGib`'s motion goes with it, the break pattern (which gibs, their speeds and colours) stays. If a gib's bounce or rest differs visibly from 1.8 (side-by-side at the e2e seed), stop and file the measured numbers as an integrator request against 3h; do not keep `stepGib`.
  - `view/world.js`: `buildWorld({ view, game, paint })` takes `view.gfx` and `view.assets`/`view.materials`; `instancedShadows(world)` from `lion-hawk/view`; `warm(view.gfx.renderer, view.gfx.scene, view.gfx.camera)` from `lion-hawk/view` replaces `warmShaders`; `dispose()` calls `disposeTree(world, { keepShared: true })` from `lion-hawk/view` (compiled materials and model geometries are shared across farms). Sandbox ground and markers keep their game materials (a plane and cones made in code).
  - `git rm src/render/matSplit.js src/render/shadows.js src/render/warm.js src/render/dispose.js test/matSplit.test.mjs test/shadows.test.mjs test/warm.test.mjs`.
- [ ] **Step 4: Run** `UNIT test/` (all PASS, goldens unchanged) then `BROWSER test/e2e.browser.mjs`. Manual look as in 2g: boot, drive, honk, a route with trees (break one: gibs), the barn roof fade, the wash, a sprinkler, `?sandbox`, a new farm (old farm's GPU objects freed: `view.gfx.renderer.info.memory.geometries` returns to its first-farm value ± 2 after two new farms).
- [ ] **Step 5: Commit** `git add -A src test && git commit -m "feat(tractor): farm 3D on compiled materials and engine instancing; per-game GPU hygiene retires"`

### Task 19: Sounds on the engine audio service, voice on top

**Files:** modify `src/audio/sound.js`, `src/audio/voice.js` (only if it touches the context), `src/game.view.js` (`audioOf`), `src/main.js` (the unlock block goes); create `test/audio.test.mjs`.

**Interfaces:** Consumes `view.audio = createAudio(...)`: `{ ctx, master, unlocked, onUnlock(fn), load, play, mute(on), dispose }` (§4.9, #67: unlock on the first capturing gesture, suspend while hidden, resume on return, `?mute`, a limiter on the master bus). Produces `Sound#attach(audio)`: the synth, loops, music and recorded clips build on `audio.ctx` and connect to a game gain into `audio.master`; `Sound#unlock()` and `Sound#suspend()` are deleted.

- [ ] **Step 1: Failing test** `test/audio.test.mjs` (a fake audio service; Node has no Web Audio):

```js
// Tractor's synth on the engine audio service (3l Task 19, #67): attach() builds on the service's context and master; the
// service owns unlock, hide and resume, so the game has no gesture listeners of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sound } from '../src/audio/sound.js';
const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {} }, start() {}, stop() {}, buffer: null, loop: false, type: '', Q: { value: 0 } });
const fakeCtx = () => ({ state: 'running', currentTime: 0, sampleRate: 8000, createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node, createDynamicsCompressor: node,
  createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), decodeAudioData: async () => ({}) });
test('attach builds on the service context; the game\'s own bus goes into the service master', () => {
  const ctx = fakeCtx(), master = node(); let into = null; const bus = node(); ctx.createGain = () => bus; bus.connect = d => { into = d; };
  const s = new Sound(); s.attach({ ctx, master, unlocked: true, onUnlock() {} });
  assert.equal(s.ctx, ctx); assert.equal(into, master); assert.equal(typeof s.unlock, 'undefined');
});
test('the entry no longer listens for gestures, page hide or pageshow to drive audio', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /sound\.(unlock|suspend)|onstatechange|GEST\b/);
});
```

- [ ] **Step 2: Run** `UNIT test/audio.test.mjs`. Expected: FAIL, `s.attach is not a function`.

- [ ] **Step 3: Implement.** In `Sound`: replace `unlock()` and `suspend()` with

```js
  // #67 (3l Task 19): the engine audio service owns the context, unlock, page hide and resume, and the master limiter. The game keeps
  // its own soft bus (R-8: 0.55, everything gentle) into the service's master; loops, music and clips build on the service's context.
  attach(audio) {
    if (this.ctx) return;
    this.ctx = audio.ctx; this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(audio.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    this.buildLoops();
  }
```
`ok` stays `!!this.ctx && !this.muted && this.ctx.state === 'running'`. In `game.view.js`, `pageOf(view)` calls `audio.sound.attach(view.audio)` once, and registers `view.audio.onUnlock(() => { audio.voice.prime(); audio.sound.music(page.music ?? true); audio.voice.preload(); audio.sound.loadClips(); })` (the old `unlock` callback's body: B-8, E-2, D-1); the voice stops on page hide through `document.visibilityState` in the drive half (one `visibilitychange` listener, owned by the view: this also closes the G4 minor "two visibilitychange listeners" in `main.js`). `main.js`: delete the `GEST` / `unlock` / `relisten` / `watchCtx` / `pageshow` block and the audio half of its `visibilitychange` listener; keep the bedtime `clock` listener. `main.js` keeps `voice.enabled` and `sound.music(s.music)` on the `settings` event.
- [ ] **Step 4: Run** `UNIT test/audio.test.mjs test/voice.test.mjs test/view.purity.test.mjs` then `BROWSER test/e2e.browser.mjs` (its audio-unlock-after-page-hide check, X-13, must pass on the service). Manual: sound starts on the first tap, stops on tab hide, resumes on return; `?mute` silent; the lullaby after a new farm while asleep.
- [ ] **Step 5: Commit** `git add -A src test && git commit -m "feat(tractor): sounds on the engine audio service (#67); the entry's unlock listeners retire"`

### Task 20: View verification: goldens, e2e, frame rate (R1), size and load (R3)

**Files:** create `test/perf.browser.mjs`; modify `docs/lh3-baseline.md` (numbers), `src/game.view.js` (only if R1 moves `shading`).

**Interfaces:** Consumes `openGame` (lion-hawk/playwright), the old build in `$SCRATCH/tractor-old` (Task 1), `lion-hawk build`.

- [ ] **Step 1: The measurement suite** `test/perf.browser.mjs`. It serves a directory statically (sw.js included), and for the old and the new build measures, under SwiftShader at 1280×800, `?seed=14&lh-test=render` (manual render), after the trip starts: programs linked (count `WebGL2RenderingContext.prototype.linkProgram` calls from an init script) and draw calls in one rendered frame (count `drawElements`, `drawArrays`, `drawElementsInstanced`, `drawArraysInstanced` between two `requestAnimationFrame`s) at two places: the start (yard, barn in view) and route 0's tenth point (placed with `window.engine.debug.trainAt`). It asserts the R1 gate `programs ≤ old + 2` and `calls ≤ old` and prints both rows; it measures time to `settled()` for both (R3: new ≤ old × 1.2); and it checks offline play: a context with `serviceWorkers: 'allow'` loads the new build, waits for `navigator.serviceWorker.ready`, goes offline (`context.setOffline(true)`), reloads, and `window.engine` exists with `engine.scene.name === 'farm'`.

```js
// R1 and R3 for Tractor Pickup (3l Task 20, overview §8). Old: $SCRATCH/tractor-old (built by Task 1 from e03ed71). New: a fresh
// lion-hawk build into $SCRATCH/tractor. Run with BROWSER (one browser suite at a time). Prints the table the notes keep.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const OLD = process.env.TP_OLD ?? path.join(process.env.SCRATCH ?? '/tmp', 'tractor-old'), NEW = process.env.TP_NEW ?? path.join(process.env.SCRATCH ?? '/tmp', 'tractor');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const serve = dir => new Promise(r => { const s = http.createServer((q, res) => { let p = new URL(q.url, 'http://x').pathname; if (p === '/') p = '/index.html'; const f = path.join(dir, path.normalize(p));
  if (!f.startsWith(dir) || !fs.existsSync(f)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f)); }).listen(0, '127.0.0.1', () => r(s)); });
const COUNT = () => { const G = WebGL2RenderingContext.prototype, c = window.__glc = { programs: 0, calls: 0 };
  const wrap = (k, f) => { const o = G[k]; G[k] = function (...a) { f(); return o.apply(this, a); }; };
  wrap('linkProgram', () => c.programs++); for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(k, () => c.calls++); };
async function measure(browser, dir) {
  const srv = await serve(dir), url = `http://127.0.0.1:${srv.address().port}/?seed=14&lh-test=render`, page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(COUNT); const t0 = Date.now(); await page.goto(url); await page.waitForFunction(() => window.engine?.scene?.name === 'farm' && window.engine.settled?.() !== false, null, { timeout: 120_000 });
  const load = Date.now() - t0;
  const frame = () => page.evaluate(() => new Promise(r => { window.engine.render?.(); requestAnimationFrame(() => { const c0 = window.__glc.calls; window.engine.render?.(); requestAnimationFrame(() => r(window.__glc.calls - c0)); }); }));
  await page.evaluate(() => window.engine.command('play', {})); await page.evaluate(() => window.engine.step?.(60));
  const yard = await frame();
  await page.evaluate(() => { const g = window.engine.debug.game, p = g.road.routes[0].pts[10], q = g.road.routes[0].pts[11]; window.engine.debug.trainAt(p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z)); window.engine.step?.(30); });
  const route = await frame(), programs = await page.evaluate(() => window.__glc.programs);
  await page.close(); srv.close(); return { programs, yard, route, load };
}
test('R1 gate and R3 load: programs ≤ old + 2, draw calls ≤ old, load ≤ old × 1.2', { timeout: 600_000 }, async () => {
  execFileSync('npx', ['lion-hawk', 'build', '--out', NEW], { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit' });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const o = await measure(browser, OLD), n = await measure(browser, NEW);
    console.log(JSON.stringify({ old: o, new: n }));
    assert.ok(n.programs <= o.programs + 2, `programs ${n.programs} vs ${o.programs}`);
    assert.ok(n.yard <= o.yard && n.route <= o.route, `draw calls yard ${n.yard}/${o.yard}, route ${n.route}/${o.route}`);
    assert.ok(n.load <= o.load * 1.2, `load ${n.load} ms vs ${o.load} ms`);
  } finally { await browser.close(); }
});
test('R3: the new build plays offline after the first visit (service worker precache)', { timeout: 300_000 }, async () => {
  const srv = await serve(NEW), browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'allow' }), page = await ctx.newPage(), url = `http://127.0.0.1:${srv.address().port}/?seed=14&lh-test=render`;
    await page.goto(url); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => window.engine?.scene?.name === 'farm', null, { timeout: 120_000 });
    await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => window.engine?.scene?.name === 'farm', null, { timeout: 120_000 });
  } finally { await browser.close(); srv.close(); }
});
```
(The exact `window.engine` stepping/rendering calls under `?lh-test=render` are 2g's: if `engine.step`/`engine.render` are named differently in `lion-hawk/playwright`'s page API, use those names; the measurement logic stays.)

- [ ] **Step 2: Run** `SCRATCH=$SCRATCH BROWSER test/perf.browser.mjs`. Expected: PASS and one JSON line. Record it in `docs/lh3-baseline.md` ("R1 SwiftShader") and the notes.
  **(judgment) If the R1 gate fails:** set `RENDER.shading = 'lambert'` (D5), rebuild, re-run. If that passes, keep it, list the gold look loss (CI-3) in the playtest list, and record both runs. If draw calls still exceed today's, find the extra meshes with `renderer.info.render.calls` per object group (sync's per-part objects vs today's merged body mesh is the likely cause: merge the tractor body's non-paint parts at clone time) and fix before going on.
- [ ] **Step 3: Size.** `gzip -9 -c $SCRATCH/tractor/index.html | wc -c` plus `gzip -9` of every file under `assets/models` summed; R3 budget: total gzip ≤ today's (`docs/lh3-baseline.md`) + 10 %. Record. Over budget: check the size report for a second three or Rapier copy (dedupe) before anything else.
- [ ] **Step 4: The rest.** `UNIT test/` (goldens unchanged), `BROWSER test/e2e.browser.mjs` (14/14), and a manual side-by-side screenshot pass, old vs new, of the 2g list (boot, drive, honk, paint, book, gear ring, parent menu, `?sandbox`, `?tune`, boop and landing word, barn show, hurry, skip, card, bedtime Now, asleep, wake, new farm). Note every visible difference in the notes' playtest list (expected: the corn shows all four cobs, `standard` shading highlights).
- [ ] **Step 5: Commit** `git add test/perf.browser.mjs docs/lh3-baseline.md src/game.view.js && git commit -m "test(tractor): R1 programs and draw calls, R3 size, load and offline play against the 1.8 build"`. The real-iPad `?fps` run (R1's second half) is a user item (overview §9.3): today's release vs `$SCRATCH/tractor`, the same route.

---

## Part E — multiplayer on the `net` part (needs engine 0.10.0)

**User decision (2026-10-13, binding):** in multiplayer the other players' tractors are **solid**: tractors hit each other, and a tractor-to-tractor contact honks on each involved device, debounced so a sustained push honks once. Other trains therefore use `remote: 'driven'` (N-12…N-17), not draw-only `view`/`forecast`. D8 `forecast` stays only where a visual does not collide: the other players' riders in flight are drawn view-side from their record times (Task 25). NET_VERSION 4 is approved. #102 stays fixed.

**Design.**
- Every replicated thing is a World entity with a `net` part (N-9): animals (`animal`, host), trees (`tree`, host), players (`player`, host), trains (`train`, owner, the tractor entity). The engine sends records on each kind's clock (`send`), keyframes every 2 s, relays owner records through the host (N-10), and applies received records through the built-in `net.frame` handler; the game's own `net.frame` handler still runs after it (the 3c `engine.builtin` seam) and only watches (the guest's watchdog, its deferred welcome, its M-56 repair at host keyframes).
- Host entities are made by the host only: one bodiless entity per live herd animal and per roster row; the farm's tree entities (Task 7) gain a `net` part while hosting. A guest never spawns a host kind (E-7): replication spawns its copies, each holding its last record in `e.rec` with a counter `e.recSeq`, which the guest sync reads through `netStore(world)` (the `get`/`all` it read from its own `createStore` before). 3i never sets `e.rec`: Tractor's own kind hooks do (`spawned` and `apply` call `keep`, below), so a replica has `e.rec` from the moment it exists, including after a respawn.
- **A guest's `world.clear()` (CI-15, decided by 3i):** the net part keeps the replicas across the clear and spawns them again from each one's newest record (`r.last`) through the same `spawn`/`spawned` hooks at its first call after the clear (normally that step's `lh.net.recv`): new `e.id`s, the same `(kind, netId)`, counted in `world.net.stats.respawned`. So after a guest's farm rebuild Tractor rebuilds only its own train (`localTrain`), never re-requests or waits for a host frame, and holds no replica entity across a clear: every lookup goes through `world.net.find(kind, netId)` (or `netStore`, which uses it) at the time of use. `createGame` calls `bindTrains(world, game)` before anything touches `world.net`, so the respawned trains attach to the new farm.
- **Engine seams used as named by 3i/3g:** the E-7 guard is 3c's `world.net.guard(op, x, value)` with `('spawn', desc)`, `('despawn', e)`, `('add', e, value)`, `('remove', e)`, so `mirrorHost`'s `world.add(t.e, 'net', 'tree')` and `localTrain`'s `world.add(e, 'net', 'train')` / `world.remove(e, 'net')` go through it; `netFix` (snaps only) is 3g's convention (`dp = old − new`, `dq = q_old ⊗ q_new⁻¹`, drawn = offset ⊗ pose), faded by view sync over `world.net.tunables.train.smoothMs` (live, default 150): Tractor writes neither.
- A train is the tractor entity with its trailer and wagon as linked body entities (3i Contract issue 1): `body`, `trailer`, `wagon` (`F.body()`, all three corrected by the net part, N-14), `input` (the pilot's output, so raw-input tests and the stick drive remotes alike), `mode`, `full`, `dirt` (its own field) and the riders. Remote trains are built by the kind's `spawn`/`spawned` hooks and stepped by `src/sim/trains.js` from their replicated input.
- The host and guest syncs keep their JSON messages and game rules (hello/welcome, claims, trust-follow C-4, the barn lock M-70…M-73, repairs M-56/M-57, help, horn, regrow, rate and schema checks) and lose their trackers, stores, frame encoding and pass-on.

**Suite state during Part E.** The `mp.*` suites, `tape.test.mjs`'s guest tapes, `bind.test.mjs`, `session.bind.test.mjs` and `test/e2e.browser.mjs`'s two-page test are red from Task 22 Step 3 until Task 23 ends. Solo goldens never move in Part E (no net entities exist while solo).

### Task 21: Kinds as entity records; host entity mirroring; `netStore`

**Files:** create `src/sim/actions.js`, `src/net/entities.js`, `test/net.kinds.test.mjs`; rewrite `src/net/kinds.js`; modify `src/game.sim.js` (re-exports `ACTIONS` from `./sim/actions.js`).

**Interfaces:** Consumes `F`, `kind` (with `remote`, `send`, `tune`, `record(e, out, world, base)`, `apply(e, rec, world, s)`, `newer`, `spawn(rec, netId, world) → desc`, `spawned(e, world, rec)`: 3i), `world.spawn/despawn/add/remove/with`. Produces `ACTIONS`, `DRIVE` (`actions({ thr: axis(), steer: axis(), turn: axis() })`), kinds `ANIMAL`, `TREE`, `PLAYER`, `TRAIN` (TRAIN's `spawn`/`apply` are filled in Task 23; here it is declared with its fields), `KINDS`, `animalRecord(a, out) → out | null`, `mirrorHost(world, game, roster)`, `unmirrorHost(world, game)`, `netStore(world) → { get(kind, id), all(kind), seq(kind) }`.

- [ ] **Step 1: Failing test** `test/net.kinds.test.mjs`:

```js
// Tractor's replicated kinds as entity records (3l Task 21, N-8, N-9, D7): the host mirrors its herd, trees and roster as net
// entities (netId in each kind's range, e.id World-unique), keeps them in step with the game, and drops them all when it stops hosting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testGame } from './helpers/world.mjs';
import { KINDS, ANIMAL, TREE, PLAYER, TRAIN, animalRecord } from '../src/net/kinds.js';
import { mirrorHost, unmirrorHost, netStore } from '../src/net/entities.js';
import { NET_VERSION, MAX_ID } from '../src/net/protocol.js';

const net = (w, kind) => w.with('net').filter(e => e.net === kind);
const roster = () => [{ n: 1, paint: { body: 'red', trim: 'yellow' }, away: false, join: 0, barn: false }];
test('NET_VERSION 4 and four kinds with today\'s codes and id ranges', () => {
  assert.equal(NET_VERSION, 4);
  assert.deepEqual(KINDS.map(k => [k.name, k.code]), [['animal', 1], ['tree', 2], ['player', 3], ['train', 4]]);
  assert.equal(TRAIN.authority, 'owner'); assert.equal(TRAIN.remote, 'driven'); assert.equal(ANIMAL.remote, 'view');
});
test('mirrorHost: one entity per live animal and per roster row; trees gain a net part; ids are World-unique (D7)', () => {
  const g = testGame({ seed: 31 }), w = g.world; mirrorHost(w, g, roster());
  const live = g.herd.animals.filter(a => a.state !== 'gone');
  assert.equal(net(w, 'animal').length, live.length);
  for (const e of net(w, 'animal')) { assert.equal(e.animal, g.herd.animals[e.netId]); assert.ok(e.netId >= 0 && e.netId <= MAX_ID); }
  assert.equal(net(w, 'tree').length, g.trees.list.length); assert.ok(g.trees.list.every(t => t.e.netId === t.id && t.e.net === 'tree'));
  assert.deepEqual(net(w, 'player').map(e => e.netId), [1]);
  const ids = w.with('net').map(e => e.id); assert.equal(new Set(ids).size, ids.length);
});
test('a gone animal\'s entity goes; a new animal in its slot gets a fresh entity; unmirror removes every host entity', () => {
  const g = testGame({ seed: 31 }), w = g.world; mirrorHost(w, g, roster());
  const a = g.herd.animals[3]; a.state = 'gone'; mirrorHost(w, g, roster());
  assert.equal(net(w, 'animal').some(e => e.netId === 3), false);
  a.state = 'idle'; mirrorHost(w, g, roster()); assert.equal(net(w, 'animal').filter(e => e.netId === 3).length, 1);
  unmirrorHost(w, g); assert.equal(w.with('net').filter(e => e.net !== 'train').length, 0); assert.ok(g.trees.list.every(t => !t.e.net));
});
test('animalRecord fills an out object exactly as the old record did (carried: no place; gone: null)', () => {
  const out = {};
  assert.equal(animalRecord({ state: 'gone' }, out), null);
  const r = animalRecord({ type: 'pig', golden: true, hidden: false, home: 'route', state: 'ride', epoch: 3, x: 4, y: 0, z: 5, yaw: 1, anim: 'walk', leader: null, line: 0 }, out);
  assert.equal(r, out); assert.deepEqual({ ...r }, { type: 'pig', golden: true, hidden: false, home: 'route', state: 'carried', owner: 1, epoch: 3, x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', leader: null, line: 0 });
});
test('netStore reads the last record of each replicated entity by kind and id', () => {
  const g = testGame({ seed: 31 }), w = g.world, e = w.spawn({ tags: ['probe'], net: 'animal', netId: 9 }); e.rec = { type: 'cow' }; e.recSeq = 1;
  const view = { with: (...a) => w.with(...a), net: { find: (k, id) => k === 'animal' && id === 9 ? e : undefined } }; // no session here: 3i's world.net.find stubbed
  const s = netStore(view); assert.deepEqual(s.get('animal', 9), { type: 'cow' }); assert.equal(s.get('animal', 8), null); assert.deepEqual([...s.all('animal')].map(([id]) => id), [9]);
});
```
(The last test fakes a replicated entity by hand; real ones are made by replication in Task 22, which also checks that `e.rec` is set by the hooks on a real replica.)

- [ ] **Step 2: Run** `UNIT test/net.kinds.test.mjs`. Expected: FAIL, `Cannot find module '../src/net/entities.js'`.

- [ ] **Step 3: Implement.** `src/sim/actions.js`:

```js
// The game's actions (moved from game.sim.js so the net kinds can name them without a cycle). #81: goX/goZ are the wanted direction in
// the world frame (length = stick distance), merged across devices as one vector (I-1); goBack: the stick is in the reverse cone (C-8).
// DRIVE: what a train replicates as its input (N-13): the pilot's output, so a raw-driven test train and a stick-driven one look alike to the others.
import { actions, axis, button } from 'lion-hawk/sim';
export const ACTIONS = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button(), horn: button() });
export const DRIVE = actions({ thr: axis(), steer: axis(), turn: axis() });
```
`src/net/kinds.js` (keeps `LIMIT` and the field precisions of 1.8):

```js
// Tractor's replicated kinds (M-22) as World entity records (lion-hawk 3l, N-8, N-9). Host kinds: animal, tree, player (bodiless; a
// guest holds each one's last record in e.rec). Owner kind: train, on the tractor entity, driven on the other devices (user decision
// 2026-10-13; Task 23 fills its spawn and apply). Field precisions are 1.8's (M-66); F.body() is the engine's at the same steps.
import { F, kind } from 'lion-hawk/sim';
import { TYPES, HELD } from '../sim/herd.js';
import { DRIVE } from '../sim/actions.js';
import { PAINT_NAMES, MAX_PLAYERS, MAX_ID } from './protocol.js';
import { HATS } from '../sim/progress.js';

const HAT_LIST = ['none', ...HATS.map(h => h.id)], TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held', 'wait'];
export const LIMIT = { coord: 400, height: 50, animals: 256, trees: 1024, riders: 16 };
const XZ = F.fixed(-LIMIT.coord, LIMIT.coord, 1 / 64), Y = F.fixed(-LIMIT.height, LIMIT.height, 1 / 256);
// a replica's last record, its interp sample (view kinds) and a change counter (netStore, riders.js). 3i never sets e.rec: these hooks
// do, on spawn (also a CI-15 respawn after a guest's world.clear()) and on every apply (view kinds: every recv step, so count changes only)
export const keep = (e, rec, world, s) => { e.s = s ?? null; if (e.rec !== rec) { e.rec = rec; e.recSeq = (e.recSeq ?? 0) + 1; } };
export function animalRecord(a, out) {
  if (a.state === 'gone') return null; // not replicated: its entity is despawned
  const held = HELD.has(a.state), carried = held || a.state === 'carried'; // held: the host's own train has it (M-15)
  out.type = a.type; out.golden = !!a.golden; out.hidden = !!a.hidden; out.home = a.home === 'yard' ? 'yard' : 'route';
  out.state = carried ? 'carried' : a.state === 'toBarn' ? 'busy' : 'free'; out.owner = held ? 1 : carried ? a.owner ?? 0 : 0; out.epoch = a.epoch;
  out.x = carried ? 0 : a.x; out.y = carried ? 0 : a.y || 0; out.z = carried ? 0 : a.z; out.yaw = carried ? 0 : a.yaw;
  out.anim = carried || !ANIMS.includes(a.anim) ? 'idle' : a.anim; out.leader = a.leader ?? null; out.line = a.line || 0;
  return out;
}
export const ANIMAL = kind({ name: 'animal', code: 1, authority: 'host', remote: 'view', max: LIMIT.animals, idMin: 0, idMax: MAX_ID, send: { hz: 15, key: 2 },
  fields: { type: F.oneOf(TYPE_LIST), golden: F.bool(), hidden: F.bool(), home: F.oneOf(['route', 'yard']), state: F.oneOf(['free', 'busy', 'carried']),
    owner: F.uint(1, MAX_PLAYERS), epoch: F.uint(4), x: XZ, y: Y, z: XZ, yaw: F.angle(), anim: F.oneOf(ANIMS), leader: F.id(), line: F.uint(1) },
  record: (e, out) => animalRecord(e.animal, out), spawned: (e, world, rec) => keep(e, rec), apply: keep,
  newer: (old, rec) => rec.epoch >= old.epoch }); // M-26: lower ownership number, older data
export const TREE = kind({ name: 'tree', code: 2, authority: 'host', remote: 'view', max: LIMIT.trees, idMin: 0, idMax: LIMIT.trees - 1, send: { hz: 15, key: 2 },
  fields: { state: F.oneOf(['standing', 'broken', 'growing']) }, record: (e, out) => { out.state = e.tree.state; return out; }, spawned: (e, world, rec) => keep(e, rec), apply: keep });
export const PLAYER = kind({ name: 'player', code: 3, authority: 'host', remote: 'view', max: MAX_PLAYERS, idMin: 1, idMax: MAX_PLAYERS, send: { hz: 15, key: 2 },
  fields: { coat: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES), away: F.bool(), join: F.uint(1), barn: F.bool() }, // coat: the body paint ('body' is reserved for F.body, 3i); join: which joining of that number; barn: this player's show has the barn (M-71)
  record: (e, out) => { const p = e.player; out.coat = p.paint.body; out.trim = p.paint.trim; out.away = !!p.away; out.join = p.join ?? 0; out.barn = !!p.barn; return out; }, spawned: (e, world, rec) => keep(e, rec), apply: keep });
export const RIDER = F.obj({ id: F.uint(2, MAX_ID), slot: F.uint(1, 11), flying: F.bool(), x: XZ, y: Y, z: XZ, yaw: F.angle(), hat: F.oneOf(HAT_LIST) }); // hat: the one its owner put on it (M-60)
const BODY = { range: LIMIT.coord, height: LIMIT.height };
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', remote: 'driven', max: 1, idMin: 1, idMax: MAX_PLAYERS, send: { hz: 20, key: 2 },
  tune: { snapAt: 1.5, nudge: 6, smoothMs: 150 }, // Task 23 adds spawn, spawned and apply
  fields: { body: F.body(BODY), trailer: F.body(BODY), wagon: F.body(BODY), input: F.actions(DRIVE), mode: F.oneOf(MODES), full: F.bool(),
    dirt: F.list(F.fixed(0, 1, 1 / 100), 3, 3), riders: F.list(RIDER, LIMIT.riders) } });
export const KINDS = [ANIMAL, TREE, PLAYER, TRAIN];
```
`src/net/entities.js`:

```js
// The host's replicated entities (lion-hawk 3l, N-9, E-7). While hosting, each live herd animal and each roster row is a bodiless net
// entity, and each farm tree's entity (sim/trees.js) carries a net part; mirrorHost keeps them in step after every host step, unmirrorHost
// drops them when hosting stops (a solo farm has no net entities, so its goldens never see them). netStore(world) gives a guest sync the
// get/all view it had of its own store, over the entities replication made (each holds its last record in e.rec).
const byNet = new WeakMap(); // world → { animal: Map(netId → e), player: Map(n → e) }
const maps = world => { let m = byNet.get(world); if (!m || m.serial !== world.serial) byNet.set(world, m = { serial: world.serial, animal: new Map(), player: new Map() }); return m; };
export function mirrorHost(world, game, roster) {
  const m = maps(world);
  for (const a of game.herd.animals) {
    const e = m.animal.get(a.id), live = a.state !== 'gone';
    if (e && (!live || e.animal !== a)) { world.despawn(e); m.animal.delete(a.id); }
    if (live && !m.animal.has(a.id)) m.animal.set(a.id, world.spawn({ tags: ['animal'], net: 'animal', netId: a.id, animal: a }));
  }
  for (const t of game.trees.list) if (!t.e.net) { t.e.netId = t.id; world.add(t.e, 'net', 'tree'); }
  const seen = new Set();
  for (const p of roster) { seen.add(p.n); const e = m.player.get(p.n);
    if (e) e.player = p; else m.player.set(p.n, world.spawn({ tags: ['player'], net: 'player', netId: p.n, player: p })); }
  for (const [n, e] of m.player) if (!seen.has(n)) { world.despawn(e); m.player.delete(n); }
}
export function unmirrorHost(world, game) {
  const m = maps(world);
  for (const e of m.animal.values()) world.despawn(e); for (const e of m.player.values()) world.despawn(e); m.animal.clear(); m.player.clear();
  for (const t of game.trees.list) if (t.e.net) world.remove(t.e, 'net');
}
export function netStore(world) { // never cache what it returns across a world.clear(): replicas are respawned as new entities (CI-15)
  const find = (kind, id) => { const e = world.net?.find(kind, id); return e?.rec ? e : null; };
  return {
    get: (kind, id) => find(kind, id)?.rec ?? null,
    *all(kind) { for (const e of world.with('net')) if (e.net === kind && e.rec) yield [e.netId, e.rec]; },
    entity: find,
  };
}
```
(`mirrorHost` allocates a `Set` per call: host-only game code at the send rate is acceptable, but call it from the host sync's `after` only, never per frame. `roster` rows must be stable objects per player number, see Task 22.)

- [ ] **Step 4: Run** `UNIT test/net.kinds.test.mjs`. Expected: PASS. (TRAIN has no `spawn` yet: no train is replicated until Task 23, and no session runs in this task.) Old suites are unaffected: the syncs still use their own `bindings.js` path, which imports the kinds' fields only (`bindings.js` reads `animalRecords(herd)`: keep it compiling by giving it a local `animalRecords = herd => herd.animals.flatMap(a => { const r = animalRecord(a, {}); return r ? [[a.id, r]] : []; }).slice(0, LIMIT.animals)` until Task 22 deletes `bindings.js`).

- [ ] **Step 5: Run** `UNIT test/` . Expected: all PASS (the TRAIN kind's fields changed, so the old sync path now sends NET_VERSION 4 frames with F.body: `mp.*` must still pass on both ends of one build; `mp.interop.test.mjs`'s 1.8-wire case, if it encodes with the old kinds, is retired here with a note: interop with 1.8 is impossible by design under NET_VERSION 4, R5).

- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): replicated kinds as entity records; host entity mirroring; NET_VERSION 4"`

### Task 22 (judgment): Replication moves to the engine; the syncs keep messages and rules

**Decision expected:** `netConfig()` declares `{ kinds: KINDS, world: true, … }` (the port's registry is the engine's), the syncs stop encoding, tracking, storing and passing on frames, and read replicated state through `netStore(world)` and the game's `net.frame` handler (which still runs after the engine's). The host mirrors its entities in `after()`; the guest's herd keeps its 100 ms interpolation buffer (M-25) fed from the animal records each time a host frame lands. A guest's farm rebuild (`world.clear()`) keeps the replicas: 3i respawns them from their newest records (CI-15, decided by 3i; Part E design); the guest rebuilds only its own train.

**Files:** modify `src/game/net.js`, `src/net/host.js`, `src/net/guest.js`, `src/net/players.js`, `src/net/protocol.js` (NET_VERSION already 4), `test/mp.*.mjs` (bindings option removed), `test/mp.engine.harness.mjs`; delete `src/net/bindings.js`, `test/mp.test.mjs`'s custom-kinds test (the `bindings` option is gone: the engine's kinds are the game's) — rewrite it on `netConfig({ kinds: [...KINDS, GATE, FLAG] })` if 3i allows extra kinds without entities; otherwise delete it with a note.

**Interfaces:** Consumes `world.net.self`, the built-in `net.frame` (3i), `netStore`, `mirrorHost/unmirrorHost`. Produces `netConfig(kinds = KINDS)` → `{ kinds, world: true, maxSender, maxJson, maxFrame, rates, wire, codec: 'json' }`; `createHostSync({ game, world, net, paint, clock })`, `createGuestSync({ game, world, net, paint, onFarm, clock })` (no `bindings`); the guest's `frame(from, f)` receives the already-applied frame (watchdog, deferral, repair, herd buffer).

- [ ] **Step 1: Failing test.** Add to `test/net.kinds.test.mjs`:

```js
import { engineWorld } from './mp.engine.harness.mjs';
test('a guest sees the host\'s herd, trees and roster as replicated entities, and the syncs send no frames of their own', async () => {
  const w = await engineWorld({ seed: 33 }); w.seconds(3);
  const hw = w.host.engine.world, gw = w.guests[0].engine.world, live = w.host.game.herd.animals.filter(a => a.state !== 'gone').length;
  assert.equal(gw.with('net').filter(e => e.net === 'animal' && e.rec).length, live);
  assert.equal(gw.with('net').filter(e => e.net === 'player').length, 2);
  for (const d of [w.host, w.guests[0]]) assert.equal(typeof d.sync.frameOut, 'undefined', 'no sync-made frames');
  assert.ok(w.guests[0].game.herd.animals.filter(a => a.state !== 'elsewhere' && a.state !== 'gone').length >= live - 2, 'the guest herd shows them');
  void hw;
});
```

- [ ] **Step 2: Run** `UNIT test/net.kinds.test.mjs`. Expected: FAIL (replicated entities count 0: the engine is not replicating).

- [ ] **Step 3: `game/net.js`.** `netConfig = (kinds = KINDS) => ({ kinds, world: true, maxSender: MAX_PLAYERS, maxJson: MAX_JSON, maxFrame: MAX_FRAME, rates: …as today…, wire: …as today…, codec: 'json' })`. In `'net.open'`: pass `world: e.world` to both syncs, drop `bindings` and `registry`; the host is `self = 1` by 3i; the guest sets `e.world.net.self = m.you` at its welcome (#77), and the host binds each guest's number with `world.net.player(peerId, n)`. `'net.frame'`: `(e, d, ctx) => { const n = live(ctx); if (n) at(n, d.at, 'net message', () => n.sync.frame(d.from, frameFromJson(d.frame, e.world.net.registry ?? undefined), d.reliable)); }` (the built-in has applied it already; this handler only lets the sync watch: if 3i exposes the decoded frame on the command, use it instead of decoding again). `'net.close'`/`end`: the host sync's `close()` calls `unmirrorHost`.

- [ ] **Step 4: `net/host.js`.** Delete `encodeFrame/decodeFrame/createTracker/isFrame`, `BINDINGS/ofAuthority/registryOf/readAll` imports, the `world`/`mine` trackers, `worldNow`/`mineNow`, `onTrain`'s forwarding (`p.fwd`, `passOn`), the `ArrayBuffer` branch of the transport listener, and the three frame sends in `after()`. Keep everything else. Changes:
  - roster rows are stable objects per player number: `const rows = new Map(); const row = (n, paint, away, join, barn) => { const r = rows.get(n) ?? {}; Object.assign(r, { n, paint, away, join, barn }); rows.set(n, r); return r; }` and `roster()` builds its array from `row(...)` (rows of players who left are deleted in `dropPlayer`).
  - `after(events, now)`: the event loop stays (launch epochs, tree and horn messages); then `if (helloed()) { mirrorHost(world, game, roster()); if (now - lastKey >= SEND.key) { lastKey = now; for (const p of players.map.values()) if (p.helloed) send(p.n, welcome(p)); } }` (M-19: the welcome repeats with the keyframe cadence; the keyframes themselves are the engine's).
  - `frame(from, f)`: `const p = playerOf(from); if (!p?.helloed || f.sender !== p.n) return; p.heardAt = clock(); const e = netStore(world).entity('train', p.n); if (e) follow(p, e.rec?.body?.p ?? e.body.translation());` (C-4 follows what the guest reports).
  - `setGame(g)`: `unmirrorHost(world, game)` before switching (the old farm's World is cleared by the farm), then as today minus the tracker resets.
  - `close()`: `unmirrorHost(world, game)` first.
  - `stepBarn`/`repair` read a guest's mode and riders from `netStore(world).get('train', p.n)` where they read `p.latest`.
- [ ] **Step 5: `net/guest.js`.** Delete the tracker, `store` (`createStore`), `reg`, `mine`, `applyFrame`'s `store.apply`, the `ArrayBuffer` branch, `lastTrain`/`lastKey` frame sends in `after()`. `const store = netStore(world);` replaces the old store in `taken`, `repair`, `settleClaims`, `applyHerd`, `applyCarried`, `barnHolder`, `applyRoster` (`store.all('player')`), and `forgetOwner` becomes a no-op (the engine forgets an owner's records when its entity despawns). The player records' body paint is the field `coat` (3i reserves `body`): `applyRoster` and `repair`'s paint check read `r.coat` where they read `r.body`. `frame(from, f)` (after the built-in applied it):

```js
  function frame(from, f) {
    try {
      if (from !== hostPeer || alone || !you) return; lastFast = clock(); if (f.sender === you) return;
      if (deferred) { if (f.key && f.sender === 1) deferredKey = f; return; } // M-19: the new farm's state waits with its welcome
      if (f.groups.has('animal')) herdBuf.push(f.time, nowMs, new Map(store.all('animal'))); // M-25: a snapshot of every animal at the frame's time
      if (f.groups.has('tree')) for (const c of f.groups.get('tree').records) applyTree(c[0], c[1].state);
      if (f.groups.has('player')) applyRoster();
      if (f.key && f.sender === 1) repair();
    } catch (e) { warn('net message', e); }
  }
```
  (`f.groups.get(k).records` is a `Map(id → rec)` or an array of pairs depending on 3i's decoded shape: iterate whichever `frameFromJson` returns, as the old `store.apply` changes did.) `useFarm` no longer replays a kept keyframe into a store and does not ask for or wait on a host frame: after the build (`world.clear()` and the new farm) it calls `localTrain` for its own train only, and the net part respawns the host's replicas from their newest records at its next call (CI-15, decided by 3i). Nothing in the guest sync keeps a replica entity across the clear: `taken`, `repair`, `applyHerd`, `barnHolder` look up through `store` each time. The welcome handler sets `world.net.self = m.you`.
- [ ] **Step 6: `net/players.js`.** `createPlayers()` keeps `map`, `ensure`, `drop`, `list` (the roster: paint, away, join) and `others()`; `push`, `sample`, `poseAt`, `derive`, `trainRecord` and the per-player `interp`/`fc` go (trains are entities from Task 23). `others()` becomes `others(world)`: one reused row per remote train entity (`world.with('net')`, `e.net === 'train' && e.netId !== world.net.self`) with `n, x, z, yaw, speed, held` from its body and `e.mode !== 'drive'`. `git rm src/net/bindings.js`.
- [ ] **Step 7: Tests.** `test/mp.engine.harness.mjs` loses the `bindings` option; `test/mp.harness.mjs` re-exports as in Task 9. Tests that poked `sync.store`, `players.push`, `p.latest` or encoded frames by hand (`mp.test.mjs` "garbage, wrong kinds…" encodes frames with `REGISTRY`) now encode with `createRegistry(KINDS, { maxSender: MAX_PLAYERS })` from `lion-hawk/sim` and send through the hub, so the port and the built-in drop them (M-50 holds at the port, N-3).
- [ ] **Step 8: Run** `UNIT test/net.kinds.test.mjs test/mp.animals.test.mjs test/mp.repair.test.mjs test/mp.barn.test.mjs test/mp.relay.test.mjs`. Expected: PASS for the herd, trees, roster, claims, repairs and the barn lock. Train-dependent checks (other trains drawn, carried riders, bumps) stay red until Task 23.
- [ ] **Step 9: Commit** `git add -A src test && git commit -m "feat(tractor): replication on the engine net part; host and guest syncs keep messages and rules"`

### Task 23 (judgment): Trains are driven: linked trailer and wagon, remote trains built and stepped locally

**Decision expected (3i Contract issue 1, controller-accepted):** a train is the tractor entity with two **linked** body entities, `e.trailer` and `e.wagon` (`world.add(tractor.e, 'trailer', car0.e)`, likewise `wagon`); the TRAIN kind's `trailer` and `wagon` `F.body()` fields read and correct them, so the net part corrects all three bodies (N-14) and sets `netFix` on snaps (N-15): no game-side correction. Remote trains are built by the kind's hooks: `spawn(rec, netId, world) → desc` returns the tractor's spawn desc with `trailer` and `wagon` sub-descs (the same descs the local train uses), and `spawned(e, world, rec)` attaches what a desc cannot carry: the vehicle kit on each body, the two hitch joints and `e.remote = { tractor, train }`. To share that code, `createTractor`/`createCar` split into a desc and an attach step. `src/sim/trains.js` steps every remote train in the farm's `pre` from its replicated input (`thr`, `steer`, `turn`: the pilot's output, so raw-input tests and the stick look alike), with `hold` from its `mode`. The default record (N-9) reads `e.mode`, `e.full`, `e.dirt`, `e.riders` and `e.input`, which `game.post()`/`pre()` keep current on the local tractor while it has a `net` part. Cost: real devices share no clock, so 3i applies snapshots unprojected there (Contract issue 4): the bump on two real devices may feel late (playtest item; a clock-sync follow-up is parked in 3i).

**Files:** create `src/sim/trains.js`, `test/net.driven.test.mjs`; modify `src/sim/tractor.js` (`tractorDesc`, `attachTractor`), `src/sim/hitch.js` (`carDesc`, `attachCar`, links), `src/net/kinds.js` (TRAIN hooks), `src/sim/game.js` (`pre` writes `tractor.e.input`, steps remote trains; `post` writes the record fields), `src/net/entities.js` (`localTrain`, `dropLocalTrain`), `src/game/net.js`, `src/net/host.js`, `src/net/guest.js` (carried riders from train entities).

**Interfaces:** Consumes `world.net.self`, `world.net.find(kind, netId)`, `world.net.tunables.train`, the kind hooks `spawn(rec, netId, world) → desc` and `spawned(e, world, rec)`, linked F.body fields (3i Contract issue 1), input on the wire as `{ s, list }` (3i, transparent to the game). Produces `tractorDesc({ x, z, yaw }) → desc`, `attachTractor(world, e, { power, materialAt }) → t`, `carDesc(front, frontAnchor) → desc`, `attachCar(world, e, frontE, frontAnchor, index) → car`, `createTractor`/`createTrain` (unchanged signatures, now desc + attach, and `createTrain` links `trailer`/`wagon`), `spawnTrainDesc(rec, netId, world)`, `attachRemoteTrain(e, world, rec)`, `stepRemoteTrains(world)`, `bindTrains(world, game)`, `localTrain(world, game, you)`, `dropLocalTrain(world, game)`.

- [ ] **Step 1: Failing test** `test/net.driven.test.mjs`:

```js
// Driven trains (3l Task 23, N-12…N-15; user decision 2026-10-13): each device steps the other players' trains as solid jointed
// bodies from their replicated input; the owner's pose wins through the net part's corrections of all three bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { CAR_WHEELS } from '../src/sim/hitch.js';
const remote = (d, n) => d.engine.world.net.find('train', n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('each device has the other\'s train: a dynamic tractor with linked trailer and wagon, hitched', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const g = w.guests[0], r = remote(w.host, g.engine.world.net.self);
  assert.ok(r?.body, 'the host has the guest\'s train'); assert.equal(r.body.isDynamic(), true); assert.ok(r.colliders.length > 0, 'solid');
  assert.ok(r.trailer?.body && r.wagon?.body, 'linked cars'); assert.equal(r.remote.train.cars.length, 2);
  assert.ok(r.remote.train.hitchGap(0) < 0.05 && r.remote.train.hitchGap(1) < 0.05, 'hitched');
  assert.ok(remote(g, 1)?.body, 'the guest has the host\'s train');
});
test('a remote train follows its owner\'s drive within 0.5 m (input-driven between snapshots), cars too', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const g = w.guests[0], n = g.engine.world.net.self;
  w.seconds(4, (d, i) => i === 1 ? { thr: 1, steer: 0.3, horn: false } : null); w.seconds(1);
  const r = remote(w.host, n);
  assert.ok(dist(r.body.translation(), g.game.tractor.body.translation()) < 0.5);
  assert.ok(dist(r.trailer.body.translation(), g.game.train.cars[0].body.translation()) < 0.7, 'trailer');
  assert.ok(dist(r.wagon.body.translation(), g.game.train.cars[1].body.translation()) < 0.7, 'wagon');
});
test('a remote train turns its own wheels: the kit on the driven replica writes its part poses (rolled and steered), cars too', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const n = w.guests[0].engine.world.net.self, q0 = { ...remote(w.host, n).partXf['wheel-back-left'].q };
  w.seconds(2, (d, i) => i === 1 ? { thr: 1, steer: 0.5, horn: false } : null);
  const r = remote(w.host, n), q1 = r.partXf['wheel-back-left'].q, dot = Math.abs(q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w);
  assert.deepEqual(Object.keys(r.partXf), TRACTOR_WHEELS.map(x => x.name)); assert.ok(1 - dot > 0.01, 'the replica\'s rear wheel rolled');
  assert.ok(Math.abs(r.partXf['wheel-front-left'].q.y) > 0.01, 'the replica\'s front wheel steers (Ry(steer) from the replicated input)');
  for (const c of [r.trailer, r.wagon]) assert.deepEqual(Object.keys(c.partXf), CAR_WHEELS);
});
test('the train leaves with its owner: three bodies and two joints are freed', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const hw = w.host.engine.world, n0 = hw.stats.bodies; w.hub.leave(w.guests[0].net.id, 'left'); w.seconds(2);
  assert.equal(hw.stats.bodies, n0 - 3); assert.equal(remote(w.host, w.guests[0].engine.world.net.self), undefined);
});
```

- [ ] **Step 2: Run** `UNIT test/net.driven.test.mjs`. Expected: FAIL, `the host has the guest's train` (TRAIN has no hooks; the local tractor has no `net` part).

- [ ] **Step 3: Split the train into descs and attach steps.** `tractor.js`: `export const tractorDesc = ({ x, z, yaw }) => { const a = yaw - Math.PI / 2; return { …the spawn desc of Task 6 (with Task 16's model/scale and Task 13b's coverage) … }; };` and `export function attachTractor(world, e, { power = 'medium', materialAt = () => 'route', yaw = null } = {}) { …everything after the spawn in today's createTractor (kit vehicle, wheels, the `t` object); `t.yaw` starts from the body's rotation when `yaw` is null… }`; `createTractor(world, opts) = attachTractor(world, world.spawn(tractorDesc(opts)), opts)`. `hitch.js`: `export const carDesc = (front, frontAnchor) => { …today's position maths…; return { tags: ['car'], model: 'trailer', at, q, body, colliders, groups, coverage: { dirt: 0 } }; }`, `export function attachCar(world, e, frontE, frontAnchor, index) { …kit vehicle, joint, the car object… }`, `createCar(world, frontE, anchor, index) = attachCar(world, world.spawn(carDesc(frontE.body, anchor)), frontE, anchor, index)`; `createTrain` ends with `world.add(tractor.e, 'trailer', c0.e); world.add(tractor.e, 'wagon', c1.e);` and gains `attachTrain(world, tractor, trailerE, wagonE)` (the same car objects over existing entities, used by the remote hook). Run `UNIT test/mass.test.mjs test/tractor.test.mjs test/hitch.test.mjs test/golden.test.mjs`: PASS, goldens unchanged (same descs, same order).

- [ ] **Step 4: Remote trains.** `src/sim/trains.js`:

```js
// Remote trains (lion-hawk 3l, N-12 driven): another player's tractor, trailer and wagon as solid jointed bodies in this World. The net
// part spawns the three entities from the descs below (3i Contract issue 1) and calls attachRemoteTrain for what a desc cannot hold
// (the vehicle kit, the hitch joints); stepRemoteTrains drives each from its owner's replicated input before the Rapier step (N-13).
import { tractorDesc, attachTractor } from './tractor.js';
import { carDesc, attachTrain, TR, TRACTOR_HITCH } from './hitch.js';
import { DT } from './ground.js';
const games = new WeakMap(); // World → the farm game on it (the hooks get only the World)
export const bindTrains = (world, game) => { games.set(world, game); };
const yawOf = q => Math.atan2(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.z - q.w * q.y)) + Math.PI / 2 - Math.PI / 2; // the chassis heading (players.js yawQ)
// the remote train's spawn desc: the local train's descs at the record's poses (the net part shapes the driven body as given)
export function spawnTrainDesc(rec) {
  const b = rec.body, d = tractorDesc({ x: b.p.x, z: b.p.z, yaw: yawOf(b.q) });
  const car = c => ({ ...carDesc({ translation: () => c.p, rotation: () => c.q }, { x: 0, y: 0, z: 0 }), at: [c.p.x, c.p.y, c.p.z], q: [c.q.x, c.q.y, c.q.z, c.q.w] });
  return { ...d, at: [b.p.x, b.p.y, b.p.z], q: [b.q.x, b.q.y, b.q.z, b.q.w], trailer: car(rec.trailer), wagon: car(rec.wagon) };
}
export function attachRemoteTrain(e, world) {
  const game = games.get(world); if (!game) throw new Error('trains: no farm on this World');
  const tractor = attachTractor(world, e, { power: 'medium', materialAt: game.ground?.materialAt ?? (() => 'route') });
  const train = attachTrain(world, tractor, e.trailer, e.wagon);
  e.remote = { tractor, train }; e.mode ??= 'drive'; e.full ??= false; e.riders ??= []; e.dirt ??= [0, 0, 0];
}
export function stepRemoteTrains(world) {
  for (const e of world.with('net')) {
    if (e.net !== 'train' || !e.remote || e.netId === world.net.self) continue;
    const { tractor, train } = e.remote, I = e.input;
    tractor.hold = e.mode !== 'drive'; tractor.setInput(I.thr, I.steer, I.turn); tractor.step(DT);
    train.step(DT, { parked: tractor.hold || (Math.abs(I.thr) < 0.05 && tractor.speed < 0.3) });
  }
}
void TR; void TRACTOR_HITCH;
```
(Drop the two `void` lines and the unused imports; `yawOf` is `players.js`'s `yawQ`: keep its exact expression and delete the `+ Math.PI / 2 - Math.PI / 2` no-op. `carDesc` takes a "front" with `translation()`/`rotation()`; for a remote car the record pose is used directly through `at`/`q`, so pass a front whose anchor maths is overridden by the explicit `at`/`q`.)
TRAIN in `src/net/kinds.js` (fields per 3i: `body`, `trailer`, `wagon`, `input`, `mode`, `full`, `dirt`, `riders`):

```js
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', remote: 'driven', max: 1, idMin: 1, idMax: MAX_PLAYERS, send: { hz: 20, key: 2 },
  tune: { snapAt: 1.5, nudge: 6, smoothMs: 150 },
  fields: { body: F.body(BODY), trailer: F.body(BODY), wagon: F.body(BODY), input: F.actions(DRIVE), mode: F.oneOf(MODES), full: F.bool(),
    dirt: F.list(F.fixed(0, 1, 1 / 100), 3, 3), riders: F.list(RIDER, LIMIT.riders) }, // M-68 dirt in its own field (F.body carries none)
  spawn: rec => spawnTrainDesc(rec),
  spawned: (e, world, rec) => { keep(e, rec); attachRemoteTrain(e, world); }, // also the CI-15 respawn after a guest's world.clear()
  apply(e, rec, world, s) { e.mode = rec.mode; e.full = rec.full; e.dirt = rec.dirt; e.riders = rec.riders; keep(e, rec, world, s); } });
```
with `const BODY = { range: LIMIT.coord, height: LIMIT.height }`. (Bodies and input are the net part's: the override only keeps the game fields; per 3i, a driven input never comes through `apply`.) **Wheels on replicas:** `apply` writes no part poses. A remote train is `driven` (N-12): `attachRemoteTrain` puts the vehicle kit on its tractor and cars, and the kit writes their `e.partXf` every step from the replica's own wheels, spun and steered by the replicated input (pinned by "a remote train turns its own wheels"). A second writer in `apply` would run in `lh.net.recv` and be overwritten by `VEHICLE_SYSTEM` in the same step. If a train kind ever stops being `driven` (no kit on the replica), `apply` must write `partXf` from the record's motion instead.
`src/net/entities.js`:

```js
// the local train becomes this player's net entity while a session runs (#77: the number is the game's; 3i sets self)
export function localTrain(world, game, you) {
  if (!you) return; const e = game.tractor.e;
  e.input ??= { thr: 0, steer: 0, turn: 0 }; e.mode ??= 'drive'; e.full ??= false; e.dirt ??= [0, 0, 0]; e.riders ??= [];
  e.netId = you; e.owner = you; if (!e.net) world.add(e, 'net', 'train');
}
export function dropLocalTrain(world, game) { const e = game?.tractor?.e; if (e?.net) world.remove(e, 'net'); }
```
`game.js`: `bindTrains(world, game)` after `game` is made; `pre()` starts with `stepRemoteTrains(world);` and, after `tractor.setInput(…)`, `if (tractor.e.net) { const I = tractor.e.input; I.thr = tractor.inThr; I.steer = tractor.inSteer; I.turn = tractor.inTurn; }`; `post()` ends with `if (tractor.e.net) trainFields(game, tractor.e);` where `trainFields` (in `kinds.js`, moved from 1.8's `players.js trainRecord`) writes `e.mode` (`'drive' | 'wait' | 'show' | 'held'` as 1.8), `e.full`, `e.dirt[0..2]` in place and refills `e.riders` (flights then landed slots, `id <= MAX_ID`, at most `LIMIT.riders`; rider objects reused).
`game/net.js`: on `'net.open'` the host calls `localTrain(e.world, s.game, 1)`; the guest calls it in `useFarm` after its welcome set `world.net.self = you`; `end()` and the guest's `goAlone` call `dropLocalTrain`. The host binds each joining guest's number to its peer with `world.net.player(peerId, n)` in its `peer` handler (3i). When the room closes, 3i despawns the other players' trains and leaves host-kind replicas as plain local entities (3i Contract issue 9): `goAlone` keeps its herd logic and stops reading `e.rec` (the guest's `herd.remote = false` path already does).
Host and guest: carried riders (`applyCarried`, the host's `before` loop over `p.carried`) read `e.riders` of each remote train entity, placed with that remote train's car bodies (`placeCarried` keeps its maths; the "drawn car" is now the remote car body here). `game.others = players.others(world)`.

- [ ] **Step 5: Run** `UNIT test/net.driven.test.mjs test/net.kinds.test.mjs test/mp.test.mjs test/mp.animals.test.mjs test/mp.repair.test.mjs test/mp.barn.test.mjs test/mp.relay.test.mjs test/tape.test.mjs test/bind.test.mjs test/session.bind.test.mjs`. Expected: PASS. A test that asserted "other trains never collide" (1.8's M-7 note) is rewritten in Task 24.

- [ ] **Step 6: Prove the links matter.** Temporarily delete the two `world.add(tractor.e, 'trailer'|'wagon', …)` lines from `createTrain`; run `UNIT test/net.driven.test.mjs`; expected FAIL (`linked cars`, or the net part's "spawn() must return a desc for its F.body() field" error); restore.

- [ ] **Step 7: Commit** `git add -A src test && git commit -m "feat(tractor): driven trains with linked trailer and wagon; remote trains built and stepped locally (N-12..N-15)"`. Notes: playtest item "bump feel on two real devices (no shared clock: unprojected snapshots, 3i Contract issue 4)".

### Task 24: Solid tractors honk on contact (debounced); the soft bump retires

**Files:** rewrite `src/sim/bump.js`; modify `src/sim/tractor.js` (tractor filter adds `'vehicle'`), `src/net/host.js`, `src/net/guest.js` (`bumper.drive` call), `test/bump.test.mjs`, `test/feel.test.mjs` (drop the soft-bump test), `test/helpers/feel.mjs` (`bumpRun` stays for the notes, unused by tests); create `test/net.bump.test.mjs`.

**Interfaces:** Consumes `world.rapier.contactPair(c1, c2, cb)` on 3i's `driven` remotes (dynamic, solid bodies that take part in contacts like any local body; 3i provides no honk or debounce: both live here, contract issues "3i"). Produces `BUMP = { cool: 0.6 }`, `createBumper(world)` → `{ drive(game, events) }`: one `{ type: 'bump', other: n }` event when this device's tractor starts touching another player's tractor; none again until the two have been apart for `BUMP.cool` s of sim time. The view's existing `bump` handling (boing, short horn, shake) is the honk.

- [ ] **Step 1: Failing tests.** Replace `test/bump.test.mjs`:

```js
// M-7 (3l, user decision 2026-10-13): tractors are solid; a tractor-to-tractor contact honks once, and again only after the two have
// been apart for BUMP.cool s (a sustained push honks once).
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor } from '../src/sim/tractor.js';
import { createBumper, BUMP } from '../src/sim/bump.js';

function pair() {
  const { world, step } = testWorld(); addGround(world);
  const a = createTractor(world, { x: 0, z: 0, yaw: 0 }), b = createTractor(world, { x: 0, z: 9, yaw: Math.PI });
  b.e.netId = 2; b.e.remote = { tractor: b }; world.add(b.e, 'net', 'train'); // b plays the other player's train (no session: this test game has no net part, so 'net' is a plain part here)
  const bumper = createBumper(world), events = [], game = { mode: 'drive', tractor: a };
  const run = (sec, thrA, thrB) => step(Math.round(sec / DT), () => { a.setInput(thrA, 0); a.step(DT); b.setInput(thrB, 0); b.step(DT); bumper.drive(game, events); });
  return { a, b, run, events };
}
test('tractors collide (they no longer pass through each other)', () => {
  const { a, b, run } = pair(); run(1, 0, 0); run(4, 1, 1);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2.5, 'the bodies stop each other');
});
test('a sustained push honks once', () => {
  const { run, events } = pair(); run(1, 0, 0); run(5, 1, 1);
  assert.equal(events.filter(e => e.type === 'bump').length, 1); assert.equal(events[0].other, 2);
});
test('apart for BUMP.cool, then touching again, honks again; apart for less does not', () => {
  const { run, events } = pair(); run(1, 0, 0); run(3, 1, 1);
  run(BUMP.cool * 0.5, -1, -1); run(1.5, 1, 1); assert.equal(events.length, 1, 'a short gap is the same bump');
  run(2, -1, -1); run(2.5, 1, 1); assert.equal(events.length, 2);
});
```
`test/net.bump.test.mjs`:

```js
// Two sims, two solid trains (3l Task 24): when the tractors meet, each device's own sim sees the contact and honks once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { moveTrain } from '../src/game/farm.js';
test('host and guest tractors collide head-on: both get exactly one bump event', async () => {
  const w = await engineWorld({ seed: 43 }); w.seconds(3);
  const h = w.host.game.tractor, g = w.guests[0];
  moveTrain(g.game, h.x + Math.sin(h.yaw) * 14, h.z + Math.cos(h.yaw) * 14, h.yaw + Math.PI, { ground: true }); w.seconds(1);
  const bumps = d => d.events.filter(e => e.type === 'bump').length, b0 = [bumps(w.host), bumps(g)];
  w.seconds(5, () => ({ thr: 0.7, steer: 0, horn: false }));
  assert.equal(bumps(w.host) - b0[0], 1, 'host'); assert.equal(bumps(g) - b0[1], 1, 'guest');
  assert.ok(Math.hypot(h.x - g.game.tractor.x, h.z - g.game.tractor.z) > 2.5, 'they did not pass through');
});
```

- [ ] **Step 2: Run** `UNIT test/bump.test.mjs test/net.bump.test.mjs`. Expected: FAIL ("tractors collide": they pass through: the tractor's filter excludes `vehicle`).

- [ ] **Step 3: Implement.** `tractor.js` spawn: `groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop', 'wall', 'vehicle'] }` (tractor to tractor only; trailers still ignore other trains; a solo farm has one vehicle, so nothing changes there). `src/sim/bump.js`:

```js
// M-7, user decision 2026-10-13 (3l): tractors are solid; Rapier keeps them apart. A contact between this device's tractor and another
// player's honks (the view plays the boing and a short horn for `bump`) once per contact: it re-arms only after the two have been apart
// for BUMP.cool s of sim time, so a sustained push honks once. Only this device's own tractor counts: each involved device honks for itself.
import { DT } from './ground.js';
export const BUMP = { cool: 0.6 }; // s apart before a new contact honks again
export function createBumper(world) {
  const apart = new Map(); let touching = false;
  const seen = (manifold) => { if (manifold.numContacts() > 0) touching = true; };
  const touches = (a, b) => { touching = false; for (const ca of a.colliders) for (const cb of b.colliders) world.rapier.contactPair(ca.collider, cb.collider, seen); return touching; };
  return {
    drive(game, events) {
      if (game.mode !== 'drive') return; // M-4: a tractor in its show stays in the barn
      const own = game.tractor.e;
      for (const e of world.with('net')) {
        if (e.net !== 'train' || e === own || !e.remote) continue;
        const was = apart.get(e.netId) ?? Infinity, now = touches(own, e);
        if (now) { if (was >= BUMP.cool) events.push({ type: 'bump', other: e.netId }); apart.set(e.netId, 0); }
        else apart.set(e.netId, was === Infinity ? Infinity : was + DT);
      }
    },
  };
}
```
(`seen` is made once: no closure per step. `contactPair`'s callback receives the manifold first in Rapier 0.21's JS API; if it is `(manifold, flipped)`, the code is the same.) Host and guest make `createBumper(world)` and keep `bumper.drive(game, out)` in `before()`. Delete `bumpNormal`/`closest` and their tests. `test/feel.test.mjs`: delete "the soft bump keeps its outcome"; the course test stays.
- [ ] **Step 4: Run** `UNIT test/bump.test.mjs test/net.bump.test.mjs test/mp.test.mjs test/feel.test.mjs`. Expected: PASS.
- [ ] **Step 5: Prove the debounce.** Temporarily replace `if (was >= BUMP.cool)` with `if (true)`; run `UNIT test/bump.test.mjs`; expected FAIL "a sustained push honks once"; restore.
- [ ] **Step 6: Commit** `git add -A src test && git commit -m "feat(tractor): solid tractors; a contact honks once per bump (debounced); the soft push retires"`

### Task 25: The view draws other trains and their riders from entities (read-only, #102)

**Files:** create `src/view/riders.js`; modify `src/game.view.js` (drop `players.poseAt`, `netView`, `others3d`), `src/view/world.js`; delete `src/render/others3d.js`.

**Interfaces:** Consumes `trainViews(sync, { materials, paintOf, awayOf })` (Task 16: remote trains are tractor/car entities with `model`, drawn by the same hooks), `view.sync.objectOf(e)`, train entity fields `riders`, `rec` and `recSeq` (read-only), `createInterp` (lion-hawk/sim, view-side copy per remote player). Produces `createRiderPoses() → { update(world, sync, nowMs, out: Map) → Map }`: pose copies for animals other players carry (slot riders placed in the drawn car; riders in flight interpolated between the last two records by record time, D8's role for a non-colliding visual), the map `animals3d` draws in place of the sim's animals (as #79/#102).

- [ ] **Step 1: Failing test.** Add to `test/view.purity.test.mjs`: `test('others3d and poseAt are gone; riders come from train entities', () => { assert.equal(existsSync(join(src, 'render/others3d.js')), false); assert.doesNotMatch(readFileSync(join(src, 'game.view.js'), 'utf8'), /poseAt|others3d/); })` and in `test/net.driven.test.mjs`: a guest train carrying 2 riders (use the farm debug `riders(e, 2)` on the guest) → on the host, `createRiderPoses().update(...)` gives 2 poses within 0.6 m of the guest's own rider positions (use a fake `sync.objectOf` returning `{ position: body.translation(), quaternion: body.rotation() }` of the host's remote car entities).
- [ ] **Step 2: Run** `UNIT test/view.purity.test.mjs test/net.driven.test.mjs`. Expected: FAIL (`others3d.js` exists; `createRiderPoses` missing).
- [ ] **Step 3: Implement** `src/view/riders.js`:

```js
// Other players' carried riders in this view (lion-hawk 3l; #102 kept: read-only). A remote train entity carries its owner's riders
// (e.riders, from the record). A slot rider sits where its owner placed it in that car, re-expressed in the car as this view draws it;
// a rider in flight is interpolated between its last two records by record time (a visual that never collides: D8's job here).
import * as THREE from 'three';
const local = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
export function createRiderPoses() {
  const pool = new Map(), last = new Map(); // id → pose copy; id → { t0, a: {x,y,z,yaw}, t1, b }
  return {
    update(world, sync, nowMs, out) {
      out.clear();
      for (const e of world.with('net')) {
        if (e.net !== 'train' || !e.remote || e.netId === world.net.self || !e.riders) continue;
        const rec = e.rec;
        for (const c of e.riders) {
          let p = pool.get(c.id); if (!p) pool.set(c.id, p = { id: c.id });
          if (c.flying) { let L = last.get(c.id); if (!L) last.set(c.id, L = { seq: -1, t0: nowMs, t1: nowMs, a: { ...c }, b: { ...c } });
            if (L.seq !== e.recSeq) { L.seq = e.recSeq; Object.assign(L.a, L.b); Object.assign(L.b, c); L.t0 = L.t1; L.t1 = nowMs; }
            const k = Math.min(1, (nowMs - L.t1) / Math.max(1, L.t1 - L.t0)); p.x = L.a.x + (L.b.x - L.a.x) * k; p.y = L.a.y + (L.b.y - L.a.y) * k; p.z = L.a.z + (L.b.z - L.a.z) * k; p.yaw = c.yaw; p.riding = false; }
          else { const k = c.slot >= 6 ? 1 : 0, at = k ? rec.wagon : rec.trailer, car = sync.objectOf(k ? e.wagon : e.trailer); if (!car) continue;
            local.set(c.x - at.p.x, c.y - at.p.y, c.z - at.p.z).applyQuaternion(qa.set(at.q.x, at.q.y, at.q.z, at.q.w).invert()).applyQuaternion(qb.copy(car.quaternion)).add(car.position);
            p.x = local.x; p.y = local.y; p.z = local.z; p.yaw = Math.atan2(1 - 2 * (car.quaternion.y ** 2 + car.quaternion.z ** 2), 2 * (car.quaternion.x * car.quaternion.z - car.quaternion.w * car.quaternion.y)); p.riding = true; }
          p.hat = c.hat === 'none' ? null : c.hat; p.anim = c.flying ? 'run' : 'idle'; p.state = 'carried'; p.ride = null; p.hidden = false;
          out.set(c.id, p);
        }
      }
      return out;
    },
  };
}
```
(`{ ...c }` allocates only the first time a rider flies; `Object.assign` copies in place after that.) In `game.view.js`: the drive half's `others` block becomes `const riderPoses = createRiderPoses()` (made once per half) and `others = riderPoses.update(engine.world, view.sync, engine.time.wall + alpha * 1000 / engine.game.sim.hz, netView)`; `posesOf(g.herd, others, …)` keeps its #79 merge but takes this map (each pose gets `type`, `golden`, `dirt` from the sim animal by id, as today). `trainViews` gets `paintOf: e => e.netId && e.netId !== engine.world.net.self ? playerPaint(e.netId) : localPaint()` and `awayOf: e => !!(e.netId && e.netId !== engine.world.net.self && playerAway(e.netId))`, reading the sync's roster (`engine.scene.state.net.sync?.players.map.get(n)`) read-only. Delete `w.others3d` and `git rm src/render/others3d.js`.
- [ ] **Step 4: Run** `UNIT test/` then `BROWSER test/e2e.browser.mjs` (the two-page test: the other train and its carried rider are drawn on both pages; its rider has `type`). Expected: PASS.
- [ ] **Step 5: Commit** `git add -A src test && git commit -m "feat(tractor): other trains drawn by view sync; their riders from train entities (read-only, #102)"`

### Task 26: The R5 checks: bump under latency and loss, two pages, tapes, the version message

**Files:** modify `test/net.bump.test.mjs`, `test/tape.test.mjs`, `test/e2e.browser.mjs` (or create `test/net.peers.browser.mjs`), notes.

- [ ] **Step 1: The bump test under 80 ms and 2 % loss** (R5 (a)). Append to `test/net.bump.test.mjs`:

```js
test('R5: under 80 ms latency and 2 % loss, 1 s after contact both peers hold each train within 0.5 m of its owner, and no correction exceeds snapAt during the bump', async () => {
  const w = await engineWorld({ seed: 47, link: { latency: 80, loss: 0.02 } }); w.seconds(4);
  const H = w.host, G = w.guests[0], h = H.game.tractor, gn = G.engine.world.net.self;
  moveTrain(G.game, h.x + Math.sin(h.yaw) * 14, h.z + Math.cos(h.yaw) * 14, h.yaw + Math.PI, { ground: true }); w.seconds(1.5);
  const rem = (d, n) => d.engine.world.net.find('train', n), snaps = () => H.engine.world.net.stats.kinds.train.snaps + G.engine.world.net.stats.kinds.train.snaps;
  const snaps0 = snaps(), watch = () => {}; // 3i sets netFix only on snaps (its Contract issue 5): no snap = no correction over snapAt
  let contact = -1; const bumps0 = H.events.filter(e => e.type === 'bump').length;
  for (let i = 0; i < 6 * 60; i++) { w.step(1, [{ thr: 0.7, steer: 0, horn: false }, { thr: 0.7, steer: 0, horn: false }]); watch();
    if (contact < 0 && H.events.filter(e => e.type === 'bump').length > bumps0) contact = i; if (contact >= 0 && i >= contact + 60) break; }
  assert.ok(contact >= 0, 'they met');
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(d(rem(H, gn).body.translation(), G.game.tractor.body.translation()) < 0.5, 'the host holds the guest\'s train');
  assert.ok(d(rem(G, 1).body.translation(), H.game.tractor.body.translation()) < 0.5, 'the guest holds the host\'s train');
  assert.equal(snaps(), snaps0, 'no correction over snapAt (a snap) during the bump');
});
```
(`link` option names are `mp()`'s: use the names `lion-hawk/test` documents for latency and loss.) Run `UNIT test/net.bump.test.mjs`. Expected: PASS. **If it fails on distance or snaps:** this is the driven-feel risk R5 names: write the numbers into the notes, try `tune.nudge` 4…10 and `snapAt` 1.5…2.5 through `world.net.tunables.train` (N-17) and record each run; never loosen the 0.5 m or snapAt assertions. A failure that no tunable fixes stops the task (user ruling 2026-10-14: no fallback to draw-only trains or a game-side bump): file an integrator request against 3i with the measured distances, snap counts and tunables tried (the clock-sync follow-up 3i parked is the likely fix), and resume on the engine patch. `remote: 'view'` for trains is not an option.
- [ ] **Step 2: Tapes (NET_VERSION 4 cause).** Run `UNIT test/tape.test.mjs`. The in-run tapes (solo trip, guest without its host, a guest that boops, the checksum probes) must pass on the new wire; there are no stored tape files to re-record. Add one: `test('a guest whose train bumps the host\'s replays alone, bump event included', …)` recording the guest of Task 24's head-on run and asserting `replay(g, tape).checksum() === guest.h.checksum()` and that the replay's events include one `bump`.
- [ ] **Step 3: Two pages** (R5 (b)). `test/net.peers.browser.mjs` with `peers(browser, url, 2, { render: 'manual', argsOf })` (lion-hawk/playwright, #107): host and guest pages, the guest turned to face the host (`window.engine.debug.trainAt`), both drive at each other with the stick; assert each page logs exactly one `bump` and that each page's World has the other's train as a dynamic body. Run `BROWSER test/net.peers.browser.mjs`. Expected: PASS.
- [ ] **Step 4: The version message** (R5 (c)): `src/net/session.js` already maps Handshake's `version_mismatch` to "Update the game on both devices." Keep it (the overview's suggested wording is an example); add a `session.test.mjs` case that a refused join with `version_mismatch` shows that text. The real-device check (a 1.8.0 device given a 1.9.0 room code) is a user item in the notes.
- [ ] **Step 5: Notes** "NET_VERSION 4 (re-bless cause)": what changed on the wire (F.body without dirt in the body, dirt as its own list, batched driven inputs, engine send clocks), that no solo golden moved, the R5 numbers, and the playtest items: solid trains change play (overview §8 R5 (d)); a real WebRTC room (M-54).
- [ ] **Step 6: Commit** `git add -A test src && git commit -m "test(tractor): R5 bump under latency and loss, two-page solid trains, guest tape with a bump"`

---
## Part F — final pass

### Task 27: Drop the engine workarounds (#95, #100, #105, #106, #108)

**Files:** modify `src/game/flow.js` (`open`), `src/view/menus.js` (the sleep half), `src/sim/tune.js`, `src/game.sim.js` (`reset`), `test/flow.test.mjs`, `test/tune.test.mjs`, `test/e2e.browser.mjs`.

**Interfaces:** Consumes `engine.overlay(name, args, { once: true })` (#95), the overlay's open args in its view half (`enter(engine, view, args)` or `engine.scene.overlayArgs(name)`, #105, 3a), headless and Playwright `untilLoaded` stepping while commands are pending (#100), `defineGame({ reset() })` called first in `createEngine` and before a replay (#108), `world.stats.stepMsTotal` (#106). Produces `TUNE_DEFAULTS` (a deep copy of the shipped `POWER`, `TP`, `PILOT`, `TR`, `TREE` values, taken at module load) and `resetTunes()` in `src/sim/tune.js`.

- [ ] **Step 1: Failing test.** In `test/tune.test.mjs` delete the `ORIGINAL`/`restore`/`afterEach(restore)` block and add:

```js
import { TUNE_DEFAULTS, resetTunes } from '../src/sim/tune.js';
test('#108: a new engine starts from the shipped feel constants (the game\'s reset), and a replay too', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(1); h.command('tune', { key: 'TP.slip', value: 4.5 }); h.step(1);
  assert.equal(TP.slip, 4.5);
  headless(tractorGame(), { args: ARGS }); assert.equal(TP.slip, TUNE_DEFAULTS.TP.slip, 'createEngine called reset()');
  assert.deepEqual(POWER, TUNE_DEFAULTS.POWER); resetTunes();
});
test('tuneGet is guarded like tuneSet: an unknown id reads null', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(1); assert.equal(tuneGet(h.engine.scene.state.game, 'NOPE'), null);
});
```
In `test/flow.test.mjs` replace the three `h.command('farm.new', {}).step(1); h.untilLoaded()` patterns whose `step(1)` only made `untilLoaded` wait (lines that do not assert `loading.active` in between) with `h.command('farm.new', {}); h.untilLoaded()`; likewise `test/e2e.browser.mjs`'s `await game.step(1); await game.untilLoaded()` (two places).

- [ ] **Step 2: Run** `UNIT test/tune.test.mjs test/flow.test.mjs`. Expected: FAIL (`TUNE_DEFAULTS` missing; the tune tests now leak values between tests).

- [ ] **Step 3: Implement.** `src/sim/tune.js`:

```js
// #108: the shipped values, copied once at load, and the reset the engine runs first in createEngine and before a replay
// (defineGame({ reset })): two sims in one process share the constants, so each new engine starts from these.
export const TUNE_DEFAULTS = Object.freeze(structuredClone({ POWER, TP, PILOT, TR, TREE }));
export function resetTunes() {
  for (const k of Object.keys(POWER)) Object.assign(POWER[k], TUNE_DEFAULTS.POWER[k]);
  Object.assign(TP, TUNE_DEFAULTS.TP); Object.assign(PILOT, TUNE_DEFAULTS.PILOT); Object.assign(TR, TUNE_DEFAULTS.TR); Object.assign(TREE, TUNE_DEFAULTS.TREE);
}
```
(`structuredClone` runs once at module load, not per step; `TP` holds only numbers.) `tuneGet`: `const r = ROWS.get(id); if (!r) return null;` (the G4b minor). `game.sim.js`: `defineGame({ …, reset: resetTunes })`. A guest that joins resets its tunes (the G4b minor "a guest keeps its solo tunes after joining"): `game/net.js`'s `'net.open'` with `role === 'guest'` calls `resetTunes()` and emits `tune.reset` (the panel re-reads; in one-process `mp()` tests this also resets the host's copy, which is the shipped value anyway). `flow.js`: `export const open = (e, name, args) => e.overlay(name, args, { once: true });` (#95). The sleep half in `view/menus.js` reads `quiet` from its open args (`enter(engine, view, args)` per 3a) instead of scanning `engine.events.since(0)` (#105). `grep -rn "worldMs\|phys\." src` prints nothing (#106 is done since Task 8).

- [ ] **Step 4: Run** `UNIT test/` then `BROWSER test/e2e.browser.mjs`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A src test && git commit -m "refactor(tractor): drop the #95, #100, #105, #108 workarounds; tune reset and a guarded tuneGet"`

### Task 28: The 2g parked minors: sim, net and session

**Files:** modify `src/net/bind.js`, `src/net/session.js`, `src/ui/input.js`, `src/view/menus.js`, `src/game/flow.js` (book args), `test/bind.test.mjs`, `test/session.test.mjs`, `test/input.test.mjs`, `test/e2e.browser.mjs`.

Each item gets a test that fails before its fix (Step 1), then the fix (Step 3):
- [ ] **Step 1: Failing tests.**
  - `bind.test.mjs`: (a) under a test clock (`?lh-test` → `bindPort(engine, { …, test: true })`), `close()` never arms the 1 s wall-clock fallback (`setTimeout` spy sees no call); (b) a quick re-host: `bindPort` twice in a row leaves exactly one live port after the next step (the first is closed before the second opens); (c) a transport event (`peer`) emitted while the bind waits for the farm reaches the sync after the port opens (today it is lost).
  - `session.test.mjs`: the no-`bind` path is gone: `createSession({})` without `bind` throws `session: bind is required`; the old tests that made the session step its own sync move onto `bindPort` with the memory hub (as `session.bind.test.mjs` does).
  - `input.test.mjs`: imports only `radial` and `HORN_SVG` (`createInput` is deleted; its two tests go).
  - `e2e.browser.mjs`: the `?r=` path: open `/?r=ABCD` (no room server: the join prompt opens with the code filled and the URL loses `r`); the book overlay opened with `args.bookSeen` shows the badge state without the farm's `noteSeen` frame (G3).
- [ ] **Step 2: Run** `UNIT test/bind.test.mjs test/session.test.mjs test/input.test.mjs`. Expected: FAIL on (a), (b), (c) and the session throw.
- [ ] **Step 3: Fix.** `bindPort(engine, { role, transport, clock, test = false })`: skip the `setTimeout` fallback when `test`; keep a module-level `live` port per engine (`WeakMap`) and close it before opening a new one; wrap a function transport so its events are queued until the port subscribes and replayed in order right after (`main.js` passes `test: q.has('lh-test')`). `session.js`: delete the path that made and stepped its own sync; `bind` is required. `ui/input.js`: delete `createInput` (keep `radial`, `HORN_SVG`, with the header note updated). `flow.js`/`view/menus.js`: `open(e, 'book', { bookSeen: s.progress.bookSeen })` and the book half reads it from its args (#105 path); delete `noteSeen` and its call in the farm frame.
- [ ] **Step 4: Run** `UNIT test/` then `BROWSER test/e2e.browser.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A src test && git commit -m "fix(tractor): 2g parked minors: bind fallback, re-host, early events, session bind, book args, ?r= test"`

### Task 29: The 2g parked minors: view and tests

**Files:** modify `src/ui/debug.js` (tune panel numbers), `test/e2e.browser.mjs` (wake hold, lullaby), `src/sim/bedtime.js` (export the hold constant if it is not exported), `docs/tractor-pickup-spec.md` (the note on `menus.js`'s added behaviour, G4).

- [ ] **Step 1: Failing tests.** In `test/e2e.browser.mjs` (or a unit test on `buildTunePanel` with happy-dom if the game has it; otherwise the e2e `?tune` case): the `full speed err deg` row shows `26`, not `25.99999…` (G7). The wake-hold test's `game.step(290)` / `game.step(20)` become `game.step(Math.round((WAKE_HOLD_S - 0.17) * 60))` and `game.step(Math.round(0.34 * 60))` with `WAKE_HOLD_S` imported from the game's constants (G6). The new-farm-while-asleep test asserts the lullaby started: `await game.page.evaluate(() => window.__tpLullaby ?? 0) > 0` with the sound module counting lullaby starts on `window.__tpLullaby` under `?lh-test` only (G6).
- [ ] **Step 2: Run** `BROWSER test/e2e.browser.mjs`. Expected: FAIL on the float label and the lullaby count.
- [ ] **Step 3: Fix.** `debug.js`: format each row with the decimals of its `step` (`v.toFixed(Math.max(0, -Math.floor(Math.log10(step))))`); `audio/sound.js`: `if (globalThis.location?.search.includes('lh-test')) globalThis.__tpLullaby = (globalThis.__tpLullaby ?? 0) + 1;` where the lullaby starts. Spec text: one line under the parent menu section recording `onParentDone`, `closeParent` and the new farm in slots mode (G4: documentation only).
- [ ] **Step 4: Run** `UNIT test/` then `BROWSER test/e2e.browser.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A src test docs && git commit -m "fix(tractor): 2g parked minors: tune labels, wake-hold timing, lullaby check, menus note"`

### Task 30: Build, size, frame rate, 1.9.0, notes

**Files:** modify `package.json` (`"version": "1.9.0"`), `docs/tractor-pickup-spec.md` (1.13: NET_VERSION 4, solid trains that honk, dirt per metre, the build), `README.md`, `docs/lh3-baseline.md`.

- [ ] **Step 1:** `npx lion-hawk bake --check` (exit 0), `UNIT test/`, `BROWSER test/e2e.browser.mjs`, `BROWSER test/net.peers.browser.mjs`, `SCRATCH=$SCRATCH BROWSER test/perf.browser.mjs` — all PASS. Record the counts.
- [ ] **Step 2:** `npx lion-hawk build --out $SCRATCH/tractor` and the size report: html, assets, gzip totals; compare with `docs/lh3-baseline.md` R3 (≤ +10 % gzip). Record.
- [ ] **Step 3:** The frame-rate record (R1): SwiftShader programs and draw calls (yard, route) old vs new from Step 1's perf run; `shading` in use; the iPad `?fps` comparison is a user item (same route, today's release vs `$SCRATCH/tractor`).
- [ ] **Step 4:** Version 1.9.0 in `package.json`; spec 1.13 text; README build/bake/dev lines.
- [ ] **Step 5:** Notes (`docs/plans/2026-10-13-phase-3l-tractor-notes.md`): what landed per task with commits; the two (three with 13b) re-bless tables; the R1/R3 numbers; the lh-allow list; the playtest list (below); field note candidates; contract issues as met.
- [ ] **Step 6: Commit** `git add -A && git commit -m "chore(tractor): Tractor Pickup 1.9.0 on lion-hawk phase 3"`. No push, merge or deploy (overview §6).

**Playtest list for the notes (user):** solid trains in a real WebRTC room (bump feel, honk once per bump; no shared clock between real devices, so remotes snap unprojected); dirt on Low and High power and standing in mud (Task 13b); `standard` shading vs 1.8's Lambert look (or `lambert` and the gold animal's sheen, if R1 moved it); corn showing all four cobs; the Task 13 wheel-order re-bless (drift and jackknife feel); the iPad `?fps` run; audio unlock and resume on the engine service; a 1.8.0 device given a 1.9.0 room code shows "Update the game on both devices."

---

## Done when

- `UNIT test/` passes in `$G` (all unit suites, including the new `materials`, `bake`, `parity`, `build.hooks`, `ground`, `mass`, `split`, `surface`, `checks`, `feel`, `kits`, `dirt`, `view.purity`, `view.models`, `view.sync`, `audio`, `net.kinds`, `net.driven`, `net.bump`); expected count: 783 at G7, minus the deleted `matSplit`/`shadows`/`warm`/`golden-farm`/old-harness tests, plus the new ones, recorded in the notes.
- `BROWSER test/e2e.browser.mjs`, `BROWSER test/net.peers.browser.mjs`, `BROWSER test/perf.browser.mjs` pass, one at a time.
- `npx lion-hawk bake --check` exits 0; `npx lion-hawk build --out $SCRATCH/tractor` builds; R3 within budget; R1 SwiftShader gate passes (recorded).
- No file under `src/` imports `assets.json`, calls `new RAPIER.World`, calls `ColliderDesc.*`, or sets a literal friction, density or restitution; `grep -rn "ColliderDesc\|new R\(APIER\)\?\.World\|setFriction\|setDensity\|setRestitution\|setMass(" src` prints nothing; the only `// lh-allow` line is the tractor's `massProps` (D3).
- Goldens re-blessed only in Tasks 11 and 13 (and checked unchanged in 13b), each with its §5.5 table; solo goldens unchanged by Parts D and E.
- The games workspace suite passes after the integrator merges (`npm test` in `$WT/games`).
- Tractor Pickup 1.9.0; merge point: the integrator merges `feat/lion-hawk-3-tractor` into `feat/lion-hawk-3` after engine 0.10.0 (Part E needs it), then 3m's 0.11.0.

## Notes stub

Notes file: `docs/plans/2026-10-13-phase-3l-tractor-notes.md` (engine repo; the controller creates it, implementers append). Sections: "What landed" (per task, commits), "Re-bless 1 (World)", "Re-bless 2 (vehicle kit order)", "Task 13b dirt rates", "NET_VERSION 4", "R1 / R3 numbers", "lh-allow lines", "Playtest list", "Contract issues (as met)", and **"Field note candidates"** (the integrator numbers them from #110). Candidates already known:
- Tractor's chase camera moved into 3g's `createChaseRig` (heading style); the shake is now a counter hash, not `Math.random` (Task 14, CI-10).
- Tractor's fx cubes, gibs and tyre marks moved onto 3h's `createParticles`/`createMarks` (per-emit gravity and drag, `floor`, `heightAt`); landed cubes rest at `floor + size / 2` (Task 18, CI-14).
- Paint as one material colour could not express 1.8's shaded paint or a rainbow along the body; the engine gained a `PAINT` feature (shading-preserving paint, hue-ramp paint value, `mc.repaint`) on one program per feature set (3f Task 8b; Tasks 16, 17; Integrator request 6, closed).
- The coverage kit's single `washTime` could not express a faster wash; 3h gains a per-wash `washTime` (Integrator request 5, Task 13b).

## Contract issues

Each was the smallest decision that let the plan proceed; the controller's rulings (`2026-10-13-phase-3-contract-issues.md`, "## 3l Tractor") and the wave-1 reconciliation settled them. Status as of the reconciliation pass (2026-10-14):

- **CI-2 (3d/3f) anim-table socket rows.** Accepted: 3d writes `sock-<name>` rows; Task 15 reads the hat's frame from the `sock-hat` row and keeps the sidecar-socket composition as a defensive fallback (one matrix multiply per hat).
- **CI-3 (3f) per-material shading tier.** Deferred until the iPad R1 runs. Lambert through D5's tier is an engine option and acceptable; if R1 forces it, the gold animal's look (or `mc.extend`) is an engine request, not a game material.
- **CI-4 (3c) no `cone` collider shape.** Accepted: yard cones are a 17-point hull with `body.mass: 2` (counted in re-bless 1).
- **CI-6 (overview §5.5) re-bless causes.** Accepted: "vehicle-kit update order" (Task 13) and "pre/post split" (Task 8, in re-bless 1).
- **CI-7 (3d) programmatic build.** Settled: `build({ game, out, env, site, mode, e2e, entry, log }) → { out, version, hash, files, sizes }`, no `report` member (Task 4). The template's `<!--APP-->` is bare; `sw.js` has `__PRECACHE__`.
- **CI-8 (3e) light presets.** Settled: `{ sky, hemiSky, ground, hemi, sun: { color, intensity, offset }, fog }`; `hemiSky` `#eef7ff` apart from the background (Task 14).
- **CI-10 (3g) chase rig.** Settled: Tractor adopts `createChaseRig` (heading style, `shake`, `blendFrom`, `portraitAspect`, live `opts`); `render/camera.js` is deleted and `view/rig.js` is a thin wrapper, pinned by `test/view.rig.test.mjs` against 1.8's camera (Task 14).
- **CI-11 (3c/3h) heightfield options.** Settled: `world.heightfield` forwards `fixInternalEdges`; `createTerrain({ material, groups, fixInternalEdges })` (Tasks 5, 12).
- **CI-12 (3e/3f) where boot gets the manifest.** Settled: `render: { assets: { manifest, base } }` (Task 15).
- **CI-13 (3e) `snapshot` size.** Settled: `snapshot(renderer, object, { size: [480, 360], camera })` (Task 17); stickers use its `crop`/`outline`/`out`.
- **CI-14 (3h) particles and marks.** Settled: `createParticles` (per-emit gravity/drag, `floor`, `bounce`, `friction`) and `createMarks` (`heightAt`, `lift`); Tractor's fx, gibs and marks move onto them (Task 18).
- **CI-15 (3i) replicas and a guest's `world.clear()`.** Decided by 3i: replicas survive the clear and are respawned from their newest records through the kind hooks (new `e.id`s, same netIds, `stats.respawned`). Tractor rebuilds only its own train, does not re-request or wait for a host frame, and never holds a replica across a clear (`world.net.find`, Part E design; Task 22).
- **CI-16 (3c) physics during a load.** Settled: 3c does not run `lh.physics.step` while a scene loads (S-3); Tractor relied on no step during a load, and `test/split.test.mjs` pins it (Task 8).
- **CI-17 (§4.4) quaternion format.** Confirmed by 3c: `[x, y, z, w]` (Task 6's pose test pins it).
- **3i `e.rec`.** 3i never sets `e.rec` on a replica; Tractor's kinds set it in their own `spawned` and `apply` hooks (`keep`, Task 21), which `netStore` and `riders.js` read.
- **3h `dirtRate`.** Per metre, matched to 1.8's per-second rate at Medium speeds and pinned by `test/dirt.test.mjs` (Task 13b); playtest item.
- **Part poses (3c Task 10b, 3g Task 13b, 3h Task 6b; user ruling 2026-10-14).** Adopted: each kit wheel names its GLB node in `part` (Task 13; `CAR_WHEELS` for the trailer's cloned wheel node, Task 16), view sync draws the wheels, and `vehicles.js` keeps no pivots or per-frame wheel code. Remote trains are driven and run the kit, so their wheels need no `apply` writer (Task 23). The bbox hub against 1.8's hand pivots is a playtest eyeball item (Task 16 Step 4).
- **Away ghost on shared materials.** Fixed in Task 16: `ghost` writes only per-entity materials (coverageView's `mc.coverage` clones) and throws on a shared one, so ghosting one train never ghosts every train.
- **Registry hash.** The engine's base hash literal is now `2f4f4f95` (3b); Tractor's tests read `MATERIALS.hash` and `phys.json`'s `materials` from code, never a literal.

(The earlier CI-1 (a `spawn` hook for multi-body remotes), CI-5 (`coverageView` without `coverageKit`) and CI-9 (game-side car correction) are resolved by 3i's linked bodies and by Task 13b using the coverage kit.)

## Integrator requests

User ruling (2026-10-14): Tractor moves fully onto the engine. A step that finds the engine short stops, files a request here with measured numbers, and resumes on the engine patch; it never keeps a game copy.

1. **`games/package-lock.json`** after `games/tractor-pickup/package.json` changes (Task 3 adds `meshoptimizer` as a devDependency; Task 4 drops nothing): run `npm install` in `games/` on `feat/lion-hawk-3` and commit the lockfile.
2. **`games/test/**`**: if any workspace test references `tractor-pickup/build.py`, `src/assets.json`, `TP_MP` or `test/mp.harness.mjs`'s old world, update it (this plan deletes them).
3. **Engine requests still open:** CI-3 (a per-material tier, only if R1 forces `lambert` and the gold look is lost). CI-11, CI-14 and CI-16 are settled by 3c/3h and need nothing more.
4. **Field notes**: number the "Field note candidates" from the notes file (from #110).
5. **3h coverage kit: a per-wash time.** `washes` entries may be `{ at(x, z) → boolean, washTime }` beside plain functions, so Tractor's yard wash cleans in `DIRT.washTime / WASH_RATE` = 0.5 s while sprinklers take 1.5 s (1.8's numbers). Task 13b uses it and waits for it.
6. **Closed (2026-10-14): paint that keeps vertex shading and varies along the body.** 3f Task 8b owns it, because paint is a material concern and 3g only forwards `e.paint` and `instanceColor`. It adds the `PAINT` feature: each `paint-body`/`paint-trim` vertex is the paint × (0.25 + 0.85 × its brightness over its slot's brightest, at most 1.1). It adds the paint value `{ hue: { axis: [0, 0, 1], from: -1, to: 1, s: 0.75, l: 0.5 } }` for rainbow, `createMaterialCompiler(…, { paint: { base, shade } })` and `mc.repaint(root, paint)`. Colours, hues and no paint are uniforms of one program per feature set. Task 16 (hooks) and Task 17 (`tractorPicture`) use it, and their tests compare it with 1.8's `paintable`. 3e accepts `render.paint` and passes it to the compiler (3e Task 7, reconciled 2026-10-14 for 3f Integrator request 2); the integrator only confirms it at the Wave B merge.
7. **Part poses in 0.9.0.** Tasks 13, 16 and 23 need 3c Task 10b (`partXf`), 3g Task 13b (view sync draws part poses) and 3h Task 6b (the wheel `part`) on `phase-3`. Without them Task 16 stops (no game wheel code).
