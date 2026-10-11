import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { scanSource, scanPurity } from '../testing/purity.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('scanSource flags each forbidden use with its line (L-3)', () => {
  const src = [
    "import * as THREE from 'three';",
    "import { x } from 'three/addons/foo.js';",
    "import { hud } from '../view/hud.js';",
    'const w = window.innerWidth;',
    "document.body.append('x');",
    'const t = Date.now();',
    'const u = performance.now();',
    'const r = Math.random();',
  ].join('\n');
  const rules = scanSource(src, 'f.js').map(v => `${v.line}:${v.rule}`);
  assert.deepEqual(rules, ['1:three', '2:three', '3:view-import', '4:window', '5:document', '6:wall-clock', '7:wall-clock', '8:math-random']);
});
test('scanSource ignores comments and look-alike names', () => {
  const src = [
    '// window.foo and Math.random() in a comment',
    '/* document.x',
    '   Date.now() */',
    'const mywindow = 1, threeD = 2; // three',
    "import { a } from './threeish.js';",
  ].join('\n');
  assert.deepEqual(scanSource(src, 'f.js'), []);
});
test('engine sim sources are pure', () => {
  const found = scanPurity([`${root}src/core`, `${root}src/defs`, `${root}src/sim`, `${root}src/index.sim.js`]);
  assert.deepEqual(found, []);
});
