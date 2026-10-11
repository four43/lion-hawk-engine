import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, createEngine, actions, button } from '../src/index.sim.js';
import game from './fixtures/countdown.js';

test('defineGame validates and fills defaults', () => {
  assert.throws(() => defineGame({ id: '', scenes: { a: {} }, start: 'a' }), /defineGame: id must be a non-empty string/);
  assert.throws(() => defineGame({ id: 'g', scenes: {}, start: 'a' }), /defineGame: scenes must not be empty/);
  assert.throws(() => defineGame({ id: 'g', scenes: { a: {} }, start: 'b' }), /defineGame: start 'b' is not a scene/);
  assert.throws(() => defineGame({ id: 'g', scenes: { a: { step: 1 } }, start: 'a' }), /defineGame: scene 'a'.step must be a function/);
  const g = defineGame({ id: 'g', scenes: { a: {} }, start: 'a' });
  assert.deepEqual(g.sim, { hz: 60, maxCatchUp: 3 }); assert.deepEqual(g.policies, {}); assert.ok(Object.isFrozen(g));
});
test('starts in the start scene with its ui registered', () => {
  const e = createEngine(game, { seed: 5 });
  assert.equal(e.scene.name, 'title'); assert.equal(e.seed, 5);
  assert.deepEqual(e.ui.tree().map(c => c.id), ['title.play']);
});
test('go: scene change runs exit/enter, swaps ui, emits scene at the next flush', () => {
  const e = createEngine(game);
  e.ui.tap('title.play');
  assert.equal(e.scene.name, 'race'); assert.deepEqual(e.ui.tree().map(c => c.id), ['race.pause']);
  e.stepN(1);
  assert.deepEqual(e.events.since(0).map(x => [x.type, x.name, x.from, x.step]), [['scene', 'race', 'title', 0]]);
});
test('countdown emits on whole seconds; events carry their step; time advances', () => {
  const e = createEngine(game, { scene: 'race' });
  e.advance(3);
  assert.deepEqual(e.events.since(0).map(x => `${x.type}${x.n ?? ''}@${x.step}`), ['count2@59', 'count1@119', 'count0@179', 'go@179']);
  assert.deepEqual(e.time, { step: 180, sim: 3 });
});
test('a pausing overlay freezes the main scene; string actions press for one step', () => {
  const e = createEngine(game, { scene: 'race' });
  e.jump('race', 'running', { x: 10 });
  e.input.hold({ throttle: 1 }); e.stepN(60);
  assert.ok(Math.abs(e.scene.state.x - 20) < 1e-9);
  e.ui.tap('race.pause'); e.stepN(1);
  assert.deepEqual(e.scene.overlays, ['pause']);
  const x = e.scene.state.x; e.stepN(60); assert.equal(e.scene.state.x, x);
  e.ui.tap('pause.resume'); e.stepN(60); assert.ok(e.scene.state.x > x);
});
test('systems run in pre/post around physics.world and stop while paused', () => {
  const e = createEngine(game, { scene: 'race' }), seen = [];
  e.system('b', () => seen.push('b'), { stage: 'post' });
  e.system('a', () => seen.push('a'));
  e.system('w', () => seen.push('w'), { stage: 'physics.world' });
  e.stepN(1); assert.deepEqual(seen, ['a', 'w', 'b']);
  assert.deepEqual(e.schedule().pre, ['scene', 'a']);
  e.overlay('pause'); seen.length = 0; e.stepN(3); assert.deepEqual(seen, []);
});
test('jump errors, unknown scenes, rng streams, state()', () => {
  const e = createEngine(game, { seed: 9 });
  assert.throws(() => e.jump('race', 'nope'), /no preset 'nope' in 'race'/);
  assert.throws(() => e.go('moon'), /no scene 'moon'/);
  assert.equal(e.rng('fx').next(), createEngine(game, { seed: 9 }).rng('fx').next());
  assert.notEqual(e.rng('fx').next(), e.rng('ai').next());
  e.go('race');
  assert.deepEqual(e.state(), { scene: 'race', overlays: [], step: 0, x: 0 });
});
test('frame() drives the loop and renders with alpha via onRender', () => {
  const e = createEngine(game, { scene: 'race' }), alphas = [];
  e.onRender(a => alphas.push(a));
  assert.equal(e.frame(1 / 60 * 1.5), 1); assert.ok(Math.abs(alphas[0] - 0.5) < 1e-9);
});
test('results overlay opens once at the finish', () => {
  const e = createEngine(game, { scene: 'race' });
  e.jump('race', 'running', { x: 49 }); e.input.hold({ throttle: 1 }); e.stepN(30);
  assert.deepEqual(e.scene.overlays, ['results']);
  assert.equal(e.events.since(0).filter(x => x.type === 'finish').length, 1);
  e.ui.tap('results.retry'); assert.equal(e.scene.name, 'race'); assert.deepEqual(e.scene.overlays, []);
});
test('scene and time are persistent live views', () => {
  const e = createEngine(game), sc = e.scene, tm = e.time;
  assert.equal(e.scene, sc); assert.equal(e.time, tm);
  e.go('race'); assert.equal(sc.name, 'race'); assert.equal(sc.state, e.scene.state);
  e.overlay('pause'); assert.deepEqual(sc.overlays, ['pause']);
  e.stepN(60); assert.deepEqual(tm, { step: 60, sim: 1 });
  e.close('pause'); assert.deepEqual(sc.overlays, []);
});
