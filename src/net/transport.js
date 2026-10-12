// src/net/transport.js: transports (N-1, N-2), moved from Tractor Pickup's src/net/link.js with no behaviour change (lion-hawk 2f T-E6)
import { createWarnOnce } from '../sim/limits.js';
// The game-level link (M-20, M-21). Sync code (host.js, guest.js) talks only to a "net", never to handshake.js, so a host and guests
// run in one Node process over the in-memory hub (M-52). A net: { isHost, id, hostId, send(to, data, reliable), on, off, leave }.
// Events: peer(id), message(from, data, reliable), peerAway(id), peerBack(id), peerLeft(id, reason), hostAway(), hostBack(), closed(reason).
export function emitter() {
  const m = new Map();
  return { on(e, f) { if (!m.has(e)) m.set(e, new Set()); m.get(e).add(f); }, off(e, f) { m.get(e)?.delete(f); }, emit(e, ...a) { for (const f of [...(m.get(e) || [])]) f(...a); } };
}
const copy = d => d instanceof ArrayBuffer ? d.slice(0) : JSON.parse(JSON.stringify(d)); // what the wire does: the receiver never shares the sender's object

// In-memory star with delay, jitter and loss (fast channel only). Reliable messages keep their order per sender and receiver.
export function createMemoryHub({ delay = 0, jitter = 0, loss = 0, rng = Math.random } = {}) {
  const ends = new Map(), queue = [], lastRel = new Map(); let now = 0, seq = 0, n = 0, hostId = null;
  const later = (at, fn) => queue.push({ at, seq: seq++, fn });
  const event = (id, e, ...a) => later(now, () => ends.get(id)?.ev.emit(e, ...a));
  const guests = () => [...ends.values()].filter(e => !e.isHost);
  function endpoint(isHost) {
    const id = (isHost ? 'h' : 'g') + ++n, ev = emitter(), e = { id, isHost, up: true, ev };
    e.net = { isHost, id, get hostId() { return hostId; }, on: ev.on, off: ev.off, leave: () => hub.leave(id, 'left'),
      send(to, data, reliable = false) {
        const dst = ends.get(to); if (!dst || !e.up || to === id || (!isHost && to !== hostId)) return; // star: guests reach only the host
        if (!reliable && rng() < loss) return;
        if (hub.drop?.(id, to, data, reliable)) return; // M-53: a test drops chosen messages (both channels), as a connection change does
        let at = now + delay + (jitter ? rng() * jitter : 0); const k = id + '>' + to;
        if (reliable) { at = Math.max(at, lastRel.get(k) ?? 0); lastRel.set(k, at); }
        const d = copy(data); later(at, () => { const r = ends.get(to); if (r?.up) r.ev.emit('message', id, d, reliable); });
      } };
    ends.set(id, e); return e;
  }
  const hub = {
    drop: null, // (from, to, data, reliable) => true drops the message
    get now() { return now; },
    host() { const e = endpoint(true); hostId = e.id; return e.net; },
    join() { const e = endpoint(false); event(hostId, 'peer', e.id); event(e.id, 'peer', hostId); return e.net; },
    tick(t) { now = t; queue.sort((a, b) => a.at - b.at || a.seq - b.seq); while (queue.length && queue[0].at <= now) queue.shift().fn(); },
    away(id) { const e = ends.get(id); if (!e) return; e.up = false; if (e.isHost) for (const g of guests()) event(g.id, 'hostAway'); else event(hostId, 'peerAway', id); },
    back(id) { const e = ends.get(id); if (!e) return; e.up = true; if (e.isHost) for (const g of guests()) event(g.id, 'hostBack'); else event(hostId, 'peerBack', id); },
    leave(id, reason = 'left') { // a leaving host closes the room for everyone (as Handshake does); a guest's closed event is queued before its endpoint goes
      const e = ends.get(id); if (!e) return;
      if (e.isHost) { for (const g of guests()) later(now, () => { g.ev.emit('closed', 'host_left'); ends.delete(g.id); }); ends.delete(id); }
      else { ends.delete(id); later(now, () => e.ev.emit('closed', reason)); event(hostId, 'peerLeft', id, reason); }
    },
  };
  return hub;
}

// M-28: ?lag=ms[,jitter[,loss%]] — test the feel of a far network at home
export function parseLag(s) {
  if (typeof s !== 'string' || !/^\d+(,\d+(,\d+)?)?$/.test(s.trim())) return null;
  const [d, j = 0, l = 0] = s.trim().split(',').map(Number);
  return { delay: Math.min(5000, d), jitter: Math.min(2000, j), loss: Math.min(50, l) / 100 };
}
// Delays this device's sends and received messages; drops a fraction of fast-channel sends. Reliable sends keep their order.
// N-4: the clock and the timer are injectable (defaults: Date.now and setTimeout, as before)
export function withLag(net, { delay, jitter, loss }, { rng = Math.random, timer = setTimeout, now: clock = Date.now } = {}) {
  const wait = () => delay + (jitter ? rng() * jitter : 0); let lastOut = 0, lastIn = 0;
  const ordered = (last, set) => { const now = clock(), at = Math.max(now + wait(), last); set(at); return at - now; };
  const wrapped = new Map();
  return { ...net, get hostId() { return net.hostId; },
    send(to, data, reliable = false) { if (!reliable && rng() < loss) return; const ms = reliable ? ordered(lastOut, v => { lastOut = v; }) : wait(); timer(() => net.send(to, data, reliable), ms); },
    on(e, f) { if (e !== 'message') return net.on(e, f); const g = (from, d, rel) => timer(() => f(from, d, rel), rel ? ordered(lastIn, v => { lastIn = v; }) : wait()); wrapped.set(f, g); net.on(e, g); },
    off(e, f) { net.off(e, wrapped.get(f) || f); wrapped.delete(f); } };
}
// replica.js isFrame() accepts only an ArrayBuffer, so a typed array (Uint8Array, Buffer) is delivered as a copy of its exact byte range
const exact = d => ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d;
// A handshake Room (the game's vendored handshake.js, #89: nothing is imported from it) as a net
export function roomLink(room) {
  const warn = createWarnOnce(), ev = emitter(), seen = new Set(), heard = new WeakSet(); // the library replaces a Peer (resume, a guest's new offer) without peerLeft: every Peer object is listened to, each id is one player
  const attach = p => { if (!heard.has(p)) { heard.add(p); p.on('message', (d, o) => ev.emit('message', p.id, exact(d), !!o?.reliable)); } if (!seen.has(p.id)) { seen.add(p.id); ev.emit('peer', p.id); } };
  room.on('peer', attach); for (const p of room.peers.values()) if (p.open) attach(p);
  room.on('peerLeft', (id, why) => { seen.delete(id); ev.emit('peerLeft', id, why); });
  for (const e of ['peerAway', 'peerBack', 'hostBack', 'closed']) room.on(e, (...a) => ev.emit(e, ...a));
  room.on('hostAway', () => ev.emit('hostAway'));
  return { isHost: room.isHost, id: room.you, get hostId() { return room.hostId; }, on: ev.on, off: ev.off, leave: () => room.leave(),
    send(to, data, reliable = false) { // binary on the fast channel, JSON only on the reliable one (the library throws otherwise); a send on a closed channel is skipped, and a failed one is logged once (M-44)
      if (!reliable && !(data instanceof ArrayBuffer)) return; const p = room.peers.get(to); if (!p?.open) return; try { p.send(data, { reliable }); } catch (e) { warn('send', e); } } };
}
