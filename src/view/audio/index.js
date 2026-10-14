// Audio service (#67, overview §4.9): one AudioContext per page, made and resumed inside a user gesture (iOS starts audio only
// there), suspended while the tab is hidden and resumed on return; after an interruption (a call, Siri) the next gesture
// resumes it. Games connect their synths to `master`: master -> mute gain -> compressor limiter (Tractor's R-8 settings) ->
// speakers. ctx and master stay null until the first gesture. View-only: sim code never imports this.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']; // iOS activates on pointerup/touchend/click, not a touch pointerdown
const LIMITER = Object.freeze({ threshold: -14, knee: 24, ratio: 4, attack: 0.005, release: 0.2 });

export function createAudio({ doc = globalThis.document, flags = {}, AudioContext: AC, volume = 0.55, limiter = {} } = {}) {
  if (!doc?.addEventListener) throw new Error('createAudio: doc required');
  const win = doc.defaultView ?? globalThis.window;
  AC ??= win?.AudioContext ?? win?.webkitAudioContext; // false: no Web Audio (tests)
  const lim = { ...LIMITER, ...limiter };
  const unlockFns = [], gestureFns = [], warned = new Set();
  let ctx = null, muteGain = null, muted = !!flags.mute, everUnlocked = false, armed = false, disposed = false, failed = false;
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
    } catch (err) {
      failed = true; disarm(); warn('make', 'audio: no Web Audio', err);
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
  function mute(on) {
    muted = !!on;
    if (muteGain) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; disarm();
    doc.removeEventListener('visibilitychange', onVisibility); win?.removeEventListener?.('pageshow', back);
    unlockFns.length = 0; gestureFns.length = 0;
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
    mute, dispose,
  };
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener?.('pageshow', back);
  arm();
  return audio;
}
