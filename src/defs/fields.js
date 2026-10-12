// src/defs/fields.js
// Field types and kinds for replicated objects (N-8, N-11), moved from Tractor Pickup's src/net/replica.js (M-22). Plain data: src/sim/replica.js packs them.
const boolsOf = fields => Object.keys(fields).filter(k => fields[k].t === 'bool');
export const F = {
  bool: () => ({ t: 'bool' }), // the bools of one obj share a flags byte (at most 8)
  uint: (bytes, max = 2 ** (8 * bytes) - 1, min = 0) => { if (![1, 2, 4].includes(bytes)) throw new Error('bad uint width ' + bytes); return { t: 'uint', bytes, max, min }; }, // min: encode throws below it, decode drops (N-8)
  id: () => ({ t: 'id' }), // u16; null travels as 0xffff
  oneOf: list => ({ t: 'enum', list }), // u8 index
  fixed: (lo, hi, step) => ({ t: 'fixed', lo, hi, step, n: Math.round((hi - lo) / step) }), // u16 steps from lo; values are clamped into lo..hi
  angle: () => ({ t: 'angle' }), // u16 over a full turn
  quat: () => ({ t: 'quat' }), // 4 x i16, normalized on decode
  obj: fields => { const bools = boolsOf(fields); if (bools.length > 8) throw new Error('too many bools: ' + bools.length); return { t: 'obj', fields, bools }; },
  list: (of, max, min = 0) => ({ t: 'list', of, max, min }), // u8 count
  // an action snapshot (N-8): axes as i16/32767 in the map's key order, then the buttons as flags (8 per byte); decodes to { axis: number, button: boolean }
  actions: map => {
    const names = Object.keys(map), axes = names.filter(n => map[n].kind === 'axis'), buttons = names.filter(n => map[n].kind === 'button');
    if (axes.length + buttons.length !== names.length) throw new Error('F.actions: every action must be axis() or button()');
    return { t: 'actions', names, axes, buttons };
  },
};
export const kind = def => { if (!Number.isInteger(def.code) || def.code < 0 || def.code > 255) throw new Error('bad kind code ' + def.code); return { idMin: 0, ...def, rec: F.obj(def.fields) }; }; // { name, code, authority: 'host' | 'owner', max, idMin, idMax, fields, newer? }
