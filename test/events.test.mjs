import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvents } from '../src/core/events.js';

test('emit queues; flush delivers in order with seq and step', () => {
  let step = 5; const ev = createEvents({ now: () => step }), got = [];
  ev.on(e => got.push(`${e.seq}:${e.type}:${e.step}`));
  ev.emit('boop', { animal: 3 }); step = 6; ev.emit('land');
  assert.equal(ev.pending, 2); assert.deepEqual(got, []);
  const out = ev.flush();
  assert.deepEqual(got, ['1:boop:5', '2:land:6']); assert.equal(out[0].animal, 3); assert.equal(ev.pending, 0);
});
test('events emitted while flushing are delivered in the same flush', () => {
  const ev = createEvents(), got = [];
  ev.on(e => { got.push(e.type); if (e.type === 'a') ev.emit('b'); });
  ev.emit('a'); ev.flush();
  assert.deepEqual(got, ['a', 'b']);
});
test('off stops delivery', () => {
  const ev = createEvents(); let n = 0; const off = ev.on(() => n++);
  ev.emit('x'); ev.flush(); off(); ev.emit('x'); ev.flush(); assert.equal(n, 1);
});
test('since(seq) reads the ring log, oldest first, bounded by logSize', () => {
  const ev = createEvents({ logSize: 3 });
  for (const t of ['a', 'b', 'c', 'd']) ev.emit(t);
  ev.flush();
  assert.deepEqual(ev.since(0).map(e => e.type), ['b', 'c', 'd']);
  assert.deepEqual(ev.since(3).map(e => e.type), ['d']);
  assert.equal(ev.seq, 4);
});
test('payload keys cannot overwrite seq, step or type', () => {
  const ev = createEvents({ now: () => 4 });
  const e = ev.emit('a', { type: 'x', seq: 99, step: 7 });
  assert.equal(e.type, 'a'); assert.equal(e.seq, 1); assert.equal(e.step, 4);
});
test('a throwing listener drops delivered events, propagates, and keeps the rest queued', () => {
  const ev = createEvents(), got = [];
  let boom = true;
  ev.on(e => { got.push(e.type); if (boom && e.type === 'a') { boom = false; throw new Error('bad'); } });
  ev.emit('a'); ev.emit('b'); ev.emit('c');
  assert.throws(() => ev.flush(), /bad/);
  assert.equal(ev.pending, 2);
  assert.deepEqual(ev.since(0).map(e => e.type), ['a']);
  const out = ev.flush();
  assert.deepEqual(out.map(e => e.type), ['b', 'c']); assert.deepEqual(got, ['a', 'b', 'c']);
  assert.equal(ev.pending, 0); assert.deepEqual(ev.since(0).map(e => e.type), ['a', 'b', 'c']);
  assert.deepEqual(ev.flush(), []);
});
test('flush reuses one array, valid until the next flush (R-8)', () => {
  const ev = createEvents();
  ev.emit('a'); const first = ev.flush(); assert.equal(first.length, 1);
  ev.emit('b'); const second = ev.flush();
  assert.equal(second, first); assert.deepEqual(second.map(e => e.type), ['b']);
});
