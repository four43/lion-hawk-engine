// test/debug-host.test.mjs
// [D-8]–[D-12] the debug panel host on happy-dom: the dock, panel windows, the saved layout, the hotkey, updates and the
// control helpers. The browser-only parts (real pointer drags, touch) are in debug-e2e.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebugRegistry, checkPanel } from '../src/view/debug/registry.js';
import { openDebugHost } from '../src/view/debug/host.js';
import { parseFlags } from '../src/core/flags.js';
import { dom, same } from './helpers/dom.mjs';
import { memory } from './helpers/seats.mjs';

const KEY = 'lh.debug.g';
function rig(query = '?debug', { storage = memory(), panels = [], key, size = [1000, 800], gfx = null } = {}) {
  const { window, document } = dom();
  window.happyDOM.setViewport({ width: size[0], height: size[1] });
  const registry = createDebugRegistry({ on: true }), errors = [];
  for (const p of panels) registry.api.panel(p);
  const engine = { game: { id: 'g' }, loop: { stats: { frames: 0, steps: 0, clamped: 0, lastSteps: 0 } } };
  const view = { gfx };
  const host = openDebugHost({ registry, engine, view, doc: document, target: window, flags: parseFlags(query), storage, key, report: err => errors.push(err) });
  const q = sel => document.querySelector(sel);
  const win = id => q(`[data-lh-debug-panel="${id}"]`);
  const shown = id => { const w = win(id); return w !== null && !w.hidden; };
  const saved = () => JSON.parse(storage?.getItem(KEY) ?? 'null');
  return { window, document, registry, host, engine, view, errors, storage, q, win, shown, saved };
}
const panel = (id, extra = {}) => ({ id, title: id.toUpperCase(), mount() {}, ...extra });
const box = el => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
const press = (window, target, code, opts = {}) => {
  const e = new window.KeyboardEvent('keydown', { code, key: code === 'Backquote' ? '`' : code, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(e); return e;
};
const pointer = (window, el, type, x, y, id = 1) => el.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, cancelable: true }));
const drag = (window, el, [x0, y0], [x1, y1]) => { pointer(window, el, 'pointerdown', x0, y0); pointer(window, el, 'pointermove', x1, y1); pointer(window, el, 'pointerup', x1, y1); };

test('checkPanel names what is wrong: ids, titles, functions, rate, sizes and unknown keys (D-9)', () => {
  const bad = [
    [null, /a panel must be an object/], [{ title: 'T', mount() {} }, /id must be a non-empty string/],
    [{ id: 'a', mount() {} }, /panel 'a': title must be a non-empty string/], [{ id: 'a', title: 'A' }, /panel 'a': mount must be a function/],
    [panel('a', { update: 1 }), /panel 'a': update must be a function/], [panel('a', { unmount: 'x' }), /panel 'a': unmount must be a function/],
    [panel('a', { rate: 0 }), /panel 'a': rate must be a number > 0 or 'frame'/], [panel('a', { rate: 'fast' }), /rate must be/],
    [panel('a', { width: -1 }), /panel 'a': width must be a number > 0/], [panel('a', { height: NaN }), /height must be a number > 0/],
    [panel('a', { titel: 'x' }), /panel 'a': titel is unknown \(known: id, title, mount, update, unmount, rate, width, height\)/],
  ];
  for (const [def, re] of bad) assert.throws(() => checkPanel(def), e => /^debug: /.test(e.message) && re.test(e.message), String(re));
  assert.doesNotThrow(() => checkPanel(panel('a', { update() {}, unmount() {}, rate: 'frame', width: 300, height: 200 })));
});

test('the registry lists a panel until its off(); a listed id throws; off() twice is harmless (D-9)', () => {
  const r = createDebugRegistry(), seen = [];
  const stop = r.listen((type, def) => seen.push(`${type}:${def.id}`));
  const off = r.api.panel(panel('a'));
  assert.throws(() => r.api.panel(panel('a')), /^Error: debug: panel 'a' is already registered$/);
  assert.deepEqual([...r.panels()].map(p => p.id), ['a']);
  off(); off(); r.api.panel(panel('a')); stop(); r.api.panel(panel('b'));
  assert.deepEqual(seen, ['add:a', 'remove:a', 'add:a']);
  assert.equal(r.api.on, false); assert.equal(createDebugRegistry({ on: true }).api.on, true);
  assert.ok(Object.isFrozen(r.api));
});

