// The inert stubs 3e ships so boot's render pipeline runs before 3f/3g land (overview §4.6). Their owners replace them
// wholesale; these tests pin only the surface boot relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewSync } from '../src/view/sync/index.js';
import { createAudio } from '../src/view/audio/index.js';

const fns = (o, names) => { for (const n of names) assert.equal(typeof o[n], 'function', `${n} is a function`); };

test('stub createViewSync has the §4.9 surface plus root and dispose, takes view, and draws nothing', () => {
  const s = createViewSync({}, { gfx: null, assets: null, compiler: null, view: { dt: 0 } });
  fns(s, ['frame', 'objectOf', 'on', 'dispose']); assert.equal(s.root, null);
  assert.equal(s.frame(0.5), undefined);
  assert.equal(s.objectOf({ id: 1 }), undefined);
  const off = s.on('#pig', {}); assert.equal(typeof off, 'function'); off(); s.dispose();
});
test('stub createAudio has the §4.9 audio surface and stays silent', async () => {
  const a = createAudio({ doc: null, flags: {} });
  fns(a, ['onUnlock', 'load', 'play', 'mute', 'dispose']);
  assert.equal(a.ctx, null); assert.equal(a.master, null); assert.equal(a.unlocked, false);
  assert.equal(typeof a.onUnlock(() => {}), 'function');
  assert.equal(await a.load('x.mp3'), null); assert.equal(a.play(null, {}), null);
  a.mute(true); a.dispose();
});
