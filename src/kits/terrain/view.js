// kit-terrain (view half): the terrain as chunked meshes with distance LODs and skirts (a long track
// uses chunkCells; a small map can be chunks: [6, 6] with one LOD). Each chunk builds lazily per LOD; after the
// first update, building spends at most budgetMs per call, and a chunk shows any LOD it already has meanwhile (or its
// coarsest, never a hole). Heights come from terrain.grid, so LOD 0 vertices sit exactly on the samples.
import * as THREE from 'three';

const fail = m => { throw new Error(`terrain view: ${m}`); };

// The index (each chunk geometry takes a copy) of an n×m vertex chunk plus its four skirts (bottom, top, left, right edge copies), facing out.
export function chunkIndex(n, m) {
  const idx = [], g = (i, j) => j * n + i;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = g(i, j), b = a + n, c = a + 1, d = b + 1;
    idx.push(a, b, c, b, d, c); // faces up; the split is Rapier's (ix+1, iz)–(ix, iz+1) diagonal
  }
  const edges = [[k => g(k, 0), n, [0, 0, -1], [1, 0, 0]], [k => g(k, m - 1), n, [0, 0, 1], [1, 0, 0]],
    [k => g(0, k), m, [-1, 0, 0], [0, 0, 1]], [k => g(n - 1, k), m, [1, 0, 0], [0, 0, 1]]];
  let base = n * m;
  for (const [e, len, out, t] of edges) {
    const flip = -t[2] * out[0] + t[0] * out[2] < 0; // (e_k, s_k, e_k+1) faces (-t.z, 0, t.x): flip when that points in
    for (let k = 0; k < len - 1; k++) {
      const e0 = e(k), e1 = e(k + 1), s0 = base + k, s1 = base + k + 1;
      if (!flip) idx.push(e0, s0, e1, e1, s0, s1); else idx.push(e0, e1, s0, e1, s1, s0);
    }
    base += len;
  }
  return new THREE.BufferAttribute(base > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
}

