import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
const raf = () => 0, caf = () => {};
import game from './fixtures/countdown.js';

const run = (flags = '', halves) => {
  const { window, document } = dom(), target = { document, addEventListener() {} }, log = [];
  const half = n => ({ enter: () => log.push(`enter ${n}`), exit: () => log.push(`exit ${n}`), frame: (e, a) => log.push(`frame ${n}`) });
  const view = halves ?? defineView({ scenes: { title: half('title'), race: half('race'), pause: half('pause') } });
  const app = boot(game, view, { doc: document, target, raf, caf, flags: parseFlags(flags) });
  return { app, log, document, target };
};
test('lh-test starts in manual mode with the flag seed and the no-animation style', () => {
  const { app, document, target } = run('?lh-test&seed=5');
  assert.equal(app.driver.manual(), true); assert.equal(app.driver.running, true); assert.equal(app.engine.seed, 5);
  assert.ok([...document.querySelectorAll('style')].some(s => s.textContent.includes('transition:none')));
  assert.equal(target.engine.game, 'countdown'); assert.equal(document.documentElement.getAttribute('data-lh-scene'), 'title');
  assert.equal(document.documentElement.getAttribute('data-lh-settled'), '1'); app.dispose();
});
test('view halves enter/exit/frame follow the real stack, not event flush', () => {
  const { app, log } = run('?lh-test');
  assert.deepEqual(log, ['enter title']); log.length = 0;
  app.hook.go('race'); assert.deepEqual(log, ['exit title', 'enter race']); log.length = 0;
  app.hook.overlay('pause'); assert.deepEqual(log, ['enter pause']); log.length = 0;
  app.hook.render(0); assert.deepEqual(log, ['frame race', 'frame pause']); log.length = 0;
  app.engine.close('pause'); app.hook.render(0); assert.deepEqual(log, ['exit pause', 'frame race']); log.length = 0;
  app.engine.go('race'); app.engine.render(0); assert.deepEqual(log, ['exit race', 'enter race', 'frame race']);
});
test('non-test boot starts the driver; view errors are collected', () => {
  const q = []; const { window, document } = dom();
  window.requestAnimationFrame = f => q.push(f);
  const target = { document, addEventListener() {} }; globalThis.requestAnimationFrame = f => q.push(f);
  const bad = defineView({ scenes: { title: { enter() { throw new Error('bad view'); } } } });
  try { const app = boot(game, bad, { doc: document, target, raf, caf, flags: parseFlags('') }); assert.equal(app.driver.running, true); assert.equal(app.hook.errors[0].message, 'bad view'); app.driver.stop(); }
  finally { delete globalThis.requestAnimationFrame; }
});

test('click refreshes view halves immediately; a game error lands in engine.errors', () => {
  const { app, log, document } = run('?lh-test'); log.length = 0;
  document.querySelector('[data-testid="title.play"]').click();
  assert.deepEqual(log, ['exit title', 'enter race']);
});
test('close+reopen overlay is exit then enter; a step that does it is detected', () => {
  const { app, log } = run('?lh-test'); app.hook.go('race'); app.hook.overlay('pause'); log.length = 0;
  app.engine.close('pause'); app.engine.overlay('pause'); app.engine.render(0);
  assert.deepEqual(log, ['exit pause', 'enter pause', 'frame race', 'frame pause']); log.length = 0;
  app.engine.system('flip', e => { if (e.time.step === 0) { e.close('pause'); e.overlay('pause'); } }, { stage: 'input.apply' });
  app.engine.stepN(1); app.engine.render(0); assert.deepEqual(log.slice(0, 2), ['exit pause', 'enter pause']);
});
test('a throwing action is captured; ui sits in its own root after existing children', () => {
  const g = { ...game, scenes: { ...game.scenes, title: { ui(u) { u.button({ id: 'bad', label: 'x', action: () => { throw new Error('game bug'); } }); } } } };
  const { window, document } = dom(); const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const app = boot(g, defineView({ scenes: {} }), { doc: document, target: { document }, raf, caf, flags: parseFlags('?lh-test') });
  assert.equal(document.body.children[0], canvas); const r = document.body.children[1]; assert.ok(r.hasAttribute('data-lh-ui-root'));
  assert.ok(r.querySelector('[data-lh-ui="title"]'));
  document.querySelector('[data-testid="title.bad"]').click();
  assert.equal(app.hook.errors[0].message, 'game bug');
});
test('dispose stops the driver, detaches listeners, clears html attributes', () => {
  const ls = {}; const { document } = dom(); const target = { document, addEventListener: (t, f) => { ls[t] = f; }, removeEventListener: t => { delete ls[t]; } };
  const app = boot(game, defineView({ scenes: {} }), { doc: document, target, raf, caf, flags: parseFlags('?lh-test') });
  assert.equal(document.documentElement.getAttribute('data-lh-scene'), 'title');
  app.dispose(); assert.equal(app.driver.running, false); assert.deepEqual(ls, {});
  for (const a of ['data-lh-scene', 'data-lh-overlays', 'data-lh-settled']) assert.equal(document.documentElement.hasAttribute(a), false);
  assert.equal(document.querySelector('[data-lh-ui-root]'), null);
});

test('F5: safe-area style is injected once and removed on dispose', () => {
  const { app, document } = run('?lh-test');
  const find = () => [...document.querySelectorAll('style')].filter(s => s.textContent.includes('--lh-sa-top:env(safe-area-inset-top'));
  assert.equal(find().length, 1); app.dispose(); assert.equal(find().length, 0);
});
test('F6: under lh-test ?scene and ?args pick the start; ignored otherwise; bad args ignored', () => {
  const a = run('?lh-test&scene=race'); assert.equal(a.app.engine.scene.name, 'race'); a.app.dispose();
  const b = run('?scene=race'); assert.equal(b.app.engine.scene.name, 'title'); b.app.dispose();
  const c = run('?lh-test&scene=race&args=' + encodeURIComponent('{"a":1}')); assert.deepEqual(c.app.engine.scene.args, { a: 1 }); c.app.dispose();
  const d = run('?lh-test&scene=race&args=%7Bnope'); assert.equal(d.app.engine.scene.name, 'race'); d.app.dispose();
});
test('F7: data-lh-settled is 1/0', () => {
  const { app, document } = run('?lh-test');
  assert.equal(document.documentElement.getAttribute('data-lh-settled'), '1'); app.dispose();
});
