// View sync on a fake World, box-mesh assets and a fresh scene (test/sync*.test.mjs). engine.world may be swapped by tests.
import * as THREE from 'three';
import { createViewSync } from '../../src/view/sync/index.js';
import { fakeWorld } from './fakeWorld.mjs';
import { fakeAssets } from './fakeAssets.mjs';

export function syncSetup(models) {
  const world = fakeWorld(), engine = { world }, gfx = { scene: new THREE.Scene() }, fa = fakeAssets(models), view = { dt: 1 / 60 };
  const sync = createViewSync(engine, { gfx, assets: fa.assets, compiler: fa.compiler, view });
  return { world, engine, gfx, view, sync, ...fa };
}
