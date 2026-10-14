import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar, carWheels } from './fixtures/car.js';
import { createVehicle } from '../../src/kits/vehicle/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const NAMES = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
const qmul = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const axis = (v, t) => ({ x: v.x * Math.sin(t / 2), y: v.y * Math.sin(t / 2), z: v.z * Math.sin(t / 2), w: Math.cos(t / 2) });
const conj = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const turn = (q, v) => { const r = qmul(qmul(q, { ...v, w: 0 }), conj(q)); return { x: r.x, y: r.y, z: r.z }; };
const named = forward => carWheels(forward).map((w, i) => ({ ...w, part: NAMES[i] }));

for (const [forward, axle] of [['x', { x: 0, y: 0, z: 1 }], ['z', { x: -1, y: 0, z: 0 }]]) {
  test(`forward '${forward}': named wheels write e.partXf (hub, steer about up, roll about the axle); prev swaps; a forward roll moves the bottom back`, () => {
    const h = headless(kitGame()); flatTerrain(h.world);
    const car = spawnCar(h.world, { forward, wheels: named(forward) }), e = car.entity, vc = car.controller;
    assert.deepEqual(Object.keys(e.partXf), NAMES);
    car.set(0, { steer: 0.3 }).set(1, { steer: 0.3 }); h.step(60);
    car.wheels.forEach((w, i) => {
      const at = carWheels(forward)[i].at, P = e.partXf[NAMES[i]];
      near(P.p.x, at[0], 1e-6, `wheel ${i} p.x`); near(P.p.y, at[1] - w.suspension, 1e-6, `wheel ${i} p.y`); near(P.p.z, at[2], 1e-6, `wheel ${i} p.z`);
      const want = qmul(axis({ x: 0, y: 1, z: 0 }, w.steering), axis(axle, -vc.wheelRotation(i)));
      for (const k of ['x', 'y', 'z', 'w']) near(P.q[k], want[k], 1e-9, `wheel ${i} q.${k}`);
    });
    car.set(0, { steer: 0 }).set(1, { steer: 0 }).set(2, { engine: 800 }).set(3, { engine: 800 }); h.step(60);
    const q0 = { ...e.partXf[NAMES[2]].q }; h.step(1);
    assert.deepEqual({ ...h.world.partXfPrev(e, NAMES[2]).q }, q0, "prev is the last step's pose (lh.world.swap)");
    const bottom = turn(qmul(e.partXf[NAMES[2]].q, conj(q0)), { x: 0, y: -1, z: 0 });
    assert.ok(bottom[forward] < 0, `the bottom of a rear wheel moves back: ${bottom[forward]}`);
  });
}

test('wheel parts merge into a partXf the game gave; unnamed wheels add none; bad or repeated names throw before a controller is made', () => {
  const h = headless(kitGame()), w = h.world; flatTerrain(w);
  assert.equal(spawnCar(w).entity.partXf, undefined);
  const e = w.spawn({ tags: ['cart'], body: { type: 'dynamic', canSleep: false, mass: 900 }, colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }], at: [6, 1, 0], partXf: ['body'] });
  createVehicle(w, e, { wheels: carWheels().map((x, i) => (i < 2 ? { ...x, part: NAMES[i] } : x)) });
  assert.deepEqual(Object.keys(e.partXf), ['body', NAMES[0], NAMES[1]]);
  const made = w.rapier.vehicleControllers.size;
  assert.throws(() => spawnCar(w, { at: [0, 1, 6], wheels: carWheels().map(x => ({ ...x, part: 'wheel' })) }), /vehicle: wheel 1: part 'wheel' is used twice/);
  assert.throws(() => spawnCar(w, { at: [0, 1, -6], wheels: [{ ...carWheels()[0], part: 3 }] }), /vehicle: wheel 0: part must be a model part name \(got 3\)/);
  assert.equal(w.rapier.vehicleControllers.size, made);
});
