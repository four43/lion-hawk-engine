// R-8 in the view: a steady frame (no scene change, no control change) allocates almost nothing in the render slot:
// reconcile, the DOM UI sync and the halves' frame calls (sampled; see helpers/alloc.mjs allocRate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';
import { allocRate } from './helpers/alloc.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const game = defineGame({ id: 'va', start: 'play', scenes: {
  play: { ui(u) {
    u.button({ id: 'go', label: 'Go', action: () => {}, when: e => e.time.step >= 0 });
    u.toggle({ id: 'sound', label: 'Sound', get: () => true, set: () => {} });
    u.hold({ id: 'quit', label: 'Hold to quit', seconds: 1, action: () => {} });
  } },
  hud: { ui(u) { u.button({ id: 'menu', label: 'Menu', action: () => {} }); } },
} });
test('a steady frame with a scene, an overlay and four controls allocates under 256 bytes in engine view code', async () => {
  const { document } = dom(), target = { document, addEventListener() {} };
  const app = boot(game, defineView({ scenes: { play: { frame() {} }, hud: { frame() {} } } }), { doc: document, target, raf: () => 0, caf: () => {}, flags: parseFlags('?lh-test') });
  try {
    app.hook.overlay('hud');
    const r = await allocRate(() => app.engine.render(0), 2000, { warm: 500, top: 8, within: SRC });
    assert.ok(r.inside < 256, `${Math.round(r.inside)} bytes per frame in engine code:\n${r.top.join('\n')}`);
  } finally { app.dispose(); }
});
