// Node and material conventions (overview §4.3, A-2, A-6, A-7). classify(doc, model, opts) walks the default scene depth
// first and returns { parts, cols, socks } with every A-2 check applied. Errors read `bake: <model>: <node|material> <problem>`.
export const SHAPES = ['box', 'sphere', 'capsule', 'cylinder', 'hull', 'mesh'];
const TRIANGLES = 4;
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
  const walk = (node, part) => {
    const name = node.getName(), mesh = node.getMesh();
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
      let unique = base;
      for (let k = 2; names.has(unique); k++) unique = `${base}-${k}`;   // Kenney repeats names (corn cobs): name-2, name-3…
      if (unique !== name) node.setName(unique);
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        if (!mat) fail(`${name} has no material`);
        if (!okMaterial(mat.getName())) fail(`material '${mat.getName()}' is not in the registry or paint-* (on ${name})`);
        if (prim.getMode() !== TRIANGLES) fail(`${name} primitive mode ${prim.getMode()} (triangles only)`);
      }
      names.add(unique); here = { node, name: unique }; parts.push(here);
    }
    for (const c of node.listChildren()) walk(c, here);
  };
  for (const n of scene.listChildren()) walk(n, null);
  for (const s of sockets) if (!sockNames.has(s)) fail(`sock-${s} missing (required socket)`);
  return { parts, cols, socks };
}
