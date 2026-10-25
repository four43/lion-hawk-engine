// T-1…T-6: drive a game headless, in steps, with input policies, waits that explain their failures, event lists,
// scene jumps and UI taps. Everything counts steps, never milliseconds.
import { AssertionError } from 'node:assert';
import { afterEach } from 'node:test';
import { format } from 'node:util';
import { createEngine } from '../src/core/engine.js';
import { checksum } from './state.js';
import { policy } from '../src/core/policy.js';
import { worldFinite } from './invariants.js';
import { useFixtures } from './fixtures.js';

export { policy };
const matcher = m => typeof m === 'function' ? m : e => e.type === m;
// where: a predicate, or a partial object whose keys must be === (h.find, expectEvents)
const whereFn = where => where === undefined ? null : typeof where === 'function' ? where
  : e => { for (const k of Object.keys(where)) if (e[k] !== where[k]) return false; return true; };
const fmt = e => { const { seq, step, type, ...rest } = e; return `  @${step} ${type} ${JSON.stringify(rest)}`; };
export function eventList(arr) {
  return Object.assign(arr, {
    of: t => arr.filter(e => e.type === t),
    first: m => arr.find(matcher(m)),
    count: m => arr.filter(matcher(m)).length,
    types: () => arr.map(e => e.type),
    since: m => eventList(arr.filter(e => e.seq > m)),
  });
}

// [T-8] warnings and errors printed during a handle's calls are captured on h.warnings instead of the console. Under
// node --test, a test that leaves one unexpected (not matched by h.expectWarning) fails after it ends. Run directly with
// node, nothing fails: read h.warnings yourself. A test that has replaced console.warn / console.error itself is
// listening: its function still gets the call, and the warning counts as expected.
const unchecked = new Set(); // handles with warnings not yet reported
if (process.env.NODE_TEST_CONTEXT) afterEach(() => {
  const lines = [];
  for (const h of unchecked) for (const w of h.warnings) if (!w.expected && !w.reported) { w.reported = true; lines.push(`  ${w.level}: ${w.text}`); }
  unchecked.clear();
  if (lines.length) throw new AssertionError({ message: `headless: unexpected warning (call h.expectWarning(re) if it is expected):\n${lines.join('\n')}` });
});
let sink = null; // the handle whose call is running (the innermost one)
const native = { warn: console.warn, error: console.error };
const capture = (h, fn) => function (...args) {
  if (sink === h) return fn.apply(this, args);
  const prev = sink, { warn, error } = console, was = { warn, error };
  const put = level => (...a) => {
    const listening = was[level] !== native[level];
    h.warnings.push({ level, text: format(...a), expected: listening, reported: false });
    if (listening) was[level](...a); else unchecked.add(h);
  };
  sink = h; console.warn = put('warn'); console.error = put('error');
  try { return fn.apply(this, args); } finally { sink = prev; console.warn = warn; console.error = error; }
};

