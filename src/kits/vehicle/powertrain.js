// kit-vehicle powertrain (H-6; a reference engine-sound prototype's engine state model): an engine and gearbox for the sim.
// Throttle and the driven wheels' spin give engine rpm, manifold pressure (`map`, the sound's load axis), fuel cut, the
// rev limiter and an optional turbo; step() returns the drive torque for the driven wheels, held for the step. The
// clutch is a viscous coupling capped so that one step's torque cannot reverse the slip, which keeps a torque held for a
// whole step stable against light wheels. Sim-pure (L-3): no randomness or clock; nothing allocated per step.
const RPM_PER_RAD = 60 / (2 * Math.PI), H = 0.002; // engine substep: the model wants 2 ms or less
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fail = m => { throw new Error(`powertrain: ${m}`); };
const preset = (angles, banks, header, stereo, idle, redline, limiter, torque, peakRpm, inertia, pipe, pulseDeg, gain) =>
  Object.freeze({ angles: Object.freeze(angles), banks: Object.freeze(banks), header: Object.freeze(header), stereo, idle, redline, limiter, torque, peakRpm, inertia, pipe, pulseDeg, gain });
const zeros = n => Array(n).fill(0), alt = n => Array.from({ length: n }, (_, i) => i % 2), every = (n, d) => Array.from({ length: n }, (_, i) => i * d);
// the prototype's engines: firing angles over 720°, exhaust bank per cylinder, header delays (ms), then the model's numbers
export const ENGINE_PRESETS = Object.freeze({
  i4: preset([0, 180, 360, 540], [0, 1, 0, 1], zeros(4), 0, 850, 7000, 7200, 210, 4800, 0.13, 2.1, 230, 1.0),
  flat4: preset([0, 180, 360, 540], [0, 1, 0, 1], [0, 2.6, 0, 2.6], 0, 800, 6800, 7000, 250, 4200, 0.14, 2.3, 240, 1.05),
  i6: preset(every(6, 120), alt(6), zeros(6), 0, 750, 7000, 7200, 340, 4600, 0.18, 2.5, 235, 0.95),
  v8x: preset(every(8, 90), [0, 1, 0, 0, 1, 0, 1, 1], zeros(8), 1, 650, 6500, 6700, 530, 4400, 0.24, 2.7, 240, 1.15),
  v8f: preset(every(8, 90), alt(8), zeros(8), 1, 900, 8500, 8700, 440, 6200, 0.16, 1.9, 225, 1.0),
  v12: preset(every(12, 60), alt(12), zeros(12), 1, 800, 9000, 9200, 620, 6800, 0.22, 2.2, 220, 0.85),
  vtwin: preset([0, 405], [0, 1], [0, 0.4], 0, 900, 5500, 5700, 150, 3200, 0.10, 1.4, 210, 1.45),
});

