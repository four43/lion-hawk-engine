import { mapper } from './mapPair.js';
// Touch devices: a floating thumb stick (origin 'thumb') or a fixed pad deflecting from its centre (origin 'centre', #53) and hold buttons on pointer events -> named actions in per-source device layers (I-3: released on cancel/blur/hide).
// map (#8, #81): x/y may target map.from's virtual names; the stick then writes map.to's world-frame actions, and update() re-applies them while held.
// Moves/ups route by pointerId on the window (iOS does not reliably retarget captured moves); cancel and lostpointercapture are releases.
export function bindStick(engine, { root, x, y, axis, base: adoptBase, knob: adoptKnob, surface, parent, radius = 70, edge = 24, deadZone = 0.1, source = 'stick', preventDefault = true, origin = 'thumb', map, doc, ignore = 'button, [data-lh-ui] *, [data-lh-hold], [data-lh-hold] *' }) {
  if (origin !== 'thumb' && origin !== 'centre') throw new Error("bindStick: origin must be 'thumb' or 'centre'");
  if (origin === 'centre' && !adoptBase) throw new Error("bindStick: origin 'centre' needs a base");
  const fixed = origin === 'centre'; // a fixed pad: never hidden, shown or moved
  if (axis === 'x') y = undefined; else if (axis === 'y') x = undefined; // slider mode (#17): the other axis is never read or written
  if (!x && !y) throw new Error('bindStick: x or y required');
  surface ??= root; doc = doc ?? surface.ownerDocument; parent ??= doc.body; const win = doc.defaultView ?? globalThis.window;
  const adopted = !!adoptBase; let base = adoptBase, knob = adoptKnob; // adopted elements are positioned and shown, not styled, and survive dispose()
  if (adopted) { if (!fixed) base.hidden = true; knob ??= base.firstElementChild ?? { style: {} }; } // a knob-less adopted base: knob writes land on a stub
  else { base = doc.createElement('div'); base.className = 'lh-stick'; base.hidden = true; base.style.position = 'fixed'; knob = doc.createElement('div'); knob.className = 'lh-knob'; base.appendChild(knob); parent.appendChild(base); }
  const prevTA = surface.style.touchAction; surface.style.touchAction = 'none';
  const out = {}; if (x) out[x[0]] = 0; if (y) out[y[0]] = 0; // reused every move
  const lay = map ? mapper(map, 'bindStick') : null;
  let id = null, ox = 0, oy = 0, R = 70;

  const write = (vx, vy) => { if (x) out[x[0]] = vx * x[1] + 0; if (y) out[y[0]] = vy * y[1] + 0; engine.input.device(lay ? lay(out) : out, source); }; // +0 normalises -0
  const release = () => {
    if (id === null) return; id = null; if (!fixed) base.hidden = true; knob.style.transform = ''; surface.removeAttribute('data-lh-active'); write(0, 0);
  };
  const onDown = e => {
    if (id !== null) return;
    if (e.target?.closest?.(ignore)) return;
    if (e.clientX < edge) return; // viewport edge (Safari back swipe), not root's
    id = e.pointerId; if (fixed) { const b = base.getBoundingClientRect(); ox = b.left + b.width / 2; oy = b.top + b.height / 2; } else { ox = e.clientX; oy = e.clientY; } R = typeof radius === 'function' ? radius() : radius; if (!(Number.isFinite(R) && R > 0)) R = 70; // a bad radius() must not divide by 0
    if (preventDefault) e.preventDefault?.();
    base.style.setProperty('--lh-r', R + 'px'); surface.setAttribute('data-lh-active', '');
    if (fixed) return moveTo(e.clientX, e.clientY); // the down position is the first move
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.hidden = false; knob.style.transform = 'translate(0px, 0px)';
  };
  const moveTo = (cx, cy) => {
    let dx = cx - ox, dy = cy - oy;
    if (axis === 'x') dy = 0; else if (axis === 'y') dx = 0;
    if (axis) { dx = Math.max(-R, Math.min(R, dx)); dy = Math.max(-R, Math.min(R, dy)); } // per-axis clamp
    else { const len = Math.hypot(dx, dy); if (len > R) { dx = dx / len * R; dy = dy / len * R; } }
    // the one per-move allocation: DOM style writes allocate anyway, so the transform string stays
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = -dy / R;
    if (axis) { // dead zone on the one axis, rescaled to 0..1
      const n = axis === 'x' ? nx : ny, m = Math.abs(n);
      const v = m <= deadZone ? 0 : Math.sign(n) * Math.min(1, (m - deadZone) / (1 - deadZone));
      return axis === 'x' ? write(v, 0) : write(0, v);
    }
    // radial dead zone, then length rescaled to 0..1; screen up is +y
    const m = Math.hypot(nx, ny);
    if (m <= deadZone) return write(0, 0);
    const k = Math.min(1, (m - deadZone) / (1 - deadZone)) / m;
    write(nx * k, ny * k);
  };
  const onMove = e => { if (e.pointerId === id) moveTo(e.clientX, e.clientY); };
  const onEnd = e => { if (e.pointerId === id) release(); };
  const onVis = () => { if (doc.visibilityState === 'hidden') release(); };
  surface.addEventListener('pointerdown', onDown); surface.addEventListener('lostpointercapture', onEnd);
  win.addEventListener('pointermove', onMove); win.addEventListener('pointerup', onEnd); win.addEventListener('pointercancel', onEnd);
  win.addEventListener('blur', release); win.addEventListener('pagehide', release); doc.addEventListener('visibilitychange', onVis);
  return {
    update() { if (lay && id !== null) engine.input.device(lay(out), source); }, // #81: the camera may turn under a still thumb
    dispose() {
      surface.removeEventListener('pointerdown', onDown); surface.removeEventListener('lostpointercapture', onEnd);
      win.removeEventListener('pointermove', onMove); win.removeEventListener('pointerup', onEnd); win.removeEventListener('pointercancel', onEnd);
      win.removeEventListener('blur', release); win.removeEventListener('pagehide', release); doc.removeEventListener('visibilitychange', onVis);
      id = null; if (adopted) { if (!fixed) base.hidden = true; knob.style.transform = ''; base.style.removeProperty('--lh-r'); } else base.remove(); surface.removeAttribute('data-lh-active'); surface.style.touchAction = prevTA; engine.input.clearDevice(source);
    },
  };
}

