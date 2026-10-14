// A-11: baked animation tables. Layout (frames × parts × 12, Matrix4.elements minus the bottom row), looping, lerp, blend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { decodeAnimTable, sampleAnimTable, blendAnimTable } from '../src/view/assets/animTable.js';
import { makeAnimJson } from './helpers/glb.mjs';

const at = (x, rot = 0) => new Matrix4().compose(new Vector3(x, 2 * x, -x), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rot), new Vector3(1, 1, 1));
const close = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${msg}: element ${i} ${v} vs ${b[i]}`));
// clip 'walk': 3 frames over 3 s; part 0 moves x 0 → 10 → 20 and turns; part 1 sits at x 100
const json = makeAnimJson(['body', 'head'], {
  walk: { dur: 3, frames: [[at(0, 0.3), at(100)], [at(10, 0.6), at(100)], [at(20, 0.9), at(100)]] },
  idle: { dur: 1, frames: [[at(-5), at(-5)]] },
});
const T = decodeAnimTable(json);

test('decode keeps fps, parts and clips; a frame samples back to the matrix the bake wrote (rotation not transposed)', () => {
  assert.equal(T.fps, 30);
  assert.deepEqual([...T.parts], ['body', 'head']);
  assert.deepEqual(Object.keys(T.clips), ['walk', 'idle']);
  const out = new Matrix4();
  assert.equal(sampleAnimTable(T, 'walk', 0, 0, out), out);
  close(out.elements, at(0, 0.3).elements, 'frame 0 part 0');
  close(sampleAnimTable(T, 'walk', 1, 0, out).elements, at(10, 0.6).elements, 'frame 1 part 0');
  close(sampleAnimTable(T, 'walk', 1, 1, out).elements, at(100).elements, 'frame 1 part 1');
});

test('sampling lerps between frames and loops from the last frame back to the first (Pig Pens sampleAnim)', () => {
  const out = new Matrix4(), x = t => sampleAnimTable(T, 'walk', t, 0, out).elements[12];
  assert.ok(Math.abs(x(0.5) - 5) < 1e-5);
  assert.ok(Math.abs(x(2.5) - 10) < 1e-5, 'frame 2 (20) → frame 0 (0)');
  assert.ok(Math.abs(x(3) - 0) < 1e-5);
  assert.ok(Math.abs(x(-0.5) - 10) < 1e-5, 'negative time wraps');
  assert.ok(Math.abs(x(7) - 10) < 1e-5);
  assert.equal(sampleAnimTable(T, 'idle', 0.7, 1, out).elements[12], -5);
  assert.deepEqual([out.elements[3], out.elements[7], out.elements[11], out.elements[15]], [0, 0, 0, 1]);
});

test('blend is A·(1 − k) + B·k', () => {
  const out = new Matrix4(), x = k => blendAnimTable(T, 'idle', 0, 'walk', 1, k, 0, out).elements[12];
  assert.ok(Math.abs(x(0) + 5) < 1e-5);
  assert.ok(Math.abs(x(1) - 10) < 1e-5);
  assert.ok(Math.abs(x(0.25) - -1.25) < 1e-5); // -5 + (10 - -5) * 0.25
});

test('bad tables and bad lookups throw readable errors', () => {
  assert.throws(() => decodeAnimTable({ ...json, v: 2 }), /animTable: v2 is not supported/);
  assert.throws(() => decodeAnimTable({ ...json, clips: { walk: { ...json.clips.walk, frames: 4 } } }), /clip 'walk' has 72 floats, expected 4 frames × 2 parts × 12 = 96/);
  assert.throws(() => decodeAnimTable({ ...json, clips: { walk: { ...json.clips.walk, dur: 0 } } }), /clip 'walk' needs dur > 0/);
  assert.throws(() => sampleAnimTable(T, 'run', 0, 0, new Matrix4()), /no clip 'run' \(has walk, idle\)/);
  assert.throws(() => sampleAnimTable(T, 'walk', 0, 2, new Matrix4()), /part 2 is out of range 0\.\.1/);
});

test("3d's baked pet.anim.json (shared fixture, C7) decodes and samples", () => {
  const pet = JSON.parse(fs.readFileSync(new URL('./fixtures/models/game/baked/models/pet.anim.json', import.meta.url), 'utf8'));
  const P = decodeAnimTable(pet), out = new Matrix4();
  assert.deepEqual([...P.parts], ['body', 'Group', 'leg-left', 'leg-right', 'sock-hat']);
  assert.equal(P.clips.walk.dur, 1); assert.equal(P.clips.walk.frames, 10);
  assert.equal(P.clips.idle.dur, 2); assert.equal(P.clips.idle.frames, 20);
  sampleAnimTable(P, 'walk', 0, 0, out);
  const e = out.elements;
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(Math.hypot(e[c * 4], e[c * 4 + 1], e[c * 4 + 2]) - 1) < 1e-4, `column ${c} is unit length`);
  assert.deepEqual([e[3], e[7], e[11], e[15]], [0, 0, 0, 1]);
});
