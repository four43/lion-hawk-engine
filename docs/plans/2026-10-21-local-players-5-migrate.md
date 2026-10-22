# Local players 5: migrate Tractor, Rally and Pig Pens; release 0.13.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All three games run on the local-players engine. Tractor uses the engine join. Its player state is `lh.player` fields, its farm is game state, its paint is a guest→host message that the host writes into player fields, and its train is seat 0's pawn. Rally's rumble reads the seat's pads and uses the engine's stop. Rally's and Pig Pens' devices become mapping contexts. Each game has [T-25] state-home tests. The engine folds in the parked review minors and ships as 0.13.0. All three games pin `#v0.13.0`, are re-baked and built, and are deployed. Every outward step (tag, push, deploy) stops and asks the user first.

**Architecture:** Engine changes are small: `keyWords` hardening, two `controllers.js` minors, spec notes, the version and the CHANGELOG. Until the tag exists, the games run against a copy of the committed engine. That copy is unpacked into the game worktree's `games/node_modules/lion-hawk` with `git archive` (Task 3). All game work from Task 3 on happens in the worktree `/home/smiller/projects/four43/four43-local-players` (branch `feat/local-players`), never in the user's checkout. Game work, in this order:
- Rally: `rumbleOut.js` sends to `lp.pads` and calls `view.haptics.stop(reason)`. Devices become a `drive` context. Lap times and phase get state homes.
- Pig Pens: a `farm` context, plus state homes.
- Tractor, in three tasks: possession; the engine join with player and game state; `claimPeerKey` with the [T-25] tests.
- Release: engine 0.13.0, then re-pin, re-bake, build, and deploy by pushing `feat/local-players` to `gh-pages` (ASK USER).

