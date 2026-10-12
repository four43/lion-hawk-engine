// lion-hawk/sim: everything that runs headless (L-3). No three.js, no DOM, no wall clock.
export { ENGINE_VERSION } from './version.js';
export { rng, fnv } from './core/rng.js';
export * from './core/math.js';
export { createEvents } from './core/events.js';
export { parseFlags, FLAGS } from './core/flags.js';
export { createSchedule, STEP_STAGES } from './core/schedule.js';
export { createLoop } from './core/loop.js';
export { axis, button, actions, createInput } from './core/actions.js';
export { createUi } from './core/ui.js';
export { defineGame, createEngine } from './core/engine.js';
export { policy } from './core/policy.js';
export { F, kind } from './defs/fields.js';
export { FRAME, MAX_FRAME, REPEAT, createRegistry, encodeRecord, encodeFrame, decodeFrame, isFrame, createTracker, createStore, frameToJson, frameFromJson } from './sim/replica.js';
export { DELAY, lerp, lerpAngle, lerpPose, createInterp } from './sim/interp.js';
export { FORECAST, newPose, extrapolate, createForecast } from './sim/forecast.js';
export { createRate, createWarnOnce } from './sim/limits.js';
