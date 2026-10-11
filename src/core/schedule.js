// R-6: the step runs named stages in a fixed order; systems inside a stage order themselves with before/after
// (the Threlte model). Unknown references are ignored so a game can name a kit's system that is not loaded.
export const STEP_STAGES = Object.freeze(['input.apply', 'pre', 'physics.world', 'post', 'events.flush']);

export function createSchedule(stages) {
  const byStage = new Map(stages.map(s => [s, []])), byName = new Map(), sorted = new Map();
  let n = 0;
  function sort(stage) {
    const list = byStage.get(stage), names = new Set(list.map(e => e.name)), deps = new Map(list.map(e => [e.name, new Set()]));
    for (const e of list) {
      for (const a of e.after) if (names.has(a)) deps.get(e.name).add(a);
      for (const b of e.before) if (names.has(b)) deps.get(b).add(e.name);
    }
    // Build reverse dependency map: who depends on each item
    const dependents = new Map(list.map(e => [e.name, []]));
    for (const [name, depSet] of deps) for (const d of depSet) dependents.get(d).push(name);
    const out = [], done = new Set();
    while (out.length < list.length) {
      let next = null, minDepI = Infinity;
      for (const e of list) {
        if (!done.has(e.name) && [...deps.get(e.name)].every(d => done.has(d))) {
          // Tiebreaker: pick item that is depended on by earliest remaining item
          const depIs = dependents.get(e.name).filter(d => !done.has(d)).map(d => list.find(x => x.name === d).i);
          const minI = depIs.length > 0 ? Math.min(...depIs) : e.i;
          if (minI < minDepI) { next = e; minDepI = minI; }
        }
      }
      if (!next) throw new Error(`schedule: cycle in '${stage}': ${list.filter(e => !done.has(e.name)).map(e => e.name).join(', ')}`);
      done.add(next.name); out.push(next);
    }
    return out;
  }
  const entries = stage => { if (!sorted.has(stage)) sorted.set(stage, sort(stage)); return sorted.get(stage); };
  const api = {
    add(name, fn, { stage, before = [], after = [] } = {}) {
      if (!byStage.has(stage)) throw new Error(`schedule: unknown stage '${stage}' for '${name}'`);
      if (byName.has(name)) throw new Error(`schedule: duplicate system '${name}'`);
      const e = { name, fn, stage, before: [...before], after: [...after], i: n++ };
      byName.set(name, e); byStage.get(stage).push(e); sorted.delete(stage);
      return () => api.remove(name);
    },
    remove(name) {
      const e = byName.get(name); if (!e) return;
      byName.delete(name); const list = byStage.get(e.stage); list.splice(list.indexOf(e), 1); sorted.delete(e.stage);
    },
    order: stage => entries(stage).map(e => e.name),
    run(stage, ...args) { const list = entries(stage); for (let i = 0; i < list.length; i++) list[i].fn(...args); },
    describe: () => Object.fromEntries([...byStage.keys()].map(s => [s, api.order(s)])),
  };
  return api;
}
