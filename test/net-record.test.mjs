// test/net-record.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, kind, encodeRecord, actions, axis, button } from '../src/index.sim.js';
import { bodyEntity, newRecord, readBody, defaultRecord, applyFields, createInputRing, zeroActions } from '../src/sim/net/replicate.js';

const ACT = actions({ thr: axis(), honk: button() });
const TRAIN = kind({ name: 'train', code: 1, authority: 'owner', max: 1, idMin: 1, idMax: 4,
  fields: { body: F.body(), trailer: F.body(), mode: F.oneOf(['drive', 'show']), input: F.actions(ACT) } });
const PAD = kind({ name: 'pad', code: 2, authority: 'host', max: 4, idMax: 9, fields: { body: F.body(), input: F.actions(ACT), hue: F.uint(1) } });
const fill = v => (out = {}) => Object.assign(out, v); // Rapier 0.21's getters: fill the target when given, else a new object
const fakeBody = (p, q, v, w) => ({ translation: fill(p), rotation: fill(q), linvel: fill(v), angvel: fill(w) });
const Q = { x: 0, y: Math.sin(0.2), z: 0, w: Math.cos(0.2) }, I = { x: 0, y: 0, z: 0, w: 1 };

test('3i: the default record reads Rapier for body, the linked entity for another F.body() field, and e[k] for the rest (N-9)', () => {
  const trailer = { id: 8, body: fakeBody({ x: 1, y: 2, z: 3 }, I, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }) };
  const e = { id: 7, body: fakeBody({ x: 4, y: 0.5, z: -6 }, Q, { x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), trailer, mode: 'show', input: { thr: 1, honk: true } };
  const ring = createInputRing(TRAIN.input); ring.push(10, { thr: 0.5, honk: false }); ring.push(11, e.input);
  const rec = defaultRecord(TRAIN, e, newRecord(TRAIN), ring);
  assert.deepEqual(rec.body.p, { x: 4, y: 0.5, z: -6 }); assert.deepEqual(rec.body.q, Q); assert.deepEqual(rec.body.v, { x: 2, y: 0, z: 0 }); assert.deepEqual(rec.body.w, { x: 0, y: 1, z: 0 });
  assert.deepEqual(rec.trailer.p, { x: 1, y: 2, z: 3 }); assert.equal(rec.mode, 'show');
  assert.equal(rec.input.s, 11); assert.deepEqual(rec.input.list, [{ thr: 0.5, honk: false }, { thr: 1, honk: true }]);
  assert.equal(encodeRecord(TRAIN, 2, rec).length, 2 + 26 + 26 + 1 + (4 + 1 + 2 * 3));
  assert.equal(bodyEntity(e, 'body'), e); assert.equal(bodyEntity(e, 'trailer'), trailer);
  const again = newRecord(TRAIN); assert.notEqual(again, rec, 'newRecord makes a fresh record; the controller keeps one per entity');
});
test('3i: a bodiless entity records its pool pose with zero velocity; neither body nor xf throws', () => {
  const e = { id: 3, xf: { p: { x: 1, y: 2, z: 3 }, q: Q }, hue: 4, input: { thr: -1, honk: false } };
  const rec = defaultRecord(PAD, e, newRecord(PAD), null);
  assert.deepEqual(rec.body, { p: { x: 1, y: 2, z: 3 }, q: Q, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } });
  assert.deepEqual(rec.input, { thr: -1, honk: false }); assert.equal(rec.hue, 4);
  assert.throws(() => readBody({ id: 9 }, newRecord(PAD).body), /net: an F\.body\(\) field needs an entity with a body or xf \(entity 9\)/);
});
test('3i: the default apply writes game fields and a proxy\'s input, never the pose or a driven input', () => {
  const t = { id: 1, mode: 'drive', input: { thr: 0, honk: false } };
  applyFields(TRAIN, t, { body: 'not touched', trailer: 'nor this', mode: 'show', input: { s: 9, list: [{ thr: 1, honk: true }] } });
  assert.equal(t.mode, 'show'); assert.equal(t.body, undefined); assert.equal(t.trailer, undefined); assert.deepEqual(t.input, { thr: 0, honk: false }, 'a driven input comes from the queue');
  const p = { id: 2 };
  applyFields(PAD, p, { body: {}, input: { thr: 0.25, honk: true }, hue: 7 });
  assert.equal(p.hue, 7); assert.deepEqual(p.input, { thr: 0.25, honk: true }, 'made once, then copied into');
  const keep = p.input; applyFields(PAD, p, { body: {}, input: { thr: -0.5, honk: false }, hue: 7 }); assert.equal(p.input, keep);
});
test('3i: the input ring keeps the newest 8 owner steps, oldest first, as copies (N-13)', () => {
  const ring = createInputRing(TRAIN.input), src = { thr: 0, honk: false }, out = { s: 0, list: [] };
  for (let s = 1; s <= 10; s++) { src.thr = s / 10; src.honk = s % 2 === 0; ring.push(s, src); }
  ring.fill(out);
  assert.equal(ring.size, 8); assert.equal(out.s, 10); assert.equal(out.list.length, 8);
  assert.deepEqual(out.list.map(x => x.thr), [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  src.thr = 99; assert.equal(out.list[7].thr, 1, 'copied, not referenced');
  const list = out.list; ring.fill(out); assert.equal(out.list, list, 'the same list array every time');
  ring.clear(); ring.fill(out); assert.equal(out.list.length, 0); assert.equal(out.s, 0);
  assert.deepEqual(zeroActions(TRAIN.input), { thr: 0, honk: false });
});
