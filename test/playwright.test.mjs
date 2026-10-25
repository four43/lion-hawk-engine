import test from 'node:test';
import assert from 'node:assert/strict';
import { presets, gameDriver, openGame, formatFailure, expectScene, expectState, testUrl, expectTappable, expectFitsSafeArea, expectNoOverlap, expectGame } from 'lion-hawk/playwright';

test('presets have the documented shape', () => {
  assert.deepEqual(Object.keys(presets).sort(), ['desktop', 'iPad Mini landscape', 'iPad Pro 11 landscape', 'iPhone 15 Pro Max landscape', 'iPhone 15 Pro Max portrait',
    'iPhone 15 Pro landscape', 'iPhone 15 Pro portrait', 'iPhone SE']);
  for (const p of Object.values(presets)) {
    assert.ok(p.viewport.width > 0 && p.viewport.height > 0 && p.deviceScaleFactor >= 1);
    assert.equal(typeof p.isMobile, 'boolean'); assert.equal(typeof p.hasTouch, 'boolean');
    assert.deepEqual(Object.keys(p.safeArea).sort(), ['bottom', 'left', 'right', 'top']);
  }
  assert.equal(presets['iPhone 15 Pro landscape'].safeArea.left, 59);
  assert.equal(presets.desktop.hasTouch, false);
  assert.deepEqual(presets['iPhone 15 Pro Max portrait'].viewport, { width: 430, height: 932 }); // [T-16]
  assert.equal(presets['iPhone 15 Pro Max landscape'].safeArea.right, 59);
  assert.deepEqual(presets['iPad Mini landscape'].viewport, { width: 1133, height: 744 });
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
  assert.deepEqual(calls.map(c => c[0]), ['init', 'init', 'goto']); // the fake pads (#138), then the game's script
  calls.length = 0; await openGame(browser, 'http://x/', { initScript: { content: 'window.x = 1' } });
  assert.deepEqual(calls.map(c => c[1]).slice(0, 2), ['fn', 'window.x = 1']);
  calls.length = 0; await openGame(browser, 'http://x/', { pads: 'host', initScript: { content: 'window.x = 1' } });
  assert.deepEqual(calls.map(c => c[1]).slice(0, 1), ['window.x = 1'], "pads: 'host' keeps the machine's controllers");
  await assert.rejects(openGame(browser, 'http://x/', { pads: 'none' }), /pads must be 'fake' or 'host'/);
});

test('T-24: game.pad(state) is pad 0, pad(index, state) any pad; unplug and haptics name an index 0..15 (review focus)', async () => {
  const calls = [];
  const g = fake(async (fn, a) => { calls.push(a); return null; });
  await g.pad({ a: true }); await g.pad(3, { b: true }); await g.pad(null); await g.pad(2, null); await g.unplug(1); await g.haptics(0);
  assert.deepEqual(calls, [[0, { a: true }], [3, { b: true }], [0, null], [2, null], 1, 0]);
  for (const bad of [-1, 16, 1.5, '1']) await assert.rejects(g.unplug(bad), /playwright: pad index must be an integer in 0\.\.15/);
  await assert.rejects(g.pad(16, {}), /pad index must be an integer in 0\.\.15 \(got 16\)/);
  for (const bad of ['1', true, undefined]) await assert.rejects(g.pad(bad, { a: true }), /playwright: pad index must be an integer in 0\.\.15/);
  await assert.rejects(g.pad('1'), /playwright: pad index must be an integer/);
});

test('game.pad() and pad(undefined) unplug pad 0, as in 0.12; pad(\'1\'), pad(true) and pad(NaN) still throw (plan 4 residual, carried to plan 5)', async () => {
  const calls = [];
  const g = fake(async (fn, a) => { calls.push(a); return null; });
  await g.pad(); await g.pad(undefined);
  assert.deepEqual(calls, [[0, null], [0, null]], 'both are pad(null): pad 0 unplugged');
  for (const bad of ['1', true, NaN]) await assert.rejects(g.pad(bad), /playwright: pad index must be an integer in 0\.\.15/);
  await assert.rejects(g.pad(undefined, { a: true }), /playwright: pad index must be an integer in 0\.\.15/, 'undefined with a state is still a bad index');
  assert.equal(calls.length, 2, 'a refused call reaches no page');
});

