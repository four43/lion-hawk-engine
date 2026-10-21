// D-1: URL flags parsed once into a frozen object. The caller passes location.search, so this stays headless.
const BOOLS = { debug: 'debug', tune: 'tune', fps: 'fps', nosw: 'nosw', mute: 'mute', 'lh-test': 'lhTest' };
export const FLAGS = Object.freeze([...Object.keys(BOOLS), 'seed', 'slow', 'replay']);

export function parseFlags(search) {
  const p = new URLSearchParams(search), out = {}, extra = {};
  for (const [name, key] of Object.entries(BOOLS)) { const v = p.get(name); out[key] = v !== null && v !== '0' && v !== 'false'; }
  const seed = p.get('seed'), slow = p.get('slow');
  out.seed = seed === null ? null : /^\d+$/.test(seed) ? Number(BigInt(seed) & 0xffffffffn) : seed;
  out.slow = slow === null || !Number.isFinite(parseFloat(slow)) ? null : parseFloat(slow);
  out.replay = p.get('replay');
  out.lhRender = out.lhTest && p.get('lh-test') === 'render'; // #47: full-manual rendering
  // [D-7] ?debug=<topics>: the comma-separated topics of an on ?debug (?debug=pads opens the pad bench); [] when off or bare
  out.debugs = Object.freeze(out.debug ? (p.get('debug') ?? '').split(',').map(s => s.trim()).filter(Boolean) : []);
  for (const [k, v] of p) if (!FLAGS.includes(k)) extra[k] = v;
  out.extra = Object.freeze(extra);
  return Object.freeze(out);
}
