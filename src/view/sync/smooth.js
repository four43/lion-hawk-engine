// N-15 view smoothing (overview §4.9, with 3i). A correction's drawn-pose jump (e.netFix: dp = old - new position, dq = old (x)
// new^-1, world frame) is added to the entity's offset, which then fades linearly to nothing over smoothMs of view time from the
// latest correction. The drawn pose is p + offset.p and offset.q (x) q, so a correction never makes the mesh jump. An offset is a
// plain object of numbers made once per entity; nothing here allocates.
export const newOffset = () => ({ px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, left: 0, seq: -1 });
export const active = o => o.left > 0;
function zero(o) { o.px = o.py = o.pz = 0; o.qx = o.qy = o.qz = 0; o.qw = 1; o.left = 0; }

// fix = { seq, dp: [x, y, z], dq: [x, y, z, w] }; smoothMs <= 0 (or missing) means no smoothing: the offset is cleared
export function addFix(o, fix, smoothMs) {
  o.seq = fix.seq;
  if (!(smoothMs > 0)) { zero(o); return o; }
  const dp = fix.dp, dq = fix.dq;
  o.px += dp[0]; o.py += dp[1]; o.pz += dp[2];
  const ax = o.qx, ay = o.qy, az = o.qz, aw = o.qw, bx = dq[0], by = dq[1], bz = dq[2], bw = dq[3]; // o.q <- o.q (x) dq
  let x = aw * bx + ax * bw + ay * bz - az * by, y = aw * by - ax * bz + ay * bw + az * bx, z = aw * bz + ax * by - ay * bx + az * bw, w = aw * bw - ax * bx - ay * by - az * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; } // the short way round, so the fade never spins the long way
  const n = Math.hypot(x, y, z, w) || 1;
  o.qx = x / n; o.qy = y / n; o.qz = z / n; o.qw = w / n;
  o.left = smoothMs / 1000;
  return o;
}
export function fade(o, dt) {
  if (!(o.left > 0) || !(dt > 0)) return o;
  if (dt >= o.left) { zero(o); return o; }
  const f = 1 - dt / o.left; // linear in time: remaining / total stays on the line from the latest correction
  o.left -= dt; o.px *= f; o.py *= f; o.pz *= f;
  const x = o.qx * f, y = o.qy * f, z = o.qz * f, w = 1 - f + o.qw * f, n = Math.hypot(x, y, z, w) || 1; // nlerp from identity
  o.qx = x / n; o.qy = y / n; o.qz = z / n; o.qw = w / n;
  return o;
}
// p: { x, y, z } (a Vector3), q: a THREE.Quaternion (set once, so its onChange runs once)
export function applyOffset(o, p, q) {
  if (!(o.left > 0)) return;
  p.x += o.px; p.y += o.py; p.z += o.pz;
  const ax = o.qx, ay = o.qy, az = o.qz, aw = o.qw, bx = q.x, by = q.y, bz = q.z, bw = q.w; // q <- o.q (x) q
  q.set(aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz);
}
