// src/defs/materials.base.js
// The base material library (M-2): the spec's 18 entries, in spec order. Plain data; defineMaterials validates and
// resolves it. Tyre surfaces follow the usual racing names: asphalt = tarmac, dirt = hardpack,
// snow = packed snow. Fluids (water, air) carry no phys.sg, so their collider density is 0 (overview §4.2).
const freeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };

export const BASE_MATERIALS = freeze({
  steel: {
    look: { color: '#8a9099', metalness: 1, roughness: 0.35 },
    phys: { friction: 0.6, restitution: 0.2, sg: 7.85 },
    aero: { skin: 0.004 }, magnet: { ferrous: 0.9 },
    coverage: { dirt: 1, rust: 1, mud: 1, snow: 1 },
    sound: 'clang', fx: 'sparks',
  },
  aluminium: {
    look: { color: '#c4c8cc', metalness: 1, roughness: 0.3 },
    phys: { friction: 0.5, restitution: 0.2, sg: 2.7 },
    aero: { skin: 0.004 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'clang', fx: 'sparks',
  },
  wood: {
    look: { color: '#8b5a2b', roughness: 0.8 },
    phys: { friction: 0.5, restitution: 0.3, sg: 0.6 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'knock', fx: 'splinters',
  },
  rubber: {
    look: { color: '#222222', roughness: 0.9 },
    phys: { friction: 1, restitution: 0.6, sg: 1.1 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thud',
  },
  glass: {
    look: { color: '#d8f0ff', roughness: 0.05, transmission: 0.9, ior: 1.5, thickness: 0.01 },
    phys: { friction: 0.4, restitution: 0.1, sg: 2.5 },
    sound: 'clink', fx: 'shards',
  },
  plastic: {
    look: { color: '#e0e0e0', roughness: 0.5 },
    phys: { friction: 0.4, restitution: 0.4, sg: 0.95 },
    coverage: { dirt: 1, mud: 1 },
    sound: 'tap',
  },
  fabric: {
    look: { color: '#6a6a8a', roughness: 1, sheen: 0.5 },
    phys: { friction: 0.7, restitution: 0.1, sg: 0.5 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thump',
  },
  flesh: {
    look: { color: '#e8b4a0', roughness: 0.6, subsurface: { color: '#ff6040', strength: 0.5 } },
    phys: { friction: 0.6, restitution: 0.15, sg: 1.05 },
    coverage: { dirt: 1, mud: 1 },
    sound: 'squish',
  },
  fur: {
    look: { color: '#b08a60', roughness: 1, fur: { length: 0.03, shells: 10, density: 1, tint: '#ffffff' } },
    phys: { friction: 0.6, restitution: 0.1, sg: 1 },
    coverage: { dirt: 1, mud: 1, snow: 1 },
    sound: 'thump',
  },
  gravel: {
    look: { color: '#9a8f80', roughness: 1 },
    phys: { friction: 0.8, restitution: 0.1, sg: 1.6 },
    tire: { mu: 0.8, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
    dirtRate: 0.006, coverage: { snow: 1 },
    sound: 'crunch', fx: 'spray',
  },
  grass: {
    look: { color: '#5a8f3a', roughness: 1 },
    phys: { friction: 0.55, restitution: 0.05, sg: 1.3 },
    tire: { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.05, drag: 0.2 },
    dirtRate: 0.002, coverage: { snow: 1 },
    sound: 'rustle', fx: 'clods',
  },
  dirt: {
    look: { color: '#7a5a3a', roughness: 1 },
    phys: { friction: 0.9, restitution: 0.05, sg: 1.5 },
    tire: { mu: 0.9, C: 1.4, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
    dirtRate: 0.01, coverage: { snow: 1 },
    sound: 'crunch', fx: 'dust',
  },
  mud: {
    look: { color: '#4a3520', roughness: 0.7 },
    phys: { friction: 0.4, restitution: 0, sg: 1.8 },
    tire: { mu: 0.4, C: 1.5, kp: 0.15, ap: 0.16, crr: 0.1, drag: 0.18 },
    dirtRate: 0.03,
    sound: 'squelch', fx: 'splat',
  },
  asphalt: {
    look: { color: '#3a3a3c', roughness: 0.9 },
    phys: { friction: 1, restitution: 0.1, sg: 2.3 },
    tire: { mu: 1.15, C: 1.5, kp: 0.1, ap: 0.12, crr: 0.015, drag: 0 },
    dirtRate: 0, coverage: { dirt: 1, snow: 1 },
    sound: 'thud', fx: 'dust',
  },
  snow: {
    look: { color: '#f4f8fc', roughness: 0.9, subsurface: { color: '#cfe8ff', strength: 0.3 } },
    phys: { friction: 0.3, restitution: 0.05, sg: 0.4 },
    tire: { mu: 0.75, C: 1.25, kp: 0.2, ap: 0.2, crr: 0.03, drag: 0 },
    dirtRate: 0.004,
    sound: 'crunch', fx: 'powder',
  },
  ice: {
    look: { color: '#dff4ff', roughness: 0.05 },
    phys: { friction: 0.05, restitution: 0.05, sg: 0.917 },
    tire: { mu: 0.55, C: 1.4, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
    dirtRate: 0, coverage: { snow: 1 },
    sound: 'scrape', fx: 'frost',
  },
  water: {
    look: { color: '#3a7fbf', roughness: 0.05, transmission: 0.6, opacity: 0.8, transparent: true },
    fluid: { density: 1000, viscosity: 1e-3 },
    sound: 'splash', fx: 'splash',
  },
  air: {
    fluid: { density: 1.225, viscosity: 1.8e-5 },
  },
});
