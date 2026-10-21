// test/bench-stats.test.mjs
// [D-7]: the pad bench's numbers and haptics helpers (plan 2026-10-21-local-players-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STD_BUTTONS, STD_AXES, SECTORS, TRACE, TAP_MIN, PATTERNS, createPadStats, updateStats, rate, stickEdge, shapeTap, liveState, liveEffect, play, selfTest, supports, describe } from '../src/view/bench/padStats.js';

const gp = (o = {}) => ({ id: 'Pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...o });
const fakeTimer = () => {
  const t = { pending: new Map(), n: 0, setTimeout(fn, ms) { t.pending.set(++t.n, [fn, ms]); return t.n; }, clearTimeout(id) { t.pending.delete(id); },
    run() { const all = [...t.pending.values()]; t.pending.clear(); for (const [fn] of all) fn(); } };
  return t;
};

test('updateStats counts presses on the down edge, keeps peaks, and reports each button change (D-7)', () => {
  const s = createPadStats(gp(), 0), seen = [];
  const pull = (v, ts) => { const p = gp({ timestamp: ts }); p.buttons[6] = { pressed: v > 0.5, value: v }; return p; };
  for (const [v, ts] of [[0.3, 1], [0.9, 2], [0.7, 3], [0, 4], [1, 5]]) updateStats(s, pull(v, ts), ts * 10, (...a) => seen.push(a));
  assert.equal(s.presses[6], 2); assert.equal(s.peak[6], 1);
  assert.deepEqual(seen, [[6, true, 0.9], [6, false, 0], [6, true, 1]]);
  assert.equal(STD_BUTTONS[6], 'LT / L2'); assert.equal(STD_BUTTONS.length, 18); assert.equal(STD_AXES[0], 'left stick X');
});

test('axis range starts at 0; rate counts timestamp changes in the last second (D-7)', () => {
  const s = createPadStats(gp(), 0);
  for (let i = 0; i < 10; i++) updateStats(s, gp({ timestamp: i, axes: [i / 10, -i / 20, 0, 0] }), i * 100);
  assert.equal(rate(s), 10);
  assert.deepEqual([s.min[0], s.max[0], s.min[1], s.max[1]], [0, 0.9, -0.45, 0]);
  updateStats(s, gp({ timestamp: 9 }), 1950);
  assert.equal(rate(s), 0, 'nothing new in the last second');
});

test("stick traces keep distinct readings; the outline keeps each sector's furthest reach; rest drift is the still stick's offset (D-7)", () => {
  const s = createPadStats(gp(), 0);
  for (let i = 0; i < 40; i++) updateStats(s, gp({ axes: [0.03, 0.02, 0, 0] }), i);
  assert.equal(s.trace[0].length, 1, 'one distinct reading');
  assert.ok(Math.abs(s.rest[0] - Math.hypot(0.03, 0.02)) < 1e-9, 'resting offset');
  assert.equal(stickEdge(s, 0), null, 'not rolled yet');
  updateStats(s, gp({ axes: [1, 0, 0, 0] }), 50); updateStats(s, gp({ axes: [0, 1, 0, 0] }), 51);
  assert.equal(s.bins[0][18], 1); assert.equal(s.bins[0][27], 1);
  assert.deepEqual(stickEdge(s, 0), { avg: 1, lo: 1, hi: 1, filled: 2 });
  assert.ok(Math.abs(s.rest[0] - Math.hypot(0.03, 0.02)) < 1e-9, 'moving away keeps the resting offset');
  for (let i = 0; i < TRACE + 5; i++) updateStats(s, gp({ axes: [i / (TRACE * 2), 0, 0, 0] }), 100 + i);
  assert.equal(s.trace[0].length, TRACE); assert.equal(SECTORS, 36);
});

test('shapeTap: silent at 2% or less, the response curve in between, full strength past 95% (D-7)', () => {
  assert.equal(shapeTap(0.01, 0.6), 0); assert.equal(shapeTap(0.02, 0.6), 0);
  assert.equal(shapeTap(0.5, 1), 0.5); assert.ok(Math.abs(shapeTap(0.5, 0.6) - 0.5 ** 0.6) < 1e-12);
  assert.equal(shapeTap(0.95, 1), 0.95); assert.equal(shapeTap(0.951, 0.6), 1);
});

test('liveEffect: taps at least 50 ms, every max(interval, tap + 20) ms; body rumble every 50 ms; one idle when let go (D-7)', () => {
  const opts = { trig: true, interval: 80, length: 10, curve: 1 }, st = liveState();
  const e = liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 0, opts);
  assert.equal(e.type, 'trigger-rumble');
  assert.deepEqual(e.params, { startDelay: 0, duration: TAP_MIN, leftTrigger: 0.5, rightTrigger: 0, strongMagnitude: 0, weakMagnitude: 0 });
  assert.equal(liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 79, opts), null);
  assert.equal(liveEffect(st, { L: 0.5, R: 0, stick: 0 }, 80, opts).type, 'trigger-rumble');
  const long = liveState(), lo = { trig: true, interval: 80, length: 100, curve: 1 };
  liveEffect(long, { L: 1, R: 1, stick: 0 }, 0, lo);
  assert.equal(liveEffect(long, { L: 1, R: 1, stick: 0 }, 119, lo), null, 'a long tap pushes the next one back');
  assert.equal(liveEffect(long, { L: 1, R: 1, stick: 0 }, 120, lo).params.duration, 100);
  const body = liveState();
  assert.deepEqual(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 0, { body: true }), { type: 'dual-rumble', params: { startDelay: 0, duration: 120, strongMagnitude: 0.4, weakMagnitude: 0.2 } });
  assert.equal(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 30, { body: true }), null);
  assert.equal(liveEffect(body, { L: 0.4, R: 0.2, stick: 0 }, 50, { body: true }).type, 'dual-rumble');
  assert.equal(liveEffect(body, { L: 0, R: 0, stick: 0 }, 100, { body: true }), 'idle');
  assert.equal(liveEffect(body, { L: 0, R: 0, stick: 0 }, 116, { body: true }), null, 'idle only once');
  const stick = liveEffect(liveState(), { L: 0, R: 0, stick: 0.5 }, 0, { stickBody: true }).params;
  assert.deepEqual([stick.strongMagnitude, stick.weakMagnitude], [0.5, 0.3]);
});

