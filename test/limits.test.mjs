import test from 'node:test';
import assert from 'node:assert/strict';
import { createRate, createWarnOnce } from '../src/index.sim.js';

test('createRate allows perSec per 1 s window and rolls over on the injected now (M-50)', () => {
  const r = createRate(2);
  assert.deepEqual([0, 10, 999].map(t => r.allow(t)), [true, true, false]);
  assert.deepEqual([1000, 1500, 1999, 2000].map(t => r.allow(t)), [true, true, false, true]);
  assert.equal(createRate().allow(5), true);
});
test('createWarnOnce logs once per kind through the injected log (M-44)', () => {
  const seen = [], w = createWarnOnce((k, e) => seen.push([k, e]));
  w('a', 1); w('a', 2); w('b', 3); assert.deepEqual(seen, [['a', 1], ['b', 3]]);
});
