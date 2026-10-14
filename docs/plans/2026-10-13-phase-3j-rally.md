# Phase 3j: Rally onto the phase 3 engine

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rally builds its world from engine parts:
- baked GLBs from `lion-hawk bake`, shipped beside the page by `lion-hawk build`;
- a material registry that carries the tyre model's surface parameters (`tire.js` `SURFACES` is retired);
- every Rapier body and collider made by the scene's `World` (ground, pad features, gate posts, marker posts, cones, the car), with Rally's custom ray-cast vehicle and its snow kept as game code on top;
- the engine renderer, light rig and material compiler, with instanced props read from the transform pool.

Then Rally's cross-game final-pass items, the size and frame-rate records, and version 0.4.0.

**Architecture:**
- Strangler order, as overview §5.3 sets it. Asset and sim tasks need engine 0.8.0. View tasks need 0.9.0. Final-pass tasks come last.
- The sim moves in four golden checkpoints:
  1. tyre parameters from the registry (bit-exact);
  2. the `Sim` stepping on the World's Rapier world (bit-exact);
  3. static colliders, then props, then the car body spawned through the World. Each step re-blesses the goldens once for its cause under overview §5.5, with the feel sample checked first;
  4. the terrain kit at 0.9.0 (bit-exact again).
- The vehicle stays Rally's (overview §1.2): `Vehicle.step` runs as the `rally.vehicle` system in `physics.world`, before `lh.physics.step`. Its wheel rays are raw Rapier queries (L-1), marked `// lh-allow`.

**Tech Stack:** lion-hawk 0.8.0 → 0.9.0, three 0.186, `@dimforge/rapier3d-compat` 0.21 (injected, D9), esbuild through `lion-hawk build`, Playwright through `lion-hawk/playwright`, `node:test`.

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md` (deltas D1–D9 apply).

Paths:
- four43 worktree `W=~/projects/four43/four43-lh3-rally` on branch `feat/lion-hawk-3-rally` (overview §6). Every path below is relative to `$W/games/rally` unless it starts with `$W`.
- `SCRATCH` is the implementer's scratchpad directory. Builds go only there.

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

### This plan's own constraints

12. **Ownership.** Touch only `$W/games/rally/**`. In constraint 9, "package.json" means the engine's. Rally's own `games/rally/package.json` is this plan's file, but `$W/games/package-lock.json` is not. If `npm install` changes the lock, do not commit the change; raise it as an integrator request.
13. **Gates.** Tasks 1–10 (assets and sim) need engine **0.8.0** in `$W/../lion-hawk-engine`. Task 11 (the terrain kit in the sim) and Tasks 12–22 (view and final pass) need **0.9.0**. Check with `node -e "import('lion-hawk/sim').then(m => console.log(m.ENGINE_VERSION))"` in `games/rally` before the first task of each part. If the version is too old, stop.
14. **Command prefixes.** Every test command uses one of these prefixes, exactly (overview §7):

    ```bash
    UNIT="systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$W/games/rally -E NODE_OPTIONS=--max-old-space-size=512"
    BROWSER="flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$W/games/rally -E NODE_OPTIONS=--max-old-space-size=2048"
    ```

    - `$UNIT npm test` is Rally's whole unit suite. Its `node --test` already passes `--test-concurrency=4`.
    - A single file runs as `$UNIT node --test --test-concurrency=4 test/<file>`.
    - A script runs as `$UNIT node test/<script>.mjs`.
15. **Golden checkpoints.** Tasks 5, 6, 10 and 11 and every view task must leave both goldens (`test/goldens/stage-autopilot.json`, `test/goldens/stage-scene.json`) **bit-exact**. Tasks 7, 8 and 9 may each re-bless once, only under the §5.5 procedure in their steps.
16. **Feel tolerances.** These are fixed now, before any run (overview §5.5-2). Stage times: ±3 %. Speeds: ±3 % or ±1 km/h, whichever is larger. Decelerations: ±3 % or ±0.01 g, whichever is larger. There are no count metrics in Rally's sample.
17. **No `rm -i`.** The shell aliases `rm`. Delete files with `git rm` (tracked) or `/bin/rm -f` (scratch).

---

## Review Focus

Each of these is pinned by a test inside a task:

1. **The World steps Rapier even when it has no entities.** In Task 6, Rally's raw bodies live on `world.rapier` before anything is spawned. If `lh.physics.step` skipped an entity-less world, the car would freeze. Pinned by `test/lh-world.test.mjs` "a raw body on the World's Rapier world falls under the engine step".
2. **Collision-group bits.** `world.groups` must give exactly today's `GROUP_GROUND = 1`, `GROUP_PROP = 2`, `GROUP_CAR = 4` and ray member `8`. Otherwise the wheel rays start hitting marker posts. Pinned by "groups keep today's bits" (Task 6).
3. **Tyre table parity.** The registry's `tire` blocks and the derived `B` must equal the old `SURFACES` table number for number, or every golden moves. Pinned by `test/surface.test.mjs` (Task 5), proven red by mutation.
4. **Posts stay asleep.** The World's `sleep: true` must reproduce Rally's `afterStep`: untouched marker posts stay standing and asleep through spawn, two seconds of driving elsewhere, and `resetProps`. Pinned by "untouched marker posts stay asleep after spawn and after reset" (Task 8), proven red by mutation.
5. **The load settles only after the track view exists.** Today's view calls `setWorld` from `frame`. The restored `built` hook must block the settle, so a test that waits for the load sees the new track. Pinned by `test/built.browser.mjs` (Task 18), proven red by mutation.

---

## File Structure

All paths are under `$W/games/rally/`.

| File | Status | Responsibility |
|---|---|---|
| `game.config.js` | new (T2) | lion-hawk CLI config: bake (palette, renames, optimise) and build (entry, template, pwa, `RALLY_OUT`) |
| `src/defs/materials.js` | new (T2) | the registry: nine `rally-*` ground surfaces with `tire` blocks, collider materials, view looks |
| `baked/` | new (T3) | committed bake output: `phys.json`, `manifest.json`, `models/*.glb` (D2) |
| `src/surface.js` | new (T5) | registry → tyre surface entries (with `B` and `name`), surface key → material id, blend cache |
| `src/tire.js` | modify (T5) | keeps `TIRE`, `mfNorm`, `tireStep`; `SURFACES` removed |
| `src/snow.js`, `src/game/pace.js`, `src/game/autopilot.js` | modify (T5) | surfaces through `src/surface.js` |
| `src/sim.js` | modify (T6–T9) | `Sim` on the scene's World: `preStep`/`postStep`, no own Rapier world |
| `src/game.sim.js` | modify (T6) | `rallyGame({ rapier, bests })`, `defs` (materials, `phys.json`), `physics`, groups, hz 240; no default export |
| `src/game/stage.js` | modify (T6, T20) | Sim on `e.world`, `rally.vehicle`/`rally.after` systems; `ctx` kept out of state (T20) |
| `src/world/padWorld.js` | modify (T5, T7, T8) | pad colliders as inline World entries; cones as entities |
| `src/world/trackWorld.js` | modify (T5, T7, T8, T11) | heightfield via the World, then the terrain kit; gate posts and marker posts as entities |
| `src/vehicle.js` | modify (T5, T9) | car body and colliders through `world.spawn` (`massProps`, D3); `place` for resets; rays marked `lh-allow` |
| `src/render.js` | modify (T12, T13, T15, T16) | Rally's scene on `view.gfx`: car from `view.assets`, looks through the light rig, cameras moved out |
| `src/render/camera.js` | new (T16) | chase, title orbit, bumper and bonnet cameras with scratch math (no per-frame allocation) |
| `src/render/padView.js`, `src/render/trackView.js` | modify (T13–T15) | compiler materials, instanced props from the pool, baked cone geometry |
| `src/game.view.js` | modify (T12, T13, T18, T19) | `defineView({ render })`, preload, `built` hook, `data-lh-*` in place of screen classes |
| `src/main.js` | modify (T6, T12) | injects Rapier, passes the canvas |
| `index.template.html` | modify (T4, T19) | `<!--APP-->` marker; screen CSS keyed on `html[data-lh-overlays]` |
| `pwa/sw.js` | modify (T4) | `__PRECACHE__` list |
| `package.json` | modify (T4, T21, T22) | scripts `bake`/`build`/`dev` → `lion-hawk`; version 0.4.0 |
| `build.py`, `bake.mjs`, `dev.mjs`, `src/assets.json` | delete (T4, T13, T21) | retired (overview §1, B-1) |
| `test/serve.mjs` | modify (T1, T4) | `serveDir(dir)` static server; e2e bundle with `dedupe`, `<!--APP-->`, `/assets/models/*` from `baked/models` |
| `test/perf.mjs` | new (T1) | frame-rate, draw-call, program and settle-time record per scene (§8 R1, R3) |
| `test/feel.mjs`, `test/feel-baseline.json` | new (T1) | the §5.5 feel sample and its pre-swap record |
| `test/helpers/bench.mjs` | new (T6) | `benchSim(opts)` (a `Sim` on a one-scene engine) and `game(opts)` (`rallyGame` with Rapier) |
| `test/materials.test.mjs` | new (T2) | registry ids, tyre blocks, phys values |
| `test/bake.test.mjs` | new (T3) | baked vertex counts equal today's; `phys.json` hash equals the registry's |
| `test/surface.test.mjs` | new (T5) | tyre table parity, blend cache |
| `test/lh-world.test.mjs` | new (T6–T10) | World stepping, groups, materials on colliders, sleep, car mass |
| `test/lh-rules.test.mjs` | new (T10, T13) | §1.3 static rules over `src/` |
| `test/lh-checks.test.mjs` | new (T10) | `checks.determinism`, `simPurity`, `materials`, `zeroAlloc` |
| `test/camera.test.mjs`, `test/goldens/camera.json` | new (T16) | camera characterisation golden |
| `test/render.browser.mjs` | new (T12) | one canvas, no errors, settled, cars and props drawn |
| `test/built.browser.mjs` | new (T18) | the load settles only after the track view exists |
| `test/offline.browser.mjs` | new (T21) | the built game loads offline after the first visit |
| every test that builds a `Sim` or a `rallyGame` | modify (T6) | through `test/helpers/bench.mjs` |
| `test/purity.test.mjs` | modify (T5) | adds `surface.js` and `defs` to the sim roots |
| `test/e2e.browser.mjs` | modify (T19) | screen state from `data-lh-*` |
| `docs/plans/2026-10-13-phase-3j-rally-notes.md` | new (T1), then append | this plan's notes (see "Notes") |

---

## Part A: assets and sim (engine 0.8.0; Task 11 at 0.9.0)

### Task 1: Baselines before anything moves (size, settle, programs, draw calls, frame time, feel)

**Files:**
- Create: `test/perf.mjs`, `test/feel.mjs`, `test/feel-baseline.json`, `docs/plans/2026-10-13-phase-3j-rally-notes.md`
- Modify: `test/serve.mjs` (add `serveDir`)

**Interfaces:**
- Consumes: `launch` (`lion-hawk/playwright`), `headless` (`lion-hawk/test`), today's `Sim(R, opts)` and `rallyGame()`.
- Produces: `serveDir(dir) → Promise<{ url, close }>`; `node test/perf.mjs <dir>` prints `{ settleMs, scenes: { <name>: { programs, calls, frameMs, settleMs } } }`; `node test/feel.mjs [--check <file>]` prints `{ stage: { t1, t2, t3 }, verge: { grassTop, gravelTop, grassCoast, gravelCoast, offRoad: [..] } }`.

- [ ] **Step 1: Add `serveDir` to `test/serve.mjs`.** Append:

```js
// A static server over a built directory (lion-hawk build output, or the baseline page): / → index.html, everything
// else by path under dir. serveDir(dir) → { url, close }.
export async function serveDir(dir) {
  const rootDir = path.resolve(dir);
  const TYPES2 = { ...TYPES, '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(rootDir, path.normalize(p));
    if (!f.startsWith(rootDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES2[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
```

- [ ] **Step 2: Write `test/perf.mjs`.**

```js
// Frame-rate, draw-call, shader-program and load-time record (lion-hawk overview §8 R1, R3). Serves a built Rally
// directory and measures each scene under Chromium (SwiftShader here; real-iPad ?fps runs are the user's). WebGL
// calls are counted by wrapping the context prototypes, so the same script measures today's page and the engine one.
// Run: node test/perf.mjs <dir>   (prints JSON)
import fs from 'node:fs';
import path from 'node:path';
import { launch } from 'lion-hawk/playwright';
import { serveDir } from './serve.mjs';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('perf: pass a built Rally directory holding index.html'); process.exit(2); }
const KEY = 'rally-sim-settings';
const SCENES = {
  'pad-gravel': { q: '?pad&debug=running', settings: { v: 4, surface: 'gravel' } },
  'pad-snow': { q: '?pad&debug=running', settings: { v: 4, surface: 'snow' } },
  'track-summer': { q: '?debug=running', settings: { v: 4, mode: 'freeDrive', world: 'loop', seed: 'perf1', theme: 'summer' } },
  'track-winter': { q: '?debug=running', settings: { v: 4, mode: 'freeDrive', world: 'loop', seed: 'perf1', theme: 'winter' } },
};
function count() { // init script: linked programs and draw calls, per page
  const w = window; w.__perf = { programs: 0, calls: 0 };
  for (const C of [w.WebGLRenderingContext, w.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype, link = P.linkProgram;
    P.linkProgram = function (...a) { w.__perf.programs++; return link.apply(this, a); };
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const f = P[n]; if (f) P[n] = function (...a) { w.__perf.calls++; return f.apply(this, a); };
    }
  }
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const chrome = await launch(), site = await serveDir(dir), out = { dir: path.resolve(dir), scenes: {} };
async function open(q, settings) {
  const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(count);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } }, [KEY, JSON.stringify(settings)]);
  const page = await ctx.newPage();
  await page.goto(site.url + q);
  await page.waitForFunction(() => window.engine?.settled?.() === true, null, { timeout: 60000 });
  return { ctx, page, settleMs: await page.evaluate(() => performance.now()) };
}
try {
  const loads = [];
  for (let i = 0; i < 3; i++) { const o = await open('', { v: 4 }); loads.push(o.settleMs); await o.ctx.close(); }
  out.settleMs = median(loads);
  for (const [name, s] of Object.entries(SCENES)) {
    const o = await open(s.q, s.settings);
    const r = await o.page.evaluate(() => new Promise(done => {
      let n = 0, last = 0, calls0 = 0; const dts = [];
      const tick = t => {
        n++;
        if (n === 60) { calls0 = window.__perf.calls; last = t; }
        else if (n > 60) { dts.push(t - last); last = t; }
        if (n < 180) requestAnimationFrame(tick);
        else done({ programs: window.__perf.programs, calls: (window.__perf.calls - calls0) / 120, dts });
      };
      requestAnimationFrame(tick);
    }));
    out.scenes[name] = { programs: r.programs, calls: +r.calls.toFixed(1), frameMs: +median(r.dts).toFixed(2), settleMs: Math.round(o.settleMs) };
    await o.ctx.close();
  }
} finally { await chrome.close(); await site.close(); }
console.log(JSON.stringify(out, null, 1));
```

- [ ] **Step 3: Build today's page into the scratchpad.** This repeats build.py's steps, minified as build.py does, without touching `site/`:

```bash
cd $W/games/rally && mkdir -p $SCRATCH/rally-before && node -e "
const fs=require('fs');require('esbuild').buildSync({entryPoints:['src/main.js'],bundle:true,format:'iife',minify:true,loader:{'.json':'json'},outfile:'$SCRATCH/rally-before/bundle.js',logLevel:'warning'});
const b=fs.readFileSync('$SCRATCH/rally-before/bundle.js','utf8'),t=fs.readFileSync('index.template.html','utf8');
fs.writeFileSync('$SCRATCH/rally-before/index.html',t.replace('<script>/*BUNDLE*/</script>',()=>'<script>'+b.replace(/<\/script/g,'<\\\\/script')+'</script>'));
for(const f of fs.readdirSync('pwa'))if(f!=='sw.js')fs.copyFileSync('pwa/'+f,'$SCRATCH/rally-before/'+f);
" && /bin/rm -f $SCRATCH/rally-before/bundle.js
gzip -9 -c $SCRATCH/rally-before/index.html | wc -c ; wc -c < $SCRATCH/rally-before/index.html
```

Record the html bytes and gzip bytes.

- [ ] **Step 4: Run the perf baseline** (browser lock):

```bash
$BROWSER node test/perf.mjs $SCRATCH/rally-before > $SCRATCH/perf-before.json; cat $SCRATCH/perf-before.json
```

Expect JSON with four scenes, `programs > 0` and `calls > 0`. If a scene never settles (60 s timeout), stop and report it.

- [ ] **Step 5: Write `test/feel.mjs`.**

```js
// Feel sample for golden re-blessing (lion-hawk overview §5.5): stage times on three seeds through the engine path with
// the autopilot, and the verge speed samples. Prints JSON; with --check <file> compares against that record using the
// tolerances the 3j plan fixed before any physics swap (times ±3 %; speeds ±3 % or ±1 km/h; decelerations ±3 % or
// ±0.01 g) and exits 1 outside them. Run: node test/feel.mjs [--check test/feel-baseline.json]
import fs from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { Sim, DT, PAD } from '../src/sim.js';
import { rallyGame } from '../src/game.sim.js';
import { qrot } from '../src/vehicle.js';
import { generateTrack } from '../src/gen/track.js';
import { heightAt } from '../src/gen/terrain.js';
import { TrackWorld } from '../src/world/trackWorld.js';
await R.init();

