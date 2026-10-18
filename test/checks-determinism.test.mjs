// T-10, T-12: two runs agree step for step; a run that leaks state into the next is caught at the exact step;
// purity is scanned over the roots a game names.
import { tmp } from './helpers/tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { determinism, simPurity } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';
import { actions, axis } from '../src/core/actions.js';

export const yard = (e, ctx) => {
  const w = ctx.world, r = e.rng('yard');
  w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [20, 0.5, 20], p: [0, -0.5, 0], material: 'gravel' }], groups: { member: ['ground'] } });
  for (let i = 0; i < 12; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-3, 3), 1 + i * 1.2, r.range(-3, 3)], yaw: r.range(0, 6), tags: ['crate'] });
};

test('determinism: two runs of a physics scene agree at every step (T-10)', () => {
  const res = determinism(physGame({ build: yard }), { seed: 7, steps: 240 });
  assert.equal(res.ok, true); assert.equal(res.step, -1);
  assert.match(res.a, /^[0-9a-f]{8}$/); assert.equal(res.a, res.b);
});
test('determinism names the first step where state leaked from the first run differs', () => {
  let runs = 0; // module state shared by the two runs, on purpose
  const leaky = physGame({ build: (e, ctx) => { yard(e, ctx); runs++; },
    tick: (e, dt, ctx) => { if (e.time.step === 100 && runs > 1) ctx.world.get(2).body.applyImpulse({ x: 50, y: 0, z: 0 }, true); } });
  const res = determinism(leaky, { seed: 7, steps: 240 });
  assert.equal(res.ok, false); assert.equal(res.step, 101); assert.notEqual(res.a, res.b);
});
test('determinism takes args and an input function of the step (controller ruling)', () => {
  const seen = [];
  const game = physGame({ actions: actions({ push: axis() }), build: (e, ctx) => { yard(e, ctx); seen.push(ctx.args?.crates); },
    tick: (e, dt, ctx) => { if (e.input.snapshot.push > 0) ctx.world.get(2).body.applyImpulse({ x: e.input.snapshot.push, y: 0, z: 0 }, true); } });
  const res = determinism(game, { seed: 3, steps: 120, args: { crates: 4 }, input: step => ({ push: step % 30 === 0 ? 1 : 0 }) });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, [4, 4]);
  // a stateful named policy keeps one scratch object for the whole run (#37): one wrapper per run, not per step
  const scratches = new Set(); let calls = 0;
  const named = physGame({ actions: actions({ push: axis() }), build: yard,
    policies: { pulse: (h, i, s) => { scratches.add(s); s.n = (s.n ?? 0) + 1; calls++; assert.equal(s.n, i + 1); return { push: 0 }; } } });
  assert.equal(determinism(named, { seed: 3, steps: 50, input: 'pulse' }).ok, true);
  assert.equal(scratches.size, 2); assert.equal(calls, 100);
});
test('simPurity scans the given roots and reports each hit (T-12)', () => {
  const dir = tmp('lh-purity-');
  try {
    writeFileSync(join(dir, 'ok.js'), 'export const a = 1;\n');
    assert.deepEqual(simPurity(null, { roots: [dir] }), { ok: true, found: [] });
    writeFileSync(join(dir, 'bad.js'), 'export const t = () => Date.now();\n');
    const r = simPurity(null, { roots: [dir] });
    assert.equal(r.ok, false); assert.equal(r.found[0].rule, 'wall-clock'); assert.equal(r.found[0].line, 1);
    assert.throws(() => simPurity(null, {}), /checks\.simPurity: pass \{ roots: \[dirs or files\] \}/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the World and physics sources are sim-pure', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(simPurity(null, { roots: [`${root}src/sim/world`, `${root}src/sim/physics`] }).found, []);
});
