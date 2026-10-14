# Phase 3m: integration, gates, final review and hand-off: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Goal:**
- Carry phase 3 from engine 0.7.2 / four43 e03ed71 to engine **0.11.0** and a `feat/lion-hawk-3` branch on which all three games run on the phase 3 engine.
- Do it through the integrator's own work only:
  - the worktrees and branches of overview §6;
  - the merges, wave by wave, in a fixed order, each behind a gate;
  - the integrator files and the games workspace tests;
  - the integrator requests from every sub-plan;
  - the final whole-phase review;
  - the user hand-off.
- Nothing is pushed, tagged remotely, merged to `gh-pages` or deployed. Those stay with the user.

**Architecture:**
- **Three trees for the integrator:**
  - the engine main checkout (`phase-3`). Every four43 worktree sees it live through its `file:` symlink, so it only ever moves by `--ff-only`;
  - an engine integration worktree (`phase-3-integrate`), where merges, version bumps and integrator-file edits are made and pre-gated;
  - a four43 worktree on `feat/lion-hawk-3`, which holds the integrated games and the gate tools.
- **One gate runner** (`games/test/gate.mjs`). It runs every suite one after another under the overview §7.5 caps:
  - unit suites capped at 2G;
  - browser suites behind the shared flock;
  - optionally, builds into the scratch dir and a WebGL-counting probe.
- **One ownership checker** (`games/test/owners.mjs`). It rejects a branch that touched files outside its §5.2 row before the branch is merged.
- **Version-keyed guard tests:**
  - the public surface by version (`test/package-phase3.test.mjs`);
  - purity with the Rapier rule (`test/purity-phase3.test.mjs`);
  - field-notes numbering (`test/field-notes.test.mjs`);
  - the D9 workspace rule (`games/test/workspace.test.mjs`);
  - the overview §1.3 done-when rules for each migrated game (`games/test/phase3-done.test.mjs`).
- **A ledger** (`docs/plans/2026-10-13-phase-3m-integration-notes.md`). It holds baselines, gate results, requests, broadcasts, the field-note map, the frame-rate table and the hand-off.

**Tech Stack:** git worktrees; Node 26 `node:test`; `systemd-run --user` scopes and `flock`; npm workspaces with `file:` links; `lion-hawk/playwright` (Chromium under SwiftShader) for the probe; Python only for the baseline builds of today's games.

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md`, with the controller's rulings in `docs/plans/2026-10-13-phase-3-contract-issues.md`. This plan implements G-3, G-4, G-5 and G-6 for phase 3, and owns overview §5.5 enforcement, §6 and §8 R1/R3 measurement.

---

## Global Constraints

```
GLOBAL CONSTRAINTS (phase 3)
1. Sim purity (L-3, T-12): files under src/core, src/defs, src/sim, src/kits/*/sim.js and every game's
   sim tree never import three, three/addons, @dimforge/rapier3d-compat, DOM globals, Date.now, performance.now,
   new Date or Math.random. Rapier is injected (defineGame({ physics: { rapier } })). testing/purity.js
   enforces it; add new sim roots to the purity test, never allowlist a new line without the integrator.
2. Determinism: sim results depend only on seed, steps, input, commands (with their at stamps) and
   engine.time.wall. No wall-clock reads in sim code; timing diagnostics come through the injected timer and
   never enter state() or checksums. Every new sim feature gets a checks.determinism test and a headless replay.
3. Allocation (R-8, T-13): nothing allocated per step or per frame in engine code: reuse out-params and pools;
   allocate at spawn/create only. Rapier's own per-call vector objects are tolerated; retained growth is not.
4. View code: never instanceof on three.js objects (use .isMesh etc.); a second three copy may exist in Node tests.
   Engine view modules may import three directly; game builds go through `lion-hawk build` (dedupe).
5. Memory-safe tests. Unit and workspace suites:
     systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
       -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files|dir>
   Browser suites (engine e2e, game test:e2e, Rally test:mobile), ONE AT A TIME ACROSS ALL AGENTS:
     flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G \
       -p MemorySwapMax=0 -p RuntimeMaxSec=900 -E NODE_OPTIONS=--max-old-space-size=2048 node --test <file>
   Never raise the caps; never run node --test without --test-concurrency=4.
6. Never assert.equal / deepEqual a DOM node (#103): compare with same() from test/helpers/dom.mjs.
7. Commits: conventional style, no Co-Authored-By or any Claude attribution line.
8. four43: never write, modify, restore or delete anything under site/ (including site/exp/). Builds go only to a
   scratchpad: `lion-hawk build --out $SCRATCH/<game>` or the game's *_OUT env var. Never pass --site.
9. Stay inside your plan's file ownership (overview §5.2). Integrator-only files: src/index.*.js, testing/index.js,
   src/version.js, package.json, package-lock.json, CHANGELOG.md, docs/spec.md, docs/field-notes.md, the overview.
   Ask the integrator for anything else.
10. The contract in the overview §4 is fixed. If reality disagrees, stop and write the mismatch in your notes file
    for the integrator; do not change a signature on your own.
11. Goldens: re-bless only under overview §5.5, with the reason and metrics in your notes.
```

### Constraints of this plan

12. **Trees and branches.**
    - The integrator commits only in:
      - the integration worktree (`phase-3-integrate`);
      - the four43 integration worktree (`feat/lion-hawk-3`);
      - the engine main checkout, and there only by `git merge --ff-only phase-3-integrate`.
    - It never commits in a sub-plan's worktree. It asks that worktree's agent, through the controller, to `git merge phase-3` or `git merge feat/lion-hawk-3`.
13. **Integrator files outside the §3.1 list, by ruling** (`2026-10-13-phase-3-contract-issues.md` and this plan's Contract issues):
    - `testing/purity.js` and `test/purity*.test.mjs`;
    - `games/package.json` and `games/package-lock.json`;
    - `games/test/**`;
    - the copies of the game plans' notes in the engine's `docs/plans/`;
    - `docs/plans/2026-10-12-progress.md`.
14. **Nothing leaves the machine.**
    - No `git push`, no tag push, no merge into `gh-pages` or `feat/lion-hawk`, no deploy.
    - No `--site`. No `python3 build.py` inside any four43 checkout: Rally's and Pig Pens' `build.py` write `site/exp/` unconditionally.
    - Local annotated tags `v0.7.3` … `v0.11.0` mark gate passes. They are not pushed.
15. **Gates never write goldens.**
    - Game suites run with `CI=1` (a missing golden throws) and without `LH_BLESS`.
    - After every gate, `git status --porcelain` shows no change under `site/` or `games/*/test/goldens/` (the gate runner checks this).
    - A golden or tape changes only in a game plan's commit that carries a §5.5 record.
16. **Freeze before moving `phase-3`.**
    - Before each `--ff-only` of the main checkout, the integrator posts a freeze through the controller: open worktrees finish their current step and start no suite.
    - It lifts the freeze with the pickup message (Procedure P).
    - A rollback (`git -C /home/smiller/projects/four43/lion-hawk-engine reset --keep v<previous>`) moves only the integrator's own unpushed fast-forward, inside a freeze.
17. **Scratch.**
    - Every build, probe and gate log goes under `/tmp/claude-1000/lion-hawk-phase3/3m/`, the integrator's own subdirectory (contract-issues process note: one scratch subdir per plan).
    - Nothing in it is committed. The numbers that matter are copied into the notes file.
18. **Test commands in this plan** use the §7.5 forms verbatim, `RuntimeMaxSec=600` for unit runs (the overview's figure; it overrides the writers' page's example of 300).

### Paths

| Name | Path | Branch |
|---|---|---|
| Engine main checkout | `/home/smiller/projects/four43/lion-hawk-engine` | `phase-3` |
| Integration worktree | `/home/smiller/projects/four43/lion-hawk-engine-3m` | `phase-3-integrate` |
| Sub-plan worktrees | `/home/smiller/projects/four43/lion-hawk-engine-3<x>` (3a … 3i) | `phase-3-<name>` (§5.2) |
| four43 integration worktree | `/home/smiller/projects/four43/four43-lh3` | `feat/lion-hawk-3` |
| Game worktrees | `/home/smiller/projects/four43/four43-lh3-{rally,pigpens,tractor}` | `feat/lion-hawk-3-{rally,pigpens,tractor}` |
| Today's games | `/home/smiller/projects/four43/four43-lion-hawk` | `feat/lion-hawk` (e03ed71), read-only for 3m |
| Scratch | `/tmp/claude-1000/lion-hawk-phase3/3m` | — |

All four43 worktrees sit at the same depth as `four43-lion-hawk`, so each `games/node_modules/lion-hawk` symlink (`../../../lion-hawk-engine`) resolves to the engine main checkout.

---

## Review Focus

Each of the five failure modes most likely to bite is pinned by a test in a task:

1. **A browser suite that runs without the lock, or a suite whose caps have drifted.** The likely cause is a gate that runs many suites while other agents run theirs. **Pinned by** `games/test/gate.test.mjs` (Task 3):
   - unit steps carry 2G, 600 s, a 512 MB heap and `--test-concurrency=4`;
   - browser steps start with `flock <lock>` and carry 3G, 900 s and a 2048 MB heap, with one file or script each.
2. **A gate that quietly writes a golden or a site file.** Without `CI`, a missing golden is created, and both Rally's and Pig Pens' `build.py` write `site/exp/`. **Pinned by:**
   - the `CI=1` and no-`LH_BLESS` test in `gate.test.mjs`;
   - `dirtyGuarded`, which the runner applies to `git status`;
   - the `--perf` guard that refuses any path under a `site/` directory.
3. **A public name missing or misrouted at a version.** Examples: an index line forgotten at a merge, a stub left in place of 3f's or 3g's file, or `./kits/*` shadowing `./kits/*/view`. **Pinned by** `test/package-phase3.test.mjs` (Task 8): every §3.2 name by version, kit resolution, `bin`, dependencies, and no `STUB (3e)` file at 0.9.0 or later.
4. **A branch merged with edits outside its row.** For example, a sub-plan editing `src/index.sim.js` or another plan's file, which would conflict later or bypass review. **Pinned by** `games/test/owners.test.mjs` (Task 4). The check runs before every merge (Procedure M, step 2).
5. **A migrated game that still breaks overview §1.3, or a perf budget judged off by one.** **Pinned by:**
   - `games/test/phase3-done.test.mjs` (Task 16): no `assets.json`, `new X.World`, `ColliderDesc.` or literal friction, density or restitution; every `lh-allow` listed in the notes; `build.py`/`bake.mjs` gone; version bumped;
   - `games/test/perf.test.mjs` (Task 5): the budgets pass exactly at the limit and fail one unit over it.

---

## File Structure

**Engine** (commits on `phase-3-integrate`, published to `phase-3`):

| File | Action | Responsibility |
|---|---|---|
| `docs/plans/2026-10-13-phase-3m-integration-notes.md` | create (T2), append throughout | The ledger: paths, baselines, gates, requests, broadcasts, field-note map, frame-rate table, contract issues, hand-off, field note candidates. |
| `testing/purity.js` | modify (T7) | `scanSource(src, file, { rapier })` / `scanPurity(paths, { rapier })`: an opt-in `rapier` rule (D9). |
| `test/purity-phase3.test.mjs` | create (T7) | The Rapier rule. Engine sim roots plus `src/kits/*/sim.js` are pure; no engine source imports Rapier. |
| `test/field-notes.test.mjs` | create (T8) | Field notes run 1..N with no gap, with one index row each. Entries #110 on have the four fields. |
| `test/package-phase3.test.mjs` | create (T8) | The public surface by version (§3.2), kit export resolution, `bin`, dependencies, Rapier/three versions, and no 3e stubs left. |
| `src/index.sim.js`, `src/index.view.js`, `testing/index.js` | modify (T11, T14) | The exports of §3.2, plus requested extras. |
| `package.json`, `package-lock.json`, `src/version.js` | modify (T9, T11, T14, T15, T17, T19) | Versions, dependencies, `exports`, `bin`. |
| `CHANGELOG.md` | modify (every version) | One entry per version. |
| `docs/spec.md` | modify (T9, T11, T14, T15, T19) | 3a's Task 10 text (parts B and A), clarifications requested by plans, and the §8.4 phase 3 note. |
| `docs/field-notes.md` | modify (every merge) | Statuses, and new entries from #110 (Procedure F). |
| `docs/plans/2026-10-13-phase-3{j-rally,k-pigpens,l-tractor}-notes.md` | create (T18), copies | The game plans' notes, copied from their game branches at merge. |
| `docs/plans/2026-10-13-phase-3-overview.md` | modify (by request only) | Contract changes (Procedure R, kind C), and the status line at 0.11.0. |
| `docs/plans/2026-10-12-progress.md` | modify (T21) | The resume page after phase 3. |

**four43** (commits on `feat/lion-hawk-3`):

| File | Action | Responsibility |
|---|---|---|
| `games/test/gate.mjs` | create (T3) | The gate runner: plan, run, parse, verdict, guarded-path check, perf budget. |
| `games/test/gate.test.mjs` | create (T3) | Caps, lock, order, CI, scratch guard, parsing, verdicts. |
| `games/test/owners.mjs` | create (T4) | `outside(plan, entries)`, `parseNameStatus`; the CLI over `git diff --name-status base...branch`. |
| `games/test/owners.test.mjs` | create (T4) | Ownership rules. |
| `games/test/perf/counters.mjs` | create (T5) | WebGL draw-call and program counters, injected into the page. |
| `games/test/perf/stats.mjs` | create (T5) | `summarise`, `judge` (R1/R3 budgets). |
| `games/test/perf/sizes.mjs` | create (T5) | `sizeReport(dir)`: bytes and gzip per file and in total. |
| `games/test/perf/probe.mjs` | create (T5) | Serve a built dir, open the game's desktop e2e opening, and measure. |
| `games/test/perf.test.mjs` | create (T5) | Counters, script injection, stats, budgets, sizes, server. |
| `games/test/helpers/scan.mjs` | create (T13) | `jsFiles`, `importsOf`. |
| `games/test/workspace.test.mjs` | modify (T13) | The D9 rule: no Rapier anywhere in the engine, no three in sim roots, three only bare or `three/addons/…` in view code. |
| `games/test/phase3-done.test.mjs` | create (T16), modify (T18) | The overview §1.3 rules for each game in `MIGRATED`. |
| `games/package.json`, `games/package-lock.json` | modify (per version, per game merge) | The lockfile after engine and game `package.json` changes. |

None of these files is run by `npm test` unless its name ends in `.test.mjs`. `node --test test/` selects only the `*.test.mjs` pattern; this was checked with a probe on Node 26.11.

---

## Procedures (used by the tasks; each task gives its own parameters)

### Procedure M: merge one sub-plan branch into `phase-3-integrate`

1. **Sync.** Run `git -C /home/smiller/projects/four43/lion-hawk-engine-3m merge --ff-only phase-3`.
   - If both branches moved (the controller committed docs on `phase-3`), run `git -C /home/smiller/projects/four43/lion-hawk-engine-3m rebase --rebase-merges phase-3`. This is safe because the integrate commits are not yet published.
2. **Evidence and ownership.**
   - The branch's notes file has its Done-when evidence: suite counts and the plan's own checks.
   - Run `node test/owners.mjs --repo /home/smiller/projects/four43/lion-hawk-engine --base phase-3 --branch <branch> --plan <3x>` from `/home/smiller/projects/four43/four43-lh3/games`. It prints `owners: <3x> stays inside its files`.
   - A file outside the row is either an approved ruling (add it to `OWNS` with the ruling's citation, a commit on `feat/lion-hawk-3`) or the branch goes back to its owner. Never merge over it.
3. **Merge.** Run `git -C /home/smiller/projects/four43/lion-hawk-engine-3m merge --no-ff <branch> -m "chore(merge): phase 3<x> <title>"`. Resolve conflicts as follows:
   - **add/add on a 3e stub** (`src/view/{assets,sync,audio}/index.js`, `src/view/materials/compiler.js`): take the owner's file (`git checkout --theirs <file>`; overview §4.6, 3e request 3);
   - **an owned file changed by two plans** (only possible for `engine.js`, `boot.js` or `headless.js` across waves): keep both changes, then run both plans' tests;
   - **anything else**: abort (`git merge --abort`) and send it to the owners through the controller.
4. **Integrator files for this branch.**
   - Exports (the task's code), keeping `test/package-phase3.test.mjs` in step: a requested extra name is added to `SURFACE` in the same commit.
   - The branch's integrator requests (Procedure R).
   - Field notes (Procedure F).
   - One commit per concern, for example `feat(exports): 3b materials and sidecar names in lion-hawk/sim`.
5. **Engine pre-gate in the integration worktree.** From `/home/smiller/projects/four43/four43-lh3/games`, run `node test/gate.mjs --engine /home/smiller/projects/four43/lion-hawk-engine-3m --only engine --log /tmp/claude-1000/lion-hawk-phase3/3m/gates/<version>-<3x>.log`.
   - Expected: `GATE PASS`.
   - The count is at least the previous gate's count plus the branch's new tests.
   - A drop needs a removed-test entry in the branch's notes.

### Procedure G: the gate for a version

1. **Freeze** (constraint 16).
2. **Publish.**
   - Run `git -C /home/smiller/projects/four43/lion-hawk-engine merge --ff-only phase-3-integrate`.
   - If the engine's `package.json` dependencies changed, run `npm install` in `/home/smiller/projects/four43/lion-hawk-engine`.
3. **Four43 lock.** In `/home/smiller/projects/four43/four43-lh3/games`:
   - run `npm install` (this refreshes the linked engine's version and dependencies in `games/package-lock.json`, and the `.bin/lion-hawk` link);
   - commit the lockfile if it changed: `chore(games): lock lion-hawk <version>`.
4. **Full gate.** From `/home/smiller/projects/four43/four43-lh3/games`:

   ```
   node test/gate.mjs --out /tmp/claude-1000/lion-hawk-phase3/3m/gates/<version>.json \
     --log /tmp/claude-1000/lion-hawk-phase3/3m/gates/<version>.log \
     --perf /tmp/claude-1000/lion-hawk-phase3/3m/builds/<version> \
     --baseline /tmp/claude-1000/lion-hawk-phase3/3m/baseline/baseline.json \
     --enforce <games past their view step, comma-separated, or omit>
   ```

   The gate covers:
   - the engine suites (all unit files, then each browser file);
   - the workspace (`npm test` in `games/`: `games/test` plus each game's unit suite, with `CI=1`);
   - Tractor's `TP_MP=engine` run while `test/mp.engine.harness.mjs` exists (2g's one named exception, the M-50 frozen-frame test, is allowed by name);
   - each game's `test:e2e`, `test:mobile` and `test:peers*`;
   - for each game with `game.config.js`, `lion-hawk build --out <scratch>` and the probe;
   - the guarded-path check.

   Expected: `GATE PASS`.
5. **Purity and goldens.**
   - The purity tests run inside the engine unit step and the workspace step.
   - Then `git -C /home/smiller/projects/four43/four43-lh3 diff --stat v-games-<previous>.. -- 'games/*/test/goldens'` lists only files that a game plan's §5.5 record names, by commit.
   - The previous four43 marker is the local tag `v-games-<version>` that this procedure sets on `feat/lion-hawk-3` in step 7.
   - An unrecorded golden change is a stop.
