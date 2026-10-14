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

  function dispose() { for (const m of cache.values()) m.dispose(); cache.clear(); }
  const notYet = name => () => { throw new Error(`compiler: ${name}() lands in 3f Task 6`); };

  // not frozen: 3e's render-pipeline test assigns onto mc.made / mc.dispose
  return {
    shading, time, get, paint: notYet('paint'), coverage: notYet('coverage'), extend: notYet('extend'), apply: notYet('apply'),
    furGeometry: (geometry, mask, opts) => furGeometry(geometry, mask, opts),
    keys: () => [...cache.keys()], made: () => [...cache.values()].map(material => ({ material, use: material.userData.lhUse })), dispose,
  };
}
