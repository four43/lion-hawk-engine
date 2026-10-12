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
