import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { resolveOut, UsageError } from '../tools/build/out.js';
import { fillTemplate, stampPage, stampWorker } from '../tools/build/page.js';

const cfg = { dir: '/w/four43/games/tractor-pickup', outEnv: 'TRACTOR_OUT', site: 'tractor-pickup' };

test('3d: --out wins over $<outEnv>; neither is a usage error naming the variable', () => {
  assert.equal(resolveOut({ cfg, out: '/scratch/a', env: { TRACTOR_OUT: '/scratch/b' } }), '/scratch/a');
  assert.equal(resolveOut({ cfg, env: { TRACTOR_OUT: '/scratch/b' } }), '/scratch/b');
  assert.equal(resolveOut({ cfg, out: 'rel', env: {} }), resolve('rel'));
  assert.throws(() => resolveOut({ cfg, env: {} }), e => e instanceof UsageError && e.message === 'build: pass --out or set $TRACTOR_OUT');
});
test('3d: any path under site/exp/ is refused without --site (constraint 8); --site alone means the default site dir', () => {
  for (const out of ['/w/four43/site/exp/tractor-pickup', '/w/four43/site/exp', '/tmp/x/site/exp/a/b'])
    assert.throws(() => resolveOut({ cfg, out, env: {} }), e => e instanceof UsageError && /under site\/exp\/; only a deploy passes --site/.test(e.message), out);
  assert.throws(() => resolveOut({ cfg, env: { TRACTOR_OUT: '/w/four43/site/exp/tractor-pickup' } }), UsageError);
  assert.equal(resolveOut({ cfg, out: '/w/four43/site/expo/x', env: {} }), '/w/four43/site/expo/x');
  assert.equal(resolveOut({ cfg, env: {}, site: true }), join('/w/four43/site/exp', 'tractor-pickup'));   // path only; nothing is written
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
