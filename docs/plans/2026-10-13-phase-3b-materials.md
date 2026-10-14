# Phase 3b: material registry, base library and sidecar schema: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(judgment)** need design care beyond the written interfaces; flag anything that doesn't fit to the controller rather than improvising across task boundaries.

**Precondition:** 3a has merged into engine `phase-3` (0.7.3). Branch `phase-3-materials` is cut from `phase-3` into the worktree `/home/smiller/projects/four43/lion-hawk-engine-3b` (overview §6). Every path below is relative to that worktree.

**Goal:**
- `defineMaterials(entries, { pairs })` builds the frozen material registry of overview §4.2: the 18-material base library, `extends` with a deep merge per block, the free-form `game` block (D6), M-3 validation, `density`/`collider`/`pair`, and the 8-hex `hash`.
- `src/defs/sidecar.js` validates baked `phys.json`, each model's sidecar and the inline collider entries of `spawn({ colliders })` (overview §4.3).
- Both are plain data with no runtime dependencies. 3c (physics and `checks.materials`), 3d (bake) and 3f (compiler) build on them.

**Architecture:**
- `src/defs/materials.base.js` holds `BASE_MATERIALS`, deep-frozen data in spec order. The ground materials carry Rally's `SURFACES` tyre values, so Rally's surfaces move onto registry ids without retuning.
- `src/defs/materials.js` holds `defineMaterials`. It runs once per game at module load:
  1. validate every raw entry against one schema table (blocks → fields → checkers);
  2. build the raw table (base first, game entries after; a game entry with a base id merges over it in place);
  3. resolve `extends` with cycle detection;
  4. deep-freeze;
  5. precompute per-material collider values;
  6. parse pairs;
  7. hash the canonical JSON of what sidecars and colliders depend on: ids in index order, each material's effective `phys` values and each pair's `friction`/`restitution` (ruling 6; not `look`, `game` or cues).
  Lookups a step may call (`get`, `index`, `collider`, `pair`) are Map or array reads that allocate nothing after a pair's first call.
