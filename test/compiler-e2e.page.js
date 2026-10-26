// Bundled by test/compiler-e2e.test.mjs: real WebGL2 (SwiftShader) checks of the compiled materials. Each window.lh*
// function builds its own renderer and returns plain data.
import * as THREE from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ffffff', roughness: 1 }, coverage: { dirt: 1, rust: 1, snow: 1, mud: 1 } },
  testFur: { look: { color: '#ffffff', roughness: 1, fur: { length: 0.3, shells: 8, density: 6, tint: '#ffffff' } } },
  testWax: { look: { color: '#ffffff', roughness: 1, subsurface: { color: '#ff8866', strength: 1 } } },
  testBare: { look: { color: '#ffffff', roughness: 1 } },
  testCoat: { look: { color: '#606060', roughness: 1, fur: { length: 0.3, shells: 8, density: 6, tint: '#ffffff' } }, coverage: { mud: 1, wet: 1 } },
});
const S = 64;

function rig(tier) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S; document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(S, S, false); renderer.shadowMap.enabled = true;
  const errors = [];
  renderer.debug.onShaderError = (gl, program, vs, fs) => errors.push(`${gl.getProgramInfoLog(program)}\n${gl.getShaderInfoLog(vs)}\n${gl.getShaderInfoLog(fs)}`.trim());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 2); sun.castShadow = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6), sun);
  const mc = createMaterialCompiler(REG, { shading: tier });
  const pixels = () => { const gl = renderer.getContext(), px = new Uint8Array(S * S * 4); gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const shot = () => { renderer.render(scene, camera); return pixels(); };
  const done = () => { mc.dispose(); renderer.dispose(); canvas.remove(); };
  return { renderer, scene, camera, mc, errors, shot, done };
}
const coloured = geo => { geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); return geo; };
const sum = (px, ch) => { let s = 0; for (let i = ch; i < px.length; i += 4) s += px[i]; return s; };
const lit = px => { let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) n++; return n; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++; return n; };

