import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../../testing/index.js';
import { kitGame } from './fixtures/kitGame.js';
import { coverageKit, coverageLayer, COVERAGE_SYSTEM } from '../../src/kits/coverage/sim.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const LAYER = id => (id === 'bog' ? 'mud' : 'dirt');
function rig(opts = {}) {
  const h = headless(kitGame());
  coverageKit(h.engine, { materialAt: x => (x < 10 ? 'route' : 'bog'), layer: LAYER, ...opts });
  const mover = fields => { const e = h.world.spawn({ xf: true, at: [0, 0, 0], v: 0.25, ...fields }); h.scene.state.movers.push(e); return e; };
  return { h, mover };
}

test('an entity gains dirtRate × metres on its ground layer, clamped at 1 (spec §3.2)', () => {
  const { h, mover } = rig(), e = mover({ coverage: { dirt: 0, mud: 0 } });
  h.step(20);                                   // 20 × 0.25 m on route (dirtRate 0.01)
  near(e.xf.p.x, 5, 1e-12); near(e.coverage.dirt, 0.05, 1e-12); assert.equal(e.coverage.mud, 0);
  h.step(40);                                   // 19 more on route, then 21 on bog (dirtRate 0.2 → mud)
  near(e.coverage.dirt, 0.0975, 1e-12); assert.equal(e.coverage.mud, 1);
});

test('washes clean every layer at 1 / washTime per second and never below 0', () => {
  const { h, mover } = rig({ washes: [x => x >= 20] }), e = mover({ coverage: { dirt: 0.2, mud: 1 }, v: 0 });
  h.world.place(e, { at: [25, 0, 0] });
  h.step(45);
  near(e.coverage.mud, 0.5, 1e-9); assert.equal(e.coverage.dirt, 0);
  h.step(60);
  assert.equal(e.coverage.mud, 0);
});

test('a wash soaks wet at 1 / washTime per second; outside one it dries at 1 / dryTime; entities without wet stay without', () => {
  const { h, mover } = rig({ washes: [x => x >= 20], dryTime: 2 }), e = mover({ coverage: { mud: 1, wet: 0 }, v: 0 }), dry = mover({ coverage: { mud: 1 }, v: 0 });
  h.world.place(e, { at: [25, 0, 0] }); h.world.place(dry, { at: [25, 0, 0] });
  h.step(45);                                   // 0.75 s of the 1.5 s wash
  near(e.coverage.wet, 0.5, 1e-9); assert.equal('wet' in dry.coverage, false);
  h.step(60);
  assert.equal(e.coverage.wet, 1);
  h.world.place(e, { at: [0, 0, 0] });
  h.step(60);                                   // 1 s of the 2 s dry
  near(e.coverage.wet, 0.5, 1e-9);
  h.step(90);
  assert.equal(e.coverage.wet, 0);
});

test('a wash entry { at, washTime } overrides the kit-wide washTime; the first wash that holds decides (3l request 5)', () => {
  const { h, mover } = rig({ washTime: 1.5, washes: [{ at: x => x >= 20 && x < 30, washTime: 0.5 }, x => x >= 20] });
  const fast = mover({ coverage: { mud: 1 }, v: 0 }), slow = mover({ coverage: { mud: 1 }, v: 0 });
  h.world.place(fast, { at: [25, 0, 0] }); h.world.place(slow, { at: [35, 0, 0] });
  h.step(15);                                   // 0.25 s: 0.5 off in the 0.5 s wash, 1/6 off in the kit-wide 1.5 s one
  near(fast.coverage.mud, 0.5, 1e-9); near(slow.coverage.mud, 1 - 1 / 6, 1e-9);
});

test("the entity's own material scales what it accepts (no coverage block = everything)", () => {
  const { h, mover } = rig();
  const coated = mover({ coverage: { dirt: 0, mud: 0 }, coverageMaterial: 'coat' }), plain = mover({ coverage: { dirt: 0, mud: 0 } });
  h.step(60);
  assert.ok(plain.coverage.dirt > 0 && plain.coverage.mud > 0);
  near(coated.coverage.dirt, plain.coverage.dirt / 2, 1e-12);
  assert.equal(coated.coverage.mud, 0); // coat's coverage block has no mud
});

test('place() moves without accruing; standing still accrues nothing; layers the entity lacks stay absent', () => {
  const { h, mover } = rig(), e = mover({ coverage: { dirt: 0 } }), still = mover({ coverage: { dirt: 0 }, v: 0 });
  h.step(4); near(e.coverage.dirt, 0.01, 1e-12);
  h.world.place(e, { at: [8, 0, 0] }); h.step(1);
  near(e.coverage.dirt, 0.0125, 1e-12);         // the 0.25 m step, not the 7 m jump
  assert.equal(still.coverage.dirt, 0);
  h.step(20);                                   // into the bog: these entities carry no mud layer
  assert.equal('mud' in e.coverage, false);
});

test('coverageKit runs in post on the engine, or for one scene on its ctx', () => {
  const h = headless(kitGame({ enter: (e, ctx) => { coverageKit(ctx, { materialAt: () => 'route' }); } }));
  const has = () => h.engine.schedule().post.includes(COVERAGE_SYSTEM);
  assert.equal(has(), true);
  h.go('other'); assert.equal(has(), false);
  const k = coverageKit(h.engine, { materialAt: () => 'route' });
  assert.equal(has(), true); k.off(); assert.equal(has(), false);
});

test('coverageKit validates its options; the default layer maps mud and snow by id', () => {
  const h = headless(kitGame()), ok = { materialAt: () => 'route' };
  assert.throws(() => coverageKit({}, ok), /coverage: coverageKit needs the engine or a scene ctx/);
  assert.throws(() => coverageKit(h.engine, {}), /coverage: coverageKit needs materialAt/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washes: [1] }), /coverage: washes\[0\] must be \(x, z\) => boolean or \{ at, washTime \}/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washes: [{ at: () => true, washTime: -1 }] }), /coverage: washes\[0\]\.washTime must be > 0 \(got -1\)/);
  assert.throws(() => coverageKit(h.engine, { ...ok, washTime: 0 }), /coverage: washTime must be > 0 \(got 0\)/);
  assert.throws(() => coverageKit(h.engine, { ...ok, layer: 'dirt' }), /coverage: layer must be a function/);
  assert.deepEqual(['mud', 'snow', 'gravel', 'bog'].map(coverageLayer), ['mud', 'snow', 'dirt', 'dirt']);
});
