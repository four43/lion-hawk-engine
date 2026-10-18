// U-8: the navigator's scorer over fixture rects (decision 10: the position logic carries the tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNeighbour, NAV_DIRS } from '../src/core/navScore.js';

const R = (x, y, w = 100, h = 40) => ({ x, y, w, h });
// walks: from index i, each step a direction; returns the indices visited (stopping at -1)
const walk = (rects, i, dirs) => dirs.map(d => (i = i < 0 ? -1 : pickNeighbour(i, d, rects)));

test('a column moves one step per push and stops at both ends (no wrap)', () => {
  const col = [R(0, 0), R(0, 50), R(0, 100), R(0, 150)];
  assert.deepEqual(walk(col, 0, ['down', 'down', 'down', 'down']), [1, 2, 3, -1]);
  assert.equal(pickNeighbour(0, 'up', col), -1);
  assert.equal(pickNeighbour(3, 'up', col), 2);
  assert.equal(pickNeighbour(1, 'left', col), -1);
  assert.equal(pickNeighbour(1, 'right', col), -1);
});

test('a row moves left and right and stops at both ends', () => {
  const row = [R(0, 0), R(110, 0), R(220, 0)];
  assert.deepEqual(walk(row, 0, ['right', 'right', 'right']), [1, 2, -1]);
  assert.deepEqual(walk(row, 2, ['left', 'left', 'left']), [1, 0, -1]);
  assert.equal(pickNeighbour(1, 'up', row), -1);
});

test('a 3x3 grid keeps the column going down and the row going across', () => {
  const g = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.push(R(c * 110, r * 50));
  assert.deepEqual(walk(g, 1, ['down', 'down', 'down']), [4, 7, -1]);
  assert.deepEqual(walk(g, 3, ['right', 'right', 'right']), [4, 5, -1]);
  assert.equal(pickNeighbour(4, 'up', g), 1);
  assert.equal(pickNeighbour(4, 'left', g), 3);
  assert.equal(pickNeighbour(8, 'down', g), -1); // bottom-right corner: no wrap to the top
  assert.equal(pickNeighbour(8, 'right', g), -1);
});

test('a lined-up candidate beats a nearer one that is off to the side', () => {
  // from A, down: B is directly below but further; C is closer but shifted well right
  const rects = [R(0, 0), R(0, 200), R(300, 60)];
  assert.equal(pickNeighbour(0, 'down', rects), 1);
});

test('among lined-up candidates the nearest wins; equal ones go to document order', () => {
  const rects = [R(0, 0), R(0, 150), R(0, 60)];
  assert.equal(pickNeighbour(0, 'down', rects), 2);
  const twins = [R(100, 0), R(50, 60), R(150, 60)]; // both overlap A's x-range by the same amount, centres equally offset
  assert.equal(pickNeighbour(0, 'down', twins), 1);
});

test("Rally's title: full-width choice rows above a footer (Settings, a best-time text, Drive)", () => {
  // segmented rows fill the sheet's width; the footer has Settings on the left and Drive on the right, the best time
  // (text, not a candidate) between them
  const rects = [
    R(0, 0, 118, 30), R(121, 0, 118, 30), R(242, 0, 118, 30), // 0..2  Mode: free / stage / time attack
    R(0, 40, 178, 30), R(182, 40, 178, 30),                   // 3..4  Car: awd / rwd
    R(0, 100, 90, 44), R(240, 100, 120, 44),                  // 5 Settings, 6 Drive
  ];
  assert.equal(pickNeighbour(3, 'down', rects), 5);
  assert.equal(pickNeighbour(4, 'down', rects), 6);
  assert.equal(pickNeighbour(2, 'down', rects), 4);
  assert.equal(pickNeighbour(5, 'right', rects), 6);          // across the footer, never up into a row
  assert.equal(pickNeighbour(6, 'left', rects), 5);
  assert.equal(pickNeighbour(6, 'up', rects), 4);
  assert.equal(pickNeighbour(5, 'up', rects), 3);
  assert.equal(pickNeighbour(6, 'down', rects), -1);
  assert.equal(pickNeighbour(6, 'right', rects), -1);
});

test('nothing lines up: a candidate inside the 45° cone is taken, one outside it is not', () => {
  const from = R(240, 100, 120, 44);
  assert.equal(pickNeighbour(from, 'up', [R(150, 0, 70, 30)]), 0);    // gap 70, 20 off to the side
  assert.equal(pickNeighbour(from, 'up', [R(75, 40, 70, 30)]), -1);   // gap 30, 95 off to the side
  // a lined-up candidate wins even when an off-line one is nearer
  assert.equal(pickNeighbour(from, 'up', [R(200, 60, 30, 30), R(260, 0, 60, 30)]), 1);
});

test('Settings -> right with a choice button up and to the right does not leave the footer', () => {
  const rects = [R(75, 40, 70, 30), R(0, 100, 90, 44), R(240, 100, 120, 44)];
  assert.equal(pickNeighbour(1, 'right', rects), 2);
});

test('uneven sizes: a wide button under a row of small ones, and back', () => {
  const rects = [R(0, 0, 60, 30), R(70, 0, 60, 30), R(140, 0, 60, 30), R(0, 50, 200, 40)];
  for (const i of [0, 1, 2]) assert.equal(pickNeighbour(i, 'down', rects), 3);
  assert.equal(pickNeighbour(3, 'up', rects), 1); // the one over its centre
});

test('candidates behind the edge or overlapping backwards are ignored', () => {
  const from = R(100, 100);
  // a rect straddling the current one (centre past it, but not reaching beyond its far edge) is not "to the right"
  assert.equal(pickNeighbour(from, 'right', [R(120, 100, 60, 40)]), -1);
  // a rect whose centre is past ours and that reaches beyond our right edge counts, with a zero gap
  assert.equal(pickNeighbour(from, 'right', [R(180, 100, 60, 40)]), 0);
  assert.equal(pickNeighbour(from, 'right', [R(0, 100)]), -1);
  assert.equal(pickNeighbour(from, 'down', [R(100, 0)]), -1);
});

test('a rect as `from` (focus not on a candidate) and zero-size or missing rects', () => {
  const rects = [R(0, 0), { x: 0, y: 50, w: 0, h: 40 }, null, R(0, 100)];
  assert.equal(pickNeighbour(R(0, -60), 'down', rects), 0);
  assert.equal(pickNeighbour(0, 'down', rects), 3);
  assert.equal(pickNeighbour(5, 'down', rects), -1); // an index past the end has no rect
  assert.equal(pickNeighbour(0, 'down', []), -1);
});

test('every direction is known; an unknown one throws', () => {
  assert.deepEqual(NAV_DIRS, ['up', 'down', 'left', 'right']);
  assert.throws(() => pickNeighbour(R(0, 0), 'diagonal', []), /unknown direction 'diagonal'/);
});

test('staggered rows: the end of a row stops, and right-then-left returns', () => {
  const g = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.push(R(c * 80 + (r % 2) * 20, r * 45, 70, 35)); // staggered rows
  for (let i = 0; i < g.length; i++) {
    const d = pickNeighbour(i, 'right', g); if (d >= 0) assert.equal(pickNeighbour(d, 'left', g), i, `right then left from ${i}`);
  }
  for (const end of [3, 7, 11, 15]) assert.equal(pickNeighbour(end, 'right', g), -1, `row end ${end}`);
});
