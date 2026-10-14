// boot with defineView({ render }) (overview §4.6): services built before any half enters, the render slot order
// (reconcile → sync.frame → halves → gfx.render), errors, dispose; without render, boot is exactly 0.7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView } from '../src/view/boot.js';
import { parseFlags } from '../src/core/flags.js';
import game from './fixtures/countdown.js';
import { dom } from './helpers/dom.mjs';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const raf = () => 0, caf = () => {};
const run = ({ render, renderer = fakeRenderer(), canvas = true, frame } = {}) => {
  const { document } = dom(), target = { document, addEventListener() {}, removeEventListener() {} }, log = [];
  let c; if (canvas) { c = document.createElement('canvas'); document.body.appendChild(c); if (renderer) renderer.domElement = c; }
  const title = { enter: (e, v) => log.push(`enter gfx=${v.gfx ? 'yes' : String(v.gfx)}`), frame: frame ?? (() => log.push('frame title')) };
  const view = defineView(render === undefined ? { scenes: { title } } : { scenes: { title }, render });
  const app = boot(game, view, { doc: document, target, raf, caf, flags: parseFlags('?lh-test'), renderer, canvas: c });
  return { app, log, renderer, view };
};

test('without render, defineView and boot are exactly 0.7: no render key, no services, no engine.assets', () => {
  const { app, log, view } = run({ renderer: null });
  assert.deepEqual(Object.keys(view), ['scenes']);
  for (const k of ['gfx', 'materials', 'assets', 'sync', 'audio']) assert.equal(k in app.view, false, k);
  assert.equal('assets' in app.engine, false);
  app.engine.render(0); assert.deepEqual(log, ['enter gfx=undefined', 'frame title']); app.dispose();
});
test('with render, the services exist before the first half enters, and engine.assets is view.assets', () => {
  const { app, log, renderer } = run({ render: { lights: { fog: [60, 200] }, assets: { manifest: { v: 1, models: {} }, base: './assets/' } } });
  assert.deepEqual(log, ['enter gfx=yes']);
  assert.ok(app.view.gfx.renderer === renderer, 'the injected renderer'); assert.equal(app.view.gfx.scene.fog.far, 200);
  assert.ok(app.engine.assets === app.view.assets, 'engine.assets'); assert.equal(typeof app.view.audio.play, 'function');
  app.dispose();
});
test('the render slot runs sync.frame(alpha), then the halves\' frames, then one gfx.render', () => {
  const { app, log, renderer } = run({ render: {} }); log.length = 0;
  app.view.sync.frame = a => log.push(`sync ${a}`);
  const draw = renderer.render; renderer.render = (s, c) => { log.push('draw'); draw(s, c); };
  app.engine.render(0.5); assert.deepEqual(log, ['sync 0.5', 'frame title', 'draw']); app.dispose();
});
test('with gfx.post set, the slot draws through post.render(scene, camera) after the halves, not renderer.render (3k C5)', () => {
  const { app, log, renderer } = run({ render: {} }); log.length = 0;
  const g = app.view.gfx, draws = () => renderer.log.filter(l => l[0] === 'render').length;
  g.post = { render: (s, c) => log.push(`post ${s === g.scene && c === g.camera}`) };
  app.engine.render(0); assert.deepEqual(log, ['frame title', 'post true']); assert.equal(draws(), 0);
  g.post = null; app.engine.render(0); assert.equal(draws(), 1); app.dispose();
});
test('boot passes timer to createEngine (3c, #106)', () => {
  assert.match(boot.toString(), /acks: flags\.lhTest \? 'steps' : 'frames', timer\b/);
});
test('a throwing sync.frame or half is reported; the frame still draws', () => {
  const { app, log, renderer } = run({ render: {}, frame: () => { throw new Error('half bug'); } }); log.length = 0;
  app.view.sync.frame = () => { throw new Error('sync bug'); };
  app.engine.render(0);
  assert.deepEqual(app.hook.errors.map(e => e.message), ['sync bug', 'half bug']);
  assert.equal(renderer.log.filter(l => l[0] === 'render').length, 1); app.dispose();
});
test('defineView validates render by field', () => {
  assert.throws(() => defineView({ scenes: {}, render: { shading: 'toon' } }), /defineView: render\.shading must be physical \| standard \| lambert \(got "toon"\)/);
  assert.throws(() => defineView({ scenes: {}, render: { fps: 1 } }), /defineView: render\.fps is unknown/);
  assert.throws(() => defineView({ scenes: {}, render: { lights: { presets: { night: { sun: { map: 1 } } } } } }), /lights: preset 'night'\.sun\.map is unknown/);
  const v = defineView({ scenes: {}, render: { shading: 'lambert' } }); assert.equal(Object.isFrozen(v.render), true); assert.equal(v.render.shading, 'lambert');
});
test('dispose frees the renderer and clears engine.assets', () => {
  const { app, renderer } = run({ render: {} }); app.dispose();
  assert.equal(renderer.disposed, true); assert.equal(app.engine.assets, undefined);
});
test('no WebGL: boot reports render: …, the halves see gfx null, frames and the UI keep working (RF1)', () => {
  const { app, log } = run({ render: {}, renderer: null });
  assert.equal(app.hook.errors.length, 1); assert.match(app.hook.errors[0].message, /^render: /);
  assert.deepEqual(log, ['enter gfx=null']); assert.equal(app.view.gfx, null);
  app.engine.render(0); assert.deepEqual(log, ['enter gfx=null', 'frame title']);
  app.hook.go('race'); assert.equal(app.engine.scene.name, 'race'); app.dispose();
});
test('render without any canvas throws from boot', () => {
  assert.throws(() => run({ render: {}, renderer: null, canvas: false }), /boot: defineView\(\{ render \}\) needs a canvas/);
});
