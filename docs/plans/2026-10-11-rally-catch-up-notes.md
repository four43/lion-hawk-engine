# Rally catch-up: outcome

**Status:** done on four43 `feat/lion-hawk` (`ebe767e`, `7598fb8`, `a39cbaf`). Not pushed or deployed.

## What landed
- **Workspace and engine:** Rally is a `games/` workspace member and consumes lion-hawk 0.3.0.
- **Golden:** a 20 s autopilot stage drive at 240 Hz, with a bit-exact determinism twin.
- **Hook:** `window.engine` (game `rally`).
- **three:** 0.160 → 0.186. The only forced change was `PCFSoftShadowMap` → `PCFShadowMap`; screenshots look identical.
- **Rapier:** 0.14 → 0.21. All three games now share one three and one Rapier, enforced by `games/test/workspace.test.mjs`.

## The Rapier 0.21 fix
Rapier 0.21 wakes bodies that were created asleep on their first step, so the marker posts fell over. `TrackWorld.afterStep()` now puts untouched new posts back to sleep once. Knocked posts behave exactly as before.

## Golden re-bless
Re-blessed once, with all of Rally's range checks passing unchanged.

| Metric | Change |
|---|---|
| Final position | 1.418 m |
| Progress at the end | +0.49% |
| Progress, largest gap mid-run | +1.5% |
| Car stays on the road | unchanged |

Causes: Rapier now applies gyroscopic torque, its solver was reworked, and its contact defaults changed.

## Rulings
1. **Rapier's new contact defaults are kept.** Pinning the old prediction distance (0.002) restores stage times, but it pushes verge sample 1332 to 55.8 km/h, over that check's 55 km/h limit. Cost if wrong: a feel change (see playtest below).

## Needs a playtest (user)
- **Hull strikes on crests and verge bumps are harsher.** Verge sample 1332 at half throttle now gives 25.6 km/h, against 54.2 before, with about 31° of pitch.
- **Stages are 0.2–1.2% slower on autopilot.** The Time Attack ta1 lap went 110.4 → 111.6 s, so saved bests shift slightly.
- **Spin and slip angles changed by up to 0.3°.**
- **Phone and iPad handling is unverified;** the mobile tests check the UI only.

If you prefer the 0.14 feel: pin `normalizedPredictionDistance = 0.002` and reconsider the verge bound. That is a separate decision.

## Follow-ups
- The verge check's range of −5..55 km/h only catches a car that goes too fast. It can't detect one that bogs down, so it should get a lower bound.
- The golden covers only the chassis and progress, not the wheels, contacts or snow.