**Tech Stack:** plain ES modules, `node:test`, `playwright-core` (already used by every game's browser suite), npm 12 workspaces. No new dependencies.

**Spec:** `docs/plans/2026-10-21-local-players-spec.md` §9 row 5 and §2.2 (state homes, with worked examples per game); `docs/spec.md` [T-25], [C-5]–[C-14] (plan 4's final `view.haptics` surface), [N-18]–[N-25]. Inputs: the "Final" sections of `.superpowers/sdd/2026-10-21-local-players-{1,2,3}-*/progress.md` (parked minors, plan 3's I2 ruling: seed in gameState, paint as a guest→host command, `numbersOf(peer)`, `join` set explicitly, `await claimPeerKey()`); user memory `tractor-*.md` (playtest decisions, below).

**Depends on:** plan 4 complete and committed on `local-players`. That includes its final-review surface: `view.haptics = { stop(reason), get stopping, get paused }`, which is `null` with `defineView({ haptics: { autoStop: false } })`. `stop(reason)` takes `'menu' | 'finish' | 'exit'` and runs the engine's 20-round zero+reset stop. `paused` is true while a pausing overlay is open, and a game must not send rumble then. Plan 4 also adds `seats.forEachUnpaired(fn)`, and `game.pad` throws on a first argument that is neither a number nor an object (that includes a bare `game.pad()`; Task 2 restores it as "unplug pad 0", S2). Task 2 Step 1 checks that the engine tree is clean.

**Status (2026-10-21, controller):**
- Task 1 is **done**: commit `857740e` on `gh-pages` in `/home/smiller/projects/four43/four43`, exactly the 15 R7 files, local only; the user's WIP is untouched.
- The game worktree exists: `/home/smiller/projects/four43/four43-local-players`, branch `feat/local-players`, created from `857740e`. Its `games/` deps were installed with `npm ci --prefer-offline --allow-git=all`. npm's `allowScripts` blocked esbuild's postinstall, so Task 3 Step 1 checks that esbuild still runs before the first build.
- The pre-flight scan's rulings (ledger `.superpowers/sdd/2026-10-21-local-players-5-migrate/progress.md`) are carried into the tasks below; see "Rulings carried" at the end.
- This revision is uncommitted in the engine repo. Commit it on its own before Task 2: Task 2 Step 1 and Task 3 Step 1 need a clean engine tree.

## Decisions (plan-writer rulings)

| Question | Ruling | Why |
|---|---|---|
| Local engine before the tag | `git archive local-players` unpacked into `games/node_modules/lion-hawk` (Task 3); reversed by `rm -rf games/node_modules/lion-hawk && npm install --allow-git=all` | A real copy loads `three` and Rapier once, from `games/node_modules`, exactly as the tag install will. A `file:` dependency or `npm link` would be a symlink, and engine files would then resolve the engine repo's own dev copies. The copy touches no tracked file. |
| What the train replicates now that it is a pawn | `TRAIN.fields.input` becomes `F.actions(ACTIONS)` (the world-frame stick `goX, goZ, goBack, horn`). Every peer turns a remote train's stick into throttle and steer with the same stateless pilot. The test-only `raw` seam writes the exact inverse stick (`stickOf`) onto the pawn | [I-4]'s copy fills only keys the pawn's `e.input` shares with the controller snapshot, and `DRIVE` (`thr, steer, turn`) shares none. Keeping `DRIVE` would keep the hand copy (`src/sim/game.js:88`). `stickOf` is exact for every `|steer| ≤ 1` with `thr ≠ 0`, so raw-driven multi-peer tests keep their meaning. |
| Tractor's silence watchdog | A game player field `quiet` (M-39's "no frames for 3 s"). Guests read `away || quiet` | `away` is an engine field (`PLAYER_RESERVED`) set only by `peerAway`/`peerBack`. |
| Telling the host's farm from a zero record | The host numbers farms from 1 (`gameState.farm` 0 is "no farm"). A guest uses `engine.gameState` only after a frame from its host carried an `lh.game` group | A solo page's zeros, or an earlier room's values, must never build a farm (Review Focus 2). |
| A new player's paint before its first paint message | The engine's zero (`coat`/`trim` `'red'`) for one round trip. The guest sends its paint as soon as it is welcomed | It costs no extra host logic. The old hello also took one round trip. |
| Tractor session's bind-less path | Removed: `createSession` requires `bind`. `session.test.mjs` gets a stub `bind` | The syncs now need `engine` (roster, game state, `numbersOf`). The game and the harness have used `bind` since 2g. |
| Rally rumble stops | `rumbleOut` keeps the mixer output, `send` and the ABS gap logic. Menu, finish and stage-exit stops are `view.haptics.stop('menu' / 'finish' / 'exit')`, once per transition. Sending is gated on `!view.haptics.paused`. The hide, `pagehide` and `beforeunload` handlers and the first-seen-pad reset are dropped, because the engine does them. `autoStop` keeps its default. A quarter second of quiet while driving stays Rally's own single zero effect plus reset | This is the coordinator's direction (plan 4 final review). The long gap is part of the send logic and is not a menu, finish or exit. |
| Rally and Pig Pens seats | `view.seats({ max: 1, join: () => 0, contexts: [name] })` | Both games have one player. Every pad joins seat 0, so "any pad drives" (#30) holds. |
| [T-25] for games with no net part | Rally and Pig Pens test the offline state homes: player 1's record outlives the pawn changing, and game state follows the sim. Rejoin and late joiner apply to Tractor only (spec ruling, Task 11) | `mp()` needs `defineGame({ net })`. |
| Rally state homes | Written through: `stage.js` writes `engine.players[0]` and `engine.gameState.phase` where it changes them, and `s.phase` stays the HUD's working copy | Single player. Moving every `s.phase` read would touch about 30 lines for no behaviour change. |
| Pig Pens state homes (spec example says "score and pens") | Player 1's `eggs` (the basket). Game state: `night` and `pens` (pig head count per region, 8) | Pig Pens has no score. The basket is what this person gathered, and the pens are shared farm facts. |
| Tractor devices | Unchanged (out of scope) | Scope names contexts for Rally and Pig Pens only. |
| Versions | Engine 0.13.0; Tractor 1.11.0 (NET_VERSION 5); Rally 0.6.0; Pig Pens 2.3.0 | Minor bumps: new behaviour, no save-format change. |
| Where the game work happens (ledger ruling, B2) | The worktree `/home/smiller/projects/four43/four43-local-players` on `feat/local-players` (from `857740e`). Every game-side path, command and commit from Task 3 on uses it | It keeps the user's WIP checkout and branch untouched, as the earlier `feat/lion-hawk` work did. The cost is one extra `npm ci` (done). |
| Deploy (B3) | In the worktree: rebase `feat/local-players` onto `origin/gh-pages` (clean tree, no stash), **ASK USER**, then `git push origin feat/local-players:gh-pages`. A second **ASK USER** comes before fast-forwarding the user's own `gh-pages` checkout | Memory: deploy = push branch:gh-pages. A push from the user's checkout would ship only R7, and `--autostash` would stash their WIP. |
| The `?rumble` lab (B1) | `rumbleLab.js` passes `pads: () => [...getPads()].filter(Boolean)`; `rumbleOut` keeps `kill()` (one zero effect + reset on each pad, no engine stop) for the lab's `pagehide` | The lab runs no engine, so nothing else stops its pads. It is the user's tuning tool. |
| `game.pad()` with no argument (S2) | Unplugs pad 0 again; `pad('1')`, `pad(true)`, `pad(NaN)` and `pad(undefined, state)` still throw | The plan 4 residual the ledger carries into Task 2. |

## Global Constraints

- **Repos.**
  - Engine: `/home/smiller/projects/four43/lion-hawk-engine`, branch `local-players`. It stays on `local-players` throughout (Task 11 moves `main` without a checkout).
  - Games: the worktree **ROOT = `/home/smiller/projects/four43/four43-local-players`**, branch `feat/local-players`, workspace `ROOT/games/` (`pig-pens`, `tractor-pickup`, `rally`). Every game-side path, command and commit from Task 3 on uses ROOT. Commands below spell ROOT out in full, because an agent's shell cwd resets between calls.
  - The user's checkout `/home/smiller/projects/four43/four43` (branch `gh-pages`) is touched only by Task 1 (done) and by Task 12 Step 8's fast-forward (its own ASK USER). Never stash, rebase, reset or check out anything in it.
- **The user's checkout has unrelated uncommitted work.** It is in `site/` (outside `site/exp/`), `content/`, `.playwright-mcp/` directories, `games/rally/docs/reference/`, `games/rally/rally-sim-src.zip` and `games/tractor-pickup/audio/voice/sound-effects.mp3`. The worktree has none of it. Rules, in both trees:
  - never `git add -A`, `git add .`, `git commit -a`, `git stash`, `git pull --autostash`, `git checkout -- <path>` or `git restore` on paths this plan does not own;
  - every git command names its repo with `git -C <repo>` (ROOT, or the engine path);
  - every `git add` names explicit paths;
  - before every commit, run `git diff --cached --name-only` and check that it prints exactly the commit step's list.
- **Stop points.** Every step marked **ASK USER** stops and asks the user, then runs only after a yes. They are: the Rally R7 commit (Task 1, done); the engine merge and tag (Task 11); every push (Tasks 11 and 12); the fast-forward of the user's own `gh-pages` checkout (Task 12).
- **Tests run under the memory cap** (user rule, memory `test-memory-cap.md`; values as `games/test/gate.test.mjs` pins them). Each node gets a heap limit well below the cap, so a runaway test dies inside node and the kernel never OOM-kills the scope (that pops a KDE low-memory notice):
  - unit files: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 <files>`;
  - engine net files (`test/net*.test.mjs`, `test/mp*.test.mjs`): the same with `--test-concurrency=1`;
  - browser suites: one file at a time, never two at once, `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test <one file>`. A browser script that is not a `node --test` file (Rally's `test/mobile.mjs`) runs the same way without `--test`;
  - a game's whole `npm test` (its own script, read from its `package.json`): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 env NODE_OPTIONS=--max-old-space-size=512 npm test`, from the game directory under `ROOT/games/`;
  - the workspace's own tests (`ROOT/games/test/`): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/`, from `ROOT/games`. Run them only in Task 12: `test/workspace.test.mjs` checks the installed engine version against each pin, so it is red against Task 3's archive copy.
  - bakes and builds (Task 12): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 env NODE_OPTIONS=--max-old-space-size=2048 npx lion-hawk <bake|build> …`, one at a time, from the game directory.
  - Never run a test, bake or build uncapped.
- **Game test scripts** (from each `package.json`):
  - Tractor: `npm test` = `node --test --test-concurrency=4 test/`; browser: `test/e2e.browser.mjs`, `test/net.peers.browser.mjs`.
  - Rally: `npm test` = `test/*.test.mjs` plus the `gen-*`, `physics`, `snow`, `markers`, `verge`, `track`, `wild` and `game` scripts; browser: `test/e2e.browser.mjs`, `test/render.browser.mjs`, `test/built.browser.mjs`, `test/offline.browser.mjs`.
  - Pig Pens: `npm test` = `test/*.test.mjs`; browser: `test/e2e.browser.mjs`.
- **Known pre-existing failure:** Tractor's iPad show-tap e2e test (memory `lion-hawk-engine.md`). If it fails, report it and do not fix it here.
- **User playtest decisions to keep** (memory `tractor-*.md`):
  - co-op, not a competition; players are numbered coloured tractors with no names (so no `name` field);
  - the host validates all guest data (the paint stays schema-checked against `PAINT_NAMES`);
  - each joiner adds `PER_PLAYER` animals (M-62), and a leaver's train poofs and its animals go (M-39);
  - one barn show at a time, first come (M-70..M-73);
  - the point-to-go stick reverses when pushed down (the pilot is unchanged, and `goBack` is replicated);
  - the low camera and `?tune` stay; at most 4 players; the host is usually the iPad.
- **Sim purity:** the engine (`src/core`, `src/sim`) and each game's sim half stay free of DOM and `navigator`. `claimPeerKey` is called only from Tractor's `src/main.js`.
- **Commits:** conventional messages, with **no `Co-Authored-By` trailer** (user rule).

## Review Focus

- **The train's replicated input is empty.** [I-4] copies only keys the pawn's `e.input` shares with the snapshot. Two things leave other peers' replicas standing still, driven only by nudges: a train kind that keeps the `DRIVE` shape, or a `localTrain` that keeps an `{ thr, steer, turn }` object. Pinned in Task 8 by `the train is seat 0's pawn: its replicated input is the controller's world-frame stick, and the host's replica drives from it` and `the raw seam puts the matching stick on the train`.
- **A guest builds a farm that is not the host's.** Before the host's `lh.game` arrives, `engine.gameState` holds zeros, or an earlier room's values. The guest must not build or number itself from them. Pinned in Task 9 by `a guest builds nothing until a frame from its host carries lh.game`.
- **Player state lost on a respawn or a rejoin.** A new farm makes new trains, and a reload makes a new transport id. The paint, the number and the `join` count must come back, and the row must be rebuilt as M-39/M-10 say. Pinned in Task 10 by `T-25: player state survives a respawn …` and `T-25: player state survives a rejoin …`.
- **Rumble outlives a menu, or a stop cuts a pulse.** Rally hands its stops to `view.haptics.stop` and gates on `paused`. A stop per frame would restart the engine's 20 rounds forever. A missing stop leaves the pad running in menus. Sending while paused fights the engine's stop. Pinned in Task 4 by `rumbleOut: one engine stop per transition, exit always; nothing is sent while a pausing overlay is open` and the e2e `rumble reaches seat 0's pads while driving; a pause stops them`.
- **Devices bound twice, or not at all, after the context move.** A boot device left beside the context gives a second keyboard module with its own ramps. A context that never binds leaves the keys dead. A default `join` puts a second pad on seat 1. Pinned by:
  - Rally (Task 5): the unit test `device setup is the drive context …` and the e2e `the drive context: W drives, and two pads are one player`;
  - Pig Pens (Task 7): the unit test `device setup is the farm context …` and the existing e2e tests `… holding the tractor drives, W moves it …` and `… drive with the thumb pad …`.
- **The `?rumble` lab goes silent or throws.** The lab is a second `rumbleOut` caller with no engine, so no seat and no `view.haptics`. If it still passes `getGamepads`, it sends nothing. If `kill()` is gone, its `pagehide` throws and leaves the pad running. Pinned in Task 4 by the `kill()` assertion in `rumbleOut: one engine stop per transition …` (one zero effect plus reset, no engine stop) and by the lab passing `pads` (Step 4).
- **The pause e2e passes or fails by timing.** With render `'auto'`, frames between reading the call count and pressing Escape still rumble. Task 4's e2e takes its count only after the pause shows and a few frames pass, and checks the reset from the Escape onward.
- **A new farm while the host is away.** The farm now rides `lh.game` in frames only. While the server says the host is away (frames still flow), a new farm must build and stay paused. While the host's frames are all lost, no farm may build from JSON. Pinned in Task 9 by `a new farm while the host is away keeps boops paused; with no host frames there is no new farm (M-19, M-40)`.
- **The user's checkout changes under them.** Game work, builds and deploy happen in ROOT. Only Task 12 Step 8's fast-forward (ASK USER) touches the user's checkout, and git refuses it rather than overwrite a modified file. Checked in Task 12 Step 8 by `git status --short` before and after.

---

## File map

**Engine (`lion-hawk-engine`)**

| File | Change |
|---|---|
| `src/net/key.js` | `keyWords` error names the input's type, never its value. |
| `src/core/controllers.js` | `of` is a closure (seat() no longer uses `this`); `renumber` checks 1..255. |
| `src/version.js`, `package.json` | 0.13.0. |
| `CHANGELOG.md` | 0.13.0 entry. |
| `testing/playwright.js` | `game.pad()` / `pad(undefined)` unplug pad 0 again (S2). |
| `docs/spec.md` | [N-18], [C-9] and [T-24] notes; [T-25] built with the offline ruling; amendment line. |
| `test/net-key.test.mjs`, `test/controllers.test.mjs`, `test/playwright.test.mjs` | One assertion changed, one test each added. |

All game paths below are under the worktree ROOT `/home/smiller/projects/four43/four43-local-players`.

**Rally (`games/rally`)**

| File | Change |
|---|---|
| (Task 1, done: `857740e`) the 15 R7 files | Committed as they were, in the user's checkout. |
| `src/rumbleOut.js` | Seat pads, `view.haptics.stop`, `paused` gate; own repeated stop and first-sight reset gone; `kill()` kept as one zero + reset (for the lab). |
| `src/rumbleLab.js` | Passes `pads` (every connected pad) instead of `getGamepads`; its `pagehide` still calls `kill()` (B1). |
| `src/game.view.js` | Passes `seat0.pads` and `view.haptics`; hide/pagehide/beforeunload kill gone; `__rallyView.seats`. |
| `src/devices.js` | `driveContext(doc)`, `useSeats(view, doc)`; `devices(doc)` keeps the glyphs only. |
| `src/main.js` | `useSeats(view, document)` after boot. |
| `src/game.sim.js` | `PLAYER_STATE`, `GAME_STATE` in `rallySpec`. |
| `src/game/stage.js` | Writes `gameState.phase`, `players[0].lastLap/bestLap/finish`. |
| `test/rumble.test.mjs`, `test/devices.test.mjs`, `test/e2e.browser.mjs` | Updated / new tests. |
| `test/state-homes.test.mjs` | **new.** [T-25]. |
| `docs/spec/rally-spec.md` | Round 8 section; version in Task 12. |
| `package.json` | 0.6.0, pin `#v0.13.0` (Task 12). |

**Pig Pens (`games/pig-pens`)**

| File | Change |
|---|---|
| `src/devices.js` | `farmContext(doc)`, `useSeats(view, doc)`; `devices(doc)` keeps the pointer tools only. |
| `src/main.js` | `useSeats(view, document)` after boot. |
| `src/game.sim.js` | `player: { eggs }`, `gameState: { night, pens }`. |
| `src/game/farm.js` | `farm.events` writes them each step. |
| `test/devices.test.mjs`, `test/state-homes.test.mjs` | **new.** |
| `package.json` | 2.3.0, pin (Task 12). |

**Tractor (`games/tractor-pickup`)**

| File | Change |
|---|---|
| `src/sim/pilot.js` | `stickOf(yaw, thr, steer, out)`. |
| `src/sim/actions.js` | `DRIVE` removed. |
| `src/sim/game.js` | The hand copy (line 88) removed. |
| `src/sim/trains.js` | Remote trains run the pilot on their replicated stick. |
| `src/game/farm.js` | `build` possesses the tractor; the raw seam writes `stickOf`. |
| `src/net/kinds.js` | `TRAIN` input `F.actions(ACTIONS)`; `PLAYER` kind removed (Task 9). |
| `src/net/protocol.js` | NET_VERSION 5; `hello`/`welcome` removed; `PLAYER_FIELDS`, `GAME_FIELDS`. |
| `src/net/entities.js` | `localTrain` gives the stick-shaped input; `mirrorHost(world, game)` without a roster. |
| `src/net/host.js`, `src/net/guest.js` | On the engine roster, game state and `numbersOf` (full files in Task 9). |
| `src/net/players.js` | `SEND` removed. |
| `src/net/session.js` | `bind` required. |
| `src/net/bind.js`, `src/main.js` | `key` from `claimPeerKey()`. |
| `src/game/net.js` | `join` (`'manual'` in Task 8, `'engine'` in Task 9), `maxPlayers`, `maxSeats`; registry from the engine's kinds; `engine` to the syncs. |
| `src/game.sim.js` | `player: PLAYER_FIELDS, gameState: GAME_FIELDS`. |
| `test/possess.test.mjs`, `test/join.test.mjs`, `test/state-homes.test.mjs` | **new.** |
| `test/pilot.test.mjs`, `test/golden.test.mjs`, `test/mp.harness.mjs`, `test/mp.engine.harness.mjs`, `test/net.kinds.test.mjs`, `test/protocol.test.mjs`, `test/mp.repair.test.mjs`, `test/mp.engine.test.mjs`, `test/session.test.mjs`, `test/bind.test.mjs` | Updated (exact edits in their tasks). In Task 9 `mp.harness.mjs` also builds `quiet()`'s registry from the engine's kinds (N5). |
| `test/mp.test.mjs` | Task 9: 'a new farm while the host is silent …' becomes host-away by the server signal, plus a no-frames check (B4). |
| `docs/tractor-pickup-spec.md` | M-19, M-22, M-24, M-27 rows; new M-80; version lines (Task 12). |
| `package.json` | 1.11.0, pin (Task 12). |

**Root (ROOT):** `games/package-lock.json` (Task 12), `site/exp/{tractor-pickup,rally,piggie-game}/` (Task 12). The deploy pushes `feat/local-players` to `origin/gh-pages` (Task 12).

---

### Task 1: Commit Rally's R7 rumble work as it stands (ASK USER) — DONE

> **Done (2026-10-21, controller, user-approved):** commit `857740e` on `gh-pages` in `/home/smiller/projects/four43/four43`, holding exactly the 15 files below; local only, not pushed. Its message as committed: `feat(rally): R7 rumble — mixer, patterns, ?rumble lab, brake-limit warning, ABS lock-up pulses, suspension impacts and jump landings`. The user's WIP is untouched. Steps 1–4 below are kept as history; do not run them again. Step 5 (the worktree) is done too.

**Files (exactly these 15, all under `games/rally/`):**
- Modified:
  - `docs/spec/rally-spec.md`
  - `index.template.html`
  - `src/game.view.js`
  - `src/game/overlays.js`
  - `src/game/settings.js`
  - `src/main.js`
  - `src/snow.js`
  - `src/surface.js`
  - `src/vehicle.js`
- New:
  - `src/rumble.js`
  - `src/rumbleOut.js`
  - `src/rumbleLab.js`
  - `src/defs/rumble.js`
  - `test/rumble.test.mjs`
  - `test/jolt.test.mjs`
- Not included (left untracked on purpose): `docs/reference/`, `rally-sim-src.zip`, `.playwright-mcp/`.

**Interfaces:** none (the user's work, unchanged; the engine is still the installed 0.12.0).

- [x] **Step 1: Check the tree matches this list**

Run: `cd /home/smiller/projects/four43/four43 && git diff --cached --name-only && git status --short games/rally`
Expected: the first command prints nothing. The second prints ` M` for the 9 modified files, and `??` for the 6 new files plus `games/rally/docs/reference/` and `games/rally/rally-sim-src.zip`. If anything else under `games/rally` shows, stop and ask the user.

- [x] **Step 2: Run Rally's unit suite on the R7 tree**

Run: `cd /home/smiller/projects/four43/four43/games/rally && systemd-run --user --scope -q -p MemoryMax=2G env NODE_OPTIONS=--max-old-space-size=1536 npm test`
Expected: PASS. If it fails, report the failure to the user with the ASK in Step 3. Do not fix the user's work unasked.

- [x] **Step 3: ASK USER** — "Commit Rally's R7 rumble work now, as its own commit, with exactly these 15 files: (list above)? `docs/reference/` and `rally-sim-src.zip` stay untracked." Wait for a yes.

- [x] **Step 4: Commit** (done as `857740e`, with the message quoted above)

```bash
cd /home/smiller/projects/four43/four43
git add games/rally/docs/spec/rally-spec.md games/rally/index.template.html games/rally/src/game.view.js games/rally/src/game/overlays.js \
  games/rally/src/game/settings.js games/rally/src/main.js games/rally/src/snow.js games/rally/src/surface.js games/rally/src/vehicle.js \
  games/rally/src/rumble.js games/rally/src/rumbleOut.js games/rally/src/rumbleLab.js games/rally/src/defs/rumble.js \
  games/rally/test/rumble.test.mjs games/rally/test/jolt.test.mjs
git diff --cached --name-only   # exactly the 15 paths
git commit -m "feat(rally): controller rumble - surface, slides, wheelspin, lock-up and impacts; ?rumble lab and Rumble setting (R7)"
```

- [x] **Step 5: Make the game worktree** (B2; done by the controller)

```bash
git -C /home/smiller/projects/four43/four43 worktree add /home/smiller/projects/four43/four43-local-players -b feat/local-players gh-pages
cd /home/smiller/projects/four43/four43-local-players/games && npm ci --prefer-offline --allow-git=all   # the lock is unchanged: lion-hawk v0.12.0
git -C /home/smiller/projects/four43/four43-local-players status --short   # must print nothing
```
Result: the worktree is on `feat/local-players` at `857740e`; `npm ci` succeeded, but npm's `allowScripts` blocked esbuild's postinstall (Task 3 Step 1 checks that esbuild still runs). From here on, ROOT is this worktree.

---

### Task 2: Engine follow-ups: keyWords hardening, the parked plan 1 minors, bare `game.pad()`

**Files:**
- Modify: `src/net/key.js`, `src/core/controllers.js`, `testing/playwright.js`, `docs/spec.md`
- Test: `test/net-key.test.mjs`, `test/controllers.test.mjs`, `test/playwright.test.mjs`

**Interfaces:**
- Produces:
  - `keyWords(x)` throws `net: peer key must be a UUID (got <typeof x>)`;
  - `controllers.seat` and `controllers.of` work when destructured;
  - `controllers.renumber(from, to)` throws `controllers.renumber: player number must be an integer in 1..255 (got <to>)`;
  - `game.pad()` and `game.pad(undefined)` unplug pad 0 (as `game.pad(null)` does), as in 0.12 (S2). `game.pad('1')`, `pad(true)`, `pad(NaN)` and `pad(undefined, state)` still throw `playwright: pad index must be an integer in 0..15`.
- Not folded (parked as "none" by plan 1's final review): plan 1's history doc still names the `createControllers` export.

- [ ] **Step 1: Check plan 4 is done**

Run: `cd /home/smiller/projects/four43/lion-hawk-engine && git status --short && git log --oneline -1 && grep -n "haptics" src/view/boot.js | head -3`
Expected: an empty status, plan 4's last commit or this plan's own docs commit at HEAD, and boot wiring `view.haptics`. If the status is not empty, stop. This revised plan file is itself tracked: the controller commits it (`docs/plans/2026-10-21-local-players-5-migrate.md` alone) before Task 2, or this check and Task 3's clean-tree check stop.

- [ ] **Step 2: Write the failing tests**

In `test/net-key.test.mjs`, replace the line:

```js
  assert.throws(() => keyWords('nope'), /net: peer key must be a UUID \(got nope\)/);
```

with:

```js
  assert.throws(() => keyWords('nope'), /net: peer key must be a UUID \(got string\)/);
  assert.throws(() => keyWords(42), /\(got number\)/); assert.throws(() => keyWords(null), /\(got object\)/);
  // plan 3 final review (parked to plan 5): a near-valid key must never land in an error log
  assert.throws(() => keyWords('0123abcd-4567-89ef-0123-456789abcdeX'), e => !/0123abcd/.test(e.message));
```

Append to `test/controllers.test.mjs`:

```js
test('seat() and of() work destructured; renumber checks the number range (plan 1 final review, parked to plan 5)', () => {
  const { cs } = setup(), { seat, of } = cs;
  const c = seat('join', 1); assert.equal(of(1), c); assert.equal(c.player, 2);
  assert.throws(() => cs.renumber(2, 0), /controllers\.renumber: player number must be an integer in 1\.\.255 \(got 0\)/);
  assert.throws(() => cs.renumber(2, 256), /\(got 256\)/); assert.throws(() => cs.renumber(2, 1.5), /\(got 1\.5\)/);
  assert.equal(c.player, 2, 'a refused renumber changes nothing');
});
```

Append to `test/playwright.test.mjs` (after the `T-24: game.pad(state) is pad 0 …` test; it uses that file's `fake` helper):

```js
test('game.pad() and pad(undefined) unplug pad 0, as in 0.12; pad(\'1\'), pad(true) and pad(NaN) still throw (plan 4 residual, carried to plan 5)', async () => {
  const calls = [];
  const g = fake(async (fn, a) => { calls.push(a); return null; });
  await g.pad(); await g.pad(undefined);
  assert.deepEqual(calls, [[0, null], [0, null]], 'both are pad(null): pad 0 unplugged');
  for (const bad of ['1', true, NaN]) await assert.rejects(g.pad(bad), /playwright: pad index must be an integer in 0\.\.15/);
  await assert.rejects(g.pad(undefined, { a: true }), /playwright: pad index must be an integer in 0\.\.15/, 'undefined with a state is still a bad index');
  assert.equal(calls.length, 2, 'a refused call reaches no page');
});
```

- [ ] **Step 3: Run to verify failure**

Run:
```bash
cd /home/smiller/projects/four43/lion-hawk-engine && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=1 test/net-key.test.mjs test/controllers.test.mjs
cd /home/smiller/projects/four43/lion-hawk-engine && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test test/playwright.test.mjs
```
(`test/playwright.test.mjs` imports `lion-hawk/playwright`, so Step 5 counts it as a browser file; it drives a fake page and launches no browser.)
Expected: FAIL:
- `got nope` does not match `got string`;
- `TypeError: Cannot read properties of undefined (reading 'of')`;
- `renumber(2, 0)` does not throw;
- `g.pad()` rejects with `pad index must be an integer in 0..15 (got undefined)` instead of unplugging pad 0.

- [ ] **Step 4: Implement**

`src/net/key.js`, in `keyWords`:

```js
  if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new Error(`net: peer key must be a UUID (got ${typeof uuid})`); // never the value: a near-valid key is a secret
```

`src/core/controllers.js`:
1. Before `return {`, add:

```js
  const of = seat => { for (let i = 0; i < list.length; i++) if (list[i].seat === seat) return list[i]; return undefined; }; // a closure: seat() and destructured callers need no this
```

2. In the returned object, replace the `of(seat) { … },` method with `of,`.
3. In `seat(op, seat, n)`, replace `const c = this.of(seat);` with `const c = of(seat);`.
4. In `renumber(from, to)`, add as its first line:

```js
      if (!Number.isInteger(to) || to < 1 || to > 255) throw new Error(`controllers.renumber: player number must be an integer in 1..255 (got ${to})`);
```

`testing/playwright.js`, in `gameDriver`:
1. In the `[T-24] fake pads` comment, after `pad(null) and pad(index, null) unplug, as unplug(index) does`, add `; a bare pad() or pad(undefined) is pad(null), as in 0.12`.
2. Replace the `pad` method with:

```js
    pad: async (index, state) => {
      if (index === undefined && state === undefined) index = null; // pad() / pad(undefined): unplug pad 0, as in 0.12 (plan 4 residual, plan 5)
      if (typeof index !== 'number') {
        if (index !== null && typeof index !== 'object') padIndex(index); // '1', true, undefined with a state: not a state, not an index
        state = index; index = 0;
      }
      return ev(([i, st]) => window.__lhSetPad(i, st), [padIndex(index), state ?? null]);
    },
```

`pad(NaN)` still throws: `typeof NaN` is `'number'`, and `padIndex(NaN)` rejects it.

`docs/spec.md`. Plan 4 edited this file too, so re-read the lines before editing them.
- After the [N-18] "*Note (plan 3 final review, I1)*" bullet, add:

```markdown
  - *Note (plan 5):* `keyWords` errors name the input's type only (`got string`), never its value: a near-valid key is still a secret.
```

- After the [C-9] bullet, add:

```markdown
  - *Note (plan 2 final review, parked):* `seat.seen` is once per pad index and `id` for the page's life, so a pad that comes back to a lost seat emits `seat.regained`, not `seat.seen`; a game that wants a reset on every replug listens to `seat.regained` too.
```

- After the [T-24] bullet, add:

```markdown
  - *Note (plan 5):* a bare `game.pad()` or `game.pad(undefined)` is `game.pad(null)` (pad 0 unplugged), as in 0.12; `'1'`, `true`, `NaN`, and `undefined` with a state, still throw.
```

- [ ] **Step 5: Run the tests, then every engine suite**

Run the two Step 3 commands again.
Expected: PASS.

Run every engine suite. The lists come from `find`, so the 14 `test/kits/*.test.mjs` files are in UNIT (S5; none of them is a browser or net file). Run the block with bash: zsh does not split an unquoted `$UNIT`.

```bash
bash <<'SH'
cd /home/smiller/projects/four43/lion-hawk-engine || exit 1   # no set -e: all three runs go, each reports its own failures
ALL=$(find test -name '*.test.mjs' | sort)
NET=$(printf '%s\n' $ALL | grep -E '^test/(net|mp)[^/]*\.test\.mjs$')
BROWSER=$(grep -l "testing/playwright\|lion-hawk/playwright" $ALL)
UNIT=$(printf '%s\n' $ALL | grep -vxF -f <(printf '%s\n' $NET $BROWSER))
echo "unit $(echo $UNIT | wc -w), net $(echo $NET | wc -w), browser $(echo $BROWSER | wc -w)"   # 191 files in all
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 $UNIT
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=1 $NET
for f in $BROWSER; do systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test "$f"; done
SH
```
Expected: PASS. Record the three file counts and the three pass counts; Task 11 repeats this run. If a browser suite cannot start (no Chromium), say which ones were skipped.

- [ ] **Step 6: Commit**

```bash
git -C /home/smiller/projects/four43/lion-hawk-engine add src/net/key.js src/core/controllers.js testing/playwright.js docs/spec.md \
  test/net-key.test.mjs test/controllers.test.mjs test/playwright.test.mjs
git -C /home/smiller/projects/four43/lion-hawk-engine diff --cached --name-only
git -C /home/smiller/projects/four43/lion-hawk-engine commit -m "fix(engine): keyWords errors name the type only; controllers.of is a closure and renumber checks 1..255; a bare game.pad() unplugs pad 0 again (plan 5 carry-overs)"
```

---

### Task 3: Point the games at the local engine (no commit)

**Files:** none tracked. It replaces the worktree's installed `/home/smiller/projects/four43/four43-local-players/games/node_modules/lion-hawk` (v0.12.0) with the committed `local-players` tree. The user's checkout keeps its own installed v0.12.0.

**Interfaces:**
- Produces: `lion-hawk` resolves to `local-players` HEAD for every game in ROOT.
- Re-run Step 1 after every later engine commit (Task 11's too).
- Reversal: `cd /home/smiller/projects/four43/four43-local-players/games && rm -rf node_modules/lion-hawk && npm ci --prefer-offline --allow-git=all` (npm reinstalls the locked v0.12.0; then check esbuild as in Step 1). Task 12 replaces it in any case.
- Do not run `ROOT/games/test/` here: `workspace.test.mjs` compares each installed engine version with its pin, so it is red against this copy (N13). It runs in Task 12.

- [ ] **Step 1: Check esbuild, then unpack the engine**

```bash
cd /home/smiller/projects/four43/four43-local-players/games
npx --no-install esbuild --version || { echo 'esbuild does not run (its postinstall was blocked): stop before any build'; exit 1; }
test -z "$(git -C /home/smiller/projects/four43/lion-hawk-engine status --short)" || { echo 'engine tree not clean'; exit 1; }
rm -rf node_modules/lion-hawk && mkdir node_modules/lion-hawk
git -C /home/smiller/projects/four43/lion-hawk-engine archive local-players | tar -x -C node_modules/lion-hawk
ls -d */node_modules/lion-hawk 2>/dev/null; grep -c "claimPeerKey" node_modules/lion-hawk/src/net/key.js; grep -c "haptics" node_modules/lion-hawk/src/view/boot.js
git -C /home/smiller/projects/four43/four43-local-players status --short   # the whole worktree
```
Expected:
- esbuild prints a version (0.28.2 when this plan was revised). Rally's browser tests bundle with esbuild (`test/serve.mjs`), and so does `lion-hawk build`. If it fails, stop and tell the user: the fix is to let esbuild's install script run (for example `npm rebuild esbuild` with its script allowed), and that is their call;
- no nested `lion-hawk` under a workspace member;
- both counts are ≥ 1;
- an empty worktree status (`node_modules` is ignored).

- [ ] **Step 2: Baselines on the local engine**

Run Rally's and Pig Pens' whole `npm test`, each from its own directory (`/home/smiller/projects/four43/four43-local-players/games/rally`, `/home/smiller/projects/four43/four43-local-players/games/pig-pens`), with the `npm test` cap command from Global Constraints.
Expected: PASS for both.

Run Tractor's `npm test` the same way, from `/home/smiller/projects/four43/four43-local-players/games/tractor-pickup`.
Expected (advisory: the plan writer's guess, not a run, N7): these files FAIL: `mp*.test.mjs`, `net.*.test.mjs`, `tape.test.mjs`, `trains.trust.test.mjs`, `session.bind.test.mjs` and `split.test.mjs`. That is plan 3's B3 note: `net.join` now defaults to `'engine'`, and Tractor's registry throws on `lh.*` groups. Every other file PASSES. Record the real failing file list in the ledger, whatever it is. Task 8 Step 1 makes it green.

---

### Task 4: Rally rumble on the seat's pads and the engine's stop

**Files:**
- Modify: `games/rally/src/rumbleOut.js`, `games/rally/src/game.view.js`, `games/rally/src/rumbleLab.js` (B1)
- Test: `games/rally/test/rumble.test.mjs`, `games/rally/test/e2e.browser.mjs`
- All under ROOT `/home/smiller/projects/four43/four43-local-players`.

**Interfaces:**
- Consumes:
  - `view.localPlayers[0].pads` ([C-7]);
  - `view.haptics` (plan 4 final: `stop(reason)`, `paused`; `null` with `autoStop: false`).
- Produces:
  - `rumbleOut({ pads = () => [], haptics = () => null })` → `{ send(m), stop(reason), kill() }`;
  - `stop(reason)` calls `haptics().stop(reason)` once per transition, meaning only when something was sent since the last stop (`'exit'` always);
  - `send` sends nothing while `haptics().paused`;
  - `kill()` sends one zero effect plus `reset()` to each pad in `pads()` and tells the engine nothing. Its only caller is the `?rumble` lab's `pagehide` (B1): the lab runs no engine, so there is no `view.haptics` to stop its pads.
- The `?rumble` lab (`rumbleLab.js`, R7) is `rumbleOut`'s second caller. It passes `pads: () => [...getPads()].filter(Boolean)` (every connected pad, no seat) and no `haptics`.

- [ ] **Step 1: Write the failing unit tests**

In `games/rally/test/rumble.test.mjs`, replace `fakePad` and the two `rumbleOut:` tests with:

```js
const fakePad = () => {
  const calls = [], stops = [], h = { paused: false, stop: r => { stops.push(r); } };
  const actuator = { playEffect: (type, p) => { calls.push(p.strongMagnitude + p.weakMagnitude > 0 ? ['play', { ...p }] : ['zero']); return Promise.resolve('preempted'); },
    reset: () => { calls.push(['reset']); return Promise.resolve(); } };
  // lp.pads: live Gamepads only (no null slots); one without an actuator (Firefox) is skipped
  return { calls, stops, h, out: rumbleOut({ pads: () => [{ index: 1, vibrationActuator: actuator }, { index: 2, id: 'no rumble' }], haptics: () => h }) };
};

test('rumbleOut: one engine stop per transition, exit always; nothing is sent while a pausing overlay is open (lion-hawk C-14, review focus)', () => {
  const { calls, stops, h, out } = fakePad();
  out.stop('menu');
  assert.deepEqual([calls, stops], [[], []], "nothing sent: nothing to stop; a pad's first sight is the engine's reset now");
  out.send({ strong: 0.5, weak: 0.25 });
  assert.equal(calls[0][0], 'play'); assert.equal(calls[0][1].strongMagnitude, 0.5); assert.equal(calls[0][1].weakMagnitude, 0.25);
  assert.ok(calls[0][1].duration >= 50);
  out.stop('menu'); out.stop('menu'); out.stop('finish');
  assert.deepEqual(stops, ['menu'], 'once per transition: the engine repeats its own zero + reset for 20 frames');
  assert.ok(calls.every(c => c[0] !== 'reset'), 'Rally resets nothing itself on a stop');
  out.stop('exit'); assert.deepEqual(stops, ['menu', 'exit'], 'the stage exit always stops');
  calls.length = 0; h.paused = true; out.send({ strong: 1, weak: 1 });
  assert.deepEqual(calls, [], 'paused: no effect is sent (spec C-14)');
  h.paused = false; out.send({ strong: 1, weak: 1 }); assert.equal(calls.length, 1, 'sends again after the pause');
  calls.length = 0; out.kill();
  assert.deepEqual(calls, [['zero'], ['reset']], "kill (the ?rumble lab's pagehide, no engine there): one zero effect + reset on each pad with an actuator (B1)");
  assert.deepEqual(stops, ['menu', 'exit'], 'kill is not an engine stop');
  assert.doesNotThrow(() => rumbleOut({ pads: () => [] }).send({ strong: 1, weak: 1 }));
  assert.doesNotThrow(() => { const o = rumbleOut({ pads: () => undefined }); o.send({ strong: 1, weak: 1 }); o.stop('exit'); }, 'no seat yet, no haptics (autoStop off)');
});

test('rumbleOut: silent gaps between pulses (ABS) never reset, so a queued pulse is never cut; a long quiet is one zero + reset', () => {
  const { calls, stops, out } = fakePad();
  out.send({ strong: 0.8, weak: 0 }); calls.length = 0;
  for (let k = 0; k < 10; k++) { for (let i = 0; i < 3; i++) out.send({ strong: 0.8, weak: 0 }); for (let i = 0; i < 3; i++) out.send({ strong: 0, weak: 0 }); }
  assert.equal(calls.filter(c => c[0] === 'reset').length, 0, 'no reset inside a pulse train');
  assert.equal(calls.filter(c => c[0] === 'zero').length, 10, 'each gap ends its pulse with one queued zero effect');
  assert.equal(calls.filter(c => c[0] === 'play').length, 30);
  calls.length = 0;
  for (let i = 0; i < 40; i++) out.send({ strong: 0, weak: 0 });
  assert.equal(calls.filter(c => c[0] === 'reset').length, 1, 'a quarter second of quiet while driving ends with one zero + reset');
  assert.deepEqual(stops, [], 'not an engine stop: no menu, finish or exit');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/rumble.test.mjs`
Expected: FAIL. The old `rumbleOut` ignores `pads`/`haptics` and reads `navigator.getGamepads` (undefined in Node), so no `play` call is recorded (`calls[0]` is undefined).

- [ ] **Step 3: Rewrite `src/rumbleOut.js`**

```js
// Rumble output (rally-spec R7, R8-2; lion-hawk 0.13 [C-14]): two motor levels → the seat's pads (lp.pads: the live Gamepads the
// engine refreshes each frame), as a short dual-rumble effect re-sent each frame (a new effect replaces the playing one, so the
// duration is just a cut-off if frames stop coming). Pads without an actuator (Firefox, most of Safari) are skipped: rumble is a
// nice-to-have, never an error.
//
// The engine owns stopping: page hide, blur and a pausing overlay, a pad's first sight, and the game moments it is told about
// (view.haptics.stop('menu' | 'finish' | 'exit'): a zero effect plus reset for 20 frames). stop(reason) tells it once per
// transition. While view.haptics.paused nothing is sent. What stays here is the send logic: Chromium queues each playEffect on
// a task but runs reset() at once, so a reset can cancel an effect sent a frame earlier. A gap while driving (both levels ~0,
// e.g. between ABS pulses) is a zero-magnitude effect only, queued behind the last pulse (playtest 2026-10-19); a gap longer
// than GAP_FRAMES ends with one zero effect plus reset (not a menu, finish or exit, so not the engine's).
// kill() is the ?rumble lab's (rumbleLab.js): the lab runs no engine, so on pagehide it zeroes its pads itself, once.
const ON = 0.005, DURATION = 120; // ms: about 7 frames at 60 Hz, so a hitch doesn't leave a gap
const GAP_FRAMES = 15;            // ~1/4 s of driving quiet before it ends
const NO = Object.freeze([]);
const ZERO = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 });

// pads(): the seat's live pads this frame; haptics(): view.haptics (null when the game turned autoStop off, or before enter)
export function rumbleOut({ pads = () => NO, haptics = () => null } = {}) {
  let gap = 0, live = false, sent = false; // sent: an effect went out since the last stop
  const quiet = () => {}; // playEffect resolves 'preempted' when the next frame's effect replaces it; nothing to handle
  const effect = { startDelay: 0, duration: DURATION, strongMagnitude: 0, weakMagnitude: 0 }; // reused: playEffect reads its params at the call
  const zeroEffect = a => a.playEffect('dual-rumble', ZERO)?.catch?.(quiet);
  const zero = a => { zeroEffect(a); a.reset?.()?.catch?.(quiet); };
  const play = a => a.playEffect('dual-rumble', effect)?.catch?.(quiet);
  const each = fn => { const list = pads() ?? NO; for (let i = 0; i < list.length; i++) { const a = list[i]?.vibrationActuator; if (typeof a?.playEffect === 'function') fn(a); } };

  function stop(reason) {
    if (sent || reason === 'exit') { haptics()?.stop(reason); sent = false; }
    live = false; gap = 0;
  }
  function send(m) {
    if (haptics()?.paused) { stop('menu'); return; } // [C-14]: a game sends no rumble while a pausing overlay is open
    if (m.strong > ON || m.weak > ON) {
      effect.strongMagnitude = m.strong; effect.weakMagnitude = m.weak; each(play);
      live = true; gap = 0; sent = true; return;
    }
    if (!live) return;
    gap++;
    if (gap === 1) each(zeroEffect); // the gap's first frame: end the pulse, queued behind it
    else if (gap > GAP_FRAMES) { each(zero); live = false; gap = 0; }
  }
  function kill() { each(zero); live = false; gap = 0; } // the lab's pagehide (B1): one zero effect + reset per pad, no engine stop
  return { send, stop, kill };
}
```

- [ ] **Step 4: Wire it in `src/game.view.js`**

1. Replace:

```js
  const rumble = createRumble(rumblePicks), pads = rumbleOut(); // rally-spec R7
```

with:

```js
  let seat0 = null, haptics = null; // per enter: seat 0 (lion-hawk C-5; Rally has one) and view.haptics (C-14)
  const rumble = createRumble(rumblePicks), pads = rumbleOut({ pads: () => seat0?.pads, haptics: () => haptics }); // rally-spec R7, R8-2
```

2. In the stage half's `enter(engine, view)`, after `const doc = view.doc, win = doc.defaultView;`, add:

```js
      seat0 = view.localPlayers[0]; haptics = view.haptics;
```

3. Replace the `hidden` function and the `leaving` listeners:

```js
      const hidden = () => {
        if (doc.visibilityState !== 'hidden') return;
        pads.kill(); // frames stop while hidden, so nothing else would stop the pad (rally-spec R7)
        if (engine.scene.state?.mode?.clock) engine.ui.tryTap('stage.pause');
      };
      doc.addEventListener('visibilitychange', hidden);
      // A refresh or navigation mid-rumble: stop the pad before the page goes, or it can keep the last effect running.
      const leaving = () => pads.kill();
      win.addEventListener('pagehide', leaving); win.addEventListener('beforeunload', leaving);
```

with:

```js
      // The engine stops the pads on hide, blur and pagehide (lion-hawk C-14); Rally only pauses a timed run here.
      const hidden = () => { if (doc.visibilityState === 'hidden' && engine.scene.state?.mode?.clock) engine.ui.tryTap('stage.pause'); };
      doc.addEventListener('visibilitychange', hidden);
```

4. In `win.__rallyView = { … }`, after `info: () => ({ ...view.gfx.info() })`, add `, seats: () => view.localPlayers.map(lp => lp.pads.length)`.
5. Replace `off = () => { doc.removeEventListener('visibilitychange', hidden); win.removeEventListener('pagehide', leaving); win.removeEventListener('beforeunload', leaving); };` with `off = () => { doc.removeEventListener('visibilitychange', hidden); };`.
6. In `exit`, replace `pads.kill();` with `pads.stop('exit'); seat0 = null; haptics = null;`.
7. In `frame`, replace the two rumble lines:

```js
      const driving = DRIVING.has(s.phase) && ov.length === 0 && doc.visibilityState !== 'hidden' && seen.s === s;
      if (driving) pads.send(rumble.update(s.sim.car, Math.min(0.1, view.dt), STRENGTH[st.rumble] ?? 1)); else pads.stop();
```

with:

```js
      const driving = DRIVING.has(s.phase) && ov.length === 0 && seen.s === s; // a hidden page renders no frames (the engine stopped the pads)
      if (driving) pads.send(rumble.update(s.sim.car, Math.min(0.1, view.dt), STRENGTH[st.rumble] ?? 1)); else pads.stop(s.phase === 'finished' ? 'finish' : 'menu');
```

Then check that `doc` is still used in `frame` (for the classes). If the frame's `doc` binding is now unused, remove only that binding. After these edits `grep -n "kill" src/game.view.js` prints nothing.

`src/rumbleLab.js` (B1). Replace:

```js
  const mix = createRumble(picks), pads = rumbleOut({ getGamepads });
  const getPads = getGamepads ?? (() => win.navigator.getGamepads?.() ?? []);
```

with:

```js
  const getPads = getGamepads ?? (() => win.navigator.getGamepads?.() ?? []);
  // the lab runs no engine (no seat, no view.haptics): it sends to every connected pad, and its pagehide kill() zeroes them (rally-spec R8-2)
  const mix = createRumble(picks), pads = rumbleOut({ pads: () => [...getPads()].filter(Boolean) });
```

Keep `win.addEventListener('pagehide', () => pads.kill());` and `pads.send(m);` as they are. Then `grep -n "pads\." src/rumbleLab.js` prints only `pads.send(m)` and `pads.kill()`.

- [ ] **Step 5: Add the browser check**

Append to `games/rally/test/e2e.browser.mjs`:

```js
test('desktop: rumble reaches seat 0\'s pads while driving; a pause stops them (R7, R8-2, lion-hawk C-14)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'freeDrive', world: 'loop', seed: 'e2e3', rumble: 'full' } } });
  try {
    await game.tap('title.drive'); await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.pad(0, { x: true }); await game.frames(); await game.pad(0, {}); await game.frames(); // a press pairs the pad to seat 0
    await game.seconds(2, { throttle: 1 }); await game.frames();
    const on = c => c.op === 'playEffect' && c.params.strongMagnitude + c.params.weakMagnitude > 0;
    assert.ok((await game.haptics(0)).calls.some(on), 'the stage rumbles the pad');
    // render is 'auto': frames between a count and the key press may still rumble, so the counts are taken around the pause, not before it
    const m = (await game.haptics(0)).calls.length; // up to here: driving
    await game.page.keyboard.press('Escape'); await game.frames(); await game.step(1); await game.frames(); await game.frames();
    assert.deepEqual((await game.scene()).overlays, ['pause']);
    await game.frames(3); // the pause is on: the engine's stop has started, and Rally sends nothing more
    const n = (await game.haptics(0)).calls.length;
    assert.ok((await game.haptics(0)).calls.slice(m).some(c => c.op === 'reset'), 'the pause stops it (a reset since Escape)');
    await game.frames(5);
    assert.ok(!(await game.haptics(0)).calls.slice(n).some(on), 'nothing is sent while paused');
  } finally { await game.close(); }
});
```

- [ ] **Step 6: Run**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/rumble.test.mjs test/jolt.test.mjs`
Expected: PASS. `rumble.test.mjs` also imports `fakeCar` from `rumbleLab.js`, so it loads the edited lab.

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test test/e2e.browser.mjs`
Expected: PASS (the old tests plus the new one). Run the new test three times (`--test-name-pattern "rumble reaches"`); it must pass every time.

- [ ] **Step 7: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/rally/src/rumbleOut.js games/rally/src/game.view.js games/rally/src/rumbleLab.js games/rally/test/rumble.test.mjs games/rally/test/e2e.browser.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "refactor(rally): rumble goes to seat 0's pads and the engine stops it (lion-hawk C-14): no own hide, unload or first-sight stops; the ?rumble lab keeps kill()"
```

