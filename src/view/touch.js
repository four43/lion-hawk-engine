// Touch devices: a floating thumb stick and hold buttons on pointer events -> named actions in per-source device layers (I-3: released on cancel/blur/hide).
// Moves/ups route by pointerId on the window (iOS does not reliably retarget captured moves); cancel and lostpointercapture are releases.
export function bindStick(engine, { root, x, y, radius = 70, edge = 24, deadZone = 0.1, source = 'stick', doc, ignore = 'button, [data-lh-ui] *' }) {
  doc = doc ?? root.ownerDocument; const win = doc.defaultView ?? globalThis.window;
  const base = doc.createElement('div'); base.className = 'lh-stick'; base.hidden = true;
  const knob = doc.createElement('div'); knob.className = 'lh-knob'; base.appendChild(knob); root.appendChild(base);
  const out = { [x[0]]: 0, [y[0]]: 0 }; // reused every move
  let id = null, ox = 0, oy = 0;

  const write = (vx, vy) => { out[x[0]] = vx * x[1] + 0; out[y[0]] = vy * y[1] + 0; engine.input.device(out, source); }; // +0 normalises -0
  const release = () => {
    if (id === null) return; id = null; base.hidden = true; knob.style.transform = ''; write(0, 0);
  };
  const onDown = e => {
    if (id !== null) return;
    if (e.target?.closest?.(ignore)) return;
    const r = root.getBoundingClientRect?.(); if (e.clientX - (r ? r.left : 0) < edge) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.hidden = false; knob.style.transform = 'translate(0px, 0px)';
  };
  const onMove = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const len = Math.hypot(dx, dy);
    if (len > radius) { dx = dx / len * radius; dy = dy / len * radius; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // radial dead zone, then length rescaled to 0..1; screen up is +y
    const nx = dx / radius, ny = -dy / radius, m = Math.hypot(nx, ny);
    if (m <= deadZone) return write(0, 0);
    const k = Math.min(1, (m - deadZone) / (1 - deadZone)) / m;
    write(nx * k, ny * k);
  };
  const onEnd = e => { if (e.pointerId === id) release(); };
  const onVis = () => { if (doc.visibilityState === 'hidden') release(); };
  root.addEventListener('pointerdown', onDown); root.addEventListener('lostpointercapture', onEnd);
  win.addEventListener('pointermove', onMove); win.addEventListener('pointerup', onEnd); win.addEventListener('pointercancel', onEnd);
  win.addEventListener('blur', release); win.addEventListener('pagehide', release); doc.addEventListener('visibilitychange', onVis);
  return {
    dispose() {
      root.removeEventListener('pointerdown', onDown); root.removeEventListener('lostpointercapture', onEnd);
      win.removeEventListener('pointermove', onMove); win.removeEventListener('pointerup', onEnd); win.removeEventListener('pointercancel', onEnd);
      win.removeEventListener('blur', release); win.removeEventListener('pagehide', release); doc.removeEventListener('visibilitychange', onVis);
      id = null; base.remove(); engine.input.clearDevice(source);
    },
  };
}

export function bindHold(engine, el, action, { source = 'hold:' + action } = {}) {
  const doc = el.ownerDocument, win = doc.defaultView ?? globalThis.window;
  const on = { [action]: true }, off = { [action]: false };
  let id = null;
  const onDown = e => { id = e.pointerId; el.setPointerCapture?.(e.pointerId); engine.input.device(on, source); };
  const release = () => { if (id === null) return; id = null; engine.input.device(off, source); };
  const onEnd = e => { if (e.pointerId === id) release(); };
  const onCtx = e => e.preventDefault();
  const onVis = () => { if (doc.visibilityState === 'hidden') release(); };
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onEnd); el.addEventListener('pointercancel', onEnd);
  el.addEventListener('lostpointercapture', onEnd); el.addEventListener('contextmenu', onCtx);
  win.addEventListener('pagehide', release); win.addEventListener('blur', release); doc.addEventListener('visibilitychange', onVis);
  return {
    dispose() {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onEnd); el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('lostpointercapture', onEnd); el.removeEventListener('contextmenu', onCtx);
      win.removeEventListener('pagehide', release); win.removeEventListener('blur', release); doc.removeEventListener('visibilitychange', onVis);
      id = null; engine.input.clearDevice(source);
    },
  };
}
