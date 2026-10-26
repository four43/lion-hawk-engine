// Cues (H-3): named sounds over the audio service. A cue picks one of its clips and jitters gain and rate with the game's
// rng stream (U-6: pass engine.rng('fx')), skips plays closer than its cooldown on the context clock, and keeps at most
// `max` plays at once by stopping the oldest still playing. View-only.
const KEYS = ['src', 'gain', 'gainJitter', 'rate', 'rateJitter', 'bus', 'cooldown', 'max'];
const fail = m => { throw new Error(`createCues: ${m}`); };

export function createCues(audio, defs, { rng } = {}) {
  if (typeof rng?.next !== 'function') fail("rng with next() required (pass engine.rng('fx'))");
  const cues = new Map(), loads = [];
  for (const [id, d] of Object.entries(defs ?? {})) {
    for (const k of Object.keys(d)) if (!KEYS.includes(k)) fail(`cue '${id}' has no '${k}' (${KEYS.join(', ')})`);
    const src = typeof d.src === 'string' ? [d.src] : d.src;
    if (!Array.isArray(src) || !src.length || !src.every(u => typeof u === 'string' && u)) fail(`cue '${id}': src must be a url or a non-empty list of urls`);
    const max = d.max ?? 4;
    if (!(Number.isInteger(max) && max >= 1)) fail(`cue '${id}': max must be an integer >= 1`);
    const bus = d.bus ?? 'sfx'; audio.bus(bus); // throws on an unknown bus
    const c = { gain: d.gain ?? 1, gainJitter: d.gainJitter ?? 0, rate: d.rate ?? 1, rateJitter: d.rateJitter ?? 0, bus, cooldown: d.cooldown ?? 0, max,
      bufs: [], last: -Infinity, live: [] };
    for (const url of src) loads.push(audio.load(url).then(b => { c.bufs.push(b); }));
    cues.set(id, c);
  }
  const ready = Promise.all(loads).then(() => {});
  ready.catch(() => {}); // a missing clip is reported by ready; the cue plays the clips that did load
  const jitter = j => (j ? 1 + j * (2 * rng.next() - 1) : 1);
  return {
    ready,
    has: id => cues.has(id),
    play(id, { gain = 1, rate = 1, at, when = 0 } = {}) {
      const c = cues.get(id);
      if (!c) throw new Error(`cues.play: unknown cue '${id}'`);
      if (!audio.unlocked || !c.bufs.length) return null;
      const now = audio.ctx.currentTime;
      if (now - c.last < c.cooldown) return null;
      const buf = c.bufs[Math.min(c.bufs.length - 1, Math.floor(rng.next() * c.bufs.length))];
      const g = c.gain * gain * jitter(c.gainJitter), r = c.rate * rate * jitter(c.rateJitter);
      for (let i = c.live.length - 1; i >= 0; i--) if (c.live[i].ends <= now) c.live.splice(i, 1);
      if (c.live.length >= c.max) c.live.shift().h.stop();
      const h = audio.play(buf, { gain: g, rate: r, at, when, bus: c.bus });
      if (!h) return null;
      c.last = now; c.live.push({ h, ends: now + when + buf.duration / r });
      return h;
    },
  };
}
