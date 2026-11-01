import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake } from '../tools/bake/index.js';
import { getIO } from '../tools/bake/read.js';
import { gameWith } from './helpers/bakeGame.mjs';
import { model, boxGeom, wedgeGeom, MODELS } from './fixtures/models/make.mjs';

// [A-12] levels as top-level nodes lod0…lodN under the model's root (a glb-author kit model: one root node named after the model)
const quiet = () => {};
const json = (dir, f) => JSON.parse(readFileSync(join(dir, 'baked', f), 'utf8'));
const geom = { trunk: boxGeom([0.4, 2, 0.4], [0, 1, 0]), crown: boxGeom([2, 2, 2], [0, 3, 0]), whole: boxGeom([2, 4, 2], [0, 2, 0]) };
// lod0: trunk + crown (24 tris), bounds [-1, 0, -1]..[1, 4, 1]; lod1: one box (12); lod2: a wedge (8), moved to the same bounds
function tree({ root = true, levels = ['lod0', 'lod1', 'lod2'], edit = () => {} } = {}) {
  const m = model(), at = root ? 'tree' : undefined;
  if (root) m.node('tree');
  const lv = name => m.node(name, { parent: at });
  if (levels.includes('lod0')) { lv('lod0'); m.node('trunk', { parent: 'lod0', mesh: m.mesh('trunk', [[geom.trunk, 'wood']]) }); m.node('crown', { parent: 'lod0', mesh: m.mesh('crown', [[geom.crown, 'plastic']]) }); }
  if (levels.includes('lod1')) { lv('lod1'); m.node('crown1', { parent: 'lod1', mesh: m.mesh('whole', [[geom.whole, 'plastic']]) }); }
  if (levels.includes('lod2')) { lv('lod2'); m.node('cone', { parent: 'lod2', t: [0, 0, -1], mesh: m.mesh('cone', [[wedgeGeom(2, 4, 2), 'plastic']]) }); }
  edit(m);
  return m;
}
const lod0Only = () => { const m = model(); m.node('trunk', { mesh: m.mesh('trunk', [[geom.trunk, 'wood']]) }); m.node('crown', { mesh: m.mesh('crown', [[geom.crown, 'plastic']]) }); return m; };
const bakeOne = async (m, log = quiet) => { const dir = gameWith({ tree: await m.bytes() }); await bake({ game: dir, log }); return dir; };

