import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedule, STEP_STAGES } from '../src/core/schedule.js';

test('STEP_STAGES is the R-6 order', () => {
  assert.deepEqual(STEP_STAGES, ['input.apply', 'pre', 'physics.world', 'post', 'events.flush']);
  assert.ok(Object.isFrozen(STEP_STAGES));
});
test('after keeps unrelated systems in insertion order', () => {
  const s = createSchedule(['pre']);
  s.add('a', () => {}, { stage: 'pre' });
  s.add('b', () => {}, { stage: 'pre' });
  s.add('c', () => {}, { stage: 'pre', after: ['a'] });
  assert.deepEqual(s.order('pre'), ['a', 'b', 'c']);
});
test('transitive before-chain: a, b, c(before a), d(before c)', () => {
  const s = createSchedule(['pre']);
  s.add('a', () => {}, { stage: 'pre' });
  s.add('b', () => {}, { stage: 'pre' });
  s.add('c', () => {}, { stage: 'pre', before: ['a'] });
  s.add('d', () => {}, { stage: 'pre', before: ['c'] });
  assert.deepEqual(s.order('pre'), ['d', 'c', 'a', 'b']);
});
test('insertion order by default, before/after reorder within a stage', () => {
  const s = createSchedule(['pre', 'post']);
  s.add('a', () => {}, { stage: 'pre' });
  s.add('b', () => {}, { stage: 'pre' });
  s.add('c', () => {}, { stage: 'pre', before: ['a'] });
  s.add('d', () => {}, { stage: 'pre', after: ['b'] });
  s.add('z', () => {}, { stage: 'post' });
  assert.deepEqual(s.order('pre'), ['c', 'a', 'b', 'd']);
  assert.deepEqual(s.describe(), { pre: ['c', 'a', 'b', 'd'], post: ['z'] });
});
test('missing or cross-stage references are ignored', () => {
  const s = createSchedule(['pre', 'post']);
  s.add('x', () => {}, { stage: 'post' });
  s.add('a', () => {}, { stage: 'pre', after: ['herd', 'x'] });
  assert.deepEqual(s.order('pre'), ['a']);
});
test('run calls systems in order with the given args', () => {
  const s = createSchedule(['pre']), got = [];
  s.add('b', (e, dt) => got.push(['b', e, dt]), { stage: 'pre' });
  s.add('a', (e, dt) => got.push(['a', e, dt]), { stage: 'pre', before: ['b'] });
  s.run('pre', 'E', 0.5);
  assert.deepEqual(got, [['a', 'E', 0.5], ['b', 'E', 0.5]]);
});
test('remove (and the returned remover) take a system out', () => {
  const s = createSchedule(['pre']);
  const off = s.add('a', () => {}, { stage: 'pre' }); s.add('b', () => {}, { stage: 'pre' });
  off(); assert.deepEqual(s.order('pre'), ['b']);
  s.remove('b'); assert.deepEqual(s.order('pre'), []);
});
test('errors: unknown stage, duplicate, cycle', () => {
  const s = createSchedule(['pre']);
  assert.throws(() => s.add('a', () => {}, { stage: 'nope' }), /unknown stage 'nope' for 'a'/);
  s.add('a', () => {}, { stage: 'pre', after: ['b'] });
  assert.throws(() => s.add('a', () => {}, { stage: 'pre' }), /duplicate system 'a'/);
  s.add('b', () => {}, { stage: 'pre', after: ['a'] });
  assert.throws(() => s.order('pre'), /cycle in 'pre': a, b/);
});

test('run passes exactly two args to each system (R-8)', () => {
  const s = createSchedule(['a']); let n;
  s.add('x', function () { n = arguments.length; }, { stage: 'a' });
  s.run('a', 1, 2, 3); assert.equal(n, 2);
});
