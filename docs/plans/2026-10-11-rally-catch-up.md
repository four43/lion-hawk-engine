# Rally catch-up: workspace, golden, hook, three 0.186, Rapier 0.21 (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Rally to where Pig Pens and Tractor Pickup are after phases 0 and 1:
- a member of the `games/` workspace that consumes `lion-hawk` 0.3.0;
- protected by a characterisation golden;
- exposing `window.engine`;
- on the shared stack: three ^0.186 and Rapier ^0.21.

**Architecture:**
- **Where the work happens:**
  - four43 worktree `/home/smiller/projects/four43/four43-lion-hawk`, branch `feat/lion-hawk`, which is rebased on `gh-pages` and already includes Rally's work-in-progress commit `6bc9928`;
  - the engine lives at `/home/smiller/projects/four43/lion-hawk-engine`, and games depend on it as `"lion-hawk": "file:../../../lion-hawk-engine"`.
- **Order:** the golden is written first, against today's versions. The three.js upgrade can't change it, because the sim doesn't use three. The Rapier upgrade may change it; any re-bless needs a written, measured justification.

**Tech Stack:** Node 26, npm workspaces, `node:test`, Rally's own test scripts (`node test/*.mjs` with `check()` ranges), Playwright (MCP browser tools, or `playwright-core` from the workspace) for visual checks.

**Spec:** `docs/spec.md` §8.4, rows 0–1. Phase 0 and 1 notes are in `docs/plans/`.

## Global Constraints

- **What to touch:**
  - Never modify `/home/smiller/projects/four43/four43` (the main checkout, on `gh-pages`).
  - Don't modify the engine repo in this plan.
  - Don't change Pig Pens or Tractor Pickup.
- **Rally's tests:** its own suite (`npm test` in `games/rally`, a chain of `node test/*.mjs` scripts that `process.exit` non-zero on failure) must pass at the end of every task.
- **Workspace:** `cd games && env -u CI npm test` must be green at the end of every task.
- **Goldens:** re-bless only with `LH_BLESS=1`, and only when the task says so. The commit body must state why, with before and after metrics.
- **Build output:** run Rally's `python3 build.py` to verify, then always discard the output under `site/exp/`. No version bumps, no deploy, no push.
- **Commits:** conventional commits. **No `Co-Authored-By` trailer and no AI attribution.** Use `git add` with explicit paths (no globs over `games/*`).
- **Code style:** match Rally's: dense, with short comments citing spec IDs.

---

### Task 1: Rally joins the workspace with a golden and `window.engine`

**Files:**
- Modify: `games/package.json` (`workspaces` adds `"rally"`), `games/rally/package.json`, `games/package-lock.json`
- Delete: `games/rally/package-lock.json` (if present; the root lockfile replaces it)
- Create: `games/rally/test/golden.test.mjs` and the generated `games/rally/test/goldens/stage-autopilot.json`
- Modify: `games/rally/src/main.js` (install the hook beside `window.rally`)

**Steps:**
- [ ] **Dependencies.** In `games/rally/package.json`:
  - add `"lion-hawk": "file:../../../lion-hawk-engine"`;
  - keep three ^0.160 and Rapier ^0.14 for now;
  - change `scripts.test` to `"node --test test/*.test.mjs && <the existing chain>"`.

  Add `"rally"` to `games/package.json` `workspaces`. Then run `cd games && npm install --no-audit --no-fund`. npm nests Rally's three and Rapier. The workspace one-copy test lists only Pig Pens and Tractor Pickup, so it stays green.
- [ ] **Golden.** Write `games/rally/test/golden.test.mjs` with `node:test`, `golden`, `assertFinite` and `canonical` from `lion-hawk/test`, the same shape as `games/tractor-pickup/test/golden.test.mjs`. Read that file first.
  - Build a stage with `generateTrack('golden', { kind: 'stage', theme: 'summer' })` and `new Sim(R, { world: new TrackWorld(track), car: 'awd', assist: true })`, the same way as `test/game.mjs`'s `trackSim`.
  - Drive it with `test/autopilot.js` for 20 s of sim time at 240 Hz (4800 steps).
  - Every 240 steps:
    - run `assertFinite` on the snapshot;
    - push `checksum(snapshot)` to `trail`.
  - The snapshot holds:
    - the car's body position, rotation and linear velocity;
    - speed;
    - gear and rpm, if exposed;
    - progress along the track, if available from `makeProgress`.
  - Events: if the sim or progress code emits any, record them as `${step}:${type}`.
  - Add a second test that asserts `canonical(run(), { digits: 15 })` is equal for two runs (bit-exact determinism).
  - Read `test/game.mjs` and `test/autopilot.js` for the real APIs. Adapt field names to what exists, and explain the choices in the report.
