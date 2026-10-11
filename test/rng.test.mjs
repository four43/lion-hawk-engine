import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, fnv } from '../src/core/rng.js';

// Reference copies of today's game implementations (pig-pens layout.js, rally gen/rng.js, tractor sim/rng.js).
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const refFnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const refShuffle = (next, arr) => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

test('numeric seeds match the games bit for bit', () => {
  for (const seed of [0, 1, 3, 14, 2 ** 32 - 1, -5, 1.9]) {
    const r = rng(seed), ref = mulberry32(seed);
    for (let i = 0; i < 1000; i++) assert.equal(r.next(), ref());
  }
});
test('string seeds hash with FNV-1a, as rally does', () => {
  assert.equal(fnv('mobile12'), refFnv('mobile12'));
  const r = rng('mobile12'), ref = mulberry32(refFnv('mobile12'));
  assert.equal(r.seed, refFnv('mobile12'));
  for (let i = 0; i < 100; i++) assert.equal(r.next(), ref());
});
test('fork(label) is the rally sub-stream and does not disturb the parent', () => {
  const r = rng(7), before = rng(7);
  const f = r.fork('terrain'), ref = mulberry32(refFnv('7:terrain'));
  for (let i = 0; i < 50; i++) assert.equal(f.next(), ref());
  assert.equal(r.next(), before.next());
});
test('range, int, pick, chance and shuffle use one draw each the way the games do', () => {
  const ref = mulberry32(42), r = rng(42);
  assert.equal(r.range(2, 4), 2 + 2 * ref());
  assert.equal(r.int(1, 6), 1 + Math.floor(ref() * 6));
  assert.equal(r.pick(['a', 'b', 'c']), ['a', 'b', 'c'][Math.floor(ref() * 3)]);
  assert.equal(r.chance(0.5), ref() < 0.5);
  const arr = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(r.shuffle(arr), refShuffle(ref, arr));
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7], 'shuffle returns a copy');
});
test('int is inclusive and stays in range', () => {
  const r = rng(9); const seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = r.int(-2, 2); assert.ok(v >= -2 && v <= 2); seen.add(v); }
  assert.equal(seen.size, 5);
});