---

### Task 5: Rally devices as the `drive` mapping context

**Files:**
- Modify: `games/rally/src/devices.js`, `games/rally/src/main.js`
- Test: `games/rally/test/devices.test.mjs`, `games/rally/test/e2e.browser.mjs`
- All under ROOT `/home/smiller/projects/four43/four43-local-players`.

**Interfaces:**
- Consumes: `view.context(name, def)`, `view.seats({ max, join, contexts })` ([C-5], [C-10]).
- Produces:
  - `driveContext(doc)` → `{ keys: { all: { bindings: KEYS, ramps: RAMPS } }, pads: [{ match: () => true, bindings: PAD }], touch }`;
  - `useSeats(view, doc)`;
  - `devices(doc)` → `[glyphs]`.

- [ ] **Step 1: Write the failing tests**

Append to `games/rally/test/devices.test.mjs` and extend its import to `import { RAMPS, KEYS, PAD, devices, driveContext, useSeats } from '../src/devices.js';`:

```js
test('device setup is the drive context (lion-hawk C-5, C-10): keys with the ramps, any pad, the touch controls; one seat takes every pad (review focus)', () => {
  const doc = { defaultView: { innerWidth: 800 }, querySelector: () => null };
  const ctx = driveContext(doc);
  assert.equal(ctx.keys.all.bindings, KEYS); assert.equal(ctx.keys.all.ramps, RAMPS);
  assert.equal(ctx.pads.length, 1); assert.equal(ctx.pads[0].bindings, PAD);
  for (const p of [{ mapping: 'standard', id: 'Xbox' }, { mapping: '', id: 'G29 wheel' }]) assert.equal(ctx.pads[0].match(p), true, `#30: ${p.id} drives`);
  assert.equal(typeof ctx.touch, 'function');
  const calls = [], view = { context: (n, d) => calls.push(['context', n, d]), seats: o => { calls.push(['seats', o]); return []; } };
  useSeats(view, doc);
  assert.deepEqual(calls.map(c => c[0]), ['context', 'seats']); assert.equal(calls[0][1], 'drive');
  const o = calls[1][1]; assert.equal(o.max, 1); assert.deepEqual(o.contexts, ['drive']);
  assert.equal(o.join({ kind: 'pad', index: 3, id: 'x' }), 0, 'a second pad joins seat 0, not seat 1');
  assert.equal(devices(doc).length, 1, 'boot keeps only the glyph prompts: a keyboard or pad device beside the context would bind twice');
});
```

Append to `games/rally/test/e2e.browser.mjs`:

```js
test('desktop: the drive context: W drives, and two pads are one player (lion-hawk C-5, C-10, review focus)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'freeDrive', world: 'loop', seed: 'e2e2' } } });
  try {
    await game.tap('title.drive'); await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.page.keyboard.down('w'); await frames(game); await game.seconds(1.5); await game.page.keyboard.up('w');
    assert.ok((await game.state()).speed > 1, 'W drives through the context');
    await game.pad(0, { x: true }); await game.pad(1, { x: true }); await game.frames(); await game.pad(0, {}); await game.pad(1, {}); await game.frames();
    assert.deepEqual(await game.page.evaluate(() => window.__rallyView.seats()), [2], 'one seat holds both pads');
  } finally { await game.close(); }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/devices.test.mjs`
Expected: FAIL with `does not provide an export named 'driveContext'`.

- [ ] **Step 3: Implement `src/devices.js`**

Replace the `// Device factories for boot({ devices }).` comment and the whole `devices(doc)` function with:

```js
// lion-hawk 0.13 (C-5, C-10): the keyboard, the pads and the touch controls are the 'drive' mapping context, bound by the engine
// onto the seat's controller; touch(e) gets the seat's { input, command }. #30: any pad drives, so the one entry matches every pad.
export function driveContext(doc) {
  const win = doc.defaultView, $ = s => doc.querySelector(s);
  return {
    keys: { all: { bindings: KEYS, ramps: RAMPS } },
    pads: [{ match: () => true, bindings: PAD }],
    touch: e => [
      bindStick(e, { root: $('#steerZone'), x: ['steer', -1], axis: 'x', radius: () => steerRange(win.innerWidth), deadZone: 0, edge: 20,
        base: $('#steerBase'), knob: $('#steerKnob'), doc }),
      ...HOLDS.map(([sel, action]) => bindHold(e, $(sel), action)),
    ],
  };
}
// Rally has one player: every pad joins seat 0 (two pads still drive one car, #29, #30) and the context starts there.
export function useSeats(view, doc) {
  view.context('drive', driveContext(doc));
  return view.seats({ max: 1, join: () => 0, contexts: ['drive'] });
}
// Device factories for boot({ devices }): only what is not a seat's input. The A/B prompts on menu buttons follow the input in use (U-10).
export function devices(doc) { return [e => bindGlyphs(e, { doc })]; }
```

Change the import to `import { bindStick, bindHold } from 'lion-hawk/view';`. Update the file's header comment: after "the engine merges the sources", add "; since lion-hawk 0.13 they are the 'drive' mapping context (rally-spec R8-1)".

`src/main.js`:
- change the import to `import { devices, useSeats } from './devices.js';`;
- change `const { engine } = boot(` to `const { engine, view } = boot(`;
- after boot's closing `});`, add `useSeats(view, document); // lion-hawk C-5, C-10: one player; keys, every pad and touch through the 'drive' context (rally-spec R8-1)`.

- [ ] **Step 4: Run**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/devices.test.mjs test/purity.test.mjs`
Expected: PASS.

Run each of `test/e2e.browser.mjs`, `test/render.browser.mjs`, `test/built.browser.mjs` alone, one after another:
```bash
cd /home/smiller/projects/four43/four43-local-players/games/rally && for f in test/e2e.browser.mjs test/render.browser.mjs test/built.browser.mjs; do
  systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test "$f"; done
```
Expected: PASS. That includes `a gamepad walks the title … drives, pauses with Start …` and the new test.

Then run `test/mobile.mjs` alone, under the browser cap (S4). It needs no dev server: it bundles and serves the page itself (`serveRally` from `test/serve.mjs`, `mobile.mjs:41`), so do not start `npm run dev`:
```bash
cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 test/mobile.mjs
```
Expected: its own pass count, no failures.

- [ ] **Step 5: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/rally/src/devices.js games/rally/src/main.js games/rally/test/devices.test.mjs games/rally/test/e2e.browser.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(rally): keyboard, pads and touch are the drive mapping context on one seat (lion-hawk C-5, C-10)"
```

---

### Task 6: Rally state homes [T-25]

**Files:**
- Modify: `games/rally/src/game.sim.js`, `games/rally/src/game/stage.js`, `games/rally/docs/spec/rally-spec.md`
- Create: `games/rally/test/state-homes.test.mjs`
- All under ROOT `/home/smiller/projects/four43/four43-local-players`.

**Interfaces:**
- Consumes: `defineGame({ player, gameState })`, `engine.players`, `engine.gameState` ([N-21], [N-22], offline records).
- Produces:
  - `PLAYER_STATE = { lastLap, bestLap, finish }` (ms; 0 means none);
  - `GAME_STATE = { phase }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/state-homes.test.mjs
// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): Rally's lap times are player state (player 1's record in
// engine.players) and outlive the car; the run's phase is game state (engine.gameState). Rally has no net part, so the rejoin and
// late-joiner halves of [T-25] apply to Tractor only (spec ruling).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { game } from './helpers/bench.mjs';
await R.init();

test('T-25: the run\'s phase is game state, written as the stage moves through it', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'stage', seed: 'flow1' } } });
  h.step(1); assert.equal(h.engine.gameState.phase, 'title');
  h.tap('title.drive'); assert.equal(h.engine.gameState.phase, 'ready');
  h.until(x => x.state().phase === 'running', { maxSeconds: 5 }); assert.equal(h.engine.gameState.phase, 'running');
});

test('T-25: lap times are player 1\'s state and survive the car going back onto the road and a restart', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'timeAttack', world: 'loop', seed: 'homes1' } } }), dbg = h.engine.game.debug(h.engine);
  h.tap('title.drive'); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  dbg.nearFinish(40); h.step(240); dbg.lap(true); h.step(1);
  const p = h.engine.players[0], last = p.lastLap;
  assert.equal(p.number, 1); assert.ok(last >= 900, `lastLap ${last} ms`); assert.equal(p.bestLap, last); assert.equal(p.finish, 0);
  h.step(1, { reset: true }); h.step(30);
  assert.equal(h.engine.players[0].lastLap, last, 'kept through R (the car placed again)');
  h.step(1, { resetAll: true }); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  assert.equal(h.engine.players[0].lastLap, last, 'kept through a restart'); assert.equal(h.engine.players[0].bestLap, last);
});

test('T-25: a stage finish time is player 1\'s state', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'stage', seed: 'flow1' } } }), dbg = h.engine.game.debug(h.engine);
  h.tap('title.drive'); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  dbg.finish({ time: 163.42, best: null }); h.step(1);
  assert.equal(h.engine.players[0].finish, 163420); assert.equal(h.engine.gameState.phase, 'finished');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/state-homes.test.mjs`
Expected: FAIL: `gameState.phase` is `undefined` and `lastLap` is `undefined`.

- [ ] **Step 3: Implement**

`src/game.sim.js`: change the import to `import { defineGame, actions, axis, button, F } from 'lion-hawk/sim';`. After `ACTIONS`, add:

```js
// [T-25] where Rally's state lives (lion-hawk spec §2.2, rally-spec R8-3): lap times are player 1's player state (they outlive the
// car); the run's phase is game state. Times in ms, 0 = none yet.
export const PLAYER_STATE = { lastLap: F.uint(4), bestLap: F.uint(4), finish: F.uint(4) };
export const GAME_STATE = { phase: F.oneOf(['title', 'loading', 'ready', 'countdown', 'running', 'finished']) };
```

In `rallySpec`'s returned object, after `actions: ACTIONS,`, add `player: PLAYER_STATE, gameState: GAME_STATE,`.

`src/game/stage.js`:
1. After the imports, add:

```js
const MS_MAX = 0xffffffff, ms = t => Math.max(0, Math.min(MS_MAX, Math.round(t * 1000))); // [T-25] lap times in ms on player 1's record
```

2. `setPhase`: replace `const from = s.phase; s.phase = phase;` with `const from = s.phase; s.phase = phase; e.gameState.phase = phase; // [T-25] the session's phase is game state`.
3. In `handle`, case `'finish'`, after `setPhase(e, s, 'finished');`, add `e.players[0].finish = ms(s.time); // [T-25] player 1 (Rally has one seat)`.
4. In case `'line'`, after `s.laps.push(lap);`, add:

```js
        const p = e.players[0], t1 = ms(t); p.lastLap = t1; if (ev.valid && (p.bestLap === 0 || t1 < p.bestLap)) p.bestLap = t1; // [T-25] this session's laps
```

`docs/spec/rally-spec.md`: append this section.

```markdown

## Round 8: local players (lion-hawk 0.13, 2026-10-21)

- **R8-1 Devices are a mapping context.** `src/devices.js` declares the `drive` context (the keyboard with its ramps, every pad
  with the expo stick, the touch slider and buttons); `useSeats(view, doc)` turns on one seat that every pad joins, so two pads
  still drive one car (#30). `boot({ devices })` keeps only the glyph prompts.
- **R8-2 Rumble on the seat's pads.** `rumbleOut` sends to `view.localPlayers[0].pads` and stops through `view.haptics.stop()`:
  `'menu'` (title, settings, results, pause), `'finish'` and `'exit'` (the stage exits), once per transition. Nothing is sent
  while `view.haptics.paused`. The engine stops the pads on page hide, blur and `pagehide` and resets a pad the first time it
  sees it (lion-hawk C-14), so Rally no longer does. A quarter second of quiet while driving still ends with one zero effect
  plus reset (R7's gap rule). The `?rumble` lab runs no engine: it sends to every connected pad and zeroes them on `pagehide`
  (`rumbleOut`'s `kill()`).
- **R8-3 State homes** (lion-hawk §2.2, [T-25]): the last lap, this session's best lap and the stage finish time (ms) are
  player 1's player state (`engine.players[0]`: `lastLap`, `bestLap`, `finish`); the run's phase is game state
  (`engine.gameState.phase`). The stage writes them where it changes them; `s.phase` stays the HUD's copy.
  Deferred (lion-hawk §2.2's worked example for Rally, partly built): the splits, the countdown and the track seed stay in the
  stage state for now; they move to player or game state when Rally has a second player or a net part.
- Follow-up after this round: the "almost slip" brake warning in the left trigger (`trigger-rumble`).
```

- [ ] **Step 4: Run Rally's whole suite**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 env NODE_OPTIONS=--max-old-space-size=512 npm test`
Expected: PASS, including `lh-alloc.test.mjs` (the writes allocate nothing), `golden*.test.mjs` and `flow.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/rally/src/game.sim.js games/rally/src/game/stage.js games/rally/docs/spec/rally-spec.md games/rally/test/state-homes.test.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(rally): lap times in player state and the run's phase in game state (lion-hawk T-25); spec round 8"
```

---

### Task 7: Pig Pens: the `farm` context and state homes [T-25]

**Files:**
- Modify: `games/pig-pens/src/devices.js`, `games/pig-pens/src/main.js`, `games/pig-pens/src/game.sim.js`, `games/pig-pens/src/game/farm.js`
- Create: `games/pig-pens/test/devices.test.mjs`, `games/pig-pens/test/state-homes.test.mjs`
- All under ROOT `/home/smiller/projects/four43/four43-local-players`.

**Interfaces:**
- Produces:
  - `farmContext(doc)` → `{ keys: { all: { bindings: KEYS } }, touch }` (no pads, as before);
  - `useSeats(view, doc)`;
  - `devices(doc)` → `[pointer tools]` (commands, not seat input: `toolAt(e)` reads `e.scene.state`, which a seat's `{ input, command }` has not);
  - `player: { eggs: F.uint(2) }`, `gameState: { night: F.bool(), pens: F.list(F.uint(1), 8, 8) }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/devices.test.mjs
// lion-hawk 0.13 (C-5, C-10): the keys, the drive pad and the horn are the 'farm' mapping context on one seat; the tools stay a boot device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, devices, farmContext, useSeats } from '../src/devices.js';

test('device setup is the farm context (lion-hawk C-5, C-10): keys, drive pad and horn on one seat; the tools stay a boot device (review focus)', () => {
  const doc = { defaultView: {}, getElementById: () => null };
  const ctx = farmContext(doc);
  assert.equal(ctx.keys.all.bindings, KEYS); assert.equal(ctx.pads, undefined, 'no gamepad, as before'); assert.equal(typeof ctx.touch, 'function');
  const calls = [], view = { context: (n, d) => calls.push(['context', n, d]), seats: o => { calls.push(['seats', o]); return []; } };
  useSeats(view, doc);
  assert.deepEqual(calls.map(c => c[0]), ['context', 'seats']); assert.equal(calls[0][1], 'farm');
  assert.equal(calls[1][1].max, 1); assert.deepEqual(calls[1][1].contexts, ['farm']); assert.equal(calls[1][1].join({ kind: 'pad', index: 1 }), 0);
  assert.equal(devices(doc).length, 1, 'only the pointer tools: a keyboard device beside the context would bind twice');
});
```

```js
// test/state-homes.test.mjs
// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): the basket is player 1's player state and outlives the pawn
// changing (getting in and out of the tractor); day or night and the pigs in each pen are game state. Pig Pens has no net part,
// so the rejoin and late-joiner halves of [T-25] apply to Tractor only (spec ruling).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
await R.init();

test('T-25: the basket is player 1\'s state and survives driving the tractor; night and the pen counts are game state', () => {
  const h = headless(pigPensGame(), { seed: 3, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, dbg = h.engine.game.debug(h.engine);
  h.step(1);
  assert.deepEqual(h.engine.gameState.pens, [...sim.counts]); assert.equal(h.engine.gameState.night, false);
  const n = sim.lay.nests[1]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  assert.equal(sim.flock.collectEgg(999), true); h.step(1);
  assert.equal(h.engine.players[0].number, 1); assert.equal(h.engine.players[0].eggs, 1);
  dbg.drive(); h.step(30); assert.equal(h.state().driving, true); h.tap('farm.exit'); h.step(1); assert.equal(h.state().driving, false);
  assert.equal(h.engine.players[0].eggs, 1, 'kept through getting in and out of the tractor');
  dbg.night(true); h.step(1); assert.equal(h.engine.gameState.night, true);
  h.step(60); assert.deepEqual(h.engine.gameState.pens, [...sim.counts], 'the pen counts follow the herd');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/pig-pens && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/devices.test.mjs test/state-homes.test.mjs`
Expected: FAIL with `does not provide an export named 'farmContext'`; `gameState.pens` is `undefined`.

- [ ] **Step 3: Implement**

`src/devices.js`: replace `// Device factories for boot({ devices }).` and the `devices(doc)` function with:

```js
// lion-hawk 0.13 (C-5, C-10): the keys, the fixed drive pad (#53) and the horn are the 'farm' mapping context on the seat's controller
// (touch(e) gets its { input, command }). No gamepad entry: Pig Pens reads no pad, as before.
export function farmContext(doc) {
  const $ = id => doc.getElementById(id);
  return {
    keys: { all: { bindings: KEYS } },
    touch: e => [
      // the fixed drive pad (#53): deflects from its own centre, travel 36% of its width, no dead zone (main.js stickMove)
      bindStick(e, { root: $('stick'), base: $('stick'), knob: $('knob'), origin: 'centre', x: ['steer', -1], y: ['throttle', 1],
        radius: () => $('stick').getBoundingClientRect().width * 0.36, deadZone: 0, edge: 0, doc }),
      bindHold(e, $('horn'), 'horn'),
    ],
  };
}
// One player: any pad joins seat 0 (and binds nothing); the context starts there.
export function useSeats(view, doc) {
  view.context('farm', farmContext(doc));
  return view.seats({ max: 1, join: () => 0, contexts: ['farm'] });
}
// Device factories for boot({ devices }): the tools are `tool` commands (toolAt reads the scene state), not a seat's input.
export function devices(doc) {
  const $ = id => doc.getElementById(id);
  return [e => bindPointer(e, { surface: $('c'), type: 'tool', at: toolAt(e), filter: { button: [0] }, press: PRESS, tap: TAP, uncapped: true, doc })];
}
```

Remove `bindKeyboard` from its `lion-hawk/view` import.

`src/main.js`:
- change the import to `import { devices, useSeats } from './devices.js';`;
- change `boot(pigPensGame(), …` to `const { view } = boot(pigPensGame(), …`;
- after boot's closing `});`, add `useSeats(view, document); // lion-hawk C-5, C-10: keys, drive pad and horn through the 'farm' context`.

`src/game.sim.js`:
- change the import to `import { defineGame, actions, axis, button, F } from 'lion-hawk/sim';`;
- in `defineGame({ … })`, on a new line after the line that ends `actions: ACTIONS, start: 'farm',` (line 46; it has no trailing comment), add:

```js
    // [T-25] state homes (lion-hawk §2.2): the basket is player 1's; day or night and the pigs in each of the 8 regions are the farm's
    player: { eggs: F.uint(2) }, gameState: { night: F.bool(), pens: F.list(F.uint(1), 8, 8) },
```

`src/game/farm.js`: in the `farm.events` system, after `q.length = 0;`, add:

```js
        const me = e.players[0], g = e.gameState, c = s.sim.counts; // [T-25]: written each step, allocation-free
        me.eggs = Math.min(0xffff, s.sim.flock.basket); g.night = s.sim.clock.night; for (let i = 0; i < 8; i++) g.pens[i] = c[i];
```

- [ ] **Step 4: Run**

Run Pig Pens' whole `npm test` with the cap command, from `/home/smiller/projects/four43/four43-local-players/games/pig-pens`.
Expected: PASS, including `golden*.test.mjs`, `invariants.test.mjs` and `purity.test.mjs`.

Run `cd /home/smiller/projects/four43/four43-local-players/games/pig-pens && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test test/e2e.browser.mjs`.
Expected: PASS, including `… holding the tractor drives, W moves it, Escape gets out` and `iPhone landscape: hold the tractor, drive with the thumb pad, honk …`.

- [ ] **Step 5: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/pig-pens/src/devices.js games/pig-pens/src/main.js games/pig-pens/src/game.sim.js games/pig-pens/src/game/farm.js \
  games/pig-pens/test/devices.test.mjs games/pig-pens/test/state-homes.test.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(pig-pens): keys, drive pad and horn are the farm mapping context; basket in player state, night and pens in game state (lion-hawk C-10, T-25)"
```

---

### Task 8: Tractor's train is seat 0's pawn; NET_VERSION 5

**Files:**
- Modify:
  - `games/tractor-pickup/src/game/net.js` (stopgap `join: 'manual'`)
  - `src/sim/pilot.js`, `src/sim/actions.js`, `src/sim/game.js`, `src/sim/trains.js`
  - `src/game/farm.js`
  - `src/net/kinds.js`, `src/net/entities.js`, `src/net/protocol.js`
- Test:
  - `test/possess.test.mjs` (new), `test/pilot.test.mjs`, `test/golden.test.mjs`
  - `test/mp.harness.mjs`, `test/mp.engine.harness.mjs`
  - `test/net.kinds.test.mjs`, `test/protocol.test.mjs`
- All under ROOT `/home/smiller/projects/four43/four43-local-players` (`games/tractor-pickup/`).

**Interfaces:**
- Consumes: `engine.controllerOf(0).possess(e)`, [C-3] copy (a net-made `e.input` keeps its keys, buttons as `down`).
- Produces:
  - `stickOf(yaw, thr, steer, out)` → `out` with `{ goX, goZ, goBack }`;
  - `TRAIN.fields.input` is `F.actions(ACTIONS)`;
  - `NET_VERSION = 5`;
  - the harness accepts a stick input `{ goX, goZ, goBack }`, which goes through seat 0's controller, beside the raw `{ thr, steer, horn }`.

- [ ] **Step 1: Stopgap: the manual join, green on the local engine**

In `src/game/net.js` `netConfig`, after `kinds, world: true,`, add `join: 'manual', // plan 3 B3 stopgap until the engine join (plan 5 Task 9)`.

Run Tractor's whole `npm test` with the cap command, from `/home/smiller/projects/four43/four43-local-players/games/tractor-pickup`.
Expected: PASS. Task 3's failing files now pass.

- [ ] **Step 2: Write the failing tests**

Append to `test/pilot.test.mjs` (extend its import with `stickOf`):

```js
test('stickOf is drive()\'s inverse for a tractor-frame thr and steer (the raw seam, plan 5)', () => {
  const p = createPilot(), o = {};
  for (const yaw of [0, 1, -2.5]) for (const [thr, steer] of [[1, 0], [0.6, 0.2], [0.7, -1], [-0.5, 0.3], [-1, -1]]) {
    stickOf(yaw, thr, steer, o); const d = p.drive(o.goX, o.goZ, o.goBack, yaw, 5);
    assert.ok(Math.abs(d.thr - thr) < 1e-9 && Math.abs(d.steer - steer) < 1e-9, `yaw ${yaw} thr ${thr} steer ${steer}: got ${d.thr} ${d.steer}`);
  }
  assert.deepEqual(stickOf(1, 0, 0.5, {}), { goX: 0, goZ: 0, goBack: false }, 'no throttle, no stick');
});
```

Create `test/possess.test.mjs`:

```js
// The train is seat 0's pawn (lion-hawk C-2, C-3, I-4; plan 5): lh.possess copies the controller's world-frame stick into the
// train's e.input each step, the owner send carries it (N-13), and every other peer turns it into throttle and steer with the
// pilot. The hand copy in sim/game.js is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { TRAIN } from '../src/net/kinds.js';
import { engineWorld } from './mp.engine.harness.mjs';
await R.init();

test('solo: seat 0 possesses the tractor, and a new farm possesses the new one', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true, trip: false } }), s = h.engine.scene.state;
  h.step(1); assert.equal(h.engine.controllerOf(0).pawn, s.game.tractor.e);
  const old = s.game.tractor.e; h.command('farm.new', {}); h.seconds(1);
  assert.notEqual(s.game.tractor.e, old); assert.equal(h.engine.controllerOf(0).pawn, s.game.tractor.e);
});

test('the train kind replicates the stick: goX, goZ, goBack, horn (NET_VERSION 5)', () => {
  assert.deepEqual([TRAIN.fields.input.axes, TRAIN.fields.input.buttons], [['goX', 'goZ'], ['goBack', 'horn']]);
});

test('the train is seat 0\'s pawn: its replicated input is the controller\'s world-frame stick, and the host\'s replica drives from it (review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  const g = w.guests[0], yaw = g.game.tractor.yaw, stick = { goX: Math.sin(yaw), goZ: Math.cos(yaw), goBack: false };
  assert.equal(g.engine.controllerOf(0).pawn, g.game.tractor.e);
  w.seconds(2, (d, i) => (i === 1 ? stick : null));
  const I = g.game.tractor.e.input;
  assert.ok(Math.abs(Math.hypot(I.goX, I.goZ) - 1) < 1e-3, `the pawn carries the stick (${I.goX}, ${I.goZ})`);
  const rep = w.host.engine.world.net.find('train', 2);
  assert.ok(rep?.remote, 'the host has the guest\'s train'); assert.ok(Math.hypot(rep.input.goX, rep.input.goZ) > 0.99, 'from the wire');
  assert.ok(rep.remote.tractor.inThr > 0.9, `the host's pilot drives the replica forward (${rep.remote.tractor.inThr})`);
});

