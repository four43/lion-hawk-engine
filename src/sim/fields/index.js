// Fields (spec §3.7, phase 8): wind, aero, buoyancy and magnetism. [M-14] One system, 'lh.fields', in the `pre` stage
// (before the physics step) applies their forces as impulses; everything is deterministic and sim-pure (Rapier is
// world.R). Aero and buoyancy read the baked sidecar block `aero` ([A-5]: panels { part, a, n, c } and the closed
// volume, body space) of each dynamic entity spawned from a model; magnetism reads collider materials.
//   createWind({ base, gust, zones, seed }) → { at(p, t, out?) }             [M-15]
//   createFields(world, { wind, aero, buoyancy, magnet, models }) → { submerged(e), dispose() }
const fail = m => { throw new Error(`fields: ${m}`); };
const vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const RAD = 180 / Math.PI;

// [M-15] wind: base + a seeded value-noise gust along the base (bounded by amp) + every zone box containing p
export function createWind({ base = [0, 0, 0], gust = null, zones = [], seed = 1 } = {}) {
  if (!vec(base)) throw new Error('wind: base must be [x, y, z]');
  for (const z of zones) if (!vec(z.min) || !vec(z.max) || !vec(z.v)) throw new Error('wind: a zone is { min, max, v }, each [x, y, z]');
  const g = gust ? { amp: gust.amp ?? 0, scale: gust.scale ?? 20, period: gust.period ?? 4 } : null;
  const bl = Math.hypot(...base), dir = bl > 0 ? base.map(v => v / bl) : [1, 0, 0];
  const hash = (x, y, z) => { // a lattice value in [0, 1) from the seed
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  };
  const s = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = s(x - ix), fy = s(y - iy), fz = s(z - iz);
    const c = (a, b, d) => hash(ix + a, iy + b, iz + d);
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy), lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
  };
  return Object.freeze({
    at(p, t, out = { x: 0, y: 0, z: 0 }) {
      let k = 0;
      if (g && g.amp) k = g.amp * (2 * noise(p.x / g.scale, p.z / g.scale, t / g.period) - 1);
      out.x = base[0] + dir[0] * k; out.y = base[1] + dir[1] * k; out.z = base[2] + dir[2] * k;
      for (const z of zones) if (p.x >= z.min[0] && p.x <= z.max[0] && p.y >= z.min[1] && p.y <= z.max[1] && p.z >= z.min[2] && p.z <= z.max[2]) { out.x += z.v[0]; out.y += z.v[1]; out.z += z.v[2]; }
      return out;
    },
  });
}

