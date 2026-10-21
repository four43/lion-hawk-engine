// test/seat-contexts.test.mjs
// [C-10], [C-11]: mapping contexts and each seat's context stack (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, XBOX, WHEEL } from './helpers/seats.mjs';
import { bindHold } from '../src/view/touch.js';
import { checkContext, resolvePad, resolveKeys, mappableOf } from '../src/view/contexts.js';

const DRIVE = {
  pads: [
    { match: p => p.id === WHEEL, bindings: { deadZone: 0, axes: { 0: ['steer', -1], 2: ['gas', 1] } } },
    { match: p => p.mapping === 'standard', bindings: { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn', 7: ['gas', 1] } } },
  ],
  keys: { all: { bindings: { w: ['gas', 1], ' ': 'horn' } } },
};
const BOOST = { pads: [{ match: () => true, bindings: { buttons: { 7: 'horn' } } }] };
const snap = (e, seat) => e.controllerOf(seat).input.snapshot;

test('resolvePad: the first matching entry per context; a higher context keeps an input; a pad nothing matches gets nothing (C-10, C-11)', () => {
  const defs = new Map([['drive', checkContext('drive', DRIVE)], ['boost', checkContext('boost', BOOST)]]);
  const std = { id: XBOX, mapping: 'standard' };
  assert.deepEqual(resolvePad([{ name: 'boost' }, { name: 'drive' }], defs, std).map(r => [r.context, r.bindings.buttons, r.bindings.axes]),
    [['boost', { 7: 'horn' }, {}], ['drive', { 0: 'horn' }, { 0: ['steer', 1] }]]);
  assert.deepEqual(resolvePad([{ name: 'drive' }], defs, { id: 'USB box', mapping: '' }), []);
  assert.equal(resolvePad([{ name: 'drive' }], defs, { id: WHEEL, mapping: '' })[0].bindings.deadZone, 0);
});

test('overrides move a mappable binding, swaps included; a saved input of another kind is skipped (C-12)', () => {
  const def = checkContext('d', {
    pads: [{ match: () => true, bindings: { buttons: { 6: ['brake', 1], 7: ['gas', 1] } }, mappable: { Brake: 'button:6', Gas: 'button:7' } }],
    keys: { all: { bindings: { S: ['brake', 1], w: ['gas', 1] }, mappable: { Brake: 'S' } } },
  });
  const defs = new Map([['d', def]]), st = [{ name: 'd' }], p = { id: XBOX, mapping: 'standard' };
  assert.deepEqual(resolvePad(st, defs, p, { Brake: 'button:7', Gas: 'button:6' })[0].bindings.buttons, { 7: ['brake', 1], 6: ['gas', 1] });
  assert.deepEqual(resolvePad(st, defs, p, { Brake: 'axis:2' })[0].bindings.buttons, { 6: ['brake', 1], 7: ['gas', 1] });
  assert.deepEqual(resolveKeys(st, defs, 'all', { Brake: 'Q' })[0].bindings, { q: ['brake', 1], w: ['gas', 1] });
  assert.equal(mappableOf(defs, { kind: 'pad' }, p, 'Gas'), 'button:7');
  assert.equal(mappableOf(defs, { kind: 'keys', scheme: 'all' }, null, 'Brake'), 's');
  assert.equal(mappableOf(defs, { kind: 'keys', scheme: 'all' }, null, 'Gas'), null);
});

test('checkContext names what is wrong (C-10)', () => {
  assert.throws(() => checkContext('d', { pads: [{ bindings: {} }] }), /context 'd': pads\[0\].match must be a function/);
  assert.throws(() => checkContext('d', { keys: { all: { w: ['gas', 1] } } }), /context 'd': keys.all.bindings must be bindKeyboard bindings/);
  assert.throws(() => checkContext('d', { pads: [{ match: () => true, bindings: { buttons: { 6: 'horn' } }, mappable: { Brake: 'button:7' } }] }),
    /context 'd': pads\[0\] mappable 'Brake' names "button:7", which it does not bind/);
  assert.throws(() => checkContext('d', { touch: {} }), /context 'd': touch must be a function/);
});

test("each seat's pads drive only its own controller, by the first pads entry that matches; an unmatched pad is ignored (C-10)", () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); slots[2] = pad(2, { id: 'USB box', mapping: '', down: [0] });
  frame(); e.stepN(1); frame();
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL }); slots[2] = pad(2, { id: 'USB box', mapping: '' }); frame(); // let go of the joining presses
  slots[0] = pad(0, { down: [7] }); slots[1] = pad(1, { id: WHEEL, axes: [0.5, 0, 1, 0] }); slots[2] = pad(2, { id: 'USB box', mapping: '', down: [0, 7], axes: [1, 1, 1, 1] });
  frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1); assert.equal(snap(e, 0).steer, 0);
  assert.equal(snap(e, 1).gas, 1); assert.equal(snap(e, 1).steer, -0.5);
  assert.deepEqual([snap(e, 2).gas, snap(e, 2).steer, snap(e, 2).horn.down], [0, 0, false], 'no entry matches the USB box');
});

test('the press that pairs a pad is not also a game input (review focus)', () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, false, 'the A that paired seat 0 is not a horn');
  frame(); e.stepN(1); assert.equal(snap(e, 0).horn.down, false, 'still held: still masked');
  slots[0] = pad(0); frame(); slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.pressed, true, 'a new press is input');
  slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame(); e.stepN(1); frame(); e.stepN(1);
  assert.equal(snap(e, 1).horn.down, false, 'a new seat: the joining A held across the controller arriving');
});

