# Phase 3 survey: what the games still own (2026-10-13)

Read-only surveys of `games/{rally,pig-pens,tractor-pickup}/src` on four43 `feat/lion-hawk` (e03ed71) and of the engine spec's unbuilt layers (engine `phase-2g`, 0.7.2). Input for the phase 3 plans.

## User decisions (2026-10-13)

- **Models:** the spec's path. Author in Blender → GLB with naming conventions (`col-*`, `sock-*`, registry material names, `paint-*`) → `lion-hawk bake` (validated, gltf-transform optimised GLB + `.phys.json` sidecar) → one shared runtime `GLTFLoader`. Baked animation tables stay as the spec's opt-in (`bake: { animTable: true }`) for crowds. Games ship GLB files beside the page; `build.py` changes accordingly.
- **Materials:** the system already specified: `design.md` §6 and `spec.md` §3 (registry, base library of 18, pairs, collider materials, contact events, `materialAt`, the material compiler with `COVERAGE`/`FUR`/`SUBSURFACE` defines, `warm`, `matSplit`). Fields (§3.7, phase 8) stay out. Risk: the games use Lambert + vertex colours for iPad speed; measure frame rate per game and record a field note on any regression.
- **World:** the full spec World (§2), including the `net` part (N-9, N-12..N-17): auto-replicated entities and driven/proxy/view remotes. Tractor's multiplayer moves onto it last.

## Engine: built vs not built

- Built: core loop/scenes/schedule/events/actions/UI, input devices, netcode codec/port/transports/replica/interp/forecast, testing (headless, replay, mp, purity, playwright, peers), debug hook.
- The physics seam exists: `STEP_STAGES = input.apply, pre, physics.world, post, events.flush` (src/core/schedule.js); `physics.world` is an empty slot (src/core/engine.js:284); `render` is an empty `onRender` slot.
- Not built: §2 World/entities (E-1..E-11), Rapier wrapper, §3 materials (M-1..M-13), §6 bake/sidecars/loader (A-1..A-11), renderer/view sync, kits, audio, §7 CLI (B-1..B-5), PWA (P-1..P-3), [S-3] scene-owned World, T-14 `checks.materials`, `F.body()`, N-9/N-12..N-17.
- Spec order: materials registry → bake + sidecars (hand-written sidecar fixture lets World be tested before the bake) → physics wrapper + World → renderer, view sync, loader, compiler → `net` part → kits.

## Duplicated across the games (extraction candidates)

