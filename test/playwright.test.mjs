import test from 'node:test';
import assert from 'node:assert/strict';
import { presets, gameDriver, formatFailure, expectScene, expectState } from 'lion-hawk/playwright';

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