test('play logs the call and the answer; a watchdog reports a promise still pending; rejections and missing actuators are logged (D-7)', async () => {
  const log = [], timer = fakeTimer(), opts = label => ({ log: (...x) => log.push(x), label, timer });
  assert.equal(await play({ playEffect: async () => 'complete' }, 'dual-rumble', { duration: 100 }, opts('Body')), 'complete');
  assert.deepEqual(log, [['Body: playEffect("dual-rumble", {"duration":100})', ''], ['Body: complete', 'ok']]);
  assert.equal(timer.pending.size, 0, 'the watchdog is cleared once it answers');
  log.length = 0;
  play({ playEffect: () => new Promise(() => {}) }, 'trigger-rumble', { duration: 500, startDelay: 100 }, opts('T'));
  assert.equal([...timer.pending.values()][0][1], 2100);
  timer.run();
  assert.deepEqual(log.at(-1), ['T: no answer after 2100 ms (promise still pending)', 'err']);
  const nope = Object.assign(new Error('nope'), { name: 'NotSupportedError' });
  assert.equal(await play({ playEffect: async () => { throw nope; } }, 'trigger-rumble', {}, opts('R')), null);
  assert.deepEqual(log.at(-1), ['R: NotSupportedError: nope', 'err']);
  assert.equal(await play(null, 'dual-rumble', {}, opts('N')), null);
  assert.deepEqual(log.at(-1), ['N: this pad has no vibrationActuator', 'err']);
  assert.equal(await play({}, 'dual-rumble', {}, opts('M')), null);
  assert.deepEqual(log.at(-1), ['M: vibrationActuator has no playEffect() in this browser', 'err']);
  log.length = 0;
  assert.equal(await play({ playEffect: async () => 'preempted' }, 'dual-rumble', {}, { ...opts('Q'), quiet: true }), 'preempted');
  assert.deepEqual(log, [], 'quiet: no call line, no watchdog, no preempted line'); assert.equal(timer.pending.size, 0);
});

test('selfTest logs the browser, the pad and its actuator, then plays a body and a trigger effect (D-7)', async () => {
  const log = [], played = [], env = { userAgent: 'UA', focused: true, visibility: 'visible', secure: true };
  const run = p => selfTest(p, { log: t => log.push(t), play: async (type, params, label) => { played.push([type, label, params.duration]); }, env });
  await run(gp({ vibrationActuator: { effects: ['dual-rumble'], playEffect() {}, reset() {} } }));
  assert.ok(log.includes('browser: UA')); assert.ok(log.includes('effects: ["dual-rumble"]'));
  assert.deepEqual(played, [['dual-rumble', 'self-test body', 500], ['trigger-rumble', 'self-test triggers', 500]]);
  log.length = 0; played.length = 0;
  await run(gp({ vibrationActuator: null }));
  assert.ok(log.includes("'vibrationActuator' in gamepad: true · value: null")); assert.deepEqual(played, []);
  log.length = 0;
  await run(null);
  assert.ok(log.includes('controller: none selected. Press a button on it first.')); assert.deepEqual(played, []);
});

test('supports, describe and the patterns (D-7)', () => {
  assert.deepEqual(supports(null), { dual: false, trigger: false });
  assert.deepEqual(supports({ effects: ['dual-rumble'] }), { dual: true, trigger: false });
  assert.deepEqual(supports({ type: 'dual-rumble' }), { dual: true, trigger: null });
  assert.deepEqual(supports({}), { dual: null, trigger: null });
  assert.equal(describe({ kind: 'pad', index: 1, id: 'G29', mapping: '', lost: true }), 'pad 1 "G29" mapping "" · lost');
  assert.equal(describe({ kind: 'keys', scheme: 'all' }), 'keys all');
  assert.equal(describe({ kind: 'touch' }), 'touch');
  assert.equal(describe({ kind: 'hid', key: 'k1', id: 'Pedals', lost: false }), 'hid k1 "Pedals"');
  assert.equal(describe(null), '-');
  assert.equal(PATTERNS.length, 12);
  for (const p of PATTERNS) {
    let last = -1;
    for (const [at, type, params] of p.steps) {
      assert.ok(at >= last, `${p.name}: steps in time order`); last = at;
      assert.ok(type === 'dual-rumble' || type === 'trigger-rumble');
      assert.ok(params.duration >= 10 && params.startDelay === 0);
      if (type === 'trigger-rumble') assert.equal(p.trig, true, `${p.name} uses the triggers`);
    }
  }
});
