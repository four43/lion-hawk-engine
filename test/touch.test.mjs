import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStick, bindHold, createEngine, defineGame, actions, axis, button } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';

const setup = () => {
  const { window, document } = dom();
  const engine = createEngine(defineGame({ id: 't', start: 's', scenes: { s: { update() {} } }, actions: actions({ steer: axis(), throttle: axis(), horn: button() }) }));
  const root = document.createElement('div'); document.body.appendChild(root);
  const btn = document.createElement('button'); root.appendChild(btn);
  const ev = (el, type, pointerId, x = 0, y = 0) => el.dispatchEvent(new window.PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const v = () => engine.input.apply();
  return { window, document, engine, root, btn, ev, v };
};
const stick = (s, o = {}) => bindStick(s.engine, { root: s.root, x: ['steer', 1], y: ['throttle', 1], doc: s.document, ...o });

test('full right gives steer 1; up 35px gives dead-zoned throttle', () => {
  const s = setup(); stick(s);
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300);
  assert.equal(s.v().steer, 1);
  s.ev(s.window, 'pointermove', 1, 200, 265);
  assert.ok(Math.abs(s.v().throttle - 0.4 / 0.9) < 1e-9); assert.equal(s.v().steer, 0);
  s.ev(s.window, 'pointermove', 1, 600, 300); assert.equal(s.v().steer, 1);
  s.ev(s.window, 'pointerup', 1); assert.equal(s.v().steer, 0); assert.equal(s.v().throttle, 0);
});
test('edge, button and second pointer are ignored', () => {
  const s = setup(); stick(s);
  s.ev(s.root, 'pointerdown', 1, 10, 300); s.ev(s.window, 'pointermove', 1, 80, 300); assert.equal(s.v().steer, 0);
  s.ev(s.btn, 'pointerdown', 2, 200, 300); s.ev(s.window, 'pointermove', 2, 270, 300); assert.equal(s.v().steer, 0);
  s.ev(s.root, 'pointerdown', 3, 200, 300); s.ev(s.root, 'pointerdown', 4, 200, 300);
  s.ev(s.window, 'pointermove', 4, 270, 300); assert.equal(s.v().steer, 0);
  s.ev(s.window, 'pointermove', 3, 270, 300); assert.equal(s.v().steer, 1);
});
test('y sign inverts and cancel / lostpointercapture release', () => {
  const s = setup(); stick(s, { y: ['throttle', -1] });
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 200, 230); assert.equal(s.v().throttle, -1);
  s.ev(s.window, 'pointercancel', 1); assert.equal(s.v().throttle, 0);
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300); assert.equal(s.v().steer, 1);
  s.ev(s.root, 'lostpointercapture', 1); assert.equal(s.v().steer, 0);
});
test('stick renders, shows at pointer and hides on release; dispose cleans up', () => {
  const s = setup(); const st = stick(s); const el = s.document.body.querySelector('.lh-stick');
  assert.ok(el.querySelector('.lh-knob')); assert.equal(el.hidden, true);
  s.ev(s.root, 'pointerdown', 1, 200, 300); assert.equal(el.hidden, false);
  s.ev(s.window, 'pointerup', 1); assert.equal(el.hidden, true);
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300);
  st.dispose(); assert.equal(s.v().steer, 0); assert.equal(s.document.body.querySelector('.lh-stick'), null);
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300); assert.equal(s.v().steer, 0);
});
test('hold button is true while pressed, false after lostpointercapture', () => {
  const s = setup(); const el = s.document.createElement('div'); s.document.body.appendChild(el);
  let cap = null; el.setPointerCapture = id => { cap = id; };
  const h = bindHold(s.engine, el, 'horn');
  s.ev(el, 'pointerdown', 5); assert.equal(s.v().horn.down, true); assert.equal(cap, 5);
  s.ev(el, 'lostpointercapture', 5); assert.equal(s.v().horn.down, false);
  s.ev(el, 'pointerdown', 5); s.ev(el, 'pointercancel', 5); assert.equal(s.v().horn.down, false);
  s.ev(el, 'pointerdown', 5); s.ev(el, 'pointerup', 5); assert.equal(s.v().horn.down, false);
  const cm = new s.window.Event('contextmenu', { cancelable: true }); el.dispatchEvent(cm); assert.equal(cm.defaultPrevented, true);
  s.ev(el, 'pointerdown', 5); h.dispose(); assert.equal(s.v().horn.down, false);
});
test('hidden visibility and pagehide release both', () => {
  const s = setup(); stick(s); const el = s.document.createElement('div'); s.document.body.appendChild(el); bindHold(s.engine, el, 'horn');
  const go = () => { s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300); s.ev(el, 'pointerdown', 2); assert.equal(s.v().steer, 1); assert.equal(s.v().horn.down, true); };
  let vis = 'visible'; Object.defineProperty(s.document, 'visibilityState', { configurable: true, get: () => vis });
  go(); vis = 'hidden'; s.document.dispatchEvent(new s.window.Event('visibilitychange'));
  assert.equal(s.v().steer, 0); assert.equal(s.v().horn.down, false);
  vis = 'visible'; go(); s.window.dispatchEvent(new s.window.Event('pagehide')); assert.equal(s.v().steer, 0); assert.equal(s.v().horn.down, false);
});