const CALM = createWind();
const FIELDS = new WeakMap(), ENGINES = new WeakSet(); // World → its field sets; engines that run 'lh.fields'
export const FIELDS_SYSTEM = 'lh.fields';
const install = engine => {
  if (ENGINES.has(engine)) return; ENGINES.add(engine);
  engine.system(FIELDS_SYSTEM, (en, dt) => { const w = en.world, list = w && FIELDS.get(w); if (list) for (let i = 0; i < list.length; i++) list[i].step(dt, en.time.sim); }, { stage: 'pre' });
};
// a curve [[aoa, value]...] read with linear interpolation, clamped at its ends
const curveAt = (c, x) => {
  if (x <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (x <= c[i][0]) { const [a, va] = c[i - 1], [b, vb] = c[i]; return va + (vb - va) * (x - a) / (b - a); }
  return c[c.length - 1][1];
};
const rot = (q, v, o) => { // o = q v q^-1
  const tx = 2 * (q.y * v[2] - q.z * v[1]), ty = 2 * (q.z * v[0] - q.x * v[2]), tz = 2 * (q.x * v[1] - q.y * v[0]);
  o.x = v[0] + q.w * tx + q.y * tz - q.z * ty; o.y = v[1] + q.w * ty + q.z * tx - q.x * tz; o.z = v[2] + q.w * tz + q.x * ty - q.y * tx; return o;
};
const KEYS = ['wind', 'aero', 'buoyancy', 'magnet', 'models'];

export function createFields(world, opts = {}) {
  const engine = world?.engine;
  if (!engine) fail('the World has no engine (world.engine): create fields on a scene World');
  for (const k of Object.keys(opts)) if (!KEYS.includes(k)) fail(`unknown option '${k}' (${KEYS.join(', ')})`);
  const { wind = CALM, aero = false, buoyancy = null, magnet = null } = opts;
  if (typeof wind?.at !== 'function') fail('wind must be a createWind() field');
  const reg = world.materials, models = (opts.models ?? engine.game.defs?.models)?.models ?? {};
  const air = aero ? { plate: aero.plate ?? 1.1, rho: aero.density ?? reg.get('air')?.fluid?.density ?? 1.225 } : null;
  const fluids = (buoyancy?.fluids ?? []).map(f => {
    const m = reg.get(f.material ?? 'water');
    if (!m?.fluid) fail(`fluid material '${f.material ?? 'water'}' has no fluid block`);
    const level = typeof f.level === 'function' ? f.level : (() => { const y = f.level ?? 0; return () => y; })();
    return { rho: m.fluid.density, level, vel: f.surfaceVel ?? (() => 0), damping: f.damping ?? 1 };
  });
  const grav = engine.game.physics?.gravity ?? [0, -9.81, 0], g = -grav[1];
  const mag = magnet ? { radius: magnet.radius ?? 3, gain: magnet.gain ?? 1, rMin: magnet.rMin ?? 0.1, maxForce: magnet.maxForce ?? 1e5 } : null;

  // per model: the panels with their part's skin and airfoil, and each airfoil part's planform (largest, most upward panel)
  const prep = new Map();
  const modelOf = id => {
    let m = prep.get(id); if (m !== undefined) return m;
    const sc = models[id], a = sc?.aero;
    if (!a) { prep.set(id, m = null); return m; }
    const matOf = part => reg.get((sc.colliders.find(c => c.part === part) ?? sc.colliders[0])?.material) ?? null;
    const parts = new Map();
    for (const p of a.panels) {
      let e = parts.get(p.part);
      if (!e) { const mat = matOf(p.part); parts.set(p.part, e = { panels: [], skin: mat?.aero?.skin ?? 0, airfoil: mat?.aero?.airfoil ?? null, top: null, c: [0, 0, 0], area: 0 }); }
      e.panels.push(p); e.area += p.a; for (let k = 0; k < 3; k++) e.c[k] += p.c[k] * p.a;
      if (!e.top || p.a > e.top.a + 1e-9 || (Math.abs(p.a - e.top.a) <= 1e-9 && p.n[1] > e.top.n[1])) e.top = p;
    }
    for (const e of parts.values()) e.c = e.c.map(v => v / e.area);
    prep.set(id, m = { parts: [...parts.values()], panels: a.panels, volume: a.volume });
    return m;
  };
  const sub = new WeakMap(); // entity → submerged fraction of its volume (the last step)
  const c = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 }, w = { x: 0, y: 0, z: 0 }, imp = { x: 0, y: 0, z: 0 }, pt = { x: 0, y: 0, z: 0 };
  let P, Q, V, W, body, dtNow;
  const velAt = (p, o) => { // body velocity at a world point
    const rx = p.x - P.x, ry = p.y - P.y, rz = p.z - P.z;
    o.x = V.x + W.y * rz - W.z * ry; o.y = V.y + W.z * rx - W.x * rz; o.z = V.z + W.x * ry - W.y * rx; return o;
  };
  const push = (fx, fy, fz, at) => { imp.x = fx * dtNow; imp.y = fy * dtNow; imp.z = fz * dtNow; body.applyImpulseAtPoint(imp, at, true); };
  const toWorld = (v, o) => { rot(Q, v, o); o.x += P.x; o.y += P.y; o.z += P.z; return o; };
  const vp = { x: 0, y: 0, z: 0 };
  const relAir = (at, t) => { wind.at(at, t, w); velAt(at, vp); w.x -= vp.x; w.y -= vp.y; w.z -= vp.z; return w; }; // u = wind - v(point)
  function plate(p, t, skin) {
    toWorld(p.c, c); rot(Q, p.n, n); const u = relAir(c, t), uu = u.x * u.x + u.y * u.y + u.z * u.z, un = n.x * u.x + n.y * u.y + n.z * u.z;
    if (un >= 0 || uu < 1e-12) return;
    const um = Math.sqrt(uu), cc = -un / um, q = 0.5 * air.rho * uu * p.a;
    let fx = -n.x * q * air.plate * cc * cc, fy = -n.y * q * air.plate * cc * cc, fz = -n.z * q * air.plate * cc * cc;
    if (skin) { const tx = u.x - n.x * un, ty = u.y - n.y * un, tz = u.z - n.z * un, tm = Math.hypot(tx, ty, tz); if (tm > 1e-9) { fx += tx / tm * q * skin; fy += ty / tm * q * skin; fz += tz / tm * q * skin; } }
    push(fx, fy, fz, c);
  }
  function airfoil(e, t) { // [M-16] lift and drag from the curves below stall; a plate past it. → true when handled
    toWorld(e.c, pt); rot(Q, e.top.n, n); const u = relAir(pt, t), uu = u.x * u.x + u.y * u.y + u.z * u.z;
    if (uu < 1e-12) return true;
    const um = Math.sqrt(uu), ux = u.x / um, uy = u.y / um, uz = u.z / um, s = n.x * ux + n.y * uy + n.z * uz;
    const aoa = Math.asin(Math.max(-1, Math.min(1, s))) * RAD;
    if (Math.abs(aoa) > e.airfoil.stall) return false;
    const q = 0.5 * air.rho * uu * e.top.a, cl = curveAt(e.airfoil.cl, aoa), cd = curveAt(e.airfoil.cd, aoa);
    let lx = n.x - s * ux, ly = n.y - s * uy, lz = n.z - s * uz; const lm = Math.hypot(lx, ly, lz) || 1; lx /= lm; ly /= lm; lz /= lm;
    push(q * (cl * lx + cd * ux), q * (cl * ly + cd * uy), q * (cl * lz + cd * uz), pt);
    return true;
  }
  function buoy(e, m, f, t) { // [M-17] V = ∮ min(y - h, 0) n_y dA over the panels; the centre of buoyancy likewise
    let vol = 0, mx = 0, my = 0, mz = 0;
    for (const p of m.panels) {
      toWorld(p.c, c); rot(Q, p.n, n);
      const h = f.level(c.x, c.z, t), d = c.y - h; if (d >= 0) continue;
      const k = d * n.y * p.a; vol += k; mx += c.x * k; mz += c.z * k; my += 0.5 * (c.y * c.y - h * h) * n.y * p.a;
    }
    if (vol <= 1e-12) return 0;
    pt.x = mx / vol; pt.y = my / vol; pt.z = mz / vol;
    const heave = velAt(pt, vp).y - f.vel(pt.x, pt.z, t);
    push(0, f.rho * g * vol - f.damping * f.rho * vol * heave, 0, pt);
    return vol;
  }

  // [M-18] magnets: colliders whose material has magnet.strength act on every collider with magnet data (strength or
  // ferrous) within the radius: induced (ferrous, 1/r^4) and dipole-dipole forces, r clamped and the force capped. The
  // candidates come from the World's entities in id order (deterministic, and independent of Rapier's query state).
  const moment = (col, s, o) => rot(col.rotation(), [0, s, 0], o); // a magnet's dipole along its collider's +y
  const ma = { x: 0, y: 0, z: 0 }, mb = { x: 0, y: 0, z: 0 }, cands = [];
  function magnets() {
    cands.length = 0;
    for (const e of world.with()) for (const ce of e.colliders ?? []) {
      const m = reg.get(world.materialOf(ce.collider.handle))?.magnet;
      if (m && ((m.strength ?? 0) > 0 || (m.ferrous ?? 0) > 0)) cands.push({ col: ce.collider, s: m.strength ?? 0, f: m.ferrous ?? 0 });
    }
    for (let i = 0; i < cands.length; i++) {
      const A = cands[i]; if (!(A.s > 0)) continue;
      const pa = A.col.translation(), ba = A.col.parent();
      for (let j = 0; j < cands.length; j++) {
        const B = cands[j]; if (j === i || (B.s > 0 && j < i)) continue; // a magnet pair once
        const bb = B.col.parent(); if (bb && ba && bb.handle === ba.handle) continue;
        if (!(B.s > 0) && !(B.f > 0)) continue;
        const pb = B.col.translation(), rx = pb.x - pa.x, ry = pb.y - pa.y, rz = pb.z - pa.z, d = Math.hypot(rx, ry, rz);
        if (d > mag.radius) continue;
        const r = Math.max(d, mag.rMin), hx = d > 0 ? rx / d : 0, hy = d > 0 ? ry / d : 1, hz = d > 0 ? rz / d : 0;
        let fx, fy, fz; // the force on B
        if (B.s > 0) {
          moment(A.col, A.s, ma); moment(B.col, B.s, mb);
          const ar = ma.x * hx + ma.y * hy + ma.z * hz, br = mb.x * hx + mb.y * hy + mb.z * hz, ab = ma.x * mb.x + ma.y * mb.y + ma.z * mb.z;
          const k = 3 * mag.gain / r ** 4;
          fx = k * (ar * mb.x + br * ma.x + ab * hx - 5 * ar * br * hx); fy = k * (ar * mb.y + br * ma.y + ab * hy - 5 * ar * br * hy); fz = k * (ar * mb.z + br * ma.z + ab * hz - 5 * ar * br * hz);
        } else { const k = -mag.gain * A.s * B.f / r ** 4; fx = k * hx; fy = k * hy; fz = k * hz; } // toward the magnet
        const fm = Math.hypot(fx, fy, fz); if (fm > mag.maxForce) { const k = mag.maxForce / fm; fx *= k; fy *= k; fz *= k; }
        imp.x = fx * dtNow; imp.y = fy * dtNow; imp.z = fz * dtNow; bb?.applyImpulseAtPoint(imp, pb, true);
        imp.x = -imp.x; imp.y = -imp.y; imp.z = -imp.z; ba?.applyImpulseAtPoint(imp, pa, true);
      }
    }
  }

  const set = {
    removed: false,
    step(dt, t) {
      dtNow = dt;
      if (air || fluids.length) for (const e of world.with()) {
        if (!e.body?.isDynamic() || e.model === undefined) continue;
        const m = modelOf(e.model); if (!m) continue;
        body = e.body; P = body.translation(); Q = body.rotation(); V = body.linvel(); W = body.angvel();
        if (air) for (const part of m.parts) if (!(part.airfoil && airfoil(part, t))) for (const p of part.panels) plate(p, t, part.skin);
        if (fluids.length && g > 0) { let v = 0; for (const f of fluids) v += buoy(e, m, f, t); sub.set(e, m.volume > 0 ? Math.min(1, v / m.volume) : 0); }
      }
      if (mag) magnets();
    },
    submerged: e => sub.get(e) ?? 0,
    dispose() { const k = list.indexOf(set); if (k !== -1) list.splice(k, 1); set.removed = true; },
  };
  let list = FIELDS.get(world);
  if (!list) FIELDS.set(world, list = []);
  list.push(set);
  world.own(() => set.dispose());
  install(engine);
  return set;
}
