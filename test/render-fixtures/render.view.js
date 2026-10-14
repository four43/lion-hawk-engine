// Browser entry for test/e2e-render.test.mjs: the countdown game with defineView({ render }). The title view puts a red box
// at the origin in front of the sky and a hidden toon sphere (a material nothing visible uses). window.__fx holds the hooks
// the test calls. Each pixel read draws a frame and reads it in the same task (no preserveDrawingBuffer).
import * as THREE from 'three';
import { boot, defineView } from '../../src/view/boot.js';
import { snapshot } from '../../src/view/render/snapshot.js';
import { programCount } from '../../src/view/render/hygiene.js';
import { createTiltShift } from '../../src/view/render/tiltShift.js';
import countdown from '../fixtures/countdown.js';

const fx = window.__fx = { view: null };
const title = {
  enter(engine, view) {
    fx.view = view;
    if (!view.gfx) return;
    const { scene, camera } = view.gfx;
    camera.position.set(0, 1.5, 5); camera.lookAt(0, 0.5, 0);
    fx.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ff0000' }));
    fx.box.position.y = 0.5; fx.box.castShadow = true;
    fx.hidden = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshToonMaterial({ color: '#00ff00' })); fx.hidden.visible = false;
    scene.add(fx.box, fx.hidden);
  },
};
fx.size = () => {
  const g = fx.view.gfx, gl = g.renderer.getContext();
  return { fov: g.camera.fov, lhFov: g.camera.userData.lhFov, pr: g.renderer.getPixelRatio(), bw: gl.drawingBufferWidth, bh: gl.drawingBufferHeight, w: g.size.w, h: g.size.h, touch: navigator.maxTouchPoints, dpr: devicePixelRatio };
};
fx.pixel = (x, y) => { // CSS px from the top-left
  const g = fx.view.gfx, gl = g.renderer.getContext(), pr = g.renderer.getPixelRatio(), out = new Uint8Array(4);
  window.engine.render(0);
  gl.readPixels(Math.floor(x * pr), gl.drawingBufferHeight - 1 - Math.floor(y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return [...out];
};
fx.programs = () => programCount(fx.view.gfx.renderer);
fx.warm = async () => {
  const g = fx.view.gfx, before = programCount(g.renderer), extra = new THREE.MeshPhongMaterial({ color: '#0000ff' });
  extra.userData.lhUse = 'instanced';
  await g.warm({ materials: [extra] });
  return { before, after: programCount(g.renderer), hidden: fx.hidden.visible };
};
fx.snap = (opts = {}) => {
  const g = fx.view.gfx, info = {}, alpha = g.renderer.getClearAlpha();
  const url = snapshot(g.renderer, fx.box, { size: 64, ...opts, out: info });
  return { url, info, parentOk: fx.box.parent === g.scene, y: fx.box.position.y, target: g.renderer.getRenderTarget(), alphaKept: g.renderer.getClearAlpha() === alpha };
};
fx.decode = async url => {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, centre: [...x.getImageData(img.width >> 1, img.height >> 1, 1, 1).data], corner: [...x.getImageData(0, 0, 1, 1).data] };
};
fx.tilt = on => {
  const g = fx.view.gfx;
  g.post ??= createTiltShift(g.renderer);
  g.post.params.on = on; g.post.params.focus = 3;
  const before = programCount(g.renderer), px = fx.pixel(4, 4);
  return { before, after: programCount(g.renderer), px, err: g.renderer.getContext().getError() };
};
fx.noPost = () => { const g = fx.view.gfx; g.post?.dispose(); g.post = null; };

boot(countdown, defineView({ scenes: { title }, render: { camera: { fov: 60, fovPortrait: 64 }, lights: {} } }), { canvas: document.getElementById('c') });
