// E-13: systems emit events during a step; they are delivered in order at events.flush and kept in a ring log
// that tests and the debug hook read with since(seq) (T-4, D-4).
export function createEvents({ logSize = 256, now = () => 0 } = {}) {
  const queue = [], out = [], listeners = new Set(), log = new Array(logSize);
  let seq = 0, logged = 0;
  return {
    emit(type, data = {}) { const e = { ...data, seq: ++seq, step: now(), type }; queue.push(e); return e; },
    // Returns a reused array, valid until the next flush (R-8). If a listener throws, events already started are dropped
    // (they are logged), the error propagates, and the rest stay queued for the next flush.
    flush() {
      out.length = 0;
      let i = 0;
      try {
        for (; i < queue.length;) { const e = queue[i++]; out.push(e); log[logged++ % logSize] = e; for (const fn of listeners) fn(e); } // a listener may emit: the loop sees it
      } finally { if (i >= queue.length) queue.length = 0; else queue.splice(0, i); }
      return out;
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    since(after = 0) {
      const out = [];
      for (let i = Math.max(0, logged - logSize); i < logged; i++) { const e = log[i % logSize]; if (e.seq > after) out.push(e); }
      return out;
    },
    get seq() { return seq; },
    get pending() { return queue.length; },
  };
}
