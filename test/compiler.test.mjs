// M-11..M-13, D5: tiers, look → parameters, vertex colours, the cache key (matSplit), defines and program keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, DoubleSide, Mesh, MeshStandardMaterial, ShaderLib, Texture } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { furGeometry } from '../src/view/materials/fur.js';

const REG = defineMaterials({
  testMud: { look: { color: '#ff0000', metalness: 0.2, roughness: 0.7, clearcoat: 0.5, side: 'double' }, coverage: { dirt: 1, mud: 0.5 } },
  testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 10, density: 34, tint: '#ffeecc' } } },
  testWax: { look: { color: '#ffffff', subsurface: { color: '#ff8866', strength: 0.6 } } },
  testWaxOff: { look: { color: '#ffffff', subsurface: { color: '#ff8866', strength: 0 } } },
  testBare: { look: { color: '#808080' } },
  testCoat: { look: { color: '#ffffff', fur: { length: 0.05 } }, coverage: { mud: 1, wet: 0.75 } },
});
const LIB = { physical: ShaderLib.physical, standard: ShaderLib.standard, lambert: ShaderLib.lambert };
const compile = (m, tier) => { const sh = { vertexShader: LIB[tier].vertexShader, fragmentShader: LIB[tier].fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };

test('one base class per tier (D5); a bad tier, registry or paint base throws', () => {
  assert.ok(createMaterialCompiler(REG).get('testMud').isMeshPhysicalMaterial, 'physical is the default');
  assert.ok(createMaterialCompiler(REG, { shading: 'standard' }).get('testMud').isMeshStandardMaterial);
  assert.ok(createMaterialCompiler(REG, { shading: 'lambert' }).get('testMud').isMeshLambertMaterial);
  assert.throws(() => createMaterialCompiler(REG, { shading: 'toon' }), /shading must be 'physical' \| 'standard' \| 'lambert' \(got "toon"\)/);
  assert.throws(() => createMaterialCompiler({}), /needs a material registry/);
  assert.ok(createMaterialCompiler(undefined).get('steel').isMeshPhysicalMaterial, 'no registry: the base library');
  assert.throws(() => createMaterialCompiler(REG, { paint: { base: 'unobtainium' } }), /paint base 'unobtainium' is not in the registry/);
  assert.throws(() => createMaterialCompiler(REG).get('nope'), /unknown material 'nope'/);
});

test('look maps onto the class; fields the tier lacks are dropped', () => {
  const p = createMaterialCompiler(REG).get('testMud'), s = createMaterialCompiler(REG, { shading: 'standard' }).get('testMud');
  const l = createMaterialCompiler(REG, { shading: 'lambert' }).get('testMud');
  assert.ok(p.color.equals(new Color('#ff0000')));
  assert.equal(p.metalness, 0.2); assert.equal(p.roughness, 0.7); assert.equal(p.clearcoat, 0.5); assert.equal(p.side, DoubleSide);
  assert.equal(s.roughness, 0.7); assert.equal('clearcoat' in s, false, 'standard has no clearcoat');
  assert.equal(l.metalness, undefined); assert.equal(l.side, DoubleSide); assert.ok(l.color.equals(new Color('#ff0000')));
  assert.equal(p.name, 'testMud');
});

test('vertex colours replace look.color (D5); a map is kept', () => {
  const mc = createMaterialCompiler(REG), map = new Texture();
  const v = mc.get('testMud', { vertexColors: true });
  assert.equal(v.vertexColors, true); assert.ok(v.color.equals(new Color(1, 1, 1)));
  assert.equal(mc.get('testMud').vertexColors, false);
  assert.equal(mc.get('testMud', { map }).map, map);
});

test('cache: same options share one material; each user kind gets its own (M-13 matSplit, always on)', () => {
  const mc = createMaterialCompiler(REG), a = mc.get('testMud');
  assert.equal(mc.get('testMud', {}), a);
  assert.equal(mc.get('testMud', { receiveShadow: true, instanced: false }), a, 'defaults: receiveShadow true, plain');
  const kinds = [{ instanced: true }, { skinned: true }, { receiveShadow: false }, { vertexColors: true }, { map: new Texture() }];
  const ms = kinds.map(k => mc.get('testMud', k));
  assert.equal(new Set([a, ...ms]).size, 6);
  assert.equal(a.userData.lh.key, 'testMud|physical|0|0|0|1||COVERAGE');
  assert.equal(ms[0].userData.lh.key, 'testMud|physical|1|0|0|1||COVERAGE');
  assert.equal(ms[0].userData.lh.instanced, true);
  assert.deepEqual(mc.keys(), [a, ...ms].map(m => m.userData.lh.key));
  assert.deepEqual(mc.made().map(x => x.material), [a, ...ms]);
  assert.deepEqual(mc.made().map(x => x.use), ['plain', 'instanced', 'skinned', 'plain', 'plain', 'plain']);
  assert.equal(a.userData.lhShared, true);
});

test('subsurface at strength 0 compiles no SUBSURFACE program (a game turning it off pays nothing)', () => {
  for (const tier of ['physical', 'standard']) {
    const off = createMaterialCompiler(REG, { shading: tier }).get('testWaxOff');
    assert.equal(off.defines.SUBSURFACE, undefined, tier);
    assert.doesNotMatch(off.customProgramCacheKey(), /SUBSURFACE/, tier);
  }
});
test('defines and program keys follow the material (M-11); SUBSURFACE is dropped for lambert', () => {
  for (const tier of ['physical', 'standard', 'lambert']) {
    const mc = createMaterialCompiler(REG, { shading: tier });
    const mud = mc.get('testMud'), fur = mc.get('testFur'), wax = mc.get('testWax'), bare = mc.get('testBare');
    assert.equal(mud.defines.COVERAGE, ''); assert.equal(mud.customProgramCacheKey(), 'lh:COVERAGE');
    assert.equal(fur.defines.FUR, ''); assert.equal(fur.customProgramCacheKey(), 'lh:FUR');
    assert.equal(mc.get('testFur', { fur: false }).defines.FUR, undefined, 'fur: false (no shells in the geometry) drops FUR');
    if (tier === 'lambert') { assert.equal(wax.defines.SUBSURFACE, undefined); assert.doesNotMatch(wax.customProgramCacheKey(), /^lh:/); }
    else { assert.equal(wax.defines.SUBSURFACE, ''); assert.equal(wax.customProgramCacheKey(), 'lh:SUBSURFACE'); }
    assert.doesNotMatch(bare.customProgramCacheKey(), /^lh:/, 'no features: three.js default program key');
    if (tier === 'physical') assert.equal(mud.defines.PHYSICAL, '', 'the class defines survive');
  }
});

test('onBeforeCompile hands the material its own uniform objects, with the registry values', () => {
  const mc = createMaterialCompiler(REG), mud = compile(mc.get('testMud'), 'physical');
  assert.deepEqual(mud.uniforms.uCoverageAccept.value.toArray(), [1, 0, 0, 0.5]);
  assert.deepEqual(mud.uniforms.uCoverage.value.toArray(), [0, 0, 0, 0]);
  assert.match(mud.fragmentShader, /uniform vec4 uCoverage;/);
  const fur = compile(mc.get('testFur'), 'physical');
  assert.equal(fur.uniforms.furLen.value, 0.07); assert.equal(fur.uniforms.furDensity.value, 34);
  assert.ok(fur.uniforms.furTint.value.equals(new Color('#ffeecc')));
  const wax = compile(mc.get('testWax'), 'physical');
  assert.ok(wax.uniforms.uSubColor.value.equals(new Color('#ff8866'))); assert.equal(wax.uniforms.uSubStrength.value, 0.6);
  assert.notEqual(compile(mc.get('testMud', { instanced: true }), 'physical').uniforms.uCoverage, mud.uniforms.uCoverage, 'per material, not per program');
});

test('coverage.wet adds COVERAGE_WET: uWet (level, accept) per material, coverage() hands it out, fur mats by mud and wet', () => {
  for (const tier of ['physical', 'standard', 'lambert']) {
    const mc = createMaterialCompiler(REG, { shading: tier }), coat = mc.get('testCoat');
    assert.equal(coat.defines.COVERAGE_WET, ''); assert.equal(coat.customProgramCacheKey(), 'lh:COVERAGE+COVERAGE_WET+FUR');
    assert.equal(mc.get('testMud').defines.COVERAGE_WET, undefined, 'no wet in the block: no wet level');
    const sh = compile(coat, tier);
    assert.deepEqual(sh.uniforms.uWet.value.toArray(), [0, 0.75]);
    assert.match(sh.fragmentShader, /reflectedLight\.direct(Diffuse|Specular) \+= lhGl/, 'a gloss highlight in every tier');
    assert.match(sh.vertexShader, /float lhFurMask = furMask \* \( 1\.0 - 0\.9 \* lhMat \)/);
    const a = mc.coverage(coat), b = mc.coverage(coat);
    assert.notEqual(a.uniforms.uWet, b.uniforms.uWet, 'a per-entity clone has its own wet level');
    assert.equal(compile(a.material, tier).uniforms.uWet.value, a.uniforms.uWet);
    const inst = mc.coverage(mc.get('testCoat', { instanced: true }));
    assert.equal(inst.material.customProgramCacheKey(), 'lh:COVERAGE+COVERAGE_INSTANCED+COVERAGE_WET+FUR');
    assert.match(compile(inst.material, tier).vertexShader, /attribute float instanceWet;/);
    assert.equal(mc.coverage(mc.get('testMud')).uniforms.uWet, null);
    const { uWet } = mc.apply(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: 'testCoat' })), { coverage: true });
    assert.equal(uWet.length, 1); assert.deepEqual(uWet[0].toArray(), [0, 0.75]);
  }
});

