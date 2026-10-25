# Discrepancies

Places where docs disagree with the code at commit `7e239df`. The code is the source of truth. Each entry gives evidence on both sides. Each spec lists the same items under "Open questions and discrepancies".

## F01 Engine core ([core.md](../core.md))

- docs/spec.md [R-7] says engine.manual(true) stops automatic stepping. The engine object in src/core/engine.js has no manual method. Evidence: `docs/spec.md:303`, `src/core/engine.js:418-497`
- docs/spec.md [R-1] says the engine drives requestAnimationFrame and clamps frame time to 0.25 s. The core loop has no requestAnimationFrame, and the clamp is the maxFrame setting, default 0.25 s, so it can differ per game. Evidence: `docs/spec.md:287`, `src/core/loop.js:1-4`, `src/core/engine.js:67`
- docs/design.md section 7.1 shows a game as defineGame({ sim, kits, defs, createSim, createView, debug }). The code defines a game by id, scenes, start, actions, commands, setup, reset, state, player, gameState, net and physics. Evidence: `docs/design.md:330-340`, `src/core/engine.js:29-69`
- docs/design.md section 7.4 says window.engine exposes pause and resume. The core engine object has no pause or resume method. Evidence: `docs/design.md:362`, `src/core/engine.js:418-497`
- docs/research-players.md section 6.1 says the roster is net.players. The roster is engine.players, and CHANGELOG 0.13.0 says world.net.players is gone. Evidence: `docs/research-players.md:113`, `src/core/engine.js:422`, `CHANGELOG.md:9`
- docs/spec.md [C-4] says a bot has no player number unless the game assigns one. In code a bot has player 0, and the roster does not list it. Evidence: `docs/spec.md:411`, `src/core/controllers.js:28`, `src/core/engine.js:424-427`

## F02 Definitions and kits ([defs-and-kits.md](../defs-and-kits.md))

- docs/spec.md 3.2 says phys.fill is 0-1. The code accepts only values in (0, 1] and rejects 0. Evidence: `docs/spec.md:140`, `src/defs/materials.js:24`, `src/defs/materials.js:51`
- docs/spec.md 3.2 says tire parameters are read by the kit-vehicle tire backend. The vehicle kit reads only the pair friction and does not read tire values. Evidence: `docs/spec.md:141`, `src/kits/vehicle/sim.js:97-98`
- docs/spec.md A-5 says a sidecar holds aero panels and a closed volume from phase 8. The sidecar validator accepts only v, source, parts, colliders, mass, sockets and bounds and rejects other keys. Evidence: `docs/spec.md:449-453`, `src/defs/sidecar.js:79`
- docs/spec.md 3.1 says the base library hash is 2f4f4f95. This spec did not recompute it. The test pins it. Evidence: `docs/spec.md:128`, `test/materials-hash.test.mjs:10`

## F03 Simulation world and physics ([sim-world-physics.md](../sim-world-physics.md))

- docs/spec.md section 2.2 lists the body options as { type, lock, ccd, linearDamping, angularDamping, sleep }. The code also accepts canSleep, mass and massProps. Evidence: `docs/spec.md:89`, `src/sim/world/world.js:23`
- docs/spec.md E-1 says an entity has an optional tags set. The code always makes a tags Set. Evidence: `docs/spec.md:79`, `src/sim/world/world.js:174`
- docs/spec.md E-10 says the pools swap after every sim step. The code copies curr to prev at the start of the step, in lh.world.swap. The clarification in the same doc agrees with the code. Evidence: `docs/spec.md:107-108`, `src/sim/world/install.js:31`
- docs/spec.md E-7 says despawn removes the view object and the net record. The World code removes only the Rapier objects, the query membership and its own records. The view and net layers do the rest. Evidence: `docs/spec.md:101`, `src/sim/world/world.js:227-240`

## F04 Networking and replication ([net-replication.md](../net-replication.md))

