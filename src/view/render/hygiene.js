// lion-hawk/view GPU hygiene (M-12, S-3, design §6.6): warm-up, shared shadow depth materials and disposal.
// matSplit (M-13) is the material compiler's cache key (3f), not a helper here.
import * as THREE from 'three';

// X-4: three.js draws every shadow caster with one shared depth material. Instanced and plain casters
// take turns in the shadow pass, so that material keeps switching programs: garbage every frame and a GC pause on an
// iPad. Instanced casters get a depth material of their own, so neither ever changes kind. A caster that already has one
// (the compiler's FUR or WIND depth twin) keeps it.
export const INSTANCED_DEPTH = new THREE.MeshDepthMaterial();
INSTANCED_DEPTH.name = 'lh.instancedDepth'; INSTANCED_DEPTH.userData.lhShared = true;

export function instancedShadows(root) {
  root.traverse(o => { if (o.isInstancedMesh && o.castShadow && !o.customDepthMaterial) o.customDepthMaterial = INSTANCED_DEPTH; });
  return root;
}

const WARM_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01); WARM_GEO.userData.lhShared = true; // compile never uploads it
const WHITE = new THREE.Color(1, 1, 1);
export const WARM_USES = Object.freeze(['plain', 'mesh', 'instanced', 'instancedColor', 'skinned']); // 'plain' is 3f's name for 'mesh'
function warmMesh(m, use = m.userData?.lhUse ?? 'mesh') { // the kind of object decides the program (USE_INSTANCING, USE_INSTANCING_COLOR, USE_SKINNING)
  if (use === 'mesh' || use === 'plain') return new THREE.Mesh(WARM_GEO, m);
  if (use === 'instanced' || use === 'instancedColor') { const im = new THREE.InstancedMesh(WARM_GEO, m, 1); if (use === 'instancedColor') im.setColorAt(0, WHITE); return im; }
  if (use === 'skinned') { const sm = new THREE.SkinnedMesh(WARM_GEO, m), bone = new THREE.Bone(); sm.add(bone); sm.bind(new THREE.Skeleton([bone])); return sm; }
  throw new Error(`warm: material '${m.name}' has userData.lhUse '${use}' (known: ${WARM_USES.join(', ')})`);
}

// The shadow pass draws casters with three's own MeshDepthMaterial (or a caster's customDepthMaterial) into a render target,
// with no fog, and sets the depth material's side from the caster's (WebGLShadowMap getDepthMaterial). Its programs have keys
// of their own; warm compiles each the same way. DEPTH has the parameters of three's own depth material.
const DEPTH = new THREE.MeshDepthMaterial(); DEPTH.name = 'lh.warmDepth'; DEPTH.userData.lhShared = true;
let WARM_RT = null; // 1×1: compiling with any render target bound gives the shadow pass's keys
const FLIP = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const kindOf = o => o.isInstancedMesh ? (o.instanceColor ? 'instancedColor' : 'instanced') : o.isSkinnedMesh ? 'skinned' : 'mesh';
// every (depth material, mesh kind, side) the shadow pass may draw. src: the caster's own material, which sets the side
function depthEntries(renderer, scene, materials, depth) {
  const vsm = renderer.shadowMap.type === THREE.VSMShadowMap, out = new Map();
  const add = (m, use, src) => {
    const side = src.shadowSide ?? (vsm ? src.side : FLIP[src.side ?? THREE.FrontSide]), u = use === 'plain' ? 'mesh' : use, k = `${m.uuid}|${u}|${side}`;
    if (!out.has(k)) out.set(k, { material: m, use: u, side });
  };
  scene.traverse(o => { if (o.isMesh && o.castShadow) for (const src of [o.material].flat()) add(o.customDepthMaterial ?? DEPTH, kindOf(o), src); });
  for (const { material, use } of materials) add(DEPTH, use, material); // a compiled material's users may cast (INSTANCED_DEPTH shares DEPTH's program)
  for (const { material, use, side } of depth) add(material, use, { shadowSide: null, side }); // the compiler's FUR / WIND twins (mc.twins())
  return [...out.values()];
}
const disposeWarm = list => { for (const c of list) { if (c.isInstancedMesh) c.dispose(); else if (c.isSkinnedMesh) c.skeleton.dispose(); } };

// B-2 (X-4): compile every program while loading, not the first time a mesh comes into view. An iPad compile
// through ANGLE to Metal takes 50-400 ms. three.js compiles only visible objects, so hidden ones are shown for the
// synchronous part of compileAsync and hidden again before any frame draws. Hidden lights stay hidden: a light count the
// frame will not have compiles the wrong program variants. Materials not in the scene yet (the compiler's)
// go on a warm group for that moment; each is a Material (its userData.lhUse picks the mesh kind) or { material, use }. With shadows on, the shadow pass's depth programs are compiled too (see depthEntries;
// depth: [{ material, use }] adds depth twins).
export function warm(renderer, scene, camera, { materials: given = [], depth = [] } = {}) {
  const hidden = [], materials = given.map(e => e?.isMaterial ? { material: e, use: e.userData?.lhUse ?? 'mesh' } : e); // Material or { material, use }
  let group = null, shadows = null, done;
  try {
    for (const { material, use } of materials) { group ??= new THREE.Group(); group.add(warmMesh(material, use)); }
    if (group) { group.name = 'lh.warm'; scene.add(group); }
    scene.traverse(o => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
    const compile = (s, t) => renderer.compileAsync ? renderer.compileAsync(s, camera, t) : renderer.compile(s, camera, t);
    const main = compile(scene);
    const passes = [main];
    if (renderer.shadowMap?.enabled && renderer.setRenderTarget) {
      if (group) scene.remove(group); // its meshes are not casters
      const prev = renderer.getRenderTarget(), fog = scene.fog; shadows = [];
      renderer.setRenderTarget(WARM_RT ??= new THREE.WebGLRenderTarget(1, 1)); scene.fog = null;
      try { // one compile per entry: the program is chosen synchronously, with the side set for that entry
        for (const e of depthEntries(renderer, scene, materials, depth)) {
          const side = e.material.side, mesh = warmMesh(e.material, e.use); shadows.push(mesh);
          e.material.side = e.side;
          try { passes.push(compile(mesh, scene)); } finally { e.material.side = side; }
        }
      } finally { renderer.setRenderTarget(prev); scene.fog = fog; }
    }
    done = Promise.all(passes);
  } catch (err) {
    done = Promise.reject(err);
  } finally {
    for (const o of hidden) o.visible = false;
    if (group) { scene.remove(group); disposeWarm(group.children); }
    if (shadows) disposeWarm(shadows);
  }
  return Promise.resolve(done).then(() => undefined);
}

// Free what a tree owns on the GPU: geometries, materials, the textures they hold (maps, ShaderMaterial uniforms, and
// material.userData.textures for textures only a patched shader reads), instanced attributes and skeletons. Each resource
// is freed once. Kept: anything with userData.lhShared (asset geometries, compiler materials, INSTANCED_DEPTH) and anything
// keepShared names: true (or null/undefined) means the lhShared rule only, a function is a predicate, an object with .has
// is a Set; anything else throws. A kept material keeps its textures.
export function disposeTree(root, { keepShared } = {}) {
  let keep = null;
  if (typeof keepShared === 'function') keep = keepShared;
  else if (keepShared != null && keepShared !== true) {
    if (typeof keepShared.has !== 'function') throw new Error(`disposeTree: keepShared must be true, a Set or a predicate (got ${typeof keepShared === 'object' ? 'an object without .has' : String(keepShared)})`);
    keep = r => keepShared.has(r);
  }
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
