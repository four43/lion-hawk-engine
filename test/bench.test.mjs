// test/bench.test.mjs
// [D-7]: the ?debug=pads bench overlay, and boot's lazy loading (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, defineView, parseFlags } from '../src/index.view.js';
import { openPadBench } from '../src/view/bench/pads.js';
import { dom } from './helpers/dom.mjs';
import { game, pad, setup, actuator, WHEEL, XBOX } from './helpers/seats.mjs';

const facade = seats => ({ get localPlayers() { return seats.list; }, unpaired: () => seats.unpaired(), gamepad: d => seats.gamepad(d), onSeat: fn => seats.on(fn) });
const fakeTimer = () => {
  const t = { pending: new Map(), n: 0, setTimeout(fn, ms) { t.pending.set(++t.n, [fn, ms]); return t.n; }, clearTimeout(id) { t.pending.delete(id); },
    run() { const all = [...t.pending.values()]; t.pending.clear(); for (const [fn] of all) fn(); } };
  return t;
};
const flush = () => new Promise(r => setTimeout(r, 0));
const DRIVE = { pads: [{ match: () => true, bindings: { buttons: { 7: ['gas', 1] } } }] };
const rig = () => {
  const t = setup(), timer = fakeTimer(); let now = 1000;
  const bench = openPadBench(facade(t.seats), { doc: t.document, timer, now: () => now, env: { userAgent: 'UA' } });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += 16; t.frame(); bench.update(); } };
  const el = sel => t.document.querySelector(`[data-lh-bench] ${sel}`);
  const text = id => el(`[data-bench="${id}"]`).textContent;
  return { ...t, bench, timer, tick, el, text, advance: ms => { now += ms; } };
};

test('the bench lists each seat: player number, profile, devices with id, mapping and lost, and active contexts (D-7)', () => {
  const { e, seats, slots, tick, text } = rig();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { down: [0] }); slots[1] = pad(1, { id: WHEEL, down: [0] }); tick();
  assert.match(text('seats'), /P\? · seat 1 · pending · profile "Player 2"/);
  e.stepN(1); tick();
  const s = text('seats');
  assert.match(s, /P1 · seat 0 · profile "Player 1" · contexts \[drive\]/);
  assert.match(s, /keys all/); assert.match(s, /touch/);
  assert.ok(s.includes(`pad 0 "${XBOX}" mapping "standard"`));
  assert.match(s, /P2 · seat 1 · profile "Player 2" · contexts \[drive\]/);
  assert.ok(s.includes(`pad 1 "${WHEEL}" mapping ""`));
  slots[1] = null; tick();
  assert.match(text('seats'), /P2 · seat 1 · a device is lost/);
  assert.ok(text('seats').includes(`pad 1 "${WHEEL}" mapping "" · lost`));
  assert.match(text('log'), /seat\.lost · seat 1 · pad 1/);
});

test("the selected pad's buttons and axes show live values, peaks and press counts; the update rate counts the last second (D-7)", () => {
  const { slots, tick, el, text, advance } = rig();
  const at = (ts, extra) => ({ ...pad(0, extra), timestamp: ts });
  slots[0] = at(1); tick();
  slots[0] = at(2, { down: [7] }); tick(); slots[0] = at(3); tick(); slots[0] = at(4, { down: [7] }); tick();
  slots[0] = at(5, { axes: [0.5, -0.25, 0, 0] }); tick();
  const row = el('[data-bench="buttons"]').children[7].children;
  assert.deepEqual([row[1].textContent, row[2].textContent, row[4].textContent, row[5].textContent], ['RT / R2', 'up', '1.000', '2']);
  const ax = el('[data-bench="axes"]').children[1].children;
  assert.deepEqual([ax[1].textContent, ax[2].textContent, ax[3].textContent, ax[4].textContent], ['left stick Y', '-0.2500', '-0.250', '0.000']);
  assert.match(text('sticks'), /left stick {2}x 0\.500 {2}y -0\.250 {2}r 0\.559/);
  assert.match(text('info'), /update rate\s*5 \/s/);
  assert.match(text('log'), /pad 0 · RT \/ R2 \[7\] down/);
  advance(2000); slots[0] = at(5); tick();
  assert.match(text('info'), /update rate\s*0 \/s/);
});

