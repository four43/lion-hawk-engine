// I-8: the menu navigator's pad reader. Polls getGamepads() (standard mapping, every pad merged) and turns it into
// edges: one direction per push of the D-pad or the left stick (no repeat; the stick re-arms only once it is back near
// centre), and down/up edges of the menu buttons. Allocation-free per update (R-8): fixed fields, rewritten in place.
// Standard mapping indices: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, View 8, Start 9, LS 10, RS 11, D-pad 12-15.
export const PAD_BUTTONS = Object.freeze({ a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 });
const NAMES = Object.keys(PAD_BUTTONS);
const DPAD = [['up', 12], ['down', 13], ['left', 14], ['right', 15]];
export const STICK = Object.freeze({ fire: 0.5, rearm: 0.3 }); // a push crosses `fire` on its main axis; both axes under `rearm` re-arm

// family of one pad from its id (U-10): Sony 054c -> 'ps', Valve 28de -> 'deck', no standard mapping -> 'generic', else 'xbox'
export function familyOf(pad) {
  if (!pad) return 'xbox';
  const id = String(pad.id ?? '').toLowerCase();
  if (/054c|dualshock|dualsense|playstation|sony/.test(id)) return 'ps';
  if (/28de|steam deck|steamdeck/.test(id)) return 'deck';
  if (/045e|xbox|xinput/.test(id)) return 'xbox';
  return pad.mapping === 'standard' ? 'xbox' : 'generic';
}

export function createPadEdges({ getGamepads } = {}) {
  const get = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? []);
  const down = {}, prev = {}, pressed = {}, released = {};
  for (const n of NAMES) { down[n] = prev[n] = pressed[n] = released[n] = false; }
  const st = { dir: null, any: false, active: false, family: 'xbox', down, pressed, released };
  let armed = true;
  st.update = () => {
    const pads = get(); let sx = 0, sy = 0, any = false, lead = null, lit = false;
    for (let k = 0; k < NAMES.length; k++) { const n = NAMES[k]; prev[n] = down[n]; down[n] = false; }
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p]; if (!pad) continue; any = true;
      let busy = false;
      for (let k = 0; k < NAMES.length; k++) { const b = pad.buttons[PAD_BUTTONS[NAMES[k]]]; if (b?.pressed) { down[NAMES[k]] = true; busy = true; } }
      const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
      if (Math.abs(x) > Math.abs(sx)) sx = x;
      if (Math.abs(y) > Math.abs(sy)) sy = y;
      if (Math.abs(x) > STICK.fire || Math.abs(y) > STICK.fire) busy = true;
      if (busy && !lead) lead = pad; // the pad being used decides the family
    }
    st.dir = null; lit = false;
    for (let k = 0; k < NAMES.length; k++) { const n = NAMES[k]; pressed[n] = down[n] && !prev[n]; released[n] = !down[n] && prev[n]; if (pressed[n]) lit = true; }
    for (let i = 0; i < DPAD.length; i++) if (pressed[DPAD[i][0]]) { st.dir = DPAD[i][0]; break; }
    const ax = Math.abs(sx), ay = Math.abs(sy);
    if (armed && Math.max(ax, ay) > STICK.fire) {
      armed = false; lit = true;
      if (!st.dir) st.dir = ax >= ay ? (sx < 0 ? 'left' : 'right') : (sy < 0 ? 'up' : 'down'); // standard mapping: up is -y
    } else if (!armed && ax < STICK.rearm && ay < STICK.rearm) armed = true;
    st.any = any; st.active = lit; // active: something was pressed or pushed this update (the pad is the current input)
    if (lead) st.family = familyOf(lead);
    return st;
  };
  return st;
}