6. **Record** a row in the notes' Gates table:
   - the version and date;
   - the engine and four43 heads;
   - pass/fail per step;
   - the build sizes;
   - the probe numbers (also in the Frame-rate table);
   - the log path;
   - the verdict.
7. **Tag.**
   - `git -C /home/smiller/projects/four43/lion-hawk-engine tag -a v<version> -m "lion-hawk <version>: <wave>"`;
   - `git -C /home/smiller/projects/four43/four43-lh3 tag -a v-games-<version> -m "feat/lion-hawk-3 at lion-hawk <version>"`.
8. **Red gate.**
   - Fix forward on `phase-3-integrate`: a failing test first, then the fix, then Procedure M step 5, then step 2 of this procedure again.
   - Or roll back: `git -C /home/smiller/projects/four43/lion-hawk-engine reset --keep v<previous>`, then `npm install` again if the dependencies differ.
   - Either way, record it in the notes and lift the freeze only once the gate is green.
9. **Pickup** (Procedure P).

### Procedure P: how the game branches pick up an engine version

The `file:` link is a symlink, so engine code is live in every four43 worktree the moment `phase-3` moves. Pickup is therefore about everything except the code. Post this through the controller to each open game worktree (and to open engine worktrees that depend on the new version):

> lion-hawk `<version>` is on `phase-3` (gate log: `<path>`). In your worktree:
> 1. `git merge --no-edit feat/lion-hawk-3` (four43 game worktrees), or `git merge --no-edit phase-3` (engine worktrees), if your plan's prerequisites name this version.
> 2. `npm install` in `games/` (game worktrees) or at the root (engine worktrees). Expected: `git status --short` shows no lockfile change. If it does, send the diff to the integrator instead of committing it.
> 3. Run your plan's green suites and report the counts. A failure caused by the engine is an integrator request (kind X or a 0.10.x fix); a failure in your own code is yours.
> The freeze is lifted.

### Procedure R: integrator requests

1. **Intake.** Sources:
   - every plan's "Integrator requests" section, read once when the plan is assigned (Task 10, Task 12);
   - "Integrator requests" in notes files at merge;
   - messages relayed by the controller.

   Each request gets a row in the notes' Requests table: `ID` (`3c-R2`), from, kind, files, ask, decision, landed in, test.
2. **Kinds and handling:**
   - **E (exports, `package.json` `exports`/`bin`)**: landed at the branch's merge (Procedure M step 4). The name goes into `SURFACE` in `test/package-phase3.test.mjs` in the same commit.
   - **D (dependencies)**: landed at once on `phase-3-integrate`, then Procedure M step 5, then published by Procedure G steps 1–2 as a patch (or with the next version if that is due). Each open worktree that needs it is told to `npm install`.
   - **S (spec, CHANGELOG, field-note text)**: at the merge (Procedure F for notes). Spec text a plan supplies verbatim is applied verbatim. Otherwise the integrator writes it from the merged code and cites the requirement ID.
   - **C (a contract change in overview §4, or a cross-plan ruling)**: the controller rules (and records it in `2026-10-13-phase-3-contract-issues.md`). The integrator then edits the overview, commits `docs(plan): <ruling>`, and broadcasts it to every open worktree. It is logged in the Broadcasts table.
   - **X (a change in a file another plan owns)**: forwarded to the owner through the controller while the owner's branch is open. Once the owner has merged, the integrator makes it as a cross-cutting fix on `phase-3-integrate`: a failing test first (in a new test file), then the fix, Procedure M step 5, and a patch version.
   - **G (`games/test/**`, `games/package*.json`)**: done on `feat/lion-hawk-3`, with a test where behaviour changes, then broadcast with Procedure P step 1.
   - **P (a purity allowlist line)**: only with a reason line in the notes and the controller's agreement. Never for `Date.now`, `Math.random` or a `three` import in a sim root.
3. **Order.** A request that blocks an open plan (its plan says "stop and report" otherwise) goes first. All others land at the next merge.
4. **Reply.** Tell the requester, through the controller, the commit, the version and the test that pins it.

### Procedure F: field notes at a merge

1. Open the merged plan's notes file (for a game, the copy in the engine's `docs/plans/`) and its "Field note candidates" section.
2. Give the candidates the next free numbers in their listed order, starting at #110 for the first merge and continuing across merges.
3. For each, write a `### <n>. <title>: <games or engine> (phase 3<x>)` entry in `docs/field-notes.md`, placed at the end, with four bullets:
   - `- **What happened:**`
   - `- **Workaround:**`
   - `- **Engine change:**`
   - `- **Status:**`
4. Add the matching index row `| <n> | <theme> | <game> | <status> |` at the end of the index table.
5. Append ` → #<n>` to the candidate's line in the notes file, and add a row to the notes' Field-note map.
6. Update the statuses of existing notes that the merged plan closes:
   - the plan's notes or requests say which;
   - known closers: 3a closes #95, #100, #105, #107, #108, #109; 3c closes #1, #2, #106 and touches #28 and #64; 3d closes #11; 3g closes #67;
   - the new status is `done (<version>, 3<x>): <one-line outcome>` in both the entry and the index row.
7. Run `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/field-notes.test.mjs`. Expected: PASS.
8. Commit `docs(field-notes): #<first>–#<last> from 3<x>; <closed numbers> done`.

---

## Tasks

### Task 1: Worktrees and branches

**Files:** none (git state only). The result is recorded in the notes in Task 2.
**Interfaces:** Consumes overview §6. Produces the trees in "Paths" (engine sub-plan worktrees for 3a only; the rest in Tasks 10 and 12).

- [ ] **Step 1: Check the base.**
  - Run `git -C /home/smiller/projects/four43/lion-hawk-engine merge-base --is-ancestor 27e4701 phase-3 && echo base-ok` and `git -C /home/smiller/projects/four43/lion-hawk-engine log --oneline 27e4701..phase-3`.
  - Expected: `base-ok`, and only `docs(plan)` commits (the overview, survey, contract issues and plans). A code commit there is a stop: report it.
- [ ] **Step 2: Integration worktree.**
  - Run `git -C /home/smiller/projects/four43/lion-hawk-engine worktree add /home/smiller/projects/four43/lion-hawk-engine-3m -b phase-3-integrate phase-3`, then `npm install` in it under `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m npm install`.
  - Expected: `node_modules/three/package.json` exists in the new tree.
- [ ] **Step 3: 3a's worktree** (3a is cut first; overview §6).
  - Run `git -C /home/smiller/projects/four43/lion-hawk-engine worktree add /home/smiller/projects/four43/lion-hawk-engine-3a -b phase-3-carryovers phase-3` and `npm install` in it, as in step 2.
- [ ] **Step 4: four43 integration branch and worktree.**
  - Run `git -C /home/smiller/projects/four43/four43-lion-hawk branch feat/lion-hawk-3 e03ed71`.
  - Run `git -C /home/smiller/projects/four43/four43-lion-hawk worktree add /home/smiller/projects/four43/four43-lh3 feat/lion-hawk-3`.
  - Run `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games npm install`.
- [ ] **Step 5: Verify the link.**
  - Run `readlink -f /home/smiller/projects/four43/four43-lh3/games/node_modules/lion-hawk`. Expected: `/home/smiller/projects/four43/lion-hawk-engine`.
  - Run `git -C /home/smiller/projects/four43/four43-lh3 status --short`. Expected: nothing (no lockfile drift at 0.7.2). If the lockfile changed, run `git -C /home/smiller/projects/four43/four43-lh3 diff --stat` and record it; do not commit yet.
- [ ] **Step 6: Note pre-existing dirt** in today's tree without touching it: `git -C /home/smiller/projects/four43/four43-lion-hawk status --short`. On 2026-10-13 it showed ` M site/exp/piggie-game/index.html` and ` M site/exp/piggie-game/sw.js` (an earlier Pig Pens `build.py` run). Record the output for the hand-off (Task 21). Constraint 8 forbids restoring it.

### Task 2: The integration notes (ledger)

**Files:** create `docs/plans/2026-10-13-phase-3m-integration-notes.md` (engine, `phase-3-integrate`).
**Interfaces:** Produces the ledger sections that later tasks append to.

- [ ] **Step 1: Write the file** with exactly this skeleton (tables get rows later):

```markdown
# Phase 3m: integration notes (ledger)

Plan: `2026-10-13-phase-3m-integration.md`. Owner: the integrator. Every gate, request, broadcast and field-note number is recorded here before it is announced.

## Paths

| Name | Path | Branch | Created |
|---|---|---|---|
| Engine main checkout | /home/smiller/projects/four43/lion-hawk-engine | phase-3 | (exists) |
| Integration worktree | /home/smiller/projects/four43/lion-hawk-engine-3m | phase-3-integrate | <date> |
| 3a | /home/smiller/projects/four43/lion-hawk-engine-3a | phase-3-carryovers | <date> |
| four43 integration | /home/smiller/projects/four43/four43-lh3 | feat/lion-hawk-3 | <date> |
| Scratch | /tmp/claude-1000/lion-hawk-phase3/3m | — | <date> |

Pre-existing state found at Task 1: (paste `git status --short` of four43-lion-hawk)

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
```

- [ ] **Step 2: Fill the Paths table** from Task 1 (dates, and the pre-existing state line).
- [ ] **Step 3: Commit and publish.**
  - Run `git -C /home/smiller/projects/four43/lion-hawk-engine-3m add docs/plans/2026-10-13-phase-3m-integration-notes.md && git -C /home/smiller/projects/four43/lion-hawk-engine-3m commit -m "docs(plan): phase 3m integration ledger"`.
  - Then run `git -C /home/smiller/projects/four43/lion-hawk-engine merge --ff-only phase-3-integrate`. This is docs only, so no freeze is needed.

### Task 3: The gate runner

**Files:** create `games/test/gate.mjs` and `games/test/gate.test.mjs` (four43, `feat/lion-hawk-3`).
**Interfaces:**
- Consumes: overview §7.5 command forms; `games/package.json` `workspaces`; each member's `package.json` `scripts`; `perf/stats.mjs` `judge` (Task 5; the import is lazy, so this task does not depend on it).
- Produces:
  - `LOCK`;
  - `unit(dir, argv, env)` and `browser(dir, argv, env)` → `{ kind, dir, cmd }`;
  - `engineFiles(engine)` → `{ unit: string[], browser: string[] }`;
  - `members(games)` → `[{ name, dir, scripts, extras, buildable }]`;
  - `gatePlan({ engine, games, members, engineUnit, engineBrowser, perf, only })` → `Step[]`;
  - `parseCounts(text)` → `{ pass, fail, failed }`;
  - `verdict(step, row)` → `'pass' | 'pass (allowed)' | 'FAIL'`;
  - `dirtyGuarded(porcelain)` → `string[]`;
  - the CLI.

- [ ] **Step 1: Write the failing test** `games/test/gate.test.mjs`:

```js
// games/test/gate.test.mjs: the integrator's gate runs every suite under the phase 3 caps (overview §7.5), browser
// suites one at a time behind the shared lock, and never writes a golden or a site file (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatePlan, engineFiles, parseCounts, verdict, dirtyGuarded, LOCK } from './gate.mjs';

const M = [
  { name: 'rally', dir: '/g/rally', scripts: { test: 't', 'test:e2e': 'e', 'test:mobile': 'm', bake: 'b' }, extras: [], buildable: true },
  { name: 'tractor-pickup', dir: '/g/tractor-pickup', scripts: { test: 't', 'test:e2e': 'e' },
    extras: [{ name: 'TP_MP=engine', env: { TP_MP: 'engine' }, argv: ['npm', 'test'], allow: [/with the game frozen/] }], buildable: false },
];
const plan = (o = {}) => gatePlan({ engine: '/e', games: '/g', members: M, engineUnit: ['test/a.test.mjs', 'test/kits/b.test.mjs'],
  engineBrowser: ['test/e2e.test.mjs', 'test/hold-e2e.test.mjs'], perf: '/tmp/claude-1000/lion-hawk-phase3/3m/builds/x', ...o });
const arg = (cmd, k) => cmd[cmd.indexOf(k) + 1];

test('unit steps: 2G, no swap, 600 s, a 512 MB heap, never the lock; node --test always runs four files at a time', () => {
  const units = plan().filter(s => s.kind === 'unit');
  assert.equal(units.length, 4);
  for (const s of units) {
    assert.equal(s.cmd[0], 'systemd-run', s.name);
    for (const p of ['MemoryMax=2G', 'MemorySwapMax=0', 'RuntimeMaxSec=600', 'NODE_OPTIONS=--max-old-space-size=512']) assert.ok(s.cmd.includes(p), `${s.name}: ${p}`);
    assert.ok(!s.cmd.includes('flock'), s.name);
    const i = s.cmd.indexOf('node');
    if (i >= 0 && s.cmd[i + 1] === '--test') assert.equal(s.cmd[i + 2], '--test-concurrency=4', s.name);
  }
});
test('browser steps: behind the shared lock, 3G, 900 s, a 2048 MB heap, one file or script each', () => {
  const b = plan().filter(s => s.kind === 'browser');
  assert.deepEqual(b.map(s => s.name), ['engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs', 'rally test:e2e', 'rally test:mobile', 'tractor-pickup test:e2e', 'rally probe']);
  for (const s of b) {
    assert.deepEqual(s.cmd.slice(0, 3), ['flock', LOCK, 'systemd-run'], s.name);
    for (const p of ['MemoryMax=3G', 'MemorySwapMax=0', 'RuntimeMaxSec=900', 'NODE_OPTIONS=--max-old-space-size=2048']) assert.ok(s.cmd.includes(p), `${s.name}: ${p}`);
  }
  assert.equal(LOCK, '/tmp/claude-1000/lion-hawk-browser.lock');
  assert.deepEqual(b[0].cmd.slice(-4), ['node', '--test', '--test-concurrency=4', 'test/e2e.test.mjs']);
});
test('game steps run with CI=1 (a missing golden fails) and no step sets LH_BLESS', () => {
  for (const s of plan()) {
    assert.ok(!s.cmd.some(a => /LH_BLESS/.test(a)), s.name);
    if (s.dir !== '/e' && !/ (build|probe)$/.test(s.name)) assert.ok(s.cmd.includes('CI=1'), s.name);
  }
});
test('order: engine unit, engine browser, workspace, extras, game browser, then builds and probes; --only filters', () => {
  assert.deepEqual(plan().map(s => s.name), ['engine unit', 'engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs', 'workspace',
    'tractor-pickup TP_MP=engine', 'rally test:e2e', 'rally test:mobile', 'tractor-pickup test:e2e', 'rally build', 'rally probe']);
  assert.deepEqual(plan({ only: ['engine'] }).map(s => s.name), ['engine unit', 'engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs']);
  assert.deepEqual(plan({ perf: null }).filter(s => / (build|probe)$/.test(s.name)), []);
});
test('builds go to the scratch dir, never under a site/ dir (global constraint 8)', () => {
  assert.equal(arg(plan().find(s => s.name === 'rally build').cmd, '--out'), '/tmp/claude-1000/lion-hawk-phase3/3m/builds/x/rally');
  assert.throws(() => plan({ perf: '/home/smiller/projects/four43/four43-lh3/site/exp' }), /under a site\/ dir/);
});
test('engineFiles: a test file that calls launch( is a browser suite; test/ is walked recursively', () => {
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  mkdirSync(join(d, 'test/kits'), { recursive: true });
  writeFileSync(join(d, 'test/a.test.mjs'), "test('x', () => {});");
  writeFileSync(join(d, 'test/e2e.test.mjs'), 'const chrome = await launch();');
  writeFileSync(join(d, 'test/kits/k.test.mjs'), "test('k', () => {});");
  writeFileSync(join(d, 'test/helper.mjs'), 'launch();');
  assert.deepEqual(engineFiles(d), { unit: ['test/a.test.mjs', 'test/kits/k.test.mjs'], browser: ['test/e2e.test.mjs'] });
});
test('parseCounts sums every node:test summary and lists each failing test once', () => {
  const name = 'the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)';
  const out = ['✔ a (1ms)', `✖ ${name} (12.5ms)`, 'ℹ pass 3', 'ℹ fail 1', '> rally', 'ℹ pass 26', 'ℹ fail 0', '✖ failing tests:', '', `✖ ${name} (12.5ms)`].join('\n');
  assert.deepEqual(parseCounts(out), { pass: 29, fail: 1, failed: [name] });
});
test('verdict: exit 0 passes; a failure passes only when every failing test is allowed by name', () => {
  const step = { allow: [/with the game frozen/] };
  assert.equal(verdict(step, { status: 0, fail: 0, failed: [] }), 'pass');
  assert.equal(verdict(step, { status: 1, fail: 1, failed: ['… with the game frozen (rAF paused) …'] }), 'pass (allowed)');
  assert.equal(verdict(step, { status: 1, fail: 2, failed: ['… with the game frozen …', 'another'] }), 'FAIL');
  assert.equal(verdict({}, { status: 1, fail: 1, failed: ['x'] }), 'FAIL');
  assert.equal(verdict(step, { status: 1, fail: 0, failed: [] }), 'FAIL'); // a crash or an OOM kill, not a test failure
});
test('dirtyGuarded flags changes under site/ and in game goldens only', () => {
  const porcelain = [' M games/rally/test/goldens/stage-scene.json', '?? site/exp/rally/index.html', ' M games/rally/src/sim.js', '?? games/test/x.mjs', ''].join('\n');
  assert.deepEqual(dirtyGuarded(porcelain), [' M games/rally/test/goldens/stage-scene.json', '?? site/exp/rally/index.html']);
});
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/gate.test.mjs`. Expected: FAIL with `Cannot find module '…/games/test/gate.mjs'`.
- [ ] **Step 3: Implement** `games/test/gate.mjs`:

