// Keyboard device: held keys -> named actions in a per-source input layer (I-3: released on blur/hide).
const GUARD = 'input, textarea, select, [contenteditable]';

export function bindKeyboard(engine, bindings, { target, doc, source = 'keyboard', ramps = {} } = {}) {
  target = target ?? globalThis.window; doc = doc ?? target.document ?? globalThis.document;
  const keys = Object.keys(bindings).map(k => k.toLowerCase());
  const src = bindings; bindings = {}; Object.keys(src).forEach((k, i) => { bindings[keys[i]] = src[k]; });
  const held = {}; for (let i = 0; i < keys.length; i++) held[keys[i]] = false;
  const axes = [], buttons = [], out = {};
  for (let i = 0; i < keys.length; i++) {
    const b = bindings[keys[i]];
    if (Array.isArray(b)) { if (!axes.includes(b[0])) { axes.push(b[0]); out[b[0]] = 0; } } else if (!buttons.includes(b)) { buttons.push(b); out[b] = false; }
  }
  const val = {}; for (let i = 0; i < axes.length; i++) val[axes[i]] = 0;

  const release = () => { for (let i = 0; i < keys.length; i++) held[keys[i]] = false; for (let i = 0; i < axes.length; i++) val[axes[i]] = 0; };
  const onDown = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = String(e.key).toLowerCase(); if (!(k in held)) return;
    if (e.target?.closest?.(GUARD)) return;
    if (!((k === 'enter' || k === ' ') && e.target?.closest?.('button'))) e.preventDefault?.();
    if (!e.repeat) held[k] = true;
  };
  const onUp = e => {
    const k = String(e.key).toLowerCase();
    if (k in held) { held[k] = false; if (!((k === 'enter' || k === ' ') && e.target?.closest?.('button'))) e.preventDefault?.(); }
  };
  const onVis = () => { if (doc.visibilityState === 'hidden') release(); };
  target.addEventListener('keydown', onDown); target.addEventListener('keyup', onUp);
  target.addEventListener('blur', release); target.addEventListener('pagehide', release);
  doc.addEventListener('visibilitychange', onVis);

  function update(dt) {
    for (let a = 0; a < axes.length; a++) {
      const name = axes[a]; let t = 0;
      for (let i = 0; i < keys.length; i++) { const b = bindings[keys[i]]; if (held[keys[i]] && Array.isArray(b) && b[0] === name) t += b[1]; }
      t = t > 1 ? 1 : t < -1 ? -1 : t;
      const r = ramps[name]; let v = val[name];
      if (!r) v = t;
      else {
        const rising = t !== 0 && (v === 0 || Math.sign(v) === Math.sign(t)) && Math.abs(t) > Math.abs(v);
        const step = (rising ? r.rise : r.fall) * dt;
        v = v < t ? Math.min(t, v + step) : Math.max(t, v - step);
      }
      val[name] = v; out[name] = v;
    }
    for (let i = 0; i < buttons.length; i++) out[buttons[i]] = false;
    for (let i = 0; i < keys.length; i++) { const b = bindings[keys[i]]; if (held[keys[i]] && !Array.isArray(b)) out[b] = true; }
    engine.input.device(out, source);
  }
  function dispose() {
    target.removeEventListener('keydown', onDown); target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', release); target.removeEventListener('pagehide', release);
    doc.removeEventListener('visibilitychange', onVis);
    release(); engine.input.clearDevice(source);
  }
  return { update, release, dispose };
}
