// Baked animation tables (A-11), for instanced crowds that cannot use AnimationMixer. `<model>.anim.json` holds, per
// clip, frames × parts × 12 floats: each part's model-space matrix as Matrix4.elements without the bottom row
// (indices 0,1,2, 4,5,6, 8,9,10, 12,13,14). Sampling loops the clip and lerps element-wise between frames, exactly as
// Pig Pens' and Tractor's sampleAnim did. Sampling allocates nothing.
const COLS = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

export function decodeAnimTable(json) {
  if (!json || json.v !== 1) throw new Error(`animTable: v${json?.v} is not supported (expected v1)`);
  if (!Array.isArray(json.parts) || !json.parts.length) throw new Error('animTable: parts must be a non-empty array of part names');
  const P = json.parts.length, clips = {};
  for (const [name, c] of Object.entries(json.clips ?? {})) {
    if (!(c.dur > 0) || !Number.isInteger(c.frames) || c.frames < 1) throw new Error(`animTable: clip '${name}' needs dur > 0 and frames >= 1 (got dur ${c.dur}, frames ${c.frames})`);
    const bin = atob(c.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const want = c.frames * P * 12;
    if (bytes.length !== want * 4) throw new Error(`animTable: clip '${name}' has ${bytes.length / 4} floats, expected ${c.frames} frames × ${P} parts × 12 = ${want}`);
    clips[name] = Object.freeze({ dur: c.dur, frames: c.frames, data: new Float32Array(bytes.buffer) });
  }
  return Object.freeze({ fps: json.fps, parts: Object.freeze([...json.parts]), clips: Object.freeze(clips) });
}

// out: a THREE.Matrix4 (or anything with a 16-element `elements`)
export function sampleAnimTable(table, clip, t, partIndex, out) {
  const c = table.clips[clip];
  if (c === undefined) throw new Error(`animTable: no clip '${clip}' (has ${Object.keys(table.clips).join(', ')})`);
  const P = table.parts.length;
  if (!(partIndex >= 0 && partIndex < P)) throw new Error(`animTable: part ${partIndex} is out of range 0..${P - 1}`);
  const n = c.frames, f = ((((t / c.dur) % 1) + 1) % 1) * n, fl = Math.floor(f), i0 = fl % n, i1 = (i0 + 1) % n, u = f - fl;
  const d = c.data, a = (i0 * P + partIndex) * 12, b = (i1 * P + partIndex) * 12, o = out.elements;
  for (let k = 0; k < 12; k++) o[COLS[k]] = d[a + k] + (d[b + k] - d[a + k]) * u;
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return out;
}

const TMP = { elements: new Array(16).fill(0) };
// A·(1 − k) + B·k, element-wise (Pig Pens' lerpM blend from the previous clip A to the current clip B)
export function blendAnimTable(table, clipA, tA, clipB, tB, k, partIndex, out) {
  sampleAnimTable(table, clipA, tA, partIndex, TMP);
  sampleAnimTable(table, clipB, tB, partIndex, out);
  const a = TMP.elements, o = out.elements;
  for (let i = 0; i < 16; i++) o[i] = a[i] + (o[i] - a[i]) * k;
  return out;
}
