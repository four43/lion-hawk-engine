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
  const device = {}, once = {}, held = {};
  const check = p => { for (const k in p) if (!(k in isAxis)) throw new Error(`input: unknown action '${k}'`); return p; };
  const clear = o => { for (const k in o) delete o[k]; };
  return {
    snapshot,
    device: p => { Object.assign(device, check(p)); },
    set: p => { Object.assign(once, check(p)); },
    hold: p => { Object.assign(held, check(p)); },
    release(...ns) { if (!ns.length) clear(held); else for (const n of ns) delete held[n]; },
    apply() {
      for (let i = 0; i < names.length; i++) {
        const n = names[i], v = n in held ? held[n] : n in once ? once[n] : device[n];
        if (isAxis[n]) snapshot[n] = typeof v === 'number' && v === v ? Math.max(-1, Math.min(1, v)) : 0;
        else { const b = snapshot[n], d = !!v; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; }
      }
      clear(once); return snapshot;
    },
    values: () => Object.fromEntries(names.map(n => [n, isAxis[n] ? snapshot[n] : snapshot[n].down])),
  };
}
