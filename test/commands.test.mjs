import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, createEngine } from '../src/index.sim.js';
import { installEngine } from '../src/index.view.js';
import { headless } from '../testing/index.js';

const log = [];
const game = defineGame({
  id: 'cmd', start: 'field',
  commands: { 'net.claim': (e, d) => log.push(['game', d.id, e.time.step]) },
  scenes: {
    field: { enter(e, ctx) { ctx.state.taps = []; ctx.command('tap', (e2, d, c) => c.state.taps.push([d.x, d.z, e2.time.step])); } },
    menu: { pauses: true, enter(e, ctx) { ctx.command('tap', () => log.push(['menu'])); } },
  },
});

test('2d: commands apply at the next step boundary, in order (#5)', () => {
  log.length = 0; const e = createEngine(game);
  e.command('tap', { x: 1, z: 2 }).command('net.claim', { id: 7 });
  assert.deepEqual(e.scene.state.taps, []); assert.equal(e.commands.pending, 2);
  e.stepN(1);
  assert.deepEqual(e.scene.state.taps, [[1, 2, 0]]); assert.deepEqual(log, [['game', 7, 0]]); assert.equal(e.commands.pending, 0);
});
test('2d: a command issued during a step applies on the next one', () => {
  const e = createEngine(game); let fired = false;
  e.system('emitter', en => { if (!fired) { fired = true; en.command('tap', { x: 3, z: 4 }); } });
  e.stepN(1); assert.deepEqual(e.scene.state.taps, []);
  e.stepN(1); assert.deepEqual(e.scene.state.taps, [[3, 4, 1]]);
});
test('2d: scene handlers are scoped and skip covered scenes; game handlers always run; unhandled commands are dropped', () => {
  log.length = 0; const e = createEngine(game);
  e.overlay('menu'); e.command('tap', { x: 0, z: 0 }).command('net.claim', { id: 1 }); e.stepN(1);
  assert.deepEqual(e.scene.state.taps, []); assert.deepEqual(log, [['menu'], ['game', 1, 0]]); // field is under the pausing menu
  e.close('menu'); e.command('tap', { x: 5, z: 5 }); e.stepN(1);
  assert.equal(e.scene.state.taps.length, 1); assert.equal(log.length, 2); // menu's handler left with it
  e.command('nobody'); e.stepN(1); assert.equal(e.commands.dropped, 1);
  assert.equal(e.commands.handles('tap'), true); assert.equal(e.commands.handles('nobody'), false);
  assert.throws(() => e.command(''), /engine: command type must be a non-empty string/);
  assert.throws(() => defineGame({ id: 'x', start: 'a', scenes: { a: {} }, commands: { a: 1 } }), /defineGame: commands.a must be a function/);
});
test('2d: a throwing handler finishes the step and rethrows; the rest of the batch waits', () => {
  const seen = [];
  const g = defineGame({ id: 'c2', start: 's', scenes: { s: {} }, commands: { boom: () => { throw new Error('boom'); }, ok: (e, d) => seen.push(d.n) } });
  const e = createEngine(g); e.command('ok', { n: 1 }).command('boom').command('ok', { n: 2 });
  assert.throws(() => e.stepN(1), /boom/); assert.deepEqual(seen, [1]); assert.equal(e.time.step, 1);
  e.stepN(1); assert.deepEqual(seen, [1, 2]);
});
test('2d: h.command and window.engine.command', () => {
  const h = headless(game); h.command('tap', { x: 9, z: 9 }).step(1);
  assert.deepEqual(h.scene.state.taps, [[9, 9, 0]]);
  assert.throws(() => h.command('nobody'), /headless: no handler for command 'nobody'/);
  const target = {}, e = createEngine(game); installEngine(e, { driver: { manual() {} }, target });
  target.engine.command('tap', { x: 1, z: 1 }); e.stepN(1); assert.equal(e.scene.state.taps.length, 1);
});
test('2d fix: handlers added during delivery wait for the next command; a removal does not skip the next handler', () => {
  const seen = [];
  const g = defineGame({ id: 'c3', start: 's', scenes: { s: { enter(e, ctx) {
    const rm = ctx.command('x', () => { seen.push('a'); rm(); ctx.command('x', () => seen.push('c')); });
    ctx.command('x', () => seen.push('b'));
  } } } });
  const e = createEngine(g); e.command('x').command('x'); e.stepN(1);
  assert.deepEqual(seen, ['a', 'b', 'b', 'c']);
  e.command('x'); e.stepN(1); assert.deepEqual(seen.slice(4), ['b', 'c']);
});

