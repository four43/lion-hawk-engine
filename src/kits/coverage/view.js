// kit-coverage (view half): feeds each covered entity's levels (dirt, rust, snow, mud) to one uCoverage vector per
// entity, shared by per-entity clones of every COVERAGE material in its object (compiler.coverage(m, { uCoverage }):
// same program). Instanced meshes are skipped: they use COVERAGE_INSTANCED and an `instanceCoverage` attribute that
// their instancing owner writes from the same e.coverage. frame() writes in place and allocates nothing.

export function coverageView(sync, compiler, { match = e => e.coverage != null } = {}) {
  const recs = new Map(); // entity id → { u, list: [{ mesh, base, material }] }
  const write = (e, r) => { const c = e.coverage; r.u.set(c.dirt ?? 0, c.rust ?? 0, c.snow ?? 0, c.mud ?? 0); };
  const release = r => { for (const x of r.list) { x.mesh.material = x.base; x.material.dispose(); } };
  const offSync = sync.on(match, {
    create(e, obj) {
      if (!obj) return;
      const r = { u: null, list: [] };
      obj.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh) return;
        const m = o.material;
        if (!m || Array.isArray(m) || !m.defines || !('COVERAGE' in m.defines)) return;
        const c = compiler.coverage(m, r.u ? { uCoverage: r.u } : undefined);
        r.u ??= c.uniforms.uCoverage;
        r.list.push({ mesh: o, base: m, material: c.material });
        o.material = c.material;
      });
      if (!r.u) return; // nothing to cover
      recs.set(e.id, r);
      write(e, r);
    },
    frame(e) {
      const r = recs.get(e.id);
      if (r) write(e, r);
    },
    remove(e) {
      const r = recs.get(e.id);
      if (!r) return;
      release(r);
      recs.delete(e.id);
    },
  });
  return {
    off() { offSync(); for (const r of recs.values()) release(r); recs.clear(); },
    get size() { return recs.size; },
  };
}
