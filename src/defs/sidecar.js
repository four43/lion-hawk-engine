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

const strict = (o, keys, fail, path) => { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${path}${k}`, 'unknown field', o[k]); };

// One model's sidecar (overview §4.3). model: the id for messages. Required: v, parts, colliders.
// Optional: source (hand-written fixtures have none), mass (informational), sockets, bounds.
export function validateSidecar(s, { model = '?', materials } = {}) {
  const where = `sidecar: ${model}`;
  const fail = (path, problem, v) => { throw new Error(`${where}: ${path} ${problem} (got ${show(v)})`); };
  if (!isPlain(s)) throw new Error(`${where}: must be an object (got ${show(s)})`);
  strict(s, ['v', 'source', 'parts', 'colliders', 'mass', 'sockets', 'bounds'], fail, '');
  if (s.v !== SIDECAR_VERSION) fail('v', `must be ${SIDECAR_VERSION}`, s.v);
  if (s.source !== undefined) {
    if (!isPlain(s.source)) fail('source', 'must be an object', s.source);
    strict(s.source, ['file', 'sha256'], fail, 'source.');
    if (!name(s.source.file)) fail('source.file', 'must be a non-empty string', s.source.file);
    if (typeof s.source.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.source.sha256)) fail('source.sha256', 'must be 64 lowercase hex digits', s.source.sha256);
  }
  if (!Array.isArray(s.parts) || !s.parts.every(name)) fail('parts', 'must be a list of non-empty strings', s.parts);
  s.parts.forEach((p, i) => { if (s.parts.indexOf(p) !== i) fail(`parts[${i}]`, 'repeats a part', p); });
  if (!Array.isArray(s.colliders)) fail('colliders', 'must be a list', s.colliders);
  s.colliders.forEach((c, i) => validateCollider(c, { where, path: `colliders[${i}]`, materials, parts: s.parts }));
  if (s.mass !== undefined) {
    const m = s.mass;
    if (!isPlain(m)) fail('mass', 'must be an object', m);
    strict(m, ['mass', 'com', 'inertia', 'frame'], fail, 'mass.');
    if (!finite(m.mass) || m.mass < 0) fail('mass.mass', 'must be a number >= 0', m.mass);
    if (!vec3(m.com)) fail('mass.com', 'must be 3 numbers', m.com);
    if (!vec3(m.inertia) || !m.inertia.every(x => x >= 0)) fail('mass.inertia', 'must be 3 numbers >= 0', m.inertia);
    if (!quat(m.frame)) fail('mass.frame', 'must be a unit quaternion [x, y, z, w]', m.frame);
  }
  if (s.sockets !== undefined) {
    if (!isPlain(s.sockets)) fail('sockets', 'must be an object', s.sockets);
    for (const [k, so] of Object.entries(s.sockets)) {
      if (!isPlain(so)) fail(`sockets.${k}`, 'must be an object', so);
      strict(so, ['p', 'q', 'part'], fail, `sockets.${k}.`);
      if (!vec3(so.p)) fail(`sockets.${k}.p`, 'must be 3 numbers', so.p);
      if (!quat(so.q)) fail(`sockets.${k}.q`, 'must be a unit quaternion [x, y, z, w]', so.q);
      if (so.part !== null && !s.parts.includes(so.part)) fail(`sockets.${k}.part`, 'names an unknown part', so.part);
    }
  }
  if (s.bounds !== undefined) {
    const b = s.bounds;
    if (!isPlain(b)) fail('bounds', 'must be an object', b);
    strict(b, ['min', 'max'], fail, 'bounds.');
    if (!vec3(b.min)) fail('bounds.min', 'must be 3 numbers', b.min);
    if (!vec3(b.max) || b.max.some((x, i) => x < b.min[i])) fail('bounds.max', 'must be 3 numbers, each >= min', b.max);
  }
  return s;
}

// The whole baked/phys.json (D2): { v: 1, engine, materials: '<registry hash>', models: { <id>: Sidecar } }.
// It checks the shape and, given a registry, that every material exists. Comparing `materials` with registry.hash is
// the caller's job (checks.materials, lion-hawk bake --check), so a stale hash reads as stale, not as malformed.
export function validatePhys(phys, { materials } = {}) {
  const fail = (path, problem, v) => { throw new Error(`phys: ${path} ${problem} (got ${show(v)})`); };
  if (!isPlain(phys)) throw new Error(`phys: must be an object (got ${show(phys)})`);
  strict(phys, ['v', 'engine', 'materials', 'models'], fail, '');
  if (phys.v !== SIDECAR_VERSION) fail('v', `must be ${SIDECAR_VERSION}`, phys.v);
  if (typeof phys.engine !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(phys.engine)) fail('engine', 'must be a version like 0.8.0', phys.engine);
  if (typeof phys.materials !== 'string' || !/^[0-9a-f]{8}$/.test(phys.materials)) fail('materials', 'must be an 8-hex registry hash', phys.materials);
  if (!isPlain(phys.models)) fail('models', 'must be an object', phys.models);
  for (const [id, s] of Object.entries(phys.models)) validateSidecar(s, { model: id, materials });
  return phys;
}

// T-14 helper for checks.materials: every material a phys.json names, with where it is named, keys sorted.
export function materialRefs(phys) {
  const out = {};
  for (const [id, s] of Object.entries(phys.models)) s.colliders.forEach((c, i) => (out[c.material] ??= []).push(`${id}.colliders[${i}]`));
  return Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
}
