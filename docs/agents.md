# Lion Hawk for agents: where each feature lives

This is the index for agents building a game on Lion Hawk. Find your task in the tables below. Each row gives the import, the names you call, and the as-built spec section that says exactly what they do.

**Read the copy that matches your game.** This file and every spec it links ship in the package, so `node_modules/lion-hawk/docs/` holds them at the version your game installed. The repo's `main` can be ahead of your pin. Features listed under "Unreleased" in `CHANGELOG.md` are on `main` but are not in any tag yet.

The as-built specs in `specs/as-built/` describe what the code does, one numbered statement (`B-n`) per behavior, each with `path:line` evidence. Use them before you read engine source. `spec.md` holds the design decisions and requirement IDs (`[L-3]`, `[M-14]`, …) that code comments cite.

For working code, the engine's own tests in `test/` call each of these, and `test/fixtures/` holds small complete games.

## The shape of a game

```
<game>/
├── game.config.js     # id, version, bake, build and test settings (tools-and-package.md, "game.config.js keys")
├── src/game.sim.js    # export default defineGame({...}): headless-safe
├── src/game.view.js   # export default defineView({...}): browser only
├── assets/  baked/    # source models, and the sidecars `lion-hawk bake` writes
└── test/
```

The split is the rule everything else follows ([L-3]):

- **Sim** (`game.sim.js` and what it imports) runs in Node. It imports `lion-hawk/sim` and `lion-hawk/kits/<kit>`, never three.js, the DOM, `Math.random` or the wall clock. The game passes its initialised Rapier module in: `defineGame({ physics: { rapier } })`. `checks.simPurity` enforces this.
- **View** (`game.view.js`) runs in the browser. It imports `lion-hawk/view` (which also re-exports all of `lion-hawk/sim`), `lion-hawk/kits/<kit>/view` and three.js.
- The sim is deterministic: the same seed and the same recorded input give the same checksum. Draw randomness from the engine's `rng` streams, and put input into the sim only through actions and commands, so a tape can replay it.

## Game structure

