// Orbit camera (#59): yaw, pitch and distance round a ground target. rig.state is the live pose
// { tx, ty, tz, yaw, pitch, dist, chaseOff }, readable and writable; rig.limits the live clamps { pitchMin, pitchMax, min, max,
// bounds: { x: [lo, hi], z: [lo, hi] } | null }. fit(aspect?) applies the `fit` framing for the aspect
// (fit.portrait below 0.9, else fit.landscape; each a partial state). update(dt, raw) drives the bound gestures, then apply()
// clamps and places the camera.
// bindGesture(engine, el, { mode, tapMove }) adds the view-only camera gestures (lion-hawk bindGesture): one finger drags by
// mode() ('orbit' | 'chase' | 'none' | null, asked when the drag starts; 'orbit' sets rig.orbiting for the game's tool picker, #52;
// an orbit drag stops for good once mode() stops answering 'orbit', e.g. a drive began mid-drag, 3k C9),
// two fingers pinch-zoom, turn and pan (turn the chase offset instead while mode() is 'chase', asked on every move),
// mouse right-drag orbits, middle-drag pans,
// the wheel zooms, no context menu. Do not also add it to boot's devices: rig.update drives it.
// chase(pose, dt) follows a driven body (pose { x, z, yaw, fwd }); release() lifts it back to the orbit.
// ray(cx, cy, out?) is the camera ray through a client point, [ox, oy, oz, dx, dy, dz] (a fresh array without out, #72).
import * as THREE from 'three';
import { bindGesture as bindViewGesture } from '../gesture.js';

