import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coverageView } from '../../src/kits/coverage/view.js';

const fakeSync = () => { const s = { h: null, match: null, offs: 0, on(match, h) { s.match = match; s.h = h; return () => { s.offs++; }; } }; return s; };
const fakeCompiler = () => { const c = { made: [], coverage(m, o) { const r = { material: m.clone(), uniforms: { uCoverage: o?.uCoverage ?? new THREE.Vector4(), uWet: 'COVERAGE_WET' in m.defines ? new THREE.Vector2(0, 1) : null } }; c.made.push(r); return r; } }; return c; };
const covMat = () => { const m = new THREE.MeshLambertMaterial(); m.defines = { COVERAGE: '' }; return m; };
function model() {
  const g = new THREE.Group(), a = new THREE.Mesh(new THREE.BoxGeometry(), covMat()), b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  const a2 = new THREE.Mesh(new THREE.BoxGeometry(), covMat()), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), covMat(), 2);
  g.add(a, b, a2, inst);
  return { g, a, b, a2, inst, baseA: a.material, baseInst: inst.material };
}
const v4 = u => [u.x, u.y, u.z, u.w];

test('create clones each COVERAGE mesh, sharing one uCoverage per entity, and writes (dirt, rust, snow, mud)', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc), m = model(), e = { id: 3, coverage: { dirt: 0.25, mud: 0.5 } };
  sync.h.create(e, m.g);
  assert.equal(mc.made.length, 2);
  assert.equal(m.a.material, mc.made[0].material); assert.notEqual(m.a.material, m.baseA);
  assert.equal(m.a2.material, mc.made[1].material);
  assert.equal(mc.made[1].uniforms.uCoverage, mc.made[0].uniforms.uCoverage); // one vector per entity
  assert.equal(m.inst.material, m.baseInst);         // instanced meshes use COVERAGE_INSTANCED, written by their owner
  assert.deepEqual(v4(mc.made[0].uniforms.uCoverage), [0.25, 0, 0, 0.5]);
  assert.equal(cv.size, 1);
});

test('each COVERAGE_WET clone gets the wet level in its own uWet.x, on create and every frame', () => {
  const sync = fakeSync(), mc = fakeCompiler(), m = model(), e = { id: 5, coverage: { mud: 0.5, wet: 0.25 } };
  m.a2.material.defines.COVERAGE_WET = '';
  coverageView(sync, mc);
  sync.h.create(e, m.g);
  assert.equal(mc.made[0].uniforms.uWet, null); assert.equal(mc.made[1].uniforms.uWet.x, 0.25);
  e.coverage.wet = 0.75; sync.h.frame(e, m.g, 0.5);
  assert.equal(mc.made[1].uniforms.uWet.x, 0.75); assert.equal(mc.made[1].uniforms.uWet.y, 1, 'the accept stays the material\'s');
});

test('frame rewrites the levels in place, making nothing new', () => {
  const sync = fakeSync(), mc = fakeCompiler(), m = model(), e = { id: 3, coverage: { dirt: 0, snow: 0 } };
  coverageView(sync, mc);
  sync.h.create(e, m.g);
  const u = mc.made[0].uniforms.uCoverage;
  e.coverage.dirt = 0.75; e.coverage.snow = 0.125;
  sync.h.frame(e, m.g, 0.5);
  assert.equal(mc.made[0].uniforms.uCoverage, u); assert.deepEqual(v4(u), [0.75, 0, 0.125, 0]); assert.equal(mc.made.length, 2);
});

test('remove restores the shared material and disposes the clone', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc), m = model(), e = { id: 4, coverage: { dirt: 1 } };
  sync.h.create(e, m.g);
  let disposed = 0; mc.made[0].material.addEventListener('dispose', () => { disposed++; });
  sync.h.remove(e, m.g);
  assert.equal(m.a.material, m.baseA); assert.equal(disposed, 1); assert.equal(cv.size, 0);
});

test('the default match takes entities with coverage; an entity without an object is skipped; off unsubscribes', () => {
  const sync = fakeSync(), mc = fakeCompiler(), cv = coverageView(sync, mc);
  assert.equal(sync.match({ coverage: { dirt: 0 } }), true); assert.equal(sync.match({ id: 1 }), false);
  sync.h.create({ id: 9, coverage: { dirt: 0 } }, undefined);
  sync.h.frame({ id: 9, coverage: { dirt: 0.5 } }, undefined, 0);
  assert.equal(cv.size, 0);
  cv.off(); assert.equal(sync.offs, 1);
});
