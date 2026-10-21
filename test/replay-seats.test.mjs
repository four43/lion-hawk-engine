// [T-23]: tapes record input per seat; a tape without seats replays as seat 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, axis, button, defineGame, createEngine } from '../src/index.sim.js';
import { replay } from '../testing/replay.js';

const schema = actions({ steer: axis(), horn: button() });
const trace = [];
const game = defineGame({ id: 'seats-tape', start: 'field', actions: schema, scenes: { field: {} },
  setup(e) { e.system('trace', en => { if (en.controllers[1]) trace.push([en.time.step, en.controllers[1].input.snapshot.steer]); }, { stage: 'input.apply', after: ['lh.possess'] }); } });

test('seat 1 input is recorded under seats and replays the same (T-23)', () => {
  const e = createEngine(game, { record: true });
  e.command('lh.seat', { op: 'join', seat: 1 }); e.stepN(1);
  e.controllers[1].input.set({ steer: 0.5 }); e.stepN(1);
  e.controllers[1].input.set({ steer: -1 }); e.input.set({ horn: true }); e.stepN(1);
  e.stepN(1);
  const tape = e.tape();
  assert.ok(tape.log.some(x => x.seats?.[1]?.steer === 0.5));
  assert.ok(tape.log.some(x => x.input?.horn === true), 'seat 0 stays in input');
  // set() is one step only, so seat 1 reads 0.5, then -1, then 0 again; the replay must read the same
  trace.length = 0; replay(game, tape);
  assert.deepEqual(trace.filter(t => t[1] !== 0).map(t => t[1]), [0.5, -1]);
});

test('an old tape without seats replays as seat 0 (review focus)', () => {
  const old = { v: 1, game: 'seats-tape', seed: 1, scene: 'field', args: undefined, hz: 60, wall0: 0, log: [{ step: 0, input: { steer: 1 } }, { step: 2, input: { steer: 0 } }] };
  assert.doesNotThrow(() => replay(game, old));
});

test('a tape with seat input but no seat join throws a readable error', () => {
  const bad = { v: 1, game: 'seats-tape', seed: 1, scene: 'field', args: undefined, hz: 60, wall0: 0, end: 1, log: [{ step: 0, seats: { 2: { steer: 1 } } }] };
  assert.throws(() => replay(game, bad), /replay: seat 2 has input but no controller at step 0/);
});
