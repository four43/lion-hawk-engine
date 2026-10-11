import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, policy } from '../testing/index.js';
import { defineGame } from '../src/index.sim.js';
import game from './fixtures/countdown.js';

test('a whole flow headless: title → race → countdown → drive → results → retry (T-1…T-5)', () => {
  const h = headless(game, { seed: 3 });
  h.tap('title.play');
  h.untilEvent('go', { maxSeconds: 4 });
  const { steps } = h.until(x => x.scene.overlays.includes('results'), { maxSeconds: 6, input: 'floor' });
  assert.ok(steps > 290 && steps < 310, `${steps}`);
  assert.equal(h.since(0).count('finish'), 1);
  h.tap('results.retry'); assert.equal(h.scene.name, 'race');
});
test('until failure explains itself', () => {
  const h = headless(game, { seed: 4, scene: 'race' });
  assert.throws(() => h.until(() => false, { maxSteps: 70, message: 'never' }),
    e => /never after 70 steps/.test(e.message) && /seed 4/.test(e.message) && /scene race/.test(e.message) && /@59 count \{"n":2\}/.test(e.message));
});
test('policies: const, seq, named; invariants run every step', () => {
  let checks = 0;
  const h = headless(game, { scene: 'race', invariants: [() => { checks++; }] });
  h.jump('race', 'running');
  h.step(60, policy.const({ throttle: 0.5 })); assert.ok(Math.abs(h.scene.state.x - 5) < 1e-9);
  h.step(120, policy.seq([[60, { throttle: 1 }], [60, { throttle: 0 }]])); assert.ok(Math.abs(h.scene.state.x - 15) < 1e-9);
  h.seconds(1, 'floor'); assert.ok(Math.abs(h.scene.state.x - 25) < 1e-9);
  assert.equal(checks, 240);
  assert.throws(() => h.step(1, 'moon'), /no policy 'moon'/);
});
test('event lists: mark/since/of/first/types', () => {
  const h = headless(game, { scene: 'race' });
  const m = h.mark(); h.seconds(3);
  const ev = h.since(m);
  assert.deepEqual(ev.types(), ['count', 'count', 'count', 'go']);
  assert.deepEqual(ev.of('count').map(e => e.n), [2, 1, 0]);
  assert.equal(ev.first(e => e.n === 1).step, 119);
  assert.equal(ev.count('go'), 1);
});
test('hold/release and same-seed checksums', () => {
  const a = headless(game, { seed: 7, scene: 'race' }), b = headless(game, { seed: 7, scene: 'race' });
  for (const h of [a, b]) { h.jump('race', 'running'); h.hold({ throttle: 1 }); h.seconds(2); h.release(); h.seconds(1); }
  assert.equal(a.checksum(), b.checksum());
  assert.ok(Math.abs(a.scene.state.x - 20) < 1e-9);
});
test('named policies ignore the prototype chain; jump passes args', () => {
  let got;
  const g = defineGame({ id: 'p', start: 'a', scenes: { a: {}, b: { enter(e, c) { got = c.args; }, presets: { p() {} } } } });
  const h = headless(g);
  assert.throws(() => h.step(1, 'constructor'), /no policy 'constructor'/);
  h.jump('b', 'p', undefined, { z: 1 }); assert.deepEqual(got, { z: 1 });
});

test('F5: the handle keeps an unbounded event log (h.events, since, until, untilEvent)', () => {
  const g = defineGame({ id: 'chatty', start: 'a', scenes: { a: { enter(e) { e.emit('first'); } } } });
  const h = headless(g);
  h.engine.system('chat', e => e.emit('tick'));
  h.step(400);
  const all = h.since(0);
  assert.equal(all.length, 401); assert.equal(all.count('tick'), 400); assert.equal(all.of('first').length, 1);
  assert.equal(h.events.length, 401); assert.equal(h.events.first('first').type, 'first'); assert.deepEqual(h.events.types().slice(0, 2), ['first', 'tick']);
  assert.equal(h.events.since(h.events[399].seq).length, 1);
  assert.equal(h.untilEvent('tick', { maxSteps: 3 }).type, 'tick'); assert.throws(() => h.untilEvent('nope', { maxSteps: 2 }), /last events:\n(.*\n)*.*@\d+ tick/);
  const m = h.mark(), t0 = h.time.step; const { events } = h.until(() => h.time.step >= t0 + 10); assert.equal(events.count('tick'), 10);
  const r = h.until(() => h.time.step >= t0 + 15); assert.equal(r.events.count('tick'), 5);
  assert.ok(m >= 401); assert.equal(h.since(0).first('first').type, 'first');
});