export function createPowertrain({ engine = 'i4', gears = [3.5, 2.1, 1.45, 1.1, 0.88, 0.72], reverse = 3.2, final = 3.9, shiftTime = 0.28,
  wheelInertia = 2, turbo = null, running = true } = {}) {
  const E = typeof engine === 'string' ? ENGINE_PRESETS[engine] : engine;
  if (!E) fail(`unknown engine '${engine}' (${Object.keys(ENGINE_PRESETS).join(', ')})`);
  for (const k of ['idle', 'redline', 'limiter', 'torque', 'peakRpm', 'inertia', 'pipe', 'pulseDeg', 'gain']) if (!(E[k] > 0)) fail(`engine.${k} must be a number > 0 (got ${E[k]})`);
  const cyl = a => Array.isArray(a) && a.length === E.angles.length && a.every(Number.isFinite); // the sound's firing layout (H-7)
  if (!Array.isArray(E.angles) || !E.angles.length || !cyl(E.angles) || !cyl(E.banks) || !cyl(E.header)) fail('engine.angles, banks and header must be lists of one number per cylinder');
  if (E.stereo !== 0 && E.stereo !== 1) fail(`engine.stereo must be 0 or 1 (got ${E.stereo})`);
  if (!Array.isArray(gears) || !gears.length || !gears.every(g => g > 0)) fail('gears must be a non-empty list of ratios > 0');
  for (const [k, v] of [['reverse', reverse], ['final', final], ['wheelInertia', wheelInertia]]) if (!(v > 0)) fail(`${k} must be a number > 0 (got ${v})`);
  if (!(shiftTime >= 0)) fail(`shiftTime must be a number >= 0 (got ${shiftTime})`);
  const T = turbo ? Object.freeze({ maxBoost: turbo.maxBoost ?? 1, size: turbo.size ?? 0.4, bov: turbo.bov ?? true }) : null;
  if (T && !(T.maxBoost > 0)) fail(`turbo.maxBoost must be a number > 0 (got ${T.maxBoost})`);
  if (T && !(T.size >= 0 && T.size <= 1)) fail(`turbo.size must be a number in 0..1 (got ${T.size})`);
  const st = { rpm: running ? E.idle : 0, map: running ? 0.35 : 1, thrEff: 0, fuelCut: false, limiter: false, popWin: 0, running: !!running, starter: false,
    stalled: false, crankT: 0, gear: 0, shiftT: 0, shaft: 0, boost: 0, wg: 0, thrSlow: 0, bovCool: 0, bovVent: 0, bovId: 0, bovAmp: 0, bovMode: T?.bov ? 1 : 0, wheelTorque: 0 };
  // R-8: substep inputs go through this object, not arguments or return values, so no number is boxed per call
  const k = { h: 0, Tc: 0, thrEff: 0, comb: false };
  function turboStep() { // the turbo
    const h = k.h, thrEff = k.thrEff, comb = k.comb;
    const flow = (st.rpm / E.redline) * st.map * (comb ? 1 : 0.3) * (1.35 - 0.5 * T.size), comp = 1.35 * T.maxBoost * st.shaft * st.shaft;
    st.wg = clamp((comp - T.maxBoost) / (0.35 * T.maxBoost), 0, 1);
    const target = clamp(Math.pow(flow * 1.25, 1.4), 0, 1) * (1 - 0.45 * st.wg);
    let tau = target > st.shaft ? 0.35 + 1.8 * T.size : 1.0 + 1.5 * T.size;
    if (st.bovVent > 0 && !T.bov && target < st.shaft) tau *= 0.5;
    st.shaft += (target - st.shaft) * Math.min(1, h / tau);
    const on = thrEff > 0.12, bT = on ? Math.min(comp, T.maxBoost) : 0, bTau = on ? 0.12 : st.bovVent > 0 ? (T.bov ? 0.06 : 0.5) : 0.35;
    st.boost += (bT - st.boost) * Math.min(1, h / bTau);
    st.thrSlow += (thrEff - st.thrSlow) * Math.min(1, h / 0.2);
    st.bovCool -= h; st.bovVent -= h;
    if (st.thrSlow - thrEff > 0.3 && st.boost > 0.15 && st.bovCool <= 0) { st.bovId++; st.bovAmp = clamp(st.boost / 1.2, 0.2, 1.3); st.bovMode = T.bov ? 1 : 0; st.bovCool = 0.6; st.bovVent = 0.4; }
  }
  function sub() { // manifold, fuel cut, limiter, torques for one substep of k.h; k.Tc is the clutch torque held for the step
    const h = k.h, Tc = k.Tc;
    const t = pt.throttle, thr = st.shiftT > 0 || !(t > 0) ? 0 : t < 1 ? t : 1; // NaN or undefined counts as 0
    if (st.starter) { st.crankT += h; if (st.crankT > 0.55 && st.rpm > 150) st.running = true; if ((st.running && st.rpm > E.idle * 0.7) || st.crankT > 4) st.starter = false; }
    const idleAir = st.running ? clamp(0.05 + (E.idle - st.rpm) * 0.00015, 0, 0.14) : 0, thrEff = Math.max(thr, idleAir);
    st.thrEff = thr;
    const area = 0.012 + Math.pow(thrEff, 1.6), q = 6.5e-5 * Math.max(st.rpm, 1);
    st.map += ((1 + st.boost) * clamp(area / Math.sqrt(area * area + q * q), 0.18, 1) - st.map) * Math.min(1, h / 0.06);
    if (st.running) {
      if (thr < 0.02 && st.rpm > E.idle + 500) { if (!st.fuelCut && st.rpm > 2500) st.popWin = 1; st.fuelCut = true; }
      if (thr >= 0.03 || st.rpm < E.idle + 250) st.fuelCut = false;
      if (st.rpm > E.limiter) st.limiter = true; else if (st.rpm < E.limiter - 250) st.limiter = false;
    } else { st.fuelCut = false; st.limiter = false; }
    st.popWin = thr > 0.05 ? 0 : Math.max(0, st.popWin - h / 1.8);
    const comb = st.running && !st.fuelCut;
    const d = (st.rpm - E.peakRpm) / E.redline, Tcurve = E.torque * clamp(1 - 1.3 * d * d, 0.35, 1);
    const Tind = comb ? Tcurve * Math.max(0, (st.map - 0.15) / 0.85) * (st.limiter ? 0.15 : 1) : 0;
    const Tfric = st.rpm > 1 ? E.torque * (0.04 + 0.08 * st.rpm / E.redline) + E.torque * 0.15 * Math.max(0, 1 - st.map) * Math.min(1, st.rpm / 1000) : 0;
    const Tstart = st.starter ? E.torque * 0.6 * Math.max(0, 1 - st.rpm / 320) : 0;
    if (T) { k.thrEff = thrEff; k.comb = comb; turboStep(); }
    else { st.shaft -= st.shaft * Math.min(1, h / 1.2); st.boost -= st.boost * Math.min(1, h / 0.2); st.wg = 0; st.thrSlow = thrEff; }
    st.rpm = Math.max(0, st.rpm + (Tind + Tstart - Tfric - Tc) / E.inertia * RPM_PER_RAD * h);
    if (st.running && st.rpm < 220 && !st.starter) { st.running = false; st.stalled = true; }
  }
  const pt = {
    spec: E, turbo: T, gears: gears.length, state: st, throttle: 0,
    start() { if (!st.running && !st.starter) { st.starter = true; st.crankT = 0; st.stalled = false; } return pt; },
    stop() { st.running = false; st.starter = false; return pt; },
    shift(g) {
      if (!(Number.isInteger(g) && g >= -1 && g <= gears.length)) fail(`gear must be an integer in -1..${gears.length} (got ${g})`);
      if (g !== st.gear) { st.gear = g; st.shiftT = shiftTime; }
      return pt;
    },
    // dt: the sim step; wheelOmega: the driven wheels' mean spin (rad/s, + forward); roadTorque: the torque the road put
    // back on the driven wheels last step (N m, + against forward drive; the tire backend's sum of fx × radius). Returns the
    // drive torque (N m) for the driven wheels together. A shift opens the clutch and cuts the throttle for shiftTime.
    step(dt, wheelOmega = 0, roadTorque = 0) {
      if (!(dt > 0)) fail(`dt must be a number > 0 (got ${dt})`);
      if (!Number.isFinite(wheelOmega)) fail(`wheelOmega must be a finite number (got ${wheelOmega})`);
      if (!Number.isFinite(roadTorque)) fail(`roadTorque must be a finite number (got ${roadTorque})`);
      const g = st.gear, G = st.shiftT > 0 || g === 0 ? 0 : g < 0 ? -reverse * final : gears[g - 1] * final;
      let Tc = 0;
      if (G !== 0) { // launch slips at 0.6 N m per rpm engaging from 0.9 idle, else 8; capped by capacity and by one step's transfer
        const fromWheel = wheelOmega * G * RPM_PER_RAD, slip = st.rpm - fromWheel, launch = fromWheel < E.idle;
        const engage = launch ? clamp((st.rpm - E.idle * 0.9) / 600, 0, 1) : 1;
        // the step's transfer: what closes the slip without reversing it, counting what the road takes off the wheels
        const sg = slip < 0 ? -1 : 1, room = Math.abs(slip) / (RPM_PER_RAD * dt) + sg * G * roadTorque / wheelInertia;
        const cap = Math.min(E.torque * 1.6, Math.max(0, room) / (G * G / wheelInertia + 1 / E.inertia));
        Tc = clamp(slip * (launch ? 0.6 : 8), -cap, cap) * engage;
      }
      const n = Math.max(1, Math.ceil(dt / H - 1e-9));
      k.h = dt / n; k.Tc = Tc;
      for (let i = 0; i < n; i++) sub();
      st.shiftT = Math.max(0, st.shiftT - dt);
      st.wheelTorque = Tc * G;
      return st.wheelTorque;
    },
  };
  return pt;
}
