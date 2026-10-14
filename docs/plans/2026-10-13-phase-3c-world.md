# Phase 3c: World, entities and the Rapier wrapper: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks marked **(judgment)** need design care beyond the written interfaces; the expected decision is stated in the task. Anything that does not fit goes to the controller as a contract issue, never improvised across task boundaries.

**Precondition:** 3a (`2026-10-13-phase-3a-carryovers.md`) is merged into `phase-3` (engine 0.7.3). Branch `phase-3-world` is cut from `phase-3` after that merge, in the worktree `~/projects/four43/lion-hawk-engine-3c`. 3b (materials) and 3d (bake) run alongside: until 3b merges, 3c builds against 3b's registry contract (overview §4.2) through a local fixture registry in `test/fixtures/phys/`. Task 17 is the only task that needs 3b on `phase-3`.

**Goal:**
- A scene-owned `World` (E-1…E-11, S-3): plain-object entities, live cached queries, deterministic ids and pool slots, the prev/curr transform pool, `place`, sockets, joints, despawn and clear that free every Rapier object.
- A Rapier wrapper (M-4, M-5, M-6, M-9, #1, #2, #106): the game injects its initialised module (D9); every 0.21 integration parameter is pinned; colliders come from sidecars or inline entries with registry materials and the √f/Multiply, Max combine rules (D4); mass from density, `body.mass` scaling and `massProps` (D3); named groups; a row-major heightfield; sleep-on-insert that survives Rapier 0.21; contact and sensor events; a timing hook.
- The engine seam: World creation around main scenes, `ctx.world`/`engine.world`, the four `lh.*` systems, `engine.builtin` for 3i, the `world` digest in `state()`.
- Headless and checks (T-1, T-5, T-10, T-12, T-13, T-14): `h.world`, `h.find`/`one`/`get`/`spawn`/`despawn`/`place`, an always-on finite check over the pool and body velocities, `checks.determinism`, `checks.simPurity`, `checks.zeroAlloc`, `checks.materials`.

**Architecture:**
- **World = lists in id order + a pool + an optional Rapier world.** `world.js` keeps `list` (every live entity), `bodied` (dynamic and kinematic bodies), `slots` (live pool slots) and one array per query, all in id order. Ids count from 1 per World (D7), pool slots go lowest-free-first, Rapier objects are created inside `spawn` in spawn order. Nothing that decides a sim result iterates a `Map` or `Set`. Per-entity World state lives on a non-enumerable symbol property (`INTERNAL`), so `Object.keys`, `canonical()` and JSON never see it.
- **One step, in this order** (overview §4.4):
  1. `lh.world.swap` (stage `input.apply`, first): copy curr → prev for every live slot;
  2. `lh.ui`, `lh.input`, `lh.commands`, game input systems; `pre` (`lh.scene` and game systems); kit systems in `physics.world` with `before: ['lh.physics.step']`;
  3. `lh.physics.step`: `rapierWorld.step(eventQueue)`, timed when a timer was injected;
  4. `lh.physics.read`: curr ← Rapier for every dynamic and kinematic body that is awake **or was awake last step** (so the pose of the step a body falls asleep is not lost), then the #2 re-sleep of bodies spawned asleep;
  5. `lh.physics.events`: contact-force events → `contact`, then collision events on sensors → `sensor`, in Rapier's drain order;
  6. game systems in `physics.world` with no ordering, then `post`, then `events.flush`.
- **`place` writes prev and curr** (no smear), wakes the body, zeroes velocities unless `keep`, sets kinematic next poses and propagates fixed bodies to their colliders at once.
- **Physics files never import Rapier.** `physics/rapier.js` creates worlds from the injected module; `colliders.js`, `groups.js`, `heightfield.js` and `events.js` are pure helpers over it; only tests and fixtures `import '@dimforge/rapier3d-compat'`.
- **Engine seam is small:** `engine.js` imports `installWorld`/`checkPhysics` from `src/sim/world/install.js`, opens a World before a main scene's `enter`, closes it after its `exit`, exposes `ctx.world`, `engine.world`, `engine.builtin`, and adds `world: digest` to `state()` only while the World has entities, so un-migrated goldens are unchanged.

**Tech Stack:** plain ES modules, `@dimforge/rapier3d-compat` 0.21.0 (dev and peer dependency; injected, never imported by `src/`), `node:test`, Node 26.

**Spec:** `docs/spec.md` (§2 E-1…E-13, §3.3 M-4…M-6, §3.4 M-9, §5.2 S-3, §7.4 T-1, T-5, T-10, T-12…T-14) plus `docs/plans/2026-10-13-phase-3-overview.md` (§2 D3, D4, D7, D9; §4.1, §4.2 consumed, §4.3 consumed, §4.4, §4.5 produced).

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

**Plan constraints (3c):**
- **P1.** Nothing under `src/` imports Rapier. Tests and `test/fixtures/phys/*` may (`test/fixtures/phys/rapier.js` is the one place that calls `R.init()`).
- **P2.** No existing test file changes, except `test/engine.test.mjs` line 232 under Integrator request 1 (Task 11).
- **P3.** `src/core/engine.js` changes are exactly Task 11's edits. 3a edits the same file first; Task 11 locates its edits by anchor text, not line numbers, and keeps every 3a change.
- **P4.** No sim result may depend on `Map`/`Set` iteration order. Lists that systems iterate are arrays in id order.
- **P5.** Until Task 17, nothing imports `src/defs/materials.js`; the World reads the registry only through `has`, `collider` (and `hash` in `checks.materials`), so 3b's real registry drops in.
- **P6.** A test that makes more than a handful of Rapier worlds frees them (`ph.free()`, `world.dispose()`, `rawWorld.free()`): Rapier's WASM memory is not garbage collected.
- **P7.** Version, CHANGELOG and spec text are the integrator's; 3c's merge is part of the Wave A 0.8.0 bump.

## Review Focus

The five failure modes most likely to bite, each pinned by a named test:

1. **Stale pose after pool growth or slot reuse.** `e.xf` accessors must read through the pool's *current* buffer after it doubles, and a despawned entity must not keep reading the slot a newer entity now owns. Pinned by `world-pool.test.mjs` "xf accessors read and write curr through growth" (Task 5, with a mutation step) and `world-entities.test.mjs` "despawn keeps a frozen last pose; the next spawn reuses the lowest slot" (Task 9).
2. **Step order and smear.** prev must be last step's curr when game systems run; `place` must write both slots; the step a body falls asleep must still be read. Pinned by `world-engine.test.mjs` "pre systems see prev == curr; physics then moves curr" (Task 11), `world-place.test.mjs` "place writes prev and curr" (Task 6) and `world-step.test.mjs` "the step a body falls asleep is read" (Task 10).
3. **Determinism of ids, slots, Rapier order and clear().** Two runs agree step for step, a run that leaks module state between runs is caught at the exact step, and a recorded tape that clears and rebuilds the World replays. Pinned by `checks-determinism.test.mjs` (Task 13) and `world-replay.test.mjs` (Task 16).
4. **Combine rules and mass.** √f with Multiply gives the geometric mean (two blocks sliding), restitution takes the max, `body.mass` lands to 0.1 %, `massProps` is exact, zero density on a dynamic body throws. Pinned by `physics-colliders.test.mjs` "a slick block on grip decelerates at the geometric mean" (Task 8) and `world-bodies.test.mjs` "body.mass scales densities" (Task 9).
5. **Rapier 0.21 quirks.** The heightfield is column-major with subdivision counts (a ball rests at the analytic height, not the swapped one); a body inserted asleep wakes on its first step unless the World re-sleeps it (#2); a Rapier bump that moves a default fails `PINNED_DEFAULTS` (#1). Pinned by `physics-heightfield.test.mjs` (Task 4), `world-step.test.mjs` "a post spawned asleep on the ground stays asleep" (Task 10) and `physics-rapier.test.mjs` (Task 2).

## File Structure

All paths are in the engine worktree `~/projects/four43/lion-hawk-engine-3c`.

| File | Change | Responsibility |
|---|---|---|
| `src/sim/physics/rapier.js` | create (T2) | `PINNED_DEFAULTS`, `mergeParams`, `checkRapier`, `createPhysics` (world creation, timestep, params, event queue, timed step, free, recreate) |
| `src/sim/physics/groups.js` | create (T3) | `createGroups(names)` → `{ <name>: bit, mask(member, filter) }` |
| `src/sim/physics/heightfield.js` | create (T4) | `heightfieldDesc(R, field)`: row-major heights → Rapier's column-major heightfield |
| `src/sim/world/pool.js` | create (T5) | `createPool`, `makeXf`, `deadXf`, `STRIDE`/`PREV`/`CURR`, the `INTERNAL` symbol and body kinds |
| `src/sim/world/place.js` | create (T6) | `createPlacer(pool, rapier, world)` → `{ place, socket, xfPrev }` |
| `src/sim/physics/events.js` | create (T7) | `createEventDrain({ emit, hz, entityOf, materialOf })` → `drain(rapierWorld, queue)` |
| `src/sim/physics/colliders.js` | create (T8) | `shapeDesc`, `materialFor`, `applyMaterial` |
| `src/sim/world/world.js` | create (T9), extend (T10, T17) | `createWorld`: lifecycle, queries, ids, bodies, colliders, mass, joints, `own`, `setMaterial`; T10: `sys`, `digest`, `heightfield`, `audit` |
| `src/sim/world/install.js` | create (T11) | `checkPhysics`, `installWorld`: the World seat, the four `lh.*` systems, the digest hook |
| `src/core/engine.js` | modify (T11) | World around main scenes, `ctx.world`, `engine.world`, `timer` option, `engine.builtin`, `state().world`, `defineGame` physics check |
| `testing/invariants.js` | modify (T12) | `worldFinite(world, engine)` |
| `testing/headless.js` | modify (T12) | `h.world`, `find`, `one`, `get`, `spawn`, `despawn`, `place`; finite check after each step |
| `testing/checks.js` | create (T13–T15) | `determinism`, `simPurity`, `zeroAlloc`, `materials`, and `checks` (all four) |
| `test/fixtures/phys/rapier.js` | create (T1) | the one `R.init()` for tests |
| `test/fixtures/phys/materials.js` | create (T1) | stand-in registry with 3b's §4.2 members |
| `test/fixtures/phys/phys.json` | create (T1) | `phys.json`-shaped fixture: `crate`, `cart` sidecars |
| `test/fixtures/phys/engine.js` | create (T1) | `stubEngine()` for World unit tests before the engine seam |
| `test/fixtures/phys/game.js` | create (T11) | `physGame()`: a one-scene physics game |
| `test/physics-fixtures.test.mjs` | create (T1) | Rapier 0.21.x pin (R4), fixture registry and sidecars |
| `test/physics-rapier.test.mjs` | create (T2) | #1, params, timestep, gravity, timer, init check (D9) |
| `test/physics-groups.test.mjs` | create (T3) | bits, masks, Rapier agreement |
| `test/physics-heightfield.test.mjs` | create (T4) | layout, translation, flags, ball rest height |
| `test/world-pool.test.mjs` | create (T5) | slots, growth, swap, accessors |
| `test/world-place.test.mjs` | create (T6) | place, socket, xfPrev |
| `test/physics-events.test.mjs` | create (T7) | contact and sensor events |
| `test/physics-colliders.test.mjs` | create (T8) | shapes, precedence, combine rules, slide and bounce |
| `test/world-entities.test.mjs` | create (T9) | ids, queries, despawn, add/remove, clear, dispose, hooks |
| `test/world-bodies.test.mjs` | create (T9) | bodies, colliders, materials, mass, errors, joints, setMaterial |
| `test/world-step.test.mjs` | create (T10) | read order, #2, events through the World, digest, heightfield, clear with physics, timer, audit |
| `test/world-engine.test.mjs` | create (T11) | S-3 ownership, schedule, step order, builtin, timer, state digest, init check |
| `test/world-headless.test.mjs` | create (T12) | T-5 access, T-1 finite |
| `test/checks-determinism.test.mjs` | create (T13) | `determinism`, `simPurity` |
| `test/checks-alloc.test.mjs` | create (T14) | `zeroAlloc` |
| `test/checks-materials.test.mjs` | create (T15) | `materials` |
| `test/world-replay.test.mjs` | create (T16) | a full physics scene: determinism, tape with `clear()`, replay mismatch |
| `test/world-base-materials.test.mjs` | create (T17) | the World on 3b's real registry |
| `test/engine.test.mjs` | one line (T11, Integrator request 1) | the built-in schedule now lists the World systems |
| `docs/plans/2026-10-13-phase-3c-world-notes.md` | create (T1), append | notes, contract issues met, field note candidates |

Must not touch: `src/defs/**` (read only, and only from Task 17), `src/view/**`, `tools/**`, `src/sim/replica.js`, every integrator file.

## Test commands

Defined once; every step below uses them from the worktree root.

```bash
WT=/home/smiller/projects/four43/lion-hawk-engine-3c
UNIT="systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 --working-directory=$WT -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4"
# one file:   $UNIT test/world-pool.test.mjs
# the suite:  $UNIT test/
```

3c has no browser suite. Never run `node --test` without `--test-concurrency=4`, never raise a cap.

---
## Task 1: Test fixtures (registry stand-in, sidecars, Rapier) and the notes stub

**Files:**
- Create: `test/fixtures/phys/rapier.js`, `test/fixtures/phys/materials.js`, `test/fixtures/phys/phys.json`, `test/fixtures/phys/engine.js`
- Create: `test/physics-fixtures.test.mjs`
- Create: `docs/plans/2026-10-13-phase-3c-world-notes.md`

**Interfaces:**
- Consumes: overview §4.2 registry members (`get`, `has`, `ids`, `index`, `byIndex`, `density`, `collider`, `hash`), §4.3 sidecar and `phys.json` shapes.
- Produces (tests only): `R` (initialised Rapier), `MATERIALS` (frozen registry stand-in, hash `'5ca1ab1e'`), `PHYS` (`{ v, engine, materials, models: { crate, cart } }`), `stubEngine(opts) → { seed, game, emit, events }`.

- [ ] **Step 1: Write the failing test** `test/physics-fixtures.test.mjs`:

```js
// 3c fixtures: Rapier is pinned to 0.21.x (R4), the registry stand-in honours 3b's §4.2 members, and the fixture
// sidecars name only fixture materials and carry the registry hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { R } from './fixtures/phys/rapier.js';
import MATERIALS from './fixtures/phys/materials.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };
import { stubEngine } from './fixtures/phys/engine.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('Rapier is 0.21.x: a bump must re-pin PINNED_DEFAULTS and the heightfield layout first (R4)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../node_modules/@dimforge/rapier3d-compat/package.json', import.meta.url), 'utf8'));
  assert.match(pkg.version, /^0\.21\./);
  assert.match(R.version(), /^0\.21\./);
});
test('the fixture registry has the §4.2 members the World reads, with 3b semantics', () => {
  for (const k of ['get', 'has', 'index', 'byIndex', 'density', 'collider']) assert.equal(typeof MATERIALS[k], 'function', k);
  assert.ok(Object.isFrozen(MATERIALS) && Object.isFrozen(MATERIALS.ids));
  assert.match(MATERIALS.hash, /^[0-9a-f]{8}$/);
  assert.throws(() => MATERIALS.get('nope'), /materials: unknown material 'nope'/);
  assert.equal(MATERIALS.has('nope'), false);
  assert.equal(MATERIALS.has('__proto__'), false);
  near(MATERIALS.density('wood'), 600);
  near(MATERIALS.density('shell'), 157); // sg 7.85 × 1000 × fill 0.02
  assert.equal(MATERIALS.density('air'), 0); // a fluid without phys.sg
  const c = MATERIALS.collider('slick');
  assert.deepEqual({ ...c }, { friction: 0.5, restitution: 0, density: 1000 }); // √0.25
  assert.equal(MATERIALS.collider('slick'), c, 'cached');
  assert.equal(MATERIALS.byIndex(MATERIALS.index('grip')), 'grip');
});
test('the fixture sidecars name only fixture materials and carry the registry hash', () => {
  assert.equal(PHYS.v, 1);
  assert.equal(PHYS.materials, MATERIALS.hash);
  for (const [id, sc] of Object.entries(PHYS.models)) {
    assert.equal(sc.v, 1, id);
    for (const c of sc.colliders) {
      assert.ok(MATERIALS.has(c.material), `${id}: ${c.material}`);
      for (const k of ['p', 'q', 'part']) assert.ok(k in c, `${id}: collider without ${k}`);
    }
  }
  assert.deepEqual(PHYS.models.cart.sockets.hat, { p: [0, 0.75, 0], q: [0, 0, 0, 1], part: 'body' });
});
test('stubEngine carries what createWorld reads', () => {
  const e = stubEngine({ hz: 240 });
  assert.equal(e.game.sim.hz, 240);
  assert.equal(e.game.physics.rapier, R);
  assert.equal(e.game.defs.materials, MATERIALS);
  e.emit('contact', { a: 1 });
  assert.deepEqual(e.events, [{ type: 'contact', a: 1 }]);
  assert.equal(stubEngine({ physics: false }).game.physics, undefined);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-fixtures.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `test/fixtures/phys/rapier.js`.

- [ ] **Step 3: Write the fixtures**

`test/fixtures/phys/rapier.js`:

```js
// The one Rapier initialisation for the 3c tests. The engine never imports Rapier (D9): tests import it here and
// inject it through defineGame({ physics: { rapier } }) or createWorld's options.
import R from '@dimforge/rapier3d-compat';

await R.init();
export { R };
```

`test/fixtures/phys/materials.js`:

```js
// Stand-in for 3b's material registry (overview §4.2) until 3b merges: the members the World and checks read, with
// the same semantics, hand-resolved. Values are chosen for the tests: slick × grip = 0.25 × 0.81, geometric mean 0.45.
// density = sg × 1000 × fill (sg 1, fill 1 by default); a fluid without phys.sg has density 0.
const TABLE = {
  steel: { phys: { friction: 0.6, restitution: 0.1, sg: 7.85 } },
  shell: { phys: { friction: 0.6, restitution: 0.1, sg: 7.85, fill: 0.02 } },
  wood: { phys: { friction: 0.5, restitution: 0.2, sg: 0.6 } },
  rubber: { phys: { friction: 1.0, restitution: 0.5, sg: 1.1 } },
  gravel: { phys: { friction: 0.81, restitution: 0.1, sg: 1.8 } },
  grass: { phys: { friction: 0.6, restitution: 0.1, sg: 1.2 } },
  ice: { phys: { friction: 0.04, restitution: 0.05, sg: 0.92 } },
  slick: { phys: { friction: 0.25, restitution: 0, sg: 1 } },
  grip: { phys: { friction: 0.81, restitution: 0, sg: 1 } },
  bouncy: { phys: { friction: 0.5, restitution: 0.8, sg: 1 } },
  pet: { phys: { friction: 0.5, restitution: 0.1, sg: 1 } },
  air: { phys: { friction: 0, restitution: 0 }, fluid: { density: 1.2, viscosity: 1.8e-5 } },
};
const freeze = o => { if (o && typeof o === 'object') { for (const v of Object.values(o)) freeze(v); Object.freeze(o); } return o; };
freeze(TABLE);
const ids = Object.freeze(Object.keys(TABLE)), cache = new Map();
function get(id) {
  if (typeof id !== 'string' || !Object.hasOwn(TABLE, id)) throw new Error(`materials: unknown material '${id}'`);
  return TABLE[id];
}
function density(id) {
  const m = get(id);
  if (m.phys?.sg === undefined && m.fluid) return 0;
  return (m.phys?.sg ?? 1) * 1000 * (m.phys?.fill ?? 1);
}
export default Object.freeze({
  get,
  has: id => typeof id === 'string' && Object.hasOwn(TABLE, id),
  ids,
  index(id) { get(id); return ids.indexOf(id); },
  byIndex: i => ids[i],
  density,
  collider(id) {
    let c = cache.get(id);
    if (!c) { const m = get(id); cache.set(id, c = Object.freeze({ friction: Math.sqrt(m.phys?.friction ?? 0.5), restitution: m.phys?.restitution ?? 0, density: density(id) })); }
    return c;
  },
  hash: '5ca1ab1e',
});
```

`test/fixtures/phys/phys.json` (crate: one 1 m wood cube, 600 kg; cart: a steel-shell box plus a rubber wheel, masses computed with Rapier 0.21):

```json
{
  "v": 1,
  "engine": "0.8.0",
  "materials": "5ca1ab1e",
  "models": {
    "crate": {
      "v": 1,
      "source": { "file": "test/fixtures/phys/crate", "sha256": "0" },
      "parts": ["body"],
      "colliders": [
        { "shape": "box", "half": [0.5, 0.5, 0.5], "p": [0, 0.5, 0], "q": [0, 0, 0, 1], "part": "body", "material": "wood" }
      ],
      "mass": { "mass": 600, "com": [0, 0.5, 0], "inertia": [100, 100, 100], "frame": [0, 0, 0, 1] },
      "sockets": {},
      "bounds": { "min": [-0.5, 0, -0.5], "max": [0.5, 1, 0.5] }
    },
    "cart": {
      "v": 1,
      "source": { "file": "test/fixtures/phys/cart", "sha256": "0" },
      "parts": ["body", "wheel"],
      "colliders": [
        { "shape": "box", "half": [1, 0.25, 0.5], "p": [0, 0.5, 0], "q": [0, 0, 0, 1], "part": "body", "material": "shell" },
        { "shape": "sphere", "r": 0.3, "p": [0.8, 0.3, 0], "q": [0, 0, 0, 1], "part": "wheel", "material": "rubber" }
      ],
      "mass": { "mass": 281.407, "com": [0.35367, 0.41158, 0], "inertia": [22.2693, 107.2803, 115.6563], "frame": [0.70583, -0.04242, 0.04242, -0.70583] },
      "sockets": { "hat": { "p": [0, 0.75, 0], "q": [0, 0, 0, 1], "part": "body" } },
      "bounds": { "min": [-1, 0, -0.5], "max": [1.1, 0.75, 0.5] }
    }
  }
}
```

`test/fixtures/phys/engine.js`:

```js
// A stand-in engine for World unit tests (Tasks 2–10): exactly what createWorld reads (game.sim.hz, game.physics,
// game.defs, seed, emit). From Task 11 the tests use the real engine through test/fixtures/phys/game.js.
import { R } from './rapier.js';
import MATERIALS from './materials.js';
import PHYS from './phys.json' with { type: 'json' };

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];
export function stubEngine({ hz = 60, physics = true, groups = GROUPS, params, gravity, materials = MATERIALS, models = PHYS, seed = 1 } = {}) {
  const events = [];
  return {
    seed, events,
    emit: (type, data) => { events.push({ type, ...data }); },
    game: { sim: { hz }, physics: physics ? { rapier: R, groups, params, gravity } : undefined, defs: { materials, models } },
  };
}
```

Create `docs/plans/2026-10-13-phase-3c-world-notes.md`:

```markdown
# Phase 3c notes: World, entities and the Rapier wrapper

Plan: `docs/plans/2026-10-13-phase-3c-world.md`. Branch `phase-3-world`.

## Progress

| Task | Commit | Tests (file: pass/total) | Notes |
|---|---|---|---|

## Contract issues met

(Each "Contract issue:" from the plan, with what the implementation did.)

## Field note candidates

(The integrator numbers these from #110.)
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-fixtures.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/phys/ test/physics-fixtures.test.mjs docs/plans/2026-10-13-phase-3c-world-notes.md
git commit -m "test(world): fixture registry, sidecars and Rapier 0.21 pin for 3c"
```

---

## Task 2: The Rapier wrapper core: pinned parameters, timestep, timer, init check

**Files:**
- Create: `src/sim/physics/rapier.js`
- Create: `test/physics-rapier.test.mjs`

**Interfaces:**
- Consumes: the injected Rapier module `R` (D9).
- Produces:
  - `PINNED_DEFAULTS`: frozen; every `integrationParameters` field Rapier 0.21.0 exposes with a getter and setter, except `dt`, at 0.21.0's own default values (`softBodiesRecovery` is a frozen object of its 27 fields).
  - `mergeParams(params = {}) → merged`: throws `physics: params.<k> is not a Rapier 0.21 integration parameter`.
  - `checkRapier(R | null)`: no-op for `null`; throws `physics: physics.rapier must be the @dimforge/rapier3d-compat module` or `physics: await RAPIER.init() before createEngine`.
  - `createPhysics(R, { gravity = [0, -9.81, 0], hz, params, timer = null }) → ph` with `ph.R`, `ph.world` (RAPIER.World), `ph.queue` (EventQueue), `ph.stats = { stepMs, stepMsTotal }`, `ph.step()`, `ph.free()`, `ph.recreate() → ph`.

- [ ] **Step 1: Write the failing test** `test/physics-rapier.test.mjs`:

```js
// #1, §4.5 creation: every Rapier 0.21 integration parameter is pinned; the timestep is 1/hz; the timer feeds stats
// only (#106); an uninitialised Rapier is named (D9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PINNED_DEFAULTS, mergeParams, checkRapier, createPhysics } from '../src/sim/physics/rapier.js';
import { R } from './fixtures/phys/rapier.js';

const accessors = ip => {
  const p = Object.getPrototypeOf(ip);
  return Object.getOwnPropertyNames(p).filter(n => { const d = Object.getOwnPropertyDescriptor(p, n); return d.get && d.set; });
};

test("PINNED_DEFAULTS is Rapier 0.21.0's own defaults, field for field, and nothing else (#1)", () => {
  const w = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    const ip = w.integrationParameters, names = accessors(ip).filter(n => n !== 'dt').sort();
    assert.deepEqual(Object.keys(PINNED_DEFAULTS).sort(), names, 'a parameter Rapier added or dropped must be pinned or unpinned on purpose');
    for (const k of names) {
      if (k === 'softBodiesRecovery') assert.deepEqual({ ...ip[k] }, { ...PINNED_DEFAULTS[k] });
      else assert.equal(ip[k], PINNED_DEFAULTS[k], k);
    }
    assert.ok(Object.isFrozen(PINNED_DEFAULTS) && Object.isFrozen(PINNED_DEFAULTS.softBodiesRecovery));
  } finally { w.free(); }
});
test('createPhysics: timestep 1/hz, params written over the defaults, nested recovery merged', () => {
  const ph = createPhysics(R, { hz: 240, params: { numSolverIterations: 8, softBodiesRecovery: { recoveryPace: 0.25 } } });
  try {
    const ip = ph.world.integrationParameters;
    assert.equal(ph.world.timestep, Math.fround(1 / 240));
    assert.equal(ip.numSolverIterations, 8);
    assert.equal(ip.normalizedPredictionDistance, PINNED_DEFAULTS.normalizedPredictionDistance);
    assert.equal(ip.softBodiesRecovery.recoveryPace, 0.25);
    assert.equal(ip.softBodiesRecovery.overlapPatience, 240);
    assert.equal(typeof ph.queue.drainContactForceEvents, 'function');
  } finally { ph.free(); }
});
test('gravity is the given vector: a free body reaches -1 m/s after 1 s under [0, -1, 0]', () => {
  const ph = createPhysics(R, { hz: 60, gravity: [0, -1, 0] });
  try {
    const b = ph.world.createRigidBody(R.RigidBodyDesc.dynamic());
    ph.world.createCollider(R.ColliderDesc.ball(0.1), b);
    for (let i = 0; i < 60; i++) ph.step();
    assert.ok(Math.abs(b.linvel().y + 1) < 1e-4, `${b.linvel().y}`);
  } finally { ph.free(); }
});
test('unknown params throw, naming the field', () => {
  assert.throws(() => mergeParams({ numSolverIteration: 4 }), /physics: params\.numSolverIteration is not a Rapier 0\.21 integration parameter/);
  assert.throws(() => mergeParams({ dt: 0.1 }), /physics: params\.dt is not/);
  assert.equal(mergeParams().numSolverIterations, 4);
});
test('with a timer, stats hold the last step and a running total; without one they stay 0 (#106)', () => {
  let t = 0;
  const ph = createPhysics(R, { hz: 60, timer: () => (t += 1.5) }), plain = createPhysics(R, { hz: 60 });
  try {
    ph.step(); ph.step();
    assert.equal(ph.stats.stepMs, 1.5);
    assert.equal(ph.stats.stepMsTotal, 3);
    plain.step();
    assert.deepEqual(plain.stats, { stepMs: 0, stepMsTotal: 0 });
  } finally { ph.free(); plain.free(); }
});
test('recreate frees the old world and makes an empty one with the same settings; free is idempotent', () => {
  const ph = createPhysics(R, { hz: 120, params: { numSolverIterations: 6 } }), old = ph.world;
  old.createCollider(R.ColliderDesc.ball(1));
  ph.recreate();
  assert.notEqual(ph.world, old);
  let n = 0; ph.world.forEachCollider(() => n++);
  assert.equal(n, 0);
  assert.equal(ph.world.integrationParameters.numSolverIterations, 6);
  assert.equal(ph.world.timestep, Math.fround(1 / 120));
  ph.free(); ph.free();
  assert.equal(ph.world, null);
});
test('checkRapier names an uninitialised module and refuses a non-module (D9)', () => {
  const uninit = { World: class { constructor() { throw new TypeError("Cannot read properties of undefined (reading 'rawintegrationparameters_new')"); } } };
  assert.throws(() => checkRapier(uninit), /^Error: physics: await RAPIER\.init\(\) before createEngine$/);
  assert.throws(() => checkRapier({}), /physics: physics\.rapier must be the @dimforge\/rapier3d-compat module/);
  assert.doesNotThrow(() => checkRapier(R));
  assert.doesNotThrow(() => checkRapier(null));
});
test('a real, never-initialised Rapier fails checkRapier in a fresh process', () => {
  const mod = new URL('../src/sim/physics/rapier.js', import.meta.url).href;
  const src = `import R from '@dimforge/rapier3d-compat'; import { checkRapier } from ${JSON.stringify(mod)};
try { checkRapier(R); console.log('no error'); } catch (e) { console.log(e.message); }`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', src], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'physics: await RAPIER.init() before createEngine', r.stderr);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-rapier.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/physics/rapier.js`.

- [ ] **Step 3: Implement** `src/sim/physics/rapier.js`:

```js
// The Rapier wrapper's core (overview §4.5). The game injects its initialised module (D9); the engine never imports
// Rapier. Every integration parameter Rapier 0.21 exposes is written from PINNED_DEFAULTS merged with the game's
// params, so a Rapier bump that moves a default fails test/physics-rapier.test.mjs instead of silently changing feel
// (#1). The timer is a diagnostic only (#106): its numbers never reach state() or a checksum.
const f32 = Math.fround; // Rapier stores these as f32; the pinned values are what a fresh world reads back
export const PINNED_DEFAULTS = Object.freeze({
  lengthUnit: 1,
  normalizedAllowedLinearError: f32(0.005),
  normalizedPredictionDistance: f32(0.02),
  numSolverIterations: 4,
  numInternalPgsIterations: 1,
  maxCcdSubsteps: 1,
  softBodiesResweepStrain: 0.75,
  softBodiesMaxExtraSubsteps: 4,
  softBodiesContactStiffening: 4,
  softBodiesFemLinearTolerance: f32(1e-5),
  softBodiesFemMaxLinearIterations: 20,
  softBodiesFemMaxDenseDofs: 600,
  softBodiesRecovery: Object.freeze({
    authoredVelocityMargin: true, edgeSpeculation: false, invertedCellDetection: true, selfCrossingDetection: true,
    detectionMotionGating: true, crossBodyDetection: true, selfStandDown: true, crossBodyExpelGate: true,
    edgeStandDown: true, crossingRepulsion: false, crossingRepulsionGuide: false, crossingRepulsionSelfGuide: false,
    overlapConstraints: true, overlapRigid: true, overlapSkipSelfTangled: true, overlapEdgeStandDown: true,
    overlapSkinVolume: false, overlapSelfRegions: false, overlapNormalPush: true, overlapMultiVolume: false,
    recoveryPace: 0.5, overlapConstraintPace: 1, overlapKeptDepth: 0, overlapProgressMargin: f32(0.02),
    overlapSplit: 3, overlapPatience: 240, overlapPatchConstraints: 2,
  }),
});

export function mergeParams(params = {}) {
  for (const k of Object.keys(params)) if (!Object.hasOwn(PINNED_DEFAULTS, k)) throw new Error(`physics: params.${k} is not a Rapier 0.21 integration parameter`);
  return { ...PINNED_DEFAULTS, ...params, softBodiesRecovery: { ...PINNED_DEFAULTS.softBodiesRecovery, ...params.softBodiesRecovery } };
}

// D9 / §4.1: a guarded `new R.World` tells an initialised module from one whose WASM is not loaded yet.
// Only `World` is required here, so a stand-in module in a test reaches the init check.
export function checkRapier(R) {
  if (R == null) return;
  if (typeof R.World !== 'function') throw new Error('physics: physics.rapier must be the @dimforge/rapier3d-compat module');
  let w;
  try { w = new R.World({ x: 0, y: 0, z: 0 }); } catch { throw new Error('physics: await RAPIER.init() before createEngine'); }
  w.free();
}

function applyParams(rw, merged) {
  const ip = rw.integrationParameters; // one cached object per world; its setters write through to the WASM side
  for (const k of Object.keys(merged)) if (k !== 'softBodiesRecovery') ip[k] = merged[k];
  const r = ip.softBodiesRecovery; // a fresh wrapper each read: fill it, then assign it back
  for (const k of Object.keys(merged.softBodiesRecovery)) r[k] = merged.softBodiesRecovery[k];
  ip.softBodiesRecovery = r;
}

export function createPhysics(R, { gravity = [0, -9.81, 0], hz, params, timer = null } = {}) {
  if (!(hz > 0)) throw new Error(`physics: hz must be > 0 (got ${hz})`);
  const merged = mergeParams(params), g = { x: gravity[0], y: gravity[1], z: gravity[2] };
  const ph = {
    R, world: null, queue: null, stats: { stepMs: 0, stepMsTotal: 0 },
    step() {
      if (timer === null) { ph.world.step(ph.queue); return; }
      const t0 = timer();
      ph.world.step(ph.queue);
      const ms = timer() - t0;
      ph.stats.stepMs = ms; ph.stats.stepMsTotal += ms;
    },
    free() {
      if (ph.queue) { ph.queue.free(); ph.queue = null; }
      if (ph.world) { ph.world.free(); ph.world = null; }
    },
    recreate() { ph.free(); return make(); },
  };
  function make() {
    const w = new R.World(g);
    w.timestep = 1 / hz;
    applyParams(w, merged);
    ph.world = w; ph.queue = new R.EventQueue(true);
    return ph;
  }
  return make();
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-rapier.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the pin red by mutation**

Temporarily change `normalizedPredictionDistance: f32(0.02)` to `f32(0.002)` (Rapier 0.14's value, field note #1). Run `$UNIT test/physics-rapier.test.mjs`: the first test FAILS naming `normalizedPredictionDistance`. Revert and run again: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/physics/rapier.js test/physics-rapier.test.mjs
git commit -m "feat(physics): Rapier world creation with pinned 0.21 parameters, timed step and init check (#1, #106, D9)"
```

---

## Task 3: Named collision groups

**Files:**
- Create: `src/sim/physics/groups.js`
- Create: `test/physics-groups.test.mjs`

**Interfaces:**
- Produces: `createGroups(names = []) → groups`, a frozen object `{ <name>: 1 << i, ... }` with a non-enumerable `mask(member, filter) → u32`. `member`/`filter` are arrays of declared names; an omitted one means all 16 bits (Rapier's default). Throws `physics: at most 16 groups (got N)`, `physics: group '<n>' is declared twice`, `physics: group 'mask' is reserved`, `physics: group <i> must be a non-empty string`, `physics: group '<n>' is not declared`, `physics: groups.<member|filter> must be an array of names`.
- Consumed by: `world.js` (`world.groups`), `install.js` (`checkPhysics`).

- [ ] **Step 1: Write the failing test** `test/physics-groups.test.mjs`:

```js
// §4.1, §4.5 groups: names get bits in declaration order; Rapier packs membership in the high 16 bits and the
// filter in the low 16, and two colliders touch only when each one's membership meets the other's filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroups } from '../src/sim/physics/groups.js';
import { R } from './fixtures/phys/rapier.js';

test('names get bits in order; mask packs membership high and filter low', () => {
  const g = createGroups(['ground', 'static', 'vehicle']);
  assert.equal(g.ground, 1); assert.equal(g.static, 2); assert.equal(g.vehicle, 4);
  assert.equal(g.mask(['vehicle'], ['ground', 'static']), ((4 << 16) | 3) >>> 0);
  assert.equal(g.mask(), 0xffffffff, 'omitted member and filter mean every group (Rapier default)');
  assert.equal(g.mask(['ground']), ((1 << 16) | 0xffff) >>> 0);
  assert.equal(g.mask([], []), 0);
  assert.ok(Object.isFrozen(g));
  assert.deepEqual(Object.keys(g), ['ground', 'static', 'vehicle']);
});
test('16 names fit; the 16th is bit 15 and the mask stays unsigned', () => {
  const g = createGroups(Array.from({ length: 16 }, (_, i) => `g${i}`));
  assert.equal(g.g15, 0x8000);
  assert.equal(g.mask(['g15'], ['g15']), 0x80008000);
});
test('bad declarations and unknown names throw, naming the group', () => {
  assert.throws(() => createGroups(Array.from({ length: 17 }, (_, i) => `g${i}`)), /physics: at most 16 groups \(got 17\)/);
  assert.throws(() => createGroups(['a', 'a']), /physics: group 'a' is declared twice/);
  assert.throws(() => createGroups(['mask']), /physics: group 'mask' is reserved/);
  assert.throws(() => createGroups(['']), /physics: group 0 must be a non-empty string/);
  assert.throws(() => createGroups('ground'), /physics: groups must be an array of names/);
  assert.throws(() => createGroups(['a']).mask(['b']), /physics: group 'b' is not declared/);
  assert.throws(() => createGroups(['a']).mask('a'), /physics: groups\.member must be an array of names/);
});
test("Rapier agrees: a member outside the other's filter does not touch", () => {
  const g = createGroups(['ground', 'vehicle', 'prop']);
  const touches = (ma, mb) => {
    const w = new R.World({ x: 0, y: 0, z: 0 });
    try {
      const a = w.createCollider(R.ColliderDesc.ball(1).setCollisionGroups(ma), w.createRigidBody(R.RigidBodyDesc.dynamic()));
      const b = w.createCollider(R.ColliderDesc.ball(1).setTranslation(0.5, 0, 0).setCollisionGroups(mb));
      w.step();
      let n = 0; w.contactPair(a, b, () => { n++; });
      return n > 0;
    } finally { w.free(); }
  };
  assert.equal(touches(g.mask(['vehicle'], ['ground']), g.mask(['ground'])), true);
  assert.equal(touches(g.mask(['vehicle'], ['prop']), g.mask(['ground'])), false, 'vehicle filters ground out');
  assert.equal(touches(g.mask(['vehicle']), g.mask(['ground'], ['prop'])), false, 'ground filters vehicle out');
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-groups.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/physics/groups.js`.

- [ ] **Step 3: Implement** `src/sim/physics/groups.js`:

```js
// Named collision groups (overview §4.1, §4.5): up to 16 names, bit i for the i-th. Rapier packs membership in the
// high 16 bits and the filter in the low 16; two colliders interact only when each one's membership meets the
// other's filter. An omitted member or filter means every group, which is Rapier's own default.
export const ALL = 0xffff;

export function createGroups(names = []) {
  if (!Array.isArray(names)) throw new Error('physics: groups must be an array of names');
  if (names.length > 16) throw new Error(`physics: at most 16 groups (got ${names.length})`);
  const g = {};
  names.forEach((n, i) => {
    if (typeof n !== 'string' || !n) throw new Error(`physics: group ${i} must be a non-empty string`);
    if (n === 'mask') throw new Error("physics: group 'mask' is reserved");
    if (Object.hasOwn(g, n)) throw new Error(`physics: group '${n}' is declared twice`);
    g[n] = 1 << i;
  });
  const bits = (list, what) => {
    if (list === undefined) return ALL;
    if (!Array.isArray(list)) throw new Error(`physics: groups.${what} must be an array of names`);
    let m = 0;
    for (const n of list) { if (!Object.hasOwn(g, n)) throw new Error(`physics: group '${n}' is not declared`); m |= g[n]; }
    return m;
  };
  Object.defineProperty(g, 'mask', { value: (member, filter) => ((bits(member, 'member') << 16) | bits(filter, 'filter')) >>> 0 });
  return Object.freeze(g);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-groups.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/physics/groups.js test/physics-groups.test.mjs
git commit -m "feat(physics): named collision groups with Rapier's membership/filter packing"
```

---

## Task 4: Row-major heightfield helper

**Files:**
- Create: `src/sim/physics/heightfield.js`
- Create: `test/physics-heightfield.test.mjs`

**Interfaces:**
- Produces: `heightfieldDesc(R, { nx, nz, cell, x0 = 0, z0 = 0, heights, fixInternalEdges = false }) → RAPIER.ColliderDesc`. `heights` is row-major, `heights[iz * nx + ix]` at `(x0 + ix·cell, z0 + iz·cell)`. Throws `heightfield: nx and nz must be integers >= 2 (got …)`, `heightfield: cell must be > 0 (got …)`, `heightfield: heights must hold nx*nz = N values (got …)`.
- Consumed by: `world.heightfield` (Task 10), 3h's terrain kit, the integrator's `lion-hawk/sim` export.

- [ ] **Step 1: Write the failing test** `test/physics-heightfield.test.mjs`:

```js
// §4.5 heightfield (R4): Rapier 0.21 takes SUBDIVISION counts (rows along z, columns along x), heights in
// column-major order and the full extent as scale, centred on the translation. heightfieldDesc hides all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heightfieldDesc } from '../src/sim/physics/heightfield.js';
import { R } from './fixtures/phys/rapier.js';

test('heights are reordered column-major with subdivision counts, full-extent scale and centre translation', () => {
  const calls = [];
  const RR = { HeightFieldFlags: R.HeightFieldFlags, ColliderDesc: { heightfield: (...a) => { calls.push(a); return R.ColliderDesc.heightfield(...a); } } };
  const d = heightfieldDesc(RR, { nx: 3, nz: 2, cell: 2, x0: 10, z0: 20, heights: [0, 1, 2, 3, 4, 5], fixInternalEdges: true });
  const [rows, cols, H, scale, flags] = calls[0];
  assert.equal(rows, 1); assert.equal(cols, 2);
  assert.deepEqual([...H], [0, 3, 1, 4, 2, 5]); // H[iz + ix·nz] = heights[iz·nx + ix]
  assert.deepEqual(scale, { x: 4, y: 1, z: 2 });
  assert.equal(flags, R.HeightFieldFlags.FIX_INTERNAL_EDGES);
  const w = new R.World({ x: 0, y: 0, z: 0 });
  try { assert.deepEqual({ ...w.createCollider(d).translation() }, { x: 12, y: 0, z: 21 }); } finally { w.free(); }
  heightfieldDesc(RR, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0, 0] });
  assert.equal(calls[1][4], undefined, 'no flags unless fixInternalEdges');
});
test('a ball dropped on a sloped field rests at the analytic height, not the transposed one', () => {
  const nx = 9, nz = 7, cell = 1.5, x0 = -4, z0 = -3, h = (x, z) => 0.1 * x + 0.3 * z;
  const heights = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) heights[iz * nx + ix] = h(x0 + ix * cell, z0 + iz * cell);
  const w = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    w.timestep = 1 / 60;
    w.createCollider(heightfieldDesc(R, { nx, nz, cell, x0, z0, heights }));
    const ball = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(6, 5, 2).lockRotations().enabledTranslations(false, true, false));
    w.createCollider(R.ColliderDesc.ball(0.25), ball);
    for (let i = 0; i < 240; i++) w.step();
    const r = 0.25, lift = r * Math.sqrt(1 + 0.1 ** 2 + 0.3 ** 2); // a sphere on a plane: r / cos(slope)
    const y = ball.translation().y;
    assert.ok(Math.abs(y - (h(6, 2) + lift)) < 0.01, `rests at ${y}, expected ${h(6, 2) + lift}`);
    assert.ok(Math.abs(y - (h(2, 6) + lift)) > 0.5, 'a transposed field would put it 0.8 m higher');
  } finally { w.free(); }
});
test('bad fields throw before Rapier sees them', () => {
  assert.throws(() => heightfieldDesc(R, { nx: 1, nz: 3, cell: 1, heights: [0, 0, 0] }), /heightfield: nx and nz must be integers >= 2 \(got 1, 3\)/);
  assert.throws(() => heightfieldDesc(R, { nx: 2, nz: 2, cell: 0, heights: [0, 0, 0, 0] }), /heightfield: cell must be > 0 \(got 0\)/);
  assert.throws(() => heightfieldDesc(R, { nx: 2, nz: 2, cell: 1, heights: [0, 0, 0] }), /heightfield: heights must hold nx\*nz = 4 values \(got 3\)/);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-heightfield.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/physics/heightfield.js`.

- [ ] **Step 3: Implement** `src/sim/physics/heightfield.js` (Rally's `trackWorld.js:21-27`, moved, plus the flag):

```js
// §4.5 heightfield: callers give row-major heights, heights[iz * nx + ix] at (x0 + ix·cell, z0 + iz·cell).
// rapier3d-compat 0.14–0.21: heightfield(nrows, ncols, ...) takes SUBDIVISION counts (rows along z, columns along x),
// the (nrows+1)·(ncols+1) heights in column-major order (index iz + ix·nz), `scale` as the field's full extent, and
// centres the field on the collider's translation. Pinned here so a Rapier change fails one test, not three games.
export function heightfieldDesc(R, { nx, nz, cell, x0 = 0, z0 = 0, heights, fixInternalEdges = false }) {
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 2 || nz < 2) throw new Error(`heightfield: nx and nz must be integers >= 2 (got ${nx}, ${nz})`);
  if (!(Number.isFinite(cell) && cell > 0)) throw new Error(`heightfield: cell must be > 0 (got ${cell})`);
  if (!heights || heights.length !== nx * nz) throw new Error(`heightfield: heights must hold nx*nz = ${nx * nz} values (got ${heights?.length})`);
  const H = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) H[iz + ix * nz] = heights[iz * nx + ix];
  const sx = (nx - 1) * cell, sz = (nz - 1) * cell;
  const flags = fixInternalEdges ? R.HeightFieldFlags.FIX_INTERNAL_EDGES : undefined;
  return R.ColliderDesc.heightfield(nz - 1, nx - 1, H, { x: sx, y: 1, z: sz }, flags).setTranslation(x0 + sx / 2, 0, z0 + sz / 2);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-heightfield.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Prove the orientation test red by mutation**

Temporarily index `H[iz * nx + ix] = heights[iz * nx + ix]` (no transpose). Run the file: the ball test FAILS (it rests on the wrong slope or off the field). Revert; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/physics/heightfield.js test/physics-heightfield.test.mjs
git commit -m "feat(physics): heightfieldDesc takes row-major heights and pins Rapier's column-major layout (R4)"
```

---
## Task 5: The transform pool (E-10)

**Files:**
- Create: `src/sim/world/pool.js`
- Create: `test/world-pool.test.mjs`

**Interfaces:**
- Produces:
  - constants `STRIDE = 14`, `PREV = 0`, `CURR = 7`; body kinds `DYNAMIC = 0`, `KINEMATIC = 1`, `FIXED = 2`, `BODILESS = -1`; `INTERNAL = Symbol('lh.world')` (the per-entity World record, set non-enumerable by `world.js`).
  - `createPool(cap = 64) → pool` with `pool.buf` (the current `Float64Array`; replaced when the pool doubles), `cap`, `count`, `alloc() → slot` (lowest free; identity pose in both halves; doubles when full), `free(slot)` (identity again; idempotent), `reset()`, `write(slot, PREV | CURR, p, q)`, `read(slot, PREV | CURR, p, q) → p`, `swap(slots)` (curr → prev for each listed slot).
  - `makeXf(pool, slot, e) → Object.freeze({ p, q, slot })`: `p.x/y/z`, `q.x/y/z/w` read and write the **current** half through `pool.buf`; a write while `e.body` is set throws `world: entity <id> has a body: move it with world.place`.
  - `deadXf(pool, slot) → Object.freeze({ p, q })`: a frozen copy of the slot's current pose, with no `slot`.
- Consumed by: `place.js`, `world.js`, `testing/invariants.js` (via `world.xf`), 3g's view sync (`world.xf.pool`, `e.xf.slot`).

- [ ] **Step 1: Write the failing test** `test/world-pool.test.mjs`:

```js
// E-10: one Float64Array pool, 14 floats per slot (prev pose then curr pose), slots lowest-free-first, growth only
// inside alloc(), and xf accessors that always read the current buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool, makeXf, deadXf, STRIDE, PREV, CURR } from '../src/sim/world/pool.js';

const P = (x, y, z) => ({ x, y, z }), Q0 = { x: 0, y: 0, z: 0, w: 1 };
const half = (pool, s, at) => [...pool.buf.subarray(s * STRIDE + at, s * STRIDE + at + 7)];

test('slots go lowest-free-first and a freed slot is reused first', () => {
  const p = createPool(4);
  assert.deepEqual([p.alloc(), p.alloc(), p.alloc()], [0, 1, 2]);
  p.free(1); p.free(0); p.free(0);
  assert.equal(p.count, 1);
  assert.deepEqual([p.alloc(), p.alloc(), p.alloc()], [0, 1, 3]);
  assert.equal(p.count, 4);
});
test('a full pool doubles inside alloc and keeps every pose', () => {
  const p = createPool(2); p.alloc(); const b = p.alloc();
  p.write(b, CURR, P(1, 2, 3), Q0);
  const old = p.buf, c = p.alloc();
  assert.equal(c, 2); assert.equal(p.cap, 4); assert.notEqual(p.buf, old);
  assert.deepEqual(half(p, b, CURR), [1, 2, 3, 0, 0, 0, 1]);
});
test('a new or freed slot holds the identity pose in both halves', () => {
  const p = createPool(2), s = p.alloc();
  assert.deepEqual(half(p, s, PREV), [0, 0, 0, 0, 0, 0, 1]);
  p.write(s, PREV, P(4, 5, 6), { x: 1, y: 0, z: 0, w: 0 }); p.free(s);
  assert.deepEqual(half(p, s, PREV), [0, 0, 0, 0, 0, 0, 1]);
});
test('swap copies curr to prev for the listed slots only', () => {
  const p = createPool(4), a = p.alloc(), b = p.alloc();
  p.write(a, CURR, P(1, 1, 1), Q0); p.write(b, CURR, P(2, 2, 2), Q0);
  p.swap([a]);
  assert.deepEqual(half(p, a, PREV), half(p, a, CURR));
  assert.deepEqual(half(p, b, PREV), [0, 0, 0, 0, 0, 0, 1]);
  const out = { x: 0, y: 0, z: 0 }, q = { ...Q0 };
  assert.equal(p.read(a, PREV, out, q), out);
  assert.deepEqual(out, P(1, 1, 1));
});
test('xf accessors read and write curr through growth; a body entity refuses writes', () => {
  const p = createPool(1), e = { id: 7 }, s = p.alloc(), xf = makeXf(p, s, e);
  xf.p.x = 5; xf.q.w = 0.5;
  p.alloc(); p.alloc(); // the pool doubles twice: a captured buffer would now be stale
  assert.equal(xf.p.x, 5);
  xf.p.y = 3;
  assert.equal(p.buf[s * STRIDE + CURR + 1], 3);
  assert.equal(p.buf[s * STRIDE + CURR + 6], 0.5);
  assert.equal(p.buf[s * STRIDE + PREV + 1], 0, 'writes go to curr only');
  assert.equal(xf.slot, s);
  assert.ok(Object.isFrozen(xf) && Object.isFrozen(xf.p) && Object.isFrozen(xf.q));
  assert.deepEqual(Object.keys(xf.p), ['x', 'y', 'z']);
  e.body = {};
  assert.throws(() => { xf.p.y = 1; }, /world: entity 7 has a body: move it with world\.place/);
});
test('deadXf is a frozen copy that does not follow the slot once it is reused', () => {
  const p = createPool(2), s = p.alloc();
  p.write(s, CURR, P(9, 8, 7), Q0);
  const dead = deadXf(p, s);
  p.free(s); const again = p.alloc(); p.write(again, CURR, P(1, 1, 1), Q0);
  assert.equal(again, s);
  assert.deepEqual({ ...dead.p }, P(9, 8, 7));
  assert.equal(dead.slot, undefined);
  assert.ok(Object.isFrozen(dead.p));
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-pool.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/world/pool.js`.

- [ ] **Step 3: Implement** `src/sim/world/pool.js`:

```js
// E-10 transform pool (overview §4.4): one Float64Array with STRIDE 14 floats per slot, [px, py, pz, qx, qy, qz, qw]
// of the previous step, then the same for the current one. Slots go lowest-free-first, so which slot an entity gets
// depends only on the spawn/despawn sequence (determinism). The array doubles when full, only inside alloc()
// (that is, at spawn), never in swap or the physics read. Readers must use pool.buf each time: it is replaced on growth.
export const STRIDE = 14, PREV = 0, CURR = 7;
// Per-entity World internals live under this symbol (set non-enumerable by world.js): invisible to Object.keys,
// canonical(), JSON and game code.
export const INTERNAL = Symbol('lh.world');
export const DYNAMIC = 0, KINEMATIC = 1, FIXED = 2, BODILESS = -1;

export function createPool(cap = 64) {
  let used = new Uint8Array(cap), hint = 0, count = 0; // hint: no free slot below it
  const identity = s => { const b = pool.buf, o = s * STRIDE; b.fill(0, o, o + STRIDE); b[o + 6] = 1; b[o + 13] = 1; };
  const pool = {
    buf: new Float64Array(cap * STRIDE),
    get cap() { return used.length; },
    get count() { return count; },
    alloc() {
      let s = hint;
      while (s < used.length && used[s]) s++;
      if (s === used.length) {
        const u = new Uint8Array(used.length * 2); u.set(used); used = u;
        const b = new Float64Array(used.length * STRIDE); b.set(pool.buf); pool.buf = b;
      }
      used[s] = 1; hint = s + 1; count++;
      identity(s);
      return s;
    },
    free(s) {
      if (!used[s]) return;
      used[s] = 0; count--;
      if (s < hint) hint = s;
      identity(s);
    },
    reset() { used.fill(0); hint = 0; count = 0; pool.buf.fill(0); },
    write(s, at, p, q) {
      const b = pool.buf, o = s * STRIDE + at;
      b[o] = p.x; b[o + 1] = p.y; b[o + 2] = p.z; b[o + 3] = q.x; b[o + 4] = q.y; b[o + 5] = q.z; b[o + 6] = q.w;
    },
    read(s, at, p, q) {
      const b = pool.buf, o = s * STRIDE + at;
      p.x = b[o]; p.y = b[o + 1]; p.z = b[o + 2]; q.x = b[o + 3]; q.y = b[o + 4]; q.z = b[o + 5]; q.w = b[o + 6];
      return p;
    },
    // step start (lh.world.swap): prev = curr for every listed slot. A copy, not a pointer flip, so an entity that
    // nothing moves this step keeps prev == curr.
    swap(slots) {
      const b = pool.buf;
      for (let i = 0; i < slots.length; i++) { const o = slots[i] * STRIDE; b.copyWithin(o, o + CURR, o + STRIDE); }
    },
  };
  return pool;
}

// e.xf: accessors made once at spawn onto the slot's CURRENT half. They read pool.buf on every access (the buffer is
// replaced when the pool grows). A body entity's pose comes from Rapier: writing it throws (world.place moves it).
export function makeXf(pool, slot, e) {
  const o = slot * STRIDE + CURR;
  const acc = i => ({
    enumerable: true,
    get() { return pool.buf[o + i]; },
    set(v) { if (e.body) throw new Error(`world: entity ${e.id} has a body: move it with world.place`); pool.buf[o + i] = v; },
  });
  const p = Object.freeze(Object.defineProperties({}, { x: acc(0), y: acc(1), z: acc(2) }));
  const q = Object.freeze(Object.defineProperties({}, { x: acc(3), y: acc(4), z: acc(5), w: acc(6) }));
  return Object.freeze({ p, q, slot });
}

// What a despawned entity keeps: its last current pose, frozen, and no slot (the slot may already be another's).
export function deadXf(pool, slot) {
  const b = pool.buf, o = slot * STRIDE + CURR;
  return Object.freeze({
    p: Object.freeze({ x: b[o], y: b[o + 1], z: b[o + 2] }),
    q: Object.freeze({ x: b[o + 3], y: b[o + 4], z: b[o + 5], w: b[o + 6] }),
  });
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-pool.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the growth test red by mutation**

Temporarily make `makeXf` capture the buffer (`const buf = pool.buf;` and use `buf[o + i]` in `get`/`set`). Run the file: "xf accessors read and write curr through growth" FAILS (`xf.p.y = 3` lands in the old buffer). Revert; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/world/pool.js test/world-pool.test.mjs
git commit -m "feat(world): transform pool with prev/curr halves and lowest-first slots (E-10)"
```

---

## Task 6: place, socket and xfPrev (E-8)

**Files:**
- Create: `src/sim/world/place.js`
- Create: `test/world-place.test.mjs`

**Interfaces:**
- Consumes: `pool.js` (Task 5), `core/math.js` (`rotate`, `qmul`, `qFromYaw`, `qnorm`).
- Produces: `createPlacer(pool, rapier, world) → { place, socket, xfPrev }` where `rapier()` returns the current `RAPIER.World` or `null`, and `world` is the token that `e[INTERNAL].world` must equal.
  - `place(e, { at: [x, y, z] } | { rel: other, local: [x, y, z] }, { yaw, q, keep = false } = {}) → e`. With `at`, rotation stays unless `yaw`/`q` is given. With `rel`, position is `other.p + other.q · local` and rotation is `other.q · (q | yaw | identity)`. Writes prev and curr; for a body: `setTranslation`/`setRotation` (waking it), zero velocities unless `keep` (dynamic), next kinematic pose (kinematic), `propagateModifiedBodyPositionsToColliders()` (fixed). Throws `world.place: …`.
  - `socket(e, name, out = new) → out`: world-space `{ p: {x,y,z}, q: {x,y,z,w} }` of `e.sockets[name]` (arrays `p`, `q` in body space) from the current pose. Throws `world.socket: entity <id> has no socket '<name>'`.
  - `xfPrev(e, out = new) → out`: the previous-step pose.
- Consumed by: `world.js` (`world.place`, `world.socket`, `world.xfPrev`).

- [ ] **Step 1: Write the failing test** `test/world-place.test.mjs`:

```js
// E-8: place moves an entity and its body together, writing prev and curr so the view never smears across a
// teleport; socket and xfPrev read the pool into caller-owned objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool, INTERNAL, DYNAMIC, KINEMATIC, FIXED, BODILESS, STRIDE, PREV, CURR } from '../src/sim/world/pool.js';
import { createPlacer } from '../src/sim/world/place.js';
import { R } from './fixtures/phys/rapier.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const TOKEN = {};
function rig() {
  const pool = createPool(4), rw = new R.World({ x: 0, y: -9.81, z: 0 });
  const placer = createPlacer(pool, () => rw, TOKEN);
  const ent = (id, kind = BODILESS, body) => {
    const e = { id, tags: new Set() };
    if (body) e.body = body;
    Object.defineProperty(e, INTERNAL, { value: { world: TOKEN, slot: pool.alloc(), kind, dead: false, awake: 0 } });
    return e;
  };
  return { pool, rw, placer, ent, half: (e, at) => [...pool.buf.subarray(e[INTERNAL].slot * STRIDE + at, e[INTERNAL].slot * STRIDE + at + 7)] };
}

test('place { at } writes prev and curr and keeps the rotation unless yaw or q is given', () => {
  const { placer, ent, half, rw } = rig(), e = ent(1);
  try {
    placer.place(e, { at: [1, 2, 3] }, { yaw: Math.PI / 2 });
    const s = Math.SQRT1_2;
    assert.deepEqual(half(e, PREV), half(e, CURR));
    const [x, y, z, qx, qy, qz, qw] = half(e, CURR);
    assert.deepEqual([x, y, z, qx, qz], [1, 2, 3, 0, 0]); near(qy, s); near(qw, s);
    placer.place(e, { at: [4, 5, 6] });
    near(half(e, CURR)[4], s, 1e-12);
    placer.place(e, { at: [0, 0, 0] }, { q: [0, 0, 2, 0] });
    assert.deepEqual(half(e, CURR).slice(3), [0, 0, 1, 0], 'q is normalised');
  } finally { rw.free(); }
});
test('place { rel, local } offsets in the other entity\'s frame and composes the rotation', () => {
  const { placer, ent, half, rw } = rig(), a = ent(1), b = ent(2);
  try {
    placer.place(a, { at: [10, 0, 0] }, { yaw: Math.PI / 2 });
    placer.place(b, { rel: a, local: [0, 0, 2] });
    const [x, y, z] = half(b, CURR);
    near(x, 12); near(y, 0); near(z, 0, 1e-12); // local +z turns to +x under a 90° yaw
    assert.deepEqual(half(b, CURR).slice(3).map(v => +v.toFixed(12)), half(a, CURR).slice(3).map(v => +v.toFixed(12)));
    placer.place(b, { rel: a, local: [0, 0, 0] }, { yaw: Math.PI / 2 });
    near(half(b, CURR)[4], 1, 1e-12); // two quarter turns about y
  } finally { rw.free(); }
});
test('a dynamic body is moved, woken and stopped; keep keeps its velocity', () => {
  const { placer, ent, rw } = rig();
  try {
    const body = rw.createRigidBody(R.RigidBodyDesc.dynamic());
    rw.createCollider(R.ColliderDesc.ball(0.5), body);
    const e = ent(1, DYNAMIC, body);
    body.setLinvel({ x: 3, y: 0, z: 0 }, true); body.sleep();
    placer.place(e, { at: [0, 5, 0] }, { keep: true });
    assert.equal(body.isSleeping(), false);
    assert.deepEqual({ ...body.translation() }, { x: 0, y: 5, z: 0 });
    assert.equal(body.linvel().x, 3);
    assert.equal(e[INTERNAL].awake, 1);
    placer.place(e, { at: [0, 6, 0] });
    assert.deepEqual({ ...body.linvel() }, { x: 0, y: 0, z: 0 });
  } finally { rw.free(); }
});
test('a kinematic body gets its next pose; a fixed body moves its colliders at once', () => {
  const { placer, ent, rw } = rig();
  try {
    const k = rw.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    placer.place(ent(1, KINEMATIC, k), { at: [2, 0, 0] });
    assert.deepEqual({ ...k.nextTranslation() }, { x: 2, y: 0, z: 0 });
    const f = rw.createRigidBody(R.RigidBodyDesc.fixed()), c = rw.createCollider(R.ColliderDesc.ball(1), f);
    placer.place(ent(2, FIXED, f), { at: [5, 0, 0] });
    assert.deepEqual({ ...c.translation() }, { x: 5, y: 0, z: 0 }, 'no step needed for queries to see it');
  } finally { rw.free(); }
});
test('socket and xfPrev fill caller-owned out objects', () => {
  const { placer, ent, pool, rw } = rig(), e = ent(1);
  try {
    e.sockets = Object.freeze({ hat: Object.freeze({ p: [0, 0, 1], q: [0, 0, 0, 1], part: 'body' }) });
    placer.place(e, { at: [1, 0, 0] }, { yaw: Math.PI / 2 });
    const out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
    assert.equal(placer.socket(e, 'hat', out), out);
    near(out.p.x, 2); near(out.p.y, 0); near(out.p.z, 0, 1e-12);
    near(out.q.y, Math.SQRT1_2);
    assert.throws(() => placer.socket(e, 'cap', out), /world\.socket: entity 1 has no socket 'cap'/);
    pool.write(e[INTERNAL].slot, PREV, { x: 7, y: 7, z: 7 }, { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(placer.xfPrev(e).p, { x: 7, y: 7, z: 7 });
  } finally { rw.free(); }
});
test('bad targets and foreign or dead entities throw', () => {
  const { placer, ent, rw } = rig(), e = ent(1);
  try {
    assert.throws(() => placer.place(e, { at: [1, 2] }), /world\.place: at must be \[x, y, z\]/);
    assert.throws(() => placer.place(e, {}), /world\.place: target must be \{ at: \[x, y, z\] \} or \{ rel: entity, local: \[x, y, z\] \}/);
    assert.throws(() => placer.place(e, { at: [0, 0, 0] }, { q: [0, 0, 0, 0] }), /world\.place: q must be a non-zero \[x, y, z, w\]/);
    assert.throws(() => placer.place(e, { at: [0, 0, 0] }, { yaw: NaN }), /world\.place: yaw must be a finite number/);
    assert.throws(() => placer.place({ id: 9 }, { at: [0, 0, 0] }), /world\.place: not a live entity of this World/);
    const other = { id: 3 }; Object.defineProperty(other, INTERNAL, { value: { world: {}, slot: 0, kind: BODILESS, dead: false } });
    assert.throws(() => placer.place(other, { at: [0, 0, 0] }), /not a live entity of this World/);
    const noXf = { id: 4 }; Object.defineProperty(noXf, INTERNAL, { value: { world: TOKEN, slot: -1, kind: BODILESS, dead: false } });
    assert.throws(() => placer.place(noXf, { at: [0, 0, 0] }), /world\.place: entity 4 has no xf/);
  } finally { rw.free(); }
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-place.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/world/place.js`.

- [ ] **Step 3: Implement** `src/sim/world/place.js`:

```js
// E-8 (overview §4.4): place moves an entity and its body together. It writes prev AND curr, so the view does not
// smear across the jump; a body is woken, stopped unless `keep`, given its next kinematic pose, or (fixed) has its
// colliders moved at once so queries see it before the next step. socket/xfPrev read the pool into out objects.
// Nothing here allocates unless the caller omits `out`.
import { PREV, CURR, INTERNAL, DYNAMIC, KINEMATIC, FIXED } from './pool.js';
import { rotate, qmul, qFromYaw, qnorm } from '../../core/math.js';

const NO_OPTS = Object.freeze({}), ORIGIN = Object.freeze([0, 0, 0]), ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export function createPlacer(pool, rapier, world) {
  const P = { x: 0, y: 0, z: 0 }, Q = { x: 0, y: 0, z: 0, w: 1 }, RP = { x: 0, y: 0, z: 0 }, RQ = { x: 0, y: 0, z: 0, w: 1 };
  const L = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0, w: 1 };
  const live = (e, what) => {
    const r = e?.[INTERNAL];
    if (!r || r.world !== world || r.dead) throw new Error(`world.${what}: not a live entity of this World`);
    if (r.slot < 0) throw new Error(`world.${what}: entity ${e.id} has no xf (spawn it with a body or xf: true)`);
    return r;
  };
  function place(e, target, opts = NO_OPTS) {
    const r = live(e, 'place'), { yaw, q, keep = false } = opts, rel = target?.rel;
    pool.read(r.slot, CURR, P, Q); // defaults: stay as it is
    if (rel !== undefined) {
      const o = live(rel, 'place'), local = target.local ?? ORIGIN;
      if (!isVec(local, 3)) throw new Error('world.place: local must be [x, y, z]');
      pool.read(o.slot, CURR, RP, RQ);
      L.x = local[0]; L.y = local[1]; L.z = local[2];
      rotate(RQ, L, P); P.x += RP.x; P.y += RP.y; P.z += RP.z;
    } else if (target?.at !== undefined) {
      if (!isVec(target.at, 3)) throw new Error('world.place: at must be [x, y, z]');
      P.x = target.at[0]; P.y = target.at[1]; P.z = target.at[2];
    } else throw new Error('world.place: target must be { at: [x, y, z] } or { rel: entity, local: [x, y, z] }');
    if (q != null) {
      if (!isVec(q, 4) || Math.hypot(q[0], q[1], q[2], q[3]) === 0) throw new Error('world.place: q must be a non-zero [x, y, z, w]');
      Q.x = q[0]; Q.y = q[1]; Q.z = q[2]; Q.w = q[3];
    } else if (yaw !== undefined) {
      if (!Number.isFinite(yaw)) throw new Error('world.place: yaw must be a finite number');
      qFromYaw(yaw, Q);
    } else if (rel !== undefined) { Q.x = 0; Q.y = 0; Q.z = 0; Q.w = 1; }
    if (rel !== undefined) qmul(RQ, Q, Q); // relative rotation: the other's, then the given one
    qnorm(Q);
    pool.write(r.slot, PREV, P, Q); pool.write(r.slot, CURR, P, Q);
    const b = e.body;
    if (b) {
      b.setTranslation(P, true); b.setRotation(Q, true);
      if (r.kind === KINEMATIC) { b.setNextKinematicTranslation(P); b.setNextKinematicRotation(Q); }
      else if (r.kind === DYNAMIC && !keep) { b.setLinvel(ZERO, true); b.setAngvel(ZERO, true); }
      else if (r.kind === FIXED) rapier()?.propagateModifiedBodyPositionsToColliders();
      r.awake = 1; // read it after the next step even if Rapier sleeps it straight away
    }
    return e;
  }
  function socket(e, name, out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }) {
    const r = live(e, 'socket'), s = e.sockets && Object.hasOwn(e.sockets, name) ? e.sockets[name] : undefined;
    if (!s) throw new Error(`world.socket: entity ${e.id} has no socket '${name}'`);
    pool.read(r.slot, CURR, P, Q);
    L.x = s.p[0]; L.y = s.p[1]; L.z = s.p[2];
    rotate(Q, L, out.p); out.p.x += P.x; out.p.y += P.y; out.p.z += P.z;
    T.x = s.q[0]; T.y = s.q[1]; T.z = s.q[2]; T.w = s.q[3];
    qmul(Q, T, out.q);
    return out;
  }
  function xfPrev(e, out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }) {
    const r = live(e, 'xfPrev');
    pool.read(r.slot, PREV, out.p, out.q);
    return out;
  }
  return { place, socket, xfPrev };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-place.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the no-smear test red by mutation**

Temporarily delete `pool.write(r.slot, PREV, P, Q);`. Run the file: the first test FAILS (`prev` differs from `curr`). Revert; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/world/place.js test/world-place.test.mjs
git commit -m "feat(world): place writes prev and curr and moves bodies with their colliders (E-8)"
```

---

## Task 7: Contact and sensor events (M-5)

**Files:**
- Create: `src/sim/physics/events.js`
- Create: `test/physics-events.test.mjs`

**Interfaces:**
- Produces: `createEventDrain({ emit, hz, entityOf, materialOf }) → drain(rapierWorld, queue)`. `drain` empties the queue: first every contact-force event as `emit('contact', { a, b, materials: [ma, mb], impulse, point: [x, y, z] })`, then every collision event that involves a sensor as `emit('sensor', { sensor, other, on })`. `a`, `b`, `sensor`, `other` are entity ids or `null` (a raw collider with no entity); `materials[i]` is the id or `null`; `impulse = totalForceMagnitude / hz`; `point` is the first solver contact of `rapierWorld.contactPair`, else the midpoint of the two colliders' parents (or the colliders).
- Consumed by: `world.js` (`sys.events`, Task 10).

- [ ] **Step 1: Write the failing test** `test/physics-events.test.mjs`:

```js
// M-5: contact-force events become `contact` with entity ids, materials, impulse and a contact point; sensor
// collision events become `sensor`. Drain order is Rapier's (deterministic): contacts first, then sensors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventDrain } from '../src/sim/physics/events.js';
import { R } from './fixtures/phys/rapier.js';

function rig() {
  const w = new R.World({ x: 0, y: -9.81, z: 0 }), q = new R.EventQueue(true), map = new Map(), out = [];
  w.timestep = 1 / 60;
  const drain = createEventDrain({ emit: (type, d) => out.push({ type, ...d }), hz: 60, entityOf: h => map.get(h)?.e, materialOf: h => map.get(h)?.m });
  const step = n => { for (let i = 0; i < n; i++) { w.step(q); drain(w, q); } };
  return { w, q, map, out, step, free: () => { q.free(); w.free(); } };
}
const ground = r => r.w.createCollider(R.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(0, -0.5, 0));
const ball = (r, flags, threshold) => {
  const b = r.w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(1, 1, 0));
  const d = R.ColliderDesc.ball(0.5);
  if (flags) d.setActiveEvents(flags);
  if (threshold !== undefined) d.setContactForceEventThreshold(threshold);
  return r.w.createCollider(d, b);
};

test('a ball landing emits contact with ids, materials in a/b order, impulse = force / hz and the solver point', () => {
  const r = rig();
  try {
    const g = ground(r), c = ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 0.5 * 60);
    r.map.set(g.handle, { e: { id: 1 }, m: 'grip' }); r.map.set(c.handle, { e: { id: 2 }, m: 'rubber' });
    r.step(90);
    const hits = r.out.filter(x => x.type === 'contact');
    assert.ok(hits.length >= 1, 'the landing is above 0.5 N·s');
    const h = hits[0], mat = { 1: 'grip', 2: 'rubber' };
    assert.deepEqual([h.a, h.b].sort(), [1, 2]);
    assert.deepEqual(h.materials, [mat[h.a], mat[h.b]]);
    assert.ok(h.impulse >= 0.5, `impulse ${h.impulse}`);
    assert.ok(Math.abs(h.point[0] - 1) < 0.05 && Math.abs(h.point[1]) < 0.05 && Math.abs(h.point[2]) < 0.05, `point ${h.point}`);
  } finally { r.free(); }
});
test('no events below the threshold or without the flag', () => {
  const r = rig();
  try {
    ground(r); ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 1000 * 60);
    const quiet = rig(); ground(quiet); ball(quiet);
    r.step(90); quiet.step(90);
    assert.deepEqual(r.out, []); assert.deepEqual(quiet.out, []);
    quiet.free();
  } finally { r.free(); }
});
test('a raw collider without an entity reports null ids and materials', () => {
  const r = rig();
  try {
    ground(r); ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 0);
    r.step(90);
    const h = r.out.find(x => x.type === 'contact');
    assert.deepEqual([h.a, h.b, ...h.materials], [null, null, null, null]);
  } finally { r.free(); }
});
test('a ball falling through a sensor emits sensor on, then off', () => {
  const r = rig();
  try {
    const s = r.w.createCollider(R.ColliderDesc.cuboid(2, 0.5, 2).setTranslation(1, -2, 0).setSensor(true).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS));
    const c = ball(r);
    r.map.set(s.handle, { e: { id: 5 }, m: 'air' }); r.map.set(c.handle, { e: { id: 6 }, m: 'rubber' });
    r.step(120);
    assert.deepEqual(r.out.map(x => [x.type, x.sensor, x.other, x.on]), [['sensor', 5, 6, true], ['sensor', 5, 6, false]]);
  } finally { r.free(); }
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-events.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/physics/events.js`.

- [ ] **Step 3: Implement** `src/sim/physics/events.js`:

```js
// M-5 (overview §4.5): after each step, contact-force events become `contact` and collision events on sensors become
// `sensor`. Order: every contact in Rapier's drain order, then every sensor event in Rapier's drain order; both are
// deterministic. The drain callbacks are made once per World, so a step with no events allocates nothing here.
// a/b/sensor/other are entity ids, or null for a raw collider the World does not own.
export function createEventDrain({ emit, hz, entityOf, materialOf }) {
  let rw = null;
  const S = { found: false, x: 0, y: 0, z: 0 };
  const idOf = h => entityOf(h)?.id ?? null;
  const onManifold = m => {
    if (S.found || m.numSolverContacts() === 0) return;
    const p = m.solverContactPoint(0);
    S.x = p.x; S.y = p.y; S.z = p.z; S.found = true;
  };
  const onForce = ev => {
    const h1 = ev.collider1(), h2 = ev.collider2(), c1 = rw.getCollider(h1), c2 = rw.getCollider(h2);
    S.found = false; S.x = 0; S.y = 0; S.z = 0;
    if (c1 && c2) {
      rw.contactPair(c1, c2, onManifold);
      if (!S.found) { // no solver contact this step: the midpoint of the two bodies (or bodiless colliders)
        const a = (c1.parent() ?? c1).translation(), b = (c2.parent() ?? c2).translation();
        S.x = (a.x + b.x) / 2; S.y = (a.y + b.y) / 2; S.z = (a.z + b.z) / 2;
      }
    }
    emit('contact', { a: idOf(h1), b: idOf(h2), materials: [materialOf(h1) ?? null, materialOf(h2) ?? null], impulse: ev.totalForceMagnitude() / hz, point: [S.x, S.y, S.z] });
  };
  const onCollision = (h1, h2, started) => {
    if (rw.getCollider(h1)?.isSensor()) emit('sensor', { sensor: idOf(h1), other: idOf(h2), on: started });
    else if (rw.getCollider(h2)?.isSensor()) emit('sensor', { sensor: idOf(h2), other: idOf(h1), on: started });
  };
  return (world, queue) => {
    rw = world;
    try { queue.drainContactForceEvents(onForce); queue.drainCollisionEvents(onCollision); } finally { rw = null; }
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-events.test.mjs`
Expected: PASS, 4 tests. If the sensor test sees no `off` event within 120 steps (the ball is still inside), raise the step count to 180 and note it; do not move the sensor.

- [ ] **Step 5: Commit**

```bash
git add src/sim/physics/events.js test/physics-events.test.mjs
git commit -m "feat(physics): contact and sensor events drained in Rapier order (M-5)"
```

---

## Task 8: Colliders: shapes, material precedence, combine rules (M-4, M-9, D4)

**Files:**
- Create: `src/sim/physics/colliders.js`
- Create: `test/physics-colliders.test.mjs`

**Interfaces:**
- Consumes: the registry contract `collider(id) → { friction: √f, restitution, density }` (§4.2).
- Produces:
  - `shapeDesc(R, entry) → ColliderDesc` for `box` (`half`, optional `round` → Rapier `roundCuboid`, controller ruling for Rally's car hull), `sphere` (`r`; `'ball'` is not accepted, 3b ruling), `capsule` and `cylinder` (`halfHeight`, `r`, along the local y axis), `hull` (`points`, at least 4), `mesh` (`vertices`, `indices`). Throws `unknown collider shape '<s>'` and dimension errors (the World prefixes them).
  - `materialFor(entry, overrides) → id`: `overrides[part]`, else `overrides['*']`, else `entry.material` (part defaults to `'body'`).
  - `applyMaterial(R, desc, m, density) → desc`: friction `m.friction` with `Multiply`, restitution `m.restitution` with `Max`, the given density.
- Consumed by: `world.js` (spawn, heightfield, setMaterial).

- [ ] **Step 1: Write the failing test** `test/physics-colliders.test.mjs`:

```js
// M-4, M-9, D4: every engine collider carries √f with Multiply (so two engine colliders meet at the geometric mean
// of their materials) and restitution with Max; shapes map one to one onto Rapier's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeDesc, materialFor, applyMaterial } from '../src/sim/physics/colliders.js';
import MATERIALS from './fixtures/phys/materials.js';
import { R } from './fixtures/phys/rapier.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const withWorld = fn => { const w = new R.World({ x: 0, y: -9.81, z: 0 }); w.timestep = 1 / 60; try { return fn(w); } finally { w.free(); } };

test('each sidecar shape becomes the matching Rapier shape', () => withWorld(w => {
  const T = R.ShapeType, make = e => w.createCollider(shapeDesc(R, e));
  const box = make({ shape: 'box', half: [1, 2, 3] });
  assert.equal(box.shapeType(), T.Cuboid); assert.deepEqual({ ...box.halfExtents() }, { x: 1, y: 2, z: 3 });
  assert.equal(make({ shape: 'sphere', r: 0.5 }).radius(), 0.5);
  const rb = make({ shape: 'box', half: [1, 0.5, 2], round: 0.1 });
  assert.equal(rb.shapeType(), T.RoundCuboid); assert.equal(rb.roundRadius(), Math.fround(0.1));
  const cap = make({ shape: 'capsule', halfHeight: 1, r: 0.5 });
  assert.equal(cap.shapeType(), T.Capsule); assert.equal(cap.halfHeight(), 1);
  assert.equal(make({ shape: 'cylinder', halfHeight: 0.5, r: 0.5 }).shapeType(), T.Cylinder);
  assert.equal(make({ shape: 'hull', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }).shapeType(), T.ConvexPolyhedron);
  assert.equal(make({ shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] }).shapeType(), T.TriMesh);
}));
test('bad shapes throw before Rapier sees them', () => {
  assert.throws(() => shapeDesc(R, { shape: 'cone' }), /unknown collider shape 'cone'/);
  assert.throws(() => shapeDesc(R, { shape: 'ball', r: 1 }), /unknown collider shape 'ball'/);
  assert.throws(() => shapeDesc(R, { shape: 'box', half: [1, 1, 1], round: -0.1 }), /box round must be > 0/);
  assert.throws(() => shapeDesc(R, { shape: 'box', half: [1, 0, 1] }), /box half must be three sizes > 0/);
  assert.throws(() => shapeDesc(R, { shape: 'sphere', r: -1 }), /sphere r must be > 0 \(got -1\)/);
  assert.throws(() => shapeDesc(R, { shape: 'hull', points: [0, 0, 0, 1, 0, 0] }), /hull needs at least 4 points/);
  assert.throws(() => shapeDesc(R, { shape: 'mesh', vertices: [0, 0, 0], indices: [0] }), /mesh needs vertices and triangle indices/);
});
test('material precedence: the part override, then *, then the entry (spec §2.2)', () => {
  const wheel = { part: 'wheel', material: 'steel' }, body = { material: 'shell' };
  assert.equal(materialFor(wheel, undefined), 'steel');
  assert.equal(materialFor(wheel, { '*': 'wood' }), 'wood');
  assert.equal(materialFor(wheel, { '*': 'wood', wheel: 'rubber' }), 'rubber');
  assert.equal(materialFor(body, { wheel: 'rubber' }), 'shell');
  assert.equal(materialFor(body, { body: 'ice' }), 'ice', "an entry without part is the 'body' part");
});
test('applyMaterial sets √f with Multiply, restitution with Max, and the density', () => withWorld(w => {
  const c = w.createCollider(applyMaterial(R, shapeDesc(R, { shape: 'sphere', r: 1 }), MATERIALS.collider('grip'), 1234));
  near(c.friction(), 0.9, 1e-6);
  assert.equal(c.frictionCombineRule(), R.CoefficientCombineRule.Multiply);
  assert.equal(c.restitutionCombineRule(), R.CoefficientCombineRule.Max);
  assert.equal(c.density(), 1234);
}));
test('a slick block on grip decelerates at the geometric mean of the two frictions (M-8 via M-9)', () => withWorld(w => {
  const mk = (id, desc) => applyMaterial(R, desc, MATERIALS.collider(id), MATERIALS.density(id));
  w.createCollider(mk('grip', shapeDesc(R, { shape: 'box', half: [50, 0.5, 50] }).setTranslation(0, -0.5, 0)));
  const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.5, 0).lockRotations());
  w.createCollider(mk('slick', shapeDesc(R, { shape: 'box', half: [0.5, 0.5, 0.5] })), b);
  for (let i = 0; i < 10; i++) w.step();
  b.setLinvel({ x: 5, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) w.step();
  const mu = Math.sqrt(0.81 * 0.25), want = 5 - mu * 9.81 * 0.5; // 0.45: Average 0.7, Min 0.5 and Max 0.9 all miss
  near(b.linvel().x, want, 0.05);
}));
test('restitution takes the larger: a bouncy ball rebounds off a dead floor', () => withWorld(w => {
  const mk = (id, desc) => applyMaterial(R, desc, MATERIALS.collider(id), MATERIALS.density(id));
  w.createCollider(mk('grip', shapeDesc(R, { shape: 'box', half: [5, 0.5, 5] }).setTranslation(0, -0.5, 0)));
  const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  w.createCollider(mk('bouncy', shapeDesc(R, { shape: 'sphere', r: 0.25 })), b);
  let landed = false, peak = 0;
  for (let i = 0; i < 180; i++) { w.step(); const v = b.linvel().y, y = b.translation().y; if (v > 0) landed = true; if (landed) peak = Math.max(peak, y); }
  assert.ok(peak > 0.25 + 0.5 * 1.75, `rebound peak ${peak}: Multiply (0) or Average (0.4) would stay lower`);
}));
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/physics-colliders.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/physics/colliders.js`.

- [ ] **Step 3: Implement** `src/sim/physics/colliders.js`:

```js
// Colliders from sidecar or inline entries (overview §4.3, §4.5): { shape, ...dims, p?, q?, part?, material }.
// Materials on colliders (M-4, M-9, D4): friction √f with Multiply gives two engine colliders the geometric mean of
// their materials; restitution with Max gives the larger; density comes from the registry. Rapier keeps the
// higher-priority rule when two colliders disagree (Average < Min < Multiply < Max), so a raw game collider that sets
// Max still wins; world.audit() lists such colliders for the debug hook.
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (v, what) => { if (!(Number.isFinite(v) && v > 0)) throw new Error(`${what} must be > 0 (got ${v})`); return v; };

export function shapeDesc(R, c) {
  const D = R.ColliderDesc;
  switch (c.shape) {
    case 'box':
      if (!isVec(c.half, 3) || !c.half.every(h => h > 0)) throw new Error(`box half must be three sizes > 0 (got ${JSON.stringify(c.half)})`);
      if (c.round !== undefined) return D.roundCuboid(c.half[0], c.half[1], c.half[2], positive(c.round, 'box round'));
      return D.cuboid(c.half[0], c.half[1], c.half[2]);
    case 'sphere': return D.ball(positive(c.r, 'sphere r'));
    case 'capsule': return D.capsule(positive(c.halfHeight, 'capsule halfHeight'), positive(c.r, 'capsule r'));
    case 'cylinder': return D.cylinder(positive(c.halfHeight, 'cylinder halfHeight'), positive(c.r, 'cylinder r'));
    case 'hull': {
      const n = c.points?.length ?? 0;
      if (n % 3 !== 0 || n < 12) throw new Error(`hull needs at least 4 points as [x, y, z, ...] (got ${n} numbers)`);
      return D.convexHull(Float32Array.from(c.points));
    }
    case 'mesh': {
      const nv = c.vertices?.length ?? 0, ni = c.indices?.length ?? 0;
      if (nv % 3 !== 0 || nv < 9 || ni % 3 !== 0 || ni < 3) throw new Error(`mesh needs vertices and triangle indices (got ${nv} vertex numbers, ${ni} indices)`);
      return D.trimesh(Float32Array.from(c.vertices), Uint32Array.from(c.indices));
    }
    default: throw new Error(`unknown collider shape '${c.shape}'`);
  }
}

// The collider's material: the spawn's override for its part, then the spawn's '*', then the entry's own (spec §2.2).
export function materialFor(entry, overrides) {
  const part = entry.part ?? 'body';
  if (overrides) {
    if (Object.hasOwn(overrides, part)) return overrides[part];
    if (Object.hasOwn(overrides, '*')) return overrides['*'];
  }
  return entry.material;
}

// m = registry.collider(id): { friction: √f, restitution, density }
export function applyMaterial(R, desc, m, density) {
  const rule = R.CoefficientCombineRule;
  return desc.setFriction(m.friction).setFrictionCombineRule(rule.Multiply)
    .setRestitution(m.restitution).setRestitutionCombineRule(rule.Max)
    .setDensity(density);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/physics-colliders.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the slide test red by mutation**

Temporarily use `rule.Average` for friction. Run the file: the slide test FAILS (≈1.57 m/s instead of ≈2.79) and the `applyMaterial` test fails on the rule. Revert; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/physics/colliders.js test/physics-colliders.test.mjs
git commit -m "feat(physics): colliders from sidecar entries with √f/Multiply and Max combine rules (M-4, M-9, D4)"
```

---
## Task 9: The World: entities, queries, bodies, colliders, mass, joints (E-1…E-9) **(judgment)**

**Files:**
- Create: `src/sim/world/world.js`
- Create: `test/world-entities.test.mjs`, `test/world-bodies.test.mjs`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6, 8; `core/math.js` (`qFromYaw`, `qnorm`); the registry contract (`has`, `collider`); the sidecar contract (`models[id].colliders`, `.sockets`).
- Produces: `createWorld(engine, opts = {}) → world`. `engine` supplies `game.sim.hz`, `game.physics` (`rapier`, `gravity`, `params`, `groups`), `game.defs` (`materials`, `models` = the `phys.json` object), `seed`, `emit`. `opts` may override each: `{ seed, timer, rapier, materials, models, gravity, params, groups }`. The World (§4.4, with this task's members):
  - `engine` (the engine it was made for; 3h C1), `net` (writable slot, `null`; 3i), `spawn(desc) → e`, `despawn(e)`, `place(e, target, opts)`, `with(...parts)` (0–4 parts; no parts = every live entity), `get(id)`, `add(e, part, value)`, `remove(e, part)`, `clear()`, `dispose()`, `socket(e, name, out)`, `xfPrev(e, out)`, `materialOf(handle)`, `entityOf(handle)`, `setMaterial(e, part | '*', id)`, `joint(a, b, jointData) → ImpulseJoint`, `own(e, freeFn) → off` (on despawn, clear, dispose; before Rapier objects go) and `own(freeFn) → off` (World-scoped: on clear and dispose, before the Rapier world is freed; 3h C3), `onSpawn(fn) → off`, `onDespawn(fn) → off`;
  - `groups`, `rapier` (getter: the current `RAPIER.World` or `null`), `R`, `materials`, `serial`, `seed`, `stats` (`entities`, `bodies`, `colliders`, `stepMs`, `stepMsTotal`), `xf` (`{ pool, stride: 14 }`, `pool` a getter), `disposed`.
  - Entity: `{ id, tags: Set, model?, body?, colliders?: [{ collider, part, material }], xf?: { p, q, slot }, sockets?, ...game fields }`.
  - Pinned for 3g (its Task 14 tests them): `world.with('xf')` is the live query of every entity with a transform (body entities and `xf: true` ones), and `world.xfPrev(e, out)` fills `out = { p: { x, y, z }, q: { x, y, z, w } }` with the previous step's pose from the E-10 pool; the current pose is `e.xf` (`e.xf.p`, `e.xf.q`).
- Decisions this task makes (state them in the notes):
  1. Inline or sidecar colliders with no `body` sit on a **fixed** body (so `place`, `xf` and `entityOf` work the same for static scenery).
  2. `body.lock: { rot: true }` locks every rotation; `body.lock: { x, y, z }` locks rotation about the named axes (`true` = locked). Translation locks stay raw Rapier (L-1).
  3. An omitted `groups.member`/`groups.filter` means every group (Rapier's default).
  4. Everything that can throw is checked before any Rapier object is created, and before the id is taken.
  5. Desc keys the World consumes (`model`, `colliders`, `body`, `groups`, `at`, `yaw`, `q`, `tags`, `xf`, `contacts`, `sensor`) are not copied; every other key (`material`, `net`, `netId`, `owner`, `input`, `paint`, `scale`, `draw`, game data) is copied onto the entity as given (E-4). `id` and `sockets` may not be given.
  6. `add`/`remove` refuse `id`, `tags`, `model`, `body`, `colliders`, `sockets`, `heightfield`; `xf` may be added to or removed from a bodiless entity (a slot is allocated or freed).
  7. A despawned entity keeps its id, tags and game fields, loses `body` and `colliders`, and keeps a frozen copy of its last pose as `xf` (no `slot`).

- [ ] **Step 1: Write the failing test** `test/world-entities.test.mjs`:

```js
// E-1…E-9 without Rapier objects: ids, live queries, despawn, add/remove, clear, dispose, hooks, serial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';

const make = (o = {}) => createWorld(stubEngine(o));

test('ids count from 1 in spawn order; tags are a Set; game fields copied, World keys consumed (E-1, E-4, D7)', () => {
  const w = make({ physics: false });
  const a = w.spawn({ tags: ['pig'], pig: { mood: 1 }, net: 'animal', netId: 12, xf: true, at: [1, 2, 3] });
  const b = w.spawn({ tags: ['pig', 'piglet'] });
  assert.deepEqual([a.id, b.id], [1, 2]);
  assert.ok(a.tags instanceof Set && a.tags.has('pig'));
  assert.deepEqual(a.pig, { mood: 1 }); assert.equal(a.net, 'animal'); assert.equal(a.netId, 12);
  assert.equal('at' in a, false);
  assert.deepEqual({ ...a.xf.p }, { x: 1, y: 2, z: 3 });
  assert.equal(b.xf, undefined, 'no pool slot unless xf: true or a body');
  assert.equal(w.get(2), b); assert.equal(w.get(99), undefined);
  assert.deepEqual(Object.getOwnPropertySymbols(a).length, 1);
  assert.equal(JSON.stringify(Object.keys(a)), JSON.stringify(['id', 'tags', 'pig', 'net', 'netId', 'xf']), 'World internals are not enumerable');
  assert.throws(() => w.spawn({ tags: ['x'], id: 5 }), /world: 'x' may not set 'id' \(the World does\)/);
  assert.throws(() => w.spawn({ tags: 'pig' }), /world: 'entity' tags must be an array/);
  assert.equal(w.spawn({}).id, 3, 'a throwing spawn does not use up an id');
});
test('with() is live, cached and in id order; no parts means every entity (E-3)', () => {
  const w = make({ physics: false });
  const q = w.with('pig'), q2 = w.with('pig', 'net');
  const a = w.spawn({ pig: {} }), b = w.spawn({ pig: {}, net: 'animal' }), c = w.spawn({ cow: {} });
  assert.equal(w.with('pig'), q, 'same array every call');
  assert.deepEqual(q.map(e => e.id), [1, 2]);
  assert.deepEqual(q2.map(e => e.id), [2]);
  assert.deepEqual(w.with('pig', 'net').map(e => e.id), [2]);
  assert.deepEqual(w.with().map(e => e.id), [1, 2, 3]);
  w.add(c, 'pig', {}); // an older entity joins in id order, not at the end
  const d = w.spawn({ pig: {} });
  w.remove(a, 'pig');
  assert.deepEqual(q.map(e => e.id), [2, 3, 4]);
  w.add(a, 'pig', { back: true });
  assert.deepEqual(q.map(e => e.id), [1, 2, 3, 4]);
  w.despawn(b);
  assert.deepEqual(q.map(e => e.id), [1, 3, 4]); assert.deepEqual(q2, []);
  assert.throws(() => w.with('a', 'b', 'c', 'd', 'e'), /world\.with: at most 4 parts/);
  assert.equal(d.id, 4);
});
test('despawn keeps a frozen last pose; the next spawn reuses the lowest slot; despawn is idempotent (E-7)', () => {
  const w = make({ physics: false });
  const a = w.spawn({ tags: ['a'], xf: true, at: [5, 0, 0] }), b = w.spawn({ tags: ['b'], xf: true });
  const slot = a.xf.slot;
  w.despawn(a); w.despawn(a);
  assert.equal(w.get(1), undefined); assert.equal(w.stats.entities, 1);
  const c = w.spawn({ tags: ['c'], xf: true, at: [9, 9, 9] });
  assert.equal(c.xf.slot, slot, 'lowest free slot');
  assert.deepEqual({ ...a.xf.p }, { x: 5, y: 0, z: 0 }, 'the despawned pose did not follow the reused slot');
  assert.equal(a.xf.slot, undefined);
  assert.ok(Object.isFrozen(a.xf.p));
  assert.equal(a.tags.has('a'), true);
  assert.throws(() => w.place(a, { at: [0, 0, 0] }), /world\.place: not a live entity of this World/);
  assert.equal(b.id, 2);
});
test('add/remove: World parts are fixed; xf can be given to and taken from a bodiless entity', () => {
  const w = make({ physics: false }), e = w.spawn({ tags: ['m'] });
  for (const p of ['id', 'tags', 'model', 'body', 'colliders', 'sockets']) assert.throws(() => w.add(e, p, 1), new RegExp(`world\\.add: '${p}' cannot be added after spawn`));
  assert.throws(() => w.remove(e, 'body'), /world\.remove: 'body' cannot be removed \(despawn the entity\)/);
  assert.throws(() => w.add(e, 'pig', undefined), /world\.add: 'pig' needs a value/);
  const xq = w.with('xf');
  w.add(e, 'xf', true);
  assert.equal(xq[0], e); assert.equal(typeof e.xf.slot, 'number');
  e.xf.p.x = 2;
  w.remove(e, 'xf');
  assert.equal(e.xf, undefined); assert.deepEqual(xq, []);
  w.remove(e, 'pig'); // absent: no-op
});
test('clear(): hooks and owned frees in reverse spawn order, ids restart, queries stay the same arrays, serial moves', () => {
  const w = make({ physics: false }), log = [], q = w.with('pig'), s0 = w.serial;
  w.onDespawn(e => log.push(`d${e.id}`));
  const a = w.spawn({ pig: {}, xf: true }); w.spawn({ pig: {} });
  w.own(a, () => log.push('own1'));
  w.own(() => log.push('world-own'));
  w.clear();
  assert.deepEqual(log, ['d2', 'd1', 'own1', 'world-own']);
  w.clear();
  assert.equal(log.length, 4, 'a world-scoped own runs once');
  assert.equal(q.length, 0); assert.equal(w.with('pig'), q);
  assert.ok(w.serial > s0);
  assert.equal(w.spawn({ pig: {} }).id, 1);
  assert.deepEqual(q.map(e => e.id), [1]);
});
test('dispose(): idempotent, changes serial, then refuses spawn; serials are unique across Worlds', () => {
  const w = make({ physics: false }), other = make({ physics: false }), s = w.serial;
  assert.notEqual(other.serial, s);
  w.dispose(); w.dispose();
  assert.equal(w.disposed, true); assert.ok(w.serial > other.serial);
  assert.throws(() => w.spawn({}), /world: disposed/);
  assert.throws(() => w.clear(), /world: disposed/);
});
test('onSpawn/onDespawn see each entity once; off stops them', () => {
  const w = make({ physics: false }), log = [];
  const off = w.onSpawn(e => log.push(`s${e.id}`)); w.onDespawn(e => log.push(`d${e.id}`));
  const a = w.spawn({}); off(); w.spawn({}); w.despawn(a);
  assert.deepEqual(log, ['s1', 'd1']);
});
test('the 3i net seam: world.net.guard sees net spawns, despawns and net part changes, never clear()', () => {
  const w = make({ physics: false }), log = [];
  assert.equal(w.net, null);
  w.spawn({ tags: ['plain'] }); // no net part: no guard call even with a slot
  w.net = { guard: (op, x, v) => { log.push([op, x.net ?? x.id, v]); if (x.netId === 13) throw new Error('net: guest may not spawn host kind'); } };
  const a = w.spawn({ net: 'animal', netId: 12 });
  assert.throws(() => w.spawn({ net: 'animal', netId: 13 }), /guest may not spawn/);
  assert.equal(w.stats.entities, 2, 'a refused spawn leaves nothing');
  const b = w.spawn({ tags: ['b'] });
  w.add(b, 'net', 'prop'); w.remove(b, 'net'); w.despawn(a); w.despawn(b);
  w.spawn({ net: 'animal', netId: 14 });
  const want = [['spawn', 'animal', undefined], ['spawn', 'animal', undefined], ['add', b.id, 'prop'], ['remove', 'prop', undefined], ['despawn', 'animal', undefined], ['spawn', 'animal', undefined]];
  assert.deepEqual(log, want, 'b has no net part when it despawns: no guard call');
  w.clear();
  assert.deepEqual(log, want, 'clear() never calls the guard');
});
test('without physics.rapier the World holds bodiless entities only (§4.1)', () => {
  const engine = stubEngine({ physics: false }), w = createWorld(engine);
  assert.equal(w.engine, engine, 'kits reach the engine through the World (3h)');
  assert.equal(w.rapier, null); assert.equal(w.R, null);
  assert.throws(() => w.spawn({ tags: ['pig'], body: 'dynamic' }), /world: 'pig' needs a body but the game has no physics\.rapier/);
  assert.throws(() => w.spawn({ model: 'crate' }), /world: 'crate' needs a body but the game has no physics\.rapier/);
});
```

`test/world-bodies.test.mjs`:

```js
// E-5, M-4, M-6, D3: spawn makes the body and its colliders in the same call, with registry materials, group masks,
// event flags and mass from density (or scaled to body.mass, or massProps); despawn frees every Rapier object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { R } from './fixtures/phys/rapier.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };

const near = (a, b, rel) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);
const count = w => { let b = 0, c = 0; w.rapier.forEachRigidBody(() => b++); w.rapier.forEachCollider(() => c++); return { b, c }; };
const make = o => createWorld(stubEngine(o));

test('a model spawns its sidecar colliders on one body; mass from density matches the sidecar to 1 %', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'crate', body: 'dynamic', at: [1, 2, 3], yaw: 0.5, tags: ['crate'] });
    assert.equal(e.model, 'crate');
    assert.deepEqual({ ...e.body.translation() }, { x: 1, y: 2, z: 3 });
    assert.equal(e.colliders.length, 1);
    const [c] = e.colliders;
    assert.equal(c.part, 'body'); assert.equal(c.material, 'wood');
    near(e.body.mass(), PHYS.models.crate.mass.mass, 0.01);
    assert.equal(w.materialOf(c.collider.handle), 'wood');
    assert.equal(w.entityOf(c.collider.handle), e);
    assert.deepEqual({ ...w.stats }, { entities: 1, bodies: 1, colliders: 1, stepMs: 0, stepMsTotal: 0 });
    assert.deepEqual(Object.keys(e.sockets), []);
    assert.equal(w.spawn({ model: 'cart', body: 'dynamic' }).sockets.hat.part, 'body');
    assert.ok(Object.isFrozen(w.get(2).sockets.hat.p));
  } finally { w.dispose(); }
});
test('body.mass scales densities so the body weighs exactly that; the centre of mass stays geometric (D3)', () => {
  const w = make();
  try {
    const nat = w.spawn({ model: 'cart', body: 'dynamic' }), e = w.spawn({ model: 'cart', body: { type: 'dynamic', mass: 1400 } });
    near(e.body.mass(), 1400, 0.001);
    const a = nat.body.localCom(), b = e.body.localCom();
    assert.ok(Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4, 'com unchanged');
    near(nat.body.mass(), PHYS.models.cart.mass.mass, 0.01);
  } finally { w.dispose(); }
});
test('massProps sets mass, com and inertia exactly and zeroes collider density (D3, lh-allow)', () => {
  const w = make();
  try {
    const e = w.spawn({ tags: ['pig'], body: { type: 'dynamic', massProps: { mass: 60, com: [0, 0.1, 0], inertia: [2, 3, 4] } }, colliders: [{ shape: 'sphere', r: 0.3, material: 'pet' }] });
    near(e.body.mass(), 60, 1e-6);
    near(e.body.localCom().y, 0.1, 1e-6);
    near(e.body.principalInertia().z, 4, 1e-6);
    assert.equal(e.colliders[0].collider.density(), 0);
  } finally { w.dispose(); }
});
test('material overrides: the part, then *, then the sidecar; inline colliders replace the sidecar', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic', material: { '*': 'steel', wheel: 'rubber' } });
    assert.deepEqual(e.colliders.map(c => [c.part, c.material]), [['body', 'steel'], ['wheel', 'rubber']]);
    assert.deepEqual(e.material, { '*': 'steel', wheel: 'rubber' }, 'the material part stays on the entity');
    const i = w.spawn({ model: 'cart', body: 'dynamic', colliders: [{ shape: 'sphere', r: 1, material: 'ice' }] });
    assert.deepEqual(i.colliders.map(c => c.material), ['ice']);
    assert.equal(i.sockets.hat.part, 'body', 'sockets still come from the model');
  } finally { w.dispose(); }
});
test('colliders without a body sit on a fixed body; kinematic bodies work; lock and sleep reach Rapier', () => {
  const w = make();
  try {
    const wall = w.spawn({ tags: ['wall'], colliders: [{ shape: 'box', half: [1, 1, 1], material: 'steel' }], at: [3, 0, 0] });
    assert.equal(wall.body.isFixed(), true); assert.equal(typeof wall.xf.slot, 'number');
    assert.equal(w.spawn({ tags: ['lift'], body: 'kinematic', colliders: [{ shape: 'box', half: [1, 0.1, 1], material: 'steel' }] }).body.isKinematic(), true);
    const s = w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true, lock: { rot: true } }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }] });
    assert.equal(s.body.isSleeping(), true);
    s.body.applyTorqueImpulse({ x: 5, y: 5, z: 5 }, true);
    assert.deepEqual({ ...s.body.angvel() }, { x: 0, y: 0, z: 0 }, 'rotations locked');
  } finally { w.dispose(); }
});
test('groups, sensor and contact flags reach every collider', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic', groups: { member: ['vehicle'], filter: ['ground', 'static'] }, contacts: { min: 40 } });
    for (const { collider: c } of e.colliders) {
      assert.equal(c.collisionGroups(), w.groups.mask(['vehicle'], ['ground', 'static']));
      assert.equal(c.activeEvents(), R.ActiveEvents.CONTACT_FORCE_EVENTS);
      assert.equal(c.contactForceEventThreshold(), 40 * 60); // min × hz
    }
    const z = w.spawn({ tags: ['zone'], sensor: true, colliders: [{ shape: 'box', half: [2, 2, 2], material: 'air' }] });
    assert.equal(z.colliders[0].collider.isSensor(), true);
    assert.equal(z.colliders[0].collider.activeEvents(), R.ActiveEvents.COLLISION_EVENTS);
    assert.equal(w.spawn({ model: 'crate', body: 'dynamic' }).colliders[0].collider.collisionGroups(), 0xffffffff);
  } finally { w.dispose(); }
});
test('spawn errors name the desc and leave nothing behind', () => {
  const w = make();
  try {
    const before = count(w), ball = (m, extra = {}) => ({ tags: ['pig'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.3, material: 'pet' }, { shape: 'sphere', r: 0.3, part: 'snout', material: m }], ...extra });
    assert.throws(() => w.spawn(ball('fluff')), /world: 'pig' unknown material 'fluff' on collider 1 \(snout\)/);
    assert.throws(() => w.spawn({ model: 'tractr' }), /world: 'tractr' unknown model 'tractr'/);
    assert.throws(() => w.spawn(ball('air')), /world: 'pig' collider 1 \(snout\) has zero density \('air'\) on a dynamic body without massProps/);
    assert.throws(() => w.spawn(ball('pet', { groups: { member: ['pigs'] } })), /world: 'pig' group 'pigs' is not declared/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'dynamic', mass: 1, massProps: { mass: 1, com: [0, 0, 0], inertia: [1, 1, 1] } } })), /body takes mass or massProps, not both/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'dynamic', masss: 1 } })), /world: 'pig' body\.masss is not a body option/);
    assert.throws(() => w.spawn(ball('pet', { body: { type: 'kinematic', mass: 5 } })), /body\.mass needs a dynamic body/);
    assert.throws(() => w.spawn({ tags: ['ghost'], body: 'dynamic' }), /world: 'ghost' a dynamic body needs colliders or massProps/);
    assert.throws(() => w.spawn(ball('pet', { material: 'steel' })), /material must be \{ part: id \}/);
    assert.throws(() => w.spawn({ tags: ['rock'], colliders: [{ shape: 'cone', material: 'steel' }] }), /world: 'rock' collider 0 \(body\): unknown collider shape 'cone'/);
    assert.deepEqual(count(w), before);
    assert.equal(w.stats.entities, 0);
    assert.equal(w.spawn(ball('pet')).id, 1);
  } finally { w.dispose(); }
});
test('a collider needs a registry: without one the spawn says so', () => {
  const w = createWorld(stubEngine({ materials: null }));
  try { assert.throws(() => w.spawn({ model: 'crate', body: 'dynamic' }), /world: 'crate' collider 0 \(body\) needs a material registry: set defs\.materials/); } finally { w.dispose(); }
});
test('despawn frees the body, its colliders and owned joints; maps and counters follow (E-7)', () => {
  const w = make();
  try {
    const a = w.spawn({ model: 'cart', body: 'dynamic', tags: ['cart'] }), b = w.spawn({ model: 'crate', body: 'dynamic', at: [-2, 0, 0], tags: ['tow'] });
    const h = a.colliders[0].collider.handle;
    const j = w.joint(a, b, R.JointData.spherical({ x: -1.2, y: 0.3, z: 0 }, { x: 0.8, y: 0.5, z: 0 }));
    assert.equal(j.isValid(), true);
    const freed = []; w.own(a, () => freed.push('first')); w.own(a, () => freed.push('second'));
    w.despawn(a);
    assert.equal(j.isValid(), false);
    assert.deepEqual(freed.slice(0, 2), ['second', 'first'], 'owned frees run newest first');
    assert.equal(w.rapier.getCollider(h), null);
    assert.equal(w.materialOf(h), undefined); assert.equal(w.entityOf(h), undefined);
    assert.equal(a.body, undefined); assert.equal(a.colliders, undefined);
    assert.deepEqual(count(w), { b: 1, c: 1 });
    assert.deepEqual({ ...w.stats, stepMs: 0, stepMsTotal: 0 }, { entities: 1, bodies: 1, colliders: 1, stepMs: 0, stepMsTotal: 0 });
    w.despawn(b); // its side of the joint is already gone: no double free
    assert.deepEqual(count(w), { b: 0, c: 0 });
    assert.throws(() => w.joint(a, b, R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })), /world\.joint: both entities need a body/);
  } finally { w.dispose(); }
});
test('setMaterial swaps friction and restitution; density changes recompute mass', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'crate', body: 'dynamic' });
    w.setMaterial(e, '*', 'ice');
    const c = e.colliders[0].collider;
    near(c.friction(), Math.sqrt(0.04), 1e-6);
    assert.equal(e.colliders[0].material, 'ice'); assert.equal(w.materialOf(c.handle), 'ice');
    near(e.body.mass(), 920, 1e-4);
    w.setMaterial(e, 'body', 'steel');
    near(e.body.mass(), 7850, 1e-4);
    assert.throws(() => w.setMaterial(e, 'wheel', 'ice'), /world\.setMaterial: entity 1 has no collider on part 'wheel'/);
    assert.throws(() => w.setMaterial(e, '*', 'mud'), /world\.setMaterial: unknown material 'mud'/);
    assert.throws(() => w.setMaterial(e, '*', 'air'), /world\.setMaterial: 'air' has zero density and entity 1 is dynamic without massProps/);
  } finally { w.dispose(); }
});
test('place and socket go through the World (E-8)', () => {
  const w = make();
  try {
    const e = w.spawn({ model: 'cart', body: 'dynamic' });
    w.place(e, { at: [0, 3, 0] }, { yaw: Math.PI });
    assert.equal(e.body.translation().y, 3);
    const s = w.socket(e, 'hat', { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    assert.ok(Math.abs(s.p.y - 3.75) < 1e-9);
    assert.throws(() => { e.xf.p.x = 1; }, /world: entity 1 has a body: move it with world\.place/);
  } finally { w.dispose(); }
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-entities.test.mjs test/world-bodies.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `src/sim/world/world.js`.

- [ ] **Step 3: Implement** `src/sim/world/world.js`:

```js
// E-1…E-9 and S-3 (overview §4.4, §4.5): a World holds one main scene's entities and, with physics, its RAPIER.World.
// Determinism: ids count from 1 in spawn order (D7); pool slots go lowest-free-first; every entity list is kept in id
// order; Rapier objects are made inside spawn, in spawn order. A run depends only on the sequence of World calls,
// never on Map or Set iteration. Sim-pure: Rapier is the module the game injected (D9); this file never imports it.
import { createPool, makeXf, deadXf, INTERNAL, DYNAMIC, KINEMATIC, FIXED, BODILESS, STRIDE, PREV, CURR } from './pool.js';
import { createPlacer } from './place.js';
import { createPhysics } from '../physics/rapier.js';
import { createGroups } from '../physics/groups.js';
import { shapeDesc, materialFor, applyMaterial } from '../physics/colliders.js';
import { qFromYaw, qnorm } from '../../core/math.js';

let SERIAL = 0; // process-wide: a new World never reuses an old World's serial (the view keys on it, S-3)
const DESC_KEYS = new Set(['model', 'colliders', 'body', 'groups', 'at', 'yaw', 'q', 'tags', 'xf', 'contacts', 'sensor']);
const WORLD_KEYS = ['id', 'sockets'];
const FIXED_PARTS = new Set(['id', 'tags', 'model', 'body', 'colliders', 'sockets', 'heightfield']);
const BODY_KEYS = new Set(['type', 'lock', 'ccd', 'linearDamping', 'angularDamping', 'sleep', 'canSleep', 'mass', 'massProps']);
const TYPES = { dynamic: DYNAMIC, kinematic: KINEMATIC, fixed: FIXED };
const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const labelOf = d => (Array.isArray(d.tags) && d.tags.length ? d.tags.join(',') : d.model ?? 'entity');
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
// entity lists are kept in id (= spawn) order: binary search by id
const indexOfId = (list, id) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].id < id) lo = m + 1; else hi = m; } return lo; };
const insert = (list, e) => { const i = indexOfId(list, e.id); if (list[i] !== e) list.splice(i, 0, e); };
const drop = (list, e) => { const i = indexOfId(list, e.id); if (list[i] === e) list.splice(i, 1); };
const hasParts = (e, parts) => { for (let i = 0; i < parts.length; i++) if (e[parts[i]] === undefined) return false; return true; };

export function createWorld(engine, opts = {}) {
  const game = engine.game, phys = game.physics ?? {}, hz = game.sim.hz;
  const R = opts.rapier !== undefined ? opts.rapier : phys.rapier ?? null;
  const registry = opts.materials !== undefined ? opts.materials : game.defs?.materials ?? null;
  const sidecars = (opts.models !== undefined ? opts.models : game.defs?.models)?.models ?? {};
  const groups = createGroups(opts.groups ?? phys.groups ?? []);
  const ph = R ? createPhysics(R, { gravity: opts.gravity ?? phys.gravity, hz, params: opts.params ?? phys.params, timer: opts.timer ?? null }) : null;
  const pool = createPool();
  const list = [], byId = new Map(), handles = new Map(); // handles: collider handle → { e, material } (M-5)
  const slots = [], bodied = [], sleepers = [], queries = []; // live slots; dynamic + kinematic bodies; #2; { parts, list }
  const root = { q: null, next: new Map() }, socketsOf = new Map();
  let nextId = 1, disposed = false, nBodies = 0, nColliders = 0, spawnFns = [], despawnFns = [], placer = null;

  const live = () => { if (disposed) throw new Error('world: disposed'); };
  const mine = (e, what) => {
    const r = e?.[INTERNAL];
    if (!r || r.world !== api || r.dead) throw new Error(`world.${what}: not a live entity of this World`);
    return r;
  };
  const record = (kind, fixedMass) => ({ world: api, slot: -1, kind, dead: false, awake: 1, own: null, k: 1, fixedMass });
  const modelSockets = id => {
    let s = socketsOf.get(id);
    if (!s) socketsOf.set(id, s = deepFreeze(structuredClone(sidecars[id].sockets ?? {})));
    return s;
  };

  function register(e, r) {
    Object.defineProperty(e, INTERNAL, { value: r });
    list.push(e); byId.set(e.id, e); // ids only grow, so a push keeps id order
    if (r.slot >= 0) slots.push(r.slot);
    if (r.kind === DYNAMIC || r.kind === KINEMATIC) bodied.push(e);
    for (let i = 0; i < queries.length; i++) if (hasParts(e, queries[i].parts)) queries[i].list.push(e);
    const fns = spawnFns; for (let i = 0; i < fns.length; i++) fns[i](e, api);
  }

  function spawn(desc = {}) {
    live();
    const L = labelOf(desc), fail = m => { throw new Error(`world: '${L}' ${m}`); };
    for (const k of WORLD_KEYS) if (Object.hasOwn(desc, k)) fail(`may not set '${k}' (the World does)`);
    if (desc.tags !== undefined && !Array.isArray(desc.tags)) fail('tags must be an array');
    let sc = null;
    if (desc.model !== undefined) {
      if (typeof desc.model !== 'string' || !Object.hasOwn(sidecars, desc.model)) fail(`unknown model '${desc.model}'`);
      sc = sidecars[desc.model];
    }
    const entries = desc.colliders ?? sc?.colliders ?? [];
    if (!Array.isArray(entries)) fail('colliders must be an array');
    const bo = desc.body === undefined ? null : typeof desc.body === 'string' ? { type: desc.body } : desc.body;
    if (bo !== null) {
      if (typeof bo !== 'object') fail("body must be 'dynamic', 'kinematic', 'fixed' or { type, ... }");
      for (const k of Object.keys(bo)) if (!BODY_KEYS.has(k)) fail(`body.${k} is not a body option`);
      if (!Object.hasOwn(TYPES, bo.type)) fail(`body type must be 'dynamic', 'kinematic' or 'fixed' (got ${bo.type})`);
    }
    const kind = bo ? TYPES[bo.type] : entries.length ? FIXED : BODILESS; // colliders without a body sit on a fixed one
    if (kind !== BODILESS && !ph) fail('needs a body but the game has no physics.rapier');
    const at = desc.at ?? [0, 0, 0];
    if (!isVec(at, 3)) fail('at must be [x, y, z]');
    const P = { x: at[0], y: at[1], z: at[2] }, Q = { ...IDENTITY };
    if (desc.q != null) {
      if (!isVec(desc.q, 4) || Math.hypot(desc.q[0], desc.q[1], desc.q[2], desc.q[3]) === 0) fail('q must be a non-zero [x, y, z, w]');
      Q.x = desc.q[0]; Q.y = desc.q[1]; Q.z = desc.q[2]; Q.w = desc.q[3]; qnorm(Q);
    } else if (desc.yaw !== undefined) {
      if (!Number.isFinite(desc.yaw)) fail('yaw must be a finite number');
      qFromYaw(desc.yaw, Q);
    }
    // Everything that can fail is checked before any Rapier object exists or an id is taken: a throwing spawn
    // leaves nothing behind.
    let mask = 0xffffffff;
    if (desc.groups !== undefined) { try { mask = groups.mask(desc.groups.member, desc.groups.filter); } catch (err) { fail(err.message.replace(/^physics: /, '')); } }
    if (desc.material !== undefined && (desc.material === null || typeof desc.material !== 'object')) fail("material must be { part: id } (use { '*': id } for every part)");
    if (desc.contacts !== undefined && !(desc.contacts?.min >= 0)) fail('contacts must be { min: impulse >= 0 }');
    const mass = bo?.mass, mp = bo?.massProps;
    if (mass !== undefined) {
      if (mp !== undefined) fail('body takes mass or massProps, not both');
      if (kind !== DYNAMIC) fail('body.mass needs a dynamic body');
      if (!(Number.isFinite(mass) && mass > 0)) fail(`body.mass must be > 0 (got ${mass})`);
    }
    if (mp !== undefined && !(mp?.mass > 0 && isVec(mp.com, 3) && isVec(mp.inertia, 3))) fail('body.massProps must be { mass > 0, com: [x, y, z], inertia: [ix, iy, iz] }');
    if (kind === DYNAMIC && !entries.length && mp === undefined) fail('a dynamic body needs colliders or massProps');
    const made = [];
    for (let i = 0; i < entries.length; i++) {
      const c = entries[i], part = c.part ?? 'body', id = materialFor(c, desc.material);
      if (!registry) fail(`collider ${i} (${part}) needs a material registry: set defs.materials`);
      if (typeof id !== 'string' || !registry.has(id)) fail(`unknown material '${id}' on collider ${i} (${part})`);
      const m = registry.collider(id), density = mp !== undefined ? 0 : m.density;
      if (kind === DYNAMIC && mp === undefined && !(density > 0)) fail(`collider ${i} (${part}) has zero density ('${id}') on a dynamic body without massProps`);
      let d;
      try {
        d = shapeDesc(ph.R, c);
        if (c.p !== undefined) { if (!isVec(c.p, 3)) throw new Error('p must be [x, y, z]'); d.setTranslation(c.p[0], c.p[1], c.p[2]); }
        if (c.q !== undefined) { if (!isVec(c.q, 4)) throw new Error('q must be [x, y, z, w]'); d.setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] }); }
      } catch (err) { fail(`collider ${i} (${part}): ${err.message}`); }
      applyMaterial(ph.R, d, m, density).setCollisionGroups(mask);
      let ev = 0;
      if (desc.sensor === true) { d.setSensor(true); ev |= ph.R.ActiveEvents.COLLISION_EVENTS; }
      if (desc.contacts !== undefined) { ev |= ph.R.ActiveEvents.CONTACT_FORCE_EVENTS; d.setContactForceEventThreshold(desc.contacts.min * hz); } // N·s → N
      if (ev) d.setActiveEvents(ev);
      made.push({ d, id, part, density });
    }

    if (desc.net !== undefined) api.net?.guard('spawn', desc); // 3i seam: may throw (a guest spawning a host kind, E-7)
    const e = { id: nextId++, tags: new Set(desc.tags ?? []) };
    if (desc.model !== undefined) e.model = desc.model;
    for (const k of Object.keys(desc)) if (!DESC_KEYS.has(k)) e[k] = desc[k]; // E-4: game fields and parts, as given
    const r = record(kind, mp !== undefined);
    if (kind !== BODILESS) {
      const RB = ph.R.RigidBodyDesc;
      const bd = kind === DYNAMIC ? RB.dynamic() : kind === KINEMATIC ? RB.kinematicPositionBased() : RB.fixed();
      bd.setTranslation(P.x, P.y, P.z).setRotation(Q);
      if (bo) {
        if (bo.lock?.rot === true) bd.lockRotations(); else if (bo.lock) bd.enabledRotations(!bo.lock.x, !bo.lock.y, !bo.lock.z);
        if (bo.ccd === true) bd.setCcdEnabled(true);
        if (bo.linearDamping !== undefined) bd.setLinearDamping(bo.linearDamping);
        if (bo.angularDamping !== undefined) bd.setAngularDamping(bo.angularDamping);
        if (bo.canSleep !== undefined) bd.setCanSleep(bo.canSleep);
        if (bo.sleep === true) bd.setCanSleep(true).setSleeping(true);
        if (mp !== undefined) bd.setAdditionalMassProperties(mp.mass, { x: mp.com[0], y: mp.com[1], z: mp.com[2] }, { x: mp.inertia[0], y: mp.inertia[1], z: mp.inertia[2] }, IDENTITY);
      }
      const body = ph.world.createRigidBody(bd);
      e.body = body; e.colliders = [];
      for (const m of made) {
        const c = ph.world.createCollider(m.d, body);
        e.colliders.push({ collider: c, part: m.part, material: m.id });
        handles.set(c.handle, { e, material: m.id });
      }
      body.recomputeMassPropertiesFromColliders(); // Rapier would otherwise update mass only at the next step
      if (mass !== undefined) { // D3: scale every density so the body weighs `mass`; com and inertia shape stay geometric
        r.k = mass / body.mass();
        for (let i = 0; i < made.length; i++) e.colliders[i].collider.setDensity(made[i].density * r.k);
        body.recomputeMassPropertiesFromColliders();
      }
      nBodies++; nColliders += made.length;
      if (bo?.sleep === true) sleepers.push(e);
    }
    if (kind !== BODILESS || desc.xf === true) {
      r.slot = pool.alloc(); // may double the pool: only here, at spawn
      pool.write(r.slot, PREV, P, Q); pool.write(r.slot, CURR, P, Q);
      e.xf = makeXf(pool, r.slot, e);
    }
    if (sc) e.sockets = modelSockets(desc.model);
    register(e, r);
    return e;
  }

  const release = r => { const own = r.own; r.own = null; if (own) for (let i = own.length - 1; i >= 0; i--) own[i](); };
  // the entity leaves every World structure; it keeps id, tags, game fields and a frozen last pose
  function forget(e, r) {
    r.dead = true;
    if (e.colliders) { for (const c of e.colliders) handles.delete(c.collider.handle); nColliders -= e.colliders.length; delete e.colliders; }
    if (e.body) { nBodies--; delete e.body; }
    if (r.slot >= 0) { e.xf = deadXf(pool, r.slot); slots.splice(slots.indexOf(r.slot), 1); pool.free(r.slot); r.slot = -1; }
  }
  function despawn(e) {
    const r = e?.[INTERNAL];
    if (!r || r.world !== api || r.dead) return; // idempotent (E-7)
    if (e.net !== undefined) api.net?.guard('despawn', e); // 3i seam (never called from clear/dispose)
    const fns = despawnFns; for (let i = 0; i < fns.length; i++) fns[i](e, api); // before anything is freed
    release(r); // joints, controllers: before their bodies go
    if (e.body) ph.world.removeRigidBody(e.body); // takes its colliders with it
    else if (e.colliders) for (const c of e.colliders) ph.world.removeCollider(c.collider, false);
    forget(e, r);
    drop(list, e); byId.delete(e.id);
    if (r.kind === DYNAMIC || r.kind === KINEMATIC) drop(bodied, e);
    for (let i = 0; i < queries.length; i++) drop(queries[i].list, e);
    const s = sleepers.indexOf(e); if (s >= 0) sleepers.splice(s, 1);
  }
  function teardown() { // hooks and owned frees newest first, then every entity forgotten; Rapier objects go with the world
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], fns = despawnFns;
      for (let k = 0; k < fns.length; k++) fns[k](e, api);
      release(e[INTERNAL]);
    }
    for (let i = worldOwned.length - 1; i >= 0; i--) worldOwned[i]();
    worldOwned.length = 0;
    for (const e of list) forget(e, e[INTERNAL]);
    list.length = 0; byId.clear(); handles.clear(); bodied.length = 0; sleepers.length = 0;
    for (const q of queries) q.list.length = 0; // the same arrays: systems that cached them keep working
  }
  function clear() { live(); teardown(); pool.reset(); nextId = 1; if (ph) ph.recreate(); api.serial = ++SERIAL; }
  function dispose() { if (disposed) return; teardown(); if (ph) ph.free(); disposed = true; api.serial = ++SERIAL; }

  function query(parts) {
    const q = { parts, list: [] };
    for (const e of list) if (hasParts(e, parts)) q.list.push(e);
    queries.push(q);
    return q.list;
  }
  const child = (node, k) => {
    let x = node.next.get(k);
    if (x === undefined) { if (typeof k !== 'string') throw new Error('world.with: parts are strings'); node.next.set(k, x = { q: null, next: new Map() }); }
    return x;
  };
  // E-3: live, cached, the same array every call, in id order. Fixed arity so a per-step call allocates nothing.
  function withParts(a, b, c, d) {
    const n = arguments.length;
    if (n === 0) return list;
    if (n > 4) throw new Error('world.with: at most 4 parts');
    let node = child(root, a);
    if (n > 1) node = child(node, b);
    if (n > 2) node = child(node, c);
    if (n > 3) node = child(node, d);
    return node.q ??= query(n === 1 ? [a] : n === 2 ? [a, b] : n === 3 ? [a, b, c] : [a, b, c, d]);
  }
  function add(e, part, value) {
    const r = mine(e, 'add');
    if (FIXED_PARTS.has(part)) throw new Error(`world.add: '${part}' cannot be added after spawn`);
    if (value === undefined) throw new Error(`world.add: '${part}' needs a value`);
    if (part === 'net') api.net?.guard('add', e, value); // 3i seam
    if (part === 'xf') {
      if (r.slot >= 0) return e;
      r.slot = pool.alloc(); slots.push(r.slot); e.xf = makeXf(pool, r.slot, e);
    } else {
      const had = e[part] !== undefined;
      e[part] = value;
      if (had) return e;
    }
    for (const q of queries) if (q.parts.includes(part) && hasParts(e, q.parts)) insert(q.list, e);
    return e;
  }
  function remove(e, part) {
    const r = mine(e, 'remove');
    if (FIXED_PARTS.has(part)) throw new Error(`world.remove: '${part}' cannot be removed (despawn the entity)`);
    if (e[part] === undefined) return e;
    if (part === 'net') api.net?.guard('remove', e); // 3i seam
    if (part === 'xf') {
      if (e.body) throw new Error('world.remove: a body entity keeps its xf');
      slots.splice(slots.indexOf(r.slot), 1); pool.free(r.slot); r.slot = -1;
    }
    for (const q of queries) if (q.parts.includes(part)) drop(q.list, e);
    delete e[part];
    return e;
  }
  const worldOwned = []; // world.own(fn): freed on clear() and dispose(), before the Rapier world goes (3h's controllers)
  function own(e, fn) {
    if (typeof e === 'function' && fn === undefined) { worldOwned.push(e); return () => { const i = worldOwned.indexOf(e); if (i >= 0) worldOwned.splice(i, 1); }; }
    const r = mine(e, 'own');
    if (typeof fn !== 'function') throw new Error('world.own: needs a function');
    (r.own ??= []).push(fn);
    return () => { const i = r.own ? r.own.indexOf(fn) : -1; if (i >= 0) r.own.splice(i, 1); };
  }
  // §4.5 joints: raw Rapier joint data (L-1), freed when either entity despawns (Tractor's hitch)
  function joint(a, b, data) {
    live();
    if (!a?.body || !b?.body) throw new Error('world.joint: both entities need a body');
    mine(a, 'joint'); mine(b, 'joint');
    const j = ph.world.createImpulseJoint(data, a.body, b.body, true), rec = { on: true };
    const free = () => { if (!rec.on) return; rec.on = false; if (ph.world && j.isValid()) ph.world.removeImpulseJoint(j, true); };
    own(a, free); own(b, free);
    return j;
  }
  // §4.5 runtime material swap (Pig Pens' slide/grip): friction and restitution always; density (and so mass) when it changes
  function setMaterial(e, part, id) {
    const r = mine(e, 'setMaterial');
    if (!registry || typeof id !== 'string' || !registry.has(id)) throw new Error(`world.setMaterial: unknown material '${id}'`);
    const m = registry.collider(id);
    if (r.kind === DYNAMIC && !r.fixedMass && !(m.density > 0)) throw new Error(`world.setMaterial: '${id}' has zero density and entity ${e.id} is dynamic without massProps`);
    let n = 0, massChanged = false;
    for (const c of e.colliders ?? []) {
      if (part !== '*' && c.part !== part) continue;
      n++;
      c.collider.setFriction(m.friction); c.collider.setRestitution(m.restitution);
      if (!r.fixedMass && registry.collider(c.material).density !== m.density) { c.collider.setDensity(m.density * r.k); massChanged = true; }
      c.material = id; handles.get(c.collider.handle).material = id;
    }
    if (n === 0) throw new Error(`world.setMaterial: entity ${e.id} has no collider on part '${part}'`);
    if (massChanged && e.body) e.body.recomputeMassPropertiesFromColliders();
    return e;
  }

  const stats = {
    get entities() { return list.length; }, get bodies() { return nBodies; }, get colliders() { return nColliders; },
    get stepMs() { return ph ? ph.stats.stepMs : 0; }, get stepMsTotal() { return ph ? ph.stats.stepMsTotal : 0; },
  };
  const api = {
    seed: opts.seed ?? engine.seed, serial: ++SERIAL, R, materials: registry, groups, stats,
    engine, // 3h: a kit given only the World registers its systems on world.engine
    net: null, // 3i's writable slot: { guard(op, eOrDesc, value) } set by engine.netPart.attach(world)
    xf: Object.freeze({ get pool() { return pool.buf; }, stride: STRIDE }),
    get rapier() { return ph ? ph.world : null; },
    get disposed() { return disposed; },
    spawn, despawn, with: withParts, get: id => byId.get(id), add, remove, clear, dispose, own, joint, setMaterial,
    place: (e, target, o) => { live(); return placer.place(e, target, o); },
    socket: (e, name, out) => placer.socket(e, name, out),
    xfPrev: (e, out) => placer.xfPrev(e, out),
    materialOf: h => handles.get(h)?.material,
    entityOf: h => handles.get(h)?.e,
    onSpawn(fn) { spawnFns = [...spawnFns, fn]; return () => { spawnFns = spawnFns.filter(f => f !== fn); }; },
    onDespawn(fn) { despawnFns = [...despawnFns, fn]; return () => { despawnFns = despawnFns.filter(f => f !== fn); }; },
  };
  placer = createPlacer(pool, () => (ph ? ph.world : null), api);
  return api;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-entities.test.mjs test/world-bodies.test.mjs`
Expected: PASS, 9 + 11 tests. If a Rapier getter used by a test does not exist in 0.21 under that name (`isFixed`, `activeEvents`, `contactForceEventThreshold`), check `Object.getOwnPropertyNames(R.RigidBody.prototype)` / `R.Collider.prototype`, fix the **test** to the real name and note it; never weaken an assertion.

- [ ] **Step 5: Prove the "nothing behind" test red by mutation**

Temporarily move `const e = { id: nextId++, … }` and the body creation above the collider loop (create first, validate after). Run `test/world-bodies.test.mjs`: "spawn errors name the desc and leave nothing behind" FAILS (bodies left in Rapier, ids consumed). Revert; PASS.

- [ ] **Step 6: Run the purity test**

Run: `$UNIT test/purity.test.mjs`
Expected: PASS (`src/sim` already covers `src/sim/world` and `src/sim/physics`).

- [ ] **Step 7: Commit**

```bash
git add src/sim/world/world.js test/world-entities.test.mjs test/world-bodies.test.mjs
git commit -m "feat(world): createWorld with live queries, deterministic ids, bodies, materials and mass (E-1..E-9, M-4, M-6, D3)"
```

---

## Task 10: Stepping the World: swap, Rapier step, read, #2 re-sleep, events, digest, heightfield, audit **(judgment)**

**Files:**
- Modify: `src/sim/world/world.js`
- Create: `test/world-step.test.mjs`

**Interfaces:**
- Consumes: Tasks 4 and 7.
- Produces (added to the World):
  - `world.sys = { swap(), step(), read(), events() }`: the four bodies of `lh.world.swap`, `lh.physics.step`, `lh.physics.read`, `lh.physics.events`. Engine-internal (installed by Task 11); tests and kits that drive a World without an engine call them in that order. Each is a no-op on a disposed World.
  - `world.digest() → { n, sum }`: `n` live entities; `sum` an 8-hex FNV-1a over, per entity in id order, the id, the 7 current pose floats (when it has a slot) and the linear and angular velocity (dynamic bodies), hashed by their float64 bits.
  - `world.heightfield({ nx, nz, cell, x0 = 0, z0 = 0, heights, material, groups, fixInternalEdges = false, tags = ['heightfield'] }) → e`: a bodiless entity with one heightfield collider (part `'ground'`), `e.heightfield = { nx, nz, cell, x0, z0 }` (frozen), default groups `{ member: ['ground'] }` when `ground` is declared.
  - `world.audit() → [{ handle, entity, friction, restitution }]`: colliders whose combine rules are not the engine's (`Multiply`, `Max`), with rule names; for the debug hook (§4.5 "flagged under ?debug").
- Decision (judgment): `read` writes curr for every dynamic or kinematic body that is awake **or was awake at the previous read**. Rapier can put a body to sleep at the end of the step that moved it; reading only non-sleeping bodies (the overview's wording) would lose that last pose. The extra read is one step per sleep, so the cost is unchanged in practice.

- [ ] **Step 1: Write the failing test** `test/world-step.test.mjs`:

```js
// The World's step pieces (overview §4.4): swap → (game) → Rapier step → read → events; #2 re-sleep; the digest;
// world.heightfield; clear() with physics; the timer; audit().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { R } from './fixtures/phys/rapier.js';

