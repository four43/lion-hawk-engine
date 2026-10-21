// src/core/controllers.js
// [C-1]–[C-4] (spec §5.5): controllers, Unreal's APlayerController / AAIController. One per local seat (seat 0 always,
// player 1) plus bots; each has its own input over the game's one action schema. possess(e) makes e the pawn, one
// controller per pawn; copy() (lh.possess, each step) fills e.input from the snapshot ([I-4]). Sim-pure.
import { createInput } from './actions.js';

const MAX_SEAT = 15;

export function createControllers(schema, { input, emit, world }) {
  const list = [], holder = new Map(); // pawn -> controller
  let gated = false, nextId = 1;
  const drop = (c, reason) => {
    const e = c.pawn; if (!e) return;
    c.pawn = null; holder.delete(e);
    const I = e.input;
    if (I === c.input.snapshot) e.input = undefined; // the next holder's copy() assigns its own snapshot
    else if (I !== null && typeof I === 'object') for (const k in I) I[k] = typeof I[k] === 'number' ? 0 : false; // a net-made input stops holding the last value
    emit('controller.unpossess', { controller: c.id, seat: c.seat, player: c.player, pawn: e.id, reason });
  };
  // [I-4]: a pawn whose e.input the net layer made keeps its shape (only its keys, buttons as down); any other pawn reads the snapshot itself
  const fill = c => {
    const e = c.pawn, s = c.input.snapshot, I = e.input;
    if (I === undefined || I === s) { e.input = s; return; }
    for (const k in I) if (k in s) { const v = s[k]; I[k] = typeof v === 'number' ? v : v.down; }
  };
  const remove = c => { const i = list.indexOf(c); if (i < 0) return; drop(c, 'left'); c.disposed = true; list.splice(i, 1); };
  const isEntity = e => e !== null && typeof e === 'object' && Number.isInteger(e.id);
  const make = ({ seat = null, bot = false, player = 0, input: own } = {}) => {
    const c = {
      id: nextId++, seat, bot, player, disposed: false, input: own ?? createInput(schema), pawn: null,
      possess(e) {
        if (c.disposed) throw new Error('controller.possess: controller was disposed');
        if (!isEntity(e)) throw new Error('controller.possess: needs an entity');
        if (e.net !== undefined && world()?.net?.remoteOf?.(e) !== undefined) throw new Error(`controller.possess: entity ${e.id} is simulated by another peer`);
        if (c.pawn === e) return c;
        drop(c, 'unpossess');
        const other = holder.get(e); if (other) drop(other, 'taken');
        c.pawn = e; holder.set(e, c);
        emit('controller.possess', { controller: c.id, seat: c.seat, player: c.player, pawn: e.id });
        fill(c); // a pawn possessed mid-step has its input at once
        return c;
      },
      unpossess() { drop(c, 'unpossess'); return c; },
      dispose() {
        if (c.seat !== null) throw new Error('controller.dispose: seats leave with the lh.seat command');
        remove(c);
      },
    };
    if (gated) c.input.gate(true);
    // seats in seat order, then bots in creation order
    let at = list.length;
    if (seat !== null) { at = list.findIndex(x => x.seat === null || x.seat > seat); if (at < 0) at = list.length; }
    list.splice(at, 0, c);
    return c;
  };
  make({ seat: 0, player: 1, input });

  const freeNumber = () => { let n = 1; while (list.some(c => c.player === n)) n++; return n; };
  return {
    list, make,
    of(seat) { for (let i = 0; i < list.length; i++) if (list[i].seat === seat) return list[i]; return undefined; },
    renumber(from, to) {
      const c = list.find(x => x.player === from);
      if (!c) throw new Error(`controllers.renumber: no controller is player ${from}`);
      if (list.some(x => x !== c && x.player === to)) throw new Error(`controllers.renumber: player ${to} is taken`);
      c.player = to;
      emit('controller.renumbered', { controller: c.id, seat: c.seat, from, to });
    },
    applyInputs() { for (let i = 0; i < list.length; i++) list[i].input.apply(); },
    gate(on) { gated = !!on; for (let i = 0; i < list.length; i++) list[i].input.gate(gated); },
    // [I-4]: a dead pawn (despawned, or from a World a scene change replaced) is dropped; see fill()
    copy() {
      const w = world();
      for (let i = 0; i < list.length; i++) {
        const c = list[i], e = c.pawn; if (!e) continue;
        if (w === undefined || w.get(e.id) !== e) { drop(c, 'despawned'); continue; }
        if (e.net !== undefined && w.net?.remoteOf?.(e) !== undefined) { drop(c, 'remote'); continue; } // another peer simulates it now
        fill(c);
      }
    },
    // the lh.seat command's effect; n: the number the net part chose (default: the lowest free)
    seat(op, seat, n) {
      if (op !== 'join' && op !== 'leave') throw new Error("lh.seat: op must be 'join' or 'leave'");
      if (!Number.isInteger(seat) || seat < 0 || seat > MAX_SEAT) throw new Error(`lh.seat: seat must be an integer in 0..${MAX_SEAT}`);
      const c = this.of(seat);
      if (op === 'join') {
        if (c) return c;
        const p = n ?? freeNumber();
        if (!Number.isInteger(p) || p < 1 || p > 255) throw new Error(`lh.seat: player number must be an integer in 1..255 (got ${p})`);
        if (list.some(x => x.player === p)) throw new Error(`lh.seat: player ${p} is taken`);
        const made = make({ seat, player: p });
        emit('controller.joined', { controller: made.id, seat, player: p });
        return made;
      }
      if (!c || seat === 0) return null; // seat 0 is the page's first player and never leaves
      remove(c); emit('controller.left', { controller: c.id, seat, player: c.player });
      return null;
    },
  };
}
