// Runtime GLB loading (A-9): one GLTFLoader per page, with the meshopt decoder. KTX2 and Draco are optional: the game
// passes configured KTX2Loader / DRACOLoader instances (with their transcoder paths), so the engine bundles neither.
// Bytes are fetched here, not by three's FileLoader, so loading works the same in Node tests (no ProgressEvent there).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let shared = null;
export function sharedLoader({ ktx2 = null, draco = null, renderer = null } = {}) {
  if (!shared) { shared = new GLTFLoader(); shared.setMeshoptDecoder(MeshoptDecoder); }
  if (ktx2 && shared.ktx2Loader !== ktx2) { if (renderer) ktx2.detectSupport(renderer); shared.setKTX2Loader(ktx2); }
  if (draco && shared.dracoLoader !== draco) shared.setDRACOLoader(draco);
  return shared;
}

async function fetchOk(fetch, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function loadGlb(url, { fetch = globalThis.fetch, loader = sharedLoader() } = {}) {
  const bytes = await (await fetchOk(fetch, url)).arrayBuffer();
  const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
  return { gltf, bytes: bytes.byteLength };
}

export async function loadJson(url, { fetch = globalThis.fetch } = {}) {
  return (await fetchOk(fetch, url)).json();
}
