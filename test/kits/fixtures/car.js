// A 1200 kg box car on four ray-cast wheels, plus a hand-written sidecar with wheel sockets (D2 shape).
import { createVehicle } from '../../../src/kits/vehicle/sim.js';

export const SUSPENSION = { rest: 0.3, stiffness: 30, compression: 2.5, relaxation: 3, travel: 0.3, maxForce: 1e5 };

// front pair, then rear pair; the first of each pair is at +z for forward x (the car's right: right = forward × up)
// and at +x for forward z (the car's left)
export function carWheels(forward = 'x') {
  const pts = forward === 'x' ? [[0.9, 0.75], [0.9, -0.75], [-0.9, 0.75], [-0.9, -0.75]] : [[0.75, 0.9], [-0.75, 0.9], [0.75, -0.9], [-0.75, -0.9]];
  return pts.map(([a, b], i) => ({ at: forward === 'x' ? [a, -0.1, b] : [a, -0.1, b], radius: 0.35, front: i < 2, suspension: SUSPENSION }));
}

export function spawnCar(world, { at = [0, 1, 0], forward = 'x', filter = ['ground', 'static', 'prop'], ...opts } = {}) {
  const e = world.spawn({ tags: ['car'], body: { type: 'dynamic', canSleep: false, mass: 1200 },
    colliders: [{ shape: 'box', half: forward === 'x' ? [1.2, 0.3, 0.7] : [0.7, 0.3, 1.2], material: 'steel' }],
    groups: { member: ['vehicle'], filter }, at });
  return createVehicle(world, e, { wheels: carWheels(forward), forward, ...opts });
}

const sock = p => ({ p, q: [0, 0, 0, 1], part: 'body' });
export const CART = {
  v: 1, source: { file: 'test/kits/fixtures/cart.glb', sha256: '0'.repeat(64) }, parts: ['body'],
  colliders: [{ shape: 'box', half: [1.2, 0.3, 0.7], p: [0, 0, 0], q: [0, 0, 0, 1], part: 'body', material: 'steel' }],
  mass: { mass: 15825.6, com: [0, 0, 0], inertia: [3059.6, 10181.1, 8071.1], frame: [0, 0, 0, 1] },
  // forward x: left is -z, right is +z
  sockets: { 'wheel-fl': sock([0.9, -0.1, -0.75]), 'wheel-fr': sock([0.9, -0.1, 0.75]), 'wheel-rl': sock([-0.9, -0.1, -0.75]), 'wheel-rr': sock([-0.9, -0.1, 0.75]) },
  bounds: { min: [-1.2, -0.3, -0.7], max: [1.2, 0.3, 0.7] },
};
export const physFor = registry => ({ v: 1, engine: '0.8.0', materials: registry.hash, models: { cart: CART } });
