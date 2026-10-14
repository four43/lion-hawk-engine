// src/sim/net/remote.js
// Remote entities (N-12..N-16): the driven actor's input queue, the latency rule, snapshot projection, snap-or-nudge, the nudge
// servo, and the pose writers for proxy (kinematic next pose) and view (pool). Every function writes into objects made at spawn.
import { extrapolate, newPose } from '../forecast.js';
import { qmul } from '../../core/math.js';
import { copyActions, zeroActions } from './replicate.js';

export const QUEUE = Object.freeze({ cap: 16, high: 4, keep: 2 }); // N-13: past `high` the queue drops to the newest `keep`
export const LEAD_MS = 250; // the longest projection (as FORECAST.horizon)
export const SHARED_MS = 1000; // an interp offset outside [0, SHARED_MS] means the two clocks are not shared: no projection (Contract issue 4)
export const MAX_ANGLE = Math.PI / 6; // N-14: 30 degrees

// N-13: one remote driven actor's inputs by owner step. offer(batch) takes a record's { s, list } (list[i] is owner step
// s - (len - 1 - i)); take(out) copies the oldest into out each local step, holds out when empty, and drops to the newest
// `keep` when more than `high` wait.
export function createInputQueue(f) {
  const slots = Array.from({ length: QUEUE.cap }, () => ({ s: 0, v: zeroActions(f) }));
  let head = 0, n = 0, last = -1, used = -1;
  return {
    get size() { return n; }, get used() { return used; }, get last() { return last; },
    offer(batch) {
      const len = batch.list.length;
      for (let i = 0; i < len; i++) {
        const s = batch.s - (len - 1 - i); if (s <= last) continue;
        if (n === QUEUE.cap) { head = (head + 1) % QUEUE.cap; n--; } // full: the oldest goes
        const x = slots[(head + n) % QUEUE.cap]; x.s = s; copyActions(f, batch.list[i], x.v); n++; last = s;
      }
    },
    take(out) {
      if (n > QUEUE.high) { head = (head + n - QUEUE.keep) % QUEUE.cap; n = QUEUE.keep; }
      if (!n) return false;
      const x = slots[head]; copyActions(f, x.v, out); used = x.s; head = (head + 1) % QUEUE.cap; n--; return true;
    },
    clear() { head = 0; n = 0; last = -1; used = -1; },
  };
}
// N-14: the one-way latency, from the interp offset (receiver clock - sender clock, least-delayed message). It is the latency only
// when both clocks are the same clock (mp, peers); otherwise the snapshot is used as it is.
export const latencyMs = offset => offset >= 0 && offset <= SHARED_MS ? Math.min(offset, LEAD_MS) : 0;
export const newTarget = () => { const t = newPose(); t.v = { x: 0, y: 0, z: 0 }; t.w = { x: 0, y: 0, z: 0 }; t.left = 0; return t; };
// N-14: a body snapshot { p, q, v, w } moved on by latMs, into the target t (velocity and spin kept)
export function project(rec, latMs, t) {
  extrapolate(rec, latMs / 1000, t);
  t.v.x = rec.v.x; t.v.y = rec.v.y; t.v.z = rec.v.z; t.w.x = rec.w.x; t.w.y = rec.w.y; t.w.z = rec.w.z; return t;
}
const ERR = { d: 0, angle: 0 };
export function poseError(p, q, t, out = ERR) {
  out.d = Math.hypot(t.p.x - p.x, t.p.y - p.y, t.p.z - p.z);
  out.angle = 2 * Math.acos(Math.min(1, Math.abs(q.x * t.q.x + q.y * t.q.y + q.z * t.q.z + q.w * t.q.w))); return out;
}
export const decide = (err, tune) => err.d < tune.snapAt && err.angle < MAX_ANGLE ? 'nudge' : 'snap';
const inv = { x: 0, y: 0, z: 0, w: 1 }, dq = { x: 0, y: 0, z: 0, w: 1 }, tmp = newPose();
// one nudge step (N-14): velocities = the target's + the error over the steps left (the error shrinks by (1 - 1/left) a step and is
// gone after `nudge` steps); then the target moves on by dt. Returns the steps left.
export function nudgeVelocity(c, p, q, dt, outV, outW) {
  const k = 1 / (c.left * dt);
  outV.x = c.v.x + (c.p.x - p.x) * k; outV.y = c.v.y + (c.p.y - p.y) * k; outV.z = c.v.z + (c.p.z - p.z) * k;
  inv.x = -q.x; inv.y = -q.y; inv.z = -q.z; inv.w = q.w; qmul(c.q, inv, dq);
  if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
  const s = Math.hypot(dq.x, dq.y, dq.z), m = s > 1e-9 ? 2 * Math.atan2(s, dq.w) / s : 2; // rotation vector = axis * angle (world frame)
  outW.x = c.w.x + dq.x * m * k; outW.y = c.w.y + dq.y * m * k; outW.z = c.w.z + dq.z * m * k;
  extrapolate(c, dt, tmp); c.p.x = tmp.p.x; c.p.y = tmp.p.y; c.p.z = tmp.p.z; c.q.x = tmp.q.x; c.q.y = tmp.q.y; c.q.z = tmp.q.z; c.q.w = tmp.q.w;
  return --c.left;
}
// proxy: the kinematic body's next pose (Rapier moves it in the step; lh.physics.read writes curr)
export function writeKinematic(ent, pose) { ent.body.setNextKinematicTranslation(pose.p); ent.body.setNextKinematicRotation(pose.q); }
// view: the pool's current slot (prev was copied by lh.world.swap)
export function writePool(ent, pose) {
  const P = ent.xf.p, Q = ent.xf.q; P.x = pose.p.x; P.y = pose.p.y; P.z = pose.p.z; Q.x = pose.q.x; Q.y = pose.q.y; Q.z = pose.q.z; Q.w = pose.q.w;
}
const conj = { x: 0, y: 0, z: 0, w: 1 }, jump = { x: 0, y: 0, z: 0, w: 1 };
// §4.9 / N-15, 3g's convention (contract-issues 3g #2): the drawn-pose jump of a snap, dp = old - new and dq = old (x) new^-1 (world
// frame), so the view's drawn pose new + dp, dq (x) new is the old one; it fades that over world.net.tunables[e.net].smoothMs
export function setNetFix(ent, oldP, oldQ, newP, newQ) {
  const f = ent.netFix ??= { seq: 0, dp: [0, 0, 0], dq: [0, 0, 0, 1] };
  f.dp[0] = oldP.x - newP.x; f.dp[1] = oldP.y - newP.y; f.dp[2] = oldP.z - newP.z;
  conj.x = -newQ.x; conj.y = -newQ.y; conj.z = -newQ.z; conj.w = newQ.w; qmul(oldQ, conj, jump);
  f.dq[0] = jump.x; f.dq[1] = jump.y; f.dq[2] = jump.z; f.dq[3] = jump.w; f.seq++; return f;
}
