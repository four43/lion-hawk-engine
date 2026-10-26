// lion-hawk/view light rig (overview §4.6): a hemisphere light, a shadowed sun whose shadow box follows a point, fog in the
// sky colour, and named looks (presets) blended by k. A preset changes colours, intensities, the sun's offset and the fog
// distances, never state that selects a shader program: fog on/off, shadow casting, map size (they stutter, X-4).
// The defaults are a clear daylight scene; the default dusk and night presets blend it to night as k goes 0.5 to 1.
// A game with its own look sets options and presets.
import * as THREE from 'three';

export const LIGHT_DEFAULTS = Object.freeze({
  sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3,
  sun: Object.freeze({ color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: Object.freeze([-26, 46, 22]), near: 5, far: 120, bias: -0.0006, normalBias: 0.03 }),
  fog: Object.freeze([90, 220]),
});
export const DEFAULT_PRESETS = Object.freeze({ // E-5: k 0.5 = sunset, 1 = night (hemi 1.3 - k, sun 2.1 - 1.95 k)
  dusk: Object.freeze({ sky: '#f4a76b', hemi: 0.8, sun: Object.freeze({ color: '#ffa860', intensity: 1.125 }) }),
  night: Object.freeze({ sky: '#1b2440', hemi: 0.3, sun: Object.freeze({ color: '#9fb4ff', intensity: 0.15 }) }),
});
const _t = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(); // follow's scratch
const TOP = ['sky', 'hemiSky', 'ground', 'hemi', 'sun', 'fog', 'presets'];
const SUN = ['color', 'intensity', 'map', 'box', 'offset', 'near', 'far', 'bias', 'normalBias'];
const PRESET = ['sky', 'hemiSky', 'ground', 'hemi', 'sun', 'fog'];
const PRESET_SUN = ['color', 'intensity', 'offset'];
const unknown = (o, known, where, why = '') => { for (const k of Object.keys(o ?? {})) if (!known.includes(k)) throw new Error(`lights: ${where}${k} is unknown${why}`); };

export function checkLights(opts = {}) {
  if (!opts || typeof opts !== 'object') throw new Error('lights: options must be an object');
  unknown(opts, TOP, '');
  unknown(opts.sun, SUN, 'sun.');
  if (opts.fog !== undefined && opts.fog !== false && !(Array.isArray(opts.fog) && opts.fog.length === 2)) throw new Error(`lights: fog must be [near, far] or false (got ${JSON.stringify(opts.fog)})`);
  for (const [name, p] of Object.entries(opts.presets ?? {})) {
    unknown(p, PRESET, `preset '${name}'.`);
    if (p.sun !== undefined && (!p.sun || typeof p.sun !== 'object')) throw new Error(`lights: preset '${name}'.sun must be { color, intensity, offset } (got ${JSON.stringify(p.sun)})`);
    unknown(p.sun, PRESET_SUN, `preset '${name}'.sun.`, ' (presets change colours, intensities, the sun offset and fog distances only)');
    if (p.fog !== undefined && opts.fog === false) throw new Error(`lights: preset '${name}'.fog needs lights.fog (fog on or off changes shaders)`);
  }
}

