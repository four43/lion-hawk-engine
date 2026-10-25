import test from 'node:test';
import assert from 'node:assert/strict';
import { mp, replay } from '../testing/index.js';
import relay from './fixtures/relay.js';
test('2f: mp() runs peers over one hub in lockstep; every engine\'s wall clock is the hub\'s (T-11, N-4)', () => {
  const w = mp(relay, { peers: 3 });
  w.seconds(1);
  assert.deepEqual(w.peers.map(p => p.name), ['host', 'guest1', 'guest2']);
  for (const p of w.peers) assert.equal(p.engine.time.wall, w.now);
  assert.ok(w.guests.every(g => g.engine.scene.state.log.some(c => c.type === 'guest.say')));
  const late = w.addPeer(); w.seconds(0.5); assert.equal(late.engine.time.wall, w.now);
});
test('2f: mp() latency, drop and settle', () => {
  const w = mp(relay, { peers: 2, link: { delay: 200 } });
  w.seconds(0.1); assert.equal(w.guests[0].engine.scene.state.log.some(c => c.type === 'guest.say'), false, 'nothing within 200 ms');
  const left = w.settle(x => x.guests[0].engine.scene.state.log.some(c => c.type === 'guest.say') ? [] : ['no say'], { maxSeconds: 1 });
  assert.deepEqual(left, []);
  // the hub drops at send time (N-2, M-53, unchanged from Tractor's link.js): what was already on the wire lands within the 200 ms delay
  const len = () => w.guests[0].engine.scene.state.log.length;
  w.hub.drop = () => true; const n0 = len(); w.seconds(0.25); assert.ok(len() > n0, 'in flight before the drop');
  const n = len(); w.seconds(0.5); assert.equal(len(), n);
});
test('2f: mp({ record: true }) gives each peer a tape that replays alone (T-9)', () => {
  const w = mp(relay, { peers: 2, record: true }); w.seconds(2);
  const g = w.guests[0], tape = g.h.tape();
  assert.ok(tape.log.some(x => x.ops?.some(o => o[0] === 'command' && o[1] === 'net.frame')));
  assert.equal(replay(relay, tape).checksum(), g.h.checksum());
});
test('2f: mp() passes args per peer, calls beforeStep before each peer\'s step and seeds the link from its seed', () => {
  const calls = [];
  const run = seed => { const w = mp(relay, { peers: 2, seed, link: { delay: 20, jitter: 100 }, argsOf: (i, name) => ({ who: name }) }); w.seconds(1); return w.guests[0].engine.scene.state.log.map(c => c.data.at ?? null); };
  const w = mp(relay, { peers: 2, argsOf: (i, name) => ({ who: name }), beforeStep: (p, i) => calls.push([p.name, i, p.engine.time.step]) });
  assert.deepEqual(w.peers.map(p => p.engine.scene.args), [{ who: 'host' }, { who: 'guest1' }]);
  w.step(2); assert.deepEqual(calls, [['host', 0, 0], ['guest1', 1, 0], ['host', 0, 1], ['guest1', 1, 1]]);
  assert.deepEqual(run(3), run(3), 'the same seed, the same jitter');
  assert.notDeepEqual(run(3), run(4), 'another seed, other jitter');
});
test('mp(): a peer added by a beforeStep waits for the next step', () => {
  let w; const added = [];
  w = mp(relay, { peers: 2, beforeStep: (p, i) => { if (i === 0 && p.engine.time.step === 1) added.push(w.addPeer()); } });
  w.step(2);
  assert.equal(added.length, 1); assert.equal(w.peers[2].engine.time.step, 0, 'not stepped in the pass that added it');
  w.step(1); assert.equal(w.peers[2].engine.time.step, 1);
});
