// kit-vehicle powertrain (H-6; engine-sound spec §3): the engine model alone, against a fake wheel, and on the tire backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPowertrain, ENGINE_PRESETS, createVehicle } from '../../src/kits/vehicle/sim.js';
import { scanPurity } from '../../testing/purity.js';
import { allocRate } from '../helpers/alloc.mjs';
import { headless } from '../../testing/index.js';
import { kitGame, flatTerrain } from './fixtures/kitGame.js';
import { carWheels } from './fixtures/car.js';

const DT = 1 / 60;
const run = (pt, secs, each = () => {}, omega = () => 0) => { for (let i = 0; i < Math.round(secs / DT); i++) { each(i); pt.step(DT, omega()); } };

test('H-6: idle settles at the preset idle with about 0.35 bar in the manifold', () => {
  const pt = createPowertrain(); run(pt, 2);
  assert.ok(Math.abs(pt.state.rpm - 850) < 30, `rpm ${pt.state.rpm}`); assert.ok(pt.state.map > 0.3 && pt.state.map < 0.4, `map ${pt.state.map}`);
  assert.equal(pt.state.running, true); assert.equal(pt.state.fuelCut, false);
});
test('H-6: full throttle in neutral climbs to the limiter, which bounces; the manifold fills to about 0.9 bar', () => {
  const pt = createPowertrain(); pt.throttle = 1; let max = 0, toggles = 0, was = false;
  run(pt, 3, () => { max = Math.max(max, pt.state.rpm); if (pt.state.limiter !== was) { toggles++; was = pt.state.limiter; } });
  assert.ok(max >= 7150 && max < 7500, `max ${max}`); assert.ok(toggles >= 3, `limiter toggles ${toggles}`); assert.ok(pt.state.map > 0.85, `map ${pt.state.map}`);
});
test('H-6: lifting above 2500 rpm cuts fuel and opens the afterfire window, which decays; idle ends the cut', () => {
  const pt = createPowertrain(); pt.throttle = 1; run(pt, 2); pt.throttle = 0; pt.step(DT);
  assert.equal(pt.state.fuelCut, true); assert.ok(pt.state.popWin > 0.95);
  run(pt, 3); assert.equal(pt.state.fuelCut, false); assert.equal(pt.state.popWin, 0); assert.ok(Math.abs(pt.state.rpm - 850) < 40);
});
test('H-6: start() cranks, catches after 0.55 s and releases the starter near idle', () => {
  const pt = createPowertrain({ running: false }); assert.equal(pt.state.rpm, 0);
  pt.start(); run(pt, 0.4); assert.equal(pt.state.starter, true); assert.equal(pt.state.running, false); assert.ok(pt.state.rpm > 200 && pt.state.rpm < 320, `cranking ${pt.state.rpm}`);
  run(pt, 1.6); assert.equal(pt.state.running, true); assert.equal(pt.state.starter, false); assert.ok(Math.abs(pt.state.rpm - 850) < 40);
});
test('H-6: a turbo builds boost at full throttle and one blow-off fires on the lift', () => {
  const pt = createPowertrain({ turbo: { maxBoost: 1 } }); pt.throttle = 1; let b = 0; run(pt, 3, () => { b = Math.max(b, pt.state.boost); });
  assert.ok(b > 0.8, `boost ${b}`); assert.ok(pt.state.map > 1.5);
  pt.throttle = 0; run(pt, 1); assert.equal(pt.state.bovId, 1); assert.ok(pt.state.bovAmp >= 0.2);
});
test('H-6: driving a fake car through the gears: the clutch locks, shifts open it, nothing diverges', () => {
  const Iw = 2 + 1200 * 0.32 * 0.32, pt = createPowertrain({ wheelInertia: Iw }); let w = 0, during = null;
  pt.shift(1); pt.throttle = 1;
  for (let i = 0; i < 12 / DT; i++) {
    const s = pt.state; if (s.gear < 6 && s.rpm > 6500 && s.shiftT === 0) { pt.shift(s.gear + 1); during = i; }
    const Tw = pt.step(DT, w), v = w * 0.32;
    if (i === during) assert.equal(Tw, 0, 'a shift opens the clutch');
    w += (Tw - (1200 * 9.81 * 0.013 + 0.5 * 1.2 * 0.68 * v * v) * 0.32) / Iw * DT;
    assert.ok(Number.isFinite(w) && Number.isFinite(s.rpm) && s.rpm >= 0 && s.rpm < 7600, `step ${i}: rpm ${s.rpm}`);
  }
  assert.ok(pt.state.gear >= 3, `gear ${pt.state.gear}`); assert.ok(w * 0.32 > 25, `speed ${w * 0.32}`);
  const fromWheel = w * [3.5, 2.1, 1.45, 1.1, 0.88, 0.72][pt.state.gear - 1] * 3.9 * 60 / (2 * Math.PI);
  assert.ok(Math.abs(pt.state.rpm - fromWheel) < 300, `locked: ${pt.state.rpm} vs ${fromWheel}`);
});
test('H-6: on the tire backend it pulls away through the gears, deterministically', () => {
  const drive = () => {
    const h = headless(kitGame()); h.terrain = flatTerrain(h.world, { at: () => 'asphalt' });
    const e = h.world.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 }, colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], material: 'steel' }],
      groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop'] }, at: [0, 0.8, 0] });
    const car = createVehicle(h.world, e, { backend: 'tire', wheels: carWheels('x').map(w => ({ at: w.at, radius: w.radius, front: w.front })), forward: 'x', terrain: h.terrain });
    h.step(60);
    const pt = createPowertrain(); pt.shift(1); pt.throttle = 1;
    for (let i = 0; i < 300; i++) {
      const s = pt.state; if (s.gear < 6 && s.rpm > 6500 && s.shiftT === 0) pt.shift(s.gear + 1);
      const T = pt.step(DT, (car.wheels[2].omega + car.wheels[3].omega) / 2); car.set(2, { engine: T / 2 }).set(3, { engine: T / 2 }); h.step(1);
      assert.ok(Number.isFinite(s.rpm) && s.rpm < 7600, `rpm ${s.rpm}`);
    }
    return { v: car.entity.body.linvel().x, gear: pt.state.gear, sum: h.checksum(), rpm: pt.state.rpm };
  };
  const a = drive(), b = drive();
  assert.ok(a.v > 12, `speed ${a.v}`); assert.ok(a.gear >= 2); assert.deepEqual(a, b);
});
test('H-6: step allocates nothing; the file is sim-pure', async () => {
  const pt = createPowertrain({ turbo: {} }); pt.shift(2); pt.throttle = 0.7;
  const r = await allocRate(() => pt.step(DT, 40), 3000, { warm: 3000, top: 4 }); // warm: past the JIT's tiering
  assert.ok(r.perCall < 64, `bytes per step ${r.perCall}: ${r.top.join('; ')}`); // the returned torque is a boxed number
  assert.deepEqual(scanPurity([fileURLToPath(new URL('../../src/kits/vehicle/powertrain.js', import.meta.url))]), []);
});
test('H-6: options and calls are checked', () => {
  assert.throws(() => createPowertrain({ engine: 'v10' }), /^Error: powertrain: unknown engine 'v10' \(i4, flat4, i6, v8x, v8f, v12, vtwin\)$/);
  assert.throws(() => createPowertrain({ engine: { ...ENGINE_PRESETS.i4, idle: 0 } }), /powertrain: engine\.idle must be a number > 0 \(got 0\)/);
  assert.throws(() => createPowertrain({ gears: [] }), /powertrain: gears must be a non-empty list of ratios > 0/);
  assert.throws(() => createPowertrain({ wheelInertia: 0 }), /powertrain: wheelInertia must be a number > 0/);
  const pt = createPowertrain();
  assert.throws(() => pt.shift(7), /powertrain: gear must be an integer in -1\.\.6 \(got 7\)/);
  assert.throws(() => pt.step(0), /powertrain: dt must be a number > 0 \(got 0\)/);
  assert.ok(Object.isFrozen(ENGINE_PRESETS.v8x) && Object.isFrozen(ENGINE_PRESETS.v8x.angles));
  assert.deepEqual(ENGINE_PRESETS.v8x.banks, [0, 1, 0, 0, 1, 0, 1, 1]);
});
