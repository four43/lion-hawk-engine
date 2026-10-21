// [C-1]–[C-4], [I-4]: controllers, possession, the per-step copy, bots and seats (plan 2026-10-21-local-players-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, axis, button, createInput } from '../src/core/actions.js';
import { createControllers } from '../src/core/controllers.js';

const schema = actions({ steer: axis(), throttle: axis(), horn: button() });
const fakeWorld = () => {
  const byId = new Map(); let next = 1;
  return { get: id => byId.get(id), spawn: (d = {}) => { const e = { id: next++, ...d }; byId.set(e.id, e); return e; }, despawn: e => byId.delete(e.id) };
};
const setup = () => {
  const ev = [], w = { current: fakeWorld() };
  const cs = createControllers(schema, { emit: (type, data) => ev.push({ type, ...data }), world: () => w.current });
  return { cs, ev, w };
};

test('seat 0 exists from the start as player 1 and can wrap an existing input (C-1)', () => {
  const input = createInput(schema);
  const cs = createControllers(schema, { input, emit() {}, world: () => undefined });
  assert.equal(cs.list.length, 1);
  const c = cs.list[0];
  assert.equal(c.seat, 0); assert.equal(c.player, 1); assert.equal(c.bot, false); assert.equal(c.pawn, null);
  assert.equal(c.input, input, 'seat 0 uses the input it was given');
});

test('possess copies the snapshot into e.input every step; buttons keep the snapshot shape (C-2, C-3)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], car = w.current.spawn({ tags: ['car'] });
  c.possess(car);
  assert.equal(c.pawn, car);
  assert.deepEqual(ev.at(-1), { type: 'controller.possess', controller: 1, seat: 0, player: 1, pawn: car.id });
  c.input.set({ steer: 0.5, horn: true }); cs.applyInputs(); cs.copy();
  assert.equal(car.input, c.input.snapshot, 'a pawn without its own input object gets the snapshot itself');
  assert.equal(car.input.steer, 0.5); assert.equal(car.input.horn.pressed, true);
});

test('a pawn with a net-made input object keeps its shape: only its keys, buttons as down (C-3, review focus)', () => {
  const { cs, w } = setup(), c = cs.list[0];
  const train = w.current.spawn({ net: 'train', input: { steer: 0, horn: false } }); // what install.js zeroActions makes
  c.possess(train);
  c.input.set({ steer: -1, throttle: 1, horn: true }); cs.applyInputs(); cs.copy();
  assert.deepEqual(train.input, { steer: -1, horn: true }, 'throttle is not in the kind, so it is not added');
});

test('one controller per pawn: possessing a held pawn takes it (C-2)', () => {
  const { cs, ev, w } = setup(), a = cs.list[0], bot = cs.make({ bot: true }), car = w.current.spawn({});
  a.possess(car); bot.possess(car);
  assert.equal(a.pawn, null); assert.equal(bot.pawn, car);
  assert.deepEqual(ev.slice(-2).map(e => [e.type, e.seat, e.reason]), [['controller.unpossess', 0, 'taken'], ['controller.possess', null, undefined]]);
});

test('possessing a new pawn releases the old one; unpossess clears it (C-2)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], a = w.current.spawn({}), b = w.current.spawn({});
  c.possess(a); c.possess(b);
  assert.equal(c.pawn, b);
  assert.deepEqual(ev.slice(-2).map(e => [e.type, e.pawn]), [['controller.unpossess', a.id], ['controller.possess', b.id]]);
  c.unpossess(); assert.equal(c.pawn, null); assert.equal(ev.at(-1).reason, 'unpossess');
  c.unpossess(); assert.equal(ev.at(-1).reason, 'unpossess', 'a second unpossess is a no-op (no new event)');
  assert.equal(ev.filter(e => e.type === 'controller.unpossess').length, 2);
});

test('a despawned pawn or a swapped World drops the pawn on the next copy (review focus)', () => {
  const { cs, ev, w } = setup(), c = cs.list[0], car = w.current.spawn({});
  c.possess(car); w.current.despawn(car); cs.copy();
  assert.equal(c.pawn, null); assert.equal(ev.at(-1).reason, 'despawned');
  const car2 = w.current.spawn({}); c.possess(car2); w.current = fakeWorld(); cs.copy();
  assert.equal(c.pawn, null, 'a scene change gave a new World');
});

test('possess rejects non-entities and replicas another peer simulates (review focus)', () => {
  const { cs, w } = setup(), c = cs.list[0];
  assert.throws(() => c.possess(null), /controller.possess: needs an entity/);
  assert.throws(() => c.possess({ id: 'x' }), /controller.possess: needs an entity/);
  const remote = w.current.spawn({ net: 'train' });
  w.current.net = { remoteOf: e => (e === remote ? {} : undefined) };
  assert.throws(() => c.possess(remote), /controller.possess: entity \d+ is simulated by another peer/);
});

