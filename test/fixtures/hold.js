// A one-control game for the real-browser hold test (#56, #83): a ui.hold on wall time.
import { defineGame } from '../../src/index.sim.js';

export default defineGame({ id: 'hold', start: 's', scenes: { s: { ui(u) { u.hold({ id: 'wake', label: 'Wake', seconds: 1, wall: true, action: e => e.emit('woke') }); } } } });
