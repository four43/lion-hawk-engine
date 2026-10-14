import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from '../../testing/purity.js';

const kits = fileURLToPath(new URL('../../src/kits/', import.meta.url));
const halves = name => (existsSync(kits) ? readdirSync(kits).sort() : []).map(k => `${kits}${k}/${name}`).filter(f => existsSync(f));

test('kit sim halves are sim-pure: no three, DOM, clocks or Math.random (L-3, T-12)', () => {
  const files = halves('sim.js');
  assert.ok(files.length >= 1, 'no kit sim halves found');
  assert.deepEqual(scanPurity(files), []);
});

test('kit sim halves never import Rapier (D9: it is injected) or a view half', () => {
  for (const f of halves('sim.js')) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.doesNotMatch(src, /['"]@dimforge\//, f);
    assert.doesNotMatch(src, /from\s*['"][^'"]*\/view(\.js)?['"]/, f);
  }
});

test('kit view halves use no Math.random (U-6) and no instanceof on three.js objects (constraint 4)', () => {
  for (const f of halves('view.js')) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.doesNotMatch(src, /\bMath\.random\s*\(/, f);
    assert.doesNotMatch(src, /\binstanceof\s+THREE\./, f);
  }
});
