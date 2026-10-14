// Wires engine + driver + devices + DOM UI + scene view halves (S-1) and installs window.engine.
import { createEngine } from '../core/engine.js';
import { parseFlags } from '../core/flags.js';
import { createDriver } from './driver.js';
import { createUiDom } from './uiDom.js';
import { installEngine } from './hook.js';
import { createPipeline, checkRender } from './render/pipeline.js';

export function defineView({ scenes, render } = {}) {
  if (!scenes || typeof scenes !== 'object') throw new Error('defineView: scenes required');
  for (const [n, s] of Object.entries(scenes)) for (const h of ['enter', 'exit', 'frame', 'built']) if (s[h] !== undefined && typeof s[h] !== 'function') throw new Error(`defineView: scene '${n}'.${h} must be a function`);
  checkRender(render); // overview §4.6: with render, boot builds the renderer, lights, compiler, assets, sync and audio
  const out = { scenes: Object.freeze({ ...scenes }) };
  if (render !== undefined) out.render = Object.freeze({ ...render });
  return Object.freeze(out);
}

export function boot(game, halves = { scenes: {} }, { root, doc, target = globalThis, seed, scene, args, flags, devices = [], raf, caf, canvas, timer, renderer } = {}) {
  doc ??= target.document ?? globalThis.document;
  flags ??= parseFlags(target.location?.search ?? '');
  const errors = [], views = halves.scenes ?? {};
  const report = err => errors.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack });
  if (flags.lhTest) { // test-only start overrides: ?scene=<name> and ?args=<json>
    const s = flags.extra?.scene; if (s) scene = s;
    const a = flags.extra?.args; if (a) { try { args = JSON.parse(a); } catch { /* ignore a malformed ?args */ } }
  }
  // [S-6] ?lh-test counts every step as a presented frame (deterministic; game.until never waits for a rAF)
  const engine = createEngine(game, { seed: flags.seed ?? seed ?? 1, scene, args, acks: flags.lhTest ? 'steps' : 'frames', timer });
  const view = { root: root ?? doc.body, doc, ui: null, driver: null, dt: 0, rawDt: 0, wait: p => wait(p), focus: id => focus(id) }; // #19: dt is the driver frame time (capped), rawDt uncapped (#56); both 0 for renders the driver didn't start
  const frameDt = { update(dt, raw = dt) { view.dt = dt; view.rawDt = raw; } }; // first device: later devices and the frame see this frame's dt
  const driver = createDriver(engine, { raf, caf, doc, devices: [frameDt, ...devices.map(f => f(engine))], onError: report });
  const sa = doc.createElement('style'); // safe-area vars, low specificity: inline/injected --lh-sa-* still win
  sa.textContent = ':root{--lh-sa-top:env(safe-area-inset-top,0px);--lh-sa-right:env(safe-area-inset-right,0px);--lh-sa-bottom:env(safe-area-inset-bottom,0px);--lh-sa-left:env(safe-area-inset-left,0px)}';
  (doc.head ?? doc.documentElement).appendChild(sa);
  const ui = createUiDom(engine, { root: root ?? doc.body, doc, errors, onTap: () => refresh() });
  view.ui = ui; view.driver = driver;
  const caught = fn => { try { fn(); } catch (err) { report(err); } };
  // overview §4.6: with defineView({ render }) the gfx, compiler, assets, sync and audio exist before any half enters
  const pipe = halves.render ? createPipeline(engine, view, halves.render, { doc, target, canvas, renderer, flags, report }) : null;

  // View halves follow the ACTUAL stack: each refresh diffs the previous and current entries (main scene keyed by name
  // plus its state object, which is new on every enter) and calls exit/enter for the differences, so nothing depends
  // on when 'scene'/'overlay' events flush.
  // #46: view.focus(testid) focuses the control once it exists and is enabled, unless the player moved focus first
  let want = null;
  const focus = id => { want = { id, before: doc.activeElement ?? null, scene: engine.scene.id, tries: 0 }; };
  const applyFocus = () => {
    if (!want) return;
    if (want.scene !== engine.scene.id) { want = null; return; } // a scene change: drop it quietly
    if (++want.tries > 5) { // a few renders without the control: give up, and say so under ?debug
      if (flags.debug) console.warn(`lion-hawk: view.focus('${want.id}') gave up: the control did not appear enabled after 5 refreshes`);
      want = null; return;
    }
    const a = doc.activeElement; if (a && a !== want.before && a !== doc.body) { want = null; return; }
    const el = doc.querySelector(`[data-testid="${String(want.id).replace(/["\\]/g, '\\$&')}"]`);
    if (el && !el.disabled) { want = null; el.focus?.({ preventScroll: true }); }
  };
  let active = [], busy = false, pending = 0, settledAttr, disposed = false;
  const entries = () => {
    const s = engine.scene, out = [];
    if (s.name !== undefined) out.push({ name: s.name, key: s.id, args: s.args });
    for (let i = 0; i < s.overlays.length; i++) out.push({ name: s.overlays[i], key: s.overlayIds[i], args: s.overlayArgs(s.overlays[i]) }); // #105
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
        ui.sync(); // #46: the entering halves see their scene's controls created, adopted and enabled
        for (const c of added) caught(() => views[c.name]?.enter?.(engine, view, c.args)); // #105: enter(engine, view, args)
        applyFocus();
      }
    } finally { busy = false; }
  }
  const refresh = () => {
    if (disposed) return;
    reconcile(); ui.sync(); applyFocus();
    const s = hook.settled() ? '1' : '0'; if (s !== settledAttr) { settledAttr = s; doc.documentElement.setAttribute('data-lh-settled', s); }
  };
  function wait(p) { // #20: until p settles, settled() is false; a rejection lands in errors. [S-6] it also blocks a settling load
    pending++; const release = engine.block('view.wait'); refresh();
    const done = () => { pending--; release(); refresh(); };
    Promise.resolve(p).then(done, err => { report(err); done(); });
    return p;
  }
  const off = engine.events.on(e => { if (e.type === 'scene' || e.type === 'overlay') refresh(); });
  // [S-6] a load's build: the loading scene's view half reacts in the same slot (built(engine, view)), so a view.wait it
  // starts blocks the load's settle before `then` runs, with step acks as with frame acks
  const offBuilt = engine.onBuilt((e, ctx) => {
    if (disposed) return;
    reconcile();
    const h = active.find(a => a.name === ctx.name && a.key === ctx.id);
    if (h) caught(() => views[h.name]?.built?.(engine, view));
    refresh();
  });
  const offRender = engine.onRender(alpha => {
    if (disposed) return;
    reconcile();
    if (pipe) { try { pipe.frame(alpha); } catch (err) { report(err); } } // §4.6: sync.frame before the halves
    for (const e of active.slice()) if (active.some(a => same(a, e))) caught(() => views[e.name]?.frame?.(engine, alpha, view)); // snapshot; skip halves a previous frame exited
    if (pipe) { try { pipe.draw(); } catch (err) { report(err); } } // one renderer.render(scene, camera) after the halves
    view.dt = view.rawDt = 0; refresh();
  });
  const hook = installEngine(engine, { driver, target, errors, after: refresh, busy: () => pending > 0, view });
  refresh();
  const dispose = () => {
    if (disposed) return; disposed = true; want = null;
    driver.stop(); for (const d of driver.devices) d.dispose?.();
    ui.dispose(); hook.dispose(); sa.remove(); off(); offBuilt(); offRender();
    pipe?.dispose();
  };

  if (flags.lhTest) {
    driver.manual(flags.lhRender ? 'all' : true); // devices update and frames render every rAF (not with ?lh-test=render, #47), but the sim never steps
    const st = doc.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}';
    (doc.head ?? doc.documentElement).appendChild(st);
  }
  driver.start();
  return { engine, driver, ui, hook, view, dispose };
}
