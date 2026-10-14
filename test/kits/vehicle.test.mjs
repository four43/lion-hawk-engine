import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain, MATERIALS } from './fixtures/kitGame.js';
import { spawnCar, carWheels, physFor, SUSPENSION } from './fixtures/car.js';
import { createVehicle, VEHICLE_SYSTEM } from '../../src/kits/vehicle/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const xyz = p => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const setup = () => { const h = headless(kitGame()); const terrain = flatTerrain(h.world); return { h, terrain }; };

test('a car settles on the terrain: every wheel in contact, flat normal, loaded suspension (design §7.3)', () => {
  const { h } = setup();
  const car = spawnCar(h.world);
  h.step(120);
  assert.equal(car.wheels.length, 4);
  car.wheels.forEach((w, i) => {
    assert.equal(w.inContact, true, `wheel ${i}`);
    near(w.point.y, 0, 0.01, `wheel ${i} point.y`); near(w.normal.y, 1, 1e-4, `wheel ${i} normal.y`);
    assert.ok(w.suspension > 0 && w.suspension <= SUSPENSION.rest + SUSPENSION.travel + 1e-6, `wheel ${i} suspension ${w.suspension}`);
    assert.ok(w.load > 0, `wheel ${i} load ${w.load}`);
  });
  assert.deepEqual(car.wheels.map(w => w.front), [true, true, false, false]);
  assert.ok(h.world.rapier.vehicleControllers.has(car.controller));
});

for (const [forward, axis, other, index] of [['x', 'x', 'z', 0], ['z', 'z', 'x', 2]]) {
  test(`forward '${forward}': engine force > 0 drives along +${axis} (setIndexForwardAxis quirk, axle sign)`, () => {
    const { h } = setup();
    const car = spawnCar(h.world, { forward });
    h.step(60);
    car.set(2, { engine: 800 }).set(3, { engine: 800 });
    h.step(120);
    const p = car.entity.xf.p;
    assert.ok(p[axis] > 1.5, `${axis} ${p[axis]}`); assert.ok(Math.abs(p[other]) < 0.3, `${other} ${p[other]}`);
    assert.equal(car.controller.indexForwardAxis, index);
    assert.ok(car.controller.currentVehicleSpeed() > 0.5, `speed ${car.controller.currentVehicleSpeed()}`);
    car.set(0, { steer: 0.3 }).set(1, { steer: 0.3 });
    h.step(30);
    assert.ok(car.entity.body.angvel().y > 0.05, `steer > 0 turns left (counter-clockwise from above): yaw rate ${car.entity.body.angvel().y}`);
  });
}

test('car.set reaches the controller on the next update; partial sets keep the rest; unset controls keep Rapier defaults', () => {
  const { h } = setup(), car = spawnCar(h.world), f = Math.fround, c = car.controller;
  car.set(0, { steer: 0.3, brake: 5 }).set(3, { engine: 800, slip: 2, side: 0.8 });
  car.set(0, { brake: 7 });
  h.step(1);
  near(c.wheelSteering(0), f(0.3), 0); near(c.wheelBrake(0), 7, 0); near(c.wheelEngineForce(3), 800, 0);
  near(c.wheelFrictionSlip(3), 2, 0); near(c.wheelSideFrictionStiffness(3), f(0.8), 0);
  near(car.wheels[0].steering, f(0.3), 0);
  assert.equal(c.wheelSteering(1), 0); near(c.wheelFrictionSlip(1), 10.5, 0); near(c.wheelSideFrictionStiffness(1), 1, 0);
  assert.throws(() => car.set(4, { steer: 1 }), /vehicle: wheel 4 out of range 0\.\.3/);
});

test('wheels may sit on sidecar sockets; an unknown socket names itself', () => {
  const h = headless(kitGame({ models: physFor(MATERIALS) })), w = h.world;
  flatTerrain(w);
  const desc = { model: 'cart', body: { type: 'dynamic', canSleep: false, mass: 1200 }, groups: { member: ['vehicle'], filter: ['ground', 'static'] } };
  const e = w.spawn({ ...desc, at: [0, 1, 0] }), names = ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr'];
  const car = createVehicle(w, e, { wheels: names.map(socket => ({ socket, radius: 0.35, suspension: SUSPENSION })) });
  names.forEach((n, i) => {
    const p = car.controller.wheelChassisConnectionPointCs(i), s = xyz(e.sockets[n].p);
    near(p.x, s[0], 1e-6); near(p.y, s[1], 1e-6); near(p.z, s[2], 1e-6);
  });
  h.step(90);
  assert.ok(car.wheels.every(x => x.inContact));
  const e2 = w.spawn({ ...desc, at: [6, 1, 0] });
  assert.throws(() => createVehicle(w, e2, { wheels: [{ socket: 'wheel-x', radius: 0.3 }] }), /vehicle: wheel 0: socket 'wheel-x' not on 'cart'/);
});

