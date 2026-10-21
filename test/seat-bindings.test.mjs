// test/seat-bindings.test.mjs
// [C-12], [C-13]: player-mappable bindings, profiles in localStorage, capture (plan 2026-10-21-local-players-2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pad, memory, XBOX, DUALSENSE } from './helpers/seats.mjs';

const DRIVE = {
  pads: [{ match: p => p.mapping === 'standard', bindings: { buttons: { 6: ['brake', 1], 7: ['gas', 1] } }, mappable: { Brake: 'button:6', Gas: 'button:7' } }],
  keys: { all: { bindings: { s: ['brake', 1], w: ['gas', 1] }, mappable: { Brake: 's' } } },
};
const KEY = 'lh.bindings.seats.Player 1';
const ready = storage => {
  const t = setup({ storage }), lp = t.seats.list[0];
  t.seats.context('drive', DRIVE); lp.contexts.add('drive');
  t.slots[0] = pad(0); t.frame();
  return { ...t, lp, dev: lp.devices[2], keys: lp.devices[0] };
};
const press = (t, i, down) => { t.slots[i] = pad(i, { id: t.slots[i].id, down }); t.frame(); t.e.stepN(1); return t.e.input.snapshot; };

test('a mappable binding moves for that device and is saved under lh.bindings.<game>.<profile> (C-12, C-13)', () => {
  const store = memory(), t = ready(store), { lp, dev } = t;
  assert.equal(lp.bindings.profile, 'Player 1'); assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  lp.bindings.map('Brake', dev, 'button:4');
  assert.deepEqual(JSON.parse(store.m.get(KEY)), { [`pad:${XBOX}`]: { Brake: 'button:4' } });
  assert.equal(lp.bindings.get('Brake', dev), 'button:4');
  assert.equal(press(t, 0, [4]).brake, 1);
  assert.equal(press(t, 0, [6]).brake, 0, 'the default input no longer brakes');
});

test('overrides are per device id: another pad model keeps its defaults (review focus)', () => {
  const t = ready(memory()), { lp, dev } = t;
  t.slots[1] = pad(1, { id: DUALSENSE }); t.frame();
  lp.bindings.map('Brake', dev, 'button:4');
  const ds = lp.devices[3];
  assert.equal(lp.bindings.get('Brake', ds), 'button:6');
  assert.equal(press(t, 1, [6]).brake, 1, 'the DualSense still brakes on 6');
});

test('a new page reads the saved profile; another profile starts from defaults; reset drops overrides (C-13)', () => {
  const store = memory();
  { const first = ready(store); first.lp.bindings.map('Brake', first.dev, 'button:4'); }
  const { lp, dev } = ready(store); // a second page on the same storage
  assert.equal(lp.bindings.get('Brake', dev), 'button:4', 'a reload keeps the mapping');
  lp.bindings.profile = 'Sam'; assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  lp.bindings.profile = 'Player 1'; assert.equal(lp.bindings.get('Brake', dev), 'button:4');
  lp.bindings.reset('Brake'); assert.equal(lp.bindings.get('Brake', dev), 'button:6');
  assert.deepEqual(JSON.parse(store.m.get(KEY)), { [`pad:${XBOX}`]: {} });
  lp.bindings.map('Gas', dev, 'button:5'); lp.bindings.reset();
  assert.deepEqual(JSON.parse(store.m.get(KEY)), {});
  assert.throws(() => { lp.bindings.profile = ''; }, /bindings.profile: must be a non-empty string/);
});

test('storage that throws or holds junk falls back to defaults and never throws (review focus)', () => {
  const bad = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  const t = ready(bad);
  assert.equal(t.lp.bindings.get('Brake', t.dev), 'button:6');
  t.lp.bindings.map('Brake', t.dev, 'button:4');
  assert.equal(press(t, 0, [4]).brake, 1, 'the mapping still holds for this page');
  const junk = memory(); junk.setItem(KEY, '{nope');
  const j = ready(junk); assert.equal(j.lp.bindings.get('Brake', j.dev), 'button:6');
  const odd = memory(); odd.setItem(KEY, JSON.stringify({ [`pad:${XBOX}`]: { Brake: 5, Gas: 'axis:3' }, 'keys:all': [1] }));
  const o = ready(odd);
  assert.equal(o.lp.bindings.get('Brake', o.dev), 'button:6'); assert.equal(o.lp.bindings.get('Gas', o.dev), 'button:7', 'a saved axis for a button binding is skipped');
  assert.equal(press(o, 0, [7]).gas, 1);
  assert.doesNotThrow(() => ready(null));
});

test('storage left undefined uses window.localStorage inside try and works when it is missing (S2)', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    delete globalThis.window; assert.doesNotThrow(() => ready(undefined));
    const store = memory(); globalThis.window = { localStorage: store };
    const t = ready(undefined); t.lp.bindings.map('Brake', t.dev, 'button:4');
    assert.ok(store.m.has(KEY), 'saved through window.localStorage');
    globalThis.window = { get localStorage() { throw new Error('SecurityError'); } };
    assert.doesNotThrow(() => ready(undefined));
  } finally { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; }
});

test("map rejects a device the seat does not hold, an unknown name and an input of another kind; keys lower-case (C-12)", () => {
  const { lp, dev, keys } = ready(memory());
  assert.throws(() => lp.bindings.map('Clutch', dev, 'button:4'), /bindings.map: no mappable binding 'Clutch' for this device/);
  assert.throws(() => lp.bindings.map('Brake', dev, 'axis:2'), /bindings.map: 'Brake' is on button:6; "axis:2" is not the same kind of input/);
  lp.bindings.map('Brake', keys, 'Q'); assert.equal(lp.bindings.get('Brake', keys), 'q');
  lp.release(dev);
  assert.throws(() => lp.bindings.map('Brake', dev, 'button:4'), /bindings: seat 0 does not hold that device/);
});

test("capture resolves with the next input of this seat's own devices; cancel resolves null (C-13)", async () => {
  const t = setup(), { e, seats, slots, frame, key } = t; seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  slots[0] = pad(0); slots[1] = pad(1); frame();
  const [s0, s1] = seats.list;
  let got; const p = s1.bindings.capture(); p.then(v => { got = v; });
  slots[0] = pad(0, { down: [3] }); frame(); await Promise.resolve();
  assert.equal(got, undefined, "another seat's pad does not answer");
  slots[1] = pad(1, { down: [3] }); frame();
  assert.deepEqual(await p, { device: s1.devices[0], input: 'button:3' });
  const q = s1.bindings.capture(); slots[1] = pad(1, { axes: [0, 0, -0.9, 0] }); frame();
  assert.deepEqual(await q, { device: s1.devices[0], input: 'axis:2' });
  const k = s0.bindings.capture(); key('keydown', 'Q');
  assert.deepEqual(await k, { device: s0.devices[0], input: 'q' });
  const c = s0.bindings.capture(); const d = s0.bindings.capture();
  assert.equal(await c, null, 'a second capture ends the first'); s0.bindings.cancel(); assert.equal(await d, null);
});

test('a seat that leaves while a capture is pending resolves it null (N7)', async () => {
  const t = setup(), { e, seats, slots, frame } = t; seats.enable();
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { down: [0] }); frame(); e.stepN(1); frame();
  const s1 = seats.list[1], p = s1.bindings.capture();
  s1.leave();
  assert.equal(await p, null);
});
