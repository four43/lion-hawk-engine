// src/view/bench/pads.js
// [D-7] ?debug=pads: the pad bench, the Gamepad Bench artifact as an engine overlay. boot loads it only behind the flag.
// It reads view state only (localPlayers, unpaired(), gamepad(dev), onSeat) and the engine's haptics stops for its log; it
// never changes seats or bindings. Its haptics tests drive the selected pad's vibrationActuator, as a game does.
// Cost: the dynamic import() in boot is inlined by the build, so this file and padStats.js ship inside every bundle, but
// nothing here is evaluated, and no listener or device exists, unless ?debug=pads is on.
import { zeroEffect } from '../haptics.js';
import { STD_BUTTONS, STD_AXES, SECTORS, PATTERNS, createPadStats, updateStats, rate, stickEdge, liveState, liveEffect, play, selfTest, supports, describe } from './padStats.js';

const CSS = `[data-lh-bench]{position:fixed;top:calc(var(--lh-sa-top,0px) + 8px);right:calc(var(--lh-sa-right,0px) + 8px);z-index:2147483000;width:min(440px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:#0d1117f0;color:#e6edf3;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;pointer-events:auto}
[data-lh-bench] h3{margin:10px 0 4px;font-size:11px;color:#7d8590;text-transform:uppercase;letter-spacing:.05em}
[data-lh-bench] button{font:inherit;color:inherit;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:3px 6px;margin:2px;cursor:pointer}
[data-lh-bench] button[aria-pressed=true]{border-color:#2f81f7}
[data-lh-bench] table{width:100%;border-collapse:collapse}[data-lh-bench] td,[data-lh-bench] th{padding:1px 4px;text-align:left;white-space:nowrap}
[data-lh-bench] tr.on{color:#3fb950}[data-lh-bench] .err{color:#f85149}[data-lh-bench] .ok{color:#3fb950}[data-lh-bench] .sys{color:#7d8590}
[data-lh-bench] fieldset{border:1px solid #30363d;border-radius:4px;margin:6px 0;padding:4px 6px}
[data-lh-bench] label{display:flex;gap:6px;align-items:center}[data-lh-bench] input[type=range]{flex:1}
[data-lh-bench] ol,[data-lh-bench] ul{margin:0;padding-left:12px}[data-lh-bench] ol{list-style:none;padding:0;max-height:160px;overflow:auto}
[data-lh-bench] canvas{width:160px;height:160px;background:#010409;border-radius:4px}
[data-lh-bench] dl{display:grid;grid-template-columns:auto 1fr;gap:0 8px;margin:0}[data-lh-bench] dd{margin:0;overflow-wrap:anywhere}`;
// [id, label, min, max, step, value]: the artifact's controls and defaults
const SLIDERS = [
  ['dr-strong', 'strong', 0, 1, 0.01, 1], ['dr-weak', 'weak', 0, 1, 0.01, 0.5], ['dr-dur', 'duration ms', 10, 5000, 10, 400], ['dr-delay', 'start delay ms', 0, 2000, 10, 0],
  ['tr-left', 'left trigger', 0, 1, 0.01, 0.8], ['tr-right', 'right trigger', 0, 1, 0.01, 0.8], ['tr-strong', 'strong (body)', 0, 1, 0.01, 0], ['tr-weak', 'weak (body)', 0, 1, 0.01, 0], ['tr-dur', 'duration ms', 10, 5000, 10, 300],
  ['live-tap', 'tap interval ms', 80, 400, 10, 130], ['live-tap-len', 'tap length ms', 50, 150, 5, 60], ['live-curve', 'response curve', 0.3, 1.5, 0.05, 0.6],
  ['dz', 'deadzone', 0, 0.3, 0.01, 0.08],
];
const slider = id => { const [, label, min, max, step, value] = SLIDERS.find(s => s[0] === id); return `<label>${label}<input type="range" data-bench="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output data-out="${id}">${value}</output></label>`; };
const check = (id, label) => `<label><input type="checkbox" data-bench="${id}">${label}</label>`;
const hap = (id, label) => `<button type="button" data-hap="${id}">${label}</button>`;
const HTML = `<header><b>Pad bench</b> <span data-bench="fps"></span> <button type="button" data-bench="fold">hide</button></header>
<div data-bench="body">
<h3>Seats</h3><div data-bench="seats"></div>
<h3>Pads</h3><nav data-bench="tabs"></nav><dl data-bench="info"></dl>
<table><thead><tr><th>#</th><th>button</th><th>state</th><th>value</th><th>peak</th><th>presses</th></tr></thead><tbody data-bench="buttons"></tbody></table>
<table><thead><tr><th>#</th><th>axis</th><th>value</th><th>min</th><th>max</th></tr></thead><tbody data-bench="axes"></tbody></table>
<h3>Sticks</h3><div><canvas data-bench="stick0" width="160" height="160"></canvas> <canvas data-bench="stick1" width="160" height="160"></canvas></div><pre data-bench="sticks"></pre>
${slider('dz')}<button type="button" data-bench="trace-clear">clear traces</button>
<h3>Haptics</h3><dl data-bench="support"></dl>
<fieldset><legend>Body: dual-rumble</legend>${slider('dr-strong')}${slider('dr-weak')}${slider('dr-dur')}${slider('dr-delay')}${hap('dual', 'Play')}${hap('dual-strong', 'Strong motor')}${hap('dual-weak', 'Weak motor')}</fieldset>
<fieldset><legend>Triggers: trigger-rumble</legend>${slider('tr-left')}${slider('tr-right')}${slider('tr-strong')}${slider('tr-weak')}${slider('tr-dur')}${hap('trig-both', 'Both')}${hap('trig-l', 'Left')}${hap('trig-r', 'Right')}</fieldset>
<fieldset><legend>Patterns</legend><div data-bench="patterns"></div></fieldset>
<fieldset><legend>Live</legend>${check('live-trig', 'trigger pull taps that trigger')}${check('live-body', 'trigger pull drives the body (LT strong, RT weak)')}${check('live-stick', 'left stick drives the body')}${slider('live-tap')}${slider('live-tap-len')}${slider('live-curve')}</fieldset>
<button type="button" data-bench="self-test">Self-test</button><button type="button" data-bench="stop">Stop all</button>
<h3>Haptics log</h3><ol data-bench="hlog"></ol>
<h3>Log</h3><ol data-bench="log"></ol>
</div>`;
const btnName = (p, i) => (p.mapping === 'standard' && STD_BUTTONS[i]) || `button ${i}`;
const axName = (p, i) => (p.mapping === 'standard' && STD_AXES[i]) || `axis ${i}`;
const signed = v => (v >= 0 ? '+' : '') + v.toFixed(4);

