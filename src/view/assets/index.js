// STUB (3e): createAssets with the overview §4.7 surface, inert, so boot's render pipeline (render/pipeline.js) runs before
// 3f lands. 3f replaces this file wholesale; at the Wave B merge the owner's file wins.
export function createAssets({ manifest = null, base = './assets/', compiler = null, renderer = null, gfx = null, decoders = {}, fetch = null } = {}) {
  const missing = key => { throw new Error(`assets: '${key}' is not preloaded (stub until 3f)`); };
  return { progress: { loaded: 0, total: 0, bytes: 0 }, preload: async () => undefined, has: () => false, get: missing, clone: missing, dispose() {} };
}
