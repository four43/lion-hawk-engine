// test/seats-boot.test.mjs
// [C-5]–[C-13] through boot; R-8 for seats (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { boot, defineView, parseFlags, bindGamepad } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
import { allocRate } from './helpers/alloc.mjs';
import { game, pad, setup, WHEEL } from './helpers/seats.mjs';

const VIEW = fileURLToPath(new URL('../src/view/', import.meta.url));
const DRIVE = {
  pads: [
    { match: p => p.id === WHEEL, bindings: { deadZone: 0, axes: { 0: ['steer', -1], 2: ['gas', 1] } } },
    { match: p => p.mapping === 'standard', bindings: { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn', 7: ['gas', 1] } } },
  ],
};
const start = (halves, devices = []) => {
  const { window, document } = dom(), slots = [];
  const app = boot(game, halves, { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), getGamepads: () => slots, devices, storage: null });
  const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); }; // what the driver's tick does
  return { app, slots, frame, window, document };
};

test("boot without view.seats(): one seat holds every device and a game's own bindGamepad is unchanged (review focus)", () => {
  const t = start(defineView({ scenes: {} }), [e => bindGamepad(e, { axes: { 0: ['steer', 1] }, buttons: { 0: 'horn' } }, { getGamepads: () => t.slots })]);
  try {
    t.slots[0] = pad(0, { down: [0], axes: [0.5, 0, 0, 0] }); t.frame(); t.app.engine.stepN(1);
    assert.equal(t.app.view.localPlayers.length, 1); assert.equal(t.app.view.localPlayers[0].pads[0], t.slots[0]);
    assert.equal(t.app.engine.input.snapshot.horn.pressed, true, 'the reveal press still counts, as today');
    assert.ok(Math.abs(t.app.engine.input.snapshot.steer - (0.5 - 0.15) / 0.85) < 1e-9);
  } finally { t.app.dispose(); }
});

test('a view half turns seats on: two pads, two players, seat events, and dispose detaches (C-5, C-8, C-10)', () => {
  const ev = []; let off = null;
  const halves = defineView({ scenes: { field: { enter(e, view) {
    view.context('drive', DRIVE); view.seats({ contexts: ['drive'] }); off = view.onSeat(x => ev.push([x.type, x.seat]));
  }, exit() { off?.(); off = null; } } } });
  const { app, slots, frame, window, document } = start(halves);
  try {
    slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); frame(); app.engine.stepN(1); frame();
    assert.deepEqual(app.view.localPlayers.map(s => [s.seat, s.pending, s.controller?.player]), [[0, false, 1], [1, false, 2]]);
    slots[1] = pad(1, { id: WHEEL, axes: [0, 0, 1, 0] }); frame(); app.engine.stepN(1);
    assert.equal(app.engine.controllerOf(1).input.snapshot.gas, 1); assert.equal(app.engine.input.snapshot.gas, 0);
    assert.deepEqual(ev.filter(x => x[0] === 'seat.joined'), [['seat.joined', 1]]);
    assert.deepEqual(app.view.unpaired(), []);
  } finally { app.dispose(); }
  assert.doesNotThrow(() => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true })));
});

test('a steady frame with two seats, two pads and a context allocates under 128 bytes in view code (R-8)', async () => {
  const { e, seats, slots, frame } = setup();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  slots[0] = pad(0, { axes: [0.4, 0, 0, 0] }); slots[1] = pad(1, { down: [7] }); frame();
  const r = await allocRate(frame, 2000, { warm: 500, top: 8, within: VIEW });
  assert.ok(r.inside < 128, `${Math.round(r.inside)} bytes per frame in view code:\n${r.top.join('\n')}`);
});
