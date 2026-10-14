import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAudio } from '../src/view/audio/index.js';
import { dom } from './helpers/dom.mjs';
import { audioPage, fakeFetch, flush } from './helpers/fakeAudio.mjs';

test('3g: load fetches at once, decodes once a context exists, and caches by url (#67, Tractor B-8)', async () => {
  const f = fakeFetch({ 'moo.mp3': 300 }), s = audioPage({ fetch: f });
  const p = s.audio.load('moo.mp3'); assert.deepEqual(f.calls, ['moo.mp3']);
  assert.equal(s.audio.load('moo.mp3'), p);
  let done = false; p.then(() => { done = true; });
  await flush(); assert.equal(done, false); // no context yet
  s.fire(); const buf = await p; assert.equal(buf.duration, 0.3); assert.deepEqual(f.calls, ['moo.mp3']);
});
test('3g: a missing file and a bad decode reject with the url; a failed load can be tried again (#67)', async () => {
  const f = fakeFetch({ 'empty.mp3': 0 }), s = audioPage({ fetch: f }); s.fire(); await flush();
  await assert.rejects(s.audio.load('gone.mp3'), /^Error: audio: load 'gone\.mp3' failed \(404\)$/);
  await assert.rejects(s.audio.load('empty.mp3'), /^Error: audio: decode 'empty\.mp3' failed: EncodingError$/);
  await assert.rejects(s.audio.load('gone.mp3'), /404/); assert.deepEqual(f.calls, ['gone.mp3', 'empty.mp3', 'gone.mp3']);
  await assert.rejects(s.audio.load(`data:audio/mp3;base64,${'A'.repeat(200)}`), err => err.message.length < 100 && err.message.includes('...'));
});
test('3g: play is null until audio runs; then source -> gain -> master with rate, loop, when and offset; ended disconnects (#67)', async () => {
  const s = audioPage(), buf = { duration: 1 };
  assert.equal(s.audio.play(buf), null);
  s.fire(); await flush(); s.fa.made[0].currentTime = 2;
  const h = s.audio.play(buf, { gain: 0.5, rate: 1.5, loop: true, when: 0.25, offset: 0.1 }), src = h.source;
  assert.equal(src.buffer, buf); assert.equal(src.loop, true); assert.equal(src.playbackRate.value, 1.5);
  assert.equal(src.out[0], h.gain); assert.equal(h.gain.gain.value, 0.5); assert.equal(h.gain.out[0], s.audio.master);
  assert.deepEqual(src.started, [2.25, 0.1]);
  h.stop(); h.stop(); assert.equal(src.stopped, 2); // a second stop is harmless
  src.onended(); assert.equal(src.disconnected, true); assert.equal(h.gain.disconnected, true);
  assert.equal(s.audio.play(null), null);
});
test('3g: pan adds a stereo panner, clamped to -1..1 (#67)', async () => {
  const s = audioPage(); s.fire(); await flush();
  const h = s.audio.play({}, { pan: 3 }), pn = h.gain.out[0];
  assert.equal(pn.kind, 'panner'); assert.equal(pn.pan.value, 1); assert.equal(pn.out[0], s.audio.master);
  h.source.onended(); assert.equal(pn.disconnected, true);
});
test('3g: positional: Pig Pens\' distance volume from the listener (planar); optional pan from the listener\'s right (#67)', async () => {
  const s = audioPage({ opts: { positional: { pan: 1 } } }); s.fire(); await flush();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 30, 0); cam.updateMatrixWorld();
  assert.equal(s.audio.distanceGain(80, 0, 0), 0.6); // no listener: the cap
  s.audio.listen(cam);
  assert.equal(s.audio.distanceGain(8, 99, 0), 0.6); // 18 / 18 capped at 0.6; y is ignored
  assert.equal(s.audio.distanceGain(80, 0, 0), 0.2);
  assert.equal(s.audio.distanceGain(0, 0, 1000), 0.05);
  const h = s.audio.play({}, { at: [80, 0, 0], gain: 0.5 }); assert.ok(Math.abs(h.gain.gain.value - 0.1) < 1e-12);
  assert.equal(h.gain.out[0].pan.value, 1); // +x is the default camera's right
  assert.equal(s.audio.play({}, { at: { x: -10, y: 0, z: 0 } }).gain.out[0].pan.value, -1);
  const d = audioPage(); d.fire(); await flush(); d.audio.listen(cam);
  assert.equal(d.audio.play({}, { at: [10, 0, 0] }).gain.out[0], d.audio.master); // no pan unless positional.pan is set
});
test('3g: no Web Audio: load rejects with the reason and play returns null (#67)', async t => {
  t.mock.method(console, 'warn', () => {});
  const { window, document } = dom(), audio = createAudio({ doc: document, AudioContext: false, fetch: fakeFetch({ 'a.mp3': 8 }) });
  document.body.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  await assert.rejects(audio.load('a.mp3'), /^Error: audio: no Web Audio \(no AudioContext\)$/);
  assert.equal(audio.play({}), null);
});
