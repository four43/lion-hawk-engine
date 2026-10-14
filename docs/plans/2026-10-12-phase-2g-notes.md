# Phase 2g (Tractor Pickup's browser half on `boot`): outcome, rulings and carry-overs

**Status:** done.
- **Engine:** 0.7.2 on branch `phase-2g` (`63beefc`, `ee28623`, `b1bfd2e`, `1bcfdd1`, plus docs).
- **Tractor Pickup:** four43 `feat/lion-hawk`, `2f83ea4..29dfde2` (G1–G7 plus fix rounds). `src/main.js` is now the engine entry. The old frame loop, `window.tp` and `window.game` are gone.
- Not merged, pushed (four43) or deployed. `site/exp/tractor-pickup` still holds the old build until the user runs `build.py`.

## What landed
- **G-E1, engine 0.7.1 (`63beefc`, polish `ee28623`):**
  - `bridgeTransport()` (page side) and `peers(browser, url, n, { argsOf, … })` over a Node hub. Calls carry sequence numbers (#99), and a send in step k lands in step k+1, as in `mp()`.
  - `game.seconds` advances in `1/hz` chunks and waits out loads.
  - `window.engine.hz` (spec D-4).
- **G1 (`2f83ea4`):**
  - the new entry `src/entry.js`, built only for tests (`TRACTOR_ENTRY`, `TRACTOR_OUT`);
  - `view/world.js` (the 3D farm moved from `main.js`), `view/rig.js` (chase camera, `project`, F-10 blend), `view/bodies.js` (two snapshot sets on `engine.onStep`);
  - `devices.js`: the stick, keys and pad through one `map` into `stickToWorld` (`PILOT.revCone`), and the horn on `bindHold`;
  - `serveTractor` and the first e2e test.
- **G2 (`a3eb79e`):** `view/hud.js`: slot bar (rebuilt on enter, `built` and a scene-id change), words, arrows, barn path, roster, finder, barn wait, horn marks, and the drive buttons as adopted `farm.paint`/`farm.book` markup.
- **G-E2, engine 0.7.2 (`b1bfd2e`, `1bcfdd1`):**
  - late adoption of `data-lh-slot` markup and `ui.adopt()` (#104);
  - the DOM-assert memory trap found and guarded (#103);
  - `--test-concurrency=4` in the engine's and the games' unit scripts (four43 `dce00e4`).
- **G3 (`fda7419`, fix `a4339ee`):**
  - The show cutscene animates copies of the riders. Its waits count `update(dt)` on the raw frame time. The hurry and cheer use `bindGesture`, with the cheer on pointerdown. The skip is the adopted `show.skip` hold. The ack is `show.done { gen, spots }`.
  - The sticker card and the start screen are overlay halves around `menus.js`. The book is marked seen once.
- **G4 (`bdce3d0`):**
  - the parent menu and the sleep screen halves;
  - storage loaded as farm args, and the `progress`, `settings` and `bed` events saved;
  - the 1 Hz `clock` and one on `visibilitychange`;
  - audio unlock and page hide (X-13), the back guard (X-14), and `?fps`/`?tune`.
- **G5 (`61f09a3`, fix `b6cce5f`):**
  - `createSession({ bind })` binds a joined Handshake room to the engine through a port. The port is bound only once the farm exists, and released after the step that drains `net.close`.
  - `players.poseAt` gives the view a read-only draw of the other trains (#102 fixed). The fix round copied `type` and `golden` into the remote carried riders, which the two-page test now covers.
  - The two-page bridge test.
- **G4b (`57f9579`):** user ruling. `?tune` sliders issue a sim `tune` command over `src/sim/tune.js`, the same feel constants the game reads. The sim clamps the value and emits a `tune` event. A guest's tune commands are dropped. The camera rows stay view-only.
- **G6 (`a429b68`, fix `9199866`):**
  - e2e tests on the iPad Pro 11 landscape and iPhone 15 Pro portrait presets: touch driving and reverse, the horn, the wake hold, a tap vs a hold on the show, the layout inside the safe area, and a new farm while asleep;
  - the controls measure ≥ 44 px (horn 88, drive 60, gear 46).
- **G7 (`29dfde2`):**
  - The flip: `src/entry.js` → `src/main.js`. The old `main.js` is deleted, with `window.tp` and `window.game` (`window.engine` covers every use). `build.py` lost `TRACTOR_ENTRY`, and the e2e suite serves `src/main.js`.
  - Removed with the old path:
    - `menus.js`'s built-in gear and its non-slots mode;
    - `buildTunePanelDirect`;
    - `players.drawAt`, the old view-side sim write;
    - `others3d`'s `sync.players` input.
  - Kept, each with a header note:
    - `ui/hold.js`, for `show.js`'s default skip path, which `show.test.mjs` covers;
    - `ui/input.js`, for `HORN_SVG`, and `createInput`/`radial`, which `input.test.mjs` covers.
  - Spec 1.12 text: §7.3 engine devices, X-15 `window.engine` and the `tune` command, §13 how to run the tests, §14.8 the automated M-52/M-54 paths.
- **Final fix wave (four43 `b74d85d`..`e03ed71`; engine docs only):** the eight findings of the whole-branch review.
  - R-1 again: a screen half that fails to open hides its screen and taps its go or close control (`menus.view.test.mjs`).
  - `bindPort` moved to `src/net/bind.js`, its close chain, fallback and deferred bind tested on the memory hub (`bind.test.mjs`).
  - A new farm closes `paint` and `book` too, and stops the voice again.
  - `?fps`: the sim times its own Rapier step with the entry's timer (`phys.worldMs`); the view only reads it (#106 updated).
  - Spec M-54 and test counts (783 unit), the [U-1] and 0.7.2 late-adoption text (needs a `MutationObserver` or `adopt()`), and two stale comments.

## Measured
- **Tests at G7:**
  - engine 387/387;
  - Tractor unit 774/774;
  - `TP_MP=engine` 773/774 (the frozen-frame M-50 test, by design, #75);
  - e2e 14/14 (~190 s; the two-page test ~75–80 s);
  - workspace 842/842 (5 + Pig Pens 37 + Tractor 774 + Rally 26).
  - Peaks: unit 1.1 GB, workspace 1.2 GB, e2e 1.4 GB.
- **Bundle** (minified `build/app.js` from `build.py`; gzip -9 in brackets):

  | Build | Total | Game `src/` | lion-hawk | three | Rapier | assets.json |
  |---|---|---|---|---|---|---|
  | Old shipped entry at `9199866` | 6,070,642 B (2,025,808) | 209,908 | 13,846 | 582,180 | 4,335,912 | 906,324 |
  | New entry at G7 (`29dfde2`) | 6,144,380 B (2,053,802) | 229,755 | 67,415 | 582,346 | 4,336,160 | 906,324 |
  | Change | +73,738 B, +1.2 % (+27,994 gz) | +19,847 | +53,569 | +166 | +248 | 0 |

  The page (`index.html` with the voice and animal clips) went from 6.59 MB to 6.66 MB. Before the G7 deletions, the test-only `entry.js` build was 6,145,018 B, so the G7 deletions save 638 B. Most of the growth is the engine's view half (boot, UI registry, devices, hook), which the old path did not ship.
- **Manual look (headless Chromium, 1280×800, real time, seed 14):** the old and new builds were screenshotted side by side: boot, W/A/S/D drive, honk, paint screen, sticker book, gear hold ring, parent menu, `?sandbox`, `?tune`. Each pair matches. On the new build, run through `openGame`: boop and landing word, the barn show, the hurry hold, the skip ring, the card and go, bedtime Now, the last drive, asleep, the wake hold, and a new farm. No page errors or warnings beyond SwiftShader's. The only oddity is the barn roof fading through on the first frame after a manual step or jump. G2 found the same on the old build (the roof fade runs per rendered frame).

## Rulings (each with its cost if wrong)
1. **`peers()` takes `argsOf(i)`** (pre-flight: the G5 delta needs guest args that differ from the host's). `args` stays the default for all. Cost: none.
2. **Engine branch `phase-2g` from the `phase-2f` tip (`9674934`)**, which keeps the 0.7.0 tag point clean. Cost: none.
3. **One dispatch per task, all opus**, given the browser judgment. Cost: none.
4. **Build checks write to the scratchpad (`TRACTOR_OUT`).** `site/exp` stays untouched, and the unrelated `site/exp/piggie-game` diff is never discarded. Cost: `site/exp/tractor-pickup` stays the old build until the user builds.
5. **Bridge clock (G5).** Under `?lh-bridge`, the port's clock is `engine.time.wall`. Real rooms keep `performance.now()`, because fast manual stepping would trip real-time rate limits. Cost: the browser tests don't exercise the real-time clock path (`session.test.mjs` covers it).
6. **Pre-made markup before boot (G2), superseded by ruling 7.** Cost had it stood: the entry would hold markup that `menus.js` makes.
7. **Engine task G-E2 before G3:** uiDom swaps an engine-made control onto its `data-lh-slot` element when that element appears later (0.7.2). Cost: one more engine patch. The persistent farm controls keep G2's pre-boot markup.
8. **Memory safety after the G-E2 OOM incident:**
   - every run goes through a capped systemd scope with no swap;
   - direct `node --test` calls get `--test-concurrency=4`;
   - browser suites run one at a time;
   - the node heap limit is below the scope cap, so a runaway dies inside node and the user gets no KDE low-memory notice.

   Cost: slower suites.
9. **Unit and workspace caps are 2 GB with a 512 MB heap per process** (the measured peak is 1.1–1.2 GB; a 1 GB cap was a dispatch error). Cost: none.
10. **G3 review rulings:**
    - the book's seen-mark sound stays;
    - G3's scope additions are justified;
    - `ui/hold.js` stays as `show.js`'s default-path dependency (carried into G7: delete the `menus.js` gear branch and its `hold.js` import with `main.js`, and keep `hold.js` with a note).

    Cost: one module kept for a test-covered default path.
11. **`?tune` as a debug-only view-write exception (G4), superseded by ruling 12.** Its cost had it stood: `?tune` sessions don't replay and can desync in multiplayer.
12. **User ruling 2026-10-13: `?tune` goes through game flow:** a sim `tune` command writes the same core feel constants, and the view writes nothing (new task G4b, run after G5). Cost: a replay is exact only from the shipped constants (#108), and a guest keeps its solo tunes after joining.
13. **G7's implementer writes the field notes and these notes** (this supersedes "the controller writes field notes"). Cost: none; the G7 review checks them.
14. **G7: `window.tp` and `window.game` are removed, not reduced** ([D-5] keeps aliases only until a game finishes phase 2). Cost: any console habit that used `tp.*` now goes through `window.engine.debug`.
15. **G7 (implementer's calls within the brief):**
    - `TRACTOR_ENTRY` is gone from the e2e suite too, not only from `build.py`;
    - `menus.js` lost its whole non-slots mode, not just the gear (only the old `main.js` used it);
    - `players.drawAt` was deleted, and `forecast.test.mjs` calls `players.sample(now)` instead, the same call it made with `herd = null`.

    Cost: none seen (all suites green, and the manual look matches).

16. **Final fix wave: the `?fps` world-step wrapper is fixed now, not parked** (the final review rated it "can wait"). The user's standing rule is that dev tools go through game flow, with no view-writes-sim exceptions. Cost: a sim-side diagnostic field (`phys.worldMs`, outside serialised state) and an injected timer.
17. **Final fix wave: a screen that fails to open taps its own control,** so a failed start screen begins the trip with no paint choice, and a throw from the card's bells or voice skips a card that drew. Cost: a child may miss one sticker card or the paint choice; the alternative is a farm frozen behind an invisible engine button.

## Playtest list (Tractor Pickup, on a real iPad; also the 2f items)
- **Driving:**
  - the world-frame stick under a swinging chase camera (#81);
  - the merge picks the longest vector, where the old game let keys override the stick (#82);
  - `goBack` is ORed across devices.
- **Holds on wall time:** the parent gear (2 s), skip (1 s) and wake (5 s) holds (#83). Also the show's hurry hold and tap-to-cheer on `bindGesture`. A tap must not become a hold when the iPad stutters (#109).
- **Multiplayer:**
  - a guest's new farm arrives one step later (#80, 2f);
  - messages are handled at the next step (#75);
  - a real WebRTC room (M-54: host, join with the code, drive both, boop, bump, show, leave), because the automated test uses the Node bridge.
- **New in 2g:**
  - the night layer and lullaby after a new farm while asleep (pinned by a test; the lullaby itself is unchecked);
  - audio unlock on the first gesture and after a page hide (X-13);
  - the back guard (X-14);
  - `?fps` on the iPad for the X-4 stutter readout;
  - the sticker drags in the book on touch.
- **Sounds:** `whee`, `cheer` and `squelch` are now sim events played by the view (#87).

## Parked minors (for the final wave)
- **Engine (G-E2):**
  - the `domAsserts` regex misses `notDeepEqual`/`notStrictEqual`;
  - its node regex misses plain variables, and its splitter ignores quoting (document the limit);
  - without a MutationObserver, late adoption happens only through `adopt()` (say so in the spec and the CHANGELOG);
  - refocus after a fallback swap (field note);
  - move `setup2` up beside `setup`.
- **Engine notes opened in 2g:** #100 (`untilLoaded` after a command; Tractor still steps once first), #101, #105–#109.
- **Tractor, G3:** the book overlay could carry the previous `bookSeen` in its args, which would remove `noteSeen` from the farm frame.
- **Tractor, G4:**
  - the `?fps` "sim ms" spans rAF to draw, so it is approximate;
  - `ui/menus.js` gained behaviour beyond the brief's file list (`onParentDone`, `closeParent`, the new farm in slots mode);
  - `entry.js` (now `main.js`) has two `visibilitychange` listeners.
- **Tractor, G5:**
  - `bindPort`'s close chain, deferred bind and 1 s fallback are untested (fixed in the final wave: `bind.test.mjs`);
  - the 1 s fallback can fire in manual-step tests (skip it under `?lh-test`?);
  - a quick re-host can overlap two ports for a step;
  - `poseAt` feeds only the newest record per frame, so the view's fade and velocity may differ from the sim's on bursts;
  - a Handshake event during a deferred bind is lost;
  - the `?r=` path has no browser test.
- **Tractor, G4b:**
  - `commands.js:3`'s header still says commands do nothing outside the farm (`tune` runs on the sandbox) (fixed in the final wave);
  - `tuneGet` is unguarded where `tuneSet` is guarded;
  - a guest keeps its solo tunes after joining;
  - the tuned power is not saved to settings.
- **Tractor, G6:**
  - the wake-hold step counts are magic numbers (tie them to the hold constant);
  - the lullaby is unchecked in the new-farm-while-asleep test.
- **Tractor, G7:**
  - `session.js`'s no-`bind` path (the session makes and steps its own sync) is now used only by `session.test.mjs`;
  - `createInput` in `ui/input.js` is used only by `input.test.mjs`;
  - drop both, or move their tests onto the engine path;
  - `serveTractor({ entry })` keeps an `entry` option that only the default uses;
  - the `?tune` panel prints float noise (`25.99999…`) for `full speed err deg`, as the old build did.

## Carry-overs
- **The binary command codec and NET_VERSION 4** (#91): built in 2f, not adopted. Adopting it changes the wire, so it needs a version bump and an interop pass.
- **Drop the syncs' duplicate transport checks.** The port and command schemas now validate what `host.js`/`guest.js` still check by hand.
- **Handshake vendoring** (#89): `src/net/handshake.js` stays game-side.
- **`TP_MP` switch:** still meaningful after G7. `oldWorld` drives `host.js`/`guest.js` directly, and the engine harness drives them through the port. The frozen-frame M-50 test stays the one named exception on `TP_MP=engine` (#75). Retire the switch when the syncs' own transport checks go.
- **Still open from 2f:** #67 (audio unlock hook), #93 (late-peer wall ulp), #95 (`engine.overlay` once), #96 (diffs during a guest build), #98 (browser tapes and `time.wall`).
