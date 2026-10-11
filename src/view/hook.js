// D-4: the full window.engine hook, built on installEngineHook.
import { installEngineHook } from './debugHook.js';

const prim = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
// JSON-safe copy of an event: object/function values become { id, kind } when they carry either, otherwise are dropped.
export function safeEvent(e) {
  const o = {};
  for (const [k, v] of Object.entries(e)) {
    if (prim(v)) o[k] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
    else if (Array.isArray(v) && v.every(prim)) o[k] = v.slice();
    else if (v && (typeof v === 'object' || typeof v === 'function') && (v.id !== undefined || v.kind !== undefined)) {
      const r = {}; if (v.id !== undefined && prim(v.id)) r.id = v.id; if (v.kind !== undefined && prim(v.kind)) r.kind = v.kind; o[k] = r;
    }
  }
  return o;
}

export function installEngine(engine, { driver, target = globalThis, errors = [], ready = Promise.resolve(), after = () => {} } = {}) {
  const note = (...a) => { after(); return a[0]; };
  const onError = ev => errors.push({ type: 'error', message: String(ev.message ?? ev.error ?? 'error'), stack: ev.error?.stack });
  const onReject = ev => errors.push({ type: 'unhandledrejection', message: String(ev.reason?.message ?? ev.reason), stack: ev.reason?.stack });
  target.addEventListener?.('error', onError); target.addEventListener?.('unhandledrejection', onReject);
  const api = {
    ready, seed: engine.seed, errors,
    manual: on => driver.manual(on),
    stepN: n => note(engine.stepN(n)), advance: s => note(engine.advance(s)), render: a => { engine.render(a); after(); },
    get time() { return engine.time; }, get scene() { return engine.scene; },
    go: (n, a) => { engine.go(n, a); after(); }, overlay: (n, a) => { engine.overlay(n, a); after(); },
    close: n => { engine.close(n); after(); }, jump: (n, p, o, a) => { engine.jump(n, p, o, a); after(); },
    on: (type, fn) => engine.events.on(e => { if (e.type === type) fn(safeEvent(e)); }),
    events: { since: seq => engine.events.since(seq).map(safeEvent) },
    state: () => engine.state(),
    input: { set: p => engine.input.set(p), hold: p => engine.input.hold(p), release: (...n) => engine.input.release(...n), read: () => engine.input.values() },
    settled() {
      const d = target.document; if (!d?.querySelector) return true;
      return !d.querySelector('[data-lh-state="opening"],[data-lh-state="closing"]');
    },
    ui: { tree: () => engine.ui.tree(), tap: id => { engine.ui.tap(id); after(); } },
    rng: n => engine.rng(n),
    get debug() { return engine.game.debug?.(engine) ?? {}; },
    dispose() { target.removeEventListener?.('error', onError); target.removeEventListener?.('unhandledrejection', onReject); },
  };
  return installEngineHook(api, { game: engine.game.id, target });
}
