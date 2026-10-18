// test/net-fields.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, kind, encodeRecord, encodeFrame, decodeFrame, createRegistry, actions, axis, button } from '../src/index.sim.js';
import { TUNE, SEND, INPUT_BATCH, INPUT_WIRE_MAX } from '../src/defs/fields.js';

const ACT = actions({ thr: axis(), honk: button() });
// Tractor Pickup 1.8.0's BODY (games/tractor-pickup/src/net/kinds.js) without dirt: F.body() must pack the same bytes (R5)
const XZ = F.fixed(-400, 400, 1 / 64), Y = F.fixed(-50, 50, 1 / 256), VEL = F.fixed(-32, 32, 1 / 1000), SPIN = F.fixed(-16, 16, 1 / 2000);
const OLD = F.obj({ p: F.obj({ x: XZ, y: Y, z: XZ }), q: F.quat(), v: F.obj({ x: VEL, y: VEL, z: VEL }), w: F.obj({ x: SPIN, y: SPIN, z: SPIN }) });
const pose = (x, y, z) => ({ p: { x, y, z }, q: { x: 0, y: Math.sin(0.3), z: 0, w: Math.cos(0.3) }, v: { x: 1.234, y: -0.5, z: 3 }, w: { x: 0, y: 2.5, z: 0.001 } });

