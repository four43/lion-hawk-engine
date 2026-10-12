// src/sim/replica.js
// Moved from Tractor Pickup's src/net/replica.js with no behaviour change (N-8, N-11, #78); the field types and kinds live in ../defs/fields.js.
// Replicated objects (14.4, M-22, M-23, M-26, M-50). A kind lists the fields of one sort of shared object, how each field is packed, and the
// authority: the host, or the owner (the player whose number is the object's id). Game objects stay plain objects: kinds.js reads records
// from them and the sync code writes records back. A frame is binary, little-endian: a keyframe (every object of one authority) or a diff
// (the objects that changed, each with all its fields), with the sender's time stamp. decodeFrame checks everything and returns null for
// anything odd (M-50): a bad frame is dropped, never thrown.
export const FRAME = { KEY: 0x10, DIFF: 0x11 }, MAX_FRAME = 16384;
const NONE = 0xffff;
export const REPEAT = 3; // M-23: a changed or removed object stays in this many diffs, so one lost diff never hides a change
const TAU = Math.PI * 2, HEAD = 7, BAD = new Error('bad frame');
// maxSender: the highest device number (the host is 1); a frame from a higher one is dropped
export const createRegistry = (kinds, { maxSender = 255 } = {}) => { for (const [i, k] of kinds.entries()) if (kinds.some((o, j) => j < i && (o.name === k.name || o.code === k.code))) throw new Error('duplicate kind ' + k.name); return { list: kinds, byName: new Map(kinds.map(k => [k.name, k])), byCode: new Map(kinds.map(k => [k.code, k])), maxSender }; };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
function put(c, f, val) {
  const v = c.v;
  switch (f.t) {
    case 'uint': if (!Number.isInteger(val) || val < f.min || val > f.max) throw new Error('bad uint ' + val); if (f.bytes === 1) v.setUint8(c.o, val); else if (f.bytes === 2) v.setUint16(c.o, val, true); else v.setUint32(c.o, val, true); c.o += f.bytes; return;
    case 'id': if (val !== null && !(Number.isInteger(val) && val >= 0 && val < NONE)) throw new Error('bad id ' + val); v.setUint16(c.o, val ?? NONE, true); c.o += 2; return;
    case 'enum': { const i = f.list.indexOf(val); if (i < 0) throw new Error('bad value ' + val); v.setUint8(c.o++, i); return; }
    case 'fixed': v.setUint16(c.o, Math.round((clamp(val, f.lo, f.hi) - f.lo) / f.step), true); c.o += 2; return;
    case 'angle': { const a = Number.isFinite(val) ? ((val % TAU) + TAU) % TAU : 0; v.setUint16(c.o, Math.round(a / TAU * 65536) % 65536, true); c.o += 2; return; }
    case 'quat': { const n = Math.hypot(val.x, val.y, val.z, val.w), ok = Number.isFinite(n) && n > 0; for (const k of 'xyzw') { v.setInt16(c.o, Math.round((ok ? val[k] / n : k === 'w' ? 1 : 0) * 32767), true); c.o += 2; } return; }
    case 'obj': {
      if (f.bools.length) { let m = 0; f.bools.forEach((k, i) => { if (val[k]) m |= 1 << i; }); v.setUint8(c.o++, m); }
      for (const k in f.fields) if (f.fields[k].t !== 'bool') put(c, f.fields[k], val[k]); return;
    }
    case 'actions': {
      for (const n of f.axes) { const x = val[n]; v.setInt16(c.o, Math.round((Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0) * 32767), true); c.o += 2; }
      for (let i = 0; i < f.buttons.length; i += 8) { let m = 0; for (let j = 0; j < 8 && i + j < f.buttons.length; j++) if (val[f.buttons[i + j]]) m |= 1 << j; v.setUint8(c.o++, m); }
      return;
    }
    case 'list': if (!Array.isArray(val) || val.length > f.max || val.length < f.min) throw new Error('bad list'); v.setUint8(c.o++, val.length); for (const x of val) put(c, f.of, x); return;
  }
}
function get(c, f) {
  const v = c.v;
  switch (f.t) {
    case 'uint': { const x = f.bytes === 1 ? v.getUint8(c.o) : f.bytes === 2 ? v.getUint16(c.o, true) : v.getUint32(c.o, true); c.o += f.bytes; if (x > f.max || x < f.min) throw BAD; return x; }
    case 'id': { const x = v.getUint16(c.o, true); c.o += 2; return x === NONE ? null : x; }
    case 'enum': { const x = f.list[v.getUint8(c.o++)]; if (x === undefined) throw BAD; return x; }
    case 'fixed': { const x = v.getUint16(c.o, true); c.o += 2; if (x > f.n) throw BAD; return f.lo + x * f.step; }
    case 'angle': { const x = v.getUint16(c.o, true); c.o += 2; return x / 65536 * TAU; }
    case 'quat': {
      const q = {}; for (const k of 'xyzw') { q[k] = v.getInt16(c.o, true) / 32767; c.o += 2; }
      const n = Math.hypot(q.x, q.y, q.z, q.w); if (n < 0.9 || n > 1.1) throw BAD; q.x /= n; q.y /= n; q.z /= n; q.w /= n; return q;
    }
    case 'obj': {
      const o = {};
      if (f.bools.length) { const m = v.getUint8(c.o++); if (m >> f.bools.length) throw BAD; f.bools.forEach((k, i) => { o[k] = !!(m & (1 << i)); }); }
      for (const k in f.fields) if (f.fields[k].t !== 'bool') o[k] = get(c, f.fields[k]); return o;
    }
    case 'actions': {
      const o = {}; for (const n of f.axes) { o[n] = v.getInt16(c.o, true) / 32767; c.o += 2; }
      for (let i = 0; i < f.buttons.length; i += 8) { const m = v.getUint8(c.o++); if (m >> Math.min(8, f.buttons.length - i)) throw BAD; for (let j = 0; j < 8 && i + j < f.buttons.length; j++) o[f.buttons[i + j]] = !!(m & (1 << j)); }
      return o;
    }
    case 'list': { const n = v.getUint8(c.o++); if (n > f.max || n < f.min) throw BAD; const a = []; for (let i = 0; i < n; i++) a.push(get(c, f.of)); return a; }
  }
}
const scratch = new DataView(new ArrayBuffer(MAX_FRAME)), scratchBytes = new Uint8Array(scratch.buffer);
const putRecord = (c, k, id, rec) => { if (!Number.isInteger(id) || id < k.idMin || id > k.idMax) throw new Error(`bad ${k.name} id ${id}`); c.v.setUint16(c.o, id, true); c.o += 2; put(c, k.rec, rec); };
// one record's bytes (the tracker compares these, so a change smaller than a field's step is no change)
export function encodeRecord(k, id, rec) { const c = { v: scratch, o: 0 }; putRecord(c, k, id, rec); return new Uint8Array(scratch.buffer.slice(0, c.o)); }
// groups: [{ kind, records: [[id, rec], ...], removed: [id, ...] }]. Throws on a bug (a value not in its list, too many records, too big).
export function encodeFrame({ key, sender, time, groups }) {
  const c = { v: scratch, o: 0 }, v = scratch;
  v.setUint8(c.o++, key ? FRAME.KEY : FRAME.DIFF); v.setUint8(c.o++, sender); v.setUint32(c.o, time >>> 0, true); c.o += 4; v.setUint8(c.o++, groups.length);
  for (const g of groups) {
    const k = g.kind, removed = g.removed || [];
    if (g.records.length > k.max || removed.length > k.max) throw new Error('too many ' + k.name);
    v.setUint8(c.o++, k.code); v.setUint16(c.o, g.records.length, true); c.o += 2;
    for (const [id, rec] of g.records) putRecord(c, k, id, rec);
    v.setUint16(c.o, removed.length, true); c.o += 2; for (const id of removed) { v.setUint16(c.o, id, true); c.o += 2; }
  }
  return scratch.buffer.slice(0, c.o);
}
export const isFrame = buf => buf instanceof ArrayBuffer && buf.byteLength >= HEAD && (new Uint8Array(buf)[0] === FRAME.KEY || new Uint8Array(buf)[0] === FRAME.DIFF);
// -> { key, sender, time, groups: Map(kindName -> { records: Map(id -> rec), removed: [id] }) } or null. Every record must be one the sender is the
// authority for (M-50: a device speaks only for itself), and only the host sends a host kind's group; every id appears once; a keyframe removes nothing by name (what it leaves out is gone).
export function decodeFrame(buf, reg) {
  if (!isFrame(buf) || buf.byteLength > MAX_FRAME) return null;
  try {
    const v = new DataView(buf), c = { v, o: 0 }, key = v.getUint8(c.o++) === FRAME.KEY, sender = v.getUint8(c.o++), time = v.getUint32(c.o, true); c.o += 4;
    if (sender < 1 || sender > reg.maxSender) return null;
    const n = v.getUint8(c.o++), groups = new Map();
    for (let i = 0; i < n; i++) {
      const k = reg.byCode.get(v.getUint8(c.o++)); if (!k || groups.has(k.name) || (k.authority === 'host' && sender !== 1)) return null; // a host kind only from the host, even with no records
      const count = v.getUint16(c.o, true); c.o += 2; if (count > k.max) return null;
      const records = new Map();
      for (let j = 0; j < count; j++) {
        const id = v.getUint16(c.o, true); c.o += 2;
        if (id < k.idMin || id > k.idMax || records.has(id) || (k.authority === 'host' ? sender !== 1 : id !== sender)) return null;
        records.set(id, get(c, k.rec));
      }
      const rc = v.getUint16(c.o, true); c.o += 2; if (rc > k.max || (key && rc)) return null;
      const removed = [];
      for (let j = 0; j < rc; j++) { const id = v.getUint16(c.o, true); c.o += 2; if (id < k.idMin || id > k.idMax || (k.authority === 'owner' && id !== sender) || (k.authority === 'host' && sender !== 1)) return null; removed.push(id); }
      groups.set(k.name, { records, removed });
    }
    return c.o === buf.byteLength ? { key, sender, time, groups } : null;
  } catch { return null; } // a read past the end (RangeError) or a bad field
}
// The sending side (M-23): objs is { kindName: [[id, rec], ...] }, every object this device is the authority for, now.
export function createTracker(kinds) {
  const last = new Map(kinds.map(k => [k.name, new Map()])); // id -> { bytes, hot, gone, at }
  const c = { v: scratch, o: 0 }; let tick = 0; // at: the diff that last saw the object
  const same = (a, n) => { if (a.length !== n) return false; for (let i = 0; i < n; i++) if (a[i] !== scratchBytes[i]) return false; return true; };
  return {
    diff(objs) { // each record is encoded into the scratch buffer and copied only when it changed (most trees never do)
      tick++;
      return kinds.map(k => {
        const seen = last.get(k.name), records = [], removed = [];
        for (const [id, rec] of objs[k.name] || []) {
          c.o = 0; putRecord(c, k, id, rec); let e = seen.get(id);
          if (!e || e.gone || !same(e.bytes, c.o)) seen.set(id, e = { bytes: scratchBytes.slice(0, c.o), hot: REPEAT, gone: false, at: 0 });
          e.at = tick; if (e.hot > 0) { e.hot--; records.push([id, rec]); }
        }
        for (const [id, e] of seen) if (e.at !== tick) { if (!e.gone) { e.gone = true; e.hot = REPEAT; } if (e.hot > 0) { e.hot--; removed.push(id); } else seen.delete(id); }
        return { kind: k, records, removed };
      });
    },
    key: objs => kinds.map(k => ({ kind: k, records: objs[k.name] || [], removed: [] })),
    reset() { for (const m of last.values()) m.clear(); },
  };
}
// The receiving side (M-26): per object, the newest record and the sender time it came with. Older data is ignored, and a kind may refuse a
// record (kind.newer: an animal with a lower ownership number). A keyframe replaces every object of its sender's authority: what it leaves
// out is removed, unless newer data came for it. apply() returns the accepted changes: [{ kind, id, rec }] (rec null: removed).
export function createStore(kinds) {
  const maps = new Map(kinds.map(k => [k.name, new Map()])); // id -> { rec (null: removed), t }
  const authority = (k, id, sender) => k.authority === 'host' ? sender === 1 : id === sender;
  return {
    get: (kind, id) => maps.get(kind).get(id)?.rec ?? null,
    all(kind) { const out = new Map(); for (const [id, e] of maps.get(kind)) if (e.rec) out.set(id, e.rec); return out; },
    apply(f) {
      const changes = [];
      for (const k of kinds) {
        const g = f.groups.get(k.name); if (!g) continue; const m = maps.get(k.name);
        for (const [id, rec] of g.records) { const e = m.get(id); if (e && (f.time <= e.t || (e.rec && k.newer && !k.newer(e.rec, rec)))) continue; m.set(id, { rec, t: f.time }); changes.push({ kind: k.name, id, rec }); }
        for (const id of g.removed) { const e = m.get(id); if (e && f.time <= e.t) continue; m.set(id, { rec: null, t: f.time }); if (e?.rec) changes.push({ kind: k.name, id, rec: null }); }
        if (f.key) for (const [id, e] of m) if (!g.records.has(id) && authority(k, id, f.sender) && e.t < f.time) { m.set(id, { rec: null, t: f.time }); if (e.rec) changes.push({ kind: k.name, id, rec: null }); }
      }
      return changes;
    },
    forget(kind, id) { maps.get(kind).delete(id); }, // a player left: its next object (any sender clock) is accepted
    clear() { for (const m of maps.values()) m.clear(); },
  };
}

// #78: a decoded frame as plain JSON (a tape holds this, never bytes) and back; records stay in arrival order.
export function frameToJson(f) {
  return { key: f.key, sender: f.sender, time: f.time, groups: [...f.groups].map(([kind, g]) => ({ kind, records: [...g.records].map(([id, rec]) => [id, rec]), removed: [...g.removed] })) };
}
export function frameFromJson(j, reg) {
  const groups = new Map();
  for (const g of j.groups) { if (!reg.byName.has(g.kind)) throw new Error('frameFromJson: unknown kind ' + g.kind); groups.set(g.kind, { records: new Map(g.records), removed: [...g.removed] }); }
  return { key: j.key, sender: j.sender, time: j.time, groups };
}
