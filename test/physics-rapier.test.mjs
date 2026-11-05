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
test('R-8: a step of 30 dynamic bodies allocates under 2 KB in JS (Rapier 0.21 World.step re-maps every handle after each step; the engine steps the pipeline)', async () => {
  const { allocRate } = await import('./helpers/alloc.mjs');
  const ph = createPhysics(R, { hz: 60 });
  try {
    const w = ph.world; w.createCollider(R.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0));
    for (let i = 0; i < 30; i++) { const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((i % 6) * 1.5, 1 + i * 0.6, Math.floor(i / 6) * 1.5)); w.createCollider(R.ColliderDesc.cuboid(0.4, 0.4, 0.4), b); }
    // Rapier times its own stages with performance.now() from WASM (__wbg_now_*); Node boxes each result, more so while
    // that path is unoptimised on a loaded machine (CI). Not the engine's to remove, so the probe leaves it out.
    const r = await allocRate(() => ph.step(), 600, { top: 5, skip: /__wbg_now_/ });
    assert.ok(r.perCall < 2048, `${Math.round(r.perCall)} bytes per step:\n${r.top.join('\n')}`);
  } finally { ph.free(); }
});
test('ph.step (the pipeline, without the per-step re-map) gives bit-identical bodies and events to World.step, with bodies added and removed mid-run', () => {
  const build = w => { w.createCollider(R.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0)); return Array.from({ length: 12 }, (_, i) => { const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((i % 4) * 1.1, 1 + i * 0.7, Math.floor(i / 4) * 1.1)); w.createCollider(R.ColliderDesc.cuboid(0.4, 0.4, 0.4).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), b); return b; }); };
  const a = createPhysics(R, { hz: 60 }), b = createPhysics(R, { hz: 60 }), ba = build(a.world), bb = build(b.world), ea = [], eb = [];
  try {
    for (let s = 0; s < 400; s++) {
      if (s === 100) { a.world.removeRigidBody(ba[3]); b.world.removeRigidBody(bb[3]); ba.splice(3, 1); bb.splice(3, 1); } // its slot is reused below
      if (s === 150) for (const [ph, list] of [[a, ba], [b, bb]]) { const n = ph.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 6, 0)); ph.world.createCollider(R.ColliderDesc.ball(0.3).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), n); list.push(n); }
      a.step(); b.world.step(b.queue);
      a.queue.drainCollisionEvents((h1, h2, on) => ea.push([h1, h2, on])); b.queue.drainCollisionEvents((h1, h2, on) => eb.push([h1, h2, on]));
    }
    const pose = (w, list) => list.map(x => { const t = x.translation(), r = x.rotation(); return [t.x, t.y, t.z, r.x, r.y, r.z, r.w]; });
    assert.deepEqual(pose(a.world, ba), pose(b.world, bb)); assert.deepEqual(ea, eb); assert.ok(ea.length > 0, 'there were contacts');
  } finally { a.free(); b.free(); }
});
