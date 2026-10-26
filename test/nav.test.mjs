// U-9: the sim half of menu navigation: nav options, lh.back, lh.open and game-input gating.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame, createEngine, actions, axis, button } from '../src/index.sim.js';
import { topNav, menuOwnsInput } from '../src/core/nav.js';

const make = (extra = {}) => defineGame({
  id: 'nav', start: 'drive',
  actions: actions({ throttle: axis(), handbrake: button(), pause: button(), leave: button() }),
  scenes: {
    drive: { step(e, dt, ctx) { if (e.input.snapshot.pause.pressed) e.overlay('pause', undefined, { once: true }); } },
    pause: { pauses: true, nav: { modal: true, initial: 'pause.resume', back: e => e.close('pause'), open: { button: 'start', key: 'escape', when: e => e.scene.state.running !== false } } },
    parent: { nav: { back: 'leave', open: { button: 'start', seconds: 2 } }, step(e) { if (e.input.snapshot.leave.pressed) e.close('parent'); } },
    chip: { nav: { input: 'shared' } },
    toast: {},
    ...extra,
  },
});

test('defineGame checks nav options', () => {
  const bad = (nav, re) => assert.throws(() => make({ x: { nav } }), re);
  bad(5, /scene 'x'.nav must be an object/);
  bad({ wrap: true }, /unknown option 'wrap'/);
  bad({ modal: 'yes' }, /nav.modal must be a boolean/);
  bad({ initial: '' }, /nav.initial must be a control test id/);
  bad({ back: 3 }, /nav.back must be an action name or a function/);
  bad({ back: 'nope' }, /nav.back: no action 'nope'/);
  bad({ input: 'all' }, /nav.input must be 'menu' or 'shared'/);
  bad({ open: {} }, /nav.open needs a button or a key/);
  bad({ open: { button: 'home' } }, /nav.open.button must be one of/);
  bad({ open: { key: 'escape', seconds: -1 } }, /nav.open.seconds must be a finite number >= 0/);
  bad({ open: { key: 'escape', when: true } }, /nav.open.when must be a function/);
  bad({ open: { key: 'escape', hold: 1 } }, /nav.open: unknown option 'hold'/);
  bad({ shoulders: '' }, /nav.shoulders must be a choice id/);
  bad({ buttons: [] }, /nav.buttons must be an object/);
  bad({ buttons: { a: () => {} } }, /nav.buttons: 'a' must be one of x, y, select, start/);
  bad({ buttons: { start: 3 } }, /nav.buttons.start must be an action name or a function/);
  bad({ buttons: { select: 'nope' } }, /nav.buttons.select: no action 'nope'/);
});

test('topNav and menuOwnsInput look at the topmost overlay that declares nav', () => {
  const g = make();
  assert.equal(topNav(g, []), undefined);
  assert.equal(topNav(g, ['pause', 'toast']), 'pause');            // a nav-less overlay on top is ignored
  assert.equal(topNav(g, ['pause', 'chip']), 'chip');
  assert.equal(menuOwnsInput(g, ['pause']), true);
  assert.equal(menuOwnsInput(g, ['pause', 'chip']), false);         // a shared sub-menu on top leaves the game live
  assert.equal(menuOwnsInput(g, ['toast']), false);
});

test('lh.back runs the top menu\'s back: a function, or an action pressed next step; none is a no-op', () => {
  const e = createEngine(make());
  e.command('lh.back'); e.stepN(1); assert.deepEqual(e.scene.overlays, []);   // no menu open: nothing happens
  e.overlay('parent'); e.overlay('pause'); e.stepN(1);
  e.command('lh.back'); e.stepN(1); assert.deepEqual(e.scene.overlays, ['parent']); // pause (on top, pausing) closes; parent stays
  e.command('lh.back'); e.stepN(2); assert.deepEqual(e.scene.overlays, []);         // parent's back is the 'leave' action
  e.overlay('toast'); e.command('lh.back'); e.stepN(1); assert.deepEqual(e.scene.overlays, ['toast']); // no nav: untouched
});

