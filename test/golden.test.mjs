import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { golden } from '../testing/golden.js';

const dir = mkdtempSync(join(tmpdir(), 'lh-golden-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('first run writes, second run matches', () => {
  const f = join(dir, 'a', 'g.json');
  assert.deepEqual(golden(f, { x: 1 }, { bless: false, ci: false }), { written: true });
  assert.ok(JSON.parse(readFileSync(f, 'utf8')).checksum);
  assert.deepEqual(golden(f, { x: 1 }, { bless: false, ci: false }), { written: false });
});
test('a change throws with the diff and the bless hint; bless rewrites', () => {
  const f = join(dir, 'b.json');
  golden(f, { tractor: { x: 1 } }, { bless: false, ci: false });
  assert.throws(() => golden(f, { tractor: { x: 2 } }, { bless: false, ci: false }), e => /tractor\.x: 1 → 2/.test(e.message) && /LH_BLESS=1/.test(e.message));
  assert.deepEqual(golden(f, { tractor: { x: 2 } }, { bless: true, ci: false }), { written: true });
  assert.deepEqual(golden(f, { tractor: { x: 2 } }, { bless: false, ci: false }), { written: false });
});
test('accepts file URLs', () => {
  const u = new URL(`file://${join(dir, 'c.json')}`);
  assert.deepEqual(golden(u, [1, 2], { bless: false, ci: false }), { written: true });
});
test('missing file in CI throws; bless writes', () => {
  const f = join(dir, 'd.json');
  assert.throws(() => golden(f, { x: 1 }, { bless: false, ci: true }), /is missing/);
  assert.ok(!existsSync(f), 'file not created');
  assert.deepEqual(golden(f, { x: 1 }, { bless: true, ci: true }), { written: true });
  assert.ok(existsSync(f), 'file created with bless');
});
test('a trail mismatch names the first diverging trail entry before the diff lines', () => {
  const f = join(dir, 'e.json');
  const mk = trail => ({ state: { a: 1, b: 2, c: 3 }, trail });
  golden(f, mk(['a', 'b', 'c']), { bless: false, ci: false });
  const cur = { state: { a: 9, b: 8, c: 7 }, trail: ['a', 'x', 'y'] };
  assert.throws(() => golden(f, cur, { bless: false, ci: false }), e => {
    const lines = e.message.split('\n');
    const i = lines.indexOf('first divergence: trail[1]');
    return i === 1 && /^ {2}/.test(lines[2]);
  });
  const g = join(dir, 'f.json');
  golden(g, { x: 1 }, { bless: false, ci: false });
  assert.throws(() => golden(g, { x: 2 }, { bless: false, ci: false }), e => !/first divergence/.test(e.message));
});
test('a shorter trail diverges at its length', () => {
  const f = join(dir, 'h.json');
  golden(f, { trail: ['a', 'b'] }, { bless: false, ci: false });
  assert.throws(() => golden(f, { trail: ['a', 'b', 'c'] }, { bless: false, ci: false }), /first divergence: trail\[2\]/);
});

test('2f: golden({ exact: true }) compares every bit and refuses a mode mix (#68)', () => {
  const f = join(dir, 'exact.json');
  golden(f, { x: 0.1 + 0.2 }, { exact: true, bless: true });
  assert.doesNotThrow(() => golden(f, { x: 0.30000000000000004 }, { exact: true }));
  assert.throws(() => golden(f, { x: 0.3 }, { exact: true }), /changed/);
  assert.throws(() => golden(f, { x: 0.3 }), /stored exact=true, called with exact=false/);
});
