// Invariants for headless({ invariants }): functions (h) => void that throw on a violation (spec [T-1]).
import { assertFinite } from './state.js';

// #64: until the World's always-on finite() over xf/bodies (phase 4), check any selected plain value for NaN/Infinity.
export const invariants = {
  finite(select, label = 'state') {
    if (typeof select !== 'function') throw new Error('invariants.finite: select must be a function');
    return h => {
      const v = select(h);
      try { assertFinite(v, label); }
      catch (err) { throw new Error(`finite: ${err.message} (seed ${h.seed}, step ${h.engine.time.step})`); }
    };
  },
};

// [T-1] the always-on finite check over the World (run by headless after each step while the World has entities):
// every pool slot (current half first, then previous) and every body's velocities.
const SLOT_FIELDS = ['xfPrev.p.x', 'xfPrev.p.y', 'xfPrev.p.z', 'xfPrev.q.x', 'xfPrev.q.y', 'xfPrev.q.z', 'xfPrev.q.w',
  'xf.p.x', 'xf.p.y', 'xf.p.z', 'xf.q.x', 'xf.q.y', 'xf.q.z', 'xf.q.w'];
const SLOT_ORDER = [7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6];
export function worldFinite(world, engine) {
  const pool = world.xf.pool, S = world.xf.stride, all = world.with();
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const bad = (field, v) => { throw new Error(`finite: entity ${e.id} (${[...e.tags].join(',')}) ${field} is ${v} (seed ${engine.seed}, step ${engine.time.step})`); };
    const slot = e.xf?.slot;
    if (slot !== undefined) for (const k of SLOT_ORDER) { const v = pool[slot * S + k]; if (!Number.isFinite(v)) bad(SLOT_FIELDS[k], v); }
    if (e.body) {
      for (const [name, v] of [['linvel', e.body.linvel()], ['angvel', e.body.angvel()]]) {
        for (const a of ['x', 'y', 'z']) if (!Number.isFinite(v[a])) bad(`${name}.${a}`, v[a]);
      }
    }
  }
}
