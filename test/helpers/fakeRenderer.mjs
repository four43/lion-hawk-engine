// A WebGLRenderer stand-in for Node tests of lion-hawk/view render modules (Node has no WebGL). It records calls in `log`
// and keeps the state the modules read back: pixel ratio, size, the render target and the clear colour.
const visibleMeshes = scene => { const out = []; scene.traverseVisible(o => { if (o.isMesh) out.push(o); }); return out; };
export function fakeRenderer({ programs = 0, doc = null, pixels = null } = {}) {
  const log = [];
  const r = {
    log, disposed: false, domElement: doc ? { ownerDocument: doc } : null,
    shadowMap: { enabled: false, type: -1 }, toneMapping: -1, toneMappingExposure: -1,
    pixelRatio: 1, width: 0, height: 0, target: null, clearColor: 0x000000, clearAlpha: 1,
    info: { render: { calls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: Array.from({ length: programs }, () => ({})) },
    setPixelRatio(v) { r.pixelRatio = v; log.push(['setPixelRatio', v]); },
    getPixelRatio() { return r.pixelRatio; },
    setSize(w, h, style) { r.width = w; r.height = h; log.push(['setSize', w, h, style]); },
    getDrawingBufferSize(out) { return out.set(Math.floor(r.width * r.pixelRatio), Math.floor(r.height * r.pixelRatio)); },
    render(scene, camera) { r.info.render.calls++; log.push(['render', scene, camera, r.target]); },
    clear() { log.push(['clear', r.target]); },
    compile(scene) { log.push(['compile', visibleMeshes(scene)]); },
    compileAsync(scene) { log.push(['compileAsync', visibleMeshes(scene)]); return Promise.resolve(scene); },
    setRenderTarget(t) { r.target = t; log.push(['setRenderTarget', t]); },
    getRenderTarget() { return r.target; },
    getClearColor(out) { return out.setHex(r.clearColor); },
    getClearAlpha() { return r.clearAlpha; },
    setClearColor(c, a = 1) { r.clearColor = typeof c === 'number' ? c : c.getHex(); r.clearAlpha = a; },
    readRenderTargetPixels(rt, x, y, w, h, px) { log.push(['read', rt, w, h]); pixels?.(px, w, h); },
    dispose() { r.disposed = true; log.push(['dispose']); },
  };
  return r;
}
