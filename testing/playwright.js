// lion-hawk/playwright: real-browser helpers (spec §7.5): device presets, Chromium launch, openGame with an in-page
// `game` driver (stepping inside the page, real taps, CDP multi-touch) and layout assertions for node:test suites.
import { AssertionError } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createMemoryHub } from '../src/index.net.js';
import { rng } from '../src/core/rng.js';

const NOTCH_L = { top: 0, right: 59, bottom: 21, left: 59 }, NOTCH_P = { top: 59, right: 0, bottom: 34, left: 0 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 }, IPAD = { top: 24, right: 0, bottom: 20, left: 0 };
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Safe areas Chromium cannot emulate (env() is 0 there): injected as --lh-sa-* variables instead.
export const presets = Object.freeze({
  'iPhone SE': { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IOS, safeArea: NONE },
  'iPhone 15 Pro landscape': { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IOS, safeArea: NOTCH_L },
  'iPhone 15 Pro portrait': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IOS, safeArea: NOTCH_P },
  'iPad Pro 11 landscape': { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD, safeArea: IPAD },
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, safeArea: NONE },
});

function findChromium() {
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch { /* fall through */ }
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  let dirs = []; try { dirs = fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)); } catch { /* no cache */ }
  dirs.sort((a, b) => parseInt(a.slice(9)) - parseInt(b.slice(9)));
  for (const d of dirs.reverse()) {
    const base = path.join(cache, d);
    for (const sub of fs.readdirSync(base).filter(s => /^chrome-linux/.test(s))) { const p = path.join(base, sub, 'chrome'); if (fs.existsSync(p)) return p; }
  }
  return null;
}

