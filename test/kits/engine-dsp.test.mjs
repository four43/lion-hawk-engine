// The engine synthesizer (H-7): the reference prototype's level targets, stability on every preset,
// seeded determinism, the silent fast path, and that its source runs as a worklet processor on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EngineDSP, engineConfig } from '../../src/kits/vehicle/engineDsp.js';
import { ENGINE_PRESETS } from '../../src/kits/vehicle/powertrain.js';
import { workletSource } from '../../src/view/audio/dsp.js';
import { aWeight } from '../helpers/aweight.mjs';

const SR = 48000, FLAT = { mixEx: 1, mixOv: 1, mixIn: 1, mixTu: 1, mixMe: 1, mixSt: 1, pops: 0, on: 1 };
const render = (frame, secs, { seed = 1, preset = 'i4' } = {}) => {
  const d = new EngineDSP(SR, { seed }); d.setParams(engineConfig(ENGINE_PRESETS[preset])); d.setParams({ ...FLAT, ...frame });
  const L = new Float32Array(Math.round(SR * secs)), R = new Float32Array(L.length); d.render(L, R, L.length); return { L, R, d };
};
const levelA = (frame, mic) => { // A-weighted dB over the second second
  const { L, R } = render({ ...frame, mic }, 2), fl = aWeight(SR), fr = aWeight(SR); let s = 0, n = 0;
  for (let i = 0; i < L.length; i++) { const a = fl(L[i]), b = fr(R[i]); if (i >= SR) { s += a * a + b * b; n += 2; } }
  return 10 * Math.log10(s / n);
};
const WOT4K = { rpm: 4000, charge: 1, throttle: 1, fuelCut: 0 }, IDLE = { rpm: 850, charge: 0.34, throttle: 0, fuelCut: 0 };
const coast = rpm => ({ rpm, charge: 0.18, throttle: 0, fuelCut: 1 });
// the prototype's level targets: Inline-4, sport muffler, 2.1 m pipe, mixer at 0 dB; dB relative to full throttle at 4000 rpm
const TARGETS = [[IDLE, [-17.3, -25.2, -17.1]], [coast(2000), [-18.9, -17.6, -19.6]], [coast(4000), [-12.0, -10.0, -13.8]], [coast(6000), [-8.2, -6.0, -10.8]]];

test('H-7: the reference level targets hold within 1.5 dB at every listening position', () => {
  for (const mic of [0, 1, 2]) {
    const ref = levelA(WOT4K, mic);
    for (const [frame, want] of TARGETS) { const got = levelA(frame, mic) - ref; assert.ok(Math.abs(got - want[mic]) <= 1.5, `mic ${mic} ${JSON.stringify(frame)}: ${got.toFixed(1)} dB vs ${want[mic]}`); }
  }
});
test('H-7: every preset at every position stays finite within [-1, 1]: idle, limiter, coast, boost, cranking', () => {
  const states = [IDLE, { rpm: 7100, charge: 1, throttle: 1, fuelCut: 0, limiter: 1, pops: 1, popWin: 1 }, coast(6000),
    { rpm: 5000, charge: 2.2, throttle: 1, fuelCut: 0, turbo: 1, shaft: 1, boostN: 0.8, wg: 0.6, bovId: 1, bovAmp: 1.2 },
    { rpm: 260, charge: 1, throttle: 0, fuelCut: 1, starter: 1 }];
  for (const preset of Object.keys(ENGINE_PRESETS)) for (const mic of [0, 1, 2]) for (const st of states) {
    const { L, R } = render({ ...st, mic, muffler: 2 }, 0.25, { preset });
    for (let i = 0; i < L.length; i++) if (!(Math.abs(L[i]) <= 1 && Math.abs(R[i]) <= 1)) assert.fail(`${preset} mic ${mic} ${JSON.stringify(st)}: sample ${i} = ${L[i]}, ${R[i]}`);
  }
});
test('H-7: the same seed renders the same samples; another seed differs', () => {
  const a = render(WOT4K, 0.2).L, b = render(WOT4K, 0.2).L, c = render(WOT4K, 0.2, { seed: 2 }).L;
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
});
test('H-7: with on 0 the output fades (150 ms time constant), then is exact zeros once the gate is below 1e-4 (~1.4 s)', () => {
  const { d } = render(WOT4K, 0.2); d.setParams({ on: 0 });
  const L = new Float32Array(2 * SR), R = new Float32Array(2 * SR); d.render(L, R, 2 * SR);
  assert.ok(Math.abs(L[100]) > 0, 'still fading'); for (let i = 1.5 * SR; i < 2 * SR; i++) assert.equal(L[i], 0);
});
test('H-7: the class runs from its own source as a worklet processor, and uses no Math.random', () => {
  const reg = {};
  new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', workletSource('lh-engine', EngineDSP))((n, P) => { reg[n] = P; }, class { constructor() { this.port = {}; } }, SR);
  const p = new reg['lh-engine']({ processorOptions: { seed: 3 } }), L = new Float32Array(128), R = new Float32Array(128);
  p.port.onmessage({ data: engineConfig(ENGINE_PRESETS.v8x) }); p.port.onmessage({ data: { ...FLAT, ...WOT4K } });
  for (let k = 0; k < 40; k++) assert.equal(p.process([], [[L, R]]), true);
  assert.ok(L.some(v => v !== 0) && L.every(Number.isFinite));
  assert.doesNotMatch(readFileSync(new URL('../../src/kits/vehicle/engineDsp.js', import.meta.url), 'utf8'), /Math\.random/);
});
test('H-7: engineConfig carries a preset\'s firing layout', () => {
  assert.deepEqual(engineConfig(ENGINE_PRESETS.flat4), { type: 'engine', angles: [0, 180, 360, 540], banks: [0, 1, 0, 1], header: [0, 2.6, 0, 2.6], pulseDeg: 240, gain: 1.05, stereo: 0 });
});
test('H-7: bundled for an ES2020 target (static fields lowered out of the class), EngineDSP still runs from its own source', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [fileURLToPath(new URL('../../src/kits/vehicle/engineDsp.js', import.meta.url))], bundle: true, format: 'iife', globalName: 'M',
    target: 'es2020', minify: true, write: false, logLevel: 'silent' });
  const M = new Function(`${out.outputFiles[0].text};return M;`)(), reg = {};
  new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', workletSource('lh-engine', M.EngineDSP))((n, P) => { reg[n] = P; }, class { constructor() { this.port = {}; } }, SR);
  const p = new reg['lh-engine']({ processorOptions: {} }), L = new Float32Array(128), R = new Float32Array(128);
  p.port.onmessage({ data: M.engineConfig(ENGINE_PRESETS.i4) }); p.port.onmessage({ data: { ...FLAT, ...WOT4K } });
  for (let k = 0; k < 20; k++) p.process([], [[L, R]]);
  assert.ok(L.some(v => v !== 0) && L.every(Number.isFinite));
});
