// test/seats.test.mjs
// [C-5]–[C-9]: seats, devices, native pads, pairing, loss and regain (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, XBOX, WHEEL } from './helpers/seats.mjs';

test('without enable() one seat holds every device: keyboard, touch and each pad as it appears (C-5, C-6)', () => {
  const { e, seats, slots, ev, frame } = setup();
  assert.equal(seats.list.length, 1);
  const lp = seats.list[0];
  assert.equal(lp.seat, 0); assert.equal(lp.controller, e.controllerOf(0)); assert.equal(lp.pending, false);
  assert.deepEqual(lp.devices, [{ kind: 'keys', scheme: 'all' }, { kind: 'touch' }]);
  slots[0] = pad(0); frame();
  slots[2] = pad(2, { id: WHEEL }); frame();
  assert.deepEqual(lp.devices.slice(2).map(d => [d.kind, d.index, d.id, d.lost]), [['pad', 0, XBOX, false], ['pad', 2, WHEEL, false]]);
  assert.deepEqual(ev, [['seat.seen', null, 'pad'], ['seat.device', 0, 'pad', 'add'], ['seat.seen', null, 'pad'], ['seat.device', 0, 'pad', 'add']]);
});

test("lp.pads and lp.pad are this frame's Gamepad objects; lp.pad is the pad pressed last (C-7)", () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1); frame();
  assert.equal(lp.pads[0], slots[0]); assert.equal(lp.pads[1], slots[1]); assert.equal(lp.pad, slots[0], 'no press yet: the first pad');
  slots[0] = pad(0); slots[1] = pad(1, { down: [0] }); frame(); // new snapshot objects every poll
  assert.equal(lp.pads[0], slots[0]); assert.equal(lp.pad, slots[1]);
  slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(lp.pad, slots[1], "still the pad used last, as this frame's object");
  slots[0] = pad(0, { axes: [0, 0.8, 0, 0] }); frame();
  assert.equal(lp.pad, slots[0], 'an axis past JOIN_AXIS counts as use');
});

test('a pad gone from its slot, disconnected or replaced by another product is lost; the seat keeps its controller (C-9)', () => {
  const { e, seats, slots, ev, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1); slots[2] = pad(2); frame();
  const [a, b, c] = lp.devices.slice(2); ev.length = 0;
  slots[0] = null; slots[1] = { ...pad(1), connected: false }; frame();
  assert.deepEqual([a.lost, b.lost, c.lost], [true, true, false]);
  assert.equal(lp.lost, true); assert.equal(lp.controller, e.controllerOf(0));
  assert.deepEqual(ev, [['seat.lost', 0, 'pad'], ['seat.lost', 0, 'pad']]);
  slots[2] = pad(2, { id: WHEEL }); frame(); // unplugged and another product in the same slot between two polls
  assert.equal(c.lost, true);
  assert.equal(lp.pads.length, 1); assert.equal(lp.pads[0], slots[2]);
  assert.equal(ev.filter(x => x[0] === 'seat.lost').length, 3);
});

test('seats write nothing to any input by themselves: a game without contexts keeps its own devices (review focus)', () => {
  const { e, slots, frame } = setup();
  e.input.device = () => assert.fail("seats wrote seat 0's input");
  e.input.clearDevice = () => assert.fail('seats cleared a source');
  slots[0] = pad(0, { down: [0], axes: [1, 0, 0, 0] }); frame();
  slots[0] = null; frame();
});

test('an axis resting past JOIN_AXIS is not a press when first seen; moving away from rest is (S4)', () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0, { axes: [0, 0, -1, 0] }); frame();
  slots[1] = pad(1); frame();
  assert.equal(lp.pad, slots[0], 'no press yet: the first pad');
  slots[1] = pad(1, { axes: [0, 0, 0, 0] }); slots[0] = pad(0, { axes: [0, 0, -1, 0] }); frame();
  assert.equal(lp.pad, slots[0], 'a resting axis at -1 is not use');
  slots[1] = pad(1, { axes: [0, 0, 1, 0] }); frame();
  assert.equal(lp.pad, slots[1], 'moving an axis past JOIN_AXIS from its own rest is use');
  slots[0] = pad(0, { axes: [0, 0, 1, 0] }); frame(); // -1 -> +1 from rest -1 is a move of 2
  assert.equal(lp.pad, slots[0]);
});

