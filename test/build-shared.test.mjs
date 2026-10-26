// [B-4] build --mode shared (phase 9, the engine side): the game bundle keeps lion-hawk, three and Rapier bare, the page's
// import map points them at one content-hashed pack beside the games, and a second game reuses that pack's files.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, ENGINE_VERSION } from '../tools/build/index.js';
import { launch, openGame } from 'lion-hawk/playwright';
import { tmp } from './helpers/tmp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), quiet = () => {};
const BASE = `../lion-hawk/${ENGINE_VERSION}/`;
// a game under <web>/src/<id> that imports lion-hawk and three by package name (node_modules links to this repo)
function makeGame(web, id, label) {
  const dir = join(web, 'src', id);
  mkdirSync(join(dir, 'src'), { recursive: true }); mkdirSync(join(dir, 'node_modules'));
  symlinkSync(ROOT, join(dir, 'node_modules/lion-hawk'), 'dir');
  symlinkSync(join(ROOT, 'node_modules/three'), join(dir, 'node_modules/three'), 'dir');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: id, version: '1.0.0', type: 'module' }));
  writeFileSync(join(dir, 'game.config.js'), `export default { id: '${id}', build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa' } };\n`);
  writeFileSync(join(dir, 'template.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><!--APP--></body></html>');
  mkdirSync(join(dir, 'pwa')); writeFileSync(join(dir, 'pwa/sw.js'), 'const V = "__VERSION__"; const PRECACHE = __PRECACHE__;\n');
  writeFileSync(join(dir, 'src/main.js'), `import { boot, defineView } from 'lion-hawk/view';
import { defineGame } from 'lion-hawk/sim';
import { REVISION } from 'three';
const game = defineGame({ id: '${id}', start: 't', scenes: { t: { ui(u) { u.button({ id: 'go', label: '${label}', action: () => {} }); } } } });
window.__three = REVISION;
boot(game, defineView({ scenes: {} }));
`);
  return dir;
}
const site = () => { const web = tmp('lh-web-'); return { web, a: makeGame(web, 'a', 'A'), b: makeGame(web, 'b', 'B') }; };
const out = (web, id) => join(web, 'games', id);

test('B-4: shared mode leaves the shared imports bare, writes the pack beside the game and maps it in the page', async () => {
  const { web, a } = site();
  const r = await build({ game: a, out: out(web, 'a'), env: {}, mode: 'shared', log: quiet });
  const html = readFileSync(join(out(web, 'a'), 'index.html'), 'utf8');
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)[1]);
  for (const s of ['lion-hawk/sim', 'lion-hawk/view', 'three']) assert.ok(map.imports[s]?.startsWith(BASE), s);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), 'the map comes before the module');
  assert.match(html, /from"lion-hawk\/view"|from "lion-hawk\/view"/, 'the bundle imports lion-hawk/view bare');
  assert.ok(!html.includes('function createEngine'), 'no engine copy in the page');
  assert.equal(r.shared.dir, join(web, 'games/lion-hawk', ENGINE_VERSION));
  for (const f of r.shared.files) assert.ok(existsSync(join(r.shared.dir, f)), f);
  for (const url of Object.values(map.imports)) assert.ok(r.shared.files.includes(url.slice(BASE.length)), url);
  const sw = readFileSync(join(out(web, 'a'), 'sw.js'), 'utf8');
  for (const f of r.shared.files) assert.ok(sw.includes(JSON.stringify(BASE + f)), `precache ${f}`);
  assert.ok(statSync(join(out(web, 'a'), 'index.html')).size < 20000, 'the page is the game alone');
});
test('B-4: a second game reuses the same pack files; the base and dir are configurable', async () => {
  const { web, a, b } = site();
  const ra = await build({ game: a, out: out(web, 'a'), env: {}, mode: 'shared', log: quiet });
  const before = readdirSync(ra.shared.dir).sort();
  const rb = await build({ game: b, out: out(web, 'b'), env: {}, mode: 'shared', log: quiet });
  for (const s of ['lion-hawk/sim', 'lion-hawk/view', 'three']) assert.equal(rb.shared.imports[s], ra.shared.imports[s], s);
  assert.deepEqual(readdirSync(rb.shared.dir).sort(), before, 'game b added no pack files');
  const cfg = join(b, 'game.config.js');
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace("pwa: 'pwa' }", "pwa: 'pwa', shared: { base: '/cdn/lh/', dir: '../../cdn' } }"));
  const rc = await build({ game: b, out: out(web, 'b'), env: {}, mode: 'shared', log: quiet });
  assert.equal(rc.shared.dir, join(web, 'cdn')); assert.ok(rc.shared.imports['lion-hawk/view'].startsWith('/cdn/lh/'));
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace("base: '/cdn/lh/'", "base: '/cdn/lh'"));
  await assert.rejects(build({ game: b, out: out(web, 'b'), env: {}, mode: 'shared', log: quiet }), /build\.shared\.base must end with '\/'/);
});

let chrome, server, base, skip = false, web;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  const s = site(); web = s.web;
  await build({ game: s.a, out: out(web, 'a'), env: {}, mode: 'shared', e2e: true, log: quiet });
  await build({ game: s.b, out: out(web, 'b'), env: {}, mode: 'shared', e2e: true, log: quiet });
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
  server = http.createServer((req, res) => {
    let p = join(web, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith('/')) p = join(p, 'index.html');
    if (!p.startsWith(web) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('B-4: a shared-mode page boots in Chromium from the pack, and two games load the same engine URLs', async t => {
  if (skip) return t.skip(skip);
  const seen = {};
  for (const id of ['a', 'b']) {
    const game = await openGame(chrome.browser, `${base}/games/${id}/`, { preset: 'desktop' });
    try {
      seen[id] = await game.page.evaluate(() => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname).filter(p => p.includes('/lion-hawk/')).sort());
      assert.equal((await game.control('t.go')).label, id.toUpperCase());
      assert.equal(await game.page.evaluate(() => window.__three), (await import('three')).REVISION);
      assert.deepEqual(await game.errors(), []);
    } finally { await game.close(); }
  }
  assert.ok(seen.a.some(p => /lh-view-/.test(p)), seen.a.join(', '));
  assert.deepEqual(seen.b, seen.a, 'the second game fetches the same engine files');
});
