// [T-7] h.snapshot(), h.restore(snap), h.fork(): built on the tape, so they need record: true. A restore or fork replays
// the tape and checks the checksum, so a change made outside the tape is caught instead of silently lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/index.js';
import game from './fixtures/countdown.js';

const drive = h => { h.tap('title.play'); h.step(120); h.command('nudge', { dx: 2 }); h.step(30, { throttle: 0.5 }); return h; };

test('restore puts the handle back where the snapshot was, in place (T-7)', () => {
  const h = drive(headless(game, { seed: 5, record: true }));
  const snap = h.snapshot(), sum = h.checksum(), state = h.state(), seq = h.mark();
  h.step(200, { throttle: 1 });
  assert.notEqual(h.checksum(), sum);
  assert.equal(h.restore(snap), h, 'the same handle');
  assert.equal(h.checksum(), sum); assert.deepEqual(h.state(), state); assert.equal(h.time.step, snap.step);
  assert.equal(h.mark(), seq, 'the event log is the one the snapshot had');
  h.step(200, { throttle: 1 });
  const again = drive(headless(game, { seed: 5, record: true })).step(200, { throttle: 1 });
  assert.equal(h.checksum(), again.checksum(), 'stepping on after a restore matches a fresh run');
});
test('fork is a second handle from the same point; the two run apart', () => {
  const h = drive(headless(game, { seed: 5, record: true })), f = h.fork();
  assert.notEqual(f, h); assert.equal(f.checksum(), h.checksum()); assert.equal(f.time.step, h.time.step);
  f.step(60, { throttle: 1 }); h.step(60, { throttle: -1 });
  assert.notEqual(f.checksum(), h.checksum());
  assert.equal(f.fork().checksum(), f.checksum(), 'a fork records too, so it forks again');
});
test('a snapshot is plain JSON and survives a round trip', () => {
  const h = drive(headless(game, { record: true })), snap = JSON.parse(JSON.stringify(h.snapshot())), sum = h.checksum();
  h.step(10); h.restore(snap); assert.equal(h.checksum(), sum);
});
test('snapshot needs record: true; a change outside the tape fails the restore; a snapshot of another game is refused', () => {
  assert.throws(() => headless(game).snapshot(), /headless: snapshot needs record: true/);
  const h = headless(game, { scene: 'race', record: true }); h.step(10);
  h.engine.scene.state.x = 40; // not on the tape
  const snap = h.snapshot();
  assert.throws(() => h.restore(snap), /headless: restore: the replayed state differs from the snapshot \(checksum .+ vs .+\): something changed outside the tape/);
  assert.throws(() => h.restore({ v: 9 }), /headless: restore: not a snapshot/);
  assert.throws(() => h.restore({ ...h.snapshot(), tape: { ...h.snapshot().tape, game: 'other' } }), /replay: tape is for 'other'/);
});
test('h.checksum({ parts: "sim" }) is the default checksum; other parts are refused', () => {
  const h = headless(game).step(3);
  assert.equal(h.checksum({ parts: 'sim' }), h.checksum());
  assert.throws(() => h.checksum({ parts: 'view' }), /headless: checksum parts must be 'sim'/);
});
