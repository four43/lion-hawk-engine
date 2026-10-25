// test/haptics-boot.test.mjs
// [C-14] through boot; R-8 for haptics (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { createHaptics, STOP_FRAMES } from '../src/view/haptics.js';
import { dom } from './helpers/dom.mjs';
import { allocRate } from './helpers/alloc.mjs';
import { game, pad, actuator, setup } from './helpers/seats.mjs';

const VIEW = fileURLToPath(new URL('../src/view/', import.meta.url));
const ZERO = ['play', 'trigger-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0, leftTrigger: 0, rightTrigger: 0 }]; // the fake pad lists trigger-rumble
const start = halves => {
  const { window, document } = dom(), slots = [];
  const app = boot(game, halves, { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), getGamepads: () => slots, storage: null });
  const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); }; // what the driver's tick does
  return { app, slots, frame, window, document };
};

test('boot stops rumble on blur and when a pausing overlay opens, through the driver; dispose removes it (C-14)', () => {
  const { app, slots, frame, window, document } = start(defineView({ scenes: {} })), a = actuator();
  try {
    slots[0] = pad(0, { act: a }); frame();
    assert.deepEqual(a.calls, [ZERO, ['reset']], 'seen for the first time: a full stop (S3)');
    a.calls.length = 0; window.dispatchEvent(new window.Event('blur'));
    for (let i = 0; i < 30; i++) frame();
    assert.equal(a.calls.length, 2 * STOP_FRAMES);
    a.calls.length = 0; app.engine.overlay('pause'); frame();
    assert.deepEqual(a.calls, [ZERO, ['reset']]);
  } finally { app.dispose(); }
  a.calls.length = 0; window.dispatchEvent(new window.Event('blur'));
  window.dispatchEvent(new window.Event('pagehide'));
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.deepEqual(a.calls, [], 'dispose removed the blur, pagehide and visibilitychange listeners');
});

test('defineView({ haptics: { autoStop: false } }) installs nothing: no first reset, no stop on blur, hide or pause (C-14, review focus)', () => {
  const on = start(defineView({ scenes: {} })), n = on.app.driver.devices.length; on.app.dispose();
  const { app, slots, frame, window } = start(defineView({ scenes: {}, haptics: { autoStop: false } })), a = actuator();
  try {
    assert.equal(app.driver.devices.length, n - 1, 'no haptics device');
    slots[0] = pad(0, { act: a }); frame();
    window.dispatchEvent(new window.Event('blur')); window.dispatchEvent(new window.Event('pagehide'));
    app.engine.overlay('pause'); for (let i = 0; i < 5; i++) frame();
    assert.deepEqual(a.calls, []);
  } finally { app.dispose(); }
});

test('defineView checks haptics (C-14)', () => {
  assert.equal(defineView({ scenes: {}, haptics: { autoStop: false } }).haptics.autoStop, false);
  assert.ok(Object.isFrozen(defineView({ scenes: {}, haptics: {} }).haptics));
  assert.equal(defineView({ scenes: {} }).haptics, undefined);
  for (const bad of [null, 1, 'off', { autoStop: 'no' }, { stop: false }]) {
    assert.throws(() => defineView({ scenes: {}, haptics: bad }), /defineView: haptics must be \{ autoStop: boolean \}/);
  }
});

test('a steady frame with haptics on, two pads with actuators and an open overlay allocates under 128 bytes in view code (R-8)', async () => {
  const t = setup(), h = createHaptics(t.e, { seats: t.seats, target: t.window, doc: t.document });
  t.slots[0] = pad(0, { act: actuator(), down: [0] }); t.slots[1] = pad(1, { act: actuator() });
  const step = () => { t.frame(); h.update(); };
  step(); t.e.overlay('hud'); step(); // a non-pausing overlay: the pause scan runs every frame
  const r = await allocRate(step, 2000, { warm: 500, top: 8, within: VIEW });
  assert.ok(r.inside < 128, `${Math.round(r.inside)} bytes per frame in view code:\n${r.top.join('\n')}`);
});

test('view.haptics.stop(reason) runs the 20-round stop on every pad; paused follows a pausing overlay; null with autoStop false (C-14, final review)', () => {
  const { app, slots, frame } = start(defineView({ scenes: {} })), a = actuator(), b = actuator();
  try {
    const h = app.view.haptics;
    assert.deepEqual(Object.keys(h).sort(), ['paused', 'stop', 'stopping']);
    slots[0] = pad(0, { act: a }); slots[1] = pad(1, { act: b }); frame();
    a.calls.length = 0; b.calls.length = 0;
    assert.equal(h.stopping, false);
    h.stop('menu');
    assert.equal(h.stopping, true);
    for (let i = 0; i < 30; i++) frame();
    assert.equal(a.calls.length, 2 * STOP_FRAMES); assert.equal(b.calls.length, 2 * STOP_FRAMES);
    assert.equal(h.stopping, false);
    assert.equal(h.paused, false);
    app.engine.overlay('hud'); assert.equal(h.paused, false);
    app.engine.overlay('pause'); assert.equal(h.paused, true);
    app.engine.close('pause'); assert.equal(h.paused, false);
  } finally { app.dispose(); }
  const off = start(defineView({ scenes: {}, haptics: { autoStop: false } }));
  try { assert.equal(off.app.view.haptics, null); } finally { off.app.dispose(); }
});
