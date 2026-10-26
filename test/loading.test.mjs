import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, createEngine } from '../src/index.sim.js';
import { headless } from '../testing/index.js';

const built = []; let menuCtx = null;
const game = defineGame({ id: 'load', start: 'stage', scenes: {
  stage: { enter(e, ctx) { ctx.state.steps = 0; ctx.state.ctx = ctx; }, step(e, dt, ctx) { ctx.state.steps++; } },
  menu: { enter(e, ctx) { menuCtx = ctx; } },
} });
const req = (e, o = {}) => e.scene.state.ctx.load({ hold: 0.05, label: 'Building', build: en => built.push(['build', en.time.step]), then: en => built.push(['then', en.time.step]), ...o });

test('2d: a load suspends the scene for `hold` seconds of steps, then builds and continues (S-6, #21)', () => {
  built.length = 0; const e = createEngine(game);
  e.stepN(2); req(e);
  assert.deepEqual({ ...e.loading }, { active: true, scene: 'stage', label: 'Building', phase: 'hold' });
  e.stepN(2); assert.deepEqual(built, []); assert.equal(e.scene.state.steps, 2);
  e.stepN(1); assert.deepEqual(built, [['build', 4], ['then', 4]]); assert.equal(e.loading.active, false);
  e.stepN(1); assert.equal(e.scene.state.steps, 3);
});
test('2d: with frame acks the build waits for a presented frame; settle waits for view blocks (#38)', () => {
  built.length = 0; const e = createEngine(game, { acks: 'frames' });
  req(e, { hold: 0, settle: true });
  e.stepN(3); assert.deepEqual(built, []);
  e.presented(); e.stepN(1); assert.deepEqual(built, [['build', 3]]); assert.equal(e.loading.phase, 'settle');
  const release = e.block('track view'); assert.equal(e.blocked, 1);
  e.presented(); e.stepN(1); assert.deepEqual(built, [['build', 3]]);
  release(); release(); assert.equal(e.blocked, 0);
  e.stepN(1); assert.deepEqual(built, [['build', 3], ['then', 5]]);
});
test('2d: step acks: every step is a presented frame; settle passes at once; one load at a time', () => {
  built.length = 0; const e = createEngine(game); let n = 0; const off = e.onPresent(() => n++);
  e.stepN(3); assert.equal(n, 3); assert.equal(e.time.frames, 3); off(); e.stepN(1); assert.equal(n, 3);
  assert.throws(() => e.presented(), /presented\(\) needs acks: 'frames'/);
  req(e, { hold: 0, settle: true }); e.stepN(1); assert.deepEqual(built, [['build', 4], ['then', 4]]);
  req(e); assert.throws(() => req(e), /engine: 'stage' is already loading/); assert.equal(e.loading.active, true); // no silent restart
  e.overlay('menu'); assert.throws(() => menuCtx.load({ build() {} }), /scene 'stage' is already loading/);
  e.go('stage'); assert.equal(e.loading.active, false); // leaving the scene drops its load
  assert.throws(() => createEngine(game, { acks: 'x' }), /acks must be 'steps' or 'frames'/);
  assert.throws(() => createEngine(game, { acks: 'frames', record: true }), /record needs acks 'steps'/);
});
test('2d: h.untilLoaded', () => {
  const h = headless(game); req(h.engine);
  const { steps } = h.untilLoaded({ maxSteps: 10 }); assert.equal(steps, 3); // 0.05 s at 60 Hz
});

