// Seeded random numbers: mulberry32 over a 32-bit state, the same sequence the three games use today.
// String seeds hash with FNV-1a; fork(label) gives an independent, repeatable sub-stream, so a new draw
// in one system never shifts another system's numbers (rally tracks T-2).
export const fnv = str => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

export function rng(seed) {
  const base = typeof seed === 'number' ? seed >>> 0 : fnv(String(seed));
  let a = base;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: base,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    shuffle(arr) { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; },
    fork: label => rng(fnv(`${base}:${label}`)),
  };
}
