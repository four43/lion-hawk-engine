// Convex hull for col-hull and the default per-(part, material) hulls (A-6). Incremental hull over points in input order, so
// the result is deterministic. hull(points) → { points: [[x,y,z]...], tris: [[i,j,k]...] } with outward winding, or null when
// the points span no volume. decimate(points, max) keeps the support points of `max` fixed directions (Fibonacci sphere).
import { sub, dot, cross, len } from './math.js';

export function hull(input) {
  const seen = new Map(), pts = [];
  for (const p of input) { const k = p.map(v => Math.round(v * 1e6)).join(','); if (!seen.has(k)) { seen.set(k, pts.length); pts.push(p); } }
  if (pts.length < 4) return null;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const eps = 1e-7 * Math.max(1e-9, len(sub(hi, lo)));
  // initial tetrahedron: x extremes, the point farthest from that line, the point farthest from that plane
  let a = 0, b = 0;
  for (let i = 1; i < pts.length; i++) { if (pts[i][0] < pts[a][0]) a = i; if (pts[i][0] > pts[b][0]) b = i; }
  if (a === b) { let best = -1; for (let i = 0; i < pts.length; i++) { const d = len(sub(pts[i], pts[a])); if (d > best) { best = d; b = i; } } }
  const ab = sub(pts[b], pts[a]);
  let c = -1, bc = eps;
  for (let i = 0; i < pts.length; i++) { const d = len(cross(ab, sub(pts[i], pts[a]))) / (len(ab) || 1); if (d > bc) { bc = d; c = i; } }
  if (c < 0) return null;
  const n0 = cross(ab, sub(pts[c], pts[a])), nl = len(n0);
  let d4 = -1, bd = eps;
  for (let i = 0; i < pts.length; i++) { const d = Math.abs(dot(n0, sub(pts[i], pts[a]))) / nl; if (d > bd) { bd = d; d4 = i; } }
  if (d4 < 0) return null;
  const centre = [0, 1, 2].map(k => (pts[a][k] + pts[b][k] + pts[c][k] + pts[d4][k]) / 4);
  let faces = [];
  const face = (i, j, k) => {
    let n = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    if (dot(n, sub(centre, pts[i])) > 0) { [j, k] = [k, j]; n = n.map(v => -v); }
    const l = len(n) || 1; n = n.map(v => v / l);
    return { v: [i, j, k], n, d: dot(n, pts[i]) };
  };
  faces.push(face(a, b, c), face(a, b, d4), face(a, c, d4), face(b, c, d4));
  for (let p = 0; p < pts.length; p++) {
    if (p === a || p === b || p === c || p === d4) continue;
    const vis = faces.filter(f => dot(f.n, pts[p]) - f.d > eps);
    if (!vis.length) continue;
    const edges = new Set();
    for (const f of vis) for (let e = 0; e < 3; e++) edges.add(f.v[e] + ',' + f.v[(e + 1) % 3]);
    const horizon = [];
    for (const f of vis) for (let e = 0; e < 3; e++) {
      const i = f.v[e], j = f.v[(e + 1) % 3];
      if (!edges.has(j + ',' + i)) horizon.push([i, j]);
    }
    faces = faces.filter(f => !vis.includes(f));
    for (const [i, j] of horizon) {
      let n = cross(sub(pts[j], pts[i]), sub(pts[p], pts[i])); const l = len(n) || 1; n = n.map(v => v / l);
      faces.push({ v: [i, j, p], n, d: dot(n, pts[i]) });
    }
  }
  const used = [...new Set(faces.flatMap(f => f.v))].sort((x, y) => x - y), remap = new Map(used.map((v, i) => [v, i]));
  return { points: used.map(i => pts[i]), tris: faces.map(f => f.v.map(v => remap.get(v))) };
}

export function decimate(points, max = 64) {
  if (points.length <= max) return points;
  const out = new Set(), g = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < max; k++) {
    const y = 1 - (2 * k + 1) / max, r = Math.sqrt(1 - y * y), dir = [Math.cos(g * k) * r, y, Math.sin(g * k) * r];
    let best = 0, bd = -Infinity;
    for (let i = 0; i < points.length; i++) { const d = dot(points[i], dir); if (d > bd) { bd = d; best = i; } }
    out.add(best);
  }
  return [...out].sort((x, y) => x - y).map(i => points[i]);
}