test('bots have no seat or player and are driven by set/hold; dispose removes them (C-4)', () => {
  const { cs, ev, w } = setup(), bot = cs.make({ bot: true }), car = w.current.spawn({});
  assert.equal(bot.seat, null); assert.equal(bot.player, 0); assert.equal(bot.bot, true);
  assert.equal(cs.list.length, 2);
  bot.possess(car); bot.input.hold({ throttle: 1 }); cs.applyInputs(); cs.copy();
  assert.equal(car.input.throttle, 1);
  bot.dispose();
  assert.equal(cs.list.length, 1); assert.equal(car.input, undefined, 'a released pawn no longer points at the old controller\'s input');
  assert.equal(ev.at(-1).reason, 'left');
});

test('handoff: a pawn taken by another controller does not corrupt the old snapshot', () => {
  const { cs, w } = setup(), c = cs.list[0], bot = cs.make({ bot: true }), car = w.current.spawn({});
  c.possess(car); cs.copy();
  assert.equal(car.input, c.input.snapshot);
  bot.possess(car); bot.input.hold({ throttle: 1 }); cs.applyInputs(); cs.copy();
  assert.equal(car.input, bot.input.snapshot);
  assert.equal(car.input.throttle, 1);
  assert.equal(typeof cs.list[0].input.snapshot.horn, 'object');
});

test('gate applies to every controller (U-9 for all seats)', () => {
  const { cs } = setup(), b = cs.make({ bot: true });
  cs.gate(true);
  assert.equal(cs.list[0].input.gated, true); assert.equal(b.input.gated, true);
  const late = cs.make({ bot: true }); assert.equal(late.input.gated, true, 'a controller made while gated starts gated');
  cs.gate(false); assert.equal(late.input.gated, false);
});

test('seats: join takes the lowest free player number, keeps seat order; leave frees it (C-1, C-5 sim side)', () => {
  const { cs, ev } = setup();
  cs.seat('join', 2); cs.seat('join', 1);
  assert.deepEqual(cs.list.map(c => [c.seat, c.player]), [[0, 1], [1, 3], [2, 2]]);
  assert.deepEqual(ev.filter(e => e.type === 'controller.joined').map(e => [e.seat, e.player]), [[2, 2], [1, 3]]);
  cs.seat('join', 1); assert.equal(cs.list.length, 3, 'joining an open seat is a no-op');
  cs.seat('leave', 2); assert.deepEqual(cs.list.map(c => c.seat), [0, 1]);
  cs.seat('join', 3); assert.equal(cs.list.find(c => c.seat === 3).player, 2, 'number 2 was freed');
  cs.seat('leave', 0); assert.equal(cs.list[0].seat, 0, 'seat 0 never leaves');
  for (const bad of [-1, 1.5, 16, '1']) assert.throws(() => cs.seat('join', bad), /lh.seat: seat must be an integer in 0..15/);
  assert.throws(() => cs.seat('swap', 1), /lh.seat: op must be 'join' or 'leave'/);
});

// ---- engine-level (Task 2) ----
import { defineGame, createEngine } from '../src/index.sim.js';

const game = defineGame({ id: 'ctl', start: 'field', actions: schema, scenes: { field: {}, other: {} } });

test('engine.input is seat 0; lh.possess fills e.input during input.apply (C-1, I-4)', () => {
  const e = createEngine(game);
  assert.equal(e.controllers.length, 1); assert.equal(e.input, e.controllers[0].input);
  const car = e.world.spawn({ tags: ['car'] }); e.controllers[0].possess(car);
  let seen;
  e.system('reader', en => { seen = en.world.get(car.id).input?.steer; }, { stage: 'input.apply', after: ['lh.possess'] });
  e.input.set({ steer: 0.25 }); e.stepN(1);
  assert.equal(seen, 0.25, 'a game system after lh.possess reads this step\'s input');
});

test('lh.seat joins and leaves seats through a command; events reach listeners (C-5 sim side)', () => {
  const e = createEngine(game), got = [];
  e.events.on(ev => { if (ev.type.startsWith('controller.')) got.push([ev.type, ev.seat, ev.player]); });
  e.command('lh.seat', { op: 'join', seat: 1 }); e.stepN(1);
  assert.deepEqual(e.controllers.map(c => c.seat), [0, 1]);
  e.command('lh.seat', { op: 'leave', seat: 1 }); e.stepN(1);
  assert.deepEqual(got, [['controller.joined', 1, 2], ['controller.left', 1, 2]]);
});

test('a scene change drops pawns from the old World (review focus)', () => {
  const e = createEngine(game), c = e.controllers[0];
  c.possess(e.world.spawn({})); e.go('other'); e.stepN(1);
  assert.equal(c.pawn, null);
});

