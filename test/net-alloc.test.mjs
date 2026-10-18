// R-8 for the net part: engine code's short-lived garbage per step of a two-peer game (both engines, the hub between them),
// sampled with allocRate. The test harness (testing/: invariants, the hub's copies) and Rapier's internals are not counted.
// Measured at 0.11.2: about 7.9 KB (14.2 KB before R-8 work on the net path). What is left is mostly needed: a contact event
// payload per resting cart per step (the fixture's contacts.min of 1 N·s fires on gravity alone), the records each received
// frame decodes into (the store keeps them), and Rapier's own wrappers in the contact queries the engine makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import carts from './net/fixtures/carts.js';
import { allocRate } from './helpers/alloc.mjs';
await RAPIER.init();

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
test('a step of two peers driving carts allocates under 9 KB of engine code per engine', async () => {
  const w = mp(carts, { peers: 2, argsOf: i => ({ n: i + 1 }) }); w.seconds(1.5);
  const r = await allocRate(() => w.step(1, (p, k) => k === 1 ? { thr: -1 } : null), 600, { warm: 120, top: 12, within: SRC });
  const perEngine = r.inside / 2;
  assert.ok(perEngine < 9216, `${Math.round(perEngine)} bytes per engine per step:\n${r.top.join('\n')}`);
});
