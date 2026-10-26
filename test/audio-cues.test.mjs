// Cues (H-3): named sounds with clip and jitter variations from an rng stream, cooldowns and voice limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCues } from '../src/view/audio/cues.js';
import { rng } from '../src/core/rng.js';
import { audioPage, fakeFetch, flush } from './helpers/fakeAudio.mjs';

const files = fakeFetch({ 'a.mp3': 500, 'b.mp3': 700, 'c.mp3': 200 });
const seq = vals => { let i = 0; return { next: () => vals[i++ % vals.length] }; };
const ready = async (defs, r = rng(1)) => { const s = audioPage({ fetch: files }); const cues = createCues(s.audio, defs, { rng: r }); s.fire(); await cues.ready; return { s, cues }; };

test('H-3: play is null before audio runs or before the clips decode; has() names the cues', async () => {
  const s = audioPage({ fetch: files }), cues = createCues(s.audio, { clang: { src: 'a.mp3' } }, { rng: rng(1) });
  assert.equal(cues.has('clang'), true); assert.equal(cues.has('thud'), false);
  assert.equal(cues.play('clang'), null);
  s.fire(); await flush(); await cues.ready;
  assert.ok(cues.play('clang'));
  assert.throws(() => cues.play('thud'), /^Error: cues\.play: unknown cue 'thud'$/);
});
test('H-3: a clip is picked by the rng; gain and rate jitter around the def and the call', async () => {
  const { s, cues } = await ready({ hit: { src: ['a.mp3', 'b.mp3'], gain: 0.5, gainJitter: 0.2, rate: 1.2, rateJitter: 0.1, bus: 'ui' } }, seq([0.75, 1, 0]));
  const h = cues.play('hit', { gain: 2 });
  assert.equal(h.source.buffer.duration, 0.7, 'pick 0.75 -> b'); // 0.75 * 2 = 1.5 -> index 1
  assert.ok(Math.abs(h.gain.gain.value - 0.5 * 2 * 1.2) < 1e-12, 'gain jitter +0.2 at r = 1');
  assert.ok(Math.abs(h.source.playbackRate.value - 1.2 * 0.9) < 1e-12, 'rate jitter -0.1 at r = 0');
  assert.equal(h.gain.out[0], s.audio.bus('ui'));
});
test('H-3: cooldown drops plays closer than it on the context clock', async () => {
  const { s, cues } = await ready({ step: { src: 'c.mp3', cooldown: 0.1 } }), c = s.fa.made[0];
  assert.ok(cues.play('step')); c.currentTime = 0.05; assert.equal(cues.play('step'), null); c.currentTime = 0.11; assert.ok(cues.play('step'));
});
test('H-3: at max concurrent plays the oldest still playing is stopped; finished ones do not count', async () => {
  const { s, cues } = await ready({ ring: { src: 'a.mp3', max: 2 } }), c = s.fa.made[0];
  const a = cues.play('ring'), b = cues.play('ring'), d = cues.play('ring');
  assert.equal(a.source.stopped, 0); assert.equal(b.source.stopped, null); assert.ok(d);
  c.currentTime = 10; const e = cues.play('ring'), f = cues.play('ring');
  assert.equal(b.source.stopped, null, 'b ended long ago: not stopped again'); assert.equal(e.source.stopped, null); assert.ok(f);
});
test('H-3: defs are checked', () => {
  const s = audioPage({ fetch: files }), r = rng(1);
  assert.throws(() => createCues(s.audio, { x: { src: 'a.mp3' } }), /^Error: createCues: rng with next\(\) required \(pass engine\.rng\('fx'\)\)$/);
  assert.throws(() => createCues(s.audio, { x: {} }, { rng: r }), /createCues: cue 'x': src must be a url or a non-empty list of urls/);
  assert.throws(() => createCues(s.audio, { x: { src: 'a.mp3', volume: 1 } }, { rng: r }), /createCues: cue 'x' has no 'volume' \(src, gain, gainJitter, rate, rateJitter, bus, cooldown, max\)/);
  assert.throws(() => createCues(s.audio, { x: { src: 'a.mp3', max: 0 } }, { rng: r }), /createCues: cue 'x': max must be an integer >= 1/);
  assert.throws(() => createCues(s.audio, { x: { src: 'a.mp3', bus: 'nope' } }, { rng: r }), /audio\.bus: unknown bus 'nope'/);
});
test('H-3: a clip that fails to load rejects ready; the cue still plays its other clips', async () => {
  const s = audioPage({ fetch: files }), cues = createCues(s.audio, { mix: { src: ['a.mp3', 'gone.mp3'] } }, { rng: seq([0.9, 0.1]) });
  s.fire(); await assert.rejects(cues.ready, /gone\.mp3/); await flush(); // the 404 can reject before a.mp3 decodes
  assert.equal(cues.play('mix').source.buffer.duration, 0.5);
});
