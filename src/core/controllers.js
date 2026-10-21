// src/core/controllers.js
// [C-1]–[C-4] (spec §5.5): controllers, Unreal's APlayerController / AAIController. One per local seat (seat 0 always,
// player 1) plus bots; each has its own input over the game's one action schema. possess(e) makes e the pawn, one
// controller per pawn; copy() (lh.possess, each step) fills e.input from the snapshot ([I-4]). Sim-pure.
import { createInput } from './actions.js';

const MAX_SEAT = 15;

export function createControllers(schema, { input, emit, world }) {
  const list = [], holder = new Map(); // pawn -> controller
  let gated = false;
  const drop = (c, reason) => {
    const e = c.pawn; if (!e) return;
    c.pawn = null; holder.delete(e);
    if (e.input === c.input.snapshot) e.input = undefined; // the next holder's copy() assigns its own snapshot
    emit('controller.unpossess', { seat: c.seat, player: c.player, pawn: e.id, reason });
  };
  const isEntity = e => e !== null && typeof e === 'object' && Number.isInteger(e.id);
  const make = ({ seat = null, bot = false, player = 0, input: own } = {}) => {
    const c = {
      seat, bot, player, input: own ?? createInput(schema), pawn: null,
      possess(e) {
        if (!isEntity(e)) throw new Error('controller.possess: needs an entity');
        if (e.net !== undefined && world()?.net?.remoteOf?.(e) !== undefined) throw new Error(`controller.possess: entity ${e.id} is simulated by another peer`);
        if (c.pawn === e) return c;
        drop(c, 'unpossess');
        const other = holder.get(e); if (other) drop(other, 'taken');
        c.pawn = e; holder.set(e, c);
        emit('controller.possess', { seat: c.seat, player: c.player, pawn: e.id });
        return c;
      },
      unpossess() { drop(c, 'unpossess'); return c; },
      dispose() { const i = list.indexOf(c); if (i < 0) return; drop(c, 'left'); list.splice(i, 1); },
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
    applyInputs() { for (let i = 0; i < list.length; i++) list[i].input.apply(); },
    gate(on) { gated = !!on; for (let i = 0; i < list.length; i++) list[i].input.gate(gated); },
    // [I-4]: a dead pawn (despawned, or from a World a scene change replaced) is dropped; a pawn whose e.input the net
    // layer made keeps its shape (only its keys, buttons as down); any other pawn reads the snapshot itself
    copy() {
      const w = world();
      for (let i = 0; i < list.length; i++) {
        const c = list[i], e = c.pawn; if (!e) continue;
        if (w === undefined || w.get(e.id) !== e) { drop(c, 'despawned'); continue; }
        const s = c.input.snapshot, I = e.input;
        if (I === undefined || I === s) { e.input = s; continue; }
        for (const k in I) if (k in s) { const v = s[k]; I[k] = typeof v === 'number' ? v : v.down; }
      }
    },
    // the lh.seat command's effect, offline numbering (solo/host: lowest free number); plan 3 asks the host online
    seat(op, seat) {
      if (op !== 'join' && op !== 'leave') throw new Error("lh.seat: op must be 'join' or 'leave'");
      if (!Number.isInteger(seat) || seat < 0 || seat > MAX_SEAT) throw new Error(`lh.seat: seat must be an integer in 0..${MAX_SEAT}`);
      const c = list.find(x => x.seat === seat);
      if (op === 'join') {
        if (c) return c;
        const n = make({ seat, player: freeNumber() });
        emit('controller.joined', { seat, player: n.player });
        return n;
      }
      if (!c || seat === 0) return null; // seat 0 is the page's first player and never leaves
      c.dispose(); emit('controller.left', { seat, player: c.player });
      return null;
    },
  };
}
