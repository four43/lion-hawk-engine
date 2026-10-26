// D-4: window.engine is always present, so Playwright scripts and the console drive every game the same way.
// A game adds its own debug helpers through its definition (`game.debug(engine)`, D-5), and they drive this hook; there
// are no per-game window globals.
import { ENGINE_VERSION } from '../version.js';

export function installEngineHook(api, { game, target = globalThis } = {}) {
  if (typeof game !== 'string' || !game) throw new TypeError('installEngineHook: game id required');
  const hook = Object.defineProperties({}, Object.getOwnPropertyDescriptors(api)); // descriptors: getters stay live
  Object.defineProperties(hook, { version: { value: ENGINE_VERSION, enumerable: true, configurable: true }, game: { value: game, enumerable: true, configurable: true } }); // reserved keys win over the api
  Object.defineProperty(target, 'engine', { value: hook, writable: false, configurable: true, enumerable: true });
  return hook;
}