const step = (w, n = 1) => { for (let i = 0; i < n; i++) { w.sys.swap(); w.sys.step(); w.sys.read(); w.sys.events(); } };
const ground = (w, material = 'gravel') => w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [20, 0.5, 20], p: [0, -0.5, 0], material }], groups: { member: ['ground'] } });
const prevY = (w, e) => w.xfPrev(e).p.y;

test('swap copies curr to prev; the read writes curr after the Rapier step; bodiless entities keep prev == curr', () => {
  const w = createWorld(stubEngine());
  try {
    const c = w.spawn({ model: 'crate', body: 'dynamic', at: [0, 5, 0] }), m = w.spawn({ tags: ['m'], xf: true });
    m.xf.p.x = 1;
    assert.equal(w.xfPrev(m).p.x, 0, 'a write lands in curr only');
    w.sys.swap();
    assert.equal(w.xfPrev(m).p.x, 1);
    w.sys.step(); w.sys.read();
    assert.equal(prevY(w, c), 5); assert.ok(c.xf.p.y < 5);
    assert.equal(c.xf.p.y, c.body.translation().y);
    const y1 = c.xf.p.y; step(w);
    assert.equal(prevY(w, c), y1); assert.equal(w.xfPrev(m).p.x, 1);
  } finally { w.dispose(); }
});
test('Rapier 0.21 wakes a body inserted asleep on its first step (#2 is real)', () => {
  const rw = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    rw.createCollider(R.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0));
    const b = rw.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.6, 0).setCanSleep(true).setSleeping(true));
    rw.createCollider(R.ColliderDesc.cuboid(0.06, 0.6, 0.045), b);
    rw.step();
    assert.equal(b.isSleeping(), false, 'if this fails, Rapier fixed #2: keep the re-sleep (harmless) and note it');
  } finally { rw.free(); }
});
test('a post spawned asleep on the ground stays asleep and standing; a knocked one stays awake (#2)', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const post = at => w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }], at, groups: { member: ['prop'] } });
    const still = post([0, 0.6, 0]), hit = post([3, 0.6, 0]);
    hit.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
    step(w);
    assert.equal(still.body.isSleeping(), true);
    assert.equal(hit.body.isSleeping(), false);
    step(w, 120);
    assert.equal(still.body.isSleeping(), true);
    assert.ok(Math.abs(still.xf.p.y - 0.6) < 0.01 && Math.abs(still.xf.q.w) > 0.999, 'still upright');
  } finally { w.dispose(); }
});
test('the step a body falls asleep is read: the pool matches Rapier exactly once it sleeps', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const b = w.spawn({ tags: ['ball'], body: { type: 'dynamic', canSleep: true }, colliders: [{ shape: 'sphere', r: 0.5, material: 'grip' }], at: [0, 0.6, 0] });
    let k = 0;
    while (!b.body.isSleeping() && k++ < 900) step(w);
    assert.ok(b.body.isSleeping(), 'the ball fell asleep');
    const t = b.body.translation();
    assert.deepEqual([b.xf.p.x, b.xf.p.y, b.xf.p.z], [t.x, t.y, t.z]);
  } finally { w.dispose(); }
});
test('contact and sensor events come out through engine.emit with entity ids and materials', () => {
  const e = stubEngine(), w = createWorld(e);
  try {
    const g = ground(w, 'grip');
    const c = w.spawn({ model: 'crate', body: 'dynamic', at: [0, 1.5, 0], contacts: { min: 0.5 } });
    const z = w.spawn({ tags: ['zone'], sensor: true, colliders: [{ shape: 'box', half: [1, 0.25, 1], material: 'air' }], at: [0, 2.5, 0] });
    const b = w.spawn({ tags: ['ball'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.2, material: 'rubber' }], at: [3, 4, 0] });
    w.place(z, { at: [3, 2.5, 0] });
    step(w, 120);
    const hit = e.events.find(x => x.type === 'contact');
    assert.ok(hit, 'the crate landed above 0.5 N·s');
    assert.deepEqual([hit.a, hit.b].sort(), [g.id, c.id].sort());
    assert.equal(hit.materials[[hit.a, hit.b].indexOf(c.id)], 'wood');
    const sens = e.events.filter(x => x.type === 'sensor');
    assert.deepEqual(sens.map(x => [x.sensor, x.other, x.on]), [[z.id, b.id, true], [z.id, b.id, false]]);
  } finally { w.dispose(); }
});
test('digest: same build, same digest; it moves with poses and velocities and counts entities', () => {
  const build = () => { const w = createWorld(stubEngine()); ground(w); w.spawn({ model: 'crate', body: 'dynamic', at: [0, 3, 0] }); w.spawn({ tags: ['m'], xf: true }); return w; };
  const a = build(), b = build();
  try {
    assert.deepEqual(a.digest(), b.digest());
    assert.equal(a.digest().n, 3); assert.match(a.digest().sum, /^[0-9a-f]{8}$/);
    step(a, 10); step(b, 10);
    assert.deepEqual(a.digest(), b.digest(), 'Rapier is deterministic in one process');
    const before = a.digest().sum;
    a.get(2).body.setLinvel({ x: 0, y: 0, z: 1e-9 }, true);
    assert.notEqual(a.digest().sum, before, 'a velocity change shows');
    b.get(3).xf.p.z = 1e-12;
    assert.notEqual(b.digest().sum, before, 'a bodiless pose change shows');
  } finally { a.dispose(); b.dispose(); }
});
test('world.heightfield: a ground entity a ball rests on at the analytic height', () => {
  const w = createWorld(stubEngine());
  try {
    const nx = 9, nz = 7, cell = 1.5, x0 = -4, z0 = -3, h = (x, z) => 0.1 * x + 0.3 * z, heights = [];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) heights.push(h(x0 + ix * cell, z0 + iz * cell));
    const f = w.heightfield({ nx, nz, cell, x0, z0, heights, material: 'grass' });
    assert.ok(f.tags.has('heightfield')); assert.deepEqual(f.heightfield, { nx, nz, cell, x0, z0 });
    assert.equal(f.body, undefined); assert.equal(f.xf, undefined);
    const c = f.colliders[0].collider;
    assert.equal(w.materialOf(c.handle), 'grass'); assert.equal(c.collisionGroups(), w.groups.mask(['ground']));
    const ball = w.spawn({ tags: ['ball'], body: { type: 'dynamic', lock: { rot: true } }, colliders: [{ shape: 'sphere', r: 0.25, material: 'grip' }], at: [6, h(6, 2) + 0.4, 2] });
    step(w, 240);
    const { x, y, z } = ball.xf.p, lift = 0.25 * Math.sqrt(1 + 0.1 ** 2 + 0.3 ** 2);
    assert.ok(Math.abs(y - (h(x, z) + lift)) < 0.02, `rests at ${y}, expected ${h(x, z) + lift}`);
    assert.throws(() => w.place(f, { at: [0, 0, 0] }), /world\.place: entity 1 has no xf/);
    assert.throws(() => w.heightfield({ nx, nz, cell, heights, material: 'lava' }), /world: 'heightfield' unknown material 'lava'/);
    w.despawn(f);
    assert.equal(w.rapier.getCollider(c.handle), null);
  } finally { w.dispose(); }
});
test('clear() with physics: a fresh Rapier world, owned frees before the old one goes, ids and stats reset', () => {
  const w = createWorld(stubEngine());
  try {
    const a = w.spawn({ model: 'cart', body: 'dynamic' }), b = w.spawn({ model: 'crate', body: 'dynamic', at: [-2, 0, 0] });
    const j = w.joint(a, b, R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })), old = w.rapier;
    let validAtFree;
    w.own(a, () => { validAtFree = j.isValid(); });
    w.clear();
    assert.equal(validAtFree, true, 'owned frees run while the old Rapier world is alive');
    assert.notEqual(w.rapier, old);
    assert.deepEqual({ ...w.stats, stepMs: 0, stepMsTotal: 0 }, { entities: 0, bodies: 0, colliders: 0, stepMs: 0, stepMsTotal: 0 });
    assert.equal(w.spawn({ model: 'crate', body: 'dynamic' }).id, 1);
    step(w, 2);
  } finally { w.dispose(); }
});
test('with a timer, stats.stepMs is the last Rapier step (#106); disposed Worlds ignore sys calls', () => {
  let t = 0;
  const w = createWorld(stubEngine(), { timer: () => (t += 2) });
  w.spawn({ model: 'crate', body: 'dynamic' });
  step(w, 3);
  assert.equal(w.stats.stepMs, 2); assert.equal(w.stats.stepMsTotal, 6);
  w.dispose();
  step(w); // no throw
  assert.equal(w.stats.stepMs, 0);
});
test('audit lists raw colliders whose combine rules override the engine\'s', () => {
  const w = createWorld(stubEngine());
  try {
    ground(w);
    const raw = w.rapier.createCollider(R.ColliderDesc.ball(1).setFrictionCombineRule(R.CoefficientCombineRule.Max));
    assert.deepEqual(w.audit(), [{ handle: raw.handle, entity: null, friction: 'Max', restitution: 'Average' }]);
  } finally { w.dispose(); }
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-step.test.mjs`
Expected: FAIL, `TypeError: Cannot read properties of undefined (reading 'swap')` (no `world.sys`) in the first test; the others fail the same way or on `w.heightfield is not a function`.

- [ ] **Step 3: Implement.** In `src/sim/world/world.js`:

Add two imports below the existing ones:

```js
import { heightfieldDesc } from '../physics/heightfield.js';
import { createEventDrain } from '../physics/events.js';
```

Add these module-level helpers below `hasParts`:

```js
// digest: FNV-1a over float64 bits, so the checksum sees every bit of a pose or velocity (no rounding)
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const mix = (h, v) => { F64[0] = v; h = Math.imul(h ^ U32[0], 0x01000193); return Math.imul(h ^ U32[1], 0x01000193); };
```

Insert, just before `const stats = {`:

```js
  // §4.4 step pieces, run by the lh.* systems (install.js) in this order: swap (input.apply, first), step, read, events
  // (physics.world). Nothing here allocates except Rapier's own per-call vectors.
  let drainEvents = null; // made below, once api exists
  const sys = {
    swap() { if (!disposed) pool.swap(slots); },
    step() { if (ph && !disposed) ph.step(); },
    read() {
      if (!ph || disposed) return;
      const b = pool.buf;
      for (let i = 0; i < bodied.length; i++) {
        const e = bodied[i], r = e[INTERNAL], body = e.body, asleep = body.isSleeping();
        if (!asleep || r.awake) { // awake now, or awake at the last read: Rapier may sleep a body after moving it
          const t = body.translation(), q = body.rotation(), o = r.slot * STRIDE + CURR;
          b[o] = t.x; b[o + 1] = t.y; b[o + 2] = t.z; b[o + 3] = q.x; b[o + 4] = q.y; b[o + 5] = q.z; b[o + 6] = q.w;
        }
        r.awake = asleep ? 0 : 1;
      }
      // #2: Rapier 0.21 wakes a body inserted asleep on its first step. Put it back to sleep unless something really
      // set it moving (Rally's afterStep thresholds, moved; one step of gravity is 0.04 m/s).
      for (let i = 0; i < sleepers.length; i++) {
        const body = sleepers[i].body, v = body.linvel(), w = body.angvel();
        if (Math.hypot(v.x, v.y, v.z) < 0.2 && Math.hypot(w.x, w.y, w.z) < 0.5) body.sleep();
      }
      sleepers.length = 0;
    },
    events() { if (ph && !disposed) drainEvents(ph.world, ph.queue); },
  };
  function digest() {
    let h = 0x811c9dc5 | 0;
    const b = pool.buf;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], r = e[INTERNAL];
      h = mix(h, e.id);
      if (r.slot >= 0) { const o = r.slot * STRIDE + CURR; for (let k = 0; k < 7; k++) h = mix(h, b[o + k]); }
      if (r.kind === DYNAMIC) {
        const v = e.body.linvel(), w = e.body.angvel();
        h = mix(mix(mix(h, v.x), v.y), v.z); h = mix(mix(mix(h, w.x), w.y), w.z);
      }
    }
    return { n: list.length, sum: (h >>> 0).toString(16).padStart(8, '0') };
  }
  // §4.5 heightfield: a bodiless ground entity; heights are row-major (heightfieldDesc does Rapier's layout)
  function heightfield({ nx, nz, cell, x0 = 0, z0 = 0, heights, material, groups: g, fixInternalEdges = false, tags = ['heightfield'] } = {}) {
    live();
    const fail = m => { throw new Error(`world: 'heightfield' ${m}`); };
    if (!ph) fail('needs a body but the game has no physics.rapier');
    if (!registry) fail('needs a material registry: set defs.materials');
    if (typeof material !== 'string' || !registry.has(material)) fail(`unknown material '${material}'`);
    let mask = 0xffffffff;
    try { mask = g !== undefined ? groups.mask(g.member, g.filter) : Object.hasOwn(groups, 'ground') ? groups.mask(['ground']) : mask; }
    catch (err) { fail(err.message.replace(/^physics: /, '')); }
    let d;
    try { d = heightfieldDesc(ph.R, { nx, nz, cell, x0, z0, heights, fixInternalEdges }); } catch (err) { fail(err.message); }
    applyMaterial(ph.R, d, registry.collider(material), 0).setCollisionGroups(mask);
    const c = ph.world.createCollider(d);
    const e = { id: nextId++, tags: new Set(tags), heightfield: Object.freeze({ nx, nz, cell, x0, z0 }), colliders: [{ collider: c, part: 'ground', material }] };
    handles.set(c.handle, { e, material }); nColliders++;
    register(e, record(BODILESS, true));
    return e;
  }
  // §4.5: colliders whose combine rules are not the engine's (a raw game collider wins by priority); for ?debug
  function audit() {
    const out = [];
    if (!ph || disposed) return out;
    const M = ph.R.CoefficientCombineRule;
    ph.world.forEachCollider(c => {
      const f = c.frictionCombineRule(), r = c.restitutionCombineRule();
      if (f !== M.Multiply || r !== M.Max) out.push({ handle: c.handle, entity: handles.get(c.handle)?.e.id ?? null, friction: M[f], restitution: M[r] });
    });
    return out;
  }
```

In the `api` object literal, add after `onDespawn(...)`:

```js
    sys, digest, heightfield, audit,
```

and after `placer = createPlacer(...)`:

```js
  drainEvents = createEventDrain({ emit: (type, data) => engine.emit(type, data), hz, entityOf: api.entityOf, materialOf: api.materialOf });
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-step.test.mjs test/world-entities.test.mjs test/world-bodies.test.mjs`
Expected: PASS, 10 + 9 + 11 tests.

- [ ] **Step 5: Mutation checks**

1. Replace `if (!asleep || r.awake)` with `if (!asleep)`. Run `test/world-step.test.mjs`. If "the step a body falls asleep is read" FAILS, good. If it still passes, Rapier zeroes the velocity before integrating the sleeping step in this case; record that in the notes ("mutation not observable in 0.21.0") and keep the code and the test. Revert.
2. Remove the `sleepers` loop. "a post spawned asleep on the ground stays asleep" FAILS. Revert; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/world/world.js test/world-step.test.mjs
git commit -m "feat(world): step pieces (swap, step, read, events), #2 re-sleep, digest, heightfield entity and audit"
```

---
## Task 11: The engine seam: scene-owned World, systems, builtin, timer, state digest (S-3) **(judgment)**

**Files:**
- Create: `src/sim/world/install.js`
- Create: `test/fixtures/phys/game.js`
- Modify: `src/core/engine.js` (only the edits below)
- Modify: `test/engine.test.mjs` line 232 (Integrator request 1)
- Create: `test/world-engine.test.mjs`

**Interfaces:**
- Consumes: `createWorld` (Tasks 9–10), `checkRapier`, `PINNED_DEFAULTS` (Task 2), `createGroups` (Task 3); 3i's optional `engine.netPart` (`attach(world)`).
- Produces:
  - `checkPhysics(physics, fail)`: `physics.gravity` is `[x, y, z]`, every `physics.params` key is pinned, `physics.groups` passes `createGroups`; failures read `defineGame: physics.<field> …`.
  - `installWorld(engine, { timer }) → seat` with `seat.current` (the main scene's World or `undefined`), `seat.open()`, `seat.close()`, `seat.digest()` (`world.digest()` while the World has entities, else `undefined`). It runs `checkRapier(game.physics?.rapier)` and adds `lh.world.swap` (`input.apply`, before `lh.ui`), `lh.physics.step`, `lh.physics.read` (after step), `lh.physics.events` (after read), all in `physics.world`. `open()` calls `engine.netPart?.attach(world)` when 3i has installed it.
  - In `engine.js`: `createEngine(game, { …, timer = null })`; `ctx.world` (getter, non-enumerable, main scene and overlays); `engine.world` (getter); `engine.builtin(type, fn) → off`, `fn(engine, data, mainCtx)` runs before the game's handler and the scene handlers, and `commands.handles(type)` counts it; `state()` gains `world: { n, sum }` only while the World has entities; `defineGame` runs `checkPhysics` when `physics` is given.
- Decisions (judgment):
  1. A World is created for every main scene, physics or not (a no-physics World holds bodiless entities, §4.1). It is opened **before** the scene's `enter` (and before 3a's `enter(engine, view, args)` view logic, which is not in this file) and closed in `exit`'s `finally`, after the scene's `exit` hook. A main `enter` that throws closes its World.
  2. `ctx.world` is a getter onto the seat, so an overlay always sees the current main World.
  3. One `builtin` per command type; a second registration throws.

- [ ] **Step 1: Create the physics game fixture** `test/fixtures/phys/game.js`:

```js
// A one-scene physics game for the engine, headless and checks tests (Tasks 11–16). The game injects Rapier (D9):
// nothing under src/ imports it. `yard` calls build(engine, ctx) in enter and tick(engine, dt, ctx) every step;
// `menu` is an empty main scene to leave to. physics: null makes a game without physics.
import { defineGame } from '../../../src/core/engine.js';
import { R } from './rapier.js';
import MATERIALS from './materials.js';
import PHYS from './phys.json' with { type: 'json' };

export const GROUPS = ['ground', 'static', 'vehicle', 'prop'];
export function physGame({ id = 'phys', hz = 60, build, tick, physics, defs, scenes, commands, state, setup, policies, actions } = {}) {
  return defineGame({
    id, sim: { hz, maxCatchUp: 3 }, start: 'yard',
    defs: { materials: MATERIALS, models: PHYS, ...defs },
    physics: physics === null ? undefined : { rapier: R, gravity: [0, -9.81, 0], groups: GROUPS, ...physics },
    scenes: { yard: { enter(e, ctx) { build?.(e, ctx); }, step(e, dt, ctx) { tick?.(e, dt, ctx); } }, menu: {}, ...scenes },
    commands, state, setup, policies, actions,
  });
}
```

- [ ] **Step 2: Write the failing test** `test/world-engine.test.mjs`:

```js
// S-3 and the §4.4 seam: each main scene owns a World made before its enter and disposed after its exit; overlays
// share it; the World systems sit where the step order needs them; builtin handlers (3i); the timer (#106);
// state() carries the World digest only while it has entities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';
import { physGame } from './fixtures/phys/game.js';

const crate = (e, ctx) => ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 10, 0], tags: ['c'] });

test('a main scene gets its World before enter; overlays share it; engine.world follows (S-3)', () => {
  let seen, inSetup = 'unset', overlayWorld;
  const g = physGame({ setup: e => { inSetup = e.world; }, build: (e, ctx) => { seen = ctx.world; ctx.world.spawn({ tags: ['m'], xf: true }); },
    scenes: { pause: { enter(e, ctx) { overlayWorld = ctx.world; } } } });
  const e = createEngine(g);
  assert.equal(inSetup, undefined, 'no World before the first scene');
  assert.ok(seen); assert.equal(seen, e.world); assert.equal(e.world.stats.entities, 1);
  e.overlay('pause');
  assert.equal(overlayWorld, e.world);
});
test('leaving the main scene disposes its World after exit and a new one replaces it', () => {
  let exitSaw;
  const g = physGame({ scenes: { yard: { enter: crate, exit(e, ctx) { exitSaw = ctx.world.stats.entities; } } } });
  const e = createEngine(g), w = e.world, serial = w.serial;
  e.go('menu');
  assert.equal(exitSaw, 1, 'the World is alive during exit');
  assert.equal(w.disposed, true); assert.equal(w.rapier, null);
  assert.throws(() => w.spawn({ xf: true }), /world: disposed/);
  assert.notEqual(e.world, w); assert.ok(e.world.serial > serial);
  e.go('yard');
  assert.equal(e.world.get(1).model, 'crate', 'ids restart in every new World');
});
test('a main enter that throws leaves no World behind', () => {
  let made;
  const e = createEngine(physGame({ scenes: { boom: { enter(en, ctx) { made = ctx.world; throw new Error('boom'); } } } }));
  assert.throws(() => e.go('boom'), /boom/);
  assert.equal(made.disposed, true);
  assert.equal(e.world, undefined);
});
test('jump re-enters with a fresh World; a load build may clear() in place', () => {
  const g = physGame({ scenes: { yard: { enter(e, ctx) { crate(e, ctx); ctx.load({ build: (en, c) => { c.world.clear(); c.world.spawn({ tags: ['rebuilt'], xf: true }); } }); }, presets: { p() {} } } } });
  const e = createEngine(g), w = e.world, s = w.serial;
  e.stepN(2);
  assert.equal(e.world, w); assert.ok(w.serial > s);
  assert.equal(w.get(1).tags.has('rebuilt'), true);
  e.jump('yard', 'p');
  assert.notEqual(e.world, w); assert.equal(w.disposed, true);
});
test('state() gains world only while the World has entities; no World key for an empty World', () => {
  const e = createEngine(physGame({ commands: { add: en => { en.world.spawn({ tags: ['m'], xf: true }); } } }));
  assert.equal('world' in e.state(), false);
  e.command('add', {}); e.stepN(1);
  assert.deepEqual(Object.keys(e.state().world), ['n', 'sum']);
  assert.equal(e.state().world.n, 1);
});
test('the schedule: lh.world.swap first in input.apply; physics systems in order; kits slot before the step', () => {
  const e = createEngine(physGame()), s = e.schedule();
  assert.deepEqual(s['input.apply'], ['lh.world.swap', 'lh.ui', 'lh.input', 'lh.commands']);
  assert.deepEqual(s['physics.world'], ['lh.physics.step', 'lh.physics.read', 'lh.physics.events']);
  e.system('kit.pre', () => {}, { stage: 'physics.world', before: ['lh.physics.step'] });
  e.system('game.late', () => {}, { stage: 'physics.world' });
  assert.deepEqual(e.schedule()['physics.world'], ['kit.pre', 'lh.physics.step', 'lh.physics.read', 'lh.physics.events', 'game.late']);
});
test('pre systems see prev == curr; physics then moves curr; the next swap makes it prev', () => {
  const seen = [];
  const g = physGame({ build: crate, tick: (e, dt, ctx) => { const c = ctx.world.get(1); seen.push([ctx.world.xfPrev(c).p.y, c.xf.p.y]); } });
  const e = createEngine(g);
  e.stepN(3);
  for (const [p, c] of seen) assert.equal(p, c, 'after the swap, before the Rapier step');
  assert.equal(seen[0][1], 10);
  assert.ok(seen[2][1] < seen[1][1] && seen[1][1] < 10);
  const c = e.world.get(1);
  assert.equal(e.world.xfPrev(c).p.y, seen[2][1]);
  assert.ok(c.xf.p.y < seen[2][1]);
});
test('a pausing overlay freezes physics; prev catches up with curr so the view holds still', () => {
  const e = createEngine(physGame({ build: crate, scenes: { pause: { pauses: true } } }));
  e.stepN(5); e.overlay('pause');
  const c = e.world.get(1), y = c.xf.p.y;
  e.stepN(3);
  assert.equal(c.xf.p.y, y); assert.equal(e.world.xfPrev(c).p.y, y);
});
test('builtin handlers run before the game handler, which still runs (3i seam)', () => {
  const log = [];
  const e = createEngine(physGame({ commands: { 'net.frame': (en, d) => { log.push(['game', d.n]); } } }));
  const off = e.builtin('net.frame', (en, d, ctx) => { log.push(['builtin', d.n, ctx.name]); });
  assert.throws(() => e.builtin('net.frame', () => {}), /engine: builtin 'net\.frame' is already registered/);
  assert.throws(() => e.builtin('x', 5), /engine: builtin 'x' needs a function/);
  e.command('net.frame', { n: 1 }); e.stepN(1);
  assert.deepEqual(log, [['builtin', 1, 'yard'], ['game', 1]]);
  off(); e.command('net.frame', { n: 2 }); e.stepN(1);
  assert.deepEqual(log.at(-1), ['game', 2]);
  const e2 = createEngine(physGame());
  e2.builtin('only.engine', () => { log.push(['only']); });
  assert.equal(e2.commands.handles('only.engine'), true);
  e2.command('only.engine', {}); e2.stepN(1);
  assert.equal(e2.commands.dropped, 0); assert.deepEqual(log.at(-1), ['only']);
});
test('timer: world.stats.stepMs is the last Rapier step and never enters state (#106)', () => {
  let t = 0;
  const e = createEngine(physGame({ build: crate }), { timer: () => (t += 0.25) });
  e.stepN(4);
  assert.equal(e.world.stats.stepMs, 0.25); assert.equal(e.world.stats.stepMsTotal, 1);
  assert.equal(JSON.stringify(e.state()).includes('stepMs'), false);
  assert.throws(() => createEngine(physGame(), { timer: 5 }), /engine: timer must be a function/);
});
test('physics.rapier must be initialised; gravity, groups and params are checked at defineGame (§4.1, D9)', () => {
  const uninit = { World: class { constructor() { throw new TypeError('wasm not loaded'); } } };
  assert.throws(() => createEngine(physGame({ physics: { rapier: uninit } })), /physics: await RAPIER\.init\(\) before createEngine/);
  assert.throws(() => physGame({ physics: { groups: Array.from({ length: 17 }, (_, i) => `g${i}`) } }), /defineGame: physics\.groups: at most 16 groups \(got 17\)/);
  assert.throws(() => physGame({ physics: { params: { warmstartCoefficient: 1 } } }), /defineGame: physics\.params\.warmstartCoefficient is not a Rapier 0\.21 integration parameter/);
  assert.throws(() => physGame({ physics: { gravity: [0, -9.81] } }), /defineGame: physics\.gravity must be \[x, y, z\]/);
});
test('without physics.rapier the engine World holds bodiless entities only (§4.1)', () => {
  const e = createEngine(physGame({ physics: null }));
  assert.equal(e.world.rapier, null);
  e.world.spawn({ tags: ['ghost'], xf: true });
  assert.throws(() => e.world.spawn({ tags: ['pig'], body: 'dynamic' }), /world: 'pig' needs a body but the game has no physics\.rapier/);
});
test('3i hook: engine.netPart.attach(world) runs for every new World', () => {
  const seen = [];
  const e = createEngine(physGame({ setup: en => { en.netPart = { attach: w => seen.push(w.serial) }; } }));
  e.go('menu');
  assert.equal(seen.length, 2); assert.equal(seen[1], e.world.serial);
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `$UNIT test/world-engine.test.mjs`
Expected: FAIL. `seen` is `undefined` in the first test (`ctx.world` does not exist); the schedule test lacks `lh.world.swap`; `e.builtin is not a function`.

- [ ] **Step 4: Implement** `src/sim/world/install.js`:

```js
// S-3 (overview §4.4): the engine's World seat. Each main scene owns a World made before its enter and disposed after
// its exit; overlays share it. The four lh.* systems are installed once and run whichever World is current, so the
// schedule never changes when scenes change. Sim-pure: Rapier comes from game.physics.rapier (D9).
import { createWorld } from './world.js';
import { checkRapier, PINNED_DEFAULTS } from '../physics/rapier.js';
import { createGroups } from '../physics/groups.js';

// defineGame-time checks of the physics block (§4.1); `fail` prefixes 'defineGame: '
export function checkPhysics(p, fail) {
  if (p === null || typeof p !== 'object') fail('physics must be an object');
  if (p.gravity !== undefined && !(Array.isArray(p.gravity) && p.gravity.length === 3 && p.gravity.every(Number.isFinite))) fail('physics.gravity must be [x, y, z]');
  if (p.params !== undefined && (p.params === null || typeof p.params !== 'object')) fail('physics.params must be an object');
  for (const k of Object.keys(p.params ?? {})) if (!Object.hasOwn(PINNED_DEFAULTS, k)) fail(`physics.params.${k} is not a Rapier 0.21 integration parameter`);
  try { createGroups(p.groups ?? []); } catch (err) { fail(err.message.replace(/^physics: /, 'physics.groups: ')); }
}

export function installWorld(engine, { timer = null } = {}) {
  checkRapier(engine.game.physics?.rapier ?? null); // §4.1: an uninitialised Rapier fails createEngine, not the first spawn
  const seat = {
    current: undefined,
    open() {
      const w = createWorld(engine, { seed: engine.seed, timer });
      seat.current = w;
      engine.netPart?.attach(w); // 3i: present only when the game replicates its World
      return w;
    },
    close() { const w = seat.current; seat.current = undefined; w?.dispose(); },
    digest() { const w = seat.current; return w !== undefined && w.stats.entities > 0 ? w.digest() : undefined; },
  };
  engine.system('lh.world.swap', () => { const w = seat.current; if (w !== undefined) w.sys.swap(); }, { stage: 'input.apply', before: ['lh.ui'] });
  engine.system('lh.physics.step', () => { const w = seat.current; if (w !== undefined) w.sys.step(); }, { stage: 'physics.world' });
  engine.system('lh.physics.read', () => { const w = seat.current; if (w !== undefined) w.sys.read(); }, { stage: 'physics.world', after: ['lh.physics.step'] });
  engine.system('lh.physics.events', () => { const w = seat.current; if (w !== undefined) w.sys.events(); }, { stage: 'physics.world', after: ['lh.physics.read'] });
  return seat;
}
```

- [ ] **Step 5: Edit `src/core/engine.js`.** 3a has changed this file; find each anchor by its text and keep 3a's code around it.

(a) Imports, after `import { createRegistry } from '../sim/replica.js';`:

```js
import { installWorld, checkPhysics } from '../sim/world/install.js';
```

(b) `defineGame`, right after the line `for (const [name, s] of Object.entries(spec.scenes)) for (const h of HOOKS) …`:

```js
  if (spec.physics !== undefined) checkPhysics(spec.physics, fail); // §4.1: gravity, params and groups checked at definition
```

(c) `createEngine`'s options gain `timer = null` (keep every 3a option), and after the `acks`/`record` checks:

```js
  if (timer !== null && typeof timer !== 'function') throw new Error('engine: timer must be a function'); // #106
```

(d) Just before `const enter = (name, a) => {`:

```js
  let worlds; // S-3: the World seat (installWorld, below); worlds.current is the main scene's World
```

(e) In `enter`, after `ctx.load = o => load(entry, o);` (and after whatever 3a added to `ctx`), replace `stack.push(entry); sync();` with:

```js
    Object.defineProperty(ctx, 'world', { get: () => worlds.current }); // main scene and overlays: the main scene's World
    const main = stack.length === 0; // S-3: a main scene's World exists before its enter
    if (main) worlds.open();
    stack.push(entry); sync();
```

and in the same function's `catch (err) { … }`, insert `if (main) worlds.close();` immediately before its `throw err;`.

(f) In `exit`, change the `finally` block to close the main scene's World after its exit hook and cleanup:

```js
finally { for (const rm of scoped) rm(); ui.clear(ctx.name); if (i === 0) worlds.close(); sync(); }
```

(keep any 3a additions in that block before `sync()`).

(g) Builtins. Just before `const handles = type => …`:

```js
  const builtins = new Map(); // §4.4 seam for 3i: engine-level command handlers, run before the game's handler
```

then make `handles` count them:

```js
  const handles = type => builtins.has(type) || Object.hasOwn(game.commands, type) || stack.some(o => o.cmds.get(type)?.some(f => f) === true);
```

and at the top of `deliver`, replace `let ran = false; const gf = …` with:

```js
    let ran = false; const bf = builtins.get(c.type), gf = Object.hasOwn(game.commands, c.type) ? game.commands[c.type] : undefined;
    if (bf) { ran = true; bf(engine, c.data, stack[0]?.ctx); }
```

(the existing `if (gf) { … }` line stays as it is).

(h) In the `engine` object, after `time, scene: sceneView,`:

```js
    get world() { return worlds.current; }, // S-3: the main scene's World (undefined before the first scene)
    builtin(type, fn) { // §4.4: fn(engine, data, mainCtx) before the game's handler, which still runs
      if (typeof type !== 'string' || !type) throw new Error('engine: builtin type must be a non-empty string');
      if (typeof fn !== 'function') throw new Error(`engine: builtin '${type}' needs a function`);
      if (builtins.has(type)) throw new Error(`engine: builtin '${type}' is already registered`);
      builtins.set(type, fn);
      return () => { if (builtins.get(type) === fn) builtins.delete(type); };
    },
```

and replace the `state:` member with:

```js
    state: () => { // engine keys win; `world` only while the World has entities, so un-migrated goldens are unchanged
      const s = { ...(game.state?.(engine) ?? {}), scene: stack[0]?.ctx.name, overlays: stack.slice(1).map(o => o.ctx.name), step };
      const w = worlds.digest(); if (w !== undefined) s.world = w;
      return s;
    },
```

(i) After `schedule.add('lh.events', …);`:

```js
  worlds = installWorld(engine, { timer }); // §4.1, §4.4: checks physics.rapier, adds lh.world.swap and lh.physics.*
```

- [ ] **Step 6: Integrator request 1 (approved before this step, or stop).** In `test/engine.test.mjs` line 232, the built-in schedule now includes the World systems. Replace that line's expected object with:

```js
  assert.deepEqual(e.schedule(), { 'input.apply': ['lh.world.swap', 'lh.ui', 'lh.input', 'lh.commands'], pre: ['lh.scene'], 'physics.world': ['lh.physics.step', 'lh.physics.read', 'lh.physics.events'], post: [], 'events.flush': ['lh.events'] });
```

If the integrator has not approved it, leave the line as is, let that one test fail, and report it; change nothing else in that file.

- [ ] **Step 7: Run, expect PASS**

Run: `$UNIT test/world-engine.test.mjs`
Expected: PASS, 13 tests.
Then the whole engine suite: `$UNIT test/`
Expected: PASS, every existing test unchanged (games without `physics` behave as before; `state()` gains nothing without entities). Record the count in the notes.

- [ ] **Step 8: Prove the ownership test red by mutation**

Temporarily move `if (i === 0) worlds.close();` out of `exit` into `doGo` after `enter(name, a)`. Run `test/world-engine.test.mjs`: "leaving the main scene disposes its World" FAILS (the old World is closed after the new one opens and the seat points at the wrong one). Revert; PASS.

- [ ] **Step 9: Commit**

```bash
git add src/sim/world/install.js src/core/engine.js test/fixtures/phys/game.js test/world-engine.test.mjs test/engine.test.mjs
git commit -m "feat(engine): scene-owned World, lh.world/lh.physics systems, builtin seam, timer and state digest (S-3, #106)"
```

---

## Task 12: Headless world access and the always-on finite check (T-1, T-5)

**Files:**
- Modify: `testing/invariants.js`, `testing/headless.js`
- Create: `test/world-headless.test.mjs`

**Interfaces:**
- Produces:
  - `worldFinite(world, engine)` in `testing/invariants.js`: throws `finite: entity <id> (<tags>) <field> is <value> (seed <s>, step <n>)` for the first non-finite value. Fields: `xf.p.x` … `xf.q.w` (current half, checked first), `xfPrev.p.x` … `xfPrev.q.w`, `linvel.x|y|z`, `angvel.x|y|z`.
  - On the headless handle: `h.world` (getter), `h.find(name, where) → Entity[]` (a bare `name` matches a tag or a `net` kind; `name == null` matches all; `where` is a predicate or a partial object compared with `===` on top-level fields), `h.one(name, where) → e` (throws `headless: one("<name>") found <n> entities (seed s, step n)`), `h.get(id)`, `h.spawn(desc) → e`, `h.despawn(e) → h`, `h.place(e, at, opts) → h`. Without a World, `spawn`/`despawn`/`place` throw `headless: no World (no main scene)`.
  - After every handle step, when `engine.world` has entities, `worldFinite` runs before the user's invariants.
- `invariants.finite` is unchanged.

- [ ] **Step 1: Write the failing test** `test/world-headless.test.mjs`:

```js
// T-1, T-5: headless reaches the World, and a finite check over every pool slot and body velocity runs after each
// step whenever the World has entities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/headless.js';
import { worldFinite } from '../testing/invariants.js';
import { physGame } from './fixtures/phys/game.js';
import countdown from './fixtures/countdown.js';

const farm = (e, ctx) => {
  const w = ctx.world;
  w.spawn({ tags: ['pig'], xf: true, pen: 1 }); w.spawn({ tags: ['pig'], xf: true, pen: 2 }); w.spawn({ net: 'animal', netId: 5, xf: true });
};

test('h.world, find by tag or net kind, where as a predicate or a partial object (T-5)', () => {
  const h = headless(physGame({ build: farm }));
  assert.equal(h.world, h.engine.world);
  assert.equal(h.find('pig').length, 2);
  assert.equal(h.find('pig', { pen: 2 })[0].pen, 2);
  assert.equal(h.find('pig', e => e.pen === 1).length, 1);
  assert.equal(h.find().length, 3);
  assert.equal(h.one('animal').netId, 5);
  assert.throws(() => h.one('pig'), /headless: one\("pig"\) found 2 entities \(seed 1, step 0\)/);
  assert.throws(() => h.one('cow'), /found 0 entities/);
  assert.equal(h.get(3).net, 'animal');
});
test('h.spawn, h.place and h.despawn act on the current World', () => {
  const h = headless(physGame());
  const e = h.spawn({ tags: ['box'], model: 'crate', body: 'dynamic' });
  assert.equal(h.place(e, { at: [1, 2, 3] }), h);
  assert.equal(e.body.translation().x, 1);
  h.step(1);
  assert.equal(h.despawn(e), h);
  assert.deepEqual(h.find('box'), []);
});
test('finite is always on: a NaN pose fails the next step with entity, field, seed and step (T-1)', () => {
  const h = headless(physGame({ build: (e, ctx) => ctx.world.spawn({ tags: ['bird'], xf: true }) }), { seed: 9 });
  h.step(2);
  h.one('bird').xf.p.y = NaN;
  assert.throws(() => h.step(1), /^Error: finite: entity 1 \(bird\) xf\.p\.y is NaN \(seed 9, step 3\)$/);
});
test('worldFinite checks body velocities too', () => {
  const pool = new Float64Array(14); pool[6] = 1; pool[13] = 1;
  const body = { linvel: () => ({ x: 0, y: Infinity, z: 0 }), angvel: () => ({ x: 0, y: 0, z: 0 }) };
  const world = { xf: { pool, stride: 14 }, with: () => [{ id: 4, tags: new Set(['car', 'red']), xf: { slot: 0 }, body }] };
  assert.throws(() => worldFinite(world, { seed: 2, time: { step: 7 } }), /finite: entity 4 \(car,red\) linvel\.y is Infinity \(seed 2, step 7\)/);
});
test('games without World entities run exactly as before', () => {
  const h = headless(countdown, { scene: 'race' });
  h.step(10);
  assert.equal(h.world.stats.entities, 0);
  assert.equal('world' in h.state(), false);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-headless.test.mjs`
Expected: FAIL: `worldFinite` is not exported (SyntaxError on import).

- [ ] **Step 3: Implement.** Append to `testing/invariants.js`:

```js
// [T-1] the always-on finite check over the World (run by headless after each step while the World has entities):
// every pool slot (current half first, then previous) and every body's velocities.
const SLOT_FIELDS = ['xfPrev.p.x', 'xfPrev.p.y', 'xfPrev.p.z', 'xfPrev.q.x', 'xfPrev.q.y', 'xfPrev.q.z', 'xfPrev.q.w',
  'xf.p.x', 'xf.p.y', 'xf.p.z', 'xf.q.x', 'xf.q.y', 'xf.q.z', 'xf.q.w'];
const SLOT_ORDER = [7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6];
export function worldFinite(world, engine) {
  const pool = world.xf.pool, S = world.xf.stride, all = world.with();
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const bad = (field, v) => { throw new Error(`finite: entity ${e.id} (${[...e.tags].join(',')}) ${field} is ${v} (seed ${engine.seed}, step ${engine.time.step})`); };
    const slot = e.xf?.slot;
    if (slot !== undefined) for (const k of SLOT_ORDER) { const v = pool[slot * S + k]; if (!Number.isFinite(v)) bad(SLOT_FIELDS[k], v); }
    if (e.body) {
      for (const [name, v] of [['linvel', e.body.linvel()], ['angvel', e.body.angvel()]]) {
        for (const a of ['x', 'y', 'z']) if (!Number.isFinite(v[a])) bad(`${name}.${a}`, v[a]);
      }
    }
  }
}
```

In `testing/headless.js` (3a has edited it; locate by text):

Add to the imports:

```js
import { worldFinite } from './invariants.js';
```

In the per-step function (`const one = (f, k) => { … }`), insert before `for (const inv of invariants) inv(h);`:

```js
    const w = engine.world; if (w !== undefined && w.stats.entities > 0) worldFinite(w, engine); // [T-1] always on
```

Add, just before `const h = {`:

```js
  const needWorld = () => { const w = engine.world; if (!w) throw new Error('headless: no World (no main scene)'); return w; };
  const whereFn = where => where === undefined ? null : typeof where === 'function' ? where
    : e => { for (const k of Object.keys(where)) if (e[k] !== where[k]) return false; return true; };
```

Add these members to `h` (after `state`/`checksum`):

```js
    get world() { return engine.world; }, // [T-5]
    find(name, where) { // a bare name matches a tag or a net kind; where: predicate or partial object (===)
      const w = engine.world, test = whereFn(where), out = [];
      if (!w) return out;
      for (const e of w.with()) if ((name == null || e.tags.has(name) || e.net === name) && (!test || test(e))) out.push(e);
      return out;
    },
    one(name, where) {
      const r = h.find(name, where);
      if (r.length !== 1) throw new Error(`headless: one(${JSON.stringify(name)}) found ${r.length} entities (seed ${engine.seed}, step ${engine.time.step})`);
      return r[0];
    },
    get: id => engine.world?.get(id),
    spawn: desc => needWorld().spawn(desc),
    despawn(e) { needWorld().despawn(e); return h; },
    place(e, at, opts) { needWorld().place(e, at, opts); return h; },
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-headless.test.mjs test/headless.test.mjs test/replay.test.mjs`
Expected: PASS (5 new tests; the existing headless and replay tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add testing/invariants.js testing/headless.js test/world-headless.test.mjs
git commit -m "feat(test): headless World access and the always-on finite check over xf and bodies (T-1, T-5)"
```

---

## Task 13: checks.determinism and checks.simPurity (T-10, T-12)

**Files:**
- Create: `testing/checks.js`
- Create: `test/checks-determinism.test.mjs`

**Interfaces:**
- Produces in `testing/checks.js` (the integrator re-exports `checks` from `lion-hawk/test`):
  - `determinism(game, { seed = 1, steps = 600, input, scene, args } = {}) → { ok, step, a, b }`. Runs the game twice, one run after the other, from the same seed, scene and args, and compares `checksum(engine.state())` before the first step and after every step. `step` is the first step whose checksums differ (`-1` when `ok`); `a`/`b` are that step's checksums (the last ones when `ok`). `input` (controller ruling): a function `(step) → snapshot` called with the step about to run, a named policy of the game, or a constant snapshot object. Each run's World is disposed afterwards.
  - `simPurity(game, { roots }) → { ok, found }`: `scanPurity(roots)`. Throws `checks.simPurity: pass { roots: [dirs or files] }` without roots.
  - `checks = { determinism, simPurity, zeroAlloc, materials }` (Tasks 14 and 15 fill in the last two).

- [ ] **Step 1: Write the failing test** `test/checks-determinism.test.mjs`:

```js
// T-10, T-12: two runs agree step for step; a run that leaks state into the next is caught at the exact step;
// purity is scanned over the roots a game names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { determinism, simPurity } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';
import { actions, axis } from '../src/core/actions.js';

export const yard = (e, ctx) => {
  const w = ctx.world, r = e.rng('yard');
  w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [20, 0.5, 20], p: [0, -0.5, 0], material: 'gravel' }], groups: { member: ['ground'] } });
  for (let i = 0; i < 12; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-3, 3), 1 + i * 1.2, r.range(-3, 3)], yaw: r.range(0, 6), tags: ['crate'] });
};

test('determinism: two runs of a physics scene agree at every step (T-10)', () => {
  const res = determinism(physGame({ build: yard }), { seed: 7, steps: 240 });
  assert.equal(res.ok, true); assert.equal(res.step, -1);
  assert.match(res.a, /^[0-9a-f]{8}$/); assert.equal(res.a, res.b);
});
test('determinism names the first step where state leaked from the first run differs', () => {
  let runs = 0; // module state shared by the two runs, on purpose
  const leaky = physGame({ build: (e, ctx) => { yard(e, ctx); runs++; },
    tick: (e, dt, ctx) => { if (e.time.step === 100 && runs > 1) ctx.world.get(2).body.applyImpulse({ x: 50, y: 0, z: 0 }, true); } });
  const res = determinism(leaky, { seed: 7, steps: 240 });
  assert.equal(res.ok, false); assert.equal(res.step, 101); assert.notEqual(res.a, res.b);
});
test('determinism takes args and an input function of the step (controller ruling)', () => {
  const seen = [];
  const game = physGame({ actions: actions({ push: axis() }), build: (e, ctx) => { yard(e, ctx); seen.push(ctx.args?.crates); },
    tick: (e, dt, ctx) => { if (e.input.snapshot.push > 0) ctx.world.get(2).body.applyImpulse({ x: e.input.snapshot.push, y: 0, z: 0 }, true); } });
  const res = determinism(game, { seed: 3, steps: 120, args: { crates: 4 }, input: step => ({ push: step % 30 === 0 ? 1 : 0 }) });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, [4, 4]);
});
test('simPurity scans the given roots and reports each hit (T-12)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lh-purity-'));
  try {
    writeFileSync(join(dir, 'ok.js'), 'export const a = 1;\n');
    assert.deepEqual(simPurity(null, { roots: [dir] }), { ok: true, found: [] });
    writeFileSync(join(dir, 'bad.js'), 'export const t = () => Date.now();\n');
    const r = simPurity(null, { roots: [dir] });
    assert.equal(r.ok, false); assert.equal(r.found[0].rule, 'wall-clock'); assert.equal(r.found[0].line, 1);
    assert.throws(() => simPurity(null, {}), /checks\.simPurity: pass \{ roots: \[dirs or files\] \}/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the World and physics sources are sim-pure', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(simPurity(null, { roots: [`${root}src/sim/world`, `${root}src/sim/physics`] }).found, []);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/checks-determinism.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `testing/checks.js`.

- [ ] **Step 3: Implement** `testing/checks.js`:

```js
// T-10, T-12, T-13, T-14 (overview §4.4): whole-game checks a game's npm test calls. Node only.
import v8 from 'node:v8';
import vm from 'node:vm';
import { headless } from './headless.js';
import { scanPurity } from './purity.js';
import { createEngine } from '../src/core/engine.js';

// input (controller ruling): a function (step) → snapshot, a named policy of the game, or a constant snapshot
const policyOf = (game, input) => {
  if (input == null) return null;
  if (typeof input === 'function') return (h, i, s) => input(h.engine.time.step);
  if (typeof input === 'string') {
    if (!Object.hasOwn(game.policies ?? {}, input)) throw new Error(`checks: no policy '${input}'`);
    return game.policies[input];
  }
  return () => input;
};

// [T-10] two runs, one after the other, compared before the first step and after every step
export function determinism(game, { seed = 1, steps = 600, input, scene, args } = {}) {
  const pol = policyOf(game, input);
  const run = () => {
    const h = headless(game, { seed, scene, args }), sums = [h.checksum()];
    try { for (let i = 0; i < steps; i++) { h.step(1, pol ? (x, k, s) => pol(x, i, s) : undefined); sums.push(h.checksum()); } }
    finally { h.engine.world?.dispose(); }
    return sums;
  };
  const a = run(), b = run();
  for (let i = 0; i <= steps; i++) if (a[i] !== b[i]) return { ok: false, step: i, a: a[i], b: b[i] };
  return { ok: true, step: -1, a: a[steps], b: b[steps] };
}

// [T-12] the static purity scan over the roots the game names (its sim tree)
export function simPurity(game, { roots } = {}) {
  if (!Array.isArray(roots) || !roots.length) throw new Error('checks.simPurity: pass { roots: [dirs or files] }');
  const found = scanPurity(roots);
  return { ok: found.length === 0, found };
}

export const checks = { determinism, simPurity };
```

Note: `h.step(1, fn)` resets the policy index each call, so the wrapper passes the run's own step counter `i`; a named policy therefore sees `i` counting from 0 across the whole run, as it would under one long `h.step(steps, policy)`.

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/checks-determinism.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add testing/checks.js test/checks-determinism.test.mjs
git commit -m "feat(test): checks.determinism and checks.simPurity (T-10, T-12)"
```

---

## Task 14: checks.zeroAlloc (T-13) **(judgment)**

**Files:**
- Modify: `testing/checks.js`
- Create: `test/checks-alloc.test.mjs`

**Interfaces:**
- Produces: `zeroAlloc(game, { steps = 10000, warm = 600, seed = 1, scene, args, input, limit = 65536 } = {}) → { ok, growth, steps }`. It drives a plain `createEngine` (not `headless`, whose event log keeps every event): `warm` steps, two full GCs, the heap size, `steps` more steps, two full GCs, the heap size again; `growth` is the retained difference in bytes and `ok` is `growth < limit`. `input` as in `determinism`. The World is disposed afterwards.
- Decision (judgment): when Node runs without `--expose-gc`, `zeroAlloc` enables it in-process (`v8.setFlagsFromString('--expose-gc')` then `vm.runInNewContext('gc')`) rather than in a child process: the game is an object, which cannot cross a process boundary, and games call `checks.zeroAlloc(game)` from their own test files. Record this as a contract issue (overview §4.4 says "a child process").

- [ ] **Step 1: Write the failing test** `test/checks-alloc.test.mjs`:

```js
// T-13: retained heap growth over many steps of a physics scene stays under 64 KB; a system that keeps what it
// allocates is caught. This file runs without --expose-gc on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroAlloc } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';

const scene = (e, ctx) => {
  const w = ctx.world, r = e.rng('alloc');
  w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [30, 0.5, 30], p: [0, -0.5, 0], material: 'gravel' }] });
  for (let i = 0; i < 30; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-8, 8), 1 + i * 0.6, r.range(-8, 8)], tags: ['crate'] });
  w.spawn({ tags: ['marker'], xf: true });
};
const tick = (e, dt, ctx) => {
  const m = ctx.world.with('xf');
  m[m.length - 1].xf.p.x += dt;               // a bodiless entity moved by game code
  ctx.world.with('body', 'model');            // a cached query, every step
};

test('zeroAlloc: 30 crates, a moving marker and per-step queries retain under 64 KB (T-13)', { timeout: 300000 }, () => {
  assert.equal(typeof globalThis.gc, 'undefined', 'run without --expose-gc: zeroAlloc enables it itself');
  const r = zeroAlloc(physGame({ build: scene, tick }), { steps: 3000 });
  assert.equal(r.ok, true, `retained ${r.growth} bytes`);
  assert.equal(r.steps, 3000);
});
test('zeroAlloc catches a system that keeps what it allocates', { timeout: 300000 }, () => {
  const kept = [];
  const r = zeroAlloc(physGame({ build: scene, tick: (e, dt, ctx) => { tick(e, dt, ctx); kept.push(new Float64Array(16)); } }), { steps: 3000 });
  assert.equal(r.ok, false);
  assert.ok(r.growth > 64 * 1024, `${r.growth}`);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/checks-alloc.test.mjs`
Expected: FAIL, `SyntaxError: The requested module '../testing/checks.js' does not provide an export named 'zeroAlloc'`.

- [ ] **Step 3: Implement.** In `testing/checks.js`, add before `export const checks`:

```js
// [T-13] full GCs without --expose-gc: enable the flag in this process (the game object cannot cross into a child)
let vmGc = null;
function collector() {
  if (typeof globalThis.gc === 'function') return globalThis.gc;
  if (vmGc === null) { v8.setFlagsFromString('--expose-gc'); vmGc = vm.runInNewContext('gc'); }
  return vmGc;
}
// Retained heap growth over `steps` engine steps after `warm` (JIT and rings settle). Rapier's per-call vectors are
// garbage and do not count; anything kept does.
export function zeroAlloc(game, { steps = 10000, warm = 600, seed = 1, scene, args, input, limit = 64 * 1024 } = {}) {
  const gc = collector(), engine = createEngine(game, { seed, scene, args }), pol = policyOf(game, input);
  const scratch = {}, h = { engine, seed: engine.seed };
  const run = (from, n) => { for (let i = 0; i < n; i++) { if (pol) engine.input.set(pol(h, from + i, scratch)); engine.stepN(1); } };
  try {
    run(0, warm);
    gc(); gc();
    const before = v8.getHeapStatistics().used_heap_size;
    run(warm, steps);
    gc(); gc();
    const growth = v8.getHeapStatistics().used_heap_size - before;
    return { ok: growth < limit, growth, steps };
  } finally { engine.world?.dispose(); }
}
```

and change the last line to:

```js
export const checks = { determinism, simPurity, zeroAlloc };
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/checks-alloc.test.mjs`
Expected: PASS, 2 tests. If the clean run reports growth over 64 KB, do not raise the limit: find what grows (`--heapsnapshot-near-heap-limit` is not needed; compare two `v8.getHeapSnapshot()` dumps around the steps in a scratch script) and fix it in engine code, or report it as a finding with numbers if it is inside Rapier's JS wrappers.

- [ ] **Step 5: Commit**

```bash
git add testing/checks.js test/checks-alloc.test.mjs
git commit -m "feat(test): checks.zeroAlloc measures retained heap growth over a physics run (T-13)"
```

---

## Task 15: checks.materials (T-14)

**Files:**
- Modify: `testing/checks.js`
- Create: `test/checks-materials.test.mjs`

**Interfaces:**
- Consumes: the registry (`has`, `hash`), `game.defs.models` (`phys.json`: `{ materials, models: { id: { colliders } } }`).
- Produces: `materials(game, { inline = [] } = {}) → { ok, missing: [{ where, material }], hash: { phys, registry, ok } }`. `missing` lists every sidecar collider (`models.<id>.colliders[<i>]`) and every `inline` entry (`inline[<i>]`, any object with `material`, for inline-collider fixtures and `world.heightfield` calls) whose material the registry lacks, in that order. `hash.ok` is `phys.json.materials === registry.hash` (true when the game has no `defs.models`). Without `defs.materials`, throws `checks.materials: the game has no defs.materials` (until Task 17 makes the base library the default).

- [ ] **Step 1: Write the failing test** `test/checks-materials.test.mjs`:

```js
// T-14: every material a game's sidecars and inline colliders name exists, and phys.json was baked against this
// registry (its hash).
import test from 'node:test';
import assert from 'node:assert/strict';
import { materials } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };

test('fixture sidecars and inline entries all resolve and the hash matches (T-14)', () => {
  const r = materials(physGame(), { inline: [{ material: 'gravel' }, { shape: 'sphere', r: 1, material: 'grass' }] });
  assert.deepEqual(r, { ok: true, missing: [], hash: { phys: '5ca1ab1e', registry: '5ca1ab1e', ok: true } });
});
test('every missing material is named, and a stale registry hash fails', () => {
  const phys = structuredClone(PHYS);
  phys.materials = 'deadbeef';
  phys.models.crate.colliders[0].material = 'balsa';
  const r = materials(physGame({ defs: { models: phys } }), { inline: [{ material: 'mud' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ where: 'models.crate.colliders[0]', material: 'balsa' }, { where: 'inline[0]', material: 'mud' }]);
  assert.deepEqual(r.hash, { phys: 'deadbeef', registry: '5ca1ab1e', ok: false });
});
test('a hash mismatch alone fails; a game without models has nothing to compare', () => {
  const phys = { ...structuredClone(PHYS), materials: '00000000' };
  assert.equal(materials(physGame({ defs: { models: phys } })).ok, false);
  const none = materials(physGame({ defs: { models: undefined } }));
  assert.deepEqual(none, { ok: true, missing: [], hash: { phys: null, registry: '5ca1ab1e', ok: true } });
});
test('a game without defs.materials is refused until the base library is the default (Task 17)', () => {
  assert.throws(() => materials(physGame({ defs: { materials: undefined } })), /checks\.materials: the game has no defs\.materials/);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/checks-materials.test.mjs`
Expected: FAIL: no export named `materials`.

- [ ] **Step 3: Implement.** In `testing/checks.js`, add before `export const checks`:

```js
// [T-14] material references: sidecar colliders and the inline entries a game lists, plus the registry hash phys.json
// was baked against. A missing one would also throw at spawn; this names all of them at once.
export function materials(game, { inline = [] } = {}) {
  const reg = game.defs?.materials;
  if (!reg) throw new Error('checks.materials: the game has no defs.materials');
  const phys = game.defs?.models ?? null, missing = [];
  for (const [id, sc] of Object.entries(phys?.models ?? {})) {
    (sc.colliders ?? []).forEach((c, i) => { if (!reg.has(c.material)) missing.push({ where: `models.${id}.colliders[${i}]`, material: c.material }); });
  }
  inline.forEach((c, i) => { if (!reg.has(c.material)) missing.push({ where: `inline[${i}]`, material: c.material }); });
  const hash = { phys: phys?.materials ?? null, registry: reg.hash, ok: phys === null || phys.materials === reg.hash };
  return { ok: missing.length === 0 && hash.ok, missing, hash };
}
```

and the last line becomes:

```js
export const checks = { determinism, simPurity, zeroAlloc, materials };
```

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/checks-materials.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add testing/checks.js test/checks-materials.test.mjs
git commit -m "feat(test): checks.materials over sidecars, inline entries and the registry hash (T-14)"
```

---
## Task 16: A full physics scene: determinism, tape with clear(), replay mismatch (constraint 2)

**Files:**
- Create: `test/world-replay.test.mjs`

**Interfaces:**
- Consumes: everything above; `testing/replay.js` (`replay`), `testing/headless.js` (`record: true`, `h.tape()`).
- Produces: no code. This task is the "every new sim feature gets a checks.determinism test and a headless replay" gate for the whole World: ground, a heightfield, stacked crates with contact events, sleeping posts (#2), a cart with `body.mass` and a material override, a jointed tow, a sensor zone, a bodiless marker moved by game code, a despawn/respawn every 90 steps (slot reuse), and a `rebuild` command that calls `world.clear()` mid-tape.

- [ ] **Step 1: Write the test** `test/world-replay.test.mjs`:

```js
// The World end to end: a scene that uses every 3c feature runs twice identically, records a tape that clears and
// rebuilds the World mid-run, and replays it; a game that rebuilds differently fails the replay at a named step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/headless.js';
import { replay } from '../testing/replay.js';
import { determinism } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';

function makeGame({ extra = false } = {}) {
  const build = (e, ctx) => {
    const w = ctx.world, r = e.rng('yard');
    w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [30, 0.5, 30], p: [0, -0.5, 0], material: 'gravel' }], groups: { member: ['ground'] } });
    const n = 12, heights = Array.from({ length: n * n }, (_, i) => 0.05 * (i % n) + 0.02 * Math.floor(i / n));
    w.heightfield({ nx: n, nz: n, cell: 1, x0: 10, z0: 10, heights, material: 'grass' });
    for (let i = 0; i < 8; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-4, 4), 0.6 + i * 1.1, r.range(-4, 4)], yaw: r.range(0, 6.28), tags: ['crate'], crate: { i }, contacts: { min: 1 } });
    for (let i = 0; i < 3; i++) w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }], at: [6 + i, 0.6, -6], groups: { member: ['prop'] } });
    const cart = w.spawn({ model: 'cart', body: { type: 'dynamic', mass: 300 }, at: [-8, 0.5, 0], tags: ['cart'], material: { wheel: 'rubber' } });
    const tow = w.spawn({ model: 'crate', body: 'dynamic', at: [-10.2, 0.5, 0], tags: ['tow'] });
    w.joint(cart, tow, w.R.JointData.spherical({ x: -1.2, y: 0.3, z: 0 }, { x: 0.8, y: 0.5, z: 0 }));
    w.spawn({ tags: ['zone'], body: 'fixed', sensor: true, colliders: [{ shape: 'box', half: [2, 2, 2], material: 'air' }], at: [0, 1, 0] });
    ctx.state.marker = w.spawn({ tags: ['marker'], xf: true, at: [0, 2, 0] });
  };
  const tick = (e, dt, ctx) => {
    const w = ctx.world;
    ctx.state.marker.xf.p.x += dt;
    if (e.time.step % 90 === 89) { // the oldest crate goes; a new one takes its pool slot
      const old = w.with('crate')[0], r = e.rng('yard');
      ctx.state.freed = old.xf.slot;
      w.despawn(old);
      ctx.state.reused = w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-4, 4), 6, r.range(-4, 4)], tags: ['crate'], crate: { i: -1 }, contacts: { min: 1 } }).xf.slot;
    }
  };
  return physGame({
    id: 'yard-replay', build, tick,
    setup: e => { e.events.on(ev => { const s = e.scene.state; if (ev.type === 'contact') s.contacts = (s.contacts ?? 0) + 1; else if (ev.type === 'sensor') s.sensors = (s.sensors ?? 0) + 1; }); },
    state: e => ({ contacts: e.scene.state.contacts ?? 0, sensors: e.scene.state.sensors ?? 0 }),
    commands: { rebuild: (e, d, ctx) => { ctx.world.clear(); build(e, ctx); if (extra) ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 8, 0], tags: ['crate'], crate: { i: 99 } }); } },
  });
}

