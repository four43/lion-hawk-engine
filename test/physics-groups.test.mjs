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
