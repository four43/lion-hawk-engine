import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags, FLAGS } from '../src/core/flags.js';

test('defaults when nothing is set', () => {
  assert.deepEqual({ ...parseFlags('') }, { debug: false, tune: false, fps: false, nosw: false, mute: false, lhTest: false, seed: null, slow: null, replay: null, extra: {} });
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
