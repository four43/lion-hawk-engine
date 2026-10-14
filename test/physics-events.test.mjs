// M-5: contact-force events become `contact` with entity ids, materials, impulse and a contact point; sensor
// collision events become `sensor`. Drain order is Rapier's (deterministic): contacts first, then sensors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventDrain } from '../src/sim/physics/events.js';
import { R } from './fixtures/phys/rapier.js';

function rig() {
  const w = new R.World({ x: 0, y: -9.81, z: 0 }), q = new R.EventQueue(true), map = new Map(), out = [];
  w.timestep = 1 / 60;
  const drain = createEventDrain({ emit: (type, d) => out.push({ type, ...d }), hz: 60, entityOf: h => map.get(h)?.e, materialOf: h => map.get(h)?.m });
  const step = n => { for (let i = 0; i < n; i++) { w.step(q); drain(w, q); } };
  return { w, q, map, out, step, free: () => { q.free(); w.free(); } };
}
const ground = r => r.w.createCollider(R.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(0, -0.5, 0));
const ball = (r, flags, threshold) => {
  const b = r.w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(1, 1, 0));
  const d = R.ColliderDesc.ball(0.5);
  if (flags) d.setActiveEvents(flags);
  if (threshold !== undefined) d.setContactForceEventThreshold(threshold);
  return r.w.createCollider(d, b);
};

test('a ball landing emits contact with ids, materials in a/b order, impulse = force / hz and the solver point', () => {
  const r = rig();
  try {
    const g = ground(r), c = ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 0.5 * 60);
    r.map.set(g.handle, { e: { id: 1 }, m: 'grip' }); r.map.set(c.handle, { e: { id: 2 }, m: 'rubber' });
    r.step(90);
    const hits = r.out.filter(x => x.type === 'contact');
    assert.ok(hits.length >= 1, 'the landing is above 0.5 N·s');
    const h = hits[0], mat = { 1: 'grip', 2: 'rubber' };
    assert.deepEqual([h.a, h.b].sort(), [1, 2]);
    assert.deepEqual(h.materials, [mat[h.a], mat[h.b]]);
    assert.ok(h.impulse >= 0.5, `impulse ${h.impulse}`);
    assert.ok(Math.abs(h.point[0] - 1) < 0.05 && Math.abs(h.point[1]) < 0.05 && Math.abs(h.point[2]) < 0.05, `point ${h.point}`);
  } finally { r.free(); }
});
test('no events below the threshold or without the flag', () => {
  const r = rig();
  try {
    ground(r); ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 1000 * 60);
    const quiet = rig(); ground(quiet); ball(quiet);
    r.step(90); quiet.step(90);
    assert.deepEqual(r.out, []); assert.deepEqual(quiet.out, []);
    quiet.free();
  } finally { r.free(); }
});
test('a raw collider without an entity reports null ids and materials', () => {
  const r = rig();
  try {
    ground(r); ball(r, R.ActiveEvents.CONTACT_FORCE_EVENTS, 0);
    r.step(90);
    const h = r.out.find(x => x.type === 'contact');
    assert.deepEqual([h.a, h.b, ...h.materials], [null, null, null, null]);
  } finally { r.free(); }
});
test('a ball falling through a sensor emits sensor on, then off', () => {
  const r = rig();
  try {
    const s = r.w.createCollider(R.ColliderDesc.cuboid(2, 0.5, 2).setTranslation(1, -2, 0).setSensor(true).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS));
    const c = ball(r);
    r.map.set(s.handle, { e: { id: 5 }, m: 'air' }); r.map.set(c.handle, { e: { id: 6 }, m: 'rubber' });
    r.step(120);
    assert.deepEqual(r.out.map(x => [x.type, x.sensor, x.other, x.on]), [['sensor', 5, 6, true], ['sensor', 5, 6, false]]);
  } finally { r.free(); }
});
