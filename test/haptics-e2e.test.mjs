// test/haptics-e2e.test.mjs
// Real-Chromium run of the haptics lifecycle and the ?debug=pads bench on the fake pads (C-14, D-7, T-24).
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
const WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';
const ZERO = { op: 'playEffect', type: 'dual-rumble', params: { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 } };
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/rumble.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'rumble.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/fixtures/rumble.html'), 'text/html'], '/rumble.bundle.js': [path.join(out, 'rumble.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

test('a pausing overlay stops a rumbling fake pad: a first-sight stop, then 20 zero dual-rumble effects each followed by a reset (C-14, T-24)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.frames(3);
    assert.deepEqual((await game.haptics(0)).calls, [ZERO, { op: 'reset' }], 'seen for the first time: a full stop (S3)');
    await game.page.evaluate(() => window.lhView.localPlayers[0].pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 5000, strongMagnitude: 1, weakMagnitude: 1 }));
    await game.page.evaluate(() => window.engine.overlay('pause'));
    await game.frames(30);
    const calls = (await game.haptics(0)).calls.slice(3);
    assert.deepEqual(calls, Array.from({ length: 20 }, () => [ZERO, { op: 'reset' }]).flat());
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('game.unplug fires gamepaddisconnected and the seat marks the pad lost (T-24, C-9)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.pad(1, { id: 'Pad B' }); await game.frames(3);
    await game.unplug(1); await game.frames(3);
    const seat = await game.page.evaluate(() => { const lp = window.lhView.localPlayers[0]; return { lost: lp.lost, pads: lp.devices.filter(d => d.kind === 'pad').map(d => [d.index, d.lost]) }; });
    assert.deepEqual(seat, { lost: true, pads: [[0, false], [1, true]] });
  } finally { await game.close(); }
});

test('?debug=pads opens the bench on a real page: seats, pads, and a body effect on the selected pad (D-7)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base, { query: { debug: 'pads' } });
  try {
    await game.pad(0, {}); await game.pad(1, { id: WHEEL, mapping: '' }); await game.frames(3);
    const seats = game.page.locator('[data-lh-bench] [data-bench="seats"]');
    await seats.waitFor();
    const text = await seats.textContent();
    assert.ok(text.includes('P1 · seat 0') && text.includes('mapping "standard"') && text.includes(`pad 1 "${WHEEL}" mapping ""`), text);
    await game.page.locator('[data-lh-bench] [data-hap="dual"]').click(); await game.frames(2);
    assert.deepEqual((await game.haptics(0)).calls.at(-1), { op: 'playEffect', type: 'dual-rumble', params: { startDelay: 0, duration: 400, strongMagnitude: 1, weakMagnitude: 0.5 } });
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
