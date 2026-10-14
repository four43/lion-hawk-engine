# Phase 3b notes: material registry and sidecar schema

## Outcome

Branch `phase-3-materials`, base v0.7.3 (2a5cbde). 3b bumps no version. Commits (`git log --oneline 2a5cbde..HEAD`; the first six are the tasks, the last four the final-review fixes and notes):

```
8e61909 feat(sidecar): sidecar and phys.json schema, materialRefs for checks.materials (A-5, D2, T-14)
449c6ab feat(sidecar): collider entry schema shared by sidecars and inline colliders (A-5, A-6)
b8e2914 feat(materials): canonical JSON and the 8-hex registry hash
acffbad feat(materials): pair table and M-8 pair resolution
f259579 feat(materials): defineMaterials with validation, extends and collider values (M-1, M-3)
53ad25d feat(materials): the 18-material base library (M-2)
fc87a7a docs(materials): phase 3b notes
41c1c92 fix(sidecar): accept partless sockets and zero-mass sidecars (3d C3/C4)
74ecdf8 fix(materials): a pair tyre on two non-ground materials must be complete
cdd826d test(sidecar): pin materialRefs key order
```

Test counts: whole engine suite 474 tests, 455 pass, 0 fail, 19 skipped (version-gated tests for later phases, "engine 0.7.3 < 0.8.0/0.9.0/0.10.0"); the six 3b files alone 32 tests, 32 pass. Base material hash: `2f4f4f95` (18 materials).

## Decisions

### Task 2
- A game entry whose id is a base id is **merged over** the base entry in place: same index, and `extends` sees the merged version. It may not `extends` anything (it throws). Tractor's `grass` tweak and `leaf extends grass` need this.
- Resolved materials carry their `id`.
- `PHYS_DEFAULTS` follow Rapier's own defaults (friction 0.5, restitution 0), so a material without a `phys` block behaves as an untouched Rapier collider.
- `game` and `look.wear` are not schema-checked, but must be plain JSON data, because the registry clones and freezes them (ruling 7). Neither is hashed (ruling 6).
- Ids may not contain `|` (pair keys use it) or start with `paint-` (bake slots, A-4).
- `byIndex(i)` returns the id string. `materialAt` returns ids, and terrain stores indices.
- In this task, `defineMaterials` accepts the `pairs` option and ignores it; Task 3 parses it.

### Task 3
- **Results are cached per ordered pair.** The overview says "cached per unordered pair". But M-8's tie rule (cues to `a`) and the tyre rule (`b`'s first) make `pair(a, b)` and `pair(b, a)` differ, so an unordered cache would return whichever was asked first (a Contract issue).
- **A pair entry's `tire` merges field by field over the ground's `tire`.** So `{ tire: { mu: 0.2 } }` keeps the ground's `C`, `kp` and the rest, and the vehicle kit always sees a complete set.
- **`sound` and `fx`** come from the softer material, fall back to the harder one's when the softer has none, and are `null` when neither has one. `tire` is `null` when nothing supplies it.
- **Pair keys:** `'a|b'` and `'b|a'` in one table is an error ("repeats").

### Task 4
**Decision (ruling 6):** the hash covers only what sidecars and colliders depend on, so a `look` or `game` tweak needs no re-bake. The hashed object is `{ materials: [[<id>, { friction, restitution, sg, fill }], ...] in index order, pairs: { '<a>|<b>' with a <= b: { friction?, restitution? } } }`:
- `materials` is an array, so the ids **and their order** count. Each value is the effective `phys` that `collider()`/`density()` read: `PHYS_DEFAULTS` filled in, and `sg` from `sgOf` (0 for a fluid without `phys.sg`). Spelling out a default does not change the hash.
- `pairs` keeps only an entry's `friction` and `restitution`; an entry with neither is left out.
- Not hashed: `look`, `game`, `tire`, `dirtRate`, `coverage`, `aero`, `magnet`, `fluid` (beyond its effect on `sg`), `sound`, `fx`, and pair `tire`/`sound`/`fx`. Kits and the view read these live from the registry. Cost: a stale `look` baked into a GLB is not caught by `checks.materials`.

It is written as canonical JSON (keys sorted at every level) and hashed with the engine's `fnv` (FNV-1a over UTF-16 code units), rendered as 8 lowercase hex digits. The base library's hash is pinned at `2f4f4f95`.

