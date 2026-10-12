// #5/#8: bindPointer owns the gesture (filters, capture, window routing, move coalescing, tap/press, second-finger cancel);
// the game's at(clientX, clientY, event) supplies the payload, so the sim does the picking and a replay reproduces it.
// `event` is optional in at(): it is the pointer event for down/move/up, and undefined for the move and press that update(dt)
// sends. Long-press time counts only update(dt) (engine/frame time), never wall-clock timers, so a paused game never presses.
export function bindPointer(engine, { surface, type, at, filter = {}, ignore = 'button, input, [data-lh-ui] *, [data-lh-hold], [data-lh-hold] *', edge = 0, tap = {}, press = 0, doc } = {}) {
  if (!type) throw new Error('bindPointer: type required');
  if (typeof at !== 'function') throw new Error('bindPointer: at must be a function');
  const tapMove = tap.move ?? 12, tapSeconds = tap.seconds ?? 0.45;
  doc = doc ?? surface.ownerDocument; const win = doc.defaultView ?? globalThis.window;
  const tracked = new Set(); // accepted pointers currently down; a second one cancels and blocks until all lift
  let a = null; // the active press: { id, button, kind, sx, sy, x, y, lx, ly, held, far, pressed, silent }
  const send = (phase, x, y, ev) => {
    const p = at(x, y, ev);
    if (p == null && (phase === 'move' || phase === 'press')) return; // nothing under the pointer: no command (up, cancel and tap always go)
    engine.command(type, { ...p, phase, pointer: a.id, button: a.button, kind: a.kind }); // reserved keys last: at() cannot override them
  };
  const end = (phase, x = a.x, y = a.y, ev) => { // phase 'cancel' | 'up'; silent presses (at() returned null) send nothing
    const s = a; a = null; if (s.silent) return;
    a = s; send(phase, x, y, ev); a = null;
    if (phase === 'up' && !s.far && !s.pressed && s.held < tapSeconds) { a = s; send('tap', x, y, ev); a = null; }
  };
  const cancelAll = () => { if (a) end('cancel'); tracked.clear(); };
  const onDown = e => {
    if (filter.pointerType && !filter.pointerType.includes(e.pointerType)) return;
    if (filter.button && !filter.button.includes(e.button)) return;
    if (e.target?.closest?.(ignore)) return;
    if (e.clientX < edge) return;
    if (tracked.size > 0) { if (a) end('cancel'); tracked.add(e.pointerId); return; } // second finger: the multi-touch gesture stays the game's
    tracked.add(e.pointerId);
    const p = at(e.clientX, e.clientY, e);
    a = { id: e.pointerId, button: e.button, kind: e.pointerType, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, held: 0, far: false, pressed: false, silent: p == null };
    if (p == null) return;
    surface.setPointerCapture?.(e.pointerId);
    engine.command(type, { ...p, phase: 'down', pointer: a.id, button: a.button, kind: a.kind });
  };
  const onMove = e => {
    if (!a || e.pointerId !== a.id) return;
    a.x = e.clientX; a.y = e.clientY;
    if (!a.far && Math.hypot(a.x - a.sx, a.y - a.sy) > tapMove) a.far = true;
  };
  const onUp = e => {
    if (!tracked.delete(e.pointerId) || !a || e.pointerId !== a.id) return;
    if (!a.far && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > tapMove) a.far = true; // a far up with no move before it is not a tap
    end('up', e.clientX, e.clientY, e);
  };
  const onCancel = e => {
    if (!tracked.delete(e.pointerId) || !a || e.pointerId !== a.id) return;
    end('cancel');
  };
  const onLost = e => { if (a && e.pointerId === a.id) { tracked.delete(e.pointerId); end('cancel'); } };
  const onVis = () => { if (doc.visibilityState === 'hidden') cancelAll(); };
  surface.addEventListener('pointerdown', onDown); surface.addEventListener('lostpointercapture', onLost);
  win.addEventListener('pointermove', onMove); win.addEventListener('pointerup', onUp); win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', cancelAll); win.addEventListener('pagehide', cancelAll); doc.addEventListener('visibilitychange', onVis);
  return {
    update(dt) {
      if (!a || a.silent) return;
      a.held += dt;
      if (a.x !== a.lx || a.y !== a.ly) { a.lx = a.x; a.ly = a.y; send('move', a.x, a.y); }
      if (press > 0 && !a.pressed && !a.far && a.held >= press) { a.pressed = true; send('press', a.x, a.y); }
    },
    dispose() {
      surface.removeEventListener('pointerdown', onDown); surface.removeEventListener('lostpointercapture', onLost);
      win.removeEventListener('pointermove', onMove); win.removeEventListener('pointerup', onUp); win.removeEventListener('pointercancel', onCancel);
      win.removeEventListener('blur', cancelAll); win.removeEventListener('pagehide', cancelAll); doc.removeEventListener('visibilitychange', onVis);
      a = null; tracked.clear();
    },
  };
}
