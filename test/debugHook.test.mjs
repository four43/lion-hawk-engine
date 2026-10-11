import test from 'node:test';
import assert from 'node:assert/strict';
import { installEngineHook } from '../src/view/debugHook.js';
import { ENGINE_VERSION } from '../src/version.js';

test('installs engine + game ids and the game api on the target', () => {
  const target = {}; let n = 0;
  const hook = installEngineHook({ stepN(k) { n += k; } }, { game: 'pig-pens', target });
  assert.equal(target.engine, hook); assert.equal(hook.engine, ENGINE_VERSION); assert.equal(hook.game, 'pig-pens');
  hook.stepN(3); assert.equal(n, 3);
});
test('getters stay live', () => {
  const target = {}; let seed = 1;
  installEngineHook({ get seed() { return seed; } }, { game: 'tractor-pickup', target });
  seed = 9; assert.equal(target.engine.seed, 9);
});
test('the property cannot be overwritten by assignment but can be reinstalled', () => {
  const target = {};
  installEngineHook({}, { game: 'a', target });
  assert.throws(() => { 'use strict'; target.engine = 1; }, TypeError);
  installEngineHook({}, { game: 'b', target }); assert.equal(target.engine.game, 'b');
});
test('requires a game id and leaves old hooks alone', () => {
  const target = { piggies: { old: true } };
  assert.throws(() => installEngineHook({}, { target }), /game id required/);
  installEngineHook({}, { game: 'pig-pens', target }); assert.deepEqual(target.piggies, { old: true });
});
