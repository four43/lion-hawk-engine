// src/net/port.js: binds a transport (N-1) to an engine (lion-hawk 2f T-E6, #75, #77, #78). Everything that arrives becomes a
// game-wide command, handled at the next step's input.apply (so a tape records it); everything the sim queued on engine.net goes
// out after each step. N-3: rate, size and schema checks are applied here to every message, and a game cannot skip them.
// N-4: every stamp and rate window reads the injected clock. The port never steps the engine.
import { createRegistry, decodeFrame, frameToJson, isFrame } from '../sim/replica.js';
import { wireCodec } from '../sim/schema.js';
import { createRate, createWarnOnce } from '../sim/limits.js';

const EVENTS = ['peer', 'peerLeft', 'peerAway', 'peerBack', 'hostAway', 'hostBack', 'closed'];
export function createPort(engine, { transport, role, clock = () => performance.now(), onWarn } = {}) {
  const cfg = engine.game.net;
  if (!cfg) throw new Error('port: the game has no net config (defineGame({ net }))');
  if (role !== 'host' && role !== 'guest') throw new Error("port: role must be 'host' or 'guest'");
  if (!transport || typeof transport.on !== 'function' || typeof transport.send !== 'function') throw new Error('port: transport must be a net (N-1)');
  if (!!transport.isHost !== (role === 'host')) throw new Error(`port: role '${role}' does not match the transport (isHost ${!!transport.isHost})`);
  const host = role === 'host', limits = cfg.rates[role], reg = createRegistry(cfg.kinds, { maxSender: cfg.maxSender });
  // the wire tables: tag -> command type, and tag -> that command's schema (defineGame checked every type has one)
  const side = dir => { const types = cfg.wire[dir], table = {}; for (const tag in types) table[tag] = engine.game.schemas[types[tag]]; return { types, codec: wireCodec(table, { codec: cfg.codec }) }; };
  const inW = side(host ? 'toHost' : 'toGuest'), outW = side(host ? 'toGuest' : 'toHost');
  const warn = createWarnOnce(onWarn), rates = new Map(), stats = { dropped: 0, unsent: 0 }, offs = [];
  const drop = (why, from, e) => { stats.dropped++; warn(`net: dropped (${why})`, e ?? `from ${from}`); }; // M-44: once per kind
  const issue = (type, data) => { try { engine.command(type, data); } catch (e) { drop('command', data.from, e); } };
  const ratesOf = id => { // M-50, C-3: one set per peer, made on its first message, deleted when it leaves
    let r = rates.get(id);
    if (!r) rates.set(id, r = { fast: createRate(limits.fast), reliable: createRate(limits.reliable), reliableFrames: limits.reliableFrames ? createRate(limits.reliableFrames) : null });
    return r;
  };
  const size = data => { try { return JSON.stringify(data)?.length; } catch { return undefined; } };
  const onMessage = (from, data, reliable) => {
    const at = clock(); reliable = !!reliable;
    if (!host && from !== transport.hostId) return drop('not the host', from); // a star: a guest hears only its host
    const frame = isFrame(data), r = ratesOf(from);
    if (!(reliable ? frame && r.reliableFrames ? r.reliableFrames : r.reliable : r.fast).allow(at)) return drop('rate', from); // N-3, M-50: first, in clock time
    if (data instanceof ArrayBuffer ? data.byteLength > cfg.maxFrame : !(size(data) <= cfg.maxJson)) return drop('size', from);
    if (frame) { const f = decodeFrame(data, reg); return f ? issue('net.frame', { frame: frameToJson(f), from, at, reliable }) : drop('frame', from); } // #78: plain JSON for the tape
    const m = inW.codec.decode(data); if (!m) return drop('message', from); // an unknown tag, or not its schema
    issue(inW.types[m.tag], { ...m.data, from, at, reliable }); // #77: from is the transport peer id
  };
  const handlers = { message: onMessage };
  for (const ev of EVENTS) handlers[ev] = (...a) => {
    const d = { event: ev };
    if (ev.startsWith('peer')) d.id = a[0];
    const reason = ev === 'peerLeft' ? a[1] : ev === 'closed' ? a[0] : undefined; if (reason != null) d.reason = String(reason);
    if (ev === 'peerLeft') rates.delete(a[0]);
    d.at = clock(); issue('net.peer', d);
  };
  for (const ev in handlers) { transport.on(ev, handlers[ev]); offs.push(() => transport.off(ev, handlers[ev])); }
  // engine.net after each step: frames go as bytes; a JSON message must be in the outgoing table (a bug otherwise: warned once, dropped)
  const send = item => {
    try {
      if (item.leave) return transport.leave();
      const { to, data, reliable } = item;
      if (data instanceof ArrayBuffer) return transport.send(to, data, reliable);
      let w; try { w = outW.codec.encode(data.t, data); } catch (e) { stats.unsent++; return warn(`net: not sent (${role} message '${data.t}')`, e); }
      transport.send(to, w, reliable);
    } catch (e) { stats.unsent++; warn('net: send', e); } // M-44
  };
  offs.push(engine.onStep(e => e.net.drain(send)));
  issue('net.open', { role, id: transport.id, hostId: transport.hostId ?? null, at: clock() });
  return { transport, role, stats, close() { while (offs.length) offs.pop()(); } };
}
