// src/sim/forecast.js: extrapolated remote poses (N-11)
// M-65, M-66: another player's train bodies as this device draws them: forecast from the newest record with its velocity (dead reckoning, the way
// a local physics body moves on between steps), not played back 100-300 ms late. A new record that disagrees with the forecast never makes the
// train jump: the difference is kept as a correction that fades out (FORECAST.blend). Everything is reused: nothing is allocated per frame.
export const FORECAST = { horizon: 250, blend: 0.1, snap: 4 }; // ms: forecast at most this far past the newest record (then it holds); s: a correction fades with this time constant; m: a bigger one jumps (a new farm, a respawn)
import { qmul, rotate } from '../core/math.js'; // the shared math helpers
export { qmul, rotate };
const v3 = () => ({ x: 0, y: 0, z: 0 }), q4 = () => ({ x: 0, y: 0, z: 0, w: 1 });
export const newPose = () => ({ p: v3(), q: q4() });
const norm = q => { const n = Math.hypot(q.x, q.y, q.z, q.w) || 1; q.x /= n; q.y /= n; q.z /= n; q.w /= n; return q; };
const spin = q4(), inv = q4(), STILL = v3();
// a body record { p, q, v, w } moved on h seconds: straight at its velocity, turned at its (world) spin
export function extrapolate(b, h, out) { // a record with no velocity holds still
  const v = b.v || STILL, w = b.w || STILL; out.p.x = b.p.x + v.x * h; out.p.y = b.p.y + v.y * h; out.p.z = b.p.z + v.z * h;
  const wx = w.x, wy = w.y, wz = w.z, m = Math.hypot(wx, wy, wz), a = m * h / 2, s = m > 1e-9 ? Math.sin(a) / m : 0;
  spin.x = wx * s; spin.y = wy * s; spin.z = wz * s; spin.w = Math.cos(a);
  out.q.x = b.q.x; out.q.y = b.q.y; out.q.z = b.q.z; out.q.w = b.q.w; norm(qmul(spin, out.q, out.q)); return out;
}
// One remote train: push(time, bodies) the newest record's bodies; sample(senderNow, now) sets poses[i] (the drawn bodies).
// senderNow: the sender's clock now, as far as this device knows it; now: this device's clock (for the fade).
export function createForecast(n = 3) {
  const poses = Array.from({ length: n }, newPose), target = Array.from({ length: n }, newPose), err = Array.from({ length: n }, newPose);
  let bodies = null, time = 0, next = null, nextTime = 0, last = null;
  const zero = E => { E.p.x = E.p.y = E.p.z = 0; E.q.x = E.q.y = E.q.z = 0; E.q.w = 1; };
  const aim = senderNow => { const h = Math.min(FORECAST.horizon, Math.max(0, senderNow - time)) / 1000; for (let i = 0; i < n; i++) extrapolate(bodies[i], h, target[i]); };
  const compose = i => { const T = target[i], E = err[i], P = poses[i]; P.p.x = T.p.x + E.p.x; P.p.y = T.p.y + E.p.y; P.p.z = T.p.z + E.p.z; norm(qmul(E.q, T.q, P.q)); };
  return {
    poses,
    get time() { return time; },
    push(t, b) { next = b; nextTime = t; }, // taken at the next sample, where the old forecast has the train then
    sample(senderNow, now) {
      if (!bodies && !next) return false;
      const keep = bodies && last !== null;
      if (keep) { aim(senderNow); const fade = Math.exp(-Math.max(0, now - last) / 1000 / FORECAST.blend); // the old forecast, now, with its correction fading
        for (let i = 0; i < n; i++) { const E = err[i]; E.p.x *= fade; E.p.y *= fade; E.p.z *= fade; E.q.x *= fade; E.q.y *= fade; E.q.z *= fade; E.q.w = 1 - (1 - E.q.w) * fade; norm(E.q); compose(i); } }
      if (next) { bodies = next; time = nextTime; next = null; aim(senderNow);
        for (let i = 0; i < n; i++) { const T = target[i], E = err[i], P = poses[i];
          if (keep) { // the train stays where the old forecast drew it: the difference to the new one fades out
            E.p.x = P.p.x - T.p.x; E.p.y = P.p.y - T.p.y; E.p.z = P.p.z - T.p.z;
            inv.x = -T.q.x; inv.y = -T.q.y; inv.z = -T.q.z; inv.w = T.q.w; qmul(P.q, inv, E.q); if (E.q.w < 0) { E.q.x = -E.q.x; E.q.y = -E.q.y; E.q.z = -E.q.z; E.q.w = -E.q.w; } }
          if (!keep || Math.hypot(E.p.x, E.p.y, E.p.z) > FORECAST.snap) zero(E); // the first record (or a restart), or a jump (a respawn): as it is
          compose(i); }
      }
      last = now; return true;
    },
    restart() { last = null; }, // the next sample shows the forecast as it is, with no fade from the old place (a new farm)
  };
}
