// gltf-transform optimisation (A-3, overview §4.3) with the engine defaults { meshopt, quantize, weld, prune, dedupe }.
// Decision: POSITION and TEXCOORD are never quantized. quantize() would move a dequantization transform into the part nodes
// (or re-parent the mesh under an unnamed child), which breaks part names, sockets and anim-table rows. NORMAL, TANGENT and
// COLOR_n are quantized. Empty leaf nodes (sock-*) and extras survive prune; materials keep their (registry) names in dedup.
// Solid-colour textures survive prune (keepSolidTextures): a keepTextures model must keep its texture, not have it folded into the factor.
import { dedup, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { Logger } from '@gltf-transform/core';

export async function optimise(doc, o, { encoder }) {
  doc.setLogger(new Logger(Logger.Verbosity.WARN));          // prune's per-model info lines are noise
  const steps = [];
  if (o.dedupe) steps.push(dedup({ keepUniqueNames: true }));
  if (o.weld) steps.push(weld());
  if (o.prune) steps.push(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true, keepSolidTextures: true }));
  if (o.quantize) steps.push(quantize({ pattern: /^(NORMAL|TANGENT|COLOR_\d+)$/, quantizeNormal: 10, quantizeColor: 8 }));
  if (o.meshopt) steps.push(reorder({ encoder, target: 'size' }));
  if (steps.length) await doc.transform(...steps);
  if (o.meshopt) doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return doc;
}
