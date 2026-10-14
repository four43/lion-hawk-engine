# Phase 3a carry-overs: notes

## Outcome

- Branch `phase-3-carryovers`, head `21d833b` before this notes commit.
- Commits per task: T1 `922a06a`, T2 `a380922`, T3 `3b922c2`, T4 `f26f7e0`, T5 `6a872d5`, T6 `85db337`, T7 `3f171c9`, T8 `72df303`, T9 `21d833b`. Base `219974b`.
- Every task review came back clean.
- Final review (opus, `219974b..21d833b`): ready to merge: yes. 0 Critical, one Important, answered without code change (see Done-when evidence).
- Task 10 (spec text) is the integrator's; the text stays in the plan.

## Decisions

Judgment decisions:
- Task 5: `untilLoaded` waits for the commands pending at the call, not while any are pending (it takes the step that delivers them).
- Task 8: `bindGesture` reads the event clock (`event.timeStamp`, injectable `now`); `uncapped` is ignored.

Contract issues (all accepted, per contract-issues 3a rulings 1-6; see "Contract issues").

Rulings from the ledger, verbatim:
- Ruling: in Task 8, gesture.test.mjs test 2's hold-cancel segment also advances the injected clock (clock.t += 500 before the first update, += 600 before the second) — the plan says no assertion is weakened, and with a frozen clock that assertion could never fail — cost if wrong: two small clock lines beyond the plan text in an accepted one-off file.
- Ruling: one implementer per task as the brief requires, sonnet for implementers (multi-step with mutation proofs) and task reviewers; opus for the final review — turn count beats price — cost if wrong: modest extra spend.
- Ruling: a task's reviewer runs concurrently with the next task's implementer (reviewers are read-only; still one implementer at a time); a fix round waits until the running implementer finishes — keeps 3a prompt since every other branch waits on it — cost if wrong: a fix lands on top of the next task's commit (separate commits, still reviewable).
- Ruling: the Important is answered by a scratch-only real-Chromium probe (bindGesture under CDP touch: event.timeStamp vs performance.now, tap and hold outcome), not by a new committed e2e test or a Tractor run — Tractor runs against phase-3 via file:, outside this worktree, and a new test is beyond the plan's file list; the Tractor iPad e2e run goes to the integrator/3l as a request — cost if wrong: a clock mismatch on real devices surfaces only in 3l's e2e.

## Done-when evidence

