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

test('2f: a ui.hold({ wall: true }) button fires after its seconds of real time, not before (#56, #83)', async t => {
  if (skip) return t.skip(skip);
  const ctx = await chrome.browser.newContext(), page = await ctx.newPage();
  try {
    await page.goto(base); await page.waitForFunction(() => window.engine?.ui.tree().some(c => c.id === 's.wake'));
    const b = await page.locator('[data-testid="s.wake"]').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const woke = () => page.evaluate(() => window.engine.events.since(0).filter(e => e.type === 'woke').length);
    const progress = () => page.evaluate(() => document.querySelector('[data-testid="s.wake"]').style.getPropertyValue('--lh-progress'));
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
    assert.equal(await woke(), 0); assert.equal(Number(await progress() || 0), 0);
    await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
    assert.equal(await woke(), 1);
  } finally { await ctx.close(); }
});
