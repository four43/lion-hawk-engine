// The World end to end: a scene that uses every 3c feature runs twice identically, records a tape that clears and
// rebuilds the World mid-run, and replays it; a game that rebuilds differently fails the replay at a named step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headless } from '../testing/headless.js';
import { replay } from '../testing/replay.js';
import { determinism } from '../testing/checks.js';
import { physGame } from './fixtures/phys/game.js';

function makeGame({ extra = false } = {}) {
  const build = (e, ctx) => {
    const w = ctx.world, r = e.rng('yard');
    w.spawn({ tags: ['ground'], colliders: [{ shape: 'box', half: [30, 0.5, 30], p: [0, -0.5, 0], material: 'gravel' }], groups: { member: ['ground'] } });
    const n = 12, heights = Array.from({ length: n * n }, (_, i) => 0.05 * (i % n) + 0.02 * Math.floor(i / n));
    w.heightfield({ nx: n, nz: n, cell: 1, x0: 10, z0: 10, heights, material: 'grass' });
    for (let i = 0; i < 8; i++) w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-4, 4), 0.6 + i * 1.1, r.range(-4, 4)], yaw: r.range(0, 6.28), tags: ['crate'], crate: { i }, contacts: { min: 1 } });
    for (let i = 0; i < 3; i++) w.spawn({ tags: ['post'], body: { type: 'dynamic', sleep: true }, colliders: [{ shape: 'box', half: [0.06, 0.6, 0.045], material: 'wood' }], at: [6 + i, 0.6, -6], groups: { member: ['prop'] } });
    const cart = w.spawn({ model: 'cart', body: { type: 'dynamic', mass: 300 }, at: [-8, 0.5, 0], tags: ['cart'], material: { wheel: 'rubber' } });
    const tow = w.spawn({ model: 'crate', body: 'dynamic', at: [-10.2, 0.5, 0], tags: ['tow'] });
    w.joint(cart, tow, w.R.JointData.spherical({ x: -1.2, y: 0.3, z: 0 }, { x: 0.8, y: 0.5, z: 0 }));
    w.spawn({ tags: ['zone'], body: 'fixed', sensor: true, colliders: [{ shape: 'box', half: [2, 2, 2], material: 'air' }], at: [0, 1, 0] });
    ctx.state.marker = w.spawn({ tags: ['marker'], xf: true, at: [0, 2, 0] });
  };
  const tick = (e, dt, ctx) => {
    const w = ctx.world;
    ctx.state.marker.xf.p.x += dt;
    if (e.time.step % 90 === 89) { // the oldest crate goes; a new one takes its pool slot
      const old = w.with('crate')[0], r = e.rng('yard');
      ctx.state.freed = old.xf.slot;
      w.despawn(old);
      ctx.state.reused = w.spawn({ model: 'crate', body: 'dynamic', at: [r.range(-4, 4), 6, r.range(-4, 4)], tags: ['crate'], crate: { i: -1 }, contacts: { min: 1 } }).xf.slot;
    }
  };
  return physGame({
    id: 'yard-replay', build, tick,
    setup: e => { e.events.on(ev => { const s = e.scene.state; if (ev.type === 'contact') s.contacts = (s.contacts ?? 0) + 1; else if (ev.type === 'sensor') s.sensors = (s.sensors ?? 0) + 1; }); },
    state: e => ({ contacts: e.scene.state.contacts ?? 0, sensors: e.scene.state.sensors ?? 0 }),
    commands: { rebuild: (e, d, ctx) => { ctx.world.clear(); build(e, ctx); if (extra) ctx.world.spawn({ model: 'crate', body: 'dynamic', at: [0, 8, 0], tags: ['crate'], crate: { i: 99 } }); } },
  });
}

test('the full scene is deterministic over 600 steps (T-10)', { timeout: 300000 }, () => {
  const r = determinism(makeGame(), { seed: 3, steps: 600 });
  assert.equal(r.ok, true, `first difference at step ${r.step}`);
});
test('the scene exercises what it claims: contacts, sensors, sleeping posts, slot reuse', () => {
  const h = headless(makeGame(), { seed: 3 });
  h.step(120);
  const s = h.scene.state;
  assert.ok(s.contacts > 0 && s.sensors > 0, `contacts ${s.contacts}, sensors ${s.sensors}`);
  assert.ok(h.find('post').every(p => p.body.isSleeping()), 'untouched posts stay asleep (#2)');
  assert.equal(s.reused, s.freed, 'the respawned crate took the freed slot');
  assert.ok(Math.abs(s.marker.xf.p.x - 2) < 1e-9, 'the marker moved 1/60 per step');
  assert.equal(h.state().world.n, h.world.stats.entities);
  h.world.dispose();
});
test('a tape that clears and rebuilds the World replays exactly; ids restart', { timeout: 300000 }, () => {
  const game = makeGame(), h = headless(game, { seed: 3, record: true });
  const cartId = h.one('cart').id;
  h.step(200); h.command('rebuild', {}); h.step(200);
  assert.equal(h.one('cart').id, cartId, 'clear() restarts ids, so the rebuild gives the same ids');
  const tape = h.tape(), end = h.checksum();
  const r = replay(game, tape);
  assert.equal(r.checksum(), end);
  h.world.dispose(); r.world.dispose();
});
test('a game that rebuilds differently fails the replay at a named step', { timeout: 300000 }, () => {
  const h = headless(makeGame(), { seed: 3, record: true });
  h.step(200); h.command('rebuild', {}); h.step(100);
  const tape = h.tape();
  h.world.dispose();
  assert.throws(() => replay(makeGame({ extra: true }), tape), /replay: checksum differs at step (2[0-9]{2}|300)/);
});
