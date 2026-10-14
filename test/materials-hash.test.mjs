import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMaterials, canonicalJson } from '../src/defs/materials.js';

test('3b: canonicalJson sorts keys at every level and refuses non-JSON values', () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 'x' }], n: null }), '{"a":[1,{"c":"x","d":2}],"b":1,"n":null}');
  assert.throws(() => canonicalJson({ a: NaN }), /cannot hash NaN/);
  assert.throws(() => canonicalJson({ a: () => 1 }), /cannot hash/);
});
test('3b: the registry hash is 8 hex digits and pinned for the base library', () => {
  assert.equal(defineMaterials().hash, '2f4f4f95'); // changes only when ids, phys, pair contact values or the hash rule change (every phys.json re-bakes)
});
test('3b: the hash sees ids, their order, phys and pair friction/restitution; not key order, look, game or cues (ruling 6)', () => {
  const ENTRIES = { x: { extends: 'steel', phys: { friction: 0.6, restitution: 0.2 } }, y: { look: { color: '#808080' }, game: { k: 1 } } };
  const PAIRS = { 'rubber|ice': { friction: 0.1, sound: 'squeal' }, 'x|y': { restitution: 0.4, sound: 's' }, 'steel|ice': { fx: 'frost' } };
  const make = (edit = () => {}) => { const e = structuredClone(ENTRIES), p = structuredClone(PAIRS); edit(e, p); return defineMaterials(e, { pairs: p }).hash; };
  const h = make();
  assert.match(h, /^[0-9a-f]{8}$/);
  const reordered = defineMaterials(
    { x: { phys: { restitution: 0.2, friction: 0.6 }, extends: 'steel' }, y: { game: { k: 1 }, look: { color: '#808080' } } },
    { pairs: { 'ice|steel': { fx: 'frost' }, 'y|x': { sound: 's', restitution: 0.4 }, 'ice|rubber': { sound: 'squeal', friction: 0.1 } } });
  assert.equal(reordered.hash, h, 'key order and pair orientation');
  const same = {
    'game': (e) => { e.y.game.k = 2; },
    'look': (e) => { e.y.look.color = '#ff0000'; },
    'material cue': (e) => { e.x.sound = 'clang'; },
    'material tyre': (e) => { e.x.tire = { mu: 0.9 }; },
    'pair cue': (e, p) => { p['x|y'].sound = 't'; },
    'pair tyre': (e, p) => { p['rubber|ice'].tire = { mu: 0.2 }; },
    'cue-only pair removed': (e, p) => { delete p['steel|ice']; },
  };
  for (const [what, edit] of Object.entries(same)) assert.equal(make(edit), h, what);
  const differs = {
    'ids order': () => defineMaterials({ y: ENTRIES.y, x: ENTRIES.x }, { pairs: PAIRS }).hash,
    'new id': () => make(e => { e.z = {}; }),
    'phys.friction': () => make(e => { e.x.phys.friction = 0.61; }),
    'phys.fill': () => make(e => { e.x.phys.fill = 0.5; }),
    'extends (sg)': () => make(e => { e.x.extends = 'aluminium'; }),
    'pair friction': () => make((e, p) => { p['rubber|ice'].friction = 0.11; }),
    'pair restitution': () => make((e, p) => { p['x|y'].restitution = 0.5; }),
    'pair removed': () => make((e, p) => { delete p['rubber|ice']; }),
  };
  for (const [what, hashOf] of Object.entries(differs)) assert.notEqual(hashOf(), h, what);
});
