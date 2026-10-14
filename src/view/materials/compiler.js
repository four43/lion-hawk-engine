// Material compiler (M-11..M-13, D5). A registry material's `look` becomes one three.js material per
// (id, tier, user kind, features), cached, so every mesh that draws `steel` the same way shares one material and every
// material with the same feature set shares one shader program (customProgramCacheKey). Instanced and plain users,
// skinned users and shadow receivers get separate materials by construction (matSplit, M-13).
import { MeshPhysicalMaterial, MeshStandardMaterial, MeshLambertMaterial, Color, Vector2, Vector4, DoubleSide, FrontSide } from 'three';
import { patchShader, inject } from './chunks.js';
import { furGeometry } from './fur.js';
import { defineMaterials } from '../../defs/materials.js';

const TIERS = { physical: MeshPhysicalMaterial, standard: MeshStandardMaterial, lambert: MeshLambertMaterial };
const BASIC = ['color', 'emissive', 'emissiveIntensity', 'opacity', 'transparent', 'flatShading', 'side'];
const PARAMS = { lambert: BASIC, standard: [...BASIC, 'metalness', 'roughness'] };
PARAMS.physical = [...PARAMS.standard, 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'transmission', 'ior', 'thickness'];
const COLORS = new Set(['color', 'emissive', 'sheenColor']);
const WIND_AMP = [0.12, 0.08];

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
      for (const x of st.extras) x.patch(sh, inject);
    };
    m.customProgramCacheKey = () => key;
  }
  STATE.set(m, st);
  return m;
}

export function createMaterialCompiler(registry = defineMaterials({}), { shading = 'physical', paint: { base: paintBase = 'steel' } = {} } = {}) {
  if (!Object.hasOwn(TIERS, shading)) throw new Error(`compiler: shading must be 'physical' | 'standard' | 'lambert' (got ${JSON.stringify(shading)})`);
  if (typeof registry?.get !== 'function' || typeof registry?.has !== 'function') throw new Error('compiler: needs a material registry from defineMaterials');
  if (!registry.has(paintBase)) throw new Error(`compiler: paint base '${paintBase}' is not in the registry`);
  const Base = TIERS[shading], params = PARAMS[shading], cache = new Map(), time = { value: 0 };

  const norm = (o = {}) => ({
    instanced: !!o.instanced, vertexColors: !!o.vertexColors, skinned: !!o.skinned, receiveShadow: o.receiveShadow !== false,
    map: o.map ?? null, fur: o.fur !== false,
    wind: o.wind ? { fade: [...(o.wind.fade ?? [0, 0])], amp: [...(o.wind.amp ?? WIND_AMP)] } : null,
  });

  function featuresOf(def, o) {
    const look = def.look ?? {}, f = [];
    if (def.coverage) f.push('COVERAGE');
    if (look.fur && o.fur) f.push('FUR');
    if (look.subsurface && shading !== 'lambert') f.push('SUBSURFACE'); // D5: physical and standard only
    if (o.wind) f.push('WIND');
    return f;
  }

  function uniformsFor(def, features, o, uCoverage = new Vector4(0, 0, 0, 0)) {
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
    if (o.map) m.map = o.map;                     // a glTF base-colour texture (the barn)
    m.userData.lh = { id, key, tier: shading, instanced: o.instanced, vertexColors: o.vertexColors, skinned: o.skinned, receiveShadow: o.receiveShadow, features };
    m.userData.lhUse = o.instanced ? 'instanced' : o.skinned ? 'skinned' : 'plain'; // the mesh kind warm() needs (matSplit)
    m.userData.lhShared = true;                                                     // disposeTree skips it
    install(m, { id, o, features, extras: [], uniforms: uniformsFor(def, features, o) });
    cache.set(key, m);
    return m;
  }

  // a clone of a compiled material with its own uniforms (same program); `key` null means not cached (per entity)
  function variant(material, key, { features, extras, uCoverage } = {}) {
    const s = STATE.get(material), def = registry.get(s.id);
    const st = { ...s, features: features ?? s.features, extras: extras ?? s.extras };
    st.uniforms = uniformsFor(def, st.features, s.o, uCoverage);
    const m = material.clone();
    m.userData.lh = { ...material.userData.lh, key: key ?? material.userData.lh.key, features: st.features };
    m.userData.lhShared = key !== null; // per-entity clones are the entity's to dispose
    install(m, st);
    if (key !== null) cache.set(key, m);
    return m;
  }

  function paint(id, color, opts) {
    const base = get(id, opts), c = new Color(color), key = `${base.userData.lh.key}|paint:${c.getHexString()}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = variant(base, key);
    m.color.copy(c); // times the vertex colours, when the mesh has them
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

  function apply(root, { instanced = false, paint: colors = null, coverage: cov = false } = {}) {
    const uCoverage = cov ? new Vector4(0, 0, 0, 0) : null; // one vec4 per call: one entity's (dirt, rust, snow, mud)
    root.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const names = o.userData.lhMat ?? list.map(m => m.name);
      o.userData.lhMat = names; // the authored names survive re-apply and clone (userData is JSON-copied)
      const a = o.geometry.attributes, inst = instanced || !!o.isInstancedMesh;
      const out = names.map((name, i) => {
        const opts = { instanced: inst, vertexColors: !!a.color, skinned: !!o.isSkinnedMesh, receiveShadow: o.receiveShadow, map: list[i]?.map ?? null, fur: !!a.furShell };
        let m;
        if (name.startsWith('paint-')) {
          const c = colors?.[name.slice(6)];
          m = c != null && !inst ? paint(paintBase, c, opts) : get(paintBase, opts); // instanced paint: instanceColor on the base
        } else if (registry.has(name)) m = get(name, opts);
        else throw new Error(`compiler: mesh '${o.name}' uses material '${name}', which is neither a registry id nor paint-<slot>`);
        if (uCoverage && STATE.get(m).features.includes('COVERAGE')) m = coverage(m, { uCoverage }).material;
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    return { uCoverage };
  }

  function dispose() { for (const m of cache.values()) m.dispose(); cache.clear(); }

  // not frozen: 3e's render-pipeline test assigns onto mc.made / mc.dispose
  return {
    shading, time, get, paint, coverage, extend, apply,
    furGeometry: (geometry, mask, opts) => furGeometry(geometry, mask, opts),
    keys: () => [...cache.keys()], made: () => [...cache.values()].map(material => ({ material, use: material.userData.lhUse })), dispose,
  };
}
