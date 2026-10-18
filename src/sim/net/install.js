// src/sim/net/install.js
// The World `net` part (N-9..N-17, D7, D8). installNet(engine) adds, once per engine:
// - built-in net.open / net.peer / net.frame handlers (engine.builtin: they run before the game's own, which still run);
// - lh.net.recv (stage pre, before lh.scene): remote poses, driven input playout and nudges, every step;
// - the send clock (engine.onStep; installed before any port, so the port drains what it queues in the same step).
// The controller is world.net on every World it sees; a new World resets the per-World state; world.clear() (a new serial on the
// same World) keeps it and spawns every replica again from its newest record (CI-15).
// Sim-pure. Everything reads steps, engine.time.wall and command `at` stamps (N-4), so each peer's tape replays alone (#78).
import { createRegistry, createStore, createTracker, encodeFrame, frameFromJson, REPEAT } from '../replica.js';
import { createInterp, lerpPose } from '../interp.js';
import { createForecast, newPose } from '../forecast.js';
import { createWarnOnce } from '../limits.js';
import { defaultRecord, applyFields, newRecord, createInputRing, zeroActions, bodyEntity } from './replicate.js';
import { createInputQueue, latencyMs, newTarget, project, poseError, decide, nudgeVelocity, writeKinematic, writePool, setNetFix } from './remote.js';
import { INPUT_BATCH, INPUT_WIRE_MAX } from '../../defs/fields.js';

export const RESERVED = Object.freeze(['id', 'tags', 'model', 'colliders', 'xf', 'sockets', 'net', 'netId', 'netFix']); // entity parts (§4.4)

