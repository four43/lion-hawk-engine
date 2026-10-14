// Guard (G-E2): a failing assert.equal/deepEqual on a DOM node diffs inspect() of a whole window, which needs memory
// quadratic in its line count (16 GB in 10 s). Tests that use the happy-dom helper compare nodes with same() instead.
// The scanner (helpers/domScan.mjs) is a heuristic; its header lists what it cannot see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { nodeEqualities } from './helpers/domScan.mjs';

const dir = new URL('./', import.meta.url);
test('no DOM node reaches an assert equality diff in the DOM tests', () => {
  const bad = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8'); if (!src.includes('helpers/dom.mjs')) continue;
    bad.push(...nodeEqualities(src, f));
  }
  assert.ok(bad.length === 0, `compare DOM nodes with same() from helpers/dom.mjs: ${bad.join(', ')}`);
});
