// kit-vehicle's tire model (spec §3.2 `tire.*`, design §3.5 and §7.3), ported from Rally (games/rally/src/tire.js and
// surface.js, 2026-10): brush-style contact patch deflection with relaxation lengths, feeding a normalised combined-slip
// Magic Formula. Pure maths, sim-pure, allocation-free per call (the result object is the caller's).

// Normalised Magic Formula: F/D for normalised slip rho >= 0 (E = 0). With B = tan(pi / 2C) the peak (1) is at rho = 1.
export const mfNorm = (rho, s) => Math.sin(s.C * Math.atan(s.B * rho));

// The parameters every tire shares (Rally's TIRE, playtested on both its cars).
export const TIRE = Object.freeze({
  sigmaX: 0.12,    // longitudinal relaxation length (m)
  sigmaY: 0.30,    // lateral relaxation length (m)
  loadRef: 3500,   // Fz0 (N) for load sensitivity
  loadSens: 0.12,  // peak mu falls 12 % per +100 % load
  rhoMax: 4,       // clamp on normalised patch deflection (full slide)
  lowSpeed: 3,     // m/s below which the patch damper fades in
  apLoad: 0.5,     // peak slip angle grows as (Fz/Fz0)^apLoad: cornering stiffness is sublinear in load
});

// A material's (or pair's) tire block { mu, C, kp, ap, crr, drag } as a surface: frozen, with B for a peak at rho = 1.
const cache = new WeakMap();
export function surfaceOf(tire) {
  let s = cache.get(tire);
  if (!s) cache.set(tire, s = Object.freeze({ mu: tire.mu, C: tire.C, kp: tire.kp, ap: tire.ap, crr: tire.crr, drag: tire.drag, B: Math.tan(Math.PI / (2 * tire.C)) }));
  return s;
}
// the kit's surface when the ground has no tire data: dry asphalt (the base library's `asphalt`)
export const DEFAULT_SURFACE = surfaceOf({ mu: 0.9, C: 1.4, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 });

// Advance a wheel's patch state st = { dx, dy } (m) over h seconds and write the contact-frame forces into out:
// out.fx, out.fy (N), out.rho (normalised slip), out.kappa (slip ratio), out.alpha (slip angle, rad).
// vsx: longitudinal slip velocity (omega r - vx); vy: lateral contact velocity; vx: longitudinal contact velocity;
// fz: normal load (N); surf: a surfaceOf() entry; cx, cy: low-speed damper gains (N per m/s, kept under each axis'
// stability limit by the caller); apScale: this tire's peak slip angle multiplier (< 1 is stiffer).
export function tireStep(out, st, vsx, vy, vx, fz, surf, h, cx, cy, apScale = 1) {
  const T = TIRE, avx = Math.abs(vx);
  // deflection dynamics: d' = slip velocity - (|vx| / sigma) d (exact exponential decay)
  st.dx = st.dx * Math.exp(-avx / T.sigmaX * h) + vsx * h;
  st.dy = st.dy * Math.exp(-avx / T.sigmaY * h) - vy * h;
  let kappa = st.dx / T.sigmaX, tanA = st.dy / T.sigmaY; // the slips the deflection implies
  const load = Math.max(fz, 0);
  const ap = surf.ap * apScale * Math.min(1.6, Math.max(0.6, load / T.loadRef)) ** T.apLoad;
  let nx = kappa / surf.kp, ny = tanA / Math.tan(ap), rho = Math.hypot(nx, ny);
  if (rho > T.rhoMax) { // full slide: clamp the deflection so it cannot wind up
    const k = T.rhoMax / rho;
    st.dx *= k; st.dy *= k; nx *= k; ny *= k; kappa *= k; tanA *= k; rho = T.rhoMax;
  }
  const D = surf.mu * Math.max(0.5, 1 - T.loadSens * (load / T.loadRef - 1)) * load;
  let fx = 0, fy = 0;
  if (rho > 1e-9) { const f = D * mfNorm(rho, surf) / rho; fx = f * nx; fy = f * ny; }
  const w = Math.max(0, 1 - Math.hypot(vx, vy) / T.lowSpeed); // low-speed patch damper: no rocking when nearly stopped
  if (w > 0 && load > 0) {
    fx += cx * w * vsx; fy -= cy * w * vy;
    const fm = Math.hypot(fx, fy);
    if (fm > D) { fx *= D / fm; fy *= D / fm; }
  }
  out.fx = fx; out.fy = fy; out.rho = rho; out.kappa = kappa; out.alpha = Math.atan(tanA);
  return out;
}
