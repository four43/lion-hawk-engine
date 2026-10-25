// [T-8] h.spy(obj, method) and captured warnings: a warn or error during a handle call fails the test unless the test
// calls h.expectWarning(re). The failing half runs in a child node --test, so this file stays green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { headless } from '../testing/index.js';
import { defineGame } from '../src/index.sim.js';
import { tmp } from './helpers/tmp.mjs';

const noisy = defineGame({ id: 'noisy', start: 's', commands: { yell: (e, d) => console.warn('yell:', d.n), scream: () => console.error('scream') },
  scenes: { s: {} } });

test('h.spy records calls and the count, and restore puts the method back (T-8)', () => {
  const h = headless(noisy), obj = { add(a, b) { return a + b; } }, orig = obj.add;
  const s = h.spy(obj, 'add');
  assert.equal(obj.add(1, 2), 3, 'calls through');
  obj.add(3, 4);
  assert.deepEqual(s.calls, [[1, 2], [3, 4]]); assert.equal(s.count, 2);
  s.restore(); assert.equal(obj.add, orig);
  assert.throws(() => h.spy(obj, 'nope'), /headless: spy needs a method: 'nope' is not a function/);
});
test('h.expectWarning matches a captured warning once, and the console stays quiet', () => {
  const h = headless(noisy), write = process.stderr.write, out = []; process.stderr.write = (c, ...r) => (out.push(String(c)), true);
  try {
    h.command('yell', { n: 1 }).step(1);
    process.stderr.write = write;
    assert.deepEqual(out, [], 'captured, not printed');
    assert.equal(h.warnings.length, 1); assert.equal(h.warnings[0].level, 'warn');
    assert.equal(h.expectWarning(/yell: 1/), 'yell: 1');
    assert.throws(() => h.expectWarning(/yell/), /headless: no captured warning matches \/yell\/ \(captured: yell: 1 \[expected\]\)/);
  } finally { process.stderr.write = write; }
});
test('a test that replaced console.warn itself still gets the call, and the warning counts as expected', () => {
  const h = headless(noisy), real = console.warn, out = []; console.warn = (...a) => out.push(a.join(' '));
  try { h.command('yell', { n: 2 }).step(1); } finally { console.warn = real; }
  assert.deepEqual(out, ['yell: 2']); assert.equal(h.warnings[0].expected, true);
});
test('an unexpected warning or error fails the test that made it, under node --test', () => {
  const dir = tmp('lh-t8-'), file = path.join(dir, 'w.test.mjs'), root = path.resolve('.');
  fs.writeFileSync(file, `import test from 'node:test';
import { headless } from '${root}/testing/index.js';
import { defineGame } from '${root}/src/index.sim.js';
const g = defineGame({ id: 'n', start: 's', commands: { yell: () => console.warn('loud'), scream: () => console.error('boom') }, scenes: { s: {} } });
test('quiet', () => { headless(g).step(1); });
test('warns', () => { headless(g).command('yell', {}).step(1); });
test('errors', () => { headless(g).command('scream', {}).step(1); });
test('expected', () => { const h = headless(g); h.command('yell', {}).step(1); h.expectWarning(/loud/); });
`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; // a child of this runner would report in its protocol
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8', env });
  const ok = name => new RegExp(`^ok \\d+ - ${name}$`, 'm').test(r.stdout), bad = name => new RegExp(`^not ok \\d+ - ${name}$`, 'm').test(r.stdout);
  assert.ok(ok('quiet') && ok('expected'), r.stdout);
  assert.ok(bad('warns') && bad('errors'), r.stdout);
  assert.match(r.stdout, /headless: unexpected warning \(call h.expectWarning\(re\) if it is expected\):\n\s*warn: loud/);
  assert.match(r.stdout, /error: boom/);
});
