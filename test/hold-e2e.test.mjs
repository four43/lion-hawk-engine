// Real-Chromium run of a ui.hold({ wall: true }) button on real frames (no ?lh-test, so the driver steps the sim) (#56, #83).
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/hold.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'hold.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/fixtures/hold.html'), 'text/html'], '/hold.bundle.js': [path.join(out, 'hold.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('2f: a ui.hold({ wall: true }) button fires after its seconds of real time, not engine time, on slow frames (#56, #83)', async t => {
  if (skip) return t.skip(skip);
  const ctx = await chrome.browser.newContext(), page = await ctx.newPage();
  // ~5 fps: each frame steps at most maxCatchUp (3) steps = 0.05 s of engine time, so 1 s of engine time would take ~4 s of wall time
  await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => setTimeout(() => raf(cb), 200); });
  try {
    await page.goto(base); await page.waitForFunction(() => window.engine?.ui.tree().some(c => c.id === 's.wake'));
    const b = await page.locator('[data-testid="s.wake"]').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const woke = () => page.evaluate(() => window.engine.events.since(0).filter(e => e.type === 'woke').length);
    const progress = () => page.evaluate(() => document.querySelector('[data-testid="s.wake"]').style.getPropertyValue('--lh-progress'));
    const time = () => page.evaluate(() => ({ sim: window.engine.time.sim, wall: window.engine.time.wall }));
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
    assert.equal(await woke(), 0); assert.equal(Number(await progress() || 0), 0);
    const t0 = await time();
    await page.mouse.down(); await page.waitForTimeout(600);
    assert.equal(await woke(), 0, 'not before its second of wall time');
    await page.waitForTimeout(900); await page.mouse.up();
    const t1 = await time();
    assert.equal(await woke(), 1, 'fired within ~1.5 s of wall time');
    assert.ok(t1.wall - t0.wall >= 1000, `wall advanced ${t1.wall - t0.wall} ms`);
    assert.ok(t1.sim - t0.sim < 0.6, `engine time advanced only ${t1.sim - t0.sim} s: an engine-time hold could not have fired`);
  } finally { await ctx.close(); }
});
