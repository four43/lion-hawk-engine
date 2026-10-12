// I-1, I-4, I-6: games declare named actions; devices, tests and the network write layered values; once per step
// apply() turns them into one snapshot that systems read. Axes are numbers in [-1, 1]; buttons carry edges.
// axis({ pair }) pairs two axes (#8): they merge per source as one vector (by length), so a stick and keys never mix halves.
export const axis = ({ pair } = {}) => Object.freeze(pair === undefined ? { kind: 'axis' } : { kind: 'axis', pair });
export const button = () => Object.freeze({ kind: 'button' });
export function actions(map) {
  for (const [k, v] of Object.entries(map)) if (v?.kind !== 'axis' && v?.kind !== 'button') throw new Error(`actions: '${k}' must be axis() or button()`);
  const paired = {};
  for (const [k, v] of Object.entries(map)) {
    if (v.pair === undefined) continue; const p = v.pair;
    if (!Object.hasOwn(map, p)) throw new Error(`actions: '${k}' pairs with unknown action '${p}'`);
    if (map[p].kind !== 'axis' || p === k) throw new Error(`actions: '${k}' pairs with '${p}', which must be an axis`);
    if (map[p].pair !== undefined) throw new Error(`actions: declare the pair '${k}'/'${p}' once`);
    for (const n of [k, p]) { if (paired[n]) throw new Error(`actions: '${n}' is in two pairs`); paired[n] = true; }
  }
  return Object.freeze({ ...map });
}

export function createInput(schema) {
  const names = Object.keys(schema), isAxis = Object.fromEntries(names.map(n => [n, schema[n].kind === 'axis']));
  const snapshot = Object.fromEntries(names.map(n => [n, isAxis[n] ? 0 : { down: false, pressed: false, released: false }]));
  const buttons = names.filter(n => !isAxis[n]), owed = Object.fromEntries(buttons.map(n => [n, 0]));
  // each source keeps every key preset (stable shape) and counts its own rising edges per button since the last apply() (#13, #41)
  const sources = [], once = {}, held = {};
  // owes[n]: this source fed taps into owed[n] that have not all been shown yet (so clearDevice can drop them)
  const fresh = name => ({ name, values: Object.fromEntries(names.map(n => [n, isAxis[n] ? 0 : false])), rises: Object.fromEntries(buttons.map(n => [n, 0])), owes: Object.fromEntries(buttons.map(n => [n, false])) });
  const check = p => { for (const k in p) if (!(k in isAxis)) throw new Error(`input: unknown action '${k}'`); return p; };
  const clear = o => { for (const k in o) delete o[k]; };
  const mate = {}; for (const n of names) if (schema[n].pair !== undefined) { mate[n] = schema[n].pair; mate[schema[n].pair] = n; } // #8: built once
  const num = v => typeof v === 'number' && v === v ? v : 0;
  // axis: largest |value| across sources, ties to the first registered; a paired axis takes the source whose pair vector is
  // longest (ties to the first), so both halves come from one source (#8); button: OR. Allocation-free.
  const merged = n => {
    let best, any = false; const m = mate[n];
    if (m !== undefined) {
      let len = -1;
      for (let i = 0; i < sources.length; i++) { const vs = sources[i].values, l = Math.hypot(num(vs[n]), num(vs[m])); if (l > len) { len = l; best = num(vs[n]); } }
      return len < 0 ? undefined : best;
    }
    for (let i = 0; i < sources.length; i++) {
      const v = sources[i].values[n];
      if (isAxis[n]) { const x = num(v); if (!any || Math.abs(x) > Math.abs(best)) best = x; any = true; }
      else if (v) return true;
    }
    return isAxis[n] ? (any ? best : undefined) : false;
  };
  // is button n down in any source other than src?
  const downElsewhere = (n, src) => { for (let i = 0; i < sources.length; i++) if (sources[i] !== src && sources[i].values[n]) return true; return false; };
  const kinds = Object.freeze(Object.fromEntries(names.map(n => [n, schema[n].kind])));
  return {
    snapshot, kinds,
    // per-source device layers, in first-registration order; merged in apply() as one layer under set/hold
    device: (p, source = 'default') => {
      let src = null; for (let i = 0; i < sources.length; i++) if (sources[i].name === source) { src = sources[i]; break; }
      if (!src) sources.push(src = fresh(source));
      check(p);
      // a rise is an owed tap only when it lifts the merged level: pressing a button another source already holds adds no edge
      for (const k in p) { if (!isAxis[k] && p[k] && !src.values[k] && !downElsewhere(k, src)) { src.rises[k]++; src.owes[k] = true; } src.values[k] = p[k]; }
    },
    // drops a source; a button whose last contributing source this was also drops its owed taps
    clearDevice(source) {
      let src = null; for (let i = 0; i < sources.length; i++) if (sources[i].name === source) { src = sources[i]; sources.splice(i, 1); break; }
      if (!src) return;
      for (let i = 0; i < buttons.length; i++) {
        const n = buttons[i]; if (!src.owes[n] && !src.values[n]) continue;
        let other = false; for (let j = 0; j < sources.length; j++) if (sources[j].owes[n] || sources[j].values[n]) { other = true; break; }
        if (!other) owed[n] = 0;
      }
    },
    set: p => { Object.assign(once, check(p)); },
    hold: p => { Object.assign(held, check(p)); },
    release(...ns) { if (!ns.length) clear(held); else for (const n of ns) delete held[n]; },
    // buttons: a hold/set wins and clears owed taps; else every rising edge since the last apply is owed as a press, spread
    // over successive applies (pressed, released, pressed ...; capped at 3) (#41)
    apply() {
      for (let i = 0; i < names.length; i++) {
        const n = names[i]; let v;
        if (n in held || n in once) { v = n in held ? held[n] : once[n]; if (!isAxis[n]) { owed[n] = 0; for (let j = 0; j < sources.length; j++) sources[j].owes[n] = false; } }
        else if (isAxis[n]) v = merged(n);
        else {
          let o = owed[n]; for (let j = 0; j < sources.length; j++) o += sources[j].rises[n];
          if (o > 3) o = 3;
          if (o > 0) { if (snapshot[n].down) v = false; else { v = true; o--; } } else v = merged(n);
          owed[n] = o;
          if (o === 0) for (let j = 0; j < sources.length; j++) sources[j].owes[n] = false;
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