test('2f: game-wide handlers get the main scene ctx and can start its load; a second request while loading waits (#69, S-6)', () => {
  const freed = [];
  const g = defineGame({ id: 'rebuild', start: 'farm',
    commands: { 'farm.new': (e, d, ctx) => { if (e.loading.active) { ctx.state.next = d.seed; return; }
      ctx.load({ build: (en, c) => { freed.push(c.state.world.id); c.state.world = { id: d.seed }; }, frames: 1 }); } },
    scenes: { farm: { enter(e, ctx) { ctx.state.world = { id: 0 }; }, exit(e, ctx) { freed.push(ctx.state.world.id); } } } });
  const h = headless(g);
  h.command('farm.new', { seed: 7 }).command('farm.new', { seed: 8 }).step(1);
  assert.equal(h.engine.loading.active, true); assert.equal(h.scene.state.next, 8);
  h.untilLoaded(); assert.equal(h.scene.state.world.id, 7); assert.deepEqual(freed, [0]); // the old world went in the build, once
});
test('2f: command data is always checked as plain JSON and delivered as a copy, recording or not (#72)', () => {
  const got = [], g = defineGame({ id: 'copy', start: 's', scenes: { s: {} }, commands: { keep: (e, d) => got.push(d) } });
  const e = createEngine(g), ray = [1, 2, 3];
  e.command('keep', { ray }); ray[0] = 99; e.stepN(1);
  assert.deepEqual(got[0], { ray: [1, 2, 3] });
  assert.throws(() => e.command('keep', { f: () => 1 }), /engine: command data must be plain JSON/);
  assert.throws(() => e.command('keep', { n: NaN }), /plain JSON/);
});

