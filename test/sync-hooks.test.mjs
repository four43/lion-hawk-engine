import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSetup } from './helpers/syncSetup.mjs';

const MODELS = { crate: [{ name: 'body', material: 'wood' }], barrel: [{ name: 'body', material: 'wood' }] };

test('3g: on("#tag" | "model:" | "net:" | fn): create once, frame after the pose, remove on despawn, in registration order (§4.9)', () => {
  const s = syncSetup(MODELS), log = [];
  const hook = name => ({
    create: (e, obj, v) => log.push([name, 'create', e.id, obj?.name ?? null, v === s.view]),
    frame: (e, obj, a, v) => log.push([name, 'frame', e.id, a, obj.position.x, v === s.view]),
    remove: (e, obj) => log.push([name, 'remove', e.id, obj.parent === s.sync.root]),
  });
  s.sync.on('#pig', hook('tag')); s.sync.on('model:crate', hook('model')); s.sync.on('net:train', hook('net')); s.sync.on(e => e.id === 2, hook('fn'));
  const a = s.world.spawn({ model: 'crate', tags: ['pig'] }); s.world.spawn({ model: 'barrel', net: 'train' });
  s.world.move(a, [3, 0, 0]); s.sync.frame(1);
  assert.deepEqual(log.splice(0), [
    ['tag', 'create', 1, 'crate', true], ['model', 'create', 1, 'crate', true], ['tag', 'frame', 1, 1, 3, true], ['model', 'frame', 1, 1, 3, true],
    ['net', 'create', 2, 'barrel', true], ['fn', 'create', 2, 'barrel', true], ['net', 'frame', 2, 1, 0, true], ['fn', 'frame', 2, 1, 0, true],
  ]);
  s.world.despawn(a); s.sync.frame(0.5);
  assert.deepEqual(log.splice(0), [['net', 'frame', 2, 0.5, 0, true], ['fn', 'frame', 2, 0.5, 0, true], ['tag', 'remove', 1, true], ['model', 'remove', 1, true]]);
  s.world.clear(); s.sync.frame(1);
  assert.deepEqual(log.splice(0), [['net', 'remove', 2, true], ['fn', 'remove', 2, true]]); // a new World removes through the hooks too
});
test('3g: an undrawn entity\'s create may return an Object3D: sync poses it and takes it out on removal (§4.9)', () => {
  const s = syncSetup(); let made = null, gone = null;
  s.sync.on('#marker', { create: () => (made = new THREE.Object3D()), remove: (e, obj) => { gone = obj; } });
  const e = s.world.spawn({ tags: ['marker'] }); s.world.move(e, [4, 0, 0]); s.sync.frame(0.5);
  assert.equal(s.sync.objectOf(e), made); assert.equal(made.parent, s.sync.root); assert.equal(made.position.x, 2);
  s.world.despawn(e); s.sync.frame(1); assert.equal(made.parent, null); assert.equal(gone, made);
});
test('3g: a hook added later meets existing entities on the next frame; off() stops it; a bad match throws (§4.9)', () => {
  const s = syncSetup(), log = []; s.world.spawn({ model: 'crate', tags: ['pig'] }); s.sync.frame(1);
  const off = s.sync.on('#pig', { create: x => log.push(['create', x.id]), frame: x => log.push(['frame', x.id]) });
  s.sync.frame(1); assert.deepEqual(log.splice(0), [['create', 1], ['frame', 1]]);
  s.sync.frame(1); assert.deepEqual(log.splice(0), [['frame', 1]]); // create only once
  off(); s.sync.frame(1); assert.deepEqual(log, []);
  for (const bad of ['pig', '#', 'model:', 'net:', 3, null]) assert.throws(() => s.sync.on(bad, {}), /sync: bad match/);
});
