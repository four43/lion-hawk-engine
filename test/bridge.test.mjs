import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeTransport } from '../src/index.net.js';

// a fake page: the binding records its calls, as peers() would receive them
const page = () => {
  const calls = [], queue = [], early = (...a) => { queue.push(a); }; early.queue = queue;
  return { calls, target: { __lhBridge: async (...a) => { calls.push(a); }, __lhBridgeInfo: { isHost: false, id: 'g2', hostId: 'h1', sent: 0 }, __lhBridgeIn: early } };
};

test('2g: bridgeTransport is a net (N-1): sends go to the binding in order, bytes as flagged byte arrays (N-2)', () => {
  const { calls, target } = page(), net = bridgeTransport({ target });
  assert.deepEqual([net.isHost, net.id, net.hostId], [false, 'g2', 'h1']);
  net.send('h1', { t: 'echo', n: 1 }, true); net.send('h1', new Uint8Array([1, 2, 255]).buffer); net.leave();
  assert.deepEqual(calls, [[0, 'send', 'h1', { t: 'echo', n: 1 }, true, false], [1, 'send', 'h1', [1, 2, 255], false, true], [2, 'leave']]);
  assert.equal(target.__lhBridgeInfo.sent, 3);
});
test('2g: bridgeTransport rebuilds byte messages as ArrayBuffers and replays events that came before it', async () => {
  const { target } = page(); target.__lhBridgeIn('peer', 'h1');
  const net = bridgeTransport({ target }), got = [];
  net.on('peer', id => got.push(['peer', id])); net.on('message', (from, d, rel) => got.push(['message', from, d, rel]));
  target.__lhBridgeIn('message', 'h1', [7, 8], true, true); target.__lhBridgeIn('message', 'h1', { t: 'say', n: 2 }, false, false);
  await Promise.resolve();
  assert.deepEqual(got[0], ['peer', 'h1'], 'the early event first, then what came after it');
  assert.equal(got[1][0], 'message'); assert.ok(got[1][2] instanceof ArrayBuffer); assert.deepEqual([...new Uint8Array(got[1][2])], [7, 8]);
  assert.deepEqual(got.slice(2), [['message', 'h1', { t: 'say', n: 2 }, false]]);
  target.__lhBridgeIn('peerLeft', 'g3', 'left'); assert.deepEqual(got.length, 3, 'no listener for peerLeft'); net.on('peerLeft', (...a) => got.push(a));
  target.__lhBridgeIn('peerLeft', 'g3', 'left'); assert.deepEqual(got[3], ['g3', 'left'], 'after the replay, events are delivered at once');
});
test('2g: bridgeTransport without the binding says how to get one', () => {
  assert.throws(() => bridgeTransport({ target: {} }), /no '__lhBridge' binding on this page \(open it with lion-hawk\/playwright peers\(\)\)/);
});

// the Node end (lion-hawk/playwright bridgeEnd): a fake hub net records what the page's calls become
const hubNet = () => { const got = []; return { got, send: (to, d, rel) => got.push(['send', to, d, rel]), leave: () => got.push(['leave']) }; };
test('2g: bridgeEnd applies binding calls in seq order when they arrive swapped', async () => {
  const { bridgeEnd } = await import('lion-hawk/playwright');
  const net = hubNet(), end = bridgeEnd(net); let wakes = 0; end.onCall = () => wakes++;
  end.call(1, 'send', 'h1', { t: 'echo', n: 2 }, true, false);
  assert.deepEqual([net.got, end.next], [[], 0], 'seq 1 waits for seq 0');
  end.call(2, 'leave'); end.call(0, 'send', 'h1', { t: 'echo', n: 1 }, true, false);
  assert.deepEqual(net.got, [['send', 'h1', { t: 'echo', n: 1 }, true], ['send', 'h1', { t: 'echo', n: 2 }, true], ['leave']]);
  assert.deepEqual([end.next, wakes], [3, 3]);
  end.closed = true; end.call(3, 'leave'); assert.equal(net.got.length, 3, 'a closed end applies nothing'); assert.equal(end.next, 4);
});
test('2g: bridgeEnd rebuilds a page byte array as a byte-identical ArrayBuffer (guest to host)', async () => {
  const { bridgeEnd } = await import('lion-hawk/playwright');
  const net = hubNet(), all = Array.from({ length: 256 }, (_, i) => i);
  bridgeEnd(net).call(0, 'send', 'h1', all, false, true);
  const [[, to, d, rel]] = net.got;
  assert.deepEqual([to, rel], ['h1', false]); assert.ok(d instanceof ArrayBuffer); assert.deepEqual([...new Uint8Array(d)], all);
});
