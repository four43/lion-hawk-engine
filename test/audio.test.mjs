import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/view/audio/index.js';
import { dom } from './helpers/dom.mjs';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

test('3g: no context before a gesture; the first pointerup makes one, resumes it and fires onUnlock once (#67)', async () => {
  const s = audioPage(), got = [];
  s.audio.onUnlock(a => got.push(a.ctx.state));
  assert.equal(s.audio.ctx, null); assert.equal(s.audio.master, null); assert.equal(s.audio.unlocked, false);
  s.fire('pointerup'); await flush();
  assert.equal(s.fa.made.length, 1); assert.equal(s.audio.ctx, s.fa.made[0]); assert.equal(s.audio.unlocked, true); assert.deepEqual(got, ['running']);
  s.fire('keydown'); s.fire('click'); await flush();
  assert.equal(s.fa.made.length, 1); assert.equal(s.fa.made[0].resumes, 1); assert.deepEqual(got, ['running']); // not listening once running
});
test('3g: master -> mute gain -> limiter -> destination, with Tractor\'s limiter and the game volume (#67, R-8)', async () => {
  const s = audioPage({ opts: { volume: 0.4 } }); s.fire(); await flush();
  const m = s.audio.master; assert.equal(m.kind, 'gain'); assert.equal(m.gain.value, 0.4);
  const mg = m.out[0]; assert.equal(mg.kind, 'gain'); assert.equal(mg.gain.value, 1);
  const lim = mg.out[0]; assert.equal(lim.kind, 'compressor');
  assert.deepEqual([lim.threshold.value, lim.knee.value, lim.ratio.value, lim.attack.value, lim.release.value], [-14, 24, 4, 0.005, 0.2]);
  assert.equal(lim.out[0], s.fa.made[0].destination);
});
test('3g: ?mute starts muted; mute() ramps the mute gain and never touches the game\'s master (#67)', async () => {
  const s = audioPage({ flags: { mute: true } }); assert.equal(s.audio.muted, true);
  s.fire(); await flush();
  const mg = s.audio.master.out[0]; assert.equal(mg.gain.value, 0);
  assert.equal(s.audio.mute(false), false); assert.equal(mg.gain.value, 1); assert.equal(mg.gain.set.at(-1)[2], 0.02);
  s.audio.mute(true); assert.equal(mg.gain.value, 0); assert.equal(s.audio.master.gain.value, 0.55);
  const t = audioPage(); t.audio.mute(true); t.fire(); await flush(); assert.equal(t.audio.master.out[0].gain.value, 0); // muted before the context exists
});
test('3g: a refused resume keeps listening; onGesture runs inside every gesture until audio runs (#67, iOS)', async () => {
  const s = audioPage({ fake: { refuse: true } }), gest = [], unl = [];
  s.audio.onGesture(() => gest.push(s.audio.ctx?.state ?? null)); s.audio.onUnlock(() => unl.push(1));
  s.fire('pointerdown'); await flush();
  assert.equal(s.audio.unlocked, false); assert.deepEqual(unl, []);
  s.fa.AudioContext.refuse = false; s.fire('touchend'); await flush();
  assert.equal(s.audio.unlocked, true); assert.deepEqual(unl, [1]);
  s.fire('pointerup'); await flush();
  assert.deepEqual(gest, [null, 'suspended']); // the first gesture's callbacks run before the context exists
  assert.equal(s.fa.made[0].resumes, 2);
});
test('3g: no Web Audio: the first gesture warns once and stops listening (#67)', async t => {
  const warns = []; t.mock.method(console, 'warn', (...a) => warns.push(a[0]));
  const { window, document } = dom(), audio = createAudio({ doc: document, AudioContext: false });
  document.body.dispatchEvent(new window.Event('pointerup', { bubbles: true })); document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(warns, ['audio: no Web Audio']); assert.equal(audio.ctx, null); assert.equal(audio.unlocked, false);
});
test('3g: onUnlock after the unlock runs at once; off() drops a pending one; non-functions throw (#67)', async () => {
  const s = audioPage(), got = [];
  const off = s.audio.onUnlock(() => got.push('a')); s.audio.onUnlock(() => got.push('b')); off();
  s.fire(); await flush(); assert.deepEqual(got, ['b']);
  s.audio.onUnlock(() => got.push('c')); assert.deepEqual(got, ['b', 'c']);
  assert.throws(() => s.audio.onUnlock(1), /function required/); assert.throws(() => s.audio.onGesture(), /function required/);
  assert.throws(() => createAudio({ doc: {} }), /doc required/);
});
