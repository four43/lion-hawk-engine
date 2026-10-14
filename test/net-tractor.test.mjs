// test/net-tractor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from '../testing/index.js';
import { encodeRecord } from '../src/index.sim.js';
import farmlet, { TRAIN, spawnTrain } from './net/fixtures/farmlet.js';
await RAPIER.init();
const argsOf = i => ({ n: i + 1 });
const pose = () => ({ p: { x: 1, y: 0.6, z: 2 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 3 }, w: { x: 0, y: 0, z: 0 } });

test('3i: a Tractor-shaped train record: two F.body() fields, a rider list and 8 batched inputs is 101 bytes', () => {
  const rec = { body: pose(), trailer: pose(), mode: 'drive', riders: [], input: { s: 9, list: Array(8).fill({ thr: 0, steer: 0, horn: false }) } };
  assert.equal(encodeRecord(TRAIN, 2, rec).length, 2 + 26 + 26 + 1 + 1 + (4 + 1 + 8 * 5));
  assert.equal(TRAIN.remote, 'driven'); assert.deepEqual(TRAIN.bodies, ['body', 'trailer']);
});
test('3i: bodiless animals are interpolated by their kind\'s apply: smooth, about 100 ms behind (M-25)', () => {
  const w = mp(farmlet, { peers: 2, argsOf }); w.seconds(1);
  const a = w.guests[0].h.world.net.find('animal', 1), h = w.host.h.world.net.find('animal', 1), xs = [];
  for (let i = 0; i < 60; i++) { w.step(1); xs.push(a.x); }
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(Math.max(...steps) < 0.03, `smooth: at most ${Math.max(...steps)} m a step (records come every 50 ms in 1/64 m steps)`);
  assert.ok(h.x - a.x > 0.05 && h.x - a.x < 0.3, `behind by ${h.x - a.x} m at 1 m/s`);
  assert.equal(a.anim, 'walk'); assert.equal(a.xf, undefined, 'no pool slot: the game draws it');
});
test('3i: data-only host kinds (trees, players) replicate their fields', () => {
  const w = mp(farmlet, { peers: 2, argsOf }); w.seconds(1);
  const H = w.host.h.world.net, G = w.guests[0].h.world.net;
  H.find('tree', 7).state = 'broken'; H.find('player', 1).paint = 'blue'; w.seconds(0.4);
  assert.equal(G.find('tree', 7).state, 'broken'); assert.equal(G.find('player', 1).paint, 'blue');
});
test('3i: a train with a jointed trailer: the replica has both bodies, follows its owner, and leaves with it (Contract issue 1)', () => {
  const w = mp(farmlet, { peers: 2, argsOf }); w.seconds(2);
  const H = w.host.h.world, t = H.net.find('train', 2);
  assert.ok(t.trailer?.body, 'the trailer is a linked entity with its own body'); assert.equal(t.trailer.body.isDynamic(), true, 'driven: both dynamic');
  assert.deepEqual(w.diverged({ agree: { train: 0.1 } }), []);
  const tz = t.trailer.xf.p.z;
  w.seconds(1, (p, i) => i === 1 ? { thr: 1 } : null);
  assert.ok(t.trailer.xf.p.z > tz + 1, 'the replica\'s trailer is pulled by the hitch');
  const own = w.guests[0].h.world.net.find('train', 2);
  assert.ok(Math.hypot(own.trailer.xf.p.x - t.trailer.xf.p.x, own.trailer.xf.p.z - t.trailer.xf.p.z) < 0.5, 'the trailer agrees with its owner');
  const bodies = H.stats.bodies; w.drop(w.guests[0]); w.seconds(0.2);
  assert.equal(H.net.find('train', 2), undefined); assert.equal(H.stats.bodies, bodies - 2, 'train and trailer both go');
});
test('3i: after a guest\'s world.clear() a replicated train comes back with its trailer and hitch, before any new frame (CI-15)', () => {
  const w = mp(farmlet, { peers: 2, argsOf }); w.seconds(2);
  const g = w.guests[0], gw = g.h.world, old = gw.net.find('train', 1), tx = old.trailer.xf.p.x, tz = old.trailer.xf.p.z;
  w.blackout(1); gw.clear();
  gw.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [60, 0.5, 60], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'grass' }], at: [0, -0.5, 0] });
  g.engine.scene.state.train = spawnTrain(gw, 2); w.step(1);
  const t = gw.net.find('train', 1);
  assert.ok(t && t !== old && t.trailer?.body?.isDynamic(), 'train 1 and its trailer are back, driven');
  assert.ok(Math.hypot(t.trailer.xf.p.x - tx, t.trailer.xf.p.z - tz) < 0.1, 'where they were');
  assert.equal(gw.rapier.impulseJoints.len(), 2, 'its own hitch and the replica\'s, made again by spawned');
  assert.ok(gw.net.find('animal', 1) && gw.net.find('tree', 7) && gw.net.find('player', 1), 'bodiless and data kinds too');
});
