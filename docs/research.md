# Lion Hawk Engine: research notes (2026-10-11)

Web research behind the engine design (`design.md`). Some claims rest on search-result summaries rather than full page reads; those are marked.

## 1. Core loop

- **Fixed step, variable render.** Accumulate real frame time and consume it in fixed `dt` steps. Clamp frame time (Fiedler uses 0.25 s) so a slow frame can't spiral. Render by blending previous and current state with `alpha = acc / dt`. Interpolation is safer than extrapolation because it never shows a guessed state. Sources: [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/), [Game Programming Patterns: Game Loop](https://gameprogrammingpatterns.com/game-loop.html).
- **Browser specifics.** rAF pauses in hidden tabs, so the first frame back has a huge dt; the clamp absorbs it. Using the rAF timestamp keeps 120 Hz ProMotion screens from running fast. three.js `Timer` (which replaces `Clock`, r183) can connect to Page Visibility. Sources: [MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [three.js Timer](https://threejs.org/docs/pages/Timer.html).
- **Determinism.** Needs a fixed step, one seeded RNG owned by the sim, stable iteration order, inputs recorded per tick, and periodic state checksums. Aim for "deterministic on one JS engine" (tests, same-device replay), not cross-device lockstep. Sources: [bugnet: deterministic sim](https://bugnet.io/blog/how-to-make-a-game-simulation-deterministic-for-replays) (summary), [Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation).
- **Manual advance.** Expose `stepN(n)` / `advance(seconds)` with no rAF, so Node tests and Playwright can drive the sim synchronously. react-three-fiber's `frameloop: "never"` + `advance()` is the same idea.

## 2. Object model

- **bitECS**: TypedArray structure-of-arrays with numeric IDs. Fast, but awkward next to three.js objects and GLB hierarchies. [docs](https://cdn.jsdelivr.net/npm/bitecs@0.4.0/docs/Intro.md)
- **miniplex**: entities are plain JS objects with archetype queries, and it ships no scheduler on purpose. The most compatible with vanilla code. [repo](https://github.com/hmans/miniplex)
- **becsy**: multithreaded ECS, aimed at a larger scale than needed here. [repo](https://github.com/lastolivegames/becsy)
- **When ECS pays off:** very many, very varied entities, or a general engine that doesn't know its games. For tens of animals and vehicles, plain state plus systems is cleaner. Sources: [wayline](https://www.wayline.io/blog/ecs-for-indie-game-devs), [bugnet ECS](https://bugnet.io/blog/how-to-implement-an-entity-component-system) (summaries).
- **Useful Nystrom patterns:**
  - Update Method
  - State (FSM)
  - Event Queue (also a natural network and replay boundary)
  - Service Locator: use sparingly and prefer passing objects in; a *null service* such as silent audio is useful in Node.

  [Game Programming Patterns](https://gameprogrammingpatterns.com/contents.html)
- **Takeaway:** plain serialisable sim state with systems, and three.js `Object3D`s as view-only objects in a `Map<entityId, Object3D>`. Entities as plain objects keep the door open for miniplex-style queries later, with no rewrite.

## 3. How other engines are organised

| Engine | Loop / scheduling | Worth borrowing |
|---|---|---|
| Threlte | One scheduler; stages (`mainStage` → `renderStage`) hold tasks ordered by `before`/`after` keys; `getSchedule()` for debugging | Named, ordered phases ([docs](https://threlte.xyz/docs/learn/basics/scheduling-tasks)) |
| react-three-fiber | `useFrame` callbacks with numeric priority; `frameloop: always / demand / never` | Manual `advance()` for tests ([discussion](https://github.com/pmndrs/react-three-fiber/discussions/1339)) |
| Needle Engine | Unity-style `Behaviour` lifecycle on top of three.js, which stays fully exposed | Don't hide three.js ([docs](https://engine.needle.tools/docs/three/index.md)) |
| PlayCanvas | `initialize` → `postInitialize` → `update` → `postUpdate`; app-level `prerender`/`postrender` | Pre and post hooks per phase ([docs](https://developer.playcanvas.com/user-manual/scripting/script-lifecycle/)) |
| Babylon.js | Fixed sequence of observables around animation, physics and render | Explicit before/after-physics hooks |
| Excalibur.js | Engine owns start/stop, resources, scenes; Scenes double as levels, menus, loading; `InputMapper` | Scenes as the unit of flow; action mapping ([engine](https://excaliburjs.com/docs/engine), [InputMapper](https://excaliburjs.com/api/class/InputMapper)) |
| Kaplay | Named scenes plus `go(name)` | Simple scene switching |
| Phaser 4 (Apr 2026) | Scenes with `init/preload/create/update`; injected per-scene systems; parallel scenes (HUD over game) | Overlay scenes ([news](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4)) |

**The module set these engines share:** loop/time, input, assets, audio, scenes/FSM, camera, UI/HUD, save, debug.

## 4. Input

- Bind devices to named **actions**, each holding an analog value in [-1, 1] plus `pressed` / `justPressed`. Games read actions only. Snapshot the actions once per sim tick; that snapshot is also the replay and network input record.
- **Gamepad:** poll `navigator.getGamepads()` every frame (the objects are frozen snapshots). Only connect and disconnect fire events. `mapping === "standard"` gives a known layout. [beej](https://beej.us/blog/data/javascript-gamepad/)
- **Touch:**
  - Use Pointer Events on one root with `touch-action: none`, or the browser takes the gesture and fires `pointercancel`. [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
  - Route by `pointerId`. On iOS, don't rely on capture retargeting; listen on window/root. [W3C thread](https://lists.w3.org/Archives/Public/public-pointer-events/2020JulSep/0034.html)
  - Treat `pointercancel` and `lostpointercapture` as release.
  - Clear all held actions on `blur` and `visibilitychange`.
- **Game-specific interpreters** stay in the game, for example Tractor Pickup's point-to-go stick. Button placement is layout config, not engine code.

## 5. Assets, audio, PWA

- **glTF:** one shared `GLTFLoader` with Draco, KTX2 (`detectSupport(renderer)`) and meshopt decoders plus a `LoadingManager`. `THREE.Cache` caches only raw responses, not parsed scenes, so add a `Map<url, Promise<gltf>>` and clone per instance; use `SkeletonUtils.clone` for skinned meshes. [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [Cache](https://threejs.org/docs/pages/Cache.html). For authoring, `gltf-transform optimize` (run `inspect` first). [gltf-transform](https://gltf-transform.dev/cli)
- **iOS audio:**
  - Use one `AudioContext` for the app and `resume()` it on the first gesture. [Matt Montag](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos)
  - Handle the `"interrupted"` state with `resume()` on `visibilitychange`. [WebKit 273511](https://bugs.webkit.org/show_bug.cgi?id=273511)
  - The context can be silent after the PWA returns from background ([WebKit 291892](https://bugs.webkit.org/show_bug.cgi?id=291892), still NEW; reportedly fixed in the iOS 26.2 beta). Fall back to recreating the context and its buffers.
  - `navigator.audioSession.type = "playback"` (feature-detect it) plays sound with the mute switch on. [MDN](https://developer.mozilla.org/docs/Web/API/AudioSession/type)
- **Service worker:**
  - Version the caches and delete old ones in `activate`. Keep the SW URL stable.
  - Avoid `skipWaiting` mid-session (co-op version mismatch); show a "new version ready" toast instead. [web.dev lifecycle](https://web.dev/articles/service-worker-lifecycle)
  - A hand-rolled SW template is clearer than Workbox for cache-first static games. [Workbox precache](https://web.dev/precache-with-workbox)

## 6. Packaging across games

- **Options:**
  - **Import maps:** no tooling, but you still need a deploy step. [example](https://sbcode.net/threejs/importmap/)
  - **npm workspaces:** root `"workspaces"`, symlinked packages, and `npm run test --workspaces --if-present` runs every suite. [npm docs](https://docs.npmjs.com/cli/v11/using-npm/workspaces)
  - **Bundling** with esbuild or Vite: tree-shakes shared code per game.
- **Duplicate three.js trap.** Linked packages can pull in two copies of three.js, which breaks `instanceof` checks and shared caches. Fixes: `three` as a **peerDependency** of the engine; dedupe in the bundler (Vite `resolve.dedupe`, or an esbuild alias); consistent `three/addons/...` imports. [Vite dedupe](https://vite.dev/config/shared-options#resolve-dedupe), [three.js forum](https://discourse.threejs.org/t/using-three-js-based-library-in-vite-rollup-multiple-instances-of-three-js-being-imported/72913)
- **Package vs vendored copy.** With a package, fixes reach every game at once, but one change can break a shipped game. A vendored copy is stable but drifts. The middle path: an in-repo package that each game's build snapshots into its output, with the engine version stamped per build.

## 7. Extracting the engine incrementally

- **Rule of three:** extract only what three instances do the same way, because "duplication is far cheaper than the wrong abstraction" (Metz). [Wikipedia](https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)), [understandlegacycode](https://understandlegacycode.com/blog/refactoring-rule-of-three/)
- **Strangler fig:** replace small pieces while the system keeps running. [Fowler](https://martinfowler.com/bliki/StranglerFigApplication.html)
- **Per module:**
  1. Write characterisation tests in the existing game.
  2. Copy the code into the engine.
  3. Switch one game over, then ship and playtest.
  4. Migrate the other two games.
- **Tests:**
  - Node unit tests for pure sim code.
  - Golden/replay tests: seed plus per-tick inputs, then a state checksum, re-blessed deliberately when a change is intended.
  - Playwright device presets driven through the debug hook. [Playwright emulation](https://playwright.dev/docs/emulation)
  - Real-iPad checks stay, because emulation is not real Safari audio or touch.

## 8. Networking

- **Host-authoritative:** clients send inputs; the host simulates and broadcasts state. [Gambetta](https://gabrielgambetta.com/client-server-game-architecture.html)
- **Snapshot interpolation:** render remote entities about 100 ms in the past. This tolerates non-determinism. [Gambetta](https://gabrielgambetta.com/entity-interpolation.html)
- **Engine scope:**
  - A transport interface (`send`, `onMessage`, `peers`) with WebRTC and loopback (for Node tests) implementations.
  - A snapshot buffer.
  - A protocol-version handshake.

## 9. Debug tooling

- **Panels:** lil-gui (~5 KB) for dev tuning, or Tweakpane (~30 KB) if a panel ships to players. Lazy-`import()` either one behind a flag. [three.js forum](https://discourse.threejs.org/t/lib-why-changed-dat-gui-to-lil-gui/62124)
- **Frame stats overlay:** frame ms, **sim steps per frame**, **clamped frames** and `renderer.info` draw calls. Steps per frame and clamp count are the numbers that diagnose stutter.
- **One `flags.js`** parses the URL once into a frozen object: `?debug`, `?tune`, `?fps`, `?seed=`, `?replay=`, `?slow=`, `?nosw`, `?mute`.