test('a higher-priority context keeps an input both bind; removing it gives the input back (C-11)', () => {
  const { e, seats, slots, frame } = setup(), lp = seats.list[0];
  seats.context('drive', DRIVE); seats.context('boost', BOOST);
  lp.contexts.add('drive'); lp.contexts.add('boost', 1);
  assert.deepEqual(lp.contexts.list, ['boost', 'drive']); assert.equal(lp.contexts.has('boost'), true);
  slots[0] = pad(0); frame();
  slots[0] = pad(0, { down: [7] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, true); assert.equal(snap(e, 0).gas, 0);
  lp.contexts.remove('boost'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1); assert.equal(snap(e, 0).horn.down, false);
  assert.throws(() => lp.contexts.add('nope'), /seats: unknown context 'nope' \(declare it with view.context first\)/);
  assert.throws(() => lp.contexts.add('drive', NaN), /seats: context priority must be a finite number/);
});

test('keyboard schemes are devices: two seats on one keyboard (C-8, C-10)', () => {
  const { e, seats, frame, key } = setup();
  seats.context('two', { keys: { wasd: { bindings: { w: ['gas', 1] } }, arrows: { bindings: { ArrowUp: ['gas', 1] } } } });
  seats.enable({ contexts: ['two'] });
  const s0 = seats.list[0];
  assert.deepEqual(s0.devices.map(d => d.scheme ?? d.kind), ['all', 'touch', 'wasd', 'arrows']);
  s0.release(s0.devices[3]);
  key('keydown', 'ArrowUp'); key('keyup', 'ArrowUp'); e.stepN(1); frame();
  const s1 = seats.list[1];
  assert.equal(s1.devices[0].scheme, 'arrows'); assert.equal(s1.pending, false);
  key('keydown', 'ArrowUp'); frame(); e.stepN(1);
  assert.equal(snap(e, 1).gas, 1); assert.equal(snap(e, 0).gas, 0);
  key('keydown', 'w'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1);
});

test('a pad joining seat 0 leaves the held keyboard keys alone (S1)', () => {
  const { e, seats, slots, frame, key } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  key('keydown', 'w'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1);
  slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(seats.list[0].devices.some(d => d.kind === 'pad'), true, 'the pad joined seat 0');
  assert.equal(snap(e, 0).gas, 1, 'w is still held');
  slots[0] = undefined; frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1, 'a lost pad does not drop it either');
  slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1, 'nor a regained one');
});

test('touch: engine => devices is called with the seat input, one device or a list (S6)', () => {
  const { e, seats, slots, frame, window, document } = setup();
  const btn = document.createElement('button'), btn2 = document.createElement('button');
  document.body.appendChild(btn); document.body.appendChild(btn2);
  const seen = [];
  seats.context('hud', { touch: eng => { seen.push(Object.keys(eng)); return bindHold(eng, btn, 'horn'); } });
  seats.context('hud2', { touch: eng => [bindHold(eng, btn2, 'gas'), null] });
  const press = (el, type) => el.dispatchEvent(new window.PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true }));
  seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame(); // seat 0 holds pad 0, seat 1 is open with pad 1
  const s0 = seats.list[0], s1 = seats.list[1], touchDev = s0.devices.find(d => d.kind === 'touch');
  s0.contexts.add('hud'); s1.contexts.add('hud');
  assert.deepEqual(seen, [['input']], 'only seat 0 holds touch; called once with { input }');
  press(btn, 'pointerdown'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, true); assert.equal(snap(e, 1).horn.down, false);
  press(btn, 'pointerup');
  s1.claim(touchDev); frame(); e.stepN(1);
  assert.equal(snap(e, 0).horn.down, false, 'the touch left seat 0');
  press(btn, 'pointerdown'); frame(); e.stepN(1);
  assert.equal(snap(e, 1).horn.down, true, 'it writes seat 1 now');
  press(btn, 'pointerup');
  s1.contexts.add('hud2', 1); press(btn2, 'pointerdown'); frame(); e.stepN(1); // an array return; the top context only
  assert.equal(snap(e, 1).gas, 1);
  press(btn, 'pointerdown'); frame(); e.stepN(1);
  assert.equal(snap(e, 1).horn.down, false, 'hud no longer binds touch');
});

test('a lost pad is not regained by a seat that is leaving (T3)', () => {
  const { e, seats, slots, ev, frame } = setup();
  seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const s1 = seats.list[1]; assert.equal(s1.seat, 1);
  slots[1] = undefined; frame();
  s1.leave();
  slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(ev.some(x => x[0] === 'seat.regained'), false);
  assert.equal(s1.devices.some(d => d.lost), true, 'the leaving seat keeps its lost pad');
});

test('a pad claimed by another seat is cleared from the old seat (T3)', () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  slots[0] = pad(0); slots[1] = pad(1); frame();
  slots[1] = pad(1, { down: [7] }); frame(); e.stepN(1);
  assert.equal(snap(e, 1).gas, 1);
  const p1 = seats.list[1].devices[0];
  seats.list[0].claim(p1); frame(); e.stepN(1);
  assert.equal(snap(e, 1).gas, 0, 'seat 1 does not keep the pad button');
  assert.equal(snap(e, 0).gas, 0, 'the claimed pad is still held: masked on its new seat');
});

test('a released keyboard scheme leaves no held action behind (T3)', () => {
  const { e, seats, frame, key } = setup();
  seats.context('two', { keys: { wasd: { bindings: { w: ['gas', 1] } } } }); seats.enable({ contexts: ['two'] });
  const s0 = seats.list[0], d = s0.devices.find(x => x.scheme === 'wasd');
  key('keydown', 'w'); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 1);
  s0.release(d); frame(); e.stepN(1);
  assert.equal(snap(e, 0).gas, 0);
});
