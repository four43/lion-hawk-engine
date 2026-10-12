import test from 'node:test';
import assert from 'node:assert/strict';
import { presets, gameDriver, openGame, formatFailure, expectScene, expectState, testUrl, expectTappable, expectFitsSafeArea, expectNoOverlap } from 'lion-hawk/playwright';

test('presets have the documented shape', () => {
  assert.deepEqual(Object.keys(presets).sort(), ['desktop', 'iPad Pro 11 landscape', 'iPhone 15 Pro landscape', 'iPhone 15 Pro portrait', 'iPhone SE']);
  for (const p of Object.values(presets)) {
    assert.ok(p.viewport.width > 0 && p.viewport.height > 0 && p.deviceScaleFactor >= 1);
    assert.equal(typeof p.isMobile, 'boolean'); assert.equal(typeof p.hasTouch, 'boolean');
    assert.deepEqual(Object.keys(p.safeArea).sort(), ['bottom', 'left', 'right', 'top']);
  }
  assert.equal(presets['iPhone 15 Pro landscape'].safeArea.left, 59);
  assert.equal(presets.desktop.hasTouch, false);
});

const fake = evaluate => gameDriver({ page: { evaluate }, context: {}, preset: presets.desktop, presetName: 'desktop' });

test('until failure names the step, scene and last events', async () => {
  const g = fake(async () => ({ fail: true, step: 42, scene: 'race', overlays: ['pause'], events: [{ type: 'count', n: 2 }] }));
  await assert.rejects(g.until('s => s.x > 5', { maxSteps: 10 }), e => {
    assert.match(e.message, /until: condition not met after 10 steps \(step 42, scene race \+ pause\)/);
    assert.match(e.message, /"type":"count"/);
    return true;
  });
  assert.match(formatFailure('untilEvent(go)', { step: 1, scene: 'x', events: [] }, 5), /\(none\)/);
});

test('until returns the step count and accepts functions', async () => {
  let arg;
  const g = fake(async (fn, a) => { arg = a; return { k: 7 }; });
  assert.equal(await g.until(s => s.x > 1), 7);
  assert.match(arg.pred, /s\.x > 1/);
  assert.equal(await g.untilEvent('go', { maxSteps: 9 }), 7);
  assert.deepEqual([arg.type, arg.maxSteps], ['go', 9]);
});

test('assertions throw AssertionError', async () => {
  const g = fake(async () => ({}));
  g.scene = async () => ({ name: 'title' }); g.state = async () => ({ a: { b: 2 } });
  await expectScene(g, 'title'); await expectState(g, 'a.b', 2);
  await assert.rejects(expectScene(g, 'race'), { name: 'AssertionError' });
  await assert.rejects(expectState(g, 'a.b', 3), { name: 'AssertionError' });
});

test('2c: game.fill types into the control and commits with Enter', async () => {
  const calls = [], loc = { fill: async t => calls.push(['fill', t]), press: async k => calls.push(['press', k]) };
  const g = gameDriver({ page: { locator: s => { calls.push(['locator', s]); return loc; }, evaluate: async () => {} }, context: {}, preset: presets.desktop, presetName: 'desktop' });
  await g.fill('title.seed', 'abc');
  assert.deepEqual(calls, [['locator', '[data-testid="title.seed"]'], ['fill', 'abc'], ['press', 'Enter']]);
});
test('2d: game.command issues the command in the page', async () => {
  let got; const g = fake(async (fn, a) => { got = a; });
  await g.command('tap', { x: 1 }); assert.deepEqual(got, ['tap', { x: 1 }]);
});

test('2d: game.press/unpress hold the mouse on the control (desktop)', async () => {
  const calls = [];
  const page = { evaluate: async () => {}, locator: () => ({ first() { return this; }, waitFor: async () => {}, boundingBox: async () => ({ x: 10, y: 20, width: 40, height: 40 }) }),
    mouse: { move: async (x, y) => calls.push(['move', x, y]), down: async () => calls.push(['down']), up: async () => calls.push(['up']) } };
  const g = gameDriver({ page, context: {}, preset: presets.desktop, presetName: 'desktop' });
  await g.press('s.wake'); await g.unpress('s.wake');
  assert.deepEqual(calls, [['move', 30, 40], ['down'], ['up']]);
});

