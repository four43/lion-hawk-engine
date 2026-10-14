// partXf: per-part poses with prev/curr, swapped by lh.world.swap (3g Integrator request 7: Rally's wheels drawn by view sync).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { INTERNAL } from '../src/sim/world/pool.js';
import { stubEngine } from './fixtures/phys/engine.js';

const step = (w, n = 1) => { for (let i = 0; i < n; i++) { w.sys.swap(); w.sys.step(); w.sys.read(); w.sys.events(); } };
const WHEELS = ['wheel-front-left', 'wheel-front-right'];

test('partXf: identity parts; writes land in curr; swap copies curr to prev; partXfPrev fills out; with("partXf") lists it', () => {
  const w = createWorld(stubEngine());
  try {
    const e = w.spawn({ tags: ['car'], xf: true, partXf: WHEELS }), out = { p: { x: 9, y: 9, z: 9 }, q: { x: 9, y: 9, z: 9, w: 9 } };
    assert.deepEqual(Object.keys(e.partXf), WHEELS);
    assert.deepEqual(e.partXf['wheel-front-left'], { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    assert.equal(w.partXfPrev(e, 'wheel-front-left', out), out);
    assert.deepEqual(out, { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const fl = e.partXf['wheel-front-left'];
    fl.p.y = -0.2; fl.q.x = 0.6; fl.q.w = 0.8;
    assert.equal(w.partXfPrev(e, 'wheel-front-left', out).p.y, 0, 'a write lands in curr only');
    step(w);
    assert.deepEqual(w.partXfPrev(e, 'wheel-front-left', out), { p: { x: 0, y: -0.2, z: 0 }, q: { x: 0.6, y: 0, z: 0, w: 0.8 } });
    assert.equal(w.partXfPrev(e, 'wheel-front-right', out).q.w, 1);
    assert.deepEqual(w.with('partXf'), [e]);
    assert.throws(() => w.partXfPrev(e, 'wheel-x', out), /^Error: world\.partXfPrev: entity 1 has no part 'wheel-x'$/);
  } finally { w.dispose(); }
});

test('partXf: add merges names and keeps values; remove drops it; despawn stops the swap and keeps the last values', () => {
  const w = createWorld(stubEngine());
  try {
    const e = w.spawn({ tags: ['cart'], xf: true }), q = w.with('partXf'), out = { p: {}, q: {} };
    w.add(e, 'partXf', ['wheel-front-left']); e.partXf['wheel-front-left'].p.x = 1;
    w.add(e, 'partXf', WHEELS);
    assert.deepEqual(Object.keys(e.partXf), WHEELS); assert.equal(e.partXf['wheel-front-left'].p.x, 1); assert.deepEqual(q, [e]);
    step(w); assert.equal(w.partXfPrev(e, 'wheel-front-left', out).p.x, 1);
    w.remove(e, 'partXf'); assert.equal(e.partXf, undefined); assert.deepEqual(q, []);
    assert.throws(() => w.partXfPrev(e, 'wheel-front-left', out), /has no part 'wheel-front-left'/);
    const f = w.spawn({ tags: ['cart'], xf: true, partXf: ['wheel-front-left'] }), last = f.partXf['wheel-front-left'];
    last.p.z = 3; step(w);
    const held = f[INTERNAL].parts[0].prev; // the despawned entity's prev storage, held by the test (partXfPrev refuses dead entities)
    assert.equal(held.p.z, 3);
    w.despawn(f);
    last.p.z = 7; step(w); // curr changes after the despawn: a swap that still visited f would copy 7 into held
    assert.equal(held.p.z, 3, 'a despawned entity keeps its prev pose across swaps');
    assert.equal(f.partXf['wheel-front-left'], last); assert.deepEqual(q, []);
  } finally { w.dispose(); }
});

test('partXf refuses a bodiless entity without xf and bad names, before an id is taken', () => {
  const w = createWorld(stubEngine());
  try {
    assert.throws(() => w.spawn({ tags: ['m'], partXf: WHEELS }), /world: 'm' partXf needs an xf \(a body or xf: true\)/);
    for (const bad of [[], 'wheel', [''], [3], ['a', 'a']]) assert.throws(() => w.spawn({ tags: ['m'], xf: true, partXf: bad }), /world: 'm' partXf must be an array of distinct part names/);
    const m = w.spawn({ tags: ['m'] });
    assert.equal(m.id, 1);
    assert.throws(() => w.add(m, 'partXf', WHEELS), /world\.add: 'partXf' needs an xf/);
    assert.throws(() => w.add(w.spawn({ tags: ['n'], xf: true }), 'partXf', ['a', 'a']), /world\.add: 'partXf' must be an array of distinct part names/);
  } finally { w.dispose(); }
});
