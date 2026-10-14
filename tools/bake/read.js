// Reading sources (A-1): one NodeIO with every extension and the meshopt codecs, the rename maps, and the palette → vertex
// colour step (`palette: 'vertex'`, Tractor's tools/glb.mjs logic moved here).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

let io = null;
export async function getIO() {
  if (io) return io;
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  return io;
}
export { MeshoptEncoder };

// rename = { materials: { from: to }, nodes: { from: to } }, global merged under per-model by the caller
export function applyRenames(doc, rename) {
  for (const m of doc.getRoot().listMaterials()) { const to = rename.materials[m.getName()]; if (to) m.setName(to); }
  for (const n of doc.getRoot().listNodes()) { const to = rename.nodes[n.getName()]; if (to) n.setName(to); }
}

const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
// Every primitive with a base-colour texture and TEXCOORD_0 but no COLOR_0 gets COLOR_0 (linear floats) = texel at the vertex
// UV × base colour factor (Kenney writes sRGB-looking values into the factor; used as they are, as Tractor's bake did). Its
// texture, TEXCOORD_0 and TANGENT go; the factor becomes white. Textures left unused are disposed.
export function paletteToVertex(doc, model) {
  const cache = new Map();
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), tex = mat?.getBaseColorTexture(), uv = prim.getAttribute('TEXCOORD_0');
    if (prim.getAttribute('COLOR_0') || !tex || !uv) continue;
    if (tex.getMimeType() !== 'image/png') throw new Error(`bake: ${model}: material '${mat.getName()}' palette texture is ${tex.getMimeType()} (only PNG)`);
    if (!cache.has(tex)) cache.set(tex, PNG.sync.read(Buffer.from(tex.getImage())));
    const png = cache.get(tex), f = mat.getBaseColorFactor(), n = prim.getAttribute('POSITION').getCount(), out = new Float32Array(n * 3), e = [0, 0];
    for (let i = 0; i < n; i++) {
      uv.getElement(i, e);
      const u = ((e[0] % 1) + 1) % 1, v = ((e[1] % 1) + 1) % 1;
      const px = Math.min(png.width - 1, Math.floor(u * png.width)), py = Math.min(png.height - 1, Math.floor(v * png.height)), o = (py * png.width + px) * 4;
      for (let k = 0; k < 3; k++) out[i * 3 + k] = s2l(Math.round(Math.max(0, Math.min(1, png.data[o + k] / 255 * f[k])) * 255));
    }
    const buf = doc.getRoot().listBuffers()[0];
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf));
    for (const sem of ['TEXCOORD_0', 'TANGENT']) {
      const a = prim.getAttribute(sem); prim.setAttribute(sem, null);
      if (a && !a.listParents().some(p => p !== doc.getRoot())) a.dispose();
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m.getBaseColorTexture()) {
    const users = m.listParents().filter(p => p.propertyType === 'Primitive');
    if (users.every(p => p.getAttribute('COLOR_0') && !p.getAttribute('TEXCOORD_0'))) m.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  }
  for (const t of doc.getRoot().listTextures()) if (!t.listParents().some(p => p !== doc.getRoot())) t.dispose();
}