const CHASE = Object.freeze({ lag: 2.5, recentre: 0.8, lead: 0.5, leadMin: -1, leadMax: 3, follow: 5, pitch: 0.42, near: 9, far: 22, ease: 2 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createOrbitRig(camera, { target = { x: 0, y: 0.5, z: 0 }, distance = 46, min = 2.5, max = 80, pitch = 0.92, yaw = 0,
  pitchMin = 0.28, pitchMax = 1.48, bounds = null, ground = 0, canvas = null, chase = {}, fit = null } = {}) {
  if (!camera?.isCamera) throw new Error('createOrbitRig: camera required');
  const ch = { ...CHASE, ...chase };
  const state = { tx: target.x, ty: target.y, tz: target.z, yaw, pitch, dist: distance, chaseOff: 0 };
  const limits = { pitchMin, pitchMax, min, max, bounds };
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), devices = [];
  let el = canvas;
  const rig = {
    state, limits, gesture: null, orbiting: false,
    fit(aspect = camera.aspect) {
      if (!fit) throw new Error('orbit.fit: no fit framing (createOrbitRig({ fit: { portrait, landscape } }))');
      Object.assign(state, aspect < 0.9 ? fit.portrait : fit.landscape);
    },
    apply() {
      const L = limits;
      state.pitch = clamp(state.pitch, L.pitchMin, L.pitchMax); state.dist = clamp(state.dist, L.min, L.max);
      if (L.bounds) { state.tx = clamp(state.tx, L.bounds.x[0], L.bounds.x[1]); state.tz = clamp(state.tz, L.bounds.z[0], L.bounds.z[1]); }
      const cp = Math.cos(state.pitch);
      camera.position.set(state.tx + Math.sin(state.yaw) * cp * state.dist, ground + Math.sin(state.pitch) * state.dist, state.tz + Math.cos(state.yaw) * cp * state.dist);
      camera.lookAt(state.tx, state.ty, state.tz);
      camera.updateMatrixWorld(); // ray() and project() use the camera as drawn
    },
    update(dt = 0, raw = dt) { for (let i = 0; i < devices.length; i++) devices[i].update(dt, raw); rig.apply(); },
    panBy(dx, dy) { // screen px -> ground metres
      const k = state.dist * 0.0016, s = Math.max(0.5, Math.sin(state.pitch));
      const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
      state.tx -= (dx * rx - dy * fx / s) * k; state.tz -= (dx * rz - dy * fz / s) * k;
    },
    chase(t, dt) {
      let d = t.yaw + Math.PI + state.chaseOff - state.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      state.yaw += d * Math.min(1, dt * ch.lag);
      if (!rig.gesture) state.chaseOff *= Math.max(0, 1 - dt * ch.recentre); // a drag holds the offset; let go, it recentres
      const lead = clamp(t.fwd * ch.lead, ch.leadMin, ch.leadMax);
      state.tx += (t.x + Math.sin(t.yaw) * lead - state.tx) * Math.min(1, dt * ch.follow);
      state.tz += (t.z + Math.cos(t.yaw) * lead - state.tz) * Math.min(1, dt * ch.follow);
      state.pitch += (ch.pitch - state.pitch) * Math.min(1, dt * ch.ease);
      state.dist += (clamp(state.dist, ch.near, ch.far) - state.dist) * Math.min(1, dt * ch.ease);
    },
    release({ pitch: p = 0.7, distance: dd = 18 } = {}) { state.pitch = Math.max(state.pitch, p); state.dist = Math.max(state.dist, dd); state.chaseOff = 0; },
    ray(cx, cy, out = new Array(6)) {
      if (!el) throw new Error('orbit.ray: no element (pass canvas, or bindGesture first)');
      const r = el.getBoundingClientRect();
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      out[0] = o.x; out[1] = o.y; out[2] = o.z; out[3] = d.x; out[4] = d.y; out[5] = d.z;
      return out;
    },
    bindGesture(engine, element, { mode = () => 'orbit', tapMove = 12 } = {}) {
      if (!element) throw new Error('orbit.bindGesture: element required');
      el ??= element;
      let one = null, lx = 0, ly = 0, d0 = 0, r0 = 0, px = 0, py = 0, mx = 0, my = 0;
      const drag = d => { // cumulative from the down point; apply the change since the last call
        if (d.phase === 'start') { one = mode(); lx = 0; ly = 0; if (one === 'orbit') rig.orbiting = true; rig.gesture = one === 'orbit' || one === 'chase' ? one : null; return; }
        const ix = d.dx - lx, iy = d.dy - ly; lx = d.dx; ly = d.dy;
        if (one === 'orbit' && mode() !== 'orbit') { one = null; rig.gesture = null; } // a drag begun before a drive must not orbit it
        if (one === 'orbit') { state.yaw -= ix * 0.006; state.pitch += iy * 0.005; }
        else if (one === 'chase') { state.chaseOff -= ix * 0.006; state.pitch += iy * 0.004; }
        if (d.phase === 'end') { one = null; rig.gesture = null; }
      };
      const pinch = p => {
        if (p.phase === 'start') { d0 = state.dist; r0 = 0; px = 0; py = 0; rig.gesture = 'pinch'; return; }
        state.dist = d0 / Math.max(0.05, p.scale);
        const da = p.rotate - r0; r0 = p.rotate; // the turn since the last move, so a drive that starts mid-pinch turns the chase from then on
        if (mode() === 'chase') state.chaseOff += da;
        else { state.yaw += da; rig.panBy(p.panX - px, p.panY - py); }
        px = p.panX; py = p.panY;
        if (p.phase === 'end') rig.gesture = null;
      };
      const mouse = kind => d => {
        if (d.phase === 'start') { mx = 0; my = 0; rig.gesture = kind; return; }
        const ix = d.dx - mx, iy = d.dy - my; mx = d.dx; my = d.dy;
        if (kind === 'orbit') { state.yaw -= ix * 0.006; state.pitch += iy * 0.005; } else rig.panBy(ix, iy);
        if (d.phase === 'end') rig.gesture = null;
      };
      const gs = [
        bindViewGesture(engine, element, { drag, pinch, tapMove }),
        bindViewGesture(engine, element, { drag: mouse('orbit'), tapMove: 0, filter: { pointerType: ['mouse'], button: [2] } }),
        bindViewGesture(engine, element, { drag: mouse('pan'), tapMove: 0, filter: { pointerType: ['mouse'], button: [1] } }),
      ];
      const onDown = () => { rig.orbiting = false; }; // every new gesture starts as a tool gesture (#52)
      const onWheel = e => { e.preventDefault(); state.dist *= Math.exp(e.deltaY * 0.0012); };
      const onMenu = e => e.preventDefault();
      element.addEventListener('pointerdown', onDown, true); element.addEventListener('wheel', onWheel, { passive: false }); element.addEventListener('contextmenu', onMenu);
      const device = {
        update(dt, raw = dt) { for (let i = 0; i < gs.length; i++) gs[i].update(dt, raw); },
        dispose() {
          for (let i = gs.length - 1; i >= 0; i--) gs[i].dispose();
          element.removeEventListener('pointerdown', onDown, true); element.removeEventListener('wheel', onWheel); element.removeEventListener('contextmenu', onMenu);
          const i = devices.indexOf(device); if (i >= 0) devices.splice(i, 1);
          rig.gesture = null;
        },
      };
      devices.push(device);
      return device;
    },
  };
  return rig;
}
