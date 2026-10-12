import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGesture, createEngine, defineGame } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
const setup = (o = {}) => {
  const { window, document } = dom(), log = [];
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const ev = (t, type, id, x = 0, y = 0, extra = {}) => t.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0, ...extra }));
  const g = bindGesture(engine, el, { tap: () => log.push('tap'), hold: { seconds: 1, fire: () => log.push('hold') }, drag: d => log.push(`drag:${d.phase}`),
    pinch: p => log.push(`pinch:${p.phase}:${p.scale.toFixed(2)}`), doc: document, ...o });
  return { window, document, el, ev, g, log };
};
test('2f: bindGesture: a quick tap; a still finger held 1 s of raw time fires once and is no tap (#59, #56)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.g.update(0.016, 0.016); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log, ['tap']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 2, 10, 10); for (let i = 0; i < 4; i++) s.g.update(0.1, 0.3); // capped 0.4 s, raw 1.2 s
  s.ev(s.window, 'pointerup', 2, 10, 10); assert.deepEqual(s.log, ['hold']);
});
test('2f: bindGesture: a drag past 12 px, a two-finger pinch, and a second finger cancels a hold (#59)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.ev(s.window, 'pointermove', 1, 50, 10); s.g.update(0.016, 0.016); s.ev(s.window, 'pointerup', 1, 50, 10);
  assert.deepEqual(s.log, ['drag:start', 'drag:move', 'drag:end']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.el, 'pointerdown', 2, 200, 100); s.ev(s.window, 'pointermove', 2, 300, 100); s.g.update(0.016, 0.016);
  s.ev(s.window, 'pointerup', 2, 300, 100); s.ev(s.window, 'pointerup', 1, 100, 100);
  assert.deepEqual(s.log, ['pinch:start:1.00', 'pinch:move:2.00', 'pinch:end:2.00']); s.log.length = 0;
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.g.update(0.5, 0.5); s.ev(s.el, 'pointerdown', 2, 60, 10); s.g.update(0.6, 0.6);
  s.ev(s.window, 'pointerup', 2, 60, 10); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log.filter(x => x === 'hold' || x === 'tap'), []);
});
test('2f: bindGesture: payloads, uncapped: false, cancel, a slow tap, ignored buttons and dispose (#59)', () => {
  const got = [], s = setup({ uncapped: false, drag: d => got.push(['drag', d.phase, d.dx, d.dy]), pinch: p => got.push(['pinch', p.phase, +p.scale.toFixed(3), +p.rotate.toFixed(3), p.panX, p.panY]) });
  s.ev(s.el, 'pointerdown', 1, 10, 10); for (let i = 0; i < 5; i++) s.g.update(0.1, 0.3); s.ev(s.window, 'pointerup', 1, 10, 10);
  assert.deepEqual(s.log, []); // capped 0.5 s (raw 1.5 s ignored): no hold, and too slow for a tap
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.ev(s.window, 'pointermove', 1, 30, 25); s.g.update(0.016); s.g.update(0.016); s.ev(s.window, 'pointermove', 1, 40, 50); s.g.update(0.016);
  s.ev(s.window, 'pointercancel', 1);
  assert.deepEqual(got.splice(0), [['drag', 'start', 0, 0], ['drag', 'move', 20, 15], ['drag', 'move', 30, 40], ['drag', 'end', 30, 40]]); // one move per update, only when it moved
  s.ev(s.el, 'pointerdown', 1, 0, 0); s.ev(s.el, 'pointerdown', 2, 100, 0); s.ev(s.window, 'pointermove', 2, 0, 100); s.ev(s.window, 'pointermove', 1, 10, 10); s.g.update(0.016);
  s.ev(s.el, 'pointerdown', 3, 500, 500); s.ev(s.window, 'pointerup', 3, 500, 500); s.ev(s.window, 'pointerup', 1, 10, 10); s.ev(s.window, 'pointerup', 2, 0, 100);
  assert.deepEqual(got.splice(0), [['pinch', 'start', 1, 0, 0, 0], ['pinch', 'move', 0.906, 1.681, -45, 55], ['pinch', 'end', 0.906, 1.681, -45, 55]]); // a third finger is ignored
  const b = s.document.createElement('button'); s.el.appendChild(b);
  s.ev(b, 'pointerdown', 4, 10, 10); s.ev(s.window, 'pointerup', 4, 10, 10); assert.deepEqual(s.log, []);
  s.ev(s.el, 'pointerdown', 5, 10, 10); s.window.dispatchEvent(new s.window.Event('blur')); s.ev(s.window, 'pointerup', 5, 10, 10); assert.deepEqual(s.log, []); // blur cancels: no tap
  s.g.dispose(); s.ev(s.el, 'pointerdown', 6, 10, 10); s.ev(s.window, 'pointerup', 6, 10, 10); assert.deepEqual(s.log, []);
});
test('2f: bindGesture sets touch-action none (restored on dispose) and filters to the primary button by default (#59)', () => {
  const s = setup(); assert.equal(s.el.style.touchAction, 'none');
  s.ev(s.el, 'pointerdown', 1, 10, 10, { button: 2, pointerType: 'mouse' }); s.g.update(0.016); s.ev(s.window, 'pointerup', 1, 10, 10, { button: 2 });
  assert.deepEqual(s.log, []); // a right-click is no tap
  s.ev(s.el, 'pointerdown', 2, 10, 10, { pointerType: 'mouse' }); s.ev(s.window, 'pointerup', 2, 10, 10); assert.deepEqual(s.log, ['tap']);
  s.g.dispose(); assert.equal(s.el.style.touchAction, '');
  const p = setup({ filter: { pointerType: ['touch'] } });
  p.ev(p.el, 'pointerdown', 1, 10, 10, { pointerType: 'mouse' }); p.ev(p.window, 'pointerup', 1, 10, 10); assert.deepEqual(p.log, []);
  p.ev(p.el, 'pointerdown', 2, 10, 10); p.ev(p.window, 'pointerup', 2, 10, 10); assert.deepEqual(p.log, ['tap']);
});
