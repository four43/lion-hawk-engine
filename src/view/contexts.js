// src/view/contexts.js
// [C-10]–[C-12] (spec §5.5): mapping contexts, Unreal Enhanced Input's Input Mapping Contexts. A context gives default
// bindings per device: `pads` (the first entry whose match(pad) is true), `keys` per keyboard scheme and `touch` (engine => devices, called with { input }). The
// binding objects are bindGamepad's and bindKeyboard's ([I-2]); `map` and `ramps` sit beside them, and `mappable` names
// the bindings a player may move ({ Brake: 'button:6' }, { Brake: 's' }; the name is the save key). Inputs are named
// 'button:<i>' / 'axis:<i>' on a pad and by bindKeyboard's lower-case key on a keyboard. resolve*() turn a seat's stack
// (highest priority first) into one binding set per context; a higher context keeps an input a lower one also binds.
// Pure: no DOM, no storage.
export const NONE = Object.freeze({});
const PAD_INPUT = /^(button|axis):(\d+)$/;
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);

export const inputKind = x => {
  if (typeof x !== 'string' || x === '') return null;
  const m = PAD_INPUT.exec(x); if (m) return m[1];
  return /^(button|axis):/.test(x) ? null : 'key';
};
const lower = b => { const o = {}; for (const k of Object.keys(b)) o[k.toLowerCase()] = b[k]; return o; };
const lowerKey = x => (typeof x === 'string' ? x.toLowerCase() : x);
const padHas = b => x => { const m = PAD_INPUT.exec(x); return m !== null && Object.hasOwn((m[1] === 'button' ? b.buttons : b.axes) ?? NONE, m[2]); };
const checkMappable = (who, m, has, norm = x => x) => {
  if (m === undefined) return undefined;
  if (!isObj(m)) throw new Error(`${who} mappable must be { [name]: input }`);
  const out = {};
  for (const n of Object.keys(m)) {
    const v = norm(m[n]);
    if (typeof v !== 'string' || !has(v)) throw new Error(`${who} mappable '${n}' names ${JSON.stringify(m[n])}, which it does not bind`);
    out[n] = v;
  }
  return Object.freeze(out);
};

export function checkContext(name, def) {
  if (typeof name !== 'string' || name === '') throw new Error('context: name must be a non-empty string');
  const who = `context '${name}'`;
  if (!isObj(def)) throw new Error(`${who}: needs { pads, keys, touch }`);
  if (def.pads !== undefined && !Array.isArray(def.pads)) throw new Error(`${who}: pads must be a list of { match, bindings }`);
  const pads = (def.pads ?? []).map((p, i) => {
    if (typeof p?.match !== 'function') throw new Error(`${who}: pads[${i}].match must be a function`);
    if (!isObj(p.bindings)) throw new Error(`${who}: pads[${i}].bindings must be bindGamepad bindings`);
    return Object.freeze({ match: p.match, bindings: p.bindings, map: p.map, mappable: checkMappable(`${who}: pads[${i}]`, p.mappable, padHas(p.bindings)) });
  });
  if (def.keys !== undefined && !isObj(def.keys)) throw new Error(`${who}: keys must be { [scheme]: { bindings, ramps, map, mappable } }`);
  const keys = {};
  for (const s of Object.keys(def.keys ?? NONE)) {
    const k = def.keys[s];
    if (!isObj(k?.bindings)) throw new Error(`${who}: keys.${s}.bindings must be bindKeyboard bindings`);
    const b = lower(k.bindings);
    keys[s] = Object.freeze({ bindings: b, ramps: k.ramps, map: k.map, mappable: checkMappable(`${who}: keys.${s}`, k.mappable, x => Object.hasOwn(b, x), lowerKey) });
  }
  if (def.touch !== undefined && typeof def.touch !== 'function') throw new Error(`${who}: touch must be a function (engine) => devices`);
  return Object.freeze({ pads: Object.freeze(pads), keys: Object.freeze(keys), touch: def.touch });
}

