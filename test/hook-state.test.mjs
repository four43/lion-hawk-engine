// [D-4] window.engine state calls: query, checksum, snapshot, restore and policies. A snapshot needs a recording page
// (?lh-test&lh-record); restore reloads the page with ?replay=session, and boot replays the tape before anything else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, installEngine, boot, defineView, parseFlags } from '../src/index.view.js';
import { checksum } from '../src/core/checksum.js';
import { dom } from './helpers/dom.mjs';
import game from './fixtures/countdown.js';
import { physGame } from './fixtures/phys/game.js';

const raf = () => 0, caf = () => {};
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const page = (search, { sessionStorage = store(), g = game } = {}) => {
  const { document } = dom(), replaced = [];
  const target = { document, addEventListener() {}, sessionStorage, location: { search, href: `http://localhost/game.html${search}`, replace: u => replaced.push(u) } };
  const app = boot(g, defineView({ scenes: {} }), { doc: document, target, raf, caf, flags: parseFlags(search) });
  return { app, h: target.engine, target, replaced, sessionStorage };
};

test('query finds entities by tag or net kind and returns JSON-safe summaries (D-4)', () => {
  const g = physGame({ physics: null, build: e => {
    e.world.spawn({ tags: ['pig'], mood: 2, net: 'animal', netId: 12, xf: true, at: [1, 2, 3], fn() {}, deep: { a: 1 } });
    e.world.spawn({ tags: ['pig', 'piglet'], mood: 5 });
    e.world.spawn({ tags: ['rock'] });
  } });
  const engine = createEngine(g), target = {};
  installEngine(engine, { driver: {}, target });
  const pigs = target.engine.query('pig');
  assert.doesNotThrow(() => JSON.stringify(pigs));
  assert.equal(pigs.length, 2);
  assert.deepEqual(pigs[0], { id: pigs[0].id, tags: ['pig'], net: 'animal', netId: 12, mood: 2, p: { x: 1, y: 2, z: 3 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  assert.equal(pigs[1].p, undefined, 'no pose without xf');
  assert.deepEqual(target.engine.query('pig', { mood: 5 }).map(e => e.tags), [['pig', 'piglet']]);
  assert.deepEqual(target.engine.query('animal').map(e => e.netId), [12], 'a net kind matches too');
  assert.equal(target.engine.query(null).length, 3, 'null: every entity');
  assert.deepEqual(target.engine.query('pig', e => e.mood > 3).map(e => e.mood), [5]);
  assert.deepEqual(createEngine(game) && (() => { const t = {}; installEngine(createEngine(game), { driver: {}, target: t }); return t.engine.query('pig'); })(), [], 'no World: none');
});
test('checksum and policies', () => {
  const engine = createEngine(game), target = {};
  installEngine(engine, { driver: {}, target });
  engine.stepN(3);
  assert.equal(target.engine.checksum(), checksum(engine.state()));
  assert.deepEqual(Object.keys(target.engine.policies), ['floor']);
});
test('snapshot needs a recording page; without ?lh-record it says how to get one', () => {
  const { h, app } = page('?lh-test');
  assert.throws(() => h.snapshot(), /engine: snapshot needs a recording page \(\?lh-test&lh-record\)/);
  app.dispose();
});
test('restore reloads with ?replay=session, and the booted page replays the tape to the snapshot', () => {
  const a = page('?lh-test&lh-record&seed=4');
  a.h.ui.tap('title.play'); a.h.stepN(200); a.h.command('nudge', { dx: 2 }); a.h.input.set({ throttle: 1 }); a.h.stepN(40);
  const snap = a.h.snapshot(), sum = a.h.checksum();
  assert.doesNotThrow(() => JSON.stringify(snap)); assert.equal(snap.step, 240);
  a.h.stepN(50);
  a.h.restore(snap);
  assert.deepEqual(a.replaced, ['http://localhost/game.html?lh-test&lh-record&seed=4&replay=session']);
  assert.ok(a.sessionStorage.getItem('lh-replay'));
  a.app.dispose();
  const b = page('?lh-test&lh-record&seed=4&replay=session', { sessionStorage: a.sessionStorage });
  assert.equal(b.h.checksum(), sum); assert.equal(b.h.time.step, 240); assert.deepEqual(b.h.errors, []);
  assert.equal(b.sessionStorage.getItem('lh-replay'), null, 'used once');
  assert.equal(b.h.snapshot().step, 240, 'still recording: it can snapshot again');
  b.app.dispose();
});
test('a replay that does not reach the snapshot, or a missing one, lands in errors', () => {
  const s = store();
  const none = page('?lh-test&replay=session', { sessionStorage: s });
  assert.match(none.h.errors[0].message, /engine: \?replay=session but no snapshot in sessionStorage/); none.app.dispose();
  const a = page('?lh-test&lh-record'); a.h.ui.tap('title.play'); a.h.stepN(10);
  const snap = a.h.snapshot(); a.app.dispose();
  s.setItem('lh-replay', JSON.stringify({ ...snap, checksum: 'deadbeef' }));
  const bad = page('?lh-test&replay=session', { sessionStorage: s });
  assert.match(bad.h.errors[0].message, /engine: replay=session: the replayed state differs from the snapshot \(checksum [0-9a-f]+ vs deadbeef\)/);
  bad.app.dispose();
  assert.throws(() => createEngine(game) && (() => { const t = {}; installEngine(createEngine(game), { driver: {}, target: t }); t.engine.restore({ v: 9 }); })(), /engine: restore: not a snapshot/);
});
