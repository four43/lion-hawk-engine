// createRenderer (overview §4.6): the DPR cap by touch, the portrait FOV rule, shadows, tone mapping, resize, one per page.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitView, createRenderer, PORTRAIT_BELOW } from '../src/view/render/renderer.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const fit = (o, opts) => fitView({ cssW: 800, cssH: 600, winW: 0, winH: 0, deviceDpr: 1, touchPoints: 0, ...o }, opts);
const page = ({ w = 390, h = 844, dpr = 3, touch = 5 } = {}) => {
  const ls = {}, doc = {};
  const canvas = { clientWidth: w, clientHeight: h, ownerDocument: doc };
  const target = { innerWidth: w, innerHeight: h, devicePixelRatio: dpr, navigator: { maxTouchPoints: touch }, addEventListener: (t, f) => { ls[t] = f; }, removeEventListener: (t, f) => { if (ls[t] === f) delete ls[t]; } };
  return { canvas, target, ls };
};

test('fitView caps DPR by touch: 1.5 on touch, 2 on desktop, never above the device', () => {
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }).pixelRatio, 1.5);
  assert.equal(fit({ deviceDpr: 3, touchPoints: 1 }).pixelRatio, 2); // one touch point: a desktop touch screen, not an iPad
  assert.equal(fit({ deviceDpr: 1, touchPoints: 5 }).pixelRatio, 1);
  assert.equal(fit({ deviceDpr: 0, touchPoints: 0 }).pixelRatio, 1);
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }, { dpr: 2 }).pixelRatio, 2); // a number caps both
  assert.equal(fit({ deviceDpr: 3, touchPoints: 5 }, { dpr: { touch: 1, desktop: 2 } }).pixelRatio, 1);
});
test('fitView: the portrait FOV starts strictly below aspect 0.9', () => {
  assert.equal(PORTRAIT_BELOW, 0.9);
  assert.equal(fit({ cssW: 90, cssH: 100 }).fov, 60);
  assert.equal(fit({ cssW: 89, cssH: 100 }).fov, 64);
  assert.equal(fit({ cssW: 89, cssH: 100 }, { fov: 48, fovPortrait: 64 }).fov, 64);
  assert.equal(fit({ cssW: 1600, cssH: 900 }, { fov: 48 }).fov, 48);
});
test('fitView falls back to the window size, then 1, while the canvas has no layout', () => {
  const a = fit({ cssW: 0, cssH: 0, winW: 1280, winH: 720 }); assert.deepEqual([a.w, a.h], [1280, 720]);
  const b = fit({ cssW: 0, cssH: 0 }); assert.deepEqual([b.w, b.h, b.aspect], [1, 1, 1]);
});
test('createRenderer applies shadows, tone mapping and the first resize', () => {
  const { canvas, target } = page(), r = fakeRenderer();
  const g = createRenderer({ canvas, target, renderer: r, toneMapping: 'aces', exposure: 1.05 });
  assert.equal(r.shadowMap.enabled, true); assert.equal(r.shadowMap.type, THREE.PCFShadowMap);
  assert.equal(r.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(r.toneMappingExposure, 1.05);
  assert.equal(r.pixelRatio, 1.5); assert.deepEqual(r.log.find(l => l[0] === 'setSize'), ['setSize', 390, 844, false]);
  assert.equal(g.camera.fov, 64); assert.equal(g.camera.userData.lhFov, 64); assert.equal(g.camera.aspect, 390 / 844);
  assert.equal(g.camera.near, 0.3); assert.equal(g.camera.far, 500); assert.deepEqual(g.size, { w: 390, h: 844 });
  assert.equal(g.scene.isScene, true); g.dispose();
});
test('createRenderer defaults: PCF, no tone mapping, exposure 1; shadows: false turns the map off', () => {
  const a = page(), r = fakeRenderer(), g = createRenderer({ canvas: a.canvas, target: a.target, renderer: r });
  assert.equal(r.toneMapping, THREE.NoToneMapping); assert.equal(r.toneMappingExposure, 1); g.dispose();
  const b = page(), r2 = fakeRenderer(), g2 = createRenderer({ canvas: b.canvas, target: b.target, renderer: r2, shadows: false });
  assert.equal(r2.shadowMap.enabled, false); g2.dispose();
});
test('createRenderer rejects unknown shadows and tone mapping by name', () => {
  const { canvas, target } = page();
  assert.throws(() => createRenderer({ canvas, target, renderer: fakeRenderer(), shadows: 'soft' }), /render: shadows must be 'pcf' \| 'vsm' \| 'basic' \| false \(got "soft"\)/);
  assert.throws(() => createRenderer({ canvas, target, renderer: fakeRenderer(), toneMapping: 'filmic' }), /render: toneMapping must be 'none' \| 'aces' \| 'agx' \| 'neutral' \(got "filmic"\)/);
  const g = createRenderer({ canvas, target, renderer: fakeRenderer() }); g.dispose(); // a rejected call left no page claim
});
test('the resize listener follows rotation; dispose removes it', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  p.canvas.clientWidth = 844; p.canvas.clientHeight = 390; p.ls.resize();
  assert.equal(g.camera.fov, 60); assert.deepEqual(g.size, { w: 844, h: 390 }); assert.deepEqual(r.log.at(-1), ['setSize', 844, 390, false]);
  g.dispose(); assert.equal(p.ls.resize, undefined);
});
test('one renderer per page: a second createRenderer on the same document throws until the first is disposed', () => {
  const p = page(), q = page(); q.canvas.ownerDocument = p.canvas.ownerDocument;
  const g = createRenderer({ canvas: p.canvas, target: p.target, renderer: fakeRenderer() });
  assert.throws(() => createRenderer({ canvas: q.canvas, target: q.target, renderer: fakeRenderer() }), /render: this page already has a renderer \(one WebGLRenderer per page\)/);
  g.dispose();
  createRenderer({ canvas: q.canvas, target: q.target, renderer: fakeRenderer() }).dispose();
});
test('render draws once per call, through post when one is set; nothing after dispose; dispose is idempotent', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  g.render(); assert.equal(r.info.render.calls, 1);
  const seen = []; g.post = { render: (s, c) => seen.push(s === g.scene && c === g.camera), dispose() { seen.push('disposed'); } };
  g.render(); assert.equal(r.info.render.calls, 1); assert.deepEqual(seen, [true]);
  g.dispose(); assert.equal(r.disposed, true); assert.deepEqual(seen, [true, 'disposed']); assert.equal(g.post, null);
  g.render(); assert.equal(r.info.render.calls, 1); g.dispose(); assert.equal(r.log.filter(l => l[0] === 'dispose').length, 1);
});
test('gfx.post is the game\'s: clearing or replacing it disposes nothing; gfx.dispose disposes the one set then (3k C5)', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r }), log = [];
  const a = { render: () => log.push('a'), dispose: () => log.push('a gone') }, b = { render: () => log.push('b'), dispose: () => log.push('b gone') };
  g.post = a; g.render(); g.post = b; g.render(); g.post = null; g.render();
  assert.deepEqual(log, ['a', 'b']); assert.equal(r.info.render.calls, 1, 'a plain render once post is null');
  g.post = a; g.dispose(); assert.deepEqual(log, ['a', 'b', 'a gone']); assert.equal(g.post, null);
});
test('info() reads renderer.info into one reused object', () => {
  const p = page(), r = fakeRenderer({ programs: 3 }), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r });
  g.render(); const a = g.info(); assert.equal(a.calls, 1); assert.equal(a.programs, 3); assert.ok(g.info() === a); g.dispose();
});
test('per-frame paths allocate nothing (R-8)', () => {
  const p = page(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: fakeRenderer() });
  for (const f of [g.render, g.info]) assert.doesNotMatch(f.toString(), HOT);
  g.dispose();
});
test('a resize to the same size and pixel ratio does not touch the renderer (the window event and the ResizeObserver both fire)', () => {
  const p = page(), r = fakeRenderer(), g = createRenderer({ canvas: p.canvas, target: p.target, renderer: r }), n = r.log.length;
  g.resize(); p.ls.resize(); assert.equal(r.log.length, n, 'no setSize or setPixelRatio');
  p.canvas.clientWidth = 400; g.resize(); assert.deepEqual(r.log.at(-1), ['setSize', 400, 844, false]);
  g.dispose();
});
