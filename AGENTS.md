# Lion Hawk engine

An opinionated 3D web physics engine for browser games: three.js, Rapier, glTF, a material registry and host-authoritative netcode. Games install it at a release tag.

For the public surface (which export does what, and where its spec is) read [`docs/agents.md`](docs/agents.md). It ships in the package to every game, so keep it current when an export is added, renamed or removed. `test/agents-doc.test.mjs` fails on a dead link or a name an entry point does not export.

## Which doc is the truth

- `docs/specs/as-built/`: what the code does now, one `B-n` statement per behavior with `path:line` evidence. Check here first.
- `docs/spec.md`: the decisions and requirement IDs (`[L-3]`, `[M-14]`, …). Code comments, commits and the changelog cite these IDs. A behavior change built after a requirement was written is recorded as a `*Clarification (built, …)*` under that requirement.
- `docs/field-notes.md`: numbered lessons from the games. The numbering and fields are checked by `test/field-notes.test.mjs`.
- `docs/design.md`, `docs/research*.md`: background reasoning.

## Rules the tests enforce

- **Sim purity ([L-3]).** `src/core`, `src/defs`, `src/sim` and every kit's `sim.js` run in Node: no three.js, no DOM, no wall clock, no imports from view code. The engine never imports Rapier; the game passes it in. View modules import three.js directly. `test/purity.test.mjs` scans for this.
- **Determinism.** The same seed and tape give the same checksum. Draw randomness from `rng` streams and keep iteration in entity id order.
- **No per-step allocation** in step-stage code that the engine runs every step ([M-14] for fields). `test/alloc-rate.test.mjs` holds the engine to a byte budget per step.
- **Warnings are failures.** Under `node --test` an unexpected `console.warn` or `console.error` inside a headless handle call fails the test; expected ones need `h.expectWarning(re)`.

Plain JavaScript ES modules, no TypeScript and no build step for the engine itself.

## Testing

`npm test` runs the whole suite. Run one file with `node --test test/<name>.test.mjs`. Browser tests start Chromium through `launch()` in `testing/playwright.js` and skip when none is found. `pads-e2e.test.mjs` fails now and then under the parallel suite; rerun it alone before treating it as a regression.

## When you change behavior

1. Add a line under `## Unreleased` in `CHANGELOG.md`, citing the requirement ID. Mark changes that break games in bold.
2. If the change departs from `docs/spec.md`, add the clarification there.
3. Update `docs/agents.md` if the change adds, renames or removes something a game calls.
4. Refresh the affected as-built specs (see "Reruns" in `docs/specs/as-built/README.md`).

Commits use conventional types with a scope, and the subject states the behavior as a sentence: `fix(sim): the magnet field reuses its candidates and moment vector (M-14: …)`. A release is a `chore(release): lion-hawk X.Y.Z` commit and an annotated tag `vX.Y.Z` with the message `lion-hawk X.Y.Z: <summary>`.
