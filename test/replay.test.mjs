import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, replay, policy } from '../testing/index.js';
import game from './fixtures/countdown.js';

test('2d: a recorded run replays to the same checksums (T-9)', () => {
  const h = headless(game, { seed: 9, record: true });
  h.tap('title.play'); h.step(200);
  h.command('nudge', { dx: 2 }); h.step(30, { throttle: 0.5 });
  h.step(1, { pause: true }); h.tap('pause.resume'); h.step(40, policy.const({ throttle: 1 }));
  const tape = h.tape(), sum = h.checksum();
  assert.equal(tape.v, 1); assert.equal(tape.seed, 9); assert.equal(tape.end, h.time.step); assert.ok(tape.sums.length >= 4);
  assert.deepEqual(tape.log[0].ops, [['tap', 'title.play']]); // the tap's go() is not recorded twice
  const r = replay(game, JSON.parse(JSON.stringify(tape)));
  assert.equal(r.checksum(), sum); assert.equal(r.time.step, tape.end);
});
test('2d: replay names the first checkpoint that differs', () => {
  const h = headless(game, { record: true }); h.tap('title.play'); h.step(240, { throttle: 1 });
  const tape = JSON.parse(JSON.stringify(h.tape()));
  for (const x of tape.log) if (x.input) delete x.input.throttle; // keep the tap logged at the same step
  assert.throws(() => replay(game, tape), /replay: checksum differs at step 240/);
  assert.throws(() => replay(game, { ...tape, v: 2 }), /replay: unknown tape version/);
});
test('2d: commands issued by the sim are not recorded', () => {
  const h = headless(game, { scene: 'race', record: true });
  h.engine.system('auto', e => { if (e.time.step === 5) e.command('nudge', { dx: 1 }); });
  h.step(10); assert.equal(h.tape().log.some(x => x.ops?.some(o => o[0] === 'command')), false);
  assert.throws(() => headless(game).tape(), /headless: not recording/);
});