test('with enable(), a pad joins on its first press: seat 0 while it has no pad, then a new seat (C-8)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0); frame();
  assert.equal(seats.list[0].devices.length, 2, 'seen without a press: unpaired');
  slots[0] = pad(0, { down: [0] }); frame();
  assert.equal(seats.list[0].devices[2].index, 0);
  slots[1] = pad(1, { down: [9] }); frame();
  const lp = seats.list[1];
  assert.equal(lp.seat, 1); assert.equal(lp.pending, true); assert.equal(lp.controller, null); assert.equal(lp.devices[0].index, 1);
  assert.equal(e.controllerOf(1), undefined, 'the sim has not run the command yet');
  frame(); assert.equal(lp.pending, true, 'frames alone do not make the controller');
  e.stepN(1); frame();
  assert.equal(lp.pending, false); assert.equal(lp.controller, e.controllerOf(1)); assert.equal(lp.controller.player, 2);
  assert.deepEqual(ev.filter(x => x[0] === 'seat.joined'), [['seat.joined', 1, null]]);
});

test('join decides: a seat number adds to that seat (opening it), null ignores, a bad answer throws; once per press (C-8)', () => {
  const asked = [], { seats, slots, frame } = setup();
  seats.enable({ max: 3, join: dev => { asked.push(dev.index); return dev.index === 0 ? null : dev.index < 3 ? 2 : 7; } });
  slots[0] = pad(0, { down: [0] }); frame(); frame();
  assert.deepEqual(asked, [0], 'a held button is one press'); assert.equal(seats.list.length, 1);
  slots[0] = pad(0); frame(); slots[0] = pad(0, { down: [0] }); frame();
  assert.deepEqual(asked, [0, 0], 'a new press asks again');
  slots[1] = pad(1, { down: [0] }); slots[2] = pad(2, { down: [1] }); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0, 2]); assert.deepEqual(seats.list[1].devices.map(d => d.index), [1, 2]);
  slots[3] = pad(3, { down: [0] });
  assert.throws(frame, /seats: join must return a seat number in 0..2, 'new' or null/);
  assert.throws(() => seats.enable({ max: 0 }), /seats: max must be an integer in 1..16/);
  assert.throws(() => seats.enable({ join: 'new' }), /seats: join must be a function/);
});

test('the default join opens seats until max, then ignores presses (C-8)', () => {
  const { e, seats, slots, frame } = setup(); seats.enable({ max: 2 });
  for (let i = 0; i < 3; i++) slots[i] = pad(i, { down: [0] });
  frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.devices.filter(d => d.kind === 'pad').map(d => d.index)]), [[0, [0]], [1, [1]]]);
  e.stepN(1); frame();
  assert.equal(e.controllers.filter(c => c.seat !== null).length, 2);
});

test('leave: lh.seat leave runs, the seat goes with its controller and its pads become unpaired; seat 0 never leaves (C-5)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const lp = seats.list[1], dev = lp.devices[0];
  lp.leave(); frame();
  assert.equal(seats.list.length, 2, 'still there until the sim has run the command');
  e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0]); assert.equal(e.controllerOf(1), undefined);
  assert.deepEqual(ev.slice(-2), [['seat.device', 1, 'pad', 'remove'], ['seat.left', 1, null]]);
  slots[1] = pad(1); frame(); slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(seats.list[1].devices[0], dev, 'the same pad joins again on a new press');
  assert.throws(() => seats.list[0].leave(), /seats: seat 0 never leaves/);
});

test('a seat that leaves before its controller exists never binds and goes once the sim has run both commands (review focus)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame();
  const lp = seats.list[1]; assert.equal(lp.pending, true);
  lp.leave(); frame();
  assert.equal(seats.list.includes(lp), true, 'kept until the sim has run the commands');
  e.stepN(1); frame();
  assert.equal(seats.list.includes(lp), false); assert.equal(lp.controller, null); assert.equal(e.controllerOf(1), undefined);
  assert.equal(ev.some(x => x[0] === 'seat.joined'), false);
  assert.deepEqual(ev.slice(-2), [['seat.device', 1, 'pad', 'remove'], ['seat.left', 1, null]]);
});

