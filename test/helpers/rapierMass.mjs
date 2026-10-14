// Rapier 0.21 as the reference for the bake's mass properties (3d). rapierMass(colliders, density) builds one dynamic body
// from sidecar-shaped colliders and returns { mass, com, tensor }; assertMassClose(sidecarMass, that) checks mass, centre and
// the full inertia tensor (principal values rotated by the frame) to 1%.
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

// a Rapier body built from sidecar-shaped colliders: { mass, com, tensor (3x3 from principal inertia and frame) }
export function rapierMass(colliders, density) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }), body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
  for (const c of colliders) {
    const d = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(...c.half) : c.shape === 'sphere' ? RAPIER.ColliderDesc.ball(c.r)
      : c.shape === 'capsule' ? RAPIER.ColliderDesc.capsule(c.halfHeight, c.r) : c.shape === 'cylinder' ? RAPIER.ColliderDesc.cylinder(c.halfHeight, c.r)
      : c.shape === 'hull' ? RAPIER.ColliderDesc.convexHull(new Float32Array(c.points)) : RAPIER.ColliderDesc.trimesh(new Float32Array(c.vertices), new Uint32Array(c.indices));
    d.setTranslation(...c.p).setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] }).setDensity(density(c.material));
    world.createCollider(d, body);
  }
  const pi = body.principalInertia(), f = body.principalInertiaLocalFrame(), com = body.localCom();
  const out = { mass: body.mass(), com: [com.x, com.y, com.z], tensor: tensor([f.x, f.y, f.z, f.w], [pi.x, pi.y, pi.z]) };
  world.free();
  return out;
}
export function tensor(q, d) {
  const [x, y, z, w] = q, R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  return [0, 1, 2].map(i => [0, 1, 2].map(j => R[i][0] * d[0] * R[j][0] + R[i][1] * d[1] * R[j][1] + R[i][2] * d[2] * R[j][2]));
}
export function assertMassClose(mine, rapier, label = '') {
  const tol = 0.01;
  assert.ok(Math.abs(mine.mass - rapier.mass) <= tol * rapier.mass, `${label} mass ${mine.mass} vs ${rapier.mass}`);
  const size = Math.cbrt(rapier.mass / 1000) || 1;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(mine.com[k] - rapier.com[k]) <= tol * size, `${label} com[${k}] ${mine.com[k]} vs ${rapier.com[k]}`);
  const T = tensor(mine.frame, mine.inertia), big = Math.max(...rapier.tensor.flat().map(Math.abs));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(T[i][j] - rapier.tensor[i][j]) <= tol * big, `${label} I[${i}][${j}] ${T[i][j]} vs ${rapier.tensor[i][j]}`);
}
