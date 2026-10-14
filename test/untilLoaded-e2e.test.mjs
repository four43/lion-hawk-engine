// #100 in a real page: game.command then game.untilLoaded, with no step between, waits out the load the command starts
// (including its view.wait-held settle, #50).
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
const BUNDLE = 'loader-100.bundle.js';
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}</style><body><script src="${BUNDLE}"></script>`;
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/loader.view.js')], bundle: true, format: 'iife', outfile: path.join(out, BUNDLE), logLevel: 'silent' });
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    else if (p === `/${BUNDLE}`) res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(path.join(out, BUNDLE)));
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('#100: untilLoaded straight after game.command waits for the load the command starts', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'desktop', seed: 1 });
  try {
    await game.command('reload');
    const k = await game.untilLoaded({ timeout: 5000 });
    assert.ok(k >= 4, `stepped ${k}`); // 1 to deliver, 3 of hold, then the settle
    const s = await game.state();
    assert.deepEqual({ builds: s.builds, done: s.done, phase: s.phase }, { builds: 1, done: 1, phase: '' });
    assert.equal(await game.page.evaluate(() => window.waits), 1);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