import { F } from '../src/index.sim.js';
const IDS = F.list(F.uint(2, 0xfffe), 16);
test('2f: a schema\'d command is checked at issue, gets the checked copy, and is game-wide only (#49)', () => {
  const got = [];
  const g = defineGame({ id: 'sch', start: 's', commands: { 'host.claim': { schema: { ids: IDS }, handler: (e, d) => got.push(d) } },
    scenes: { s: { enter(e, ctx) { assert.throws(() => ctx.command('host.claim', () => {}), /'host.claim' has a schema: handle it in defineGame/); } } } });
  const h = headless(g);
  h.command('host.claim', { ids: [1], junk: 2, from: 'g2', at: 5, reliable: true }).step(1);
  assert.deepEqual(got, [{ ids: [1], from: 'g2', at: 5, reliable: true }]);
  assert.throws(() => h.command('host.claim', { ids: [1.5] }), /engine: command 'host.claim' does not match its schema/);
  assert.throws(() => defineGame({ id: 'r', start: 's', scenes: { s: {} }, commands: { x: { schema: { from: F.bool() }, handler() {} } } }), /may not declare reserved key 'from'/);
});
test('2f: the plain-JSON check runs first; reserved keys are type-checked on every command; recording logs the checked copy (#72, #77)', () => {
  const got = [];
  const g = defineGame({ id: 'sch2', start: 's', commands: { claim: { schema: { ids: IDS }, handler: (e, d) => got.push(d) }, free: (e, d) => got.push(d) }, scenes: { s: {} } });
  const e = createEngine(g, { record: true });
  assert.throws(() => e.command('claim', { ids: [NaN] }), /engine: command data must be plain JSON/);
  for (const [k, v] of [['from', 3], ['at', null], ['at', '5'], ['reliable', 1]]) for (const type of ['claim', 'free'])
    assert.throws(() => e.command(type, { ids: [1], [k]: v }), new RegExp(`reserved key '${k}' must be`), `${type} ${k}`);
  assert.throws(() => e.command('claim', null), /does not match its schema/);
  const src = { ids: [2], x: 1, from: 'p' }; e.command('claim', src).command('free', { y: 1, at: 3 }); src.ids.push(9); e.stepN(1);
  assert.deepEqual(got, [{ ids: [2], from: 'p' }, { y: 1, at: 3 }]);
  assert.deepEqual(e.tape().log[0].ops, [['command', 'claim', { ids: [2], from: 'p' }], ['command', 'free', { y: 1, at: 3 }]]);
  e.system('inner', en => { if (en.time.step === 1) assert.throws(() => en.command('claim', { ids: 'no' }), /does not match its schema/); }); e.stepN(1);
});
test('2f: engine.net hands a step\'s sends to its onStep listeners, then empties (no port, no growth)', () => {
  const g = defineGame({ id: 'out', start: 's', scenes: { s: { step(e, dt, c) { if (c.state.send !== false) e.net.send('g1', { t: 'help', id: 1 }, true); } } } });
  const e = createEngine(g), seen = [];
  const off = e.onStep(en => en.net.drain(x => seen.push(x))); e.stepN(1); off();
  assert.deepEqual(seen, [{ to: 'g1', data: { t: 'help', id: 1 }, reliable: true }]);
  e.stepN(2); assert.equal(e.net.pending, 0, 'nobody drained: discarded after each step');
  e.scene.state.send = false; e.net.leave(); assert.equal(e.net.pending, 1, 'a send between steps waits for the next step');
  e.onStep(en => en.net.drain(x => seen.push(x))); e.stepN(1); assert.deepEqual(seen.at(-1), { leave: true });
});
test('2f: engine.net sends in order, defaults to unreliable, refuses non-messages, and a throwing drain keeps the rest', () => {
  const g = defineGame({ id: 'out2', start: 's', scenes: { s: {} } }), e = createEngine(g), buf = new ArrayBuffer(8);
  e.net.send('a', { t: 'x' }); e.net.send(null, buf, true);
  assert.throws(() => e.net.send('a', { id: 1 }), /net.send data must be/); assert.throws(() => e.net.send('a', null), /net.send data must be/);
  let n = 0; assert.throws(() => e.net.drain(() => { if (n++) throw new Error('boom'); }), /boom/); assert.equal(e.net.pending, 0, 'both handed out');
  e.net.send('a', { t: 'x' }); e.net.send('b', { t: 'y' }); n = 0;
  assert.throws(() => e.net.drain(() => { n++; throw new Error('boom'); }), /boom/); assert.equal(n, 1); assert.equal(e.net.pending, 1);
  const seen = []; e.net.drain(x => seen.push(x)); assert.deepEqual(seen, [{ to: 'b', data: { t: 'y' }, reliable: false }]);
  e.net.send(null, buf, true); const got = []; e.net.drain(x => got.push(x)); assert.equal(got[0].data, buf); assert.equal(got[0].reliable, true);
});
test('2f: a nested engine.net.drain from inside fn throws and leaves the outer drain\'s bookkeeping intact', () => {
  const e = createEngine(defineGame({ id: 'out3', start: 's', scenes: { s: {} } }));
  e.net.send('a', { t: 'a' }); e.net.send('b', { t: 'b' }); e.net.send('c', { t: 'c' });
  const outer = [], inner = [];
  assert.throws(() => e.net.drain(x => { outer.push(x.to); if (x.to === 'b') e.net.drain(y => inner.push(y.to)); }), /net.drain is not re-entrant/);
  assert.deepEqual(outer, ['a', 'b']); assert.deepEqual(inner, [], 'nothing re-delivered to the nested drain');
  assert.equal(e.net.pending, 1, 'a and b handed out; c kept');
  const rest = []; e.net.drain(x => { rest.push(x.to); if (x.to === 'c') e.net.send('d', { t: 'd' }); }); assert.deepEqual(rest, ['c', 'd'], 'a send from fn still goes out in this drain');
  assert.equal(e.net.pending, 0);
});
