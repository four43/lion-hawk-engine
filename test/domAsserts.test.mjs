// Guard (G-E2): a failing assert.equal/deepEqual on a DOM node diffs inspect() of a whole window, which needs memory
// quadratic in its line count (16 GB in 10 s). Tests that use the happy-dom helper compare nodes with same() instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const node = /(?:\bq|querySelector|closest|getElementById)\([^()]*\)$|children\[[^\]]*\]$|(?:activeElement|parentNode|parentElement|firstChild|firstElementChild)$/;
const args = (src, at) => { // the first two top-level arguments of the call whose '(' is at src[at]
  const out = []; let depth = 0, start = at + 1;
  for (let i = at + 1; i < src.length && out.length < 2; i++) {
    const ch = src[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth-- === 0) { out.push(src.slice(start, i)); break; } }
    else if (ch === ',' && depth === 0) { out.push(src.slice(start, i)); start = i + 1; }
  }
  return out.map(s => s.trim());
};
test('no DOM node reaches an assert equality diff in the DOM tests', () => {
  const bad = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8'); if (!src.includes('helpers/dom.mjs')) continue;
    for (const m of src.matchAll(/assert\.(?:not)?(?:strict|deep|deepStrict)?(?:Equal|equal)\(/g)) {
      const at = m.index + m[0].length - 1;
      if (args(src, at).some(a => node.test(a))) bad.push(`${f}:${src.slice(0, at).split('\n').length}`);
    }
  }
  assert.ok(bad.length === 0, `compare DOM nodes with same() from helpers/dom.mjs: ${bad.join(', ')}`);
});
