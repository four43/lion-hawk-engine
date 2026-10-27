// [D-9] view.debug: the debug panel registry. Always present and small; the host ([D-8]) is loaded only behind ?debug or
// ?fps and listens here. A definition is checked with or without the host, so a bad panel fails in every test.
const KEYS = ['id', 'title', 'mount', 'update', 'unmount', 'rate', 'width', 'height'];
const fail = m => { throw new Error(`debug: ${m}`); };
const text = v => typeof v === 'string' && v.length > 0;

export function checkPanel(def) {
  if (!def || typeof def !== 'object') fail(`a panel must be an object (got ${def === null ? 'null' : typeof def})`);
  if (!text(def.id)) fail(`a panel id must be a non-empty string (got ${JSON.stringify(def.id)})`);
  const at = m => fail(`panel '${def.id}': ${m}`);
  for (const k of Object.keys(def)) if (!KEYS.includes(k)) at(`${k} is unknown (known: ${KEYS.join(', ')})`);
  if (!text(def.title)) at(`title must be a non-empty string (got ${JSON.stringify(def.title)})`);
  if (typeof def.mount !== 'function') at('mount must be a function: mount(el, ui, view)');
  for (const k of ['update', 'unmount']) if (def[k] !== undefined && typeof def[k] !== 'function') at(`${k} must be a function`);
  if (def.rate !== undefined && def.rate !== 'frame' && !(typeof def.rate === 'number' && def.rate > 0 && Number.isFinite(def.rate))) at(`rate must be a number > 0 or 'frame' (got ${JSON.stringify(def.rate)})`);
  for (const k of ['width', 'height']) if (def[k] !== undefined && !(typeof def[k] === 'number' && def[k] > 0 && Number.isFinite(def[k]))) at(`${k} must be a number > 0 (got ${def[k]})`);
  return def;
}

// api is what the game sees (view.debug); panels() and listen(fn) are the host's. fn(type, def): type 'add' or 'remove'.
export function createDebugRegistry({ on = false } = {}) {
  const panels = new Map(), subs = new Set();
  const emit = (type, def) => { for (const fn of subs) fn(type, def); };
  const api = Object.freeze({
    on,
    panel(def) {
      checkPanel(def);
      if (panels.has(def.id)) fail(`panel '${def.id}' is already registered`);
      panels.set(def.id, def); emit('add', def);
      let done = false;
      return () => { if (done) return; done = true; if (panels.get(def.id) === def) { panels.delete(def.id); emit('remove', def); } };
    },
  });
  return { api, panels: () => panels.values(), listen(fn) { subs.add(fn); return () => subs.delete(fn); } };
}
