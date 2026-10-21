// test/net-key.test.mjs
// [N-18] the peer key; [T-22] mp() seats and rejoin (plan 2026-10-21-local-players-3, Task 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import RAPIER from '@dimforge/rapier3d-compat';
import { createMemoryHub, createPort, peerKey, claimPeerKey, keyWords } from '../src/index.net.js';
import { uuid4 } from '../src/net/key.js';
import { createEngine } from '../src/index.sim.js';
import { mp } from '../testing/index.js';
import relay from './fixtures/relay.js';
import carts from './net/fixtures/carts.js';
await RAPIER.init();

const U = '0123abcd-4567-89ef-0123-456789abcdef', U2 = '11111111-2222-3333-4444-555555555555';
const argsOf = i => ({ n: i + 1 });
const openOf = h => h.tape().log.flatMap(x => x.ops ?? []).find(o => o[0] === 'command' && o[1] === 'net.open');

test('keyWords: a UUID is four uint32 words (N-18)', () => {
  assert.deepEqual(keyWords(U), [0x0123abcd, 0x456789ef, 0x01234567, 0x89abcdef]);
  assert.throws(() => keyWords('nope'), /net: peer key must be a UUID \(got nope\)/);
});

test('peerKey keeps one key per tab in sessionStorage; junk is replaced; a storage that throws still gives a key (N-18)', () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let n = 0; const uuid = () => [U, U2][n++];
  const a = peerKey({ storage, uuid });
  assert.deepEqual(a, keyWords(U)); assert.deepEqual(peerKey({ storage, uuid }), a, 'a reload reads the same key'); assert.equal(n, 1);
  assert.equal(store.get('lh.peerKey'), U);
  store.set('lh.peerKey', 'junk'); assert.deepEqual(peerKey({ storage, uuid }), keyWords(U2));
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(peerKey({ storage: broken, uuid: () => U }), keyWords(U));
});

// a navigator.locks stand-in: request(name, { ifAvailable }, cb) gives cb a lock, or null while another holder has the name
const fakeLocks = (held = new Set()) => {
  const asked = [];
  return { held, asked, request(name, opts, cb) {
    asked.push([name, opts]);
    if (held.has(name)) return Promise.resolve(cb(null));
    held.add(name); const p = cb({ name, mode: 'exclusive' }); // a held callback's promise never resolves: the lock lasts the page's life
    p?.then?.(() => held.delete(name)); return p;
  } };
};
// [N-18] the lock name is public (navigator.locks.query() lists it to every same-origin page): a hash of the key, never the key
const lockName = u => 'lh.peer.' + createHash('sha256').update('lion-hawk peer lock\0' + u.replace(/-/g, '')).digest().subarray(0, 16).toString('hex');
const memStore = () => { const store = new Map(); return { store, storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } }; };

test('claimPeerKey keeps a free key and holds its lock for the page\'s life (N-18, duplicate tab)', async () => {
  const { store, storage } = memStore(); store.set('lh.peerKey', U);
  const locks = fakeLocks();
  assert.deepEqual(await claimPeerKey({ storage, locks }), keyWords(U));
  assert.deepEqual(locks.asked, [[lockName(U), { ifAvailable: true }]]);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(locks.held.has(lockName(U)), 'still held: the callback\'s promise never resolves');
  assert.equal(store.get('lh.peerKey'), U);
});

test('claimPeerKey: a key another live tab holds (a duplicated tab copied sessionStorage) gets a fresh key, stored (N-18)', async () => {
  const { store, storage } = memStore(); store.set('lh.peerKey', U);
  const locks = fakeLocks(new Set([lockName(U)]));
  assert.deepEqual(await claimPeerKey({ storage, locks, uuid: () => U2 }), keyWords(U2));
  assert.equal(store.get('lh.peerKey'), U2, 'a reload of this tab keeps the fresh key');
  assert.ok(locks.held.has(lockName(U2)), 'the fresh key is claimed');
});

test('the lock name is a hash of the key, never the key: stable, distinct per key, and the raw hex is nowhere in it (N-18, security)', async () => {
  const names = [];
  for (const u of [U, U, U2]) {
    const { store, storage } = memStore(); store.set('lh.peerKey', u);
    const locks = fakeLocks(); await claimPeerKey({ storage, locks }); names.push(locks.asked[0][0]);
  }
  assert.equal(names[0], names[1], 'stable for one key'); assert.notEqual(names[0], names[2], 'differs between keys');
  assert.equal(names[0], lockName(U), 'the independent sha256 form'); assert.equal(names[2], lockName(U2));
  for (const [n, u] of [[names[0], U], [names[2], U2]]) {
    const raw = u.replace(/-/g, '');
    assert.notEqual(n, 'lh.peer.' + raw); assert.ok(!n.includes(raw), 'no raw key'); assert.ok(!n.includes(raw.slice(0, 16)), 'no half of it either');
    assert.match(n, /^lh\.peer\.[0-9a-f]{32}$/);
  }
});

