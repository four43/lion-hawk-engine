// #109: bindGesture times presses on the pointer events' clock (event.timeStamp; now() for the hold while the finger is
// down), not on summed frame time, so a tap at ~2 fps (570 ms frames on SwiftShader's iPad preset) stays a tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGesture, createEngine, defineGame } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';

const setup = (o = {}) => {
  const { window, document } = dom(), log = [], clock = { t: 0 };
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const ev = (t, type, id, ts) => { // ts: the event's timeStamp (undefined: none)
    const e = new window.PointerEvent(type, { pointerId: id, clientX: 10, clientY: 10, bubbles: true, cancelable: true, pointerType: 'touch', button: 0 });
    Object.defineProperty(e, 'timeStamp', { value: ts }); t.dispatchEvent(e);
  };
  const g = bindGesture(engine, el, { tap: () => log.push('tap'), hold: { seconds: 1, fire: () => log.push('hold') }, doc: document, now: () => clock.t, ...o });
  const frame = ms => { const raw = (ms - clock.t) / 1000; clock.t = ms; g.update(Math.min(raw, 0.25), raw); }; // a rAF at ms
  return { window, el, ev, g, log, clock, frame };
};

test('#109: at 570 ms frames, a 140 ms tap that lands at a frame\'s end stays a tap, even when its lift is seen late', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 560); // down 10 ms before the frame at 570
  s.frame(570); s.frame(1140); // frame time would count 1.14 s; the event clock says 580 ms
  s.ev(s.window, 'pointerup', 1, 700); // the lift happened at 700 and was dispatched after the frame at 1140
  assert.deepEqual(s.log, ['tap']);
});

test('#109: a real hold at 570 ms frames fires once, on the first frame 1 s past the down', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 0);
  s.frame(570); assert.deepEqual(s.log, []);
  s.frame(1140); assert.deepEqual(s.log, ['hold']);
  s.frame(1710); s.ev(s.window, 'pointerup', 1, 1800);
  assert.deepEqual(s.log, ['hold']); // once, and no tap after it
});

test('#109: a 600 ms press is neither a tap nor a hold', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 0); s.frame(300); s.frame(600); s.ev(s.window, 'pointerup', 1, 600);
  assert.deepEqual(s.log, []);
});

test('#109: uncapped is ignored: capped frame time does not stretch a hold', () => {
  const s = setup({ uncapped: false });
  s.ev(s.el, 'pointerdown', 1, 0); s.frame(570); s.frame(1140);
  assert.deepEqual(s.log, ['hold']);
});

test('#109: an event without a timeStamp starts its press at now(); a non-function now throws', () => {
  const s = setup();
  s.clock.t = 100; s.ev(s.el, 'pointerdown', 1, undefined);
  s.frame(1050); assert.deepEqual(s.log, []);
  s.frame(1100); assert.deepEqual(s.log, ['hold']);
  const { document } = dom(), el = document.createElement('div');
  assert.throws(() => bindGesture(createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } })), el, { doc: document, now: 5 }), /bindGesture: now must be a function/);
});
