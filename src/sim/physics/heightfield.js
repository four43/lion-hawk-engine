// §4.5 heightfield: callers give row-major heights, heights[iz * nx + ix] at (x0 + ix·cell, z0 + iz·cell).
// rapier3d-compat 0.14–0.21: heightfield(nrows, ncols, ...) takes SUBDIVISION counts (rows along z, columns along x),
// the (nrows+1)·(ncols+1) heights in column-major order (index iz + ix·nz), `scale` as the field's full extent, and
// centres the field on the collider's translation. Pinned here so a Rapier change fails one test, not three games.
export function heightfieldDesc(R, { nx, nz, cell, x0 = 0, z0 = 0, heights, fixInternalEdges = false }) {
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 2 || nz < 2) throw new Error(`heightfield: nx and nz must be integers >= 2 (got ${nx}, ${nz})`);
  if (!(Number.isFinite(cell) && cell > 0)) throw new Error(`heightfield: cell must be > 0 (got ${cell})`);
  if (!heights || heights.length !== nx * nz) throw new Error(`heightfield: heights must hold nx*nz = ${nx * nz} values (got ${heights?.length})`);
  const H = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) H[iz + ix * nz] = heights[iz * nx + ix];
  const sx = (nx - 1) * cell, sz = (nz - 1) * cell;
  const flags = fixInternalEdges ? R.HeightFieldFlags.FIX_INTERNAL_EDGES : undefined;
  return R.ColliderDesc.heightfield(nz - 1, nx - 1, H, { x: sx, y: 1, z: sz }, flags).setTranslation(x0 + sx / 2, 0, z0 + sz / 2);
}
