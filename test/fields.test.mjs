// Phase 8 fields (spec §3.7 [M-14]–[M-18]) against analytic expectations: wind, flat-plate aero on baked panels, airfoil
// lift, buoyancy from the panel divergence integral, and magnet forces. Each test reads the velocity change of one step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/index.js';
import { defineGame, defineMaterials, createWind, createFields } from '../src/index.sim.js';
import { RAPIER } from './kits/fixtures/kitGame.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const MATS = defineMaterials({
  cork: { extends: 'wood', phys: { sg: 0.5 } },
  sail: { extends: 'fabric', aero: { skin: 0 } },
  wing: { extends: 'aluminium', aero: { skin: 0, airfoil: { cl: [[-10, -1], [0, 0], [10, 1]], cd: [[-10, 0.05], [0, 0.01], [10, 0.05]], stall: 15 } } },
  lode: { extends: 'steel', magnet: { strength: 1000, ferrous: 0 } },
});
const face = (axis, s) => { const n = [0, 0, 0]; n[axis] = s; return { part: 'body', a: 1, n, c: n.map(v => v * 0.5) }; };
const cube = material => ({ v: 1, parts: ['body'], colliders: [{ shape: 'box', half: [0.5, 0.5, 0.5], p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material }],
  aero: { panels: [0, 1, 2].flatMap(k => [face(k, 1), face(k, -1)]), volume: 1, centroid: [0, 0, 0] } });
// a flat 4 m x 0.1 m x 1 m wing (span z): top and bottom planform panels of 4 m^2 and four small edge panels
const wing = () => ({ v: 1, parts: ['body'], colliders: [{ shape: 'box', half: [0.5, 0.05, 2], p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material: 'wing' }],
  aero: { panels: [{ part: 'body', a: 4, n: [0, 1, 0], c: [0, 0.05, 0] }, { part: 'body', a: 4, n: [0, -1, 0], c: [0, -0.05, 0] },
    { part: 'body', a: 0.4, n: [1, 0, 0], c: [0.5, 0, 0] }, { part: 'body', a: 0.4, n: [-1, 0, 0], c: [-0.5, 0, 0] }], volume: 0.4, centroid: [0, 0, 0] } });
const MODELS = { v: 1, engine: '0.13.0', materials: MATS.hash, models: { sailcube: cube('sail'), corkcube: cube('cork'), wing: wing(), magnet: cube('lode'), slug: cube('steel') } };
const game = ({ gravity = [0, 0, 0], enter }) => defineGame({ id: 'fields', start: 's', defs: { materials: MATS, models: MODELS },
  physics: { rapier: RAPIER, gravity }, scenes: { s: { enter } } });
const run = ({ gravity, fields, bodies }) => {
  let ents, f;
  const h = headless(game({ gravity, enter: e => { ents = bodies(e.world); f = createFields(e.world, typeof fields === 'function' ? fields(e.world) : fields); } }));
  return { h, ents, fields: f };
};
const spawn = (w, model, at, { mass, v = [0, 0, 0], q } = {}) => {
  const e = w.spawn({ model, body: { type: 'dynamic', canSleep: false, linearDamping: 0, angularDamping: 0, ...(mass ? { mass } : {}) }, at, ...(q ? { q } : {}) });
  e.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true); return e;
};

