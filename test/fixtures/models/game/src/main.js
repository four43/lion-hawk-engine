// Fixture entry: imports the baked sidecars and manifest as JSON (D2) and three (deduped from the game root, #11).
import PHYS from '../baked/phys.json' with { type: 'json' };
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { REVISION } from 'three';
import { REVISION as engineThree } from 'engine-probe';
globalThis.fixture = { models: Object.keys(PHYS.models), glbs: Object.values(MANIFEST.models).map(m => m.glb), three: REVISION, engineThree, tag: '</script>' };
