// kit-vehicle's tire backend (design §3.5, §7.3; spec §3.2 tire.*): Rally's tire model as a second backend. The model
// itself, then the backend on a flat terrain: it settles, drives, brakes, steers, and its grip follows the ground's
// tire block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { carWheels } from './fixtures/car.js';
import { createVehicle } from '../../src/kits/vehicle/sim.js';
import { tireStep, mfNorm, surfaceOf, DEFAULT_SURFACE, TIRE } from '../../src/kits/vehicle/tire.js';
import { defineMaterials } from '../../src/index.sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);

test('the normalised Magic Formula peaks at 1 for rho = 1 on every base surface', () => {
  const reg = defineMaterials({});
  for (const id of reg.ids) {
    const t = reg.get(id).tire; if (!t) continue;
    const s = surfaceOf(t);
    near(mfNorm(1, s), 1, 1e-12, id); assert.ok(mfNorm(0.5, s) < 1 && mfNorm(2, s) < 1, id);
    assert.equal(surfaceOf(t), s, 'cached per tire block');
  }
});
test('tireStep: free rolling makes no force; slip makes force up to mu Fz, opposing the slide', () => {
  const out = {}, st = { dx: 0, dy: 0 }, s = DEFAULT_SURFACE, fz = TIRE.loadRef;
  tireStep(out, st, 0, 0, 20, fz, s, 1 / 240, 0, 0);
  assert.equal(out.fx, 0); assert.equal(out.fy, 0);
  const lock = { dx: 0, dy: 0 }; // a locked wheel at 20 m/s: slip velocity -20
  for (let i = 0; i < 240; i++) tireStep(out, lock, -20, 0, 20, fz, s, 1 / 240, 0, 0);
  assert.ok(out.fx < 0, `braking force ${out.fx}`); assert.ok(Math.abs(out.fx) <= s.mu * fz + 1e-6);
  const side = { dx: 0, dy: 0 }; // sliding left (+vy): the force pushes right (-)
  for (let i = 0; i < 240; i++) tireStep(out, side, 0, 3, 20, fz, s, 1 / 240, 0, 0);
  assert.ok(out.fy < 0, `lateral force ${out.fy}`); assert.ok(out.alpha < 0);
  assert.ok(out.rho <= TIRE.rhoMax);
});

const setup = (at = () => 'asphalt') => { const h = headless(kitGame()); h.terrain = flatTerrain(h.world, { at }); return h; };
const spawn = (h, opts = {}) => {
  const e = h.world.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 },
    colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }], groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop'] }, at: [0, 0.8, 0] });
  const wheels = carWheels('x').map(w => ({ at: w.at, radius: w.radius, front: w.front }));
  return createVehicle(h.world, e, { backend: 'tire', wheels, forward: 'x', terrain: h.terrain, ...opts });
};

test('tire backend: the car settles with every wheel loaded, the loads adding up to its weight', () => {
  const h = setup(), car = spawn(h);
  h.step(180);
  assert.equal(car.backend, 'tire');
  for (const w of car.wheels) { assert.equal(w.inContact, true); near(w.normal.y, 1, 1e-4); assert.ok(w.load > 0); }
  near(car.wheels.reduce((s, w) => s + w.load, 0), 1200 * 9.81, 1200 * 9.81 * 0.03, 'total load');
  near(car.entity.body.linvel().x, 0, 0.05, 'at rest');
});
test('tire backend: drive torque moves it forward, brakes stop it, steer > 0 turns left', () => {
  const h = setup(), car = spawn(h);
  h.step(60);
  for (const i of [2, 3]) car.set(i, { engine: 600 });
  h.step(120);
  const v = car.entity.body.linvel().x;
  assert.ok(v > 2, `speed ${v}`); assert.ok(car.wheels[2].omega > 0 && car.wheels[2].kappa > 0, 'driven wheels spin a little faster than the road');
  car.set(0, { steer: 0.3 }).set(1, { steer: 0.3 });
  h.step(30);
  assert.ok(car.entity.body.angvel().y > 0.05, `yaw ${car.entity.body.angvel().y}`);
  for (let i = 0; i < 4; i++) car.set(i, { engine: 0, steer: 0, brake: 1500 });
  h.step(240);
  near(car.entity.body.linvel().x, 0, 0.1, 'stopped');
  assert.throws(() => car.set(0, { slip: 1 }), /vehicle: the tire backend has no 'slip' control/);
});
test('tire backend: grip comes from the ground: the same torque spins up on ice and pulls away on asphalt', () => {
  const run = ground => { const h = setup(() => ground), car = spawn(h); h.step(60); for (const i of [2, 3]) car.set(i, { engine: 1500 }); h.step(90);
    return { v: car.entity.body.linvel().x, kappa: car.wheels[2].kappa, mat: car.wheels[2].material, mu: car.wheels[2].surface.mu }; };
  const a = run('asphalt'), i = run('ice');
  assert.equal(a.mat, 'asphalt'); assert.equal(i.mat, 'ice'); assert.ok(i.mu < a.mu);
  assert.ok(a.v > i.v * 1.5, `asphalt ${a.v} vs ice ${i.v}`);
  assert.ok(i.kappa > a.kappa * 2, `ice spins: kappa ${i.kappa} vs ${a.kappa}`);
});
test('tire backend: substeps and options are checked; it is deterministic', () => {
  const h = setup();
  assert.throws(() => spawn(h, { substeps: 0 }), /vehicle: substeps must be 'auto' or an integer in 1\.\.64/);
  assert.throws(() => spawn(h, { backend: 'magic' }), /vehicle: backend must be 'raycast' or 'tire'/);
  const sum = () => { const g = setup(), c = spawn(g, { substeps: 8 }); g.step(30); for (const k of [2, 3]) c.set(k, { engine: 800 }); g.step(60); return g.checksum(); };
  assert.equal(sum(), sum());
});
