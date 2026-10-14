// #100, #95 through window.engine: the live commands object (Playwright's untilLoaded reads pending in the page) and
// overlay options.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';
const raf = () => 0, caf = () => {};

test('#100, #95: window.engine exposes commands.pending and passes overlay options through', () => {
  const g = defineGame({ id: 'hc', start: 's', commands: { ping() {} }, scenes: { s: {}, card: {} } });
  const { document } = dom(), target = { document, addEventListener() {} };
  const app = boot(g, defineView({ scenes: {} }), { doc: document, target, raf, caf, flags: parseFlags('?lh-test') });
  try {
    target.engine.command('ping', {}); assert.equal(target.engine.commands.pending, 1);
    target.engine.stepN(1); assert.equal(target.engine.commands.pending, 0);
    target.engine.overlay('card', { n: 1 }); target.engine.overlay('card', { n: 2 }, { once: true });
    assert.deepEqual(app.engine.scene.overlayArgs('card'), { n: 1 });
  } finally { app.dispose(); }
});
