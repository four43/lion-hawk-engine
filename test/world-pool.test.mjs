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