| I want to… | Import | Use | Read |
|---|---|---|---|
| Define the game's sim half | `lion-hawk/sim` | `defineGame` | [core: Configuration](specs/as-built/core.md#configuration), [spec §8.2](spec.md#82-game-contract) |
| Define the view half and start the page | `lion-hawk/view` | `defineView`, `boot` | [view-input: Boot and view halves](specs/as-built/view-input.md#boot-and-view-halves) |
| Switch scenes, open overlays, load in steps | — | `engine.go`, `engine.overlay`, `engine.close`, `ctx.load` | [core: Scenes and transitions](specs/as-built/core.md#scenes-and-transitions), [Loads](specs/as-built/core.md#loads) |
| Run logic every step | `lion-hawk/sim` | `STEP_STAGES`, `engine.system`, `ctx.system` | [core: Step pipeline](specs/as-built/core.md#step-pipeline) |
| Send a recorded, replicated game command | — | `engine.command`, `defineGame({ commands })` | [core: Commands](specs/as-built/core.md#commands) |
| Emit and listen for events | `lion-hawk/sim` | `createEvents`, `engine.emit`, `engine.events` | [core: Events](specs/as-built/core.md#events) |
| Get random numbers | `lion-hawk/sim` | `rng` | [core: Random numbers](specs/as-built/core.md#random-numbers) |
| Vector and quaternion math | `lion-hawk/sim` | `v3`, `q4`, `qmul`, `rotate`, `qslerp`, `qFromYaw` | [core: Math](specs/as-built/core.md#math) |
| Read URL flags (`?debug`, `?seed`) | `lion-hawk/sim` | `parseFlags`, `FLAGS` | [core: Flags](specs/as-built/core.md#flags) |
| Drive the game with a bot or autopilot | `lion-hawk/sim` | `policy` | [core: Policies](specs/as-built/core.md#policies) |

## Input, players and UI

| I want to… | Import | Use | Read |
|---|---|---|---|
| Declare the game's actions | `lion-hawk/sim` | `actions`, `axis`, `button` | [core: Actions and input](specs/as-built/core.md#actions-and-input) |
| Bind keyboard and gamepad | `lion-hawk/view` | `bindKeyboard`, `bindGamepad` | [view-input: Keyboard device](specs/as-built/view-input.md#keyboard-device), [Gamepad device](specs/as-built/view-input.md#gamepad-device) |
| Add a touch stick or hold button | `lion-hawk/view` | `bindStick`, `bindHold` | [view-input: Touch stick and hold button](specs/as-built/view-input.md#touch-stick-and-hold-button) |
| Handle pointer taps and drags, pinch and pan | `lion-hawk/view` | `bindPointer`, `bindGesture` | [view-input: Pointer device](specs/as-built/view-input.md#pointer-device), [Gesture device](specs/as-built/view-input.md#gesture-device) |
| Let several people play on one device | — | `view.seats`, `engine.controllers`, `controller.possess` | [view-input: Seats, pairing and loss](specs/as-built/view-input.md#seats-pairing-and-loss), [core: Controllers and seats](specs/as-built/core.md#controllers-and-seats) |
| Remappable bindings and per-player profiles | — | `view.context`, `lp.bindings` | [view-input: Mapping contexts](specs/as-built/view-input.md#mapping-contexts), [Profiles](specs/as-built/view-input.md#profiles) |
| Rumble, and stop it when the game pauses | — | `view.haptics` | [view-input: Haptics](specs/as-built/view-input.md#haptics) |
| Build menus and HUD buttons | `lion-hawk/view` | `engine.ui`, `createUiDom` | [core: UI registry](specs/as-built/core.md#ui-registry), [view-input: DOM UI](specs/as-built/view-input.md#dom-ui) |
| Navigate menus with a pad or arrow keys | `lion-hawk/view` | `bindMenuNav`, `checkNav` | [core: Menu navigation](specs/as-built/core.md#menu-navigation), [view-input: Menu navigator](specs/as-built/view-input.md#menu-navigator) |
| Show the right button icons for the device | `lion-hawk/kits/glyphs/view` | `bindGlyphs`, `glyphFor` | [defs-and-kits: Glyphs kit](specs/as-built/defs-and-kits.md#glyphs-kit) |

## World, physics and materials

| I want to… | Import | Use | Read |
|---|---|---|---|
| Define physical materials (friction, density, sound) | `lion-hawk/sim` | `defineMaterials`, `BASE_MATERIALS` | [defs-and-kits: Material registry: build](specs/as-built/defs-and-kits.md#material-registry-build), [Material pairs](specs/as-built/defs-and-kits.md#material-pairs) |
| Spawn an entity with a body | — | `engine.world.spawn`, `world.despawn` | [sim-world-physics: Spawn: input checks](specs/as-built/sim-world-physics.md#spawn-input-checks), [Spawn: build](specs/as-built/sim-world-physics.md#spawn-build) |
| Query entities by part | — | `world.with`, `world.get` | [sim-world-physics: Queries, parts and owned frees](specs/as-built/sim-world-physics.md#queries-parts-and-owned-frees) |
| Join bodies, place at a socket | — | `world.joint`, `world.place`, `world.socket` | [Joints](specs/as-built/sim-world-physics.md#joints), [Place, socket and xfPrev](specs/as-built/sim-world-physics.md#place-socket-and-xfprev) |
| React to contacts and sensors | — | events `contact`, `sensor` | [sim-world-physics: Events](specs/as-built/sim-world-physics.md#events) |
| Filter which bodies collide | — | `spawn({ groups })` | [sim-world-physics: Collision groups](specs/as-built/sim-world-physics.md#collision-groups) |
| Add a heightfield ground | `lion-hawk/sim` | `world.heightfield`, `heightfieldDesc` | [sim-world-physics: Heightfield](specs/as-built/sim-world-physics.md#heightfield) |
| Add wind, aero lift and drag, buoyancy or magnets | `lion-hawk/sim` | `createWind`, `createFields` | [Fields: setup and system](specs/as-built/sim-world-physics.md#fields-setup-and-system), [aero](specs/as-built/sim-world-physics.md#fields-aero), [buoyancy](specs/as-built/sim-world-physics.md#fields-buoyancy), [magnetism](specs/as-built/sim-world-physics.md#fields-magnetism) |

## Kits

A kit is optional and imported per game. `lion-hawk/kits/<kit>` is the sim half and `lion-hawk/kits/<kit>/view` the view half. fx and glyphs have only a view half; vehicle has both.

| I want to… | Import | Use | Read |
|---|---|---|---|
| A drivable vehicle (simple raycast, or a Magic Formula tire model) | `lion-hawk/kits/vehicle` | `createVehicle` | [Vehicle kit: both backends](specs/as-built/defs-and-kits.md#vehicle-kit-both-backends), [tire backend](specs/as-built/defs-and-kits.md#vehicle-kit-tire-backend) |
| Chunked terrain with a ground lookup | `lion-hawk/kits/terrain` | `createTerrain` | [defs-and-kits: Terrain kit](specs/as-built/defs-and-kits.md#terrain-kit) |
| Draw the terrain | `lion-hawk/kits/terrain/view` | `createTerrainMesh` | [defs-and-kits: Terrain kit](specs/as-built/defs-and-kits.md#terrain-kit) |
| Mud, dirt and snow that builds up and washes off | `lion-hawk/kits/coverage` | `coverageKit` | [defs-and-kits: Coverage kit](specs/as-built/defs-and-kits.md#coverage-kit) |
| Draw coverage on meshes | `lion-hawk/kits/coverage/view` | `coverageView` | [defs-and-kits: Coverage kit](specs/as-built/defs-and-kits.md#coverage-kit) |
| Particles and tyre marks | `lion-hawk/kits/fx/view` | `createParticles`, `createMarks` | [defs-and-kits: Fx kit](specs/as-built/defs-and-kits.md#fx-kit) |
| An engine and gearbox that drive the wheels and feed the engine sound | `lion-hawk/kits/vehicle` | `createPowertrain`, `ENGINE_PRESETS` | [spec §5.6](spec.md#56-audio), [research: engine sound](research-engine-sound.md) |
| A procedural engine sound for a powertrain | `lion-hawk/kits/vehicle/view` | `createEngineSound` | [spec §5.6](spec.md#56-audio) |

## Rendering and presentation

`defineView({ render })` makes `boot` build the render pipeline, and it hands every view half the results: `view.gfx` (renderer, scene, camera), `view.materials` (the material compiler), `view.assets` (when `render.assets` is set), `view.sync` and `view.audio`. Use those. The `create*` functions below are for code that runs outside `boot`, such as tests.

| I want to… | Import | Use | Read |
|---|---|---|---|
| Set up the renderer, look and lights | `lion-hawk/view` | `defineView({ render })`, `createRenderer`, `createLightRig` | [view-render: Render pipeline](specs/as-built/view-render.md#render-pipeline), [`render` keys](specs/as-built/view-render.md#render-keys-of-defineview), [Light rig](specs/as-built/view-render.md#light-rig) |
| Give meshes the registry's materials | `lion-hawk/view` | `view.materials`, `createMaterialCompiler` | [view-render: Material compiler](specs/as-built/view-render.md#material-compiler-cache-and-construction), [Shader features](specs/as-built/view-render.md#shader-features) |
| Draw sim entities as three.js objects | `lion-hawk/view` | `view.sync`, `createViewSync` | [view-presentation: View sync frame](specs/as-built/view-presentation.md#view-sync-frame), [Sync hooks](specs/as-built/view-presentation.md#sync-hooks) |
| Load models and textures | `lion-hawk/view` | `view.assets`, `createAssets` | [view-presentation: Asset store](specs/as-built/view-presentation.md#asset-store) |
| Play baked animations | `lion-hawk/view` | `sampleAnimTable`, `blendAnimTable` | [view-presentation: Anim tables](specs/as-built/view-presentation.md#anim-tables) |
| Follow, orbit or mount a camera | `lion-hawk/view` | `createChaseRig`, `createOrbitRig`, `createMountRig` | [Chase rig](specs/as-built/view-presentation.md#chase-rig), [Orbit rig](specs/as-built/view-presentation.md#orbit-rig), [Mount rig](specs/as-built/view-presentation.md#mount-rig) |
| Project a world point to the screen | `lion-hawk/view` | `makeProject` | [view-presentation: Projection](specs/as-built/view-presentation.md#projection) |
| Draw many copies, or a crowd of animals | `lion-hawk/view` | `createInstances`, `createCrowd` | [Instances](specs/as-built/view-presentation.md#instances), [Crowd](specs/as-built/view-presentation.md#crowd) |
| Play sound | `lion-hawk/view` | `view.audio`, `createAudio` | [view-presentation: Audio](specs/as-built/view-presentation.md#audio) |
| Mix sound in buses, duck music, place looping sounds on objects | `lion-hawk/view` | `view.audio` | [view-presentation: Audio](specs/as-built/view-presentation.md#audio), [spec §5.6](spec.md#56-audio) |
| Name sounds with variations and voice limits | `lion-hawk/view` | `createCues` | [spec §5.6](spec.md#56-audio) |
| Play impact sounds from materials | `lion-hawk/view` | `bindContactSounds` | [spec §5.6](spec.md#56-audio), [spec §3.4](spec.md#34-pairs) |
| Run a synth on the audio thread | `lion-hawk/view` | `createDsp`, `workletSource` | [spec §5.6](spec.md#56-audio) |
| Keep frame time steady (warm shaders, free GPU memory) | `lion-hawk/view` | `warm`, `disposeTree`, `programCount` | [view-render: GPU hygiene](specs/as-built/view-render.md#gpu-hygiene) |

## Online multiplayer

The host owns the sim and replicates snapshots. There is no lockstep or rollback ([spec §4](spec.md#4-netcode)).

| I want to… | Import | Use | Read |
|---|---|---|---|
| Turn on replication and the engine's join | `lion-hawk/sim` | `defineGame({ net })` | [core: Configuration](specs/as-built/core.md#configuration), [net: The engine join: host side](specs/as-built/net-replication.md#the-engine-join-host-side) |
| Connect peers in a room | `lion-hawk/net` | `createPort`, `roomLink`, `peerKey` | [net: The port](specs/as-built/net-replication.md#the-port), [The peer key](specs/as-built/net-replication.md#the-peer-key) |
| Smooth remote bodies | `lion-hawk/sim` | `createInterp`, `createForecast` | [net: Interpolation](specs/as-built/net-replication.md#interpolation), [Forecast](specs/as-built/net-replication.md#forecast) |
| Test with fake lag in one process | `lion-hawk/net` | `createMemoryHub`, `withLag` | [net: Transports and the memory hub](specs/as-built/net-replication.md#transports-and-the-memory-hub) |

## Tools

`npx lion-hawk help` prints every command and its options.

| I want to… | Command | Read |
|---|---|---|
| Bake models into sidecars (colliders, mass, sockets, aero panels) | `lion-hawk bake [--check]` | [tools: Bake: command flow](specs/as-built/tools-and-package.md#bake-command-flow) |
| Serve the game while editing | `lion-hawk dev` | [tools: Dev server](specs/as-built/tools-and-package.md#dev-server) |
| Build a single-file game, or share one engine pack across games | `lion-hawk build [--mode shared]` | [tools: Build](specs/as-built/tools-and-package.md#build), [Build: shared mode](specs/as-built/tools-and-package.md#build-shared-mode) |
| Run the game's tests plus the engine checks | `lion-hawk test [--visual]` | [tools: Test command](specs/as-built/tools-and-package.md#test-command) |
| Bump, bake, build, test and commit a release | `lion-hawk release [--bump]` | [tools: Release command](specs/as-built/tools-and-package.md#release-command) |

## Testing and checking your work

| I want to… | Import | Use | Read |
|---|---|---|---|
| Run the game headless in a test | `lion-hawk/test` | `headless` | [testing: Headless handle](specs/as-built/testing.md#headless-handle) |
| Assert on events | `lion-hawk/test` | `expectEvents` | [testing: Event assertions](specs/as-built/testing.md#event-assertions) |
| Share setup between tests | `lion-hawk/test` | `fixtures` | [testing: Named setup steps](specs/as-built/testing.md#named-setup-steps) |
| Pin a state to a golden file | `lion-hawk/test` | `golden` | [testing: Golden files](specs/as-built/testing.md#golden-files) |
| Check determinism, purity, materials and allocation | `lion-hawk/test` | `checks` | [testing: Checks](specs/as-built/testing.md#checks) |
| Assert rules that hold every step | `lion-hawk/test` | `invariants` | [testing: Invariants](specs/as-built/testing.md#invariants) |
| Snapshot, fork or replay a run | `lion-hawk/test` | `replay`, `h.snapshot`, `h.fork` | [testing: Replay](specs/as-built/testing.md#replay), [Handle snapshots](specs/as-built/testing.md#handle-snapshots) |
| Test several peers in one process | `lion-hawk/test` | `mp` | [testing: Multiplayer harness](specs/as-built/testing.md#multiplayer-harness) |
| Drive the real page in Chromium | `lion-hawk/playwright` | `launch`, `openGame`, `presets` | [testing: Presets and launch](specs/as-built/testing.md#presets-and-launch), [Driving the page](specs/as-built/testing.md#driving-the-page) |
| Assert on the page (scene, state, layout, tap targets) | `lion-hawk/playwright` | `expectGame`, `expectScene`, `expectTappable` | [testing: Assertions](specs/as-built/testing.md#assertions) |
| Open several pages as one room | `lion-hawk/playwright` | `peers` | [testing: Room of pages](specs/as-built/testing.md#room-of-pages) |
| Inspect a running page from devtools | — | `window.engine` | [view-input: The window.engine hook](specs/as-built/view-input.md#the-windowengine-hook) |

To check a change, work from cheapest to most expensive:

1. `headless(game)`: step it and assert on `h.state()`, `h.checksum()` and events. This runs in milliseconds and needs no browser.
2. `lion-hawk test`: your tests plus `checks.determinism`, `checks.materials` and `checks.simPurity`.
3. `lion-hawk/playwright`: open the built page, read its state with `game.query`, and take a screenshot with `game.shot`. Use this for anything the view draws or the player touches.

Under `node --test`, a `console.warn` or `console.error` during a handle call fails the test unless the test calls `h.expectWarning(re)` first.

## Where else to look

- [`specs/as-built/README.md`](specs/as-built/README.md): the nine features, how they depend on each other, and the [glossary](specs/as-built/_meta/glossary.md).
- [`spec.md`](spec.md): the design decisions and requirement IDs.
- [`field-notes.md`](field-notes.md): problems the games ran into and what the engine changed because of them. Search it before you work around an engine behavior.
- `../CHANGELOG.md`: what changed in each version, including behavior changes that break games.
