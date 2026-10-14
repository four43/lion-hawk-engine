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
