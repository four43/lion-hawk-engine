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

test('device sources merge: largest |axis| wins, buttons OR, clearDevice drops a source', () => {
  const inp = createInput(schema);
  inp.device({ steer: 0, horn: false }, 'keyboard');
  inp.device({ steer: -0.6, horn: true }, 'touch');
  inp.device({ steer: 0.4 }, 'pad');
  let s = inp.apply(); assert.equal(s.steer, -0.6); assert.equal(s.horn.down, true);
  inp.device({ steer: 1 }, 'keyboard'); s = inp.apply(); assert.equal(s.steer, 1);
  inp.clearDevice('keyboard'); inp.clearDevice('touch'); s = inp.apply(); assert.equal(s.steer, 0.4); assert.equal(s.horn.down, false);
  inp.set({ steer: 0 }); assert.equal(inp.apply().steer, 0);
});

test('2c: a button set and cleared between two applies is latched for one step (#13)', () => {
  const inp = createInput(schema);
  inp.device({ horn: true }, 'keyboard'); inp.device({ horn: false }, 'keyboard');
  let s = inp.apply(); assert.equal(s.horn.pressed, true); assert.equal(s.horn.down, true);
  s = inp.apply(); assert.equal(s.horn.released, true); assert.equal(s.horn.down, false);
  inp.device({ horn: true }, 'pad'); inp.device({ horn: false }, 'pad'); inp.hold({ horn: false });
  assert.equal(inp.apply().horn.down, false); // hold wins over the latch
  inp.release(); inp.device({ horn: true }, 'pad'); inp.device({ horn: false }, 'pad'); inp.set({ horn: false });
  assert.equal(inp.apply().horn.down, false); // so does set
});

const seq = inp => { const b = inp.apply().horn; return [b.down, b.pressed, b.released]; };
test('2d: two taps between applies give pressed, released, pressed (#41)', () => {
  const inp = createInput(schema);
  for (const v of [true, false, true, false]) inp.device({ horn: v }, 'keyboard');
  assert.deepEqual(seq(inp), [true, true, false]); assert.deepEqual(seq(inp), [false, false, true]);
  assert.deepEqual(seq(inp), [true, true, false]); assert.deepEqual(seq(inp), [false, false, true]);
  assert.deepEqual(seq(inp), [false, false, false]);
});
test('2d: a release and re-press while held shows released, then pressed', () => {
  const inp = createInput(schema); inp.device({ horn: true }, 'k'); inp.apply();
  inp.device({ horn: false }, 'k'); inp.device({ horn: true }, 'k');
  assert.deepEqual(seq(inp), [false, false, true]); assert.deepEqual(seq(inp), [true, true, false]); assert.deepEqual(seq(inp), [true, false, false]);
});
test('2d: clearDevice drops that source\'s unapplied taps; hold still wins (E1 minors)', () => {
  const inp = createInput(schema); inp.device({ horn: true }, 'pad'); inp.device({ horn: false }, 'pad'); inp.clearDevice('pad');
  assert.deepEqual(seq(inp), [false, false, false]);
  inp.device({ horn: true }, 'k'); inp.device({ horn: false }, 'k'); inp.device({ horn: true }, 'k'); inp.hold({ horn: false });
  assert.deepEqual(seq(inp), [false, false, false]); inp.release(); inp.device({ horn: false }, 'k');
  assert.deepEqual(seq(inp), [false, false, false]); // the hold consumed the owed presses
});
test('final review: a second source pressing a held button adds no edge; only the last release shows', () => {
  const inp = createInput(schema); inp.device({ horn: true }, 'keyboard');
  assert.deepEqual(seq(inp), [true, true, false]);
  inp.device({ horn: true }, 'pad');
  assert.deepEqual(seq(inp), [true, false, false]); // no forced release + re-press (no double gear shift / horn)
  assert.deepEqual(seq(inp), [true, false, false]);
  inp.device({ horn: false }, 'pad');
  assert.deepEqual(seq(inp), [true, false, false]); // keyboard still holds
  inp.device({ horn: false }, 'keyboard');
  assert.deepEqual(seq(inp), [false, false, true]);
  assert.deepEqual(seq(inp), [false, false, false]);
});
test('final review: clearing a button\'s last contributing source drops its owed taps', () => {
  const inp = createInput(schema);
  for (const v of [true, false, true, false, true, false]) inp.device({ horn: v }, 'pad');
  assert.deepEqual(seq(inp), [true, true, false]); // two more taps owed
  inp.clearDevice('pad');
  assert.deepEqual(seq(inp), [false, false, true]);
  assert.deepEqual(seq(inp), [false, false, false]);
  assert.deepEqual(seq(inp), [false, false, false]);
  // owed taps survive when another source still holds a contribution
  for (const v of [true, false, true, false]) inp.device({ horn: v }, 'pad');
  inp.device({ horn: true }, 'k');
  assert.deepEqual(seq(inp), [true, true, false]);
  inp.clearDevice('k');
  assert.deepEqual(seq(inp), [false, false, true]); assert.deepEqual(seq(inp), [true, true, false]);
});

test('2f: a paired axis merges per source by vector length, not per axis (#8)', () => {
  const inp = createInput(actions({ gx: axis({ pair: 'gz' }), gz: axis(), other: axis() }));
  inp.device({ gx: 0.9, gz: 0 }, 'keys'); inp.device({ gx: 0.5, gz: 0.8 }, 'stick'); // 0.9 < 0.943
  let s = inp.apply(); assert.deepEqual([s.gx, s.gz], [0.5, 0.8]);
  inp.device({ gx: 1, gz: 0.5 }, 'keys'); s = inp.apply(); assert.deepEqual([s.gx, s.gz], [1, 0.5]); // both from keys now
  inp.set({ gz: -1 }); s = inp.apply(); assert.deepEqual([s.gx, s.gz], [1, -1]); // set still overrides one axis
  assert.throws(() => actions({ a: axis({ pair: 'b' }) }), /actions: 'a' pairs with unknown action 'b'/);
  assert.throws(() => actions({ a: axis({ pair: 'b' }), b: button() }), /actions: 'a' pairs with 'b', which must be an axis/);
  assert.throws(() => actions({ a: axis({ pair: 'b' }), b: axis({ pair: 'a' }) }), /actions: declare the pair 'a'\/'b' once/);
});
test('2f: pairs: a tie goes to the first source, an axis is in one pair, and an unpaired axis keeps the per-axis merge (#8)', () => {
  const inp = createInput(actions({ gx: axis({ pair: 'gz' }), gz: axis(), other: axis() }));
  inp.device({ gx: 0, gz: 1, other: 0.2 }, 'a'); inp.device({ gx: 1, gz: 0, other: -0.7 }, 'b');
  const s = inp.apply(); assert.deepEqual([s.gx, s.gz, s.other], [0, 1, -0.7]);
  assert.throws(() => actions({ a: axis({ pair: 'c' }), b: axis({ pair: 'c' }), c: axis() }), /actions: 'c' is in two pairs/);
  assert.throws(() => actions({ a: axis({ pair: 'a' }) }), /must be an axis/);
  assert.deepEqual(axis(), { kind: 'axis' });
});
