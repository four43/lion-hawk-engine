// DSP host (H-5): a self-contained class runs in an AudioWorklet loaded from a Blob URL, else on the main thread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDsp, workletSource } from '../src/view/audio/dsp.js';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

class Tone { // self-contained: no outer names
  constructor(sr, o = {}) { this.sr = sr; this.f = o.f ?? 100; this.ph = 0; this.g = 1; }
  setParams(m) { if (m.g !== undefined) this.g = m.g; }
  render(L, R, n) { for (let i = 0; i < n; i++) { this.ph += this.f / this.sr; const v = Math.sin(2 * Math.PI * this.ph) * this.g; L[i] = v; if (R) R[i] = -v; } }
}
const unlocked = async fake => { const s = audioPage({ fake }); s.fire(); await flush(); return s; };

test('H-5: the worklet source registers a processor that renders the class and ends on dispose', () => {
  const reg = {};
  new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', workletSource('tone', Tone))((n, P) => { reg[n] = P; }, class { constructor() { this.port = {}; } }, 1000);
  const p = new reg.tone({ processorOptions: { f: 250 } }), L = new Float32Array(4), R = new Float32Array(4);
  assert.equal(p.process([], [[L, R]]), true);
  assert.deepEqual([...L].map(v => Math.round(v)), [1, 0, -1, -0]); assert.equal(R[0], -L[0]);
  p.port.onmessage({ data: { g: 0.5 } }); p.process([], [[L]]); assert.ok(Math.abs(L[0] - 0.5) < 1e-6, 'mono output: R is null');
  p.port.onmessage({ data: { type: 'dispose' } }); assert.equal(p.process([], [[L, R]]), false);
});
test('H-5: with a worklet: one addModule per context and name; the node gets the options; send posts', async t => {
  const blobs = []; t.mock.method(URL, 'createObjectURL', b => { blobs.push(b); return `blob:${blobs.length}`; }); t.mock.method(URL, 'revokeObjectURL', () => {});
  const s = await unlocked(), AWN = s.fa.AudioWorkletNode;
  const a = await createDsp(s.audio, { name: 'tone', Class: Tone, options: { f: 3 }, AudioWorkletNode: AWN });
  const b = await createDsp(s.audio, { name: 'tone', Class: Tone, channels: 1, AudioWorkletNode: AWN });
  assert.equal(a.mode, 'worklet'); assert.deepEqual(s.audio.ctx.audioWorklet.modules, ['blob:1']);
  assert.match(await blobs[0].text(), /registerProcessor\("tone"/);
  assert.deepEqual(a.node.opts, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { f: 3 } });
  assert.deepEqual(b.node.opts.outputChannelCount, [1]);
  a.send({ g: 2 }); assert.deepEqual(a.node.port.sent, [{ g: 2 }]);
  a.dispose(); assert.deepEqual(a.node.port.sent.at(-1), { type: 'dispose' }); assert.equal(a.node.disconnected, true);
});
test('H-5: without a worklet, or when it fails to load, the class runs in a ScriptProcessor and warns once', async t => {
  const warns = []; t.mock.method(console, 'warn', (...a) => warns.push(a[0]));
  const s = await unlocked({ worklet: false });
  const d = await createDsp(s.audio, { name: 'tone', Class: Tone, options: { f: 12000 } });
  await createDsp(s.audio, { name: 'tone', Class: Tone });
  assert.equal(d.mode, 'script'); assert.equal(d.node.kind, 'script'); assert.equal(d.node.size, 1024); assert.equal(d.node.outs, 2);
  const L = new Float32Array(4), R = new Float32Array(4), ob = { length: 4, getChannelData: c => (c ? R : L) };
  d.send({ g: 0.5 }); d.node.onaudioprocess({ outputBuffer: ob });
  assert.ok(Math.abs(L[0] - 0.5) < 1e-6 && Math.abs(R[0] + 0.5) < 1e-6);
  assert.deepEqual(warns, ["audio: no AudioWorklet; 'tone' runs on the main thread"]);
  d.dispose(); assert.equal(d.node.onaudioprocess, null); assert.equal(d.node.disconnected, true);
  const f = await unlocked({ workletFails: true });
  assert.equal((await createDsp(f.audio, { name: 'tone', Class: Tone, AudioWorkletNode: f.fa.AudioWorkletNode })).mode, 'script');
  assert.match(warns[1], /audio: AudioWorklet 'tone' failed to load; it runs on the main thread/);
});
test('H-5: arguments are checked; a name already used by another class throws', async () => {
  const pre = audioPage();
  await assert.rejects(createDsp(pre.audio, { name: 'tone', Class: Tone }), /^Error: createDsp: no audio context yet \(call it from audio\.onUnlock\)$/);
  const s = await unlocked();
  await assert.rejects(createDsp(s.audio, { name: 'bad name', Class: Tone }), /createDsp: name must match \[\\w-\]\+/);
  await assert.rejects(createDsp(s.audio, { name: 'x', Class: class {} }), /createDsp: Class must have render\(L, R, n\) and setParams\(msg\)/);
  await createDsp(s.audio, { name: 'one', Class: Tone, AudioWorkletNode: s.fa.AudioWorkletNode });
  class Other extends Tone {}
  await assert.rejects(createDsp(s.audio, { name: 'one', Class: Other, AudioWorkletNode: s.fa.AudioWorkletNode }), /createDsp: 'one' is already registered with another class/);
});