test('the layer and dock: the dock lists every panel; a checkbox opens and closes its window (D-8)', () => {
  const { q, document, shown, registry, window } = rig('?debug', { panels: [panel('a'), panel('b')] });
  const layer = q('[data-lh-debug]');
  assert.ok(layer && layer.style.zIndex === '2147483000');
  assert.ok(document.querySelector('[data-testid]') === null, 'debug controls carry no data-testid (the menu navigator skips them)');
  assert.deepEqual([...document.querySelectorAll('[data-lh-debug-open]')].map(c => c.getAttribute('data-lh-debug-open')), ['a', 'b', 'perf']);
  q('[data-lh-debug-toggle]').click(); assert.equal(q('[data-lh-debug-list]').hidden, false);
  const box = q('[data-lh-debug-open="b"]'); box.checked = true; box.dispatchEvent(new window.Event('change'));
  assert.ok(shown('b')); assert.ok(!shown('a'));
  q('[data-lh-debug-panel="b"] [data-lh-debug-close]').click();
  assert.ok(!shown('b')); assert.equal(box.checked, false);
  registry.api.panel(panel('c'));
  assert.ok(q('[data-lh-debug-open="c"]'), 'a panel listed later joins the list');
});

test('?debug=<topics> opens the panels they name; bare ?debug reopens the saved ones; ?fps opens perf (D-10, D-3)', () => {
  const storage = memory();
  storage.setItem(KEY, JSON.stringify({ v: 1, dock: 'tl', hidden: false, panels: { b: { open: true, collapsed: false, ax: 'l', x: 10, ay: 't', y: 20, w: 300, h: 200 } } }));
  const topics = rig('?debug=a,nope', { storage, panels: [panel('a'), panel('b')] });
  assert.ok(topics.shown('a')); assert.ok(!topics.shown('b'), 'topics win over the saved layout');
  const bare = rig('?debug', { storage, panels: [panel('a'), panel('b')] });
  assert.ok(bare.shown('b')); assert.ok(bare.shown('a'), 'the topics visit opened a, and the layout kept it');
  assert.deepEqual(box(bare.win('b')), { left: 10, top: 20, w: 300, h: 200 });
  const fps = rig('?fps', { storage, panels: [panel('a'), panel('b')] });
  assert.ok(fps.shown('perf')); assert.ok(!fps.shown('b'));
  const later = rig('?debug=c', { storage });
  assert.ok(!later.win('c')); later.registry.api.panel(panel('c'));
  assert.ok(later.shown('c'), 'a panel listed later opens when its id is a topic');
});

test('the layout is saved against the nearest edges, so a window keeps its corner when the viewport changes (D-10)', () => {
  const t = rig('?debug=a', { panels: [panel('a', { width: 200, height: 100 })] });
  const bar = t.q('[data-lh-debug-panel="a"] [data-lh-debug-bar]'), w = t.win('a');
  const b0 = box(w);
  assert.deepEqual([b0.w, b0.h, b0.top], [200, 100, 48]); assert.equal(b0.left, 1000 - 200 - 12, 'the first window cascades from the top-right');
  drag(t.window, bar, [b0.left + 10, b0.top + 5], [b0.left + 10 - 650, b0.top + 5 + 560]); // to near the bottom-left
  assert.deepEqual(box(w), { left: 138, top: 608, w: 200, h: 100 });
  assert.deepEqual(t.saved().panels.a, { open: true, collapsed: false, ax: 'l', x: 138, ay: 'b', y: 92, w: 200, h: 100 });
  t.window.happyDOM.setViewport({ width: 600, height: 500 }); t.window.dispatchEvent(new t.window.Event('resize'));
  assert.deepEqual(box(w), { left: 138, top: 308, w: 200, h: 100 }, 'still 92 px off the bottom');
});