// Every feature, plain and instanced, in one scene: no shader errors; then more paint and coverage users add no programs.
window.lhCompileAll = tier => {
  const r = rig(tier), { mc, scene } = r, box = coloured(new THREE.BoxGeometry(0.5, 0.5, 0.5));
  const add = (o, x) => { o.position.x = x; scene.add(o); return o; };
  let x = -3;
  for (const id of ['testMud', 'testFur', 'testWax', 'testBare']) {
    add(new THREE.Mesh(box, mc.get(id, { vertexColors: true })), x += 0.4);
    const im = add(new THREE.InstancedMesh(box, mc.get(id, { instanced: true, vertexColors: true }), 2), x += 0.4);
    im.setColorAt(0, new THREE.Color(1, 0, 0)); im.setColorAt(1, new THREE.Color(0, 1, 0));
  }
  add(new THREE.Mesh(furGeometry(box, () => 1), mc.get('testFur', { vertexColors: true })), x += 0.4);
  add(new THREE.InstancedMesh(box, mc.get('testBare', { instanced: true, vertexColors: true, wind: { fade: [30, 60] } }), 2), x += 0.4);
  add(new THREE.Mesh(box, mc.coverage(mc.get('testMud', { vertexColors: true })).material), x += 0.4);
  const cg = box.clone(); cg.setAttribute('instanceCoverage', new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 1, 0, 1, 1, 0]), 4));
  add(new THREE.InstancedMesh(cg, mc.coverage(mc.get('testMud', { instanced: true, vertexColors: true })).material, 2), x += 0.4);
  add(new THREE.Mesh(box, mc.extend(mc.get('testMud', { vertexColors: true }), 'tint', (sh, inject) => { sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= 0.9;'); })), x += 0.4);
  add(new THREE.Mesh(box, mc.paint('steel', '#ff0000', { vertexColors: true })), x += 0.4);
  r.renderer.compile(scene, r.camera); r.shot();
  const before = r.renderer.info.programs.length;
  for (let i = 0; i < 4; i++) add(new THREE.Mesh(box, mc.coverage(mc.get('testMud', { vertexColors: true })).material), 2.5);
  for (const c of ['#00ff00', '#0000ff', '#ffff00']) add(new THREE.Mesh(box, mc.paint('steel', c, { vertexColors: true })), 2.5);
  r.shot();
  const out = { errors: r.errors, before, after: r.renderer.info.programs.length };
  r.done();
  return out;
};

// A coverage clone's own uCoverage reaches the GPU: dirt 0 → 1 browns a white plane; another entity's clone stays clean.
window.lhCoverage = tier => {
  const r = rig(tier), plane = coloured(new THREE.PlaneGeometry(3, 3));
  const a = r.mc.coverage(r.mc.get('testMud', { vertexColors: true })), b = r.mc.coverage(r.mc.get('testMud', { vertexColors: true }));
  const mesh = new THREE.Mesh(plane, a.material); r.scene.add(mesh);
  const clean = r.shot();
  a.uniforms.uCoverage.set(1, 0, 0, 0); const dirty = r.shot();
  mesh.material = b.material; const other = r.shot();
  const out = { errors: r.errors, blue: [sum(clean, 2), sum(dirty, 2), sum(other, 2)] };
  r.done();
  return out;
};

// FUR shells widen the silhouette; SUBSURFACE brightens past the terminator (not on lambert); WIND moves blades with mc.time.
window.lhFeatures = tier => {
  const r = rig(tier), { mc, scene } = r;
  const fg = furGeometry(coloured(new THREE.BoxGeometry(1, 1, 1)), () => 1, { shells: 8 });
  const fur = new THREE.Mesh(fg, mc.get('testFur', { vertexColors: true })); scene.add(fur);
  const furLit = lit(r.shot());
  fur.material = mc.get('testFur', { vertexColors: true, fur: false });
  const bareLit = lit(r.shot());
  scene.remove(fur);
  const ball = coloured(new THREE.SphereGeometry(1, 32, 16)), sphere = new THREE.Mesh(ball, mc.get('testWax', { vertexColors: true })); scene.add(sphere);
  const wax = sum(r.shot(), 0);
  sphere.material = mc.get('testBare', { vertexColors: true });
  const plain = sum(r.shot(), 0);
  scene.remove(sphere);
  const blade = new THREE.Mesh(coloured(new THREE.BoxGeometry(0.2, 2, 0.2)), mc.get('testBare', { vertexColors: true, wind: { amp: [0.5, 0.5] } })); scene.add(blade);
  mc.time.value = 0; const t0 = r.shot();
  mc.time.value = 1; const t1 = r.shot();
  const out = { errors: r.errors, furLit, bareLit, wax, plain, windMoved: diff(t0, t1) };
  r.done();
  return out;
};
// COVERAGE_WET and the coat: wet and mud mat the fur (fewer shell pixels), wet adds a highlight (a brighter peak, every tier,
// lambert too), and an instance's instanceWet mats only that instance.
window.lhWet = tier => {
  const r = rig(tier), { mc, scene } = r, peak = px => { let m = 0; for (let i = 0; i < px.length; i += 4) m = Math.max(m, px[i] + px[i + 1] + px[i + 2]); return m; };
  const fg = furGeometry(coloured(new THREE.BoxGeometry(1, 1, 1)), () => 1, { shells: 8 });
  const c = mc.coverage(mc.get('testCoat', { vertexColors: true })), fur = new THREE.Mesh(fg, c.material); scene.add(fur);
  const dryLit = lit(r.shot());
  c.uniforms.uWet.x = 1; const wetLit = lit(r.shot());
  c.uniforms.uWet.x = 0; c.uniforms.uCoverage.set(0, 0, 0, 1); const mudLit = lit(r.shot());
  scene.remove(fur);
  const g = mc.coverage(mc.get('testCoat', { vertexColors: true, fur: false })), ball = new THREE.Mesh(coloured(new THREE.SphereGeometry(1, 48, 24)), g.material); scene.add(ball);
  const dryPeak = peak(r.shot());
  g.uniforms.uWet.x = 1; const wetPeak = peak(r.shot());
  scene.remove(ball);
  const ig = fg.clone(); ig.setAttribute('instanceCoverage', new THREE.InstancedBufferAttribute(new Float32Array(8), 4));
  ig.setAttribute('instanceWet', new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1));
  const im = new THREE.InstancedMesh(ig, mc.coverage(mc.get('testCoat', { instanced: true, vertexColors: true })).material, 2);
  im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1, 0, 0)); im.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0)); scene.add(im);
  const px = r.shot(), half = [0, 0];
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) half[((i >> 2) % S) < S / 2 ? 0 : 1]++;
  const out = { errors: r.errors, dryLit, wetLit, mudLit, dryPeak, wetPeak, half };
  r.done();
  return out;
};