test('claimPeerKey without crypto.subtle returns the key unclaimed, as without locks (N-18)', async () => {
  const { store, storage } = memStore(); store.set('lh.peerKey', U);
  const locks = fakeLocks();
  assert.deepEqual(await claimPeerKey({ storage, locks, subtle: null }), keyWords(U));
  assert.deepEqual(locks.asked, [], 'no lock requested: the raw key is never a lock name');
  const throwing = { digest: async () => { throw new Error('no'); } };
  assert.deepEqual(await claimPeerKey({ storage, locks, subtle: throwing }), keyWords(U)); assert.deepEqual(locks.asked, []);
});

test('claimPeerKey without navigator.locks is the plain peerKey (N-18)', async () => {
  const { store, storage } = memStore(); store.set('lh.peerKey', U);
  assert.deepEqual(await claimPeerKey({ storage, locks: null }), keyWords(U));
});

test('with no crypto.randomUUID (an http page off a secure context) the key is a v4 UUID from getRandomValues (N-18, S4)', () => {
  const plain = { getRandomValues: a => a.fill(0xab) }; // no randomUUID
  assert.equal(uuid4(plain), 'abababab-abab-4bab-abab-abababababab', 'version nibble 4, variant bits 10');
  assert.equal(uuid4({ randomUUID: () => U, getRandomValues() { throw new Error('unused'); } }), U, 'randomUUID first when it exists');
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(peerKey({ storage, uuid: () => uuid4(plain) }), keyWords('abababab-abab-4bab-abab-abababababab'));
  assert.equal(uuid4().length, 36, 'Node: the default crypto works');
});

test('the port puts the key in net.open: the sim gets it as a recorded command (N-18)', () => {
  const hub = createMemoryHub(), H = createEngine(relay, { record: true });
  createPort(H, { transport: hub.host(), role: 'host', clock: () => 0, key: U }); H.stepN(1);
  assert.deepEqual(H.scene.state.log.find(c => c.type === 'net.open').data.key, keyWords(U));
  assert.deepEqual(openOf(H)[2].key, keyWords(U), 'in this page\'s own tape');
  assert.throws(() => createPort(createEngine(relay), { transport: hub.join(), role: 'guest', key: [1, 2] }), /port: key must be a UUID or four uint32 words \(N-18\)/);
  const G = createEngine(relay); createPort(G, { transport: hub.join(), role: 'guest', clock: () => 0 }); G.stepN(1);
  assert.equal(G.scene.state.log.find(c => c.type === 'net.open').data.key.length, 4, 'no key given: a fresh one');
});

test('mp: inputs per seat; a bare snapshot is seat 0; w.seat joins a seat by command (T-22)', () => {
  const w = mp(carts, { peers: 2, argsOf }); w.step(2);
  w.seat(1, 'join', 1); w.step(1); // a manual guest's second seat: from Task 5 numbered by route(), never colliding with the roster (B1)
  const g = w.guests[0].engine;
  w.step(1, [{ thr: 1 }, { 0: { thr: 0.5 }, 1: { thr: -1 } }]);
  assert.equal(w.host.engine.input.snapshot.thr, 1);
  assert.equal(g.controllerOf(0).input.snapshot.thr, 0.5); assert.equal(g.controllerOf(1).input.snapshot.thr, -1);
  assert.throws(() => w.step(1, [null, { 3: { thr: 1 } }]), /mp: guest1 has no seat 3/);
});

test('mp: w.rejoin brings a dropped guest back as a fresh page with its key, on a new transport id (T-22, N-18)', () => {
  const w = mp(carts, { peers: 2, argsOf, record: true }); w.seconds(0.5);
  const g = w.guests[0], id0 = g.net.id, e0 = g.engine;
  assert.throws(() => w.rejoin(g), /mp: guest1 is not dropped \(drop it first\)/);
  assert.throws(() => w.rejoin(w.host), /mp: the host cannot rejoin \(its room closed\)/);
  w.drop(g); w.seconds(0.5); w.rejoin(g, { wall0: 0 }); w.step(1);
  assert.equal(g.dropped, false); assert.notEqual(g.engine, e0, 'a reload is a new engine'); assert.notEqual(g.net.id, id0);
  assert.ok(g.engine.time.wall < w.host.engine.time.wall, 'wall0: the reload\'s clock starts lower (S3)');
  assert.deepEqual(g.key, [2, 0, 0, 0]); assert.deepEqual(openOf(g.h)[2].key, g.key);
  assert.deepEqual(w.addPeer({ key: [9, 9, 9, 9] }).key, [9, 9, 9, 9]);
});
