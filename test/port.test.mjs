import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHub, createPort, emitter } from '../src/index.net.js';
import { createEngine, encodeFrame } from '../src/index.sim.js';
import relay from './fixtures/relay.js';

const pair = ({ onWarn } = {}) => {
  const hub = createMemoryHub(); let now = 0; const clock = () => now;
  const H = createEngine(relay), G = createEngine(relay);
  const hp = createPort(H, { transport: hub.host(), role: 'host', clock }), gp = createPort(G, { transport: hub.join(), role: 'guest', clock, onWarn });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { now += 1000 / 60; hub.tick(now); H.stepN(1); G.stepN(1); } };
  return { hub, H, G, hp, gp, step };
};
const log = (e, type) => e.scene.state.log.filter(c => c.type === type).map(c => c.data);

test('2f: net.open and transport events become commands with at (N-1, #75)', () => {
  const w = pair(); w.step(2);
  assert.equal(log(w.H, 'net.open')[0].role, 'host'); assert.equal(log(w.G, 'net.open')[0].role, 'guest');
  const p = log(w.H, 'net.peer')[0]; assert.equal(p.event, 'peer'); assert.equal(p.id, w.gp.transport.id); assert.ok(Number.isFinite(p.at));
});
test('2f: messages arrive as schema-checked commands with from, at and reliable; frames as plain-JSON net.frame (#77, #78)', () => {
  const w = pair(); w.step(12);
  const say = log(w.G, 'guest.say')[0];
  assert.deepEqual([say.from, say.reliable, typeof say.n, typeof say.at], [w.hp.transport.id, true, 'number', 'number']);
  const fr = log(w.G, 'net.frame')[0]; assert.equal(fr.frame.groups[0].kind, 'ping'); assert.deepEqual(JSON.parse(JSON.stringify(fr)), fr);
});
test('2f: bad, oversized, unknown or too many messages are dropped at the port, counted on the injected clock (N-3)', () => {
  const w = pair(); w.step(2); const g = w.gp.transport, to = g.hostId;
  for (let i = 0; i < 70; i++) g.send(to, { t: 'echo', n: i }, true);
  w.step(1); assert.equal(log(w.H, 'host.echo').length, 60); assert.equal(w.hp.stats.dropped, 10);
  w.step(66); // a new 1 s window on the port's clock
  g.send(to, { t: 'echo', n: -1 }, true); g.send(to, { t: 'echo', n: 1, pad: 'x'.repeat(3000) }, true); g.send(to, { t: 'nope' }, true); g.send(to, { t: 'echo', n: 5 }, true);
  w.step(1); assert.equal(log(w.H, 'host.echo').length, 61); assert.equal(w.hp.stats.dropped, 13);
});
test('2f: the port drains engine.net after each step: frames as bytes, JSON checked against the outgoing table, leave closes', () => {
  const warned = [], w = pair({ onWarn: k => warned.push(k) }), sent = [];
  w.hub.drop = (from, to, d) => { sent.push([from, d instanceof ArrayBuffer ? 'bytes' : d.t]); return false; };
  w.step(12); assert.ok(sent.some(([, t]) => t === 'say') && sent.some(([, t]) => t === 'bytes'));
  w.G.scene.state.bad = true; w.step(1); w.G.scene.state.bad = false;
  assert.equal(sent.some(([f, t]) => f === w.gp.transport.id && t === 'say'), false, 'a guest may not send a host message'); assert.equal(warned.length, 1);
  w.G.scene.state.leave = true; w.step(2);
  assert.ok(log(w.H, 'net.peer').some(p => p.event === 'peerLeft' && p.id === w.gp.transport.id));
});
test('2f: reliable frames have their own budget on a host; close() unsubscribes (N-3, C-3)', () => {
  const w = pair(); w.step(2); const g = w.gp.transport, to = g.hostId, frame = () => encodeFrame({ key: true, sender: 2, time: 1, groups: [] });
  for (let i = 0; i < 6; i++) g.send(to, frame(), true); // relay's host takes 4 reliable frames a second from each guest
  w.step(1); assert.equal(log(w.H, 'net.frame').length, 4); assert.equal(w.hp.stats.dropped, 2);
  for (let i = 0; i < 6; i++) g.send(to, frame(), false); w.step(1); assert.equal(log(w.H, 'net.frame').length, 10, 'the fast channel has its own budget');
  w.hp.close(); const n = w.H.scene.state.log.length; g.send(to, { t: 'echo', n: 1 }, true); w.step(2);
  assert.equal(w.H.scene.state.log.length, n, 'a closed port hears nothing');
});
test('2f: a guest port hears only its host (a star)', () => {
  const t = Object.assign(emitter(), { isHost: false, id: 'g1', hostId: 'h1', send() {}, leave() {} }), e = createEngine(relay), p = createPort(e, { transport: t, role: 'guest', clock: () => 0, onWarn() {} });
  t.emit('message', 'g2', { t: 'say', n: 1 }, true); t.emit('message', 'h1', { t: 'say', n: 2 }, true); e.stepN(1);
  assert.deepEqual(log(e, 'guest.say').map(d => [d.n, d.from]), [[2, 'h1']]); assert.equal(p.stats.dropped, 1);
});
test('2f: createPort checks its arguments', () => {
  const hub = createMemoryHub(), e = createEngine(relay);
  assert.throws(() => createPort(e, { transport: hub.host(), role: 'guest' }), /does not match the transport/);
  assert.throws(() => createPort(e, { transport: hub.join(), role: 'peer' }), /role must be/);
  assert.throws(() => createPort(createEngine({ ...relay, net: undefined }), { transport: hub.join(), role: 'guest' }), /no net config/);
});
