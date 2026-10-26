// U-7/U-9/U-10: the menu navigator in happy-dom. happy-dom does no layout, so every candidate carries its rect in
// data-r="x y w h" and the navigator reads it through an injected rectOf (the geometry itself is navScore.test.mjs').
// Assertions compare test ids, never nodes (helpers/dom.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags, bindMenuNav, PAD_BUTTONS } from '../src/index.view.js';
import { defineGame, actions, axis, button } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';

const game = defineGame({
  id: 'navdom', start: 'drive',
  actions: actions({ throttle: axis(), handbrake: button(), pause: button() }),
  scenes: {
    drive: { ui(u) { u.button({ id: 'chip', label: 'Pause', action: e => e.overlay('pause') }); } },
    title: {
      nav: { modal: true, initial: 'title.drive' },
      enter(e, ctx) { ctx.state.car = 'awd'; },
      ui(u) {
        u.choice({ id: 'car', label: 'Car', options: [{ value: 'awd', label: 'AWD' }, { value: 'rwd', label: 'RWD' }, { value: 'fwd', label: 'FWD' }], get: (e, c) => c.state.car, set: (v, e, c) => { c.state.car = v; } });
        u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
        u.button({ id: 'drive', label: 'Drive', action: e => { e.scene.state.drove = true; e.close('title'); } });
        u.field({ id: 'seed', label: 'Seed', get: () => 'abc', set() {} });
      },
    },
    settings: { nav: { modal: true, back: e => e.close('settings') }, ui(u) { u.button({ id: 'done', label: 'Done', action: e => e.close('settings') }); } },
    pause: { pauses: true, nav: { modal: true, initial: 'pause.resume', back: e => e.close('pause'), open: { button: 'start', key: 'escape' } }, ui(u) { u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') }); u.hold({ id: 'quit', label: 'Quit', seconds: 1, action: e => { e.scene.state.quit = true; e.close('pause'); } }); } },
    parent: { nav: { modal: true, back: e => e.close('parent'), open: { button: 'start', seconds: 2 } } },
    lobby: {
      nav: { modal: true, shoulders: 'mode', buttons: { start: e => { e.scene.state.started = true; }, select: e => e.overlay('settings') } },
      enter(e, ctx) { ctx.state.mode = 'b'; ctx.state.car = 'awd'; },
      ui(u) {
        u.choice({ id: 'mode', label: 'Mode', options: ['a', 'b', 'c'].map(v => ({ value: v, label: v })), get: (e, c) => c.state.mode, set: (v, e, c) => { c.state.mode = v; } });
        u.choice({ id: 'car', label: 'Car', options: ['awd', 'rwd'].map(v => ({ value: v, label: v })), get: (e, c) => c.state.car, set: (v, e, c) => { c.state.car = v; } });
        u.button({ id: 'go', label: 'Go', action: () => {} });
      },
    },
    picker: { nav: { input: 'shared' }, ui(u) { u.button({ id: 'one', label: '1', action: () => {} }); } },
  },
});

// markup: adopted slots with rects, plus plain buttons in a nav scope (colour swatches)
const MARKUP = `
  <div id="title"><button data-lh-slot="title.car.awd" data-r="0 0 100 30">AWD</button><button data-lh-slot="title.car.rwd" data-r="110 0 100 30">RWD</button><button data-lh-slot="title.car.fwd" data-r="220 0 100 30">FWD</button>
    <input data-lh-slot="title.seed" data-r="0 40 320 30">
    <button data-lh-slot="title.settings" data-r="0 100 100 40">Settings</button><button data-lh-slot="title.drive" data-r="220 100 100 40">Drive</button></div>
  <div id="settings"><button data-lh-slot="settings.done" data-r="0 0 100 40">Done</button></div>
  <div id="pause"><button data-lh-slot="pause.resume" data-r="0 0 100 40">Resume</button><button data-lh-slot="pause.quit" data-r="0 50 100 40">Quit</button></div>
  <div id="parent" data-lh-nav-scope="parent"><button id="red" data-r="0 0 50 50">red</button><button id="blue" data-r="60 0 50 50">blue</button><button id="gone" data-r="120 0 50 50" hidden>x</button></div>
  <div id="lobby"><button data-lh-slot="lobby.mode.a" data-r="0 0 50 30">a</button><button data-lh-slot="lobby.mode.b" data-r="60 0 50 30">b</button><button data-lh-slot="lobby.mode.c" data-r="120 0 50 30">c</button>
    <button data-lh-slot="lobby.car.awd" data-r="0 50 50 30">awd</button><button data-lh-slot="lobby.car.rwd" data-r="60 50 50 30">rwd</button><button data-lh-slot="lobby.go" data-r="0 100 50 30">go</button></div>
  <div id="picker"><button data-lh-slot="picker.one" data-r="0 0 50 50">1</button></div>
  <button data-lh-slot="drive.chip" data-r="400 0 60 40">Pause</button>`;

const rectOf = el => {
  const r = el.getAttribute('data-r'); if (!r) return { left: 0, top: 0, width: 0, height: 0 };
  const [x, y, w, h] = r.split(' ').map(Number); return { left: x, top: y, width: w, height: h };
};
const fakePad = () => ({ id: 'Xbox Wireless Controller', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });

function setup() {
  const { window, document } = dom();
  document.body.innerHTML = MARKUP;
  const pad = fakePad(), app = boot(game, defineView({ scenes: {} }), { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), nav: false });
  const nav = bindMenuNav(app.engine, { doc: document, target: window, getGamepads: () => [pad], rectOf });
  const frame = (dt = 1 / 60) => { nav.update(dt); app.engine.stepN(1); app.engine.render(0); };
  const tap = (name, frames = 1) => { pad.buttons[PAD_BUTTONS[name]].pressed = true; frame(); for (let i = 1; i < frames; i++) frame(); pad.buttons[PAD_BUTTONS[name]].pressed = false; frame(); };
  const key = (k, type = 'keydown') => window.dispatchEvent(new window.KeyboardEvent(type, { key: k, bubbles: true }));
  const focused = () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.id ?? null;
  return { window, document, app, nav, pad, frame, tap, key, focused, e: app.engine };
}

test('a menu opening focuses its initial control; the D-pad walks it and stops at the edges', () => {
  const t = setup(); t.e.overlay('title'); t.frame(); t.frame();
  assert.equal(t.focused(), 'title.drive');
  t.tap('left'); assert.equal(t.focused(), 'title.settings');
  t.tap('left'); assert.equal(t.focused(), 'title.settings', 'no wrap');
  t.tap('up'); assert.equal(t.focused(), 'title.car.awd', 'the seed text field is skipped');
  t.tap('right'); t.tap('right'); assert.equal(t.focused(), 'title.car.fwd');
  t.tap('right'); assert.equal(t.focused(), 'title.car.fwd');
  t.app.dispose();
});

test('A clicks the focused control; LB/RB step the choice row without wrapping', () => {
  const t = setup(); t.e.overlay('title'); t.frame(); t.frame();
  t.tap('rb'); assert.equal(t.e.scene.overlays.includes('title'), true);
  const car = () => t.e.ui.tree().find(c => c.group === 'title.car' && c.pressed)?.id;
  assert.equal(car(), 'title.car.rwd');
  t.tap('rb'); t.tap('rb'); assert.equal(car(), 'title.car.fwd', 'stops at the last option');
  t.tap('lb'); assert.equal(car(), 'title.car.rwd');
  t.tap('a'); assert.equal(t.e.scene.state.drove, true, 'A on Drive drives'); assert.deepEqual(t.e.scene.overlays, []);
  t.app.dispose();
});

test('B, Esc and Start go Back through lh.back; a menu without back stays', () => {
  const t = setup(); t.e.overlay('title'); t.frame(); t.frame();
  t.tap('b'); assert.deepEqual(t.e.scene.overlays, ['title'], 'title has no back');
  t.tap('left'); t.tap('a'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['title', 'settings']);
  assert.equal(t.focused(), 'settings.done', 'the first control when there is no initial');
  t.tap('b'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['title']);
  assert.equal(t.focused(), 'title.settings', 'focus comes back to where it was');
  t.tap('a'); t.frame(); t.key('Escape'); t.frame(); t.frame(); assert.deepEqual(t.e.scene.overlays, ['title']);
  t.tap('a'); t.frame(); t.tap('start'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['title']);
  t.app.dispose();
});

test('nav.shoulders: LB/RB step that row wherever focus is, and the pad cannot focus it; keys still can', () => {
  const t = setup(); t.e.overlay('lobby'); t.frame(); t.frame();
  const pick = g => t.e.ui.tree().find(c => c.group === `lobby.${g}` && c.pressed)?.id;
  t.tap('down'); assert.equal(t.focused(), 'lobby.car.awd', 'the pad lands below the shoulders row');
  t.tap('up'); assert.equal(t.focused(), 'lobby.car.awd', 'nothing above it for the pad');
  t.tap('rb'); assert.equal(pick('mode'), 'lobby.mode.c'); assert.equal(pick('car'), 'lobby.car.awd', 'not the focused row');
  t.tap('rb'); assert.equal(pick('mode'), 'lobby.mode.c', 'no wrap');
  t.tap('lb'); t.tap('lb'); assert.equal(pick('mode'), 'lobby.mode.a');
  assert.equal(t.focused(), 'lobby.car.awd', 'focus stays put');
  t.key('ArrowUp'); assert.equal(t.focused(), 'lobby.mode.a', 'the keyboard reaches the row');
  t.app.dispose();
});

test('nav.buttons: Start and View run the menu\'s handlers (lh.press); Start without one is Back', () => {
  const t = setup(); t.e.overlay('lobby'); t.frame(); t.frame();
  t.tap('start'); t.frame(); assert.equal(t.e.scene.state.started, true); assert.deepEqual(t.e.scene.overlays, ['lobby']);
  t.tap('select'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['lobby', 'settings']);
  t.tap('start'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['lobby'], 'settings has no buttons: Start is its Back');
  t.app.dispose();
});

test('open triggers: Start or Esc taps open pause in gameplay; Start then closes it', () => {
  const t = setup(); t.frame();
  t.tap('start'); t.frame(); assert.deepEqual(t.e.scene.overlays, ['pause']);
  assert.equal(t.focused(), 'pause.resume');
  t.tap('start'); t.frame(); assert.deepEqual(t.e.scene.overlays, [], 'Start in a menu is Back');
  t.key('Escape'); t.key('Escape', 'keyup'); t.frame(); t.frame(); assert.deepEqual(t.e.scene.overlays, ['pause']);
  t.key('Escape'); t.key('Escape', 'keyup'); t.frame(); t.frame(); assert.deepEqual(t.e.scene.overlays, []);
  t.app.dispose();
});

test('a hold on a shared button: a tap opens on release, a 2 s hold opens the other menu instead', () => {
  const t = setup(); t.frame();
  const start = t.pad.buttons[PAD_BUTTONS.start];
  start.pressed = true; for (let i = 0; i < 30; i++) t.frame(); start.pressed = false; t.frame(); t.frame();
  assert.deepEqual(t.e.scene.overlays, ['pause'], 'released before 2 s: the tap menu');
  t.tap('b'); t.frame(); assert.deepEqual(t.e.scene.overlays, []);
  start.pressed = true; for (let i = 0; i < 119; i++) t.frame(); assert.deepEqual(t.e.scene.overlays, [], '1.98 s: not yet');
  t.frame(); t.frame(); assert.deepEqual(t.e.scene.overlays, ['parent'], '2 s: the hold menu');
  start.pressed = false; t.frame(); t.frame(); assert.deepEqual(t.e.scene.overlays, ['parent'], 'releasing does not also fire the tap');
  t.app.dispose();
});

test('unregistered buttons in a nav scope are candidates (hidden ones are not); B closes', () => {
  const t = setup(); t.e.overlay('parent'); t.frame(); t.frame();
  assert.equal(t.focused(), 'red');
  t.tap('right'); assert.equal(t.focused(), 'blue');
  t.tap('right'); assert.equal(t.focused(), 'blue', 'the hidden button is skipped');
  let clicked = 0; t.document.getElementById('blue').addEventListener('click', () => clicked++);
  t.tap('a'); assert.equal(clicked, 1);
  t.tap('b'); t.frame(); assert.deepEqual(t.e.scene.overlays, []);
  t.app.dispose();
});

test('A on a hold control presses it for as long as A is held', () => {
  const t = setup(); t.e.overlay('pause'); t.frame(); t.frame();
  t.tap('down'); assert.equal(t.focused(), 'pause.quit');
  const a = t.pad.buttons[PAD_BUTTONS.a];
  a.pressed = true; for (let i = 0; i < 30; i++) t.frame(); a.pressed = false; t.frame();
  assert.equal(t.e.scene.state.quit, undefined, 'half a second, then let go: cancelled');
  a.pressed = true; for (let i = 0; i < 62; i++) t.frame();
  assert.equal(t.e.scene.state.quit, true);
  t.app.dispose();
});

test('arrow keys move, Enter clicks through the browser, data-lh-input follows the device', () => {
  const t = setup(); t.e.overlay('title'); t.frame(); t.frame();
  const html = t.document.documentElement;
  t.key('ArrowLeft'); t.frame(); assert.equal(t.focused(), 'title.settings');
  assert.equal(html.getAttribute('data-lh-input'), 'keys');
  t.tap('right'); assert.equal(html.getAttribute('data-lh-input'), 'pad'); assert.equal(html.getAttribute('data-lh-pad'), 'xbox');
  t.document.dispatchEvent(new t.window.PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); t.frame();
  assert.equal(html.getAttribute('data-lh-input'), 'touch');
  t.app.dispose();
});

test('a shared sub-menu: the D-pad navigates it, the stick is left to the game', () => {
  const t = setup(); t.e.overlay('picker'); t.frame(); t.frame();
  assert.equal(t.focused(), 'picker.one');
  t.pad.axes[0] = 1; t.frame(); t.frame();
  assert.equal(t.e.input.gated, false);
  t.pad.axes[0] = 0; t.frame();
  t.tap('right'); assert.equal(t.focused(), 'drive.chip', 'non-modal: falls through to the scene below');
  t.app.dispose();
});

test('boot creates the navigator when a scene declares nav, and window.engine.view.nav reads it', () => {
  const { window, document } = dom();
  const app = boot(game, defineView({ scenes: {} }), { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'), getGamepads: () => [] });
  assert.equal(typeof app.view.nav?.update, 'function');
  assert.equal(window.engine.view.nav.last, 'pointer');
  app.dispose();
  assert.equal(document.documentElement.hasAttribute('data-lh-input'), false);
  const off = boot(defineGame({ id: 'plain', start: 'a', scenes: { a: {} } }), defineView({ scenes: {} }), { doc: dom().document, target: dom().window, raf: () => 0, caf() {}, flags: parseFlags('?lh-test') });
  assert.equal(off.view.nav, null); off.dispose();
});
