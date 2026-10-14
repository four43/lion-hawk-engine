// The Rapier wrapper's core (overview §4.5). The game injects its initialised module (D9); the engine never imports
// Rapier. Every integration parameter Rapier 0.21 exposes is written from PINNED_DEFAULTS merged with the game's
// params, so a Rapier bump that moves a default fails test/physics-rapier.test.mjs instead of silently changing feel
// (#1). The timer is a diagnostic only (#106): its numbers never reach state() or a checksum.
const f32 = Math.fround; // Rapier stores these as f32; the pinned values are what a fresh world reads back
export const PINNED_DEFAULTS = Object.freeze({
  lengthUnit: 1,
  normalizedAllowedLinearError: f32(0.005),
  normalizedPredictionDistance: f32(0.02),
  numSolverIterations: 4,
  numInternalPgsIterations: 1,
  maxCcdSubsteps: 1,
  softBodiesResweepStrain: 0.75,
  softBodiesMaxExtraSubsteps: 4,
  softBodiesContactStiffening: 4,
  softBodiesFemLinearTolerance: f32(1e-5),
  softBodiesFemMaxLinearIterations: 20,
  softBodiesFemMaxDenseDofs: 600,
  softBodiesRecovery: Object.freeze({
    authoredVelocityMargin: true, edgeSpeculation: false, invertedCellDetection: true, selfCrossingDetection: true,
    detectionMotionGating: true, crossBodyDetection: true, selfStandDown: true, crossBodyExpelGate: true,
    edgeStandDown: true, crossingRepulsion: false, crossingRepulsionGuide: false, crossingRepulsionSelfGuide: false,
    overlapConstraints: true, overlapRigid: true, overlapSkipSelfTangled: true, overlapEdgeStandDown: true,
    overlapSkinVolume: false, overlapSelfRegions: false, overlapNormalPush: true, overlapMultiVolume: false,
    recoveryPace: 0.5, overlapConstraintPace: 1, overlapKeptDepth: 0, overlapProgressMargin: f32(0.02),
    overlapSplit: 3, overlapPatience: 240, overlapPatchConstraints: 2,
  }),
});

export function mergeParams(params = {}) {
  for (const k of Object.keys(params)) if (!Object.hasOwn(PINNED_DEFAULTS, k)) throw new Error(`physics: params.${k} is not a Rapier 0.21 integration parameter`);
  return { ...PINNED_DEFAULTS, ...params, softBodiesRecovery: { ...PINNED_DEFAULTS.softBodiesRecovery, ...params.softBodiesRecovery } };
}

// D9 / §4.1: a guarded `new R.World` tells an initialised module from one whose WASM is not loaded yet.
// Only `World` is required here, so a stand-in module in a test reaches the init check.
export function checkRapier(R) {
  if (R == null) return;
  if (typeof R.World !== 'function') throw new Error('physics: physics.rapier must be the @dimforge/rapier3d-compat module');
  let w;
  try { w = new R.World({ x: 0, y: 0, z: 0 }); } catch { throw new Error('physics: await RAPIER.init() before createEngine'); }
  w.free();
}

function applyParams(rw, merged) {
  const ip = rw.integrationParameters; // one cached object per world; its setters write through to the WASM side
  for (const k of Object.keys(merged)) if (k !== 'softBodiesRecovery') ip[k] = merged[k];
  const r = ip.softBodiesRecovery; // a fresh wrapper each read: fill it, then assign it back
  for (const k of Object.keys(merged.softBodiesRecovery)) r[k] = merged.softBodiesRecovery[k];
  ip.softBodiesRecovery = r;
}

export function createPhysics(R, { gravity = [0, -9.81, 0], hz, params, timer = null } = {}) {
  if (!(hz > 0)) throw new Error(`physics: hz must be > 0 (got ${hz})`);
  const merged = mergeParams(params), g = { x: gravity[0], y: gravity[1], z: gravity[2] };
  const ph = {
    R, world: null, queue: null, stats: { stepMs: 0, stepMsTotal: 0 },
    step() {
      if (timer === null) { ph.world.step(ph.queue); return; }
      const t0 = timer();
      ph.world.step(ph.queue);
      const ms = timer() - t0;
      ph.stats.stepMs = ms; ph.stats.stepMsTotal += ms;
    },
    free() {
      if (ph.queue) { ph.queue.free(); ph.queue = null; }
      if (ph.world) { ph.world.free(); ph.world = null; }
    },
    recreate() { ph.free(); return make(); },
  };
  function make() {
    const w = new R.World(g);
    w.timestep = 1 / hz;
    applyParams(w, merged);
    ph.world = w; ph.queue = new R.EventQueue(true);
    return ph;
  }
  return make();
}
