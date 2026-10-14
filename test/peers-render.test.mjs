// #107: peers() pages default to render: 'manual' (?lh-test=render): with 'auto' each manual-stepping SwiftShader page
// renders every rAF and the second page starves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { peers } from 'lion-hawk/playwright';

const fakeBrowser = urls => ({
  newContext: async () => ({
    newPage: async () => ({ on() {}, exposeBinding: async () => {}, addInitScript: async () => {}, goto: async u => { urls.push(u); }, evaluate: async () => 60, waitForFunction: async () => {} }),
    addInitScript: async () => {}, close: async () => {},
  }),
});

test('#107: peers() opens every page with ?lh-test=render by default', async () => {
  const urls = [], room = await peers(fakeBrowser(urls), 'http://x/', 2);
  await room.close();
  assert.equal(urls.length, 2);
  for (const u of urls) assert.equal(new URL(u).searchParams.get('lh-test'), 'render');
  assert.deepEqual(urls.map(u => new URL(u).searchParams.get('lh-bridge')), ['host', 'guest']);
});

test('#107: render: "auto" keeps automatic rendering', async () => {
  const urls = [], room = await peers(fakeBrowser(urls), 'http://x/', 1, { render: 'auto' });
  await room.close();
  assert.equal(new URL(urls[0]).searchParams.get('lh-test'), '');
});
