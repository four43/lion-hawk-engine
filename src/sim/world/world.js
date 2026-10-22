// E-1…E-9 and S-3 (overview §4.4, §4.5): a World holds one main scene's entities and, with physics, its RAPIER.World.
// Determinism: ids count from 1 in spawn order (D7); pool slots go lowest-free-first; every entity list is kept in id
// order; Rapier objects are made inside spawn, in spawn order. A run depends only on the sequence of World calls,
// never on Map or Set iteration. Sim-pure: Rapier is the module the game injected (D9); this file never imports it.
import { createPool, makeXf, deadXf, INTERNAL, DYNAMIC, KINEMATIC, FIXED, BODILESS, STRIDE, PREV, CURR, isVec } from './pool.js';
import { createPlacer } from './place.js';
import { createPhysics } from '../physics/rapier.js';
import { createGroups } from '../physics/groups.js';
import { shapeDesc, materialFor, applyMaterial } from '../physics/colliders.js';
import { heightfieldDesc } from '../physics/heightfield.js';
import { createEventDrain } from '../physics/events.js';
import { defineMaterials } from '../../defs/materials.js';
import { validateCollider } from '../../defs/sidecar.js';
import { qFromYaw, qnorm } from '../../core/math.js';

const INSPECT = Symbol.for('nodejs.util.inspect.custom'); // a plain JS symbol (Node reads it): a failing assert prints a line, not the Rapier graph
// Rapier handles (and the World's own references to Rapier) are non-enumerable: a failing assert's util.inspect (customInspect off, getters on) would otherwise walk colliderSet -> every collider and WebAssembly memory
const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, configurable: true, enumerable: false });
let SERIAL = 0; // process-wide: a new World never reuses an old World's serial (the view keys on it, S-3)
const DESC_KEYS = new Set(['model', 'colliders', 'body', 'groups', 'at', 'yaw', 'q', 'tags', 'xf', 'contacts', 'sensor', 'partXf']);
const WORLD_KEYS = ['id', 'sockets', 'heightfield'];
const FIXED_PARTS = new Set(['id', 'tags', 'model', 'body', 'colliders', 'sockets', 'heightfield']);
const BODY_KEYS = new Set(['type', 'lock', 'ccd', 'linearDamping', 'angularDamping', 'sleep', 'canSleep', 'mass', 'massProps']);
const TYPES = { dynamic: DYNAMIC, kinematic: KINEMATIC, fixed: FIXED };
const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const _T = { x: 0, y: 0, z: 0 }, _W = { x: 0, y: 0, z: 0 }, _Q = { x: 0, y: 0, z: 0, w: 1 }; // Rapier's getters fill these (no per-call vectors)
const labelOf = d => (Array.isArray(d.tags) && d.tags.length ? d.tags.join(',') : d.model ?? 'entity');
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
// entity lists are kept in id (= spawn) order: binary search by id
const indexOfId = (list, id) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].id < id) lo = m + 1; else hi = m; } return lo; };
const insert = (list, e) => { const i = indexOfId(list, e.id); if (list[i] !== e) list.splice(i, 0, e); };
const drop = (list, e) => { const i = indexOfId(list, e.id); if (list[i] === e) list.splice(i, 1); };
const hasParts = (e, parts) => { for (let i = 0; i < parts.length; i++) if (e[parts[i]] === undefined) return false; return true; };
const partNames = v => Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'string' && n !== '') && new Set(v).size === v.length;
// partXf is [names] or { name: { p: [x, y, z], q: [x, y, z, w] } | null } (an initial pose for curr and prev; null: none)
const partSpec = v => Array.isArray(v) ? partNames(v)
  : v !== null && typeof v === 'object' && Object.keys(v).length > 0 && Object.entries(v).every(([n, x]) => n !== '' && (x === null || (x && typeof x === 'object' && (x.p === undefined || isVec(x.p, 3)) && (x.q === undefined || isVec(x.q, 4)))));
const partPose = () => ({ p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });

// digest: FNV-1a over float64 bits, so the checksum sees every bit of a pose or velocity (no rounding)
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const mix = (h, v) => { F64[0] = v; h = Math.imul(h ^ U32[0], 0x01000193); return Math.imul(h ^ U32[1], 0x01000193); };

let BASE = null; // §4.1: defs.materials defaults to the base library only; built once, on first need
const baseRegistry = () => (BASE ??= defineMaterials({}));

