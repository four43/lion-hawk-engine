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
  assert.deepEqual(g.sim, { hz: 60, maxCatchUp: 3, maxFrame: 0.25 }); assert.deepEqual(g.policies, {}); assert.ok(Object.isFrozen(g));
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
  assert.deepEqual(e.schedule().pre, ['lh.scene', 'a']);
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

const mini = scenes => defineGame({ id: 'mini', start: 'a', scenes: { a: {}, ...scenes } });
test('failed enter/ui rolls back the half-entered scene and rethrows', () => {
  const g = mini({
    bad: { enter(e, ctx) { ctx.system('s', () => {}); throw new Error('boom'); }, ui(u) { u.button({ id: 'x', label: 'x', action: () => {} }); } },
    badui: { ui(u) { u.button({ id: 'y', label: 'y', action: () => {} }); throw new Error('boomui'); } },
    ov: {},
  });
  const e = createEngine(g);
  e.overlay('ov');
  assert.throws(() => e.overlay('bad'), /boom/);
  assert.deepEqual(e.scene.overlays, ['ov']); assert.deepEqual(e.ui.tree(), []); assert.ok(!e.schedule().pre.includes('s'));
  assert.throws(() => e.overlay('badui'), /boomui/);
  assert.deepEqual(e.scene.overlays, ['ov']); assert.deepEqual(e.ui.tree(), []);
  assert.throws(() => e.go('bad'), /boom/);
  assert.equal(e.scene.name, undefined); assert.deepEqual(e.scene.overlays, []);
});
test('opening an already-open scene throws before any hook', () => {
  let n = 0;
  const e = createEngine(mini({ ov: { enter() { n++; } } }));
  e.overlay('ov'); assert.equal(n, 1);
  assert.throws(() => e.overlay('ov'), /engine: scene 'ov' is already open/);
  assert.throws(() => e.overlay('a'), /engine: scene 'a' is already open/);
  assert.throws(() => e.go('ov'), /engine: scene 'ov' is already open/);
  assert.equal(n, 1); e.go('a'); assert.equal(e.scene.name, 'a');
});
test('transitions during a step are queued to the end of the step', () => {
  const seen = [];
  const g = mini({
    b: { enter() { seen.push('enter b'); } },
    ov1: { step(e) { e.close('ov1'); } }, ov2: { step() { seen.push('ov2 step'); } },
  });
  g.scenes.a.step = (e, dt, ctx) => { if (e.time.step !== 2) return; e.go('b'); seen.push(`after go: ${e.scene.name} ${ctx.state === e.scene.state}`); };
  const e = createEngine(g);
  e.system('late', en => seen.push(`late sees ${en.scene.name}`));
  e.stepN(2); seen.length = 0; e.stepN(1);
  assert.deepEqual(seen, ['after go: a true', 'late sees a', 'enter b']);
  assert.equal(e.scene.name, 'b');
  assert.deepEqual(e.events.since(0).filter(x => x.type === 'scene').map(x => [x.name, x.from, x.step]), [['b', 'a', 2]]);
  // an overlay closing itself mid-step does not make another overlay skip its step
  e.overlay('ov1'); e.overlay('ov2'); seen.length = 0; e.stepN(1);
  assert.deepEqual(seen, ['ov2 step', 'late sees b']); assert.deepEqual(e.scene.overlays, ['ov2']);
});
test('scene-scoped systems die with their scene instance', () => {
  let runs = 0;
  const e = createEngine(mini({ b: { enter(en, ctx) { ctx.system('bsys', () => runs++); } } }));
  e.go('b'); assert.ok(e.schedule().pre.includes('bsys'));
  e.stepN(2); assert.equal(runs, 2);
  e.go('a'); assert.ok(!e.schedule().pre.includes('bsys')); e.stepN(1); assert.equal(runs, 2);
});
test('jump passes args to enter', () => {
  let got;
  const e = createEngine(mini({ b: { enter(en, ctx) { got = ctx.args; }, presets: { p() {} } } }));
  e.jump('b', 'p', {}, { lvl: 2 }); assert.deepEqual(got, { lvl: 2 });
});
test('a throwing step cannot wedge later transitions', () => {
  const e = createEngine(mini({ boom: { step() { throw new Error('step boom'); } }, other: {} }), { scene: 'boom' });
  assert.throws(() => e.stepN(1), /step boom/);
  e.go('other'); assert.equal(e.scene.name, 'other');
});
test('a throwing exit still removes scoped systems and ui', () => {
  const e = createEngine(mini({ x: { enter(en, ctx) { ctx.system('xs', () => {}); }, exit() { throw new Error('exit boom'); }, ui(u) { u.button({ id: 'b', label: 'b', action: () => {} }); } } }), { scene: 'x' });
  assert.ok(e.schedule().pre.includes('xs')); assert.equal(e.ui.tree().length, 1);
  assert.throws(() => e.go('a'), /exit boom/);
  assert.ok(!e.schedule().pre.includes('xs')); assert.deepEqual(e.ui.tree(), []);
});

