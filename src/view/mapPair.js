// The device map hook (I-2, #8, #81): a device's bindings may target two virtual names (map.from); the device feeds that pair,
// after a radial dead zone (map.radial), to map.to(x, y, out) with a reused out, and writes out's keys (actions) in place of
// the virtual names. to() writes into the passed out; its return value is ignored by the devices. Lets a game turn a stick into world-frame actions in the view, re-applied as the camera turns.
export function applyMap(map, x, y, out) {
  const dz = map.radial ?? 0, m = Math.hypot(x, y);
  if (m <= dz) x = y = 0;
  else if (dz > 0) { const k = Math.min(1, (m - dz) / (1 - dz)) / m; x *= k; y *= k; } // length rescaled to 0..1 past the zone
  return map.to(x + 0, y + 0, out);
}

// mapper(map, who) → layer(src): src is the device's own layer (virtual names included); the result is one reused object with
// src's other keys and the map's out keys, never the virtual names. Allocation-free after the first call.
export function mapper(map, who) {
  const from = map?.from;
  if (!Array.isArray(from) || from.length !== 2 || typeof from[0] !== 'string' || typeof from[1] !== 'string' || from[0] === from[1]) throw new Error(`${who}: map.from must be two distinct names`);
  if (typeof map.to !== 'function') throw new Error(`${who}: map.to must be a function`);
  const r = map.radial ?? 0; if (!(typeof r === 'number' && r >= 0 && r < 1)) throw new Error(`${who}: map.radial must be in [0, 1)`);
  const [fx, fy] = from, out = {}, layer = {};
  const num = v => typeof v === 'number' && v === v ? v : 0;
  return src => {
    for (const k in src) if (k !== fx && k !== fy) layer[k] = src[k];
    applyMap(map, num(src[fx]), num(src[fy]), out); // return ignored: to() fills out
    for (const k in out) layer[k] = out[k];
    return layer;
  };
}
