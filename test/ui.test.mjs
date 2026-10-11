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