test('wind: one shared clock (mc.time), fade and amplitude in the key', () => {
  const mc = createMaterialCompiler(REG, { shading: 'standard' });
  const a = mc.get('testBare', { instanced: true, wind: { fade: [30, 60] } }), b = mc.get('testBare', { instanced: true, wind: { fade: [20, 40], amp: [0.2, 0.1] } });
  assert.notEqual(a, b);
  assert.equal(a.userData.lh.key, 'testBare|standard|1|0|0|1||WIND|wind:30,60:0.12,0.08');
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey(), 'one program');
  const sa = compile(a, 'standard'), sb = compile(b, 'standard');
  assert.equal(sa.uniforms.uLhTime, mc.time); assert.equal(sb.uniforms.uLhTime, mc.time);
  assert.deepEqual(sb.uniforms.uWindAmp.value.toArray(), [0.2, 0.1]);
});

test('dispose disposes every cached material and empties the cache', () => {
  const mc = createMaterialCompiler(REG), m = mc.get('testMud');
  let n = 0; m.addEventListener('dispose', () => n++);
  mc.dispose();
  assert.equal(n, 1); assert.deepEqual(mc.keys(), []);
  assert.notEqual(mc.get('testMud'), m);
});

test('mc.furGeometry is furGeometry', () => {
  const mc = createMaterialCompiler(REG), box = new BoxGeometry();
  assert.deepEqual(mc.furGeometry(box, () => 1, { shells: 3 }).attributes.furShell.array, furGeometry(box, () => 1, { shells: 3 }).attributes.furShell.array);
});