// a device's bindings with a profile's overrides ([C-12]): each overridden mappable binding moves from its default input
// to the saved one, replacing what was there. Moves read the defaults, so two bindings can swap. A saved input of another
// kind (a stale or hand-edited save) is skipped.
const movePad = (b, mappable, over) => {
  const out = { deadZone: b.deadZone, axes: { ...b.axes }, buttons: { ...b.buttons } };
  if (mappable === undefined || over === NONE) return out;
  const put = [];
  for (const n of Object.keys(mappable)) {
    const from = mappable[n], to = over[n], kind = inputKind(from);
    if (to === undefined || to === from || inputKind(to) !== kind) continue;
    const i = from.slice(kind.length + 1), j = to.slice(kind.length + 1);
    const src = kind === 'button' ? b.buttons : b.axes, dst = kind === 'button' ? out.buttons : out.axes;
    delete dst[i]; put.push([dst, j, src[i]]);
  }
  for (const [dst, j, v] of put) dst[j] = v;
  return out;
};
const moveKeys = (b, mappable, over) => {
  const out = { ...b };
  if (mappable === undefined || over === NONE) return out;
  const put = [];
  for (const n of Object.keys(mappable)) {
    const from = mappable[n], to = lowerKey(over[n]);
    if (to === undefined || to === from || inputKind(to) !== 'key') continue;
    delete out[from]; put.push([to, b[from]]);
  }
  for (const [k, v] of put) out[k] = v;
  return out;
};

export function resolvePad(stack, defs, pad, over = NONE) {
  const out = [], taken = new Set();
  for (const { name } of stack) {
    const def = defs.get(name); if (def === undefined) continue;
    const entry = def.pads.find(p => p.match(pad)); if (entry === undefined) continue;
    const b = movePad(entry.bindings, entry.mappable, over), axes = {}, buttons = {};
    for (const i of Object.keys(b.axes)) if (!taken.has('axis:' + i)) axes[i] = b.axes[i];
    for (const i of Object.keys(b.buttons)) if (!taken.has('button:' + i)) buttons[i] = b.buttons[i];
    for (const i of Object.keys(axes)) taken.add('axis:' + i);
    for (const i of Object.keys(buttons)) taken.add('button:' + i);
    if (Object.keys(axes).length + Object.keys(buttons).length > 0) out.push({ context: name, bindings: { deadZone: b.deadZone, axes, buttons }, map: entry.map });
  }
  return out;
}
export function resolveKeys(stack, defs, scheme, over = NONE) {
  const out = [], taken = new Set();
  for (const { name } of stack) {
    const entry = defs.get(name)?.keys[scheme]; if (entry === undefined) continue;
    const b = moveKeys(entry.bindings, entry.mappable, over), bindings = {};
    for (const k of Object.keys(b)) if (!taken.has(k)) bindings[k] = b[k];
    for (const k of Object.keys(bindings)) taken.add(k);
    if (Object.keys(bindings).length > 0) out.push({ context: name, bindings, ramps: entry.ramps, map: entry.map });
  }
  return out;
}
// touch bindings are DOM elements the engine cannot compare, so only the highest context with touch binds it
export function resolveTouch(stack, defs) {
  for (const { name } of stack) { const t = defs.get(name)?.touch; if (t !== undefined) return [{ context: name, make: t }]; }
  return [];
}
export function mappableOf(defs, dev, live, name) {
  for (const def of defs.values()) {
    const entry = dev.kind === 'pad' ? (live ? def.pads.find(p => p.match(live)) : undefined) : dev.kind === 'keys' ? def.keys[dev.scheme] : undefined;
    const at = entry?.mappable?.[name]; if (at !== undefined) return at;
  }
  return null;
}
export function schemeKeysOf(defs) {
  const out = new Map();
  for (const def of defs.values()) for (const s of Object.keys(def.keys)) {
    const set = out.get(s) ?? new Set();
    for (const k of Object.keys(def.keys[s].bindings)) set.add(k);
    out.set(s, set);
  }
  return out;
}
