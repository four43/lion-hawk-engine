// Voices (H-2): long-lived emitters that follow an object; audio.frame() places them against the listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

const listenerAt = (x, z) => { const c = new THREE.PerspectiveCamera(); c.position.set(x, 30, z); c.updateMatrixWorld(); return c; };

test('H-2: a voice is null before audio runs; then input -> place -> panner -> its bus', async () => {
  const s = audioPage();
  assert.equal(s.audio.voice(), null);
  s.fire(); await flush();
  const v = s.audio.voice({ bus: 'ambience', gain: 0.5 });
  assert.equal(v.input.kind, 'gain'); assert.equal(v.input.gain.value, 0.5);
  const place = v.input.out[0], pn = place.out[0];
  assert.equal(place.kind, 'gain'); assert.equal(pn.kind, 'panner'); assert.equal(pn.out[0], s.audio.bus('ambience'));
  assert.equal(v.audible, true);
  assert.throws(() => s.audio.voice({ bus: 'x' }), /audio\.voice: unknown bus 'x'/);
});
test('H-2: frame() sets a following voice\'s distance gain and pan from the listener', async () => {
  const s = audioPage({ opts: { positional: { pan: 1 } } }); s.fire(); await flush();
  s.audio.listen(listenerAt(0, 0));
  const obj = new THREE.Object3D(); obj.position.set(80, 0, 0);
  const v = s.audio.voice({ follow: obj }), place = v.input.out[0], pn = place.out[0];
  assert.ok(Math.abs(place.gain.value - 0.2) < 1e-12, 'placed at once: 18 / (80 + 10)');
  obj.position.set(-8, 0, 0); s.audio.frame();
  assert.ok(Math.abs(place.gain.value - 0.6) < 1e-12); assert.equal(place.gain.set.at(-1)[2], 0.05); assert.equal(pn.pan.value, -1);
  v.follow = { x: 0, z: 1000 }; s.audio.frame(); assert.equal(place.gain.value, 0.05);
});
test('H-2: beyond positional.cull a voice is silent and not audible; a one-shot there is not played', async () => {
  const s = audioPage({ opts: { positional: { cull: 100 } } }); s.fire(); await flush();
  s.audio.listen(listenerAt(0, 0));
  const v = s.audio.voice({ follow: { x: 150, z: 0 } }), place = v.input.out[0];
  assert.equal(v.audible, false); assert.equal(place.gain.value, 0);
  v.follow = { x: 50, z: 0 }; s.audio.frame(); assert.equal(v.audible, true); assert.ok(place.gain.value > 0);
  assert.equal(s.audio.play({}, { at: [150, 0, 0] }), null);
  assert.ok(s.audio.play({}, { at: [50, 0, 0] }));
});
test('H-2: a voice without follow keeps gain 1 and is always audible', async () => {
  const s = audioPage({ opts: { positional: { cull: 1 } } }); s.fire(); await flush(); s.audio.listen(listenerAt(500, 500));
  const v = s.audio.voice(); s.audio.frame();
  assert.equal(v.input.out[0].gain.value, 1); assert.equal(v.audible, true);
});
test('H-2: stop disconnects a voice once; dispose stops every voice; frame after dispose does nothing', async () => {
  const s = audioPage(); s.fire(); await flush();
  const a = s.audio.voice({ follow: { x: 1, z: 1 } }), b = s.audio.voice();
  const place = a.input.out[0];
  a.stop(); a.stop(); assert.equal(a.stopped, true); assert.equal(a.input.disconnected, true); assert.equal(place.disconnected, true);
  s.audio.dispose(); assert.equal(b.stopped, true);
  s.audio.frame();
});
