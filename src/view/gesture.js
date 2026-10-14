// #59: view-only gestures (I-2): tap, hold, one-finger drag and two-finger pinch on one element, for camera and cutscene
// controls that never reach the sim (no commands). Routing as bindPointer: moves/ups by pointerId on the window, pointercancel and
// lostpointercapture cancel, blur/pagehide/hidden cancel everything. filter: { pointerType, button } (default { button: [0] }); touch-action: none on el. A second finger ends a one-finger gesture (no tap, no hold).
// #109: time is the pointer events' own clock, not summed frame time: a hold fires on the first update(dt, raw) at least
// hold.seconds after the down's event.timeStamp (now(), default performance.now, is the same clock), and a lift is a tap when
// up.timeStamp - down.timeStamp < tapSeconds. A stuttering frame (X-4) can delay a lift's dispatch but no longer adds the
// frame time before the down to the press. `uncapped` (#56) is accepted and ignored: both readings are wall time now.
// drag({ dx, dy, phase }) and pinch({ scale, rotate, panX, panY, phase }) are cumulative from the gesture's start; phases
// start | move | end; start comes on the move that passes tapMove (a drag) or the second finger's down (a pinch), then at most
// one move per update. The payload objects are reused: read them in the callback, do not keep them.
export function bindGesture(engine, el, { tap, hold, drag, pinch, tapMove = 12, tapSeconds = 0.45, filter = { button: [0] }, doc, now, ignore = 'button, input, [data-lh-ui] *, [data-lh-hold], [data-lh-hold] *' } = {}) {
  if (!el) throw new Error('bindGesture: element required');
  if (hold && !(hold.seconds > 0 && typeof hold.fire === 'function')) throw new Error('bindGesture: hold needs seconds > 0 and fire');
  doc = doc ?? el.ownerDocument; const win = doc.defaultView ?? globalThis.window;
  if (now !== undefined && typeof now !== 'function') throw new Error('bindGesture: now must be a function');
  const clock = now ?? (() => (win?.performance ?? globalThis.performance).now()); // the clock of event.timeStamp (ms)
  const stamp = e => (Number.isFinite(e?.timeStamp) ? e.timeStamp : clock()); // #109: when the finger moved, not when the page saw it
  const prevTA = el.style.touchAction; el.style.touchAction = 'none'; // as bindStick: the browser must not pan or zoom under a gesture
  const fingers = new Map(); // pointerId -> { x, y }, every accepted finger still down
  let mode = null; // null | 'one' | 'pinch' | 'dead' (ended until every finger lifts)
  const one = { id: 0, kind: '', sx: 0, sy: 0, lx: 0, ly: 0, t0: 0, far: false, fired: false, dragging: false };
  const two = { a: 0, b: 0, d0: 1, r0: 0, mx: 0, my: 0, lax: 0, lay: 0, lbx: 0, lby: 0 }; // the pinch's two fingers, start and last emitted points
  const dp = { dx: 0, dy: 0, phase: 'start' }, pp = { scale: 1, rotate: 0, panX: 0, panY: 0, phase: 'start' };
  const info = (f, id, kind) => ({ x: f.x, y: f.y, pointer: id, kind }); // tap/hold: one per gesture
  const emitDrag = phase => { const f = fingers.get(one.id); if (f) { dp.dx = f.x - one.sx; dp.dy = f.y - one.sy; one.lx = f.x; one.ly = f.y; } dp.phase = phase; drag(dp); };
  const emitPinch = phase => {
    const a = fingers.get(two.a), b = fingers.get(two.b);
    if (a && b) {
      const d = Math.hypot(b.x - a.x, b.y - a.y), r = Math.atan2(b.y - a.y, b.x - a.x);
      pp.scale = d / two.d0; pp.rotate = Math.atan2(Math.sin(r - two.r0), Math.cos(r - two.r0)); pp.panX = (a.x + b.x) / 2 - two.mx; pp.panY = (a.y + b.y) / 2 - two.my;
    }
    pp.phase = phase; pinch(pp);
  };
  const endOne = () => { if (one.dragging) { one.dragging = false; emitDrag('end'); } };
  const startPinch = () => {
    const it = fingers.keys(); two.a = it.next().value; two.b = it.next().value;
    const a = fingers.get(two.a), b = fingers.get(two.b);
    two.d0 = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y)); two.r0 = Math.atan2(b.y - a.y, b.x - a.x); two.mx = (a.x + b.x) / 2; two.my = (a.y + b.y) / 2;
    two.lax = a.x; two.lay = a.y; two.lbx = b.x; two.lby = b.y;
    mode = 'pinch'; emitPinch('start');
  };
  const lift = (id, up, e) => { // up: a real lift (may tap); otherwise a cancel
    const f = fingers.get(id); if (!f) return;
    if (up && e) { f.x = e.clientX; f.y = e.clientY; }
    if (mode === 'one' && id === one.id) {
      if (!one.far && Math.hypot(f.x - one.sx, f.y - one.sy) > tapMove) one.far = true;
      if (one.dragging) endOne();
      else if (up && tap && !one.far && !one.fired && stamp(e) - one.t0 < tapSeconds * 1000) tap(info(f, id, one.kind));
      mode = 'dead';
    } else if (mode === 'pinch' && (id === two.a || id === two.b)) { emitPinch('end'); mode = 'dead'; }
    fingers.delete(id); if (!fingers.size) mode = null;
  };
  const cancelAll = () => { for (const id of [...fingers.keys()]) lift(id, false); };
  const onDown = e => {
    if (fingers.has(e.pointerId) || e.target?.closest?.(ignore)) return;
    if (filter.pointerType && !filter.pointerType.includes(e.pointerType)) return;
    if (filter.button && !filter.button.includes(e.button)) return; // default: primary only, so a right-click never taps
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture?.(e.pointerId);
    if (fingers.size === 1) {
      mode = 'one'; Object.assign(one, { id: e.pointerId, kind: e.pointerType, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: stamp(e), far: false, fired: false, dragging: false });
    } else if (fingers.size === 2 && mode === 'one') { endOne(); if (pinch) startPinch(); else mode = 'dead'; }
  };
  const onMove = e => {
    const f = fingers.get(e.pointerId); if (!f) return;
    f.x = e.clientX; f.y = e.clientY;
    if (mode === 'one' && e.pointerId === one.id && !one.far && Math.hypot(f.x - one.sx, f.y - one.sy) > tapMove) {
      one.far = true;
      if (drag && !one.fired) { one.dragging = true; dp.dx = dp.dy = 0; dp.phase = 'start'; drag(dp); } // starts where the finger went down; update moves it
    }
  };
  const onUp = e => lift(e.pointerId, true, e);
  const onCancel = e => lift(e.pointerId, false);
  const onVis = () => { if (doc.visibilityState === 'hidden') cancelAll(); };
  el.addEventListener('pointerdown', onDown); el.addEventListener('lostpointercapture', onCancel);
  win.addEventListener('pointermove', onMove); win.addEventListener('pointerup', onUp); win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', cancelAll); win.addEventListener('pagehide', cancelAll); doc.addEventListener('visibilitychange', onVis);
  return {
    update(dt, raw = dt) {
      if (mode === 'one') {
        const f = fingers.get(one.id);
        if (hold && !one.far && !one.fired && clock() - one.t0 >= hold.seconds * 1000) { one.fired = true; hold.fire(info(f, one.id, one.kind)); }
        if (one.dragging && (f.x !== one.lx || f.y !== one.ly)) emitDrag('move');
      } else if (mode === 'pinch') {
        const a = fingers.get(two.a), b = fingers.get(two.b);
        if (a.x !== two.lax || a.y !== two.lay || b.x !== two.lbx || b.y !== two.lby) { two.lax = a.x; two.lay = a.y; two.lbx = b.x; two.lby = b.y; emitPinch('move'); }
      }
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('lostpointercapture', onCancel);
      win.removeEventListener('pointermove', onMove); win.removeEventListener('pointerup', onUp); win.removeEventListener('pointercancel', onCancel);
      win.removeEventListener('blur', cancelAll); win.removeEventListener('pagehide', cancelAll); doc.removeEventListener('visibilitychange', onVis);
      fingers.clear(); mode = null; el.style.touchAction = prevTA;
    },
  };
}
