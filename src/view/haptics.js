// src/view/haptics.js
// [C-14] (spec §5.5): the haptics lifecycle. Games drive lp.pad.vibrationActuator themselves (after checking `effects`);
// the engine only stops rumble it would otherwise leave running. From playtests
// (2026-10-19): Chromium queues each playEffect on a task but runs reset() at once, so a reset alone can be overtaken by an
// effect sent a frame earlier. A stop is therefore a zero effect (queued behind any late one) plus reset(),
// sent at once and on each of the next frames, STOP_FRAMES rounds in all. A pad this page sees for the first time gets one
// full stop round, clearing what the previous page left playing.
// A driver device after the seats (it reads this frame's lp.pads). It never writes seats, input or the sim.
export const STOP_FRAMES = 20;
const ZERO = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
// A pad with trigger motors gets a zero trigger-rumble: a dual-rumble says nothing about the triggers, and a trigger effect a
// game sent a frame earlier must not outlive the stop (a brake or traction-aid buzz).
const ZERO_TRIGGERS = Object.freeze({ ...ZERO, leftTrigger: 0, rightTrigger: 0 });
const quiet = () => {}; // a stop's promises resolve 'preempted' or reject on a pad that went away: nothing to handle

// the zero effect for an actuator, as [type, params]: the pad bench stops with the same one
export const zeroEffect = a => Array.isArray(a?.effects) && a.effects.includes('trigger-rumble') ? ['trigger-rumble', ZERO_TRIGGERS] : ['dual-rumble', ZERO];

const zero = a => {
  if (typeof a?.playEffect !== 'function') return; // no actuator (Firefox, most of Safari): rumble is never an error
  try { a.playEffect(...zeroEffect(a))?.catch?.(quiet); } catch { /* an actuator that throws is skipped */ }
  try { a.reset?.()?.catch?.(quiet); } catch { /* as above */ }
};

export function createHaptics(engine, { seats, target = globalThis, doc, frames = STOP_FRAMES } = {}) {
  if (!seats) throw new Error('haptics: needs the seats');
  if (!Number.isInteger(frames) || frames < 1) throw new Error('haptics: frames must be a positive integer');
  doc ??= target.document ?? globalThis.document;
  const scenes = engine.game.scenes, listeners = [];
  let left = 0, paused = false;
  // hide, blur and pause are page-wide: every connected pad this page knows, seated or not (the ?debug=pads bench
  // rumbles unpaired ones). lp.pads holds live pads only; forEachUnpaired allocates no list.
  const unpairedZero = d => zero(seats.gamepad(d)?.vibrationActuator);
  const stopPads = () => {
    const list = seats.list;
    for (let k = 0; k < list.length; k++) { const ps = list[k].pads; for (let i = 0; i < ps.length; i++) zero(ps[i]?.vibrationActuator); }
    seats.forEachUnpaired(unpairedZero);
  };
  const stop = reason => {
    stopPads(); left = frames - 1;
    const e = { type: 'haptics.stop', reason, frames };
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](e); } catch { /* a listener (the bench's log) must not stop a stop */ } }
  };
  // an open overlay whose scene pauses; engine.scene.overlays is a live array, so this allocates nothing
  const pausing = () => { const o = engine.scene.overlays; for (let i = 0; i < o.length; i++) if (scenes[o[i]]?.pauses) return true; return false; };
  const onBlur = () => stop('blur'), onHide = () => stop('pagehide');
  const onVis = () => { if (doc?.visibilityState === 'hidden') stop('hidden'); };
  const offSeen = seats.on(e => { if (e.type === 'seat.seen') zero(seats.gamepad(e.device)?.vibrationActuator); });
  target.addEventListener?.('blur', onBlur); target.addEventListener?.('pagehide', onHide);
  doc?.addEventListener?.('visibilitychange', onVis);
  return {
    on(fn) {
      if (typeof fn !== 'function') throw new Error('haptics.on: needs a function');
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    get stopping() { return left; },
    get paused() { return pausing(); },
    stop,
    // A game's own rumble in the STOP_FRAMES after a pausing overlay opens is cancelled by design (a pause menu's rumble loses its first ~1/3 s).
    // the frame a pausing overlay appears is a trigger (its first round); otherwise run the next round while any are left.
    // The driver does not tick while the page is hidden, so a hide's remaining rounds run once it is back.
    update() {
      const p = pausing();
      if (p && !paused) { paused = true; stop('pause'); return; }
      paused = p;
      if (left > 0) { left--; stopPads(); }
    },
    dispose() {
      target.removeEventListener?.('blur', onBlur); target.removeEventListener?.('pagehide', onHide);
      doc?.removeEventListener?.('visibilitychange', onVis);
      offSeen(); listeners.length = 0; left = 0;
    },
  };
}
