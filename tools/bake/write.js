// Bake output (D2, overview §4.3): baked/phys.json, baked/manifest.json, baked/models/<id>.glb and <id>.anim.json. Keys are
// sorted so a re-bake of unchanged sources is byte-identical. readBaked(dir) → { phys, manifest } (empty ones when absent).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));

export function readBaked(outDir) {
  const read = (f, empty) => existsSync(join(outDir, f)) ? JSON.parse(readFileSync(join(outDir, f), 'utf8')) : empty;
  return { phys: read('phys.json', null), manifest: read('manifest.json', null) };
}

// results: [{ id, sidecar, glb: Uint8Array, anim: object | null, options: optionsHash, lods?: [tris per level] }]; prev: readBaked() of the same dir; keep: ids carried over
// from prev; full: also delete files under models/ that no model owns any more (a removed source)
export function writeBaked(outDir, { results, engine, materials, prev, keep, full = false }) {
  mkdirSync(join(outDir, 'models'), { recursive: true });
  const models = {}, entries = {};
  for (const id of keep) { if (prev.phys?.models?.[id]) models[id] = prev.phys.models[id]; if (prev.manifest?.models?.[id]) entries[id] = prev.manifest.models[id]; }
  for (const { id, sidecar, glb, anim, options, lods } of results) {
    writeFileSync(join(outDir, 'models', `${id}.glb`), glb);
    const animFile = join(outDir, 'models', `${id}.anim.json`);
    if (anim) writeFileSync(animFile, JSON.stringify(anim) + '\n'); else rmSync(animFile, { force: true });
    models[id] = sidecar;
    entries[id] = { glb: `models/${id}.glb`, anim: anim ? `models/${id}.anim.json` : null, bytes: glb.byteLength, sha256: sha256(glb), options, ...(lods ? { lods } : {}) }; // [A-12] lods only for a model with levels
  }
  if (full) {
    const owned = new Set(Object.values(entries).flatMap(e => [e.glb, e.anim]).filter(Boolean).map(f => f.slice('models/'.length)));
    for (const f of readdirSync(join(outDir, 'models'))) if (!owned.has(f)) rmSync(join(outDir, 'models', f));
  }
  writeFileSync(join(outDir, 'phys.json'), JSON.stringify({ v: 1, engine, materials, models: sorted(models) }) + '\n');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ v: 1, models: sorted(entries) }, null, 2) + '\n');
}
