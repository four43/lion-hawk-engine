// src/defs/fields.js
// Field types and kinds for replicated objects (N-8, N-11, M-22). Plain data: src/sim/replica.js packs them.
// Phase 3i: F.body() (N-8) and the kind's net-part options (N-9, N-12..N-17, D8): remote, follow, tune, send and the spawn hooks.
// Existing kinds keep their wire bytes; only a driven kind sends its `input` as { s, list } (N-13).
const boolsOf = fields => Object.keys(fields).filter(k => fields[k].t === 'bool');
export const F = {
  bool: () => ({ t: 'bool' }), // the bools of one obj share a flags byte (at most 8)
  uint: (bytes, max = 2 ** (8 * bytes) - 1, min = 0) => { if (![1, 2, 4].includes(bytes)) throw new Error('bad uint width ' + bytes); if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new Error(`bad uint range ${min}..${max}`); return { t: 'uint', bytes, max, min }; }, // min: encode throws below it, decode drops (N-8)
  id: () => ({ t: 'id' }), // u16; null travels as 0xffff
  oneOf: list => ({ t: 'enum', list }), // u8 index
  fixed: (lo, hi, step) => ({ t: 'fixed', lo, hi, step, n: Math.round((hi - lo) / step) }), // u16 steps from lo; values are clamped into lo..hi
  angle: () => ({ t: 'angle' }), // u16 over a full turn
  quat: () => ({ t: 'quat' }), // 4 x i16, normalized on decode
  obj: fields => { const bools = boolsOf(fields); if (bools.length > 8) throw new Error('too many bools: ' + bools.length); return { t: 'obj', fields, bools, keys: Object.keys(fields).filter(k => fields[k].t !== 'bool') }; }, // keys: the packed fields in order (replica.js loops them)
  list: (of, max, min = 0) => ({ t: 'list', of, max, min }), // u8 count
  // an action snapshot (N-8): axes as i16/32767 in the map's key order, then the buttons as flags (8 per byte); decodes to { axis: number, button: boolean }
  actions: map => {
    const names = Object.keys(map), axes = names.filter(n => map[n].kind === 'axis'), buttons = names.filter(n => map[n].kind === 'button');
    if (axes.length + buttons.length !== names.length) throw new Error('F.actions: every action must be axis() or button()');
    return { t: 'actions', names, axes, buttons };
  },
  // N-8: one body's { p, q, v, w } at this precision: p.x/p.z in 1/64 m over ±range, p.y in 1/256 m over ±height,
  // v in 1/1000 m/s over ±32, w in 1/2000 rad/s over ±16 (26 bytes). An obj field, so replica.js packs it unchanged; `body: true` marks it.
  body: ({ range = 400, height = 50 } = {}) => {
    if (!(range > 0 && range * 2 * 64 <= 65535)) throw new Error(`F.body: range must be in (0, 511] (got ${range})`);
    if (!(height > 0 && height * 2 * 256 <= 65535)) throw new Error(`F.body: height must be in (0, 127] (got ${height})`);
    const XZ = F.fixed(-range, range, 1 / 64), Y = F.fixed(-height, height, 1 / 256), V = F.fixed(-32, 32, 1 / 1000), W = F.fixed(-16, 16, 1 / 2000);
    return { ...F.obj({ p: F.obj({ x: XZ, y: Y, z: XZ }), q: F.quat(), v: F.obj({ x: V, y: V, z: V }), w: F.obj({ x: W, y: W, z: W }) }), body: true, range, height };
  },
};
export const REMOTES = Object.freeze(['driven', 'proxy', 'view']), FOLLOWS = Object.freeze(['interp', 'forecast']);
export const TUNE = Object.freeze({ snapAt: 1.5, nudge: 6, smoothMs: 150 }); // N-14, N-15, N-17 defaults
export const SEND = Object.freeze({ hz: 20, key: 2 }); // N-11: diffs at hz, a keyframe every `key` seconds
export const INPUT_BATCH = 8; // N-13: a driven record carries the newest input and at least 7 before it (2 × steps per send when that is more)
export const INPUT_WIRE_MAX = 64; // N-13: the most inputs one record may carry (the list's u8 count; only the inputs sent cost bytes)
const checkKeys = (o, allowed, what, fail) => { for (const k of Object.keys(o)) if (!(k in allowed)) fail(`unknown ${what} key '${k}'`); };
// { name, code, authority: 'host' | 'owner', max, idMin, idMax, fields, remote?, follow?, tune?, send?, record?, apply?, newer?, spawn?, spawned? }
export const kind = def => {
  if (!Number.isInteger(def.code) || def.code < 0 || def.code > 255) throw new Error('bad kind code ' + def.code);
  const fail = m => { throw new Error(`kind '${def.name}': ${m}`); };
  const fields = def.fields, input = fields?.input?.t === 'actions' ? fields.input : null;
  const bodies = fields ? Object.keys(fields).filter(k => fields[k]?.body === true) : [];
  const remote = def.remote ?? (def.authority === 'owner' && input && bodies.includes('body') ? 'driven' : 'proxy');
  if (!REMOTES.includes(remote)) fail(`remote must be one of ${REMOTES.join(', ')} (got ${remote})`);
  if (remote === 'driven' && (!input || !bodies.includes('body'))) fail("remote 'driven' needs an input: F.actions(...) field and a body: F.body() field");
  if (remote === 'driven' && def.authority !== 'owner') fail("remote 'driven' needs authority 'owner'");
  const follow = def.follow ?? 'interp';
  if (!FOLLOWS.includes(follow)) fail(`follow must be one of ${FOLLOWS.join(', ')} (got ${follow})`);
  if (follow === 'forecast' && !bodies.length) fail("follow 'forecast' needs an F.body() field");
  if (def.tune !== undefined) checkKeys(def.tune, TUNE, 'tune', fail);
  const tune = { ...TUNE, ...def.tune };
  if (!(tune.snapAt > 0 && Number.isFinite(tune.snapAt))) fail(`tune.snapAt must be > 0 (got ${tune.snapAt})`);
  if (!(Number.isInteger(tune.nudge) && tune.nudge >= 1)) fail(`tune.nudge must be an integer >= 1 (got ${tune.nudge})`);
  if (!(tune.smoothMs >= 0 && Number.isFinite(tune.smoothMs))) fail(`tune.smoothMs must be >= 0 (got ${tune.smoothMs})`);
  if (def.send !== undefined) checkKeys(def.send, SEND, 'send', fail);
  const send = { ...SEND, ...def.send };
  for (const k of ['hz', 'key']) if (!(send[k] > 0 && Number.isFinite(send[k]))) fail(`send.${k} must be > 0 (got ${send[k]})`);
  for (const h of ['record', 'apply', 'newer', 'spawn', 'spawned']) if (def[h] !== undefined && typeof def[h] !== 'function') fail(`${h} must be a function`);
  // N-13: a driven kind's input travels as { s: the owner step of the newest input, list: up to INPUT_WIRE_MAX snapshots, oldest first }
  const wire = remote === 'driven' ? { ...fields, input: F.obj({ s: F.uint(4), list: F.list(input, INPUT_WIRE_MAX, 1) }) } : fields;
  return { idMin: 0, ...def, remote, follow, tune: Object.freeze(tune), send: Object.freeze(send), bodies, input, rec: F.obj(wire) };
};
