import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getIO, applyRenames } from '../tools/bake/read.js';
import { classify } from '../tools/bake/conventions.js';
import { animTable } from '../tools/bake/animTable.js';
import { MODELS, model, boxGeom } from './fixtures/models/make.mjs';
import REGISTRY from './fixtures/models/game/materials.js';

const RENAME = { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } };
async function table(m, opts) {
  const doc = await (await getIO()).readBinary(await m.bytes());
  applyRenames(doc, RENAME);
  const cls = classify(doc, 'pet', { registry: REGISTRY });
  return animTable(doc, 'pet', [...cls.parts, ...cls.socks.map(s => ({ node: s.node, name: `sock-${s.name}` }))], opts);
}
const decode = b64 => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer);

test('3d: anim table rows are the parts then sock-* rows; frames = round(dur × fps), dur from the samplers', async () => {
  const t = await table(MODELS.pet(), { fps: 10, clips: ['walk', 'idle'] });
  assert.equal(t.v, 1); assert.equal(t.fps, 10);
  assert.deepEqual(t.parts, ['body', 'Group', 'leg-left', 'leg-right', 'sock-hat']);
  assert.deepEqual(Object.keys(t.clips), ['walk', 'idle']);
  assert.deepEqual([t.clips.walk.dur, t.clips.walk.frames, t.clips.idle.dur, t.clips.idle.frames], [1, 10, 2, 20]);
  assert.equal(decode(t.clips.walk.data).length, 10 * 5 * 12);
  const all = await table(MODELS.pet(), { fps: 30, clips: null });
  assert.deepEqual(Object.keys(all.clips), ['walk', 'idle']);                 // null: every clip, document order
});
test('3d: every row equals three.js AnimationMixer on the source GLB (slerp, STEP at a key time, parents included)', async () => {
  const t = await table(MODELS.pet(), { fps: 10, clips: ['walk', 'idle'] });
  const bytes = await MODELS.pet().bytes(), buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let worst = 0;
  for (const [name, clip] of Object.entries(t.clips)) {
    mixer.stopAllAction(); mixer.clipAction(gltf.animations.find(a => a.name === name)).play();
    const data = decode(clip.data);
    for (let f = 0; f < clip.frames; f++) {
      mixer.setTime(f / clip.frames * clip.dur); gltf.scene.updateMatrixWorld(true);
      t.parts.forEach((part, r) => {
        const e = gltf.scene.getObjectByName(part === 'sock-hat' ? 'hat' : part).matrixWorld.elements;
        for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(e[c * 4 + k] - data[(f * t.parts.length + r) * 12 + c * 3 + k]));
      });
    }
  }
  assert.ok(worst < 1e-5, `worst element error ${worst}`);
});
test('3d: a missing clip and CUBICSPLINE samplers fail with the model and clip', async () => {
  await assert.rejects(table(MODELS.pet(), { fps: 30, clips: ['walk', 'fly'] }), /bake: pet: animation 'fly' missing \(animTable\.clips\)/);
  const m = model(); m.node('body', { mesh: m.mesh('b', [[boxGeom([1, 1, 1]), 'wood']]) });
  m.animate('spin', 'body', 'translation', [[0, [0, 0, 0, 0, 0, 0, 0, 0, 0]], [1, [0, 0, 0, 0, 1, 0, 0, 0, 0]]], 'CUBICSPLINE');
  await assert.rejects(table(m, { fps: 30, clips: null }), /bake: pet: animation 'spin' uses CUBICSPLINE/);
});