test('windows stay on screen: a drag past an edge, a resize larger than the viewport and a shrinking viewport clamp (D-10)', () => {
  const t = rig('?debug=a', { panels: [panel('a', { width: 300, height: 200 })] });
  const w = t.win('a'), bar = w.querySelector('[data-lh-debug-bar]'), grip = w.querySelector('[data-lh-debug-grip]');
  drag(t.window, bar, [700, 60], [5000, -900]);
  assert.deepEqual(box(w), { left: 700, top: 0, w: 300, h: 200 });
  drag(t.window, grip, [999, 199], [100, 0]);
  assert.deepEqual(box(w), { left: 700, top: 0, w: 160, h: 60 }, 'the minimum size');
  drag(t.window, grip, [859, 59], [3000, 3000]);
  assert.deepEqual(box(w), { left: 700, top: 0, w: 300, h: 800 }, 'no bigger than the room to the edges');
  t.window.happyDOM.setViewport({ width: 250, height: 400 }); t.window.dispatchEvent(new t.window.Event('resize'));
  assert.deepEqual(box(w), { left: 0, top: 0, w: 250, h: 400 });
});

test('a pointer down brings a window to the front; collapse hides the body and is saved (D-10)', () => {
  const t = rig('?debug=a,b', { panels: [panel('a'), panel('b')] });
  const za = () => +t.win('a').style.zIndex, zb = () => +t.win('b').style.zIndex;
  assert.ok(zb() > za()); pointer(t.window, t.win('a'), 'pointerdown', 1, 1); assert.ok(za() > zb());
  t.q('[data-lh-debug-panel="a"] [data-lh-debug-collapse]').click();
  assert.equal(t.q('[data-lh-debug-panel="a"] [data-lh-debug-body]').hidden, true);
  assert.equal(t.saved().panels.a.collapsed, true);
});

test('storage that throws or is missing: panels still open and move, nothing is kept (D-10)', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  for (const storage of [broken, null]) {
    const t = rig('?debug=a', { storage, panels: [panel('a')] });
    assert.ok(t.shown('a')); t.q('[data-lh-debug-panel="a"] [data-lh-debug-close]').click(); assert.ok(!t.shown('a'));
    t.q('[data-lh-debug-reset]').click();
  }
});

test('reset layout clears the key and closes every window; the dock snaps to the nearest corner (D-10)', () => {
  const t = rig('?debug=a', { panels: [panel('a')] });
  const btn = t.q('[data-lh-debug-toggle]');
  drag(t.window, btn, [20, 20], [900, 700]);
  assert.equal(t.q('[data-lh-debug-dock]').getAttribute('data-lh-debug-corner'), 'br'); assert.equal(t.saved().dock, 'br');
  assert.equal(t.q('[data-lh-debug-list]').hidden, true, 'a drag is not a click');
  t.q('[data-lh-debug-reset]').click();
  assert.equal(t.storage.getItem(KEY), null); assert.ok(!t.shown('a'));
  assert.equal(t.q('[data-lh-debug-dock]').getAttribute('data-lh-debug-corner'), 'tl');
});

test('the hotkey hides and shows the whole layer, the game never sees it, and it is ignored in a text field (D-8)', () => {
  const t = rig('?debug=a', { panels: [panel('a')] }), layer = t.q('[data-lh-debug]');
  let seen = 0; t.window.addEventListener('keydown', () => seen++);
  const e = press(t.window, t.document.body, 'Backquote');
  assert.equal(layer.hidden, true); assert.equal(seen, 0); assert.equal(e.defaultPrevented, true); assert.equal(t.saved().hidden, true);
  const input = t.document.createElement('input'); t.document.body.appendChild(input);
  press(t.window, input, 'Backquote'); assert.equal(layer.hidden, true); assert.equal(seen, 1);
  press(t.window, t.document.body, 'Backquote'); assert.equal(layer.hidden, false); assert.ok(t.shown('a'), 'shown again as it was');
  const custom = rig('?debug', { key: 'F2' }); press(custom.window, custom.document.body, 'Backquote');
  assert.equal(custom.q('[data-lh-debug]').hidden, false); press(custom.window, custom.document.body, 'F2'); assert.equal(custom.q('[data-lh-debug]').hidden, true);
  const none = rig('?debug', { key: false }); press(none.window, none.document.body, 'Backquote'); assert.equal(none.q('[data-lh-debug]').hidden, false);
});

