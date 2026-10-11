import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/core/loop.js';

const make = (o = {}) => { const calls = { steps: 0, renders: [] }; const loop = createLoop({ step: dt => { calls.steps++; calls.dt = dt; }, render: a => calls.renders.push(a), ...o }); return { loop, calls }; };

test('fixed dt; a frame runs whole steps and renders with the remainder as alpha', () => {
  const { loop, calls } = make();
  assert.equal(loop.frame(1 / 60 * 2.5), 2);
  assert.equal(calls.dt, 1 / 60);
  assert.ok(Math.abs(calls.renders[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(loop.alpha - 0.5) < 1e-9);
});
test('catch-up is capped; the excess is dropped and counted as a clamped frame (R-2)', () => {
  const { loop, calls } = make();
  assert.equal(loop.frame(0.2), 3);
  assert.equal(loop.stats.clamped, 1);
  assert.ok(loop.alpha < 1);
  assert.equal(calls.steps, 3);
});
test('frame time is clamped to maxFrame and negative time is ignored (R-1)', () => {
  const { loop } = make({ maxCatchUp: 1000 });
  assert.equal(loop.frame(10), 15);
  assert.equal(loop.frame(-1), 0);
});
test('rally rate: 240 Hz, 12 catch-up', () => {
  const { loop } = make({ hz: 240, maxCatchUp: 12 });
  assert.equal(loop.frame(1 / 60), 4);
});
test('stepN runs exactly n steps without rendering; advance runs whole seconds exactly (R-7)', () => {
  const { loop, calls } = make();
  loop.stepN(5); assert.equal(calls.steps, 5); assert.equal(calls.renders.length, 0);
  assert.equal(loop.advance(1), 60); assert.equal(loop.advance(1 / 120), 0); assert.equal(loop.advance(1 / 120), 1);
  assert.equal(loop.stats.steps, 66);
});
test('reset clears the accumulator', () => {
  const { loop } = make();
  loop.frame(1 / 120); loop.reset(); assert.equal(loop.alpha, 0);
});
