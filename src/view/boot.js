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
  const report = err => errors.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack });
  if (flags.lhTest) { // test-only start overrides: ?scene=<name> and ?args=<json>
    const s = flags.extra?.scene; if (s) scene = s;
    const a = flags.extra?.args; if (a) { try { args = JSON.parse(a); } catch { /* ignore a malformed ?args */ } }
  }
  const engine = createEngine(game, { seed: flags.seed ?? seed ?? 1, scene, args });
  const view = { root: root ?? doc.body, doc, ui: null, driver: null, dt: 0, wait: p => wait(p) }; // #19: dt is the driver frame time; 0 for renders the driver didn't start
  const frameDt = { update(dt) { view.dt = dt; } }; // first device: later devices and the frame see this frame's dt
  const driver = createDriver(engine, { raf, caf, doc, devices: [frameDt, ...devices.map(f => f(engine))], onError: report });
  const sa = doc.createElement('style'); // safe-area vars, low specificity: inline/injected --lh-sa-* still win
  sa.textContent = ':root{--lh-sa-top:env(safe-area-inset-top,0px);--lh-sa-right:env(safe-area-inset-right,0px);--lh-sa-bottom:env(safe-area-inset-bottom,0px);--lh-sa-left:env(safe-area-inset-left,0px)}';
  (doc.head ?? doc.documentElement).appendChild(sa);
  const ui = createUiDom(engine, { root: root ?? doc.body, doc, errors, onTap: () => refresh() });
  view.ui = ui; view.driver = driver;
  const caught = fn => { try { fn(); } catch (err) { report(err); } };

  // View halves follow the ACTUAL stack: each refresh diffs the previous and current entries (main scene keyed by name
  // plus its state object, which is new on every enter) and calls exit/enter for the differences, so nothing depends
  // on when 'scene'/'overlay' events flush.
  let active = [], busy = false, pending = 0, settledAttr, disposed = false;
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
    const s = hook.settled() ? '1' : '0'; if (s !== settledAttr) { settledAttr = s; doc.documentElement.setAttribute('data-lh-settled', s); }
  };
  function wait(p) { // #20: until p settles, settled() is false; a rejection lands in errors
    pending++; refresh();
    const done = () => { pending--; refresh(); };
    Promise.resolve(p).then(done, err => { report(err); done(); });
    return p;
  }
  const off = engine.events.on(e => { if (e.type === 'scene' || e.type === 'overlay') refresh(); });
  engine.onRender(alpha => {
    if (disposed) return;
    reconcile();
    for (const e of active.slice()) if (active.some(a => same(a, e))) caught(() => views[e.name]?.frame?.(engine, alpha, view)); // snapshot; skip halves a previous frame exited
    view.dt = 0; refresh();
  });
  const hook = installEngine(engine, { driver, target, errors, after: refresh, busy: () => pending > 0, view });
  refresh();
  const dispose = () => {
    if (disposed) return; disposed = true;
    driver.stop(); for (const d of driver.devices) d.dispose?.();
    ui.dispose(); hook.dispose(); sa.remove(); off(); engine.onRender(() => {});
  };

  if (flags.lhTest) {
    driver.manual(true); // devices update and frames render every rAF, but the sim never steps
    const st = doc.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}';
    (doc.head ?? doc.documentElement).appendChild(st);
  }
  driver.start();
  return { engine, driver, ui, hook, view, dispose };
}
