import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPointer, createEngine, defineGame } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';

const setup = (o = {}) => {
  const { window, document } = dom(), got = [];
  const engine = createEngine(defineGame({ id: 'p', start: 's', scenes: { s: {} }, commands: { tool: (e, d) => got.push(d) } }));
  const el = document.createElement('canvas'); document.body.appendChild(el);
  const ev = (t, type, id, x = 0, y = 0, extra = {}) => t.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0, ...extra }));
  const p = bindPointer(engine, { surface: el, type: 'tool', at: (x, y) => ({ x: x / 10, z: y / 10 }), doc: document, ...o });
  const phases = () => { engine.stepN(1); return got.splice(0).map(d => d.phase); };
  return { window, document, engine, el, ev, p, got, phases };
};

test('2d: down, coalesced moves, up and tap become commands with world points (#5)', () => {
  const s = setup();
  s.ev(s.el, 'pointerdown', 1, 100, 200); s.ev(s.window, 'pointermove', 1, 102, 201); s.ev(s.window, 'pointermove', 1, 104, 202);
  s.p.update(0.016); s.engine.stepN(1);
  assert.deepEqual(s.got.map(d => [d.phase, d.x, d.z]), [['down', 10, 20], ['move', 10.4, 20.2]]);
  assert.equal(s.got[0].pointer, 1); assert.equal(s.got[0].kind, 'touch'); s.got.length = 0;
  s.p.update(0.016); s.ev(s.window, 'pointerup', 1, 104, 202);
  assert.deepEqual(s.phases(), ['up', 'tap']); // no move: the position did not change since the last update
});
test('2d: holding still sends one press and no tap; moving past tap.move loses the tap', () => {
  const s = setup({ press: 0.75 });
  s.ev(s.el, 'pointerdown', 1, 50, 50); for (let i = 0; i < 50; i++) s.p.update(0.016);
  s.ev(s.window, 'pointerup', 1, 50, 50); assert.deepEqual(s.phases(), ['down', 'press', 'up']);
  s.ev(s.el, 'pointerdown', 2, 50, 50); s.ev(s.window, 'pointermove', 2, 90, 50); s.p.update(0.016);
  s.ev(s.window, 'pointerup', 2, 90, 50); assert.deepEqual(s.phases(), ['down', 'move', 'up']);
  s.ev(s.el, 'pointerdown', 3, 50, 50); s.p.update(0.5); s.ev(s.window, 'pointerup', 3, 50, 50);
  assert.deepEqual(s.phases(), ['down', 'up']); // held 0.5 s: too long for a tap, too short for the press
});
test('2d: filters, ignored targets, at() null and a second finger', () => {
  const s = setup({ filter: { pointerType: ['mouse'], button: [0] } });
  s.ev(s.el, 'pointerdown', 1, 10, 10); s.ev(s.el, 'pointerdown', 2, 10, 10, { pointerType: 'mouse', button: 2 });
  const b = s.document.createElement('button'); s.document.body.appendChild(b); s.ev(b, 'pointerdown', 3, 10, 10, { pointerType: 'mouse' });
  assert.deepEqual(s.phases(), []); s.p.dispose();
  const t = setup({ at: x => (x < 50 ? null : { x }) });
  t.ev(t.el, 'pointerdown', 1, 10, 10); t.ev(t.window, 'pointerup', 1, 10, 10); assert.deepEqual(t.phases(), []);
  t.ev(t.el, 'pointerdown', 2, 60, 10); t.ev(t.el, 'pointerdown', 3, 70, 10); t.ev(t.window, 'pointermove', 3, 80, 10); t.p.update(0.016);
  t.ev(t.window, 'pointerup', 3, 80, 10); t.ev(t.window, 'pointerup', 2, 60, 10); t.p.update(0.016);
  assert.deepEqual(t.phases(), ['down', 'cancel']);
  t.ev(t.el, 'pointerdown', 4, 60, 10); assert.deepEqual(t.phases(), ['down']); // all lifted: a new press starts
  t.p.dispose(); t.ev(t.window, 'pointerup', 4, 60, 10); assert.deepEqual(t.phases(), []);
});
test('2d: argument checks, cancel on blur, edge', () => {
  const s = setup();
  assert.throws(() => bindPointer(s.engine, { surface: s.el, at: () => ({}) }), /type required/);
  assert.throws(() => bindPointer(s.engine, { surface: s.el, type: 't' }), /at must be a function/);
  s.ev(s.el, 'pointerdown', 1, 50, 50); s.window.dispatchEvent(new s.window.Event('blur')); s.ev(s.window, 'pointerup', 1, 50, 50);
  assert.deepEqual(s.phases(), ['down', 'cancel']);
  const e = setup({ edge: 30 }); e.ev(e.el, 'pointerdown', 1, 10, 50); assert.deepEqual(e.phases(), []);
});
