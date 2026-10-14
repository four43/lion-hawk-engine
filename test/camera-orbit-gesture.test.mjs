import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitRig } from '../src/view/camera/orbit.js';
import { createEngine, defineGame } from '../src/index.sim.js';
import { dom } from './helpers/dom.mjs';

const setup = (opts) => {
  const { window, document } = dom(), el = document.createElement('div'); document.body.appendChild(el);
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
  const engine = createEngine(defineGame({ id: 'g', start: 's', scenes: { s: {} } }));
  const rig = createOrbitRig(new THREE.PerspectiveCamera(50, 4 / 3)), dev = rig.bindGesture(engine, el, opts);
  const ev = (t, type, id, x, y, extra = {}) => t.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', button: 0, ...extra }));
  return { window, document, el, rig, dev, ev };
};
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test('3g: one finger orbits past tapMove (rig.orbiting for the tool picker); a tap does not (#59, #52)', () => {
  const s = setup(), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointerup', 1, 104, 100); s.rig.update(0.016);
  near(st.yaw, 0, 'tap yaw'); assert.equal(s.rig.orbiting, false);
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.window, 'pointermove', 2, 150, 120); assert.equal(s.rig.orbiting, true); assert.equal(s.rig.gesture, 'orbit');
  s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 150, 120);
  near(st.yaw, -50 * 0.006, 'yaw'); near(st.pitch, 0.92 + 20 * 0.005, 'pitch'); assert.equal(s.rig.gesture, null);
  s.ev(s.el, 'pointerdown', 3, 0, 0); assert.equal(s.rig.orbiting, false); // the next gesture starts as a tool gesture
});
test('3g: mode() picks the one-finger drag: chase turns the chase offset, none leaves the camera alone (#59)', () => {
  let mode = 'chase'; const s = setup({ mode: () => mode }), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointermove', 1, 150, 120); s.rig.update(0.016); s.ev(s.window, 'pointerup', 1, 150, 120);
  near(st.chaseOff, -0.3, 'chaseOff'); near(st.pitch, 0.92 + 20 * 0.004, 'pitch'); near(st.yaw, 0, 'yaw'); assert.equal(s.rig.orbiting, false);
  mode = 'none'; const before = { ...st };
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.window, 'pointermove', 2, 180, 150); s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 180, 150);
  assert.deepEqual({ ...st }, before);
});
test('3g: two fingers pinch-zoom, turn and pan (Pig Pens\' two-pointer gesture) (#59)', () => {
  const s = setup(), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.el, 'pointerdown', 2, 200, 100); assert.equal(s.rig.gesture, 'pinch');
  s.ev(s.window, 'pointermove', 2, 300, 100); s.rig.update(0.016);
  near(st.dist, 23, 'dist'); near(st.yaw, 0, 'yaw'); near(st.tx, -50 * 23 * 0.0016, 'pan x'); near(st.tz, 0, 'pan z');
  s.ev(s.window, 'pointermove', 1, 100, 200); s.rig.update(0.016); // turn the pair by 45 degrees about the first finger... and move the midpoint
  const a = Math.atan2(100 - 200, 300 - 100); assert.ok(Math.abs(st.yaw - a) < 1e-9, `yaw ${st.yaw}`);
  s.ev(s.window, 'pointerup', 2, 300, 100); s.ev(s.window, 'pointerup', 1, 100, 200); assert.equal(s.rig.gesture, null);
});
test('3g: mouse right-drag orbits, middle-drag pans, the wheel zooms, no context menu; dispose removes it all (#59)', () => {
  const s = setup(), st = s.rig.state, mouse = { pointerType: 'mouse' };
  s.ev(s.el, 'pointerdown', 1, 100, 100, { ...mouse, button: 2 }); s.ev(s.window, 'pointermove', 1, 103, 100, mouse); s.rig.update(0.016); s.ev(s.window, 'pointerup', 1, 103, 100, { ...mouse, button: 2 });
  near(st.yaw, -3 * 0.006, 'right-drag yaw');
  s.ev(s.el, 'pointerdown', 2, 100, 100, { ...mouse, button: 1 }); s.ev(s.window, 'pointermove', 2, 110, 100, mouse); s.rig.update(0.016); s.ev(s.window, 'pointerup', 2, 110, 100, { ...mouse, button: 1 });
  assert.ok(st.tx < 0, 'middle-drag pans');
  const w = new s.window.WheelEvent('wheel', { deltaY: 100, cancelable: true }); s.el.dispatchEvent(w);
  near(st.dist, 46 * Math.exp(0.12), 'wheel'); assert.equal(w.defaultPrevented, true);
  const m = new s.window.MouseEvent('contextmenu', { cancelable: true, bubbles: true }); s.el.dispatchEvent(m); assert.equal(m.defaultPrevented, true);
  s.dev.dispose(); const before = { ...st };
  s.ev(s.el, 'pointerdown', 3, 100, 100); s.ev(s.window, 'pointermove', 3, 200, 100); s.rig.update(0.016); s.el.dispatchEvent(new s.window.WheelEvent('wheel', { deltaY: 100 }));
  assert.deepEqual({ ...st }, before); assert.equal(s.el.style.touchAction, '');
});
test('3g: mode() is asked again as a gesture moves: a drive that starts mid-drag stops the orbit; mid-pinch it turns the chase offset (3k C9)', () => {
  let mode = 'orbit'; const s = setup({ mode: () => mode }), st = s.rig.state;
  s.ev(s.el, 'pointerdown', 1, 100, 100); s.ev(s.window, 'pointermove', 1, 150, 100); s.rig.update(0.016);
  near(st.yaw, -50 * 0.006, 'orbits before the drive');
  mode = 'chase'; s.ev(s.window, 'pointermove', 1, 200, 120); s.rig.update(0.016);
  near(st.yaw, -50 * 0.006, 'no orbit once driving'); near(st.chaseOff, 0, 'nor a chase turn'); assert.equal(s.rig.gesture, null);
  s.ev(s.window, 'pointerup', 1, 200, 120);
  mode = 'orbit'; const yaw0 = st.yaw;
  s.ev(s.el, 'pointerdown', 2, 100, 100); s.ev(s.el, 'pointerdown', 3, 200, 100);
  s.ev(s.window, 'pointermove', 3, 200, 200); s.rig.update(0.016); near(st.yaw, yaw0 + Math.PI / 4, 'pinch turns the view');
  mode = 'chase'; s.ev(s.window, 'pointermove', 3, 100, 200); s.rig.update(0.016);
  near(st.yaw, yaw0 + Math.PI / 4, 'not the view once driving'); near(st.chaseOff, Math.PI / 4, 'the chase offset instead');
  s.ev(s.window, 'pointerup', 3, 100, 200); s.ev(s.window, 'pointerup', 2, 100, 100);
});
