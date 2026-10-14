// Fixture models for the bake tests (3d). `node test/fixtures/models/make.mjs` rewrites game/assets/models/*.glb; the bake
// tests also call the builders to make broken models in temp dirs. Every model is plain geometry made here, so the tests never
// need the Kenney pack. build(name) → Uint8Array (GLB bytes); MODELS lists the committed ones.
import { Document, NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const S = Math.SQRT1_2;
// box of size [sx, sy, sz] centred at c: 24 vertices (flat normals), 36 indices
export function boxGeom([sx, sy, sz], c = [0, 0, 0]) {
  const pos = [], nrm = [], uv = [], idx = [], h = [sx / 2, sy / 2, sz / 2];
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [ax, sg] of faces) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0]; p[ax] = sg * h[ax]; p[u] = a * h[u]; p[v] = b * h[v];
      pos.push(p[0] + c[0], p[1] + c[1], p[2] + c[2]); const n = [0, 0, 0]; n[ax] = sg; nrm.push(...n); uv.push((a + 1) / 4, (b + 1) / 2);
    }
    idx.push(...(sg > 0 ? [base, base + 1, base + 2, base, base + 2, base + 3] : [base, base + 2, base + 1, base, base + 3, base + 2]));
  }
  return { pos, nrm, uv, idx };
}
// cylinder along x, radius r, length l, n segments, centred at the origin (caps included)
export function cylinderXGeom(r, l, n = 12) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i < n; i++) for (const x of [-l / 2, l / 2]) { const a = i / n * 2 * Math.PI; pos.push(x, r * Math.cos(a), r * Math.sin(a)); nrm.push(0, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < n; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); idx.push(a, b, a + 1, a + 1, b, b + 1); }
  for (const [x, sg] of [[-l / 2, -1], [l / 2, 1]]) {
    const c = pos.length / 3; pos.push(x, 0, 0); nrm.push(sg, 0, 0);
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; pos.push(x, r * Math.cos(a), r * Math.sin(a)); nrm.push(sg, 0, 0); }
    for (let i = 0; i < n; i++) { const a = c + 1 + i, b = c + 1 + (i + 1) % n; idx.push(...(sg > 0 ? [c, a, b] : [c, b, a])); }
  }
  return { pos, nrm, idx };
}
// a wedge (ramp) with unwelded, flat-shaded triangles: 8 triangles, 24 vertices, 6 distinct corners
export function wedgeGeom(w = 2, h = 1, d = 3) {
  const A = [-w / 2, 0, 0], B = [w / 2, 0, 0], C = [w / 2, 0, d], D = [-w / 2, 0, d], E = [-w / 2, h, 0], F = [w / 2, h, 0];
  const tris = [[A, B, C], [A, C, D], [A, F, B], [A, E, F], [E, C, F], [E, D, C], [A, D, E], [B, F, C]]; // outward winding
  const pos = [], nrm = [], idx = [];
  for (const t of tris) for (const p of t) { idx.push(pos.length / 3); pos.push(...p); nrm.push(0, 1, 0); }
  return { pos, nrm, idx };
}
export const octaGeom = (r, c = [0, 0, 0]) => {
  const P = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map(p => p.map((v, k) => v + c[k]));
  const T = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  return { pos: P.flat(), nrm: P.flatMap(() => [0, 1, 0]), idx: T.flat() };
};
export const planeGeom = (s = 1) => ({ pos: [-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], idx: [0, 2, 1, 0, 3, 2] });

