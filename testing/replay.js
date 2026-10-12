// [T-9] Replay a recorded tape headless: the same seed and start, the external ops and input changes re-fed at the
// steps they preceded, and every recorded checkpoint compared, so the first divergence is named.
import { headless } from './headless.js';

export function replay(game, tape, { invariants } = {}) {
  if (tape?.v !== 1) throw new Error('replay: unknown tape version');
  if (tape.game !== game.id) throw new Error(`replay: tape is for '${tape.game}'`);
  if (tape.hz !== game.sim.hz) throw new Error(`replay: tape hz differs (tape ${tape.hz}, game ${game.sim.hz})`);
  const h = headless(game, { seed: tape.seed, scene: tape.scene, args: tape.args, invariants }), e = h.engine;
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
  const apply = k => { const x = at.get(k); if (!x) return; for (const o of x.ops ?? []) op(o); if (x.input) Object.assign(vals, x.input); };
  for (let k = 0; k < end; k++) {
    apply(k); e.input.set(vals); h.step(1);
    const want = sums.get(k + 1);
    if (want !== undefined) { const got = h.checksum(); if (got !== want) throw new Error(`replay: checksum differs at step ${k + 1} (tape ${want}, replay ${got})`); }
  }
  apply(end);
  return h;
}
