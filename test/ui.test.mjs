import test from 'node:test';
import assert from 'node:assert/strict';
import { createUi } from '../src/core/ui.js';

test('controls register under <scene>.<id> and show in the tree (U-1)', () => {
  const ui = createUi({ onAction() {} }), ctx = { running: false, sound: true };
  const b = ui.builder('race');
  b.button({ id: 'pause', label: 'Pause', action: 'pause', when: c => c.running });
  b.toggle({ id: 'sound', label: 'Sound', get: c => c.sound, set: (v, c) => { c.sound = v; } });
  assert.deepEqual(ui.tree(ctx), [
    { id: 'race.pause', scene: 'race', role: 'button', label: 'Pause', enabled: false },
    { id: 'race.sound', scene: 'race', role: 'switch', label: 'Sound', enabled: true, pressed: true },
  ]);
});
test('tap: function action, action name, toggle, disabled, unknown', () => {
  const pressed = [], ui = createUi({ onAction: a => pressed.push(a) }), ctx = { running: true, sound: true, went: null };
  const b = ui.builder('race');
  b.button({ id: 'pause', label: 'Pause', action: 'pause', when: c => c.running });
  b.button({ id: 'retry', label: 'Retry', action: c => { c.went = 'race'; } });
  b.toggle({ id: 'sound', label: 'Sound', get: c => c.sound, set: (v, c) => { c.sound = v; } });
  ui.tap('race.pause', ctx); assert.deepEqual(pressed, ['pause']);
  ui.tap('race.retry', ctx); assert.equal(ctx.went, 'race');
  ui.tap('race.sound', ctx); assert.equal(ctx.sound, false);
  ctx.running = false; assert.throws(() => ui.tap('race.pause', ctx), /control 'race.pause' is disabled/);
  assert.throws(() => ui.tap('title.play', ctx), /no control 'title.play'/);
});
test('clear(scene) removes only that scene; duplicates throw', () => {
  const ui = createUi({ onAction() {} });
  ui.builder('a').button({ id: 'x', label: 'X', action: () => {} });
  ui.builder('b').button({ id: 'y', label: 'Y', action: () => {} });
  assert.throws(() => ui.builder('a').button({ id: 'x', label: 'X', action: () => {} }), /duplicate control 'a.x'/);
  ui.clear('a'); assert.deepEqual(ui.tree({}).map(c => c.id), ['b.y']);
});

test('2c: choice registers one control per option; tap sets the original value (#18)', () => {
  const ui = createUi({ onAction() {} }), ctx = { mode: 'stage', assist: false };
  const b = ui.builder('title');
  b.choice({ id: 'mode', options: [{ value: 'stage', label: 'Stage' }, { value: 'loop', label: 'Loop' }], get: c => c.mode, set: (v, c) => { c.mode = v; } });
  b.choice({ id: 'assist', options: [{ value: true, label: 'Assisted' }, { value: false, label: 'Sim' }], get: c => c.assist, set: (v, c) => { c.assist = v; } });
  assert.deepEqual(ui.tree(ctx).slice(0, 2), [
    { id: 'title.mode.stage', scene: 'title', role: 'choice', label: 'Stage', enabled: true, pressed: true, group: 'title.mode' },
    { id: 'title.mode.loop', scene: 'title', role: 'choice', label: 'Loop', enabled: true, pressed: false, group: 'title.mode' },
  ]);
  ui.tap('title.mode.loop', ctx); assert.equal(ctx.mode, 'loop');
  ui.tap('title.assist.true', ctx); assert.equal(ctx.assist, true);
});
test('2c: field shows its value, fills with text, cannot be tapped (#18)', () => {
  const ui = createUi({ onAction() {} }), ctx = { seed: 'abc', open: true };
  ui.builder('title').field({ id: 'seed', label: 'Track seed', get: c => c.seed, set: (t, c) => { c.seed = t; }, when: c => c.open });
  ui.builder('title').button({ id: 'go', label: 'Go', action: () => {} });
  assert.deepEqual(ui.tree(ctx)[0], { id: 'title.seed', scene: 'title', role: 'textbox', label: 'Track seed', enabled: true, value: 'abc' });
  ui.fill('title.seed', 'xyz', ctx); assert.equal(ctx.seed, 'xyz');
  assert.throws(() => ui.tap('title.seed', ctx), /'title.seed' is a field: use fill/);
  assert.throws(() => ui.fill('title.go', 'q', ctx), /'title.go' is not a field/);
  ctx.open = false; assert.throws(() => ui.fill('title.seed', 'q', ctx), /is disabled/);
  assert.throws(() => ui.fill('title.nope', 'q', ctx), /no control 'title.nope'/);
});

import { createEngine, defineGame, actions, button } from '../src/index.sim.js';
const hg = defineGame({ id: 'hold', start: 's', actions: actions({ gear: button() }), scenes: { s: {
  enter(e, ctx) { ctx.state.fired = 0; ctx.state.on = true; },
  ui(u) {
    u.hold({ id: 'wake', label: 'Wake up', seconds: 0.5, action: e => e.scene.state.fired++, when: e => e.scene.state.on });
    u.hold({ id: 'gear', label: 'Gear', seconds: 0.25, action: 'gear' });
  },
} } });
const prog = (e, id) => e.ui.tree().find(c => c.id === id);
test('2d: ui.hold fires once after its seconds of engine time; letting go early cancels (#9)', () => {
  const e = createEngine(hg);
  e.ui.press('s.wake'); e.stepN(29); assert.equal(e.scene.state.fired, 0);
  assert.ok(Math.abs(prog(e, 's.wake').progress - 29 / 30) < 1e-9); assert.equal(prog(e, 's.wake').pressed, true);
  e.stepN(1); assert.equal(e.scene.state.fired, 1); e.stepN(60); assert.equal(e.scene.state.fired, 1);
  e.ui.release('s.wake'); assert.equal(prog(e, 's.wake').progress, 0);
  e.ui.press('s.wake'); e.stepN(10); e.ui.release('s.wake'); e.stepN(30); assert.equal(e.scene.state.fired, 1);
  e.ui.press('s.wake'); e.stepN(10); e.scene.state.on = false; e.stepN(1); assert.equal(prog(e, 's.wake').pressed, false);
  assert.throws(() => e.ui.press('s.wake'), /is disabled/); assert.throws(() => e.ui.tap('s.gear'), /is a hold: use press/);
  e.ui.press('s.gear'); e.stepN(14); assert.equal(e.input.snapshot.gear.pressed, false);
  e.stepN(1); assert.equal(e.input.snapshot.gear.pressed, true); // fired before lh.input: pressed in the same step
});
