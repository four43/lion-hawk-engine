import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar } from './fixtures/car.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const slab = (w, material, half = 30) => w.spawn({ body: 'fixed', colliders: [{ shape: 'box', half: [half, 0.5, half], material }],
  at: [0, -0.5, 0], groups: { member: ['static'] } });

test('each wheel reads the terrain material under its own contact point, not the body centre (M-10)', () => {
  const h = headless(kitGame());
  const terrain = flatTerrain(h.world, { at: (x, z) => (z > 0 ? 'grass' : 'gravel') });
  const car = spawnCar(h.world, { terrain });
  h.step(120);
  assert.deepEqual(car.wheels.map(w => w.material), ['grass', 'gravel', 'grass', 'gravel']);
  assert.equal(terrain.materialAt(0, 0), 'grass'); // the body centre alone would have said grass for all four
  assert.equal(car.wheels[1].pair, h.world.materials.pair('rubber', 'gravel'));
});

test('off the terrain a wheel reads its ground collider material; in the air it reads none', () => {
  const h = headless(kitGame()), w = h.world;
  slab(w, 'asphalt', 20);
  const car = spawnCar(w), sky = spawnCar(w, { at: [0, 30, 10] });
  h.step(90);
  assert.deepEqual(car.wheels.map(x => x.material), ['asphalt', 'asphalt', 'asphalt', 'asphalt']);
  assert.equal(car.wheels[0].pair, w.materials.pair('rubber', 'asphalt'));
  near(car.wheels[0].friction, w.materials.pair('rubber', 'asphalt').friction, 0);
  sky.wheels.forEach(x => { assert.equal(x.inContact, false); assert.equal(x.material, null); assert.equal(x.pair, null); assert.equal(x.friction, 1); });
});

test('grip: true scales slip and side stiffness by the tyre/ground pair friction (D4 pair table)', () => {
  const h = headless(kitGame()), w = h.world;
  slab(w, 'ice');
  const grippy = spawnCar(w, { at: [-5, 1, 0], grip: true }), plain = spawnCar(w, { at: [5, 1, 0] });
  for (const car of [grippy, plain]) for (let i = 0; i < 4; i++) car.set(i, { slip: 2, side: 0.8 });
  h.step(90);
  for (let i = 0; i < 4; i++) {
    assert.equal(grippy.wheels[i].friction, 0.1, 'the rubber|ice pair entry, not the geometric mean');
    near(grippy.controller.wheelFrictionSlip(i), Math.fround(2 * 0.1), 1e-7);
    near(grippy.controller.wheelSideFrictionStiffness(i), Math.fround(0.8 * 0.1), 1e-7);
    near(plain.controller.wheelFrictionSlip(i), 2, 0);
    near(plain.controller.wheelSideFrictionStiffness(i), Math.fround(0.8), 0);
  }
});

test('an unknown tyre material throws before a controller is made', () => {
  const h = headless(kitGame()), w = h.world;
  assert.throws(() => spawnCar(w, { tyre: 'cheese' }), /vehicle: unknown tyre material 'cheese'/);
  assert.equal(w.rapier.vehicleControllers.size, 0);
});