export function createLightRig(scene, opts = {}) {
  checkLights(opts);
  const base = { ...LIGHT_DEFAULTS, ...opts, sun: { ...LIGHT_DEFAULTS.sun, ...opts.sun } }, s = base.sun;
  const hemi = new THREE.HemisphereLight(base.hemiSky, base.ground, base.hemi);
  const sun = new THREE.DirectionalLight(s.color, s.intensity);
  sun.castShadow = s.map > 0;
  if (sun.castShadow) {
    const [bx, bz] = Array.isArray(s.box) ? s.box : [s.box, s.box];
    sun.shadow.mapSize.set(s.map, s.map);
    Object.assign(sun.shadow.camera, { left: -bx, right: bx, top: bz, bottom: -bz, near: s.near, far: s.far });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = s.bias; sun.shadow.normalBias = s.normalBias;
  }
  scene.add(hemi, sun, sun.target);
  const sky = new THREE.Color(base.sky);
  scene.background = sky;
  scene.fog = base.fog ? new THREE.Fog(base.sky, base.fog[0], base.fog[1]) : null;
  const fogOf = (p, d) => p.fog ?? d.fog ?? (base.fog || [0, 0]);
  const resolve = (p = {}, d = {}) => ({ // a preset over its default (dusk, night) over the base look; made once, read by lerp
    sky: new THREE.Color(p.sky ?? d.sky ?? base.sky), hemiSky: new THREE.Color(p.hemiSky ?? d.hemiSky ?? base.hemiSky),
    ground: new THREE.Color(p.ground ?? d.ground ?? base.ground), hemi: p.hemi ?? d.hemi ?? base.hemi,
    sunColor: new THREE.Color(p.sun?.color ?? d.sun?.color ?? s.color), sun: p.sun?.intensity ?? d.sun?.intensity ?? s.intensity,
    offset: new THREE.Vector3().fromArray(p.sun?.offset ?? d.sun?.offset ?? s.offset),
    near: fogOf(p, d)[0], far: fogOf(p, d)[1],
  });
  const presets = {};
  for (const name of new Set(['day', 'dusk', 'night', ...Object.keys(opts.presets ?? {})])) presets[name] = resolve(opts.presets?.[name], name === 'day' ? undefined : DEFAULT_PRESETS[name]);
  const names = Object.freeze(Object.keys(presets));
  const offset = new THREE.Vector3().copy(presets.day.offset);
  let fx = 0, fy = 0, fz = 0;
  const fail = name => { throw Error(`lights: unknown preset '${name}' (known: ${names.join(', ')})`); };
  const get = name => presets[name] ?? fail(name);
  // y: the followed point's height (for terrain that climbs). Default 0 keeps the box at ground level.
  // The box moves in whole shadow-map texels across the light (its x and y), so a moving point does not make shadow edges
  // shimmer; along the light it moves freely. The drawn box is within a texel of the point.
  const tx = sun.castShadow ? (sun.shadow.camera.right - sun.shadow.camera.left) / s.map : 0, ty = sun.castShadow ? (sun.shadow.camera.top - sun.shadow.camera.bottom) / s.map : 0;
  function follow(x, z, y = 0) {
    fx = x; fz = z; fy = y; _t.set(x, y, z);
    if (tx > 0) { // the shadow camera's basis, as lookAt builds it from the sun's offset and up
      _z.copy(offset).normalize(); _x.crossVectors(sun.shadow.camera.up, _z);
      if (_x.lengthSq() < 1e-12) _x.set(1, 0, 0); else _x.normalize();
      _y.crossVectors(_z, _x);
      const a = _t.dot(_x), b = _t.dot(_y);
      _t.addScaledVector(_x, Math.round(a / tx) * tx - a).addScaledVector(_y, Math.round(b / ty) * ty - b);
    }
    sun.target.position.copy(_t); sun.position.copy(_t).add(offset);
  }
  function lerp(a, b, k) {
    const A = get(a), B = get(b), t = k < 0 ? 0 : k > 1 ? 1 : k;
    sky.copy(A.sky).lerp(B.sky, t);
    if (scene.fog) { scene.fog.color.copy(sky); scene.fog.near = A.near + (B.near - A.near) * t; scene.fog.far = A.far + (B.far - A.far) * t; }
    hemi.color.copy(A.hemiSky).lerp(B.hemiSky, t); hemi.groundColor.copy(A.ground).lerp(B.ground, t); hemi.intensity = A.hemi + (B.hemi - A.hemi) * t;
    sun.color.copy(A.sunColor).lerp(B.sunColor, t); sun.intensity = A.sun + (B.sun - A.sun) * t;
    offset.copy(A.offset).lerp(B.offset, t); follow(fx, fz, fy);
  }
  function set(x) {
    if (typeof x === 'string') return lerp(x, x, 0);
    if (typeof x !== 'number' || x !== x) throw Error(`lights: set takes a preset name or k in [0, 1] (got ${x})`);
    const k = x < 0 ? 0 : x > 1 ? 1 : x;
    return k < 0.5 ? lerp('day', 'dusk', k * 2) : lerp('dusk', 'night', k * 2 - 1);
  }
  function dispose() { scene.remove(hemi, sun, sun.target); sun.dispose(); hemi.dispose(); if (scene.background === sky) scene.background = null; }
  set('day'); follow(0, 0);
  return { hemi, sun, follow, set, lerp, dispose, presets: names };
}