function drawStick(cv, x, y, s, k, dz) {
  let ctx = null; try { ctx = cv.getContext?.('2d') ?? null; } catch { ctx = null; } // happy-dom and some test pages: no 2D context
  if (!ctx) return;
  const w = cv.width, c = w / 2, R = w * 0.42;
  ctx.clearRect(0, 0, w, w);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
  ctx.strokeStyle = '#d29922'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c, c, R * dz, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#f85149'; ctx.lineWidth = 2; ctx.beginPath();
  let started = false;
  for (let i = 0; i <= SECTORS; i++) {
    const m = s.bins[k][i % SECTORS]; if (!m) { started = false; continue; }
    const ang = ((i % SECTORS) + 0.5) / SECTORS * 2 * Math.PI - Math.PI, px = c + Math.cos(ang) * m * R, py = c + Math.sin(ang) * m * R;
    if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
  }
  ctx.stroke();
  ctx.fillStyle = '#2f81f7'; ctx.globalAlpha = 0.35;
  for (const [tx, ty] of s.trace[k]) ctx.fillRect(c + tx * R - 1, c + ty * R - 1, 2, 2);
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(c + x * R, c + y * R, 5, 0, 2 * Math.PI); ctx.fill();
}

export function openPadBench(view, { doc = globalThis.document, haptics = null, now = () => globalThis.performance.now(), timer = globalThis, env = {} } = {}) {
  const style = doc.createElement('style'); style.setAttribute('data-lh-bench-style', ''); style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
  const root = doc.createElement('section'); root.setAttribute('data-lh-bench', 'pads'); root.innerHTML = HTML; // static markup: every live value goes in through textContent
  doc.body.appendChild(root);
  const q = id => root.querySelector(`[data-bench="${id}"]`);
  const num = id => +q(id).value, on = id => q(id).checked === true;
  const T0 = now(), stamp = () => ((now() - T0) / 1000).toFixed(3).padStart(8, ' ');
  const logTo = (list, max) => (text, cls = '') => {
    const li = doc.createElement('li'); if (cls) li.className = cls; li.textContent = `${stamp()}  ${text}`;
    list.prepend(li); while (list.childElementCount > max) list.lastElementChild.remove();
  };
  const log = logTo(q('log'), 300), hlog = logTo(q('hlog'), 60);
  const stats = new Map(), frames = [];
  let closed = false, sel = null, current = null, seatsSig = '', tabsSig = '', infoSig = '', btnSig = '', axSig = '', supSig = '', btnRows = [], axRows = [], seq = [], lst = liveState();

  for (const inp of root.querySelectorAll('input[type="range"]')) {
    const out = root.querySelector(`[data-out="${inp.getAttribute('data-bench')}"]`);
    inp.addEventListener('input', () => { out.textContent = inp.value; });
  }
  const offSeat = view.onSeat(e => log(`${e.type} · seat ${e.seat ?? '-'} · ${describe(e.device)}${e.op ? ` · ${e.op}` : ''}`, e.type === 'seat.lost' ? 'err' : 'sys'));
  const offStop = haptics?.on(e => hlog(`engine stop (${e.reason}): zero effect + reset for ${e.frames} frames`, 'sys')) ?? null;

  // haptics on the selected pad
  const act = () => current?.vibrationActuator ?? null;
  const hplay = (type, params, label, quiet = false, a = act()) => play(a, type, params, { log: hlog, label, quiet, timer, alive: () => !closed });
  // the engine's zero effect first, then reset: a tap queued a frame ago can overtake a lone reset (as dispose does)
  const reset = label => {
    const a = act(); if (typeof a?.reset !== 'function') return;
    try { Promise.resolve(a.playEffect?.(...zeroEffect(a))).catch(() => {}); } catch { /* no rumble to stop */ }
    try { Promise.resolve(a.reset()).then(r => hlog(`${label}: ${r}`, 'ok'), e => hlog(`${label}: ${e?.name}: ${e?.message}`, 'err')); }
    catch (e) { hlog(`${label}: ${e?.name}: ${e?.message}`, 'err'); }
  };
  const dual = (s, w) => ({ startDelay: num('dr-delay'), duration: num('dr-dur'), strongMagnitude: s, weakMagnitude: w });
  const trig = (l, r) => ({ startDelay: 0, duration: num('tr-dur'), leftTrigger: l, rightTrigger: r, strongMagnitude: num('tr-strong'), weakMagnitude: num('tr-weak') });
  const HAP = {
    dual: () => hplay('dual-rumble', dual(num('dr-strong'), num('dr-weak')), 'Body'),
    'dual-strong': () => hplay('dual-rumble', dual(num('dr-strong') || 1, 0), 'Strong motor'),
    'dual-weak': () => hplay('dual-rumble', dual(0, num('dr-weak') || 1), 'Weak motor'),
    'trig-both': () => hplay('trigger-rumble', trig(num('tr-left'), num('tr-right')), 'Triggers'),
    'trig-l': () => hplay('trigger-rumble', trig(num('tr-left'), 0), 'Left trigger'),
    'trig-r': () => hplay('trigger-rumble', trig(0, num('tr-right')), 'Right trigger'),
  };
  for (const b of root.querySelectorAll('[data-hap]')) b.addEventListener('click', () => { HAP[b.getAttribute('data-hap')](); });
  const stopSeq = () => { for (const t of seq) timer.clearTimeout(t); seq = []; };
  const runPattern = p => {
    stopSeq();
    const a = act(); // the pattern stays on the pad it started on
    if (!a) { hlog(`${p.name}: this pad has no vibrationActuator`, 'err'); return; }
    if (p.trig && supports(a).trigger === false) hlog(`${p.name}: the pad does not list trigger-rumble; expect an error`, 'err');
    hlog(`${p.name}: ${p.steps.length} effect(s)`);
    p.steps.forEach(([at, type, params], i) => { seq.push(timer.setTimeout(() => { hplay(type, params, p.name, i < p.steps.length - 1, a); }, at)); });
  };
  for (const p of PATTERNS) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = `${p.name}${p.trig ? ' (triggers)' : ''}`; b.title = p.sub;
    b.addEventListener('click', () => runPattern(p)); q('patterns').appendChild(b);
  }
  q('self-test').addEventListener('click', () => {
    selfTest(current, { log: hlog, play: (type, params, label) => hplay(type, params, label),
      env: { userAgent: globalThis.navigator?.userAgent, focused: doc.hasFocus?.(), visibility: doc.visibilityState, secure: globalThis.isSecureContext, ...env } });
  });
  q('stop').addEventListener('click', () => {
    stopSeq(); for (const id of ['live-trig', 'live-body', 'live-stick']) q(id).checked = false;
    lst = liveState(); reset('Stop all');
  });
  q('trace-clear').addEventListener('click', () => { for (const s of stats.values()) { s.trace = [[], []]; s.bins = [new Float32Array(SECTORS), new Float32Array(SECTORS)]; } });
  q('fold').addEventListener('click', () => { const b = q('body'); b.hidden = !b.hidden; q('fold').textContent = b.hidden ? 'show' : 'hide'; });
  const live = t => {
    const tg = on('live-trig'), body = on('live-body'), stick = on('live-stick');
    if (!(tg || body || stick) || !act()) { if (lst.active) { lst = liveState(); reset('live off'); } return; }
    const b = current.buttons ?? [], a = current.axes ?? [];
    const e = liveEffect(lst, { L: b[6]?.value ?? 0, R: b[7]?.value ?? 0, stick: Math.min(1, Math.hypot(a[0] ?? 0, a[1] ?? 0)) }, t,
      { trig: tg, body, stickBody: stick, interval: num('live-tap'), length: num('live-tap-len'), curve: num('live-curve') });
    if (e === 'idle') reset('live idle'); else if (e !== null) hplay(e.type, e.params, 'live', true);
  };

  // rendering: each part is rebuilt only when what it shows changes
  const dl = (box, rows) => {
    box.replaceChildren();
    for (const [k, v] of rows) { const dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = k; dd.textContent = v; box.append(dt, dd); }
  };
  const padDevices = () => {
    const out = [];
    for (const lp of view.localPlayers) for (const d of lp.devices) if (d.kind === 'pad') out.push(d);
    for (const d of view.unpaired()) if (d.kind === 'pad') out.push(d);
    return out;
  };
  const renderSeats = () => {
    const groups = [];
    for (const lp of view.localPlayers) {
      groups.push([`P${lp.controller?.player ?? '?'} · seat ${lp.seat}${lp.pending ? ' · pending' : ''}${lp.leaving ? ' · leaving' : ''}${lp.lost ? ' · a device is lost' : ''} · profile "${lp.bindings.profile}" · contexts [${lp.contexts.list.join(', ')}]`, lp.devices.map(describe)]);
    }
    const free = view.unpaired(); if (free.length) groups.push(['unpaired', free.map(describe)]);
    const sig = JSON.stringify(groups); if (sig === seatsSig) return; seatsSig = sig;
    const box = q('seats'); box.replaceChildren();
    for (const [head, devs] of groups) {
      const div = doc.createElement('div'), b = doc.createElement('b'), ul = doc.createElement('ul');
      b.textContent = head; div.appendChild(b);
      for (const d of devs) { const li = doc.createElement('li'); li.textContent = d; ul.appendChild(li); }
      div.appendChild(ul); box.appendChild(div);
    }
  };
  const renderTabs = devs => {
    const sig = devs.map(d => `${d.index}|${d.id}|${d.lost}`).join(',') + '#' + devs.indexOf(sel);
    if (sig === tabsSig) return; tabsSig = sig;
    const nav = q('tabs'); nav.replaceChildren();
    for (const d of devs) {
      const b = doc.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(d === sel));
      b.textContent = `pad ${d.index}${d.lost ? ' (lost)' : ''}`; b.title = d.id;
      b.addEventListener('click', () => { sel = d; tabsSig = ''; }); nav.appendChild(b);
    }
  };
  const rows = (body, n, cols, label) => Array.from({ length: n }, (_, i) => {
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c++) tr.appendChild(doc.createElement('td'));
    tr.children[0].textContent = String(i); tr.children[1].textContent = label(i); body.appendChild(tr);
    return tr;
  });
  const renderPad = (p, s) => {
    if (!p || !s) {
      if (infoSig !== 'none') { infoSig = 'none'; dl(q('info'), [['pad', sel?.lost ? 'lost' : 'none yet: press a button on a controller']]); q('buttons').replaceChildren(); q('axes').replaceChildren(); btnSig = axSig = ''; }
      return;
    }
    const a = p.vibrationActuator ?? null, bs = p.buttons ?? [], as = p.axes ?? [];
    const info = [['id', p.id], ['index', String(p.index)], ['mapping', `"${p.mapping ?? ''}"${p.mapping === 'standard' ? ' (standard)' : ' (raw channels)'}`],
      ['axes / buttons', `${as.length} / ${bs.length}`], ['update rate', `${rate(s)} /s`],
      ['effects', a ? ('effects' in a ? `[${Array.from(a.effects ?? []).join(', ')}]` : 'not listed') : 'no vibrationActuator']];
    const sig = JSON.stringify(info); if (sig !== infoSig) { infoSig = sig; dl(q('info'), info); }
    const bk = `${p.index}|${p.id}|${bs.length}|${p.mapping}`;
    if (bk !== btnSig) { btnSig = bk; q('buttons').replaceChildren(); btnRows = rows(q('buttons'), bs.length, 6, i => btnName(p, i)); }
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], c = btnRows[i].children, d = b?.pressed === true;
      btnRows[i].className = d ? 'on' : '';
      c[2].textContent = d ? 'pressed' : b?.touched ? 'touched' : 'up'; c[3].textContent = (b?.value ?? 0).toFixed(3);
      c[4].textContent = (s.peak[i] ?? 0).toFixed(3); c[5].textContent = String(s.presses[i] ?? 0);
    }
    const ak = `${p.index}|${p.id}|${as.length}|${p.mapping}`;
    if (ak !== axSig) { axSig = ak; q('axes').replaceChildren(); axRows = rows(q('axes'), as.length, 5, i => axName(p, i)); }
    for (let i = 0; i < as.length; i++) {
      const c = axRows[i].children;
      c[2].textContent = signed(as[i] ?? 0); c[3].textContent = (s.min[i] ?? 0).toFixed(3); c[4].textContent = (s.max[i] ?? 0).toFixed(3);
    }
    const dz = num('dz'), out = [];
    for (let k = 0; k < 2; k++) {
      const x = as[k * 2], y = as[k * 2 + 1], label = k === 0 ? 'left stick' : 'right stick';
      if (x === undefined || y === undefined) { out.push(`${label}: axes ${k * 2}/${k * 2 + 1} not reported`); continue; }
      const m = Math.hypot(x, y), e = stickEdge(s, k);
      out.push(`${label}  x ${x.toFixed(3)}  y ${y.toFixed(3)}  r ${m.toFixed(3)}${m < dz ? ' (in deadzone)' : ''}\n  rest drift r ${s.rest[k].toFixed(3)} · ${e ? `edge ${e.avg.toFixed(2)} avg, ${e.lo.toFixed(2)}-${e.hi.toFixed(2)}, ${e.filled}/${SECTORS} sectors` : 'roll the stick round its edge'}`);
      drawStick(q(`stick${k}`), x, y, s, k, dz);
    }
    q('sticks').textContent = out.join('\n');
    const sup = supports(a), yn = v => (v === true ? 'yes' : v === false ? 'no' : 'not listed: try it');
    const support = [['vibrationActuator', a ? 'yes' : 'no'], ['dual-rumble', yn(sup.dual)], ['trigger-rumble', yn(sup.trigger)]];
    const ss = JSON.stringify(support); if (ss !== supSig) { supSig = ss; dl(q('support'), support); }
  };

  return {
    el: root,
    update() {
      const t = now();
      frames.push(t); while (frames.length && t - frames[0] > 1000) frames.shift();
      q('fps').textContent = `${frames.length} fps`;
      const devs = padDevices();
      for (const d of devs) {
        const gp = view.gamepad(d); if (!gp) continue;
        let s = stats.get(d); if (s === undefined || s.id !== gp.id) stats.set(d, s = createPadStats(gp, t));
        updateStats(s, gp, t, (i, down, v) => log(`pad ${gp.index} · ${btnName(gp, i)} [${i}] ${down ? `down · ${v.toFixed(3)}` : 'up'}`));
      }
      if (!devs.includes(sel)) sel = devs.find(d => !d.lost) ?? devs[0] ?? null;
      renderSeats(); renderTabs(devs);
      current = sel === null ? null : view.gamepad(sel);
      renderPad(current, current ? stats.get(sel) : null);
      live(t);
    },
    dispose() {
      if (closed) return;
      // leave no pad rumbling: stop patterns and live taps, then zero every reachable pad, before the bench goes quiet
      stopSeq(); lst = liveState();
      for (const d of padDevices()) {
        const a = view.gamepad(d)?.vibrationActuator; if (!a) continue;
        try { Promise.resolve(a.playEffect?.(...zeroEffect(a))).catch(() => {}); } catch { /* no rumble to stop */ }
        try { Promise.resolve(a.reset?.()).catch(() => {}); } catch { /* none */ }
      }
      closed = true; offSeat(); offStop?.(); root.remove(); style.remove(); },
  };
}
