// Where a build writes (overview §4.3). resolveOut({ cfg, out, env }) → absolute dir.
// --out wins, then $<outEnv>, then build.out (relative to the game dir, default 'build').
import { resolve } from 'node:path';

export class UsageError extends Error {}

export function resolveOut({ cfg, out, env = process.env }) {
  return resolve(out ?? (cfg.outEnv ? env[cfg.outEnv] : undefined) ?? resolve(cfg.dir, cfg.build?.out ?? 'build'));
}