test('M-15 wind: the base, zones that add inside their box, and seeded gusts bounded by amp', () => {
  const w = createWind({ base: [5, 0, 0], zones: [{ min: [0, 0, 0], max: [10, 10, 10], v: [0, 0, 3] }] });
  assert.deepEqual(w.at({ x: -5, y: 1, z: 0 }, 0), { x: 5, y: 0, z: 0 });
  assert.deepEqual(w.at({ x: 5, y: 1, z: 5 }, 0), { x: 5, y: 0, z: 3 });
  const g = createWind({ base: [4, 0, 0], gust: { amp: 2, scale: 10, period: 3 }, seed: 7 }), out = { x: 0, y: 0, z: 0 };
  const xs = Array.from({ length: 50 }, (_, i) => g.at({ x: i * 3, y: 0, z: 0 }, i * 0.4, out).x);
  assert.ok(xs.every(x => x >= 2 - 1e-9 && x <= 6 + 1e-9)); assert.ok(new Set(xs.map(x => x.toFixed(3))).size > 10, 'it varies');
  assert.equal(createWind({ base: [4, 0, 0], gust: { amp: 2 }, seed: 7 }).at({ x: 3, y: 0, z: 1 }, 2).x, createWind({ base: [4, 0, 0], gust: { amp: 2 }, seed: 7 }).at({ x: 3, y: 0, z: 1 }, 2).x);
  assert.throws(() => createWind({ base: [1, 2] }), /wind: base must be \[x, y, z\]/);
});
test('M-16 aero: a cube face-on at 10 m/s feels one plate: ½ ρ v² A × 1.1, and nothing in a wind that matches it', () => {
  const { h, ents: [c] } = run({ fields: { aero: true }, bodies: w => [spawn(w, 'sailcube', [0, 5, 0], { mass: 10, v: [10, 0, 0] })] });
  h.step(1);
  const F = 0.5 * 1.225 * 100 * 1 * 1.1, dv = F / 10 / 60;
  near(c.body.linvel().x, 10 - dv, dv * 0.01, 'one step of drag');
  const calm = run({ fields: { aero: true, wind: createWind({ base: [10, 0, 0] }) }, bodies: w => [spawn(w, 'sailcube', [0, 5, 0], { mass: 10, v: [10, 0, 0] })] });
  calm.h.step(1); near(calm.ents[0].body.linvel().x, 10, 1e-9, 'moving with the wind');
});
test('M-16 aero: a wing below stall lifts by its cl curve; past stall it is a plate', () => {
  const lift = aoa => { const a = aoa * Math.PI / 180; // flow at angle aoa from below: the wing climbs into air
    const { h, ents: [wg] } = run({ fields: { aero: true }, bodies: w => [spawn(w, 'wing', [0, 5, 0], { mass: 100, v: [-20 * Math.cos(a), -20 * Math.sin(a), 0] })] });
    h.step(1); return wg.body.linvel(); };
  const v5 = lift(5), q = 0.5 * 1.225 * 400 * 4;
  near(v5.y + 20 * Math.sin(5 * Math.PI / 180), (q * 0.5 * Math.cos(5 * Math.PI / 180) + q * 0.03 * Math.sin(5 * Math.PI / 180)) / 100 / 60, 0.002, 'cl(5) = 0.5, cd(5) = 0.03');
  const v20 = lift(20); // past stall: the bottom plate at c = sin 20 pushes along +y
  near(v20.y + 20 * Math.sin(20 * Math.PI / 180), q * 1.1 * Math.sin(20 * Math.PI / 180) ** 2 / 100 / 60 * Math.cos(0), 0.01, 'plate past stall');
});
test('M-17 buoyancy: the panel integral gives the submerged volume; a half-density cube floats half in', () => {
  const water = { material: 'water', level: 0, damping: 2 };
  const { h, ents: [c], fields: f } = run({ gravity: [0, -9.81, 0], fields: { buoyancy: { fluids: [water] } }, bodies: w => [spawn(w, 'corkcube', [0, -2, 0])] });
  near(c.body.mass(), 500, 1e-3); // Rapier keeps f32 mass
  h.step(1); // fully under: rho g V up, m g down
  near(c.body.linvel().y, (1000 * 9.81 * 1 - 500 * 9.81) / 500 / 60, 1e-3, 'one step fully submerged');
  h.step(1200);
  near(c.xf.p.y, 0, 0.02, 'centre at the surface: half the cube under');
  near(f.submerged(c), 0.5, 0.02, 'submerged fraction');
});
test('M-18 magnetism: magnet to ferrous falls off as 1/r^4 and pulls them together; r is clamped and the force capped', () => {
  const pull = r => { const { h, ents: [, s] } = run({ fields: { magnet: { radius: 5, gain: 1 } }, bodies: w => [w.spawn({ model: 'magnet', body: 'fixed', at: [0, 0, 0] }), spawn(w, 'slug', [r, 0, 0], { mass: 10 })] });
    h.step(1); return s.body.linvel().x; };
  const at1 = pull(1.5), at2 = pull(3);
  near(at1, -1000 * 0.9 / 1.5 ** 4 / 10 / 60, 1e-6, 'gain S f / r^4 toward the magnet');
  near(at1 / at2, 16, 1e-6, 'doubling r: 1/16');
  assert.equal(pull(6), 0, 'outside the radius');
  const clamp = run({ fields: { magnet: { radius: 5, gain: 1, rMin: 1.5 } }, bodies: w => [w.spawn({ model: 'magnet', body: 'fixed', at: [0, 0, 0] }), spawn(w, 'slug', [1.2, 0, 0], { mass: 10 })] });
  clamp.h.step(1); near(clamp.ents[1].body.linvel().x, at1, 1e-9, 'r clamped to rMin: as at 1.5 m');
  const capped = run({ fields: { magnet: { radius: 5, gain: 1, maxForce: 50 } }, bodies: w => [w.spawn({ model: 'magnet', body: 'fixed', at: [0, 0, 0] }), spawn(w, 'slug', [1.2, 0, 0], { mass: 10 })] });
  capped.h.step(1); near(capped.ents[1].body.linvel().x, -50 / 10 / 60, 1e-6, 'capped');
});
test('M-18 magnetism: two coaxial magnets attract with the dipole force 6 gain m1 m2 / r^4', () => {
  const { h, ents: [a, b] } = run({ fields: { magnet: { radius: 5, gain: 1, maxForce: 1e9 } }, bodies: w => [spawn(w, 'magnet', [0, 0, 0], { mass: 1e5 }), spawn(w, 'magnet', [0, 2, 0], { mass: 1e5 })] }); // heavy: a step moves them mm, not through each other
  h.step(1);
  const dv = 6 * 1000 * 1000 / 2 ** 4 / 1e5 / 60;
  near(a.body.linvel().y, dv, dv * 1e-5); near(b.body.linvel().y, -dv, dv * 1e-5);
});
test('M-14 fields run before the physics step, take their options strictly and leave with the World', () => {
  const { h } = run({ fields: { aero: true }, bodies: () => [] });
  const order = h.engine.schedule();
  assert.ok(order.pre.includes('lh.fields'), JSON.stringify(order));
  assert.throws(() => run({ fields: { aero: true, wind: 3 }, bodies: () => [] }), /fields: wind must be a createWind\(\) field/);
  assert.throws(() => run({ fields: { gravityWell: true }, bodies: () => [] }), /fields: unknown option 'gravityWell'/);
  assert.throws(() => run({ fields: { buoyancy: { fluids: [{ material: 'steel', level: 0 }] } }, bodies: () => [] }), /fields: fluid material 'steel' has no fluid block/);
});