test('the raw seam (tests, debug.drive) puts the matching stick on the train, so other peers drive its replica alike', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  w.seconds(2, (d, i) => (i === 1 ? { thr: 0.8, steer: 0.3, horn: false } : null));
  const t = w.host.engine.world.net.find('train', 2).remote.tractor;
  assert.ok(Math.abs(t.inThr - 0.8) < 0.05, `the replica's throttle ${t.inThr}`);
  assert.ok(Math.abs(t.inSteer - 0.3) < 0.15, `the replica's steer ${t.inSteer}`);
});
```

In `test/net.kinds.test.mjs`, change the first test's title to `'NET_VERSION 5 and four kinds with today\'s codes and id ranges'` and change `assert.equal(NET_VERSION, 4);` to `assert.equal(NET_VERSION, 5);`. In `test/protocol.test.mjs`, change `assert.equal(NET_VERSION, 4, 'M-27: the wire changed (3l: replication on the engine net part)');` to `assert.equal(NET_VERSION, 5, 'M-27: the wire changed (plan 5: the train replicates the seat\'s stick)');`.

- [ ] **Step 3: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/pilot.test.mjs test/possess.test.mjs test/net.kinds.test.mjs test/protocol.test.mjs`
Expected: FAIL:
- `stickOf` is not exported;
- `pawn` is `undefined`;
- the input axes are `['thr', 'steer', 'turn']`;
- NET_VERSION is 4.

