# Phase 0: outcome, rulings and carry-overs

Status: done on engine branch `phase-0` and four43 branch `feat/lion-hawk` (worktree `four43-lion-hawk`). Neither branch is merged, pushed or deployed.

## What landed

**Engine** (`f07a5ca..c77cc3b`):
- package scaffold (`lion-hawk`: `./sim`, `./view`, `./test`)
- sim purity scan
- `rng`, `math`, `events` and `flags`
- the `installEngineHook` (`window.engine`) hook
- test helpers: `canonical`, `checksum`, `diff`, `assertFinite` and `golden`
- `CHANGELOG.md`

46 tests.

**four43** (`8fd7911..48643ae`):
- a `games/` npm workspace; Pig Pens and Tractor Pickup depend on `lion-hawk` (`file:../lion-hawk-engine`)
- a characterisation golden plus a bit-exact determinism test for each game
- `window.engine` in both games: `{ version, game, stepN?, state, seed?, debug }`

The suites pass: engine 46, Pig Pens 2, Tractor Pickup 724.

## Rulings made during execution

Each ruling lists what it costs if it turns out to be wrong.

1. **The engine is its own git repo**, mounted at `games/lion-hawk-engine` and symlinked into the four43 worktree; the symlink is excluded from git.
   - Why: the user said it is a new repo.
   - Cost if wrong: convert it to a submodule later.
2. **Engine work is on branch `phase-0`, not `main`.**
   - Cost if wrong: one local merge.
3. **Peer dependencies on three.js and Rapier are deferred to phase 1.**
   - Cost if wrong: phase 1 adds them.
4. **Rally is excluded from phase 0**, because its uncommitted game-loop work is in the main checkout.
   - Cost if wrong: Rally's golden and hook come in a follow-up.
5. **Tasks 1–7 and Tasks 9–10 were batched** (one implementer and one review per batch).
   - Cost if wrong: a larger review surface.
6. **`golden()` writes a missing golden locally but throws when `CI` is set.**
   - Cost if wrong: CI needs goldens committed, which is intended.
7. **The game dependency is `file:../lion-hawk-engine`, so npm never looks in the public registry**, where `lion-hawk` is unclaimed.
   - The remote, submodule or pin needs the user.
   - **Do not merge `feat/lion-hawk` into `gh-pages` until the engine has a remote**, or the site repo's two games depend on a folder that exists on one disk.
8. **`window.engine` follows spec D-4.**
   - `version` and `game` are reserved keys, applied last.
   - Game extras go under `debug`.
   - Pig Pens' old `render(dt)` lives at `debug.render`, so it doesn't collide with the future `render(alpha)`.
9. **Events:**
   - payload keys can't overwrite `seq`, `step` or `type`;
   - a listener that throws drops the events already delivered (the event it threw on counts as delivered) and the error propagates;
   - `flush()` returns a reused array.
10. **Purity scan:**
    - comment stripping is string-aware;
    - it now also catches side-effect `import 'three'`, multi-line `import(`, `new Date(` and `Date(`, `globalThis.window` and `globalThis.document`, and `self.`;
    - the runtime guard (T-12) stays a phase 2 item.

## Carry-overs

**Into phase 1:**
- The symlink resolves to the engine's real path. So once engine code imports `three` or Rapier, Node and esbuild look for them in the main checkout's `games/node_modules`. Make the engine a real directory in the worktree (an engine `git worktree`, or a submodule once a remote exists), and dedupe three and Rapier in the build.
- Add a Tractor Pickup golden that reaches pickup and landing; the current drive only honks.
- Goldens should record a checksum every 60 steps, so divergence is localised.

**Into phase 2:**
- When the games adopt `flags`, decide the seed rules. Today's games map bad seeds differently: Tractor Pickup uses `null` (random), Pig Pens uses 0.
- Tractor Pickup's `state()` throws in `?sandbox` and in the middle of a farm swap.
- The T-12 runtime purity guard.
- Typed arrays are already handled for the E-10 pools.

**Leave:**
- golden message polish (an "and N more" line, the path on a corrupt file);
- Pig Pens dependency ordering;
- the purity scan doesn't understand regex literals;
- the `self.` rule can flag a local variable named `self`;
- reinstalling the hook on a frozen api throws.

**Needs the user:**
- an engine remote;
- Rally's work-in-progress commit, after which Rally joins the workspace, gets a golden and gets `window.engine`;
- whether CI should run `npm test`.
