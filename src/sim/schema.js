// src/sim/schema.js: declared command schemas and their wire codecs (N-3, #49, #91). A schema is { [field]: F.* } (../defs/fields.js).
// checkSchema validates plain JSON against it and returns a copy (unknown keys dropped) or null; wireCodec builds a json and a binary
// codec from one table of schemas. The binary one packs fields with the replica field encoders (put/get, N-8), so both wires share types.
import { F } from '../defs/fields.js';
import { put, get, MAX_FRAME } from './replica.js';

const NONE = 0xffff, WIRE = 0x20, TYPES = new Set(['bool', 'uint', 'id', 'enum', 'fixed', 'angle', 'quat', 'obj', 'list', 'actions']);
const fin = Number.isFinite, plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// a field description must be an F.* value (throws at definition, never at a message)
export function checkFields(fields, where = 'schema') {
  if (!plain(fields)) throw new Error(`${where} must be an object of F fields`);
  const walk = (f, p) => {
    if (!plain(f) || !TYPES.has(f.t)) throw new Error(`${p} is not an F field`);
    if (f.t === 'obj') for (const k in f.fields) walk(f.fields[k], `${p}.${k}`);
    if (f.t === 'list') { if (!Number.isInteger(f.max) || !Number.isInteger(f.min) || f.min < 0 || f.max > 255 || f.min > f.max) throw new Error(`${p}: list length must be 0 <= min <= max <= 255`); walk(f.of, `${p}[]`); }
  };
  for (const k in fields) walk(fields[k], `${where}.${k}`);
  return fields;
}
// one value -> its checked copy, or undefined (no valid value is undefined)
const check = (f, v) => {
  switch (f.t) {
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'uint': return Number.isInteger(v) && v >= f.min && v <= f.max ? v : undefined;
    case 'id': return v === null || (Number.isInteger(v) && v >= 0 && v < NONE) ? v : undefined;
    case 'enum': return f.list.includes(v) ? v : undefined;
    case 'fixed': return fin(v) && v >= f.lo && v <= f.hi ? v : undefined;
    case 'angle': return fin(v) ? v : undefined;
    case 'quat': return plain(v) && fin(v.x) && fin(v.y) && fin(v.z) && fin(v.w) ? { x: v.x, y: v.y, z: v.z, w: v.w } : undefined;
    case 'obj': return fieldsOf(f.fields, v);
    case 'list': {
      if (!Array.isArray(v) || v.length < f.min || v.length > f.max) return undefined;
      const a = []; for (const x of v) { const y = check(f.of, x); if (y === undefined) return undefined; a.push(y); } return a;
    }
    case 'actions': { // N-8: axes in -1..1, buttons as booleans
      if (!plain(v)) return undefined; const o = {};
      for (const n of f.axes) { if (!fin(v[n]) || v[n] < -1 || v[n] > 1) return undefined; o[n] = v[n]; }
      for (const n of f.buttons) { if (typeof v[n] !== 'boolean') return undefined; o[n] = v[n]; }
      return o;
    }
  }
};
const fieldsOf = (fields, v) => {
  if (!plain(v)) return undefined; const o = {};
  for (const k in fields) { if (!Object.hasOwn(v, k)) return undefined; const y = check(fields[k], v[k]); if (y === undefined) return undefined; o[k] = y; }
  return o;
};
// N-3: plain-JSON validation against a schema; every declared field present, unknown keys dropped -> a copy, or null
export const checkSchema = (fields, data) => fieldsOf(fields, data) ?? null;

// #91: table { [tag]: fields } -> { encode(tag, data), decode(wire) -> { tag, data } | null }. json wires are { t: tag, ...fields };
// binary wires are an ArrayBuffer [0x20, tag index u8 (table order), fields packed as one F.obj]. encode throws on a bug, decode never.
export function wireCodec(table, { codec = 'json' } = {}) {
  if (codec !== 'json' && codec !== 'binary') throw new Error("wire: codec must be 'json' or 'binary'");
  if (!plain(table)) throw new Error('wire: table must be an object of schemas');
  const tags = Object.keys(table); if (tags.length > 256) throw new Error('wire: at most 256 tags');
  for (const tag of tags) { checkFields(table[tag], `wire.${tag}`); if (Object.hasOwn(table[tag], 't')) throw new Error(`wire: '${tag}' may not declare 't' (the tag key)`); }
  const checked = (tag, data) => {
    if (!Object.hasOwn(table, tag)) throw new Error(`wire: unknown tag '${tag}'`);
    const d = checkSchema(table[tag], data); if (!d) throw new Error(`wire: '${tag}' does not match its schema`); return d;
  };
  if (codec === 'json') return {
    codec,
    encode: (tag, data) => ({ t: tag, ...checked(tag, data) }),
    decode(w) { if (!plain(w) || typeof w.t !== 'string' || !Object.hasOwn(table, w.t)) return null; const data = checkSchema(table[w.t], w); return data && { tag: w.t, data }; },
  };
  const objs = tags.map(tag => F.obj(table[tag])), index = new Map(tags.map((t, i) => [t, i])); // F.obj: at most 8 bools per level
  const c = { v: new DataView(new ArrayBuffer(MAX_FRAME)), o: 0 };
  return {
    codec,
    encode(tag, data) {
      const d = checked(tag, data), i = index.get(tag); c.o = 0; c.v.setUint8(c.o++, WIRE); c.v.setUint8(c.o++, i);
      try { put(c, objs[i], d); } catch (err) { if (err instanceof RangeError) throw new Error(`wire: '${tag}' is over ${MAX_FRAME} bytes`); throw err; }
      return c.v.buffer.slice(0, c.o);
    },
    decode(w) {
      if (!(w instanceof ArrayBuffer) || w.byteLength < 2) return null;
      try {
        const r = { v: new DataView(w), o: 0 }; if (r.v.getUint8(r.o++) !== WIRE) return null;
        const i = r.v.getUint8(r.o++); if (i >= tags.length) return null;
        const data = get(r, objs[i]); return r.o === w.byteLength ? { tag: tags[i], data } : null;
      } catch { return null; } // a read past the end (RangeError) or a bad field
    },
  };
}
