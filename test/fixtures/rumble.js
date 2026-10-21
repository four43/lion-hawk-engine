// A game with a pausing overlay for the real-browser haptics and pad bench checks (plan 2026-10-21-local-players-4).
import { defineGame } from '../../src/index.sim.js';

export default defineGame({ id: 'rumble', start: 'field', scenes: { field: {}, pause: { pauses: true } } });
