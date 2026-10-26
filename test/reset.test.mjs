// #108: a game's reset() puts module tunables back before every engine starts, so a tape with a `tune` command replays
// exactly even after the recording run left the constants tuned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';
import { headless, replay } from '../testing/index.js';

const T = { speed: 1 }; // a game's module-level feel constants
const tuned = () => defineGame({
  id: 'tune', start: 's',
  reset() { T.speed = 1; },
  commands: { tune: (e, d) => { T.speed = d.speed; } },
  scenes: { s: { enter(e, ctx) { ctx.state.x = 0; }, step(e, dt, ctx) { ctx.state.x += T.speed * dt; } } },
  state: e => ({ x: e.scene.state.x }),
});

test('#108: a tape with a tune command replays exactly although the recording left the constant tuned', () => {
  const g = tuned(), h = headless(g, { record: true });
  h.step(60); h.command('tune', { speed: 3 }); h.step(60);
  const tape = h.tape();
  assert.equal(T.speed, 3); // the recording run leaves the constant tuned
  replay(g, tape); // without reset, the replay runs its first 60 steps at speed 3 and throws at step 60
  assert.equal(T.speed, 3); // the replayed command tuned it again
  T.speed = 1;
});

test('#108: reset runs first in every createEngine, before setup and the start scene', () => {
  const order = [];
  const g = defineGame({ id: 'r', start: 's', reset() { order.push('reset'); }, setup() { order.push('setup'); }, scenes: { s: { enter() { order.push('enter'); } } } });
  createEngine(g); createEngine(g);
  assert.deepEqual(order, ['reset', 'setup', 'enter', 'reset', 'setup', 'enter']);
});

test('#108: defineGame rejects a non-function reset; a throwing reset stops createEngine before the start scene', () => {
  assert.throws(() => defineGame({ id: 'r', start: 's', reset: 1, scenes: { s: {} } }), /defineGame: reset must be a function/);
  let entered = false;
  const g = defineGame({ id: 'r', start: 's', reset() { throw new Error('reset boom'); }, scenes: { s: { enter() { entered = true; } } } });
  assert.throws(() => createEngine(g), /reset boom/);
  assert.equal(entered, false);
});