export async function launch({ headless = true } = {}) {
  const executablePath = findChromium();
  if (!executablePath) throw new Error('playwright: no chromium found (run npx playwright-core install chromium)');
  const browser = await chromium.launch({ executablePath, headless, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  return { browser, executablePath, close: () => browser.close() };
}

// ---- in-page helpers (serialised into page.evaluate; they must not close over anything) ----

export function formatFailure(what, f, maxSteps) {
  return `${what}: condition not met after ${maxSteps ?? f.k} steps (step ${f.step}, scene ${f.scene}${f.overlays?.length ? ' + ' + f.overlays.join(',') : ''})\nlast events:\n${(f.events ?? []).map(e => '  ' + JSON.stringify(e)).join('\n') || '  (none)'}`;
}

// The driver. `page` and `context` are Playwright objects (or fakes in unit tests); one page.evaluate per method.
export function gameDriver({ page, context, preset, presetName, errors = [] }) {
  let cdp = null;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const fnSource = f => typeof f === 'function' ? f.toString() : String(f);

  // #50: an in-page loop can't wait out a load whose settle is held by view.wait (the promise needs the page's event
  // loop). Each loop below hands back to Node when `engine.loading.phase === 'settle'` with blocks pending; Node polls
  // until the blocks clear (bounded by `timeout` ms of real time), then the loop continues where it stopped.
  const unblocked = async (what, t0, timeout) => {
    for (;;) {
      const b = await ev(() => { const l = window.engine.loading; return l.phase === 'settle' ? [...(l.blocks ?? [])] : []; });
      if (!b.length) return;
      if (Date.now() - t0 >= timeout) throw new Error(`${what}: load still blocked by ${b.join(', ')} after ${timeout} ms`);
      await new Promise(r => setTimeout(r, 20));
    }
  };
  const stalled = 'e.loading.phase === "settle" && e.loading.blocks.length > 0'; // in-page test, spliced into the loops

  // One evaluate per stretch: loop engine.stepN(1) in the page until the predicate source (or event type) hits, then render the DOM.
  const run = async (what, { pred, type }, { maxSteps = 1200, input, timeout = 30000 } = {}) => {
    const t0 = Date.now(); let from = 0, mark = null;
    for (;;) {
      const r = await ev(({ pred, type, maxSteps, input, from, mark, stalled }) => {
        const e = window.engine, held = input ? Object.keys(input) : [], blocked = new Function('e', `return ${stalled}`);
        if (input) e.input.hold(input);
        try {
          const test = pred ? new Function(`return (${pred})`)() : null;
          if (mark === null) { mark = 0; const all = e.events.since(0); if (all.length) mark = all[all.length - 1].seq ?? all.length; }
          for (let k = from; k <= maxSteps; k++) {
            if (type ? e.events.since(mark).some(x => x.type === type) : test(e.state(), e)) { e.render(0); return { k }; }
            if (k < maxSteps) { if (blocked(e)) { e.render(0); return { wait: true, k, mark }; } e.stepN(1); }
          }
          e.render(0);
          return { fail: true, step: e.state().step, scene: e.scene.name, overlays: [...e.scene.overlays], events: e.events.since(0).slice(-8) };
        } finally { if (held.length) e.input.release(...held); }
      }, { pred, type, maxSteps, input, from, mark, stalled });
      if (r.wait) { from = r.k; mark = r.mark; await unblocked(what, t0, timeout); continue; }
      if (r.fail) throw new Error(formatFailure(what, r, maxSteps));
      return r.k;
    }
  };
  // n steps, pausing (as above) while a load's settle is blocked; returns the step counter
  const stepN = async (n, input, timeout = 30000) => {
    const t0 = Date.now(); let left = n;
    for (;;) {
      const r = await ev(({ left, input, stalled }) => {
        const e = window.engine, blocked = new Function('e', `return ${stalled}`); if (input) e.input.hold(input);
        try { while (left > 0 && !blocked(e)) { e.stepN(1); left--; } e.render(0); } finally { if (input) e.input.release(...Object.keys(input)); }
        return { left, step: e.state().step };
      }, { left, input, stalled });
      if (r.left === 0) return r.step;
      left = r.left; await unblocked('step', t0, timeout);
    }
  };
  // steps until no load is active, waiting out view.wait blocks; returns the steps taken. #100: commands pending at the call
  // are delivered at the next step and may start a load, so that step is taken first (s0: the step it must leave; -1 none)
  const untilLoaded = async ({ maxSteps = 1200, timeout = 30000 } = {}) => {
    const t0 = Date.now(); let k = 0, s0 = null;
    for (;;) {
      const r = await ev(({ k, maxSteps, stalled, s0 }) => {
        const e = window.engine, blocked = new Function('e', `return ${stalled}`);
        if (s0 === null) s0 = e.commands.pending > 0 ? e.time.step : -1;
        for (; k <= maxSteps; k++) {
          if (!e.loading.active && e.time.step !== s0) { e.render(0); return { k }; }
          if (k < maxSteps) { if (blocked(e)) { e.render(0); return { wait: true, k, s0 }; } e.stepN(1); }
        }
        e.render(0); return { fail: true, k, step: e.state().step, scene: e.scene.name, overlays: [...e.scene.overlays], events: e.events.since(0).slice(-8) };
      }, { k, maxSteps, stalled, s0 });
      if (r.wait) { k = r.k; s0 = r.s0; await unblocked('untilLoaded', t0, timeout); continue; }
      if (r.fail) throw new Error(formatFailure('untilLoaded', r, maxSteps));
      return r.k;
    }
  };

  // s seconds of engine time through engine.advance, one step's worth at a time, pausing (as above) while a load's settle
  // is blocked; the chunks add up to s, so the accumulator keeps the same remainder; returns the step counter
  const seconds = async (s, input, timeout = 30000) => {
    const t0 = Date.now(); let left = Math.max(s, 0);
    for (;;) {
      const r = await ev(({ left, input, stalled }) => {
        const e = window.engine, blocked = new Function('e', `return ${stalled}`), dt = 1 / e.hz; if (input) e.input.hold(input);
        try { while (left > 0 && !blocked(e)) { const c = Math.min(left, dt); e.advance(c); left -= c; } e.render(0); } finally { if (input) e.input.release(...Object.keys(input)); }
        return { left, step: e.state().step };
      }, { left, input, stalled });
      if (r.left <= 0) return r.step;
      left = r.left; await unblocked('seconds', t0, timeout);
    }
  };

  const point = async target => {
    if (typeof target === 'string') {
      const b = await page.locator(target).first().boundingBox();
      if (!b) throw new Error(`touch: '${target}' has no box`);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    if (target.world) {
      const p = await ev(w => { const v = window.engine.view; if (!v?.project) return null; return v.project(w); }, target.world);
      if (!p) throw new Error('touch: { world } needs engine.view.project (not provided by this game)');
      if (p.onScreen === false) throw new Error(`touch: { world } point is off-screen or behind the camera (${JSON.stringify(target.world)})`); // #73: a project without onScreen keeps the old behaviour
      return { x: p.x, y: p.y };
    }
    return { x: target.x, y: target.y };
  };
  const send = async (type, pts) => {
    cdp ??= await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
  };
  const active = new Map(), pressed = new Map();

  const game = {
    page, preset, presetName,
    point, // #65: selector | { x, y } | { world } -> client { x, y }, for page.mouse gestures on world points
    step: (n, input) => stepN(n, input),
    seconds: (s, input, timeout) => seconds(s, input, timeout),
    until: (fn, opts) => run('until', { pred: fnSource(fn) }, opts),
    untilEvent: (type, opts) => run(`untilEvent(${type})`, { type }, opts),
    untilLoaded, // #50: { maxSteps = 1200, timeout = 30000 }
    render: () => ev(() => window.engine.render(0)),
    state: () => ev(() => JSON.parse(JSON.stringify(window.engine.state()))),
    scene: () => ev(() => { const s = window.engine.scene; return { name: s.name, args: s.args, overlays: [...s.overlays] }; }),
    go: (name, args) => ev(([n, a]) => window.engine.go(n, a), [name, args]),
    jump: (scene, preset, opts, args) => ev(a => window.engine.jump(...a), [scene, preset, opts, args]),
    command: (type, data) => ev(([t, d]) => { window.engine.command(t, d); window.engine.render(0); }, [type, data]), // #5
    input: {
      hold: p => ev(p => window.engine.input.hold(p), p),
      release: (...n) => ev(n => window.engine.input.release(...n), n),
    },
    async tap(testid) {
      const loc = page.locator(`[data-testid="${testid}"]`);
      if (preset.hasTouch) {
        // through the same CDP touch device the stick uses: mixing it with Playwright's own tap() loses the click
        await loc.waitFor({ state: 'visible' });
        const b = await loc.boundingBox(), c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        await send('touchStart', [{ ...c, id: 0 }]); await send('touchEnd', []);
      } else await loc.click();
      // the browser delivers a touch tap's click a frame later: wait two frames so the engine has seen it
      await ev(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { window.engine.render(0); r(); }))));
    },
    async fill(testid, text) {
      const loc = page.locator(`[data-testid="${testid}"]`);
      await loc.fill(text); await loc.press('Enter');
      await ev(() => window.engine.render(0));
    },
    // #9: hold a control down (a CDP touch with id 90+ on touch presets, beside the active touches, the mouse on desktop); render after each so the DOM shows it
    async press(testid) {
      const loc = page.locator(`[data-testid="${testid}"]`).first();
      await loc.waitFor({ state: 'visible' });
      const b = await loc.boundingBox(), c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      if (preset.hasTouch) { // CDP touchStart lists every point that is down: keep the active touches (stick fingers) in it, tracked in `active`
        let id = 90; while (active.has(id)) id++;
        const p = { ...c, id }; pressed.set(testid, id); active.set(id, p); await send('touchStart', [...active.values()]);
      }
      else { await page.mouse.move(c.x, c.y); await page.mouse.down(); }
      await ev(() => window.engine.render(0));
    },
    async unpress(testid) {
      if (preset.hasTouch) { const id = pressed.get(testid); pressed.delete(testid); if (id !== undefined) { const p = active.get(id); active.delete(id); if (p) await send('touchEnd', [p]); } }
      else await page.mouse.up();
      await ev(() => window.engine.render(0));
    },
    touch: {
      async start(id, target) { const p = { ...(await point(target)), id }; active.set(id, p); await send('touchStart', [...active.values()]); },
      async move(id, target) { const p = { ...(await point(target)), id }; active.set(id, p); await send('touchMove', [...active.values()]); await ev(() => window.engine.render(0)); },
      async end(...ids) {
        const lifting = ids.filter(id => active.has(id)).map(id => active.get(id));
        for (const id of ids) active.delete(id);
        if (lifting.length) {
          // A lift straight after a fast move makes Chromium start a fling, which swallows the next tap's click.
          // A zero-velocity touchMove first does not avoid it, so dwell like a finger does.
          await new Promise(r => setTimeout(r, 150));
          await send('touchEnd', lifting); // CDP: touchEnd lists the points that LIFT; the rest stay down
        }
        await ev(() => window.engine.render(0));
      },
    },
    errors: async () => [...errors, ...(await ev(() => window.engine.errors.map(e => ({ ...e }))))],
    close: () => context.close(),
  };
  return game;
}

