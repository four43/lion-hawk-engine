// Engine sound (H-7): createEngineSound runs EngineDSP in a voice and sends it the powertrain's state once per frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineSound } from '../../src/kits/vehicle/view.js';
import { createPowertrain } from '../../src/kits/vehicle/powertrain.js';
import { engineConfig } from '../../src/kits/vehicle/engineDsp.js';
import { audioPage, flush } from '../helpers/fakeAudio.mjs';

const db = d => 10 ** (d / 20), near = (a, b) => Math.abs(a - b) < 1e-9;
const withWorklet = t => { const s = audioPage(); globalThis.AudioWorkletNode = s.fa.AudioWorkletNode; t.after(() => { delete globalThis.AudioWorkletNode; }); return s; };

test('H-7: after the unlock: the synth is in a voice and gets the engine layout first', async t => {
  const s = withWorklet(t), pt = createPowertrain({ engine: 'v8x' }), snd = createEngineSound(s.audio, pt);
  assert.equal(snd.mode, null); snd.update(); // nothing to send yet
  s.fire(); await snd.ready;
  assert.equal(snd.mode, 'worklet');
  assert.equal(snd.dsp.node.out[0], snd.voice.input, 'synth -> voice');
  assert.deepEqual(snd.dsp.node.port.sent[0], engineConfig(pt.spec));
  assert.deepEqual(snd.dsp.node.port.sent[0].banks, [0, 1, 0, 0, 1, 0, 1, 1]);
});
test('H-7: update sends one reused frame from the powertrain state, with the position\'s mix in gains', async t => {
  const s = withWorklet(t), pt = createPowertrain({ turbo: {} }), snd = createEngineSound(s.audio, pt, { mix: { exhaust: -6 }, muffler: 'straight', volume: 0.5 });
  s.fire(); await snd.ready;
  const port = snd.dsp.node.port.sent;
  assert.deepEqual(port[0], engineConfig(pt.spec));
  pt.step(1 / 60); snd.update(); pt.step(1 / 60); snd.update();
  const f = port[1]; assert.equal(port[2], f, 'the same frame object every time (R-8)');
  assert.ok(near(f.rpm, pt.state.rpm)); assert.ok(near(f.charge, pt.state.map)); assert.equal(f.fuelCut, 0); assert.equal(f.on, 1); assert.equal(f.turbo, 1);
  assert.equal(f.mic, 0); assert.equal(f.muffler, 2); assert.equal(f.vol, 0.5); assert.equal(f.pipe, 2.1);
  assert.ok(near(f.mixEx, db(4.1 - 6))); assert.ok(near(f.mixMe, db(-8.2)));
  snd.mic('cabin'); snd.update(); assert.equal(f.mic, 2); assert.ok(near(f.mixOv, db(9.5))); assert.ok(near(f.mixEx, db(6.9 - 6)));
});
test('H-7: a stopped engine is silent; a voice beyond cull sends on 0', async t => {
  const s = withWorklet(t), pt = createPowertrain(), snd = createEngineSound(s.audio, pt, { follow: { x: 0, z: 0 } });
  s.fire(); await snd.ready; const f = () => snd.dsp.node.port.sent.at(-1);
  pt.stop(); for (let i = 0; i < 120; i++) pt.step(1 / 60); snd.update(); assert.equal(f().fuelCut, 1); assert.equal(f().on, 0);
  const far = audioPage({ opts: { positional: { cull: 100 } } }); globalThis.AudioWorkletNode = far.fa.AudioWorkletNode;
  far.audio.listen({ position: { x: 500, z: 0 }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } });
  const s2 = createEngineSound(far.audio, createPowertrain(), { follow: { x: 0, z: 0 } });
  far.fire(); await s2.ready;
  assert.equal(s2.voice.audible, false, 'beyond cull'); s2.update(); assert.equal(s2.dsp.node.port.sent.at(-1).on, 0);
});
test('H-7: dispose ends the processor and stops the voice; disposing before the unlock makes nothing', async t => {
  const s = withWorklet(t), snd = createEngineSound(s.audio, createPowertrain());
  s.fire(); await snd.ready; const sent = snd.dsp.node.port.sent;
  snd.dispose(); snd.dispose(); assert.deepEqual(sent.at(-1), { type: 'dispose' }); assert.equal(snd.voice.stopped, true);
  const e = withWorklet(t), early = createEngineSound(e.audio, createPowertrain()); early.dispose(); e.fire(); await flush(); await flush();
  assert.equal(early.mode, null);
});
test('H-7: without AudioWorklet it runs in a ScriptProcessor', async t => {
  const warns = []; t.mock.method(console, 'warn', (...a) => warns.push(a[0]));
  const s = audioPage(), snd = createEngineSound(s.audio, createPowertrain()); s.fire(); await snd.ready;
  assert.equal(snd.mode, 'script'); assert.match(warns[0], /no AudioWorklet; 'lh-engine' runs on the main thread/);
});
test('H-7: arguments are checked', () => {
  const s = audioPage(), pt = createPowertrain();
  assert.throws(() => createEngineSound(s.audio, {}), /^Error: engine sound: a powertrain from createPowertrain required$/);
  assert.throws(() => createEngineSound(s.audio, pt, { mic: 'roof' }), /engine sound: mic must be behind, bay or cabin \(got roof\)/);
  assert.throws(() => createEngineSound(s.audio, pt, { muffler: 'loud' }), /engine sound: muffler must be stock, sport or straight \(got loud\)/);
  assert.throws(() => createEngineSound(s.audio, pt, { mix: { bass: 1 } }), /engine sound: mix has no 'bass' \(exhaust, coast, intake, turbo, engineBody, starter\)/);
});
