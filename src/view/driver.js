// Browser rAF driver (R-5): feeds wall-clock dt to the engine loop, pauses while the tab is hidden and drops the
// accumulated gap on return. Manual mode stops stepping but keeps rendering. Globals are resolved lazily.
export function createDriver(engine, { raf, caf, doc, devices = [] } = {}) {
  const _raf = f => (raf ?? globalThis.requestAnimationFrame)(f);
  const _caf = h => (caf ?? globalThis.cancelAnimationFrame)?.(h);
  const document = () => doc ?? globalThis.document;
  let running = false, manual = false, last = null, handle = null, listening = false;

  const schedule = () => { handle = _raf(tick); };
  const hidden = () => document()?.visibilityState === 'hidden';
  function tick(ts) {
    handle = null;
    if (!running || hidden()) return;
    const dt = last === null ? 0 : (ts - last) / 1000; last = ts;
    for (const d of devices) d.update?.(dt);
    if (manual) engine.render(engine.loop.alpha); else engine.frame(dt);
    if (running) schedule();
  }
  const onVisibility = () => {
    if (hidden()) { if (handle !== null) { _caf(handle); handle = null; } return; }
    last = null; engine.loop.reset();
    if (running && handle === null) schedule();
  };
  return {
    start() {
      if (running) return; running = true; last = null;
      if (!listening) { document()?.addEventListener('visibilitychange', onVisibility); listening = true; }
      if (!hidden()) schedule();
    },
    stop() {
      running = false; if (handle !== null) { _caf(handle); handle = null; }
      if (listening) { document()?.removeEventListener('visibilitychange', onVisibility); listening = false; }
    },
    manual(on) { if (on !== undefined) manual = !!on; return manual; },
    get running() { return running; },
    devices,
  };
}