test('createVehicle refuses what cannot drive, before making anything', () => {
  const { h } = setup(), w = h.world, box = [{ shape: 'box', half: [1, 0.3, 0.6], material: 'steel' }];
  assert.throws(() => createVehicle({}, {}, {}), /vehicle: the World has no engine/);
  const ghost = w.spawn({ xf: true, tags: ['ghost'], at: [0, 1, 0] });
  assert.throws(() => createVehicle(w, ghost, { wheels: carWheels() }), /vehicle: 'ghost' has no body/);
  const kin = w.spawn({ body: 'kinematic', colliders: box, tags: ['kin'], at: [0, 1, 0] });
  assert.throws(() => createVehicle(w, kin, { wheels: carWheels() }), /vehicle: 'kin' needs a dynamic body/);
  const dyn = w.spawn({ body: { type: 'dynamic', mass: 900 }, colliders: box, tags: ['dyn'], at: [3, 1, 0] });
  assert.throws(() => createVehicle(w, dyn, { wheels: [] }), /vehicle: 'dyn' needs at least one wheel/);
  assert.throws(() => createVehicle(w, dyn, { wheels: carWheels(), forward: 'y' }), /vehicle: forward must be 'x' or 'z' \(got y\)/);
  assert.throws(() => createVehicle(w, dyn, { wheels: [{ at: [0, 0, 0], radius: 0 }] }), /vehicle: wheel 0: radius must be > 0 \(got 0\)/);
  assert.throws(() => createVehicle(w, dyn, { wheels: [{ radius: 0.3 }] }), /vehicle: wheel 0 needs at or socket/);
  assert.throws(() => createVehicle(w, dyn, { wheels: carWheels(), rayGroups: { filter: ['water'] } }), /vehicle: rayGroups names undeclared group 'water'/);
  assert.equal(w.rapier.vehicleControllers.size, 0);
});

test(`one '${VEHICLE_SYSTEM}' system per engine, in physics.world before lh.physics.step`, () => {
  const { h } = setup();
  spawnCar(h.world); spawnCar(h.world, { at: [6, 1, 0] });
  const order = h.engine.schedule()['physics.world'];
  assert.equal(order.filter(n => n === VEHICLE_SYSTEM).length, 1);
  assert.ok(order.indexOf(VEHICLE_SYSTEM) < order.indexOf('lh.physics.step'), order.join(', '));
});

test('rayGroups: member [] means every group (ray filter only); rays skip groups outside the filter; omitted means no filter', () => {
  const { h } = setup(), w = h.world;
  // a prop slab 0.5 m above the terrain under the cars; the chassis ignore props, so only wheel rays can touch it
  w.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [10, 0.05, 10], material: 'wood' }], at: [0, 0.45, 0], groups: { member: ['prop'] } });
  const a = spawnCar(w, { at: [-4, 1.5, 0], filter: ['ground', 'static'], rayGroups: { member: [], filter: ['ground', 'static'] } });
  const b = spawnCar(w, { at: [4, 1.5, 0], filter: ['ground', 'static'] });
  const c = spawnCar(w, { at: [0, 1.5, 6], filter: ['ground', 'static'], rayGroups: { member: ['vehicle'] } }); // filter omitted: every group (3c)
  h.step(120);
  a.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `a wheel ${i}`); near(x.point.y, 0, 0.01, `a wheel ${i} on the terrain`); });
  b.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `b wheel ${i}`); near(x.point.y, 0.5, 0.01, `b wheel ${i} on the slab`); });
  c.wheels.forEach((x, i) => { assert.equal(x.inContact, true, `c wheel ${i}`); near(x.point.y, 0.5, 0.01, `c wheel ${i} on the slab`); });
});
