// Colliders from sidecar or inline entries (overview §4.3, §4.5): { shape, ...dims, p?, q?, part?, material }.
// Materials on colliders (M-4, M-9, D4): friction √f with Multiply gives two engine colliders the geometric mean of
// their materials; restitution with Max gives the larger; density comes from the registry. Rapier keeps the
// higher-priority rule when two colliders disagree (Average < Min < Multiply < Max), so a raw game collider that sets
// Max still wins; world.audit() lists such colliders for the debug hook.
import { isVec } from '../world/pool.js';

const positive = (v, what) => { if (!(Number.isFinite(v) && v > 0)) throw new Error(`${what} must be > 0 (got ${v})`); return v; };

export function shapeDesc(R, c) {
  const D = R.ColliderDesc;
  switch (c.shape) {
    case 'box':
      if (!isVec(c.half, 3) || !c.half.every(h => h > 0)) throw new Error(`box half must be three sizes > 0 (got ${JSON.stringify(c.half)})`);
      if (c.round !== undefined) return D.roundCuboid(c.half[0], c.half[1], c.half[2], positive(c.round, 'box round'));
      return D.cuboid(c.half[0], c.half[1], c.half[2]);
    case 'sphere': return D.ball(positive(c.r, 'sphere r'));
    case 'ball': throw new Error("unknown collider shape 'ball' (use 'sphere')"); // 3b ruling: §4.4's example was wrong
    case 'capsule': return D.capsule(positive(c.halfHeight, 'capsule halfHeight'), positive(c.r, 'capsule r'));
    case 'cylinder': return D.cylinder(positive(c.halfHeight, 'cylinder halfHeight'), positive(c.r, 'cylinder r'));
    case 'hull': {
      const n = c.points?.length ?? 0;
      if (n % 3 !== 0 || n < 12) throw new Error(`hull needs at least 4 points as [x, y, z, ...] (got ${n} numbers)`);
      return D.convexHull(Float32Array.from(c.points));
    }
    case 'mesh': {
      const nv = c.vertices?.length ?? 0, ni = c.indices?.length ?? 0;
      if (nv % 3 !== 0 || nv < 9 || ni % 3 !== 0 || ni < 3) throw new Error(`mesh needs vertices and triangle indices (got ${nv} vertex numbers, ${ni} indices)`);
      return D.trimesh(Float32Array.from(c.vertices), Uint32Array.from(c.indices));
    }
    default: throw new Error(`unknown collider shape '${c.shape}'`);
  }
}

// The collider's material: the spawn's override for its part, then the spawn's '*', then the entry's own (spec §2.2).
export function materialFor(entry, overrides) {
  const part = entry.part ?? 'body';
  if (overrides) {
    if (Object.hasOwn(overrides, part)) return overrides[part];
    if (Object.hasOwn(overrides, '*')) return overrides['*'];
  }
  return entry.material;
}

// m = registry.collider(id): { friction: √f, restitution, density }
export function applyMaterial(R, desc, m, density) {
  const rule = R.CoefficientCombineRule;
  return desc.setFriction(m.friction).setFrictionCombineRule(rule.Multiply)
    .setRestitution(m.restitution).setRestitutionCombineRule(rule.Max)
    .setDensity(density);
}
