// [T-1] headless options: clock: 'virtual' (the only clock) and record: 'on-fail', which writes the tapes of a failed
// test's handles to $LH_TAPES (default test-results/tapes). The failing half runs in a child node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { headless, replay } from '../testing/index.js';
import game from './fixtures/countdown.js';
import { tmp } from './helpers/tmp.mjs';

test("clock: 'virtual' is accepted; any other clock is refused (T-1)", () => {
  assert.equal(headless(game, { clock: 'virtual' }).step(2).time.step, 2);
  assert.throws(() => headless(game, { clock: 'real' }), /headless: clock must be 'virtual' \(got "real"\)/);
  assert.throws(() => headless(game, { record: 'always' }), /headless: record must be true, false or 'on-fail'/);
});
test("record: 'on-fail' records like record: true", () => {
  const h = headless(game, { record: 'on-fail' }); h.tap('title.play'); h.step(70);
  assert.equal(replay(game, h.tape()).checksum(), h.checksum());
});
test("record: 'on-fail' writes a failed test's tapes, and only a failed test's", () => {
  const dir = tmp('lh-t1-'), out = path.join(dir, 'tapes'), file = path.join(dir, 'f.test.mjs'), root = path.resolve('.');
  fs.writeFileSync(file, `import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '${root}/testing/index.js';
import game from '${root}/test/fixtures/countdown.js';
test('passes', () => { headless(game, { record: 'on-fail' }).step(5); });
test('fails here', () => { const h = headless(game, { record: 'on-fail' }); h.tap('title.play'); h.step(30); assert.equal(1, 2); });
test('plain handle', () => { headless(game).step(5); assert.fail('no tape'); });
`);
  const env = { ...process.env, LH_TAPES: out }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8', env });
  const files = fs.readdirSync(out);
  assert.deepEqual(files, ['fails-here.countdown.1.tape.json'], r.stdout);
  const tape = JSON.parse(fs.readFileSync(path.join(out, files[0]), 'utf8'));
  assert.equal(tape.end, 30); assert.equal(tape.game, 'countdown');
  assert.match(r.stdout, /tape written: .*fails-here\.countdown\.1\.tape\.json/);
});
