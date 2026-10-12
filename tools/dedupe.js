// [G-2] esbuild plugin (#11): resolve three and Rapier from the game's root, so the engine and the game share one copy.
// Lives in tools/ (not src/): engine src imports neither three nor Rapier. Games adopt it with the phase 3 CLI.
const MARK = 'lion-hawk-dedupe';
export function dedupe({ root, packages = ['three', '@dimforge/rapier3d-compat'] } = {}) {
  if (!root) throw new Error('dedupe: root required');
  const hit = p => packages.some(k => p === k || p.startsWith(k + '/'));
  return {
    name: 'lion-hawk-dedupe',
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, async args => {
        if (args.pluginData === MARK || !hit(args.path)) return;
        const r = await build.resolve(args.path, { kind: args.kind, resolveDir: root, pluginData: MARK });
        if (r.errors.length) return { errors: r.errors };
        return { path: r.path, external: r.external, sideEffects: r.sideEffects };
      });
    },
  };
}
