// test/field-notes.test.mjs: docs/field-notes.md stays numbered 1..N with one index row per note; phase 3 entries
// (#110 on) carry the four fields (lion-hawk 3m, Procedure F).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const s = readFileSync(process.env.LH_FIELD_NOTES ?? new URL('../docs/field-notes.md', import.meta.url), 'utf8'); // LH_FIELD_NOTES: red proof on a scratch copy
const heads = [...s.matchAll(/^### (\d+)\. /gm)].map(m => Number(m[1]));
const rows = [...s.matchAll(/^\| (\d+) \|/gm)].map(m => Number(m[1]));

test('field notes are numbered 1..N without gaps, each with one index row in order', () => {
  assert.ok(heads.length >= 109);
  assert.deepEqual(heads, heads.map((_, i) => i + 1));
  assert.deepEqual(rows, heads);
});
test('phase 3 notes (#110 on) have What happened, Workaround, Engine change and Status', () => {
  for (const part of s.split(/^### /m).slice(1)) {
    const n = Number(part.match(/^(\d+)\./)[1]);
    if (n < 110) continue;
    for (const f of ['What happened', 'Workaround', 'Engine change', 'Status']) assert.match(part, new RegExp(`^- \\*\\*${f}:\\*\\*`, 'm'), `#${n} lacks ${f}`);
  }
});
