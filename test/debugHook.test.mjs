import test from 'node:test';
import assert from 'node:assert/strict';
import { installEngineHook } from '../src/view/debugHook.js';
import { ENGINE_VERSION } from '../src/version.js';

test('installs engine + game ids and the game api on the target', () => {
  const target = {}; let n = 0;
  const hook = installEngineHook({ stepN(k) { n += k; } }, { game: 'kart', target });
  assert.equal(target.engine, hook); assert.equal(hook.version, ENGINE_VERSION); assert.equal('engine' in hook, false); assert.equal(hook.game, 'kart');
  hook.stepN(3); assert.equal(n, 3);
});
test('getters stay live', () => {
  const target = {}; let seed = 1;
  installEngineHook({ get seed() { return seed; } }, { game: 'kart', target });
  seed = 9; assert.equal(target.engine.seed, 9);
});
test('the property cannot be overwritten by assignment but can be reinstalled', () => {
  const target = {};
  installEngineHook({}, { game: 'a', target });
  assert.throws(() => { 'use strict'; target.engine = 1; }, TypeError);
  installEngineHook({}, { game: 'b', target }); assert.equal(target.engine.game, 'b');
});
test('requires a game id and leaves old hooks alone', () => {
  const target = { oldHook: { old: true } };
  assert.throws(() => installEngineHook({}, { target }), /game id required/);
  installEngineHook({}, { game: 'kart', target }); assert.deepEqual(target.oldHook, { old: true });
});
test('version and game are reserved: the api cannot override them', () => {
  const target = {};
  const hook = installEngineHook({ version: 'x', get game() { return 'evil'; }, ok: 1 }, { game: 'g', target });
  assert.equal(hook.version, ENGINE_VERSION); assert.equal(hook.game, 'g'); assert.equal(hook.ok, 1);
});
test('game must be a non-empty string', () => {
  for (const game of [5, {}, '', null]) assert.throws(() => installEngineHook({}, { game, target: {} }), { name: 'TypeError', message: 'installEngineHook: game id required' });
});
