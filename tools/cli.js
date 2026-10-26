// lion-hawk CLI (B-1): `bake`, `build`, `dev`, `test`, `release`. main(argv, { env, log, error }) → exit code (0 ok, 1 failed or stale, 2 usage),
// or null while `dev` keeps serving.
import { parseArgs } from 'node:util';
import { bake } from './bake/index.js';
import { build, UsageError } from './build/index.js';
import { dev } from './dev/index.js';
import { runTests } from './test/index.js';
import { release } from './release/index.js';

export const USAGE = `usage:
  lion-hawk bake  [--game <dir>] [--check] [ids...]
  lion-hawk build [--game <dir>] (--out <dir> | $<outEnv>) [--site] [--mode single|shared] [--e2e]
  lion-hawk dev   [--game <dir>] [--port 8740] [--host 0.0.0.0]
  lion-hawk test  [--game <dir>] [--visual]
  lion-hawk release [--game <dir>] [--bump patch|minor|major] (--out <dir> | $<outEnv>) [--site]`;

const OPTIONS = {
  bake: { game: { type: 'string', default: '.' }, check: { type: 'boolean', default: false } },
  build: { game: { type: 'string', default: '.' }, out: { type: 'string' }, site: { type: 'boolean', default: false },
    mode: { type: 'string', default: 'single' }, e2e: { type: 'boolean', default: false } },
  dev: { game: { type: 'string', default: '.' }, port: { type: 'string', default: '8740' }, host: { type: 'string', default: '0.0.0.0' } },
  test: { game: { type: 'string', default: '.' }, visual: { type: 'boolean', default: false } },
  release: { game: { type: 'string', default: '.' }, bump: { type: 'string', default: 'patch' }, out: { type: 'string' }, site: { type: 'boolean', default: false } },
};

export async function main(argv, { env = process.env, log = console.log, error = console.error } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') { log(USAGE); return 0; }
  if (!OPTIONS[cmd]) { error(`lion-hawk: unknown command '${cmd ?? ''}'\n${USAGE}`); return 2; }
  let values, positionals;
  try { ({ values, positionals } = parseArgs({ args: rest, options: OPTIONS[cmd], allowPositionals: cmd === 'bake', strict: true })); }
  catch (e) { error(`lion-hawk ${cmd}: ${e.message}\n${USAGE}`); return 2; }
  try {
    if (cmd === 'bake') { const r = await bake({ game: values.game, ids: positionals, check: values.check, log }); return r.ok ? 0 : 1; }
    if (cmd === 'build') { await build({ game: values.game, out: values.out, env, site: values.site, mode: values.mode, e2e: values.e2e, log }); return 0; }
    if (cmd === 'test') return (await runTests({ game: values.game, visual: values.visual, log })) === 0 ? 0 : 1;
    if (cmd === 'release') return await release({ game: values.game, bump: values.bump, out: values.out, site: values.site, env, log });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) { error(`lion-hawk dev: --port must be 0..65535 (got ${values.port})`); return 2; }
    await dev({ game: values.game, port, host: values.host, log });
    return null;
  } catch (e) {
    error(`lion-hawk: ${e.message}`);
    return e instanceof UsageError || e.usage ? 2 : 1;
  }
}