test('a seat the sim opens or closes by itself is followed by the view (C-5)', () => {
  const { e, seats, ev, frame } = setup(); seats.enable();
  e.command('lh.seat', { op: 'join', seat: 3 }); e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.pending, s.controller === e.controllerOf(s.seat)]), [[0, false, true], [3, false, true]]);
  e.command('lh.seat', { op: 'leave', seat: 3 }); e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => s.seat), [0]);
  assert.deepEqual(ev, [['seat.joined', 3, null], ['seat.left', 3, null]]);
});

test('regain: a press goes to the seat that lost a pad with the same id, at any index, before an older loss (C-9)', () => {
  const { e, seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); slots[2] = pad(2, { down: [0] }); frame(); e.stepN(1); frame();
  const wheel = seats.list[1].devices[0], second = seats.list[2].devices[0];
  slots[1] = null; frame(); slots[2] = null; frame();
  assert.deepEqual([wheel.lost, second.lost, seats.list[1].lost, seats.list[2].lost], [true, true, true, true]);
  slots[1] = pad(1, { down: [0] }); frame(); // an Xbox pad lands on the wheel's old index
  assert.equal(second.lost, false, 'same id wins over the older loss'); assert.equal(second.index, 1);
  assert.equal(seats.list[2].pad, slots[1]); assert.equal(wheel.lost, true);
  assert.deepEqual(ev.at(-1), ['seat.regained', 2, 'pad']);
  assert.equal(e.controllerOf(2).player, 3, 'the seat kept its player');
});

test('with the default join and no same-id pad, a press fills the seat whose pad was lost first (C-9)', () => {
  const { e, seats, slots, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); slots[2] = pad(2, { down: [0] }); frame(); e.stepN(1); frame();
  const a = seats.list[1].devices[0], b = seats.list[2].devices[0];
  slots[2] = null; frame(); slots[1] = null; frame(); // b (seat 2) lost first
  slots[5] = pad(5, { id: WHEEL, down: [0] }); frame();
  assert.equal(b.lost, false); assert.equal(b.id, WHEEL); assert.equal(b.index, 5);
  assert.equal(a.lost, true); assert.equal(seats.list.length, 3, 'no new seat');
});

test("index reuse: another product on a held pad's index is lost-and-new, and pairs only on a press (review focus)", () => {
  const { seats, slots, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); frame();
  const xbox = seats.list[0].devices[2];
  slots[0] = pad(0, { id: WHEEL }); frame(); // unplug and replug of another pad between two polls
  assert.equal(xbox.lost, true); assert.equal(seats.list[0].pads.length, 0, 'the wheel is not silently the old pad');
  slots[0] = pad(0, { id: WHEEL, down: [3] }); frame();
  assert.equal(xbox.lost, false); assert.equal(xbox.id, WHEEL, 'a press fills the seat with the lost pad');
});

test('without enable(), a pad that comes back returns to seat 0 as the same device (C-9)', () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); frame(); const dev = lp.devices[2];
  slots[0] = null; frame(); slots[2] = pad(2); frame();
  assert.equal(dev.lost, false); assert.equal(dev.index, 2); assert.equal(lp.devices.length, 3);
});

test('claim and release move devices by hand; a released keyboard joins on its next key (C-8)', () => {
  const { e, seats, slots, ev, frame, key } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const [s0, s1] = seats.list, keys = s0.devices[0], p0 = s0.devices[2];
  s1.claim(p0);
  assert.deepEqual(s1.devices.map(d => d.index), [1, 0]); assert.equal(s0.devices.includes(p0), false);
  assert.deepEqual(ev.slice(-2), [['seat.device', 0, 'pad', 'remove'], ['seat.device', 1, 'pad', 'add']]);
  assert.throws(() => s0.release(p0), /seats: seat 0 does not hold that device/);
  assert.throws(() => s0.claim({ kind: 'pad', index: 9 }), /seats: claim needs a device from this page/);
  s0.release(keys);
  assert.deepEqual(seats.unpaired(), [keys]);
  key('keydown', 'w');
  assert.equal(seats.list.at(-1).seat, 2); assert.deepEqual(seats.list.at(-1).devices, [keys]);
});

