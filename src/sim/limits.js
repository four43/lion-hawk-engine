// src/sim/limits.js: per-peer rate limit and once-per-kind warnings (M-44, M-50)
// M-44: a net error is logged once per kind, never a flood at 20 messages a second
export function createWarnOnce(log = (...a) => console.warn(...a)) { const seen = new Set(); return (kind, e) => { if (seen.has(kind)) return; seen.add(kind); log(kind, e); }; }
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = 60) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
