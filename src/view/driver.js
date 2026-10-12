// Browser rAF driver (R-5): feeds wall-clock dt to the engine loop, pauses while the tab is hidden and drops the
// accumulated gap on return. Manual mode stops stepping but keeps rendering. Globals are resolved lazily.
export function createDriver(engine, { raf, caf, doc, devices = [], onError } = {}) {
  const _raf = f => (raf ?? globalThis.requestAnimationFrame)(f);
  const _caf = h => (caf ?? globalThis.cancelAnimationFrame)?.(h);
  const document = () => doc ?? globalThis.document;
  let running = false, manual = false, last = null, handle = null, listening = false, rendered = false;

  const schedule = () => { handle = _raf(tick); };
  const hidden = () => document()?.visibilityState === 'hidden';
  function tick(ts) {
    handle = null;
    if (!running || hidden()) { rendered = false; return; } // a frame drawn before hiding may never have been shown
    try {
      // [S-6] #38: the previous tick's render was drawn in that rAF, so it has been presented by now
      if (rendered) { rendered = false; if (engine.acks === 'frames') engine.presented(); }
      const dt = last === null ? 0 : (ts - last) / 1000; last = ts;
      const ddt = Math.min(dt, engine.game.sim.maxFrame); // #44: a device never sees more than the loop will step
      for (const d of devices) d.update?.(ddt);
      if (manual) engine.render(engine.loop.alpha); else engine.frame(dt);
      rendered = true;
    } catch (err) {
      if (onError) { try { onError(err); } catch { /* the reporter must not kill the loop either */ } } else console.error(err);
    } finally { if (running && handle === null && !hidden()) schedule(); }
  }
  const onVisibility = () => {
    if (hidden()) { if (handle !== null) { _caf(handle); handle = null; } return; }
    last = null; engine.loop.reset();
    if (running && handle === null) schedule();
  };
  return {
    start() {
      if (running) return; running = true; last = null; rendered = false; engine.loop.reset();
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
