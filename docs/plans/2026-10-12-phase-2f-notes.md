# Phase 2f (network commands, Tractor Pickup sim): outcome, rulings and carry-overs

**Status:** done.
- **Engine:** 0.7.0 on branch `phase-2f`.
- **Tractor Pickup:** sim half on four43 `feat/lion-hawk`, `6a39bd7..` (T1–T8 plus fix rounds). `main.js` still runs the old path in production; 2g switches the view over.
- Not merged, pushed (four43) or deployed.

## What landed
- **Engine 0.7.0:**
  - ctx passed to UI callbacks and game-wide handlers (#69);
  - command data always copied and JSON-checked (#72, a behaviour change);
  - `h.debug`, events flushed on read (with a re-entrancy guard from the final review), exact goldens, `assertFinite` over Map/Set/cycles;
  - `engine.time.wall` (exact on virtual steps, re-anchored on real stamps) and `engine.onStep`;
  - in `lion-hawk/sim`: the replication codec, interp, forecast and limits, moved from Tractor;
  - command schemas, json/binary wire codecs, reserved `from`/`at`/`reliable` keys, and the `engine.net` outbox;
  - `lion-hawk/net`: hub, lag, room link, and the port that turns messages into commands;
  - `mp()`;
  - paired axes and one device `map` option shape;
  - `ui.hold({ wall })`, `bindPointer({ uncapped })`, `bindGesture`;
  - Playwright off-screen points and `initScript` on the context.
- **Tractor Pickup:**
  - a purity test, with syncs that take an injected clock;
  - net modules re-export the engine's, and protocol checks are schema tables (about 150 probe inputs, zero accept/refuse differences);
  - `game.sim.js` with farm and sandbox scenes and the world-frame pilot (`update` bit-identical over 500k cases);
  - the trip flow, show ack (`gen`-checked), card, start screen, menus, bedtime on a clock command, and wall-time holds;
  - new farms through `ctx.load({ frames: 1 })`;
  - host and guest syncs fed by engine commands through a port;
  - plain-JSON tapes that replay alone.
- **Parity:**
  - The farm scene reproduces `drive-seed14` and `pickup-seed14` bit for bit, and equals a direct `createGame` run at 17 digits.
  - Mp sweep on `TP_MP=engine`: 98/99. The one failure is the frozen-frame rate test, a by-design exception (#75).
  - Interop test: old and new devices agree at NET_VERSION 3 in both directions. A drop probe proves each direction can fail.
- **Measured:**
  - `createGame` for seed 14: 78 ms median.
  - Tractor bundle: +2.5 KB after T8.
  - Tests: engine 363+, Tractor 754.

## Rulings (each with its cost if wrong)
1. **Virtual wall formula.** The virtual wall is `wallBase + (step − wallBaseStep) · 1000/hz`, re-anchored on real stamps. Cost: none seen.
2. **Field notes are the controller's.** Implementers never edit `docs/field-notes.md`. Cost: none.
3. **No real `build.py`.** Builds are verified by bundling into the scratchpad. Cost: `site/exp` holds the old Tractor build until the user runs `build.py`.
4. **Keyboard sign.** W+D at camera yaw 0 gives world −x. The brief's prose was wrong, and Tractor's camera-right is −x. Cost: none (traced in Tractor's pilot).
5. **Two `mp.repair` tests step twice.** They now call `w.step(2)` (#80, parity row 23). They had pinned a latency the plan deliberately changed. Cost: a one-step regression could hide in those two tests only.
6. **Rate drops in `mp.relay`.** Drops fell from 1178 to 1137. Ruled harmless: only the window phase shifted, and the per-window limits are unchanged.
7. **Browser-recorded tapes stay out of scope ([T-9], #98).** Only headless and `mp()` tapes replay exactly. Cost: none now; it matters when browser recording lands.
8. **`ctx.load` with no main scene: won't-fix.** Spec I-7 already says ctx is undefined, and Tractor guards for it.
9. **The JSON wire stays at NET_VERSION 3.** The binary codec is built but not adopted (#91).

## Playtest list (Tractor Pickup, once 2g lands)
- **Driving:**
  - the paired merge picks the longest vector; Tractor used to let keys override the stick (#82);
  - `goBack` is ORed across devices, so S on the keys with the stick forward reverses the stick's way.
- **Bedtime:** the wake hold (5 s), skip (1 s) and parent (2 s) holds now count wall time.
- **Multiplayer:**
  - a guest's new farm arrives one step later (#80);
  - messages are handled at the next step (#75).
- **Sounds:** `whee`, `cheer` and `squelch` are now sim events.

## Carry-overs into 2g (plan deltas from the final review)
- **G1 devices:**
  - `bindGamepad(e, bindings, { map })` with `deadZone: 0` and `radial: 0.15`; the stick's `deadZone: 0.1` is already radial;
  - use `PILOT.revCone` for `goBack`.
- **G1 others3d:** draw at `time.wall + alpha · 1000/hz` (or the rAF time), not at the last step's stamp.
- **G2 slot bar:** rebuild from state on enter, on build, and on a scene-id change. This is required: presets emit no `land` events.
- **G3 `show.done`:**
  - must always carry `gen` (an ack without it skips the check);
  - `stickers.clear` should also close the parent half.
- **G5 net:**
  - bind the port only after the room is joined and the farm exists;
  - the panel's sync getter must tolerate `null` for a frame;
  - `stopHosting()` must not leave before the outbox step;
  - call `port.close()` after that step or on `closed`;
  - the G5 test needs different args for the guest.
- **Until G7:** mirror any old-path change in `main.js` (cues, reward, bedtime, `stepSounds`, build) into `game/flow.js` and `game/farm.js`.
- **Global constraint:** no assertions on browser-recorded tapes (#92, #98).
- **`newFarm`:**
  - guard the retry-double-fail case (`s.game` null);
  - `nextFarm` is cleared only by the farm's `then`.
- **Still open:** #67 (audio unlock), #89 (handshake vendoring), #93 (late-peer wall ulp), #95 (`engine.overlay` once), #96 (diffs during a guest build).
