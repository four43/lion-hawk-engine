import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, checksum, diff, assertFinite } from '../testing/state.js';

test('canonical sorts keys, rounds numbers and encodes specials', () => {
  assert.equal(canonical({ b: 1.23456789, a: [-0, NaN, Infinity, -Infinity], u: undefined }), '{"a":[0,"NaN","Infinity","-Infinity"],"b":1.234568}');
  assert.equal(canonical(new Map([['k', 1]])), '[["k",1]]');
  assert.equal(canonical(new Set([2, 1])), '[2,1]');
  assert.equal(canonical(1.25, { digits: 1 }), '1.3');
});
test('checksum is stable across key order and tiny float noise', () => {
  assert.equal(checksum({ x: 1, y: 2 }), checksum({ y: 2, x: 1 }));
  assert.equal(checksum({ x: 0.1 + 0.2 }), checksum({ x: 0.3 }));
  assert.notEqual(checksum({ x: 1 }), checksum({ x: 2 }));
  assert.match(checksum({}), /^[0-9a-f]{8}$/);
});
test('diff reports paths, honours tol, and sees missing keys', () => {
  const a = { animals: [{ x: 1 }, { x: 2 }], mode: 'drive' }, b = { animals: [{ x: 1 }, { x: 2.5 }], mode: 'show', extra: 1 };
  assert.deepEqual(diff(a, b), [{ path: 'animals[1].x', a: 2, b: 2.5 }, { path: 'extra', a: undefined, b: 1 }, { path: 'mode', a: 'drive', b: 'show' }]);
  assert.deepEqual(diff({ x: 1 }, { x: 1.0004 }, { tol: 1e-3 }), []);
});
test('assertFinite names the first bad path', () => {
  assertFinite({ a: [1, 2], b: { c: 3 } });
  assert.throws(() => assertFinite({ a: [1, NaN] }, 'state'), /state\.a\[1\] is not finite: NaN/);
});
