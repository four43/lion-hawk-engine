// src/defs/materials.js
// The material registry (M-1..M-3, M-7, M-8; overview §4.2, D4, D6). Plain data with no runtime dependencies: the sim,
// the view's compiler and the Node bake all read the same frozen registry.
import { fnv } from '../core/rng.js';
import { BASE_MATERIALS } from './materials.base.js';

export const PHYS_DEFAULTS = Object.freeze({ friction: 0.5, restitution: 0, sg: 1, fill: 1 }); // friction, restitution: Rapier's defaults
export const MAX_MATERIALS = 255; // index() fits a Uint8Array cell; 255 stays free

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const show = v => {
  let s;
  if (typeof v === 'string') s = `'${v}'`;
  else if (typeof v === 'number' || v === undefined || typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') s = String(v);
  else { try { s = JSON.stringify(v); } catch { s = String(v); } }
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

// Field checkers: each returns a problem string, or null when the value is good.
const finite = v => typeof v === 'number' && Number.isFinite(v);
const range = (lo, hi) => v => !finite(v) ? 'must be a number' : v < lo || v > hi ? `out of range ${lo}–${hi}` : null;
const positive = v => !finite(v) ? 'must be a number' : v <= 0 ? 'must be > 0' : null;
const nonneg = v => !finite(v) ? 'must be a number' : v < 0 ? 'must be >= 0' : null;
const openUnit = v => !finite(v) ? 'must be a number' : v <= 0 || v > 1 ? 'out of range (0, 1]' : null;
const int = (lo, hi) => v => !Number.isInteger(v) ? 'must be an integer' : v < lo || v > hi ? `out of range ${lo}–${hi}` : null;
const bool = v => typeof v === 'boolean' ? null : 'must be true or false';
const str = v => typeof v === 'string' && v.length > 0 ? null : 'must be a non-empty string';
const oneOf = list => v => list.includes(v) ? null : `must be one of ${list.map(x => `'${x}'`).join(', ')}`;
const colour = v => (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) || (Number.isInteger(v) && v >= 0 && v <= 0xffffff) ? null : "must be a colour ('#rgb', '#rrggbb' or 0xrrggbb)";
const curve = v => Array.isArray(v) && v.length >= 2 && v.every(p => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])) ? null : 'must be a list of at least 2 [angle, value] pairs';
const plainData = v => { // JSON values only, so the registry clones and freezes the same everywhere
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v)) return null;
  if (Array.isArray(v)) { for (const x of v) if (plainData(x)) return 'must be plain JSON data'; return null; }
  if (isPlain(v)) { for (const x of Object.values(v)) if (plainData(x)) return 'must be plain JSON data'; return null; }
  return 'must be plain JSON data';
};
const unit = range(0, 1);

// A nested object is a sub-schema; a function checks a scalar. Top-level keys are the blocks (spec §3.2, D6).
const TIRE = { mu: nonneg, C: positive, kp: positive, ap: positive, crr: nonneg, drag: nonneg };
const SCHEMA = {
  extends: str,
  look: {
    color: colour, metalness: unit, roughness: unit, clearcoat: unit, clearcoatRoughness: unit,
    sheen: unit, sheenColor: colour, sheenRoughness: unit, transmission: unit, ior: range(1, 2.333), thickness: nonneg,
    opacity: unit, transparent: bool, emissive: colour, emissiveIntensity: nonneg, flatShading: bool, side: oneOf(['front', 'double']),
    subsurface: { color: colour, strength: unit },
    fur: { length: range(0.001, 1), shells: int(1, 32), density: positive, tint: colour },
    wear: plainData, // accepted and ignored in phase 3
  },
  phys: { friction: range(0, 2), restitution: unit, sg: positive, fill: openUnit },
  tire: TIRE,
  dirtRate: nonneg,
  coverage: { dirt: unit, rust: unit, snow: unit, mud: unit },
  aero: { skin: nonneg, airfoil: { cl: curve, cd: curve, stall: range(0, 90) } },
  magnet: { strength: nonneg, ferrous: unit },
  fluid: { density: positive, viscosity: nonneg },
  sound: str,
  fx: str,
  game: plainData, // D6: free-form, not schema-checked, copied through extends
};

const PAIR = { friction: range(0, 2), restitution: unit, tire: TIRE, sound: str, fx: str };

