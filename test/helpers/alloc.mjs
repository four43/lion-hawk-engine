// Allocation probes for view code (R-8): three.js id counters (any new Object3D, Material or BufferGeometry moves them; each
// threeIds() call itself makes one of each) and retained heap after forced GCs, measured after `warm` runs so the JIT's own
// code and feedback do not count. Short-lived garbage: allocRate.
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
export const threeIds = () => ({ object: new THREE.Object3D().id, material: new THREE.Material().id, geometry: new THREE.BufferGeometry().id });
export function retained(fn, n, warm = 2000) {
  for (let i = 0; i < warm; i++) fn();
  gc(); gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) fn();
  gc(); gc();
  return process.memoryUsage().heapUsed - before;
}
// Short-lived garbage too: bytes allocated per call of fn over n calls (after `warm`), from V8's sampling heap profiler with
// objects that minor and major GCs collected kept in the profile. Sampled, so an estimate (the sample interval is 64 bytes).
// top: the n biggest call sites, 'function file:line <- caller ...', bytes per call. within: a URL substring; `inside` is the
// bytes per call of the sites whose three innermost frames include such a URL (code there allocated, or called what did).
// skip: a RegExp; sites whose 'function file:line <- caller ...' key matches are left out of every count.
export async function allocRate(fn, n, { warm = 300, top = 0, within = null, skip = null } = {}) {
  const { Session } = await import('node:inspector/promises');
  for (let i = 0; i < warm; i++) fn();
  const s = new Session(); s.connect();
  try {
    await s.post('HeapProfiler.enable');
    await s.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    for (let i = 0; i < n; i++) fn();
    const { profile } = await s.post('HeapProfiler.stopSampling');
    const sites = new Map(); let total = 0, inside = 0;
    const walk = (node, stack, urls) => {
      const f = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').slice(-2).join('/')}:${node.callFrame.lineNumber + 1}`, st = [f, ...stack].slice(0, 3), us = [node.callFrame.url, ...urls].slice(0, 3);
      const k = st.join(' <- ');
      if (node.selfSize && !skip?.test(k)) {
        total += node.selfSize; sites.set(k, (sites.get(k) ?? 0) + node.selfSize);
        if (within && us.some(u => u.includes(within))) inside += node.selfSize;
      }
      for (const c of node.children) walk(c, st, us);
    };
    walk(profile.head, [], []);
    return { perCall: total / n, inside: inside / n, top: [...sites].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${Math.round(v / n)} ${k}`) };
  } finally { await s.post('HeapProfiler.disable').catch(() => {}); s.disconnect(); }
}
