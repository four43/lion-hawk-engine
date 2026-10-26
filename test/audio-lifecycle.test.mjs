import test from 'node:test';
import assert from 'node:assert/strict';
import { audioPage, flush } from './helpers/fakeAudio.mjs';

test('3g: a hidden tab suspends the running context; coming back resumes it (#67, D-1)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.setVisibility('hidden'); await flush();
  assert.equal(c.suspends, 1); assert.equal(c.state, 'suspended'); assert.equal(s.audio.unlocked, false);
  s.setVisibility('visible'); await flush();
  assert.equal(c.resumes, 2); assert.equal(c.state, 'running');
});
test('3g: back on the page with a refused resume, the next gesture resumes it; onUnlock does not fire again (#67)', async () => {
  const s = audioPage(), unl = []; s.audio.onUnlock(() => unl.push(1)); s.fire(); await flush(); const c = s.fa.made[0];
  s.setVisibility('hidden'); await flush();
  s.fa.AudioContext.refuse = true; s.setVisibility('visible'); await flush();
  assert.equal(c.state, 'suspended');
  s.fa.AudioContext.refuse = false; s.fire('click'); await flush();
  assert.equal(c.state, 'running'); assert.deepEqual(unl, [1]);
});
test('3g: pageshow (back-forward cache) resumes a stopped context (#67)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.fa.AudioContext.refuse = true; c.to('suspended'); await flush();
  s.fa.AudioContext.refuse = false; s.window.dispatchEvent(new s.window.Event('pageshow')); await flush();
  assert.equal(c.state, 'running'); assert.equal(c.resumes, 2);
});
test('3g: an interruption while visible (iOS "interrupted") re-arms the gesture listeners (#67, D-1)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  c.to('interrupted'); await flush();
  assert.equal(c.resumes, 1);
  s.fire('touchend'); await flush();
  assert.equal(c.resumes, 2); assert.equal(c.state, 'running');
  s.fire('touchend'); await flush(); assert.equal(c.resumes, 2); // listeners gone again
});
test('3g: dispose removes every listener and closes the context; it is idempotent (#67)', async () => {
  const s = audioPage(); s.fire(); await flush(); const c = s.fa.made[0];
  s.audio.dispose(); await flush(); assert.equal(c.state, 'closed');
  s.setVisibility('visible'); s.window.dispatchEvent(new s.window.Event('pageshow')); await flush(); assert.equal(c.resumes, 1);
  s.audio.dispose();
  const t = audioPage(); t.audio.dispose(); t.fire(); await flush(); assert.equal(t.fa.made.length, 0);
});
