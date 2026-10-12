import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/index.sim.js';
import { createDriver } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
import game from './fixtures/countdown.js';

const setup = (extra = {}) => {
  const q = []; const raf = f => q.push(f); const caf = () => {}; const tick = ts => q.shift()(ts);
  const { document } = dom(); let vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  const setVis = v => { vis = v; document.dispatchEvent(new document.defaultView.Event('visibilitychange')); };
  const engine = createEngine(game, { scene: 'race' });
  const driver = createDriver(engine, { raf, caf, doc: document, ...extra });
  return { q, tick, engine, driver, setVis };
};

test('first tick has dt 0 and no steps; later ticks step', () => {
  const { q, tick, engine, driver } = setup();
  driver.start(); assert.equal(driver.running, true); assert.equal(q.length, 1);
  const s0 = engine.time.step; tick(0); assert.equal(engine.time.step, s0);
  tick(1000 / 60 * 2 + 1e-6); assert.equal(engine.time.step, s0 + 2); assert.equal(q.length, 1);
});
test('devices update(dt) before frame', () => {
  const order = [];
  const device = { update: dt => order.push(['dev', dt]) };
  const { tick, engine, driver } = setup({ devices: [device] });
  engine.onRender(() => order.push(['render']));
  driver.start(); tick(0); tick(1000 / 30);
  assert.deepEqual(order.map(o => o[0]), ['dev', 'render', 'dev', 'render']);
  assert.ok(Math.abs(order[2][1] - 1 / 30) < 1e-9);
  assert.equal(driver.devices[0], device);
});
test('manual(true) renders without stepping', () => {
  const { tick, engine, driver } = setup(); let renders = 0; engine.onRender(() => renders++);
  assert.equal(driver.manual(), false); assert.equal(driver.manual(true), true);
  driver.start(); tick(0); const s = engine.time.step; tick(1000); tick(2000);
  assert.equal(engine.time.step, s); assert.equal(renders, 3);
  driver.manual(false); tick(3000); assert.ok(engine.time.step > s);
});
test('hidden stops scheduling; visible resets dt', () => {
  const { q, tick, engine, driver, setVis } = setup();
  driver.start(); tick(0); tick(16.7); assert.equal(q.length, 1);
  setVis('hidden'); tick(33); assert.equal(q.length, 0);
  setVis('visible'); assert.equal(q.length, 1);
  const s = engine.time.step; tick(600000); assert.equal(engine.time.step, s); assert.equal(q.length, 1);
});
test('hidden while stopped does not resume on visible', () => {
  const { q, driver, setVis } = setup();
  setVis('hidden'); setVis('visible'); assert.equal(q.length, 0); assert.equal(driver.running, false);
});
test('stop() prevents rescheduling', () => {
  const { q, tick, driver } = setup();
  driver.start(); tick(0); driver.stop(); assert.equal(driver.running, false); tick(16); assert.equal(q.length, 0);
});

test('F1: a throwing device keeps the loop alive and reports through onError', () => {
  const errs = []; let n = 0;
  const device = { update() { if (n++ === 0) throw new Error('boom'); } };
  const { q, tick, driver } = setup({ devices: [device], onError: e => errs.push(e.message) });
  driver.start(); tick(0);
  assert.equal(driver.running, true); assert.equal(q.length, 1); assert.deepEqual(errs, ['boom']);
  tick(16); assert.equal(q.length, 1); assert.deepEqual(errs, ['boom']);
});
test('F1: start() resets the engine loop', () => {
  const { engine, driver } = setup(); let reset = 0; const r = engine.loop.reset; engine.loop.reset = () => { reset++; return r.call(engine.loop); };
  driver.start(); assert.equal(reset, 1);
});
test('2d: the driver acks a rendered frame at the start of the next tick (#38)', () => {
  const q = []; const raf = f => q.push(f), tick = ts => q.shift()(ts);
  const { document } = dom(); const engine = createEngine(game, { scene: 'race', acks: 'frames' });
  let acks = 0; engine.onPresent(() => acks++);
  const driver = createDriver(engine, { raf, caf() {}, doc: document });
  driver.start(); tick(0); assert.equal(acks, 0); tick(16); assert.equal(acks, 1); tick(32); assert.equal(acks, 2);
});