// the URL openGame loads: ?lh-test (or ?lh-test=render for render: 'manual', #47) plus seed, scene, args and extras
export function testUrl(url, { seed, scene, args, query = {}, render = 'auto' } = {}) {
  const u = new URL(url);
  u.searchParams.set('lh-test', render === 'manual' ? 'render' : '');
  if (seed !== undefined) u.searchParams.set('seed', String(seed));
  if (scene !== undefined) u.searchParams.set('scene', String(scene));
  if (args !== undefined) u.searchParams.set('args', JSON.stringify(args));
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  return u.href.replace('lh-test=&', 'lh-test&').replace(/lh-test=$/, 'lh-test');
}

// #74: initScript (a function or { content }) runs in the page before any of its scripts, e.g. to stub WebGL.
export function openGame(browser, url, opts) { return open(browser, url, opts); }
// `prepare(context, page)` runs before navigation (peers() exposes the bridge there)
async function open(browser, url, { preset = 'desktop', seed, scene, args, query = {}, settings, render = 'auto', initScript } = {}, prepare) {
  const p = typeof preset === 'string' ? presets[preset] : preset, name = typeof preset === 'string' ? preset : 'custom';
  if (!p) throw new Error(`playwright: unknown preset '${preset}' (known: ${Object.keys(presets).join(', ')})`);
  const { safeArea, ...ctxOpts } = p;
  const context = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({ type: 'pageerror', message: String(e) }));
  if (initScript) await context.addInitScript(initScript); // #74: on the context, so popups and new tabs (a join link) get it too
  if (prepare) await prepare(context, page);
  if (settings) await page.addInitScript(s => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* storage blocked */ } }, settings);
  const goto = testUrl(url, { seed, scene, args, query, render });
  await page.goto(goto);
  await page.evaluate(sa => { for (const [k, v] of Object.entries(sa)) document.documentElement.style.setProperty(`--lh-sa-${k}`, `${v}px`); }, safeArea);
  await page.waitForFunction(() => window.engine, null, { timeout: 30000 });
  await page.evaluate(() => window.engine.ready);
  await page.waitForFunction(() => window.engine.settled(), null, { timeout: 30000 });
  return gameDriver({ page, context, preset: p, presetName: name, errors });
}

