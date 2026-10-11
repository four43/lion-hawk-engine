import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { dom } from './helpers/dom.mjs';
import game from './fixtures/countdown.js';

const run = (flags = '', halves) => {
  const { window, document } = dom(), target = { document, addEventListener() {} }, log = [];
  const half = n => ({ enter: () => log.push(`enter ${n}`), exit: () => log.push(`exit ${n}`), frame: (e, a) => log.push(`frame ${n}`) });
  const view = halves ?? defineView({ scenes: { title: half('title'), race: half('race'), pause: half('pause') } });
  const app = boot(game, view, { doc: document, target, flags: parseFlags(flags) });
  return { app, log, document, target };
};
test('lh-test starts in manual mode with the flag seed and the no-animation style', () => {
  const { app, document, target } = run('?lh-test&seed=5');
  assert.equal(app.driver.manual(), true); assert.equal(app.driver.running, false); assert.equal(app.engine.seed, 5);
  assert.ok([...document.querySelectorAll('style')].some(s => s.textContent.includes('transition:none')));
  assert.equal(target.engine.game, 'countdown'); assert.equal(document.documentElement.getAttribute('data-lh-scene'), 'title');
  assert.equal(document.documentElement.getAttribute('data-lh-settled'), 'true');
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
  try { const app = boot(game, bad, { doc: document, target, flags: parseFlags('') }); assert.equal(app.driver.running, true); assert.equal(app.hook.errors[0].message, 'bad view'); app.driver.stop(); }
  finally { delete globalThis.requestAnimationFrame; }
});
