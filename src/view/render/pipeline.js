// Boot's render pipeline (overview §4.6). With defineView({ render }), boot builds this before any view half enters:
//   view.gfx      createRenderer's result plus lights and warm(opts)
//   view.materials  the compiler (shading tier D5)
//   view.assets   also engine.assets (view-only)
//   view.sync, view.audio
// Each render slot runs reconcile (boot) → frame(alpha): sync.frame → the halves' frames (boot) → draw(): gfx.render.
// Without WebGL the renderer's error is reported once as 'render: …' and the page runs on with view.gfx = null; the sim,
// the UI and audio keep working (RF1).
import { createRenderer, checkShadows, checkToneMapping } from './renderer.js';
import { createLightRig, checkLights } from './lights.js';
import { warm } from './hygiene.js';
import { createAssets } from '../assets/index.js';
import { createViewSync } from '../sync/index.js';
import { createAudio } from '../audio/index.js';
import { createMaterialCompiler } from '../materials/compiler.js';

export const RENDER_KEYS = Object.freeze(['shading', 'dpr', 'antialias', 'shadows', 'toneMapping', 'exposure', 'camera', 'lights', 'assets', 'paint']);
export const SHADING = Object.freeze(['physical', 'standard', 'lambert']);
const CAMERA_KEYS = ['fov', 'fovPortrait', 'near', 'far'], ASSET_KEYS = ['manifest', 'base', 'decoders'], DPR_KEYS = ['touch', 'desktop'], PAINT_KEYS = ['base', 'shade'];
const known = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`defineView: render.${where}${k} is unknown (known: ${keys.join(', ')})`); };

export function checkRender(render) {
  if (render === undefined) return;
  if (!render || typeof render !== 'object') throw new Error('defineView: render must be an object');
  known(render, RENDER_KEYS, '');
  if (render.shading !== undefined && !SHADING.includes(render.shading)) throw new Error(`defineView: render.shading must be ${SHADING.join(' | ')} (got ${JSON.stringify(render.shading)})`);
  if (render.shadows !== undefined) checkShadows(render.shadows);
  if (render.toneMapping !== undefined) checkToneMapping(render.toneMapping);
  const d = render.dpr;
  if (d !== undefined && !(typeof d === 'number' && d > 0) && !(d && typeof d === 'object' && Object.keys(d).length && Object.keys(d).every(k => DPR_KEYS.includes(k) && d[k] > 0))) throw new Error(`defineView: render.dpr must be a number above 0 or { touch, desktop } (got ${JSON.stringify(d)})`);
  if (render.camera !== undefined) known(render.camera, CAMERA_KEYS, 'camera.');
  if (render.assets !== undefined) { // rulings 3e #3, 3j #6, 3k C6, 3l CI-12: the one way the baked manifest reaches boot
    if (!render.assets || typeof render.assets !== 'object') throw new Error('defineView: render.assets must be { manifest, base, decoders? }');
    known(render.assets, ASSET_KEYS, 'assets.');
    if (!render.assets.manifest) throw new Error('defineView: render.assets.manifest is required (the baked manifest.json)');
  }
  if (render.paint !== undefined) { // 3f C11: the shape here; whether base is in the registry is the compiler's check at boot
    const p = render.paint;
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('defineView: render.paint must be { base, shade }');
    known(p, PAINT_KEYS, 'paint.');
    if (p.base !== undefined && !(typeof p.base === 'string' && p.base)) throw new Error(`defineView: render.paint.base must be a material id (got ${JSON.stringify(p.base)})`);
    if (p.shade !== undefined && !(Array.isArray(p.shade) && p.shade.length === 3 && p.shade.every(Number.isFinite))) throw new Error(`defineView: render.paint.shade must be [floor, gain, max] numbers (got ${JSON.stringify(p.shade)})`);
  }
  if (render.lights !== undefined && render.lights !== false) checkLights(render.lights);
}

export function createPipeline(engine, view, render, { doc, target, canvas, renderer = null, flags = {}, report }) {
  canvas ??= renderer?.domElement ?? doc?.querySelector?.('canvas') ?? null;
  if (!canvas) throw new Error('boot: defineView({ render }) needs a canvas: pass boot(game, view, { canvas }) or put a <canvas> in the page');
  view.audio = createAudio({ doc, flags });
  let gfx = null;
  try {
    gfx = createRenderer({ canvas, renderer, target, dpr: render.dpr, antialias: render.antialias, shadows: render.shadows, toneMapping: render.toneMapping, exposure: render.exposure, camera: render.camera,
      onLost: () => report(new Error('render: the WebGL context was lost (the GPU reset, or the page was in the background); drawing resumes when it is restored')),
      onRestored: () => { Promise.resolve().then(() => gfx.warm?.()).catch(report); } }); // every program is gone: compile them again before they are drawn
  } catch (err) {
    report(new Error(`render: ${err?.message ?? err}`));
  }
  if (!gfx) {
    view.gfx = view.materials = view.assets = view.sync = null; engine.assets = undefined;
    let gone = false;
    return { frame() {}, draw() {}, dispose() { if (gone) return; gone = true; view.audio.dispose(); } };
  }
  let materials = null;
  const abort = err => { // a failed build frees what it made: the renderer's page claim, its listeners, the audio
    try { view.assets?.dispose(); } catch {} try { materials?.dispose(); } catch {}
    try { gfx.lights?.dispose(); } catch {} try { gfx.dispose(); } catch {} try { view.audio.dispose(); } catch {}
    view.gfx = view.materials = view.assets = view.sync = null; engine.assets = undefined;
    throw err;
  };
  try {
    gfx.lights = render.lights === false ? null : createLightRig(gfx.scene, render.lights ?? {});
    materials = createMaterialCompiler(engine.game.defs?.materials, { shading: render.shading ?? 'physical', paint: render.paint }); // 3f C11
    gfx.warm = (opts = {}) => { // 3f C5: made() → [{ material, use }]; userData.lhUse on each material picks the warm mesh
      const list = [];
      for (const e of materials.made?.() ?? []) list.push(e?.isMaterial ? e : e.material);
      return warm(gfx.renderer, gfx.scene, gfx.camera, { materials: list.concat(opts.materials ?? []), depth: (materials.twins?.() ?? []).concat(opts.depth ?? []) });
    };
    view.gfx = gfx; view.materials = materials;
    const a = render.assets; // without it, no createAssets: 3f's throws on a missing manifest
    view.assets = a ? createAssets({ manifest: a.manifest, base: a.base ?? './assets/', decoders: a.decoders, compiler: materials, renderer: gfx.renderer, gfx }) : null;
    engine.assets = view.assets ?? undefined;
    view.sync = createViewSync(engine, { gfx, assets: view.assets, compiler: materials, view }); // 3g #1: view for hooks and view.dt
  } catch (err) { abort(err); }
  let disposed = false;
  return {
    frame(alpha) { if (!disposed) view.sync.frame(alpha); },
    draw() { if (!disposed) gfx.render(); },
    dispose() {
      if (disposed) return; disposed = true;
      if (view.assets && engine.assets === view.assets) engine.assets = undefined;
      let first = null; // every step runs; the first error surfaces
      for (const step of [() => view.sync.dispose?.(), () => view.assets?.dispose(), () => materials.dispose(), () => view.audio.dispose(), () => gfx.lights?.dispose(), () => gfx.dispose()]) {
        try { step(); } catch (err) { first ??= err; }
      }
      if (first) throw first;
    },
  };
}
