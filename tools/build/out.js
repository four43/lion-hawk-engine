// Where a build may write (overview §4.3, global constraint 8). resolveOut({ cfg, out, env, site }) → absolute dir.
// --out wins, then $<outEnv>; with neither, --site gives the default site dir (<repo>/site/exp/<site>), else exit 2. Any
// path under a site/exp/ directory is refused unless --site is passed.
import { resolve, sep } from 'node:path';

export class UsageError extends Error {}

export function resolveOut({ cfg, out, env = process.env, site = false }) {
  let dir = out ?? (cfg.outEnv ? env[cfg.outEnv] : undefined);
  if (!dir && site) dir = resolve(cfg.dir, '../../site/exp', cfg.site);
  if (!dir) throw new UsageError(`build: pass --out or set $${cfg.outEnv ?? '<outEnv>'}`);
  const abs = resolve(dir);
  if (!site && (abs + sep).includes(`${sep}site${sep}exp${sep}`)) throw new UsageError(`build: ${abs} is under site/exp/; only a deploy passes --site`);
  return abs;
}
