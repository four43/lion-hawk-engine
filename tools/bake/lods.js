// Level of detail ([A-12]): classify finds a model's lod0…lodN nodes and checks their names and meshes; here the bounds check
// and the triangle counts that manifest.json records.
import { boundsOf } from './colliders.js';

export const LOD_SLACK = 0.25, LOD_MIN_SLACK = 0.05; // a level's bounds within 25% of lod0's extent (at least 5 cm) per side and axis

export function checkLodBounds(lods, model) {
  const b0 = boundsOf(lods[0].parts);
  for (const l of lods.slice(1)) {
    const b = boundsOf(l.parts);
    for (let k = 0; k < 3; k++) {
      const slack = Math.max(LOD_SLACK * (b0.max[k] - b0.min[k]), LOD_MIN_SLACK) + 1e-6;
      if (Math.abs(b.min[k] - b0.min[k]) > slack || Math.abs(b.max[k] - b0.max[k]) > slack)
        throw new Error(`bake: ${model}: ${l.name} bounds on ${'xyz'[k]} [${b.min[k]}, ${b.max[k]}] are not within ${+(slack - 1e-6).toFixed(6)} m of lod0's [${b0.min[k]}, ${b0.max[k]}]`);
    }
  }
}

// triangles under each level node (call after optimise, so the counts are what ships); more than the level before is a warning
export function lodTris(lods, model, warn = () => {}) {
  const tris = n => (n.getMesh()?.listPrimitives() ?? []).reduce((t, p) => t + (p.getIndices() ?? p.getAttribute('POSITION')).getCount() / 3, 0)
    + n.listChildren().reduce((t, c) => t + tris(c), 0);
  const out = lods.map(l => tris(l.node));
  for (let k = 1; k < out.length; k++) if (out[k] > out[k - 1]) warn(`bake: ${model}: lod${k} has more triangles than lod${k - 1} (${out[k]} > ${out[k - 1]})`);
  return out;
}
