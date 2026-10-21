// src/view/seats.js
// [C-5]–[C-9] (spec §5.5): seats, Unreal's ULocalPlayer. A seat holds devices and drives the controller of its seat
// number ([C-1]). The view never writes the sim: a seat opens and closes through the lh.seat command and follows
// engine.controllerOf(seat). Without enable() the page has one seat holding every device, today's behaviour.
// A driver device: polls getGamepads() once per frame, before the game's devices. Nothing here runs in the sim.
export const JOIN_AXIS = 0.5; // an axis this far from its rest value is a press (join, regain, capture, lp.pad)
const NO = Object.freeze([]);

export function createSeats(engine, { getGamepads, target = globalThis, doc } = {}) {
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
  const changed = lp => {}; // a seat's devices or contexts changed: Task 4 rebuilds its bindings here
  const paired = dev => {}; // a device was just paired to a seat: Task 4 masks the buttons held right now

  const makeSeat = (seat, controller) => {
    const lp = {
      seat, controller, pending: controller === null, leaving: false, devices: [], pad: null, pads: [], lost: false,
      claim: dev => { claim(lp, dev); return lp; }, release: dev => { release(lp, dev); return lp; }, leave: () => leave(lp),
    };
    let at = 0; while (at < list.length && list[at].seat < seat) at++;
    list.splice(at, 0, lp);
    return lp;
  };

  const newPad = (p, index) => {
    const dev = { kind: 'pad', index, id: String(p.id ?? ''), mapping: String(p.mapping ?? ''), lost: false };
    info.set(dev, { live: p, btn: [], hot: [], rest: null, edge: false, kind: null, at: -1, lostAt: 0 });
    known.add(dev);
    return dev;
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
    emit('seat.device', lp.seat, dev, 'add'); changed(lp);
  };
  const detach = (lp, dev) => {
    const i = lp.devices.indexOf(dev); if (i >= 0) lp.devices.splice(i, 1);
    holder.delete(dev); if (usedLast.get(lp) === dev) usedLast.delete(lp);
    emit('seat.device', lp.seat, dev, 'remove'); changed(lp);
  };
  // [C-9] a pad gone from its slot (or replaced there by another product) is lost: its seat keeps it, marked, and keeps
  // its controller and player; an unpaired lost pad is forgotten
  const lose = dev => {
    if (slots[dev.index] === dev) slots[dev.index] = undefined;
    const s = info.get(dev); s.live = null; s.lostAt = ++losses; dev.lost = true;
    const lp = holder.get(dev);
    if (lp === undefined) { info.delete(dev); known.delete(dev); return; }
    emit('seat.lost', lp.seat, dev); changed(lp);
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
    emit('seat.regained', lp.seat, best); changed(lp);
    return best;
  };
  // the regained device takes the new one's place (Task 6 adds game kinds)
  const place = (best, dev) => { best.index = dev.index; best.mapping = dev.mapping; slots[best.index] = best; };
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
  };
  // the default join: seat 0 while it holds no pad (the keyboard sits there, so a solo pad player is player 1), else a new seat
  const defaultJoin = dev => (dev.kind === 'pad' && !seatOf(0).devices.some(d => d.kind === 'pad') ? 0 : 'new');
  const enable = ({ max = 4, join } = {}) => {
    if (!Number.isInteger(max) || max < 1 || max > 16) throw new Error('seats: max must be an integer in 1..16');
    if (join !== undefined && typeof join !== 'function') throw new Error('seats: join must be a function');
    opts = { max, join: join ?? defaultJoin };
  };
  const freeSeat = () => { for (let n = 0; n < opts.max; n++) if (seatOf(n) === undefined) return n; return -1; };
  // [C-5] a seat opens pending: lh.seat runs at the next step (offline; plan 3 asks the host), then sync() finds its controller
  const open = seat => { const lp = makeSeat(seat, null); engine.command('lh.seat', { op: 'join', seat }); return lp; };
  const leave = lp => {
    if (lp.seat === 0) throw new Error('seats: seat 0 never leaves');
    if (lp.leaving) return;
    lp.leaving = true; leftAt.set(lp, engine.time.step); changed(lp);
    engine.command('lh.seat', { op: 'leave', seat: lp.seat });
  };
  // a seat goes: out of the list first (so changed() binds nothing), its devices back to unpaired, lost ones forgotten
  const drop = lp => {
    list.splice(list.indexOf(lp), 1);
    for (let i = lp.devices.length - 1; i >= 0; i--) { const d = lp.devices[i]; detach(lp, d); if (d.lost) { info.delete(d); known.delete(d); } }
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
      if (lp !== undefined && s.edge) usedLast.set(lp, dev);
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
    on, enable, unpaired,
    update() { sync(); poll(); refresh(); },
    dispose() { target.removeEventListener?.('keydown', onKey); listeners.length = 0; },
  };
}
