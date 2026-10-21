import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags, FLAGS } from '../src/core/flags.js';

test('defaults when nothing is set', () => {
  assert.deepEqual({ ...parseFlags('') }, { debug: false, tune: false, fps: false, nosw: false, mute: false, lhTest: false, lhRender: false, seed: null, slow: null, replay: null, extra: {}, debugs: [] });
});
test('booleans: present means on, unless 0 or false', () => {
  const f = parseFlags('?tune&fps=1&mute=0&debug=false&lh-test');
  assert.equal(f.tune, true); assert.equal(f.fps, true); assert.equal(f.mute, false); assert.equal(f.debug, false); assert.equal(f.lhTest, true);
});
test('seed: digits become a uint32, anything else stays a string', () => {
  assert.equal(parseFlags('?seed=14').seed, 14);
  assert.equal(parseFlags('?seed=4294967297').seed, 1);
  assert.equal(parseFlags('?seed=mobile12').seed, 'mobile12');
});
test('slow and replay, unknown params land in extra, result is frozen', () => {
  const f = parseFlags('slow=0.25&replay=run1.json&pigs=48&pad');
  assert.equal(f.slow, 0.25); assert.equal(f.replay, 'run1.json'); assert.deepEqual(f.extra, { pigs: '48', pad: '' });
  assert.equal(parseFlags('?slow=fast').slow, null);
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.extra));
  assert.ok(FLAGS.includes('lh-test'));
});

test('2d: ?lh-test=render turns on manual rendering (#47)', () => {
  const f = parseFlags('?lh-test=render'); assert.equal(f.lhTest, true); assert.equal(f.lhRender, true);
  assert.equal(parseFlags('?lh-test').lhRender, false);
});

test('D-7: ?debug=<topics> lists its topics in debugs; a bare or off ?debug has none', () => {
  const f = parseFlags('?debug=pads');
  assert.equal(f.debug, true); assert.deepEqual(f.debugs, ['pads']); assert.ok(Object.isFrozen(f.debugs));
  assert.deepEqual(parseFlags('?debug').debugs, []);
  assert.deepEqual(parseFlags('?debug=pads, net').debugs, ['pads', 'net']);
  assert.deepEqual(parseFlags('?debug=0').debugs, []); assert.equal(parseFlags('?debug=0').debug, false);
});
