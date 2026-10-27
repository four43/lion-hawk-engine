// [D-8]–[D-10] the debug panel host. boot loads it only behind ?debug or ?fps. It draws one fixed layer over the page: a
// dock (a corner button and the list of panels) and a window per open panel, dragged by its title bar and resized by a
// grip with pointer events, so mouse, pen and touch behave the same. The layout (which windows are open, where, the dock
// corner, the hidden layer) is kept per game in localStorage. Each window is kept against its nearest edges, so a layout
// made in landscape still fits in portrait. update(dt, raw) is a driver device: it runs open panels at their rate.
import { createControls } from './controls.js';
import { perfPanel, padsPanel } from './panels.js';

const CSS = `[data-lh-debug]{position:fixed;inset:0;pointer-events:none;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#e6edf3}
[data-lh-debug][hidden],[data-lh-debug] [hidden]{display:none!important}
[data-lh-debug] button{font:inherit;color:inherit;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:2px 6px;cursor:pointer}
[data-lh-debug-dock]{position:absolute;pointer-events:auto;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
[data-lh-debug-corner=tl]{top:calc(var(--lh-sa-top,0px) + 8px);left:calc(var(--lh-sa-left,0px) + 8px)}
[data-lh-debug-corner=tr]{top:calc(var(--lh-sa-top,0px) + 8px);right:calc(var(--lh-sa-right,0px) + 8px);align-items:flex-end}
[data-lh-debug-corner=bl]{bottom:calc(var(--lh-sa-bottom,0px) + 8px);left:calc(var(--lh-sa-left,0px) + 8px);flex-direction:column-reverse}
[data-lh-debug-corner=br]{bottom:calc(var(--lh-sa-bottom,0px) + 8px);right:calc(var(--lh-sa-right,0px) + 8px);flex-direction:column-reverse;align-items:flex-end}
[data-lh-debug] [data-lh-debug-toggle]{width:32px;height:32px;border-radius:16px;padding:0;background:#0d1117e0;touch-action:none}
[data-lh-debug-list]{background:#0d1117f0;border:1px solid #30363d;border-radius:6px;padding:6px 8px;min-width:160px}
[data-lh-debug-list] label{display:flex;gap:6px;align-items:center;padding:2px 0}
[data-lh-debug-panel]{position:absolute;pointer-events:auto;display:flex;flex-direction:column;box-sizing:border-box;background:#0d1117f0;border:1px solid #30363d;border-radius:6px;box-shadow:0 4px 16px #0008;overflow:hidden}
[data-lh-debug-bar]{display:flex;align-items:center;gap:2px;height:24px;flex:none;padding:0 2px 0 8px;background:#161b22;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
[data-lh-debug-bar] span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-lh-debug] [data-lh-debug-bar] button{background:none;border:none;padding:0 6px}
[data-lh-debug-body]{flex:1;min-height:0;overflow:auto;padding:6px 8px}
[data-lh-debug-grip]{position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 55%,#484f58 55%)}
[data-lh-debug-row]{display:flex;gap:8px;align-items:center;justify-content:space-between}
[data-lh-debug-row] input[type=range]{flex:1}
[data-lh-debug-value]{font-variant-numeric:tabular-nums}
[data-lh-debug] table{width:100%;border-collapse:collapse;font:inherit;color:inherit}[data-lh-debug] th{color:#7d8590;font-weight:normal}[data-lh-debug] td,[data-lh-debug] th{padding:1px 4px;text-align:left;white-space:nowrap}
[data-lh-debug] details{margin:4px 0}[data-lh-debug] summary{cursor:pointer;color:#7d8590}
[data-lh-debug-error]{color:#f85149;white-space:pre-wrap;margin-bottom:4px}`;
const MIN_W = 160, MIN_H = 60, BAR = 24, GAP = 12, TOP = 48, STEP = 24, DRAG = 4, Z = 1;
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const fresh = () => ({ v: 1, dock: 'tl', hidden: false, panels: {} });
const num = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const NOT_TEXT = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color'];
const typing = t => !!t && (t.isContentEditable === true || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !NOT_TEXT.includes(t.type)));