function stageTime(seed) {
  const h = headless(rallyGame(), { seed: 7, args: { settings: { mode: 'stage', world: 'stage', seed, theme: 'summer', assist: true } } });
  h.tap('title.drive');
  let fin = null;
  const off = h.engine.events.on(e => { if (e.type === 'finish') fin = e.time; });
  for (let i = 0; i < 600 / DT && fin === null; i++) h.step(1, 'autopilot');
  off?.();
  if (fin === null) throw new Error(`feel: stage ${seed} never finished`);
  return fin;
}
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { fn?.(sim, i * DT); sim.step(); } };
const pad = surface => new Sim(R, { car: 'awd', surface, cones: false, assist: true, pad: { ...PAD, size: 4000 }, pos: { x: 300, y: 0.6, z: -900 } });
const roll = (sim, v) => { // as test/verge.mjs: rolling at v m/s in the lowest gear under 75 % of the redline
  const c = sim.car, f = qrot(c.body.rotation(), { x: 0, y: 0, z: 1 }), dc = c.cfg.drive, wo = v / c.cfg.radius;
  c.body.setLinvel({ x: f.x * v, y: 0, z: f.z * v }, true);
  for (const w of c.wheels) w.omega = wo;
  let g = 1;
  while (g < dc.gears.length && wo * dc.gears[g - 1] * dc.final * 60 / (2 * Math.PI) > 0.75 * dc.redline) g++;
  c.dt.gear = g; c.dt.we = wo * dc.gears[g - 1] * dc.final;
};
const topSpeed = surface => { const sim = pad(surface); run(sim, 1); let top = 0; run(sim, 30, s => { s.car.input.throttle = 1; top = Math.max(top, s.car.speed * 3.6); }); return top; };
const coast = surface => { const sim = pad(surface); run(sim, 1); roll(sim, 80 / 3.6); const v0 = sim.car.speed; run(sim, 2, s => { s.car.input.throttle = 0; }); return (v0 - sim.car.speed) / 2 / 9.81; };
function offRoad() { // test/verge.mjs 'off the road into the grass', half throttle: km/h after 4 s per spot
  const track = generateTrack('v1', { kind: 'loop', theme: 'summer' });
  const world = new TrackWorld(track), L = track.layout, loc = track.locator, T = track.terrain;
  const sim = new Sim(R, { world, car: 'awd', assist: true }), spots = [];
  for (let i = 0; i < L.n && spots.length < 4; i += 37) {
    const h = L.heading[i], ux = Math.cos(h), uz = -Math.sin(h);
    let ok = true;
    for (let d = 4; d <= 80 && ok; d += 4) if (Math.abs(loc.locate(L.x[i] + ux * d, L.z[i] + uz * d).d) < Math.min(d, 25) - 1) ok = false;
    const rise = heightAt(T, L.x[i] + ux * 60, L.z[i] + uz * 60) - T.road[i];
    if (ok && Math.abs(rise) < 3 && (!spots.length || i - spots[spots.length - 1] > 300)) spots.push(i);
  }
  return spots.map(i => {
    sim.car.reset({ x: L.x[i], y: T.road[i] + 0.6, z: L.z[i] }, L.heading[i] + Math.PI / 2);
    run(sim, 0.5); roll(sim, 60 / 3.6);
    let v4 = 0;
    run(sim, 4, s => { const c = s.car; c.input.throttle = 0.5; c.input.steer = 0; c.input.brake = 0; v4 = c.speed * 3.6; });
    return v4;
  });
}
const sample = {
  stage: Object.fromEntries(['t1', 't2', 't3'].map(s => [s, stageTime(s)])),
  verge: { grassTop: topSpeed('grass'), gravelTop: topSpeed('gravel'), grassCoast: coast('grass'), gravelCoast: coast('gravel'), offRoad: offRoad() },
};
console.log(JSON.stringify(sample, null, 1));
const i = process.argv.indexOf('--check');
if (i > 0) {
  const base = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')), bad = [];
  const within = (name, a, b, rel, abs) => { const tol = Math.max(Math.abs(b) * rel, abs); if (!(Math.abs(a - b) <= tol)) bad.push(`${name}: ${a.toFixed(3)} vs ${b.toFixed(3)} (±${tol.toFixed(3)})`); };
  for (const k of Object.keys(base.stage)) within(`stage ${k} (s)`, sample.stage[k], base.stage[k], 0.03, 0);
  within('grass top (km/h)', sample.verge.grassTop, base.verge.grassTop, 0.03, 1);
  within('gravel top (km/h)', sample.verge.gravelTop, base.verge.gravelTop, 0.03, 1);
  within('grass coast (g)', sample.verge.grassCoast, base.verge.grassCoast, 0.03, 0.01);
  within('gravel coast (g)', sample.verge.gravelCoast, base.verge.gravelCoast, 0.03, 0.01);
  if (sample.verge.offRoad.length !== base.verge.offRoad.length) bad.push(`offRoad spots: ${sample.verge.offRoad.length} vs ${base.verge.offRoad.length}`);
  else base.verge.offRoad.forEach((b, k) => within(`off-road spot ${k} (km/h)`, sample.verge.offRoad[k], b, 0.03, 1));
  if (bad.length) { console.error('feel: outside tolerance\n  ' + bad.join('\n  ')); process.exit(1); }
  console.error('feel: within tolerance');
}
```

- [ ] **Step 6: Record the feel baseline.**

```bash
$UNIT node test/feel.mjs > $SCRATCH/feel.json && cp $SCRATCH/feel.json test/feel-baseline.json && cat test/feel-baseline.json
$UNIT node test/feel.mjs --check test/feel-baseline.json
```

Expect three finite stage times (roughly 100–250 s), `grassTop` 70–100 and `gravelTop` 150–250. The `--check` run against itself must print `feel: within tolerance`. Prove the checker is red: edit `test/feel-baseline.json` `stage.t1` by +10 %, run `--check`, and expect exit 1 naming `stage t1`. Then restore the file from `$SCRATCH/feel.json` (it is not committed yet).

- [ ] **Step 7: Start the notes file** `docs/plans/2026-10-13-phase-3j-rally-notes.md`:

```markdown
# Phase 3j (Rally): notes

## Baselines (Task 1, four43 <sha>, engine <version>)
- Single-file page: <html bytes> B, <gzip bytes> B gzip.
- perf (SwiftShader, 1280×720): <paste $SCRATCH/perf-before.json scenes table: programs, calls, frameMs, settleMs>; load settle median <ms>.
- Feel baseline: test/feel-baseline.json (<paste stage times and verge samples>).

## Golden re-blessings
| Task | Cause | Feel table | Commit |
|---|---|---|---|

## Decisions

## Contract issues

## Field note candidates
```

- [ ] **Step 8: Run the unit suite** (nothing has changed behaviour): `$UNIT npm test`. Expect PASS.
- [ ] **Step 9: Commit:** `git add test/perf.mjs test/feel.mjs test/feel-baseline.json test/serve.mjs docs/plans/2026-10-13-phase-3j-rally-notes.md && git commit -m "test(rally): perf, size and feel baselines before the phase 3 migration"`

---

### Task 2: Game config and the material registry

**Files:**
- Create: `game.config.js`, `src/defs/materials.js`, `test/materials.test.mjs`

**Interfaces:**
- Consumes: `defineMaterials(table, { pairs }) → registry` with `get`, `has`, `ids`, `index`, `byIndex`, `collider`, `hash` (overview §4.2); the game config shape (§4.3).
- Produces: the default export of `src/defs/materials.js` (the registry); `rally-<key>` ids for the nine surface keys `tarmac, hardpack, gravel, grass, sand, mud, packed, snowbank, ice`; collider ids `rally-ground`, `car-hull`, `car-cabin`, `marker`, `gate-post`, `cone`; look ids `rally-road`, `car-body`, `tyre`, `gate-banner`, `pad-prop`, `pad-stripe`.

**Decision (judgment):** game ids never reuse a base id (`gravel`, `grass`, `mud`, `ice` are base materials). Surfaces are `rally-<key>`. This is listed as a contract issue. Every Rally material sets `phys.friction` and `phys.restitution` explicitly, so base-library values can never leak into feel.

- [ ] **Step 1: Failing test** `test/materials.test.mjs`:

```js
// Rally's material registry (lion-hawk M-1…M-3, overview §4.2): the old tire.js SURFACES table lives in the `tire` blocks,
// colliders keep today's friction and restitution, and every id the game uses resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';

