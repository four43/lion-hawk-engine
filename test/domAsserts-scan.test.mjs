// G-E2 parked minors: the domAsserts guard (#103) missed notDeepEqual/notStrictEqual/notDeepStrictEqual, and its
// argument splitter ignored quoting. The plain-variable limit is documented, and pinned here so it stays deliberate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeEqualities, callArgs } from './helpers/domScan.mjs';

test('G-E2: the guard sees every assert equality form', () => {
  for (const m of ['equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual'])
    assert.deepEqual(nodeEqualities(`x;\nassert.${m}(el.firstChild, b);`, 'f'), ['f:2'], m);
});

test('G-E2: brackets and commas inside string literals neither end nor split an argument', () => {
  assert.deepEqual(callArgs("assert.equal(f(')'), el.firstChild);", 12), ["f(')')", 'el.firstChild']);
  assert.deepEqual(callArgs('assert.equal(g("a,b"), el.firstChild);', 12), ['g("a,b")', 'el.firstChild']);
  assert.deepEqual(callArgs('assert.equal(h(`x)${1}`), el.firstChild);', 12), ['h(`x)${1}`)', 'el.firstChild']);
  assert.deepEqual(nodeEqualities("assert.equal(f(')'), el.firstChild);", 'f'), ['f:1']);
});

test('G-E2: the documented limit: a node in a plain variable is not seen; plain values pass', () => {
  assert.deepEqual(nodeEqualities("const b = q(d, 'x');\nassert.equal(b, c);", 'f'), []);
  assert.deepEqual(nodeEqualities("assert.equal(el.textContent, 'x');", 'f'), []);
});