```js
// games/test/gate.mjs: the phase 3 integrator's cross-game gate (lion-hawk 3m, Procedure G). Runs every suite one after
// another under the overview §7.5 caps: unit suites capped at 2G, browser suites one at a time behind the shared flock,
// then optional builds into a scratch dir and the frame-rate probe. Not a test file (node --test runs *.test.mjs only).
//   node test/gate.mjs [--engine <dir>] [--only engine,workspace,browser,perf] [--perf <scratch dir>]
//                      [--baseline <json>] [--enforce rally,pig-pens] [--out <json>] [--log <file>] [--dry]
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const LOCK = '/tmp/claude-1000/lion-hawk-browser.lock';
const CAP = { unit: ['MemoryMax=2G', 'RuntimeMaxSec=600', 512], browser: ['MemoryMax=3G', 'RuntimeMaxSec=900', 2048] };
const envArgs = e => Object.entries(e).flatMap(([k, v]) => ['-E', `${k}=${v}`]);
function wrap(kind, dir, argv, env = {}) {
  const [mem, runtime, heap] = CAP[kind];
  const run = ['systemd-run', '--user', '--wait', '-P', '-p', mem, '-p', 'MemorySwapMax=0', '-p', runtime,
    `--working-directory=${dir}`, '-E', `NODE_OPTIONS=--max-old-space-size=${heap}`, ...envArgs(env), ...argv];
  return { kind, dir, cmd: kind === 'browser' ? ['flock', LOCK, ...run] : run };
}
export const unit = (dir, argv, env) => wrap('unit', dir, argv, env);
export const browser = (dir, argv, env) => wrap('browser', dir, argv, env);

export function engineFiles(engine) {
  const files = readdirSync(join(engine, 'test'), { recursive: true }).filter(f => f.endsWith('.test.mjs')).sort().map(f => `test/${f}`);
  const isBrowser = f => /\blaunch\s*\(/.test(readFileSync(join(engine, f), 'utf8'));
  return { unit: files.filter(f => !isBrowser(f)), browser: files.filter(isBrowser) };
}

export function members(games) {
  const root = JSON.parse(readFileSync(join(games, 'package.json'), 'utf8'));
  return root.workspaces.map(name => {
    const dir = join(games, name), pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    // 2g: Tractor's engine-driven mp harness, with its one named exception (the M-50 frozen-frame test). Gone once 3l deletes it.
    const extras = existsSync(join(dir, 'test/mp.engine.harness.mjs'))
      ? [{ name: 'TP_MP=engine', env: { TP_MP: 'engine' }, argv: ['npm', 'test'], allow: [/with the game frozen \(rAF paused\)/] }] : [];
    return { name, dir, scripts: pkg.scripts ?? {}, extras, buildable: existsSync(join(dir, 'game.config.js')) };
  });
}

export function gatePlan({ engine, games, members, engineUnit, engineBrowser, perf = null, only = null }) {
  if (perf && /(^|\/)site(\/|$)/.test(resolve(perf))) throw new Error(`gate: --perf ${perf} is under a site/ dir (global constraint 8)`);
  const want = k => !only || only.includes(k), steps = [];
  if (want('engine')) {
    steps.push({ name: 'engine unit', ...unit(engine, ['node', '--test', '--test-concurrency=4', ...engineUnit]) });
    for (const f of engineBrowser) steps.push({ name: `engine ${f}`, ...browser(engine, ['node', '--test', '--test-concurrency=4', f]) });
  }
  if (want('workspace')) {
    steps.push({ name: 'workspace', ...unit(games, ['npm', 'test'], { CI: '1' }) });
    for (const m of members) for (const x of m.extras) steps.push({ name: `${m.name} ${x.name}`, allow: x.allow, ...unit(m.dir, x.argv, { CI: '1', ...x.env }) });
  }
  if (want('browser')) {
    for (const m of members) for (const s of Object.keys(m.scripts).filter(k => /^test:(e2e|mobile|peers)/.test(k)).sort()) {
      steps.push({ name: `${m.name} ${s}`, ...browser(m.dir, ['npm', 'run', s], { CI: '1' }) });
    }
  }
  if (want('perf') && perf) {
    for (const m of members.filter(m => m.buildable)) {
      const out = join(perf, m.name), probe = join(perf, `${m.name}.probe.json`);
      steps.push({ name: `${m.name} build`, out, ...unit(m.dir, ['npx', 'lion-hawk', 'build', '--out', out]) });
      steps.push({ name: `${m.name} probe`, probe, game: m.name, ...browser(games, ['node', 'test/perf/probe.mjs', '--game', m.name, '--dir', out, '--out', probe]) });
    }
  }
  return steps;
}

export function parseCounts(text) {
  const sum = re => [...text.matchAll(re)].reduce((t, m) => t + Number(m[1]), 0);
  const failed = [...new Set([...text.matchAll(/^\s*✖ (.+?) \(\d[\d.]*m?s\)\s*$/gm)].map(m => m[1]))];
  return { pass: sum(/^ℹ pass (\d+)$/gm), fail: sum(/^ℹ fail (\d+)$/gm), failed };
}

export function verdict(step, row) {
  if (row.status === 0) return 'pass';
  if (step.allow && row.fail > 0 && row.failed.length > 0 && row.failed.every(n => step.allow.some(re => re.test(n)))) return 'pass (allowed)';
  return 'FAIL';
}

export const dirtyGuarded = porcelain => porcelain.split('\n').filter(l => /^(site\/|games\/[^/]+\/test\/goldens\/)/.test(l.slice(3)));

async function main() {
  const { values: o } = parseArgs({ options: {
    engine: { type: 'string' }, only: { type: 'string' }, perf: { type: 'string' }, baseline: { type: 'string' },
    enforce: { type: 'string' }, out: { type: 'string' }, log: { type: 'string' }, dry: { type: 'boolean' } } });
  const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const engine = realpathSync(o.engine ?? join(games, '../../lion-hawk-engine'));
  const { unit: engineUnit, browser: engineBrowser } = engineFiles(engine);
  const steps = gatePlan({ engine, games, members: members(games), engineUnit, engineBrowser, perf: o.perf && resolve(o.perf), only: o.only?.split(',') });
  if (o.dry) { for (const s of steps) console.log(`${s.name}\n  ${s.cmd.join(' ')}`); return; }
  const log = o.log ?? '/tmp/claude-1000/lion-hawk-phase3/3m/gates/gate.log';
  mkdirSync(dirname(log), { recursive: true });
  const rows = [];
  for (const s of steps) {
    if (s.out) rmSync(s.out, { recursive: true, force: true });
    const t0 = Date.now(), r = spawnSync(s.cmd[0], s.cmd.slice(1), { encoding: 'utf8', maxBuffer: 1 << 28 });
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`;
    appendFileSync(log, `\n### ${s.name}\n$ ${s.cmd.join(' ')}\n${text}`);
    const row = { name: s.name, kind: s.kind, status: r.status, ...parseCounts(text), s: Math.round((Date.now() - t0) / 1000) };
    row.verdict = verdict(s, row);
    rows.push(row);
    console.log(`${row.verdict.padEnd(15)} ${s.name}  pass ${row.pass} fail ${row.fail}  ${row.s}s`);
  }
  const dirty = dirtyGuarded(spawnSync('git', ['-C', dirname(games), 'status', '--porcelain'], { encoding: 'utf8' }).stdout ?? '');
  for (const l of dirty) console.log(`FAIL            guarded path changed: ${l}`);
  const budget = [];
  if (o.baseline && o.perf) {
    const { judge } = await import('./perf/stats.mjs');
    const base = JSON.parse(readFileSync(o.baseline, 'utf8')), enforce = new Set(o.enforce?.split(',') ?? []);
    for (const s of steps.filter(s => s.probe && existsSync(s.probe))) {
      const now = JSON.parse(readFileSync(s.probe, 'utf8'));
      for (const msg of judge(base[s.game], now)) budget.push({ game: s.game, msg, enforced: enforce.has(s.game) });
    }
    for (const b of budget) console.log(`${b.enforced ? 'FAIL' : 'note'}            ${b.game}: ${b.msg}`);
  }
  const ok = rows.every(r => r.verdict !== 'FAIL') && dirty.length === 0 && !budget.some(b => b.enforced);
  if (o.out) { mkdirSync(dirname(o.out), { recursive: true }); writeFileSync(o.out, JSON.stringify({ ok, engine, rows, dirty, budget }, null, 1) + '\n'); }
  console.log(ok ? 'GATE PASS' : 'GATE FAIL');
  process.exitCode = ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
