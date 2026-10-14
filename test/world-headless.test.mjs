// T-1, T-5: headless reaches the World, and a finite check over every pool slot and body velocity runs after each
// step whenever the World has entities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/headless.js';
import { worldFinite } from '../testing/invariants.js';
import { physGame } from './fixtures/phys/game.js';
import countdown from './fixtures/countdown.js';

const farm = (e, ctx) => {
  const w = ctx.world;
  w.spawn({ tags: ['pig'], xf: true, pen: 1 }); w.spawn({ tags: ['pig'], xf: true, pen: 2 }); w.spawn({ net: 'animal', netId: 5, xf: true });
};

test('h.world, find by tag or net kind, where as a predicate or a partial object (T-5)', () => {
  const h = headless(physGame({ build: farm }));
  assert.equal(h.world, h.engine.world);
  assert.equal(h.find('pig').length, 2);
  assert.equal(h.find('pig', { pen: 2 })[0].pen, 2);
  assert.equal(h.find('pig', e => e.pen === 1).length, 1);
  assert.equal(h.find().length, 3);
  assert.equal(h.one('animal').netId, 5);
  assert.throws(() => h.one('pig'), /headless: one\("pig"\) found 2 entities \(seed 1, step 0\)/);
  assert.throws(() => h.one('cow'), /found 0 entities/);
  assert.equal(h.get(3).net, 'animal');
});
test('h.spawn, h.place and h.despawn act on the current World', () => {
  const h = headless(physGame());
  const e = h.spawn({ tags: ['box'], model: 'crate', body: 'dynamic' });
  assert.equal(h.place(e, { at: [1, 2, 3] }), h);
  assert.equal(e.body.translation().x, 1);
  h.step(1);
  assert.equal(h.despawn(e), h);
  assert.deepEqual(h.find('box'), []);
});
test('finite is always on: a NaN pose fails the next step with entity, field, seed and step (T-1)', () => {
  const h = headless(physGame({ build: (e, ctx) => ctx.world.spawn({ tags: ['bird'], xf: true }) }), { seed: 9 });
  h.step(2);
  h.one('bird').xf.p.y = NaN;
  assert.throws(() => h.step(1), /^Error: finite: entity 1 \(bird\) xf\.p\.y is NaN \(seed 9, step 3\)$/);
});
test('worldFinite checks body velocities too', () => {
  const pool = new Float64Array(14); pool[6] = 1; pool[13] = 1;
  const body = { linvel: () => ({ x: 0, y: Infinity, z: 0 }), angvel: () => ({ x: 0, y: 0, z: 0 }) };
  const world = { xf: { pool, stride: 14 }, with: () => [{ id: 4, tags: new Set(['car', 'red']), xf: { slot: 0 }, body }] };
  assert.throws(() => worldFinite(world, { seed: 2, time: { step: 7 } }), /finite: entity 4 \(car,red\) linvel\.y is Infinity \(seed 2, step 7\)/);
});
test('games without World entities run exactly as before', () => {
  const h = headless(countdown, { scene: 'race' });
  h.step(10);
  assert.equal(h.world.stats.entities, 0);
  assert.equal('world' in h.state(), false);
});
