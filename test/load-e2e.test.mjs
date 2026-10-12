// Real-Chromium checks of the game driver against a load held by view.wait (#50) and of press/unpress beside a stick.
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
const PAGE = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}[data-lh-ui-root]{position:fixed;right:20px;bottom:20px}[data-lh-ui] button{min-width:96px;min-height:56px}</style><body><script src="loader.bundle.js"></script>';
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/loader.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'loader.bundle.js'), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === '/loader.bundle.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, 'loader.bundle.js')));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

const pick = ({ x, builds, done, phase }) => ({ x, builds, done, phase });
test('#50: until waits out a load whose settle is held by view.wait; untilLoaded resolves after it', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', seed: 1 });
  try {
    await game.command('reload');
    const k = await game.until(s => s.done === 1, { maxSteps: 30 }); // 3 steps of hold + the settle; the wait is 300 ms of real time
    assert.ok(k <= 30, `stepped ${k}`);
    assert.equal(await game.page.evaluate(() => window.waits), 1);
    assert.deepEqual(pick(await game.state()), { x: 0, builds: 1, done: 1, phase: '' });
    await game.command('reload'); await game.step(1);
    assert.equal((await game.state()).phase, 'hold');
    await game.untilLoaded({ timeout: 5000 });
    assert.equal(await game.page.evaluate(() => window.waits), 2);
    assert.deepEqual(pick(await game.state()), { x: 0, builds: 2, done: 2, phase: '' });
    // step(n) also waits: the load finishes inside the n steps
    await game.command('reload'); await game.step(30);
    assert.deepEqual(pick(await game.state()), { x: 0, builds: 3, done: 3, phase: '' });
    // seconds(s) also waits (the 2d carry-over): 0.5 s of engine time takes the load through its 300 ms wait
    await game.command('reload'); const before = (await game.state()).step;
    assert.equal(await game.seconds(0.5), before + 30);
    assert.equal(await game.page.evaluate(() => window.waits), 4);
    assert.deepEqual(pick(await game.state()), { x: 0, builds: 4, done: 4, phase: '' });
    // a wait that outlives the timeout fails with a message naming the blocks
    await game.page.evaluate(() => { window.waitMs = 5000; });
    await game.command('reload'); await game.step(1);
    await assert.rejects(game.untilLoaded({ timeout: 300 }), /untilLoaded: load still blocked by view\.wait after 300 ms/);
    const t0 = Date.now(); // seconds gives up the same way, within its timeout
    await assert.rejects(game.seconds(1, undefined, 300), /seconds: load still blocked by view\.wait after 300 ms/);
    assert.ok(Date.now() - t0 < 2000, `gave up after ${Date.now() - t0} ms`);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('unpress keeps a stick finger down: the stick stays active and still drives', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'iPhone 15 Pro landscape', seed: 1 });
  try {
    await game.touch.start(1, { x: 200, y: 200 });
    await game.touch.move(1, { x: 200, y: 160 });
    await game.step(30); const x1 = (await game.state()).x;
    assert.ok(x1 > 0, 'the stick drives x');
    await game.press('stage.boost'); await game.step(5); await game.unpress('stage.boost');
    assert.equal(await game.page.evaluate(() => document.body.hasAttribute('data-lh-active')), true, 'stick still active');
    await game.touch.move(1, { x: 200, y: 130 });
    await game.step(30); const x2 = (await game.state()).x;
    assert.ok(x2 > x1 + 1, `the stick still drives x (${x1} -> ${x2})`);
    await game.touch.end(1);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
