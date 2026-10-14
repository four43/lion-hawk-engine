// lion-hawk/view thumbnails (overview §4.6): an object rendered alone in a studio light, on a clear background, to a PNG data
// URL. Replaces Tractor Pickup's three copies (src/ui/icons.js renderIcons and tractorPicture, src/ui/stickerArt.js), with
// auto-framing by yaw and pitch (stickerArt), an optional crop to the drawn pixels and a die-cut outline. The object is put
// back under its parent afterwards (its index there may change); its own transform is never written. colorSpace 'linear'
// (default) is what Tractor ships today; 'srgb' encodes the target.
import * as THREE from 'three';

export const STUDIO = Object.freeze({ sky: '#ffffff', ground: '#b9a27c', hemi: 2.2, sun: 1.6, sunAt: Object.freeze([2, 5, 4]) });

// GPU rows come bottom-up: the box of pixels whose alpha is above min, in GPU rows
export function alphaBounds(px, w, h, min = 8, out = {}) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  out.empty = x1 < 0; out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
  return out;
}
// GPU rows y0..y1 (bottom-up), columns x0..x1, into dst top-down (an ImageData's data)
export function copyRows(px, w, x0, y0, x1, y1, dst) {
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  for (let y = 0; y < ch; y++) dst.set(px.subarray(((y1 - y) * w + x0) * 4, ((y1 - y) * w + x1 + 1) * 4), y * cw * 4);
  return dst;
}

const studios = new WeakMap(); // renderer → { scene, pivot, lit, cam }
function studioOf(renderer) {
  let st = studios.get(renderer);
  if (!st) {
    const scene = new THREE.Scene(), pivot = new THREE.Group(), lit = new THREE.Group(), cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const sun = new THREE.DirectionalLight('#ffffff', STUDIO.sun); sun.position.fromArray(STUDIO.sunAt);
    lit.add(new THREE.HemisphereLight(STUDIO.sky, STUDIO.ground, STUDIO.hemi), sun);
    scene.add(lit, pivot); studios.set(renderer, st = { scene, pivot, lit, cam });
  }
  return st;
}
const box = new THREE.Box3(), centre = new THREE.Vector3(), extent = new THREE.Vector3();
const dim = v => Number.isInteger(v) && v > 0;
function frame(st, object, aspect, fov, pitch, fill) { // stickerArt: the bounding sphere fills the narrower field of view
  const cam = st.cam, half = fov * Math.PI / 360, fit = aspect < 1 ? Math.atan(Math.tan(half) * aspect) : half;
  box.setFromObject(object); box.getCenter(centre);
  const r = (box.isEmpty() ? 0 : box.getSize(extent).length() / 2) || 1, d = r / Math.sin(fit) * fill;
  cam.fov = fov; cam.aspect = aspect; cam.near = Math.max(0.01, d - r * 2); cam.far = d + r * 2;
  cam.position.set(centre.x, centre.y + Math.sin(pitch) * d, centre.z + Math.cos(pitch) * d); cam.lookAt(centre);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
}

export function snapshot(renderer, object, { size = 256, camera = null, yaw = 0, pitch = 0.22, fov = 28, fill = 1.02, lights = true, crop = false, outline = null, alpha = 8, colorSpace = 'linear', out = null } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size]; // 3l CI-13: [w, h] for a non-square picture
  if (!dim(W) || !dim(H) || (Array.isArray(size) && size.length !== 2)) throw new Error(`snapshot: size must be a positive integer or [w, h] of positive integers (got ${JSON.stringify(size)})`);
  const st = studioOf(renderer), parent = object.parent, px = new Uint8Array(W * H * 4);
  st.lit.visible = lights !== false; st.pivot.rotation.y = yaw; st.pivot.add(object);
  try {
    st.scene.updateMatrixWorld(true);
    const cam = camera ?? frame(st, object, W / H, fov, pitch, fill);
    const rt = new THREE.WebGLRenderTarget(W, H);
    if (colorSpace === 'srgb') rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(st.scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally { renderer.setRenderTarget(prev); renderer.setClearColor(clear, clearA); rt.dispose(); }
  } finally {
    st.pivot.remove(object); st.pivot.rotation.y = 0;
    if (parent) parent.add(object);
  }
  return encode(renderer, px, W, H, crop, outline, alpha, out);
}

function encode(renderer, px, W, H, crop, outline, alpha, out) {
  const doc = renderer.domElement?.ownerDocument ?? globalThis.document;
  let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
  if (crop) {
    const b = alphaBounds(px, W, H, alpha);
    if (b.empty) { if (out) { out.w = 0; out.h = 0; } return ''; }
    ({ x0, y0, x1, y1 } = b);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, art = doc.createElement('canvas'); art.width = w; art.height = h;
  const ctx = art.getContext('2d'), img = ctx.createImageData(w, h);
  copyRows(px, W, x0, y0, x1, y1, img.data); ctx.putImageData(img, 0, 0);
  let result = art;
  if (outline) { // stickerArt's die-cut border: the shape in white, stamped all around it, under the art
    const B = outline.px ?? 11, sil = doc.createElement('canvas'); sil.width = w; sil.height = h;
    const sc = sil.getContext('2d'); sc.drawImage(art, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = outline.color ?? '#ffffff'; sc.fillRect(0, 0, w, h);
    result = doc.createElement('canvas'); result.width = w + B * 2; result.height = h + B * 2;
    const oc = result.getContext('2d');
    for (const rr of [B * 0.5, B]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; oc.drawImage(sil, B + Math.cos(a) * rr, B + Math.sin(a) * rr); }
    oc.drawImage(art, B, B);
  }
  if (out) { out.w = result.width; out.h = result.height; }
  return result.toDataURL();
}
