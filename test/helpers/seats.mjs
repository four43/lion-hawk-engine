// test/helpers/seats.mjs
// Seats test kit (plan 2026-10-21-local-players-2): a game, fake Gamepads, a createSeats harness on happy-dom, storage.
import { actions, axis, button, defineGame, createEngine } from '../../src/index.sim.js';
import { createSeats } from '../../src/view/seats.js';
import { dom } from './dom.mjs';

export const schema = actions({ steer: axis(), gas: axis(), brake: axis(), horn: button() });
export const game = defineGame({ id: 'seats', start: 'field', actions: schema, scenes: { field: {} } });
export const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
export const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
export const WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';
// a fresh Gamepad snapshot every call, as Chromium hands out (research §5). Real sticks drift a little off 0; an axis at
// exactly 0 models one the browser has not reported yet (Firefox), whose first non-zero reading is its rest.
export const DRIFT = [0.004, -0.004, 0.004, -0.004];
export const pad = (index, { id = XBOX, mapping = id === WHEEL ? '' : 'standard', down = [], axes = DRIFT } = {}) => ({
  index, id, mapping, connected: true, axes: axes.slice(),
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
export const memory = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
export function setup(opts = {}) {
  const { window, document } = dom(), e = createEngine(game), slots = [], ev = [];
  const seats = createSeats(e, { getGamepads: () => slots, target: window, doc: document, storage: null, ...opts });
  seats.on(x => ev.push(x.op === undefined ? [x.type, x.seat, x.device?.kind ?? null] : [x.type, x.seat, x.device.kind, x.op]));
  const frame = () => seats.update(1 / 60, 1 / 60);
  const key = (type, k) => document.body.dispatchEvent(new window.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  return { e, seats, slots, ev, frame, key, window, document };
}
