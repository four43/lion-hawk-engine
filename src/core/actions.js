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
  const buttons = names.filter(n => !isAxis[n]), owed = Object.fromEntries(buttons.map(n => [n, 0]));
  // each source keeps every key preset (stable shape) and counts its own rising edges per button since the last apply() (#13, #41)
  const sources = [], once = {}, held = {};
  const fresh = name => ({ name, values: Object.fromEntries(names.map(n => [n, isAxis[n] ? 0 : false])), rises: Object.fromEntries(buttons.map(n => [n, 0])) });
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
      if (!src) sources.push(src = fresh(source));
      check(p);
      for (const k in p) { if (!isAxis[k] && p[k] && !src.values[k]) src.rises[k]++; src.values[k] = p[k]; }
    },
    clearDevice(source) { for (let i = 0; i < sources.length; i++) if (sources[i].name === source) { sources.splice(i, 1); return; } },
    set: p => { Object.assign(once, check(p)); },
    hold: p => { Object.assign(held, check(p)); },
    release(...ns) { if (!ns.length) clear(held); else for (const n of ns) delete held[n]; },
    // buttons: a hold/set wins and clears owed taps; else every rising edge since the last apply is owed as a press, spread
    // over successive applies (pressed, released, pressed ...; capped at 3) (#41)
    apply() {
      for (let i = 0; i < names.length; i++) {
        const n = names[i]; let v;
        if (n in held) { v = held[n]; owed[n] = 0; }
        else if (n in once) { v = once[n]; owed[n] = 0; }
        else if (isAxis[n]) v = merged(n);
        else {
          let o = owed[n]; for (let j = 0; j < sources.length; j++) o += sources[j].rises[n];
          if (o > 3) o = 3;
          if (o > 0) { if (snapshot[n].down) v = false; else { v = true; o--; } } else v = merged(n);
          owed[n] = o;
        }
        if (isAxis[n]) snapshot[n] = typeof v === 'number' && v === v ? Math.max(-1, Math.min(1, v)) : 0;
        else { const b = snapshot[n], d = !!v; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; }
      }
      for (let j = 0; j < sources.length; j++) { const r = sources[j].rises; for (let i = 0; i < buttons.length; i++) r[buttons[i]] = 0; }
      clear(once); return snapshot;
    },
    values: () => Object.fromEntries(names.map(n => [n, isAxis[n] ? snapshot[n] : snapshot[n].down])),
  };
}
