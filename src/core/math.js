// Plain-object vector and quaternion math with no three.js, so the sim and the net layer can use it headless.
// Every per-step function writes into `out` (which may alias an input) and allocates nothing (R-8).
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const q4 = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w });

// out = a * b (Hamilton product)
export function qmul(a, b, out) {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x; out.y = y; out.z = z; out.w = w; return out;
}
// out = v rotated by q (conj: by its inverse)
export function rotate(q, v, out, conj = false) {
  const s = conj ? -1 : 1, qx = q.x * s, qy = q.y * s, qz = q.z * s, qw = q.w;
  const tx = 2 * (qy * v.z - qz * v.y), ty = 2 * (qz * v.x - qx * v.z), tz = 2 * (qx * v.y - qy * v.x);
  const x = v.x + qw * tx + (qy * tz - qz * ty), y = v.y + qw * ty + (qz * tx - qx * tz), z = v.z + qw * tz + (qx * ty - qy * tx);
  out.x = x; out.y = y; out.z = z; return out;
}
export const qnorm = q => { const n = Math.hypot(q.x, q.y, q.z, q.w) || 1; q.x /= n; q.y /= n; q.z /= n; q.w /= n; return q; };
export function qslerp(a, b, t, out) {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w, d = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; } // the short way round
  let ka = 1 - t, kb = t;
  if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); ka = Math.sin(ka * th) / s; kb = Math.sin(kb * th) / s; }
  out.x = a.x * ka + bx * kb; out.y = a.y * ka + by * kb; out.z = a.z * ka + bz * kb; out.w = a.w * ka + bw * kb;
  return qnorm(out);
}
export function vlerp(a, b, t, out) { out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; return out; }
export function qFromYaw(yaw, out) { out.x = 0; out.y = Math.sin(yaw / 2); out.z = 0; out.w = Math.cos(yaw / 2); return out; }

// Column-major mat4 on plain arrays (like three/gl), for tools such as the bake. These allocate.
export const mIdent = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mMul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
export function mTRS(t, q, s) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
export const xfP = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
export const xfN = (m, v) => { const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; const l = Math.hypot(...r) || 1; return r.map(x => x / l); };
