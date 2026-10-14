# Phase 3: contract issues raised by the plan writers

The controller's rulings on gaps or conflicts in `2026-10-13-phase-3-overview.md` §4. Plans follow these where they differ from the overview text.

## User decisions (2026-10-13)

- NET_VERSION 4 for Tractor (1.8.0 and 1.9.0 rooms do not mix): approved.
- Pig Pens source GLBs vendored from `~/Downloads/Kenney Game Assets All-in-1 3.7.0`: approved.
- Multiplayer tractors are solid (`driven` remotes) and a tractor-to-tractor collision honks (debounced): 3i and 3l.

## User decisions (2026-10-14)

- Spec deltas D1–D9 (overview §2): approved as written. 3a Task 10 part A is unblocked.
- Execution: subagent-driven, parallel worktrees per 3m, in dependency waves with gated `--ff-only` merges.
- No review gate after the reconciliation pass: commit it and start execution.
- Every game moves fully onto the engine. No plan may fall back to keeping a game's own copy of something the engine provides (camera, terrain mesh, particles, materials, physics…). If the engine piece can't match today's feel, the game step stops and files an integrator request; the owning engine plan's patch closes the gap.

## 3b materials

1. `pair(a, b)` is cached per ordered pair (M-8 tie-to-`a`, tyre-from-`b` make it asymmetric). Accepted.
2. Inline collider shape is `'sphere'` (not `'ball'`); `'ball'` throws with a hint. Ruling: `'sphere'` everywhere; overview §4.4 example is wrong.
3. Validators: `validateSidecar(s, { model, materials })`, `validatePhys(phys, { materials })`. Accepted.
4. A game entry with a base id merges over the base entry at the same index and may not use `extends`. Accepted.
5. `byIndex(i)` → id; resolved materials carry `id`; `pair()` returns null for absent `tire`/`sound`/`fx`; pair `tire` merges over the ground's; missing cues fall back to the harder material. Accepted.
6. Ruling: the registry hash covers only what sidecars depend on (ids/order, `phys`, pairs), not `look` or `game`, so a look tweak needs no re-bake. Cost: a stale `look` in a baked GLB is not caught by `checks.materials` (the view reads `look` live from the registry anyway).
7. `game` and `look.wear` must be plain JSON. Accepted.

## 3a carryovers

