// Wires engine + driver + devices + DOM UI + scene view halves (S-1) and installs window.engine.
import { createEngine } from '../core/engine.js';
import { parseFlags } from '../core/flags.js';
import { createDriver } from './driver.js';
import { createUiDom } from './uiDom.js';
import { installEngine } from './hook.js';

export function defineView({ scenes } = {}) {
  if (!scenes || typeof scenes !== 'object') throw new Error('defineView: scenes required');
  for (const [n, s] of Object.entries(scenes)) for (const h of ['enter', 'exit', 'frame']) if (s[h] !== undefined && typeof s[h] !== 'function') throw new Error(`defineView: scene '${n}'.${h} must be a function`);
  return Object.freeze({ scenes: Object.freeze({ ...scenes }) });
}

export function boot(game, halves = { scenes: {} }, { root, doc, target = globalThis, seed, scene, args, flags, devices = [], raf, caf } = {}) {
  doc ??= target.document ?? globalThis.document;
  flags ??= parseFlags(target.location?.search ?? '');
  const errors = [], views = halves.scenes ?? {};
  const engine = createEngine(game, { seed: flags.seed ?? seed ?? 1, scene, args });
  const driver = createDriver(engine, { raf, caf, doc, devices: devices.map(f => f(engine)) });
  const ui = createUiDom(engine, { root: root ?? doc.body, doc, errors, onTap: () => refresh() });
  const view = { root: root ?? doc.body, doc, ui, driver };
  const caught = fn => { try { fn(); } catch (err) { errors.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack }); } };

  // View halves follow the ACTUAL stack: each refresh diffs the previous and current entries (main scene keyed by name
  // plus its state object, which is new on every enter) and calls exit/enter for the differences, so nothing depends
  // on when 'scene'/'overlay' events flush.
  let active = [], busy = false, settledAttr, disposed = false;
  const entries = () => {
    const s = engine.scene, out = [];
    if (s.name !== undefined) out.push({ name: s.name, key: s.id });
    for (let i = 0; i < s.overlays.length; i++) out.push({ name: s.overlays[i], key: s.overlayIds[i] });
    return out;
  };
  const same = (a, b) => a.name === b.name && a.key === b.key;
  function reconcile() {
    if (busy) return; busy = true;
    try {
      for (let guard = 0; guard < 16; guard++) {
        const cur = entries(), gone = active.filter(a => !cur.some(c => same(a, c))), added = cur.filter(c => !active.some(a => same(a, c)));
        if (!gone.length && !added.length) break;
        active = cur.slice(); // set first: a half that transitions re-enters via the next pass
        for (let i = gone.length - 1; i >= 0; i--) caught(() => views[gone[i].name]?.exit?.(engine, view));
        for (const c of added) caught(() => views[c.name]?.enter?.(engine, view));
      }
    } finally { busy = false; }
  }
  const refresh = () => {
    if (disposed) return;
    reconcile(); ui.sync();
    const s = String(hook.settled()); if (s !== settledAttr) { settledAttr = s; doc.documentElement.setAttribute('data-lh-settled', s); }
  };
  const off = engine.events.on(e => { if (e.type === 'scene' || e.type === 'overlay') refresh(); });
  engine.onRender(alpha => {
    if (disposed) return;
    reconcile();
    for (const e of active.slice()) if (active.some(a => same(a, e))) caught(() => views[e.name]?.frame?.(engine, alpha, view)); // snapshot; skip halves a previous frame exited
    refresh();
  });
  const hook = installEngine(engine, { driver, target, errors, after: refresh });
  refresh();
  const dispose = () => {
    if (disposed) return; disposed = true;
    driver.stop(); for (const d of driver.devices) d.dispose?.();
    ui.dispose(); hook.dispose(); off(); engine.onRender(() => {});
  };

  if (flags.lhTest) {
    driver.manual(true); // devices update and frames render every rAF, but the sim never steps
    const st = doc.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}';
    (doc.head ?? doc.documentElement).appendChild(st);
  }
  driver.start();
  return { engine, driver, ui, hook, dispose };
}
