// #105: view halves receive their scene's args on enter (main scene: engine.scene.args; overlay: overlayArgs(name)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';
const raf = () => 0, caf = () => {};

const setup = () => {
  const got = [], { document } = dom(), target = { document, addEventListener() {} };
  const g = defineGame({ id: 'va', start: 'farm', scenes: { farm: {}, sleep: {} } });
  const half = n => ({ enter: (e, v, a) => got.push([n, a]) });
  const app = boot(g, defineView({ scenes: { farm: half('farm'), sleep: half('sleep') } }), { doc: document, target, raf, caf, flags: parseFlags('?lh-test'), args: { seed: 7 } });
  return { app, got };
};

test('#105: the main scene\'s and an overlay\'s view halves get their args on enter', () => {
  const { app, got } = setup();
  try {
    app.hook.overlay('sleep', { quiet: true });
    assert.deepEqual(got, [['farm', { seed: 7 }], ['sleep', { quiet: true }]]);
  } finally { app.dispose(); }
});

test('#105: a reopened overlay and a re-entered main scene get their new args', () => {
  const { app, got } = setup();
  try {
    app.hook.overlay('sleep', { quiet: true }); app.hook.close('sleep'); app.hook.overlay('sleep', { quiet: false });
    app.hook.go('farm', { seed: 9 });
    assert.deepEqual(got, [['farm', { seed: 7 }], ['sleep', { quiet: true }], ['sleep', { quiet: false }], ['farm', { seed: 9 }]]);
  } finally { app.dispose(); }
});
