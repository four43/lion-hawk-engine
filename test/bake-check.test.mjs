import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bake, ENGINE_VERSION } from '../tools/bake/index.js';
import { copyFixture, FIXTURE } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const quiet = () => {};
const snapshot = dir => Object.fromEntries(readdirSync(join(dir, 'baked'), { recursive: true }).filter(f => statSync(join(dir, 'baked', f)).isFile()).map(f => [f, readFileSync(join(dir, 'baked', f)).toString('base64')]));

test('3d: the committed fixture baked/ is current (sources and registry; the engine minor is checked below)', async () => {
  const r = await bake({ game: FIXTURE, check: true, log: quiet });
  assert.deepEqual(r.stale.filter(s => !s.why.startsWith('engine ')), [], 'run: node bin/lion-hawk.js bake --game test/fixtures/models/game');
});
test('3d: --check passes on a fresh bake and writes nothing', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const before = snapshot(dir), r = await bake({ game: dir, check: true, log: quiet });
  assert.deepEqual(r, { ok: true, baked: [], stale: [] });
  assert.deepEqual(snapshot(dir), before);
});
test('3d: --check reports a changed, added or removed source, the registry hash and the engine major.minor', async () => {
  const dir = copyFixture({ baked: false }); await bake({ game: dir, log: quiet });
  const logs = [];
  writeFileSync(join(dir, 'assets/models/crate.glb'), await build('ramp'));
  writeFileSync(join(dir, 'assets/models/extra.glb'), await build('crate'));
  rmSync(join(dir, 'assets/models/ramp.glb'));
  writeFileSync(join(dir, 'game.config.js'), readFileSync(join(dir, 'game.config.js'), 'utf8').replace(/\n\s*ramp: \{[^\n]*\n/, '\n'));
  const r = await bake({ game: dir, check: true, log: m => logs.push(m) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.stale, [{ id: 'crate', why: 'source changed' }, { id: 'extra', why: 'not baked' }, { id: 'ramp', why: 'source removed' }]);
  assert.deepEqual(logs, ['stale: crate: source changed', 'stale: extra: not baked', 'stale: ramp: source removed']);
  const dir2 = copyFixture({ baked: false }); await bake({ game: dir2, log: quiet });
  const phys = JSON.parse(readFileSync(join(dir2, 'baked/phys.json'), 'utf8'));
  const [maj, min] = ENGINE_VERSION.split('.');
  writeFileSync(join(dir2, 'baked/phys.json'), JSON.stringify({ ...phys, engine: `${maj}.${Number(min) + 1}.0` }));
  writeFileSync(join(dir2, 'materials.js'), readFileSync(join(dir2, 'materials.js'), 'utf8').replace(/hash: '[0-9a-f]+'/, "hash: 'abcdef01'"));
  assert.deepEqual((await bake({ game: dir2, check: true, log: quiet })).stale.map(s => s.why),
    [`registry hash ${phys.materials} → abcdef01`, `engine ${maj}.${Number(min) + 1}.0 → ${ENGINE_VERSION}`]);
  writeFileSync(join(dir2, 'baked/phys.json'), JSON.stringify({ ...phys, engine: `${maj}.${min}.99`, materials: 'abcdef01' }));   // a patch bump is not stale
  assert.equal((await bake({ game: dir2, check: true, log: quiet })).ok, true);
  rmSync(join(dir2, 'baked/phys.json'));
  assert.deepEqual((await bake({ game: dir2, check: true, log: quiet })).stale, [{ id: '*', why: 'no phys.json' }]);
});