test('the full scene is deterministic over 600 steps (T-10)', { timeout: 300000 }, () => {
  const r = determinism(makeGame(), { seed: 3, steps: 600 });
  assert.equal(r.ok, true, `first difference at step ${r.step}`);
});
test('the scene exercises what it claims: contacts, sensors, sleeping posts, slot reuse', () => {
  const h = headless(makeGame(), { seed: 3 });
  h.step(120);
  const s = h.scene.state;
  assert.ok(s.contacts > 0 && s.sensors > 0, `contacts ${s.contacts}, sensors ${s.sensors}`);
  assert.ok(h.find('post').every(p => p.body.isSleeping()), 'untouched posts stay asleep (#2)');
  assert.equal(s.reused, s.freed, 'the respawned crate took the freed slot');
  assert.ok(Math.abs(s.marker.xf.p.x - 2) < 1e-9, 'the marker moved 1/60 per step');
  assert.equal(h.state().world.n, h.world.stats.entities);
  h.world.dispose();
});
test('a tape that clears and rebuilds the World replays exactly; ids restart', { timeout: 300000 }, () => {
  const game = makeGame(), h = headless(game, { seed: 3, record: true });
  const cartId = h.one('cart').id;
  h.step(200); h.command('rebuild', {}); h.step(200);
  assert.equal(h.one('cart').id, cartId, 'clear() restarts ids, so the rebuild gives the same ids');
  const tape = h.tape(), end = h.checksum();
  const r = replay(game, tape);
  assert.equal(r.checksum(), end);
  h.world.dispose(); r.world.dispose();
});
test('a game that rebuilds differently fails the replay at a named step', { timeout: 300000 }, () => {
  const h = headless(makeGame(), { seed: 3, record: true });
  h.step(200); h.command('rebuild', {}); h.step(100);
  const tape = h.tape();
  h.world.dispose();
  assert.throws(() => replay(makeGame({ extra: true }), tape), /replay: checksum differs at step (2[0-9]{2}|300)/);
});
```

- [ ] **Step 2: Run, expect PASS** (this task adds no code: the step proves the integration)

Run: `$UNIT test/world-replay.test.mjs`
Expected: PASS, 4 tests. A failure here is a bug in Tasks 2–15: find it with `checks.determinism`'s step and fix it in that task's file, with a regression test in that task's test file.

- [ ] **Step 3: Prove it can fail by mutation**

Temporarily make `pool.alloc()` hand out the **highest** free slot instead of the lowest (scan down from the top). Run the file: "slot reuse" FAILS. Separately, make `clear()` keep `nextId` (delete `nextId = 1;`): the tape test FAILS on the cart id. Revert both; PASS.

- [ ] **Step 4: Commit**

```bash
git add test/world-replay.test.mjs
git commit -m "test(world): full physics scene is deterministic and replays across clear()"
```

---

## Task 17: The base library as the default registry (after 3b merges)

**Precondition:** 3b is merged into `phase-3`, and `phase-3-world` has been rebased (or `phase-3` merged in). If 3c finishes first, this task becomes Integrator request 3 and is done at the Wave A merge.

**Files:**
- Modify: `src/sim/world/world.js`, `testing/checks.js`
- Modify: `test/world-bodies.test.mjs` (replace the "a collider needs a registry" test), `test/checks-materials.test.mjs` (replace the "refused" test)
- Create: `test/world-base-materials.test.mjs`

**Interfaces:**
- Consumes: 3b's `defineMaterials` (`src/defs/materials.js`), §4.2.
- Produces: §4.1 "`defs.materials` defaults to a registry of the base library only" for the World and `checks.materials`.

- [ ] **Step 1: Write the failing test** `test/world-base-materials.test.mjs`:

```js
// §4.1: a game without defs.materials gets the base library; the World works on 3b's real registry exactly as on
// the fixture (√f with Multiply, density from sg × 1000 × fill).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { defineMaterials } from '../src/defs/materials.js';
import { materials } from '../testing/checks.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { physGame } from './fixtures/phys/game.js';

