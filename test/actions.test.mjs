import test from 'node:test';
import assert from 'node:assert/strict';
import { axis, button, actions, createInput } from '../src/core/actions.js';

const schema = actions({ steer: axis(), throttle: axis(), horn: button() });

test('schema validation', () => {
  assert.throws(() => actions({ x: 1 }), /'x' must be axis\(\) or button\(\)/);
  assert.ok(Object.isFrozen(schema));
});
test('initial snapshot: zero axes, idle buttons', () => {
  assert.deepEqual(createInput(schema).apply(), { steer: 0, throttle: 0, horn: { down: false, pressed: false, released: false } });
});
test('button edges: pressed on the first step down, released on the first step up', () => {
  const inp = createInput(schema);
  inp.device({ horn: true });
  assert.deepEqual(inp.apply().horn, { down: true, pressed: true, released: false });
  assert.deepEqual(inp.apply().horn, { down: true, pressed: false, released: false });
  inp.device({ horn: false });
  assert.deepEqual(inp.apply().horn, { down: false, pressed: false, released: true });
});
test('axes clamp to [-1, 1]; non-numbers read as 0', () => {
  const inp = createInput(schema);
  inp.device({ steer: 3, throttle: 'x' });
  const s = inp.apply(); assert.equal(s.steer, 1); assert.equal(s.throttle, 0);
});
test('precedence hold > set > device; set lasts one step; release clears holds (I-6)', () => {
  const inp = createInput(schema);
  inp.device({ throttle: 0.2 });
  inp.set({ throttle: 0.5 }); assert.equal(inp.apply().throttle, 0.5);
  assert.equal(inp.apply().throttle, 0.2);
  inp.hold({ throttle: 1 }); inp.set({ throttle: 0.5 }); assert.equal(inp.apply().throttle, 1);
  inp.release('throttle'); assert.equal(inp.apply().throttle, 0.2);
  inp.hold({ steer: -1, throttle: 1 }); inp.release(); assert.equal(inp.apply().steer, 0);
});
test('unknown names throw; values() is a plain copy', () => {
  const inp = createInput(schema);
  assert.throws(() => inp.set({ jump: true }), /unknown action 'jump'/);
  inp.device({ steer: -0.5, horn: true }); inp.apply();
  const v = inp.values(); assert.deepEqual(v, { steer: -0.5, throttle: 0, horn: true });
  v.steer = 9; assert.equal(inp.snapshot.steer, -0.5);
});
test('apply keeps returning the same snapshot object (no per-step allocation)', () => {
  const inp = createInput(schema); assert.equal(inp.apply(), inp.apply()); assert.equal(inp.apply(), inp.snapshot);
});