Commands (`WT=/home/smiller/projects/four43/lion-hawk-engine-3a`):
- UNIT `<files>` = `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=300 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
- SUITE = `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 test/`

Results:
- Baseline SUITE (Task 0, at `219974b`): 387/387 pass, 0 skip, peak 1.3G.
- After SUITE: 415/415 pass = 387 + 28, 0 skip, about 4.6 s test time, peak 1.2G.
- The 28 new tests by file: reset 3, overlay-once 4, overlay-args 2, boot-args 2, untilLoaded 3, hook-commands 1, untilLoaded-driver 2, untilLoaded-e2e 1, peers-render 2, gesture-stamp 5, domAsserts-scan 3. `gesture.test.mjs`, `domAsserts.test.mjs` and `uiDom.test.mjs` keep their counts.
- Purity (`test/purity.test.mjs`): 6/6 pass.
- e2e files `load-e2e`, `bridge-e2e`, `touch-e2e`, `hold-e2e` and `untilLoaded-e2e` passed in the task runs and in the full suite.

Mutation results:
- Task 1: `game.reset?.()` commented out: `reset.test.mjs` test 1 fails with `replay: checksum differs at step 60`. Restored.
- Task 2: `projectedOpen(name)` replaced by `isOpen(name)` in `onceOpen`: tests 2 and 3 fail (2 pass, 2 fail). Restored, 4/4 pass.
- Task 5: predicate set to `pending === 0 && !loading.active`: `untilLoaded.test.mjs` test 3 fails with `untilLoaded after 5 steps`; tests 1 and 2 pass. Restored.
- Task 8: (1) `one.t0 -= raw * 1000` before the hold check: gesture-stamp 4 fail, 1 pass; test 1 logs `['hold']` instead of `['tap']`. (2) Proof of the gesture.test.mjs test-2 clock ruling: the hold also fires in update's `pinch` mode (a second finger no longer cancels the hold): test 2 fails with actual `['hold']`, expected `[]`, the other 3 tests pass. (Removing the second-finger branch in `onDown` was too broad: it also broke the pinch segment.) Restored, gesture-stamp + gesture 9/9 pass.
- Task 9: (a) old EQUALITY pattern: test 1 "guard sees every equality form" fails. (b) string-skip line removed from `callArgs`: test 2 "brackets and commas inside string literals" fails. Both restored. Not individually confirmed that (a) names exactly the three `not*` forms.

Final-review Important: the ledger's Task 8 claim that touch-e2e/hold-e2e cover the browser `timeStamp` origin was false, because neither uses `bindGesture`. No real browser had exercised `bindGesture`'s clock. Answered with a scratch probe (`/tmp/claude-1000/lion-hawk-phase3/3a/probe/`, not committed) in real SwiftShader Chromium via the driver:
- CDP touch (iPad Pro 11) and mouse (desktop) reach `bindGesture` as PointerEvents.
- `event.timeStamp` is on `performance.now`'s clock (deltas -0.1 to -15 ms; a cold first touch -132 ms, dispatch lag, ignored by design).
- Tap gives `['tap']`; a hold of about 1.3 s gives `['hold']` once and no tap after, in both presets.
- Caveat: the driver's `touch.end` dwells 150 ms, so a touch "tap" measures about 345 ms against the 450 ms `tapSeconds`.

The games-workspace run (`cd /home/smiller/projects/four43/four43-lion-hawk/games && env -u CI`, `npm test`, under the unit caps) is the integrator's, after the merge into `phase-3` as 0.7.3.

## Contract issues

All six accepted (contract-issues 3a 1-6):
1. `src/view/hook.js` is outside 3a's Owns: Task 6 edits two lines (`commands: engine.commands`, `overlay(n, a, o)`). Accepted; `hook.js` added to Owns. Spec D-4 gains `commands` (Task 10).
2. `test/gesture.test.mjs` is not owned and §4 lists no `now` option: Task 8 adds an optional `now` and moves two timings onto an injected clock, no assertion weakened. `uncapped` accepted and ignored. Accepted.
3. `test/uiDom.test.mjs` is not owned: Task 9 moves `setup2` up beside `setup`, one line verbatim. Accepted.
4. `reset()` takes no arguments; every peer's `createEngine` resets shared module state in `mp()`. Accepted; tunables are per process and tests that tune must tune after all peers are created.
5. #100 semantics: `untilLoaded` takes the step that delivers the commands pending at the call (a "while pending" loop never finishes when systems issue commands every step). Accepted.
6. Spec write-up: Task 10 holds the exact text; the integrator applies parts A (D1-D9, approved 2026-10-14) and B at the 3a merge. Accepted.

## Integrator requests

1. (blocking for the 0.7.3 merge, not for 3a's work) At the merge: bump `package.json` and `src/version.js` to 0.7.3. Add the dependencies pinned by 3d (3m ruling 6), all as `dependencies`, with the lockfile: `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` at `4.5.1`, `meshoptimizer ~1.2.0`, `pngjs ^7`, and `esbuild`.
2. (blocking for the merge) `CHANGELOG.md`, `## 0.7.3 — <date>`, "Phase 3a: engine carry-overs.":
   - `engine.overlay(name, args, { once })` (#95);
   - `engine.scene.overlayArgs(name)` and view halves' `enter(engine, view, args)` (#105);
   - `defineGame({ reset })`, called first in every `createEngine` (#108);
   - `bindGesture` times holds and taps on the event clock, with an injectable `now`; `uncapped` is ignored (#109);
   - headless and Playwright `untilLoaded` take the step that delivers commands pending at the call (#100);
   - `window.engine.commands`;
   - `peers()` defaults to `render: 'manual'` (#107);
   - the domAsserts guard sees every equality form and skips quoted text (G-E2).
3. (blocking for the merge) Apply Task 10 to `docs/spec.md` at the merge: parts A and B (D1-D9 approved 2026-10-14).
4. (blocking for the merge) `docs/field-notes.md`: set #95, #100, #105, #107, #108 and #109 to done (0.7.3), each with a one-line outcome (from "Decisions"); number the field note candidates below from #110.
5. (blocking before cutting the Wave A branches) After the merge, run the games workspace suite (Done-when evidence) before cutting the Wave A branches.
6. (non-blocking) In 3l, run Tractor's iPad gesture e2e (`test:e2e`, under the browser lock) once against 0.7.3, ideally at the default pixel ratio, before dropping any #109 workaround.
7. (non-blocking) Task 10 text suggestions from the final review: [I-2] should say `now` must read the clock of `event.timeStamp` (`performance.now`) and is for tests; [T-5]/[T-17] may note that `untilLoaded({ maxSteps: 0 })` with commands pending now throws (the delivering step is mandatory).

None of these blocks 3a's own work.

## For the game plans

- Tractor (3l) can now drop its extra `step(1)` before `untilLoaded`, `flow.open`'s guard, the sleep half's event scan (`enter(engine, view, args)`), the tune `afterEach` resets (`reset()`; tunes in `mp()` tests must come after every peer is created, ruling 4), and `render: 'manual'` in its `peers()` call. Tractor's only `peers()` call already passes `render: 'manual'`.
- Pig Pens (3k): `bindGesture`'s `uncapped` is ignored now.

## Removed or renamed tests

None removed or renamed. `gesture.test.mjs` test 1 is retitled "2f: bindGesture: a quick tap; a still finger held 1 s on the event clock fires once and is no tap (#59, #109)", and its timings plus tests 2 and 3 moved onto an injected clock (counts unchanged). `uiDom.test.mjs` `setup2` moved beside `setup` (count unchanged).

## Field note candidates

The integrator numbers these from #110.

1. "`bindGesture` reads the event clock (#109 outcome): holds are real time at any frame rate; the frame-sum overcounted the frame before the down. A hidden tab cancels fingers, so nothing pauses a hold." → #110
2. "`untilLoaded` waits for commands pending at the call, not while any are pending (#100 outcome): a game whose systems issue commands every step would otherwise never settle." → #111
3. "`reset()` runs in every `createEngine`; in `mp()` a later peer's engine resets tunables an earlier peer's run changed, so tests that tune must tune after all peers are created (#108 outcome). Tunables are per process and still not on the tape." → #112
4. "After a fallback swap (an adopted `data-lh-slot` element leaves the document and the engine re-adopts or creates a control), focus that was on the old element is not moved to the new one (G-E2 parked minor; no code change in 0.7.3)." → #113
5. "A lift dispatched late can still read as a hold: `update` checks the hold before a queued `pointerup` is seen, so at frames of roughly 860 ms or more a short tap whose lift arrives after a frame >= hold.seconds past the down still fires the hold (#109 residual; 570 ms frames are fixed)." → #114

## Deferred minors

All triaged "not before merge" by the final review.

- T1: `test/reset.test.mjs` test 1 restores `T.speed` outside try/finally (harmless; `reset` re-zeroes it).
- T2: `onceOpen` does not reject unknown option keys (e.g. `{ onec: true }`); per brief.
- T4: `entries()` calls `overlayArgs` per overlay per reconcile pass (no allocation; `entries()` already allocated its array).
- T7: comment T-20's first line is over 150 chars (cosmetic).
- T7: other `peers()` callers change default to manual render; engine callers pass (bridge-e2e), game callers (Tractor) are 3l's.
- T8: `gesture.js` header does not mention that a hidden tab no longer pauses a hold (`visibilitychange` cancels fingers).
- T9: `domScan` `skipString` ignores comments and regex literals (an apostrophe in a comment inside an assert call could misparse); could join the header's limits list.
- T9: `EQUALITY` is exported with the `g` flag (`lastIndex` trap for `.test`/`.exec` callers; `matchAll` is safe).
- T9: `uiDom` `setup2` duplicates `setup`'s body (pre-existing).

## Measured

- Baseline SUITE: 387 tests, 4.3 s, peak 1.3G.
- After SUITE: 415 tests, about 4.6 s test time, peak 1.2G.
