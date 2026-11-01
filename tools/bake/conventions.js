// Node and material conventions (overview §4.3, A-2, A-6, A-7). classify(doc, model, opts) walks the default scene depth
// first and returns { parts, cols, socks, lods } with every A-2 check applied. Errors read `bake: <model>: <node|material> <problem>`.
// lods ([A-12]): null, or [{ node, name, parts }] for lod0…lodN; `parts` holds lod0's only, so only lod0 feeds the sidecar.
export const SHAPES = ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh'];
const TRIANGLES = 4;
export const LOD = /^lod(0|[1-9]\d*)$/, MAX_LOD = 3;
// three's PropertyBinding.sanitizeNodeName, which GLTFLoader applies to every node name: parts and sockets are renamed the same
// way at bake time, so sidecar names, anim-table rows and runtime object names agree ('lamp.001' → 'lamp001').
export const sanitize = name => name.replace(/\s/g, '_').replace(/[\[\].:\/]/g, '');

// opts: { registry, sockets: required names }
export function classify(doc, model, { registry, sockets = [] }) {
  const fail = msg => { throw new Error(`bake: ${model}: ${msg}`); };
  const okMaterial = id => registry.has(id) || /^paint-[\w-]+$/.test(id);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) fail('no scene');
  const parts = [], cols = [], socks = [], names = new Set(), sockNames = new Set();
  // GLTFLoader names every node and the scene in one namespace, so parts dedupe against all non-part nodes too (col-* nodes are removed before writing).
  if (scene.getName()) names.add(sanitize(scene.getName()));
  const seed = node => {
    if (node.getName().startsWith('col-')) return;
    if (!node.getMesh() && node.getName()) names.add(sanitize(node.getName()));
    for (const c of node.listChildren()) seed(c);
  };
  for (const n of scene.listChildren()) seed(n);
  // [A-12] levels are lod0…lodN directly under the model's root: the scene, or its one top-level node (a glb-author kit model)
  const tops = scene.listChildren(), under = tops.length === 1 && !LOD.test(tops[0].getName()) ? tops[0].listChildren() : tops;
  const level = new Map(), ks = new Set();
  for (const n of under) {
    const m = LOD.exec(n.getName()); if (!m) continue;
    const k = Number(m[1]);
    if (k > MAX_LOD) fail(`${m[0]} is past lod${MAX_LOD} (at most ${MAX_LOD + 1} levels)`);
    if (ks.has(k)) fail(`${m[0]} duplicate level`);
    ks.add(k); level.set(n, k);
  }
  for (let k = 0; k < ks.size; k++) if (!ks.has(k)) fail(`lod${k} missing (levels run from lod0 without gaps, found ${[...ks].sort().map(k => `lod${k}`).join(', ')})`);
  const lods = ks.size ? [...level].sort((a, b) => a[1] - b[1]).map(([node, k]) => ({ node, name: `lod${k}`, parts: [] })) : null;
  const walk = (node, part, lv = -1) => {
    const name = node.getName(), mesh = node.getMesh();
    lv = level.get(node) ?? lv;
    if (lv > 0 && (name.startsWith('col-') || name.startsWith('sock-'))) fail(`${name} is under lod${lv} (col-* and sock-* nodes go under lod0: only lod0 feeds the sidecar)`);
    if (name.startsWith('col-')) {
      const shape = /^col-([a-z]*)/.exec(name)[1];
      if (!SHAPES.includes(shape)) fail(`${name} unsupported collider shape '${shape}'`);
      if (!mesh) fail(`${name} has no mesh`);
      if (node.listChildren().length) fail(`${name} has children (collider nodes must be leaves)`);
      for (const prim of mesh.listPrimitives()) if (prim.getMode() !== TRIANGLES) fail(`${name} primitive mode ${prim.getMode()} (triangles only)`);
      const extra = node.getExtras() ?? {};
      let owner = part;
      if (!owner && extra.part) owner = parts.find(p => p.name === extra.part) ?? fail(`${name} extras.part '${extra.part}' is not a part`);
      if (!owner) fail(`${name} has no parent part (nest it under a part or set extras.part)`);
      if (extra.material !== undefined && !okMaterial(extra.material)) fail(`${name} extras.material '${extra.material}' is not in the registry or paint-*`);
      cols.push({ node, name, shape, part: owner, material: extra.material ?? null });
      return;
    }
    if (name.startsWith('sock-')) {
      if (mesh) fail(`${name} is a socket with a mesh (sockets are empty nodes)`);
      if (sanitize(name) !== name) node.setName(sanitize(name));
      const sock = sanitize(name).slice(5);
      if (!sock || sockNames.has(sock)) fail(`${name} ${sock ? 'duplicate socket' : 'socket with no name'}`);
      sockNames.add(sock); socks.push({ node, name: sock, part: part?.name ?? null });
    }
    let here = part;
    if (mesh) {
      if (!name) fail('mesh node with no name');
      const base = sanitize(name);
      if (!base) fail(`'${name}' has an empty name after sanitising`);
      let unique = base;
      for (let k = 2; names.has(unique); k++) unique = `${base}-${k}`;   // Kenney repeats names (corn cobs): name-2, name-3…
      if (unique !== name) node.setName(unique);
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        if (!mat) fail(`${name} has no material`);
        if (!okMaterial(mat.getName())) fail(`material '${mat.getName()}' is not in the registry or paint-* (on ${name})`);
        if (prim.getMode() !== TRIANGLES) fail(`${name} primitive mode ${prim.getMode()} (triangles only)`);
      }
      names.add(unique); here = { node, name: unique };
      if (lv > 0) lods[lv].parts.push(here); else { parts.push(here); if (lv === 0) lods[0].parts.push(here); } // [A-12] lod1+ parts: no hulls, no mass
    }
    for (const c of node.listChildren()) walk(c, here, lv);
  };
  for (const n of scene.listChildren()) walk(n, null);
  for (const l of lods ?? []) if (!l.parts.length) fail(`${l.name} has no mesh (every level needs one)`);
  for (const s of sockets) if (!sockNames.has(s)) fail(`sock-${s} missing (required socket)`);
  return { parts, cols, socks, lods };
}
