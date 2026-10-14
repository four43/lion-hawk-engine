// Sockets (A-7): each sock-<name> empty → { p, q, part } in body space (the scene root's space).
import { decompose, r6a } from './math.js';

export function socketsOf(socks) {
  const out = {};
  for (const { node, name, part } of socks) {
    const { t, q } = decompose(node.getWorldMatrix());
    out[name] = { p: r6a(t), q: r6a(q), part };
  }
  return out;
}