```

- [ ] **Step 4: Run** the step 2 command. Expected: PASS, 9 tests.
- [ ] **Step 5: Prove the caps test red by mutation.**
  - In `gate.mjs` change `'MemoryMax=2G'` to `'MemoryMax=4G'` and run step 2. Expected: FAIL on `unit steps: … MemoryMax=2G`.
  - Revert. Then delete `['flock', LOCK, ...run]` → `run` and run again. Expected: FAIL on `browser steps`.
  - Revert and re-run. Expected: PASS.
- [ ] **Step 6: Dry run** from `/home/smiller/projects/four43/four43-lh3/games`: `node test/gate.mjs --dry`. Expected:
  - the engine unit step lists every `test/*.test.mjs` except the five browser files (`bridge-e2e`, `e2e`, `hold-e2e`, `load-e2e`, `touch-e2e`);
  - the workspace step, `tractor-pickup TP_MP=engine`, `pig-pens test:e2e`, `rally test:e2e`, `rally test:mobile` and `tractor-pickup test:e2e`;
  - no build steps (no `game.config.js` yet).
- [ ] **Step 7: Commit:** `git -C /home/smiller/projects/four43/four43-lh3 add games/test/gate.mjs games/test/gate.test.mjs && git -C /home/smiller/projects/four43/four43-lh3 commit -m "test(games): phase 3 gate runner under the memory caps and the browser lock"`

### Task 4: The ownership checker

**Files:** create `games/test/owners.mjs` and `games/test/owners.test.mjs`.
**Interfaces:**
- Consumes: overview §5.2 "Owns", amended by the controller's rulings:
  - 3a may edit `src/view/hook.js`, `test/gesture.test.mjs` and `test/uiDom.test.mjs`;
  - 3c may edit `test/engine.test.mjs`;
  - 3e ships the stub `src/view/materials/compiler.js`.
- Produces: `OWNS`, `outside(plan, entries)`, `parseNameStatus(text)`, and the CLI `node test/owners.mjs --repo <dir> --base <ref> --branch <ref> --plan <3x>` (exit 1 when anything is outside).

- [ ] **Step 1: Write the failing test** `games/test/owners.test.mjs`:

```js
// games/test/owners.test.mjs: a phase 3 branch may change only its own files (overview §5.2 and the rulings in
// 2026-10-13-phase-3-contract-issues.md), new test files, and its own notes; integrator files are nobody's (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { outside, parseNameStatus, OWNS } from './owners.mjs';

const e = (status, path) => ({ status, path });
const paths = list => list.map(x => x.path);

test('a plan stays inside its own files, its notes and new test files', () => {
  assert.deepEqual(outside('3b', [e('M', 'src/defs/materials.js'), e('A', 'src/defs/sidecar.js'), e('A', 'test/materials-pairs.test.mjs'),
    e('A', 'test/helpers/mat.mjs'), e('A', 'docs/plans/2026-10-13-phase-3b-materials-notes.md')]), []);
  assert.deepEqual(outside('3h', [e('A', 'src/kits/terrain/sim.js'), e('M', 'test/kits/terrain.test.mjs')]), []);
});
test('integrator files are outside every plan', () => {
  const integ = ['src/index.sim.js', 'src/index.view.js', 'src/index.net.js', 'testing/index.js', 'src/version.js', 'package.json',
    'package-lock.json', 'CHANGELOG.md', 'docs/spec.md', 'docs/field-notes.md', 'docs/plans/2026-10-13-phase-3-overview.md', 'testing/purity.js'];
  for (const plan of Object.keys(OWNS)) assert.deepEqual(paths(outside(plan, integ.map(p => e('M', p)))), integ, plan);
});
test('an existing test changed by a plan that does not own it is outside; rulings widen a row', () => {
  assert.deepEqual(paths(outside('3b', [e('M', 'test/engine.test.mjs')])), ['test/engine.test.mjs']);
  assert.deepEqual(outside('3c', [e('M', 'test/engine.test.mjs')]), []);
  assert.deepEqual(outside('3a', [e('M', 'src/view/hook.js'), e('M', 'test/gesture.test.mjs'), e('M', 'test/uiDom.test.mjs')]), []);
  assert.deepEqual(outside('3e', [e('A', 'src/view/materials/compiler.js')]), []);
  assert.deepEqual(outside('3i', [e('M', 'test/mp.test.mjs')]), []);
});
test("one plan's files are outside another's; game plans own only their game", () => {
  assert.deepEqual(paths(outside('3f', [e('M', 'src/view/boot.js')])), ['src/view/boot.js']);
  assert.deepEqual(paths(outside('3l', [e('M', 'games/rally/src/sim.js'), e('M', 'games/test/workspace.test.mjs'), e('M', 'games/package-lock.json'),
    e('A', 'games/tractor-pickup/baked/phys.json'), e('A', 'games/tractor-pickup/docs/plans/2026-10-13-phase-3l-tractor-notes.md')])),
    ['games/rally/src/sim.js', 'games/test/workspace.test.mjs', 'games/package-lock.json']);
  assert.throws(() => outside('3z', []), /unknown plan '3z'/);
});
test('parseNameStatus takes the new path of a rename', () => {
  assert.deepEqual(parseNameStatus('M\tsrc/a.js\nR087\tsrc/b.js\tsrc/c.js\nA\ttest/x.test.mjs\n'), [e('M', 'src/a.js'), e('R', 'src/c.js'), e('A', 'test/x.test.mjs')]);
});
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/owners.test.mjs`. Expected: FAIL with `Cannot find module '…/games/test/owners.mjs'`.
- [ ] **Step 3: Implement** `games/test/owners.mjs`:

```js
// games/test/owners.mjs: files a phase 3 branch changed outside its plan's "Owns" column (overview §5.2), widened by the
// controller's rulings (2026-10-13-phase-3-contract-issues.md). New files under test/ (tests, fixtures, helpers) and the
// plan's own notes are every engine plan's; integrator files are nobody's (lion-hawk 3m, Procedure M step 2).
//   node test/owners.mjs --repo <git dir> --base <ref> --branch <ref> --plan <3a…3l>
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const T = names => new RegExp(`^test/(${names})[^/]*$`);
export const OWNS = Object.freeze({
  '3a': [/^src\/core\/engine\.js$/, /^src\/view\/(boot|gesture|hook)\.js$/, /^testing\/(headless|playwright)\.js$/, T('domAsserts|gesture\\.test|uiDom\\.test')],
  '3b': [/^src\/defs\/(materials|materials\.base|sidecar)\.js$/, T('materials|sidecar')],
  '3c': [/^src\/core\/(engine|schedule)\.js$/, /^src\/sim\/(world|physics)\//, /^testing\/(headless|invariants|checks)\.js$/, /^test\/fixtures\/phys\//,
    T('world|physics|checks|engine\\.test')],
  '3d': [/^tools\//, /^bin\//, /^test\/fixtures\/models\//, T('bake|build|cli')],
  '3e': [/^src\/view\/boot\.js$/, /^src\/view\/render\//, /^src\/view\/(assets|sync|audio)\/index\.js$/, /^src\/view\/materials\/compiler\.js$/, T('render|e2e-render')],
  '3f': [/^src\/view\/(assets|materials)\//, T('assets|compiler')],
  '3g': [/^src\/view\/(sync|camera|instancing|audio)\//, T('sync|camera|audio|instancing|crowd')],
  '3h': [/^src\/kits\//, /^test\/kits\//],
  '3i': [/^src\/sim\/net\//, /^src\/defs\/fields\.js$/, /^src\/sim\/(replica|interp|forecast)\.js$/, /^testing\/mp\.js$/, T('net|mp')],
  '3j': [/^games\/rally\//],
  '3k': [/^games\/pig-pens\//],
  '3l': [/^games\/tractor-pickup\//],
});
const GAME = new Set(['3j', '3k', '3l']);

export function outside(plan, entries) {
  const rules = OWNS[plan];
  if (!rules) throw new Error(`owners: unknown plan '${plan}' (known: ${Object.keys(OWNS).join(', ')})`);
  const notes = new RegExp(`^docs/plans/2026-10-13-phase-${plan}-[^/]*\\.md$`);
  const ok = ({ status, path }) => rules.some(re => re.test(path))
    || (!GAME.has(plan) && (notes.test(path) || (status === 'A' && /^test\//.test(path))));
  return entries.filter(x => !ok(x));
}

export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map(line => { const f = line.split('\t'); return { status: f[0][0], path: f.at(-1) }; });
}

function main() {
  const { values: o } = parseArgs({ options: { repo: { type: 'string' }, base: { type: 'string' }, branch: { type: 'string' }, plan: { type: 'string' } } });
  const r = spawnSync('git', ['-C', o.repo, 'diff', '--name-status', '-M', `${o.base}...${o.branch}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`owners: git diff failed: ${r.stderr}`);
  const bad = outside(o.plan, parseNameStatus(r.stdout));
  for (const x of bad) console.log(`outside ${o.plan}: ${x.status} ${x.path}`);
  console.log(bad.length ? `owners: ${bad.length} file(s) outside ${o.plan}` : `owners: ${o.plan} stays inside its files`);
  process.exitCode = bad.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
```

- [ ] **Step 4: Run** the step 2 command. Expected: PASS, 5 tests.
- [ ] **Step 5: Prove red by mutation.** Remove `|hook` from 3a's rule and run. Expected: FAIL on `rulings widen a row`. Revert, re-run, PASS.
- [ ] **Step 6: Smoke the CLI on a real branch** from `/home/smiller/projects/four43/four43-lh3/games`: `node test/owners.mjs --repo /home/smiller/projects/four43/lion-hawk-engine --base phase-3 --branch phase-3-carryovers --plan 3a`. Expected: `owners: 3a stays inside its files` (an empty diff before 3a has commits).
- [ ] **Step 7: Commit:** `git -C /home/smiller/projects/four43/four43-lh3 add games/test/owners.mjs games/test/owners.test.mjs && git -C /home/smiller/projects/four43/four43-lh3 commit -m "test(games): phase 3 branch ownership check before each merge"`

### Task 5: Perf tools (counters, stats, sizes, probe)

**Files:** create `games/test/perf/counters.mjs`, `games/test/perf/stats.mjs`, `games/test/perf/sizes.mjs`, `games/test/perf/probe.mjs` and `games/test/perf.test.mjs`.
**Interfaces:**
- Consumes: `lion-hawk/playwright` (`launch`, `openGame` with `initScript: { content }` (#74), `expectScene`, `game.step`, `game.errors`, `game.close`).
- Produces:
  - `installCounters(protos, raf)` → `{ reset(), read() }`;
  - `probeScript()` → string;
  - `summarise({ programs, perFrame, frameMs })`;
  - `judge(base, now)` → `string[]`;
  - `sizeReport(dir)` → `{ files, total: { bytes, gzip } }`;
  - `serveDir(dir)` → `Promise<{ url, close }>`;
  - `GAMES`;
  - the CLI `node test/perf/probe.mjs --game <id> --dir <built dir> [--runs 3] [--frames 120] [--out <json>]`. Its output JSON is `{ game, dir, settledMs, programs, drawsMedian, drawsMax, frameMsMedian, frameMsP95, frames, size: { bytes, gzip }, errors }`.

- [ ] **Step 1: Write the failing test** `games/test/perf.test.mjs`:

```js
// games/test/perf.test.mjs: the frame-rate and size probe's parts (overview §8 R1, R3; lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { installCounters, probeScript } from './perf/counters.mjs';
import { summarise, judge } from './perf/stats.mjs';
import { sizeReport } from './perf/sizes.mjs';
import { serveDir, GAMES } from './perf/probe.mjs';

const fakeGl = () => class { drawArrays(n) { return n * 2; } drawElements() { return this; } drawElementsInstanced() {} createProgram() { return { id: 1 }; } };
const rafQueue = () => { const q = []; return { raf: f => q.push(f), flush: t => { for (const f of q.splice(0)) f(t); } }; };

test('installCounters counts draws and programs and keeps this and return values', () => {
  const Gl = fakeGl(), probe = installCounters([Gl.prototype], rafQueue().raf), gl = new Gl();
  assert.equal(gl.drawArrays(3), 6);
  assert.equal(gl.drawElements(), gl);
  gl.drawElementsInstanced();
  assert.deepEqual(gl.createProgram(), { id: 1 });
  assert.equal(probe.read().draws, 3);
  assert.equal(probe.read().programs, 1);
});
test('each rAF tick records the draws and the time since the last tick; reset starts a new window', () => {
  const Gl = fakeGl(), q = rafQueue(), probe = installCounters([Gl.prototype], q.raf), gl = new Gl();
  q.flush(100);
  gl.drawArrays(1); gl.drawArrays(1); q.flush(116);
  gl.drawArrays(1); q.flush(150);
  assert.deepEqual(probe.read().perFrame, [2, 1]);
  assert.deepEqual(probe.read().frameMs, [16, 34]);
  probe.reset();
  gl.drawArrays(1); q.flush(160); gl.drawArrays(1); q.flush(170);
  assert.deepEqual(probe.read().perFrame, [1]);
  assert.deepEqual(probe.read().frameMs, [10]);
});
test('probeScript puts __lhProbe on the page global and wraps the WebGL2 prototype', () => {
  const Gl2 = fakeGl(), q = rafQueue(), ctx = vm.createContext({ WebGL2RenderingContext: Gl2, requestAnimationFrame: q.raf });
  vm.runInContext(probeScript(), ctx);
  new Gl2().drawArrays(1);
  assert.equal(ctx.__lhProbe.read().draws, 1);
});
test('summarise takes the upper median and the 95th percentile', () => {
  assert.deepEqual(summarise({ programs: 9, perFrame: [4, 1, 3, 2], frameMs: [10, 40, 20, 30] }),
    { programs: 9, drawsMedian: 3, drawsMax: 4, frameMsMedian: 30, frameMsP95: 40, frames: 4 });
  assert.equal(summarise({ programs: 0, perFrame: [], frameMs: [] }).drawsMedian, null);
});
const BASE = { programs: 10, drawsMedian: 50, settledMs: 1000, size: { gzip: 100000 } };
test('judge passes exactly at each budget (overview §8 R1, R3)', () => {
  assert.deepEqual(judge(BASE, { programs: 12, drawsMedian: 50, settledMs: 1200, size: { gzip: 110000 } }), []);
});
test('judge names each overrun, and a missing baseline', () => {
  const msgs = judge(BASE, { programs: 13, drawsMedian: 51, settledMs: 1201, size: { gzip: 110001 } });
  assert.deepEqual(msgs.map(m => m.split(' ').slice(0, 2).join(' ')), ['R1 programs', 'R1 draw', 'R3 gzip', 'R3 settled']);
  assert.deepEqual(judge(undefined, BASE), ['no baseline']);
});
test('sizeReport totals bytes and gzip over nested files, paths relative to the dir', () => {
  const d = mkdtempSync(join(tmpdir(), 'sizes-'));
  mkdirSync(join(d, 'assets/models'), { recursive: true });
  writeFileSync(join(d, 'index.html'), 'x'.repeat(1000));
  writeFileSync(join(d, 'assets/models/a.glb'), Buffer.alloc(300, 7));
  const r = sizeReport(d);
  assert.deepEqual(r.files.map(f => f.path), ['assets/models/a.glb', 'index.html']);
  assert.equal(r.total.bytes, 1300);
  assert.equal(r.total.gzip, gzipSync(Buffer.alloc(300, 7), { level: 9 }).length + gzipSync(Buffer.from('x'.repeat(1000)), { level: 9 }).length);
});
test('serveDir serves the dir and index.html for /, and 404s a directory or a missing file', async () => {
  const d = mkdtempSync(join(tmpdir(), 'serve-'));
  writeFileSync(join(d, 'index.html'), '<p>hi');
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'assets/m.glb'), 'glb');
  const s = await serveDir(d);
  try {
    assert.equal(await (await fetch(s.url)).text(), '<p>hi');
    assert.equal((await fetch(new URL('assets/m.glb', s.url))).headers.get('content-type'), 'model/gltf-binary');
    assert.equal((await fetch(new URL('assets/', s.url))).status, 404);
    assert.equal((await fetch(new URL('nope.js', s.url))).status, 404);
  } finally { await s.close(); }
});
test('GAMES opens each game the way its desktop e2e test does', () => {
  assert.deepEqual(Object.keys(GAMES).sort(), ['pig-pens', 'rally', 'tractor-pickup']);
  for (const g of Object.values(GAMES)) { assert.equal(g.preset, 'desktop'); assert.equal(typeof g.scene, 'string'); }
});
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/perf.test.mjs`. Expected: FAIL with `Cannot find module '…/games/test/perf/counters.mjs'`.
- [ ] **Step 3: Implement** `games/test/perf/counters.mjs`:

```js
// games/test/perf/counters.mjs: WebGL call counters for the frame-rate probe (overview §8 R1). installCounters runs inside
// the page (probeScript serialises its source) and in Node tests on fake prototypes, so it must stay self-contained.
export function installCounters(protos, raf) {
  const s = { draws: 0, programs: 0, last: 0, lastT: 0, perFrame: [], frameMs: [] };
  for (const proto of protos) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const f = proto[name];
      if (typeof f === 'function') proto[name] = function (...a) { s.draws++; return f.apply(this, a); };
    }
    const cp = proto.createProgram;
    if (typeof cp === 'function') proto.createProgram = function (...a) { s.programs++; return cp.apply(this, a); };
  }
  const tick = t => {
    if (s.lastT) { s.perFrame.push(s.draws - s.last); s.frameMs.push(t - s.lastT); }
    s.last = s.draws; s.lastT = t; raf(tick);
  };
  raf(tick);
  return {
    reset() { s.perFrame.length = 0; s.frameMs.length = 0; s.last = s.draws; s.lastT = 0; },
    read() { return { programs: s.programs, draws: s.draws, perFrame: s.perFrame.slice(), frameMs: s.frameMs.slice() }; },
  };
}
export const probeScript = () => `globalThis.__lhProbe = (${installCounters})(` +
  '[globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext].filter(Boolean).map(c => c.prototype), f => requestAnimationFrame(f));';
```

  `games/test/perf/stats.mjs`:

```js
// games/test/perf/stats.mjs: probe summaries and the phase 3 budgets (overview §8): R1 programs ≤ today + 2 and draw calls
// (median per frame) ≤ today; R3 total gzip ≤ today + 10% and Playwright desktop time to settled() ≤ today + 20%.
const at = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function summarise({ programs, perFrame, frameMs }) {
  return { programs, drawsMedian: at(perFrame, 0.5), drawsMax: perFrame.length ? Math.max(...perFrame) : null,
    frameMsMedian: at(frameMs, 0.5), frameMsP95: at(frameMs, 0.95), frames: perFrame.length };
}
export function judge(base, now) {
  if (!base) return ['no baseline'];
  const out = [];
  if (now.programs > base.programs + 2) out.push(`R1 programs ${now.programs} > ${base.programs} + 2`);
  if (now.drawsMedian > base.drawsMedian) out.push(`R1 draw calls ${now.drawsMedian} > ${base.drawsMedian}`);
  if (now.size.gzip > base.size.gzip * 1.10) out.push(`R3 gzip ${now.size.gzip} > ${base.size.gzip} × 1.10`);
  if (now.settledMs > base.settledMs * 1.20) out.push(`R3 settled ${Math.round(now.settledMs)} ms > ${Math.round(base.settledMs)} ms × 1.20`);
  return out;
}
```

  `games/test/perf/sizes.mjs`:

```js
// games/test/perf/sizes.mjs: bytes and gzip (level 9) per file and in total for a built site dir (overview §8 R3).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
export function sizeReport(dir) {
  const files = [];
  const walk = d => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else { const b = readFileSync(p); files.push({ path: relative(dir, p), bytes: b.length, gzip: gzipSync(b, { level: 9 }).length }); }
    }
  };
  walk(dir);
  return { files, total: files.reduce((t, f) => ({ bytes: t.bytes + f.bytes, gzip: t.gzip + f.gzip }), { bytes: 0, gzip: 0 }) };
}
```

  `games/test/perf/probe.mjs`:

```js
// games/test/perf/probe.mjs: programs, draw calls, frame time and time to settled() for one built game, plus its size
// (overview §8 R1, R3). Real Chromium under SwiftShader: run it behind the browser lock (gate.mjs does).
//   node test/perf/probe.mjs --game <rally|pig-pens|tractor-pickup> --dir <built site dir> [--runs 3] [--frames 120] [--out <json>]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { probeScript } from './counters.mjs';
import { summarise } from './stats.mjs';
import { sizeReport } from './sizes.mjs';

// Each game's desktop e2e opening (its test/e2e.browser.mjs at e03ed71). A game plan that changes it asks the integrator (kind G).
export const GAMES = Object.freeze({
  rally: { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'e2e1' } }, scene: 'stage' },
  'pig-pens': { preset: 'desktop', seed: 3, args: { pigs: 24 }, scene: 'farm' },
  'tractor-pickup': { preset: 'desktop', args: { seed: 14, started: true }, scene: 'farm' },
});
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

export function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const f = path.resolve(root, `.${rel}`);
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(c => server.close(c)) })));
}

async function once(pw, browser, url, cfg, frames) {
  const t0 = performance.now();
  const game = await pw.openGame(browser, url, { preset: cfg.preset, seed: cfg.seed, args: cfg.args, settings: cfg.settings, initScript: { content: probeScript() } });
  const settledMs = performance.now() - t0;
  try {
    await pw.expectScene(game, cfg.scene);
    await game.step(60);
    await game.page.evaluate(() => globalThis.__lhProbe.reset());
    await game.page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), frames);
    return { settledMs, counters: await game.page.evaluate(() => globalThis.__lhProbe.read()), errors: await game.errors() };
  } finally { await game.close(); }
}

export async function main(argv) {
  const { values: o } = parseArgs({ args: argv, options: { game: { type: 'string' }, dir: { type: 'string' },
    runs: { type: 'string', default: '3' }, frames: { type: 'string', default: '120' }, out: { type: 'string' } } });
  const cfg = GAMES[o.game];
  if (!cfg || !o.dir) throw new Error(`probe: --game (${Object.keys(GAMES).join('|')}) and --dir are required`);
  const pw = await import('lion-hawk/playwright');
  const site = await serveDir(o.dir), chrome = await pw.launch(), runs = [];
  try { for (let i = 0; i < Number(o.runs); i++) runs.push(await once(pw, chrome.browser, site.url, cfg, Number(o.frames))); }
  finally { await chrome.close(); await site.close(); }
  const settled = runs.map(r => r.settledMs).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const last = runs.at(-1);
  const result = { game: o.game, dir: path.resolve(o.dir), settledMs: Math.round(settled), ...summarise(last.counters), size: sizeReport(o.dir).total, errors: last.errors };
  const text = JSON.stringify(result, null, 1);
  if (o.out) fs.writeFileSync(o.out, `${text}\n`);
  console.log(text);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run** the step 2 command. Expected: PASS, 9 tests.
- [ ] **Step 5: Prove the budget test red by mutation.** In `stats.mjs` change `base.programs + 2` to `base.programs + 3` and run. Expected: FAIL on `judge names each overrun`. Revert, re-run, PASS.
- [ ] **Step 6: Commit:** `git -C /home/smiller/projects/four43/four43-lh3 add games/test/perf games/test/perf.test.mjs && git -C /home/smiller/projects/four43/four43-lh3 commit -m "test(games): frame-rate and size probe for the phase 3 budgets (R1, R3)"`

### Task 6: Baselines (gate 0, today's builds and probes) (judgment)

**Files:** modify `docs/plans/2026-10-13-phase-3m-integration-notes.md` (Baselines). Scratch: `/tmp/claude-1000/lion-hawk-phase3/3m/base/`, `/tmp/claude-1000/lion-hawk-phase3/3m/baseline/`.
**Interfaces:** Consumes Tasks 3 and 5. Produces `/tmp/claude-1000/lion-hawk-phase3/3m/baseline/baseline.json` (`{ [game]: probe result }`) and the baseline tables.

**Precondition:** run before Task 9 publishes 0.7.3. The engine main checkout must still be 0.7.2 code, because today's builds link to it.

**Decision (judgment):**
- Today's builds come from a `git archive` copy of e03ed71's `games/` in the scratch dir. `build.py` there writes to `<copy>/../site/exp/<site>`, inside the scratch tree, so no four43 `site/` is touched (constraint 14).
- The probe measures today's built pages and the branch builds the same way, through `serveDir`.
- If today's built page does not answer `?lh-test` (no `window.engine` within 30 s), measure the baseline from the game's own `test/serve.mjs` page instead, and record that in the notes. That page is the same bundle, inlined.

- [ ] **Step 1: Gate 0 (counts).** From `/home/smiller/projects/four43/four43-lh3/games`, run `node test/gate.mjs --out /tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.2.json --log /tmp/claude-1000/lion-hawk-phase3/3m/gates/0.7.2.log`. Expected:
  - `GATE PASS`;
  - engine unit plus browser passes summing to 387;
  - workspace 851 plus the 23 new `games/test` tests (gate 9, owners 5, perf 9) = 874;
  - `tractor-pickup TP_MP=engine` → `pass (allowed)` with 1 failure (the M-50 frozen-frame test);
  - Rally e2e 4, Pig Pens e2e 6, Tractor e2e 14, Rally mobile exit 0.

  A different count is recorded as found, with the reason, before going on.
- [ ] **Step 2: Copy today's games.**

```
mkdir -p /tmp/claude-1000/lion-hawk-phase3/3m/base
git -C /home/smiller/projects/four43/four43-lion-hawk archive e03ed71 games | tar -x -C /tmp/claude-1000/lion-hawk-phase3/3m/base
ln -s /home/smiller/projects/four43/four43-lion-hawk/games/node_modules /tmp/claude-1000/lion-hawk-phase3/3m/base/games/node_modules
for g in rally pig-pens tractor-pickup; do
  [ -d /home/smiller/projects/four43/four43-lion-hawk/games/$g/node_modules ] && \
    ln -s /home/smiller/projects/four43/four43-lion-hawk/games/$g/node_modules /tmp/claude-1000/lion-hawk-phase3/3m/base/games/$g/node_modules
done
```

- [ ] **Step 3: Build today's three games inside the copy** (unit caps):

```
for g in rally pig-pens tractor-pickup; do
  systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
    --working-directory=/tmp/claude-1000/lion-hawk-phase3/3m/base/games/$g \
    -E NODE_OPTIONS=--max-old-space-size=512 python3 build.py
done
ls /tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp
git -C /home/smiller/projects/four43/four43-lion-hawk status --short site
git -C /home/smiller/projects/four43/four43-lh3 status --short site
```

  Expected: `piggie-game rally tractor-pickup` under the scratch `site/exp`. Both `git status --short site` commands print exactly what Task 1 step 6 recorded (for `four43-lh3`: nothing).
- [ ] **Step 4: Probe each baseline page** (browser caps, one at a time):

```
cd /home/smiller/projects/four43/four43-lh3/games
mkdir -p /tmp/claude-1000/lion-hawk-phase3/3m/baseline
for pair in rally:rally pig-pens:piggie-game tractor-pickup:tractor-pickup; do g=${pair%%:*}; s=${pair##*:}
  flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 \
    --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=2048 \
    node test/perf/probe.mjs --game $g --dir /tmp/claude-1000/lion-hawk-phase3/3m/base/site/exp/$s --out /tmp/claude-1000/lion-hawk-phase3/3m/baseline/$g.json
done
node -e "const fs=require('fs'),d='/tmp/claude-1000/lion-hawk-phase3/3m/baseline/';const o={};for(const g of ['rally','pig-pens','tractor-pickup'])o[g]=JSON.parse(fs.readFileSync(d+g+'.json','utf8'));fs.writeFileSync(d+'baseline.json',JSON.stringify(o,null,1)+'\n')"
```

  Expected: three JSON files, each with `errors: []`, `frames ≥ 100`, `programs > 0` and `drawsMedian > 0`. A game with `errors` or zero draws is a stop: fix the probe opening (GAMES) or use the decision's fallback.
- [ ] **Step 5: Record** the Baselines tables in the notes: counts per suite from step 1, and one row per game from `baseline.json` (programs, draw calls median/max, frame ms median/p95, settled ms, total gzip, total bytes). Copy `baseline.json`'s content into a fenced block under the table, so the numbers survive the scratch dir.
- [ ] **Step 6: Commit** (engine): `git -C /home/smiller/projects/four43/lion-hawk-engine-3m add docs/plans/2026-10-13-phase-3m-integration-notes.md && git -C /home/smiller/projects/four43/lion-hawk-engine-3m commit -m "docs(plan): phase 3 baselines: test counts, sizes and frame-rate probes"`

### Task 7: Purity: the Rapier rule and the kit sim roots

**Files:** modify `testing/purity.js`; create `test/purity-phase3.test.mjs` (engine, `phase-3-integrate`).
**Interfaces:** Produces `scanSource(src, file, { rapier = false } = {})` and `scanPurity(paths, { rapier = false } = {})`; existing callers are unchanged. Consumes overview D9 and §7.1. 3h's request R2 is met here (a new test file, per "new tests go in new files", instead of editing `test/purity.test.mjs`).

**Decision:**
- The Rapier rule is opt-in and is used on engine roots only.
- Game sim trees are not checked for Rapier. Each game's own entry passes its initialised module (`rallyGame({ rapier })`; contract-issues 3j #2). The games' existing purity tests keep calling `scanPurity(SIM)` unchanged.

- [ ] **Step 1: Write the failing test** `test/purity-phase3.test.mjs`:

```js
// test/purity-phase3.test.mjs: phase 3 purity (overview §7.1, D9): engine code never imports Rapier (the game injects it),
// and the kit sim halves are sim-pure like src/sim (lion-hawk 3m; 3h request R2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanSource, scanPurity } from '../testing/purity.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const hits = (src, o) => scanSource(src, 'f.js', o).map(v => `${v.line}:${v.rule}`);

test('the rapier rule is opt-in and catches static, side-effect and multi-line dynamic imports', () => {
  const src = [
    "import RAPIER from '@dimforge/rapier3d-compat';",
    "import '@dimforge/rapier3d';",
    'const R = await import(',
    "  '@dimforge/rapier3d-compat');",
    "import { x } from './dimforge.js';",
  ].join('\n');
  assert.deepEqual(hits(src), []);
  assert.deepEqual(hits(src, { rapier: true }), ['1:rapier', '2:rapier', '3:rapier']);
});
test('the three rule is unchanged with the rapier option', () => {
  assert.deepEqual(hits("const m = await import(\n  'three'\n);", { rapier: true }), ['1:three']);
});
const simRoots = () => {
  const kits = `${root}src/kits`;
  const kitSims = existsSync(kits) ? readdirSync(kits).sort().map(k => `${kits}/${k}/sim.js`).filter(existsSync) : [];
  return [`${root}src/core`, `${root}src/defs`, `${root}src/sim`, `${root}src/index.sim.js`, ...kitSims];
};
test('engine sim roots, the kit sim halves included, are pure and never import Rapier', () => {
  assert.deepEqual(scanPurity(simRoots(), { rapier: true }), []);
});
test('no engine source imports Rapier (D9: defineGame({ physics: { rapier } }))', () => {
  assert.deepEqual(scanPurity([`${root}src`], { rapier: true }).filter(v => v.rule === 'rapier'), []);
});
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/purity-phase3.test.mjs`. Expected: FAIL on `the rapier rule is opt-in …`. The actual value is `[]` for the `{ rapier: true }` call, because the option is ignored.
- [ ] **Step 3: Implement** in `testing/purity.js`. After the `RULES` array add:

```js
// D9 (phase 3): engine code never imports Rapier; the game injects it. Opt-in, because a game's own entry imports it.
const RAPIER_RULE = ['rapier', /\bfrom\s*['"]@dimforge\/[^'"]*['"]|\bimport\s*\(\s*['"]@dimforge\/|\bimport\s*['"]@dimforge\//];
```

  Replace `scanSource` and `scanPurity` with:

```js
export function scanSource(src, file, { rapier = false } = {}) {
  const out = [], seen = new Set(), add = (line, rule) => { if (!seen.has(line + rule)) { seen.add(line + rule); out.push({ file, line, rule }); } };
  const clean = stripComments(src), rules = rapier ? [...RULES, RAPIER_RULE] : RULES;
  clean.split('\n').forEach((text, i) => { for (const [rule, re] of rules) if (re.test(text)) add(i + 1, rule); });
  const dyn = rapier ? /\bimport\s*\(\s*['"](three|@dimforge\/)/g : /\bimport\s*\(\s*['"](three)/g; // the call may span lines before the specifier
  for (let m; (m = dyn.exec(clean));) add(clean.slice(0, m.index).split('\n').length, m[1] === 'three' ? 'three' : 'rapier');
  return out.sort((a, b) => a.line - b.line);
}
```

```js
export function scanPurity(paths, opts) {
  return paths.filter(p => existsSync(p)).flatMap(walk).flatMap(f => scanSource(readFileSync(f, 'utf8'), f, opts));
}
```

- [ ] **Step 4: Run** the step 2 command and then `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/purity.test.mjs test/purity-phase3.test.mjs`. Expected: PASS (6 existing tests + 4 new).
- [ ] **Step 5: Prove the root scan red by mutation.** Create `src/sim/zz-mutation.js` containing `import R from '@dimforge/rapier3d-compat';` and run step 2. Expected: FAIL on both root tests, naming `zz-mutation.js` line 1, rule `rapier`. Delete the file and re-run: PASS.
- [ ] **Step 6: Commit:** `git -C /home/smiller/projects/four43/lion-hawk-engine-3m add testing/purity.js test/purity-phase3.test.mjs && git -C /home/smiller/projects/four43/lion-hawk-engine-3m commit -m "test(purity): opt-in Rapier rule; engine roots and kit sims never import Rapier (D9)"`

### Task 8: Guard tests for field notes and the public surface

**Files:** create `test/field-notes.test.mjs` and `test/package-phase3.test.mjs` (engine, `phase-3-integrate`).
**Interfaces:**
- Consumes: overview §3.2; 3d's request 1 (dependency pins, `esbuild` and `pngjs` as dependencies; contract-issues "3d"); 3e's stub marker `// STUB (3e)`; 3h's request R1 (kit resolution test).
- Produces: the `SURFACE` table that every export request extends.

- [ ] **Step 1: Write** `test/field-notes.test.mjs`:

```js
// test/field-notes.test.mjs: docs/field-notes.md stays numbered 1..N with one index row per note; phase 3 entries
// (#110 on) carry the four fields (lion-hawk 3m, Procedure F).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const s = readFileSync(new URL('../docs/field-notes.md', import.meta.url), 'utf8');
const heads = [...s.matchAll(/^### (\d+)\. /gm)].map(m => Number(m[1]));
const rows = [...s.matchAll(/^\| (\d+) \|/gm)].map(m => Number(m[1]));

test('field notes are numbered 1..N without gaps, each with one index row in order', () => {
  assert.ok(heads.length >= 109);
  assert.deepEqual(heads, heads.map((_, i) => i + 1));
  assert.deepEqual(rows, heads);
});
test('phase 3 notes (#110 on) have What happened, Workaround, Engine change and Status', () => {
  for (const part of s.split(/^### /m).slice(1)) {
    const n = Number(part.match(/^(\d+)\./)[1]);
    if (n < 110) continue;
    for (const f of ['What happened', 'Workaround', 'Engine change', 'Status']) assert.match(part, new RegExp(`^- \\*\\*${f}:\\*\\*`, 'm'), `#${n} lacks ${f}`);
  }
});
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/field-notes.test.mjs`. Expected: PASS (109 contiguous notes and rows, verified 2026-10-13).
- [ ] **Step 3: Prove it red by mutation.** In a scratch copy, renumber note 109 to 111 and point the test at it:
  - `cp docs/field-notes.md /tmp/claude-1000/lion-hawk-phase3/3m/fn.md && sed -i 's/^### 109\. /### 111. /' /tmp/claude-1000/lion-hawk-phase3/3m/fn.md`;
  - `node -e "const s=require('fs').readFileSync('/tmp/claude-1000/lion-hawk-phase3/3m/fn.md','utf8');const h=[...s.matchAll(/^### (\d+)\. /gm)].map(m=>+m[1]);console.log(h.every((n,i)=>n===i+1))"`.

  Expected: `false`. The test's check is the same expression.
- [ ] **Step 4: Write the failing test** `test/package-phase3.test.mjs`:

```js
// test/package-phase3.test.mjs: the phase 3 public surface by version (overview §3.2, plus extras landed by integrator
// requests), kit export resolution (3h R1), bin, dependencies (3d request 1) and no 3e stub left (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const num = v => { const [a, b, c] = v.split('.').map(Number); return a * 1e6 + b * 1e3 + c; };
const since = v => num(ENGINE_VERSION) >= num(v);
const skip = v => !since(v) && `engine ${ENGINE_VERSION} < ${v}`;

// [version, entry point, names]. Extras requested by plans are added here in the commit that exports them (Procedure R, kind E).
export const SURFACE = [
  ['0.8.0', 'lion-hawk/sim', ['defineMaterials', 'BASE_MATERIALS', 'SIDECAR_VERSION', 'validateSidecar', 'validatePhys', 'createWorld', 'heightfieldDesc']],
  ['0.8.0', 'lion-hawk/view', ['defineMaterials', 'createWorld']],
  ['0.8.0', 'lion-hawk/test', ['checks']],
  ['0.8.0', 'lion-hawk/bake', ['bake', 'loadConfig']],
  ['0.8.0', 'lion-hawk/build', ['dedupe', 'build']],
  ['0.9.0', 'lion-hawk/view', ['createRenderer', 'createLightRig', 'warm', 'instancedShadows', 'disposeTree', 'programCount', 'snapshot', 'createTiltShift']],
  ['0.9.0', 'lion-hawk/view', ['createAssets', 'createMaterialCompiler', 'furGeometry', 'sampleAnimTable', 'blendAnimTable', 'decodeAnimTable']],
  ['0.9.0', 'lion-hawk/view', ['createViewSync', 'createChaseRig', 'createOrbitRig', 'createMountRig', 'makeProject', 'createInstances', 'createCrowd', 'createAudio']],
  ['0.9.0', 'lion-hawk/kits/terrain', ['createTerrain']],
  ['0.9.0', 'lion-hawk/kits/terrain/view', ['createTerrainMesh']],
  ['0.9.0', 'lion-hawk/kits/vehicle', ['createVehicle']],
  ['0.9.0', 'lion-hawk/kits/coverage', ['coverageKit']],
  ['0.9.0', 'lion-hawk/kits/coverage/view', ['coverageView']],
  ['0.9.0', 'lion-hawk/kits/fx/view', ['createParticles', 'createMarks']],
];
for (const [v, spec, names] of SURFACE) {
  test(`${spec} exports ${names.join(', ')} from ${v}`, { skip: skip(v) }, async () => {
    const m = await import(spec);
    for (const n of names) assert.notEqual(m[n], undefined, `${spec} lacks ${n}`);
  });
}
test('checks has its four members (T-10, T-12, T-13, T-14)', { skip: skip('0.8.0') }, async () => {
  const { checks } = await import('lion-hawk/test');
  for (const k of ['determinism', 'simPurity', 'zeroAlloc', 'materials']) assert.equal(typeof checks[k], 'function', k);
});
test('F.body exists from 0.10.0 (N-8, 3i)', { skip: skip('0.10.0') }, async () => {
  const { F } = await import('lion-hawk/sim');
  assert.equal(typeof F.body, 'function');
});
test('lion-hawk/kits/<kit> resolves to the sim half and lion-hawk/kits/<kit>/view to the view half', { skip: skip('0.9.0') }, () => {
  assert.ok(import.meta.resolve('lion-hawk/kits/terrain').endsWith('/src/kits/terrain/sim.js'));
  assert.ok(import.meta.resolve('lion-hawk/kits/terrain/view').endsWith('/src/kits/terrain/view.js'));
  assert.ok(import.meta.resolve('lion-hawk/kits/fx/view').endsWith('/src/kits/fx/view.js'));
});
test('bin: lion-hawk → bin/lion-hawk.js, executable, with a node shebang', { skip: skip('0.8.0') }, () => {
  assert.equal(pkg.bin?.['lion-hawk'], 'bin/lion-hawk.js');
  const f = `${root}bin/lion-hawk.js`;
  assert.ok(existsSync(f));
  assert.ok(statSync(f).mode & 0o111, 'not executable');
  assert.match(readFileSync(f, 'utf8'), /^#!\/usr\/bin\/env node\n/);
});
test('dependencies for bake and build (3d request 1); three and Rapier stay peer + dev', { skip: skip('0.7.3') }, () => {
  for (const d of ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer', 'pngjs', 'esbuild']) {
    assert.ok(pkg.dependencies?.[d], `dependencies lacks ${d}`);
  }
  assert.equal(pkg.devDependencies.esbuild, undefined, 'esbuild moved to dependencies');
  for (const p of ['three', '@dimforge/rapier3d-compat']) {
    assert.equal(pkg.dependencies[p], undefined, `${p} must not be a dependency`);
    assert.ok(pkg.peerDependencies[p] && pkg.devDependencies[p], p);
  }
});
test('the installed Rapier is 0.21.x and three is 0.186.x (R4)', () => {
  const v = p => JSON.parse(readFileSync(`${root}node_modules/${p}/package.json`, 'utf8')).version;
  assert.match(v('@dimforge/rapier3d-compat'), /^0\.21\./);
  assert.match(v('three'), /^0\.186\./);
});
test('no 3e stub is left once its owner has merged (overview §4.6)', { skip: skip('0.9.0') }, () => {
  for (const f of ['src/view/assets/index.js', 'src/view/sync/index.js', 'src/view/audio/index.js', 'src/view/materials/compiler.js']) {
    assert.doesNotMatch(readFileSync(`${root}${f}`, 'utf8'), /STUB \(3e\)/, f);
  }
});
```

- [ ] **Step 5: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/package-phase3.test.mjs`. Expected at 0.7.2: PASS. The version rows skip and the R4 test passes. The test turns red at the 0.7.3 version bump until the dependencies land (Task 9 step 4 proves this).
- [ ] **Step 6: Commit:** `git -C /home/smiller/projects/four43/lion-hawk-engine-3m add test/field-notes.test.mjs test/package-phase3.test.mjs && git -C /home/smiller/projects/four43/lion-hawk-engine-3m commit -m "test: phase 3 guards for field-note numbering and the public surface by version"`

### Task 9: 0.7.3, merge 3a

**Files:**
- engine: `package.json`, `package-lock.json`, `src/version.js`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`, the notes ledger;
- four43: `games/package-lock.json`.

**Interfaces:** Consumes 3a's branch `phase-3-carryovers`, its notes `docs/plans/2026-10-13-phase-3a-carryovers-notes.md`, its integrator requests 1–5 and its Task 10 text. Produces engine **0.7.3** (`v0.7.3`).

- [ ] **Step 1: Procedure M steps 1–3** for `phase-3-carryovers`, plan `3a`, message `chore(merge): phase 3a carry-overs (#95, #100, #105, #107, #108, #109, G-E2)`.
- [ ] **Step 2: Dependencies (3a request 1, with 3d request 1's pins, since 3d needs them before it starts).** In `/home/smiller/projects/four43/lion-hawk-engine-3m`, under the unit caps:

```
npm install --save-exact @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1
npm install --save meshoptimizer@~1.2.0 pngjs@^7.0.0
npm uninstall --save-dev esbuild && npm install --save esbuild@^0.28.2
```

  Expected: `package.json` `dependencies` holds those six, and `devDependencies` no longer has `esbuild`.
- [ ] **Step 3: Version.** Run `npm version --no-git-tag-version 0.7.3` and `sed -i "s/ENGINE_VERSION = '0.7.2'/ENGINE_VERSION = '0.7.3'/" src/version.js`.
- [ ] **Step 4: Red, then green.**
  - Temporarily remove `pngjs` from `dependencies` in `package.json` and run the Task 8 step 5 command. Expected: FAIL `dependencies lacks pngjs`.
  - Restore it, then run `test/package-phase3.test.mjs test/package.test.mjs`. Expected: PASS.
- [ ] **Step 5: CHANGELOG** (3a request 2). Insert above `## 0.7.2`:

```markdown
## 0.7.3 — <date>

Phase 3a: engine carry-overs.

- `engine.overlay(name, args, { once })`: a no-op when the overlay is open or about to be, and never recorded (#95).
- `engine.scene.overlayArgs(name)`, and view halves' `enter(engine, view, args)` (#105).
- `defineGame({ reset })`, called first in every `createEngine`, so replays and `mp()` peers start from the shipped tunables (#108).
- `bindGesture` times holds and taps on the event clock, with an injectable `now`; `uncapped` is ignored (#109).
- Headless and Playwright `untilLoaded` take the step that delivers the commands pending at the call (#100); `window.engine.commands`.
- `peers()` defaults to `render: 'manual'` (#107).
- The domAsserts guard sees every equality form and skips quoted text (G-E2).
- Dependencies for the phase 3 bake and build: `@gltf-transform/core`, `/extensions`, `/functions` 4.5.1, `meshoptimizer` ~1.2, `pngjs`; `esbuild` moves to `dependencies`.
- Testing: `scanSource`/`scanPurity` take `{ rapier: true }`; engine roots are scanned with it (D9). Guard tests for field-note numbering and the phase 3 public surface.
```

  Correct each bullet against the merged 3a notes ("Rulings") before committing; the notes win.
- [ ] **Step 6: Spec** (3a request 3): apply 3a's Task 10 steps 1, 2 and 3 (header line, part A and part B) verbatim. The user approved D1–D9 on 2026-10-14 (contract-issues "User decisions (2026-10-14)"), so part A is not gated.
  - Commit `docs(spec): phase 3 deltas D1–D9 and the 0.7.3 carry-overs`.
- [ ] **Step 7: Field notes** (3a request 4): Procedure F with plan 3a.
  - #95, #100, #105, #107, #108 and #109 become `done (0.7.3, 3a): <outcome>`.
  - 3a's four candidates become #110–#113.
- [ ] **Step 8: Commit** the version: `git add package.json package-lock.json src/version.js CHANGELOG.md && git commit -m "chore(release): lion-hawk 0.7.3"`.
- [ ] **Step 9: Procedure M step 5**, then **Procedure G** for `0.7.3` (no `--enforce`; no game is buildable yet, so no perf steps).
  - Expected: the engine count is 387 plus 3a's new tests plus 3m's 4 + 2 + the package tests that run (the gate log shows the exact count), and the workspace count is the gate-0 count.
  - Tags: `v0.7.3` and `v-games-0.7.3`.
- [ ] **Step 10: Pickup.** Procedure P, to the controller only, because no other worktree exists yet.

### Task 10: Cut Wave A and 3e; plan intake

**Files:** notes ledger (Paths, Requests).
**Interfaces:** Produces worktrees `lion-hawk-engine-3{b,c,d,e}` on `phase-3-{materials,world,bake,render}`, all from `v0.7.3`.

- [ ] **Step 1: Cut the branches:**

```
for p in 3b:materials 3c:world 3d:bake 3e:render; do x=${p%%:*}; n=${p##*:}
  git -C /home/smiller/projects/four43/lion-hawk-engine worktree add /home/smiller/projects/four43/lion-hawk-engine-$x -b phase-3-$n v0.7.3
  systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-$x npm install
done
git -C /home/smiller/projects/four43/lion-hawk-engine worktree list
```

  Expected: five engine worktrees plus the main checkout and 3m.
- [ ] **Step 2: Intake** (Procedure R step 1) of the integrator requests in the 3b, 3c, 3d, 3e, 3f, 3g, 3h and 3i plans. One Requests row each, with kind and target version.
  - Requests already met: 3d R1 (Task 9), 3h R2 (Task 7), 3h R1's package test (Task 8).
  - Mark those landed, with the commit.
- [ ] **Step 3: Early landings.**
  - Note which plans need another plan on `phase-3` before their wave closes: 3c needs 3b for its Task 17; 3g needs 3e before its Task 11 and 3f before its Task 15.
  - Such a landing is a **patch release**: Procedure M, then Procedure G with `--only engine,workspace`, a patch version (0.7.4 …, 0.8.1 …), its CHANGELOG entry and a tag. The wave's minor version comes with the last merge of the wave.
- [ ] **Step 4: Commit** the ledger: `docs(plan): phase 3 Wave A worktrees and request intake`. Publish it (docs only; no freeze needed).

### Task 11: 0.8.0, Wave A (3b, then 3c, then 3d)

**Files:** engine `src/index.sim.js`, `testing/index.js`, `package.json`, `src/version.js`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`, the ledger; four43 `games/package-lock.json`.
**Interfaces:**
- Consumes 3b (`src/defs/materials.js` `defineMaterials`, `materials.base.js` `BASE_MATERIALS`, `sidecar.js` `SIDECAR_VERSION`/`validateSidecar`/`validatePhys`), 3c (`src/sim/world/world.js` `createWorld`, `src/sim/physics/heightfield.js` `heightfieldDesc`, `testing/checks.js`), and 3d (`tools/bake/index.js` `bake`/`loadConfig`, `tools/build/index.js` `build` plus the `dedupe` re-export, `bin/lion-hawk.js`).
- Produces **0.8.0** (`v0.8.0`).

- [ ] **Step 1: Merge in order.** For each branch, run Procedure M (steps 1–5): `phase-3-materials` (3b), then `phase-3-world` (3c), then `phase-3-bake` (3d). Use the messages `chore(merge): phase 3b materials registry, base library and sidecar schema`, `chore(merge): phase 3c World, Rapier wrapper and checks`, `chore(merge): phase 3d bake, build and dev CLI`.
  - If 3c's Task 17 or 3d's Task 16 did not run on its branch (their preconditions), run it now as that plan's request: the plan's own code, executed on `phase-3-integrate` after its predecessor's merge. Commit it with the plan's subject.
  - After 3c's merge, also land 3c request 1, the `test/engine.test.mjs:232` line, if the branch did not carry it.
  - The registry hash (contract-issues 3b #6) covers only ids/order, `phys` and pairs, not `look` or `game`. Read the base library's hash from the merged code (`node --input-type=module -e "console.log((await import('./src/defs/materials.js')).defineMaterials().hash)"`) and record it in the ledger; never copy a literal from a plan, since 3b's pinned value is set by 3b's own reconciliation. A later `look`-only registry change needs no re-bake; a `phys` or pair change makes every game's `bake --check` stale.
- [ ] **Step 2: Watch the exports test fail first.** Bump to `0.8.0` (`npm version --no-git-tag-version 0.8.0` and `sed -i "s/ENGINE_VERSION = '0.7.[0-9]*'/ENGINE_VERSION = '0.8.0'/" src/version.js`), then run the Task 8 step 5 command. Expected: FAIL on the `0.8.0` rows (`lion-hawk/sim lacks defineMaterials`, `checks` undefined, `lion-hawk/bake` not exported, `bin` missing).
- [ ] **Step 3: Exports.** Append to `src/index.sim.js`:

```js
export { defineMaterials } from './defs/materials.js';
export { BASE_MATERIALS } from './defs/materials.base.js';
export { SIDECAR_VERSION, validateSidecar, validatePhys } from './defs/sidecar.js';
export { createWorld } from './sim/world/world.js';
export { heightfieldDesc } from './sim/physics/heightfield.js';
```

  - Append to `testing/index.js` the line 3c request 2 gives. That is `export { checks } from './checks.js';` if `testing/checks.js` exports `checks`. If it exports the four functions instead, add `import { determinism, simPurity, zeroAlloc, materials } from './checks.js';` and `export const checks = Object.freeze({ determinism, simPurity, zeroAlloc, materials });`. Check first with `grep -n '^export' testing/checks.js`.
  - In `package.json`, set `"./build": "./tools/build/index.js"`, add `"./bake": "./tools/bake/index.js"` after `"./test"`, and add `"bin": { "lion-hawk": "bin/lion-hawk.js" }` after `"exports"` (3d request 1).
  - Add any extra names that the 3b/3c/3d requests list to `SURFACE`.
- [ ] **Step 4: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3m -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/package-phase3.test.mjs test/package.test.mjs test/purity.test.mjs test/purity-phase3.test.mjs`. Expected: PASS.
- [ ] **Step 5: Prove an export row red by mutation.** Comment out the `heightfieldDesc` line and re-run. Expected: FAIL `lion-hawk/sim lacks heightfieldDesc`. Restore it; PASS.
- [ ] **Step 6: Commit** `feat(exports): Wave A surface in lion-hawk/sim, /test, /bake, /build and the lion-hawk bin`.
- [ ] **Step 7: CHANGELOG `## 0.8.0 — <date>`, "Phase 3 Wave A: materials, the World and the bake."** Use the bullets 3b request 2 and 3c/3d requests supply verbatim. Where none is supplied, write one bullet per §4 area from the merged code:
  - materials registry (M-1, M-2, M-3, M-7, M-8) and sidecar schema (A-5);
  - `World` (E-1…E-13, S-3) and the Rapier wrapper (M-4…M-6, M-9, #1, #2, #106);
  - headless world access and `checks` (T-1, T-5, T-10, T-12…T-14);
  - `lion-hawk bake`/`build`/`dev` (A-1…A-7, B-1…B-5, #11).

  Then a **Behaviour changes** sub-list:
  - `engine.state()` gains `world` only while a World has entities;
  - `createEngine` throws `physics: await RAPIER.init() before createEngine` for an uninitialised module;
  - `engine.builtin`;
  - `./build` now points at `tools/build/index.js` (it still exports `dedupe`).
- [ ] **Step 8: Spec.** Apply 3b request 3, 3c request 5 and the 3d clarifications as the controller ruled them (contract-issues "3b", "3c", "3d"), each marked `(phase 3, 0.8.0)`. Commit `docs(spec): 0.8.0 clarifications from 3b, 3c and 3d`.
- [ ] **Step 9: Field notes:** Procedure F for 3b, 3c and 3d, in that order. #1, #2, #11 and #106 become done (0.8.0); #28 and #64 per 3c's notes.
- [ ] **Step 10: Commit** `chore(release): lion-hawk 0.8.0`. Then run **Procedure G** for `0.8.0` (no game is buildable yet).
  - Expected: all six goldens are bit-exact. The games have not migrated, and `engine.state()` adds `world` only with entities, so no game test changes.
  - Tags: `v0.8.0` and `v-games-0.8.0`.
- [ ] **Step 11: 3d request 2 (hygiene).** Run `node bin/lion-hawk.js bake --game test/fixtures/models/game` in `lion-hawk-engine-3m` (after 3d's Task 16 the fixture's `phys.json` records the real registry hash, whatever 3b's final hash rule gives). If `test/fixtures/models/game/baked/` changed, commit `chore(fixtures): re-bake the CLI fixture at 0.8.0` and publish it as part of the same freeze.

### Task 12: Cut 3f, 3g, 3h, 3i and the game worktrees; pickup

**Files:** the ledger.
**Interfaces:** Produces:
- engine worktrees `lion-hawk-engine-3{f,g,h,i}` on `phase-3-{assets,viewsync,kits,net}` from `v0.8.0`;
- four43 branches `feat/lion-hawk-3-{rally,pigpens,tractor}` from `v-games-0.8.0`, with worktrees `four43-lh3-{rally,pigpens,tractor}`.

- [ ] **Step 1: Engine branches.** Run Task 10 step 1's loop with `3f:assets 3g:viewsync 3h:kits 3i:net` and base `v0.8.0`.
- [ ] **Step 2: Game branches:**

```
for g in rally pigpens tractor; do
  git -C /home/smiller/projects/four43/four43-lh3 branch feat/lion-hawk-3-$g v-games-0.8.0
  git -C /home/smiller/projects/four43/four43-lh3 worktree add /home/smiller/projects/four43/four43-lh3-$g feat/lion-hawk-3-$g
  systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3-$g/games npm install
  readlink -f /home/smiller/projects/four43/four43-lh3-$g/games/node_modules/lion-hawk
  ls -l /home/smiller/projects/four43/four43-lh3-$g/games/node_modules/.bin/lion-hawk
  git -C /home/smiller/projects/four43/four43-lh3-$g status --short
done
```

  Expected for each:
  - the link resolves to `/home/smiller/projects/four43/lion-hawk-engine`;
  - `.bin/lion-hawk` exists;
  - `status` is empty (the lockfile was refreshed on `feat/lion-hawk-3` in Procedure G step 3).
- [ ] **Step 3: Pickup.** Procedure P to all seven new worktrees. Add the game plans' start rule: asset and sim steps from 0.8.0, view steps at 0.9.0, Tractor's net step at 0.10.0 (overview §5.1). Log it in Broadcasts.
- [ ] **Step 4: Intake** of the 3j, 3k and 3l integrator requests into the Requests table (Procedure R step 1). Commit the ledger.

### Task 13: The D9 workspace rule (before any view code lands)

**Files:** create `games/test/helpers/scan.mjs`; modify `games/test/workspace.test.mjs` (four43, `feat/lion-hawk-3`).
**Interfaces:**
- Consumes: `stripComments` (`lion-hawk/test`).
- Produces: `jsFiles(path)` → `string[]`; `importsOf(files, match)` → `[{ file, line, spec }]`.
- Requested by 3e (request 2) and 3k (request 2), and ruled ("narrowed to sim roots").

**Precondition:** this lands on `feat/lion-hawk-3`, and every game worktree has merged it (Procedure P step 1), **before** 3e reaches `phase-3`. The old test fails the moment `src/view/render/*` imports `three`.

- [ ] **Step 1: Write** `games/test/helpers/scan.mjs`:

```js
// games/test/helpers/scan.mjs: .js/.mjs files under a path and the module specifiers they import (static, re-export,
// side-effect and dynamic, comments stripped), for the workspace and phase 3 done-when tests (lion-hawk 3m).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from 'lion-hawk/test';

export function jsFiles(p) {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return /\.m?js$/.test(p) ? [p] : [];
  return readdirSync(p).sort().flatMap(n => jsFiles(join(p, n)));
}
const SPEC = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
export function importsOf(files, match) {
  const out = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (match.test(spec)) out.push({ file, line: src.slice(0, m.index).split('\n').length, spec });
    }
  }
  return out;
}
```

- [ ] **Step 2: Change the test first.** In `games/test/workspace.test.mjs`:
  - replace the header comment's first three lines with the comment below;
  - replace the last test (`'engine source does not import three or Rapier yet (no alias in the game builds)'`) with the three tests below;
  - add `existsSync` to the `node:fs` import;
  - add `import { jsFiles, importsOf } from './helpers/scan.mjs';`.

```js
// lion-hawk G-2 and phase 3 D9: the games share one three and one Rapier and consume the engine from its own repo, a
// sibling of the four43 checkout (../../lion-hawk-engine from games/). Engine view modules import three directly (bare
// 'three' or 'three/addons/…', which `lion-hawk build` dedupes to the game's copy); engine code never imports Rapier (the
// game injects its initialised module); engine sim code never imports three.
```

```js
const simRoots = () => {
  const kits = `${engine}/src/kits`;
  const kitSims = existsSync(kits) ? readdirSync(kits).sort().map(k => `${kits}/${k}/sim.js`).filter(existsSync) : [];
  return [...['core', 'defs', 'sim'].flatMap(d => jsFiles(`${engine}/src/${d}`)), ...kitSims, `${engine}/src/index.sim.js`];
};
test('engine source never imports Rapier (D9: defineGame({ physics: { rapier } }))', () => {
  assert.deepEqual(importsOf(jsFiles(`${engine}/src`), /^@dimforge\//), []);
});
test('engine sim code never imports three (L-3), kit sim halves included', () => {
  assert.deepEqual(importsOf(simRoots(), /^three(\/|$)/), []);
});
test("engine view code imports three only as 'three' or 'three/addons/…', which the build dedupes", () => {
  assert.deepEqual(importsOf(jsFiles(`${engine}/src`), /^three(\/|$)/).filter(h => !/^three(\/addons\/[\w./-]+)?$/.test(h.spec)), []);
});
```

- [ ] **Step 3: Prove the new rules can fail** (red on a scratch tree, since the engine checkout is shared and must not be mutated):

```
mkdir -p /tmp/claude-1000/lion-hawk-phase3/3m/scan/src/sim
printf "import RAPIER from '@dimforge/rapier3d-compat';\nimport * as T from 'three/src/Three.js';\n" > /tmp/claude-1000/lion-hawk-phase3/3m/scan/src/sim/bad.js
cd /home/smiller/projects/four43/four43-lh3/games && node -e "
import('./test/helpers/scan.mjs').then(({ jsFiles, importsOf }) => {
  const f = jsFiles('/tmp/claude-1000/lion-hawk-phase3/3m/scan/src');
  console.log(JSON.stringify([importsOf(f, /^@dimforge\//).length, importsOf(f, /^three(\/|$)/).filter(h => !/^three(\/addons\/[\w./-]+)?$/.test(h.spec)).length]));
})"
```

  Expected: `[1,1]`: each rule would flag the file.
- [ ] **Step 4: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/workspace.test.mjs`. Expected: PASS (7 tests: the 4 kept plus the 3 new), at 0.8.0 and still after 3e lands.
- [ ] **Step 5: Commit** `test(games): D9 workspace rule: no Rapier in the engine, no three in sim roots, bare three in view code`. Run Procedure P step 1 for the three game worktrees ("merge `feat/lion-hawk-3` before 3e lands"). Log it in Broadcasts, and wait for their acknowledgement before the first Wave B landing.

### Task 14: 0.9.0, Wave B (3e, then 3f, then 3g, then 3h)

**Files:** engine `src/index.view.js`, `package.json` (`exports`), `src/version.js`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`, the ledger; four43 `games/package-lock.json`.
**Interfaces:**
- Consumes:
  - 3e: `src/view/render/{renderer,lights,hygiene,snapshot,tiltShift}.js`;
  - 3f: `src/view/assets/{index,animTable}.js`, `src/view/materials/{compiler,fur}.js`;
  - 3g: `src/view/sync/index.js`, `src/view/camera/{chase,orbit,mount,project}.js`, `src/view/instancing/{instances,crowd}.js`, `src/view/audio/index.js`;
  - 3h: `src/kits/{terrain,vehicle,coverage,fx}`.
- Produces **0.9.0** (`v0.9.0`), with early patch landings in between (Task 10 step 3).

- [ ] **Step 1: 3e** (Procedure M, message `chore(merge): phase 3e renderer, lights, hygiene and boot render pipeline`). It may land early as 0.8.x for 3g's Task 11.
  - Land 3e request 4 (the `boot(…, { timer })` → `world.stats.stepMs` assertion) as a new test file `test/render-timer.test.mjs`, written by the integrator from 3e's request text: a failing run first, before 3c's `timer` passes through.
  - Export the 3e names (step 5) in the same landing.
- [ ] **Step 2: 3f** (Procedure M, `chore(merge): phase 3f assets, loader, anim tables and material compiler`).
  - Resolve the stubs `src/view/assets/index.js` and `src/view/materials/compiler.js` with `git checkout --theirs`.
  - Rerun `test/render-pipeline.test.mjs` and `test/render-stubs.test.mjs` per 3e request 3, and 3f's Task 9 Step 1b stub-surface check (3e ruling #1: same export names and members as the stubs). The stub-shape cases for assets and the compiler are expected to fail now; they go with the file in step 3.
  - It may land early for 3g's Task 15.
- [ ] **Step 3: 3g** (Procedure M, `chore(merge): phase 3g view sync, cameras, instancing, crowds and audio`).
  - Take 3g's `src/view/sync/index.js` and `src/view/audio/index.js` over the stubs.
  - Delete `test/render-stubs.test.mjs` (3e request 3, 3g request 4) and record it in "Removed or renamed tests".
  - Land 3g request 2 (the `createViewSync(engine, { gfx, assets, compiler, view })` boot wiring) as an X request on 3e's `boot.js`, with its test first.
- [ ] **Step 4: 3h** (Procedure M, `chore(merge): phase 3h terrain, vehicle, coverage and fx kits`).
- [ ] **Step 5: Exports.** Bump to `0.9.0` (as in Task 11 step 2) and watch the `0.9.0` rows fail. Then append to `src/index.view.js`:

```js
export { createRenderer } from './view/render/renderer.js';
export { createLightRig } from './view/render/lights.js';
export { warm, instancedShadows, disposeTree, programCount } from './view/render/hygiene.js';
export { snapshot } from './view/render/snapshot.js';
export { createTiltShift } from './view/render/tiltShift.js';
export { createAssets } from './view/assets/index.js';
export { sampleAnimTable, blendAnimTable, decodeAnimTable } from './view/assets/animTable.js';
export { createMaterialCompiler } from './view/materials/compiler.js';
export { furGeometry } from './view/materials/fur.js';
export { createViewSync } from './view/sync/index.js';
export { createChaseRig } from './view/camera/chase.js';
export { createOrbitRig } from './view/camera/orbit.js';
export { createMountRig } from './view/camera/mount.js';
export { makeProject } from './view/camera/project.js';
export { createInstances } from './view/instancing/instances.js';
export { createCrowd } from './view/instancing/crowd.js';
export { createAudio } from './view/audio/index.js';
```

  In `package.json` `exports`, add after `"./build"` (3h request R1; longer keys win in Node's pattern order, so `./kits/*/view` is matched before `./kits/*`):

```json
"./kits/*/view": "./src/kits/*/view.js",
"./kits/*": "./src/kits/*/sim.js",
```

  - Where an early landing already added some lines, add only the rest.
  - If a module path differs in the merged code (`grep -rn "export function <name>" src/view`), use the merged path and add a Requests row: a path that differs from §3.1 is a C request.
- [ ] **Step 6: Run** the Task 11 step 4 command. Expected: PASS, including kit resolution and `no 3e stub is left`.
- [ ] **Step 7: Prove the kit routing red by mutation.** Swap the two `kits` lines' targets (`./kits/*/view` → `sim.js`) and re-run. Expected: FAIL on `lion-hawk/kits/<kit> resolves …`. Restore; PASS.
- [ ] **Step 8: Commit** `feat(exports): Wave B view surface and kit entry points (lion-hawk/kits/*, /kits/*/view)`.
- [ ] **Step 9: CHANGELOG `## 0.9.0 — <date>`, "Phase 3 Wave B: renderer, assets, materials, view sync and kits."**
  - Use 3e request 5's and 3h request R4's bullets verbatim, plus 3f's and 3g's from their notes.
  - **Behaviour changes:**
    - `boot` builds `view.gfx`, `view.assets`, `view.materials`, `view.sync` and `view.audio` when `render` is declared, and is unchanged without it;
    - engine view modules import three (D9), so game builds must go through `lion-hawk build`.
  - Bump commit `chore(release): lion-hawk 0.9.0`.
