// #105: the args an overlay opened with are readable from engine.scene (its view half needs them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';

test('#105: overlayArgs returns the open overlay\'s ctx.args, undefined otherwise', () => {
  let ctxArgs;
  const g = defineGame({ id: 'oa', start: 'm', scenes: { m: {}, sleep: { enter(e, ctx) { ctxArgs = ctx.args; } }, card: {} } });
  const e = createEngine(g, { args: { farm: 1 } });
  e.overlay('sleep', { quiet: true }); e.overlay('card');
  assert.equal(e.scene.overlayArgs('sleep'), ctxArgs);
  assert.deepEqual(e.scene.overlayArgs('sleep'), { quiet: true });
  assert.equal(e.scene.overlayArgs('card'), undefined); // opened without args
  assert.equal(e.scene.overlayArgs('m'), undefined); // the main scene is not an overlay: engine.scene.args
  assert.deepEqual(e.scene.args, { farm: 1 });
  e.close('sleep'); assert.equal(e.scene.overlayArgs('sleep'), undefined);
});

test('#105: overlayArgs is one function on the same scene view across steps; recording gives the logged copy', () => {
  const g = defineGame({ id: 'oa', start: 'm', scenes: { m: {}, sleep: {} } });
  const e = createEngine(g, { record: true }), view = e.scene, f = e.scene.overlayArgs;
  const mine = { quiet: false };
  e.overlay('sleep', mine); e.stepN(3);
  assert.equal(e.scene, view); assert.equal(e.scene.overlayArgs, f);
  assert.deepEqual(e.scene.overlayArgs('sleep'), mine);
  assert.notEqual(e.scene.overlayArgs('sleep'), mine); // the copy the scene received, not the caller's object
});
