// STUB (3e): createMaterialCompiler with the overview §4.8 surface plus made() → [{ material, use }] (what gfx.warm
// compiles), extend and time (3f C3–C5). It accepts paint: { base, shade } (3f C11, render.paint) and ignores it.
// 3f replaces this file wholesale.
export function createMaterialCompiler(registry, { shading = 'physical', paint = {} } = {}) {
  const notYet = () => { throw new Error('materials: the compiler lands in 3f (stub)'); };
  return { shading, time: { value: 0 }, get: notYet, paint: notYet, coverage: notYet, extend: notYet, apply: root => root, furGeometry: g => g, keys: () => [], made: () => [], dispose() {} };
}