- [ ] **Step 10: Spec and notes.**
  - Record 3f C1–C10, 3g's rig surfaces and 3h C1–C7 as the controller reconciled them, in the overview §4.7–§4.10 (kind C) and as spec clarifications (kind S).
  - Run Procedure F for 3e, 3f, 3g and 3h. #67 becomes done (0.9.0, 3g).
- [ ] **Step 11: Procedure G** for `0.9.0`.
  - `--enforce` lists only games whose view step is merged into `feat/lion-hawk-3`; at this point, none.
  - Builds and probes run for each game branch already merged with a `game.config.js`. Record their rows in the Frame-rate table as informational.
  - Tags: `v0.9.0` and `v-games-0.9.0`.
  - Run Procedure P, with "view steps may start".

### Task 15: 0.10.0, Wave C (3i)

**Files:** engine `package.json`, `src/version.js`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`, the ledger.
**Interfaces:** Consumes 3i (`src/sim/net/**`, `src/defs/fields.js` `F.body`, `testing/mp.js` `drop`/`blackout`/`diverged`). Produces **0.10.0** (`v0.10.0`). No index change: `F` is already exported.

- [ ] **Step 1: Land 3i's prerequisites first.** 3i requests 1–2 are kind X on 3c's `src/sim/world/install.js` and `world.js` (install, attach, E-7 guard calls; contract-issues 3i #8).
  - If 3c's worktree is closed, the integrator makes them on `phase-3-integrate`: the failing tests from 3i's request text first, then the change, then Procedure M step 5, as patch `0.9.x`.
  - Tell 3i (3i's Task 10 waits on request 2).
- [ ] **Step 2: Merge** `phase-3-net` (Procedure M, `chore(merge): phase 3i net part: replication, driven/proxy/view remotes, F.body, mp extras`).
- [ ] **Step 3: Version 0.10.0.** Watch the `F.body` row fail at the bump if the branch is not merged yet (a check that the row is live), then pass after the merge. Run the Task 11 step 4 command: PASS.
- [ ] **Step 4: CHANGELOG `## 0.10.0 — <date>`, "Phase 3 Wave C: the net part."**
  - Bullets: `F.body()`, `kind({ remote, follow, tune, send, spawn, spawned })`, the built-in `net.frame` handler through `engine.builtin`, driven remotes with batched inputs and the jitter queue, correction and `e.netFix`, `world.net` (contract-issues 3i #6), and the `mp()` additions `drop`, `blackout`, `diverged`.
  - **Behaviour change:** on a guest, only replication spawns or despawns host-authority kinds (E-7).
- [ ] **Step 5: Spec** (3i request 3, verbatim) and Procedure F for 3i. Commit.
- [ ] **Step 6: Commit** `chore(release): lion-hawk 0.10.0`. Run **Procedure G** for `0.10.0` (same `--enforce` rule as Task 14 step 11).
  - Expected in the engine suites: 3i's headless bump test under 80 ms and 2% loss, and its two-page test (a browser file run under the lock).
  - Tags: `v0.10.0` and `v-games-0.10.0`.
  - Procedure P, with "Tractor's net step may start".

### Task 16: The overview §1.3 done-when test

**Files:** create `games/test/phase3-done.test.mjs` (four43, `feat/lion-hawk-3`).
**Interfaces:**
- Consumes `games/test/helpers/scan.mjs` `jsFiles`; `lion-hawk/test` `stripComments`; the engine copies of the game notes (`docs/plans/2026-10-13-phase-3{j-rally,k-pigpens,l-tractor}-notes.md`).
- Produces `MIGRATED` (empty until Task 18).

- [ ] **Step 1: Write** `games/test/phase3-done.test.mjs`:

```js
// games/test/phase3-done.test.mjs: overview §1.3 for each game whose phase 3 plan is merged into feat/lion-hawk-3: no
// assets.json, no hand-built Rapier world, no ColliderDesc, no literal friction/density/restitution (outside its material
// registry), bake.mjs and build.py retired, builds through lion-hawk build, the version bumped, and every `// lh-allow:`
// line listed in the game's notes (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';
import { jsFiles } from './helpers/scan.mjs';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const engine = realpathSync(`${games}/../../lion-hawk-engine`);
// The integrator adds a game here in the commit that merges its phase 3 plan (3m Task 18).
export const MIGRATED = [];
const VERSION = { rally: '0.4.0', 'pig-pens': '2.2.0', 'tractor-pickup': '1.9.0' };
const NOTES = { rally: '2026-10-13-phase-3j-rally-notes.md', 'pig-pens': '2026-10-13-phase-3k-pigpens-notes.md', 'tractor-pickup': '2026-10-13-phase-3l-tractor-notes.md' };
export const RULES = [
  ['assets.json', /['"][^'"]*assets\.json['"]/],
  ['a hand-built Rapier world', /\bnew\s+[\w$]+\.World\s*\(/],
  ['ColliderDesc', /\bColliderDesc\s*\./],
  ['a literal friction, density or restitution', /\b(?:setFriction|setDensity|setRestitution)\s*\(\s*-?[\d.]|\b(?:friction|density|restitution)\s*:\s*-?[\d.]/],
];
export function violations(dir) {
  const bad = [], allows = [];
  for (const f of jsFiles(join(dir, 'src'))) {
    const rel = relative(dir, f);
    if (rel === join('src', 'defs', 'materials.js')) continue;
    const raw = readFileSync(f, 'utf8').split('\n'), clean = stripComments(raw.join('\n')).split('\n');
    clean.forEach((line, i) => {
      if (/lh-allow:\s*\S/.test(raw[i])) { allows.push(rel); return; }
      for (const [rule, re] of RULES) if (re.test(line)) bad.push(`${rel}:${i + 1} ${rule}`);
    });
  }
  return { bad, allows: [...new Set(allows)] };
}

test('MIGRATED names only the three games', () => { for (const g of MIGRATED) assert.ok(g in VERSION, g); });
for (const g of MIGRATED) {
  test(`${g}: overview §1.3 done-when`, () => {
    const dir = join(games, g);
    for (const f of ['bake.mjs', 'build.py', 'src/assets.json']) assert.ok(!existsSync(join(dir, f)), `${g}: ${f} should be retired`);
    for (const f of ['game.config.js', 'baked/phys.json', 'baked/manifest.json']) assert.ok(existsSync(join(dir, f)), `${g}: ${f} is missing`);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.version, VERSION[g]);
    assert.match(pkg.scripts?.build ?? '', /^lion-hawk build\b/);
    const { bad, allows } = violations(dir);
    assert.deepEqual(bad, []);
    const notes = readFileSync(join(engine, 'docs/plans', NOTES[g]), 'utf8');
    for (const rel of allows) assert.ok(notes.includes(rel), `${g}: ${rel} has an lh-allow line that ${NOTES[g]} does not list`);
  });
}
```

- [ ] **Step 2: Run** `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=/home/smiller/projects/four43/four43-lh3/games -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/phase3-done.test.mjs`. Expected: PASS (1 test; `MIGRATED` is empty).
- [ ] **Step 3: Prove it red on today's games.** Set `MIGRATED = ['rally', 'pig-pens', 'tractor-pickup']` and run. Expected: three FAILs:
  - `rally: bake.mjs should be retired` (Rally still has `bake.mjs`; the first failing assertion);
  - the same for Pig Pens;
  - the same for Tractor.

  Then, in a node one-off, print `violations('<games>/tractor-pickup').bad.length`. Expected: > 0 (today's `ColliderDesc` chains in `trees.js`, `scenery.js`, `sandbox.js`; survey row "Physics"). Restore `MIGRATED = []`; PASS.
- [ ] **Step 4: Commit** `test(games): overview §1.3 done-when rules for migrated games`. Run Procedure P step 1 for the game worktrees: they may run it locally with their own game added, without committing that line.

### Task 17: 0.10.x, engine fixes requested during Wave D

**Files:** the engine files named by each request, a new test file per fix, `package.json`, `src/version.js`, `CHANGELOG.md`, and the ledger.
**Interfaces:** Consumes kind-X and kind-D requests from 3j, 3k and 3l once the owning engine plan has merged. Produces `0.10.<n>` patch tags.

For each request, in arrival order (blocking requests first):
- [ ] **Step 1: Log** the request in Requests: kind, the owner of the file (§5.2), and the game step it blocks.
- [ ] **Step 2: Failing test** in a new file `test/fix-0.10.<n>-<topic>.test.mjs`, reproducing the request from the game's notes (its minimal case). Run it in `lion-hawk-engine-3m` with the unit command. Expected: FAIL with the reported message.
- [ ] **Step 3: Fix** the engine file. Keep the fix minimal and inside §4. If it needs a contract change, it becomes kind C: the controller rules first.
- [ ] **Step 4: Run** the new test (PASS), then Procedure M step 5.
- [ ] **Step 5: Version** `0.10.<n>` (`npm version --no-git-tag-version 0.10.<n>`, then `sed` `src/version.js`). Add a CHANGELOG entry `## 0.10.<n> — <date>` with "Fixes requested during the game migrations." and one bullet naming the request ID. Commit `fix(<area>): <what> (<request ID>)` and `chore(release): lion-hawk 0.10.<n>`.
- [ ] **Step 6: Procedure G** for `0.10.<n>`, with `--enforce` for every game whose view step is merged. Tags, then Procedure P to the requester and the other game worktrees.

### Task 18: Merge each finished game branch into `feat/lion-hawk-3` (judgment)

**Files:**
- four43: the merge, `games/package-lock.json`, `games/test/phase3-done.test.mjs` (`MIGRATED`), and `games/test/perf/probe.mjs` `GAMES` if the game's e2e opening changed;
- engine: the copy of the game notes, `docs/field-notes.md`, the ledger.

**Interfaces:** Consumes the game plan's Done-when, its §5.5 re-bless records, its feel tables, its own perf and size records, and its integrator requests.

| Game | Branch | Plan | Notes on the branch | Engine copy | Version |
|---|---|---|---|---|---|
| Rally | `feat/lion-hawk-3-rally` | 3j | `games/rally/docs/plans/2026-10-13-phase-3j-rally-notes.md` | `docs/plans/2026-10-13-phase-3j-rally-notes.md` | 0.4.0 |
| Pig Pens | `feat/lion-hawk-3-pigpens` | 3k | the path its plan names (`games/pig-pens/docs/phase-3k-notes.md`) | `docs/plans/2026-10-13-phase-3k-pigpens-notes.md` | 2.2.0 |
| Tractor Pickup | `feat/lion-hawk-3-tractor` | 3l | the path its plan names | `docs/plans/2026-10-13-phase-3l-tractor-notes.md` | 1.9.0 |

Games merge in the order they finish. For the game being merged:

- [ ] **Step 1: Evidence.** From the branch's notes, check:
  - the plan's Done-when (its suites and counts green on the current engine version);
  - each golden or tape change has a §5.5 record (reason, metric table, commit) with every feel sample inside its tolerance;
  - the frame-rate and size record of its final pass;
  - the version is bumped;
  - every `lh-allow` line is listed.

  **(judgment)** A sample outside tolerance, or a re-bless without a record, is a stop. Report it to the controller as a user playtest item (§5.5.4); do not merge.
- [ ] **Step 2: Ownership.** From `/home/smiller/projects/four43/four43-lh3/games`, run `node test/owners.mjs --repo /home/smiller/projects/four43/four43-lh3 --base feat/lion-hawk-3 --branch <branch> --plan <3j|3k|3l>`. Expected: `stays inside its files`. A game plan's change to `games/package-lock.json` is outside its files: drop it at the merge and regenerate (step 3).
- [ ] **Step 3: Merge.**
  - Run `git -C /home/smiller/projects/four43/four43-lh3 merge --no-ff <branch> -m "chore(merge): <game> on lion-hawk phase 3 (<version>)"`.
  - On a `games/package-lock.json` conflict, take `feat/lion-hawk-3`'s side, then run `npm install` in `/home/smiller/projects/four43/four43-lh3/games` under the unit caps, and commit the lockfile in the merge.
  - Run the game plan's own lockfile and prune requests (3j R1, 3k R1, 3l R1) right after.
- [ ] **Step 4: `MIGRATED`.** Add the game to `MIGRATED` in `games/test/phase3-done.test.mjs` and run Task 16's step 2 command. Expected: PASS. Commit `test(games): <game> passes the phase 3 done-when rules`.
- [ ] **Step 5: Probe opening.** If the game's desktop e2e opening changed (seed, args, settings or scene name), update its `GAMES` entry in `games/test/perf/probe.mjs` to match, and record the change. Run the Task 5 step 2 command: PASS. Commit.
- [ ] **Step 6: Notes into the engine.**
  - Copy the branch's notes file to the engine copy path in `lion-hawk-engine-3m`.
  - Run Procedure F (the game's field note candidates, and any engine notes it closes, for example the Tractor items in "Cross-game final-pass items").
  - Commit `docs(plan): <game> phase 3 notes and field notes #<a>–#<b>`.
- [ ] **Step 7: Gate.** Run Procedure G at the current engine version with the suffix `-<game>` on the log and output names, and `--enforce` set to the merged games.
  - Expected: `GATE PASS`. The game's probe row is within budget, or its plan's R1 decision (for example `shading: 'lambert'`) is recorded with numbers.
  - Record the row in the Frame-rate table, and tag `v-games-<version>-<game>`.
- [ ] **Step 8: Pickup.** Procedure P step 1 to the remaining game worktrees ("merge `feat/lion-hawk-3`: <game> is in"). A conflict there is shared files only (`games/package-lock.json`, `games/test/**`), which the remaining game takes from `feat/lion-hawk-3`.
- [ ] **Step 9: Tractor only** (R5). Confirm both of these in the gate log:
  - the headless bump test (`mp()`, NET_VERSION 4, 80 ms and 2% loss; both peers within 0.5 m of the owner's pose 1 s after contact; no correction over `snapAt`);
  - the `peers()` two-page test.

  Copy the 3l notes' manual interop check (a 1.8.0 device given a 1.9.0 room code shows the version message) into the Hand-off as a user check.

### Task 19: 0.11.0 candidate

**Files:**
- engine: `package.json`, `src/version.js`, `CHANGELOG.md`, `docs/spec.md` (§8.4 note), `docs/plans/2026-10-13-phase-3-overview.md` (status line), the ledger;
- four43: `games/package-lock.json`.

**Interfaces:** Consumes all twelve merged plans. Produces the 0.11.0 candidate on `phase-3-integrate` (published and tagged only after Task 20).

- [ ] **Step 1: Version** `0.11.0` (as in Task 11 step 2). Run the Task 11 step 4 command: PASS (every `SURFACE` row live).
- [ ] **Step 2: CHANGELOG `## 0.11.0 — <date>`, "Phase 3 complete: the three games build their worlds from engine parts."**
  - A summary of 0.7.3–0.10.x by area (materials, World and physics, bake and CLI, renderer and assets, view sync and kits, net part).
  - What the games retired: `assets.json`, `bake.mjs`, `build.py`, the hand-written `RAPIER.World` setups, `gfx.js`/`warm.js`/`matSplit.js`/`shadows.js`/`dispose.js`.
  - The game versions (Rally 0.4.0, Pig Pens 2.2.0, Tractor 1.9.0, Tractor NET_VERSION 4).
  - The out-of-scope list from overview §1.2, as "Not in 0.11".
- [ ] **Step 3: Spec §8.4.** Under the table add: "Phase 3 (2026-10, engine 0.7.3–0.11.0) delivered rows 3–5, plus the terrain, vehicle (Rapier ray-cast), coverage and fx kits the games needed (rows 6–7 in part). Rally's tyre model as a kit backend, kit-herd, fields (row 8) and the shared build mode (row 9) remain. Plan: `docs/plans/2026-10-13-phase-3-overview.md`."
- [ ] **Step 4: Overview status line.** Replace `Status: binding for the phase 3 sub-plans.` with `Status: done (0.11.0, <date>); the record of phase 3. Rulings: 2026-10-13-phase-3-contract-issues.md.`
- [ ] **Step 5: Commit** `chore(release): lion-hawk 0.11.0` and `docs: phase 3 complete in spec §8.4 and the overview`.
- [ ] **Step 6: Final full gate** (Procedure G steps 1–6, without tagging) with `--enforce rally,pig-pens,tractor-pickup`. Expected: `GATE PASS`:
  - every suite green;
  - all three games build into the scratch dir;
  - each probe within budget or with a recorded R1 decision;
  - `MIGRATED` lists all three;
  - no guarded path changed.
- [ ] **Step 7: Traceability table** for the review:

```
cd /home/smiller/projects/four43/lion-hawk-engine && for id in R-6 S-2 T-5 T-17 T-20 I-2 M-1 M-2 M-3 M-7 M-8 A-5 E-1 E-2 E-3 E-4 E-5 E-6 E-7 E-8 E-9 E-10 E-11 E-12 E-13 S-3 L-2 \
  M-4 M-5 M-6 M-9 T-1 T-10 T-12 T-13 T-14 A-1 A-2 A-3 A-4 A-6 A-7 A-8 A-9 A-10 A-11 B-1 B-2 B-3 B-5 M-10 M-11 M-12 M-13 L-5 S-1 \
  N-8 N-9 N-12 N-13 N-14 N-15 N-16 N-17 T-11; do
  f=$(grep -rlw -- "$id" test testing | sort | tr '\n' ' '); echo "$id ${f:-MISSING}"; done
```

  Paste the output into the ledger. Every `MISSING` becomes a review finding.

### Task 20: Final whole-phase review and fix wave (judgment)

**Files:** the ledger. Fix files go to the owners, or are cross-cutting under Task 17's steps (with `0.11.0-rc` fixes folded into 0.11.0 before tagging).
**Interfaces:** Consumes the Task 19 candidate. Produces the reviewed `v0.11.0` and `v-games-0.11.0`.

- [ ] **Step 1: Review request** (through the controller; a fresh reviewer, superpowers:requesting-code-review). The brief:
  - **Diffs:** engine `git -C /home/smiller/projects/four43/lion-hawk-engine diff phase-2g...phase-3-integrate`; four43 `git -C /home/smiller/projects/four43/four43-lh3 diff feat/lion-hawk...feat/lion-hawk-3`.
  - **Against:** overview §1.3 (each bullet with its evidence), §4 (each signature exists as written or as ruled in the contract-issues file), §7 (purity, determinism, allocation: `checks.determinism` and `checks.zeroAlloc` per game), and the traceability table.
  - **Look for:**
    - integrator-file drift (exports that the code does not back);
    - a re-bless without a record;
    - `lh-allow` lines without a reason;
    - leftover game code that duplicates an engine part (the survey's "Duplicated across the games" table, row by row);
    - per-frame allocation in view sync and kits;
    - Rapier objects freed on `clear()` and scene exit;
    - a game that reads `engine.assets` from sim code.
  - **Output:** Critical / Important / Minor, each with file:line and the owner.
- [ ] **Step 2: Triage (judgment).**
  - Critical and Important findings are fixed before tagging: owner worktrees if still open, else integrator fixes with failing tests first (Task 17 steps 2–4, without a version bump; the CHANGELOG 0.11.0 entry gains a "Review fixes" list).
  - Minor findings go to the Hand-off's "Parked" list, as the 2g review did.
  - Record each finding and its outcome in the ledger.
- [ ] **Step 3: Re-gate** (Procedure G in full) after the fixes. Expected: `GATE PASS`.
- [ ] **Step 4: Tag** `v0.11.0` and `v-games-0.11.0` (Procedure G step 7). Lift the freeze.

### Task 21: User hand-off

**Files:** `docs/plans/2026-10-12-progress.md` (rewritten as the phase 3 resume page), and the ledger's Hand-off section.
**Interfaces:** Produces the page the controller relays to the user. Nothing is pushed, merged into `feat/lion-hawk` or `gh-pages`, or deployed.

- [ ] **Step 1: iPad builds** for R1:

```
for g in rally pig-pens tractor-pickup; do
  systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
    --working-directory=/home/smiller/projects/four43/four43-lh3/games/$g -E NODE_OPTIONS=--max-old-space-size=512 \
    npx lion-hawk build --out /tmp/claude-1000/lion-hawk-phase3/3m/ipad/$g
done
git -C /home/smiller/projects/four43/four43-lh3 status --short site
```

  Expected: three dirs with `index.html` and `assets/models/`; `status` prints nothing.
- [ ] **Step 2: Rewrite the progress page.** Use the existing page's structure: Where things live, Status by game, Resume plan, Running tests safely, Needs the user. Fill it from the ledger:
  - **Where things live:**
    - the engine at `phase-3`/`v0.11.0` (local; not pushed);
    - four43 `feat/lion-hawk-3`/`v-games-0.11.0` (local);
    - every worktree from the Paths table, with whether it can be removed (only on the user's word).
  - **Status by game:** versions; suite counts from the last gate; goldens bit-exact or re-blessed (with the cause and the notes reference); the Frame-rate table rows; size versus today.
  - **Needs the user:**
    1. **Playtests.** Each game's list from its notes (feel samples near tolerance, per-metre dirt, the FOV changes, Rally's 4° wider portrait FOV, and the like), plus 3l's: solid tractors that honk on contact (debounced), and the two-device bump feel (contract-issues 3i #4, which decides on a clock-sync follow-up).
    2. **iPad frame-rate runs (R1).** For each game: the live release on four43.com versus the branch build in `/tmp/claude-1000/lion-hawk-phase3/3m/ipad/<game>`, with `?fps`, on the same route as the probe opening. Serving the build to the iPad over the LAN (for example `python3 -m http.server --bind 0.0.0.0 8740 -d /tmp/claude-1000/lion-hawk-phase3/3m/ipad/<game>`) opens a port, so it is the user's to run. A median frame time more than 10% worse means `shading: 'lambert'` for that game (D5), plus a field note with the numbers. Pig Pens ships Lambert until these runs (contract-issues 3k).
    3. **The Tractor 1.8.0 ↔ 1.9.0 room-code check** on real devices (R5c).
    4. **Merge and deploy decisions:**
       - how four43 pins the engine (the `file:` link needs the sibling checkout);
       - pushing engine `phase-3` and the tags;
       - whether engine `main` takes the phase branches;
       - merging `feat/lion-hawk-3` into `feat/lion-hawk` and then `gh-pages`;
       - running each game's `npm run build -- --site` (the user's own `--site` build) and deploying;
       - NET_VERSION 4 rollout timing (1.8.0 and 1.9.0 rooms do not mix).
    5. **Pre-existing dirt** in `four43-lion-hawk` (`site/exp/piggie-game/*` modified, from Task 1 step 6) and the untracked files in the main four43 checkout. Both were left alone.
    6. **Worktree clean-up** (eleven worktrees) once the user has merged what they want.
  - **Parked:** the review's Minor findings and each plan's parked items.
- [ ] **Step 3: Commit and publish** `docs: phase 3 complete; resume page and what needs the user`. Publish by fast-forward (docs only). Hand the page's "Needs the user" list to the controller.

---

## Done when

- `phase-3` in the engine main checkout is at the reviewed 0.11.0 commit, tagged `v0.11.0` locally, and every intermediate gate is tagged (`v0.7.3`, `v0.8.0`, `v0.9.0`, `v0.10.0`, patch tags as they happened).
- `feat/lion-hawk-3` holds all three game merges, tagged `v-games-0.11.0`.
- The final gate log (`/tmp/claude-1000/lion-hawk-phase3/3m/gates/0.11.0.log`) and its ledger row show:
  - the engine suites green, with the count at least gate 0's 387 plus every plan's new tests, and every drop explained under "Removed or renamed tests";
  - the workspace green, including `gate` (9), `owners` (5), `perf` (9), `workspace` (7) and `phase3-done` (4 = 1 + 3 games);
  - Rally `test:e2e` and `test:mobile`, Pig Pens `test:e2e` and Tractor `test:e2e` green (Tractor's includes the two-page `peers()` test);
  - three scratch builds;
  - three probe rows within the R1/R3 budgets, or with a recorded decision;
  - no guarded path changed.
- Engine guard tests pass at 0.11.0: `test/package-phase3.test.mjs` (every row live), `test/purity-phase3.test.mjs`, `test/field-notes.test.mjs`.
- `docs/field-notes.md` is numbered without gaps from 1, with every phase 3 candidate numbered from #110, and #95, #100, #105–#109, #1, #2, #11 and #67 updated.
- `CHANGELOG.md` has 0.7.3, 0.8.0, 0.9.0, 0.10.0, each 0.10.x and 0.11.0. `docs/spec.md` has 3a's parts A (D1–D9, approved 2026-10-14) and B, and the §8.4 note.
- The final review's Critical and Important findings are closed. The hand-off page is committed and relayed. Nothing was pushed or deployed.

## Notes

The notes file is `docs/plans/2026-10-13-phase-3m-integration-notes.md` (Task 2). Its last section, **"Field note candidates"**, collects what integration itself teaches. Candidates already expected:
- the `file:` link makes every engine merge live in every game worktree at once, which is why gates need a freeze;
- `build.py` in Rally and Pig Pens has no out-dir override, so baselines need an archive copy;
- a stub file shared across plans needs a marker that a test can check.

The integrator numbers its own candidates last, after the game plans' candidates, at Task 21.

## Contract issues

Rulings (contract-issues "3m integration"): 1–6 all accepted as decided below. User decisions (2026-10-14): D1–D9 approved, so Task 9 writes 3a's part A with part B; execution is subagent-driven in this plan's parallel worktrees, in dependency waves with gated `--ff-only` merges; the reconciliation pass is committed (a `docs(plan)` commit, which Task 1 step 1 accepts) with no review gate before Task 1.

1. **The integrator's four43 worktree and the scratch path are not named in §6.** Decision: `/home/smiller/projects/four43/four43-lh3` on `feat/lion-hawk-3` (same depth, so the link resolves), and `/tmp/claude-1000/lion-hawk-phase3/3m` (per the process note on per-plan scratch dirs).
2. **Publishing `phase-3` while game worktrees consume it live.** §6 says only the integrator commits on the main checkout. Decision: merges happen on `phase-3-integrate` in a second worktree and reach `phase-3` only by `--ff-only` inside a freeze. A rollback is `reset --keep` to the previous local tag.
3. **Branch cut times.** §6 says sub-plan branches are cut after 3a merges, while §5.1 has 3f–3i depending on 0.8.0. Decision: 3b–3e are cut at `v0.7.3`; 3f–3i and the game branches at `v0.8.0`. Early landings that another plan's prerequisites need (3b for 3c, 3e and 3f for 3g, 3c/3i seams) are patch releases with a lighter gate.
4. **Unowned shared files.** `testing/purity.js`, `test/purity.test.mjs`, `games/package.json`, `games/package-lock.json` and `docs/plans/2026-10-12-progress.md` have no row in §5.2. Decision: they are the integrator's (constraint 13). Game plans change only their own `games/<game>/package.json` and ask for the lockfile (3j, 3k and 3l already do).
5. **§7.1 and Rapier in game sim trees.** §7.1 lists `@dimforge/rapier3d-compat` as forbidden in "every game's sim tree", while games inject Rapier from their entries (contract-issues 3j #2). Decision: the Rapier purity rule is opt-in, applied to engine roots only. The games' purity tests are unchanged.
6. **Dependency ranges.** Overview §3.2 says `@gltf-transform/*` `^4.5`; 3d request 1 asks for exact `4.5.1`, `meshoptimizer` `~1.2.0`, `pngjs` and `esbuild` as dependencies. Decision: 3d's pins (they satisfy `^4.5`), landed at 0.7.3 so 3d starts with them.

## Integrator requests

None to others: this is the integrator's plan. Two asks go through the controller:
- the game plans keep their desktop e2e openings stable, or say when they change them (Task 18 step 5);
- the game agents merge `feat/lion-hawk-3` when told (Procedure P), above all before 3e lands (Task 13).
