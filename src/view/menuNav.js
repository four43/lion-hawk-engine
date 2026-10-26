// U-7: the menu navigator, a view device. While a scene with `nav` (U-9) is the topmost menu, the D-pad, the left stick
// and the arrow keys move real DOM focus among that menu's controls, A/Enter activates, B/Esc/Start go Back, LB/RB step
// a choice row (the menu's nav.shoulders row, if it names one: that row is then left out of pad focus), and X, Y, View
// and Start run the menu's nav.buttons (Start goes Back when it has none). In gameplay it watches the menus' nav.open triggers (a tap or a hold) and asks the sim to open them.
// Focus is presentation (view-only, not recorded); activation goes through the control (a click -> engine.ui.tap, or
// engine.ui.press/release for a hold), Back and Open through the lh.back / lh.open commands, so both are recorded.
// It also keeps <html data-lh-input="pad|keys|pointer|touch"> and data-lh-pad="<family>" current (U-10).
import { pickNeighbour } from '../core/navScore.js';
import { topNav, menuOwnsInput } from '../core/nav.js';
import { createPadEdges } from './padEdges.js';

const KEY_DIRS = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
const TEXT = 'input, textarea, select, [contenteditable]';
const esc = s => String(s).replace(/["\\]/g, '\\$&');
const defaultRect = el => el.getBoundingClientRect();

export function bindMenuNav(engine, { doc, target, getGamepads, rectOf = defaultRect, focusTries = 10 } = {}) {
  target = target ?? globalThis.window; doc = doc ?? target?.document ?? globalThis.document;
  const game = engine.game, html = doc.documentElement, pe = createPadEdges({ getGamepads });
  const st = { last: 'pointer', family: 'xbox', menu: undefined }; // read by tests and window.engine.view.nav
  let shownInput, shownPad;
  const show = () => {
    if (st.last !== shownInput) { shownInput = st.last; html.setAttribute('data-lh-input', st.last); }
    if (st.family !== shownPad) { shownPad = st.family; html.setAttribute('data-lh-pad', st.family); }
  };
  const visible = () => st.last === 'pad' || st.last === 'keys';

  // ---- candidates: a scene's registered controls (data-testid "<scene>.<id>") plus anything inside
  // [data-lh-nav-scope~="<scene>"] (game markup outside the registry); text inputs are skipped unless marked data-lh-nav
  const usable = el => {
    if (!el || el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false;
    if (el.matches?.(TEXT) && !el.hasAttribute('data-lh-nav')) return false;
    if (el.closest?.('[hidden], [inert]')) return false;
    const r = rectOf(el); return r.width > 0 && r.height > 0;
  };
  const collect = (scene, out) => {
    const sh = st.last === 'pad' ? game.scenes[scene]?.nav?.shoulders : undefined, skip = sh === undefined ? null : `${scene}.${sh}.`; // the shoulders own that row
    for (const el of doc.querySelectorAll(`[data-testid^="${esc(scene)}."]`)) if ((el.tagName === 'BUTTON' || el.hasAttribute('data-lh-nav')) && !out.includes(el) && usable(el) && !(skip && el.getAttribute('data-testid').startsWith(skip))) out.push(el);
    for (const el of doc.querySelectorAll(`[data-lh-nav-scope~="${esc(scene)}"] button, [data-lh-nav-scope~="${esc(scene)}"] [data-lh-nav]`)) if (!out.includes(el) && usable(el)) out.push(el);
    return out;
  };
  // scope lists, top first: the menu alone when modal; else the menu, then each scene below it down to the main scene
  const scopes = menu => {
    const lists = [collect(menu, [])];
    if (game.scenes[menu].nav.modal) return lists;
    const ov = engine.scene.overlays, i = ov.lastIndexOf(menu);
    for (let k = i - 1; k >= 0; k--) lists.push(collect(ov[k], []));
    if (engine.scene.name !== undefined) lists.push(collect(engine.scene.name, []));
    return lists;
  };
  const inScope = (menu, el) => !!el && scopes(menu).some(l => l.includes(el));
  const rect = el => { const r = rectOf(el); return { x: r.left ?? r.x, y: r.top ?? r.y, w: r.width, h: r.height }; };

  // ---- focus, remembered per menu instance (overlay id)
  const remembered = new Map(); let pending = null; // pending: { key, tries } focus the menu's entry once it exists
  const menuKey = menu => { const ov = engine.scene.overlays, i = ov.lastIndexOf(menu); return i < 0 ? undefined : engine.scene.overlayIds[i]; };
  const focusEl = (menu, el) => {
    el.focus?.({ preventScroll: true, focusVisible: visible() });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const k = menuKey(menu); if (k !== undefined) remembered.set(k, el.getAttribute('data-testid') ?? el);
  };
  const byId = id => doc.querySelector(`[data-testid="${esc(id)}"]`);
  const entry = menu => { // remembered, then nav.initial, then the menu's first control
    const r = remembered.get(menuKey(menu)), first = collect(menu, []);
    const want = typeof r === 'string' ? byId(r) : r;
    if (want && first.includes(want)) return want;
    const init = game.scenes[menu].nav.initial; const ie = init ? byId(init) : null;
    if (ie && usable(ie)) return ie;
    return first[0];
  };
  const settle = () => { // called every update while a menu is up and nothing in it has focus yet
    if (!pending) return;
    const menu = st.menu; if (menu === undefined || pending.key !== menuKey(menu)) { pending = null; return; }
    if (inScope(menu, doc.activeElement)) { pending = null; return; } // the player (or a click) got there first
    const el = entry(menu);
    if (el) { pending = null; focusEl(menu, el); } else if (++pending.tries > focusTries) pending = null;
  };

  // ---- actions
  const move = dir => {
    const menu = st.menu, lists = scopes(menu), cur = doc.activeElement;
    let from = -1, list = lists[0];
    for (const l of lists) { const i = l.indexOf(cur); if (i >= 0) { from = i; list = l; break; } }
    if (from < 0) { const el = entry(menu); if (el) focusEl(menu, el); return; } // focus wasn't in the menu: land on its entry first
    const over = cur.getAttribute(`data-lh-nav-${dir}`);
    if (over === 'none') return;
    if (over) { const el = byId(over); if (el && usable(el)) focusEl(menu, el); return; }
    const r0 = rect(cur);
    let i = pickNeighbour(from, dir, list.map(rect));
    if (i >= 0) return focusEl(menu, list[i]);
    for (const l of lists) { if (l === list || !l.length) continue; i = pickNeighbour(r0, dir, l.map(rect)); if (i >= 0) return focusEl(menu, l[i]); } // non-modal: fall through below
  };
  let holding = null; // the hold control A is pressing (released with A)
  const controlOf = el => { const id = el?.getAttribute?.('data-testid'); if (!id) return null; const v = engine.ui.view(); for (let i = 0; i < v.length; i++) if (v[i].id === id) return v[i]; return null; };
  const activate = () => {
    const menu = st.menu, el = doc.activeElement;
    if (!inScope(menu, el)) { const e = entry(menu); if (e) focusEl(menu, e); return; }
    const c = controlOf(el);
    if (c?.role === 'hold') { if (c.enabled) { holding = c.id; try { engine.ui.press(c.id); } catch { holding = null; } } return; }
    el.click?.();
  };
  const lift = () => { if (holding !== null) { const id = holding; holding = null; engine.ui.release(id); } };
  const cycle = step => { // LB/RB: the menu's shoulders row, else the focused choice row, else the menu's first; no wrap
    const menu = st.menu, v = engine.ui.view(), el = doc.activeElement, mine = controlOf(el), sh = game.scenes[menu].nav.shoulders;
    let group = sh !== undefined ? `${menu}.${sh}` : mine?.role === 'choice' ? mine.group : undefined;
    if (!group) for (let i = 0; i < v.length; i++) if (v[i].role === 'choice' && v[i].scene === menu && v[i].enabled) { group = v[i].group; break; }
    if (!group) return;
    const opts = []; for (let i = 0; i < v.length; i++) if (v[i].group === group && v[i].enabled) opts.push(v[i].id);
    let at = -1; for (let i = 0; i < v.length; i++) if (v[i].group === group && v[i].pressed) at = opts.indexOf(v[i].id);
    const to = at < 0 ? 0 : at + step; if (to < 0 || to >= opts.length || to === at) return;
    const t = byId(opts[to]); if (!t) return;
    t.click?.();
    if (mine?.group === group) focusEl(menu, t);
  };
  const back = () => { engine.command('lh.back'); };
  const PRESS = ['x', 'y', 'select', 'start'];
  const pressNav = (menu, pad) => { // nav.buttons: the menu's own X, Y, View and Start; Start without one is Back
    const bs = game.scenes[menu].nav.buttons;
    for (let i = 0; i < PRESS.length; i++) {
      const b = PRESS[i]; if (!pad.pressed[b]) continue;
      if (bs?.[b] !== undefined) engine.command('lh.press', { button: b }); else if (b === 'start') back();
    }
  };

  // ---- open triggers (U-9 nav.open): per source (a pad button or a key), the tap and hold menus it opens
  const triggers = new Map(); // 'pad:start' | 'key:escape' -> { opens: [{ name, seconds }], down, t, fired, armed }
  for (const [name, s] of Object.entries(game.scenes)) {
    const o = s.nav?.open; if (!o) continue;
    for (const src of [o.button !== undefined ? `pad:${o.button}` : null, o.key !== undefined ? `key:${o.key.toLowerCase()}` : null]) {
      if (!src) continue;
      let tr = triggers.get(src); if (!tr) triggers.set(src, tr = { opens: [], down: false, t: 0, fired: false, armed: false });
      tr.opens.push({ name, seconds: o.seconds ?? 0 });
    }
  }
  const padTriggers = [], keyTriggers = []; // flat lists, so update() walks them without allocating (R-8)
  for (const [src, tr] of triggers) {
    tr.opens.sort((a, b) => a.seconds - b.seconds); tr.minHold = tr.opens.find(o => o.seconds > 0)?.seconds ?? Infinity; tr.tap = tr.opens.find(o => o.seconds === 0);
    if (src.startsWith('pad:')) { tr.button = src.slice(4); padTriggers.push(tr); } else keyTriggers.push(tr);
  }
  const open = name => { engine.command('lh.open', { name }); };
  const press = tr => { // a press seen outside a menu arms the trigger; a tap with no hold sharing its source fires now
    tr.down = true; tr.t = 0; tr.fired = false; tr.armed = st.menu === undefined || !menuOwnsInput(game, engine.scene.overlays);
    if (tr.armed && tr.tap && tr.minHold === Infinity) { tr.fired = true; open(tr.tap.name); }
  };
  const release = tr => { // a tap that shares its source with a hold fires on release, if the hold never did
    if (tr.down && tr.armed && !tr.fired && tr.tap && tr.minHold < Infinity && tr.t < tr.minHold) open(tr.tap.name);
    tr.down = false; tr.armed = false;
  };
  const tick = (tr, dt) => {
    if (!tr.down || !tr.armed || tr.fired) return;
    tr.t += dt;
    for (let i = tr.opens.length - 1; i >= 0; i--) { const o = tr.opens[i]; if (o.seconds > 0 && tr.t >= o.seconds - 1e-9) { tr.fired = true; open(o.name); return; } }
  };

  // ---- devices: keys and pointer kind
  const keysDown = new Set();
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    sync(); // keys arrive between frames, maybe after a step changed the stack: read it live
    const k = String(e.key).toLowerCase();
    if (k !== 'shift' && k !== 'control' && k !== 'alt' && k !== 'meta') st.last = 'keys';
    const tr = triggers.get(`key:${k}`);
    if (st.menu !== undefined) {
      if (e.target?.closest?.(TEXT) && k !== 'escape') return; // typing in a field: only Esc reaches the menu
      if (k === 'escape') { e.preventDefault?.(); if (!e.repeat) back(); return; }
      const dir = KEY_DIRS[k];
      if (dir) { e.preventDefault?.(); if (!e.repeat) move(dir); return; }
      if (k === 'enter' && !inScope(st.menu, doc.activeElement)) { e.preventDefault?.(); const el = entry(st.menu); if (el) focusEl(st.menu, el); }
      if (tr && !e.repeat) { tr.down = true; tr.armed = false; } // held across a menu: never opens anything
      return;
    }
    if (tr && !e.repeat && !keysDown.has(k)) { keysDown.add(k); press(tr); }
  };
  const onKeyUp = e => { const k = String(e.key).toLowerCase(); keysDown.delete(k); const tr = triggers.get(`key:${k}`); if (tr) release(tr); };
  const onPointer = e => { st.last = e.pointerType === 'mouse' ? 'pointer' : 'touch'; };
  const onBlur = () => { keysDown.clear(); for (const tr of triggers.values()) { tr.down = false; tr.armed = false; } lift(); };
  target?.addEventListener('keydown', onKey); target?.addEventListener('keyup', onKeyUp); target?.addEventListener('blur', onBlur);
  doc.addEventListener('pointerdown', onPointer, true);

  let shownKey; // the menu instance focus was last placed for
  // follows the stack: a new menu instance gets its entry focused. boot calls it right after each UI sync (as view.focus
  // was), so focus lands the moment the menu's controls exist; update() and the key handlers call it too.
  function sync() {
    const menu = topNav(game, engine.scene.overlays), key = menu === undefined ? undefined : menuKey(menu);
    st.menu = menu;
    if (key !== shownKey) { shownKey = key; lift(); pending = menu === undefined ? null : { key, tries: 0 }; }
    if (menu !== undefined) settle();
    return menu;
  }
  function update(dt = 0, raw = dt) { // holds count raw (uncapped) frame time: a slow frame must not stretch a 2 s hold (#56)
    const pad = pe.update();
    if (pad.active) { st.last = 'pad'; st.family = pad.family; }
    show();
    const menu = sync();
    if (menu !== undefined) {
      const owns = menuOwnsInput(game, engine.scene.overlays);
      // a shared sub-menu leaves the stick to the game: only the D-pad navigates it
      const dir = owns ? pad.dir : (pad.pressed.up ? 'up' : pad.pressed.down ? 'down' : pad.pressed.left ? 'left' : pad.pressed.right ? 'right' : null);
      if (dir) move(dir);
      if (pad.pressed.a) activate();
      if (pad.released.a) lift();
      if (pad.pressed.b) back();
      pressNav(menu, pad);
      if (pad.pressed.lb) cycle(-1); else if (pad.pressed.rb) cycle(1);
    }
    for (let i = 0; i < keyTriggers.length; i++) tick(keyTriggers[i], raw);
    for (let i = 0; i < padTriggers.length; i++) {
      const tr = padTriggers[i], b = tr.button;
      if (pad.pressed[b]) press(tr); else if (pad.released[b]) release(tr);
      tick(tr, raw);
    }
  }
  function dispose() {
    target?.removeEventListener('keydown', onKey); target?.removeEventListener('keyup', onKeyUp); target?.removeEventListener('blur', onBlur);
    doc.removeEventListener('pointerdown', onPointer, true);
    lift(); html.removeAttribute('data-lh-input'); html.removeAttribute('data-lh-pad');
  }
  return { update, sync, dispose, state: st, move, activate, back };
}