test('a pausing menu gates every controller, not only seat 0 (U-9)', () => {
  const g = defineGame({ id: 'ctl-menu', start: 'field', actions: schema,
    scenes: { field: {}, menu: { pauses: true, nav: { back: 'horn' } } } });
  const e = createEngine(g), bot = e.controller({ bot: true });
  e.overlay('menu'); e.stepN(1);
  assert.equal(e.controllers[0].input.gated, true); assert.equal(bot.input.gated, true);
  assert.throws(() => e.controller({}), /engine.controller: only bots are made directly/);
});

// ---- final-review fixes ----
test('a released net pawn has its own input zeroed in place (C-3)', () => {
  const { cs, w } = setup(), c = cs.list[0], inp = { steer: 0, horn: false };
  const train = w.current.spawn({ net: 'train', input: inp });
  c.possess(train); c.input.set({ steer: 0.5, horn: true }); cs.applyInputs(); cs.copy();
  assert.deepEqual(train.input, { steer: 0.5, horn: true });
  c.unpossess();
  assert.equal(train.input, inp, 'same object'); assert.deepEqual(train.input, { steer: 0, horn: false });
});

test('possess fills the pawn at once, snapshot pointer or key copy (C-3)', () => {
  const { cs, w } = setup(), c = cs.list[0], a = w.current.spawn({}), b = w.current.spawn({ input: { steer: 0, horn: false } });
  c.input.set({ steer: 0.4, horn: true }); cs.applyInputs();
  c.possess(a); assert.equal(a.input, c.input.snapshot);
  c.possess(b); assert.deepEqual(b.input, { steer: 0.4, horn: true });
});

test('a pawn spawned and possessed in a pre system sees this step\'s input in post (C-3)', () => {
  const e = createEngine(game); let seen, done = false;
  e.system('mk', en => { if (done) return; done = true; e.controllers[0].possess(en.world.spawn({})); }, { stage: 'pre' });
  e.system('rd', () => { const p = e.controllers[0].pawn; if (p) seen = p.input.steer; }, { stage: 'post' });
  e.input.set({ steer: 0.3 }); e.stepN(1);
  assert.equal(seen, 0.3);
});

test('dispose throws on a seated controller; bots dispose; seat leave still works (C-1)', () => {
  const { cs } = setup(), bot = cs.make({ bot: true });
  assert.throws(() => cs.list[0].dispose(), /controller.dispose: seats leave with the lh.seat command/);
  cs.seat('join', 1);
  assert.throws(() => cs.of(1).dispose(), /seats leave with the lh.seat command/);
  bot.dispose(); assert.equal(cs.list.length, 2);
  cs.seat('leave', 1); assert.equal(cs.list.length, 1);
});

test('possess on a disposed controller throws (C-2)', () => {
  const { cs, w } = setup(), bot = cs.make({ bot: true });
  bot.dispose();
  assert.throws(() => bot.possess(w.current.spawn({})), /controller.possess: controller was disposed/);
});

test('renumber moves a player number and emits controller.renumbered (N-20)', () => {
  const { cs, ev } = setup(); cs.seat('join', 1);
  const c = cs.of(1);
  cs.renumber(2, 5);
  assert.equal(c.player, 5);
  assert.deepEqual(ev.at(-1), { type: 'controller.renumbered', controller: c.id, seat: 1, from: 2, to: 5 });
  assert.throws(() => cs.renumber(2, 3), /controllers.renumber: no controller is player 2/);
  assert.throws(() => cs.renumber(5, 1), /controllers.renumber: player 1 is taken/);
});

test('controller ids are monotonic and ride on every controller event (C-2)', () => {
  const { cs, ev, w } = setup(), car = w.current.spawn({});
  assert.equal(cs.list[0].id, 1);
  cs.seat('join', 1); const s1 = cs.of(1); assert.equal(s1.id, 2);
  s1.possess(car); s1.unpossess(); cs.renumber(2, 4); cs.seat('leave', 1);
  assert.deepEqual(ev.map(e => e.type), ['controller.joined', 'controller.possess', 'controller.unpossess', 'controller.renumbered', 'controller.left']);
  assert.ok(ev.every(e => e.controller === 2));
  assert.equal(cs.make({ bot: true }).id, 3);
});

test('of(seat) and engine.controllerOf look a seat up (C-1)', () => {
  const e = createEngine(game);
  assert.equal(e.controllerOf(0), e.controllers[0]); assert.equal(e.controllerOf(1), undefined);
  e.command('lh.seat', { op: 'join', seat: 1 }); e.stepN(1);
  assert.equal(e.controllerOf(1), e.controllers[1]);
});

test('createControllers is not a public export', async () => {
  const idx = await import('../src/index.sim.js');
  assert.equal('createControllers' in idx, false);
});