test('lh.press runs the top menu\'s nav.buttons handler: a function, or an action; others and unknown buttons are no-ops', () => {
  const e = createEngine(make({ lobby: { nav: { modal: true, buttons: { start: e => { e.scene.state.started = true; }, select: 'leave' } }, step(e) { if (e.input.snapshot.leave.pressed) e.close('lobby'); } } }));
  e.overlay('lobby'); e.stepN(1);
  e.command('lh.press', { button: 'y' }); e.command('lh.press', { button: 'a' }); e.stepN(1);
  assert.equal(e.scene.state.started, undefined); assert.deepEqual(e.scene.overlays, ['lobby']);
  e.command('lh.press', { button: 'start' }); e.stepN(1); assert.equal(e.scene.state.started, true);
  e.command('lh.press', { button: 'select' }); e.stepN(2); assert.deepEqual(e.scene.overlays, []);
});

test('lh.open: the when gate, once, and no opening over a menu that owns input', () => {
  const e = createEngine(make());
  e.command('lh.open', { name: 'pause' }); e.stepN(1); assert.deepEqual(e.scene.overlays, ['pause']);
  e.command('lh.open', { name: 'parent' }); e.stepN(1); assert.deepEqual(e.scene.overlays, ['pause'], 'pause owns input');
  e.close('pause'); e.stepN(1);
  e.scene.state.running = false; e.command('lh.open', { name: 'pause' }); e.stepN(1); assert.deepEqual(e.scene.overlays, [], 'when said no');
  e.scene.state.running = true;
  e.command('lh.open', { name: 'toast' }).command('lh.open', { name: 'nobody' }).command('lh.open', { name: 3 }); e.stepN(1);
  assert.deepEqual(e.scene.overlays, [], 'no nav.open: ignored');
  e.overlay('chip'); e.command('lh.open', { name: 'pause' }); e.stepN(1); assert.deepEqual(e.scene.overlays, ['chip', 'pause'], 'a shared menu does not block');
});

test('input gating: a menu with input \'menu\' releases held game input and ignores devices; set/hold still apply', () => {
  const e = createEngine(make());
  e.input.device({ throttle: 1, handbrake: true }, 'pad'); e.stepN(1);
  assert.equal(e.input.snapshot.throttle, 1); assert.equal(e.input.snapshot.handbrake.down, true);
  e.overlay('parent'); e.stepN(1);
  assert.equal(e.input.snapshot.throttle, 0); assert.equal(e.input.snapshot.handbrake.down, false); assert.equal(e.input.snapshot.handbrake.released, true);
  assert.equal(e.input.gated, true);
  e.input.device({ handbrake: false }, 'pad'); e.input.device({ handbrake: true }, 'pad'); e.stepN(1); // a tap while gated is not owed
  assert.equal(e.input.snapshot.handbrake.pressed, false);
  e.input.set({ leave: true }); e.stepN(1); assert.deepEqual(e.scene.overlays, [], 'set() passes the gate (UI actions, tests)');
});

test('leaving the gate: a button still held from the menu stays off until it is let go; axes come straight back', () => {
  const e = createEngine(make());
  e.overlay('parent'); e.stepN(1);
  e.input.device({ throttle: 0.5, handbrake: true }, 'pad'); e.stepN(1); assert.equal(e.input.snapshot.handbrake.down, false);
  e.close('parent'); e.stepN(1);
  assert.equal(e.input.gated, false);
  assert.equal(e.input.snapshot.throttle, 0.5);
  assert.equal(e.input.snapshot.handbrake.down, false, 'latched: the A that closed the menu is not a handbrake');
  e.stepN(3); assert.equal(e.input.snapshot.handbrake.down, false);
  e.input.device({ handbrake: false }, 'pad'); e.stepN(1);
  e.input.device({ handbrake: true }, 'pad'); e.stepN(1); assert.equal(e.input.snapshot.handbrake.pressed, true, 'a fresh press after letting go counts');
});

test('a shared menu leaves game input live', () => {
  const e = createEngine(make());
  e.overlay('chip'); e.input.device({ throttle: 1 }, 'pad'); e.stepN(1);
  assert.equal(e.input.gated, false); assert.equal(e.input.snapshot.throttle, 1);
});

test('recording: back and open are commands, so a replay reproduces them', () => {
  const g = make(), e = createEngine(g, { record: true });
  e.command('lh.open', { name: 'pause' }); e.stepN(2); e.command('lh.back'); e.stepN(2);
  const ops = e.tape().log.flatMap(x => x.ops ?? []);
  assert.deepEqual(ops, [['command', 'lh.open', { name: 'pause' }], ['command', 'lh.back', {}]]);
  assert.deepEqual(e.scene.overlays, []);
});
