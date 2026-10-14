// Fixture material registry for the bake tests: the members the bake reads (has, density, hash), shaped like 3b's
// defineMaterials registry. Densities are sg × 1000 for the base entries the fixtures name.
const DENSITY = { steel: 7850, wood: 600, rubber: 1100, plastic: 950, flesh: 1000 };
export default Object.freeze({
  ids: Object.freeze(Object.keys(DENSITY)),
  has: id => Object.hasOwn(DENSITY, id),
  density: id => { if (!Object.hasOwn(DENSITY, id)) throw new Error(`materials: unknown material '${id}'`); return DENSITY[id]; },
  hash: '0f1e7a2b',
});
