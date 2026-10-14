// test/net-replay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp, replay } from '../testing/index.js';
import carts from './net/fixtures/carts.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });

test('3i: every peer\'s tape of the bump replays alone, bit for bit (#78, T-9, N-4)', () => {
  const w = mp(carts, { peers: 2, argsOf, record: true, link: { delay: 80, loss: 0.02 } });
  w.seconds(1.5); w.seconds(2, (p, i) => ({ thr: i === 0 ? 1 : -1 }));
  for (const p of w.peers) assert.equal(replay(carts, p.h.tape()).checksum(), p.h.checksum(), p.name);
});
test('3i: the same seed gives the same run on every peer, with jitter and loss (determinism with the net part)', () => {
  const run = () => {
    const w = mp(carts, { peers: 3, argsOf, seed: 7, link: { delay: 80, jitter: 20, loss: 0.02 } }), sums = [];
    for (let i = 0; i < 6; i++) { w.seconds(0.5, (p, k) => ({ thr: k === 1 ? -1 : k === 0 ? 1 : 0 })); sums.push(w.peers.map(p => p.h.checksum())); }
    return sums;
  };
  const a = run(); assert.deepEqual(run(), a);
  assert.notEqual(a[5][0], a[0][0], 'the world moved (the checksum covers the World digest)');
});