// unknown: what an unlisted key is called at this level ('unknown block' for a material's top level).
const check = (schema, value, path, fail, unknown = 'unknown field') => {
  if (typeof schema === 'function') { const p = schema(value); if (p) fail(path, p, value); return; }
  if (!isPlain(value)) { fail(path, 'must be an object', value); return; }
  for (const k of Object.keys(value)) {
    if (!Object.hasOwn(schema, k)) fail(`${path}.${k}`, unknown, value[k]);
    check(schema[k], value[k], `${path}.${k}`, fail);
  }
};
function validateEntry(id, entry) {
  const fail = (path, problem, v) => { throw new Error(`materials: '${id}'${path.slice(1)} ${problem} (got ${show(v)})`); };
  if (id.includes('|')) throw new Error(`materials: '${id}' id must not contain '|' (pair keys use it)`);
  if (id.startsWith('paint-')) throw new Error(`materials: '${id}' ids starting with 'paint-' are reserved for paint slots (A-4)`);
  if (!isPlain(entry)) throw new Error(`materials: '${id}' must be an object (got ${show(entry)})`);
  check(SCHEMA, entry, '#', fail, 'unknown block');
}

const clone = v => Array.isArray(v) ? v.map(clone) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const merge = (base, over) => { // deep, per block, child wins; arrays and scalars replace
  const out = clone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isPlain(out[k]) && isPlain(v) ? merge(out[k], v) : clone(v);
  return out;
};
const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