test('mount runs on first open; update runs at the rate while open and not collapsed, with the seconds since the last (D-9)', () => {
  const log = [];
  const a = panel('a', { mount(el, ui, view) { log.push(['mount', el.getAttribute('data-lh-debug-body'), typeof ui.value, view.gfx]); }, update(view, dt) { log.push(['update', +dt.toFixed(3)]); } });
  const f = panel('f', { rate: 'frame', update() { log.push(['frame']); } });
  const t = rig('?debug', { panels: [a, f] });
  t.host.update(0.1, 0.1); assert.deepEqual(log, [], 'closed panels are not mounted or updated');
  const open = id => { const c = t.q(`[data-lh-debug-open="${id}"]`); c.checked = !c.checked; c.dispatchEvent(new t.window.Event('change')); };
  open('a'); open('a'); open('a'); assert.deepEqual(log, [['mount', 'a', 'function', null]], 'mounted once');
  log.length = 0; for (let i = 0; i < 12; i++) t.host.update(1 / 60, 1 / 60);
  assert.deepEqual(log, [['update', 0.1], ['update', 0.1]], '10 Hz by default');
  log.length = 0; open('f'); t.host.update(1 / 60, 1 / 60); t.host.update(1 / 60, 1 / 60);
  assert.deepEqual(log.filter(x => x[0] === 'frame').length, 2);
  log.length = 0; t.q('[data-lh-debug-panel="f"] [data-lh-debug-collapse]').click(); t.host.update(1 / 60, 1 / 60);
  assert.deepEqual(log, [], 'collapsed: no update');
  press(t.window, t.document.body, 'Backquote'); for (let i = 0; i < 12; i++) t.host.update(1 / 60, 1 / 60);
  assert.deepEqual(log, [], 'hidden layer: no update');
});

test('a panel that throws reports to errors, shows the message and stops; the others run on (D-9)', () => {
  let n = 0;
  const t = rig('?debug=bad,ok,early', { panels: [panel('bad', { update() { throw new Error('boom'); } }), panel('ok', { rate: 'frame', update() { n++; } }), panel('early', { mount() { throw new Error('no mount'); } })] });
  assert.deepEqual(t.errors.map(e => e.message), ['no mount']);
  for (let i = 0; i < 20; i++) t.host.update(1 / 60, 1 / 60);
  assert.deepEqual(t.errors.map(e => e.message), ['no mount', 'boom'], 'reported once');
  assert.equal(n, 20);
  assert.match(t.q('[data-lh-debug-panel="bad"] [data-lh-debug-error]').textContent, /boom/);
  assert.match(t.q('[data-lh-debug-panel="early"] [data-lh-debug-error]').textContent, /no mount/);
});

test('unlisting unmounts and removes the window but keeps its saved place; it reopens there (D-9, D-10)', () => {
  const log = [];
  const t = rig('?debug');
  const def = panel('s', { mount() { log.push('mount'); }, unmount() { log.push('unmount'); } });
  let off = t.registry.api.panel(def);
  const c = t.q('[data-lh-debug-open="s"]'); c.checked = true; c.dispatchEvent(new t.window.Event('change'));
  drag(t.window, t.q('[data-lh-debug-panel="s"] [data-lh-debug-bar]'), [700, 60], [400, 300]);
  const place = box(t.win('s'));
  off(); assert.deepEqual(log, ['mount', 'unmount']); same(t.win('s'), null); same(t.q('[data-lh-debug-open="s"]'), null);
  off = t.registry.api.panel(def);
  assert.ok(t.shown('s'), 'it was open: it reopens'); assert.deepEqual(box(t.win('s')), place);
  t.host.dispose(); assert.deepEqual(log, ['mount', 'unmount', 'mount', 'unmount']);
  same(t.q('[data-lh-debug]'), null); same(t.document.querySelector('style[data-lh-debug-style]'), null);
  press(t.window, t.document.body, 'Backquote'); off();
});

