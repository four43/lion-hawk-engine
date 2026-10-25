// [T-4] expectEvents(h, since): assertions over a handle's event log that name what was seen when they fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless, expectEvents } from '../testing/index.js';
import game from './fixtures/countdown.js';

test('expectEvents: toInclude finds an event by type and partial match, and returns it (T-4)', () => {
  const h = headless(game, { scene: 'race' }), mark = h.mark();
  h.untilEvent('go', { maxSeconds: 4 });
  const e = expectEvents(h, mark).toInclude('count', { n: 1 });
  assert.equal(e.type, 'count'); assert.equal(e.n, 1);
  assert.equal(expectEvents(h).toInclude('count', x => x.n === 2).n, 2, 'since defaults to 0; match may be a predicate');
  assert.equal(expectEvents(h).toInclude('go').type, 'go');
});
test('expectEvents: toInclude fails with the events seen since the mark', () => {
  const h = headless(game, { scene: 'race' });
  h.untilEvent('go', { maxSeconds: 4 });
  assert.throws(() => expectEvents(h).toInclude('finish'),
    e => e instanceof assert.AssertionError && /expected an event 'finish'/.test(e.message) && /count \{"n":2\}/.test(e.message));
  assert.throws(() => expectEvents(h).toInclude('count', { n: 9 }), /expected an event 'count' matching \{"n":9\}/);
  const late = h.mark();
  assert.throws(() => expectEvents(h, late).toInclude('go'), /\(none\)/, 'nothing since the mark');
});
test('expectEvents: toBeSequence wants the entries in order, other events in between allowed', () => {
  const h = headless(game, { scene: 'race' });
  h.untilEvent('go', { maxSeconds: 4 });
  expectEvents(h).toBeSequence(['count', 'count', 'go']);
  expectEvents(h).toBeSequence([['count', { n: 2 }], 'go']);
  assert.throws(() => expectEvents(h).toBeSequence(['go', 'count']), /sequence broke at entry 1 \('count'\)/);
  assert.throws(() => expectEvents(h).toBeSequence('go'), /toBeSequence takes an array/);
});
