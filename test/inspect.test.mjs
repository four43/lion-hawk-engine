// A failing assert on an engine object must not make util.inspect walk into Rapier / WebAssembly memory (~0.7 GB/s).
// Node's AssertionError ignores custom inspect (customInspect: false, depth 1000, getters on), so the Rapier handles are
// non-enumerable and the message stays bounded however big the World is. Custom inspect still keeps console.log short.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import util from 'node:util';
import { createEngine as makeEngine } from '../src/core/engine.js';
import { physGame } from './fixtures/phys/game.js';

const engines = [];
const createEngine = (...a) => { const e = makeEngine(...a); engines.push(e); return e; };
afterEach(() => { for (const e of engines.splice(0)) e.world?.dispose(); });

const boot = n => createEngine(physGame({ build: (e, ctx) => {
  ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 10, 0], tags: ['crate', 'truck'], net: 'train', netId: 2 });
  for (let i = 1; i < n; i++) ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [i, 10, 0], tags: ['crate'] });
} }), { seed: 1 });

// the original explosion pattern: assert.equal(null, thing) inside try/catch; returns the message and the RSS growth
const failing = x => {
  const before = process.memoryUsage().rss; let message = '';
  try { assert.equal(null, x); } catch (err) { message = err.message; }
  return { len: message.length, mb: (process.memoryUsage().rss - before) / 2 ** 20 };
};
const bounded = (pick, cap) => {
  const small = failing(pick(boot(1))), big = failing(pick(boot(200)));
  assert.ok(small.len > 0, 'the assert failed');
  assert.ok(big.len < cap, `${big.len} chars`);
  assert.ok(big.len <= 2 * small.len && small.len <= 2 * big.len, `message grows with the World: ${small.len} vs ${big.len}`);
  assert.ok(small.mb < 50 && big.mb < 50, `rss grew ${small.mb} / ${big.mb} MB`);
};
const pawned = e => { const c = e.controllerOf(0); c.possess(e.world.get(1)); return c; };

test('an entity with a Rapier body prints as Entity#id [tags, net:kind#id]', () => {
  const ent = boot(1).world.get(1);
  assert.ok(ent.body && ent.colliders.length, 'has a Rapier body');
  assert.equal(util.inspect(ent), 'Entity#1 [crate, truck, net:train#2]');
});
test('an entity failing assert does not grow with the World (1 vs 200 entities)', () => bounded(e => e.world.get(1), 20000));
test('a controller with a pawn: bounded', () => {
  const e = boot(1), c = pawned(e);
  assert.equal(util.inspect(c), `Controller#${c.id} seat 0 player 1 pawn Entity#1`);
  assert.match(util.inspect(e.controller({ bot: true })), /pawn none/);
  bounded(pawned, 20000);
});
test('a World: bounded and compact', () => {
  const e = boot(1);
  assert.equal(util.inspect(e.world), `World serial ${e.world.serial}, 1 entities`);
  bounded(e => e.world, 100000);
});
test('the engine: bounded and compact', () => {
  const e = boot(1);
  assert.equal(util.inspect(e), `Engine ${e.game.id} step 0`);
  bounded(e => e, 100000);
});
test('Rapier handles are hidden but work; keys and the digest are what they were', () => {
  const e = boot(2), ent = e.world.get(1), w = e.world;
  assert.equal(JSON.stringify(Object.keys(ent)), JSON.stringify(['id', 'tags', 'model', 'net', 'netId', 'xf', 'sockets']));
  assert.equal(Object.getOwnPropertyDescriptor(ent, 'body').enumerable, false);
  assert.equal(typeof ent.body.mass(), 'number'); assert.equal(ent.colliders.length, 1);
  assert.equal(Object.getOwnPropertyDescriptor(ent, Symbol.for('nodejs.util.inspect.custom')).enumerable, false);
  assert.ok(w.rapier && w.R && w.engine === e, 'World references still readable');
  const body = ent.body; w.despawn(ent); assert.equal(ent.body, undefined); assert.ok(body);
});
