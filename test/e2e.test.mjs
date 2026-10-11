// Real-Chromium end-to-end run of the countdown example on an iPhone 15 Pro landscape preset.
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, openGame, expectScene, expectTappable, expectFitsSafeArea, expectNoOverlap, expectState } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/countdown.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'countdown.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/fixtures/countdown.html'), 'text/html'], '/countdown.bundle.js': [path.join(out, 'countdown.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('countdown: title, play, race with the stick, results, retry (iPhone 15 Pro landscape)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { preset: 'iPhone 15 Pro landscape', seed: 7 });
  try {
    await expectScene(game, 'title');
    await expectTappable(game, 'title.play');
    await expectFitsSafeArea(game, '[data-testid="title.play"]');
    await game.tap('title.play');
    await expectScene(game, 'race');
    await game.untilEvent('go');
    await game.touch.start(1, { x: 300, y: 200 });
    await game.touch.move(1, { x: 300, y: 130 });
    await game.step(60);
    assert.ok((await game.state()).x > 0, 'the stick drives x');
    await game.touch.end(1);
    await expectNoOverlap(game, '#x', '[data-testid="race.pause"]');
    await game.jump('race', 'running', { x: 49 });
    await game.input.hold({ throttle: 1 });
    await game.until(s => s.overlays.includes('results'), { maxSteps: 600 });
    await expectTappable(game, 'results.retry');
    await game.tap('results.retry');
    await expectScene(game, 'race');
    await expectState(game, 'x', 0);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
