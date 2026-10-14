// snapshot (overview §4.6): Tractor Pickup's thumbnail copies (ui/icons.js, ui/stickerArt.js) as one engine helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapshot, alphaBounds, copyRows } from '../src/view/render/snapshot.js';
import { fakeRenderer } from './helpers/fakeRenderer.mjs';
import { fakeDoc } from './helpers/fakeCanvas.mjs';

test('alphaBounds finds the drawn box (alpha strictly above min); empty when nothing is drawn', () => {
  const w = 4, h = 3, px = new Uint8Array(w * h * 4); px[(1 * w + 2) * 4 + 3] = 255; px[(2 * w + 1) * 4 + 3] = 9;
  assert.deepEqual(alphaBounds(px, w, h, 8), { empty: false, x0: 1, y0: 1, x1: 2, y1: 2 });
  px[(2 * w + 1) * 4 + 3] = 8; assert.deepEqual(alphaBounds(px, w, h, 8), { empty: false, x0: 2, y0: 1, x1: 2, y1: 1 });
  assert.equal(alphaBounds(new Uint8Array(w * h * 4), w, h, 8).empty, true);
});
test('copyRows flips GPU rows (bottom-up) to image rows (top-down) and crops columns', () => {
  const w = 3, h = 2, px = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) px[i * 4] = i; // red = pixel index in GPU order
  const reds = a => [...a].filter((_, i) => i % 4 === 0);
  assert.deepEqual(reds(copyRows(px, w, 0, 0, 2, 1, new Uint8Array(w * h * 4))), [3, 4, 5, 0, 1, 2]);
  assert.deepEqual(reds(copyRows(px, w, 1, 0, 2, 1, new Uint8Array(2 * 2 * 4))), [4, 5, 1, 2]);
});
test('snapshot renders the object alone into a clear target and restores the renderer and the object\'s parent', () => {
  const doc = fakeDoc(), r = fakeRenderer({ doc, pixels: (px, w) => { for (let y = 1; y < 3; y++) for (let x = 2; x < 5; x++) px[(y * w + x) * 4 + 3] = 255; } });
  r.setClearColor(0x123456, 0.5); const prev = { isRenderTarget: true }; r.setRenderTarget(prev); r.log.length = 0;
  const home = new THREE.Group(), obj = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); home.add(obj);
  const info = {}, url = snapshot(r, obj, { size: 8, crop: true, out: info });
  const draw = r.log.find(l => l[0] === 'render');
  assert.ok(draw[3]?.isWebGLRenderTarget, 'drawn into a render target'); assert.ok(draw[1].isScene && draw[1] !== home, 'in the studio scene');
  assert.ok(r.log.some(l => l[0] === 'clear' && l[1] === draw[3]), 'the target was cleared first');
  assert.ok(r.getRenderTarget() === prev, 'the previous target is back'); assert.equal(r.clearColor, 0x123456); assert.equal(r.clearAlpha, 0.5);
  assert.ok(obj.parent === home, 'the object is back home');
  assert.deepEqual(info, { w: 3, h: 2 }); assert.equal(url, 'data:image/png;fake,3x2');
});
test('a crop that finds nothing is an empty string and 0x0', () => {
  const info = {};
  assert.equal(snapshot(fakeRenderer({ doc: fakeDoc() }), new THREE.Group(), { size: 4, crop: true, out: info }), '');
  assert.deepEqual(info, { w: 0, h: 0 });
});
test('outline grows the picture by the border and stamps the silhouette under the art (stickerArt)', () => {
  const doc = fakeDoc(), info = {};
  snapshot(fakeRenderer({ doc, pixels: px => { px[3] = 255; } }), new THREE.Group(), { size: 4, crop: true, outline: { px: 11 }, out: info });
  assert.deepEqual(info, { w: 23, h: 23 });
  const last = doc.canvases.at(-1), draws = last.ops.filter(o => o[0] === 'draw');
  assert.equal(draws.length, 49); assert.deepEqual(draws.at(-1).slice(2), [11, 11]); // 2 rings x 24 stamps, then the art on top
});
test('auto-framing: yaw turns the object, pitch raises the camera; the object\'s transform is untouched; a given camera is used as is', () => {
  const r = fakeRenderer({ doc: fakeDoc() }), obj = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  obj.position.set(5, 0, 0);
  snapshot(r, obj, { size: 8, yaw: Math.PI / 2, pitch: 0 });
  const cam = r.log.find(l => l[0] === 'render')[2], d = Math.sqrt(3) / Math.sin(28 * Math.PI / 360) * 1.02;
  assert.ok(Math.abs(cam.position.x) < 1e-9 && Math.abs(cam.position.y) < 1e-9 && Math.abs(cam.position.z - (-5 + d)) < 1e-9, cam.position.toArray().join());
  assert.deepEqual(obj.position.toArray(), [5, 0, 0]); assert.equal(obj.rotation.y, 0); assert.ok(obj.parent === null, 'detached');
  const own = new THREE.PerspectiveCamera(); snapshot(r, obj, { size: 8, camera: own });
  assert.ok(r.log.filter(l => l[0] === 'render').at(-1)[2] === own);
});
test('size [w, h] is a non-square picture (3l CI-13): a w x h target and read, the framing aspect w/h, out w x h', () => {
  const r = fakeRenderer({ doc: fakeDoc() }), info = {};
  const url = snapshot(r, new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), { size: [480, 360], out: info });
  const draw = r.log.find(l => l[0] === 'render'), read = r.log.find(l => l[0] === 'read');
  assert.deepEqual([draw[3].width, draw[3].height], [480, 360]); assert.deepEqual(read.slice(2), [480, 360]);
  assert.equal(draw[2].aspect, 480 / 360); assert.deepEqual(info, { w: 480, h: 360 }); assert.equal(url, 'data:image/png;fake,480x360');
});
test('a non-square crop walks GPU rows of width w (3l CI-13)', () => {
  const doc = fakeDoc(), info = {}, seen = [];
  snapshot(fakeRenderer({ doc, pixels: (px, w, h) => { seen.push(w, h); px[((h - 1) * w + w - 1) * 4 + 3] = 255; } }), new THREE.Group(), { size: [6, 4], crop: true, out: info });
  assert.deepEqual(seen, [6, 4]); assert.deepEqual(info, { w: 1, h: 1 }); // the top-right pixel only
});
test('a portrait size frames by the horizontal field of view; a bad size throws', () => {
  const r = fakeRenderer({ doc: fakeDoc() }), obj = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  snapshot(r, obj, { size: [100, 200], pitch: 0 });
  const cam = r.log.find(l => l[0] === 'render')[2], d = Math.sqrt(3) / Math.sin(Math.atan(Math.tan(28 * Math.PI / 360) * 0.5)) * 1.02;
  assert.equal(cam.aspect, 0.5); assert.ok(Math.abs(cam.position.z - d) < 1e-9, `${cam.position.z} vs ${d}`);
  for (const size of [0, 2.5, [480], [480, 0], [480, 360.5], '256']) assert.throws(() => snapshot(r, obj, { size }), /snapshot: size must be a positive integer or \[w, h\] of positive integers/);
});
