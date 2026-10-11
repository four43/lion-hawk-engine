import test from 'node:test';
import assert from 'node:assert/strict';
import { bindKeyboard } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';

const B = { w: ['throttle', 1], s: ['throttle', -1], a: ['steer', -1], d: ['steer', 1], h: 'horn' };
const setup = (opts = {}) => {
  const { window, document } = dom(); const calls = []; let cleared = null;
  const engine = { input: { device: (p, s) => calls.push({ ...p, s }), clearDevice: s => { cleared = s; } } };
  const kb = bindKeyboard(engine, B, { target: window, doc: document, ...opts });
  const key = (type, k, el = document.body) => el.dispatchEvent(new window.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  const last = () => calls[calls.length - 1];
  return { window, document, kb, key, last, cleared: () => cleared };
};

test('held w drives throttle axis; button h', () => {
  const { kb, key, last } = setup();
  key('keydown', 'W'); kb.update(0.016); assert.equal(last().throttle, 1); assert.equal(last().s, 'keyboard');
  key('keydown', 'h'); kb.update(0.016); assert.equal(last().horn, true);
  key('keyup', 'w'); key('keyup', 'h'); kb.update(0.016); assert.equal(last().throttle, 0); assert.equal(last().horn, false);
});
test('a plus d sum to 0', () => {
  const { kb, key, last } = setup();
  key('keydown', 'a'); key('keydown', 'd'); kb.update(0.016); assert.equal(last().steer, 0);
});
test('keys in an input are ignored', () => {
  const { kb, key, last, document } = setup();
  const input = document.createElement('input'); document.body.appendChild(input);
  key('keydown', 'w', input); kb.update(0.016); assert.equal(last().throttle, 0);
});
test('blur and hidden release everything', () => {
  const { kb, key, last, window, document } = setup();
  key('keydown', 'w'); window.dispatchEvent(new window.Event('blur')); kb.update(0.016); assert.equal(last().throttle, 0);
  let vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  key('keydown', 'w'); vis = 'hidden'; document.dispatchEvent(new window.Event('visibilitychange')); kb.update(0.016); assert.equal(last().throttle, 0);
});
test('ramp rises then falls', () => {
  const { kb, key, last } = setup({ ramps: { steer: { rise: 2, fall: 4 } } });
  key('keydown', 'd'); kb.update(0.25); assert.equal(last().steer, 0.5);
  key('keyup', 'd'); kb.update(0.125); assert.equal(last().steer, 0);
});
test('dispose clears the source and stops listening', () => {
  const { kb, key, last, cleared } = setup();
  kb.dispose(); assert.equal(cleared(), 'keyboard'); key('keydown', 'w'); kb.update(0.016); assert.equal(last()?.throttle ?? 0, 0);
});

test('F4: binding keys are lowercased at bind time', () => {
  const { window, document } = dom(); const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { ArrowUp: ['throttle', 1] }, { target: window, doc: document });
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  kb.update(0.016); assert.equal(calls.at(-1).throttle, 1);
});
test('F4: ctrl/meta/alt chords are ignored and not prevented', () => {
  const { window, document, kb, last } = setup();
  for (const m of ['ctrlKey', 'metaKey', 'altKey']) {
    const ev = new window.KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true, [m]: true });
    document.body.dispatchEvent(ev); kb.update(0.016);
    assert.equal(ev.defaultPrevented, false); assert.equal(last().throttle, 0);
  }
});
test('F4: Enter and Space on a button are not prevented', () => {
  const { window, document } = dom(); const engine = { input: { device() {}, clearDevice() {} } };
  bindKeyboard(engine, { enter: 'ok', ' ': 'jump', w: ['t', 1] }, { target: window, doc: document });
  const b = document.createElement('button'); document.body.appendChild(b);
  const fire = (el, key) => { const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; };
  assert.equal(fire(b, 'Enter'), false); assert.equal(fire(b, ' '), false);
  assert.equal(fire(document.body, 'Enter'), true); assert.equal(fire(document.body, ' '), true); assert.equal(fire(b, 'w'), true);
});
