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
test('typed arrays canonicalise and diff as plain arrays', () => {
  assert.equal(canonical({ a: new Float32Array([1, 2.5]) }), canonical({ a: [1, 2.5] }));
  assert.equal(canonical(new Uint8Array([1, 2])), '[1,2]');
  assert.deepEqual(diff({ a: new Float64Array([1, 2, 3]) }, { a: [1, 5, 3] }), [{ path: 'a[1]', a: 2, b: 5 }]);
  assert.deepEqual(diff(new Int16Array([1]), new Int16Array([1])), []);
});

test('2f: assertFinite walks Maps, Sets and typed arrays and survives cycles', () => {
  const a = { m: new Map([['k', { v: 1 }]]), s: new Set([2]), t: new Float64Array([3]) }; a.self = a;
  assert.doesNotThrow(() => assertFinite(a, 'a'));
  a.m.get('k').v = NaN; assert.throws(() => assertFinite(a, 'a'), /a\.m\.k\.v is not finite: NaN/);
  a.m.get('k').v = 1; a.s.add(Infinity); assert.throws(() => assertFinite(a, 'a'), /a\.s\[1\] is not finite: Infinity/);
  a.s.delete(Infinity); a.t[0] = NaN; assert.throws(() => assertFinite(a, 'a'), /a\.t\[0\] is not finite: NaN/);
});
