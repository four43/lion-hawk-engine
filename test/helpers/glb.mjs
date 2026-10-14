// Builds small GLB files in memory for the asset tests: no Kenney pack, no bake.
import { MeshoptEncoder } from 'meshoptimizer';

const pad4 = n => (n + 3) & ~3;
const F32 = 5126, U16 = 5123;

// parts: [{ name, material, pos: number[], nrm?: number[], col?: number[], idx: number[] }] (one mesh node each)
// empties: [{ name, t: [x,y,z], r?: [x,y,z,w] }]; anims: [{ name, node, times: number[], values: number[] }] (translation)
// skin: true adds a 1-joint skin to the first part. meshopt: true stores every buffer view with EXT_meshopt_compression.
export async function makeGlb({ parts, empties = [], anims = [], skin = false, meshopt = false }) {
  const views = [], accessors = [], chunks = []; let off = 0;
  const push = (arr, type, comp, count, target, extra = {}) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push({ off, bytes }); views.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    off = pad4(off + bytes.byteLength);
    accessors.push({ bufferView: views.length - 1, componentType: comp, count, type, ...extra });
    return accessors.length - 1;
  };
  const nodes = [], meshes = [], materials = [], matIndex = new Map();
  const mat = name => { if (!matIndex.has(name)) { matIndex.set(name, materials.length); materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }); } return matIndex.get(name); };
  for (const p of parts) {
    const n = p.pos.length / 3, min = [0, 1, 2].map(k => Math.min(...p.pos.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map(k => Math.max(...p.pos.filter((_, i) => i % 3 === k)));
    const attributes = { POSITION: push(new Float32Array(p.pos), 'VEC3', F32, n, 34962, { min, max }) };
    if (p.nrm) attributes.NORMAL = push(new Float32Array(p.nrm), 'VEC3', F32, n, 34962);
    if (p.col) attributes.COLOR_0 = push(new Float32Array(p.col), 'VEC3', F32, n, 34962);
    const indices = push(new Uint16Array(p.idx.length % 2 ? [...p.idx, 0] : p.idx), 'SCALAR', U16, p.idx.length, 34963);
    meshes.push({ primitives: [{ attributes, indices, material: mat(p.material) }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1 });
  }
  for (const e of empties) nodes.push({ name: e.name, translation: e.t, ...(e.r ? { rotation: e.r } : {}) });
  const animations = anims.map(a => {
    const input = push(new Float32Array(a.times), 'SCALAR', F32, a.times.length, 0, { min: [Math.min(...a.times)], max: [Math.max(...a.times)] });
    const output = push(new Float32Array(a.values), 'VEC3', F32, a.times.length, 0);
    return { name: a.name, samplers: [{ input, output, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: nodes.findIndex(x => x.name === a.node), path: 'translation' } }] };
  });
  const json = { asset: { version: '2.0' }, scene: 0, nodes, meshes, materials, animations, buffers: [], bufferViews: views, accessors };
  let skins;
  if (skin) {
    const p = parts[0], n = p.pos.length / 3;
    const joints = push(new Uint16Array(n * 4), 'VEC4', U16, n, 34962), weights = push(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 'VEC4', F32, n, 34962);
    const ibm = push(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 'MAT4', F32, 1, 0);
    Object.assign(meshes[0].primitives[0].attributes, { JOINTS_0: joints, WEIGHTS_0: weights });
    nodes.push({ name: 'bone' }); const bone = nodes.length - 1;
    nodes[0].skin = 0; skins = [{ joints: [bone], inverseBindMatrices: ibm }]; json.skins = skins;
  }
  json.scenes = [{ nodes: nodes.map((_, i) => i) }];
  const bin = new Uint8Array(pad4(off)); for (const c of chunks) bin.set(c.bytes, c.off);
  if (!meshopt) { json.buffers.push({ byteLength: bin.byteLength }); return pack(json, bin); }
  await MeshoptEncoder.ready;
  // buffer 0: compressed data (in the GLB); buffer 1: fallback with no data (the decoder fills it)
  const enc = []; let eoff = 0;
  for (const v of views) {
    const raw = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength), acc = accessors.find(a => views[a.bufferView] === v);
    const stride = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type] * (acc.componentType === U16 ? 2 : 4);
    const index = v.target === 34963;
    const data = index ? MeshoptEncoder.encodeIndexBuffer(raw.slice(0, acc.count * 2), acc.count, 2)
      : MeshoptEncoder.encodeVertexBuffer(raw, acc.count, pad4(stride));
    enc.push({ off: eoff, data });
    v.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: eoff, byteLength: data.byteLength, byteStride: index ? 2 : pad4(stride), count: acc.count, mode: index ? 'TRIANGLES' : 'ATTRIBUTES' } };
    if (!index) v.byteStride = v.target ? pad4(stride) : undefined;
    v.buffer = 1; eoff = pad4(eoff + data.byteLength);
  }
  const cbin = new Uint8Array(pad4(eoff)); for (const e of enc) cbin.set(e.data, e.off);
  json.buffers.push({ byteLength: cbin.byteLength }, { byteLength: bin.byteLength, extensions: { EXT_meshopt_compression: { fallback: true } } });
  json.extensionsUsed = ['EXT_meshopt_compression']; json.extensionsRequired = ['EXT_meshopt_compression'];
  return pack(json, cbin);
}

function pack(json, bin) {
  const js = new TextEncoder().encode(JSON.stringify(json)), jl = pad4(js.length), bl = pad4(bin.byteLength), total = 12 + 8 + jl + 8 + bl;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); out.fill(0x20, 20, 20 + jl); out.set(js, 20);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); out.set(bin, 28 + jl);
  return out;
}

// A fetch stand-in: files maps url → Uint8Array (served as bytes) or a JSON value. fetch.calls lists every url asked for.
export function fakeFetch(files) {
  const f = async url => {
    f.calls.push(url);
    const v = files[url];
    if (v === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength), json: async () => structuredClone(v) };
  };
  f.calls = [];
  return f;
}

// An <model>.anim.json as the bake writes it (overview §4.3): clips: { name: { dur, frames: [[Matrix4 per part], ...] } }
export function makeAnimJson(parts, clips, fps = 30) {
  const out = { v: 1, fps, parts, clips: {} };
  for (const [name, { dur, frames }] of Object.entries(clips)) {
    const f = new Float32Array(frames.length * parts.length * 12);
    frames.forEach((perPart, i) => perPart.forEach((m, p) => {
      const e = m.elements;
      f.set([e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10], e[12], e[13], e[14]], (i * parts.length + p) * 12);
    }));
    out.clips[name] = { dur, frames: frames.length, data: Buffer.from(f.buffer).toString('base64') };
  }
  return out;
}
