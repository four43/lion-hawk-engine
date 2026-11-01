// lion-hawk bake (A-1…A-8 with D2): sources in bake.src → optimised GLBs, anim tables and one phys.json in bake.out.
// bake({ game, ids, check, log }) → { ok, baked: [ids], stale: [{ id, why }] }. `check` writes nothing: it reports models whose
// source sha, the registry hash or the engine major.minor differ from phys.json, whose bake options in game.config.js changed
// (manifest.json's options hash), and sources added or removed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { loadConfig, importFresh } from './config.js';
import { getIO, applyRenames, paletteToVertex, MeshoptEncoder } from './read.js';
import { classify } from './conventions.js';
import { collidersOf, boundsOf } from './colliders.js';
import { socketsOf } from './sockets.js';
import { massOf } from './mass.js';
import { animTable } from './animTable.js';
import { optimise } from './optimise.js';
import { compressTextures } from './textures.js';
import { aeroOf } from './aero.js';
import { checkLodBounds, lodTris } from './lods.js';
import { readBaked, writeBaked, sha256 } from './write.js';
export { loadConfig };

export const ENGINE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const minor = v => v.split('.').slice(0, 2).join('.');
const DEFAULT_OPTS = { static: false, keepTextures: false, sockets: [], colliders: true, animTable: null, rename: { materials: {}, nodes: {} } };
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v ?? null);
// everything in game.config.js that changes a model's bake output, hashed (manifest.models[id].options; --check compares it)
export const optionsHash = (cfg, opts) => sha256(canonical({ model: { ...(opts ?? DEFAULT_OPTS), file: undefined }, rename: cfg.bake.rename,
  palette: cfg.bake.palette ?? null, paint: cfg.bake.paint.base, optimise: cfg.bake.optimise,
  ...(cfg.bake.textures ? { textures: cfg.bake.textures } : {}) })).slice(0, 16); // [A-3] only when set: older bakes stay current

// id → { file (absolute), rel (relative to the game dir), opts }
export function sources(cfg) {
  const dir = resolve(cfg.dir, cfg.bake.src), out = new Map(), claimed = new Set();
  for (const [id, m] of Object.entries(cfg.bake.models)) if (m.file) claimed.add(m.file);
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.(glb|gltf)$/.test(f)).sort() : [];
  for (const f of files) if (!claimed.has(f)) out.set(basename(f, extname(f)), f);
  for (const [id, m] of Object.entries(cfg.bake.models)) if (m.file) out.set(id, m.file);
  const res = new Map();
  for (const id of [...out.keys()].sort()) {
    const f = out.get(id), file = join(dir, f);
    if (!existsSync(file)) throw new Error(`bake: ${id}: source ${join(cfg.bake.src, f)} not found`);
    res.set(id, { file, rel: join(cfg.bake.src, f).split('\\').join('/'), opts: cfg.bake.models[id] ?? null });
  }
  for (const id of Object.keys(cfg.bake.models)) if (!res.has(id)) throw new Error(`bake: ${id}: configured in bake.models but no source in ${cfg.bake.src}`);
  return res;
}

export async function loadRegistry(cfg) {
  if (!cfg.bake.materials) throw new Error('config: bake.materials is required (module whose default export is the registry)');
  const reg = (await importFresh(resolve(cfg.dir, cfg.bake.materials))).default;
  if (!reg || typeof reg.has !== 'function' || typeof reg.density !== 'function' || typeof reg.hash !== 'string')
    throw new Error(`config: ${cfg.bake.materials} default export is not a material registry (needs has, density, hash)`);
  if (!reg.has(cfg.bake.paint.base)) throw new Error(`config: bake.paint.base '${cfg.bake.paint.base}' is not in the registry`);
  return reg;
}

