// Distance level of detail (A-13–A-18): the LOD_FADE patch and its depth twin, the eye and its LOD scale, the windows, a
// model's levels, and which levels createLodInstances and createScatter put each instance in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib, BoxGeometry, BufferAttribute, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, OrthographicCamera, Vector4 } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { checkRender } from '../src/view/render/pipeline.js';
import { lodLevels, lodWindows, createLodInstances, createScatter } from '../src/view/instancing/lod.js';

const mc = () => createMaterialCompiler(defineMaterials({}));
const compile = (m, lib = ShaderLib.standard) => { const sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };

// A model as the loader gives it: a root with lod0 … lodN, each a box (half-size h) in steel with vertex colours.
function model(halves = [1, 0.8, 0.6], { offset = [0, 0, 0] } = {}) {
  const root = new Group(); root.name = 'tree';
  halves.forEach((h, l) => {
    const lod = new Group(); lod.name = `lod${l}`; root.add(lod);
    const g = new BoxGeometry(2 * h, 2 * h, 2 * h);
    g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.5), 3));
    const m = new Mesh(g, new MeshStandardMaterial()); m.material.name = 'steel'; m.position.set(...offset); m.position.y += h;
    lod.add(m);
  });
  return { scene: root };
}

test('LOD_FADE: lodFade adds the feature and the shared eye; the patch reads lhLod and discards by the dither', () => {
  const c = mc(), m = c.get('steel', { instanced: true, vertexColors: true, lodFade: true });
  assert.ok(m.userData.lh.features.includes('LOD_FADE'));
  assert.notEqual(m, c.get('steel', { instanced: true, vertexColors: true }), 'its own material and program');
  assert.match(m.customProgramCacheKey(), /LOD_FADE/);
  const sh = compile(m);
  assert.equal(sh.uniforms.uLhEye, c.eye, 'one eye for every LOD material');
  assert.match(sh.vertexShader, /attribute vec3 lhLod/); assert.match(sh.vertexShader, /instanceMatrix \* vec4\( 0\.0, 0\.0, 0\.0, 1\.0 \)/);
  assert.match(sh.fragmentShader, /if \( lhLodN >= vLhLodT\.x \|\| lhLodN < vLhLodT\.y \) discard;/);
});

test('LOD_FADE: the depth twin runs the whole patch, fragment discard included, on the same eye', () => {
  const c = mc(), d = c.depth(c.get('steel', { instanced: true, lodFade: true }));
  assert.equal(d.customProgramCacheKey(), 'lhd:LOD_FADE');
  const sh = compile(d, ShaderLib.depth);
  assert.equal(sh.uniforms.uLhEye, c.eye);
  assert.match(sh.vertexShader, /vLhLodT\.x =/); assert.match(sh.fragmentShader, /discard/);
});

test('setEye: position, and the LOD scale bias × tan(fov/2) / tan(refFov/2), zoom included; orthographic 1 / zoom', () => {
  const c = mc(), cam = new PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(3, 4, 5);
  let e = c.setEye(cam);
  assert.deepEqual([e.x, e.y, e.z, e.w], [3, 4, 5, 1]);
  assert.equal(c.lod.refFov, 60, 'the first camera sets the reference');
  cam.fov = 2 * Math.atan(Math.tan(Math.PI / 6) / 4) * 180 / Math.PI; // a 4× scope
  assert.ok(Math.abs(c.setEye(cam).w - 0.25) < 1e-9);
  cam.fov = 60; cam.zoom = 2; assert.ok(Math.abs(c.setEye(cam).w - 0.5) < 1e-9);
  cam.zoom = 1; c.lod.bias = 0.7; assert.ok(Math.abs(c.setEye(cam).w - 0.7) < 1e-9);
  const o = new OrthographicCamera(-1, 1, 1, -1); o.zoom = 4; c.lod.bias = 1;
  assert.equal(c.setEye(o).w, 0.25);
});

test('render.lod is checked: { refFov, bias } only, refFov in (0, 180), bias above 0', () => {
  assert.doesNotThrow(() => checkRender({ lod: { refFov: 50, bias: 0.8 } }));
  assert.throws(() => checkRender({ lod: { bias: 0 } }), /bias must be a number above 0/);
  assert.throws(() => checkRender({ lod: { refFov: 180 } }), /refFov must be degrees/);
  assert.throws(() => checkRender({ lod: { far: 1 } }), /render\.lod\.far is unknown/);
});

test('lodWindows: level k from distances[k-1] to distances[k], widened by the band; bad input throws', () => {
  const w = lodWindows([70, 230, 720], 14);
  assert.deepEqual(w.map(x => [x.in, x.out]), [[0, 70], [70, 230], [230, 720]]);
  assert.equal(w[0].lo, -Infinity); assert.equal(w[1].lo, 70 - 14 - 1); assert.equal(w[2].hi, 720 + 14 + 1);
  assert.throws(() => lodWindows([70, 50], 10), /rising/);
  assert.throws(() => lodWindows([70], -1), /band/);
});

test('lodLevels: one merged geometry per level and material, in the model frame, colours kept; no lod nodes = one level', () => {
  const levels = lodLevels(model([1, 0.5], { offset: [2, 0, 0] }));
  assert.equal(levels.length, 2);
  const g = levels[0][0].geometry; g.computeBoundingBox();
  assert.equal(levels[0][0].name, 'steel');
  assert.ok(Math.abs(g.boundingBox.min.x - 1) < 1e-6 && Math.abs(g.boundingBox.max.y - 2) < 1e-6, 'the mesh offset is baked in');
  assert.ok(g.attributes.color && g.index);
  const plain = new Group(), mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()); mesh.material.name = 'steel'; plain.add(mesh);
  assert.equal(lodLevels(plain).length, 1);
  const empty = new Group(), l0 = new Group(); l0.name = 'lod0'; empty.add(l0);
  assert.throws(() => lodLevels(empty), /level 0 .* has no meshes/);
});

