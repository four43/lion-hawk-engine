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
test('2d fix: nothing stays held after replay; later input applies as on the original handle', () => {
  const h = headless(game, { record: true }); h.tap('title.play'); h.step(240, { throttle: 1 });
  const r = replay(game, JSON.parse(JSON.stringify(h.tape())));
  h.step(30, { throttle: -1 }); r.step(30, { throttle: -1 });
  assert.equal(r.checksum(), h.checksum()); assert.deepEqual(r.state(), h.state());
});
test('2d fix: recorded command data is delivered as logged, so mutating it after issue replays the same', () => {
  const h = headless(game, { scene: 'race', record: true }), scratch = { dx: 1 };
  h.command('nudge', scratch); scratch.dx = 100; h.step(60);
  assert.equal(h.state().x, 1);
  assert.equal(replay(game, JSON.parse(JSON.stringify(h.tape()))).checksum(), h.checksum());
});
test('2d fix: recorded payloads must be plain JSON; checked at issue', () => {
  const h = headless(game, { scene: 'race', record: true }), cyc = {}; cyc.self = cyc;
  for (const bad of [{ dx: NaN }, cyc, { f: () => 1 }, { d: new Date(0) }, { u: undefined }])
    assert.throws(() => h.command('nudge', bad), /engine: command data must be plain JSON/);
  assert.throws(() => h.go('title', { n: Infinity }), /must be plain JSON/);
  assert.throws(() => h.jump('race', 'running', { x: NaN }), /must be plain JSON/);
  assert.equal(h.engine.commands.pending, 0);
  const plain = headless(game, { scene: 'race' }), obj = { dx: 1 }; // 2f #72: not recording is a copy too
  plain.command('nudge', obj); obj.dx = 2; plain.step(1); assert.equal(plain.state().x, 1);
});
test('2d fix: replay rejects a tape recorded at another hz', () => {
  const h = headless(game, { record: true }); h.step(1);
  assert.throws(() => replay(game, { ...h.tape(), hz: 30 }), /replay: tape hz differs/);
});

import { defineGame, actions, button } from '../src/index.sim.js';
const hg = defineGame({ id: 'hold', start: 's', actions: actions({ gear: button() }), scenes: { s: {
  enter(e, ctx) { ctx.state.fired = 0; ctx.state.on = true; },
  ui(u) {
    u.hold({ id: 'wake', label: 'Wake up', seconds: 0.5, action: e => e.scene.state.fired++, when: e => e.scene.state.on });
    u.hold({ id: 'gear', label: 'Gear', seconds: 0.25, action: 'gear' });
  },
} } });
test('2d: hold presses are recorded and replayed', () => {
  const h = headless(hg, { record: true }); h.press('s.wake').step(40); h.unpress('s.wake'); h.step(20);
  assert.equal(h.scene.state.fired, 1); assert.equal(replay(hg, h.tape()).scene.state.fired, 1);
  assert.deepEqual(h.tape().log[0].ops, [['press', 's.wake']]);
});

test('2f: a tape keeps wall0 and the replay starts from it', () => {
  const g = defineGame({ id: 'w0', start: 's', scenes: { s: { step(e, dt, c) { c.state.t = e.time.wall; } } }, state: e => ({ t: e.scene.state.t ?? 0 }) });
  const h = headless(g, { record: true, wall0: 5000 }); h.step(120);
  const tape = h.tape(); assert.equal(tape.wall0, 5000);
  assert.equal(replay(g, tape).state().t, h.state().t);
});
