// Browser entry for the countdown example: view halves (race draws <div id="x">), stick on throttle, keyboard w.
import { boot, defineView, bindKeyboard, bindStick } from '../../src/index.view.js';
import countdown from './countdown.js';

const view = defineView({
  scenes: {
    race: {
      enter(engine, v) { const d = v.doc.createElement('div'); d.id = 'x'; v.root.appendChild(d); v.x = d; },
      frame(engine, alpha, v) { if (v.x) v.x.textContent = String(Math.round(engine.scene.state.x ?? 0)); },
      exit(engine, v) { v.x?.remove(); v.x = null; },
    },
  },
});

boot(countdown, view, {
  devices: [
    e => bindKeyboard(e, { w: ['throttle', 1] }),
    e => bindStick(e, { root: document.body, y: ['throttle', 1] }),
  ],
});
