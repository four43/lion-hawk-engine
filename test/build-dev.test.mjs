import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { dev } from '../tools/dev/index.js';
import { copyFixture } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error('timed out'); };
const sse = url => {
  const events = [];
  const req = http.get(url, res => res.on('data', c => { if (String(c).includes('data: reload')) events.push(Date.now()); }));
  return { events, close: () => req.destroy() };
};

test('3d: dev serves the live page, baked models as assets/models and no service worker; a model edit re-bakes and reloads', async t => {
  const game = copyFixture(), logs = [];
  const d = await dev({ game, port: 0, host: '127.0.0.1', log: m => logs.push(m) });
  t.after(() => d.close());
  const page = await until(async () => { const h = await (await fetch(d.url)).text(); return h.includes('globalThis.fixture') && h; });
  assert.match(page, /new EventSource\('\/lh-reload'\)/);
  assert.match(page, /__HOOK__/);
  const glb = Buffer.from(await (await fetch(`${d.url}assets/models/crate.glb`)).arrayBuffer());
  assert.ok(glb.equals(readFileSync(join(game, 'baked/models/crate.glb'))));
  assert.equal((await fetch(`${d.url}sw.js`)).status, 404);
  assert.equal((await fetch(`${d.url}manifest.webmanifest`)).status, 200);
  const s = sse(`${d.url}lh-reload`); t.after(() => s.close());
  await new Promise(r => setTimeout(r, 200));
  const bytes = await build('cart');
  writeFileSync(join(game, 'assets/models/crate.glb'), bytes);
  await until(() => s.events.length > 0);
  const phys = JSON.parse(readFileSync(join(game, 'baked/phys.json'), 'utf8'));
  assert.equal(phys.models.crate.source.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(phys.models.crate.parts, ['body', 'wheel', 'mast', 'lamp001', 'lamp001-2']);
  assert.ok(logs.some(l => /^baked crate:/.test(l)));
});
test('3d: a template edit rebuilds the page', async t => {
  const game = copyFixture(), d = await dev({ game, port: 0, host: '127.0.0.1', log: () => {} });
  t.after(() => d.close());
  await until(async () => (await (await fetch(d.url)).text()).includes('globalThis.fixture'));
  writeFileSync(join(game, 'template.html'), readFileSync(join(game, 'template.html'), 'utf8').replace('<title>fixture</title>', '<title>edited</title>'));
  await until(async () => (await (await fetch(d.url)).text()).includes('<title>edited</title>'));
});
test('3d: a malformed URL gets 400 and a directory request 404, and the server keeps serving', async t => {
  const game = copyFixture(), d = await dev({ game, port: 0, host: '127.0.0.1', log: () => {} });
  t.after(() => d.close());
  const get = path => new Promise((res, rej) => http.request({ host: '127.0.0.1', port: d.port, path }, r => { r.resume(); r.on('end', () => res(r.statusCode)); }).on('error', rej).end());
  assert.equal(await get('/%'), 400);
  assert.equal(await get('/assets/models/'), 404);
  assert.equal(await get('/'), 200);
});
