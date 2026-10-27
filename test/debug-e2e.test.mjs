// The debug panels in real Chromium (D-8, D-10): mouse and touch drags, the resize grip, clamping when the viewport
// shrinks, the hotkey, and a reload that restores the layout from localStorage.
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
const PAGE = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="margin:0"><script src="debug.bundle.js"></script>';
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/debug-e2e.page.js')], bundle: true, format: 'iife', outfile: path.join(out, 'debug.bundle.js'), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === '/debug.bundle.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, 'debug.bundle.js')));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

async function open(query, opts = {}) {
  const context = await chrome.browser.newContext({ viewport: { width: 1000, height: 700 }, ...opts });
  const page = await context.newPage();
  await page.goto(base + query); await page.waitForFunction(() => window.__dbg);
  return { context, page, box: id => page.evaluate(i => window.__dbg.box(i), id), part: (id, sel) => page.evaluate(([i, s]) => window.__dbg.part(i, s), [id, sel]) };
}

test('a mouse drags a window by its bar and resizes it by its grip; it stays on screen when the viewport shrinks (D-10)', async t => {
  if (skip) return t.skip(skip);
  const { context, page, box, part } = await open('?debug=a');
  try {
    assert.deepEqual(await box('a'), [1000 - 300 - 12, 48, 300, 200]);
    const [bx, by] = await part('a', '[data-lh-debug-bar] span');
    await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx - 600, by + 300, { steps: 5 }); await page.mouse.up();
    assert.deepEqual(await box('a'), [88, 348, 300, 200]);
    const [gx, gy] = await part('a', '[data-lh-debug-grip]');
    await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(gx + 100, gy + 50, { steps: 5 }); await page.mouse.up();
    assert.deepEqual(await box('a'), [88, 348, 400, 250]);
    await page.setViewportSize({ width: 360, height: 500 });
    await page.waitForFunction(() => window.__dbg.box('a')[2] === 360);
    const [l, top, w, h] = await box('a');
    assert.deepEqual([l, w], [0, 360]); assert.ok(top + h <= 500 && top >= 0, `inside: ${top}+${h}`);
    assert.deepEqual(await page.evaluate(() => window.__dbg.errors), []);
  } finally { await context.close(); }
});

test('a touch drags a window by its bar; the page does not scroll (D-10)', async t => {
  if (skip) return t.skip(skip);
  const { context, page, box, part } = await open('?debug=a', { hasTouch: true, isMobile: true });
  try {
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const [x0, y0] = await box('a'), [bx, by] = await part('a', '[data-lh-debug-bar] span');
    await touch('touchStart', bx, by);
    for (let i = 1; i <= 5; i++) await touch('touchMove', bx - 60 * i, by + 40 * i);
    await touch('touchEnd');
    assert.deepEqual((await box('a')).slice(0, 2), [x0 - 300, y0 + 200]);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
  } finally { await context.close(); }
});

test('the hotkey hides the layer; a reload restores open windows, places and the hidden state (D-8, D-10)', async t => {
  if (skip) return t.skip(skip);
  const { context, page, box, part } = await open('?debug=a,b');
  try {
    const [bx, by] = await part('a', '[data-lh-debug-bar] span');
    await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx - 400, by + 100, { steps: 4 }); await page.mouse.up();
    const placeA = await box('a'), placeB = await box('b');
    await page.goto(base + '?debug'); await page.waitForFunction(() => window.__dbg);
    assert.deepEqual(await box('a'), placeA); assert.deepEqual(await box('b'), placeB);
    await page.keyboard.press('Backquote');
    assert.equal(await page.evaluate(() => document.querySelector('[data-lh-debug]').hidden), true);
    await page.reload(); await page.waitForFunction(() => window.__dbg);
    assert.equal(await page.evaluate(() => document.querySelector('[data-lh-debug]').hidden), true, 'still hidden');
    await page.keyboard.press('Backquote');
    assert.deepEqual(await box('a'), placeA);
  } finally { await context.close(); }
});
