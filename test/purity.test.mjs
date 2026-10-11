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
const hits = src => scanSource(src, 'f.js').map(v => `${v.line}:${v.rule}`);
test('scanSource sees through strings that look like comment openers', () => {
  assert.deepEqual(hits("const s = '/*'; Date.now();"), ['1:wall-clock']);
  assert.deepEqual(hits("const u = 'http://x'; Math.random();"), ['1:math-random']);
  assert.deepEqual(hits('const t = `//`; Math.random();'), ['1:math-random']);
  assert.deepEqual(hits('"x"// Math.random()'), []);
});
test('scanSource catches side-effect, multi-line dynamic and sneaky imports', () => {
  assert.deepEqual(hits("import 'three';"), ['1:three']);
  assert.deepEqual(hits('import "three/addons/x.js";'), ['1:three']);
  assert.deepEqual(hits("const m = await import(\n  'three'\n);"), ['1:three']);
  assert.deepEqual(hits("x;\nconst m = import(\n\n 'three/addons/y.js');"), ['2:three']);
  assert.deepEqual(hits("import './threeish.js';"), []);
});
test('scanSource catches Date construction and globalThis/self DOM access', () => {
  assert.deepEqual(hits('const d = new Date();'), ['1:wall-clock']);
  assert.deepEqual(hits('const d = Date();'), ['1:wall-clock']);
  assert.deepEqual(hits('const d = new Date(0);'), ['1:wall-clock']);
  assert.deepEqual(hits('globalThis.window.x'), ['1:window']);
  assert.deepEqual(hits('globalThis.document.x'), ['1:document']);
  assert.deepEqual(hits('self.postMessage(1)'), ['1:window']);
  assert.deepEqual(hits('const myself = 1; this.self.x; myDate(1);'), []);
});
test('engine sim sources are pure', () => {
  const found = scanPurity([`${root}src/core`, `${root}src/defs`, `${root}src/sim`, `${root}src/index.sim.js`]);
  assert.deepEqual(found, []);
});