// Canonical JSON: keys sorted at every level, so the hash does not depend on declaration order.
export const canonicalJson = v => {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (finite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (isPlain(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  throw new Error(`materials: cannot hash ${show(v)}`);
};
const hex8 = s => fnv(s).toString(16).padStart(8, '0');

function parsePairs(pairs, has) {
  if (!isPlain(pairs)) throw new Error(`materials: pairs must be an object (got ${show(pairs)})`);
  const out = new Map(); // 'a|b' with a <= b → validated, frozen entry
  for (const [key, entry] of Object.entries(pairs)) {
    const ids = key.split('|');
    if (ids.length !== 2 || !ids[0] || !ids[1]) throw new Error(`materials: pair '${key}' must be 'a|b'`);
    for (const id of ids) if (!has(id)) throw new Error(`materials: pair '${key}' names unknown material '${id}'`);
    const norm = [...ids].sort().join('|');
    if (out.has(norm)) throw new Error(`materials: pair '${key}' repeats '${out.get(norm).key}'`);
    check(PAIR, entry, '#', (path, problem, v) => { throw new Error(`materials: pair '${key}'${path.slice(1)} ${problem} (got ${show(v)})`); });
    out.set(norm, { key, entry: deepFreeze(clone(entry)) });
  }
  return out;
}

export function defineMaterials(entries = {}, options = {}) {
  if (!isPlain(entries)) throw new Error(`materials: defineMaterials takes an object of entries (got ${show(entries)})`);
  if (!isPlain(options)) throw new Error(`materials: options must be an object (got ${show(options)})`);
  for (const k of Object.keys(options)) if (k !== 'pairs') throw new Error(`materials: unknown option '${k}'`);

  // 1. Raw table: the base library in spec order, then game entries in key order. A game entry with a base id
  //    is merged over that base entry in place (same index) and may not extend anything else.
  const raw = new Map();
  for (const [id, entry] of Object.entries(BASE_MATERIALS)) { validateEntry(id, entry); raw.set(id, entry); }
  for (const [id, entry] of Object.entries(entries)) {
    validateEntry(id, entry);
    if (Object.hasOwn(BASE_MATERIALS, id)) {
      if (entry.extends !== undefined) throw new Error(`materials: '${id}' overrides the base entry and cannot extend '${entry.extends}'`);
      raw.set(id, merge(BASE_MATERIALS[id], entry));
    } else raw.set(id, entry);
  }
  const ids = Object.freeze([...raw.keys()]);
  if (ids.length > MAX_MATERIALS) throw new Error(`materials: ${ids.length} materials, at most ${MAX_MATERIALS}`);

  // 2. Resolve extends (M-2): deep merge per block, child wins; `game` is copied like any block (D6).
  const resolved = new Map();
  const resolve = (id, chain) => {
    if (resolved.has(id)) return resolved.get(id);
    const { extends: parent, ...own } = raw.get(id);
    let out;
    if (parent === undefined) out = clone(own);
    else {
      if (!raw.has(parent)) throw new Error(`materials: '${id}' extends unknown '${parent}'`);
      if (chain.includes(parent)) throw new Error(`materials: extends cycle ${[...chain.slice(chain.indexOf(parent)), parent].join(' -> ')}`);
      out = merge(resolve(parent, [...chain, parent]), own);
    }
    resolved.set(id, out);
    return out;
  };
  for (const id of ids) resolve(id, [id]);
  const list = ids.map(id => deepFreeze({ id, ...resolved.get(id) }));

  // 3. Lookups. Everything a step may call (get, index, collider, pair) is a Map or array read after the first call.
  const at = new Map(ids.map((id, i) => [id, i]));
  const need = id => { const i = at.get(id); if (i === undefined) throw new Error(`materials: unknown material '${id}'`); return i; };
  const sgOf = m => m.phys?.sg ?? (m.fluid ? 0 : PHYS_DEFAULTS.sg);
  const densityOf = m => m.phys?.sg === undefined && m.fluid ? 0 : sgOf(m) * 1000 * (m.phys?.fill ?? PHYS_DEFAULTS.fill);
  const colliders = list.map(m => Object.freeze({
    friction: Math.sqrt(m.phys?.friction ?? PHYS_DEFAULTS.friction), // D4: √f with Multiply gives √(fa·fb)
    restitution: m.phys?.restitution ?? PHYS_DEFAULTS.restitution,
    density: densityOf(m),
  }));

  // 4. Pairs (M-7, M-8). Cached per ORDERED pair: the tie and tyre rules depend on which side is the ground (b).
  const table = parsePairs(options.pairs ?? {}, id => at.has(id));
  for (const { key, entry } of table.values()) {
    if (!entry.tire) continue;
    const [a, b] = key.split('|');
    if (list[need(a)].tire || list[need(b)].tire) continue;
    for (const f of Object.keys(TIRE)) {
      if (entry.tire[f] === undefined) throw new Error(`materials: pair '${key}'.tire.${f} required when neither '${a}' nor '${b}' has tyre data (got undefined)`);
    }
  }
  const pairEntries = new Map();
  for (const [norm, { entry }] of table) { const [a, b] = norm.split('|').map(need); pairEntries.set(Math.min(a, b) * 256 + Math.max(a, b), entry); }
  const pairCache = new Map();
  const pair = (a, b) => {
    const ia = need(a), ib = need(b), k = ia * 256 + ib;
    let r = pairCache.get(k);
    if (r) return r;
    const ma = list[ia], mb = list[ib], e = pairEntries.get(Math.min(ia, ib) * 256 + Math.max(ia, ib)) ?? {};
    const soft = sgOf(mb) < sgOf(ma) ? mb : ma, hard = soft === ma ? mb : ma; // ties go to a
    const ground = mb.tire ?? ma.tire;
    r = deepFreeze({
      friction: e.friction ?? Math.sqrt((ma.phys?.friction ?? PHYS_DEFAULTS.friction) * (mb.phys?.friction ?? PHYS_DEFAULTS.friction)),
      restitution: e.restitution ?? Math.max(ma.phys?.restitution ?? PHYS_DEFAULTS.restitution, mb.phys?.restitution ?? PHYS_DEFAULTS.restitution),
      tire: e.tire ? (ground ? merge(ground, e.tire) : clone(e.tire)) : ground ?? null,
      sound: e.sound ?? soft.sound ?? hard.sound ?? null,
      fx: e.fx ?? soft.fx ?? hard.fx ?? null,
    });
    pairCache.set(k, r);
    return r;
  };

  // 5. Hash (overview §4.2, ruling 6): only what sidecars and colliders depend on. Per material in index order (so ids
  //    and their order count), the effective phys values collider()/density() read; per pair, its friction/restitution.
  //    look, game, tire, dirtRate, coverage, aero, magnet, sound and fx are read live, so changing them needs no re-bake.
  const contact = e => Object.fromEntries(['friction', 'restitution'].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  const hash = hex8(canonicalJson({
    materials: list.map(m => [m.id, {
      friction: m.phys?.friction ?? PHYS_DEFAULTS.friction,
      restitution: m.phys?.restitution ?? PHYS_DEFAULTS.restitution,
      sg: sgOf(m), fill: m.phys?.fill ?? PHYS_DEFAULTS.fill,
    }]),
    pairs: Object.fromEntries([...table].map(([norm, { entry }]) => [norm, contact(entry)]).filter(([, c]) => Object.keys(c).length)),
  }));

  return Object.freeze({
    ids,
    hash,
    get: id => list[need(id)],
    has: id => at.has(id),
    index: need,
    byIndex: i => { if (!Number.isInteger(i) || i < 0 || i >= ids.length) throw new Error(`materials: no material at index ${i}`); return ids[i]; },
    density: id => colliders[need(id)].density,
    collider: id => colliders[need(id)],
    pair,
  });
}