- [ ] **Step 4: Implement**

`src/sim/pilot.js`: append

```js
// The inverse of drive() for a tractor-frame { thr, steer } (the raw seam: tests and debug.drive): the world-frame stick that the
// pilot turns back into the same thr and steer at this yaw, so another peer's pilot drives the replica alike (plan 5). Exact for
// |steer| <= 1 (the wanted heading is within PILOT.fullErr, so full speed and no turn help); thr 0 gives no stick.
export function stickOf(yaw, thr, steer, out) {
  const m = Math.min(1, Math.abs(thr));
  if (m === 0) { out.goX = out.goZ = 0; out.goBack = false; return out; }
  const back = thr < 0, want = back ? yaw + Math.PI - steer / PILOT.gain : yaw + steer / PILOT.gain;
  out.goX = m * Math.sin(want); out.goZ = m * Math.cos(want); out.goBack = back; return out;
}
```

`src/sim/actions.js`:
- delete the `DRIVE` line and its comment line;
- change `import { actions, axis, button }` to keep only what `ACTIONS` uses;
- add to the header comment: "The train replicates these actions as its input (plan 5): every peer runs the pilot on them."

`src/sim/game.js`: delete line 88 (`if (tractor.e.net) { const I = tractor.e.input; … } // N-13: …`).

`src/sim/trains.js`:
1. Add `import { createPilot } from './pilot.js';` and `const pilot = createPilot(); // stateless but for its reused out: one for every remote train`.
2. In `stepRemoteTrains`, replace the two lines after `const { tractor, train } = e.remote, I = e.input;` with:

```js
    const o = pilot.drive(I?.goX ?? 0, I?.goZ ?? 0, !!I?.goBack, tractor.yaw, tractor.speed); // the owner's stick, through this peer's pilot (plan 5)
    tractor.hold = e.mode !== 'drive'; tractor.setInput(o.thr, o.steer, o.turn); tractor.step(DT);
    train.step(DT, { parked: tractor.hold || (Math.abs(o.thr) < 0.05 && tractor.speed < 0.3) });
```

3. Update the header comment to say "drives each from its owner's replicated stick through the pilot".

`src/game/farm.js`:
1. Import `stickOf` with `createPilot` from `'../sim/pilot.js'`.
2. In `build`, after `s.game = createGame(…);`, add:

```js
    e.controllerOf(0)?.possess(s.game.tractor.e); // [C-2]: the train is seat 0's pawn; lh.possess copies the stick into its e.input each step (N-13 sends it)
```

3. In `readInput`, replace the `if (r) { … return o; }` line with:

```js
  if (r) { // as game.step reads a plain input; a train in a session also carries the matching stick, for the other peers' pilots (stickOf)
    o.thr = r.thr; o.steer = r.steer; o.turn = r.turn ?? 0; o.onTarget = r.onTarget !== false; o.horn = !!r.horn;
    const t = s.game.tractor; if (t.e.net) { const I = t.e.input; stickOf(t.yaw, r.thr, r.steer, I); I.horn = o.horn; }
    return o;
  }
```

`src/net/kinds.js`:
- change `import { DRIVE } from '../sim/actions.js';` to `import { ACTIONS } from '../sim/actions.js';`;
- in `TRAIN`'s fields, change `input: F.actions(DRIVE)` to `input: F.actions(ACTIONS)`;
- add after the field list: `// input: the owner seat's stick (plan 5: the train is its pawn)`.

`src/net/entities.js` `localTrain`: replace the whole function with

```js
export function localTrain(world, game, you) {
  if (!you || !game?.tractor) return; const e = game.tractor.e;
  e.mode ??= 'drive'; e.full ??= false; e.dirt ??= [0, 0, 0]; e.riders ??= [];
  if (e.net && e.netId === you) return;
  if (e.net) world.remove(e, 'net');
  // [I-4], [C-3]: a net-made input in the train kind's shape (buttons as booleans); seat 0's lh.possess fills its keys each step
  e.input = { goX: 0, goZ: 0, goBack: false, horn: false };
  e.netId = you; e.owner = you; world.add(e, 'net', 'train');
}
```

`src/net/protocol.js`: change the first export line to `export const NET_VERSION = 5, MAX_PLAYERS = 4; // 5 (lion-hawk 0.13): the train replicates the seat's stick; the engine join (plan 5)`.

Tests and harnesses:
- `test/golden.test.mjs`: in `gameEvents`, after `e.type !== 'overlay'`, add `&& !e.type.startsWith('controller.')` (the engine's possession events; the goldens' game events and states are unchanged).
- `test/mp.harness.mjs`:
  - change the `parked` record's `input: { s: 1, list: [{ thr: 0, steer: 0, turn: 0 }] }` to `input: { s: 1, list: [{ goX: 0, goZ: 0, goBack: false, horn: false }] }`;
  - change the comment `(NET_VERSION 4: …` to `(NET_VERSION 5: three F.body() fields, a batched stick input, the dirt list)`.
- `test/mp.engine.harness.mjs`: replace the `beforeStep` line with

```js
    beforeStep: (p, i) => { const d = devs[i]; seen[i](); const inp = (typeof inputs === 'function' ? inputs(d, i) : inputs[i]) || STILL;
      if ('goX' in inp) { p.engine.scene.state.raw = null; p.engine.input.set(inp); } else p.engine.scene.state.raw = inp; } }); // a world-frame stick goes through seat 0's controller (C-2); { thr, steer } is the raw seam
```

and add to its header comment: "An input with goX is a stick for seat 0's controller; one with thr is the raw seam."

- [ ] **Step 5: Run**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/pilot.test.mjs test/possess.test.mjs test/net.kinds.test.mjs test/protocol.test.mjs test/golden.test.mjs test/net.driven.test.mjs`
Expected: PASS. The goldens are unchanged. Do not re-bless: a golden diff here is a bug.

Run Tractor's whole `npm test` with the cap command, from `/home/smiller/projects/four43/four43-local-players/games/tractor-pickup`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/tractor-pickup/src/game/net.js games/tractor-pickup/src/sim/pilot.js games/tractor-pickup/src/sim/actions.js games/tractor-pickup/src/sim/game.js \
  games/tractor-pickup/src/sim/trains.js games/tractor-pickup/src/game/farm.js games/tractor-pickup/src/net/kinds.js games/tractor-pickup/src/net/entities.js \
  games/tractor-pickup/src/net/protocol.js games/tractor-pickup/test/possess.test.mjs games/tractor-pickup/test/pilot.test.mjs games/tractor-pickup/test/golden.test.mjs \
  games/tractor-pickup/test/mp.harness.mjs games/tractor-pickup/test/mp.engine.harness.mjs games/tractor-pickup/test/net.kinds.test.mjs games/tractor-pickup/test/protocol.test.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(tractor): the train is seat 0's pawn and replicates the stick; peers drive it through the pilot (lion-hawk C-2, I-4; NET_VERSION 5)"
```

---

### Task 9: Tractor on the engine join, player state and game state

**Files:**
- Modify:
  - `games/tractor-pickup/src/net/protocol.js`, `src/net/kinds.js`, `src/net/entities.js`
  - `src/net/host.js`, `src/net/guest.js` (full files below)
  - `src/net/players.js`, `src/net/session.js`
  - `src/game/net.js`, `src/game.sim.js`
- Test:
  - `test/join.test.mjs` (new), `test/mp.engine.harness.mjs`, `test/mp.harness.mjs` (N5)
  - `test/net.kinds.test.mjs`, `test/protocol.test.mjs`
  - `test/mp.repair.test.mjs`, `test/mp.engine.test.mjs`, `test/session.test.mjs`
  - `test/mp.test.mjs` (B4: one test re-expressed)
- All under ROOT `/home/smiller/projects/four43/four43-local-players` (`games/tractor-pickup/`).

**Interfaces:**
- Consumes:
  - `defineGame({ player, gameState, net: { join: 'engine', maxPlayers, maxSeats } })`;
  - `engine.players` entries `{ number, seat, local, away, active, join, coat, trim, barn, quiet }`;
  - `engine.gameState`;
  - `world.net.self`, `world.net.bindings` (host), `world.net.numbersOf(peer)` (host).
- Produces:
  - `PLAYER_FIELDS = { coat, trim, barn, quiet }`, `GAME_FIELDS = { seed, farm, next }`;
  - `createHostSync({ engine, … })`, `createGuestSync({ engine, … })`. The UI-facing `you` and `players` are unchanged;
  - `entryOf(list, n)`;
  - `createSession` requires `bind`.
- Retired: the `hello` and `welcome` messages, `freeNumber`, `byPeer`, the `PLAYER` kind, `SEND`, the guest's hello retry, and the host's repeated welcome.
- Kept: the guest's `hostAway` / `hostBack` listeners (M-40, `guest.js:91-92`). A test raises them as the port does, with `g.engine.command('net.peer', { event: 'hostAway', at: w.now })` (`port.js:53` issues exactly this command), so host frames keep flowing while the server says the host is away.

- [ ] **Step 1: Write the failing tests**

In `test/mp.engine.harness.mjs`, add to the returned object: `blackout: (s, o) => w0.blackout(s, o),`.

```js
// test/join.test.mjs
// Tractor on the engine join (lion-hawk N-19..N-25, plan 5): the engine numbers the guests and keeps the roster; the farm is the
// host's lh.game record; no hello or welcome message goes on the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';

test('the engine numbers guests 2..4 and refuses a fifth page (full); the syncs keep a row per player; no hello or welcome JSON', async () => {
  const w = await engineWorld({ seed: 21, guests: 4 }), json = [];
  const drop = w.hub.drop; w.hub.drop = (from, to, d) => { if (d && typeof d === 'object' && 't' in d) json.push(d.t); return drop?.(from, to, d) ?? false; };
  w.seconds(2);
  assert.deepEqual(w.guests.map(g => g.sync.you), [2, 3, 4, 0]);
  assert.ok(w.guests[3].events.some(e => e.type === 'player.refused' && e.reason === 'full'), 'the fifth page hears why');
  assert.deepEqual(w.host.engine.players.map(p => p.number), [1, 2, 3, 4]);
  assert.deepEqual([...w.host.sync.players.map.keys()].sort(), [2, 3, 4]);
  for (const g of w.guests.slice(0, 3)) assert.equal(w.host.sync.players.map.get(g.sync.you).peer, g.net.id, 'the row follows its transport peer (bindings)');
  assert.ok(!json.includes('hello') && !json.includes('welcome'), `no game join messages: ${[...new Set(json)]}`);
});

test('a guest builds nothing until a frame from its host carries lh.game (farm 0 is no farm; review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 0, join: false });
  w.blackout(1.5, { kinds: ['lh.game'] }); const g = w.addGuest(); w.seconds(0.5);
  assert.equal(g.engine.world.net.self, 2, 'net.welcome numbered it'); assert.equal(g.sync.you, 0, 'but it has no farm yet');
  assert.equal(g.engine.scene.state.gen, 1, 'its solo farm is still the only one built');
  w.seconds(3);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 21); assert.equal(g.engine.gameState.farm, w.host.engine.gameState.farm);
});

test('paint is a guest→host message; the host writes it into the player fields and every peer reads it (N-22)', async () => {
  const w = await engineWorld({ seed: 21, guests: 2 }); w.seconds(1);
  w.guests[0].sync.setPaint({ body: 'rainbow', trim: 'purple' }); w.seconds(1);
  for (const d of w.devs) { const r = d.engine.players.find(p => p.number === 2); assert.deepEqual([r.coat, r.trim], ['rainbow', 'purple'], d.name); }
  assert.deepEqual(w.guests[1].sync.players.map.get(2).paint, { body: 'rainbow', trim: 'purple' }, 'the other guest draws it');
});
```

`engineWorld({ guests: 0, join: false })`: check `mp.engine.harness.mjs`. With `join: false` it makes the host only (`peers: join ? 1 + guests : 1`).

Edit `test/net.kinds.test.mjs`:
- import: drop `PLAYER` (`import { KINDS, ANIMAL, TREE, TRAIN, animalRecord } from '../src/net/kinds.js';`); delete the `const roster = …` line;
- first test: title `'NET_VERSION 5 and three kinds with today\'s codes and id ranges (the player is the engine\'s lh.player)'`; kinds assertion `[['animal', 1], ['tree', 2], ['train', 4]]`;
- every `mirrorHost(w, g, roster())` becomes `mirrorHost(w, g)`;
- in the mirrorHost test, delete `assert.deepEqual(net(w, 'player').map(e => e.netId), [1]);` and change its title to `'mirrorHost: one entity per live animal; trees gain a net part; ids are World-unique (D7)'`;
- in the engine-world test, change `assert.equal(gw.with('net').filter(e => e.net === 'player').length, 2);` to `assert.deepEqual(w.guests[0].engine.players.map(p => p.number), [1, 2]);`, and its title's `trees and roster as replicated entities` to `trees as replicated entities and the roster as lh.player`.

Edit `test/protocol.test.mjs`:
- in the good-guest list, delete `{ t: 'hello', v: NET_VERSION, paint }, `;
- in the bad-guest list, change `{ t: 'hello', v: NET_VERSION }, { t: 'welcome', v: 1 }` to `{ t: 'hello', v: NET_VERSION, paint }, { t: 'welcome', v: 1 }`;
- replace the third test with

```js
test('host messages are checked the same way; the join, the farm, the herd, trees and players are not messages any more (M-24, M-50, N-19, N-22)', () => {
  for (const m of [{ t: 'tree', id: 3 }, { t: 'regrow' }, { t: 'horn', n: 1 }, { t: 'help', id: null }, { t: 'help', id: 7 }]) assert.deepEqual(checkFromHost(m), m, m.t);
  for (const m of [{ t: 'welcome', v: NET_VERSION, seed: 42, farm: 3, you: 2, next: 30 }, { t: 'horn', n: 9 }, { t: 'hello', v: NET_VERSION, paint },
    { t: 'claimed', ok: [1], no: [], epochs: [[1, 4]] }, { t: 'players', list: [] }]) assert.equal(checkFromHost(m), null, JSON.stringify(m).slice(0, 60));
  assert.equal(NET_VERSION, 5, 'M-27: the wire changed (plan 5: the engine join, the train replicates the seat\'s stick)');
});
```

Edit `test/mp.engine.test.mjs`: in the tape test, change `'guest.welcome'` to `'net.welcome'`, and the first test's title `'a guest gets the welcome as a command …'` to `'a guest gets the engine\'s welcome and builds the host farm (lh.game) through ctx.load (M-1, M-24, #80)'`.

Edit `test/mp.repair.test.mjs`:
- delete the whole test `'a lost hello: …'`. The engine's N-19 hello retry is covered by `lion-hawk-engine/test/net-join.test.mjs`. Then delete the `NET_VERSION` import, and `countCalls` if it is now unused.
- In `'a lost new-farm welcome: …'`:
  - change the title to `'a lost new-farm record: lh.game comes in each host keyframe, so the guest is on the new farm within 3 s; a guest in its show is not rebuilt twice (M-19, M-58, N-22)'`;
  - replace `w.hub.drop = (from, to, d) => to === g.net.id && d?.t === 'welcome'; // the new farm's welcome to g is lost` and `hostFarm(w, 98); w.seconds(0.2); w.hub.drop = null;` with `w.blackout(0.2, { kinds: ['lh.game'] }); hostFarm(w, 98); w.seconds(0.2); // the new farm's record is lost`;
  - change the message `'the welcome is lost'` to `'the record is lost'`;
  - change `'a repeated welcome does not build the farm again'` to `'a repeated record does not build the farm again'`;
  - change `'built once: the welcomes that came during the show do not build it again'` to `'built once: the records that came during the show do not build it again'`.
  - Add `blackout` to `mpWorld`. `mp.harness.mjs` re-exports `engineWorld` as `mpWorld`, so the harness change above covers it.

