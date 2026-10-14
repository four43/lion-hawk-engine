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

### Sizes and frame rate (Chromium, SwiftShader, desktop preset; probe of the built page)

| Game | Build | Programs | Draw calls (median, max) | Frame ms (median, p95) | Settled ms (median of 3) | Total gzip | Total bytes |
|---|---|---|---|---|---|---|---|

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

## Contract issues (as reconciled)

## Removed or renamed tests

| Version | Plan | Test | Why |
|---|---|---|---|

## Hand-off

## Field note candidates
