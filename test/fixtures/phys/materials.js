// Stand-in for 3b's material registry (overview §4.2) until 3b merges: the members the World and checks read, with
// the same semantics, hand-resolved. Values are chosen for the tests: slick × grip = 0.25 × 0.81, geometric mean 0.45.
// density = sg × 1000 × fill (sg 1, fill 1 by default); a fluid without phys.sg has density 0.
const TABLE = {
  steel: { phys: { friction: 0.6, restitution: 0.1, sg: 7.85 } },
  shell: { phys: { friction: 0.6, restitution: 0.1, sg: 7.85, fill: 0.02 } },
  wood: { phys: { friction: 0.5, restitution: 0.2, sg: 0.6 } },
  rubber: { phys: { friction: 1.0, restitution: 0.5, sg: 1.1 } },
  gravel: { phys: { friction: 0.81, restitution: 0.1, sg: 1.8 } },
  grass: { phys: { friction: 0.6, restitution: 0.1, sg: 1.2 } },
  ice: { phys: { friction: 0.04, restitution: 0.05, sg: 0.92 } },
  slick: { phys: { friction: 0.25, restitution: 0, sg: 1 } },
  grip: { phys: { friction: 0.81, restitution: 0, sg: 1 } },
  bouncy: { phys: { friction: 0.5, restitution: 0.8, sg: 1 } },
  pet: { phys: { friction: 0.5, restitution: 0.1, sg: 1 } },
  air: { phys: { friction: 0, restitution: 0 }, fluid: { density: 1.2, viscosity: 1.8e-5 } },
};
const freeze = o => { if (o && typeof o === 'object') { for (const v of Object.values(o)) freeze(v); Object.freeze(o); } return o; };
freeze(TABLE);
const ids = Object.freeze(Object.keys(TABLE)), cache = new Map();
function get(id) {
  if (typeof id !== 'string' || !Object.hasOwn(TABLE, id)) throw new Error(`materials: unknown material '${id}'`);
  return TABLE[id];
}
function density(id) {
  const m = get(id);
  if (m.phys?.sg === undefined && m.fluid) return 0;
  return (m.phys?.sg ?? 1) * 1000 * (m.phys?.fill ?? 1);
}
export default Object.freeze({
  get,
  has: id => typeof id === 'string' && Object.hasOwn(TABLE, id),
  ids,
  index(id) { get(id); return ids.indexOf(id); },
  byIndex: i => ids[i],
  density,
  collider(id) {
    let c = cache.get(id);
    if (!c) { const m = get(id); cache.set(id, c = Object.freeze({ friction: Math.sqrt(m.phys?.friction ?? 0.5), restitution: m.phys?.restitution ?? 0, density: density(id) })); }
    return c;
  },
  hash: '5ca1ab1e',
});
