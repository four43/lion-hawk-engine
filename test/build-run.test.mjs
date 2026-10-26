import { tmp } from './helpers/tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { build, ENGINE_VERSION } from '../tools/build/index.js';
import { copyFixture } from './helpers/bakeGame.mjs';

const quiet = () => {};
const scratch = () => tmp('lh-out-');
const runPage = html => { const ctx = { window: {} }; ctx.globalThis = ctx; for (const m of html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)) vm.runInNewContext(m[1], ctx); return JSON.parse(JSON.stringify({ window: ctx.window, fixture: ctx.fixture })); }; // JSON clone: vm-realm arrays fail deepStrictEqual's prototype check

test('3d: build writes the page, the baked models, the PWA files and a stamped sw.js; the bundle runs', async () => {
  const game = copyFixture(), out = scratch(), logs = [];
  const r = await build({ game, out, env: {}, log: m => logs.push(m) });
  assert.deepEqual(readdirSync(out, { recursive: true }).sort(), ['assets', 'assets/models', 'assets/models/cart.glb', 'assets/models/crate.glb',
    'assets/models/palette.glb', 'assets/models/pet.anim.json', 'assets/models/pet.glb', 'assets/models/ramp.glb', 'icon.svg', 'index.html', 'manifest.webmanifest', 'sw.js']);
  for (const f of readdirSync(join(game, 'baked/models'))) assert.ok(readFileSync(join(out, 'assets/models', f)).equals(readFileSync(join(game, 'baked/models', f))));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<meta name="lion-hawk-build" content="fixture 1\\.2\\.3 lion-hawk ${ENGINE_VERSION.replaceAll('.', '\\.')} ${r.hash}">`));
  const page = runPage(html);
  assert.deepEqual(page.fixture.models, ['cart', 'crate', 'palette', 'pet', 'ramp']);
  assert.equal(page.fixture.three, 'game-copy');                                 // dedupe: three from the game root (#11)
  assert.equal(page.fixture.engineThree, 'game-copy');                           // dedupe also redirects the engine-side three
  assert.equal(page.fixture.tag, '</script>');                                   // escaped in the page, intact at runtime
  assert.deepEqual(page.window.__HOOK__, { e2e: false, version: '1.2.3', engine: ENGINE_VERSION, out: 'set' });   // B-2 hooks ran
  assert.equal(html.match(/<script type="module">/g).length, 1);                // D1: the bundle is one inline module
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  assert.match(sw, new RegExp(`'fixture-1\\.2\\.3\\+lh${ENGINE_VERSION.replaceAll('.', '\\.')}-${r.hash}'`));
  assert.ok(sw.includes(`const PRECACHE = ${JSON.stringify(['./', 'assets/models/cart.glb', 'assets/models/crate.glb', 'assets/models/palette.glb', 'assets/models/pet.glb', 'assets/models/pet.anim.json', 'assets/models/ramp.glb', 'icon.svg', 'manifest.webmanifest'])};`));
  assert.equal(r.version, `1.2.3+lh${ENGINE_VERSION}-${r.hash}`);
  assert.equal(r.sizes.html.bytes, Buffer.byteLength(html)); assert.equal(r.sizes.html.gzip, gzipSync(Buffer.from(html)).length);
  assert.ok(r.sizes.total.bytes > r.sizes.html.bytes + r.sizes.assets.bytes);
  assert.ok(logs.some(l => /^\s+total\s/.test(l)) && logs.some(l => /^\s+assets\s/.test(l)));
});
test('3d: $<outEnv> is used when --out is absent; the hash changes when a baked model changes', async () => {
  const game = copyFixture(), out = scratch();
  const a = await build({ game, env: { LH_FIXTURE_OUT: out }, log: quiet });
  assert.ok(existsSync(join(out, 'index.html')));
  const man = JSON.parse(readFileSync(join(game, 'baked/manifest.json'))), glb = readFileSync(join(game, 'baked/models/crate.glb'));
  writeFileSync(join(game, 'baked/models/crate.glb'), Buffer.concat([glb, Buffer.alloc(4)]));
  await assert.rejects(build({ game, out: scratch(), env: {}, log: quiet }), /build: models\/crate\.glb does not match baked\/manifest\.json \(run lion-hawk bake\)/);
  man.models.crate.sha256 = (await import('../tools/bake/write.js')).sha256(readFileSync(join(game, 'baked/models/crate.glb')));
  writeFileSync(join(game, 'baked/manifest.json'), JSON.stringify(man));
  const b = await build({ game, out: scratch(), env: {}, log: quiet });
  assert.notEqual(a.hash, b.hash);
});
test('3d: an e2e build over an earlier normal build drops the stale sw.js (C8); hooks see an existing out dir', async () => {
  const game = copyFixture(), out = scratch();
  await build({ game, out, env: {}, log: quiet });
  assert.ok(existsSync(join(out, 'sw.js')));
  await build({ game, out, env: {}, e2e: true, log: quiet });
  assert.ok(!existsSync(join(out, 'sw.js')));
  const fresh = join(scratch(), 'not-yet');
  await build({ game, out: fresh, env: {}, log: quiet });
  assert.equal(runPage(readFileSync(join(fresh, 'index.html'), 'utf8')).window.__HOOK__.out, 'set');   // out existed when beforePage ran
});
test('3d: --e2e skips minify and the service worker and tells the hooks; an unknown mode is refused', async () => {
  const game = copyFixture(), out = scratch();
  await build({ game, out, env: {}, e2e: true, log: quiet });
  assert.ok(!existsSync(join(out, 'sw.js')));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /sourceMappingURL=data:/);
  assert.equal(runPage(html).window.__HOOK__.e2e, true);
  await assert.rejects(build({ game, out, env: {}, mode: 'frob', log: quiet }), /build: mode must be 'single' or 'shared' \(got 'frob'\)/);
  assert.equal((await build({ game, env: {}, e2e: true, log: quiet })).out, join(game, 'build'));   // no --out, $<outEnv> or build.out
});
