// src/sim/net/install.js
// The World `net` part (N-9..N-17, D7, D8). installNet(engine) adds, once per engine:
// - built-in net.open / net.peer / net.frame handlers (engine.builtin: they run before the game's own, which still run);
// - lh.net.recv (stage pre, before lh.scene): remote poses, driven input playout and nudges, every step;
// - the send clock (engine.onStep; installed before any port, so the port drains what it queues in the same step).
// The controller is world.net on every World it sees; a new World resets the per-World state; world.clear() (a new serial on the
// same World) keeps it and spawns every replica again from its newest record (CI-15).
// Sim-pure. Everything reads steps, engine.time.wall and command `at` stamps (N-4), so each peer's tape replays alone (#78).
import { createRegistry, createStore, createTracker, encodeFrame, frameFromJson, REPEAT, DECODED } from '../replica.js';
import { createInterp, lerpPose } from '../interp.js';
import { createForecast, newPose } from '../forecast.js';
import { createWarnOnce } from '../limits.js';
import { defaultRecord, applyFields, newRecord, createInputRing, zeroActions, bodyEntity } from './replicate.js';
import { createInputQueue, latencyMs, newTarget, project, poseError, decide, nudgeVelocity, writeKinematic, writePool, setNetFix } from './remote.js';
import { INPUT_BATCH, INPUT_WIRE_MAX } from '../../defs/fields.js';
import { SEATS, PLAYER_KIND, GAME_KIND } from '../../core/players.js';
const _T = { x: 0, y: 0, z: 0 }, _Q = { x: 0, y: 0, z: 0, w: 1 }; // Rapier's getters fill these (no per-call vectors)

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
  const PK = reg.byName.get(PLAYER_KIND), GK = reg.byName.get(GAME_KIND), pki = index.get(PLAYER_KIND), gki = index.get(GAME_KIND); // N-22
  // B3: both are undefined with join: 'manual' (netConfig adds the kinds only for the engine join), and nothing below sends them
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
  const seats = engine[SEATS]; // { controllers, roster, route, changed } (engine.js): this page's seats and the roster
  if (!seats) throw new Error('net: the engine has no seats seam (local players plan 3)');
  const bindings = new Map(), peerNums = new Map(), locals = new Set(), confirmed = new Set(), warn = createWarnOnce(), objs = {};
  // bindings: host only, player number -> { peer, key, seat } (N-20); peerNums: transport peer id -> its numbers; locals: this page's
  // numbers (N-24); confirmed: this page's seats whose number is the room's (every seat solo or host; a guest's once welcomed)
  let role = 'solo', hostId = null, self = 0, world = null, serial = -1, W = null, replicating = 0, joins = 0;
  function refreshLocals() { // N-24: the numbers of this page's seats that are the room's; self is seat 0's (the host's is 1)
    locals.clear();
    const cs = seats.controllers.list;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.seat !== null && c.player > 0 && confirmed.has(c.seat)) locals.add(c.player); }
    self = role === 'host' ? 1 : confirmed.has(0) ? engine.controllerOf(0)?.player ?? 0 : 0;
    seats.roster.relocal(n => locals.has(n));
  }
  const confirmAll = () => { confirmed.clear(); for (const c of seats.controllers.list) if (c.seat !== null) confirmed.add(c.seat); };
  seats.changed = () => { confirmAll(); refreshLocals(); }; // an offline lh.seat (engine.js): solo only, since route() takes every online one (B1)
  const keyOf = (k, id) => k.code * 65536 + id;
  const fresh = () => ({
    store: createStore(kinds), trackers: kinds.map(k => createTracker([k])), lastKey: kinds.map(() => -Infinity),
    byKey: new Map(), remotes: new Map(), list: [], // replicated entities: (kind, netId) -> e, e -> remote state, and the states in spawn order
    own: new WeakMap(), buckets: kinds.map(() => []), bucketN: kinds.map(() => 0), pairs: kinds.map(() => []), keyG: [], diffG: [], // what this peer sends
    fwd: new Map(), gone: [], // host: each guest's newest owner records to pass on (C-3), and removals of players who left
  });
  // N-22: a roster entry or the game state as an own record (reused per object like an entity's: R-8); id is its number, or 0
  const ownState = (k, x, id) => {
    let o = W.own.get(x);
    if (!o) { const rec = newRecord(k); W.own.set(x, o = { e: x, rec, ring: null, pair: [id, rec], base: (y, out) => defaultRecord(k, y, out, null) }); }
    o.pair[0] = id; return o;
  };
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
    return { kind: k, e, id: e.netId, links, last: rec, interp: createInterp(), s: { a: null, b: null, k: 0, at: 0 }, applied: null, bad: null, pose: newPose(),
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
      if (guarded(k, r.id)) { // another peer's record never halts this one: a replica its hooks cannot rebuild is dropped (security)
        try { r.e = build(k, r.id, r.last); } catch (err) { dropped(k, r.id, err); unrelay(k, r.id); W.list.splice(j--, 1); continue; }
      } else {
        r.e = build(k, r.id, r.last);
      }
      r.links = k.bodies.map(b => bodyEntity(r.e, b)); r.applied = null;
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
    let e = null, made = null; replicating++;
    try {
      e = world.spawn(desc);
      for (let i = 0; i < subs.length; i += 2) { const s = world.spawn(shape(k, { ...subs[i + 1] }, rec[subs[i]])); (made ??= []).push(s); world.add(e, subs[i], s); }
      k.spawned?.(e, world, rec);
    } catch (err) { // a hook or contract throw leaves no half-built replica behind
      if (made) for (let i = 0; i < made.length; i++) world.despawn(made[i]);
      if (e) world.despawn(e);
      throw err;
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
  // a game hook (spawn, spawned, apply) or a kind contract threw on a guarded record (a guest's, on the host or relayed). A guest's
  // data never halts a peer: the record is dropped, the rest of the frame applies, and the game hears it once per sender and kind
  const dropped = (k, id, err) => warn(`net: '${k.name}' record of ${bindings.get(id)?.peer ?? `player ${id}`} dropped`, err);
  // guarded: records the host does not vouch for. On the host every replica is a guest's; on a guest, owner-kind records of a
  // number other than 1 are another guest's, relayed. The host's own records (host kinds, player 1's) stay loud on a guest
  const guarded = (k, id) => role === 'host' || (k.authority === 'owner' && id !== 1);
  const unrelay = (k, id) => { if (role === 'host') { W.fwd.get(id)?.delete(k.name); rejected.add(keyOf(k, id)); } }; // a dropped record is not passed on
  // host: keyOf(kind, id) of a guest's objects whose newest record the change loop dropped. The relay skips them (a keyframe resends
  // an unchanged record, which the store does not report again) until a newer record of theirs applies here
  const rejected = new Set();
  const apply = (r, rec, s) => { if (r.kind.apply) r.kind.apply(r.e, rec, world, s); else applyFields(r.kind, r.e, rec); };
  const SNAP_AT = [0, 0, 0], SNAP_Q = [0, 0, 0, 1], WHERE = { at: SNAP_AT }, HOW = { q: SNAP_Q, keep: true }, OLD = newPose();
  function correct(r, rec) { // N-14: on a body snapshot, per body: project by the latency, then nudge or snap
    const k = r.kind, tune = tunables[k.name], lat = latencyMs(r.interp.offset), st = stats.kinds[k.name];
    for (let i = 0; i < r.links.length; i++) {
      const ent = r.links[i], c = r.corr[i], b = ent.body; if (!b) continue;
      project(rec[k.bodies[i]], lat, c);
      if (decide(poseError(b.translation(_T), b.rotation(_Q), c), tune) === 'nudge') { c.left = tune.nudge; st.nudges++; continue; }
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

  // ---- the host's relay (N-10, C-3, N-24): each guest's newest owner records, by owner number, passed on with that guest's clock ----
  let rk = null, rt = 0, rn = null; // keepOne's kind, time and the sending peer's numbers (one callback, made once: R-8)
  const keepOne = (n, rec) => {
    if (rejected.size && rejected.has(keyOf(rk, n))) return; // its hooks threw here: never relayed to the other guests (security)
    if (!rn.has(n)) return; // S2: a removal of a number this peer no longer holds is not passed on (fromPeer let it through)
    let m = W.fwd.get(n); if (!m) W.fwd.set(n, m = new Map());
    const old = m.get(rk.name); if (old && rt <= old.time) return;
    if (old) { old.time = rt; old.rec = rec; old.fresh = true; } else m.set(rk.name, { time: rt, rec, fresh: true });
  };
  const keepRec = (rec, n) => keepOne(n, rec);
  let rg = null; // keyOmit's group
  // M1: a keyframe ends what it leaves out (createStore). A number of this peer that the keyframe omits (its seat's object went and
  // the REPEAT removal diffs were lost) is relayed as a removal, so the other guests end it too instead of being sent the old record
  const keyOmit = n => { if (rg.records.has(n)) return; const x = W.fwd.get(n)?.get(rk.name); if (x && x.rec) keepOne(n, null); };
  function keepForRelay(f, nums) { // a peer with several seats sends them in one frame: each record is kept under its own number
    rt = f.time; rn = nums;
    for (const k of ownerKinds) {
      const g = f.groups.get(k.name); if (!g) continue; rk = k; g.records.forEach(keepRec);
      for (let j = 0; j < g.removed.length; j++) keepOne(g.removed[j], null);
      if (f.key) { rg = g; nums.forEach(keyOmit); rg = null; }
    }
    rk = null; rn = null;
  }
  const leaving = n => { for (let j = 0; j < W.gone.length; j++) if (W.gone[j].n === n) return true; return false; };
  function relay(step) { // on send ticks only
    for (const [n, m] of W.fwd) {
      if (leaving(n)) continue; // S3: a number given again waits until its old object's removals are out
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
  const numberAt = (peer, seat) => { for (const [n, b] of bindings) if (b.peer === peer && b.seat === seat) return n; return undefined; };
  function bind(n, peer, key, seat) { // host: player n is this peer's seat (N-20)
    const old = bindings.get(n);
    if (old && old.peer !== peer) throw new Error(`net: player ${n} is already bound to ${old.peer}`);
    if (locals.has(n) || seats.controllers.list.some(x => x.player === n)) throw new Error(`net: player ${n} is this page's`);
    const again = old !== undefined && old.seat === seat, prev = numberAt(peer, seat);
    if (prev !== undefined && prev !== n) unbindNumber(prev); // the seat had another number
    bindings.set(n, { peer, key, seat }); let s = peerNums.get(peer); if (!s) peerNums.set(peer, s = new Set()); s.add(n);
    if (!seats.roster.get(n)) seats.roster.add(n, { seat, local: false, join: joins = (joins + 1) % 256 });
    if (sync()) W.lastKey.fill(-Infinity); // M-23: a joiner gets every keyframe at once
    if (W && !again) { // a reused number starts fresh: no old relay clock, no store entry
      W.fwd.delete(n);
      for (const k of ownerKinds) { W.store.forget(k.name, n); rejected.delete(keyOf(k, n)); }
      // S3: its pending removals stay. relay() sends them before any new record of n (leaving), so every other guest's store drops
      // the old object and its clock first, and a reload's lower clock is accepted after them
    }
  }
  function unbindNumber(n, { keep = false } = {}) { // its replicas go; keep: the roster entry stays (inactive, N-23)
    const b = bindings.get(n); if (!b) return; bindings.delete(n);
    const s = peerNums.get(b.peer); if (s) { s.delete(n); if (!s.size) peerNums.delete(b.peer); }
    if (!keep) seats.roster.remove(n);
    if (!sync()) return;
    let time = 0; const m = W.fwd.get(n); if (m) for (const x of m.values()) if (x.time > time) time = x.time; W.fwd.delete(n);
    for (const k of ownerKinds) { const e = W.byKey.get(keyOf(k, n)); if (e) despawnRemote(e); W.store.forget(k.name, n); rejected.delete(keyOf(k, n)); }
    W.gone.push({ n, time: time + 1, left: REPEAT });
  }
  const unbindPeer = peer => { const s = peerNums.get(peer); if (s) for (const n of [...s]) unbindNumber(n); };
  // N-24: the frame's sender and every owner record in it are numbers bound to `peer` (M-50: a device speaks for itself), and no
  // removal names another peer's number. S2: a removal of a free number (a seat that just left, still in REPEAT diffs) is ignored
  let mine = null, ok = true;
  const speakRec = (rec, id) => { if (!mine.has(id)) ok = false; };
  function fromPeer(peer, f) {
    mine = peerNums.get(peer); if (!mine || !mine.has(f.sender)) { mine = null; return false; }
    ok = true;
    for (let i = 0; i < ownerKinds.length && ok; i++) {
      const g = f.groups.get(ownerKinds[i].name); if (!g) continue;
      g.records.forEach(speakRec);
      for (let j = 0; j < g.removed.length; j++) { const n = g.removed[j]; if (!mine.has(n) && bindings.has(n)) ok = false; }
    }
    mine = null; return ok;
  }
  // B1: a number this page's seat may take: free in the controllers and the roster (the roster holds the room's numbers: on the host
  // every guest's, on a guest the host's records from Task 7), so a number online never comes from the controllers alone
  const freeLocal = () => { let n = 1; while (seats.controllers.list.some(x => x.player === n) || seats.roster.get(n) || bindings.has(n)) n++; return n; };
  // I1: this page's controller c takes number `to`. Another of this page's seats holding `to` (it played solo, or joined online before
  // the number came) moves aside first to a free number. The roster follows, and player.renumbered fires per move
  // quiet: no event (welcome() reports each seat once, from its number before the welcome or before an earlier one moved it aside)
  function moveSeat(c, to, quiet) {
    const from = c.player; seats.controllers.renumber(from, to);
    // a guest's roster is the host's records (N-21): its entry under `from` may be another peer's by now, so only the host moves it
    if (role !== 'guest' && seats.roster.get(from)) seats.roster.renumber(from, to);
    if (!quiet) engine.emit('player.renumbered', { seat: c.seat, from, to });
  }
  function renumberSeat(c, to, quiet = false) {
    if (c.player === to) return;
    const other = seats.controllers.list.find(x => x !== c && x.player === to);
    if (other) { if (quiet && !aside.has(other.seat)) aside.set(other.seat, other.player); moveSeat(other, freeLocal(), quiet); }
    moveSeat(c, to, quiet);
  }
  // ---- the engine join (N-19): net.hello / net.welcome / net.refused / net.seat; `join: 'manual'` leaves numbering to the game ----
  const byEngine = cfg.join === 'engine', HELLO_MS = 1000; // a hello is repeated until seat 0 is welcomed (one sent before the channel opened is lost)
  // DoS: a peer's net.seat ops are COOLDOWN steps apart (0.5 s); one sooner is refused 'busy' and does nothing, so join/leave churn
  // cannot make the host send keyframes and removals to every peer. A guest asks again after RETRY_MS (wall), one seat at a time
  const COOLDOWN = Math.round(0.5 * hz), RETRY_MS = 600, seatOpAt = new Map(); // seatOpAt: host, transport peer id -> step of its last seat op
  let peerKeyWords = null, helloAt = -Infinity, refusedAll = false; // N6: peerKeyWords is net.open's key (the send loop has `key` booleans)
  let retryMask = 0, retryAt = 0, lastReason = null; // guest: seats whose op the host found busy (bit per seat); host: the last refusal's reason
  const aside = new Map(); // a guest's seat -> its number before welcome() moved it aside (player.renumbered reports that one)
  const seatList = () => { const out = []; for (const c of seats.controllers.list) if (c.seat !== null) out.push(c.seat); return out; };
  function hello() {
    helloAt = engine.time.wall;
    if (!peerKeyWords) return warn('net: no peer key', 'net.open has no key: the engine join needs createPort({ key }) (N-18)');
    engine.net.send(hostId, { t: 'net.hello', key: peerKeyWords, seats: seatList(), schema: cfg.schema }, true);
  }
  const taken = n => seats.roster.get(n) !== undefined || bindings.has(n); // the roster holds this page's, the guests' and the inactive
  const freeNumber = () => { for (let n = 2; n <= cfg.maxPlayers; n++) if (!taken(n)) return n; return null; };
  function refuse(peer, seat, reason) { // M4: the host's own seat hears it as an event, a guest's page as net.refused (then the event)
    lastReason = reason;
    if (peer === null) engine.emit('player.refused', { seat, reason, local: true });
    else engine.net.send(peer, { t: 'net.refused', reason, seat }, true);
    return 0;
  }
  // host: a number for (peer, seat), or 0 once refused; peer null is the host's own seat (N-19, N-20). A guest's request never throws
  // out of the step: a throwing game admit or a broken admit contract (a taken number: a reload with a key the old peer still holds)
  // refuses that seat 'admit' and warns once per peer; the host's own seat still throws, so a game bug is loud locally (N9)
  function admitSeat(peer, k, seat) {
    if (peer === null) return admitRule(null, k, seat);
    try { return admitRule(peer, k, seat); } catch (err) { warn(`net: admit refused a seat of ${peer}`, err); return refuse(peer, seat, 'admit'); }
  }
  function admitRule(peer, k, seat) {
    if (peer !== null) { const n = numberAt(peer, seat); if (n !== undefined) return n; } // a repeated hello or ask (M-19, S1): the same answer
    const count = peer === null ? locals.size : peerNums.get(peer)?.size ?? 0;
    if (count >= cfg.maxSeats) return refuse(peer, seat, 'seats');
    const r = cfg.admit ? cfg.admit({ key: k, seat, peer, players: engine.players }) : freeNumber();
    if (r === null) return refuse(peer, seat, 'full');
    if (typeof r === 'object') {
      if (!cfg.reasons.includes(r.refuse)) throw new Error(`net.admit: refuse reason '${r.refuse}' is not in net.reasons`);
      return refuse(peer, seat, r.refuse);
    }
    if (!Number.isInteger(r) || r < 2 || r > cfg.maxPlayers) throw new Error(`net.admit: must return a number in 2..${cfg.maxPlayers}, null or { refuse } (got ${JSON.stringify(r)})`);
    if (taken(r)) throw new Error(`net.admit: player ${r} is taken`);
    if (peer !== null) bind(r, peer, k, seat);
    return r;
  }
  // N-25: a guest's seats take the room's numbers; a seat of this page holding one moves aside first (I1: renumberSeat; it is asked
  // for below: S1)
  function welcome(list) {
    const cs = seats.controllers.list, was = new Map();
    for (const { seat } of list) { const c = engine.controllerOf(seat); if (c) was.set(seat, aside.get(seat) ?? c.player); }
    for (const { seat, number } of list) {
      const c = engine.controllerOf(seat);
      if (!c) { engine.net.send(hostId, { t: 'net.seat', op: 'leave', seat }, true); continue; } // it left while asking
      renumberSeat(c, number, true);
      confirmed.add(seat); aside.delete(seat);
      if (was.get(seat) !== number) engine.emit('player.renumbered', { seat, from: was.get(seat), to: number });
    }
    // S1: a seat that joined after the hello went out (or was moved aside) is not in any welcome yet: ask for it now
    for (let i = 0; i < cs.length; i++) if (cs[i].seat !== null && !confirmed.has(cs[i].seat)) engine.net.send(hostId, { t: 'net.seat', op: 'join', seat: cs[i].seat }, true);
    refreshLocals(); if (sync()) W.lastKey.fill(-Infinity); // this page's records under the new numbers, at once
  }
  function retrySeat() { // guest: the lowest busy seat asks again for what it is now (joined and not the room's, or gone)
    const s = 31 - Math.clz32(retryMask & -retryMask), c = engine.controllerOf(s); retryMask &= ~(1 << s); retryAt = engine.time.wall + RETRY_MS;
    if (!c) engine.net.send(hostId, { t: 'net.seat', op: 'leave', seat: s }, true);
    else if (!confirmed.has(s)) engine.net.send(hostId, { t: 'net.seat', op: 'join', seat: s }, true);
  }
  function hostSeat0() { // N-20: the host's seat 0 is 1 (a page that was a guest kept the room's numbers when it went solo)
    const c = engine.controllerOf(0); if (c && c.player !== 1) renumberSeat(c, 1); // I1: a seat holding 1 moves aside first
  }
  // [C-5] lh.seat online, every role but solo (B1). Engine join: the host admits its own seats, a guest asks the host. Manual join:
  // freeLocal() on both, a guest's new seat not the room's until the game names it
  seats.route = (op, seat) => {
    if (role === 'solo') return false;
    const c = engine.controllerOf(seat);
    if (op === 'join') {
      if (c) return true;
      if (role === 'host') {
        const n = byEngine ? admitSeat(null, peerKeyWords, seat) : freeLocal();
        if (n) { seats.controllers.seat('join', seat, n); seats.roster.add(n, { seat, local: true, join: joins = (joins + 1) % 256 }); confirmed.add(seat); }
      } else {
        seats.controllers.seat('join', seat, freeLocal());
        if (byEngine && confirmed.has(0)) engine.net.send(hostId, { t: 'net.seat', op, seat }, true); // before seat 0's welcome: the next hello, or welcome() (S1)
      }
    } else {
      if (!c || seat === 0) return true; // seat 0 is the page's first player and never leaves
      const n = c.player, room = confirmed.has(seat);
      seats.controllers.seat('leave', seat); confirmed.delete(seat); aside.delete(seat);
      if (role === 'host') seats.roster.remove(n); else if (byEngine && room) engine.net.send(hostId, { t: 'net.seat', op, seat }, true);
    }
    refreshLocals(); return true;
  };
  function sendFrame(key, sender, time, groups, except) {
    let buf; try { buf = encodeFrame({ key, sender, time, groups }); } catch (err) { stats.unsent++; warn('net: frame not sent', err); return; }
    // except: a number whose own peer is skipped (the relay); 0 sends to every peer
    if (role === 'host') { for (const [peer, nums] of peerNums) if (!nums.has(except)) { engine.net.send(peer, buf, key); stats.sent++; } }
    else if (hostId !== null) { engine.net.send(hostId, buf, key); stats.sent++; }
  }
  function goSolo() { // M-41: the room closed. Other players' entities go; host-kind replicas stay as plain local entities
    if (sync()) for (let i = W.list.length - 1; i >= 0; i--) { const r = W.list[i]; if (r.kind.authority === 'owner') despawnRemote(r.e); else forgetRemote(r); }
    role = 'solo'; hostId = null; bindings.clear(); peerNums.clear(); rejected.clear(); refusedAll = false; aside.clear(); seatOpAt.clear(); retryMask = 0;
    const R = seats.roster;
    for (let i = R.list.length - 1; i >= 0; i--) { const p = R.list[i]; if (!p.local) R.remove(p.number); } // N-25: this page's players stay
    for (const c of seats.controllers.list) if (c.seat !== null && !R.get(c.player)) R.add(c.player, { seat: c.seat, local: true, quiet: true }); // a seat the room never numbered (B1)
    confirmAll(); refreshLocals();
  }

  const ctl = {
    get role() { return role; }, get hostId() { return hostId; },
    get self() { return self; }, get locals() { return locals; }, get bindings() { return bindings; },
    set self(n) { // the manual join (#77): the game names this page's number; a guest's seat 0 takes it. Solo: seat 0's number, ignored (N5)
      if (!Number.isInteger(n) || n < 0 || n > cfg.maxSender) throw new Error(`net: self must be a player number 0..${cfg.maxSender} (got ${n})`);
      if (role === 'host' && n !== 1) throw new Error('net: the host is player 1');
      if (role === 'guest') {
        if (n === 0) confirmed.delete(0);
        else { renumberSeat(engine.controllerOf(0), n); confirmed.add(0); }
      }
      refreshLocals(); if (sync()) W.lastKey.fill(-Infinity);
    },
    tunables, stats,
    player(peer, a, b) { // host: bind a transport peer's seat to its number by hand (#77, N-20); n = 0 unbinds; player(peer, n) is seat 0
      if (role !== 'host') throw new Error('net: only the host binds players');
      if (typeof peer !== 'string') throw new Error('net: player(peer, seat, n): peer must be a transport peer id');
      const seat = b === undefined ? 0 : a, n = b === undefined ? a : b;
      if (!Number.isInteger(seat) || seat < 0 || seat > 15) throw new Error(`net: player(peer, seat, n): seat must be an integer in 0..15 (got ${seat})`);
      if (n === 0) { if (b === undefined) unbindPeer(peer); else { const m = numberAt(peer, seat); if (m !== undefined) unbindNumber(m); } return; }
      if (!Number.isInteger(n) || n < 2 || n > cfg.maxSender) throw new Error(`net: player number must be 2..${cfg.maxSender} (got ${n})`);
      bind(n, peer, null, seat);
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
        if (k === PK || k === GK) throw new Error(`net: '${k.name}' is the engine's: write engine.players or engine.gameState (N-22)`);
        if (!Number.isInteger(d.netId) || d.netId < k.idMin || d.netId > k.idMax) throw new Error(`net: '${k.name}' netId must be an integer in ${k.idMin}..${k.idMax} (got ${d.netId})`);
        if (k.authority === 'owner' && d.owner !== d.netId) throw new Error(`net: '${k.name}' is an owner kind: owner must equal netId (got owner ${d.owner}, netId ${d.netId})`);
        if (role === 'guest' && k.authority === 'host') throw new Error(`net: a guest may not spawn '${k.name}' ${d.netId}: only replication spawns host kinds (E-7)`);
        if (role !== 'solo' && k.authority === 'owner' && !locals.has(d.netId)) throw new Error(`net: ${locals.size > 1 ? `players ${[...locals].join(', ')}` : `player ${self}`} may not spawn '${k.name}' ${d.netId}: only its owner does (E-7)`);
        return;
      }
      if (sync() && W.remotes.has(x)) throw new Error(`net: '${x.net}' ${x.netId} is replicated: only replication may ${op === 'despawn' ? 'despawn it' : 'change its \'net\' part'} (E-7)`);
    },
  };
  confirmAll(); refreshLocals();

  // ---- built-in handlers (3c seam): before the game's handler for the same type ----
  engine.builtin('net.open', (e, d) => {
    if (sync()) { for (let i = W.list.length - 1; i >= 0; i--) despawnRemote(W.list[i].e); W = fresh(); }
    role = d.role; hostId = d.hostId; peerKeyWords = Array.isArray(d.key) ? d.key : null; bindings.clear(); peerNums.clear(); rejected.clear();
    helloAt = -Infinity; refusedAll = false; aside.clear(); seatOpAt.clear(); retryMask = 0; // a guest's first hello goes after this step (the send clock below)
    // #77, N-25: a guest's numbers are the host's to give; its roster restarts from the host's records (B1: never a stale offline entry)
    if (role === 'host') { hostSeat0(); confirmAll(); } else { confirmed.clear(); seats.roster.clear(); }
    refreshLocals();
  });
  engine.builtin('net.peer', (e, d) => {
    if (d.event === 'peerLeft' && role === 'host') { unbindPeer(d.id); seatOpAt.delete(d.id); }
    if (d.event === 'closed') goSolo();
  });
  engine.builtin('net.frame', (e, d) => {
    if (role === 'solo' || !self || !sync()) { stats.dropped++; return; }
    let f = d[DECODED]; if (!f) try { f = frameFromJson(d.frame, reg); } catch (err) { stats.dropped++; warn('net: frame', err); return; } // a replayed tape has only the JSON
    if (role === 'host' ? !fromPeer(d.from, f) : d.from !== hostId) { stats.dropped++; return; } // #77, M-50, N-24, S2
    if (locals.has(f.sender)) return;
    stats.frames++;
    const ch = W.store.apply(f);
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], k = reg.byName.get(c.kind);
      if (k === PK) { // N-21: the guest's roster is the host's
        if (c.rec) seats.roster.apply(c.id, c.rec, locals.has(c.id));
        else { const p = seats.roster.get(c.id); if (p) seats.roster.remove(c.id, p.active ? 'left' : 'expired'); }
        continue;
      }
      if (k === GK) { if (c.rec) seats.roster.applyGame(c.rec); continue; }
      if (!guarded(k, f.sender)) { if (c.rec) receive(k, c.id, c.rec, f.time, d.at); else removed(k, c.id); continue; } // the host's: trusted
      try { // this record only
        if (c.rec) receive(k, c.id, c.rec, f.time, d.at); else removed(k, c.id);
        if (rejected.size) rejected.delete(keyOf(k, c.id));
      } catch (err) { dropped(k, c.id, err); if (role === 'host') rejected.add(keyOf(k, c.id)); }
    }
    if (role === 'host') keepForRelay(f, peerNums.get(d.from)); // after the change loop: what it dropped stays here
    forgetRemoved(f);
  });
  engine.builtin('net.hello', (e, d) => { // host (N-19): only from a port (from: a transport peer id)
    if (role !== 'host' || !byEngine || typeof d.from !== 'string') return;
    if (d.schema !== cfg.schema) { refuse(d.from, 0, 'schema'); return; } // N-6: another engine or other kinds
    if (!d.seats.includes(0)) { refuse(d.from, 0, 'seats'); return; } // S5: a page joins with its seat 0, or not at all
    const out = [], order = [...new Set(d.seats)].sort((a, b) => a - b);
    for (const seat of order) { // no seat without seat 0; past maxSeats (or a full room) one refusal ends the answer (DoS: not one per seat)
      const n = admitSeat(d.from, d.key, seat); if (n) out.push({ seat, number: n }); else if (seat === 0 || lastReason === 'seats' || lastReason === 'full' || lastReason === 'admit') break;
    }
    if (out.length) engine.net.send(d.from, { t: 'net.welcome', players: out }, true);
  });
  engine.builtin('net.seat', (e, d) => { // host: a welcomed peer's seat joins or leaves
    if (role !== 'host' || !byEngine || !peerNums.has(d.from)) return;
    const last = seatOpAt.get(d.from);
    if (last !== undefined && engine.time.step - last < COOLDOWN) { refuse(d.from, d.seat, 'busy'); return; }
    seatOpAt.set(d.from, engine.time.step);
    if (d.op === 'join') {
      const n = admitSeat(d.from, bindings.get(numberAt(d.from, 0))?.key ?? null, d.seat);
      if (n) engine.net.send(d.from, { t: 'net.welcome', players: [{ seat: d.seat, number: n }] }, true);
      return;
    }
    const n = numberAt(d.from, d.seat); if (n !== undefined && d.seat !== 0) unbindNumber(n); // seat 0 leaves with its peer
  });
  engine.builtin('net.welcome', (e, d) => { if (role === 'guest' && byEngine && d.from === hostId) welcome(d.players); });
  engine.builtin('net.refused', (e, d) => { // M4: the refused seat leaves, so the view's seat (src/view/seats.js) goes with its controller
    if (role !== 'guest' || !byEngine || d.from !== hostId) return;
    if (d.reason === 'busy') { if (!retryMask) retryAt = engine.time.wall + RETRY_MS; retryMask |= 1 << d.seat; return; } // not a refusal of the seat: ask again
    if (d.seat === 0) refusedAll = true; // the room will not take this page: no more hellos
    else if (engine.controllerOf(d.seat)) { seats.controllers.seat('leave', d.seat); confirmed.delete(d.seat); aside.delete(d.seat); refreshLocals(); }
    engine.emit('player.refused', { seat: d.seat, reason: d.reason, local: true });
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
  const sampled = (r, k, s) => { if (k.apply) k.apply(r.e, s.b, world, s); else if (s.b !== r.applied) { applyFields(k, r.e, s.b); r.applied = s.b; } };
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
          nudgeVelocity(c, b.translation(_T), b.rotation(_Q), dt, V, AV); b.setLinvel(V, true); b.setAngvel(AV, true);
        }
        continue;
      }
      if (r.fc) { if (r.fc.sample(now - r.interp.offset, now)) for (let i = 0; i < r.links.length; i++) writeLink(r.links[i], r.fc.poses[i]); continue; } // D8
      if (!r.interp.sampleInto(now, r.s)) continue;
      const s = r.s;
      for (let i = 0; i < r.links.length; i++) { const name = k.bodies[i]; lerpPose(s.a[name], s.b[name], s.k, r.pose); writeLink(r.links[i], r.pose); }
      if (!guarded(k, r.id)) { sampled(r, k, s); continue; } // the host's records are trusted (a game bug stays loud)
      if (r.bad === s.b) continue; // its apply threw on this record: skipped until a newer one is sampled
      try { sampled(r, k, s); } catch (err) { r.applied = r.bad = s.b; dropped(k, r.id, err); unrelay(k, r.id); }
    }
  }, { stage: 'pre', before: ['lh.scene'] });

  // ---- after every step: the send clock (N-11) ----
  engine.onStep(() => {
    if (role === 'guest' && byEngine && !refusedAll && !confirmed.has(0) && hostId !== null && engine.time.wall - helloAt >= HELLO_MS) hello();
    if (retryMask && role === 'guest' && engine.time.wall >= retryAt) retrySeat();
    if (role === 'solo' || !self || !sync()) return;
    const step = engine.time.step, list = world.with('net');
    // R-8: buckets, pairs and the group lists are refilled by index and trimmed only when their count changes (length = 0 then
    // push would drop and regrow their storage every step)
    for (let i = 0; i < W.buckets.length; i++) W.bucketN[i] = 0;
    for (let i = 0; i < list.length; i++) { // this peer's authority entities: host kinds on the host, its own owner-kind entities (every seat's) everywhere
      const e = list[i], ki = index.get(e.net); if (ki === undefined || W.remotes.has(e)) continue;
      const k = kinds[ki]; if (k.authority === 'host' ? role !== 'host' : !locals.has(e.netId)) continue;
      let o = W.own.get(e);
      if (!o) { const ring = k.remote === 'driven' ? createInputRing(k.input, batch[ki]) : null, rec = newRecord(k); W.own.set(e, o = { e, rec, ring, pair: [e.netId, rec], base: (x, out) => defaultRecord(k, x, out, ring) }); }
      if (o.ring) o.ring.push(step, e.input); // N-13: every step's input, batched per send tick
      W.buckets[ki][W.bucketN[ki]++] = o;
    }
    if (role === 'host' && PK) { // N-22: the roster and the game state are the host's records (engine join only, B3)
      const ps = seats.roster.list;
      for (let i = 0; i < ps.length; i++) W.buckets[pki][W.bucketN[pki]++] = ownState(PK, ps[i], ps[i].number);
      W.buckets[gki][W.bucketN[gki]++] = ownState(GK, seats.roster.game, 0);
    }
    for (let i = 0; i < W.buckets.length; i++) if (W.buckets[i].length !== W.bucketN[i]) W.buckets[i].length = W.bucketN[i];
    if (role === 'host' ? !peerNums.size : hostId === null) return; // nobody to send to: a joiner's first keyframe has everything
    const time = Math.floor(engine.time.wall) >>> 0;
    let nKey = 0, nDiff = 0, ownerDue = false; const keyG = W.keyG, diffG = W.diffG;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i]; if (k.authority === 'host' && role !== 'host') continue;
      const key = step - W.lastKey[i] >= keyEvery[i], diff = step % every[i] === 0; if (!key && !diff) continue;
      if (k.authority === 'owner') ownerDue = true;
      const pairs = W.pairs[i], b = W.buckets[i];
      for (let j = 0; j < b.length; j++) { const o = b[j]; o.pair[1] = k.record ? k.record(o.e, o.rec, world, o.base) : o.base(o.e, o.rec); pairs[j] = o.pair; }
      if (pairs.length !== b.length) pairs.length = b.length;
      objs[k.name] = pairs;
      try { // a record that cannot encode (a bad field value) costs this kind's frame only; the next keyframe resends what it held back
        if (key) { W.lastKey[i] = step; keyG[nKey++] = W.trackers[i].key(objs)[0]; }
        if (diff) { const g = W.trackers[i].diff(objs)[0]; if (!key && (g.records.length || g.removed.length)) diffG[nDiff++] = g; }
      } catch (err) { stats.unsent++; warn(`net: kind '${k.name}' not sent`, err); }
      objs[k.name] = undefined;
    }
    if (keyG.length !== nKey) keyG.length = nKey; if (diffG.length !== nDiff) diffG.length = nDiff;
    if (nKey) sendFrame(true, self, time, keyG, 0);
    if (nDiff) sendFrame(false, self, time, diffG, 0);
    if (role === 'host' && (ownerDue || W.gone.length)) relay(step);
  });
  engine.netPart = ctl;
  if (sync()) world.net = ctl;
  return ctl;
}