test('controls: readouts, sliders, checks, buttons, tables and groups refresh on update and skip unchanged values (D-11)', () => {
  const tune = { grip: 1.2, wire: false }, data = { rpm: 900.4, rows: [{ id: 1, speed: 3 }] };
  let clicked = 0, ui;
  const t = rig('?debug=c', { panels: [panel('c', { rate: 'frame', mount(el, u) {
    ui = u;
    u.value('rpm', () => data.rpm, { digits: 0, unit: 'rpm' });
    u.slider('grip', tune, 'grip', { min: 0, max: 2, step: 0.1 });
    const g = u.group('More'); g.check('wire', tune, 'wire'); g.button('go', () => clicked++);
    u.table(() => data.rows, ['id', 'speed']);
    u.value('text', () => 'idle');
  } })] });
  const body = t.q('[data-lh-debug-panel="c"] [data-lh-debug-body]');
  t.host.update(1 / 60, 1 / 60);
  const val = body.querySelectorAll('span[data-lh-debug-value]');
  assert.equal(val[0].textContent, '900 rpm'); assert.equal(val[1].textContent, 'idle');
  const range = body.querySelector('input[type="range"]');
  assert.equal(range.value, '1.2'); range.value = '0.5'; range.dispatchEvent(new t.window.Event('input')); assert.equal(tune.grip, 0.5);
  tune.grip = 1.7; t.host.update(1 / 60, 1 / 60); assert.equal(range.value, '1.7', 'a change made elsewhere shows');
  const check = body.querySelector('details input[type="checkbox"]'); check.checked = true; check.dispatchEvent(new t.window.Event('change')); assert.equal(tune.wire, true);
  body.querySelector('details button').click(); assert.equal(clicked, 1);
  assert.deepEqual([...body.querySelectorAll('table td')].map(c => c.textContent), ['1', '3']);
  data.rows = [{ id: 1, speed: 4 }, { id: 2, speed: 5 }]; t.host.update(1 / 60, 1 / 60);
  assert.deepEqual([...body.querySelectorAll('table td')].map(c => c.textContent), ['1', '4', '2', '5']);
  // unchanged values do not touch the DOM
  let writes = 0; const obs = new t.window.MutationObserver(m => { writes += m.length; });
  obs.observe(body, { subtree: true, childList: true, characterData: true, attributes: true });
  t.host.update(1 / 60, 1 / 60); t.host.update(1 / 60, 1 / 60);
  return new Promise(r => setTimeout(r, 0)).then(() => { obs.disconnect(); assert.equal(writes, 0); assert.equal(typeof ui.group, 'function'); });
});

test('a button that throws reports the error and the panel runs on (D-11)', () => {
  const t = rig('?debug=b', { panels: [panel('b', { mount(el, u) { u.button('x', () => { throw new Error('bad click'); }); } })] });
  t.q('[data-lh-debug-panel="b"] button[data-lh-debug-control]').click();
  assert.deepEqual(t.errors.map(e => e.message), ['bad click']);
});

test('perf shows frame ms from frames and time between updates, steps, clamped frames and the renderer counts (D-12, D-3)', () => {
  const info = { calls: 12, triangles: 3400, points: 0, lines: 0, geometries: 5, textures: 2, programs: 7 };
  const t = rig('?fps', { gfx: { info: () => info } });
  const s = t.engine.loop.stats;
  const text = () => [...t.q('[data-lh-debug-panel="perf"] [data-lh-debug-body]').querySelectorAll('[data-lh-debug-row]')].map(r => r.textContent);
  t.host.update(0.1, 0.1); assert.match(text()[0], /frame ms\s*–/, 'no frames yet');
  s.frames = 6; s.lastSteps = 2; s.clamped = 1; t.host.update(0.1, 0.1);
  const rows = text();
  assert.match(rows[0], /frame ms\s*16\.7/); assert.match(rows[1], /steps\s*2/); assert.match(rows[2], /clamped\s*1/);
  assert.match(rows.join('|'), /draw calls\s*12/); assert.match(rows.join('|'), /triangles\s*3400/); assert.match(rows.join('|'), /programs\s*7/);
  const bare = rig('?fps'); bare.host.update(0.1, 0.1);
  assert.match([...bare.q('[data-lh-debug-panel="perf"]').querySelectorAll('[data-lh-debug-row]')].map(r => r.textContent).join('|'), /draw calls\s*–/, 'no gfx: dashes');
});