Edit `test/session.test.mjs`:
- replace the `import { testGame } from './helpers/world.mjs';` line with `import { createPlayers } from '../src/net/players.js';`;
- replace `setup` with

```js
// the engine path's bind (the only path since lion-hawk 0.13, plan 5): a stand-in bound sync per room with the syncs' you and players
const setup = (fh, extra = {}) => { let changes = 0; const made = [];
  const bind = ({ role }) => { const y = { you: role === 'host' ? 1 : 0, players: createPlayers() }; made.push(y); return { sync: () => y, close(then) { then?.(); } }; };
  const s = createSession({ Handshake: fh.Handshake, bind, getPaint: () => ({ body: 'red', trim: 'yellow' }), onChange: () => changes++, retryMs: 5, ...extra });
  return { s, made, get changes() { return changes; } };
};
```

- in `'join: no welcome 10 s after joining …'`, replace the `peer.emit('message', { t: 'welcome', … }, { reliable: true });` line with `t.made.at(-1).you = 2; // the engine's net.welcome numbered this page (N-19)`;
- in `'host: when the host sync cannot be made …'`, change `setup(fh, { getGame: () => { throw new Error('no game'); } })` to `setup(fh, { bind: () => { throw new Error('no game'); } })`.

Edit `test/mp.test.mjs` (B4). The new farm now comes only in `lh.game` frames, so the old test, which silenced the host's frames and still expected the new farm from the JSON welcome, fails by design. Replace the whole test `'a new farm while the host is silent keeps boops paused (M-19, M-40)'` (`mp.test.mjs:493-499`) with:

```js
test('a new farm while the host is away keeps boops paused; with no host frames there is no new farm (M-19, M-40)', async () => {
  const w = await mpWorld({ seed: 80 }); w.seconds(1);
  // the server's host_away / host_back, raised on the guest as its port does (net.peer): the host's frames keep flowing
  const g = w.guests[0], server = event => g.engine.command('net.peer', { event, at: w.now });
  server('hostAway'); w.seconds(0.1); assert.equal(g.game.boopsPaused, true);
  hostFarm(w, 81); w.seconds(3); // lh.game rides the host's frames (M-19: within 2 s), and the farm builds through ctx.load
  assert.equal(g.game.farm.seed, 81); assert.equal(g.game.boopsPaused, true, 'the new game is paused too'); assert.equal(g.sync.players.map.get(1).away, true);
  server('hostBack'); w.seconds(0.3); assert.equal(g.game.boopsPaused, false);
  const talk = quiet(w, w.host, { json: true }); hostFarm(w, 82); w.seconds(3);
  assert.equal(g.game.farm.seed, 81, 'M-19: no frame from the host, no new farm (its JSON messages carry none)');
  talk(); w.seconds(3); assert.equal(g.game.farm.seed, 82, 'the next frames bring it');
});
```

Edit `test/mp.harness.mjs` (N5): `quiet()`'s registry is built from Tractor's own `KINDS`, which has no `lh.*` kinds, so with `{ ahead: true }` a host frame that carries `lh.player` or `lh.game` decodes to `null`. It is then dropped, which is what the tests want, but only by accident. Build it from the engine's kinds, so the decode knows every kind on the wire (behaviour is unchanged):
- add `import { tractorGame } from '../src/game.sim.js';` after the `../src/net/protocol.js` import;
- drop `KINDS` from the `../src/net/kinds.js` import (nothing else in the file uses it);
- replace `const REG = createRegistry(KINDS, { maxSender: MAX_PLAYERS });` with `let REG = null; // the engine's kinds (with lh.player and lh.game), made at the first ahead check`;
- in `quiet`, replace `try { return !(decodeFrame(d.slice(0), REG)?.time > w.now); }` with `try { REG ??= createRegistry(tractorGame().net.kinds, { maxSender: MAX_PLAYERS }); return !(decodeFrame(d.slice(0), REG)?.time > w.now); }`.

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/join.test.mjs test/net.kinds.test.mjs test/protocol.test.mjs test/mp.test.mjs`
Expected: FAIL:
- with the manual join, the host has no roster entries 2..4 and `lh.game` is missing;
- the kinds still include `player`;
- `checkFromHost` still passes a welcome;
- in `mp.test.mjs`, only the new test fails: the JSON welcome still brings farm 82 while the host's frames are dropped, so `farm.seed` is 82, not 81.

- [ ] **Step 3: Protocol, kinds, entities, players, config**

`src/net/protocol.js`:
1. In `TO_HOST`, delete `hello: { v: F.uint(1, NET_VERSION, NET_VERSION), paint: PAINT }, `.
2. In `TO_GUEST`, delete the `welcome: { … }, // M-27: …` entry.
3. Change the `TO_GUEST` comment to `// M-24: the join is the engine's (N-19); the farm is game state, the players player state (lh.player, lh.game); the herd, trees and trains are replicated objects (kinds.js)`.
4. Append

```js
// [N-22] Tractor's player state on the engine's lh.player record (beside its seat, away, active and join): the paints (coat: the
// body paint, M-2; the host writes them from a guest's paint message), barn (this player's show has the barn, M-71) and quiet
// (the host's silence watchdog says that device stopped, M-39; away is the engine's, from the server)
export const PLAYER_FIELDS = { coat: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES), barn: F.bool(), quiet: F.bool() };
// [N-22] Tractor's game state on lh.game: the host's farm (M-1, M-19): its seed, its number (from 1; 0 = no farm yet) and its herd size (the guests' id guard)
export const GAME_FIELDS = { seed: F.uint(4), farm: F.uint(4), next: F.uint(2, MAX_ID + 1) };
```

`src/net/kinds.js`:
- delete the whole `export const PLAYER = kind({ … });` (3 lines);
- change `KINDS` to `[ANIMAL, TREE, TRAIN]`;
- delete `PAINT_NAMES` from the protocol import;
- change the header's "Host kinds: animal, tree, player" to "Host kinds: animal, tree (the players are the engine's lh.player, plan 5)".

`src/net/entities.js`:
- `maps` keeps `animal` only: `{ serial: world.serial, animal: new Map() }`;
- `mirrorHost(world, game)`: delete the `roster` parameter, the `seen` set and the two player loops;
- `unmirrorHost`: delete `for (const e of m.player.values()) world.despawn(e);` and `m.player.clear();`;
- header: "each live herd animal is a bodiless net entity" (drop "and each roster row").

`src/net/players.js`: delete the `export const SEND = …` line.

`src/game/net.js`:
1. In `netConfig`, replace `join: 'manual', // plan 3 B3 stopgap …` with

```js
  join: 'engine', maxPlayers: MAX_PLAYERS, maxSeats: 1, // [N-19] the engine's join: guests get 2..4, one tractor per page; rejoinSeconds stays 60 (B6)
```

2. In `netCommands`:
   - replace `registry = createRegistry(KINDS, { maxSender: MAX_PLAYERS })` with `registry = null`, and change `const` to `let` for it alone: `const { clock } = api, warn = createWarnOnce(); let registry = null; // the engine's kinds (with lh.player, lh.game), made at the first frame`;
   - in `'net.frame'`, before `at(n, d.at, …`, add `registry ??= createRegistry(e.game.net.kinds, { maxSender: MAX_PLAYERS });`.