test('createLodInstances: each instance in every level whose window (± band) holds its scaled distance', () => {
  const c = mc(), L = createLodInstances({ asset: model(), distances: [70, 230, 720], band: 14, compiler: c, max: 8 });
  assert.equal(L.levels.length, 3);
  assert.deepEqual(Array.from(L.levels[1][0].mesh.geometry.attributes.lhLod.array.slice(0, 3)), [70, 230, 14]);
  assert.equal(L.levels[0][0].mesh.customDepthMaterial, c.depth(L.levels[0][0].mesh.material));
  assert.ok(L.levels[0][0].mesh.castShadow && !L.levels[1][0].mesh.castShadow, 'lod0 alone casts');
  const q = { x: 0, y: 0, z: 0, w: 1 }, at = d => ({ x: d, y: 0, z: 0 });
  L.begin(new Vector4(0, 0, 0, 1));
  for (const d of [10, 70, 150, 230, 500, 800]) L.add(at(d), q);
  L.commit();
  assert.deepEqual(L.counts(), [2, 3, 2], '10, 70 | 70, 150, 230 | 230, 500 (10 is short of lod1 by more than its band, 800 past 720 + band)');
  L.begin(new Vector4(0, 0, 0, 0.25)); // a 4× scope: 150 m measures 37.5
  for (const d of [150, 500]) L.add(at(d), q);
  L.commit();
  assert.deepEqual(L.counts(), [1, 1, 0]);
  assert.equal(L.levels[0][0].mesh.count, 1);
  L.dispose();
});

// A line of trees along +x every 10 m from x = 5, plus one row behind the camera (x < 0).
const line = () => Array.from({ length: 120 }, (_, i) => ({ p: [i < 100 ? 5 + i * 10 : -200 - (i - 100) * 10, 0, 0] }));
const camAt = (x, { look = 1, fov = 60 } = {}) => { const cam = new PerspectiveCamera(fov, 1.5, 0.1, 5000); cam.position.set(x, 2, 0); cam.lookAt(x + look * 100, 2, 0); cam.updateMatrixWorld(); return cam; };

test('createScatter: cells go into the levels their distance can reach; behind the camera is culled past nearAll', () => {
  const c = mc(), S = createScatter({ asset: model(), items: line(), distances: [70, 230, 720], band: 14, compiler: c, cell: 16, refill: 8 });
  assert.equal(S.update(camAt(0)), true);
  const [n0, n1, n2] = S.stats.counts;
  assert.ok(n0 >= 7 && n0 <= 12, `lod0 ~ the first 70 m and its slack (${n0})`);
  assert.ok(n1 > 15 && n2 > 40, `${n1} ${n2}`);
  assert.ok(n0 + n1 + n2 < 100 + 30, 'the 20 trees behind are culled, few in two levels');
  assert.equal(S.update(camAt(1)), false, 'no refill inside the same 8 m step');
  assert.equal(S.update(camAt(9)), true, 'a new step refills');
  const S2 = createScatter({ asset: model(), items: line(), distances: [70, 230, 720], band: 14, compiler: c, cone: false });
  S2.update(camAt(0));
  assert.ok(S2.stats.counts.reduce((a, b) => a + b) > S.stats.counts.reduce((a, b) => a + b), 'without the cone, the trees behind draw too');
  S.dispose(); S2.dispose();
});

test('createScatter: zooming in (a narrower fov) refills and brings far trees into lod0; turning past half the margin refills', () => {
  const c = mc(), S = createScatter({ asset: model(), items: line(), distances: [70, 230, 720], band: 14, compiler: c });
  S.update(camAt(0));
  const wide = S.stats.counts[0];
  const scope = 2 * Math.atan(Math.tan(Math.PI / 6) / 4) * 180 / Math.PI;
  assert.equal(S.update(camAt(0, { fov: scope })), true);
  assert.ok(S.stats.counts[0] > 3 * wide, `at 4× lod0 reaches ~4× as far (${wide} → ${S.stats.counts[0]})`);
  const cam = camAt(0, { fov: scope }); cam.lookAt(0, 2, 100); cam.updateMatrixWorld(); // turn 90°
  assert.equal(S.update(cam), true);
  assert.ok(S.stats.counts[0] < wide, 'looking away through the scope, the line is out of the cone');
  S.dispose();
});

test('createScatter and createLodInstances: bad input names the problem', () => {
  const c = mc();
  assert.throws(() => createScatter({ asset: model(), items: line(), distances: [70, 230], compiler: c }), /3 level\(s\), so distances needs 3/);
  assert.throws(() => createScatter({ asset: model(), items: line(), distances: [70, 230, 720] }), /compiler/);
  assert.throws(() => createScatter({ asset: model(), items: [], distances: [70, 230, 720], compiler: c }), /items/);
  assert.throws(() => createLodInstances({ asset: model(), distances: [70, 230, 720], compiler: c, max: 0 }), /max/);
  const S = createScatter({ asset: model(), items: line(), distances: [70, 230, 720], compiler: c });
  assert.throws(() => S.update({ x: 0, y: 0, z: 0 }), /render camera/);
});
