// createTiltShift (overview §4.6): Pig Pens' src/tiltshift.js, generic.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTiltShift, SHADERS } from '../src/view/render/tiltShift.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;

test('defaults are Pig Pens\' tiltshift.js; unknown options throw', () => {
  assert.deepEqual({ ...createTiltShift(fakeRenderer()).params }, { on: true, band: 0.06, scale: 3.2, nearScale: 1.6, blur: 0.011, sat: 1.05, vig: 0.2, fullAt: 10, offAt: 24, focus: 10, samples: 4 });
  assert.throws(() => createTiltShift(fakeRenderer(), { strength: 1 }), /tiltShift: strength is unknown/);
});
test('zoomed out (focus >= offAt) or off: one plain render to the screen, no extra passes', () => {
  const r = fakeRenderer(), fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  fx.render(scene, cam, 24); fx.params.on = false; fx.render(scene, cam, 5);
  const draws = r.log.filter(l => l[0] === 'render'); assert.equal(draws.length, 2);
  for (const d of draws) { assert.ok(d[1] === scene && d[2] === cam, 'the game scene and camera'); assert.equal(d[3], null); }
});
test('zoomed in: scene to the full target, then prefilter, blur and composite to the screen, sized to the drawing buffer', () => {
  const r = fakeRenderer(); r.setPixelRatio(2); r.setSize(400, 300, false);
  const fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.3, 400);
  r.log.length = 0; fx.render(scene, cam, 5);
  const t = r.log.filter(l => l[0] === 'render').map(l => l[3]);
  assert.equal(t.length, 4);
  assert.ok(t[0] === fx.targets.full && t[1] === fx.targets.half && t[2] === fx.targets.blur && t[3] === null, 'pass order');
  assert.deepEqual([fx.targets.full.width, fx.targets.full.height, fx.targets.half.width, fx.targets.half.height], [800, 600, 400, 300]);
  assert.ok(Math.abs(fx.passes.comp.uniforms.maxR.value - 0.011 * 600 * 0.5) < 1e-12, 'full strength below fullAt');
  assert.equal(fx.passes.comp.uniforms.focus.value, 5); assert.equal(fx.passes.comp.uniforms.near.value, 0.3);
  fx.params.focus = 7; fx.render(scene, cam); assert.equal(fx.passes.comp.uniforms.focus.value, 7, 'focus defaults to params.focus');
});
test('setSize reallocates only when the drawing buffer changes', () => {
  const r = fakeRenderer(); r.setSize(100, 100, false);
  const fx = createTiltShift(r), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  let n = 0; const orig = fx.targets.full.setSize.bind(fx.targets.full); fx.targets.full.setSize = (...a) => { n++; return orig(...a); };
  fx.render(scene, cam, 5); fx.render(scene, cam, 5); assert.equal(n, 1);
  r.setSize(120, 100, false); fx.render(scene, cam, 5); assert.equal(n, 2);
});
test('the composite tone-maps before converting colour space (ACES games keep their look)', () => {
  const tm = SHADERS.COMP.indexOf('#include <tonemapping_fragment>'), cs = SHADERS.COMP.indexOf('#include <colorspace_fragment>');
  assert.ok(tm > 0 && cs > tm, `tonemapping at ${tm}, colorspace at ${cs}`);
});
test('dispose frees the three targets, the depth texture, three materials and the quad geometry', () => {
  const fx = createTiltShift(fakeRenderer()), hits = [];
  const watch = (o, n) => o.addEventListener('dispose', () => hits.push(n));
  watch(fx.targets.full, 'full'); watch(fx.targets.half, 'half'); watch(fx.targets.blur, 'blur'); watch(fx.targets.full.depthTexture, 'depth');
  watch(fx.passes.pre, 'pre'); watch(fx.passes.blur, 'blurMat'); watch(fx.passes.comp, 'comp'); watch(fx.passes.quad.geometry, 'quad');
  fx.dispose(); assert.deepEqual([...new Set(hits)].sort(), ['blur', 'blurMat', 'comp', 'depth', 'full', 'half', 'pre', 'quad']);
});
test('render allocates nothing per frame (R-8)', () => {
  assert.doesNotMatch(createTiltShift(fakeRenderer()).render.toString(), HOT);
});
