// The inert stubs 3e ships so boot's render pipeline runs before 3f/3g land (overview §4.6). Their owners replace them
// wholesale; these tests pin only the surface boot relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssets } from '../src/view/assets/index.js';
import { createViewSync } from '../src/view/sync/index.js';
import { createAudio } from '../src/view/audio/index.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';

const fns = (o, names) => { for (const n of names) assert.equal(typeof o[n], 'function', `${n} is a function`); };

test('stub createAssets has the §4.7 surface and is inert', async () => {
  const a = createAssets({ manifest: null, base: './assets/', compiler: null, renderer: null, gfx: null });
  fns(a, ['preload', 'has', 'get', 'clone', 'dispose']);
  assert.deepEqual(a.progress, { loaded: 0, total: 0, bytes: 0 });
  assert.equal(await a.preload(['pig']), undefined);
  assert.equal(a.has('pig'), false);
  assert.throws(() => a.get('pig'), /assets: 'pig' is not preloaded/);
  assert.throws(() => a.clone('pig', {}), /assets: 'pig' is not preloaded/);
  a.dispose();
});
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
test('stub createMaterialCompiler has the §4.8 surface plus made(); get/paint/coverage say 3f', () => {
  const mc = createMaterialCompiler(undefined, { shading: 'lambert', paint: { base: 'chassis', shade: [0.25, 0.85, 1.1] } }); // render.paint (3f C11)
  fns(mc, ['get', 'paint', 'coverage', 'extend', 'apply', 'furGeometry', 'keys', 'made', 'dispose']);
  assert.equal(mc.shading, 'lambert'); assert.equal(createMaterialCompiler().shading, 'physical'); assert.deepEqual(mc.time, { value: 0 });
  for (const f of ['get', 'paint', 'coverage', 'extend']) assert.throws(() => mc[f]('steel'), /materials: the compiler lands in 3f/);
  const root = {}; assert.ok(mc.apply(root, {}) === root);
  const g = {}; assert.ok(mc.furGeometry(g) === g);
  assert.deepEqual(mc.keys(), []); assert.deepEqual([...mc.made()], []); mc.dispose();
});