test('a pad lost at index i regains by id when the same product reappears at i; another product there is a new device (C-9)', () => {
  const { seats, slots, frame } = setup(); seats.enable();
  slots[3] = pad(3, { down: [0] }); frame();
  const dev = seats.list[0].devices[2];
  slots[3] = null; frame(); assert.equal(dev.lost, true);
  slots[3] = pad(3, { down: [0] }); frame();
  assert.equal(dev.lost, false); assert.equal(dev.index, 3); assert.equal(seats.list[0].devices.length, 3, 'same device, not a fresh one');
  slots[3] = null; frame();
  slots[3] = pad(3, { id: WHEEL }); frame(); // different id, no press: a new unpaired device, the lost one waits
  assert.equal(dev.lost, true); assert.equal(seats.list[0].devices.length, 3);
  assert.equal(seats.unpaired().length, 1); assert.equal(seats.unpaired()[0].id, WHEEL);
});

test('a join hook naming a leaving seat attaches nothing: the pad stays unpaired (C-8)', () => {
  let to = 'new';
  const { e, seats, slots, frame } = setup(); seats.enable({ join: () => to });
  slots[0] = pad(0, { down: [0] }); frame(); e.stepN(1); frame();
  const lp = seats.list[1]; lp.leave();
  to = 1; slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(lp.devices.length, 1, 'only its own pad'); assert.equal(seats.unpaired().length, 1);
  assert.equal(seats.unpaired()[0].index, 1);
});

test('a game device kind: units pair on a press, write their values on their seat, are lost when gone and come back by id (C-6, C-9)', () => {
  const { e, seats, frame } = setup(); seats.enable({ join: () => 0 });
  let units = [];
  seats.kind('pedals', { read: () => units });
  units = [{ key: 'hid-1', id: 'Fanatec CSL', active: false, values: { gas: 0.3 } }]; frame();
  assert.deepEqual(seats.unpaired().map(d => [d.kind, d.key]), [['pedals', 'hid-1']], 'listed but not pressed: unpaired');
  units = [{ key: 'hid-1', id: 'Fanatec CSL', active: true, values: { gas: 0.6 } }]; frame(); e.stepN(1);
  const dev = seats.list[0].devices.find(d => d.kind === 'pedals');
  assert.equal(e.input.snapshot.gas, 0.6);
  units = []; frame(); e.stepN(1);
  assert.equal(dev.lost, true); assert.equal(seats.list[0].lost, true); assert.equal(e.input.snapshot.gas, 0, 'its source is cleared');
  units = [{ key: 'hid-7', id: 'Fanatec CSL', active: true, values: { gas: 1 } }]; frame(); e.stepN(1);
  assert.equal(dev.lost, false); assert.equal(dev.key, 'hid-7'); assert.equal(e.input.snapshot.gas, 1);
  assert.throws(() => seats.kind('pad', { read() {} }), /seats.device: kind must be a new name \('pad', 'keys' and 'touch' are built in\)/);
  assert.throws(() => seats.kind('pedals', { read() {} }), /seats.device: kind 'pedals' is already registered/);
  assert.throws(() => seats.kind('wheel', {}), /seats.device: kind 'wheel' needs read\(\)/);
});

test('a game device kind: releasing a held unit clears its source (C-6)', () => {
  const { e, seats, frame } = setup(); seats.enable({ join: () => 0 });
  const units = [{ key: 'h', id: 'X', active: true, values: { gas: 0.5 } }];
  seats.kind('pedals', { read: () => units });
  frame(); e.stepN(1);
  const dev = seats.list[0].devices.find(d => d.kind === 'pedals');
  assert.equal(e.input.snapshot.gas, 0.5);
  seats.list[0].release(dev); frame(); e.stepN(1);
  assert.equal(e.input.snapshot.gas, 0, 'a unit that left its seat writes nothing');
});

