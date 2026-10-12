import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, createUiDom, defineGame, actions, button } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
import game from './fixtures/countdown.js';

const setup = () => {
  const { window, document } = dom(), engine = createEngine(game), ui = createUiDom(engine, { root: document.body, doc: document });
  ui.sync(); return { window, document, engine, ui };
};
const q = (d, id) => d.querySelector(`[data-testid="${id}"]`);

test('title Play renders and a click moves the engine to race', () => {
  const { document, engine } = setup(); const b = q(document, 'title.play');
  assert.equal(b.textContent, 'Play'); assert.equal(b.tagName, 'BUTTON');
  b.click(); assert.equal(engine.scene.name, 'race');
  assert.equal(q(document, 'title.play'), null); // synced right after the click
  assert.equal(document.documentElement.getAttribute('data-lh-scene'), 'race');
});
test('race Pause is disabled until running; overlay gets its own container', () => {
  const { document, engine, ui } = setup(); engine.go('race'); ui.sync();
  assert.equal(q(document, 'race.pause').disabled, true);
  engine.scene.state.running = true; ui.sync(); assert.equal(q(document, 'race.pause').disabled, false);
  engine.overlay('pause'); ui.sync();
  assert.ok(document.querySelector('div[data-lh-overlay="pause"] [data-testid="pause.resume"]'));
  assert.equal(document.querySelector('[data-lh-ui="race"]').hasAttribute('data-lh-overlay'), false);
  assert.equal(document.documentElement.getAttribute('data-lh-overlays'), 'pause');
  engine.overlay('results'); ui.sync();
  assert.equal(document.documentElement.getAttribute('data-lh-overlays'), 'pause results');
  engine.close('results'); ui.sync();
  q(document, 'pause.resume').click(); assert.equal(document.querySelector('[data-lh-overlay="pause"]'), null);
});
test('clicking a covered/disabled control is swallowed', () => {
  const { document, engine, ui } = setup(); engine.go('race'); ui.sync();
  q(document, 'race.pause').click(); assert.equal(engine.scene.name, 'race');
});
test('sync with no change performs no DOM mutations', async () => {
  const { window, document, engine, ui } = setup(); engine.go('race'); engine.overlay('pause'); ui.sync();
  let n = 0; const mo = new window.MutationObserver(r => { n += r.length; }); mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  ui.sync(); ui.sync(); await new Promise(r => setTimeout(r, 10)); assert.equal(n, 0); mo.disconnect();
});

const slotGame = defineGame({ id: 'g', start: 't', scenes: {
  t: {
    enter(e, c) { Object.assign(c.state, { mode: 'a', seed: 's1', went: 0 }); },
    ui(u) {
      u.button({ id: 'go', label: 'Go', action: e => { e.scene.state.went++; } });
      u.choice({ id: 'mode', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], get: e => e.scene.state.mode, set: (v, e) => { e.scene.state.mode = v; } });
      u.field({ id: 'seed', label: 'Seed', get: e => e.scene.state.seed, set: (t, e) => { e.scene.state.seed = t; } });
    },
  },
  u: {},
} });
test('2c: [data-lh-slot] elements are adopted; content stays the game\'s (#18)', () => {
  const { window, document } = dom();
  document.body.innerHTML = '<div id="menu"><button data-lh-slot="t.go">🏁 Go</button><span data-lh-slot="t.mode.a">x</span><button data-lh-slot="t.mode.b">B!</button><input data-lh-slot="t.seed"></div>';
  const engine = createEngine(slotGame), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const go = document.querySelector('#menu button[data-testid="t.go"]');
  assert.ok(go); assert.equal(go.textContent, '🏁 Go');
  go.click(); assert.equal(engine.scene.state.went, 1);
  const a = document.querySelector('[data-testid="t.mode.a"]'); // a <span> slot can't be a button: created in the scene box
  assert.equal(a.tagName, 'BUTTON'); assert.equal(a.closest('#menu'), null); assert.equal(a.getAttribute('aria-pressed'), 'true');
  const b = document.querySelector('#menu [data-testid="t.mode.b"]'); assert.equal(b.textContent, 'B!'); assert.equal(b.getAttribute('aria-pressed'), 'false');
  b.click(); assert.equal(engine.scene.state.mode, 'b'); assert.equal(b.getAttribute('aria-pressed'), 'true');
  const seed = document.querySelector('#menu input[data-testid="t.seed"]'); assert.equal(seed.value, 's1');
  seed.value = 'zz'; seed.dispatchEvent(new window.Event('change', { bubbles: true })); assert.equal(engine.scene.state.seed, 'zz');
  engine.go('u'); ui.sync();
  assert.equal(go.isConnected, true); assert.equal(go.hasAttribute('data-testid'), false); assert.equal(go.disabled, true);
  go.click(); assert.equal(engine.scene.name, 'u'); // a released element no longer taps
});
test('2c: a created field renders as an input and Enter commits it', () => {
  const { window, document } = dom();
  const engine = createEngine(slotGame), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const f = document.querySelector('input[data-testid="t.seed"]');
  assert.equal(f.getAttribute('aria-label'), 'Seed'); assert.equal(f.value, 's1');
  f.focus(); f.value = 'qq'; f.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(engine.scene.state.seed, 'qq');
});

