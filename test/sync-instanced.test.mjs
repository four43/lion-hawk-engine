import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';
import { threeIds, retained } from './helpers/alloc.mjs';
import { createViewSync } from '../src/view/sync/index.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { defineMaterials } from '../src/defs/materials.js';
import { fakeWorld } from './helpers/fakeWorld.mjs';

const CRATE = { crate: [{ name: 'body', material: 'wood' }, { name: 'lid', material: 'paint-body', p: [0, 0.5, 0] }] };
const at = (mesh, i) => new THREE.Vector3().setFromMatrixPosition((() => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; })());
const near = (v, x, y, z) => v.distanceTo(new THREE.Vector3(x, y, z)) < 1e-6;

test('3g: draw "instanced" joins one InstancedMesh per (model, part), with the part offset and paint as instance colour (§4.9)', () => {
  const s = syncSetup(CRATE), a = s.world.spawn({ model: 'crate', draw: 'instanced', at: [1, 0, 0] });
  s.world.spawn({ model: 'crate', draw: 'instanced', at: [5, 0, 0], paint: { body: '#ff0000' } });
  s.sync.frame(1);
  const [body, lid] = s.sync.root.children;
  assert.deepEqual(s.sync.root.children.map(m => [m.name, m.isInstancedMesh, m.count]), [['crate:body', true, 2], ['crate:lid', true, 2]]);
  assert.equal(s.sync.objectOf(a), undefined);
  assert.ok(near(at(lid, 1), 5, 0.5, 0)); assert.ok(near(at(body, 0), 1, 0, 0));
  assert.deepEqual([...lid.instanceColor.array.slice(3, 6)], [1, 0, 0]); assert.deepEqual([...lid.instanceColor.array.slice(0, 3)], [1, 1, 1]);
  assert.equal(body.instanceColor, null); // no paint slot on the body
  assert.equal(lid.material.userData.instanced, true); assert.equal(lid.material.name, 'steel'); // compiled for instancing
  assert.equal(body.customDepthMaterial?.isMeshDepthMaterial, true); // 3e's instancedShadows ran
  assert.deepEqual(s.log.filter(l => l[0] === 'clone'), []); // never cloned
});
test('3g: despawning the middle instance moves the last one into its slot, matrix and colour (§4.9)', () => {
  const s = syncSetup(CRATE), es = ['#ff0000', '#00ff00', '#0000ff'].map((c, i) => s.world.spawn({ model: 'crate', draw: 'instanced', at: [i * 10, 0, 0], paint: { body: c } }));
  s.sync.frame(1); s.world.despawn(es[1]); s.sync.frame(1);
  const [body, lid] = s.sync.root.children; assert.equal(body.count, 2); assert.equal(lid.count, 2);
  assert.ok(near(at(body, 1), 20, 0, 0)); assert.deepEqual([...lid.instanceColor.array.slice(3, 6)], [0, 0, 1]);
  s.world.move(es[2], [30, 0, 0]); s.sync.frame(1); assert.ok(near(at(body, 1), 30, 0, 0)); // the moved one writes its new slot
  s.world.despawn(es[0]); s.world.despawn(es[2]); s.sync.frame(1); assert.equal(body.count, 0);
});
test('3g: past 16 instances the mesh doubles (the old one disposed), keeping every matrix; a new World disposes them all', () => {
  const s = syncSetup(CRATE); for (let i = 0; i < 10; i++) s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] });
  s.sync.frame(1); const first = s.sync.root.children[0]; let disposed = 0; first.addEventListener('dispose', () => disposed++);
  for (let i = 10; i < 40; i++) s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] });
  s.sync.frame(1);
  const [body] = s.sync.root.children; assert.equal(s.sync.root.children.length, 2); assert.equal(body.count, 40); assert.equal(body.instanceMatrix.count, 64);
  assert.equal(first.parent, null); assert.equal(disposed, 1);
  for (const i of [0, 9, 15, 16, 39]) assert.ok(near(at(body, i), i, 0, 0), `instance ${i}`);
  let gone = 0; for (const m of s.sync.root.children) m.addEventListener('dispose', () => gone++);
  s.world.clear(); s.sync.frame(1); assert.equal(s.sync.root.children.length, 0); assert.equal(gone, 2);
});
test('3g: instanced entities that did not move are not re-uploaded (R1: static props cost nothing per frame)', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' }); s.world.spawn({ model: 'crate', draw: 'instanced', at: [3, 0, 0] });
  s.sync.frame(1); const body = s.sync.root.children[0], v = body.instanceMatrix.version;
  s.sync.frame(0.3); s.sync.frame(0.7); assert.equal(body.instanceMatrix.version, v);
  s.world.move(e, [1, 0, 0]); s.sync.frame(0.5); assert.equal(body.instanceMatrix.version, v + 1); assert.ok(near(at(body, 0), 0.5, 0, 0));
  e.scale = 2; s.world.step(); s.sync.frame(1); s.sync.frame(1); assert.equal(body.instanceMatrix.version, v + 2); // a scale change is written once
});
test('3g: a skinned model cannot be instanced; instanced frames make no three objects and retain nothing (R-8)', () => {
  const k = syncSetup({ pig: [{ name: 'body', material: 'pet', skinned: true }] }); k.world.spawn({ model: 'pig', draw: 'instanced' });
  assert.throws(() => k.sync.frame(1), /sync: model 'pig' is skinned; draw it as 'object' or with createCrowd/);
  const s = syncSetup(CRATE), es = [];
  for (let i = 0; i < 50; i++) es.push(s.world.spawn({ model: 'crate', draw: 'instanced', at: [i, 0, 0] }));
  s.sync.frame(1);
  let t = 0;
  const tick = () => { t++; for (let i = 0; i < es.length; i += 2) es[i].xf.p.y = Math.sin(t + i); s.world.step(); s.sync.frame(0.5); };
  const before = threeIds(), grew = retained(tick, 10000), after = threeIds();
  assert.deepEqual(after, { object: before.object + 1, material: before.material + 1, geometry: before.geometry + 1 });
  assert.ok(grew < 128 * 1024, `retained ${grew} bytes`);
});
test('3g: a coverage material instanced gets instanceCoverage from e.coverage, written only when it changes (3f C6, 3h)', () => {
  const s = syncSetup({ pig: [{ name: 'body', material: 'mud' }, { name: 'hat', material: 'wood' }] });
  const e = s.world.spawn({ model: 'pig', draw: 'instanced', coverage: { dirt: 0.5, mud: 0.25 } }); s.world.spawn({ model: 'pig', draw: 'instanced' });
  s.sync.frame(1);
  const [body, hat] = s.sync.root.children, cov = body.geometry.attributes.instanceCoverage;
  assert.equal(body.material.defines.COVERAGE_INSTANCED, ''); assert.equal(hat.geometry.attributes.instanceCoverage, undefined);
  assert.deepEqual([...cov.array.slice(0, 8)], [0.5, 0, 0, 0.25, 0, 0, 0, 0]);
  const v = cov.version; s.sync.frame(1); assert.equal(cov.version, v); // unchanged: no upload
  e.coverage.snow = 0.75; s.sync.frame(1); assert.equal(cov.version, v + 1); assert.deepEqual([...cov.array.slice(0, 4)], [0.5, 0, 0.75, 0.25]);
  for (let i = 0; i < 20; i++) s.world.spawn({ model: 'pig', draw: 'instanced', coverage: { rust: 1 } });
  s.sync.frame(1); const grown = s.sync.root.children[0].geometry.attributes.instanceCoverage; // past 16: the mesh doubled
  assert.deepEqual([...grown.array.slice(0, 4)], [0.5, 0, 0.75, 0.25]); assert.deepEqual([...grown.array.slice(84, 88)], [0, 1, 0, 0]);
});
test('3g: a still instanced entity that is placed somewhere new is re-uploaded (place writes prev and curr together)', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' });
  s.sync.frame(1); const body = s.sync.root.children[0];
  s.world.place(e, [5, 0, 0]); s.sync.frame(0.5);
  assert.ok(near(at(body, 0), 5, 0, 0), `at ${at(body, 0).toArray()}`);
});
test('3g: an instanced entity that stops is drawn at its final pose, not the last interpolated one', () => {
  const s = syncSetup(CRATE), e = s.world.spawn({ model: 'crate', draw: 'instanced' });
  s.sync.frame(1); const body = s.sync.root.children[0];
  s.world.move(e, [1, 0, 0]); s.sync.frame(0.5); assert.ok(near(at(body, 0), 0.5, 0, 0));
  s.world.step(); s.sync.frame(0.3); // prev == curr == [1, 0, 0] now
  assert.ok(near(at(body, 0), 1, 0, 0), `at ${at(body, 0).toArray()}`);
  const v = body.instanceMatrix.version; s.sync.frame(0.6); assert.equal(body.instanceMatrix.version, v); // and then it is static again
});
test('3g: paint as instance colour works on a template the real compiler already compiled (createAssets does that)', () => {
  const compiler = createMaterialCompiler(defineMaterials({}));
  const tpl = new THREE.Group(), lid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'paint-body' }));
  lid.name = 'lid'; tpl.add(lid); compiler.apply(tpl); // as assets' template(): the paint slot's material is now the paint base
  const assets = { has: () => true, get: () => ({ scene: tpl, clips: [], anim: null, sockets: {} }) };
  const world = fakeWorld(), sync = createViewSync({ world }, { gfx: { scene: new THREE.Scene() }, assets, compiler, view: { dt: 1 / 60 } });
  world.spawn({ model: 'crate', draw: 'instanced', paint: { body: '#ff0000' } });
  sync.frame(1);
  const [mesh] = sync.root.children;
  assert.ok(mesh.instanceColor, 'the painted part has instance colours');
  assert.deepEqual([...mesh.instanceColor.array.slice(0, 3)], [1, 0, 0]);
});
test('3g: an instanced FUR part casts through the compiler\'s depth twin, not the plain instanced depth material', () => {
  const compiler = createMaterialCompiler(defineMaterials({ testFur: { look: { color: '#ffffff', fur: { length: 0.07, shells: 4 } } } }));
  const g = new THREE.BoxGeometry(); g.setAttribute('furShell', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  const tpl = new THREE.Group(), coat = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'testFur' })); coat.name = 'coat'; tpl.add(coat); compiler.apply(tpl);
  const assets = { has: () => true, get: () => ({ scene: tpl, clips: [], anim: null, sockets: {} }) };
  const world = fakeWorld(), sync = createViewSync({ world }, { gfx: { scene: new THREE.Scene() }, assets, compiler, view: { dt: 1 / 60 } });
  world.spawn({ model: 'sheep', draw: 'instanced' }); sync.frame(1);
  const [mesh] = sync.root.children;
  assert.equal(mesh.customDepthMaterial, compiler.depth(mesh.material));
});