// The hand-written way to hold a load: phase 'loading', `t += dt` in the step hook, build once
// t >= LOAD_HOLD - 1e-9 (then return). ctx.load must build in exactly the same step, wherever the request comes from.
const stageLike = viaLoad => defineGame({ id: 'rl', sim: { hz: 240, maxCatchUp: 12 }, start: 'stage', commands: { reload: e => e.scene.state.request() }, scenes: { stage: {
  enter(e, ctx) {
    const s = ctx.state; s.builds = [];
    s.request = () => viaLoad ? ctx.load({ hold: 0.05, build: en => s.builds.push(en.time.step) }) : (s.load = { t: 0 });
    ctx.system('sys', () => { if (s.inSystem) { s.inSystem = false; s.request(); } }, { stage: 'input.apply', after: ['lh.commands'] });
  },
  step(e, dt, ctx) {
    const s = ctx.state;
    if (s.load) { if ((s.load.t += dt) >= 0.05 - 1e-9) { s.load = null; s.builds.push(e.time.step); } return; }
    if (s.inStep) { s.inStep = false; s.request(); }
  },
} } });
test('2d: ctx.load({ hold }) builds in the same step as a hand-written LOAD_HOLD counter (#21)', () => {
  for (const from of ['outside', 'command', 'system', 'step']) {
    const run = viaLoad => {
      const e = createEngine(stageLike(viaLoad)); e.stepN(5); const s = e.scene.state;
      if (from === 'outside') s.request(); else if (from === 'command') e.command('reload'); else if (from === 'system') s.inSystem = true; else s.inStep = true;
      e.stepN(30); return s.builds;
    };
    const ref = run(false); assert.equal(ref.length, 1, from); assert.deepEqual(run(true), ref, from);
  }
});
test('2d: a load waits under a pausing overlay; then is reassignable; frames counts presented frames', () => {
  const g = defineGame({ id: 'p', start: 'stage', scenes: { stage: { enter(e, ctx) { ctx.state.ctx = ctx; } }, pause: { pauses: true } } });
  const e = createEngine(g, { acks: 'frames' }), out = [];
  const l = e.scene.state.ctx.load({ frames: 2, label: 'L', build: () => out.push('build'), then: () => out.push('a') });
  l.then = () => out.push('b');
  e.presented(); e.stepN(1); assert.deepEqual(out, []);
  e.presented(); e.overlay('pause'); e.stepN(3); assert.deepEqual(out, []); assert.equal(e.loading.phase, 'hold');
  e.close('pause'); e.stepN(1); assert.deepEqual(out, ['build', 'b']);
  assert.deepEqual({ ...e.loading }, { active: false, scene: undefined, label: '', phase: '' });
});
test('2d: a throwing build clears the load and rethrows; a stale ctx cannot load; build is required', () => {
  const e = createEngine(game), ctx = e.scene.state.ctx;
  assert.throws(() => ctx.load({}), /load needs a build function/);
  ctx.load({ build() { throw new Error('boom'); } });
  assert.throws(() => e.stepN(1), /boom/); assert.equal(e.loading.active, false);
  e.stepN(1); assert.equal(e.scene.state.steps, 1); // the step hook runs again
  e.go('menu'); assert.throws(() => ctx.load({ build() {} }), /scene 'stage' is not open/);
});
test('2d fix: onBuilt listeners run after the build and before settle is evaluated', () => {
  const e = createEngine(game), log = []; let release;
  const off = e.onBuilt((en, ctx) => { log.push(['built', ctx.name, en.loading.phase]); release = en.block('reaction'); });
  e.scene.state.ctx.load({ settle: true, build: () => log.push('build'), then: () => log.push('then') });
  e.stepN(1); assert.deepEqual(log, ['build', ['built', 'stage', 'hold']]); assert.equal(e.loading.phase, 'settle');
  assert.deepEqual(e.loading.blocks, ['reaction']); assert.equal(Object.keys(e.loading).includes('blocks'), false);
  release(); e.stepN(1); assert.deepEqual(log.at(-1), 'then'); assert.deepEqual(e.loading.blocks, []);
  off(); e.scene.state.ctx.load({ build() {} }); e.stepN(1); assert.equal(log.length, 3);
});
test('2d fix: hold and frames must be finite numbers >= 0', () => {
  const e = createEngine(game), ctx = e.scene.state.ctx;
  for (const o of [{ hold: -1 }, { hold: NaN }, { hold: Infinity }, { hold: '1' }, { frames: -1 }, { frames: Infinity }])
    assert.throws(() => ctx.load({ build() {}, ...o }), /load (hold|frames) must be a finite number >= 0/);
  assert.equal(e.loading.active, false);
});
