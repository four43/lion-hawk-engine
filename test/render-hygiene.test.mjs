// GPU hygiene (M-12, S-3; Tractor Pickup render/{warm,shadows,dispose}.js): warm compiles hidden objects and given materials;
// instanced casters get their own depth material; disposeTree frees each resource once and keeps shared ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warm, instancedShadows, disposeTree, programCount, INSTANCED_DEPTH } from '../src/view/render/hygiene.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const counter = () => {
  const hits = new Map();
  const watch = (r, name) => { r.addEventListener('dispose', () => hits.set(name, (hits.get(name) ?? 0) + 1)); return r; };
  return { hits, watch };
};

test('instancedShadows gives instanced casters the shared instanced depth material, and nothing else', () => {
  const geo = new THREE.BoxGeometry(), mat = new THREE.MeshLambertMaterial(), root = new THREE.Group();
  const cast = new THREE.InstancedMesh(geo, mat, 4); cast.castShadow = true;
  const quiet = new THREE.InstancedMesh(geo, mat, 4);
  const plain = new THREE.Mesh(geo, mat); plain.castShadow = true;
  root.add(cast, quiet, plain);
  assert.ok(instancedShadows(root) === root);
  assert.ok(cast.customDepthMaterial === INSTANCED_DEPTH, 'the instanced caster');
  assert.ok(quiet.customDepthMaterial === undefined && plain.customDepthMaterial === undefined, 'no custom depth material');
  assert.equal(INSTANCED_DEPTH.isMeshDepthMaterial, true); assert.equal(INSTANCED_DEPTH.userData.lhShared, true);
});
test('disposeTree frees each geometry, material and texture once, and keeps what is shared', () => {
  const { hits, watch } = counter();
  const geo = watch(new THREE.BoxGeometry(), 'geo'), sharedGeo = watch(new THREE.BoxGeometry(), 'sharedGeo'); sharedGeo.userData.lhShared = true;
  const map = watch(new THREE.Texture(), 'map'), extra = watch(new THREE.Texture(), 'extra'), uni = watch(new THREE.Texture(), 'uni'), keptMap = watch(new THREE.Texture(), 'keptMap');
  const mat = watch(new THREE.MeshLambertMaterial({ map }), 'mat'); mat.userData.textures = [extra];
  const shader = watch(new THREE.ShaderMaterial({ uniforms: { tex: { value: uni } } }), 'shader');
  const keptMat = watch(new THREE.MeshLambertMaterial({ map: keptMap }), 'keptMat');
  const inst = new THREE.InstancedMesh(geo, mat, 2); inst.castShadow = true; instancedShadows(inst);
  const depthHits = []; const onDepth = () => depthHits.push(1); INSTANCED_DEPTH.addEventListener('dispose', onDepth);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, [mat, shader]), new THREE.Mesh(sharedGeo, keptMat), inst);
  try {
    const n = disposeTree(root, { keepShared: new Set([keptMat]) });
    assert.deepEqual(Object.fromEntries(hits), { geo: 1, map: 1, extra: 1, mat: 1, uni: 1, shader: 1 });
    assert.equal(n, 6); assert.equal(depthHits.length, 0, 'the shared instanced depth material survives');
  } finally { INSTANCED_DEPTH.removeEventListener('dispose', onDepth); }
});
test('keepShared may be a predicate', () => {
  const { hits, watch } = counter(), g = new THREE.BufferGeometry(); g.userData.lhShared = true;
  const a = watch(new THREE.MeshBasicMaterial(), 'a'), b = watch(new THREE.MeshBasicMaterial(), 'b'), root = new THREE.Group();
  root.add(new THREE.Mesh(g, a), new THREE.Mesh(g, b));
  assert.equal(disposeTree(root, { keepShared: r => r === a }), 1); assert.deepEqual(Object.fromEntries(hits), { b: 1 });
});
test('warm compiles hidden objects too, then hides them again before any frame (Tractor warmShaders)', async () => {
  const r = fakeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const shown = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()), hat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const holder = new THREE.Group(); holder.visible = false; hat.visible = false; holder.add(hat); scene.add(shown, holder);
  const p = warm(r, scene, cam);
  const [, seen] = r.log.find(l => l[0] === 'compileAsync');
  assert.ok(seen.includes(shown) && seen.includes(hat), 'the hidden hat was visible while compiling');
  assert.equal(holder.visible, false); assert.equal(hat.visible, false);
  assert.equal(await p, undefined);
});
test('warm adds one mesh per given material, of the kind userData.lhUse names, on a group it removes', async () => {
  const r = fakeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const mats = ['mesh', 'instanced', 'instancedColor', 'skinned', 'plain'].map(k => { const m = new THREE.MeshLambertMaterial(); m.userData.lhUse = k; return m; });
  mats.push(new THREE.MeshLambertMaterial()); // untagged: a plain mesh
  await warm(r, scene, cam, { materials: mats });
  const [, seen] = r.log.find(l => l[0] === 'compileAsync'), by = m => seen.find(o => o.material === m);
  assert.ok(by(mats[0]) && !by(mats[0]).isInstancedMesh && !by(mats[0]).isSkinnedMesh, 'mesh');
  assert.ok(by(mats[1]).isInstancedMesh && by(mats[1]).instanceColor === null, 'instanced');
  assert.ok(by(mats[2]).isInstancedMesh && by(mats[2]).instanceColor !== null, 'instancedColor');
  assert.ok(by(mats[3]).isSkinnedMesh, 'skinned');
  assert.ok(by(mats[4]) && !by(mats[4]).isInstancedMesh && !by(mats[4]).isSkinnedMesh, 'plain (3f C5)');
  assert.ok(by(mats[5]) && !by(mats[5]).isInstancedMesh, 'untagged');
  assert.equal(scene.children.length, 0, 'the warm group is gone');
});
test('warm rejects (never throws) on an unknown lhUse or a failing compile, restores hidden objects, and falls back to compile()', async () => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(), odd = new THREE.MeshBasicMaterial(); odd.name = 'odd'; odd.userData.lhUse = 'points';
  await assert.rejects(warm(fakeRenderer(), scene, cam, { materials: [odd] }), /warm: material 'odd' has userData\.lhUse 'points'/);
  const bad = fakeRenderer(); bad.compileAsync = () => { throw new Error('ANGLE'); };
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hidden.visible = false; scene.add(hidden);
  await assert.rejects(warm(bad, scene, cam), /ANGLE/); assert.equal(hidden.visible, false, 'hidden again after a throw');
  const old = fakeRenderer(); delete old.compileAsync; await warm(old, scene, cam); assert.equal(old.log[0][0], 'compile');
  assert.equal(scene.children.length, 1);
});
test('programCount reads renderer.info.programs', () => {
  assert.equal(programCount(fakeRenderer({ programs: 7 })), 7); assert.equal(programCount({ info: {} }), 0);
});
test('keepShared: true is the lhShared rule only (3g/3k/3l call it that way); other values throw by name', () => {
  const { hits, watch } = counter(), g = new THREE.BufferGeometry(); g.userData.lhShared = true;
  const a = watch(new THREE.MeshBasicMaterial(), 'a'); a.userData.lhShared = true;
  const b = watch(new THREE.MeshBasicMaterial(), 'b'), root = new THREE.Group();
  root.add(new THREE.Mesh(g, a), new THREE.Mesh(g, b));
  assert.equal(disposeTree(root, { keepShared: true }), 1); assert.deepEqual(Object.fromEntries(hits), { b: 1 });
  assert.throws(() => disposeTree(new THREE.Group(), { keepShared: 1 }), /disposeTree: keepShared must be true, a Set or a predicate \(got 1\)/);
});
test('warm leaves hidden lights hidden: a light count the frame will not have compiles the wrong programs', async () => {
  const r = fakeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const lamp = new THREE.PointLight(), hat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  lamp.visible = false; hat.visible = false; scene.add(lamp, hat);
  let lampSeen = null, hatSeen = null;
  r.compileAsync = s => { lampSeen = lamp.visible; hatSeen = hat.visible; return Promise.resolve(s); };
  await warm(r, scene, cam);
  assert.ok(lampSeen === false, 'the hidden light stayed hidden during compile'); assert.ok(hatSeen === true, 'the hidden mesh was shown');
  assert.ok(lamp.visible === false && hat.visible === false, 'both hidden again');
});