test('without defs.materials the World uses the base library', () => {
  const w = createWorld(stubEngine({ materials: null }));
  try {
    assert.ok(w.materials.has('steel') && w.materials.has('air'));
    const e = w.spawn({ tags: ['ball'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.5, material: 'steel' }] });
    assert.ok(Math.abs(e.colliders[0].collider.friction() - w.materials.collider('steel').friction) < 1e-6);
  } finally { w.dispose(); }
});
test("a game's own materials: √f and density as 3b computes them", () => {
  const reg = defineMaterials({ slick: { extends: 'ice', phys: { friction: 0.25, sg: 1 } } });
  const w = createWorld(stubEngine({ materials: reg }));
  try {
    const e = w.spawn({ tags: ['block'], body: 'dynamic', colliders: [{ shape: 'box', half: [0.5, 0.5, 0.5], material: 'slick' }] });
    assert.ok(Math.abs(e.colliders[0].collider.friction() - 0.5) < 1e-6);
    assert.ok(Math.abs(e.body.mass() - reg.density('slick')) / reg.density('slick') < 1e-4); // 1 m³
  } finally { w.dispose(); }
});
test('checks.materials defaults to the base library too', () => {
  const r = materials(physGame({ defs: { materials: undefined, models: undefined } }), { inline: [{ material: 'gravel' }] });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `$UNIT test/world-base-materials.test.mjs`
Expected: FAIL: the first test throws `needs a material registry: set defs.materials`.

- [ ] **Step 3: Implement.** In `src/sim/world/world.js` add the import and a lazy default:

```js
import { defineMaterials } from '../../defs/materials.js';

let BASE = null; // §4.1: defs.materials defaults to the base library only; built once, on first need
const baseRegistry = () => (BASE ??= defineMaterials({}));
```

and change the registry line in `createWorld` to:

```js
  const registry = opts.materials != null ? opts.materials : game.defs?.materials ?? baseRegistry();
```

In `testing/checks.js` `materials()`, replace the throw with the same default:

```js
import { defineMaterials } from '../src/defs/materials.js';
// …
  const reg = game.defs?.materials ?? defineMaterials({});
```

In `test/world-bodies.test.mjs`, replace the test "a collider needs a registry: without one the spawn says so" with:

```js
test('without a registry the base library applies: base ids resolve, game ids do not', () => {
  const w = createWorld(stubEngine({ materials: null }));
  try {
    assert.equal(w.spawn({ tags: ['ok'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.3, material: 'rubber' }] }).colliders[0].material, 'rubber');
    assert.throws(() => w.spawn({ model: 'cart', body: 'dynamic' }), /world: 'cart' unknown material 'shell' on collider 0 \(body\)/);
  } finally { w.dispose(); }
});
```

In `test/checks-materials.test.mjs`, replace the test "a game without defs.materials is refused…" with:

```js
test('a game without defs.materials is checked against the base library', () => {
  const r = materials(physGame({ defs: { materials: undefined, models: undefined } }), { inline: [{ material: 'shell' }] });
  assert.deepEqual(r.missing, [{ where: 'inline[0]', material: 'shell' }]);
});
```

and update the `materials()` interface text above (Task 15) in the notes: the throw is gone.

- [ ] **Step 4: Run, expect PASS**

Run: `$UNIT test/world-base-materials.test.mjs test/world-bodies.test.mjs test/checks-materials.test.mjs`, then `$UNIT test/`.
Expected: PASS. If 3b's base library lacks a name the fixtures assume, the fixtures stay as they are (they are the stand-in); only the new file uses 3b's ids.

- [ ] **Step 5: Commit**

```bash
git add src/sim/world/world.js testing/checks.js test/world-base-materials.test.mjs test/world-bodies.test.mjs test/checks-materials.test.mjs
git commit -m "feat(world): the base material library is the default registry (§4.1)"
```

---

## Done when

- Every new file passes under `$UNIT`:
  - Task 1: `physics-fixtures` (4); Task 2: `physics-rapier` (8); Task 3: `physics-groups` (4); Task 4: `physics-heightfield` (3); Task 5: `world-pool` (6); Task 6: `world-place` (6); Task 7: `physics-events` (4); Task 8: `physics-colliders` (6); Task 9: `world-entities` (9), `world-bodies` (11); Task 10: `world-step` (10); Task 11: `world-engine` (13); Task 12: `world-headless` (5); Task 13: `checks-determinism` (5); Task 14: `checks-alloc` (2); Task 15: `checks-materials` (4); Task 16: `world-replay` (4); Task 17: `world-base-materials` (3).
  - 107 new tests, give or take the counts the implementer records per task in the notes.
- The whole engine suite passes: `$UNIT test/`, including `test/engine.test.mjs` with Integrator request 1 applied, `test/purity.test.mjs` (now scanning `src/sim/world` and `src/sim/physics`), and every existing golden and replay test unchanged.
- No file under `src/` imports `@dimforge/rapier3d-compat`: `grep -rn "rapier3d" src/` prints only comments.
- The notes file has the per-task table, every "Contract issue" below with what was done, and the field note candidates.
- Merge point: the integrator merges `phase-3-world` into `phase-3` with `--no-ff` together with 3b and 3d as Wave A (engine 0.8.0). Task 17 lands before that merge if 3b is already on `phase-3`, otherwise at it.

## Notes stub

File: `docs/plans/2026-10-13-phase-3c-world-notes.md` (created in Task 1). Sections: "Progress" (task, commit, test counts, notes), "Contract issues met", "Field note candidates". Candidates already known:
- #1 closed: `PINNED_DEFAULTS` pins every Rapier 0.21 integration parameter; a bump fails one test.
- #2 closed: `body: { sleep: true }` re-sleeps after the first step inside the World.
- #28 closed: the World owns the Rapier world; view halves read `engine.world`.
- #64 closed: the always-on `finite` over the pool and body velocities.
- #106 closed: `createEngine(game, { timer })` fills `world.stats.stepMs`/`stepMsTotal`.
- Rapier collider handles are NaN-boxed float64s (handle 0 is valid and falsy): never test a handle for truthiness.
- `setDensity` and `setAdditionalMassProperties` take effect at the next step unless `recomputeMassPropertiesFromColliders()` is called; the World always calls it.
- Moving a fixed body needs `propagateModifiedBodyPositionsToColliders()` before queries see it.
- A body can fall asleep at the end of the step that moved it: the World reads it once more.
- Whether the "read after sleep" mutation in Task 10 was observable in 0.21.0.

## Integrator requests

1. **`test/engine.test.mjs:232`** (needed in Task 11): the exact built-in schedule now includes the World systems. Replace the expected object with `{ 'input.apply': ['lh.world.swap', 'lh.ui', 'lh.input', 'lh.commands'], pre: ['lh.scene'], 'physics.world': ['lh.physics.step', 'lh.physics.read', 'lh.physics.events'], post: [], 'events.flush': ['lh.events'] }`, or let 3c's Task 11 make that one-line change.
2. **Exports at the Wave A merge** (§3.2): `src/index.sim.js` gains `export { createWorld } from './sim/world/world.js';` and `export { heightfieldDesc } from './sim/physics/heightfield.js';`; `testing/index.js` gains `export { checks } from './checks.js';`.
3. **Task 17 if 3b merges after 3c**: the base-library default registry in `src/sim/world/world.js` and `testing/checks.js`, with its tests, at the Wave A merge.
4. **Cross-plan (3e):** `boot(game, view, { timer })` passes `timer` through to `createEngine` (§4.5 "Timing"); 3c accepts it in `createEngine` only.
5. **Spec and field notes at 0.8.0:** spec T-1 (finite over pool and velocities is built), E-10 (`e.xf.slot`, copy-not-flip), R-6 (`lh.world.swap`, `lh.physics.*`); field notes #1, #2, #28, #64, #106 statuses from the notes file.

## Contract issues

- **Contract issue: default groups.** §4.4 says `groups` defaults to "member [], filter all". In Rapier a membership of 0 touches nothing. 3c treats an omitted `member` or `filter` as every group (Rapier's own default); an explicit `member: []` still means none.
- **Contract issue: the view needs each entity's pool slot.** §4.4 gives `world.xf = { pool, stride }` but no way to find an entity's slot. 3c adds a read-only `e.xf.slot`; 3g reads `world.xf.pool[e.xf.slot * 14 + …]` (prev at +0, curr at +7) and must re-read `world.xf.pool` each frame (it is replaced when the pool grows).
- **Contract issue: raw colliders in events.** `contact.a`/`b`, `materials[i]`, `sensor.sensor`/`other` are `null` for a collider no entity owns.
- **Contract issue: `body.lock: { x, y, z }`** is read as per-axis rotation locks (`true` = locked); `{ rot: true }` locks all rotations. Translation locks stay raw Rapier (L-1).
- **Contract issue: colliders without `body`** sit on a fixed body (so `place`, `xf` and `entityOf` behave the same for static scenery).
- **Contract issue: inline shapes.** `'sphere'` only (§4.4's example `'ball'` is wrong, 3b ruling); `box` takes an optional `round` (Rapier `roundCuboid`, controller ruling for Rally's hull).
- **Contract issue: additive World members.** `world.engine` (3h), `world.net` (writable slot, 3i), `world.own(fn)` World-scoped frees on clear/dispose (3h) besides `own(e, fn)`, `world.onSpawn`/`onDespawn`, `world.dispose`/`disposed`, `world.sys` (engine-internal step pieces), `world.audit()` (stands in for "flagged under ?debug": the sim has no flags), `world.with()` with no parts = every entity, at most 4 parts. `world.net?.guard(op, eOrDesc, value)` runs on spawn (with the desc) and despawn of entities with a `net` part and on `add`/`remove` of `net`, never from `clear()`; `installWorld` calls `engine.netPart?.attach(world)` for each new World (3i's seams).
- **Contract issue: `checks.zeroAlloc` without `--expose-gc`** enables GC in-process (`v8.setFlagsFromString` + `vm`) instead of a child process: the game object cannot cross a process boundary.
- **Contract issue: `checks.materials(game, { inline })`.** Inline colliders and `world.heightfield` materials are passed by the caller; the check cannot see runtime calls (a missing one also throws at spawn).
- **Contract issue: checks input** (controller ruling): `determinism` and `zeroAlloc` take `args` and `input` as `(step) → snapshot`, a named policy or a constant snapshot.
- **Contract issue: `read` after sleep.** curr is written for bodies awake now or at the previous read (the overview says non-sleeping only), so the step a body falls asleep is not lost.
- **Contract issue: `stats.stepMs`/`stepMsTotal` are 0 without a timer** (not absent).
- **Contract issue: `add`/`remove` of `xf`** is allowed on bodiless entities (allocates or frees a slot); `id`, `tags`, `model`, `body`, `colliders`, `sockets`, `heightfield` cannot be added or removed.
- **Contract issue: `place` forms.** `q` is `[x, y, z, w]` (also in `spawn`); `place` returns `e`; `rel` without `yaw`/`q` takes the other entity's rotation.
