// test/purity-phase3.test.mjs: phase 3 purity (overview §7.1, D9): engine code never imports Rapier (the game injects it),
// and the kit sim halves are sim-pure like src/sim (lion-hawk 3m; 3h request R2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { scanSource, scanPurity, simRoots } from '../testing/purity.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const hits = (src, o) => scanSource(src, 'f.js', o).map(v => `${v.line}:${v.rule}`);

test('the rapier rule is opt-in and catches static, side-effect and multi-line dynamic imports', () => {
  const src = [
    "import RAPIER from '@dimforge/rapier3d-compat';",
    "import '@dimforge/rapier3d';",
    'const R = await import(',
    "  '@dimforge/rapier3d-compat');",
    "import { x } from './dimforge.js';",
  ].join('\n');
  assert.deepEqual(hits(src), []);
  assert.deepEqual(hits(src, { rapier: true }), ['1:rapier', '2:rapier', '3:rapier']);
});
test('the three rule is unchanged with the rapier option', () => {
  assert.deepEqual(hits("const m = await import(\n  'three'\n);", { rapier: true }), ['1:three']);
});
test('engine sim roots, the kit sim halves included, are pure and never import Rapier', () => {
  assert.deepEqual(scanPurity(simRoots(root), { rapier: true }), []);
});
test('no engine source imports Rapier (D9: defineGame({ physics: { rapier } }))', () => {
  assert.deepEqual(scanPurity([`${root}src`], { rapier: true }).filter(v => v.rule === 'rapier'), []);
});
