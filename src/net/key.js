// src/net/key.js: [N-18] the peer key. One random key per tab, kept in sessionStorage (a reload keeps it; another tab is another
// peer), sent only to the host in net.hello. Handshake keeps its resume token in memory only, so a reload rejoins with a new
// transport id: the key is what survives. View and Node code (not sim-pure): the sim gets the key from the port's net.open.
const NAME = 'lh.peerKey', UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a UUID -> its 128 bits as four uint32 words (the wire form, F.list(F.uint(4), 4, 4): no string field type needed)
export function keyWords(uuid) {
  if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new Error(`net: peer key must be a UUID (got ${uuid})`);
  const h = uuid.replace(/-/g, '');
  return [0, 8, 16, 24].map(i => parseInt(h.slice(i, i + 8), 16) >>> 0);
}
// S4: crypto.randomUUID exists only in secure contexts (https, localhost); an http LAN page (the iPad in dev) has getRandomValues only
export function uuid4(crypto = globalThis.crypto) {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562: version 4, variant 10
  let h = ''; for (let i = 0; i < 16; i++) h += b[i].toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function peerKey({ storage = globalThis.window?.sessionStorage, uuid = () => uuid4() } = {}) {
  let k = null;
  try { k = storage?.getItem(NAME) ?? null; } catch { k = null; } // private mode, blocked storage
  if (typeof k !== 'string' || !UUID.test(k)) { k = uuid(); try { storage?.setItem(NAME, k); } catch { /* a key for this page load only */ } }
  return keyWords(k);
}
