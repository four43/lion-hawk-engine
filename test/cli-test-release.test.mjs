// lion-hawk test (node --test for the game, the engine checks, @visual only with --visual) and lion-hawk release
// (bump, bake, build, test, commit; push stays manual), spec §7.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyFixture } from './helpers/bakeGame.mjs';
import { tmp } from './helpers/tmp.mjs';

const BIN = fileURLToPath(new URL('../bin/lion-hawk.js', import.meta.url));
const COUNTDOWN = pathToFileURL(fileURLToPath(new URL('./fixtures/countdown.js', import.meta.url))).href;
const run = (args, env = {}) => new Promise(resolve => {
  const clean = { ...process.env }; delete clean.LH_FIXTURE_OUT; delete clean.NODE_TEST_CONTEXT;
  execFile(process.execPath, [BIN, ...args], { env: { ...clean, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});
// the fixture game with a sim module (countdown), one plain test and one @visual test (that fails when run)
const gameWithTests = ({ checks = true, failing = false } = {}) => {
  const game = copyFixture(), cfg = join(game, 'game.config.js');
  writeFileSync(join(game, 'src/game.js'), `export { default } from '${COUNTDOWN}';\n`);
  mkdirSync(join(game, 'test'));
  writeFileSync(join(game, 'test/a.test.mjs'), `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('plain', () => { assert.equal(1, ${failing ? 2 : 1}); });\ntest('@visual looks right', () => { throw new Error('visual ran'); });\n`);
  if (checks) writeFileSync(cfg, readFileSync(cfg, 'utf8').replace("  build: {", "  test: { game: 'src/game.js', roots: ['src/game.js'] },\n  build: {"));
  return game;
};

test('lion-hawk test runs the game tests and the engine checks, and skips @visual tests', async () => {
  const r = await run(['test', '--game', gameWithTests()]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /plain/); assert.match(r.stdout, /engine checks: determinism/); assert.match(r.stdout, /engine checks: materials/); assert.match(r.stdout, /engine checks: sim purity/);
  assert.doesNotMatch(r.stdout, /visual ran/);
});
test('lion-hawk test --visual runs @visual tests too; a failing test exits 1', async () => {
  let r = await run(['test', '--game', gameWithTests(), '--visual']);
  assert.equal(r.code, 1); assert.match(r.stdout, /visual ran/);
  r = await run(['test', '--game', gameWithTests({ failing: true })]);
  assert.equal(r.code, 1);
});
test('lion-hawk test with no tests and no test.game is an error', async () => {
  const r = await run(['test', '--game', copyFixture()]);
  assert.equal(r.code, 1); assert.match(r.stderr, /test: nothing to run \(no test\/ directory and no test\.game\)/);
});

const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
const repo = game => { git(game, 'init', '-q'); git(game, 'add', '-A'); git(game, 'commit', '-qm', 'init'); return game; };

test('lion-hawk release bumps, bakes, builds, tests and commits; it never pushes', async () => {
  const game = repo(gameWithTests()), out = tmp('lh-out-');
  const r = await run(['release', '--game', game, '--bump', 'minor', '--out', out], { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')).version, '1.3.0');
  assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /content="fixture 1\.3\.0 lion-hawk/);
  assert.equal(git(game, 'log', '-1', '--format=%s').trim(), 'release: fixture 1.3.0');
  assert.equal(git(game, 'status', '--porcelain').trim(), '');
  assert.match(r.stdout, /push stays manual/);
});
test('release refuses a dirty tree, and a failing step restores the version and commits nothing', async () => {
  const dirty = repo(gameWithTests()); writeFileSync(join(dirty, 'notes.txt'), 'x');
  let r = await run(['release', '--game', dirty, '--out', tmp('lh-out-')]);
  assert.equal(r.code, 1); assert.match(r.stderr, /release: the git tree is not clean/);
  const bad = repo(gameWithTests({ failing: true }));
  r = await run(['release', '--game', bad, '--out', tmp('lh-out-')]);
  assert.equal(r.code, 1); assert.match(r.stderr, /release: test failed; package\.json is back at 1\.2\.3, nothing committed/);
  assert.equal(JSON.parse(readFileSync(join(bad, 'package.json'), 'utf8')).version, '1.2.3');
  assert.equal(git(bad, 'log', '--format=%s').trim(), 'init');
  r = await run(['release', '--game', repo(gameWithTests()), '--bump', 'huge', '--out', tmp('lh-out-')]);
  assert.equal(r.code, 2); assert.match(r.stderr, /--bump must be patch, minor or major/);
});
