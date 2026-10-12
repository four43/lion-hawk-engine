// I-1, I-4, I-6: games declare named actions; devices, tests and the network write layered values; once per step
// apply() turns them into one snapshot that systems read. Axes are numbers in [-1, 1]; buttons carry edges.
export const axis = () => Object.freeze({ kind: 'axis' });
export const button = () => Object.freeze({ kind: 'button' });
export function actions(map) {
  for (const [k, v] of Object.entries(map)) if (v?.kind !== 'axis' && v?.kind !== 'button') throw new Error(`actions: '${k}' must be axis() or button()`);
  return Object.freeze({ ...map });
}

export function createInput(schema) {
  const names = Object.keys(schema), isAxis = Object.fromEntries(names.map(n => [n, schema[n].kind === 'axis']));
  const snapshot = Object.fromEntries(names.map(n => [n, isAxis[n] ? 0 : { down: false, pressed: false, released: false }]));
  const sources = [], once = {}, held = {}, latch = {}; // latch: buttons any device() call set truthy since the last apply() (#13)
  const check = p => { for (const k in p) if (!(k in isAxis)) throw new Error(`input: unknown action '${k}'`); return p; };
  const clear = o => { for (const k in o) delete o[k]; };
  // axis: largest |value| across sources, ties to the first registered; button: OR. Allocation-free.
  const merged = n => {
    let best, any = false;
    for (let i = 0; i < sources.length; i++) {
      const v = sources[i].values[n];
      if (isAxis[n]) { const x = typeof v === 'number' && v === v ? v : 0; if (!any || Math.abs(x) > Math.abs(best)) best = x; any = true; }
      else if (v) return true;
    }
    return isAxis[n] ? (any ? best : undefined) : false;
  };
  const kinds = Object.freeze(Object.fromEntries(names.map(n => [n, schema[n].kind])));
  return {
    snapshot, kinds,
    // per-source device layers, in first-registration order; merged in apply() as one layer under set/hold
    device: (p, source = 'default') => {
      let src = null; for (let i = 0; i < sources.length; i++) if (sources[i].name === source) { src = sources[i]; break; }
      if (!src) sources.push(src = { name: source, values: {} });
      Object.assign(src.values, check(p));
      for (const k in p) if (!isAxis[k] && p[k]) latch[k] = true;
    },
    clearDevice(source) { for (let i = 0; i < sources.length; i++) if (sources[i].name === source) { sources.splice(i, 1); return; } },
    set: p => { Object.assign(once, check(p)); },
    hold: p => { Object.assign(held, check(p)); },
    release(...ns) { if (!ns.length) clear(held); else for (const n of ns) delete held[n]; },
    apply() {
      for (let i = 0; i < names.length; i++) {
        const n = names[i], v = n in held ? held[n] : n in once ? once[n] : merged(n) || latch[n] === true;
        if (isAxis[n]) snapshot[n] = typeof v === 'number' && v === v ? Math.max(-1, Math.min(1, v)) : 0;
        else { const b = snapshot[n], d = !!v; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; }
      }
      clear(once); clear(latch); return snapshot;
    },
    values: () => Object.fromEntries(names.map(n => [n, isAxis[n] ? snapshot[n] : snapshot[n].down])),
  };
}
