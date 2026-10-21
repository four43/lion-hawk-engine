// [T-9] Replay a recorded tape headless: the same seed and start, the external ops and input changes re-fed at the
// steps they preceded, and every recorded checkpoint compared, so the first divergence is named.
import { headless } from './headless.js';

export function replay(game, tape, { invariants } = {}) {
  if (tape?.v !== 1) throw new Error('replay: unknown tape version');
  if (tape.game !== game.id) throw new Error(`replay: tape is for '${tape.game}'`);
  if (tape.hz !== game.sim.hz) throw new Error(`replay: tape hz differs (tape ${tape.hz}, game ${game.sim.hz})`);
  const h = headless(game, { seed: tape.seed, scene: tape.scene, args: tape.args, invariants, wall0: tape.wall0 ?? 0 }), e = h.engine;
  const at = new Map(tape.log.map(x => [x.step, x])), sums = new Map(tape.sums ?? []);
  const end = tape.end ?? (tape.log.length ? tape.log[tape.log.length - 1].step : 0);
  const und = x => x ?? undefined; // the tape stores a missing args/opts as null
  const op = o => {
    switch (o[0]) {
      case 'tap': return h.tap(o[1]);
      case 'fill': return h.fill(o[1], o[2]);
      case 'press': case 'release': {
        const f = e.ui[o[0]]; if (typeof f !== 'function') throw new Error(`replay: this engine has no ui.${o[0]}`);
        return f(o[1]);
      }
      case 'command': return e.command(o[1], JSON.parse(JSON.stringify(o[2]))); // as recorded (even when it was dropped); the tape stays untouched
      case 'go': return h.go(o[1], und(o[2]));
      case 'overlay': return h.overlay(o[1], und(o[2]));
      case 'close': return h.close(o[1]);
      case 'jump': return h.jump(o[1], o[2], und(o[3]), und(o[4]));
      default: throw new Error(`replay: unknown op '${o[0]}'`);
    }
  };
  // the recorded snapshot values so far, set (not held) before every replayed step, so nothing stays held afterwards
  const vals = {};
  const seen = new Set(); // seats that have had a controller during this replay (a seat that left is skipped)
  const seatVals = new Map(); // seat -> recorded values so far (seat 0 is vals)
  const apply = k => {
    const x = at.get(k); if (!x) return;
    for (const o of x.ops ?? []) op(o);
    if (x.input) Object.assign(vals, x.input);
    for (const s in x.seats ?? {}) Object.assign(seatVals.get(+s) ?? (seatVals.set(+s, {}), seatVals.get(+s)), x.seats[s]);
  };
  for (let k = 0; k < end; k++) {
    apply(k); e.input.set(vals);
    for (const [s, v] of seatVals) {
      const c = e.controllers.find(x => x.seat === s);
      if (c) seen.add(s);
      else if (seen.has(s)) continue;
      else throw new Error(`replay: seat ${s} has input but no controller at step ${k}`);
      c.input.set(v);
    }
    h.step(1);
    const want = sums.get(k + 1);
    if (want !== undefined) { const got = h.checksum(); if (got !== want) throw new Error(`replay: checksum differs at step ${k + 1} (tape ${want}, replay ${got})`); }
  }
  apply(end);
  return h;
}
