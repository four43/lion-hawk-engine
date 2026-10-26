// Audio service (#67, overview §4.9): one AudioContext per page, made and resumed inside a user gesture (iOS starts audio only
// there), suspended while the tab is hidden and resumed on return; after an interruption (a call, Siri) the next gesture
// resumes it. Games connect their synths to a bus (H-1): bus -> master -> mute gain -> compressor limiter (R-8 settings)
// -> speakers. load(url) fetches at once and decodes once a context exists (B-8: never mid-game); play(buffer, opts)
// plays a decoded buffer, optionally placed in the world (`at`, against the object given to listen(): distance
// volume). ctx and master stay null until the first gesture. View-only: sim code never imports this.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']; // iOS activates on pointerup/touchend/click, not a touch pointerdown
const LIMITER = Object.freeze({ threshold: -14, knee: 24, ratio: 4, attack: 0.005, release: 0.2 });
const POSITIONAL = Object.freeze({ ref: 18, near: 10, min: 0.05, max: 0.6, pan: 0, cull: Infinity });
const BUSES = Object.freeze(['sfx', 'music', 'ui', 'voice', 'ambience']); // H-1: master -> each bus -> sources
const short = url => { const s = String(url); return s.length > 48 ? `${s.slice(0, 45)}...` : s; };

