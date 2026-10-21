// test/haptics.test.mjs
// [C-14]: the haptics lifecycle (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics, STOP_FRAMES } from '../src/view/haptics.js';
import { setup, pad, actuator, WHEEL } from './helpers/seats.mjs';

const ZERO = ['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }];
const rounds = n => Array.from({ length: n }, () => [ZERO, ['reset']]).flat();
const rig = (opts = {}) => {
  const t = setup(), h = createHaptics(t.e, { seats: t.seats, target: t.window, doc: t.document, ...opts });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t.frame(); h.update(); } };
  return { ...t, h, tick };
};

// ruling S3: a first sight is a full stop (zero effect plus reset), as Rally's rumbleOut does
test('a pad seen for the first time gets one full stop; the same pad again, or later frames, get none (C-14)', () => {
  const { slots, tick } = rig(), a = actuator(), b = actuator();
  slots[0] = pad(0, { act: a }); tick(3);
  assert.deepEqual(a.calls, rounds(1));
  slots[0] = null; tick(); slots[0] = pad(0, { act: a }); tick(); // unplugged and back: seen already (index and id, for the page's life)
  assert.deepEqual(a.calls, rounds(1));
  slots[0] = null; tick(); slots[0] = pad(0, { id: WHEEL, act: b }); tick();
  assert.deepEqual(b.calls, rounds(1), 'another product on that index is a new pad');
});

test("blur stops every seat's pads: a zero dual-rumble then reset, at once and on each of the next 19 frames, then nothing (C-14, review focus)", () => {
  const { e, seats, slots, tick, window } = rig(), a = actuator(), b = actuator();
  seats.enable();
  slots[0] = pad(0, { act: a, down: [0] }); slots[1] = pad(1, { act: b, down: [0] }); tick(); e.stepN(1); tick();
  assert.deepEqual(seats.list.map(lp => lp.pads.length), [1, 1], 'two seats, one pad each');
  a.calls.length = 0; b.calls.length = 0;
  window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(a.calls, rounds(1), 'the first stop is sent at once');
  tick(30);
  assert.deepEqual(a.calls, rounds(STOP_FRAMES)); assert.deepEqual(b.calls, rounds(STOP_FRAMES));
});

// controller N2 ruling: unpaired connected pads (the ?debug=pads bench rumbles them) stop too
test('an unpaired pad is stopped as well as the seated ones (C-14, N2)', () => {
  const { seats, slots, tick, window } = rig(), a = actuator();
  seats.enable(); // joining by press: an unpressed pad stays unpaired
  slots[0] = pad(0, { act: a }); tick();
  assert.equal(seats.unpaired().length, 1, 'the pad is known but not seated');
  assert.deepEqual(seats.list.map(lp => lp.pads.length), [0], 'seat 0 holds no pad');
  a.playEffect('dual-rumble', { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 1 }); // the bench rumbles it
  a.calls.length = 0;
  window.dispatchEvent(new window.Event('blur'));
  tick(30);
  assert.deepEqual(a.calls, rounds(STOP_FRAMES));
});

test('pagehide and a hidden page stop and restart the count; a page turning visible does not; on(fn) hears each stop (C-14)', () => {
  const { slots, tick, window, document, h } = rig(), a = actuator(), got = [];
  const off = h.on(x => got.push(x));
  slots[0] = pad(0, { act: a }); tick(); a.calls.length = 0;
  let vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.deepEqual(a.calls, []);
  vis = 'hidden'; document.dispatchEvent(new window.Event('visibilitychange'));
  assert.deepEqual(a.calls, rounds(1)); assert.equal(h.stopping, STOP_FRAMES - 1);
  tick(5); assert.equal(h.stopping, STOP_FRAMES - 6);
  a.calls.length = 0; window.dispatchEvent(new window.Event('pagehide'));
  assert.deepEqual(a.calls, rounds(1)); assert.equal(h.stopping, STOP_FRAMES - 1, 'a new trigger restarts the count');
  assert.deepEqual(got, [{ type: 'haptics.stop', reason: 'hidden', frames: STOP_FRAMES }, { type: 'haptics.stop', reason: 'pagehide', frames: STOP_FRAMES }]);
  off(); window.dispatchEvent(new window.Event('blur')); assert.equal(got.length, 2);
  assert.throws(() => h.on(1), /haptics\.on: needs a function/);
});

test('a pausing overlay stops once as it opens, not every frame it stays open; a non-pausing overlay never stops (C-14, review focus)', () => {
  const { e, slots, tick } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick(); a.calls.length = 0;
  e.overlay('hud'); tick(5);
  assert.deepEqual(a.calls, [], 'hud does not pause');
  e.overlay('pause'); tick(60);
  assert.deepEqual(a.calls, rounds(STOP_FRAMES), 'twenty rounds, then the pause menu may rumble');
  a.calls.length = 0; e.close('pause'); tick(3);
  assert.deepEqual(a.calls, []);
  e.overlay('pause'); tick();
  assert.deepEqual(a.calls, rounds(1), 'opening it again stops again');
});

test("a game's rumble after the last stop round is left alone (C-14)", () => {
  const { slots, tick, window } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  window.dispatchEvent(new window.Event('blur')); tick(STOP_FRAMES - 1);
  a.calls.length = 0;
  a.playEffect('dual-rumble', { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 0 }); tick(10);
  assert.deepEqual(a.calls, [['play', 'dual-rumble', { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 0 }]]);
});

test('pads without an actuator, without playEffect, or whose actuator throws are skipped; the others still stop (C-14)', () => {
  const { slots, tick, window } = rig(), a = actuator();
  const bad = { effects: ['dual-rumble'], playEffect() { throw new Error('boom'); }, reset() { return Promise.reject(new Error('gone')); } };
  slots[0] = pad(0); slots[1] = pad(1, { act: {} }); slots[2] = pad(2, { act: bad }); slots[3] = pad(3, { act: a }); tick();
  a.calls.length = 0;
  assert.doesNotThrow(() => window.dispatchEvent(new window.Event('blur')));
  assert.deepEqual(a.calls, rounds(1));
  assert.doesNotThrow(() => tick(3));
  assert.throws(() => createHaptics(rig().e, {}), /haptics: needs the seats/);
  assert.throws(() => rig({ frames: 0 }), /haptics: frames must be a positive integer/);
});

test('dispose removes the listeners and the seat.seen hook (C-14)', () => {
  const { slots, window, h, seats } = rig(), a = actuator();
  h.dispose();
  slots[0] = pad(0, { act: a }); seats.update(1 / 60, 1 / 60);
  window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(a.calls, []);
});
