import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { golden } from '../testing/golden.js';

const dir = mkdtempSync(join(tmpdir(), 'lh-golden-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('first run writes, second run matches', () => {
  const f = join(dir, 'a', 'g.json');
  assert.deepEqual(golden(f, { x: 1 }, { bless: false }), { written: true });
  assert.ok(JSON.parse(readFileSync(f, 'utf8')).checksum);
  assert.deepEqual(golden(f, { x: 1 }, { bless: false }), { written: false });
});
test('a change throws with the diff and the bless hint; bless rewrites', () => {
  const f = join(dir, 'b.json');
  golden(f, { tractor: { x: 1 } }, { bless: false });
  assert.throws(() => golden(f, { tractor: { x: 2 } }, { bless: false }), e => /tractor\.x: 1 → 2/.test(e.message) && /LH_BLESS=1/.test(e.message));
  assert.deepEqual(golden(f, { tractor: { x: 2 } }, { bless: true }), { written: true });
  assert.deepEqual(golden(f, { tractor: { x: 2 } }, { bless: false }), { written: false });
});
test('accepts file URLs', () => {
  const u = new URL(`file://${join(dir, 'c.json')}`);
  assert.deepEqual(golden(u, [1, 2], { bless: false }), { written: true });
});