// A small document builder: m = model(); m.mesh(name, [[geom, material], ...]); m.node(name, { mesh, t, r, s, extras, parent })
export function model() {
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene('Scene'), mats = new Map(), nodes = new Map();
  doc.getRoot().setDefaultScene(scene);
  const acc = (arr, type, C) => doc.createAccessor().setType(type).setArray(new C(arr)).setBuffer(buf);
  const api = {
    doc, nodes,
    material(name, extras) {
      if (!mats.has(name)) { const m = doc.createMaterial(name); if (extras) m.setExtras(extras); mats.set(name, m); }
      return mats.get(name);
    },
    prim(g, material, { mode } = {}) {
      const p = doc.createPrimitive().setAttribute('POSITION', acc(g.pos, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(g.nrm, 'VEC3', Float32Array)).setIndices(acc(g.idx, 'SCALAR', Uint16Array));
      if (g.uv) p.setAttribute('TEXCOORD_0', acc(g.uv, 'VEC2', Float32Array));
      if (g.tan) p.setAttribute('TANGENT', acc(g.tan, 'VEC4', Float32Array));
      if (g.col) p.setAttribute('COLOR_0', acc(g.col, 'VEC3', Float32Array));
      if (material !== null) p.setMaterial(api.material(material));
      if (mode !== undefined) p.setMode(mode);
      return p;
    },
    mesh(name, prims) { const m = doc.createMesh(name); for (const [g, mat, o] of prims) m.addPrimitive(api.prim(g, mat, o)); return m; },
    node(name, { mesh, t, r, s, extras, parent } = {}) {
      const n = doc.createNode(name);
      if (mesh) n.setMesh(mesh); if (t) n.setTranslation(t); if (r) n.setRotation(r); if (s) n.setScale(s); if (extras) n.setExtras(extras);
      (parent ? nodes.get(parent) : scene).addChild(n); nodes.set(name, n); return n;
    },
    // keyframes: [[t, value[]], ...] on node.path (translation | rotation | scale)
    animate(clip, nodeName, path, keys, interpolation = 'LINEAR') {
      let a = doc.getRoot().listAnimations().find(x => x.getName() === clip); if (!a) a = doc.createAnimation(clip);
      const s = doc.createAnimationSampler().setInput(acc(keys.map(k => k[0]), 'SCALAR', Float32Array))
        .setOutput(acc(keys.flatMap(k => k[1]), path === 'rotation' ? 'VEC4' : 'VEC3', Float32Array)).setInterpolation(interpolation);
      a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(nodeName)).setTargetPath(path).setSampler(s));
    },
    bytes: () => new NodeIO().writeBinary(doc),
  };
  return api;
}

const qy = deg => [0, Math.sin(deg * Math.PI / 360), 0, Math.cos(deg * Math.PI / 360)];
const qx = deg => [Math.sin(deg * Math.PI / 360), 0, 0, Math.cos(deg * Math.PI / 360)];

