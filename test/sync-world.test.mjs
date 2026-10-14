// View sync against 3c's real World (overview §4.4): bodiless entities with a pool slot, prev from xfPrev, curr from e.xf, the
// swap in lh.world.swap, clear() changing serial. Assets are the box stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEngine, defineGame } from '../src/index.sim.js';
import { createViewSync } from '../src/view/sync/index.js';
import { fakeAssets } from './helpers/fakeAssets.mjs';

const CRATE = { v: 1, source: { file: 'test/crate.glb', sha256: '0' }, parts: ['body'], colliders: [],
  mass: { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] }, sockets: {}, bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } };
const game = defineGame({ id: 'sync-world', start: 's', scenes: { s: {} }, defs: { models: { v: 1, engine: '0.8.0', materials: '00000000', models: { crate: CRATE } } } });

test('3g: sync draws a real World: xf entities, prev from xfPrev, the step\'s swap, despawn and clear (E-6, E-10, E-11, S-3)', () => {
  const engine = createEngine(game), fa = fakeAssets(), gfx = { scene: new THREE.Scene() };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view: { dt: 0 } }), w = engine.world;
  const e = w.spawn({ model: 'crate', xf: true, at: [0, 0, 0] });
  sync.frame(1); const o = sync.objectOf(e); assert.equal(o.position.x, 0);
  e.xf.p.x = 2; sync.frame(0.5); assert.equal(o.position.x, 1); // curr moved, prev not
  engine.stepN(1); sync.frame(0.5); assert.equal(o.position.x, 2); // lh.world.swap: prev caught up
  w.despawn(e); sync.frame(1); assert.equal(o.parent, null);
  w.spawn({ model: 'crate', xf: true }); sync.frame(1); assert.equal(sync.root.children.length, 1);
  w.clear(); sync.frame(1); assert.equal(sync.root.children.length, 0);
});
test('3g: part poses on a real World: e.partXf curr, partXfPrev, swapped by lh.world.swap (3c Task 10b)', () => {
  const engine = createEngine(game), fa = fakeAssets(), gfx = { scene: new THREE.Scene() };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view: { dt: 0 } }), w = engine.world;
  const e = w.spawn({ model: 'crate', xf: true, partXf: ['body'] });
  e.partXf.body.p.x = 2; sync.frame(0.5);
  const body = sync.objectOf(e).getObjectByName('body'); assert.equal(body.position.x, 1); // prev is still the identity part pose
  engine.stepN(1); sync.frame(0.5); assert.equal(body.position.x, 2);
});
