// Shell fur geometry: the mesh is repeated `shells` more times in one geometry, and the
// FUR program pushes copy c out by c/shells of the fur length along a smoothed normal. Copy 0 is the mesh itself.
// One index buffer, so an InstancedMesh draws base and shells with one set of instance matrices and colours.
import { BufferGeometry, BufferAttribute } from 'three';

const GET = ['getX', 'getY', 'getZ', 'getW'];
const flat = a => { // interleaved (meshopt GLBs) → a plain Float32Array
  if (!a.isInterleavedBufferAttribute) return a.array;
  const o = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) o[i * a.itemSize + k] = a[GET[k]](i);
  return o;
};

// geometry: position + normal (indexed or not); mask(i) → 0..1 fur length factor for vertex i (0 = bare)
export function furGeometry(geometry, mask, { shells = 10 } = {}) {
  if (!Number.isInteger(shells) || shells < 1 || shells > 32) throw new Error(`furGeometry: shells must be an integer 1..32 (got ${shells})`);
  if (typeof mask !== 'function') throw new Error('furGeometry: mask(i) must be a function returning 0..1 per vertex');
  const pos = geometry.attributes.position, nrm = geometry.attributes.normal;
  if (!pos || !nrm) throw new Error('furGeometry: the geometry needs position and normal attributes');
  const n = pos.count, L = shells + 1;
  const idx = geometry.index ? geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  // average normals over vertices that share a position, so shells stay closed across hard edges
  const sum = new Map(), key = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < n; i++) { const k = key(i), s = sum.get(k) ?? [0, 0, 0]; s[0] += nrm.getX(i); s[1] += nrm.getY(i); s[2] += nrm.getZ(i); sum.set(k, s); }
  const out = new BufferGeometry();
  const big = (a, size, normalized = false) => { const o = new a.constructor(n * L * size); for (let c = 0; c < L; c++) o.set(a, c * n * size); return new BufferAttribute(o, size, normalized); };
  for (const [name, a] of Object.entries(geometry.attributes)) out.setAttribute(name, big(flat(a), a.itemSize, a.isInterleavedBufferAttribute ? false : a.normalized));
  const fn = new Float32Array(n * 3), fm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1;
    fn[i * 3] = s[0] / l; fn[i * 3 + 1] = s[1] / l; fn[i * 3 + 2] = s[2] / l;
    fm[i] = Math.min(1, Math.max(0, Number(mask(i)) || 0));
  }
  out.setAttribute('furNormal', big(fn, 3));
  out.setAttribute('furMask', big(fm, 1));
  const sh = new Float32Array(n * L); for (let c = 0; c < L; c++) sh.fill(c / shells, c * n, (c + 1) * n);
  out.setAttribute('furShell', new BufferAttribute(sh, 1));
  const ix = new Uint32Array(idx.length * L); for (let c = 0; c < L; c++) for (let j = 0; j < idx.length; j++) ix[c * idx.length + j] = idx[j] + c * n;
  out.setIndex(new BufferAttribute(ix, 1));
  out.addGroup(0, idx.length, 0);                   // the mesh itself (material 0 when a game passes an array)
  out.addGroup(idx.length, idx.length * shells, 1); // the shells (material 1)
  out.userData.fur = { shells };
  return out;
}
