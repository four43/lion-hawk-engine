// Gamepad device: polled axes (per-axis dead zone) and buttons -> named actions in a per-source layer.
export function bindGamepad(engine, map, { getGamepads, source = 'pad' } = {}) {
  const get = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? []);
  const dz = map.deadZone ?? 0.15;
  const axisMap = Object.keys(map.axes ?? {}).map(i => ({ i: +i, name: map.axes[i][0], sign: map.axes[i][1], curve: map.axes[i][2] }));
  // one entry per binding; a list of bindings (first element not a string) is flattened here (#16)
  const btnMap = [], bind = (i, b) => btnMap.push(Array.isArray(b) ? { i, name: b[0], sign: b[1], axis: true } : { i, name: b, axis: false });
  for (const k of Object.keys(map.buttons ?? {})) { const b = map.buttons[k]; if (Array.isArray(b) && !b.length) throw new Error(`bindGamepad: button ${k} has an empty binding list`); if (Array.isArray(b) && typeof b[0] !== 'string') for (const x of b) bind(+k, x); else bind(+k, b); }
  const out = {};
  for (const a of axisMap) out[a.name] = 0;
  for (const b of btnMap) out[b.name] = b.axis ? 0 : false;
  const best = (cur, v) => (Math.abs(v) > Math.abs(cur) ? v : cur);

  function update() {
    const pads = get(); let any = false;
    for (const k in out) out[k] = typeof out[k] === 'boolean' ? false : 0;
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p]; if (!pad) continue; any = true;
      for (let i = 0; i < axisMap.length; i++) {
        const m = axisMap[i], raw = pad.axes[m.i] ?? 0, mag = Math.abs(raw);
        let v = mag <= dz ? 0 : Math.sign(raw) * (mag - dz) / (1 - dz);
        if (m.curve && v !== 0) v = m.curve(v); // not at rest: a curve with an offset must not move a centred stick
        out[m.name] = best(out[m.name], v * m.sign);
      }
      for (let i = 0; i < btnMap.length; i++) {
        const m = btnMap[i], bt = pad.buttons[m.i]; if (!bt) continue;
        if (m.axis) out[m.name] = best(out[m.name], bt.value * m.sign);
        else if (bt.pressed) out[m.name] = true;
      }
    }
    if (any) engine.input.device(out, source); else engine.input.clearDevice(source);
  }
  const dispose = () => engine.input.clearDevice(source);
  return { update, dispose };
}
