// DSP host (H-5): runs a self-contained synth class { constructor(sampleRate, options), setParams(msg), render(L, R, n) }
// off the main thread in an AudioWorklet, whose module is the class's own source text in a Blob URL (so a single-file
// build needs no extra file), added once per context and name. Without a worklet, or when the module fails to load,
// the class runs in a ScriptProcessor on the main thread. The class must name nothing outside itself. View-only.
const MODULES = new WeakMap(); // context -> Map(name -> { Class, loaded: Promise<boolean> })

export function workletSource(name, Class) {
  return `const C = (${Class.toString()});
registerProcessor(${JSON.stringify(name)}, class extends AudioWorkletProcessor {
  constructor(o) { super(); this.d = new C(sampleRate, o.processorOptions); this.done = false;
    this.port.onmessage = e => { if (e.data && e.data.type === 'dispose') this.done = true; else this.d.setParams(e.data); }; }
  process(i, o) { if (this.done) return false; const out = o[0]; this.d.render(out[0], out[1] || null, out[0].length); return true; }
});
`;
}

async function loadModule(ctx, name, Class, AWN) {
  if (!ctx.audioWorklet || typeof AWN !== 'function') { console.warn(`audio: no AudioWorklet; '${name}' runs on the main thread`); return false; }
  const url = URL.createObjectURL(new Blob([workletSource(name, Class)], { type: 'text/javascript' }));
  try { await ctx.audioWorklet.addModule(url); return true; } catch (err) {
    console.warn(`audio: AudioWorklet '${name}' failed to load; it runs on the main thread`, err); return false;
  } finally { URL.revokeObjectURL(url); }
}

export async function createDsp(audio, { name, Class, channels = 2, options = {}, AudioWorkletNode: AWN = globalThis.AudioWorkletNode } = {}) {
  if (typeof name !== 'string' || !/^[\w-]+$/.test(name)) throw new Error('createDsp: name must match [\\w-]+');
  if (typeof Class !== 'function' || typeof Class.prototype?.render !== 'function' || typeof Class.prototype.setParams !== 'function') throw new Error('createDsp: Class must have render(L, R, n) and setParams(msg)');
  const ctx = audio?.ctx;
  if (!ctx) throw new Error('createDsp: no audio context yet (call it from audio.onUnlock)');
  let mods = MODULES.get(ctx); if (!mods) MODULES.set(ctx, mods = new Map());
  let m = mods.get(name);
  if (m && m.Class !== Class) throw new Error(`createDsp: '${name}' is already registered with another class`);
  if (!m) { m = { Class, loaded: loadModule(ctx, name, Class, AWN) }; mods.set(name, m); }
  if (await m.loaded) {
    const node = new AWN(ctx, name, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels], processorOptions: options });
    return { node, mode: 'worklet', send: msg => node.port.postMessage(msg), dispose() { node.port.postMessage({ type: 'dispose' }); node.disconnect(); } };
  }
  const dsp = new Class(ctx.sampleRate, options), node = ctx.createScriptProcessor(1024, 1, channels);
  node.onaudioprocess = ev => { const ob = ev.outputBuffer; dsp.render(ob.getChannelData(0), channels > 1 ? ob.getChannelData(1) : null, ob.length); };
  return { node, mode: 'script', send: msg => dsp.setParams(msg), dispose() { node.onaudioprocess = null; node.disconnect(); } };
}
