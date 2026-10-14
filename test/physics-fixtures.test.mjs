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
