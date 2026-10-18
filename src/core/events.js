// E-13: systems emit events during a step; they are delivered in order at events.flush and kept in a ring log
// that tests and the debug hook read with since(seq) (T-4, D-4).
// R-8: emit makes one event object; adopt(type, data) makes none (data, a fresh object the caller hands over, becomes the
// event). The queue and flush's array are written by index (length = 0 then push would regrow their storage every step),
// and listeners are a copy-on-write array (a Set's for-of makes an iterator per event).
export function createEvents({ logSize = 256, now = () => 0 } = {}) {
  const queue = [], out = [], log = new Array(logSize);
  let listeners = [], seq = 0, logged = 0, qn = 0;
  const stamp = (e, type) => { e.seq = ++seq; e.step = now(); e.type = type; queue[qn++] = e; return e; };
  return {
    emit(type, data = {}) { return stamp({ ...data }, type); },
    adopt(type, data) { return stamp(data, type); },
    // Returns a reused array, valid until the next flush (R-8). If a listener throws, events already started are dropped
    // (they are logged), the error propagates, and the rest stay queued for the next flush.
    flush() {
      let i = 0, on = 0;
      try {
        for (; i < qn;) { // a listener may emit: the loop sees it
          const e = queue[i++]; out[on++] = e; log[logged++ % logSize] = e;
          const l = listeners; for (let j = 0; j < l.length; j++) l[j](e);
        }
      } finally {
        queue.copyWithin(0, i, qn); for (let j = qn - i; j < qn; j++) queue[j] = undefined; qn -= i; // the rest stay queued; no stale references
        if (out.length !== on) out.length = on;
      }
      return out;
    },
    on(fn) { if (!listeners.includes(fn)) listeners = [...listeners, fn]; return () => { listeners = listeners.filter(f => f !== fn); }; },
    since(after = 0) {
      const res = [];
      for (let i = Math.max(0, logged - logSize); i < logged; i++) { const e = log[i % logSize]; if (e.seq > after) res.push(e); }
      return res;
    },
    get seq() { return seq; },
    get pending() { return qn; },
  };
}
