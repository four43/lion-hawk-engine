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

## Frame-rate table (overview §8 R1, R3)

Budgets: programs ≤ baseline + 2; draw calls (median) ≤ baseline; total gzip ≤ baseline × 1.10; settled ≤ baseline × 1.20. Enforced from a game's view step on; earlier rows are informational. iPad `?fps` is the user's (Task 21).

| Game | Engine / game version | Step | Programs | Draw calls | Frame ms | Settled ms | Gzip | vs budget | iPad median frame ms (today → branch) |
|---|---|---|---|---|---|---|---|---|---|

## Requests

| ID | From | Kind | Files | Ask | Decision | Landed in | Test |
|---|---|---|---|---|---|---|---|

## Broadcasts

| Date | To | Message |
|---|---|---|

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
