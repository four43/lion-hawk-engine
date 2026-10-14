// A fake Web Audio for the audio service's unit tests (no sound, no browser). Contexts record their graph (node.out), param
// writes (param.set), resumes and suspends; AudioContext.refuse keeps resume() from running a context (iOS outside a gesture).
// audioPage() is a happy-dom page with createAudio on it and fire(type) for a user gesture.
import { dom } from './dom.mjs';
import { createAudio } from '../../src/view/audio/index.js';
export const flush = () => new Promise(r => setImmediate(r));
export function fakeAudio({ refuse = false } = {}) {
  const made = [];
  const param = value => ({ value, set: [], setTargetAtTime(v, t, tc) { this.value = v; this.set.push([v, t, tc]); return this; } });
  const node = (kind, extra) => Object.assign({ kind, out: [], disconnected: false, connect(n) { this.out.push(n); return n; }, disconnect() { this.out.length = 0; this.disconnected = true; } }, extra);
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = node('destination'); this.onstatechange = null; this.resumes = 0; this.suspends = 0; made.push(this); }
    to(state) { if (this.state === state) return; this.state = state; queueMicrotask(() => this.onstatechange?.()); }
    resume() { this.resumes++; if (!AudioContext.refuse) this.to('running'); return Promise.resolve(); }
    suspend() { this.suspends++; this.to('suspended'); return Promise.resolve(); }
    close() { this.to('closed'); return Promise.resolve(); }
    createGain() { return node('gain', { gain: param(1) }); }
    createDynamicsCompressor() { return node('compressor', { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }); }
    createStereoPanner() { return node('panner', { pan: param(0) }); }
    createBufferSource() {
      return node('source', { buffer: null, loop: false, playbackRate: param(1), onended: null, started: null, stopped: null,
        start(t, o) { this.started = [t, o]; }, stop(t) { if (this.stopped !== null) throw new Error('InvalidStateError'); this.stopped = t; } });
    }
    decodeAudioData(ab) { return ab.byteLength ? Promise.resolve({ duration: ab.byteLength / 1000, length: ab.byteLength }) : Promise.reject(new Error('EncodingError')); }
  }
  AudioContext.refuse = refuse;
  return { AudioContext, made };
}
// fetch over a table of { url: byteLength }; anything else is a 404. f.calls lists the urls asked for.
export function fakeFetch(files) {
  const calls = [];
  const f = async url => { calls.push(url); return url in files ? { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(files[url]) } : { ok: false, status: 404 }; };
  f.calls = calls; return f;
}
export function audioPage({ fake, flags = {}, fetch, opts = {} } = {}) {
  const { window, document } = dom(), fa = fakeAudio(fake);
  const audio = createAudio({ doc: document, flags, AudioContext: fa.AudioContext, fetch, ...opts });
  const fire = (type = 'pointerup') => document.body.dispatchEvent(new window.Event(type, { bubbles: true }));
  const setVisibility = v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new window.Event('visibilitychange')); };
  return { window, document, fa, audio, fire, setVisibility };
}
