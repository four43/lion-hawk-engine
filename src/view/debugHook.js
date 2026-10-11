// D-4: window.engine is always present, so Playwright scripts and the console drive every game the same way.
// Old per-game hooks (window.piggies, window.rally, window.tp) stay until their game reaches phase 2 (D-5).
import { ENGINE_VERSION } from '../version.js';

export function installEngineHook(api, { game, target = globalThis } = {}) {
  if (!game) throw new TypeError('installEngineHook: game id required');
  const hook = Object.defineProperties({ engine: ENGINE_VERSION, game }, Object.getOwnPropertyDescriptors(api)); // descriptors: getters stay live
  Object.defineProperty(target, 'engine', { value: hook, writable: false, configurable: true, enumerable: true });
  return hook;
}
