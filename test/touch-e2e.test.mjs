// Real-Chromium check that game.touch.end lifts only the fingers it is given.
import test, { before, after } from 'node:test';
import http from 'node:http';
import { launch, openGame } from 'lion-hawk/playwright';
import assert from 'node:assert/strict';

let server, base, chrome, skip = false;
const PAGE = '<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0;touch-action:none;height:100vh"><script>window.log=[];for(const t of ["pointerdown","pointermove","pointerup","pointercancel"])addEventListener(t,e=>log.push(t+":"+e.pointerId));</script>';
const ENGINE = 'window.engine={render(){},errors:[],state(){return{}},ready:Promise.resolve(),settled(){return true}};';

before(async () => {
  try { chrome = await launch(); }
  catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE + '<script>' + ENGINE + '</script>'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await chrome?.close(); await new Promise(r => (server ? server.close(r) : r())); });

const open = () => openGame(chrome.browser, base, { preset: 'iPhone 15 Pro landscape', seed: 1 });
const ids = (game, type) => game.page.evaluate(t => window.log.filter(l => l.startsWith(t + ':')).map(l => +l.split(':')[1]), type);
const clear = game => game.page.evaluate(() => { window.log.length = 0; });
// Chromium numbers pointers itself: finger 1 goes down first, finger 2 second.
async function down(game) {
  await game.touch.start(1, { x: 100, y: 200 });
  await game.touch.start(2, { x: 600, y: 200 });
  const [a, b] = await ids(game, 'pointerdown');
  await clear(game);
  return { p1: a, p2: b };
}

test('touch.end(2) lifts only finger 2; finger 1 keeps moving; end(1) then lifts it', async t => {
  if (skip) return t.skip(skip);
  const game = await open();
  try {
    const { p1, p2 } = await down(game);
    await game.touch.end(2);
    assert.deepEqual(await ids(game, 'pointerup'), [p2], 'only finger 2 lifted');
    assert.deepEqual(await ids(game, 'pointercancel'), []);
    await clear(game);
    await game.touch.move(1, { x: 150, y: 220 });
    assert.deepEqual([...new Set(await ids(game, 'pointermove'))], [p1], 'finger 1 still down and moving');
    await clear(game);
    await game.touch.end(1);
    assert.deepEqual(await ids(game, 'pointerup'), [p1], 'then finger 1 lifts');
  } finally { await game.close(); }
});

test('touch.end(1, 2) lifts both fingers', async t => {
  if (skip) return t.skip(skip);
  const game = await open();
  try {
    const { p1, p2 } = await down(game);
    await game.touch.end(1, 2);
    assert.deepEqual((await ids(game, 'pointerup')).sort(), [p1, p2].sort());
  } finally { await game.close(); }
});
