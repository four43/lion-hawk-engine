# Phase 3h kits: notes

Plan: `docs/plans/2026-10-13-phase-3h-kits.md`. Branch `phase-3-kits`, worktree `lion-hawk-engine-3h`.

## Progress

| Task | Commit | Tests |
|---|---|---|

## Decisions

- materials grid is one registry index per height sample (nx·nz), looked up by nearest sample.
- grip defaults to false; pair friction scales slip/side only when a game opts in.
- rayGroups.member [] means every group (a ray with no membership hits nothing in Rapier). Ray filter only:
  colliders follow 3c (omitted member/filter = every group; explicit member [] = none).
- Coverage accrues dirtRate × metres from the pool's prev → curr pose (place() counts nothing).
- VEHICLE_SYSTEM is 'lh.kit.vehicle' (3k/3l match it via the exported constant); forward 'x' = axle +z, forward 'z' = axle -x.

## Contract issues

(see the plan's "Contract issues"; record here how each was resolved at merge)

## Integrator requests

(see the plan's "Integrator requests")

## Field note candidates

- Rapier 0.21's vehicle controller sets its forward axis through a property setter named `setIndexForwardAxis`;
  with forward x the axle must be +z, with forward z it must be -x, or engine force drives backwards.
- Rapier's vehicle controller already excludes its own chassis from wheel rays; Tractor's and Pig Pens'
  own-collider predicates were redundant.
- Tractor's DIRT rates are per second at full speed (`rate × speedFrac × dt`); spec dirtRate is per metre.
  Ruling (3h/3l): Tractor moves to per-metre dirtRate; 3l picks rates equal to today's at normal speed, pins
  them with a test and lists the feel as a playtest item.
- createParticles.emit takes (…, life, size, …) per the contract; Tractor's fx.emit took (…, size, life, …).
