import test from 'node:test';
import assert from 'node:assert/strict';
import { F, kind, createRegistry, encodeFrame, decodeFrame, encodeRecord, createTracker, createStore, isFrame, FRAME, MAX_FRAME, REPEAT, frameToJson, frameFromJson, axis, button, actions, createRate, createWarnOnce } from '../src/index.sim.js';

const POS = F.fixed(-400, 400, 1 / 64);
const CRATE = kind({ name: 'crate', code: 1, authority: 'host', max: 64, idMax: 100, fields: { x: POS, z: POS, open: F.bool(), level: F.uint(1, 9, 2) } });
const CART = kind({ name: 'cart', code: 2, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { yaw: F.angle(), q: F.quat(), pad: F.actions(actions({ steer: axis(), honk: button() })) } });
const REG = createRegistry([CRATE, CART], { maxSender: 4 });

test('2f: a frame round-trips through decode, frameToJson and frameFromJson as plain JSON (#78)', () => {
  const buf = encodeFrame({ key: true, sender: 1, time: 1234, groups: [{ kind: CRATE, records: [[5, { x: 1.5, z: -2, open: true, level: 4 }]], removed: [] }] });
  const f = decodeFrame(buf, REG), j = frameToJson(f);
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j);
  assert.deepEqual(j, { key: true, sender: 1, time: 1234, groups: [{ kind: 'crate', records: [[5, { open: true, x: 1.5, z: -2, level: 4 }]], removed: [] }] });
  const back = frameFromJson(j, REG); assert.deepEqual(back.groups.get('crate').records.get(5), f.groups.get('crate').records.get(5));
  assert.deepEqual(back, f);
});
test('2f: F.uint has a minimum (encode throws, decode drops); F.actions packs a snapshot', () => {
  assert.throws(() => encodeFrame({ key: false, sender: 1, time: 0, groups: [{ kind: CRATE, records: [[1, { x: 0, z: 0, open: false, level: 1 }]] }] }), /bad uint 1/);
  const ok = encodeFrame({ key: false, sender: 1, time: 0, groups: [{ kind: CRATE, records: [[1, { x: 0, z: 0, open: false, level: 2 }]] }] }), b = new Uint8Array(ok);
  b[b.length - 1] = 1; assert.equal(decodeFrame(b.buffer, REG), null, 'level 1 is below the minimum');
  const buf = encodeFrame({ key: false, sender: 2, time: 9, groups: [{ kind: CART, records: [[2, { yaw: 1, q: { x: 0, y: 0, z: 0, w: 1 }, pad: { steer: -0.5, honk: true } }]] }] });
  const r = decodeFrame(buf, REG).groups.get('cart').records.get(2);
  assert.ok(Math.abs(r.pad.steer + 0.5) < 1e-4); assert.equal(r.pad.honk, true);
});
test('2f: F.actions keeps map order, clamps axes, and uses one flags byte per 8 buttons', () => {
  const names = Array.from({ length: 10 }, (_, i) => 'b' + i), map = actions({ x: axis(), ...Object.fromEntries(names.map(n => [n, button()])) });
  const K = kind({ name: 'pad', code: 3, authority: 'owner', max: 1, idMin: 1, idMax: 2, fields: { pad: F.actions(map) } });
  assert.equal(encodeRecord(K, 1, { pad: { x: 5, b0: true } }).length, 2 + 2 + 2, 'id, one i16, two flag bytes');
  const reg = createRegistry([K]), pad = { x: -2, ...Object.fromEntries(names.map((n, i) => [n, i % 3 === 0])) };
  const r = decodeFrame(encodeFrame({ key: false, sender: 1, time: 1, groups: [{ kind: K, records: [[1, { pad }]] }] }), reg).groups.get('pad').records.get(1).pad;
  assert.equal(r.x, -1); assert.deepEqual(Object.keys(r), ['x', ...names]); for (const n of names) assert.equal(r[n], pad[n], n);
  assert.throws(() => F.actions({ a: { kind: 'nope' } }), /axis\(\) or button\(\)/);
});
test('2f: a rate limit allows perSec in each 1 s window; a warning is logged once per kind (M-44, M-50)', () => {
  const r = createRate(3); assert.deepEqual([0, 1, 2, 3, 999].map(t => r.allow(t)), [true, true, true, false, false]); assert.equal(r.allow(1000), true);
  const seen = [], w = createWarnOnce((k, e) => seen.push([k, e])); w('a', 1); w('a', 2); w('b', 3); assert.deepEqual(seen, [['a', 1], ['b', 3]]);
});
test('frames stay small and an encoder bug is loud (M-53)', () => {
  const herd = Array.from({ length: 60 }, (_, i) => [i, { x: 1, z: 2, open: true, level: 3 }]);
  const key = encodeFrame({ key: true, sender: 1, time: 5, groups: [{ kind: CRATE, records: herd }] });
  assert.ok(key.byteLength <= MAX_FRAME); assert.equal(key.byteLength, 7 + 3 + 60 * (2 + 1 + 4 + 1) + 2);
  assert.throws(() => encodeFrame({ key: false, sender: 1, time: 1, groups: [{ kind: CRATE, records: Array.from({ length: 65 }, (_, i) => [i, { x: 0, z: 0, open: false, level: 2 }]) }] }), /too many/);
});
test('bad frames decode to null (M-50)', () => {
  const good = encodeFrame({ key: false, sender: 1, time: 1000, groups: [{ kind: CRATE, records: [[1, { x: 1, z: 2, open: true, level: 3 }]] }] }), bytes = () => new Uint8Array(good.slice(0));
  assert.ok(isFrame(good)); assert.equal(isFrame(new ArrayBuffer(0)), false); assert.equal(isFrame('text'), false);
  assert.ok(decodeFrame(good, REG));
  assert.equal(decodeFrame(good.slice(0, good.byteLength - 1), REG), null, 'truncated');
  const longer = new Uint8Array(good.byteLength + 1); longer.set(new Uint8Array(good)); assert.equal(decodeFrame(longer.buffer, REG), null, 'extra bytes');
  const big = new Uint8Array(MAX_FRAME + 1); big[0] = FRAME.DIFF; big[1] = 1; assert.equal(decodeFrame(big.buffer, REG), null, 'too big');
  let b = bytes(); b[1] = 5; assert.equal(decodeFrame(b.buffer, REG), null, 'player 5');
  b = bytes(); b[7] = 99; assert.equal(decodeFrame(b.buffer, REG), null, 'unknown kind');
  b = bytes(); b[12] = 0xf0; assert.equal(decodeFrame(b.buffer, REG), null, 'unused flag bits'); // head 7, kind 1, count 2, id 2: flags
  assert.equal(decodeFrame(encodeFrame({ key: false, sender: 2, time: 1, groups: [{ kind: CRATE, records: [] }] }), REG), null, 'a guest sending a host kind, even empty');
  assert.ok(decodeFrame(encodeFrame({ key: false, sender: 2, time: 1, groups: [{ kind: CART, records: [[3, { yaw: 0, q: { x: 0, y: 0, z: 0, w: 1 }, pad: {} }]] }] }), REG), 'owner ids are the host net part\'s to check (N-24)');
  assert.equal(decodeFrame(encodeFrame({ key: true, sender: 1, time: 1, groups: [{ kind: CRATE, records: [], removed: [3] }] }), REG), null, 'a keyframe that removes by name');
});
test('a diff has only changed objects for REPEAT diffs; a removed object is named REPEAT times (M-23)', () => {
  const t = createTracker([CRATE, CART]), ids = g => g.records.map(([id]) => id), c = (id, o = {}) => [id, { x: 1, z: 2, open: false, level: 2, ...o }];
  let all = [c(1), c(2)];
  for (let i = 0; i < REPEAT; i++) assert.deepEqual(ids(t.diff({ crate: all, cart: [] })[0]), [1, 2], 'new objects, ' + i);
  assert.deepEqual(ids(t.diff({ crate: all, cart: [] })[0]), [], 'no change, no record');
  all = [c(1, { x: 1.001 }), c(2, { open: true })]; // 1 mm is below the position step
  assert.deepEqual(ids(t.diff({ crate: all, cart: [] })[0]), [2]);
  t.diff({ crate: all }); t.diff({ crate: all });
  for (let i = 0; i < REPEAT; i++) assert.deepEqual(t.diff({ crate: [all[1]], cart: [] })[0].removed, [1]);
  assert.deepEqual(t.diff({ crate: [all[1]], cart: [] })[0].removed, []);
  assert.deepEqual(ids(t.diff({ crate: all, cart: [] })[0]), [1], 'back again: new');
  assert.deepEqual(t.key({ crate: all, cart: [] }).map(g => g.records.length), [2, 0], 'a keyframe has everything');
});
test('the store keeps the newest data per object, a keyframe removes what it leaves out, and a tombstone holds (M-26)', () => {
  const s = createStore([CRATE, CART]), at = (time, groups, key = false, sender = 1) => s.apply(decodeFrame(encodeFrame({ key, sender, time, groups }), REG));
  const r = (id, x = 1) => [id, { x, z: 0, open: false, level: 2 }], cart = { yaw: 0, q: { x: 0, y: 0, z: 0, w: 1 }, pad: {} };
  at(100, [{ kind: CRATE, records: [r(1), r(2)] }]);
  assert.deepEqual(at(90, [{ kind: CRATE, records: [r(1, 5)] }]), [], 'older time');
  assert.equal(at(120, [{ kind: CRATE, records: [r(1, 5)] }]).length, 1); assert.equal(s.get('crate', 1).x, 5);
  at(130, [{ kind: CRATE, records: [], removed: [2] }]); assert.equal(s.get('crate', 2), null);
  at(125, [{ kind: CRATE, records: [r(2)] }]); assert.equal(s.get('crate', 2), null, 'an older record does not bring a removed object back');
  at(140, [{ kind: CART, records: [[3, cart]] }], false, 3); at(140, [{ kind: CART, records: [[2, cart]] }], false, 2);
  const ch = at(150, [{ kind: CRATE, records: [r(3)] }, { kind: CART, records: [] }], true);
  assert.deepEqual(ch.map(c => [c.kind, c.id, c.rec === null]), [['crate', 3, false], ['crate', 1, true]], 'carts 2 and 3 are not the host\'s');
  assert.ok(s.get('cart', 2) && s.get('cart', 3));
  at(200, [{ kind: CART, records: [] }], true, 3); assert.equal(s.get('cart', 3), null, 'a keyframe ends its own sender\'s objects only'); assert.ok(s.get('cart', 2));
  s.forget('cart', 2); assert.equal(s.get('cart', 2), null); assert.equal(at(50, [{ kind: CART, records: [[2, cart]] }], false, 2).length, 1, 'a forgotten object accepts any clock');
  s.clear(); assert.equal(s.all('crate').size, 0);
});
test('a kind is plain data; defining one is loud about mistakes (M-22)', () => {
  const BALE = kind({ name: 'bale', code: 9, authority: 'owner', max: 4, idMin: 1, idMax: 4, fields: { x: F.fixed(-10, 10, 0.5), on: F.bool() } }), reg = createRegistry([BALE]);
  const f = decodeFrame(encodeFrame({ key: true, sender: 4, time: 7, groups: [{ kind: BALE, records: [[4, { x: 2.5, on: true }]] }] }), reg);
  assert.deepEqual(f.groups.get('bale').records.get(4), { on: true, x: 2.5 }); assert.equal(encodeRecord(BALE, 4, { x: 2.5, on: true }).length, 5);
  assert.throws(() => F.uint(3), /bad uint width/);
  assert.throws(() => F.obj(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['b' + i, F.bool()]))), /too many bools/);
  const mk = (name, code) => kind({ name, code, authority: 'host', max: 1, idMax: 1, fields: { a: F.bool() } });
  assert.throws(() => createRegistry([mk('a', 1), mk('a', 2)]), /duplicate/); assert.throws(() => createRegistry([mk('a', 1), mk('b', 1)]), /duplicate/);
  assert.throws(() => mk('c', 256), /bad kind code/);
});
test('the encoder normalizes quaternions and falls back to identity, so our own frames always decode (M-57)', () => {
  for (const bad of [{ x: NaN, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0, w: 0.85 }, { x: 0, y: 0, z: 0, w: 0 }, { x: Infinity, y: 0, z: 0, w: 0 }]) {
    const f = decodeFrame(encodeFrame({ key: false, sender: 2, time: 1, groups: [{ kind: CART, records: [[2, { yaw: 0, q: bad, pad: {} }]] }] }), REG); assert.ok(f, JSON.stringify(bad));
    const q = f.groups.get('cart').records.get(2).q; assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-3);
  }
});

