// test/debug-boot.test.mjs
// [D-8], [D-9] the debug panels through boot: view.debug with and without the flags, defineView({ debug, debugKey }),
// scene-scoped panels, and ?fps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { dom, same } from './helpers/dom.mjs';
import { game } from './helpers/seats.mjs';

const flush = () => new Promise(r => setTimeout(r, 0));
const panel = (id, extra = {}) => ({ id, title: id, mount() {}, ...extra });
async function run(query, halves) {
  const { window, document } = dom();
  const app = boot(game, halves, { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags(query), getGamepads: () => [], storage: null });
  if (/debug|fps/.test(query)) for (let i = 0; i < 50 && !document.querySelector('[data-lh-debug]'); i++) await flush();
  const listed = () => [...document.querySelectorAll('[data-lh-debug-open]')].map(c => c.getAttribute('data-lh-debug-open'));
  const shown = id => { const w = document.querySelector(`[data-lh-debug-panel="${id}"]`); return w !== null && !w.hidden; };
  return { app, window, document, listed, shown };
}

test('defineView checks debug panels and debugKey (D-9, D-8)', () => {
  assert.throws(() => defineView({ scenes: {}, debug: {} }), /^Error: defineView: debug must be an array of panels$/);
  assert.throws(() => defineView({ scenes: {}, debug: [{ id: 'a', title: 'A' }] }), /^Error: debug: panel 'a': mount must be a function/);
  assert.throws(() => defineView({ scenes: {}, debug: [panel('a'), panel('a')] }), /^Error: debug: panel 'a' is already registered$/);
  assert.throws(() => defineView({ scenes: {}, debugKey: 7 }), /^Error: defineView: debugKey must be a KeyboardEvent.code or false \(got 7\)$/);
  const v = defineView({ scenes: {}, debug: [panel('a')], debugKey: false });
  assert.deepEqual(v.debug.map(p => p.id), ['a']); assert.equal(v.debugKey, false); assert.ok(Object.isFrozen(v.debug));
});

test('without ?debug or ?fps: view.debug.on is false, panel() still checks and returns an off, and nothing is drawn (D-9)', async () => {
  let mounted = 0;
  const t = await run('?lh-test', defineView({ scenes: {}, debug: [panel('a', { mount() { mounted++; } })] }));
  try {
    assert.equal(t.app.view.debug.on, false);
    assert.throws(() => t.app.view.debug.panel({ id: 'b' }), /^Error: debug: panel 'b': title must be a non-empty string/);
    const off = t.app.view.debug.panel(panel('b')); assert.equal(typeof off, 'function'); off();
    await flush(); same(t.document.querySelector('[data-lh-debug]'), null); assert.equal(mounted, 0);
  } finally { t.app.dispose(); }
});

test('?debug lists defineView panels and scene panels while the scene is up; the hotkey is debugKey (D-8, D-9)', async () => {
  const halves = defineView({
    scenes: { field: { enter(e, view) { this.off = view.debug.panel(panel('field-ai')); }, exit() { this.off(); } } },
    debug: [panel('tuning')], debugKey: 'F9',
  });
  const t = await run('?lh-test&debug=tuning,field-ai', halves);
  try {
    assert.equal(t.app.view.debug.on, true);
    assert.deepEqual(t.listed(), ['tuning', 'field-ai', 'perf', 'pads']);
    assert.ok(t.shown('tuning')); assert.ok(t.shown('field-ai')); assert.ok(!t.shown('perf'));
    t.app.engine.go('hud'); t.app.engine.stepN(1); await flush();
    assert.deepEqual(t.listed(), ['tuning', 'perf', 'pads'], 'the scene panel left with its scene');
    const layer = t.document.querySelector('[data-lh-debug]');
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { code: 'F9', bubbles: true, cancelable: true }));
    assert.equal(layer.hidden, true);
  } finally { t.app.dispose(); }
  same(t.document.querySelector('[data-lh-debug]'), null);
});

test('?fps alone loads the host and opens perf (D-3, D-12)', async () => {
  const t = await run('?lh-test&fps', defineView({ scenes: {} }));
  try { assert.ok(t.shown('perf')); assert.ok(!t.shown('pads')); assert.equal(t.app.view.debug.on, true); } finally { t.app.dispose(); }
});