test('T-17: query, control and checksum evaluate in the page; a predicate goes as source', async () => {
  const got = []; const g = fake(async (fn, a) => { got.push(a); return 'r'; });
  await g.query('pig', { mood: 2 }); await g.query('pig', e => e.mood > 1); await g.control('title.play');
  assert.deepEqual(got[0], ['pig', { mood: 2 }, null]);
  assert.deepEqual(got[1], ['pig', null, 'e => e.mood > 1']);
  assert.equal(got[2], 'title.play');
});
test('T-17: touch.drag starts, moves in steps along the line, then lifts', async () => {
  const sent = [], page = { evaluate: async () => {} };
  const context = { newCDPSession: async () => ({ send: async (m, p) => sent.push([p.type, p.touchPoints.map(t => [t.x, t.y])]) }) };
  const g = gameDriver({ page, context, preset: presets['iPhone SE'], presetName: 'iPhone SE' });
  await g.touch.drag(3, { x: 0, y: 0 }, { x: 40, y: 20 }, { steps: 2 });
  assert.deepEqual(sent, [['touchStart', [[0, 0]]], ['touchMove', [[20, 10]]], ['touchMove', [[40, 20]]], ['touchEnd', [[40, 20]]]]);
  await assert.rejects(g.touch.drag(3, { x: 0, y: 0 }, { x: 1, y: 1 }, { steps: 0 }), /touch.drag: steps must be a positive integer/);
});
test('T-17: shot renders, then writes <LH_SHOTS>/<preset>/<name>.png with masks as locators', async () => {
  const calls = [], prev = process.env.LH_SHOTS; process.env.LH_SHOTS = '/tmp/lh-shots-unit';
  const page = { evaluate: async () => calls.push('render'), locator: s => ({ sel: s }), screenshot: async o => calls.push(o) };
  try {
    const g = gameDriver({ page, context: {}, preset: presets['iPhone 15 Pro landscape'], presetName: 'iPhone 15 Pro landscape' });
    assert.equal(await g.shot('title', { mask: ['#fps'] }), '/tmp/lh-shots-unit/iPhone-15-Pro-landscape/title.png');
    assert.deepEqual(calls, ['render', { path: '/tmp/lh-shots-unit/iPhone-15-Pro-landscape/title.png', mask: [{ sel: '#fps' }] }]);
    await assert.rejects(g.shot('../x'), /shot: a name is letters, digits/);
  } finally { if (prev === undefined) delete process.env.LH_SHOTS; else process.env.LH_SHOTS = prev; }
});
test('T-18: expectGame matchers name what they saw', async () => {
  const g = fake(async fn => fn.toString().includes('settled') ? false : [{ type: 'count', n: 2 }, { type: 'go' }]);
  g.scene = async () => ({ name: 'race' }); g.state = async () => ({ x: 3 });
  await expectGame(g).toBeInScene('race'); await expectGame(g).toHaveState('x', 3);
  await expectGame(g).toHaveEmitted('count', { n: 2 });
  await assert.rejects(expectGame(g).toHaveEmitted('finish'), /no 'finish' event \(seen: count, go\)/);
  await assert.rejects(expectGame(g).toBeSettled(), /the page is not settled/);
  await assert.rejects(expectGame(g).toBeTappable(), /expectGame\(game, target\).toBeTappable: needs a target/);
});
test('T-18: toBeThumbReachable measures from the bottom corner inside the safe area', async () => {
  const at = box => ({ page: { evaluate: async () => ({ ...box, visible: true, hit: true }) }, preset: presets['iPhone 15 Pro landscape'] });
  // 852 x 393, safe area left/right 59, bottom 21: the right thumb is at (793, 372), reach 0.6 x 393 = 236
  await expectGame(at({ x: 700, y: 300, w: 40, h: 40 }), 'hud.fire').toBeThumbReachable('right');
  await assert.rejects(expectGame(at({ x: 100, y: 20, w: 40, h: 40 }), 'hud.fire').toBeThumbReachable('right'), /'hud.fire' \(40x40 at 100,20\) is \d+ px from the right thumb, beyond 236 px/);
  await assert.rejects(expectGame(at({ x: 0, y: 0, w: 1, h: 1 }), 'x').toBeThumbReachable('up'), /side must be 'left' or 'right'/);
});
