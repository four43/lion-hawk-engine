# Phase 3: instructions for sub-plan writers

You are writing ONE sub-plan of Lion Hawk phase 3. Several writers work in parallel, one file each, against the same contract. Implementers will later execute your plan task by task in their own git worktree, each task reviewed before the next, with several plans executing in parallel.

## Read

1. `docs/plans/2026-10-13-phase-3-overview.md` (engine repo `/home/smiller/projects/four43/lion-hawk-engine`, branch `phase-3`). It is binding. Read all of §1, §2, §3, §5, §6, §7, §8, and in §4 every subsection your plan produces or consumes.
2. `docs/plans/2026-10-13-phase-3-survey.md` for the game-side facts.
3. `docs/spec.md`: the requirement IDs your plan implements. The spec is the authority. The overview's §2 deltas D1–D9 are approved amendments to it.
4. The real code you will change or build on. Read it; do not guess names. For game plans, that is the game under `/home/smiller/projects/four43/four43-lion-hawk/games/<game>` (branch `feat/lion-hawk`, e03ed71). For engine plans, it is `src/`, `testing/`, `test/` and `tools/` in the engine repo.
5. Field notes in `docs/field-notes.md` that touch your area.

## Write

Write `docs/plans/<your file>` in the engine repo, using the superpowers writing-plans format:

- **Header:** Goal, Architecture, Tech Stack, and Spec. Spec is `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md`.
- **Global Constraints:** overview §7 copied verbatim, plus your plan's own constraints.
- **Review Focus:** the five input or failure modes most likely to bite, each pinned by a test inside a task.
- **File Structure:** every file you create or modify, with its responsibility. Stay inside your "Owns" column in overview §5.2. Never touch the "Must not touch" files. Integrator files (`src/index.*.js`, `package.json`, `CHANGELOG.md`, `docs/spec.md`, `docs/field-notes.md`) are always off limits. Anything you need there is written as a numbered "Integrator request" section at the end of your plan.
- **Tasks:**
  - Each task has Files, Interfaces (Consumes/Produces, with exact signatures matching overview §4), and checkbox steps: failing test → run, expect FAIL with the reason → implementation → run, expect PASS → commit.
  - Give complete code in code steps; no placeholders, no "similar to Task N".
  - Every test must be able to fail. Where a check is subtle, add a step that proves it red by mutation.
  - Size each task so a fresh reviewer could reject it alone, typically 1–3 files.
  - Mark tasks that need design judgment with **(judgment)** and state the decision you expect.
- **Test commands** follow overview §7 exactly:
  - unit runs: `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=300 --working-directory=<dir> -E NODE_OPTIONS=--max-old-space-size=512 …`;
  - direct `node --test` runs add `--test-concurrency=4`;
  - browser suites run under `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run … MemoryMax=3G … --max-old-space-size=2048`.
- **A "Done when" section:** the suites and counts that must pass, plus the version or merge point.
- **A notes stub:** name your `…-notes.md` file and its "field note candidates" section.
- **Contract issues:** if overview §4 is wrong or underspecified for your work, do NOT silently change the interface. Make the smallest decision that works, mark it "Contract issue:" in a section at the end, and list it in your reply. The controller reconciles these across plans.

Commits named in your plan use conventional-commit subjects and never carry Claude attribution. Plans do not commit; the controller commits the plan files.

## Do not

- Do not edit any file other than your plan file (and only create it).
- Do not run test suites; reading code and small `node -e` probes are fine.
- Do not dispatch subagents.

## Reply

Reply with ONLY, in under 10 lines:
- the plan path;
- the task count;
- the contract issues, one line each;
- the integrator requests, one line each;
- anything that needs the user.