// The pre-phase-3 SURFACES table, copied verbatim (src/tire.js at e03ed71).
const OLD = {
  tarmac:   { name: 'Tarmac',        mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0 },
  hardpack: { name: 'Dirt',          mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
  gravel:   { name: 'Loose gravel',  mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
  grass:    { name: 'Grass',         mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2 },
  sand:     { name: 'Sand',          mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14 },
  mud:      { name: 'Mud',           mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18 },
  packed:   { name: 'Packed snow',   mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0 },
  snowbank: { name: 'Snowbank',      mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1 },
  ice:      { name: 'Ice',           mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
};
export { OLD };

test('every surface key has a rally-<key> material whose tire block is the old SURFACES entry', () => {
  for (const [k, s] of Object.entries(OLD)) {
    const m = MATERIALS.get(`rally-${k}`), { name, ...tire } = s;
    assert.deepEqual({ ...m.tire }, tire, k);
    assert.equal(m.game.name, name, k);
  }
});
test('collider materials keep today\'s friction and restitution', () => {
  const phys = id => ({ friction: MATERIALS.get(id).phys.friction, restitution: MATERIALS.get(id).phys.restitution });
  assert.deepEqual(phys('rally-ground'), { friction: 0.8, restitution: 0 });
  assert.deepEqual(phys('car-hull'), { friction: 0.3, restitution: 0.1 });
  assert.deepEqual(phys('car-cabin'), { friction: 0.45, restitution: 0.1 });
  assert.deepEqual(phys('marker'), { friction: 0.9, restitution: 0 });
  assert.deepEqual(phys('gate-post'), { friction: 0.6, restitution: 0 });
  assert.deepEqual(phys('cone'), { friction: 0.6, restitution: 0 });
  for (const id of ['marker', 'cone']) assert.ok(MATERIALS.density(id) > 0, `${id} needs a density (dynamic bodies)`);
});
test('the view ids resolve and no Rally id shadows a base material', () => {
  for (const id of ['rally-road', 'car-body', 'tyre', 'gate-banner', 'pad-prop', 'pad-stripe']) assert.ok(MATERIALS.has(id), id);
  const game = MATERIALS.ids.slice(MATERIALS.ids.indexOf('air') + 1);
  for (const id of ['gravel', 'grass', 'mud', 'ice']) assert.equal(game.includes(id), false, id);
  assert.match(MATERIALS.hash, /^[0-9a-f]{8}$/);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../src/defs/materials.js'`): `$UNIT node --test --test-concurrency=4 test/materials.test.mjs`
- [ ] **Step 3: Write `src/defs/materials.js`.**

```js
// Rally's material registry (lion-hawk M-1…M-3, phase 3). Road and verge surfaces carry the tyre model's Magic Formula
// parameters in `tire` (the old src/tire.js SURFACES table, moved) and their display name in `game.name` (D6);
// colliders carry friction and restitution (√f with Multiply, max restitution: M-8, M-9); `look` feeds the material
// compiler. Ids are 'rally-<surface key>' so a surface never shadows a base material. Every entry states phys
// friction and restitution, so no base-library value reaches the feel.
import { defineMaterials } from 'lion-hawk/sim';

const ground = (base, name, tire, look = {}) => ({ extends: base, phys: { friction: 0.8, restitution: 0 }, tire, look, game: { name } });

export default defineMaterials({
  'rally-tarmac':   ground('asphalt', 'Tarmac',       { mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0 }, { roughness: 0.85, metalness: 0 }),
  'rally-hardpack': ground('dirt',    'Dirt',         { mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 }, { roughness: 0.95, metalness: 0 }),
  'rally-gravel':   ground('gravel',  'Loose gravel', { mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 }, { roughness: 0.95, metalness: 0 }),
  'rally-grass':    ground('grass',   'Grass',        { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2 }),
  'rally-sand':     ground('dirt',    'Sand',         { mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14 }),
  'rally-mud':      ground('mud',     'Mud',          { mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18 }),
  'rally-packed':   ground('snow',    'Packed snow',  { mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0 }, { roughness: 0.95, metalness: 0 }),
  'rally-snowbank': ground('snow',    'Snowbank',     { mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1 }),
  'rally-ice':      ground('ice',     'Ice',          { mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 }, { roughness: 0.25, metalness: 0 }),
  // The heightfield and the pad's ground boxes (today's friction 0.8); wheels read the surfaces above, not this.
  'rally-ground': { extends: 'dirt', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 1, metalness: 0 } },
  'rally-road':   { extends: 'gravel', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 0.92, metalness: 0 } },
  // The car: drawn shell, and the two inline colliders (low friction so a nose strike skids; mass comes from cars.js, D3).
  'car-body':  { extends: 'steel', phys: { friction: 0.3, restitution: 0.1 }, look: { roughness: 0.45, metalness: 0.15 } },
  'car-hull':  { extends: 'steel', phys: { friction: 0.3, restitution: 0.1 } },
  'car-cabin': { extends: 'steel', phys: { friction: 0.45, restitution: 0.1 } },
  tyre:        { extends: 'rubber', phys: { friction: 0.9, restitution: 0 }, look: { roughness: 0.8, metalness: 0 } },
  // Props.
  cone:          { extends: 'plastic', phys: { friction: 0.6, restitution: 0 }, look: { roughness: 0.6, metalness: 0 } },
  marker:        { extends: 'plastic', phys: { friction: 0.9, restitution: 0 }, look: { roughness: 0.55, metalness: 0 } },
  'gate-post':   { extends: 'wood', phys: { friction: 0.6, restitution: 0 }, look: { color: '#2b2d31', roughness: 0.6, metalness: 0 } },
  'gate-banner': { extends: 'fabric', phys: { friction: 0.6, restitution: 0 }, look: { color: '#dedede', roughness: 0.7, metalness: 0 } },
  'pad-prop':    { extends: 'wood', phys: { friction: 0.8, restitution: 0 }, look: { color: '#9a8f80', roughness: 0.9, metalness: 0 } },
  'pad-stripe':  { extends: 'plastic', phys: { friction: 0.8, restitution: 0 }, look: { color: '#d8b13a', roughness: 0.7, metalness: 0 } },
});
```

- [ ] **Step 4: Write `game.config.js`.**

```js
// Rally's lion-hawk CLI config (Node only; overview §4.3, §5.4). The Kenney Car Kit GLBs carry one textured material,
// `colormap`: the bake samples it into vertex colours (palette: 'vertex', as bake.mjs did) and renames it per model.
// Rally's car colliders are inline (the vehicle builds them) and the track is procedural, so the sidecars only feed
// checks.materials. weld stays off so every baked part keeps today's vertex count (the parity test, overview §5.3-1).
export default {
  id: 'rally', site: 'rally', outEnv: 'RALLY_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',
    palette: 'vertex',
    models: {
      'hatchback-sports': { rename: { materials: { colormap: 'car-body' } } },
      'sedan-sports': { rename: { materials: { colormap: 'car-body' } } },
      'wheel-racing': { rename: { materials: { colormap: 'tyre' } } },
      cone: { rename: { materials: { colormap: 'cone' } } },
    },
    optimise: { meshopt: true, quantize: true, weld: false, prune: true, dedupe: true },
  },
  build: { entry: 'src/main.js', template: 'index.template.html', pwa: 'pwa' },
};
```

- [ ] **Step 5: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/materials.test.mjs`. If 3b's validation rejects a field (for example `tire` keys or `look.color` as a `'#rrggbb'` string), stop. Record it under "Contract issues" in the notes. Do not invent a different shape.
- [ ] **Step 6: Mutation.** Change `rally-gravel`'s `mu` to `0.81`, run, and expect the first test to FAIL on `gravel`. Restore it.
- [ ] **Step 7: Commit:** `git add game.config.js src/defs/materials.js test/materials.test.mjs && git commit -m "feat(rally): material registry with the tyre surfaces, and the lion-hawk game config"`

---

### Task 3: Bake the models; commit `baked/`; parity and sidecar checks

**Files:**
- Create: `baked/phys.json`, `baked/manifest.json`, `baked/models/{cone,hatchback-sports,sedan-sports,wheel-racing}.glb` (generated), `test/bake.test.mjs`
- Modify: `package.json` (`"bake": "lion-hawk bake"`)

**Interfaces:**
- Consumes: `lion-hawk bake [--check]` (§4.3); `lion-hawk/bake` (to resolve the engine's gltf-transform copies); `phys.json` `{ v, engine, materials, models }` and `manifest.json` `{ v, models: { <id>: { glb, anim, bytes, sha256 } } }`.
- Produces: `baked/phys.json` and `baked/manifest.json`. Task 6 hands `phys.json` to the game as `defs.models` (the sim imports it with `type: 'json'`).

- [ ] **Step 1: Failing test** `test/bake.test.mjs`:

```js
// The bake (lion-hawk overview §5.3-1): every Kenney model is baked, each mesh part keeps today's vertex count (the
// counts src/assets.json held at e03ed71), and phys.json was baked against today's registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MATERIALS from '../src/defs/materials.js';

const COUNTS = { // node name → POSITION count, from src/assets.json at e03ed71
  'hatchback-sports': { 'wheel-front-right': 528, 'wheel-front-left': 528, 'wheel-back-right': 528, 'wheel-back-left': 528, body: 1597 },
  'sedan-sports': { 'wheel-back-right': 528, body: 1078, spoiler: 78, 'wheel-back-left': 528, 'wheel-front-left': 528, 'wheel-front-right': 528 },
  'wheel-racing': { 'wheel-racing': 528 },
  cone: { cone: 288 },
};
// The engine's own gltf-transform and meshopt copies (one core across extensions): resolved from lion-hawk/bake.
const req = createRequire(fileURLToPath(import.meta.resolve('lion-hawk/bake')));
const load = name => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptDecoder } = await load('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const manifest = json('../baked/manifest.json'), phys = json('../baked/phys.json');

test('every Kenney model is baked, no animation tables', () => {
  assert.deepEqual(Object.keys(manifest.models).sort(), Object.keys(COUNTS).sort());
  for (const m of Object.values(manifest.models)) assert.equal(m.anim, null);
});
for (const [model, parts] of Object.entries(COUNTS)) {
  test(`${model}: baked part vertex counts equal today's`, async () => {
    const doc = await io.read(fileURLToPath(new URL(`../baked/${manifest.models[model].glb}`, import.meta.url)));
    const got = {};
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh();
      if (mesh) got[n.getName()] = mesh.listPrimitives().reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0);
    }
    assert.deepEqual(got, parts);
    for (const mat of doc.getRoot().listMaterials()) assert.ok(MATERIALS.has(mat.getName()), mat.getName());
  });
}
test('phys.json was baked against this registry', () => {
  assert.equal(phys.materials, MATERIALS.hash);
  assert.deepEqual(Object.keys(phys.models).sort(), Object.keys(COUNTS).sort());
});
test('today\'s assets.json counts are the table above (until the view retires it)', () => {
  const a = json('../src/assets.json');
  for (const [m, parts] of Object.entries(COUNTS)) assert.deepEqual(Object.fromEntries(Object.entries(a[m]).map(([k, v]) => [k, v.p.length / 3])), parts, m);
});
```

- [ ] **Step 2: Run, expect FAIL** (`ENOENT … baked/manifest.json`): `$UNIT node --test --test-concurrency=4 test/bake.test.mjs`
- [ ] **Step 3: Bake.** `cd $W/games/rally && npx lion-hawk bake`. Then `$UNIT npx lion-hawk bake --check`; expect exit 0. `git status baked/` should list the four GLBs, `phys.json` and `manifest.json`. Record the GLB bytes (from the manifest) in the notes.
- [ ] **Step 4: `package.json` scripts:** `"bake": "lion-hawk bake"`. `bake.mjs` stays until Task 13, because the view still reads `assets.json`.
- [ ] **Step 5: (none; `defs.models` is wired in Task 6.)**
- [ ] **Step 6: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/bake.test.mjs`.
  - If a count differs, the bake merged or split vertices. Check `optimise.weld` and `dedupe`, then rebake. Do not change the table.
  - If `req.resolve` cannot load an ESM-only package, swap `req.resolve(name)` for `import.meta.resolve(name, import.meta.resolve('lion-hawk/bake'))` (Node ≥ 22 two-argument resolve). Record the swap.
- [ ] **Step 7: Mutation.** Edit `src/defs/materials.js` (`rally-ground` restitution 0 → 0.01). Run `test/bake.test.mjs`, and expect "phys.json was baked against this registry" to FAIL. Restore it.
- [ ] **Step 8: Whole suite, goldens bit-exact:** `$UNIT npm test`. Sidecars are informational for Rally: no entity uses a `model` with sidecar colliders.
- [ ] **Step 9: Commit:** `git add baked test/bake.test.mjs package.json && git commit -m "feat(rally): bake the Kenney models with lion-hawk bake; baked/ committed with parity tests"`

---

### Task 4: Builds through `lion-hawk build` (build.py retired)

**Files:**
- Modify: `index.template.html`, `pwa/sw.js`, `test/serve.mjs`, `package.json`
- Delete: `build.py`

**Interfaces:**
- Consumes: `lion-hawk build --out <dir>`, which writes `index.html` (the template's `<!--APP-->` replaced by the bundle as an inline `<script>`), `assets/models/*`, the PWA files and the stamped `sw.js` (`__VERSION__`, `__PRECACHE__`); `dedupe({ root })` (`lion-hawk/build`).
- Produces: `serveRally({ entry })`, unchanged in signature. It now also serves `/assets/models/*` from `baked/models/`. The template marker is `<!--APP-->`.

**Contract issue (minor):** §4.3 says "template `<!--APP-->`" but not what replaces it. This plan assumes an inline `<script>` holding the bundle, so the template has no surrounding `<script>` tag. If 3d expects the marker inside a script tag, move it there and record the change.

- [ ] **Step 1: Failing check.** `RALLY_OUT=$SCRATCH/rally-build npx lion-hawk build` must fail: `build.py`-era template, no `<!--APP-->`. Run it and expect a non-zero exit or a page without the bundle. `grep -c "rallyGame\|lion-hawk" $SCRATCH/rally-build/index.html` gives 0.
- [ ] **Step 2: Template.** In `index.template.html`, replace `<script>/*BUNDLE*/</script>` with `<!--APP-->`.
- [ ] **Step 3: `pwa/sw.js`.**
  - Header comment: "Offline support. The page plus every file `lion-hawk build` lists (manifest, icons, `assets/models/*`) is precached".
  - `const PRECACHE = __PRECACHE__;` in place of the literal list.
- [ ] **Step 4: `test/serve.mjs` `serveRally`.**
  - Import `dedupe` from `lion-hawk/build`.
  - Bundle with `plugins: [dedupe({ root })]`.
  - Build the page with `.replace('<!--APP-->', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`)`.
  - Serve models: before the PWA lookup, add

    ```js
    if (p.startsWith('/assets/models/')) { const m = path.join(root, 'baked/models', path.basename(p)); if (fs.existsSync(m)) { res.writeHead(200, { 'content-type': p.endsWith('.glb') ? 'model/gltf-binary' : 'application/json' }).end(fs.readFileSync(m)); return; } }
    ```

  - Update the header comment.
- [ ] **Step 5: `package.json`.** Scripts: `"build": "lion-hawk build"`; `"test:e2e": "node --test test/e2e.browser.mjs test/render.browser.mjs test/built.browser.mjs"` (the last two files arrive in Tasks 12 and 18; until then keep only `e2e.browser.mjs`); `"test:offline": "node --test test/offline.browser.mjs"`. `git rm build.py`.
- [ ] **Step 6: Build and check:** `cd $W/games/rally && RALLY_OUT=$SCRATCH/rally-build npx lion-hawk build`. Expect a size report. Check that:
  - `$SCRATCH/rally-build/index.html` holds the bundle;
  - `assets/models/*.glb` exist;
  - `sw.js` has no `__PRECACHE__` or `__VERSION__` left (`grep -c __ $SCRATCH/rally-build/sw.js` → 0).
  - `npx lion-hawk build` without `--out` and without `RALLY_OUT` exits 2 with `build: pass --out or set $RALLY_OUT`.
- [ ] **Step 7: Browser suites** (one at a time): `$BROWSER node --test test/e2e.browser.mjs`, then `$BROWSER node test/mobile.mjs`. Expect today's counts (e2e 4/4, mobile all checks).
- [ ] **Step 8: Unit suite, goldens bit-exact:** `$UNIT npm test`.
- [ ] **Step 9: Commit:** `git add -A index.template.html pwa/sw.js test/serve.mjs package.json build.py && git commit -m "build(rally): lion-hawk build replaces build.py; service worker precaches the models"`

---

### Task 5: Tyre surfaces from the registry (SURFACES retired; goldens bit-exact)

**Files:**
- Create: `src/surface.js`, `test/surface.test.mjs`
- Modify: `src/tire.js`, `src/vehicle.js`, `src/snow.js`, `src/world/padWorld.js`, `src/world/trackWorld.js`, `src/game/pace.js`, `src/game/autopilot.js`, `src/gen/surfaces.js` (comment only), `test/verge.mjs`, `test/snow.mjs`, `test/track.mjs`, `test/purity.test.mjs`

**Interfaces:**
- Consumes: the registry (`ids`, `get`, `index`).
- Produces: `src/surface.js` with `materialOf(key) → 'rally-<key>'`, `surface(id) → entry`, `surfaceOfKey(key) → entry` and `blendSurface(cache, ia, ib, q) → entry`. An entry is a frozen object `{ id, name, mu, C, kp, ap, crr, drag, B }`. A blended entry is plain and cached per `(a, b, q)`.

- [ ] **Step 1: Failing test** `test/surface.test.mjs`:

```js
// Tyre surfaces come from the registry (lion-hawk M-10 phase 3; SURFACES retired): the same numbers, B derived once,
// blends cached so the per-wheel lookup stays allocation-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as TIRE from '../src/tire.js';
import { surfaceOfKey, materialOf, surface, blendSurface } from '../src/surface.js';
import { OLD } from './materials.test.mjs';

test('tire.js no longer exports SURFACES', () => { assert.equal('SURFACES' in TIRE, false); });
test('every surface entry equals the old table, B included, bit for bit', () => {
  for (const [k, s] of Object.entries(OLD)) {
    const e = surfaceOfKey(k);
    for (const f of ['name', 'mu', 'C', 'kp', 'ap', 'crr', 'drag']) assert.equal(e[f], s[f], `${k}.${f}`);
    assert.equal(e.B, Math.tan(Math.PI / (2 * s.C)), `${k}.B`);
    assert.equal(e.id, materialOf(k));
    assert.equal(surface(materialOf(k)), e, 'one entry per material');
  }
});
test('a material without a tire block throws, naming it', () => {
  assert.throws(() => surface('marker'), /rally: material 'marker' has no tire block/);
});
test('blends: same arithmetic as the old TrackWorld cache, one object per (a, b, tenth)', () => {
  const cache = new Map(), A = surfaceOfKey('gravel'), B = surfaceOfKey('hardpack');
  const e = blendSurface(cache, A, B, 3);
  for (const k of ['mu', 'C', 'kp', 'ap', 'crr', 'drag']) assert.equal(e[k], A[k] + (B[k] - A[k]) * 0.3, k);
  assert.equal(e.B, Math.tan(Math.PI / (2 * e.C)));
  assert.equal(e.name, 'Loose gravel→Dirt');
  assert.equal(blendSurface(cache, A, B, 3), e);
  assert.equal(blendSurface(cache, A, B, 0), A);
  assert.equal(blendSurface(cache, A, B, 10), B);
  assert.equal(blendSurface(cache, A, A, 4), A);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../src/surface.js'`): `$UNIT node --test --test-concurrency=4 test/surface.test.mjs`
- [ ] **Step 3: Write `src/surface.js`.**

```js
// Tyre surfaces from the material registry (lion-hawk M-10, phase 3; replaces tire.js SURFACES). An entry is a
// material's `tire` block plus its display name (`game.name`) and the Magic Formula B (peak at rho = 1), derived once
// per material at load. Rally's surface keys (gen/surfaces.js, the pad setting) name materials 'rally-<key>'.
import MATERIALS from './defs/materials.js';

const BLEND_KEYS = ['mu', 'C', 'kp', 'ap', 'crr', 'drag'];
const BY_INDEX = [];
for (const id of MATERIALS.ids) {
  const m = MATERIALS.get(id), t = m.tire;
  if (!t) continue;
  const s = { id, name: m.game?.name ?? id, mu: t.mu, C: t.C, kp: t.kp, ap: t.ap, crr: t.crr, drag: t.drag };
  s.B = Math.tan(Math.PI / (2 * s.C));
  BY_INDEX[MATERIALS.index(id)] = Object.freeze(s);
}

export const materialOf = key => `rally-${key}`;
export function surface(id) {
  const s = BY_INDEX[MATERIALS.index(id)];
  if (!s) throw new Error(`rally: material '${id}' has no tire block`);
  return s;
}
export const surfaceOfKey = key => surface(materialOf(key));

// The old TrackWorld blend: a → b at q tenths, cached per (a, b, q) so a wheel lookup allocates only the first time.
export function blendSurface(cache, A, B, q) {
  if (A === B || q === 0) return A;
  if (q === 10) return B;
  const key = `${A.id}|${B.id}|${q}`;
  let e = cache.get(key);
  if (!e) {
    const w = q / 10;
    e = { id: null, name: `${A.name}→${B.name}` };
    for (const k of BLEND_KEYS) e[k] = A[k] + (B[k] - A[k]) * w;
    e.B = Math.tan(Math.PI / (2 * e.C));
    cache.set(key, e);
  }
  return e;
}
```

Note: the old cache key was built from surface keys and the new one from material ids. Both give a one-to-one key, so the values and the arithmetic order are unchanged.

- [ ] **Step 4: Switch the callers.**
  - `src/tire.js`: delete the `SURFACES` table, the `for (const s of Object.values(SURFACES)) s.B = …` line and the "Surface table…" comment. Keep `mfNorm`, `TIRE` and `tireStep`. Update the header comment: "Surfaces come from the material registry (src/surface.js)."
  - `src/vehicle.js`: `import { tireStep } from './tire.js'; import { surfaceOfKey } from './surface.js';`. Replace both `SURFACES.gravel` with `surfaceOfKey('gravel')`.
  - `src/snow.js`: `import { surfaceOfKey } from './surface.js';`. Then `export const FRESH = { ...surfaceOfKey('packed'), name: 'Fresh snow' };` and `blend(surfaceOfKey('packed'), surfaceOfKey('ice'), i / LEVELS, …)`.
  - `src/world/padWorld.js`: `import { surfaceOfKey } from '../surface.js';` and `surfaceAt() { return surfaceOfKey(this.surfaceKey === 'snow' ? 'packed' : this.surfaceKey); }`.
  - `src/world/trackWorld.js`: `import { surfaceOfKey, blendSurface } from '../surface.js';`. Delete `BLEND_KEYS`. Replace the body of `surfaceAt` after `const q = Math.round(r.t * 10);` with:

    ```js
    return blendSurface(this.blends, surfaceOfKey(a), surfaceOfKey(b), q);
    ```

  - `src/game/pace.js`: `import { surfaceOfKey } from '../surface.js';` and `export const muAt = (track, s) => surfaceOfKey(roadSurfaceAt(track.surfaces, s).road).mu;`.
  - `src/game/autopilot.js`: `import { surfaceOfKey } from '../surface.js';` and `const mu = surfaceOfKey(roadSurfaceAt(track.surfaces, s).road).mu;`.
  - `src/gen/surfaces.js` line 3 comment: "Keys are surface keys (src/surface.js: material 'rally-<key>')".
  - `test/verge.mjs`, `test/snow.mjs`, `test/track.mjs`: replace `import { SURFACES } from '../src/tire.js';` with `import { surfaceOfKey } from '../src/surface.js';`, and every `SURFACES[x]` / `SURFACES.x` with `surfaceOfKey(x)` / `surfaceOfKey('x')`. In `track.mjs:116` the identity check becomes `=== surfaceOfKey('grass')`. `surfaceOfKey` returns the same frozen object every call, so the check still holds.
  - `test/purity.test.mjs`: add `'surface.js'` and `'defs'` to `SIM`.
- [ ] **Step 5: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/surface.test.mjs test/purity.test.mjs`
- [ ] **Step 6: Mutation (Review Focus 3).** In `src/surface.js`, compute `s.B = Math.tan(Math.PI / (2.0001 * s.C))`. Run `test/surface.test.mjs` and `test/golden.test.mjs`. Expect both to FAIL: B mismatch, then the golden checksum. Restore the line.
- [ ] **Step 7: Whole suite, goldens bit-exact:** `$UNIT npm test`. Expect PASS with **no** `LH_BLESS`. A golden diff is a bug here (constraint 15).
- [ ] **Step 8: Commit:** `git add -A src test && git commit -m "refactor(rally): tyre surfaces from the material registry; SURFACES retired"`

---

### Task 6: The Sim on the scene's World (Rapier from the engine; goldens bit-exact)

**Files:**
- Create: `test/helpers/bench.mjs`, `test/lh-world.test.mjs`
- Modify: `src/sim.js`, `src/game.sim.js`, `src/game/stage.js`, `src/main.js`, and every test that constructs `Sim` or `rallyGame`: `test/{dbg,feel,game,golden,golden-stage,markers,physics,sim.test,snow,track,verge,wild}.mjs`, `test/flow.test.mjs`, `test/devices.test.mjs`

**Interfaces:**
- Consumes: `defineGame({ physics: { rapier, gravity, groups }, defs: { materials } })` (§4.1), the World made on main-scene enter (`e.world`, `ctx.world`), `world.rapier`, `world.R`, `world.clear()`, `world.groups.mask` (§4.4), the stages `lh.physics.step` and `lh.physics.events` (§4.4).
- Produces:
  - `rallyGame({ rapier, bests }) → game` (throws without `rapier`);
  - `GROUPS = ['ground', 'prop', 'car', 'ray']`;
  - `rallyPhysics(rapier) → physics config`;
  - `HZ = 240` (from `src/sim.js`);
  - `new Sim(lh, opts)`, with `sim.preStep()`, `sim.postStep()`, `sim.step()` (only with `opts.step`) and `sim.phys` (getter → `lh.rapier`);
  - test helpers `benchSim(opts) → sim` and `game(opts) → rallyGame({ rapier: R, ...opts })`.

**Decision:** Rapier is injected (`rallyGame({ rapier })`). Constraint 1 forbids a Rapier import in the sim tree, although overview §4.1's example shows one. This is listed as a contract issue. In this task Rally's colliders are still made raw on `world.rapier`. Nothing is spawned yet, so creation order, timestep and parameters are unchanged and the goldens must not move.

- [ ] **Step 1: Failing test** `test/lh-world.test.mjs`:

```js
// Rally on the scene-owned World (lion-hawk §4.4, §4.5): the engine owns the Rapier world; Rally's vehicle runs before
// lh.physics.step; collision groups keep today's bits.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim, game } from './helpers/bench.mjs';
import { headless } from 'lion-hawk/test';
import { DT, HZ } from '../src/sim.js';
await R.init();

test('rallyGame needs the initialised Rapier module (D9)', () => {
  assert.throws(() => game({ rapier: undefined }), /rallyGame: pass \{ rapier \}/);
  assert.equal(game().sim.hz, HZ); assert.equal(1 / HZ, DT);
});
test('a raw body on the World\'s Rapier world falls under the engine step (Review Focus 1)', () => {
  const sim = benchSim({ car: 'awd', cones: false, assist: true });
  const b = sim.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(500, 50, 500));
  for (let i = 0; i < HZ; i++) sim.step();
  assert.ok(b.translation().y < 50 - 4, `fell ${50 - b.translation().y} m in 1 s`);
});
test('groups keep today\'s bits: ground 1, prop 2, car 4, ray 8 (Review Focus 2)', () => {
  const sim = benchSim({ car: 'awd', cones: false });
  const g = sim.lh.groups;
  assert.deepEqual([g.ground, g.prop, g.car, g.ray], [1, 2, 4, 8]);
  assert.equal(g.mask(['ray'], ['ground']), (0x0008 << 16) | 0x0001);
});
test('the stage builds its Sim on the engine\'s World and steps it from the schedule', () => {
  const h = headless(game(), { args: { pad: true } });
  const s = h.engine.scene.state;
  assert.equal(s.sim.lh, h.engine.world);
  assert.equal(s.sim.phys, h.engine.world.rapier);
  const names = h.engine.schedule().map?.(x => x.name ?? x) ?? JSON.stringify(h.engine.schedule());
  const text = JSON.stringify(names);
  assert.ok(text.indexOf('rally.vehicle') < text.indexOf('lh.physics.step'), text);
  assert.ok(text.indexOf('lh.physics.step') < text.indexOf('rally.after'), text);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module './helpers/bench.mjs'`): `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 3: `src/sim.js`.** Replace the class and its imports:

```js
// Simulation: a World (test pad or generated track) and the car, on the scene's lion-hawk World, which owns the Rapier
// world and steps it (overview §4.4). Rally's vehicle runs before Rapier's step (system rally.vehicle, preStep) and the
// clock after it (rally.after, postStep).
import { Vehicle, DT } from './vehicle.js';
import { CARS } from './cars.js';
import { SnowField } from './snow.js';
import { PadWorld } from './world/padWorld.js';

export { PAD, buildPad, coneLayout } from './world/padWorld.js';
export const HZ = 240; // 1 / HZ === DT exactly, so the World's timestep is today's

export class Sim {
  // lh: the scene's World. opts: { world, car, assist, pos, yaw, step } plus, when no world is given, the pad options
  // { surface, cones, pad }. opts.step advances one engine step (test/helpers/bench.mjs); the stage never calls step().
  constructor(lh, opts = {}) {
    this.lh = lh;
    this.R = lh.R;
    this.assist = opts.assist ?? true;
    this.time = 0;
    this.carId = opts.car || 'awd';
    this.stepper = opts.step ?? null;
    this.world = null;
    this.setWorld(opts.world || new PadWorld({ pad: opts.pad, cones: opts.cones, surface: opts.surface }), opts.pos, opts.yaw);
  }

  get phys() { return this.lh ? this.lh.rapier : null; }

  // The engine disposes the World after the stage's exit ([S-3]); this only drops the references. Idempotent.
  dispose() { this.lh = null; this.car = null; }

  // Swaps worlds: world.clear() drops every body and collider (a new Rapier world, overview §4.4), then the new world
  // and the car at its spawn (or pos/yaw). The first build uses the fresh World as it is.
  setWorld(world, pos, yaw) {
    if (this.world) this.lh.clear();
    this.car = null;
    this.world = world;
    world.build(this.R, this.lh.rapier);
    this.setSurface(world.surfaceKey);
    this.setCar(this.carId, pos, yaw);
  }

  get props() { return this.world.props; }
  get cones() { return this.world.props; } // pre-World alias
  get surfaceKey() { return this.world.surfaceKey; }

  setSurface(key) {
    if (this.world.kind !== 'pad') { this.snow = null; return; }
    this.world.setSurface(key);
    if (key === 'snow') { this.snow = new SnowField(); this.snow.groundHandle = this.world.groundCollider.handle; }
    else this.snow = null;
  }

  surfaceAt(x, z, collider) { return this.world.surfaceAt(x, z, collider); }

  spawnPos(cfg) {
    const sp = this.world.spawn;
    return { x: sp.x, y: sp.y ?? cfg.comHeight + 0.05, z: sp.z };
  }

  setCar(id, pos, yaw) {
    if (this.car) this.lh.rapier.removeRigidBody(this.car.body);
    const cfg = CARS[id], g = this.lh.groups;
    this.car = new Vehicle(this.R, this.lh.rapier, cfg, {
      pos: pos || this.spawnPos(cfg), yaw: yaw ?? this.world.spawn.yaw, assist: this.assist,
      surfaceAt: (x, z, c) => this.surfaceAt(x, z, c), snow: () => this.snow,
      rayGroups: g.mask(['ray'], ['ground']),
    });
    this.car.colliders.forEach((c) => c.setCollisionGroups(g.mask(['car'], ['ground', 'prop', 'car', 'ray'])));
    this.carId = id;
  }

  setAssist(on) { this.assist = on; this.car.assist = on; }

  resetCar() {
    this.car.reset(this.spawnPos(this.car.cfg), this.world.spawn.yaw);
    if (this.snow) this.snow.clear();
    this.world.resetProps();
  }

  preStep() { this.car.step(); }
  postStep() { this.world.afterStep?.(); this.time += DT; }

  // One engine step; only for a Sim made with opts.step (test/helpers/bench.mjs).
  step() {
    if (!this.stepper) throw new Error('Sim.step: this Sim is stepped by its engine; build it with benchSim() to step it alone');
    this.stepper();
  }
}

export { DT };
```

Today `padWorld.js` uses `groups(…)` and `GROUP_*` itself for the cones, the ground and the props. Those stay internal until Task 7. Only `sim.js` stops re-exporting them. Check with `grep -rn "GROUP_\|groups" test src --include=*.js --include=*.mjs` that nothing else imports them from `sim.js`. Fix any hit to import from `../src/world/padWorld.js`.

- [ ] **Step 4: `src/game.sim.js`.** Drop `import R …` and add:

```js
import MATERIALS from './defs/materials.js';
import PHYS from '../baked/phys.json' with { type: 'json' };
import { HZ } from './sim.js';

// Collision groups: declaration order gives today's bits (ground 1, prop 2, car 4, ray 8; the wheel rays are members of
// 'ray' and see only 'ground').
export const GROUPS = ['ground', 'prop', 'car', 'ray'];
export const rallyPhysics = rapier => ({ rapier, gravity: [0, -9.81, 0], groups: GROUPS });
```

Change `rallyGame`:

```js
export function rallyGame({ rapier, bests = makeBests() } = {}) {
  if (!rapier) throw new Error('rallyGame: pass { rapier } (the initialised @dimforge/rapier3d-compat module, D9)');
  const { scene: stage, api } = makeStage({ bests });
  ...
  return defineGame({
    id: 'rally', sim: { hz: HZ, maxCatchUp: 12, maxFrame: 0.1 }, actions: ACTIONS, start: 'stage',
    defs: { materials: MATERIALS, models: PHYS }, physics: rallyPhysics(rapier),
    scenes: { stage, title, pause, results, settings }, policies: { autopilot: autopilotPolicy }, state, debug,
  });
}
```

Delete `export default rallyGame();` and the `import { DT }` line, which is no longer used. Update the header comment: "The entry and tests pass Rapier in (`rallyGame({ rapier })`, D9)".

- [ ] **Step 5: `src/game/stage.js`.**
  - `export function makeStage({ bests = null })`.
  - In `build`: `if (!s.sim) s.sim = new Sim(e.world, { world: world ?? undefined, car: st.car, surface: st.surface, assist: st.assist });`.
  - In `enter`, replace the `rally.physics` system with:

    ```js
    // The vehicle's forces go in before Rapier's step and the clock after it (overview §4.4: kits and games put pre-step
    // work in physics.world before lh.physics.step).
    ctx.system('rally.vehicle', () => s.sim.preStep(), { stage: 'physics.world', before: ['lh.physics.step'] });
    ctx.system('rally.after', () => s.sim.postStep(), { stage: 'physics.world', after: ['lh.physics.events'] });
    ```

  - Update the header comment: "the World owns the Rapier world".
- [ ] **Step 6: `src/main.js`:** `boot(rallyGame({ rapier: R, bests: makeBests(storage ?? memoryStore()) }), …)`.
- [ ] **Step 7: `test/helpers/bench.mjs`.**

```js
// Test helpers for the World era (lion-hawk phase 3): benchSim(opts) is a Sim on a one-scene engine with Rally's
// physics, stepped one engine step per sim.step() (the same order as the stage: rally.vehicle, Rapier, rally.after);
// game(opts) is rallyGame with the initialised Rapier module. Callers `await R.init()` first.
import R from '@dimforge/rapier3d-compat';
import { createEngine, defineGame } from 'lion-hawk/sim';
import { rallyGame, rallyPhysics } from '../../src/game.sim.js';
import MATERIALS from '../../src/defs/materials.js';
import { Sim, HZ } from '../../src/sim.js';

export const game = (opts = {}) => rallyGame({ rapier: R, ...opts });

export function benchSim(opts = {}) {
  let sim = null, engine = null;
  engine = createEngine(defineGame({
    id: 'rally-bench', sim: { hz: HZ }, start: 'bench', defs: { materials: MATERIALS }, physics: rallyPhysics(R),
    scenes: { bench: { enter(e, ctx) {
      sim = new Sim(ctx.world, { ...opts, step: () => engine.stepN(1) });
      ctx.system('rally.vehicle', () => sim.preStep(), { stage: 'physics.world', before: ['lh.physics.step'] });
      ctx.system('rally.after', () => sim.postStep(), { stage: 'physics.world', after: ['lh.physics.events'] });
    } } },
  }));
  sim.engine = engine;
  return sim;
}
```

- [ ] **Step 8: Convert the tests mechanically.**

```bash
cd $W/games/rally
for f in test/dbg.mjs test/feel.mjs test/game.mjs test/golden.test.mjs test/markers.mjs test/physics.mjs test/sim.test.mjs test/snow.mjs test/track.mjs test/verge.mjs test/wild.mjs; do
  sed -i "s/new Sim(R, /benchSim(/g" "$f"
done
for f in test/feel.mjs test/game.mjs test/golden-stage.test.mjs test/flow.test.mjs test/devices.test.mjs; do
  sed -i "s/rallyGame(/game(/g; s/import { rallyGame } from '..\/src\/game.sim.js';/import { game } from '.\/helpers\/bench.mjs';/" "$f"
done
grep -ln "benchSim(" test/*.mjs | xargs -I{} sh -c "grep -q \"helpers/bench.mjs\" {} || sed -i \"0,/^import R from/s//import { benchSim } from '.\/helpers\/bench.mjs';\nimport R from/\" {}"
grep -n "helpers/bench.mjs\|new Sim(\|rallyGame(" test/*.mjs
```

Then fix by hand whatever the grep shows:
- every file that calls `benchSim` or `game` imports it from `./helpers/bench.mjs`. Files that use both import `{ benchSim, game }` in one statement;
- `Sim` imports that are now unused become `{ DT, PAD }` or similar;
- no `new Sim(` and no `rallyGame(` is left in `test/`.

Then:
- `test/sim.test.mjs`: assert `sim.phys === null` and `sim.car === null` after `dispose()`. The getter returns null once `lh` is dropped.
- `test/devices.test.mjs:22`: `game().sim.maxFrame`.
- `test/flow.test.mjs:14`: `assert.equal(1 / game().sim.hz, DT);`.
- `test/golden.test.mjs`: the `new Sim` line becomes `benchSim({ world: new TrackWorld(track), car: 'awd', assist: true })`. Nothing else changes, and `sim.step()` is one engine step.

- [ ] **Step 9: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 10: Whole suite, goldens bit-exact:** `$UNIT npm test` with **no** bless. If a golden moves, the World changed creation or parameters. Stop, diff the trail (`golden` names the first differing checkpoint), and record it under "Contract issues" in the notes before going on.
- [ ] **Step 11: Feel unchanged:** `$UNIT node test/feel.mjs --check test/feel-baseline.json`. Expect `within tolerance`; the numbers should be identical.
- [ ] **Step 12: Commit:** `git add -A src test && git commit -m "refactor(rally): the Sim runs on the scene's World; Rapier injected into rallyGame"`

---

### Task 7: Ground, pad features and gate posts through the World (re-bless 1: combine rules, heightfield helper, creation order)

**Files:**
- Modify: `src/world/padWorld.js`, `src/world/trackWorld.js`, `src/sim.js` (`world.build(this.lh)`), `test/lh-world.test.mjs`, `test/track.mjs` (heightfield test via `sim.lh`), `test/goldens/*.json` (re-bless), notes

**Interfaces:**
- Consumes: `world.spawn({ body: 'fixed', colliders, groups, tags })`, `world.heightfield({ nx, nz, cell, x0, z0, heights, material, groups }) → e`, `e.colliders[i].collider` (§4.4); combine rules and `√f` (§4.5).
- Produces: `PadWorld.build(lh)` and `TrackWorld.build(lh)`. `world.groundCollider` stays the ground collider (snow binds to its handle); `world.ground` stays a `Set` of ground collider handles (used by `test/track.mjs`); the props stay raw until Task 8. `export function padColliders(pad) → inline collider entries`. `heightfieldDesc` is removed from `trackWorld.js` (it moved into the engine, §4.5).

- [ ] **Step 1: Failing test.** Append to `test/lh-world.test.mjs`:

```js
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import MATERIALS from '../src/defs/materials.js';

test('pad ground and features are one fixed ground entity with rally-ground colliders (√f, Multiply; M-9)', () => {
  const sim = benchSim({ car: 'awd', cones: false });
  const e = sim.world.groundEntity, c = e.colliders[0].collider;
  assert.equal(sim.world.groundCollider, c);
  assert.ok(e.colliders.length >= 1 + 2 + 8 + 1, 'ground, 2 ramps, 8 humps, slope');
  for (const { material } of e.colliders) assert.equal(material, 'rally-ground');
  assert.equal(c.friction(), MATERIALS.collider('rally-ground').friction);
  assert.equal(c.frictionCombineRule(), R.CoefficientCombineRule.Multiply);
  assert.equal(sim.lh.materialOf(c.handle), 'rally-ground');
});
test('a track\'s heightfield is the World\'s and its gate posts are prop-group cylinders', () => {
  const sim = benchSim({ world: new TrackWorld(generateTrack('g1', { kind: 'stage' })), car: 'awd' });
  const w = sim.world;
  assert.equal(sim.lh.materialOf(w.groundCollider.handle), 'rally-ground');
  assert.ok(w.ground.has(w.groundCollider.handle));
  assert.equal(w.gateEntity.colliders.length, w.gatePosts.length);
  for (const { collider, material } of w.gateEntity.colliders) {
    assert.equal(material, 'gate-post');
    assert.equal(collider.collisionGroups() >>> 16, sim.lh.groups.prop);
  }
});
```

- [ ] **Step 2: Run, expect FAIL** (`groundEntity` undefined): `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 3: `src/world/padWorld.js`.** Replace `buildPad` and `PadWorld.build`, keeping `PAD`, `quatYX`, `coneLayout` and `CONE_Y`. Keep `GROUP_*` and `groups` for the raw cones until Task 8:

```js
const q4 = q => [q.x, q.y, q.z, q.w];
const ID = [0, 0, 0, 1];

// Static pad features as inline World colliders (overview §4.3 entry shape), all 'rally-ground': the flat ground
// first (snow binds to it), then ramps, humps and the slope. Shared with the renderer through PAD.
export function padColliders(pad = PAD) {
  const half = pad.size / 2, out = [];
  out.push({ shape: 'box', half: [half, 1, half], p: [0, -1, 0], q: ID, material: 'rally-ground' });
  for (const r of pad.ramps) {
    const ang = Math.atan2(r.h, r.len), hl = Math.hypot(r.len, r.h) / 2, thick = 0.5;
    // Box whose top face is the ramp surface; centred so the low edge meets the ground.
    const cx = r.x + Math.sin(r.yaw) * (r.len / 2), cz = r.z + Math.cos(r.yaw) * (r.len / 2), cy = r.h / 2 - thick * Math.cos(ang);
    out.push({ shape: 'box', half: [r.w / 2, thick, hl], p: [cx, cy, cz], q: q4(quatYX(r.yaw, -ang)), material: 'rally-ground' });
  }
  for (const b of pad.bumps) {
    out.push({ shape: 'cylinder', halfHeight: b.w / 2, r: b.r, p: [b.x, -b.r + b.depth, b.z],
      q: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], material: 'rally-ground' });
  }
  const s = pad.slope;
  if (s) {
    const ang = Math.atan(s.grade), thick = 1, hl = s.len / 2 / Math.cos(ang);
    // Plateau-free incline starting at ground level, rising toward +z.
    out.push({ shape: 'box', half: [s.w / 2, thick, hl], p: [s.x, s.len / 2 * s.grade - thick / Math.cos(ang), s.z + s.len / 2],
      q: q4(quatYX(0, -ang)), material: 'rally-ground' });
  }
  return out;
}
```

In `PadWorld`:

```js
  build(lh) {
    this.groundEntity = lh.spawn({ tags: ['ground', 'pad'], body: 'fixed', colliders: padColliders(this.pad), groups: { member: ['ground'] } });
    this.groundCollider = this.groundEntity.colliders[0].collider;
    this.ground = new Set(this.groundEntity.colliders.map(c => c.collider.handle));
    this.props = [];
    if (!this.withCones) return;
    const R = lh.R, phys = lh.rapier; // raw until Task 8
    for (const c of coneLayout()) {
      const body = phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, CONE_Y, c.z));
      phys.createCollider(R.ColliderDesc.cone(0.35, 0.22).setMass(3).setFriction(0.6)
        .setCollisionGroups(groups(GROUP_PROP, 0xffff)), body);
      this.props.push({ body, home: { x: c.x, y: CONE_Y, z: c.z, yaw: 0 }, kind: 'cone' });
    }
  }
```

Note: `this.ground` used to hold only the flat box's handle. It now holds every pad ground collider. Nothing reads it on the pad (`track.mjs` uses the track's), so this changes no behaviour.

- [ ] **Step 4: `src/world/trackWorld.js`.** Delete `heightfieldDesc` and replace `build`:

```js
  build(lh) {
    const t = this.track, T = t.terrain;
    this.lh = lh;
    // Row-major heights; the World reorders them for Rapier (heightfieldDesc moved into the engine, §4.5).
    this.groundEntity = lh.heightfield({ nx: T.nx, nz: T.nz, cell: T.cell, x0: T.x0, z0: T.z0, heights: T.heights,
      material: 'rally-ground', groups: { member: ['ground'] } });
    this.groundCollider = this.groundEntity.colliders[0].collider;
    this.ground = new Set([this.groundCollider.handle]);
    this.props = [];
    this.R = lh.R; this.phys = lh.rapier; this.newPosts = [];
    for (const m of t.roadside.markers) {
      const home = { x: m.x, y: m.y + MARKER.h / 2, z: m.z, yaw: m.yaw };
      this.props.push({ body: this.makeMarker(home), home, kind: 'marker' });
    }
    this.gatePosts = [];
    const posts = [];
    for (const g of t.roadside.gates) {
      for (const side of [1, -1]) {
        const x = g.x + side * GATE_POST.off * Math.cos(g.yaw), z = g.z - side * GATE_POST.off * Math.sin(g.yaw);
        const y = heightAt(T, x, z) + GATE_POST.h / 2;
        posts.push({ shape: 'cylinder', halfHeight: GATE_POST.h / 2, r: GATE_POST.r, p: [x, y, z], q: [0, 0, 0, 1], material: 'gate-post' });
        this.gatePosts.push({ x, y, z, h: GATE_POST.h, r: GATE_POST.r, gate: g.kind });
      }
    }
    this.gateEntity = lh.spawn({ tags: ['gate-post'], body: 'fixed', colliders: posts, groups: { member: ['prop'] } });
  }
```

`makeMarker` keeps its raw body for now, but reads `this.lh.groups` in place of the `padWorld` constants: `.setCollisionGroups(this.lh.groups.mask(['prop'], ['ground', 'prop', 'car', 'ray']))`. Drop the `GROUP_GROUND, GROUP_PROP, groups` import if nothing else in the file uses it.

- [ ] **Step 5: `src/sim.js`:** `world.build(this.lh);` in `setWorld`.
- [ ] **Step 6: `test/track.mjs`** heightfield test (line ~56): replace `sim.phys.castRay(...)` with `sim.lh.rapier.castRay(...)`. Keep the filter `(c) => world.ground.has(c.handle)`. If the file imports `heightfieldDesc`, delete the import.
- [ ] **Step 7: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 8: Expect the goldens to move.** Run `$UNIT npm test`. Expect the `golden*.test.mjs` checksums to FAIL, and every other check (`physics`, `track`, `verge`, `markers`, `wild`, `game`, `snow`) to PASS. If any non-golden check fails, stop: that is a behaviour regression, not a re-bless.
- [ ] **Step 9: §5.5 re-bless 1.** Cause: **combine rules (`√f` with Multiply, restitution Max), the heightfield helper, and World creation order (a fixed body under the static colliders).**
  1. Determinism (`test/lh-checks.test.mjs` arrives in Task 10, so use the goldens' own two-run tests): `$UNIT node --test --test-concurrency=4 --test-name-pattern=determinism test/golden.test.mjs test/golden-stage.test.mjs`. Expect PASS.
  2. `$UNIT node test/feel.mjs --check test/feel-baseline.json > $SCRATCH/feel-T5.json`. Expect `within tolerance`. **If it is outside tolerance, stop. Report the table to the user as a playtest item. Do not bless.**
  3. Bless: `$UNIT -E LH_BLESS=1 node --test --test-concurrency=4 test/golden.test.mjs test/golden-stage.test.mjs`. Then rerun `$UNIT npm test` and expect PASS.
  4. Add a row to the notes' "Golden re-blessings": Task 7, the cause, the old → new feel table (baseline vs `$SCRATCH/feel-T5.json`), and the commit.
- [ ] **Step 10: Commit** (goldens and notes in the same commit): `git add -A src test docs && git commit -m "refactor(rally): ground, pad features and gate posts as World entities with registry materials; goldens re-blessed (combine rules, heightfield helper)"`

---

### Task 8: Marker posts and cones as entities (re-bless 2: mass from density, the World's sleep)

**Files:**
- Modify: `src/world/trackWorld.js`, `src/world/padWorld.js`, `src/sim.js`, `test/lh-world.test.mjs`, `test/goldens/*.json`, notes

**Interfaces:**
- Consumes: `world.spawn({ body: { type, sleep, canSleep, mass, angularDamping, linearDamping }, colliders, at, yaw, tags, groups })`, `world.despawn(e)`, `world.place(e, { at }, { yaw })` (§4.4, §4.5 sleep #2, D3 `mass`).
- Produces: props are `{ e, body, home, kind }`, with `body === e.body` refreshed on respawn. `TrackWorld.afterStep` and `newPosts` are gone (the World's `sleep: true` does it). `coneHull()` gives 33 hull points.

**Decision (judgment):** the cone collider becomes a `hull` (apex plus a 32-point base ring). §4.3 has no `cone` shape, and a hull is within the contract. Cones live only on the pad, which is in neither golden. The pad tests in `physics.mjs` use `cones: false`. Record this in "Decisions".

- [ ] **Step 1: Failing test.** Append to `test/lh-world.test.mjs`:

```js
test('untouched marker posts stay asleep after spawn and after reset (Review Focus 4)', () => {
  const sim = benchSim({ world: new TrackWorld(generateTrack('markers', { kind: 'loop', style: 'flowing' })), car: 'awd' });
  const posts = sim.world.props.filter(p => p.kind === 'marker');
  assert.ok(posts.length > 50);
  for (const p of posts) { assert.equal(p.body, p.e.body); assert.ok(p.e.tags.has('marker')); }
  sim.car.reset({ x: 1e4, y: 50, z: 1e4 }, 0); // far from every post
  for (let i = 0; i < 2 * HZ; i++) sim.step();
  const awake = () => posts.filter(p => !p.body.isSleeping()).length;
  assert.equal(awake(), 0, 'posts asleep after spawn');
  const ids = posts.map(p => p.e.id);
  sim.world.resetProps();
  assert.notDeepEqual(posts.map(p => p.e.id), ids, 'reset respawns each post');
  for (let i = 0; i < 2; i++) sim.step();
  assert.equal(awake(), 0, 'posts asleep after reset');
  const p0 = posts[3], h = p0.home, t = p0.body.translation();
  assert.ok(Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z) < 1e-6, 'unmoved');
});
test('props weigh today\'s masses (body.mass, D3)', () => {
  const pad = benchSim({ car: 'awd' }), cone = pad.world.props[0];
  assert.ok(Math.abs(cone.body.mass() - 3) < 3e-3, `cone ${cone.body.mass()}`);
  const track = benchSim({ world: new TrackWorld(generateTrack('g1', { kind: 'stage' })), car: 'awd' });
  assert.ok(Math.abs(track.world.props[0].body.mass() - 5) < 5e-3);
  assert.equal(pad.lh.materialOf(cone.e.colliders[0].collider.handle), 'cone');
  assert.equal(track.lh.materialOf(track.world.props[0].e.colliders[0].collider.handle), 'marker');
});
test('pad reset puts cones home, stopped', () => {
  const sim = benchSim({ car: 'awd' }), c = sim.world.props[0];
  c.body.setLinvel({ x: 5, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) sim.step();
  sim.world.resetProps();
  const t = c.body.translation(), v = c.body.linvel();
  assert.deepEqual([t.x, t.y, t.z], [c.home.x, c.home.y, c.home.z]);
  assert.equal(Math.hypot(v.x, v.y, v.z), 0);
});
```

- [ ] **Step 2: Run, expect FAIL** (`p.e` undefined): `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 3: `src/world/trackWorld.js`.**
  - `MARKER` loses `friction`, which is now the `marker` material.
  - Replace the prop loop, `makeMarker`, `afterStep` and `resetProps`. Rewrite the comment block above `makeMarker`: "posts start asleep (`body.sleep`, the World puts them back after their first step unless something set them moving: Rapier 0.21's wake-on-insert, #2)".

```js
    for (const m of t.roadside.markers) {
      const home = { x: m.x, y: m.y + MARKER.h / 2, z: m.z, yaw: m.yaw }, e = this.makeMarker(home);
      this.props.push({ e, body: e.body, home, kind: 'marker' });
    }
```

```js
  makeMarker(home) {
    return this.lh.spawn({
      tags: ['marker'], at: [home.x, home.y, home.z], yaw: home.yaw,
      body: { type: 'dynamic', sleep: true, canSleep: true, mass: MARKER.mass, angularDamping: MARKER.angDamp, linearDamping: MARKER.linDamp },
      colliders: [{ shape: 'box', half: MARKER.half, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'marker' }],
      groups: { member: ['prop'] },
    });
  }

  // Teleporting a post wakes it, so a reset respawns each one (same prop object, new entity and body: views read p.e).
  resetProps() {
    for (const p of this.props) {
      this.lh.despawn(p.e);
      p.e = this.makeMarker(p.home); p.body = p.e.body;
    }
  }
```

  - Delete `afterStep`, `newPosts`, `this.R` and `this.phys`, and the now-unused `yawQ` if nothing else uses it.
- [ ] **Step 4: `src/world/padWorld.js`.** Delete `GROUP_*` and `groups`.

```js
// A cone as a convex hull: apex and a 32-point base ring (Rapier's cone primitive isn't a phase 3 collider shape).
export function coneHull(halfHeight = 0.35, r = 0.22, n = 32) {
  const pts = [0, halfHeight, 0];
  for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; pts.push(Math.cos(a) * r, -halfHeight, Math.sin(a) * r); }
  return pts;
}
```

In `build(lh)`, the cone loop becomes:

```js
    for (const c of coneLayout()) {
      const e = lh.spawn({ tags: ['cone'], at: [c.x, CONE_Y, c.z], body: { type: 'dynamic', mass: 3 },
        colliders: [{ shape: 'hull', points: coneHull(), p: [0, 0, 0], q: [0, 0, 0, 1], material: 'cone' }], groups: { member: ['prop'] } });
      this.props.push({ e, body: e.body, home: { x: c.x, y: CONE_Y, z: c.z, yaw: 0 }, kind: 'cone' });
    }
```

Keep `this.lh = lh;` at the top of `build`, then:

```js
  resetProps() { for (const p of this.props) this.lh.place(p.e, { at: [p.home.x, p.home.y, p.home.z] }, { yaw: p.home.yaw }); }
```

- [ ] **Step 5: `src/sim.js`:** `postStep() { this.time += DT; }`, since props sleep through the World now.
- [ ] **Step 6: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs` and `$UNIT node test/markers.mjs`.
- [ ] **Step 7: Mutation (Review Focus 4).** Remove `sleep: true` from `makeMarker`. Run `test/lh-world.test.mjs` and expect "posts asleep after spawn" to FAIL (or `markers.mjs` to report posts tipping). Restore it.
- [ ] **Step 8: Expect the goldens to move** (mass from density on the posts the car clips): `$UNIT npm test`. Every non-golden check must PASS.
- [ ] **Step 9: §5.5 re-bless 2.** Cause: **mass from density (`body.mass` scales the collider densities, D3) and the World's sleep handling replacing `afterStep` (#2).** Follow Task 7 Step 9 items 1–4 exactly, with `$SCRATCH/feel-T6.json`. The tolerance is still against `test/feel-baseline.json`, not the Task 7 numbers.
- [ ] **Step 10: Commit:** `git add -A src test docs && git commit -m "refactor(rally): marker posts and cones as World entities; goldens re-blessed (mass from density, World sleep)"`

---

### Task 9: The car body through the World (re-bless 3: car colliders' √f; `massProps`, round box)

**Files:**
- Modify: `src/vehicle.js`, `src/sim.js`, `test/lh-world.test.mjs`, `test/goldens/*.json`, notes

**Interfaces:**
- Consumes:
  - `world.spawn({ body: { type: 'dynamic', ccd, canSleep, massProps: { mass, com, inertia } }, colliders, at, yaw, tags, groups, draw })`;
  - `world.place(e, { at }, { yaw })`;
  - `world.despawn(e)`;
  - `world.rapier` and `world.R` for the wheel rays (L-1).
- Produces: `new Vehicle(lh, cfg, opts)`, with `vehicle.e` (the car entity, `draw: false`: Rally draws its car), `vehicle.body === vehicle.e.body` and `vehicle.colliders` (the Rapier colliders).

**Contract issue (blocking for exact feel):** the hull is a `ColliderDesc.roundCuboid` (0.2 m rounded edges, so a nose strike rides up). §4.3 has no rounded box. This plan uses `{ shape: 'box', half, round: 0.2 }`, which needs 3c to map `round` to `roundCuboid`.
- If 3c has not added `round` by 0.8.0, use the fallback instead: `{ shape: 'hull', points: roundedBoxHull(half, 0.2) }` with 8 corner spheres × 7 points = 56 points (code below).
- Record the choice in "Decisions" and make it a user playtest item. A hull is a new golden cause, so this task's re-bless names it.

- [ ] **Step 1: Failing test.** Append to `test/lh-world.test.mjs`:

```js
import { CARS } from '../src/cars.js';
test('the car is a World entity with cars.js mass and inertia (massProps, D3) and car-group colliders', () => {
  for (const id of ['awd', 'rwd']) {
    const sim = benchSim({ car: id, cones: false }), car = sim.car, cfg = CARS[id];
    assert.equal(car.body, car.e.body); assert.ok(car.e.tags.has('car')); assert.equal(car.e.draw, false);
    assert.ok(Math.abs(car.body.mass() - cfg.mass) < 1e-6 * cfg.mass, `${id} mass ${car.body.mass()}`);
    const I = car.body.principalInertia();
    assert.deepEqual([I.x, I.y, I.z].map(Math.round), [cfg.inertia.x, cfg.inertia.y, cfg.inertia.z]);
    assert.deepEqual(car.e.colliders.map(c => c.material), ['car-hull', 'car-cabin']);
    for (const c of car.colliders) assert.equal(c.collisionGroups() >>> 16, sim.lh.groups.car);
    assert.equal(car.colliders[0].friction(), MATERIALS.collider('car-hull').friction);
  }
});
test('changing car despawns the old body; reset places the car stopped', () => {
  const sim = benchSim({ car: 'awd', cones: false }), old = sim.car.e;
  sim.setCar('rwd');
  assert.equal(sim.lh.get(old.id), undefined);
  sim.car.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
  sim.car.reset({ x: 10, y: 1, z: 20 }, Math.PI / 2);
  const t = sim.car.body.translation(), v = sim.car.body.linvel();
  assert.deepEqual([t.x, t.y, t.z], [10, 1, 20]); assert.equal(Math.hypot(v.x, v.y, v.z), 0);
});
```

- [ ] **Step 2: Run, expect FAIL** (`car.e` undefined): `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 3: `src/vehicle.js`.**
  - The constructor becomes `constructor(lh, cfg, opts = {})`. Set `this.lh = lh; this.R = lh.R; this.cfg = cfg;` and remove `this.world`.
  - `createBody` and `reset`:

```js
  createBody(pos, yaw) {
    const c = this.cfg, len = c.wheelbase / 2 + 0.85;
    // Rounded edges (0.2 m) so a nose that meets an upslope or a bump rides up it instead of digging in like a box corner
    // (which stopped the car at 20+ g); low friction so it skids. Mass and inertia are the playtested cars.js values.
    const round = 0.2;
    this.e = this.lh.spawn({
      tags: ['car'], at: [pos.x, pos.y, pos.z], yaw, draw: false,
      // lh-allow: massProps (D3): cars.js mass and inertia were tuned by playtest, not the colliders' volume
      body: { type: 'dynamic', ccd: true, canSleep: false, massProps: { mass: c.mass, com: [0, 0, 0], inertia: [c.inertia.x, c.inertia.y, c.inertia.z] } },
      colliders: [
        { shape: 'box', half: [0.86 - round, 0.24 - round, len - round], round, p: [0, -c.comHeight + 0.20 + 0.24, this.zMid], q: [0, 0, 0, 1], material: 'car-hull' },
        { shape: 'box', half: [0.72, 0.27, len * 0.5], p: [0, -c.comHeight + 0.68 + 0.27, this.zMid - 0.2], q: [0, 0, 0, 1], material: 'car-cabin' },
      ],
      groups: { member: ['car'] },
    });
    this.body = this.e.body;
    this.colliders = this.e.colliders.map((x) => x.collider);
  }

  reset(pos, yaw) {
    this.lh.place(this.e, { at: [pos.x, pos.y, pos.z] }, { yaw }); // wakes it and zeroes its velocities (E-8)
    for (const w of this.wheels) { w.omega = 0; w.st.dx = w.st.dy = 0; w.wasContact = false; }
    this.dt.we = this.cfg.drive.idle * 2 * Math.PI / 60; this.dt.gear = 1; this.dt.shiftT = 0;
  }
```

  - In `step()`, the ray:

```js
      const ray = new this.R.Ray(o, down);
      // lh-allow: raw Rapier raycast (L-1): Rally's own ray-cast wheels (overview §1.2)
      const hit = this.lh.rapier.castRayAndGetNormal(ray, maxT + (snow ? SNOW.depth / slant : 0), true, undefined, this.rayGroups, undefined, b);
```

  - If `round` is unavailable, use this fallback and add it to the file:

```js
// Fallback while box colliders have no `round`: the hull of 8 corner spheres (7 points each) of the rounded box.
export function roundedBoxHull(half, r) {
  const pts = [], D = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.577, 0.577, 0.577], [0.577, -0.577, 0.577], [-0.577, 0.577, 0.577], [0.577, 0.577, -0.577]];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    for (const d of D) pts.push(sx * (half[0] + r * Math.abs(d[0])), sy * (half[1] + r * Math.abs(d[1])), sz * (half[2] + r * Math.abs(d[2])));
  }
  return pts; // 56 points ≤ 64
}
```

- [ ] **Step 4: `src/sim.js` `setCar`:**

```js
  setCar(id, pos, yaw) {
    if (this.car) this.lh.despawn(this.car.e);
    const cfg = CARS[id];
    this.car = new Vehicle(this.lh, cfg, {
      pos: pos || this.spawnPos(cfg), yaw: yaw ?? this.world.spawn.yaw, assist: this.assist,
      surfaceAt: (x, z, c) => this.surfaceAt(x, z, c), snow: () => this.snow,
      rayGroups: this.lh.groups.mask(['ray'], ['ground']),
    });
    this.carId = id;
  }
```

- [ ] **Step 5: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 6: Mutation.** Drop `massProps` from the spawn so the colliders' density sets the mass. Run, and expect the mass assertion to FAIL. Restore it.
- [ ] **Step 7: Expect the goldens to move:** `$UNIT npm test`. Every non-golden check must PASS. `physics.mjs` covers the hull strikes, skidpad, ramps and humps.
- [ ] **Step 8: §5.5 re-bless 3.** Cause: **the car's colliders under the combine rules (`√f` with Multiply, restitution Max). If the fallback hull was used, also the hull in place of the rounded box.** Follow Task 7 Step 9 items 1–4, with `$SCRATCH/feel-T7.json`.
- [ ] **Step 9: Commit:** `git add -A src test docs && git commit -m "refactor(rally): the car body and colliders through the World (massProps, registry materials); goldens re-blessed (car combine rules)"`

---

### Task 10: Engine checks and the §1.3 rules

**Files:**
- Create: `test/lh-checks.test.mjs`, `test/lh-rules.test.mjs`

**Interfaces:**
- Consumes: `checks.determinism(game, { seed, steps, input, args })`, `checks.simPurity(game, { roots })`, `checks.materials(game)`, `checks.zeroAlloc(game, { steps, warm, args, input })` (§4.4); `stripComments` (`lion-hawk/test`).

**Contract issue:** §4.4 gives `checks.determinism(game, { seed, steps, input })` without start `args`, and leaves `input` unspecified. Rally's stage needs args to reach a driving state. This plan passes `args` (forwarded as `headless`'s `args`) and `input` as a policy function `(h, i, scratch) → actions`, the same as `h.step(n, policy)`. If 3c's signature differs, adapt the call and record it.

- [ ] **Step 1: Failing test** `test/lh-rules.test.mjs`:

```js
// lion-hawk overview §1.3: Rally's game code builds physics only through the World. No hand-made RAPIER.World, no
// ColliderDesc, no collider property setters and no friction/density/restitution literals outside the registry
// (src/defs/materials.js). massProps (D3) and raw Rapier queries (L-1) are allowed only on a line marked, or right
// below a line marked, `// lh-allow: <reason>`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = p => statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const FORBID = [[/new\s+\w+\.World\s*\(/, 'new RAPIER.World'], [/\bColliderDesc\./, 'ColliderDesc'],
  [/\.set(Friction|Density|Restitution|Mass)\s*\(/, 'collider property setter'], [/\b(friction|density|restitution)\s*:/, 'material literal']];
const ALLOW = [[/\bmassProps\b/, 'massProps'], [/\.(castRay\w*|castShape|intersection\w*|projectPoint)\s*\(/, 'raw Rapier query']];
export function violations(src, f = '') {
  const raw = src.split('\n'), code = stripComments(src).split('\n'), out = [];
  code.forEach((l, i) => {
    for (const [re, what] of FORBID) if (re.test(l)) out.push(`${f}:${i + 1}: ${what}: ${raw[i].trim()}`);
    const marked = /\/\/ lh-allow: \S/.test(raw[i]) || /\/\/ lh-allow: \S/.test(raw[i - 1] ?? '');
    for (const [re, what] of ALLOW) if (re.test(l) && !marked) out.push(`${f}:${i + 1}: ${what} without // lh-allow: ${raw[i].trim()}`);
  });
  return out;
}
test('src follows the §1.3 physics rules', () => {
  const all = files(SRC).filter(f => !f.endsWith(join('defs', 'materials.js')));
  assert.deepEqual(all.flatMap(f => violations(readFileSync(f, 'utf8'), f)), []);
});
test('the scan catches each rule and honours lh-allow', () => {
  assert.equal(violations('c.setFriction(1);').length, 1);
  assert.equal(violations('const m = { friction: 0.8 };').length, 1);
  assert.equal(violations('w.castRayAndGetNormal(r);').length, 1);
  assert.equal(violations('// lh-allow: L-1 rays\nw.castRayAndGetNormal(r);').length, 0);
  assert.equal(violations('const x = 1; // friction: 0.8 in a comment').length, 0);
});
```

`test/lh-checks.test.mjs`:

```js
// lion-hawk engine checks over Rally (T-10, T-12, T-13, T-14; overview §4.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { checks } from 'lion-hawk/test';
import { game } from './helpers/bench.mjs';
await R.init();

const src = fileURLToPath(new URL('../src/', import.meta.url));
const ROOTS = ['game.sim.js', 'sim.js', 'surface.js', 'vehicle.js', 'drivetrain.js', 'tire.js', 'snow.js', 'cars.js', 'defs', 'gen', 'world', 'game'].map(p => join(src, p));
const DRIVE = () => ({ throttle: 1, steer: 0.3, brake: 0, handbrake: 0 });
const STAGE = { settings: { mode: 'freeDrive', world: 'loop', seed: 'det1', theme: 'summer', assist: true } };

test('determinism: a pad drive and a track drive replay bit-exactly', () => {
  for (const args of [{ pad: true }, STAGE]) {
    const r = checks.determinism(game(), { seed: 5, steps: 2400, input: DRIVE, args });
    assert.equal(r.ok, true, `first difference at step ${r.step}`);
  }
});
test('sim purity over Rally\'s sim roots', () => {
  const r = checks.simPurity(game(), { roots: ROOTS });
  assert.equal(r.ok, true, JSON.stringify(r));
});
test('materials: every collider material exists and phys.json matches the registry', () => {
  const r = checks.materials(game());
  assert.equal(r.ok, true, JSON.stringify(r));
});
test('zero retained allocation over 10000 steps of driving', () => {
  const r = checks.zeroAlloc(game(), { steps: 10000, warm: 600, input: DRIVE, args: { pad: true } });
  assert.ok(r.ok, `retained ${r.bytes ?? JSON.stringify(r)} B`);
});
```

This assumes 3c's checks return `{ ok, … }`. If 3c's result shape differs, adapt only the assertion and keep it strict: zero problems. Until Task 3 adds `defs.models`, `checks.materials` verifies the materials alone.

- [ ] **Step 2: Run:** `$UNIT node --test --test-concurrency=4 test/lh-rules.test.mjs test/lh-checks.test.mjs`. After Task 9 the rules scan should already pass. Prove it can fail: add `c.setFriction(1);` to `src/sim.js`, run, expect FAIL naming `src/sim.js`, then revert. `lh-checks` passes or fails depending on 3c; read any failure and fix only Rally-side causes.
- [ ] **Step 3: Fix the Rally-side violations** the scan lists (expected: none, or leftovers from Tasks 7–9). Do not add `lh-allow` to anything but `massProps` and the wheel rays.
- [ ] **Step 4: Run, expect PASS.** Then run the whole suite, goldens bit-exact: `$UNIT npm test`.
  - If `zeroAlloc` reports retained growth, find the cause with `--heap-prof` on `node test/feel.mjs` (pad part). Fix it if it is in Rally (for example a cache growing per step). If it is engine-side, record it under "Contract issues" and mark the test `{ todo: 'engine: <reason>' }` with the integrator told.
- [ ] **Step 5: Commit:** `git add test/lh-rules.test.mjs test/lh-checks.test.mjs src && git commit -m "test(rally): engine checks (determinism, purity, materials, zero alloc) and the physics rules"`

---

### Task 11: The terrain kit in the sim (engine 0.9.0; goldens bit-exact)

**Files:**
- Modify: `src/world/trackWorld.js`, `test/lh-world.test.mjs`

**Interfaces:**
- Consumes: `createTerrain(world, { nx, nz, cell, x0, z0, heights, materials: (x, z) => id, blend: (x, z, out) => out })` → `{ heightAt, normalAt, materialAt, blendAt, entity }` (`lion-hawk/kits/terrain`, §4.10).
- Produces: `TrackWorld.terrain`; `TrackWorld.materialAt(x, z) → id` (M-10, the section's dominant surface: road within 3.5 m, else verge); `TrackWorld.surfaceAt(x, z)` through `terrain.blendAt` and `blendSurface`.

**Contract issue:** §4.10's `createTerrain` has a per-cell lookup (`materials`) but no **collider** material for the heightfield entity. Rally's ground collider is `rally-ground` (friction 0.8). This plan passes `material: 'rally-ground'` as an extra option. If 3h names it differently, use 3h's name. If 3h gives no way to set it, keep `world.heightfield` (Task 7), use the kit only for `materialAt` and `blendAt` (passing the existing entity is not in the contract), and record it.

- [ ] **Step 1: Failing test.** Append to `test/lh-world.test.mjs`:

```js
test('the track uses the terrain kit: materialAt, blendAt and heightAt agree with Rally\'s generator', () => {
  const track = generateTrack('t2', { kind: 'loop' }), sim = benchSim({ world: new TrackWorld(track), car: 'awd' });
  const w = sim.world, L = track.layout;
  assert.equal(w.groundEntity, w.terrain.entity);
  assert.equal(sim.lh.materialOf(w.groundCollider.handle), 'rally-ground');
  const p = { x: L.x[40], z: L.z[40] };
  assert.match(w.materialAt(p.x, p.z), /^rally-(tarmac|hardpack|gravel|packed|ice)$/);
  assert.match(w.materialAt(p.x + 30 * Math.cos(L.heading[40]), p.z - 30 * Math.sin(L.heading[40])), /^rally-(grass|snowbank)$/);
  for (let i = 0; i < L.n; i += 97) assert.ok(Math.abs(w.terrain.heightAt(L.x[i] + 2, L.z[i]) - heightAt(track.terrain, L.x[i] + 2, L.z[i])) < 1e-9);
});
```

Add `import { heightAt } from '../src/gen/terrain.js';` at the top of the file.

- [ ] **Step 2: Run, expect FAIL** (`w.terrain` undefined).
- [ ] **Step 3: `src/world/trackWorld.js`.** Add `import { createTerrain } from 'lion-hawk/kits/terrain';`.
  - In `build`, replace the `lh.heightfield` call with:

```js
    this.blendOut = { a: null, b: null, w: 0 };
    this.terrain = createTerrain(lh, { nx: T.nx, nz: T.nz, cell: T.cell, x0: T.x0, z0: T.z0, heights: T.heights,
      material: 'rally-ground', materials: (x, z) => this.materialAt(x, z), blend: (x, z, out) => this.blendTo(x, z, out) });
    this.groundEntity = this.terrain.entity;
```

  - Replace `surfaceAt` with:

```js
  // Road within 3.5 m of the centreline, else verge (M-10: the section's own surface).
  materialAt(x, z) {
    const t = this.track, { s, d } = t.locator.locate(x, z), r = roadSurfaceAt(t.surfaces, s);
    return materialOf(Math.abs(d) <= HALF_ROAD ? r.road : r.verge);
  }
  // The kit's blend: section a → the next section's b over the last 10 m, at weight w.
  blendTo(x, z, out) {
    const t = this.track, { s, d } = t.locator.locate(x, z);
    const r = roadSurfaceAt(t.surfaces, s), road = Math.abs(d) <= HALF_ROAD;
    const a = road ? r.road : r.verge, b = r.next ? (road ? r.next.road : r.next.verge) : a;
    out.a = materialOf(a); out.b = materialOf(b); out.w = r.t;
    return out;
  }
  // The tyre surface under a wheel: the blend quantised to tenths and cached (allocation-free per step).
  surfaceAt(x, z) {
    const o = this.terrain.blendAt(x, z, this.blendOut);
    return blendSurface(this.blends, surface(o.a), surface(o.b), Math.round(o.w * 10));
  }
```

  - Import `materialOf` and `surface` from `../surface.js`.
- [ ] **Step 4: Run, expect PASS:** `$UNIT node --test --test-concurrency=4 test/lh-world.test.mjs`
- [ ] **Step 5: Whole suite, goldens bit-exact:** `$UNIT npm test` with **no** bless.
  - The heightfield helper was already blessed in Task 7, and the blend arithmetic is unchanged.
  - If a golden moves, stop. Compare `terrain.blendAt`'s `w` with `roadSurfaceAt(...).t` (the kit must pass `out` through unchanged) and the kit's heightfield with `world.heightfield`.
  - Record the cause under "Contract issues". Do not bless.
- [ ] **Step 6: Commit:** `git add src/world/trackWorld.js test/lh-world.test.mjs && git commit -m "refactor(rally): the track terrain through lion-hawk/kits/terrain (materialAt, blendAt)"`

---

## Part B: view (engine 0.9.0)

View tasks must not change any golden (overview §5.5). Each view task ends with `$UNIT npm test` and no bless, plus the browser suites named in its steps.

### Task 12: The engine renderer and light rig (`defineView({ render })`)

**Files:**
- Create: `test/render.browser.mjs`
- Modify: `src/render.js`, `src/game.view.js`, `src/main.js`, `package.json` (`test:e2e` list)

**Interfaces:**
- Consumes:
  - `defineView({ scenes, render })` and `boot(game, view, { canvas, … })`;
  - `view.gfx = { renderer, scene, camera, lights, resize, size }`, where boot renders once per frame after the view halves' `frame`;
  - `createLightRig` presets via `lights.set(name)`; `lights.sun` and `lights.hemi` (§4.6).
- Produces:
  - `RENDER` (Rally's render config);
  - `new Renderer(gfx)` with `setWorld`, `setCar`, `setSurface`, `sync`, `updateCamera`. Its `resize()` and `render()` are removed.

**Decision:** Rally positions its own sun from the car (`lights.sun.position`, `sun.target`), because its low snow sun needs a second offset that presets cannot carry. The rig provides the lights, the shadow map and the preset intensities. `shading: 'standard'` keeps today's `MeshStandardMaterial` look and cost (D5).

- [ ] **Step 1: Failing test** `test/render.browser.mjs`:

```js
// Rally on the engine renderer (lion-hawk §4.6): one canvas (the page's #view), the scene drawn, no errors, and the
// track view in the scene once settled.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally();
});
after(async () => { await chrome?.close(); await site?.close(); });

for (const [name, settings, q] of [['pad', { v: 4, surface: 'gravel' }, { pad: '' }], ['track', { v: 4, mode: 'freeDrive', world: 'loop', seed: 'r1' }, {}]]) {
  test(`${name}: the engine renderer draws into #view`, async t => {
    if (skip) return t.skip(skip);
    const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': settings }, query: q });
    try {
      await game.page.waitForFunction(() => window.engine.settled());
      await game.render();
      const r = await game.page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length,
        drawn: (() => { const c = document.getElementById('view'); return c.width > 0 && c.height > 0; })() }));
      assert.deepEqual(r, { canvases: 1, drawn: true });
      assert.deepEqual(await game.errors(), []);
    } finally { await game.close(); }
  });
}
```

If `openGame` has no `query` option, append `?pad` to `site.url` for the pad case instead.

- [ ] **Step 2: Run, expect FAIL:** `$BROWSER node --test test/render.browser.mjs`. Today `Renderer` makes its own `WebGLRenderer` on `#view`, and boot (with `render`) would make a second one, so expect `canvases: 1` to fail, or boot to throw because `render` is missing. If it passes as is, prove it can fail by temporarily adding `document.body.appendChild(document.createElement('canvas'))` in `main.js`, then revert.
- [ ] **Step 3: `src/render.js`.** Replace the top of the file and the `Renderer` constructor, `setLook`, `resize` and `render`. Keep `geomFromPart`, `repaint`, `setWorld`, `setSurface`, `setCar`, `sync` and `updateCamera` as they are, except for the sun lines below.

```js
// Rally's 3D scene on the engine renderer (lion-hawk phase 3, overview §4.6): boot owns the WebGL renderer, the scene,
// the camera, resize and the one render per frame; this module owns the car, the world views, the snow view, the looks
// (sky, fog and the light rig's presets) and the cameras.
import * as THREE from 'three';
import ASSETS from './assets.json';
import { SnowView } from './snowView.js';
import { PadView, SURF_LOOK } from './render/padView.js';

const SUN = { day: [25, 45, 18], low: [34, 15, 22] }; // sun offset from the car; snow gets a low raking sun
export const RENDER = {
  shading: 'standard', dpr: { touch: 2, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'aces', exposure: 1.05,
  camera: { fov: 62, fovPortrait: 62, near: 0.1, far: 1500 },
  lights: {
    sky: '#dfeaf2', ground: '#6b5d4a', hemi: 1.1,
    sun: { color: '#fff1dc', intensity: 2.4, map: 2048, box: 30, offset: SUN.day },
    fog: [60, 330],
    presets: { day: { hemi: 1.1, sun: { intensity: 2.4 } }, low: { hemi: 0.85, sun: { intensity: 3.6 } } },
  },
};
```

```js
export class Renderer {
  constructor(gfx) {
    this.gfx = gfx; this.r = gfx.renderer; this.scene = gfx.scene; this.cam = gfx.camera; this.lights = gfx.lights;
    this.camMode = 0; // 0 chase, 1 bumper, 2 bonnet
    this.orbit = false; // title screen: circle the car instead
    const sun = this.lights.sun, sc = sun.shadow.camera;
    sun.shadow.bias = -0.0005; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
    if (!sun.target.parent) this.scene.add(sun.target);
    this.sunOffset = new THREE.Vector3(...SUN.day);
    this.view = null; this.worldToken = 0;
    this.camPos = new THREE.Vector3(0, 4, -8); this.camLook = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3();
    this.setSurface('gravel');
  }

  setLook({ sky, low }) { // on a look change only: preset intensities, sun angle, sky and fog
    this.sunOffset.set(...(low ? SUN.low : SUN.day));
    this.lights.set(low ? 'low' : 'day');
    if (this.scene.background?.isColor) this.scene.background.set(sky); else this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 60, 330);
  }
```

At the end of `updateCamera`, keep the two sun lines but write them through `this.lights.sun`:

```js
    const sun = this.lights.sun;
    sun.position.set(p.x, p.y, p.z).add(this.sunOffset); sun.target.position.set(p.x, p.y, p.z);
```

Delete `resize(w, h)` and `render()`.

- [ ] **Step 4: `src/game.view.js`.**
  - `import { Renderer, RENDER } from './render.js';`
  - Stage `enter`: `renderer ??= new Renderer(view.gfx);`.
  - Delete the `resize` listener and its removal: boot resizes. Keep the `visibilitychange` listener in `off`.
  - Delete `renderer.render()` from `frame`: boot renders after the halves.
  - `return defineView({ scenes: { stage, ...overlayHalves() }, render: RENDER });`
- [ ] **Step 5: `src/main.js`:** pass `canvas: document.getElementById('view')` in boot's options.
- [ ] **Step 6: Run, expect PASS:** `$BROWSER node --test test/render.browser.mjs`. Then `$BROWSER node --test test/e2e.browser.mjs` (4/4) and `$BROWSER node test/mobile.mjs`.
- [ ] **Step 7: Unit suite, goldens bit-exact:** `$UNIT npm test`.
- [ ] **Step 8: Commit:** `git add src/render.js src/game.view.js src/main.js test/render.browser.mjs package.json && git commit -m "feat(rally): draw through the engine renderer and light rig"`

---

### Task 13: Models from `view.assets` (assets.json and bake.mjs retired)

**Files:**
- Modify: `src/render.js` (`setCar`), `src/render/padView.js` (cone geometry), `src/game.view.js` (preload, `#loading`), `src/main.js`, `test/bake.test.mjs` (drop the `assets.json` test), `test/lh-rules.test.mjs` (`assets.json` rule), `test/render.browser.mjs`
- Delete: `src/assets.json`, `bake.mjs`

**Interfaces:**
- Consumes: `view.assets.preload(keys) → Promise` (resolves after `warm`), `view.assets.has`, `view.assets.get(key) → { scene }`, `view.assets.clone(key) → Object3D` (materials compiled by name), `view.materials.get(id, opts)` (§4.7, §4.8).
- Produces: `Renderer.setCar(car, assets, mc)`; `PadView` constructor `(scene, world, kit)` where `kit = { assets, mc }`. `MODELS = ['hatchback-sports', 'sedan-sports', 'cone']`.

**Contract issue:** §4.6 says boot builds `view.assets` from `baked/manifest.json`, "imported by the game's view entry", but not how the manifest reaches boot. This plan passes it as `render.manifest` (with `render.assetsBase: './assets/'`). If 3e/3f chose another field (for example `boot(..., { manifest })`), use theirs and record it.

- [ ] **Step 1: Failing test.** Append to `test/lh-rules.test.mjs`:

```js
test('no game file imports assets.json (overview §1.3)', () => {
  const hits = files(SRC).filter(f => /assets\.json/.test(stripComments(readFileSync(f, 'utf8'))));
  assert.deepEqual(hits, []);
});
```

Add to each `render.browser.mjs` test, after the settle:

```js
      assert.equal(await game.page.evaluate(() => !!document.getElementById('loading')), false, '#loading removed after preload');
```

- [ ] **Step 2: Run, expect FAIL** (`render.js` and `padView.js` import `assets.json`): `$UNIT node --test --test-concurrency=4 test/lh-rules.test.mjs`
- [ ] **Step 3: `src/render.js`.** Drop `import ASSETS`, `geomFromPart` and `repaint`, which is unused at e03ed71 (`grep -n repaint src` shows only its definition). The new `setCar`:

```js
  // The car from the baked model: the body (and spoiler) in a shell scaled to the real car's track and wheelbase,
  // and four wheels recentred on their hubs (as the old geomFromPart(part, true) did) in tyre material.
  setCar(car, assets, mc) {
    if (this.carGroup) this.scene.remove(this.carGroup);
    if (this.oldWheels) this.oldWheels.forEach((m) => this.scene.remove(m));
    const cfg = car.cfg, [sx, sy, sz] = cfg.body.scale;
    const tpl = assets.clone(cfg.model), g = new THREE.Group(), shell = new THREE.Group();
    for (const n of [...tpl.children]) if (!n.name.startsWith('wheel')) shell.add(n);
    shell.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    shell.scale.set(sx, sy, sz);
    shell.position.set(0, -cfg.comHeight + cfg.radius - 0.3 * sy, car.zMid);
    g.add(shell);
    this.scene.add(g);
    const ws = cfg.radius / 0.3, tyre = mc.get('tyre', { vertexColors: true }), box = new THREE.Box3(), c = new THREE.Vector3();
    this.wheelMeshes = car.wheels.map((w) => {
      const src = assets.clone(cfg.model).getObjectByName(w.left ? 'wheel-front-left' : 'wheel-front-right');
      src.removeFromParent(); src.position.set(0, 0, 0); src.updateMatrixWorld(true);
      box.setFromObject(src).getCenter(c); src.position.sub(c); // recentred on the hub
      src.traverse((o) => { if (o.isMesh) { o.material = tyre; o.castShadow = true; } });
      const m = new THREE.Group(); m.scale.setScalar(ws); m.add(src); this.scene.add(m); return m;
    });
    this.oldWheels = this.wheelMeshes;
    this.carGroup = g;
  }
```

`setWorld` passes the kit to views: `new PadView(this.scene, world, this.kit)` and `new View(this.scene, world, this.kit)`. Add `this.kit = null;` to the constructor and `setKit(kit) { this.kit = kit; }`. `setSurface` and the pad path stay as they are.

- [ ] **Step 4: `src/render/padView.js`.** Drop `import ASSETS` and `geomFromPart`. The constructor becomes `(scene, world, kit)`. The cone geometry, from the baked model in model space, recentred and scaled as before:

```js
    const tpl = kit.assets.get('cone').scene; tpl.updateMatrixWorld(true);
    let src = null; tpl.traverse((o) => { if (o.isMesh && !src) src = o; });
    const coneG = src.geometry.clone().applyMatrix4(src.matrixWorld); // dequantised, in model space
    coneG.center(); coneG.scale(1.6, 1.6, 1.6);
```

The rest is unchanged for now. Task 14 swaps the material and Task 15 the instancing.

- [ ] **Step 5: `src/game.view.js`.**
  - `import MANIFEST from '../baked/manifest.json';`
  - `export const MODELS = ['hatchback-sports', 'sedan-sports', 'cone'];`
  - `render: { ...RENDER, manifest: MANIFEST, assetsBase: './assets/' }` in `defineView`.
  - In stage `enter`, after `renderer ??= …`:

    ```js
    renderer.setKit({ assets: view.assets, mc: view.materials });
    ready = false;
    view.wait(view.assets.preload(MODELS).then(() => { ready = true; doc.getElementById('loading')?.remove(); }));
    ```

    Here `let ready = false` sits next to `renderer`.
  - In `frame`, return right after the toast block (before any `renderer.*` call) while `!ready`. In the `newWorld || carRev` branch, call `renderer.setCar(s.sim.car, view.assets, view.materials)`.
  - `src/main.js`: delete `document.getElementById('loading')?.remove();`. The view removes it after the preload.
- [ ] **Step 6: Retire the old bake.** `git rm src/assets.json bake.mjs`. Delete the "today's assets.json counts" test from `test/bake.test.mjs`. In `src/render.js`, `src/render/padView.js` and `src/render/trackView.js`, fix any remaining comment that names `assets.json`.
- [ ] **Step 7: Run, expect PASS:**
  - `$UNIT npm test` (goldens bit-exact);
  - `$BROWSER node --test test/render.browser.mjs`;
  - `$BROWSER node --test test/e2e.browser.mjs`;
  - `$BROWSER node test/mobile.mjs`;
  - also `SHOTS=$SCRATCH/shots-T15 $BROWSER node test/mobile.mjs iPad` and look at one screenshot: the car is drawn, with wheels on its hubs.
- [ ] **Step 8: Commit:** `git add -A src test bake.mjs && git commit -m "feat(rally): models from the engine asset loader; assets.json and bake.mjs retired"`

---

### Task 14: Materials from the compiler

**Files:**
- Modify: `src/render/trackView.js`, `src/render/padView.js`

**Interfaces:**
- Consumes: `view.materials.get(id, { instanced, vertexColors, map })` (§4.8); `materialOf(key)` (`src/surface.js`).
- Produces: no new interface. Track and pad views take every standard-look material from the compiler.

**Decision (judgment):** these stay raw three.js materials, each with a one-line comment saying why:
- the grass-cover shader (wind and fade `onBeforeCompile`, game-specific);
- the snow view;
- the gate banner face (a per-gate canvas texture with an emissive map);
- the pad's painted lines (`MeshBasicMaterial`, transparent).

The detail and pad-surface textures become module-level singletons. The compiler's cache key includes `map.uuid`, so a per-track texture would leak one compiled material per rebuild. The road keeps its polygon offset by setting it on the `rally-road` material; that id has no other user.

- [ ] **Step 1: Failing check.** Extend `test/render.browser.mjs` with a program-count test that pins the expected sharing:

```js
test('track: compiler materials keep the program count within today + 2 (§8 R1)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 4, mode: 'freeDrive', world: 'loop', seed: 'r1' } } });
  try {
    await game.page.waitForFunction(() => window.engine.settled()); await game.render();
    const n = await game.page.evaluate(() => window.engine.view?.gfx?.renderer?.info.programs.length ?? -1);
    assert.ok(n > 0 && n <= Number(process.env.RALLY_PROGRAMS_MAX ?? 99), `programs ${n}`);
  } finally { await game.close(); }
});
```

Set `RALLY_PROGRAMS_MAX` to the Task 1 `track-summer` programs + 2 in the run command below. If `window.engine.view.gfx` is not exposed by the hook, read `programCount` through `window.engine.debug` instead and record it.

- [ ] **Step 2: Run, expect FAIL or a high count:** `RALLY_PROGRAMS_MAX=<before+2> $BROWSER node --test test/render.browser.mjs`.
- [ ] **Step 3: `src/render/trackView.js`.**
  - The constructor takes `(scene, world, kit)` and sets `this.mc = kit.mc`.
  - `detailTexture(contrast)` becomes cached per contrast in a module `Map`, and `TrackView` no longer adds them to `this.textures`.
  - Materials:
    - `this.terrainMat = this.mc.get('rally-ground', { vertexColors: true, map: this.groundDetail })`;
    - in `buildRoad`: `const mat = this.mc.get('rally-road', { vertexColors: true, map: this.detail }); mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;` with the comment "rally-road's only user";
    - markers: `this.mc.get('marker', { instanced: true, vertexColors: true })`;
    - gate posts: `this.mc.get('gate-post')`;
    - banner edges: `this.mc.get('gate-banner')`;
    - the banner face stays raw, wrapped in `this.mat(...)` (comment);
    - the cover material stays raw (comment).
  - `dispose()` disposes only `this.materials` (raw ones) and `this.textures` (banners).
- [ ] **Step 4: `src/render/padView.js`.**
  - Ground: `this.groundMat = null`. In `setSurface(key)`:

    ```js
    this.ground.material = this.kit.mc.get(materialOf(key === 'snow' ? 'packed' : key), { map: surfaceTextureOf(key, this.world.pad.size / 8) });
    ```

    Here `surfaceTextureOf` caches one texture per `(key, repeat)` at module level. Delete the roughness lines; roughness is the material's `look`.
  - Props: `this.kit.mc.get('pad-prop')`. Stripes: `this.kit.mc.get('pad-stripe')`. Cones: `this.kit.mc.get('cone', { instanced: true, vertexColors: true })`.
  - The paint material stays raw (comment).
  - `dispose()` removes the root and disposes geometries only, plus the raw paint material.
  - Import `materialOf` from `../surface.js`.
- [ ] **Step 5: Run, expect PASS:**
  - `RALLY_PROGRAMS_MAX=<before+2> $BROWSER node --test test/render.browser.mjs`;
  - `$BROWSER node --test test/e2e.browser.mjs`;
  - `SHOTS=$SCRATCH/shots-T16 $BROWSER node test/mobile.mjs`. Compare a pad and a track shot with `$SCRATCH/shots-T15` by eye: same palette, ice glossy, tarmac darker.
  - `$UNIT npm test` (goldens bit-exact).
- [ ] **Step 6: Commit:** `git add src/render && git commit -m "feat(rally): track and pad materials from the engine material compiler"`

---

### Task 15: Props and the car from the transform pool; instancing through the engine

**Files:**
- Modify: `src/render.js` (`sync`), `src/render/padView.js`, `src/render/trackView.js`

**Interfaces:**
- Consumes: `e.xf.p` and `e.xf.q` (pool accessors on the current slot, §4.4); `createInstances({ geometry, material, max, castShadow, receiveShadow }) → { mesh, set(i, p, q, s), commit() }` (§4.9).
- Produces: no new interface.

**Decision:** Rally draws its car and props from the pool's **current** slot, not interpolated, as today.
- The wheel state (`w.center`, `w.steer`, `w.spin`) is per step and is not in the pool. Interpolating the body alone would slide the body against its wheels by up to one 240 Hz step.
- The car entity is `draw: false` (Task 9). Props have no `model`, so view sync draws neither.
- This goes in the notes as a field note candidate: "per-step attachments (wheels) need pool slots or an alpha-free draw path".

- [ ] **Step 1: Failing check.** Append to `test/lh-rules.test.mjs`:

```js
test('the views read poses from the pool, not from Rapier (no per-frame Rapier vectors)', () => {
  for (const f of ['render.js', 'render/padView.js', 'render/trackView.js']) {
    const s = stripComments(readFileSync(join(SRC, f), 'utf8'));
    assert.equal(/\.body\.(translation|rotation)\(\)/.test(s), false, f);
  }
});
```

- [ ] **Step 2: Run, expect FAIL** (`render.js` `sync` reads `b.translation()`, and the views do too).
- [ ] **Step 3: `src/render/trackView.js` markers.** Add `import { createInstances } from 'lion-hawk/view';`. In `buildMarkers`:

```js
    const inst = this.markerInst = createInstances({ geometry: postGeometry(), material: this.mc.get('marker', { instanced: true, vertexColors: true }),
      max: Math.max(1, count), castShadow: true, receiveShadow: true });
    this.markers = inst.mesh; this.markers.frustumCulled = false;
```

Keep the home-pose fill for a world without props, using `inst.set(i, pos, quat, 1)` with scratch objects made once, then `inst.commit()`. In `sync`:

```js
    for (let i = 0; i < props.length; i++) { const xf = props[i].e.xf; this.markerInst.set(i, xf.p, xf.q, 1); }
    this.markerInst.commit();
```

In `sync`, the LOD focus without a camera becomes `sim?.car?.e.xf.p`.

- [ ] **Step 4: `src/render/padView.js` cones.** Use `createInstances({ geometry: coneG, material: …cone…, max: Math.max(1, world.props.length), castShadow: true })` and keep `this.conesInst`. In `sync`, with `this.at = { x: 0, y: 0, z: 0 }` made once:

```js
  sync() {
    const props = this.world.props;
    for (let i = 0; i < props.length; i++) {
      const c = props[i], p = c.e.xf.p; this.at.x = p.x; this.at.y = p.y - c.home.y; this.at.z = p.z;
      this.conesInst.set(i, this.at, c.e.xf.q, 1);
    }
    this.conesInst.commit();
  }
```

- [ ] **Step 5: `src/render.js` `sync`.** Read the car from `car.e.xf`. Hoist `steerQ`, `spinQ`, `Y` and `X` into the constructor (`this.steerQ` etc.). Replace `b.translation()` and `b.rotation()` with `xf.p` and `xf.q`. In `sync`, the snow view's `p` becomes `xf.p`.
- [ ] **Step 6: Run, expect PASS:**
  - `$UNIT node --test --test-concurrency=4 test/lh-rules.test.mjs`;
  - `$BROWSER node --test test/render.browser.mjs`;
  - `$BROWSER node --test test/e2e.browser.mjs`;
  - a markers check by eye: `SHOTS=$SCRATCH/shots-T17 $BROWSER node test/mobile.mjs iPad`, track scene, posts upright along the road;
  - `$UNIT npm test` (goldens bit-exact).
- [ ] **Step 7: Commit:** `git add src && git commit -m "feat(rally): props and car drawn from the transform pool with engine instancing"`

---

### Task 16 (judgment): The cameras as an allocation-free module

**Files:**
- Create: `src/render/camera.js`, `test/camera.test.mjs`, `test/goldens/camera.json`
- Modify: `src/render.js` (`updateCamera` delegates)

**Interfaces:**
- Consumes: `golden` (`lion-hawk/test`), a `THREE.PerspectiveCamera`.
- Produces: `createRallyCamera(cam) → { update(car, { orbit, mode, dt }) }`, where `car` is `{ p, q, v, zFront }` (plain objects).

**Decision (expected):** keep Rally's own camera rather than `createChaseRig` and `createMountRig`.
- The chase blends body heading with travel direction and widens the FOV with speed. Those are tuned feel the rig's `{ distance, height, lag, lookAhead }` does not express.
- The Kenney cars have no `sock-*` empties for a mount rig.
- The camera code moves into a module with scratch vectors (no `new` per frame).
- Record this in "Decisions" and as a field note candidate.

- [ ] **Step 1: Failing test** `test/camera.test.mjs`. This is a characterisation golden over a scripted 4 s trajectory through all four modes, run in Node: three's math needs no WebGL.

```js
// Rally's cameras (chase with travel-direction blend and speed FOV, title orbit, bumper, bonnet): a characterisation
// golden of camera position, look direction and FOV along a scripted trajectory. Re-bless only for a deliberate change.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { golden, checksum } from 'lion-hawk/test';
import { createRallyCamera } from '../src/render/camera.js';

function trace() {
  const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1500), rig = createRallyCamera(cam), out = [];
  const car = { p: { x: 0, y: 0.5, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, zFront: 1.2 };
  const d = new THREE.Vector3();
  for (let i = 0; i < 240; i++) {
    const t = i / 60, yaw = 0.4 * Math.sin(t), sp = 25 * Math.min(1, t / 2);
    car.q.y = Math.sin(yaw / 2); car.q.w = Math.cos(yaw / 2);
    car.v.x = Math.sin(yaw + 0.3 * Math.sin(3 * t)) * sp; car.v.z = Math.cos(yaw + 0.3 * Math.sin(3 * t)) * sp;
    car.p.x += car.v.x / 60; car.p.z += car.v.z / 60;
    const mode = i < 60 ? 'orbit' : i < 180 ? 0 : i < 210 ? 1 : 2;
    rig.update(car, { orbit: mode === 'orbit', mode: mode === 'orbit' ? 0 : mode, dt: 1 / 60 });
    if (i % 10 === 9) { cam.getWorldDirection(d); out.push(checksum({ p: cam.position.toArray(), d: d.toArray(), fov: cam.fov })); }
  }
  return out;
}
test('camera trace golden', () => { golden(new URL('./goldens/camera.json', import.meta.url), trace()); });
```

The no-allocation check is a source scan, added in Step 5 once `update` has been rewritten.

- [ ] **Step 2: Bless against today's code first** (the characterisation step):
  1. Write `src/render/camera.js` as a **direct move** of today's `Renderer.updateCamera` body. Allocations stay as they are, and it reads `car.p/q/v/zFront` where the old code read the body (`zFront` = `car.wheels[0].local.z`).
  2. `$UNIT -E LH_BLESS=1 node --test --test-concurrency=4 test/camera.test.mjs`
  3. Make `Renderer.updateCamera(sim, dt)` call `this.camRig.update({ p: xf.p, q: xf.q, v: b.linvel(), zFront: car.wheels[0].local.z }, { orbit: this.orbit, mode: this.camMode, dt })`, with the sun lines kept after it.
  4. Commit the golden with the moved code: `git add src/render/camera.js src/render.js test/camera.test.mjs test/goldens/camera.json && git commit -m "refactor(rally): cameras moved into render/camera.js with a characterisation golden"`
- [ ] **Step 3: Rewrite `update` with scratch objects** (the goal of this task). All `THREE.Vector3`/`Quaternion` values are created in `createRallyCamera`. `clone()` becomes `copy()` into scratch, and `new THREE.Vector3(0, 2.4, 0)` becomes a constant `UP24`. The orbit angle and `chaseDir` live in the closure (`chaseDir` with a `hasChase` flag in place of `null`). The arithmetic order is kept operation for operation, so the golden holds.
- [ ] **Step 4: Run, expect PASS (golden unchanged):** `$UNIT node --test --test-concurrency=4 test/camera.test.mjs`. Prove the golden can fail by changing the chase distance 6.8 → 6.9: expect FAIL, then restore.
- [ ] **Step 5: Allocation scan.** Add to `test/camera.test.mjs`:

```js
import { readFileSync } from 'node:fs';
test('update() allocates nothing (no `new` or clone() inside it)', () => {
  const s = readFileSync(new URL('../src/render/camera.js', import.meta.url), 'utf8');
  const body = s.slice(s.indexOf('update('));
  assert.equal(/\bnew\s|\.clone\(\)/.test(body), false);
});
```

Run it and expect PASS. Before Step 3, the same test would have failed; note it in the commit message.
- [ ] **Step 6: Browser and goldens:** `$BROWSER node --test test/e2e.browser.mjs`; `$UNIT npm test`.
- [ ] **Step 7: Commit:** `git add src/render/camera.js test/camera.test.mjs && git commit -m "perf(rally): cameras allocate nothing per frame"`

---

### Task 17: Frame-rate, draw-call and program record (§8 R1)

**Files:**
- Modify: notes only

- [ ] **Step 1: Build:** `cd $W/games/rally && RALLY_OUT=$SCRATCH/rally-after npx lion-hawk build`.
- [ ] **Step 2: Measure:** `$BROWSER node test/perf.mjs $SCRATCH/rally-after > $SCRATCH/perf-after.json`.
- [ ] **Step 3: Gate.** Per scene: `programs ≤ before + 2` and `calls ≤ before`.
  - If calls rose, find the cause (for example a material split instanced/plain, M-13) and fix it in Rally's view, then re-measure.
  - Frame ms under SwiftShader is informational. A median regression over 10 % is recorded as a field note candidate with both tables.
- [ ] **Step 4: Record** a "Frame rate (R1)" table in the notes: scene × {programs, calls, frameMs} before and after.
  - Add the user item: "iPad `?fps` on the same scenes, today's release vs this build; if the median frame time regresses > 10 %, set `shading: 'lambert'` in `RENDER` (D5)".
  - If `?fps` does not exist in Rally, say so. It is not added in phase 3; the user reads Safari's frame meter instead.
- [ ] **Step 5: Commit:** `git add docs && git commit -m "docs(rally): frame-rate, draw-call and program record after the view migration"`

---

## Part C: final pass

### Task 18: Restore the stage view's `built` hook (#50)

**Files:**
- Create: `test/built.browser.mjs`
- Modify: `src/game.view.js`, `src/render.js` (track marker attribute), `package.json` (`test:e2e`)

**Interfaces:**
- Consumes: the view-half `built(engine, view)` hook ([S-6], called right after a load's build, before settle); `view.wait`; `game.untilLoaded()` (`lion-hawk/playwright`).
- Produces: `<html data-rally-track="<seed>|pad">`, set when a world's view is in the scene.

- [ ] **Step 1: Failing test** `test/built.browser.mjs`:

```js
// #50 restored: a track rebuild's load settles only once the new track view is in the scene (the stage view's
// `built` hook holds it with view.wait), so a test that waits for the load sees the new track at once.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally();
});
after(async () => { await chrome?.close(); await site?.close(); });

test('a seed change: the load ends with the new track view in place', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'b1' } } });
  try {
    await game.page.waitForFunction(() => window.engine.settled());
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.rallyTrack), 'b1');
    await game.fill('title.seed', 'b2');
    await game.untilLoaded();
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.rallyTrack), 'b2');
  } finally { await game.close(); }
});
```

- [ ] **Step 2: Run, expect FAIL** (`dataRallyTrack` undefined): `$BROWSER node --test test/built.browser.mjs`
- [ ] **Step 3: Implement.**
  - `src/render.js` `setWorld`: when the view is in the scene (the pad branch, and inside the track `then` after `this.view = new View(…)`), set `document.documentElement.dataset.rallyTrack = world.track?.seed ?? 'pad';`. The `Renderer` keeps a `doc` (`this.doc = gfx.renderer.domElement.ownerDocument`) for this.
  - `src/game.view.js` stage half:

```js
    // [S-6] #50: a load's build hands the new world to the renderer here, so view.wait holds the settle until the track
    // view is in the scene (frame() only catches worlds made outside a load: the first enter and car changes).
    built(engine, view) {
      const s = engine.scene.state; if (!s.sim || !seen || !ready) return;
      seen.builtRev = s.worldRev;
      view.wait(renderer.setWorld(s.world));
    },
```

  - In `frame`, the `newWorld` branch becomes `if (newWorld) { if (s.worldRev !== seen.builtRev || s !== seen.s) view.wait(renderer.setWorld(s.world)); seen.surface = null; seen.units = null; }`.
  - Initialise `builtRev: -1` in `seen`.
- [ ] **Step 4: Run, expect PASS:** `$BROWSER node --test test/built.browser.mjs`.
- [ ] **Step 5: Mutation (Review Focus 5).** In `built`, drop the `view.wait(...)` wrapper (call `renderer.setWorld(s.world)` bare). Run, and expect FAIL with `b1` still showing after `untilLoaded`. Restore it. If the test still passes, the frame path also holds the load. Then also drop `view.wait` in `frame`'s branch to see it red, and record that both paths block.
- [ ] **Step 6: Suites:** `$BROWSER node --test test/e2e.browser.mjs`; `$UNIT npm test`. Add `test/built.browser.mjs` to `test:e2e`.
- [ ] **Step 7: Commit:** `git add src test package.json && git commit -m "fix(rally): restore the stage view's built hook so a track load settles with its view (#50)"`

---

### Task 19: Screen state from `data-lh-*`, not body classes

**Files:**
- Modify: `index.template.html`, `src/game.view.js`, `test/e2e.browser.mjs`

**Interfaces:**
- Consumes: `<html data-lh-scene>` and `data-lh-overlays` (space-separated; uiDom).
- Produces: the body keeps only game-state classes: `onTrack`, `manual` and `timed`. The engine-state classes `scr-title`, `scr-play` and `menuOpen` are gone.

- [ ] **Step 1: Failing test.** In `test/e2e.browser.mjs`:
  - The `body()` helper reads `[...document.body.classList].filter(c => /^(scr-|menuOpen|onTrack|manual)/.test(c))`. Change the expectations to the game classes only: `['onTrack']`, `['manual', 'onTrack']` and `['onTrack']` in the three places (lines ~88, ~95, ~104).
  - Add next to each a check of the attribute: `assert.equal(await game.page.evaluate(() => document.documentElement.dataset.lhOverlays), '<pause|title|>')`, using the overlay each case has open.
  - Replace line ~31's `classList.contains('scr-play')` with `!(document.documentElement.dataset.lhOverlays ?? '').split(' ').includes('title')`.
- [ ] **Step 2: Run, expect FAIL** (the body still has `scr-play`): `$BROWSER node --test test/e2e.browser.mjs`
- [ ] **Step 3: Template CSS** (lines 133–142). Rewrite the comment, then:

```css
/* Screens (spec tracks T-26) from the engine's own state: the title overlay shows the menu over the live scene;
   otherwise the driving HUD and touch controls; pause or results hide the touch controls. */
html[data-lh-overlays~="title"] #dash, html[data-lh-overlays~="title"] .touch, html[data-lh-overlays~="title"] .bar,
html[data-lh-overlays~="title"] #hud, html[data-lh-overlays~="pause"] .touch, html[data-lh-overlays~="results"] .touch { display: none !important; }
html[data-lh-overlays~="title"] #title { display: flex; }
```

Run `grep -n "scr-\|menuOpen" index.template.html src test` and fix every remaining hit (including `test/mobile.mjs`, if it uses them).
- [ ] **Step 4: `src/game.view.js`:** `STAGE_CLASSES = ['onTrack', 'manual']`. Delete the three `cls(doc, 'scr-…')` and `cls(doc, 'menuOpen', …)` lines.
- [ ] **Step 5: Run, expect PASS:** `$BROWSER node --test test/e2e.browser.mjs`, then `$BROWSER node test/mobile.mjs` (layout per device unchanged).
- [ ] **Step 6: Commit:** `git add index.template.html src/game.view.js test && git commit -m "refactor(rally): screens follow data-lh-overlays; engine-state body classes removed"`

---

### Task 20: Keep `ctx` out of the stage state

**Files:**
- Modify: `src/game/stage.js`, `test/flow.test.mjs`

**Interfaces:**
- Produces: the stage state holds only data and sim objects. The scene's `ctx` lives in a `WeakMap` keyed by the state object.

- [ ] **Step 1: Failing test.** Append to `test/flow.test.mjs`:

```js
test('the stage state never holds the scene ctx (serialisable state, 2d carry-over)', () => {
  const h = headless(game(), { args: STAGE });
  assert.equal('ctx' in h.engine.scene.state, false);
  h.fill('title.seed', 'ctx2'); // a rebuild through ctx.load still works
  h.until(x => x.state().phase === 'title' && x.state().seed === 'ctx2', { maxSeconds: 5, message: 'rebuilt' });
});
```

- [ ] **Step 2: Run, expect FAIL** (`'ctx' in state` is true): `$UNIT node --test --test-concurrency=4 test/flow.test.mjs`
- [ ] **Step 3: `src/game/stage.js`.**
  - Inside `makeStage`: `const ctxOf = new WeakMap(); // stage state → its scene ctx (kept out of the state, which stays data)`.
  - In `enter`: remove `ctx,` from the `Object.assign`, and after it add `ctxOf.set(s, ctx);`.
  - In `startLoad`: `ctxOf.get(s).load({ … })`.
  - In `exit`: `ctxOf.delete(ctx.state);` after the dispose.
- [ ] **Step 4: Run, expect PASS.** Then `$UNIT npm test` (goldens bit-exact).
- [ ] **Step 5: Commit:** `git add src/game/stage.js test/flow.test.mjs && git commit -m "refactor(rally): the stage keeps its ctx outside the scene state"`

---

### Task 21: `lion-hawk dev`; build, size and offline (§8 R3)

**Files:**
- Create: `test/offline.browser.mjs`
- Modify: `package.json` (`"dev": "lion-hawk dev"`), notes
- Delete: `dev.mjs`

- [ ] **Step 1: Failing test** `test/offline.browser.mjs`:

```js
// The built game loads offline after the first visit (overview §8 R3): serves a `lion-hawk build` output with the
// service worker allowed, then reloads with the network off. Run: RALLY_BUILD=<dir> node --test test/offline.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from 'lion-hawk/playwright';
import { serveDir } from './serve.mjs';

test('offline after the first visit', async t => {
  const dir = process.env.RALLY_BUILD;
  if (!dir) return t.skip('set RALLY_BUILD to a lion-hawk build output');
  const chrome = await launch(), site = await serveDir(dir);
  try {
    const ctx = await chrome.browser.newContext({ serviceWorkers: 'allow' }), page = await ctx.newPage();
    const settled = () => page.waitForFunction(() => window.engine?.settled?.() === true, null, { timeout: 60000 });
    await page.goto(site.url); await settled();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await settled(); // now controlled by the worker
    await ctx.setOffline(true);
    await page.reload(); await settled();
    assert.equal(await page.evaluate(() => window.engine.state().scene), 'stage');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/models/')).length > 0), true);
    await ctx.close();
  } finally { await chrome.close(); await site.close(); }
});
```

- [ ] **Step 2: Run against a build whose worker caches no models, expect FAIL.** Build, then temporarily edit `$SCRATCH/rally-after/sw.js` to `const PRECACHE = ['./'];`:

  ```bash
  RALLY_OUT=$SCRATCH/rally-after npx lion-hawk build
  sed -i "s/^const PRECACHE = .*/const PRECACHE = ['.\/'];/" $SCRATCH/rally-after/sw.js
  RALLY_BUILD=$SCRATCH/rally-after $BROWSER node --test test/offline.browser.mjs
  ```

  Expect FAIL: offline, the models are not cached, the preload rejects, and the page never settles.
- [ ] **Step 3: Rebuild clean and run, expect PASS:** `RALLY_OUT=$SCRATCH/rally-after npx lion-hawk build && RALLY_BUILD=$SCRATCH/rally-after $BROWSER node --test test/offline.browser.mjs`.
- [ ] **Step 4: Size and load (R3).**
  - Compare the build's printed size report (total gzip) with Task 1's single file. Budget: ≤ today + 10 %.
  - Run `$BROWSER node test/perf.mjs $SCRATCH/rally-after` and compare `settleMs` with Task 1. Budget: ≤ today + 20 %.
  - If over budget, record both numbers and the largest contributor (bundle vs models) in the notes as a field note candidate, and tell the user. Do not trim features to fit.
- [ ] **Step 5: `lion-hawk dev`.** Set `"dev": "lion-hawk dev"` in `package.json`.
  - Run `npx lion-hawk dev --port 8741` in the background for ~10 s.
  - `curl -s localhost:8741/ | grep -c '<canvas id="view"'` must give 1.
  - `curl -sI localhost:8741/assets/models/cone.glb | head -1` must give 200.
  - Stop it. If it works, `git rm dev.mjs`. If not, keep `dev.mjs`, record why under "Contract issues", and skip the delete.
- [ ] **Step 6: Commit:** `git add -A package.json dev.mjs test/offline.browser.mjs docs && git commit -m "build(rally): lion-hawk dev replaces dev.mjs; offline test; size and load record"`

---

### Task 22: Version 0.4.0 and notes

**Files:**
- Modify: `package.json` (`"version": "0.4.0"`, `"description": "Rally sim on lion-hawk"`), notes

- [ ] **Step 1: Run everything once more, one browser suite at a time:**
  - `$UNIT npm test`;
  - `$BROWSER node --test test/e2e.browser.mjs test/render.browser.mjs test/built.browser.mjs`;
  - `$BROWSER node test/mobile.mjs`;
  - `RALLY_BUILD=$SCRATCH/rally-after $BROWSER node --test test/offline.browser.mjs`;
  - the workspace: `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$W/games -E NODE_OPTIONS=--max-old-space-size=512 npm test`.

  Record each count in the notes.
- [ ] **Step 2: Rules check:** `grep -rn "assets.json\|new R.World\|ColliderDesc\|build.py\|bake.mjs" src` returns nothing. `grep -rn "lh-allow" src` lists exactly `massProps` (vehicle) and the wheel ray; copy both lines into the notes.
- [ ] **Step 3: Finish the notes:**
  - outcome;
  - the re-bless table (Tasks 7–9);
  - the R1 and R3 records;
  - decisions (ids, cone hull, camera kept, car drawn from curr, raw shader materials, `weld: false`, terrain mesh kept; see below);
  - contract issues as raised;
  - field note candidates;
  - user items: an iPad `?fps` run, a feel playtest after the re-blessings (hull strikes, posts, cones on the pad), and a rebuild before any deploy.
- [ ] **Step 4: Commit:** `git add package.json docs && git commit -m "chore(rally): 0.4.0 on lion-hawk phase 3"`

---

## Terrain mesh: not adopted (decision recorded in Task 22's notes)

Rally keeps its chunked terrain view (`TrackView.buildChunk`, `updateLod`), and does not switch to `createTerrainMesh`. §4.10's options (`chunks`, `lods`, `colorAt`, `material`) have no hook for any of these:
- sinking coarse LODs under the road (`DROP`), which stops the road poking through;
- the detail map;
- the LOD distances with hysteresis;
- the per-frame build budget;
- skirts.

Rally's mesh already reads the same heights the kit's heightfield uses. Field note candidate: "`createTerrainMesh` needs `dropAt(x, z, lod)`, `map`, `lodFar` and a build budget for Rally to adopt it."

## Done when

- `$UNIT npm test` in `games/rally` passes. That covers all `test/*.test.mjs` and the scripts (`gen-*`, `physics`, `snow`, `markers`, `verge`, `track`, `wild`, `game`). It includes the new `materials`, `surface`, `lh-world`, `lh-rules`, `lh-checks`, `bake` and `camera` tests.
- The browser suites pass, one at a time: `test:e2e` (e2e 4/4 plus render, built), `test:mobile` (all checks, ≥ today's 797), and `test:offline` against `$SCRATCH/rally-after`.
- The workspace `npm test` in `games/` passes.
- Goldens:
  - `stage-autopilot.json` and `stage-scene.json` were re-blessed at most three times (Tasks 7, 8, 9), each under §5.5, with feel within tolerance and recorded in the notes;
  - they are bit-exact through Tasks 3, 4, 5, 6, 10, 11 and every view task;
  - `camera.json` was blessed once (Task 16 Step 2).
- §1.3: `test/lh-rules.test.mjs` passes:
  - no `assets.json`, `new RAPIER.World`, `ColliderDesc` or literal friction, density or restitution in `src/` outside the registry;
  - `lh-allow` appears only on `massProps` and the wheel ray.
- `lion-hawk build --out $SCRATCH/rally-after` builds, and the size report, settle time and R1 table are in the notes.
- Rally is version 0.4.0 on `feat/lion-hawk-3-rally`, ready for the integrator to merge into `feat/lion-hawk-3` after engine 0.9.0 (Wave B). Nothing is pushed or deployed.

## Notes

The notes file is `$W/games/rally/docs/plans/2026-10-13-phase-3j-rally-notes.md`. It sits inside this plan's ownership; the integrator copies it into the engine's `docs/plans/`. Its sections:
- Baselines;
- Golden re-blessings (task, cause, feel table, commit);
- Frame rate (R1);
- Size and load (R3);
- Decisions;
- Contract issues;
- **Field note candidates** (the integrator numbers them from #110). Seeded with:
  - per-step attachments (wheels) vs pool interpolation;
  - `createChaseRig` cannot express Rally's travel-blend chase or speed FOV;
  - `createTerrainMesh` hooks;
  - light-rig presets cannot move the sun;
  - compiler cache keyed by `map.uuid` leaks with per-instance textures;
  - a `cone` collider shape.

## Contract issues

1. **Rounded box.** §4.3 inline and sidecar entries have no rounded box. Rally's hull is a `roundCuboid` (0.2 m edges). This plan uses `{ shape: 'box', half, round }` and asks 3c to map `round` to `ColliderDesc.roundCuboid`. Fallback: a 56-point hull (Task 9), with a new golden cause and a user playtest.
2. **Rapier in the declaration file.** §4.1's example imports Rapier in the game declaration file, which constraint 1 forbids in the sim tree. Rally injects it instead: `rallyGame({ rapier })`, with the entry and tests importing Rapier.
3. **Base ids.** §4.2 does not say whether a game entry may reuse a base id. Rally avoids the question with `rally-*` surface ids.
4. **Terrain collider material.** §4.10 `createTerrain` has no collider material for its heightfield entity. Rally passes `material: 'rally-ground'`.
5. **Check arguments.** §4.4 `checks.determinism` and `checks.zeroAlloc` take no start `args`, and `input` is unspecified. Rally passes `args`, and `input` as a policy function.
6. **The manifest.** §4.6/§4.7 do not say how boot receives the asset manifest. Rally passes `render.manifest` and `render.assetsBase`.
7. **`<!--APP-->`.** §4.3 does not say what replaces `<!--APP-->`. Rally assumes an inline `<script>` holding the bundle.
8. **Game-plan notes.** Overview §5.2 puts notes in "the sub-plan's own `…-notes.md`", but a game plan cannot write to the engine repo. Rally's notes live under `games/rally/docs/plans/`, and the integrator copies them.

## Integrator requests

1. After Task 22, update `$W/games/package-lock.json` for Rally 0.4.0. A later prune of Rally's now-unused dependencies (`pngjs`, `@gltf-transform/core`, `esbuild` once `serve.mjs` no longer needs it directly) is also yours.
2. Copy `games/rally/docs/plans/2026-10-13-phase-3j-rally-notes.md` into the engine's `docs/plans/`, and number its field note candidates from #110.
3. Reconcile contract issues 1, 4, 5 and 6 with 3c, 3h and 3e/3f before 0.8.0 and 0.9.0 are tagged. Rally's tasks 9, 10, 11 and 13 depend on the answers.
4. Tell the 3j worktree when 0.8.0 and 0.9.0 are integrated (constraint 13 gates).
