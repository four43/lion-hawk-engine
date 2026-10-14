// The World install wires the net part (3i integrator request 1): defineGame({ net: { world: true } }) needs no installNet call.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { headless } from '../testing/index.js';
import { defineGame } from '../src/index.sim.js';
import { installNet } from '../src/sim/net/install.js';
import { CART, CRATE, FLAG } from './net/fixtures/carts.js';
await RAPIER.init();

const game = world => defineGame({
  id: 'netless-setup', start: 'a', physics: { rapier: RAPIER },
  net: { kinds: [CART, CRATE, FLAG], world, maxSender: 4, codec: 'json', rates: { host: { reliable: 60, fast: 60, reliableFrames: 8 }, guest: { reliable: 60, fast: 240 } }, wire: { toHost: {}, toGuest: {} } },
  scenes: { a: {} },
});

test('3i: net.world installs the net part in createEngine and attaches it to every World', () => {
  const h = headless(game(true));
  assert.ok(h.engine.netPart, 'engine.netPart'); assert.equal(h.world.net, h.engine.netPart, 'world.net is the controller');
  assert.equal(installNet(h.engine), h.engine.netPart, 'a setup call stays idempotent');
  assert.equal(h.world.net.role, 'solo');
});
test('3i: without net.world there is no net part', () => {
  const h = headless(game(false));
  assert.equal(h.engine.netPart, undefined); assert.equal(h.world.net ?? null, null);
});