// Task 8b: PAINT on the GPU. A plane, dark on the left and bright on the right: a solid paint keeps the bright side brighter in the
// paint's hue; a hue ramp along x is red on the left and green on the right; no paint draws exactly the plain vertex colours; more
// colours and hues add no programs.
window.lhPaint = tier => {
  const r = rig(tier), g = new THREE.PlaneGeometry(3, 3), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(g.attributes.position.getX(i) < 0 ? 0.2 : 0.8, i * 3, i * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'paint-body' })), root = new THREE.Group().add(mesh);
  r.scene.add(root);
  const at = (px, x) => { const i = ((S >> 1) * S + x) * 4; return [px[i], px[i + 1], px[i + 2]]; }, L = S >> 2, R = S - (S >> 2);
  r.mc.apply(root, { paint: { body: '#ff0000' } });
  const red = r.shot(), before = r.renderer.info.programs.length;
  r.mc.repaint(root, { body: { hue: { axis: [1, 0, 0], from: -1.5, to: 4.5 } } });
  const hue = r.shot();
  r.mc.repaint(root, { body: null });
  const keep = r.shot();
  for (const c of ['#00ff00', '#0000ff', '#ffff00']) { r.mc.repaint(root, { body: c }); r.shot(); }
  const after = r.renderer.info.programs.length;
  mesh.material = r.mc.get('steel', { vertexColors: true, receiveShadow: false });
  const plain = r.shot();
  const out = { errors: r.errors, before, after, red: [at(red, L), at(red, R)], hue: [at(hue, L), at(hue, R)], keepDiff: diff(keep, plain) };
  r.done();
  return out;
};

// mc.depth on the GPU: windy instanced, fur and extended materials cast shadows through their depth twins with no shader
// errors, and the shadow of a windy blade moves with mc.time.
window.lhDepth = tier => {
  const r = rig(tier), { mc, scene } = r, box = new THREE.BoxGeometry(0.4, 1.2, 0.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mc.get('testBare', { receiveShadow: true }));
  floor.position.z = -0.8; floor.receiveShadow = true; scene.add(floor);
  const windy = mc.get('testBare', { instanced: true, wind: { fade: [0, 0], amp: [1.5, 1.5] } });
  const im = new THREE.InstancedMesh(box, windy, 1); im.castShadow = true; im.customDepthMaterial = mc.depth(windy); scene.add(im);
  const fur = new THREE.Mesh(furGeometry(new THREE.BoxGeometry(0.4, 0.4, 0.4), () => 1), mc.get('testFur'));
  fur.position.x = -1.2; fur.castShadow = true; fur.customDepthMaterial = mc.depth(fur.material); scene.add(fur);
  const snow = mc.extend(mc.get('testBare'), 'snow', (sh, inject, o) => { sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', 'transformed.y += 0.05;'); if (!o.depth) sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= 0.95;'); });
  const sm = new THREE.Mesh(box, snow); sm.position.x = 1.2; sm.castShadow = true; sm.customDepthMaterial = mc.depth(snow); scene.add(sm);
  const t0 = r.shot(); mc.time.value = 0.9; const t1 = r.shot();
  const out = { errors: r.errors, moved: diff(t0, t1) };
  r.done();
  return out;
};
