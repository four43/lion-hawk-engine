// src/view/bench/padStats.js
// [D-7] the pad bench's numbers and haptics helpers, from the Gamepad Bench artifact: per-pad peaks, press counts, axis
// range, stick traces and edge outline, rest drift, update rate; trigger-tap shaping and live coupling; effect patterns;
// a playEffect wrapper with a pending-promise watchdog; the self-test. No DOM: the overlay (pads.js) draws these.
export const STD_BUTTONS = Object.freeze(['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'Back / Select', 'Start / Options', 'L3 (left stick)', 'R3 (right stick)', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right',
  'Home / Guide', 'Touchpad / Share']);
export const STD_AXES = Object.freeze(['left stick X', 'left stick Y', 'right stick X', 'right stick Y']);
export const SECTORS = 36, TRACE = 3000, TAP_MIN = 50, FULL = 0.95;
const WINDOW = 1000, CENTRE = 0.3, CALM = 30, CALM_MOVE = 0.01;

export function createPadStats(pad, now) {
  return { id: pad.id, lastTs: -1, changes: [], presses: [], peak: [], down: [], min: [], max: [], trace: [[], []],
    bins: [new Float32Array(SECTORS), new Float32Array(SECTORS)], calm: [0, 0], rest: [0, 0], seenAt: now };
}
export function updateStats(s, pad, now, onButton) {
  if (pad.timestamp !== s.lastTs) { s.lastTs = pad.timestamp; s.changes.push(now); }
  while (s.changes.length && now - s.changes[0] > WINDOW) s.changes.shift();
  const b = pad.buttons ?? [], a = pad.axes ?? [];
  for (let i = 0; i < b.length; i++) {
    const d = b[i]?.pressed === true, v = b[i]?.value ?? (d ? 1 : 0), was = s.down[i] === true;
    if (d && !was) { s.presses[i] = (s.presses[i] ?? 0) + 1; onButton?.(i, true, v); } else if (!d && was) onButton?.(i, false, v);
    s.down[i] = d; s.peak[i] = Math.max(s.peak[i] ?? 0, v);
  }
  for (let i = 0; i < a.length; i++) { const v = a[i] ?? 0; s.min[i] = Math.min(s.min[i] ?? 0, v); s.max[i] = Math.max(s.max[i] ?? 0, v); }
  for (let k = 0; k < 2; k++) {
    const x = a[k * 2], y = a[k * 2 + 1];
    if (x === undefined || y === undefined) continue;
    const tr = s.trace[k], last = tr[tr.length - 1], m = Math.hypot(x, y);
    const still = last !== undefined && Math.abs(last[0] - x) < CALM_MOVE && Math.abs(last[1] - y) < CALM_MOVE;
    s.calm[k] = still ? s.calm[k] + 1 : 0;
    if (s.calm[k] >= CALM && m < CENTRE) s.rest[k] = m; // drift: where the stick sits when nobody moves it
    if (last === undefined || last[0] !== x || last[1] !== y) { tr.push([x, y]); if (tr.length > TRACE) tr.shift(); }
    if (m > CENTRE) {
      const bi = Math.min(SECTORS - 1, Math.floor((Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * SECTORS));
      if (m > s.bins[k][bi]) s.bins[k][bi] = m;
    }
  }
}
export const rate = s => s.changes.length;
export function stickEdge(s, k) {
  let filled = 0, sum = 0, lo = Infinity, hi = 0;
  for (let i = 0; i < SECTORS; i++) { const m = s.bins[k][i]; if (!m) continue; filled++; sum += m; lo = Math.min(lo, m); hi = Math.max(hi, m); }
  return filled ? { avg: sum / filled, lo, hi, filled } : null;
}

// live coupling: trigger pull taps that trigger (strength follows the pull); trigger pull or the left stick drives the body
export const shapeTap = (v, curve) => (v > FULL ? 1 : v > 0.02 ? Math.min(1, v ** curve) : 0);
export const liveState = () => ({ tapAt: -Infinity, bodyAt: -Infinity, active: false });
export function liveEffect(st, { L, R, stick }, now, { trig = false, body = false, stickBody = false, interval = 130, length = 60, curve = 0.6 } = {}) {
  length = Math.max(TAP_MIN, length);
  let strong = 0, weak = 0;
  if (body) { strong = Math.max(strong, L); weak = Math.max(weak, R); }
  if (stickBody && stick > 0.1) { strong = Math.max(strong, stick); weak = Math.max(weak, stick * 0.6); }
  const bodyOn = strong > 0.01 || weak > 0.01, trigOn = trig && (L > 0.02 || R > 0.02);
  if (!bodyOn && !trigOn) { st.tapAt = -Infinity; if (st.active) { st.active = false; return 'idle'; } return null; }
  st.active = true;
  // taps carry the body values too: each playEffect preempts the last
  if (trigOn && now - st.tapAt >= Math.max(interval, length + 20)) {
    st.tapAt = now; st.bodyAt = now;
    return { type: 'trigger-rumble', params: { startDelay: 0, duration: length, leftTrigger: shapeTap(L, curve), rightTrigger: shapeTap(R, curve), strongMagnitude: strong, weakMagnitude: weak } };
  }
  if (!bodyOn || now - st.bodyAt < 50 || (trigOn && now - st.tapAt < length)) return null;
  st.bodyAt = now;
  return { type: 'dual-rumble', params: { startDelay: 0, duration: 120, strongMagnitude: strong, weakMagnitude: weak } };
}

// patterns: [atMs, type, params]; each playEffect preempts the previous one
const T = (l, r, d, extra = {}) => ['trigger-rumble', { startDelay: 0, duration: d, leftTrigger: l, rightTrigger: r, strongMagnitude: 0, weakMagnitude: 0, ...extra }];
const D = (s, w, d) => ['dual-rumble', { startDelay: 0, duration: d, strongMagnitude: s, weakMagnitude: w }];
const rep = (n, every, fn) => Array.from({ length: n }, (_, i) => [i * every, ...fn(i)]);
export const PATTERNS = Object.freeze([
  { name: 'Trigger click L', sub: 'one 40 ms tick', trig: true, steps: [[0, ...T(1, 0, 40)]] },
  { name: 'Trigger click R', sub: 'one 40 ms tick', trig: true, steps: [[0, ...T(0, 1, 40)]] },
  { name: 'Ping-pong', sub: 'alternating L/R', trig: true, steps: rep(10, 140, i => T(i % 2 ? 0 : 1, i % 2 ? 1 : 0, 100)) },
  { name: 'ABS brake', sub: 'LT stutter 1.2 s', trig: true, steps: rep(15, 80, () => T(0.9, 0, 40)) },
  { name: 'Recoil', sub: 'RT kick + body thump', trig: true, steps: [[0, ...T(0, 1, 45, { strongMagnitude: 0.7 })], [45, ...T(0, 0.35, 90, { weakMagnitude: 0.3 })]] },
  { name: 'Bowstring', sub: 'RT tension ramp, release', trig: true, steps: [...rep(20, 60, i => T(0, 0.05 + i * 0.03, 70)), [1200, ...T(0, 0, 10, { strongMagnitude: 1 })], [1210, ...D(1, 0.6, 120)]] },
  { name: 'Trigger sweep', sub: 'ramp 0 to 1 both', trig: true, steps: rep(25, 60, i => T(i / 24, i / 24, 70)) },
  { name: 'Heartbeat', sub: 'lub-dub x 3', steps: [0, 900, 1800].flatMap(t => [[t, ...D(0.8, 0, 90)], [t + 200, ...D(0.45, 0, 90)]]) },
  { name: 'Engine idle', sub: 'body, 2 s', steps: rep(34, 60, i => D(i % 2 ? 0.22 : 0.32, 0.12, 70)) },
  { name: 'Motor ramp', sub: 'strong 0 to 1', steps: rep(25, 60, i => D(i / 24, 0, 70)) },
  { name: 'Weak buzz', sub: 'high motor 0.5 s', steps: [[0, ...D(0, 1, 500)]] },
  { name: 'Max everything', sub: '4 motors, 0.6 s', trig: true, steps: [[0, ...T(1, 1, 600, { strongMagnitude: 1, weakMagnitude: 1 })]] },
]);

// one playEffect, logged; unless quiet, a watchdog reports a promise the browser never settles (seen on Linux hidraw)
export async function play(a, type, params, { log = () => {}, label = type, quiet = false, timer = globalThis } = {}) {
  if (!a) { if (!quiet) log(`${label}: this pad has no vibrationActuator`, 'err'); return null; }
  if (typeof a.playEffect !== 'function') { if (!quiet) log(`${label}: vibrationActuator has no playEffect() in this browser`, 'err'); return null; }
  if (!quiet) log(`${label}: playEffect("${type}", ${JSON.stringify(params)})`, '');
  const wait = (params.duration || 0) + (params.startDelay || 0) + 1500;
  let settled = false;
  const dog = quiet ? null : timer.setTimeout(() => { if (!settled) log(`${label}: no answer after ${wait} ms (promise still pending)`, 'err'); }, wait);
  try {
    const r = await a.playEffect(type, params);
    settled = true; if (dog !== null) timer.clearTimeout(dog);
    if (!quiet || r !== 'preempted') log(`${label}: ${r}`, r === 'complete' ? 'ok' : '');
    return r;
  } catch (e) {
    settled = true; if (dog !== null) timer.clearTimeout(dog);
    log(`${label}: ${e?.name}: ${e?.message}`, 'err');
    return null;
  }
}
export async function selfTest(pad, { log, play: run, env = {} }) {
  log('- self-test -', 'sys');
  if (env.userAgent) log(`browser: ${env.userAgent}`, '');
  log(`page focused: ${env.focused} · visibility: ${env.visibility} · secure: ${env.secure}`, '');
  if (!pad) { log('controller: none selected. Press a button on it first.', 'err'); return; }
  log(`controller: "${pad.id}" · index ${pad.index} · mapping "${pad.mapping}"`, '');
  const a = pad.vibrationActuator;
  log(`'vibrationActuator' in gamepad: ${'vibrationActuator' in pad} · value: ${a ? 'object' : a}`, a ? 'ok' : 'err');
  if (!a) return;
  log(`playEffect: ${typeof a.playEffect} · reset: ${typeof a.reset}`, '');
  log(`effects: ${'effects' in a ? JSON.stringify(Array.from(a.effects ?? [])) : 'not exposed'}`, '');
  await run('dual-rumble', { startDelay: 0, duration: 500, strongMagnitude: 1, weakMagnitude: 1 }, 'self-test body');
  await run('trigger-rumble', { startDelay: 0, duration: 500, leftTrigger: 1, rightTrigger: 1, strongMagnitude: 0, weakMagnitude: 0 }, 'self-test triggers');
}
export function supports(a) {
  if (!a) return { dual: false, trigger: false };
  const list = 'effects' in a && a.effects ? Array.from(a.effects) : null;
  return { dual: list ? list.includes('dual-rumble') : a.type === 'dual-rumble' ? true : null, trigger: list ? list.includes('trigger-rumble') : null };
}
export function describe(d) {
  if (d === null || d === undefined) return '-';
  const lost = d.lost ? ' · lost' : '';
  if (d.kind === 'pad') return `pad ${d.index} "${d.id}" mapping "${d.mapping}"${lost}`;
  if (d.kind === 'keys') return `keys ${d.scheme}`;
  if (d.kind === 'touch') return 'touch';
  return `${d.kind} ${d.key} "${d.id}"${lost}`;
}
