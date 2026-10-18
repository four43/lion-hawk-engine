import { tmp } from './helpers/tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFixture } from './helpers/bakeGame.mjs';
import { build } from './fixtures/models/make.mjs';

const BIN = fileURLToPath(new URL('../bin/lion-hawk.js', import.meta.url));
const run = (args, env = {}) => new Promise(resolve => {
  const clean = { ...process.env }; delete clean.LH_FIXTURE_OUT;
  execFile(process.execPath, [BIN, ...args], { env: { ...clean, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});

test('3d: the bin is executable and usage errors exit 2', async () => {
  assert.ok(statSync(BIN).mode & 0o111, 'bin/lion-hawk.js is executable');
  let r = await run([]); assert.equal(r.code, 2); assert.match(r.stderr, /unknown command ''/); assert.match(r.stderr, /usage:/);
  r = await run(['frob']); assert.equal(r.code, 2);
  r = await run(['bake', '--chek']); assert.equal(r.code, 2); assert.match(r.stderr, /lion-hawk bake: Unknown option '--chek'/);
  r = await run(['dev', '--port', 'x']); assert.equal(r.code, 2);
  r = await run(['--help']); assert.equal(r.code, 0); assert.match(r.stdout, /lion-hawk build \[--game <dir>\]/);
});
test('3d: build with no --out and no $<outEnv> exits 2 with the contract message; site/exp exits 2 and writes nothing', async () => {
  const game = copyFixture();
  let r = await run(['build', '--game', game]);
  assert.equal(r.code, 2); assert.match(r.stderr, /build: pass --out or set \$LH_FIXTURE_OUT/);
  const site = join(tmp('lh-site-'), 'site/exp/fixture');
  r = await run(['build', '--game', game, '--out', site]);
  assert.equal(r.code, 2); assert.ok(!existsSync(site));
  r = await run(['build', '--game', game, '--mode', 'shared', '--out', tmp('lh-out-')]);
  assert.equal(r.code, 2);
  const out = tmp('lh-out-');
  r = await run(['build', '--game', game], { LH_FIXTURE_OUT: out });
  assert.equal(r.code, 0, r.stderr); assert.ok(existsSync(join(out, 'index.html'))); assert.match(r.stdout, /gzip/);
});
test('3d: bake and bake --check exit codes: 0 current, 1 stale, 1 on a bake error', async () => {
  const game = copyFixture({ baked: false });
  let r = await run(['bake', '--game', game]); assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /baked pet: 4 parts, 4 colliders, \d+ bytes, 2 clips/);
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 0);
  writeFileSync(join(game, 'assets/models/crate.glb'), await build('ramp'));
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 1); assert.match(r.stdout, /stale: crate: source changed/);
  r = await run(['bake', '--game', game, 'crate']); assert.equal(r.code, 0);
  r = await run(['bake', '--game', game, '--check']); assert.equal(r.code, 0);
  r = await run(['bake', '--game', game, 'nope']); assert.equal(r.code, 1); assert.match(r.stderr, /lion-hawk: bake: nope: no such model/);
});
test('3d: dev keeps serving until killed', async () => {
  const game = copyFixture(), p = spawn(process.execPath, [BIN, 'dev', '--game', game, '--port', '0', '--host', '127.0.0.1']);
  let out = ''; p.stdout.on('data', c => { out += c; });
  try {
    const url = await new Promise((res, rej) => { const giveUp = setTimeout(() => { clearInterval(t); rej(new Error(`no url: ${out}`)); }, 10000), t = setInterval(() => { const m = /dev: fixture at (http:\S+)/.exec(out); if (m) { clearInterval(t); clearTimeout(giveUp); res(m[1]); } }, 50); });
    assert.equal((await fetch(url)).status, 200);
    assert.equal(p.exitCode, null);
  } finally { p.kill(); }
});
