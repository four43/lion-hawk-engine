// View sync (E-6, E-11, N-15; overview §4.9): every frame, World entities -> Object3Ds under one root group in gfx.scene.
// - A drawn entity whose model is not loaded yet (!assets.has(model)) is skipped, hooks included, until it is.
// - Drawn entities (`model`, draw !== false) get assets.clone(model, { paint }) (draw 'object', the default) or a slot in one
//   createInstances per (model, part) (draw 'instanced', compiled for instancing, instancedShadows, paint-<slot> parts coloured
//   per instance from e.paint). Instanced meshes double when full; a removed slot takes the last one (swap-remove). A part
//   whose instanced material has COVERAGE_INSTANCED (3f) gets instanceCoverage, written from e.coverage { dirt, rust, snow,
//   mud } when it changes (3h's coverage kit fills e.coverage; its coverageView feeds the object-drawn entities).
// - The pose is lerp(prev, curr, alpha) and a normalised nlerp on the short arc (prev from world.xfPrev, curr from e.xf), plus
//   the N-15 offset (smooth.js: e.netFix, faded over world.net.tunables[e.net].smoothMs, default 150, on view.dt), times
//   e.scale. Instanced entities that did not move are not rewritten, so static props cost no upload.
// - on(match, { create, frame, remove }) decorates matching entities ('#tag', 'model:<key>', 'net:<kind>' or a predicate), in
//   registration order: create(e, obj, view) once (an undrawn entity's create may return an Object3D, which sync then poses
//   and takes out of the scene on removal; disposing it is the hook's job), frame(e, obj, alpha, view) after the pose, and
//   remove(e, obj) before the object goes. obj is null for instanced and undrawn entities. off() stops the calls.
// - A new World (engine.world replaced, or world.serial changed by clear()) drops every object and instanced mesh (S-3).
// - Each frame first advances the compiler's shared clock (compiler.time.value += view.dt, 3f's WIND), with or without a World.
// Entities are taken from world.with('xf') in spawn order. Nothing is allocated per frame: records are made when an entity
// first appears (a Map by id and an array), and the math objects are module-level.
import * as THREE from 'three';
import { instancedShadows, disposeTree } from '../render/hygiene.js';
import { createInstances } from '../instancing/instances.js';
import { newOffset, addFix, fade, applyOffset, active } from './smooth.js';

const SMOOTH_MS = 150; // N-15 default when the kind has no tune.smoothMs
const START_MAX = 16;  // instances per (model, part) before the first doubling
const _prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
const _part = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, _pp = new THREE.Vector3(), _pq = new THREE.Quaternion(), _pm2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _pm = new THREE.Matrix4();

function matcher(m) {
  if (typeof m === 'function') return m;
  if (typeof m === 'string') {
    if (m.length > 1 && m[0] === '#') { const tag = m.slice(1); return e => !!e.tags?.has?.(tag); }
    if (m.length > 6 && m.startsWith('model:')) { const key = m.slice(6); return e => e.model === key; }
    if (m.length > 4 && m.startsWith('net:')) { const kind = m.slice(4); return e => e.net === kind; }
  }
  throw new Error(`sync: bad match ${typeof m === 'string' ? `'${m}'` : String(m)} (use '#tag', 'model:<key>', 'net:<kind>' or a function)`);
}

