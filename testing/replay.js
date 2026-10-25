// [T-9] Replay a recorded tape headless (the loop is src/core/tape.js): a fresh handle from the tape's start, each step
// taken through the handle so its invariants and checkpoints run.
import { headless } from './headless.js';
import { checkTape, tapeStart, replayTape } from '../src/core/tape.js';

export { checkTape, tapeStart };

export function replay(game, tape, { invariants, record = false } = {}) {
  checkTape(game, tape);
  return drive(headless(game, { ...tapeStart(tape), invariants, record }), tape);
}

// re-feeds a checked tape into a fresh handle (replay, and T-7's restore and fork)
export function drive(h, tape) { replayTape(h.engine, tape, { step: () => h.step(1) }); return h; }
