// game.config.js loader for the lion-hawk CLI (overview §4.3). loadConfig(dir) → the config with defaults filled in, plus
// `dir` (absolute game dir) and `version` (the game's package.json version). Unknown keys throw, so a typo such as
// `optimize` fails instead of being ignored.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// import a game module fresh whenever its content changes (tests and `dev` edit configs and registries in one process)
export const importFresh = file => import(`${pathToFileURL(file).href}?v=${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)}`);

const KEYS = {
  '': ['id', 'outEnv', 'bake', 'build', 'test'],
  bake: ['src', 'out', 'materials', 'rename', 'palette', 'paint', 'models', 'optimise', 'textures'],
  'bake.textures': ['format', 'quality', 'resize', 'mode'],
  'bake.rename': ['materials', 'nodes'],
  'bake.paint': ['base'],
  'bake.optimise': ['meshopt', 'quantize', 'weld', 'prune', 'dedupe'],
  'bake.models.*': ['static', 'rename', 'keepTextures', 'animTable', 'sockets', 'file', 'colliders', 'aero'],
  'bake.models.*.rename': ['materials', 'nodes'],
  'bake.models.*.animTable': ['fps', 'clips'],
  build: ['entry', 'template', 'pwa', 'hooks', 'manifest', 'shared', 'out'],
  'build.shared': ['dir', 'base'],
  test: ['dir', 'game', 'roots', 'zeroAlloc'],
  'build.manifest': ['name', 'shortName', 'themeColor', 'backgroundColor', 'icon', 'display', 'orientation'],
};
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkKeys(obj, path, pattern) {
  const allowed = KEYS[pattern];
  for (const k of Object.keys(obj)) {
    const at = path ? `${path}.${k}` : k;
    if (!allowed.includes(k)) throw new Error(`config: unknown key '${at}'`);
    const sub = pattern ? `${pattern}.${k}` : k;
    if (pattern === 'bake' && k === 'models') {
      if (!isObj(obj.models)) throw new Error(`config: '${at}' must be an object`);
      for (const [id, m] of Object.entries(obj.models)) {
        if (!isObj(m)) throw new Error(`config: '${at}.${id}' must be an object`);
        checkKeys(m, `${at}.${id}`, 'bake.models.*');
      }
    } else if (KEYS[sub] && isObj(obj[k])) checkKeys(obj[k], at, sub);
    else if (KEYS[sub] && !(sub === 'bake.models.*.animTable' && typeof obj[k] === 'boolean')) throw new Error(`config: '${at}' must be an object`);
  }
}

export async function loadConfig(dir = '.') {
  const gameDir = resolve(dir), file = join(gameDir, 'game.config.js');
  if (!existsSync(file)) throw new Error(`config: no game.config.js in ${gameDir}`);
  const raw = (await importFresh(file)).default;
  if (!isObj(raw)) throw new Error(`config: ${file} has no default export object`);
  checkKeys(raw, '', '');
  if (typeof raw.id !== 'string' || !raw.id) throw new Error(`config: 'id' must be a non-empty string`);
  const pkgFile = join(gameDir, 'package.json');
  const version = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')).version ?? '0.0.0' : '0.0.0';
  const b = raw.bake ?? {};
  const tx = b.textures; // [A-3]
  if (tx !== undefined) {
    if (tx.format !== 'webp' && tx.format !== 'ktx2') throw new Error(`config: 'bake.textures.format' must be 'webp' or 'ktx2'`);
    if (tx.quality !== undefined && (!Number.isInteger(tx.quality) || tx.quality < 1 || tx.quality > 100)) throw new Error(`config: 'bake.textures.quality' must be an integer in 1..100`);
    if (tx.mode !== undefined && tx.format !== 'ktx2') throw new Error(`config: 'bake.textures.mode' is for ktx2 only`);
    if (tx.mode !== undefined && tx.mode !== 'etc1s' && tx.mode !== 'uastc') throw new Error(`config: 'bake.textures.mode' must be 'etc1s' or 'uastc'`);
    const okResize = tx.resize === undefined || ['nearest-pot', 'ceil-pot', 'floor-pot'].includes(tx.resize) || (Array.isArray(tx.resize) && tx.resize.length === 2 && tx.resize.every(n => Number.isInteger(n) && n > 0));
    if (!okResize) throw new Error(`config: 'bake.textures.resize' must be [width, height] or 'nearest-pot', 'ceil-pot', 'floor-pot'`);
  }
  if (b.palette != null && b.palette !== 'vertex') throw new Error(`config: 'bake.palette' must be 'vertex' or absent (got ${JSON.stringify(b.palette)})`);
  const man = raw.build?.manifest; // [P-3]
  if (man !== undefined) {
    if (typeof man.name !== 'string' || !man.name) throw new Error(`config: 'build.manifest.name' must be a non-empty string`);
    const DISPLAYS = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
    if (man.display !== undefined && !DISPLAYS.includes(man.display)) throw new Error(`config: 'build.manifest.display' must be one of ${DISPLAYS.join(', ')}`);
    for (const k of ['shortName', 'themeColor', 'backgroundColor', 'icon', 'orientation']) if (man[k] !== undefined && typeof man[k] !== 'string') throw new Error(`config: 'build.manifest.${k}' must be a string`);
  }
  if (raw.build?.out !== undefined && (typeof raw.build.out !== 'string' || !raw.build.out)) throw new Error(`config: 'build.out' must be a path`);
  const t = raw.test ?? {}; // lion-hawk test
  if (t.roots !== undefined && (!Array.isArray(t.roots) || !t.roots.every(r => typeof r === 'string'))) throw new Error(`config: 'test.roots' must be an array of paths`);
  if (t.game !== undefined && typeof t.game !== 'string') throw new Error(`config: 'test.game' must be a path`);
  const models = {};
  for (const [id, m] of Object.entries(b.models ?? {})) {
    const at = m.animTable === true ? { fps: 30, clips: null } : m.animTable ? { fps: m.animTable.fps ?? 30, clips: m.animTable.clips ?? null } : null;
    models[id] = { static: !!m.static, keepTextures: !!m.keepTextures, sockets: m.sockets ?? [], file: m.file ?? null,
      colliders: m.colliders !== false, animTable: at, rename: { materials: m.rename?.materials ?? {}, nodes: m.rename?.nodes ?? {} },
      ...(m.aero === true ? { aero: true } : {}) }; // [A-5] only when on: older option hashes stay the same
    if (m.aero !== undefined && typeof m.aero !== 'boolean') throw new Error(`config: 'bake.models.${id}.aero' must be true or false`);
  }
  return {
    dir: gameDir, version, id: raw.id, outEnv: raw.outEnv ?? null,
    bake: {
      src: b.src ?? 'assets/models', out: b.out ?? 'baked', materials: b.materials ?? null, palette: b.palette ?? null,
      paint: { base: b.paint?.base ?? 'steel' },
      rename: { materials: b.rename?.materials ?? {}, nodes: b.rename?.nodes ?? {} },
      optimise: { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true, ...(b.optimise ?? {}) },
      textures: b.textures ?? null,
      models,
    },
    build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: null, manifest: null, ...(raw.build ?? {}) },
    test: { dir: 'test', game: null, roots: null, zeroAlloc: false, ...(raw.test ?? {}) },
  };
}