export function createTerrainMesh(terrain, opts = {}) {
  const { compiler = null, chunks = [6, 6], chunkCells = null, lods = [1], lodFar = [], hysteresis = 12, skirt = 2, visFar = Infinity,
    evict = null, colorAt = null, attributes = {}, drop = null, material = 'grass', budgetMs = 3, moveEps = 2, now = () => performance.now() } = opts;
  const G = terrain?.grid;
  if (!G) fail('terrain.grid is missing (pass the object createTerrain returned)');
  const { nx, nz, cell, x0, z0, heights: H } = G;
  if (!Array.isArray(lods) || !lods.length || lods.some((s, i) => !Number.isInteger(s) || s < 1 || (i > 0 && s <= lods[i - 1]))) {
    fail(`lods must be rising positive integers (got ${JSON.stringify(lods)})`);
  }
  if (!Array.isArray(lodFar) || lodFar.length !== lods.length - 1) fail(`lodFar needs ${lods.length - 1} distance(s) for ${lods.length} LODs (got ${JSON.stringify(lodFar)})`);
  if (!Array.isArray(chunks) || chunks.length !== 2 || chunks.some(c => !Number.isInteger(c) || c < 1)) fail(`chunks must be [x, z] counts (got ${JSON.stringify(chunks)})`);
  const extra = Object.entries(attributes);
  for (const [name, a] of extra) if (!(Number.isInteger(a?.size) && a.size >= 1 && typeof a.at === 'function')) fail(`attributes.${name} needs { size, at(x, z, out) }`);
  const mat = material?.isMaterial ? material : compiler ? compiler.get(material, { vertexColors: !!colorAt }) : fail('pass compiler (or a three.js material as material)');

  const top = lods[lods.length - 1];
  if (chunkCells !== null && !(Number.isInteger(chunkCells) && chunkCells > 0 && chunkCells % top === 0)) fail(`chunkCells must be a multiple of the coarsest LOD step ${top} (got ${chunkCells})`);
  // chunkCells fixes the chunk side; otherwise chunks counts set it, rounded up to the coarsest step
  const csx = chunkCells ?? Math.ceil(Math.ceil((nx - 1) / chunks[0]) / top) * top, csz = chunkCells ?? Math.ceil(Math.ceil((nz - 1) / chunks[1]) / top) * top;
  const ncx = chunkCells ? Math.ceil((nx - 1) / chunkCells) : chunks[0], ncz = chunkCells ? Math.ceil((nz - 1) / chunkCells) : chunks[1];
  const clx = g => (g < 0 ? 0 : g > nx - 1 ? nx - 1 : g), clz = g => (g < 0 ? 0 : g > nz - 1 ? nz - 1 : g);
  const hAt = (gx, gz) => H[clz(gz) * nx + clx(gx)];
  const index = lods.map(st => chunkIndex(csx / st + 1, csz / st + 1));
  const group = new THREE.Group(); group.name = 'terrain';
  const list = [];
  for (let cz = 0; cz < ncz; cz++) for (let cx = 0; cx < ncx; cx++) {
    const gx0 = cx * csx, gz0 = cz * csz;
    if (gx0 >= nx - 1 || gz0 >= nz - 1) continue; // rounding up to the coarsest step can leave chunks past the grid
    list.push({ gx0, gz0, x0: x0 + gx0 * cell, z0: z0 + gz0 * cell, x1: x0 + Math.min(gx0 + csx, nx - 1) * cell,
      z1: z0 + Math.min(gz0 + csz, nz - 1) * cell, geo: lods.map(() => null), lod: -1, mesh: null });
  }
  const stats = { chunks: list.length, builds: 0, buildMs: 0, lastUpdateMs: 0, pending: false };
  const rgb = [1, 1, 1], scratch = extra.map(([, a]) => new Array(a.size).fill(0));

  function build(ch, li) {
    const t0 = now(), st = lods[li], n = csx / st + 1, m = csz / st + 1, nv = n * m + 2 * (n + m);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = colorAt ? new Float32Array(nv * 3) : null;
    const ext = extra.map(([, a]) => new Float32Array(nv * a.size));
    for (let j = 0, v = 0; j < m; j++) for (let i = 0; i < n; i++, v++) {
      const gx = ch.gx0 + i * st, gz = ch.gz0 + j * st, x = x0 + clx(gx) * cell, z = z0 + clz(gz) * cell;
      pos[v * 3] = x; pos[v * 3 + 1] = hAt(gx, gz) - (drop ? drop(x, z, li) : 0); pos[v * 3 + 2] = z;
      // normal from the grid at this LOD's spacing, so neighbouring chunks agree on their shared edges
      const dx = (hAt(gx + st, gz) - hAt(gx - st, gz)) / (2 * st * cell), dz = (hAt(gx, gz + st) - hAt(gx, gz - st)) / (2 * st * cell);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      nor[v * 3] = -dx * il; nor[v * 3 + 1] = il; nor[v * 3 + 2] = -dz * il;
      if (col) { colorAt(x, z, rgb, il); col[v * 3] = rgb[0]; col[v * 3 + 1] = rgb[1]; col[v * 3 + 2] = rgb[2]; }
      for (let a = 0; a < extra.length; a++) {
        const sz = extra[a][1].size, o = scratch[a];
        extra[a][1].at(x, z, o);
        for (let k = 0; k < sz; k++) ext[a][v * sz + k] = o[k];
      }
    }
    // skirts: copies of the edge vertices (in chunkIndex's order) hung `skirt` m lower
    const edgeV = [k => k, k => (m - 1) * n + k, k => k * n, k => k * n + n - 1], lens = [n, n, m, m];
    for (let e = 0, s = n * m; e < 4; e++) for (let k = 0; k < lens[e]; k++, s++) {
      const v = edgeV[e](k);
      for (let a = 0; a < 3; a++) { pos[s * 3 + a] = pos[v * 3 + a]; nor[s * 3 + a] = nor[v * 3 + a]; if (col) col[s * 3 + a] = col[v * 3 + a]; }
      pos[s * 3 + 1] -= skirt;
      for (let a = 0; a < extra.length; a++) { const sz = extra[a][1].size; for (let q = 0; q < sz; q++) ext[a][s * sz + q] = ext[a][v * sz + q]; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    extra.forEach(([name, a], k) => geo.setAttribute(name, new THREE.BufferAttribute(ext[k], a.size)));
    geo.setIndex(index[li].clone()); // its own copy: dispose() frees geometry.index, which other chunks at this LOD still draw with
    geo.computeBoundingSphere();
    ch.geo[li] = geo; stats.builds++; stats.buildMs += now() - t0;
    return geo;
  }

  let has = false, lx = 0, lz = 0;
  function update(camera) {
    const px = camera.position.x, pz = camera.position.z;
    if (has && !stats.pending && Math.hypot(px - lx, pz - lz) < moveEps) return;
    const t0 = now(), budget = has ? budgetMs : Infinity;
    has = true; lx = px; lz = pz; stats.pending = false;
    for (let c = 0; c < list.length; c++) {
      const ch = list[c];
      const dx = Math.max(ch.x0 - px, 0, px - ch.x1), dz = Math.max(ch.z0 - pz, 0, pz - ch.z1), d = Math.hypot(dx, dz);
      if (evict) for (let k = 0; k < evict.length; k++) if (ch.geo[k] && d > evict[k]) { if (ch.lod === k) ch.lod = -1; ch.geo[k].dispose(); ch.geo[k] = null; }
      if (d > visFar) { if (ch.mesh) ch.mesh.visible = false; continue; }
      let want = 0;
      while (want < lodFar.length && d >= lodFar[want]) want++;
      if (ch.lod >= 0 && ch.lod < want && d < lodFar[ch.lod] + hysteresis) want = ch.lod; // stay finer a little longer
      let li = want;
      if (!ch.geo[want]) {
        if (now() - t0 < budget) build(ch, want);
        else {
          stats.pending = true; li = -1;
          for (let k = 0; k < lods.length; k++) if (ch.geo[k]) { li = k; break; }
          if (li < 0) { li = lods.length - 1; build(ch, li); } // never leave a hole; the coarsest LOD is cheap
        }
      }
      if (!ch.mesh) {
        ch.mesh = new THREE.Mesh(ch.geo[li], mat);
        ch.mesh.name = 'terrain-chunk'; ch.mesh.receiveShadow = true; ch.mesh.matrixAutoUpdate = false;
        group.add(ch.mesh);
      }
      ch.mesh.geometry = ch.geo[li]; ch.mesh.visible = true; ch.lod = li;
    }
    stats.lastUpdateMs = now() - t0;
  }

  function dispose() {
    for (const ch of list) {
      for (let k = 0; k < ch.geo.length; k++) if (ch.geo[k]) { ch.geo[k].dispose(); ch.geo[k] = null; }
      if (ch.mesh) group.remove(ch.mesh);
      ch.mesh = null; ch.lod = -1;
    }
    group.removeFromParent();
  }

  return { group, update, dispose, stats };
}