test('a game device kind: an unknown action is reported once, skips that write, and recovers (C-6)', () => {
  const errs = [], { e, seats, frame } = setup({ onError: x => errs.push(x.message) }); seats.enable({ join: () => 0 });
  let values = { gas: 0.5 };
  seats.kind('pedals', { read: () => [{ key: 'h', id: 'X', active: true, values }] });
  frame(); e.stepN(1); assert.equal(e.input.snapshot.gas, 0.5);
  values = { gas: 0.9, nope: 1 }; frame(); frame(); e.stepN(1);
  assert.deepEqual(errs, ["seats.device: kind 'pedals' unit: wrote unknown action 'nope'"], 'reported once');
  assert.equal(e.input.snapshot.gas, 0, 'the bad frame writes nothing');
  values = { gas: 0.7 }; frame(); e.stepN(1);
  assert.equal(e.input.snapshot.gas, 0.7, 'valid values are written again'); assert.equal(errs.length, 1);
});

test('a game device kind: a bad kind does not stop the other seats; bad units are skipped (C-6)', () => {
  const errs = [], { e, seats, slots, frame } = setup({ onError: x => errs.push(x.message) }); seats.enable({ join: () => 0 });
  seats.kind('broken', { read: () => { throw new Error('boom'); } });
  seats.kind('mixed', { read: () => [null, { key: undefined, active: true, values: { gas: 1 } }, { key: 'a', id: 'A', active: true, values: { gas: 0.4 } }, { key: 'a', id: 'B', active: true, values: { gas: 1 } }] });
  seats.kind('nonarray', { read: () => 5 });
  slots[0] = pad(0, { down: [0] });
  frame(); frame(); e.stepN(1);
  assert.equal(e.input.snapshot.gas, 0.4, 'the valid unit drives, the first of two equal keys wins');
  assert.deepEqual(seats.list[0].devices.filter(d => d.kind === 'mixed').map(d => d.key), ['a']);
  assert.deepEqual(errs, ["seats.device: kind 'broken' failed: boom", "seats.device: kind 'nonarray' failed: read() must return an array"], 'each reported once');
  assert.equal(seats.list[0].pad !== null, true, 'the pad seat is still served');
});

test('a failing kind read() clears its held unit each frame without losing it, and recovers (C-6, Task 6 carry)', () => {
  const { e, seats, frame } = setup({ onError: () => {} }); seats.enable({ join: () => 0 });
  let fail = false;
  seats.kind('pedals', { read: () => { if (fail) throw new Error('boom'); return [{ key: 'h', id: 'X', active: true, values: { gas: 1 } }]; } });
  frame(); e.stepN(1); assert.equal(e.controllerOf(0).input.snapshot.gas, 1);
  const dev = seats.list[0].devices.find(d => d.kind === 'pedals');
  fail = true; frame(); e.stepN(1);
  assert.equal(e.controllerOf(0).input.snapshot.gas, 0, 'no stuck throttle'); assert.equal(dev.lost, false); assert.equal(seats.list[0].lost, false);
  fail = false; frame(); e.stepN(1);
  assert.equal(e.controllerOf(0).input.snapshot.gas, 1, 'the unit drives again'); assert.equal(dev.lost, false);
});

// final review fixes (plan 2): axis anchors, late enable, seats.gamepad, seat.seen, leaving claims, custom-join regain
const hold = (frame, n, set) => { for (let i = 0; i < n; i++) { set(); frame(); } };

test('a pedal that rests at -1 for 10 still polls re-anchors there: a press to +1 is an edge for capture and lp.pad (final review 1a, plan 4 Task 1)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  const wheel = axes => pad(1, { id: WHEEL, axes });
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0, 0]); frame();
  hold(frame, 11, () => { slots[0] = pad(0); slots[1] = wheel([0, 0, -1, 0]); }); // the move to -1, then 10 still polls
  slots[0] = pad(0, { down: [0] }); slots[1] = wheel([0, 0, -1, 0]); frame();
  assert.equal(lp.pad, slots[0]);
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = wheel([0, 0, 1, 0]); frame();
  assert.equal(lp.pad, slots[1], 'lp.pad follows the pedal');
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:2' });
});

