// src/view/profiles.js
// [C-13] (spec §5.5): saved binding overrides, Unreal's Enhanced Input User Settings. One localStorage entry per game
// and profile, 'lh.bindings.<game>.<profile>', holding { [device key]: { [mappable name]: input } }. Device keys are
// 'pad:<Gamepad.id>' and 'keys:<scheme>', so a wheel's overrides never reach a gamepad. Every storage access is in
// try/catch (private mode, a full quota, a blocked origin, bad JSON) and falls back to no overrides; junk is dropped
// field by field. The default storage is window.localStorage, never globalThis.localStorage (Node 26 warns on that
// one). View-only.
export const deviceKey = dev => (dev.kind === 'pad' ? 'pad:' + dev.id : dev.kind === 'keys' ? 'keys:' + dev.scheme : null);
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const clean = raw => {
  const out = Object.create(null);
  if (!isObj(raw)) return out;
  for (const d of Object.keys(raw)) {
    const m = raw[d]; if (!isObj(m)) continue;
    const o = Object.create(null); for (const n of Object.keys(m)) if (typeof m[n] === 'string' && m[n] !== '') o[n] = m[n];
    out[d] = o;
  }
  return out;
};
export function createProfiles({ game, storage }) {
  const store = () => (storage === undefined ? globalThis.window?.localStorage : storage) ?? null;
  const keyOf = profile => `lh.bindings.${game}.${profile}`;
  return {
    load(profile) {
      try { const t = store()?.getItem(keyOf(profile)); return typeof t === 'string' ? clean(JSON.parse(t)) : {}; } catch { return {}; }
    },
    save(profile, data) {
      try { const s = store(); if (s === null) return false; s.setItem(keyOf(profile), JSON.stringify(data)); return true; } catch { return false; }
    },
  };
}