test("haptics buttons play on the selected pad's actuator and log the answer; the self-test reports a playEffect that never settles (D-7)", async () => {
  const { slots, tick, el, text, timer } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  el('[data-hap="dual"]').click(); await flush();
  assert.deepEqual(a.calls, [['play', 'dual-rumble', { startDelay: 0, duration: 400, strongMagnitude: 1, weakMagnitude: 0.5 }]]);
  assert.match(text('hlog'), /Body: complete/);
  el('[data-hap="trig-r"]').click(); await flush();
  assert.deepEqual(a.calls[1], ['play', 'trigger-rumble', { startDelay: 0, duration: 300, leftTrigger: 0, rightTrigger: 0.8, strongMagnitude: 0, weakMagnitude: 0 }]);
  assert.match(text('support'), /trigger-rumble\s*yes/);
  a.playEffect = (type, params) => { a.calls.push(['play', type, { ...params }]); return new Promise(() => {}); }; // a browser that never answers
  el('[data-bench="self-test"]').click(); await flush();
  assert.match(text('hlog'), /effects: \["dual-rumble","trigger-rumble"\]/);
  timer.run(); await flush();
  assert.match(text('hlog'), /self-test body: no answer after 2000 ms \(promise still pending\)/);
});

test('live trigger taps follow the pull: taps last at least 50 ms and are full strength past 95% (D-7)', () => {
  const { slots, tick, el, advance } = rig(), a = actuator();
  const pull = (lt, rt) => { const p = pad(0, { act: a }); p.buttons[6] = { pressed: lt > 0.5, value: lt }; p.buttons[7] = { pressed: rt > 0.5, value: rt }; return p; };
  slots[0] = pull(0, 0); tick();
  el('[data-bench="live-tap-len"]').value = '20'; // under the floor: taps stay 50 ms
  el('[data-bench="live-trig"]').checked = true;
  slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls[0][1], 'trigger-rumble');
  const p = a.calls[0][2];
  assert.equal(p.duration, 50); assert.equal(p.leftTrigger, 1, 'past 95%: full strength');
  assert.ok(Math.abs(p.rightTrigger - 0.3 ** 0.6) < 1e-9, 'the response curve');
  advance(50); slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls.length, 1, 'the next tap waits for the interval');
  advance(130); slots[0] = pull(0.96, 0.3); tick();
  assert.equal(a.calls.length, 2);
  slots[0] = pull(0, 0); tick();
  assert.deepEqual(a.calls.slice(2), [['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }], ['reset']], 'let go: a zero effect, then one reset');
  tick(); assert.equal(a.calls.length, 4);
});

test('the bench never changes seats or bindings, whatever is clicked (D-7, review focus)', async () => {
  const { e, seats, slots, tick, el, document, timer } = rig();
  seats.context('drive', DRIVE); seats.enable({ contexts: ['drive'] });
  slots[0] = pad(0, { act: actuator(), down: [0] }); slots[1] = pad(1, { act: actuator(), down: [0] }); tick(); e.stepN(1); tick();
  const shape = () => JSON.stringify(seats.list.map(lp => [lp.seat, lp.pending, lp.devices.map(d => [d.kind, d.index ?? null, d.lost ?? false]), lp.contexts.list, lp.bindings.profile]));
  const before = shape(), cmds = e.commands.pending, touched = [];
  for (const lp of seats.list) {
    for (const k of ['claim', 'release', 'leave']) lp[k] = () => touched.push(`lp.${k}`);
    for (const k of ['add', 'remove']) lp.contexts[k] = () => touched.push(`contexts.${k}`);
    for (const k of ['map', 'reset', 'capture', 'cancel']) lp.bindings[k] = () => touched.push(`bindings.${k}`);
    const profile = lp.bindings.profile;
    Object.defineProperty(lp.bindings, 'profile', { configurable: true, get: () => profile, set: () => touched.push('bindings.profile') });
  }
  for (const id of ['live-trig', 'live-body', 'live-stick']) el(`[data-bench="${id}"]`).checked = true;
  for (const b of document.querySelectorAll('[data-lh-bench] button')) b.click();
  tick(5); timer.run(); await flush(); tick(5);
  assert.deepEqual(touched, []);
  assert.equal(shape(), before);
  assert.equal(e.commands.pending, cmds, 'no lh.seat command');
});

test('?debug=pads loads the bench through boot; without it boot adds no device, no element and imports no bench code (D-7, review focus)', async () => {
  const run = query => {
    const { window, document } = dom(), slots = [];
    const app = boot(game, defineView({ scenes: {} }), { doc: document, target: window, raf: () => 0, caf() {}, flags: parseFlags(query), getGamepads: () => slots, storage: null });
    const frame = () => { for (const d of app.driver.devices) d.update?.(1 / 60, 1 / 60); };
    return { app, slots, frame, document };
  };
  const off = run('?lh-test'), on = run('?lh-test&debug=pads');
  try {
    for (let i = 0; i < 50 && !on.document.querySelector('[data-lh-bench]'); i++) await flush();
    assert.ok(on.document.querySelector('[data-lh-bench]') !== null, 'the bench opened');
    on.slots[0] = pad(0); on.frame();
    assert.ok(on.document.querySelector('[data-lh-bench] [data-bench="seats"]').textContent.includes(`pad 0 "${XBOX}"`));
    assert.equal(on.app.driver.devices.length, off.app.driver.devices.length + 1, 'one slot device, only with the flag');
    assert.ok(off.document.querySelector('[data-lh-bench]') === null, 'no bench without the flag');
  } finally { on.app.dispose(); off.app.dispose(); }
  assert.ok(on.document.querySelector('[data-lh-bench]') === null, 'dispose removes it');
  const src = fs.readFileSync(new URL('../src/view/boot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import .*bench/m, 'boot never imports the bench statically');
  assert.match(src, /import\('\.\/bench\/pads\.js'\)/);
  assert.doesNotMatch(fs.readFileSync(new URL('../src/index.view.js', import.meta.url), 'utf8'), /bench/);
});

test('starting a pattern cancels the pending steps of the one running; none of A plays after B starts (plan 4 task 5 carry)', () => {
  const { slots, tick, el, timer, document } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  const press = name => [...document.querySelectorAll('[data-bench="patterns"] button')].find(b => b.textContent.startsWith(name)).click();
  press('Heartbeat'); // steps at 0, 200, 900, 1100, 1800, 2000 ms
  for (const [id, [fn, ms]] of [...timer.pending]) if (ms <= 200) { timer.pending.delete(id); fn(); }
  assert.equal(a.calls.length, 2);
  press('Weak buzz');
  assert.equal(timer.pending.size, 1, "only B's step is left");
  timer.run();
  assert.equal(a.calls.length, 3);
  assert.deepEqual(a.calls[2], ['play', 'dual-rumble', { startDelay: 0, duration: 500, strongMagnitude: 0, weakMagnitude: 1 }]);
});

test('a watchdog that fires after the bench is closed logs nothing (plan 4 task 5 carry)', async () => {
  const { slots, tick, el, timer, bench } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  a.playEffect = () => new Promise(() => {});
  el('[data-hap="dual"]').click(); await flush();
  const log = el('[data-bench="hlog"]'), n = log.childElementCount;
  assert.equal(timer.pending.size, 1, 'the watchdog is armed');
  bench.dispose(); timer.run(); await flush();
  assert.equal(log.childElementCount, n, 'no late "no answer" line');
});

test('play() with undefined params is an unhandled-rejection-free {} (plan 4 task 5 carry)', async () => {
  const { play } = await import('../src/view/bench/padStats.js');
  const a = actuator(), lines = [];
  assert.equal(await play(a, 'dual-rumble', undefined, { log: t => lines.push(t), quiet: true }), 'complete');
  assert.deepEqual(a.calls, [['play', 'dual-rumble', {}]]);
  assert.equal(await play(a, 'dual-rumble', undefined, { log: t => lines.push(t), timer: fakeTimer() }), 'complete');
  assert.match(lines.join('\n'), /playEffect\("dual-rumble", \{\}\)/);
});

test('closing the bench zeroes the pads it could reach: a long play ends in a zero dual-rumble then reset, nothing after (fix round 1)', async () => {
  const { slots, tick, el, bench, timer } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  el('[data-bench="dr-dur"]').value = '5000';
  el('[data-hap="dual"]').click(); await flush();
  bench.dispose(); await flush(); timer.run(); tick(3); await flush();
  assert.deepEqual(a.calls.slice(-2), [['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }], ['reset']]);
  assert.equal(a.calls.length, 3);
});

test('disposing during the self-test stops its second run: no trigger-rumble after the dispose (fix round 1)', async () => {
  const { slots, tick, el, bench } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  el('[data-bench="self-test"]').click();
  assert.equal(a.calls.length, 1, 'the body run started');
  bench.dispose(); await flush();
  assert.ok(!a.calls.some(c => c[1] === 'trigger-rumble'));
  assert.deepEqual(a.calls.at(-1), ['reset']);
});

test('a pattern stays on the pad it started on when another tab is picked (fix round 1)', () => {
  const { slots, tick, el, timer, document } = rig(), a = actuator(), b = actuator();
  slots[0] = pad(0, { act: a }); slots[1] = pad(1, { act: b }); tick();
  [...document.querySelectorAll('[data-bench="patterns"] button')].find(x => x.textContent.startsWith('Heartbeat')).click();
  const [t0, t1] = el('[data-bench="tabs"]').children; t1.click(); tick();
  timer.run();
  assert.equal(a.calls.length, 6); assert.equal(b.calls.length, 0);
});

test('Stop all, live off and live idle send a zero dual-rumble then reset, as dispose does (final review)', async () => {
  const { slots, tick, el } = rig(), a = actuator();
  slots[0] = pad(0, { act: a }); tick();
  el('[data-bench="stop"]').click(); await flush();
  assert.deepEqual(a.calls, [['play', 'dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }], ['reset']]);
});
