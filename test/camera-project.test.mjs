import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeProject } from '../src/view/camera/project.js';

const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
const cam = () => { const c = new THREE.PerspectiveCamera(60, 2, 0.1, 100); c.position.set(0, 0, 10); c.lookAt(0, 0, 0); return c; };

test('3g: makeProject maps the view centre to the canvas centre, with the canvas offset and the NDC depth (S-1, #73)', () => {
  const r = makeProject(cam(), canvas)([0, 0, 0]);
  assert.ok(Math.abs(r.x - 110) < 1e-9 && Math.abs(r.y - 70) < 1e-9); assert.equal(r.onScreen, true); assert.ok(r.z > -1 && r.z < 1);
});
test('3g: a point at the right edge is on screen; past it, or behind the camera, is not (#73)', () => {
  const p = makeProject(cam(), canvas), half = Math.tan(Math.PI / 6) * 10 * 2; // half the view's width at the origin's depth
  const edge = p([half * 0.999, 0, 0]); assert.ok(Math.abs(edge.x - (10 + 200 * 1.999 / 2)) < 1e-6); assert.equal(edge.onScreen, true);
  assert.equal(p([half * 1.01, 0, 0]).onScreen, false);
  assert.equal(p([0, 0, 20]).onScreen, false); // projects onto the centre: only the behind test rejects it
});
test('3g: project reads a camera moved since the last render, fills out, and project.ndc gives raw NDC (#73, M-77)', () => {
  const c = cam(), p = makeProject(c, canvas); c.position.set(5, 0, 10); // moved: its matrices are stale
  const out = {}; assert.equal(p([5, 0, 0], out), out); assert.ok(Math.abs(out.x - 110) < 1e-9);
  assert.notEqual(p([5, 0, 0]), p([5, 0, 0])); // fresh objects without out (game.point may keep them)
  const n = p.ndc(5, 0, 0); assert.ok(Math.abs(n.nx) < 1e-9 && Math.abs(n.ny) < 1e-9); assert.equal(n.behind, false);
});
test('3g: makeProject needs a camera and a canvas', () => {
  assert.throws(() => makeProject({}, canvas), /makeProject: camera required/);
  assert.throws(() => makeProject(cam(), {}), /makeProject: canvas required/);
});