test('2d: game.press on a touch preset keeps the active touches down and is tracked in active', async () => {
  const sent = [], page = { evaluate: async () => {}, locator: () => ({ first() { return this; }, waitFor: async () => {}, boundingBox: async () => ({ x: 10, y: 20, width: 40, height: 40 }) }) };
  const context = { newCDPSession: async () => ({ send: async (m, p) => sent.push([p.type, p.touchPoints.map(t => t.id)]) }) };
  const g = gameDriver({ page, context, preset: presets['iPhone SE'], presetName: 'iPhone SE' });
  await g.touch.start(1, { x: 5, y: 5 });
  await g.press('s.wake'); await g.unpress('s.wake');
  assert.deepEqual(sent, [['touchStart', [1]], ['touchStart', [1, 90]], ['touchEnd', [90]]]);
  await g.press('s.a'); await g.press('s.b'); assert.deepEqual(sent.at(-1), ['touchStart', [1, 90, 91]]);
  await g.touch.end(1); assert.deepEqual(sent.at(-1), ['touchEnd', [1]]); // lifting the stick finger leaves the holds down
});

test('2d: testUrl adds lh-test=render for manual rendering (#47)', () => {
  assert.equal(new URL(testUrl('http://x/', { seed: 3 })).search, '?lh-test&seed=3');
  assert.equal(new URL(testUrl('http://x/', { render: 'manual' })).searchParams.get('lh-test'), 'render');
});
test('2d: layout assertions accept a test id, { testid }, { css } or a locator (#48)', async () => {
  const box = { x: 10, y: 10, w: 60, h: 60, visible: true, hit: true }, seen = [];
  const g = fake(async (fn, sel) => { seen.push(sel); return sel === '#b' ? { ...box, x: 40 } : box; });
  await expectTappable(g, 'title.play'); await expectTappable(g, { css: '#gas' }); await expectTappable(g, { testid: 'a.b' });
  assert.deepEqual(seen, ['[data-testid="title.play"]', '#gas', '[data-testid="a.b"]']);
  const loc = { evaluate: async () => box, toString: () => 'locator(#chip)' };
  await expectTappable(g, loc); await expectFitsSafeArea(g, loc);
  await assert.rejects(expectNoOverlap(g, loc, { css: '#b' }), /'locator\(#chip\)' .* overlaps '#b'/);
});

test('2e: game.point resolves a selector, {x, y} or { world } to client coordinates (#65)', async () => {
  const page = {
    locator: () => ({ first: () => ({ boundingBox: async () => ({ x: 10, y: 20, width: 40, height: 60 }) }) }),
    evaluate: async (fn, w) => ({ x: w[0] * 2, y: w[2] * 2 }),
  };
  const g = gameDriver({ page, context: {}, preset: presets.desktop, presetName: 'desktop' });
  assert.deepEqual(await g.point('#stick'), { x: 30, y: 50 });
  assert.deepEqual(await g.point({ x: 3, y: 4 }), { x: 3, y: 4 });
  assert.deepEqual(await g.point({ world: [1, 0, 5] }), { x: 2, y: 10 });
});

test('2f: game.point refuses a { world } point behind the camera or off-screen (#73)', async () => {
  const page = { evaluate: async (fn, w) => w[0] > 0 ? { x: 5, y: 6, z: 0.5, onScreen: true } : { x: -9, y: 6, z: 1.2, onScreen: false } };
  const g = gameDriver({ page, context: {}, preset: presets.desktop, presetName: 'desktop' });
  assert.deepEqual(await g.point({ world: [1, 0, 0] }), { x: 5, y: 6 });
  await assert.rejects(g.point({ world: [-1, 0, 0] }), /off-screen or behind the camera/);
  const old = gameDriver({ page: { evaluate: async () => ({ x: -9, y: 6 }) }, context: {}, preset: presets.desktop, presetName: 'desktop' });
  assert.deepEqual(await old.point({ world: [-1, 0, 0] }), { x: -9, y: 6 }); // a project without onScreen keeps today's behaviour
});
test('2f: openGame adds initScript to the context before the page loads (#74)', async () => {
  const calls = [];
  const page = { on() {}, addInitScript: async () => calls.push(['page-init']), goto: async u => calls.push(['goto', u]),
    evaluate: async () => {}, waitForFunction: async () => {} };
  const browser = { newContext: async () => ({ newPage: async () => page, addInitScript: async (f, a) => calls.push(['init', typeof f === 'function' ? 'fn' : f.content]) }) }; // on the context: popups get it too
  await openGame(browser, 'http://x/', { initScript: () => { window.WebGLRenderingContext = undefined; } });
  assert.deepEqual(calls.map(c => c[0]), ['init', 'goto']);
  calls.length = 0; await openGame(browser, 'http://x/', { initScript: { content: 'window.x = 1' } });
  assert.deepEqual(calls.map(c => c[1]).slice(0, 1), ['window.x = 1']);
});
