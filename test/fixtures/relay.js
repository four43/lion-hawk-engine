// A two-role game for the port and mp() tests (lion-hawk 2f T-E6): the host says a number to every peer each step and sends a
// `ping` keyframe every 10 steps; a guest can be told to send a wrong-direction message or to leave. Every command is logged.
import { defineGame, F, kind, encodeFrame } from '../../src/index.sim.js';
export const PING = kind({ name: 'ping', code: 1, authority: 'host', max: 4, idMax: 3, fields: { n: F.uint(2) } });
const N = { n: F.uint(2) }, log = type => (e, d, ctx) => { ctx.state.log.push({ type, data: d }); };
export default defineGame({
  id: 'relay', start: 's',
  net: { kinds: [PING], maxSender: 4, rates: { host: { reliable: 60, fast: 60, reliableFrames: 4 }, guest: { reliable: 60, fast: 120 } },
    wire: { toHost: { echo: 'host.echo' }, toGuest: { say: 'guest.say' } }, codec: 'json' },
  commands: {
    'net.open': (e, d, ctx) => { log('net.open')(e, d, ctx); ctx.state.role = d.role; ctx.state.hostId = d.hostId; },
    'net.peer': (e, d, ctx) => { log('net.peer')(e, d, ctx); if (d.event === 'peer') ctx.state.peers.push(d.id); },
    'net.frame': log('net.frame'),
    'host.echo': { schema: N, handler: log('host.echo') },
    'guest.say': { schema: N, handler: log('guest.say') },
  },
  scenes: { s: {
    enter(e, ctx) { Object.assign(ctx.state, { log: [], peers: [], role: null, hostId: null, n: 0, bad: false, leave: false }); },
    step(e, dt, ctx) {
      const s = ctx.state;
      if (s.role === 'guest') { if (s.bad) e.net.send(s.hostId, { t: 'say', n: 1 }, true); if (s.leave) { s.leave = false; e.net.leave(); } return; }
      if (s.role !== 'host') return;
      s.n++;
      for (const p of s.peers) {
        e.net.send(p, { t: 'say', n: s.n }, true);
        if (s.n % 10 === 0) e.net.send(p, encodeFrame({ key: true, sender: 1, time: s.n, groups: [{ kind: PING, records: [[1, { n: s.n }]], removed: [] }] }), true);
      }
    },
  } },
  state: e => ({ n: e.scene.state.n, logged: e.scene.state.log.length }),
});
