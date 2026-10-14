// #95: overlay(name, args, { once: true }) is a no-op when the overlay is open or pending, so a game reaching one overlay
// from a cue, a command and a hold needs no isOpen guard. Judged on the projected stack; never recorded when it is a no-op.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, defineGame } from '../src/index.sim.js';
import { headless, replay } from '../testing/index.js';

const cardGame = (enters, main = {}) => defineGame({ id: 'once', start: 'm', scenes: { m: main, card: { enter(e, ctx) { enters.push(ctx.args); } } } });

test('#95: once on an open overlay is a no-op; without it the duplicate still throws', () => {
  const enters = [], e = createEngine(cardGame(enters));
  e.overlay('card', { n: 1 });
  assert.equal(e.overlay('card', { n: 2 }, { once: true }), e);
  assert.deepEqual(enters, [{ n: 1 }]);
  assert.deepEqual(e.scene.overlays, ['card']);
  assert.throws(() => e.overlay('card', { n: 3 }), /scene 'card' is already open/);
  assert.throws(() => e.overlay('card', { n: 4 }, { once: false }), /scene 'card' is already open/);
});

test('#95: two once requests in one step open the overlay once (the second sees it pending)', () => {
  const enters = [];
  const e = createEngine(cardGame(enters, { step(en) { en.overlay('card', { n: 1 }, { once: true }); en.overlay('card', { n: 2 }, { once: true }); } }));
  e.stepN(1); assert.deepEqual(enters, [{ n: 1 }]); assert.deepEqual(e.scene.overlays, ['card']);
  e.stepN(1); assert.deepEqual(enters, [{ n: 1 }]); // already open: still a no-op
});

test('#95: a once request after a queued close reopens the overlay (projected stack, not the live one)', () => {
  const enters = []; let k = 0;
  const e = createEngine(cardGame(enters, { step(en) { k++; if (k === 1) en.overlay('card', { n: 1 }); if (k === 2) { en.close('card'); en.overlay('card', { n: 9 }, { once: true }); } } }));
  e.stepN(2);
  assert.deepEqual(enters, [{ n: 1 }, { n: 9 }]); assert.deepEqual(e.scene.overlays, ['card']);
});

test('#95: a no-op once is not recorded and the tape replays; bad options throw', () => {
  const enters = [], g = cardGame(enters), h = headless(g, { record: true });
  h.overlay('card', { n: 1 }); h.overlay('card', { n: 2 }, { once: true }); h.step(60);
  const tape = h.tape();
  assert.deepEqual(tape.log, [{ step: 0, ops: [['overlay', 'card', { n: 1 }]] }]);
  assert.deepEqual(replay(g, tape).scene.overlays, ['card']);
  const e = createEngine(g);
  assert.throws(() => e.overlay('card', {}, 'x'), /engine: overlay options must be an object/);
  assert.throws(() => e.overlay('card', {}, { once: 1 }), /engine: overlay once must be a boolean/);
  assert.throws(() => e.overlay('nope', {}, { once: true }), /no scene 'nope'/);
});
