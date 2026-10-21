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
