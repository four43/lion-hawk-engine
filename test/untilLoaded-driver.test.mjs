// #100: the Playwright driver's untilLoaded steps once for commands pending at the call (in-page loop, fake page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameDriver, presets } from 'lion-hawk/playwright';

// a stand-in for window.engine: a command pending now starts a load at the next step, active for `load` more steps
const fakeEngine = ({ pending = 0, load = 0 } = {}) => {
  const e = {
    time: { step: 0 }, loading: { active: false, phase: '', blocks: [] }, commands: { pending }, left: 0,
    scene: { name: 's', overlays: [] }, events: { since: () => [] }, render() {}, state: () => ({ step: e.time.step }),
    stepN() {
      e.time.step++;
      if (e.commands.pending > 0) { e.commands.pending = 0; e.left = load; e.loading.active = load > 0; }
      else if (e.loading.active && --e.left <= 0) e.loading.active = false;
    },
  };
  return e;
};
const driverOn = e => gameDriver({
  page: { evaluate: async (fn, arg) => { globalThis.window = { engine: e }; try { return fn(arg); } finally { delete globalThis.window; } } },
  context: {}, preset: presets.desktop, presetName: 'desktop',
});

test('#100: untilLoaded right after a command waits for the load that command starts', async () => {
  const e = fakeEngine({ pending: 1, load: 3 });
  assert.equal(await driverOn(e).untilLoaded(), 4); // step 1 delivers and starts the load; it ends on step 4
  assert.equal(e.time.step, 4); assert.equal(e.loading.active, false);
});

test('#100: nothing pending returns at once; a command that starts no load costs one step', async () => {
  const idle = fakeEngine();
  assert.equal(await driverOn(idle).untilLoaded(), 0); assert.equal(idle.time.step, 0);
  const tick = fakeEngine({ pending: 1, load: 0 });
  assert.equal(await driverOn(tick).untilLoaded(), 1);
});