const hg = defineGame({ id: 'hold', start: 's', actions: actions({ gear: button() }), scenes: { s: {
  enter(e, ctx) { ctx.state.fired = 0; ctx.state.on = true; },
  ui(u) {
    u.hold({ id: 'wake', label: 'Wake up', seconds: 0.5, action: e => e.scene.state.fired++, when: e => e.scene.state.on });
    u.hold({ id: 'gear', label: 'Gear', seconds: 0.25, action: 'gear' });
  },
} } });
test('2d: a hold presses on pointerdown, shows --lh-progress and data-lh-down, releases on pointerup; a click is not a tap', () => {
  const { window, document } = dom(), errors = [], engine = createEngine(hg);
  const ui = createUiDom(engine, { root: document.body, doc: document, errors }); ui.sync();
  const b = document.querySelector('[data-testid="s.wake"]'); assert.equal(b.tagName, 'BUTTON');
  b.dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
  engine.stepN(15); ui.sync();
  assert.equal(b.style.getPropertyValue('--lh-progress'), '0.5'); assert.ok(b.hasAttribute('data-lh-down'));
  b.dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1, bubbles: true })); ui.sync();
  assert.equal(b.style.getPropertyValue('--lh-progress'), '0'); assert.equal(b.hasAttribute('data-lh-down'), false);
  b.click(); assert.deepEqual(errors, []); assert.equal(engine.scene.state.fired, 0);
});
test('2d: Space on a focused hold presses and releases', () => {
  const { window, document } = dom(), engine = createEngine(hg), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const b = document.querySelector('[data-testid="s.gear"]');
  b.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })); engine.stepN(5); ui.sync();
  assert.ok(b.hasAttribute('data-lh-down'));
  b.dispatchEvent(new window.KeyboardEvent('keyup', { key: ' ', bubbles: true })); ui.sync(); assert.equal(b.hasAttribute('data-lh-down'), false);
});

const fg = defineGame({ id: 'f', start: 's', scenes: {
  s: { enter(e, c) { Object.assign(c.state, { name: 'a', n: 0, pick: 'x' }); },
    ui(u) {
      u.field({ id: 'name', label: 'Name', get: e => e.scene.state.name, set: (t, e) => { e.scene.state.name = t; e.scene.state.n++; } });
      u.choice({ id: 'pick', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], get: e => e.scene.state.pick, set: (v, e) => { e.scene.state.pick = v; } });
    } },
  t: {},
} });
test('2d: IME Enter does not commit; Enter then change commits once; a focused field is not overwritten (E4 minors)', () => {
  const { window, document } = dom(), engine = createEngine(fg), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  const f = document.querySelector('[data-testid="s.name"]'), key = o => f.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...o }));
  f.focus(); f.value = 'b'; key({ isComposing: true }); assert.equal(engine.scene.state.n, 0);
  key({ keyCode: 229 }); assert.equal(engine.scene.state.n, 0);
  key({}); f.dispatchEvent(new window.Event('change', { bubbles: true })); assert.equal(engine.scene.state.n, 1); assert.equal(engine.scene.state.name, 'b');
  f.focus(); engine.scene.state.name = 'z'; ui.sync(); assert.equal(f.value, 'b');
  f.blur(); ui.sync(); assert.equal(f.value, 'z');
});
test('2d: a released adopted choice loses aria-pressed (E4 minor)', () => {
  const { document } = dom(); const slot = document.createElement('button'); slot.setAttribute('data-lh-slot', 's.pick.x'); document.body.appendChild(slot);
  const engine = createEngine(fg), ui = createUiDom(engine, { root: document.body, doc: document }); ui.sync();
  assert.equal(slot.getAttribute('aria-pressed'), 'true');
  engine.go('t'); ui.sync(); assert.equal(slot.hasAttribute('aria-pressed'), false); assert.equal(slot.disabled, true);
});
