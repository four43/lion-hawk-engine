// STUB (3e): createViewSync with the overview §4.9 surface (plus view, root and dispose: 3g contract issue 1), inert: it
// draws nothing. 3g replaces this file wholesale; at the Wave B merge the owner's file wins.
export function createViewSync(engine, { gfx = null, assets = null, compiler = null, view = { dt: 0 } } = {}) {
  return { root: null, frame() {}, objectOf() { return undefined; }, on() { return () => {}; }, dispose() {} };
}