1. 3a may edit `src/view/hook.js` (2 lines) for #100 (in-page `untilLoaded` needs `window.engine.commands`) and #95. Accepted; add `src/view/hook.js` to 3a's Owns.
2. #109: `bindGesture` gains an optional `now` clock option; `uncapped` becomes ignored; two timings in `test/gesture.test.mjs` move to an injected clock. Accepted.
3. The `setup2` move in `test/uiDom.test.mjs` stays (one line, unchanged). Accepted.
4. `reset()` takes no arguments and runs in every `createEngine`; in `mp()` a later peer resets the shared module tunables. Accepted: tunables are per process (#108); tests that tune must tune after all peers are created.
5. #100 semantics: `untilLoaded` takes the step that delivers the commands pending at the call (not "while pending > 0"). Accepted.
6. The spec write-up (Task 10) is run by the integrator: part B (3a's amendments) at the 3a merge, part A (D1–D9) once the user approves D1–D9.

## 3e render

1. 3e adds an inert `src/view/materials/compiler.js` stub so boot can set `view.materials`; 3f's file replaces it at merge (same export names). Accepted; forwarded to 3f.
2. `warm` needs from 3f: `mc.made()`, `material.userData.lhUse`, `userData.lhShared` on shared resources; `createAssets` takes `gfx` and tolerates an undefined registry. Accepted; forwarded to 3f.
3. The game `render` block gains `assets: { manifest, base }`, `lights.hemiSky` and `lights: false`. Accepted.
4. Additive members: createRenderer `renderer`/`target`/`size`/`post`; `camera.userData.lhFov` (3g's FOV rigs add to it, not replace); extra options on lights, `snapshot`, tilt-shift, `sync.dispose`. Accepted; 3g told.
5. matSplit is the compiler's cache key (3f); 3e ships no `splitShared`. Accepted.
6. Without WebGL, boot reports `render: …` once and runs with `view.gfx`/`materials`/`assets`/`sync` null. Accepted.

## 3j Rally

1. Colliders support `{ shape: 'box', round }` (roundCuboid) for Rally's hull. Ruling: 3c adds it (forwarded); 3j uses it, no hull fallback.
2. Games inject Rapier (`rallyGame({ rapier })` → `defineGame({ physics: { rapier } })`, D9); the §4.1 import example is wrong. Accepted.
3. Games may use their own material ids (`rally-*`). Accepted.
4. `createTerrain({ material })` for the heightfield collider. Forwarded to 3h.
5. `checks.determinism`/`checks.zeroAlloc` take start `args` and an `input(step)` policy. Forwarded to 3c.
6. Boot gets the asset manifest from `render.assets: { manifest, base }` (3e's shape). Ruling: 3j uses that, not `render.manifest`/`render.assetsBase`.
7. `<!--APP-->` becomes an inline `<script type="module">` (D1). Accepted.
8. Game plans write notes under `games/<game>/docs/plans/`; the integrator copies them into the engine and numbers field notes from #110. Accepted for all game plans.
9. Rally's own camera and terrain mesh: ruling — 3g's rigs cover Rally's chase/orbit/bumper/bonnet modes and 3h's terrain mesh hosts Rally's 3-LOD chunk streaming (both forwarded), so Rally adopts them; 3j is amended at reconciliation. Keeping Rally's own goes to the user only if 3g/3h can't cover it.

## 3f assets and compiler

All accepted (C1–C10); forwarded to 3g, 3h, 3d where they consume them.
- C1 `createAssets({ gfx, decoders: { ktx2, draco }, fetch })`: decoders injected, never bundled.
- C2 `assets.has(key)` means loaded; template meshes cast/receive shadows by default.
- C3 `mc.get(look, { fur, wind: { fade, amp } })`; WIND is a fourth define driven by a shared `mc.time` (advanced once per frame by view sync).
- C4 `mc.extend(material, name, patch)` for game-only patches.
- C5 `mc.made()`, `userData.lhUse`, `userData.lhShared` (3e ruling).
- C6 `mc.apply` returns `{ uCoverage }`; instanced coverage uses `COVERAGE_INSTANCED` reading an `instanceCoverage` attribute written by the instancing owner.
- C7 anim tables: 12 floats per matrix = Matrix4.elements minus the bottom row (0,1,2,4,5,6,8,9,10,12,13,14); `sampleAnimTable`, `blendAnimTable`, `decodeAnimTable`.
- C8 `createMaterialCompiler({ paint: { base } })`.
- C9 the chunk guard covers 8 chunks.
- C10 `furGeometry(g, mask, { shells })`, shells 1..32, mask is a 0..1 length factor.

Process note: plan writers shared one scratch directory and overwrote each other's scratch files (3f restored one). Plans are separate files and unaffected; executors must use per-plan scratch subdirectories.

## 3i net part

All accepted; Tractor kind changes forwarded to 3l, World seams forwarded to 3c.
1. Multi-body actors: F.body fields other than `body` read linked entities `e[field]`; `kind.spawn` returns a sub-desc per link; links leave with the entity; correction per body.
2. Kind hooks `spawn(rec, netId, world) → desc`, `spawned(e, world, rec)`; overrides `record(e, out, world, base)`, `apply(e, rec, world, s)`.
3. Driven wire form `input: { s: u32 owner step, list: 1..8 }`; `driven` = owner authority + input + body fields (default only then).
4. Interp latency only on a shared clock (`mp`, `peers`): `lat = offset ∈ [0, 1000] ? min(offset, 250) : 0`; real devices use snapshots unprojected. Ruling: ship it; a two-device bump-feel playtest in 3l decides whether a clock-sync follow-up is needed.
5. `netFix` on snaps only.
6. `world.net` gains `role`, `hostId`, `players`, `player(peer, n)`, `find`, `remoteOf`, `stats`, `attach`, `guard`; per-kind send clocks; frame time `floor(wall)`.
7. Reserved kind field names checked in `installNet`; Tractor's `PLAYER.body` paint field is renamed.
8. 3c seams: `place` `q` as `[x,y,z,w]`, `builtin` `fn(engine, data, ctx)`, `world.add/remove`, writable `world.net`, `world.net?.guard(...)` in spawn/despawn/net-part changes (not `clear()`), `engine.netPart?.attach(world)` at World creation.
9. Room close → solo: owner replicas despawn; host-kind replicas stay as local entities.

## 3k Pig Pens

Worktree: `~/projects/four43/four43-lh3-pigpens` (overview §6) — accepted.
- C1 bake `models.<id>.file`, per-kit texture paths without collisions. Forwarded to 3d.
- C2 anim-table layout: settled by 3f C7 (same layout). 3k matches.
- C3 `'sphere'`. Accepted.
- C4 vehicle kit system name / chassis colliders / axes: settle against 3h's final names at reconciliation.
- C5 post-pass: Ruling: use 3e's `gfx.post` seam, not replacing `view.gfx.render`. Amend 3k at reconciliation.
- C6 manifest: Ruling: `render.assets: { manifest, base }` (3e). Amend 3k.
- C7 instanced pig mud: Ruling: use 3f's `COVERAGE_INSTANCED` (`instanceCoverage`); eyelids via `mc.extend`. Amend 3k.
- C8 fur: Ruling: 3f's `furGeometry(g, mask, { shells })` with a 0..1 mask (face trim by mask). Amend 3k.
- C9 orbit rig pose/clamps/chase: forwarded to 3g; amend 3k to adopt the rig.
- Lambert ships for Pig Pens until the user's iPad `?fps` runs compare tiers.
- The workspace "engine imports no three" rule is narrowed to sim roots (3e request).

## 3d bake and CLI

All accepted.
- C1 capsule/cylinder axis = the round cross-section (wheels), not the longest extent.
- C2 anim rows: parts, then `sock-<name>` rows; slerp; 12-float layout (3f C7).
- C3 a socket with no parent part has `part: null`.
- C4 flat default-hull groups skipped with a warning (all-flat fails); per-model `colliders: false`.
- C5 per-model `file`; per-kit textures resolve per file; output GLBs self-contained (3k C1).
- C6 part/socket names sanitised like GLTFLoader; repeats get `-2`, `-3`.
- C7 hull/mesh points in body space with identity `p`/`q`.
- C8 build stamps: page meta `lion-hawk-build`; sw `__VERSION__` = `<ver>+lh<engine>-<hash>`; `--e2e` unminified, no sw.
- C9 the bake uses only `registry.has`, `density`, `hash`.
For the game plans (amend at reconciliation): mesh welding changes Rally's vertex counts (compare triangles); Tractor's `hat` rename is per pet; `sw.js` needs `__PRECACHE__`; Rally's template needs `<!--APP-->`.

## 3h kits

All accepted. Rally adopts the terrain mesh (3-LOD chunks, hysteresis, budget, eviction); nothing deferred.
- C1 `world.engine`; C2 `world.heightfield` forwards `fixInternalEdges`; C3 `world.own` callbacks run before the Rapier world is freed (despawn, `clear()`, dispose). Forwarded to 3c.
- C4 terrain `materials`: one index per height sample (nearest); options `material`, `groups`, `fixInternalEdges`; `terrain.grid` for the view; ids via `ids` + `index()`.
- C5 `coverageKit({ materialAt, layer, washTime })`, first arg engine or scene ctx, entity `coverageMaterial`, returns `{ off }`; the instancing owner writes `instanceCoverage` from `e.coverage`.
- C6 vehicle: `forward: 'x' | 'z'`, `tyre`, `grip` (default false: bit-exact); `rayGroups.member: []` = all; wheels gain `load`, `friction`, `pair`, `front`, `radius`.
- C7 additive view-kit options (particles, marks, terrain mesh LOD, `coverageView` `match`).
- Tractor dirt moves from per-second to per-metre (`dirtRate`): 3l matches today's rate at normal speed, pins it with a test, playtest item.

## 3g view sync, cameras, instancing, audio

All accepted.
1. `createViewSync({ view, root, dispose, ... })`; reads `world.with('xf')` and `world.xfPrev(e, out)`. Forwarded to 3c.
2. netFix convention: `dq = q_old ⊗ q_new⁻¹`, `dp = old − new`, drawn = offset ⊗ pose; `smoothMs` from `world.net.tunables[kind]` (default 150). 3i is amended at reconciliation to match.
3. Rigs: chase `style: 'heading' | 'travel'` (+ title orbit); FOV changes add over `lhFov` (Rally is 4° wider in portrait — playtest note); mount rig `follow`/`set`/`fovAdd`; orbit rig live state, limits, `fit`, `chase`, `release`, `bindGesture({ mode, tapMove })`; `project.ndc`. Games adopt these (amend 3j/3k/3l).
4. Instancing: `setMatrix`, `copy`, `cover`/`instanceCoverage`; sync writes `instanceCoverage` from `e.coverage` and advances `compiler.time` once per frame; crowds use 3f's `blendAnimTable`; particle and mark pools are 3h's.
5. Audio unlocks on pointerdown/pointerup/click/key (iOS), re-arms until running; adds `onGesture`, `muted`, `listen`, `distanceGain`, test seams. #67 done at merge.
Merge order: 3e before 3g Task 11; 3f before 3g Task 15; boot passes `view` to `createViewSync`.

## 3c World and physics

All accepted (full list at the end of the 3c plan).
- Groups: omitted `member`/`filter` = all groups (§4.4's `member: []` would ignore every contact). This overrides 3h C6's `rayGroups.member: []` meaning — Ruling: 3h keeps `member: []` = all for its ray filter only and documents it; colliders follow 3c.
- `e.xf.slot`; `contact`/`sensor` ids and materials `null` for unowned colliders.
- `lock: {x,y,z}` per-axis rotation locks; colliders without a `body` get a fixed body; `'sphere'` only; `box` `round` → roundCuboid.
- World members: `engine`, `net` + `net?.guard`, `own(fn)` (runs before Rapier is freed), `onSpawn`/`onDespawn`, `dispose`, `sys`, `audit()`; `with()` ≤ 4 parts; `heightfield` forwards `fixInternalEdges`; `q` as `[x,y,z,w]`; `builtin` `fn(engine, data, ctx)`; `with('xf')`, `xfPrev(e, out)`.
- `zeroAlloc` uses in-process GC; `checks.materials({ inline })`; checks take `args` and `input(step)`.
- The physics read covers the step a body falls asleep in; `stats.stepMs`/`stepMsTotal` are 0 without a timer.
- `test/engine.test.mjs:232` expected schedule changes (Task 11). Approved.
- 3e's boot passes `timer` to `createEngine`.

## 3l Tractor

Folded in: driven solid trains that honk once per contact (debounced), NET_VERSION 4, 3i names (`trailer`/`wagon` links, `spawn`/`spawned`, paint field renamed `coat`, `self` at welcome), coverage per metre (13b), per-pet `hat` socket, `__PRECACHE__`.
- CI-2 anim tables may lack socket rows: fallback to the sidecar socket. Accepted (3d writes socket rows; fallback stays defensive).
- CI-3 per-material shading tier: only if R1 forces lambert. Deferred until the iPad runs; the gold animal may use `mc.extend`.
- CI-4 no `cone` shape: hull + `body.mass`. Accepted.
- CI-6 §5.5 re-bless causes gain "vehicle-kit update order" and "pre/post split". Accepted.
- CI-7 programmatic `build({ game, out, e2e })`: settle against 3d's exports at reconciliation.
- CI-8 light preset field names: settle against 3e; hemisphere sky colour separate from background (3e's `lights.hemiSky`).
- CI-10 chase rig: Ruling — 3g's chase rig gains velocity heading, portrait framing, shake and live tuning so Tractor adopts it (amend 3g at reconciliation).
- CI-11 settled by 3c (`fixInternalEdges`) and 3h (`createTerrain({ material })`).
- CI-12 settled: `render.assets: { manifest, base }`.
- CI-13 `snapshot` accepts a non-square `[w, h]`. Amend 3e.
- CI-14 settled by 3h C7 (particle gravity/drag/floor; marks `heightAt`).
- CI-15 guest replicas cleared by `world.clear()` until the next host frame: Ruling — 3i's `world.net.guard` keeps host-kind replicas across a guest's scene rebuild, or 3l re-requests a host frame; settle at reconciliation.
- CI-16 physics keeps stepping during a scene load: Ruling — 3c pauses the World step while a scene loads (S-3). Amend 3c.
- CI-17 `[x,y,z,w]` quaternions: confirmed by 3c.

## 3m integration

All accepted.
1. Integrator four43 worktree `~/projects/four43/four43-lh3` on `feat/lion-hawk-3`; scratch `/tmp/claude-1000/lion-hawk-phase3/<plan>` per plan (every executor uses its own subdirectory).
2. Merges are gated in a `phase-3-integrate` worktree and reach `phase-3` only by `--ff-only` during a freeze (game worktrees see `phase-3` live through `file:`).
3. Branch cuts: 3b–3e at v0.7.3; 3f–3i and the game branches at v0.8.0. Early landings another plan needs (3b for 3c; 3e, 3f for 3g) become patch releases.
4. 3m owns `testing/purity.js`, `test/purity.test.mjs`, `games/package.json`, `games/package-lock.json` and the progress page.
5. The Rapier purity rule applies to engine code only; games inject Rapier (D9).
6. Dependency pins from 3d: `@gltf-transform/*` 4.5.1, `meshoptimizer ~1.2.0`, `pngjs ^7`, `esbuild` as a dependency; landed at 0.7.3.
Game agents merge `feat/lion-hawk-3` when told (the D9 workspace-test change lands before 3e); game plans flag changes to their desktop e2e opening (the frame-rate probe copies it).

## Reconciliation additions (2026-10-14)

New engine surface added during the reconciliation pass so every game is fully on the engine. All are in the named plans with tests; the integrator broadcasts each at the merge that lands it.
- **Part poses:** entity `partXf: [names]`, `e.partXf[name] = { p, q }` written per step, swapped by `lh.world.swap`, `world.partXfPrev(e, name, out)` (3c Task 10b); view sync interpolates and writes named GLB nodes, hub = bbox centre, missing part throws, instanced refuses (3g Task 13b); vehicle-kit wheel spec `part` (3h Task 6b). Adopted by 3j (Rally's car), 3k and 3l (wheels; Tractor replicas get them through the kit on `driven` trains).
- **Compiler paint (3f Task 8b, C11):** `PAINT` feature, `lhPaint` attribute, `createMaterialCompiler(reg, { paint: { base, shade } })`, paint values incl. `{ hue: { axis, from, to, s, l } }`, `mc.repaint(root, paint)`. 3e accepts `render.paint` and boot passes it.
- **3e:** `lights.follow(x, z, y = 0)`; `snapshot` `[w, h]`; `render.assets.decoders`.
- **3h:** coverage `washes` entries may be `{ at(x, z), washTime }`.
- **3b:** box `round` > 0 (outside `half`); registry hash = ids order + effective phys + pair friction/restitution (base `2f4f4f95`).
- **3c:** physics (and its read/events) pause while a scene loads.
- **Process (3m pre-flight):** game notes live under `games/<game>/docs/plans/` (3k, 3l too); 3l adds a `test:peers` script.
