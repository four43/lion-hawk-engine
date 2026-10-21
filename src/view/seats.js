// src/view/seats.js
// [C-5]–[C-9] (spec §5.5): seats, Unreal's ULocalPlayer. A seat holds devices and drives the controller of its seat
// number ([C-1]). The view never writes the sim: a seat opens and closes through the lh.seat command and follows
// engine.controllerOf(seat). Without enable() the page has one seat holding every device, today's behaviour.
// A driver device: polls getGamepads() once per frame, before the game's devices. Nothing here runs in the sim.
import { bindGamepad } from './gamepad.js';
import { bindKeyboard } from './keyboard.js';
import { NONE, checkContext, resolvePad, resolveKeys, resolveTouch, schemeKeysOf, mappableOf, inputKind } from './contexts.js';
import { createProfiles, deviceKey } from './profiles.js';
export const JOIN_AXIS = 0.5; // an axis this far from its rest value is a press (join, regain, capture, lp.pad)
const NO = Object.freeze([]);

export function createSeats(engine, { getGamepads, target = globalThis, doc, storage } = {}) {
  const get = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? NO);
  doc ??= target.document ?? globalThis.document;
  const list = [], listeners = [];
  const slots = [];              // slots[index]: the connected pad device at that Gamepad index
  const info = new Map();        // device -> internal state (pads: this frame's Gamepad, edges)
  const holder = new Map();      // device -> the seat holding it
  const usedLast = new WeakMap(); // seat -> the pad device it pressed last ([C-7])
  const known = new Set();       // every device this page has
  let opts = null, losses = 0;
  const leftAt = new WeakMap(); // leaving seat -> engine.time.step when leave() was called
  const defs = new Map();         // context name -> checked context
  const stacks = new WeakMap();   // seat -> [{ name, priority, order }], highest priority first
  const binds = new WeakMap();    // seat -> [{ dev, mod }]: the device modules writing its controller's input
  const profiles = createProfiles({ game: engine.game.id, storage });
  const saved = new WeakMap();     // seat -> { profile, data }
  const capturing = new WeakMap(); // seat -> the pending capture's resolve
  const since = new WeakMap();     // seat -> performance.now() when its capture began; keys made before that (the one that opened the menu) do not answer

  const emit = (type, seat, device, op) => {
    const e = op === undefined ? { type, seat, device } : { type, seat, device, op };
    for (let i = 0; i < listeners.length; i++) listeners[i](e);
  };
  const on = fn => {
    if (typeof fn !== 'function') throw new Error('seats.on: needs a function');
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  };
  const seatOf = n => { for (let i = 0; i < list.length; i++) if (list[i].seat === n) return list[i]; return undefined; };
  // [C-10], [C-11] rebuild a seat's bindings: one device module per (device, context) its stack binds, given the seat's
  // controller input as its engine, under source 'pad:<index>:<context>' or 'keys:<scheme>:<context>' (touch modules keep
  // their own). changed(lp, dev) rebuilds only that device's modules, so a pad joining, lost or regained leaves held keys,
  // ramps and a touch stick mid-drag alone; changed(lp) (a context or the seat itself changed) rebuilds all of them. A
  // module's dispose clears its input source, so a device that left the seat leaves no held button or axis behind.
  // Nothing binds while the seat is pending, leaving or gone.
  const changed = (lp, only) => {
    let out = binds.get(lp);
    const stack = stacks.get(lp);
    if (!list.includes(lp) || lp.pending || lp.leaving || !lp.controller || stack === undefined || stack.length === 0) {
      if (out !== undefined) { for (let i = 0; i < out.length; i++) out[i].mod.dispose?.(); binds.delete(lp); }
      return;
    }
    if (out === undefined) binds.set(lp, out = []);
    else for (let i = out.length - 1; i >= 0; i--) if (only === undefined || out[i].dev === only) { out[i].mod.dispose?.(); out.splice(i, 1); }
    const to = { input: lp.controller.input };
    for (let i = 0; i < lp.devices.length; i++) {
      const dev = lp.devices[i]; if (dev.lost || (only !== undefined && dev !== only)) continue;
      if (dev.kind === 'pad') {
        const s = info.get(dev);
        for (const r of resolvePad(stack, defs, s.live, overridesFor(lp, dev))) out.push({ dev, mod: bindGamepad(to, r.bindings, { getGamepads: () => s.one, source: `pad:${dev.index}:${r.context}`, map: r.map }) });
      } else if (dev.kind === 'keys') {
        for (const r of resolveKeys(stack, defs, dev.scheme, overridesFor(lp, dev))) out.push({ dev, mod: bindKeyboard(to, r.bindings, { target, doc, source: `keys:${dev.scheme}:${r.context}`, ramps: r.ramps, map: r.map }) });
      } else if (dev.kind === 'touch') {
        for (const r of resolveTouch(stack, defs)) { const made = r.make(to); for (const d of Array.isArray(made) ? made : [made]) if (d) out.push({ dev, mod: d }); }
      }
    }
  };
  const overridesFor = (lp, dev) => saved.get(lp)?.data[deviceKey(dev)] ?? NONE; // [C-13] this profile's overrides for this device
  // [C-12], [C-13] lp.bindings: the seat's player-mappable overrides, saved per profile and per device id
  const makeBindings = lp => {
    const st = { profile: `Player ${lp.seat + 1}`, data: null };
    st.data = profiles.load(st.profile); saved.set(lp, st);
    const held = dev => { if (holder.get(dev) !== lp) throw new Error(`bindings: seat ${lp.seat} does not hold that device`); };
    // re-read the stored profile, apply this seat's change to it and save: two seats on one profile name keep each other's mappings
    const save = apply => { st.data = profiles.load(st.profile); apply(st.data); profiles.save(st.profile, st.data); changed(lp); };
    const b = {
      get profile() { return st.profile; },
      set profile(name) {
        if (typeof name !== 'string' || name === '') throw new Error('bindings.profile: must be a non-empty string');
        st.profile = name; st.data = profiles.load(name); changed(lp);
      },
      get(name, dev) {
        held(dev);
        const from = mappableOf(defs, dev, info.get(dev)?.live ?? null, name); if (from === null) return null;
        const o = st.data[deviceKey(dev)]?.[name];
        return o !== undefined && inputKind(o) === inputKind(from) ? o : from;
      },
      map(name, dev, input) {
        held(dev);
        const from = mappableOf(defs, dev, info.get(dev)?.live ?? null, name);
        if (from === null) throw new Error(`bindings.map: no mappable binding '${name}' for this device`);
        if (dev.kind === 'keys' && typeof input === 'string') input = input.toLowerCase();
        if (inputKind(input) !== inputKind(from)) throw new Error(`bindings.map: '${name}' is on ${from}; ${JSON.stringify(input)} is not the same kind of input`);
        save(data => { const d = (data[deviceKey(dev)] ??= {}); if (input === from) delete d[name]; else d[name] = input; });
      },
      reset(name) {
        save(data => { for (const k of Object.keys(data)) { if (name === undefined) delete data[k]; else delete data[k][name]; } });
      },
      // the next button or axis edge of this seat's pads, or key on its keyboard schemes, for remap screens
      capture() { b.cancel(); since.set(lp, performance.now()); return new Promise(res => { capturing.set(lp, res); }); },
      cancel() { const r = capturing.get(lp); capturing.delete(lp); r?.(null); },
    };
    return b;
  };
  // [C-6] game device kinds (WebHID and the like): read() lists the kind's units each frame; key must be a string
  const kindList = []; // { kind, read, devs, byKey }
  let frameNo = 0;
  const kind = (name, spec) => {
    if (typeof name !== 'string' || name === '' || name === 'pad' || name === 'keys' || name === 'touch') throw new Error("seats.device: kind must be a new name ('pad', 'keys' and 'touch' are built in)");
    for (let i = 0; i < kindList.length; i++) if (kindList[i].kind === name) throw new Error(`seats.device: kind '${name}' is already registered`);
    if (typeof spec?.read !== 'function') throw new Error(`seats.device: kind '${name}' needs read()`);
    kindList.push({ kind: name, read: spec.read, devs: [], byKey: new Map() });
  };
  const readKinds = () => {
    if (kindList.length === 0) return;
    frameNo++;
    for (let n = 0; n < kindList.length; n++) {
      const K = kindList[n], units = K.read() ?? NO;
      for (let i = 0; i < units.length; i++) {
        const u = units[i], key = typeof u.key === 'string' ? u.key : String(u.key);
        let dev = K.byKey.get(key), fresh = false;
        if (dev === undefined) {
          dev = { kind: K.kind, key, id: String(u.id ?? ''), lost: false };
          K.byKey.set(key, dev); K.devs.push(dev); known.add(dev); fresh = true;
          info.set(dev, { live: u, seen: 0, act: false, edge: false, lostAt: 0, source: K.kind + ':' + key, checked: null });
        }
        const s = info.get(dev), a = u.active === true;
        s.seen = frameNo; s.live = u; s.edge = a && !s.act; s.act = a;
        if (!holder.has(dev) && (s.edge || (fresh && opts === null))) dev = offer(dev);
        const lp = holder.get(dev);
        if (lp !== undefined && !lp.pending && !lp.leaving && lp.controller && u.values) {
          const st = info.get(dev);
          if (st.checked !== lp.controller) { // once per unit and seat: an unknown action would otherwise throw every frame
            st.checked = lp.controller; st.bad = false;
            for (const act in u.values) if (!(act in lp.controller.input.kinds)) { st.bad = true; throw new Error(`seats.device: kind '${K.kind}' wrote unknown action '${act}'`); }
          }
          if (st.bad !== true) lp.controller.input.device(u.values, st.source); // a unit with an unknown action writes nothing after the one report
        }
      }
      for (let i = K.devs.length - 1; i >= 0; i--) {
        const dev = K.devs[i];
        if (info.get(dev).seen !== frameNo) { K.devs.splice(i, 1); K.byKey.delete(dev.key); loseUnit(dev); }
      }
    }
  };
  const loseUnit = dev => {
    const s = info.get(dev); s.live = null; s.lostAt = ++losses; dev.lost = true;
    const lp = holder.get(dev);
    if (lp === undefined) { info.delete(dev); known.delete(dev); return; }
    lp.controller?.input.clearDevice(s.source);
    emit('seat.lost', lp.seat, dev); changed(lp, dev);
  };
  const captured = (lp, dev, s) => { const r = capturing.get(lp); if (r !== undefined) { capturing.delete(lp); r({ device: dev, input: s.kind + ':' + s.at }); } };
  // the buttons held while a pad is paired stay masked from its bindings until let go, so the press that joined,
  // regained or was claimed with is not also a game input (review focus); context changes do not mask. Only buttons
  // are masked, not axes: a stick, pedal or trigger that joins also drives the game for that frame (N1, no rest model).
  const paired = dev => {
    if (dev.kind !== 'pad') return;
    const s = info.get(dev); if (s === undefined) return;
    for (let i = 0; i < s.btn.length; i++) s.mask[i] = s.btn[i];
  };

  const makeSeat = (seat, controller) => {
    const lp = {
      seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false, contexts: null, bindings: null,
      claim: dev => { claim(lp, dev); return lp; }, release: dev => { release(lp, dev); return lp; }, leave: () => leave(lp),
    };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    lp.bindings = makeBindings(lp); lp.contexts = makeStack(lp); start(lp);
    return lp;
  };
  const makeStack = lp => {
    const stack = []; let order = 0;
    stacks.set(lp, stack);
    const api = {
      add(name, priority = 0) {
        if (!defs.has(name)) throw new Error(`seats: unknown context '${name}' (declare it with view.context first)`);
        if (!Number.isFinite(priority)) throw new Error('seats: context priority must be a finite number');
        const i = stack.findIndex(x => x.name === name); if (i >= 0) stack.splice(i, 1);
        stack.push({ name, priority, order: ++order });
        stack.sort((a, b) => b.priority - a.priority || b.order - a.order);
        changed(lp); return api;
      },
      remove(name) { const i = stack.findIndex(x => x.name === name); if (i >= 0) { stack.splice(i, 1); changed(lp); } return api; },
      has: name => stack.some(x => x.name === name),
      get list() { return stack.map(x => x.name); },
    };
    return api;
  };
  // enable({ contexts }): every seat starts with them (names or [name, priority])
  const start = lp => { if (opts !== null) for (const c of opts.contexts) { if (Array.isArray(c)) lp.contexts.add(c[0], c[1]); else lp.contexts.add(c); } };
  // [C-10] declare (or replace) a context; each new keyboard scheme it names is a device on seat 0 ([C-8])
  const context = (name, def) => {
    defs.set(name, checkContext(name, def));
    for (const s of Object.keys(defs.get(name).keys)) if (!keysBy.has(s)) { const d = { kind: 'keys', scheme: s }; keysBy.set(s, d); known.add(d); attach(list[0], d); }
    schemeKeys.clear(); for (const [s, ks] of schemeKeysOf(defs)) schemeKeys.set(s, ks);
    for (let k = 0; k < list.length; k++) if (list[k].contexts.has(name)) changed(list[k]);
  };

  const newPad = (p, index) => {
    const dev = { kind: 'pad', index, id: String(p.id ?? ''), mapping: String(p.mapping ?? ''), lost: false };
    const view = { id: dev.id, index, mapping: dev.mapping, axes: NO, buttons: [] }; // what this pad's bindings read
    info.set(dev, { live: p, btn: [], hot: [], rest: null, edge: false, kind: null, at: -1, lostAt: 0, mask: [], view, one: [view] });
    known.add(dev);
    return dev;
  };
  // this frame's Gamepad as the bindings see it: its axes, and its buttons with masked ones up (reused objects, R-8)
  const viewOf = s => {
    const p = s.live, v = s.view, b = p.buttons ?? NO;
    v.id = p.id; v.index = p.index; v.mapping = p.mapping; v.axes = p.axes ?? NO;
    for (let i = 0; i < b.length; i++) {
      const src = b[i], d = src?.pressed === true;
      if (s.mask[i] && !d) s.mask[i] = false;
      let o = v.buttons[i]; if (o === undefined) o = v.buttons[i] = { pressed: false, value: 0 };
      if (s.mask[i]) { o.pressed = false; o.value = 0; } else { o.pressed = d; o.value = src?.value ?? (d ? 1 : 0); }
    }
    if (v.buttons.length !== b.length) v.buttons.length = b.length;
  };
  const views = () => { for (let i = 0; i < slots.length; i++) { const d = slots[i]; if (d !== undefined) viewOf(info.get(d)); } };
  const drive = (dt, raw) => {
    for (let k = 0; k < list.length; k++) { const b = binds.get(list[k]); if (b !== undefined) for (let i = 0; i < b.length; i++) b[i].mod.update?.(dt, raw); }
  };

  // s.edge: a button went down, or an axis moved more than JOIN_AXIS from its rest value, this frame; s.kind / s.at name the first such input
  const edges = (s, p) => {
    s.edge = false;
    const b = p.buttons ?? NO, a = p.axes ?? NO;
    if (s.rest === null) s.rest = Array.from(a, v => v ?? 0); // the first reading is the rest value: pedals at +-1, triggers at -1 are not presses
    for (let i = 0; i < b.length; i++) { const d = b[i]?.pressed === true; if (d && !s.btn[i] && !s.edge) { s.edge = true; s.kind = 'button'; s.at = i; } s.btn[i] = d; }
    for (let i = 0; i < a.length; i++) { const h = Math.abs((a[i] ?? 0) - (s.rest[i] ?? 0)) > JOIN_AXIS; if (h && !s.hot[i] && !s.edge) { s.edge = true; s.kind = 'axis'; s.at = i; } s.hot[i] = h; }
  };

  const attach = (lp, dev) => {
    const from = holder.get(dev); if (from === lp) return;
    if (from !== undefined) detach(from, dev);
    holder.set(dev, lp); lp.devices.push(dev); paired(dev);
    emit('seat.device', lp.seat, dev, 'add'); changed(lp, dev);
  };
  const detach = (lp, dev) => {
    const i = lp.devices.indexOf(dev); if (i >= 0) lp.devices.splice(i, 1);
    holder.delete(dev); if (usedLast.get(lp) === dev) usedLast.delete(lp);
    const src = info.get(dev)?.source; if (src !== undefined) lp.controller?.input.clearDevice(src); // a game kind writes values directly
    emit('seat.device', lp.seat, dev, 'remove'); changed(lp, dev);
  };
  // [C-9] a pad gone from its slot (or replaced there by another product) is lost: its seat keeps it, marked, and keeps
  // its controller and player; an unpaired lost pad is forgotten
  const lose = dev => {
    if (slots[dev.index] === dev) slots[dev.index] = undefined;
    const s = info.get(dev); s.live = null; s.lostAt = ++losses; dev.lost = true;
    const lp = holder.get(dev);
    if (lp === undefined) { info.delete(dev); known.delete(dev); return; }
    emit('seat.lost', lp.seat, dev); changed(lp, dev);
  };
  // [C-8] an unpaired device pressed (or, with one seat for everything, first seen): returns the device that now stands for it
  const offer = dev => {
    const back = regain(dev); if (back !== null) return back;
    if (opts === null) { attach(list[0], dev); return dev; }
    const r = opts.join(dev);
    if (r === null || r === undefined) return dev;
    let seat = r;
    if (r === 'new') { seat = freeSeat(); if (seat < 0) return dev; }
    else if (!Number.isInteger(r) || r < 0 || r >= opts.max) throw new Error(`seats: join must return a seat number in 0..${opts.max - 1}, 'new' or null`);
    const to = seatOf(seat);
    if (to?.leaving) return dev; // a seat that is leaving takes no device: it stays unpaired until its next press
    attach(to ?? open(seat), dev);
    return dev;
  };
  // [C-9] a seat waiting for a lost device of this kind gets the press first: the same product id, else the device lost
  // longest ago. The lost device object is reused, so the seat, its saved bindings and a game holding it keep one device.
  const regain = dev => {
    let best = null, same = false;
    for (let k = 0; k < list.length; k++) {
      if (list[k].leaving) continue; // a seat that is leaving takes nothing back
      const ds = list[k].devices;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i]; if (!d.lost || d.kind !== dev.kind) continue;
        const m = d.id === dev.id;
        if (best === null || (m && !same) || (m === same && info.get(d).lostAt < info.get(best).lostAt)) { best = d; same = m; }
      }
    }
    if (best === null) return null;
    const lp = holder.get(best), s = info.get(dev);
    info.delete(dev); known.delete(dev); info.set(best, s);
    best.id = dev.id; best.lost = false; place(best, dev); paired(best);
    emit('seat.regained', lp.seat, best); changed(lp, best);
    return best;
  };
  // the regained device takes the new one's place: a pad's slot, or a game kind's unit key
  const place = (best, dev) => {
    if (dev.kind === 'pad') { best.index = dev.index; best.mapping = dev.mapping; slots[best.index] = best; return; }
    const K = kindList.find(k => k.kind === dev.kind);
    best.key = dev.key; K.byKey.set(best.key, best); K.devs[K.devs.indexOf(dev)] = best;
    info.get(best).source = best.kind + ':' + best.key;
  };
  const claim = (lp, dev) => {
    if (!known.has(dev)) throw new Error('seats: claim needs a device from this page (lp.devices, seats.unpaired() or a seat event)');
    if (!list.includes(lp)) throw new Error(`seats: seat ${lp.seat} has left`);
    attach(lp, dev);
  };
  const release = (lp, dev) => {
    if (holder.get(dev) !== lp) throw new Error(`seats: seat ${lp.seat} does not hold that device`);
    detach(lp, dev);
    if (dev.lost) { info.delete(dev); known.delete(dev); }
  };
  const unpaired = () => { const out = []; for (const d of known) if (!holder.has(d)) out.push(d); return out; };
  // keyboard join: a key of an unpaired scheme offers that scheme's device ('all' takes every key; Task 4 fills schemeKeys)
  const GUARD = 'input, textarea, select, [contenteditable]';
  const schemeKeys = new Map(); // scheme -> Set of the keys its contexts bind
  const inScheme = (scheme, k) => scheme === 'all' || schemeKeys.get(scheme)?.has(k) === true;
  const onKey = e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.(GUARD)) return;
    const k = String(e.key).toLowerCase();
    if (opts !== null) for (const dev of keysBy.values()) if (!holder.has(dev) && inScheme(dev.scheme, k)) offer(dev);
    for (let n = 0; n < list.length; n++) { // a capturing seat takes the key on its own scheme ('all' only when it has no other)
      const lp = list[n], r = capturing.get(lp); if (r === undefined || !(e.timeStamp > since.get(lp))) continue;
      let dev = null;
      for (const d of lp.devices) if (d.kind === 'keys' && inScheme(d.scheme, k) && (dev === null || dev.scheme === 'all')) dev = d;
      if (dev !== null) { capturing.delete(lp); r({ device: dev, input: k }); }
    }
  };
  // the default join: seat 0 while it holds no pad (the keyboard sits there, so a solo pad player is player 1), else a new seat
  const defaultJoin = dev => (dev.kind === 'pad' && !seatOf(0).devices.some(d => d.kind === 'pad') ? 0 : 'new');
  const enable = ({ max = 4, join, contexts = [] } = {}) => {
    if (!Number.isInteger(max) || max < 1 || max > 16) throw new Error('seats: max must be an integer in 1..16');
    if (join !== undefined && typeof join !== 'function') throw new Error('seats: join must be a function');
    if (!Array.isArray(contexts)) throw new Error('seats: contexts must be a list of names or [name, priority]');
    opts = { max, join: join ?? defaultJoin, contexts };
    for (let k = 0; k < list.length; k++) start(list[k]);
  };
  const freeSeat = () => { for (let n = 0; n < opts.max; n++) if (seatOf(n) === undefined) return n; return -1; };
  // [C-5] a seat opens pending: lh.seat runs at the next step (offline; plan 3 asks the host), then sync() finds its controller
  const open = seat => { const lp = makeSeat(seat, null); engine.command('lh.seat', { op: 'join', seat }); return lp; };
  const leave = lp => {
    if (lp.seat === 0) throw new Error('seats: seat 0 never leaves');
    if (lp.leaving) return;
    lp.leaving = true; leftAt.set(lp, engine.time.step); lp.bindings.cancel(); changed(lp);
    engine.command('lh.seat', { op: 'leave', seat: lp.seat });
  };
  // a seat goes: out of the list first (so changed() binds nothing), its devices back to unpaired, lost ones forgotten
  const drop = lp => {
    list.splice(list.indexOf(lp), 1);
    for (let i = lp.devices.length - 1; i >= 0; i--) { const d = lp.devices[i]; detach(lp, d); if (d.lost) { info.delete(d); known.delete(d); } }
    const r = capturing.get(lp); if (r !== undefined) { capturing.delete(lp); r(null); }
    emit('seat.left', lp.seat, null);
  };
  // the view follows the sim's controllers: a pending seat binds once its controller exists; a leaving seat goes once
  // its controller is gone after a step; a seat whose controller vanished goes; a seat the sim opened itself appears.
  // Steady state (a ready seat whose controller is still listed) only does an includes() check, so the frame allocates nothing.
  const sync = () => {
    const cs = engine.controllers;
    for (let k = list.length - 1; k >= 0; k--) {
      const lp = list[k];
      if (!lp.pending && !lp.leaving && cs.includes(lp.controller)) continue;
      const c = engine.controllerOf(lp.seat);
      if (lp.leaving) { if (c === undefined && engine.time.step > leftAt.get(lp)) drop(lp); continue; }
      if (lp.pending) { if (c !== undefined) { lp.controller = c; lp.pending = false; emit('seat.joined', lp.seat, null); changed(lp); } continue; }
      if (c !== lp.controller) { if (c === undefined) drop(lp); else { lp.controller = c; changed(lp); } }
    }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.seat !== null && seatOf(c.seat) === undefined) { makeSeat(c.seat, c); emit('seat.joined', c.seat, null); }
    }
  };

  const refresh = () => {
    for (let k = 0; k < list.length; k++) {
      const lp = list[k], ds = lp.devices; let n = 0, lost = false;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i]; if (d.lost) { lost = true; continue; }
        if (d.kind === 'pad') lp.pads[n++] = info.get(d).live;
      }
      if (lp.pads.length !== n) lp.pads.length = n;
      lp.lost = lost;
      let last = usedLast.get(lp);
      if (last === undefined || last.lost) { last = undefined; for (let i = 0; i < ds.length; i++) if (ds[i].kind === 'pad' && !ds[i].lost) { last = ds[i]; break; } }
      lp.pad = last === undefined ? null : info.get(last).live;
    }
  };
  const poll = () => {
    const pads = get() ?? NO;
    for (let i = 0; i < slots.length; i++) {
      const dev = slots[i]; if (dev === undefined) continue;
      const p = pads[i];
      if (!p || p.connected === false || String(p.id ?? '') !== dev.id) lose(dev);
    }
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; if (!p || p.connected === false) continue;
      let dev = slots[i], fresh = false;
      if (dev === undefined) { dev = slots[i] = newPad(p, i); fresh = true; }
      const s = info.get(dev); s.live = p; edges(s, p);
      if (!holder.has(dev) && (s.edge || (fresh && opts === null))) dev = offer(dev);
      const lp = holder.get(dev);
      if (lp !== undefined && s.edge) { usedLast.set(lp, dev); captured(lp, dev, s); }
    }
  };

  // seat 0 (keep this block last, before return): [C-8] the keyboard and touch start here
  const keys = { kind: 'keys', scheme: 'all' }, touch = { kind: 'touch' };
  const keysBy = new Map([['all', keys]]); // scheme -> keyboard device
  known.add(keys); known.add(touch);
  const zero = makeSeat(0, engine.controllerOf(0));
  zero.devices.push(keys, touch); holder.set(keys, zero); holder.set(touch, zero);
  target.addEventListener?.('keydown', onKey);

  return {
    list, // view.localPlayers, in seat order
    on, enable, unpaired, context, kind,
    update(dt, raw = dt) { sync(); poll(); readKinds(); refresh(); views(); drive(dt, raw); },
    dispose() {
      target.removeEventListener?.('keydown', onKey);
      for (let k = 0; k < list.length; k++) { const b = binds.get(list[k]); if (b !== undefined) for (let i = 0; i < b.length; i++) b[i].mod.dispose?.(); binds.delete(list[k]); }
      listeners.length = 0;
    },
  };
}
