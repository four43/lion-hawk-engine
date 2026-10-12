// [T-11] mp(): headless peers over one in-memory hub (lion-hawk/net), each bound by a port, stepped in lockstep (2f T-E7, #75).
// Each w.step advances the hub clock by 1000/hz, ticks the hub (messages and transport events become commands, recorded when
// `record`), then steps every peer in order through its handle, so tapes record and a guest's tape replays alone (T-9, #78).
// N-4: the hub clock is the ports' clock and every engine's wall clock (a late peer starts at wall0 = hub.now).
import { headless } from './headless.js';
import { createMemoryHub, createPort } from '../src/index.net.js';
import { rng } from '../src/core/rng.js';

export function mp(game, { peers = 2, link = {}, clock, record = false, seed = 1, argsOf = () => undefined, beforeStep, onWarn } = {}) {
  if (!game.net) throw new Error('mp: the game has no net config (defineGame({ net }))');
  if (!Number.isInteger(peers) || peers < 1) throw new Error('mp: peers must be a positive integer');
  const hz = game.sim.hz, hub = createMemoryHub({ rng: rng(seed).fork('mp.link').next, ...link }); // seeded jitter and loss
  const at = clock ?? (() => hub.now), list = [];
  let k = 0; // hub.now is k * 1000 / hz, the engines' own virtual-wall formula: peers created at the start are exact; a late peer's wall0 + m * 1000 / hz can be an ulp off (field note #93)
  const addPeer = () => {
    const index = list.length, name = index ? `guest${index}` : 'host';
    const h = headless(game, { seed, args: argsOf(index, name), record, wall0: hub.now });
    const net = index ? hub.join() : hub.host();
    const port = createPort(h.engine, { transport: net, role: index ? 'guest' : 'host', clock: at, onWarn: onWarn && ((kind, e) => onWarn(p, kind, e)) });
    const p = { index, name, h, engine: h.engine, net, port }; list.push(p); return p;
  };
  const one = inputs => {
    k++; hub.tick(k * 1000 / hz);
    for (let i = 0; i < list.length; i++) { // peers added by a beforeStep wait for the next step
      const p = list[i]; beforeStep?.(p, i);
      const snap = typeof inputs === 'function' ? inputs(p, i) : inputs?.[i];
      if (snap != null) p.engine.input.set(snap);
      p.h.step(1);
    }
  };
  const w = {
    hub, peers: list, get host() { return list[0]; }, get guests() { return list.slice(1); }, get now() { return hub.now; },
    step(n = 1, inputs) { for (let i = 0; i < n; i++) one(inputs); return w; },
    seconds: (s, inputs) => w.step(Math.round(s * hz), inputs),
    addPeer,
    settle(agree, { maxSeconds = 3 } = {}) { // steps until agree(w) returns [], at most maxSeconds; returns what is left
      let left = agree(w);
      for (let i = 0, n = Math.round(maxSeconds * hz); i < n && left.length; i++) { one(); left = agree(w); }
      return left;
    },
  };
  for (let i = 0; i < peers; i++) addPeer();
  return w;
}
