# Phase 3m: integration notes (ledger)

Plan: `2026-10-13-phase-3m-integration.md`. Owner: the integrator. Every gate, request, broadcast and field-note number is recorded here before it is announced.

## Paths

| Name | Path | Branch | Created |
|---|---|---|---|
| Engine main checkout | /home/smiller/projects/four43/lion-hawk-engine | phase-3 | (exists) |
| Integration worktree | /home/smiller/projects/four43/lion-hawk-engine-3m | phase-3-integrate | 2026-10-14 |
| 3a | /home/smiller/projects/four43/lion-hawk-engine-3a | phase-3-carryovers | 2026-10-14 |
| four43 integration | /home/smiller/projects/four43/four43-lh3 | feat/lion-hawk-3 | 2026-10-14 |
| Scratch | /tmp/claude-1000/lion-hawk-phase3/3m | — | 2026-10-14 |

Pre-existing state found at Task 1: `git status --short` of four43-lion-hawk showed ` M site/exp/piggie-game/index.html` and ` M site/exp/piggie-game/sw.js` (an earlier Pig Pens `build.py` run; not restored, constraint 8).

## Baselines (engine 0.7.2, four43 e03ed71)

### Test counts

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| Engine unit | 374 | 0 | |
| Engine browser (bridge-e2e 7, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2) | 13 | 0 | engine total 387 |
| Workspace | 874 | 0 | 851 + 23 new games/test (gate 9, owners 5, perf 9) |
| tractor-pickup TP_MP=engine | 782 | 1 | pass (allowed); the failure is the M-50 frozen-frame test |
| Pig Pens e2e | 6 | 0 | |
| Tractor e2e | 14 | 0 | |
| Rally e2e | 4 | 0 | |
| Rally mobile | 0 | 0 | exit 0 |

