// engine.assets (A-9, A-10): baked GLBs by manifest key. Each URL is fetched and parsed once (Map<url, Promise>); a
// loaded model is a template whose materials the compiler has already replaced, and instances are clones that share its
// geometry and materials (SkeletonUtils.clone for skinned models, so each clone animates on its own skeleton).
// View only: headless engines and sim code have no assets.
import { Vector3, Quaternion } from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { sharedLoader, loadGlb, loadJson } from './loader.js';
import { decodeAnimTable } from './animTable.js';
import { instancedPart } from '../instancing/parts.js';

export function createAssets({ manifest, base = './assets/', compiler = null, renderer = null, gfx = null, decoders = {}, fetch = globalThis.fetch } = {}) {
  if (!manifest || manifest.v !== 1 || typeof manifest.models !== 'object') throw new Error(`assets: manifest must be baked/manifest.json with v: 1 (got ${manifest ? `v${manifest.v}` : manifest})`);
  if (!base.endsWith('/')) base += '/';
  const loader = sharedLoader({ ...decoders, renderer });
  const files = new Map();    // url → Promise (the A-9 cache)
  const tracked = new Map();  // key → Promise (progress counts each key once)
  const ready = new Map();    // key → frozen { scene, clips, anim, sockets }
  const skinned = new Set();
  const progress = { loaded: 0, total: 0, bytes: 0 };
  let disposed = false;

  const entry = key => {
    const m = manifest.models[key];
    if (!m) throw new Error(`assets: unknown asset '${key}' (the manifest has ${Object.keys(manifest.models).join(', ') || 'no models'})`);
    return m;
  };
  const once = (url, load) => {
    let p = files.get(url);
    if (!p) { p = load(); files.set(url, p); p.catch(() => { if (files.get(url) === p) files.delete(url); }); } // a failure can be retried
    return p;
  };

  function template(key, gltf, anim) {
    const scene = gltf.scene, sockets = {};
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (o.isSkinnedMesh) skinned.add(key);
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; // engine default; re-apply the compiler after changing receiveShadow
        o.geometry.userData.lhShared = true;         // clones share it; disposeTree skips it, assets.dispose frees it
      }
      if (o.name.startsWith('sock-')) {
        const p = new Vector3(), q = new Quaternion();
        o.matrixWorld.decompose(p, q, new Vector3());
        sockets[o.name.slice(5)] = Object.freeze({ name: o.name, p: Object.freeze(p.toArray()), q: Object.freeze(q.toArray()) });
      }
    });
    if (compiler) {
      const old = new Set();
      scene.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) old.add(m); });
      compiler.apply(scene);
      for (const m of old) m.dispose(); // glTF's own materials; their textures live on as the compiled materials' maps
    }
    return Object.freeze({ scene, clips: gltf.animations, anim, sockets: Object.freeze(sockets) });
  }

  async function load(key) {
    const m = entry(key), glbUrl = base + m.glb, animUrl = m.anim ? base + m.anim : null;
    try {
      const [g, anim] = await Promise.all([
        once(glbUrl, () => loadGlb(glbUrl, { fetch, loader })),
        animUrl ? once(animUrl, () => loadJson(animUrl, { fetch }).then(decodeAnimTable)) : null,
      ]);
      if (!disposed && !ready.has(key)) ready.set(key, template(key, g.gltf, anim));
    } catch (err) {
      throw new Error(`assets: failed to load '${key}' (${glbUrl}): ${err.message}`, { cause: err });
    }
  }

  function track(key) {
    let p = tracked.get(key);
    if (p) return p;
    progress.total++;
    p = load(key).then(() => { progress.loaded++; progress.bytes += manifest.models[key].bytes ?? 0; });
    tracked.set(key, p);
    p.catch(() => { tracked.delete(key); progress.total--; });
    return p;
  }

  // A-10: resolves once every key is loaded and compiled, then after gfx.warm() (M-12). instanced: the keys view sync will
  // draw 'instanced' (or createCrowd): their instanced variants are made now, so warm compiles them (painted parts with
  // instance colours) instead of the first spawn. lod (A-17): the keys drawn by createLodInstances / createScatter: their
  // LOD_FADE instanced variants and depth twins are made now too.
  async function preload(keys, { instanced = [], lod = [] } = {}) {
    if (disposed) throw new Error('assets: preload after dispose');
    const list = [...new Set(keys)];
    for (const k of list) entry(k);
    for (const k of instanced) if (!list.includes(k)) throw new Error(`assets: preload { instanced } names '${k}', which is not in keys`);
    for (const k of lod) if (!list.includes(k)) throw new Error(`assets: preload { lod } names '${k}', which is not in keys`);
    await Promise.all(list.map(track));
    const materials = [], depth = [];
    if (compiler) for (const k of new Set(instanced)) ready.get(k).scene.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const { holder, paint } = instancedPart(o, compiler), use = paint ? 'instancedColor' : 'instanced';
      materials.push({ material: holder.material, use });
      if (holder.customDepthMaterial) depth.push({ material: holder.customDepthMaterial, use, side: holder.material.side });
    });
    if (compiler) for (const k of new Set(lod)) ready.get(k).scene.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
      const name = o.userData.lhMat?.[0] ?? o.material?.name ?? '';
      if (name.startsWith('paint-')) return;
      const material = compiler.get(name, { instanced: true, vertexColors: !!o.geometry.attributes.color, receiveShadow: true, lodFade: true });
      materials.push({ material, use: 'instanced' });
      depth.push({ material: compiler.depth(material), use: 'instanced', side: material.side });
    });
    if (gfx?.warm) await gfx.warm(materials.length ? { materials, depth } : undefined);
  }

  function get(key) {
    const t = ready.get(key);
    if (t) return t;
    entry(key);
    throw new Error(`assets: '${key}' is not loaded; await assets.preload(['${key}']) first`);
  }

  function clone(key, { paint = null, instanced = false } = {}) {
    const t = get(key);
    const root = skinned.has(key) ? SkeletonUtils.clone(t.scene) : t.scene.clone(true);
    if (compiler && (paint || instanced)) compiler.apply(root, { paint, instanced });
    return root;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const textures = new Set();
    for (const t of ready.values()) t.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    });
    for (const tx of textures) tx.dispose();
    ready.clear(); files.clear(); tracked.clear();
  }

  // not frozen: 3e's render-pipeline test assigns onto assets.dispose
  return { preload, progress, has: key => ready.has(key), get, clone, dispose };
}
