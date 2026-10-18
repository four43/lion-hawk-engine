// Material compiler (M-11..M-13, D5). A registry material's `look` becomes one three.js material per
// (id, tier, user kind, features), cached, so every mesh that draws `steel` the same way shares one material and every
// material with the same feature set shares one shader program (customProgramCacheKey). Instanced and plain users,
// skinned users and shadow receivers get separate materials by construction (matSplit, M-13).
import { MeshPhysicalMaterial, MeshStandardMaterial, MeshLambertMaterial, MeshDepthMaterial, RGBADepthPacking, Color, Vector2, Vector3, Vector4, Matrix4, BufferAttribute, DoubleSide, FrontSide } from 'three';
import { patchShader, patchDepth, inject } from './chunks.js';
import { furGeometry } from './fur.js';
import { defineMaterials } from '../../defs/materials.js';

const TIERS = { physical: MeshPhysicalMaterial, standard: MeshStandardMaterial, lambert: MeshLambertMaterial };
const BASIC = ['color', 'emissive', 'emissiveIntensity', 'opacity', 'transparent', 'flatShading', 'side'];
const PARAMS = { lambert: BASIC, standard: [...BASIC, 'metalness', 'roughness'] };
PARAMS.physical = [...PARAMS.standard, 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'transmission', 'ior', 'thickness'];
const COLORS = new Set(['color', 'emissive', 'sheenColor']);
const WIND_AMP = [0.12, 0.08];
const PAINT_SHADE = [0.25, 0.85, 1.1]; // [floor, gain, max] of k: Tractor 1.8's paintable
const WHITE = new Color(1, 1, 1);
const KEEP = Object.freeze({ mode: 0, axis: [0, 0, 0, 0], s: 0, l: 0, color: null, key: 'keep' });  // unpainted: the vertex colours
const SOLID = Object.freeze({ mode: 1, axis: [0, 0, 0, 0], s: 0, l: 0, color: null, key: 'solid' }); // instanced: instanceColor
// a paint value → { mode, axis: [ax, ay, az, w] (hue = fract(dot(p, axis.xyz) + w)), s, l, color, key }; allocates (create or change only)
function coatOf(v) {
  if (typeof v === 'string' || typeof v === 'number' || v?.isColor) { const color = new Color(v); return { mode: 1, axis: [0, 0, 0, 0], s: 0, l: 0, color, key: color.getHexString() }; }
  const h = v?.hue;
  if (h && typeof h === 'object') {
    const { axis = [0, 0, 1], from = -1, to = 1, s = 0.75, l = 0.5 } = h, d = to - from;
    if (Array.isArray(axis) && axis.length === 3 && [...axis, from, to, s, l].every(Number.isFinite) && d !== 0)
      return { mode: 2, axis: [axis[0] / d, axis[1] / d, axis[2] / d, -from / d], s, l, color: null, key: `hue:${axis.join(',')}:${from},${to}:${s},${l}` };
  }
  throw new Error(`compiler: a paint value is a colour or { hue: { axis: [x, y, z], from, to (from ≠ to), s, l } } (got ${JSON.stringify(v)})`);
}

// material → { id, o, features, extras, uniforms }. clone() drops onBeforeCompile and the defines, so install() redoes them.
const STATE = new WeakMap();

function install(m, st) {
  m.defines = { ...(m.defines ?? {}) };
  for (const f of st.features) m.defines[f] = '';
  if (st.features.length || st.extras.length) {
    const key = `lh:${st.features.join('+')}${st.extras.map(x => `|x:${x.name}`).join('')}`;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, st.uniforms);
      patchShader(sh, st.features);
      for (const x of st.extras) x.patch(sh, inject, { depth: false });
    };
    m.customProgramCacheKey = () => key;
  }
  STATE.set(m, st);
  return m;
}

