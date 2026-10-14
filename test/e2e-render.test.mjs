// Real-Chromium (SwiftShader) checks of the render pipeline (overview §4.6): pixels, the DPR cap on touch, the portrait FOV,
// rotation, warm, snapshot, tilt-shift and the no-WebGL path. Browser suite: run alone under the browser lock (overview §7).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
let server, base, chrome, skip = false;
const TOUCH = () => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 }); // an iPad's touch points
const NO_WEBGL = () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/i.test(type) ? null : get.call(this, type, ...a); }; };
const near = (a, b, tol, msg) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= tol), `${msg}: ${a} vs ${b}`);

before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/render-fixtures/render.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'render.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/render-fixtures/render.html'), 'text/html'], '/render.bundle.js': [path.join(out, 'render.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('desktop: DPR 1, landscape FOV, the red box in the middle, the sky colour in the corner', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual' });
  try {
    const s = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([s.pr, s.bw, s.bh, s.fov, s.lhFov], [1, 1280, 720, 60, 60]);
    const mid = await game.page.evaluate(() => window.__fx.pixel(640, 360));
    assert.ok(mid[0] > 150 && mid[1] < 80 && mid[2] < 80, `red box: ${mid}`);
    near(await game.page.evaluate(() => window.__fx.pixel(4, 4)), [191, 230, 245, 255], 3, 'sky #bfe6f5');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('touch portrait: DPR capped at 1.5, the portrait FOV; rotating gives the landscape FOV and size', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'iPhone 15 Pro portrait', render: 'manual', initScript: TOUCH });
  try {
    const p = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([p.touch, p.dpr, p.pr, p.fov], [5, 3, 1.5, 64]);
    assert.deepEqual([p.bw, p.bh], [Math.floor(393 * 1.5), Math.floor(852 * 1.5)]);
    await game.page.setViewportSize({ width: 852, height: 393 });
    await game.page.waitForFunction(() => window.__fx.size().fov === 60, null, { timeout: 10000 });
    const l = await game.page.evaluate(() => window.__fx.size());
    assert.deepEqual([l.bw, l.bh, l.w, l.h], [Math.floor(852 * 1.5), Math.floor(393 * 1.5), 852, 393]);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
test('no WebGL: one render: error, no gfx, and the game still plays (RF1)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', render: 'manual', initScript: NO_WEBGL });
  try {
    const st = await game.page.evaluate(() => ({ gfx: window.__fx.view.gfx, errs: window.engine.errors.map(e => e.message) }));
    assert.equal(st.gfx, null); assert.equal(st.errs.length, 1); assert.match(st.errs[0], /^render: /);
    await game.tap('title.play');
    assert.equal(await game.page.evaluate(() => window.engine.scene.name), 'race');
  } finally { await game.close(); }
});
