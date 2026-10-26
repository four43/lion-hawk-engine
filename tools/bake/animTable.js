// Baked animation tables (A-11, overview §4.3): every clip sampled at `fps` into model-space matrices of each row node (the
// parts, then the sockets as `sock-<name>`). Row layout: 12 floats, the column-major 4x4 without its last row
// [m0 m1 m2  m4 m5 m6  m8 m9 m10  m12 m13 m14]. Frame f is at t = f / frames × dur (loops; the end pose is frame 0).
// Rotations slerp, as AnimationMixer does.
import { compose, mul } from './math.js';

// shortest-arc slerp, as three's QuaternionLinearInterpolant (the runtime AnimationMixer)
function slerp(a, b, u) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let ka = 1 - u, kb = u;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - u) * th) / sn; kb = Math.sin(u * th) / sn; }
  const r = [0, 1, 2, 3].map(k => ka * a[k] + s * kb * b[k]), l = Math.hypot(...r);
  return r.map(x => x / l);
}
function sampler(anim, node, path, time) {
  const ch = anim.listChannels().find(c => c.getTargetNode() === node && c.getTargetPath() === path);
  if (!ch) return path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
  const s = ch.getSampler(), T = s.getInput().getArray(), V = s.getOutput().getArray(), w = path === 'rotation' ? 4 : 3;
  if (time <= T[0]) return Array.from(V.slice(0, w));
  if (time >= T[T.length - 1]) return Array.from(V.slice((T.length - 1) * w, T.length * w));
  let i = 0; while (T[i + 1] <= time) i++;                       // a key exactly at `time` wins, as in three's interpolants
  const u = s.getInterpolation() === 'STEP' ? 0 : (time - T[i]) / (T[i + 1] - T[i]);
  const A = V.slice(i * w, i * w + w), B = V.slice(i * w + w, i * w + 2 * w);
  if (w === 4) return slerp(A, B, u);
  return [0, 1, 2].map(k => A[k] * (1 - u) + B[k] * u);
}
function modelMatrix(anim, node, t) {
  let m = compose(sampler(anim, node, 'translation', t), sampler(anim, node, 'rotation', t), sampler(anim, node, 'scale', t));
  for (let p = node.getParentNode(); p; p = p.getParentNode())
    m = mul(compose(sampler(anim, p, 'translation', t), sampler(anim, p, 'rotation', t), sampler(anim, p, 'scale', t)), m);
  return m;
}

// rows: [{ node, name }] in table order; opts: { fps, clips: names | null (all, document order) }
export function animTable(doc, model, rows, { fps = 30, clips = null }) {
  const anims = doc.getRoot().listAnimations(), byName = new Map(anims.map(a => [a.getName(), a]));
  const names = clips ?? anims.map(a => a.getName());
  const out = { v: 1, fps, parts: rows.map(r => r.name), clips: {} };
  for (const name of names) {
    const anim = byName.get(name);
    if (!anim) throw new Error(`bake: ${model}: animation '${name}' missing (animTable.clips)`);
    for (const s of anim.listSamplers()) if (s.getInterpolation() === 'CUBICSPLINE') throw new Error(`bake: ${model}: animation '${name}' uses CUBICSPLINE (animTable samples LINEAR and STEP only)`);
    let dur = 0; for (const s of anim.listSamplers()) { const T = s.getInput().getArray(); dur = Math.max(dur, T[T.length - 1]); }
    const frames = Math.max(1, Math.round(dur * fps)), data = new Float32Array(frames * rows.length * 12);
    for (let f = 0; f < frames; f++) {
      const t = f / frames * dur;
      rows.forEach(({ node }, r) => {
        const m = modelMatrix(anim, node, t), o = (f * rows.length + r) * 12;
        for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) data[o + c * 3 + k] = m[c * 4 + k];
      });
    }
    out.clips[name] = { dur: Math.round(dur * 1e4) / 1e4, frames, data: Buffer.from(data.buffer).toString('base64') };
  }
  return out;
}
