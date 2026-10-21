// test/seats-net.test.mjs
// Plan 2's M4 (carried to plan 3, Task 6): a seat the room refuses online does not stay pending. The host's own refused seat has no
// controller to wait for: the view hears player.refused, drops the seat and leaves its pad unpaired (it may press again).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mp } from '../testing/index.js';
import { createSeats } from '../src/view/seats.js';
import { seatsGame } from './net/fixtures/seats.js';
import { pad } from './helpers/seats.mjs';
import { dom } from './helpers/dom.mjs';

const view = engine => {
  const { window, document } = dom(), slots = [], ev = [];
  const seats = createSeats(engine, { getGamepads: () => slots, target: window, doc: document, storage: null });
  seats.on(x => ev.push([x.type, x.seat])); seats.enable();
  return { seats, slots, ev, frame: () => seats.update(1 / 60, 1 / 60) };
};

test('a seat the host refuses online is dropped, not left pending; its pad is unpaired (M4, N-19)', () => {
  const w = mp(seatsGame({ maxSeats: 1 }), { peers: 2 }); w.seconds(1);
  const { seats, slots, ev, frame } = view(w.host.engine);
  slots[0] = pad(0, { down: [0] }); frame(); // seat 0 has no pad: it takes this one
  slots[1] = pad(1, { down: [0] }); frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.pending]), [[0, false], [1, true]]);
  w.step(1); frame();
  assert.equal(w.host.engine.controllerOf(1), undefined, 'maxSeats 1: the host\'s seat 1 is refused');
  assert.deepEqual(seats.list.map(s => s.seat), [0], 'the refused seat went');
  assert.deepEqual(seats.unpaired().filter(d => d.kind === 'pad').map(d => d.index), [1]);
  assert.deepEqual(ev.filter(x => x[0] === 'seat.left'), [['seat.left', 1]]);
});

test('a guest\'s refused seat goes with its controller (M4, N-19)', () => {
  const w = mp(seatsGame({ maxSeats: 1 }), { peers: 2 }); w.seconds(1);
  const g = w.guests[0], { seats, slots, frame } = view(g.engine);
  slots[0] = pad(0, { down: [0] }); frame(); slots[1] = pad(1, { down: [0] }); frame();
  w.step(1); frame();
  assert.deepEqual(seats.list.map(s => [s.seat, s.pending]), [[0, false], [1, false]], 'a guest\'s seat plays while it asks');
  for (let i = 0; i < 20 && g.engine.controllerOf(1); i++) { w.step(1); frame(); }
  frame();
  assert.equal(g.engine.controllerOf(1), undefined);
  assert.deepEqual(seats.list.map(s => s.seat), [0]);
  assert.deepEqual(seats.unpaired().filter(d => d.kind === 'pad').map(d => d.index), [1]);
});
