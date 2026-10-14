// Paint (A-4), per-entity coverage, game extensions, and mc.apply over a model tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, ShaderLib, Texture, Vector4 } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1, mud: 0.5 } },
  testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 10, density: 34, tint: '#ffffff' } } },
  testBare: { look: { color: '#808080' } },
});
const compile = m => { const sh = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };
const named = (name, geo = new BoxGeometry()) => { const m = new Mesh(geo, new MeshStandardMaterial({ name })); m.receiveShadow = true; return m; };

test('paint: one clone per (key, colour), same program, colour set; colours normalise', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('steel');
  const red = mc.paint('steel', '#ff0000'), red2 = mc.paint('steel', '#f00'), green = mc.paint('steel', '#00ff00');
  assert.equal(red, red2); assert.notEqual(red, green); assert.notEqual(red, base);
  assert.ok(red.color.equals(new Color('#ff0000')));
  assert.equal(red.customProgramCacheKey(), base.customProgramCacheKey());
  assert.equal(red.userData.lh.key, `${base.userData.lh.key}|paint:ff0000`);
  const pm = mc.paint('testMud', '#0000ff');
  assert.deepEqual(pm.defines, mc.get('testMud').defines, 'clone() drops defines; the compiler restores them');
  assert.equal(pm.customProgramCacheKey(), 'lh:COVERAGE');
  assert.notEqual(compile(pm).uniforms.uCoverage, compile(mc.get('testMud')).uniforms.uCoverage);
});

test('coverage(): a per-entity clone with its own uCoverage, same program; materials without a coverage block throw', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('testMud');
  const a = mc.coverage(base), b = mc.coverage(base);
  assert.notEqual(a.material, b.material); assert.notEqual(a.uniforms.uCoverage, b.uniforms.uCoverage);
  assert.ok(a.uniforms.uCoverage.isVector4);
  assert.equal(compile(a.material).uniforms.uCoverage.value, a.uniforms.uCoverage, 'the returned vector is the one the shader reads');
  a.uniforms.uCoverage.set(1, 0, 0, 0);
  assert.equal(compile(b.material).uniforms.uCoverage.value.x, 0, 'one entity\'s dirt does not show on another');
  assert.equal(a.material.customProgramCacheKey(), base.customProgramCacheKey());
  assert.equal(a.material.userData.lhShared, false); assert.equal(base.userData.lhShared, true);
  assert.equal(mc.keys().length, 1, 'per-entity clones are not cached');
  const shared = new Vector4(0, 0, 0, 0);
  assert.equal(mc.coverage(base, { uCoverage: shared }).uniforms.uCoverage, shared);
  assert.throws(() => mc.coverage(mc.get('testBare')), /coverage\(\) needs a compiled material whose registry entry has a coverage block \(got 'testBare'\)/);
});

test('coverage() of an instanced material: one shared COVERAGE_INSTANCED variant reading instanceCoverage', () => {
  const mc = createMaterialCompiler(REG), inst = mc.get('testMud', { instanced: true });
  const a = mc.coverage(inst), b = mc.coverage(inst);
  assert.equal(a.material, b.material);
  assert.equal(a.material.defines.COVERAGE_INSTANCED, '');
  assert.equal(a.material.customProgramCacheKey(), 'lh:COVERAGE+COVERAGE_INSTANCED');
  assert.match(compile(a.material).vertexShader, /attribute vec4 instanceCoverage;/);
});

