// The compiled materials in real WebGL2 (SwiftShader): every tier × feature compiles without a shader error, extra
// paint and coverage users share programs, and each feature's uniforms change what is drawn.
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { launch } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
const PAGE = '<!doctype html><meta charset=utf-8><body><script src="compiler.bundle.js"></script>';
let server, base, chrome, page, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/compiler-e2e.page.js')], bundle: true, format: 'iife', outfile: path.join(out, 'compiler.bundle.js'), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === '/compiler.bundle.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, 'compiler.bundle.js')));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  page = await chrome.browser.newPage();
  await page.goto(base);
  await page.waitForFunction(() => typeof window.lhFeatures === 'function');
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

for (const tier of ['physical', 'standard', 'lambert']) {
  test(`${tier}: every feature compiles; more paint and coverage users add no programs (M-11, M-13)`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhCompileAll(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.equal(r.after, r.before, `programs ${r.before} → ${r.after}`);
  });
  test(`${tier}: a coverage clone's uCoverage reaches the GPU, and only for that clone`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhCoverage(tr), tier);
    assert.deepEqual(r.errors, []);
    const [clean, dirty, other] = r.blue;
    assert.ok(dirty < clean * 0.9, `dirt should brown the plane: blue ${clean} → ${dirty}`);
    assert.equal(other, clean, 'the other entity stays clean');
  });
  test(`${tier}: fur shells widen the silhouette, subsurface brightens (not on lambert), wind moves with mc.time`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhFeatures(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.ok(r.furLit > r.bareLit * 1.05, `fur ${r.furLit} vs bare ${r.bareLit} lit pixels`);
    if (tier === 'lambert') assert.equal(r.wax, r.plain, 'lambert drops SUBSURFACE (D5)');
    else assert.ok(r.wax > r.plain, `subsurface ${r.wax} vs plain ${r.plain}`);
    assert.ok(r.windMoved > 10, `wind moved ${r.windMoved} pixels`);
  });
  test(`${tier}: paint keeps the vertex shading, a hue ramp varies along x, no paint draws the vertex colours, no new programs (Task 8b)`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhPaint(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.equal(r.after, r.before, `programs ${r.before} → ${r.after}`);
    const [[lr], [rr, rg, rb]] = r.red;
    assert.ok(rr > lr, `the brighter source side stays brighter: ${lr} → ${rr}`);
    assert.ok(rr > 2 * Math.max(rg, rb), `the hue is the paint: ${r.red[1]}`);
    const [[hlr, hlg], [hrr, hrg]] = r.hue;
    assert.ok(hlr > hlg && hrg > hrr, `hue ramp: left ${r.hue[0]}, right ${r.hue[1]}`);
    assert.equal(r.keepDiff, 0, 'unpainted draws exactly the vertex colours');
  });
  test(`${tier}: wet and mud mat the fur, wet shines (lambert too), instanceWet mats only its instance`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhWet(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.ok(r.wetLit < r.dryLit * 0.95, `wet fur ${r.wetLit} vs dry ${r.dryLit} lit pixels`);
    assert.ok(r.mudLit < r.dryLit * 0.95, `muddy fur ${r.mudLit} vs dry ${r.dryLit} lit pixels`);
    assert.ok(r.wetPeak > r.dryPeak + 20, `wet highlight: peak ${r.dryPeak} → ${r.wetPeak}`);
    assert.ok(r.half[1] < r.half[0] * 0.95, `the wet instance (right) is flatter: ${r.half}`);
  });
  test(`${tier}: depth twins (mc.depth) compile and cast shadows that move with the material`, async t => {
    if (skip) return t.skip(skip);
    const r = await page.evaluate(tr => window.lhDepth(tr), tier);
    assert.deepEqual(r.errors, []);
    assert.ok(r.moved > 10, `wind moved ${r.moved} pixels (blade and shadow)`);
  });
}
