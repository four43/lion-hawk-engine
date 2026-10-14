// src/defs/sidecar.js
// Physics sidecar schema (A-5..A-7; overview §4.3, D2). Validates baked/phys.json, each model's sidecar in it, and the
// inline collider entries that spawn({ colliders }) takes (the same shape, with p, q and part optional). Plain data:
// the sim, the bake (Node) and tests import it. Validators return their input unchanged or throw on the first error.
export const SIDECAR_VERSION = 1;
export const SHAPES = Object.freeze(['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh']);
export const MAX_HULL_POINTS = 64;

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const show = v => {
  let s;
  if (typeof v === 'string') s = `'${v}'`;
  else if (typeof v === 'number' || v === undefined || typeof v === 'function') s = String(v);
  else if (ArrayBuffer.isView(v)) s = `${v.constructor.name}(${v.length})`;
  else { try { s = JSON.stringify(v); } catch { s = String(v); } }
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const nums = v => (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) && Array.prototype.every.call(v, finite);
const vec3 = v => nums(v) && v.length === 3;
const quat = v => nums(v) && v.length === 4 && Math.abs(Math.hypot(v[0], v[1], v[2], v[3]) - 1) < 1e-3;
const name = v => typeof v === 'string' && v.length > 0;

const SHAPE_FIELDS = { box: ['half', 'round'], sphere: ['r'], capsule: ['halfHeight', 'r'], cylinder: ['halfHeight', 'r'], hull: ['points'], mesh: ['vertices', 'indices'] };
const COMMON = ['shape', 'p', 'q', 'part', 'material'];

// One collider entry. where: the message prefix ('sidecar: tractor', "spawn 'pig'"); path: 'colliders[2]'.
// materials: a registry (optional) whose has() every material must pass; parts: the model's part names (optional).
// inline: true for spawn({ colliders }) entries, where p, q and part may be left out.
export function validateCollider(c, { where = 'collider', path = 'collider', materials, parts, inline = false } = {}) {
  const fail = (field, problem, v) => { throw new Error(`${where}: ${path}${field ? '.' + field : ''} ${problem} (got ${show(v)})`); };
  if (!isPlain(c)) fail('', 'must be an object', c);
  if (!SHAPES.includes(c.shape)) fail('shape', c.shape === 'ball' ? "unknown shape (use 'sphere')" : `unknown shape (one of ${SHAPES.join(', ')})`, c.shape);
  const allowed = [...COMMON, ...SHAPE_FIELDS[c.shape]];
  for (const k of Object.keys(c)) if (!allowed.includes(k)) fail(k, `unknown field for a ${c.shape}`, c[k]);
  if (c.p !== undefined || !inline) { if (!vec3(c.p)) fail('p', 'must be 3 numbers', c.p); }
  if (c.q !== undefined || !inline) { if (!quat(c.q)) fail('q', 'must be a unit quaternion [x, y, z, w]', c.q); }
  if (c.part !== undefined || !inline) {
    if (!name(c.part)) fail('part', 'must be a non-empty string', c.part);
    if (parts && !parts.includes(c.part)) fail('part', 'names an unknown part', c.part);
  }
  if (!name(c.material)) fail('material', 'must be a non-empty string', c.material);
  if (c.material.startsWith('paint-')) fail('material', 'is a paint slot; colliders take its base material (A-4)', c.material);
  if (materials && !materials.has(c.material)) fail('material', 'names an unknown material', c.material);
  const pos = k => { if (!finite(c[k]) || c[k] <= 0) fail(k, 'must be a number > 0', c[k]); };
  switch (c.shape) {
    case 'box':
      if (!vec3(c.half) || !Array.prototype.every.call(c.half, x => x > 0)) fail('half', 'must be 3 numbers > 0', c.half);
      // round: optional border radius, Rapier roundCuboid (3c; Rally's hull, 3j #1). Rapier adds it OUTSIDE half, so it may
      // exceed half (Rally: half y 0.04, round 0.2).
      if (c.round !== undefined && (!finite(c.round) || c.round <= 0)) fail('round', 'must be a number > 0', c.round);
      break;
    case 'sphere': pos('r'); break;
    case 'capsule': case 'cylinder': pos('halfHeight'); pos('r'); break;
    case 'hull': {
      const n = nums(c.points) && c.points.length % 3 === 0 ? c.points.length / 3 : -1;
      if (n < 4 || n > MAX_HULL_POINTS) fail('points', `must be 4–${MAX_HULL_POINTS} points as a flat [x, y, z, ...] list`, c.points);
      break;
    }
    case 'mesh': {
      if (!nums(c.vertices) || c.vertices.length % 3 !== 0 || c.vertices.length < 9) fail('vertices', 'must be at least 3 points as a flat [x, y, z, ...] list', c.vertices);
      const nv = c.vertices.length / 3;
      if (!nums(c.indices) || c.indices.length % 3 !== 0 || c.indices.length < 3) fail('indices', 'must be whole triangles (a multiple of 3, at least 3)', c.indices);
      for (let i = 0; i < c.indices.length; i++) { const x = c.indices[i]; if (!Number.isInteger(x) || x < 0 || x >= nv) fail(`indices[${i}]`, `must be a vertex index 0–${nv - 1}`, x); }
      break;
    }
  }
  return c;
}