- docs/spec.md 4.1 lists the net.open command as { role, id, hostId, at }. The port also sends key (four uint32 words). Evidence: `docs/spec.md:199`, `src/net/port.js:67`
- docs/spec.md N-19 lists net.hello as { key, seats }. The code also sends schema. Evidence: `docs/spec.md:269`, `src/sim/net/install.js:319`
- docs/spec.md N-24 says net.self is the first local number. The code sets self to 1 on a host, to seat 0's number when seat 0 is confirmed, and else to 0. Evidence: `docs/spec.md:277`, `src/sim/net/install.js:61`
- docs/spec.md N-12 says driven is the default remote for owner kinds with an input field. The code also needs a field named body made with F.body(). Evidence: `docs/spec.md:241`, `src/defs/fields.js:43`
- docs/spec.md 4.1 gives createPort options without key. The code has a key option whose default is peerKey(). Evidence: `docs/spec.md:199`, `src/net/port.js:11`

## F05 View boot, input and seats ([view-input.md](../view-input.md))

- docs/spec.md [D-4] lists state, query, snapshot, restore, checksum and policies on window.engine. The hook exposes state() but has no query, snapshot, restore, checksum or policies member. Evidence: `docs/spec.md:521`, `docs/spec.md:525`, `src/view/hook.js:23-48`
- CHANGELOG 0.13.0 and the plan 4 rulings in docs/spec.md [C-14] describe the engine stop as a zero dual-rumble plus reset(). The code zeroes with trigger-rumble on a pad whose effects list it, and with dual-rumble on other pads. The [C-14] text above the rulings and the glossary agree with the code. Evidence: `CHANGELOG.md:10`, `docs/spec.md:430`, `docs/spec.md:429`, `src/view/haptics.js:16-21`
- The bench's own stops (Stop all, live off, live idle and dispose) send a zero dual-rumble plus reset(). The bench never sends a trigger-rumble zero, even for a pad that lists trigger-rumble. The engine stop in haptics.js uses trigger-rumble for such a pad. Evidence: `src/view/bench/pads.js:98-104`, `src/view/bench/pads.js:252-253`, `src/view/haptics.js:16-21`
- docs/spec.md [D-7] says the engine adds one driver device after the game's. The code adds the bench slot after the menu navigator, which itself comes after the game's devices. Evidence: `docs/spec.md:534`, `src/view/boot.js:56`

## F06 Rendering and materials ([view-render.md](../view-render.md))

- docs/spec.md M-11 names the compile-time defines COVERAGE, FUR and SUBSURFACE only. The code also has WIND, PAINT and COVERAGE_INSTANCED. Evidence: `docs/spec.md:173`, `src/view/materials/chunks.js:8-14`, `src/view/materials/compiler.js:155`
- A comment in hygiene.js refers to 'depthGroup'. No such symbol exists in the file. The code builds depth entries with depthEntries(). Evidence: `src/view/render/hygiene.js:52`, `src/view/render/hygiene.js:35`

## F07 View sync, camera, assets and audio ([view-presentation.md](../view-presentation.md))

- docs/spec.md E-11 says the view writes slerp for rotations. View sync uses a normalised nlerp on the short arc. Evidence: `docs/spec.md:110`, `src/view/sync/index.js:181-183`
- docs/spec.md A-9 says the shared GLTFLoader has the meshopt and KTX2 decoders. Code sets only meshopt. KTX2 and Draco are both optional and injected. Evidence: `docs/spec.md:470`, `src/view/assets/loader.js:1-3`, `src/view/assets/loader.js:9-11`
- docs/spec.md A-10 says preload drives the loading scene. The code of preload only loads, compiles and warms, and does not touch a scene. Evidence: `docs/spec.md:471`, `src/view/assets/index.js:83-97`

## F08 Test helpers ([testing.md](../testing.md))

