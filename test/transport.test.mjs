// test/transport.test.mjs: the transports of lion-hawk/net (N-1, N-2)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHub, parseLag, withLag, roomLink, emitter } from '../src/index.net.js';
import { rng } from '../src/index.sim.js';

const record = net => { const log = []; for (const e of ['peer', 'message', 'peerAway', 'peerBack', 'peerLeft', 'hostAway', 'hostBack', 'closed']) net.on(e, (...a) => log.push([e, ...a])); return log; };

test('the hub connects a host and guests in a star; messages arrive after the delay (M-20)', () => {
  const hub = createMemoryHub({ delay: 100 }), h = hub.host(), hl = record(h), g = hub.join(), gl = record(g), g2 = hub.join();
  hub.tick(0);
  assert.deepEqual(hl.filter(e => e[0] === 'peer').map(e => e[1]), [g.id, g2.id]);
  assert.deepEqual(gl.filter(e => e[0] === 'peer').map(e => e[1]), [h.id]);
  g.send(h.id, { t: 'hello' }, true); g.send(g2.id, { t: 'nope' }, true); // guests reach only the host
  hub.tick(99); assert.equal(hl.filter(e => e[0] === 'message').length, 0);
  hub.tick(100); assert.deepEqual(hl.filter(e => e[0] === 'message').map(e => e.slice(1)), [[g.id, { t: 'hello' }, true]]);
});
test('binary data is copied, and the reliable channel keeps the order under jitter (M-21)', () => {
  const hub = createMemoryHub({ delay: 50, jitter: 200, rng: rng(4).next }), h = hub.host(), g = hub.join(), bin = [], rel = []; // the hub takes a () => number
  h.on('message', (from, d, r) => r ? rel.push(d.n) : bin.push(new Uint8Array(d)[0]));
  hub.tick(0);
  const b = new Uint8Array([7]).buffer; g.send(h.id, b); new Uint8Array(b)[0] = 9; // the sender changes its buffer afterwards
  for (let n = 0; n < 20; n++) g.send(h.id, { n }, true);
  hub.tick(1000);
  assert.deepEqual(bin, [7], 'the copy, not the changed buffer'); assert.deepEqual(rel, Array.from({ length: 20 }, (_, n) => n));
});
test('loss drops only fast-channel messages', () => {
  const hub = createMemoryHub({ loss: 1 }), h = hub.host(), g = hub.join(); let fast = 0, rel = 0;
  h.on('message', (f, d, r) => r ? rel++ : fast++); hub.tick(0);
  for (let i = 0; i < 10; i++) { g.send(h.id, new ArrayBuffer(1)); g.send(h.id, { i }, true); }
  hub.tick(10); assert.equal(fast, 0); assert.equal(rel, 10);
});
test('away, back, leave and the host leaving (M-39, M-40)', () => {
  const hub = createMemoryHub(), h = hub.host(), hl = record(h), g = hub.join(), gl = record(g); hub.tick(0);
  hub.away(g.id); hub.tick(1); assert.ok(hl.some(e => e[0] === 'peerAway' && e[1] === g.id));
  g.send(h.id, { t: 'lost' }, true); hub.tick(2); assert.ok(!hl.some(e => e[0] === 'message'), 'an away device sends nothing');
  hub.back(g.id); hub.tick(3); assert.ok(hl.some(e => e[0] === 'peerBack'));
  hub.away(h.id); hub.tick(4); assert.ok(gl.some(e => e[0] === 'hostAway'));
  hub.back(h.id); hub.tick(5); assert.ok(gl.some(e => e[0] === 'hostBack'));
  g.leave(); hub.tick(6); assert.ok(hl.some(e => e[0] === 'peerLeft' && e[1] === g.id && e[2] === 'left')); assert.ok(gl.some(e => e[0] === 'closed' && e[1] === 'left'));
  const g2 = hub.join(), g2l = record(g2); hub.tick(7); hub.leave(h.id, 'left'); hub.tick(8); assert.ok(g2l.some(e => e[0] === 'closed' && e[1] === 'host_left'));
});
test('parseLag reads ?lag=ms[,jitter[,loss%]] and clamps it (M-28)', () => {
  assert.deepEqual(parseLag('300'), { delay: 300, jitter: 0, loss: 0 });
  assert.deepEqual(parseLag('300,80,5'), { delay: 300, jitter: 80, loss: 0.05 });
  assert.deepEqual(parseLag('99999,99999,99'), { delay: 5000, jitter: 2000, loss: 0.5 });
  for (const bad of [null, '', 'abc', '-5', '1,x']) assert.equal(parseLag(bad), null, String(bad));
});
test('withLag delays sends and received messages on this device (M-28)', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), timers = [];
  const timer = (fn, ms) => timers.push({ fn, ms }), lg = withLag(g, { delay: 300, jitter: 0, loss: 0 }, { timer });
  let got = 0; h.on('message', () => got++); hub.tick(0);
  lg.send(h.id, { a: 1 }, true); hub.tick(1); assert.equal(got, 0); assert.equal(timers[0].ms, 300);
  timers.shift().fn(); hub.tick(2); assert.equal(got, 1);
  let back = 0; lg.on('message', () => back++); h.send(g.id, { b: 1 }, true); hub.tick(3); assert.equal(back, 0); timers.shift().fn(); assert.equal(back, 1);
});
test('roomLink turns a handshake room into a net', () => {
  const room = Object.assign(emitter(), { isHost: false, you: 'g1', hostId: 'h1', peers: new Map(), leave() { this.left = true; } });
  const peer = Object.assign(emitter(), { id: 'h1', open: true, sent: [], send(d, o) { this.sent.push([d, o.reliable]); } });
  const net = roomLink(room), log = record(net);
  room.peers.set('h1', peer); room.emit('peer', peer);
  peer.emit('message', { t: 'welcome' }, { reliable: true });
  net.send('h1', { t: 'claim' }, true); net.send('nobody', { t: 'x' }, true); net.send('h1', { t: 'json on the fast channel' }, false);
  room.emit('hostAway', 30); room.emit('closed', 'kicked'); net.leave();
  assert.deepEqual(log.map(e => e[0]), ['peer', 'message', 'hostAway', 'closed']);
  assert.deepEqual(log[1], ['message', 'h1', { t: 'welcome' }, true]);
  assert.deepEqual(peer.sent, [[{ t: 'claim' }, true]]); assert.ok(room.left);
});
test('roomLink hands binary to the sync layer as an exact ArrayBuffer and swallows send failures (M-44)', () => {
  const room = Object.assign(emitter(), { isHost: true, you: 'h1', hostId: 'h1', peers: new Map(), leave() {} });
  const peer = Object.assign(emitter(), { id: 'g1', open: true, send() { throw new TypeError('boom'); } });
  const net = roomLink(room), log = record(net), warn = console.warn; console.warn = () => {};
  try {
    room.peers.set('g1', peer); room.emit('peer', peer);
    const big = new Uint8Array([0, 1, 2, 3, 4, 5]), view = big.subarray(2, 5);
    peer.emit('message', view, { reliable: false }); peer.emit('message', big.buffer.slice(1, 3), { reliable: false }); peer.emit('message', Buffer.from([9, 8]), {});
    const got = log.filter(e => e[0] === 'message');
    assert.ok(got.every(e => e[2] instanceof ArrayBuffer));
    assert.deepEqual(got.map(e => [...new Uint8Array(e[2])]), [[2, 3, 4], [1, 2], [9, 8]]);
    assert.doesNotThrow(() => net.send('g1', new ArrayBuffer(1), false));
    assert.doesNotThrow(() => net.send('g1', { a: 1 }, true));
  } finally { console.warn = warn; }
});
test('roomLink follows a new Peer for a known id: its messages arrive, sends reach it, and peer fires once (the library replaces Peers without peerLeft)', () => {
  const room = Object.assign(emitter(), { isHost: true, you: 'h1', hostId: 'h1', peers: new Map(), leave() {} });
  const mk = () => Object.assign(emitter(), { id: 'g1', open: true, sent: [], send(d) { this.sent.push(d); return true; } });
  const net = roomLink(room), log = record(net), a = mk(), b = mk();
  room.peers.set('g1', a); room.emit('peer', a);
  room.peers.set('g1', b); room.emit('peer', b); // Room._resumed / #onSignal: a new Peer object with the same id
  b.emit('message', { t: 'hello' }, { reliable: true });
  net.send('g1', { t: 'welcome' }, true);
  assert.deepEqual(log.filter(e => e[0] === 'peer').map(e => e[1]), ['g1'], 'one player, not two');
  assert.deepEqual(log.filter(e => e[0] === 'message').map(e => e.slice(1)), [['g1', { t: 'hello' }, true]]);
  assert.deepEqual([a.sent, b.sent], [[], [{ t: 'welcome' }]]);
  room.emit('peer', b); b.emit('message', { t: 'paint' }, { reliable: true });
  assert.equal(log.filter(e => e[0] === 'message').length, 2, 'a Peer is listened to once');
});

