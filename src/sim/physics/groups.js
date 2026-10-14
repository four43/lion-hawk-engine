// Named collision groups (overview §4.1, §4.5): up to 16 names, bit i for the i-th. Rapier packs membership in the
// high 16 bits and the filter in the low 16; two colliders interact only when each one's membership meets the
// other's filter. An omitted member or filter means every group, which is Rapier's own default.
export const ALL = 0xffff;

export function createGroups(names = []) {
  if (!Array.isArray(names)) throw new Error('physics: groups must be an array of names');
  if (names.length > 16) throw new Error(`physics: at most 16 groups (got ${names.length})`);
  const g = {};
  names.forEach((n, i) => {
    if (typeof n !== 'string' || !n) throw new Error(`physics: group ${i} must be a non-empty string`);
    if (n === 'mask') throw new Error("physics: group 'mask' is reserved");
    if (Object.hasOwn(g, n)) throw new Error(`physics: group '${n}' is declared twice`);
    g[n] = 1 << i;
  });
  const bits = (list, what) => {
    if (list === undefined) return ALL;
    if (!Array.isArray(list)) throw new Error(`physics: groups.${what} must be an array of names`);
    let m = 0;
    for (const n of list) { if (!Object.hasOwn(g, n)) throw new Error(`physics: group '${n}' is not declared`); m |= g[n]; }
    return m;
  };
  Object.defineProperty(g, 'mask', { value: (member, filter) => ((bits(member, 'member') << 16) | bits(filter, 'filter')) >>> 0 });
  return Object.freeze(g);
}