export function createWorld(engine, opts = {}) {
  const game = engine.game, phys = game.physics ?? {}, hz = game.sim.hz;
  const R = opts.rapier !== undefined ? opts.rapier : phys.rapier ?? null;
  const registry = opts.materials != null ? opts.materials : game.defs?.materials ?? baseRegistry();
  const sidecars = (opts.models !== undefined ? opts.models : game.defs?.models)?.models ?? {};
  const groups = createGroups(opts.groups ?? phys.groups ?? []);
  const ph = R ? createPhysics(R, { gravity: opts.gravity ?? phys.gravity, hz, params: opts.params ?? phys.params, timer: opts.timer ?? null }) : null;
  const pool = createPool();
  const list = [], byId = new Map(), handles = new Map(); // handles: collider handle → { e, material } (M-5)
  const slots = [], bodied = [], sleepers = [], queries = []; // live slots; dynamic + kinematic bodies; #2; { parts, list }
  const parted = []; // entities with partXf, in id order (lh.world.swap copies their parts)
  const root = { q: null, next: new Map() }, socketsOf = new Map();
  let nextId = 1, disposed = false, nBodies = 0, nColliders = 0, spawnFns = [], despawnFns = [], placer = null;

  const live = () => { if (disposed) throw new Error('world: disposed'); };
  const mine = (e, what) => {
    const r = e?.[INTERNAL];
    if (!r || r.world !== api || r.dead) throw new Error(`world.${what}: not a live entity of this World`);
    return r;
  };
  const record = (kind, fixedMass) => ({ world: api, slot: -1, kind, dead: false, awake: 1, own: null, k: 1, mass: undefined, fixedMass, parts: null });
  const modelSockets = id => {
    let s = socketsOf.get(id);
    if (!s) socketsOf.set(id, s = deepFreeze(structuredClone(sidecars[id].sockets ?? {})));
    return s;
  };

  function register(e, r) {
    Object.defineProperty(e, INTERNAL, { value: r });
    Object.defineProperty(e, INSPECT, { value: () => `Entity#${e.id} [${[...e.tags].join(', ')}${e.net !== undefined ? `${e.tags.size ? ', ' : ''}net:${e.net}${e.netId !== undefined ? '#' + e.netId : ''}` : ''}]` });
    list.push(e); byId.set(e.id, e); // ids only grow, so a push keeps id order
    if (r.slot >= 0) slots.push(r.slot);
    if (r.kind === DYNAMIC || r.kind === KINEMATIC) bodied.push(e);
    for (let i = 0; i < queries.length; i++) if (hasParts(e, queries[i].parts)) queries[i].list.push(e);
    const fns = spawnFns; for (let i = 0; i < fns.length; i++) fns[i](e, api);
  }

  // 3g request 7: per-part poses (e.partXf[name], curr, written by sim code) with a hidden prev, copied by swap
  function setParts(e, r, names) {
    if (!r.parts) { r.parts = []; e.partXf = {}; insert(parted, e); }
    const list = Array.isArray(names) ? names.map(n => [n, null]) : Object.entries(names);
    for (const [name, seed] of list) {
      if (Object.hasOwn(e.partXf, name)) continue;
      const cur = partPose(), prev = partPose();
      if (seed) for (const o of [cur, prev]) {
        if (seed.p) { o.p.x = seed.p[0]; o.p.y = seed.p[1]; o.p.z = seed.p[2]; }
        if (seed.q) { o.q.x = seed.q[0]; o.q.y = seed.q[1]; o.q.z = seed.q[2]; o.q.w = seed.q[3]; }
      }
      // rest: 2 = neither half has been through a step (unseeded), 1 = prev has not; the view draws such a half, while it still
      // holds the default pose, at the node's rest pose (a render before the first step puts wheels where the model has them)
      e.partXf[name] = cur; r.parts.push({ name, cur, prev, rest: seed ? 0 : 2 });
    }
  }

  function spawn(desc = {}) {
    live();
    const L = labelOf(desc), fail = m => { throw new Error(`world: '${L}' ${m}`); };
    for (const k of WORLD_KEYS) if (Object.hasOwn(desc, k)) fail(`may not set '${k}' (the World does)`);
    if (desc.tags !== undefined && !Array.isArray(desc.tags)) fail('tags must be an array');
    let sc = null;
    if (desc.model !== undefined) {
      if (typeof desc.model !== 'string' || !Object.hasOwn(sidecars, desc.model)) fail(`unknown model '${desc.model}'`);
      sc = sidecars[desc.model];
    }
    const entries = desc.colliders ?? sc?.colliders ?? [];
    if (!Array.isArray(entries)) fail('colliders must be an array');
    const bo = desc.body === undefined ? null : typeof desc.body === 'string' ? { type: desc.body } : desc.body;
    if (bo !== null) {
      if (typeof bo !== 'object') fail("body must be 'dynamic', 'kinematic', 'fixed' or { type, ... }");
      for (const k of Object.keys(bo)) if (!BODY_KEYS.has(k)) fail(`body.${k} is not a body option`);
      if (!Object.hasOwn(TYPES, bo.type)) fail(`body type must be 'dynamic', 'kinematic' or 'fixed' (got ${bo.type})`);
    }
    const kind = bo ? TYPES[bo.type] : entries.length ? FIXED : BODILESS; // colliders without a body sit on a fixed one
    if (kind !== BODILESS && !ph) fail('needs a body but the game has no physics.rapier');
    const at = desc.at ?? [0, 0, 0];
    if (!isVec(at, 3)) fail('at must be [x, y, z]');
    const P = { x: at[0], y: at[1], z: at[2] }, Q = { ...IDENTITY };
    if (desc.q != null) {
      if (!isVec(desc.q, 4) || Math.hypot(desc.q[0], desc.q[1], desc.q[2], desc.q[3]) === 0) fail('q must be a non-zero [x, y, z, w]');
      Q.x = desc.q[0]; Q.y = desc.q[1]; Q.z = desc.q[2]; Q.w = desc.q[3]; qnorm(Q);
    } else if (desc.yaw !== undefined) {
      if (!Number.isFinite(desc.yaw)) fail('yaw must be a finite number');
      qFromYaw(desc.yaw, Q);
    }
    // Everything that can fail is checked before any Rapier object exists or an id is taken: a throwing spawn
    // leaves nothing behind.
    let mask = 0xffffffff;
    if (desc.groups !== undefined) { try { mask = groups.mask(desc.groups.member, desc.groups.filter); } catch (err) { fail(err.message.replace(/^physics: /, '')); } }
    if (desc.material !== undefined && (desc.material === null || typeof desc.material !== 'object')) fail("material must be { part: id } (use { '*': id } for every part)");
    if (desc.contacts !== undefined && !(desc.contacts?.min >= 0)) fail('contacts must be { min: impulse >= 0 }');
    if (desc.partXf !== undefined) {
      if (!partSpec(desc.partXf)) fail('partXf must be an array of distinct part names or { name: { p, q } | null }');
      if (kind === BODILESS && desc.xf !== true) fail('partXf needs an xf (a body or xf: true)');
    }
    const mass = bo?.mass, mp = bo?.massProps;
    if (mass !== undefined) {
      if (mp !== undefined) fail('body takes mass or massProps, not both');
      if (kind !== DYNAMIC) fail('body.mass needs a dynamic body');
      if (!(Number.isFinite(mass) && mass > 0)) fail(`body.mass must be > 0 (got ${mass})`);
    }
    if (mp !== undefined && !(mp?.mass > 0 && isVec(mp.com, 3) && isVec(mp.inertia, 3))) fail('body.massProps must be { mass > 0, com: [x, y, z], inertia: [ix, iy, iz] }');
    if (kind === DYNAMIC && !entries.length && mp === undefined) fail('a dynamic body needs colliders or massProps');
    const made = [];
    for (let i = 0; i < entries.length; i++) {
      const c = entries[i], part = c.part ?? 'body', id = materialFor(c, desc.material);
      if (!registry) fail(`collider ${i} (${part}) needs a material registry: set defs.materials`);
      if (typeof id !== 'string' || !registry.has(id)) fail(`unknown material '${id}' on collider ${i} (${part})`);
      const m = registry.collider(id), density = mp !== undefined ? 0 : m.density;
      if (kind === DYNAMIC && mp === undefined && !(density > 0)) fail(`collider ${i} (${part}) has zero density ('${id}') on a dynamic body without massProps`);
      let d;
      try {
        d = shapeDesc(ph.R, c);
        if (c.p !== undefined) { if (!isVec(c.p, 3)) throw new Error('p must be [x, y, z]'); d.setTranslation(c.p[0], c.p[1], c.p[2]); }
        if (c.q !== undefined) { if (!isVec(c.q, 4)) throw new Error('q must be [x, y, z, w]'); d.setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] }); }
      } catch (err) { fail(`collider ${i} (${part}): ${err.message}`); }
      // 3b-R5: an inline entry gets 3b's full schema check (after 3c's own, so their messages stand); the resolved id stands in
      // for a material that came from desc.material.
      if (desc.colliders !== undefined) validateCollider(c.material === id ? c : { ...c, material: id }, { inline: true, materials: registry, where: `spawn '${L}'`, path: `colliders[${i}]` });
      applyMaterial(ph.R, d, m, density).setCollisionGroups(mask);
      let ev = 0;
      if (desc.sensor === true) { d.setSensor(true); ev |= ph.R.ActiveEvents.COLLISION_EVENTS; }
      if (desc.contacts !== undefined) { ev |= ph.R.ActiveEvents.CONTACT_FORCE_EVENTS; d.setContactForceEventThreshold(desc.contacts.min * hz); } // N·s → N
      if (ev) d.setActiveEvents(ev);
      made.push({ d, id, part, density });
    }

    if (desc.net !== undefined) api.net?.guard('spawn', desc); // 3i seam: may throw (a guest spawning a host kind, E-7)
    const e = { id: nextId++, tags: new Set(desc.tags ?? []) };
    if (desc.model !== undefined) e.model = desc.model;
    for (const k of Object.keys(desc)) if (!DESC_KEYS.has(k)) e[k] = desc[k]; // E-4: game fields and parts, as given
    const r = record(kind, mp !== undefined);
    if (kind !== BODILESS) {
      const RB = ph.R.RigidBodyDesc;
      const bd = kind === DYNAMIC ? RB.dynamic() : kind === KINEMATIC ? RB.kinematicPositionBased() : RB.fixed();
      bd.setTranslation(P.x, P.y, P.z).setRotation(Q);
      if (bo) {
        if (bo.lock?.rot === true) bd.lockRotations(); else if (bo.lock) bd.enabledRotations(!bo.lock.x, !bo.lock.y, !bo.lock.z);
        if (bo.ccd === true) bd.setCcdEnabled(true);
        if (bo.linearDamping !== undefined) bd.setLinearDamping(bo.linearDamping);
        if (bo.angularDamping !== undefined) bd.setAngularDamping(bo.angularDamping);
        if (bo.canSleep !== undefined) bd.setCanSleep(bo.canSleep);
        if (bo.sleep === true) bd.setCanSleep(true).setSleeping(true);
        if (mp !== undefined) bd.setAdditionalMassProperties(mp.mass, { x: mp.com[0], y: mp.com[1], z: mp.com[2] }, { x: mp.inertia[0], y: mp.inertia[1], z: mp.inertia[2] }, IDENTITY);
      }
      const body = ph.world.createRigidBody(bd);
      hide(e, 'body', body); hide(e, 'colliders', []);
      for (const m of made) {
        const c = ph.world.createCollider(m.d, body);
        e.colliders.push({ collider: c, part: m.part, material: m.id });
        handles.set(c.handle, { e, material: m.id });
      }
      body.recomputeMassPropertiesFromColliders(); // Rapier would otherwise update mass only at the next step
      if (mass !== undefined) { // D3: scale every density so the body weighs `mass`; com and inertia shape stay geometric
        r.mass = mass; r.k = mass / body.mass();
        for (let i = 0; i < made.length; i++) e.colliders[i].collider.setDensity(made[i].density * r.k);
        body.recomputeMassPropertiesFromColliders();
      }
      nBodies++; nColliders += made.length;
      if (bo?.sleep === true) sleepers.push(e);
    }
    if (kind !== BODILESS || desc.xf === true) {
      r.slot = pool.alloc(); // may double the pool: only here, at spawn
      pool.write(r.slot, PREV, P, Q); pool.write(r.slot, CURR, P, Q);
      e.xf = makeXf(pool, r.slot, e);
    }
    if (sc) e.sockets = modelSockets(desc.model);
    if (desc.partXf !== undefined) setParts(e, r, desc.partXf);
    register(e, r);
    return e;
  }

  const release = r => { const own = r.own; r.own = null; if (own) for (let i = own.length - 1; i >= 0; i--) own[i](); };
  // the entity leaves every World structure; it keeps id, tags, game fields and a frozen last pose
  function forget(e, r) {
    r.dead = true;
    if (e.colliders) { for (const c of e.colliders) handles.delete(c.collider.handle); nColliders -= e.colliders.length; delete e.colliders; }
    if (e.body) { nBodies--; delete e.body; }
    if (r.slot >= 0) { e.xf = deadXf(pool, r.slot); slots.splice(slots.indexOf(r.slot), 1); pool.free(r.slot); r.slot = -1; }
    if (r.parts) { r.parts = null; drop(parted, e); }
  }
  function despawn(e) {
    const r = e?.[INTERNAL];
    if (!r || r.world !== api || r.dead) return; // idempotent (E-7)
    if (e.net !== undefined) api.net?.guard('despawn', e); // 3i seam (never called from clear/dispose)
    const fns = despawnFns; for (let i = 0; i < fns.length; i++) fns[i](e, api); // before anything is freed
    release(r); // joints, controllers: before their bodies go
    if (e.body) ph.world.removeRigidBody(e.body); // takes its colliders with it
    else if (e.colliders) for (const c of e.colliders) ph.world.removeCollider(c.collider, false);
    forget(e, r);
    drop(list, e); byId.delete(e.id);
    if (r.kind === DYNAMIC || r.kind === KINEMATIC) drop(bodied, e);
    for (let i = 0; i < queries.length; i++) drop(queries[i].list, e);
    const s = sleepers.indexOf(e); if (s >= 0) sleepers.splice(s, 1);
  }
  function teardown() { // hooks and owned frees newest first, then every entity forgotten; Rapier objects go with the world
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], fns = despawnFns;
      for (let k = 0; k < fns.length; k++) fns[k](e, api);
      release(e[INTERNAL]);
    }
    for (let i = worldOwned.length - 1; i >= 0; i--) worldOwned[i]();
    worldOwned.length = 0;
    for (const e of list) forget(e, e[INTERNAL]);
    list.length = 0; byId.clear(); handles.clear(); bodied.length = 0; sleepers.length = 0; parted.length = 0;
    for (const q of queries) q.list.length = 0; // the same arrays: systems that cached them keep working
  }
  function clear() { live(); teardown(); pool.reset(); nextId = 1; if (ph) ph.recreate(); api.serial = ++SERIAL; }
  function dispose() { if (disposed) return; teardown(); if (ph) ph.free(); disposed = true; api.serial = ++SERIAL; }

  function query(parts) {
    const q = { parts, list: [] };
    for (const e of list) if (hasParts(e, parts)) q.list.push(e);
    queries.push(q);
    return q.list;
  }
  const child = (node, k) => {
    let x = node.next.get(k);
    if (x === undefined) { if (typeof k !== 'string') throw new Error('world.with: parts are strings'); node.next.set(k, x = { q: null, next: new Map() }); }
    return x;
  };
  // E-3: live, cached, the same array every call, in id order. Fixed arity so a per-step call allocates nothing.
  function withParts(a, b, c, d) {
    const n = arguments.length;
    if (n === 0) return list;
    if (n > 4) throw new Error('world.with: at most 4 parts');
    let node = child(root, a);
    if (n > 1) node = child(node, b);
    if (n > 2) node = child(node, c);
    if (n > 3) node = child(node, d);
    return node.q ??= query(n === 1 ? [a] : n === 2 ? [a, b] : n === 3 ? [a, b, c] : [a, b, c, d]);
  }
  function add(e, part, value) {
    const r = mine(e, 'add');
    if (FIXED_PARTS.has(part)) throw new Error(`world.add: '${part}' cannot be added after spawn`);
    if (value === undefined) throw new Error(`world.add: '${part}' needs a value`);
    if (part === 'net') api.net?.guard('add', e, value); // 3i seam
    if (part === 'partXf') {
      if (!partSpec(value)) throw new Error("world.add: 'partXf' must be an array of distinct part names or { name: { p, q } | null }");
      if (r.slot < 0) throw new Error("world.add: 'partXf' needs an xf (a body or xf: true)");
      const had = !!r.parts; setParts(e, r, value);
      if (had) return e;
    } else if (part === 'xf') {
      if (r.slot >= 0) return e;
      r.slot = pool.alloc(); slots.push(r.slot); e.xf = makeXf(pool, r.slot, e);
    } else {
      const had = e[part] !== undefined;
      e[part] = value;
      if (had) return e;
    }
    for (const q of queries) if (q.parts.includes(part) && hasParts(e, q.parts)) insert(q.list, e);
    return e;
  }
  function remove(e, part) {
    const r = mine(e, 'remove');
    if (FIXED_PARTS.has(part)) throw new Error(`world.remove: '${part}' cannot be removed (despawn the entity)`);
    if (e[part] === undefined) return e;
    if (part === 'net') api.net?.guard('remove', e); // 3i seam
    if (part === 'xf') {
      if (e.body) throw new Error('world.remove: a body entity keeps its xf');
      if (r.parts) throw new Error(`world.remove: entity ${e.id} has partXf: remove partXf before xf`);
      slots.splice(slots.indexOf(r.slot), 1); pool.free(r.slot); r.slot = -1;
    }
    if (part === 'partXf') { r.parts = null; drop(parted, e); }
    for (const q of queries) if (q.parts.includes(part)) drop(q.list, e);
    delete e[part];
    return e;
  }
  const worldOwned = []; // world.own(fn): freed on clear() and dispose(), before the Rapier world goes (3h's controllers)
  function own(e, fn) {
    if (typeof e === 'function' && fn === undefined) { live(); worldOwned.push(e); return () => { const i = worldOwned.indexOf(e); if (i >= 0) worldOwned.splice(i, 1); }; }
    const r = mine(e, 'own');
    if (typeof fn !== 'function') throw new Error('world.own: needs a function');
    (r.own ??= []).push(fn);
    return () => { const i = r.own ? r.own.indexOf(fn) : -1; if (i >= 0) r.own.splice(i, 1); };
  }
  // §4.5 joints: a descriptor { type, a, b, axis?, limits? } built from the injected Rapier, or raw Rapier joint data (L-1);
  // freed when either entity despawns (Tractor's hitch)
  const JOINT_TYPES = ['spherical', 'revolute', 'fixed', 'prismatic'];
  const vec3 = (v, what) => {
    if (!isVec(v, 3) || !v.every(Number.isFinite)) throw new Error(`world.joint: ${what} must be [x, y, z] of finite numbers, got ${JSON.stringify(v)}`);
    return { x: v[0], y: v[1], z: v[2] };
  };
  function jointData(d) {
    if (!JOINT_TYPES.includes(d.type)) throw new Error(`world.joint: unknown type ${JSON.stringify(d.type)} (one of ${JOINT_TYPES.join(', ')})`);
    const A = vec3(d.a, 'anchor a'), B = vec3(d.b, 'anchor b'), J = ph.R.JointData, axial = d.type === 'revolute' || d.type === 'prismatic';
    if (!axial && d.axis !== undefined) throw new Error(`world.joint: a ${d.type} joint takes no axis`);
    if (!axial && d.limits !== undefined) throw new Error(`world.joint: a ${d.type} joint takes no limits`);
    let data;
    if (d.type === 'spherical') data = J.spherical(A, B);
    else if (d.type === 'fixed') data = J.fixed(A, { x: 0, y: 0, z: 0, w: 1 }, B, { x: 0, y: 0, z: 0, w: 1 });
    else {
      if (d.axis === undefined) throw new Error(`world.joint: a ${d.type} joint needs an axis [x, y, z]`);
      const X = vec3(d.axis, 'axis'), n = Math.hypot(X.x, X.y, X.z);
      if (!(n > 0)) throw new Error('world.joint: axis must be non-zero');
      data = J[d.type](A, B, { x: X.x / n, y: X.y / n, z: X.z / n });
    }
    if (d.limits !== undefined) {
      const L = d.limits;
      if (!Array.isArray(L) || L.length !== 2 || !L.every(Number.isFinite) || L[0] > L[1]) throw new Error(`world.joint: limits must be [lo, hi] finite with lo <= hi, got ${JSON.stringify(L)}`);
      data.limitsEnabled = true; data.limits = [L[0], L[1]];
    }
    return data;
  }
  function joint(a, b, desc) {
    live();
    if (!a?.body || !b?.body) throw new Error('world.joint: both entities need a body');
    mine(a, 'joint'); mine(b, 'joint');
    if (desc === null || typeof desc !== 'object') throw new Error('world.joint: needs a descriptor { type, a, b, axis?, limits? } or Rapier JointData');
    const data = desc instanceof ph.R.JointData || typeof desc.jointType === 'number' ? desc : jointData(desc);
    const j = ph.world.createImpulseJoint(data, a.body, b.body, true), rec = { on: true };
    let offA, offB; // both entities drop the closure when the joint goes, so a long-lived one holds none for dead joints
    const free = () => { offA(); offB(); if (!rec.on) return; rec.on = false; if (ph.world && j.isValid()) ph.world.removeImpulseJoint(j, true); };
    offA = own(a, free); offB = own(b, free);
    return j;
  }
  // §4.5 runtime material swap (Pig Pens' slide/grip): friction and restitution always; density (and so mass) when it changes
  function setMaterial(e, part, id) {
    const r = mine(e, 'setMaterial');
    if (!registry || typeof id !== 'string' || !registry.has(id)) throw new Error(`world.setMaterial: unknown material '${id}'`);
    const m = registry.collider(id);
    if (r.kind === DYNAMIC && !r.fixedMass && !(m.density > 0)) throw new Error(`world.setMaterial: '${id}' has zero density and entity ${e.id} is dynamic without massProps`);
    let n = 0, massChanged = false;
    for (const c of e.colliders ?? []) {
      if (part !== '*' && c.part !== part) continue;
      n++;
      c.collider.setFriction(m.friction); c.collider.setRestitution(m.restitution);
      if (!r.fixedMass && registry.collider(c.material).density !== m.density) { c.collider.setDensity(m.density * r.k); massChanged = true; }
      c.material = id; handles.get(c.collider.handle).material = id;
    }
    if (n === 0) throw new Error(`world.setMaterial: entity ${e.id} has no collider on part '${part}'`);
    if (massChanged && e.body) {
      e.body.recomputeMassPropertiesFromColliders();
      if (r.mass !== undefined) { // D3: a body.mass entity keeps its declared weight; re-solve the scale over all its colliders
        const s = r.mass / e.body.mass();
        r.k *= s;
        for (const c of e.colliders) c.collider.setDensity(registry.collider(c.material).density * r.k);
        e.body.recomputeMassPropertiesFromColliders();
      }
    }
    return e;
  }

  // §4.4 step pieces, run by the lh.* systems (install.js) in this order: swap (input.apply, first), step, read, events
  // (physics.world). Nothing here allocates except Rapier's own per-call vectors.
  let drainEvents = null; // made below, once api exists
  const sys = {
    swap() {
      if (disposed) return;
      pool.swap(slots);
      for (let i = 0; i < parted.length; i++) {
        const ps = parted[i][INTERNAL].parts;
        for (let k = 0; k < ps.length; k++) {
          const c = ps[k].cur, p = ps[k].prev;
          p.p.x = c.p.x; p.p.y = c.p.y; p.p.z = c.p.z; p.q.x = c.q.x; p.q.y = c.q.y; p.q.z = c.q.z; p.q.w = c.q.w;
          if (ps[k].rest) ps[k].rest = ps[k].rest === 2 ? 1 : 0;
        }
      }
    },
    step() { if (ph && !disposed) ph.step(); },
    read() {
      if (!ph || disposed) return;
      const b = pool.buf;
      for (let i = 0; i < bodied.length; i++) {
        const e = bodied[i], r = e[INTERNAL], body = e.body, asleep = body.isSleeping();
        if (!asleep || r.awake) { // awake now, or awake at the last read: Rapier may sleep a body after moving it
          const t = body.translation(_T), q = body.rotation(_Q), o = r.slot * STRIDE + CURR;
          b[o] = t.x; b[o + 1] = t.y; b[o + 2] = t.z; b[o + 3] = q.x; b[o + 4] = q.y; b[o + 5] = q.z; b[o + 6] = q.w;
        }
        r.awake = asleep ? 0 : 1;
      }
      // #2: Rapier 0.21 wakes a body inserted asleep on its first step. Put it back to sleep unless something really
      // set it moving (Rally's afterStep thresholds, moved; one step of gravity is 0.04 m/s).
      for (let i = 0; i < sleepers.length; i++) {
        const body = sleepers[i].body, v = body.linvel(_T), w = body.angvel(_W);
        if (Math.hypot(v.x, v.y, v.z) < 0.2 && Math.hypot(w.x, w.y, w.z) < 0.5) body.sleep();
      }
      sleepers.length = 0;
    },
    events() { if (ph && !disposed) drainEvents(ph.world, ph.queue); },
  };
  function digest() {
    let h = 0x811c9dc5 | 0;
    const b = pool.buf;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], r = e[INTERNAL];
      h = mix(h, e.id);
      if (r.slot >= 0) { const o = r.slot * STRIDE + CURR; for (let k = 0; k < 7; k++) h = mix(h, b[o + k]); }
      if (r.kind === DYNAMIC) {
        const v = e.body.linvel(_T), w = e.body.angvel(_W);
        h = mix(mix(mix(h, v.x), v.y), v.z); h = mix(mix(mix(h, w.x), w.y), w.z);
      }
    }
    return { n: list.length, sum: (h >>> 0).toString(16).padStart(8, '0') };
  }
  // §4.5 heightfield: a bodiless ground entity; heights are row-major (heightfieldDesc does Rapier's layout)
  function heightfield({ nx, nz, cell, x0 = 0, z0 = 0, heights, material, groups: g, fixInternalEdges = false, tags = ['heightfield'] } = {}) {
    live();
    const fail = m => { throw new Error(`world: 'heightfield' ${m}`); };
    if (!Array.isArray(tags)) fail('tags must be an array');
    if (!ph) fail('needs a body but the game has no physics.rapier');
    if (!registry) fail('needs a material registry: set defs.materials');
    if (typeof material !== 'string' || !registry.has(material)) fail(`unknown material '${material}'`);
    let mask = 0xffffffff;
    try { mask = g !== undefined ? groups.mask(g.member, g.filter) : Object.hasOwn(groups, 'ground') ? groups.mask(['ground']) : mask; }
    catch (err) { fail(err.message.replace(/^physics: /, '')); }
    let d;
    try { d = heightfieldDesc(ph.R, { nx, nz, cell, x0, z0, heights, fixInternalEdges }); } catch (err) { fail(err.message); }
    applyMaterial(ph.R, d, registry.collider(material), 0).setCollisionGroups(mask);
    const c = ph.world.createCollider(d);
    const e = { id: nextId++, tags: new Set(tags), heightfield: Object.freeze({ nx, nz, cell, x0, z0 }), };
    hide(e, 'colliders', [{ collider: c, part: 'ground', material }]);
    handles.set(c.handle, { e, material }); nColliders++;
    register(e, record(BODILESS, true));
    return e;
  }
  // §4.5: colliders whose combine rules are not the engine's (a raw game collider wins by priority); for ?debug
  function audit() {
    const out = [];
    if (!ph || disposed) return out;
    const M = ph.R.CoefficientCombineRule;
    ph.world.forEachCollider(c => {
      const f = c.frictionCombineRule(), r = c.restitutionCombineRule();
      if (f !== M.Multiply || r !== M.Max) out.push({ handle: c.handle, entity: handles.get(c.handle)?.e.id ?? null, friction: M[f], restitution: M[r] });
    });
    return out;
  }

  const stats = {
    get entities() { return list.length; }, get bodies() { return nBodies; }, get colliders() { return nColliders; },
    get stepMs() { return ph && !disposed ? ph.stats.stepMs : 0; }, get stepMsTotal() { return ph && !disposed ? ph.stats.stepMsTotal : 0; },
  };
  const api = {
    seed: opts.seed ?? engine.seed, serial: ++SERIAL, R, materials: registry, groups, stats,
    engine, // 3h: a kit given only the World registers its systems on world.engine
    net: null, // 3i's writable slot: { guard(op, eOrDesc, value) } set by engine.netPart.attach(world)
    xf: Object.freeze({ get pool() { return pool.buf; }, stride: STRIDE }),
    get rapier() { return ph ? ph.world : null; },
    get disposed() { return disposed; },
    [INSPECT]: () => `World serial ${api.serial}, ${list.length} entities`,
    spawn, despawn, with: withParts, get: id => byId.get(id), add, remove, clear, dispose, own, joint, setMaterial,
    place: (e, target, o) => { live(); return placer.place(e, target, o); },
    socket: (e, name, out) => placer.socket(e, name, out),
    xfPrev: (e, out) => placer.xfPrev(e, out),
    partXfPrev(e, name, out = partPose()) {
      const ps = mine(e, 'partXfPrev').parts;
      if (ps) for (let k = 0; k < ps.length; k++) if (ps[k].name === name) {
        const p = ps[k].prev; out.p.x = p.p.x; out.p.y = p.p.y; out.p.z = p.p.z; out.q.x = p.q.x; out.q.y = p.q.y; out.q.z = p.q.z; out.q.w = p.q.w;
        if ('rest' in out) out.rest = ps[k].rest; // (filled when asked: out has a rest field) 2: curr and prev have not been through a step; 1: prev has not; 0: both have (or were seeded)
        return out;
      }
      throw new Error(`world.partXfPrev: entity ${e.id} has no part '${name}'`);
    },
    materialOf: h => handles.get(h)?.material,
    entityOf: h => handles.get(h)?.e,
    sys, digest, heightfield, audit,
    onSpawn(fn) { spawnFns = [...spawnFns, fn]; return () => { spawnFns = spawnFns.filter(f => f !== fn); }; },
    onDespawn(fn) { despawnFns = [...despawnFns, fn]; return () => { despawnFns = despawnFns.filter(f => f !== fn); }; },
  };
  for (const k of ['R', 'rapier', 'engine', 'xf']) { const d = Object.getOwnPropertyDescriptor(api, k); d.enumerable = false; Object.defineProperty(api, k, d); }
  placer = createPlacer(pool, () => (ph ? ph.world : null), api);
  drainEvents = createEventDrain({ emit: engine.events?.adopt ? (type, data) => engine.events.adopt(type, data) : (type, data) => engine.emit(type, data), hz, entityOf: api.entityOf, materialOf: api.materialOf }); // each payload is fresh: adopted, not copied (an engine stand-in without events.adopt: emit)
  return api;
}
