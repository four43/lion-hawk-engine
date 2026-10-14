// Mass properties of sidecar colliders, computed the way Rapier (parry) does (A-5): per-shape volume, centre and inertia, moved
// into body space and summed with the parallel-axis rule, then diagonalised. massOf(colliders, density) →
// { mass, com, inertia: principal [ix, iy, iz], frame: quaternion of the principal axes }. density(id) → kg/m³.
import { qmat, matq, cross, sub, dot } from './math.js';
import { hull } from './hull.js';

// [volume, local centre, 3x3 inertia per unit density about that centre]
function shapeProps(c) {
  const Z = [0, 0, 0];
  if (c.shape === 'box') {
    const [x, y, z] = c.half, v = 8 * x * y * z;
    return [v, Z, diag(v / 3 * (y * y + z * z), v / 3 * (x * x + z * z), v / 3 * (x * x + y * y))];
  }
  if (c.shape === 'sphere') { const v = 4 / 3 * Math.PI * c.r ** 3, i = 0.4 * v * c.r * c.r; return [v, Z, diag(i, i, i)]; }
  if (c.shape === 'cylinder' || c.shape === 'capsule') {
    const r = c.r, h = 2 * c.halfHeight, vc = Math.PI * r * r * h;
    let ix = vc * (h * h / 12 + r * r / 4), iy = vc * r * r / 2, v = vc;
    if (c.shape === 'capsule') { const vb = 4 / 3 * Math.PI * r ** 3; v += vb; iy += 0.4 * vb * r * r; ix += 0.4 * vb * r * r + vb * (h * h / 4 + 3 * h * r / 8); }
    return [v, Z, diag(ix, iy, ix)];
  }
  if (c.shape === 'mesh') return polyProps(c.indices, c.vertices);
  if (c.shape === 'hull') {
    const pts = []; for (let i = 0; i < c.points.length; i += 3) pts.push([c.points[i], c.points[i + 1], c.points[i + 2]]);
    const h = hull(pts); return h ? polyProps(h.tris.flat(), h.points.flat()) : [0, [0, 0, 0], diag(0, 0, 0)];
  }
  throw new Error(`mass: unknown shape '${c.shape}'`);
}
const diag = (x, y, z) => [[x, 0, 0], [0, y, 0], [0, 0, z]];

// closed triangle mesh: signed tetrahedra from the origin, covariance form (Blow & Binstock)
function polyProps(tris, flat) {
  const P = i => [flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]];
  let vol = 0; const cm = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let t = 0; t < tris.length; t += 3) {
    const a = P(tris[t]), b = P(tris[t + 1]), c = P(tris[t + 2]), det = dot(a, cross(b, c)), v = det / 6;
    vol += v;
    for (let k = 0; k < 3; k++) cm[k] += v * (a[k] + b[k] + c[k]) / 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      C[i][j] += det / 120 * (a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + (a[i] + b[i] + c[i]) * (a[j] + b[j] + c[j]));
  }
  if (Math.abs(vol) < 1e-12) return [0, [0, 0, 0], diag(0, 0, 0)];
  const com = cm.map(x => x / vol);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] -= vol * com[i] * com[j];
  const tr = C[0][0] + C[1][1] + C[2][2];
  const I = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? tr : 0) - C[i][j]));
  return [vol, com, I];
}

// symmetric 3x3 → eigenvalues and eigenvectors (columns), cyclic Jacobi
function jacobi(A) {
  const a = A.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], V };
}

export function massOf(colliders, density) {
  let mass = 0; const com = [0, 0, 0], parts = [];
  for (const c of colliders) {
    const [v, lc, I] = shapeProps(c), m = v * density(c.material);
    if (!(m > 0)) continue;
    const R = qmat(c.q), wc = [0, 1, 2].map(i => c.p[i] + R[i][0] * lc[0] + R[i][1] * lc[1] + R[i][2] * lc[2]);
    // R (I·m) Rᵀ
    const Ib = [0, 1, 2].map(i => [0, 1, 2].map(j => { let s = 0; for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += R[i][k] * I[k][l] * R[j][l]; return s * density(c.material); }));
    parts.push({ m, c: wc, I: Ib }); mass += m; for (let k = 0; k < 3; k++) com[k] += m * wc[k];
  }
  if (!(mass > 0)) return { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] };
  for (let k = 0; k < 3; k++) com[k] /= mass;
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { m, c, I } of parts) {
    const d = sub(c, com), dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[i][j] += I[i][j] + m * ((i === j ? dd : 0) - d[i] * d[j]);
  }
  const { values, V } = jacobi(T);
  if (V[0][0] * (V[1][1] * V[2][2] - V[1][2] * V[2][1]) - V[0][1] * (V[1][0] * V[2][2] - V[1][2] * V[2][0]) + V[0][2] * (V[1][0] * V[2][1] - V[1][1] * V[2][0]) < 0)
    for (let k = 0; k < 3; k++) V[k][2] = -V[k][2];
  return { mass, com, inertia: values, frame: matq(V) };
}
