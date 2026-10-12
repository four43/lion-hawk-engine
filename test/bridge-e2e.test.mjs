// Real-Chromium pages as host and guest through the Node bridge (N-2 bridge, T-20): peers() joins them over one hub.
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { launch, peers } from 'lion-hawk/playwright';
import { encodeFrame } from '../src/index.sim.js';
import { PING } from './fixtures/relay.js';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results');
let server, base, chrome, skip = false;

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'test/fixtures/relay.view.js')], bundle: true, format: 'iife', outfile: path.join(out, 'relay.bundle.js'), logLevel: 'silent' });
  const files = { '/': [path.join(root, 'test/fixtures/relay.html'), 'text/html'], '/relay.bundle.js': [path.join(out, 'relay.bundle.js'), 'text/javascript'] };
  server = http.createServer((req, res) => {
    const f = files[new URL(req.url, 'http://x').pathname];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': f[1] }).end(fs.readFileSync(f[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

const logOf = (game, type) => game.page.evaluate(t => window.engine.scene.state.log.filter(c => c.type === t).map(c => c.data), type);

test('2g: two pages play host and guest through the Node bridge (T-20)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 2);
  try {
    const [host, guest] = room.games;
    await room.step(30);
    assert.ok((await guest.state()).logged > 1, 'the guest logged net.open and the host\'s says');
    assert.ok((await host.state()).n >= 29, 'the host stepped');
    await host.close(); await room.step(2);
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});

test('2g: the bridge is deterministic: says arrive one step after they are sent, stamped on the hub clock (T-20)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 2);
  try {
    const [host, guest] = room.games;
    await room.step(5);
    const [open] = await logOf(guest, 'net.open'), [hOpen] = await logOf(host, 'net.open');
    assert.deepEqual([open.role, open.id, open.hostId], ['guest', 'g2', 'h1']);
    assert.deepEqual([hOpen.role, hOpen.id, hOpen.hostId], ['host', 'h1', 'h1']);
    assert.deepEqual((await logOf(host, 'net.peer')).map(p => [p.event, p.id]), [['peer', 'g2']]);
    // step 1 delivers the peer events and the host says 1; it says n at step n, and each lands at the next step (as mp())
    assert.deepEqual((await logOf(guest, 'guest.say')).map(s => [s.n, s.from, s.reliable]), [[1, 'h1', true], [2, 'h1', true], [3, 'h1', true], [4, 'h1', true]]);
    assert.equal(room.hub.now, 5 * 1000 / 60);
  } finally { await room.close(); }
});

test('2g: a binary frame arrives byte-identical as an ArrayBuffer (N-2 copy semantics)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 2);
  try {
    const [, guest] = room.games;
    await room.step(13); // the host sends its first frame at step 10; it lands at step 11
    const want = [...new Uint8Array(encodeFrame({ key: true, sender: 1, time: 10, groups: [{ kind: PING, records: [[1, { n: 10 }]], removed: [] }] }))];
    assert.deepEqual(await guest.page.evaluate(() => window.bytes), [want]);
    const [fr] = await logOf(guest, 'net.frame');
    assert.equal(fr.frame.groups[0].kind, 'ping'); assert.equal(fr.from, 'h1');
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});

test('2g: a guest that closes leaves the hub (the host hears peerLeft); argsOf gives each page its own args', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 3, { args: { who: 'all' }, argsOf: i => ({ who: i }) });
  try {
    const [host, g1, g2] = room.games;
    assert.deepEqual([(await host.scene()).args, (await g1.scene()).args, (await g2.scene()).args], [{ who: 0 }, { who: 1 }, { who: 2 }]);
    await room.step(3); await g1.close(); await room.step(2);
    const ev = (await logOf(host, 'net.peer')).map(p => [p.event, p.id, p.reason ?? null]);
    assert.deepEqual(ev, [['peer', 'g2', null], ['peer', 'g3', null], ['peerLeft', 'g2', 'left']]);
    assert.ok((await logOf(g2, 'guest.say')).length >= 3, 'the other guest keeps hearing the host');
    assert.deepEqual(await host.errors(), []);
  } finally { await room.close(); }
});

test('2g: without argsOf every page boots with args; a guest that leaves through its port leaves the hub', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, base, 2, { args: { who: 'all' } });
  try {
    const [host, guest] = room.games;
    assert.deepEqual([(await host.scene()).args, (await guest.scene()).args], [{ who: 'all' }, { who: 'all' }]);
    await room.step(2);
    await guest.page.evaluate(() => { window.engine.scene.state.leave = true; }); await room.step(3); // the sim's e.net.leave(), sent by the port
    assert.deepEqual((await logOf(host, 'net.peer')).map(p => [p.event, p.id]), [['peer', 'g2'], ['peerLeft', 'g2']]);
    assert.deepEqual((await logOf(guest, 'net.peer')).filter(p => p.event === 'closed').map(p => p.reason), ['left']);
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});
