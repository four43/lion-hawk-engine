# Phase 1 — outcome, rulings and carry-overs

Status: done. Engine branch `phase-1` (0.1.2), four43 `feat/lion-hawk`. Not merged, not pushed, not deployed.

## What landed
- Engine `peerDependencies` and `devDependencies`: three ^0.186, Rapier ^0.21 (G-2). `golden()` failures now name the first diverging `trail[k]`.
- In the four43 worktree, `games/lion-hawk-engine` is a real git worktree of the engine, so bare imports resolve from `games/node_modules`.
- `games/test/workspace.test.mjs` checks for one three and one Rapier across the workspace, a real engine folder, and the peer ranges.
- Pig Pens moved from three 0.160 to 0.186. The only change was `PCFSoftShadowMap` → `PCFShadowMap`, since r186 removed the former. Before and after screenshots look identical.
- Goldens record a checksum trail every 60 steps. The re-blessed goldens had their final state verified identical.
- A new Tractor Pickup pickup golden covers boop → launch → land for 3 animals and includes a bit-exact determinism twin.
- Suites: workspace 4, engine 48, Pig Pens 2, Tractor Pickup 726.

## Rulings (each with its cost if wrong)
1. The engine's peer dependencies were added after the Pig Pens upgrade, because npm would otherwise fail to resolve versions (ERESOLVE). Cost: none.
2. Task 1 committed deliberately red acceptance tests, which turned green within the phase. Cost: two red intermediate commits on the branch.
3. Package roots are resolved with `module.findPackageJSON`, because Rapier does not export `./package.json`. Cost: none on Node 26.
4. The engine's `devDependencies` mirror its peers, so the engine can run its tests on its own. Cost: the standalone checkout gets its own `node_modules`.
5. Pickup golden events are keyed by step and its trail covers the whole run. This needed one format re-bless, and its state was proven unchanged.
6. The controller keeps a local bare backup clone of the engine at `/home/smiller/projects/four43/lion-hawk-engine-backup.git`. It is refreshed per phase and is not a real remote.
7. Rally is still excluded. Its share of phase 1 (three 0.186, Rapier 0.14 → 0.21) waits for its uncommitted work to be committed.

## Carry-overs
- Phase 3 CLI: an esbuild alias or dedupe for three and Rapier (the rest of G-2).
- Leave: the workspace test hard-codes the 0.186 and 0.21 versions.
- Needs the user: an engine remote. Merging `feat/lion-hawk` into `gh-pages` stays blocked until it exists.
