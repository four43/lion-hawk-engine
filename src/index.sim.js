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
