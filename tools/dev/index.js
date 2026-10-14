// lion-hawk dev (B-1, overview §4.3): an esbuild context with live reload. Serves the page (template + bundle + a reload
// script), baked/models as assets/models, and the PWA files except sw.js (no service worker in dev). A changed model source
// is re-baked (that model only) and the page reloads. dev({ game, port, host, log }) → { url, port, close }.
import { context } from 'esbuild';
import http from 'node:http';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { dedupe } from '../dedupe.js';
import { loadConfig, importFresh } from '../bake/config.js';
import { bake, sources, ENGINE_VERSION } from '../bake/index.js';
import { fillTemplate } from '../build/page.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
const RELOAD = `<script>new EventSource('/lh-reload').onmessage = () => location.reload();</script>`;

export async function dev({ game = '.', port = 8740, host = '0.0.0.0', log = console.log } = {}) {
  const cfg = await loadConfig(game), template = resolve(cfg.dir, cfg.build.template), clients = new Set();
  const hooks = cfg.build.hooks ? (await importFresh(resolve(cfg.dir, cfg.build.hooks))).default ?? {} : {};
  const hctx = { config: cfg, game: cfg.dir, out: null, e2e: true, dev: true, version: cfg.version, engine: ENGINE_VERSION, log };
  let html = '<!doctype html><p>lion-hawk dev: building…</p>' + RELOAD, js = '';
  const reload = () => { for (const res of clients) res.write('data: reload\n\n'); };
  const render = async () => {
    let page = fillTemplate(readFileSync(template, 'utf8'), js);
    if (hooks.beforePage) await hooks.beforePage(hctx);
    if (hooks.page) page = await hooks.page(page, hctx);
    html = page.includes('</body>') ? page.replace('</body>', () => `${RELOAD}</body>`) : page + RELOAD;
    reload();
  };
  const ctx = await context({
    entryPoints: [resolve(cfg.dir, cfg.build.entry)], bundle: true, format: 'esm', sourcemap: 'inline', write: false,
    outfile: join(cfg.dir, 'build/dev/app.js'), loader: { '.json': 'json' }, logLevel: 'silent',
    plugins: [dedupe({ root: cfg.dir }), { name: 'lh-dev-page', setup(b) {
      b.onEnd(async res => {
        if (res.errors.length) { log(`dev: build failed: ${res.errors[0].text}`); return; }
        js = res.outputFiles[0].text;
        try { await render(); log('dev: rebuilt'); } catch (e) { log(`dev: ${e.message}`); }
      });
    } }],
  });
  await ctx.watch();
  let timer = null;
  const watchers = [watch(template, () => render().catch(e => log(`dev: ${e.message}`)))];
  const srcDir = resolve(cfg.dir, cfg.bake.src);
  if (cfg.bake.materials && existsSync(srcDir)) {
    const pending = new Set();
    let chain = Promise.resolve();   // re-bakes run one at a time: two concurrent bake() calls would lose one model's update
    watchers.push(watch(srcDir, (_, file) => {
      if (!file || !/\.(glb|gltf)$/.test(file)) return;
      pending.add(file); clearTimeout(timer);
      timer = setTimeout(() => {
        const files = [...pending]; pending.clear();
        chain = chain.then(async () => {
          try {
            const byFile = new Map([...sources(cfg)].map(([id, s]) => [basename(s.file), id]));
            const ids = files.map(f => byFile.get(f)).filter(Boolean);
            if (ids.length) { await bake({ game: cfg, ids, log }); reload(); }
          } catch (e) { log(`dev: ${e.message}`); }
        });
      }, 100);
    }));
  }
  const serve = (res, file) => {
    let body;
    try { if (!statSync(file).isFile()) throw new Error('not a file'); body = readFileSync(file); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  };
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (p === '/lh-reload') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }).write(': hi\n\n');
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(html); return; }
    if (p.startsWith('/assets/models/')) { serve(res, join(resolve(cfg.dir, cfg.bake.out), 'models', basename(p))); return; }
    if (basename(p) === 'sw.js') { res.writeHead(404).end(); return; }
    serve(res, join(resolve(cfg.dir, cfg.build.pwa), basename(p)));
  });
  await new Promise(r => server.listen(port, host, r));
  const actual = server.address().port, url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actual}/`;
  log(`dev: ${cfg.id} at ${url}`);
  return {
    url, port: actual,
    async close() {
      clearTimeout(timer);
      for (const w of watchers) w.close();
      for (const res of clients) res.end();
      await ctx.dispose();
      await new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); });
    },
  };
}
