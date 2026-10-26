// lion-hawk/view renderer (overview §4.6, design §6.6): one WebGLRenderer per page, the DPR cap by touch, PCF shadows, tone
// mapping, and a resize with the portrait FOV rule. A game gets one ready renderer instead of writing its own
// bootstrap.
import * as THREE from 'three';

export const SHADOWS = Object.freeze({ pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap, basic: THREE.BasicShadowMap });
export const TONE = Object.freeze({ none: THREE.NoToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping });
export const PORTRAIT_BELOW = 0.9; // aspect below this: the portrait FOV (X-12)
export const DEFAULT_DPR = Object.freeze({ touch: 1.5, desktop: 2 }); // an iPad at 1.5 holds 60 fps (X-4)
export const DEFAULT_CAMERA = Object.freeze({ fov: 60, fovPortrait: 64, near: 0.3, far: 500 });
const names = o => Object.keys(o).map(k => `'${k}'`).join(' | ');
export function checkShadows(v) { if (v !== false && !Object.hasOwn(SHADOWS, v)) throw new Error(`render: shadows must be ${names(SHADOWS)} | false (got ${JSON.stringify(v)})`); }
export function checkToneMapping(v) { if (!Object.hasOwn(TONE, v)) throw new Error(`render: toneMapping must be ${names(TONE)} (got ${JSON.stringify(v)})`); }

// The resize rule, pure. The CSS size falls back to the window, then 1, while the canvas has no layout. The DPR is capped by
// touch: navigator.maxTouchPoints > 1 is an iPad or a phone; 1 is a desktop touch screen. The portrait FOV applies below
// aspect 0.9.
export function fitView({ cssW, cssH, winW, winH, deviceDpr, touchPoints }, { dpr = DEFAULT_DPR, fov = DEFAULT_CAMERA.fov, fovPortrait = DEFAULT_CAMERA.fovPortrait } = {}, out = {}) {
  const w = cssW > 0 ? cssW : winW > 0 ? winW : 1, h = cssH > 0 ? cssH : winH > 0 ? winH : 1;
  const cap = typeof dpr === 'number' ? dpr : touchPoints > 1 ? dpr.touch ?? DEFAULT_DPR.touch : dpr.desktop ?? DEFAULT_DPR.desktop;
  out.w = w; out.h = h; out.pixelRatio = Math.min(deviceDpr > 0 ? deviceDpr : 1, cap); out.aspect = w / h;
  out.fov = out.aspect < PORTRAIT_BELOW ? fovPortrait : fov;
  return out;
}

const live = new WeakMap(); // page (the canvas's document) → its renderer: one WebGLRenderer per page

// onLost / onRestored: the canvas's webglcontextlost / webglcontextrestored (iOS and Android drop a backgrounded page's
// context). three's WebGLRenderer keeps the canvas restorable and rebuilds its state; gfx.lost is true in between and
// render() draws nothing then.
export function createRenderer({ canvas, dpr = DEFAULT_DPR, antialias = true, shadows = 'pcf', toneMapping = 'none', exposure = 1, camera = {}, renderer = null, target, onLost = null, onRestored = null } = {}) {
  checkShadows(shadows); checkToneMapping(toneMapping);
  canvas ??= renderer?.domElement;
  if (!canvas) throw new Error('render: createRenderer needs { canvas }');
  const page = canvas.ownerDocument ?? canvas;
  if (live.has(page)) throw new Error('render: this page already has a renderer (one WebGLRenderer per page); dispose the first one');
  target ??= canvas.ownerDocument?.defaultView ?? globalThis;
  const r = renderer ?? new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' }); // throws without WebGL
  live.set(page, r);
  r.shadowMap.enabled = shadows !== false;
  if (shadows !== false) r.shadowMap.type = SHADOWS[shadows];
  r.toneMapping = TONE[toneMapping]; r.toneMappingExposure = exposure;
  const cam = { ...DEFAULT_CAMERA, ...camera };
  const scene = new THREE.Scene(), view = new THREE.PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
  const size = { w: 1, h: 1 }, fit = { w: 1, h: 1, pixelRatio: 1, aspect: 1, fov: cam.fov }, opts = { dpr, fov: cam.fov, fovPortrait: cam.fovPortrait };
  const input = { cssW: 0, cssH: 0, winW: 0, winH: 0, deviceDpr: 1, touchPoints: 0 };
  const stats = { calls: 0, triangles: 0, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0 };
  let disposed = false, sized = false;
  function resize() {
    if (disposed) return size;
    input.cssW = canvas.clientWidth ?? 0; input.cssH = canvas.clientHeight ?? 0;
    input.winW = target.innerWidth ?? 0; input.winH = target.innerHeight ?? 0;
    input.deviceDpr = target.devicePixelRatio ?? 1;
    input.touchPoints = (target.navigator ?? globalThis.navigator)?.maxTouchPoints ?? 0;
    const pw = fit.w, ph = fit.h, pr = fit.pixelRatio;
    fitView(input, opts, fit);
    size.w = fit.w; size.h = fit.h;
    if (sized && fit.w === pw && fit.h === ph && fit.pixelRatio === pr) return size; // setSize reallocates the drawing buffer: only on a change
    sized = true; r.setPixelRatio(fit.pixelRatio); r.setSize(fit.w, fit.h, false);
    view.aspect = fit.aspect; view.fov = fit.fov; view.userData.lhFov = fit.fov; view.updateProjectionMatrix();
    return size;
  }
  const onResize = () => resize();
  target.addEventListener?.('resize', onResize);
  const ro = typeof target.ResizeObserver === 'function' ? new target.ResizeObserver(onResize) : null; // the canvas can change size without a window resize (X-11)
  ro?.observe(canvas);
  const onCtxLost = e => { e.preventDefault?.(); gfx.lost = true; onLost?.(); }; // preventDefault: the browser may restore it
  const onCtxRestored = () => { gfx.lost = false; onRestored?.(); };
  canvas.addEventListener?.('webglcontextlost', onCtxLost); canvas.addEventListener?.('webglcontextrestored', onCtxRestored);
  const gfx = {
    renderer: r, scene, camera: view, size, post: null, resize, lost: false,
    render() { if (disposed || gfx.lost) return; if (gfx.post) gfx.post.render(scene, view); else r.render(scene, view); },
    info() {
      const i = r.info;
      stats.calls = i.render.calls; stats.triangles = i.render.triangles; stats.points = i.render.points; stats.lines = i.render.lines;
      stats.geometries = i.memory.geometries; stats.textures = i.memory.textures; stats.programs = i.programs?.length ?? 0;
      return stats;
    },
    dispose() {
      if (disposed) return; disposed = true;
      target.removeEventListener?.('resize', onResize); ro?.disconnect();
      canvas.removeEventListener?.('webglcontextlost', onCtxLost); canvas.removeEventListener?.('webglcontextrestored', onCtxRestored);
      gfx.post?.dispose?.(); gfx.post = null;
      r.dispose(); if (live.get(page) === r) live.delete(page);
    },
  };
  resize();
  return gfx;
}