3. In `'net.open'`, change `const o = { game: s.game, …` to `const o = { engine: e, game: s.game, …`.
4. Delete `KINDS` from the imports only if nothing else in the file uses it (`netConfig`'s default still does: keep it).

`src/game.sim.js`:
- import `PLAYER_FIELDS, GAME_FIELDS` from `'./net/protocol.js'`;
- in `defineGame({ … })`, the line `id: 'tractor-pickup', …, actions: ACTIONS, start: 'farm', // hz: the physics step (DT)` ends in a comment (N12). Add a new line after it, before `defs:`: `    player: PLAYER_FIELDS, gameState: GAME_FIELDS, // [N-22] lh.player and lh.game (plan 5)`.

`src/net/session.js`:
1. Delete the `createHostSync` and `createGuestSync` imports.
2. Change the signature to drop `getGame, onFarm,`, and as the function's first line add `if (typeof bind !== 'function') throw new Error('session: bind is required (the engine path; lion-hawk 0.13)');`.
3. In `host()`, change `if (bind) bound = bind({ role: 'host', transport: link(r) }); else sync = createHostSync({ … });` to `bound = bind({ role: 'host', transport: link(r) });`.
4. In `confirmJoin()`, change `let b = null; if (bind) b = bound = bind({ role: 'guest', transport: link(r) }); else sync = createGuestSync({ … });` to `const b = bound = bind({ role: 'guest', transport: link(r) });`, and delete `const y = sync;`. In the `waitT` check, change `bound === b && sync === y && room === r` to `bound === b && room === r`.

- [ ] **Step 4: Write `src/net/host.js`**

Keep, unchanged, the constants block from `export const CLAIM_RANGE` to `export const BARN_HOLD_MS` and its two-clocks comment, plus `follow`, `tractorOf`, `grantBarn`, `stepBarn`, `hostGate`, `repair`, `rides`, `silent`, `freeUp`, `owned`, `guestAt` and `startTrust`. `silent` (today `host.js:93`, beside the old peer listeners) moves up with the other kept helpers, before `writeState`, which uses it (N4). Replace the header comment, the imports, `createHostSync`'s first lines, the handlers, the peer listeners and the sync object, so that the file reads:

```js
// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57; lion-hawk 3l, local players plan 5). The host is the authority for the animals,
// the trees and the players; each guest for its own train (M-22). The engine runs the join (N-19: numbers 2..4, the roster, away, the
// inactive list and rejoin) and replicates player state (lh.player: coat, trim, barn, quiet) and game state (lh.game: the farm's seed,
// number and herd size); this sync writes those fields and keeps one row per active guest player for the game rules. The World net
// part replicates the herd and trees (mirrorHost) and the trains (driven replicas) and relays each guest's train to the others (C-3).
// Requests from guests come as JSON events; their results go back as replicated state (M-24). Bad or too many messages are dropped
// (M-50); a handler error never reaches the game (M-44).
import { checkFromGuest, createRate, fitsJson, createWarnOnce, SILENT_MS, RATE, MAX_ID } from './protocol.js';
import { createPlayers, placeCarried, riderAt } from './players.js';
import { mirrorHost, unmirrorHost, localTrain } from './entities.js';
import { spawnPoint } from '../sim/spawn.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';
import { POWER } from '../sim/tractor.js';

// … the constants block, unchanged …

// player n's roster entry (engine.players: number order, at most MAX_PLAYERS entries)
export const entryOf = (list, n) => { for (let i = 0; i < list.length; i++) if (list[i].number === n) return list[i]; return null; };

// Two clocks: clock() is wall time, for every rate limit and the silence watchdog (the frame clock stops while the page sleeps); nowMs is the
// frame clock, for sending and for the interpolation buffers (sample(now) reads them in the same clock).
export function createHostSync({ engine, game, world, net, paint, clock }) {
  if (!clock) throw new Error('host sync: clock required'); if (!engine) throw new Error('host sync: engine required');
  const players = createPlayers(), rates = new Map(), out = [], bumper = createBumper(world), warn = createWarnOnce();
  const missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  const G = engine.gameState; // [N-22] lh.game { seed, farm, next }
  let farm = 1, closed = false, myPaint = { ...paint }, lastBefore = null; // farm: this host's farm number, from 1 (0 in lh.game = no farm yet)
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.map.values()) if (p.n !== except && p.peer) net.send(p.peer, m, rel); };
  const barn = { holder: 0, since: 0, holdMs: BARN_HOLD_MS, hostWait: null }; // M-70
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n); // only when a player leaves
  const herdSize = () => { game.herd.setPlayers(1 + players.map.size); game.herd.respawn(); }; // M-62: a joiner brings more animals; one who leaves takes none
  // … freeUp, guestAt, startTrust, follow, tractorOf, grantBarn, stepBarn, hostGate, silent: unchanged …
  const dropPlayer = n => { for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } players.drop(n, out); }; // M-39: its train poofs, its animals go with it
  // [N-21] the engine's roster decides who is in the room. Each step: one row per active guest player (a new row for a number given
  // again: its join changed, M-39), following its transport peer (a takeover moves it, N-23), its away and its paint; the row of a
  // player who left (inactive or expired, N-23) goes. A rejoin within rejoinSeconds is a new row with the same number and record.
  function reconcile() {
    const list = engine.players;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]; if (r.local) continue;
      let p = players.map.get(r.number);
      if (p && (!r.active || p.join !== r.join)) { dropPlayer(r.number); herdSize(); p = undefined; }
      if (!r.active) continue;
      if (!p) { p = players.ensure(r.number); p.join = r.join; startTrust(p); herdSize(); }
      p.peer = world.net.bindings.get(r.number)?.peer ?? null; p.serverAway = r.away;
      if (p.paint.body !== r.coat || p.paint.trim !== r.trim) p.paint = { body: r.coat, trim: r.trim }; // M-2: what handlers.paint wrote
    }
    for (const n of players.map.keys()) if (!entryOf(list, n)?.active) { dropPlayer(n); herdSize(); }
  }
  // [N-22] what the host writes for everyone, after its step: its own paint, each player's barn and quiet, and the farm
  function writeState() {
    const list = engine.players;
    for (let i = 0; i < list.length; i++) {
      const r = list[i], p = players.map.get(r.number);
      if (r.local) { r.coat = myPaint.body; r.trim = myPaint.trim; r.quiet = false; } else r.quiet = !!p && silent(p);
      r.barn = barn.holder === r.number;
    }
    G.seed = game.farm.seed; G.farm = farm; G.next = Math.min(game.herd.animals.length, MAX_ID + 1);
  }
  const handlers = {
    paint(p, m) { const r = entryOf(engine.players, p.n); if (r) { r.coat = m.paint.body; r.trim = m.paint.trim; } }, // M-2, [N-22]: the guest asks, the host writes its player fields (schema-checked names, M-50)
    // … claim, release, delivered, tree, regrow, horn, help: unchanged …
  };
  net.on('peer', id => { if (!closed) rates.set(id, { fast: createRate(), rel: createRate(), key: createRate(RATE.guestKeys) }); }); // C-3, M-50: per transport peer
  net.on('peerLeft', id => { rates.delete(id); }); // the engine moves its players to the inactive list (N-23); reconcile drops their rows
  const playerOf = from => { if (closed) return null; const n = world.net.numbersOf(from)[0]; return (n && players.map.get(n)) || null; }; // [N-20] one seat per page (maxSeats 1)
  function message(from, data) {
    try {
      const p = playerOf(from); if (!p) return;
      if (!rates.get(from)?.rel.allow(clock())) return; // M-50: in wall time
      if (!fitsJson(data)) return; // M-50
      const m = checkFromGuest(data); if (!m) return;
      handlers[m.t]?.(p, m);
    } catch (e) { warn('net message', e); } // M-44
  }
  function frame(from, f) { // a frame the engine has applied (its port and built-in checked the sender, N-24): C-4 follows what the guest reports
    try {
      const p = playerOf(from); if (!p || f.sender !== p.n) return; p.heardAt = clock();
      const g = f.groups.get('train'), rec = g?.records.get(p.n); if (rec) follow(p, rec.body.p);
    } catch (e) { warn('net message', e); } // M-44
  }
  net.on('message', (from, data, reliable) => message(from, data, reliable));
  // … rides, repair: unchanged …
  const sync = {
    players, handlers, out, barn, message, frame,
    get game() { return game; }, you: 1, get barnHolder() { return barn.holder; },
    before(now) {
      reconcile();
      for (const p of players.map.values()) p.away = !!p.serverAway || silent(p); // M-39: the roster, the drawing and the dodges use it
      // … the rest of before(): unchanged from `players.refresh(world, out);` to `return out.splice(0);` …
    },
    after(events, now) {
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++;
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-15, M-26, M-17, M-8
      writeState();
      if (!players.map.size) return; // nobody to send to yet: a joiner's first keyframe has everything
      mirrorHost(world, game); // the herd and trees as net entities; the engine sends their records and lh.player, lh.game
    },
    // a new farm (its World was cleared: the old farm's entities are gone, the guests' trains come back as replicas, CI-15)
    setGame(g) { game = g; game.barnGate = hostGate; farm = ((farm + 1) >>> 0) || 1; missing.clear(); herdSize(); localTrain(world, game, 1); players.reset();
      for (const p of players.map.values()) startTrust(p); }, // M-19 (the guests get the farm from lh.game), C-4
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17
    delivered() {}, requestHelp() {},
    close() { closed = true; try { if (!world.disposed) unmirrorHost(world, game); } catch (e) { warn('net close', e); } game.barnGate = null; game.barnWait = 0; barn.holder = 0;
      for (const n of [...players.map.keys()]) dropPlayer(n); rates.clear(); game.others = []; herdSize(); }, // M-39: the host keeps playing alone and its herd refills
  };
  game.barnGate = hostGate;
  return sync;
}
```

The `// …` lines in this block mean "copy that code from the current file as it is". They name exactly which functions keep their bodies. No other line of the current file survives. In particular, these all go: `byPeer`, `rows`, `row`, `roster`, `welcome`, `freeNumber`, `helloed`, `joins`, `lastKey`, `gone`, the `hello` handler, the `peerAway`/`peerBack` listeners and the old `peer` listener.

- [ ] **Step 5: Edit `src/net/guest.js`**

1. Header: replace "replicates the host's animals, trees and players" with "replicates the host's animals and trees, the engine's roster (lh.player) and the host's farm (lh.game, plan 5)".
2. Imports:
   - from `./protocol.js`, drop `NET_VERSION` and `MAX_PLAYERS`;
   - add `import { entryOf } from './host.js';`.
3. Delete `const HELLO_MS = 2000; …`.
4. Change the signature to `export function createGuestSync({ engine, game, world, net, paint, onFarm, clock }) { if (!clock) throw new Error('guest sync: clock required'); if (!engine) throw new Error('guest sync: engine required');`.
5. Replace the `let you = 0, farm = -1, helloAt = -Infinity, …` line with

```js
  let you = 0, farm = 0, hostNext = 0, hostPeer = null, nowMs = 0, alone = false, myPaint = { ...paint }, deferred = null, building = false; // building: onFarm returned null (#80)
  let hostGame = false; // a frame from this room's host has carried lh.game: until then engine.gameState is not the host's (pollWelcome)
  const G = engine.gameState;
```

6. Delete `const hello = () => { … };`.
7. Replace `applyRoster` with

```js
  function applyRoster() { // M-22, [N-21]: the other players from the engine's roster (the host's lh.player records)
    const list = engine.players;
    for (let i = 0; i < list.length; i++) {
      const r = list[i], n = r.number; if (n === you || r.local || !r.active) continue;
      const old = players.map.get(n); if (old && old.join !== r.join) players.drop(n, out); // M-39: its number was given again: a new player
      const p = players.ensure(n); p.join = r.join; if (p.paint.body !== r.coat || p.paint.trim !== r.trim) p.paint = { body: r.coat, trim: r.trim };
      p.away = r.away || r.quiet || (n === 1 && paused);
    }
    for (const p of players.map.values()) { const r = entryOf(list, p.n); if (!r?.active || r.local) players.drop(p.n, out); }
  }
```

8. In `repair()`, replace `const me = store.get('player', you); …` with `const me = entryOf(engine.players, you); if (me && (me.coat !== myPaint.body || me.trim !== myPaint.trim)) toHost({ t: 'paint', paint: myPaint }); // a lost paint (M-2)`.
9. Replace `applyWelcome` with

```js
  function applyWelcome(m) {
    if (!you) lastFast = clock(); // the watchdog starts with the first welcome
    you = m.you; farm = m.farm; hostNext = m.next;
    toHost({ t: 'paint', paint: myPaint }); // M-2, [N-22]: this player's paint; the host writes it into its player fields (it rode in hello before plan 5)
    const g = onFarm(m.seed, m.you); // M-1: always rebuild from the host's seed
    if (g) useFarm(g); else { deferred = m; building = true; } // #80: the farm is building (ctx.load); farmReady applies it
  }
  function welcome(m) { // a new number or farm (M-1, M-19); one this sync has, or one waiting for the show, changes nothing
    if (you && m.you === you && m.farm === farm) return; if (deferred && deferred.farm === m.farm) return;
    if (!building && ['arrive', 'show', 'reward'].includes(game.mode) && you) { deferred = m; return; } // M-19: after the show
    applyWelcome(m);
  }
  // [N-19], [N-22]: the engine's net.welcome numbers this page (world.net.self) and the host's lh.game record names its farm. Before
  // a frame from this host carried lh.game, engine.gameState is a solo page's or an earlier room's: nothing is built from it.
  function pollWelcome() {
    const n = world.net.self; if (!n || !hostGame || !G.farm) return;
    if (you === n && farm === G.farm) return; if (deferred && deferred.farm === G.farm) return;
    welcome({ seed: G.seed, farm: G.farm, you: n, next: G.next });
  }
```

10. In `handlers`, delete the `welcome(m) { … },` entry (two lines).
11. Change `net.on('peer', id => { hostPeer = id; hello(); });` to `net.on('peer', id => { hostPeer = id; }); // the engine says hello (N-19)`.
12. In `frame(from, f)`, replace `if (from !== hostPeer || alone || !you) return; lastFast = clock();` with `if (from !== hostPeer || alone) return; if (f.groups.has('lh.game')) hostGame = true; if (!you) return; lastFast = clock();`. Also change `if (f.groups.has('player')) applyRoster();` to `if (f.groups.has('lh.player')) applyRoster();`.
13. Replace `barnHolder` with `const barnHolder = () => { const list = engine.players; for (let i = 0; i < list.length; i++) if (list[i].barn && list[i].active) return list[i].number; return 0; }; // M-71: the host's player state says whose show has the barn`.
14. In `before(now)`, replace `nowMs = now; if (!you) { if (hostPeer && clock() - helloAt >= HELLO_MS) hello(); return out.splice(0); }` with `nowMs = now; if (!alone) pollWelcome(); if (!you) return out.splice(0);`.
15. ~~Delete the line `try { world.net.self = you; } …`~~ Skip (N8): that line is in the old `applyWelcome`, which item 9 already replaced. Check with `grep -n "net.self = you" src/net/guest.js`, which must print nothing.

- [ ] **Step 6: Run**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/join.test.mjs test/net.kinds.test.mjs test/protocol.test.mjs test/mp.engine.test.mjs test/mp.repair.test.mjs test/session.test.mjs test/session.bind.test.mjs test/possess.test.mjs test/mp.test.mjs`
Expected: PASS.

Run Tractor's whole `npm test` with the cap command, from `/home/smiller/projects/four43/four43-local-players/games/tractor-pickup`.
Expected: PASS. If any other file still fails, fix it the way these rulings say, and do not change the game's behaviour. The cases are:
- a test that sent or dropped `hello`/`welcome` JSON now uses the engine join, or `blackout` of `lh.game`;
- a test that read `store.get('player', n)` now reads `engine.players`;
- a test that called `mirrorHost(w, g, roster)` now calls `mirrorHost(w, g)`.

Add every file you touch this way to the Step 7 `git add` list and to the commit message body.

Run `test/net.peers.browser.mjs`, then `test/e2e.browser.mjs`, one at a time:
```bash
cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && for f in test/net.peers.browser.mjs test/e2e.browser.mjs; do
  systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 node --max-old-space-size=1024 --test "$f"; done
```
Expected: PASS (or only the known iPad show-tap failure).

- [ ] **Step 7: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/tractor-pickup/src/net/protocol.js games/tractor-pickup/src/net/kinds.js games/tractor-pickup/src/net/entities.js games/tractor-pickup/src/net/host.js \
  games/tractor-pickup/src/net/guest.js games/tractor-pickup/src/net/players.js games/tractor-pickup/src/net/session.js games/tractor-pickup/src/game/net.js \
  games/tractor-pickup/src/game.sim.js games/tractor-pickup/test/join.test.mjs games/tractor-pickup/test/mp.engine.harness.mjs games/tractor-pickup/test/net.kinds.test.mjs \
  games/tractor-pickup/test/protocol.test.mjs games/tractor-pickup/test/mp.repair.test.mjs games/tractor-pickup/test/mp.engine.test.mjs games/tractor-pickup/test/session.test.mjs \
  games/tractor-pickup/test/mp.test.mjs games/tractor-pickup/test/mp.harness.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(tractor): the engine join; paints, barn and quiet in player state, the farm in game state; host handlers by numbersOf (lion-hawk N-19..N-25)"
```

---

### Task 10: Tractor: `claimPeerKey`, the [T-25] state-home tests, spec rows

**Files:**
- Modify: `games/tractor-pickup/src/net/bind.js`, `src/main.js`, `docs/tractor-pickup-spec.md`, `test/mp.engine.harness.mjs`
- Test: `test/bind.test.mjs`, `test/state-homes.test.mjs` (new)
- All under ROOT `/home/smiller/projects/four43/four43-local-players` (`games/tractor-pickup/`).

**Interfaces:**
- Consumes: `claimPeerKey()` (`lion-hawk/net`), `createPort({ key })`, `mp().drop`, `mp().rejoin`.
- Produces:
  - `bindPort(engine, { role, transport, clock, key })`;
  - the harness gains `drop(d)` and `rejoin(d)`.

- [ ] **Step 1: Write the failing tests**

In `test/mp.engine.harness.mjs`, add to the returned object:

```js
    drop: d => { w0.drop(devs.indexOf(d)); }, // [T-22] the page vanishes (the hub reports peerLeft)
    rejoin: d => { const i = devs.indexOf(d); w0.rejoin(i); const p = w0.peers[i]; d.engine = p.engine; d.h = p.h; d.net = p.net; p.engine.events.on(e => { d.events.push(e); }); return d; }, // a reload: a new engine and transport, the same key
```

Append to `test/bind.test.mjs`:

```js
test('the page\'s claimed key reaches the host through bindPort (N-18; main.js awaits claimPeerKey before binding)', () => {
  const hub = createMemoryHub(), H = headless(tractorGame(), { args: ARGS }), G = headless(tractorGame(), { args: { ...ARGS, seed: 15 } });
  bindPort(H.engine, { role: 'host', transport: hub.host(), clock: () => hub.now });
  bindPort(G.engine, { role: 'guest', transport: hub.join(), clock: () => hub.now, key: [7, 7, 7, 7] });
  for (let i = 1; i <= 60; i++) { hub.tick(i * 1000 / 60); H.step(1); G.step(1); }
  assert.deepEqual(H.world.net.bindings.get(2)?.key, [7, 7, 7, 7]);
});
```

```js
// test/state-homes.test.mjs
// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): Tractor's coat, trim and barn are player state (lh.player) and
// survive a respawn (a new farm makes new trains) and a rejoin (a reload within rejoinSeconds); the farm is game state (lh.game)
// and reaches a late joiner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { PAINTS } from './mp.harness.mjs';

const entry = (d, n) => d.engine.players.find(p => p.number === n);

test('T-25: player state survives a respawn: after a new farm the paint stays and each seat possesses its new train (review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  const g = w.guests[0]; g.sync.setPaint(PAINTS[3]); w.seconds(1);
  const before = g.game.tractor.e;
  w.host.engine.command('farm.new', {}); w.seconds(3);
  assert.notEqual(g.game.tractor.e, before, 'the guest built the new farm');
  for (const d of w.devs) assert.deepEqual([entry(d, 2).coat, entry(d, 2).trim], [PAINTS[3].body, PAINTS[3].trim], d.name);
  for (const d of w.devs) assert.equal(d.engine.controllerOf(0).pawn, d.game.tractor.e, `${d.name} drives its new train`);
});

test('T-25: player state survives a rejoin: the reloaded guest gets number 2 and its lh.player record back (N-23, review focus)', async () => {
  // the guest's paint is its page's own (progress, saved on the device): argsOf gives guest 1 PAINTS[1], and a reload sends the same
  // paint again, as a real reloaded tab does. So the record must be the same at the rejoin (kept, not re-sent) and after it (what persists).
  const w = await engineWorld({ seed: 21, guests: 1 }), paint = PAINTS[1]; w.seconds(2);
  const g = w.guests[0];
  assert.deepEqual([entry(w.host, 2).coat, entry(w.host, 2).trim], [paint.body, paint.trim], 'the host wrote the page\'s paint');
  const join = entry(w.host, 2).join;
  w.drop(g); w.seconds(1);
  assert.equal(entry(w.host, 2).active, false, 'inactive, held for rejoinSeconds');
  assert.equal(w.host.sync.players.map.has(2), false, 'its train poofed on the host (M-39)');
  let back = null;
  w.host.engine.events.on(e => { if (e.type === 'player.joined' && e.rejoined) back = { number: e.number, coat: entry(w.host, e.number).coat, join: entry(w.host, e.number).join }; });
  w.rejoin(g); w.seconds(3);
  assert.deepEqual(back, { number: 2, coat: paint.body, join }, 'at the rejoin, before the new page says anything: the same number, paint and joining (the engine zero is red)');
  for (const d of w.devs) assert.deepEqual([entry(d, 2).coat, entry(d, 2).trim], [paint.body, paint.trim], `${d.name}: the paint persists 3 s after the rejoin (M-80)`);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 21, 'on the host\'s farm again');
  assert.ok(w.host.sync.players.map.has(2), 'a new row on the host (M-10)');
});

test('T-25: game state reaches a late joiner: the farm seed, number and herd size come in lh.game and it builds that farm', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  w.host.engine.command('farm.new', {}); w.seconds(2);
  const H = w.host.engine.gameState, seed = w.host.game.farm.seed;
  assert.deepEqual([H.seed, H.farm], [seed, 2]);
  const late = w.addGuest(); w.seconds(3);
  assert.deepEqual([late.engine.gameState.seed, late.engine.gameState.farm], [seed, 2]);
  assert.equal(late.game.farm.seed, seed); assert.equal(late.sync.you, 3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/bind.test.mjs test/state-homes.test.mjs`
Expected: FAIL. The bind test's key is the default random one (`bindPort` drops `key`). The state-home tests may already pass, because Task 9 built the behaviour: that is acceptable. Record in the ledger which of the three T-25 tests passed before Step 3 (S8). The bind test must fail.

- [ ] **Step 3: Implement**

`src/net/bind.js`:
- signature `export function bindPort(engine, { role, transport, clock, key }) {`;
- in `open`, `port = createPort(engine, { transport: t, role, clock, key });`;
- header: add "key: the page's claimed peer key (N-18; main.js awaits claimPeerKey()); without it the port makes one".

`src/main.js`:
- import `claimPeerKey` with `bridgeTransport, parseLag` from `'lion-hawk/net'`;
- as the first line inside `if (net) {`, add `const key = await claimPeerKey(); // [N-18] before any port: a duplicated tab gets a key of its own`;
- pass `key` in both `bindPort(engine, { role…, transport…, clock, key })` calls.

`docs/tractor-pickup-spec.md`: replace the whole rows M-19, M-22, M-24 and M-27 with

```markdown
| M-19 | New farm | When the host makes a new farm (P-8), each guest makes the same new farm. A guest in its show makes it after the show. A guest cannot make a new farm while it is in a room. The farm (seed, farm number, herd size) is game state (lion-hawk `lh.game`): the host sends it in each keyframe, so a guest that lost it gets it again within 2 s. A guest uses it only after a frame from its host has it. |
| M-22 | Replicated objects | All shared state is replicated objects. The kinds are: animal (authority: host; fields: type, golden, home (route or yard), state, owner, ownership number, position, rotation, animation, hidden, chick line), tree (authority: host; field: state), player (the engine's player state, lion-hawk `lh.player`, one record for each player number; authority: host; the engine's fields seat, away, active and join (which joining of that player number; a number given again is a new player), and this game's fields coat and trim (the paints), barn (this player's show has the barn, M-71) and quiet (the host gets no frames from that device, M-39)) and train (authority: the player; fields: the tractor, trailer and wagon positions and rotations, the input (the stick as a direction on the farm; each device turns it into throttle and steering with the pilot, C-1), mode (drive, show, held, or wait: in the barn and waiting for it, M-71), full, and the animals in its slots or in flight to it, by id and slot). Game state (lion-hawk `lh.game`) holds the farm (M-19); the delivery tally is not game state yet (lion-hawk §2.2's example, deferred). Game code registers its objects; it does not make network messages. A new kind of shared object in a later version is a new kind, not a new message. |
| M-24 | Event messages | On the reliable channel, JSON. They are requests and one-time effects, not state: claim, delivery, tree break, trees regrow, horn, paint, help request and answer, new farm. The result of a request comes back as replicated state. The engine makes the join (lion-hawk `net.hello`, `net.welcome`): it gives each guest a player number (2 to 4) and says hello again until the welcome comes. After its welcome, a guest sends its paint; the host writes it into that player's state. At each host keyframe, a guest sends delivery and paint again until the replicated state shows them. |
| M-27 | Game version | The game has a network version number (5 since game version 1.11.0). It increases when the network messages change. A device with a different number cannot join (Handshake refuses it). The join prompt (M-32) then says "Update the game on both devices". The engine's join also refuses a device with a different engine or different replicated kinds. |
```

After the `| M-41 |` row, add:

```markdown
| M-80 | Rejoin | When a guest reloads the page or loses its connection, the host keeps its player for 60 s. If the same tab joins again in that time, it gets the same player number and paint. Its tractor appears again as in M-10. A second tab is a different player. |
```

- [ ] **Step 4: Run**

Run: `cd /home/smiller/projects/four43/four43-local-players/games/tractor-pickup && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/bind.test.mjs test/state-homes.test.mjs test/join.test.mjs`
Expected: PASS.

Run Tractor's whole `npm test` with the cap command from `/home/smiller/projects/four43/four43-local-players/games/tractor-pickup`, then `test/net.peers.browser.mjs` and `test/e2e.browser.mjs` one at a time with the browser cap (the Task 9 Step 6 loop).
Expected: PASS, except the known iPad show-tap failure. This is the real-Chromium check of `claimPeerKey` with `navigator.locks` across two browser contexts.

- [ ] **Step 5: Commit**

```bash
git -C /home/smiller/projects/four43/four43-local-players add games/tractor-pickup/src/net/bind.js games/tractor-pickup/src/main.js games/tractor-pickup/docs/tractor-pickup-spec.md \
  games/tractor-pickup/test/mp.engine.harness.mjs games/tractor-pickup/test/bind.test.mjs games/tractor-pickup/test/state-homes.test.mjs
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "feat(tractor): the claimed peer key reaches the port; state-home tests for respawn, rejoin and a late joiner (lion-hawk N-18, T-25); spec M-19..M-27, M-80"
```

---

### Task 11: Engine 0.13.0: version, CHANGELOG, spec; merge and tag (ASK USER); push (ASK USER)

**Files:** Modify `src/version.js`, `package.json`, `CHANGELOG.md`, `docs/spec.md` (engine).

**Interfaces:** Produces `ENGINE_VERSION = '0.13.0'` and the local tag `v0.13.0`.

- [ ] **Step 1: Version and spec**
  - `src/version.js`: `export const ENGINE_VERSION = '0.13.0';`.
  - `package.json`: `"version": "0.13.0"`.
  - `docs/spec.md`:
    1. In the 2026-10-21 amendment line, replace `the rest is draft.` with `(plan 5): [T-25] in Tractor Pickup, Rally and Pig Pens. Released in 0.13.0.` Re-read the line first: plan 4 added its own part.
    2. Change `- **[T-25] State homes.**` to `- **[T-25] State homes.** (built, plan 5)`, and add after it:

```markdown
  - *Ruling (plan 5):* a game with no net part (Rally, Pig Pens) tests the offline half: player 1's record outlives the pawn changing and game state follows the sim; the rejoin and late-joiner halves apply to networked games (Tractor Pickup).
```

- [ ] **Step 2: CHANGELOG**

Insert above `## 0.12.0 — 2026-10-19`. Write the tag date if that is not 2026-10-21.

```markdown
## 0.13.0 — 2026-10-21

Local players (design: `docs/plans/2026-10-21-local-players-spec.md`; spec §4.6 [N-18]–[N-25], §5.5 [C-1]–[C-14], [I-4], [D-7], [T-22]–[T-25]): several people on one device, each with their own controllers and bindings, and that device one peer in an online room.

- Controllers and possession (plan 1): `engine.controllers`, `engine.controllerOf(seat)`, `engine.controller({ bot: true })`; `controller.possess(e)` / `unpossess()` with `controller.*` events; each step `lh.possess` copies a controller's input into its pawn's `e.input` (a net-made input object keeps its keys, buttons as `down`); seats join and leave with the recorded `lh.seat` command; tapes record input per seat. `engine.input` is seat 0's controller's input, so single-seat games are unchanged.
- Seats, devices and bindings (plan 2): `view.seats({ max, join, contexts })`, `view.localPlayers` (`lp.pad`, `lp.pads` as live `Gamepad`s, `lp.devices`, `lp.claim` / `lp.release`, `lp.lost`), `view.onSeat`, `view.unpaired()`, `view.gamepad(dev)`, `view.device(kind, { read })`; mapping contexts `view.context(name, { pads, keys, touch })` stacked per seat (`lp.contexts.add` / `remove`); player-mappable bindings and profiles (`lp.bindings`: `map`, `reset`, `capture`, `profile`) saved per profile and device id (`boot({ storage })`). Without `view.seats()` a page has one seat holding every device, as before.
- Network identity (plan 3): a peer key per tab (`peerKey`, `claimPeerKey`, `createPort({ key })`); the engine join (`net.hello`, `net.welcome`, `net.refused`, `net.seat`; `defineGame({ net: { join, admit, maxPlayers, maxSeats, rejoinSeconds, reasons } })`); the roster `engine.players` and `engine.gameState`, replicated as `lh.player` / `lh.game` and extended with `defineGame({ player, gameState })`; away, inactive players kept `rejoinSeconds` (60) and given back to the same key; several numbers per peer (`net.locals`, `world.net.bindings`, `world.net.numbersOf(peer)`); `mp()` per-seat inputs, `w.seat`, `w.rejoin`. **Behaviour changes:** `world.net.players` is gone (`bindings`); `net.join` defaults to `'engine'` (a game with its own join sets `'manual'`); solo, `net.self` is 1.
- Haptics, fake pads and the pad bench (plan 4): the engine stops rumble it would leave running (page hide, blur, a pausing overlay: a zero `dual-rumble` plus `reset()` for 20 frames) and resets a pad the first time it sees it; games tell it about their own moments with `view.haptics.stop('menu' | 'finish' | 'exit')` and send nothing while `view.haptics.paused`; `defineView({ haptics: { autoStop: false } })` turns it off (`view.haptics` is then `null`). Axis edges: an axis that reads exactly 0 presses on its first push, and a release toward centre is never a press. Playwright fake pads: `game.pad(index, state)`, `game.unplug(index)`, `game.haptics(index)`. `?debug=pads` opens the Gamepad Bench (`flags.debugs`).
- Games (plan 5): Tractor Pickup 1.11.0 on the engine join (NET_VERSION 5; its train is seat 0's pawn), Rally 0.6.0 and Pig Pens 2.3.0 on mapping contexts; [T-25] state-home tests in all three.
- Fixes: `keyWords` errors name the input's type and never echo it; `controllers.seat` and `of` work destructured; `controllers.renumber` checks 1..255; a bare `game.pad()` / `game.pad(undefined)` unplugs pad 0 again, as in 0.12 (`'1'`, `true` and `NaN` still throw).
```

- [ ] **Step 3: Run every engine suite** (the `bash <<'SH'` block of Task 2 Step 5: lists from `find`, so `test/kits/*` is in UNIT, S5)
Expected: PASS, with the same file and pass counts as Task 2 plus nothing new.

- [ ] **Step 4: Commit**

```bash
git -C /home/smiller/projects/four43/lion-hawk-engine add src/version.js package.json CHANGELOG.md docs/spec.md
git -C /home/smiller/projects/four43/lion-hawk-engine diff --cached --name-only
git -C /home/smiller/projects/four43/lion-hawk-engine commit -m "chore(release): lion-hawk 0.13.0 - local players, controllers, player and game state"
```

Then re-run Task 3 Step 1, so ROOT's archive copy is the release commit.

- [ ] **Step 5: ASK USER** — "Fast-forward `main` to `local-players` and tag `v0.13.0` locally?" After a yes (S7: no checkout, so the engine stays on `local-players`):

```bash
git -C /home/smiller/projects/four43/lion-hawk-engine fetch . local-players:main
git -C /home/smiller/projects/four43/lion-hawk-engine tag -a v0.13.0 local-players -m "lion-hawk 0.13.0: local players"
git -C /home/smiller/projects/four43/lion-hawk-engine log --oneline -1 --decorate local-players; git -C /home/smiller/projects/four43/lion-hawk-engine branch --show-current
```
Expected: `main`, `local-players` and `v0.13.0` on the release commit; the current branch is still `local-players`. `git fetch . local-players:main` updates `main` only as a fast-forward: if it refuses (`non-fast-forward`, so `main` has moved), stop and tell the user, and do not tag.

- [ ] **Step 6: ASK USER** — "Push `main`, `local-players` and the tag `v0.13.0` to github.com/four43/lion-hawk-engine? The games' re-pin (Task 12) installs from that tag." After a yes:

```bash
git -C /home/smiller/projects/four43/lion-hawk-engine push origin main local-players v0.13.0
```

---

### Task 12: Re-pin, re-bake, build and deploy the games (pushes ASK USER)

**Files:**
- Modify:
  - `games/{tractor-pickup,rally,pig-pens}/package.json`, `games/package-lock.json`
  - `games/*/baked/`
  - `games/tractor-pickup/docs/tractor-pickup-spec.md` (version lines), `games/rally/docs/spec/rally-spec.md` (Round 8 heading)
- Generated: `site/exp/{tractor-pickup,rally,piggie-game}/`.
- All in ROOT `/home/smiller/projects/four43/four43-local-players`. The user's checkout is touched only by Step 8's second ASK USER.

**Interfaces:** Every game pins `github:four43/lion-hawk-engine#v0.13.0`. npm 12 `allow-git=root` needs every game on the same tag. The deploy pushes `feat/local-players` to `origin/gh-pages`.

- [ ] **Step 1: Pins and versions**
  - Each of the three `package.json` files: `"lion-hawk": "github:four43/lion-hawk-engine#v0.13.0"`.
  - Versions: tractor-pickup `1.11.0`, rally `0.6.0`, pig-pens (`"name": "pigs"`) `2.3.0`.
  - Tractor spec header:
    - `Version: 1.14 (engine join and local players, lion-hawk 0.13)`;
    - `Date: 21 October 2026` (the tag date);
    - `Game version: 1.11.0`.
  - Rally spec: in the Round 8 heading, change `(lion-hawk 0.13, 2026-10-21)` to `(0.6.0, lion-hawk 0.13, 2026-10-21)`.

- [ ] **Step 2: Install from the tag** (needs Task 11 Step 6 done)

```bash
cd /home/smiller/projects/four43/four43-local-players/games
rm -rf node_modules/lion-hawk
npm install --allow-git=all && npm dedupe --allow-git=all
npm ls lion-hawk
npx --no-install esbuild --version
```
Expected: one hoisted `lion-hawk@0.13.0` (`github:four43/lion-hawk-engine#…`), no nested copies, no `invalid`; esbuild still prints its version (as in Task 3 Step 1; if not, stop and tell the user). Only ROOT's lock changes; the user's checkout keeps its own.

- [ ] **Step 3: Re-bake**

For each of `tractor-pickup`, `rally` and `pig-pens`, from `/home/smiller/projects/four43/four43-local-players/games/<g>`, with the bake cap from Global Constraints: `npx lion-hawk bake --check`, then `npx lion-hawk bake`, then `npx lion-hawk bake --check`. For example:
```bash
cd /home/smiller/projects/four43/four43-local-players/games/rally && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 env NODE_OPTIONS=--max-old-space-size=2048 npx lion-hawk bake --check
```
Expected:
- the first check reports the engine major.minor change (stale);
- the bake succeeds;
- the second check is clean;
- `git -C /home/smiller/projects/four43/four43-local-players diff --stat games/<g>/baked` shows only manifest and option-hash changes, plus any optimiser byte changes; `phys.json` is unchanged.

- [ ] **Step 4: Full tests on the tag**

For each game, from `/home/smiller/projects/four43/four43-local-players/games/<g>`: its whole `npm test` with the cap command, then each browser file alone with the browser cap:
- Tractor: `test/e2e.browser.mjs`, `test/net.peers.browser.mjs`;
- Rally: `test/e2e.browser.mjs`, `test/render.browser.mjs`, `test/built.browser.mjs`, `test/offline.browser.mjs`, then `test/mobile.mjs` (without `--test`, as in Task 5 Step 4);
- Pig Pens: `test/e2e.browser.mjs`.

Also run the workspace's own tests under the unit cap (S4). They include `workspace.test.mjs`, which is green only now that every installed engine matches its pin (N13):
```bash
cd /home/smiller/projects/four43/four43-local-players/games && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 node --max-old-space-size=512 --test --test-concurrency=4 test/
```
Expected: PASS, except the known Tractor iPad show-tap failure.

- [ ] **Step 5: Commit the pins and bakes**

```bash
git -C /home/smiller/projects/four43/four43-local-players status --short   # only these games' files
git -C /home/smiller/projects/four43/four43-local-players add games/package-lock.json games/tractor-pickup/package.json games/rally/package.json games/pig-pens/package.json \
  games/tractor-pickup/baked games/rally/baked games/pig-pens/baked games/tractor-pickup/docs/tractor-pickup-spec.md games/rally/docs/spec/rally-spec.md
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only
git -C /home/smiller/projects/four43/four43-local-players commit -m "build(games): lion-hawk 0.13.0 for all three games; re-bake; Tractor 1.11.0, Rally 0.6.0, Pig Pens 2.3.0"
```

- [ ] **Step 6: Build the site**

```bash
git -C /home/smiller/projects/four43/four43-local-players status --short site/exp   # must be empty before the build
unset TRACTOR_OUT RALLY_OUT PIGPENS_OUT   # N9: an *_OUT variable would send a build elsewhere (each game.config.js outEnv)
for g in tractor-pickup rally pig-pens; do (cd /home/smiller/projects/four43/four43-local-players/games/$g && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 env NODE_OPTIONS=--max-old-space-size=2048 npx lion-hawk build --site) || exit 1; done
git -C /home/smiller/projects/four43/four43-local-players status --short site/exp   # only site/exp/tractor-pickup, site/exp/rally, site/exp/piggie-game
```
Expected: each build logs its output directory, which is under `/home/smiller/projects/four43/four43-local-players/site/exp/` (`--site` resolves `../../site/exp` from the game directory). Only the three published directories change.

Open each built page once from ROOT's `site/` with a local server, started in the background and stopped after (`cd /home/smiller/projects/four43/four43-local-players/site && python3 -m http.server 8765`; visit `/exp/tractor-pickup/`, `/exp/rally/`, `/exp/piggie-game/`). Check that each loads with no console error. Tell the user that the iPad checks are theirs to do:
- Tractor host and guest on two devices (rejoin by reload);
- Rally rumble on a real pad;
- Pig Pens' thumb pad.

- [ ] **Step 7: Commit the site**

```bash
git -C /home/smiller/projects/four43/four43-local-players add site/exp/tractor-pickup site/exp/rally site/exp/piggie-game
git -C /home/smiller/projects/four43/four43-local-players diff --cached --name-only   # only paths under those three directories
git -C /home/smiller/projects/four43/four43-local-players commit -m "build(site): Tractor 1.11.0, Rally 0.6.0 and Pig Pens 2.3.0 on lion-hawk 0.13.0 - engine join, mapping contexts, state homes"
```

- [ ] **Step 8: Deploy from the worktree (ASK USER), then bring the user's checkout up (a second ASK USER)** (B3)

1. Bring `feat/local-players` up to origin, in ROOT only (its tree is clean, so no stash):

```bash
test -z "$(git -C /home/smiller/projects/four43/four43-local-players status --short)" || { echo 'worktree not clean'; exit 1; }
git -C /home/smiller/projects/four43/four43-local-players fetch origin gh-pages
git -C /home/smiller/projects/four43/four43-local-players log --oneline feat/local-players..origin/gh-pages   # empty: origin has nothing this branch lacks
# only if that printed commits:
git -C /home/smiller/projects/four43/four43-local-players rebase origin/gh-pages   # on any conflict: git -C /home/smiller/projects/four43/four43-local-players rebase --abort, stop and tell the user
git -C /home/smiller/projects/four43/four43-local-players log --oneline origin/gh-pages..feat/local-players   # what the deploy adds: R7 (857740e, or its rebased copy) and this plan's game and site commits
```

2. **ASK USER** — "Deploy: push `feat/local-players` to `origin/gh-pages`? It adds: (the commit list printed above). Your own checkout is not touched by this." After a yes:

```bash
git -C /home/smiller/projects/four43/four43-local-players push origin feat/local-players:gh-pages
```
Expected: the push succeeds as a fast-forward of `origin/gh-pages`. GitHub Actions then builds and publishes four43.com.

3. **ASK USER** (separately) — "Fast-forward your own `gh-pages` checkout (`/home/smiller/projects/four43/four43`) to the deployed commit? It changes only `games/` and `site/exp/` in your working tree; your uncommitted `site/`, `content/` and rally reference files are left as they are, and git refuses rather than overwrite a modified file." After a yes:

```bash
git -C /home/smiller/projects/four43/four43 status --short > /tmp/claude-1000/before-ff.txt
git -C /home/smiller/projects/four43/four43 merge --ff-only feat/local-players
git -C /home/smiller/projects/four43/four43 status --short | diff /tmp/claude-1000/before-ff.txt - && echo 'WIP unchanged'
```
Expected: `gh-pages` moves to the deployed commit and the status is unchanged. If `merge --ff-only` refuses, stop and tell the user why, and change nothing in their checkout. The two cases are:
- git would overwrite a modified or untracked file;
- step 1 rebased, so their `857740e` is not an ancestor of the deployed commit (the rebased R7 commit has the same change under a new SHA).

Never stash, rebase, reset or check out in the user's checkout.

---

## After this plan

- Rally follow-up: the "almost slip" brake warning in the left trigger (`trigger-rumble`; Chrome 126+, Bluetooth hidraw on Linux).
- The user plays on real devices: Tractor's two-device join, a reload rejoin within 60 s, and the barn lock; Rally's rumble feel; Pig Pens' thumb pad.
- Rally after a blur (N10): the engine stops the pads on blur, but Rally sends again on its next frame while the page is still visible ([C-14] lets a game override the blur stop). A follow-up decides whether Rally should hold off until focus comes back.
- Tractor's devices can become a mapping context later. That would give a second couch seat its own tractor once the game wants one (`maxSeats` > 1).

## Rulings carried

- **Plan 3 I2** (engine join carries no game payload) → Task 9: the seed is in `gameState`, paint is a guest→host message written into player fields, `numbersOf(peer)`, `join: 'engine'`. Task 10: `await claimPeerKey()`.
- **Plan 3 B3** (a Tractor bump before plan 5 needs `join: 'manual'`) → Task 8 Step 1 (stopgap), removed in Task 9.
- **Plan 3 final, parked** (`keyWords` echoes input) → Task 2.
- **Plan 1 final, parked** (`seat()` uses `this.of`; `renumber` has no range check) → Task 2. The plan 1 history doc naming `createControllers` is not folded (ruled "cost: none").
- **Plan 2 final, parked** (`seat.seen` not repeated on regain) → Task 2 spec note.
- **Plan 4 final** (`view.haptics.stop` / `paused`, autoStop default; `seats.forEachUnpaired`, `game.pad` argument check) → Task 4 (Rally's stops and pause gate). The fake-pad calls in Tasks 4 and 5 pass a number index. `forEachUnpaired` is not needed by any game here.

Ledger header and controller lines (`.superpowers/sdd/2026-10-21-local-players-5-migrate/progress.md`):
- **USER approval: Task 1** (commit exactly the 15 R7 files, local only) → Task 1, marked DONE as `857740e`.
- **USER approval: the train replicates the raw stick; the pilot runs on every peer; NET_VERSION 5** → Task 8 (unchanged).
- **Ruling: the game worktree** (`four43-local-players`, `feat/local-players`) → Header status, Decisions, Global Constraints (Repos), Task 1 Step 5 (done), Tasks 3–12 (every path, command and commit in ROOT).
- **Ruling: `game.pad()` / `pad(undefined)` unplugs pad 0** → Task 2 (same as S2).
- **Plan-writer rulings (accepted)** → Decisions table, unchanged (archive copy, `quiet` field, farms from 1, bind required, offline T-25, Rally's long gap, versions).
- **ASK USER points** → Task 11 Steps 5–6, Task 12 Step 8 (two asks: the push, then the user's checkout).
- **Controller: Task 1 done; worktree made with `npm ci --prefer-offline --allow-git=all`; esbuild's postinstall blocked** → Header status, Task 1, Task 3 Step 1 (`npx --no-install esbuild --version` before the first build), Task 3 reversal, Task 12 Step 2.

Pre-flight scan rulings:
- **B1** (`rumbleLab.js` and `kill()`) → Task 4 (Files, Interfaces, Step 1 `kill()` assertion, Step 3 `kill`, Step 4 lab edit, Step 7 `git add`); Decisions; File map; Review Focus.
- **B2** (worktree; every game path in ROOT) → Task 1 Step 5; Global Constraints; Tasks 3–12 (all `cd` and `git -C` paths); Task 12 Step 6 build and local server in ROOT; N9 in Task 12 Step 6.
- **B3** (deploy from the worktree; two asks; no stash) → Task 12 Step 8; Decisions; Global Constraints (stop points, no `--autostash`); Review Focus.
- **B4** (`mp.test.mjs:493-499`) → Task 9 (Files, Interfaces "Kept", Step 1 test, Step 2 expected failure, Step 6 run list, Step 7 `git add`); File map; Review Focus.
- **S1** (pause e2e race) → Task 4 Step 5 (counts taken around the pause), Step 6 (three runs); Review Focus.
- **S2** (bare `game.pad()`) → Task 2 (Files, Interfaces, Step 2 test, Step 3, Step 4 code and [T-24] note, Step 6); Task 11 Step 2 CHANGELOG; File map; Decisions.
- **S3** (`--max-old-space-size=512`, `MemorySwapMax=0`, `RuntimeMaxSec`) → Global Constraints and every run command in Tasks 2–12. Browser files use 1024 MB and 900 s (as `gate.test.mjs` pins 900 s for browser steps); bakes and builds use 3G with a 2048 MB heap.
- **S4** (`mobile.mjs` and the workspace run capped) → Task 5 Step 4 (alone under 3G; no dev server: `mobile.mjs` serves itself through `serveRally`), Task 12 Step 4 (mobile.mjs again, and `games/test/` under the 2G cap).
- **S5** (`find`-built suite lists, `test/kits/*`) → Task 2 Step 5, Task 11 Step 3.
- **S6** (`git -C` everywhere) → Task 2 Step 6, Tasks 4–12 commit steps, Task 11 Steps 4–6, Global Constraints.
- **S7** (no `git checkout main`) → Task 11 Step 5 (`fetch . local-players:main`, tag on `local-players`); Global Constraints (Repos).
- **S8** (rejoin test checks what persists) → Task 10 Step 1 (paint from the page's progress, PAINTS[1]; the at-join and 3 s-after assertions), Step 2 (record which T-25 tests passed early).
- **N1** (§2.2 examples partly deferred) → Task 6 (rally-spec R8-3 "Deferred" lines), Task 10 (M-22 row: the delivery tally is not game state yet).
- **N2** (`beforeunload` dropped; the engine's `pagehide` covers it) → accepted, no change (Task 4).
- **N3** (`rumbleOut` swallows the rejection) → accepted, no change (Task 4).
- **N4** (`silent` placed before `writeState`) → Task 9 Step 4.
- **N5** (`quiet()`'s registry from the engine's kinds) → Task 9 Step 1 and Step 7; File map.
- **N6** (M-80's place in the spec) → accepted, no change (Task 10).
- **N7** (Task 3's failing list is a guess) → Task 3 Step 2 (advisory; record the real list).
- **N8** (Task 9 Step 5 item 15 already done by item 9) → Task 9 Step 5 item 15 (skip, with a grep check).
- **N9** (`*_OUT` unset before `build --site`) → Task 12 Step 6.
- **N10** (Rally sends again after a blur) → accepted for now; "After this plan".
- **N11** (`last >= 900` margin at HZ 240) → accepted, no change (Task 6).
- **N12** (Tractor `game.sim.js:56` ends in a comment) → Task 9 Step 3 (a new line after it). Pig Pens' line 46 has no comment (Task 7 says so).
- **N13** (`workspace.test.mjs` only after the pin) → Global Constraints, Task 3 Interfaces, Task 12 Step 4.
