// #1, §4.5 creation: every Rapier 0.21 integration parameter is pinned; the timestep is 1/hz; the timer feeds stats
// only (#106); an uninitialised Rapier is named (D9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PINNED_DEFAULTS, mergeParams, checkRapier, createPhysics } from '../src/sim/physics/rapier.js';
import { R } from './fixtures/phys/rapier.js';

const accessors = ip => {
  const p = Object.getPrototypeOf(ip);
  return Object.getOwnPropertyNames(p).filter(n => { const d = Object.getOwnPropertyDescriptor(p, n); return d.get && d.set; });
};

test("PINNED_DEFAULTS is Rapier 0.21.0's own defaults, field for field, and nothing else (#1)", () => {
  const w = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    const ip = w.integrationParameters, names = accessors(ip).filter(n => n !== 'dt').sort();
    assert.deepEqual(Object.keys(PINNED_DEFAULTS).sort(), names, 'a parameter Rapier added or dropped must be pinned or unpinned on purpose');
    for (const k of names) {
      if (k === 'softBodiesRecovery') assert.deepEqual({ ...ip[k] }, { ...PINNED_DEFAULTS[k] });
      else assert.equal(ip[k], PINNED_DEFAULTS[k], k);
    }
    assert.ok(Object.isFrozen(PINNED_DEFAULTS) && Object.isFrozen(PINNED_DEFAULTS.softBodiesRecovery));
  } finally { w.free(); }
});
test('createPhysics: timestep 1/hz, params written over the defaults, nested recovery merged', () => {
  const ph = createPhysics(R, { hz: 240, params: { numSolverIterations: 8, softBodiesRecovery: { recoveryPace: 0.25 } } });
  try {
    const ip = ph.world.integrationParameters;
    assert.equal(ph.world.timestep, Math.fround(1 / 240));
    assert.equal(ip.numSolverIterations, 8);
    assert.equal(ip.normalizedPredictionDistance, PINNED_DEFAULTS.normalizedPredictionDistance);
    assert.equal(ip.softBodiesRecovery.recoveryPace, 0.25);
    assert.equal(ip.softBodiesRecovery.overlapPatience, 240);
    assert.equal(typeof ph.queue.drainContactForceEvents, 'function');
  } finally { ph.free(); }
});
test('gravity is the given vector: a free body reaches -1 m/s after 1 s under [0, -1, 0]', () => {
  const ph = createPhysics(R, { hz: 60, gravity: [0, -1, 0] });
  try {
    const b = ph.world.createRigidBody(R.RigidBodyDesc.dynamic());
    ph.world.createCollider(R.ColliderDesc.ball(0.1), b);
    for (let i = 0; i < 60; i++) ph.step();
    assert.ok(Math.abs(b.linvel().y + 1) < 1e-4, `${b.linvel().y}`);
  } finally { ph.free(); }
});
test('unknown params throw, naming the field', () => {
  assert.throws(() => mergeParams({ numSolverIteration: 4 }), /physics: params\.numSolverIteration is not a Rapier 0\.21 integration parameter/);
  assert.throws(() => mergeParams({ dt: 0.1 }), /physics: params\.dt is not/);
  assert.equal(mergeParams().numSolverIterations, 4);
});
test('with a timer, stats hold the last step and a running total; without one they stay 0 (#106)', () => {
  let t = 0;
  const ph = createPhysics(R, { hz: 60, timer: () => (t += 1.5) }), plain = createPhysics(R, { hz: 60 });
  try {
    ph.step(); ph.step();
    assert.equal(ph.stats.stepMs, 1.5);
    assert.equal(ph.stats.stepMsTotal, 3);
    plain.step();
    assert.deepEqual(plain.stats, { stepMs: 0, stepMsTotal: 0 });
  } finally { ph.free(); plain.free(); }
});
test('recreate frees the old world and makes an empty one with the same settings; free is idempotent', () => {
  const ph = createPhysics(R, { hz: 120, params: { numSolverIterations: 6 } }), old = ph.world;
  old.createCollider(R.ColliderDesc.ball(1));
  ph.recreate();
  assert.notEqual(ph.world, old);
  let n = 0; ph.world.forEachCollider(() => n++);
  assert.equal(n, 0);
  assert.equal(ph.world.integrationParameters.numSolverIterations, 6);
  assert.equal(ph.world.timestep, Math.fround(1 / 120));
  ph.free(); ph.free();
  assert.equal(ph.world, null);
});
test('checkRapier names an uninitialised module and refuses a non-module (D9)', () => {
  const uninit = { World: class { constructor() { throw new TypeError("Cannot read properties of undefined (reading 'rawintegrationparameters_new')"); } } };
  assert.throws(() => checkRapier(uninit), /^Error: physics: await RAPIER\.init\(\) before createEngine$/);
  assert.throws(() => checkRapier({}), /physics: physics\.rapier must be the @dimforge\/rapier3d-compat module/);
  assert.doesNotThrow(() => checkRapier(R));
  assert.doesNotThrow(() => checkRapier(null));
});
test('a real, never-initialised Rapier fails checkRapier in a fresh process', () => {
  const mod = new URL('../src/sim/physics/rapier.js', import.meta.url).href;
  const src = `import R from '@dimforge/rapier3d-compat'; import { checkRapier } from ${JSON.stringify(mod)};
try { checkRapier(R); console.log('no error'); } catch (e) { console.log(e.message); }`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', src], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'physics: await RAPIER.init() before createEngine', r.stderr);
});