### Task 5
- **One validator for baked and inline colliders** (overview §4.3: "exactly the same entry shape").
- **Baked entries** require `p`, `q` and `part`; `inline: true` lets them be omitted. `material` is always required.
- **Unknown fields are errors**, which catches `radius` for `r`.
- **`'ball'` is rejected with a hint** to use `'sphere'`. The overview's §4.4 spawn example says `'ball'` (a Contract issue).
- **`paint-*` materials are rejected.** The bake maps paint to `bake.paint.base`, so physics never sees a slot.
- **Hulls take 4–64 points**, matching the bake's cap.
- **Typed arrays are accepted** for number lists (procedural inline hulls).
- **Quaternions** must be unit to within 1e-3.
- **`box` takes an optional `round`** (border radius, any finite number > 0 with no upper bound; Rapier's roundCuboid adds it outside `half`) for Rapier's roundCuboid (3j #1; 3c builds it). Other shapes reject it as an unknown field.

### Task 6
- **Field rules:**
  - `v`, `parts` and `colliders` are required;
  - `source`, `mass`, `sockets` and `bounds` are optional, so 3c's hand-written fixtures need no fake sha;
  - unknown top-level fields are errors (aero panels are out of scope in phase 3, D2).
- **`validatePhys` checks shape and material existence only.** Comparing `phys.materials` with `registry.hash` is the caller's job (`checks.materials`, `bake --check`), so a stale bake reads as stale, not as malformed.
- **`materialRefs(phys)`** gives 3c's `checks.materials` (T-14) every referenced material, with where it is referenced.
- **The manifest and `*.anim.json` schemas stay with 3d.**

### Controller rulings (verbatim from the ledger)

- Ruling: box `round` accepts any finite > 0, may exceed `half` (code/test as written); drop "below the smallest half" wording in notes — contract-issues reconciliation ("box round > 0 (outside half)") and 3c-R5 override the plan's decision bullet, and Rapier's roundCuboid adds the radius outside half — if wrong, a too-large round passes validation and 3c gets an oversized body (easy to tighten later).
- Ruling: Task 7 whole-suite run wraps `test/` in `flock /tmp/claude-1000/lion-hawk-browser.lock` with the browser caps (3G, 900s), since the directory contains browser suites — GC5 forbids browser suites outside the lock — if wrong, only costs a wait on the lock.
- Ruling: notes file uses the brief's section list (Outcome, Decisions, Done-when evidence, Contract issues, Integrator requests, Removed or renamed tests, Field note candidates) — brief is binding over plan text — cost: none.
- Ruling: pipeline — dispatch Task N+1's implementer while Task N's read-only review runs; fixes for N land on top — priority is finishing fast for 3c/3d — cost if wrong: a Task N fix commit interleaves after N+1's commits (history only).
- Task 3: Ruling: plan-mandated finding (pair entry `tire` with no ground tyre on either side yields a partial tyre via clone(e.tire)) — real but rare (needs a tyre entry on a pair of two non-ground materials) and no 3b consumer reads it; queue for the final fix wave as a parse-time error ("pair '<k>'.tire must give every field when neither material has tyre data") rather than a loop round now — cost if wrong: a kit reading such a pair sees undefined tyre fields (NaN) until fixed.
- Task 6: Ruling: plan-mandated finding (materialRefs "keys sorted" untested; deepEqual ignores key order) — add `assert.deepEqual(Object.keys(materialRefs(phys)), ['rubber','steel','wood'])` in the final fix wave together with the Task 3 item rather than a loop round now — cost if wrong: a dropped .sort() goes unnoticed until the final wave lands (same branch, before DONE).

- **Integer-like ids (e.g. `'7'`) come first in `ids`**, because JS orders integer-like keys ahead of string keys. Deterministic and rare; documented, not rejected.

- Ruling: start the final whole-branch review on 2a5cbde..8e61909 (all code) while Task 7 (notes only) runs; the notes are covered by the fix-wave re-review — speed for 3c/3d — cost if wrong: notes get a lighter review than code.
- Ruling: validateSidecar accepts `sockets.<k>.part: null` and `mass.mass >= 0` — contract-issues 3d C3 ("a socket with no parent part has part: null") and 3d's zero-mass bake (colliders: false / all-air / flat static) bind over the 3b plan text; both only widen validation, hash unaffected — cost if wrong: a malformed sidecar with zero mass or partless socket passes 3b validation.
- Ruling: partial-tyre fix = parse-time error inside defineMaterials after parsePairs, naming the first missing field: `materials: pair '<k>'.tire.<f> required when neither '<a>' nor '<b>' has tyre data (got undefined)` — final reviewer's amendment of the Task 3 ruling — cost if wrong: a game wanting a partial tyre on non-ground pairs must give all six fields.
- Ruling: integer-like ids sorting first (JS key order) — leave code, document in notes Decisions — deterministic, rare — cost if wrong: a game using numeric ids sees unexpected index order.
- Ruling: 3c not consuming validateCollider/materialRefs — integrator request (non-blocking), not a 3b change — 3b can't edit 3c — cost if wrong: inline paint-*/unknown fields uncaught at spawn until 3c adopts it.

## Done-when evidence

- Whole engine suite, under the shared browser lock and memory caps:
  `flock /tmp/claude-1000/lion-hawk-browser.lock systemd-run --user --wait -P -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=900 --working-directory=/home/smiller/projects/four43/lion-hawk-engine-3b -E NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=4 test/`
  Result (after the final-review fixes): tests 474, pass 455, fail 0, cancelled 0, skipped 19 (all "engine 0.7.3 < 0.8.0/0.9.0/0.10.0" version gates). That is the base count 442 plus 32.
- The six 3b files alone (`test/materials-base`, `materials`, `materials-pairs`, `materials-hash`, `sidecar-collider`, `sidecar`), with the unit-run command (MemoryMax=2G, RuntimeMaxSec=300, `--max-old-space-size=512`, `--test-concurrency=4`): tests 32, pass 32, fail 0, skipped 0 (base hash still `2f4f4f95`).
- Probe: `defineMaterials()` gives 18 ids, hash `2f4f4f95`, and `pair('rubber','ice')` = friction 0.22360679774997896, restitution 0.6, ice's tyre, sound `'scrape'`, fx `'frost'`.
- `test/purity.test.mjs` already scans `src/defs`; `test/sidecar.test.mjs` scans the new files.

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
8. **`round` on box colliders (3j #1).** Ruled: 3c builds Rapier's roundCuboid for it. 3b's schema accepts an optional `round` on `box` only: any finite number > 0 with no upper bound (Rapier's roundCuboid adds it outside `half`); other shapes reject it as an unknown field (Task 5). The plan's "below the smallest half" wording is not used. Forwarded request 3c-R5 is satisfied by Task 5 (tests in `test/sidecar-collider.test.mjs`).
9. **A pair `tire` with no ground tyre on either side yielded a partial tyre (Task 3). Fixed.** A pair entry's `tire` merges over the ground's tyre; when neither material has tyre data the result was `clone(e.tire)`, so a kit read undefined fields (NaN). Now `defineMaterials` throws at parse time on the first missing field: `materials: pair 'a|b'.tire.C required when neither 'a' nor 'b' has tyre data (got undefined)`.
10. **Socket `part: null` (3d C3). Fixed.** A socket with no parent part has `part: null`; `validateSidecar` now accepts it. A string still must name a listed part.
11. **`mass.mass >= 0` (3d zero-mass bake). Fixed.** 3d bakes `mass: 0` for `colliders: false`, all-air and flat static models; the check was `> 0`. Now `mass.mass must be a number >= 0`. The hash is unaffected.

## Integrator requests

All five are not blocking.

1. **`src/index.sim.js`** (overview §3.2): add these exact lines (not blocking):

```js
export { defineMaterials } from './defs/materials.js';
export { BASE_MATERIALS } from './defs/materials.base.js';
export { SIDECAR_VERSION, validateSidecar, validatePhys } from './defs/sidecar.js';
```

2. **`CHANGELOG.md`** (0.8.0, Wave A; not blocking):
   - material registry (`defineMaterials`, base library of 18, `extends`, pairs, validation, hash);
   - sidecar schema (`validateSidecar`, `validatePhys`).
3. **`docs/spec.md`:** record Contract issues 1, 2, 4, 5, 6 and 8 (all ruled) as clarifications of M-2/M-8, §4.2's hash and §6.2 (not blocking).
4. **No purity-root change is needed** (not blocking). `test/purity.test.mjs` already scans `src/defs`.
5. **3c: adopt `validateCollider` (`inline: true`) and `materialRefs`.** 3c's plan implements `checks.materials` and inline shape checks itself; 3b exports `validateCollider` and `materialRefs` for exactly this. Ask 3c to adopt them (otherwise inline `paint-*` materials and unknown fields such as `radius` are not caught at spawn), or record them as unused.

## Removed or renamed tests

None.

## Field note candidates

For the integrator to number from #110.

- The material hash covers only ids (in order), effective `phys` and pair `friction`/`restitution`, so a `look`/`game` tweak needs no re-bake, but a stale `look` baked into a GLB is not caught by `checks.materials` (Contract issue 6).
- M-8 pairs are order-dependent. Kits must pass the moving body as `a` and the ground as `b`.
