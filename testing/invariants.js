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
