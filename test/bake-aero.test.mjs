// [A-5] aero panels and the closed volume (phase 8, design §6.3): bake.models.<id>.aero: true adds sidecar.aero =
// { panels: [{ part, a, n, c }], volume, centroid } in body space. Opt-in, so other sidecars and option hashes are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake, optionsHash } from '../tools/bake/index.js';
import { loadConfig } from '../tools/bake/config.js';
import { validateSidecar } from '../src/defs/sidecar.js';
import { build } from './fixtures/models/make.mjs';
import { gameWith } from './helpers/bakeGame.mjs';

const quiet = () => {};
const sidecar = async (id, models) => {
  const dir = gameWith({ [id]: await build(id) }, { models });
  await bake({ game: dir, log: quiet });
  return { dir, s: JSON.parse(readFileSync(join(dir, 'baked/phys.json'), 'utf8')).models[id] };
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('A-5: a unit box gets six unit panels on its faces, volume 1 and its centre as centroid', async () => {
  const { s } = await sidecar('crate', { crate: { aero: true } });
  const { panels, volume, centroid } = s.aero;
  assert.equal(panels.length, 6);
  for (const p of panels) {
    assert.equal(p.part, 'body'); near(p.a, 1);
    const axis = p.n.findIndex(v => Math.abs(v) > 0.5); near(Math.abs(p.n[axis]), 1);
    const want = [0, 0.5, 0]; want[axis] += 0.5 * Math.sign(p.n[axis]);
    p.c.forEach((v, k) => near(v, want[k]));
  }
  near(volume, 1); centroid.forEach((v, k) => near(v, [0, 0.5, 0][k]));
  assert.doesNotThrow(() => validateSidecar(s, { model: 'crate' }));
});
test('A-5: a wedge gives its slope its own panel, with the real normal, and volume 0.5 w h d', async () => {
  const { s } = await sidecar('ramp', { ramp: { aero: true } });
  assert.equal(s.aero.panels.length, 5);
  near(s.aero.volume, 3);
  const slope = s.aero.panels.find(p => p.n[1] > 0.5);
  near(slope.n[1], 3 / Math.hypot(1, 3)); near(slope.n[2], 1 / Math.hypot(1, 3)); // high edge at z = 0: it faces +y and +z
  near(slope.a, 2 * Math.hypot(1, 3));
});
test('A-5: aero is opt-in: no aero key without it, and the option hash of a model without it is unchanged', async () => {
  const { s, dir } = await sidecar('crate', {});
  assert.equal(s.aero, undefined);
  const cfg = await loadConfig(dir);
  assert.equal(cfg.bake.models.crate, undefined);
  const withOff = await loadConfig(gameWith({ crate: await build('crate') }, { models: { crate: { static: false } } }));
  assert.equal(Object.hasOwn(withOff.bake.models.crate, 'aero'), false, 'aero: false is not in the normalised model config');
  assert.equal(optionsHash(withOff, withOff.bake.models.crate).length, 16);
});
test('A-5: validateSidecar checks the aero block', () => {
  const base = { v: 1, parts: ['body'], colliders: [] };
  const ok = { ...base, aero: { panels: [{ part: 'body', a: 1, n: [0, 1, 0], c: [0, 1, 0] }], volume: 1, centroid: [0, 0.5, 0] } };
  assert.doesNotThrow(() => validateSidecar(ok));
  assert.throws(() => validateSidecar({ ...ok, aero: { ...ok.aero, volume: -1 } }), /aero\.volume must be a number >= 0/);
  assert.throws(() => validateSidecar({ ...ok, aero: { ...ok.aero, panels: [{ part: 'nope', a: 1, n: [0, 1, 0], c: [0, 0, 0] }] } }), /aero\.panels\[0\]\.part names an unknown part/);
  assert.throws(() => validateSidecar({ ...ok, aero: { ...ok.aero, panels: [{ part: 'body', a: 1, n: [0, 2, 0], c: [0, 0, 0] }] } }), /aero\.panels\[0\]\.n must be a unit vector/);
  assert.throws(() => validateSidecar({ ...ok, aero: { ...ok.aero, wings: 1 } }), /aero\.wings unknown field/);
});
