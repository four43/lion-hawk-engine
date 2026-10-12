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
test('2c: a function ramp gets value, target, dt and one scratch object per axis (#14)', () => {
  const seen = [];
  const { kb, key, last } = setup({ ramps: { steer: (v, t, dt, st) => { seen.push(st); st.n = (st.n ?? 0) + 1; return v + t * dt; } } });
  key('keydown', 'd'); kb.update(0.5); assert.equal(last().steer, 0.5);
  kb.update(0.25); assert.equal(last().steer, 0.75);
  key('keyup', 'd'); kb.update(0.1); assert.equal(last().steer, 0.75); // still called with target 0
  assert.equal(seen.length, 3); assert.equal(seen[0], seen[2]); assert.equal(seen[2].n, 3);
});
test('2c: shift+<key> wins while Shift is held; keyup by code releases it (#14)', () => {
  const { window, document } = dom(); const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { r: 'reset', 'shift+r': 'resetAll', '`': 'debug' }, { target: window, doc: document });
  const ev = (type, o) => document.body.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...o }));
  ev('keydown', { key: 'R', code: 'KeyR', shiftKey: true }); kb.update(0.016);
  assert.deepEqual(calls.at(-1), { reset: false, resetAll: true, debug: false });
  ev('keyup', { key: 'r', code: 'KeyR' }); kb.update(0.016);
  assert.deepEqual(calls.at(-1), { reset: false, resetAll: false, debug: false });
  ev('keydown', { key: 'r', code: 'KeyR' }); kb.update(0.016); assert.equal(calls.at(-1).reset, true);
  ev('keyup', { key: 'r', code: 'KeyR' });
  ev('keydown', { key: '`', code: 'Backquote' }); kb.update(0.016); assert.equal(calls.at(-1).debug, true);
  ev('keyup', { key: '~', code: 'Backquote', shiftKey: true }); kb.update(0.016); assert.equal(calls.at(-1).debug, false);
});
test('2c: a key tapped between two updates counts for one update (#13)', () => {
  const { kb, key, last } = setup();
  key('keydown', 'h'); key('keyup', 'h'); kb.update(0.016); assert.equal(last().horn, true);
  kb.update(0.016); assert.equal(last().horn, false);
});
test('2c (changed F4): Enter and Space on a focused button are left to the button (#15)', () => {
  const { window, document } = dom(); const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { enter: 'ok', ' ': 'jump', w: ['t', 1] }, { target: window, doc: document });
  const b = document.createElement('button'); document.body.appendChild(b);
  const fire = (el, key) => { const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; };
  assert.equal(fire(b, 'Enter'), false); assert.equal(fire(b, ' '), false);
  kb.update(0.016); assert.equal(calls.at(-1).ok, false); assert.equal(calls.at(-1).jump, false);
  assert.equal(fire(document.body, 'Enter'), true); assert.equal(fire(b, 'w'), true);
  kb.update(0.016); assert.equal(calls.at(-1).ok, true); assert.equal(calls.at(-1).t, 1);
});

const camMap = cam => ({ from: ['sx', 'sy'], to: (x, y, out) => {
  const m = Math.min(1, Math.hypot(x, y)), a = Math.atan2(x, y), w = cam.yaw - a;
  out.goX = m * Math.sin(w); out.goZ = m * Math.cos(w); out.goBack = m > 0 && Math.abs(a) > Math.PI * 0.8; return out; } });
test('2f: bindKeyboard map: W+D is a normalised diagonal, S alone is goBack, the virtual names never leave (#8)', () => {
  const { window, document } = dom(), calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const kb = bindKeyboard(engine, { w: ['sy', 1], s: ['sy', -1], a: ['sx', -1], d: ['sx', 1], h: 'horn' }, { target: window, doc: document, map: camMap({ yaw: 0 }) });
  const key = (type, k) => document.body.dispatchEvent(new window.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`), last = () => calls[calls.length - 1];
  key('keydown', 'w'); key('keydown', 'd'); kb.update(0.016);
  near(-last().goX, Math.SQRT1_2); near(last().goZ, Math.SQRT1_2); assert.equal(last().goBack, false); // camMap: screen right is world -x at yaw 0
  assert.deepEqual(Object.keys(last()).sort(), ['goBack', 'goX', 'goZ', 'horn']);
  key('keyup', 'w'); key('keyup', 'd'); key('keydown', 's'); key('keydown', 'h'); kb.update(0.016);
  assert.equal(last().goBack, true); assert.equal(last().horn, true);
});
