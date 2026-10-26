// Real Chromium (H-5): a synth class in a minified bundle runs in an AudioWorklet loaded from its own source in a Blob URL,
// through a voice and the sfx bus, and is heard at the master.
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
import { createDsp } from './src/view/audio/dsp.js';
class Tone {
  constructor(sr) { this.sr = sr; this.ph = 0; this.g = 0.5; }
  setParams(m) { this.g = m.g; }
  render(L, R, n) { for (let i = 0; i < n; i++) { this.ph += 440 / this.sr; const v = Math.sin(2 * Math.PI * this.ph) * this.g; L[i] = v; if (R) R[i] = v; } }
}
const audio = createAudio({ doc: document });
window.__t = { audio, run: async () => {
  const d = await createDsp(audio, { name: 'tone', Class: Tone });
  const v = audio.voice(); d.node.connect(v.input);
  const an = audio.ctx.createAnalyser(); audio.master.connect(an);
  await new Promise(r => setTimeout(r, 300));
  const buf = new Float32Array(2048); an.getFloatTimeDomainData(buf);
  let s = 0; for (const x of buf) s += x * x;
  return { mode: d.mode, rms: Math.sqrt(s / buf.length) };
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

test('H-5 e2e: a minified synth class plays from an AudioWorklet through a voice to the master', async t => {
  if (skip) return t.skip(skip);
  const page = await chrome.browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    await page.click('#b');
    await page.waitForFunction(() => window.__t.audio.unlocked, null, { timeout: 5000 });
    const got = await page.evaluate(() => window.__t.run());
    assert.equal(got.mode, 'worklet'); assert.ok(got.rms > 0.05, `rms ${got.rms}`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