export function bindHold(engine, el, action, { source = 'hold:' + action, value, focus = false } = {}) {
  const doc = el.ownerDocument, win = doc.defaultView ?? globalThis.window;
  const isAxis = engine.input.kinds?.[action] === 'axis';
  const on = { [action]: value ?? (isAxis ? 1 : true) }, off = { [action]: isAxis ? 0 : false };
  let id = null;
  el.setAttribute('data-lh-hold', '');
  const onDown = e => { if (id !== null) return; id = e.pointerId; el.setPointerCapture?.(e.pointerId); el.setAttribute('data-lh-down', ''); engine.input.device(on, source); };
  const release = () => { if (id === null) return; id = null; el.removeAttribute('data-lh-down'); engine.input.device(off, source); };
  const onEnd = e => { if (e.pointerId === id) release(); };
  const onCtx = e => e.preventDefault();
  const noFocus = e => { if (!focus) e.preventDefault?.(); }; // #42: pointerdown/mousedown default is what focuses a button; Space/Enter stay the game's (#15)
  const onVis = () => { if (doc.visibilityState === 'hidden') release(); };
  el.addEventListener('pointerdown', noFocus); el.addEventListener('mousedown', noFocus);
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onEnd); el.addEventListener('pointercancel', onEnd);
  el.addEventListener('lostpointercapture', onEnd); el.addEventListener('contextmenu', onCtx);
  win.addEventListener('pagehide', release); win.addEventListener('blur', release); doc.addEventListener('visibilitychange', onVis);
  return {
    dispose() {
      el.removeEventListener('pointerdown', noFocus); el.removeEventListener('mousedown', noFocus);
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onEnd); el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('lostpointercapture', onEnd); el.removeEventListener('contextmenu', onCtx);
      win.removeEventListener('pagehide', release); win.removeEventListener('blur', release); doc.removeEventListener('visibilitychange', onVis);
      id = null; el.removeAttribute('data-lh-hold'); el.removeAttribute('data-lh-down'); engine.input.clearDevice(source);
    },
  };
}
