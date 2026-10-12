// T-7: state comparison for tests. canonical() is stable across key order and float noise so checksums and
// goldens only change when behaviour does.
import { fnv } from '../src/core/rng.js';

const num = (v, digits) => Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : Number(v.toFixed(digits)) + 0; // + 0 turns -0 into 0
const isTyped = v => ArrayBuffer.isView(v) && !(v instanceof DataView);
function norm(v, digits) { // digits null: exact (#68), every bit kept; -0 still becomes 0
  if (typeof v === 'number') return digits === null ? (Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v + 0) : num(v, digits);
  if (v instanceof Map) return [...v].map(e => norm(e, digits));
  if (v instanceof Set) return [...v].map(e => norm(e, digits));
  if (isTyped(v)) return Array.from(v, e => norm(e, digits));
  if (Array.isArray(v)) return v.map(e => norm(e, digits));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = norm(v[k], digits); return o; }
  return v;
}
export const canonical = (value, { digits = 6, exact = false } = {}) => JSON.stringify(norm(value, exact ? null : digits));
export const checksum = (value, opts) => fnv(canonical(value, opts)).toString(16).padStart(8, '0');

export function diff(a, b, { tol = 0 } = {}, path = '', out = []) {
  if (isTyped(a)) a = Array.from(a);
  if (isTyped(b)) b = Array.from(b);
  if (typeof a === 'number' && typeof b === 'number') { if (!(Math.abs(a - b) <= tol || Object.is(a, b))) out.push({ path, a, b }); return out; }
  const objA = a && typeof a === 'object', objB = b && typeof b === 'object';
  if (!objA || !objB || Array.isArray(a) !== Array.isArray(b)) { if (a !== b) out.push({ path, a, b }); return out; }
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) diff(a[k], b[k], { tol }, Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k, out);
  return out;
}

export function assertFinite(value, label = 'value') {
  const seen = new WeakSet(); // #: each object once, so cycles and shared refs are fine
  const walk = (v, p) => {
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${p} is not finite: ${v}`); return; }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v instanceof Map) for (const [k, e] of v) walk(e, `${p}.${String(k)}`);
    else if (v instanceof Set) { let i = 0; for (const e of v) walk(e, `${p}[${i++}]`); }
    else if (isTyped(v)) v.forEach((e, i) => walk(e, `${p}[${i}]`)); // BigInt arrays are never non-finite numbers
    else if (Array.isArray(v)) v.forEach((e, i) => walk(e, `${p}[${i}]`));
    else for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`);
  };
  walk(value, label);
}
