// Audio service (#67, overview §4.9): one AudioContext per page, made and resumed inside a user gesture (iOS starts audio only
// there), suspended while the tab is hidden and resumed on return; after an interruption (a call, Siri) the next gesture
// resumes it. Games connect their synths to `master`: master -> mute gain -> compressor limiter (Tractor's R-8 settings) ->
// speakers. load(url) fetches at once and decodes once a context exists (Tractor's B-8: never mid-drive); play(buffer, opts)
// plays a decoded buffer, optionally placed in the world (`at`, against the object given to listen(): Pig Pens' distance
// volume). ctx and master stay null until the first gesture. View-only: sim code never imports this.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']; // iOS activates on pointerup/touchend/click, not a touch pointerdown
const LIMITER = Object.freeze({ threshold: -14, knee: 24, ratio: 4, attack: 0.005, release: 0.2 });
const POSITIONAL = Object.freeze({ ref: 18, near: 10, min: 0.05, max: 0.6, pan: 0 });
const short = url => { const s = String(url); return s.length > 48 ? `${s.slice(0, 45)}...` : s; };

export function createAudio({ doc = globalThis.document, flags = {}, AudioContext: AC, fetch: fetchFn, volume = 0.55, limiter = {}, positional = {} } = {}) {
  if (!doc?.addEventListener) throw new Error('createAudio: doc required');
  const win = doc.defaultView ?? globalThis.window;
  AC ??= win?.AudioContext ?? win?.webkitAudioContext; // false: no Web Audio (tests)
  fetchFn ??= win?.fetch ? win.fetch.bind(win) : globalThis.fetch?.bind(globalThis);
  const lim = { ...LIMITER, ...limiter }, pos = { ...POSITIONAL, ...positional };
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
      m.gain.value = volume; mg.gain.value = muted ? 0 : 1;
      for (const k of Object.keys(LIMITER)) comp[k].value = lim[k];
      m.connect(mg); mg.connect(comp); comp.connect(c.destination);
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
    for (const fn of gestureFns.slice()) call(fn); // inside the gesture: speech priming and the like (Tractor's voice.prime)
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
    const lp = listener.position, d = Math.hypot(x - lp.x, z - lp.z);
    return Math.max(pos.min, Math.min(pos.max, pos.ref / (d + pos.near)));
  }
  function panOf(x, z) { // -1 left .. 1 right of the listener (its world x axis)
    const lp = listener.position, e = listener.matrixWorld.elements, dx = x - lp.x, dz = z - lp.z, d = Math.hypot(dx, dz);
    return d < 1e-6 ? 0 : (dx * e[0] + dz * e[2]) / d;
  }
  function play(buffer, { gain = 1, rate = 1, pan = 0, at = null, when = 0, loop = false, offset = 0 } = {}) {
    if (!buffer || !ctx || ctx.state !== 'running') return null;
    let g = gain, p = pan;
    if (at) {
      const x = Array.isArray(at) ? at[0] : at.x, z = Array.isArray(at) ? at[2] : at.z;
      g *= distanceGain(x, 0, z);
      if (pos.pan && listener) p += panOf(x, z) * pos.pan;
    }
    const src = ctx.createBufferSource(), gn = ctx.createGain();
    src.buffer = buffer; src.loop = loop; src.playbackRate.value = rate; gn.gain.value = g;
    src.connect(gn);
    let pn = null;
    if (p !== 0 && ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, p)); gn.connect(pn); pn.connect(audio.master); }
    else gn.connect(audio.master);
    src.onended = () => { src.disconnect(); gn.disconnect(); pn?.disconnect(); };
    src.start(ctx.currentTime + when, offset);
    return { source: src, gain: gn, stop(t = 0) { try { src.stop(ctx.currentTime + t); } catch { /* stopping a stopped source throws; nothing to do */ } } };
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
    load, play, mute, distanceGain, dispose,
    listen(obj) { listener = obj ?? null; },
  };
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener?.('pageshow', back);
  arm();
  return audio;
}
