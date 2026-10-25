// D-4: the full window.engine hook, built on installEngineHook.
import { installEngineHook } from './debugHook.js';
import { checksum } from '../core/checksum.js';

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

// [D-4] query: a JSON-safe summary of an entity (its primitive fields, tags, net identity and current pose)
const summary = e => {
  const o = { id: e.id, tags: [...e.tags] };
  for (const k of Object.keys(e)) if (k !== 'id' && k !== 'tags' && k !== 'xf' && prim(e[k])) o[k] = e[k];
  if (e.xf) { const { p, q } = e.xf; o.p = { x: p.x, y: p.y, z: p.z }; o.q = { x: q.x, y: q.y, z: q.z, w: q.w }; }
  return o;
};
const whereFn = where => where == null ? null : typeof where === 'function' ? where
  : e => { for (const k of Object.keys(where)) if (e[k] !== where[k]) return false; return true; };
// [D-4] restore: the page reloads with ?replay=session and boot replays the snapshot's tape (sessionStorage 'lh-replay')
export const REPLAY_KEY = 'lh-replay';
const withReplay = href => {
  const [url, hash = ''] = href.split('#'), [base, q = ''] = url.split('?');
  const parts = q.split('&').filter(x => x && !/^replay(=|$)/.test(x)); parts.push('replay=session');
  return `${base}?${parts.join('&')}${hash ? '#' + hash : ''}`;
};

export function installEngine(engine, { driver, target = globalThis, errors = [], ready = Promise.resolve(), after = () => {}, busy = () => false, view } = {}) {
  const note = (...a) => { after(); return a[0]; };
  const onError = ev => errors.push({ type: 'error', message: String(ev.message ?? ev.error ?? 'error'), stack: ev.error?.stack });
  const onReject = ev => errors.push({ type: 'unhandledrejection', message: String(ev.reason?.message ?? ev.reason), stack: ev.reason?.stack });
  target.addEventListener?.('error', onError); target.addEventListener?.('unhandledrejection', onReject);
  const api = {
    ready, seed: engine.seed, errors,
    manual: on => driver.manual(on),
    hz: engine.game.sim.hz, // G-E1: peers() steps the hub clock by 1000 / hz
    stepN: n => note(engine.stepN(n)), advance: s => note(engine.advance(s)), render: a => { engine.render(a); after(); },
    get time() { return engine.time; }, get scene() { return engine.scene; }, get loading() { return engine.loading; }, // [S-6]
    go: (n, a) => { engine.go(n, a); after(); }, overlay: (n, a, o) => { engine.overlay(n, a, o); after(); }, // #95: o = { once }
    close: n => { engine.close(n); after(); }, jump: (n, p, o, a) => { engine.jump(n, p, o, a); after(); },
    command: (type, data) => { engine.command(type, data); after(); }, // #5
    commands: engine.commands, // #100: the live { pending, dropped, handles }; Playwright's untilLoaded reads pending in the page
    on: (type, fn) => engine.events.on(e => { if (e.type === type) fn(safeEvent(e)); }),
    events: { since: seq => { engine.flushEvents(); return engine.events.since(seq).map(safeEvent); } }, // #71
    state: () => engine.state(),
    query(name, where) { // a bare name matches a tag or a net kind (null: every entity); where: a partial object or a predicate
      const w = engine.world, test = whereFn(where), out = [];
      if (!w) return out;
      for (const e of w.with()) if ((name == null || e.tags.has(name) || e.net === name) && (!test || test(e))) out.push(summary(e));
      return out;
    },
    checksum: () => checksum(engine.state()),
    snapshot() {
      let tape; try { tape = engine.tape(); } catch { throw new Error('engine: snapshot needs a recording page (?lh-test&lh-record)'); }
      return { v: 1, step: engine.time.step, checksum: checksum(engine.state()), tape: { ...tape, end: engine.time.step } };
    },
    restore(snap) {
      if (snap?.v !== 1 || !snap.tape) throw new Error('engine: restore: not a snapshot');
      const s = target.sessionStorage, loc = target.location;
      if (!s || !loc?.replace) throw new Error('engine: restore needs a page (sessionStorage and location)');
      s.setItem(REPLAY_KEY, JSON.stringify(snap)); loc.replace(withReplay(loc.href));
    },
    policies: engine.game.policies,
    input: { set: p => engine.input.set(p), hold: p => engine.input.hold(p), release: (...n) => engine.input.release(...n), read: () => engine.input.values() },
    settled() {
      if (busy() || engine.loading.active) return false; // #20: view.wait promises pending; [S-6] a scene loading
      const d = target.document; if (!d?.querySelector) return true;
      return !d.querySelector('[data-lh-state="opening"],[data-lh-state="closing"]');
    },
    isOpen: (n, o) => engine.isOpen(n, o), // #36
    ui: { tree: () => engine.ui.tree(), enabled: id => engine.ui.enabled(id), tryTap: id => { try { return engine.ui.tryTap(id); } finally { after(); } }, tap: id => { engine.ui.tap(id); after(); }, press: id => { engine.ui.press(id); after(); }, release: id => { engine.ui.release(id); after(); }, fill: (id, t) => { engine.ui.fill(id, t); after(); } },
    view: { get project() { return view?.project; }, get nav() { return view?.nav?.state; } }, // T-17: world targets call the game view's projection; U-7: the navigator's state
    rng: n => engine.rng(n),
    get debug() { return engine.game.debug?.(engine) ?? {}; },
    dispose() { target.removeEventListener?.('error', onError); target.removeEventListener?.('unhandledrejection', onReject); },
  };
  return installEngineHook(api, { game: engine.game.id, target });
}
