// [D-12] the engine's debug panels. perf ([D-3]): frame ms is the time between its updates over the frames the loop ran
// in it, so it needs no per-frame work. pads: the pad bench ([D-7]) in a window, polled every frame while open.
import { openPadBench } from '../bench/pads.js';

export function perfPanel(engine) {
  const s = engine.loop.stats;
  let frames0 = 0, ms = null, info = null;
  return {
    id: 'perf', title: 'Perf', width: 220, height: 210,
    mount(el, ui) {
      frames0 = s.frames;
      ui.value('frame ms', () => ms, { digits: 1 });
      ui.value('steps', () => s.lastSteps, { digits: 0 });
      ui.value('clamped', () => s.clamped, { digits: 0 });
      for (const [label, k] of [['draw calls', 'calls'], ['triangles', 'triangles'], ['programs', 'programs'], ['geometries', 'geometries'], ['textures', 'textures']]) ui.value(label, () => info?.[k], { digits: 0 });
    },
    update(view, dt) {
      const f = s.frames; ms = f > frames0 ? (dt * 1000) / (f - frames0) : null; frames0 = f;
      info = view.gfx?.info?.() ?? null;
    },
  };
}

// bench: { view, haptics }, the read-only seats view and the haptics stops boot hands the bench
export function padsPanel(bench) {
  let b = null;
  return {
    id: 'pads', title: 'Pads', width: 460, height: 560, rate: 'frame',
    mount(el) { b = openPadBench(bench.view, { doc: el.ownerDocument, haptics: bench.haptics, root: el }); },
    update() { b.update(); },
    unmount() { b?.dispose(); b = null; },
  };
}