test('F.uint rejects a bad range', () => {
  assert.throws(() => F.uint(1, 5, 6), /bad uint range/); assert.throws(() => F.uint(1, 5.5), /bad uint range/); assert.throws(() => F.uint(1, 5, 0.5), /bad uint range/);
});
test('F.actions: a second flags byte for more than 8 buttons; decode rejects stray high bits', () => {
  const names = Array.from({ length: 10 }, (_, i) => 'b' + i), K = kind({ name: 'pad', code: 3, authority: 'owner', max: 1, idMin: 1, idMax: 2, fields: { pad: F.actions(actions(Object.fromEntries(names.map(n => [n, button()])))) } });
  const reg = createRegistry([K]), pad = Object.fromEntries(names.map((n, i) => [n, i === 9 || i === 0]));
  const buf = encodeFrame({ key: false, sender: 1, time: 1, groups: [{ kind: K, records: [[1, { pad }]] }] }), b = new Uint8Array(buf);
  assert.deepEqual([b[12], b[13]], [1, 2]); assert.deepEqual(decodeFrame(buf, reg).groups.get('pad').records.get(1).pad, pad);
  const bad = b.slice(); bad[13] = 0x06; assert.equal(decodeFrame(bad.buffer, reg), null, 'bit 2 of the second byte has no button');
});
test('a keyframe ends the owner objects its sender last wrote, whatever their ids (N-24)', () => {
  const SEATED = kind({ name: 'seated', code: 7, authority: 'owner', max: 4, idMin: 1, idMax: 4, fields: { x: F.uint(1) } }), reg = createRegistry([SEATED]);
  const s = createStore([SEATED]), at = (time, records, key, sender) => s.apply(decodeFrame(encodeFrame({ key, sender, time, groups: [{ kind: SEATED, records, removed: [] }] }), reg));
  at(10, [[2, { x: 1 }], [4, { x: 1 }]], false, 2); at(10, [[3, { x: 1 }]], false, 3);
  assert.deepEqual(at(20, [[2, { x: 2 }]], true, 2).map(c => [c.id, c.rec === null]), [[2, false], [4, true]], 'seat 1 of the same peer left');
  assert.ok(s.get('seated', 3), 'another sender\'s object stays');
});
