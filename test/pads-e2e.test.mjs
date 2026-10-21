// test/pads-e2e.test.mjs
// Real-Chromium check of the Playwright fake pads (T-24): any number of pads, connect and disconnect events, recording actuators.
import test, { before, after } from 'node:test';
import http from 'node:http';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

let server, base, chrome, skip = false;
const PAGE = '<!doctype html><body><script>window.log=[];for(const t of ["gamepadconnected","gamepaddisconnected"])addEventListener(t,e=>log.push([t,e.gamepad.index,e.gamepad.id,e.gamepad.connected]));</script>';
const ENGINE = 'window.engine={render(){},errors:[],state(){return{}},ready:Promise.resolve(),settled(){return true}};';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', WHEEL = 'G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)';

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE + '<script>' + ENGINE + '</script>'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

const pads = game => game.page.evaluate(() => [...navigator.getGamepads()].map(p => p && [p.index, p.id, p.mapping, p.buttons[0].pressed, p.axes.slice(0, 2)]));

test('game.pad(index, state) plugs any number of pads with their own id and mapping; game.pad(state) is still pad 0 (T-24, review focus)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    assert.deepEqual(await pads(game), [], 'no pad until one is plugged');
    await game.pad({ a: true, axes: [0.5, 0] });
    await game.pad(2, { id: WHEEL, mapping: '', axes: [-1, 0, 1, 0, 0.25] });
    assert.deepEqual(await pads(game), [[0, XBOX, 'standard', true, [0.5, 0]], null, [2, WHEEL, '', false, [-1, 0]]]);
    assert.equal(await game.page.evaluate(() => navigator.getGamepads()[2].axes.length), 5, 'axes beyond four are kept');
    await game.pad({ b: true });
    assert.equal((await pads(game))[0][3], false, 'pad 0 updated');
    await assert.rejects(game.pad(16, {}), /pad index must be an integer in 0\.\.15/);
  } finally { await game.close(); }
});

test('game.unplug(index) empties the slot and fires gamepaddisconnected; plugging fires gamepadconnected (T-24)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {}); await game.pad(1, { id: 'Pad B' }); await game.pad(1, { id: 'Pad B', a: true });
    await game.unplug(1);
    assert.deepEqual((await pads(game)).map(p => p?.[0]), [0], 'the trailing empty slot is trimmed');
    await game.unplug(3); await game.pad(null);
    assert.deepEqual(await pads(game), []);
    assert.deepEqual(await game.page.evaluate(() => window.log), [
      ['gamepadconnected', 0, XBOX, true], ['gamepadconnected', 1, 'Pad B', true],
      ['gamepaddisconnected', 1, 'Pad B', false], ['gamepaddisconnected', 0, XBOX, false],
    ]);
  } finally { await game.close(); }
});

test("each pad's vibrationActuator records playEffect and reset; effects is settable; an unlisted effect rejects; effects: null has none (T-24)", async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, base);
  try {
    await game.pad(0, {});
    const r = await game.page.evaluate(async () => {
      const a = navigator.getGamepads()[0].vibrationActuator, out = [[...a.effects]];
      out.push(await a.playEffect('dual-rumble', { duration: 100, strongMagnitude: 1, weakMagnitude: 0.5 }), await a.reset());
      return out;
    });
    assert.deepEqual(r, [['dual-rumble', 'trigger-rumble'], 'complete', 'complete']);
    await game.pad(0, { effects: ['dual-rumble'] });
    const err = await game.page.evaluate(async () => {
      try { await navigator.getGamepads()[0].vibrationActuator.playEffect('trigger-rumble', { duration: 50, leftTrigger: 1 }); return null; } catch (e) { return e.name; }
    });
    assert.equal(err, 'NotSupportedError');
    assert.deepEqual(await game.haptics(0), { effects: ['dual-rumble'], calls: [
      { op: 'playEffect', type: 'dual-rumble', params: { duration: 100, strongMagnitude: 1, weakMagnitude: 0.5 } },
      { op: 'reset' },
      { op: 'playEffect', type: 'trigger-rumble', params: { duration: 50, leftTrigger: 1 } },
    ] });
    await game.pad(0, { effects: null });
    assert.equal(await game.page.evaluate(() => navigator.getGamepads()[0].vibrationActuator), null);
    assert.equal(await game.haptics(1), null, 'no pad was ever at 1');
    await game.pad(0, { id: 'Another pad' });
    assert.deepEqual((await game.haptics(0)).calls, [], 'another id at the index: a new actuator');
  } finally { await game.close(); }
});
