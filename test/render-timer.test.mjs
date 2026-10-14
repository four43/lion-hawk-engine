// 3e-R4 (#106): boot(game, view, { timer }) reaches the World: world.stats.stepMs is the timer's last Rapier step,
// with and without defineView({ render }), and never enters state(). Integrator cross-cutting test (3m, 0.8.0).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView } from '../src/view/boot.js';
import { parseFlags } from '../src/core/flags.js';
import { physGame } from './fixtures/phys/game.js';
import { dom } from './helpers/dom.mjs';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const apps = []; // P6: Rapier's WASM memory is not garbage collected; dispose every app and its World
afterEach(() => { for (const a of apps.splice(0)) { const w = a.engine.world; a.dispose(); if (w && !w.disposed) w.dispose(); } });

const crate = (e, ctx) => ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 10, 0], tags: ['c'] });
const start = render => {
  const { document } = dom(), target = { document, addEventListener() {}, removeEventListener() {} };
  let t = 0, renderer, canvas;
  if (render) { renderer = fakeRenderer(); canvas = document.createElement('canvas'); document.body.appendChild(canvas); renderer.domElement = canvas; }
  const view = defineView(render ? { scenes: {}, render } : { scenes: {} });
  const app = boot(physGame({ build: crate }), view, { doc: document, target, raf: () => 0, caf() {}, flags: parseFlags('?lh-test'),
    timer: () => (t += 0.25), renderer, canvas });
  apps.push(app);
  return app;
};

for (const render of [undefined, {}]) {
  test(`boot(…, { timer }) fills world.stats.stepMs ${render ? 'with' : 'without'} render; state() never carries it (3e-R4, #106)`, () => {
    const { engine } = start(render);
    engine.stepN(4);
    assert.equal(engine.world.stats.stepMs, 0.25);
    assert.equal(engine.world.stats.stepMsTotal, 1);
    assert.equal(JSON.stringify(engine.state()).includes('stepMs'), false);
  });
}