export function createViewSync(engine, { gfx, assets = null, compiler = null, view = { dt: 0 }, root: parent = null } = {}) {
  if (!engine) throw new Error('createViewSync: engine required');
  if (!gfx?.scene?.isObject3D) throw new Error('createViewSync: gfx.scene required');
  const root = new THREE.Group(); root.name = 'lh.sync'; (parent ?? gfx.scene).add(root); // `root`: an optional parent instead of gfx.scene
  const recs = [], byId = new Map(), hooks = [], models = new Map(), groups = [];
  let world, serial = -1, frame = 0, hookVer = 0, disposed = false;

  function partsOf(model) { // one instance group per mesh of the model, made on the model's first instanced entity
    let list = models.get(model); if (list) return list;
    if (!compiler) throw new Error(`sync: model '${model}' is drawn 'instanced' but the view has no material compiler`);
    const tpl = assets.get(model).scene; tpl.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
    list = [];
    tpl.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) throw new Error(`sync: model '${model}' is skinned; draw it as 'object' or with createCrowd`);
      const name = typeof o.material?.name === 'string' ? o.material.name : '';
      const holder = new THREE.Mesh(o.geometry, o.material); holder.name = o.name; compiler.apply(holder, { instanced: true, coverage: true });
      const paint = name.startsWith('paint-') ? name.slice(6) : null, coverage = holder.material.defines?.COVERAGE_INSTANCED !== undefined;
      const inst = createInstances({ geometry: o.geometry, material: holder.material, max: START_MAX, colors: !!paint, coverage });
      inst.mesh.name = `${model}:${o.name}`; instancedShadows(inst.mesh); root.add(inst.mesh);
      const g = { inst, geometry: o.geometry, part: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), paint, coverage, owners: [] };
      list.push(g); groups.push(g);
    });
    if (!list.length) throw new Error(`sync: model '${model}' has no meshes to instance`);
    models.set(model, list); return list;
  }
  function grow(g) { // double the mesh, keeping every matrix and colour; the old mesh is disposed (geometry and material are shared)
    const old = g.inst, next = createInstances({ geometry: g.geometry, material: old.mesh.material, max: old.max * 2, colors: !!old.mesh.instanceColor, coverage: g.coverage });
    next.mesh.name = old.mesh.name;
    next.mesh.instanceMatrix.array.set(old.mesh.instanceMatrix.array); next.mesh.instanceMatrix.needsUpdate = true;
    if (old.mesh.instanceColor) { next.mesh.instanceColor.array.set(old.mesh.instanceColor.array); next.mesh.instanceColor.needsUpdate = true; }
    if (g.coverage) { next.coverage.array.set(old.coverage.array); next.coverage.needsUpdate = true; }
    next.count = old.count; instancedShadows(next.mesh); root.add(next.mesh); old.dispose(); g.inst = next;
  }
  function join(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k]; if (g.owners.length === g.inst.max) grow(g);
      const i = g.owners.length; g.owners.push(r); r.slots[k] = i; g.inst.count = i + 1;
      if (g.paint) g.inst.color(i, r.e.paint?.[g.paint] ?? '#ffffff');
      if (g.coverage) { r.cov ??= [-1, -1, -1, -1]; r.cov[0] = -1; } // written on the next cover()
    }
  }
  function cover(r) { // e.coverage -> instanceCoverage of every coverage part, only when it changed
    const c = r.e.coverage, d = c?.dirt ?? 0, ru = c?.rust ?? 0, sn = c?.snow ?? 0, m = c?.mud ?? 0, v = r.cov;
    if (v[0] === d && v[1] === ru && v[2] === sn && v[3] === m) return;
    v[0] = d; v[1] = ru; v[2] = sn; v[3] = m;
    for (let k = 0; k < r.parts.length; k++) if (r.parts[k].coverage) r.parts[k].inst.cover(r.slots[k], d, ru, sn, m);
  }
  function leave(r) {
    for (let k = 0; k < r.parts.length; k++) {
      const g = r.parts[k], i = r.slots[k], last = g.owners.length - 1;
      if (i !== last) { g.inst.copy(last, i); const moved = g.owners[last]; g.owners[i] = moved; moved.slots[k] = i; }
      g.owners.pop(); g.inst.count = last;
    }
  }
  function add(e) {
    const r = { e, id: e.id, obj: null, own: false, parts: null, slots: null, cov: null, off: newOffset(), seen: 0, hooks: [], hv: -1, wrote: false, ws: 1, at: recs.length, pv: undefined, pnodes: null };
    r.off.seq = e.netFix?.seq ?? -1; // a correction made before the entity was first drawn has nothing to smooth
    if (e.model != null && e.draw !== false) {
      if (e.draw !== undefined && e.draw !== 'object' && e.draw !== 'instanced') throw new Error(`sync: entity ${e.id} has draw ${JSON.stringify(e.draw)} (use 'object', 'instanced' or false)`);
      if (!assets) throw new Error(`sync: entity ${e.id} (model '${e.model}') is drawn but the view has no assets`);
      if (e.draw === 'instanced') { if (e.partXf) throw new Error(`sync: entity ${e.id}: partXf needs draw 'object' (instanced parts are not posed per entity)`); r.parts = partsOf(e.model); r.slots = new Array(r.parts.length); join(r); }
      else { r.obj = assets.clone(e.model, { paint: e.paint }); if (!r.obj.name) r.obj.name = `${e.model}#${e.id}`; r.own = true; root.add(r.obj); }
    }
    recs.push(r); byId.set(e.id, r);
    rematch(r);
    return r;
  }
  function rematch(r) { // hooks matched against this entity; create for each newly matching one
    const was = r.hooks; r.hooks = []; r.hv = hookVer;
    for (const h of hooks) {
      if (!h.test(r.e)) continue;
      r.hooks.push(h);
      if (was.includes(h) || !h.create) continue;
      const out = h.create(r.e, r.obj, view);
      if (out?.isObject3D && !r.obj) { r.obj = out; r.own = false; root.add(out); }
    }
  }
  // Part poses (Task 13b): find each named node once, after the create hooks, and keep A = T(-centre) · rest and the inverse of
  // its parent's rest, both in the model's own space (the object's local frame), so a frame is one compose and two multiplies.
  function bindParts(r) {
    const e = r.e, obj = r.obj; r.pv = e.partXf; r.pnodes = null;
    if (!e.partXf || !obj) return;
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), box = new THREE.Box3(), c = new THREE.Vector3();
    r.pnodes = Object.keys(e.partXf).map(name => {
      const node = obj.getObjectByName(name);
      if (!node || node === obj) {
        const names = []; obj.traverse(o => { if (o !== obj && o.name) names.push(o.name); });
        throw new Error(`sync: entity ${e.id} (model '${e.model}') has no part '${name}' for partXf (parts: ${names.join(', ')})`);
      }
      const rest = new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld);
      box.setFromObject(node);
      if (box.isEmpty()) c.setFromMatrixPosition(rest); else box.getCenter(c).applyMatrix4(inv);
      const a = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z).multiply(rest);
      const parent = new THREE.Matrix4().multiplyMatrices(inv, node.parent.matrixWorld).invert();
      return { name, node, a, parent };
    });
  }
  function poseParts(r, a, s) {
    const e = r.e, ps = r.pnodes;
    for (let k = 0; k < ps.length; k++) {
      const pn = ps[k], c = e.partXf[pn.name];
      world.partXfPrev(e, pn.name, _part);
      const pp = _part.p, pq = _part.q, cp = c.p, cq = c.q;
      _pp.set((pp.x + (cp.x - pp.x) * a) / s, (pp.y + (cp.y - pp.y) * a) / s, (pp.z + (cp.z - pp.z) * a) / s); // metres → model space
      let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
      if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // short arc, as the body
      _pq.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
      _pm2.compose(_pp, _pq, _one).multiply(pn.a).premultiply(pn.parent);
      _pm2.decompose(pn.node.position, pn.node.quaternion, pn.node.scale);
    }
  }
  function remove(r) {
    for (const h of r.hooks) h.remove?.(r.e, r.obj);
    if (r.slots) leave(r);
    if (r.obj) { r.obj.removeFromParent(); if (r.own) disposeTree(r.obj, { keepShared: true }); }
    byId.delete(r.id);
    const last = recs.pop(); if (last !== r) { recs[r.at] = last; last.at = r.at; }
  }
  function dropAll() {
    for (let n = recs.length - 1; n >= 0; n--) remove(recs[n]);
    for (const g of groups) g.inst.dispose();
    groups.length = 0; models.clear();
  }
  function pose(r, a) {
    const e = r.e, c = e.xf;
    world.xfPrev(e, _prev);
    const pp = _prev.p, pq = _prev.q, cp = c.p, cq = c.q;
    const still = pp.x === cp.x && pp.y === cp.y && pp.z === cp.z && pq.x === cq.x && pq.y === cq.y && pq.z === cq.z && pq.w === cq.w && !active(r.off);
    _p.set(pp.x + (cp.x - pp.x) * a, pp.y + (cp.y - pp.y) * a, pp.z + (cp.z - pp.z) * a);
    let bx = cq.x, by = cq.y, bz = cq.z, bw = cq.w;
    if (pq.x * bx + pq.y * by + pq.z * bz + pq.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } // q and -q: take the short arc
    _q.set(pq.x + (bx - pq.x) * a, pq.y + (by - pq.y) * a, pq.z + (bz - pq.z) * a, pq.w + (bw - pq.w) * a).normalize();
    applyOffset(r.off, _p, _q);
    const s = e.scale ?? 1;
    if (r.obj) { r.obj.position.copy(_p); r.obj.quaternion.copy(_q); r.obj.scale.setScalar(s); }
    if (r.pnodes) poseParts(r, a, s);
    if (r.slots) {
      if (r.cov) cover(r);
      if (still && r.wrote && s === r.ws) return; // static props: nothing to upload
      _m.compose(_p, _q, _s.setScalar(s));
      for (let k = 0; k < r.parts.length; k++) r.parts[k].inst.setMatrix(r.slots[k], _pm.multiplyMatrices(_m, r.parts[k].part));
      r.wrote = true; r.ws = s;
    }
  }
  const sync = {
    root,
    frame(alpha) {
      if (disposed) return;
      if (compiler?.time) compiler.time.value += view.dt || 0; // 3f's shared WIND clock, once per frame
      const w = engine.world;
      if (w !== world || (w && w.serial !== serial)) { dropAll(); world = w; serial = w ? w.serial : -1; }
      if (!w) return;
      frame++;
      const list = w.with('xf'), dt = view.dt || 0, tun = w.net?.tunables;
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        let r = byId.get(e.id);
        if (r && r.e !== e) { remove(r); r = undefined; } // a rebuilt entity under the same id
        if (!r) {
          if (e.model != null && e.draw !== false && assets && !assets.has(e.model)) continue; // still loading: made on a later frame
          r = add(e);
        }
        r.seen = frame;
        if (r.hv !== hookVer) rematch(r);
        if (r.pv !== e.partXf) bindParts(r);
        fade(r.off, dt);
        const fix = e.netFix;
        if (fix && fix.seq !== r.off.seq) addFix(r.off, fix, tun?.[e.net]?.smoothMs ?? SMOOTH_MS);
        pose(r, alpha);
        const hs = r.hooks;
        for (let k = 0; k < hs.length; k++) hs[k].frame?.(e, r.obj, alpha, view);
      }
      for (let n = recs.length - 1; n >= 0; n--) if (recs[n].seen !== frame) remove(recs[n]); // despawned
      for (let n = 0; n < groups.length; n++) groups[n].inst.commit();
    },
    objectOf(e) { const r = byId.get(e.id); return r && r.e === e && r.obj ? r.obj : undefined; },
    on(match, h = {}) {
      const hook = { test: matcher(match), create: h.create, frame: h.frame, remove: h.remove };
      hooks.push(hook); hookVer++;
      return () => { const i = hooks.indexOf(hook); if (i >= 0) { hooks.splice(i, 1); hookVer++; } };
    },
    dispose() { if (disposed) return; dropAll(); hooks.length = 0; root.removeFromParent(); disposed = true; },
  };
  return sync;
}