export function createMaterialCompiler(registry = defineMaterials({}), { shading = 'physical', paint: { base: paintBase = 'steel', shade = PAINT_SHADE } = {} } = {}) {
  if (!Object.hasOwn(TIERS, shading)) throw new Error(`compiler: shading must be 'physical' | 'standard' | 'lambert' (got ${JSON.stringify(shading)})`);
  if (typeof registry?.get !== 'function' || typeof registry?.has !== 'function') throw new Error('compiler: needs a material registry from defineMaterials');
  if (!registry.has(paintBase)) throw new Error(`compiler: paint base '${paintBase}' is not in the registry`);
  if (!Array.isArray(shade) || shade.length !== 3 || !shade.every(Number.isFinite)) throw new Error(`compiler: paint.shade must be [floor, gain, max] numbers (got ${JSON.stringify(shade)})`);
  const Base = TIERS[shading], params = PARAMS[shading], cache = new Map(), time = { value: 0 }, uPaintShade = { value: new Vector3(shade[0], shade[1], shade[2]) };

  const norm = (o = {}) => ({
    instanced: !!o.instanced, vertexColors: !!o.vertexColors, skinned: !!o.skinned, receiveShadow: o.receiveShadow !== false,
    map: o.map ?? null, fur: o.fur !== false, paint: !!o.paint,
    wind: o.wind ? { fade: [...(o.wind.fade ?? [0, 0])], amp: [...(o.wind.amp ?? WIND_AMP)] } : null,
  });

  function featuresOf(def, o) {
    const look = def.look ?? {}, f = [];
    if (def.coverage) f.push('COVERAGE');
    if (look.fur && o.fur) f.push('FUR');
    if (look.subsurface && look.subsurface.strength > 0 && shading !== 'lambert') f.push('SUBSURFACE'); // D5: physical and standard only; off at strength 0
    if (o.wind) f.push('WIND');
    if (o.paint) f.push('PAINT'); // Task 8b: shading-preserving paint slot
    return f;
  }

  function uniformsFor(def, features, o, uCoverage = new Vector4(0, 0, 0, 0), coat = null) {
    const look = def.look ?? {}, u = {};
    if (features.includes('COVERAGE')) {
      const c = def.coverage;
      u.uCoverage = { value: uCoverage };
      u.uCoverageAccept = { value: new Vector4(c.dirt ?? 0, c.rust ?? 0, c.snow ?? 0, c.mud ?? 0) };
    }
    if (features.includes('FUR')) {
      const fu = look.fur;
      u.furLen = { value: fu.length ?? 0.07 }; u.furDensity = { value: fu.density ?? 34 }; u.furTint = { value: new Color(fu.tint ?? '#ffffff') };
    }
    if (features.includes('SUBSURFACE')) {
      const s = look.subsurface;
      u.uSubColor = { value: new Color(s.color ?? '#ffffff') }; u.uSubStrength = { value: s.strength ?? 0.5 };
    }
    if (features.includes('WIND')) {
      u.uLhTime = time; // one clock for every windy material: mc.time.value = seconds
      u.uWindFade = { value: new Vector2(o.wind.fade[0], o.wind.fade[1]) }; u.uWindAmp = { value: new Vector2(o.wind.amp[0], o.wind.amp[1]) };
    }
    if (features.includes('PAINT')) {
      const c = coat ?? (o.instanced ? SOLID : KEEP);
      u.uPaintMode = { value: new Vector3(c.mode, c.s, c.l) }; u.uPaintAxis = { value: new Vector4(c.axis[0], c.axis[1], c.axis[2], c.axis[3]) };
      u.uPaintShade = uPaintShade; // one [floor, gain, max] per compiler
    }
    return u;
  }

  const keyOf = (id, o, features) => [id, shading, +o.instanced, +o.vertexColors, +o.skinned, +o.receiveShadow, o.map?.uuid ?? '', features.join('+')].join('|')
    + (o.wind ? `|wind:${o.wind.fade.join(',')}:${o.wind.amp.join(',')}` : '');

  function get(id, opts) {
    const def = registry.get(id), o = norm(opts), features = featuresOf(def, o), key = keyOf(id, o, features);
    const hit = cache.get(key);
    if (hit) return hit;
    const m = new Base(), look = def.look ?? {};
    for (const k of params) {
      if (look[k] === undefined) continue;
      if (COLORS.has(k)) m[k].set(look[k]);
      else if (k === 'side') m.side = look.side === 'double' ? DoubleSide : FrontSide;
      else m[k] = look[k];
    }
    m.name = id;
    m.vertexColors = o.vertexColors;
    if (o.vertexColors) m.color.setRGB(1, 1, 1); // D5: vertex colours replace look.color
    if (o.paint) m.color.setRGB(1, 1, 1); // the paint value sets it (mode 1)
    if (o.map) m.map = o.map;                     // a glTF base-colour texture (the barn)
    m.userData.lh = { id, key, tier: shading, instanced: o.instanced, vertexColors: o.vertexColors, skinned: o.skinned, receiveShadow: o.receiveShadow, features };
    m.userData.lhUse = o.instanced ? 'instanced' : o.skinned ? 'skinned' : 'plain'; // the mesh kind warm() needs (matSplit)
    m.userData.lhShared = true;                                                     // disposeTree skips it
    install(m, { id, o, features, extras: [], coat: null, uniforms: uniformsFor(def, features, o) });
    cache.set(key, m);
    return m;
  }

  // a clone of a compiled material with its own uniforms (same program); `key` null means not cached (per entity)
  function variant(material, key, { features, extras, uCoverage, coat } = {}) {
    const s = STATE.get(material), def = registry.get(s.id);
    const st = { ...s, features: features ?? s.features, extras: extras ?? s.extras, coat: coat !== undefined ? coat : s.coat };
    st.uniforms = uniformsFor(def, st.features, s.o, uCoverage, st.coat);
    const m = material.clone();
    m.userData.lh = { ...material.userData.lh, key: key ?? material.userData.lh.key, features: st.features };
    m.userData.lhShared = key !== null; // per-entity clones are the entity's to dispose
    install(m, st);
    if (key !== null) cache.set(key, m);
    return m;
  }

  function paint(id, value, opts) {
    const coat = coatOf(value), base = get(id, coat.mode === 2 ? { ...opts, paint: true } : opts);
    const key = `${base.userData.lh.key}|paint:${coat.key}`, hit = cache.get(key);
    if (hit) return hit;
    const m = variant(base, key, { coat: STATE.get(base).features.includes('PAINT') ? coat : null });
    m.color.copy(coat.color ?? WHITE); // mode 1: the paint (times the vertex colours without PAINT, times the shade with it)
    return m;
  }

  function coverage(material, { uCoverage } = {}) {
    const s = STATE.get(material);
    if (!s || !s.features.includes('COVERAGE')) throw new Error(`compiler: coverage() needs a compiled material whose registry entry has a coverage block (got '${material?.name}')`);
    const covi = `${material.userData.lh.key}|covi`; // instanced: one shared variant per material, coverage from the instanceCoverage attribute
    const m = material.userData.lh.instanced
      ? cache.get(covi) ?? variant(material, covi, { features: [...s.features.slice(0, 1), 'COVERAGE_INSTANCED', ...s.features.slice(1)], uCoverage })
      : variant(material, null, { uCoverage: uCoverage ?? new Vector4(0, 0, 0, 0) }); // plain: a per-entity clone
    return { material: m, uniforms: { uCoverage: STATE.get(m).uniforms.uCoverage.value } };
  }

  function extend(material, name, patch) {
    const s = STATE.get(material);
    if (!s || material.userData.lhShared === false) throw new Error(`compiler: extend() needs a shared material from this compiler (got '${material?.name}'); extend first, then take coverage()`);
    if (!/^[\w-]+$/.test(name) || typeof patch !== 'function') throw new Error(`compiler: extend(material, name, patch) needs a name of [A-Za-z0-9_-] and a patch(shader, inject) function (got '${name}')`);
    const key = `${material.userData.lh.key}|x:${name}`;
    return cache.get(key) ?? variant(material, key, { extras: [...s.extras, { name, patch }] });
  }

  // Task 8b: lhPaint for each vertex-coloured paint-<slot> mesh that lacks it: model-space xyz (relative to root) and the vertex's
  // brightness (0.3 r + 0.6 g + 0.1 b, linear) over the brightest vertex of the same slot in this tree (Tractor's trim spans the
  // fenders and the roof). Written once onto the shared template geometry; clones and re-applies find it there.
  const toRoot = new Matrix4(), toMesh = new Matrix4(), pv = new Vector3();
  function paintAttributes(root) {
    const rows = [], top = new Map(), seen = new Set();
    root.updateMatrixWorld(true); toRoot.copy(root.matrixWorld).invert();
    root.traverse(o => {
      const g = o.isMesh ? o.geometry : null, c = g?.attributes.color;
      if (!c || g.attributes.lhPaint || seen.has(g)) return;
      const slot = (o.userData.lhMat ?? [o.material].flat().map(m => m.name)).find(n => n.startsWith('paint-'));
      if (!slot) return;
      seen.add(g);
      const p = g.attributes.position, a = new Float32Array(c.count * 4);
      toMesh.multiplyMatrices(toRoot, o.matrixWorld);
      let t = top.get(slot) ?? 0;
      for (let i = 0; i < c.count; i++) {
        pv.fromBufferAttribute(p, i).applyMatrix4(toMesh);
        const b = 0.3 * c.getX(i) + 0.6 * c.getY(i) + 0.1 * c.getZ(i);
        a[i * 4] = pv.x; a[i * 4 + 1] = pv.y; a[i * 4 + 2] = pv.z; a[i * 4 + 3] = b;
        if (b > t) t = b;
      }
      top.set(slot, t); rows.push({ g, a, slot });
    });
    for (const { g, a, slot } of rows) {
      const t = top.get(slot) || 1;
      for (let i = 3; i < a.length; i += 4) a[i] /= t;
      g.setAttribute('lhPaint', new BufferAttribute(a, 4));
    }
  }

  function apply(root, { instanced = false, paint: colors = null, coverage: cov = false } = {}) {
    paintAttributes(root);
    const uCoverage = cov ? new Vector4(0, 0, 0, 0) : null; // one vec4 per call: one entity's (dirt, rust, snow, mud)
    root.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const names = o.userData.lhMat ?? list.map(m => m.name);
      o.userData.lhMat = names; // the authored names survive re-apply and clone (userData is JSON-copied)
      const a = o.geometry.attributes, inst = instanced || !!o.isInstancedMesh;
      const out = names.map((name, i) => {
        const opts = { instanced: inst, vertexColors: !!a.color, skinned: !!o.isSkinnedMesh, receiveShadow: o.receiveShadow, map: list[i]?.map ?? null, fur: !!a.furShell, paint: name.startsWith('paint-') && !!a.color && !!a.lhPaint };
        let m;
        if (name.startsWith('paint-')) {
          const c = colors?.[name.slice(6)];
          if (c?.hue && !opts.paint) throw new Error(`compiler: a hue paint needs vertex colours (mesh '${o.name}', ${name})`);
          m = c != null && !inst ? paint(paintBase, c, opts) : get(paintBase, opts); // instanced paint: instanceColor on the base
        } else if (registry.has(name)) m = get(name, opts);
        else throw new Error(`compiler: mesh '${o.name}' uses material '${name}', which is neither a registry id nor paint-<slot>`);
        if (uCoverage && STATE.get(m).features.includes('COVERAGE')) m = coverage(m, { uCoverage }).material;
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      // a material that moves vertices (FUR, WIND) casts its shadow through its depth twin, displaced the same way
      const moving = out.find(m => STATE.get(m).features.some(f => f === 'FUR' || f === 'WIND'));
      if (moving) o.customDepthMaterial = depth(moving);
    });
    return { uCoverage };
  }

  // Task 8b: point a compiled tree's paint slots at new values (create time or on a paint change, never per frame). Shared
  // materials swap to the cached paint material; per-entity clones (coverage(), lhShared false, e.g. 3h's coverageView) change in
  // place, so their holders keep a valid material and its uCoverage. Instanced meshes are skipped (their paint is instanceColor).
  function repaint(root, colors) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material], names = o.userData.lhMat ?? list.map(m => m.name);
      const out = names.map((name, i) => {
        const m = list[i];
        if (!name.startsWith('paint-')) return m;
        const s = STATE.get(m);
        if (!s) throw new Error(`compiler: repaint() needs a tree compiled by apply() (mesh '${o.name}' has an uncompiled '${name}')`);
        if (s.o.instanced) return m;
        const v = colors?.[name.slice(6)] ?? null, coat = v == null ? null : coatOf(v), shaded = s.features.includes('PAINT');
        if (coat?.mode === 2 && !shaded) throw new Error(`compiler: a hue paint needs vertex colours (mesh '${o.name}', ${name})`);
        if (m.userData.lhShared !== false) return coat ? paint(paintBase, v, s.o) : get(paintBase, s.o);
        if (shaded) { const c = coat ?? KEEP; s.uniforms.uPaintMode.value.set(c.mode, c.s, c.l); s.uniforms.uPaintAxis.value.fromArray(c.axis); s.coat = coat; }
        m.color.copy(coat?.color ?? (shaded || s.o.vertexColors ? WHITE : get(paintBase, s.o).color));
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    return root;
  }

  // The shadow-pass twin of a compiled material: a MeshDepthMaterial (RGBA packing, as three's shadow maps use) whose vertex stage
  // runs the same displacement (WIND, FUR) on the same uniform objects, then every extend() patch with { depth: true } (a patch
  // that only edits the fragment stage returns early on it). Set it as mesh.customDepthMaterial. Cached per material; the compiler
  // owns and disposes it.
  const depths = new Map(); // material key -> depth twin
  function depth(material) {
    const s = STATE.get(material);
    if (!s) throw new Error(`compiler: depth() needs a material from this compiler (got '${material?.name}')`);
    const dk = material.userData.lh.key, hit = depths.get(dk); // per-entity clones (coverage) share their base's twin
    if (hit) return hit;
    const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    m.name = `${material.name}:depth`;
    m.side = material.side;
    const moved = s.features.filter(f => f === 'FUR' || f === 'WIND');
    if (moved.length || s.extras.length) {
      const key = `lhd:${moved.join('+')}${s.extras.map(x => `|x:${x.name}`).join('')}`;
      m.defines = { ...(m.defines ?? {}) }; for (const f of moved) m.defines[f] = '';
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, STATE.get(material).uniforms);
        patchDepth(sh, moved);
        for (const x of s.extras) x.patch(sh, inject, { depth: true });
      };
      m.customProgramCacheKey = () => key;
    }
    m.userData.lhShared = true; m.userData.lh = { depthOf: material.userData.lh?.key };
    depths.set(dk, m);
    return m;
  }

  function dispose() { for (const m of cache.values()) m.dispose(); cache.clear(); for (const m of depths.values()) m.dispose(); depths.clear(); }

  // not frozen: 3e's render-pipeline test assigns onto mc.made / mc.dispose
  return {
    shading, time, get, paint, coverage, extend, apply, repaint, depth,
    furGeometry: (geometry, mask, opts) => furGeometry(geometry, mask, opts),
    keys: () => [...cache.keys()], made: () => [...cache.values()].map(material => ({ material, use: material.userData.lhUse })), dispose,
  };
}
