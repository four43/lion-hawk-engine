// A stand-in for 3c's World (overview §4.4) with only what view sync reads: with('xf') (live, spawn order), xfPrev(e, out),
// e.xf.p / e.xf.q (curr), serial and net.tunables. move() writes curr, step() copies curr -> prev (lh.world.swap), place()
// writes both (no smear), clear() empties it and changes serial. Prev poses are kept by id.
let SERIAL = 0;
export function fakeWorld() {
  const list = [], prev = new Map();
  let nextId = 1;
  const copy = (from, to) => { to.p.x = from.p.x; to.p.y = from.p.y; to.p.z = from.p.z; to.q.x = from.q.x; to.q.y = from.q.y; to.q.z = from.q.z; to.q.w = from.q.w; return to; };
  const w = {
    serial: ++SERIAL, net: { tunables: {} },
    with(...parts) { if (parts.length !== 1 || parts[0] !== 'xf') throw new Error(`fakeWorld: with(${parts.join(', ')}) is not faked`); return list; },
    spawn({ at = [0, 0, 0], q = [0, 0, 0, 1], tags = [], ...rest } = {}) {
      const e = { id: nextId++, tags: new Set(tags), ...rest, xf: { p: { x: at[0], y: at[1], z: at[2] }, q: { x: q[0], y: q[1], z: q[2], w: q[3] } } };
      prev.set(e.id, copy(e.xf, { p: {}, q: {} })); list.push(e); return e;
    },
    despawn(e) { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); prev.delete(e.id); },
    move(e, at, q) { e.xf.p.x = at[0]; e.xf.p.y = at[1]; e.xf.p.z = at[2]; if (q) { e.xf.q.x = q[0]; e.xf.q.y = q[1]; e.xf.q.z = q[2]; e.xf.q.w = q[3]; } },
    place(e, at, q) { w.move(e, at, q); copy(e.xf, prev.get(e.id)); },
    step() { for (let i = 0; i < list.length; i++) copy(list[i].xf, prev.get(list[i].id)); },
    clear() { list.length = 0; prev.clear(); nextId = 1; w.serial = ++SERIAL; },
    xfPrev(e, out) { return copy(prev.get(e.id), out); },
  };
  return w;
}
