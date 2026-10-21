// [T-11] mp(): headless peers over one in-memory hub (lion-hawk/net), each bound by a port, stepped in lockstep (2f T-E7, #75).
// Each w.step advances the hub clock by 1000/hz, ticks the hub (messages and transport events become commands, recorded when
// `record`), then steps every peer in order through its handle, so tapes record and a guest's tape replays alone (T-9, #78).
// N-4: the hub clock is the ports' clock and every engine's wall clock (a late peer starts at wall0 = hub.now).
// 3i: drop(peer) (gone for good, not stepped), blackout(seconds, { kinds }) (frames dropped at send, #94) and diverged({ agree })
// over `net` entities (each authority entity against its replica on every other live peer).
// plan 3: per-seat inputs, seat(peer, op, seat), rejoin(peer, { wall0 }) and per-peer keys (T-22)
import { headless } from './headless.js';
import { createMemoryHub, createPort } from '../src/index.net.js';
import { rng } from '../src/core/rng.js';
import { createRegistry, decodeFrame, isFrame } from '../src/sim/replica.js';

export function mp(game, { peers = 2, link = {}, clock, record = false, seed = 1, argsOf = () => undefined, beforeStep, onWarn } = {}) {
  if (!game.net) throw new Error('mp: the game has no net config (defineGame({ net }))');
  if (!Number.isInteger(peers) || peers < 1) throw new Error('mp: peers must be a positive integer');
  const hz = game.sim.hz, hub = createMemoryHub({ rng: rng(seed).fork('mp.link').next, ...link }); // seeded jitter and loss
  const at = clock ?? (() => hub.now), list = [], reg = createRegistry(game.net.kinds, { maxSender: game.net.maxSender });
  const kindOf = (name, what) => { const k = reg.byName.get(name); if (!k) throw new Error(`mp: ${what}: unknown kind '${name}'`); return k; };
  let k = 0; // hub.now is k * 1000 / hz, the engines' own virtual-wall formula: peers created at the start are exact; a late peer's wall0 + m * 1000 / hz can be an ulp off (field note #93)
  // a page: a fresh engine on a new transport (a reload has a new transport id; its key is kept, N-18)
  const connect = (p, wall0) => {
    p.h = headless(game, { seed, args: argsOf(p.index, p.name), record, wall0 }); p.engine = p.h.engine;
    p.net = p.index ? hub.join() : hub.host();
    p.port = createPort(p.engine, { transport: p.net, role: p.index ? 'guest' : 'host', clock: at, key: p.key, onWarn: onWarn && ((kind, e) => onWarn(p, kind, e)) });
    p.dropped = false; return p;
  };
  const addPeer = ({ wall0 = hub.now, key } = {}) => { // wall0: a peer whose clock starts elsewhere (a rejoin with a lower clock)
    const index = list.length, p = { index, name: index ? `guest${index}` : 'host', key: key ?? [index + 1, 0, 0, 0] };
    list.push(p); return connect(p, wall0);
  };
  // [T-22] { 0: snap, 1: snap }: every key a seat number; anything else is seat 0's snapshot
  const perSeat = s => { let any = false; for (const k in s) { if (!/^\d+$/.test(k)) return false; any = true; } return any; };
  const setInputs = (p, snap) => {
    if (!perSeat(snap)) return p.engine.input.set(snap);
    for (const s in snap) {
      const c = p.engine.controllerOf(+s); if (!c) throw new Error(`mp: ${p.name} has no seat ${s}`);
      if (snap[s] != null) c.input.set(snap[s]);
    }
  };
  const one = inputs => {
    k++; hub.tick(k * 1000 / hz);
    for (let i = 0; i < list.length; i++) { // peers added by a beforeStep wait for the next step
      const p = list[i]; if (p.dropped) continue; beforeStep?.(p, i);
      const snap = typeof inputs === 'function' ? inputs(p, i) : inputs?.[i];
      if (snap != null) setInputs(p, snap);
      p.h.step(1);
    }
  };
  const peerOf = x => { const p = typeof x === 'number' ? list[x] : x; if (!p || !list.includes(p)) throw new Error('mp: no such peer'); return p; };
  const w = {
    hub, peers: list, get host() { return list[0]; }, get guests() { return list.slice(1); }, get now() { return hub.now; },
    get live() { return list.filter(p => !p.dropped); },
    step(n = 1, inputs) { for (let i = 0; i < n; i++) one(inputs); return w; },
    seconds: (s, inputs) => w.step(Math.round(s * hz), inputs),
    addPeer,
    settle(agree, { maxSeconds = 3 } = {}) { // steps until agree(w) returns [], at most maxSeconds; returns what is left
      let left = agree(w);
      for (let i = 0, n = Math.round(maxSeconds * hz); i < n && left.length; i++) { one(); left = agree(w); }
      return left;
    },
    // the peer vanishes (a crash, a closed tab): its port stops and the hub reports it gone (a host takes the room with it)
    drop(peer) {
      const p = peerOf(peer); if (p.dropped) throw new Error(`mp: ${p.name} is already dropped`);
      p.dropped = true; p.port.close(); hub.leave(p.net.id, 'dropped'); return w;
    },
    seat(peer, op, seat) { peerOf(peer).engine.command('lh.seat', { op, seat }); return w; }, // [T-22]: recorded like any command
    // [T-22] a dropped guest comes back as a reload does: a fresh engine on a new transport id, with the same key (N-18, N-23)
    rejoin(peer, { wall0 = hub.now } = {}) { // wall0: a real reload's clock starts lower than the room's (S3)
      const p = peerOf(peer);
      if (p.index === 0) throw new Error('mp: the host cannot rejoin (its room closed)');
      if (!p.dropped) throw new Error(`mp: ${p.name} is not dropped (drop it first)`);
      connect(p, wall0); return w;
    },
    // replica frames sent in the next `seconds` are lost (all of them, or those carrying one of `kinds`); JSON messages pass (#94: decided at send)
    blackout(seconds, { kinds } = {}) {
      const names = kinds ? new Set(kinds.map(n => kindOf(n, 'blackout').name)) : null, until = hub.now + seconds * 1000, prev = hub.drop;
      hub.drop = (from, to, data, reliable) => {
        if (hub.now < until && isFrame(data)) {
          if (!names) return true;
          const f = decodeFrame(data, reg); if (f) for (const n of f.groups.keys()) if (names.has(n)) return true;
        }
        return prev ? prev(from, to, data, reliable) : false;
      };
      return w;
    },
    // agree: { kind: metres }. Every authority entity of those kinds (host kinds on the host, owner kinds on their owner) against the
    // same (kind, netId) on every other live peer: missing, or farther than the tolerance (position; data-only kinds: presence only)
    diverged({ agree } = {}) {
      if (!agree || typeof agree !== 'object') throw new Error('mp: diverged needs { agree: { kind: metres } }');
      const out = [], up = w.live;
      for (const [name, tol] of Object.entries(agree)) {
        const kd = kindOf(name, 'diverged');
        for (const a of up) {
          const net = a.h.world?.net; if (!net) continue;
          const ents = a.h.world.with('net');
          for (let i = 0; i < ents.length; i++) {
            const e = ents[i]; if (e.net !== name || net.remoteOf(e)) continue;
            if (kd.authority === 'host' ? net.role !== 'host' : !(net.self > 0 && e.netId === net.self)) continue;
            for (const b of up) {
              if (b === a) continue;
              const o = b.h.world?.net?.find(name, e.netId);
              if (!o) { out.push({ kind: name, netId: e.netId, peer: b.name, missing: true }); continue; }
              if (!e.xf || !o.xf) continue;
              const d = Math.hypot(o.xf.p.x - e.xf.p.x, o.xf.p.y - e.xf.p.y, o.xf.p.z - e.xf.p.z);
              if (!(d <= tol)) out.push({ kind: name, netId: e.netId, peer: b.name, d });
            }
          }
        }
      }
      return out;
    },
  };
  for (let i = 0; i < peers; i++) addPeer();
  return w;
}