export function headless(game, { seed = 1, scene, args, invariants = [], record = false, wall0 = 0 } = {}) {
  const engine = createEngine(game, { seed, scene, args, record, wall0 }), hz = game.sim.hz;
  const scratch = new Map(); // [T-2] one persistent object per (handle, policy function) (#37)
  const sc = f => { let o = scratch.get(f); if (!o) scratch.set(f, o = {}); return o; };
  let dbg; // h.debug, lazily
  const sums = record ? [] : null; // [T-9] a checksum every 60 steps while recording
  // the engine's own log is a ring; the handle keeps every event it has seen so since()/until failures never lose history
  const log = eventList([]); engine.events.on(e => { log.push(e); });
  const resolve = input => {
    if (input == null) return null;
    if (typeof input === 'function') return input;
    if (typeof input === 'string') { const p = Object.hasOwn(game.policies, input) ? game.policies[input] : undefined; if (!p) throw new Error(`headless: no policy '${input}'`); return p; }
    return () => input;
  };
  const one = (f, k) => {
    if (f) engine.input.set(f(h, k, sc(f))); engine.stepN(1);
    if (sums && engine.time.step % 60 === 0) sums.push([engine.time.step, checksum(engine.state())]);
    const w = engine.world; if (w !== undefined && w.stats.entities > 0) worldFinite(w, engine); // [T-1] always on
    for (const inv of invariants) inv(h);
  };
  const needWorld = () => { const w = engine.world; if (!w) throw new Error('headless: no World (no main scene)'); return w; };
  const h = {
    engine, seed: engine.seed,
    get scene() { return engine.scene; }, get time() { return engine.time; },
    // a policy's i counts from the start of each step()/until() call, so policy.seq schedules are relative to that call
    step(n = 1, input) { const f = resolve(input); for (let k = 0; k < n; k++) one(f, k); return h; },
    seconds: (s, input) => h.step(Math.round(s * hz), input),
    use: (...specs) => useFixtures(h, specs), // [T-6]
    hold(p) { engine.input.hold(p); return h; },
    release(...ns) { engine.input.release(...ns); return h; },
    until(pred, { maxSteps, maxSeconds = 10, input, message } = {}) {
      const cap = maxSteps ?? Math.round(maxSeconds * hz), mark = engine.events.seq, f = resolve(input);
      for (let k = 0; k <= cap; k++) {
        if (pred(h)) return { steps: k, events: log.since(mark) };
        if (k < cap) one(f, k);
      }
      const last = log.slice(-20).map(fmt).join('\n');
      throw new Error(`${message ?? 'until: condition not met'} after ${cap} steps (seed ${engine.seed}, step ${engine.time.step}, scene ${engine.scene.name})\nlast events:\n${last}`);
    },
    untilEvent(m, opts = {}) {
      const mark = engine.events.seq, f = matcher(m); let found;
      h.until(() => (found = log.find(e => e.seq > mark && f(e))) !== undefined, { message: `untilEvent(${typeof m === 'string' ? m : 'fn'})`, ...opts });
      return found;
    },
    // [S-6]; #100: commands queued before the call are delivered at the next step and may start a load, so take that step
    // first. Only those: commands the stepped systems issue themselves never hold it (they would keep pending > 0 forever).
    untilLoaded(opts = {}) {
      const s0 = engine.commands.pending > 0 ? engine.time.step : -1;
      return h.until(x => x.engine.time.step !== s0 && !x.engine.loading.active, { message: 'untilLoaded', ...opts });
    },
    untilScene(name, opts = {}) { return h.until(x => x.scene.name === name || x.scene.overlays.includes(name), { message: `untilScene(${name})`, ...opts }); },
    mark: () => engine.events.seq,
    get events() { engine.flushEvents(); return log; }, since: m => { engine.flushEvents(); return log.since(m); }, // #71
    get debug() { return dbg ??= game.debug?.(engine) ?? {}; }, // #70, made once per handle
    tap(id) { engine.ui.tap(id); return h; },
    press(id) { engine.ui.press(id); return h; }, unpress(id) { engine.ui.release(id); return h; }, // #9
    fill(id, t) { engine.ui.fill(id, t); return h; },
    enabled: id => engine.ui.enabled(id), tryTap: id => engine.ui.tryTap(id), // #45
    command(type, data) { if (!engine.commands.handles(type)) throw new Error(`headless: no handler for command '${type}'`); engine.command(type, data); return h; },
    go(n, a) { engine.go(n, a); return h; },
    overlay(n, a, o) { engine.overlay(n, a, o); return h; }, // #95: o = { once }
    close(n) { engine.close(n); return h; },
    jump(s, p, o, a) { engine.jump(s, p, o, a); return h; },
    state: () => engine.state(),
    checksum: () => checksum(engine.state()),
    get world() { return engine.world; }, // [T-5]
    find(name, where) { // a bare name matches a tag or a net kind; where: predicate or partial object (===)
      const w = engine.world, test = whereFn(where), out = [];
      if (!w) return out;
      for (const e of w.with()) if ((name == null || e.tags.has(name) || e.net === name) && (!test || test(e))) out.push(e);
      return out;
    },
    one(name, where) {
      const r = h.find(name, where);
      if (r.length !== 1) throw new Error(`headless: one(${JSON.stringify(name)}) found ${r.length} entities (seed ${engine.seed}, step ${engine.time.step})`);
      return r[0];
    },
    get: id => engine.world?.get(id),
    spawn: desc => needWorld().spawn(desc),
    despawn(e) { needWorld().despawn(e); return h; },
    place(e, at, opts) { needWorld().place(e, at, opts); return h; },
    tape() { if (!sums) throw new Error('headless: not recording'); return { ...engine.tape(), end: engine.time.step, sums: sums.map(x => x.slice()) }; },
    warnings: [], // [T-8] { level: 'warn' | 'error', text, expected }
    expectWarning(re) {
      const w = h.warnings.find(x => !x.expected && re.test(x.text));
      if (!w) throw new AssertionError({ message: `headless: no captured warning matches ${re} (captured: ${h.warnings.map(x => x.text + (x.expected ? ' [expected]' : '')).join('; ') || 'none'})` });
      w.expected = true; return w.text;
    },
    spy(obj, method) {
      const orig = obj?.[method];
      if (typeof orig !== 'function') throw new Error(`headless: spy needs a method: '${method}' is not a function`);
      const s = { calls: [], get count() { return s.calls.length; }, restore() { obj[method] = orig; } };
      obj[method] = function (...a) { s.calls.push(a); return orig.apply(this, a); };
      return s;
    },
  };
  for (const k of Object.keys(h)) { // every method but the warning API itself runs under the capture
    const d = Object.getOwnPropertyDescriptor(h, k);
    if (typeof d.value === 'function' && k !== 'expectWarning' && k !== 'spy') h[k] = capture(h, d.value);
  }
  return h;
}

// [T-4] assertions over the handle's events since a mark (default 0). Each failure lists what was seen.
export function expectEvents(h, since = 0) {
  const list = h.since(since);
  const seen = () => list.map(fmt).join('\n') || '  (none)';
  const what = (type, match) => `'${type}'${match === undefined ? '' : typeof match === 'function' ? ' matching fn' : ` matching ${JSON.stringify(match)}`}`;
  const test = (type, match) => { const w = whereFn(match); return e => e.type === type && (!w || w(e)); };
  const fail = message => { throw new AssertionError({ message, stackStartFn: fail }); };
  return {
    toInclude(type, match) {
      const e = list.find(test(type, match));
      if (!e) fail(`expected an event ${what(type, match)} since seq ${since}; seen:\n${seen()}`);
      return e;
    },
    // entries: a type or [type, match], in order; other events may come between them
    toBeSequence(entries) {
      if (!Array.isArray(entries)) throw new Error('expectEvents: toBeSequence takes an array of types or [type, match]');
      let i = 0;
      entries.forEach((x, n) => {
        const [type, match] = Array.isArray(x) ? x : [x], f = test(type, match);
        while (i < list.length && !f(list[i])) i++;
        if (i === list.length) fail(`expected the sequence ${JSON.stringify(entries)} since seq ${since}: the sequence broke at entry ${n} (${what(type, match)}); seen:\n${seen()}`);
        i++;
      });
      return list;
    },
  };
}
