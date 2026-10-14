// createPipeline (overview §4.6): boot's render services, the frame order hooks, dispose, and the no-WebGL path (RF1).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPipeline, checkRender } from '../src/view/render/pipeline.js';
import { createEngine } from '../src/core/engine.js';
import game from './fixtures/countdown.js';
import { dom } from './helpers/dom.mjs';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const MANIFEST = { v: 1, models: {} }; // a baked manifest with no models: enough for the stub and for 3f's createAssets
const setup = (render = {}, { renderer = fakeRenderer(), withCanvas = true } = {}) => {
  const { document } = dom(), engine = createEngine(game, {}), view = { doc: document }, errors = [];
  const canvas = withCanvas ? document.createElement('canvas') : null; if (canvas) document.body.appendChild(canvas);
  if (renderer && canvas) renderer.domElement = canvas;
  const make = () => createPipeline(engine, view, render, { doc: document, target: { addEventListener() {}, removeEventListener() {} }, canvas: canvas ?? undefined, renderer, flags: {}, report: e => errors.push(e.message) });
  return { engine, view, errors, renderer, make };
};

test('builds gfx with lights and warm, the compiler, assets, sync and audio; engine.assets is view.assets', () => {
  const s = setup({ shading: 'lambert', assets: { manifest: MANIFEST } }), pipe = s.make(), g = s.view.gfx;
  assert.ok(g.renderer === s.renderer && g.scene.isScene && g.camera.isPerspectiveCamera, 'gfx parts');
  for (const k of ['resize', 'render', 'warm', 'info', 'dispose']) assert.equal(typeof g[k], 'function', k);
  assert.ok(g.scene.children.includes(g.lights.hemi), 'the light rig is in the scene');
  assert.equal(s.view.materials.shading, 'lambert');
  for (const k of ['assets', 'sync', 'audio']) assert.ok(s.view[k] && typeof s.view[k] === 'object', k);
  assert.ok(s.engine.assets === s.view.assets, 'engine.assets'); assert.deepEqual(s.errors, []);
  pipe.dispose();
});
test('without render.assets there is no createAssets: view.assets null, engine.assets undefined, the rest is built', () => {
  const s = setup(), pipe = s.make();
  assert.equal(s.view.assets, null); assert.equal(s.engine.assets, undefined);
  assert.ok(s.view.gfx && s.view.sync && s.view.materials, 'gfx, sync and compiler'); pipe.frame(0); pipe.draw(); pipe.dispose();
});
test('the sync is built with the view (3g #1); the source passes it', () => {
  assert.match(createPipeline.toString(), /createViewSync\(engine, \{[^}]*, view \}\)/);
});
test('render.paint reaches the compiler as paint (3f C11); the source passes it', () => {
  const s = setup({ paint: { base: 'steel', shade: [0.25, 0.85, 1.1] } }), pipe = s.make(); // the stub accepts it
  assert.ok(s.view.materials, 'compiler built'); assert.deepEqual(s.errors, []);
  assert.match(createPipeline.toString(), /createMaterialCompiler\([^)]*paint: render\.paint/);
  pipe.dispose();
});
test('lights: false builds no rig, background or fog; shading defaults to physical', () => {
  const s = setup({ lights: false }), pipe = s.make();
  assert.equal(s.view.gfx.lights, null); assert.equal(s.view.gfx.scene.children.length, 0); assert.equal(s.view.materials.shading, 'physical');
  assert.equal(s.view.gfx.scene.background, null); assert.equal(s.view.gfx.scene.fog, null);
  pipe.dispose();
});
test('frame runs view.sync.frame(alpha); draw renders the scene with the camera once', () => {
  const s = setup(), pipe = s.make(), log = [];
  s.view.sync.frame = a => log.push(a);
  pipe.frame(0.25); pipe.draw();
  assert.deepEqual(log, [0.25]);
  const draws = s.renderer.log.filter(l => l[0] === 'render'); assert.equal(draws.length, 1);
  assert.ok(draws[0][1] === s.view.gfx.scene && draws[0][2] === s.view.gfx.camera, 'scene and camera');
  for (const f of [pipe.frame, pipe.draw]) assert.doesNotMatch(f.toString(), HOT);
  pipe.dispose();
});
test('gfx.warm compiles the compiler\'s materials and the ones it is given', async () => {
  const s = setup(), pipe = s.make(), made = new THREE.MeshLambertMaterial(), extra = new THREE.MeshPhongMaterial();
  made.userData.lhUse = 'plain'; s.view.materials.made = () => [{ material: made, use: 'plain' }]; // 3f C5's shape
  await s.view.gfx.warm({ materials: [extra] });
  const [, seen] = s.renderer.log.find(l => l[0] === 'compileAsync');
  assert.ok(seen.some(o => o.material === made) && seen.some(o => o.material === extra), 'both on the warm group');
  pipe.dispose();
});
test('a renderer that cannot start is reported once as render: …; the page runs on without gfx (RF1)', () => {
  const s = setup({}, { renderer: null }), pipe = s.make(); // happy-dom canvas: three cannot create a WebGL context
  assert.equal(s.errors.length, 1); assert.match(s.errors[0], /^render: .*WebGL context/);
  for (const k of ['gfx', 'materials', 'assets', 'sync']) assert.equal(s.view[k], null, k);
  assert.equal(s.engine.assets, undefined); assert.equal(typeof s.view.audio.play, 'function');
  pipe.frame(0.5); pipe.draw(); pipe.dispose(); pipe.dispose();
});
test('no canvas anywhere is a programming error', () => {
  const s = setup({}, { renderer: null, withCanvas: false });
  assert.throws(() => s.make(), /boot: defineView\(\{ render \}\) needs a canvas/);
});
test('dispose frees everything once, in reverse, and stops drawing', () => {
  const s = setup({ assets: { manifest: MANIFEST } }), pipe = s.make(), order = [], scene = s.view.gfx.scene;
  s.view.sync.dispose = () => order.push('sync'); s.view.assets.dispose = () => order.push('assets');
  s.view.materials.dispose = () => order.push('materials'); s.view.audio.dispose = () => order.push('audio');
  pipe.dispose(); pipe.dispose();
  assert.deepEqual(order, ['sync', 'assets', 'materials', 'audio']);
  assert.equal(s.renderer.disposed, true); assert.equal(scene.children.length, 0, 'lights removed'); assert.equal(s.engine.assets, undefined);
  pipe.draw(); assert.equal(s.renderer.log.filter(l => l[0] === 'render').length, 0);
});
test('checkRender names the field', () => {
  checkRender(undefined); checkRender({});
  assert.throws(() => checkRender(1), /defineView: render must be an object/);
  assert.throws(() => checkRender({ fps: 1 }), /defineView: render\.fps is unknown \(known: shading, dpr/);
  assert.throws(() => checkRender({ shading: 'toon' }), /defineView: render\.shading must be physical \| standard \| lambert \(got "toon"\)/);
  assert.throws(() => checkRender({ shadows: 'soft' }), /render: shadows must be/);
  assert.throws(() => checkRender({ toneMapping: 'filmic' }), /render: toneMapping must be/);
  assert.throws(() => checkRender({ dpr: 0 }), /defineView: render\.dpr must be a number above 0 or \{ touch, desktop \}/);
  assert.throws(() => checkRender({ dpr: { phone: 1 } }), /defineView: render\.dpr must be/);
  assert.throws(() => checkRender({ camera: { zoom: 2 } }), /defineView: render\.camera\.zoom is unknown/);
  assert.throws(() => checkRender({ assets: { url: 'x' } }), /defineView: render\.assets\.url is unknown \(known: manifest, base, decoders\)/);
  assert.throws(() => checkRender({ assets: { base: './a/' } }), /defineView: render\.assets\.manifest is required \(the baked manifest\.json\)/);
  assert.throws(() => checkRender({ lights: true }), /lights: options must be an object/);
  assert.throws(() => checkRender({ paint: 'red' }), /defineView: render\.paint must be \{ base, shade \}/);
  assert.throws(() => checkRender({ paint: { color: 'red' } }), /defineView: render\.paint\.color is unknown \(known: base, shade\)/);
  assert.throws(() => checkRender({ paint: { base: '' } }), /defineView: render\.paint\.base must be a material id \(got ""\)/);
  assert.throws(() => checkRender({ paint: { shade: [1, 2] } }), /defineView: render\.paint\.shade must be \[floor, gain, max\] numbers \(got \[1,2\]\)/);
  assert.throws(() => checkRender({ paint: { shade: [0, 1, NaN] } }), /render\.paint\.shade must be/);
  assert.throws(() => checkRender({ lights: { presets: { night: { sun: { map: 1 } } } } }), /lights: preset 'night'\.sun\.map is unknown/);
  checkRender({ shading: 'standard', dpr: { touch: 1, desktop: 2 }, shadows: false, toneMapping: 'aces', exposure: 1.05, camera: { fov: 48 }, lights: false, assets: { manifest: {}, base: './a/', decoders: {} }, paint: { base: 'chassis', shade: [0.25, 0.85, 1.1] } });
  checkRender({ paint: {} }); checkRender({ paint: { base: 'steel' } }); // either key may be left to the compiler's default
});