test('3d: a 3-level model bakes: the sidecar is lod0 alone, manifest.json records triangles per level [A-12]', async () => {
  const logs = [], dir = await bakeOne(tree(), m => logs.push(m)), ref = await bakeOne(lod0Only());
  const side = json(dir, 'phys.json').models.tree, plain = json(ref, 'phys.json').models.tree;
  assert.deepEqual(side.parts, ['trunk', 'crown']);
  assert.deepEqual(side.colliders.map(c => [c.shape, c.part, c.material]), [['hull', 'trunk', 'wood'], ['hull', 'crown', 'plastic']]);
  for (const k of ['colliders', 'mass', 'bounds', 'sockets']) assert.deepEqual(side[k], plain[k], `${k} is lod0's alone`);
  assert.deepEqual(side.bounds, { min: [-1, 0, -1], max: [1, 4, 1] });
  assert.deepEqual(json(dir, 'manifest.json').models.tree.lods, [24, 12, 8]);
  assert.equal(json(ref, 'manifest.json').models.tree.lods, undefined);
  assert.deepEqual(logs.filter(l => l.startsWith('bake: ')), [], 'no warnings');
  assert.match(logs.at(-1), /^baked tree: 2 parts, 2 colliders, \d+ bytes, lods 24\/12\/8 tris$/);
  const doc = await (await getIO()).read(join(dir, 'baked/models/tree.glb')), names = doc.getRoot().listNodes().map(n => n.getName());
  for (const n of ['tree', 'lod0', 'lod1', 'lod2', 'trunk', 'crown', 'crown1', 'cone']) assert.ok(names.includes(n), `${n} ships in the GLB`);
  const flat = await bakeOne(tree({ root: false }));                 // levels straight under the scene count too
  assert.deepEqual(json(flat, 'manifest.json').models.tree.lods, [24, 12, 8]);
  assert.equal((await bake({ game: dir, check: true, log: quiet })).ok, true, 'a re-check is current');
});
test('3d: level names run from lod0 without gaps, at most lod3, each once [A-12]', async () => {
  await assert.rejects(bakeOne(tree({ levels: ['lod0', 'lod2'] })), /^Error: bake: tree: lod1 missing \(levels run from lod0 without gaps, found lod0, lod2\)$/);
  await assert.rejects(bakeOne(tree({ levels: ['lod1', 'lod2'] })), /^Error: bake: tree: lod0 missing/);
  const five = tree({ edit: m => { for (const k of [3, 4]) { m.node(`lod${k}`, { parent: 'tree' }); m.node(`c${k}`, { parent: `lod${k}`, mesh: m.mesh(`c${k}`, [[boxGeom([1, 1, 1], [0, 2, 0]), 'wood']]) }); } } });
  await assert.rejects(bakeOne(five), /^Error: bake: tree: lod4 is past lod3 \(at most 4 levels\)$/);
});
test('3d: a level with no mesh fails [A-12]', async () => {
  await assert.rejects(bakeOne(tree({ edit: m => m.node('lod3', { parent: 'tree' }) })), /^Error: bake: tree: lod3 has no mesh \(every level needs one\)$/);
});
test('3d: a level whose bounds are past 25% of lod0\'s extent (min 5 cm) on an axis fails [A-12]', async () => {
  const tall = tree({ levels: ['lod0'], edit: m => { m.node('lod1', { parent: 'tree' }); m.node('big', { parent: 'lod1', mesh: m.mesh('big', [[boxGeom([2, 6, 2], [0, 3, 0]), 'plastic']]) }); } });
  await assert.rejects(bakeOne(tall), /^Error: bake: tree: lod1 bounds on y \[0, 6\] are not within 1 m of lod0's \[0, 4\]$/);
  const near = tree({ levels: ['lod0'], edit: m => { m.node('lod1', { parent: 'tree' }); m.node('b', { parent: 'lod1', mesh: m.mesh('b', [[boxGeom([2.9, 4, 2.9], [0, 2, 0]), 'plastic']]) }); } });
  await bakeOne(near);                                                // x and z 0.45 m past lod0's: inside 25% of 2 m
  const thin = model(); thin.node('lod0'); thin.node('a', { parent: 'lod0', mesh: thin.mesh('a', [[boxGeom([1, 0.02, 1]), 'wood']]) });
  thin.node('lod1'); thin.node('b', { parent: 'lod1', mesh: thin.mesh('b', [[boxGeom([1, 0.1, 1]), 'wood']]) });
  await bakeOne(thin);                                                // a 2 cm slab: the 5 cm floor, not 25% of 2 cm
  thin.nodes.get('b').setScale([1, 1.5, 1]);
  await assert.rejects(bakeOne(thin), /lod1 bounds on y \[-0.075, 0.075\] are not within 0.05 m of lod0's \[-0.01, 0.01\]$/);
});
test('3d: col-* and sock-* nodes under lod1+ fail; under lod0 they feed the sidecar [A-12]', async () => {
  const col = tree({ edit: m => m.node('col-box', { parent: 'crown1', mesh: m.mesh('cb', [[geom.whole, 'proxy']]) }) });
  await assert.rejects(bakeOne(col), /^Error: bake: tree: col-box is under lod1 \(col-\* and sock-\* nodes go under lod0: only lod0 feeds the sidecar\)$/);
  await assert.rejects(bakeOne(tree({ edit: m => m.node('sock-top', { parent: 'lod2', t: [0, 4, 0] }) })), /^Error: bake: tree: sock-top is under lod2/);
  const ok = tree({ edit: m => { m.node('col-box', { parent: 'crown', mesh: m.mesh('cb', [[geom.crown, 'proxy']]) }); m.node('sock-top', { parent: 'lod0', t: [0, 4, 0] }); } });
  const side = json(await bakeOne(ok), 'phys.json').models.tree;
  assert.deepEqual(side.colliders.map(c => [c.shape, c.part]), [['box', 'crown']]);
  assert.deepEqual(side.sockets, { top: { p: [0, 4, 0], q: [0, 0, 0, 1], part: null } });
});
test('3d: a level with more triangles than the one before it is a warning, not an error [A-12]', async () => {
  const logs = [], m = tree({ levels: ['lod0'], edit: m => { m.node('lod1', { parent: 'tree' }); for (const k of [0, 1, 2]) m.node(`b${k}`, { parent: 'lod1', mesh: m.mesh(`b${k}`, [[boxGeom([2, 4, 2], [0, 2, 0]), 'plastic']]) }); } });
  const dir = await bakeOne(m, l => logs.push(l));
  assert.deepEqual(logs.filter(l => l.startsWith('bake: ')), ['bake: tree: lod1 has more triangles than lod0 (36 > 24)']);
  assert.deepEqual(json(dir, 'manifest.json').models.tree.lods, [24, 36]);
});
test('3d: a model without levels is unchanged: no lods in manifest.json, lod-named nodes deeper down are ordinary [A-12]', async () => {
  const dir = gameWith({ crate: await MODELS.crate().bytes() }); await bake({ game: dir, log: quiet });
  assert.deepEqual(Object.keys(json(dir, 'manifest.json').models.crate), ['glb', 'anim', 'bytes', 'sha256', 'options']);
  const deep = model(); deep.node('a'); deep.node('b'); deep.node('lod1', { parent: 'a' }); deep.node('x', { parent: 'lod1', mesh: deep.mesh('x', [[boxGeom([1, 1, 1]), 'wood']]) });
  const d2 = await bakeOne(deep);                                     // two top-level nodes, so 'a' is not the root and its lod1 is not a level
  assert.equal(json(d2, 'manifest.json').models.tree.lods, undefined);
  assert.deepEqual(json(d2, 'phys.json').models.tree.parts, ['x']);
});
