// [T-6] named setup steps for headless handles: fixtures.define(name, (h, ...args) => ...) and h.use(...specs). A spec is
// a name, 'name:arg' (one string argument) or [name, ...args]. The registry is per process (one test file under node:test).
import { policy } from '../src/core/policy.js';

const defs = new Map();
const define = (name, fn) => {
  if (typeof name !== 'string' || !name || name.includes(':')) throw new Error("fixtures: a name is a non-empty string without ':'");
  if (defs.has(name)) throw new Error(`fixtures: '${name}' is already defined`);
  if (typeof fn !== 'function') throw new Error(`fixtures: '${name}' needs a function`);
  defs.set(name, fn);
};
define('warm', (h, n) => { // warm:N steps N times with policy.still
  const k = typeof n === 'string' && /^\d+$/.test(n) ? Number(n) : n;
  if (!Number.isInteger(k) || k < 0) throw new Error(`fixtures: warm needs a step count, an integer >= 0 (got ${JSON.stringify(n)})`);
  h.step(k, policy.still());
});

export const fixtures = Object.freeze({ define, has: name => defs.has(name) });

export function useFixtures(h, specs) {
  for (const s of specs) {
    let name, args;
    if (typeof s === 'string') { const i = s.indexOf(':'); [name, args] = i < 0 ? [s, []] : [s.slice(0, i), [s.slice(i + 1)]]; }
    else if (Array.isArray(s) && typeof s[0] === 'string') [name, ...args] = s;
    else throw new Error("fixtures: use takes names, 'name:arg' or [name, ...args]");
    const fn = defs.get(name);
    if (!fn) throw new Error(`fixtures: no fixture '${name}'`);
    fn(h, ...args);
  }
  return h;
}
