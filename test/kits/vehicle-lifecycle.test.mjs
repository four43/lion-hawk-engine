import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { spawnCar } from './fixtures/car.js';
import { VEHICLE_SYSTEM } from '../../src/kits/vehicle/sim.js';

const setup = () => { const h = headless(kitGame()); flatTerrain(h.world); return h; };
const counted = (car, log, name) => { const u = car.update; car.update = dt => { log.push(name); u(dt); }; };

test('despawn frees the controller and drops the car from the update list', () => {
  const h = setup(), car = spawnCar(h.world), log = [];
  h.step(10); counted(car, log, 'car');
  h.step(2); assert.equal(log.length, 2);
  h.world.despawn(car.entity);
  assert.equal(car.removed, true);
  assert.equal(h.world.rapier.vehicleControllers.size, 0);
  h.step(5); assert.equal(log.length, 2);
});

test('world.clear() frees every controller; vehicles on the rebuilt World run', () => {
  const h = setup();
  const a = spawnCar(h.world), b = spawnCar(h.world, { at: [6, 1, 0] });
  h.step(10);
  h.world.clear();
  assert.equal(a.removed && b.removed, true);
  assert.equal(h.world.rapier.vehicleControllers.size, 0);
  flatTerrain(h.world);
  const c = spawnCar(h.world);
  h.step(90);
  assert.ok(c.wheels.every(w => w.inContact));
});

test("leaving the scene leaves its vehicles with its World; the next scene's vehicles run", () => {
  const h = setup();
  spawnCar(h.world); h.step(10);
  h.go('other'); h.step(10);
  h.go('play'); flatTerrain(h.world);
  const car = spawnCar(h.world); h.step(90);
  assert.ok(car.wheels.every(w => w.inContact));
});

test('vehicles update in creation order; game systems sit before and after the kit', () => {
  const h = setup(), log = [];
  counted(spawnCar(h.world, { at: [-5, 1, 0] }), log, 'a');
  counted(spawnCar(h.world, { at: [5, 1, 0] }), log, 'b');
  h.engine.system('game.controls', () => log.push('pre'), { stage: 'physics.world', before: [VEHICLE_SYSTEM] });
  h.engine.system('game.assist', () => log.push('post'), { stage: 'physics.world', after: [VEHICLE_SYSTEM], before: ['lh.physics.step'] });
  h.step(1);
  assert.deepEqual(log, ['pre', 'a', 'b', 'post']);
});
