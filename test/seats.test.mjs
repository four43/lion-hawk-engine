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
  assert.deepEqual(ev, [['seat.device', 0, 'pad', 'add'], ['seat.device', 0, 'pad', 'add']]);
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