export async function bakeModel(cfg, registry, id, { file, rel, opts }, log = () => {}) {
  const m = opts ?? DEFAULT_OPTS;
  const io = await getIO(), bytes = readFileSync(file), doc = await io.read(file);
  applyRenames(doc, { materials: { ...cfg.bake.rename.materials, ...m.rename.materials }, nodes: { ...cfg.bake.rename.nodes, ...m.rename.nodes } });
  if (cfg.bake.palette === 'vertex' && !m.keepTextures) paletteToVertex(doc, id);
  const cls = classify(doc, id, { registry, sockets: m.sockets });
  if (cls.lods) checkLodBounds(cls.lods, id); // [A-12] cls.parts is lod0's alone, so the sidecar below never sees lod1+
  const colliders = m.colliders ? collidersOf(cls, { model: id, static: m.static, paintBase: cfg.bake.paint.base, warn: log }) : [];
  const mp = massOf(colliders, mat => registry.density(mat));
  const round = v => Math.round(v * 1e6) / 1e6 + 0;
  const sidecar = {
    v: 1, source: { file: rel, sha256: sha256(bytes) }, parts: cls.parts.map(p => p.name), colliders,
    mass: { mass: round(mp.mass), com: mp.com.map(round), inertia: mp.inertia.map(round), frame: mp.frame.map(round) },
    sockets: socketsOf(cls.socks), bounds: boundsOf(cls.parts),
    ...(m.aero ? { aero: aeroOf(cls.parts) } : {}), // [A-5]
  };
  const anim = m.animTable ? animTable(doc, id, [...cls.parts, ...cls.socks.map(s => ({ node: s.node, name: `sock-${s.name}` }))], m.animTable) : null;
  for (const col of cls.cols) {
    const mesh = col.node.getMesh(); col.node.dispose();
    if (!mesh.listParents().some(p => p.propertyType === 'Node')) mesh.dispose();
  }
  await optimise(doc, { ...cfg.bake.optimise, keepAttributes: m.keepTextures }, { encoder: MeshoptEncoder }); // a textured model keeps every attribute
  await compressTextures(doc, cfg.bake.textures); // [A-3] after prune, so only the textures that ship are encoded
  const lods = cls.lods ? lodTris(cls.lods, id, log) : null; // [A-12] after optimise: the triangles that ship
  return { id, sidecar, glb: await io.writeBinary(doc), anim, options: optionsHash(cfg, opts), ...(lods ? { lods } : {}) };
}

export async function bake({ game = '.', ids = [], check = false, log = console.log } = {}) {
  const cfg = typeof game === 'string' ? await loadConfig(game) : game;
  const registry = await loadRegistry(cfg), src = sources(cfg), outDir = resolve(cfg.dir, cfg.bake.out), prev = readBaked(outDir);
  for (const id of ids) if (!src.has(id)) throw new Error(`bake: ${id}: no such model in ${cfg.bake.src}`);
  if (check) {
    const stale = [], phys = prev.phys;
    if (!phys) { const stale = [{ id: '*', why: 'no phys.json' }]; log(`stale: *: no phys.json`); return { ok: false, baked: [], stale }; }
    if (phys.materials !== registry.hash) stale.push({ id: '*', why: `registry hash ${phys.materials} → ${registry.hash}` });
    if (minor(phys.engine) !== minor(ENGINE_VERSION)) stale.push({ id: '*', why: `engine ${phys.engine} → ${ENGINE_VERSION}` });
    for (const [id, s] of src) {
      const side = phys.models[id];
      if (!side) stale.push({ id, why: 'not baked' });
      else if (side.source.sha256 !== sha256(readFileSync(s.file))) stale.push({ id, why: 'source changed' });
      else if (prev.manifest?.models?.[id]?.options !== optionsHash(cfg, s.opts)) stale.push({ id, why: 'bake options changed' });
    }
    for (const id of Object.keys(phys.models)) if (!src.has(id)) stale.push({ id, why: 'source removed' });
    for (const s of stale) log(`stale: ${s.id}: ${s.why}`);
    return { ok: stale.length === 0, baked: [], stale };
  }
  const changed = prev.phys && (prev.phys.materials !== registry.hash || minor(prev.phys.engine) !== minor(ENGINE_VERSION));
  if (ids.length && (changed || !prev.phys)) log('bake: no phys.json yet, or the registry hash or engine version changed, so every model is baked');
  const full = !ids.length || changed || !prev.phys, todo = full ? [...src.keys()] : ids, results = [];
  for (const id of todo) {
    const r = await bakeModel(cfg, registry, id, src.get(id), log);
    results.push(r);
    log(`baked ${id}: ${r.sidecar.parts.length} parts, ${r.sidecar.colliders.length} colliders, ${r.glb.byteLength} bytes${r.anim ? `, ${Object.keys(r.anim.clips).length} clips` : ''}${r.lods ? `, lods ${r.lods.join('/')} tris` : ''}`);
  }
  const keep = [...src.keys()].filter(id => !todo.includes(id));
  writeBaked(outDir, { results, engine: ENGINE_VERSION, materials: registry.hash, prev, keep, full });
  return { ok: true, baked: todo, stale: [] };
}
