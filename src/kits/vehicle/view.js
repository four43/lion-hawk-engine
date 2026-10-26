// kit-vehicle (view half): engine sound (H-7). createEngineSound runs the EngineDSP synth (./engineDsp.js) through
// createDsp (H-5) into a voice (H-2), and update() sends it the powertrain's state as one reused parameter frame, once
// per frame. The listening position picks the built-in balance and the spec §5 mix; `mix` adds dB on top. A voice beyond
// positional.cull sends on 0, so its synth goes silent and stops running its model.
import { createDsp } from '../../view/audio/dsp.js';
import { EngineDSP, engineConfig } from './engineDsp.js';

const MICS = Object.freeze({ behind: 0, bay: 1, cabin: 2 });
const MUFFLERS = Object.freeze({ stock: 0, sport: 1, straight: 2 });
// engine-sound spec §5: dB on top of each position's built-in balance
const MIX_DB = Object.freeze({
  behind: { exhaust: 4.1, coast: 4.1, intake: 2.7, turbo: 0, engineBody: -8.2, starter: 0 },
  bay: { exhaust: 6.4, coast: 7.5, intake: 0, turbo: 3.4, engineBody: -4.7, starter: 8.7 },
  cabin: { exhaust: 6.9, coast: 9.5, intake: 3, turbo: 9.5, engineBody: -13.6, starter: 0 },
});
const FIELD = Object.freeze({ exhaust: 'mixEx', coast: 'mixOv', intake: 'mixIn', turbo: 'mixTu', engineBody: 'mixMe', starter: 'mixSt' });
const fail = m => { throw new Error(`engine sound: ${m}`); };
const names = o => { const k = Object.keys(o); return `${k.slice(0, -1).join(', ')} or ${k.at(-1)}`; };

export function createEngineSound(audio, pt, { mic = 'behind', mix = {}, muffler = 'sport', pipe, pops = false, volume = 0.6, bus = 'sfx', follow = null, seed = 1 } = {}) {
  if (!pt?.state || !pt.spec) fail('a powertrain from createPowertrain required');
  if (!Object.hasOwn(MUFFLERS, muffler)) fail(`muffler must be ${names(MUFFLERS)} (got ${muffler})`);
  for (const k of Object.keys(mix)) if (!Object.hasOwn(FIELD, k)) fail(`mix has no '${k}' (${Object.keys(FIELD).join(', ')})`);
  const frame = { rpm: 0, charge: 0.3, throttle: 0, fuelCut: 1, limiter: 0, popWin: 0, pops: pops ? 1 : 0, turbo: pt.turbo ? 1 : 0, shaft: 0, boostN: 0, wg: 0,
    bovId: 0, bovAmp: 0, bovMode: 1, mic: 0, vol: volume, pipe: pipe ?? pt.spec.pipe ?? 2.1, muffler: MUFFLERS[muffler], on: 0, starter: 0,
    mixEx: 1, mixOv: 1, mixIn: 1, mixTu: 1, mixMe: 1, mixSt: 1 };
  const setMic = name => {
    if (!Object.hasOwn(MICS, name)) fail(`mic must be ${names(MICS)} (got ${name})`);
    frame.mic = MICS[name]; const d = MIX_DB[name];
    for (const k in FIELD) frame[FIELD[k]] = 10 ** ((d[k] + (mix[k] ?? 0)) / 20);
  };
  setMic(mic);
  let dsp = null, voice = null, disposed = false, ok, bad;
  const ready = new Promise((a, b) => { ok = a; bad = b; });
  ready.catch(err => console.error('engine sound:', err)); // a game that never awaits ready still hears about a failure
  const off = audio.onUnlock(() => {
    if (disposed) return;
    createDsp(audio, { name: 'lh-engine', Class: EngineDSP, options: { seed } }).then(d => {
      if (disposed) { d.dispose(); return; }
      voice = audio.voice({ bus, follow });
      if (!voice) { d.dispose(); bad(new Error('audio stopped before the synth was ready')); return; }
      dsp = d; d.node.connect(voice.input); d.send(engineConfig(pt.spec)); ok(sound);
    }, bad);
  });
  const sound = {
    ready,
    get mode() { return dsp?.mode ?? null; },
    get voice() { return voice; },
    get dsp() { return dsp; },
    mic(name) { setMic(name); return sound; },
    update() { // once per frame, after the sim step
      if (!dsp) return;
      const s = pt.state;
      frame.rpm = s.rpm; frame.charge = s.map; frame.throttle = s.thrEff; frame.fuelCut = s.running && !s.fuelCut ? 0 : 1; frame.limiter = s.limiter ? 1 : 0;
      frame.popWin = s.popWin; frame.shaft = s.shaft; frame.boostN = s.boost / 1.5; frame.wg = s.wg; frame.bovId = s.bovId; frame.bovAmp = s.bovAmp; frame.bovMode = s.bovMode;
      frame.starter = s.starter ? 1 : 0; frame.on = (s.rpm > 25 || s.starter) && voice.audible ? 1 : 0;
      dsp.send(frame);
    },
    dispose() { if (disposed) return; disposed = true; off(); dsp?.dispose(); voice?.stop(); },
  };
  return sound;
}