test('extend(): a game patch runs after the engine patches, gets its own program key, and is cached', () => {
  const mc = createMaterialCompiler(REG), base = mc.get('testMud'), seen = [];
  const patch = (sh, inject) => { seen.push(sh.fragmentShader.includes('uCoverageAccept')); sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', '// eyelids'); };
  const x = mc.extend(base, 'eyelids', patch);
  assert.equal(mc.extend(base, 'eyelids', patch), x);
  assert.equal(x.customProgramCacheKey(), 'lh:COVERAGE|x:eyelids');
  assert.match(compile(x).fragmentShader, /\/\/ eyelids/);
  assert.deepEqual(seen, [true]);
  assert.doesNotMatch(compile(base).fragmentShader, /eyelids/);
  const cov = mc.coverage(x);
  assert.match(compile(cov.material).fragmentShader, /\/\/ eyelids/, 'coverage() of an extended material keeps the patch');
  assert.throws(() => mc.extend(cov.material, 'more', patch), /extend\(\) needs a shared material/);
  assert.throws(() => mc.extend(base, 'bad name', patch), /needs a name of \[A-Za-z0-9_-\]/);
});

test('apply(): materials by name, paint slots, unknown names throw', () => {
  const mc = createMaterialCompiler(REG), root = new Group();
  const body = named('testMud'), trim = named('paint-trim'), cab = named('paint-cab');
  root.add(body, trim); trim.add(cab);
  const r = mc.apply(root, { paint: { trim: '#00ff00' } });
  assert.equal(r.uCoverage, null);
  assert.equal(body.material, mc.get('testMud'));
  assert.equal(trim.material, mc.paint('steel', '#00ff00'));
  assert.equal(cab.material, mc.get('steel'), 'a slot without a colour gets the paint base');
  assert.deepEqual(trim.userData.lhMat, ['paint-trim']);
  const bad = new Group().add(named('unobtainium'));
  bad.children[0].name = 'wheel';
  assert.throws(() => mc.apply(bad), /mesh 'wheel' uses material 'unobtainium', which is neither a registry id nor paint-<slot>/);
});

test('apply(): re-apply and clones keep the authored names; instanced users get instanced materials, paint via instanceColor', () => {
  const mc = createMaterialCompiler(REG), root = new Group().add(named('testMud'), named('paint-trim'));
  mc.apply(root, { paint: { trim: '#00ff00' } });
  const copy = root.clone(true);
  mc.apply(copy, { instanced: true, paint: { trim: '#00ff00' } });
  assert.equal(copy.children[0].material, mc.get('testMud', { instanced: true }));
  assert.equal(copy.children[1].material, mc.get('steel', { instanced: true }));
  const im = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ name: 'testMud' }), 4);
  im.receiveShadow = true;
  mc.apply(new Group().add(im));
  assert.equal(im.material.userData.lh.instanced, true, 'an InstancedMesh is instanced without the option');
});

test('apply(): vertex colours, maps, receiveShadow, multi-material meshes and fur geometry pick the right variant', () => {
  const mc = createMaterialCompiler(REG), geo = new BoxGeometry(), map = new Texture();
  geo.setAttribute('color', new BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  const m = new Mesh(geo, [new MeshStandardMaterial({ name: 'testMud', map }), new MeshStandardMaterial({ name: 'steel' })]);
  m.receiveShadow = false;
  mc.apply(new Group().add(m));
  assert.ok(Array.isArray(m.material));
  assert.equal(m.material[0], mc.get('testMud', { vertexColors: true, map, receiveShadow: false }));
  assert.equal(m.material[1], mc.get('steel', { vertexColors: true, receiveShadow: false }));
  const furry = named('testFur', furGeometry(new BoxGeometry(), () => 1)), plain = named('testFur');
  mc.apply(new Group().add(furry, plain));
  assert.equal(furry.material.defines.FUR, ''); assert.equal(plain.material.defines.FUR, undefined);
});

test('apply({ coverage: true }): one vector per call drives every coverage material in the tree', () => {
  const mc = createMaterialCompiler(REG), a = named('testMud'), b = named('testMud'), s = named('testBare');
  const { uCoverage } = mc.apply(new Group().add(a, b, s), { coverage: true });
  assert.ok(uCoverage.isVector4);
  assert.notEqual(a.material, mc.get('testMud'));
  assert.equal(compile(a.material).uniforms.uCoverage.value, uCoverage);
  assert.equal(compile(b.material).uniforms.uCoverage.value, uCoverage);
  assert.equal(s.material, mc.get('testBare'), 'no coverage block: the shared material');
});
