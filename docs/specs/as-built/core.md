---
id: F01
title: Engine core
status: as-built
source_commit: 7224d6b
paths:
  - src/core/**
  - src/version.js
generated: STE spec writer
---

# Engine core

## Summary
The engine core makes the engine from a game definition. It runs fixed steps, schedules systems in stages, and runs scenes, overlays and loads. It also holds commands, actions, events, controllers, the player roster, the UI registry, the menu navigation rules, the random number streams and the math helpers. The core is sim code: it has no DOM, no three.js and no wall clock of its own. The view, the net layer and the World build on it.

## Scope
- **In scope:**
  - `defineGame`, `createEngine`, the loop and the schedule
  - scenes, transitions, loads, commands and recording
  - actions, input, controllers and the roster
  - events, the UI registry, `nav` and `pickNeighbour`
  - flags, policies, rng, math and the engine version
  - `canonical`, `checksum` and tape replay (`checkTape`, `tapeStart`, `replayTape`)
- **Out of scope:** the World, physics and the net part (`src/sim/**`), the definitions and kits in [defs-and-kits.md](defs-and-kits.md), and the view modules in `src/view/**`.

## Terms
See the [glossary](_meta/glossary.md). Four more terms apply to this feature.

- **boot state:** the period in `createEngine` while `setup` and the start scene enter run. The engine queues transitions that are requested then. [src/core/engine.js:530-536] <!-- C-7 -->
- **outbox:** the queue behind `engine.net.send`. A port drains the outbox in an `onStep` listener. [src/core/engine.js:338-340] <!-- C-128 -->
- **latched button:** a button that stays off after input gating ends, until no source holds it. [src/core/actions.js:25-28] <!-- C-212 -->
- **block:** a token from `engine.block(label)`. The glossary defines it. [src/core/engine.js:438] <!-- C-164 -->

## Interfaces

### Engine creation
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `createEngine(game, { seed = 1, scene = game.start, args, acks = 'steps', record = false, wall0 = 0, timer = null } = {})` | out | returns the engine | [src/core/engine.js:120] <!-- C-1 --> |
| `engine.seed` | out | numeric seed of the base stream | [src/core/engine.js:419] <!-- C-9 --> |
| `engine.acks`, `engine.blocked` | out | acks mode, number of unreleased blocks | [src/core/engine.js:428] <!-- C-49 --> |
| `engine.world` | out | main scene's World, or `undefined` before the first scene | [src/core/engine.js:441] <!-- C-167 --> |

### Engine methods
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `engine.stepN(n)`, `engine.advance(seconds)`, `engine.frame(seconds, now)`, `engine.loop` | in | the same functions as on the loop | [src/core/engine.js:419; src/core/engine.js:473] <!-- C-31 --> |
| `engine.system(name, fn, opts = {})` | in | adds a system, default stage `'pre'`, returns a remover | [src/core/engine.js:458] <!-- C-53 --> |
| `engine.schedule()` | out | object that maps each stage to its ordered system names | [src/core/engine.js:459] <!-- C-54 --> |
| `engine.go(name, args)`, `engine.overlay(name, args, opts)`, `engine.close(name)`, `engine.jump(name, preset, opts, args)` | in | queue a transition, return the engine | [src/core/engine.js:403-409; src/core/engine.js:461-469] <!-- C-78 --> |
| `engine.isOpen(name, { pending = false } = {})` | out | boolean | [src/core/engine.js:472] <!-- C-91 --> |
| `engine.command(type, data = {})` | in | queues a checked command, returns the engine | [src/core/engine.js:470] <!-- C-96 --> |
| `engine.commands` | out | live `{ pending, dropped, handles(type) }` | [src/core/engine.js:252; src/core/engine.js:324] <!-- C-113 --> |
| `engine.builtin(type, fn)` | in | adds a built-in handler `fn(engine, data, mainCtx)`, returns a remover | [src/core/engine.js:442-448] <!-- C-118 --> |
| `engine.tape()` | out | deep copy of `{ v: 1, game, seed, scene, args, hz, wall0, log }` | [src/core/engine.js:487-491] <!-- C-126 --> |
| `engine.emit(type, data)`, `engine.events` | in, out | event hub of the engine | [src/core/engine.js:142; src/core/engine.js:451] <!-- C-138 --> |
| `engine.onStep(fn)` | in | listener `fn(engine)` after each step, returns an unsubscribe function | [src/core/engine.js:474] <!-- C-136 --> |
| `engine.onRender(fn)`, `engine.render(alpha)` | in | render listener, manual render call | [src/core/engine.js:475-476] <!-- C-33 C-32 --> |
| `engine.onPresent(fn)`, `engine.presented()` | in | present listener, frame ack | [src/core/engine.js:429-433] <!-- C-48 --> |
| `engine.block(label = '')`, `engine.onBuilt(fn)` | in | release function, unsubscribe function | [src/core/engine.js:434-440] <!-- C-164 --> |
| `engine.net.send(to, data, reliable = false)` | in | queues `{ to, data, reliable }` in the outbox | [src/core/engine.js:341-346] <!-- C-128 --> |
| `engine.net.leave()` | in | queues `{ leave: true }` | [src/core/engine.js:347] <!-- C-130 --> |
| `engine.net.receive(type, data)`, `engine.net.drain(fn)`, `engine.net.pending` | in, out | port seam | [src/core/engine.js:350-358] <!-- C-131 C-132 C-134 --> |
| `engine.ui` | in, out | `tree()`, `view()`, `enabled(id)`, `tryTap(id)`, `press(id, at)`, `release(id)`, `tap(id)`, `fill(id, text)` | [src/core/engine.js:477-486] <!-- C-170 --> |
| `engine.controllers`, `engine.controllerOf(seat)` | out | live controller list, controller or `undefined` | [src/core/engine.js:420-421] <!-- C-215 --> |
| `engine.controller({ bot })` | in | makes a bot with seat null and player 0, gated if gating is on | [src/core/engine.js:424-427] <!-- C-218 --> |
| `engine.players`, `engine.gameState` | out | live roster list, live game-state object | [src/core/engine.js:422-423] <!-- C-239 --> |

### Scene and command callbacks
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `ctx.command(type, fn)` | in | scene handler `fn(engine, data, ctx)`, returns a remover | [src/core/engine.js:206-214] <!-- C-111 --> |
| `ctx.system(name, fn, opts)` | in | scene system, removed with its scene | [src/core/engine.js:204] <!-- C-55 --> |
| `ctx.load(opts)` | in | `{ build, then, hold = 0, frames = 1, settle = false, label = '' }`, returns `{ label, then }` | [src/core/engine.js:176; src/core/engine.js:182-184] <!-- C-150 --> |
| `engine.scene.overlayArgs(name)` | out | args of an open overlay, or `undefined` | [src/core/engine.js:148] <!-- C-93 --> |

### Library functions
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `defineGame(spec)` | in | returns a frozen game | [src/core/engine.js:29-69] <!-- C-69 --> |
| `createLoop({ hz = 60, maxCatchUp = 3, maxFrame = 0.25, step, render })` | in | returns `{ dt, stats, alpha, frame, stepN, advance, reset }` | [src/core/loop.js:4-22] <!-- C-17 --> |
| `rng(seed)` | in | returns `{ seed, next, range, int, pick, chance, shuffle, fork }` | [src/core/rng.js:10-27] <!-- C-12 --> |
| `createEvents({ logSize = 256, now = () => 0 } = {})` | in | returns `{ emit, adopt, flush, on, since, seq, pending }` | [src/core/events.js:6; src/core/events.js:10-36] <!-- C-140 --> |
| `events.seq`, `events.pending` | out | last event number, count of queued events | [src/core/events.js:34-35] <!-- C-148 --> |
| `createUi({ onAction, coveredBy, isAction, ctxOf })` | in | returns `{ builder, clear, view, tree, fill, enabled, press, release, advance, tap }` | [src/core/ui.js:3; src/core/ui.js:28-102] <!-- C-174 --> |
| `axis({ pair } = {})`, `button()` | in | frozen action descriptors | [src/core/actions.js:4-5] <!-- C-193 --> |
| `createInput(schema)` | in | returns `{ snapshot, kinds, device, clearDevice, gate, gated, set, hold, release, apply, values }` | [src/core/actions.js:19; src/core/actions.js:56-108] <!-- C-192 --> |
| `input.gated`, `input.kinds`, `input.values()` | out | gating flag, map of action kinds, plain value copy | [src/core/actions.js:55; src/core/actions.js:83; src/core/actions.js:107] <!-- C-213 --> |
| `pickNeighbour(from, dir, rects)` | in | `from` is a rect or an index, `dir` is in `NAV_DIRS`, returns an index or -1 | [src/core/navScore.js:14; src/core/navScore.js:20-21] <!-- C-280 --> |
| `parseFlags(search)`, `FLAGS` | in | query string, returns a frozen object | [src/core/flags.js:1-5; src/core/flags.js:18] <!-- C-289 --> |
| `canonical(value, { digits = 6, exact = false } = {})` | in | returns a canonical JSON string | [src/core/checksum.js:16] <!-- C-317 --> |
| `checksum(value, opts)` | in | returns 8 lowercase hexadecimal characters | [src/core/checksum.js:17] <!-- C-320 --> |
| `checkTape(game, tape)` | in | throws if the tape does not fit the game | [src/core/tape.js:6-10] <!-- C-321 --> |
| `tapeStart(tape)` | in | returns `{ seed, scene, args, wall0 }` | [src/core/tape.js:12] <!-- C-322 --> |
| `replayTape(e, tape, { step = () => e.stepN(1) } = {})` | in | re-feeds a checked tape into the fresh engine `e`, returns `e` | [src/core/tape.js:15-18; src/core/tape.js:61] <!-- C-323 --> |
| `policy` | in | `still()`, `const(p)`, `seq(list)`, `fn(f)`, `every(n, fn, { phase = 0, key })` | [src/core/policy.js:1-8] <!-- C-296 --> |
| `v3`, `q4`, `qmul`, `rotate`, `qnorm`, `qslerp`, `vlerp`, `qFromYaw` | in | plain-object vector and quaternion math | [src/core/math.js:3-28] <!-- C-302 --> |
| `mIdent`, `mMul`, `mTRS` | in | return column-major 16-number arrays, allocate |
| `xfP`, `xfN` | in | take a matrix and a vector, return 3-number arrays, allocate, `xfN` assumes uniform scale | [src/core/math.js:30-39] <!-- C-307 --> |

## Behavior

### Engine creation
- **B-1** `createEngine` calls `game.reset` first, before any option check. Module tunables then return to their shipped values for every engine. [src/core/engine.js:121] <!-- C-2 -->
- **B-2** `createEngine` runs `game.setup(engine)` once and then enters the start scene in the boot state. [src/core/engine.js:530-536] <!-- C-7 -->
- **B-3** `createEngine` applies the transitions that setup or the start scene requested after the start scene enters. [test/engine.test.mjs:272] <!-- C-7 -->
- **B-4** If the game sets `net.world`, `createEngine` calls `installNet(engine)` before setup and before any port. [src/core/engine.js:528] <!-- C-169 -->
- **B-5** The World seat opens a World with `createWorld(engine, { seed, timer })` and attaches the net part when one exists. [src/sim/world/install.js:19-30] <!-- C-312 -->
- **B-6** If the attach throws, the World seat drops the World and rethrows. The method `close()` disposes the World. [src/sim/world/install.js:24-28] <!-- C-312 -->
- **B-7** The method `digest()` of the World seat returns a value only when the World has entities. [src/sim/world/install.js:29] <!-- C-312 -->
- **B-8** Controllers read the current World through `worlds.current`. [src/core/engine.js:128; src/core/controllers.js:76] <!-- C-314 -->
- **B-9** An engine without `physics.rapier` still makes a World, and the World holds bodiless entities only. (inferred) [test/world-engine.test.mjs:151] <!-- C-168 -->
- **B-10** `defineGame` checks `physics` with `checkPhysics` when `spec.physics` is set. [src/core/engine.js:66; src/sim/world/install.js:9-15] <!-- C-269 -->

### Random numbers
- **B-11** `engine.rng(name)` returns one cached stream per name, forked from the base stream. [src/core/engine.js:450] <!-- C-10 -->
- **B-12** `fork(label)` returns a stream seeded with `fnv(`${base}:${label}`)`. The fork does not disturb the parent stream. [src/core/rng.js:26] <!-- C-11 -->
- **B-13** The method `next()` runs mulberry32 over a 32-bit state and returns a number in [0, 1). The sequence matches the sequence in the three games. [src/core/rng.js:13-17; test/rng.test.mjs:10] <!-- C-13 -->
- **B-14** `int(lo, hi)` includes both ends. `range(lo, hi)` is `lo + (hi - lo) * next()`. `chance(p)` is `next() < p`. `pick(arr)` uses one draw. [src/core/rng.js:21-24] <!-- C-14 -->
- **B-15** `shuffle(arr)` returns a shuffled copy and leaves the input unchanged. It runs a Fisher-Yates pass from the end with one draw per position. [src/core/rng.js:25] <!-- C-15 -->
- **B-16** `fnv(str)` is the 32-bit FNV-1a hash over the UTF-16 code units of the string. It returns an unsigned integer. [src/core/rng.js:4-8] <!-- C-16 -->

### Loop
- **B-17** The method `frame(seconds, now)` adds `min(max(seconds, 0), maxFrame)` to the accumulator. Negative time adds nothing. [src/core/loop.js:13] <!-- C-18 -->
- **B-18** `frame` runs a step while the accumulator is at least `dt - 1e-9`. It runs at most `maxCatchUp` steps. [src/core/loop.js:3; src/core/loop.js:7; src/core/loop.js:14] <!-- C-19 -->
- **B-19** If the accumulator is still at least `dt - 1e-9` after the capped run, `frame` adds 1 to `stats.clamped`. It then sets the accumulator to `acc % dt`. [src/core/loop.js:15] <!-- C-20 -->
- **B-20** After the steps, `frame` adds 1 to `stats.frames` and sets `stats.lastSteps`. It calls `render(acc / dt)` and returns the step count. [src/core/loop.js:16-17] <!-- C-21 -->
- **B-21** The getter `alpha` returns `acc / dt`. [src/core/loop.js:10] <!-- C-22 -->
- **B-22** If `frame` gets `now` in ms, each step gets the stamp `now - (acc - dt) * 1000`. The stamps are exactly `1000 / hz` ms apart. [src/core/loop.js:7; src/core/loop.js:11] <!-- C-23 -->
- **B-23** If `frame` gets no `now`, the step gets no stamp. [src/core/loop.js:7; src/core/loop.js:11] <!-- C-23 -->
- **B-24** The method `stepN(n)` runs exactly n steps without a stamp and does not render. It leaves the accumulator unchanged and adds n to `stats.steps`. [src/core/loop.js:19] <!-- C-24 -->
- **B-25** The method `advance(seconds)` adds `max(seconds, 0)` to the accumulator. It runs all whole steps, with no cap, no `maxFrame` clamp and no stamp, and returns the step count. [src/core/loop.js:20; src/core/loop.js:7] <!-- C-25 -->
- **B-26** The method `reset()` sets the accumulator to 0. [src/core/loop.js:21] <!-- C-26 -->
- **B-27** The loop has no `requestAnimationFrame`. The view driver calls `frame(seconds)`, and tests call `stepN` or `advance`. [src/core/loop.js:1-2] <!-- C-28 -->
- **B-28** `engine.render(alpha)` calls every render listener with alpha and does not step. [src/core/engine.js:476] <!-- C-32 -->
- **B-29** `engine.onRender(fn)` adds a listener to a copy-on-write list. Listeners run in registration order. [src/core/engine.js:475; src/core/engine.js:162] <!-- C-33 -->
- **B-30** Each render call marks that a frame has no ack yet. The next `present()` clears the mark. [src/core/engine.js:158-162] <!-- C-34 -->

### Step pipeline
- **B-31** Each step first sets `time.wall`. If `acks` is `'steps'`, the step then calls `present()`. Then the step runs the `input.apply` stage. [src/core/engine.js:361-368] <!-- C-36 -->
- **B-32** If no open overlay pauses, the step runs the `pre`, `physics.world` and `post` stages in that order. [src/core/engine.js:369-371] <!-- C-37 -->
- **B-33** If a pausing overlay is open, the step skips the `pre`, `physics.world` and `post` stages. The step runs only the step hooks of the scenes at or above the topmost pausing overlay. [src/core/engine.js:227-231; src/core/engine.js:369-370] <!-- C-38 -->
- **B-34** After the stages, the step applies the queued transitions and runs the `events.flush` stage. Then it adds 1 to the step counter and updates `time`. [src/core/engine.js:374-377] <!-- C-39 -->
- **B-35** After the step counter changes, the step calls each `onStep` listener. Then it empties the outbox. [src/core/engine.js:378-379] <!-- C-40 -->
- **B-36** `time.step` is the step count. `time.sim` is `step / hz`. The engine divides instead of multiplying by `dt`. [src/core/engine.js:135] <!-- C-42 -->
- **B-37** If a step has no stamp, `time.wall` is `wallBase + (step + 1 - wallBaseStep) * 1000 / hz`. [src/core/engine.js:365] <!-- C-43 -->
- **B-38** A step with a stamp sets `time.wall` to the stamp and re-anchors the wall base to it. [src/core/engine.js:365] <!-- C-43 -->
- **B-39** `time.frames` counts presented frames. The function `present()` adds 1 and then calls each `onPresent` listener with the engine. [src/core/engine.js:160] <!-- C-45 -->
- **B-40** With `acks: 'steps'`, every step counts as a presented frame. The call to `present()` runs at the start of the step. [src/core/engine.js:151-155; src/core/engine.js:367] <!-- C-46 -->
- **B-41** With `acks: 'frames'`, only `engine.presented()` counts a frame. [src/core/engine.js:429] <!-- C-47 -->
- **B-42** `engine.onPresent(fn)` adds a copy-on-write listener and returns an unsubscribe function. [src/core/engine.js:430-433] <!-- C-48 -->
- **B-43** The engine adds these systems at creation. [src/core/engine.js:501-502; src/core/engine.js:516-517; src/core/engine.js:525-526; src/sim/world/install.js:31] <!-- C-50 -->
  - `lh.world.swap` in `input.apply`, before `lh.ui`
  - `lh.ui` in `input.apply`, before `lh.input`
  - `lh.input` in `input.apply`
  - `lh.commands` in `input.apply`, after `lh.input`
  - `lh.possess` in `input.apply`, after `lh.commands`
  - `lh.scene` in `pre`
  - `lh.events` in `events.flush`
- **B-44** The World seat adds `lh.physics.step`, `lh.physics.read` and `lh.physics.events` in the `physics.world` stage. [src/sim/world/install.js:34-37] <!-- C-51 -->
- **B-45** `lh.physics.step` skips the Rapier step while a scene loads. [src/sim/world/install.js:35; test/world-engine.test.mjs:88] <!-- C-51 -->
- **B-46** `lh.ui` calls `ui.advance(dt, engine)`. `lh.input` applies every controller's input. When recording, `lh.input` also records each seat's input changes. [src/core/engine.js:501-502] <!-- C-52 -->
- **B-47** `lh.scene` steps every scene from the main scene up. `lh.events` flushes the event queue. `lh.possess` calls `controllers.copy()`. [src/core/engine.js:517; src/core/engine.js:525-526] <!-- C-52 -->
- **B-48** `ctx.system(name, fn, opts)` adds a system with stage `'pre'` by default. The engine removes the system when the scene exits or when the scene's enter fails and the engine undoes it. [src/core/engine.js:204; src/core/engine.js:222; src/core/engine.js:226] <!-- C-55 -->
- **B-49** The remover that `schedule.add` returns removes the system only if the system is still the same entry. A stale remover cannot remove a system re-added under the same name. [src/core/schedule.js:54] <!-- C-57 -->
- **B-50** `schedule.remove(name)` removes the named system and does nothing for an unknown name. [src/core/schedule.js:56-59] <!-- C-58 -->
- **B-51** Systems in a stage run in insertion order. The options `before` and `after` reorder them within the stage, also through chains. [src/core/schedule.js:8-46; test/schedule.test.mjs:16] <!-- C-59 -->
- **B-52** A `before` or `after` name that is not a system of the same stage is ignored. A game can name a kit system that is not loaded. [src/core/schedule.js:1-2; src/core/schedule.js:13-14] <!-- C-60 -->
- **B-53** `schedule.run(stage, a, b)` calls each system of the stage in order with exactly two arguments. The engine passes the engine and `dt`. [src/core/schedule.js:61] <!-- C-62 -->
- **B-54** The schedule caches the sorted order of a stage. It sorts the stage again after an add or a remove in that stage. [src/core/schedule.js:47; src/core/schedule.js:53; src/core/schedule.js:58] <!-- C-63 -->
- **B-55** The pausing index is the index of the topmost open overlay whose scene sets `pauses`. The index is -1 if no overlay does. The main scene (index 0) never counts. [src/core/engine.js:229] <!-- C-64 -->
- **B-56** A scene is covered when it sits below the topmost pausing overlay. `coveredBy(scene)` returns the name of that overlay, or `undefined`. [src/core/engine.js:230] <!-- C-65 -->
- **B-57** `stepScenes` runs each scene from the given stack index up. A scene with a load runs a load update. Another scene runs its `step(engine, dt, ctx)` hook if it has one. [src/core/engine.js:231] <!-- C-66 -->

### Scenes and transitions
- **B-58** When the stack is empty, `enter` opens a World before the scene's enter hook. An overlay shares the main scene's World. [src/core/engine.js:217-219] <!-- C-71 -->
- **B-59** `enter` pushes the stack entry and calls `sync()`. It then runs the scene's `enter(engine, ctx)` hook, and then its `ui(builder, engine, ctx)` hook. [src/core/engine.js:220-221] <!-- C-72 -->
- **B-60** The method `exit(i)` removes the stack entry, drops its load and calls its exit hook. [src/core/engine.js:226] <!-- C-74 -->
- **B-61** After the exit hook, a finally block removes the scoped systems and the controls of the scene. It closes the World when i is 0 and calls `sync()`. A throwing exit hook still triggers the cleanup. [src/core/engine.js:226; test/engine.test.mjs:140] <!-- C-74 -->
- **B-62** A go transition exits every scene from the top of the stack down and enters the new main scene. It emits the event `scene` with `{ name, from }`, where `from` is the previous main scene. [src/core/engine.js:397-400] <!-- C-75 -->
- **B-63** An overlay transition enters the scene above the stack and emits `overlay` with `{ name, open: true }`. [src/core/engine.js:401] <!-- C-77 -->
- **B-64** A close transition exits the named overlay and emits `overlay` with `{ name, open: false }`. A close of a scene that is not an open overlay does nothing. [src/core/engine.js:402] <!-- C-77 -->
- **B-65** A transition request goes in the queue. If the engine is in a step, in a drain or in the boot state, the request waits. Otherwise the request drains the queue at once. [src/core/engine.js:360] <!-- C-80 -->
- **B-66** When the queue drains, only the last queued go and the requests after it apply. The requests before the last go are dropped. [src/core/engine.js:232-245; test/engine.test.mjs:181] <!-- C-81 -->
- **B-67** The projected stack replays the queued requests over the live stack. A go opens its scene and closes the others. An overlay opens its scene. A close closes its scene. [src/core/engine.js:383-387] <!-- C-84 -->
- **B-68** With `opts.once` true, `engine.overlay` returns without queuing when the scene is open or becomes open after the queue applies. The engine does not record that no-op. [src/core/engine.js:390-396; src/core/engine.js:462-465] <!-- C-85 -->
- **B-69** A `once` request for an unknown scene throws "engine: no scene '<name>'". [src/core/engine.js:395] <!-- C-87 -->
- **B-70** `engine.jump(name, preset, opts, args)` queues a go to the scene. It then calls the scene preset as `preset(engine, opts, mainCtx)`. Args reach the scene's enter. [src/core/engine.js:409-413; test/engine.test.mjs:130] <!-- C-88 -->
- **B-71** A transition that a scene requests in its own enter, exit or step hook waits in the queue. The entry of the scene completes first, and then the transition applies. [src/core/engine.js:360; test/engine.test.mjs:147; test/engine.test.mjs:161] <!-- C-90 -->
- **B-72** `engine.scene` is updated only when the stack changes. The `overlays` array keeps its identity across steps. [src/core/engine.js:133-141; test/engine.test.mjs:206] <!-- C-92 -->
- **B-73** `engine.scene.overlayArgs(name)` returns the args of the open overlay with that name, or `undefined`. The method `overlayArgs` is one function on the same scene view across steps. [src/core/engine.js:148; test/overlay-args.test.mjs:19] <!-- C-93 -->
- **B-74** Each `sync()` also calls `controllers.gate` with `menuOwnsInput(game, overlays)`. Only a change of the stack changes input gating. [src/core/engine.js:140] <!-- C-94 -->
- **B-75** `engine.state()` returns the game's debug-state object extended with `scene`, `overlays` and `step`. The engine's keys win over the game's keys. [src/core/engine.js:492-496; test/engine.test.mjs:234] <!-- C-95 -->
- **B-76** `engine.state()` adds `world` (the digest) only while the World has entities. [src/core/engine.js:494; test/world-engine.test.mjs:54] <!-- C-95 -->

### Commands
- **B-77** `engine.command` checks data in this order: plain JSON, then the schema of the type if it has one, then the reserved keys. The command carries one checked copy. [src/core/engine.js:325-337] <!-- C-98 -->
- **B-78** The plain-JSON check accepts plain objects, arrays, finite numbers, strings, booleans and null. It rejects undefined values, cycles, non-finite numbers and objects with another prototype than `Object.prototype` or null. [src/core/engine.js:282-296] <!-- C-99 -->
- **B-79** The schema check drops unknown keys. [src/core/engine.js:329-330] <!-- C-101 -->
- **B-80** The lh.commands system delivers the queued commands in first-in first-out order at the `input.apply` stage. A command issued during a step waits for the next step. [src/core/engine.js:246-250; test/commands.test.mjs:24] <!-- C-104 -->
- **B-81** For each command, the engine runs the built-in handler first and the game handler second. Then it runs the scene handlers of each open scene from the bottom up. [src/core/engine.js:253-264] <!-- C-105 -->
- **B-82** The built-in and game handlers get `(engine, data, mainCtx)`. [src/core/engine.js:255-256] <!-- C-105 -->
- **B-83** Built-in handlers and game handlers also run while a pausing overlay is open. Scene handlers of scenes below the topmost pausing overlay are skipped. [src/core/engine.js:255-260; test/commands.test.mjs:30] <!-- C-106 -->
- **B-84** If no handler runs for a command, the engine drops the command and adds 1 to `commands.dropped`. [src/core/engine.js:263; src/core/engine.js:324] <!-- C-107 -->
- **B-85** A built-in handler counts as a handler. A command with only a built-in handler is not dropped. [src/core/engine.js:255; src/core/engine.js:263] <!-- C-120 -->
- **B-86** A delivery pass handles only the commands queued when the pass starts. [src/core/engine.js:266; test/commands.test.mjs:24] <!-- C-108 -->
- **B-87** A scene handler added during delivery waits for the next command. [src/core/engine.js:261; test/commands.test.mjs:55] <!-- C-110 -->
- **B-88** A handler removed during delivery leaves a blank slot. The engine compacts the slots after the batch, so the next handler is not skipped. [src/core/engine.js:210-213; src/core/engine.js:272] <!-- C-110 -->
- **B-89** `engine.commands.handles(type)` is true when a built-in, the game or a scene on the stack has a handler for the type. [src/core/engine.js:252] <!-- C-113 -->
- **B-90** A command handler can start a load. Game handlers and scene handlers still run while a scene loads, because only the scene's step hook stops. [src/core/engine.js:231; src/core/engine.js:253-264; test/untilLoaded.test.mjs:18] <!-- C-166 -->
- **B-91** The engine owns the command `lh.seat` with the schema `{ op: oneOf('join', 'leave'), seat: uint(1, 15) }`. [src/core/engine.js:46-47] <!-- C-116 -->
- **B-92** The built-in `lh.seat` handler first asks `seats.route` (set by the net part) to number the seat. It stops if `route` handles the seat. [src/core/engine.js:518-519] <!-- C-236 -->
- **B-93** Offline, `lh.seat` calls `controllers.seat`. For a new join it adds the player to the roster as a local player. For a leave of a known seat other than 0 it removes the player. Then it calls `seats.changed`. [src/core/engine.js:520-523; test/players-engine.test.mjs:20] <!-- C-236 -->
- **B-94** The built-in `lh.back` handler does nothing without a menu or without `nav.back`. [src/core/engine.js:505-509] <!-- C-276 -->
- **B-95** If `nav.back` is a function, `lh.back` calls `back(engine, ctx)` with the ctx of the menu. If `nav.back` is an action name, `lh.back` sets that action for the next step. [src/core/engine.js:508; test/nav.test.mjs:46] <!-- C-276 -->
- **B-96** The built-in `lh.open` handler with `{ name }` does nothing in four cases. [src/core/engine.js:510-515; test/nav.test.mjs:55] <!-- C-277 -->
  - The scene has no `nav.open`.
  - A menu that owns input is on top.
  - The scene is open.
  - `open.when(engine)` returns false.
- **B-97** Otherwise `lh.open` calls `engine.overlay(name, undefined, { once: true })`. [src/core/engine.js:514] <!-- C-277 -->
- **B-98** `lh.back` and `lh.open` are commands. A recording engine logs them, so a replay reproduces them. [src/core/engine.js:505-515; test/nav.test.mjs:98] <!-- C-278 -->

### Recording
- **B-99** On a recording engine, an operation is external only when no step, drain or boot is running and no other recorded operation is running. The engine logs only external operations. [src/core/engine.js:275-278; src/core/engine.js:301] <!-- C-121 -->
- **B-100** A recording engine logs these operations: `go`, `overlay`, `close`, `jump`, `command`, and the UI operations `press`, `release`, `tap` and `fill`. It logs each operation under the step that follows it. [src/core/engine.js:304; src/core/engine.js:461-485] <!-- C-122 -->
- **B-101** A recording engine checks and copies the data before the operation runs. Scene args and jump opts must be plain JSON, and a missing value is stored as null. The scene or handler receives a copy of the logged value. [src/core/engine.js:279-306; test/commands.test.mjs:77] <!-- C-123 -->
- **B-102** A recording engine logs the changed input of each seat after the controllers apply their input. Seat 0 goes in the entry's `input`. Other seats go in the entry's `seats` by seat number. [src/core/engine.js:307-322] <!-- C-124 -->
- **B-103** The recording logs axes as numbers and buttons as their down value. The recording does not log bots. [src/core/engine.js:307-322] <!-- C-124 -->
- **B-104** `engine.ui.fill` on a recording engine logs the text as `String(text)`. [src/core/engine.js:485] <!-- C-125 -->
- **B-105** A non-recording engine allocates no recording state. It checks and delivers each command as one copy. [src/core/engine.js:275-278; src/core/engine.js:470] <!-- C-127 -->

### Net outbox
- **B-106** `engine.net.receive(type, data)` calls `engine.command` on a recording engine. Otherwise it queues the command without a deep copy. [src/core/engine.js:348-350] <!-- C-131 -->
- **B-107** `engine.net.drain(fn)` calls `fn` for each outbox item in order. If `fn` throws, the items not yet handed out stay in the outbox. [src/core/engine.js:351-357; test/commands.test.mjs:120] <!-- C-132 -->
- **B-108** At the end of each step, after the `onStep` listeners run, the engine empties the outbox. With no port the outbox does not grow. [src/core/engine.js:379; test/commands.test.mjs:111] <!-- C-135 -->
- **B-109** Each `onStep` listener runs in its own try block. A throwing listener does not stop the listeners after it, and the step rethrows the first error. [src/core/engine.js:378; test/engine.test.mjs:343] <!-- C-137 -->
- **B-110** `engine.flushEvents()` delivers queued events at once. The method does nothing while a step, a drain, the boot state or another `flushEvents` call is running. [src/core/engine.js:452-457] <!-- C-139 -->

### Events
- **B-111** `emit(type, data = {})` copies data into a new object and adds `seq`, `step` and `type`. The counter for `seq` starts at 1. Keys of the data cannot overwrite `seq`, `step` or `type`. [src/core/events.js:9-11; test/events.test.mjs:31] <!-- C-141 -->
- **B-112** `adopt(type, data)` stamps the object that the caller hands over and makes no copy. That object becomes the event. [src/core/events.js:3-4; src/core/events.js:12] <!-- C-142 -->
- **B-113** `flush()` delivers the queued events to every listener in order. An event that a listener emits during the flush is delivered in the same flush. [src/core/events.js:15-21; test/events.test.mjs:13] <!-- C-143 -->
- **B-114** `flush()` returns one reused array that is valid until the next flush. [src/core/events.js:13; src/core/events.js:26] <!-- C-144 -->
- **B-115** The event log is a ring of `logSize` events. `since(after = 0)` returns the logged events with `seq` above `after`, oldest first. [src/core/events.js:6-8; src/core/events.js:29-33] <!-- C-146 -->
- **B-116** `on(fn)` adds a listener to a copy-on-write array and returns an unsubscribe function. Adding the same function twice has no effect. [src/core/events.js:28] <!-- C-147 -->

### Loads
- **B-117** While a scene has a load, the engine does not call its step hook. In the same slot, each step runs one load update. [src/core/engine.js:163-166; src/core/engine.js:231] <!-- C-153 -->
- **B-118** In the hold phase, each load update adds 1 to a counter. The load builds when `ticks * dt` reaches `hold - 1e-9` and the presented frames since the request reach `frames`. [src/core/engine.js:190-192] <!-- C-154 -->
- **B-119** The frame count of a load starts from `drawn()`. That value is `time.frames`, plus 1 when `acks` is `'frames'` and a rendered frame has no ack yet. So a frame drawn before the request does not count. [src/core/engine.js:156-157; src/core/engine.js:161; src/core/engine.js:183] <!-- C-155 -->
- **B-120** At the build, the engine calls `build(engine, ctx)` and then each `onBuilt` listener with `(engine, ctx)`. If the build or a listener dropped the load, the update ends. [src/core/engine.js:193-195] <!-- C-156 -->
- **B-121** Without `settle`, the load finishes after the build. The engine drops the load and calls `then(engine, ctx)` if `then` is set. [src/core/engine.js:186; src/core/engine.js:196] <!-- C-157 -->
- **B-122** With `settle`, the load enters the phase `'settle'` after the build. It finishes when no block is held and, with `acks: 'frames'`, a frame was presented after the build. [src/core/engine.js:197-199] <!-- C-158 -->
- **B-123** With `acks: 'steps'` and no block, a settling load finishes in the same update as the build. [src/core/engine.js:199; test/loading.test.mjs:31] <!-- C-158 -->
- **B-124** If a build queues a go, `then` still runs, and the go applies at the end of the step. [src/core/engine.js:166-167; src/core/engine.js:375] <!-- C-160 -->
- **B-125** The engine allows one load at a time. Leaving the scene drops its load. [src/core/engine.js:168-175; src/core/engine.js:226] <!-- C-161 -->
- **B-126** A load waits under a pausing overlay. Its update runs only in a step that runs the scene's slot. [src/core/engine.js:231; src/core/engine.js:369-370; test/loading.test.mjs:71] <!-- C-163 -->

### UI registry
- **B-127** The control builder registers `button`, `toggle`, `field` and `hold` controls under the id `<scene>.<id>`. The roles are button, switch, textbox and hold. [src/core/ui.js:15-17; src/core/ui.js:29-40] <!-- C-175 -->
- **B-128** A `choice` registers one control per option with the role choice. The option gets the id `<scene>.<id>.<value>` and the group `<scene>.<id>`. [src/core/ui.js:32; test/ui.test.mjs:35] <!-- C-175 C-176 -->
- **B-129** Tapping a choice option calls `set(value)` with the original value of the option. [src/core/ui.js:97] <!-- C-176 -->
- **B-130** A tap on a switch calls `set(!get())`. A tap on a button with a function action calls `action(engine, sceneCtx)`. A tap on a button with an action name calls `onAction(name)`. [src/core/ui.js:97-100] <!-- C-181 -->
- **B-131** The callbacks `when`, `get`, `set` and `action` get the engine and the ctx of the control's own scene. [src/core/ui.js:97-100; test/ui.test.mjs:101] <!-- C-181 -->
- **B-132** A control whose action is an action name sets that action for one step on `engine.input`. [src/core/engine.js:150; src/core/ui.js:100] <!-- C-172 -->
- **B-133** `fill(id, text)` calls `set(String(text), engine, sceneCtx)` on a textbox. [src/core/ui.js:60-64] <!-- C-182 -->
- **B-134** `engine.ui.tryTap(id)` returns false if the control is not enabled. Otherwise it taps the control and returns true. [src/core/engine.js:481] <!-- C-171 -->
- **B-135** `ui.enabled(id)` never throws. It returns false for a missing control, a covered control or a control whose `when` returns false. [src/core/ui.js:65-68] <!-- C-183 -->
- **B-136** The UI registry gets the covered state from the engine. A control of a scene below the topmost pausing overlay is covered. [src/core/engine.js:150; test/engine.test.mjs:255] <!-- C-173 -->
- **B-137** `press(id, at)` on a hold control does nothing if the control is already pressed. Otherwise it sets `pressed`, resets `held` to 0 and, with `wall: true`, records the start: `at` when given, but not earlier than `time.wall`, else `time.wall`. `at` is the press time in milliseconds on the wall clock's timeline. A tape records the press without `at`. [src/core/ui.js:69-77; src/core/engine.js:483; test/ui.test.mjs:126] <!-- C-184 -->
- **B-138** `release(id)` cancels a pressed hold and does nothing otherwise. [src/core/ui.js:78-81] <!-- C-184 -->
- **B-252** `press(id, at)` throws `ui: press time must be a finite number of ms (got <at>)` when `at` is given and is not a finite number. [src/core/ui.js:74; test/ui.test.mjs:126]
- **B-139** Each step, `advance(dt)` adds `dt` to the held time of each pressed hold. For a hold with `wall: true`, `advance` sets the held time to `(time.wall - start) / 1000`, and to 0 while `time.wall` is before the start. [src/core/ui.js:89] <!-- C-185 -->
- **B-140** A hold fires once, when `held` reaches `seconds - 1e-9`. [src/core/ui.js:90] <!-- C-185 -->
- **B-141** A firing hold calls its function action as `action(engine, sceneCtx)`, or calls `onAction(name)` for an action name. [src/core/ui.js:90] <!-- C-186 -->
- **B-142** `advance` cancels a hold that is no longer registered, is covered, or whose `when` returns false. [src/core/ui.js:88] <!-- C-187 -->
- **B-143** `advance` iterates a snapshot of the pressed holds from last to first. An action that releases or clears other holds does not make `advance` skip a hold or advance a hold twice. [src/core/ui.js:82-86; test/ui.test.mjs:87] <!-- C-188 -->
- **B-144** In a headless run, the wall time of a hold control is virtual and exact, because `time.wall` is virtual when steps have no stamps. (inferred) [src/core/ui.js:76; src/core/ui.js:89; test/ui.test.mjs:126] <!-- C-315 -->
- **B-145** `clear(scene)` removes the controls of that scene and cancels their pressed holds. It leaves the controls of other scenes. [src/core/ui.js:42-44] <!-- C-189 -->
- **B-146** `view()` fills the same data as `tree()` into one reused object per control and one reused array. The result is valid until the next `view()` call. [src/core/ui.js:5-13; src/core/ui.js:45-51] <!-- C-191 -->

### Actions and input
- **B-147** `input.device(values, source = 'default')` writes the values into the named source layer. The input creates a source on first use and keeps sources in first-registration order. [src/core/actions.js:58-65] <!-- C-198 -->
- **B-148** The input layers have the precedence hold, then set, then device sources. A set value lasts for one apply. A hold lasts until `release`. [src/core/actions.js:84-86; src/core/actions.js:92; test/actions.test.mjs:27] <!-- C-200 -->
- **B-149** `release()` with no names clears all holds. `release(...names)` clears only those holds. [src/core/actions.js:86] <!-- C-201 -->
- **B-150** An axis takes the value with the largest absolute value across sources. A tie goes to the first registered source. A non-number reads 0. [src/core/actions.js:34-37; src/core/actions.js:46-51] <!-- C-202 -->
- **B-151** An axis in a pair takes its value from the source whose pair vector is longest (`Math.hypot` of both axes). A tie goes to the first registered source. Both halves come from the same source. [src/core/actions.js:40-45; test/actions.test.mjs:127] <!-- C-203 -->
- **B-152** A button is down when any source holds it. The snapshot value of an axis is clamped to [-1, 1], and a non-number becomes 0. [src/core/actions.js:49; src/core/actions.js:101] <!-- C-204 -->
- **B-153** A button gets `pressed` on the first apply in which it is down. It gets `released` on the first apply in which it is up. [src/core/actions.js:102; test/actions.test.mjs:14] <!-- C-205 -->
- **B-154** Each source counts its rising edges per button since the last apply. A rising edge counts only if no other source already holds the button. [src/core/actions.js:63-64] <!-- C-206 -->
- **B-155** An owed tap is a rising edge not yet shown as a press. `apply()` adds the new edges to the owed count and caps the count at 3. [src/core/actions.js:87-88; src/core/actions.js:95-96] <!-- C-207 -->
- **B-156** Each apply with an owed count above 0 shows a release if the button is down. Otherwise it shows a press and removes 1 from the count. [src/core/actions.js:97; test/actions.test.mjs:69] <!-- C-207 -->
- **B-157** A hold or set value for a button wins and clears the owed taps of that button. [src/core/actions.js:92] <!-- C-208 -->
- **B-158** `clearDevice(source)` removes the source. If no other source holds or owes a button that the removed source held or owed, the owed taps of that button drop. [src/core/actions.js:66-75] <!-- C-209 -->
- **B-159** `clearDevice` does nothing for an unknown source. [src/core/actions.js:69] <!-- C-209 -->
- **B-160** `gate(on)` turns input gating on or off. The method does nothing if the state does not change. While gated, device sources are ignored, but `set` and `hold` still apply. [src/core/actions.js:25-28; src/core/actions.js:37-38; src/core/actions.js:77-83] <!-- C-210 -->
- **B-161** When gating turns on, the input drops all owed taps and all rising-edge counts. When gating turns off, each button that any source still holds is latched. [src/core/actions.js:78-81] <!-- C-211 -->
- **B-162** A latched button stays off until no source holds it. Axes read device values again at once. [src/core/actions.js:39; src/core/actions.js:95] <!-- C-212 -->
- **B-163** Input merge and apply allocate nothing in a step. [src/core/actions.js:36; test/actions.test.mjs:43] <!-- C-214 -->

### Controllers and seats
- **B-164** `createEngine` makes seat 0 at the start, as controller id 1 with player number 1. The input of seat 0 is `engine.input`. [src/core/controllers.js:57; src/core/engine.js:128] <!-- C-216 -->
- **B-165** `possess(e)` returns the controller at once if it already holds `e`. [src/core/controllers.js:35] <!-- C-221 -->
- **B-166** Otherwise `possess(e)` drops the previous pawn with the reason `'unpossess'`. It takes `e` from another controller with the reason `'taken'`. [src/core/controllers.js:36-37; test/controllers.test.mjs:45] <!-- C-221 -->
- **B-167** Then `possess(e)` emits `controller.possess` with `{ controller, seat, player, pawn }` and fills `e.input` at once. [src/core/controllers.js:38-40] <!-- C-221 -->
- **B-168** A drop clears the pawn and emits `controller.unpossess` with `{ controller, seat, player, pawn, reason }`. The reasons are `'unpossess'`, `'taken'`, `'despawned'`, `'left'` and `'remote'`. [src/core/controllers.js:12-18; src/core/controllers.js:26; src/core/controllers.js:79-80] <!-- C-222 -->
- **B-169** If a dropped pawn's `e.input` is the controller's own snapshot, the engine sets `e.input` to `undefined`. [src/core/controllers.js:15-16] <!-- C-223 -->
- **B-170** If a dropped pawn's `e.input` is another object, the net layer made it. The engine then sets each number to 0 and each other value to false in place. [src/core/controllers.js:17; test/controllers.test.mjs:161] <!-- C-223 -->
- **B-171** A pawn with no `e.input`, or with the controller's snapshot, gets `e.input` set to the snapshot. [src/core/controllers.js:21-23] <!-- C-224 -->
- **B-172** A pawn with another `e.input` object keeps its shape. The engine copies only the keys that the snapshot also has, with buttons as their `down` value. [src/core/controllers.js:24; test/controllers.test.mjs:37] <!-- C-224 -->
- **B-173** The `lh.possess` system drops a pawn that is no longer in the current World, with the reason `'despawned'`. [src/core/controllers.js:79; test/controllers.test.mjs:62] <!-- C-225 -->
- **B-174** The `lh.possess` system drops a pawn that another peer now simulates, with the reason `'remote'`. It fills every other pawn. [src/core/controllers.js:80-81; test/players-engine.test.mjs:64] <!-- C-225 -->
- **B-175** A pawn that is spawned and possessed in a `pre` system sees that step's input in `post`. A controller with no pawn copies nothing. [src/core/controllers.js:75-78; test/controllers.test.mjs:177] <!-- C-226 -->
- **B-176** `unpossess()` drops the pawn with the reason `'unpossess'` and returns the controller. [src/core/controllers.js:43] <!-- C-227 -->
- **B-177** `controllers.seat(op, seat, n)` with `op` `'join'` returns the existing controller for the seat. [src/core/controllers.js:89-90] <!-- C-229 -->
- **B-178** Otherwise `seat` with `'join'` makes a controller with player number `n`, or with the lowest free number if `n` is not given. It emits `controller.joined` with `{ controller, seat, player }`. [src/core/controllers.js:91-96; test/controllers.test.mjs:108] <!-- C-229 -->
- **B-179** `controllers.seat` with `op` `'leave'` returns null when the seat has no controller or the seat is 0. [src/core/controllers.js:98] <!-- C-230 -->
- **B-180** Otherwise a leave removes the controller and drops its pawn with the reason `'left'`. It emits `controller.left` with `{ controller, seat, player }`. [src/core/controllers.js:99-100; test/controllers.test.mjs:185] <!-- C-230 -->
- **B-181** `controllers.renumber(from, to)` changes the player number of the controller that has number `from`. It emits `controller.renumbered` with `{ controller, seat, from, to }`. [src/core/controllers.js:64-71; test/controllers.test.mjs:200] <!-- C-232 -->
- **B-182** `controllers.gate(on)` sets the gate of every controller's input. `controllers.applyInputs()` applies every controller's input in list order. A menu that owns input (`nav.input` `'menu'`) gates every controller. [src/core/controllers.js:72-73; test/controllers.test.mjs:151] <!-- C-234 -->
- **B-183** `controllers.of` and `controllers.seat` work when called without their object. The module does not export `createControllers` publicly. [src/core/controllers.js:60; test/controllers.test.mjs:227-232] <!-- C-235 -->

### Roster and player state
- **B-184** At creation the roster holds player 1 on seat 0, local and active. The roster emits no event for that entry. The other fields are at their zero value. [src/core/engine.js:145; test/players-engine.test.mjs:13] <!-- C-240 -->
- **B-185** `zeroOf(f)` gives the start value of a field. The values are listed in the table in the Data and state section. [src/core/players.js:16-28; test/players.test.mjs:13] <!-- C-244 -->
- **B-186** `stateKinds(state, maxSender = 255)` returns two kinds with host authority, remote `'view'`, no body, and send `{ hz: 10, key: 2 }`. [src/core/players.js:32-36; test/players.test.mjs:23] <!-- C-246 -->
- **B-187** The kind `lh.player` has `max` equal to `maxSender`, `idMin` 1, `idMax` equal to `maxSender`, and the fields `PLAYER_BASE` plus the game's player fields. The kind `lh.game` has `max` 1, id 0 and the game-state fields. [src/core/players.js:33-35] <!-- C-246 -->
- **B-188** `roster.add(n, { seat = 0, local = false, join = 0, quiet = false })` inserts the player in number order with the game's fields at their zero value. [src/core/players.js:41-54; test/players.test.mjs:32] <!-- C-247 -->
- **B-189** Unless `quiet` is true, `roster.add` emits `player.joined` with `{ number, seat, local, rejoined: false }`. [src/core/players.js:45; src/core/players.js:52] <!-- C-247 -->
- **B-190** `roster.remove(n, why = 'left')` removes the entry and emits `player.left`, or `player.expired` when `why` is `'expired'`. The event carries `{ number, seat, local }`. [src/core/players.js:44; src/core/players.js:55-59] <!-- C-249 -->
- **B-191** `roster.remove` does nothing for an unknown number. [src/core/players.js:56] <!-- C-249 -->
- **B-192** `roster.away(n, on)` sets `away` and emits `player.away` or `player.back` once per change. [src/core/players.js:60; test/players.test.mjs:43] <!-- C-250 -->
- **B-193** `roster.activate(n, on)` sets `active`. Making a player active again clears `away` and emits `player.joined` with `rejoined: true`. Making a player inactive emits `player.inactive`. [src/core/players.js:61-64] <!-- C-250 -->
- **B-194** `roster.apply(n, rec, local)` builds or updates an entry from a host record. It emits `player.joined`, `player.inactive`, `player.away` or `player.back` for what changed. [src/core/players.js:65-74; test/players.test.mjs:53] <!-- C-251 -->
- **B-195** A new active entry from `roster.apply` also emits `player.away` if `away` is set. After an inactive period, `player.joined` carries `rejoined: true`. [src/core/players.js:70-71] <!-- C-251 -->
- **B-196** `roster.applyGame(rec)` copies the keys of `rec` that the game state has. [src/core/players.js:75] <!-- C-252 -->
- **B-197** `roster.relocal(has)` sets `local` on each entry from `has(number)`. `roster.clear()` empties the list. [src/core/players.js:76; src/core/players.js:82] <!-- C-252 -->
- **B-198** `roster.renumber(from, to)` moves an entry to the number `to` without an event. It keeps number order and does nothing for an unknown `from`. [src/core/players.js:77-81; test/players.test.mjs:63] <!-- C-253 -->
- **B-199** Player state and game state outlive a World. A transition keeps them. [test/players-engine.test.mjs:38] <!-- C-255 -->
- **B-200** With `net.join: 'engine'`, `defineGame` adds the two engine kinds from `stateKinds` to `net.kinds`. With `net.join: 'manual'`, `net.kinds` stays as the game gave it. [src/core/engine.js:81-83] <!-- C-262 -->
- **B-201** `defineGame` checks the kinds with `createRegistry`. [src/core/engine.js:83] <!-- C-262 -->
- **B-202** `defineGame` builds the wire tables `net.wire.toHost` and `net.wire.toGuest` from the game's wire entries and the engine join tags. It checks each table with `wireCodec` for the codec. [src/core/engine.js:104-113] <!-- C-266 -->

### Menu navigation
- **B-203** `topNav(game, overlays)` returns the name of the topmost overlay whose scene declares `nav`, or `undefined`. The main scene never counts. [src/core/nav.js:27-31; test/nav.test.mjs:36] <!-- C-275 -->
- **B-204** `menuOwnsInput` is true when the topmost menu has `nav.input` `'menu'`. That value is the default. [src/core/nav.js:33-35] <!-- C-275 -->
- **B-205** A menu with `input: 'shared'` leaves game input live. [src/core/nav.js:34; test/nav.test.mjs:92] <!-- C-279 -->
- **B-206** If `from` is an index, `pickNeighbour` skips that rect. If `from` is missing or has no rect, it returns -1. [src/core/navScore.js:23-24; test/navScore.test.mjs:97] <!-- C-282 -->
- **B-207** `pickNeighbour` ignores a rect that is missing or has a width or height that is not above 0. [src/core/navScore.js:31] <!-- C-283 -->
- **B-208** A candidate qualifies only if its centre is beyond the centre of the current rect in the move direction. It must also reach beyond the far edge of the current rect. Both tests use a margin of 1e-6. [src/core/navScore.js:4-5; src/core/navScore.js:34-36] <!-- C-284 -->
- **B-209** A candidate that overlaps the current rect on the other axis (`crossGap <= 1e-6`) is lined up. Lined-up candidates always beat the others. [src/core/navScore.js:5-8; src/core/navScore.js:38-39; test/navScore.test.mjs:36] <!-- C-285 -->
- **B-210** A candidate that is not lined up qualifies only inside the 45-degree cone, where `crossGap` is at most `gap + 1e-6`. [src/core/navScore.js:38-39; test/navScore.test.mjs:68] <!-- C-285 -->
- **B-211** Within a class, the candidate with the lowest score wins. The score is `gap + 2 * crossGap + 0.1 * |centre offset across|`. [src/core/navScore.js:9; src/core/navScore.js:15; src/core/navScore.js:40] <!-- C-286 -->
- **B-212** The `gap` is the distance from the far edge of the current rect to the near edge of the candidate. The gap is 0 when they touch or overlap. [src/core/navScore.js:10; src/core/navScore.js:37] <!-- C-286 -->
- **B-213** A score within 1e-6 of the best score does not replace it. Equal scores go to the lower index (document order). [src/core/navScore.js:12; src/core/navScore.js:41; test/navScore.test.mjs:42] <!-- C-287 -->
- **B-214** When no candidate qualifies, `pickNeighbour` returns -1. Menus stop at their edges and do not wrap. [src/core/navScore.js:12-13; src/core/navScore.js:43] <!-- C-288 -->

### Flags
- **B-215** A boolean flag (`debug`, `tune`, `fps`, `nosw`, `mute`, and `lh-test` as `lhTest`) is true when the parameter is present. A value of `'0'` or `'false'` makes it false. [src/core/flags.js:2; src/core/flags.js:7; test/flags.test.mjs:8] <!-- C-290 -->
- **B-216** The `seed` flag is null when absent. A value of only digits becomes `Number(BigInt(seed) & 0xffffffffn)`. Any other value stays a string. [src/core/flags.js:9; test/flags.test.mjs:16] <!-- C-291 -->
- **B-217** The `slow` flag is the `parseFloat` value when it is finite, else null. The `replay` flag is the string value or null. [src/core/flags.js:10-11] <!-- C-292 -->
- **B-218** `lhRender` is true only when `lhTest` is true and the `lh-test` value is `'render'`. [src/core/flags.js:12; test/flags.test.mjs:29] <!-- C-293 -->
- **B-219** `debugs` is a frozen list of the comma-separated topics of an on `debug` flag, trimmed, without empty entries. The list is empty when `debug` is off or has no value. [src/core/flags.js:14-15; test/flags.test.mjs:34] <!-- C-294 -->
- **B-220** `extra` is a frozen object with every query parameter whose name is not in `FLAGS`. [src/core/flags.js:16-17] <!-- C-295 -->
- **B-233** `lhRecord` is true only when `lhTest` is true and the `lh-record` parameter is present and not `'0'` or `'false'`. [src/core/flags.js:2; src/core/flags.js:7; src/core/flags.js:13; test/flags.test.mjs:12] <!-- C-316 -->

### Checksum
- **B-234** `canonical(value, { digits = 6, exact = false })` returns `JSON.stringify` of a normalized copy of `value`. [src/core/checksum.js:16] <!-- C-317 -->
- **B-235** The normalized copy sorts object keys and drops keys whose value is `undefined`. [src/core/checksum.js:13] <!-- C-318 -->
- **B-236** A `Map`, a `Set`, a typed array (not a `DataView`) and an array each become an array of normalized items. [src/core/checksum.js:6; src/core/checksum.js:9-12] <!-- C-318 -->
- **B-237** The normalized copy rounds each number to `digits` decimals with `toFixed` and turns -0 into 0. [src/core/checksum.js:5; src/core/checksum.js:16] <!-- C-319 -->
- **B-238** With `exact` true, the copy keeps every bit of each number and still turns -0 into 0. [src/core/checksum.js:7-8; src/core/checksum.js:16] <!-- C-319 -->
- **B-239** `NaN`, `Infinity` and `-Infinity` become strings in the normalized copy. [src/core/checksum.js:5; src/core/checksum.js:8] <!-- C-319 -->
- **B-240** `checksum(value, opts)` returns `fnv(canonical(value, opts))` as lowercase hexadecimal, padded with zeros to 8 characters. [src/core/checksum.js:17] <!-- C-320 -->

### Tape replay
- **B-241** `tapeStart(tape)` returns `{ seed, scene, args, wall0 }` for the `createEngine` options. The value `wall0` is 0 when the tape has none. [src/core/tape.js:12] <!-- C-322 -->
- **B-242** For each step k from 0 to the end step minus 1, `replayTape` applies the log entry of step k. [src/core/tape.js:45-46] <!-- C-324 -->
- **B-243** Then `replayTape` sets the accumulated seat 0 input with `e.input.set`. The function sets the accumulated input of each other seat on the controller of that seat. Last, the function takes one step and compares the checksum. [src/core/tape.js:46-56] <!-- C-324 -->
- **B-244** A log entry applies its ops in order. Then the `input` of the entry merges into the accumulated seat 0 values. Each `seats` value merges into the accumulated values of its seat. [src/core/tape.js:39-44] <!-- C-325 -->
- **B-245** `replayTape` replays the ops `tap`, `fill`, `press`, `release`, `command`, `go`, `overlay`, `close` and `jump`. [src/core/tape.js:19-34] <!-- C-326 -->
- **B-246** A null `args` or `opts` value in an op becomes `undefined`. A `command` op replays a JSON copy of its data, so the tape stays unchanged. [src/core/tape.js:18; src/core/tape.js:27-31] <!-- C-326 -->
- **B-247** The end step is `tape.end`. If `tape.end` is absent, the end step is the step of the last log entry, or 0 for an empty log. [src/core/tape.js:17] <!-- C-327 -->
- **B-248** After the loop, `replayTape` applies the ops of the entry at the end step and sets no input for it. [src/core/tape.js:58-61] <!-- C-327 -->
- **B-249** After step k + 1, `replayTape` compares `checksum(e.state())` with the value that `tape.sums` holds for that step. A step with no entry in `tape.sums` is not compared. [src/core/tape.js:16; src/core/tape.js:55-56] <!-- C-328 -->
- **B-250** A seat that had a controller earlier in the replay and has none now is skipped, and its input is not set. [src/core/tape.js:37; src/core/tape.js:47-53] <!-- C-329 -->
- **B-251** `checksum.js` imports `fnv` from `rng.js`, and `tape.js` imports `checksum` from `checksum.js`. The view modules `boot.js` and `hook.js` import these helpers. [src/core/checksum.js:3; src/core/tape.js:4; src/view/boot.js:7-8; src/view/hook.js:3] <!-- C-333 -->

### Policies
- **B-221** `policy.still()` returns a policy that returns `{}`. `policy.const(p)` returns a policy that returns `p`. `policy.fn(f)` returns `f`. [src/core/policy.js:5-8] <!-- C-297 -->
- **B-222** `policy.seq(list)` returns a policy. The policy takes the call index `i` and returns the `p` of the `[n, p]` entry whose n-call span covers `i`. [src/core/policy.js:7] <!-- C-297 -->
- **B-232** The policy from `policy.seq` returns `{}` after the last entry. [src/core/policy.js:7] <!-- C-297 -->
- **B-223** `policy.every(n, fn)` calls `fn` every n engine steps and holds the last output between calls. The cadence follows `engine.time.step`, not the call index. [src/core/policy.js:9-12; src/core/policy.js:17-23] <!-- C-298 -->
- **B-224** A gap of n steps or more re-anchors the cadence at the next call. The option `phase` moves the first call back by `phase` steps. [src/core/policy.js:10-12; src/core/policy.js:20-21] <!-- C-298 -->
- **B-225** If `key(h)` returns a value that is not `===` the last value, `policy.every` recomputes at once and anchors the cadence there. [src/core/policy.js:11-12; src/core/policy.js:18-22] <!-- C-299 -->

### Math
- **B-226** `qmul` writes the Hamilton product `a * b` into `out`. `rotate` writes `v` rotated by `q` into `out`. With `conj` true, `rotate` uses the inverse of `q`. [src/core/math.js:6-17] <!-- C-303 -->
- **B-227** In `qmul` and `rotate`, `out` may be the same object as an input. [src/core/math.js:2; test/math.test.mjs:14] <!-- C-303 -->
- **B-228** `qnorm` normalizes `q` in place and treats a zero length as 1. [src/core/math.js:18] <!-- C-304 -->
- **B-229** `qslerp` takes the short way and blends linearly when the dot product is 0.9995 or more. It then normalizes `out`. [src/core/math.js:19-26; test/math.test.mjs:18] <!-- C-304 -->
- **B-230** `qFromYaw(yaw, out)` writes the rotation about +Y. A positive yaw turns +X toward -Z. [src/core/math.js:28; test/math.test.mjs:9] <!-- C-305 -->
- **B-231** The per-step functions in `math.js` write into `out` and allocate nothing. [src/core/math.js:2] <!-- C-306 -->

## Data and state

- **Seed:** `engine.seed` is `seed >>> 0` for a numeric seed. For any other seed it is `fnv(String(seed))`. [src/core/engine.js:126; src/core/rng.js:11] <!-- C-9 -->
- **Loop stats:** `loop.stats` holds `{ frames, steps, clamped, lastSteps }`. All four start at 0. [src/core/loop.js:5] <!-- C-27 -->
- **Stages:** `STEP_STAGES` is the frozen list `input.apply`, `pre`, `physics.world`, `post`, `events.flush`. [src/core/schedule.js:3] <!-- C-35 -->
- **Time:** `engine.time` is one persistent object `{ step, sim, frames, wall }`. The engine updates it in place, and `wall` starts at `wall0`. [src/core/engine.js:131; src/core/engine.js:449] <!-- C-44 -->
- **Game:** `defineGame` returns a frozen game. The game adds `sim`, `actions`, `policies`, `commands`, `schemas`, `net`, `player` and `gameState` to the keys of the spec. The default `actions` is an empty set, and the default `policies` is `{}`. [src/core/engine.js:69] <!-- C-69 -->
- **Scene ctx:** a scene ctx holds `name`, `id`, `args`, `state`, `system()`, `command()`, `load()` and a `world` getter. Each entered scene gets a new `id` from a counter that starts at 1. [src/core/engine.js:131; src/core/engine.js:203-217] <!-- C-70 -->
- **Scene view:** `engine.scene` is one persistent object `{ name, id, args, state, overlays, overlayIds, overlayArgs }`. [src/core/engine.js:131; src/core/engine.js:133-141] <!-- C-92 -->
- **Reserved keys:** `from` (a string), `at` (a finite number) and `reliable` (a boolean). The engine type-checks them on every command whose data is a plain object, with or without a schema. The engine copies them to the checked data. [src/core/engine.js:20-22; src/core/engine.js:331-336] <!-- C-102 -->
- **Events:** the engine emits `scene`, `overlay`, `controller.possess`, `controller.unpossess`, `controller.joined`, `controller.left`, `controller.renumbered`, `player.joined`, `player.left`, `player.expired`, `player.away`, `player.back` and `player.inactive`. [src/core/engine.js:399; src/core/controllers.js:18; src/core/players.js:45-63] <!-- C-149 -->
- **Loading state:** `engine.loading` is a live object `{ active, scene, label, phase, blocks }`. The value `phase` is `''`, `'hold'` or `'settle'`. The getter `blocks` returns the labels of unreleased blocks. [src/core/engine.js:168-174] <!-- C-162 -->
- **Control tree entry:** `tree()` returns one new object per control `{ id, scene, role, label, enabled }`. A switch adds `pressed`. A choice adds `pressed` and `group`. A hold adds `pressed` and `progress` (`min(1, held / seconds)`). A textbox adds `value` (`String` of `get`, or `''` for null). [src/core/ui.js:52-59] <!-- C-190 -->
- **Input snapshot:** the snapshot holds a number for each axis and `{ down, pressed, released }` for each button. The initial values are 0 and false. `apply()` returns the same snapshot object each time. [src/core/actions.js:21; src/core/actions.js:105; test/actions.test.mjs:43] <!-- C-197 -->
- **Action maps:** `actions(map)` returns a frozen copy of the map. [src/core/actions.js:16] <!-- C-196 -->
- **Controller:** a controller is `{ id, seat, bot, player, disposed, input, pawn, possess(e), unpossess(), dispose() }`. Controller ids start at 1 and increase by 1 in creation order. [src/core/controllers.js:11; src/core/controllers.js:29-48] <!-- C-217 -->
- **Seat seam:** `engine[SEATS]` is a non-public seam `{ controllers, roster, route, changed }` for the net part. `SEATS` is `Symbol('lh.seats')`. [src/core/engine.js:498-500; src/core/players.js:13] <!-- C-237 -->
- **Roster entry:** a roster entry is `{ number, local, ...fields }`. The fields are `seat`, `away`, `active`, `join` and the game's player fields. A new entry has each field at `zeroOf(field)`, then `seat` set and `active` true. [src/core/players.js:11; src/core/players.js:39; src/core/players.js:43] <!-- C-241 -->
- **Constants:** `PLAYER_KIND` is `'lh.player'`, `GAME_KIND` is `'lh.game'`, `PLAYER_CODE` is 255 and `GAME_CODE` is 254. `PLAYER_BASE` is `{ seat: uint(1, 15), away: bool, active: bool, join: uint(1) }`. [src/core/players.js:9-11] <!-- C-242 -->
- **Reserved player names:** `PLAYER_RESERVED` lists `number`, `local` and the `PLAYER_BASE` keys. [src/core/players.js:12] <!-- C-243 -->
- **Refusal reasons:** `REASONS` is the frozen list `full`, `seats`, `schema`, `admit`, `busy`, `taken`. `net.reasons` is `REASONS` plus the game's `net.reasons`, without duplicates. [src/core/engine.js:24; src/core/engine.js:91-92] <!-- C-263 -->
- **Join commands:** `defineGame` adds `net.hello { key, seats, schema }`, `net.seat { op, seat }`, `net.welcome { players }` and `net.refused { reason, seat }` to the schemas. `JOIN_TYPES` lists the four names. [src/core/engine.js:25; src/core/engine.js:97-103] <!-- C-265 -->
- **Schema hash:** `net.schema` is the FNV hash of the engine version, the kinds (name, code, authority, remote, max, idMin, idMax, fields) and the refusal reasons. The net config object is frozen. [src/core/engine.js:114-117] <!-- C-268 -->
- **Nav lists:** `NAV_INPUTS` is the frozen list `menu`, `shared`. `NAV_OPEN_BUTTONS` is the frozen list `a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`, `select`, `start`, `ls`, `rs`. [src/core/nav.js:5-6] <!-- C-270 -->
- **Policy scratch:** the scratch object of a policy is one persistent object per handle and policy function. `policy.every` uses `scratch.at`, `scratch.key`, `scratch.out` and `scratch.inner`. [src/core/policy.js:2-3; src/core/policy.js:19-22] <!-- C-301 -->
- **Version:** `ENGINE_VERSION` is `'0.13.0'`. Builds stamp it and joins compare it. A test checks that it matches `package.json`. [src/version.js:1-2; test/package.test.mjs:6] <!-- C-308 -->

### Start values of `zeroOf`
| Field type | Start value |
| --- | --- |
| `bool` | false |
| `uint` | its `min` |
| `id` | null |
| `enum` | its first value |
| `fixed` | 0 clamped to `[lo, hi]` |
| `angle` | 0 |
| `quat` | `{ x: 0, y: 0, z: 0, w: 1 }` |
| `obj` | the zero of each field |
| `list` | `min` items, each the zero of the item type |
| `actions` | 0 for axes, false for buttons |

Evidence: [src/core/players.js:16-28] <!-- C-244 -->

## Configuration

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `sim` | `{ hz: 60, maxCatchUp: 3, maxFrame: 0.25 }` | merged under the spec's `sim` object | [src/core/engine.js:67] <!-- C-29 --> |
| `commands.<type>` | none | a function, or `{ schema, handler }`, where `game.commands` keeps handlers and `game.schemas` keeps schemas | [src/core/engine.js:36-44] <!-- C-114 --> |
| `player` | `{}` | fields of each roster entry | [src/core/engine.js:50] <!-- C-256 --> |
| `gameState` | `{}` | fields of the game-state object | [src/core/engine.js:50] <!-- C-256 --> |
| `state` | none | the debug-state function, which must be a function | [src/core/engine.js:49] <!-- C-256 --> |
| `net.maxJson` | 2048 | positive integer limit | [src/core/engine.js:75] <!-- C-258 --> |
| `net.maxFrame` | 16384 | positive integer limit | [src/core/engine.js:75] <!-- C-258 --> |
| `net.codec` | `'json'` | `'json'` or `'binary'` | [src/core/engine.js:75] <!-- C-258 --> |
| `net.join` | `'engine'` | `'engine'` or `'manual'` | [src/core/engine.js:75] <!-- C-258 --> |
| `net.maxSeats` | 4 | integer in 1..16 | [src/core/engine.js:75] <!-- C-258 --> |
| `net.rejoinSeconds` | 60 | finite number >= 0 | [src/core/engine.js:75] <!-- C-258 --> |
| `net.maxPlayers` | `net.maxSender` | integer in 1..`maxSender` | [src/core/engine.js:86] <!-- C-258 --> |
| `net.kinds` | none, required when `net` is set | array of kinds | [src/core/engine.js:77] <!-- C-264 --> |
| `net.maxSender` | none, required when `net` is set | integer in 1..255 | [src/core/engine.js:78] <!-- C-264 --> |
| `net.rates.host` | none, required when `net` is set | positive numbers for `reliable` and `fast`, and for `reliableFrames` only when given | [src/core/engine.js:93-96] <!-- C-264 --> |
| `net.rates.guest` | none, required when `net` is set | positive numbers for `reliable` and `fast` | [src/core/engine.js:93-96] <!-- C-264 --> |
| `scene.nav` | none | `{ modal = false, initial, back, input = 'menu', open: { button, key, seconds = 0, when } }` | [src/core/nav.js:3] <!-- C-271 --> |

## Errors and limits

### Engine and game creation
- `createEngine` throws 'engine: wall0 must be a finite number' when `wall0` is not a finite number. [src/core/engine.js:122] <!-- C-3 -->
- `createEngine` throws "engine: acks must be 'steps' or 'frames'" for any other `acks` value. [src/core/engine.js:123] <!-- C-4 -->
- `createEngine` throws "engine: record needs acks 'steps'" when `record` is true and `acks` is not `'steps'`. [src/core/engine.js:124] <!-- C-5 -->
- `createEngine` throws 'engine: timer must be a function' when `timer` is neither null nor a function. [src/core/engine.js:125] <!-- C-6 -->
- If setup or the start scene enter throws, `createEngine` empties the transition queue and rethrows the error. [src/core/engine.js:535] <!-- C-8 -->
- An absent `physics.rapier` passes the Rapier check. The check runs only when `game.physics.rapier` is set. [src/sim/physics/rapier.js:37-41] <!-- C-313 -->
- `checkRapier` throws 'physics: physics.rapier must be the @dimforge/rapier3d-compat module' when `World` is not a function. [src/sim/physics/rapier.js:39] <!-- C-313 -->
- `checkRapier` throws 'physics: await RAPIER.init() before createEngine' when `new R.World` throws. [src/sim/physics/rapier.js:41] <!-- C-313 -->
- `defineGame` fails with 'defineGame: sim.hz must be a positive number' when `sim.hz` is not a finite number above 0. [src/core/engine.js:68] <!-- C-30 -->
- `defineGame` fails with the same message for `sim.maxCatchUp`, with the name changed. [src/core/engine.js:68] <!-- C-30 -->
- `defineGame` does not check `sim.maxFrame`. [src/core/engine.js:68] <!-- C-30 -->
- `defineGame` fails with the prefix 'defineGame: ' in four cases. [src/core/engine.js:30-35] <!-- C-67 -->
  - `id` is not a non-empty string.
  - `scenes` is missing or empty.
  - `setup` or `reset` is not a function.
  - `start` is not a scene.
- `defineGame` fails when a scene's `enter`, `exit`, `step` or `ui` is not a function. [src/core/engine.js:28; src/core/engine.js:60] <!-- C-68 -->
- `defineGame` fails when a `commands` entry is neither a function nor an object with a function `handler`. It also fails when the entry's schema is not a valid set of F fields or declares a reserved key (`from`, `at`, `reliable`). [src/core/engine.js:40-42] <!-- C-115 -->
- `defineGame` fails when the game declares `commands.lh.seat`. [src/core/engine.js:46] <!-- C-116 -->
- `defineGame` fails when the game gives a schema to `net.hello`, `net.seat`, `net.welcome` or `net.refused`. [src/core/engine.js:25; src/core/engine.js:64] <!-- C-117 -->
- `defineGame` fails when `state` is not a function. It also fails for invalid `player` or `gameState` fields. [src/core/engine.js:49-58] <!-- C-257 -->
- `defineGame` fails when a `player` or `gameState` field is `F.body()` or is named `input`, or has the name of an entity part. [src/core/engine.js:53-54] <!-- C-257 -->
- `defineGame` fails when a `player` field uses a `PLAYER_RESERVED` name or the fields do not fit `F.obj`. [src/core/engine.js:56-58; test/players-engine.test.mjs:71] <!-- C-257 -->
- `defineGame` fails when `net.kinds` is not an array or `net.maxSender` is not an integer in 1..255. [src/core/engine.js:77-78] <!-- C-259 -->
- `defineGame` fails when `net.join` is not `'engine'` or `'manual'`, or `net.codec` is not `'json'` or `'binary'`. [src/core/engine.js:80; src/core/engine.js:85] <!-- C-259 -->
- `defineGame` fails when `net.maxJson` or `net.maxFrame` is not a positive integer. [src/core/engine.js:84] <!-- C-259 -->
- `defineGame` fails when `net.maxPlayers` is not an integer in 1..`maxSender`. [src/core/engine.js:87] <!-- C-260 -->
- `defineGame` fails when `net.maxSeats` is not an integer in 1..16. [src/core/engine.js:88] <!-- C-260 -->
- `defineGame` fails when `net.rejoinSeconds` is not a finite number >= 0. [src/core/engine.js:89] <!-- C-260 -->
- `defineGame` fails when `net.admit` is not a function or `net.reasons` is not an array of non-empty strings. [src/core/engine.js:90-91] <!-- C-260 -->
- `defineGame` fails when a net kind uses the code 254 or 255, or a name that starts with `lh.`. [src/core/engine.js:79] <!-- C-261 -->
- `defineGame` fails with 'net.rates.<role> must be an object' when a role entry is missing. [src/core/engine.js:94] <!-- C-264 -->
- `defineGame` fails when a `net.wire` entry is not an object. It also fails when an entry uses the tag of an engine join command or names a command with no schema. [src/core/engine.js:106-110] <!-- C-267 -->
- `defineGame` fails when `wireCodec` rejects a wire table. [src/core/engine.js:111] <!-- C-267 -->
- `defineGame` fails with "scene '<name>'.nav.back: no action '<back>'" when `nav.back` is a string that is not a game action. [src/core/engine.js:62] <!-- C-274 -->
- `checkNav` fails for a `nav` that is not an object or has an unknown option. [src/core/nav.js:11-12] <!-- C-272 -->
- `checkNav` fails for `modal` that is not a boolean, or `initial` that is not a non-empty string. [src/core/nav.js:13-14] <!-- C-272 -->
- `checkNav` fails for `back` that is not a function or a non-empty string, or `input` that is not `'menu'` or `'shared'`. [src/core/nav.js:15-16] <!-- C-272 -->
- `checkNav` fails for a `nav.open` that is not an object, has an unknown option, or has neither `button` nor `key`. [src/core/nav.js:17-20] <!-- C-273 -->
- `checkNav` fails for a `button` not in `NAV_OPEN_BUTTONS` or a `key` that is not a non-empty string. [src/core/nav.js:21-22] <!-- C-273 -->
- `checkNav` fails for `seconds` that is not a finite number >= 0, or a `when` that is not a function. [src/core/nav.js:23-24] <!-- C-273 -->

### Steps, schedule and transitions
- If a system, a transition or a listener throws during a step, the step still finishes. The engine keeps the first error and rethrows it at the end of the step. [src/core/engine.js:372-380; test/engine.test.mjs:135] <!-- C-41 -->
- `schedule.add` throws "schedule: unknown stage '<stage>' for '<name>'" for an unknown stage. It throws "schedule: duplicate system '<name>'" for a repeated name. [src/core/schedule.js:50-51] <!-- C-56 -->
- If the `before` and `after` rules form a cycle, the schedule throws "schedule: cycle in '<stage>': <names>". The names are the systems that cannot be placed. [src/core/schedule.js:42] <!-- C-61 -->
- If a scene's `enter` or `ui` hook throws, the engine removes the load and the stack entry. The engine also removes the scoped systems and the controls. The engine closes the World for a main scene and rethrows. [src/core/engine.js:222; test/engine.test.mjs:82] <!-- C-73 -->
- A go transition throws "engine: scene '<name>' is already open" when the scene is open as an overlay. A go to the current main scene exits and enters it again. [src/core/engine.js:398] <!-- C-76 -->
- `engine.go`, `engine.overlay` and `engine.jump` throw "engine: no scene '<name>'" for an unknown scene at the call. `engine.close` does not check the name. [src/core/engine.js:149; src/core/engine.js:403-408] <!-- C-79 -->
- If a queued transition throws, the drain empties the queue and rethrows. Later transitions still work. [src/core/engine.js:244; test/engine.test.mjs:172] <!-- C-82 -->
- `engine.overlay` throws "engine: scene '<name>' is already open" at the call. The scene is open, or a queued request opens it. The step still completes. [src/core/engine.js:404-406; test/engine.test.mjs:189] <!-- C-83 -->
- `engine.overlay` throws 'engine: overlay options must be an object' when `opts` is null, an array or not an object. [src/core/engine.js:392] <!-- C-86 -->
- `engine.overlay` throws 'engine: overlay once must be a boolean' when `opts.once` is set and is not a boolean. [src/core/engine.js:393] <!-- C-86 -->
- `engine.jump` throws "engine: no preset '<preset>' in '<name>'" when the scene has no such preset. [src/core/engine.js:411] <!-- C-89 -->

### Commands, events and the outbox
- `engine.command` throws 'engine: command type must be a non-empty string' when `type` is not a non-empty string. [src/core/engine.js:415] <!-- C-97 -->
- A failed plain-JSON check throws 'engine: <what> must be plain JSON'. For command data, `<what>` is 'command data'. [src/core/engine.js:283; src/core/engine.js:328] <!-- C-100 -->
- A command whose data fails its schema throws "engine: command '<type>' does not match its schema". [src/core/engine.js:330] <!-- C-101 -->
- A reserved key of the wrong type throws "engine: command '<type>' reserved key '<key>' must be <a string | a finite number | a boolean>". [src/core/engine.js:22; src/core/engine.js:333] <!-- C-103 -->
- If a handler throws, its command counts as delivered. The step finishes, the error rethrows, and the rest of the batch stays queued for the next step. [src/core/engine.js:269-273; test/commands.test.mjs:41] <!-- C-109 -->
- `ctx.command` throws "engine: command '<type>' handler must be a function" for a non-function. [src/core/engine.js:207] <!-- C-112 -->
- `ctx.command` throws "engine: '<type>' has a schema: handle it in defineGame({ commands }) (#49)" for a type that has a schema. [src/core/engine.js:208] <!-- C-112 -->
- `engine.builtin` throws "engine: builtin type must be a non-empty string" and "engine: builtin '<type>' needs a function". [src/core/engine.js:443-444] <!-- C-119 -->
- `engine.builtin` throws "engine: builtin '<type>' is already registered" for a repeated type. [src/core/engine.js:445] <!-- C-119 -->
- `engine.net.send` throws 'engine: net.send data must be { t, ... } or an ArrayBuffer' when `data` is neither an `ArrayBuffer` nor an object with a string `t`. [src/core/engine.js:344] <!-- C-129 -->
- A nested `engine.net.drain` call from inside `fn` throws 'engine: net.drain is not re-entrant'. [src/core/engine.js:354; test/commands.test.mjs:130] <!-- C-133 -->
- If a listener throws during `flush`, the events already started are dropped but stay in the log. The error propagates. The events not yet started stay queued for the next flush. [src/core/events.js:13-14; src/core/events.js:22-25; test/events.test.mjs:36] <!-- C-145 -->
- `engine.tape()` throws 'engine: not recording' on an engine that does not record. [src/core/engine.js:489] <!-- C-126 -->
- `engine.presented()` throws "engine: presented() needs acks: 'frames'" when `acks` is `'steps'`. [src/core/engine.js:429] <!-- C-47 -->
- `engine.onPresent` throws 'engine: onPresent needs a function' for a non-function. [src/core/engine.js:431] <!-- C-48 -->
- `engine.onBuilt` throws 'engine: onBuilt needs a function' for a non-function. [src/core/engine.js:435] <!-- C-165 -->

### Loads
- `ctx.load` throws 'engine: load needs a build function' when `build` is not a function. [src/core/engine.js:177] <!-- C-151 -->
- `ctx.load` throws 'engine: load hold must be a finite number >= 0' (or the same for `frames`) for a bad value. [src/core/engine.js:178; test/loading.test.mjs:98] <!-- C-151 -->
- `ctx.load` throws "engine: scene '<name>' is not open" for a stale ctx. [src/core/engine.js:179] <!-- C-152 -->
- `ctx.load` throws "engine: scene '<other>' is already loading" when another scene loads. It throws "engine: '<name>' is already loading" when the same scene loads. [src/core/engine.js:180-181] <!-- C-152 -->
- If a build throws, the engine drops the load and rethrows the error. [src/core/engine.js:200; test/loading.test.mjs:81] <!-- C-159 -->

### UI registry
- The registry throws "ui: duplicate control '<id>'" for a repeated control id. [src/core/ui.js:17] <!-- C-177 -->
- A hold control throws "ui: hold '<id>' needs seconds > 0" when `seconds` is not above 0. [src/core/ui.js:37] <!-- C-178 -->
- A hold control throws "ui: hold '<id>' action must be a function or a known action name" for another action. [src/core/ui.js:38] <!-- C-178 -->
- `tap`, `press` and `fill` throw "ui: no control '<id>'" for an unknown id. They throw "ui: control '<id>' is covered by '<scene>'" for a covered control. [src/core/ui.js:21-24] <!-- C-179 -->
- `tap`, `press` and `fill` throw "ui: control '<id>' is disabled" when the `when` of the control returns false. [src/core/ui.js:25] <!-- C-179 -->
- `tap` throws "ui: control '<id>' is a field: use fill" for a textbox. It throws "ui: control '<id>' is a hold: use press" for a hold. [src/core/ui.js:95-96] <!-- C-180 -->
- `fill` throws "ui: control '<id>' is not a field" for another role. `press` throws "ui: control '<id>' is not a hold" for another role. [src/core/ui.js:62; src/core/ui.js:73] <!-- C-180 -->

### Actions, controllers and roster
- `actions(map)` throws "actions: '<k>' must be axis() or button()" for another value. [src/core/actions.js:7] <!-- C-194 -->
- `actions(map)` throws for a pair that names an unknown action, itself or a button. The messages start with 'actions: '.
- `actions(map)` also throws for a pair declared from both sides and for an action in two pairs. [src/core/actions.js:11-14; test/actions.test.mjs:127] <!-- C-195 -->
- `device`, `set` and `hold` throw "input: unknown action '<name>'" for a name not in the schema. [src/core/actions.js:31; src/core/actions.js:84-85] <!-- C-199 -->
- `engine.controller` throws 'engine.controller: only bots are made directly (seats join with the lh.seat command)' unless `bot` is true. [src/core/engine.js:425] <!-- C-219 -->
- `possess` throws 'controller.possess: controller was disposed' for a disposed controller. [src/core/controllers.js:32] <!-- C-220 -->
- `possess` throws 'controller.possess: needs an entity' unless `e` is an object with an integer `id`. [src/core/controllers.js:27; src/core/controllers.js:33] <!-- C-220 -->
- `possess` throws "controller.possess: entity <id> is simulated by another peer" for a replica that another peer simulates. [src/core/controllers.js:34] <!-- C-220 -->
- `dispose()` throws 'controller.dispose: seats leave with the lh.seat command' on a seated controller. On a bot it removes the controller with the reason `'left'` and marks it disposed. [src/core/controllers.js:26; src/core/controllers.js:44-47] <!-- C-228 -->
- `controllers.seat` throws "lh.seat: op must be 'join' or 'leave'" and 'lh.seat: seat must be an integer in 0..15'. [src/core/controllers.js:7; src/core/controllers.js:86-87] <!-- C-231 -->
- `controllers.seat` throws 'lh.seat: player number must be an integer in 1..255 (got <n>)' and 'lh.seat: player <n> is taken'. [src/core/controllers.js:92-93] <!-- C-231 -->
- `controllers.renumber` throws for a `to` number that is not an integer in 1..255. The messages start with 'controllers.renumber: '.
- `controllers.renumber` also throws for a `from` number that no controller has and for a `to` number that another controller has. [src/core/controllers.js:65-68; test/controllers.test.mjs:232] <!-- C-233 -->
- `zeroOf` throws 'players: not an F field (<type>)' for a value that is not an F field. [src/core/players.js:29] <!-- C-245 -->
- `roster.add` throws 'players: number must be an integer in 1..255 (got <n>)'. It throws 'players: player <n> is already in the roster' for a repeated number. [src/core/players.js:49-50] <!-- C-248 -->
- `roster.renumber` throws 'players: player <to> is already in the roster' when the `to` number exists. [src/core/players.js:79] <!-- C-254 -->

### Tape replay
- `checkTape` throws 'replay: unknown tape version' when `tape.v` is not 1. [src/core/tape.js:7] <!-- C-321 -->
- `checkTape` throws "replay: tape is for '<tape.game>'" when `tape.game` differs from `game.id`. [src/core/tape.js:8] <!-- C-321 -->
- `checkTape` throws 'replay: tape hz differs (tape <hz>, game <hz>)' when `tape.hz` differs from `game.sim.hz`. [src/core/tape.js:9] <!-- C-321 -->
- `replayTape` throws "replay: unknown op '<op>'" for an unknown op name. [src/core/tape.js:32] <!-- C-330 -->
- `replayTape` throws 'replay: this engine has no ui.<press|release>' when `e.ui` lacks that function. [src/core/tape.js:24] <!-- C-330 -->
- `replayTape` throws 'replay: seat <s> has input but no controller at step <k>' for a seat with recorded input, no controller and no earlier controller. [src/core/tape.js:47-51] <!-- C-331 -->
- `replayTape` throws 'replay: checksum differs at step <n> (tape <want>, replay <got>)' at the first step whose checksum differs. [src/core/tape.js:56] <!-- C-332 -->

### Navigation and policies
- `pickNeighbour` throws "nav: unknown direction '<dir>'" for a direction not in `NAV_DIRS`. [src/core/navScore.js:22; test/navScore.test.mjs:105] <!-- C-281 -->
- `policy.every` throws 'policy.every: n must be a positive integer' and 'policy.every: key must be a function'. [src/core/policy.js:14; src/core/policy.js:16] <!-- C-300 -->
- `policy.every` throws 'policy.every: phase must be an integer in [0, <n>)'. [src/core/policy.js:15] <!-- C-300 -->

## Dependencies
- **Internal:** the core imports `F` and `kind` from `src/defs/fields.js` (see [defs-and-kits.md](defs-and-kits.md)). The core also imports the wire codec from `src/sim/schema.js`, `createRegistry` from `src/sim/replica.js`, `installWorld` and `checkPhysics` from `src/sim/world/install.js`, and `installNet` from `src/sim/net/install.js`. [src/core/engine.js:12-18; src/core/players.js:7] <!-- C-311 -->
- **Used by:** the view modules `src/view/boot.js` and `src/view/hook.js` import `checkTape`, `tapeStart`, `replayTape` and `checksum`. [src/view/boot.js:7-8; src/view/hook.js:3] <!-- C-333 -->
- **Internal:** `installWorld` calls `checkRapier` for `game.physics.rapier`. An absent value passes. [src/sim/world/install.js:18; src/sim/physics/rapier.js:37-41] <!-- C-313 -->
- **External:** none in `src/core`. The module list in the source imports no package.

<!-- related-specs -->
Related specs:

- Imports: [Definitions and kits](defs-and-kits.md)
- Imports: [Simulation world and physics](sim-world-physics.md)
- Imports: [Networking and replication](net-replication.md)
- Imported by: [Definitions and kits](defs-and-kits.md)
- Imported by: [Simulation world and physics](sim-world-physics.md)
- Imported by: [Networking and replication](net-replication.md)
- Imported by: [View boot, input and seats](view-input.md)
- Imported by: [Test helpers](testing.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Operations
- A controller prints as 'Controller#<id> seat <seat> player <player> pawn <Entity#id or none>'. The engine prints as 'Engine <game id> step <n>'. [src/core/controllers.js:49; src/core/engine.js:538] <!-- C-238 -->
- The engine hides `game` and `world` from enumeration, and entities and Worlds hide their Rapier handles. A failing assert on them prints a short message. [src/core/engine.js:537-538; test/inspect.test.mjs:39-56] <!-- C-310 -->
- A test holds engine code under 1 KB of allocation per step for a step of 30 falling and settling crates. [test/alloc-rate.test.mjs:21] <!-- C-309 -->

## Open questions and discrepancies
- Open question: why does `defineGame` check `sim.hz` and `sim.maxCatchUp` but not `sim.maxFrame`? No source states the reason.
- Open question: why does an engine without `physics.rapier` still make a World with bodiless entities? No comment states the reason.

## Evidence index
- `src/core/engine.js`: `defineGame`, `createEngine`, scenes, transitions, commands, loads and recording.
- `src/core/actions.js`: actions and layered input.
- `src/core/controllers.js`: controllers, possession and seats.
- `src/core/players.js`: roster, player and game state kinds.
- `src/core/events.js`, `src/core/loop.js`, `src/core/schedule.js`: events, fixed-step loop and stage schedule.
- `src/core/ui.js`, `src/core/nav.js`, `src/core/navScore.js`: UI registry, menu options and neighbour scoring.
- `src/core/rng.js`, `src/core/math.js`, `src/core/flags.js`, `src/core/policy.js`, `src/version.js`: helpers and the engine version.
- `src/core/checksum.js`, `src/core/tape.js`: canonical JSON, checksums and tape replay.