test('F1: a scene whose enter requests a go completes its own entry first, then the go applies', () => {
  const log = [];
  const g = mini({
    loading: { enter(e) { log.push('enter loading'); e.go('farm'); log.push('enter returns'); }, exit() { log.push('exit loading'); }, ui(u) { u.button({ id: 'x', label: 'x', action: () => {} }); } },
    farm: { enter() { log.push('enter farm'); } },
  });
  const e = createEngine(g);
  e.go('loading');
  assert.equal(e.scene.name, 'farm');
  assert.deepEqual(log, ['enter loading', 'enter returns', 'exit loading', 'enter farm']);
  assert.deepEqual(e.ui.tree(), []);
  e.stepN(1);
  assert.deepEqual(e.events.since(0).filter(x => x.type === 'scene').map(x => `${x.from}→${x.name}`), ['a→loading', 'loading→farm']);
});
test('F1: a go from inside an exit hook applies after the outer go completes', () => {
  const log = [];
  const g = mini({
    b: { enter() { log.push('enter b'); }, exit(e) { log.push('exit b'); e.go('c'); } },
    c: { enter() { log.push('enter c'); } },
    d: { enter() { log.push('enter d'); } },
  });
  const e = createEngine(g, { scene: 'b' }); log.length = 0;
  e.go('d');
  assert.deepEqual(log, ['exit b', 'enter d', 'enter c']); assert.equal(e.scene.name, 'c');
});
test('F1: an enter that throws after a nested go leaves a consistent stack', () => {
  const g = mini({ bad: { enter(e) { e.go('a'); throw new Error('nested boom'); } }, ov: {} });
  const e = createEngine(g);
  e.overlay('ov');
  assert.throws(() => e.overlay('bad'), /nested boom/);
  assert.equal(e.scene.name, 'a'); assert.deepEqual(e.scene.overlays, ['ov']);
  assert.deepEqual(e.state().overlays, ['ov']);
  e.close('ov'); assert.deepEqual(e.scene.overlays, []); assert.equal(e.scene.name, 'a');
});
test('only the last queued go (and what follows it) applies', () => {
  const seen = [];
  const g = mini({ b: { enter() { seen.push('b'); } }, c: { enter() { seen.push('c'); } }, ov: { enter() { seen.push('ov'); } } });
  g.scenes.a.step = e => { e.overlay('ov'); e.go('b'); e.go('c'); };
  const e = createEngine(g); e.stepN(1);
  assert.deepEqual(seen, ['c']); assert.equal(e.scene.name, 'c');
});

test('F2: overlaying an open or already-pending scene throws at the call site; the step still completes', () => {
  const g = mini({ results: {} });
  const e = createEngine(g);
  e.system('s1', en => en.overlay('results'));
  e.system('s2', en => en.overlay('results'));
  assert.throws(() => e.stepN(1), /engine: scene 'results' is already open/);
  assert.equal(e.time.step, 1);
  assert.deepEqual(e.scene.overlays, ['results']);
  assert.equal(e.events.since(0).filter(x => x.type === 'overlay').length, 1);
});
test('F3: rng(name) is one cached stream per name', () => {
  const e = createEngine(mini({}), { seed: 4 });
  assert.equal(e.rng('fx'), e.rng('fx'));
  const v = [e.rng('fx').next(), e.rng('fx').next(), e.rng('fx').next()];
  assert.equal(new Set(v).size, 3);
  assert.equal(v[0], createEngine(mini({}), { seed: 4 }).rng('fx').next());
});
test('F4 (R-8): time updates every step; the scene view (and overlays array) only change on transitions', () => {
  const e = createEngine(mini({ ov: {}, ov2: {} }));
  e.overlay('ov');
  const view = e.scene, overlays = e.scene.overlays;
  e.stepN(5);
  assert.equal(e.scene, view); assert.equal(e.scene.overlays, overlays); assert.deepEqual(overlays, ['ov']);
  assert.equal(e.time.step, 5);
  e.overlay('ov2'); assert.equal(e.scene.overlays, overlays); assert.deepEqual(overlays, ['ov', 'ov2']);
});

test('F6: defineGame setup(engine) runs once, before the start scene; its systems survive scene changes', () => {
  assert.throws(() => defineGame({ id: 'g', scenes: { a: {} }, start: 'a', setup: 1 }), /defineGame: setup must be a function/);
  const order = []; let setups = 0, runs = 0;
  const g = defineGame({
    id: 'g', start: 'a', scenes: { a: { enter() { order.push('enter a'); } }, b: {} },
    setup(e) { setups++; order.push('setup'); e.system('global', () => runs++); },
  });
  const e = createEngine(g);
  assert.deepEqual(order, ['setup', 'enter a']);
  e.stepN(1); assert.equal(runs, 1);
  e.go('b'); e.go('a'); e.stepN(1);
  assert.equal(runs, 2); assert.equal(setups, 1);
});

