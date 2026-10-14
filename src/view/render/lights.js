// lion-hawk/view light rig (overview §4.6): a hemisphere light, a shadowed sun whose shadow box follows a point, fog in the
// sky colour, and named looks (presets) blended by k. A preset changes colours, intensities, the sun's offset and the fog
// distances, never state that selects a shader program: fog on/off, shadow casting, map size (Tractor X-4 stutters).
// Defaults are Tractor Pickup's src/render/scene.js. The default dusk and night presets reproduce its setNight(k) exactly.
// Pig Pens (src/view/world.js) and Rally (src/render.js setLook) map onto options and presets.
import * as THREE from 'three';

export const LIGHT_DEFAULTS = Object.freeze({
  sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3,
  sun: Object.freeze({ color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: Object.freeze([-26, 46, 22]), near: 5, far: 120, bias: -0.0006, normalBias: 0.03 }),
  fog: Object.freeze([90, 220]),
});
export const DEFAULT_PRESETS = Object.freeze({ // Tractor E-5 bedtime: k 0.5 = sunset, 1 = night (hemi 1.3 - k, sun 2.1 - 1.95 k)
  dusk: Object.freeze({ sky: '#f4a76b', hemi: 0.8, sun: Object.freeze({ color: '#ffa860', intensity: 1.125 }) }),
  night: Object.freeze({ sky: '#1b2440', hemi: 0.3, sun: Object.freeze({ color: '#9fb4ff', intensity: 0.15 }) }),
});
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
  // y: the followed point's height (Rally's stages climb; 3j request 6). Default 0 keeps Tractor and Pig Pens unchanged.
  function follow(x, z, y = 0) { fx = x; fz = z; fy = y; sun.position.set(x + offset.x, y + offset.y, z + offset.z); sun.target.position.set(x, y, z); }
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
