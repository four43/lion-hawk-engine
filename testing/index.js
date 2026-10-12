// lion-hawk/test: helpers for node:test suites (spec §7.4).
export { scanSource, scanPurity, stripComments } from './purity.js';
export { canonical, checksum, diff, assertFinite } from './state.js';
export { golden } from './golden.js';
export { headless, policy, eventList } from './headless.js';
export { replay } from './replay.js';
