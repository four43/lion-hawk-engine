// S-3 and the §4.4 seam: each main scene owns a World made before its enter and disposed after its exit; overlays
// share it; the World systems sit where the step order needs them; builtin handlers (3i); the timer (#106);
// state() carries the World digest only while it has entities.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine as makeEngine } from '../src/core/engine.js';
import { physGame } from './fixtures/phys/game.js';

// P6: Rapier's WASM memory is not garbage collected; every engine's current World is disposed after its test
const engines = [];
const createEngine = (...a) => { const e = makeEngine(...a); engines.push(e); return e; };
afterEach(() => { for (const e of engines.splice(0)) e.world?.dispose(); });

const crate = (e, ctx) => ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 10, 0], tags: ['c'] });

test('a main scene gets its World before enter; overlays share it; engine.world follows (S-3)', () => {
  let seen, inSetup = 'unset', overlayWorld;
  const g = physGame({ setup: e => { inSetup = e.world; }, build: (e, ctx) => { seen = ctx.world; ctx.world.spawn({ tags: ['m'], xf: true }); },
    scenes: { pause: { enter(e, ctx) { overlayWorld = ctx.world; } } } });
  const e = createEngine(g);
  assert.equal(inSetup, undefined, 'no World before the first scene');
  assert.ok(seen); assert.equal(seen, e.world); assert.equal(e.world.stats.entities, 1);
  e.overlay('pause');
  assert.equal(overlayWorld, e.world);
});
test('leaving the main scene disposes its World after exit and a new one replaces it', () => {
  let exitSaw;
  const g = physGame({ scenes: { yard: { enter: crate, exit(e, ctx) { exitSaw = ctx.world.stats.entities; } } } });
  const e = createEngine(g), w = e.world, serial = w.serial;
  e.go('menu');
  assert.equal(exitSaw, 1, 'the World is alive during exit');
  assert.equal(w.disposed, true); assert.equal(w.rapier, null);
  assert.throws(() => w.spawn({ xf: true }), /world: disposed/);
  assert.notEqual(e.world, w); assert.ok(e.world.serial > serial);
  e.go('yard');
  assert.equal(e.world.get(1).model, 'crate', 'ids restart in every new World');
});
test('a main enter that throws leaves no World behind', () => {
  let made;
  const e = createEngine(physGame({ scenes: { boom: { enter(en, ctx) { made = ctx.world; throw new Error('boom'); } } } }));
  assert.throws(() => e.go('boom'), /boom/);
  assert.equal(made.disposed, true);
  assert.equal(e.world, undefined);
});
test('jump re-enters with a fresh World; a load build may clear() in place', () => {
  const g = physGame({ scenes: { yard: { enter(e, ctx) { crate(e, ctx); ctx.load({ build: (en, c) => { c.world.clear(); c.world.spawn({ tags: ['rebuilt'], xf: true }); } }); }, presets: { p() {} } } } });
  const e = createEngine(g), w = e.world, s = w.serial;
  e.stepN(2);
  assert.equal(e.world, w); assert.ok(w.serial > s);
  assert.equal(w.get(1).tags.has('rebuilt'), true);
  e.jump('yard', 'p');
  assert.notEqual(e.world, w); assert.equal(w.disposed, true);
});
test('state() gains world only while the World has entities; no World key for an empty World', () => {
  const e = createEngine(physGame({ commands: { add: en => { en.world.spawn({ tags: ['m'], xf: true }); } } }));
  assert.equal('world' in e.state(), false);
  e.command('add', {}); e.stepN(1);
  assert.deepEqual(Object.keys(e.state().world), ['n', 'sum']);
  assert.equal(e.state().world.n, 1);
});
test('the schedule: lh.world.swap first in input.apply; physics systems in order; kits slot before the step', () => {
  const e = createEngine(physGame()), s = e.schedule();
  assert.deepEqual(s['input.apply'], ['lh.world.swap', 'lh.ui', 'lh.input', 'lh.commands', 'lh.possess']);
  assert.deepEqual(s['physics.world'], ['lh.physics.step', 'lh.physics.read', 'lh.physics.events']);
  e.system('kit.pre', () => {}, { stage: 'physics.world', before: ['lh.physics.step'] });
  e.system('game.late', () => {}, { stage: 'physics.world' });
  assert.deepEqual(e.schedule()['physics.world'], ['kit.pre', 'lh.physics.step', 'lh.physics.read', 'lh.physics.events', 'game.late']);
});
test('pre systems see prev == curr; physics then moves curr; the next swap makes it prev', () => {
  const seen = [];
  const g = physGame({ build: crate, tick: (e, dt, ctx) => { const c = ctx.world.get(1); seen.push([ctx.world.xfPrev(c).p.y, c.xf.p.y]); } });
  const e = createEngine(g);
  e.stepN(3);
  for (const [p, c] of seen) assert.equal(p, c, 'after the swap, before the Rapier step');
  assert.equal(seen[0][1], 10);
  assert.ok(seen[2][1] < seen[1][1] && seen[1][1] < 10);
  const c = e.world.get(1);
  assert.equal(e.world.xfPrev(c).p.y, seen[2][1]);
  assert.ok(c.xf.p.y < seen[2][1]);
});
test('a pausing overlay freezes physics; prev catches up with curr so the view holds still', () => {
  const e = createEngine(physGame({ build: crate, scenes: { pause: { pauses: true } } }));
  e.stepN(5); e.overlay('pause');
  const c = e.world.get(1), y = c.xf.p.y;
  e.stepN(3);
  assert.equal(c.xf.p.y, y); assert.equal(e.world.xfPrev(c).p.y, y);
});
test('the World does not step while a scene loads; prev catches up; physics resumes when the load ends (S-3, CI-16)', () => {
  let n = 0, t = 0;
  const g = physGame({ build: crate, tick: (e, dt, ctx) => { if (++n === 3) ctx.load({ hold: 0.25, build() {} }); } });
  const e = createEngine(g, { timer: () => (t += 0.5) }), w = e.world, c = w.get(1);
  e.stepN(3);
  assert.equal(e.loading.active, true);
  assert.equal(w.stats.stepMsTotal, 1, 'two Rapier steps: the step that asked for the load does not step');
  const y = c.xf.p.y, d = e.state().world.sum;
  e.stepN(5);
  assert.equal(c.xf.p.y, y); assert.equal(w.xfPrev(c).p.y, y, 'swap still runs: the view holds still');
  assert.equal(w.stats.stepMsTotal, 1); assert.equal(e.state().world.sum, d);
  let k = 0; while (e.loading.active && k++ < 60) e.stepN(1);
  assert.equal(e.loading.active, false);
  const total = w.stats.stepMsTotal; e.stepN(2);
  assert.equal(w.stats.stepMsTotal, total + 1); assert.ok(c.xf.p.y < y);
});
test('a load build that rebuilds in place: a body spawned asleep stays asleep when physics resumes (#2, CI-16)', () => {
  let n = 0, release;
  const rebuild = (en, c) => {
    c.world.clear();
    c.world.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [20, 0.5, 20], p: [0, -0.5, 0], material: 'gravel' }], groups: { member: ['ground'] } });
    c.world.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }], at: [0, 0.6, 0], groups: { member: ['prop'] } });
    release = en.block('rebuild'); // holds the settle, so physics stays paused for steps after the build
  };
  const e = createEngine(physGame({ tick: (en, dt, ctx) => { if (++n === 2) ctx.load({ settle: true, build: rebuild }); } }));
  e.stepN(5); // step 2 asks, step 3 builds, steps 3-5 wait on the block
  assert.equal(e.loading.phase, 'settle');
  release(); e.stepN(1);
  assert.equal(e.loading.active, false);
  e.stepN(10);
  assert.equal(e.world.get(2).body.isSleeping(), true, 'the first real step after the load re-slept it');
});
test('builtin handlers run before the game handler, which still runs (3i seam)', () => {
  const log = [];
  const e = createEngine(physGame({ commands: { 'net.frame': (en, d) => { log.push(['game', d.n]); } } }));
  const off = e.builtin('net.frame', (en, d, ctx) => { log.push(['builtin', d.n, ctx.name]); });
  assert.throws(() => e.builtin('net.frame', () => {}), /engine: builtin 'net\.frame' is already registered/);
  assert.throws(() => e.builtin('x', 5), /engine: builtin 'x' needs a function/);
  e.command('net.frame', { n: 1 }); e.stepN(1);
  assert.deepEqual(log, [['builtin', 1, 'yard'], ['game', 1]]);
  off(); e.command('net.frame', { n: 2 }); e.stepN(1);
  assert.deepEqual(log.at(-1), ['game', 2]);
  const e2 = createEngine(physGame());
  e2.builtin('only.engine', () => { log.push(['only']); });
  assert.equal(e2.commands.handles('only.engine'), true);
  e2.command('only.engine', {}); e2.stepN(1);
  assert.equal(e2.commands.dropped, 0); assert.deepEqual(log.at(-1), ['only']);
});
test('timer: world.stats.stepMs is the last Rapier step and never enters state (#106)', () => {
  let t = 0;
  const e = createEngine(physGame({ build: crate }), { timer: () => (t += 0.25) });
  e.stepN(4);
  assert.equal(e.world.stats.stepMs, 0.25); assert.equal(e.world.stats.stepMsTotal, 1);
  assert.equal(JSON.stringify(e.state()).includes('stepMs'), false);
  assert.throws(() => createEngine(physGame(), { timer: 5 }), /engine: timer must be a function/);
});
test('physics.rapier must be initialised; gravity, groups and params are checked at defineGame (§4.1, D9)', () => {
  const uninit = { World: class { constructor() { throw new TypeError('wasm not loaded'); } } };
  assert.throws(() => createEngine(physGame({ physics: { rapier: uninit } })), /physics: await RAPIER\.init\(\) before createEngine/);
  assert.throws(() => physGame({ physics: { groups: Array.from({ length: 17 }, (_, i) => `g${i}`) } }), /defineGame: physics\.groups: at most 16 groups \(got 17\)/);
  assert.throws(() => physGame({ physics: { params: { warmstartCoefficient: 1 } } }), /defineGame: physics\.params\.warmstartCoefficient is not a Rapier 0\.21 integration parameter/);
  assert.throws(() => physGame({ physics: { gravity: [0, -9.81] } }), /defineGame: physics\.gravity must be \[x, y, z\]/);
});
test('without physics.rapier the engine World holds bodiless entities only (§4.1)', () => {
  const e = createEngine(physGame({ physics: null }));
  assert.equal(e.world.rapier, null);
  e.world.spawn({ tags: ['ghost'], xf: true });
  assert.throws(() => e.world.spawn({ tags: ['pig'], body: 'dynamic' }), /world: 'pig' needs a body but the game has no physics\.rapier/);
});
test('3i hook: engine.netPart.attach(world) runs for every new World', () => {
  const seen = [];
  const e = createEngine(physGame({ setup: en => { en.netPart = { attach: w => seen.push(w.serial) }; } }));
  e.go('menu');
  assert.equal(seen.length, 2); assert.equal(seen[1], e.world.serial);
  let armed = false, orphan;
  const e3 = createEngine(physGame({ setup: en => { en.netPart = { attach: w => { if (armed) { orphan = w; throw new Error('attach failed'); } } }; } }));
  armed = true;
  assert.throws(() => e3.go('menu'), /attach failed/);
  assert.equal(e3.world, undefined, 'a World whose attach threw is not left in the seat');
  assert.equal(orphan.disposed, true);
});