// [T-20] n pages joined through one Node in-memory hub (lion-hawk/net's bridgeTransport on the page side, N-2). Page i opens
// with ?lh-test=render (render: 'manual', #107; pass render: 'auto' to opt out) and ?lh-bridge=host|guest (page 0 is the host) and argsOf(i, name) ?? args; the game binds its port to
// bridgeTransport() when it sees ?lh-bridge. room.step(n) does, n times, what mp() does: advance the hub clock by 1000 / hz,
// tick the hub, deliver each page's hub events in order, then step every open page once (manual mode: deterministic), waiting
// after each page's step until Node has every send it made. Closing a page's driver leaves the hub for it.
// A page reload restarts info.sent at 0 while Node's sequence counter keeps its value, so that page's bridge stalls: don't navigate.
const BRIDGE_EVENTS = ['peer', 'peerLeft', 'peerAway', 'peerBack', 'hostAway', 'hostBack', 'closed'];
// The Node end of one page's bridge: the page's binding calls (seq, op, to, data, reliable, bytes) arrive asynchronously and are
// applied to its hub net in seq order (a later call waits for the earlier ones); byte arrays become ArrayBuffers again.
export function bridgeEnd(net) {
  const held = new Map(); let next = 0;
  const end = { closed: false, onCall: null, get next() { return next; },
    call(seq, ...a) {
      held.set(seq, a);
      while (held.has(next)) {
        const [op, to, data, reliable, bytes] = held.get(next); held.delete(next); next++;
        if (end.closed) continue;
        if (op === 'leave') net.leave(); else net.send(to, bytes ? new Uint8Array(data).buffer : data, reliable); // the hub copies, as between two Node peers
      }
      end.onCall?.();
    } };
  return end;
}
export async function peers(browser, url, n, { link = {}, preset = 'desktop', seed = 1, args, argsOf, query = {}, timeout = 10000, render = 'manual', ...rest } = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error('peers: n must be a positive integer');
  const hub = createMemoryHub({ rng: rng(seed).fork('peers.link').next, ...link }), list = [];
  let k = 0, hz = null;
  const flush = async p => { // the hub's events and messages for this page, in order, in one evaluate
    if (!p.inbox.length) return;
    const batch = p.inbox.splice(0);
    await p.game.page.evaluate(b => { const f = window.__lhBridgeIn; for (const a of b) f(...a); }, batch);
  };
  const caught = async p => { // waits until every call the page has made (info.sent) reached Node
    const sent = await p.game.page.evaluate(() => window.__lhBridgeInfo.sent), end = p.end;
    if (end.next >= sent) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { end.onCall = null; reject(new Error(`peers: page ${p.index} made ${sent} bridge calls, only ${end.next} arrived in ${timeout} ms`)); }, timeout);
      end.onCall = () => { if (end.next >= sent) { clearTimeout(timer); end.onCall = null; resolve(); } };
    });
  };
  for (let i = 0; i < n; i++) try {
    const role = i ? 'guest' : 'host', name = i ? `guest${i}` : 'host';
    const net = i ? hub.join() : hub.host();
    const p = { index: i, name, role, net, inbox: [], end: bridgeEnd(net), closed: false, game: null };
    for (const e of BRIDGE_EVENTS) net.on(e, (...a) => p.inbox.push([e, ...a]));
    net.on('message', (from, d, reliable) => p.inbox.push(d instanceof ArrayBuffer ? ['message', from, [...new Uint8Array(d)], reliable, true] : ['message', from, d, reliable, false]));
    const prepare = async (context, page) => {
      await page.exposeBinding('__lhBridge', (src, ...a) => p.end.call(...a));
      await page.addInitScript(info => {
        window.__lhBridgeInfo = info;
        const queue = [], early = (...a) => { queue.push(a); }; early.queue = queue; window.__lhBridgeIn = early; // until bridgeTransport() takes over
      }, { isHost: !i, id: net.id, hostId: net.hostId, sent: 0 });
    };
    const a = argsOf ? argsOf(i, name) : args;
    p.game = await open(browser, url, { ...rest, render, preset, seed, args: a, query: { ...query, 'lh-bridge': role } }, prepare); // #107: manual by default
    const close = p.game.close;
    p.game.close = async () => { if (p.closed) return; p.closed = p.end.closed = true; hub.leave(net.id, 'left'); await close(); };
    list.push(p);
  } catch (e) { // page i failed to open: close the pages already open, then rethrow
    for (const q of list) await q.game.close().catch(() => {});
    throw e;
  }
  hz = await list[0].game.page.evaluate(() => window.engine.hz);
  const room = {
    hub, games: list.map(p => p.game), get now() { return hub.now; },
    async step(count = 1) {
      for (let s = 0; s < count; s++) {
        k++; hub.tick(k * 1000 / hz);
        for (const p of list) if (!p.closed) { await flush(p); await p.game.step(1); await caught(p); }
      }
      return room;
    },
    async close() { for (const p of list) await p.game.close(); },
  };
  return room;
}

