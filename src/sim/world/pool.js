// E-10 transform pool (overview §4.4): one Float64Array with STRIDE 14 floats per slot, [px, py, pz, qx, qy, qz, qw]
// of the previous step, then the same for the current one. Slots go lowest-free-first, so which slot an entity gets
// depends only on the spawn/despawn sequence (determinism). The array doubles when full, only inside alloc()
// (that is, at spawn), never in swap or the physics read. Readers must use pool.buf each time: it is replaced on growth.
export const STRIDE = 14, PREV = 0, CURR = 7;
// Per-entity World internals live under this symbol (set non-enumerable by world.js): invisible to Object.keys,
// canonical(), JSON and game code.
export const INTERNAL = Symbol('lh.world');
export const DYNAMIC = 0, KINEMATIC = 1, FIXED = 2, BODILESS = -1;
// Shared by place.js, world.js and colliders.js: true when `a` is an array of exactly n finite numbers.
export const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export function createPool(cap = 64) {
  let used = new Uint8Array(cap), hint = 0, count = 0; // hint: no free slot below it
  const identity = s => { const b = pool.buf, o = s * STRIDE; b.fill(0, o, o + STRIDE); b[o + 6] = 1; b[o + 13] = 1; };
  const pool = {
    buf: new Float64Array(cap * STRIDE),
    get cap() { return used.length; },
    get count() { return count; },
    alloc() {
      let s = hint;
      while (s < used.length && used[s]) s++;
      if (s === used.length) {
        const u = new Uint8Array(used.length * 2); u.set(used); used = u;
        const b = new Float64Array(used.length * STRIDE); b.set(pool.buf); pool.buf = b;
      }
      used[s] = 1; hint = s + 1; count++;
      identity(s);
      return s;
    },
    free(s) {
      if (!used[s]) return;
      used[s] = 0; count--;
      if (s < hint) hint = s;
      identity(s);
    },
    reset() { used.fill(0); hint = 0; count = 0; pool.buf.fill(0); },
    write(s, at, p, q) {
      const b = pool.buf, o = s * STRIDE + at;
      b[o] = p.x; b[o + 1] = p.y; b[o + 2] = p.z; b[o + 3] = q.x; b[o + 4] = q.y; b[o + 5] = q.z; b[o + 6] = q.w;
    },
    read(s, at, p, q) {
      const b = pool.buf, o = s * STRIDE + at;
      p.x = b[o]; p.y = b[o + 1]; p.z = b[o + 2]; q.x = b[o + 3]; q.y = b[o + 4]; q.z = b[o + 5]; q.w = b[o + 6];
      return p;
    },
    // step start (lh.world.swap): prev = curr for every listed slot. A copy, not a pointer flip, so an entity that
    // nothing moves this step keeps prev == curr.
    swap(slots) {
      const b = pool.buf;
      for (let i = 0; i < slots.length; i++) { const o = slots[i] * STRIDE; b.copyWithin(o, o + CURR, o + STRIDE); }
    },
  };
  return pool;
}

// e.xf: accessors made once at spawn onto the slot's CURRENT half. They read pool.buf on every access (the buffer is
// replaced when the pool grows). A body entity's pose comes from Rapier: writing it throws (world.place moves it).
export function makeXf(pool, slot, e) {
  const o = slot * STRIDE + CURR;
  const acc = i => ({
    enumerable: true,
    get() { return pool.buf[o + i]; },
    set(v) { if (e.body) throw new Error(`world: entity ${e.id} has a body: move it with world.place`); pool.buf[o + i] = v; },
  });
  const p = Object.freeze(Object.defineProperties({}, { x: acc(0), y: acc(1), z: acc(2) }));
  const q = Object.freeze(Object.defineProperties({}, { x: acc(3), y: acc(4), z: acc(5), w: acc(6) }));
  return Object.freeze({ p, q, slot });
}

// What a despawned entity keeps: its last current pose, frozen, and no slot (the slot may already be another's).
export function deadXf(pool, slot) {
  const b = pool.buf, o = slot * STRIDE + CURR;
  return Object.freeze({
    p: Object.freeze({ x: b[o], y: b[o + 1], z: b[o + 2] }),
    q: Object.freeze({ x: b[o + 3], y: b[o + 4], z: b[o + 5], w: b[o + 6] }),
  });
}
