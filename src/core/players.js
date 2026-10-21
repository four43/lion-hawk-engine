// src/core/players.js
// [N-20]–[N-23] (spec §4.6): the roster and player and game state, Unreal's PlayerArray, APlayerState and AGameState. Sim-pure.
// One entry per active or inactive player number, { number, seat, local, away, active, join, ...the game's player fields }, in
// number order, and one game-state object. Offline the page's seats fill it; online the host does and the net part replicates
// both as the built-in kinds lh.player and lh.game (stateKinds). Entries are plain objects updated in place: a game writes fields
// on the host (or solo) and reads them the same way everywhere.
import { F, kind } from '../defs/fields.js';

export const PLAYER_KIND = 'lh.player', GAME_KIND = 'lh.game', PLAYER_CODE = 255, GAME_CODE = 254;
// the engine's replicated player fields (two of an F.obj's eight bools); join: which joining of this number (Tractor's counter)
export const PLAYER_BASE = Object.freeze({ seat: F.uint(1, 15), away: F.bool(), active: F.bool(), join: F.uint(1) });
export const PLAYER_RESERVED = Object.freeze(['number', 'local', ...Object.keys(PLAYER_BASE)]);
export const SEATS = Symbol('lh.seats'); // engine[SEATS] = { controllers, roster, route, changed }: the net part's seam, not public API

// the value a new player's or the game state's field starts at
export function zeroOf(f) {
  switch (f?.t) {
    case 'bool': return false;
    case 'uint': return f.min;
    case 'id': return null;
    case 'enum': return f.list[0];
    case 'fixed': return Math.max(f.lo, Math.min(f.hi, 0));
    case 'angle': return 0;
    case 'quat': return { x: 0, y: 0, z: 0, w: 1 };
    case 'obj': { const o = {}; for (const k in f.fields) o[k] = zeroOf(f.fields[k]); return o; }
    case 'list': return Array.from({ length: f.min }, () => zeroOf(f.of));
    case 'actions': { const o = {}; for (const n of f.axes) o[n] = 0; for (const n of f.buttons) o[n] = false; return o; }
  }
  throw new Error(`players: not an F field (${f?.t})`);
}

// [N-22] the built-in kinds: one lh.player record per number (1..maxSender), one lh.game record (id 0); host authority, no body
export const stateKinds = ({ player = {}, gameState = {} } = {}, maxSender = 255) => [
  kind({ name: PLAYER_KIND, code: PLAYER_CODE, authority: 'host', remote: 'view', max: maxSender, idMin: 1, idMax: maxSender, send: { hz: 10, key: 2 }, fields: { ...PLAYER_BASE, ...player } }),
  kind({ name: GAME_KIND, code: GAME_CODE, authority: 'host', remote: 'view', max: 1, idMin: 0, idMax: 0, send: { hz: 10, key: 2 }, fields: { ...gameState } }),
];

export function createRoster({ player = {}, gameState = {} } = {}, { emit }) {
  const list = [], fields = { ...PLAYER_BASE, ...player }, game = {};
  for (const k in gameState) game[k] = zeroOf(gameState[k]);
  const get = n => { for (let i = 0; i < list.length; i++) if (list[i].number === n) return list[i]; return undefined; };
  const insert = p => { let i = 0; while (i < list.length && list[i].number < p.number) i++; list.splice(i, 0, p); return p; };
  const fresh = (number, seat, local) => { const p = { number, local }; for (const k in fields) p[k] = zeroOf(fields[k]); p.seat = seat; p.active = true; return p; };
  const info = p => ({ number: p.number, seat: p.seat, local: p.local });
  const joined = (p, rejoined) => emit('player.joined', { ...info(p), rejoined });
  return {
    list, game, get,
    add(n, { seat = 0, local = false, join = 0, quiet = false } = {}) {
      if (!Number.isInteger(n) || n < 1 || n > 255) throw new Error(`players: number must be an integer in 1..255 (got ${n})`);
      if (get(n)) throw new Error(`players: player ${n} is already in the roster`);
      const p = insert(fresh(n, seat, local)); p.join = join;
      if (!quiet) joined(p, false);
      return p;
    },
    remove(n, why = 'left') {
      const p = get(n); if (!p) return;
      list.splice(list.indexOf(p), 1);
      emit(why === 'expired' ? 'player.expired' : 'player.left', info(p));
    },
    away(n, on) { const p = get(n); if (!p || p.away === on) return; p.away = on; emit(on ? 'player.away' : 'player.back', info(p)); },
    activate(n, on) { // [N-23] inactive while its peer is gone; active again on a rejoin (away cleared)
      const p = get(n); if (!p || p.active === on) return;
      p.active = on; if (on) { p.away = false; joined(p, true); } else emit('player.inactive', info(p));
    },
    apply(n, rec, local) { // a guest: the host's lh.player record, with events for what changed
      let p = get(n); const was = p ? { away: p.away, active: p.active } : null;
      if (!p) p = insert(fresh(n, rec.seat, local));
      for (const k in fields) p[k] = rec[k];
      p.local = local;
      if (!was) { if (p.active) { joined(p, false); if (p.away) emit('player.away', info(p)); } else emit('player.inactive', info(p)); return p; }
      if (was.active !== p.active) { if (p.active) joined(p, true); else emit('player.inactive', info(p)); }
      else if (was.away !== p.away) emit(p.away ? 'player.away' : 'player.back', info(p));
      return p;
    },
    applyGame(rec) { for (const k in game) if (k in rec) game[k] = rec[k]; },
    relocal(has) { for (let i = 0; i < list.length; i++) list[i].local = has(list[i].number); },
    renumber(from, to) { // the host's seat 0 must be 1 (Task 6); silent, the net part emits player.renumbered
      const p = get(from); if (!p) return;
      if (get(to)) throw new Error(`players: player ${to} is already in the roster`);
      list.splice(list.indexOf(p), 1); p.number = to; insert(p);
    },
    clear() { list.length = 0; },
  };
}