test('edge guard uses the viewport, not root rect', () => {
  const s = setup(); stick(s); s.root.getBoundingClientRect = () => ({ left: 100, top: 0 });
  s.ev(s.root, 'pointerdown', 1, 110, 300); s.ev(s.window, 'pointermove', 1, 180, 300); assert.equal(s.v().steer, 1);
  s.ev(s.window, 'pointerup', 1);
  s.root.getBoundingClientRect = () => ({ left: -50, top: 0 });
  s.ev(s.root, 'pointerdown', 2, 10, 300); s.ev(s.window, 'pointermove', 2, 80, 300); assert.equal(s.v().steer, 0);
});
test('touch-action none is set and restored', () => {
  const s = setup(); s.root.style.touchAction = 'pan-y'; const st = stick(s);
  assert.equal(s.root.style.touchAction, 'none'); st.dispose(); assert.equal(s.root.style.touchAction, 'pan-y');
});
test('a div hold inside root presses and does not start the stick', () => {
  const s = setup(); stick(s); const d = s.document.createElement('div'); s.root.appendChild(d); const h = bindHold(s.engine, d, 'horn');
  assert.equal(d.hasAttribute('data-lh-hold'), true);
  s.ev(d, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 270, 300);
  assert.equal(s.v().horn.down, true); assert.equal(s.v().steer, 0);
  h.dispose(); assert.equal(d.hasAttribute('data-lh-hold'), false);
});
test('hold ignores a second pointer', () => {
  const s = setup(); const el = s.document.createElement('div'); s.document.body.appendChild(el); bindHold(s.engine, el, 'horn');
  s.ev(el, 'pointerdown', 4); s.ev(el, 'pointerdown', 5); s.ev(el, 'pointerup', 4); assert.equal(s.v().horn.down, false);
});

test('F2: bindHold on an axis action writes 1 while held, 0 after; value overrides', () => {
  const s = setup(); const el = s.document.createElement('div'); s.document.body.appendChild(el);
  bindHold(s.engine, el, 'throttle');
  s.ev(el, 'pointerdown', 5); assert.equal(s.v().throttle, 1);
  s.ev(el, 'pointerup', 5); assert.equal(s.v().throttle, 0);
  const el2 = s.document.createElement('div'); s.document.body.appendChild(el2);
  bindHold(s.engine, el2, 'steer', { value: -1 });
  s.ev(el2, 'pointerdown', 6); assert.equal(s.v().steer, -1); s.ev(el2, 'pointerup', 6); assert.equal(s.v().steer, 0);
  assert.deepEqual({ ...s.engine.input.kinds }, { steer: 'axis', throttle: 'axis', horn: 'button' });
});
test('F3: y-only stick works; neither axis throws', () => {
  const s = setup(); const st = bindStick(s.engine, { root: s.root, y: ['throttle', 1], doc: s.document });
  s.ev(s.root, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 200, 230);
  assert.equal(s.v().throttle, 1); assert.equal(s.v().steer, 0); st.dispose();
  assert.throws(() => bindStick(s.engine, { root: s.root, doc: s.document }), /bindStick: x or y required/);
});
test('F3: a canvas surface mounts the base under body, with fixed position', () => {
  const s = setup(); const canvas = s.document.createElement('canvas'); s.document.body.appendChild(canvas);
  const st = bindStick(s.engine, { surface: canvas, y: ['throttle', 1], doc: s.document });
  const base = s.document.querySelector('.lh-stick');
  assert.equal(base.parentNode, s.document.body); assert.equal(base.style.position, 'fixed'); assert.equal(canvas.style.touchAction, 'none');
  s.ev(canvas, 'pointerdown', 1, 200, 300); s.ev(s.window, 'pointermove', 1, 200, 230); assert.equal(s.v().throttle, 1);
  st.dispose(); assert.equal(s.document.querySelector('.lh-stick'), null);
});
