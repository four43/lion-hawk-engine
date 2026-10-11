import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, policy } from '../testing/index.js';
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
