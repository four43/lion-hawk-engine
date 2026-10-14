// kit-terrain (sim half, M-10): a heightfield World entity plus height, normal and material sampling that agree with
// Rapier's own triangles. Heights are row-major, heights[iz * nx + ix] at (x0 + ix * cell, z0 + iz * cell); the World's
// heightfield reorders them for Rapier (column-major). Rapier 0.21 splits each cell along the (ix+1, iz)–(ix, iz+1)
// diagonal, and heightAt/normalAt use the same split on the same float32 heights.
// Sim-pure (L-3): no three, no Rapier import (the World makes the collider), no clocks.

const fail = m => { throw new Error(`terrain: ${m}`); };

export function createTerrain(world, opts = {}) {
  const { nx, nz, cell, x0 = 0, z0 = 0, heights, materials, blend = null, material, groups, fixInternalEdges = false } = opts;
  if (!Number.isInteger(nx) || nx < 2 || !Number.isInteger(nz) || nz < 2) fail(`nx and nz must be integers >= 2 (got ${nx}, ${nz})`);
  if (!(cell > 0) || !Number.isFinite(cell)) fail(`cell must be a positive number (got ${cell})`);
  if (!Number.isFinite(x0) || !Number.isFinite(z0)) fail(`x0 and z0 must be finite (got ${x0}, ${z0})`);
  if (!heights || heights.length !== nx * nz) fail(`heights must have nx*nz = ${nx * nz} entries (got ${heights?.length})`);
  if (blend !== null && typeof blend !== 'function') fail('blend must be a function (x, z, out) => out');
  const H = Float32Array.from(heights); // the float32 values Rapier holds, so heightAt agrees with its ray casts
  for (let i = 0; i < H.length; i++) if (!Number.isFinite(H[i])) fail(`heights[${i}] is ${heights[i]}`);
  const reg = world.materials, ID = [];
  for (const id of reg.ids) ID[reg.index(id)] = id;
  let grid = null, fn = null;
  if (typeof materials === 'function') fn = materials;
  else if (materials instanceof Uint8Array) {
    if (materials.length !== nx * nz) fail(`materials must have nx*nz = ${nx * nz} entries, one per height sample (got ${materials.length})`);
    for (let i = 0; i < materials.length; i++) if (ID[materials[i]] === undefined) fail(`materials[${i}] = ${materials[i]} is not a registry index`);
    grid = Uint8Array.from(materials);
  } else fail('materials must be a Uint8Array of registry indices or a function (x, z) => id');
  const sx = (nx - 1) * cell, sz = (nz - 1) * cell;
  const colliderMaterial = material ?? (grid ? ID[mostCommon(grid)] : fn(x0 + sx / 2, z0 + sz / 2));
  if (!reg.has(colliderMaterial)) fail(`unknown collider material '${colliderMaterial}'`);
  const desc = { nx, nz, cell, x0, z0, heights: H, material: colliderMaterial, fixInternalEdges };
  const g = groups ?? (Object.hasOwn(world.groups, 'ground') ? { member: ['ground'] } : null);
  if (g) desc.groups = g;
  const entity = world.heightfield(desc);

  let ci = 0, cu = 0, cv = 0; // the last locate(): cell index iz * nx + ix and the in-cell coordinates
  const locate = (x, z) => {
    let fx = (x - x0) / cell, fz = (z - z0) / cell;
    fx = fx < 0 ? 0 : fx > nx - 1 ? nx - 1 : fx;
    fz = fz < 0 ? 0 : fz > nz - 1 ? nz - 1 : fz;
    let ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix > nx - 2) ix = nx - 2;
    if (iz > nz - 2) iz = nz - 2;
    cu = fx - ix; cv = fz - iz; ci = iz * nx + ix;
  };
  const nearest = (x, z) => {
    let ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell);
    ix = ix < 0 ? 0 : ix > nx - 1 ? nx - 1 : ix;
    iz = iz < 0 ? 0 : iz > nz - 1 ? nz - 1 : iz;
    return iz * nx + ix;
  };
  const terrain = {
    entity,
    grid: Object.freeze({ nx, nz, cell, x0, z0, heights: H, materials: grid }),
    heightAt(x, z) {
      locate(x, z);
      const a = H[ci], b = H[ci + 1], c = H[ci + nx], d = H[ci + nx + 1];
      return cu + cv < 1 ? a + (b - a) * cu + (c - a) * cv : d + (c - d) * (1 - cu) + (b - d) * (1 - cv);
    },
    normalAt(x, z, out) {
      locate(x, z);
      const a = H[ci], b = H[ci + 1], c = H[ci + nx], d = H[ci + nx + 1], low = cu + cv < 1;
      const gx = (low ? b - a : d - c) / cell, gz = (low ? c - a : d - b) / cell, l = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      out.x = -gx * l; out.y = l; out.z = -gz * l;
      return out;
    },
    materialAt: fn ?? ((x, z) => ID[grid[nearest(x, z)]]),
    blendAt(x, z, out) {
      if (blend) return blend(x, z, out);
      out.a = out.b = terrain.materialAt(x, z); out.w = 0;
      return out;
    },
  };
  return Object.freeze(terrain);
}

// The most common registry index in a grid (ties to the lowest index).
function mostCommon(grid) {
  const n = new Uint32Array(256);
  for (let i = 0; i < grid.length; i++) n[grid[i]]++;
  let best = 0;
  for (let k = 1; k < 256; k++) if (n[k] > n[best]) best = k;
  return best;
}