- [ ] **Create the golden.** Run `env -u CI node --test test/golden.test.mjs` twice in `games/rally`. Both runs must pass, and the golden must contain a car that has actually moved. Prove the golden catches change: alter the seed, see it fail, revert.
- [ ] **Hook.**
  - In `src/main.js`, next to `window.rally = {…}`, call `installEngineHook({ stepN: window.rally.stepN, render: window.rally.render, state: () => window.rally.state?.() ?? {}, debug: { get rally() { return window.rally; } } }, { game: 'rally' })`.
  - Import `installEngineHook` from `lion-hawk/view`.
  - Adapt to the real `window.rally` members (`stepN`, `render`, `state`), keeping only those that exist.
- [ ] **Verify.**
  1. Build: `python3 build.py`.
  2. Open the built page served over HTTP.
  3. Check that `window.engine.game === 'rally'` and that `window.engine.state()` works.
  4. Discard `site/exp`.
  5. Run Rally `npm test` and the workspace `npm test`.
- [ ] **Commit** `feat(rally): join the games workspace with a golden and window.engine (lion-hawk 0.3.0)`

### Task 2: three 0.160 → 0.186

Follow Pig Pens' upgrade (four43 commit `chore(pig-pens): three 0.160 → 0.186`; read its body with `git log --grep "three 0.160"`).

- [ ] **Baseline before changing anything.**
  1. Build, serve, and open Rally with a fixed seed and track: `?seed=…` plus whatever Rally's URL flags support for a fixed track (read `src/main.js`).
  2. Pause via `window.rally`, step to a fixed point, and render.
  3. Take screenshots at desktop 1280×800 and phone landscape 844×390 (DPR 2), saving them to `/tmp/claude-1000/-home-smiller-projects-four43-four43-games/355ff10c-4724-46d6-abe4-b26b6053b1df/scratchpad/rally/rally-0160-{desktop,phone}.png`.
  4. Record console warnings and errors.
- [ ] **Upgrade.** Set `"three": "^0.186.0"`, run `npm install` from `games/`, and run Rally `npm test`. The golden must be unchanged.
- [ ] **Compare and fix.**
  1. Rebuild and screenshot to `rally-0186-*.png`.
  2. Compare: terrain, snow, shadows, colours, HUD.
  3. Fix only what the upgrade forces. Cite the three.js change for each fix; the Pig Pens upgrade needed only `PCFSoftShadowMap` → `PCFShadowMap`.
  4. Make sure there are no new console errors.
- [ ] **Commit** `chore(rally): three 0.160 → 0.186 (lion-hawk phase 1)`. The body lists each source change and its cause. Discard `site/exp`.

### Task 3: Rapier 0.14 → 0.21

- [ ] **Read the changes first.** Read the Rapier JS changelog for 0.15 through 0.21 (https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md). List every API Rally uses:
  - `R.World`;
  - `RigidBodyDesc.dynamic`;
  - `ColliderDesc.cuboid`, `cylinder`, `cone`, `roundCuboid` and `heightfield`;
  - `R.Ray` / `castRay` and its query filters;
  - collision groups;
  - mass, damping and friction setters.

  Note in the report every breaking or behavioural change that affects them. Pay special attention to the heightfield argument order and scale, `castRay` / `castRayAndGetNormal` signatures and filters, and the default friction and restitution combine rules.
- [ ] **Upgrade.** Set `"@dimforge/rapier3d-compat": "^0.21.0"`, run `npm install` from `games/`, and fix the API breaks.
- [ ] **Run Rally's whole suite.** `npm test` in `games/rally` runs the golden plus physics, track, snow, game and the other checks. The range checks in `physics.mjs` and `game.mjs` are behavioural specs: they must pass **without widening their ranges**. If one fails, find the cause (for example a changed friction combine rule, or heightfield orientation) and fix the cause, not the range.
- [ ] **The golden.**
  - If it still matches, good.
  - If not, it may be re-blessed **once**, but only if:
    - Rally's own range checks all pass;
    - the trajectory difference is explained by a documented Rapier change.
  - Before re-blessing, report in the commit body:
    - the `first divergence: trail[k]` line;
    - the final car position delta;
    - the speed delta;
    - the progress delta.
  - If the drift is large (for example the car ends up off the road, or progress differs by more than 5%), stop and report `BLOCKED` with the numbers instead of re-blessing.
- [ ] **Join the one-copy check.** Add `'rally'` to `members` in `games/test/workspace.test.mjs`. Rally now shares the single three and Rapier.
- [ ] **Visual and mobile check.**
  1. Rebuild and screenshot as in Task 2 (`rally-r021-*.png`): the car on the road, no jitter.
  2. Run Rally's `npm run test:mobile` if it can find Chromium; otherwise say so.
  3. Discard `site/exp`.
- [ ] **Commit** `chore(rally): rapier 0.14 → 0.21 (lion-hawk phase 1)`. The body covers the API changes, each fix and its cause, and the golden decision with metrics.
