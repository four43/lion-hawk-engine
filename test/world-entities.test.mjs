// E-1…E-9 without Rapier objects: ids, live queries, despawn, add/remove, clear, dispose, hooks, serial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world/world.js';
import { stubEngine } from './fixtures/phys/engine.js';

const make = (o = {}) => createWorld(stubEngine(o));

test('ids count from 1 in spawn order; tags are a Set; game fields copied, World keys consumed (E-1, E-4, D7)', () => {
  const w = make({ physics: false });
  const a = w.spawn({ tags: ['pig'], pig: { mood: 1 }, net: 'animal', netId: 12, xf: true, at: [1, 2, 3] });
  const b = w.spawn({ tags: ['pig', 'piglet'] });
  assert.deepEqual([a.id, b.id], [1, 2]);
  assert.ok(a.tags instanceof Set && a.tags.has('pig'));
  assert.deepEqual(a.pig, { mood: 1 }); assert.equal(a.net, 'animal'); assert.equal(a.netId, 12);
  assert.equal('at' in a, false);
  assert.deepEqual({ ...a.xf.p }, { x: 1, y: 2, z: 3 });
  assert.equal(b.xf, undefined, 'no pool slot unless xf: true or a body');
  assert.equal(w.get(2), b); assert.equal(w.get(99), undefined);
  assert.deepEqual(Object.getOwnPropertySymbols(a).length, 1);
  assert.equal(JSON.stringify(Object.keys(a)), JSON.stringify(['id', 'tags', 'pig', 'net', 'netId', 'xf']), 'World internals are not enumerable');
  assert.throws(() => w.spawn({ tags: ['x'], id: 5 }), /world: 'x' may not set 'id' \(the World does\)/);
  assert.throws(() => w.spawn({ tags: 'pig' }), /world: 'entity' tags must be an array/);
  assert.equal(w.spawn({}).id, 3, 'a throwing spawn does not use up an id');
});
test('with() is live, cached and in id order; no parts means every entity (E-3)', () => {
  const w = make({ physics: false });
  const q = w.with('pig'), q2 = w.with('pig', 'net');
  const a = w.spawn({ pig: {} }), b = w.spawn({ pig: {}, net: 'animal' }), c = w.spawn({ cow: {} });
  assert.equal(w.with('pig'), q, 'same array every call');
  assert.deepEqual(q.map(e => e.id), [1, 2]);
  assert.deepEqual(q2.map(e => e.id), [2]);
  assert.deepEqual(w.with('pig', 'net').map(e => e.id), [2]);
  assert.deepEqual(w.with().map(e => e.id), [1, 2, 3]);
  w.add(c, 'pig', {}); // an older entity joins in id order, not at the end
  const d = w.spawn({ pig: {} });
  w.remove(a, 'pig');
  assert.deepEqual(q.map(e => e.id), [2, 3, 4]);
  w.add(a, 'pig', { back: true });
  assert.deepEqual(q.map(e => e.id), [1, 2, 3, 4]);
  w.despawn(b);
  assert.deepEqual(q.map(e => e.id), [1, 3, 4]); assert.deepEqual(q2, []);
  assert.throws(() => w.with('a', 'b', 'c', 'd', 'e'), /world\.with: at most 4 parts/);
  assert.equal(d.id, 4);
});
test('despawn keeps a frozen last pose; the next spawn reuses the lowest slot; despawn is idempotent (E-7)', () => {
  const w = make({ physics: false });
  const a = w.spawn({ tags: ['a'], xf: true, at: [5, 0, 0] }), b = w.spawn({ tags: ['b'], xf: true });
  const slot = a.xf.slot;
  w.despawn(a); w.despawn(a);
  assert.equal(w.get(1), undefined); assert.equal(w.stats.entities, 1);
  const c = w.spawn({ tags: ['c'], xf: true, at: [9, 9, 9] });
  assert.equal(c.xf.slot, slot, 'lowest free slot');
  assert.deepEqual({ ...a.xf.p }, { x: 5, y: 0, z: 0 }, 'the despawned pose did not follow the reused slot');
  assert.equal(a.xf.slot, undefined);
  assert.ok(Object.isFrozen(a.xf.p));
  assert.equal(a.tags.has('a'), true);
  assert.throws(() => w.place(a, { at: [0, 0, 0] }), /world\.place: not a live entity of this World/);
  assert.equal(b.id, 2);
});
test('add/remove: World parts are fixed; xf can be given to and taken from a bodiless entity', () => {
  const w = make({ physics: false }), e = w.spawn({ tags: ['m'] });
  for (const p of ['id', 'tags', 'model', 'body', 'colliders', 'sockets']) assert.throws(() => w.add(e, p, 1), new RegExp(`world\\.add: '${p}' cannot be added after spawn`));
  assert.throws(() => w.remove(e, 'body'), /world\.remove: 'body' cannot be removed \(despawn the entity\)/);
  assert.throws(() => w.add(e, 'pig', undefined), /world\.add: 'pig' needs a value/);
  const xq = w.with('xf');
  w.add(e, 'xf', true);
  assert.equal(xq[0], e); assert.equal(typeof e.xf.slot, 'number');
  e.xf.p.x = 2;
  w.remove(e, 'xf');
  assert.equal(e.xf, undefined); assert.deepEqual(xq, []);
  w.remove(e, 'pig'); // absent: no-op
});
test('clear(): hooks and owned frees in reverse spawn order, ids restart, queries stay the same arrays, serial moves', () => {
  const w = make({ physics: false }), log = [], q = w.with('pig'), s0 = w.serial;
  w.onDespawn(e => log.push(`d${e.id}`));
  const a = w.spawn({ pig: {}, xf: true }); w.spawn({ pig: {} });
  w.own(a, () => log.push('own1'));
  w.own(() => log.push('world-own'));
  w.clear();
  assert.deepEqual(log, ['d2', 'd1', 'own1', 'world-own']);
  w.clear();
  assert.equal(log.length, 4, 'a world-scoped own runs once');
  assert.equal(q.length, 0); assert.equal(w.with('pig'), q);
  assert.ok(w.serial > s0);
  assert.equal(w.spawn({ pig: {} }).id, 1);
  assert.deepEqual(q.map(e => e.id), [1]);
});
test('dispose(): idempotent, changes serial, then refuses spawn; serials are unique across Worlds', () => {
  const w = make({ physics: false }), other = make({ physics: false }), s = w.serial, log = [];
  assert.notEqual(other.serial, s);
  w.own(w.spawn({}), () => log.push('own')); w.own(() => log.push('world-own'));
  w.dispose(); w.dispose();
  assert.deepEqual(log, ['own', 'world-own'], 'owned frees run on dispose, once');
  assert.equal(w.disposed, true); assert.ok(w.serial > other.serial);
  assert.throws(() => w.spawn({}), /world: disposed/);
  assert.throws(() => w.clear(), /world: disposed/);
  assert.throws(() => w.own(() => {}), /world: disposed/);
});
test('onSpawn/onDespawn see each entity once; off stops them', () => {
  const w = make({ physics: false }), log = [];
  const off = w.onSpawn(e => log.push(`s${e.id}`)); w.onDespawn(e => log.push(`d${e.id}`));
  const a = w.spawn({}); off(); w.spawn({}); w.despawn(a);
  assert.deepEqual(log, ['s1', 'd1']);
});
test('the 3i net seam: world.net.guard sees net spawns, despawns and net part changes, never clear() or dispose()', () => {
  const w = make({ physics: false }), log = [], sawDesc = [];
  assert.equal(w.net, null);
  w.spawn({ tags: ['plain'] }); // no net part: no guard call even with a slot
  w.net = { guard: (op, x, v) => { log.push([op, x.net ?? x.id, v]); if (op === 'spawn') sawDesc.push(!('id' in x)); if (x.netId === 13) throw new Error('net: guest may not spawn host kind'); } };
  const a = w.spawn({ net: 'animal', netId: 12 });
  assert.throws(() => w.spawn({ net: 'animal', netId: 13 }), /guest may not spawn/);
  assert.equal(w.stats.entities, 2, 'a refused spawn leaves nothing');
  const b = w.spawn({ tags: ['b'] });
  w.add(b, 'net', 'prop'); w.remove(b, 'net'); w.despawn(a); w.despawn(b);
  w.spawn({ net: 'animal', netId: 14 });
  const want = [['spawn', 'animal', undefined], ['spawn', 'animal', undefined], ['add', b.id, 'prop'], ['remove', 'prop', undefined], ['despawn', 'animal', undefined], ['spawn', 'animal', undefined]];
  assert.deepEqual(log, want, 'b has no net part when it despawns: no guard call');
  assert.deepEqual(sawDesc, [true, true, true], 'spawn is guarded with the desc, not an entity (3i-R2)');
  w.clear();
  assert.deepEqual(log, want, 'clear() never calls the guard');
  w.spawn({ net: 'animal', netId: 15 });
  const n = log.length;
  w.dispose();
  assert.equal(log.length, n, 'dispose() never calls the guard');
});
test('without physics.rapier the World holds bodiless entities only (§4.1)', () => {
  const engine = stubEngine({ physics: false }), w = createWorld(engine);
  assert.equal(w.engine, engine, 'kits reach the engine through the World (3h)');
  assert.equal(w.rapier, null); assert.equal(w.R, null);
  assert.throws(() => w.spawn({ tags: ['pig'], body: 'dynamic' }), /world: 'pig' needs a body but the game has no physics\.rapier/);
  assert.throws(() => w.spawn({ model: 'crate' }), /world: 'crate' needs a body but the game has no physics\.rapier/);
});