test('an exact-0 axis (a d-pad on axes, or one Firefox has not reported) presses on its first push; its release is no press (plan 4 Task 1, review focus)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL }); frame(); // every axis reads exactly 0
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL }); frame();
  assert.equal(lp.pad, slots[0]);
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = pad(1, { id: WHEEL, axes: [0, 0, 0, 1] }); frame(); // the hat's first push
  assert.equal(lp.pad, slots[1], 'the first push is use');
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:3' });
  let got; lp.bindings.capture().then(v => { got = v; });
  slots[1] = pad(1, { id: WHEEL }); frame(); await null;
  assert.equal(got, undefined, 'letting the hat go is not a press');
  lp.bindings.cancel(); await null;
  assert.equal(got, null);
});

test("a pedal's first touch from an unreported 0 is a press (plan 4 Task 1)", async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  const wheel = axes => pad(1, { id: WHEEL, axes });
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0, 0]); frame();
  slots[0] = pad(0, { down: [0] }); slots[1] = wheel([0, 0, 0, 0]); frame();
  const p = lp.bindings.capture();
  slots[0] = pad(0); slots[1] = wheel([0, 0, 0.8, 0]); frame();
  assert.equal(lp.pad, slots[1]);
  assert.deepEqual(await p, { device: lp.devices[3], input: 'axis:2' });
});

test('an axis held 12 polls and then released leaves a pending capture() unresolved (plan 4 Task 1, review focus)', async () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0); frame();
  hold(frame, 12, () => { slots[0] = pad(0, { axes: [1, 0, 0, 0] }); }); // pushed, then held still: re-anchored at +1
  let got; lp.bindings.capture().then(v => { got = v; });
  slots[0] = pad(0); frame(); await null;
  assert.equal(got, undefined, 'the release toward centre is not an edge');
  slots[0] = pad(0, { axes: [-1, 0, 0, 0] }); frame(); await null;
  assert.deepEqual(got, { device: lp.devices[2], input: 'axis:0' }, 'a push past centre to the other side is');
});

test('a trigger held at +1 on first sight, released to -1 and left there re-anchors, so a later press is an edge (final review 1b)', () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0, { axes: [0.01, 0.01, 1, 0.01] }); slots[1] = pad(1); frame();
  hold(frame, 12, () => { slots[0] = pad(0, { axes: [0.01, 0.01, -1, 0.01] }); slots[1] = pad(1); });
  slots[0] = pad(0, { axes: [0.01, 0.01, -1, 0.01] }); slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(lp.pad, slots[1]);
  slots[0] = pad(0, { axes: [0.01, 0.01, 1, 0.01] }); slots[1] = pad(1); frame();
  assert.equal(lp.pad, slots[0], 'the press from the learned rest is use');
});

test('a pad whose axes array grows anchors each new axis at its first reading (final review 1c)', () => {
  const { seats, slots, frame } = setup(), lp = seats.list[0];
  slots[0] = pad(0, { axes: [] }); slots[1] = pad(1); frame();
  slots[0] = pad(0, { axes: [] }); slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(lp.pad, slots[1]);
  slots[0] = pad(0, { axes: [0.01, 0.01, -1, 0.01] }); slots[1] = pad(1); frame();
  assert.equal(lp.pad, slots[1], 'a new axis at -1 is resting, not pressed');
  slots[0] = pad(0, { axes: [0.01, 0.01, 1, 0.01] }); slots[1] = pad(1); frame();
  assert.equal(lp.pad, slots[0], 'a move from that anchor is use');
});

test('enable() after boot: seat 0 keeps its last-used pad; every other pad is released and joins through join (final review 2)', () => {
  const { e, seats, slots, frame } = setup(), s0 = seats.list[0];
  seats.context('drive', { pads: [{ match: () => true, bindings: { buttons: { 7: ['gas', 1] } } }] }); s0.contexts.add('drive');
  slots[0] = pad(0); slots[1] = pad(1); frame();
  slots[0] = pad(0); slots[1] = pad(1, { down: [7] }); frame(); e.stepN(1);
  assert.equal(e.input.snapshot.gas, 1, 'pad 1 drives seat 0 before enable');
  const [p0, p1] = s0.devices.filter(d => d.kind === 'pad');
  slots[0] = pad(0, { down: [3] }); slots[1] = pad(1, { down: [7] }); frame(); // pad 0 is used last; pad 1 still holds gas
  seats.enable({}); frame(); e.stepN(1);
  assert.deepEqual(s0.devices.filter(d => d.kind === 'pad'), [p0], 'seat 0 keeps only pad 0');
  assert.deepEqual(seats.unpaired(), [p1]);
  assert.equal(e.input.snapshot.gas, 0, "the released pad's held input is cleared");
  slots[1] = pad(1); frame(); slots[1] = pad(1, { down: [0] }); frame();
  assert.equal(seats.list[1]?.seat, 1); assert.equal(seats.list[1].pending, true);
  e.stepN(1); frame();
  assert.equal(seats.list[1].pending, false); assert.deepEqual(seats.list[1].devices, [p1]);
  assert.deepEqual(s0.devices.filter(d => d.kind === 'pad'), [p0]);
});

