// Wires engine + driver + devices + DOM UI + scene view halves (S-1) and installs window.engine.
import { createEngine } from '../core/engine.js';
import { parseFlags } from '../core/flags.js';
import { createDriver } from './driver.js';
import { createUiDom } from './uiDom.js';
import { installEngine, REPLAY_KEY } from './hook.js';
import { checkTape, tapeStart, replayTape } from '../core/tape.js';
import { checksum } from '../core/checksum.js';
import { createPipeline, checkRender } from './render/pipeline.js';
import { bindMenuNav } from './menuNav.js';
import { createSeats } from './seats.js';
import { createHaptics } from './haptics.js';
import { createDebugRegistry, checkPanel } from './debug/registry.js';

export function defineView({ scenes, render, haptics, debug, debugKey } = {}) {
  if (!scenes || typeof scenes !== 'object') throw new Error('defineView: scenes required');
  for (const [n, s] of Object.entries(scenes)) for (const h of ['enter', 'exit', 'frame', 'built']) if (s[h] !== undefined && typeof s[h] !== 'function') throw new Error(`defineView: scene '${n}'.${h} must be a function`);
  checkRender(render); // overview §4.6: with render, boot builds the renderer, lights, compiler, assets, sync and audio
  // [C-14] haptics: { autoStop: false } turns the engine's rumble stops off
  if (haptics !== undefined && (haptics === null || typeof haptics !== 'object' || Object.keys(haptics).some(k => k !== 'autoStop') || (haptics.autoStop !== undefined && typeof haptics.autoStop !== 'boolean'))) {
    throw new Error('defineView: haptics must be { autoStop: boolean }');
  }
  // [D-9] debug: panels listed for the whole page; [D-8] debugKey: the hotkey's KeyboardEvent.code, or false for none
  if (debug !== undefined) {
    if (!Array.isArray(debug)) throw new Error('defineView: debug must be an array of panels');
    const ids = new Set();
    for (const p of debug) { checkPanel(p); if (ids.has(p.id)) throw new Error(`debug: panel '${p.id}' is already registered`); ids.add(p.id); }
  }
  if (debugKey !== undefined && debugKey !== false && !(typeof debugKey === 'string' && debugKey)) throw new Error(`defineView: debugKey must be a KeyboardEvent.code or false (got ${JSON.stringify(debugKey)})`);
  const out = { scenes: Object.freeze({ ...scenes }) };
  if (render !== undefined) out.render = Object.freeze({ ...render });
  if (haptics !== undefined) out.haptics = Object.freeze({ ...haptics });
  if (debug !== undefined) out.debug = Object.freeze([...debug]);
  if (debugKey !== undefined) out.debugKey = debugKey;
  return Object.freeze(out);
}

