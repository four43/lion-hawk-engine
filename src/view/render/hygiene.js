// lion-hawk/view GPU hygiene (M-12, S-3, design §6.6), from Tractor Pickup src/render/{warm,shadows,dispose}.js, generalised.
// matSplit (M-13) is the material compiler's cache key (3f), not a helper here.
import * as THREE from 'three';

// X-4 (Tractor review 3): three.js draws every shadow caster with one shared depth material. Instanced and plain casters
// take turns in the shadow pass, so that material keeps switching programs: garbage every frame and a GC pause on an
// iPad. Instanced casters get a depth material of their own, so neither ever changes kind.
export const INSTANCED_DEPTH = new THREE.MeshDepthMaterial();
INSTANCED_DEPTH.name = 'lh.instancedDepth'; INSTANCED_DEPTH.userData.lhShared = true;

export function instancedShadows(root) {
  root.traverse(o => { if (o.isInstancedMesh && o.castShadow) o.customDepthMaterial = INSTANCED_DEPTH; });
  return root;
}

const WARM_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01); WARM_GEO.userData.lhShared = true; // compile never uploads it
const WHITE = new THREE.Color(1, 1, 1);
export const WARM_USES = Object.freeze(['plain', 'mesh', 'instanced', 'instancedColor', 'skinned']); // 'plain' is 3f's name for 'mesh'
function warmMesh(m) { // the kind of object decides the program (USE_INSTANCING, USE_INSTANCING_COLOR, USE_SKINNING)
  const use = m.userData?.lhUse ?? 'mesh';
  if (use === 'mesh' || use === 'plain') return new THREE.Mesh(WARM_GEO, m);
  if (use === 'instanced' || use === 'instancedColor') { const im = new THREE.InstancedMesh(WARM_GEO, m, 1); if (use === 'instancedColor') im.setColorAt(0, WHITE); return im; }
  if (use === 'skinned') { const sm = new THREE.SkinnedMesh(WARM_GEO, m), bone = new THREE.Bone(); sm.add(bone); sm.bind(new THREE.Skeleton([bone])); return sm; }
  throw new Error(`warm: material '${m.name}' has userData.lhUse '${use}' (known: ${WARM_USES.join(', ')})`);
}

// B-2 (Tractor X-4): compile every program while loading, not the first time a mesh comes into view. An iPad compile
// through ANGLE to Metal takes 50-400 ms. three.js compiles only visible objects, so hidden ones are shown for the
// synchronous part of compileAsync and hidden again before any frame draws. Materials not in the scene yet (the compiler's)
// go on a warm group for that moment.
export function warm(renderer, scene, camera, { materials = [] } = {}) {
  const hidden = [];
  let group = null, done;
  try {
    for (const m of materials) { group ??= new THREE.Group(); group.add(warmMesh(m)); }
    if (group) { group.name = 'lh.warm'; scene.add(group); }
    scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    done = renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera);
  } catch (err) {
    done = Promise.reject(err);
  } finally {
    for (const o of hidden) o.visible = false;
    if (group) { scene.remove(group); for (const c of group.children) { if (c.isInstancedMesh) c.dispose(); else if (c.isSkinnedMesh) c.skeleton.dispose(); } }
  }
  return Promise.resolve(done).then(() => undefined);
}

// Free what a tree owns on the GPU: geometries, materials, the textures they hold (maps, ShaderMaterial uniforms, and
// material.userData.textures for textures only a patched shader reads), instanced attributes and skeletons. Each resource
// is freed once. Kept: anything with userData.lhShared (asset geometries, compiler materials, INSTANCED_DEPTH) and anything
// keepShared names (a Set or a predicate); a kept material keeps its textures.
export function disposeTree(root, { keepShared } = {}) {
  const keep = keepShared == null ? null : typeof keepShared === 'function' ? keepShared : r => keepShared.has(r);
  const seen = new Set();
  let n = 0;
  const kept = r => r.userData?.lhShared === true || (keep !== null && keep(r) === true);
  const free = r => { if (!r || seen.has(r)) return; seen.add(r); if (kept(r)) return; r.dispose(); n++; };
  const material = m => {
    if (!m || seen.has(m)) return; seen.add(m);
    if (kept(m)) return;
    for (const k of Object.keys(m)) { const v = m[k]; if (v?.isTexture) free(v); }
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) free(u.value);
    for (const t of m.userData?.textures ?? []) free(t);
    m.dispose(); n++;
  };
  root.traverse(o => {
    free(o.geometry);
    if (Array.isArray(o.material)) for (const m of o.material) material(m); else material(o.material);
    material(o.customDepthMaterial); material(o.customDistanceMaterial);
    if (o.isInstancedMesh) o.dispose();
    if (o.isSkinnedMesh && o.skeleton) free(o.skeleton);
  });
  return n;
}

export function programCount(renderer) { return renderer.info?.programs?.length ?? 0; }
