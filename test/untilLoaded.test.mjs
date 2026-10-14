// #100: untilLoaded right after a command: the command only queues (I-7), so untilLoaded must step once to deliver it
// before judging engine.loading. It does not wait for commands issued by the steps it takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineGame } from '../src/index.sim.js';
import { headless } from '../testing/index.js';

const loadGame = () => defineGame({
  id: 'ul', start: 's',
  commands: { tick: () => {} },
  scenes: { s: { enter(e, ctx) {
    ctx.state.builds = 0;
    ctx.command('reload', (en, d, c) => { c.load({ hold: 0.05, build: () => { c.state.builds++; } }); }); // 3 steps at 60 Hz
  } } },
  state: e => ({ builds: e.scene.state.builds ?? 0 }),
});

test('#100: untilLoaded right after a command steps until the load that command starts has finished', () => {
  const h = headless(loadGame());
  h.command('reload');
  const { steps } = h.untilLoaded();
  assert.equal(steps, 3); // step 1 delivers and starts it; the build lands on step 3
  assert.equal(h.state().builds, 1); assert.equal(h.engine.loading.active, false);
});

test('#100: with nothing pending untilLoaded returns at once; a command that starts no load costs one step', () => {
  const h = headless(loadGame());
  assert.equal(h.untilLoaded().steps, 0); assert.equal(h.time.step, 0);
  h.command('tick');
  assert.equal(h.untilLoaded().steps, 1); assert.equal(h.engine.commands.pending, 0);
});

test('#100: commands that the stepped systems issue themselves do not hold untilLoaded', () => {
  const g = defineGame({ id: 'busy', start: 's', commands: { tick: () => {} }, setup(e) { e.system('chatter', en => { en.command('tick'); }); }, scenes: { s: {} } });
  const h = headless(g); h.step(1);
  assert.equal(h.engine.commands.pending, 1); // issued in the step, delivered at the next one
  assert.equal(h.untilLoaded({ maxSteps: 5 }).steps, 1);
});
