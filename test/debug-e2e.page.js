// The debug-e2e page: the debug host over a bare page, with two panels and the real localStorage (D-8, D-10).
import { createDebugRegistry } from '../src/view/debug/registry.js';
import { openDebugHost } from '../src/view/debug/host.js';
import { parseFlags } from '../src/core/flags.js';

const registry = createDebugRegistry({ on: true }), errors = [];
registry.api.panel({ id: 'a', title: 'Panel A', width: 300, height: 200, mount(el, ui) { ui.value('n', () => 1); } });
registry.api.panel({ id: 'b', title: 'Panel B', mount() {} });
const host = openDebugHost({ registry, engine: { game: { id: 'e2e' }, loop: { stats: { frames: 0, steps: 0, clamped: 0, lastSteps: 0 } } }, view: { gfx: null }, doc: document, target: window, flags: parseFlags(location.search), report: e => errors.push(e.message) });
window.__dbg = {
  errors, host,
  box(id) { const r = document.querySelector(`[data-lh-debug-panel="${id}"]`).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); },
  part(id, sel) { const r = document.querySelector(`[data-lh-debug-panel="${id}"] ${sel}`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
};
