import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, installEngine, defineGame } from '../src/index.view.js';
import game from './fixtures/countdown.js';

const setup = () => {
  const target = {}, engine = createEngine(game), calls = [];
  const driver = { manual: on => { calls.push(on); return !!on; } };
  installEngine(engine, { driver, target }); return { target, engine, calls };
};
test('window.engine exposes the D-4 surface', () => {
  const { target: { engine: h } } = setup();
  assert.equal(h.game, 'countdown'); assert.ok(h.version);
  assert.equal(h.scene.name, 'title'); assert.equal(h.state().scene, 'title');
  assert.equal(typeof h.stepN, 'function'); assert.equal(h.input.read().pause, false);
  assert.equal(h.ui.tree()[0].id, 'title.play'); assert.equal(h.settled(), true);
  assert.deepEqual(h.errors, []); assert.deepEqual(h.debug, {});
  h.stepN(3); assert.equal(h.time.step, 3);
});
test('events.since is JSON-safe', () => {
  const { target: { engine: h }, engine } = setup();
  engine.emit('x', { obj: { id: 'a', kind: 'k', big: {} }, bare: {}, fn() {}, n: 1 }); h.stepN(1);
  const ev = h.events.since(0); assert.doesNotThrow(() => JSON.stringify(ev));
  const x = ev.find(e => e.type === 'x'); assert.deepEqual(x.obj, { id: 'a', kind: 'k' }); assert.equal(x.bare, undefined); assert.equal(x.n, 1);
});
test('on() fires for go and unsubscribes; manual forwards to the driver', () => {
  const { target: { engine: h }, calls } = setup(); const got = [];
  const off = h.on('scene', e => got.push(e.name)); h.go('race'); h.stepN(1); assert.deepEqual(got, ['race']);
  off(); h.go('title'); h.stepN(1); assert.deepEqual(got, ['race']);
  h.manual(true); assert.deepEqual(calls, [true]);
});
test('errors collect from the target', () => {
  const ls = {}, target = { addEventListener: (t, f) => { ls[t] = f; } };
  const engine = createEngine(game); installEngine(engine, { driver: {}, target });
  ls.error({ message: 'boom' }); ls.unhandledrejection({ reason: new Error('rej') });
  assert.deepEqual(target.engine.errors.map(e => e.message), ['boom', 'rej']);
});

const fieldGame = defineGame({ id: 'f', start: 't', scenes: { t: {
  enter(e, c) { c.state.seed = 'a'; },
  ui(u) { u.field({ id: 'seed', label: 'Seed', get: e => e.scene.state.seed, set: (t, e) => { e.scene.state.seed = t; } }); },
} } });
test('2c: window.engine.ui.fill fills a field', () => {
  const target = {}, engine = createEngine(fieldGame);
  installEngine(engine, { driver: { manual: () => false }, target });
  target.engine.ui.fill('t.seed', 'c'); assert.equal(engine.scene.state.seed, 'c');
});
