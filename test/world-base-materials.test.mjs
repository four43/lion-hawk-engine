// §4.1: a game without defs.materials gets the base library; the World works on 3b's real registry exactly as on
// the fixture (√f with Multiply, density from sg × 1000 × fill). 3b-R5: inline colliders get 3b's schema check at spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { defineMaterials } from '../src/defs/materials.js';
import { materials } from '../testing/checks.js';
import { stubEngine } from './fixtures/phys/engine.js';
import { physGame } from './fixtures/phys/game.js';
import PHYS from './fixtures/phys/phys.json' with { type: 'json' };

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
test("3b-R5: inline colliders are validated with 3b's validateCollider at spawn", () => {
  const w = createWorld(stubEngine({ materials: null }));
  try {
    assert.throws(() => w.spawn({ tags: ['x'], body: 'dynamic', colliders: [{ shape: 'sphere', r: 0.5, material: 'steel', bogus: 1 }] }),
      /spawn 'x': colliders\[0\]\.bogus unknown field for a sphere \(got 1\)/);
    assert.throws(() => w.spawn({ tags: ['x'], body: 'dynamic', colliders: [{ shape: 'box', half: [1, 1, 1], q: [0, 0, 0, 2], material: 'steel' }] }),
      /spawn 'x': colliders\[0\]\.q must be a unit quaternion \[x, y, z, w\] \(got \[0,0,0,2\]\)/);
    assert.ok(w.spawn({ tags: ['x'], body: 'dynamic', colliders: [{ shape: 'box', half: [0.1, 0.1, 0.1], round: 0.05, material: 'steel' }] }));
  } finally { w.dispose(); }
});
test('3b-R5: checks.materials reports a missing sidecar material at the materialRefs location', () => {
  const phys = structuredClone(PHYS);
  phys.models.crate.colliders[0].material = 'balsa';
  const r = materials(physGame({ defs: { materials: undefined, models: phys } }));
  assert.deepEqual(r.missing.filter(m => m.material === 'balsa'), [{ where: 'models.crate.colliders[0]', material: 'balsa' }]);
});
