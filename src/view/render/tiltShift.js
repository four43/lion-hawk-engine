// Tilt-shift "miniature" post pass (overview §4.6), from Pig Pens src/tiltshift.js, made generic: a very shallow depth of
// field focused at `focus` (the camera-to-target distance). Blur grows with depth away from the focus, relative to it.
//   1. scene -> full-res MSAA target with a depth texture
//   2. half-res prefilter: colour + signed circle of confusion (CoC) packed in alpha
//   3. half-res gather blur: golden-angle spiral; a sample lands only if its own CoC reaches the centre (no halos)
//   4. full-res composite: sharp where CoC ~ 0, blurred elsewhere, a little saturation and vignette, then tone mapping and
//      the output colour space (tone mapping is a no-op for toneMapping 'none', so Pig Pens' pixels are unchanged)
// The look fades in as the camera zooms in (full at fullAt, gone by offAt); zoomed out it is one plain render.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const PRE = `
#include <packing>
uniform sampler2D tColor, tDepth; uniform float near, far, focus, band, scale, nearScale;
varying vec2 vUv;
float coc(vec2 uv) {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
  float d = (z - focus) / focus;
  return sign(d) * clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
}
void main() {
  vec2 px = 0.5 / vec2(textureSize(tColor, 0));
  vec3 c = texture2D(tColor, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, -px.y)).rgb
         + texture2D(tColor, vUv + vec2(-px.x, px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, px.y)).rgb;
  gl_FragColor = vec4(c * 0.25, coc(vUv));
}`;
const BLUR = `
uniform sampler2D tHalf; uniform float maxR;
varying vec2 vUv;
#define N 40
void main() {
  vec2 px = 1.0 / vec2(textureSize(tHalf, 0));
  vec4 c0 = texture2D(tHalf, vUv);
  float rc = abs(c0.a) * maxR;
  vec3 acc = c0.rgb; float tot = 1.0, fg = 0.0;
  for (int i = 1; i < N; i++) {
    float r = sqrt(float(i) / float(N)) * maxR;
    float a = float(i) * 2.39996323;
    vec4 s = texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * r * px);
    float rs = abs(s.a) * maxR;
    if (s.a > c0.a) rs = min(rs, rc * 2.0);
    float m = smoothstep(r - 0.5, r + 0.5, rs);
    if (s.a < c0.a) fg = max(fg, m * abs(s.a));
    acc += mix(acc / tot, s.rgb, m); tot += 1.0;
  }
  gl_FragColor = vec4(acc / tot, fg);
}`;
const COMP = `
#include <packing>
uniform sampler2D tColor, tDepth, tBlur; uniform float near, far, focus, band, scale, nearScale, maxR, sat, vig;
varying vec2 vUv;
void main() {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
  float d = (z - focus) / focus;
  float k = clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
  vec3 sharp = texture2D(tColor, vUv).rgb;
  vec4 bl = texture2D(tBlur, vUv);
  float w = smoothstep(0.25, 1.25, max(k, bl.a) * maxR);
  vec3 c = mix(sharp, bl.rgb, w);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.6;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SHADERS = Object.freeze({ VERT, PRE, BLUR, COMP });
export const TILT_DEFAULTS = Object.freeze({ on: true, band: 0.06, scale: 3.2, nearScale: 1.6, blur: 0.011, sat: 1.05, vig: 0.2, fullAt: 10, offAt: 24, focus: 10, samples: 4 });

export function createTiltShift(renderer, opts = {}) {
  for (const k of Object.keys(opts)) if (!Object.hasOwn(TILT_DEFAULTS, k)) throw new Error(`tiltShift: ${k} is unknown (known: ${Object.keys(TILT_DEFAULTS).join(', ')})`);
  const P = { ...TILT_DEFAULTS, ...opts };
  const mk = (samples, depthBuffer) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer });
  const full = mk(P.samples, true); full.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const half = mk(0, false), blurT = mk(0, false);
  const U = { near: { value: 1 }, far: { value: 100 }, focus: { value: 10 }, band: { value: P.band }, scale: { value: P.scale }, nearScale: { value: P.nearScale }, maxR: { value: 4 } };
  const pass = (frag, extra) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { ...U, ...extra }, depthTest: false, depthWrite: false });
  const pre = pass(PRE, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture } });
  const blur = pass(BLUR, { tHalf: { value: half.texture } });
  const comp = pass(COMP, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture }, tBlur: { value: blurT.texture }, sat: { value: P.sat }, vig: { value: P.vig } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qScene = new THREE.Scene(), qCam = new THREE.Camera();
  quad.frustumCulled = false; qScene.add(quad);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  const size = new THREE.Vector2();
  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = size.x, h = size.y, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    if (full.width === w && full.height === h) return;
    full.setSize(w, h); half.setSize(hw, hh); blurT.setSize(hw, hh);
  }
  function render(scene, camera, focus = P.focus) {
    const k = 1 - THREE.MathUtils.smoothstep(focus, P.fullAt, P.offAt);
    if (!P.on || k <= 0.001) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    setSize();
    U.near.value = camera.near; U.far.value = camera.far; U.focus.value = focus;
    U.band.value = P.band; U.scale.value = P.scale; U.nearScale.value = P.nearScale; U.maxR.value = P.blur * full.height * 0.5 * k;
    comp.uniforms.sat.value = 1 + (P.sat - 1) * k; comp.uniforms.vig.value = P.vig * k;
    renderer.setRenderTarget(full); renderer.render(scene, camera);
    run(pre, half); run(blur, blurT); run(comp, null);
  }
  function dispose() { full.depthTexture.dispose(); full.dispose(); half.dispose(); blurT.dispose(); pre.dispose(); blur.dispose(); comp.dispose(); quad.geometry.dispose(); }
  return { render, setSize, dispose, params: P, targets: { full, half, blur: blurT }, passes: { pre, blur, comp, quad } };
}
