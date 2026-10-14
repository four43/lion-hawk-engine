// Box-mesh stand-ins for 3f's assets and material compiler (overview §4.7, §4.8), so view sync is tested before 3f merges.
// models = { key: [{ name, material, p?: [x, y, z], skinned? }] }: each model is a Group named key of part meshes (one shared
// BoxGeometry per part) whose materials are named by registry id or paint-<slot>. compiler.apply swaps each mesh's material for
// a cached MeshLambertMaterial per (name, instanced); paint-<slot> becomes a painted clone on plain meshes and 'steel' when
// instanced (the colour then goes per instance). A material named in `covered` stands for one with a coverage block: with
// { instanced, coverage } it compiles to a variant with defines.COVERAGE_INSTANCED (3f's shared variant). compiler.time is
// 3f's shared clock { value }. assets.clone and compiler.apply calls are logged.
import * as THREE from 'three';

export function fakeAssets(models = { crate: [{ name: 'body', material: 'wood' }] }, { covered = ['mud'] } = {}) {
  const log = [], mats = new Map(), templates = new Map();
  const mat = (name, instanced, cov = false) => {
    const k = `${name}|${instanced}|${cov}`; let m = mats.get(k);
    if (!m) { m = new THREE.MeshLambertMaterial(); m.name = name; m.userData.instanced = instanced; if (cov) m.defines = { COVERAGE: '', COVERAGE_INSTANCED: '' }; mats.set(k, m); }
    return m;
  };
  const compiler = {
    time: { value: 0 },
    get(id, { instanced = false } = {}) { log.push(['get', id, instanced]); return mat(id, instanced); },
    apply(root, { instanced = false, paint, coverage = false } = {}) {
      log.push(['apply', root.name, instanced]);
      root.traverse(o => {
        if (!o.isMesh) return;
        const n = o.material.name, slot = n.startsWith('paint-') ? n.slice(6) : null;
        if (slot && !instanced) { const m = mat(n, false).clone(); m.color.set(paint?.[slot] ?? '#ffffff'); o.material = m; }
        else o.material = mat(slot ? 'steel' : n, instanced, instanced && coverage && covered.includes(n));
      });
      return root;
    },
  };
  for (const [key, parts] of Object.entries(models)) {
    const g = new THREE.Group(); g.name = key;
    for (const { name, material, p = [0, 0, 0], skinned = false } of parts) {
      const geo = new THREE.BoxGeometry(), m = new THREE.MeshBasicMaterial(); m.name = material;
      const mesh = skinned ? new THREE.SkinnedMesh(geo, m) : new THREE.Mesh(geo, m);
      mesh.name = name; mesh.position.fromArray(p); g.add(mesh);
    }
    templates.set(key, g);
  }
  const tpl = key => { const t = templates.get(key); if (!t) throw new Error(`fakeAssets: '${key}' is not preloaded`); return t; };
  const assets = {
    has: key => templates.has(key),
    get: key => ({ scene: tpl(key), clips: [], anim: null, sockets: {} }),
    clone(key, opts = {}) { log.push(['clone', key, opts]); const c = tpl(key).clone(true); compiler.apply(c, { instanced: !!opts.instanced, paint: opts.paint }); return c; },
  };
  return { assets, compiler, log };
}
