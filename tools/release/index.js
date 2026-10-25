// lion-hawk release (spec §7.1): on a clean git tree, bump package.json, then bake, build and test; on success commit
// 'release: <id> <version>'. Push stays manual. A failing step puts package.json back and commits nothing.
// release({ game, bump, out, site, env, log }) → exit code.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../bake/config.js';
import { bake } from '../bake/index.js';
import { build, UsageError } from '../build/index.js';
import { runTests } from '../test/index.js';

export const BUMPS = ['patch', 'minor', 'major'];
export function bumpVersion(v, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v); if (!m) throw new Error(`release: package.json version '${v}' is not x.y.z`);
  const [a, b, c] = m.slice(1).map(Number);
  return bump === 'major' ? `${a + 1}.0.0` : bump === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

export async function release({ game = '.', bump = 'patch', out, site = false, env = process.env, log = console.log } = {}) {
  if (!BUMPS.includes(bump)) throw new UsageError('release: --bump must be patch, minor or major');
  const dir = resolve(game), git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  if (git('status', '--porcelain').trim()) throw new Error('release: the git tree is not clean (commit or stash first)');
  const pkgFile = join(dir, 'package.json'), text = readFileSync(pkgFile, 'utf8'), pkg = JSON.parse(text);
  const version = bumpVersion(pkg.version ?? '0.0.0', bump);
  writeFileSync(pkgFile, text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`));
  let step = 'bake';
  try {
    log(`release: ${pkg.version} → ${version}`);
    if (!(await bake({ game: dir, log })).ok) throw new Error('bake failed');
    step = 'build'; await build({ game: dir, out, env, site, log });
    step = 'test'; if ((await runTests({ game: dir, log })) !== 0) throw new Error('tests failed');
  } catch (e) {
    writeFileSync(pkgFile, text);
    throw Object.assign(new Error(`release: ${step} failed; package.json is back at ${pkg.version}, nothing committed (${e.message})`), { usage: e instanceof UsageError });
  }
  const cfg = await loadConfig(dir);
  git('add', '-A'); git('commit', '-q', '-m', `release: ${cfg.id} ${version}`);
  log(`release: committed 'release: ${cfg.id} ${version}' (push stays manual)`);
  return 0;
}
