// createLightRig (overview §4.6): Tractor Pickup's rig as defaults, a following shadow box, presets that never change shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLightRig, checkLights } from '../src/view/render/lights.js';

const HOT = /\bnew\s|\.clone\(|\.\.\.|\.slice\(|\.map\(|\.concat\(|\bArray\.from\b/;
const hex = c => '#' + c.getHexString();
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

test('defaults are Tractor Pickup render/scene.js', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  assert.equal(hex(scene.background), '#bfe6f5'); assert.equal(hex(scene.fog.color), '#bfe6f5'); assert.deepEqual([scene.fog.near, scene.fog.far], [90, 220]);
  assert.equal(hex(rig.hemi.color), '#eef7ff'); assert.equal(hex(rig.hemi.groundColor), '#b9a27c'); assert.equal(rig.hemi.intensity, 1.3);
  assert.equal(hex(rig.sun.color), '#fff3dc'); assert.equal(rig.sun.intensity, 2.1); assert.equal(rig.sun.castShadow, true);
  assert.deepEqual([rig.sun.shadow.mapSize.x, rig.sun.shadow.mapSize.y], [2048, 2048]);
  const c = rig.sun.shadow.camera; assert.deepEqual([c.left, c.right, c.top, c.bottom, c.near, c.far], [-30, 30, 30, -30, 5, 120]);
  assert.deepEqual([rig.sun.shadow.bias, rig.sun.shadow.normalBias], [-0.0006, 0.03]);
  assert.ok(scene.children.includes(rig.hemi) && scene.children.includes(rig.sun) && scene.children.includes(rig.sun.target));
});
const TEXEL = 60 / 2048; // the default box (±30) over the default map
test('the shadow box follows a point: the sun at the point plus the offset, aimed at the point (Tractor follow)', () => {
  const rig = createLightRig(new THREE.Scene()), near = (v, a) => v.distanceTo(new THREE.Vector3(...a)) < TEXEL; rig.follow(10, -4);
  assert.ok(near(rig.sun.position, [-16, 46, 18])); assert.ok(near(rig.sun.target.position, [10, 0, -4])); // within a texel (snapped below)
  assert.ok(rig.sun.position.clone().sub(rig.sun.target.position).distanceTo(new THREE.Vector3(-26, 46, 22)) < 1e-9, 'the offset is exact');
  rig.follow(10, -4, 30); // Rally: the shadow box rises with the car (3j request 6)
  assert.ok(near(rig.sun.position, [-16, 76, 18])); assert.ok(near(rig.sun.target.position, [10, 30, -4]));
  rig.set('dusk'); assert.ok(Math.abs(rig.sun.target.position.y - 30) < TEXEL, 'a preset change keeps the followed height');
});
test('box: [x, z] gives Pig Pens\' uneven shadow box', () => {
  const c = createLightRig(new THREE.Scene(), { sun: { box: [38, 36] } }).sun.shadow.camera;
  assert.deepEqual([c.left, c.right, c.top, c.bottom], [-38, 38, 36, -36]);
});
test('set(k) reproduces Tractor setNight(k) through day, dusk and night', () => {
  // Tractor Pickup src/render/scene.js, copied as the reference
  const SKY = new THREE.Color('#bfe6f5'), DAY = SKY.clone(), DUSK = new THREE.Color('#f4a76b'), NIGHT = new THREE.Color('#1b2440');
  const SUN = [new THREE.Color('#fff3dc'), new THREE.Color('#ffa860'), new THREE.Color('#9fb4ff')], sunC = new THREE.Color();
  const mix = (cols, k, out) => k < 0.5 ? out.copy(cols[0]).lerp(cols[1], k * 2) : out.copy(cols[1]).lerp(cols[2], k * 2 - 1);
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  for (const k of [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1]) {
    rig.set(k); mix([DAY, DUSK, NIGHT], k, SKY); mix(SUN, k, sunC);
    for (const ch of ['r', 'g', 'b']) {
      close(scene.background[ch], SKY[ch], `sky ${ch} at ${k}`); close(scene.fog.color[ch], SKY[ch], `fog ${ch} at ${k}`); close(rig.sun.color[ch], sunC[ch], `sun ${ch} at ${k}`);
    }
    close(rig.hemi.intensity, 1.3 - 1.0 * k, `hemi at ${k}`); close(rig.sun.intensity, 2.1 - 1.95 * k, `sun at ${k}`);
    assert.equal(hex(rig.hemi.color), '#eef7ff', 'the hemisphere colour stays');
  }
});
test('a preset change touches no shader-affecting state (fog object, shadows, light set, background object)', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene);
  const shape = () => ({ n: scene.children.length, cast: rig.sun.castShadow, map: rig.sun.shadow.mapSize.x, types: scene.children.map(o => o.type).join() });
  const fog = scene.fog, bg = scene.background, before = shape();
  rig.set('night'); rig.lerp('day', 'dusk', 0.3); rig.set(0.8);
  assert.ok(scene.fog === fog && scene.background === bg, 'the same Fog and background objects'); assert.deepEqual(shape(), before);
});
test('lerp blends named presets; a game preset can move the sun (Rally snow) and the fog', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { presets: { snow: { sky: '#b7c6cc', hemi: 0.85, sun: { intensity: 3.6, offset: [34, 15, 22] }, fog: [60, 330] } } });
  rig.set('snow'); rig.follow(0, 0);
  assert.deepEqual(rig.sun.position.toArray(), [34, 15, 22]); assert.equal(rig.sun.intensity, 3.6); assert.deepEqual([scene.fog.near, scene.fog.far], [60, 330]);
  rig.lerp('day', 'snow', 0.5); close(rig.hemi.intensity, (1.3 + 0.85) / 2, 'hemi halfway'); close(scene.fog.near, 75, 'fog near halfway');
  assert.deepEqual(rig.presets, ['day', 'dusk', 'night', 'snow']);
  assert.throws(() => rig.set('noon'), /lights: unknown preset 'noon' \(known: day, dusk, night, snow\)/);
  assert.throws(() => rig.set(NaN), /lights: set takes a preset name or k in \[0, 1\]/);
});
test('hemiSky is the hemisphere\'s sky colour, apart from the background and fog (3l CI-8); presets blend it', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { sky: '#000000', presets: { night: { hemiSky: '#203050' } } });
  assert.equal(hex(scene.background), '#000000'); assert.equal(hex(rig.hemi.color), '#eef7ff', 'the default, not the sky');
  rig.set('night'); assert.equal(hex(rig.hemi.color), '#203050'); assert.equal(hex(scene.background), '#1b2440', 'night sky from the default preset');
  const own = createLightRig(new THREE.Scene(), { sky: '#112233', hemiSky: '#112233' }); assert.equal(hex(own.hemi.color), '#112233');
});
test('a game day preset overrides the base look and is where the rig starts; flat sun keys are unknown (3l CI-8)', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { presets: { day: { hemi: 1.1, sun: { intensity: 2.4 } } } });
  assert.equal(rig.hemi.intensity, 1.1); assert.equal(rig.sun.intensity, 2.4);
  rig.set(1); rig.set(0); assert.equal(rig.hemi.intensity, 1.1); assert.equal(rig.sun.intensity, 2.4);
  assert.throws(() => checkLights({ presets: { day: { sun: '#fff3dc' } } }), /lights: preset 'day'\.sun must be \{ color, intensity, offset \}/);
  assert.throws(() => checkLights({ presets: { day: { sunIntensity: 2.1 } } }), /lights: preset 'day'\.sunIntensity is unknown/);
});
test('validation names the field: unknown fields, preset fields that would change shaders, fog without fog', () => {
  assert.throws(() => checkLights({ shadow: 1 }), /lights: shadow is unknown/);
  assert.throws(() => checkLights({ sun: { size: 1 } }), /lights: sun\.size is unknown/);
  assert.throws(() => checkLights({ presets: { night: { sun: { map: 512 } } } }), /lights: preset 'night'\.sun\.map is unknown \(presets change colours/);
  assert.throws(() => checkLights({ presets: { night: { castShadow: false } } }), /lights: preset 'night'\.castShadow is unknown/);
  assert.throws(() => checkLights({ fog: false, presets: { dusk: { fog: [10, 20] } } }), /lights: preset 'dusk'\.fog needs lights\.fog/);
  assert.throws(() => checkLights({ fog: [1] }), /lights: fog must be \[near, far\] or false/);
  assert.throws(() => createLightRig(new THREE.Scene(), { shadow: 1 }), /lights: shadow is unknown/);
});
test('fog: false leaves the scene without fog; sun.map: 0 gives a sun without shadows', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene, { fog: false, sun: { map: 0 } });
  assert.ok(scene.fog === null, 'no fog'); assert.equal(rig.sun.castShadow, false); rig.set(1); assert.ok(scene.fog === null, 'still no fog');
});
test('per-frame paths allocate nothing (R-8)', () => {
  const rig = createLightRig(new THREE.Scene());
  for (const f of [rig.follow, rig.lerp, rig.set]) assert.doesNotMatch(f.toString(), HOT);
});
test('dispose takes the lights and the background out of the scene', () => {
  const scene = new THREE.Scene(), rig = createLightRig(scene); rig.dispose();
  assert.equal(scene.children.length, 0); assert.ok(scene.background === null, 'no background');
});
test('the followed shadow box moves in whole shadow-map texels across the light, so shadow edges do not shimmer as the point moves', () => {
  const rig = createLightRig(new THREE.Scene()), z = new THREE.Vector3(-26, 46, 22).normalize();
  const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  for (let i = 0; i < 40; i++) {
    const px = 3 + i * TEXEL * 0.13, pz = -2 + i * TEXEL * 0.07; rig.follow(px, pz, 1);
    const t = rig.sun.target.position, ix = t.dot(x) / TEXEL, iy = t.dot(y) / TEXEL;
    assert.ok(Math.abs(ix - Math.round(ix)) < 1e-6 && Math.abs(iy - Math.round(iy)) < 1e-6, `step ${i}: (${ix}, ${iy}) texels`);
    assert.ok(t.distanceTo(new THREE.Vector3(px, 1, pz)) < TEXEL, 'and stays within a texel of the point');
  }
});
