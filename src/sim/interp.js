// src/sim/interp.js: buffered remote snapshots and their sampling (N-11)
// M-25: remote things show about 100 ms behind their sender's time stamps and move smoothly between two messages; when messages
// arrive unevenly the delay grows, up to 300 ms. M-26: a message not newer than the last one is ignored.
// The clock offset (receiver minus sender) follows the least-delayed message, and creeps up slowly so clock drift cannot freeze it.
export const DELAY = { min: 100, max: 300 };
export const lerp = (a, b, k) => a + (b - a) * k;
export const lerpAngle = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
export function lerpPose(pa, pb, k, out) {
  out.p.x = lerp(pa.p.x, pb.p.x, k); out.p.y = lerp(pa.p.y, pb.p.y, k); out.p.z = lerp(pa.p.z, pb.p.z, k);
  const a = pa.q, b = pb.q, s = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = lerp(a.x, s * b.x, k), y = lerp(a.y, s * b.y, k), z = lerp(a.z, s * b.z, k), w = lerp(a.w, s * b.w, k), n = Math.sqrt(x * x + y * y + z * z + w * w) || 1; // not Math.hypot: it boxes its four doubles (R-8)
  out.q.x = x / n; out.q.y = y / n; out.q.z = z / n; out.q.w = w / n; return out;
}
export function createInterp({ size = 32 } = {}) {
  let buf = [], offset = null, jitter = 0, lastT = -Infinity;
  return {
    get delay() { return Math.min(DELAY.max, Math.max(DELAY.min, 40 + 3 * jitter)); },
    get jitter() { return jitter; },
    get offset() { return offset ?? 0; }, // receiver clock minus sender clock (the least-delayed message): now - offset is the sender's time now, as best known
    get latest() { return buf.at(-1)?.frame ?? null; },
    push(senderT, arrival, frame) {
      if (!(senderT > lastT)) return false; lastT = senderT;
      const o = arrival - senderT;
      offset = offset === null || o < offset ? o : offset + (o - offset) * 0.002;
      jitter += ((o - offset) - jitter) * 0.1;
      buf.push({ t: senderT, frame }); if (buf.length > size) buf.shift();
      return true;
    },
    sample(now) {
      if (!buf.length) return null;
      const at = now - offset - this.delay;
      if (at <= buf[0].t) return { a: buf[0].frame, b: buf[0].frame, k: 0, at };
      for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= at) { const A = buf[i - 1], B = buf[i]; if (at >= B.t) return { a: B.frame, b: B.frame, k: 0, at }; return { a: A.frame, b: B.frame, k: (at - A.t) / (B.t - A.t), at }; }
      return { a: buf.at(-1).frame, b: buf.at(-1).frame, k: 0, at };
    },
    sampleInto(now, out) { // 3i: sample() without the allocation; out = { a, b, k, at } is reused; false while empty
      if (!buf.length) return false;
      const at = now - offset - this.delay; out.at = at;
      if (at <= buf[0].t) { out.a = out.b = buf[0].frame; out.k = 0; return true; }
      for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= at) {
        const A = buf[i - 1], B = buf[i];
        if (at >= B.t) { out.a = out.b = B.frame; out.k = 0; } else { out.a = A.frame; out.b = B.frame; out.k = (at - A.t) / (B.t - A.t); }
        return true;
      }
      out.a = out.b = buf.at(-1).frame; out.k = 0; return true;
    },
    reset() { buf = []; offset = null; jitter = 0; lastT = -Infinity; },
  };
}