test('3i: F.body() packs exactly what Tractor 1.8.0 packed for a body, without dirt (N-8, R5)', () => {
  const A = kind({ name: 'a', code: 1, authority: 'host', max: 4, idMax: 9, fields: { body: F.body() } });
  const B = kind({ name: 'b', code: 2, authority: 'host', max: 4, idMax: 9, fields: { body: OLD } });
  const rec = { body: pose(12.3, 1.7, -88.01) };
  assert.deepEqual(encodeRecord(A, 3, rec), encodeRecord(B, 3, rec));
  assert.equal(encodeRecord(A, 3, rec).length, 2 + 26, 'id + p 6 + q 8 + v 6 + w 6');
});
test('3i: F.body() round-trips at 1/64 m, 1/256 m, 1/1000 m/s and 1/2000 rad/s and clamps to its range', () => {
  const K = kind({ name: 'k', code: 1, authority: 'host', max: 4, idMax: 9, fields: { body: F.body({ range: 100, height: 20 }) } }), reg = createRegistry([K]);
  const back = rec => decodeFrame(encodeFrame({ key: false, sender: 1, time: 1, groups: [{ kind: K, records: [[1, rec]], removed: [] }] }), reg).groups.get('k').records.get(1).body;
  const b = back({ body: pose(12.3, 1.7, -88.01) });
  assert.ok(Math.abs(b.p.x - 12.3) <= 1 / 128 + 1e-9, 'x'); assert.ok(Math.abs(b.p.y - 1.7) <= 1 / 512 + 1e-9, 'y');
  assert.ok(Math.abs(b.v.x - 1.234) <= 5e-4 + 1e-9, 'v'); assert.ok(Math.abs(b.w.z - 0.001) <= 2.5e-4 + 1e-9, 'w');
  const far = back({ body: pose(500, 30, -500) });
  assert.equal(far.p.x, 100); assert.equal(far.p.y, 20); assert.equal(far.p.z, -100);
});
test('3i: F.body() rejects a range or height a u16 cannot hold', () => {
  assert.throws(() => F.body({ range: 512 }), /F\.body: range must be in \(0, 511\] \(got 512\)/);
  assert.throws(() => F.body({ height: 128 }), /F\.body: height must be in \(0, 127\] \(got 128\)/);
  assert.doesNotThrow(() => F.body({ range: 511, height: 127 }));
  assert.equal(F.body().body, true);
});
test('3i: kind() defaults: proxy for host kinds, driven for owner kinds with input and body, interp, TUNE, SEND (N-12, D8)', () => {
  const H = kind({ name: 'h', code: 1, authority: 'host', max: 4, idMax: 9, fields: { body: F.body() } });
  assert.equal(H.remote, 'proxy'); assert.equal(H.follow, 'interp');
  assert.deepEqual(H.tune, { snapAt: 1.5, nudge: 6, smoothMs: 150 }); assert.deepEqual(H.send, { hz: 20, key: 2 });
  assert.deepEqual(H.bodies, ['body']); assert.equal(H.input, null); assert.ok(Object.isFrozen(H.tune));
  const D = kind({ name: 'd', code: 2, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { body: F.body(), input: F.actions(ACT) } });
  assert.equal(D.remote, 'driven'); assert.equal(D.input.t, 'actions');
  const P = kind({ name: 'p', code: 3, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { yaw: F.angle(), input: F.actions(ACT) } });
  assert.equal(P.remote, 'proxy', 'no body: cannot be driven');
  assert.deepEqual(TUNE, { snapAt: 1.5, nudge: 6, smoothMs: 150 }); assert.deepEqual(SEND, { hz: 20, key: 2 }); assert.equal(INPUT_BATCH, 8);
});
test('3i: kind() validates remote, follow, tune, send and hooks, naming the kind', () => {
  const base = { code: 1, authority: 'owner', max: 1, idMin: 1, idMax: 4 };
  assert.throws(() => kind({ ...base, name: 'x', remote: 'ghost', fields: {} }), /kind 'x': remote must be one of driven, proxy, view \(got ghost\)/);
  assert.throws(() => kind({ ...base, name: 'x', remote: 'driven', fields: { body: F.body() } }), /kind 'x': remote 'driven' needs an input: F\.actions\(\.\.\.\) field and a body: F\.body\(\) field/);
  assert.throws(() => kind({ ...base, name: 'x', authority: 'host', remote: 'driven', fields: { body: F.body(), input: F.actions(ACT) } }), /kind 'x': remote 'driven' needs authority 'owner'/);
  assert.throws(() => kind({ ...base, name: 'x', follow: 'later', fields: {} }), /kind 'x': follow must be one of interp, forecast \(got later\)/);
  assert.throws(() => kind({ ...base, name: 'x', follow: 'forecast', fields: { yaw: F.angle() } }), /kind 'x': follow 'forecast' needs an F\.body\(\) field/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, tune: { snap: 1 } }), /kind 'x': unknown tune key 'snap'/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, tune: { snapAt: 0 } }), /kind 'x': tune\.snapAt must be > 0 \(got 0\)/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, tune: { nudge: 1.5 } }), /kind 'x': tune\.nudge must be an integer >= 1 \(got 1\.5\)/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, tune: { smoothMs: -1 } }), /kind 'x': tune\.smoothMs must be >= 0 \(got -1\)/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, send: { hz: 0 } }), /kind 'x': send\.hz must be > 0 \(got 0\)/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, send: { rate: 1 } }), /kind 'x': unknown send key 'rate'/);
  assert.throws(() => kind({ ...base, name: 'x', fields: {}, spawn: 3 }), /kind 'x': spawn must be a function/);
});
test('3i: a driven kind sends its input as { s, list } (N-13); a proxy owner kind sends one snapshot', () => {
  const D = kind({ name: 'd', code: 2, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { body: F.body(), input: F.actions(ACT) } }), reg = createRegistry([D], { maxSender: 4 });
  const list = [{ thr: 0.5, honk: false }, { thr: 1, honk: true }];
  const buf = encodeFrame({ key: false, sender: 2, time: 5, groups: [{ kind: D, records: [[2, { body: pose(0, 0, 0), input: { s: 41, list } }]], removed: [] }] });
  const r = decodeFrame(buf, reg).groups.get('d').records.get(2);
  assert.equal(r.input.s, 41); assert.equal(r.input.list.length, 2); assert.equal(r.input.list[1].honk, true); assert.ok(Math.abs(r.input.list[0].thr - 0.5) < 1e-4);
  assert.throws(() => encodeRecord(D, 2, { body: pose(0, 0, 0), input: { s: 1, list: [] } }), /bad list/, 'at least one input');
  assert.throws(() => encodeRecord(D, 2, { body: pose(0, 0, 0), input: { s: 1, list: Array(INPUT_WIRE_MAX + 1).fill(list[0]) } }), /bad list/, `at most ${INPUT_WIRE_MAX}`);
  const P = kind({ name: 'p', code: 3, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { yaw: F.angle(), input: F.actions(ACT) } });
  assert.equal(encodeRecord(P, 1, { yaw: 1, input: list[1] }).length, 2 + 2 + 2 + 1, 'id, yaw, one axis, one flags byte');
});
