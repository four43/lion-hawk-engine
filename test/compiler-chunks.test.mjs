// Chunk guard (overview §4.8): every three.js chunk a feature patches exists in every tier's shader, the CHUNKS table is
// exactly what each patch needs, and a missing chunk throws naming it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib, REVISION } from 'three';
import { CHUNKS, inject, patchShader } from '../src/view/materials/chunks.js';

const LIB = { physical: ShaderLib.physical, standard: ShaderLib.standard, lambert: ShaderLib.lambert };
const shader = tier => ({ vertexShader: LIB[tier].vertexShader, fragmentShader: LIB[tier].fragmentShader, uniforms: {} });
// The eight chunks the patches touch (Contract issue C9), pinned here rather than derived from CHUNKS, so dropping a chunk
// from the table cannot also drop it from the walk below.
const ALL = {
  vertex: ['common', 'worldpos_vertex', 'begin_vertex'],
  fragment: ['common', 'color_fragment', 'clipping_planes_fragment', 'opaque_fragment', 'lights_fragment_end', 'normal_fragment_begin'],
};

test(`every patched chunk exists in three r${REVISION} for every tier`, () => {
  assert.equal(REVISION, '186', 'three.js moved: re-check every chunk name in src/view/materials/chunks.js, then update this pin');
  for (const stage of ['vertex', 'fragment'])
    assert.deepEqual([...new Set(Object.values(CHUNKS).flatMap(c => c[stage]))].sort(), [...ALL[stage]].sort(), `CHUNKS ${stage} chunks differ from the guarded list`);
  for (const [tier, lib] of Object.entries(LIB)) for (const stage of ['vertex', 'fragment'])
    for (const c of ALL[stage]) assert.ok(lib[`${stage}Shader`].includes(`#include <${c}>`), `${tier} ${stage} shader lacks <${c}>`);
  for (const [tier, lib] of Object.entries(LIB)) for (const [feature, stages] of Object.entries(CHUNKS)) for (const stage of ['vertex', 'fragment'])
    for (const c of stages[stage]) assert.ok(lib[`${stage}Shader`].includes(`#include <${c}>`), `${tier} ${stage} shader lacks <${c}> (needed by ${feature})`);
});

test('inject throws naming the chunk and the three.js revision', () => {
  assert.throws(() => inject('void main() {}', 'color_fragment', 'x'), new RegExp(`three\\.js r${REVISION} has no '#include <color_fragment>'`));
  assert.equal(inject('a\n#include <common>\nb', 'common', 'X'), 'a\n#include <common>\nX\nb');
  assert.equal(inject('a\n#include <common>\nb', 'common', 'X', 'before'), 'a\nX\n#include <common>\nb');
});

test('CHUNKS lists exactly the chunks each feature patches: removing a listed one throws, removing another does not', () => {
  for (const feature of Object.keys(CHUNKS)) for (const stage of ['vertex', 'fragment']) for (const c of ALL[stage]) {
    const sh = shader('physical'), key = `${stage}Shader`;
    sh[key] = sh[key].replace(`#include <${c}>`, '');
    const listed = CHUNKS[feature][stage].includes(c), run = () => patchShader(sh, [feature]);
    if (listed) assert.throws(run, new RegExp(`<${c}>`), `${feature} patches <${c}> but CHUNKS does not say it throws`);
    else assert.doesNotThrow(run, `${feature} uses <${c}> but CHUNKS.${feature}.${stage} does not list it`);
  }
});

test('each feature declares its uniforms and attributes; patches apply in a fixed order whatever the list order', () => {
  const p = f => patchShader(shader('standard'), f);
  const cov = p(['COVERAGE']);
  assert.match(cov.fragmentShader, /uniform vec4 uCoverage; uniform vec4 uCoverageAccept;/);
  assert.match(cov.vertexShader, /#ifdef COVERAGE_INSTANCED\nattribute vec4 instanceCoverage;/);
  const fur = p(['FUR']);
  assert.match(fur.vertexShader, /attribute vec3 furNormal; attribute float furMask; attribute float furShell; uniform float furLen;/);
  assert.match(fur.fragmentShader, /uniform float furDensity; uniform vec3 furTint;/);
  assert.match(p(['SUBSURFACE']).fragmentShader, /uniform vec3 uSubColor; uniform float uSubStrength;[\s\S]*directionalLights\[ i \]/);
  const sss = p(['SUBSURFACE']).fragmentShader;
  assert.match(sss, /BRDF_Lambert\( uSubColor \* diffuseColor\.rgb \)/, 'energy-scaled like three\'s Lambert (albedo / π), not raw albedo');
  assert.match(sss, /lhRim = pow\( 1\.0 - saturate\( dot\( normal, lhV \) \), 3\.0 \)/, 'a view-dependent rim: translucency shows on edges');
  assert.match(sss, /saturate\( \( lhNL \+ 0\.4 \) \/ 1\.4 \) - saturate\( lhNL \)/, 'wrap only past the terminator: lit faces keep their colour');
  assert.match(p(['WIND']).vertexShader, /uniform float uLhTime; uniform vec2 uWindFade; uniform vec2 uWindAmp;/);
  const a = p(['WIND', 'FUR', 'COVERAGE']), b = p(['COVERAGE', 'FUR', 'WIND']);
  assert.equal(a.vertexShader, b.vertexShader);
  assert.equal(a.fragmentShader, b.fragmentShader);
  assert.equal(p([]).fragmentShader, LIB.standard.fragmentShader);
});
