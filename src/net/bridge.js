// src/net/bridge.js: the page side of the Node bridge (N-2 `bridge`, T-20; lion-hawk 2g G-E1). A transport (N-1) for a browser
// page whose peers live in a Node test process's in-memory hub: lion-hawk/playwright's peers() exposes the binding, sets
// window[binding + 'Info'] = { isHost, id, hostId, sent } before the page's scripts run and delivers hub events through
// window[binding + 'In'](event, ...args). The hub's copy semantics hold across the page boundary: JSON is copied by the
// serialisation, an ArrayBuffer crosses as a byte array (flagged) and is rebuilt on the other side.
import { emitter } from './transport.js';

export function bridgeTransport({ binding = '__lhBridge', target = globalThis } = {}) {
  const call = target[binding], info = target[binding + 'Info'];
  if (typeof call !== 'function' || !info) throw new Error(`bridge: no '${binding}' binding on this page (open it with lion-hawk/playwright peers())`);
  const ev = emitter();
  // every call carries its sequence number; info.sent tells Node how many to wait for (exposed bindings resolve asynchronously)
  const out = (...a) => { const seq = info.sent++; call(seq, ...a).catch(() => { /* the page is closing */ }); };
  const inbound = (event, ...a) => {
    if (event === 'message') { const [from, data, reliable, bytes] = a; return ev.emit('message', from, bytes ? new Uint8Array(data).buffer : data, !!reliable); }
    ev.emit(event, ...a);
  };
  // events that reached the page before the transport existed are replayed after this call returns (so a port created right
  // after sees them); anything arriving before then queues behind them, so the order holds
  const early = target[binding + 'In']?.queue ?? []; let replaying = early.length > 0;
  target[binding + 'In'] = (...a) => { if (replaying) early.push(a); else inbound(...a); };
  const net = { isHost: !!info.isHost, id: info.id, get hostId() { return info.hostId; }, on: ev.on, off: ev.off,
    send(to, data, reliable = false) {
      if (data instanceof ArrayBuffer) out('send', to, [...new Uint8Array(data)], !!reliable, true);
      else out('send', to, data, !!reliable, false);
    },
    leave: () => out('leave') };
  if (replaying) Promise.resolve().then(() => { for (let i = 0; i < early.length; i++) inbound(...early[i]); early.length = 0; replaying = false; });
  return net;
}
