// [A-5] aero panels and the closed volume (phase 8, design §6.3), in body space. Each part's triangles are bucketed by
// the nearest of 26 directions (faces, edges, corners of a cube): a bucket is one panel with its total area `a`, its
// area-weighted unit normal `n` and its area-weighted centroid `c`. The volume and its centroid come from the divergence
// theorem over every part (signed tetrahedra from the origin), so they are right for closed, outward-wound meshes.
import { xfPoint, sub, cross, len, r6, r6a } from './math.js';

const DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS.push([x / l, y / l, z / l]); }

export function aeroOf(parts) {
  const panels = [];
  let vol = 0; const vc = [0, 0, 0];
  for (const { node, name } of parts) {
    const W = node.getWorldMatrix(), acc = DIRS.map(() => ({ a: 0, n: [0, 0, 0], c: [0, 0, 0] }));
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), e = [0, 0, 0], pts = [];
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); pts.push(xfPoint(W, e)); }
      const idx = I ? I.getArray() : Array.from({ length: pts.length }, (_, i) => i);
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const p0 = pts[idx[t]], p1 = pts[idx[t + 1]], p2 = pts[idx[t + 2]], cr = cross(sub(p1, p0), sub(p2, p0)), a2 = len(cr);
        const v6 = p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0]);
        vol += v6 / 6; for (let k = 0; k < 3; k++) vc[k] += v6 / 6 * (p0[k] + p1[k] + p2[k]) / 4;
        if (a2 < 1e-12) continue;
        const n = [cr[0] / a2, cr[1] / a2, cr[2] / a2], a = a2 / 2;
        let best = 0, bd = -Infinity;
        DIRS.forEach((d, k) => { const s = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (s > bd + 1e-9) { bd = s; best = k; } });
        const b = acc[best]; b.a += a;
        for (let k = 0; k < 3; k++) { b.n[k] += n[k] * a; b.c[k] += (p0[k] + p1[k] + p2[k]) / 3 * a; }
      }
    }
    for (const b of acc) {
      const nl = len(b.n);
      if (b.a < 1e-9 || nl < 1e-9) continue;
      panels.push({ part: name, a: r6(b.a), n: r6a(b.n.map(v => v / nl)), c: r6a(b.c.map(v => v / b.a)) });
    }
  }
  const volume = Math.abs(vol) < 1e-12 ? 0 : vol;
  return { panels, volume: r6(Math.max(0, volume)), centroid: volume > 0 ? r6a(vc.map(v => v / vol)) : [0, 0, 0] };
}
