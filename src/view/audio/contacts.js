// Contact sounds (H-4): each `contact` event (M-5) plays the cue its materials name (M-7: the pair's sound, else the one
// known material's) at the contact point. Gain rises linearly from impulse `min` to `full`. A resting body emits contacts
// every step, so a body pair plays only when it has had no contact for `gap` seconds of engine time. View-only.
export function bindContactSounds(engine, cues, { min = 0.5, full = 20, gap = 0.12 } = {}) {
  if (typeof engine?.events?.on !== 'function') throw new Error('bindContactSounds: engine with events required');
  if (typeof cues?.play !== 'function' || typeof cues.has !== 'function') throw new Error('bindContactSounds: cues from createCues required');
  if (!(min >= 0 && full > min)) throw new Error('bindContactSounds: need 0 <= min < full');
  const last = new Map();
  const cueOf = (reg, ma, mb) => {
    if (!reg) return null;
    if (ma && mb) return reg.pair(ma, mb).sound ?? null;
    const m = ma ?? mb; return m ? reg.get(m).sound ?? null : null;
  };
  return engine.events.on(e => {
    if (e.type !== 'contact' || !(e.impulse >= min)) return;
    const id = cueOf(engine.world?.materials, e.materials[0], e.materials[1]);
    if (!id || !cues.has(id)) return;
    const key = `${e.a}|${e.b}`, now = engine.time.sim, t = last.get(key);
    if (last.size > 512 && t === undefined) for (const [k, t0] of last) if (now - t0 >= gap) last.delete(k); // forget quiet pairs
    last.set(key, now); // every contact refreshes the pair: a body at rest or sliding plays once, at its first contact
    if (t !== undefined && now - t < gap) return;
    cues.play(id, { gain: Math.min(1, (e.impulse - min) / (full - min)), at: e.point });
  });
}