test('enable() after boot with no press yet: seat 0 keeps its first pad (final review 2)', () => {
  const { e, seats, slots, frame } = setup(), s0 = seats.list[0];
  slots[0] = pad(0); slots[1] = pad(1); frame();
  const [p0, p1] = s0.devices.filter(d => d.kind === 'pad');
  seats.enable({});
  assert.deepEqual(s0.devices.filter(d => d.kind === 'pad'), [p0]); assert.deepEqual(seats.unpaired(), [p1]);
  slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.pending, s.devices.filter(d => d.kind === 'pad').map(d => d.index)]), [[0, false, [0]], [1, false, [1]]]);
});

test('seats.gamepad(dev) is the live Gamepad of a paired or unpaired pad, else null; seat.seen fires once per pad (final review 3)', () => {
  const { seats, slots, ev, frame } = setup(); seats.enable();
  slots[0] = pad(0); frame();
  const [dev] = seats.unpaired().filter(d => d.kind === 'pad');
  assert.equal(seats.gamepad(dev), slots[0], 'unpaired');
  slots[0] = pad(0, { down: [0] }); frame();
  assert.equal(seats.list[0].devices[2], dev); assert.equal(seats.gamepad(dev), slots[0], "paired: this frame's Gamepad");
  assert.equal(seats.gamepad(seats.list[0].devices[0]), null, 'a keyboard has no Gamepad');
  assert.equal(seats.gamepad({ kind: 'pad', index: 0 }), null, 'not a device of this page');
  slots[0] = null; frame(); assert.equal(seats.gamepad(dev), null, 'lost');
  slots[0] = pad(0); frame(); slots[1] = pad(1, { id: WHEEL }); frame();
  assert.deepEqual(ev.filter(x => x[0] === 'seat.seen'), [['seat.seen', null, 'pad'], ['seat.seen', null, 'pad']], 'index 0 with the same id is not seen twice');
});

test('seat.seen fires before the device is used, with a device gamepad() can read (final review 3)', () => {
  const { seats, slots, frame } = setup(), got = [];
  seats.on(x => { if (x.type === 'seat.seen') got.push(seats.gamepad(x.device)); });
  slots[0] = pad(0); frame();
  assert.deepEqual(got, [slots[0]]);
});

test('claim on a seat that is leaving throws (final review 5)', () => {
  const { e, seats, slots, frame } = setup(); seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const s1 = seats.list[1]; s1.leave();
  assert.throws(() => s1.claim(seats.list[0].devices[0]), /seats: seat 1 is leaving/);
});

test('with a custom join, only a pad with the same id regains a lost seat directly; another id goes through join (final review 6)', () => {
  const asked = [];
  const { e, seats, slots, ev, frame } = setup(); seats.enable({ join: dev => { asked.push(dev.id); return dev.index === 0 ? 0 : 'new'; } });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const lost = seats.list[1].devices[0]; asked.length = 0;
  slots[1] = null; frame();
  slots[4] = pad(4, { id: WHEEL, down: [0] }); frame();
  assert.deepEqual(asked, [WHEEL], 'the wheel asked join'); assert.equal(lost.lost, true);
  assert.equal(ev.some(x => x[0] === 'seat.regained'), false);
  slots[5] = pad(5, { down: [0] }); frame();
  assert.deepEqual(asked, [WHEEL], 'the same id regains without asking'); assert.equal(lost.lost, false); assert.equal(lost.index, 5);
});
