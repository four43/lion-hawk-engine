// Real Chromium (H-7): in a minified bundle, the engine sound runs EngineDSP in an AudioWorklet and a revving powertrain is
// heard at the master.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch } from 'lion-hawk/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, base, chrome, skip = false;
const ENTRY = `import { createAudio } from './src/view/audio/index.js';
import { createPowertrain } from './src/kits/vehicle/powertrain.js';
import { createEngineSound } from './src/kits/vehicle/view.js';
const audio = createAudio({ doc: document }), pt = createPowertrain({ engine: 'v8x' }), snd = createEngineSound(audio, pt);
window.__e = { audio, run: async () => {
  await snd.ready;
  const an = audio.ctx.createAnalyser(); an.fftSize = 4096; audio.master.connect(an);
  pt.throttle = 1;
  await new Promise(r => { let n = 0; const id = setInterval(() => { pt.step(1 / 60); snd.update(); if (++n === 40) { clearInterval(id); r(); } }, 16); });
  const buf = new Float32Array(4096); an.getFloatTimeDomainData(buf);
  let s = 0, bad = 0; for (const x of buf) { s += x * x; if (!Number.isFinite(x)) bad++; }
  return { mode: snd.mode, rms: Math.sqrt(s / buf.length), bad, rpm: pt.state.rpm };
} };`;

before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  const out = await build({ stdin: { contents: ENTRY, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', minify: true, write: false, logLevel: 'silent' });
  const js = out.outputFiles[0].text, html = '<!doctype html><meta charset="utf-8"><body><button id="b">go</button><script src="/t.js"></script></body>';
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(html);
    else if (p === '/t.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(js);
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('H-7 e2e: a minified page revs a V8 and hears it from the AudioWorklet', async t => {
  if (skip) return t.skip(skip);
  const page = await chrome.browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    await page.click('#b');
    await page.waitForFunction(() => window.__e.audio.unlocked, null, { timeout: 5000 });
    const got = await page.evaluate(() => window.__e.run());
    assert.equal(got.mode, 'worklet'); assert.equal(got.bad, 0); assert.ok(got.rms > 0.02, `rms ${got.rms}`); assert.ok(got.rpm > 2000, `rpm ${got.rpm}`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
