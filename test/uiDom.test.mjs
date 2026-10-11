import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, createUiDom } from '../src/index.view.js';
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
