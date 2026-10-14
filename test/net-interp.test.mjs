// test/net-interp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterp } from '../src/sim/interp.js';

test('3i: sampleInto() writes what sample() returns into one reused object (R-8)', () => {
  const a = createInterp(), b = createInterp(), out = { a: null, b: null, k: 0, at: 0 };
  assert.equal(a.sampleInto(0, out), false, 'empty: nothing to sample');
  const frames = Array.from({ length: 10 }, (_, i) => ({ i }));
  for (let i = 0; i < 10; i++) { const arrival = i * 50 + 80 + (i % 3) * 7; a.push(i * 50, arrival, frames[i]); b.push(i * 50, arrival, frames[i]); }
  for (let now = 0; now < 900; now += 16.6) {
    const s = b.sample(now);
    assert.equal(a.sampleInto(now, out), true);
    assert.equal(out.a, s.a, `a at ${now}`); assert.equal(out.b, s.b, `b at ${now}`); assert.equal(out.k, s.k, `k at ${now}`); assert.equal(out.at, s.at);
  }
});