export function createAudio({ doc = globalThis.document, flags = {}, AudioContext: AC, fetch: fetchFn, volume = 0.55, limiter = {}, positional = {}, buses = BUSES } = {}) {
  if (!doc?.addEventListener) throw new Error('createAudio: doc required');
  const win = doc.defaultView ?? globalThis.window;
  AC ??= win?.AudioContext ?? win?.webkitAudioContext; // false: no Web Audio (tests)
  fetchFn ??= win?.fetch ? win.fetch.bind(win) : globalThis.fetch?.bind(globalThis);
  const lim = { ...LIMITER, ...limiter }, pos = { ...POSITIONAL, ...positional };
  if (!Array.isArray(buses) || buses.some(b => typeof b !== 'string' || !b || b === 'master') || new Set(buses).size !== buses.length) throw new Error("createAudio: buses must be distinct names other than 'master'");
  const level = new Map(), ducks = new Map(), busNode = new Map(); // H-1: per-bus level, active duck factors, gain nodes
  for (const b of buses) { level.set(b, 1); ducks.set(b, []); }
  const voices = []; // H-2: live voices, placed by frame()
  let masterLevel = volume;
  const unlockFns = [], gestureFns = [], clips = new Map(), warned = new Set();
  let ctx = null, muteGain = null, muted = !!flags.mute, everUnlocked = false, armed = false, disposed = false, failed = false, listener = null;
  let readyOk, readyFail;
  const ready = new Promise((ok, fail) => { readyOk = ok; readyFail = fail; });
  ready.catch(() => {}); // with no Web Audio only load() reports it
  const warn = (key, ...args) => { if (!warned.has(key)) { warned.add(key); console.warn(...args); } };
  const call = fn => { try { fn(audio); } catch (err) { console.error('audio: listener failed', err); } };

  function make() {
    if (ctx || failed) return ctx;
    try {
      if (!AC) throw new Error('no AudioContext');
      const c = new AC(), m = c.createGain(), mg = c.createGain(), comp = c.createDynamicsCompressor();
      m.gain.value = masterLevel; mg.gain.value = muted ? 0 : 1;
      for (const k of Object.keys(LIMITER)) comp[k].value = lim[k];
      m.connect(mg); mg.connect(comp); comp.connect(c.destination);
      for (const b of buses) { const g = c.createGain(); g.gain.value = busGain(b); g.connect(m); busNode.set(b, g); }
      ctx = c; muteGain = mg; audio.ctx = c; audio.master = m;
      c.onstatechange = onState;
      readyOk(c);
    } catch (err) {
      failed = true; disarm(); warn('make', 'audio: no Web Audio', err);
      readyFail(new Error(`audio: no Web Audio (${err?.message ?? err})`));
    }
    return ctx;
  }
  function settle() { // the context runs: stop listening; the first time, tell the game
    if (disposed || !ctx || ctx.state !== 'running') return;
    disarm();
    if (!everUnlocked) { everUnlocked = true; for (const fn of unlockFns.splice(0)) call(fn); }
  }
  function tryResume() {
    const refused = err => warn('resume', 'audio: resume refused (the next gesture tries again)', err);
    try { Promise.resolve(ctx.resume()).then(settle, refused); } catch (err) { refused(err); }
  }
  function onGesture() {
    if (disposed) return;
    for (const fn of gestureFns.slice()) call(fn); // inside the gesture: speech priming and the like
    if (!make()) return;
    if (ctx.state === 'running') settle(); else tryResume();
  }
  function arm() { if (armed || disposed || failed) return; armed = true; for (const t of GESTURES) doc.addEventListener(t, onGesture, true); }
  function disarm() { if (!armed) return; armed = false; for (const t of GESTURES) doc.removeEventListener(t, onGesture, true); }
  function back() { // visible again or a page show: resume where the browser allows it, and listen for a gesture in case it does not
    if (disposed || !ctx || ctx.state === 'running' || ctx.state === 'closed' || doc.visibilityState === 'hidden') return;
    arm(); tryResume();
  }
  function onVisibility() {
    if (disposed || !ctx) return;
    if (doc.visibilityState !== 'hidden') { back(); return; }
    if (ctx.state !== 'running') return;
    const failedSuspend = err => warn('suspend', 'audio: suspend failed', err);
    try { Promise.resolve(ctx.suspend()).catch(failedSuspend); } catch (err) { failedSuspend(err); }
  }
  function onState() { // an interruption while visible (iOS 'interrupted', a call): the next gesture resumes
    if (disposed || !ctx) return;
    if (ctx.state === 'running') settle();
    else if (ctx.state !== 'closed' && doc.visibilityState !== 'hidden') arm();
  }
  function distanceGain(x, y, z) { // planar distance to the listener; y is ignored (ground games)
    if (!listener) return pos.max;
    return Math.max(pos.min, Math.min(pos.max, pos.ref / (dist(x, z) + pos.near)));
  }
  function dist(x, z) { return Math.hypot(x - listener.position.x, z - listener.position.z); }
  function panOf(x, z) { // -1 left .. 1 right of the listener (its world x axis)
    const lp = listener.position, e = listener.matrixWorld.elements, dx = x - lp.x, dz = z - lp.z, d = Math.hypot(dx, dz);
    return d < 1e-6 ? 0 : (dx * e[0] + dz * e[2]) / d;
  }
  const needBus = (name, who) => { if (!level.has(name)) throw new Error(`audio.${who}: unknown bus '${name}' (${buses.join(', ')})`); };
  const busGain = name => { let g = level.get(name); for (const d of ducks.get(name)) g *= d; return g; };
  const applyBus = (name, tc) => { const n = busNode.get(name); if (n) n.gain.setTargetAtTime(busGain(name), ctx.currentTime, tc); };
  function setVolume(name, v) { // H-1: 'master' is the game volume; a bus level multiplies its ducks
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) throw new Error(`audio.volume: volume must be a number >= 0 (got ${v})`);
    if (name === 'master') { if (v !== undefined) { masterLevel = v; audio.master?.gain.setTargetAtTime(v, ctx.currentTime, 0.02); } return masterLevel; }
    needBus(name, 'volume');
    if (v !== undefined) { level.set(name, v); applyBus(name, 0.02); }
    return level.get(name);
  }
  function duck(name, { to = 0.3, attack = 0.05, release = 0.4 } = {}) { // H-1: undo() lifts it; ducks multiply
    needBus(name, 'duck');
    const list = ducks.get(name); list.push(to); applyBus(name, attack / 3);
    let done = false;
    return () => { if (done) return; done = true; list.splice(list.indexOf(to), 1); applyBus(name, release / 3); };
  }
  function play(buffer, { gain = 1, rate = 1, pan = 0, at = null, when = 0, loop = false, offset = 0, bus = 'sfx' } = {}) {
    needBus(bus, 'play');
    if (!buffer || !ctx || ctx.state !== 'running') return null;
    let g = gain, p = pan;
    if (at) {
      const x = Array.isArray(at) ? at[0] : at.x, z = Array.isArray(at) ? at[2] : at.z;
      if (listener && dist(x, z) > pos.cull) return null; // H-2: beyond cull
      g *= distanceGain(x, 0, z);
      if (pos.pan && listener) p += panOf(x, z) * pos.pan;
    }
    const src = ctx.createBufferSource(), gn = ctx.createGain();
    src.buffer = buffer; src.loop = loop; src.playbackRate.value = rate; gn.gain.value = g;
    src.connect(gn);
    let pn = null;
    if (p !== 0 && ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, p)); gn.connect(pn); pn.connect(busNode.get(bus)); }
    else gn.connect(busNode.get(bus));
    src.onended = () => { src.disconnect(); gn.disconnect(); pn?.disconnect(); };
    src.start(ctx.currentTime + when, offset);
    return { source: src, gain: gn, stop(t = 0) { try { src.stop(ctx.currentTime + t); } catch { /* stopping a stopped source throws; nothing to do */ } } };
  }
  function voice({ bus = 'sfx', gain = 1, follow = null } = {}) { // H-2: connect sources to voice.input
    needBus(bus, 'voice');
    if (!ctx || ctx.state === 'closed') return null; // a suspended context (an interruption, a hidden tab) still takes nodes
    const input = ctx.createGain(), place = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    input.gain.value = gain; input.connect(place);
    if (pn) { place.connect(pn); pn.connect(busNode.get(bus)); } else place.connect(busNode.get(bus));
    const v = { input, follow, audible: true, stopped: false, place, pn,
      stop() {
        if (v.stopped) return; v.stopped = true;
        input.disconnect(); place.disconnect(); pn?.disconnect();
        const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
      } };
    voices.push(v); placeVoice(v, 0);
    return v;
  }
  function placeVoice(v, tc) { // tc 0: set at once (a new voice); else glide (frame)
    const f = v.follow; if (!f || !listener) return;
    const p = f.position ?? f, d = dist(p.x, p.z);
    v.audible = d <= pos.cull;
    const g = v.audible ? distanceGain(p.x, 0, p.z) : 0, t = ctx.currentTime;
    if (tc) v.place.gain.setTargetAtTime(g, t, tc); else v.place.gain.value = g;
    if (v.pn && pos.pan) { const pan = Math.max(-1, Math.min(1, panOf(p.x, p.z) * pos.pan)); if (tc) v.pn.pan.setTargetAtTime(pan, t, tc); else v.pn.pan.value = pan; }
  }
  function frame() { // H-2: once per rendered frame (the pipeline calls it); allocates nothing (R-8)
    if (disposed || !ctx) return;
    for (let i = 0; i < voices.length; i++) placeVoice(voices[i], 0.05);
  }
  function load(url) {
    const have = clips.get(url); if (have) return have;
    let bytes;
    try {
      if (typeof fetchFn !== 'function') throw new Error('audio: no fetch in this page');
      bytes = Promise.resolve(fetchFn(url)).then(r => { if (!r.ok) throw new Error(`audio: load '${short(url)}' failed (${r.status})`); return r.arrayBuffer(); });
    } catch (err) { bytes = Promise.reject(err); }
    const p = Promise.all([bytes, ready])
      .then(([ab, c]) => Promise.resolve(c.decodeAudioData(ab)).catch(err => { throw new Error(`audio: decode '${short(url)}' failed: ${err?.message ?? err}`); }))
      .catch(err => { if (clips.get(url) === p) clips.delete(url); throw err; }); // a failed load may be tried again
    clips.set(url, p); return p;
  }
  function mute(on) {
    muted = !!on;
    if (muteGain) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; disarm();
    doc.removeEventListener('visibilitychange', onVisibility); win?.removeEventListener?.('pageshow', back);
    for (let i = voices.length - 1; i >= 0; i--) voices[i].stop();
    unlockFns.length = 0; gestureFns.length = 0; listener = null;
    if (ctx) {
      ctx.onstatechange = null;
      const failedClose = err => warn('close', 'audio: close failed', err);
      try { Promise.resolve(ctx.close()).catch(failedClose); } catch (err) { failedClose(err); }
    }
  }
  const remover = (list, fn) => () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  const audio = {
    ctx: null, master: null,
    get unlocked() { return !!ctx && ctx.state === 'running'; },
    get muted() { return muted; },
    onUnlock(fn) {
      if (typeof fn !== 'function') throw new Error('audio.onUnlock: function required');
      if (everUnlocked) { call(fn); return () => {}; }
      unlockFns.push(fn); return remover(unlockFns, fn);
    },
    onGesture(fn) { if (typeof fn !== 'function') throw new Error('audio.onGesture: function required'); gestureFns.push(fn); return remover(gestureFns, fn); },
    bus(name) { needBus(name, 'bus'); return busNode.get(name) ?? null; },
    volume: setVolume, duck,
    load, play, voice, frame, mute, distanceGain, dispose,
    listen(obj) { listener = obj ?? null; },
  };
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener?.('pageshow', back);
  arm();
  return audio;
}
