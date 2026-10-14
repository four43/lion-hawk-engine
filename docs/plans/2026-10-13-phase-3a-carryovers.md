# Phase 3a: engine carry-overs (0.7.3): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Goal:** close the engine leftovers from phases 2f and 2g before phase 3 forks, so that every later sub-plan starts from 0.7.3:
- #95 `engine.overlay(name, args, { once })`;
- #100 `untilLoaded` (headless and Playwright) also waits for commands that were pending when it was called;
- #105 overlay args reach view halves (`enter(engine, view, args)`, `engine.scene.overlayArgs(name)`);
- #107 `peers()` defaults to `render: 'manual'`;
- #108 a game `reset()` hook that `createEngine` calls first;
- #109 `bindGesture` measures holds and taps on the pointer events' own clock;
- the G-E2 parked minors (domAsserts guard gaps, `setup2` placement);
- the spec write-up of deltas D1–D9 plus this plan's own amendments (integrator-executed, gated on the user's approval).

**Architecture:**
- Every change is small and local to the file that owns the behaviour: `src/core/engine.js` (#95, #105 sim side, #108), `src/view/boot.js` (#105 view side), `src/view/gesture.js` (#109), `testing/headless.js` (#95 pass-through, #100), `testing/playwright.js` (#100, #107), `src/view/hook.js` (two pass-throughs, see Contract issue 1).
- Nothing new is exported. No new stage, system or state key. `engine.state()` and checksums are unchanged, so no golden or tape moves.
- Callers that pass none of the new options see no change, with three deliberate exceptions, each pinned by a test: `untilLoaded` steps once more when commands are pending at the call (#100), `peers()` pages open with `?lh-test=render` (#107), and `bindGesture` reads the event clock (#109).

**Tech Stack:** Node 22 ESM, `node:test`, happy-dom 20 (view unit tests), playwright-core 1.64 with SwiftShader Chromium (browser tests). No three.js or Rapier code is touched.

**Spec:** `docs/spec.md` plus `docs/plans/2026-10-13-phase-3-overview.md` (binding; §2 deltas D1–D9 are approved amendments once the user signs them off, §9.1). Requirement IDs: R-6, S-1, S-2, T-5, T-9, T-17, T-20, I-2, D-4, §8.2. Field notes #95, #100, #103, #105, #107, #108, #109.

**Base:** engine branch `phase-3` (8744038 or the later plan-docs commit). Worktree `~/projects/four43/lion-hawk-engine-3a` on branch `phase-3-carryovers`. The integrator merges it into `phase-3` with `--no-ff` and bumps to 0.7.3. Every other engine branch is cut from `phase-3` after that merge.

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

**This plan's own constraints:**
- 3a runs alone, before any other phase 3 branch exists. Keep diffs minimal in `engine.js`, `boot.js` and `headless.js`, because 3c and 3e fork from them.
- No new public exports, no version bump, no CHANGELOG or spec edits by the implementer. Task 10 is executed by the integrator (see its header).
- `engine.state()`, checksums, tape format (`v: 1`) and replay ops are unchanged. A no-op `overlay(..., { once: true })` is never recorded.
- The three files outside the §5.2 "Owns" column that this plan edits are listed under Contract issues 1–3. Touch nothing else.
- Shorthands used in the steps (`WT=/home/smiller/projects/four43/lion-hawk-engine-3a`):
  - **UNIT** `<files>` = `systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=300 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>`
  - **BROWSER** `<file>` = `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 <file>`
  - **SUITE** = `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 test/`. The engine's `test/` directory includes the e2e files, so the whole suite takes the browser lock and the browser caps.

## Review Focus

The five input or failure modes most likely to bite, each pinned by a test:

1. **`untilLoaded` never returns when a system issues a command every step.** A literal "keep stepping while `commands.pending > 0`" would spin until `maxSteps`. Decision: it steps at least once when commands were pending *at the call*, then waits for the load. Pinned by Task 5, test 3 (and its mutation step).
2. **A no-op `overlay(..., { once: true })` leaks into a tape**, or a once request is judged against the live stack instead of the projected one. A tape would then replay a throwing `overlay`; a once request issued after a queued `close` would be dropped. Pinned by Task 2, tests 2–4 (the recorded tape replays; a once after a queued close opens; a mutation to `isOpen` fails two tests).
3. **A short tap at a stuttering frame rate becomes a hold** (#109): the frame-sum counted the whole frame before the down. Pinned by Task 8, test 1 (a 140 ms tap at 570 ms frames stays a tap; the old code fires the hold).
4. **Tunables survive into a replay** (#108): a tape whose `tune` command lands at step 60 diverges at step 60 if module constants keep the tuned value. Pinned by Task 1, test 1 (with a mutation step that removes the `reset` call).
5. **A view half gets stale or missing args** (#105) on re-entry: a main scene re-entered by `go(name, args)`, or an overlay closed and reopened with new args. Pinned by Task 4, test 2.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/core/engine.js` | modify | `defineGame` validates `reset`; `createEngine` calls `game.reset()` first (#108). `engine.overlay(name, args, opts)` with `{ once }` (#95). `engine.scene.overlayArgs(name)` (#105). |
| `src/view/boot.js` | modify | View halves' `enter(engine, view, args)` receive their scene's args (#105). |
| `src/view/gesture.js` | modify | Holds and taps on the event clock: `event.timeStamp` plus an injectable `now` (#109). |
| `src/view/hook.js` | modify (Contract issue 1) | `window.engine.commands` (live) and `overlay(n, a, o)` pass-through. |
| `testing/headless.js` | modify | `h.overlay(n, a, o)`; `h.untilLoaded` waits for commands pending at the call (#100). |
| `testing/playwright.js` | modify | `game.untilLoaded` waits for commands pending at the call (#100); `peers()` defaults to `render: 'manual'` (#107). |
| `test/helpers/domScan.mjs` | create | The domAsserts guard's scanner: every assert equality form, a quote-aware argument splitter, documented limits (G-E2). |
| `test/domAsserts.test.mjs` | modify | Uses `domScan.mjs`. |
| `test/gesture.test.mjs` | modify (Contract issue 2) | Two hold/tap timings move onto an injected clock. |
| `test/uiDom.test.mjs` | modify (Contract issue 3) | `setup2` moves up beside `setup` (G-E2). |
| `test/reset.test.mjs` | create | #108. |
| `test/overlay-once.test.mjs` | create | #95. |
| `test/overlay-args.test.mjs` | create | #105, engine side. |
| `test/boot-args.test.mjs` | create | #105, view side. |
| `test/untilLoaded.test.mjs` | create | #100, headless. |
| `test/untilLoaded-driver.test.mjs` | create | #100, Playwright driver against a fake page. |
| `test/hook-commands.test.mjs` | create | `window.engine.commands` and overlay options through the hook. |
| `test/untilLoaded-e2e.test.mjs` | create | #100 in real Chromium (loader fixture). |
| `test/peers-render.test.mjs` | create | #107 against a fake browser. |
| `test/gesture-stamp.test.mjs` | create | #109. |
| `test/domAsserts-scan.test.mjs` | create | G-E2 scanner cases. |
| `docs/plans/2026-10-13-phase-3a-carryovers-notes.md` | create (Task 11) | Outcome, rulings, field note candidates. |
| `docs/spec.md` | modify, **integrator only** (Task 10) | D1–D9 and this plan's amendments. |

---

## Tasks

### Task 0: Worktree

**Files:** none.

- [ ] **Step 1: Create the worktree and install.**

```bash
git -C /home/smiller/projects/four43/lion-hawk-engine worktree add -b phase-3-carryovers /home/smiller/projects/four43/lion-hawk-engine-3a phase-3
cd /home/smiller/projects/four43/lion-hawk-engine-3a && npm install --no-audit --no-fund
```

- [ ] **Step 2: Baseline.** Run **SUITE**. Expected: all pass (387 at the 2g close; record the actual count in the notes as the baseline). If anything fails, stop and report: the base must be green.

---

### Task 1: `reset()` hook (#108)

**Files:** modify `src/core/engine.js`; create `test/reset.test.mjs`.

**Interfaces:**
- Consumes: `defineGame(spec)`, `createEngine(game, opts)`, `headless`, `replay` (unchanged).
- Produces: `defineGame({ reset() {} })` (overview §4.1): an optional function, called with no arguments as the first statement of every `createEngine(game, …)`. Every `headless()`, `replay()`, `mp()` peer and `boot()` creates an engine, so each resets. `defineGame` throws `defineGame: reset must be a function` for a non-function. A throwing `reset` propagates out of `createEngine` before anything else runs.

- [ ] **Step 1: Write the failing test** `test/reset.test.mjs`:

```js
// #108: a game's reset() puts module tunables back before every engine starts, so a tape with a `tune` command replays
// exactly even after the recording run left the constants tuned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';
import { headless, replay } from '../testing/index.js';

const T = { speed: 1 }; // a game's module-level feel constants, as Tractor's P/PILOT/TP
const tuned = () => defineGame({
  id: 'tune', start: 's',
  reset() { T.speed = 1; },
  commands: { tune: (e, d) => { T.speed = d.speed; } },
  scenes: { s: { enter(e, ctx) { ctx.state.x = 0; }, step(e, dt, ctx) { ctx.state.x += T.speed * dt; } } },
  state: e => ({ x: e.scene.state.x }),
});

test('#108: a tape with a tune command replays exactly although the recording left the constant tuned', () => {
  const g = tuned(), h = headless(g, { record: true });
  h.step(60); h.command('tune', { speed: 3 }); h.step(60);
  const tape = h.tape();
  assert.equal(T.speed, 3); // the recording run leaves the constant tuned
  replay(g, tape); // without reset, the replay runs its first 60 steps at speed 3 and throws at step 60
  assert.equal(T.speed, 3); // the replayed command tuned it again
  T.speed = 1;
});

test('#108: reset runs first in every createEngine, before setup and the start scene', () => {
  const order = [];
  const g = defineGame({ id: 'r', start: 's', reset() { order.push('reset'); }, setup() { order.push('setup'); }, scenes: { s: { enter() { order.push('enter'); } } } });
  createEngine(g); createEngine(g);
  assert.deepEqual(order, ['reset', 'setup', 'enter', 'reset', 'setup', 'enter']);
});

test('#108: defineGame rejects a non-function reset; a throwing reset stops createEngine before the start scene', () => {
  assert.throws(() => defineGame({ id: 'r', start: 's', reset: 1, scenes: { s: {} } }), /defineGame: reset must be a function/);
  let entered = false;
  const g = defineGame({ id: 'r', start: 's', reset() { throw new Error('reset boom'); }, scenes: { s: { enter() { entered = true; } } } });
  assert.throws(() => createEngine(g), /reset boom/);
  assert.equal(entered, false);
});
```

- [ ] **Step 2: Run** **UNIT** `test/reset.test.mjs`. Expected: FAIL. Test 1 throws `replay: checksum differs at step 60`; test 2's order lacks `'reset'`; test 3's `defineGame` does not throw.

- [ ] **Step 3: Implement** in `src/core/engine.js`.

In `defineGame`, after the `setup` check (line 22), add:

```js
  if (spec.reset !== undefined && typeof spec.reset !== 'function') fail('reset must be a function');
```

Make the first line of `createEngine`'s body (before the `wall0` check):

```js
  game.reset?.(); // #108: module tunables back to their shipped values first, so every engine (a replay, each mp() peer) starts from them
```

- [ ] **Step 4: Run** **UNIT** `test/reset.test.mjs test/engine.test.mjs test/replay.test.mjs`. Expected: PASS.

- [ ] **Step 5: Prove test 1 by mutation.** Comment out the `game.reset?.()` line and run **UNIT** `test/reset.test.mjs`. Expected: test 1 fails with `replay: checksum differs at step 60`. Restore the line.

- [ ] **Step 6: Commit.** `git add src/core/engine.js test/reset.test.mjs && git commit -m "feat(engine): defineGame reset() runs first in every createEngine (#108)"`

---

### Task 2: `engine.overlay(name, args, { once })` (#95)

**Files:** modify `src/core/engine.js`, `testing/headless.js`; create `test/overlay-once.test.mjs`.

**Interfaces:**
- Consumes: `projectedOpen(name)` (engine-internal, unchanged), `recorded`, `reqOverlay`.
- Produces:
  - `engine.overlay(name, args, opts?) → engine`. `opts` is `undefined` or an object; `opts.once` is `undefined` or a boolean. With `once: true`, the call is a no-op when `name` is open or will be open once the queued transitions apply (`isOpen(name, { pending: true })`). A no-op is never recorded. Otherwise the call is exactly today's `overlay(name, args)`, recorded as today's `['overlay', name, args]`, so the tape format and replay are unchanged.
  - Errors: `engine: overlay options must be an object`, `engine: overlay once must be a boolean`, and an unknown scene still throws `engine: no scene '<name>'` with `once`.
  - `h.overlay(name, args, opts)` passes `opts` through.

- [ ] **Step 1: Write the failing test** `test/overlay-once.test.mjs`:

```js
// #95: overlay(name, args, { once: true }) is a no-op when the overlay is open or pending, so a game reaching one overlay
// from a cue, a command and a hold needs no isOpen guard. Judged on the projected stack; never recorded when it is a no-op.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';
import { headless, replay } from '../testing/index.js';

const cardGame = (enters, main = {}) => defineGame({ id: 'once', start: 'm', scenes: { m: main, card: { enter(e, ctx) { enters.push(ctx.args); } } } });

test('#95: once on an open overlay is a no-op; without it the duplicate still throws', () => {
  const enters = [], e = createEngine(cardGame(enters));
  e.overlay('card', { n: 1 });
  assert.equal(e.overlay('card', { n: 2 }, { once: true }), e);
  assert.deepEqual(enters, [{ n: 1 }]);
  assert.deepEqual(e.scene.overlays, ['card']);
  assert.throws(() => e.overlay('card', { n: 3 }), /scene 'card' is already open/);
  assert.throws(() => e.overlay('card', { n: 4 }, { once: false }), /scene 'card' is already open/);
});

test('#95: two once requests in one step open the overlay once (the second sees it pending)', () => {
  const enters = [];
  const e = createEngine(cardGame(enters, { step(en) { en.overlay('card', { n: 1 }, { once: true }); en.overlay('card', { n: 2 }, { once: true }); } }));
  e.stepN(1); assert.deepEqual(enters, [{ n: 1 }]); assert.deepEqual(e.scene.overlays, ['card']);
  e.stepN(1); assert.deepEqual(enters, [{ n: 1 }]); // already open: still a no-op
});

test('#95: a once request after a queued close reopens the overlay (projected stack, not the live one)', () => {
  const enters = []; let k = 0;
  const e = createEngine(cardGame(enters, { step(en) { k++; if (k === 1) en.overlay('card', { n: 1 }); if (k === 2) { en.close('card'); en.overlay('card', { n: 9 }, { once: true }); } } }));
  e.stepN(2);
  assert.deepEqual(enters, [{ n: 1 }, { n: 9 }]); assert.deepEqual(e.scene.overlays, ['card']);
});

test('#95: a no-op once is not recorded and the tape replays; bad options throw', () => {
  const enters = [], g = cardGame(enters), h = headless(g, { record: true });
  h.overlay('card', { n: 1 }); h.overlay('card', { n: 2 }, { once: true }); h.step(60);
  const tape = h.tape();
  assert.deepEqual(tape.log, [{ step: 0, ops: [['overlay', 'card', { n: 1 }]] }]);
  assert.deepEqual(replay(g, tape).scene.overlays, ['card']);
  const e = createEngine(g);
  assert.throws(() => e.overlay('card', {}, 'x'), /engine: overlay options must be an object/);
  assert.throws(() => e.overlay('card', {}, { once: 1 }), /engine: overlay once must be a boolean/);
  assert.throws(() => e.overlay('nope', {}, { once: true }), /no scene 'nope'/);
});
```

- [ ] **Step 2: Run** **UNIT** `test/overlay-once.test.mjs`. Expected: FAIL. Tests 1, 2 and 4 throw `scene 'card' is already open` from the once call; test 4's option checks do not throw. Test 3 passes before the change: it pins the projected-stack rule and is proven by the mutation in Step 5.

- [ ] **Step 3: Implement** in `src/core/engine.js`. After `const alreadyOpen = …;` (line 301), add:

```js
  // #95: { once: true } turns a request for an overlay that is open, or will be once the queue applies, into a no-op
  const onceOpen = (name, opts) => {
    if (opts === undefined) return false;
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) throw new Error('engine: overlay options must be an object');
    if (opts.once !== undefined && typeof opts.once !== 'boolean') throw new Error('engine: overlay once must be a boolean');
    if (!opts.once) return false;
    def(name); return projectedOpen(name);
  };
```

Replace the `overlay:` member of `engine` (line 351) with:

```js
    overlay: (name, a, opts) => {
      if (onceOpen(name, opts)) return engine; // #95: a no-op, never recorded (a replay meets the same open overlay)
      return rec ? recorded(o => o.push('overlay', name, arg(a, 'scene args')), o => reqOverlay(name, o ? live(o[2]) : a)) : reqOverlay(name, a);
    },
```

In `testing/headless.js`, replace `overlay(n, a) { engine.overlay(n, a); return h; },` with:

```js
    overlay(n, a, o) { engine.overlay(n, a, o); return h; }, // #95: o = { once }
```

- [ ] **Step 4: Run** **UNIT** `test/overlay-once.test.mjs test/engine.test.mjs test/replay.test.mjs test/headless.test.mjs`. Expected: PASS.

- [ ] **Step 5: Prove the projected rule by mutation.** In `onceOpen`, replace `projectedOpen(name)` with `isOpen(name)` and run **UNIT** `test/overlay-once.test.mjs`. Expected: tests 2 and 3 fail (test 2 throws `already open`; test 3 sees `enters` = `[{ n: 1 }]`). Restore.

- [ ] **Step 6: Commit.** `git add src/core/engine.js testing/headless.js test/overlay-once.test.mjs && git commit -m "feat(engine): overlay(name, args, { once }) is a no-op when open or pending (#95)"`

---

### Task 3: `engine.scene.overlayArgs(name)` (#105, sim side)

**Files:** modify `src/core/engine.js`; create `test/overlay-args.test.mjs`.

**Interfaces:**
- Produces: `engine.scene.overlayArgs(name) → args | undefined`: the args object an open overlay was entered with. It is the same object as that overlay's `ctx.args` (when recording, the logged copy the scene received). Returns `undefined` when `name` is not an open overlay, including the main scene's name (use `engine.scene.args`). The function is created once; `engine.scene` stays the same object (R-8). It is read-only by convention, like `engine.scene.args`.

- [ ] **Step 1: Write the failing test** `test/overlay-args.test.mjs`:

```js
// #105: the args an overlay opened with are readable from engine.scene (its view half needs them: Tractor's quiet sleep).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';

test('#105: overlayArgs returns the open overlay\'s ctx.args, undefined otherwise', () => {
  let ctxArgs;
  const g = defineGame({ id: 'oa', start: 'm', scenes: { m: {}, sleep: { enter(e, ctx) { ctxArgs = ctx.args; } }, card: {} } });
  const e = createEngine(g, { args: { farm: 1 } });
  e.overlay('sleep', { quiet: true }); e.overlay('card');
  assert.equal(e.scene.overlayArgs('sleep'), ctxArgs);
  assert.deepEqual(e.scene.overlayArgs('sleep'), { quiet: true });
  assert.equal(e.scene.overlayArgs('card'), undefined); // opened without args
  assert.equal(e.scene.overlayArgs('m'), undefined); // the main scene is not an overlay: engine.scene.args
  assert.deepEqual(e.scene.args, { farm: 1 });
  e.close('sleep'); assert.equal(e.scene.overlayArgs('sleep'), undefined);
});

test('#105: overlayArgs is one function on the same scene view across steps; recording gives the logged copy', () => {
  const g = defineGame({ id: 'oa', start: 'm', scenes: { m: {}, sleep: {} } });
  const e = createEngine(g, { record: true }), view = e.scene, f = e.scene.overlayArgs;
  const mine = { quiet: false };
  e.overlay('sleep', mine); e.stepN(3);
  assert.equal(e.scene, view); assert.equal(e.scene.overlayArgs, f);
  assert.deepEqual(e.scene.overlayArgs('sleep'), mine);
  assert.notEqual(e.scene.overlayArgs('sleep'), mine); // the copy the scene received, not the caller's object
});
```

- [ ] **Step 2: Run** **UNIT** `test/overlay-args.test.mjs`. Expected: FAIL with `TypeError: e.scene.overlayArgs is not a function`.

- [ ] **Step 3: Implement** in `src/core/engine.js`, directly after `const stack = []; …` (line 80):

```js
  // #105: the args an open overlay entered with (its ctx.args), for its view half; undefined when it is not an open overlay
  sceneView.overlayArgs = name => { for (let i = 1; i < stack.length; i++) if (stack[i].ctx.name === name) return stack[i].ctx.args; return undefined; };
```

- [ ] **Step 4: Run** **UNIT** `test/overlay-args.test.mjs test/engine.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/core/engine.js test/overlay-args.test.mjs && git commit -m "feat(engine): engine.scene.overlayArgs(name) (#105)"`

---

### Task 4: View halves get their scene's args (#105, view side)

**Files:** modify `src/view/boot.js`; create `test/boot-args.test.mjs`.

**Interfaces:**
- Consumes: `engine.scene.args`, `engine.scene.overlayArgs(name)` (Task 3).
- Produces: a view half's `enter(engine, view, args)`. `args` is the main scene's `engine.scene.args` or the overlay's `engine.scene.overlayArgs(name)`, read when the half enters. A re-entered scene (`go(name, newArgs)`, or an overlay closed and reopened) gets the new args. `exit`, `frame` and `built` are unchanged.

- [ ] **Step 1: Write the failing test** `test/boot-args.test.mjs`:

```js
// #105: view halves receive their scene's args on enter (main scene: engine.scene.args; overlay: overlayArgs(name)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';
const raf = () => 0, caf = () => {};

const setup = () => {
  const got = [], { document } = dom(), target = { document, addEventListener() {} };
  const g = defineGame({ id: 'va', start: 'farm', scenes: { farm: {}, sleep: {} } });
  const half = n => ({ enter: (e, v, a) => got.push([n, a]) });
  const app = boot(g, defineView({ scenes: { farm: half('farm'), sleep: half('sleep') } }), { doc: document, target, raf, caf, flags: parseFlags('?lh-test'), args: { seed: 7 } });
  return { app, got };
};

test('#105: the main scene\'s and an overlay\'s view halves get their args on enter', () => {
  const { app, got } = setup();
  try {
    app.hook.overlay('sleep', { quiet: true });
    assert.deepEqual(got, [['farm', { seed: 7 }], ['sleep', { quiet: true }]]);
  } finally { app.dispose(); }
});

test('#105: a reopened overlay and a re-entered main scene get their new args', () => {
  const { app, got } = setup();
  try {
    app.hook.overlay('sleep', { quiet: true }); app.hook.close('sleep'); app.hook.overlay('sleep', { quiet: false });
    app.hook.go('farm', { seed: 9 });
    assert.deepEqual(got, [['farm', { seed: 7 }], ['sleep', { quiet: true }], ['sleep', { quiet: false }], ['farm', { seed: 9 }]]);
  } finally { app.dispose(); }
});
```

- [ ] **Step 2: Run** **UNIT** `test/boot-args.test.mjs`. Expected: FAIL: every recorded arg is `undefined`.

- [ ] **Step 3: Implement** in `src/view/boot.js`. Replace `entries` (lines 53–58) with:

```js
  const entries = () => {
    const s = engine.scene, out = [];
    if (s.name !== undefined) out.push({ name: s.name, key: s.id, args: s.args });
    for (let i = 0; i < s.overlays.length; i++) out.push({ name: s.overlays[i], key: s.overlayIds[i], args: s.overlayArgs(s.overlays[i]) }); // #105
    return out;
  };
```

Replace the enter line in `reconcile` (line 69) with:

```js
        for (const c of added) caught(() => views[c.name]?.enter?.(engine, view, c.args)); // #105: enter(engine, view, args)
```

- [ ] **Step 4: Run** **UNIT** `test/boot-args.test.mjs test/boot.test.mjs test/uiDom.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/view/boot.js test/boot-args.test.mjs && git commit -m "feat(view): view halves enter(engine, view, args) with their scene's args (#105)"`

---

### Task 5: Headless `untilLoaded` waits for pending commands (#100) **(judgment)**

**Files:** modify `testing/headless.js`; create `test/untilLoaded.test.mjs`.

**Interfaces:**
- Consumes: `engine.commands.pending`, `engine.time.step`, `engine.loading.active`.
- Produces: `h.untilLoaded(opts) → { steps, events }` (same return shape as `until`). When `engine.commands.pending > 0` at the call, it takes at least one step, which delivers those commands ([I-7]: every command queued before delivery starts is delivered at the next step's `input.apply`). Then it steps until `engine.loading.active` is false. With nothing pending, it behaves exactly as before.

**Decision (judgment):** the field note's wording, "keep stepping while `pending > 0`", would never return for a game whose systems issue a command every step, since each step's own commands keep `pending` above 0. The commands that matter are the ones queued before the call, and one step delivers all of them. Test 3 pins this.

- [ ] **Step 1: Write the failing test** `test/untilLoaded.test.mjs`:

```js
// #100: untilLoaded right after a command: the command only queues (I-7), so untilLoaded must step once to deliver it
// before judging engine.loading. It does not wait for commands issued by the steps it takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame } from '../src/index.sim.js';
import { headless } from '../testing/index.js';

const loadGame = () => defineGame({
  id: 'ul', start: 's',
  commands: { tick: () => {} },
  scenes: { s: { enter(e, ctx) {
    ctx.state.builds = 0;
    ctx.command('reload', (en, d, c) => { c.load({ hold: 0.05, build: () => { c.state.builds++; } }); }); // 3 steps at 60 Hz
  } } },
  state: e => ({ builds: e.scene.state.builds ?? 0 }),
});

test('#100: untilLoaded right after a command steps until the load that command starts has finished', () => {
  const h = headless(loadGame());
  h.command('reload');
  const { steps } = h.untilLoaded();
  assert.equal(steps, 3); // step 1 delivers and starts it; the build lands on step 3
  assert.equal(h.state().builds, 1); assert.equal(h.engine.loading.active, false);
});

test('#100: with nothing pending untilLoaded returns at once; a command that starts no load costs one step', () => {
  const h = headless(loadGame());
  assert.equal(h.untilLoaded().steps, 0); assert.equal(h.time.step, 0);
  h.command('tick');
  assert.equal(h.untilLoaded().steps, 1); assert.equal(h.engine.commands.pending, 0);
});

test('#100: commands that the stepped systems issue themselves do not hold untilLoaded', () => {
  const g = defineGame({ id: 'busy', start: 's', commands: { tick: () => {} }, setup(e) { e.system('chatter', en => { en.command('tick'); }); }, scenes: { s: {} } });
  const h = headless(g); h.step(1);
  assert.equal(h.engine.commands.pending, 1); // issued in the step, delivered at the next one
  assert.equal(h.untilLoaded({ maxSteps: 5 }).steps, 1);
});
```

- [ ] **Step 2: Run** **UNIT** `test/untilLoaded.test.mjs`. Expected: FAIL. Test 1 gets `steps` 0 and `builds` 0. Test 2's second `untilLoaded` returns 0. Test 3 returns 0 here; it pins the rule against Step 5's mutation.

- [ ] **Step 3: Implement** in `testing/headless.js`. Replace the `untilLoaded` member with:

```js
    // [S-6]; #100: commands queued before the call are delivered at the next step and may start a load, so take that step
    // first. Only those: commands the stepped systems issue themselves never hold it (they would keep pending > 0 forever).
    untilLoaded(opts = {}) {
      const s0 = engine.commands.pending > 0 ? engine.time.step : -1;
      return h.until(x => x.engine.time.step !== s0 && !x.engine.loading.active, { message: 'untilLoaded', ...opts });
    },
```

- [ ] **Step 4: Run** **UNIT** `test/untilLoaded.test.mjs test/headless.test.mjs test/loading.test.mjs`. Expected: PASS.

- [ ] **Step 5: Prove test 3 by mutation.** Change the predicate to `x => x.engine.commands.pending === 0 && !x.engine.loading.active` and run **UNIT** `test/untilLoaded.test.mjs`. Expected: test 3 fails with `untilLoaded after 5 steps`. Restore.

- [ ] **Step 6: Commit.** `git add testing/headless.js test/untilLoaded.test.mjs && git commit -m "feat(test): headless untilLoaded steps once for commands pending at the call (#100)"`

---

### Task 6: `window.engine.commands` and the Playwright `untilLoaded` (#100)

**Files:** modify `src/view/hook.js` (Contract issue 1), `testing/playwright.js`; create `test/hook-commands.test.mjs`, `test/untilLoaded-driver.test.mjs`, `test/untilLoaded-e2e.test.mjs`.

**Interfaces:**
- Consumes: `engine.commands` (live `{ pending, dropped, handles }`), `engine.overlay(n, a, o)` (Task 2), `engine.scene.overlayArgs` (Task 3).
- Produces:
  - `window.engine.commands`: the live `engine.commands` object (D-4 addition).
  - `window.engine.overlay(name, args, opts)` passes `opts` through.
  - `game.untilLoaded({ maxSteps = 1200, timeout = 30000 }) → steps`: the in-page loop records `s0 = time.step` when `commands.pending > 0` at the first evaluate, and returns only once `time.step !== s0` and no load is active. `s0` survives the hand-backs to Node during blocked settles (#50).

- [ ] **Step 1: Write the failing tests.**

`test/hook-commands.test.mjs`:

```js
// #100, #95 through window.engine: the live commands object (Playwright's untilLoaded reads pending in the page) and
// overlay options.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';
const raf = () => 0, caf = () => {};

test('#100, #95: window.engine exposes commands.pending and passes overlay options through', () => {
  const g = defineGame({ id: 'hc', start: 's', commands: { ping() {} }, scenes: { s: {}, card: {} } });
  const { document } = dom(), target = { document, addEventListener() {} };
  const app = boot(g, defineView({ scenes: {} }), { doc: document, target, raf, caf, flags: parseFlags('?lh-test') });
  try {
    target.engine.command('ping', {}); assert.equal(target.engine.commands.pending, 1);
    target.engine.stepN(1); assert.equal(target.engine.commands.pending, 0);
    target.engine.overlay('card', { n: 1 }); target.engine.overlay('card', { n: 2 }, { once: true });
    assert.deepEqual(app.engine.scene.overlayArgs('card'), { n: 1 });
  } finally { app.dispose(); }
});
```

`test/untilLoaded-driver.test.mjs`:

```js
// #100: the Playwright driver's untilLoaded steps once for commands pending at the call (in-page loop, fake page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameDriver, presets } from 'lion-hawk/playwright';

// a stand-in for window.engine: a command pending now starts a load at the next step, active for `load` more steps
const fakeEngine = ({ pending = 0, load = 0 } = {}) => {
  const e = {
    time: { step: 0 }, loading: { active: false, phase: '', blocks: [] }, commands: { pending }, left: 0,
    scene: { name: 's', overlays: [] }, events: { since: () => [] }, render() {}, state: () => ({ step: e.time.step }),
    stepN() {
      e.time.step++;
      if (e.commands.pending > 0) { e.commands.pending = 0; e.left = load; e.loading.active = load > 0; }
      else if (e.loading.active && --e.left <= 0) e.loading.active = false;
    },
  };
  return e;
};
const driverOn = e => gameDriver({
  page: { evaluate: async (fn, arg) => { globalThis.window = { engine: e }; try { return fn(arg); } finally { delete globalThis.window; } } },
  context: {}, preset: presets.desktop, presetName: 'desktop',
});

test('#100: untilLoaded right after a command waits for the load that command starts', async () => {
  const e = fakeEngine({ pending: 1, load: 3 });
  assert.equal(await driverOn(e).untilLoaded(), 4); // step 1 delivers and starts the load; it ends on step 4
  assert.equal(e.time.step, 4); assert.equal(e.loading.active, false);
});

test('#100: nothing pending returns at once; a command that starts no load costs one step', async () => {
  const idle = fakeEngine();
  assert.equal(await driverOn(idle).untilLoaded(), 0); assert.equal(idle.time.step, 0);
  const tick = fakeEngine({ pending: 1, load: 0 });
  assert.equal(await driverOn(tick).untilLoaded(), 1);
});
```

`test/untilLoaded-e2e.test.mjs` (real Chromium, the loader fixture; its own bundle name, because the full suite runs files concurrently with `load-e2e.test.mjs`):

```js
// #100 in a real page: game.command then game.untilLoaded, with no step between, waits out the load the command starts
// (including its view.wait-held settle, #50).
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
const BUNDLE = 'loader-100.bundle.js';
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}</style><body><script src="${BUNDLE}"></script>`;
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/loader.view.js')], bundle: true, format: 'iife', outfile: path.join(out, BUNDLE), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === `/${BUNDLE}`) res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, BUNDLE)));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('#100: untilLoaded straight after game.command waits for the load the command starts', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', seed: 1 });
  try {
    await game.command('reload');
    const k = await game.untilLoaded({ timeout: 5000 });
    assert.ok(k >= 4, `stepped ${k}`); // 1 to deliver, 3 of hold, then the settle
    const s = await game.state();
    assert.deepEqual({ builds: s.builds, done: s.done, phase: s.phase }, { builds: 1, done: 1, phase: '' });
    assert.equal(await game.page.evaluate(() => window.waits), 1);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
```

- [ ] **Step 2: Run** **UNIT** `test/hook-commands.test.mjs test/untilLoaded-driver.test.mjs`, then **BROWSER** `test/untilLoaded-e2e.test.mjs`. Expected: FAIL. `hook-commands` throws reading `pending` of `undefined`. The driver test gets 0 instead of 4. The e2e test gets `k` 0 and `builds` 0.

- [ ] **Step 3: Implement.**

In `src/view/hook.js`, replace the `overlay:` member with `overlay: (n, a, o) => { engine.overlay(n, a, o); after(); }, // #95: o = { once }` and add, after the `command:` line:

```js
    commands: engine.commands, // #100: the live { pending, dropped, handles }; Playwright's untilLoaded reads pending in the page
```

In `testing/playwright.js`, replace the whole `untilLoaded` const (lines 105–121) with:

```js
  // steps until no load is active, waiting out view.wait blocks; returns the steps taken. #100: commands pending at the call
  // are delivered at the next step and may start a load, so that step is taken first (s0: the step it must leave; -1 none)
  const untilLoaded = async ({ maxSteps = 1200, timeout = 30000 } = {}) => {
    const t0 = Date.now(); let k = 0, s0 = null;
    for (;;) {
      const r = await ev(({ k, maxSteps, stalled, s0 }) => {
        const e = window.engine, blocked = new Function('e', `return ${stalled}`);
        if (s0 === null) s0 = e.commands.pending > 0 ? e.time.step : -1;
        for (; k <= maxSteps; k++) {
          if (!e.loading.active && e.time.step !== s0) { e.render(0); return { k }; }
          if (k < maxSteps) { if (blocked(e)) { e.render(0); return { wait: true, k, s0 }; } e.stepN(1); }
        }
        e.render(0); return { fail: true, k, step: e.state().step, scene: e.scene.name, overlays: [...e.scene.overlays], events: e.events.since(0).slice(-8) };
      }, { k, maxSteps, stalled, s0 });
      if (r.wait) { k = r.k; s0 = r.s0; await unblocked('untilLoaded', t0, timeout); continue; }
      if (r.fail) throw new Error(formatFailure('untilLoaded', r, maxSteps));
      return r.k;
    }
  };
```

- [ ] **Step 4: Run** **UNIT** `test/hook-commands.test.mjs test/untilLoaded-driver.test.mjs test/playwright.test.mjs test/hook.test.mjs test/boot.test.mjs`, then **BROWSER** `test/untilLoaded-e2e.test.mjs`, then **BROWSER** `test/load-e2e.test.mjs`. Expected: PASS. `load-e2e` still passes: its `untilLoaded` follows a `step(1)`, so nothing is pending at the call.

- [ ] **Step 5: Commit.** `git add src/view/hook.js testing/playwright.js test/hook-commands.test.mjs test/untilLoaded-driver.test.mjs test/untilLoaded-e2e.test.mjs && git commit -m "feat(playwright): untilLoaded steps once for pending commands; window.engine.commands (#100)"`

---

### Task 7: `peers()` defaults to `render: 'manual'` (#107)

**Files:** modify `testing/playwright.js`; create `test/peers-render.test.mjs`.

**Interfaces:**
- Produces: `peers(browser, url, n, { …, render = 'manual' })`. Every page opens with `?lh-test=render` unless the caller passes `render: 'auto'`. The other options are unchanged.

- [ ] **Step 1: Write the failing test** `test/peers-render.test.mjs`:

```js
// #107: peers() pages default to render: 'manual' (?lh-test=render): with 'auto' each manual-stepping SwiftShader page
// renders every rAF and the second page starves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { peers } from 'lion-hawk/playwright';

const fakeBrowser = urls => ({
  newContext: async () => ({
    newPage: async () => ({ on() {}, exposeBinding: async () => {}, addInitScript: async () => {}, goto: async u => { urls.push(u); }, evaluate: async () => 60, waitForFunction: async () => {} }),
    addInitScript: async () => {}, close: async () => {},
  }),
});

test('#107: peers() opens every page with ?lh-test=render by default', async () => {
  const urls = [], room = await peers(fakeBrowser(urls), 'http://x/', 2);
  await room.close();
  assert.equal(urls.length, 2);
  for (const u of urls) assert.equal(new URL(u).searchParams.get('lh-test'), 'render');
  assert.deepEqual(urls.map(u => new URL(u).searchParams.get('lh-bridge')), ['host', 'guest']);
});

test('#107: render: "auto" keeps automatic rendering', async () => {
  const urls = [], room = await peers(fakeBrowser(urls), 'http://x/', 1, { render: 'auto' });
  await room.close();
  assert.equal(new URL(urls[0]).searchParams.get('lh-test'), '');
});
```

- [ ] **Step 2: Run** **UNIT** `test/peers-render.test.mjs`. Expected: FAIL. Test 1 reads `''` where it expects `'render'`. Test 2 passes before the change and pins the opt-out.

- [ ] **Step 3: Implement** in `testing/playwright.js`. Change the `peers` signature to:

```js
export async function peers(browser, url, n, { link = {}, preset = 'desktop', seed = 1, args, argsOf, query = {}, timeout = 10000, render = 'manual', ...rest } = {}) {
```

and the open call to:

```js
    p.game = await open(browser, url, { ...rest, render, preset, seed, args: a, query: { ...query, 'lh-bridge': role } }, prepare); // #107: manual by default
```

Update the T-20 comment above `BRIDGE_EVENTS` to say the pages open with `?lh-test=render` unless `render: 'auto'`.

- [ ] **Step 4: Run** **UNIT** `test/peers-render.test.mjs test/playwright.test.mjs`, then **BROWSER** `test/bridge-e2e.test.mjs`. Expected: PASS. The bridge tests step and render through the driver, so manual rendering changes nothing they assert.

- [ ] **Step 5: Commit.** `git add testing/playwright.js test/peers-render.test.mjs && git commit -m "feat(playwright): peers() pages default to render: 'manual' (#107)"`

---

### Task 8: `bindGesture` on the event clock (#109) **(judgment)**

**Files:** modify `src/view/gesture.js`, `test/gesture.test.mjs` (Contract issue 2); create `test/gesture-stamp.test.mjs`.

**Interfaces:**
- Produces: `bindGesture(engine, el, { tap, hold, drag, pinch, tapMove, tapSeconds, filter, doc, now, ignore }) → { update(dt, raw), dispose() }`.
  - A press starts at the down event's `timeStamp`. If the event has no finite `timeStamp`, `now()` is read instead.
  - `hold.fire` runs once, on the first `update` where `now() − t0 ≥ hold.seconds × 1000` and the finger has not gone past `tapMove`.
  - A lift taps when `up.timeStamp − t0 < tapSeconds × 1000`, the finger stayed within `tapMove`, and no hold fired.
  - `now` (new, optional) defaults to `el.ownerDocument.defaultView.performance.now`, the same clock as `event.timeStamp`. Non-functions throw `bindGesture: now must be a function`.
  - `uncapped` is accepted and ignored.
  - Drag, pinch and routing are unchanged.

**Decision (judgment):** the field note asks for "down to up by `timeStamp`". A hold must fire while the finger is still down, so it needs a reading of the same clock in `update`; that is `now()`, injectable for tests. Summed frame time is dropped. Its flaw was that the first update after a down adds the whole previous frame, so at 570 ms frames a 140 ms tap reads as 1.14 s. `uncapped` loses its meaning, because both readings are wall time. Expected outcome: a tap is a tap and a hold is `hold.seconds` of real time at any frame rate. The cost is that a hidden tab no longer pauses a hold, but hiding the tab cancels every finger anyway (`visibilitychange`).

- [ ] **Step 1: Write the failing test** `test/gesture-stamp.test.mjs`:

```js
// #109: bindGesture times presses on the pointer events' clock (event.timeStamp; now() for the hold while the finger is
// down), not on summed frame time, so a tap at ~2 fps (570 ms frames on SwiftShader's iPad preset) stays a tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGesture, createEngine, defineGame } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';

const setup = (o = {}) => {
  const { window, document } = dom(), log = [], clock = { t: 0 };
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const ev = (t, type, id, ts) => { // ts: the event's timeStamp (undefined: none)
    const e = new window.PointerEvent(type, { pointerId: id, clientX: 10, clientY: 10, bubbles: true, cancelable: true, pointerType: 'touch', button: 0 });
    Object.defineProperty(e, 'timeStamp', { value: ts }); t.dispatchEvent(e);
  };
  const g = bindGesture(engine, el, { tap: () => log.push('tap'), hold: { seconds: 1, fire: () => log.push('hold') }, doc: document, now: () => clock.t, ...o });
  const frame = ms => { const raw = (ms - clock.t) / 1000; clock.t = ms; g.update(Math.min(raw, 0.25), raw); }; // a rAF at ms
  return { window, el, ev, g, log, clock, frame };
};

test('#109: at 570 ms frames, a 140 ms tap that lands at a frame\'s end stays a tap, even when its lift is seen late', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 560); // down 10 ms before the frame at 570
  s.frame(570); s.frame(1140); // frame time would count 1.14 s; the event clock says 580 ms
  s.ev(s.window, 'pointerup', 1, 700); // the lift happened at 700 and was dispatched after the frame at 1140
  assert.deepEqual(s.log, ['tap']);
});

test('#109: a real hold at 570 ms frames fires once, on the first frame 1 s past the down', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 0);
  s.frame(570); assert.deepEqual(s.log, []);
  s.frame(1140); assert.deepEqual(s.log, ['hold']);
  s.frame(1710); s.ev(s.window, 'pointerup', 1, 1800);
  assert.deepEqual(s.log, ['hold']); // once, and no tap after it
});

test('#109: a 600 ms press is neither a tap nor a hold', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 0); s.frame(300); s.frame(600); s.ev(s.window, 'pointerup', 1, 600);
  assert.deepEqual(s.log, []);
});

test('#109: uncapped is ignored: capped frame time does not stretch a hold', () => {
  const s = setup({ uncapped: false });
  s.ev(s.el, 'pointerdown', 1, 0); s.frame(570); s.frame(1140);
  assert.deepEqual(s.log, ['hold']);
});

test('#109: an event without a timeStamp starts its press at now(); a non-function now throws', () => {
  const s = setup();
  s.clock.t = 100; s.ev(s.el, 'pointerdown', 1, undefined);
  s.frame(1050); assert.deepEqual(s.log, []);
  s.frame(1100); assert.deepEqual(s.log, ['hold']);
  const { document } = dom(), el = document.createElement('div');
  assert.throws(() => bindGesture(createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } })), el, { doc: document, now: 5 }), /bindGesture: now must be a function/);
});
```

- [ ] **Step 2: Run** **UNIT** `test/gesture-stamp.test.mjs`. Expected: FAIL in tests 1, 4 and 5:
  - test 1 logs `['hold']` (the frame sum reaches 1.14 s);
  - test 4 logs `[]` (capped frame time is 0.25 + 0.25 s);
  - in test 5, `now: 5` does not throw (the old code ignores the option).

  Tests 2 and 3 pass before the change. They pin a real hold and the dead zone between tap and hold.

- [ ] **Step 3: Implement** in `src/view/gesture.js`.

Replace header comment line 4 (`// Time counts only update(dt, raw): …`) with:

```js
// #109: time is the pointer events' own clock, not summed frame time: a hold fires on the first update(dt, raw) at least
// hold.seconds after the down's event.timeStamp (now(), default performance.now, is the same clock), and a lift is a tap when
// up.timeStamp - down.timeStamp < tapSeconds. A stuttering frame (X-4) can delay a lift's dispatch but no longer adds the
// frame time before the down to the press. `uncapped` (#56) is accepted and ignored: both readings are wall time now.
```

Replace the signature line with:

```js
export function bindGesture(engine, el, { tap, hold, drag, pinch, tapMove = 12, tapSeconds = 0.45, filter = { button: [0] }, doc, now, ignore = 'button, input, [data-lh-ui] *, [data-lh-hold], [data-lh-hold] *' } = {}) {
```

After `doc = doc ?? el.ownerDocument; const win = doc.defaultView ?? globalThis.window;` add:

```js
  if (now !== undefined && typeof now !== 'function') throw new Error('bindGesture: now must be a function');
  const clock = now ?? (() => (win?.performance ?? globalThis.performance).now()); // the clock of event.timeStamp (ms)
  const stamp = e => (Number.isFinite(e?.timeStamp) ? e.timeStamp : clock()); // #109: when the finger moved, not when the page saw it
```

In `one`'s initialiser and in `onDown`'s `Object.assign`, replace `held: 0` with `t0: 0` and `t0: stamp(e)` respectively:

```js
  const one = { id: 0, kind: '', sx: 0, sy: 0, lx: 0, ly: 0, t0: 0, far: false, fired: false, dragging: false };
```

```js
      mode = 'one'; Object.assign(one, { id: e.pointerId, kind: e.pointerType, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: stamp(e), far: false, fired: false, dragging: false });
```

In `lift`, replace the tap line with:

```js
      else if (up && tap && !one.far && !one.fired && stamp(e) - one.t0 < tapSeconds * 1000) tap(info(f, id, one.kind));
```

In `update`, replace the two lines `one.held += uncapped ? raw : dt;` and the hold check with:

```js
        if (hold && !one.far && !one.fired && clock() - one.t0 >= hold.seconds * 1000) { one.fired = true; hold.fire(info(f, one.id, one.kind)); }
```

- [ ] **Step 4: Move the existing gesture tests onto a clock** (`test/gesture.test.mjs`, Contract issue 2). Their holds were driven by `update` sums that the event clock no longer reads.

Replace `setup` (lines 5–12) with:

```js
const setup = (o = {}) => {
  const { window, document } = dom(), log = [], clock = { t: 0 }; // #109: the gesture's clock; every event carries clock.t as its timeStamp
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const ev = (t, type, id, x = 0, y = 0, extra = {}) => {
    const e = new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0, ...extra });
    Object.defineProperty(e, 'timeStamp', { value: clock.t }); return t.dispatchEvent(e);
  };
  const g = bindGesture(engine, el, { tap: () => log.push('tap'), hold: { seconds: 1, fire: () => log.push('hold') }, drag: d => log.push(`drag:${d.phase}`),
    pinch: p => log.push(`pinch:${p.phase}:${p.scale.toFixed(2)}`), doc: document, now: () => clock.t, ...o });
  return { window, document, el, ev, g, log, clock };
};
```

Replace the first test with:

```js
test('2f: bindGesture: a quick tap; a still finger held 1 s on the event clock fires once and is no tap (#59, #109)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.g.update(0.016, 0.016); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log, ['tap']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 2, 10, 10); for (let i = 0; i < 4; i++) { s.clock.t += 300; s.g.update(0.1, 0.3); } // 1.2 s since the down
  s.ev(s.window, 'pointerup', 2, 10, 10); assert.deepEqual(s.log, ['hold']);
});
```

In the third test, replace its first two lines (the `uncapped: false` press and its assertion) with:

```js
  s.ev(s.el, 'pointerdown', 1, 10, 10); for (let i = 0; i < 5; i++) { s.clock.t += 100; s.g.update(0.1, 0.3); } s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log, []); // 0.5 s down to up: no hold (1 s) and too slow for a tap (0.45 s); uncapped: false changes nothing (#109)
```

- [ ] **Step 5: Run** **UNIT** `test/gesture-stamp.test.mjs test/gesture.test.mjs test/pointer.test.mjs test/touch.test.mjs test/domAsserts.test.mjs`, then **BROWSER** `test/touch-e2e.test.mjs` and **BROWSER** `test/hold-e2e.test.mjs`. Expected: PASS.

- [ ] **Step 6: Prove test 1 by mutation.** In `update`, temporarily restore the frame sum: add `one.t0 -= raw * 1000;` before the hold check. Run **UNIT** `test/gesture-stamp.test.mjs`. Expected: test 1 logs `['hold']` and fails. Restore.

- [ ] **Step 7: Commit.** `git add src/view/gesture.js test/gesture.test.mjs test/gesture-stamp.test.mjs && git commit -m "fix(view): bindGesture times holds and taps on the event clock (#109)"` In the body, say that `uncapped` is now ignored and that two `gesture.test.mjs` timings moved onto an injected clock.

---

### Task 9: domAsserts guard gaps and `setup2` (G-E2 parked minors)

**Files:** create `test/helpers/domScan.mjs`, `test/domAsserts-scan.test.mjs`; modify `test/domAsserts.test.mjs`, `test/uiDom.test.mjs` (Contract issue 3).

**Interfaces:**
- Produces (test helper only):
  - `EQUALITY` (RegExp), which matches `assert.` followed by `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `notDeepEqual`, `deepStrictEqual` or `notDeepStrictEqual`, then `(`;
  - `NODE` (RegExp, unchanged);
  - `callArgs(src, at) → string[]` (the first two top-level arguments; string and template literals skipped whole);
  - `nodeEqualities(src, file) → ['file:line', …]`.

- [ ] **Step 1: Write the failing test** `test/domAsserts-scan.test.mjs`. It must not contain the text `helpers/` + `dom.mjs`, or the guard would scan its fixture strings.

```js
// G-E2 parked minors: the domAsserts guard (#103) missed notDeepEqual/notStrictEqual/notDeepStrictEqual, and its
// argument splitter ignored quoting. The plain-variable limit is documented, and pinned here so it stays deliberate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeEqualities, callArgs } from './helpers/domScan.mjs';

test('G-E2: the guard sees every assert equality form', () => {
  for (const m of ['equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual'])
    assert.deepEqual(nodeEqualities(`x;\nassert.${m}(el.firstChild, b);`, 'f'), ['f:2'], m);
});

test('G-E2: brackets and commas inside string literals neither end nor split an argument', () => {
  assert.deepEqual(callArgs("assert.equal(f(')'), el.firstChild);", 12), ["f(')')", 'el.firstChild']);
  assert.deepEqual(callArgs('assert.equal(g("a,b"), el.firstChild);', 12), ['g("a,b")', 'el.firstChild']);
  assert.deepEqual(callArgs('assert.equal(h(`x)${1}`), el.firstChild);', 12), ['h(`x)${1}`)', 'el.firstChild']);
  assert.deepEqual(nodeEqualities("assert.equal(f(')'), el.firstChild);", 'f'), ['f:1']);
});

test('G-E2: the documented limit: a node in a plain variable is not seen; plain values pass', () => {
  assert.deepEqual(nodeEqualities("const b = q(d, 'x');\nassert.equal(b, c);", 'f'), []);
  assert.deepEqual(nodeEqualities("assert.equal(el.textContent, 'x');", 'f'), []);
});
```

- [ ] **Step 2: Run** **UNIT** `test/domAsserts-scan.test.mjs`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./helpers/domScan.mjs`.

- [ ] **Step 3: Implement** `test/helpers/domScan.mjs`:

```js
// The domAsserts guard's scanner (#103, G-E2): finds assert equality calls whose first two arguments look like DOM node
// expressions, so a failing diff can never inspect a whole happy-dom window. It is a heuristic with known limits:
// - a node held in a plain variable (`const b = q(d, 'x'); assert.equal(b, c)`) is not seen: compare nodes with same();
// - string and template literals are skipped whole, so an expression inside a template's ${…} is not scanned;
// - only the first two arguments are checked (the message argument never holds a node).
export const EQUALITY = /assert\.(?:notDeepStrictEqual|notDeepEqual|notStrictEqual|notEqual|deepStrictEqual|deepEqual|strictEqual|equal)\(/g;
export const NODE = /(?:\bq|querySelector|closest|getElementById)\([^()]*\)$|children\[[^\]]*\]$|(?:activeElement|parentNode|parentElement|firstChild|firstElementChild)$/;
// the index of the quote that closes the string or template literal opened at src[i] (escapes honoured)
const skipString = (src, i) => {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === quote) return j; }
  return src.length;
};
// the first two top-level arguments of the call whose '(' is at src[at]
export function callArgs(src, at) {
  const out = []; let depth = 0, start = at + 1;
  for (let i = at + 1; i < src.length && out.length < 2; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth-- === 0) { out.push(src.slice(start, i)); break; } }
    else if (ch === ',' && depth === 0) { out.push(src.slice(start, i)); start = i + 1; }
  }
  return out.map(s => s.trim());
}
// 'file:line' for every equality call in src with a node-like argument
export function nodeEqualities(src, file = '') {
  const bad = [];
  for (const m of src.matchAll(EQUALITY)) {
    const at = m.index + m[0].length - 1;
    if (callArgs(src, at).some(a => NODE.test(a))) bad.push(`${file}:${src.slice(0, at).split('\n').length}`);
  }
  return bad;
}
```

Replace `test/domAsserts.test.mjs` with:

```js
// Guard (G-E2): a failing assert.equal/deepEqual on a DOM node diffs inspect() of a whole window, which needs memory
// quadratic in its line count (16 GB in 10 s). Tests that use the happy-dom helper compare nodes with same() instead.
// The scanner (helpers/domScan.mjs) is a heuristic; its header lists what it cannot see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { nodeEqualities } from './helpers/domScan.mjs';

const dir = new URL('./', import.meta.url);
test('no DOM node reaches an assert equality diff in the DOM tests', () => {
  const bad = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8'); if (!src.includes('helpers/dom.mjs')) continue;
    bad.push(...nodeEqualities(src, f));
  }
  assert.ok(bad.length === 0, `compare DOM nodes with same() from helpers/dom.mjs: ${bad.join(', ')}`);
});
```

In `test/uiDom.test.mjs`, delete the last line (`function setup2(g) { … }`, line 202) and insert the same line, unchanged, directly after `setup`'s closing `};` (after line 10).

- [ ] **Step 4: Run** **UNIT** `test/domAsserts-scan.test.mjs test/domAsserts.test.mjs test/uiDom.test.mjs`. Expected: PASS. If the widened guard now flags an existing file, fix that call with `same()` (no other change) and list it in the commit body.

- [ ] **Step 5: Prove by mutation.** (a) Put the old pattern back in `EQUALITY`, `/assert\.(?:not)?(?:strict|deep|deepStrict)?(?:Equal|equal)\(/g`. Run the scan test. Expected: test 1 fails for `notStrictEqual`, `notDeepEqual` and `notDeepStrictEqual`. (b) Delete the string-skip line in `callArgs`. Expected: test 2 fails. Restore both.

- [ ] **Step 6: Commit.** `git add test/helpers/domScan.mjs test/domAsserts-scan.test.mjs test/domAsserts.test.mjs test/uiDom.test.mjs && git commit -m "test: domAsserts guard sees every equality form and skips quoted text; setup2 beside setup (G-E2)"`

---

### Task 10: Spec write-up: D1–D9 and the 3a amendments (integrator; gated on the user's approval)

**Executed by the integrator** on `phase-3` at the 3a merge (overview §2: "the integrator writes them into `spec.md` in 3a once the user approves"). `docs/spec.md` is integrator-only (Global Constraint 9), so the 3a implementer does not run this task. If the user has not yet approved D1–D9 (overview §9.1), the integrator writes only part B and leaves part A for the approval. The exact text is below, so the integrator does not have to re-derive it.

**Files:** `docs/spec.md`.

- [ ] **Step 1: Header.** Under `Version 0.1 (2026-10-11). Status: draft for review.`, add the line: `Amended 2026-10-13: phase 3 deltas D1–D9 (docs/plans/2026-10-13-phase-3-overview.md §2) and the 0.7.3 carry-overs.`

- [ ] **Step 2: Part A, deltas D1–D9** (each change marks its delta in brackets):
  - **[L-3]** Append: "The engine never imports Rapier: the game passes its initialised module, `defineGame({ physics: { rapier } })`. Engine **view** modules import `three` and `three/addons/*` directly, and game builds go through `lion-hawk build` (dedupe, [G-2]). Sim modules import neither (D9)."
  - **[G-2]**, third bullet. Replace "engine source imports neither three nor Rapier" with "engine sim source imports neither three nor Rapier, and engine view source imports three directly (D9)".
  - **[E-9]**. Replace the bullet with: "`e.id` is unique within a World: a counter from 1 in spawn order, reset by `world.clear()`. A replicated entity also carries `e.netId` in its kind's `idMin..idMax` (§4.3) (D7)."
  - **[M-3]**. Append: "A material may carry a free-form `game: {...}` block. It is not validated and is copied through `extends` (D6)."
  - **[M-6]**. Replace with: "Mass and centre of mass come from the colliders' geometry and density. A game sets mass only through `phys.fill`; through `body: { mass }`, which scales every collider's density so that the body weighs `mass` (centre of mass and inertia stay geometric); or through `body: { massProps: { mass, com, inertia } }`, which is explicit and marked `// lh-allow` in game code (D3)."
  - **[M-7]**. Append: "Pair `friction` and `restitution` overrides apply only where the engine computes a contact itself: vehicle-kit wheels, and `materials.pair()` reads in kits and games. Rapier contacts use only the combine rules of [M-9] (D4: Rapier JS has `filterContactPair` but no solver-contact modification hook)."
  - **[M-9]**. Append: "Each engine collider gets friction `√f` with `CoefficientCombineRule.Multiply` (so a contact gets the geometric mean) and restitution with `Max`."
  - **[M-11]**. Replace with: "`look` compiles to one base material per shading tier. The game sets `shading: 'physical' | 'standard' | 'lambert'` (default `physical`), which gives `MeshPhysicalMaterial`, `MeshStandardMaterial` or `MeshLambertMaterial`. Optional features are compile-time defines (`COVERAGE`, `FUR`, `SUBSURFACE`), which keeps the number of shader programs small. Lambert and standard honour `COVERAGE` and `FUR`. `SUBSURFACE` is physical and standard only. Physical-only `look` fields are ignored below `physical`. Vertex colours, when a mesh has them, replace `look.color` (D5)."
  - **[N-8]**. After "`F.body()`: …", add the sentence: "A replicated entity's kind range applies to `e.netId`, not `e.id` (D7)."
  - **[N-12]**. After the table, add: "`proxy` and `view` remotes take `follow: 'interp' | 'forecast'` (default `interp`). `forecast` draws the remote at its forecast pose instead of about 100 ms in the past (D8)."
  - **[A-1]**. Replace with: "Input is `assets/models/*.glb`. Output goes to the game's `baked/` directory, which is committed: optimised GLBs in `baked/models/`, optional `<model>.anim.json` tables beside them, one `baked/phys.json` holding every model's sidecar keyed by model id (the sim imports it as JSON), and `baked/manifest.json` (D1, D2)."
  - **[A-5]**. Append: "All of a game's sidecars live in `baked/phys.json`, `{ v, engine, materials: <registry hash>, models: { <id>: sidecar } }` (D2)."
  - **[A-6]**, first bullet. Replace with: "Nodes named `col-box`, `col-sphere`, `col-capsule`, `col-cylinder`, `col-hull` or `col-mesh` are colliders. They are hidden at runtime and take the material of their nearest ancestor part (its largest-area material); a node's `extras.material` overrides it (D2)."
  - **[B-3]**. Replace with: "**Single mode** (the default) produces one HTML file plus `assets/models/*.glb` and `*.anim.json` beside it. The service worker precaches all of them. Sidecars and code stay inside the page (D1)."

- [ ] **Step 3: Part B, the 3a amendments (0.7.3):**
  - **[S-1]**, view half. Replace `{ enter(engine, view), exit(engine, view), frame(engine, alpha, view) }` with `{ enter(engine, view, args), exit(engine, view), frame(engine, alpha, view) }`, and add: "`args` is the scene's args: `engine.scene.args` for the main scene, `engine.scene.overlayArgs(name)` for an overlay, read when the half enters. Treat it as read-only (#105)."
  - **[S-2]**. Replace with: "`engine.go(name, args)` replaces the main scene. `engine.overlay(name, args, { once })` stacks a scene on top, and `engine.close(name)` removes it. With `once: true`, the request is a no-op when the overlay is open or will be once the queued transitions apply (`isOpen(name, { pending: true })`), and a no-op is never recorded (#95). `engine.scene.overlayArgs(name)` returns the args an open overlay entered with (its `ctx.args`), or `undefined` (#105). An overlay may set `pauses: true` to freeze the sim below it while it is still drawn."
  - **[I-2]**, Gestures. Replace "`hold.fire(e)` once per press after `hold.seconds` of `raw` (or `dt`) time within `tapMove` px" with: "`hold.fire(e)` once per press, on the first `update` at least `hold.seconds` after the down event's `timeStamp` (read on `now()`, default `performance.now`, the same clock), within `tapMove` px. A lift taps when `up.timeStamp − down.timeStamp < tapSeconds`. Summed frame time is not used, so a tap stays a tap at any frame rate (#109); `uncapped` is accepted and ignored, and `now` is injectable for tests". Remove `uncapped = true` from the signature and add `now`.
  - **[T-5]**. Replace the `h.untilLoaded(opts)` bullet with: "`h.untilLoaded(opts)` steps until `engine.loading.active` is false. When commands are pending at the call, it first takes the step that delivers them, since one of them may start a load (#100). Commands that the stepped systems issue do not hold it."
  - **[T-9]**. Append: "Every engine calls the game's `reset()` first ([G-1] contract), so module tunables are back at their shipped values before a replay (#108)."
  - **[T-17]**. In the stepping bullet, replace "`untilLoaded` steps until `engine.loading.active` is false." with "`untilLoaded` steps until `engine.loading.active` is false, first taking the step that delivers commands pending at the call (#100)."
  - **[T-20]**. In the signature, add `render = 'manual'`, and add: "Pages open with `?lh-test=render` unless `render: 'auto'` is passed, because a manual-stepping SwiftShader page that renders every rAF starves the others (#107)."
  - **[D-4]**, commands and loading. Replace with: "`command(type, data)`, `commands` (the live `engine.commands`: `pending`, `dropped`, `handles`), `loading` (the live `engine.loading`)". In scenes, write `overlay(name, args, opts)`.
  - **§8.2**, game contract. Add a `reset() { … },` line after `debug:` in the code block, and below it: "**[G-1a]** `reset()` (optional, no arguments) restores the game's module-level tunables. `createEngine` calls it before anything else, so every headless handle, replay, `mp()` peer and browser boot starts from the shipped values. Two engines in one process still share module state: a later engine's reset also resets an earlier one's tunables (#108)."

- [ ] **Step 4: Commit** (integrator): `git add docs/spec.md && git commit -m "docs(spec): phase 3 deltas D1–D9 and the 0.7.3 carry-overs"` (part B alone: `"docs(spec): 0.7.3 carry-overs"`).

---

### Task 11: Verification and notes

**Files:** create `docs/plans/2026-10-13-phase-3a-carryovers-notes.md`.

- [ ] **Step 1: Run** **SUITE**. Expected: all pass, with the baseline count from Task 0 + 28 new tests (387 + 28 = 415 at the 2g baseline).

- [ ] **Step 2: Purity.** **UNIT** `test/purity.test.mjs`. Expected: PASS (`engine.js` reads no clock; the gesture clock is view-only).

- [ ] **Step 3: Write the notes file** `docs/plans/2026-10-13-phase-3a-carryovers-notes.md` with these sections:
  - **Status**: the branch head, the commits per task, and the suite count before and after.
  - **Rulings**: the two (judgment) decisions (Task 5: pending at the call; Task 8: event clock, `uncapped` ignored), and every contract issue below with its outcome.
  - **For the game plans**: Tractor (3l) can now drop its extra `step(1)` before `untilLoaded`, `flow.open`'s guard, the sleep half's event scan (`enter(engine, view, args)`), the tune `afterEach` resets (`reset()`), and `render: 'manual'` in its `peers()` call. Pig Pens (3k): `bindGesture`'s `uncapped` is ignored now.
  - **Field note candidates** (the integrator numbers them from #110):
    1. "`bindGesture` reads the event clock (#109 outcome): holds are real time at any frame rate; the frame-sum overcounted the frame before the down. A hidden tab cancels fingers, so nothing pauses a hold."
    2. "`untilLoaded` waits for commands pending at the call, not while any are pending (#100 outcome): a game whose systems issue commands every step would otherwise never settle."
    3. "`reset()` runs in every `createEngine`; in `mp()` a later peer's engine resets tunables an earlier peer's run changed (#108 outcome). Tunables are still not on the tape."
    4. "After a fallback swap (an adopted `data-lh-slot` element leaves the document and the engine re-adopts or creates a control), focus that was on the old element is not moved to the new one (G-E2 parked minor; no code change in 0.7.3)."
  - **Measured**: the suite runtime and the peak memory if `systemd-run` reports it.

- [ ] **Step 4: Commit.** `git add docs/plans/2026-10-13-phase-3a-carryovers-notes.md && git commit -m "docs: phase 3a carry-overs notes"`

---

## Done when

- **SUITE** passes in the worktree: the baseline plus 28 new tests (by file: reset 3, overlay-once 4, overlay-args 2, boot-args 2, untilLoaded 3, hook-commands 1, untilLoaded-driver 2, untilLoaded-e2e 1, peers-render 2, gesture-stamp 5, domAsserts-scan 3). `gesture.test.mjs`, `domAsserts.test.mjs` and `uiDom.test.mjs` keep their counts.
- `test/load-e2e.test.mjs`, `test/bridge-e2e.test.mjs`, `test/touch-e2e.test.mjs` and `test/hold-e2e.test.mjs` pass unchanged.
- The mutation steps in Tasks 1, 2, 5, 8 and 9 were run and the results noted.
- The integrator has merged `phase-3-carryovers` into `phase-3` (`--no-ff`) as **0.7.3**, written Task 10 (part B at least), and then run the games workspace suite against `phase-3` (`cd /home/smiller/projects/four43/four43-lion-hawk/games && env -u CI` under the unit caps of Global Constraint 5, `npm test`). Expected green. Tractor's `flow.test.mjs` calls `untilLoaded` after `step(1)`, so its behaviour is unchanged. Any red goes back to this plan's controller before Wave A forks.
- Notes file written.

## Notes stub

`docs/plans/2026-10-13-phase-3a-carryovers-notes.md`, with a **"Field note candidates"** section (Task 11, Step 3).

---

## Contract issues

1. **`src/view/hook.js` is not in 3a's "Owns" column.** #100's Playwright `untilLoaded` runs in the page and can only read `window.engine`, which has no `commands`. #95's `once` must also pass through `window.engine.overlay`. Decision: Task 6 edits two lines of `hook.js` (`commands: engine.commands`, `overlay(n, a, o)`). 3a runs alone, so nothing conflicts. Spec D-4 gains `commands` (Task 10).
2. **`test/gesture.test.mjs` is not owned, and §4 lists no `now` option for `bindGesture`.** The event clock (#109) means the existing tests' `update`-driven holds no longer fire. Decision: Task 8 adds an optional `now` (needed to test the hold) and moves two timings in that file onto an injected clock, with no assertion weakened. `uncapped` is accepted and ignored.
3. **`test/uiDom.test.mjs` is not owned.** The G-E2 minor "move `setup2` up beside `setup`" lives there. Decision: Task 9 moves one line verbatim. If the controller prefers, drop that step; nothing depends on it.
4. **`reset()` signature.** §4.1 shows `reset()` without arguments and "called first in createEngine", before the engine exists. Decision: no arguments. In `mp()`, every peer's `createEngine` resets shared module state (documented; tunables stay off the tape, as #108's workaround noted).
5. **#100 semantics.** The field note's "keep stepping while `pending > 0`" can never finish when systems issue commands every step. Decision: `untilLoaded` takes the step that delivers the commands pending at the call (Task 5, test 3).
6. **The spec write-up.** Overview §2 assigns D1–D9 to "the integrator … in 3a", but `docs/spec.md` is integrator-only. Decision: Task 10 holds the exact text for the integrator to apply at the 3a merge, part A gated on the user's approval (§9.1).

## Integrator requests

1. At the merge: bump `package.json` and `src/version.js` to **0.7.3**. Add the new dependencies from overview §3.2 (`@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` ^4.5, `meshoptimizer`, all as `dependencies`) with the lockfile.
2. `CHANGELOG.md`, `## 0.7.3 — <date>`, "Phase 3a: engine carry-overs.":
   - `engine.overlay(name, args, { once })` (#95);
   - `engine.scene.overlayArgs(name)` and view halves' `enter(engine, view, args)` (#105);
   - `defineGame({ reset })`, called first in every `createEngine` (#108);
   - `bindGesture` times holds and taps on the event clock, with an injectable `now`; `uncapped` is ignored (#109);
   - headless and Playwright `untilLoaded` take the step that delivers commands pending at the call (#100);
   - `window.engine.commands`;
   - `peers()` defaults to `render: 'manual'` (#107);
   - the domAsserts guard sees every equality form and skips quoted text (G-E2).
3. Apply Task 10 to `docs/spec.md`: part B at the merge, and part A once the user approves D1–D9.
4. `docs/field-notes.md`:
   - set #95, #100, #105, #107, #108 and #109 to **done (0.7.3)**, each with a one-line outcome (from the notes file's "Rulings");
   - number the notes file's field note candidates from #110.
5. After the merge, run the games workspace suite (Done when) before cutting the Wave A branches.

## Needs the user

- Approval of deltas D1–D9 (overview §9.1) before Task 10 part A goes into the spec. Nothing else in 3a waits on it.