// ---- assertions ----
const fail = (msg, actual, expected) => { throw new AssertionError({ message: msg, actual, expected }); };
const getAt = (o, p) => p.split('.').reduce((v, k) => v?.[k], o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function expectScene(game, name) {
  const s = await game.scene();
  if (s.name !== name) fail(`expectScene: expected '${name}', got '${s.name}'`, s.name, name);
}
export async function expectState(game, p, value) {
  const v = getAt(await game.state(), p);
  if (!same(v, value)) fail(`expectState: ${p} is ${JSON.stringify(v)}, expected ${JSON.stringify(value)}`, v, value);
}

// #48: a target is a string (a test id for expectTappable, CSS for the others), { testid }, { css } or a Playwright
// locator (anything with evaluate). The in-page measurer is serialised: it closes over nothing.
const measure = el => {
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && Number(cs.opacity) > 0;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left, y: r.top, w: r.width, h: r.height, visible, hit: !!hit && (hit === el || el.contains(hit)) };
};
const bySelector = new Function('sel', `return (${measure.toString()})(document.querySelector(sel))`);
const target = (t, asTestid) => {
  if (typeof t === 'string') return asTestid ? { name: t, css: `[data-testid="${t}"]` } : { name: t, css: t };
  if (t && typeof t.evaluate === 'function') return { name: String(t), loc: t };
  if (t && typeof t.testid === 'string') return { name: t.testid, css: `[data-testid="${t.testid}"]` };
  if (t && typeof t.css === 'string') return { name: t.css, css: t.css };
  throw new TypeError('expect*: a target is a string, { testid }, { css } or a locator');
};
const boxOf = (game, t) => t.loc ? t.loc.evaluate(measure) : game.page.evaluate(bySelector, t.css);
const insideSafe = (game, b) => {
  const { viewport: v, safeArea: s } = game.preset;
  return b.x >= s.left - 0.5 && b.y >= s.top - 0.5 && b.x + b.w <= v.width - s.right + 0.5 && b.y + b.h <= v.height - s.bottom + 0.5;
};
const dims = b => `${b.w.toFixed(0)}x${b.h.toFixed(0)} at ${b.x.toFixed(0)},${b.y.toFixed(0)}`;

