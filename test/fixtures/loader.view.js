// Browser entry for the loader fixture: the stage view half's `built` holds the load's settle on a real-time promise
// (window.waitMs, default 300 ms); window.waits counts the resolved waits. The stick drives throttle.
import { boot, defineView, bindStick } from '../../src/index.view.js';
import loader from './loader.js';

window.waits = 0;
const view = defineView({
  scenes: {
    stage: {
      built(engine, v) { v.wait(new Promise(r => setTimeout(() => { window.waits++; r(); }, window.waitMs ?? 300))); },
    },
  },
});

boot(loader, view, { devices: [e => bindStick(e, { root: document.body, y: ['throttle', 1] })] });
