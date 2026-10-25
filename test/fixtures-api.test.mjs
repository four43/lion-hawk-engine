// [T-6] fixtures.define(name, fn) and h.use(...): named setup steps a test applies to a handle, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, fixtures } from '../testing/index.js';
import game from './fixtures/countdown.js';

test('h.use runs named fixtures in order, with args from [name, ...args] (T-6)', () => {
  const calls = [];
  fixtures.define('t6.note', (h, ...args) => { calls.push([h.time.step, ...args]); });
  const h = headless(game, { scene: 'race' });
  assert.equal(h.use('t6.note', ['t6.note', 'a', 2], 't6.note:x'), h, 'returns the handle');
  assert.deepEqual(calls, [[0], [0, 'a', 2], [0, 'x']]);
});
test('the built-in warm:N steps N times with policy.still', () => {
  const h = headless(game, { scene: 'race' });
  h.use('warm:60'); assert.equal(h.time.step, 60);
  h.use(['warm', 5]); assert.equal(h.time.step, 65);
  assert.throws(() => h.use('warm:-1'), /fixtures: warm needs a step count, an integer >= 0 \(got "-1"\)/);
  assert.throws(() => h.use('warm'), /warm needs a step count/);
});
test('fixtures: an unknown name, a duplicate define and a bad argument throw', () => {
  const h = headless(game);
  assert.throws(() => h.use('t6.nope'), /fixtures: no fixture 't6.nope'/);
  fixtures.define('t6.once', () => {});
  assert.throws(() => fixtures.define('t6.once', () => {}), /fixtures: 't6.once' is already defined/);
  assert.throws(() => fixtures.define('warm', () => {}), /already defined/, 'built-ins are reserved');
  assert.throws(() => fixtures.define('', () => {}), /fixtures: a name is a non-empty string without ':'/);
  assert.throws(() => fixtures.define('a:b', () => {}), /without ':'/);
  assert.throws(() => fixtures.define('t6.fn', 1), /fixtures: 't6.fn' needs a function/);
  assert.throws(() => h.use(3), /fixtures: use takes names, 'name:arg' or \[name, ...args\]/);
  assert.equal(fixtures.has('t6.once'), true); assert.equal(fixtures.has('t6.nope'), false);
});