export async function expectFitsSafeArea(game, tgt) {
  const t = target(tgt), b = await boxOf(game, t);
  if (b.missing) fail(`expectFitsSafeArea: '${t.name}' not found`);
  if (!insideSafe(game, b)) fail(`expectFitsSafeArea: '${t.name}' (${dims(b)}) leaves the safe area ${JSON.stringify(game.preset.safeArea)}`);
}
export async function expectTappable(game, tgt, { min = 44 } = {}) {
  const t = target(tgt, true), b = await boxOf(game, t), n = t.name;
  if (b.missing) fail(`expectTappable: '${n}' not found`);
  if (!b.visible) fail(`expectTappable: '${n}' is not visible`);
  if (!insideSafe(game, b)) fail(`expectTappable: '${n}' (${dims(b)}) leaves the safe area ${JSON.stringify(game.preset.safeArea)}`);
  if (b.w < min || b.h < min) fail(`expectTappable: '${n}' is ${dims(b)}, needs at least ${min}x${min}`);
  if (!b.hit) fail(`expectTappable: '${n}' is covered at its centre (elementFromPoint is another element)`);
}
export async function expectNoOverlap(game, tgtA, tgtB) {
  const ta = target(tgtA), tb = target(tgtB), [a, b] = [await boxOf(game, ta), await boxOf(game, tb)];
  if (a.missing || b.missing) fail(`expectNoOverlap: '${a.missing ? ta.name : tb.name}' not found`);
  if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fail(`expectNoOverlap: '${ta.name}' (${dims(a)}) overlaps '${tb.name}' (${dims(b)})`);
}
