// src/sim/net/replicate.js
// The net part's records (N-9): the default record read from an entity (F.body() fields from Rapier, or the pool for a bodiless
// entity; everything else from e[k]), the default apply written back, and the owner's input ring for driven kinds (N-13).
// Plain functions over objects made once per entity: nothing here allocates per step (R-8). Sim-pure.
import { INPUT_BATCH } from '../../defs/fields.js';

const v3 = () => ({ x: 0, y: 0, z: 0 });
// Contract issue 1: the entity an F.body() field reads. 'body' is the entity itself; any other field names a linked entity e[field]
// (Tractor's trailer and wagon), spawned with it and despawned with it.
export const bodyEntity = (e, field) => field === 'body' ? e : e[field];
export const zeroActions = f => { const o = {}; for (const n of f.axes) o[n] = 0; for (const n of f.buttons) o[n] = false; return o; };
// axes as numbers, buttons as booleans; a missing source value is 0 / false
export function copyActions(f, src, out) {
  for (let i = 0; i < f.axes.length; i++) { const n = f.axes[i], x = src?.[n]; out[n] = Number.isFinite(x) ? x : 0; }
  for (let i = 0; i < f.buttons.length; i++) { const n = f.buttons[i]; out[n] = !!src?.[n]; }
  return out;
}
// one record object per entity, made at its first send or receive and reused for every send after
export function newRecord(k) {
  const r = {};
  for (const name of Object.keys(k.fields)) {
    if (k.fields[name].body === true) r[name] = { p: v3(), q: { x: 0, y: 0, z: 0, w: 1 }, v: v3(), w: v3() };
    else if (name === 'input' && k.input) r[name] = k.remote === 'driven' ? { s: 0, list: [] } : zeroActions(k.input);
    else r[name] = undefined;
  }
  return r;
}
// one body's state into out = { p, q, v, w }: from Rapier (its per-call vectors are tolerated, §7.3), or the pool pose of a bodiless entity, still
export function readBody(ent, out) {
  if (ent?.body) {
    const b = ent.body, t = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
    out.p.x = t.x; out.p.y = t.y; out.p.z = t.z; out.q.x = q.x; out.q.y = q.y; out.q.z = q.z; out.q.w = q.w;
    out.v.x = v.x; out.v.y = v.y; out.v.z = v.z; out.w.x = w.x; out.w.y = w.y; out.w.z = w.z;
  } else if (ent?.xf) {
    const P = ent.xf.p, Q = ent.xf.q;
    out.p.x = P.x; out.p.y = P.y; out.p.z = P.z; out.q.x = Q.x; out.q.y = Q.y; out.q.z = Q.z; out.q.w = Q.w;
    out.v.x = out.v.y = out.v.z = 0; out.w.x = out.w.y = out.w.z = 0;
  } else throw new Error(`net: an F.body() field needs an entity with a body or xf (entity ${ent?.id})`);
  return out;
}
// N-9: the default record. ring: the owner's input ring when the kind is driven, else null
export function defaultRecord(k, e, out, ring) {
  for (const name in k.fields) {
    if (k.fields[name].body === true) readBody(bodyEntity(e, name), out[name]);
    else if (name === 'input' && k.input) { if (ring) ring.fill(out.input); else copyActions(k.input, e.input, out.input); }
    else out[name] = e[name];
  }
  return out;
}
// N-9: the default apply: every field but the pose (the remote mode moves bodies and the pool) and a driven input (the queue plays it)
export function applyFields(k, e, rec) {
  for (const name in k.fields) {
    if (k.fields[name].body === true) continue;
    if (name === 'input' && k.input) { if (k.remote !== 'driven') copyActions(k.input, rec.input, e.input ??= zeroActions(k.input)); continue; }
    e[name] = rec[name];
  }
}
// N-13: the owner's last `size` inputs by owner step (installNet: INPUT_BATCH, or 2 × steps per send when that is more); fill(out) sets out.s (the newest step) and out.list (oldest first; the ring's objects)
export function createInputRing(f, size = INPUT_BATCH) {
  const slots = Array.from({ length: size }, () => ({ s: 0, v: zeroActions(f) }));
  let n = 0, head = 0; // head: the next slot written
  return {
    get size() { return n; },
    push(s, src) { const x = slots[head]; x.s = s; copyActions(f, src, x.v); head = (head + 1) % size; if (n < size) n++; },
    fill(out) {
      out.list.length = n;
      for (let i = 0; i < n; i++) out.list[i] = slots[(head - n + i + size) % size].v;
      out.s = n ? slots[(head - 1 + size) % size].s : 0; return out;
    },
    clear() { n = 0; head = 0; },
  };
}
