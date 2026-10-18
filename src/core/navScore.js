// U-8: the menu navigator's geometry. Pure (no DOM, no layout): rects in, an index out, so Node tests every layout and
// the browser feeds it getBoundingClientRect(). Rects are { x, y, w, h } in one coordinate space, y growing downwards.
//
// A candidate qualifies when its centre lies beyond the current rect's centre in the move direction AND it reaches
// beyond the current rect's far edge (it sits mostly on the far side). Then, as in Microsoft's projection strategy:
// 1. candidates that line up (overlap the current rect on the other axis) always beat those that don't;
// 2. one that doesn't line up must sit inside a 45° cone off the current rect's edges (crossGap <= gap), so the end of
//    a row stops instead of hopping to a staggered row below.
// Within a class the lowest score wins:  score = gap + CROSS * crossGap + TIE * |centre offset across|
// gap: the distance from the current rect's far edge to the candidate's near edge (0 when they touch or overlap);
// crossGap: the space between the two rects on the other axis (0 when they line up); the centre-offset term breaks ties
// between candidates that line up equally. Equal scores go to the lower index (document order). No candidate returns
// -1: menus stop at their edges (no wrap).
export const NAV_DIRS = Object.freeze(['up', 'down', 'left', 'right']);
const CROSS = 2, TIE = 0.1, EPS = 1e-6;

// dir -> [axis along, sign]; axis 0 = x, 1 = y
const AXIS = { left: [0, -1], right: [0, 1], up: [1, -1], down: [1, 1] };

// from: a rect, or an index into rects (which is then skipped). Returns the chosen index or -1.
export function pickNeighbour(from, dir, rects) {
  const a = AXIS[dir]; if (!a) throw new Error(`nav: unknown direction '${dir}'`);
  const skip = typeof from === 'number' ? from : -1, f = skip >= 0 ? rects[skip] : from;
  if (!f) return -1;
  const [ax, s] = a;
  const fPos = ax ? f.y : f.x, fLen = ax ? f.h : f.w, cPos = ax ? f.x : f.y, cLen = ax ? f.w : f.h;
  const fMid = fPos + fLen / 2, fFar = s > 0 ? fPos + fLen : fPos, fCross = cPos + cLen / 2;
  let best = -1, bestScore = Infinity, bestLined = false;
  for (let i = 0; i < rects.length; i++) {
    if (i === skip) continue;
    const r = rects[i]; if (!r || !(r.w > 0) || !(r.h > 0)) continue;
    const pos = ax ? r.y : r.x, len = ax ? r.h : r.w, xPos = ax ? r.x : r.y, xLen = ax ? r.w : r.h;
    const mid = pos + len / 2;
    if ((mid - fMid) * s <= EPS) continue;                              // its centre must be past ours
    const near = s > 0 ? pos : pos + len, far = s > 0 ? pos + len : pos;
    if ((far - fFar) * s <= EPS) continue;                              // and it must reach beyond our far edge
    const gap = Math.max(0, (near - fFar) * s);
    const crossGap = Math.max(0, xPos - (cPos + cLen), cPos - (xPos + xLen)), lined = crossGap <= EPS;
    if (!lined && (bestLined || crossGap > gap + EPS)) continue;       // lined-up first; off-line only inside the cone
    const score = gap + CROSS * crossGap + TIE * Math.abs(xPos + xLen / 2 - fCross);
    if ((lined && !bestLined) || score < bestScore - EPS) { bestScore = score; best = i; bestLined = lined; }
  }
  return best;
}
