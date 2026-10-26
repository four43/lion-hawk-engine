// U-9: a scene's menu options, shared by the sim (back, open, input gating) and the view's navigator (focus), so both
// read the same "which menu is on top" rule.
//   nav: { modal = false, initial, back, input = 'menu', open: { button, key, seconds = 0, when }, shoulders, buttons: { x, y, select, start } }
// The pad button names are the standard-mapping names the navigator reads (padEdges.js PAD_BUTTONS).
export const NAV_INPUTS = Object.freeze(['menu', 'shared']);
export const NAV_OPEN_BUTTONS = Object.freeze(['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs']);
// the pad buttons a menu may give its own handler (nav.buttons); A, B, LB/RB and the D-pad stay the navigator's
export const NAV_PRESS_BUTTONS = Object.freeze(['x', 'y', 'select', 'start']);
const handler = v => typeof v === 'function' || (typeof v === 'string' && !!v);

export function checkNav(name, nav, fail) {
  if (nav === undefined) return;
  const where = `scene '${name}'.nav`;
  if (nav === null || typeof nav !== 'object' || Array.isArray(nav)) fail(`${where} must be an object`);
  for (const k of Object.keys(nav)) if (!['modal', 'initial', 'back', 'input', 'open', 'shoulders', 'buttons'].includes(k)) fail(`${where}: unknown option '${k}'`);
  if (nav.modal !== undefined && typeof nav.modal !== 'boolean') fail(`${where}.modal must be a boolean`);
  if (nav.initial !== undefined && (typeof nav.initial !== 'string' || !nav.initial)) fail(`${where}.initial must be a control test id`);
  if (nav.back !== undefined && !handler(nav.back)) fail(`${where}.back must be an action name or a function`);
  if (nav.shoulders !== undefined && (typeof nav.shoulders !== 'string' || !nav.shoulders)) fail(`${where}.shoulders must be a choice id`);
  const bs = nav.buttons;
  if (bs !== undefined) {
    if (bs === null || typeof bs !== 'object' || Array.isArray(bs)) fail(`${where}.buttons must be an object`);
    for (const [k, v] of Object.entries(bs)) {
      if (!NAV_PRESS_BUTTONS.includes(k)) fail(`${where}.buttons: '${k}' must be one of ${NAV_PRESS_BUTTONS.join(', ')}`);
      if (!handler(v)) fail(`${where}.buttons.${k} must be an action name or a function`);
    }
  }
  if (nav.input !== undefined && !NAV_INPUTS.includes(nav.input)) fail(`${where}.input must be 'menu' or 'shared'`);
  const o = nav.open; if (o === undefined) return;
  if (o === null || typeof o !== 'object' || Array.isArray(o)) fail(`${where}.open must be an object`);
  for (const k of Object.keys(o)) if (!['button', 'key', 'seconds', 'when'].includes(k)) fail(`${where}.open: unknown option '${k}'`);
  if (o.button === undefined && o.key === undefined) fail(`${where}.open needs a button or a key`);
  if (o.button !== undefined && !NAV_OPEN_BUTTONS.includes(o.button)) fail(`${where}.open.button must be one of ${NAV_OPEN_BUTTONS.join(', ')}`);
  if (o.key !== undefined && (typeof o.key !== 'string' || !o.key)) fail(`${where}.open.key must be a key name`);
  if (o.seconds !== undefined && !(typeof o.seconds === 'number' && Number.isFinite(o.seconds) && o.seconds >= 0)) fail(`${where}.open.seconds must be a finite number >= 0`);
  if (o.when !== undefined && typeof o.when !== 'function') fail(`${where}.open.when must be a function`);
}

// the topmost open overlay that declares nav (overlays bottom to top), or undefined; the main scene never counts
export function topNav(game, overlays) {
  for (let i = overlays.length - 1; i >= 0; i--) { const s = game.scenes[overlays[i]]; if (s?.nav) return overlays[i]; }
  return undefined;
}
// is game input gated (a menu with input 'menu' on top)?
export function menuOwnsInput(game, overlays) {
  const t = topNav(game, overlays); return t !== undefined && (game.scenes[t].nav.input ?? 'menu') === 'menu';
}