export const MODELS = {
  // one part, no col-*: one default hull (8 points), 1 m³ of wood
  crate() { const m = model(); m.node('body', { mesh: m.mesh('body', [[boxGeom([1, 1, 1], [0, 0.5, 0]), 'wood']]) }); return m; },
  // every collider shape, paint, extras.material, extras.part, sockets with and without a part
  cart() {
    const m = model();
    m.node('body', { t: [0, 0.5, 0], mesh: m.mesh('body', [[boxGeom([2, 0.5, 3]), 'paint-body'], [boxGeom([0.5, 0.3, 0.5], [0, 0.4, 0]), 'plastic']]) });
    m.node('col-box', { parent: 'body', r: qy(30), mesh: m.mesh('cb', [[boxGeom([2, 0.5, 3]), 'proxy']]) });
    m.node('col-box.001', { parent: 'body', t: [0, 0.5, 1], extras: { material: 'rubber' }, mesh: m.mesh('cb1', [[boxGeom([0.4, 0.2, 0.4]), 'proxy']]) });
    m.node('col-hull', { parent: 'body', mesh: m.mesh('ch', [[octaGeom(0.5, [0, 0.5, -1]), 'proxy']]) });
    m.node('sock-hitch', { parent: 'body', t: [0, 0, -1.6] });
    m.node('wheel', { t: [1.1, 0.3, 1], mesh: m.mesh('wheel', [[cylinderXGeom(0.3, 0.2), 'rubber']]) });
    m.node('col-cylinder', { parent: 'wheel', mesh: m.mesh('cc', [[cylinderXGeom(0.3, 0.2), 'proxy']]) });
    m.node('mast', { t: [0, 1.25, -1], mesh: m.mesh('mast', [[boxGeom([0.2, 1, 0.2]), 'steel']]) });
    m.node('col-capsule', { parent: 'mast', mesh: m.mesh('cp', [[boxGeom([0.2, 1, 0.2]), 'proxy']]) });
    m.node('col-sphere', { t: [0, 1, 0], extras: { part: 'body' }, mesh: m.mesh('cs', [[boxGeom([0.5, 0.5, 0.5]), 'proxy']]) });
    m.node('sock-seat', { t: [0, 1, 0], r: qx(90) });
    m.node('lamp.001', { parent: 'mast', t: [0, 0.6, 0], mesh: m.mesh('lamp', [[boxGeom([0.1, 0.1, 0.1]), 'plastic']]) });
    m.node('lamp.001', { parent: 'mast', t: [0, 0.8, 0], mesh: m.mesh('lamp', [[boxGeom([0.1, 0.1, 0.1]), 'plastic']]) });
    return m;
  },
  // static: one welded col-mesh
  ramp() { const m = model(); m.node('ramp', { mesh: m.mesh('ramp', [[wedgeGeom(), 'wood']]) }); return m; },
  // Cube Pets shape: renamed material and socket, nested parts, two clips
  pet() {
    const m = model();
    m.node('animal-pet'); m.node('root', { parent: 'animal-pet' });
    m.node('body', { parent: 'root', t: [0, 0.2, 0], mesh: m.mesh('body', [[boxGeom([0.6, 0.4, 0.8], [0, 0.2, 0]), 'colormap']]) });
    m.node('Group', { parent: 'body', t: [0, 0.4, 0.4], mesh: m.mesh('head', [[boxGeom([0.4, 0.4, 0.4]), 'colormap']]) });
    m.node('hat', { parent: 'body', t: [0, 0.7, 0.4] });
    m.node('leg-left', { parent: 'root', t: [0.2, 0.2, 0], mesh: m.mesh('leg', [[boxGeom([0.15, 0.3, 0.15], [0, -0.1, 0]), 'colormap']]) });
    m.node('leg-right', { parent: 'root', t: [-0.2, 0.2, 0], mesh: m.mesh('leg2', [[boxGeom([0.15, 0.3, 0.15], [0, -0.1, 0]), 'colormap']]) });
    m.animate('walk', 'leg-left', 'rotation', [[0, qx(-30)], [0.5, qx(30)], [1, qx(-30)]]);
    m.animate('walk', 'body', 'translation', [[0, [0, 0.2, 0]], [0.5, [0, 0.3, 0]], [1, [0, 0.2, 0]]]);
    m.animate('idle', 'body', 'scale', [[0, [1, 1, 1]], [1, [1, 1.2, 1]], [2, [1, 1, 1]]], 'STEP');
    return m;
  },
  // Kenney-style palette texture: TEXCOORD_0 + TANGENT into a 2x1 PNG (left red, right blue)
  palette() {
    const m = model(), png = new PNG({ width: 2, height: 1 });
    png.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const tex = m.doc.createTexture('colormap').setImage(PNG.sync.write(png)).setMimeType('image/png');
    m.material('colormap').setBaseColorTexture(tex);
    const g = boxGeom([1, 1, 1], [0, 0.5, 0]);
    g.uv = g.pos.map((_, i) => i).filter(i => i % 3 === 0).flatMap((_, v) => [g.pos[v * 3] < 0 ? 0.25 : 0.75, 0.5]);
    g.tan = Array.from({ length: g.pos.length / 3 }, () => [1, 0, 0, 1]).flat();
    m.node('cone', { mesh: m.mesh('cone', [[g, 'colormap']]) });
    return m;
  },
};

export const build = async name => MODELS[name]().bytes();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of Object.keys(MODELS)) writeFileSync(new URL(`./game/assets/models/${name}.glb`, import.meta.url), await build(name));
  console.log('wrote', Object.keys(MODELS).join(', '));
}
