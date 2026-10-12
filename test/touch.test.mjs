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
  s.ev(el, 'pointerdown', 5); s.v(); s.ev(el, 'pointercancel', 5); assert.equal(s.v().horn.down, false);
  s.ev(el, 'pointerdown', 5); s.v(); s.ev(el, 'pointerup', 5); assert.equal(s.v().horn.down, false);
  const cm = new s.window.Event('contextmenu', { cancelable: true }); el.dispatchEvent(cm); assert.equal(cm.defaultPrevented, true);
  s.ev(el, 'pointerdown', 5); s.v(); h.dispose(); assert.equal(s.v().horn.down, false);
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
  s.ev(el, 'pointerdown', 4); s.ev(el, 'pointerdown', 5); s.v(); s.ev(el, 'pointerup', 4); assert.equal(s.v().horn.down, false);
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

test('2c slider: x only, vertical ignored, per-axis clamp, function radius per gesture, adopted base/knob (#17)', () => {
  const s = setup();
  const base = s.document.createElement('div'), knob = s.document.createElement('div');
  base.hidden = true; base.appendChild(knob); s.document.body.appendChild(base);
  let r = 100;
  const h = bindStick(s.engine, { root: s.root, x: ['steer', -1], axis: 'x', radius: () => r, deadZone: 0, edge: 20, base, knob, doc: s.document });
  s.ev(s.root, 'pointerdown', 1, 300, 300);
  assert.equal(base.hidden, false); assert.equal(base.style.left, '300px'); assert.equal(base.style.getPropertyValue('--lh-r'), '100px');
  assert.equal(s.root.hasAttribute('data-lh-active'), true);
  r = 50; // read again only on the next pointerdown
  s.ev(s.window, 'pointermove', 1, 350, 390); assert.equal(s.v().steer, -0.5); // 50 of 100 px right; 90 px down ignored
  assert.equal(knob.style.transform, 'translate(50px, 0px)');
  s.ev(s.window, 'pointermove', 1, 100, 300); assert.equal(s.v().steer, 1); // clamped on x alone
  s.ev(s.window, 'pointerup', 1);
  assert.equal(s.v().steer, 0); assert.equal(base.hidden, true); assert.equal(s.root.hasAttribute('data-lh-active'), false);
  h.dispose(); assert.equal(base.isConnected, true); assert.equal(s.document.querySelector('.lh-stick'), null);
});
test('2c: bindHold marks its element with data-lh-down while pressed (#17)', () => {
  const s = setup(); const h = bindHold(s.engine, s.btn, 'throttle');
  s.ev(s.btn, 'pointerdown', 5); assert.equal(s.btn.hasAttribute('data-lh-down'), true); assert.equal(s.v().throttle, 1);
  s.ev(s.btn, 'pointerup', 5); assert.equal(s.btn.hasAttribute('data-lh-down'), false);
  h.dispose(); assert.equal(s.btn.hasAttribute('data-lh-down'), false);
});

test('2d: bindHold keeps focus off its button unless focus: true (#42)', () => {
  const s = setup(); bindHold(s.engine, s.btn, 'horn');
  const pd = new s.window.PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true }); s.btn.dispatchEvent(pd);
  const md = new s.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }); s.btn.dispatchEvent(md);
  assert.equal(pd.defaultPrevented, true); assert.equal(md.defaultPrevented, true);
  const b2 = s.document.createElement('button'); s.root.appendChild(b2); bindHold(s.engine, b2, 'throttle', { focus: true });
  const e2 = new s.window.PointerEvent('pointerdown', { pointerId: 2, bubbles: true, cancelable: true }); b2.dispatchEvent(e2);
  assert.equal(e2.defaultPrevented, false);
});
test('2d: stick radius guard, knob-less adopted base, --lh-r cleared, pointerdown prevented (E3, R5 minors)', () => {
  const s = setup(); const base = s.document.createElement('div'); s.document.body.appendChild(base);
  const st = stick(s, { axis: 'x', base, radius: () => 0 });
  const d = new s.window.PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 300, bubbles: true, cancelable: true }); s.root.dispatchEvent(d);
  assert.equal(d.defaultPrevented, true); assert.equal(base.style.getPropertyValue('--lh-r'), '70px');
  s.ev(s.window, 'pointermove', 1, 235, 300); assert.ok(Math.abs(s.v().steer - (0.5 - 0.1) / 0.9) < 1e-9);
  st.dispose(); assert.equal(base.style.getPropertyValue('--lh-r'), '');
});

test('2e: origin centre: a fixed pad deflects from its centre at once and is never hidden or moved (#53)', () => {
  const s = setup();
  const base = s.document.createElement('div'), knob = s.document.createElement('div'); base.appendChild(knob); s.document.body.appendChild(base);
  base.getBoundingClientRect = () => ({ left: 100, top: 200, width: 132, height: 132, right: 232, bottom: 332, x: 100, y: 200 }); // centre (166, 266)
  const h = bindStick(s.engine, { root: base, base, knob, origin: 'centre', x: ['steer', -1], y: ['throttle', 1], radius: () => 50, deadZone: 0, edge: 0, doc: s.document });
  assert.equal(base.hidden, false);
  s.ev(base, 'pointerdown', 1, 166, 241); // 25 px above the centre: half throttle on the touch itself
  let v = s.v(); assert.equal(v.throttle, 0.5); assert.equal(v.steer, 0);
  assert.equal(knob.style.transform, 'translate(0px, -25px)'); assert.equal(base.style.left, ''); assert.equal(base.hidden, false);
  assert.equal(base.style.getPropertyValue('--lh-r'), '50px'); assert.equal(base.hasAttribute('data-lh-active'), true);
  s.ev(s.window, 'pointermove', 1, 266, 266); v = s.v(); assert.equal(v.steer, -1); assert.equal(v.throttle, 0); // clamped radially
  s.ev(s.window, 'pointerup', 1); v = s.v(); assert.equal(v.steer, 0); assert.equal(base.hidden, false); assert.equal(knob.style.transform, '');
  h.dispose(); assert.equal(base.hidden, false); assert.equal(base.isConnected, true);
  assert.throws(() => bindStick(s.engine, { root: base, x: ['steer', 1], origin: 'centre', doc: s.document }), /origin 'centre' needs a base/);
  assert.throws(() => bindStick(s.engine, { root: base, base, x: ['steer', 1], origin: 'middle', doc: s.document }), /origin must be 'thumb' or 'centre'/);
});
