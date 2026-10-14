// mc.depth(material): the shadow-pass twin that moves vertices as the material does (Rally's snow, wind, fur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';

const REG = defineMaterials({
  testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 10, density: 34, tint: '#ffffff' } } },
  testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1 } },
});
const depthCompile = m => { const sh = { vertexShader: ShaderLib.depth.vertexShader, fragmentShader: ShaderLib.depth.fragmentShader, uniforms: {} }; m.onBeforeCompile?.(sh, null); return sh; };

test('depth(): a cached MeshDepthMaterial (RGBA packing) that runs WIND on the same uniforms; one twin per material key', () => {
  const mc = createMaterialCompiler(REG), grass = mc.get('steel', { instanced: true, wind: { fade: [30, 60] } }), d = mc.depth(grass);
  assert.ok(d.isMeshDepthMaterial); assert.equal(d.depthPacking, 3201);
  assert.equal(mc.depth(grass), d, 'cached');
  const sh = depthCompile(d);
  assert.match(sh.vertexShader, /transformed\.x \+= sin\( uLhTime/);
  assert.equal(sh.uniforms.uLhTime, mc.time, 'the shared wind clock');
  assert.equal(d.customProgramCacheKey(), 'lhd:WIND'); assert.equal(d.defines.WIND, '');
  assert.equal(d.userData.lhShared, true);
  const mud = mc.get('testMud'), a = mc.coverage(mud).material;
  assert.equal(mc.depth(a), mc.depth(mud), 'per-entity coverage clones share the base twin');
  assert.doesNotMatch(depthCompile(mc.depth(mud)).vertexShader, /uCoverage/, 'colour-only features stay out of the depth pass');
});
test('depth(): fur displaces in the depth pass; extend() patches run with { depth: true }; foreign materials throw', () => {
  const mc = createMaterialCompiler(REG), fur = mc.get('testFur');
  assert.match(depthCompile(mc.depth(fur)).vertexShader, /transformed \+= \( furNormal \* furLen/);
  const calls = [];
  const snow = mc.extend(mc.get('steel'), 'snow', (sh, inject, o) => {
    calls.push(o.depth);
    sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', 'transformed.y += 0.1; // snow');
    if (o.depth) return;
    sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', 'diffuseColor.rgb = vec3( 1.0 );');
  });
  const d = mc.depth(snow), sh = depthCompile(d);
  assert.match(sh.vertexShader, /\/\/ snow/); assert.deepEqual(calls, [true]);
  assert.equal(d.customProgramCacheKey(), 'lhd:|x:snow');
  assert.throws(() => mc.depth({ name: 'raw' }), /compiler: depth\(\) needs a material from this compiler \(got 'raw'\)/);
  let disposed = 0; d.addEventListener('dispose', () => disposed++); mc.dispose(); assert.equal(disposed, 1);
});
