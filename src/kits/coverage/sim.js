// kit-coverage (sim half): dirt, mud, snow and rust as levels 0..1 on entities (spec §3.2 dirtRate and coverage).
// An entity opts in with a `coverage` part; only the layers it carries change. Each step it gains the ground material's
// dirtRate × metres moved (the pool's prev → curr pose, so a place() teleport counts nothing) on that ground's layer,
// scaled by what its own material accepts (`coverageMaterial`, else its first collider's). Washes clean every layer at
// 1 / washTime per second (a wash entry { at, washTime } at its own time). Sim-pure (L-3); the view half feeds the same levels to the compiler's uCoverage.

export const COVERAGE_SYSTEM = 'lh.kit.coverage';
const LAYERS = ['dirt', 'rust', 'snow', 'mud'];
const fail = m => { throw new Error(`coverage: ${m}`); };
export const coverageLayer = id => (id === 'mud' ? 'mud' : id === 'snow' ? 'snow' : 'dirt');

export function coverageKit(host, { materialAt, washes = [], washTime = 1.5, layer = coverageLayer } = {}) {
  if (typeof host?.system !== 'function') fail('coverageKit needs the engine or a scene ctx (anything with .system)');
  if (typeof materialAt !== 'function') fail('coverageKit needs materialAt: (x, z) => material id');
  if (!(washTime > 0)) fail(`washTime must be > 0 (got ${washTime})`);
  if (!Array.isArray(washes)) fail('washes must be an array');
  // made once: washAt[k](x, z) and its washTimes[k] (the entry's own, else the kit-wide one)
  const washAt = [], washTimes = [];
  washes.forEach((w, k) => {
    const at = typeof w === 'function' ? w : w?.at, t = typeof w === 'function' ? washTime : w.washTime ?? washTime;
    if (typeof at !== 'function') fail(`washes[${k}] must be (x, z) => boolean or { at, washTime }`);
    if (!(t > 0)) fail(`washes[${k}].washTime must be > 0 (got ${t})`);
    washAt.push(at); washTimes.push(t);
  });
  if (typeof layer !== 'function') fail('layer must be a function (material id) => layer');
  const prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
  const off = host.system(COVERAGE_SYSTEM, (engine, dt) => {
    const world = engine.world;
    if (!world) return;
    const list = world.with('coverage'), reg = world.materials;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], c = e.coverage;
      if (!e.xf || !c) continue;
      const x = e.xf.p.x, z = e.xf.p.z;
      let wash = 0;
      for (let k = 0; k < washAt.length; k++) if (washAt[k](x, z)) { wash = washTimes[k]; break; }
      if (wash > 0) {
        const d = dt / wash;
        for (let k = 0; k < LAYERS.length; k++) { const L = LAYERS[k], v = c[L]; if (v !== undefined) c[L] = v > d ? v - d : 0; }
        continue;
      }
      world.xfPrev(e, prev);
      const dx = x - prev.p.x, dz = z - prev.p.z, m = Math.sqrt(dx * dx + dz * dz);
      if (m === 0) continue;
      const id = materialAt(x, z);
      if (id == null) continue;
      const rate = reg.get(id).dirtRate ?? 0;
      if (rate === 0) continue;
      const L = layer(id), v = c[L];
      if (v === undefined) continue;
      const g = v + rate * m * accept(e, L, reg);
      c[L] = g < 1 ? g : 1;
    }
  }, { stage: 'post' });
  return { off };
}

// How much of layer L the entity's own material takes: its coverage block's value, 0 if the block lacks L, 1 without a block.
function accept(e, L, reg) {
  const id = e.coverageMaterial ?? e.colliders?.[0]?.material;
  if (!id) return 1;
  const cov = reg.get(id).coverage;
  return cov ? (cov[L] ?? 0) : 1;
}
