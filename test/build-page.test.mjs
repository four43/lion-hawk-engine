import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { resolveOut } from '../tools/build/out.js';
import { fillTemplate, stampPage, stampWorker } from '../tools/build/page.js';

const cfg = { dir: '/w/games/kart', outEnv: 'KART_OUT', build: {} };

test('3d: --out wins over $<outEnv>, which wins over build.out; with none of them the build goes to <game>/build', () => {
  const withOut = { ...cfg, build: { out: '../web/kart' } };
  assert.equal(resolveOut({ cfg: withOut, out: '/scratch/a', env: { KART_OUT: '/scratch/b' } }), '/scratch/a');
  assert.equal(resolveOut({ cfg: withOut, env: { KART_OUT: '/scratch/b' } }), '/scratch/b');
  assert.equal(resolveOut({ cfg: withOut, env: {} }), '/w/games/web/kart');   // build.out is relative to the game dir
  assert.equal(resolveOut({ cfg, out: 'rel', env: {} }), resolve('rel'));
  assert.equal(resolveOut({ cfg, env: {} }), '/w/games/kart/build');
});
test('3d: <!--APP--> becomes an inline module script with </script escaped (D1); no marker, or one inside a <script>, fails', () => {
  assert.equal(fillTemplate('<body><!--APP--></body>', 'a("</script>");$&'), '<body><script type="module">a("<\\/script>");$&</script></body>');
  assert.throws(() => fillTemplate('<script>/*BUNDLE*/</script>', 'x'), /build: the template has no <!--APP--> marker/);
  assert.throws(() => fillTemplate('<script><!--APP--></script>', 'x'), /build: <!--APP--> sits inside a <script>; remove that tag \(the build writes <script type="module">\)/);
});
test('3d: B-5 stamps: a meta tag after <head>, and sw.js __VERSION__ and __PRECACHE__', () => {
  const html = stampPage('<html><head lang="en"><title>t</title></head></html>', { id: 'g', version: '1.2.3', engine: '0.8.0', hash: 'abc123def456' });
  assert.equal(html, '<html><head lang="en">\n<meta name="lion-hawk-build" content="g 1.2.3 lion-hawk 0.8.0 abc123def456"><title>t</title></head></html>');
  const sw = stampWorker("const C = 'g-__VERSION__';\nconst P = __PRECACHE__;", { version: '1.2.3', engine: '0.8.0', hash: 'abc', precache: ['./', 'assets/models/a.glb'] });
  assert.equal(sw, "const C = 'g-1.2.3+lh0.8.0-abc';\nconst P = [\"./\",\"assets/models/a.glb\"];");
  assert.throws(() => stampWorker("const C = '__VERSION__';", { version: '1', engine: '0', hash: 'h', precache: [] }), /pwa\/sw\.js has no __PRECACHE__/);
});
