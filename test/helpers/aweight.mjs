// A-weighting (IEC 61672 poles) as six bilinear first-order sections, normalised to 0 dB at 1 kHz. Returns a per-sample
// filter x => y. Good to a fraction of a dB below 10 kHz at 48 kHz, which is enough for the engine-sound level targets.
export function aWeight(sr) {
  const W = [20.598997, 107.65265, 737.86223, 12194.217].map(f => 2 * Math.PI * f), K = 2 * sr;
  const hp = w => ({ b0: K / (K + w), b1: -K / (K + w), a1: (w - K) / (K + w) }); // s / (s + w)
  const lp = w => ({ b0: w / (K + w), b1: w / (K + w), a1: (w - K) / (K + w) });  // w / (s + w)
  const secs = [hp(W[0]), hp(W[0]), hp(W[1]), hp(W[2]), lp(W[3]), lp(W[3])];
  const gainAt = f => { const re = Math.cos(2 * Math.PI * f / sr), im = -Math.sin(2 * Math.PI * f / sr); let g = 1;
    for (const c of secs) g *= Math.hypot(c.b0 + c.b1 * re, c.b1 * im) / Math.hypot(1 + c.a1 * re, c.a1 * im); return g; };
  const norm = 1 / gainAt(1000), st = secs.map(() => ({ x: 0, y: 0 }));
  return x => { let v = x * norm; for (let i = 0; i < 6; i++) { const c = secs[i], s = st[i], y = c.b0 * v + c.b1 * s.x - c.a1 * s.y; s.x = v; s.y = y; v = y; } return v; };
}