test('built-in systems are named lh.input, lh.commands, lh.scene, lh.events', () => {
  const e = createEngine(mini({}));
  assert.deepEqual(e.schedule(), { 'input.apply': ['lh.input', 'lh.commands'], pre: ['lh.scene'], 'physics.world': [], post: [], 'events.flush': ['lh.events'] });
});
test('state(): the game state comes first, engine keys win', () => {
  const g = defineGame({ id: 'g', start: 'a', scenes: { a: {} }, state: () => ({ step: 'mine', scene: 'mine', hp: 3 }) });
  const e = createEngine(g); e.stepN(2);
  assert.deepEqual(e.state(), { step: 2, scene: 'a', overlays: [], hp: 3 });
});
test('defineGame: sim validation and maxFrame', () => {
  assert.throws(() => defineGame({ id: 'g', scenes: { a: {} }, start: 'a', sim: { hz: 0 } }), /defineGame: sim.hz must be a positive number/);
  assert.throws(() => defineGame({ id: 'g', scenes: { a: {} }, start: 'a', sim: { hz: '60' } }), /defineGame: sim.hz must be a positive number/);
  assert.throws(() => defineGame({ id: 'g', scenes: { a: {} }, start: 'a', sim: { maxCatchUp: -1 } }), /defineGame: sim.maxCatchUp must be a positive number/);
  assert.equal(defineGame({ id: 'g', scenes: { a: {} }, start: 'a' }).sim.maxFrame, 0.25);
  const e = createEngine(defineGame({ id: 'g', scenes: { a: {} }, start: 'a', sim: { maxFrame: 0.05, maxCatchUp: 100 } }));
  assert.equal(e.frame(10), 3); // 0.05 s of a 10 s frame at 60 Hz
});
test('a pausing overlay freezes every stage; only overlays at or above the topmost pausing one step', () => {
  const seen = [];
  const g = mini({ hud: { step() { seen.push('hud'); } }, pause: { pauses: true, step() { seen.push('pause'); } }, top: { step() { seen.push('top'); } } });
  g.scenes.a.step = () => seen.push('a');
  const e = createEngine(g);
  e.overlay('hud'); e.stepN(1); assert.deepEqual(seen, ['a', 'hud']);
  seen.length = 0; e.overlay('pause'); e.overlay('top'); e.stepN(1); assert.deepEqual(seen, ['pause', 'top']);
});
test('ui: a control below the topmost pausing overlay is covered', () => {
  const e = createEngine(game, { scene: 'race' });
  e.jump('race', 'running'); e.stepN(1); e.overlay('results');
  assert.throws(() => e.ui.tap('race.pause'), /ui: control 'race.pause' is covered by 'results'/);
  e.ui.tap('results.retry'); assert.equal(e.scene.name, 'race');
});

test('a start scene whose enter calls go() leaves no systems or ui behind (2a carry-over)', () => {
  const g = defineGame({ id: 'g', start: 'loading', scenes: {
    loading: { enter(e, c) { e.go('farm'); c.system('loading.sys', () => {}); }, ui(u) { u.button({ id: 'b', label: 'B', action: () => {} }); } },
    farm: {},
  } });
  const e = createEngine(g);
  assert.equal(e.scene.name, 'farm');
  assert.deepEqual(e.schedule().pre, ['lh.scene']);
  assert.deepEqual(e.ui.tree(), []);
});
test('setup may request transitions; they apply after the start scene enters', () => {
  const g = defineGame({ id: 'g', start: 's', setup(e) { e.overlay('p'); }, scenes: { s: {}, p: {} } });
  const e = createEngine(g);
  assert.equal(e.scene.name, 's'); assert.deepEqual(e.scene.overlays, ['p']);
});
test('duplicate check projects the queue: close then reopen, overlay after a go', () => {
  const g = defineGame({ id: 'g', start: 's', scenes: {
    s: { step(e, dt, c) { c.state.n = (c.state.n ?? 0) + 1; if (c.state.n === 1) { e.close('p'); e.overlay('p'); } } },
    p: {}, a: {},
  } });
  const e = createEngine(g); e.overlay('p');
  e.stepN(1); assert.deepEqual(e.scene.overlays, ['p']);
  const g2 = defineGame({ id: 'g2', start: 's', scenes: { s: { step(e) { e.overlay('p'); e.go('a'); e.overlay('p'); } }, p: {}, a: {} } });
  const e2 = createEngine(g2); e2.stepN(1);
  assert.equal(e2.scene.name, 'a'); assert.deepEqual(e2.scene.overlays, ['p']);
});

test('render(alpha) calls onRender without stepping', () => {
  const e = createEngine(game, { scene: 'race' }); const got = []; e.onRender(a => got.push(a));
  const s = e.time.step; e.render(0.25); assert.deepEqual(got, [0.25]); assert.equal(e.time.step, s);
});

test('scene instance ids: new id per enter, overlays in overlayIds', () => {
  const e = createEngine(game, { scene: 'race' }); const a = e.scene.id; assert.equal(typeof a, 'number');
  e.go('race'); assert.ok(e.scene.id > a);
  e.overlay('pause'); const o = e.scene.overlayIds[0]; assert.equal(e.scene.overlayIds.length, 1);
  e.close('pause'); e.overlay('pause'); assert.ok(e.scene.overlayIds[0] > o);
});
