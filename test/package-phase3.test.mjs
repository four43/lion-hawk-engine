// test/package-phase3.test.mjs: the phase 3 public surface by version (overview §3.2, plus extras landed by integrator
// requests), kit export resolution (3h R1), bin, dependencies (3d request 1) and no 3e stub left (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const num = v => { const [a, b, c] = v.split('.').map(Number); return a * 1e6 + b * 1e3 + c; };
const since = v => num(ENGINE_VERSION) >= num(v);
const skip = v => !since(v) && `engine ${ENGINE_VERSION} < ${v}`;

// [version, entry point, names]. Extras requested by plans are added here in the commit that exports them (Procedure R, kind E).
export const SURFACE = [
  ['0.7.4', 'lion-hawk/sim', ['defineMaterials', 'BASE_MATERIALS', 'SIDECAR_VERSION', 'validateSidecar', 'validatePhys']],
  ['0.7.4', 'lion-hawk/view', ['defineMaterials']],
  ['0.7.5', 'lion-hawk/view', ['createRenderer', 'createLightRig', 'warm', 'instancedShadows', 'disposeTree', 'programCount', 'snapshot', 'createTiltShift']],
  ['0.8.0', 'lion-hawk/sim', ['createWorld', 'heightfieldDesc']],
  ['0.8.0', 'lion-hawk/view', ['createWorld']],
  ['0.8.0', 'lion-hawk/test', ['checks']],
  ['0.8.0', 'lion-hawk/bake', ['bake', 'loadConfig']],
  ['0.8.0', 'lion-hawk/build', ['dedupe', 'build']],
  ['0.9.0', 'lion-hawk/view', ['createAssets', 'createMaterialCompiler', 'furGeometry', 'sampleAnimTable', 'blendAnimTable', 'decodeAnimTable']],
  ['0.9.0', 'lion-hawk/view', ['createViewSync', 'createChaseRig', 'createOrbitRig', 'createMountRig', 'makeProject', 'createInstances', 'createCrowd', 'createAudio']],
  ['0.9.0', 'lion-hawk/kits/terrain', ['createTerrain']],
  ['0.9.0', 'lion-hawk/kits/terrain/view', ['createTerrainMesh']],
  ['0.9.0', 'lion-hawk/kits/vehicle', ['createVehicle']],
  ['0.9.0', 'lion-hawk/kits/coverage', ['coverageKit']],
  ['0.9.0', 'lion-hawk/kits/coverage/view', ['coverageView']],
  ['0.9.0', 'lion-hawk/kits/fx/view', ['createParticles', 'createMarks']],
];
for (const [v, spec, names] of SURFACE) {
  test(`${spec} exports ${names.join(', ')} from ${v}`, { skip: skip(v) }, async () => {
    const m = await import(spec);
    for (const n of names) assert.notEqual(m[n], undefined, `${spec} lacks ${n}`);
  });
}
test('checks has its four members (T-10, T-12, T-13, T-14)', { skip: skip('0.8.0') }, async () => {
  const { checks } = await import('lion-hawk/test');
  for (const k of ['determinism', 'simPurity', 'zeroAlloc', 'materials']) assert.equal(typeof checks[k], 'function', k);
});
test('F.body exists from 0.10.0 (N-8, 3i)', { skip: skip('0.10.0') }, async () => {
  const { F } = await import('lion-hawk/sim');
  assert.equal(typeof F.body, 'function');
});
test('lion-hawk/kits/<kit> resolves to the sim half and lion-hawk/kits/<kit>/view to the view half', { skip: skip('0.9.0') }, () => {
  assert.ok(import.meta.resolve('lion-hawk/kits/terrain').endsWith('/src/kits/terrain/sim.js'));
  assert.ok(import.meta.resolve('lion-hawk/kits/terrain/view').endsWith('/src/kits/terrain/view.js'));
  assert.ok(import.meta.resolve('lion-hawk/kits/fx/view').endsWith('/src/kits/fx/view.js'));
});
test('bin: lion-hawk → bin/lion-hawk.js, executable, with a node shebang', { skip: skip('0.8.0') }, () => {
  assert.equal(pkg.bin?.['lion-hawk'], 'bin/lion-hawk.js');
  const f = `${root}bin/lion-hawk.js`;
  assert.ok(existsSync(f));
  assert.ok(statSync(f).mode & 0o111, 'not executable');
  assert.match(readFileSync(f, 'utf8'), /^#!\/usr\/bin\/env node\n/);
});
test('dependencies for bake and build (3d request 1); three and Rapier stay peer + dev', { skip: skip('0.7.3') }, () => {
  for (const d of ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer', 'pngjs', 'esbuild']) {
    assert.ok(pkg.dependencies?.[d], `dependencies lacks ${d}`);
  }
  assert.equal(pkg.devDependencies.esbuild, undefined, 'esbuild moved to dependencies');
  for (const p of ['three', '@dimforge/rapier3d-compat']) {
    assert.equal(pkg.dependencies[p], undefined, `${p} must not be a dependency`);
    assert.ok(pkg.peerDependencies[p] && pkg.devDependencies[p], p);
  }
});
test('the installed Rapier is 0.21.x and three is 0.186.x (R4)', () => {
  const v = p => JSON.parse(readFileSync(`${root}node_modules/${p}/package.json`, 'utf8')).version;
  assert.match(v('@dimforge/rapier3d-compat'), /^0\.21\./);
  assert.match(v('three'), /^0\.186\./);
});
test('no 3e stub is left once its owner has merged (overview §4.6)', { skip: skip('0.9.0') }, () => {
  for (const f of ['src/view/assets/index.js', 'src/view/sync/index.js', 'src/view/audio/index.js', 'src/view/materials/compiler.js']) {
    assert.doesNotMatch(readFileSync(`${root}${f}`, 'utf8'), /STUB \(3e\)/, f);
  }
});