Gate 0: GATE PASS (log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.2.log`). All counts as expected.

### Sizes and frame rate (Chromium, SwiftShader, desktop preset; probe of the built page)

| Game | Build | Programs | Draw calls (median, max) | Frame ms (median, p95) | Settled ms (median of 3) | Total gzip | Total bytes |
|---|---|---|---|---|---|---|---|
| rally | e03ed71 scratch build (`site/exp/rally`) | 9 | 99, 139 | 316.6, 333.4 | 1808 (single run) | 2020008 | 5445677 |
| pig-pens | e03ed71 scratch build (`site/exp/piggie-game`) | 16 | 140, 140 | 233.4, 250.1 | 1889 (single run) | 2111208 | 6107760 |
| tractor-pickup | e03ed71 scratch build (`site/exp/tractor-pickup`) | 19 | 141, 144 | 433.4, 483.2 | 1283 (single run) | 2579061 | 6849966 |

Probe ran on the built pages through `serveDir` (no fallback needed); frames 119 each, errors empty. Settled ms is one run, not a median of 3. Frame ms is high because software rendering (SwiftShader) on this host.

```json
{
 "rally": {
  "game": "rally",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/rally",
  "settledMs": 1808,
  "programs": 9,
  "drawsMedian": 99,
  "drawsMax": 139,
  "frameMsMedian": 316.59999999999854,
  "frameMsP95": 333.3999999999978,
  "frames": 119,
  "size": {
   "bytes": 5445677,
   "gzip": 2020008
  },
  "errors": []
 },
 "pig-pens": {
  "game": "pig-pens",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/piggie-game",
  "settledMs": 1889,
  "programs": 16,
  "drawsMedian": 140,
  "drawsMax": 140,
  "frameMsMedian": 233.4000000000001,
  "frameMsP95": 250.09999999999945,
  "frames": 119,
  "size": {
   "bytes": 6107760,
   "gzip": 2111208
  },
  "errors": []
 },
 "tractor-pickup": {
  "game": "tractor-pickup",
  "dir": "/tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/tractor-pickup",
  "settledMs": 1283,
  "programs": 19,
  "drawsMedian": 141,
  "drawsMax": 144,
  "frameMsMedian": 433.40000000000146,
  "frameMsP95": 483.1999999999998,
  "frames": 119,
  "size": {
   "bytes": 6849966,
   "gzip": 2579061
  },
  "errors": []
 }
}
```

## Gates

| Version | Date | Engine head | four43 head | Engine | Workspace | Browser | Builds | Probes | Verdict | Log |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.7.3 | 2026-10-14 | 2a5cbde (`v0.7.3`) | d884cf3 (`v-games-0.7.3`) | pass: unit 409, browser 14 (bridge-e2e 7, e2e 1, hold-e2e 1, load-e2e 2, touch-e2e 2, untilLoaded-e2e 1) = 423 | pass 874 | pass: TP_MP=engine 782/1 (allowed, M-50); Pig Pens e2e 6, Tractor e2e 14, Rally e2e 4, Rally mobile 0 | none (no `game.config.js` yet) | none | GATE PASS; dirty 0; golden diff vs `v-games-0.7.2` empty | `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.3.log` |

## Frame-rate table (overview §8 R1, R3)

Budgets: programs ≤ baseline + 2; draw calls (median) ≤ baseline; total gzip ≤ baseline × 1.10; settled ≤ baseline × 1.20. Enforced from a game's view step on; earlier rows are informational. iPad `?fps` is the user's (Task 21).

| Game | Engine / game version | Step | Programs | Draw calls | Frame ms | Settled ms | Gzip | vs budget | iPad median frame ms (today → branch) |
|---|---|---|---|---|---|---|---|---|---|

## Requests

| ID | From | Kind | Files | Ask | Decision | Landed in | Test |
|---|---|---|---|---|---|---|---|
| 3a-R1 | 3a | D | `package.json`, `package-lock.json`, `src/version.js` | 0.7.3; `@gltf-transform/*` 4.5.1, `meshoptimizer ~1.2.0`, `pngjs ^7`, `esbuild` as dependencies (with 3d R1's pins) | done | 2a5cbde (0.7.3) | `test/package-phase3.test.mjs` (red without `pngjs`, then green) |
| 3a-R2 | 3a | S | `CHANGELOG.md` | `## 0.7.3` entry | done; checked against the merged notes (reset bullet adds ruling 4) | 2a5cbde | — |
| 3a-R3 | 3a | S | `docs/spec.md` | Task 10 steps 1–3 (header, part A D1–D9, part B) | done verbatim, plus R7 | 350e614 | — |
| 3a-R4 | 3a | S | `docs/field-notes.md` | #95, #100, #105, #107, #108, #109 done; candidates from #110 | done: five candidates → #110–#114 | e902f5c | `test/field-notes.test.mjs` |
| 3a-R5 | 3a | — | — | games workspace suite after the merge, before Wave A | done: the 0.7.3 gate's workspace step, 874/874 (against `feat/lion-hawk-3`, which links the main checkout) | gate 0.7.3 | — |
| 3a-R6 | 3a | — | — | Tractor iPad gesture e2e against 0.7.3 before dropping a #109 workaround | forwarded to 3l (non-blocking); the 0.7.3 gate's Tractor e2e passed 14/14 at the current settings | — | — |
| 3a-R7 | 3a | S | `docs/spec.md` | [I-2]: `now` reads the clock of `event.timeStamp`, for tests; [T-5]/[T-17]: `maxSteps: 0` with commands pending throws | both applied: code reads `clock() - t0` with `t0 = event.timeStamp`; a scratch probe showed `untilLoaded({ maxSteps: 0 })` throws `untilLoaded after 0 steps` with a command pending (Playwright loop reads the same) | 350e614 | — |

## Broadcasts

| Date | To | Message |
|---|---|---|
| 2026-10-14 | controller | Freeze before the 0.7.3 `--ff-only` of `phase-3` (constraint 16): no other worktree was active, so a no-op. |
| 2026-10-14 | controller | Procedure P pickup for 0.7.3 (gate log `/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.3.log`); no open game or engine worktree to relay to. Freeze lifted. |

## Field-note map

| # | From | Candidate |
|---|---|---|
| 110 | 3a | 1: `bindGesture` reads the event clock (#109 outcome) |
| 111 | 3a | 2: `untilLoaded` waits for commands pending at the call (#100 outcome) |
| 112 | 3a | 3: `reset()` in every `createEngine`; tune after all `mp()` peers (#108 outcome) |
| 113 | 3a | 4: focus not moved after a fallback swap (G-E2 parked minor) |
| 114 | 3a | 5: a late-dispatched lift can still read as a hold (#109 residual) |

## Contract issues (as reconciled)

## Removed or renamed tests

| Version | Plan | Test | Why |
|---|---|---|---|

## Hand-off

## Field note candidates
