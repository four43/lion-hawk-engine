// Real Chromium: the audio service against real Web Audio (#67). A click makes and runs the context; a WAV data URL is fetched,
// decoded and played through the limiter; a hidden tab suspends it and coming back resumes it; ?mute starts muted.
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
const unlocks = [];
const audio = createAudio({ doc: document, flags: { mute: new URLSearchParams(location.search).has('mute') } });
audio.onUnlock(a => unlocks.push(a.ctx.state));
window.__audio = { audio, unlocks };`;
// 0.1 s of a 16-bit mono sine at 8 kHz
function wav() {
  const rate = 8000, n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 4) * 8000), 44 + i * 2);
  return `data:audio/wav;base64,${b.toString('base64')}`;
}

before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  const out = await build({ stdin: { contents: ENTRY, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' });
  const js = out.outputFiles[0].text, html = '<!doctype html><meta charset="utf-8"><body><button id="b">go</button><script src="/audio.js"></script></body>';
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(html);
    else if (p === '/audio.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(js);
    else res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('3g e2e: a click unlocks real Web Audio once; a WAV decodes and plays; hidden suspends, visible resumes (#67)', async t => {
  if (skip) return t.skip(skip);
  const page = await chrome.browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    assert.equal(await page.evaluate(() => window.__audio.audio.ctx), null);
    await page.click('#b');
    await page.waitForFunction(() => window.__audio.audio.unlocked, null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.unlocks), ['running']);
    const got = await page.evaluate(async url => {
      const a = window.__audio.audio, buf = await a.load(url), h = a.play(buf, { gain: 0.5, pan: 0.3 });
      return { dur: buf.duration, same: a.master.context === a.ctx, stop: typeof h.stop };
    }, wav());
    assert.ok(Math.abs(got.dur - 0.1) < 0.01, `duration ${got.dur}`); assert.equal(got.same, true); assert.equal(got.stop, 'function');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__audio.audio.ctx.state === 'suspended', null, { timeout: 5000 });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__audio.audio.ctx.state === 'running', null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.unlocks), ['running']); // once
    await page.goto(`${base}?mute`); assert.equal(await page.evaluate(() => window.__audio.audio.muted), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
