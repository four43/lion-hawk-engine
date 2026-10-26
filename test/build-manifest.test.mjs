// [P-3] build.manifest in game.config.js: the build writes manifest.webmanifest (name, colours, icon), links it from
// the page and precaches it. A hand-written pwa/manifest.webmanifest beside it is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../tools/build/index.js';
import { loadConfig } from '../tools/bake/config.js';
import { copyFixture } from './helpers/bakeGame.mjs';
import { tmp } from './helpers/tmp.mjs';

const quiet = () => {};
const withManifest = (manifest, { keepHandWritten = false } = {}) => {
  const game = copyFixture(), file = join(game, 'game.config.js');
  writeFileSync(file, readFileSync(file, 'utf8').replace("hooks: './build.hooks.js' }", `hooks: './build.hooks.js', manifest: ${JSON.stringify(manifest)} }`));
  if (!keepHandWritten) rmSync(join(game, 'pwa/manifest.webmanifest'));
  return game;
};

test('P-3: build writes manifest.webmanifest from build.manifest, copies the icon, links and precaches it', async () => {
  const game = withManifest({ name: 'Fixture Kart', shortName: 'Kart', themeColor: '#102030', backgroundColor: '#000000', icon: 'pwa/icon.svg', orientation: 'landscape' });
  const out = tmp('lh-out-'), r = await build({ game, out, env: {}, log: quiet });
  const m = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(m, { name: 'Fixture Kart', short_name: 'Kart', start_url: './', scope: './', display: 'fullscreen', orientation: 'landscape',
    theme_color: '#102030', background_color: '#000000', icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] });
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#102030">/);
  assert.ok(r.files.includes('manifest.webmanifest') && r.files.includes('icon.svg'));
  assert.match(readFileSync(join(out, 'sw.js'), 'utf8'), /"manifest\.webmanifest"/);
});
test('P-3: defaults, a template that links the manifest itself, and the hash follows the manifest', async () => {
  const a = withManifest({ name: 'Fixture' }), outA = tmp('lh-out-'), ra = await build({ game: a, out: outA, env: {}, log: quiet });
  const m = JSON.parse(readFileSync(join(outA, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(m, { name: 'Fixture', short_name: 'Fixture', start_url: './', scope: './', display: 'fullscreen' });
  const b = withManifest({ name: 'Fixture 2' }), rb = await build({ game: b, out: tmp('lh-out-'), env: {}, log: quiet });
  assert.notEqual(ra.hash, rb.hash, 'the manifest is part of the content hash');
  const c = withManifest({ name: 'Fixture' }), t = join(c, 'template.html');
  writeFileSync(t, readFileSync(t, 'utf8').replace('<title>', '<link rel="manifest" href="manifest.webmanifest"><title>'));
  const outC = tmp('lh-out-'); await build({ game: c, out: outC, env: {}, log: quiet });
  assert.equal(readFileSync(join(outC, 'index.html'), 'utf8').match(/rel="manifest"/g).length, 1, 'not linked twice');
});
test('P-3: a hand-written pwa manifest beside build.manifest, a bad key or a missing icon is refused', async () => {
  await assert.rejects(build({ game: withManifest({ name: 'x' }, { keepHandWritten: true }), out: tmp('lh-out-'), env: {}, log: quiet }),
    /build: pwa\/manifest\.webmanifest and build\.manifest both make the manifest: keep one/);
  await assert.rejects(build({ game: withManifest({ name: 'x', icon: 'nope.png' }), out: tmp('lh-out-'), env: {}, log: quiet }), /build: build\.manifest\.icon 'nope\.png' does not exist/);
  await assert.rejects(loadConfig(withManifest({ name: 'x', colour: '#fff' })), /config: unknown key 'build\.manifest\.colour'/);
  await assert.rejects(loadConfig(withManifest({ shortName: 'x' })), /config: 'build\.manifest\.name' must be a non-empty string/);
  await assert.rejects(loadConfig(withManifest({ name: 'x', display: 'tv' })), /config: 'build\.manifest\.display' must be one of fullscreen, standalone, minimal-ui, browser/);
});