test('a test can drop chosen messages on both channels, as a connection change does (M-53)', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), got = []; h.on('message', (f, d) => got.push(d instanceof ArrayBuffer ? 'frame' : d.t)); hub.tick(0);
  hub.drop = (from, to, d) => d instanceof ArrayBuffer || d.t === 'claim';
  g.send(h.id, new ArrayBuffer(1)); g.send(h.id, { t: 'claim' }, true); g.send(h.id, { t: 'horn' }, true); hub.tick(1);
  hub.drop = null; g.send(h.id, { t: 'claim' }, true); g.send(h.id, new ArrayBuffer(1)); hub.tick(2);
  assert.deepEqual(got, ['horn', 'claim', 'frame']);
});
test('2f: withLag reads an injected clock for its reliable order (N-4)', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), timers = []; let t = 1000;
  const r = [1, 0], lg = withLag(g, { delay: 100, jitter: 50, loss: 0 }, { rng: () => r.shift(), timer: (fn, ms) => timers.push(ms), now: () => t });
  lg.send(h.id, { a: 1 }, true); t += 30; lg.send(h.id, { a: 2 }, true);
  assert.deepEqual(timers, [150, 120], 'the second waits for the first, 30 ms later on the injected clock');
});
test('the memory hub drops JSON on the fast channel, as roomLink does (WebRTC carries only binary there), so tests see what production does', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), got = [];
  h.on('message', (from, d, rel) => got.push([d, rel]));
  g.send(h.id, { t: 'fast json' }, false); g.send(h.id, { t: 'reliable json' }, true); g.send(h.id, new ArrayBuffer(2), false);
  hub.tick(1);
  assert.deepEqual(got.map(([d, rel]) => [d instanceof ArrayBuffer ? 'bytes' : d.t, rel]), [['reliable json', true], ['bytes', false]]);
});
