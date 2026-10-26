import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createParticles } from '../../src/kits/fx/view.js';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const pose = (fx, i) => { fx.mesh.getMatrixAt(i, M); M.decompose(P, Q, S); return { p: P, s: S }; };

test('emit then update integrates gravity, drag and position into the instance matrix', () => {
  const fx = createParticles({ max: 8, gravity: 10, drag: 0.5 });
  assert.equal(fx.emit(1, 2, 3, 4, 5, 6, 2, 0.5, '#ff0000'), 0);
  assert.equal(fx.mesh.count, 1); assert.equal(fx.live, 1);
  fx.update(0.1);                                   // vy 4; drag k 0.95: vx 3.8, vz 5.7
  const { p, s } = pose(fx, 0);
  near(p.x, 1.38, 1e-6); near(p.y, 2.4, 1e-6); near(p.z, 3.57, 1e-6); near(s.x, 0.5, 1e-6);
  const c = new THREE.Color(); fx.mesh.getColorAt(0, c); assert.deepEqual([c.r, c.g, c.b], [1, 0, 0]);
});

test('the pool is a ring: the oldest slot is reused once max is reached', () => {
  const fx = createParticles({ max: 3 });
  for (let k = 0; k < 4; k++) assert.equal(fx.emit(k, 0, 0, 0, 0, 0, 1, 1, null), k % 3);
  assert.equal(fx.mesh.count, 3); assert.equal(fx.live, 3);
});

test('particles shrink over the last half of life, collapse when expired, and an empty pool draws nothing', () => {
  const fx = createParticles({ max: 4, gravity: 0 });
  fx.emit(0, 0, 0, 0, 0, 0, 0.25, 1, null); fx.emit(0, 0, 0, 0, 0, 0, 1, 1, null);
  fx.update(0.125); near(pose(fx, 0).s.x, 1, 1e-6);
  fx.update(0.0625); near(pose(fx, 0).s.x, 0.5, 1e-6);    // 0.0625 of 0.25 left
  fx.update(0.1);
  fx.mesh.getMatrixAt(0, M); assert.deepEqual([M.elements[0], M.elements[5], M.elements[10]], [0, 0, 0]);
  assert.equal(fx.live, 1); assert.equal(fx.mesh.count, 2);
  fx.update(1);
  assert.equal(fx.live, 0); assert.equal(fx.mesh.count, 0);
});

test('floor and bounce: a gib bounces off the ground, then lands and stays on it', () => {
  const fx = createParticles({ max: 2, floor: () => 1, bounce: 0.35, friction: 0.65, drag: 0 });
  fx.emit(0, 3, 0, 2, 0, 0, 10, 0.2, null);
  let up = false, prev = 3;
  for (let k = 0; k < 200; k++) {
    fx.update(1 / 60);
    const y = pose(fx, 0).p.y;
    assert.ok(y >= Math.fround(1.1) - 1e-6, `below the floor at ${k}: ${y}`);
    if (y > prev + 1e-9) up = true;
    prev = y;
  }
  assert.ok(up, 'never bounced'); near(prev, 1.1, 1e-6);
});

test("'quad' particles lie flat once landed", () => {
  const fx = createParticles({ max: 1, shape: 'quad', floor: () => 0 });
  fx.emit(0, 0.5, 0, 0, 0, 0, 30, 0.1, null);
  for (let k = 0; k < 60; k++) fx.update(1 / 60);
  fx.mesh.getMatrixAt(0, M);
  near(new THREE.Vector3(0, 0, 1).transformDirection(M).y, 1, 1e-6);
});

test('a null colour keeps the shared colour; uploads cover only the rows written', () => {
  const fx = createParticles({ max: 10 });
  fx.color.setRGB(0, 1, 0);
  for (let k = 0; k < 3; k++) fx.emit(0, 0, 0, 0, 0, 0, 1, 1, null);
  fx.update(0.01);
  const c = new THREE.Color(); fx.mesh.getColorAt(2, c); assert.deepEqual([c.r, c.g, c.b], [0, 1, 0]);
  assert.deepEqual(fx.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  assert.deepEqual(fx.mesh.instanceColor.updateRanges, [{ start: 0, count: 9 }]);
});

test('emit overrides gravity and drag per particle (dust: g < 0 floats up) (CI-14)', () => {
  const fx = createParticles({ max: 2, gravity: 10, drag: 0 });
  fx.emit(0, 0, 0, 1, 0, 0, 5, 1, null, -2, 1); fx.emit(0, 0, 0, 1, 0, 0, 5, 1, null);
  fx.update(0.5);                                   // 0: vy +1, vx × 0.5; 1: the pool's g 10 and drag 0
  near(pose(fx, 0).p.y, 0.5, 1e-6); near(pose(fx, 0).p.x, 0.25, 1e-6);
  near(pose(fx, 1).p.y, -2.5, 1e-6); near(pose(fx, 1).p.x, 0.5, 1e-6);
});

test('createParticles refuses a bad shape or size', () => {
  assert.throws(() => createParticles({ shape: 'cone' }), /fx: shape must be 'cube' or 'quad' \(got cone\)/);
  assert.throws(() => createParticles({ max: 0 }), /fx: max must be a positive integer \(got 0\)/);
});
test('dispose takes the particle mesh out of its parent and frees the geometry and material it made (not ones passed in)', () => {
  const own = createParticles({ max: 4 }), scene = new THREE.Scene(); scene.add(own.mesh);
  const freed = []; for (const r of [own.mesh.geometry, own.mesh.material, own.mesh]) r.addEventListener('dispose', () => freed.push(r.type ?? r.constructor.name));
  own.dispose(); assert.equal(own.mesh.parent, null); assert.equal(freed.length, 3);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial(), given = createParticles({ max: 4, geometry, material }); let kept = 0;
  geometry.addEventListener('dispose', () => kept++); material.addEventListener('dispose', () => kept++);
  given.dispose(); assert.equal(kept, 0, 'a passed-in geometry and material are the caller\'s');
});
