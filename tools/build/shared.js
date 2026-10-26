// lion-hawk build --mode shared (B-4, phase 9; the engine side): the game's bundle keeps lion-hawk, three and Rapier
// external, and an import map in the page points them at one shared pack, so a second game loads only its own files.
// The pack (default <out>/../lion-hawk/<engine version>/, and build.shared.base, default ../lion-hawk/<version>/ from the page):
//   - every browser entry of lion-hawk (sim, view, net, each kit's sim and view) in ONE esbuild call with code
//     splitting, so the entries share one copy of the engine core (a second copy would split module state);
//   - three, each three/* subpath and Rapier, one file each.
// Every pack file keeps its shared imports bare, for the import map. Names carry content hashes: a pack file never
// changes, so the pack is written once and games built later reuse the same files.
import { build as esbuild } from 'esbuild';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupe } from '../dedupe.js';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
export const isShared = s => s === 'three' || s.startsWith('three/') || s === '@dimforge/rapier3d-compat' || s.startsWith('lion-hawk/');

// the lion-hawk specifiers a page can import, and the source file of each
export function engineEntries() {
  const e = { 'lion-hawk/sim': 'index.sim.js', 'lion-hawk/view': 'index.view.js', 'lion-hawk/net': 'index.net.js' };
  for (const k of readdirSync(join(SRC, 'kits')).sort()) {
    if (existsSync(join(SRC, 'kits', k, 'sim.js'))) e[`lion-hawk/kits/${k}`] = `kits/${k}/sim.js`;
    if (existsSync(join(SRC, 'kits', k, 'view.js'))) e[`lion-hawk/kits/${k}/view`] = `kits/${k}/view.js`;
  }
  return e;
}
const slug = s => s.replace(/^@/, '').replace(/[^A-Za-z0-9]+/g, '_');
// marks every shared specifier external except `keep` (the entry a three or Rapier build is for)
const externals = keep => ({ name: 'lh-shared-external', setup(b) { b.onResolve({ filter: /^(three|@dimforge\/rapier3d-compat|lion-hawk)(\/|$)/ }, a => a.path === keep ? undefined : { path: a.path, external: true }); } });
const externalImports = meta => new Set(Object.values(meta.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)));

// the game's own bundle, with the shared specifiers left bare; → { js, needs }
export async function bundleGame(cfg, { entry, e2e = false } = {}) {
  const res = await esbuild({
    entryPoints: [resolve(cfg.dir, entry ?? cfg.build.entry)], bundle: true, format: 'esm', minify: !e2e, write: false, metafile: true,
    sourcemap: e2e ? 'inline' : false, loader: { '.json': 'json' }, logLevel: 'silent', plugins: [externals(null), dedupe({ root: cfg.dir })],
  });
  return { js: res.outputFiles[0].text, needs: externalImports(res.metafile) };
}

// builds what the needed specifiers resolve to into dir; → { imports: { specifier: url }, files: [names in dir] }
export async function buildPack(cfg, { dir, base, needs, e2e = false }) {
  mkdirSync(dir, { recursive: true });
  const imports = {}, files = new Set(), min = !e2e;
  const name = f => f.slice(dir.length + 1).split('\\').join('/');
  const entries = engineEntries();
  const eng = await esbuild({
    entryPoints: Object.entries(entries).map(([s, f]) => ({ in: join(SRC, f), out: slug(s.slice('lion-hawk/'.length)) })),
    bundle: true, splitting: true, format: 'esm', minify: min, outdir: dir, entryNames: 'lh-[name]-[hash]', chunkNames: 'lh-chunk-[hash]',
    metafile: true, logLevel: 'silent', plugins: [externals(null)],
  });
  for (const [out, o] of Object.entries(eng.metafile.outputs)) {
    files.add(name(resolve(out)));
    const spec = o.entryPoint && Object.keys(entries).find(s => resolve(SRC, entries[s]) === resolve(o.entryPoint));
    if (spec) imports[spec] = base + name(resolve(out));
  }
  const todo = [...new Set([...needs, ...externalImports(eng.metafile)])].filter(s => !s.startsWith('lion-hawk/'));
  for (const s of needs) if (s.startsWith('lion-hawk/') && !imports[s]) throw new Error(`build: '${s}' is not a lion-hawk browser entry (shared mode packs ${Object.keys(entries).join(', ')})`);
  for (let i = 0; i < todo.length; i++) { // three, its subpaths and Rapier, each with the other shared specifiers bare
    const spec = todo[i];
    const r = await esbuild({
      stdin: { contents: `export * from ${JSON.stringify(spec)};${spec === '@dimforge/rapier3d-compat' ? `export { default } from ${JSON.stringify(spec)};` : ''}`, resolveDir: cfg.dir, loader: 'js' },
      bundle: true, format: 'esm', minify: min, outdir: dir, entryNames: `${slug(spec)}-[hash]`, metafile: true, logLevel: 'silent', plugins: [externals(spec), dedupe({ root: cfg.dir })],
    });
    const out = Object.keys(r.metafile.outputs)[0];
    files.add(name(resolve(out))); imports[spec] = base + name(resolve(out));
    for (const x of externalImports(r.metafile)) if (!todo.includes(x)) todo.push(x);
  }
  return { imports: Object.fromEntries(Object.entries(imports).sort()), files: [...files].sort() };
}

// the import map goes in <head>, before any module script
export function addImportMap(html, imports) {
  const tag = `<script type="importmap">${JSON.stringify({ imports }).replace(/<\//g, '<\\/')}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}\n${tag}`) : `${tag}\n${html}`;
}
