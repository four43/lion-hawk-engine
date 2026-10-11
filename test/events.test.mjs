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
