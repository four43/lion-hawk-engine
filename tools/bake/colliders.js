// Sidecar colliders (A-5, A-6, overview §4.3). collidersOf(cls, opts) → entries in the sidecar shape: primitives fitted to a
// col-* node's own mesh bounds (oriented by the node), hulls of body-space vertices (≤ 64 points), welded trimeshes; with no
// col-* nodes, one hull per (part, material), or one col-mesh per part for static models.
import { xfPoint, decompose, qmul, r6, r6a, sub, cross, len } from './math.js';
import { hull, decimate } from './hull.js';

const S = Math.SQRT1_2;
const AXIS_Q = [[0, 0, -S, S], [0, 0, 0, 1], [S, 0, 0, S]]; // rotates +y (Rapier's capsule/cylinder axis) onto x, y, z

function positions(prim) {
  const P = prim.getAttribute('POSITION'), out = [], e = [0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); out.push([e[0], e[1], e[2]]); }
  return out;
}
function triangles(prim) {
  const I = prim.getIndices(), n = prim.getAttribute('POSITION').getCount();
  return I ? Array.from(I.getArray()) : Array.from({ length: n }, (_, i) => i);
}
// body-space area per material name over a part's primitives; the largest wins, ties to the first
function mainMaterial(node) {
  const W = node.getWorldMatrix(), area = new Map();
  for (const prim of node.getMesh().listPrimitives()) {
    const P = positions(prim).map(p => xfPoint(W, p)), I = triangles(prim), name = prim.getMaterial().getName();
    let a = area.get(name) ?? 0;
    for (let t = 0; t + 2 < I.length; t += 3) a += len(cross(sub(P[I[t + 1]], P[I[t]]), sub(P[I[t + 2]], P[I[t]]))) / 2;
    area.set(name, a);
  }
  let best = null, ba = -1;
  for (const [name, a] of area) if (a > ba) { ba = a; best = name; }
  return best;
}
function hullEntry(model, label, pts) {
  const h = hull(pts);
  if (!h || h.points.length < 4) throw new Error(`bake: ${model}: ${label} hull has fewer than 4 points`);
  const kept = h.points.length > 64 ? hull(decimate(h.points, 64)) : h;
  if (!kept) throw new Error(`bake: ${model}: ${label} hull has fewer than 4 points`);
  return { shape: 'hull', points: kept.points.flat().map(r6) };
}
function meshEntry(prims, W) {
  const keys = new Map(), vertices = [], indices = [];
  for (const prim of prims) {
    const P = positions(prim).map(p => xfPoint(W, p)), remap = P.map(p => {
      const k = p.map(v => Math.round(v * 1e6)).join(',');
      if (!keys.has(k)) { keys.set(k, vertices.length / 3); vertices.push(...p.map(r6)); }
      return keys.get(k);
    });
    for (const i of triangles(prim)) indices.push(remap[i]);
  }
  return { shape: 'mesh', vertices, indices };
}
const ID = { p: [0, 0, 0], q: [0, 0, 0, 1] };
// Contract issue (overview §4.3 says "the longest axis"): the axis is the extent whose other two are closest to equal (the
// round cross-section), so a wheel (short cylinder) and a post (tall one) both fit; a tie goes to the longest extent.
export function axisOf(half) {
  let best = -1, bd = Infinity;
  for (let k = 0; k < 3; k++) {
    const [i, j] = [0, 1, 2].filter(x => x !== k), d = Math.abs(half[i] - half[j]) / (Math.max(half[i], half[j]) || 1);
    if (d < bd - 1e-6 || (Math.abs(d - bd) <= 1e-6 && half[k] > half[best])) { bd = d; best = k; }
  }
  return best;
}

// opts: { model, static, paintBase, warn }. A flat (part, material) group gets no default hull (warned); every group flat throws.
export function collidersOf(cls, { model, static: isStatic = false, paintBase, warn = () => {} }) {
  const phys = id => (id.startsWith('paint-') ? paintBase : id);
  const out = [], flat = [];
  if (cls.cols.length) {
    for (const col of cls.cols) {
      const { node, shape, part } = col, W = node.getWorldMatrix(), prims = node.getMesh().listPrimitives();
      const material = phys(col.material ?? mainMaterial(part.node)), tail = { part: part.name, material };
      if (shape === 'hull') { out.push({ ...hullEntry(model, col.name, prims.flatMap(p => positions(p).map(v => xfPoint(W, v)))), ...ID, ...tail }); continue; }
      if (shape === 'mesh') { out.push({ ...meshEntry(prims, W), ...ID, ...tail }); continue; }
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const prim of prims) for (const p of positions(prim)) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      const { q, s } = decompose(W), half = [0, 1, 2].map(k => (hi[k] - lo[k]) / 2 * Math.abs(s[k]));
      const p = xfPoint(W, [0, 1, 2].map(k => (lo[k] + hi[k]) / 2));
      if (shape === 'box') { out.push({ shape, half: r6a(half), p: r6a(p), q: r6a(q), ...tail }); continue; }
      if (shape === 'sphere') { out.push({ shape, r: r6(Math.max(...half)), p: r6a(p), q: r6a(q), ...tail }); continue; }
      const axis = axisOf(half), r = Math.max(...half.filter((_, k) => k !== axis));
      const halfHeight = shape === 'capsule' ? Math.max(0, half[axis] - r) : half[axis];
      out.push({ shape, halfHeight: r6(halfHeight), r: r6(r), p: r6a(p), q: r6a(qmul(q, AXIS_Q[axis])), ...tail });
    }
    return out;
  }
  for (const { node, name } of cls.parts) {
    const W = node.getWorldMatrix(), prims = node.getMesh().listPrimitives();
    if (isStatic) { out.push({ ...meshEntry(prims, W), ...ID, part: name, material: phys(mainMaterial(node)) }); continue; }
    const byMat = new Map();
    for (const prim of prims) { const m = prim.getMaterial().getName(); if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(...positions(prim).map(v => xfPoint(W, v))); }
    for (const [m, pts] of byMat) {
      if (!hull(pts)) { flat.push(`${name} (${m})`); continue; }          // a flat decal or leaf card: no default hull
      out.push({ ...hullEntry(model, `${name} (${m})`, pts), ...ID, part: name, material: phys(m) });
    }
  }
  if (!out.length && flat.length) throw new Error(`bake: ${model}: ${flat.join(', ')} hull has fewer than 4 points (add col-* nodes or set colliders: false)`);
  for (const f of flat) warn(`bake: ${model}: ${f} is flat, so it has no default hull`);
  return out;
}

export function boundsOf(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { node } of parts) {
    const W = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) for (const p of positions(prim)) {
      const w = xfPoint(W, p); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
    }
  }
  if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: r6a(min), max: r6a(max) };
}