// registry: createDebugRegistry()'s host side. bench: { view, haptics } for the pads panel, or null. storage: undefined
// is the page's localStorage, null keeps nothing. key: a KeyboardEvent.code, or false for no hotkey.
export function openDebugHost({ registry, engine, view, doc, target = globalThis, flags, storage, key = 'Backquote', report = err => console.error(err), bench = null }) {
  const KEY = `lh.debug.${engine.game.id}`;
  const store = () => { try { return (storage === undefined ? target.localStorage : storage) ?? null; } catch { return null; } };
  const save = () => { try { store()?.setItem(KEY, JSON.stringify(layout)); } catch { /* nothing kept */ } };
  let layout = (() => {
    try {
      const t = store()?.getItem(KEY), o = typeof t === 'string' ? JSON.parse(t) : null;
      if (o && o.v === 1 && o.panels && typeof o.panels === 'object') return { v: 1, dock: CORNERS.includes(o.dock) ? o.dock : 'tl', hidden: o.hidden === true, panels: o.panels };
    } catch { /* a bad or unreadable layout: start fresh */ }
    return fresh();
  })();
  // [D-10] ?debug=<topics> opens those panels, ?fps opens perf; a bare ?debug reopens the saved ones
  const wanted = new Set(flags.debugs ?? []); if (flags.fps) wanted.add('perf');
  const useLayout = flags.debug === true && (flags.debugs?.length ?? 0) === 0;
  if (wanted.size) layout.hidden = false;
  const vw = () => target.innerWidth || doc.documentElement.clientWidth || 1, vh = () => target.innerHeight || doc.documentElement.clientHeight || 1;
  const el = (tag, attrs = {}, text) => { const e = doc.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const capture = (e, id) => { try { e.setPointerCapture?.(id); } catch { /* a synthetic pointer */ } };

  const style = el('style', { 'data-lh-debug-style': '' }, CSS); (doc.head ?? doc.documentElement).appendChild(style);
  const layer = el('div', { 'data-lh-debug': '' }); layer.style.zIndex = '2147483000'; layer.hidden = layout.hidden;
  const dock = el('div', { 'data-lh-debug-dock': '', 'data-lh-debug-corner': layout.dock });
  const toggle = el('button', { type: 'button', 'data-lh-debug-toggle': '', 'aria-label': 'debug panels', title: 'debug panels' }, '⚙');
  const list = el('div', { 'data-lh-debug-list': '' }), items = el('div'), reset = el('button', { type: 'button', 'data-lh-debug-reset': '' }, 'reset layout');
  list.hidden = true; list.append(items, reset); dock.append(toggle, list); layer.appendChild(dock); doc.body.appendChild(layer);

  // the dock button: a click opens the list; a drag moves the dock and snaps it to the nearest corner on release
  let dd = null, dragged = false;
  toggle.addEventListener('pointerdown', e => { dd = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; dragged = false; capture(toggle, e.pointerId); });
  toggle.addEventListener('pointermove', e => {
    if (!dd || e.pointerId !== dd.id) return;
    if (!dd.moved && Math.hypot(e.clientX - dd.x, e.clientY - dd.y) < DRAG) return;
    dd.moved = true; dock.removeAttribute('data-lh-debug-corner');
    dock.style.left = `${clamp(e.clientX - 16, 0, vw() - 32)}px`; dock.style.top = `${clamp(e.clientY - 16, 0, vh() - 32)}px`;
  });
  const dockUp = e => {
    if (!dd || e.pointerId !== dd.id) return;
    if (dd.moved) {
      layout.dock = (e.clientY < vh() / 2 ? 't' : 'b') + (e.clientX < vw() / 2 ? 'l' : 'r');
      dock.style.left = dock.style.top = ''; dock.setAttribute('data-lh-debug-corner', layout.dock); dragged = true; save();
    }
    dd = null;
  };
  toggle.addEventListener('pointerup', dockUp); toggle.addEventListener('pointercancel', dockUp);
  toggle.addEventListener('click', () => { if (dragged) { dragged = false; return; } list.hidden = !list.hidden; });

  const recs = new Map(); // id → { def, item, box, win, body, grip, controls, g, open, collapsed, mounted, broken, acc }
  const seen = new Map(); // id → open, for a panel listed again later in the page's life
  let z = Z;
  const entry = r => (layout.panels[r.def.id] ??= {});
  const keep = r => { Object.assign(entry(r), { open: r.open, collapsed: r.collapsed }, r.g); save(); };

  // r.g = { ax, x, ay, y, w, h }: the window's size and its distance from its nearest edges
  function setBox(r, left, top, w, h) {
    const W = vw(), H = vh(), hh = r.collapsed ? BAR : h;
    left = clamp(left, 0, Math.max(0, W - w)); top = clamp(top, 0, Math.max(0, H - hh));
    const ax = left + w / 2 <= W / 2 ? 'l' : 'r', ay = top + hh / 2 <= H / 2 ? 't' : 'b';
    r.g = { ax, x: ax === 'l' ? left : W - left - w, ay, y: ay === 't' ? top : H - top - hh, w, h };
    place(r);
  }
  function place(r) {
    const W = vw(), H = vh(), g = r.g, w = Math.min(g.w, W), h = Math.min(g.h, H), hh = r.collapsed ? BAR : h;
    const left = clamp(g.ax === 'l' ? g.x : W - w - g.x, 0, Math.max(0, W - w)), top = clamp(g.ay === 't' ? g.y : H - hh - g.y, 0, Math.max(0, H - hh));
    const s = r.win.style; s.left = `${left}px`; s.top = `${top}px`; s.width = `${w}px`; s.height = r.collapsed ? '' : `${h}px`;
    return { left, top, w, h };
  }
  const front = r => { r.win.style.zIndex = String(++z); };
  function fail(r, err) {
    report(err); r.broken = true;
    const m = el('div', { 'data-lh-debug-error': '' }, `${r.def.title}: ${err?.message ?? err}`); r.body.prepend(m);
  }

  function build(r) {
    const { id, title } = r.def;
    const win = r.win = el('section', { 'data-lh-debug-panel': id, 'aria-label': title });
    const bar = el('header', { 'data-lh-debug-bar': '' }), name = el('span', {}, title);
    const col = el('button', { type: 'button', 'data-lh-debug-collapse': '', 'aria-label': `collapse ${title}` }, '▾');
    const close = el('button', { type: 'button', 'data-lh-debug-close': '', 'aria-label': `close ${title}` }, '×');
    bar.append(name, col, close);
    r.body = el('div', { 'data-lh-debug-body': id }); r.grip = el('div', { 'data-lh-debug-grip': '' });
    win.append(bar, r.body, r.grip); layer.appendChild(win);
    r.controls = createControls(r.body, { doc, report });
    win.addEventListener('pointerdown', () => front(r), true);
    col.addEventListener('click', () => collapse(r, !r.collapsed));
    close.addEventListener('click', () => hide(r));
    // drags: the title bar moves the window, the grip resizes it; both clamp to the viewport as they go
    let drag = null;
    const down = mode => e => {
      if (mode === 'move' && e.target !== bar && e.target !== name) return; // the bar's buttons are not handles
      const p = place(r); drag = { mode, id: e.pointerId, x: e.clientX, y: e.clientY, ...p }; capture(e.currentTarget, e.pointerId); e.preventDefault?.();
    };
    const move = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.mode === 'move') setBox(r, drag.left + dx, drag.top + dy, r.g.w, r.g.h);
      else setBox(r, drag.left, drag.top, clamp(drag.w + dx, MIN_W, Math.max(MIN_W, vw() - drag.left)), clamp(drag.h + dy, MIN_H, Math.max(MIN_H, vh() - drag.top)));
    };
    const up = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; keep(r); };
    for (const [h, mode] of [[bar, 'move'], [r.grip, 'size']]) {
      h.addEventListener('pointerdown', down(mode)); h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }
    geometry(r);
  }
  // the saved place, or a cascade from the top-right
  function geometry(r) {
    const s = layout.panels[r.def.id];
    if (s && num(s.x) && num(s.y) && num(s.w) && num(s.h) && (s.ax === 'l' || s.ax === 'r') && (s.ay === 't' || s.ay === 'b')) {
      r.g = { ax: s.ax, x: s.x, ay: s.ay, y: s.y, w: Math.max(MIN_W, s.w), h: Math.max(MIN_H, s.h) };
    } else {
      let k = 0; for (const o of recs.values()) if (o.open) k++;
      r.g = { ax: 'r', x: GAP + STEP * k, ay: 't', y: TOP + STEP * k, w: Math.max(MIN_W, r.def.width ?? 320), h: Math.max(MIN_H, r.def.height ?? 240) };
    }
    r.collapsed = s?.collapsed === true;
    r.body.hidden = r.grip.hidden = r.collapsed;
  }

  function show(r) {
    if (!r.win) build(r); else if (!r.g) geometry(r);
    r.open = true; r.box.checked = true; r.win.hidden = false; r.acc = 0; seen.set(r.def.id, true);
    place(r); front(r);
    if (!r.mounted) { r.mounted = true; try { r.def.mount(r.body, r.controls.ui, view); } catch (err) { fail(r, err); } }
    keep(r);
  }
  function hide(r, persist = true) {
    r.open = false; r.box.checked = false; seen.set(r.def.id, false);
    if (r.win) r.win.hidden = true;
    if (persist) keep(r);
  }
  function collapse(r, on) {
    r.collapsed = on; r.body.hidden = r.grip.hidden = on; r.acc = 0;
    r.win.querySelector('[data-lh-debug-collapse]').textContent = on ? '▸' : '▾';
    place(r); keep(r);
  }

  function add(def) {
    const r = { def, open: false, collapsed: false, mounted: false, broken: false, acc: 0, win: null, g: null };
    const label = el('label'); r.box = el('input', { type: 'checkbox', 'data-lh-debug-open': def.id });
    label.append(r.box, doc.createTextNode(def.title)); r.item = label; items.appendChild(label);
    r.box.addEventListener('change', () => (r.box.checked ? show(r) : hide(r)));
    recs.set(def.id, r);
    const open = seen.has(def.id) ? seen.get(def.id) : wanted.has(def.id) || (useLayout && layout.panels[def.id]?.open === true);
    if (open) show(r);
  }
  function remove(def) {
    const r = recs.get(def.id); if (!r || r.def !== def) return;
    recs.delete(def.id); r.item.remove();
    if (r.mounted && def.unmount) { try { def.unmount(); } catch (err) { report(err); } }
    r.win?.remove(); // its layout entry stays: listed again, it opens where it was
  }

  reset.addEventListener('click', () => { // closes every window and forgets every place; mounted panels stay mounted
    try { store()?.removeItem?.(KEY); } catch { /* nothing kept */ }
    layout = fresh(); dock.setAttribute('data-lh-debug-corner', 'tl'); layer.hidden = false;
    for (const r of recs.values()) { if (r.open) hide(r, false); r.g = null; }
  });

  const onKey = e => {
    if (e.code !== key || typing(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    layout.hidden = !layout.hidden; layer.hidden = layout.hidden; save();
  };
  const onResize = () => { for (const r of recs.values()) if (r.open) place(r); };
  if (key !== false) target.addEventListener('keydown', onKey, true);
  target.addEventListener('resize', onResize);

  const unlisten = registry.listen((type, def) => (type === 'add' ? add(def) : remove(def)));
  for (const def of registry.panels()) add(def);
  const offs = [];
  for (const def of [perfPanel(engine), ...(bench ? [padsPanel(bench)] : [])]) { try { offs.push(registry.api.panel(def)); } catch (err) { report(err); } }

  function run(r, dt) { try { r.def.update?.(view, dt); r.controls.refresh(); } catch (err) { fail(r, err); } }
  return {
    layer,
    update(dt, raw = dt) {
      if (layout.hidden) return;
      for (const r of recs.values()) {
        if (!r.open || r.collapsed || r.broken || !r.mounted) continue;
        if (r.def.rate === 'frame') { run(r, raw); continue; }
        r.acc += raw;
        if (r.acc >= 1 / (r.def.rate ?? 10) - 1e-9) { const d = r.acc; r.acc = 0; run(r, d); }
      }
    },
    dispose() {
      for (const off of offs) off();
      unlisten();
      for (const r of recs.values()) if (r.mounted && r.def.unmount) { try { r.def.unmount(); } catch (err) { report(err); } }
      recs.clear();
      target.removeEventListener('keydown', onKey, true); target.removeEventListener('resize', onResize);
      layer.remove(); style.remove();
    },
  };
}
