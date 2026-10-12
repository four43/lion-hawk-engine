import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGamepad } from '../src/index.view.js';

const MAP = { axes: { 0: ['steer', 1], 1: ['throttle', -1] }, buttons: { 0: 'horn', 7: ['throttle', 1] } };
const btns = (o = {}) => Array.from({ length: 8 }, (_, i) => o[i] ?? { pressed: false, value: 0 });
const setup = pads => {
  const calls = []; let cleared = null;
  const engine = { input: { device: (p, s) => calls.push({ ...p, s }), clearDevice: s => { cleared = s; } } };
  const pad = bindGamepad(engine, MAP, { getGamepads: () => pads });
  return { pad, last: () => calls[calls.length - 1], cleared: () => cleared };
};

test('dead zone, scaling and sign', () => {
  const { pad, last } = setup([{ index: 0, axes: [0.1, -0.6], buttons: btns() }]);
  pad.update(); assert.equal(last().steer, 0); assert.ok(Math.abs(last().throttle - (0.6 - 0.15) / 0.85) < 1e-9); assert.equal(last().s, 'pad');
});
test('horn button and analog trigger', () => {
  const { pad, last } = setup([{ index: 0, axes: [0, 0], buttons: btns({ 0: { pressed: true, value: 1 }, 7: { pressed: false, value: 0.4 } }) }]);
  pad.update(); assert.equal(last().horn, true); assert.equal(last().throttle, 0.4);
});
test('no pads clears the source', () => {
  const { pad, cleared } = setup([null]); pad.update(); assert.equal(cleared(), 'pad');
});
test('two pads merge by largest magnitude', () => {
  const { pad, last } = setup([
    { index: 0, axes: [0.5, 0], buttons: btns() },
    { index: 1, axes: [-1, 0], buttons: btns({ 0: { pressed: true, value: 1 } }) }]);
  pad.update(); assert.equal(last().steer, -1); assert.equal(last().horn, true);
});

test('2c: axis curve after the dead zone; one button drives two actions (#16)', () => {
  const calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const curve = v => 0.35 * v * Math.abs(v) + 0.65 * v;
  const pad = bindGamepad(engine, { deadZone: 0.08, axes: { 0: ['steer', -1, curve] }, buttons: { 0: [['handbrake', 1], 'confirm'], 7: ['throttle', 1] } },
    { getGamepads: () => [{ index: 0, axes: [0.54], buttons: btns({ 0: { pressed: true, value: 1 }, 7: { pressed: false, value: 0.25 } }) }] });
  pad.update();
  const s = (0.54 - 0.08) / 0.92;
  assert.ok(Math.abs(calls.at(-1).steer - -curve(s)) < 1e-12);
  assert.equal(calls.at(-1).handbrake, 1); assert.equal(calls.at(-1).confirm, true); assert.equal(calls.at(-1).throttle, 0.25);
});

test('2d: a curve is not applied at rest; an empty binding list throws (E2 minors)', () => {
  const calls = []; const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const pad = bindGamepad(engine, { axes: { 0: ['steer', 1, v => v * 0.5 + 0.1] } }, { getGamepads: () => [{ axes: [0], buttons: [] }] });
  pad.update(); assert.equal(calls.at(-1).steer, 0);
  assert.throws(() => bindGamepad(engine, { buttons: { 0: [] } }, { getGamepads: () => [] }), /bindGamepad: button 0 has an empty binding list/);
});

test('2f: bindGamepad map: a radial dead zone over the pair, then world-frame actions (#8)', () => {
  const camMap = cam => ({ from: ['sx', 'sy'], to: (x, y, out) => {
    const m = Math.min(1, Math.hypot(x, y)), a = Math.atan2(x, y), w = cam.yaw - a;
    out.goX = m * Math.sin(w); out.goZ = m * Math.cos(w); out.goBack = m > 0 && Math.abs(a) > Math.PI * 0.8; return out; } });
  const pads = [{ index: 0, axes: [0.1, -0.1], buttons: btns() }], calls = [];
  const engine = { input: { device: p => calls.push({ ...p }), clearDevice() {} } };
  const pad = bindGamepad(engine, { axes: { 0: ['sx', 1], 1: ['sy', -1] }, buttons: { 0: 'horn' }, deadZone: 0, map: { ...camMap({ yaw: 0 }), radial: 0.15 } }, { getGamepads: () => pads });
  pad.update(); assert.deepEqual(calls[0], { horn: false, goX: 0, goZ: 0, goBack: false }); // inside the radial zone, outside a per-axis one
  pads[0].axes = [0, -1]; pad.update(); assert.equal(calls[1].goZ, 1); assert.ok(Math.abs(calls[1].goX) < 1e-12);
});