- spec T-16 lists presets iPhone SE, iPhone 15 Pro and Pro Max, iPad Mini, iPad Pro 11 and desktop, with SwiftShader and channel 'chromium'. Code has 5 presets and no iPad Mini or Pro Max. It passes SwiftShader through launch args. Evidence: `docs/spec.md:585-590`, `testing/playwright.js:17-23`, `testing/playwright.js:40`
- spec T-1 and T-9 name `clock: 'virtual'` and `record: 'on-fail'` for headless(). Code takes only `record` as a boolean and `wall0`, and has no `clock` option. Evidence: `docs/spec.md:540`, `testing/headless.js:20`
- spec T-4, T-6, T-7 and T-8 name expectEvents, fixtures and h.use, h.snapshot, h.restore, h.fork, h.spy and h.expectWarning. The testing/ code has none of them. Evidence: `docs/spec.md:551`, `docs/spec.md:562-564`, `testing/headless.js:44-104`, `testing/index.js:1-9`
- spec T-12 says checks.simPurity(game) imports the sim entry under a guard and throws. Code takes { roots }, scans source text, never imports, and returns { ok, found } without throwing on a hit. Evidence: `docs/spec.md:578`, `testing/checks.js:40-44`
- spec T-13 says zeroAlloc compares heap use before and after under --expose-gc. Code enables the flag in-process and judges the second half of the run only. Evidence: `docs/spec.md:579`, `testing/checks.js:46-81`
- spec T-17 and T-18 name driver methods query, shot, control, touch.drag and matchers (toBeInScene and others). The driver in testing/playwright.js has none of them. Evidence: `docs/spec.md:595-602`, `testing/playwright.js:163-248`
- spec T-17 says tap(label). The driver `tap` takes a test id. Evidence: `docs/spec.md:599`, `testing/playwright.js:198-199`
- mp.js comment says peers added by a beforeStep wait for the next step. The loop re-reads list.length on each pass, so a peer added during a pass is stepped in the same room step. Evidence: `testing/mp.js:42`, `testing/mp.js:40-47`
- testing/playwright.js imports playwright-core, but package.json lists it only under devDependencies, not dependencies or peerDependencies. Evidence: `testing/playwright.js:7`, `package.json:22-31`
- headless() reads Object.hasOwn(game.policies, ...) for a string input. checks.js guards with `game.policies ?? {}`. headless has no such guard. Evidence: `testing/headless.js:31`, `testing/checks.js:15`
- research-testing.md proposes replay.run(file), fuzz and a flow DSL, policies still/const/seq/fn/rate, and toMatchGolden. testing/ has none of these (policy.every exists in src/core/policy.js). Evidence: `docs/research-testing.md:125-157`, `testing/index.js:1-9`

## F09 CLI, tools and package surface ([tools-and-package.md](../tools-and-package.md))

- docs/spec.md [A-3] says the bake optimises textures to KTX2 or WebP. The code runs only dedup, weld, prune, quantize and meshopt reorder. No step compresses textures. Evidence: `docs/spec.md:444`, `tools/bake/optimise.js:14-20`
- docs/spec.md 7.1 lists the commands test and release. The CLI has only bake, build and dev. Evidence: `docs/spec.md:486-487`, `tools/cli.js:13-18`
- docs/spec.md 7.1 says build [--mode single|shared] writes site/exp/<game>/. In the code shared mode throws a UsageError, and the output directory comes from --out or the outEnv variable. The default site directory is used only with --site. Evidence: `docs/spec.md:485`, `tools/build/index.js:47`, `tools/build/out.js:8-15`
- docs/field-notes.md note 132 says bake --check does not see config changes and the fix is open. Since 0.12.0 the code hashes the options into manifest.json and --check reports 'bake options changed'. Renames, static and palette are in the hash. Evidence: `docs/field-notes.md:881-885`, `tools/bake/index.js:23-24`, `tools/bake/index.js:88`
- docs/spec.md [P-3] says the PWA manifest is generated from game.config.js. The build only copies the files in the pwa directory and stamps sw.js. It generates no manifest. Evidence: `docs/spec.md:503`, `tools/build/index.js:59-78`
- docs/spec.md [G-2] says today's builds use the esbuild CLI, which takes no plugins. The build now calls the esbuild API with the dedupe plugin. Evidence: `docs/spec.md:688`, `tools/build/index.js:25-28`
