// T-1…T-6: drive a game headless, in steps, with input policies, waits that explain their failures, event lists,
// scene jumps and UI taps. Everything counts steps, never milliseconds.
import { createEngine } from '../src/core/engine.js';
import { checksum } from './state.js';

export const policy = {
  still: () => ({}),
  const: p => () => p,
  seq: list => (h, i) => { let k = i; for (const [n, p] of list) { if (k < n) return p; k -= n; } return {}; },
  fn: f => f,
};
const matcher = m => typeof m === 'function' ? m : e => e.type === m;
export function eventList(arr) {
  return Object.assign(arr, {
    of: t => arr.filter(e => e.type === t),
    first: m => arr.find(matcher(m)),
    count: m => arr.filter(matcher(m)).length,
    types: () => arr.map(e => e.type),
    since: m => eventList(arr.filter(e => e.seq > m)),
  });
}

export function headless(game, { seed = 1, scene, args, invariants = [] } = {}) {
  const engine = createEngine(game, { seed, scene, args }), hz = game.sim.hz;
  // the engine's own log is a ring; the handle keeps every event it has seen so since()/until failures never lose history
  const log = eventList([]); engine.events.on(e => { log.push(e); });
  const resolve = input => {
    if (input == null) return null;
    if (typeof input === 'function') return input;
    if (typeof input === 'string') { const p = Object.hasOwn(game.policies, input) ? game.policies[input] : undefined; if (!p) throw new Error(`headless: no policy '${input}'`); return p; }
    return () => input;
  };
  const one = (f, k) => { if (f) engine.input.set(f(h, k)); engine.stepN(1); for (const inv of invariants) inv(h); };
  const fmt = e => { const { seq, step, type, ...rest } = e; return `  @${step} ${type} ${JSON.stringify(rest)}`; };
  const h = {
    engine, seed: engine.seed,
    get scene() { return engine.scene; }, get time() { return engine.time; },
    // a policy's i counts from the start of each step()/until() call, so policy.seq schedules are relative to that call
    step(n = 1, input) { const f = resolve(input); for (let k = 0; k < n; k++) one(f, k); return h; },
    seconds: (s, input) => h.step(Math.round(s * hz), input),
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
    untilScene(name, opts = {}) { return h.until(x => x.scene.name === name || x.scene.overlays.includes(name), { message: `untilScene(${name})`, ...opts }); },
    mark: () => engine.events.seq,
    events: log, since: m => log.since(m),
    tap(id) { engine.ui.tap(id); return h; },
    go(n, a) { engine.go(n, a); return h; },
    overlay(n, a) { engine.overlay(n, a); return h; },
    close(n) { engine.close(n); return h; },
    jump(s, p, o, a) { engine.jump(s, p, o, a); return h; },
    state: () => engine.state(),
    checksum: () => checksum(engine.state()),
  };
  return h;
}
