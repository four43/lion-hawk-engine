// U-10: glyph roles resolve for every family (or are deliberately absent), and bindGlyphs follows data-lh-input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { glyphFor, familyFor, bindGlyphs, GLYPH_ROLES, GLYPH_FAMILIES } from '../../src/kits/glyphs/view.js';
import { dom } from '../helpers/dom.mjs';

// what each family can show: pads have every role; keys have no shoulder buttons; pointer and touch only confirm
const EXPECT = { xbox: GLYPH_ROLES, ps: GLYPH_ROLES, deck: GLYPH_ROLES, generic: GLYPH_ROLES, keys: ['confirm', 'back', 'menu', 'move'], pointer: ['confirm'], touch: ['confirm'] };

test('every family is covered, every role is an SVG data URI or deliberately absent', () => {
  assert.deepEqual([...GLYPH_FAMILIES].sort(), Object.keys(EXPECT).sort());
  for (const f of GLYPH_FAMILIES) for (const r of GLYPH_ROLES) {
    const u = glyphFor(r, f);
    if (EXPECT[f].includes(r)) assert.match(u, /^data:image\/svg\+xml,%3Csvg/, `${f}.${r}`); else assert.equal(u, null, `${f}.${r} should be absent`);
  }
  assert.notEqual(glyphFor('confirm', 'xbox'), glyphFor('confirm', 'ps'), 'the families have their own art');
  assert.throws(() => glyphFor('jump', 'xbox'), /unknown role 'jump'/);
  assert.throws(() => glyphFor('confirm', 'switch'), /unknown family 'switch'/);
});

test('familyFor: the pad family while the pad is current, else the device', () => {
  assert.equal(familyFor('pad', 'ps'), 'ps');
  assert.equal(familyFor('pad', 'switch'), 'xbox');
  assert.equal(familyFor('keys', 'ps'), 'keys');
  assert.equal(familyFor('touch', null), 'touch');
  assert.equal(familyFor(null, null), 'pointer');
});

test('bindGlyphs: imgs get src, other elements --lh-glyph; roles a family lacks hide; it follows the input', () => {
  const { document } = dom(), html = document.documentElement;
  document.body.innerHTML = '<img data-lh-glyph="confirm" alt=""><img data-lh-glyph="back" alt=""><span data-lh-glyph="next"></span>';
  const [ok, back, next] = document.querySelectorAll('[data-lh-glyph]');
  const g = bindGlyphs(null, { doc: document });
  html.setAttribute('data-lh-input', 'pad'); html.setAttribute('data-lh-pad', 'ps'); g.update();
  assert.equal(ok.getAttribute('src'), glyphFor('confirm', 'ps')); assert.equal(back.hidden, false);
  assert.match(next.style.getPropertyValue('--lh-glyph'), /^url\("data:image\/svg\+xml,/);
  html.setAttribute('data-lh-input', 'touch'); g.update();
  assert.equal(ok.getAttribute('src'), glyphFor('confirm', 'touch')); assert.equal(back.hidden, true); assert.equal(next.hidden, true);
  html.setAttribute('data-lh-input', 'keys'); g.update();
  assert.equal(back.hidden, false); assert.equal(back.getAttribute('src'), glyphFor('back', 'keys')); assert.equal(next.hidden, true);
  g.dispose();
});
