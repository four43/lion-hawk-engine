// T-7, D-4: canonical JSON and its FNV-1a checksum. canonical() is stable across key order and float noise, so checksums
// and goldens only change when behaviour does. Pure, so headless tests and the page's window.engine share it.
import { fnv } from './rng.js';

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