export function boot(game, halves = { scenes: {} }, { root, doc, target = globalThis, seed, scene, args, flags, devices = [], raf, caf, canvas, timer, renderer, nav, getGamepads, storage } = {}) {
  doc ??= target.document ?? globalThis.document;
  flags ??= parseFlags(target.location?.search ?? '');
  const errors = [], views = halves.scenes ?? {};
  const report = err => errors.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack });
  if (flags.lhTest) { // test-only start overrides: ?scene=<name> and ?args=<json>
    const s = flags.extra?.scene; if (s) scene = s;
    const a = flags.extra?.args; if (a) { try { args = JSON.parse(a); } catch { /* ignore a malformed ?args */ } }
  }
  // [D-4] ?lh-test&replay=session: a restore reloaded the page; the snapshot's tape sets the start and is replayed below
  let snap = null;
  if (flags.lhTest && flags.replay === 'session') {
    try {
      const text = target.sessionStorage?.getItem(REPLAY_KEY);
      if (text == null) throw new Error('engine: ?replay=session but no snapshot in sessionStorage');
      target.sessionStorage.removeItem(REPLAY_KEY); // used once: a reload starts fresh
      snap = JSON.parse(text); checkTape(game, snap.tape);
    } catch (err) { report(err); snap = null; }
  }
  const start = snap ? tapeStart(snap.tape) : { seed: flags.seed ?? seed ?? 1, scene, args };
  // [S-6] ?lh-test counts every step as a presented frame (deterministic; game.until never waits for a rAF)
  const engine = createEngine(game, { ...start, acks: flags.lhTest ? 'steps' : 'frames', timer, record: flags.lhRecord === true });
  // [C-5]–[C-13] seats: one seat holding every device until view.seats() is called; polled before the game's devices
  const seats = createSeats(engine, { getGamepads, target, doc, storage, onError: report });
  // [C-14] the haptics lifecycle: stops the rumble a hide, blur or pausing overlay would leave running; after the seats
  const haptics = halves.haptics?.autoStop === false ? null : createHaptics(engine, { seats, target, doc });
  // view.haptics: the game's handle on the lifecycle (null with autoStop false); it sends no rumble of its own
  const hapticsView = haptics ? Object.freeze({ stop: reason => haptics.stop(reason), get stopping() { return haptics.stopping > 0; }, get paused() { return haptics.paused; } }) : null;
  // [D-8] ?debug or ?fps: the debug panel host. Only behind a flag: a slot device and a dynamic import (inlined by the build,
  // never evaluated without a flag), so a page without one pays nothing. view.debug is always there: without the host,
  // panel() checks its definition and lists it for nobody ([D-9]). The pads panel gets a read-only view of the seats.
  const debugOn = flags.debug === true || flags.fps === true;
  const debugs = createDebugRegistry({ on: debugOn });
  for (const p of halves.debug ?? []) debugs.api.panel(p);
  let host = null;
  const hostSlot = debugOn ? { update(dt, raw) { host?.update(dt, raw); }, dispose() { host?.dispose(); host = null; } } : null;
  const view = { root: root ?? doc.body, doc, ui: null, driver: null, dt: 0, rawDt: 0, wait: p => wait(p), focus: id => focus(id), // #19: dt is the driver frame time (capped), rawDt uncapped (#56); both 0 for renders the driver didn't start
    haptics: hapticsView, debug: debugs.api,
    seats: o => { seats.enable(o); return seats.list; }, context: (name, def) => seats.context(name, def), device: (kind, spec) => seats.kind(kind, spec),
    onSeat: fn => seats.on(fn), unpaired: () => seats.unpaired(), gamepad: dev => seats.gamepad(dev), get localPlayers() { return seats.list; } };
  const frameDt = { update(dt, raw = dt) { view.dt = dt; view.rawDt = raw; } }; // first device: later devices and the frame see this frame's dt
  // U-7: the menu navigator, when any scene declares nav (opt out with nav: false); after the game's devices
  const navOn = nav !== false && Object.values(game.scenes).some(s => s.nav);
  view.nav = navOn ? bindMenuNav(engine, { doc, target, getGamepads }) : null;
  const driver = createDriver(engine, { raf, caf, doc, devices: [frameDt, seats, ...(haptics ? [haptics] : []), ...devices.map(f => f(engine)), ...(view.nav ? [view.nav] : []), ...(hostSlot ? [hostSlot] : [])], onError: report });
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
  const isActive = e => { for (let i = 0; i < active.length; i++) if (same(active[i], e)) return true; return false; };
  // R-8: the stack as last reconciled (main key, then overlay keys), so a frame with no scene change allocates nothing
  const keys = [];
  const unchanged = () => {
    const s = engine.scene, n = (s.name !== undefined ? 1 : 0) + s.overlays.length;
    if (n !== keys.length || active.length !== n) return false;
    let k = 0;
    if (s.name !== undefined && (keys[k++] !== s.id || active[0].name !== s.name)) return false;
    for (let i = 0; i < s.overlayIds.length; i++, k++) if (keys[k] !== s.overlayIds[i] || active[k].name !== s.overlays[i]) return false;
    return true;
  };
  function reconcile() {
    if (busy || unchanged()) return; busy = true;
    try {
      for (let guard = 0; guard < 16; guard++) {
        const cur = entries(), gone = active.filter(a => !cur.some(c => same(a, c))), added = cur.filter(c => !active.some(a => same(a, c)));
        if (!gone.length && !added.length) { keys.length = 0; for (const a of active) keys.push(a.key); break; }
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
    reconcile(); ui.sync(); applyFocus(); view.nav?.sync(); // U-7: a new menu's entry is focused once its controls exist
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
    const list = active; // a snapshot: active is replaced, never changed in place; skip halves a previous frame exited
    for (let i = 0; i < list.length; i++) { const e = list[i], h = views[e.name]; if (h?.frame && (list === active || isActive(e))) { try { h.frame(engine, alpha, view); } catch (err) { report(err); } } } // on its half: a half's frame may use `this`
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
  if (debugOn) {
    import('./debug/host.js').then(m => {
      if (disposed) return;
      const bench = { view: { get localPlayers() { return seats.list; }, unpaired: () => seats.unpaired(), gamepad: d => seats.gamepad(d), onSeat: fn => seats.on(fn) }, haptics };
      host = m.openDebugHost({ registry: debugs, engine, view, doc, target, flags, storage, key: halves.debugKey ?? 'Backquote', report, bench });
    }).catch(report);
  }
  if (snap) { // [D-4] replay the restored snapshot before the first frame; a mismatch lands in errors
    try {
      replayTape(engine, snap.tape);
      const got = checksum(engine.state());
      if (got !== snap.checksum) throw new Error(`engine: replay=session: the replayed state differs from the snapshot (checksum ${got} vs ${snap.checksum})`);
    } catch (err) { report(err); }
    refresh();
  }
  driver.start();
  return { engine, driver, ui, hook, view, dispose };
}
