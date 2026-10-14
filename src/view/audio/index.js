// STUB (3e): createAudio with the overview §4.9 audio surface, silent. 3g replaces this file wholesale (#67).
export function createAudio({ doc = null, flags = {} } = {}) {
  return { ctx: null, master: null, unlocked: false, onUnlock() { return () => {}; }, load: async () => null, play: () => null, mute() {}, dispose() {} };
}
