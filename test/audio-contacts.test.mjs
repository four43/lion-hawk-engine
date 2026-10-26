// Contact sounds (H-4): a contact event plays its material pair's sound cue at the contact point, louder with impulse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindContactSounds } from '../src/view/audio/contacts.js';
import { createEvents } from '../src/core/events.js';
import { defineMaterials } from '../src/defs/materials.js';

const setup = (have = ['clang', 'thud', 'crunch']) => {
  const events = createEvents(), played = [];
  const engine = { events, time: { sim: 0 }, world: { materials: defineMaterials({}) } };
  const cues = { has: id => have.includes(id), play: (id, o) => { played.push({ id, ...o }); return {}; } };
  return { engine, cues, played, hit: (o) => { events.emit('contact', { a: 1, b: 2, materials: ['steel', 'steel'], impulse: 10, point: [1, 2, 3], ...o }); events.flush(); } };
};

test('H-4: the pair\'s sound plays at the point with gain from the impulse between min and full', () => {
  const s = setup(); bindContactSounds(s.engine, s.cues, { min: 0, full: 20 });
  s.hit(); s.engine.time.sim = 1; s.hit({ materials: ['steel', 'rubber'], impulse: 40, a: 3 });
  assert.deepEqual(s.played, [{ id: 'clang', gain: 0.5, at: [1, 2, 3] }, { id: 'thud', gain: 1, at: [1, 2, 3] }]); // rubber is softer (M-7)
});
test('H-4: below min, without a cue, or with no materials nothing plays; one null side uses the other material', () => {
  const s = setup(['crunch']); bindContactSounds(s.engine, s.cues);
  s.hit({ impulse: 0.4 }); s.hit(); s.hit({ materials: [null, null], a: 5 });
  s.hit({ materials: [null, 'gravel'], a: 7 });
  assert.deepEqual(s.played.map(p => p.id), ['crunch']);
});
test('H-4: a pair plays again only after gap of engine time without contact; other pairs are independent; off() stops it', () => {
  const s = setup(), off = bindContactSounds(s.engine, s.cues, { gap: 0.1 });
  s.hit(); s.engine.time.sim = 0.05; s.hit(); s.hit({ a: 9 });
  s.engine.time.sim = 0.16; s.hit();
  assert.equal(s.played.length, 3);
  off(); s.engine.time.sim = 5; s.hit(); assert.equal(s.played.length, 3);
});
test('H-4: options and arguments are checked', () => {
  const s = setup();
  assert.throws(() => bindContactSounds({}, s.cues), /^Error: bindContactSounds: engine with events required$/);
  assert.throws(() => bindContactSounds(s.engine, {}), /bindContactSounds: cues from createCues required/);
  assert.throws(() => bindContactSounds(s.engine, s.cues, { min: 5, full: 5 }), /bindContactSounds: need 0 <= min < full/);
});
test('H-4: a body resting on the ground (a contact every step) plays once, then is silent until the pair is quiet for gap', () => {
  const s = setup(); bindContactSounds(s.engine, s.cues, { gap: 0.12 });
  for (let i = 0; i < 120; i++) { s.engine.time.sim = i / 60; s.hit(); }
  assert.equal(s.played.length, 1, 'a resting crate is silent after its landing');
  s.engine.time.sim = 2 + 0.13; s.hit(); assert.equal(s.played.length, 2, 'a new impact after a quiet gap plays');
});
