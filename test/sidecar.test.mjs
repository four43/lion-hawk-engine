import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSidecar, validatePhys, materialRefs } from '../src/defs/sidecar.js';
import { defineMaterials } from '../src/defs/materials.js';

const I = [0, 0, 0, 1], O = [0, 0, 0];
const CUBE = [-1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
const good = () => ({
  v: 1,
  source: { file: 'assets/models/cart.glb', sha256: 'a'.repeat(64) },
  parts: ['body', 'wheel'],
  colliders: [
    { shape: 'box', half: [1, 0.5, 2], p: [0, 0.5, 0], q: I, part: 'body', material: 'steel' },
    { shape: 'sphere', r: 0.3, p: [1, 0, 1], q: I, part: 'wheel', material: 'rubber' },
    { shape: 'capsule', halfHeight: 0.4, r: 0.2, p: O, q: [0, 0.7071068, 0, 0.7071068], part: 'body', material: 'steel' },
    { shape: 'cylinder', halfHeight: 0.1, r: 0.3, p: O, q: I, part: 'wheel', material: 'rubber' },
    { shape: 'hull', points: CUBE, p: O, q: I, part: 'body', material: 'wood' },
    { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2], p: O, q: I, part: 'body', material: 'wood' },
  ],
  mass: { mass: 120, com: [0, 0.4, 0], inertia: [10, 12, 8], frame: I },
  sockets: { hat: { p: [0, 1.2, 0], q: I, part: 'body' } },
  bounds: { min: [-1, 0, -2], max: [1, 1, 2] },
});
const throwsExactly = (fn, message) => assert.throws(fn, e => (message instanceof RegExp ? message.test(e.message) : e.message === message) || assert.fail(`got "${e.message}", want "${message}"`));

test('3b: a complete sidecar with every shape validates and is returned unchanged (overview §4.3)', () => {
  const s = good();
  assert.equal(validateSidecar(s, { model: 'cart', materials: defineMaterials() }), s);
  const min = { v: 1, parts: [], colliders: [] };
  assert.equal(validateSidecar(min), min, 'source, mass, sockets and bounds are optional (hand-written fixtures)');
});
test('3b: a socket may have no parent part (3d C3); a zero-mass sidecar validates (3d zero-mass bake)', () => {
  const sock = part => ({ v: 1, parts: ['body'], colliders: [], sockets: { seat: { p: [0, 1, 0], q: [0, 0, 0, 1], part } } });
  const ok = sock(null);
  assert.equal(validateSidecar(ok, { model: 'cart' }), ok);
  throwsExactly(() => validateSidecar(sock('roof'), { model: 'cart' }), "sidecar: cart: sockets.seat.part names an unknown part (got 'roof')");
  const zero = { v: 1, parts: ['deco'], colliders: [], mass: { mass: 0, com: [0, 0, 0], inertia: [0, 0, 0], frame: [0, 0, 0, 1] } };
  assert.equal(validateSidecar(zero, { model: 'cart' }), zero);
});
test('3b: sidecar errors name the model and the path', () => {
  const bad = (edit, message) => { const s = good(); edit(s); throwsExactly(() => validateSidecar(s, { model: 'cart', materials: defineMaterials() }), message); };
  bad(s => { s.v = 2; }, 'sidecar: cart: v must be 1 (got 2)');
  bad(s => { s.panels = []; }, 'sidecar: cart: panels unknown field (got [])');
  bad(s => { s.source.sha256 = 'XYZ'; }, "sidecar: cart: source.sha256 must be 64 lowercase hex digits (got 'XYZ')");
  bad(s => { s.parts = ['body', 'body']; }, "sidecar: cart: parts[1] repeats a part (got 'body')");
  bad(s => { s.colliders[0].half = [1, 0, 1]; }, 'sidecar: cart: colliders[0].half must be 3 numbers > 0 (got [1,0,1])');
  bad(s => { delete s.colliders[3].p; }, 'sidecar: cart: colliders[3].p must be 3 numbers (got undefined)');
  bad(s => { s.colliders[3].part = 'tyre'; }, "sidecar: cart: colliders[3].part names an unknown part (got 'tyre')");
  bad(s => { s.colliders[0].material = 'unobtainium'; }, "sidecar: cart: colliders[0].material names an unknown material (got 'unobtainium')");
  bad(s => { s.mass.mass = -1; }, 'sidecar: cart: mass.mass must be a number >= 0 (got -1)');
  bad(s => { s.mass.inertia = [1, -1, 1]; }, 'sidecar: cart: mass.inertia must be 3 numbers >= 0 (got [1,-1,1])');
  bad(s => { s.sockets.hat.part = 'roof'; }, "sidecar: cart: sockets.hat.part names an unknown part (got 'roof')");
  bad(s => { s.bounds.max = [1, -1, 2]; }, 'sidecar: cart: bounds.max must be 3 numbers, each >= min (got [1,-1,2])');
});
test('3b: validatePhys checks the envelope and every model, with the model id in the message (D2)', () => {
  const phys = { v: 1, engine: '0.8.0', materials: '2f4f4f95', models: { cart: good(), crate: { v: 1, parts: ['crate'], colliders: [{ shape: 'box', half: [0.5, 0.5, 0.5], p: O, q: I, part: 'crate', material: 'wood' }] } } };
  assert.equal(validatePhys(phys, { materials: defineMaterials() }), phys);
  const bad = (edit, message) => { const p = structuredClone(phys); edit(p); throwsExactly(() => validatePhys(p, { materials: defineMaterials() }), message); };
  bad(p => { p.v = 0; }, 'phys: v must be 1 (got 0)');
  bad(p => { p.engine = '0.8'; }, "phys: engine must be a version like 0.8.0 (got '0.8')");
  bad(p => { p.materials = '2F4F4F95'; }, "phys: materials must be an 8-hex registry hash (got '2F4F4F95')");
  bad(p => { p.models = []; }, 'phys: models must be an object (got [])');
  bad(p => { p.extra = 1; }, 'phys: extra unknown field (got 1)');
  bad(p => { p.models.crate.colliders[0].material = 'cardboard'; }, "sidecar: crate: colliders[0].material names an unknown material (got 'cardboard')");
  assert.equal(validatePhys({ ...phys, materials: '00000000' }).materials, '00000000', 'a stale hash is the caller\'s check, not a schema error');
});
test('3b: materialRefs lists every material a phys.json names, and where (T-14)', () => {
  const phys = { v: 1, engine: '0.8.0', materials: '2f4f4f95', models: { cart: good() } };
  assert.deepEqual(Object.keys(materialRefs(phys)), ['rubber', 'steel', 'wood']);
  assert.deepEqual(materialRefs(phys), {
    rubber: ['cart.colliders[1]', 'cart.colliders[3]'],
    steel: ['cart.colliders[0]', 'cart.colliders[2]'],
    wood: ['cart.colliders[4]', 'cart.colliders[5]'],
  });
});
test('3b: the materials and sidecar modules are sim-pure (L-3, T-12)', async () => {
  const { scanPurity } = await import('../testing/purity.js');
  const files = ['materials.js', 'materials.base.js', 'sidecar.js'].map(f => new URL(`../src/defs/${f}`, import.meta.url).pathname);
  assert.deepEqual(scanPurity(files), []);
});
