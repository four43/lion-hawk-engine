// lion-hawk build (B-1, B-2, B-3 as amended by D1, B-5): esbuild + dedupe, the page from the template, assets/models/* from
// baked/, the PWA files, sw.js stamped with the version and the precache list, then a size report.
//
// Public API (`import { build } from 'lion-hawk/build'`, 3l CI-7):
//   build({ game = '.', out, env = process.env, site = false, mode = 'single', e2e = false, entry, log = console.log })
//     → Promise<{ out, version, hash, files, sizes: { html, assets, total: { bytes, gzip } } }>
//   game: a game directory (or a loadConfig() result); out: the output dir (else $<outEnv>); e2e: unminified, inline
//   sourcemap, no sw.js, ctx.e2e for hooks; entry: overrides build.entry (an e2e entry); log: the size report sink.
// Also exported: bundle, bakedAssets, ENGINE_VERSION, dedupe, UsageError.
import { build as esbuild } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dedupe } from '../dedupe.js';
import { loadConfig, importFresh } from '../bake/config.js';
import { readBaked, sha256 } from '../bake/write.js';
import { resolveOut, UsageError } from './out.js';
import { fillTemplate, stampPage, stampWorker } from './page.js';
export { dedupe, UsageError };

export const ENGINE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export async function bundle(cfg, { entry, e2e = false } = {}) {
  const res = await esbuild({
    entryPoints: [resolve(cfg.dir, entry ?? cfg.build.entry)], bundle: true, format: 'esm', minify: !e2e, write: false, // D1: inline module
    sourcemap: e2e ? 'inline' : false, loader: { '.json': 'json' }, logLevel: 'silent', plugins: [dedupe({ root: cfg.dir })],
  });
  return res.outputFiles[0].text;
}

// the baked models listed in manifest.json, each checked against its recorded sha256
export function bakedAssets(cfg) {
  const outDir = resolve(cfg.dir, cfg.bake.out), { manifest } = readBaked(outDir);
  if (!manifest) return [];
  const files = [];
  for (const [id, m] of Object.entries(manifest.models)) {
    const glb = join(outDir, m.glb);
    if (!existsSync(glb) || sha256(readFileSync(glb)) !== m.sha256) throw new Error(`build: ${m.glb} does not match baked/manifest.json (run lion-hawk bake)`);
    files.push({ src: glb, rel: `assets/${m.glb}` });
    if (m.anim) files.push({ src: join(outDir, m.anim), rel: `assets/${m.anim}` });
  }
  return files;
}

export async function build({ game = '.', out, env = process.env, site = false, mode = 'single', e2e = false, entry, log = console.log } = {}) {
  if (mode !== 'single') throw new UsageError(`build: mode '${mode}' is not available (only 'single'; shared mode is B-4, not built)`);
  const cfg = typeof game === 'string' ? await loadConfig(game) : game;
  const dir = resolveOut({ cfg, out, env, site });
  const hooks = cfg.build.hooks ? (await importFresh(resolve(cfg.dir, cfg.build.hooks))).default ?? {} : {};
  const ctx = { config: cfg, game: cfg.dir, out: dir, e2e, version: cfg.version, engine: ENGINE_VERSION, log };
  const js = await bundle(cfg, { entry, e2e });
  mkdirSync(dir, { recursive: true });                // hooks may write into ctx.out
  if (e2e) rmSync(join(dir, 'sw.js'), { force: true }); // C8: --e2e = no sw.js, even over an earlier normal build
  if (hooks.beforePage) await hooks.beforePage(ctx);
  let html = fillTemplate(readFileSync(resolve(cfg.dir, cfg.build.template), 'utf8'), js);
  if (hooks.page) html = await hooks.page(html, ctx);
  if (typeof html !== 'string') throw new Error('build: hooks.page must return the html string');
  const assets = bakedAssets(cfg), pwaDir = resolve(cfg.dir, cfg.build.pwa);
  const pwa = existsSync(pwaDir) ? readdirSync(pwaDir).sort().filter(f => statSync(join(pwaDir, f)).isFile()) : [];
  const h = createHash('sha256').update(html);
  for (const a of assets) h.update(a.rel).update(readFileSync(a.src));
  for (const f of pwa) if (f !== 'sw.js') h.update(f).update(readFileSync(join(pwaDir, f)));
  const hash = h.digest('hex').slice(0, 12);
  html = stampPage(html, { id: cfg.id, version: cfg.version, engine: ENGINE_VERSION, hash });
  mkdirSync(join(dir, 'assets/models'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  for (const a of assets) copyFileSync(a.src, join(dir, a.rel));
  const files = ['index.html', ...assets.map(a => a.rel)];
  for (const f of pwa) {
    if (f === 'sw.js') continue;
    copyFileSync(join(pwaDir, f), join(dir, f)); files.push(f);
  }
  if (pwa.includes('sw.js') && !e2e) {
    const precache = ['./', ...files.filter(f => f !== 'index.html')];
    writeFileSync(join(dir, 'sw.js'), stampWorker(readFileSync(join(pwaDir, 'sw.js'), 'utf8'), { version: cfg.version, engine: ENGINE_VERSION, hash, precache }));
    files.push('sw.js');
  }
  const size = list => list.reduce((s, f) => { const b = readFileSync(join(dir, f)); return { bytes: s.bytes + b.length, gzip: s.gzip + gzipSync(b).length }; }, { bytes: 0, gzip: 0 });
  const sizes = { html: size(['index.html']), assets: size(assets.map(a => a.rel)), total: size(files) };
  const kb = n => `${(n / 1024).toFixed(1)} KB`;
  log(`build: ${cfg.id} ${cfg.version} (lion-hawk ${ENGINE_VERSION}, ${hash}) → ${dir}`);
  for (const k of ['html', 'assets', 'total']) log(`  ${k.padEnd(6)} ${kb(sizes[k].bytes).padStart(10)}  gzip ${kb(sizes[k].gzip).padStart(10)}`);
  return { out: dir, version: `${cfg.version}+lh${ENGINE_VERSION}-${hash}`, hash, files, sizes };
}