| Area | Rally | Pig Pens | Tractor |
|---|---|---|---|
| Renderer bootstrap (antialias, DPR cap 1.5/2, PCF shadows, resize, portrait FOV 64) | `render.js:43-46,189-190`, ACES 1.05 | `game.view.js:20-34` | `render/scene.js:4-26` |
| Light rig (hemi + shadowed sun 2048/60 m box that follows the player, fog, look presets, day/night lerp) | `render.js:51-58,88-94,186` | `view/world.js:15-35`, `farm3d.js:240-258` | `render/scene.js:8-25` (`follow`, `setNight`) |
| GPU hygiene | — | — | `render/warm.js`, `dispose.js`, `shadows.js` (instanced depth), `matSplit.js` |
| Baked-parts geometry (`{p,c,i}` / `{pos,nrm,col,idx,uv}`, sRGB→linear, merge, box, colour) | `render.js:6-25` `geomFromPart`, `trackView.js:98-117` | `gfx.js` (44 lines) | `render/gfx.js` (46 lines); bake tools `tools/glb.mjs`, `bake.mjs`, `models.mjs` |
| Baked animation tables + blend | — | `gfx.js` `animM`/`sampleAnim`, blend duplicated `world.js:212-226`, `farm3d.js:136-146` | `render/gfx.js` (+ mounts) |
| Instancing boilerplate | `padView.js:96-103`, `trackView.js:512-525` (body-synced props, duplicated) | 10+ `InstancedMesh` sites, `instanced()` helper `world.js:~73` | `farm3d.js`, `fx.js`, `gibs.js`, `view/world.js:107` |
| Particle pools | — | feathers (`farm3d.js:~153-185`), water `Points` (`world.js:~293`) | `render/fx.js` (1200-cube pool + tyre marks), `render/gibs.js` |
| Shader patches (`onBeforeCompile`) | grass wind + fade `trackView.js:408-437`; snow `snowView.js` (game-specific) | fur shells `fur.js` (70); pig mud + eyelid `world.js:146-182` | dirt `dirtMat.js` (22); ground rock `farm3d.js:82` |
| Physics | `sim.js:25-37,78-82` world lifecycle; `heightfieldDesc` `world/trackWorld.js:21-27` (column-major quirk); groups `padWorld.js`; sleeping props + Rapier 0.21 wake workaround `trackWorld.js:81-110`; custom raycast vehicle `vehicle.js` (game-specific) | `sim.js:31-56` world + static colliders, `grp()` packer, `makeBody` copy-pasted ~5 times, Rapier vehicle controller `tractor.js` | `sim/physics.js` (world, heightfield, groups `G`, timer `phys.worldMs`); vehicle `sim/tractor.js`, hitch joint `sim/hitch.js`; inline `ColliderDesc` chains in `trees.js`, `scenery.js`, `sandbox.js` |
| Actors (sim body ↔ Object3D) | reads Rapier per frame, no interpolation (`render.js:130-150`); bodies replaced on reset (never cache) | parallel arrays by id, no interpolation (`alpha` unused) | `view/bodies.js` double-buffered lerp/slerp; `render/others3d.js`, `animals3d.js` |
| Cameras | chase/orbit/bumper/bonnet `render.js:152-187` | orbit + gestures + `ray`/`project` `view/rig.js` | chase `render/camera.js`, `view/rig.js` `project`/`toNdc` |
| Terrain mesh | chunked heightfield with 3 LODs `trackView.js:237-320` | 420×420 plane | heightfield mesh + 6×6 chunks `farm3d.js:14-47` |
| Audio | none | `sound.js` WebAudio unlock/resume/master + synth | `audio/sound.js` unlock/suspend/limiter/clips, `voice.js` |
| Post / tools | — | tilt-shift `tiltshift.js` (108, ~90% generic) | thumbnail render-to-dataURL `ui/icons.js`, `ui/stickerArt.js` (3 copies) |

Stays in the games: Rally snow deformation (`snow.js`, `snowView.js`) and tyre/drivetrain model, chicken/pig AI, art, effect presets, tuning constants.

## Extraction snags

- Sim halves never import three.js (purity tests); Rapier helpers go in `lion-hawk/sim`, three.js helpers in `lion-hawk/view`, no cross-imports.
- Assets today: `assets.json` (Tractor 988 KB) imported as JSON; no GLTFLoader anywhere; the build is a single-file bundle (`build.py`, `template.html`, `window.__ANIMALS__` audio).
- Materials today: Lambert + vertex colours (gold animal uses Standard); iPad perf hacks (matSplit, instanced depth, warm-up).
- Module singletons: Tractor `VIEW`/`rig`/page; Pig Pens `rig`, renderer, `Sound`.
- Pig Pens physics and AI are interleaved in `sim.js` `step()`.
- Rapier heightfield is column-major and its API shifted across 0.14–0.21; pin it.
- `onBeforeCompile` shaders patch `#include` names of three 0.186; use `customProgramCacheKey`.

## Cross-game final pass (fold into the game plans)

- Rally: restore the stage view's `built` hook (#50 fixed); body classes vs `data-lh-*`; keep `s.ctx` out of serialised state.
- Pig Pens: ≥44 px with a plain `expectTappable`; adopt `bindGesture` and `uncapped` (#56, #59); a hose `move` assertion; `pressing` during an orbit; the HUD selection string.
- Engine: `untilLoaded` waits on pending commands (#100); `engine.overlay(..., { once })` (#95); audio unlock service (#67); G-E2 minors (domAsserts regex gaps, `setup2` placement, refocus after swap); open notes #105–#109 (overlay args, physics-timing hook, `peers()` manual render, tunables/reset hook, frame-summed gesture holds).
- Tractor 2g parked minors: see `docs/plans/2026-10-12-phase-2g-notes.md` "Parked minors".
