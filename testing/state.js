// T-7: state comparison for tests. canonical() and checksum() live in src/core/checksum.js (the page's window.engine
// uses them too); diff() and assertFinite() are test-only.
import { canonical, checksum } from '../src/core/checksum.js';

export { canonical, checksum };
const isTyped = v => ArrayBuffer.isView(v) && !(v instanceof DataView);

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
  const seen = new WeakSet(); // #64: each object once, so cycles and shared refs are fine
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
