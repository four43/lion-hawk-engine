// U-10: input prompt glyphs. A prompt names a role, not a button: <img data-lh-glyph="confirm" alt=""> shows the icon
// for whichever input was used last, read from <html data-lh-input> and data-lh-pad (kept by the menu navigator, U-7).
// Roles: confirm, back, menu, move, prev, next. Families: xbox, ps, deck, generic (pads), keys, pointer, touch. A role the
// current family has no input for hides its element. Icons: Kenney Input Prompts 1.5A, CC0 (icons.js, LICENSE.txt).
import { ICONS } from './icons.js';

export const GLYPH_ROLES = Object.freeze(['confirm', 'back', 'menu', 'move', 'prev', 'next']);
export const GLYPH_FAMILIES = Object.freeze(Object.keys(ICONS));
const uris = {};
for (const f of GLYPH_FAMILIES) { uris[f] = {}; for (const r of GLYPH_ROLES) uris[f][r] = ICONS[f][r] ? `data:image/svg+xml,${encodeURIComponent(ICONS[f][r])}` : null; }

// the icon for a role in a family, as a data: URI, or null when that family has no input for it
export function glyphFor(role, family) {
  if (!GLYPH_ROLES.includes(role)) throw new Error(`glyphs: unknown role '${role}'`);
  const f = uris[family]; if (!f) throw new Error(`glyphs: unknown family '${family}'`);
  return f[role];
}
// the family shown for <html data-lh-input / data-lh-pad>: the pad's family while the pad is the current input
export const familyFor = (input, pad) => input === 'pad' ? (uris[pad] ? pad : 'xbox') : (uris[input] ? input : 'pointer');

// A view device: keeps every [data-lh-glyph] element current. An <img> gets its src; any other element gets the CSS
// variable --lh-glyph: url(...) (for a mask or background). Work happens only when the family changes or glyph markup is
// added or changed (a MutationObserver), never per frame otherwise.
export function bindGlyphs(engine, { doc } = {}) {
  doc = doc ?? globalThis.document;
  const html = doc.documentElement, win = doc.defaultView;
  let shown = null, dirty = true;
  const mo = win?.MutationObserver ? new win.MutationObserver(() => { dirty = true; }) : null;
  mo?.observe(doc.body ?? html, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lh-glyph'] });
  const paint = family => {
    for (const el of doc.querySelectorAll('[data-lh-glyph]')) {
      const role = el.getAttribute('data-lh-glyph'), uri = GLYPH_ROLES.includes(role) ? uris[family][role] : null;
      el.hidden = !uri;
      if (!uri) continue;
      if (el.tagName === 'IMG') { if (el.getAttribute('src') !== uri) el.setAttribute('src', uri); }
      else el.style.setProperty('--lh-glyph', `url("${uri}")`);
      el.setAttribute('data-lh-glyph-family', family);
    }
  };
  function update() {
    const family = familyFor(html.getAttribute('data-lh-input'), html.getAttribute('data-lh-pad'));
    if (family === shown && !dirty && !(mo && mo.takeRecords().length)) return;
    shown = family; dirty = false; paint(family); mo?.takeRecords();
  }
  return { update, dispose() { mo?.disconnect(); } };
}
