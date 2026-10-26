// Mixer buses (H-1): named gain nodes into master, per-bus volume, ducking, and plays routed by bus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

test('H-1: each bus is a gain into master once audio runs; null before', async () => {
  const s = audioPage();
  assert.equal(s.audio.bus('sfx'), null);
  s.fire(); await flush();
  for (const b of ['sfx', 'music', 'ui', 'voice', 'ambience']) { const g = s.audio.bus(b); assert.equal(g.kind, 'gain'); assert.equal(g.out[0], s.audio.master); assert.equal(g.gain.value, 1); }
  assert.throws(() => s.audio.bus('fx'), /^Error: audio\.bus: unknown bus 'fx' \(sfx, music, ui, voice, ambience\)$/);
});
test('H-1: volume is kept before the context exists and applied when it is made; master is the game volume', async () => {
  const s = audioPage();
  assert.equal(s.audio.volume('music', 0.25), 0.25); assert.equal(s.audio.volume('master', 0.4), 0.4);
  s.fire(); await flush();
  assert.equal(s.audio.bus('music').gain.value, 0.25); assert.equal(s.audio.master.gain.value, 0.4);
  s.audio.volume('music', 0.5); assert.equal(s.audio.bus('music').gain.value, 0.5); assert.equal(s.audio.bus('music').gain.set.at(-1)[2], 0.02);
  assert.equal(s.audio.volume('music'), 0.5);
  assert.throws(() => s.audio.volume('music', -1), /^Error: audio\.volume: volume must be a number >= 0 \(got -1\)$/);
  assert.throws(() => s.audio.volume('drums', 1), /audio\.volume: unknown bus 'drums'/);
});
test('H-1: duck multiplies a bus down until undone; two ducks stack; undo twice is harmless', async () => {
  const s = audioPage(); s.fire(); await flush();
  const m = s.audio.bus('music'); s.audio.volume('music', 0.8);
  const a = s.audio.duck('music', { to: 0.5, attack: 0.03 }); assert.ok(Math.abs(m.gain.value - 0.4) < 1e-12); assert.ok(Math.abs(m.gain.set.at(-1)[2] - 0.01) < 1e-12);
  const b = s.audio.duck('music', { to: 0.5 }); assert.ok(Math.abs(m.gain.value - 0.2) < 1e-12);
  a(); a(); assert.ok(Math.abs(m.gain.value - 0.4) < 1e-12);
  b(); assert.ok(Math.abs(m.gain.value - 0.8) < 1e-12);
});
test('H-1: play routes to its bus, sfx by default; an unknown bus throws even before audio runs', async () => {
  const s = audioPage();
  assert.throws(() => s.audio.play({}, { bus: 'nope' }), /audio\.play: unknown bus 'nope'/);
  s.fire(); await flush();
  assert.equal(s.audio.play({}).gain.out[0], s.audio.bus('sfx'));
  assert.equal(s.audio.play({}, { bus: 'ui' }).gain.out[0], s.audio.bus('ui'));
});
test('H-1: buses are configurable; master and repeats are refused', () => {
  const s = audioPage({ opts: { buses: ['sfx', 'music'] } });
  assert.throws(() => s.audio.volume('ui', 1), /unknown bus 'ui' \(sfx, music\)/);
  assert.throws(() => audioPage({ opts: { buses: ['sfx', 'master'] } }), /createAudio: buses must be distinct names other than 'master'/);
  assert.throws(() => audioPage({ opts: { buses: ['sfx', 'sfx'] } }), /createAudio: buses must be distinct/);
});