- `src/defs/sidecar.js` holds `validateCollider` (shared by sidecars and inline colliders), `validateSidecar`, `validatePhys` and `materialRefs` (the T-14 helper for 3c's `checks.materials`). Validators return their input unchanged or throw on the first error, naming the model and the path.

**Tech Stack:** plain ES modules; `fnv` from `src/core/rng.js`; `node:test`. No three.js, no Rapier.

**Spec:** `docs/spec.md` (M-1, M-2, M-3, M-7, M-8, A-5 schema, A-6/A-7 data side, T-14 helper) plus `docs/plans/2026-10-13-phase-3-overview.md` (§2 D2, D4, D6; §4.2; §4.3). `docs/design.md` §6 is the original material design.

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

**3b's own constraints:**
- **Files.** Touch only `src/defs/materials.js`, `src/defs/materials.base.js`, `src/defs/sidecar.js`, `test/materials*.test.mjs`, `test/sidecar*.test.mjs` and the notes file `docs/plans/2026-10-13-phase-3b-materials-notes.md`. Never touch `src/sim/**`, `src/view/**`, `tools/**` or `testing/**`. Tests import modules by path (`../src/defs/materials.js`), never through `src/index.sim.js`; the exports are an integrator request.
- **Determinism.** The registry has no step behaviour, so constraint 2's `checks.determinism` test and headless replay belong to 3c, which spawns colliders from it. Here determinism means three things, each pinned by a test:
  - the order of `ids` is fixed;
  - the base hash is a pinned literal;
  - the hash does not depend on key order inside entries or on pair-key orientation, but does depend on the order of `ids` (terrain stores indices; ruling 6).
- **Allocation.** `get`, `has`, `index`, `byIndex`, `density`, `collider` and a repeated `pair(a, b)` allocate nothing. Only the first `pair(a, b)` of an ordered pair builds its frozen result, a bounded, retained cache entry.
- **Error format** (overview §4.2): `materials: '<id>'.<block>.<field> <problem> (got <value>)`. Sidecar errors: `sidecar: <model>: <path> <problem> (got <value>)`. `phys.json` envelope errors: `phys: <field> <problem> (got <value>)`. `<value>` is shown with strings quoted, `NaN`/`undefined` spelled out, objects as JSON, and anything over 60 characters cut to 57 plus `...`.
- **Green after every task:** the task's own test files. Task 7 runs the whole engine suite.

Unit run (used in every task; `<files>` named per step):

```bash
systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=300 \
  --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3b \
  -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 <files>
```

## Review Focus

The five inputs most likely to bite, each pinned by a test:

1. **`extends` merge depth and isolation.** Nested `look.fur`/`look.subsurface` objects must merge and arrays must replace. Two-level chains must see overrides of base entries, and the caller's objects must never be frozen or mutated. Pinned by Task 2, "extends deep-merges per block…" and "resolved materials are frozen copies…", and by the shallow-merge mutation step.
2. **Pair order dependence.** M-8's tie rule gives `sound`/`fx` to `a`, and tyre data comes from `b` (the ground). So `pair(a, b)` and `pair(b, a)` can differ, and a cache keyed by the unordered pair would return the wrong one. Pinned by Task 3, "an sg tie takes the cues of a…", and by two mutation steps (`<=` tie, unordered cache key).
3. **Hash stability and scope (ruling 6).** The hash must not depend on key order or pair-key orientation. It must change with `ids` and their order, any effective `phys` value and any pair `friction`/`restitution`, and must not change with `look`, `game`, `tire`, cues (`sound`/`fx`) or other live-read blocks. It is pinned for the base library. A drift here fails every game's `checks.materials` and `bake --check`. Pinned by Task 4 and its two mutation steps (unsorted keys, whole-table hash).
4. **Validation edges and messages.** Inclusive range ends (friction 2 and restitution 1 pass; fill 0 and sg 0 fail), `NaN` and strings in numeric fields, unknown block versus unknown field, cycles including self-`extends`, and `paint-`/`|` ids. Pinned by Task 2, "validation names…" and "range edges…".
5. **Sidecar versus inline colliders.** Baked entries require `p`, `q` and `part`; inline ones may omit them. `'ball'` is rejected with a hint (overview §4.4's example uses it), and so are `paint-*` materials. Hull limits are 4–64 points; mesh indices must be in range; quaternions must be unit. Pinned by Task 5, "inline colliders…" and "collider errors…", and by Task 6, "sidecar errors…".

## File Structure

| File | Responsibility |
|---|---|
| `src/defs/materials.base.js` (create) | `BASE_MATERIALS`: the 18 base entries in spec order, deep-frozen data. |
| `src/defs/materials.js` (create) | `defineMaterials`, the schema table and M-3 validation, `extends` resolution, the registry members of overview §4.2, pairs (M-7, M-8), `canonicalJson` and the hash. Also exports `PHYS_DEFAULTS` and `MAX_MATERIALS` for 3c and tests. |
| `src/defs/sidecar.js` (create) | `SIDECAR_VERSION`, `SHAPES`, `MAX_HULL_POINTS`, `validateCollider`, `validateSidecar`, `validatePhys`, `materialRefs`. |
| `test/materials-base.test.mjs` (create) | The base library's ids, order, freezing, tyre data and fluids. |
| `test/materials.test.mjs` (create) | Registry construction, `extends`, overrides, ids and indices, density and collider values, validation. |
| `test/materials-pairs.test.mjs` (create) | `pair()` defaults, entries, ordering, caching, bad tables. |
| `test/materials-hash.test.mjs` (create) | `canonicalJson`, the pinned base hash, order independence and what the hash covers (ruling 6). |
| `test/sidecar-collider.test.mjs` (create) | `validateCollider` for every shape, baked and inline. |
| `test/sidecar.test.mjs` (create) | `validateSidecar`, `validatePhys`, `materialRefs`, and the purity of the three modules. |
| `docs/plans/2026-10-13-phase-3b-materials-notes.md` (create) | Outcome, decisions and field note candidates. |

## Shared interfaces (overview §4.2–§4.3; the signatures every task builds toward)

```js
// src/defs/materials.base.js
export const BASE_MATERIALS; // frozen { steel, aluminium, wood, rubber, glass, plastic, fabric, flesh, fur, gravel, grass, dirt, mud, asphalt, snow, ice, water, air }

// src/defs/materials.js
export const PHYS_DEFAULTS;  // frozen { friction: 0.5, restitution: 0, sg: 1, fill: 1 }
export const MAX_MATERIALS;  // 255
export function canonicalJson(value) → string
export function defineMaterials(entries = {}, { pairs = {} } = {}) → Registry
// Registry (frozen):
//   ids: frozen string[]                 base library in spec order, then game entries in key order
//   hash: string                         8 lowercase hex digits over ids (in order), effective phys and pair friction/restitution only
//   get(id) → frozen material ({ id, look?, phys?, tire?, dirtRate?, coverage?, aero?, magnet?, fluid?, sound?, fx?, game? })
//   has(id) → boolean
//   index(id) → 0..254;  byIndex(i) → id
//   density(id) → kg/m³;  collider(id) → frozen { friction: √f, restitution, density }
//   pair(a, b) → frozen { friction, restitution, tire | null, sound | null, fx | null }

// src/defs/sidecar.js
export const SIDECAR_VERSION;   // 1
export const SHAPES;            // frozen ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh']
export const MAX_HULL_POINTS;   // 64
export function validateCollider(entry, { where = 'collider', path = 'collider', materials, parts, inline = false } = {}) → entry
//   entry: { shape, ...shape fields, p?, q?, part?, material }; a box may carry optional `round` (> 0: Rapier roundCuboid's border radius, added OUTSIDE `half`, 3c/3j)
export function validateSidecar(sidecar, { model = '?', materials } = {}) → sidecar
export function validatePhys(phys, { materials } = {}) → phys
export function materialRefs(phys) → { [materialId]: ['<model>.colliders[i]', ...] }   // keys sorted
```

Consumers: 3c imports `defineMaterials` (the default registry), `PHYS_DEFAULTS`, `validateCollider` (inline colliders), `validatePhys` and `materialRefs` (`checks.materials`) from `src/defs/*` directly. 3d imports `validateSidecar`, `validatePhys` and `SIDECAR_VERSION`, and loads the game registry for `hash`. 3f reads `get(id).look`.

---

### Task 1: The base library (M-2)

**Files:**
- Create: `src/defs/materials.base.js`
- Test: `test/materials-base.test.mjs`

**Interfaces:**
- Consumes: none.
- Produces: `BASE_MATERIALS` (above).

- [ ] **Step 1: Write the failing test.** Create `test/materials-base.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_MATERIALS } from '../src/defs/materials.base.js';

const SPEC_ORDER = ['steel', 'aluminium', 'wood', 'rubber', 'glass', 'plastic', 'fabric', 'flesh', 'fur', 'gravel', 'grass', 'dirt', 'mud', 'asphalt', 'snow', 'ice', 'water', 'air'];

test('3b: the base library is the spec\'s 18 materials in spec order (M-2)', () => {
  assert.deepEqual(Object.keys(BASE_MATERIALS), SPEC_ORDER);
});
test('3b: the base library is frozen all the way down', () => {
  const frozen = o => Object.isFrozen(o) && Object.values(o).every(v => !v || typeof v !== 'object' || frozen(v));
  assert.ok(frozen(BASE_MATERIALS));
  assert.throws(() => { BASE_MATERIALS.steel.phys.friction = 9; }, TypeError);
});
test('3b: ground materials carry Rally\'s tyre surfaces and a dirt rate (M-10 inputs)', () => {
  // games/rally/src/tire.js SURFACES (e03ed71): tarmac, hardpack, gravel, grass, mud, packed, ice
  const rally = {
    asphalt: { mu: 1.15, C: 1.5, kp: 0.1, ap: 0.12, crr: 0.015, drag: 0 },
    dirt: { mu: 0.9, C: 1.4, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
    gravel: { mu: 0.8, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
    grass: { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.05, drag: 0.2 },
    mud: { mu: 0.4, C: 1.5, kp: 0.15, ap: 0.16, crr: 0.1, drag: 0.18 },
    snow: { mu: 0.75, C: 1.25, kp: 0.2, ap: 0.2, crr: 0.03, drag: 0 },
    ice: { mu: 0.55, C: 1.4, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
  };
  for (const [id, tire] of Object.entries(rally)) {
    assert.deepEqual({ ...BASE_MATERIALS[id].tire }, tire, id);
    assert.equal(typeof BASE_MATERIALS[id].dirtRate, 'number', id);
  }
  const grounds = Object.keys(BASE_MATERIALS).filter(id => BASE_MATERIALS[id].tire);
  assert.deepEqual(grounds.sort(), Object.keys(rally).sort(), 'only ground materials have tyre data');
});
test('3b: fluids have a fluid block and no phys; solids all have friction, restitution and sg', () => {
  for (const id of ['water', 'air']) { assert.ok(BASE_MATERIALS[id].fluid, id); assert.equal(BASE_MATERIALS[id].phys, undefined, id); }
  for (const id of SPEC_ORDER.slice(0, 16)) {
    const p = BASE_MATERIALS[id].phys;
    assert.ok(p && typeof p.friction === 'number' && typeof p.restitution === 'number' && p.sg > 0, id);
  }
  assert.equal(BASE_MATERIALS.steel.phys.sg, 7.85, 'design §6.1');
  assert.equal(BASE_MATERIALS.rubber.phys.sg, 1.1, 'design §6.1');
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `<files>` = `test/materials-base.test.mjs`. Expected: 1 failing test, `ERR_MODULE_NOT_FOUND` for `src/defs/materials.base.js`.

- [ ] **Step 3: Implement.** Create `src/defs/materials.base.js`:

```js
// src/defs/materials.base.js
// The base material library (M-2): the spec's 18 entries, in spec order. Plain data; defineMaterials validates and
// resolves it. Tyre surfaces are Rally's SURFACES (games/rally/src/tire.js): asphalt = tarmac, dirt = hardpack,
// snow = packed snow. Fluids (water, air) carry no phys.sg, so their collider density is 0 (overview §4.2).
const freeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };

export const BASE_MATERIALS = freeze({
  steel: {
    look: { color: '#8a9099', metalness: 1, roughness: 0.35 },
    phys: { friction: 0.6, restitution: 0.2, sg: 7.85 },
    aero: { skin: 0.004 }, magnet: { ferrous: 0.9 },
    coverage: { dirt: 1, rust: 1, mud: 1, snow: 1 },
    sound: 'clang', fx: 'sparks',
  },
  aluminium: {
    look: { color: '#c4c8cc', metalness: 1, roughness: 0.3 },
    phys: { friction: 0.5, restitution: 0.2, sg: 2.7 },
    aero: { skin: 0.004 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'clang', fx: 'sparks',
  },
  wood: {
    look: { color: '#8b5a2b', roughness: 0.8 },
    phys: { friction: 0.5, restitution: 0.3, sg: 0.6 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'knock', fx: 'splinters',
  },
  rubber: {
    look: { color: '#222222', roughness: 0.9 },
    phys: { friction: 1, restitution: 0.6, sg: 1.1 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thud',
  },
  glass: {
    look: { color: '#d8f0ff', roughness: 0.05, transmission: 0.9, ior: 1.5, thickness: 0.01 },
    phys: { friction: 0.4, restitution: 0.1, sg: 2.5 },
    sound: 'clink', fx: 'shards',
  },
  plastic: {
    look: { color: '#e0e0e0', roughness: 0.5 },
    phys: { friction: 0.4, restitution: 0.4, sg: 0.95 },
    coverage: { dirt: 1, mud: 1 },
    sound: 'tap',
  },
  fabric: {
    look: { color: '#6a6a8a', roughness: 1, sheen: 0.5 },
    phys: { friction: 0.7, restitution: 0.1, sg: 0.5 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thump',
  },
  flesh: {
    look: { color: '#e8b4a0', roughness: 0.6, subsurface: { color: '#ff6040', strength: 0.5 } },
    phys: { friction: 0.6, restitution: 0.15, sg: 1.05 },
    coverage: { dirt: 1, mud: 1 },
    sound: 'squish',
  },
  fur: {
    look: { color: '#b08a60', roughness: 1, fur: { length: 0.03, shells: 10, density: 1, tint: '#ffffff' } },
    phys: { friction: 0.6, restitution: 0.1, sg: 1 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thump',
  },
  gravel: {
    look: { color: '#9a8f80', roughness: 1 },
    phys: { friction: 0.8, restitution: 0.1, sg: 1.6 },
    tire: { mu: 0.8, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
    dirtRate: 0.006, coverage: { snow: 1 },
    sound: 'crunch', fx: 'spray',
  },
  grass: {
    look: { color: '#5a8f3a', roughness: 1 },
    phys: { friction: 0.55, restitution: 0.05, sg: 1.3 },
    tire: { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.05, drag: 0.2 },
    dirtRate: 0.002, coverage: { snow: 1 },
    sound: 'rustle', fx: 'clods',
  },
  dirt: {
    look: { color: '#7a5a3a', roughness: 1 },
    phys: { friction: 0.9, restitution: 0.05, sg: 1.5 },
    tire: { mu: 0.9, C: 1.4, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
    dirtRate: 0.01, coverage: { snow: 1 },
    sound: 'crunch', fx: 'dust',
  },
  mud: {
    look: { color: '#4a3520', roughness: 0.7 },
    phys: { friction: 0.4, restitution: 0, sg: 1.8 },
    tire: { mu: 0.4, C: 1.5, kp: 0.15, ap: 0.16, crr: 0.1, drag: 0.18 },
    dirtRate: 0.03,
    sound: 'squelch', fx: 'splat',
  },
  asphalt: {
    look: { color: '#3a3a3c', roughness: 0.9 },
    phys: { friction: 1, restitution: 0.1, sg: 2.3 },
    tire: { mu: 1.15, C: 1.5, kp: 0.1, ap: 0.12, crr: 0.015, drag: 0 },
    dirtRate: 0, coverage: { dirt: 1, snow: 1 },
    sound: 'thud', fx: 'dust',
  },
  snow: {
    look: { color: '#f4f8fc', roughness: 0.9, subsurface: { color: '#cfe8ff', strength: 0.3 } },
    phys: { friction: 0.3, restitution: 0.05, sg: 0.4 },
    tire: { mu: 0.75, C: 1.25, kp: 0.2, ap: 0.2, crr: 0.03, drag: 0 },
    dirtRate: 0.004,
    sound: 'crunch', fx: 'powder',
  },
  ice: {
    look: { color: '#dff4ff', roughness: 0.05 },
    phys: { friction: 0.05, restitution: 0.05, sg: 0.917 },
    tire: { mu: 0.55, C: 1.4, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
    dirtRate: 0, coverage: { snow: 1 },
    sound: 'scrape', fx: 'frost',
  },
  water: {
    look: { color: '#3a7fbf', roughness: 0.05, transmission: 0.6, opacity: 0.8, transparent: true },
    fluid: { density: 1000, viscosity: 1e-3 },
    sound: 'splash', fx: 'splash',
  },
  air: {
    fluid: { density: 1.225, viscosity: 1.8e-5 },
  },
});
```

- [ ] **Step 4: Run it and expect PASS.** The same run: 4 pass, 0 fail.

- [ ] **Step 5: Commit.**

```bash
git add src/defs/materials.base.js test/materials-base.test.mjs
git commit -m "feat(materials): the 18-material base library (M-2)"
```

---

### Task 2 (judgment): `defineMaterials`: validation, `extends`, overrides, ids, density and colliders (M-1, M-3)

**Decisions this task makes** (each recorded in the notes and listed under Contract issues):
- A game entry whose id is a base id is **merged over** the base entry in place: same index, and `extends` sees the merged version. It may not `extends` anything (it throws). Tractor's `grass` tweak and `leaf extends grass` need this.
- Resolved materials carry their `id`.
- `PHYS_DEFAULTS` follow Rapier's own defaults (friction 0.5, restitution 0), so a material without a `phys` block behaves as an untouched Rapier collider.
- `game` and `look.wear` are not schema-checked, but must be plain JSON data, because the registry clones and freezes them (ruling 7). Neither is hashed (ruling 6).
- Ids may not contain `|` (pair keys use it) or start with `paint-` (bake slots, A-4).
- `byIndex(i)` returns the id string. `materialAt` returns ids, and terrain stores indices.
- In this task, `defineMaterials` accepts the `pairs` option and ignores it; Task 3 parses it.

**Files:**
- Create: `src/defs/materials.js`
- Test: `test/materials.test.mjs`

**Interfaces:**
- Consumes: `BASE_MATERIALS` (Task 1).
- Produces: `defineMaterials`, `PHYS_DEFAULTS`, `MAX_MATERIALS`; Registry members `ids`, `get`, `has`, `index`, `byIndex`, `density`, `collider`.

- [ ] **Step 1: Write the failing test.** Create `test/materials.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMaterials, PHYS_DEFAULTS, MAX_MATERIALS } from '../src/defs/materials.js';
import { BASE_MATERIALS } from '../src/defs/materials.base.js';

const BASE_IDS = Object.keys(BASE_MATERIALS);
const GAME = { // overview §4.2's example
  pet: { extends: 'flesh', look: { roughness: 0.85 }, sound: 'squish' },
  stone: { extends: 'gravel', phys: { friction: 0.7 } },
  route: { extends: 'gravel', game: { grip: 1, vmul: 1 }, dirtRate: 0.006 },
};

test('3b: defineMaterials() is the base library alone; every base entry validates (M-1, M-2)', () => {
  const m = defineMaterials();
  assert.deepEqual([...m.ids], BASE_IDS);
  for (const id of BASE_IDS) assert.equal(m.has(id), true, id);
  assert.equal(m.has('pet'), false);
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.ids));
});
test('3b: ids are the base library first, then game entries in key order; index/byIndex round-trip', () => {
  const m = defineMaterials({ zebra: { extends: 'fur' }, apple: { extends: 'plastic' } });
  assert.deepEqual([...m.ids], [...BASE_IDS, 'zebra', 'apple']);
  m.ids.forEach((id, i) => { assert.equal(m.index(id), i); assert.equal(m.byIndex(i), id); });
  assert.throws(() => m.byIndex(m.ids.length), /^Error: materials: no material at index 20$/);
  assert.throws(() => m.byIndex(-1), /no material at index -1/);
  assert.throws(() => m.index('nope'), /^Error: materials: unknown material 'nope'$/);
});
test('3b: extends deep-merges per block, child wins, game blocks copy through (M-2, D6)', () => {
  const m = defineMaterials({
    ...GAME,
    lane: { extends: 'route', game: { vmul: 0.5 }, look: { color: '#123456' } },
    fluff: { extends: 'fur', look: { fur: { shells: 4 } } },
    wing: { extends: 'aluminium', aero: { airfoil: { cl: [[0, 0], [10, 1]], cd: [[0, 0.01], [10, 0.05]], stall: 15 } } },
    stub: { extends: 'wing', aero: { airfoil: { cl: [[0, 0.1], [5, 0.5]] } } },
  });
  assert.deepEqual(m.get('pet').look, { color: '#e8b4a0', roughness: 0.85, subsurface: { color: '#ff6040', strength: 0.5 } });
  assert.equal(m.get('pet').sound, 'squish');
  assert.deepEqual(m.get('pet').phys, BASE_MATERIALS.flesh.phys);
  assert.deepEqual(m.get('stone').phys, { friction: 0.7, restitution: 0.1, sg: 1.6 });
  assert.deepEqual(m.get('stone').tire, BASE_MATERIALS.gravel.tire);
  assert.deepEqual(m.get('lane').game, { grip: 1, vmul: 0.5 }, 'game merges like any block');
  assert.equal(m.get('lane').dirtRate, 0.006, 'two levels of extends');
  assert.deepEqual(m.get('fluff').look.fur, { length: 0.03, shells: 4, density: 1, tint: '#ffffff' }, 'nested look objects merge');
  assert.deepEqual(m.get('stub').aero.airfoil.cl, [[0, 0.1], [5, 0.5]], 'arrays replace');
  assert.deepEqual(m.get('stub').aero.airfoil.cd, [[0, 0.01], [10, 0.05]]);
  assert.equal(m.get('pet').id, 'pet');
  assert.equal(m.get('pet').extends, undefined, 'extends is resolved away');
});
test('3b: resolved materials are frozen copies; the caller\'s objects are not touched', () => {
  const entries = { pet: { extends: 'flesh', look: { roughness: 0.85 }, game: { hop: [1, 2] } } };
  const before = JSON.stringify(entries);
  const m = defineMaterials(entries);
  assert.equal(JSON.stringify(entries), before);
  assert.equal(Object.isFrozen(entries.pet.look), false);
  assert.ok(Object.isFrozen(m.get('pet').look) && Object.isFrozen(m.get('pet').game.hop));
  assert.notEqual(m.get('pet').game.hop, entries.pet.game.hop);
  assert.throws(() => { m.get('pet').phys.sg = 2; }, TypeError);
});
test('3b: a game entry with a base id merges over the base entry in place', () => {
  const m = defineMaterials({ grass: { look: { color: '#448833' } }, leaf: { extends: 'grass', look: { roughness: 0.6 } } });
  assert.equal(m.index('grass'), BASE_IDS.indexOf('grass'));
  assert.equal(m.ids.length, 19);
  assert.deepEqual(m.get('grass').look, { color: '#448833', roughness: 1 });
  assert.deepEqual(m.get('grass').tire, BASE_MATERIALS.grass.tire);
  assert.deepEqual(m.get('leaf').look, { color: '#448833', roughness: 0.6 }, 'extends sees the override');
  assert.throws(() => defineMaterials({ grass: { extends: 'dirt' } }), /^Error: materials: 'grass' overrides the base entry and cannot extend 'dirt'$/);
});
test('3b: density is sg × 1000 × fill; fluids without sg are 0; collider() gives √f (overview §4.2, D4)', () => {
  const m = defineMaterials({ shell: { extends: 'steel', phys: { fill: 0.02 } }, blob: {}, slick: { phys: { friction: 0.25 } } });
  assert.equal(m.density('steel'), 7850);
  assert.equal(m.density('shell'), 7850 * 0.02);
  assert.equal(m.density('blob'), 1000, 'sg and fill default to 1');
  assert.equal(m.density('water'), 0);
  assert.equal(m.density('air'), 0);
  assert.deepEqual({ ...m.collider('slick') }, { friction: 0.5, restitution: 0, density: 1000 });
  assert.deepEqual({ ...m.collider('blob') }, { friction: Math.sqrt(PHYS_DEFAULTS.friction), restitution: 0, density: 1000 });
  assert.equal(m.collider('steel'), m.collider('steel'), 'cached');
  assert.ok(Object.isFrozen(m.collider('steel')));
  assert.throws(() => m.collider('nope'), /unknown material 'nope'/);
  assert.throws(() => m.density('nope'), /unknown material 'nope'/);
});
test(`3b: more than ${MAX_MATERIALS} materials throws`, () => {
  const fill = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, {}]));
  assert.equal(defineMaterials(fill(MAX_MATERIALS - 18)).ids.length, MAX_MATERIALS);
  assert.throws(() => defineMaterials(fill(MAX_MATERIALS - 17)), /^Error: materials: 256 materials, at most 255$/);
});
test('3b: validation names the material, block and field (M-3)', () => {
  const cases = [
    [{ a: { looks: {} } }, "materials: 'a'.looks unknown block (got {})"],
    [{ a: { look: { rough: 1 } } }, "materials: 'a'.look.rough unknown field (got 1)"],
    [{ a: { look: { fur: { shell: 2 } } } }, "materials: 'a'.look.fur.shell unknown field (got 2)"],
    [{ a: { phys: { friction: 2.0001 } } }, "materials: 'a'.phys.friction out of range 0–2 (got 2.0001)"],
    [{ a: { phys: { friction: -0.1 } } }, "materials: 'a'.phys.friction out of range 0–2 (got -0.1)"],
    [{ a: { phys: { friction: '1' } } }, "materials: 'a'.phys.friction must be a number (got '1')"],
    [{ a: { phys: { restitution: 1.5 } } }, "materials: 'a'.phys.restitution out of range 0–1 (got 1.5)"],
    [{ a: { phys: { sg: 0 } } }, "materials: 'a'.phys.sg must be > 0 (got 0)"],
    [{ a: { phys: { fill: 0 } } }, "materials: 'a'.phys.fill out of range (0, 1] (got 0)"],
    [{ a: { phys: { fill: 1.01 } } }, "materials: 'a'.phys.fill out of range (0, 1] (got 1.01)"],
    [{ a: { look: { metalness: 1.2 } } }, "materials: 'a'.look.metalness out of range 0–1 (got 1.2)"],
    [{ a: { look: { roughness: NaN } } }, "materials: 'a'.look.roughness must be a number (got NaN)"],
    [{ a: { look: { color: 'red' } } }, "materials: 'a'.look.color must be a colour ('#rgb', '#rrggbb' or 0xrrggbb) (got 'red')"],
    [{ a: { look: { side: 'back' } } }, "materials: 'a'.look.side must be one of 'front', 'double' (got 'back')"],
    [{ a: { coverage: { snow: 2 } } }, "materials: 'a'.coverage.snow out of range 0–1 (got 2)"],
    [{ a: { coverage: { rain: 1 } } }, "materials: 'a'.coverage.rain unknown field (got 1)"],
    [{ a: { phys: 3 } }, "materials: 'a'.phys must be an object (got 3)"],
    [{ a: { sound: '' } }, "materials: 'a'.sound must be a non-empty string (got '')"],
    [{ a: { game: { f: () => 1 } } }, "materials: 'a'.game must be plain JSON data (got {})"],
    [{ a: { extends: 'zz' } }, "materials: 'a' extends unknown 'zz'"],
    [{ a: { extends: 'b' }, b: { extends: 'a' } }, 'materials: extends cycle a -> b -> a'],
    [{ a: { extends: 'a' } }, 'materials: extends cycle a -> a'],
    [{ a: 5 }, "materials: 'a' must be an object (got 5)"],
    [{ 'a|b': {} }, "materials: 'a|b' id must not contain '|' (pair keys use it)"],
    [{ 'paint-body': {} }, "materials: 'paint-body' ids starting with 'paint-' are reserved for paint slots (A-4)"],
  ];
  for (const [entries, message] of cases) assert.throws(() => defineMaterials(entries), e => e.message === message || assert.fail(`${JSON.stringify(Object.keys(entries))}: got "${e.message}", want "${message}"`));
  assert.throws(() => defineMaterials({}, { pair: {} }), /^Error: materials: unknown option 'pair'$/);
});
test('3b: range edges are inclusive where the spec says so', () => {
  const m = defineMaterials({ a: { phys: { friction: 2, restitution: 1, fill: 1, sg: 0.001 } }, b: { phys: { friction: 0, restitution: 0 } }, c: { look: { color: 0xffffff, fur: { shells: 32 } } }, d: { look: { wear: { rust: [0, 1] } } } });
  assert.equal(m.collider('a').friction, Math.SQRT2);
  assert.equal(m.collider('b').friction, 0);
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `test/materials.test.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `src/defs/materials.js`.

- [ ] **Step 3: Implement.** Create `src/defs/materials.js`:

```js
// src/defs/materials.js
// The material registry (M-1..M-3, M-7, M-8; overview §4.2, D4, D6). Plain data with no runtime dependencies: the sim,
// the view's compiler and the Node bake all read the same frozen registry.
import { BASE_MATERIALS } from './materials.base.js';

export const PHYS_DEFAULTS = Object.freeze({ friction: 0.5, restitution: 0, sg: 1, fill: 1 }); // friction, restitution: Rapier's defaults
export const MAX_MATERIALS = 255; // index() fits a Uint8Array cell; 255 stays free

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const show = v => {
  let s;
  if (typeof v === 'string') s = `'${v}'`;
  else if (typeof v === 'number' || v === undefined || typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') s = String(v);
  else { try { s = JSON.stringify(v); } catch { s = String(v); } }
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

// Field checkers: each returns a problem string, or null when the value is good.
const finite = v => typeof v === 'number' && Number.isFinite(v);
const range = (lo, hi) => v => !finite(v) ? 'must be a number' : v < lo || v > hi ? `out of range ${lo}–${hi}` : null;
const positive = v => !finite(v) ? 'must be a number' : v <= 0 ? 'must be > 0' : null;
const nonneg = v => !finite(v) ? 'must be a number' : v < 0 ? 'must be >= 0' : null;
const openUnit = v => !finite(v) ? 'must be a number' : v <= 0 || v > 1 ? 'out of range (0, 1]' : null;
const int = (lo, hi) => v => !Number.isInteger(v) ? 'must be an integer' : v < lo || v > hi ? `out of range ${lo}–${hi}` : null;
const bool = v => typeof v === 'boolean' ? null : 'must be true or false';
const str = v => typeof v === 'string' && v.length > 0 ? null : 'must be a non-empty string';
const oneOf = list => v => list.includes(v) ? null : `must be one of ${list.map(x => `'${x}'`).join(', ')}`;
const colour = v => (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) || (Number.isInteger(v) && v >= 0 && v <= 0xffffff) ? null : "must be a colour ('#rgb', '#rrggbb' or 0xrrggbb)";
const curve = v => Array.isArray(v) && v.length >= 2 && v.every(p => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])) ? null : 'must be a list of at least 2 [angle, value] pairs';
const plainData = v => { // JSON values only, so the registry clones and freezes the same everywhere
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v)) return null;
  if (Array.isArray(v)) { for (const x of v) if (plainData(x)) return 'must be plain JSON data'; return null; }
  if (isPlain(v)) { for (const x of Object.values(v)) if (plainData(x)) return 'must be plain JSON data'; return null; }
  return 'must be plain JSON data';
};
const unit = range(0, 1);

// A nested object is a sub-schema; a function checks a scalar. Top-level keys are the blocks (spec §3.2, D6).
const TIRE = { mu: nonneg, C: positive, kp: positive, ap: positive, crr: nonneg, drag: nonneg };
const SCHEMA = {
  extends: str,
  look: {
    color: colour, metalness: unit, roughness: unit, clearcoat: unit, clearcoatRoughness: unit,
    sheen: unit, sheenColor: colour, sheenRoughness: unit, transmission: unit, ior: range(1, 2.333), thickness: nonneg,
    opacity: unit, transparent: bool, emissive: colour, emissiveIntensity: nonneg, flatShading: bool, side: oneOf(['front', 'double']),
    subsurface: { color: colour, strength: unit },
    fur: { length: range(0.001, 1), shells: int(1, 32), density: positive, tint: colour },
    wear: plainData, // accepted and ignored in phase 3
  },
  phys: { friction: range(0, 2), restitution: unit, sg: positive, fill: openUnit },
  tire: TIRE,
  dirtRate: nonneg,
  coverage: { dirt: unit, rust: unit, snow: unit, mud: unit },
  aero: { skin: nonneg, airfoil: { cl: curve, cd: curve, stall: range(0, 90) } },
  magnet: { strength: nonneg, ferrous: unit },
  fluid: { density: positive, viscosity: nonneg },
  sound: str,
  fx: str,
  game: plainData, // D6: free-form, not schema-checked, copied through extends
};

// unknown: what an unlisted key is called at this level ('unknown block' for a material's top level).
const check = (schema, value, path, fail, unknown = 'unknown field') => {
  if (typeof schema === 'function') { const p = schema(value); if (p) fail(path, p, value); return; }
  if (!isPlain(value)) { fail(path, 'must be an object', value); return; }
  for (const k of Object.keys(value)) {
    if (!Object.hasOwn(schema, k)) fail(`${path}.${k}`, unknown, value[k]);
    check(schema[k], value[k], `${path}.${k}`, fail);
  }
};
function validateEntry(id, entry) {
  const fail = (path, problem, v) => { throw new Error(`materials: '${id}'${path.slice(1)} ${problem} (got ${show(v)})`); };
  if (id.includes('|')) throw new Error(`materials: '${id}' id must not contain '|' (pair keys use it)`);
  if (id.startsWith('paint-')) throw new Error(`materials: '${id}' ids starting with 'paint-' are reserved for paint slots (A-4)`);
  if (!isPlain(entry)) throw new Error(`materials: '${id}' must be an object (got ${show(entry)})`);
  check(SCHEMA, entry, '#', fail, 'unknown block');
}

const clone = v => Array.isArray(v) ? v.map(clone) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const merge = (base, over) => { // deep, per block, child wins; arrays and scalars replace
  const out = clone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isPlain(out[k]) && isPlain(v) ? merge(out[k], v) : clone(v);
  return out;
};
const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

export function defineMaterials(entries = {}, options = {}) {
  if (!isPlain(entries)) throw new Error(`materials: defineMaterials takes an object of entries (got ${show(entries)})`);
  if (!isPlain(options)) throw new Error(`materials: options must be an object (got ${show(options)})`);
  for (const k of Object.keys(options)) if (k !== 'pairs') throw new Error(`materials: unknown option '${k}'`);

  // 1. Raw table: the base library in spec order, then game entries in key order. A game entry with a base id
  //    is merged over that base entry in place (same index) and may not extend anything else.
  const raw = new Map();
  for (const [id, entry] of Object.entries(BASE_MATERIALS)) { validateEntry(id, entry); raw.set(id, entry); }
  for (const [id, entry] of Object.entries(entries)) {
    validateEntry(id, entry);
    if (Object.hasOwn(BASE_MATERIALS, id)) {
      if (entry.extends !== undefined) throw new Error(`materials: '${id}' overrides the base entry and cannot extend '${entry.extends}'`);
      raw.set(id, merge(BASE_MATERIALS[id], entry));
    } else raw.set(id, entry);
  }
  const ids = Object.freeze([...raw.keys()]);
  if (ids.length > MAX_MATERIALS) throw new Error(`materials: ${ids.length} materials, at most ${MAX_MATERIALS}`);

  // 2. Resolve extends (M-2): deep merge per block, child wins; `game` is copied like any block (D6).
  const resolved = new Map();
  const resolve = (id, chain) => {
    if (resolved.has(id)) return resolved.get(id);
    const { extends: parent, ...own } = raw.get(id);
    let out;
    if (parent === undefined) out = clone(own);
    else {
      if (!raw.has(parent)) throw new Error(`materials: '${id}' extends unknown '${parent}'`);
      if (chain.includes(parent)) throw new Error(`materials: extends cycle ${[...chain.slice(chain.indexOf(parent)), parent].join(' -> ')}`);
      out = merge(resolve(parent, [...chain, parent]), own);
    }
    resolved.set(id, out);
    return out;
  };
  for (const id of ids) resolve(id, [id]);
  const list = ids.map(id => deepFreeze({ id, ...resolved.get(id) }));

  // 3. Lookups. Everything a step may call (get, index, collider, pair) is a Map or array read after the first call.
  const at = new Map(ids.map((id, i) => [id, i]));
  const need = id => { const i = at.get(id); if (i === undefined) throw new Error(`materials: unknown material '${id}'`); return i; };
  const sgOf = m => m.phys?.sg ?? (m.fluid ? 0 : PHYS_DEFAULTS.sg);
  const densityOf = m => m.phys?.sg === undefined && m.fluid ? 0 : sgOf(m) * 1000 * (m.phys?.fill ?? PHYS_DEFAULTS.fill);
  const colliders = list.map(m => Object.freeze({
    friction: Math.sqrt(m.phys?.friction ?? PHYS_DEFAULTS.friction), // D4: √f with Multiply gives √(fa·fb)
    restitution: m.phys?.restitution ?? PHYS_DEFAULTS.restitution,
    density: densityOf(m),
  }));

  return Object.freeze({
    ids,
    get: id => list[need(id)],
    has: id => at.has(id),
    index: need,
    byIndex: i => { if (!Number.isInteger(i) || i < 0 || i >= ids.length) throw new Error(`materials: no material at index ${i}`); return ids[i]; },
    density: id => colliders[need(id)].density,
    collider: id => colliders[need(id)],
  });
}
```

- [ ] **Step 4: Run it and expect PASS.** The same run: 9 pass, 0 fail.

- [ ] **Step 5: Prove the merge test red by mutation.** In `merge`, temporarily replace `out[k] = isPlain(out[k]) && isPlain(v) ? merge(out[k], v) : clone(v);` with `out[k] = clone(v);`. Run again and expect 3 failures: "extends deep-merges…", "a game entry with a base id…" and "density is sg × 1000 × fill…" (`shell` loses steel's `sg`). Revert, then run again and expect 9 pass.

- [ ] **Step 6: Commit.**

```bash
git add src/defs/materials.js test/materials.test.mjs
git commit -m "feat(materials): defineMaterials with validation, extends and collider values (M-1, M-3)"
```

---

### Task 3 (judgment): Pairs (M-7, M-8, D4)

**Decisions this task makes:**
- **Results are cached per ordered pair.** The overview says "cached per unordered pair". But M-8's tie rule (cues to `a`) and the tyre rule (`b`'s first) make `pair(a, b)` and `pair(b, a)` differ, so an unordered cache would return whichever was asked first (a Contract issue).
- **A pair entry's `tire` merges field by field over the ground's `tire`.** So `{ tire: { mu: 0.2 } }` keeps the ground's `C`, `kp` and the rest, and the vehicle kit always sees a complete set.
- **`sound` and `fx`** come from the softer material, fall back to the harder one's when the softer has none, and are `null` when neither has one. `tire` is `null` when nothing supplies it.
- **Pair keys:** `'a|b'` and `'b|a'` in one table is an error ("repeats").

**Files:**
- Modify: `src/defs/materials.js`
- Test: `test/materials-pairs.test.mjs`

**Interfaces:**
- Consumes: the Registry internals from Task 2 (`check`, `clone`, `merge`, `deepFreeze`, `need`, `list`, `sgOf`, `TIRE`).
- Produces: `Registry.pair(a, b)`; `defineMaterials(entries, { pairs })` validates pairs.

- [ ] **Step 1: Write the failing test.** Create `test/materials-pairs.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMaterials } from '../src/defs/materials.js';

test('3b: an unlisted pair combines by M-8: geometric-mean friction, max restitution, cues from the softer', () => {
  const m = defineMaterials();
  const p = m.pair('rubber', 'steel');
  assert.equal(p.friction, Math.sqrt(1 * 0.6));
  assert.equal(p.restitution, 0.6);
  assert.equal(p.sound, 'thud', 'rubber (sg 1.1) is softer than steel (7.85)');
  assert.equal(p.fx, 'sparks', 'rubber has no fx, so the harder material\'s');
  assert.equal(p.tire, null, 'neither has tyre data');
  assert.equal(m.pair('steel', 'rubber').sound, 'thud', 'softer wins on either side');
  assert.equal(m.pair('rubber', 'steel').friction, m.collider('rubber').friction * m.collider('steel').friction, 'matches Rapier Multiply of √f (D4)');
});
test('3b: an sg tie takes the cues of a; tyre data comes from b (the ground), else a', () => {
  const m = defineMaterials({ hoof: { phys: { sg: 1.6 }, sound: 'clop' }, track: { extends: 'gravel', tire: { mu: 0.7 } } });
  assert.equal(m.pair('hoof', 'gravel').sound, 'clop', 'tie (1.6 = 1.6) goes to a');
  assert.equal(m.pair('gravel', 'hoof').sound, 'crunch', 'tie goes to a');
  assert.equal(m.pair('rubber', 'gravel').tire.mu, 0.8);
  assert.equal(m.pair('gravel', 'rubber').tire.mu, 0.8, 'b has none, so a\'s');
  assert.equal(m.pair('track', 'gravel').tire.mu, 0.8, 'b is the ground');
  assert.equal(m.pair('gravel', 'track').tire.mu, 0.7);
});
test('3b: a pair entry wins field by field, keyed by an unordered pair (M-7)', () => {
  const m = defineMaterials({}, { pairs: { 'rubber|ice': { friction: 0.1, sound: 'squeal', tire: { mu: 0.2 } } } });
  for (const [a, b] of [['rubber', 'ice'], ['ice', 'rubber']]) {
    const p = m.pair(a, b);
    assert.equal(p.friction, 0.1);
    assert.equal(p.sound, 'squeal');
    assert.equal(p.restitution, 0.6, 'not in the entry: M-8');
    assert.equal(p.fx, 'frost', 'not in the entry: from the softer (ice)');
    assert.deepEqual({ ...p.tire }, { mu: 0.2, C: 1.4, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 }, 'entry tyre fields over the ground\'s');
  }
  assert.equal(m.pair('rubber', 'steel').friction, Math.sqrt(0.6), 'other pairs unaffected');
});
test('3b: pair() is cached per ordered pair and frozen', () => {
  const m = defineMaterials();
  const p = m.pair('rubber', 'ice');
  assert.equal(m.pair('rubber', 'ice'), p);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.tire));
  assert.throws(() => m.pair('rubber', 'nope'), /^Error: materials: unknown material 'nope'$/);
});
test('3b: bad pair tables throw naming the pair', () => {
  const cases = [
    [{ 'rubber|zz': {} }, "materials: pair 'rubber|zz' names unknown material 'zz'"],
    [{ rubber: {} }, "materials: pair 'rubber' must be 'a|b'"],
    [{ 'a|b|c': {} }, "materials: pair 'a|b|c' must be 'a|b'"],
    [{ 'rubber|ice': {}, 'ice|rubber': {} }, "materials: pair 'ice|rubber' repeats 'rubber|ice'"],
    [{ 'rubber|ice': { grip: 1 } }, "materials: pair 'rubber|ice'.grip unknown field (got 1)"],
    [{ 'rubber|ice': { friction: 3 } }, "materials: pair 'rubber|ice'.friction out of range 0–2 (got 3)"],
    [{ 'rubber|ice': { tire: { mu: -1 } } }, "materials: pair 'rubber|ice'.tire.mu must be >= 0 (got -1)"],
  ];
  for (const [pairs, message] of cases) assert.throws(() => defineMaterials({}, { pairs }), e => e.message === message || assert.fail(`got "${e.message}", want "${message}"`));
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `test/materials-pairs.test.mjs`. Expected: 5 failures, `TypeError: m.pair is not a function` and missing throws for the bad tables.

- [ ] **Step 3: Implement.** Make four edits to `src/defs/materials.js`.

  (a) Directly after the `SCHEMA` object's closing line (`  game: plainData, // D6: free-form, not schema-checked, copied through extends` then `};`), insert:

```js
const PAIR = { friction: range(0, 2), restitution: unit, tire: TIRE, sound: str, fx: str };
```

  (b) Directly before `export function defineMaterials(`, insert, followed by one blank line:

```js
function parsePairs(pairs, has) {
  if (!isPlain(pairs)) throw new Error(`materials: pairs must be an object (got ${show(pairs)})`);
  const out = new Map(); // 'a|b' with a <= b → validated, frozen entry
  for (const [key, entry] of Object.entries(pairs)) {
    const ids = key.split('|');
    if (ids.length !== 2 || !ids[0] || !ids[1]) throw new Error(`materials: pair '${key}' must be 'a|b'`);
    for (const id of ids) if (!has(id)) throw new Error(`materials: pair '${key}' names unknown material '${id}'`);
    const norm = [...ids].sort().join('|');
    if (out.has(norm)) throw new Error(`materials: pair '${key}' repeats '${out.get(norm).key}'`);
    check(PAIR, entry, '#', (path, problem, v) => { throw new Error(`materials: pair '${key}'${path.slice(1)} ${problem} (got ${show(v)})`); });
    out.set(norm, { key, entry: deepFreeze(clone(entry)) });
  }
  return out;
}
```

  (c) Directly before `  return Object.freeze({` inside `defineMaterials`, insert, followed by one blank line:

```js
  // 4. Pairs (M-7, M-8). Cached per ORDERED pair: the tie and tyre rules depend on which side is the ground (b).
  const table = parsePairs(options.pairs ?? {}, id => at.has(id));
  const pairEntries = new Map();
  for (const [norm, { entry }] of table) { const [a, b] = norm.split('|').map(need); pairEntries.set(Math.min(a, b) * 256 + Math.max(a, b), entry); }
  const pairCache = new Map();
  const pair = (a, b) => {
    const ia = need(a), ib = need(b), k = ia * 256 + ib;
    let r = pairCache.get(k);
    if (r) return r;
    const ma = list[ia], mb = list[ib], e = pairEntries.get(Math.min(ia, ib) * 256 + Math.max(ia, ib)) ?? {};
    const soft = sgOf(mb) < sgOf(ma) ? mb : ma, hard = soft === ma ? mb : ma; // ties go to a
    const ground = mb.tire ?? ma.tire;
    r = deepFreeze({
      friction: e.friction ?? Math.sqrt((ma.phys?.friction ?? PHYS_DEFAULTS.friction) * (mb.phys?.friction ?? PHYS_DEFAULTS.friction)),
      restitution: e.restitution ?? Math.max(ma.phys?.restitution ?? PHYS_DEFAULTS.restitution, mb.phys?.restitution ?? PHYS_DEFAULTS.restitution),
      tire: e.tire ? (ground ? merge(ground, e.tire) : clone(e.tire)) : ground ?? null,
      sound: e.sound ?? soft.sound ?? hard.sound ?? null,
      fx: e.fx ?? soft.fx ?? hard.fx ?? null,
    });
    pairCache.set(k, r);
    return r;
  };
```

  (d) In the returned object, after `    collider: id => colliders[need(id)],`, add the line `    pair,`.

- [ ] **Step 4: Run it and expect PASS.** Unit run with `test/materials-pairs.test.mjs test/materials.test.mjs`: 14 pass, 0 fail.

- [ ] **Step 5: Prove the ordering tests red by mutation.**
  1. Change `sgOf(mb) < sgOf(ma)` to `sgOf(mb) <= sgOf(ma)` and run `test/materials-pairs.test.mjs`. Expect 1 failure ("an sg tie takes the cues of a…"). Revert.
  2. Change `k = ia * 256 + ib;` to `k = Math.min(ia, ib) * 256 + Math.max(ia, ib);` and run again. Expect 1 failure, the same test, because `pair('gravel', 'hoof')` returns the cached `pair('hoof', 'gravel')`. Revert.
  3. Run again and expect 5 pass.

- [ ] **Step 6: Commit.**

```bash
git add src/defs/materials.js test/materials-pairs.test.mjs
git commit -m "feat(materials): pair table and M-8 pair resolution"
```

---

### Task 4: Canonical JSON and the registry hash

**Decision (ruling 6):** the hash covers only what sidecars and colliders depend on, so a `look` or `game` tweak needs no re-bake. The hashed object is `{ materials: [[<id>, { friction, restitution, sg, fill }], ...] in index order, pairs: { '<a>|<b>' with a <= b: { friction?, restitution? } } }`:
- `materials` is an array, so the ids **and their order** count. Each value is the effective `phys` that `collider()`/`density()` read: `PHYS_DEFAULTS` filled in, and `sg` from `sgOf` (0 for a fluid without `phys.sg`). Spelling out a default does not change the hash.
- `pairs` keeps only an entry's `friction` and `restitution`; an entry with neither is left out.
- Not hashed: `look`, `game`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `fluid` (beyond its effect on `sg`), `sound`, `fx`, and pair `tire`/`sound`/`fx`. Kits and the view read these live from the registry. Cost: a stale `look` baked into a GLB is not caught by `checks.materials`.

It is written as canonical JSON (keys sorted at every level) and hashed with the engine's `fnv` (FNV-1a over UTF-16 code units), rendered as 8 lowercase hex digits. The base library's hash is pinned at `2f4f4f95`.

**Files:**
- Modify: `src/defs/materials.js`
- Test: `test/materials-hash.test.mjs`

**Interfaces:**
- Consumes: `fnv` from `src/core/rng.js`; `list`, `sgOf`, `PHYS_DEFAULTS` (Task 2); `parsePairs`' `table` (Task 3).
- Produces: `canonicalJson(value) → string`; `Registry.hash`.

- [ ] **Step 1: Write the failing test.** Create `test/materials-hash.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMaterials, canonicalJson } from '../src/defs/materials.js';

test('3b: canonicalJson sorts keys at every level and refuses non-JSON values', () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 'x' }], n: null }), '{"a":[1,{"c":"x","d":2}],"b":1,"n":null}');
  assert.throws(() => canonicalJson({ a: NaN }), /cannot hash NaN/);
  assert.throws(() => canonicalJson({ a: () => 1 }), /cannot hash/);
});
test('3b: the registry hash is 8 hex digits and pinned for the base library', () => {
  assert.equal(defineMaterials().hash, '2f4f4f95'); // changes only when ids, phys, pair contact values or the hash rule change (every phys.json re-bakes)
});
test('3b: the hash sees ids, their order, phys and pair friction/restitution; not key order, look, game or cues (ruling 6)', () => {
  const ENTRIES = { x: { extends: 'steel', phys: { friction: 0.6, restitution: 0.2 } }, y: { look: { color: '#808080' }, game: { k: 1 } } };
  const PAIRS = { 'rubber|ice': { friction: 0.1, sound: 'squeal' }, 'x|y': { restitution: 0.4, sound: 's' }, 'steel|ice': { fx: 'frost' } };
  const make = (edit = () => {}) => { const e = structuredClone(ENTRIES), p = structuredClone(PAIRS); edit(e, p); return defineMaterials(e, { pairs: p }).hash; };
  const h = make();
  assert.match(h, /^[0-9a-f]{8}$/);
  const reordered = defineMaterials(
    { x: { phys: { restitution: 0.2, friction: 0.6 }, extends: 'steel' }, y: { game: { k: 1 }, look: { color: '#808080' } } },
    { pairs: { 'ice|steel': { fx: 'frost' }, 'y|x': { sound: 's', restitution: 0.4 }, 'ice|rubber': { sound: 'squeal', friction: 0.1 } } });
  assert.equal(reordered.hash, h, 'key order and pair orientation');
  const same = {
    'game': (e) => { e.y.game.k = 2; },
    'look': (e) => { e.y.look.color = '#ff0000'; },
    'material cue': (e) => { e.x.sound = 'clang'; },
    'material tyre': (e) => { e.x.tire = { mu: 0.9 }; },
    'pair cue': (e, p) => { p['x|y'].sound = 't'; },
    'pair tyre': (e, p) => { p['rubber|ice'].tire = { mu: 0.2 }; },
    'cue-only pair removed': (e, p) => { delete p['steel|ice']; },
  };
  for (const [what, edit] of Object.entries(same)) assert.equal(make(edit), h, what);
  const differs = {
    'ids order': () => defineMaterials({ y: ENTRIES.y, x: ENTRIES.x }, { pairs: PAIRS }).hash,
    'new id': () => make(e => { e.z = {}; }),
    'phys.friction': () => make(e => { e.x.phys.friction = 0.61; }),
    'phys.fill': () => make(e => { e.x.phys.fill = 0.5; }),
    'extends (sg)': () => make(e => { e.x.extends = 'aluminium'; }),
    'pair friction': () => make((e, p) => { p['rubber|ice'].friction = 0.11; }),
    'pair restitution': () => make((e, p) => { p['x|y'].restitution = 0.5; }),
    'pair removed': () => make((e, p) => { delete p['rubber|ice']; }),
  };
  for (const [what, hashOf] of Object.entries(differs)) assert.notEqual(hashOf(), h, what);
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `test/materials-hash.test.mjs`. Expected: 1 failure, `SyntaxError: The requested module '../src/defs/materials.js' does not provide an export named 'canonicalJson'`.

- [ ] **Step 3: Implement.** Make four edits to `src/defs/materials.js`.

  (a) Directly before `import { BASE_MATERIALS } from './materials.base.js';`, insert the line `import { fnv } from '../core/rng.js';`.

  (b) Directly before `function parsePairs(`, insert, followed by one blank line:

```js
// Canonical JSON: keys sorted at every level, so the hash does not depend on declaration order.
export const canonicalJson = v => {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (finite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (isPlain(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  throw new Error(`materials: cannot hash ${show(v)}`);
};
const hex8 = s => fnv(s).toString(16).padStart(8, '0');
```

  (c) Directly before `  return Object.freeze({` inside `defineMaterials` (that is, after Task 3's pair section), insert, followed by one blank line:

```js
  // 5. Hash (overview §4.2, ruling 6): only what sidecars and colliders depend on. Per material in index order (so ids
  //    and their order count), the effective phys values collider()/density() read; per pair, its friction/restitution.
  //    look, game, tire, dirtRate, coverage, aero, magnet, sound and fx are read live, so changing them needs no re-bake.
  const contact = e => Object.fromEntries(['friction', 'restitution'].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  const hash = hex8(canonicalJson({
    materials: list.map(m => [m.id, {
      friction: m.phys?.friction ?? PHYS_DEFAULTS.friction,
      restitution: m.phys?.restitution ?? PHYS_DEFAULTS.restitution,
      sg: sgOf(m), fill: m.phys?.fill ?? PHYS_DEFAULTS.fill,
    }]),
    pairs: Object.fromEntries([...table].map(([norm, { entry }]) => [norm, contact(entry)]).filter(([, c]) => Object.keys(c).length)),
  }));
```

  (d) In the returned object, after `    ids,`, add the line `    hash,`.

- [ ] **Step 4: Run it and expect PASS.** Unit run with `test/materials-hash.test.mjs test/materials-pairs.test.mjs test/materials.test.mjs`: 17 pass, 0 fail. If the pinned literal differs, stop. Either Task 1's data or the canonical form differs from this plan, so diff them against the plan before you touch the literal. Report it in the notes; never just paste the new value.

- [ ] **Step 5: Prove the hash tests red by mutation.**
  1. In `canonicalJson`, change `Object.keys(v).sort()` to `Object.keys(v)`. Run `test/materials-hash.test.mjs` and expect 3 failures: the `canonicalJson` sorting test, the pinned literal (`fill` sorts before `friction`), and "the hash sees ids…" (pair orientation). Revert.
  2. Replace the `materials:` and `pairs:` lines of the hashed object with the whole resolved table, `materials: Object.fromEntries(list.map(m => [m.id, m])), pairs: Object.fromEntries([...table].map(([norm, { entry }]) => [norm, entry])),`. Expect 2 failures: the pinned literal and "the hash sees ids…" (`game`/`look`/cue edits change it; the ids-order swap does not). Revert.
  3. Run again and expect 3 pass.

- [ ] **Step 6: Commit.**

```bash
git add src/defs/materials.js test/materials-hash.test.mjs
git commit -m "feat(materials): canonical JSON and the 8-hex registry hash"
```

---

### Task 5 (judgment): Collider entries (`validateCollider`)

**Decisions this task makes:**
- **One validator for baked and inline colliders** (overview §4.3: "exactly the same entry shape").
- **Baked entries** require `p`, `q` and `part`; `inline: true` lets them be omitted. `material` is always required.
- **Unknown fields are errors**, which catches `radius` for `r`.
- **`'ball'` is rejected with a hint** to use `'sphere'`. The overview's §4.4 spawn example says `'ball'` (a Contract issue).
- **`paint-*` materials are rejected.** The bake maps paint to `bake.paint.base`, so physics never sees a slot.
- **Hulls take 4–64 points**, matching the bake's cap.
- **Typed arrays are accepted** for number lists (procedural inline hulls).
- **Quaternions** must be unit to within 1e-3.
- **`box` takes an optional `round`** (border radius, > 0 and below the smallest `half`) for Rapier's roundCuboid (3j #1; 3c builds it). Other shapes reject it as an unknown field.

**Files:**
- Create: `src/defs/sidecar.js`
- Test: `test/sidecar-collider.test.mjs`

**Interfaces:**
- Consumes: a Registry's `has` (optional).
- Produces: `SIDECAR_VERSION`, `SHAPES`, `MAX_HULL_POINTS`, `validateCollider(entry, { where, path, materials, parts, inline }) → entry`.

- [ ] **Step 1: Write the failing test.** Create `test/sidecar-collider.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDECAR_VERSION, SHAPES, MAX_HULL_POINTS, validateCollider } from '../src/defs/sidecar.js';
import { defineMaterials } from '../src/defs/materials.js';

const I = [0, 0, 0, 1], O = [0, 0, 0];
const CUBE = [-1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
const EVERY = [
  { shape: 'box', half: [1, 0.5, 2], p: [0, 0.5, 0], q: I, part: 'body', material: 'steel' },
  { shape: 'sphere', r: 0.3, p: [1, 0, 1], q: I, part: 'wheel', material: 'rubber' },
  { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: O, q: [0, 0.7071068, 0, 0.7071068], part: 'body', material: 'steel' },
  { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: O, q: I, part: 'wheel', material: 'rubber' },
  { shape: 'hull', points: CUBE, p: O, q: I, part: 'body', material: 'wood' },
  { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2], p: O, q: I, part: 'body', material: 'wood' },
];
const opts = { where: 'sidecar: cart', path: 'c', parts: ['body', 'wheel'] };
const throwsExactly = (fn, message) => assert.throws(fn, e => (message instanceof RegExp ? message.test(e.message) : e.message === message) || assert.fail(`got "${e.message}", want "${message}"`));
const bad = (i, edit, message) => { const c = structuredClone(EVERY[i]); edit(c); throwsExactly(() => validateCollider(c, { ...opts, materials: defineMaterials() }), message); };

test('3b: every collider shape validates and is returned unchanged (overview §4.3)', () => {
  assert.equal(SIDECAR_VERSION, 1);
  assert.deepEqual([...SHAPES], ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh']);
  const m = defineMaterials();
  for (const c of EVERY) assert.equal(validateCollider(c, { ...opts, materials: m }), c, c.shape);
  const rounded = { ...EVERY[0], half: [1, 0.04, 2], round: 0.2 }; // Rally's thin core: round may exceed half
  assert.equal(validateCollider(rounded, { ...opts, materials: m }), rounded, 'a box may carry round (roundCuboid, 3j #1)');
});
test('3b: collider errors name the prefix, the path and the field', () => {
  bad(0, c => { c.half = [1, 0, 1]; }, 'sidecar: cart: c.half must be 3 numbers > 0 (got [1,0,1])');
  bad(1, c => { c.r = 0; }, 'sidecar: cart: c.r must be a number > 0 (got 0)');
  bad(1, c => { c.radius = 1; }, 'sidecar: cart: c.radius unknown field for a sphere (got 1)');
  bad(2, c => { c.q = [0, 0, 0, 2]; }, 'sidecar: cart: c.q must be a unit quaternion [x, y, z, w] (got [0,0,0,2])');
  bad(3, c => { delete c.p; }, 'sidecar: cart: c.p must be 3 numbers (got undefined)');
  bad(3, c => { c.part = 'tyre'; }, "sidecar: cart: c.part names an unknown part (got 'tyre')");
  bad(4, c => { c.points = CUBE.slice(0, 9); }, `sidecar: cart: c.points must be 4–${MAX_HULL_POINTS} points as a flat [x, y, z, ...] list (got [-1,-1,-1,1,-1,-1,-1,1,-1])`);
  bad(4, c => { c.points = Array.from({ length: (MAX_HULL_POINTS + 1) * 3 }, (_, i) => i); }, /^sidecar: cart: c\.points must be 4–64 points as a flat \[x, y, z, \.\.\.\] list \(got \[0,1,2,/);
  bad(4, c => { c.points = [...CUBE, 1, 2]; }, /^sidecar: cart: c\.points must be 4–64 points/);
  bad(5, c => { c.indices = [0, 1, 3]; }, 'sidecar: cart: c.indices[2] must be a vertex index 0–2 (got 3)');
  bad(5, c => { c.indices = [0, 1]; }, 'sidecar: cart: c.indices must be whole triangles (a multiple of 3, at least 3) (got [0,1])');
  bad(0, c => { c.material = 'unobtainium'; }, "sidecar: cart: c.material names an unknown material (got 'unobtainium')");
  bad(0, c => { c.material = 'paint-body'; }, "sidecar: cart: c.material is a paint slot; colliders take its base material (A-4) (got 'paint-body')");
  bad(0, c => { c.shape = 'ball'; }, "sidecar: cart: c.shape unknown shape (use 'sphere') (got 'ball')");
  bad(0, c => { c.round = 0; }, 'sidecar: cart: c.round must be a number > 0 (got 0)');
  bad(0, c => { c.round = Infinity; }, 'sidecar: cart: c.round must be a number > 0 (got Infinity)');
  bad(1, c => { c.round = 0.1; }, 'sidecar: cart: c.round unknown field for a sphere (got 0.1)');
  bad(0, c => { c.shape = 'cone'; }, "sidecar: cart: c.shape unknown shape (one of box, sphere, capsule, cylinder, hull, mesh) (got 'cone')");
});
test('3b: a full hull of exactly 64 points passes; 4 is the minimum', () => {
  const pts = Array.from({ length: MAX_HULL_POINTS * 3 }, (_, i) => Math.sin(i));
  assert.equal(validateCollider({ shape: 'hull', points: pts, material: 'wood' }, { inline: true }).points.length, 192);
  assert.equal(validateCollider({ shape: 'hull', points: CUBE, material: 'wood' }, { inline: true }).points.length, 12);
});
test('3b: inline colliders may leave out p, q and part; material is always required', () => {
  const m = defineMaterials();
  const c = { shape: 'sphere', r: 0.4, material: 'flesh' };
  assert.equal(validateCollider(c, { inline: true, materials: m }), c);
  assert.equal(validateCollider({ shape: 'hull', points: new Float32Array(CUBE), material: 'wood' }, { inline: true }).shape, 'hull', 'typed arrays are accepted');
  throwsExactly(() => validateCollider({ shape: 'sphere', r: 0.4 }, { inline: true, where: "spawn 'pig'", path: 'colliders[0]' }), "spawn 'pig': colliders[0].material must be a non-empty string (got undefined)");
  throwsExactly(() => validateCollider({ shape: 'sphere', r: 0.4, material: 'flesh', p: [0, 1] }, { inline: true }), 'collider: collider.p must be 3 numbers (got [0,1])');
  throwsExactly(() => validateCollider(c, {}), 'collider: collider.p must be 3 numbers (got undefined)');
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `test/sidecar-collider.test.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `src/defs/sidecar.js`.

- [ ] **Step 3: Implement.** Create `src/defs/sidecar.js`:

```js
// src/defs/sidecar.js
// Physics sidecar schema (A-5..A-7; overview §4.3, D2). Validates baked/phys.json, each model's sidecar in it, and the
// inline collider entries that spawn({ colliders }) takes (the same shape, with p, q and part optional). Plain data:
// the sim, the bake (Node) and tests import it. Validators return their input unchanged or throw on the first error.
export const SIDECAR_VERSION = 1;
export const SHAPES = Object.freeze(['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh']);
export const MAX_HULL_POINTS = 64;

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const show = v => {
  let s;
  if (typeof v === 'string') s = `'${v}'`;
  else if (typeof v === 'number' || v === undefined || typeof v === 'function') s = String(v);
  else if (ArrayBuffer.isView(v)) s = `${v.constructor.name}(${v.length})`;
  else { try { s = JSON.stringify(v); } catch { s = String(v); } }
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const nums = v => (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) && Array.prototype.every.call(v, finite);
const vec3 = v => nums(v) && v.length === 3;
const quat = v => nums(v) && v.length === 4 && Math.abs(Math.hypot(v[0], v[1], v[2], v[3]) - 1) < 1e-3;
const name = v => typeof v === 'string' && v.length > 0;

const SHAPE_FIELDS = { box: ['half', 'round'], sphere: ['r'], capsule: ['halfHeight', 'r'], cylinder: ['halfHeight', 'r'], hull: ['points'], mesh: ['vertices', 'indices'] };
const COMMON = ['shape', 'p', 'q', 'part', 'material'];

// One collider entry. where: the message prefix ('sidecar: tractor', "spawn 'pig'"); path: 'colliders[2]'.
// materials: a registry (optional) whose has() every material must pass; parts: the model's part names (optional).
// inline: true for spawn({ colliders }) entries, where p, q and part may be left out.
export function validateCollider(c, { where = 'collider', path = 'collider', materials, parts, inline = false } = {}) {
  const fail = (field, problem, v) => { throw new Error(`${where}: ${path}${field ? '.' + field : ''} ${problem} (got ${show(v)})`); };
  if (!isPlain(c)) fail('', 'must be an object', c);
  if (!SHAPES.includes(c.shape)) fail('shape', c.shape === 'ball' ? "unknown shape (use 'sphere')" : `unknown shape (one of ${SHAPES.join(', ')})`, c.shape);
  const allowed = [...COMMON, ...SHAPE_FIELDS[c.shape]];
  for (const k of Object.keys(c)) if (!allowed.includes(k)) fail(k, `unknown field for a ${c.shape}`, c[k]);
  if (c.p !== undefined || !inline) { if (!vec3(c.p)) fail('p', 'must be 3 numbers', c.p); }
  if (c.q !== undefined || !inline) { if (!quat(c.q)) fail('q', 'must be a unit quaternion [x, y, z, w]', c.q); }
  if (c.part !== undefined || !inline) {
    if (!name(c.part)) fail('part', 'must be a non-empty string', c.part);
    if (parts && !parts.includes(c.part)) fail('part', 'names an unknown part', c.part);
  }
  if (!name(c.material)) fail('material', 'must be a non-empty string', c.material);
  if (c.material.startsWith('paint-')) fail('material', 'is a paint slot; colliders take its base material (A-4)', c.material);
  if (materials && !materials.has(c.material)) fail('material', 'names an unknown material', c.material);
  const pos = k => { if (!finite(c[k]) || c[k] <= 0) fail(k, 'must be a number > 0', c[k]); };
  switch (c.shape) {
    case 'box':
      if (!vec3(c.half) || !Array.prototype.every.call(c.half, x => x > 0)) fail('half', 'must be 3 numbers > 0', c.half);
      // round: optional border radius, Rapier roundCuboid (3c; Rally's hull, 3j #1). Rapier adds it OUTSIDE half, so it may
      // exceed half (Rally: half y 0.04, round 0.2).
      if (c.round !== undefined && (!finite(c.round) || c.round <= 0)) fail('round', 'must be a number > 0', c.round);
      break;
    case 'sphere': pos('r'); break;
    case 'capsule': case 'cylinder': pos('halfHeight'); pos('r'); break;
    case 'hull': {
      const n = nums(c.points) && c.points.length % 3 === 0 ? c.points.length / 3 : -1;
      if (n < 4 || n > MAX_HULL_POINTS) fail('points', `must be 4–${MAX_HULL_POINTS} points as a flat [x, y, z, ...] list`, c.points);
      break;
    }
    case 'mesh': {
      if (!nums(c.vertices) || c.vertices.length % 3 !== 0 || c.vertices.length < 9) fail('vertices', 'must be at least 3 points as a flat [x, y, z, ...] list', c.vertices);
      const nv = c.vertices.length / 3;
      if (!nums(c.indices) || c.indices.length % 3 !== 0 || c.indices.length < 3) fail('indices', 'must be whole triangles (a multiple of 3, at least 3)', c.indices);
      for (let i = 0; i < c.indices.length; i++) { const x = c.indices[i]; if (!Number.isInteger(x) || x < 0 || x >= nv) fail(`indices[${i}]`, `must be a vertex index 0–${nv - 1}`, x); }
      break;
    }
  }
  return c;
}
```

- [ ] **Step 4: Run it and expect PASS.** The same run: 4 pass, 0 fail.

- [ ] **Step 5: Prove the inline test red by mutation.** Change `if (c.p !== undefined || !inline)` to `if (c.p !== undefined)`. Run and expect 2 failures: "collider errors…" (`delete c.p` no longer throws) and "inline colliders…" (the last throw). Revert, then run again and expect 4 pass.

- [ ] **Step 6: Commit.**

```bash
git add src/defs/sidecar.js test/sidecar-collider.test.mjs
git commit -m "feat(sidecar): collider entry schema shared by sidecars and inline colliders (A-5, A-6)"
```

---

### Task 6: Sidecars, `phys.json` and `materialRefs` (A-5, A-7, D2, T-14 helper)

**Decisions this task makes:**
- **Field rules:**
  - `v`, `parts` and `colliders` are required;
  - `source`, `mass`, `sockets` and `bounds` are optional, so 3c's hand-written fixtures need no fake sha;
  - unknown top-level fields are errors (aero panels are out of scope in phase 3, D2).
- **`validatePhys` checks shape and material existence only.** Comparing `phys.materials` with `registry.hash` is the caller's job (`checks.materials`, `bake --check`), so a stale bake reads as stale, not as malformed.
- **`materialRefs(phys)`** gives 3c's `checks.materials` (T-14) every referenced material, with where it is referenced.
- **The manifest and `*.anim.json` schemas stay with 3d.**

**Files:**
- Modify: `src/defs/sidecar.js`
- Test: `test/sidecar.test.mjs`

**Interfaces:**
- Consumes: `validateCollider` (Task 5); `defineMaterials` (Task 2).
- Produces: `validateSidecar(s, { model, materials }) → s`, `validatePhys(phys, { materials }) → phys`, `materialRefs(phys)`.

- [ ] **Step 1: Write the failing test.** Create `test/sidecar.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSidecar, validatePhys, materialRefs } from '../src/defs/sidecar.js';
import { defineMaterials } from '../src/defs/materials.js';

const I = [0, 0, 0, 1], O = [0, 0, 0];
const CUBE = [-1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
const good = () => ({
  v: 1,
  source: { file: 'assets/models/cart.glb', sha256: 'a'.repeat(64) },
  parts: ['body', 'wheel'],
  colliders: [
    { shape: 'box', half: [1, 0.5, 2], p: [0, 0.5, 0], q: I, part: 'body', material: 'steel' },
    { shape: 'sphere', r: 0.3, p: [1, 0, 1], q: I, part: 'wheel', material: 'rubber' },
    { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: O, q: [0, 0.7071068, 0, 0.7071068], part: 'body', material: 'steel' },
    { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: O, q: I, part: 'wheel', material: 'rubber' },
    { shape: 'hull', points: CUBE, p: O, q: I, part: 'body', material: 'wood' },
    { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2], p: O, q: I, part: 'body', material: 'wood' },
  ],
  mass: { mass: 120, com: [0, 0.4, 0], inertia: [10, 12, 8], frame: I },
  sockets: { hat: { p: [0, 1.2, 0], q: I, part: 'body' } },
  bounds: { min: [-1, 0, -2], max: [1, 1, 2] },
});
const throwsExactly = (fn, message) => assert.throws(fn, e => (message instanceof RegExp ? message.test(e.message) : e.message === message) || assert.fail(`got "${e.message}", want "${message}"`));

test('3b: a complete sidecar with every shape validates and is returned unchanged (overview §4.3)', () => {
  const s = good();
  assert.equal(validateSidecar(s, { model: 'cart', materials: defineMaterials() }), s);
  const min = { v: 1, parts: [], colliders: [] };
  assert.equal(validateSidecar(min), min, 'source, mass, sockets and bounds are optional (hand-written fixtures)');
});
test('3b: sidecar errors name the model and the path', () => {
  const bad = (edit, message) => { const s = good(); edit(s); throwsExactly(() => validateSidecar(s, { model: 'cart', materials: defineMaterials() }), message); };
  bad(s => { s.v = 2; }, 'sidecar: cart: v must be 1 (got 2)');
  bad(s => { s.panels = []; }, 'sidecar: cart: panels unknown field (got [])');
  bad(s => { s.source.sha256 = 'XYZ'; }, "sidecar: cart: source.sha256 must be 64 lowercase hex digits (got 'XYZ')");
  bad(s => { s.parts = ['body', 'body']; }, "sidecar: cart: parts[1] repeats a part (got 'body')");
  bad(s => { s.colliders[0].half = [1, 0, 1]; }, 'sidecar: cart: colliders[0].half must be 3 numbers > 0 (got [1,0,1])');
  bad(s => { delete s.colliders[3].p; }, 'sidecar: cart: colliders[3].p must be 3 numbers (got undefined)');
  bad(s => { s.colliders[3].part = 'tyre'; }, "sidecar: cart: colliders[3].part names an unknown part (got 'tyre')");
  bad(s => { s.colliders[0].material = 'unobtainium'; }, "sidecar: cart: colliders[0].material names an unknown material (got 'unobtainium')");
  bad(s => { s.mass.inertia = [1, -1, 1]; }, 'sidecar: cart: mass.inertia must be 3 numbers >= 0 (got [1,-1,1])');
  bad(s => { s.sockets.hat.part = 'roof'; }, "sidecar: cart: sockets.hat.part names an unknown part (got 'roof')");
  bad(s => { s.bounds.max = [1, -1, 2]; }, 'sidecar: cart: bounds.max must be 3 numbers, each >= min (got [1,-1,2])');
});
test('3b: validatePhys checks the envelope and every model, with the model id in the message (D2)', () => {
  const phys = { v: 1, engine: '0.8.0', materials: '2f4f4f95', models: { cart: good(), crate: { v: 1, parts: ['crate'], colliders: [{ shape: 'box', half: [0.5, 0.5, 0.5], p: O, q: I, part: 'crate', material: 'wood' }] } } };
  assert.equal(validatePhys(phys, { materials: defineMaterials() }), phys);
  const bad = (edit, message) => { const p = structuredClone(phys); edit(p); throwsExactly(() => validatePhys(p, { materials: defineMaterials() }), message); };
  bad(p => { p.v = 0; }, 'phys: v must be 1 (got 0)');
  bad(p => { p.engine = '0.8'; }, "phys: engine must be a version like 0.8.0 (got '0.8')");
  bad(p => { p.materials = '2F4F4F95'; }, "phys: materials must be an 8-hex registry hash (got '2F4F4F95')");
  bad(p => { p.models = []; }, 'phys: models must be an object (got [])');
  bad(p => { p.extra = 1; }, 'phys: extra unknown field (got 1)');
  bad(p => { p.models.crate.colliders[0].material = 'cardboard'; }, "sidecar: crate: colliders[0].material names an unknown material (got 'cardboard')");
  assert.equal(validatePhys({ ...phys, materials: '00000000' }).materials, '00000000', 'a stale hash is the caller\'s check, not a schema error');
});
test('3b: materialRefs lists every material a phys.json names, and where (T-14)', () => {
  const phys = { v: 1, engine: '0.8.0', materials: '2f4f4f95', models: { cart: good() } };
  assert.deepEqual(materialRefs(phys), {
    rubber: ['cart.colliders[1]', 'cart.colliders[3]'],
    steel: ['cart.colliders[0]', 'cart.colliders[2]'],
    wood: ['cart.colliders[4]', 'cart.colliders[5]'],
  });
});
test('3b: the materials and sidecar modules are sim-pure (L-3, T-12)', async () => {
  const { scanPurity } = await import('../testing/purity.js');
  const files = ['materials.js', 'materials.base.js', 'sidecar.js'].map(f => new URL(`../src/defs/${f}`, import.meta.url).pathname);
  assert.deepEqual(scanPurity(files), []);
});
```

- [ ] **Step 2: Run it and expect FAIL.** Unit run with `test/sidecar.test.mjs`. Expected: 1 failure, `SyntaxError: … does not provide an export named …` for one of `validateSidecar`, `validatePhys` and `materialRefs`.

- [ ] **Step 3: Implement.** Append to the end of `src/defs/sidecar.js`, after `validateCollider`, with one blank line between:

```js
const strict = (o, keys, fail, path) => { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${path}${k}`, 'unknown field', o[k]); };

// One model's sidecar (overview §4.3). model: the id for messages. Required: v, parts, colliders.
// Optional: source (hand-written fixtures have none), mass (informational), sockets, bounds.
export function validateSidecar(s, { model = '?', materials } = {}) {
  const where = `sidecar: ${model}`;
  const fail = (path, problem, v) => { throw new Error(`${where}: ${path} ${problem} (got ${show(v)})`); };
  if (!isPlain(s)) throw new Error(`${where}: must be an object (got ${show(s)})`);
  strict(s, ['v', 'source', 'parts', 'colliders', 'mass', 'sockets', 'bounds'], fail, '');
  if (s.v !== SIDECAR_VERSION) fail('v', `must be ${SIDECAR_VERSION}`, s.v);
  if (s.source !== undefined) {
    if (!isPlain(s.source)) fail('source', 'must be an object', s.source);
    strict(s.source, ['file', 'sha256'], fail, 'source.');
    if (!name(s.source.file)) fail('source.file', 'must be a non-empty string', s.source.file);
    if (typeof s.source.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.source.sha256)) fail('source.sha256', 'must be 64 lowercase hex digits', s.source.sha256);
  }
  if (!Array.isArray(s.parts) || !s.parts.every(name)) fail('parts', 'must be a list of non-empty strings', s.parts);
  s.parts.forEach((p, i) => { if (s.parts.indexOf(p) !== i) fail(`parts[${i}]`, 'repeats a part', p); });
  if (!Array.isArray(s.colliders)) fail('colliders', 'must be a list', s.colliders);
  s.colliders.forEach((c, i) => validateCollider(c, { where, path: `colliders[${i}]`, materials, parts: s.parts }));
  if (s.mass !== undefined) {
    const m = s.mass;
    if (!isPlain(m)) fail('mass', 'must be an object', m);
    strict(m, ['mass', 'com', 'inertia', 'frame'], fail, 'mass.');
    if (!finite(m.mass) || m.mass <= 0) fail('mass.mass', 'must be a number > 0', m.mass);
    if (!vec3(m.com)) fail('mass.com', 'must be 3 numbers', m.com);
    if (!vec3(m.inertia) || !m.inertia.every(x => x >= 0)) fail('mass.inertia', 'must be 3 numbers >= 0', m.inertia);
    if (!quat(m.frame)) fail('mass.frame', 'must be a unit quaternion [x, y, z, w]', m.frame);
  }
  if (s.sockets !== undefined) {
    if (!isPlain(s.sockets)) fail('sockets', 'must be an object', s.sockets);
    for (const [k, so] of Object.entries(s.sockets)) {
      if (!isPlain(so)) fail(`sockets.${k}`, 'must be an object', so);
      strict(so, ['p', 'q', 'part'], fail, `sockets.${k}.`);
      if (!vec3(so.p)) fail(`sockets.${k}.p`, 'must be 3 numbers', so.p);
      if (!quat(so.q)) fail(`sockets.${k}.q`, 'must be a unit quaternion [x, y, z, w]', so.q);
      if (!s.parts.includes(so.part)) fail(`sockets.${k}.part`, 'names an unknown part', so.part);
    }
  }
  if (s.bounds !== undefined) {
    const b = s.bounds;
    if (!isPlain(b)) fail('bounds', 'must be an object', b);
    strict(b, ['min', 'max'], fail, 'bounds.');
    if (!vec3(b.min)) fail('bounds.min', 'must be 3 numbers', b.min);
    if (!vec3(b.max) || b.max.some((x, i) => x < b.min[i])) fail('bounds.max', 'must be 3 numbers, each >= min', b.max);
  }
  return s;
}

// The whole baked/phys.json (D2): { v: 1, engine, materials: '<registry hash>', models: { <id>: Sidecar } }.
// It checks the shape and, given a registry, that every material exists. Comparing `materials` with registry.hash is
// the caller's job (checks.materials, lion-hawk bake --check), so a stale hash reads as stale, not as malformed.
export function validatePhys(phys, { materials } = {}) {
  const fail = (path, problem, v) => { throw new Error(`phys: ${path} ${problem} (got ${show(v)})`); };
  if (!isPlain(phys)) throw new Error(`phys: must be an object (got ${show(phys)})`);
  strict(phys, ['v', 'engine', 'materials', 'models'], fail, '');
  if (phys.v !== SIDECAR_VERSION) fail('v', `must be ${SIDECAR_VERSION}`, phys.v);
  if (typeof phys.engine !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(phys.engine)) fail('engine', 'must be a version like 0.8.0', phys.engine);
  if (typeof phys.materials !== 'string' || !/^[0-9a-f]{8}$/.test(phys.materials)) fail('materials', 'must be an 8-hex registry hash', phys.materials);
  if (!isPlain(phys.models)) fail('models', 'must be an object', phys.models);
  for (const [id, s] of Object.entries(phys.models)) validateSidecar(s, { model: id, materials });
  return phys;
}

// T-14 helper for checks.materials: every material a phys.json names, with where it is named, keys sorted.
export function materialRefs(phys) {
  const out = {};
  for (const [id, s] of Object.entries(phys.models)) s.colliders.forEach((c, i) => (out[c.material] ??= []).push(`${id}.colliders[${i}]`));
  return Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
}
```

- [ ] **Step 4: Run it and expect PASS.** Unit run with `test/sidecar.test.mjs test/sidecar-collider.test.mjs`: 9 pass, 0 fail.

- [ ] **Step 5: Prove the envelope test red by mutation.** In `validateSidecar`, delete the line `if (s.v !== SIDECAR_VERSION) fail('v', \`must be ${SIDECAR_VERSION}\`, s.v);`. Run `test/sidecar.test.mjs` and expect 1 failure ("sidecar errors name the model and the path"). Revert, then run again and expect 5 pass.

- [ ] **Step 6: Commit.**

```bash
git add src/defs/sidecar.js test/sidecar.test.mjs
git commit -m "feat(sidecar): sidecar and phys.json schema, materialRefs for checks.materials (A-5, D2, T-14)"
```

---

### Task 7: Whole suite, purity and notes

**Files:**
- Create: `docs/plans/2026-10-13-phase-3b-materials-notes.md`

- [ ] **Step 1: Run the whole engine suite.**

```bash
systemd-run --user --wait -P -p MemoryMax=2G -p MemorySwapMax=0 -p RuntimeMaxSec=600 \
  --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3b \
  -E NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=4 test/
```

Expected: everything passes. The count is the `phase-3` base count plus 30: 4 base, 9 registry, 5 pairs, 3 hash, 4 collider and 5 sidecar. The existing `test/purity.test.mjs` "engine sim sources are pure" already scans `src/defs`, and `test/sidecar.test.mjs` scans the three new files by name.

- [ ] **Step 2: Probe the public shape once.**

```bash
cd /home/smiller/projects/four43/lion-hawk-engine-3b && node -e "import('./src/defs/materials.js').then(({ defineMaterials }) => { const m = defineMaterials(); console.log(m.ids.length, m.hash, m.pair('rubber', 'ice')) })"
```

Expected: `18 2f4f4f95` and a frozen pair with friction `0.2236…`, restitution 0.6, ice's tyre, sound `'scrape'` and fx `'frost'`.

- [ ] **Step 3: Write the notes file** `docs/plans/2026-10-13-phase-3b-materials-notes.md`. Sections:
  - **Outcome:** the commits, the test counts and the base hash.
  - **Decisions:** the bullets under Tasks 2–6.
  - **Contract issues:** copy the section below, with anything new.
  - **Integrator requests:** copy the section below.
  - **Field note candidates:** for the integrator to number from #110. Seed it with:
    1. The material hash covers only ids (in order), effective `phys` and pair `friction`/`restitution`, so a `look`/`game` tweak needs no re-bake, but a stale `look` baked into a GLB is not caught by `checks.materials` (Contract issue 6).
    2. M-8 pairs are order-dependent. Kits must pass the moving body as `a` and the ground as `b`.

- [ ] **Step 4: Commit.**

```bash
git add docs/plans/2026-10-13-phase-3b-materials-notes.md
git commit -m "docs(materials): phase 3b notes"
```

## Done when

- `test/materials-base`, `materials`, `materials-pairs`, `materials-hash`, `sidecar-collider` and `sidecar` (30 tests) pass. The whole engine suite passes at its base count plus 30, under the memory-capped run.
- `defineMaterials().hash === '2f4f4f95'`.
- Every mutation step above was seen red, then reverted.
- The notes file exists, with its "Field note candidates" section.
- Merge point: the integrator merges `phase-3-materials` into `phase-3` with `--no-ff` as part of Wave A (3b + 3c + 3d → 0.8.0) and applies the integrator requests below. 3b bumps no version.

## Notes stub

File: `docs/plans/2026-10-13-phase-3b-materials-notes.md`. Sections: Outcome, Decisions, Contract issues, Integrator requests, **Field note candidates** (unnumbered; the integrator numbers them from #110).

## Contract issues

1. **`pair()` caching (§4.2).** The overview says "cached per unordered pair". But the M-8 tie rule (cues to `a`) and the tyre rule (`b`'s first) make the result order-dependent. Decision: cache per **ordered** pair. Kits pass the moving body as `a` and the ground as `b`. Accepted.
2. **`'ball'` vs `'sphere'` (§4.4 vs §4.3).** §4.4's spawn example uses `shape: 'ball'`; §4.3 says inline entries have exactly the sidecar shape (`sphere`). Ruled: `'sphere'` everywhere; `'ball'` throws `unknown shape (use 'sphere')`; the §4.4 example is wrong. 3c's and the games' fixtures use `sphere`.
3. **Validator signatures are unspecified (§3.1, §4.3).** Accepted:
   - `validateSidecar(s, { model, materials }) → s`;
   - `validatePhys(phys, { materials }) → phys`, which does not compare the hash.
   Also added (not public, imported from `src/defs/sidecar.js` by 3c and 3d):
   - `validateCollider(entry, { where, path, materials, parts, inline }) → entry`;
   - `materialRefs(phys)`;
   - `SHAPES`, `MAX_HULL_POINTS`.
   In `materials.js`: `PHYS_DEFAULTS`, `MAX_MATERIALS`, `canonicalJson`.
4. **A game entry with a base id (§4.2 is silent).** Accepted: it merges over the base entry in place (same index) and may not `extends`.
5. **Resolved shape (§4.2), accepted:**
   - `byIndex(i)` returns the id;
   - a resolved material carries `id`;
   - `pair()` returns `null` for absent `tire`/`sound`/`fx`;
   - a pair `tire` entry merges over the ground's tyre;
   - softer-material cues fall back to the harder one's.
6. **What the hash covers (§4.2 says the whole resolved table).** Ruled: only what sidecars depend on: ids and their order, each material's effective `phys` (defaults filled, fluid `sg` 0) and each pair's `friction`/`restitution`. Not `look`, `game`, `tire`, cues or other live-read blocks, so a look tweak needs no re-bake. Cost: a stale `look` in a baked GLB is not caught by `checks.materials` (the view reads `look` live). Base hash `2f4f4f95` (was `f327bcae` under the whole-table rule). Task 4.
7. **`game` and `look.wear` must be plain JSON data (D6 says "not validated").** Accepted. This is needed for cloning and freezing. No other checks.
8. **`round` on box colliders (3j #1).** Ruled: 3c builds Rapier's roundCuboid for it. 3b's schema accepts an optional `round` on `box` only, > 0 and below the smallest `half`; any other shape rejects it as an unknown field (Task 5).

## Integrator requests

1. **`src/index.sim.js`** (overview §3.2): add these exact lines:

```js
export { defineMaterials } from './defs/materials.js';
export { BASE_MATERIALS } from './defs/materials.base.js';
export { SIDECAR_VERSION, validateSidecar, validatePhys } from './defs/sidecar.js';
```

2. **`CHANGELOG.md`** (0.8.0, Wave A):
   - material registry (`defineMaterials`, base library of 18, `extends`, pairs, validation, hash);
   - sidecar schema (`validateSidecar`, `validatePhys`).
3. **`docs/spec.md`:** record Contract issues 1, 2, 4, 5, 6 and 8 (all ruled) as clarifications of M-2/M-8, §4.2's hash and §6.2.
4. **No purity-root change is needed.** `test/purity.test.mjs` already scans `src/defs`.