export function installNet(engine) {
  if (engine.netPart) return engine.netPart;
  const cfg = engine.game.net;
  if (!cfg) throw new Error('net: installNet needs defineGame({ net })');
  if (typeof engine.builtin !== 'function') throw new Error('net: the engine has no builtin() seam (phase 3c)');
  const kinds = cfg.kinds, reg = createRegistry(kinds, { maxSender: cfg.maxSender }), hz = engine.game.sim.hz, dt = 1 / hz;
  for (const k of kinds) for (const f of Object.keys(k.fields)) {
    if (RESERVED.includes(f)) throw new Error(`net: kind '${k.name}' field '${f}' is an entity part; rename it`);
    if (f === 'body' && k.fields.body.body !== true) throw new Error(`net: kind '${k.name}' field 'body' must be F.body()`);
    if (f === 'owner' && k.authority === 'owner') throw new Error(`net: kind '${k.name}' field 'owner' is the owner kind's authority; rename it`);
  }
  const index = new Map(kinds.map((k, i) => [k.name, i])), ownerKinds = kinds.filter(k => k.authority === 'owner');
  const every = kinds.map(k => Math.max(1, Math.round(hz / k.send.hz))), keyEvery = kinds.map(k => Math.max(1, Math.round(k.send.key * hz)));
  const gapMs = every.map(n => n * 1000 / hz); // one send interval, ms
  // N-13: a driven record carries 2 sends' worth of inputs (at least INPUT_BATCH), so a lost diff costs none and none are skipped
  const batch = kinds.map((k, i) => {
    if (k.remote !== 'driven') return 0;
    const n = Math.max(INPUT_BATCH, 2 * every[i]);
    if (n > INPUT_WIRE_MAX) throw new Error(`net: kind '${k.name}' sends every ${every[i]} steps at ${hz} Hz; a driven kind needs send.hz >= ${Math.ceil(hz * 2 / INPUT_WIRE_MAX)} (2 × steps per send <= ${INPUT_WIRE_MAX} inputs)`);
    return n;
  });
  const tunables = {}, stats = { frames: 0, sent: 0, dropped: 0, unsent: 0, spawned: 0, despawned: 0, respawned: 0, kinds: {} };
  for (const k of kinds) { tunables[k.name] = { ...k.tune }; stats.kinds[k.name] = { snaps: 0, nudges: 0, held: 0 }; } // N-17: a live copy per engine
  const players = new Map(), warn = createWarnOnce(), objs = {}; // players: host only, transport peer id -> player number (#77)
  let role = 'solo', hostId = null, self = 0, world = null, serial = -1, W = null, replicating = 0;
  const keyOf = (k, id) => k.code * 65536 + id;
  const fresh = () => ({
    store: createStore(kinds), trackers: kinds.map(k => createTracker([k])), lastKey: kinds.map(() => -Infinity),
    byKey: new Map(), remotes: new Map(), list: [], // replicated entities: (kind, netId) -> e, e -> remote state, and the states in spawn order
    own: new WeakMap(), buckets: kinds.map(() => []), pairs: kinds.map(() => []), // what this peer sends
    fwd: new Map(), gone: [], // host: each guest's newest owner records to pass on (C-3), and removals of players who left
  });
  function sync() {
    const w = engine.world ?? null;
    if (w !== world) { world = w; serial = w ? w.serial : -1; W = w ? fresh() : null; if (w) w.net = ctl; }
    else if (w && w.serial !== serial) { serial = w.serial; respawnAll(); } // world.clear(): the replicas come back (CI-15)
    return world;
  }

  // ---- remote entities (N-12) ----
  // a kinematic copy of a body desc: mass and massProps belong to dynamic bodies only
  const kinematicOf = ({ mass, massProps, ...rest }) => ({ ...rest, type: 'kinematic' });
  function shape(k, desc, b) { // the remote mode decides the body: driven as given, proxy kinematic, view none
    if (b && desc.at === undefined) { desc.at = [b.p.x, b.p.y, b.p.z]; desc.q = [b.q.x, b.q.y, b.q.z, b.q.w]; }
    if (k.remote === 'driven') { if (!desc.body) throw new Error(`net: kind '${k.name}' is driven: spawn() must give a body`); return desc; }
    if (k.remote === 'proxy') { if (desc.body) desc.body = typeof desc.body === 'string' ? 'kinematic' : kinematicOf(desc.body); else if (b) desc.xf = true; return desc; }
    delete desc.body; if (desc.model !== undefined || desc.colliders) desc.colliders = []; if (b) desc.xf = true; return desc;
  }
  function newRemote(k, e, rec) {
    const links = k.bodies.map(b => bodyEntity(e, b));
    return { kind: k, e, id: e.netId, links, last: rec, interp: createInterp(), s: { a: null, b: null, k: 0, at: 0 }, applied: null, pose: newPose(),
      fc: k.follow === 'forecast' && k.remote !== 'driven' ? createForecast(links.length) : null,
      queue: k.remote === 'driven' ? createInputQueue(k.input, every[index.get(k.name)]) : null, corr: k.remote === 'driven' ? links.map(newTarget) : null };
  }
  function spawnRemote(k, id, rec) {
    const e = build(k, id, rec), r = newRemote(k, e, rec); W.byKey.set(keyOf(k, id), e); W.remotes.set(e, r); W.list.push(r); stats.spawned++;
    return e;
  }
  // CI-15: world.clear() took every entity without the guard. The remote states stay (interp, forecast, input queue) and each
  // replica is built again from its newest record, in first-spawn order: fresh ids, the same (kind, netId). Only on a clear.
  function respawnAll() {
    W.byKey.clear(); W.remotes.clear();
    for (let j = 0; j < W.list.length; j++) {
      const r = W.list[j], k = r.kind;
      r.e = build(k, r.id, r.last); r.links = k.bodies.map(b => bodyEntity(r.e, b)); r.applied = null;
      if (r.corr) for (let i = 0; i < r.corr.length; i++) r.corr[i].left = 0;
      W.byKey.set(keyOf(k, r.id), r.e); W.remotes.set(r.e, r); stats.respawned++;
      if (k.remote === 'driven' || r.fc) apply(r, r.last, null); // interp kinds are applied by the next lh.net.recv (applied = null)
    }
  }
  function build(k, id, rec) { // a replica's entity and its linked bodies, from the kind's spawn hook, shaped by the remote mode
    const desc = { ...(k.spawn ? k.spawn(rec, id, world) : null) }, subs = [];
    for (const b of k.bodies) if (b !== 'body') {
      const s = desc[b]; delete desc[b];
      if (!s || typeof s !== 'object') throw new Error(`net: kind '${k.name}' spawn() must return a desc for its F.body() field '${b}'`);
      subs.push(b, s);
    }
    shape(k, desc, rec.body ?? null);
    desc.net = k.name; desc.netId = id; if (k.authority === 'owner') desc.owner = id;
    if (k.input && desc.input === undefined) desc.input = zeroActions(k.input);
    let e; replicating++;
    try {
      e = world.spawn(desc);
      for (let i = 0; i < subs.length; i += 2) world.add(e, subs[i], world.spawn(shape(k, { ...subs[i + 1] }, rec[subs[i]])));
      k.spawned?.(e, world, rec);
    } finally { replicating--; }
    return e;
  }
  function forgetRemote(r) { W.remotes.delete(r.e); W.byKey.delete(keyOf(r.kind, r.id)); const i = W.list.indexOf(r); if (i >= 0) W.list.splice(i, 1); }
  function despawnRemote(e) {
    const r = W.remotes.get(e); if (!r) return; forgetRemote(r);
    replicating++;
    try { for (let i = 0; i < r.links.length; i++) if (r.links[i] !== e) world.despawn(r.links[i]); world.despawn(e); } finally { replicating--; }
    stats.despawned++;
  }
  const apply = (r, rec, s) => { if (r.kind.apply) r.kind.apply(r.e, rec, world, s); else applyFields(r.kind, r.e, rec); };
  const SNAP_AT = [0, 0, 0], SNAP_Q = [0, 0, 0, 1], WHERE = { at: SNAP_AT }, HOW = { q: SNAP_Q, keep: true }, OLD = newPose();
  function correct(r, rec) { // N-14: on a body snapshot, per body: project by the latency, then nudge or snap
    const k = r.kind, tune = tunables[k.name], lat = latencyMs(r.interp.offset), st = stats.kinds[k.name];
    for (let i = 0; i < r.links.length; i++) {
      const ent = r.links[i], c = r.corr[i], b = ent.body; if (!b) continue;
      project(rec[k.bodies[i]], lat, c);
      if (decide(poseError(b.translation(), b.rotation(), c), tune) === 'nudge') { c.left = tune.nudge; st.nudges++; continue; }
      const P = ent.xf.p, Q = ent.xf.q; OLD.p.x = P.x; OLD.p.y = P.y; OLD.p.z = P.z; OLD.q.x = Q.x; OLD.q.y = Q.y; OLD.q.z = Q.z; OLD.q.w = Q.w;
      SNAP_AT[0] = c.p.x; SNAP_AT[1] = c.p.y; SNAP_AT[2] = c.p.z; SNAP_Q[0] = c.q.x; SNAP_Q[1] = c.q.y; SNAP_Q[2] = c.q.z; SNAP_Q[3] = c.q.w;
      world.place(ent, WHERE, HOW); b.setLinvel(c.v, true); b.setAngvel(c.w, true);
      setNetFix(ent, OLD.p, OLD.q, c.p, c.q); c.left = 0; st.snaps++;
    }
  }
  function receive(k, id, rec, time, at) {
    const e = W.byKey.get(keyOf(k, id)) ?? spawnRemote(k, id, rec), r = W.remotes.get(e), gap = gapMs[index.get(k.name)];
    // an idle entity sends no diffs: after a gap, hold the last record until one send interval before this one, so the replica
    // does not slide across the whole idle time (N-12)
    if (r.lastT !== undefined && time - r.lastT > 2 * gap && r.last) r.interp.push(time - gap, at - gap, r.last);
    if (!r.interp.push(time, at, rec)) return; // M-26: not newer
    r.lastT = time;
    r.last = rec; // what a world.clear() rebuilds it from (CI-15)
    if (r.fc) r.fc.push(time, k.bodies.map(b => rec[b]));
    if (k.remote === 'driven') { r.queue.offer(rec.input); correct(r, rec); }
    if (k.remote === 'driven' || r.fc) apply(r, rec, null);
  }
  function removed(k, id) { const e = W.byKey.get(keyOf(k, id)); if (e) despawnRemote(e); }
  // a removed owner object leaves no store entry: a new player with this number starts a fresh (lower) clock. Every removal
  // frame (the REPEAT copies too, and one for an object never seen) is forgotten here, so none leaves a stale sender time behind.
  function forgetRemoved(f) {
    for (const k of ownerKinds) { const g = f.groups.get(k.name); if (g) for (const id of g.removed) W.store.forget(k.name, id); }
  }

  // ---- the host's relay (N-10, C-3): each guest's newest owner records, passed on with that guest's clock ----
  function keepForRelay(f) {
    for (const k of ownerKinds) {
      const g = f.groups.get(k.name); if (!g) continue;
      const rec = g.records.get(f.sender) ?? (g.removed.includes(f.sender) ? null : undefined); if (rec === undefined) continue;
      let m = W.fwd.get(f.sender); if (!m) W.fwd.set(f.sender, m = new Map());
      const old = m.get(k.name); if (old && f.time <= old.time) continue;
      if (old) { old.time = f.time; old.rec = rec; old.fresh = true; } else m.set(k.name, { time: f.time, rec, fresh: true });
    }
  }
  function relay(step) { // on send ticks only
    for (const [n, m] of W.fwd) {
      let time = 0, kg = null, dg = null;
      for (const k of ownerKinds) {
        const x = m.get(k.name); if (!x) continue; const i = index.get(k.name), key = W.lastKey[i] === step;
        if (key) (kg ??= []).push({ kind: k, records: x.rec ? [[n, x.rec]] : [], removed: [] });
        else if (step % every[i] === 0 && x.fresh) (dg ??= []).push({ kind: k, records: x.rec ? [[n, x.rec]] : [], removed: x.rec ? [] : [n] });
        else continue;
        x.fresh = false; if (x.time > time) time = x.time;
      }
      if (kg) sendFrame(true, n, time, kg, n);
      if (dg) sendFrame(false, n, time, dg, n);
    }
    for (let j = W.gone.length - 1; j >= 0; j--) { // a player who left: REPEAT removals, one later than its last record so every store takes them
      const g = W.gone[j]; sendFrame(false, g.n, g.time, ownerKinds.map(k => ({ kind: k, records: [], removed: [g.n] })), g.n);
      if (--g.left <= 0) W.gone.splice(j, 1);
    }
  }
  function unbind(peer) {
    const n = players.get(peer); if (n === undefined) return; players.delete(peer);
    if (!sync()) return;
    let time = 0; const m = W.fwd.get(n); if (m) for (const x of m.values()) if (x.time > time) time = x.time; W.fwd.delete(n);
    for (const k of ownerKinds) { const e = W.byKey.get(keyOf(k, n)); if (e) despawnRemote(e); W.store.forget(k.name, n); }
    W.gone.push({ n, time: time + 1, left: REPEAT });
  }
  function sendFrame(key, sender, time, groups, except) {
    let buf; try { buf = encodeFrame({ key, sender, time, groups }); } catch (err) { stats.unsent++; warn('net: frame not sent', err); return; }
    if (role === 'host') { for (const [peer, n] of players) if (n !== except) { engine.net.send(peer, buf, key); stats.sent++; } }
    else if (hostId !== null) { engine.net.send(hostId, buf, key); stats.sent++; }
  }
  function goSolo() { // M-41: the room closed. Other players' entities go; host-kind replicas stay as plain local entities
    if (sync()) for (let i = W.list.length - 1; i >= 0; i--) { const r = W.list[i]; if (r.kind.authority === 'owner') despawnRemote(r.e); else forgetRemote(r); }
    role = 'solo'; hostId = null; players.clear();
  }

  const ctl = {
    get role() { return role; }, get hostId() { return hostId; },
    get self() { return self; },
    set self(n) {
      if (!Number.isInteger(n) || n < 0 || n > cfg.maxSender) throw new Error(`net: self must be a player number 0..${cfg.maxSender} (got ${n})`);
      if (role === 'host' && n !== 1) throw new Error('net: the host is player 1');
      self = n; if (sync()) W.lastKey.fill(-Infinity);
    },
    players, tunables, stats,
    player(peer, n) { // host: bind a transport peer to its player number (#77); n = 0 unbinds
      if (role !== 'host') throw new Error('net: only the host binds players');
      if (typeof peer !== 'string') throw new Error('net: player(peer, n): peer must be a transport peer id');
      if (n === 0) return unbind(peer);
      if (!Number.isInteger(n) || n < 2 || n > cfg.maxSender) throw new Error(`net: player number must be 2..${cfg.maxSender} (got ${n})`);
      for (const [p, m] of players) if (m === n && p !== peer) throw new Error(`net: player ${n} is already bound to ${p}`);
      const again = players.get(peer) === n; players.set(peer, n);
      if (sync()) W.lastKey.fill(-Infinity); // M-23: a joiner gets every keyframe at once
      if (W && !again) { // a reused number starts fresh: no old relay clock, no pending removals, no store entry
        W.fwd.delete(n);
        for (let j = W.gone.length - 1; j >= 0; j--) if (W.gone[j].n === n) W.gone.splice(j, 1);
        for (const k of ownerKinds) W.store.forget(k.name, n);
      }
    },
    find(name, netId) {
      const k = reg.byName.get(name); if (!k) throw new Error(`net: unknown kind '${name}'`);
      if (!sync()) return undefined;
      const e = W.byKey.get(keyOf(k, netId)); if (e) return e;
      const list = world.with('net'); for (let i = 0; i < list.length; i++) if (list[i].net === name && list[i].netId === netId) return list[i];
      return undefined;
    },
    remoteOf: e => sync() ? W.remotes.get(e) : undefined,
    attach(w) { w.net = ctl; }, // integrator request 1: the World install calls it before the scene's enter
    // E-7 (integrator request 2, 3c's call shape): ('spawn', desc) when desc.net is set, ('despawn', e) when e.net is set, and
    // ('add', e, value) / ('remove', e) for the 'net' part only; never from clear() or dispose()
    guard(op, x, value) {
      if (replicating) return;
      if (op === 'spawn' || op === 'add') {
        const d = op === 'spawn' ? x : { net: value, netId: x.netId, owner: x.owner }, k = reg.byName.get(d.net);
        if (!k) throw new Error(`net: unknown kind '${d.net}'`);
        if (!Number.isInteger(d.netId) || d.netId < k.idMin || d.netId > k.idMax) throw new Error(`net: '${k.name}' netId must be an integer in ${k.idMin}..${k.idMax} (got ${d.netId})`);
        if (k.authority === 'owner' && d.owner !== d.netId) throw new Error(`net: '${k.name}' is an owner kind: owner must equal netId (got owner ${d.owner}, netId ${d.netId})`);
        if (role === 'guest' && k.authority === 'host') throw new Error(`net: a guest may not spawn '${k.name}' ${d.netId}: only replication spawns host kinds (E-7)`);
        if (role !== 'solo' && k.authority === 'owner' && d.netId !== self) throw new Error(`net: player ${self} may not spawn '${k.name}' ${d.netId}: only its owner does (E-7)`);
        return;
      }
      if (sync() && W.remotes.has(x)) throw new Error(`net: '${x.net}' ${x.netId} is replicated: only replication may ${op === 'despawn' ? 'despawn it' : 'change its \'net\' part'} (E-7)`);
    },
  };

  // ---- built-in handlers (3c seam): before the game's handler for the same type ----
  engine.builtin('net.open', (e, d) => {
    if (sync()) { for (let i = W.list.length - 1; i >= 0; i--) despawnRemote(W.list[i].e); W = fresh(); }
    role = d.role; hostId = d.hostId; players.clear(); self = role === 'host' ? 1 : 0; // #77: a guest's number is the game's to set
  });
  engine.builtin('net.peer', (e, d) => {
    if (d.event === 'peerLeft' && role === 'host') unbind(d.id);
    if (d.event === 'closed') goSolo();
  });
  engine.builtin('net.frame', (e, d) => {
    if (role === 'solo' || !self || !sync()) { stats.dropped++; return; }
    let f; try { f = frameFromJson(d.frame, reg); } catch (err) { stats.dropped++; warn('net: frame', err); return; }
    if (role === 'host' ? players.get(d.from) !== f.sender : d.from !== hostId) { stats.dropped++; return; } // #77, M-50
    if (f.sender === self) return;
    stats.frames++;
    if (role === 'host') keepForRelay(f);
    const ch = W.store.apply(f);
    for (let i = 0; i < ch.length; i++) { const c = ch[i], k = reg.byName.get(c.kind); if (c.rec) receive(k, c.id, c.rec, f.time, d.at); else removed(k, c.id); }
    forgetRemoved(f);
  });

  // ---- every step: remote poses, driven playout and nudges (N-12..N-14) ----
  const V = { x: 0, y: 0, z: 0 }, AV = { x: 0, y: 0, z: 0 };
  const writeLink = (ent, pose) => { if (ent.body) writeKinematic(ent, pose); else writePool(ent, pose); };
  // N-16: is this driven body pressed against another dynamic body right now? While it is, the nudge servo holds: its projected
  // target lies inside the other body (the owner had not seen the bump yet), so steering would shove both carts. Allocates nothing
  // of ours (Rapier's own per-call objects are tolerated).
  let hit = false, self1 = null;
  const onManifold = m => { if (m.numContacts() > 0) hit = true; };
  const onPair = c2 => { if (hit) return; const p = c2.parent(); if (p && p.isDynamic() && p !== self1.parent()) world.rapier.contactPair(self1, c2, onManifold); };
  function touching(ent) {
    const cs = ent.colliders, rw = world.rapier; if (!cs || !rw) return false;
    hit = false;
    for (let i = 0; i < cs.length && !hit; i++) { self1 = cs[i].collider; rw.contactPairsWith(self1, onPair); }
    self1 = null; return hit;
  }
  engine.system('lh.net.recv', () => {
    if (!sync() || !W.list.length) return;
    const now = engine.time.wall, list = W.list;
    for (let j = 0; j < list.length; j++) {
      const r = list[j], k = r.kind;
      if (k.remote === 'driven') {
        r.queue.take(r.e.input); // N-13: one input a step; held when none waits
        for (let i = 0; i < r.links.length; i++) {
          const c = r.corr[i]; if (c.left <= 0) continue; const ent = r.links[i], b = ent.body;
          if (touching(ent)) { stats.kinds[k.name].held++; continue; } // N-16: the collision is this peer's to resolve; steer after it
          nudgeVelocity(c, b.translation(), b.rotation(), dt, V, AV); b.setLinvel(V, true); b.setAngvel(AV, true);
        }
        continue;
      }
      if (r.fc) { if (r.fc.sample(now - r.interp.offset, now)) for (let i = 0; i < r.links.length; i++) writeLink(r.links[i], r.fc.poses[i]); continue; } // D8
      if (!r.interp.sampleInto(now, r.s)) continue;
      const s = r.s;
      for (let i = 0; i < r.links.length; i++) { const name = k.bodies[i]; lerpPose(s.a[name], s.b[name], s.k, r.pose); writeLink(r.links[i], r.pose); }
      if (k.apply) k.apply(r.e, s.b, world, s); else if (s.b !== r.applied) { applyFields(k, r.e, s.b); r.applied = s.b; }
    }
  }, { stage: 'pre', before: ['lh.scene'] });

  // ---- after every step: the send clock (N-11) ----
  engine.onStep(() => {
    if (role === 'solo' || !self || !sync()) return;
    const step = engine.time.step, list = world.with('net');
    for (let i = 0; i < W.buckets.length; i++) W.buckets[i].length = 0;
    for (let i = 0; i < list.length; i++) { // this peer's authority entities: host kinds on the host, its own owner-kind entity everywhere
      const e = list[i], ki = index.get(e.net); if (ki === undefined || W.remotes.has(e)) continue;
      const k = kinds[ki]; if (k.authority === 'host' ? role !== 'host' : e.netId !== self) continue;
      let o = W.own.get(e);
      if (!o) { const ring = k.remote === 'driven' ? createInputRing(k.input, batch[ki]) : null, rec = newRecord(k); W.own.set(e, o = { e, rec, ring, pair: [e.netId, rec], base: (x, out) => defaultRecord(k, x, out, ring) }); }
      if (o.ring) o.ring.push(step, e.input); // N-13: every step's input, batched per send tick
      W.buckets[ki].push(o);
    }
    if (role === 'host' ? !players.size : hostId === null) return; // nobody to send to: a joiner's first keyframe has everything
    const time = Math.floor(engine.time.wall) >>> 0;
    let keyG = null, diffG = null, ownerDue = false;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i]; if (k.authority === 'host' && role !== 'host') continue;
      const key = step - W.lastKey[i] >= keyEvery[i], diff = step % every[i] === 0; if (!key && !diff) continue;
      if (k.authority === 'owner') ownerDue = true;
      const pairs = W.pairs[i], b = W.buckets[i]; pairs.length = 0;
      for (let j = 0; j < b.length; j++) { const o = b[j]; o.pair[1] = k.record ? k.record(o.e, o.rec, world, o.base) : o.base(o.e, o.rec); pairs.push(o.pair); }
      objs[k.name] = pairs;
      if (key) { W.lastKey[i] = step; (keyG ??= []).push(...W.trackers[i].key(objs)); }
      if (diff) { const g = W.trackers[i].diff(objs)[0]; if (!key && (g.records.length || g.removed.length)) (diffG ??= []).push(g); }
      objs[k.name] = undefined;
    }
    if (keyG) sendFrame(true, self, time, keyG, 0);
    if (diffG) sendFrame(false, self, time, diffG, 0);
    if (role === 'host' && (ownerDue || W.gone.length)) relay(step);
  });
  engine.netPart = ctl;
  if (sync()) world.net = ctl;
  return ctl;
}
