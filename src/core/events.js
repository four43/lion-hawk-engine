// E-13: systems emit events during a step; they are delivered in order at events.flush and kept in a ring log
// that tests and the debug hook read with since(seq) (T-4, D-4).
export function createEvents({ logSize = 256, now = () => 0 } = {}) {
  const queue = [], listeners = new Set(), log = new Array(logSize);
  let seq = 0, logged = 0;
  return {
    emit(type, data = {}) { const e = { seq: ++seq, step: now(), type, ...data }; queue.push(e); return e; },
    flush() {
      const out = [];
      for (let i = 0; i < queue.length; i++) { const e = queue[i]; out.push(e); log[logged++ % logSize] = e; for (const fn of listeners) fn(e); } // a listener may emit: the loop sees it
      queue.length = 0; return out;
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
